/* 03-blocks/04-multiselect-and-undo.js · 源 测试版v.6b79.html 第 11514-12342 行 */
'use strict';
/* ★【2026-10-18 新增】多选「显式点选」集合：只记录用户【亲手 Ctrl/长按点选】过的方块 id。
   用途：区分「文件夹单位自动带进来的成员」与「用户亲手加进选区的成员」。
   旧行为下二者无法区分 —— 单击文件夹里的 A（选区被自动扩展成整组 {A,B}）后再 Ctrl 点 B，
   会因为 B 已在选区里而被当成「取消选中」剔除，录帧时 B 缺帧；换成本集合后，
   对「自动带进来的成员」的 Ctrl 点选一律视为【加选/确认】（只保留，不剔除），
   与用户「先单击它、再 Ctrl 选取」的直觉一致；对真正亲手选过的方块仍保留标准 toggle 语义。 */
let kfExplicitPickIds = new Set();
/* ★【2026-10-28 修复】选区每变一次，关键帧时间轴的轨道名都要立刻同步「上色 + 正体」。
   旧实现只有 selectKeyframeBlock() 会重绘时间轴：画布 Ctrl 多选 / Ctrl+拖拽框选 /
   点空白取消选中 都只改选区不重绘 ⇒ 轨道名要等下一次重绘才更新，期间一直是未选中态的
   灰 + 斜体（用户投诉「多选方块时方块名没有及时亮起并取消斜体」）。
   这里用 rAF 合并同一帧内的多次请求（多次选区变更只重绘一次）；若同一帧里已经发生同步
   重绘（selectKeyframeBlock），renderKeyframeTimeline 会把队列标志清掉，避免重复重建。 */
let _kfTrackSyncPending = false;
function scheduleKfTrackTimelineSync() {
    if (_kfTrackSyncPending) return;
    try {
        if (!keyframeWindowOpen || !keyframeWindowEl) return;
    } catch (e) { return; }   // 初始化早期 keyframeWindowOpen 尚未声明：直接跳过
    _kfTrackSyncPending = true;
    requestAnimationFrame(() => {
        if (!_kfTrackSyncPending) return;
        _kfTrackSyncPending = false;
        try { if (keyframeWindowOpen && keyframeWindowEl) renderKeyframeTimeline(); } catch (e) {}
    });
}
/* ★【2026-10-18 新增 · 无键盘设备多选】
   移动端/触屏没有 Ctrl 键，多选原本只能靠「Ctrl+左键」「Ctrl+拖拽框选」或隐藏的双击手势，
   基本不可用。这里提供一个可见的「多选」锁定开关（关键帧窗口工具栏）：
   开启后，画布点方块 / 侧栏点方块 / 点文件夹 一律按【加选】处理，等同一直按着 Ctrl，
   触屏用户点几下即可完成多选，再点「+关键帧」批量录制。开关只影响“选择手势”，
   不改变任何已有帧数据；关闭后恢复标准单选语义。 */
let kfMselLock = false;
// 复位「多选锁定」开关（连同按钮文案/高亮），供退出动画模式、删除最后一个动画方块等路径统一调用。
//  · 按钮藏在关键帧窗口中，窗口一关用户就够不着它 ⇒ 必须由程序主动复位，否则按钮态会残留成「多选中」。
function kfResetMselLock() {
    if (!kfMselLock) return;
    kfMselLock = false;
    const b = document.getElementById('kfMselBtn');
    if (b) { b.classList.remove('on'); b.textContent = '多选'; }
}
// 统一的多选手势判据：显式修饰键（Ctrl/Cmd/Shift）、手机端常亮虚拟 Ctrl、或「多选锁定」开关
//  · 虚拟 Ctrl（#virtModCtrl，本来就存在于手机端键条）此前只驱动 Gizmo 精度档，
//    并不参与方块选择 ⇒ 无键盘设备根本无法多选。这里把它接入选择手势（等价按着 Ctrl），
//    零新增UI即可让触屏用户多选；gizmoPrecMods 的语义与真实键盘 Ctrl 完全一致，无副作用。
// 是否处于「关键帧编辑上下文」（新操作模式=动画模式；旧操作模式=关键帧浮动窗打开）。
//  · 「多选锁定」只在关键帧上下文生效：否则用户开启后一旦离开动画模式（浮动窗关闭/切回编辑模式，
//    按钮随之隐藏、用户再也关不掉），普通编辑模式的点选会被悄悄变成“加选”，单选直接失效。
//  · 用 typeof + try 兜底：三者均为模块作用域 let，初始化阶段可能尚未执行（TDZ）。
function kfInKeyframeContext() {
    try {
        return !!((typeof isKeyframeMode !== 'undefined' && isKeyframeMode)
            || (typeof keyframeWindowOpen !== 'undefined' && keyframeWindowOpen));
    } catch (e) { return false; }
}
function kfIsMultiGesture(e) {
    if (kfMselLock && kfInKeyframeContext()) return true;
    if (typeof gizmoPrecMods !== 'undefined' && gizmoPrecMods && gizmoPrecMods.ctrl) return true;
    return !!(e && (e.ctrlKey || e.metaKey || e.shiftKey));
}
// 双列变量面板下左右两列各自维护「当前展开的一级分组」，互不干扰：
// currentOpenGroup 归右列（位移/缩放/旋转），currentLeftGroup 归左列（自定义变量）。
// 全局变量顶级组(global_top)的展开态存在 expandedVars 里，属左列互斥范围。
let currentOpenGroup = null;
let currentLeftGroup = null;
let expandedVars = new Set();
let batchDeltas = new Map();
let batchClosedGroups = new Set();   // 多选批量面板里被折叠的分类（跨重渲染保持）
let isMouseInPanel = false;
let keyframeData = new Map(); // 提前声明，供 getState/recordAction 使用
// ★「+全部」主动加入关键帧轨道的文件夹集合（其方块可能尚未录帧，但轨道要显示）。
//   该声明曾在某次合并中丢失，而 34693 / 36145 / 36328 / 36474 / 37451 / 37468 等处仍在引用，
//   导致模块求值到导出对象处直接抛 ReferenceError、整个应用无法启动 ⇒ 在此补回。
let kfAddedFolders = new Set();
let keyframeEpoch = 0; // 关键帧数据变更计数（录制/删除关键帧时自增），供骨骼播放缓存失效检测

const panelEl = document.getElementById('dataPanel');
panelEl.addEventListener('mouseenter', () => isMouseInPanel = true);
panelEl.addEventListener('mouseleave', () => isMouseInPanel = false);

