/* sw.js —— EX 模拟器本地缓存（Service Worker）
 *
 * 目的：把 本体文件/ 下的 JS / CSS / 贴图 / 字体 / 音效等全部资源缓存在浏览器
 * 本机 Cache Storage 里。首次访问时下载并落盘，之后每次打开都直接读本地，
 * 不再从云端重复下载（体积约 8MB ⇒ 第二次起几乎零网络）。
 *
 * 策略：
 *  - 页面（navigate）：网络优先（HTML 只有几十 KB），失败时回退本地缓存（可离线打开）；
 *    同时对比新旧 HTML 内容，一旦发现「代码更新了」，就清掉资源缓存，本页重新拉新版。
 *  - 静态资源（js/css/贴图/字体/音效）：缓存优先，未命中才走网络，命中后立即返回；
 *    超过 4 小时就在后台条件刷新一次（不阻塞打开）。
 *  - Range 请求（音效/视频拖动进度）：用本地完整副本切片返回 206。
 *  - 只处理同源 GET。
 *
 * 注意：Service Worker 只在 https:// 或 http://localhost 下可用（file:// 打开会自动跳过，
 * 不影响直接双击 HTML，只是没有本地缓存加速）。
 */
'use strict';

const CACHE_PREFIX = 'ex-sim-';
const ASSET_CACHE = CACHE_PREFIX + 'assets-v1';
const PAGE_CACHE  = CACHE_PREFIX + 'pages-v1';

// 资源缓存的有效期：命中后若缓存已超过这个时长，就在后台发一次条件请求（304 极省流量），
// 保证即使只改了 JS/CSS、HTML 没变，用户也能在下次打开时自动拿到新版。
// 与线上 Cloudflare 的 max-age=14400（4 小时）对齐。
const REVALIDATE_AFTER_MS = 4 * 60 * 60 * 1000;
const _revalidating = new Set();

// 需要长期缓存的静态资源后缀（其余请求不拦截，保持默认网络行为）
const ASSET_RE = /\.(?:js|mjs|css|png|jpg|jpeg|gif|webp|svg|ico|bmp|woff2?|ttf|otf|eot|wav|mp3|ogg|m4a|mp4|webm|json|txt|obj)$/i;
// 代码类资源（JS/CSS）：每次打开都走网络优先，改完代码普通刷新即可生效；
// 贴图/字体/音效等大体积资源仍走缓存优先（否则每次打开重下 8MB）。
const CODE_RE = /\.(?:js|mjs|css)$/i;

self.addEventListener('install', () => {
  // 首次安装立刻生效，让本页马上被接管（这样首次访问下载的资源就能直接进缓存）
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 清掉旧的（其它版本）缓存
    const names = await caches.keys();
    await Promise.all(names.map((n) => {
      if (n.indexOf(CACHE_PREFIX) === 0 && n !== ASSET_CACHE && n !== PAGE_CACHE) return caches.delete(n);
      return null;
    }));
    await self.clients.claim();
  })());
});

// 页面首次加载时若 SW 尚未接管，资源会走普通网络（只进 HTTP 缓存）。
// 页面加载完会把资源地址发过来，这里从 HTTP 缓存补进 SW 缓存（4 小时内不会重复下载），
// 保证「只下载一次，之后全部走本地」。
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'ex-warm' || !Array.isArray(data.urls)) return;
  event.waitUntil(warmCache(data.urls));
});

async function warmCache(urls) {
  const cache = await caches.open(ASSET_CACHE);
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        if (await cache.match(url)) continue;
        const res = await fetch(url, { cache: 'default' });
        if (res && res.ok) await cache.put(url, res.clone());
      } catch (_) {}
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker(), worker(), worker()]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  // 只接管本站资源；健康检查端点不拦
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/__sim_ping__') !== -1) return;
  // Range 请求（音频/视频拖动进度）：命中缓存时用本地副本切片返回 206，避免每次打开重下音效
  if (req.headers.has('range')) {
    if (ASSET_RE.test(url.pathname)) event.respondWith(handleRange(req));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(req));
    return;
  }
  if (CODE_RE.test(url.pathname)) {
    event.respondWith(handleCode(req));
    return;
  }
  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(handleAsset(req));
  }
});

