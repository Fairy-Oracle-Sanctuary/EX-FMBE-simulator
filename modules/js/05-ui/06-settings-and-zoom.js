/* 05-ui/06-settings-and-zoom.js · 源 测试版v.6b79.html 第 28082-29089 行 */
'use strict';
/* ★★【2026-10-22 用户要求】浅色灰度体系：一个滑条同时驱动
   ① UI 的「灰白 / 白」撞色层次 ② 3D 渲染区棋盘地面 ③ 3D 清屏底色。
   做法：在 documentElement 上写 --lm-* 变量，浅色模式的各 --bg-* 只引用它们（见 CSS）。 */
function lmHexMix(a, b, t) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    const p = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return '#' + p.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
function lmCss(name, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch (e) { return fallback; }
}
function applyLightGray(level) {
    const t = Math.max(0, Math.min(100, Number(level) || 0)) / 100;
    const root = document.documentElement;
    const set = (n, c) => root.style.setProperty(n, c);
    // ★【2026-10-22 修正】改用中性灰（原先偏冷蓝，灰白配看起来发脏、不自然）。
    // 层次固定为 4 级：卡片白 → 面板浅灰 → 输入/代码面灰 → 头部/栏带灰，级差 8~12，靠 1px 描边收边。
    set('--lm-body',   lmHexMix('#efeff1', '#dcdce0', t));  // 页面底
    set('--lm-alt',    lmHexMix('#e6e6e9', '#d7d7db', t));  // 栏带/左列/导航
    set('--lm-panel',  lmHexMix('#f9f9fa', '#e9e9ec', t));  // 面板/浮窗面
    set('--lm-card',   lmHexMix('#ffffff', '#f8f8f9', t));  // 正文卡片
    set('--lm-head',   lmHexMix('#ececee', '#dfdfe2', t));  // 头部/工具行
    set('--lm-input',  lmHexMix('#f4f4f5', '#e6e6e9', t));  // 输入框
    set('--lm-border', lmHexMix('#dcdce0', '#b8b8be', t));  // 描边
    set('--lm-btn2',   lmHexMix('#e8e8eb', '#d8d8dc', t));
    set('--lm-editor', lmHexMix('#f0f0f2', '#e2e2e5', t));  // Molang 代码面
    // 关键帧时间轴的 UI 棋盘：一格白、一格灰；灰度越大，灰格越深
    set('--lm-grid-a', lmHexMix('#ffffff', '#fbfbfc', t));
    set('--lm-grid-b', lmHexMix('#f3f3f5', '#e3e3e7', t));
}
function setLightGray(level) {
    const p = Math.max(0, Math.min(100, Number(level) || 0));
    applyLightGray(p);
    const label = document.getElementById('lightGrayValueLabel');
    if (label) label.textContent = p + '%';
    const range = document.getElementById('lightGrayRange');
    if (range && Number(range.value) !== p) range.value = String(p);
    try { localStorage.setItem('ui_light_gray', String(p)); } catch (e) {}
}
try {
    const savedLG = parseInt(localStorage.getItem('ui_light_gray') || '55', 10);
    setLightGray(isNaN(savedLG) ? 55 : savedLG);
} catch (e) { setLightGray(55); }
const lightGrayRangeEl = document.getElementById('lightGrayRange');
if (lightGrayRangeEl) {
    lightGrayRangeEl.addEventListener('input', (e) => { setLightGray(e.target.value); });
}

// 隐藏原有工具栏按钮，使用设置面板内开关
const modeBtn = document.getElementById('modeSwitchBtn');
if (modeBtn) modeBtn.style.display = 'none';

// 创建或确保 canvas 背景 overlay 与 toolbar 背景 overlay
function ensureOverlays() {
    const container = document.getElementById('canvas-container');
    if (container) {
        let cbg = document.getElementById('canvasBgOverlay');
        if (!cbg) {
            cbg = document.createElement('div');
            cbg.id = 'canvasBgOverlay';
            document.body.insertBefore(cbg, container);
            cbg.style.position = 'fixed';
            cbg.style.left = '0';
            cbg.style.top = '0';
            cbg.style.right = '0';
            cbg.style.bottom = '0';
            cbg.style.pointerEvents = 'none';
            cbg.style.zIndex = '0';
            cbg.style.backgroundRepeat = 'no-repeat';
            cbg.style.backgroundSize = 'cover';
            cbg.style.backgroundPosition = 'center';
            cbg.style.backgroundImage = document.body.style.backgroundImage || '';
            cbg.style.backgroundColor = document.body.style.backgroundColor || '#030617';
            cbg.style.opacity = isLightMode ? '1' : '0';
        }
    }
    // toolbar overlays
    ['.toolbar-integrated', '.top-bar'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            if (!el.querySelector('.toolbar-bg-overlay')) {
                const ov = document.createElement('div');
                ov.className = 'toolbar-bg-overlay';
                ov.style.position = 'absolute';
                ov.style.left = '0';
                ov.style.top = '0';
                ov.style.right = '0';
                ov.style.bottom = '0';
                ov.style.pointerEvents = 'none';
                ov.style.zIndex = '0';
                ov.style.background = window.getComputedStyle(el).background || '';
                ov.style.backgroundSize = 'cover';
                ov.style.backgroundPosition = 'center';
                ov.style.opacity = isLightMode ? '1' : '0';
                el.insertBefore(ov, el.firstChild);
                el.style.position = el.style.position || 'relative';
            }
        });
    });
}
ensureOverlays();