let recordDebounceTimer = null;
function recordAction() {
    bumpDrawRev('ui');   // 每一次用户编辑都要求重画一帧（材质/可见性等改动不经 updateTransform）
    if (recordDebounceTimer) clearTimeout(recordDebounceTimer);
    recordDebounceTimer = setTimeout(() => { recordDebounceTimer = null; history.record(getState()); }, 200);
}
// 立即提交任何尚未落账的撤销快照（molang 文本输入、泡泡调数都使用防抖记录）。
// 必须在 undo / redo 之前调用：否则 history.undo 会把「编辑前状态」当作待丢弃的栈顶直接弹出，
// 导致 Ctrl+Z 跳过 molang 编辑、一路跳回更早的状态。
function flushPendingRecords() {
    if (recordDebounceTimer) { clearTimeout(recordDebounceTimer); recordDebounceTimer = null; history.record(getState()); }
    if (typeof mnbRecordTimer !== 'undefined' && mnbRecordTimer) { clearTimeout(mnbRecordTimer); mnbRecordTimer = null; history.record(getState()); }
}

const history = (() => {
    let u = [], r = [];
    return {
        /* ★★★【2026-10-24 性能优化】撤销栈不再深拷贝。
           旧实现每次 record/undo/redo 都做 JSON.parse(JSON.stringify(整份项目状态))，
           几百个方块时就是 O(全量数据) 的 CPU 与内存硬伤（拖拽期间 recordAction 每 200ms 就拷一次）。
           现在 getState() 返回「结构共享 + 不可变」的快照（见下方注释），这里只保存引用。
           同一状态重复落账（拖拽 / 防抖输入期间很常见）直接忽略，避免栈里堆积等价快照。 */
        record(s) {
            if (u.length && u[u.length - 1] === s) { scheduleAutoSave(); return; }
            u.push(s);
            if (u.length > 500) u.shift();
            r = [];
            scheduleAutoSave();
        },
        _dbg() { return { u: u.length, r: r.length, tail: u.slice(-4).map(s => { const b0 = s.blocks && s.blocks[0]; return b0 ? ((b0.molangMode ? 'M' : 'N') + '|' + (b0.program || '').slice(0, 22)) : '?'; }) }; },
        undo(cur) { if (u.length < 2) return null; r.push(cur); u.pop(); return u[u.length - 1]; },
        redo(cur) { if (!r.length) return null; u.push(cur); return r.pop(); },
        // 重置撤销栈：用于「清空项目」这类破坏性操作。把给定状态设为唯一基线，
        // 丢弃此前堆积的历史（那些快照引用的方块已被清空，继续撤销只会得到混乱状态）。
        reset(s) { u = s ? [s] : []; r = []; },
        // 保证栈里至少有一条「动作前」的基线：整批导入 / 全项目重置这类操作若发生在空栈上，
        // 只 record 一次会让 undo 因 u.length<2 直接 return null（用户按了撤销毫无反应）。
        ensure(s) { if (!u.length) u.push(s); }
    };
})();

/* ★★★【2026-10-24 性能优化 · 撤销快照「结构共享」】
   目标：把「每次落账都深拷贝整份状态」改成「只记录真正变化的那部分」。
   做法：getState() 逐块 / 逐变量 / 逐帧与上一份快照做值比较，没变化的直接复用旧对象，
        于是相邻快照之间共享绝大多数引用，栈里只存引用、不再做任何深拷贝。
   约定：getState() 产出的状态视为**不可变数据**（restoreState 只读、不写回），跨快照共享才安全。
   注意：变量 Map 的迭代顺序就是快照顺序；顺序变化会自然判为「不同」并重建该块快照。 */
const _snapSameArr = (a, b) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
};
const _snapSameRefArr = (a, b) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
};
// 单块变量快照：逐项复用未变化的对象；全部一致时连数组本身也复用。
function _snapVarsOf(scopeVars, oldArr) {
    const arr = [];
    let i = 0, same = !!oldArr && oldArr.length === scopeVars.size;
    for (const [n, d] of scopeVars) {
        const old = oldArr && oldArr[i];
        if (old && old.name === n && old.expr === d.expr && old.value === d.value
            && old.rangeMin === d.rangeMin && old.rangeMax === d.rangeMax && old.step === d.step) {
            arr.push(old);
        } else {
            same = false;
            arr.push({ name: n, expr: d.expr, value: d.value, rangeMin: d.rangeMin, rangeMax: d.rangeMax, step: d.step });
        }
        i++;
    }
    return same ? oldArr : arr;
}
function _snapBlockOf(b, old) {
    const vars = _snapVarsOf(b.scope.vars, old ? old.vars : null);
    const faceTextures = b.faceTextures ? b.faceTextures.map(u => u ? texName(u) : null) : null;
    const program = b.scope.program || '';
    const molangMode = !!b.scope.molangMode;
    const molangEditedByUser = !!b.scope.molangEditedByUser;
    const textureUrl = b.textureUrl ? texName(b.textureUrl) : null;
    const materialType = b.materialType;
    const facePresetKey = b.facePresetKey;
    const materialPresetName = b.materialPresetName;
    const loomCode = (b.loomCode && b.loomUrl === b.textureUrl) ? b.loomCode : null;
    const group = b.group;
    const hidden = !!b.hidden;
    const locked = !!b.locked;
    const boneParent = b._boneParent || null;
    const boneExplicit = !!b._boneExplicit;
    const boneMode = b._boneMode || null;
    if (old && old.id === b.id && old.type === b.type && old.program === program
        && old.molangMode === molangMode && old.molangEditedByUser === molangEditedByUser
        && old.textureUrl === textureUrl && old.materialColor === b.materialColor && old.materialType === materialType
        && old.facePresetKey === facePresetKey && old.materialPresetName === materialPresetName
        && old.loomCode === loomCode && old.group === group && old.hidden === hidden && old.locked === locked
        && old.boneParent === boneParent && old.boneExplicit === boneExplicit && old.boneMode === boneMode
        && vars === old.vars && _snapSameArr(old.faceTextures, faceTextures)) {
        return old;
    }
    return {
        id: b.id, type: b.type, vars, program, molangMode, molangEditedByUser, textureUrl,
        materialColor: b.materialColor, materialType, faceTextures, facePresetKey, materialPresetName,
        loomCode, group, hidden, locked, boneParent, boneExplicit, boneMode
    };
}
function _snapGlobalOf(name, g, old) {
    const e = { name, expr: g.def.expr, value: g.def.value, rangeMin: g.def.rangeMin, rangeMax: g.def.rangeMax, step: g.def.step, sourceBlockId: g.sourceBlockId };
    if (old && old.name === e.name && old.expr === e.expr && old.value === e.value
        && old.rangeMin === e.rangeMin && old.rangeMax === e.rangeMax && old.step === e.step
        && old.sourceBlockId === e.sourceBlockId) return old;
    return e;
}
// 关键帧快照：逐帧逐变量复用未变化的帧对象；整条轨道一致时直接复用旧条目。
function _snapKfEntryOf(blockId, data, old) {
    const animId = data && data.animId;
    const srcFrames = (data && data.frames instanceof Map) ? data.frames : null;
    const oldFrames = (old && old.frames) ? old.frames : null;
    let same = !!oldFrames && oldFrames.length === (srcFrames ? srcFrames.size : 0);
    const frames = [];
    let fi = 0;
    if (srcFrames) {
        for (const [time, varMap] of srcFrames) {
            const oldFrame = oldFrames ? oldFrames[fi] : null;
            const n = (varMap instanceof Map) ? varMap.size : 0;
            let frameSame = !!oldFrame && oldFrame.time === time && oldFrame.vars.length === n;
            if (frameSame && n) {
                let vi = 0;
                for (const [name, val] of varMap) {
                    const ov = oldFrame.vars[vi++];
                    if (!ov || ov.name !== name || ov.val !== val) { frameSame = false; break; }
                }
            }
            if (frameSame) frames.push(oldFrame);
            else {
                same = false;
                // 数据完整性守卫：frames 非 Map 的残缺数据（旧版本/异常导入）跳过，不打断撤销快照
                frames.push({ time, vars: (varMap instanceof Map) ? Array.from(varMap.entries()).map(([name, val]) => ({ name, val })) : [] });
            }
            fi++;
        }
    }
    if (same && old && old.blockId === blockId && old.animId === animId) return old;
    return { blockId, animId, frames };
}
// 文件夹对象：逐字段比较（pivot / rotation 按数组内容比较），未变化则复用旧对象。
const _snapFolderSame = (a, b) => {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
        if (!(k in b)) return false;
        if (k === 'pivot' || k === 'rotation') { if (!_snapSameArr(a[k], b[k])) return false; }
        else if (a[k] !== b[k]) return false;
    }
    return true;
};
function _snapFolderOf(f, old) {
    const copy = Object.assign({}, f, {
        pivot: f.pivot ? f.pivot.slice() : null,
        rotation: f.rotation ? f.rotation.slice() : [0, 0, 0]
    });
    return (old && _snapFolderSame(old, copy)) ? old : copy;
}

