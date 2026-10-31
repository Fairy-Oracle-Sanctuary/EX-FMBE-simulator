/* 02-script-kernel/04-loom-popup.js · 源 测试版v.6b79.html 第 9076-9943 行 */
'use strict';
// ============================================================================
// 织布机浮动窗（r37d）—— 独立挂在 document.body 上，与材质菜单彻底解耦
// ----------------------------------------------------------------------------
// 历次失败的根因：把织布机硬塞进 .material-menu（每个材质子面板共用同一容器），
// 必然被“铺满 / 折行 / positionMaterialMenu 覆盖定位”反复折磨。
// 现改为独立浮动窗：外壳对齐关键帧浮动窗（深色玻璃 / 蓝描边 / 标题栏拖拽），
// 内部对齐设置面板（左竖列分类栏 + 右单列内容区，一次只显示一个分类）。
// 窗口本体只建一次（壳 + 导航 + 常驻预览区）；内容区每次打开时重建（避免事件监听器累积）。
// ★r37e：①缩放已删（只留拖拽）；②旗帜预览常态化显示（常驻区，不是分类）；③分类栏 = 底色 / 图层 / 操作。
// ============================================================================
let loomWinEl = null, loomApi = null;
// ★r41：面板「实时跟随当前选中旗帜」的同步入口。openLoomWindow 每次开窗时装配，
//   由 selectBlock（选区变化的统一咽喉）调用 —— 见文件下方 loomOnSelectionSync。
let loomSyncHandler = null;
function loomOnSelectionSync() {
  if (!loomSyncHandler) return;
  if (!loomWinEl || loomWinEl.style.display === 'none') return;
  try { loomSyncHandler(); } catch (e) { console.warn('织布机同步失败', e); }
}
const LOOM_CATS = [
  { id: 'base',   label: '底色' },
  { id: 'layers', label: '图层' },
  { id: 'lib',    label: '旗帜库' },   // ★r38：存/取做好的旗帜（localStorage 持久化，跨项目复用，支持分组）
  { id: 'ops',    label: '操作' }
];

// ============================================================================
// ★★r38【旗帜库】数据层 —— 织布机「旗帜库」栏目的本地持久化
// ----------------------------------------------------------------------------
// 用户诉求：做好的旗帜材质可以存进库里、库是本地存储的（跨项目也能用）、库里允许分组。
// 设计取舍：条目只存【紧凑 loomCode】（约 7 字符 = 1 底色 + N 图案层），不存 PNG/base64 ——
//   与 r36 导出契约同口径，体积极小（一面旗帜约 20 字节），几百面也塞得进 localStorage；
//   缩略图每次渲染时用现有渲染管线（loomCodeToRecipe → loomNativeCanvas）现场绘制。
// 结构：{ ver:1, groups:[{id,name,collapsed}], items:[{id,name,groupId,code,ts}] }
//   · groupId === '' ⇒ 未分组（渲染为一个固定的「未分组」伪分组，不可改名/删除）
//   · 任何写操作都整体落盘（try/catch 容错，隐私模式下不可用也不会炸）
// ============================================================================
const LOOM_LIB_KEY = 'ex_flaglib_v1';
function loomLibLoad() {
  try {
    const o = JSON.parse(localStorage.getItem(LOOM_LIB_KEY) || 'null');
    if (o && Array.isArray(o.groups) && Array.isArray(o.items)) {
      o.items = o.items.filter(it => it && typeof it.code === 'string');
      return o;
    }
  } catch (e) { }
  return { ver: 1, groups: [], items: [] };
}
function loomLibSave(d) {
  try { localStorage.setItem(LOOM_LIB_KEY, JSON.stringify(d)); } catch (e) { console.warn('旗帜库保存失败', e); }
}
function loomLibNewId() { return 'fl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// 把紧凑 code 画成库里条目的缩略图（原尺寸 20×40，显示尺寸由 CSS 的 .loom-libthumb 固定）
function loomLibThumb(cv, code) {
  const r = loomCodeToRecipe(code);
  cv.width = LOOM_W; cv.height = LOOM_H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (r) ctx.drawImage(loomNativeCanvas(r.baseDye, r.layers), 0, 0);
}

// 自定义「输入名称」弹窗 —— ★项目硬约束：禁用 window.prompt（阻塞渲染线程、样式丑、不可主题化）
function loomNameModal(title, defVal, onOk) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10050;display:flex;align-items:center;justify-content:center;';
  const isLight = document.body.classList.contains('light-mode');
  const box = document.createElement('div');
  box.style.cssText = 'background:' + (isLight ? '#fff' : '#162136') + ';border:1px solid ' + (isLight ? '#cbd5e1' : '#3b82f6') +
    ';border-radius:16px;padding:18px 20px;max-width:360px;width:88%;box-shadow:0 12px 40px rgba(0,0,0,0.4);';
  box.innerHTML = '<div style="margin-bottom:10px;font-size:13px;font-weight:600;color:' + (isLight ? '#1e293b' : '#e2e8f0') + ';">' + escapeHtml(title) + '</div>';
  const inp = document.createElement('input');
  inp.type = 'text'; inp.id = 'loomNameInput'; inp.value = defVal || ''; inp.maxLength = 24;
  inp.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;font-size:13px;border-radius:8px;outline:none;background:' +
    (isLight ? '#f1f5f9' : 'rgba(10,15,26,0.55)') + ';color:' + (isLight ? '#1f2430' : '#e2e8f0') + ';border:1px solid ' + (isLight ? '#cbd5e1' : 'rgba(148,163,184,0.4)') + ';';
  box.appendChild(inp);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:14px;';
  const okB = document.createElement('button'); okB.className = 'keyframe-window-btn'; okB.id = 'loomNameOk'; okB.textContent = '确定';
  const noB = document.createElement('button'); noB.className = 'keyframe-window-btn'; noB.textContent = '取消';
  row.appendChild(okB); row.appendChild(noB); box.appendChild(row);
  overlay.appendChild(box); document.body.appendChild(overlay);
  const done = (v) => { overlay.remove(); if (typeof v === 'string') onOk(v); };
  okB.onclick = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } done(v); };
  noB.onclick = () => done(null);
  overlay.onclick = (e) => { if (e.target === overlay) done(null); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); okB.click(); } else if (e.key === 'Escape') { e.preventDefault(); done(null); } });
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
}
function loomQ(id) { return loomWinEl ? loomWinEl.querySelector('#' + id) : null; }