function setGrayscale(percent) {
    const p = Math.max(0, Math.min(100, Number(percent)||0));
    ensureOverlays();
    const canvasBg = document.getElementById('canvasBgOverlay');
    const dataPanel = document.getElementById('dataPanel');

    // 深色模式：滑块保持可见但禁用（显示为黑色圆点），灰度不生效
    if (!isLightMode) {
        if (grayscaleRange) { grayscaleRange.disabled = true; grayscaleRange.classList.add('grayscale-disabled'); }
        if (canvasBg) canvasBg.style.filter = '';
        if (dataPanel) {
            const bg = document.getElementById('dataPanelBgOverlay'); if (bg) bg.style.background = '';
        }
        document.documentElement.style.setProperty('--modal-bg-grayscale', '#162136');
        if (grayscaleLabel) {
            const saved = parseInt(localStorage.getItem('ui_grayscale') || '0', 10);
            grayscaleLabel.textContent = (isNaN(saved) ? 0 : saved) + '%';
        }
        return;
    }

    // 浅色模式：启用滑块
    if (grayscaleRange) { grayscaleRange.disabled = false; grayscaleRange.classList.remove('grayscale-disabled'); }

    // Canvas 背景 overlay 应用灰度（不影响 WebGL canvas 内对象）
    if (canvasBg) canvasBg.style.filter = p ? `grayscale(${p}%)` : '';

    // data panel 背景覆盖强度
    if (dataPanel) {
        let bg = document.getElementById('dataPanelBgOverlay');
        if (!bg) {
            bg = document.createElement('div'); bg.id = 'dataPanelBgOverlay'; bg.style.position = 'absolute'; bg.style.left = '0'; bg.style.top = '0'; bg.style.right = '0'; bg.style.bottom = '0'; bg.style.pointerEvents = 'none'; bg.style.zIndex = '0'; dataPanel.style.position = dataPanel.style.position || 'fixed'; dataPanel.insertBefore(bg, dataPanel.firstChild); const content = dataPanel.querySelector('.panel-content'); if (content) content.style.position = 'relative';
        }
        const alpha = (p/100) * 0.8;
        bg.style.background = `rgba(128,128,128,${alpha})`;
        bg.style.opacity = p > 0 ? '1' : '0';
    }

    // 弹窗灰度：限制为最多 20%
    const pModal = Math.min(p, 20);
    const grayRgb = 220 - Math.round((pModal/100) * 180);
    document.documentElement.style.setProperty('--modal-bg-grayscale', `rgba(${grayRgb},${grayRgb},${grayRgb},0.92)`);

    // 工具栏背景 overlay（允许最高 100%）
    document.querySelectorAll('.toolbar-integrated, .top-bar').forEach(el => {
        const ov = el.querySelector('.toolbar-bg-overlay');
        if (ov) ov.style.filter = p ? `grayscale(${p}%)` : '';
    });

    if (grayscaleLabel) grayscaleLabel.textContent = p + '%';
    try { localStorage.setItem('ui_grayscale', String(p)); } catch (e) {}
}

// 初始化值
try {
    const saved = parseInt(localStorage.getItem('ui_grayscale') || '0', 10);
    if (grayscaleRange) { grayscaleRange.value = isNaN(saved) ? 0 : saved; }
    setGrayscale(isNaN(saved) ? 0 : saved);
} catch (e) {}

if (grayscaleRange) {
    grayscaleRange.addEventListener('input', (e) => { setGrayscale(e.target.value); });
}

// ========== 折叠按钮大小设置 ==========
let collapseBtnSize = 14;
const collapseBtnSizeRange = document.getElementById('collapseBtnSizeRange');
const collapseBtnSizeLabel = document.getElementById('collapseBtnSizeLabel');

function applyCollapseBtnSize() {
    document.documentElement.style.setProperty('--collapse-btn-size', collapseBtnSize + 'px');
    if (collapseBtnSizeLabel) collapseBtnSizeLabel.textContent = collapseBtnSize + 'px';
    if (collapseBtnSizeRange) collapseBtnSizeRange.value = collapseBtnSize;
    try { localStorage.setItem('ui_collapse_btn_size', String(collapseBtnSize)); } catch (e) {}
}

try {
    const saved = parseInt(localStorage.getItem('ui_collapse_btn_size') || '14', 10);
    if (!isNaN(saved) && saved >= 10 && saved <= 30) {
        collapseBtnSize = saved;
    }
} catch (e) {}
applyCollapseBtnSize();

if (collapseBtnSizeRange) {
    collapseBtnSizeRange.addEventListener('input', (e) => {
        collapseBtnSize = parseInt(e.target.value) || 14;
        applyCollapseBtnSize();
    });
}

// ========== UI缩放设置 ==========
let uiScale = 100;
let uiScaleBeforeChange = 100;
let uiScaleRevertTimer = null;
let uiScaleRevertCountdown = 10;
let uiScaleRafId = null;
const uiScaleRange = document.getElementById('uiScaleRange');
const uiScaleLabel = document.getElementById('uiScaleLabel');
const uiScaleRevert = document.getElementById('uiScaleRevert');
const uiScaleRevertTimerEl = document.getElementById('uiScaleRevertTimer');
const uiScaleRevertBtn = document.getElementById('uiScaleRevertBtn');

// UI 缩放吸附点：拖动到这些常用比例附近会「磁性吸附」，但仍可自由滑到任意比例（整体连续，不被离散卡死）
const UI_SCALE_MIN = 50, UI_SCALE_MAX = 200;
const UI_SCALE_SNAPS = [50, 75, 100, 125, 150, 175, 200];
const UI_SCALE_SNAP_THRESHOLD = 3; // 拖动中距离吸附点 ≤3 个百分点即磁吸到该点
const uiScaleTicks = document.getElementById('uiScaleTicks');
function nearestUiScaleSnap(v) {
    let best = UI_SCALE_SNAPS[0], bestD = Math.abs(v - best);
    for (const s of UI_SCALE_SNAPS) { const d = Math.abs(v - s); if (d < bestD) { bestD = d; best = s; } }
    return bestD <= UI_SCALE_SNAP_THRESHOLD ? best : null;
}
function buildUiScaleTicks() {
    if (!uiScaleTicks) return;
    uiScaleTicks.style.padding = '0 8px';
    uiScaleTicks.style.boxSizing = 'border-box';
    uiScaleTicks.innerHTML = '';
    UI_SCALE_SNAPS.forEach(v => {
        const pct = (v - UI_SCALE_MIN) / (UI_SCALE_MAX - UI_SCALE_MIN) * 100;
        const tick = document.createElement('div');
        tick.style.cssText = 'position:absolute; left:' + pct.toFixed(3) + '%; top:0; transform:translateX(-50%); cursor:pointer; text-align:center; user-select:none;';
        tick.title = '吸附到 ' + v + '%';
        tick.innerHTML = '<div style="width:2px;height:7px;margin:0 auto;border-radius:1px;background:rgba(148,163,184,.75);"></div>'
                       + '<div style="font-size:9px;line-height:1.05;color:#94a3b8;margin-top:2px;">' + v + '%</div>';
        tick.addEventListener('click', () => {
            uiScale = v;
            applyUIScale();
            if (v !== uiScaleBeforeChange) { uiScaleBeforeChange = v; startUIScaleRevert(); }
        });
        uiScaleTicks.appendChild(tick);
    });
}
buildUiScaleTicks();

// 当前 UI 缩放系数（1 = 100%）
function getUiZoom() { return ((typeof uiScale === 'number' ? uiScale : 100) / 100) || 1; }

