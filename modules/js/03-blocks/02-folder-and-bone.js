/* 03-blocks/02-folder-and-bone.js · 源 测试版v.6b79.html 第 10665-11143 行 */
'use strict';
// ===== 文件夹（骨骼）辅助函数 =====
function getFolder(name) { return folders.find(f => f.name === name) || null; }
function getChildFolders(name) { return folders.filter(f => f.parentName === name); }
function getRootFolders() { return folders.filter(f => !f.parentName || !getFolder(f.parentName)); }
function getDescendantFolderNames(name) {
    const out = [];
    const stack = [name];
    while (stack.length) {
        const cur = stack.pop();
        getChildFolders(cur).forEach(c => { out.push(c.name); stack.push(c.name); });
    }
    return out;
}
function getFolderAllCubeIds(name) {
    const names = [name, ...getDescendantFolderNames(name)];
    return blocks.filter(b => b.group && names.includes(b.group)).map(b => b.id);
}
// 获取某文件夹的父骨骼链（从直接父级一直追溯到根），返回 [直接父, 祖父, ...]
// 用于导出时把“父骨骼标识符”一并带上，避免嵌套骨骼在导出/导入后丢失层级。
function getFolderParentChain(folderName) {
    const chain = [];
    let cur = getFolder(folderName);
    if (!cur) return chain;
    let guard = 0;
    while (cur && cur.parentName && guard++ < 100) {
        const p = getFolder(cur.parentName);
        if (!p) break;
        chain.push(p.name);
        cur = p;
    }
    return chain;
}
// 自动展开某方块所属文件夹及其全部祖先（沿 parentName 链），返回是否有变化
function expandFolderChain(folderName) {
    if (!folderName) return false;
    let changed = false;
    const self = getFolder(folderName);
    if (self && !self.expanded) { self.expanded = true; changed = true; }
    getFolderParentChain(folderName).forEach(n => {
        const f = getFolder(n);
        if (f && !f.expanded) { f.expanded = true; changed = true; }
    });
    return changed;
}
// 生成导出的"父骨骼标识符"片段：若方块所属骨骼(文件夹)存在父级，则输出 'parentbone:A>B>...';
// 链中第一项为直接父骨骼，其后依次为其祖先骨骼。无父级时返回空串。
function getParentBonePrefix(block) {
    if (!block || !block.group) return '';
    const chain = getFolderParentChain(block.group);
    if (!chain.length) return '';
    return molangTag(`'parentbone:${chain.join('>')}';`);
}
// 生成导出的"骨骼坐标"片段：携带骨骼(文件夹)的枢轴 pivot 与累计旋转 rotation，
// 避免再次导入项目时骨骼坐标因 createFolder 重置而全部变为 0 0 0。
// 为避免每个方块重复输出同一骨骼的数据，只在「该组在 blocks 中第一个方块」处输出；
// 若骨骼无有意义的枢轴/旋转则不输出（导入时仍按质心固化，保持原行为）。
function getBoneTagForBlock(block) {
    if (!block || !block.group) return '';
    const f = getFolder(block.group);
    if (!f) return '';
    // 骨骼文件夹不存储任何数据（枢轴/旋转 = 骨干方块实时挂等号），不导出 bone: 标签；
    // 其枢轴/旋转全部携带在骨干方块的 v.xpos/v.xrot 等变量里，导入后无需恢复。
    if (f._backbone) return '';
    const hasPivot = !!(f.pivot && Array.isArray(f.pivot));
    const hasRot = !!(f.rotation && Array.isArray(f.rotation) && (f.rotation[0] || f.rotation[1] || f.rotation[2]));
    if (!hasPivot && !hasRot) return '';
    // 仅在该组第一个方块处输出，避免冗余
    if (blocks.findIndex(b => b.group === block.group) !== blocks.indexOf(block)) return '';
    const fmt = (a) => (a || [0, 0, 0]).map(v => _r4(Number(v) || 0)).join(',');
    const p = hasPivot ? f.pivot : [0, 0, 0];
    const r = (f.rotation && Array.isArray(f.rotation)) ? f.rotation : [0, 0, 0];
    return molangTag(`'bone:${block.group}=[${fmt(p)}]|[${fmt(r)}]';`);
}
// 从命令文本解析骨骼坐标标签，返回 { name, pivot:[x,y,z]|null, rotation:[x,y,z]|null } 或 null
function parseBoneTag(content) {
    const m = content.match(/['"]bone:([^'"]+)['"]/);
    if (!m) return null;
    const body = m[1];
    const eq = body.indexOf('=');
    if (eq < 0) return null;
    const name = body.slice(0, eq).trim();
    const val = body.slice(eq + 1);
    const parts = val.split('|');
    const parseVec = (s) => {
        if (!s) return null;
        const inner = s.replace(/^\[/, '').replace(/\]$/, '');
        const arr = inner.split(',').map(x => parseFloat(x));
        if (arr.length === 3 && arr.every(n => !isNaN(n))) return arr;
        return null;
    };
    const pivot = parseVec(parts[0]);
    const rotation = parseVec(parts[1]);
    if (!pivot && !rotation) return null;
    return { name, pivot, rotation };
}
function createFolder(name, parentName = null) {
    if (getFolder(name)) return getFolder(name);
    // 文件夹是纯分组容器：仅可选存储一个「骨骼枢轴」参考点 pivot（用于 Gizmo 中心与「归位枢轴到骨骼」），
    // 该 pivot 不参与子级方块的渲染/导出变换（保持纯分组语义）；其旋转/移动仍烘焙进子级方块数值。
    const f = { name, parentName: parentName || null, pivot: null, rotation: [0, 0, 0], expanded: false, hidden: false };
    folders.push(f);
    if (parentName) { const p = getFolder(parentName); if (p) p.expanded = true; }
    folderAxesDirty = true;
    return f;
}
function removeFolder(name) {
    const names = [name, ...getDescendantFolderNames(name)];
    // 删骨骼连同模型一起删（用户要求）：先删除本文件夹及所有子孙文件夹内的全部方块，
    // removeBlock 会一并清理关键帧数据/网格/选区。silent=true 整组批量删除，不逐块弹确认。
    const toRemove = blocks.filter(b => b.group && names.includes(b.group));
    toRemove.forEach(b => { if (selectedBlocksSet.has(b)) selectedBlocksSet.delete(b); });
    /* ★【2026-10-24 性能】整组批量删除包 _bulkAddDepth（removeBlock 在批量模式下只清数据），
       UI 收尾由本函数末尾统一做一次。旧写法逐块 refresh，删一个含几千块的骨骼会 O(n²) 卡死。 */
    _bulkAddDepth++;
    try { toRemove.forEach(b => removeBlock(b, true)); }
    finally { _bulkAddDepth--; }
    updateAxesVisibility();
    // 删除文件夹（含所有子孙）
    folders = folders.filter(f => !names.includes(f.name));
    if (selectedFolder && names.includes(selectedFolder)) selectedFolder = null;
    if (selectedBlock === null) renderVariablesForBlock(null);
    window.folders = folders;
    folderAxesDirty = true;
    keyframeEpoch++;
    if (isNewLayoutMode) renderSideBlockList();
    // 关键帧窗口打开时，删除文件夹必须重绘时间轴 / 选择器，否则残留已删文件夹的轨道与行
    if (keyframeWindowOpen) {
        renderKeyframeTimeline();
        renderKeyframeBlockSelector();
        renderKeyframeDataPanel();
    }
}
function renameFolder(oldName, newName) {
    if (oldName === newName) return true;
    if (getFolder(newName)) return false;
    const f = getFolder(oldName);
    if (!f) return false;
    f.name = newName;
    folders.forEach(c => { if (c.parentName === oldName) c.parentName = newName; });
    blocks.forEach(b => { if (b.group === oldName) b.group = newName; });
    folderAxesDirty = true;
    return true;
}
function updateFolderVisibility(name) {
    const f = getFolder(name);
    if (!f) return;
    const ids = new Set(getFolderAllCubeIds(name));
    blocks.forEach(block => {
        if (ids.has(block.id)) {
            // ★ 必须同时看方块自身的 hidden：否则「取消隐藏文件夹」会把用户单独隐藏的方块一起点亮
            //   （以及负 scale / 负 extend_scale 的方块：原版不渲染，这里同口径不显示）
            const isHidden = f.hidden || isAncestorFolderHidden(name) || !!block.hidden || blockHasNegativeScale(block);
            const isVisible = !isHidden;
            if (block.mesh) block.mesh.visible = isVisible;
            if (block.label) {
                const shouldShow = !hideNames && isVisible;
                block.label.visible = shouldShow;
                if (block.label.element) {
                    if (shouldShow) block.label.element.style.removeProperty('display');
                    else block.label.element.style.setProperty('display', 'none', 'important');
                }
            }
            if (block.selectionWireframe) block.selectionWireframe.visible = isVisible;
            if (isHidden && selectedBlocksSet.has(block)) {
                selectedBlocksSet.delete(block);
                if (selectedBlock === block) selectedBlock = null;
            }
        }
    });
    updateAxesVisibility();
    renderSideBlockList();
}
function isAncestorFolderHidden(name) {
    let p = getFolder(name)?.parentName;
    while (p) {
        const pf = getFolder(p);
        if (!pf) break;
        if (pf.hidden) return true;
        p = pf.parentName;
    }
    return false;
}
function isBlockInHiddenFolder(block) {
    let name = block.group;
    while (name) {
        const f = getFolder(name);
        if (!f) break;
        if (f.hidden) return true;
        name = f.parentName;
    }
    return false;
}