function buildLoomWindow() {
  if (loomWinEl) return loomWinEl;
  const win = document.createElement('div');
  win.className = 'loom-window';
  win.id = 'loomWindow';
  win.innerHTML = `
    <div class="loom-head" id="loomHead">
      <div class="loom-head-title"><span class="loom-grip">⠿</span><img class="loom-ico" src="Textures/loom_front.png" alt=""><span>织布机</span></div>
      <button class="loom-close" id="loomCloseBtn" title="关闭">✕</button>
    </div>
    <div class="loom-body">
      <div class="loom-pv">
        <canvas id="bnrPreview" class="bnr-preview" width="320" height="640"></canvas>
      </div>
      <div class="loom-right">
        <div class="loom-nav" id="loomNav"></div>
        <div class="loom-scroll" id="loomScroll"></div>
      </div>
    </div>
    <div class="loom-resize" id="loomResizeHandle"></div>
    <div class="loom-resize-l" id="loomResizeHandleL"></div>`;
  document.body.appendChild(win);
  const nav = win.querySelector('#loomNav');
  LOOM_CATS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'loom-tab';
    b.dataset.cat = c.id;
    b.textContent = c.label;
    // ★r37g：点分类栏播「打字音效」（Sounds/type.wav；沿用教程音效总开关 exTutSfxOn，
    //   可在 设置 → 新手教程 · 引导课 → 教程音效 里关）。用 exTutSfxType 而非 exTutSfx：
    //   前者正是打字机音、音量更轻（0.32），符合用户「打字音效」的诉求。
    b.addEventListener('click', () => { try { exTutSfxType(); } catch (e2) { } loomSetCat(c.id); });
    nav.appendChild(b);
  });
  win.querySelector('#loomCloseBtn').addEventListener('click', loomClose);
  // ★r37h-fix：内容区滚动 / 视口尺寸变化时，已打开的弹窗也要跟着锚点走（否则会脱节留在原地）
  win.querySelector('#loomScroll').addEventListener('scroll', loomRepositionPopup, { passive: true });
  window.addEventListener('resize', loomRepositionPopup);
  loomMakeDraggable(win);
  loomMakeResizable(win);   // ★r37f：右下/左下斜纹手柄，照搬关键帧窗 makeKeyframeResizable
  loomWinEl = win;
  return win;
}

// 分类切换：左竖列导航高亮 + 内容区一次只显示一个分类（窄屏由媒体查询变成顶部横滑胶囊）
function loomSetCat(cat) {
  if (!loomWinEl) return;
  loomWinEl.querySelectorAll('.loom-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  loomWinEl.querySelectorAll('.loom-cat').forEach(c => c.classList.toggle('on', c.dataset.cat === cat));
}

function loomSaveRect() {
  if (!loomWinEl) return;
  try {
    // ★r37f：恢复记忆完整尺寸（面板长宽固定、可手动拽大，与关键帧浮动窗一致）
    localStorage.setItem('ui_loom_win_rect', JSON.stringify({
      l: parseInt(loomWinEl.style.left) || 0, t: parseInt(loomWinEl.style.top) || 0,
      w: Math.round(loomWinEl.offsetWidth) || 0, h: Math.round(loomWinEl.offsetHeight) || 0
    }));
  } catch (e) { }
}
function loomRestoreRect(win, initW, initH) {
  let r = null;
  try { r = JSON.parse(localStorage.getItem('ui_loom_win_rect') || 'null'); } catch (e) { }
  let l = null, t = null, w = null, h = null;
  if (r && Number.isFinite(r.l)) l = r.l;
  if (r && Number.isFinite(r.t)) t = r.t;
  if (r && Number.isFinite(r.w) && r.w > 0) w = r.w;
  if (r && Number.isFinite(r.h) && r.h > 0) h = r.h;
  if (l === null) l = 24;   // 首次打开：默认停靠左上（避开画布正中），与关键帧浮动窗一致
  if (t === null) t = 78;
  if (w === null) w = initW;  // ★r37f：默认固定尺寸（不随内容伸缩；只有拽手柄才会变）
  if (h === null) h = initH;
  const m = 40;             // 至少 40px 留在视口内，避免拖出后找不回
  l = Math.max(m - w, Math.min(l, window.innerWidth - m));
  t = Math.max(0, Math.min(t, window.innerHeight - m));
  win.style.width = w + 'px'; win.style.height = h + 'px';
  win.style.left = l + 'px'; win.style.top = t + 'px';
}

// 拖拽（对齐关键帧窗：pointer events + /getUiZoom() 校正位移 + localStorage 记忆）
function loomMakeDraggable(win) {
  const head = win.querySelector('#loomHead');
  let dragging = false, sx = 0, sy = 0, ol = 0, ot = 0;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault(); e.stopPropagation();
    dragging = true; sx = e.clientX; sy = e.clientY;
    ol = parseInt(win.style.left) || 0; ot = parseInt(win.style.top) || 0;
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
  function onMove(e) {
    if (!dragging) return; e.preventDefault();
    const z = getUiZoom();
    let nl = ol + (e.clientX - sx) / z, nt = ot + (e.clientY - sy) / z;
    const w = win.offsetWidth, h = win.offsetHeight, m = 40;
    nl = Math.max(m - w, Math.min(nl, window.innerWidth - m));
    nt = Math.max(0, Math.min(nt, window.innerHeight - m));
    win.style.left = nl + 'px'; win.style.top = nt + 'px';
    loomRepositionPopup();   // ★r37h-fix：窗口移动时，打开的弹窗跟着锚点走
  }
  function onUp() {
    if (!dragging) return; dragging = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    loomSaveRect();
  }
}
// ★r37f：斜纹缩放手柄（照搬关键帧窗 makeKeyframeResizable 的 setupResize）——
//   右下角手柄向右下放大；左下角手柄向左下放大（同时把 left 往左推，右边缘不动）。
//   位移/尺寸按 /getUiZoom() 校正；最小 380×300；松手记忆尺寸（面板长宽默认固定、只有拽手柄才变）。
function loomMakeResizable(win) {
  function setupResize(handleId, fromLeft) {
    const handle = win.querySelector('#' + handleId);
    if (!handle) return;
    let isResizing = false, startX, startY, startW, startH, startL;
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      isResizing = true;
      startX = e.clientX; startY = e.clientY;
      startW = win.offsetWidth; startH = win.offsetHeight;
      startL = parseInt(win.style.left) || 0;
      win.style.transition = 'none';
      document.addEventListener('pointermove', onResize);
      document.addEventListener('pointerup', onResizeEnd);
    });
    function onResize(e) {
      if (!isResizing) return;
      e.preventDefault();
      const z = getUiZoom();
      const dx = (e.clientX - startX) / z, dy = (e.clientY - startY) / z;
      // ★r37h：最小尺寸随默认尺寸下调（260×200），与 .loom-window 的 min-width/min-height 对齐
      const newW = Math.max(260, fromLeft ? startW - dx : startW + dx);
      const newH = Math.max(200, startH + dy);
      win.style.width = newW + 'px'; win.style.height = newH + 'px';
      if (fromLeft) win.style.left = (startL + startW - newW) + 'px';
      loomRepositionPopup();   // ★r37h-fix：窗口缩放时，打开的弹窗跟着锚点走
    }
    function onResizeEnd() {
      isResizing = false;
      document.removeEventListener('pointermove', onResize);
      document.removeEventListener('pointerup', onResizeEnd);
      loomSaveRect();
    }
  }
  setupResize('loomResizeHandle', false);
  setupResize('loomResizeHandleL', true);
}