let _lastStateSnapshot = null;
function getState() {
    const prev = _lastStateSnapshot;
    const prevBlocks = prev ? prev.blocks : null;
    const prevGlobals = prev ? prev.globalVars : null;
    const prevFolders = prev ? prev.folders : null;
    const prevKfById = new Map();
    if (prev && prev.keyframes) prev.keyframes.forEach(k => prevKfById.set(k.blockId, k));

    const blocksSnap = blocks.map((b, i) => _snapBlockOf(b, prevBlocks ? prevBlocks[i] : null));
    const globalsSnap = [];
    {
        let i = 0;
        for (const [n, g] of globalVars) globalsSnap.push(_snapGlobalOf(n, g, prevGlobals ? prevGlobals[i++] : null));
    }
    const kfsSnap = Array.from(keyframeData.entries()).map(([blockId, data]) => _snapKfEntryOf(blockId, data, prevKfById.get(blockId) || null));
    const foldersSnap = folders.map((f, i) => _snapFolderOf(f, prevFolders ? prevFolders[i] : null));
    /* 测量（测长 / 测角）也在项目状态里：内容不变时 measureStateSnapshot 返回同一数组引用，
       所以下面的整份状态比较天然覆盖它（撤销 / 存档 / 重做都能带着测量一起走）。 */
    const measuresSnap = (typeof measureStateSnapshot === 'function') ? measureStateSnapshot() : null;

    // 整份状态完全一致 ⇒ 直接返回上一份快照（引用相同，history.record 会因此跳过重复落账）
    if (prev
        && _snapSameRefArr(prevBlocks, blocksSnap)
        && _snapSameRefArr(prevGlobals, globalsSnap)
        && _snapSameRefArr(prev.keyframes, kfsSnap)
        && _snapSameRefArr(prevFolders, foldersSnap)
        && _snapSameRefArr(prev.measures, measuresSnap)) {
        return prev;
    }
    const state = { blocks: blocksSnap, globalVars: globalsSnap, keyframes: kfsSnap, folders: foldersSnap, measures: measuresSnap };
    _lastStateSnapshot = state;
    return state;
}

