/* 03-blocks/05-copy-paste-and-batch.js · 源 测试版v.6b79.html 第 12343-12888 行 */
'use strict';
// ---------- 方块复制 / 粘贴（Ctrl+C 复制、Ctrl+V 粘贴） ----------
// 复制：把当前选中方块序列化为快照存入剪贴板；【选中状态完全不变】——原方块保持选中。
// 粘贴：从剪贴板重建方块（含 molang 程序、变量、材质、文件夹归属），新方块并入当前多选集合，
//       原选中的方块依然保持选中（满足需求「选中的方块仍保持选中」）。
let _blockClipboard = [];

function serializeSelectedBlocks() {
    return Array.from(selectedBlocksSet).map(original => {
        let base = original.type === 'flag' ? 'Flag'
            : original.type === 'dropitem' ? 'DropItem'
                : original.type === 'stair' ? 'Stair'
                    : original.type === 'halfbrick' ? 'Halfbrick'
                        : 'Cube';
        let newId = base, cnt = 1;
        while (blocks.some(b => b.id === newId)) newId = base + (cnt++);
        return {
            origId: original.id,
            id: newId,
            M: original.scope.toM(),
            textureUrl: original.textureUrl,
            materialColor: original.materialColor,
            type: original.type,
            group: original.group,
            faceTextures: original.faceTextures ? original.faceTextures.slice() : null,
            materialType: original.materialType,
            facePresetKey: original.facePresetKey,
            materialPresetName: original.materialPresetName,
            // ★旗帜生成器配方随剪贴板一起搬运（2026-10-18 r36），否则 Ctrl+C/V 出来的旗帜
            //   会丢掉生成器代码、导出退回 base64。
            loomCode: original.loomCode || null,
            loomUrl: original.loomUrl || null,
            vars: Array.from(original.scope.vars.entries()).map(([n, d]) => ({ n, expr: d.expr, value: d.value, rangeMin: d.rangeMin, rangeMax: d.rangeMax, step: d.step })),
            molangMode: original.scope.molangMode,
            molangEditedByUser: original.scope.molangEditedByUser,
            program: original.scope.program || ''
        };
    });
}

function copySelectedToClipboard() {
    if (selectedBlocksSet.size === 0) return false;
    _blockClipboard = serializeSelectedBlocks();
    showToast(`已复制 ${_blockClipboard.length} 个方块`, { duration: 1500 });
    return true;
}

function pasteFromClipboard() {
    if (_blockClipboard.length === 0) return false;
    const newBs = [];
    for (const snap of _blockClipboard) {
        const base = snap.type === 'flag' ? 'Flag'
            : snap.type === 'dropitem' ? 'DropItem'
                : snap.type === 'stair' ? 'Stair'
                    : snap.type === 'halfbrick' ? 'Halfbrick'
                        : 'Cube';
        let id = snap.id, cnt = 1;
        while (blocks.some(b => b.id === id)) id = base + (cnt++);
        const nb = new Block(id, snap.M, snap.textureUrl, snap.materialColor, snap.type, snap.group,
                             snap.faceTextures ? snap.faceTextures.slice() : null);
        nb.materialType = snap.materialType;
        nb.facePresetKey = snap.facePresetKey;
        nb.materialPresetName = snap.materialPresetName;
        // ★旗帜生成器配方随剪贴板一起搬运（2026-10-18 r36）
        if (snap.loomCode) { nb.loomCode = snap.loomCode; nb.loomUrl = snap.loomUrl; }
        nb.scope.vars.clear();
        for (const v of snap.vars) nb.scope.vars.set(v.n, new VarDef(v.expr, v.value, v.rangeMin, v.rangeMax, v.step));
        // 复制 molang 方块：保留 molang 接管状态与程序本体，并把程序里的时间变量名
        // v.<原id>_time 重命名为 v.<新id>_time（与导入 / Ctrl+D 路径一致），保证关键帧动画仍能驱动。
        if (snap.molangMode) {
            nb.scope.molangMode = true;
            nb.scope.molangEditedByUser = snap.molangEditedByUser;
            let prog = snap.program;
            if (id !== snap.origId) {
                prog = prog.replace(
                    new RegExp(`v\\.${String(snap.origId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_time`, 'g'),
                    `v.${id}_time`
                );
            }
            nb.scope.program = prog;
        }
        nb.refresh();
        addBlock(nb, true, false);  // autoSelect=false：保留当前选区，不抢走选中
        if (snap.group) autoBoneBindOnFolderAdd(nb, snap.group);
        newBs.push(nb);
    }
    // 不改动任何选中状态：原选中方块保持选中，粘贴出的新方块不进选区、
    // 也不高亮（用户要求粘贴后原方块仍保持选中，不能被当成“自动选中”）。
    updateAxesVisibility();
    if (isNewLayoutMode) renderSideBlockList();
    showToast(`已粘贴 ${newBs.length} 个方块`, { duration: 1500 });
    return true;
}

