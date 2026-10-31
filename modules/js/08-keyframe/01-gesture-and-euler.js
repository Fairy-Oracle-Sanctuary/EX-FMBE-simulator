/* 08-keyframe/01-gesture-and-euler.js · 源 测试版v.6b79.html 第 38539-40042 行 */
'use strict';
// ====================================================================
// 关键帧动画系统
// ====================================================================

// 关键帧数据结构: Map<blockId, { frames: Map<time, Map<varName, value>>, animId: string }>
// keyframeData 已在上方提前声明
let keyframeWindowOpen = false;
let keyframeWindowEl = null;
let selectedKeyframeBlock = null; // 当前在关键帧窗口中选中的方块
let keyframePlayTimer = null;
let keyframePlaying = false;
let keyframeCurrentTime = 0;
let keyframeAnimDuration = 10; // 默认10秒
let keyframeFps = 60;
let keyframeZoom = 1.0; // 时间轴缩放倍数（1 ~ 100）
let keyframeScrollOffset = 0; // 时间轴滚动偏移（秒）
const KEYFRAME_BASE_VIEW = 10; // 1x 缩放下显示的基准秒数
let keyframeDragging = false; // 正在拖拽播放头
let keyframeSnappedTime = null; // ★【2026-10-18】播放头当前吸附到的关键帧时刻（null=未吸附，用于视觉提示）
/* ★【2026-10-19】轨道行按下手势：区分「点选方块」与「拖时间轴」。
   时间轴只能按住某方块轨道左右拖动来移动播放头，而该手势过去会同时触发轨道行的 click
   ⇒ 单选重置、多选集合被清空（用户投诉「一拖时间轴多选就没了」）。
   kfTrackPressPoint：轨道行按下的起点坐标；
   kfTrackWasDrag：松手时总位移超阈值（10px）⇒ 本次手势是「拖时间轴」而非「点选方块」，
   click 处理器消费一次后立即清掉（无时间窗，避免「点按被永久吞掉」）。 */
let kfTrackPressPoint = null;
let kfTrackWasDrag = false;
_kfSystemReady = true; // 关键帧系统已就绪

// 清除非关键帧动画方块的选中状态
function clearNonKeyframeSelection() {
    for (const b of Array.from(selectedBlocksSet)) {
        // Molang 编辑模式方块整体退出关键帧系统 → 进关键帧模式时不清掉它的选中，
        // 这样它可以和关键帧方块一起被选中/一起多选（用户 09-27 要求）。
        if (!isMolangModeBlock(b) && !(_kfSystemReady && keyframeData.has(b.id))) {
            selectedBlocksSet.delete(b);
        }
    }
    if (selectedBlock && !isMolangModeBlock(selectedBlock) && !(_kfSystemReady && keyframeData.has(selectedBlock.id))) {
        selectBlock(null);
        renderVariablesForBlock(null);
    }
    blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
}

// 进入/退出关键帧编辑模式（新操作模式使用）
// 关键帧编辑单位模式：true=整组编辑（文件夹 Gizmo：枢轴/位移/旋转，无缩放），false=单方块编辑
let kfGroupEdit = false;
// 关键帧窗口顶部的「编辑单位」标签：用户要求取消「整组编辑 / 单体编辑」切换及文字提示，
// 文件夹骨骼在关键帧模式下已锁定为整体编辑，故直接隐藏该标签。
function updateKfEditUnitLabel() {
    const el = document.getElementById('kfEditUnit');
    if (el) el.style.display = 'none';
}

function enterKeyframeMode() {
    isKeyframeMode = true;
    // 画笔与编辑 / 动画互斥：进入动画先退出画笔模式
    if (isBrushMode) { try { exitBrushMode(); } catch (e) {} }
    // 同步 Gizmo 行开关/按钮状态，并隐藏方块列表（动画模式下方块列表完全不显示）
    syncKfModeUI();
    // 先捕获文件夹种子：clearNonKeyframeSelection 在 selectedBlock 非空(且无关键帧数据)时会
    // selectBlock(null)，连带清空 selectedFolder；若不先捕获，整组编辑分支就进不去，
    // 关键帧模式对文件夹及其骨骼会完全失效（用户设骨干后直接进关键帧就踩这个）。
    const seedName0 = selectedFolder || (selectedBlock && selectedBlock.group ? selectedBlock.group : null);
    // 进入动画前用户选中的方块：项目里还没有任何动画方块时用它兜底，保证时间表不是空的
    const seedBlock0 = selectedBlock;
    // ★★【2026-10-13 回退】新操作模式**必须**自动打开关键帧浮动窗：
    //   它是「+关键帧 / ▶播放 / 时间轴拖动 / 总时长」的唯一载体（侧栏时间表只管"改"）。
    //   上一版在这里加了 `if (!isNewLayoutMode)` 想"统一入口"，结果新操作模式下方块列表
    //   被时间表整体取代、浮动窗又不弹 ⇒ **录帧入口完全消失**（用户实测投诉）。
    //   现在：浮动窗照常自动打开；侧栏时间表额外提供 +关键帧 / ▶ 播放 的快捷入口，两条路都通。
    if (!keyframeWindowOpen) openKeyframeWindow();
    else if (keyframeWindowEl) keyframeWindowEl.style.display = 'flex';
    clearNonKeyframeSelection();
    const seedName = seedName0 || selectedFolder || (selectedBlock && selectedBlock.group ? selectedBlock.group : null);
    if (seedName && getFolder(seedName)) {
        const kids = getFolderAllCubeIds(seedName).map(id => blocks.find(b => b.id === id)).filter(Boolean);
        if (kids.length) {
            selectedBlocksSet.clear();
            kids.forEach(k => selectedBlocksSet.add(k));
            selectedFolder = seedName;   // 保持文件夹选中 → 文件夹 Gizmo（无缩放、世界轴旋转/位移）
            selectedBlock = null;        // 让 selected() 返回 null → 走文件夹 Gizmo 分支
            kfGroupEdit = true;          // 整组编辑模式
            const seed = kids.find(k => keyframeData.has(k.id)) || kids[0];
            selectedKeyframeBlock = seed.id;
            blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));

            // 自动把整个文件夹层级连成骨骼树：每个含方块的文件夹设骨干（含单块文件夹，
            // 骨干在方块列表显示为斜体），并按 parentName 把子文件夹骨干 ✛ 绑定到父文件夹骨干
            // （bone→bone1 层级旋转/位移实时联动 = 自动紫色加号绑定）。用整树同步替代
            // 原先只给当前文件夹设骨干 —— 否则跨文件夹子骨骼（bone1）收不到父骨骼姿态。
            // force=true：用户已明确"将骨骼添加进动画"= enterKeyframeMode，无视 hasPerBlockKf 守卫
            // （含逐方块关键帧的文件夹也强制设骨干），并保护子块已有 keyframeData 不被清空/枢轴被篡改
            // （用户报："手动设子骨骼骨干时原本模型的枢轴被篡改" —— 根因是 bindBone 清 keyframeData 并重算位置）。
            syncFolderBoneHierarchy(null, { force: true });
            if (typeof renderSideBlockList === 'function') renderSideBlockList();

            if (isNewLayoutMode) renderSideBlockList();
            requestGizmoRefresh();
            updateToolbar(true);
            renderKeyframeTimeline();
            renderKeyframeDataPanel();
            updateKfEditUnitLabel();
            return;
        }
    }
    const animBlock = blocks.find(b => _kfSystemReady && keyframeData.has(b.id));
    if (animBlock) {
        selectedBlocksSet.add(animBlock);
        selectBlock(animBlock);
        selectKeyframeBlock(animBlock.id);
    } else {
        // ★★【2026-10-13 修复】关键帧模式下「把刚选中的普通方块踢掉」导致录帧入口消失：
        //   clearNonKeyframeSelection() 会把没有关键帧数据的方块从选区删除（它本是给"动画方块"
        //   高亮用的），但新操作模式下侧栏已被「关键帧时间表」整体取代 —— 一旦当前方块被踢掉，
        //   时间表就是空的（"选择或添加一个方块开始编辑关键帧"），用户既看不到数值列也没有
        //   可点的变量，自然觉得"关键帧列表面板不见了、没法创建关键帧"（用户实测投诉）。
        //   现在：项目里还没有任何动画方块时，把用户进来之前选中的方块**保留为编辑目标**，
        //   这样时间表立刻显示它的变量，+关键帧 一点就能录第一帧。
        const keep = (seedBlock0 && blocks.includes(seedBlock0)) ? seedBlock0 : (blocks[0] || null);
        if (keep) {
            selectedBlocksSet.add(keep);
            selectBlock(keep);
            selectKeyframeBlock(keep.id);
        }
    }
    renderSideBlockList();
}
function exitKeyframeMode() {
    isKeyframeMode = false;
    // ★【2026-10-22】退出关键帧模式时复位「数据」视图，避免下次进入时停留在数据视图而看不到时间轴
    kfDataView = false;
    /* ★【2026-10-19 修复】复位「多选锁定」：按钮藏在关键帧窗口里，退出动画模式后窗口隐藏，
       用户无法再关闭它（kfInKeyframeContext 虽已保证它不影响普通编辑，但按钮态会残留成「多选中」），
       这里主动清掉并同步按钮文案/高亮，避免下次进入时状态与视觉不一致。 */
    kfResetMselLock();
    /* ★【2026-10-20 修复】播放现在允许「窗口关着也继续跑」，故退役模式时必须无条件停播放，
       不能再挂在 `keyframeWindowOpen` 条件下 —— 否则收窗播放后退出关键帧模式，定时器会永远留在后台。 */
    stopKeyframePlayback();
    if (keyframeWindowOpen && keyframeWindowEl) {
        keyframeWindowEl.style.display = 'none';
        keyframeWindowOpen = false;
    }
    for (const b of Array.from(selectedBlocksSet)) {
        if (_kfSystemReady && keyframeData.has(b.id)) selectedBlocksSet.delete(b);
    }
    if (selectedBlock && _kfSystemReady && keyframeData.has(selectedBlock.id)) {
        const firstNonAnim = blocks.find(b => !_kfSystemReady || !keyframeData.has(b.id));
        if (firstNonAnim) selectBlock(firstNonAnim);
        else selectBlock(null);
    }
    renderSideBlockList();
    requestGizmoRefresh();
    // 同步 Gizmo 行开关/按钮状态，并恢复方块列表（退出动画模式后列表重新显示）
    syncKfModeUI();
}
// 同步关键帧模式 UI：Gizmo 行「开关 + 编辑/动画两个独立按钮」的状态，
// 以及动画模式下隐藏方块列表（含工具列表里的新建方块 / 新建文件夹 / 工具三个按键）。
// 编辑 / 画笔 / 动画 三个模式按钮互斥：同一时刻仅一个高亮（画笔与关键帧互斥，编辑 = 两者都不在）。
function syncModeButtons() {
    const editBtn = document.getElementById('kfEditModeBtn');
    const brushBtn = document.getElementById('brushModeBtn');
    const animBtn = document.getElementById('kfAnimModeBtn');
    if (editBtn) editBtn.classList.toggle('active', !isBrushMode && !isKeyframeMode);
    if (brushBtn) brushBtn.classList.toggle('active', !!isBrushMode);
    if (animBtn) animBtn.classList.toggle('active', !!isKeyframeMode);
}

// 该函数被 enterKeyframeMode / exitKeyframeMode / applyNewLayoutMode / 初始化 调用。
function syncKfModeUI() {
    syncModeButtons();
    // 动画模式不再隐藏方块列表：两个模式都可以管理 / 新建方块，只是关键帧编辑态不同
}