// 把所有「挂在 body 上、逃过 uiScaleTarget 缩放」的覆盖层同步到当前缩放。
// 这些弹窗原本用 position:fixed 直接挂 body，不会继承 uiScaleTarget 的 zoom，导致 UI 缩放对它们无效。
// 注意：modal 全屏遮罩本身不缩放（否则遮罩缩回露边），只缩放内部卡片；
// 设置面板 / 关键帧窗口是居中或显式定位，直接缩放自身即可（缩放围绕自身中心，位置不变）。
function syncOverlayZoom() {
    const z = getUiZoom();
    // 设置面板 / 关键帧窗口是挂在 body 上、逃过 #uiScaleTarget 缩放的覆盖层，靠 zoom 跟随 UI 比例。
    // 但直接 zoom 会把视口单位(vh/vw)约束也放大 → 高比例时面板尺寸超过视口、标题/关闭按钮与底部被裁到屏外。
    // 故在 zoom 之外，再用内联尺寸把【渲染后】大小钳制回视口。
    const sp = document.getElementById('uiSettingsPanel');
    const isFullScreen = window.innerWidth <= 820 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (sp) {
        sp.style.zoom = z;
        if (isFullScreen) {
            // 全屏模式：渲染后正好 100% 视口，避免 zoom 后超出屏幕
            sp.style.width = (100 / z).toFixed(3) + '%';
            sp.style.height = (100 / z).toFixed(3) + '%';
            sp.style.maxWidth = (100 / z).toFixed(3) + '%';
            sp.style.maxHeight = (100 / z).toFixed(3) + '%';
        } else {
            // 桌面弹窗：让面板布局宽随 UI 缩放放大（600px 不除 z），仅当【渲染后】即将超出视口时才收小，
            // 避免旧写法 600/z 在缩放下反比缩小面板、把双列网格里的「当前项目」输入框挤压到 20px 而截断文字。
            const capVH = Math.min(86, 96 / z); // 渲染高度上限 96vh，自然高度 86vh
            sp.style.maxHeight = capVH.toFixed(3) + 'vh';
            sp.style.width = 'min(600px, ' + Math.round(window.innerWidth / z) + 'px)';
            // 清除全屏模式可能留下的尺寸
            sp.style.height = '';
            sp.style.maxWidth = '';
            sp.style.maxWidth = Math.round(window.innerWidth / z) + 'px';
        }
    }
    const capV = 96 / z;
    const kw = document.getElementById('keyframeWindow');
    if (kw) {
        kw.style.zoom = z;
        kw.style.maxWidth = capV.toFixed(3) + 'vw';
        kw.style.maxHeight = capV.toFixed(3) + 'vh';
    }
    document.querySelectorAll('.modal .modal-content, .keyframe-import-modal .keyframe-import-content').forEach(c => { c.style.zoom = z; });
}

function applyUIScale() {
    const target = document.getElementById('uiScaleTarget');
    if (target) target.style.zoom = (uiScale / 100);
    syncOverlayZoom();
    try { tutSyncScale(); } catch (e) {}   // 教程卡片同步 UI 缩放（封顶，见 tutSyncScale）
    if (uiScaleLabel) uiScaleLabel.textContent = uiScale + '%';
    if (uiScaleRange) uiScaleRange.value = uiScale;
    try { localStorage.setItem('ui_scale', String(uiScale)); } catch (e) {}
    // 缩放改变后重定位底部拖拽条（其 top 已按 zoom 还原），避免错位
    if (typeof updateSideListResizeHandle === 'function') updateSideListResizeHandle();
}

// 自动给新出现的弹窗卡片打上当前缩放，使「缩放后新打开」的导入/导出等弹窗也生效
// （挂在 body 上的 .modal / .keyframe-import-modal 直接子节点；设置面板与关键帧窗口由 syncOverlayZoom 处理）
try {
    const uiZoomObserver = new MutationObserver((mutations) => {
        const z = getUiZoom();
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.classList && (node.classList.contains('modal') || node.classList.contains('keyframe-import-modal'))) {
                    node.querySelectorAll('.modal-content, .keyframe-import-content').forEach(c => { c.style.zoom = z; });
                }
            }
        }
    });
    uiZoomObserver.observe(document.body, { childList: true });
} catch (e) {}

function startUIScaleRevert() {
    if (uiScaleRevertTimer) clearInterval(uiScaleRevertTimer);
    uiScaleRevertCountdown = 10;
    if (uiScaleRevert) uiScaleRevert.style.display = 'flex';
    if (uiScaleRevertTimerEl) uiScaleRevertTimerEl.textContent = '(' + uiScaleRevertCountdown + 's)';
    uiScaleRevertTimer = setInterval(() => {
        uiScaleRevertCountdown--;
        if (uiScaleRevertCountdown <= 0) {
            clearInterval(uiScaleRevertTimer);
            uiScaleRevertTimer = null;
            if (uiScaleRevert) uiScaleRevert.style.display = 'none';
        }
        if (uiScaleRevertTimerEl) uiScaleRevertTimerEl.textContent = uiScaleRevertCountdown > 0 ? '(' + uiScaleRevertCountdown + 's)' : '';
    }, 1000);
}

function doUIScaleRevert() {
    uiScale = uiScaleBeforeChange;
    applyUIScale();
    if (uiScaleRevertTimer) { clearInterval(uiScaleRevertTimer); uiScaleRevertTimer = null; }
    if (uiScaleRevert) uiScaleRevert.style.display = 'none';
}

// Ctrl+Shift+0 全局快捷键恢复 100%
// ⚠ 必须用 e.code === 'Digit0'：按住 Shift 时主键盘 0 的 e.key 会变成 ')'（美式布局），
//   用 e.key === '0' 判断会永远不成立 → 快捷键失效（实测 e.key=')' / e.code='Digit0'）。
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.code === 'Digit0' || e.code === 'Numpad0' || e.key === '0')) {
        e.preventDefault();
        uiScale = 100;
        uiScaleBeforeChange = 100;
        applyUIScale();
        if (uiScaleRevertTimer) { clearInterval(uiScaleRevertTimer); uiScaleRevertTimer = null; }
        if (uiScaleRevert) uiScaleRevert.style.display = 'none';
    }
    // ★ 快捷键打开 / 收起设置面板：Alt+S（Setting）。输入框/文本域内不劫持。
    if (e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        const t = e.target;
        const isTyping = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
        if (isTyping) return;
        e.preventDefault();
        e.stopPropagation(); // 阻止冒泡到 window 的快捷键处理器，避免 Alt+S 同时触发新布局的「S = 缩放」
        toggleUISettingsPanel();
        return;
    }
    // ★ 快捷键切换操作模式：Alt+N = 新操作模式；Alt+O / Ctrl+O = 旧操作模式。
    //   ⚠️ 不用 Ctrl+N：那是浏览器硬保留的「新建窗口」快捷键，网页端 preventDefault 拦不住
    //   （Chrome/Edge 的 Ctrl+T/N/W 系列均如此），用户实测按 Ctrl+N 仍弹新页面，故新模式改用 Alt+N。
    //   Ctrl+O（打开文件）可以被页面拦截，作为旧模式的附加快捷键保留。
    //   在输入框/文本域/可编辑元素里不劫持按键（避免打字时误触发）。
    if ((e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === 'n' || e.key === 'N' || e.key === 'o' || e.key === 'O'))
        || (e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'o' || e.key === 'O'))) {
        const t = e.target;
        const isTyping = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
        if (isTyping) return;
        e.preventDefault();
        setNewLayoutMode(e.key.toLowerCase() === 'n', e);
    }
});

if (uiScaleRevertBtn) {
    uiScaleRevertBtn.addEventListener('click', doUIScaleRevert);
}