function deleteSelectedBlocks() {
    if (selectedBlocksSet.size === 0) return;
    /* ★【2026-10-24 性能】批量删除包 _bulkAddDepth：removeBlock 在批量模式下只清数据，
       下面这些 UI 收尾（选中 / 坐标轴 / 线框 / 侧栏 / 撤销落账）统一做一次。
       旧实现逐块 removeBlock 各刷一遍，删几千块是 O(n²)（实测侧栏重建累计上百秒 → 卡死）。 */
    const _deleteSelectionNow = () => {
        _bulkAddDepth++;
        try { for (const b of Array.from(selectedBlocksSet)) removeBlock(b, true); }
        finally { _bulkAddDepth--; }
        selectedBlocksSet.clear();
        if (blocks.length) selectBlock(blocks[0]); else selectBlock(null);
        updateAxesVisibility(); blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
        clearBrushVertexMarkers();
        if (blocks.length === 0) clearHerModes();
        recordAction();   // 整批只落一次账（撤销一步回到删除前）
    };
    // 批量删除时检查是否有动画方块，一次确认
    const animBlocks = Array.from(selectedBlocksSet).filter(b => _kfSystemReady && keyframeData.has(b.id) && keyframeData.get(b.id).frames.size > 0);
    if (animBlocks.length > 0) {
        const names = animBlocks.map(b => `"${b.id}"`).join('、');
        showConfirmModal(`以下方块存在关键帧动画：${names}<br><small style="color:#94a3b8;">删除后将同时移除这些方块的所有关键帧数据，确认删除？</small>`, (ok) => {
            if (ok) _deleteSelectionNow();
        });
        return;
    }
    // 【2026-09-19】无动画方块直接删除，不弹确认（用户要求）。
    //   只有「存在关键帧动画」的方块才需要确认（上面已处理），
    //   无动画方块误触删除可由 Ctrl+Z 撤销，加确认框反而拖慢批量编辑。
    _deleteSelectionNow();
}

// 定义全屏切换函数（优先使用原生接口）
function toggleFullscreen() {
    if (window.Android && typeof window.Android.requestFullscreen === 'function') {
        // 通过原生接口切换全屏
        if (document.fullscreenElement || window._isFullscreen) {
            if (window._isFullscreen) {
                // 应用主动退出全屏：标记，fullscreenchange 中据此不连带退出项目
                window.__exaFsExitByApp = true;
                if (typeof window.Android.exitFullscreen === 'function') {
                    window.Android.exitFullscreen();
                }
                window._isFullscreen = false;
            } else {
                window.Android.requestFullscreen();
                window._isFullscreen = true;
            }
        } else {
            window.Android.requestFullscreen();
            window._isFullscreen = true;
        }
        // 手动切换退出全屏按钮的显示
        const exitBtn = document.getElementById('exitFullscreenBtn');
        const fullBtn = document.getElementById('fullscreenBtn');
        if (window._isFullscreen) {
            if (exitBtn) exitBtn.style.display = 'inline-flex';
            if (fullBtn) fullBtn.style.display = 'none';
        } else {
            if (exitBtn) exitBtn.style.display = 'none';
            if (fullBtn) fullBtn.style.display = '';
        }
        return;
    }

    // 否则使用标准全屏 API
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        // 应用主动退出全屏：打标记，fullscreenchange 中据此不连带退出项目
        window.__exaFsExitByApp = true;
        document.exitFullscreen().catch(() => {});
    }
}

