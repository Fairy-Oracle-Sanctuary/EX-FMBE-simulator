/* 02-script-kernel/03-flag-recipes.js · 源 测试版v.6b79.html 第 8740-9075 行 */
'use strict';
// ============================================================================
// 织布机 / 旗帜生成器（内嵌自 banner_generator.html）
// 全部图案 alpha mask 已内嵌于 LOOM_SEED（见 loom_seed.js），无外部依赖。
// 生成的旗帜以 data URL 作为自定义贴图应用到选中方块（走 applyTex）。
// 渲染逻辑与原程序 MCBannerDesignerV2 一致：底色纯色平涂；每个图案取
// 40×20(alpha) 区域作为形状，以染料色按 image*(1-A)+染料*A 叠加。
// ============================================================================

const LOOM_W = LOOM_SEED.maskW;            // 20
const LOOM_H = LOOM_SEED.maskH;            // 40
const LOOM_DYES = LOOM_SEED.dyes;
const LOOM_DYE_NAMES = LOOM_SEED.dyeNames;
const LOOM_MASKS = LOOM_SEED.masks;
const LOOM_MAX_LAYERS = 6;

const LOOM_DYE_ZH = {
  white: '白色', orange: '橙色', magenta: '品红色', light_blue: '淡蓝色',
  yellow: '黄色', lime: '黄绿色', pink: '粉红色', gray: '灰色',
  light_gray: '淡灰色', cyan: '青色', purple: '紫色', blue: '蓝色',
  brown: '棕色', green: '绿色', red: '红色', black: '黑色'
};

function loomDecodeBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
// 名称 -> Uint8Array(W*H) alpha mask（按名称排序，保证图案顺序稳定）
const LOOM_TEX = {};
Object.keys(LOOM_MASKS).sort().forEach(n => { LOOM_TEX[n] = loomDecodeBytes(LOOM_MASKS[n]); });

// ===== 旗帜配方 ↔ 紧凑文本（导出/导入用，2026-10-18 r36 定稿）=================
// 用户需求：「导出不要 base64，要旗帜生成器的生成代码，字符长度越短越好」。
// 织布机配方的本体就是 {baseDye, layers:[{pat, dye}]}（16 染料 / 41 图案缩写 / ≤6 层）
// ⇒ 完全可以写成极短的一行文本，无需把生成的 PNG 内嵌成 base64。
//
// ★格式定义（大小写即分隔符，零分隔字符）：
//     banner：<底色><图案1><染料1><图案2><染料2>…
//   · 底色 / 染料：单个【大写字母】A-P，表示染料序号 0-15（A=0 … P=15）
//   · 图案      ：沿用织布机自己的缩写（bs / bo / cr …），全部是【小写字母】2-3 位
//   ⇒ 小写字母串＝图案、单个大写字母＝染料，天然无歧义、不需要任何分隔符。
//   例：banner：PbsKboA = 底色 15 + 图案 bs 染料 10 + 图案 bo 染料 0（共 7 字符 payload）
//   对比：同一面旗帜若内嵌 PNG 的 base64 约 300-1000 字符 ⇒ 缩短约 40 倍，
//   且随存档/撤销快照一起持久化时也不再塞入 base64。
//
// ★必须写成【注释标签】而不能写成 v.* 变量（用户硬性要求：「不要让它们作为显示的变量
//   放出来」）：标签只是命令里的惰性文本，不进作用域 ⇒ 变量面板、模型数据里都不会出现
//   任何 layerCount / patternColors 之类的字段。
function loomDyeChar(i) { return String.fromCharCode(65 + (Math.max(0, Math.min(15, i | 0)))); }
function loomRecipeToCode(recipe) {
    if (!recipe) return '';
    let s = loomDyeChar(recipe.baseDye);
    for (const l of (recipe.layers || [])) {
        const pat = String((l && l.pat) || '');
        // 图案白名单校验：只认织布机真有的缩写（防止拼出解码侧无法还原的字符串）
        if (!/^[a-z]{2,3}$/.test(pat) || !LOOM_TEX[pat]) continue;
        s += pat + loomDyeChar(l.dye);
    }
    return s;
}
// 反向解析：返回 {baseDye, layers} ；非法（含未知图案/染料）一律返回 null（导入侧据此判失败）
function loomCodeToRecipe(code) {
    const s = String(code || '').trim();
    if (!s || !/^[A-P]([a-z]{2,3}[A-P])*$/.test(s)) return null;
    const dyeOf = ch => ch.charCodeAt(0) - 65;
    let i = 0;
    const baseDye = dyeOf(s[i++]);
    const layers = [];
    while (i < s.length) {
        // ★最长优先 + 存在性校验：图案缩写里有前缀关系（bt 是 bts 的前缀、tt⊂tts、vh⊂vhr/vhh、hh⊂hhb），
        //   先试 3 位再退 2 位即可正确切分（3 位切片若含大写染料字母，必然不在白名单里 → 自动退 2 位）。
        let pat = null;
        for (const len of [3, 2]) {
            const cand = s.substr(i, len);
            if (/^[a-z]{2,3}$/.test(cand) && LOOM_TEX[cand]) { pat = cand; break; }
        }
        if (!pat) return null;
        i += pat.length;
        if (i >= s.length || !/[A-P]/.test(s[i])) return null;
        layers.push({ pat, dye: dyeOf(s[i++]) });
    }
    return { baseDye, layers };
}
// <<<LOOM_CODEC_END>>>