function restoreState(state) {
    for (let [k,i] of activeAutoIncMap) clearInterval(i);
    activeAutoIncMap.clear();
    // 保存当前选中方块的ID，用于恢复后重建选中状态
    const prevSelectedIds = Array.from(selectedBlocksSet).map(b => b.id);
    const prevSelectedBlockId = selectedBlock ? selectedBlock.id : null;
    blocks.forEach(b => { scene.remove(b.mesh); if(b.label) scene.remove(b.label); if(b.selectionWireframe) scene.remove(b.selectionWireframe); });
    blocks = [];
    selectedBlocksSet.clear();
    /* ★【2026-10-24 性能】批量重建：旧实现逐块 `addBlock(blk,false)`，而 addBlock 在 isNewLayoutMode 下
       每块都会 renderSideBlockList() 一次（侧栏列表随块数变长）⇒ 打开 2940 块项目实测侧栏重建累计
       78 秒（O(n²) 的 HTML 生成 + 逐块 inferMolangBoneParent）。这里复用 OBJ 批量导入已有的
       `_bulkAddDepth` 抑制逐块重建，函数末尾（还原选中之后）统一渲染一次。
       autoSelect 传 false：选中状态本来就由函数尾部按 prevSelectedIds 恢复，避免逐块 selectBlock 抖动。 */
    _bulkAddDepth++;
    try {
    state.blocks.forEach(s => {
        const M = [0,0,0,0,0,0,1,1,0,0,0,0,0];
        const blk = new Block(s.id, M, s.textureUrl, s.materialColor || '#aaccff', s.type || 'cube', s.group, s.faceTextures);
        blk.materialType = s.materialType || (s.faceTextures ? 'faces' : 'color');
        blk.facePresetKey = s.facePresetKey || null;
        blk.materialPresetName = s.materialPresetName || null;
        // ★旗帜生成器配方随撤销 / 项目存档一起持久化（2026-10-18 r36）：贴图本身仍走下面的
        //   textureUrl 分支加载，这里只把配方与「它对应哪张贴图」挂回去 ⇒ 撤销/存档之后导出
        //   依旧输出 'banner：…' 紧凑配方，而不是退回 base64。
        //   loomUrl 直接取 blk.textureUrl（同一份 data URL，pass-through，无额外体积）。
        if (s.loomCode) { blk.loomCode = s.loomCode; blk.loomUrl = blk.textureUrl; }
        blk.scope.program = s.program || '';
        blk.scope.molangMode = !!s.molangMode;
        blk.scope.molangEditedByUser = !!s.molangEditedByUser;
        blk.hidden = !!s.hidden;   // 单项隐藏随撤销 / 项目存档一起持久化
        blk.locked = !!s.locked;   // 单项锁定（禁止选中、仍显示）随撤销 / 项目存档一起持久化
        blk.scope.vars.clear();
        // ★ 存量强检：撤销快照 / 项目存档 / 旧文件里遗留的 extend_scale=0 在此就地改写为 1e-4。
        //   这是「已有的文件也要强检」的关键落点 —— getState/restoreState 是项目存取与撤销的唯一咽喉，
        //   任何历史数据（含本修复之前保存的工程）恢复时都会经过这里。
        s.vars.forEach(v => blk.scope.vars.set(v.name, new VarDef(
            esGuardVarExpr(v.name, v.expr),
            esGuardVarValue(v.name, v.value),
            v.rangeMin, v.rangeMax, v.step)));
        blk.refresh();
        if (blk.materialType === 'faces' && s.faceTextures) blk.applyFaceTextures(s.faceTextures, s.facePresetKey);
        else if (blk.materialType === 'color' && blk.materialColor) blk.setSolidColor(blk.materialColor);
        else if (blk.materialType === 'texture' && blk.textureUrl) blk.loadTexture(blk.textureUrl, s.materialPresetName);
        addBlock(blk, false, false);
        if (s.boneParent) {
            blk._boneParent = s.boneParent; // 恢复骨骼绑定（_boneParent 不在 scope.vars 里，单独持久化）
            // boneExplicit 是后来才加的字段：旧存档没有它。缺失时按「父是否是本文件夹骨干」推断：
            // 父 = 本文件夹的 _backbone → 文件夹自动绑骨（无动画不导 molang）；否则视为紫色加号显式绑定。
            if (s.boneExplicit !== undefined) blk._boneExplicit = !!s.boneExplicit;
            else {
                const _f = blk.group ? getFolder(blk.group) : null;
                blk._boneExplicit = !(_f && _f._backbone && _f._backbone === s.boneParent);
            }
            // 绑定方式：'pivot'（枢轴绑定，默认）/ 'basepos'（局部轴绑定）。
            // 旧存档没有该字段 → 留空，由 getBoneMode 按 molang 表达式是否引用 t.<父>_bx 推断。
            if (s.boneMode === 'basepos' || s.boneMode === 'pivot') blk._boneMode = s.boneMode;
        }
    });
    } finally { _bulkAddDepth--; }
    // 恢复组信息：文件夹仅作分组，但保留可选「骨骼枢轴」参考点 pivot（旧版无此字段时回退为 null）
    if (state.folders) {
        // 保留当前展开/折叠状态：expanded 是 UI 浏览状态，不应随数据操作（如编辑枢轴/旋转）的撤销而回退，否则 Ctrl+Z 会把已展开的文件夹误折叠
        const _prevExpanded = {};
        folders.forEach(f => { _prevExpanded[f.name] = !!f.expanded; });
        folders = JSON.parse(JSON.stringify(state.folders)).map(f => ({
            name: f.name,
            parentName: (f.parentName || null),
            pivot: (f.pivot && Array.isArray(f.pivot)) ? f.pivot.slice() : null,
            rotation: (f.rotation && Array.isArray(f.rotation)) ? f.rotation.slice() : [0, 0, 0],
            expanded: (f.name in _prevExpanded) ? _prevExpanded[f.name] : !!f.expanded,
            hidden: !!f.hidden,
            _backbone: (f._backbone || null)
        }));
        window.folders = folders;
    } else {
        folders = [];
        window.folders = folders;
    }
    folderAxesDirty = true;
    // ★ 必须在刷新方块【之前】恢复全局变量：骨骼子方块依赖 t[父_px/py/pz]、t[父_rotatex] 等全局变量
    //   实时取父块世界位置。若方块 refresh 时 globalVars 尚未就绪（典型场景：从空场景 redo 回来、
    //   上一状态的 globalVars 为空），t[父_px] 在 resolveGlobalValue 里查不到 sourceBlockId 就回退 0，
    //   子块整体落到原点（用户报告的「撤回到导入前再重做 → 模型掉在原点」）。
    //   先恢复 globalVars（blocks 已在上方重建、父块 v.xpos 等已是正确常量）再统一 refresh 即可正确解析。
    globalVars.clear();
    state.globalVars.forEach(g => globalVars.set(g.name, { def: new VarDef(g.expr, g.value, g.rangeMin, g.rangeMax, g.step), sourceBlockId: g.sourceBlockId }));
    // 文件夹变换变化后，刷新所有方块（其有效矩阵依赖文件夹链）并重建 Gizmo / 数值面板
    blocks.forEach(b => { try { b.refresh(); } catch (e) {} });
    requestGizmoRefresh();
    renderInspector();
    // 恢复关键帧数据
    keyframeData.clear();
    if (state.keyframes) {
        state.keyframes.forEach(kf => {
            const frames = new Map();
            kf.frames.forEach(f => {
                const varMap = new Map();
                // ★ 存量强检：关键帧里记下的 extend_scale=0（旧文件 / 旧录制）同样改写为 1e-4，
                //   否则动画导出时 start_/T_ 端点会 lerp 出 0 → 整段动画矩阵奇异。
                f.vars.forEach(v => varMap.set(v.name, esGuardVarValue(v.name, v.val)));
                frames.set(f.time, varMap);
            });
            keyframeData.set(kf.blockId, { frames, animId: kf.animId });
        });
    }
    // ★★ 存量强检总闸：撤销/重做 / 项目装载 / 旧文件恢复的最后一道网。
    //   在此统一扫一遍方块变量 + molang 程序 + 全局变量 + 关键帧，把残留的 extend_scale=0 洗净。
    //   放在 keyframeEpoch++ 之前，保证骨骼播放缓存重算时读到的是洗净后的数据。
    try { const n = esSweepAllScopes(); if (n) console.log(`[extend_scale] 存量强检：已修正 ${n} 处 0 → ${ES_MIN}`); }
    catch (e) { console.warn('存量强检失败:', e && e.message); }
    /* ★★★【2026-10-17 修复 · 用户投诉「添加关键帧/加入动画后 Ctrl+Z 撤回无效」的第二半】
       普通方块的 `scope.program` 只是编译器把关键帧数据编译后写回的**派生缓存**（含 `v.<id>_time=...q.anim_time...`）。
       撤销/重做把关键帧数据清掉后，这份陈旧产物不会自动消失 → 画面里「关键帧明明撤掉了，动画却还在跑」。
       故在此同步重算：仅处理「派生缓存里残留时间块、但底层已无任何关键帧数据」的方块，
       交回 refreshMolangProgramForBlock → generateMolangBaseline（纯静态基线，不含 q.anim_time）。
       注意：① molang 模式 / 用户手改过的方块「程序即真相」，不动（后者还会弹 toast）；
             ② 从未有 program 的普通方块不动，避免无谓生成基线污染状态。 */
    blocks.forEach(b => {
        if (!b || !b.scope) return;
        if (b.scope.molangMode || b.scope.molangEditedByUser) return;
        const prog = b.scope.program;
        if (prog && /q\.anim_time/.test(prog) && !hasKeyframeAnimation(b.id)) {
            try { refreshMolangProgramForBlock(b.id); } catch (e) { }
        }
    });
    // 标记关键帧数据变更，使骨骼播放缓存（_kfPlayPre）失效并重算，
    // 避免撤回后播放仍沿用旧的骨骼快照。
    keyframeEpoch++;
    // 重建关键帧选择器标签
    renderKeyframeBlockSelector();
    // 恢复多选状态
    /* ★【2026-10-24 性能】用 Map 查 id：旧实现 prevSelectedIds.forEach(id => blocks.find(bl => bl.id === id))
       是 O(n×m)，几千块时同样可观；这里一次建表后 O(1) 命中。 */
    const _byId = new Map();
    for (const b of blocks) _byId.set(b.id, b);
    prevSelectedIds.forEach(id => {
        const b = _byId.get(id);
        if (b && !isBlockHidden(b)) selectedBlocksSet.add(b);
    });
    if (prevSelectedBlockId) {
        const nb = _byId.get(prevSelectedBlockId);
        if (nb) selectBlock(nb); else selectBlock(null);
    } else {
        if (selectedBlocksSet.size > 0) selectBlock(selectedBlocksSet.values().next().value);
        else selectBlock(null);
    }
    if (selectedBlock) renderVariablesForBlock(selectedBlock);
    else renderVariablesForBlock(null);
    blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
    // 测量（测长 / 测角）：按状态重建（方块已就位后再建，顶点锚定才有意义；旧存档无该字段 ⇒ 清空）
    try { if (typeof measureRestoreFromState === 'function') measureRestoreFromState(state.measures); } catch (e) {}
    if (isNewLayoutMode) renderSideBlockList();
    // 刷新关键帧窗口
    if (keyframeWindowOpen && keyframeWindowEl) {
        renderKeyframeTimeline();
        renderKeyframeDataPanel();
    }
}