// 全屏状态变化时自动显示/隐藏面板
document.addEventListener('fullscreenchange', () => {
    const p = document.getElementById('dataPanel');
    const newTopBar = document.getElementById('newTopBar');
    const sideList = document.getElementById('sideBlockList');
    const isFs = !!(document.fullscreenElement || window._isFullscreen);
    if (isFs) {
        // 新布局模式：全屏时隐藏顶栏，但保留方块列表（不遮挡编辑）
        if (isNewLayoutMode) {
            if (newTopBar) newTopBar.style.display = 'none';
        }
        // 旧操作模式：全屏时不隐藏数据面板，保留编辑能力
    } else {
        // 退出全屏恢复顶栏（方块列表状态保持用户原有选择，不强制改动）
        if (isNewLayoutMode) {
            if (newTopBar) newTopBar.style.display = 'flex';
        }
        // 关键修复：原生全屏下按 ESC，浏览器会先退全屏、且吞掉 keydown，
        // 页面收不到 ESC，只能收到 fullscreenchange。故在此同步保存并退出项目，
        // 与「退全屏」落在同一次重排，消除「退了全屏却还停在项目里」的中间态。
        // 仅当不是「应用主动退全屏」（__exaFsExitByApp）时才连带退出项目——
        // 主动退全屏（按钮 / 开关）应保持「仅退全屏、留在项目内」的原行为。
        if (!window.__exaFsExitByApp && document.body.classList.contains('in-simulator') && currentProjectId) {
            try {
                if (typeof showToast === 'function') showToast('已自动保存并退出项目', { duration: 2200 });
                // 不 await：backToProjectList 内 await 之前的 DOM 切换是同步的，项目列表立即出现，保存在后台完成
                Promise.resolve(backToProjectList()).catch(() => {});
            } catch (_) {}
        }
    }
    // 重置「应用主动退全屏」标记，避免影响下一次用户按 ESC 的真实路径
    window.__exaFsExitByApp = false;
});

