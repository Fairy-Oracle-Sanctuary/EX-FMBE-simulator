/* 06-gizmo/06-hud-and-hotkeys.js · 源 测试版v.6b79.html 第 34887-35179 行 */
'use strict';
// ==================== Gizmo 拖拽增量 HUD ====================
// 拖拽开始时抓取被编辑对象（方块 / 文件夹）的变换基线，拖拽过程中实时对比显示「增量」。
// 仅在新操作模式下生效（Gizmo 本身也只在新模式存在）。
function gizmoDeltaSubject() {
    // 镜像：手柄操作的是对称面实体（不是方块/文件夹），显示「对称面」而不是选区里的源方块
    if (mirrorActive && activePick && activePick.mirrorPlane) return { kind: 'mirror', label: '对称面' };
    if (activePick && activePick.folder) {
        const f = getFolder(activePick.folderName);
        if (!f) return null;
        if (f._backbone) {
            const bb = folderBackboneBlock(f);
            if (bb) return { kind: 'block', block: bb, label: '骨骼「' + activePick.folderName + '」' };
            return null;
        }
        return { kind: 'folder', folder: f, label: '文件夹「' + activePick.folderName + '」' };
    }
    const b = selected();
    if (!b) return null;
    return { kind: 'block', block: b, label: (typeof b.name === 'string' && b.name ? b.name : ('方块#' + b.id)) };
}
function gizmoDeltaSnap(subj) {
    const v = {};
    if (!subj) return v;
    if (subj.kind === 'mirror') {
        // 对称面：位移 = 面锚点世界坐标；旋转 = 面朝向的欧拉角（YXZ，与引擎口径一致）
        v['v.xpos'] = mirrorPlanePos.x; v['v.ypos'] = mirrorPlanePos.y; v['v.zpos'] = mirrorPlanePos.z;
        const e = new THREE.Euler().setFromQuaternion(mirrorPlaneQuat, 'YXZ');
        v['v.rotatex'] = THREE.MathUtils.radToDeg(e.x);
        v['v.rotatey'] = THREE.MathUtils.radToDeg(e.y);
        v['v.rotatez'] = THREE.MathUtils.radToDeg(e.z);
        return v;
    }
    if (subj.kind === 'block') {
        // ★ 不跳过「当前不存在的变量」：新方块默认没有 v.rotatex/y/z（不在 initFromM 的 13 核心名里），
        //   若基线漏记这些键，首次拖 rotate 时基线里找不到对应项 → 恒显示「未改动」，
        //   第二次变量已存在才正常（用户报告）。tvnum 对缺失变量返回 0，故统一取值即可；
        //   首次拖拽由 setConstVarValue 现建变量并赋值后，立刻就能显示真实增量。
        GIZMO_DELTA_TRACK.forEach(n => { v[n] = tvnum(subj.block, n); });
        // 「两边一角」预设的参数不在通用跟踪表里，按预设补进基线
        const _pp = plgDetectPreset(subj.block);
        if (_pp) [_pp.aVar, _pp.bVar, _pp.angVar].forEach(n => { v[n] = tvnum(subj.block, n); });
    } else {
        const f = subj.folder;
        // 同理：普通文件夹在首次拖动前没有 f.pivot / f.rotation（拖拽时才初始化为 [0,0,0]）。
        // 缺失一律按 0 记基线，保证首次拖拽即显示增量（与 moveGizmoDrag 的初始化语义一致）。
        v['pivot.x'] = Array.isArray(f.pivot) ? (Number(f.pivot[0]) || 0) : 0;
        v['pivot.y'] = Array.isArray(f.pivot) ? (Number(f.pivot[1]) || 0) : 0;
        v['pivot.z'] = Array.isArray(f.pivot) ? (Number(f.pivot[2]) || 0) : 0;
        v['rot.x'] = Array.isArray(f.rotation) ? (Number(f.rotation[0]) || 0) : 0;
        v['rot.y'] = Array.isArray(f.rotation) ? (Number(f.rotation[1]) || 0) : 0;
        v['rot.z'] = Array.isArray(f.rotation) ? (Number(f.rotation[2]) || 0) : 0;
    }
    return v;
}
function captureGizmoDeltaBaseline() {
    gizmoDeltaBaseline = null;
    if (!isNewLayoutMode) return;
    const subj = gizmoDeltaSubject();
    if (!subj) return;
    const count = (subj.kind === 'block' && !(activePick && activePick.folder)) ? (selectedBlocksSet.size || 1) : 1;
    gizmoDeltaBaseline = { label: subj.label, kind: subj.kind, count: count, vals: gizmoDeltaSnap(subj) };
}
function gizmoDragTypeLabel() {
    // 镜像：手柄操作的是对称面，动作名与方块一致（位移 / 旋转），主体名由 HUD 标题拼成「旋转 · 对称面」
    if (mirrorActive && activePick && activePick.mirrorPlane) return activePick.mirrorPlane === 'rot' ? '旋转' : '位移';
    if (!activePick) return '变换';
    if (activePick.folder) {
        if (activePick.type === 'rot') return '文件夹旋转';
        if (activePick.folderPivot) return '枢轴移动';
        if (activePick.folderDisplace) return '位移(基准)';
        return '文件夹变换';
    }
    if (activePick.type === 'move') return (activePick.varName && activePick.varName.indexOf('basepos') >= 0) ? '位移(基准)' : '位移(枢轴)';
    if (activePick.type === 'rot') return '旋转';
    if (activePick.type === 'scale') return '缩放';
    if (activePick.type === 'stretch') return '肢体拉伸';
    if (activePick.type === 'plgEdge') return '边长';
    if (activePick.type === 'plgAngle') return '夹角';
    return '变换';
}
function ensureGizmoDeltaHud() {
    if (gizmoDeltaHudEl) return gizmoDeltaHudEl;
    let el = document.getElementById('gizmoDeltaHud');
    if (!el) {
        el = document.createElement('div');
        el.id = 'gizmoDeltaHud';
        el.className = 'gizmo-delta-hud';
        document.body.appendChild(el);
    }
    gizmoDeltaHudEl = el;
    return el;
}
// HUD 顶部偏移：贴在所有可见顶栏（新布局顶栏 / Gizmo 工具栏）下方，避免被它们压住。
// 固定顶部居中而非跟随光标 —— 手机端手指按在画布上会正好盖住光标处的提示（用户反馈）。
function gizmoDeltaHudTopOffset() {
    let bottom = 8;
    ['newTopBar', 'herTransformToolbar'].forEach(id => {
        const node = document.getElementById(id);
        if (!node) return;
        // 手机端（≤600px）Gizmo 工具栏已搬到顶栏之外、停靠在屏幕右侧，
        // 它的 bottom 在屏幕下方，不能拿来当「顶栏下沿」，否则 HUD 会被顶到屏底
        if (!node.closest('.new-top-bar')) return;
        if (getComputedStyle(node).display === 'none') return;
        const r = node.getBoundingClientRect();
        if (r.height > 0) bottom = Math.max(bottom, r.bottom);
    });
    return Math.round(bottom + 10);
}
function updateGizmoDeltaHud(cx, cy) {
    if (!gizmoDeltaBaseline) return;
    const subj = gizmoDeltaSubject();
    if (!subj) { hideGizmoDeltaHud(); return; }
    // 拖拽中文件夹被自动设为骨骼（_backbone）时，主体从 folder 变为 block，需重新取基线
    if (subj.kind !== gizmoDeltaBaseline.kind) captureGizmoDeltaBaseline();
    if (!gizmoDeltaBaseline) return;
    const cur = gizmoDeltaSnap(subj);
    const rows = [];
    for (const name in gizmoDeltaBaseline.vals) {
        const base = gizmoDeltaBaseline.vals[name];
        const now = cur[name];
        if (now === undefined) continue;
        let d = now - base;
        if (Math.abs(d) < 1e-6) continue;
        const deg = GIZMO_DELTA_DEG[name] === 1;
        // 对称面旋转走四元数欧拉分解，角度会绕回（350°→10°）：归一化到 [-180,180] 再显示，
        // 避免一转过 ±180 就冒出 ±350 的假增量。方块侧保持原口径，不动既有行为。
        if (deg && gizmoDeltaBaseline.kind === 'mirror') d = ((d + 540) % 360) - 180;
        if (Math.abs(d) < 1e-6) continue;
        const sign = d > 0 ? '+' : '';
        // ★ 显示小数位随当前精度档自适应：0.001 档 3 位、0.0001 档 4 位、1e-5 档 5 位……
        //   旧 toFixed(3) 会把细档增量抹成「0.000」，看似「增量表没显示」。至少保留 3 位保证可读性。
        const _gdhStep = gizmoPrecisionStep();
        const _gdhDecs = _gdhStep > 0 ? Math.max(3, gizmoPrecDecimals(_gdhStep)) : 3;
        // ★【2026-10-31】角度与数值同一口径：小数位跟随当前精度档
        //   （Ctrl 0.1° → 1 位、Shift+Ctrl 0.001° → 3 位），旧写法写死 toFixed(1)，
        //   细档拖出的 0.001°/0.0001° 级变化全被抹成「+0.0°」——用户看到的就是「旋转环只能显示 0.1 精度」。
        //   无按键档步长 1° → 0 位，Math.max(1, …) 保底 1 位，保持原有显示观感不变。
        const _degDecs = Math.max(1, _gdhStep > 0 ? gizmoPrecDecimals(_gdhStep) : 1);
        const txt = deg ? (sign + d.toFixed(_degDecs) + '°') : (sign + d.toFixed(_gdhDecs));
        rows.push('<div class="gdh-row"><span class="gdh-k">' + (GIZMO_DELTA_LABEL[name] || String(name).replace(/^v\./, '')) + '</span><span class="gdh-d ' + (d > 0 ? 'pos' : 'neg') + '">' + txt + '</span></div>');
    }
    const el = ensureGizmoDeltaHud();
    const title = gizmoDragTypeLabel() + ' · ' + gizmoDeltaBaseline.label + (gizmoDeltaBaseline.count > 1 ? (' ×' + gizmoDeltaBaseline.count + '块') : '');
    el.innerHTML = '<div class="gdh-head">' + title + '</div>'
        + '<div class="gdh-body">' + (rows.length ? rows.join('') : '<div class="gdh-row gdh-none">未改动</div>') + '</div>';
    el.style.display = 'block';
    // 固定在屏幕顶部居中（顶栏下方），不跟随光标/手指：手机端单指拖拽会遮住光标位置。
    el.style.left = '';
    el.style.top = gizmoDeltaHudTopOffset() + 'px';
}
function hideGizmoDeltaHud() {
    if (gizmoDeltaHudEl) gizmoDeltaHudEl.style.display = 'none';
    else { const el = document.getElementById('gizmoDeltaHud'); if (el) el.style.display = 'none'; }
}
function promptVarInput(vn, ev) { const n=performance.now(); if(n-lastPromptAt<650) return; lastPromptAt=n; const raw=window.prompt(`输入 ${vn.replace('v.','')} 的数值`, String(varValue(vn))); if(raw===null) return; const v=Number(raw.trim()); if(Number.isFinite(v)) setVarDirect(vn,v); if(ev) ev.preventDefault(); }
// 拖拽中 Gizmo 重建后，把 activePick 的元数据刷新到「同一个手柄」的最新状态。
// ★ 曾经的 bug：用 type+varName 找手柄 —— 缩放（scale）的 8 个角点 type/varName 完全相同，
//   `find` 永远命中 pickables 里第一个（= [-1,-1,-1] 角点）。于是拖任意其他角点时，
//   第一次重建后 activePick.axis 就被换成 1 号角点的轴：
//     · 与该角点屏幕方向同号（朝下）的角点 → 还能继续放大/缩小（碰巧对）；
//     · 方向相反（朝上）的角点 → 拖出去反而缩小、拖进来反而放大；
//     · x 分量相反的角点 → 投影互相抵消 → 完全拖不动（数值纹丝不动）。
//   表现为「只有右下/左上某几个角点能缩放，其他角点失灵」，与用户报的 Gizmo 时灵时不灵一致。
// 修法：按「最初抓到的那个对象」定位（_hitObj 在重建后仍指向旧网格，改用唯一 id 匹配）；
//       找不到（极端情况）才回退到 type+varName，且仅在唯一匹配时采用。
function refreshActivePickMeta(cx, cy) { cx=cx||lastPX; cy=cy||lastPY; if(!activePick) return;
    let fo = null;
    if (activePick._pickId) fo = pickables.find(o => o.userData.herPickId === activePick._pickId) || null;
    if (!fo) { const cand = pickables.filter(o => { const m=o.userData.her; return m&&m.type===activePick.type&&m.varName===activePick.varName; }); if (cand.length === 1) fo = cand[0]; }
    const f=fo?.userData?.her;
    if(f){ Object.assign(activePick,f,{_hitObj:fo}); if (fo && fo.userData.herPickId) activePick._pickId = fo.userData.herPickId; if(activePick.type==='rot') activePick.lastAngle=screenAngleFor(activePick,cx,cy);
        // ★ 重建后的拾取元数据里 axis 是建箭时的【局部基轴】，会把拖拽中已换算的剪切轴覆盖掉。
        //   非世界轴位移必须立即按当前剪切轴还原，否则下一帧投影/换算基准轴突变（拖拽中途跳方向）。
        if (!useWorldAxisDisplacement && herModes.has('base') && activePick.type === 'move' && activePick.varName && activePick.varName.includes('basepos')) {
            const sb = selected();
            if (sb) {
                const axes = shearedAxesOfBlock(sb);
                const an = activePick.axisName || (activePick.varName.includes('x') ? 'x' : activePick.varName.includes('y') ? 'y' : 'z');
                if (axes[an]) activePick.axis = axes[an].clone();
            }
        }
        makeActiveHighlight(activePick); } }