// 撤销/重做后需落盘：否则像「清空项目」这类操作撤销后若不继续编辑就刷新，会回到撤销前的结果
// ★【2026-10-24 性能优化】恢复后把快照缓存指向该状态：下一次 getState() 能直接命中缓存复用，
//   且可避免把等价状态重复压栈（history.record 的引用相同判断）。
function undo() { flushPendingRecords(); const cur = getState(); const prev = history.undo(cur); if (prev) { restoreState(prev); _lastStateSnapshot = prev; bumpDrawRev('ui'); if (typeof scheduleAutoSave === 'function') scheduleAutoSave(); } }
function redo() { flushPendingRecords(); const cur = getState(); const nxt = history.redo(cur); if (nxt) { restoreState(nxt); _lastStateSnapshot = nxt; bumpDrawRev('ui'); if (typeof scheduleAutoSave === 'function') scheduleAutoSave(); } }
// 暴露到 window 供 Android 原生接口调用
window.undo = undo;
window.redo = redo;

// ★【2026-10-24 性能】批量新增（OBJ 整模导入等）时抑制「逐块重建侧栏」：
//   旧实现每 addBlock 一次就 renderSideBlockList() 一次，几百上千块即 O(n²) 的字符串拼接 + innerHTML。
let _bulkAddDepth = 0;
function addBlock(block, record = true, autoSelect = true) {
    // q.life_time 出生时刻：记录该方块「进入场景」时的全局时钟值，使每块独立计时
    // （复制 / 新建 / 加载都经此入口，故副本天然是「新生的」，life_time 从接近 0 开始）。
    if (block._lifeBorn == null) block._lifeBorn = _lifeTime;
    blocks.push(block);
    invalidateBlockIdCache();   // 方块集合已变：让 getBlockById 立即重建
    scene.add(block.mesh);
    if (!_bulkAddDepth) updateBlockLabel(block);   // 批量导入时改为整批一次（见 objCommitPlan）
    // 当某个文件夹（骨骼）处于选中状态作为活动容器时，不自动选中新方块，
    // 以免 selectBlock 把活动文件夹清空（新方块已通过 group 归入该文件夹）。
    if (autoSelect && selectedBlock === null) selectBlock(block);
    if (record) recordAction();
    if (isNewLayoutMode && !_bulkAddDepth) renderSideBlockList();
}

// 方块列表「删除 / 复制」按钮的触屏守卫：真机 Android WebView 里，
// 父元素 draggable=true 的列表项会让触屏点按被当成拖拽、不派发 click，
// 导致按钮“按不动”。这里额外在 touchend 上触发动作，并用短时锁去重，
// 保证 touchend 与（若仍派发的）click 只执行一次。
const _lastBlockAction = { key: '', ts: 0 };
function tryBlockAction(key) {
    const now = Date.now();
    if (_lastBlockAction.key === key && now - _lastBlockAction.ts < 800) return false;
    _lastBlockAction.key = key; _lastBlockAction.ts = now;
    return true;
}