// 获取当前可见窗口时长
function getViewDuration() {
    return Math.min(keyframeAnimDuration, KEYFRAME_BASE_VIEW / keyframeZoom);
}
// 将时间 t 转换为可见窗口内的百分比位置
function timeToPct(t) {
    const vd = getViewDuration();
    if (vd <= 0) return 0;
    return (t - keyframeScrollOffset) / vd;
}

/* ★★★【2026-10-19 新增 · 用户要求「拖动关键帧本身也要吸附」】
   时间吸附的**统一咽喉函数**：播放头拖动（scrubToClientX）与关键帧拖动（时间轴菱形 pointermove/up）
   共用同一口径 —— 在【所有轨道的所有关键帧时刻】里找离 rawT 最近者，像素距离 ≤ KF_SNAP_PX(8px) 就吸附。
   以【像素】为口径 ⇒ 无论缩放多少手感一致（与剪辑软件一致）。
   excludeTimes：正在被拖动的那些帧【自身的时刻】，剔除掉避免拖拽时被自己吸住（原地粘滞）。
   返回吸附到的时刻（已按 1ms 量化）或 null（未吸附）。 */
const KF_SNAP_PX = 8;
function kfFindSnapTime(rawT, rectW, excludeTimes) {
    const snapDelta = (KF_SNAP_PX / Math.max(1, rectW)) * getViewDuration();
    let bestD = Infinity, bestT = null;
    const consider = (tt) => {
        if (excludeTimes && excludeTimes.has(tt)) return;
        const d = Math.abs(tt - rawT);
        if (d < bestD) { bestD = d; bestT = tt; }
    };
    try {
        keyframeData.forEach(d => { if (d && d.frames) d.frames.forEach((_v, k) => consider(k)); });
        if (typeof boneKeyframes !== 'undefined' && boneKeyframes) boneKeyframes.forEach(d => { if (d && d.frames) d.frames.forEach((_v, k) => consider(k)); });
    } catch (e) { }
    return (bestT !== null && bestD <= snapDelta) ? kfQuantTime(bestT) : null;
}

// ==================== 欧拉角转换（rotate → rot）====================
// ===== 紫色加号显式绑定骨骼：父块转换时子链姿态保持（级联转换）=====
// 【为什么必须级联】子块位置 molang 是  v.xpos = t.父_px + pR·xbasepos_bone，
//   pR 只由【父的 v.rotatex/y/z】构建（rotate-only 硬约束：t.父_xrot 发布的就是父 v.rotatex）；
//   子块旋转同样是  v.rotatex = t.父_xrot。父做欧拉角转换后父 rotate 被清 0、旋转折进父 xrot，
//   父自身视觉不变，但发布给子的【骨骼旋转源】归零 ⇒
//     ① pR 退化为单位矩阵 → 子块塌回 xbasepos_bone 原始坐标，漂移 = off − R_old·off；
//     ② 子块 rotate 归零 → 世界朝向丢掉父那一份旋转（父 rotatex=30 时实测丢 30°）。
//   所以父转换时必须把「父原本那份旋转」等效搬进子链自身：位置搬进 xbasepos_bone，朝向搬进子 xrot。
// 【关键】子块的 v.rotatex = t.父_xrot 表达式【绝不改动】，骨骼跟随不断——
//   父之后再旋转 rotate，子块照旧实时跟随；本次只是把「转换掉的那份静态倾斜」固化进子块自身参数。
// 【范围】只处理 isExplicitBoneBinding（紫色加号显式绑定）的链；文件夹骨骼自动绑定不在此列。
// 收集显式绑定子链（含多级子孙），BFS 保证父序先于子序，不含 root 自身
function collectExplicitBoneDescendants(rootId) {
    const out = [];
    const seen = new Set([rootId]);
    const queue = [rootId];
    let guard = 0;
    while (queue.length && guard++ < 4096) {
        const pid = queue.shift();
        for (const b of blocks) {
            if (seen.has(b.id)) continue;
            if (b._boneParent === pid && isExplicitBoneBinding(b)) {
                seen.add(b.id);
                out.push(b.id);
                queue.push(b.id);
            }
        }
    }
    return out;
}
// 读变量数值，缺变量时返回与 scope.toM() 一致的默认值（scale/extend_scale 默认 1，其余 0）。
// 不能用 vnum：它对缺失变量返回 0，会让 _kfWorldToVars 的 L 矩阵按 scale=0 病态求逆 → 朝向反解错乱。
function _vnumOr(b, name, dflt) {
    const d = b.scope.vars.get(name);
    return d && Number.isFinite(Number(d.value)) ? Number(d.value) : dflt;
}
// 转换前快照：整条显式子链（含 root）的世界矩阵 + 枢轴坐标。无子链返回 null（零开销）
function snapshotExplicitBoneChain(rootBlock) {
    const order = collectExplicitBoneDescendants(rootBlock.id);
    if (!order.length) return null;
    const pose = new Map();
    const put = (b) => {
        try {
            pose.set(b.id, {
                W: _blockWorldMatrix(b),
                pivot: [vnum(b, 'v.xpos'), vnum(b, 'v.ypos'), vnum(b, 'v.zpos')]
            });
        } catch (_) {}
    };
    put(rootBlock);
    order.forEach(id => { const b = blocks.find(x => x.id === id); if (b) put(b); });
    return { rootId: rootBlock.id, order, pose };
}
// 转换后重建：按快照把子链世界姿态还原到转换前（位置 + 朝向都零漂移）
//   ① 朝向：xrot_new 由「转换前世界矩阵」矩阵反解（_kfWorldToVars）。绝不做欧拉角相加 ——
//      R(a)·R(b) ≠ R(a+b)，多轴大角度必然跳变（此前 own_bone_rot* 相加方案已被驳回）。
//   ② 位置：off_new = R(父新rotate)⁻¹·(子枢轴_旧 − 父枢轴_旧)。父枢轴取【快照值】而非当前值，
//      因为多级链里父自己也在本轮被重建，用快照可消除处理顺序依赖。父新 rotate 已归零时即 R_old·off_old。
//   只写 xbasepos_bone / xrot，绝不碰 v.xpos（molang 跟随表达式）与 basepos（几何局部偏移）。
function reapplyExplicitBoneChain(snap) {
    if (!snap || !snap.order.length) return 0;
    blocks.forEach(b => { try { b.refresh(); } catch (_) {} });
    let n = 0;
    snap.order.forEach(id => {
        const cb = blocks.find(x => x.id === id);
        const rec = cb && snap.pose.get(id);
        if (!cb || !rec) return;
        // ① 朝向：rotate 已随父归零，把丢掉的那份旋转吸进子块自身 rot
        try {
            const bv = {
                rotatex: _vnumOr(cb, 'v.rotatex', 0), rotatey: _vnumOr(cb, 'v.rotatey', 0), rotatez: _vnumOr(cb, 'v.rotatez', 0),
                extend_scale: _vnumOr(cb, 'v.extend_scale', 1), extend_xrot: _vnumOr(cb, 'v.extend_xrot', 0),
                extend_yrot: _vnumOr(cb, 'v.extend_yrot', 0), scale: _vnumOr(cb, 'v.scale', 1)
            };
            const s = _kfWorldToVars(bv, rec.W);
            if (s && Number.isFinite(s.xrot) && Number.isFinite(s.yrot) && Number.isFinite(s.zrot)) {
                setConstVarValue(cb, 'v.xrot', s.xrot);
                setConstVarValue(cb, 'v.yrot', s.yrot);
                setConstVarValue(cb, 'v.zrot', s.zrot);
            }
        } catch (_) {}
        // ② 位置：按转换前枢轴差在父的新 rotate 坐标系里反解 xbasepos_bone
        try {
            const pp = cb._boneParent ? blocks.find(x => x.id === cb._boneParent) : null;
            const prec = pp ? snap.pose.get(pp.id) : null;
            if (pp && prec && cb.scope.vars.has('v.xbasepos_bone')) {
                const RpInv = boneParentMatrix(
                    _vnumOr(pp, 'v.rotatex', 0), _vnumOr(pp, 'v.rotatey', 0), _vnumOr(pp, 'v.rotatez', 0)
                ).clone().invert();
                const off = new THREE.Vector3(
                    rec.pivot[0] - prec.pivot[0], rec.pivot[1] - prec.pivot[1], rec.pivot[2] - prec.pivot[2]
                ).applyMatrix3(RpInv);
                if (Number.isFinite(off.x) && Number.isFinite(off.y) && Number.isFinite(off.z)) {
                    setConstVarValue(cb, 'v.xbasepos_bone', _r4(off.x));
                    setConstVarValue(cb, 'v.ybasepos_bone', _r4(off.y));
                    setConstVarValue(cb, 'v.zbasepos_bone', _r4(off.z));
                }
            }
        } catch (_) {}
        n++;
    });
    blocks.forEach(b => { try { b.refresh(); } catch (_) {} });
    return n;
}
// 将选中方块的 rotatex/rotatey/rotatez 合并到 xrot/yrot/zrot 中并删除 rotate 变量
// cascadeOut：可选 Set，回填本次被级联处理的子块 id，供调用方去重（严禁对同一子块二次转换）
function eulerAngleConvertBlock(block, cascadeOut) {
    const vars = block.scope.vars;
    const hasRotate = vars.has('v.rotatex') || vars.has('v.rotatey') || vars.has('v.rotatez');
    if (!hasRotate) return 'no-rotate';

    // ★ 骨骼子块防护：v.rotatex/y/z 若是跟随父级的 molang 表达式（含 t. 引用，如 t.父_xrot），
    //   不可折进 xrot 后删除——那会剪断子块对父旋转的骨骼跟随（v.rotatex = t.父_xrot 是 bindBone 注入的）。
    //   仅拦截「molang 跟随」这一类；文件夹骨骼无动画态子块（v.rotatex 是普通数值）不受影响，照常转换。
    const _isBoneMol = (nm) => {
        const d = vars.get(nm);
        return !!d && typeof d.expr === 'string' && /(^|[^A-Za-z0-9_])t\./.test(d.expr);
    };
    if (_isBoneMol('v.rotatex') || _isBoneMol('v.rotatey') || _isBoneMol('v.rotatez')) {
        if (typeof showTechBubble === 'function')
            showTechBubble('无法转换', '该方块是骨骼子块，rotate 是跟随父级的 molang 表达式（t.父_*），直接转成 xrot 会切断骨骼跟随。请改为选中它的【父骨骼方块】执行转换——子块会自动级联转换并补偿 basepos_bone，姿态零漂移。', { variant: 'warn' });
        else if (typeof showModal === 'function')
            showModal('无法转换', '该方块是骨骼子块，请改为选中其父骨骼方块执行转换（子块会自动级联转换）。');
        return 'bone-blocked';
    }

    // ★ 转换前快照显式绑定子链（紫色加号）的世界姿态：本块 rotate 一旦清 0，
    //   发布给子块的骨骼旋转源（t.本块_xrot = v.rotatex）随之归零 → 子链位置漂移 + 朝向丢失。
    //   快照必须在改写 rotate 之前采集。无显式子链时返回 null，零开销。
    const _boneChainSnap = snapshotExplicitBoneChain(block);

    const rotatex = vars.get('v.rotatex')?.value ?? 0;
    const rotatey = vars.get('v.rotatey')?.value ?? 0;
    const rotatez = vars.get('v.rotatez')?.value ?? 0;
    const xrot = vars.get('v.xrot')?.value ?? 0;
    const yrot = vars.get('v.yrot')?.value ?? 0;
    const zrot = vars.get('v.zrot')?.value ?? 0;

    const d2r = d => d * Math.PI / 180;
    const r2d = r => r * 180 / Math.PI;
    const Rx = r => [1,0,0, 0,Math.cos(r),-Math.sin(r), 0,Math.sin(r),Math.cos(r)];
    const Ry = r => [Math.cos(r),0,Math.sin(r), 0,1,0, -Math.sin(r),0,Math.cos(r)];
    const Rz = r => [Math.cos(r),-Math.sin(r),0, Math.sin(r),Math.cos(r),0, 0,0,1];
    const mMul = (A,B) => {
        const C = new Array(9);
        for (let i=0;i<3;i++) for (let j=0;j<3;j++) { let s=0; for(let k=0;k<3;k++) s+=A[i*3+k]*B[k*3+j]; C[i*3+j]=s; }
        return C;
    };

    let R = Ry(d2r(-rotatey));
    R = mMul(R, Rx(d2r(rotatex)));
    R = mMul(R, Rz(d2r(-rotatez)));
    R = mMul(R, Ry(d2r(-yrot)));
    R = mMul(R, Rx(d2r(xrot)));
    R = mMul(R, Rz(d2r(-zrot)));

    const sb = -R[1*3+2];
    const cb = Math.sqrt(Math.max(0, 1 - sb*sb));
    let newXrot, newYrot, newZrot;
    if (Math.abs(cb) < 1e-12) {
        newXrot = r2d(Math.asin(sb));
        newYrot = 0;
        newZrot = 0;
    } else {
        const b = Math.asin(sb);
        const c = Math.atan2(R[1*3+0]/cb, R[1*3+1]/cb);
        const a = Math.atan2(R[0*3+2]/cb, R[2*3+2]/cb);
        newXrot = r2d(b);
        newYrot = -r2d(a);
        newZrot = -r2d(c);
    }

    const setVal = (name, val) => {
        const d = vars.get(name);
        if (d) {
            const rounded = Math.round(val * 10000) / 10000;
            d.expr = String(rounded);
            d.value = rounded;
        }
    };
    setVal('v.xrot', newXrot);
    setVal('v.yrot', newYrot);
    setVal('v.zrot', newZrot);

    // 不删除 rotate 变量，仅置 0（保留变量，避免破坏其它引用/骨骼 molang 上下文）
    setVal('v.rotatex', 0);
    setVal('v.rotatey', 0);
    setVal('v.rotatez', 0);

    // ★ 级联：本块 rotate 已清 0，按快照把显式绑定子链的世界姿态原样还原
    //   （位置 → xbasepos_bone，朝向 → 子块自身 xrot；子块 v.rotatex=t.父_xrot 表达式不动）。
    if (_boneChainSnap) {
        try { block.refresh(); } catch (_) {}
        reapplyExplicitBoneChain(_boneChainSnap);
        if (cascadeOut && typeof cascadeOut.add === 'function') _boneChainSnap.order.forEach(id => cascadeOut.add(id));
    }

    return true;
}