// ---------- 绑定模式按钮 ----------
document.querySelectorAll('.her-mode-btn:not([id])').forEach(b => { b.onclick = () => toggleHerMode(b.dataset.mode); });
// 文件夹专用的「旋转」按钮（带 id，需单独绑定；点击即进入 rotate 旋转模式，显示绕枢轴的旋转弧）
const _folderRotBtn = document.getElementById('folderRotBtn');
if (_folderRotBtn) _folderRotBtn.onclick = () => toggleHerMode('rotate');
// 绑定旋转模式下拉菜单
document.getElementById('localRotMenuBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTopDropdown('localRotDropdown');
});
document.getElementById('globalRotMenuBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTopDropdown('globalRotDropdown');
});
document.querySelectorAll('#localRotDropdown .top-dropdown-item, #globalRotDropdown .top-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllTopDropdowns();
        const mode = item.dataset.herMode;
        if (mode) toggleHerMode(mode);
    });
});
// 顶点捕捉下拉：先选对齐类型（位移移动型 / 枢轴移动型 / 沿边对齐 / 枢轴改到顶点），再进入捕捉流程
document.getElementById('vtxSnapMenuBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTopDropdown('vtxSnapDropdown');
});
document.querySelectorAll('#vtxSnapDropdown .top-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllTopDropdowns();
        vtxSnapMoveType = item.dataset.vtx || 'base';
        // Gizmo子控件记忆：记住顶点捕捉的对齐方式（下次开启顶点捕捉 / 换项目时沿用）
        if (gizmoSubMemoryOn()) gizmoSubMemorySave(null);
        vtxSnapUpdateBtnTitle();
        if (!herModes.has('vtxsnap')) toggleHerMode('vtxsnap');
        else {
            // 已在本模式内切换类型：先清掉上一种类型的取点状态，再按新类型重新进入
            if (vtxSnapPhase) vtxSnapExit();
            rebuildGizmo();
        }
    });
});
vtxSnapUpdateBtnTitle();
// 镜像入口已迁到方块列表的扳手「工具」菜单：①自由对称面 ②选取面作为对称面 ③三点确定对称面
// （懒绑定：菜单由 renderSideBlockList 动态重建，故每次重建时在菜单容器上挂一次委托）
// 关键帧模式：Gizmo 行「编辑/动画」两个互斥按钮（从左侧工具列表迁出）
const _kfEditBtn = document.getElementById('kfEditModeBtn');
if (_kfEditBtn) _kfEditBtn.addEventListener('click', () => { if (isKeyframeMode) exitKeyframeMode(); if (isBrushMode) exitBrushMode(); syncModeButtons(); });
const _kfAnimBtn = document.getElementById('kfAnimModeBtn');
if (_kfAnimBtn) _kfAnimBtn.addEventListener('click', () => { if (isBrushMode) exitBrushMode(); if (!isKeyframeMode) enterKeyframeMode(); });
// 初始化一次按钮视觉状态（默认编辑模式）
syncKfModeUI();