try {
    const saved = parseInt(localStorage.getItem('ui_scale') || '100', 10);
    if (!isNaN(saved) && saved >= UI_SCALE_MIN && saved <= UI_SCALE_MAX) {
        uiScale = saved;
        uiScaleBeforeChange = saved;
    }
} catch (e) {}
applyUIScale();

if (uiScaleRange) {
    // 拖动时实时预览（rAF 节流，画布不受影响无闪烁）
    uiScaleRange.addEventListener('input', (e) => {
        let v = parseInt(e.target.value) || 100;
        const snap = nearestUiScaleSnap(v);
        if (snap !== null) { v = snap; if (uiScaleRange) uiScaleRange.value = v; }
        uiScale = v;
        if (uiScaleLabel) uiScaleLabel.textContent = uiScale + '%';
        if (!uiScaleRafId) {
                uiScaleRafId = requestAnimationFrame(() => {
                    uiScaleRafId = null;
                    const target = document.getElementById('uiScaleTarget');
                    if (target) target.style.zoom = (uiScale / 100);
                    syncOverlayZoom();
                    if (typeof updateSideListResizeHandle === 'function') updateSideListResizeHandle();
                    // ★ 教程卡片跟随 UI 缩放：拖动滑块时 applyUIScale 不会被调用，
                    //   必须在这里同步 --tut-ui，否则实时拖动对教程卡片「无效」（只有点吸附点才生效）。
                    if (typeof tutSyncScale === 'function') { try { tutSyncScale(); } catch (e) {} }
                });
        }
    });
    // 松手时保存并弹出撤销
    uiScaleRange.addEventListener('change', (e) => {
        const newVal = parseInt(e.target.value) || 100;
        if (newVal === uiScaleBeforeChange) return;
        uiScaleBeforeChange = newVal;
        try { localStorage.setItem('ui_scale', String(uiScale)); } catch (e) {}
        startUIScaleRevert();
    });
}

if (themeCheckbox) {
    themeCheckbox.setAttribute('aria-pressed', String(isLightMode));
    themeCheckbox.classList.toggle('checked', isLightMode);
    // 点击切换样式（使用 .checked class）
    themeCheckbox.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const now = !document.body.classList.contains('light-mode');
        isLightMode = now;
        applyTheme();
        themeCheckbox.classList.toggle('checked', now);
        themeCheckbox.setAttribute('aria-pressed', String(now));
        try { localStorage.setItem('ui_light_mode', now ? '1' : '0'); } catch(e){}
    });
}

// 恢复上次主题偏好
try {
    const lastLight = localStorage.getItem('ui_light_mode');
    if (lastLight !== null) {
        isLightMode = lastLight === '1';
        applyTheme();
        if (themeCheckbox) {
            themeCheckbox.classList.toggle('checked', isLightMode);
            themeCheckbox.setAttribute('aria-pressed', String(isLightMode));
        }
    }
} catch (e) {}

if (uiSettingsBtn) {
    uiSettingsBtn.addEventListener('click', toggleUISettingsPanel);
}
if (blockListCheckbox) {
    blockListCheckbox.addEventListener('click', toggleBlockListPosition);
}
if (sidePanelCheckbox) {
    sidePanelCheckbox.addEventListener('click', toggleSidePanelMode);
}
if (sidePanelWidthRange) {
    sidePanelWidthRange.addEventListener('input', (e) => { setSidePanelWidth(e.target.value); });
    /* ★【2026-10-17 用户报障】拖拽过程中只改宽度不重建（见 setSidePanelWidth）；松手时
       整体重建一次，让 molang 编辑器高度与只读数值表在新宽度下重新落定（一次，不抖动）。 */
    sidePanelWidthRange.addEventListener('change', () => { if (selectedBlock) renderVariablesForBlock(selectedBlock); });
    /* ★滑杆上限必须跟随视口（用户要求侧边最多占屏宽 80%）：
       写死 max="880" 会让 1920 屏滑杆最多只能拉到 46%。这里在初始化与 resize 时同步 max，
       并把「滑杆可拉满到 80%」作为唯一真相源（避免 HTML 静态值与 JS 钳制值不一致）。 */
    sidePanelWidthRange.max = String(maxSidePanelWidth());
}
// 新布局复选框
const newLayoutCheckbox = document.getElementById('newLayoutCheckbox');
if (newLayoutCheckbox) {
    newLayoutCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNewLayoutMode(e);
    });
}
// 世界轴位移复选框
const worldAxisDispCheckbox = document.getElementById('worldAxisDispCheckbox');
function updateWorldAxisCheckboxUI() {
    if (!worldAxisDispCheckbox) return;
    worldAxisDispCheckbox.classList.toggle('checked', useWorldAxisDisplacement);
    worldAxisDispCheckbox.setAttribute('aria-pressed', String(useWorldAxisDisplacement));
}
if (worldAxisDispCheckbox) {
    worldAxisDispCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        useWorldAxisDisplacement = !useWorldAxisDisplacement;
        userWorldAxisPref = useWorldAxisDisplacement;   // 用户手动操作：更新真实偏好
        worldAxisDispForced = false;                    // 用户接管，取消强制态
        updateWorldAxisCheckboxUI();
        try { localStorage.setItem('ui_world_axis_disp', useWorldAxisDisplacement ? '1' : '0'); } catch (e) {}
        if (selectedBlock || selectedBlocksSet.size) {
            requestGizmoRefresh();
            updateToolbar(true);
        }
    });
}
// 多选 + 位移模式：强制临时开启世界轴位移；其余情况恢复用户偏好。
// 目的：多选方块在局部坐标轴下位移会导致各块朝不同方向飞散，世界轴位移才是正确行为。
function syncWorldAxisForMultiSelect() {
    const multi = selectedBlocksSet.size > 1;
    const baseMode = herModes.has('base');
    const shouldForce = multi && baseMode;
    if (shouldForce) {
        if (!useWorldAxisDisplacement) {
            useWorldAxisDisplacement = true;
            worldAxisDispForced = true;
            updateWorldAxisCheckboxUI();
            requestGizmoRefresh();
        }
    } else {
        if (worldAxisDispForced) {
            useWorldAxisDisplacement = userWorldAxisPref; // 恢复用户偏好
            worldAxisDispForced = false;
            updateWorldAxisCheckboxUI();
            requestGizmoRefresh();
        }
    }
}
// 枢轴联动模型复选框
const pivotLinkCheckbox = document.getElementById('pivotLinkCheckbox');
if (pivotLinkCheckbox) {
    pivotLinkCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        pivotLinkModel = !pivotLinkModel;
        pivotLinkCheckbox.classList.toggle('checked', pivotLinkModel);
        pivotLinkCheckbox.setAttribute('aria-pressed', String(pivotLinkModel));
        try { localStorage.setItem('ui_pivot_link_model', pivotLinkModel ? '1' : '0'); } catch (e) {}
    });
}
// 关闭旗杆顶点捕捉复选框（顶点捕捉只取旗面顶点，旗杆两段的顶点不显示）
const flagPoleSnapCheckbox = document.getElementById('flagPoleSnapCheckbox');
if (flagPoleSnapCheckbox) {
    flagPoleSnapCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        flagPoleSnapOff = !flagPoleSnapOff;
        flagPoleSnapCheckbox.classList.toggle('checked', flagPoleSnapOff);
        flagPoleSnapCheckbox.setAttribute('aria-pressed', String(flagPoleSnapOff));
        try { localStorage.setItem('ui_flagpole_snap_off', flagPoleSnapOff ? '1' : '0'); } catch (e) {}
        // 顶点捕捉进行中切开关：立即重建候选点并重绘，旗杆顶点当帧消失 / 恢复
        if (vtxSnapPhase) { vtxSnapBuildCands(); vtxSnapRender(); }
    });
}
// Gizmo 子控件记忆复选框：开启后记住上次使用的 Gizmo 子控件及子选项，打开其他项目时自动回填
const gizmoSubMemoryCheckbox = document.getElementById('gizmoSubMemoryCheckbox');
if (gizmoSubMemoryCheckbox) {
    gizmoSubMemoryCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        const on = !gizmoSubMemoryOn();
        try { localStorage.setItem('ui_gizmo_sub_memory', on ? '1' : '0'); } catch (err) {}
        gizmoSubMemoryCheckbox.classList.toggle('checked', on);
        gizmoSubMemoryCheckbox.setAttribute('aria-pressed', String(on));
        // 开启瞬间把当前已激活的子控件记为「上次使用」，否则沿用已有记录
        if (on) {
            const cur = [...herModes].find(m => m !== 'mirror');
            if (cur) gizmoSubMemorySave(cur);
            else { const o = gizmoSubMemoryLoad(); if (o && o.vtx) { vtxSnapMoveType = o.vtx; vtxSnapUpdateBtnTitle(); } }
        }
    });
}
// 骨骼自动烘焙复选框
const autoBakeBoneCheckbox = document.getElementById('autoBakeBoneCheckbox');
if (autoBakeBoneCheckbox) {
    autoBakeBoneCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        autoBakeBone = !autoBakeBone;
        autoBakeBoneCheckbox.classList.toggle('checked', autoBakeBone);
        autoBakeBoneCheckbox.setAttribute('aria-pressed', String(autoBakeBone));
        try { localStorage.setItem('ui_auto_bake_bone', autoBakeBone ? '1' : '0'); } catch (e) {}
    });
}
// 渲染局部坐标系复选框
const localAxesCheckbox = document.getElementById('localAxesCheckbox');
if (localAxesCheckbox) {
    localAxesCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        showLocalAxes = !showLocalAxes;
        localAxesCheckbox.classList.toggle('checked', showLocalAxes);
        localAxesCheckbox.setAttribute('aria-pressed', String(showLocalAxes));
        try { localStorage.setItem('ui_show_local_axes', showLocalAxes ? '1' : '0'); } catch (e) {}
        // 立即更新所有方块的坐标轴可见性
        updateAxesVisibility();
        if (selectedBlock || selectedBlocksSet.size) {
            requestGizmoRefresh();
            updateToolbar(true);
        }
    });
}