// ========== 批量修改 ==========
function applyBatchDelta(varName, delta, fromGizmoDrag = false) {
    if (delta === 0) return;
    /* ★2026-10-31：FMBE 原版不支持非正的 scale / extend_scale（≤0 一律不渲染）。
       Gizmo 拖拽（缩放角点 / 肢体拉伸）都经 changeVar → 这里（fromGizmoDrag=true）：
       若本次增量会把某个方块的值压到 0 或负数，就只作废该方块的这一帧增量
       （不弹提示、不回退已生效的正向拖动），值停在最后一个合法值。
       批量修改面板（setBatchDelta，不带 fromGizmoDrag）不走此拦截，保持原有增量语义。 */
    const _isSizeVar = fromGizmoDrag && (varName === 'v.scale' || varName === 'v.extend_scale');
    for (let b of selectedBlocksSet) {
        // 枢轴(位移)拖拽中的【真 molang】骨骼子块已在 changeVar 顶部统一换算进 xbasepos_bone，跳过避免重复写入。
        // 静态文件夹骨骼子块是纯分组，未走那条分支，必须在此照常写 v.xpos。
        if (_skipBoneInBatch && isBoneMolangDriven(b)) continue;
        let def = b.scope.vars.get(varName);
        if (!def) {
            const rg = getDefaultRange(varName);
            b.scope.addVar(varName, "0", rg.min, rg.max, 1);
            def = b.scope.vars.get(varName);
        }
        if (def) {
            // 禁止 Gizmo 覆盖 molang 表达式（未开启 molang 全权控制时）：跳过并提示（标注方块）
            if (gizmoMolangGuard(b, varName)) continue;
            // ★★ 关键帧方块（含骨骼/✛显式绑定子块 —— 第 15 轮）：Gizmo 增量必须落到 keyframeData
            //    （否则 refresh 时被 scope.program 覆盖 = 拖不动）。旧条件带 `kfCanUseCompiled`
            //    把骨骼类排除在外，正是「骨绑子块 Gizmo 恒显示未改动」的根因之一。
            if (hasKeyframeAnimation(b.id)) {
                /* ★【2026-10-16 r11】基准值必须读**该方块真实帧键**上的值：旧实现直接用未解析的
                   keyframeCurrentTime 去 kfValueAt，若播放头停在非量化/非帧时刻就取到别的值
                   ⇒ 增量算错（用户"编辑不了/未改动"）。与写入口 kfGizmoWriteVar 同口径。 */
                const _bt = kfEditFrameTime(b.id, keyframeCurrentTime);   // ★ r18·3：基准值也按「吸附后的帧」取，保证增量与写入同口径
                const curKf = kfValueAt(b, _bt !== null ? _bt : kfResolveFrameTime(b.id, keyframeCurrentTime), String(varName).replace(/^v\./, ''));
                const base = Number.isFinite(Number(curKf)) ? Number(curKf) : (Number(def.value) || 0);
                // 非正的 scale / extend_scale：本帧增量作废（数值停在最后合法值）
                if (_isSizeVar && !(base + delta > 0)) continue;
                /* ★【2026-10-16】无论受理与否都 `continue`：这些方块的写入口**只有**
                   keyframeData（编译产物每帧覆盖 scope.vars）。若写入被拒（派生量 /
                   播放中只读）却回落到下面的 scope.vars 分支，就会静默改掉程序基线，
                   正是用户投诉的"改了没效果 / 数据被覆写"。 */
                kfGizmoWriteVar(b, varName, base + delta);
                b.mesh.updateMatrixWorld(true);
                continue;
            }
            // 被 molang 接管的方块：用当前值 + 增量后写回程序
            if (b.scope.molangMode) {
                const _nvMolang = (Number(def.value) || 0) + delta;
                if (_isSizeVar && !(_nvMolang > 0)) continue;
                setConstVarValue(b, varName, _nvMolang);
                b.mesh.updateMatrixWorld(true);
                syncKeyframeFromBlock(b);
                continue;
            }
            const isConst = isConstantExpr(def.expr);
            let newExpr;

            if (isConst) {
                let nv = parseFloat(def.expr) + delta;
                const dec = (def.step.toString().includes('.') ? def.step.toString().split('.')[1].length : 0);
                nv = parseFloat(nv.toFixed(dragWriteDecimals(dec)));   // 拖拽期间保留更高精度（避免逐帧取整漂移）
                // 非正的 scale / extend_scale：本帧增量作废（数值停在最后合法值）
                if (_isSizeVar && !(nv > 0)) continue;
                newExpr = nv.toString();
                def.value = nv;
            } else {
                const deltaStr = delta >= 0 ? ` + ${delta}` : ` - ${-delta}`;
                newExpr = `(${def.expr})${deltaStr}`;
                const _nvExpr = evaluateExpression(newExpr, b.scope.vars, globalVars, b.scope.blockId);
                // 非正的 scale / extend_scale：本帧增量作废（表达式也不写坏）
                if (_isSizeVar && !(_nvExpr > 0)) continue;
                def.value = _nvExpr;
            }
            
            def.expr = newExpr;
            b.refresh();
            b.mesh.updateMatrixWorld(true);
            syncKeyframeFromBlock(b);
        }
    }
    recordAction();
}
function setBatchDelta(varName, newDelta) { const old = batchDeltas.get(varName)||0; applyBatchDelta(varName, newDelta-old); batchDeltas.set(varName, newDelta); }
function resetBatchDelta(varName) { const old = batchDeltas.get(varName)||0; applyBatchDelta(varName, -old); batchDeltas.set(varName, 0); }
function resetAllBatchDeltas() { for (let v of batchDeltas.keys()) resetBatchDelta(v); renderVariablesForBlock(selectedBlock); }

function syncStepToBlocks(varName, step) {
    for (let b of selectedBlocksSet) {
        const def = b.scope.vars.get(varName); if (!def) continue;
        if (def.step !== step) { stopAutoInc(false, varName, 0, null); }
        def.step = step; let cur = def.value; let rounded = Math.round(cur/step)*step;
        if (Math.abs(rounded-cur) > 1e-8) { def.expr = rounded.toString(); def.value = rounded; b.refresh(); }
    }
    recordAction();
}