// ===== 单项方块隐藏（无分组场景的独立可见性开关）=====
// 方块自身的 hidden 标志，与所属文件夹的 hidden 完全独立。
// 语义与文件夹眼睛一致：只影响「显示」与「选中」，不影响导出（隐藏 ≠ 删除）。
// ★ 这是全部可见性判定的唯一咽喉点：渲染循环 / 射线拾取 / 框选 / 画笔拾取 /
//   标签显示都通过 isBlockInHiddenGroup() 走这里，改一处即全局生效。
function isBlockHidden(block) {
    if (!block) return false;
    return !!block.hidden || isBlockInHiddenFolder(block) || blockHasNegativeScale(block);
}

// FMBE 原版不支持负的 scale / extend_scale：这类方块在原版里根本不渲染。
// 本模拟器同口径 —— 出现负值就当作「不显示」处理（模型、标签、线框、拾取一并隐藏，
// 原理同隐藏：仍然保留在工程里、不影响导出，把值改回非负就自动恢复）。
function blockHasNegativeScale(block) {
    if (!block || !block.scope || !block.scope.vars) return false;
    const s = block.scope.vars.get('v.scale')?.value;
    const es = block.scope.vars.get('v.extend_scale')?.value;
    return (s < 0) || (es < 0);
}

// ===== 方块「锁定」=====
// ★与隐藏的区别（用户定稿）：隐藏 = 不显示且无法选中；锁定 = **只是禁止选中，依然保持显示**。
//   用途：把已定稿 / 不想被误拖动的方块钉住，同时仍能作为参考、骨源被看见。
//   拦截点：① selectBlock / toggleBlockSelection（点击选中）② 框选 ③ 全部选中
//          ④ 渲染循环统一兜底剔除（任何路径把锁定块塞进选区都会在下一帧被清掉）。
//   ★不参与导出（锁定是编辑器状态，和隐藏一样不进命令列表）。
function isBlockLocked(block) {
    return !!(block && block.locked);
}