// 关闭basepos局部位移轴显示：父开关 + 展开 XYZ 分轴独立控制
const baseposAxisCheckbox = document.getElementById('baseposAxisCheckbox');
const baseposAxisXCheckbox = document.getElementById('baseposAxisXCheckbox');
const baseposAxisYCheckbox = document.getElementById('baseposAxisYCheckbox');
const baseposAxisZCheckbox = document.getElementById('baseposAxisZCheckbox');
// 依据当前状态同步父/子复选框与子项展开（checked=关闭/隐藏）
function refreshBaseposAxisUI() {
    if (baseposAxisCheckbox) {
        baseposAxisCheckbox.classList.toggle('checked', !showBaseposAxis); // 父：勾选=关闭
        baseposAxisCheckbox.setAttribute('aria-pressed', String(!showBaseposAxis));
    }
    const subs = document.getElementById('baseposAxisSubs');
    if (subs) subs.style.display = showBaseposAxis ? 'none' : 'flex'; // 仅父勾选(关闭)时展开
    const map = [['x', baseposAxisXCheckbox], ['y', baseposAxisYCheckbox], ['z', baseposAxisZCheckbox]];
    map.forEach(([k, cb]) => {
        if (cb) { cb.classList.toggle('checked', baseposAxisHide[k]); cb.setAttribute('aria-pressed', String(baseposAxisHide[k])); }
    });
}
function persistBaseposAxis() {
    try {
        localStorage.setItem('ui_show_basepos_axis', showBaseposAxis ? '1' : '0');
        localStorage.setItem('ui_basepos_axis_hide_x', baseposAxisHide.x ? '1' : '0');
        localStorage.setItem('ui_basepos_axis_hide_y', baseposAxisHide.y ? '1' : '0');
        localStorage.setItem('ui_basepos_axis_hide_z', baseposAxisHide.z ? '1' : '0');
    } catch (e) {}
}
function applyBaseposAxisVisibility() {
    updateAxesVisibility();
    if (selectedBlock || selectedBlocksSet.size) { requestGizmoRefresh(); updateToolbar(true); }
}
// 用捕获阶段事件委托绑定父/子开关：比单个 addEventListener 更稳，避免子元素被替换或冒泡被吞导致点不动
function handleBaseposAxisClick(e) {
    const t = e.target;
    if (t.id === 'baseposAxisCheckbox') {
        e.stopPropagation();
        showBaseposAxis = !showBaseposAxis;   // 勾选=关闭(隐藏)方块自身坐标轴
        // 取消/重新开启均复位为全耦合（三轴均隐藏），保证“再开启依然是三轴耦合打钩”
        baseposAxisHide = { x: true, y: true, z: true };
        refreshBaseposAxisUI();
        persistBaseposAxis();
        applyBaseposAxisVisibility();
    } else if (t.id === 'baseposAxisXCheckbox' || t.id === 'baseposAxisYCheckbox' || t.id === 'baseposAxisZCheckbox') {
        e.stopPropagation();
        const key = t.id === 'baseposAxisXCheckbox' ? 'x' : t.id === 'baseposAxisYCheckbox' ? 'y' : 'z';
        baseposAxisHide[key] = !baseposAxisHide[key];  // 勾选=隐藏该轴
        // 三轴都不隐藏 ⇒ 等效于未关闭，自动取消父开关
        if (!baseposAxisHide.x && !baseposAxisHide.y && !baseposAxisHide.z) showBaseposAxis = true;
        refreshBaseposAxisUI();
        persistBaseposAxis();
        applyBaseposAxisVisibility();
    }
}
if (uiSettingsPanel) {
    uiSettingsPanel.addEventListener('click', handleBaseposAxisClick, true); // capture phase
}