function isVarBatchEditable(block, varName) {
    // 批量编辑仅处理「常量简单表达式」：
    //   · 普通变量块：def.expr 是纯数字字面量
    //   · molang 接管块：program 里该变量有且仅有一个顶层赋值，且右值是单个数字字面量（可带一元负号）
    //   · 变量不存在：视为可编辑（会自动以默认值创建）
    const def = block.scope.vars.get(varName);
    if (!block.scope.molangMode) {
        // 普通变量块：缺失视为可编辑（会自动以默认值创建），存在则要求纯常量字面量
        return def ? isConstantExpr(def.expr) : true;
    }
    // molang 接管块：program 才是真值来源 —— 必须在 program 里恰好出现一次「自赋值 + 简单常量右值」
    const text = block.scope.program || '';
    if (!text) return false;
    let tokens;
    try { tokens = tokenizeMolang(text); } catch (e) { return false; }
    // ★ 词法器把成员访问切成 3 个记号：id(v) op(.) id(xpos)。必须按此匹配，
    //   否则永远匹配不到 ⇒ 所有 molang 变量都会被误判为「复杂」而剔除。
    const parts = varName.split('.');
    const memberAt = (i) => {
        if (parts.length !== 2) return -1;
        if (!(tokens[i] && tokens[i].t === 'id' && tokens[i].v === parts[0])) return -1;
        if (!(tokens[i + 1] && tokens[i + 1].v === '.')) return -1;
        if (!(tokens[i + 2] && tokens[i + 2].t === 'id' && tokens[i + 2].v === parts[1])) return -1;
        return i + 3;
    };
    let depth = 0, assignCount = 0;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.v === '(') depth++;
        else if (t.v === ')') depth--;
        else if (depth === 0) {
            const after = memberAt(i);
            if (after > 0 && tokens[after] && tokens[after].v === '=' && tokens[after + 1] && tokens[after + 1].v !== '=') {
                assignCount++;
                if (assignCount > 1) return false;
                let j = after + 1, rhsDepth = 0;
                const rhs = [];
                while (j < tokens.length) {
                    const rt = tokens[j];
                    if (rt.v === '(') rhsDepth++;
                    else if (rt.v === ')') rhsDepth--;
                    else if (rhsDepth === 0 && rt.v === ';') break;
                    rhs.push(rt);
                    j++;
                }
                const ok = (rhs.length === 1 && rhs[0].t === 'num') ||
                           (rhs.length === 2 && rhs[0].v === '-' && rhs[1].t === 'num');
                if (!ok) return false;
                i = j;
            }
        }
    }
    return assignCount === 1;
}