// ============================================================================
// ★★r39 通用「抓起拖拽」工具（鼠标直接拖 / 触屏长按抓起）
// ----------------------------------------------------------------------------
// 为什么不用 HTML5 拖放 API：Drag and Drop 在触屏上完全不生效，无法满足「手机端长按抓起」。
// 为什么不用 pointer events + touch-action:none：touch-action 在「指针手势开始时」就被浏览器
//   固定，给列表行设 none 会让「手指一落在行上」就再也无法滚动内容区（列表本来就靠 .loom-scroll 滚）。
// ⇒ 按输入类型分派：鼠标走 mousedown/mousemove/mouseup；触屏走 touchstart/touchmove/touchend
//   （touchmove 必须以 {passive:false} 注册，才能在长按认定成功后 preventDefault 锁住滚动）。
// 两种模式（由 cfg.mode 决定）：
//   'sort' —— 拖动中被拖行留在列表里当**占位**（虚线半透明）并实时挪动位置预览结果，
//             另生成一张跟随指针的浮动卡片（loomGhostFrom）给出「被拎起来跟手」的手感；
//   'drop' —— 不重排 DOM，只生成跟随指针的浮动卡片并高亮指针所在的目标容器（cfg.groupSel）。
// cfg: { itemSel, ignoreSel, mode, groupSel, onSort(items, dragged), onDrop(item, targetKey) }
// ============================================================================
// ★★r39c：统一的「拖拽浮动卡片」生成器 —— 克隆节点树，再补两件 cloneNode 做不到的事：
//   ① <canvas> 的位图不会被 cloneNode 复制（旗帜/图案缩略图会变成空白）⇒ 逐张 drawImage 拷过去；
//   ② 克隆出的 button 已脱离原作用域（如 `.loom-window button:not(...)` / `.bnr-root ...` 规则），
//      会退化成浏览器默认的白胶囊 ⇒ 直接删掉按钮（浮动卡片上本来也不需要交互）。
function loomGhostFrom(row) {
  const clone = row.cloneNode(true);
  const src = row.querySelectorAll('canvas'), dst = clone.querySelectorAll('canvas');
  for (let i = 0; i < src.length && i < dst.length; i++) {
    dst[i].width = src[i].width; dst[i].height = src[i].height;
    try { dst[i].getContext('2d').drawImage(src[i], 0, 0); } catch (e) { }
  }
  clone.querySelectorAll('button').forEach(b => b.remove());
  return clone;
}
function loomAttachDrag(container, cfg) {
  if (!container || container.__dragBound) return;   // 同一容器只装配一次（openLoomWindow 每次重建内容区，故通常无需此守卫）
  container.__dragBound = true;
  const LONG_PRESS = 400, MOUSE_SLOP = 6, TOUCH_SLOP = 8;
  const ignoreSel = cfg.ignoreSel || '';
  let row = null, dragging = false, armed = false, sx = 0, sy = 0, lpTimer = null;
  let ghost = null, tgtEl = null, tgtKey = null, order0 = null, swallow = false;
  let lastPt = null, autoTimer = null;
  let grabDX = 0, grabDY = 0;   // 按下点相对被拖行左上角的偏移 ⇒ 浮动卡片保持在手指「抓住的那一处」

  const onDoc = (t, fn, o) => document.addEventListener(t, fn, o);
  const offDoc = (t, fn, o) => document.removeEventListener(t, fn, o);
  const onCont = (t, fn, o) => container.addEventListener(t, fn, o);
  const offCont = (t, fn, o) => container.removeEventListener(t, fn, o);

  // 抓取判定：从交互控件（图案/颜色选择器、按钮）上按下不算抓取，避免抢走它们的点击
  function pick(e) {
    const t = e.target && e.target.closest ? e.target.closest(cfg.itemSel) : null;
    if (!t || !container.contains(t)) return null;
    if (ignoreSel && e.target.closest(ignoreSel)) return null;
    return t;
  }
  function clearLP() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }

  function activate() {
    dragging = true;
    order0 = [...container.querySelectorAll(cfg.itemSel)];   // 取消时按此还原
    // ★r39c：两种模式都先造一张「跟着手走」的浮动卡片，这样 sort 模式也有明确的「被拎起来」手感；
    //   必须在给行加 .loom-drag-row（虚线+半透明）之前克隆，否则浮动卡片会连带变虚。
    const rr = row.getBoundingClientRect();
    grabDX = sx - rr.left; grabDY = sy - rr.top;
    ghost = (cfg.makeGhost || loomGhostFrom)(row);
    ghost.classList.add('loom-drag-ghost');
    ghost.style.width = Math.max(120, Math.round(rr.width)) + 'px';
    ghost.style.left = (sx - grabDX) + 'px';
    ghost.style.top = (sy - grabDY) + 'px';   // 先定位到按下点，避免长按激活瞬间卡片闪在视口左上角
    document.body.appendChild(ghost);
    // 原位留下一个「占位」外观：虚线 + 半透明，表示这里是被拎走的那一行
    row.classList.add('loom-drag-row');
    row.style.pointerEvents = 'none';   // 让 elementFromPoint 能穿到行下面去（drop 模式靠它找分组）
    container.classList.add('loom-dragging');
    document.body.style.userSelect = 'none';
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = setInterval(autoScroll, 50);
  }
  function killGhost() { if (ghost) { ghost.remove(); ghost = null; } }

  // sort 模式：以相邻行的垂直中点为界，就地搬动被拖的行（实时预览最终顺序）
  // ★统一收「点」对象 {clientX, clientY} —— TouchEvent 本身没有 clientX/clientY（只有 touches[0] 有），
  //   若直接读 e.clientY 会得到 undefined，导致排序判定永远失败、被拖行只会掉到末尾。
  function sortMove(pt) {
    const kids = [...container.querySelectorAll(cfg.itemSel)].filter(k => k !== row);
    let ref = null;
    for (const k of kids) {
      const b = k.getBoundingClientRect();
      if (pt.clientY < b.top + b.height / 2) { ref = k; break; }
    }
    if (ref) container.insertBefore(row, ref); else container.appendChild(row);
  }
  // drop 模式：幽灵自己 pointer-events:none，故 elementFromPoint 命中的仍是真实节点
  function hitTarget(pt) {
    const el = document.elementFromPoint(pt.clientX, pt.clientY);
    const g = el && el.closest ? el.closest(cfg.groupSel) : null;
    if (g === tgtEl) return;
    if (tgtEl) tgtEl.classList.remove('dragover');
    tgtEl = g;
    tgtKey = g ? (g.dataset.gid || '') : null;
    if (g) g.classList.add('dragover');
  }
  function move(pt) {
    lastPt = pt;
    // ★r39c：浮动卡片两种模式都跟随指针（保持在手指抓住的那一处），给出「卡片跟手」的直接反馈
    if (ghost) {
      ghost.style.left = (pt.clientX - grabDX) + 'px';
      ghost.style.top = (pt.clientY - grabDY) + 'px';
    }
    if (cfg.mode === 'sort') sortMove(pt); else hitTarget(pt);
  }
  // ★边缘自动滚动：拖拽中若把指针停靠在内容区上下边缘，自动滚动列表 ——
  //   否则「拖到当前看不见的那一行 / 那一个分组」根本无法完成（触屏拖拽期间我们 preventDefault 了，页面不会自己滚）。
  function autoScroll() {
    if (!dragging || !lastPt) return;
    const sc = (container.closest && container.closest('.loom-scroll')) || container;
    if (!sc || sc.scrollHeight <= sc.clientHeight) return;
    const r = sc.getBoundingClientRect(), M = 30, STEP = 9;
    let dy = 0;
    if (lastPt.clientY < r.top + M) dy = -STEP;
    else if (lastPt.clientY > r.bottom - M) dy = STEP;
    if (!dy) return;
    const prev = sc.scrollTop;
    sc.scrollTop = prev + dy;
    if (sc.scrollTop !== prev) move(lastPt);   // 滚动后重算插入点 / 落点高亮
  }

  function teardown() {
    clearLP();
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    lastPt = null;
    offDoc('mousemove', onMM); offDoc('mouseup', onMU);
    // ★触屏监听挂在容器上而非 document：touch 事件的目标始终是 touchstart 的那个元素（就在容器内），
    //   挂容器即可命中，且避免在 document 上留下 non-passive 监听（Chromium 会为此告警）。
    offCont('touchmove', onTM); offCont('touchend', onTE); offCont('touchcancel', onTC);
  }
  // finished=true 落定；false 取消（按 order0 还原 DOM）
  function end(finished) {
    const wasDragging = dragging, r = row, key = tgtKey;
    dragging = false; armed = false;
    teardown();
    if (r) { r.classList.remove('loom-drag-row'); r.style.pointerEvents = ''; }
    container.classList.remove('loom-dragging');
    document.body.style.userSelect = '';
    if (tgtEl) tgtEl.classList.remove('dragover');
    tgtEl = null; tgtKey = null;
    killGhost();
    row = null;
    if (!wasDragging || !r) return;
    // ★拖拽松手后浏览器可能补发一次 click（鼠标几乎必发、触屏若 preventDefault 过 touchmove 则不发），
    //   用捕获阶段吞掉它，避免顺带触发「选中图层 / 折叠分组 / 载入旗帜」；300ms 后自动失效防误吞后续点击。
    swallow = true;
    setTimeout(() => { swallow = false; }, 300);
    if (!finished) {
      if (order0) order0.forEach(n => container.appendChild(n));
      order0 = null;
      return;
    }
    order0 = null;
    if (cfg.mode === 'sort') cfg.onSort([...container.querySelectorAll(cfg.itemSel)].map(x => x.__item).filter(Boolean), r.__item);
    else if (cfg.onDrop) cfg.onDrop(r.__item, key);
  }

  function onMM(e) {
    if (!armed) return;
    if (!dragging) {
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < MOUSE_SLOP) return;
      activate(); e.preventDefault();
    }
    e.preventDefault();
    move({ clientX: e.clientX, clientY: e.clientY });
  }
  function onMU() { end(true); }
  function onTM(e) {
    if (!armed) return;
    const t = e.touches[0]; if (!t) return;
    if (!dragging) {
      // 长按计时未到就滑动了 ⇒ 判定为「滚动」，撤掉监听交还给浏览器（全程未 preventDefault，滚动照常）
      if (Math.abs(t.clientX - sx) + Math.abs(t.clientY - sy) < TOUCH_SLOP) return;
      armed = false; teardown(); return;
    }
    e.preventDefault();   // 已确认抓起 ⇒ 锁住滚动（故 touchmove 必须 non-passive）
    move({ clientX: t.clientX, clientY: t.clientY });   // ★不能用 e.clientX：TouchEvent 没有该属性
  }
  function onTE() { end(true); }
  function onTC() { end(false); }
  function onEsc(e) { if (dragging && e.key === 'Escape') { e.stopPropagation(); end(false); } }

  container.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const t = pick(e); if (!t) return;
    row = t; armed = true; sx = e.clientX; sy = e.clientY;
    onDoc('mousemove', onMM); onDoc('mouseup', onMU);
  });
  container.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = pick(e); if (!t) return;
    row = t; armed = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    onCont('touchmove', onTM, { passive: false });
    onCont('touchend', onTE); onCont('touchcancel', onTC);
    // ★手机端抓起方式＝长按：计时到点且手指未滑动才进入拖拽，否则让位给滚动
    clearLP();
    lpTimer = setTimeout(() => { lpTimer = null; if (armed && !dragging && row) activate(); }, LONG_PRESS);
  });
  container.addEventListener('contextmenu', (e) => { if (row) e.preventDefault(); });   // 按住不放时挡掉系统菜单
  // 吞掉紧随拖拽的那一次 click
  container.addEventListener('click', (e) => {
    if (!swallow) return;
    swallow = false; e.stopPropagation(); e.preventDefault();
  }, true);
  onDoc('keydown', onEsc);
}