function removeBlock(block, silent = false) {
    // 有关键帧时弹出确认
    if (!silent && _kfSystemReady && keyframeData.has(block.id) && keyframeData.get(block.id).frames.size > 0) {
        showConfirmModal(`方块 "${block.id}" 存在关键帧动画，确认删除？<br><small style="color:#94a3b8;">删除后将同时移除该方块的所有关键帧数据。</small>`, (ok) => {
            if (ok) {
                removeBlock(block, true);
            }
        });
        return;
    }
    // 清理关键帧数据
    if (_kfSystemReady && keyframeData.has(block.id)) {
        removeKeyframeBlock(block.id);
        // 如果没有更多关键帧方块且处于关键帧模式，自动退出
        if (isKeyframeMode && !blocks.some(b => b !== block && _kfSystemReady && keyframeData.has(b.id))) {
            isKeyframeMode = false;
            kfResetMselLock();   // 退出动画模式 ⇒ 一并复位多选锁定（按钮随窗口隐藏，用户够不着）
            if (keyframeWindowOpen && keyframeWindowEl) {
                stopKeyframePlayback();
                keyframeWindowEl.style.display = 'none';
                keyframeWindowOpen = false;
            }
        }
    }
    const idx = blocks.indexOf(block);
    removeBubblesForBlock(block);   // 方块被删 → 其名下所有泡泡（瞬时 + 常显）炸开移除
    if (idx === -1) return;

    // ★ 删除方块前，先解除以它为父骨骼的子块绑定，并清理它发布的骨骼全局变量。
    // 否则 globalVars 里残留的 t.<id>_px/py/pz/xrot/yrot/zrot（sourceBlockId=被删方块）会让
    // 之后新建/导入同 id 方块错误显示 source 蓝色角标，也会让残留子块继续指向已不存在的父。
    blocks.slice().forEach(b => { if (b._boneParent === block.id) unbindBone(b, true); });
    for (let [n, g] of Array.from(globalVars.entries())) {
        if (g.sourceBlockId === block.id) globalVars.delete(n);
    }

    if (idx !== -1) blocks.splice(idx, 1);
    invalidateBlockIdCache();   // 方块集合已变：让 getBlockById 立即重建（避免旧对象残留被 molang 跟随引用）
    scene.remove(block.mesh);
    if (block.label) scene.remove(block.label);
    if (block.selectionWireframe) scene.remove(block.selectionWireframe);
    // 清除当前 Gizmo 状态避免残留
    if (activePick) { clearActiveHighlight(); activePick = null; draggingGizmo = false; pendingInputPick = null; controls.enabled = true; }
    selectedBlocksSet.delete(block);
    /* ★【2026-10-24 性能】批量删除（_bulkAddDepth > 0，见 deleteSelectedBlocks / removeFolder / tutClearAllBlocks）：
       只做数据与场景清理，UI 刷新交给批量调用方收尾统一做一次。
       旧实现每删一块都 updateAxesVisibility()（遍历全部剩余块）、requestGizmoRefresh + updateToolbar、
       clearBrushVertexMarkers() 和 renderSideBlockList()（整棵侧栏重建），一次删几千块就是 O(n²) —— 实测卡死。 */
    if (_bulkAddDepth) {
        if (selectedBlock === block) selectedBlock = null;
        // 删到一块不剩时必须退出各模式（其余 UI 收尾由批量调用方统一做）
        if (blocks.length === 0) clearHerModes();
        return;
    }
    if (selectedBlock === block) { selectedBlock = blocks[0] || null; if (selectedBlock) selectBlock(selectedBlock); else renderVariablesForBlock(null); }
    updateAxesVisibility();
    recordAction();
    if (blocks.length === 0) { clearHerModes(); }
    else { requestGizmoRefresh(); updateToolbar(true); }
    if (isNewLayoutMode) renderSideBlockList();
    clearBrushVertexMarkers();
}

// 选中一个文件夹（骨骼）：清空方块选择，刷新 inspector 与文件夹 Gizmo / 数轴
function selectFolder(name) {
    const f = getFolder(name);
    if (!f) return;
    selectedFolder = name;
    // 清空方块选择状态
    if (selectedBlock && selectedBlock.axisHelper) selectedBlock.axisHelper.visible = false;
    selectedBlock = null;
    selectedBlocksSet.clear();
    kfExplicitPickIds.clear();   // 文件夹选择=整组自动扩展，组内成员均非“亲手点选”
    blocks.forEach(b => b.updateSelectionHighlight(false));
    updateAxesVisibility();
    if (isNewLayoutMode) renderSideBlockList();
    renderInspector();
    renderVariablesForBlock(null);   // 选中文件夹时清空右侧变量面板，避免残留上一个方块的变量卡片（新手教程卡关根因之一）
    folderAxesDirty = true;
    requestGizmoRefresh();
    updateToolbar(true);
    /* 【2026-10-19 · 关键帧去文件夹化】选中文件夹不再等于「整组编辑」：
       文件夹在关键帧里已退化为纯分组容器，不产生任何轨道、也不进入整组编辑态。
       批量编辑请直接在画布/侧栏上多选方块。 */
}
function clearFolderSelection() {
    if (!selectedFolder) return;
    selectedFolder = null;
    folderAxesDirty = true; // 恢复选中文件夹的静态坐标轴显示
    if (isNewLayoutMode) renderSideBlockList();
    renderInspector();
    renderVariablesForBlock(null);   // 取消文件夹选中时同样清空变量面板
    requestGizmoRefresh();
    updateToolbar(true);
}
function selectBlock(block) {
    selectedFolder = null;
    // ★ 隐藏方块不能被设为当前选中（自身 hidden 或位于隐藏文件夹）；★锁定的方块同样不可被选中（但仍显示）——
    //   两者统一降级为「取消选中」。
    if (block && (isBlockHidden(block) || isBlockLocked(block))) block = null;
    if (!block) clearVirtModKeys();   // 取消选中方块：清除虚拟修饰键（手机端模拟 Shift/Ctrl）的常亮状态
    if (selectedBlock && selectedBlock.axisHelper) selectedBlock.axisHelper.visible = false;
    selectedBlock = block;
    if (block) {
        setBlockAxisHelper(block);
        // 自动展开方块所属文件夹（含父链），便于在侧边栏定位（仅新操作模式）
        if (isNewLayoutMode && block.group) expandFolderChain(block.group);
        blocks.forEach(b => {
            const lv = (b === block) ? 0.2 : 0;
            if (b.type === 'cube') {
                forEachMat(b.mesh, m => { m.emissiveIntensity = lv; });
            } else if (b.type === 'flag') {
                forEachMat(b.meshes[2], m => { m.emissiveIntensity = lv; });
            } else if (b.type === 'halfbrick' || b.type === 'stair') {
                b.meshes.forEach(mesh => forEachMat(mesh, m => { m.emissiveIntensity = lv; }));
            }
        });
        renderVariablesForBlock(block);
    } else renderVariablesForBlock(null);
    updateAxesVisibility();
    blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
    if (isNewLayoutMode) renderSideBlockList();
    requestGizmoRefresh();
    updateToolbar(true); // 同步顶部变换工具栏（如从文件夹切回方块时恢复「位移/局部旋转/全局旋转」并显示）
    /* ★r41 织布机浮窗若开着：选中别的旗帜时面板要实时切过去。
       此前面板只在开窗那一刻读配方 ⇒ 窗开着改选另一面旗帜，面板仍显示上一面旗帜的组成（用户报障）。 */
    if (typeof loomOnSelectionSync === 'function') { try { loomOnSelectionSync(); } catch (e) { } }
    /* ★【2026-10-28 修复】selectBlock 是各条选中路径（画布点选/Ctrl 多选/框选/点空白清空/
       侧栏/下拉）的共同收口：在这里排队同步时间轴轨道名，避免「多选后名字迟迟不上色、还带斜体」。 */
    scheduleKfTrackTimelineSync();
}

