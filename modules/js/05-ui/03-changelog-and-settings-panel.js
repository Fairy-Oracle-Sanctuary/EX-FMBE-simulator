/* 05-ui/03-changelog-and-settings-panel.js · 源 测试版v.6b79.html 第 23263-23900 行 */
'use strict';
// ==================== 更新日志弹窗 ====================
function showChangelogModal() {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal changelog-modal';
    
    let listHtml = '';
    if (changelogData.length === 0) {
        listHtml = '<div class="changelog-empty">暂无更新日志</div>';
    } else {
        // 按日期从新到旧排序（若数据已按顺序可省略）
        const sorted = [...changelogData].sort((a, b) => new Date(b.date) - new Date(a.date));
        for (let i = 0; i < sorted.length; i++) {
            const entry = sorted[i];
            // id 按条目序号生成（保证唯一）：同一天可能有多个条目（如两个 2026-09-24），
            // 若用日期拼 id 会变成重复 id，getElementById 只返回第一个，导致同日期的后续条目永远打不开。
            const id = 'cl_' + i;
            // 蓝色胶囊只放版本号（原样）；剩余说明只在无版本号的条目上显示
            const { pill, label } = splitChangelogTitle(entry.title);
            // ★ 日志文本一律转义后再插入 innerHTML：正文里出现的 `<textarea>`/`<svg>`/`<input>` 等
            //   裸标签会被浏览器当成真实标签解析（<textarea> 更是 RCDATA，会把后面整段日志吞成文本）
            //   ⇒ 曾导致「更新日志只显示一条」（其余 59 条全被第一个条目里的 <textarea> 吞掉）。
            const titleHtml = (pill ? `<span class="changelog-version-tag">${escapeHtml(pill)}</span>` : '')
                + (label ? `<span class="changelog-entry-label">${escapeHtml(label)}</span>` : '');
            const itemsHtml = entry.items.map(item => `<li>${escapeHtml(item)}</li>`).join('');
            const hasDetails = entry.details && entry.details.trim();
            const detailsHtml = hasDetails ? `<div class="changelog-details" id="${id}_details" style="display:none;">${escapeHtml(entry.details).replace(/\n/g, '<br>')}</div>` : '';
            const detailBtn = hasDetails ? `<span class="changelog-detail-btn" data-target="${id}" data-details="${id}_details">查看详情</span>` : '';
            listHtml += `
                <div class="changelog-item" data-id="${id}">
                    <div class="changelog-date-header" data-target="${id}">
                        <div class="changelog-date-left">
                            <span class="changelog-date-text">${entry.date}</span>
                            ${titleHtml}
                        </div>
                        <div class="changelog-header-right">
                            ${detailBtn}
                            <span class="changelog-toggle-icon" data-target="${id}">▾</span>
                        </div>
                    </div>
                    <div class="changelog-body" id="${id}">
                        <ul>${itemsHtml}</ul>
                        ${detailsHtml}
                    </div>
                </div>
            `;
        }
    }
    
    modalDiv.innerHTML = `
        <div class="modal-content">
            <div class="modal-title">
                <span>📋 更新日志</span>
                <button class="modal-close-btn" id="changelogCloseBtn">✕</button>
            </div>
            <div class="changelog-list">${listHtml}</div>
            <div class="modal-footer">
                <button class="modal-btn" id="changelogCloseFooter">关闭</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalDiv);
    
    // 关闭弹窗
    const closeModal = () => modalDiv.remove();
    modalDiv.querySelector('#changelogCloseBtn').onclick = closeModal;
    modalDiv.querySelector('#changelogCloseFooter').onclick = closeModal;
    modalDiv.addEventListener('click', (e) => {
        if (e.target === modalDiv) closeModal();
    });
    
    // 日期点击展开/收起
    const headers = modalDiv.querySelectorAll('.changelog-date-header');
    headers.forEach(header => {
        header.addEventListener('click', function(e) {
            if (e.target.classList.contains('changelog-detail-btn')) return;
            devChangelogClick(this.dataset.target); // 彩蛋：同一条目完整「展开→收起」满 3 轮（连续 6 击）→ 解锁开发者模式
            const targetId = this.dataset.target;
            const body = document.getElementById(targetId);
            const icon = this.querySelector('.changelog-toggle-icon');
            if (!body) return;
            const isOpen = body.classList.contains('open');
            if (isOpen) {
                body.classList.remove('open');
                icon.classList.remove('open');
            } else {
                body.classList.add('open');
                icon.classList.add('open');
            }
        });
    });
    
    // 查看详情按钮点击
    const detailBtns = modalDiv.querySelectorAll('.changelog-detail-btn');
    detailBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const targetId = this.dataset.target;
            const body = document.getElementById(targetId);
            const detailsId = this.dataset.details;
            const detailsEl = document.getElementById(detailsId);
            if (!detailsEl) return;
            // 「查看详情」按钮始终可见，但详情 div 嵌在默认 display:none 的正文里；
            // 若正文未展开，先展开正文（连同标题栏箭头），否则点了详情也看不到内容。
            if (body && !body.classList.contains('open')) {
                body.classList.add('open');
                const icon = body.closest('.changelog-item')?.querySelector('.changelog-toggle-icon');
                if (icon) icon.classList.add('open');
            }
            const isVisible = detailsEl.style.display !== 'none';
            if (isVisible) {
                detailsEl.style.display = 'none';
                this.textContent = '查看详情';
            } else {
                detailsEl.style.display = 'block';
                this.textContent = '收起详情';
            }
        });
    });
}

// 绑定网站日志按钮
document.getElementById('changelogBtn').addEventListener('click', showChangelogModal);
document.getElementById('blockMenuBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeDropdown) {
        activeDropdown.remove(); activeDropdown = null; return;
    }
    showBlockDropdown(e.currentTarget);
});
// 绑定顶栏和侧边面板控制按钮
['fullscreenBtn', 'fullscreenBtnSide'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', toggleFullscreen);
});
// 退出全屏按钮（手机端旧版模式专用）
const exitFsBtn = document.getElementById('exitFullscreenBtn');
if (exitFsBtn) {
    exitFsBtn.addEventListener('click', () => {
        // 点击「退出全屏」按钮是明确的「仅退全屏」动作：打标记，避免 fullscreenchange 连带退出项目
        window.__exaFsExitByApp = true;
        if (window.Android && typeof window.Android.exitFullscreen === 'function') {
            window.Android.exitFullscreen();
            window._isFullscreen = false;
        } else {
            document.exitFullscreen().catch(() => {});
        }
        // 恢复按钮显示状态
        const fullBtn = document.getElementById('fullscreenBtn');
        if (fullBtn) fullBtn.style.display = '';
        exitFsBtn.style.display = 'none';
    });
}
// 退出全屏按钮

['undoBtn', 'undoBtnSide'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', safeUndo);
});
['redoBtn', 'redoBtnSide'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', safeRedo);
});
// 绑定左上方按钮，复用相同下拉逻辑
document.getElementById('blockListTopBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    // 如果已经打开，就关闭；否则打开（实现切换行为）
    if (activeDropdown) {
        activeDropdown.remove(); activeDropdown = null; return;
    }
    showBlockDropdown(e.currentTarget);
});

const panel = document.getElementById('dataPanel');
const topBar = document.querySelector('.top-bar');
const uiSettingsBtn = document.getElementById('uiSettingsBtn');
const uiSettingsPanel = document.getElementById('uiSettingsPanel');
// 设置面板「关闭」按钮：点击收起（全屏时尤其必要）
if (uiSettingsPanel) {
    const exCloseBtn = uiSettingsPanel.querySelector('.ui-settings-close');
    if (exCloseBtn) exCloseBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleUISettingsPanel(); });
    // 可折叠设置分组：点击标题栏展开/收起（给 .ui-settings-group 加 collapsible 即可复用；目前用于「快捷键」卡片）
    uiSettingsPanel.addEventListener('click', (ev) => {
        const head = ev.target.closest && ev.target.closest('.ui-settings-group-head');
        if (!head) return;
        const group = head.closest('.ui-settings-group');
        if (!group || !group.classList.contains('collapsible')) return;
        group.classList.toggle('collapsed');
    });
}
// 设置项悬停音效（2026-10-17 第 19 轮，用户要求「和新手教程的项目一样，鼠标放上去显示光亮然后有声音」）：
// 悬停音效语义照抄教程「目题」（ex-tut-pill 的 mouseenter）——同一项反复划过不重复响，
// 只有换到另一项才响一次清脆「哒」（exTutSfx('select')，音效开关沿用教程的 exTutSfxOn，可在设置里关）。
if (uiSettingsPanel) {
    let lastHoverItem = null;
    uiSettingsPanel.addEventListener('mouseover', (e) => {
        const it = e.target.closest && e.target.closest('.ui-settings-item');
        if (!it || it === lastHoverItem) return;
        lastHoverItem = it;
        try { exTutSfx('select'); } catch (e2) {}
    });
}
// ---- 设置面板分类导航（2026-10-17 第 18 轮，用户要求「分类导航二级页 / 功能清晰」）----
// 分类：界面 / 编辑 / 视图 / 项目 / 帮助；分组用 data-cat 归属分类，切换时给非当前分类的分组加 .ui-settings-cat-off。
// ★用 class 而不是 [hidden]：新/旧操作模式会往分组上直接写 inline style.display（applyNewLayoutMode），
//   inline 会盖掉 [hidden] 的 display:none，只有 !important 的 class 才压得住。
const UI_SETTINGS_CATS = ['ui', 'edit', 'view', 'project', 'help'];
let uiSettingsCat = 'ui';
function uiSettingsShowCategory(cat) {
    const p = document.getElementById('uiSettingsPanel');
    if (!p) return;
    if (UI_SETTINGS_CATS.indexOf(cat) < 0) cat = 'ui';
    uiSettingsCat = cat;
    p.querySelectorAll('.ui-settings-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-cat') === cat));
    p.querySelectorAll('.ui-settings-scroll > .ui-settings-group').forEach(g => {
        g.classList.toggle('ui-settings-cat-off', (g.getAttribute('data-cat') || 'ui') !== cat);
    });
}
if (uiSettingsPanel) {
    const uiSettingsNav = uiSettingsPanel.querySelector('#uiSettingsNav');
    if (uiSettingsNav) uiSettingsNav.addEventListener('click', (e) => {
        const tab = e.target.closest && e.target.closest('.ui-settings-tab');
        if (!tab) return;
        e.stopPropagation();
        const cat = tab.getAttribute('data-cat');
        if (cat === uiSettingsCat) return;
        uiSettingsShowCategory(cat);
        // 换分类时把内容区滚回顶部（否则会保留上一分类的滚动位置，看到半截内容）
        const sc = uiSettingsPanel.querySelector('.ui-settings-scroll');
        if (sc) sc.scrollTop = 0;
    });
}
const blockListCheckbox = document.getElementById('blockListPositionCheckbox');
const sidePanelCheckbox = document.getElementById('sidePanelCheckbox');
const sidePanelWidthSetting = document.getElementById('sidePanelWidthSetting');
const sidePanelWidthRange = document.getElementById('sidePanelWidthRange');
const sidePanelWidthLabel = document.getElementById('sidePanelWidthLabel');
let isBlockListTopLeft = true;
let isSidePanelMode = false;
let sidePanelWidth = Math.max(320, Math.min(460, Math.floor(window.innerWidth * 0.32))); // 侧边模式初始宽度随屏幕宽度自适应
let panelBottomHeight = 280;   // 底部模式下数据面板的高度，切换侧边栏时用于正确还原
let isNewLayoutMode = false;
// OBJ 模型导入入口：默认关闭（导入面板「模型」页签隐藏），仅在「新操作模式·画笔模式·生成方块·长按三角形按钮」时开启。
// ★ 开启状态持久化到 localStorage（ex_obj_import_enabled）：开启一次后刷新页面仍然有效，直到在
//   「设置 → 🛠 开发者工具 → 清除「OBJ 导入已开启」状态」里手动清除。
let objImportEnabled = (() => {
    try { return localStorage.getItem('ex_obj_import_enabled') === '1'; } catch (e) { return false; }
})();
// 当前打开的导入面板 API 引用（用于长按三角形后直接把已开的面板切到 OBJ 页签）
let _importModalApi = null;
let isKeyframeMode = false; // 新操作模式下的关键帧编辑模式
let closeOutlinerToolsMenu = null; // 新布局模式下关闭工具收纳菜单的全局点击处理器
let useWorldAxisDisplacement = false;
let userWorldAxisPref = false;   // 世界轴位移的用户真实偏好（强制临时开启时不被覆盖）
let worldAxisDispForced = false; // 当前是否被「多选 + 位移」强制临时开启
let pivotLinkModel = true;   // 枢轴联动模型：true=pos直接相加，false=换算basepos保持模型位置不变
let flagPoleSnapOff = false; // 关闭旗杆顶点捕捉：true=顶点捕捉只取旗面那个 cube 的顶点，旗杆两段的顶点不显示
let _skipBoneInBatch = false; // 枢轴(位移)拖拽中：标记骨骼子块已由 changeVar 顶部统一换算进 xbasepos_bone，applyBatchDelta 内跳过避免重复写入
let autoBakeBone = false;    // 骨骼自动烘焙：文件夹枢轴改变后自动用方式2烘焙子方块枢轴
let showLocalAxes = true;    // 渲染局部坐标系：false时所有方块不显示自身坐标轴
let showBaseposAxis = true;    // 关闭basepos局部位移轴显示：false时所有方块不显示自身坐标轴（区别于Gizmo控件的位移轴箭头）
let baseposAxisHide = { x: true, y: true, z: true }; // 关闭模式下各轴独立隐藏开关（true=隐藏该轴），父开关勾选时按此逐轴显示
const MIN_SIDE_PANEL_WIDTH = 5;
/* 数据面板最大宽度：用户要求「侧边横向可占屏幕宽度 80%」（旧值写死 880 ⇒ 1920 屏只有 46%）。
   现在是**函数**，随视口实时变化；880 只作为窄屏（<1100px）下的最小可用上限，避免小屏滑杆上限比实际还小。
   ★注意：这里必须保持「函数」语义 —— 任何写死常量都会让 resize / 换屏后上限失真。 */
const SIDE_PANEL_MAX_RATIO = 0.8;              // 用户指定：最多占视口宽度 80%
const SIDE_PANEL_MAX_FLOOR = 880;              // 窄屏下限（<1100px 时 80% 会小于 880，取 880 保证够用）
function maxSidePanelWidth() {
    const winW = (window.innerWidth || document.documentElement.clientWidth || 1920);
    return Math.max(SIDE_PANEL_MAX_FLOOR, Math.floor(winW * SIDE_PANEL_MAX_RATIO));
}

// ---------- 控件精度设置（Gizmo 拖拽自动取整） ----------
// 四档步长：无按键 / Shift / Ctrl / Shift+Ctrl（默认 1 / 0.5 / 0.1 / 0.001；<=0 或非法 = 该档不取整）。
// 语义：拖拽「实时产生的增量」先按步长取整、再写入方块 —— 一次拖拽的累计位移恒为步长的整数倍。
// 做法：把每帧的标量增量并入累计量，用「取整后的累计目标 − 已下发量」作为本帧真正下发的增量。
//       未满一个步长时本帧下发 0（方块原地不动），累计量不丢；够一步就跳一步。
let gizmoPrecision = { none: 1, shift: 0.5, ctrl: 0.1, shiftCtrl: 0.001 };
const gizmoPrecMods = { shift: false, ctrl: false };   // 实时修饰键状态（拖拽中可随时切换档位）
let gizmoPrecRaw = 0;    // 本次拖拽累计的原始标量增量
let gizmoPrecFed = 0;    // 本次拖拽累计已下发的标量增量（取整后）
const GIZMO_PREC_KEYS = { none: 'ui_gizmo_prec_none', shift: 'ui_gizmo_prec_shift', ctrl: 'ui_gizmo_prec_ctrl', shiftCtrl: 'ui_gizmo_prec_shift_ctrl' };

function gizmoPrecisionStep() {
    const m = gizmoPrecMods;
    const v = (m.shift && m.ctrl) ? gizmoPrecision.shiftCtrl
        : m.shift ? gizmoPrecision.shift
            : m.ctrl ? gizmoPrecision.ctrl
                : gizmoPrecision.none;
    const n = Number(v);
    return (Number.isFinite(n) && n > 0) ? n : 0;
}
function gizmoPrecDecimals(step) {
    const s = String(step);
    if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) return 9;   // 科学计数法：交给 toFixed(9) 兜底
    const i = s.indexOf('.');
    return i < 0 ? 0 : Math.min(9, s.length - i - 1);
}
function gizmoPrecSnap(x, step) {
    const r = Math.round(x / step) * step;
    // 消除浮点误差（例：0.1*3 → 0.30000000000000004），否则写回方块的数值会拖一长串尾巴
    return parseFloat(r.toFixed(gizmoPrecDecimals(step)));
}
// ★ 拖拽期间增量的唯一出口。必须在所有 Gizmo 分支（位移/基点位移/旋转/缩放/拉伸/文件夹）上调用，
//   否则该分支不受精度控制。返回值可能为 0（本帧不够一个步长），调用处按 0 走原有逻辑即可。
function quantizeDragDelta(delta) {
    // 只拦截「Gizmo 操作产生的增量」。判据用 activePick 而不是 draggingGizmo：
    // 本函数全部调用点都在 moveGizmoDrag 内（那里已保证 activePick 存在），而探针是直接
    // setActivePick + moveGizmoDrag（不走 beginGizmoDrag），用 draggingGizmo 会把探针全部挡掉。
    if (!activePick) return delta;
    if (!Number.isFinite(delta)) return delta;
    delta *= dragSensScale();          // 灵敏度随精度档缩放（细档 → 同样鼠标位移产生更小增量）
    gizmoPrecRaw += delta;
    if (!Number.isFinite(gizmoPrecRaw)) { gizmoPrecRaw = 0; gizmoPrecFed = 0; return delta; }
    const step = gizmoPrecisionStep();
    if (!step) { gizmoPrecFed = gizmoPrecRaw; return delta; }   // 该档不取整：原样透传
    const target = gizmoPrecSnap(gizmoPrecRaw, step);
    const feed = target - gizmoPrecFed;
    gizmoPrecFed = target;
    return feed;
}
function resetGizmoPrecAccum() { gizmoPrecRaw = 0; gizmoPrecFed = 0; }

// ★ 拖拽灵敏度随精度档缩放（2026-09-21）：精度越细 → 同样的鼠标位移换算出的数据增量越小，
//   便于精确调整。规则：倍率 = 该档步长（步长 0 视为 1，即「不取整 = 保持原灵敏度」的逃生门）。
//   于是每一档都满足同一条可预期的手感：**拖动固定像素数 ≈ 走一个该档的步长**
//   （move 箭头基准 0.012 世界单位/像素 → 无按键档 1 步 = 83px；Shift 0.5 = 83px/0.5；依此类推）。
//   拖拽过程中按/松修饰键可实时叠加切换 → 粗档赶路、细档微调（与 Blender / PS 的精确模式同理）。
function dragSensScale() {
    const step = gizmoPrecisionStep();
    return step > 0 ? step : 1;
}

// ★ 拖拽期间写入数值的最小小数位（与精度取整配套）。
//   背景：各拖拽分支原先按【变量 step 的小数位】逐帧取整 —— getDefaultRange 里所有变量 step 都是
//   0.01 → 2 位小数；而真正落库的 setConstVarValue 对位置类变量允许 4 位小数。逐帧按 2 位取整会：
//     1) 让比 0.01 更细的精度档（Ctrl 0.1 / Shift+Ctrl 0.001）永远落不到方块上（写进去就被抹平）；
//     2) 每帧把「不足一个完整步长的增量」反复四舍五入 → 拖拽产生【系统性漂移】
//        （实测：0.001 档真实拖 197px，块值落到 2.46 而非应有的 2.364，偏差 ~4%）。
//   「位移(base)」分支早已用 6 位小数规避同一问题（见该分支内注释），这里把这套口径统一到其余
//   拖拽分支。非拖拽路径（面板输入、自增按钮等）不受影响，保持原样。
//   判据与 quantizeDragDelta 保持一致用（draggingGizmo || activePick）：activePick 非空就说明
//   有一次 Gizmo 交互在飞（含探针直连 setActivePick + moveGizmoDrag 的路径，那条路不置 draggingGizmo）。
// ★ 写入精度必须覆盖「当前精度档的步长小数位」，否则比 0.0001 更细的档（0.0001 / 1e-5 …）写进去
//   就被 toFixed 抹平 → 方块原地不动、增量表恒显示「未改动」。旧写死 max(dec,4) 在 0.001 以下档失效。
function dragWriteDecimals(dec) {
    if (!(draggingGizmo || activePick)) return dec;
    const step = gizmoPrecisionStep();
    const stepDecs = step > 0 ? gizmoPrecDecimals(step) : 0;
    return Math.max(dec, 4, stepDecs);
}

// 实时跟踪 Shift / Ctrl（含 macOS 的 Cmd）状态：Gizmo 拖拽的 pointermove 处理器不传事件对象，
// 因此不能从 moveGizmoDrag 的 ev 参数读修饰键，必须在拖拽外独立跟踪。
function gizmoPrecSyncMods(e) {
    gizmoPrecMods.shift = !!e.shiftKey;
    gizmoPrecMods.ctrl = !!(e.ctrlKey || e.metaKey);
    syncVirtModKeys();   // 真实键盘修饰键变化也要同步虚拟键的常亮状态
}
window.addEventListener('keydown', gizmoPrecSyncMods, true);
window.addEventListener('keyup', gizmoPrecSyncMods, true);
window.addEventListener('blur', () => { gizmoPrecMods.shift = false; gizmoPrecMods.ctrl = false; syncVirtModKeys(); });

// ---------- 手机端虚拟修饰键（无键盘时模拟 Shift / Ctrl；双键同亮 = Shift+Ctrl） ----------
// 两个独立锁存开关（Shift、Ctrl）直接驱动 gizmoPrecMods，与真实键盘 Shift/Ctrl 走同一套精度档判断（见 gizmoPrecisionStep）。
// 双键同时常亮即对应「Shift+Ctrl」档（0.001），避免第三个误导性按键让用户以为是互斥选择。
// 切换回方块列表 / 取消选中方块 时调用 clearVirtModKeys() 复位。
let virtModKeysBound = false;
function syncVirtModKeys() {
    const s = document.getElementById('virtModShift');
    const c = document.getElementById('virtModCtrl');
    if (s) s.classList.toggle('lit', !!gizmoPrecMods.shift);
    if (c) c.classList.toggle('lit', !!gizmoPrecMods.ctrl);
}
function clearVirtModKeys() {
    gizmoPrecMods.shift = false;
    gizmoPrecMods.ctrl = false;
    syncVirtModKeys();
}
function bindVirtModKeys() {
    if (virtModKeysBound) return;
    const s = document.getElementById('virtModShift');
    const c = document.getElementById('virtModCtrl');
    if (s) s.addEventListener('click', () => { gizmoPrecMods.shift = !gizmoPrecMods.shift; syncVirtModKeys(); });
    if (c) c.addEventListener('click', () => { gizmoPrecMods.ctrl = !gizmoPrecMods.ctrl; syncVirtModKeys(); });
    virtModKeysBound = true;
}
bindVirtModKeys();
// 虚拟键条显隐：仅「新布局 + 非侧边（手机端底部数据视图）」时显示；
// 侧边（桌面，有真实键盘）/ 旧布局 一律隐藏。与数据表（#dataTableInspector）同条件，
// 保证键条只出现在 ≠ 数据视图里。由于键条是 #dataPanel 的子节点，
// 方块列表视图下 dataPanel 本身被隐藏，键条随之不可见，此处仍显式置 none 以防残留。
function syncVirtModKeybarVisibility() {
    const vmb = document.getElementById('virtModKeybar');
    if (!vmb) return;
    const show = !!isNewLayoutMode && !isSidePanelMode;
    // 只切类名，不写内联 display —— 窄屏走 CSS 的 flex 单行、宽屏走 grid 双列（见 .virt-mod-keybar 相关规则）
    vmb.classList.toggle('vmk-on', show);
    vmb.style.removeProperty('display');
}

function applyBlockListPosition() {
    const topBtn = document.getElementById('blockListTopBtn');
    const panelBtn = document.getElementById('blockMenuBtn');
    if (topBtn) topBtn.style.display = isBlockListTopLeft ? '' : 'none';
    if (panelBtn) panelBtn.style.display = isBlockListTopLeft ? 'none' : '';
    if (blockListCheckbox) {
        blockListCheckbox.classList.toggle('checked', isBlockListTopLeft);
        blockListCheckbox.setAttribute('aria-pressed', isBlockListTopLeft.toString());
    }
}

function syncSidePanelSettingUI() {
    // 同步「数据面板侧边显示」在设置列表中的勾选状态、宽度设置显隐与 localStorage。
    // 该同步与数据面板实际布局解耦：即使在新布局模式下，设置项也要如实反映 isSidePanelMode 状态。
    if (sidePanelCheckbox) {
        sidePanelCheckbox.classList.toggle('checked', isSidePanelMode);
        sidePanelCheckbox.setAttribute('aria-pressed', isSidePanelMode.toString());
    }
    if (sidePanelWidthLabel) sidePanelWidthLabel.textContent = `${sidePanelWidth}px`;
    if (sidePanelWidthRange) sidePanelWidthRange.value = sidePanelWidth;
    if (sidePanelWidthSetting) sidePanelWidthSetting.style.display = isSidePanelMode ? 'flex' : 'none';
    try { localStorage.setItem('ui_side_panel_mode', isSidePanelMode ? '1' : '0'); } catch (e) {}
    try { localStorage.setItem('ui_side_panel_width', String(sidePanelWidth)); } catch (e) {}
    if (uiSettingsPanel && (uiSettingsPanel.style.display === 'flex' || uiSettingsPanel.style.display === 'block')) {
        positionUISettingsPanel();
    }
}

function applySidePanelMode() {
    // 同步设置面板 UI（无论是否新布局都执行）
    syncSidePanelSettingUI();
    // 新布局模式下数据面板不独立以“侧边”形式显示（数据改为大纲内联 / 底部数据表），
    // 否则会与右侧方块列表面板重叠，在右上角形成一片黑。
    if (isNewLayoutMode) return;
    if (!panel) return;
    // 切换瞬间关闭过渡动画：避免宽度/高度从全屏动画到侧边（或反之）造成的“被砍一半/跳动”观感
    const hadInlineTransition = panel.style.transition !== '';
    panel.style.transition = 'none';
    panel.classList.toggle('side-panel', isSidePanelMode);
    if (isSidePanelMode) {
        panel.style.width = `${sidePanelWidth}px`;
        // ★2026-10-17：侧栏高/底引用 --tut-band，教程进行时侧栏也停在预留带上方（教程结束自动还原）
        panel.style.height = 'calc(100% - var(--tut-band))';
        panel.style.left = 'auto';
        panel.style.right = '0';
        panel.style.top = '0';
        panel.style.bottom = 'var(--tut-band)';
        // 清理任何可能残留的边界约束，确保侧边尺寸干净
        panel.style.maxWidth = '';
        panel.style.minWidth = '';
        panel.style.maxHeight = '';
        panel.style.minHeight = '';
        panel.style.borderRadius = '20px 0 0 20px';
        panel.style.willChange = 'width';
        if (sidePanelWidthSetting) sidePanelWidthSetting.style.display = 'flex';
    } else {
        panel.style.width = '';
        // 关键修复：离开侧边模式时使用保存的底部高度，而不是沿用侧边模式遗留的 '100%'
        // 否则面板会以 height:100% + bottom:0 占满整屏（表现为“顶到屏幕最上方”）
        panel.style.height = panelBottomHeight + 'px';
        panel.style.left = '0';
        panel.style.right = '0';
        panel.style.top = 'auto';
        panel.style.bottom = 'var(--tut-band)';   // ★2026-10-17：教程进行时整体抬到预留带上方
        panel.style.maxWidth = '';
        panel.style.minWidth = '';
        panel.style.maxHeight = '';
        panel.style.minHeight = '140px';
        panel.style.borderRadius = '0';
        panel.style.willChange = '';
        if (sidePanelWidthSetting) sidePanelWidthSetting.style.display = 'none';
    }
    if (panel) {
        panel.dataset.collapsed = isSidePanelMode && sidePanelWidth <= 10 ? 'true' : 'false';
        panel.dataset.narrow = isSidePanelMode && sidePanelWidth < 400 ? 'true' : 'false';
    }
    if (topBar) topBar.style.display = isSidePanelMode ? 'none' : 'flex';
    // 下一帧恢复过渡，避免影响后续拖拽手感（仅当原本没有内联过渡时才恢复）
    requestAnimationFrame(() => {
        if (panel && !hadInlineTransition) panel.style.transition = '';
    });
    // 新布局 + 非侧边：数据表面板左侧让位给大纲列表（避免两者底部全宽重叠）
    if (isNewLayoutMode && !isSidePanelMode) {
        panel.style.left = '300px';
    } else if (!isSidePanelMode) {
        panel.style.left = '0';
    }
    // 同步数据视图头部细条显隐（侧边显示开关影响）
    syncDataViewHeader();
}

function toggleSidePanelMode(e) {
    if (e) e.stopPropagation();
    isSidePanelMode = !isSidePanelMode;
    applySidePanelMode();
    if (isNewLayoutMode) {
        // 新布局模式下同步调整方块列表位置
        const sideList = document.getElementById('sideBlockList');
        if (sideList) {
            if (isSidePanelMode) {
                sideList.classList.remove('side-list-bottom');
                // 切回侧边栏：确保方块列表可见（此前若在底部模式点过“数据表”，会被隐藏），并收起底部数据表避免重叠
                sideList.style.display = 'block';
                const dp = document.getElementById('dataPanel');
                if (dp) dp.style.display = 'none';
            } else {
                sideList.classList.add('side-list-bottom');
            }
            applySideListDimensions();
            updateSideListResizeHandle();   // 切换侧边栏后同步蓝条显隐与定位（修复侧边栏下蓝条残留）
        }
        // 侧边显隐切换会改变大纲内是否内嵌数据栏，需重渲染以同步移除/重建 inspectorPanel
        renderSideBlockList();
        // 同步数据表内联数值面板显隐与数据表面板让位
        const dtInsp = document.getElementById('dataTableInspector');
        if (dtInsp) dtInsp.style.display = (isNewLayoutMode && !isSidePanelMode) ? '' : 'none';
        syncDataPanelOffset();
        renderInspector();
        // 新布局下 applySidePanelMode 会在 isNewLayoutMode 处提前 return，这里手动补一次同步
        syncDataViewHeader();
    }
    // 关键帧模式下方块列表需保持隐藏，不受侧边显隐切换影响
    syncKfModeUI();
}
function setSidePanelWidth(value) {
    const width = Math.max(MIN_SIDE_PANEL_WIDTH, Math.min(maxSidePanelWidth(), Number(value) || sidePanelWidth));
    sidePanelWidth = width;
    if (sidePanelWidthLabel) sidePanelWidthLabel.textContent = `${sidePanelWidth}px`;
    if (sidePanelWidthRange) sidePanelWidthRange.value = sidePanelWidth;
    let narrowChanged = false;
    if (panel) {
        if (isSidePanelMode || isNewLayoutMode) {
            panel.style.width = `${sidePanelWidth}px`;
            panel.dataset.collapsed = sidePanelWidth <= 10 ? 'true' : 'false';
            const narrow = sidePanelWidth < 400 ? 'true' : 'false';
            if (panel.dataset.narrow !== narrow) { panel.dataset.narrow = narrow; narrowChanged = true; }
        }
    }
    try { localStorage.setItem('ui_side_panel_width', String(sidePanelWidth)); } catch (e) {}
    /* ★★★【2026-10-17 用户报障 · molang 编辑模式拖宽度「上下跳变 + 卡顿」】
       宽度连续拖拽（range input ≈60 次/秒）**只改 panel.style.width，绝不重建变量面板**。
       旧实现每次都 `renderVariablesForBlock(selectedBlock)` ⇒ 整个 molang 面板
       （编辑器 + 只读数值表）被反复销毁重建 + `autosizeMolangEditor` 重算高度，
       ⇒ 只读数值表上下跳动、molang 编辑区纵向高度不断变化、面板滚动位置被重置 ⇒ 明显卡顿。
       只有「窄档」状态真正翻转（旧模式单列⇄双列布局切换的阈值 400px）才需要重建。 */
    if (selectedBlock && narrowChanged) renderVariablesForBlock(selectedBlock);
}

function toggleBlockListPosition(e) {
    if (e) e.stopPropagation();
    isBlockListTopLeft = !isBlockListTopLeft;
    applyBlockListPosition();
}
window.toggleBlockListPosition = toggleBlockListPosition;

// ===== 新操作模式：非侧边（手机底部）视图切换按钮 =====
// 两个视图各有一个【同款图形按钮】（均带 .view-toggle-btn 类，点击统一走 document 事件委托）：
//   方块列表视图 → 内联在列表头部（三个图标左侧，斜杠分隔），由 renderSideBlockList 生成；
//   数据视图     → 内联在数据面板顶部的 #dataViewHeader 细条里（列表头部此时整体隐藏，需另留入口）。
function syncDataViewHeader() {
    // 数据面板顶部细条仅在「新布局 + 非侧边」显示，与 #dataTableInspector 同条件；
    // 它是 #dataPanel 的静态子元素，方块列表视图下随父级一起隐藏，无需再跟随显隐。
    const h = document.getElementById('dataViewHeader');
    if (!h) return;
    h.style.display = (isNewLayoutMode && !isSidePanelMode) ? 'flex' : 'none';
}
// 单一切换动作：当前是方块列表 → 切到数据表；当前是数据表 → 切回方块列表
function toggleQuickView() {
    const sideList = document.getElementById('sideBlockList');
    const dp = document.getElementById('dataPanel');
    if (!sideList || !dp) return;
    // 按「当前谁可见」判断；都不可见时默认显示方块列表
    if (sideList.style.display !== 'none') toggleDataTable();
    else toggleBlockListSidebar();
}
// 数据表面板左侧让位给大纲列表：非侧边新布局 + 大纲可见 + 数据表可见 时，左移 300px；否则归零
function syncDataPanelOffset() {
    const dp = document.getElementById('dataPanel');
    if (!dp) return;
    if (isSidePanelMode) { dp.style.left = ''; dp.style.bottom = ''; return; }
    const sl = document.getElementById('sideBlockList');
    const outlineVisible = sl && sl.style.display !== 'none' && isNewLayoutMode;
    // 底部模式下数据表从底部向上让出大纲高度（大纲宽度铺满屏幕）
    const outlineBottom = outlineVisible ? Math.round(sl.getBoundingClientRect().height) + 'px' : '0';
    dp.style.left = '0';
    dp.style.right = '0';
    // ★2026-10-17：bottom 改为引用 --tut-band，教程进行时面板整体抬到预留带上方（教程结束 band=0 自动还原）
    dp.style.bottom = (outlineVisible && dp.style.display !== 'none') ? ('calc(var(--tut-band) + ' + outlineBottom + ')') : 'var(--tut-band)';
}
// ☰：切换到方块列表（大纲：仅方块 + 文件夹）。与数据表互斥，保证至少一个显示。
function toggleBlockListSidebar() {
    const sideList = document.getElementById('sideBlockList');
    if (!sideList) return;
    // 已经显示 -> 不关闭，避免两个面板同时隐藏
    if (sideList.style.display !== 'none') return;
    sideList.style.display = 'block';
    clearVirtModKeys();   // 切换回方块列表：清除虚拟修饰键（手机端模拟 Shift/Ctrl）的常亮状态
    syncVirtModKeybarVisibility();   // 方块列表视图下隐藏虚拟键条（dataPanel 已被隐藏，键条随之不可见；显式置 none 防残留）
    applySideListDimensions();
    updateSideListResizeHandle();
    // 底部非侧边栏模式下：方块列表与数据表互斥，显示列表时隐藏数据表
    if (isNewLayoutMode && !isSidePanelMode) {
        const dp = document.getElementById('dataPanel');
        if (dp) dp.style.display = 'none';
    }
    syncDataPanelOffset();
    updateSideListResizeHandle();
    syncDataViewHeader();   // 列表视图：数据面板头部按钮随 dataPanel 隐藏，这里同步其状态
}
// /=：切换到数据表面板（仅数据，不显示方块列表 / 文件夹）。与方块列表互斥，保证至少一个显示。
function toggleDataTable() {
    const dp = document.getElementById('dataPanel');
    if (!dp) return;
    // 已经显示 -> 不关闭，避免两个面板同时隐藏
    if (dp.style.display !== 'none') return;
    dp.style.display = '';
    // 新布局下数据表与方块列表互斥：显示数据表时隐藏方块列表（含侧边显示状态），避免底部数据表面板与右侧方块列表重叠
    if (isNewLayoutMode) {
        const sideList = document.getElementById('sideBlockList');
        if (sideList) {
            sideList.style.display = 'none';
            const rh = document.getElementById('sideListResizeHandle');
            if (rh) rh.style.display = 'none';
        }
    }
    syncDataPanelOffset();
    updateSideListResizeHandle();
    syncVirtModKeybarVisibility();   // 数据视图：显示虚拟键条（仅新布局 + 非侧边）
    syncDataViewHeader();   // 数据视图：同步顶部「切回方块列表」按钮
}
// 视图切换按钮：列表头部内联按钮会随 renderSideBlockList 重建（静态引用会失效）→ 统一事件委托，
// 同时覆盖「方块列表头部」与「数据面板头部」两处按钮（均带 .view-toggle-btn 类）。
document.addEventListener('click', (e) => {
    const t = (e.target && e.target.closest) ? e.target.closest('.view-toggle-btn') : null;
    if (t) toggleQuickView();
});