// 核心渲染：平涂底色 + 实心染料图案（不透明度 = alpha mask）。返回 W*H RGBA。
function loomRenderPixels(baseIdx, layerList) {
  const n = LOOM_W * LOOM_H;
  const r = new Float64Array(n), g = new Float64Array(n), b = new Float64Array(n);
  const base = LOOM_DYES[baseIdx];
  for (let i = 0; i < n; i++) { r[i] = base[0]; g[i] = base[1]; b[i] = base[2]; }
  for (const layer of layerList) {
    const mask = LOOM_TEX[layer.pat];
    if (!mask) continue;
    const dye = LOOM_DYES[layer.dye];
    for (let i = 0; i < n; i++) {
      const a = mask[i] / 255;
      if (a === 0) continue;                 // image = image*(1-A) + dye*A
      r[i] = r[i] * (1 - a) + dye[0] * a;
      g[i] = g[i] * (1 - a) + dye[1] * a;
      b[i] = b[i] * (1 - a) + dye[2] * a;
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  // 注意：此处不翻转。织布机预览/图标与交给方块前的贴图共用本函数，
  // 真正的方向校正只在 loomTextureCanvas（产方块贴图处）做垂直翻转，
  // 以抵消旗帜面（顶面投影）对贴图自带的 flipV，使方块与预览方向一致。
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    out[p]     = Math.round(Math.min(255, Math.max(0, r[i])));
    out[p + 1] = Math.round(Math.min(255, Math.max(0, g[i])));
    out[p + 2] = Math.round(Math.min(255, Math.max(0, b[i])));
    out[p + 3] = 255;
  }
  return out;
}

function loomNativeCanvas(baseIdx, layerList) {
  const c = document.createElement('canvas');
  c.width = LOOM_W; c.height = LOOM_H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(LOOM_W, LOOM_H);
  img.data.set(loomRenderPixels(baseIdx, layerList));
  ctx.putImageData(img, 0, 0);
  return c;
}

// 生成可应用为贴图的画布：64×128（均为 2 的幂），避免 WebGL NPOT 兼容性问题。
function loomTextureCanvas(st) {
  const tmp = loomNativeCanvas(st.baseDye, st.layers);
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // 织布机预览与图标保持原方向（由 loomRenderPixels / loomPatternCanvas 决定）。
  // 仅对交给方块的贴图做垂直翻转：抵消旗帜面（顶面投影）对贴图自带的 flipV，
  // 使方块上显示的旗帜与织布机预览方向一致。
  ctx.save();
  ctx.translate(0, c.height);
  ctx.scale(1, -1);
  ctx.drawImage(tmp, 0, 0, c.width, c.height);
  ctx.restore();
  return c;
}

function loomPatternCanvas(name, dye) {
  const mask = LOOM_TEX[name];
  const c = document.createElement('canvas');
  c.width = LOOM_W; c.height = LOOM_H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(LOOM_W, LOOM_H);
  const d = img.data;
  if (mask) {
    // 不翻转：与 loomRenderPixels 保持一致（方向校正只在 loomTextureCanvas 处理）
    for (let i = 0; i < LOOM_W * LOOM_H; i++) {
      const p = i * 4;
      d[p] = dye[0]; d[p + 1] = dye[1]; d[p + 2] = dye[2]; d[p + 3] = mask[i];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function loomShapeToCanvas(code, dye, target, tw, th) {
  const tmp = loomPatternCanvas(code, dye);
  target.width = tw; target.height = th;
  const ctx = target.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, tw, th);
  ctx.drawImage(tmp, 0, 0, tw, th);
}

// ★r37c：色块改为「切角矩形」外观 —— 外层 .bnr-chn 负责切角描边/选中环，
//   内层 <i> 承载实际颜色（两层同一 clip-path，得到沿切角走向的细描边）。
function loomChn(color, sel, title) {
  const c = color || [255, 255, 255];
  const d = document.createElement('div');
  d.className = 'bnr-chn' + (sel ? ' sel' : '');
  const i = document.createElement('i');
  i.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
  d.appendChild(i);
  if (title) d.title = title;
  return d;
}
function loomBuildSwatches(box, selIdx, onPick) {
  box.innerHTML = '';
  LOOM_DYES.forEach((c, i) => {
    const d = loomChn(c, i === selIdx, LOOM_DYE_ZH[LOOM_DYE_NAMES[i]]);
    d.onclick = () => onPick(i);
    box.appendChild(d);
  });
}

let loomPopup = null;
function loomEnsurePopup() {
  if (loomPopup) return loomPopup;
  loomPopup = document.createElement('div');
  loomPopup.className = 'bnr-patpopup';
  loomPopup.style.display = 'none';
  loomPopup.addEventListener('click', e => e.stopPropagation()); // 阻止冒泡到菜单关闭监听
  document.body.appendChild(loomPopup);
  document.addEventListener('click', (e) => {
    // ★r37c：弹窗由「图案选择器」与「颜色选择器」共用 ⇒ 点这两类控件的本体时不要关闭弹窗
    if (loomPopup.style.display !== 'none' &&
        !loomPopup.contains(e.target) &&
        !(e.target.closest && e.target.closest('.bnr-patpicker, .bnr-dyesel'))) {
      loomPopup.style.display = 'none';
    }
  });
  return loomPopup;
}

// ★r37h：弹窗避让 —— 原实现「一律往下弹」（top = min(innerHeight-340, r.bottom+4)）在空间不足时
//   依然会冲出视口 / 压住其它 UI（用户：「完全没有躲避处理，都是往下显示的」）。
//   现统一走本函数：先按可用空间收窄内层列表高度 → 下方放不下则向上翻转 → 最后在视口内夹取。
function loomPlacePopup(popup, btn, innerEl) {
  const pad = 8, vh = window.innerHeight, vw = window.innerWidth;
  const r = btn.getBoundingClientRect();
  const below = vh - pad - (r.bottom + 4);   // 锚点下方的净可用高度
  const above = (r.top - 4) - pad;           // 锚点上方的净可用高度
  if (innerEl) {
    // 内层列表按「较大的一侧」收窄：保留原 320px 上限，但不允许超过实际可用空间
    innerEl.style.maxHeight = Math.max(96, Math.min(320, Math.max(below, above) - 16)) + 'px';
  }
  const ph = popup.offsetHeight, pw = popup.offsetWidth;
  let top;
  if (below >= ph) top = r.bottom + 4;                              // ① 优先锚点下方
  else if (above >= ph) top = r.top - 4 - ph;                       // ② 下方不够 → 向上翻转
  else top = Math.max(pad, Math.min(r.bottom + 4, vh - pad - ph));  // ③ 两侧都不够 → 夹进视口
  let left = r.left;
  if (left + pw > vw - pad) left = r.right - pw;                    // 右侧放不下 → 向左反推
  left = Math.max(pad, Math.min(left, vw - pad - pw));
  popup.style.left = Math.round(left) + 'px';
  popup.style.top = Math.round(Math.max(pad, top)) + 'px';
  // ★r37h-fix：记住锚点与内层列表 —— 窗口被拖拽/缩放、或内容区滚动时要用它重定位
  //   （否则「面板都移动走了，弹窗还留在原地」）
  popup._anchor = btn; popup._inner = innerEl || null;
}

// ★r37h-fix：弹窗跟随锚点重定位 —— 在拖拽/缩放 pointermove、内容区 scroll、窗口 resize 时调用。
//   弹窗挂在 document.body（position:fixed），不会随 .loom-window 移动 ⇒ 必须手动重算。
//   锚点若已脱离文档（例如图层行被重渲染删掉）则直接关闭，不留孤儿弹窗。
function loomRepositionPopup() {
  if (!loomPopup || loomPopup.style.display === 'none') return;
  const a = loomPopup._anchor;
  if (!a || !a.isConnected || (loomPopup._inner && !loomPopup._inner.isConnected)) {
    loomPopup.style.display = 'none';
    return;
  }
  loomPlacePopup(loomPopup, a, loomPopup._inner);
}

function loomBuildPatternPicker(currentPat, currentDye, onChange) {
  const btn = document.createElement('div');
  btn.className = 'bnr-patpicker';
  const thumb = document.createElement('canvas');
  thumb.className = 'bnr-patthumb';
  // ★r37c：行内的独立缩略图已删除 ⇒ 图案选择器自己承担 28×56 的图案预览
  thumb.style.width = '28px'; thumb.style.height = '56px';
  loomShapeToCanvas(currentPat, LOOM_DYES[currentDye], thumb, 28, 56);
  btn.appendChild(thumb);
  btn.onclick = (e) => {
    e.stopPropagation();
    const popup = loomEnsurePopup();
    popup.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'bnr-patgrid';
    grid.style.maxHeight = '320px';
    Object.keys(LOOM_TEX).sort().forEach(name => {
      const cell = document.createElement('div');
      cell.className = 'bnr-patcell' + (name === currentPat ? ' sel' : '');
      cell.title = name;
      const cv = document.createElement('canvas');
      cv.className = 'bnr-patthumb';
      loomShapeToCanvas(name, LOOM_DYES[currentDye], cv, 28, 56);
      cell.appendChild(cv);
      cell.onclick = (ev) => {
        ev.stopPropagation();
        onChange(name);
        loomShapeToCanvas(name, LOOM_DYES[currentDye], thumb, 28, 56);
        popup.style.display = 'none';
      };
      grid.appendChild(cell);
    });
    popup.appendChild(grid);
    popup.style.display = 'block';
    // ★r37h：统一走避让定位（原「一律往下弹」已废）
    loomPlacePopup(popup, btn, grid);
  };
  return btn;
}

// ★★r37c：图层颜色选择器 = 「切角矩形色块 + 中文色名 + ▾」，点击弹出同款色块列表
//   （此前是原生 <select>，只有中文名、没有色块，用户要求「得是中文加颜色色块」）。
//   复用 loomEnsurePopup() 这只共用弹窗承载色块列表。
function loomBuildDyeSelect(selectedDye, onChange) {
  const btn = document.createElement('div');
  btn.className = 'bnr-dyesel';
  btn.appendChild(loomChn(LOOM_DYES[selectedDye], false));
  const name = document.createElement('span');
  name.className = 'bnr-dyesel-name';
  name.textContent = LOOM_DYE_ZH[LOOM_DYE_NAMES[selectedDye]];
  btn.appendChild(name);
  const caret = document.createElement('span');
  caret.className = 'bnr-dyesel-caret';
  caret.textContent = '▾';
  btn.appendChild(caret);
  btn.onclick = (e) => {
    e.stopPropagation();
    const popup = loomEnsurePopup();
    popup.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'bnr-dyelist';
    LOOM_DYES.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'bnr-dyerow' + (i === selectedDye ? ' sel' : '');
      row.appendChild(loomChn(c, false));
      const nm = document.createElement('span');
      nm.textContent = LOOM_DYE_ZH[LOOM_DYE_NAMES[i]];
      row.appendChild(nm);
      row.onclick = (ev) => {
        ev.stopPropagation();
        onChange(i);
        popup.style.display = 'none';
      };
      list.appendChild(row);
    });
    popup.appendChild(list);
    popup.style.display = 'block';
    // ★r37h：统一走避让定位（原「一律往下弹」已废）
    loomPlacePopup(popup, btn, list);
  };
  return btn;
}

