/* 08-keyframe/04-confirm-dialog-and-data-panel.js · 源 测试版v.6b79.html 第 42887-43260 行 */
'use strict';
// ==================== 自定义确认弹窗 ====================
function showConfirmModal(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:900;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    const isLight = document.body.classList.contains('light-mode');
    box.style.cssText = 'background:' + (isLight ? '#fff' : '#162136') + ';border:1px solid ' + (isLight ? '#cbd5e1' : '#3b82f6') + ';border-radius:16px;padding:20px 24px;max-width:400px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,0.4);';
    box.innerHTML = `<div style="margin-bottom:16px;font-size:14px;color:${isLight ? '#1e293b' : '#e2e8f0'};">${message}</div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="keyframe-window-btn" id="confirmYes" style="background:rgba(244,63,94,0.15);border-color:#f43f5e;color:${isLight ? '#dc2626' : '#fca5a5'};">确定</button>
            <button class="keyframe-window-btn" id="confirmNo">取消</button>
        </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.querySelector('#confirmYes').onclick = () => { overlay.remove(); onConfirm(true); };
    overlay.querySelector('#confirmNo').onclick = () => { overlay.remove(); onConfirm(false); };
    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); onConfirm(false); } };
}

// ==================== 关键帧数据面板 ====================
function renderKeyframeDataPanel() {
    const panel = document.getElementById('kfDataPanel');
    if (!panel) return;
    
    if (!selectedKeyframeBlock || !keyframeData.has(selectedKeyframeBlock)) {
        if (kfGroupEdit && selectedFolder) {
            panel.innerHTML = '<div class="keyframe-empty-state">暂无关键帧，点击 +关键帧 录制</div>';
        } else {
            panel.innerHTML = '<div class="keyframe-empty-state">选择或添加一个方块开始编辑关键帧</div>';
        }
        return;
    }
    
    // 骨骼子块（纯显式绑定 _boneParent）可独立编辑局部关键帧：xrot/yrot/zrot、xbasepos_bone 三变量、scale 等。
    // 但【不】编辑跟随父骨骼的 xpos/ypos/zpos 与 rotatex/rotatey/rotatez（它们由 molang 直接赋值，保持父驱动）。
    // 属于文件夹骨骼系统的子块仍由骨骼树统一播放，这里显示提示而非编辑（避免与骨骼关键帧冲突）。
    const selBlockObj = blocks.find(b => b.id === selectedKeyframeBlock);
    const _isExplicitBoneChild = selBlockObj && selBlockObj._boneParent && !(selBlockObj.group && boneKeyframes.has(selBlockObj.group));
    const _isFolderBoneChild = selBlockObj && selBlockObj._boneParent && !!(selBlockObj.group && boneKeyframes.has(selBlockObj.group));
    if (_isFolderBoneChild) {
        const parentName = selBlockObj._boneParent;
        const isLight2 = document.body.classList.contains('light-mode');
        panel.innerHTML = `<div style="font-size:12px;padding:12px;color:${isLight2 ? '#475569' : '#94a3b8'};">
            <div style="font-weight:600;margin-bottom:6px;">⚠️ 骨骼子块（文件夹骨骼系统）</div>
            <div style="line-height:1.6;">此方块「${escapeHtml(selectedKeyframeBlock)}」属于文件夹骨骼系统，关键帧由父骨骼驱动，请通过父骨骼编辑。</div>
        </div>`;
        return;
    }

    const data = keyframeData.get(selectedKeyframeBlock);
    const times = getKeyframeTimes(selectedKeyframeBlock);
    
    if (times.length === 0) {
        panel.innerHTML = `<div class="keyframe-empty-state">暂无关键帧，导入数据或点击时间轴添加</div>`;
        return;
    }
    
    // 找到最近的关键帧
    let closestTime = times[0];
    for (const t of times) {
        if (Math.abs(t - keyframeCurrentTime) < Math.abs(closestTime - keyframeCurrentTime)) {
            closestTime = t;
        }
    }
    
    const frameData = data.frames.get(closestTime);
    if (!frameData) {
        panel.innerHTML = '<div class="keyframe-empty-state">无数据</div>';
        return;
    }

    const varNames = ['xpos','ypos','zpos','xrot','yrot','zrot','rotatex','rotatey','rotatez','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos'];
    // 显式绑定子骨骼：面板只暴露局部可编辑变量，隐藏跟随父骨骼的 xpos/ypos/zpos 与 rotatex/rotatey/rotatez。
    if (_isExplicitBoneChild) {
        varNames.length = 0;
        ['xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos_bone','ybasepos_bone','zbasepos_bone'].forEach(n => varNames.push(n));
    }

    const isLight2 = document.body.classList.contains('light-mode');
    // ★【2026-10-13】旧操作模式只读：数值只显示不可改，也不提供删除
    const ro = kfLegacyReadOnly();
    const displayTime = closestTime.toFixed(2);
    const curUnit = getKeyframeFolderUnits().find(u => u.blocks.some(b => b.id === selectedKeyframeBlock));
    const isGroup = kfGroupEdit && curUnit && curUnit.id;
    const titleName = isGroup ? `组「${escapeHtml(curUnit.label)}」` : `方块「${selectedKeyframeBlock}」`;
    let html = `<div class="kf-data-head">
        <span class="kf-data-time">${displayTime}s</span>
        <span class="kf-data-target">${titleName}</span>
        ${ro ? '<span class="kf-readonly-hint">只读回放</span>'
            : `<span class="kf-data-del" id="kfDeleteCurrentBtn" title="删除当前关键帧">删除</span>`}
    </div>`;

    for (const name of varNames) {
        const val = frameData.has(name) ? frameData.get(name) : '';
        /* ★★【2026-10-14】派生量（被表达式赋值，如旗帜预设的 scale/zrot/extend_yrot）
           按用户规格**不进帧**，因此这里会取到空串 → 旧写法渲染成一个空输入框，
           看起来像"数据丢了/面板坏了"（用户截图即此景）。改为：显示**实时算出的值**并置灰只读，
           并在标签上标「派生」，让用户一眼看出"它由表达式算，不用也不该手动打帧"。 */
        const dd = selBlockObj && selBlockObj.scope ? selBlockObj.scope.vars.get('v.' + name) : null;
        const isDerived = !!(dd && !isConstantExpr(String(dd.expr == null ? '' : dd.expr)));
        if (val === '' && isDerived) {
            const shown = Number.isFinite(dd.value) ? dd.value : 0;
            html += `<div class="keyframe-data-row" title="派生量：由表达式算出，留在指令末尾计算，不打关键帧">
                <span class="keyframe-data-label">${name} <em style="font-style:normal;opacity:.6;font-size:10px;">派生</em></span>
                <input type="number" step="0.01" value="${parseFloat(Number(shown).toFixed(4))}" data-kf-var="${name}" data-kf-time="${closestTime}" readonly disabled>
            </div>`;
            continue;
        }
        html += `<div class="keyframe-data-row">
            <span class="keyframe-data-label">${name}</span>
            <input type="number" step="0.01" value="${val}" data-kf-var="${name}" data-kf-time="${closestTime}"${ro ? ' readonly disabled' : ''}>
        </div>`;
    }

    // 自定义变量
    for (const [key, val] of frameData) {
        if (!varNames.includes(key)) {
            html += `<div class="keyframe-data-row">
                <span class="keyframe-data-label">${key}</span>
                <input type="number" step="0.01" value="${val}" data-kf-var="${key}" data-kf-time="${closestTime}"${ro ? ' readonly disabled' : ''}>
            </div>`;
        }
    }

    panel.innerHTML = html;

    if (ro) return;   // 只读模式：不绑定任何修改事件

    // 删除当前关键帧按钮
    const delBtn = panel.querySelector('#kfDeleteCurrentBtn');
    if (delBtn) {
        delBtn.addEventListener('click', () => {
            const confirmMsg = isGroup
                ? `删除组「${escapeHtml(curUnit.label)}」在 ${displayTime}s 的所有关键帧？`
                : `删除 ${selectedKeyframeBlock} 在 ${displayTime}s 的关键帧？`;
            showConfirmModal(confirmMsg, (ok) => {
                if (ok) {
                    if (isGroup) removeKeyframeUnitAtTime(curUnit, closestTime);
                    else removeKeyframeAtTime(selectedKeyframeBlock, closestTime);
                }
            });
        });
    }

    // 绑定输入事件
    panel.querySelectorAll('input[data-kf-var]').forEach(inp => {
        inp.addEventListener('change', () => {
            const vn = inp.dataset.kfVar;
            const time = parseFloat(inp.dataset.kfTime);
            const val = parseFloat(inp.value) || 0;
            /* ★★【2026-10-14 P0 修复 · 浮动窗数值框改值不生效】
               旧实现直接 `d.frames.get(time).set(vn, val)` 然后调 kfAfterExternalDataChange ——
               后者只重编译、**不把该变量纳入驱动集**，于是：
                 · 该变量当时不在 d.vars（未参与动画的常量）→ 编译产物照旧用旧种子值覆盖 ⇒ 改了没反应
                 · 派生量被写进帧 → 又把表达式冻成常量
               正解：走 **kfSetValueAtFrame**（侧栏时间表用的同一条 API）——
                 它会 ensure 帧、写值、清该时刻表达式覆盖、并 kfEnsureProgram(force) 重编译；
                 先 kfRealizeTargetVar 把变量正式纳入关键帧体系（侧栏路径也是这么做的）。
               派生量（被表达式赋值）**拒绝写入**并提示，避免把依赖链冻死（用户在浮动窗看到的
               派生量输入框本就是只读灰显，这里是双保险）。 */
            const blk = blocks.find(b => b.id === selectedKeyframeBlock);
            if (!blk) return;
            const dd2 = blk.scope && blk.scope.vars.get('v.' + vn);
            const isDerived2 = !!(dd2 && !isConstantExpr(String(dd2.expr == null ? '' : dd2.expr)));
            if (isDerived2) {
                if (typeof showToast === 'function') showToast(`v.${vn} 由表达式赋值（派生量），不能直接打帧；改它的输入参数即可`);
                renderKeyframeDataPanel();
                return;
            }
            const d = keyframeData.get(selectedKeyframeBlock);
            if (d && d.frames.has(time)) {
                kfRealizeTargetVar([blk], vn);
                kfSetValueAtFrame([blk], time, vn, val, 'abs', blk);
                applyKeyframeToBlock(selectedKeyframeBlock, time);
                renderKeyframeDataPanel();
                recordAction();
            }
        });
    });
}

// ==================== 播放控制 ====================
function toggleKeyframePlayback() {
    const btn = document.getElementById('kfPlayBtn');
    if (keyframePlaying) {
        stopKeyframePlayback();
    } else {
        startKeyframePlayback();
    }
}

function getPlaybackBlocks() {
    // 播放 = 播放【所有拥有关键帧数据的方块】，不受当前选中的轨道/骨骼限制。
    // 这样“选中子级骨骼”时照样播放上级骨骼（用户要求：“播放就送所有内容都播放，不光选中的轨道”）。
    // 同时配合刚体插值，整组（含所有嵌套子骨骼）会作为刚体一起运动，不再脱节。
    if (keyframeData.size > 0) {
        return Array.from(keyframeData.keys())
            .map(id => blocks.find(b => b.id === id))
            // 数据完整性守卫：frames 必须是含 size>0 的 Map，异常/残缺数据直接跳过，
            // 绝不在这里抛异常（否则 startKeyframePlayback 在建立播放定时器前中断 = “按钮变暂停但时间不动”）。
            .filter(b => b && keyframeData.has(b.id)
                && keyframeData.get(b.id).frames instanceof Map
                // Molang 编辑模式方块（已加入动画列表、0 帧）也要随播放头推进：applyKeyframeToBlock
                // 对它只做 refresh()，正好让手写程序的 q.anim_time 实时生效（蹭时钟）。
                && (keyframeData.get(b.id).frames.size > 0 || isMolangModeBlock(b)))
            // 文件夹骨骼系统的子块由「骨骼树」统一播放（molang 实时跟随父），
            // 绝不在此独立回放：否则残留的逐方块世界姿态关键帧会让子块“自己动自己的”（用户报告根因）。
            // 但【纯显式绑定子块】（_boneParent 且不属于文件夹骨骼系统）其关键帧只写局部变量
            //   （xrot/yrot/zrot、xbasepos_bone、scale 等，跟随变量被 _writeKfVarsToBlock 锁定），
            // 可以独立回放，实现子骨骼自身的局部关键帧动画。
            .filter(b => !(b.group && boneKeyframes.has(b.group)));
    }
    return [];
}

// 播放骨骼子块时，其 v.xpos（molang 表达式）会被写回成常量（扁平世界姿态），导致骨骼实时跟随失效；
// 故播放前备份、停止后还原，保证“预览动画”不会永久破坏实时骨骼。
let boneExprBackup = null;
// 借时钟的 Molang 方块（无关键帧，只随播放头推进 q.anim_time）
let _kfClockOnlyBlocks = [];
// 文件夹骨骼播放：复用已验证的 applyBoneKeyframeAtTime（写局部变量 + 全局 refresh 让 molang 实时算世界坐标）。
// 整条跨文件夹骨骼树（所有含 boneKeyframes 的文件夹）一起播放，父文件夹先于子文件夹施加，
// 保证子骨骼的 t.PARENT_* 全局变量在施加时已是最新父姿态 → 子块刚性跟随父旋转。
let _kfBoneTreeFolders = null;
function _boneFolderDepth(folder, seen) {
    seen = seen || new Set();
    if (!folder || seen.has(folder)) return 0;
    seen.add(folder);
    const blk = collectAllBoneBlocks().filter(b => b.group === folder);
    let depth = 0;
    for (const b of blk) {
        const pid = getBoneParentId(b);
        if (!pid) continue;
        const p = blocks.find(x => x.id === pid);
        if (p && p.group && p.group !== folder) depth = Math.max(depth, 1 + _boneFolderDepth(p.group, seen));
    }
    return depth;
}
function _computeBoneTreeFolders() {
    const folders = [...new Set(collectAllBoneBlocks().map(b => b.group).filter(f => f && boneKeyframes.has(f)))];
    folders.sort((a, b) => _boneFolderDepth(a) - _boneFolderDepth(b));
    return folders;
}
function _applyBoneTreeKeyframe(time, folders) {
    folders.forEach(f => applyBoneKeyframeAtTime(f, time));
}
// 「蹭查询函数」时钟目标：Molang 编辑模式的方块没有关键帧，但仍要随播放头推进 q.anim_time 求值
// （用户明确诉求：只借用关键帧窗口的查询函数，不创建关键帧）。
function kfMolangClockTargets() {
    try {
        return kfKeyframeTargets().filter(b => isMolangModeBlock(b) && /q\./.test(b.scope.program || ''));
    } catch (e) { return []; }
}

function startKeyframePlayback() {
    const initialBlocks = getPlaybackBlocks();
    // 关键帧一个都没有、但当前编辑目标是「借时钟的 Molang 方块」时，播放时钟照样要跑：
    // 只推进 keyframeCurrentTime（驱动手写表达式），不施加任何关键帧数值。
    const clockOnlyBlocks = (initialBlocks.length === 0 && boneKeyframes.size === 0) ? kfMolangClockTargets() : [];
    if (initialBlocks.length === 0 && boneKeyframes.size === 0 && clockOnlyBlocks.length === 0) return;
    _kfClockOnlyBlocks = clockOnlyBlocks;

    // 备份骨骼【子块】的完整休息态变量：molang v.xpos 表达式 + 相对父旋转(xrot/yrot/zrot) + 相对偏移(xbasepos/ybasepos/zbasepos)。
    // 播放时子块的 xpos(世界坐标) 被写回常量、xrot/xbasepos 被清零；停止时还原，保证实时骨骼不被永久破坏。
    boneExprBackup = new Map();
    // 备份【整条骨骼树】的所有方块（根+子，含其它文件夹的子骨骼），无条件覆盖：
    // 骨骼播放（applyBoneKeyframeAtTime）会写常量到所有骨骼块（含根的 xpos/xrot/rotatex），
    // 停止时必须精确还原其 molang 跟随与编辑姿态 —— 若只还原子块、漏掉根，根会残留在最后一帧
    // 姿态上，子块却回到编辑态 → 骨骼错位“瞬移”（用户报告根因）。
    const _boneSet = Array.from(new Set([...collectAllBoneBlocks().map(b => b.id), ...getPlaybackBlocks().map(b => b.id)]));
    _boneSet.forEach(id => {
        const b = blocks.find(x => x.id === id);
        if (!b) return;
        // 完整作用域快照（每个变量的 expr + value），保证还原时 xbasepos_bone 与 molang 表达式都被精确还原。
        const snap = {};
        b.scope.vars.forEach((d, name) => { snap[name] = { expr: d.expr, value: d.value }; });
        boneExprBackup.set(b.id, snap);
    });

    keyframePlaying = true;
    const btn = document.getElementById('kfPlayBtn');
    if (btn) { btn.textContent = '⏸'; btn.classList.add('on'); }

    keyframeCurrentTime = 0;
    // 骨骼树：只要存在骨骼关键帧数据就整树播放（父文件夹先于子文件夹），与当前选中无关；
    // 其余方块仍按各自关键帧播放。二者叠加 = “播放所有内容”（用户要求）。
    // 中间步骤全部 try/catch：任何单块数据异常都只跳过该块，绝不在建立播放定时器前中断
    // （否则按钮已变 ⏸ 但 setInterval 未创建 = 用户看到的“时间不走”）。
    _kfBoneTreeFolders = boneKeyframes.size > 0 ? _computeBoneTreeFolders() : null;
    try {
        if (_kfBoneTreeFolders) _applyBoneTreeKeyframe(0, _kfBoneTreeFolders);
    } catch (e) { console.warn('骨骼关键帧初帧应用跳过:', e.message); }
    try {
        getPlaybackBlocks().forEach(b => applyKeyframeToBlock(b.id, 0));
    } catch (e) { console.warn('逐块关键帧初帧应用跳过:', e.message); }
    updateKeyframePlayhead();
    
    const startTime = performance.now();
    // 借时钟场景可能还没有任何关键帧 → 时长缺省兜底，避免 %0 = NaN 让播放头卡死
    const duration = (Number.isFinite(keyframeAnimDuration) && keyframeAnimDuration > 0 ? keyframeAnimDuration : 5) * 1000;

    keyframePlayTimer = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const t = (elapsed % duration) / 1000;
        // ★【2026-10-16】播放头同样量化到 1ms：播放态里录帧/拖动都必须落在量化键上
        keyframeCurrentTime = kfQuantTime(t);
        updateKeyframePlayhead();
        // 每次刷新播放列表，支持播放中动态添加/移除方块
        let currentBlocks;
        try { currentBlocks = getPlaybackBlocks(); } catch (e) { currentBlocks = []; }
        // 借时钟的 Molang 方块：applyKeyframeToBlock 对 molang 模式只做 refresh（q.anim_time 重新求值）
        if (_kfClockOnlyBlocks.length) currentBlocks = currentBlocks.concat(_kfClockOnlyBlocks);
        // 文件夹骨骼：整条骨骼树通过 applyBoneKeyframeAtTime 播放（molang 实时算世界坐标，绝不存世界常量）。
        // 父文件夹先于子文件夹施加，保证子骨骼的 t.PARENT_* 全局变量在施加时已是最新父姿态。
        if (_kfBoneTreeFolders) {
            try { _applyBoneTreeKeyframe(t, _kfBoneTreeFolders); } catch (e) { console.warn('骨骼播放跳过:', e.message); }
        }
        currentBlocks.forEach(b => {
            try { applyKeyframeToBlock(b.id, t); } catch (e) { console.warn('逐块播放跳过:', e.message); }
        });
        // ★ 播放时同步刷新数据面板（inspector 只在 Gizmo 拖拽里更新过，关键帧播放期间数值不动）
        try { if (typeof updateInspectorValues === 'function') updateInspectorValues(); } catch (e) {}
        // ★【2026-10-22】「数据」视图跟随播放实时刷新当前帧数值
        kfScheduleDataViewLive();
        // 播放时自动滚动
        const vd = getViewDuration();
        if (keyframeCurrentTime >= keyframeScrollOffset + vd * 0.92 && keyframeScrollOffset + vd < keyframeAnimDuration - 0.01) {
            const step = vd * 0.3;
            keyframeScrollOffset += step;
            const maxOff = Math.max(0, keyframeAnimDuration - vd);
            if (keyframeScrollOffset > maxOff) keyframeScrollOffset = maxOff;
            renderKeyframeTimeline();
        }
    }, 1000 / keyframeFps);
}

function stopKeyframePlayback() {
    keyframePlaying = false;
    _kfClockOnlyBlocks = []; // 借时钟的 Molang 方块（无关键帧数据，无需还原）
    _kfPlayPre = null; // 释放骨骼播放缓存，下次播放重新构建
    if (keyframePlayTimer) {
        clearInterval(keyframePlayTimer);
        keyframePlayTimer = null;
    }
    // 还原骨骼子块：用播放前记录的完整作用域快照（expr + value）精确还原每个变量，
    // 包括 molang 表达式（v.xpos / v.rotatex = t.PARENT_rotatex …）与局部偏移(xbasepos_bone)，
    // 恢复实时 molang 跟随，杜绝“播放后退不出骨骼态 / 子块被写死”的残留。
    if (boneExprBackup) {
        boneExprBackup.forEach((snap, id) => {
            const b = blocks.find(x => x.id === id);
            if (!b) return;
            Object.entries(snap).forEach(([name, st]) => {
                if (b.scope.vars.has(name)) {
                    b.scope.setVarExpr(name, st.expr);
                    const d = b.scope.vars.get(name);
                    if (d) d.value = st.value;
                }
            });
            b.refresh();
        });
        // 还原 molang 表达式结构后，把骨骼树定格在【当前播放头时间】的插值姿态
        // （只写 value、不覆盖 expr）——暂停时方块不再闪跳到最后录制帧的数值，
        // 与普通方块行为一致：以当前动画时间代入 molang 缓动计算骨骼变量。
        if (_kfBoneTreeFolders && _kfBoneTreeFolders.length && Number.isFinite(keyframeCurrentTime)) {
            _kfBoneTreeFolders.forEach(f => applyBoneValueOnly(f, keyframeCurrentTime));
            blocks.forEach(b => b.refresh());
        }
        try { if (typeof updateInspectorValues === 'function') updateInspectorValues(); } catch (e) {}
        boneExprBackup = null;
    }
    const btn = document.getElementById('kfPlayBtn');
    if (btn) { btn.textContent = '▶'; btn.classList.remove('on'); }
}