// 把可见性判定应用到单个方块（点击眼睛后立即生效，不必等下一帧渲染循环）
function applyBlockVisibility(block) {
    if (!block) return;
    const hidden = isBlockHidden(block);
    if (block.mesh) block.mesh.visible = !hidden;
    if (block.label) {
        const shouldShow = !hideNames && !hidden;
        block.label.visible = shouldShow;
        if (block.label.element) {
            if (shouldShow) block.label.element.style.removeProperty('display');
            else block.label.element.style.setProperty('display', 'none', 'important');
        }
    }
    if (hidden && block.selectionWireframe) block.selectionWireframe.visible = false;
    // 隐藏即退出选中（与文件夹隐藏同一口径）：否则 Gizmo / 数值面板会挂在一个看不见的方块上
    if (hidden) {
        if (selectedBlocksSet.has(block)) selectedBlocksSet.delete(block);
        if (selectedBlock === block) selectedBlock = null;
    }
}

// 批量切换方块隐藏状态（侧边栏方块行的 👁 按钮）。
// ★ 多选适配：点选区内任一方块的眼睛 = 对整个选区统一执行隐藏/显示（一次落账、一次重建列表）。
// ★ 破坏性 mutation 落账铁律：禁用 recordAction()（200ms 防抖，窗口内 Ctrl+Z 会被
//   flushPendingRecords() 把 mutation 后的状态压栈又弹掉 → 撤销空转）。
//   必须先 flushPendingRecords() 冲刷，再在 mutation 后立即 history.record(getState())。
function setBlocksHidden(list, hidden, opts = {}) {
    const arr = (list || []).filter(Boolean);
    if (!arr.length) return;
    const next = !!hidden;
    const targets = arr.filter(b => !!b.hidden !== next);   // 已是目标状态的跳过，避免空落账
    if (!targets.length) return;
    flushPendingRecords();
    targets.forEach(b => { b.hidden = next; });
    bumpVisibilityRev();
    targets.forEach(b => applyBlockVisibility(b));
    updateAxesVisibility();
    blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
    if (isNewLayoutMode) renderSideBlockList();
    else if (typeof renderInspector === 'function') renderInspector();
    requestGizmoRefresh();
    if (!opts.silent) {
        history.record(getState());
        const n = targets.length;
        try { showToast(next ? (n > 1 ? `已隐藏 ${n} 个方块` : `已隐藏「${targets[0].id}」`)
                             : (n > 1 ? `已显示 ${n} 个方块` : `已显示「${targets[0].id}」`)); } catch (e) {}
    }
}