function renderBatchPanel() {
    // 检测是否所有选中的方块都是动画方块（旧版操作模式）
    const allSelectedAnim = !isNewLayoutMode && selectedBlocksSet.size > 0 &&
        Array.from(selectedBlocksSet).every(b => hasKeyframeAnimation(b.id));

    let groups = {
        '位移': ['v.xpos','v.ypos','v.zpos','v.xbasepos','v.ybasepos','v.zbasepos'],
        '缩放': ['v.scale','v.extend_scale','v.extend_xrot','v.extend_yrot'],
        '旋转': ['v.xrot','v.yrot','v.zrot','v.rotatex','v.rotatey','v.rotatez']
    };

    // 动画方块多选时，只显示 pos（不含 basepos）、rotate/rot、scale（不含 extend）、自定义变量
    if (allSelectedAnim) {
        groups = {
            '位移': ['v.xpos','v.ypos','v.zpos'],
            '缩放': ['v.scale'],
            '旋转': ['v.xrot','v.yrot','v.zrot','v.rotatex','v.rotatey','v.rotatez']
        };
    }

    // 核心变量集合（与 groups 中的完全一致）
    const coreSet = new Set([
        'v.xpos','v.ypos','v.zpos','v.xbasepos','v.ybasepos','v.zbasepos',
        'v.scale','v.extend_scale','v.extend_xrot','v.extend_yrot',
        'v.xrot','v.yrot','v.zrot','v.rotatex','v.rotatey','v.rotatez'
    ]);

    const blocksArray = Array.from(selectedBlocksSet);
    // 过滤：只保留在所有选中方块里都是「常量简单表达式」的变量
    function filterEditable(vars, requireCommon = false) {
        return vars.filter(vn => {
            if (requireCommon && !blocksArray.every(b => b.scope.vars.has(vn))) return false;
            return blocksArray.every(b => isVarBatchEditable(b, vn));
        });
    }

    // 计算所有方块共有的自定义变量（v.开头且非核心），且都是常量简单表达式
    let commonCustom = null;
    for (let b of blocksArray) {
        const vars = new Set();
        for (let [name] of b.scope.vars) {
            if (name.startsWith('v.') && !coreSet.has(name)) vars.add(name);
        }
        commonCustom = commonCustom === null ? vars : new Set([...commonCustom].filter(v => vars.has(v)));
    }
    const customVars = commonCustom ? filterEditable(Array.from(commonCustom), true) : [];

    // 生成单个变量行 HTML —— ★直接复用 molang 只读数值区的 .mv-row / .mv-name / .mv-val
    //   （用户要求「几乎完全改成 molang 编辑模式的形式」：紧凑等宽行、名字左、数值紧跟名字）
    const rowHtml = (vn) => {
        const delta = batchDeltas.get(vn) || 0;
        const showDelta = Math.abs(delta) > 1e-8;
        // 当前值：所有选中方块一致才显示数值，不一致显示「≠」（多选语境下这才是诚实的）
        let first = null, same = true;
        for (const b of blocksArray) {
            const def = b.scope.vars.get(vn);
            const val = def ? esGuardVarValue(vn, def.value) : 0;
            if (first === null) first = val;
            else if (Math.abs(val - first) > 1e-9) { same = false; break; }
        }
        const shown = first === null ? '—' : (same ? fmtNumRaw(first) : '≠');
        return `<div class="mv-row batch-mv-row${showDelta ? ' changed' : ''}" data-batch-var="${vn}" title="点击调整增量">
            <span class="mv-name">${escapeHtml(vn)}</span>
            <span class="mv-val">${shown}</span>
            <span class="batch-mv-delta">${showDelta ? ((delta > 0 ? '+' : '') + fmtLit(delta)) : ''}</span>
        </div>`;
    };

    // 生成分组 HTML —— ★复用 molang 只读数值区的外壳（.molang-vals / -head / -grid），
    //   折叠走 .folded 类（与 molangValsOpen 同一套机制），不再是 .group-header 大色块
    const groupHtml = (title, vars, gid) => {
        if (!vars.length) return '';
        const folded = batchClosedGroups.has(gid);
        // ★折叠态：外壳同时带 .sec-folded（0fr 行高）+ 网格带 .folded（display:none）——
        //   重渲染时两件一起给，恢复出来就是「已折叠」且不播动画。
        return `<div class="molang-vals batch-sec${folded ? ' sec-folded' : ''}" data-batch-group="${gid}">
            <div class="molang-vals-head" data-batch-toggle-group="${gid}" title="点击折叠/展开"><span class="group-toggle">${folded ? '▶' : '▼'}</span>${title}<span class="batch-sec-count">${vars.length}</span></div>
            <div class="molang-vals-grid${folded ? ' folded' : ''}" data-batch-group-content="${gid}">${vars.map(rowHtml).join('')}</div>
        </div>`;
    };

    // 已接管 molang 的方块数：只用于「⇦ 转普通方块」图标键的可用态（计数条已按用户要求移除）
    const selMolangN = Array.from(selectedBlocksSet).filter(mbrIsMolangBlock).length;

    let h = `<div class="batch-panel">
        <div class="batch-title"><span>批量修改 (${selectedBlocksSet.size})</span>
        <div class="batch-title-actions">
          <button type="button" class="batch-molang-btn batch-icon-btn" id="batchConvertNormalBtn"${selMolangN === 0 ? ' disabled' : ''} title="把选中的 molang 接管方块转回普通方块（仅「纯变量赋值」的区块可无损转换；含条件分支 / q. 查询 / 循环赋值的会跳过并保留）">⇦</button>
          <button type="button" class="batch-molang-btn batch-icon-btn" id="batchMolangReplaceBtn" title="表达式查找替换">⇄</button>
          <button class="batch-reset-all" id="batchResetAllBtn">重置全部</button>
        </div></div>
        <div class="batch-groups">`;

    for (let [gn, vars] of Object.entries(groups)) {
        const editable = filterEditable(vars);
        h += groupHtml(gn, editable, gn);
    }
    if (customVars.length) h += groupHtml('自定义变量', customVars, 'custom');

    h += `</div></div>`;
    return h;
}
function attachBatchEvents() {
    // 分组折叠/展开（复用 molang 只读数值区的 .folded 机制，折叠态跨重渲染保持）
    document.querySelectorAll('[data-batch-toggle-group]').forEach(h => {
        h.removeEventListener('click', toggleBatchGroup);
        h.addEventListener('click', toggleBatchGroup);
    });
    function toggleBatchGroup() {
        const gid = this.dataset.batchToggleGroup;
        const grid = document.querySelector(`[data-batch-group-content="${gid}"]`);
        if (!grid) return;
        const wrap = grid.closest('.molang-vals');
        const willFold = !isValsGridCollapsed(grid);   // 当前是展开的 ⇒ 本次要折叠
        if (willFold) batchClosedGroups.add(gid); else batchClosedGroups.delete(gid);
        const tg = this.querySelector('.group-toggle');
        if (tg) tg.textContent = willFold ? '▶' : '▼';
        // ★动画接管 .folded 的挂/摘时机（见 animateValsFold），这里不再直接 toggle
        animateValsFold(wrap, grid, willFold);
        // 展开后（宽度恢复）重新测量数值竖线；收拢中的网格由 isValsGridCollapsed 跳过
        if (!willFold) fitBatchValsGrids();
    }

    // 变量步长：优先取方块内变量自身的 step，否则默认区间 step
    const getVarStep = (vn) => {
        for (const b of selectedBlocksSet) {
            const def = b.scope.vars.get(vn);
            if (def && def.step > 0) return def.step;
        }
        return getDefaultRange(vn).step || 1;
    };

    // 点击变量行 → 弹出 molang 风格增量微调泡泡（只改「增量」，不改赋值）
    document.querySelectorAll('.batch-mv-row[data-batch-var]').forEach(h => {
        h.removeEventListener('click', onBatchVarClick);
        h.addEventListener('click', onBatchVarClick);
    });
    function onBatchVarClick() {
        const vn = this.dataset.batchVar;
        if (!vn) return;
        const deltaEl = this.querySelector('.batch-mv-delta');
        const setDelta = (nv) => {
            nv = Math.round(nv * 1e6) / 1e6;   // 去掉浮点噪声
            setBatchDelta(vn, nv);
            const on = Math.abs(nv) > 1e-8;
            if (deltaEl) deltaEl.textContent = on ? ((nv > 0 ? '+' : '') + fmtLit(nv)) : '';
            this.classList.toggle('changed', on);
        };
        showBatchValueBubble(vn, this, batchDeltas.get(vn) || 0, getVarStep(vn), setDelta);
    }

    document.getElementById('batchResetAllBtn')?.addEventListener('click', resetAllBatchDeltas);
    // molang 批量改写入口（多选流程）
    document.getElementById('batchMolangReplaceBtn')?.addEventListener('click', () => openMolangBatchReplace());
    // 批量：把选中的 molang 接管方块转回普通方块（可无损转换的转，含动态语义的跳过并报告）
    document.getElementById('batchConvertNormalBtn')?.addEventListener('click', () => convertMolangBlocksToNormal(selectedBlocksSet));
    // 名字列宽对齐（挂载后 + 下一帧各来一次：面板刚展开时宽度可能还是 0）
    fitBatchValsGrids();
    requestAnimationFrame(fitBatchValsGrids);
    if (!attachBatchEvents.__roBound && typeof ResizeObserver !== 'undefined') {
        attachBatchEvents.__roBound = true;
        window.__batchFitRO = new ResizeObserver(() => fitBatchValsGrids());
        document.querySelectorAll('.batch-groups .molang-vals-grid').forEach(g => window.__batchFitRO.observe(g));
    }
}