// 关键帧模式下：换算选中帧的方块关键帧数据的 rotate 变量
function eulerAngleConvertKeyframe(blockId, time) {
    if (!keyframeData.has(blockId)) return false;
    const data = keyframeData.get(blockId);
    if (data.frames.size === 0) return false;

    const interpolated = interpolateKeyframes(blockId, time);
    if (!interpolated) return false;

    const hasRotate = ('rotatex' in interpolated) || ('rotatey' in interpolated) || ('rotatez' in interpolated);
    if (!hasRotate) return 'no-rotate';

    // ★ 骨骼子块防护：关键帧态下骨骼子块的 rotate 也是跟随父级的 molang（t.父_*），转换会剪断跟随。
    const _isBoneMolKf = (nm) => typeof interpolated[nm] === 'string' && /(^|[^A-Za-z0-9_])t\./.test(interpolated[nm]);
    if (_isBoneMolKf('rotatex') || _isBoneMolKf('rotatey') || _isBoneMolKf('rotatez')) {
        if (typeof showTechBubble === 'function')
            showTechBubble('无法转换', '该关键帧方块为骨骼子块，其 rotate 是跟随父级的 molang 表达式（t.父_*），不能转为 xrot。如需转换，请先解除骨骼绑定。', { variant: 'warn' });
        else if (typeof showModal === 'function')
            showModal('无法转换', '该关键帧方块为骨骼子块，rotate 是跟随父级的 molang 表达式，不能转为 xrot。');
        return 'bone-blocked';
    }

    const d2r = d => d * Math.PI / 180;
    const r2d = r => r * 180 / Math.PI;
    const Rx = r => [1,0,0, 0,Math.cos(r),-Math.sin(r), 0,Math.sin(r),Math.cos(r)];
    const Ry = r => [Math.cos(r),0,Math.sin(r), 0,1,0, -Math.sin(r),0,Math.cos(r)];
    const Rz = r => [Math.cos(r),-Math.sin(r),0, Math.sin(r),Math.cos(r),0, 0,0,1];
    const mMul = (A,B) => {
        const C = new Array(9);
        for (let i=0;i<3;i++) for (let j=0;j<3;j++) { let s=0; for(let k=0;k<3;k++) s+=A[i*3+k]*B[k*3+j]; C[i*3+j]=s; }
        return C;
    };
    /* 把一组 rotate/xrot/yrot/zrot 合成为同一旋转，再分解回 xrot/yrot/zrot（引擎旋转顺序约定） */
    const composeRot = (rotatex, rotatey, rotatez, xrot, yrot, zrot) => {
        let R = Ry(d2r(-rotatey));
        R = mMul(R, Rx(d2r(rotatex)));
        R = mMul(R, Rz(d2r(-rotatez)));
        R = mMul(R, Ry(d2r(-yrot)));
        R = mMul(R, Rx(d2r(xrot)));
        R = mMul(R, Rz(d2r(-zrot)));

        const sb = -R[1*3+2];
        const cb = Math.sqrt(Math.max(0, 1 - sb*sb));
        if (Math.abs(cb) < 1e-12) {
            return { xrot: r2d(Math.asin(sb)), yrot: 0, zrot: 0 };
        }
        const b = Math.asin(sb);
        const c = Math.atan2(R[1*3+0]/cb, R[1*3+1]/cb);
        const a = Math.atan2(R[0*3+2]/cb, R[2*3+2]/cb);
        return { xrot: r2d(b), yrot: -r2d(a), zrot: -r2d(c) };
    };

    const round4 = v => Math.round(v * 10000) / 10000;

    /* ★★【2026-10-24 修复「转换会把所有帧的旋转改成同一个值」】
       旧实现：只按**当前时刻插值**算出一组角度，然后遍历所有帧把这同一组写进去
       ⇒ 每帧各自的旋转姿态被抹平（用户投诉：所有帧的旋转都变了、而且各帧都一样）。
       正确语义：**逐帧独立转换** —— 每一帧用它自己存储的 rotate 与 xrot/yrot/zrot 求复合旋转再分解，
       结果只写回该帧自己。帧内缺某个键时，用该帧时间点的插值结果兜底（保证与相邻帧连续）。 */
    const valueAt = (map, n, fb) => {
        if (!map) return fb;
        const v = map[n];
        return (typeof v === 'number' && Number.isFinite(v)) ? v : fb;
    };
    /* ★必须先按【转换前】的数据为每帧预先算好插值兜底 ——
       若在循环里边转边查，后一帧的兜底会读到刚被改写的前一帧（xrot 已被写成转换结果），
       姿态会被叠加两次（实测 20°/50°/80° 转成 20°/70°/30°）。 */
    const frameList = Array.from(data.frames.entries());
    const interpBefore = new Map();
    for (const [ft] of frameList) {
        interpBefore.set(ft, (Math.abs(ft - time) < 1e-9) ? interpolated : (interpolateKeyframes(blockId, ft) || interpolated));
    }
    for (const [ft, frameMap] of frameList) {
        const at = interpBefore.get(ft);
        const own = (n) => {
            if (frameMap.has(n)) {
                const v = frameMap.get(n);
                if (typeof v === 'number' && Number.isFinite(v)) return v;
            }
            return valueAt(at, n, 0);
        };
        const out = composeRot(own('rotatex'), own('rotatey'), own('rotatez'), own('xrot'), own('yrot'), own('zrot'));
        // 该帧的 rotate 已折算进 rot → 置 0；rot 写回该帧自己的分解结果
        frameMap.set('rotatex', 0);
        frameMap.set('rotatey', 0);
        frameMap.set('rotatez', 0);
        frameMap.set('xrot', round4(out.xrot));
        frameMap.set('yrot', round4(out.yrot));
        frameMap.set('zrot', round4(out.zrot));
    }

    return true;
}

// 通用欧拉角转换入口（处理选中方块）
function applyEulerAngleConversion() {
    const isKfActive = isNewLayoutMode && isKeyframeMode && selectedKeyframeBlock;
    let blocksToConvert = [];
    let converted = 0, noRotate = 0, boneBlocked = 0;
    // 骨骼子链级联统计（静态模式）：cascadedChildren=被父块级联转换的子块数；dedupSkipped=预筛掉的重复选中子块数
    let cascadedChildren = 0, dedupSkipped = 0;

    if (isKfActive) {
        const bid = selectedKeyframeBlock;
        const block = blocks.find(b => b.id === bid);
        if (!block) { showModal("提示", "未选中动画方块", null, false); return; }
        const data = keyframeData.get(bid);
        let hasRotInKeyframes = false;
        if (data) {
            for (const [, frameMap] of data.frames) {
                if (frameMap.has('rotatex') || frameMap.has('rotatey') || frameMap.has('rotatez')) {
                    hasRotInKeyframes = true;
                    break;
                }
            }
        }
        if (!hasRotInKeyframes) {
            showModal("转换结果", `方块 "${bid}" 无 rotate 变量`, null, false);
            return;
        }
        const result = eulerAngleConvertKeyframe(bid, keyframeCurrentTime);
        if (result === true) {
            applyKeyframeToBlock(bid, keyframeCurrentTime);
            // 【Molang 模式同步】欧拉角 rotate→rot 转换后刷新 Molang 程序
            refreshMolangProgramForBlock(bid);
            block.refresh();
            renderKeyframeDataPanel();
            converted = 1;
        } else if (result === 'bone-blocked') {
            boneBlocked = 1;
        } else {
            noRotate = 1;
        }
    } else {
        blocksToConvert = selectedBlocksSet.size ? Array.from(selectedBlocksSet) : (selectedBlock ? [selectedBlock] : []);
        if (blocksToConvert.length === 0) {
            showModal("提示", "请先选中一个方块", null, false);
            return;
        }
        // ★★ 防二次转换：多选里同时选中「父骨骼 + 它的显式绑定子块」时，子块由父的级联统一处理
        //   （父转换后按快照重建子链的 xrot 与 xbasepos_bone）。此时【绝不能】再让子块独立走一遍
        //   eulerAngleConvertBlock —— 那会把已经吸收了父旋转的 xrot 当成"待转换的原始姿态"再转一次，
        //   角度直接翻倍、位置二次偏移。两道防线：
        //   ① 预筛：剔除「祖先也在选中集合里」的块（沿显式绑定链向上查）；
        //   ② 兜底：循环中按 cascadeOut 已级联集合跳过（应对同一批里多个父块子链交叠）。
        const _selIds = new Set(blocksToConvert.map(b => b.id));
        const _hasSelectedExplicitAncestor = (b) => {
            let cur = b, guard = 0;
            while (cur && guard++ < 64) {
                if (!isExplicitBoneBinding(cur)) return false;
                const pid = cur._boneParent;
                if (!pid) return false;
                if (_selIds.has(pid)) return true;
                cur = blocks.find(x => x.id === pid);
            }
            return false;
        };
        dedupSkipped = blocksToConvert.filter(_hasSelectedExplicitAncestor).length;
        blocksToConvert = blocksToConvert.filter(b => !_hasSelectedExplicitAncestor(b));
        const _cascaded = new Set();
        for (const block of blocksToConvert) {
            if (_cascaded.has(block.id)) continue; // 已被前一个父块的级联处理，跳过（严禁二次转换）
            const _before = _cascaded.size;
            const result = eulerAngleConvertBlock(block, _cascaded);
            if (result === true) {
                block.refresh();
                converted++;
                cascadedChildren += _cascaded.size - _before;
            } else if (result === 'bone-blocked') {
                boneBlocked++;
            } else {
                noRotate++;
            }
        }
    }

    if (converted > 0) {
        recordAction();
        if (selectedBlock) renderVariablesForBlock(selectedBlock);
        if (isNewLayoutMode) renderSideBlockList();
        const _extra = [];
        if (cascadedChildren) _extra.push(`级联转换 ${cascadedChildren} 个骨骼子块`);
        if (dedupSkipped) _extra.push(`跳过 ${dedupSkipped} 个已由父块级联处理的子块（避免重复转换）`);
        if (boneBlocked > 0) _extra.push(`${boneBlocked} 个子方块不支持转换`);
        if (noRotate > 0) _extra.push(`${noRotate} 个方块无 rotate 变量`);
        showModal("转换完成", `成功转换 ${converted} 个方块${_extra.length ? '，' + _extra.join('；') : ''}`, null, false);
    } else {
        let failMsg = '';
        if (boneBlocked > 0 && noRotate > 0) {
            failMsg = `子方块不支持转换：${boneBlocked} 个；无 rotate 变量：${noRotate} 个`;
        } else if (boneBlocked > 0) {
            failMsg = `子方块不支持转换`;
        } else {
            failMsg = `选中方块无 rotate 变量${noRotate > 0 ? `（共 ${noRotate} 个）` : ''}`;
        }
        showModal("转换结果", failMsg, null, false);
    }
}