function blockAxisShown(block) {
    if (!showLocalAxes) return false;
    if (selectedBlocksSet.size > 1) {
        // 大选区只给主选中块显示自身坐标轴（见 _AXIS_HELPER_MAX 注释）
        if (selectedBlocksSet.size > _AXIS_HELPER_MAX) return block === selectedBlock;
        return selectedBlocksSet.has(block);
    }
    return block === selectedBlock;
}
// 应用单个方块自身坐标轴（basepos局部位移轴）的可见性：支持父开关 + 分轴独立控制
// ★【2026-10-24 性能】轴辅助器惰性创建：只有「需要显示」时才建 3 个 ArrowHelper 并挂进场景。
function setBlockAxisHelper(block) {
    if (!block) return;
    const shown = blockAxisShown(block);
    if (!shown) { if (block.axisHelper) block.axisHelper.visible = false; return; }
    if (!block.axisHelper) {
        const axisGroup = new THREE.Group();
        axisGroup.add(new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(0,0,0), 2, 0xff6666, 0.3, 0.2));
        axisGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,0), 2, 0x66ff66, 0.3, 0.2));
        axisGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,0), 2, 0x66aaff, 0.3, 0.2));
        block.axisHelper = axisGroup;
        // 单cube时轴辅助器加到cube上，多cube时加到rootGroup上
        (block.meshes.length === 1 ? block.mesh : block.rootGroup).add(axisGroup);
    }
    block.axisHelper.visible = true;
    const ch = block.axisHelper.children; // [0]=X红 [1]=Y绿 [2]=Z蓝 (ArrowHelper)
    if (showBaseposAxis) {
        ch.forEach(c => c.visible = true);
    } else {
        // 父开关勾选(关闭)时，按各轴开关决定；baseposAxisHide[k]=true 表示隐藏该轴
        ch[0].visible = !baseposAxisHide.x;
        ch[1].visible = !baseposAxisHide.y;
        ch[2].visible = !baseposAxisHide.z;
    }
}
function updateAxesVisibility() {
    bumpDrawRev('ui');   // 坐标轴辅助器显隐变了
    blocks.forEach(setBlockAxisHelper);
}

/* ★【2026-10-24 性能】名字标签的三处减负（几千方块时这三处合计吃掉大量帧时间）：
   ① 近端预算：块数 > LABEL_ALL_LIMIT 时只为相机最近 LABEL_NEAR_COUNT 块建标签。
      每帧被 CSS2DRenderer 投影 + 写样式的元素从「几千个」降到「两百来个」。
   ② 惰性创建：不在预算内 / 名字已关闭时不创建 DOM 节点（旧实现首帧就给每块建 label）。
   ③ 写前判变：display / transform / opacity 只在值真正变化时才写；
      并复用临时向量，避免每帧几千次 new THREE.Vector3() 造成 GC 抖动。 */
const LABEL_NEAR_COUNT = 220;
const LABEL_ALL_LIMIT = 400;
let _labelBudgetSet = null;       // null = 未启用预算（全量显示，保持小场景旧行为）
let _labelBudgetTs = 0;
const _labelOwners = new Set();   // 已建过标签的块（用于预算外清理，见 _pruneLabelsOutside）
const _lblPos = new THREE.Vector3(), _lblQuat = new THREE.Quaternion(), _lblScl = new THREE.Vector3();

function refreshLabelBudget(now) {
    if (blocks.length <= LABEL_ALL_LIMIT) { _labelBudgetSet = null; return; }
    if (_labelBudgetSet && now - _labelBudgetTs < 250) return;
    _labelBudgetTs = now;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const arr = [];
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (!b.mesh || b.mesh.visible === false || isBlockInHiddenGroup(b)) continue;
        const e = b.mesh.matrixWorld.elements;
        const dx = e[12] - cx, dy = e[13] - cy, dz = e[14] - cz;
        arr.push([dx * dx + dy * dy + dz * dz, b]);
    }
    arr.sort((a, b2) => a[0] - b2[0]);
    const set = new Set();
    const n = Math.min(arr.length, LABEL_NEAR_COUNT);
    for (let i = 0; i < n; i++) set.add(arr[i][1]);
    /* ★ 成员没变时保留旧 Set 引用：否则每 250ms 都会换一个新对象，
       updateAllBlockLabels 会误判「预算变了」→ 白白补一帧（静止时应零渲染）。 */
    if (_labelBudgetSet && _labelBudgetSet.size === set.size) {
        let same = true;
        for (const b of set) { if (!_labelBudgetSet.has(b)) { same = false; break; } }
        if (same) { _pruneLabelsOutside(set); return; }
    }
    _labelBudgetSet = set;
    _pruneLabelsOutside(set);
}
/* 兜底清理：把「已建了标签但不在预算内」的块全部销毁。
   触发点：撤销/重做重建方块（小场景时全量建标签）、预算从 null 变 Set 等，
   若不清理会让标签 DOM 涨回几千个（实测 2912 个，CSS2D 每帧投影它们 → 卡）。 */
function _pruneLabelsOutside(set) {
    if (!_labelOwners.size) return;
    for (const b of _labelOwners) { if (!set.has(b)) _disposeBlockLabel(b); }
}
function updateAllBlockLabels(now) {
    const before = _labelBudgetSet;
    refreshLabelBudget(now);
    /* ★ 预算集合没变时只遍历「真正有标签的那几百个」，不再每帧扫全部几千块；
       集合变化（每 250ms 至多一次）时，把「离开预算」的标签彻底销毁 ——
       否则相机缓慢移动时会累积出几千个标签 DOM（实测 2940 个，反而更卡）。 */
    if (_labelBudgetSet === before) {
        if (_labelBudgetSet) { for (const b of _labelBudgetSet) updateBlockLabel(b); return; }
    } else {
        bumpDrawRev('ui');   // 近端预算集合变了：新进入的标签需要一帧投影才会出现
        if (before) for (const b of before) { if (!_labelBudgetSet || !_labelBudgetSet.has(b)) _disposeBlockLabel(b); }
        if (_labelBudgetSet) { for (const b of _labelBudgetSet) updateBlockLabel(b); return; }
    }
    for (let i = 0; i < blocks.length; i++) updateBlockLabel(blocks[i]);
}
// 销毁预算外的标签（含 DOM 节点），标签数量因此恒定在 LABEL_NEAR_COUNT 附近
function _disposeBlockLabel(block) {
    const lbl = block.label;
    if (!lbl) return;
    if (lbl.parent) lbl.parent.remove(lbl);
    const el = lbl.element;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    block.label = null; block._labelInner = null;
    block._labelTf = null; block._labelOp = null; block._labelShown = false;
    _labelOwners.delete(block);
}
// 只写真正变化的样式（逐帧无条件写 element.style 是主要开销之一）
function _setLabelVisible(block, show) {
    const lbl = block.label;
    if (!lbl) return;
    if (lbl.visible !== show) lbl.visible = show;
    if (block._labelShown === show) return;
    block._labelShown = show;
    const el = lbl.element;
    if (!el) return;
    if (show) el.style.removeProperty('display');
    else el.style.setProperty('display', 'none', 'important');
}