// ==================== 键盘快捷键 ====================
window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    let isEditable = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable || activeEl.getAttribute('contenteditable') === 'true');
    // ★★ AI 对话框是「消息框」不是「文档编辑器」：发送后内容已被清空，此时按 Ctrl+Z 在文本层面
    //   无事可撤销，而用户真正想撤的是 AI 刚在场景里做的操作。若不特殊处理，焦点仍留在
    //   #aiChatInput（发送后不 blur），isEditable 判定为真 ⇒ 撤销被让给浏览器原生文本框撤销
    //   ⇒ 表现为「AI 的操作无法撤回」（用户 2026-10-04 报障）。
    //   判据：焦点在 AI 输入框 **且输入框当前为空** ⇒ 视为非编辑态，放行到场景撤销。
    //   输入框里有文字时仍然交给原生文本撤销（保留打字回退体验）。
    if (isEditable && activeEl.id === 'aiChatInput' && !(activeEl.value || '').length) isEditable = false;
    const key = e.key.toLowerCase();
    // 编辑文本时，方向键交给文本框处理（移动光标），不要平移相机
    if (isEditable && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.stopImmediatePropagation(); return; }
    // 文本框/输入框聚焦时，Ctrl+Z / Ctrl+Y 交给浏览器原生撤销/重做：
    // 原生撤销只回退文本、不重建面板（并触发 input 把 program 同步回去），
    // 否则全局接管会触发整面板重渲染，把 molang 编辑器被手动拖高的高度重置掉。
    if (e.ctrlKey && (key === 'z' || e.code === 'KeyZ')) { if (isEditable) return; e.preventDefault(); safeUndo(); return; }
    if (e.ctrlKey && (key === 'y' || e.code === 'KeyY')) { if (isEditable) return; e.preventDefault(); safeRedo(); return; }
    if (e.ctrlKey && (key === 'd' || e.code === 'KeyD') && !isEditable) { e.preventDefault(); duplicateSelectedBlocks(); return; }
    // Ctrl+C：把选中方块复制进剪贴板（选中状态不变，原方块保持选中）；无选中则放行浏览器原生复制
    if (e.ctrlKey && (key === 'c' || e.code === 'KeyC') && !isEditable) {
        if (copySelectedToClipboard()) { e.preventDefault(); }
        return;
    }
    // Ctrl+V：从剪贴板粘贴方块（原选中方块仍保持选中，新方块并入多选集合）
    if (e.ctrlKey && (key === 'v' || e.code === 'KeyV') && !isEditable) {
        if (pasteFromClipboard()) { e.preventDefault(); }
        return;
    }
    // 【2026-09-19】关键帧窗口打开时，Del/Backspace 只管理「关键帧」，绝不删方块。
    //   旧实现无此分支 → 按键落到下面的 deleteSelectedBlocks()，用户想删关键帧却把方块删了
    //   （用户反馈：「按住关键帧点 del 直接删除一整个方块」）。
    //   窗口可见时一律接管（有帧则删当前编辑帧；无帧则不动，避免误删方块）；
    //   窗口未打开/不可见时保持原有删方块行为不变。
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isEditable && !isMouseInPanel && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const _kfWin = document.getElementById('keyframeWindow');
            if (keyframeWindowOpen && _kfWin && _kfWin.style.display !== 'none') {
                e.preventDefault();
                deleteCurrentKeyframe(); // 有帧就删当前编辑帧；无帧则安全无操作
                return;
            }
        }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditable && !isMouseInPanel) { e.preventDefault(); deleteSelectedBlocks(); return; }
    // （Ctrl+Shift+E「显示指令列表」快捷键已按要求移除；该功能仍可通过顶部「导出」按钮 / 操作菜单进入）
    if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); return; }
    // N：打开「新建模型」选择面板（方块/平面/半砖/楼梯/旗帜）；输入框/带修饰键（Ctrl/Alt/Meta）时不触发，避免与 Alt+N 切换操作模式冲突
    if (key === 'n' && !e.ctrlKey && !e.altKey && !e.metaKey && !isEditable && !isKeyframeMode) {
        e.preventDefault();
        showCreateBlockMenu();
        return;
    }
    // —— 新操作模式：Gizmo 模式快捷键（仅新操作模式且非画笔模式、非输入框）——
    // P 枢轴 / V 位移 / S 缩放 / R 局部旋转(用户所选子模式) / Shift+R 全局旋转(用户所选子模式)
    if (isNewLayoutMode && !isBrushMode && !isEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (key === 'p') { e.preventDefault(); toggleHerMode('origin'); return; }
        if (key === 'v') { e.preventDefault(); toggleHerMode('base'); return; }
        if (key === 's') { e.preventDefault(); if (!selectedFolder) toggleHerMode('scale'); return; }
        if (key === 'r' && !e.shiftKey) { e.preventDefault(); toggleHerMode(currentLocalRotMode); return; }
        if (key === 'r' && e.shiftKey) { e.preventDefault(); toggleHerMode(currentGlobalRotMode); return; }
        // X：顶点捕捉（对齐类型沿用上次选择；默认「位移移动型对齐」）
        if (key === 'x' && !e.shiftKey) { e.preventDefault(); if (!selectedFolder) toggleHerMode('vtxsnap'); return; }
    }
});