// 页面：网络优先 + 离线回退；HTML 内容变化 ⇒ 资源缓存整体失效（等同版本切换）
async function handleNavigate(req) {
  const pageCache = await caches.open(PAGE_CACHE);
  try {
    const fresh = await fetch(req, { cache: 'no-cache' });
    if (fresh && fresh.ok) {
      const old = await pageCache.match(req, { ignoreSearch: true });
      if (old) {
        let same = true;
        try {
          const [oldText, newText] = await Promise.all([old.clone().text(), fresh.clone().text()]);
          same = oldText === newText;
        } catch (_) { same = false; }
        if (!same) await caches.delete(ASSET_CACHE);   // 代码更新了：下次资源请求重新下载
      }
      pageCache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (err) {
    // 断网 / 服务器不可达：用本地缓存打开
    const hit = await pageCache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

// 静态资源：缓存优先；未命中才联网（reload 绕过 HTTP 缓存的陈旧副本，保证拿到当前版本）
async function handleAsset(req) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(req);
  if (hit) {
    maybeRevalidate(req, cache, hit);
    return hit;
  }

  const res = await fetch(req, { cache: 'reload' });
  if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

// 代码资源（JS/CSS）：网络优先，成功后写入缓存；断网时回退本地副本。
// ★这样改完模块代码普通刷新就能看到效果，不会再被旧的 SW 缓存卡住。
async function handleCode(req) {
  const cache = await caches.open(ASSET_CACHE);
  try {
    const res = await fetch(req, { cache: 'reload' });
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

// 缓存命中后按需后台刷新（不阻塞本次返回，用户始终先拿到本地副本）
function maybeRevalidate(req, cache, hit) {
  const key = req.url;
  if (_revalidating.has(key)) return;
  const dateStr = hit.headers.get('date');
  const age = dateStr ? (Date.now() - Date.parse(dateStr)) : Infinity;
  if (age < REVALIDATE_AFTER_MS) return;
  _revalidating.add(key);
  fetch(req, { cache: 'no-cache' })
    .then((res) => { if (res && res.ok) return cache.put(req, res.clone()); })
    .catch(() => {})
    .then(() => { _revalidating.delete(key); });
}

// Range 请求：用本地完整副本切片返回 206；本地没有就整份拉取并缓存（去掉 Range 头）
async function handleRange(req) {
  const cache = await caches.open(ASSET_CACHE);
  let full = await cache.match(req.url);

  if (!full) {
    const headers = new Headers(req.headers);
    headers.delete('range');
    const plain = new Request(req.url, { method: 'GET', headers, mode: 'same-origin', credentials: 'same-origin' });
    let res;
    try {
      res = await fetch(plain, { cache: 'reload' });
    } catch (err) {
      return new Response(null, { status: 504 });
    }
    if (!res.ok) return res;                     // 文件不存在：原样返回（音效加载器会回退下一种格式）
    cache.put(req.url, res.clone()).catch(() => {});
    full = res.clone();
  }

  const buf = await full.arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = 0, end = total - 1;
  if (m) {
    if (m[1] === '' && m[2] !== '') start = Math.max(0, total - Number(m[2]));   // bytes=-N（末尾 N 字节）
    else { start = Number(m[1] || 0); end = m[2] === '' ? total - 1 : Number(m[2]); }
  }
  if (!total || start >= total) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total } });
  }
  end = Math.min(end, total - 1);
  const body = buf.slice(start, end + 1);
  const headers = new Headers();
  const ct = full.headers.get('content-type');
  if (ct) headers.set('Content-Type', ct);
  headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + total);
  headers.set('Content-Length', String(body.byteLength));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(body, { status: 206, headers });
}