function setBlockHidden(block, hidden, opts = {}) {
    setBlocksHidden([block], hidden, opts);
}

// 批量切换方块「锁定」状态（侧边栏方块行的 🔒 按钮）。
// ★与 setBlocksHidden 的关键差别：**不改变可见性**，只禁止选中（锁定即从选区退出）。
// ★多选适配：点选区内任一方块的锁 = 对整个选区统一执行锁定/解锁。
// ★破坏性 mutation 落账铁律：先 flushPendingRecords() 冲刷，mutation 后立即 history.record(getState())。
function setBlocksLocked(list, locked, opts = {}) {
    const arr = (list || []).filter(Boolean);
    if (!arr.length) return;
    const next = !!locked;
    const targets = arr.filter(b => !!b.locked !== next);   // 已是目标状态的跳过，避免空落账
    if (!targets.length) return;
    flushPendingRecords();
    targets.forEach(b => {
        b.locked = next;
        // 锁定即退出选中（否则 Gizmo / 数值面板会挂在一个无法再被选中的方块上）
        if (next) {
            if (selectedBlocksSet.has(b)) selectedBlocksSet.delete(b);
            if (selectedBlock === b) selectedBlock = null;
        }
    });
    bumpVisibilityRev();
    updateAxesVisibility();
    blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
    if (isNewLayoutMode) renderSideBlockList();
    else if (typeof renderInspector === 'function') renderInspector();
    requestGizmoRefresh();
    try { renderVariablesForBlock(selectedBlock || null); } catch (e) {}
    if (!opts.silent) {
        history.record(getState());
        const n = targets.length;
        try { showToast(next ? (n > 1 ? `已锁定 ${n} 个方块（禁止选中，仍显示）` : `已锁定「${targets[0].id}」（禁止选中，仍显示）`)
                             : (n > 1 ? `已解锁 ${n} 个方块` : `已解锁「${targets[0].id}」`)); } catch (e) {}
    }
}

function setBlockLocked(block, locked, opts = {}) {
    setBlocksLocked([block], locked, opts);
}

// ★ 一次性清除**所有方块**的锁定状态（扳手工具菜单「取消锁定」入口）。
//   范围：本项目的全部方块，不区分是否在文件夹内。
function unlockAllBlocks() {
    const targets = blocks.filter(b => b.locked);
    if (!targets.length) {
        try { showToast('没有方块处于锁定状态'); } catch (e) {}
        return;
    }
    setBlocksLocked(targets, false, { silent: true });
    const n = targets.length;
    try { showToast(n > 1 ? `已解锁 ${n} 个方块` : `已解锁「${targets[0].id}」`); } catch (e) {}
}