function getDefaultValueForVar(vn) {
    if (vn === 'v.extend_xrot') return -90;
    if (vn === 'v.scale' || vn === 'v.extend_scale') return 1;
    return 0;
}
function resetVariable(varName, block) {
    const defVal = getDefaultValueForVar(varName);
    if (varName.startsWith('t.')) {
        const key = varName.slice(2), g = globalVars.get(key);
        if (g && isConstantExpr(g.def.expr)) { stopAutoInc(true, key, 0, null); g.def.expr = defVal.toString(); g.def.value = defVal; blocks.forEach(b=>b.refresh()); recordAction(); renderVariablesForBlock(selectedBlock); }
        return;
    }
    const target = block || selectedBlock; if (!target) return;
    const def = target.scope.vars.get(varName);
    if (def && isConstantExpr(def.expr)) { stopAutoInc(false, varName, 0, null); def.expr = defVal.toString(); def.value = defVal; target.refresh(); recordAction(); updateGlobalVarsDependingOn(target, varName); renderVariablesForBlock(target); }
}

// ========== 分组辅助函数 ==========
function groupByPrefix(vars, prefixType) {
    const groups = new Map(), standalone = [];
    for (let item of vars) {
        const key = item.name.slice(2);
        const idx = key.indexOf('_');
        if (idx > 0) {
            const p = key.substring(0, idx);
            if (!groups.has(p)) groups.set(p, []);
            groups.get(p).push(item);
        } else standalone.push(item);
    }
    const finalGroups = [];
    for (let [p, arr] of groups) if (arr.length >= 3) finalGroups.push({prefix: p, vars: arr}); else standalone.push(...arr);
    return {groups: finalGroups, standalone};
}