// 控件精度设置：四档步长输入框（无按键 / Shift / Ctrl / Shift+Ctrl）
const GIZMO_PREC_INPUTS = [
    ['none', 'gpNoneInput'],
    ['shift', 'gpShiftInput'],
    ['ctrl', 'gpCtrlInput'],
    ['shiftCtrl', 'gpShiftCtrlInput'],
];
// 仅接受非负纯数字。空串 / "0." / "1e" 这类输入中间态不提交，否则每次按键都夹紧会打断输入。
const GIZMO_PREC_RE = /^\s*(?:\d+\.?\d*|\.\d+)\s*$/;
function syncGizmoPrecInputs() {
    GIZMO_PREC_INPUTS.forEach(([key, id]) => {
        const input = document.getElementById(id);
        if (input) input.value = String(gizmoPrecision[key]);
    });
}
GIZMO_PREC_INPUTS.forEach(([key, id]) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => {
        if (!GIZMO_PREC_RE.test(input.value)) return;
        const v = parseFloat(input.value);
        if (!Number.isFinite(v) || v < 0) return;
        gizmoPrecision[key] = v;
        try { localStorage.setItem(GIZMO_PREC_KEYS[key], String(v)); } catch (e) {}
    });
    // 失焦时把输入框归一到当前生效值（清掉 "0." 之类的中间态）
    input.addEventListener('blur', () => { input.value = String(gizmoPrecision[key]); });
});
syncGizmoPrecInputs();

const queryUpdateCheckbox = document.getElementById('queryUpdateCheckbox');
if (queryUpdateCheckbox) {
    queryUpdateCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        _queryUpdateEnabled = !_queryUpdateEnabled;
        queryUpdateCheckbox.classList.toggle('checked', _queryUpdateEnabled);
        queryUpdateCheckbox.setAttribute('aria-pressed', String(_queryUpdateEnabled));
        try { localStorage.setItem('ui_query_func_update', _queryUpdateEnabled ? '1' : '0'); } catch (e) {}
        if (_queryUpdateEnabled) {
            // 重新开启：清空冻结缓存并立即刷新所有使用了 q. 的方块
            for (const k in _queryCache) delete _queryCache[k];
            _cameraExprDirty = true;
        }
    });
}
if (uiSettingsPanel) {
    uiSettingsPanel.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// molang 接管：仅对当前选中方块（支持多选）生效，不可逆，开启前警告
const molangTakeoverBtn = document.getElementById('molangTakeoverBtn');
if (molangTakeoverBtn) {
    molangTakeoverBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targets = selectedBlocksSet.size ? Array.from(selectedBlocksSet) : (selectedBlock ? [selectedBlock] : []);
        if (!targets.length) { showModal('提示', '请先选中至少一个方块，再开启 molang 接管。', null, false); return; }
        const allTaken = targets.every(b => b.scope.molangMode);
        if (allTaken) { showModal('提示', '所选方块均已处于 molang 接管模式，无需重复开启。', null, false); return; }
        const names = targets.map(b => b.id).join('、');
        // 先收起设置面板（其 inline z-index 为 9999，若不收起会遮挡警告弹窗），保证警告以大弹窗形式完整显示
        if (uiSettingsPanel) uiSettingsPanel.style.display = 'none';
        showModal('确认开启 molang 接管',
            `即将对【${names}】启用 <b>molang 表达式完全接管</b>。<br><br>⚠️ <b>此操作不可逆</b>：开启后该方块将脱离普通变量卡片，由 molang 脚本完全控制，且会自动按当前数值生成一段 molang 基线指令。<br><br>确定要继续吗？`,
            () => {
                targets.forEach(b => {
                    if (b.scope.molangMode) return;
                    // 有关键帧动画的方块：用关键帧指令（含 q.anim_time 驱动 + lerp 插值）作为 molang 程序
                    if (hasKeyframeAnimation(b.id)) {
                        b.scope.program = getKeyframeCommandText(b.id, true) || generateMolangBaseline(b);
                    } else {
                        b.scope.program = generateMolangBaseline(b);
                    }
                    b.scope.molangMode = true;
                    // 每次新开 molang 模式清除"用户已手动编辑"标记，
                    // 让关键帧变化 → 程序自动重新生成的链路恢复工作
                    b.scope.molangEditedByUser = false;
                    // 关键帧程序首次执行：先在 time=0 下初始化所有变量（start_/T/seg_time/dur），再按当前时间执行。
                    // 否则当 keyframeCurrentTime≠0 时，首帧初始化块被跳过，变量未定义导致程序抛错、方块冻结。
                    if (hasKeyframeAnimation(b.id) && keyframeCurrentTime !== 0) {
                        const _savedTime = keyframeCurrentTime;
                        keyframeCurrentTime = 0;
                        b.refresh(); // 首帧初始化：执行 v.<id>_time==0?() 块
                        keyframeCurrentTime = _savedTime;
                    }
                    b.refresh(); // 按当前时间执行（变量已从首帧继承）
                });
                // 接管是破坏性切换：必须立即落账，否则 200ms 内 Ctrl+Z 会因 recordAction 防抖竞态而失效
                flushPendingRecords(); history.record(getState());
                if (selectedBlock) renderVariablesForBlock(selectedBlock);
                // 关闭设置面板，避免其遮挡已切换为 molang 只读数值的变量区
                if (uiSettingsPanel) uiSettingsPanel.style.display = 'none';
                showModal('已开启', `已对 ${targets.length} 个方块启用 molang 接管。变量区已变为只读数值，可在下方 molang 编辑器自由编写表达式。`, null, false);
            }, false);
    });
}

const brushModeCheckbox = document.getElementById('brushModeCheckbox');
if (brushModeCheckbox) {
    brushModeCheckbox.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBrushMode();
    });
}

const brushThicknessRange = document.getElementById('brushThicknessRange');
const brushThicknessLabel = document.getElementById('brushThicknessLabel');
if (brushThicknessRange) {
    brushThicknessRange.addEventListener('input', (e) => {
        brushThickness = parseFloat(e.target.value);
        syncBrushThicknessUI();
    });
}

// 顶部工具栏中的画笔长度滑动条（画笔模式下显示）
const brushLengthRange = document.getElementById('brushLengthRange');
const brushLengthLabel = document.getElementById('brushLengthLabel');
if (brushLengthRange) {
    brushLengthRange.addEventListener('input', (e) => {
        brushThickness = parseFloat(e.target.value);
        syncBrushThicknessUI();
    });
}