// ★ 一次性取消**所有方块**的隐藏状态（扳手工具菜单「取消隐藏」入口）。
//   范围：本项目的全部方块，包括「单块隐藏」与「文件夹隐藏」两种来源。
//   注意：这里会把所有文件夹的 hidden 也关掉，否则只清单块 hidden 仍会受文件夹隐藏拖累。
function unhideAllBlocks() {
    let any = false;
    flushPendingRecords();

    // ① 清掉单块 hidden
    const singleHidden = blocks.filter(b => b.hidden);
    if (singleHidden.length) {
        singleHidden.forEach(b => { b.hidden = false; });
        any = true;
    }

    // ② 清掉文件夹 hidden（否则组员仍然看不见）
    const hiddenFolders = (folders || []).filter(f => f.hidden);
    if (hiddenFolders.length) {
        hiddenFolders.forEach(f => { f.hidden = false; });
        any = true;
    }

    // ③ 统一应用可见性（文件夹组 + 单块）
    bumpVisibilityRev();
    blocks.forEach(b => applyBlockVisibility(b));
    if (hiddenFolders.length) {
        hiddenFolders.forEach(f => updateGroupVisibility(f.name));
    }

    updateAxesVisibility();
    blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
    if (isNewLayoutMode) renderSideBlockList();
    else if (typeof renderInspector === 'function') renderInspector();
    requestGizmoRefresh();

    if (!any) {
        try { showToast('没有方块处于隐藏状态'); } catch (e) {}
        return;
    }
    history.record(getState());
    const n = singleHidden.length;
    const m = hiddenFolders.length;
    try { showToast(`已取消隐藏 ${singleHidden.length} 个方块${m > 0 ? `、${m} 个文件夹` : ''}`); } catch (e) {}
}

// ===== 文件夹骨骼矩阵（仅旋转，无缩放 / 无位移）=====
// 关键语义（已与用户确认）：pos(xpos/ypos/zpos) = 枢轴（旋转中心），
// basepos(xbasepos/...) = 局部位移量（几何体相对枢轴的偏移），不是枢轴。
// 文件夹矩阵 = T(Fp) · Rf · T(-Fp)：绕文件夹枢轴旋转，无缩放、无位移。
// 方块有效矩阵 = （根→该文件夹链矩阵） · 方块自身矩阵。
// 绑定瞬间 Rf=0 ⇒ T(Fp)·T(-Fp)=I，外观自动不变，无需破坏性改写 basepos。