function renderVarCard(v, blockId) {
    const isConst = isConstantExpr(v.expr), cls = isConst?'constant':'non-constant', inpCls = isConst?'constant-input':'non-constant-input', exp = expandedVars.has(v.name);
    // ★ 显示兜底：面板展示的一律是守卫后的表达式，确保用户永远看不到 extend_scale = 0
    //   （写入侧已收口，这里是防「绕过原语的旧数据」直接进到 UI 的最后一道网）
    const shownExpr = esGuardVarExpr(v.name, v.expr);
    return `<div class="var-card ${cls}" data-var="${v.name}" data-block-id="${blockId}">
        <div class="var-header" data-toggle="${v.name}"><input class="assignment-input ${inpCls}" data-var="${v.name}" value="${escapeHtml(`${v.name} = ${shownExpr}`)}"><span class="var-expand">${exp?'▲':'▼'}</span></div>
        <div class="var-details" data-details="${v.name}" style="${exp?'display:block':'display:none'}">` + renderVarDetails(v.name, v, null) + `</div></div>`;
}

function renderVarDetails(name, def, sourceId) {
    const isConst = isConstantExpr(def.expr);
    let html = isConst ? `<div class="auto-inc-btns"><button class="inc-btn inc-up" data-var="${name}" data-dir="up">▲自增</button><button class="inc-btn inc-down" data-var="${name}" data-dir="down">▼自减</button><button class="inc-btn reset-btn" data-reset-var="${name}">⟳重置</button></div>
    <div class="slider-container"><input type="range" class="var-slider" data-var="${name}" min="${def.rangeMin}" max="${def.rangeMax}" step="${def.step}" value="${def.value}"></div>
    <div class="range-row"><div class="range-item">Min<input class="range-min" data-var="${name}" value="${def.rangeMin}"></div><div class="range-item">Max<input class="range-max" data-var="${name}" value="${def.rangeMax}"></div><div class="range-item">步长<input class="range-step" data-var="${name}" value="${def.step}"></div></div>` : '';
    html += `<button class="delete-var" data-var="${name}">删除</button>`;
    if (sourceId !== undefined) html += `<div style="font-size:10px;color:#64748b;">📌 ${sourceId||'无'}</div>`;
    return html;
}