/* 【2026-10-24】方块行「工具」菜单的两项动作（关键帧模式下使用）：
   ① 欧拉角转换：把该方块当前帧的 rotatex/y/z 折算进 xrot/yrot/zrot（复用既有确认弹窗与按帧转换实现）
   ② 枢轴归位到原点：保持模型位置不变，把枢轴点归到 (0,0,0)
   ★两者都必须落到「关键帧数据」上 —— 直接写 scope.vars 会被编译产物在 refresh 时覆盖回去。
     统一走 kfGizmoWriteVar（有动画 → 写当前帧；该变量未被动画驱动时它会自动退回基线常量）。 */
function kfBlockToolEuler(block) {
    if (!block) return;
    if (typeof keyframePlaying !== 'undefined' && keyframePlaying) {
        showToast('播放中不能转换：请先暂停并定位到某一帧');
        return;
    }
    // 让该方块成为「关键帧编辑块」，applyEulerAngleConversion 才会走按当前帧转换的分支
    try { selectKeyframeBlock(block.id, false, true); } catch (e) {}
    showEulerAngleConfirmDialog();
}

function kfBlockToolPivotToOrigin(block, opts) {
    const silent = !!(opts && opts.silent);
    if (!block || !block.scope) return false;
    if (typeof keyframePlaying !== 'undefined' && keyframePlaying) {
        if (!silent) showToast('播放中不能改枢轴：请先暂停并定位到某一帧');
        return false;
    }
    // 真 molang 绑骨子块的位置由父骨实时驱动，独立归位会剪断跟随 → 与数值检查器同口径跳过
    if (typeof isBoneMolangDriven === 'function' && isBoneMolangDriven(block)) {
        if (!silent) showToast(`「${block.id}」是绑骨子块（位置由父骨驱动），已跳过`);
        return false;
    }
    try { flushPendingRecords(); } catch (e) {}
    // 与 setPivotKeepingModel 完全一致的换算：先算当前世界位置，再反解 basepos
    const rX = block.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = block.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = block.scope.vars.get('v.rotatez')?.value ?? 0;
    const w0 = new THREE.Vector3().setFromMatrixPosition(computeTransformMatrix(block.scope.toM(), rX, rY, rZ));
    const baseNew = worldToBasepos(block, w0.clone());   // 新枢轴 = 原点，故偏移量就是 w0 本身
    const write = (vn, val) => {
        const v = Math.round(val * 1e6) / 1e6;
        if (hasKeyframeAnimation(block.id)) {
            if (!kfGizmoWriteVar(block, vn, v)) setConstVarValue(block, vn, v);
        } else {
            setConstVarValue(block, vn, v);
        }
    };
    write('v.xpos', 0); write('v.ypos', 0); write('v.zpos', 0);
    write('v.xbasepos', baseNew.x); write('v.ybasepos', baseNew.y); write('v.zbasepos', baseNew.z);
    block.refresh(); block.mesh.updateMatrixWorld(true);
    /* silent=true（工具菜单批量处理多选时）：由调用方在整批处理完后统一记一次撤销 + 一条汇总提示 */
    if (!silent) {
        try { history.record(getState()); } catch (e) {}
        showToast(`已将「${block.id}」枢轴归位到原点（保持模型位置）`);
    }
    requestGizmoRefresh();
    try { renderKeyframeDataPanel(); } catch (e) {}
    try { if (selectedBlock === block) renderVariablesForBlock(block); } catch (e) {}
    return true;
}