// 关闭浮窗：隐藏 + 记忆位置 + 恢复材质菜单并回到主菜单
function loomClose() {
  if (loomWinEl) loomWinEl.style.display = 'none';
  if (loomPopup) { loomPopup.style.display = 'none'; loomPopup._anchor = null; loomPopup._inner = null; }  // ★r37h-fix：关窗不留悬空弹窗
  loomSaveRect();
  // ★r37h-fix2：恢复材质菜单时必须重新武装「外部点击关闭」——
  //   织布机使用期间，菜单原登记的 closeHandler 常已被「点击织布机窗口」注销掉，
  //   只恢复 display 会让菜单永久关不掉（用户报障）。这里延后一拍恢复并重新装配，
  //   避免被关闭浮窗的那一次点击立刻又判为“点了外部”。
  if (loomApi && typeof loomApi.showMain === 'function') loomApi.showMain();
  setTimeout(() => {
    materialMenuDiv.style.display = '';
    positionMaterialMenu();
    mmArmClose();
  }, 0);
}

function openLoomWindow(api) {
  loomApi = api;
  buildLoomWindow();
  // 浮窗独占：先隐藏材质菜单（关窗时由 loomClose 恢复并回到主菜单）
  // ★r37h-fix2：隐藏的同时主动拆卸菜单的关闭监听，避免它把「点击织布机窗口」误判为外部点击
  materialMenuDiv.style.display = 'none';
  mmUnarmClose();

  if (!window.__loom) window.__loom = { baseDye: 0, layers: [], activeLayer: -1 };
  const st = window.__loom;

  // ★★【r37 实时读取选中旗帜的配方】打开织布机时，先把面板状态同步为「当前选中旗帜」
  //   的真实材质，使预览/底色/图层直接反映选中的旗帜。
  //   ——此前 __loom 是纯全局状态、从不与选中方块同步 ⇒ 面板永远显示上次编辑内容，
  //   与当前旗帜无关（用户反馈的根因）。
  //   ★r41：读不到配方（上传图片旗帜 / 未存配方 / 非旗帜）时清空为「空白旗帜」，
  //   不再沿用上一次的组成 —— 否则改选别的旗帜后，面板仍显示上一面旗帜的图层（用户报障）。
  const readSelRecipe = () => (typeof api.readLoomRecipe === 'function') ? api.readLoomRecipe() : null;
  try {
    const r = readSelRecipe();
    st.baseDye = r ? r.baseDye : 0;
    st.layers = r ? (r.layers || []).map(l => ({ pat: l.pat, dye: l.dye })) : [];
    st.activeLayer = -1;
  } catch (e) { console.warn('读取旗帜配方失败', e); }

  // ★r37e：内容区只放「栏目」= 底色 / 图层 / 操作。
  //   旗帜预览**不再是栏目**，它已常驻在窗口壳里（.loom-top 左侧，永远可见；r37g 起分类栏在它右侧）。
  //   用户截图里的「已应用 / 下载 PNG / 清空图层」这些与旗帜设计无关的东西 → 单独「操作」栏目。
  const root = document.createElement('div');
  root.className = 'bnr-root';
  root.innerHTML = `
    <div class="loom-cat" data-cat="base">
      <h2>底色</h2>
      <div class="bnr-swatches" id="bnrBaseDyes"></div>
    </div>
    <div class="loom-cat" data-cat="layers">
      <h2>图层 <span id="bnrLayerCount" class="bnr-sub"></span>
        <button id="bnrAddLayer" class="bnr-ghost bnr-fr">＋ 添加图层</button></h2>
      <div id="bnrLayers"></div>
    </div>
    <div class="loom-cat" data-cat="lib">
      <div class="loom-libbar">
        <button id="bnrLibSave" class="bnr-ghost">＋ 存入当前旗帜</button>
        <button id="bnrLibNewGrp" class="bnr-ghost">＋ 新建分组</button>
      </div>
      <div id="bnrLibList"></div>
    </div>
    <div class="loom-cat" data-cat="ops">
      <h2>操作</h2>
      <label class="bnr-scalerow">分辨率 <input id="bnrScale" type="number" min="1" max="48" value="16"> 倍</label>
      <span class="bnr-hint" id="bnrSizeLabel"></span>
      <div class="loom-opsrow">
        <button id="bnrDownload" class="bnr-ghost">下载 PNG</button>
        <button id="bnrReset" class="bnr-danger">清空图层</button>
      </div>
    </div>`;
  const _loomScroll = loomQ('loomScroll');
  _loomScroll.innerHTML = '';
  _loomScroll.appendChild(root);

  // ★r37e：预览 canvas 等常驻元素在窗口壳里（不在 root 内）⇒ $ 必须查整个窗口，不能只查 root。
  const $ = id => loomWinEl.querySelector('#' + id);

  // ★r37e：任何一次更改都默认写回旗帜材质，不再需要「应用为贴图」按钮。
  //   用 150ms 防抖合并连续改动（拖色板/改图层时避免每个事件都做一次 toDataURL + 贴图上链）。
  //   ★首次渲染不自动应用：否则会给「用的是自定义图片 / 未存配方」（读不到配方＝按新旗帜编辑）
  //     的旗帜立刻盖上一张白旗帜，那并非用户本意。
  let loomAutoReady = false, loomApplyTimer = null;
  function scheduleLoomApply() {
    if (!loomAutoReady) return;
    if (loomApplyTimer) clearTimeout(loomApplyTimer);
    loomApplyTimer = setTimeout(() => {
      loomApplyTimer = null;
      const c = loomTextureCanvas(st);
      const url = c.toDataURL('image/png');
      // 配方与贴图成对写入（见 r36 契约）：loomCode = 紧凑文本；loomUrl = 对应哪张贴图。
      const recipe = { baseDye: st.baseDye, layers: (st.layers || []).map(l => ({ pat: l.pat, dye: l.dye })) };
      const code = loomRecipeToCode(recipe);
      // 'banner' 来源类别：仅对旗帜生效；未选中旗帜时静默跳过（自动行为不弹窗打扰）
      api.applyTex(b => { b.loomCode = code; b.loomUrl = url; b.loadTexture(url, '旗帜'); }, 'banner');
    }, 150);
  }

  function renderFlag() {
    const temp = loomNativeCanvas(st.baseDye, st.layers);
    // ★r37e：预览恒定渲染为 320×640（16×），显示尺寸由 CSS 固定 72px —— 与「分辨率」解耦。
    //   「分辨率」只影响「下载 PNG」的导出尺寸（贴图本身固定 64×128，见 loomTextureCanvas）。
    const preview = $('bnrPreview');
    const pctx = preview.getContext('2d');
    pctx.imageSmoothingEnabled = false;
    pctx.clearRect(0, 0, preview.width, preview.height);
    pctx.drawImage(temp, 0, 0, preview.width, preview.height);
    const scale = Math.max(1, Math.min(48, parseInt($('bnrScale').value) || 16));
    $('bnrSizeLabel').textContent = '导出尺寸 ' + (LOOM_W * scale) + ' × ' + (LOOM_H * scale) + ' px';
    // ★r37g：原先写入预览侧栏的底色色块 + 中文名（#bnrBaseChip / #bnrBaseName）已随
    //   「不显示这些」删除 —— 底色本就是独立「底色」栏目，无需在预览旁重复一份。
    scheduleLoomApply();
  }
  // ★r37c：原 `buildPatGrid()`（独立「图案 / Patterns」大网格栏目）已按用户要求整体删除 ——
  //   它和图层行内 `loomBuildPatternPicker` 弹出的图案网格功能完全重复。
  function addLayer(pat = 'no', dye = 14) {
    if (st.layers.length >= LOOM_MAX_LAYERS) return;
    st.layers.push({ pat, dye });
    st.activeLayer = st.layers.length - 1;
    renderLayers(); renderFlag();
  }
  function updateAddButton() {
    const btn = $('bnrAddLayer');
    const cnt = $('bnrLayerCount');
    cnt.textContent = st.layers.length + ' / ' + LOOM_MAX_LAYERS;
    if (st.layers.length >= LOOM_MAX_LAYERS) {
      btn.disabled = true; btn.textContent = '已达上限 ' + LOOM_MAX_LAYERS;
      btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false; btn.textContent = '＋ 添加图层';
      btn.style.opacity = '1'; btn.style.cursor = 'pointer';
    }
  }
  function renderLayers() {
    const box = $('bnrLayers');
    box.innerHTML = '';
    if (st.layers.length === 0) {
      box.innerHTML = '<p class="bnr-hint">点击「＋ 添加图层」，然后在图层行里选择图案与颜色。<br>按住行首 ⠿ 拖动可调整上下顺序（手机长按）。</p>';
      updateAddButton(); return;
    }
    st.layers.forEach((L, idx) => {
      const row = document.createElement('div');
      row.className = 'bnr-layer' + (idx === st.activeLayer ? ' active' : '');
      row.onclick = () => { st.activeLayer = idx; renderLayers(); renderFlag(); };
      row.__item = L;   // ★r39：拖拽排序落数据时按此把 DOM 顺序映射回图层顺序
      // ★r39：行首抓取块 —— 纯视觉提示（抓取判定仍由整行承担，手机上小图标太难点）
      const grab = document.createElement('span'); grab.className = 'bnr-grab';   // 点阵由 CSS 画，无需文字
      grab.title = '拖动调整上下顺序（手机长按）';
      // ★r37c：删掉原先与图案选择器重复的独立缩略图（用户指出的“功能完全重复”）——
      //   图案选择器本身已带同一张 28×56 的图案预览，故行内不再重复渲染第二张。
      const patSel = loomBuildPatternPicker(L.pat, L.dye, v => { L.pat = v; renderLayers(); renderFlag(); });
      const dyeSel = loomBuildDyeSelect(L.dye, v => { L.dye = v; renderLayers(); renderFlag(); });
      const up = document.createElement('button'); up.className = 'bnr-ghost'; up.textContent = '▲';
      up.onclick = (e) => { e.stopPropagation(); if (idx > 0) { [st.layers[idx - 1], st.layers[idx]] = [st.layers[idx], st.layers[idx - 1]]; st.activeLayer = idx - 1; renderLayers(); renderFlag(); } };
      const dn = document.createElement('button'); dn.className = 'bnr-ghost'; dn.textContent = '▼';
      dn.onclick = (e) => { e.stopPropagation(); if (idx < st.layers.length - 1) { [st.layers[idx + 1], st.layers[idx]] = [st.layers[idx], st.layers[idx + 1]]; st.activeLayer = idx + 1; renderLayers(); renderFlag(); } };
      const del = document.createElement('button'); del.className = 'bnr-danger'; del.textContent = '×';
      del.onclick = (e) => { e.stopPropagation(); st.layers.splice(idx, 1); st.activeLayer = Math.min(idx, st.layers.length - 1); renderLayers(); renderFlag(); };
      [grab, patSel, dyeSel, up, dn, del].forEach(e => row.appendChild(e));
      box.appendChild(row);
    });
    // ★r39：图层行拖拽排序（鼠标直接拖 / 触屏长按抓起）。拖动中实时重排 DOM，松手把顺序写回 st.layers。
    // ★r39b：ignoreSel 只排除 button —— 原来把 .bnr-patpicker/.bnr-dyesel 也排除了，导致「按在旗帜缩略图上抓不起来」，
    //   而这两个选择器占满了整行的大半宽度（用户最自然的抓取位置）。它们本身仍是点开弹窗的控件：
    //   位移未超过阈值就不会进入拖拽，松手即照常触发 click 打开选择器；只有位移/长按达到阈值才算抓取。
    loomAttachDrag(box, {
      itemSel: '.bnr-layer',
      ignoreSel: 'button',   // ↑/↓/× 按钮不参与抓取
      mode: 'sort',
      onSort: (order, dragged) => {
        if (!order.length) return;
        st.layers = order;
        const i = st.layers.indexOf(dragged);
        st.activeLayer = i < 0 ? -1 : i;
        renderLayers(); renderFlag();
      }
    });
    updateAddButton();
  }
  function refreshBaseDyes() {
    loomBuildSwatches($('bnrBaseDyes'), st.baseDye, i => { st.baseDye = i; refreshBaseDyes(); renderFlag(); });
  }

  // ★r41【面板实时跟随选中旗帜】窗开着时改选另一面旗帜（selectBlock → loomOnSelectionSync），
  //   面板就地切到新旗帜的底色/图层。同配方不重绘；同步属于「读」不是「编辑」，
  //   期间关掉自动写回，避免把没有配方的旗帜立刻盖成一张空白旗。
  function loomSameRecipe(r) {
    if (!r) return st.layers.length === 0 && st.baseDye === 0;
    if (r.baseDye !== st.baseDye) return false;
    const a = r.layers || [];
    if (a.length !== st.layers.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].pat !== st.layers[i].pat || a[i].dye !== st.layers[i].dye) return false;
    }
    return true;
  }
  loomSyncHandler = () => {
    // 只在当前选区含旗帜时同步：选中非旗帜 / 清空选区都不动面板，避免误清。
    const cur = selectedBlocksSet.size ? [...selectedBlocksSet] : (selectedBlock ? [selectedBlock] : []);
    if (!cur.some(b => b.type === 'flag')) return;
    let r = null;
    try { r = readSelRecipe(); } catch (e) { return; }
    if (loomSameRecipe(r)) return;
    st.baseDye = r ? r.baseDye : 0;
    st.layers = r ? (r.layers || []).map(l => ({ pat: l.pat, dye: l.dye })) : [];
    st.activeLayer = -1;
    const prevReady = loomAutoReady;
    loomAutoReady = false;
    try { refreshBaseDyes(); renderLayers(); renderFlag(); }
    finally { loomAutoReady = prevReady; }
  };

  // ==========================================================================
  // ★★r38【旗帜库】栏目（渲染 + 交互）
  // --------------------------------------------------------------------------
  // 数据在 LOOM_LIB_KEY（localStorage ⇒ 本机、跨项目持久）；本栏目只做三件事：
  //   ① 存入当前旗帜（带命名）；② 分组增/删/改名/折叠；③ 条目载入/重命名/移动/删除。
  // 条目点击载入 = 直接改 st 并重渲染 ⇒ 末尾 renderFlag 的 scheduleLoomApply 自动写回材质，
  // 延续 r37e「任何修改都自动同步、不要『应用』按钮」的约定。
  // ==========================================================================
  const libData = loomLibLoad();
  function libPersist() { loomLibSave(libData); renderLib(); }
  // 复用共用弹窗 + 避让定位，渲染一列可点条目（对齐颜色选择器的 .bnr-dyerow 行样式）
  function libMenuOpen(btn, rows) {
    const popup = loomEnsurePopup();
    popup.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'bnr-dyelist';
    rows.forEach(r => {
      const d = document.createElement('div');
      d.className = 'bnr-dyerow' + (r.sel ? ' sel' : '');
      d.textContent = r.label;
      d.onclick = (ev) => { ev.stopPropagation(); popup.style.display = 'none'; r.run(); };
      list.appendChild(d);
    });
    popup.appendChild(list);
    popup.style.display = 'block';
    loomPlacePopup(popup, btn, list);
  }
  // ★★r40：删除确认「就地两按钮」—— 点 ⋯ 菜单里的「删除」后，菜单内容就地换成
  //   「取消 / 确认删除」两个小按钮，位置就在 ⋯ 按钮旁（共用弹窗 z-index:9999，在织布机窗体之上）。
  //   不再走 showConfirmModal —— 它的居中 modal 遮罩 z-index:900 低于窗体 1002，会被窗体压住。
  function libConfirm(btn, text, onOk) {
    const popup = loomEnsurePopup();
    popup.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'bnr-confirm';
    const msg = document.createElement('div'); msg.className = 'bnr-confirm-msg'; msg.innerHTML = text;
    const row = document.createElement('div'); row.className = 'bnr-confirm-row';
    const no = document.createElement('div'); no.className = 'bnr-confirm-btn no'; no.textContent = '取消';
    const yes = document.createElement('div'); yes.className = 'bnr-confirm-btn yes'; yes.textContent = '确认删除';
    no.onclick = (ev) => { ev.stopPropagation(); popup.style.display = 'none'; };
    yes.onclick = (ev) => { ev.stopPropagation(); popup.style.display = 'none'; onOk(); };
    row.appendChild(no); row.appendChild(yes);
    wrap.appendChild(msg); wrap.appendChild(row);
    popup.appendChild(wrap);
    popup.style.display = 'block';
    loomPlacePopup(popup, btn, null);   // 内容很小，无需收窄内层列表高度
  }
  function libLoadItem(it) {
    const r = loomCodeToRecipe(it.code);
    if (!r) return;
    st.baseDye = r.baseDye;
    st.layers = r.layers.map(l => ({ pat: l.pat, dye: l.dye }));
    st.activeLayer = -1;
    refreshBaseDyes(); renderLayers(); renderFlag();
  }
  function libItemMenu(btn, id) {
    const it = libData.items.find(x => x.id === id);
    if (!it) return;
    libMenuOpen(btn, [
      { label: '载入到织布机', run: () => libLoadItem(it) },
      { label: '重命名…', run: () => loomNameModal('重命名旗帜', it.name, v => { it.name = v; libPersist(); }) },
      { label: '移动到分组…', run: () => libMoveMenu(btn, it) },
      { label: '删除', run: () => libConfirm(btn, `确定删除旗帜「${escapeHtml(it.name)}」？`, () => { libData.items = libData.items.filter(x => x.id !== it.id); libPersist(); }) }
    ]);
  }
  function libMoveMenu(btn, it) {
    libMenuOpen(btn, [{ label: '未分组', sel: !(it.groupId || ''), run: () => { it.groupId = ''; libPersist(); } }]
      .concat(libData.groups.map(g => ({ label: g.name, sel: it.groupId === g.id, run: () => { it.groupId = g.id; libPersist(); } }))));
  }
  function libGroupMenu(btn, gid) {
    const g = libData.groups.find(x => x.id === gid);
    if (!g) return;
    libMenuOpen(btn, [
      { label: '重命名分组…', run: () => loomNameModal('重命名分组', g.name, v => { g.name = v; libPersist(); }) },
      {
        label: '删除分组（旗帜转为未分组）', run: () => libConfirm(btn, `确定删除分组「${escapeHtml(g.name)}」？<small>组内旗帜不会删除，会转为「未分组」。</small>`, () => {
          libData.groups = libData.groups.filter(x => x.id !== gid);
          libData.items.forEach(it => { if (it.groupId === gid) it.groupId = ''; });
          libPersist();
        })
      }
    ]);
  }
  function libItemRow(it) {
    const row = document.createElement('div');
    row.className = 'loom-libitem';
    row.title = '点击载入到织布机；拖动到分组标题可归组（手机长按）';
    row.__item = it;   // ★r39：拖入分组时按此把 DOM 行映射回库条目
    const grab = document.createElement('span'); grab.className = 'bnr-grab';   // 点阵由 CSS 画，无需文字
    grab.title = '拖到分组上可归组（手机长按）';
    const cv = document.createElement('canvas');
    cv.className = 'loom-libthumb';
    loomLibThumb(cv, it.code);
    const nm = document.createElement('span'); nm.className = 'loom-libitem-name'; nm.textContent = it.name;
    const more = document.createElement('button'); more.className = 'loom-libmore'; more.textContent = '⋯'; more.title = '条目操作';
    more.onclick = (e) => { e.stopPropagation(); libItemMenu(more, it.id); };
    row.appendChild(grab); row.appendChild(cv); row.appendChild(nm); row.appendChild(more);
    row.onclick = () => libLoadItem(it);
    return row;
  }
  // ★r39：旗帜库条目的「拖入分组」—— 条目是嵌套在分组 body 里的，跨组拖拽不能靠重排 DOM，
  //   故用 drop 模式：拖起条目 → 高亮指针所在分组 → 松手把 groupId 写回条目并整体落盘。
  function libDragDrop(item, gid) {
    if (!item || gid === null) return;           // 松在分组之外 ⇒ 不改动
    if ((item.groupId || '') === gid) return;    // 已在目标组 ⇒ 不改动
    item.groupId = gid;
    libPersist();
  }
  function renderLib() {
    const box = $('bnrLibList');
    if (!box) return;
    box.innerHTML = '';
    if (libData.items.length === 0 && libData.groups.length === 0) {
      box.innerHTML = '<p class="loom-libempty">库还是空的。在「底色 / 图层」里做好旗帜后，点上方「＋ 存入当前旗帜」把它存进来。<br>库数据保存在本机，换个项目也能继续用。</p>';
      return;
    }
    // 「未分组」是固定伪分组（不可改名/删除），仅在有内容时显示
    const views = [{ id: '', name: '未分组', collapsed: false, pseudo: true }]
      .concat(libData.groups.map(g => ({ id: g.id, name: g.name, collapsed: !!g.collapsed, pseudo: false })));
    views.forEach(v => {
      const items = libData.items.filter(it => (it.groupId || '') === v.id).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      // ★r39：只要库里还有条目就一直显示「未分组」—— 否则当它恰好为空时该分组会消失，
      //   用户就没法把条目「拖回未分组」（拖拽需要一个稳定的落点，不能随内容多少而闪烁消失）。
      if (v.pseudo && libData.items.length === 0) return;
      const grp = document.createElement('div');
      grp.className = 'loom-libgrp' + (v.collapsed ? ' collapsed' : '');
      grp.dataset.gid = v.id;   // ★r39：拖放落点的分组标识（未分组为 ''）
      const head = document.createElement('div');
      head.className = 'loom-libgrp-head';
      const tri = document.createElement('span'); tri.className = 'loom-libgrp-tri'; tri.textContent = '▼';
      const nm = document.createElement('span'); nm.className = 'loom-libgrp-name'; nm.textContent = v.name;
      const cnt = document.createElement('span'); cnt.className = 'loom-libgrp-cnt'; cnt.textContent = items.length;
      head.appendChild(tri); head.appendChild(nm); head.appendChild(cnt);
      if (!v.pseudo) {
        const more = document.createElement('button'); more.className = 'loom-libmore'; more.textContent = '⋯'; more.title = '分组操作';
        more.onclick = (e) => { e.stopPropagation(); libGroupMenu(more, v.id); };
        head.appendChild(more);
        head.onclick = () => { const g = libData.groups.find(x => x.id === v.id); if (g) { g.collapsed = !g.collapsed; libPersist(); } };
      }
      grp.appendChild(head);
      const body = document.createElement('div'); body.className = 'loom-libgrp-body';
      if (items.length === 0) body.innerHTML = '<div class="loom-libempty">这个分组还是空的</div>';
      else items.forEach(it => body.appendChild(libItemRow(it)));
      grp.appendChild(body);
      box.appendChild(grp);
    });
    loomAttachDrag(box, {
      itemSel: '.loom-libitem',
      ignoreSel: 'button',   // 仅排除 ⋯ 按钮；分组标题本就不在 .loom-libitem 内，天然不会成为抓取起点
      mode: 'drop',
      groupSel: '.loom-libgrp',
      onDrop: libDragDrop
    });
  }
  $('bnrLibSave').addEventListener('click', () => {
    const def = '旗帜 ' + (LOOM_DYE_ZH[LOOM_DYE_NAMES[st.baseDye]] || '') + (st.layers.length ? ' · ' + st.layers.length + '层' : '');
    loomNameModal('存入旗帜库', def, name => {
      const code = loomRecipeToCode({ baseDye: st.baseDye, layers: (st.layers || []).map(l => ({ pat: l.pat, dye: l.dye })) });
      if (!code) return;
      libData.items.push({ id: loomLibNewId(), name, groupId: '', code, ts: Date.now() });
      libPersist();
    });
  });
  $('bnrLibNewGrp').addEventListener('click', () => {
    loomNameModal('新建分组', '分组 ' + (libData.groups.length + 1), name => {
      libData.groups.push({ id: loomLibNewId(), name, collapsed: false });
      libPersist();
    });
  });
  renderLib();

  $('bnrScale').addEventListener('input', renderFlag);
  $('bnrScale').addEventListener('change', renderFlag);
  $('bnrAddLayer').addEventListener('click', () => addLayer());
  $('bnrReset').addEventListener('click', () => { st.layers = []; st.activeLayer = -1; renderLayers(); renderFlag(); });
  $('bnrDownload').addEventListener('click', () => {
    const names = st.layers.map(L => L.pat).join('-') || 'empty';
    // ★r37e：「分辨率」只影响这里的导出尺寸（预览与贴图都固定，见 renderFlag 注释）
    const scale = Math.max(1, Math.min(48, parseInt($('bnrScale').value) || 16));
    const src = loomNativeCanvas(st.baseDye, st.layers);
    const c = document.createElement('canvas');
    c.width = LOOM_W * scale; c.height = LOOM_H * scale;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(src, 0, 0, c.width, c.height);
    const a = document.createElement('a');
    a.download = `banner_${LOOM_DYE_NAMES[st.baseDye]}_${names}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  });

  refreshBaseDyes(); renderLayers(); renderFlag();
  // ★r37e：首次渲染完成后再开闸 —— 之后的任何一次改动都会自动写回旗帜材质（无需「应用」按钮）。
  loomAutoReady = true;
  // 默认落在「底色」栏目；恢复上次窗口位置后显示浮窗（外壳已由 buildLoomWindow 建好）
  loomSetCat('base');
  if (loomWinEl) {
    // ★r37h：默认尺寸下调为 320×360（用户「做小点啊」，需要更大可以拽斜纹手柄放大）
    loomRestoreRect(loomWinEl, 320, 360);
    loomWinEl.style.display = 'flex';
    loomWinEl.style.zoom = getUiZoom();
  }
  // ★r37g：原先的顶部状态徽标（#bnrStatus：「已载入旗帜 / 新旗帜」）已按用户要求
  //   （「不显示这些」）整体删除 —— 面板只在选中旗帜时才可进入，徽标信息量低却占版面。
}
// <<<LOOM_INJECT_END>>>