document.addEventListener('click', (e) => {
    // 关闭所有下拉菜单
    if (activeTopDropdown) {
        const target = e.target;
        const wrapper = target.closest?.('.top-dropdown-wrapper');
        if (!wrapper || !wrapper.querySelector(`#${activeTopDropdown}`)) {
            closeAllTopDropdowns();
        }
    }
    if (!uiSettingsPanel) return;
    const path = e.composedPath ? e.composedPath() : null;
    if (path) {
        if (path.some(el => el && el.id === 'uiSettingsPanel' || el && el.id === 'uiSettingsBtn' || el && el.id === 'actionMenuBtn')) return;
    } else if (e.target instanceof Element && (e.target.closest('#uiSettingsPanel') || e.target.closest('#uiSettingsBtn') || e.target.closest('#actionMenuBtn'))) {
        return;
    }
    uiSettingsPanel.style.display = 'none';
});

try {
    const savedSideMode = localStorage.getItem('ui_side_panel_mode');
    if (savedSideMode !== null) isSidePanelMode = savedSideMode === '1';
    const savedPanelWidth = parseInt(localStorage.getItem('ui_side_panel_width') || '360', 10);
    if (!isNaN(savedPanelWidth)) sidePanelWidth = Math.max(320, Math.min(maxSidePanelWidth(), savedPanelWidth));
    const savedNewLayout = localStorage.getItem('ui_new_layout');
    if (savedNewLayout !== null) {
        isNewLayoutMode = savedNewLayout === '1';
        if (isNewLayoutMode && newLayoutCheckbox) {
            newLayoutCheckbox.classList.add('checked');
            newLayoutCheckbox.setAttribute('aria-pressed', 'true');
        }
    }
    const savedWorldAxisDisp = localStorage.getItem('ui_world_axis_disp');
    if (savedWorldAxisDisp !== null) {
        useWorldAxisDisplacement = savedWorldAxisDisp === '1';
        userWorldAxisPref = useWorldAxisDisplacement;
        if (useWorldAxisDisplacement && worldAxisDispCheckbox) {
            worldAxisDispCheckbox.classList.add('checked');
            worldAxisDispCheckbox.setAttribute('aria-pressed', 'true');
        }
    }
    const savedPivotLink = localStorage.getItem('ui_pivot_link_model');
    if (savedPivotLink !== null) {
        pivotLinkModel = savedPivotLink === '1';
        if (!pivotLinkModel && pivotLinkCheckbox) {
            pivotLinkCheckbox.classList.remove('checked');
            pivotLinkCheckbox.setAttribute('aria-pressed', 'false');
        }
    }
    const savedFlagPoleSnapOff = localStorage.getItem('ui_flagpole_snap_off');
    if (savedFlagPoleSnapOff !== null) {
        flagPoleSnapOff = savedFlagPoleSnapOff === '1';
        if (flagPoleSnapOff && flagPoleSnapCheckbox) {
            flagPoleSnapCheckbox.classList.add('checked');
            flagPoleSnapCheckbox.setAttribute('aria-pressed', 'true');
        }
    }
    const savedGizmoSubMemory = localStorage.getItem('ui_gizmo_sub_memory');
    if (savedGizmoSubMemory !== null && gizmoSubMemoryCheckbox) {
        const on = savedGizmoSubMemory === '1';
        gizmoSubMemoryCheckbox.classList.toggle('checked', on);
        gizmoSubMemoryCheckbox.setAttribute('aria-pressed', String(on));
    }
    const savedAutoBakeBone = localStorage.getItem('ui_auto_bake_bone');
    if (savedAutoBakeBone !== null) {
        autoBakeBone = savedAutoBakeBone === '1';
        if (autoBakeBone && autoBakeBoneCheckbox) {
            autoBakeBoneCheckbox.classList.add('checked');
            autoBakeBoneCheckbox.setAttribute('aria-pressed', 'true');
        }
    }
    const savedLocalAxes = localStorage.getItem('ui_show_local_axes');
    if (savedLocalAxes !== null) {
        showLocalAxes = savedLocalAxes === '1';
        if (!showLocalAxes && localAxesCheckbox) {
            localAxesCheckbox.classList.remove('checked');
            localAxesCheckbox.setAttribute('aria-pressed', 'false');
        }
    }
    const savedBaseposAxis = localStorage.getItem('ui_show_basepos_axis');
    if (savedBaseposAxis !== null) showBaseposAxis = savedBaseposAxis === '1';
    const shx = localStorage.getItem('ui_basepos_axis_hide_x');
    const shy = localStorage.getItem('ui_basepos_axis_hide_y');
    const shz = localStorage.getItem('ui_basepos_axis_hide_z');
    if (shx !== null) baseposAxisHide.x = shx === '1';
    if (shy !== null) baseposAxisHide.y = shy === '1';
    if (shz !== null) baseposAxisHide.z = shz === '1';
    refreshBaseposAxisUI();
    const savedQueryUpdate = localStorage.getItem('ui_query_func_update');
    if (savedQueryUpdate !== null) {
        _queryUpdateEnabled = savedQueryUpdate === '1';
        if (!_queryUpdateEnabled && queryUpdateCheckbox) {
            queryUpdateCheckbox.classList.remove('checked');
            queryUpdateCheckbox.setAttribute('aria-pressed', 'false');
        }
    }
    // 控件精度设置：四档步长
    Object.keys(GIZMO_PREC_KEYS).forEach((key) => {
        const raw = localStorage.getItem(GIZMO_PREC_KEYS[key]);
        if (raw === null) return;
        const v = parseFloat(raw);
        if (Number.isFinite(v) && v >= 0) gizmoPrecision[key] = v;
    });
    syncGizmoPrecInputs();
} catch (e) {}
applyBlockListPosition();
applySidePanelMode();
// ★★★【2026-10-16 r13b】侧栏「窄」档：按实际渲染宽度打 data-narrow-lv（<340px）→ 折叠成「文件/操作/视图」，避免十几颗按钮挤成多行。
// 用 ResizeObserver 统一驱动，覆盖所有改宽路径（滑条拖动 / 模式切换 / 布局切换 / 窗口 resize），无需逐处改。
(function setupPanelNarrowLevel() {
    function sync() {
        if (!panel) return;
        const w = panel.offsetWidth;
        // 阈值 340：面板 ≥340px 时工具行一行能舒适放下 4 颗按钮（4×70+3×10≈310 ≤ 内容宽 ~316）；低于 340 平铺就会「挤」，直接折叠。
        const narrow = (w > 0 && w < 340);
        panel.dataset.narrowLv = narrow ? 'true' : 'false';
        // ★r13c-8 退出窄档时收掉飞出浮层（否则折叠栏已隐藏、浮层还挂在面板左侧）
        if (!narrow && typeof window.__ongCloseAll === 'function') window.__ongCloseAll();
    }
    sync();
    try { new ResizeObserver(sync).observe(panel); } catch (e) { }
    window.addEventListener('resize', sync);
})();
// ★★★【2026-10-16 r13c】旧操作模式「窄」档（<340px）折叠栏：把平铺按钮折叠进「文件 / 操作 / 视图」。
// 折叠栏条目是**代理控件**，只转调原按钮 .click() / 同步原复选框，不复制任何业务逻辑，避免与旧逻辑分叉。
(function setupOldNarrowGroups() {
    const wrap = document.getElementById('oldNarrowGroups');
    const panel = document.getElementById('dataPanel');
    if (!wrap || !panel) return;
    // ★r13c-8 把每个 .ong-body 搬到 #dataPanel 之下 → 成为「面板」的绝对定位子元素：
    //   ① 不受 .panel-content 的 overflow-y:auto 裁剪（能飞出面板外、盖到左侧画布上）；
    //   ② 坐标直接相对面板算（.data-panel 是 position:fixed），不依赖 backdrop-filter 造成的包含块歧义。
    const groups = Array.prototype.slice.call(wrap.querySelectorAll('.ong-group'));
    groups.forEach(function (g) {
        const b = g.querySelector('.ong-body');
        if (!b) return;
        g.__body = b;
        panel.appendChild(b);
    });
    function bodyOf(g) { return g.__body; }
    // 竖向对齐到对应栏头（右缘由 CSS `right: calc(100% + 6px)` 贴住面板左缘、向左飞出）
    function placeFlyout(g) {
        const b = bodyOf(g), head = g.querySelector('.ong-head');
        if (!b || !head) return;
        const pr = panel.getBoundingClientRect(), hr = head.getBoundingClientRect();
        b.style.top = Math.max(0, Math.round(hr.top - pr.top)) + 'px';
    }
    function closeAll() {
        groups.forEach(function (g) {
            g.classList.remove('open');
            g.querySelector('.ong-head').setAttribute('aria-expanded', 'false');
            const b = bodyOf(g);
            if (b) b.style.display = 'none';
        });
    }
    // ★r13c-8 手风琴：一次只展开一个组（点开新组自动收起旧组），避免多个浮层同时挂出来
    function openGroup(g) {
        groups.forEach(function (o) {
            if (o === g) return;
            o.classList.remove('open');
            o.querySelector('.ong-head').setAttribute('aria-expanded', 'false');
            const ob = bodyOf(o);
            if (ob) ob.style.display = 'none';
        });
        g.classList.add('open');
        g.querySelector('.ong-head').setAttribute('aria-expanded', 'true');
        const b = bodyOf(g);
        if (!b) return;
        syncGroupState(g);
        b.style.display = 'flex';
        // ★r13c-9：重放「飞出」动画（display 由 none→flex 时 CSS 动画不一定重启，强制 reflow 保证每次都播放）
        b.style.animation = 'none';
        void b.offsetWidth;
        b.style.animation = '';
        placeFlyout(g);
    }
    // 面板变宽（退出窄档）时由 setupPanelNarrowLevel 调用，收掉飞出浮层（否则折叠栏隐藏了、浮层还挂在面板上）
    window.__ongCloseAll = closeAll;
    // 展开/收起（手风琴：点已展开的组头 = 收起）
    wrap.querySelectorAll('.ong-head').forEach(function (head) {
        head.addEventListener('click', function () {
            const g = head.parentElement;
            if (g.classList.contains('open')) closeAll(); else openGroup(g);
        });
    });
    // 代理按钮：转调原按钮（stopPropagation：否则本点击会冒泡到 document 的「点外部关设置面板」兜底
    // 处理器，导致点击代理 ⚙设置 后设置面板被立刻关掉）
    panel.querySelectorAll('.ong-item[data-target]').forEach(function (item) {
        item.addEventListener('click', function (ev) {
            ev.stopPropagation();
            const t = document.getElementById(item.dataset.target);
            if (t) t.click();
        });
    });
    // 代理复选框：双向同步（点折叠栏 → 改原框；原框变 → 回写折叠栏）
    panel.querySelectorAll('.ong-check input[data-sync]').forEach(function (box) {
        box.addEventListener('change', function () {
            const t = document.getElementById(box.dataset.sync);
            if (t && t.checked !== box.checked) {
                t.checked = box.checked;
                t.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });
    // 展开时把原按钮的文字/禁用态、原复选框的勾选态同步到折叠栏（避免代理显示与实际不一致）
    function syncGroupState(g) {
        const body = bodyOf(g);
        if (!body) return;
        body.querySelectorAll('.ong-item[data-target]').forEach(function (item) {
            const t = document.getElementById(item.dataset.target);
            if (!t) return;
            item.disabled = !!t.disabled;
            const txt = t.querySelector('span');
            if (txt && txt.textContent.trim()) {
                // ★r13c-7：折叠栏条目为平行四边形（外层 skewX(-12deg)），文字必须写在 <span> 里反向抵消，
                // 所以这里只更新 span 文本，不能直接 item.textContent = ...（那会连 skew 容器一起写没）
                let s = item.querySelector('span');
                if (!s) { s = document.createElement('span'); item.appendChild(s); }
                s.textContent = txt.textContent.trim();
            }
        });
        body.querySelectorAll('.ong-check input[data-sync]').forEach(function (box) {
            const t = document.getElementById(box.dataset.sync);
            if (t) box.checked = !!t.checked;
        });
    }
    // 原复选框变化时，若折叠栏正展开则实时回写其代理勾选（r13c-8：.ong-body 已搬出 wrap，改从 panel 查）
    ['showAxesCheckbox', 'showGridCheckbox', 'showTicksCheckbox'].forEach(function (id) {
        const t = document.getElementById(id);
        if (!t) return;
        t.addEventListener('change', function () {
            const box = panel.querySelector('.ong-check input[data-sync="' + id + '"]');
            if (box && box.checked !== t.checked) box.checked = t.checked;
        });
    });
    // 展开某一栏时先同步一次（r13c-8：groups 数组）
    groups.forEach(syncGroupState);
    // ★r13c-8 浮层跟随：点面板空白处 / 滚动面板 / 窗口缩放时——收起或重新对齐飞出浮层
    document.addEventListener('click', function (ev) {
        const t = ev.target;
        if (t && t.closest && (t.closest('.ong-head') || t.closest('.ong-body'))) return;
        if (wrap.querySelector('.ong-group.open')) closeAll();
    });
    const pc = panel.querySelector('.panel-content');
    if (pc) pc.addEventListener('scroll', function () {
        const g = wrap.querySelector('.ong-group.open');
        if (g) placeFlyout(g);
    });
    window.addEventListener('resize', function () {
        const g = wrap.querySelector('.ong-group.open');
        if (g) placeFlyout(g);
    });
})();
setupNewLayoutUI();
setupSideListResize();
window.addEventListener('resize', updateSideListResizeHandle);
applyNewLayoutMode();
// 手机端（≤600px）：Gizmo 工具栏停靠到屏幕右侧、方块列表之上（顶栏放不下，且会被右上角模式切换控件遮住）
try { syncMobileGizmoDock(); } catch (e) {}
try { syncMobileBrushDock(); } catch (e) {}



// 3D Gizmo 变换控件 —— 完整实现（基于 Three.js）
// 包含：平移箭头、旋转弧、缩放点、拾取、拖拽、同步更新