// 文件夹旋转矩阵，约定与方块自身旋转一致：Ry(-ry)·Rx(rx)·Rz(-rz)
// ===== 文件夹 = 纯分组容器，不存储任何变换数据 =====
// 文件夹仅可选持有骨骼枢轴参考点 pivot（不参与子级渲染/导出）；对其旋转/移动仍是对子级方块的“统一多选编辑”，
// 所有修改立即写入子级方块自身的 v.* 数值（见 applyFolderMove / applyFolderRotate）。
// 因此文件夹没有局部坐标系，其 Gizmo 世界坐标轴就是世界轴。
// —— 骨骼文件夹例外（用户定稿：文件夹本体不存任何数据）——
// 骨骼文件夹（f._backbone 有值）的【枢轴 = 骨干方块实时世界位置】、【旋转 = 骨干方块实时世界旋转】，
// 与骨干方块直接挂等号。绝不能使用绑定瞬间固化的 f.pivot —— 否则父骨骼旋转/关键帧播放时，
// 子骨骼方块已跟父公转、Gizmo 枢轴却原地不动（用户反复报告「子骨骼枢轴没移动」）。
// 取骨干方块的实时世界旋转（旋转部分，含 molang 实时求值），失败回退世界轴。
function folderLocalAxes(name) {
    const f = getFolder(name);
    if (f && f._backbone) {
        const rb = folderBackboneBlock(f);
        if (rb && rb.scope) {
            try {
                const M = rb.scope.toM();
                const rX = rb.scope.vars.get('v.rotatex')?.value ?? 0;
                const rY = rb.scope.vars.get('v.rotatey')?.value ?? 0;
                const rZ = rb.scope.vars.get('v.rotatez')?.value ?? 0;
                const wm = computeTransformMatrix(M, rX, rY, rZ);
                const q = new THREE.Quaternion().setFromRotationMatrix(wm);
                return {
                    xAxis: new THREE.Vector3(1,0,0).applyQuaternion(q),
                    yAxis: new THREE.Vector3(0,1,0).applyQuaternion(q),
                    zAxis: new THREE.Vector3(0,0,1).applyQuaternion(q)
                };
            } catch (e) {}
        }
    }
    return {
        xAxis: new THREE.Vector3(1,0,0),
        yAxis: new THREE.Vector3(0,1,0),
        zAxis: new THREE.Vector3(0,0,1)
    };
}
// 骨骼文件夹的骨干方块（f._backbone → block），无则 null
function folderBackboneBlock(f) {
    if (!f || !f._backbone) return null;
    return blocks.find(b => b.id === f._backbone) || null;
}
// 文件夹 Gizmo 中心（枢轴锚点）：骨骼文件夹返回骨干方块的【v.xpos/ypos/zpos = 枢轴锚点】。
// 与单方块「枢轴手柄」同构：枢轴锚点即骨干方块的 v.xpos，Gizmo 手柄锚定在此。
// ★ 必须返回 v.xpos（而非 blockWorldPos 网格位置）——骨骼「枢轴联动模型」关闭时，
//   拖拽只平移 v.xpos、basepos 反向补偿使网格原地不动；若返回网格位置，每帧
//   rebuildGizmo 会把手柄强行拉回网格 → 手柄「冻住 / 拖不动」（用户报告）。
//   统一锚定 v.xpos 后，联动开/关两种模式拖拽都改写 v.xpos，手柄稳定跟随。
//   这也是「归位枢轴到骨骼」工具的正确目标（骨骼枢轴=骨干 v.xpos）。
function folderGizmoCenterWorld(name) {
    const f = getFolder(name);
    if (f && f._backbone) {
        const rb = folderBackboneBlock(f);
        if (rb && rb.scope) {
            try {
                return new THREE.Vector3(
                    Number(rb.scope.vars.get('v.xpos')?.value ?? 0),
                    Number(rb.scope.vars.get('v.ypos')?.value ?? 0),
                    Number(rb.scope.vars.get('v.zpos')?.value ?? 0)
                );
            } catch (e) {}
        }
    }
    // 没骨干方块 → 文件夹无"枢轴"概念（按用户定稿："没有骨干方块就等于没有这个骨骼"）。
    return null;
}
// 文件夹 Gizmo 是否应激活
function folderGizmoActive() { return isNewLayoutMode && !!selectedFolder; }
// 文件夹缩放手柄组（供相机自适应缩放遍历）
let folderScaleGroups = [];
// （已移除）文件夹不再存储任何变换矩阵；原 getFolderChainMatrix / getFolderAncestorMatrix /
// getFolderFrameMatrix 全部删除。方块矩阵仅由自身 v.* 决定（见 Block.updateTransform）。
function getFolderChainMatrix() { return new THREE.Matrix4(); }
// 刷新某文件夹（含所有子孙文件夹）内的全部方块
function refreshBlocksUnderFolder(name) {
    const names = [name, ...getDescendantFolderNames(name)];
    const set = new Set(names);
    blocks.forEach(b => { if (b.group && set.has(b.group)) { try { b.refresh(); } catch (e) {} } });
}
// 刷新方块的【全部后代骨骼块】：父骨骼（根或中继）被旋转/位移后，子块必须实时 refresh，
// 才能经 bindBone 建立的 molang（v.xpos = t[父_px] + pR·offset、v.rotatex = t[父_xrot] + own）
// 实时跟随父 —— 与动画/播放路径同构（统一纯 molang 骨骼）。
// 纯 molang 骨骼：子块不写常量关键帧、不烘焙，仅父变、子靠 molang 跟随；这里负责让子块“重新求值”。
// 非骨骼块无 _boneParent 后代，本函数自然 no-op；故可无差别接入块级 Gizmo 旋转/位移路径。
function refreshBoneFollowers(rootBlock) {
    if (!rootBlock) return;
    const visited = new Set([rootBlock.id]);
    const stack = [rootBlock.id];
    while (stack.length) {
        const pid = stack.pop();
        blocks.forEach(b => {
            const bp = getBoneParentId(b);
            if (bp && bp === pid && !visited.has(b.id)) {
                visited.add(b.id); stack.push(b.id);
                try { b.refresh(); b.mesh.updateMatrixWorld(true); } catch (e) {}
            }
        });
    }
}
// 文件夹结构 / 变换发生变化时置脏，renderSideBlockList 末尾按需重建数轴
let folderAxesDirty = true;
const folderAxisHelpers = new Map(); // name -> THREE.Group
const folderAxisGroup = new THREE.Group();
let _folderAxisAdded = false;
// 文件夹不再拥有静态坐标系（不存储变换），故不绘制任何文件夹坐标轴。
// 文件夹的位移/旋转由顶部 Gizmo 工具操作，且直接烘焙进子级方块。
function updateFolderAxes() {
    if (typeof scene === 'undefined') return;
    if (!_folderAxisAdded) { scene.add(folderAxisGroup); _folderAxisAdded = true; }
    folderAxisHelpers.forEach(h => folderAxisGroup.remove(h));
    folderAxisHelpers.clear();
}