function updateBlockLabel(block) {
    const inBudget = !_labelBudgetSet || _labelBudgetSet.has(block);
    const hidden = isBlockInHiddenGroup(block);
    const shouldShow = inBudget && !hideNames && !hidden;
    if (!block.label) {
        if (!shouldShow) return;                 // 不显示就不建 DOM（几千个 label 节点的创建与布局是大头）
        const div = document.createElement('div');
        div.className = 'block-label';
        const inner = document.createElement('span');
        inner.className = 'block-label-inner';
        inner.textContent = block.id;
        div.appendChild(inner);
        block.label = new CSS2DObject(div); scene.add(block.label);
        block._labelInner = inner;
        _labelOwners.add(block);
    }
    _setLabelVisible(block, shouldShow);
    if (!shouldShow) return;
    block.mesh.matrixWorld.decompose(_lblPos, _lblQuat, _lblScl);
    const scale = block.scope.vars.get('v.scale')?.value ?? 1;
    // 设置标签位置并根据摄像机距离动态缩放（近大远小）
    block.label.position.copy(_lblPos);
    const d = camera.position.distanceTo(_lblPos);
    const ref = 6; // 参考距离，可根据需要微调
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const scaleFactor = clamp(ref / Math.max(d, 0.0001), 0.65, 1.4);
    // 使标签位于方块上方，随缩放适当调整高度
    block.label.position.y += 0.5 * Math.abs(scaleFactor) + 0.1;
    const inner = block._labelInner;
    if (inner) {
        // 同时保留斜切并应用缩放：顺序先 skew 再 scale
        const tf = `skewX(-8deg) scale(${scaleFactor})`;
        if (block._labelTf !== tf) { block._labelTf = tf; inner.style.transform = tf; }
        const op = String(clamp((ref * 1.2) / Math.max(d, 0.0001), 0.5, 1));
        if (block._labelOp !== op) { block._labelOp = op; inner.style.opacity = op; }
    }
}

function duplicateBlock(original) {
    let base = original.type === 'flag' ? "Flag"
        : original.type === 'dropitem' ? "DropItem"
            : original.type === 'stair' ? "Stair"
                : original.type === 'halfbrick' ? "Halfbrick"
                    : "Cube";
    let newId = base, cnt = 1;
    while (blocks.some(b => b.id === newId)) newId = base + (cnt++);
    const M = original.scope.toM();
    const nb = new Block(newId, M, original.textureUrl, original.materialColor, original.type, original.group,
                         original.faceTextures ? original.faceTextures.slice() : null);
    nb.materialType = original.materialType;
    nb.facePresetKey = original.facePresetKey;
    nb.materialPresetName = original.materialPresetName;
    // ★旗帜配方随副本一起继承（2026-10-18 r36）：副本 textureUrl 与原件同源 ⇒ loomUrl 一并继承，
    //   否则副本导出会退回 base64。
    if (original.loomCode) { nb.loomCode = original.loomCode; nb.loomUrl = original.loomUrl; }
    nb.scope.vars.clear();
    for (let [n,d] of original.scope.vars.entries()) nb.scope.vars.set(n, new VarDef(d.expr, d.value, d.rangeMin, d.rangeMax, d.step));
    // ★ 复制骨骼绑定关系（2026-10-03 用户报：紫色加号绑定的子块被复制后，副本导出成「完全错误的常量」）。
    //   副本必须继承 _boneParent/_boneExplicit，否则同一概念出现两套判定：
    //     · 运行时 isBoneMolangDriven(c) 会因为复制的 v.xpos 里含 t.<父>_px 而认出它是骨骼子块 → 实时跟随父块；
    //     · 导出侧 getCommandTextForBlock 的 isBoneChild 只认 _boneParent → 副本被判成普通块、输出常量
    //       （getConstantAssignmentsString），与实时不一致：导入游戏后不跟随、位置/朝向全错。
    //   副本与原块同位置（M 取自 original.scope.toM()）⇒ 复制来的 xbasepos_bone 偏移依然正确，无需重算。
    if (original._boneParent) {
        nb._boneParent = original._boneParent;
        nb._boneExplicit = original._boneExplicit;
        nb._boneMode = original._boneMode;
    }
    // 复制 molang 方块：保留 molang 接管状态与程序本体，避免表达式丢失
    if (original.scope.molangMode) {
        nb.scope.molangMode = true;
        nb.scope.molangEditedByUser = original.scope.molangEditedByUser;
        // 同步重命名时间变量 v.<原id>_time → v.<新id>_time（与导入路径保持一致），
        // 否则关键帧 molang 程序里的时间变量名与方块 ID 不匹配，动画无法被驱动
        let prog = original.scope.program || '';
        if (original.id !== nb.id) {
            prog = prog.replace(
                new RegExp(`v\\.${String(original.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_time`, 'g'),
                `v.${nb.id}_time`
            );
        }
        nb.scope.program = prog;
    }
    nb.refresh(); addBlock(nb, true);
    // 复制方块若在原文件夹内，同样走自动规划/绑定骨干（与拖入/导入/新建保持一致）。
    // ★ 已继承骨骼绑定（_boneParent）时跳过：否则会把显式 ✛ 绑定覆盖成「文件夹骨干」，
    //   破坏上面刚继承的父子关系（复制的意义就是与原件一致）。
    if (original.group && !nb._boneParent) autoBoneBindOnFolderAdd(nb, original.group);
    selectBlock(nb);
}

function duplicateSelectedBlocks() {
    if (selectedBlocksSet.size === 0) return;
    const toDup = Array.from(selectedBlocksSet), newBs = [];
    for (let b of toDup) { duplicateBlock(b); newBs.push(blocks[blocks.length-1]); }
    selectedBlocksSet.clear(); toDup.forEach(b => selectedBlocksSet.add(b)); newBs.forEach(b => selectedBlocksSet.add(b));
    selectedFolder = null; // 复制方块后保持方块多选态，避免文件夹优先导致 Gizmo 无法操作方块
    if (selectedBlock) renderVariablesForBlock(selectedBlock);
    updateAxesVisibility(); blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
}