// 显示欧拉角转换确认弹窗
function showEulerAngleConfirmDialog() {
    /* ★【2026-10-24】不再要求「浮动窗打开」：时间表里的方块工具在浮动窗收起时也要能用，
       关键帧模式下只要有编辑目标就该走按帧转换。 */
    const isKfActive = isNewLayoutMode && isKeyframeMode && selectedKeyframeBlock;
    let targetDesc = '';
    if (isKfActive) {
        targetDesc = `动画方块 "${selectedKeyframeBlock}" @ ${keyframeCurrentTime.toFixed(2)}s`;
    } else {
        const count = selectedBlocksSet.size || (selectedBlock ? 1 : 0);
        targetDesc = `${count} 个选中方块`;
    }

    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';
    modalDiv.style.zIndex = '1001';
    modalDiv.innerHTML = `
        <div class="modal-content" style="max-width: 400px; padding: 20px 24px;">
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 16px;">🔄 欧拉角转换</div>
            <div style="font-size: 13px; color: #94a3b8; margin-bottom: 20px; line-height: 1.6;">
                是否将选中方块的 <code style="background:rgba(59,130,246,0.15);padding:2px 6px;border-radius:4px;">rotatex/rotatey/rotatez</code> 
                换算为等效的 <code style="background:rgba(59,130,246,0.15);padding:2px 6px;border-radius:4px;">xrot/yrot/zrot</code> 并删除 rotate 变量？
                <br><br>
                <span style="color: #facc15;">目标：${targetDesc}</span>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button class="modal-btn" id="eulerCancelBtn">取消</button>
                <button class="modal-btn" id="eulerConfirmBtn" style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white;">确认转换</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalDiv);

    modalDiv.querySelector('#eulerCancelBtn').onclick = () => modalDiv.remove();
    modalDiv.querySelector('#eulerConfirmBtn').onclick = () => {
        modalDiv.remove();
        applyEulerAngleConversion();
    };
    modalDiv.addEventListener('click', (e) => { if (e.target === modalDiv) modalDiv.remove(); });
}

// 获取方块的动画标识符
function getKeyframeAnimId(blockId) {
    return blockId + '_anim';
}

// 检查方块是否有关键帧动画
function hasKeyframeAnimation(blockId) {
    if (keyframeData.has(blockId) && keyframeData.get(blockId).frames.size > 0) return true;
    const block = blocks.find(b => b.id === blockId);
    if (!block || boneKeyframes.size === 0) return false;
    // 骨级关键帧检测：必须在 block.group 直查失败时回退到「文件夹骨干」和「文件夹成员」匹配，
    // 否则 import/导入流程产生的「骨干方块 .group 丢失/错位」会让导出检测不到骨级关键帧 → 导出退化为基线 molang，
    // 用户看到的 UI 关键帧在导出指令里完全消失。
    for (const [folderName, entry] of boneKeyframes) {
        if (!entry || entry.frames.size === 0) continue;
        if (block.group === folderName) return true;
        const f = getFolder(folderName);
        if (f && f._backbone === blockId) return true;
        // 回退：骨级关键帧帧状态包含该方块（应对 group 错位 / _backbone 指向别处的边缘情况）
        for (const [, frame] of entry.frames) { if (frame.has(blockId)) return true; }
    }
    return false;
}

/* ★★★【2026-10-18 r33 · 用户投诉「关键帧动画模式为啥可以选中没添加到动画列表中的方块」】
   关键帧动画模式下的「可选中 / 可编辑资格」= **已加入动画列表**。三个来源与 getKeyframeFolderUnits()
   的轨道来源一一对应，绝不引入第四种来源（否则又会出现"时间轴上没有它的轨道，却能选中它"）：
     ① keyframeData 有条目 —— ❒ 选择器逐块加入（可能还是 0 帧空轨道，但已属动画列表）；
     ② 所在文件夹、或它的任一祖先文件夹被「+全部」整组加入 —— kfAddedFolders
        （关键帧模式下整组是按【骨级】加入的，其方块**不会**落进 keyframeData，只标记文件夹）；
     ③ 所在文件夹（或祖先）已有骨级关键帧 —— boneKeyframes。
   ★与 hasKeyframeAnimation 的差别（本函数存在的唯一理由）：后者要求「真的录了帧」（frames.size > 0），
     于是「刚加入、还是 0 帧空轨道」的方块会被判成 outsider —— 这正是 2026-10-14 那个 P0
     （新加入的方块在画布上点不中 ⇒ 选不出 Gizmo ⇒ xpos/basepos 改不动）的另一面。
     所以选中门禁**必须**用本函数：0 帧也是"已加入"，点得中；真没加入才拦。 */
function kfBlockIsInAnimation(block) {
    if (!block) return false;
    if (typeof keyframeData !== 'undefined' && keyframeData.has(block.id)) return true;
    if (block.group) {
        // 自身文件夹 + 逐级向上的祖先文件夹（整组加入的父文件夹会连带其后代取到轨道）
        let _fn = block.group, _guard = 0;
        while (_fn && _guard++ < 64) {
            if (kfAddedFolders.has(_fn) || boneKeyframes.has(_fn)) return true;
            const _f = getFolder(_fn);
            _fn = (_f && _f.parentName) ? _f.parentName : null;
        }
    }
    return false;
}

// 判断变量名是否为关键帧 molang 程序自动创建的内部辅助变量
/* ★★★【2026-10-14 架构修复 · 用户要求「必须支持所有名称的自定义变量」】
   旧实现在这里做**前缀猜测**：
       name.startsWith('start_') / 'seg_' / 'dur_' / /^T[A-Za-z]/
   ⇒ 任何**用户自定义变量**只要叫 `start_a` / `segment` / `duration_x` / `Total`，
     就被静默判成"编译器内部脚手架"，从数据表、候选列表、帧快照里**全部消失**
     （实测：`side_b` 被编译器产物污染 expr 后即遭此劫；名字型碰撞同理）。
   正解 —— 判据必须基于**结构性事实**，而不是名字长相：
     ① 本方块命名空间内部量 `v.<blockId>_*`（编译器唯一真正生成的形态）→ 内部；
     ② 全局共享时间量 `seg_time` / `dur` / `t`（编译器和所有方块共用）→ 内部；
     ③ 【用户显式纳入关键帧】的变量（出现在 `d.vars` 或任一帧的键里）→ **一律视为用户变量**，
        绝不再被前缀误判（这是"支持任意名字"的关键兜底）；
     ④ 仅对**历史遗留**的裸名（旧版导出程序）保留前缀判据，用于兼容旧动画。
   ★ 新增 ③ 后，用户把 `start_a` 这类名字加进关键帧，就能正常显示/编辑/插值。 */
function isKeyframeInternalVar(name, blockId) {
    // ① 命名空间内部量（最高优先级，结构性判定）：v.<id>_time/_seg_time/_dur/_t/_u/_seg_start/_kv/_start_X/_TX
    //   —— 这些带方块 ID 前缀、形态固定，永远算内部量，绝不会与用户变量混淆（即使名字叫 start_abc）。
    if (blockId && typeof _kfIsNsInternal === 'function' && _kfIsNsInternal(name, blockId)) return true;
    // ② 全局共享时间量（v1 裸名）
    if (name === 'seg_time' || name === 'dur' || name === 't') return true;
    // ③ 用户显式纳入关键帧 → 永不视为内部（兜底，保证任意名字可用）
    //   ★★【2026-10-14 架构修复 · 用户明确要求「支持所有名称的自定义变量」】
    //   只要该变量名出现在本方块的关键帧数据（vars/frames/exprs）里，它就是用户变量，哪怕它
    //   叫 `start_a` / `Total` / `segment` / `duration` / `StartTime`，也绝不能被前缀枚举吞掉。
    try {
        if (blockId && typeof keyframeData !== 'undefined' && keyframeData && keyframeData.has(blockId)) {
            const _d = keyframeData.get(blockId);
            if (_d && _d.vars instanceof Set && _d.vars.has(name)) return false;
            if (_d && _d.frames instanceof Map) {
                for (const [, _m] of _d.frames) { if (_m && _m.has && _m.has(name)) return false; }
            }
            if (_d && _d.exprs instanceof Map) {
                for (const [, _m] of _d.exprs) { if (_m && _m.has && _m.has(name)) return false; }
            }
        }
    } catch (e) { }
    // ④ 历史遗留裸名兼容（**仅当没有方块命名空间上下文**时才生效）
    //   —— 旧版（v1）程序里 `v.start_X` / `v.TX` 不带方块 ID 前缀，需要被识别成「旧版插值参数」。
    //   但只要有 blockId（即本函数的常规调用场景），规则 ③ 已保证用户变量绝不误判；
    //   这里只在「无法归属到任何方块的裸名」上兜底，从而**绝不**用前缀枚举去吞掉带上下文的用户变量。
    if (!blockId) {
        if (name.startsWith('start_')) return true;
        if (name.startsWith('seg_')) return true;
        if (name.startsWith('dur_')) return true;
        // T<varname> 模式：大写 T 后跟变量名（旧版插值目标，如 Txpos / TX_a）
        if (/^T[A-Za-z]/.test(name)) return true;
    }
    // 默认落点：任何未被结构性/全局时间量判定的名字 = 用户自定义变量（支持任意名称）。
    return false;
}

/* ★★★【2026-10-18 r18 · 用户投诉「数据表里冒出 v.Txrot / v.start_xrot 这些变量」的真根因】
   旧版（v1）程序的**裸名**脚手架（`v.start_X` / `v.TX`）不带方块命名空间前缀，逃过了
   `isKeyframeInternalVar` 的前缀判据；一旦它们被写进 `d.vars`，规则③「在 d.vars 里 = 用户变量」
   又会把它们永久锁成用户量 ⇒ 数据表冒出一排值为 -1 的无意义行。
   结构性判据（不问名字长相）：当**同一份 program 文本里已经出现命名空间等价物**
   `v.<id>_start_X` / `v.<id>_TX`（v2 编译器唯一会生成的形态），那么裸名 `start_X` / `TX`
   就只可能是 v1 遗留脚手架，绝不可能是用户变量 —— 用户若真要自定义 `start_a`，
   程序里不会有 `v.<id>_start_a` 这条编译器孪生语句。 */
function kfIsLegacyScaffoldTwin(name, blockId, program) {
    if (!blockId || !program) return false;
    const m = /^(?:start_([A-Za-z0-9_]+)|T([A-Za-z0-9_]+))$/.exec(String(name));
    if (!m) return false;
    const rest = m[1] || m[2];
    const escId = String(blockId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escRest = rest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('v\\.' + escId + '_(?:start_' + escRest + '|T' + escRest + ')\\s*=').test(String(program));
}

// 从关键帧 molang 程序反向解析出关键帧数据
// 识别 v.<id>_time=q.anim_time 开头的程序，从条件块中提取 seg_time 和 start_<var> 值
// 返回 { frames: Map<time, Map<varName, value>>, animId } 或 null
/* ★★★【2026-10-16 P0 修复 · 用户投诉「生成的指令有问题 / 最末帧有时候会有变量丢失】】
   本函数是**真实导入路径**用的解析器（`importFromCommands` 第 17916 行调用），
   旧实现有三个致命缺陷（真浏览器实测 `_r10_e2e.cjs`：导出→导入后帧表**完全为空**）：
     ① `/\?\s*\(([^)]+)\)/g` 遇第一个 `)` 就截断 —— v2 程序块里的缓动行含嵌套括号
        `v.<id>_u=math.max(0,math.min((...)/...,1))` ⇒ 取到残缺文本；
     ② `v\.seg_time` / `v\.start_<var>` **认不出带方块命名空间的** `v.<id>_seg_time` /
        `v.<id>_start_<var>`（v2 编译器产物全部是这个形式）⇒ 一个字段都匹配不到；
     ③ 因此 `frames.size === 0` → `return null` → **导出的关键帧动画重新导入后彻底消失**
        （用户原话：「点击尾帧却能看见当时编辑的那一帧的效果」但播放/重新导入就没了）。
   实测对照：旧实现 `frames.size=0`（导入后 0 帧）；统一解析器得到正确的 3 帧 + 全部用户变量。
   ★ 用户要求「必须换成统一的 molang 注入、解析、修改写法」
   ⇒ 本函数**委托 `kfParseProgramText`**（编译/时间表/反向同步同一真相源），
     用 `blkStart` 作为帧表（= 该帧的 `start_*`，即该帧的实际值），
     并顺带用 `mid` 恢复「分段表达式」，用 `lerpVars` 恢复「被驱动变量集合」。
     旧正则分支保留为兜底（解析不出时才走），保证历史格式仍能导入。 */
function parseKeyframeFromMolang(program, blockId) {
    if (!program || typeof program !== 'string') return null;

    // ---- ① 统一解析（v2 命名空间 + 嵌套括号都能正确解析）----
    try {
        if (typeof kfParseProgramText === 'function') {
            const p = kfParseProgramText(program);
            if (p && p.blkStart && p.blkStart.size) {
                const frames = new Map();
                for (const [t, m] of p.blkStart) {
                    if (!Number.isFinite(t)) continue;
                    const vm = new Map();
                    for (const [n, v] of m) {
                        if (!Number.isFinite(v)) continue;
                        if (isKeyframeInternalVar(n, blockId) || _kfIsNsInternal(n, blockId)) continue;
                        vm.set(n, v);
                    }
                    if (vm.size) frames.set(t, vm);
                }
                if (frames.size) {
                    const res = { frames, animId: getKeyframeAnimId(blockId), viaUnified: true };
                    // ★★ r13：程序**最前面**的常量（编译器 constLead = 全程同值的驱动变量）——
                    //   去噪后它们不再出现在任何时间块里，必须补进**每一帧**（否则导出再导入丢变量）。
                    if (p.frontConst && p.frontConst.size && p.times.length) {
                        const _ts = p.times.filter(Number.isFinite).sort((a, b) => a - b);
                        for (const [n, v] of p.frontConst) {
                            if (!Number.isFinite(v)) continue;
                            if (isKeyframeInternalVar(n, blockId) || _kfIsNsInternal(n, blockId)) continue;
                            _fcNames.push(n);
                            for (const t of _ts) {
                                if (!frames.has(t)) frames.set(t, new Map());
                                frames.get(t).set(n, v);
                            }
                        }
                    }
                    // 分段表达式：与时间表同口径恢复（否则重新导入后"某段换表达式"会丢）
                    if (p.mid && p.mid.size) {
                        res.exprs = new Map();
                        for (const [t, m] of p.mid) res.exprs.set(t, new Map(m));
                    }
                    // 被驱动变量集合：供时间表列出变量（不含派生量）
                    if (p.lerpVars && p.lerpVars.size) {
                        res.vars = new Set();
                        for (const n of p.lerpVars) {
                            if (isKeyframeInternalVar(n, blockId) || _kfIsNsInternal(n, blockId)) continue;
                            res.vars.add(n);
                        }
                    }
                    // ★ r13：最前面的常量也是「被驱动变量」（全程同值），必须计入集合
                    if (_fcNames.length) {
                        if (!res.vars) res.vars = new Set();
                        for (const n of _fcNames) res.vars.add(n);
                    }
                    return res;
                }
            }
        }
    } catch (e) { /* 统一解析失败 → 回退旧格式 */ }

    // ---- ② 旧格式兜底（v1 裸 seg_time / start_<var>）----
    const timeVarPattern = new RegExp(`v\\.${blockId}_time\\s*=\\s*q\\.anim_time`);
    const timeVarPattern2 = /v\.[A-Za-z0-9_]*_time\s*=\s*q\.anim_time/;
    if (!timeVarPattern.test(program) && !timeVarPattern2.test(program)) return null;

    const frames = new Map();
    const blockPattern = /\?\s*\(([^)]+)\)/g;
    let blockMatch;
    while ((blockMatch = blockPattern.exec(program)) !== null) {
        const blockContent = blockMatch[1];
        const segMatch = blockContent.match(/v\.(?:[A-Za-z0-9_]+_)?seg_time\s*=\s*([^;]+);/);
        if (!segMatch) continue;
        const time = parseFloat(segMatch[1]);
        if (isNaN(time)) continue;

        const frameData = new Map();
        const startPattern = /v\.(?:[A-Za-z0-9_]+_)?start_([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;]+);/g;
        let startMatch;
        while ((startMatch = startPattern.exec(blockContent)) !== null) {
            const varName = startMatch[1];
            const val = parseFloat(startMatch[2]);
            if (!isNaN(val) && !isKeyframeInternalVar(varName, blockId) && !_kfIsNsInternal(varName, blockId)) {
                frameData.set(varName, val);
            }
        }
        if (frameData.size > 0) {
            frames.set(time, frameData);
        }
    }

    if (frames.size === 0) return null;
    return { frames, animId: getKeyframeAnimId(blockId) };
}

// ===== Molang 编辑模式与关键帧的关系（v2：已彻底打通，不再互斥）=====
// 处于 Molang 编辑模式（scope.molangMode）的方块【同样加入动画列表、同样可以录关键帧】：
// 播放头推进 → q.anim_time 变化 → 手写表达式照常求值；录帧后编译器把时间块注入程序，
// 用户手写的表达式保留在程序前后段，不会被整段覆写（旧的「互斥置灰门禁」已删除）。
function isMolangModeBlock(block) {
    return !!(block && block.scope && block.scope.molangMode);
}
// 关键帧录制目标候选（与 createKeyframeAtCurrentTime 的选取口径一致，供 UI 态/守卫复用）
function kfKeyframeTargets() {
    // ★【2026-10-18】与 createKeyframeAtCurrentTime 同口径：亲手点选里若含有文件夹之外的方块，
    //   多选优先（否则「高亮的集合」与「会录帧的集合」再次脱节，出现多选了却漏帧）。
    //   同样只用 kfExplicitPickIds 判定，避免“点文件夹=自动扩展子文件夹方块”被误判成显式多选。
    const _explicit = Array.from(kfExplicitPickIds).map(id => blocks.find(b => b.id === id)).filter(Boolean)
        .filter(b => selectedBlocksSet.has(b));   // 只认仍在本轮选区内的“亲手点选”
    const _set = (selectedBlocksSet && selectedBlocksSet.size) ? Array.from(selectedBlocksSet) : [];
    const _multiOutside = !!(selectedFolder && _explicit.some(b => b.group !== selectedFolder));
    if (selectedFolder && !_multiOutside) return blocks.filter(b => b.group === selectedFolder);
    if (_set.length) return _set;
    if (selectedKeyframeBlock) {
        const b = blocks.find(x => x.id === selectedKeyframeBlock);
        return b ? [b] : [];
    }
    return [];
}
// ★【2026-09-27】「关键帧系统登记方块」：只有真正进了关键帧数据（keyframeData / 骨骼关键帧）的方块才算。
//   Molang 编辑模式方块整体退出关键帧系统 —— 既没有紫色关键帧角标，也不参与关键帧面板的选中门槛，
//   与其他普通方块一样可自由多选，仅保留自身 molang 表达式与 q.anim_time 查询。
function isKeyframeRegistryBlock(block) {
    if (!block) return false;
    if (isMolangModeBlock(block)) return false;
    try { return !!(typeof keyframeData !== 'undefined' && keyframeData && keyframeData.has(block.id)); }
    catch (e) { return false; }
}
// 关键帧模式下仍可点选的方块 = 已加入动画列表 ∪ Molang 编辑模式方块
// ★【2026-10-18 r33】此前这里只认 `keyframeData.has(id)`（= isKeyframeRegistryBlock），
//   于是「用「+全部」按文件夹（骨级）整组加入」的方块（其方块不落 keyframeData）在关键帧模式下
//   反而点不中；现统一走 kfBlockIsInAnimation()（三来源：keyframeData / kfAddedFolders / boneKeyframes）。
//   ★反向门禁（未加入动画的方块在关键帧模式下不可选中）也必须用本函数 —— 见 onCanvasClick / 触摸分支 / 框选 / 侧栏。
function isKeyframeSelectableBlock(block) {
    return kfBlockIsInAnimation(block) || isMolangModeBlock(block);
}

// ===== Molang 模式关键帧同步辅助函数 =====
// 当方块处于 Molang 接管模式时，根据最新 keyframeData 重新生成 Molang 程序
// 并更新到 block.scope.program，使关键帧的增删改能立即影响方块实际效果
function refreshMolangProgramForBlock(blockId) {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    // ★ v2【2026-10-13】molang 编辑模式与关键帧彻底打通：
    //   关键帧数据变化时，重新编译（用户手写程序原样保留在前/后段，只替换时间块与内部变量），
    //   并把结果回写 scope.program + 编辑器 textarea，让用户在 molang 编辑器里看到的就是最终指令。
    if (block.scope.molangMode) {
        if (typeof hasKeyframeAnimation === 'function' && hasKeyframeAnimation(blockId) && kfCanUseCompiled(block)) {
            // ★ 必须走 kfEnsureProgram（它写 sig 缓存），否则缓存里的 sig 与程序不匹配，
            //   下次调用会拿旧 sig 判定"未变" → 程序被反复追加时间块（实测：程序无限变长）。
            if (kfEnsureProgram(block, true)) {
                const ta = document.getElementById('molangTextarea');
                if (ta && ta.dataset.blockId === String(blockId) && typeof refreshMolangEditor === 'function') {
                    ta.value = block.scope.program;
                    try { refreshMolangEditor(block); } catch (e) { }
                }
            }
        }
        block.refresh();
        if (typeof updateMolangValueDisplay === 'function') updateMolangValueDisplay(block);
        return;
    }

    // 用户已手动编辑过 Molang 代码
    /* ★★★【2026-10-17 r16 · 用户诉求 4「手改 molang 不应一刀切拒绝」】
       旧实现：只要 molangEditedByUser 为真就**直接 toast + return**，不做任何解析尝试，
       于是「用户只改了末段派生表达式 / 只改了某帧某变量值」这类**完全符合关键帧语义**的编辑
       也被当成敌对程序拒绝（用户截图中的误导 toast 即此分支）。
       新实现：**先分类、先解析、能识别就读取** ——
         · 识别为 keyframe / keyframe-lite → kfSyncDataFromProgram 合并回数据，
           再用 kfResetBaseIfForeign 重新钉取基线（避免把编译产物当用户基线 → 防自我喂养 P0），
           清掉 molangEditedByUser，落入下方统一重编译路径（不 return）。
         · 识别不了（foreign：真外部/完全非关键帧格式）→ 保留用户原文 + toast 说明（负例保底，与旧行为一致）。 */
    if (block.scope.molangEditedByUser) {
        const _cls = kfClassifyProgram(block);
        if (_cls === 'keyframe' || _cls === 'keyframe-lite') {
            try { kfSyncDataFromProgram(block); } catch (e) { }
            if (typeof kfResetBaseIfForeign === 'function') kfResetBaseIfForeign(block);
            block.scope.molangEditedByUser = false;
            // 不 return：落入下方「回退基线 / kfEnsureProgram」统一重编译路径
        } else {
            if (typeof showToast === 'function') {
                showToast('Molang 已被手动编辑，且不是可识别的关键帧格式，关键帧变化未自动覆盖（要恢复自动同步可关闭再重开 Molang 模式）');
            }
            // 仍然应用当前 program，保证画面/导出正确
            block.refresh();
            if (typeof updateMolangValueDisplay === 'function') updateMolangValueDisplay(block);
            return;
        }
    }

    // 关键帧已全部删除时，回退为普通基线 Molang 程序
    if (!hasKeyframeAnimation(blockId)) {
        block.scope.program = generateMolangBaseline(block);
        // 同步更新编辑器 textarea 显示
        const ta = document.getElementById('molangTextarea');
        if (ta && ta.dataset.blockId === String(blockId)) {
            ta.value = block.scope.program;
            refreshMolangEditor(block);
        }
        block.refresh();
        return;
    }

    // ★★【2026-10-14 P0 修复 · 关键帧「改了不动」的真正根因】
    //   旧实现把 `getKeyframeCommandText(...)`（= 编译产物）直接写进 scope.program。
    //   而此刻 kfBaseProgram 往往还没建立 → 紧接着的 applyKeyframeToBlock → kfApplyCompiled
    //   → kfEnsureProgram → kfCaptureBase 会把这份**产物**当成「用户基线」钉下来
    //   （实测栈：VariableScope.set <- kfCaptureBase <- kfEnsureProgram <- kfApplyCompiled <- applyKeyframeToBlock）。
    //   于是第二次编译把上一份产物的时间块再吃一遍：程序 1540→3034→4808… 每帧都在长，
    //   旧产物的 v.<id>_start_X / _T X / _dur 又排在真正的时间块之前被读了又覆盖，
    //   ⇒ 帧数据明明改了（0s=3 / 1s=0），运行期 v.xpos 恒为 0、方块一动不动。
    //   正解：编译式关键帧一律走 kfEnsureProgram —— 它先 kfCaptureBase 钉住用户原文，
    //   再把产物**同时**写进 program 与 kfLastCompiled（后者让下次 kfCaptureBase 认得出
    //   「这是我们自己写的」，基线从此不再被自我喂养）。详见 MEMORY.md P0-② 同类根因。
    if (kfCanUseCompiled(block)) {
        if (kfEnsureProgram(block, true)) {
            // 同步更新编辑器 textarea 显示，让用户看到关键帧变化后生成的新代码
            const ta = document.getElementById('molangTextarea');
            if (ta && ta.dataset.blockId === String(blockId)) {
                ta.value = block.scope.program;
                refreshMolangEditor(block);
            }
            // 首次执行初始化：time=0 执行首帧初始化块，再按当前时间执行
            // 防止 keyframeCurrentTime≠0 时变量未定义导致程序抛错
            if (keyframeCurrentTime !== 0) {
                const _savedTime = keyframeCurrentTime;
                keyframeCurrentTime = 0;
                block.refresh(); // time=0：执行首帧初始化块
                keyframeCurrentTime = _savedTime;
            }
            block.refresh(); // 按当前时间刷新显示
            if (typeof updateMolangValueDisplay === 'function') updateMolangValueDisplay(block);
        }
        return;
    }

    // 骨骼 / 显式绑定等非编译式方块：维持原「关键帧指令」文本路径
    const newProgram = getKeyframeCommandText(blockId, true);
    if (newProgram) {
        block.scope.program = newProgram;
        // 同步更新编辑器 textarea 显示，让用户看到关键帧变化后生成的新代码
        const ta = document.getElementById('molangTextarea');
        if (ta && ta.dataset.blockId === String(blockId)) {
            ta.value = newProgram;
            refreshMolangEditor(block);
        }
        // 首次执行初始化：time=0 执行首帧初始化块，再按当前时间执行
        // 防止 keyframeCurrentTime≠0 时变量未定义导致程序抛错
        if (keyframeCurrentTime !== 0) {
            const _savedTime = keyframeCurrentTime;
            keyframeCurrentTime = 0;
            block.refresh(); // time=0：执行首帧初始化块
            keyframeCurrentTime = _savedTime;
        }
        block.refresh(); // 按当前时间刷新显示
        if (typeof updateMolangValueDisplay === 'function') updateMolangValueDisplay(block);
    }
}

// 批量版本：处理方块数组（用于批量同步场景）
function refreshMolangProgramForBlocks(blockIds) {
    for (const bid of blockIds) {
        refreshMolangProgramForBlock(bid);
    }
}

// 获取关键帧时间列表（排序后）
function getKeyframeTimes(blockId) {
    const data = keyframeData.get(blockId);
    if (!data) return [];
    return Array.from(data.frames.keys()).sort((a, b) => a - b);
}

// 在两个关键帧之间插值
// ===================================================================
// 关键帧刚体插值（修复“大角度旋转/位移导致模型散架”）
// 每个方块在前后关键帧之间的真实运动是一次绕骨骼枢轴的刚体旋转+平移；
// 线性插值欧拉角/位置会走直线弦、多轴欧拉会扭动，导致方块相对位置脱节。
// 这里在世界空间用四元数 slerp 旋转 + 绕枢轴公转位置，等效于“自动插入无穷多中间帧”，
// 因此无论旋转角度多大都不会散架。不影响手动录制的逐方块数据，也不污染时间轴。
// ===================================================================
const _KF_RIGID_MIN_ANGLE = 0.02; // ≈1.1°，小于此直接线性插值（无散架风险）

function _kf3Mul(A, v) {
    return new THREE.Vector3(
        A[0]*v.x + A[1]*v.y + A[2]*v.z,
        A[3]*v.x + A[4]*v.y + A[5]*v.z,
        A[6]*v.x + A[7]*v.y + A[8]*v.z
    );
}
function _kf3MulM(A, B) {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        let s = 0; for (let k = 0; k < 3; k++) s += A[i*3+k]*B[k*3+j];
        r[i*3+j] = s;
    }
    return r;
}
function _kf3T(A){ return [A[0],A[3],A[6], A[1],A[4],A[7], A[2],A[5],A[8]]; }
function _kf3Inv(A){
    const a=A[0],b=A[1],c=A[2],d=A[3],e=A[4],f=A[5],g=A[6],h=A[7],i=A[8];
    const A2=e*i-f*h, B2=-(d*i-f*g), C2=d*h-e*g;
    const det=a*A2+b*B2+c*C2;
    if (Math.abs(det) < 1e-12) return null;
    const id=1/det;
    return [A2*id,(c*h-b*i)*id,(b*f-c*e)*id, B2*id,(a*i-c*g)*id,(c*d-a*f)*id, C2*id,(b*g-a*h)*id,(a*e-b*d)*id];
}

function _kfVarToWorldMatrix(v) {
    const M = [
        v.xpos ?? 0, v.ypos ?? 0, v.zpos ?? 0,
        v.xrot ?? 0, v.yrot ?? 0, v.zrot ?? 0,
        v.scale ?? 1, v.extend_scale ?? 1, v.extend_xrot ?? 0, v.extend_yrot ?? 0,
        v.xbasepos ?? 0, v.ybasepos ?? 0, v.zbasepos ?? 0
    ];
    return computeTransformMatrix(M, v.rotatex ?? 0, v.rotatey ?? 0, v.rotatez ?? 0);
}
function _kfGlobalRotMtx(rX, rY, rZ) {
    const gRz = new THREE.Matrix4().makeRotationZ(degToRad(-rZ));
    const gRx = new THREE.Matrix4().makeRotationX(degToRad(rX));
    const gRy = new THREE.Matrix4().makeRotationY(degToRad(-rY));
    return gRy.clone().multiply(gRx).multiply(gRz);
}
function _kfSextMtx(es, ex, ey, s) {
    const matS = new THREE.Matrix4().makeScale(s, s, s);
    const matEyl = new THREE.Matrix4().makeRotationY(degToRad(-ey));
    const matExl = new THREE.Matrix4().makeRotationX(degToRad(ex));
    const matEs = new THREE.Matrix4().makeScale(1, 1, es);
    const matExr = new THREE.Matrix4().makeRotationX(-degToRad(ex));
    const matEyr = new THREE.Matrix4().makeRotationY(degToRad(ey));
    const matEsy = new THREE.Matrix4().makeScale(1, es, 1);
    return matEsy.clone().premultiply(matEyr).premultiply(matExr).premultiply(matEs).premultiply(matExl).premultiply(matEyl).premultiply(matS);
}
function _kfSmatRotQuat(ex, ey) {
    const matEyr = new THREE.Matrix4().makeRotationY(degToRad(ey));
    const matExr = new THREE.Matrix4().makeRotationX(-degToRad(ex));
    const matExl = new THREE.Matrix4().makeRotationX(degToRad(ex));
    const matEyl = new THREE.Matrix4().makeRotationY(degToRad(-ey));
    const m = matEyr.clone().multiply(matExr).multiply(matExl).multiply(matEyl);
    return new THREE.Quaternion().setFromRotationMatrix(m);
}

// 对前后两帧（Map）做刚体插值，返回包含所有 16 个变量的对象
function _kfRigidLerp(prevMap, nextMap, t) {
    const prevVars = Object.fromEntries(prevMap);
    const nextVars = Object.fromEntries(nextMap);
    if (t <= 1e-4) return { ...prevVars };
    if (t >= 1 - 1e-4) return { ...nextVars };

    // 基础：线性插值全部变量（旋转变量随后被刚体结果覆盖）
    const result = {};
    const allKeys = new Set([...Object.keys(prevVars), ...Object.keys(nextVars)]);
    for (const k of allKeys) {
        const a = prevVars[k] ?? 0, b = nextVars[k] ?? 0;
        result[k] = a + (b - a) * t;
    }

    const W0 = _kfVarToWorldMatrix(prevVars);
    const W1 = _kfVarToWorldMatrix(nextVars);
    const P0 = new THREE.Vector3(), Q0 = new THREE.Quaternion(), S0 = new THREE.Vector3();
    const P1 = new THREE.Vector3(), Q1 = new THREE.Quaternion(), S1 = new THREE.Vector3();
    W0.decompose(P0, Q0, S0);
    W1.decompose(P1, Q1, S1);

    const Rdelta = Q1.clone().multiply(Q0.clone().invert());
    const angle = 2 * Math.acos(Math.min(1, Math.max(-1, Math.abs(Rdelta.w))));
    // 角度过小（或接近 180° 奇异）直接返回线性结果，避免数值问题
    if (angle < _KF_RIGID_MIN_ANGLE || angle > Math.PI - 1e-3) return result;

    // 求枢轴 center：刚体旋转满足 P1 = center + R·(P0-center)，即 (R-I)·d = (P1-P0)（d = P0-center）。
    // (R-I) 沿旋转轴奇异，取最小范数解得垂直于轴的 d。
    const Rm3 = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(Rdelta));
    const re = Rm3.elements; // 列主序
    const Rrow = [re[0], re[3], re[6],  re[1], re[4], re[7],  re[2], re[5], re[8]];
    const A = [Rrow[0]-1, Rrow[1], Rrow[2],  Rrow[3], Rrow[4]-1, Rrow[5],  Rrow[6], Rrow[7], Rrow[8]-1];
    const M = _kf3MulM(A, _kf3T(A));
    const Minv = _kf3Inv(M);
    let center, d, PtFall;
    if (!Minv) {
        // R-I 沿旋转轴奇异（任何纯旋转都会触发），无法唯一解出枢轴 center。
        // 但四元数 slerp 仍给出正确的最短弧旋转；位置退化为线性插值（与历史行为一致，
        // 不会散架——散架只发生在“逐方块世界坐标各自最小范数”那种错误做法）。
        center = P0.clone();
        d = new THREE.Vector3(0, 0, 0);
        result.xpos = P0.x + (P1.x - P0.x) * t;
        result.ypos = P0.y + (P1.y - P0.y) * t;
        result.zpos = P0.z + (P1.z - P0.z) * t;
        PtFall = new THREE.Vector3(result.xpos, result.ypos, result.zpos);
    } else {
        const bvec = [P1.x-P0.x, P1.y-P0.y, P1.z-P0.z];
        const dArr = _kf3Mul(_kf3T(A), _kf3Mul(Minv, bvec));
        d = new THREE.Vector3(dArr[0], dArr[1], dArr[2]);
        center = P0.clone().sub(d);
    }

    // 中间时刻姿态：旋转 slerp（最短弧），位置绕枢轴公转或退化为线性插值
    const Qt = Q0.clone().slerp(Q1, t);
    const deltaRot = Qt.clone().multiply(Q0.clone().invert());
    const Pt = PtFall ? PtFall : center.clone().add(d.clone().applyQuaternion(deltaRot));

    // 把世界姿态 (Qt, Pt) 反解回方块 v.*（保持 G / px,py,pz / 缩放不变，仅改 rx,ry,rz 与 basepos）
    const rX = result.rotatex ?? 0, rY = result.rotatey ?? 0, rZ = result.rotatez ?? 0;
    const es = result.extend_scale ?? 1, ex = result.extend_xrot ?? 0, ey = result.extend_yrot ?? 0, s = result.scale ?? 1;
    const G = _kfGlobalRotMtx(rX, rY, rZ);
    const invG = G.clone().invert();
    const Gquat = new THREE.Quaternion().setFromRotationMatrix(G);
    const mQuat = Gquat.clone().invert().multiply(Qt);          // = Rloc · Smat_rot
    const smatRotQuat = _kfSmatRotQuat(ex, ey);
    const rlocQuat = mQuat.clone().multiply(smatRotQuat.clone().invert()); // = Rloc
    const Rloc = new THREE.Matrix4().makeRotationFromQuaternion(rlocQuat);
    const e = new THREE.Euler().setFromRotationMatrix(Rloc, 'YXZ');
    const radToDeg = THREE.MathUtils.radToDeg;
    result.xrot = normRotDeg(_r4(radToDeg(e.x)));
    result.yrot = normRotDeg(_r4(radToDeg(-e.y)));
    result.zrot = normRotDeg(_r4(radToDeg(-e.z)));

    // 关键帧逆变换必须避免 extend_scale / scale 为 0 使 Sext 奇异：invSext 会含 Infinity，
    // 之后 bNew = t1.applyMatrix4(invSext) 里 0*Infinity = NaN，NaN 写回 xbasepos 会让平面
    // 消失/错位，且 NaN 矩阵使首次播放计算包围球/剔除异常 → 严重卡顿。
    // 仅当 es/s 恰好为 0（或 1/es 非有限=次正规下溢）才用极小 epsilon 代换；其它正的极小 es 保持原值
    // （其逆 1/es 有限、往返精确）。es=0 时拉伸轴本就坍缩，代换后渲染结果不变（坍缩轴贡献恒为 0）。
    const _esSafe = (es === 0 || !Number.isFinite(1 / es)) ? (es < 0 ? -1e-6 : 1e-6) : es;
    const _sSafe = (s === 0 || !Number.isFinite(1 / s)) ? (s < 0 ? -1e-6 : 1e-6) : s;
    const Sext = _kfSextMtx(_esSafe, ex, ey, _sSafe);
    const invSext = Sext.clone().invert();
    const pVec = new THREE.Vector3(result.xpos ?? 0, result.ypos ?? 0, result.zpos ?? 0);
    const rhs = Pt.clone().sub(pVec).applyMatrix4(invG);
    const t1 = rhs.applyMatrix4(Rloc.clone().invert());
    const bNew = t1.applyMatrix4(invSext);
    result.xbasepos = _r4(bNew.x);
    result.ybasepos = _r4(bNew.y);
    result.zbasepos = _r4(bNew.z);
    return result;
}

// 【关键帧变量全集回填 2026-09-19】把 data.frames 里【各帧零散记录的变量】补齐成每帧都有的全集：
//   value 缺省时向前沿用上一个有值的帧；首帧之前没有值则沿用首帧（若有）否则跳过该变量。
//   语义与导出端 getKeyframeCommandText 的 valAt + valMatrix 向前回填【严格一致】。
//   ★ 修复的用户 bug：某变量只在最后一帧被编辑过（如导入时 basepos 未入帧、事后在末帧补上），
//   播放到前面那些「帧里没有该变量」的时刻时，_writeKfVarsToBlock 是覆盖式写入、不会重置，
//   于是方块上该变量保留着上一帧/末帧残留值 → 视觉上「所有帧的 basepos 都变成了末帧的值」。
//   回填后每帧都显式带该变量，插值结果覆盖完整，不再有残留污染。
function _kfFillVarMatrix(blockId) {
    const data = keyframeData.get(blockId);
    if (!data || data.frames.size === 0) return null;
    const times = Array.from(data.frames.keys()).sort((a, b) => a - b);
    const names = new Set();
    for (const t of times) for (const k of data.frames.get(t).keys()) names.add(k);
    const filled = new Map(); // time -> Map(name->value)
    // 正向扫描：lastVal[name] 保存「上一个有值的关键帧」的值；尚无值则填 0。
    // ★ 这里必须与导出端 getKeyframeCommandText 的 valMatrix 回填【逐字一致】：
    //     valMatrix[V][i] = lastVal !== null ? lastVal : 0  —— 未出现的变量在首个有值帧之前就是 0。
    //   旧版这里「无值就跳过」，导致那些帧的回填 Map 缺该变量 → _writeKfVarsToBlock 覆盖式写入时
    //   不重置 → 方块上残留上一次（末帧）写入的值 → 「所有帧都变成末帧的值」。
    const lastVal = new Map();
    for (const t of times) {
        const src = data.frames.get(t);
        const out = new Map();
        for (const n of names) {
            if (src.has(n)) lastVal.set(n, src.get(n));
            out.set(n, lastVal.has(n) ? lastVal.get(n) : 0);
        }
        filled.set(t, out);
    }
    return { times, names, filled };
}

function interpolateKeyframes(blockId, time) {
    const data = keyframeData.get(blockId);
    if (!data || data.frames.size === 0) return null;
    const times = getKeyframeTimes(blockId);
    if (times.length === 0) return null;

    // 变量全集回填后的帧表（每帧都带全部变量），供精确匹配/边界/插值统一使用。
    const _fm = _kfFillVarMatrix(blockId);
    const getFrame = (t) => {
        if (_fm && _fm.filled.has(t)) return _fm.filled.get(t);
        return data.frames.get(t);
    };

    // 精确匹配
    if (data.frames.has(time)) {
        const result = {};
        for (const [k, v] of getFrame(time)) {
            result[k] = v;
        }
        return result;
    }
    
    // 边界情况
    if (time <= times[0]) {
        const result = {};
        for (const [k, v] of getFrame(times[0])) {
            result[k] = v;
        }
        return result;
    }
    if (time >= times[times.length - 1]) {
        const result = {};
        for (const [k, v] of getFrame(times[times.length - 1])) {
            result[k] = v;
        }
        return result;
    }
    
    // 找到前后关键帧
    let prevTime = times[0], nextTime = times[times.length - 1];
    for (let i = 0; i < times.length - 1; i++) {
        if (time >= times[i] && time <= times[i + 1]) {
            prevTime = times[i];
            nextTime = times[i + 1];
            break;
        }
    }
    
    const t = (time - prevTime) / (nextTime - prevTime);
    const prevData = getFrame(prevTime);
    const nextData = getFrame(nextTime);
    // ★ 段内插值 = 【逐变量插值】(线性 + 角度最短弧 lerprotate)——与导出/纯 molang 的
    //   v.<var>=math.lerp(v.start_<var>,v.T<var>,v.t) / math.lerprotate(...) 完全同构。
    //   每帧存的是「变量数值」(枢轴 xpos 与 basepos 分开、可各自动画)，引擎按变量插值即可，
    //   渲染期 computeTransformMatrix 自动把它们组合成世界姿态。
    //   旧实现用 _kfRigidLerp 把两帧世界矩阵反解刚体重算位置/basepos：只在 basepos 恒定时
    //   与逐变量结果近似；一旦某段把 basepos（或枢轴/几何分离语义）也当变量动画
    //   （如 FMBE 导出 v.ybasepos 0→-4.05），反解会覆盖该通道 → basepos 在两帧之间完全不生效、
    //   到端点才"啪"地跳变（用户报：导入 molang 后看不见 basepos 生效）。
    return _kfVarLerp(prevData, nextData, t);
}

// 逐变量关键帧插值：线性插值数值变量、最短弧插值角度变量（与 boneInterpAtTime / 导出 lerprotate 同语义）。
function _kfVarLerp(prevMap, nextMap, t) {
    if (t <= 1e-4) return Object.fromEntries(prevMap);
    if (t >= 1 - 1e-4) return Object.fromEntries(nextMap);
    const lerp = (u, v) => u + (v - u) * t;
    // 角度插值：默认最短弧；端点出现 ±180° 外的多圈记录值时按字面数值插值（_kfAngleLerp，2026-09-12）
    const lerpRot = (a, b) => _kfAngleLerp(a, b, t);
    const keys = new Set([...prevMap.keys(), ...nextMap.keys()]);
    const out = {};
    for (const k of keys) {
        const a = prevMap.get(k), b = nextMap.get(k);
        if (a === undefined || a === null) { out[k] = b; continue; }
        if (b === undefined || b === null) { out[k] = a; continue; }
        out[k] = _kfIsAngleVar(k) ? lerpRot(a, b) : lerp(a, b);
    }
    return out;
}

// 应用关键帧到方块
// ★【2026-10-13】编译式路径的适用范围：纯单方块（不参与任何骨骼）。
//   ★ v2：molang 编辑模式的方块**允许**走编译路径（两者彻底打通）。
/* ★★★【2026-10-17 r16 · 用户第 16 轮投诉「骨绑子块的 x/y/zrot 也不让用 Gizmo 改」】
   旧实现把「文件夹骨骼 / ✛ 显式绑定子块」排除在编译式路径之外
   （`_boneParent` / `boneKeyframes.has(group)` / `getBoneParentId`），于是这类方块：
     · `syncKeyframeFromBlock` 的编译式早退失效 ⇒ 落到「最近帧全量 scope.vars 回写」，
       并触发 refreshMolangProgramForBlock 的 `molangEditedByUser` 硬拒 ⇒ 用户看到
       「Molang 已被手动编辑，关键帧变化未自动覆盖」的误导 toast、且画面不更新；
     · `applyKeyframeToBlock` 落到逐变量路径 ⇒ 与编译产物冲突 ⇒ 改不动/回弹；
     · `gizmoMolangGuard` 的编译式放行失效。
   ⇒ 与用户第 15 轮裁决「紫色加号骨骼绑定的方块属于普通方块，无需任何特殊处理流程」
     完全一致的正解：**移除骨骼排除**，让骨绑子块与普通方块共用同一条编译式关键帧链路
     （骨骼跟随链 `v.xpos=t.父_px+pR·xbasepos_bone` 本就写在用户基线里，编译会原样保留）。 */
function kfCanUseCompiled(block) {
    if (!block || !block.scope) return false;
    return true;
}

// ★【2026-10-13】旧操作模式 = 只读回放（用户通知：「取消旧操作模式修改关键帧动画的职能，仅能使动画帧开始播放」）。
//   旧布局下关键帧窗口保留：▶播放/暂停、时间轴拖动预览、缩放滚动、关闭 —— 全部是「看」。
//   一切「改」的操作（+关键帧、加方块、导入、改数值/表达式、拖动关键帧、右键删除、改总时长）
//   一律关闭，并在被调用时给出统一提示；编辑统一收敛到新操作模式的「关键帧时间表」。
function kfLegacyReadOnly() { return !isNewLayoutMode; }
function kfBlockLegacyEdit(what) {
    if (!kfLegacyReadOnly()) return false;
    try {
        if (typeof showToast === 'function') {
            showToast('旧操作模式仅能播放动画：' + (what || '修改关键帧') + '请切到「新操作模式」的关键帧时间表');
        }
    } catch (e) { }
    return true;
}
// 同步旧窗口上「编辑类」控件的可见性（新建窗口 / 布局切换 / 重开窗口时调用）
//   ★ 只走 DOM，不读 keyframeWindowEl —— applyNewLayoutMode 在初始化阶段就会调用本函数，
//     当时 `let keyframeWindowEl` 尚未执行（TDZ），直接引用会抛 ReferenceError 并中断整个启动。
function kfSyncLegacyReadOnlyUI() {
    const win = document.getElementById('keyframeWindow');
    if (!win) return;
    const ro = kfLegacyReadOnly();
    ['kfAddBlockBtn', 'kfImportBtn', 'kfAddKeyframeBtn'].forEach(id => {
        const el = win.querySelector('#' + id);
        if (!el) return;
        el.style.display = ro ? 'none' : '';
        el.disabled = ro;
    });
    const dh = win.querySelector('#kfDurationHandle');
    if (dh) dh.style.display = ro ? 'none' : '';
    const tag = win.querySelector('#kfReadOnlyTag');
    if (ro && !tag) {
        const bar = win.querySelector('.keyframe-timeline-controls');
        if (bar) {
            const s = document.createElement('span');
            s.id = 'kfReadOnlyTag';
            s.className = 'kf-readonly-tag';
            s.textContent = '只读回放';
            s.title = '旧操作模式不能修改关键帧，仅能播放；编辑请切到新操作模式';
            bar.appendChild(s);
        }
    } else if (!ro && tag) {
        tag.remove();
    }
}

function applyKeyframeToBlock(blockId, time) {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    // molang 接管的方块由 molang 程序通过 q.anim_time 驱动动画，跳过关键帧直接赋值
    if (block.scope.molangMode) {
        block.refresh();
        return;
    }
    // ★ 编译式关键帧：编译成 molang 程序 → 交 molang 引擎执行（效果不再由引擎逐变量赋值负责）
    if (kfCanUseCompiled(block) && hasKeyframeAnimation(block.id)) {
        if (kfApplyCompiled(block, time)) return;
    }
    const interpolated = interpolateKeyframes(blockId, time);
    if (!interpolated) return;
    _writeKfVarsToBlock(block, interpolated);
}

// 把插值得到的 varMap 写回方块（覆盖式）。骨骼刚体播放/烘焙也复用此函数。
function _writeKfVarsToBlock(block, varMap) {
    const varNameMap = {
        'xpos': 'v.xpos', 'ypos': 'v.ypos', 'zpos': 'v.zpos',
        'xrot': 'v.xrot', 'yrot': 'v.yrot', 'zrot': 'v.zrot',
        'rotatex': 'v.rotatex', 'rotatey': 'v.rotatey', 'rotatez': 'v.rotatez',
        'scale': 'v.scale', 'extend_scale': 'v.extend_scale',
        'extend_xrot': 'v.extend_xrot', 'extend_yrot': 'v.extend_yrot',
        'xbasepos': 'v.xbasepos', 'ybasepos': 'v.ybasepos', 'zbasepos': 'v.zbasepos'
    };
    // 骨骼子块（通过 _boneParent 或 molang 表达式可判定为某父骨骼的子块）：
    // v.xpos/ypos/zpos/rotatex/rotatey/rotatez 由 molang 表达式（v.xpos = t.父_px + pR·offset 等）
    // 实时跟随父骨骼驱动，是刚性跟随的唯一姿态来源。绝不能被独立关键帧写回常量，
    // 否则子块脱离父骨骼、按自身关键帧“自己动”（用户报告根因）。
    // 用 getBoneParentId 判定（同时覆盖仅有 molang 表达式、_boneParent 暂未同步的边界），
    // 保持子块 molang 表达式不动；offset(xbasepos_bone)/冻结 rot/scale 等结构属性仍正常写回。
    const childLocked = !!getBoneParentId(block);
    const LOCKED = new Set(['v.xpos','v.ypos','v.zpos','v.rotatex','v.rotatey','v.rotatez']);
    for (const [shortName, value] of Object.entries(varMap)) {
        const fullName = varNameMap[shortName] || `v.${shortName}`;
        if (childLocked && LOCKED.has(fullName)) continue; // 保持子块 molang 跟随，跳过覆盖
        if (block.scope.vars.has(fullName)) {
            const d = block.scope.vars.get(fullName);
            d.expr = value.toString();
            d.value = value;
        } else {
            block.scope.addVar(fullName, value.toString(), -100, 100, 0.01);
            const d = block.scope.vars.get(fullName);
            if (d) d.value = value;
        }
    }
    block.refresh();
}

