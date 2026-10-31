/* 08-keyframe/03-timeline.js · 源 测试版v.6b79.html 第 41995-42886 行 */
'use strict';
// ==================== 多轨道时间轴渲染 ====================
function renderKeyframeTimeline() {
    /* 本次同步重绘已覆盖选区状态 ⇒ 取消 scheduleKfTrackTimelineSync 排队的那次重绘 */
    _kfTrackSyncPending = false;
    const container = document.getElementById('kfTimelineContainer');
    const bg = document.getElementById('kfTimelineBg');
    const ruler = document.getElementById('kfRuler');
    if (!container || !bg || !ruler) return;

    ruler.querySelectorAll('.keyframe-timeline-tick, .keyframe-timeline-tick-label').forEach(m => m.remove());
    bg.querySelectorAll('.keyframe-track-row, .keyframe-marker-group, .keyframe-vert-line').forEach(m => m.remove());

    const units = getKeyframeFolderUnits();
    if (units.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    /* 【2026-10-22 优化】20 → 24：轨道名 10.5px 与菱形 10px 需要更舒展的行高，
       并与刻度尺 24px 对齐，轨道区看起来不再挤成一条。 */
    const TRACK_H = 24;
    /* ★【2026-10-22 用户要求】去掉每帧数据表后，轨道只占顶部几行，底部留下大片空白；
       棋盘网格必须铺满整个时间轴区域。轨道多到超出时仍按内容高度滚动。 */
    const _area = document.getElementById('kfTimelineArea');
    const _ctrl = _area ? _area.querySelector('.keyframe-timeline-controls') : null;
    const _rowsH = Math.max(40, units.length * TRACK_H + 4);
    let _fillH = 40;
    if (_area) {
        // 区域上 padding 6 + 控制条 + 刻度尺 24（底部已无内边距/外边距）
        _fillH = _area.clientHeight - 6 - (_ctrl ? _ctrl.offsetHeight : 0) - 24;
    }
    bg.style.height = Math.max(_rowsH, _fillH, 40) + 'px';

    // 左侧轨道名列（与时间轴同高，随容器一起纵向滚动）
    let head = container.querySelector('.kf-track-head');
    if (!head) { head = document.createElement('div'); head.className = 'kf-track-head'; container.appendChild(head); }
    head.innerHTML = '';
    head.style.height = bg.style.height;

    const maxTime = keyframeAnimDuration;
    const viewDur = getViewDuration();
    const maxScroll = Math.max(0, maxTime - viewDur);
    if (keyframeScrollOffset > maxScroll) keyframeScrollOffset = maxScroll;
    if (keyframeScrollOffset < 0) keyframeScrollOffset = 0;
    const viewStart = keyframeScrollOffset;
    const viewEnd = viewStart + viewDur;

    const targetTicks = 12;
    const rawStep = viewDur / targetTicks;
    const niceSteps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60, 120];
    let tickStep = niceSteps[0];
    for (let i = 0; i < niceSteps.length; i++) {
        if (rawStep <= niceSteps[i] * 1.2) { tickStep = niceSteps[i]; break; }
    }
    let firstTick = Math.ceil(viewStart / tickStep) * tickStep;
    const tickDecimals = tickStep % 1 === 0 ? 0 : tickStep.toString().split('.')[1].length;
    for (let t = firstTick; t <= viewEnd + 0.0001; t += tickStep) {
        const pct = timeToPct(t);
        if (pct < 0 || pct > 1) continue;
        const leftPct = pct * 100;
        const tick = document.createElement('div');
        tick.className = 'keyframe-timeline-tick';
        tick.style.left = leftPct + '%';
        ruler.appendChild(tick);
        const label = document.createElement('div');
        label.className = 'keyframe-timeline-tick-label';
        label.style.left = leftPct + '%';
        /* 首尾刻度贴边对齐，避免 0s / 末尾时刻被裁剪（居中变换会溢出色块边界） */
        if (pct < 0.02) label.style.transform = 'none';
        else if (pct > 0.98) label.style.transform = 'translateX(-100%)';
        label.textContent = t.toFixed(tickDecimals) + 's';
        ruler.appendChild(label);
    }

    const zoomLabel = document.getElementById('kfZoomLabel');
    if (zoomLabel) zoomLabel.textContent = parseFloat(keyframeZoom.toFixed(3)) + 'x';
    const scrollLabel = document.getElementById('kfScrollLabel');
    if (scrollLabel) scrollLabel.textContent = viewStart.toFixed(1) + 's - ' + viewEnd.toFixed(1) + 's';

    /* 棋盘网格尺寸跟随刻度：一格 = 一个刻度间隔宽 × 一条轨道高，
       窗口缩放/时间轴缩放后重新写入变量，网格始终与刻度对齐。 */
    const gridW = Math.max(8, (tickStep / viewDur) * (bg.clientWidth || 400));
    bg.style.setProperty('--kf-grid-w', gridW.toFixed(2) + 'px');
    bg.style.setProperty('--kf-row-h', TRACK_H + 'px');

    const isLight = document.body.classList.contains('light-mode');
    // 低饱和轨道色：默认菱形不抢眼，选中帧由 CSS filter 提亮
    const colors = isLight
        ? ['#64748b', '#8a7d4e', '#5b7290', '#77688f', '#5c7a68', '#8d6b52', '#8d6272', '#5a787c']
        : ['#7c8aa0', '#8f8a63', '#6d84a3', '#8478a0', '#6d8f7d', '#9c7f68', '#9c7686', '#6a8b8f'];

    // 轨道可见性规则：只有用户明确“添加进动画”或已有帧的文件夹才显示，禁止预渲染。
    //  - 未分组方块：始终显示。
    //  - 含关键帧的文件夹（times.size>0）：显示（逐块/骨骼关键帧）。
    //  - 用户通过「+全部」主动添加的文件夹（kfAddedFolders.has）：显示，即使还没录帧。
    //  - 仅因“进关键帧模式/组编辑选中/已是骨骼”但并未被用户添加的空文件夹：隐藏。
    //    这是用户投诉的预渲染：截图里 bone/bone1 没点「+全部」就出现在时间轴。
    const visibleUnits = units.filter(unit =>
        !unit.id ||
        unit.times.size > 0 ||
        kfAddedFolders.has(unit.id)
    );
    visibleUnits.forEach((unit, idx) => {
        const color = colors[idx % colors.length];
        const top = idx * TRACK_H;
        /* 【2026-10-19】「选中」判据修正：旧式 `selectedFolder === unit.id` 在**未分组**轨道上会
           变成 `null === null` ⇒ 只要当前没选中任何文件夹，所有未分组轨道都被判成 selected
           ⇒ 整片轨道 active-track、名字全部上色（用户投诉：未选中的方块名字也有颜色）。
           正解：① 该轨道所属文件夹确实被选中（selectedFolder === unit.id，且 unit.id 非空）；
                ② 该轨道里有方块落在当前选区里（单选/多选/组整体选入都覆盖）。 */
        const isSelected = (unit.id != null && selectedFolder === unit.id) ||
            (unit.blocks || []).some(b => selectedBlocksSet.has(b));
        // 空轨道（尚未录任何关键帧）且**非用户主动添加**：标记为 pending，渲染为灰显虚线 + "未添加"标签。
        // 用户通过选择器/批量添加主动加进来的文件夹（kfAddedFolders 中有记录），即使还没录帧，
        // 也视为"已添加"，不显示"未添加"——否则会出现"明明点了添加却仍标未添加"的矛盾。
        // 空轨道且“既非骨骼也未被主动加入”才标为 pending（未添加）。
        // 已指定骨干的骨骼文件夹 / 用户主动加入的文件夹即使还没录帧，也不应显示“未添加”（误导性）。
        const isPending = unit.times.size === 0 && !unit.isBone && !kfAddedFolders.has(unit.id);

        const pickUnit = (e) => {
            e.stopPropagation();
            /* ★【2026-10-19】拖动时间轴 ≠ 点选方块：
               本次手势若总位移超阈值（拖播放头），紧随的 click 只是拖拽副产品 ⇒ 消费标记并直接返回，
               多选集合不会被拖时间轴的手势清空。普通点按一律走单选语义（点自己已选的轨道也能收敛回单选）。 */
            if (kfTrackWasDrag) { kfTrackWasDrag = false; return; }
            if (!unit.repBlock) return;
            /* ★【2026-10-19 补】点轨道行必须与「画布点方块 / 侧栏点方块」同口径认「多选手势」
               （Ctrl/⌘/Shift 或关键帧浮动窗里的「多选锁定」按钮）。旧实现无条件 `keepMulti=false`
               ⇒ 在时间轴上逐条点轨道只会把选区不断重置成单选，多选根本攒不起来 ⇒
               用户看到的就是「多选没法批量用 Gizmo 编辑」，且数据表因多选未成立而不显示黄色「多」。
               多选手势下来走 toggleBlockSelection(选区真相源，含显式点选集合/重绘/Gizmo 刷新)，
               selectKeyframeBlock 只以 keepMulti=true 同步「当前编辑块」，绝不再动选区。 */
            if (kfIsMultiGesture(e)) {
                /* 文件夹轨道行 = 「整个文件夹单位」：多选态下点它应把整组成员一起加/减选
                   （与单点该行时整组展开同口径），否则只加进一个代表块、Gizmo 批量形同单块。 */
                const unitBlocks = (unit.id && unit.blocks && unit.blocks.length) ? unit.blocks : null;
                toggleBlockSelection(unit.repBlock, true, unitBlocks);
                selectKeyframeBlock(unit.repBlock.id, true, false);
                return;
            }
            selectKeyframeBlock(unit.repBlock.id, false, false);
        };

        const row = document.createElement('div');
        row.className = 'keyframe-track-row' + (isSelected ? ' active-track' : '') + (isPending ? ' pending-track' : '');
        row.style.top = top + 'px';
        row.style.height = TRACK_H + 'px';
        row.style.cursor = 'pointer';
        row.style.pointerEvents = 'auto';
        row.title = (isPending ? '（尚未添加关键帧）' : '') + '点击选择 ' + unit.label;
        row.addEventListener('click', pickUnit);

        /* 轨道名不再浮在时间轴上（否则 0.5s 处的关键帧会压住名字），
           改到左侧独立列，横向彻底与刻度分离 —— 与动画/剪辑软件一致。 */
        const label = document.createElement('div');
        label.className = 'kf-track-head-item' + (isSelected ? ' kf-label-sel active' : '');
        // 选中态用高对比中性色 + 600 字重，而不是给名字上彩色 —— 与降饱和的整体调性一致
        label.style.color = isSelected ? (isLight ? '#0f172a' : '#e2e8f0') : undefined;
        if (isSelected) label.style.fontWeight = '600';
        label.style.top = top + 'px';
        label.style.height = TRACK_H + 'px';
        label.title = (isPending ? '（尚未添加关键帧）' : '') + '点击选择 ' + unit.label;
        label.addEventListener('click', pickUnit);

        // 左侧图标：只有真正含关键帧内容的文件夹才渲染文件夹图标；
        // 空/预添加/组编辑选中但尚未录帧的文件夹不渲染图标，避免骨骼文件夹被「预渲染」。
        // 用户手动把骨骼添加进文件夹（录了帧 → isBone 或 times.size>0）之后才显示。
        // 未分组方块仍按类型取内嵌 base64 图标。
        const iconSrc = unit.id
            ? ((unit.isBone || unit.times.size > 0) ? ICON_FOLDER : null)
            : blockTypeIcon((unit.repBlock || (unit.blocks && unit.blocks[0]) || {}).type);
        if (iconSrc) {
            const img = document.createElement('img');
            img.src = iconSrc;
            img.width = 16; img.height = 16;
            img.style.imageRendering = 'pixelated';
            img.style.verticalAlign = 'middle';
            if (isPending) img.style.opacity = '0.45';
            label.appendChild(img);
        }

        const txt = document.createElement('span');
        txt.className = 'kf-track-name';
        txt.textContent = unit.label;
        label.appendChild(txt);
        if (isPending) {
            const badge = document.createElement('span');
            badge.textContent = '未添加';
            badge.style.cssText = 'margin-left:2px;font-size:8px;line-height:1;padding:1px 4px;white-space:nowrap;flex:0 0 auto;' +
                'background:' + (isLight ? 'rgba(100,116,139,0.16)' : 'rgba(148,163,184,0.18)') + ';' +
                'color:' + (isLight ? '#475569' : '#94a3b8') + ';' +
                'border:none;';
            label.appendChild(badge);
        }
        /* 【2026-10-24 用户要求】方块名旁边挂「隐藏 / 锁定」两个小图标（与侧栏方块行同语义）：
           隐藏 = 不显示且无法选中；锁定 = 禁止选中但仍显示。点击只作用于这一条轨道对应的方块，
           且必须 stopPropagation —— 否则会连带触发标签的「选中该轨道」点击。 */
        const trackBlock = unit.repBlock || (unit.blocks && unit.blocks[0]);
        if (trackBlock) {
            const mkIco = (kind) => {
                const on = kind === 'eye' ? !!trackBlock.hidden : !!trackBlock.locked;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'kf-th-ico' + (kind === 'lock' ? ' kf-th-ico-lock' : '') + (on ? ' is-on' : '');
                btn.title = kind === 'eye'
                    ? (trackBlock.hidden ? '显示该方块（当前隐藏：不显示且无法选中）' : '隐藏该方块（不显示且无法选中）')
                    : (trackBlock.locked ? '解锁该方块（当前锁定：禁止选中，仍显示）' : '锁定该方块（禁止选中，仍保持显示）');
                btn.innerHTML = kind === 'eye'
                    ? getGroupEyeIcon(!!trackBlock.hidden)
                    : getBlockLockIcon(!!trackBlock.locked);
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    if (kind === 'eye') setBlocksHidden([trackBlock], !trackBlock.hidden);
                    else setBlocksLocked([trackBlock], !trackBlock.locked);
                    // setBlocksHidden/Locked 只重绘侧栏，轨道头图标状态得自己刷新
                    try { renderKeyframeTimeline(); } catch (e) {}
                });
                return btn;
            };
            label.appendChild(mkIco('eye'));
            label.appendChild(mkIco('lock'));
        }
        head.appendChild(label);
        bg.appendChild(row);

        const times = Array.from(unit.times).sort((a, b) => a - b);
        // 【选中语义修正 2026-09-19】菱形“active（黄色高亮）”只应表示“当前正在编辑的那一帧”，
        // 即离 keyframeCurrentTime 最近的帧——与 syncKeyframeFromBlock 写回目标完全一致。
        // 旧实现把整行 isSelected 直接套到每个菱形上，导致单方块轨道一旦被选中，
        // 轨道内所有帧的菱形全部变黄（黄色边框+辉光），视觉上像“选中了所有帧”，
        // 但实际上编辑只作用于最近帧 → 误导用户以为编辑失效 / 改到了错误的帧。
        let _closestTime = times.length ? times[0] : null;
        for (const _t of times) {
            if (_closestTime === null || Math.abs(_t - keyframeCurrentTime) < Math.abs(_closestTime - keyframeCurrentTime)) _closestTime = _t;
        }
        times.forEach(time => {
            const pct = timeToPct(time);
            if (pct < -0.05 || pct > 1.05) return;
            const leftPct = Math.max(0, Math.min(100, pct * 100));
            const count = unit.isBone
                ? (boneKeyframes.get(unit.id)?.frames.has(time) ? 1 : 0)
                : unit.blocks.reduce((n, b) => {
                    const kf = keyframeData.get(b.id);
                    return n + (kf && kf.frames.has(time) ? 1 : 0);
                }, 0);

            const group = document.createElement('div');
            group.className = 'keyframe-marker-group';
            group.style.left = leftPct + '%';
            /* 【2026-10-22 优化】行高 24，菱形 10px：+7 让菱形垂直居中于轨道 */
            group.style.top = (top + 7) + 'px';
            group.title = unit.label + ' @ ' + time.toFixed(2) + 's (' + count + ' 方块)';
            group.dataset.kfFolder = unit.id || '__ungrouped';
            group.dataset.kfTime = time;

            const diamond = document.createElement('div');
            // 仅当该帧是“当前编辑帧”（离 keyframeCurrentTime 最近）时才标 active（黄色）；
            // 整条轨道的选中状态由 row 的 active-track 表达，不再让每个菱形都变黄。
            diamond.className = 'keyframe-diamond' + (isSelected && time === _closestTime ? ' active' : '');
            diamond.style.background = color;
            group.appendChild(diamond);

            if (count > 1 || unit.blocks.length > 1) {
                const countLabel = document.createElement('div');
                countLabel.style.cssText = 'position:absolute;top:-11px;left:50%;transform:translateX(-50%);font-size:8px;color:' + (isLight ? '#374151' : '#94a3b8') + ';white-space:nowrap;pointer-events:none;';
                countLabel.textContent = count;
                group.appendChild(countLabel);
            }

            group.addEventListener('click', (e) => {
                e.stopPropagation();
                selectKeyframeUnit(unit, time);
            });

            group.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showKeyframeFolderDeleteMenu(unit, time, e.clientX, e.clientY);
            });

            let dragData = null;
            group.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                // ★【2026-10-13】旧操作模式只读：不允许拖动关键帧改变时间（但保留点击选中/预览）
                if (kfLegacyReadOnly()) return;
                // 【2026-09-26】多选方块时，同一秒的关键帧应能【整组】一起拖动。
                //   在按下瞬间快照「该时刻有帧、且其方块属于当前多选」的全部轨道单位；
                //   抬起时整组统一平移到同一时间（此前只移动被拖的那一条 →
                //   用户无法移动多选创建的「相同秒关键帧」）。
                let groupUnits = null;
                try {
                    if (selectedBlocksSet && selectedBlocksSet.size > 1) {
                        const selIds = new Set(Array.from(selectedBlocksSet).map(b => b.id));
                        const sameTime = getKeyframeFolderUnits().filter(u => {
                            if (u.isBone && u.id) {
                                const bk = boneKeyframes.get(u.id);
                                return !!bk && bk.frames.has(time);
                            }
                            return unitKeyframeCubeIds(u).some(id => {
                                const d = keyframeData.get(id);
                                return d && d.frames.has(time);
                            });
                        }).filter(u => {
                            if (!u.id) return u.blocks.some(b => selIds.has(b.id));
                            return getFolderAllCubeIds(u.id).some(id => selIds.has(id));
                        });
                        // 只有确实存在「多个」同秒轨道时才整组移动，否则保持原单条行为
                        if (sameTime.length > 1) {
                            if (!sameTime.includes(unit)) sameTime.push(unit);
                            groupUnits = sameTime;
                        }
                    }
                } catch (err) { groupUnits = null; }
                dragData = { unit, time, startX: e.clientX, groupUnits };
                // setPointerCapture 在极少数情况下会抛（指针已失效 / 合成事件），
                // 抛异常会跳过下面的 stopPropagation → 事件冒泡到容器触发 seek。
                // 用 try/catch 包住，保证后续逻辑一定执行。
                try { group.setPointerCapture(e.pointerId); } catch (err) {}
                group.style.cursor = 'ew-resize';
                e.stopPropagation();
            });
            group.addEventListener('pointermove', (e) => {
                if (!dragData) return;
                const rect = bg.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                /* ★【2026-10-16 r11】拖动必须**量化到 1ms**：否则 keyframeCurrentTime 变成
                   4.474351 这类长浮点；随后的 Gizmo auto-key 会照它建一帧 ⇒ 与显示/键口径不一致。 */
                const rawT = Math.max(0, Math.min(keyframeAnimDuration, keyframeScrollOffset + pct * viewDur));
                /* ★★★【2026-10-19 用户要求】拖动关键帧本身也要吸附到其它轨道/其它帧的时刻
                   （旧实现只量化不吸附 ⇒ 想把 A 的关键帧对齐到 B 帧的时刻只能靠肉眼）。
                   与播放头共用 kfFindSnapTime；excludeTimes 剔除“正在被拖走的那一帧自身的时刻”，
                   避免拖起来就被自己原地吸住。吸附后同步写 keyframeSnappedTime
                   ⇒ 播放头（拖动时本就跟着走）会亮青色并提示「已吸附关键帧」，给用户明确反馈。 */
                const _excl = new Set([dragData.time]);
                const snapT = kfFindSnapTime(rawT, rect.width, _excl);
                const newTime = snapT !== null ? snapT : kfQuantTime(rawT);
                keyframeSnappedTime = snapT;
                keyframeCurrentTime = newTime;
                updateKeyframePlayhead();
            });
            group.addEventListener('pointerup', (e) => {
                if (!dragData) return;
                group.style.cursor = '';
                try { group.releasePointerCapture(e.pointerId); } catch (ex) {}
                const rect = bg.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                /* ★【2026-10-16 r11】量化：拖动落点必须是 1ms 网格点，杜绝 4.474351 这类坏键
                   （它是"凭空多一帧 / 编辑不了"的唯一源头）。 */
                const rawT = Math.max(0, Math.min(keyframeAnimDuration, keyframeScrollOffset + pct * viewDur));
                /* ★★★【2026-10-19 用户要求】落点同样走吸附（与 pointermove 完全同口径）：
                   这样"拖动过程中看到的吸附位置"与"松手后真正落到的位置"一定一致，
                   不会出现"拖的时候吸上了、松手却弹开几毫秒"的错位。 */
                const snapT = kfFindSnapTime(rawT, rect.width, new Set([dragData.time]));
                let newTime = snapT !== null ? snapT : kfQuantTime(rawT);
                const moveThreshold = 0.002;
                if (Math.abs(newTime - dragData.time) > moveThreshold) {
                    const _grp = dragData.groupUnits && dragData.groupUnits.length > 1 ? dragData.groupUnits : null;
                    const _ok = _grp
                        ? moveKeyframeGroupAtTime(_grp, dragData.time, newTime)   // 多选同秒帧：整组平移
                        : moveKeyframeUnit(dragData.unit, dragData.time, newTime);
                    if (_ok) {
                        renderKeyframeTimeline();
                        selectKeyframeUnit(dragData.unit, newTime);
                        // 移动后在场内预览整组新时刻姿态（与拖动时间轴预览语义一致）
                        applyKeyframePreviewAtTime(newTime);
                        recordAction();
                    }
                } else {
                    selectKeyframeUnit(dragData.unit, dragData.time);
                }
                // 松手 ⇒ 清除吸附高亮（与播放头拖拽松手行为一致，避免播放头常亮青色「已吸附」）
                keyframeSnappedTime = null;
                updateKeyframePlayhead();
                dragData = null;
                e.stopPropagation();
            });

            bg.appendChild(group);

            const vLine = document.createElement('div');
            vLine.className = 'keyframe-vert-line';
            vLine.style.left = leftPct + '%';
            vLine.style.top = (top + 17) + 'px';
            vLine.style.height = ((units.length - idx) * TRACK_H - 17) + 'px';
            vLine.style.background = color;
            vLine.style.opacity = '0.12';
            bg.appendChild(vLine);
        });
    });

    updateKeyframePlayhead();
}

function updateKeyframePlayhead() {
    const playhead = document.getElementById('kfPlayhead');
    const container = document.getElementById('kfTimelineContainer');
    const timeLabel = document.getElementById('kfTimeLabel');
    if (!playhead || !container) return;
    if (container.style.display === 'none') return;
    
    const pct = timeToPct(keyframeCurrentTime);
    /* 时间轴左侧有固定宽度的轨道名列（--kf-gutter），播放头必须按像素落在轴区内，
       否则会整体偏移一个 gutter 的宽度，和菱形刻度对不上。 */
    const gutter = parseFloat(getComputedStyle(container).getPropertyValue('--kf-gutter')) || 0;
    const axisW = Math.max(1, container.clientWidth - gutter);
    playhead.style.left = (gutter + pct * axisW) + 'px';
    // ★【2026-10-18】吸附状态视觉提示：吸到某个关键帧时，播放头亮青并把该时刻随提示条露出
    const snapped = keyframeSnappedTime !== null && Math.abs(keyframeSnappedTime - keyframeCurrentTime) < 1e-6;
    playhead.classList.toggle('kf-snapped', snapped);
    if (timeLabel) {
        timeLabel.textContent = `${keyframeCurrentTime.toFixed(2)}s` + (snapped ? ' ⇥' : '');
        timeLabel.classList.toggle('kf-snapped', snapped);
    }
}

// 将方块当前变量值同步到关键帧数据（当用户在数据面板修改时调用）
/* ★★【2026-10-13 关键修复】这里曾把 scope.vars 里的**全部**变量一股脑塞进最近的关键帧，
   包括：① 派生量（v.fit_a=math.max(...)、v.prod=...）② 编译内部量
   （v.<id>_kv、_seg_time、_dur、_start_X、_T<X>、_u）。后果链（_dbg5.cjs 栈追踪证实）：
     frame[0] 被灌进 24 个变量 → 编译器认为 fit_a 也是"被关键帧驱动"的
     → 给它写常量种子 `v.fit_a=1;` → runBlockProgram 的 setVar 把 d.expr 从
       'math.max(math.abs(v.a),0.01)' **覆盖成 '1'** → 派生量识别失效
     → 候选面板把 fit_a/prod 全列出来（用户投诉：明知被表达式赋值还列举）
     → 同时程序里少了派生表达式、多了废常量种子，导出也被污染。
   现在：只同步 **由关键帧管理（d.vars）** 或 **核心变换通道** 的变量；
   派生量与内部量一律不写（它们由程序末尾的表达式段负责）。 */
function kfShouldSyncVar(block, name) {
    if (isKeyframeInternalVar(name, block.id) || _kfIsNsInternal(name, block.id) || kfIsLegacyScaffoldTwin(name, block.id, block.scope && block.scope.program)) return false;
    const d = kfData(block.id);
    if (d && d.vars instanceof Set && d.vars.has(name)) return true;     // 用户确认要管的
    if (KF_CORE_VARS.includes(name)) return true;                        // 核心变换通道
    return false;
}
/* ★★【2026-10-14 P0 修复 · 用户投诉「数据表数值压根没被应用 / 自定义变量完全无效」】
   录帧时该不该把这个变量快照进帧？
     · 用户显式接管（d.vars）        → 是
     · 派生量（被非常量表达式赋值）  → **否**
     · 其余（常量赋值的核心变量、自定义输入参数）→ 是
   旧实现把 16 个核心变量**无条件全量**写进每一帧，后果（真浏览器实测）：
     · `v.zrot=v.myval*10` 这类"核心变量 + 表达式"也被当成关键帧驱动
       → 编译器 `drivenSet` 命中 → 后段表达式被**静默剔除** → 值冻结成常量种子
       → 用户改 v.myval 5→20，zrot 恒 50（应 200），依赖链断裂
       ⇒ 自定义变量看起来"完全无效"（值进了帧，但产物里没有任何效果）
     · 同理 `v.scale=math.sqrt(...)`（旗帜预设）也被固化成 `v.scale=1.224745`
   正解：派生量不进帧 —— 它们由程序末尾的表达式段计算，绝不能被冻结成帧值。 */
function kfShouldRecordVar(block, name) {
    if (!block) return false;
    if (isKeyframeInternalVar(name, block.id) || _kfIsNsInternal(name, block.id) || kfIsLegacyScaffoldTwin(name, block.id, block.scope && block.scope.program)) return false;
    const d = kfData(block.id);
    if (d && d.vars instanceof Set && d.vars.has(name)) return true;     // 用户主动接管 → 录
    try { if (kfIsNonConstAssigned(block, name)) return false; } catch (e) { }   // 派生量 → 不录
    return true;
}
function syncKeyframeFromBlock(block) {
    if (!block || !keyframeWindowOpen) return;
    // ★ Molang 编辑模式：数值面板改动不回写该方块的关键帧（避免关键帧反过来改写它的 Molang 程序）
    if (isMolangModeBlock(block)) return;
    // ★★ v2：编译式关键帧方块 —— Gizmo/数值写入已由 kfGizmoWriteVar 落到 keyframeData，
    //   这里绝不能再按"最近帧 + 全量 scope.vars"回写（那会把派生量灌进帧、污染 expr）。
    if (kfCanUseCompiled(block) && hasKeyframeAnimation(block.id)) return;
    const varNames = ['xpos','ypos','zpos','xrot','yrot','zrot','rotatex','rotatey','rotatez','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos'];
    // 【✛ 显式绑定子骨骼 2026-09-12】：只同步【自身可驱动通道】——与 recordKeyframeForBlock /
    // renderKeyframeDataPanel 保持一致。旧实现按 varNames 全量同步、还会把 scope 里的派生量
    // （v.parent_*、v.p_c*、v.pR00..22、v.xpos 公式结果）一起写进帧；回放时这些量被 _writeKfVarsToBlock
    // 以「常量」写回，把 molang 表达式覆盖成死值（v.pR00 冻结 → 子块不再随父旋转），并污染导出。
    const _isExplicitChild = !!(block._boneParent && !(block.group && boneKeyframes.has(block.group)));
    const _syncNames = _isExplicitChild
        ? ['xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos_bone','ybasepos_bone','zbasepos_bone','bone_rotx','bone_roty','bone_rotz']
        : varNames;
    const _isExplicitChildOf = (b) => !!(b._boneParent && !(b.group && boneKeyframes.has(b.group)));
    const _syncNamesOf = (b) => _isExplicitChildOf(b)
        ? ['xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos_bone','ybasepos_bone','zbasepos_bone','bone_rotx','bone_roty','bone_rotz']
        : varNames;
    
    // 批量模式：同步所有选中且有动画数据的方块
    if (selectedBlocksSet.size > 1) {
        const syncedIds = [];
        for (const b of selectedBlocksSet) {
            if (!keyframeData.has(b.id)) continue;
            const data = keyframeData.get(b.id);
            if (data.frames.size === 0) continue;
            const times = Array.from(data.frames.keys()).sort((a, b) => a - b);
            let closest = times[0];
            for (const t of times) {
                if (Math.abs(t - keyframeCurrentTime) < Math.abs(closest - keyframeCurrentTime)) closest = t;
            }
            const frameData = data.frames.get(closest);
            const _names = _syncNamesOf(b);
            for (const name of _names) {
                const d = b.scope.vars.get(`v.${name}`);
                if (d) frameData.set(name, d.value);
            }
            // 显式绑定子骨骼不做「自定义变量全量收录」：其 scope 里除自驱动通道外全是骨骼派生 molang
            if (_isExplicitChildOf(b)) { syncedIds.push(b.id); continue; }
            for (const [key, val] of b.scope.vars) {
                const shortName = key.slice(2);
                if (!varNames.includes(shortName) && kfShouldSyncVar(b, shortName)) {
                    frameData.set(shortName, val.value);
                }
            }
            syncedIds.push(b.id);
        }
        // 【Molang 模式同步】批量同步后刷新 Molang 程序
        refreshMolangProgramForBlocks(syncedIds);
        renderKeyframeDataPanel();
        return;
    }
    
    // 单方块模式
    if (!selectedKeyframeBlock) return;
    if (block.id !== selectedKeyframeBlock) return;
    if (!keyframeData.has(block.id)) return;
    const data = keyframeData.get(block.id);
    if (data.frames.size === 0) return;
    // 找到最近的关键帧
    const times = Array.from(data.frames.keys()).sort((a, b) => a - b);
    let closest = times[0];
    for (const t of times) {
        if (Math.abs(t - keyframeCurrentTime) < Math.abs(closest - keyframeCurrentTime)) closest = t;
    }
    const frameData = data.frames.get(closest);
    for (const name of _syncNames) {
        const d = block.scope.vars.get(`v.${name}`);
        if (d) frameData.set(name, d.value);
    }
    // 也同步自定义变量（排除关键帧内部辅助变量，防止冗余增长）
    // 显式绑定子骨骼跳过：其 scope 里除自驱动通道外全是骨骼派生 molang（parent_*/p_c*/pR*），
    // 收录它们会在回放时被写回成常量、破坏跟随（见函数开头注释）。
    if (!_isExplicitChild) {
        for (const [key, val] of block.scope.vars) {
            const shortName = key.slice(2);
            if (!varNames.includes(shortName) && kfShouldSyncVar(block, shortName)) {
                frameData.set(shortName, val.value);
            }
        }
    }
    // 【Molang 模式同步】单方块同步后刷新 Molang 程序
    refreshMolangProgramForBlock(block.id);
    renderKeyframeDataPanel();
}

// 关键帧右键删除菜单
let kfDeleteMenu = null;
function showKeyframeDeleteMenu(bid, time, x, y) {
    // ★【2026-10-13】旧操作模式只读：不提供删除入口
    if (kfBlockLegacyEdit('删除关键帧，')) return;
    if (kfDeleteMenu) { kfDeleteMenu.remove(); kfDeleteMenu = null; }
    const menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;z-index:800;background:rgba(15,23,42,0.95);border:1px solid #f43f5e;border-radius:8px;padding:4px 0;min-width:140px;backdrop-filter:blur(8px);left:'+x+'px;top:'+y+'px;';
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px 14px;font-size:12px;color:#fca5a5;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px;';
    item.innerHTML = '🗑 删除 ' + bid + ' @ ' + time + 's';
    item.addEventListener('mouseenter', () => item.style.background = 'rgba(244,63,94,0.2)');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', () => {
        removeKeyframeAtTime(bid, time);
        if (kfDeleteMenu) { kfDeleteMenu.remove(); kfDeleteMenu = null; }
    });
    menu.appendChild(item);
    const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove(); kfDeleteMenu = null;
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
    document.body.appendChild(menu);
    kfDeleteMenu = menu;
}

// 增加/减少动画总时长
function changeAnimDuration(delta) {
    // ★【2026-10-13】旧操作模式只读：不改动画总时长
    if (kfBlockLegacyEdit('修改动画总时长，')) return;
    const newDur = Math.max(1, Math.min(300, keyframeAnimDuration + delta));
    if (newDur === keyframeAnimDuration) return;
    keyframeAnimDuration = newDur;
    // 如果当前时间超出新时长则回拨
    if (keyframeCurrentTime > keyframeAnimDuration) {
        keyframeCurrentTime = keyframeAnimDuration;
    }
    // 滚动偏移不能超出范围
    const vd = getViewDuration();
    const maxOff = Math.max(0, keyframeAnimDuration - vd);
    if (keyframeScrollOffset > maxOff) keyframeScrollOffset = maxOff;
    renderKeyframeTimeline();
    updateKeyframePlayhead();
    recordAction();
}

// 为单个方块在指定时间记录关键帧（供单方块与骨骼批量录制共用）
// overwrite=true 时若该时间已存在关键帧则覆盖为当前值（用于骨骼批量录制，确保整组姿态被记录）
// 关键修正：「记录关键帧」= 把方块【当前姿态】快照写入该帧；绝不能拿已有帧做插值/复制，
// 否则骨骼（文件夹）录第 2+ 个关键帧时只会复制第 1 帧的姿态，导致骨骼动画数据根本没变化（看起来“没记录”）。
// 读取方块某个 v.* 的当前真实值：常量取 def.value，表达式（骨骼子块的 v.xpos 等）经 molang 引擎
// 实时求值得到世界坐标——这是扁平化关键帧能正确捕获骨骼子块姿态的关键（否则读到 0/陈旧值导致坍缩）。
function capVal(b, shortName) {
    const d = b.scope.vars.get('v.' + shortName);
    if (!d) return 0;
    return isConstantExpr(d.expr) ? Number(d.value) : evaluateExpression(d.expr, b.scope.vars, globalVars, b.scope.blockId);
}
/* ★★★【2026-10-18 r18·2 · 用户要求「关键帧只允许通过「+」按钮点击来新建帧，其他自动建帧路径一律砍掉避免 bug」】
   `kfAllowNewFrame` 默认 false = 禁止任何路径凭空新建关键帧（Gizmo 拖拽 / 数值改动 / 文件夹同步 …）。
   只有显式的「录制」行为会临时置 true：
     · 「+」按钮 → kfRecordUserFrame()（推荐入口）
     · 教程脚本 / 导入等显式流程 → kfRecordUserFrame() 或 kfWithNewFrameAllowed()
   注意：写入**已存在的帧**不受影响（那只是改值，不新建帧）。 */
let kfAllowNewFrame = false;
/* 被闸门拦下「凭空建帧」时给用户的提示：**防抖 420ms** —— 拖拽期间写入是逐帧触发的，
   防抖能保证提示只在「连续操作停下来」之后弹一次，不会在拖拽中弹出模态气泡打断手势。 */
let _kfNoFrameTipTimer = 0;
function kfNotifyNoFrameBlocked() {
    if (_kfNoFrameTipTimer) { clearTimeout(_kfNoFrameTipTimer); _kfNoFrameTipTimer = 0; }
    _kfNoFrameTipTimer = setTimeout(() => {
        _kfNoFrameTipTimer = 0;
        try { showKfBubble('当前时刻不是关键帧，本次改动未保存：请先点「+」在该时刻加一帧', { confirmText: '知道了' }); } catch (e) { }
    }, 420);
}
function kfWithNewFrameAllowed(fn) {
    const _old = kfAllowNewFrame; kfAllowNewFrame = true;
    try { return fn(); } finally { kfAllowNewFrame = _old; }
}
function kfRecordUserFrame(block, time, overwrite) {
    return kfWithNewFrameAllowed(() => recordKeyframeForBlock(block, time, overwrite));
}
function recordKeyframeForBlock(block, time, overwrite) {
    if (!block) return;
    // ★ v2【2026-10-13】molang 编辑模式不再被拒：与关键帧彻底打通（编译会保留手写程序）。
    const _kfHadData = keyframeData.has(block.id);
    if (!_kfHadData) initKeyframeForBlock(block.id);
    const data = keyframeData.get(block.id);
    if (data.frames.has(time) && !overwrite) {
        // 已存在该时间的关键帧且非覆盖模式：保留现有数据
        return;
    }
    /* ★★★【2026-10-14 P0 修复 · 「自定义变量写不成关键帧」的第二半】
       自动纳入（`kfOnBlockAddedToAnimation`）原本挂在 recordKeyframeForBlock **末尾的 setTimeout(60ms)**，
       而调用方 `createKeyframeAtCurrentTime` 是**同步**跑完整个 targets 循环的 ⇒ 录第 1 帧时
       `d.vars` 还没被填充 ⇒ 第 1 帧里没有任何自定义变量（实测 f0.side_a = undefined）
       ⇒ 编译器只有 f1 一个值可用 ⇒ start/T 都等于 4 ⇒ **两帧无插值、播放毫无动画**。
       正解：把「纳入非派生变量」提前到**录制快照之前同步执行**，保证第 1 帧就带上自定义变量。 */
    try {
        if (!data.autoWired) {
            data.autoWired = true;
            if (!(data.vars instanceof Set)) data.vars = new Set();
            for (const key of block.scope.vars.keys()) {
                if (!key.startsWith('v.')) continue;
                const n = key.slice(2);
                if (isKeyframeInternalVar(n, block.id) || _kfIsNsInternal(n, block.id) || kfIsLegacyScaffoldTwin(n, block.id, block.scope && block.scope.program)) continue;   // ★ r18：v1 裸名脚手架（有命名空间孪生）不写进数据
                if (kfIsNonConstAssigned(block, n)) continue;   // 派生量留在指令末尾算，不纳入
                data.vars.add(n);
            }
        }
    } catch (e) { }
    // 始终从方块当前 v.* 快照（无论是否已有其它帧），确保拖动/旋转骨骼后点“+”即保存真实姿态
    const newMap = new Map();
    const varNames = ['xpos','ypos','zpos','xrot','yrot','zrot','rotatex','rotatey','rotatez','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos'];
    // 骨骼子块（纯显式绑定 _boneParent，且不属于文件夹骨骼系统）：位置由 molang
    //   v.xpos = t.父_px + pR·xbasepos_bone  实时跟随父骨骼，旋转 rotatex/y/z 直接赋值跟随父；
    // 这两个集合【不】写进帧、也不改（保持父驱动）。仅记录局部可编辑变量：
    //   xrot/yrot/zrot（自身姿态累积）、xbasepos_bone 三变量（相对父偏移）、scale 等。
    // 这样子骨骼能自由做关键帧动画，又不打断对父骨骼的刚性跟随。
    const _inFolderBone = !!(block.group && boneKeyframes.has(block.group));
    if (block._boneParent && !_inFolderBone) {
        varNames.length = 0;
        ['xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos_bone','ybasepos_bone','zbasepos_bone',
         'bone_rotx','bone_roty','bone_rotz'].forEach(n => varNames.push(n));
    }
    for (const name of varNames) {
        // ★★【2026-10-14】派生量（被表达式赋值的变量）**不进帧** —— 见 kfShouldRecordVar 注释：
        //   一旦进帧就会被编译器当成"关键帧驱动"，其表达式被剔除、值被冻成常量种子，
        //   进而让依赖它的变量失效（用户投诉「自定义变量完全无效」的真根因）。
        if (!kfShouldRecordVar(block, name)) continue;
        // 骨骼子块的 v.xpos 是 molang 表达式（跟随父骨骼），用 capVal 实时求值得到世界坐标，
        // 否则读到 def.value（陈旧/0）→ 回放坍缩到原点。常量变量 capVal 与 d.value 等价。
        newMap.set(name, capVal(block, name));
    }
    /* ★★★【2026-10-14 P0 修复 · 用户投诉「自定义变量压根写不成关键帧，完全无效，按播放毫无动画」的真根因】
       旧实现的录制循环**只遍历上面硬编码的 16 个核心变量**，自定义变量（side_a/side_b/angle…）
       根本不会被写进帧。后果链（真浏览器实测）：
         ① `kfOnBlockAddedToAnimation` 已把 side_a 纳入 `d.vars` ⇒ 编译器把它当「关键帧驱动」；
         ② 但**每一帧里都没有 side_a 的值** ⇒ 编译器取值矩阵时查不到帧值
            → 回退到 `block.scope.vars` 的**当前值**（4）⇒ `start_side_a = Tside_a = 4`；
         ③ 于是两帧之间**没有任何插值**，`side_a` 恒 4、依赖它的 `scale` 恒 8
            ⇒ 「改一处值后按播放毫无动画可见」；
         ④ 数据表两帧都显示同一值 ⇒ 「第二次选择该方块所有时间上的值都一样」。
       正解：把**所有被纳入关键帧体系的变量**（`d.vars` ∪ 帧里已出现过的）都纳入快照，
       再按 `kfShouldRecordVar` 逐一同口径过滤（派生量仍不录）。
       ★ 口径唯一来源 = `kfShouldRecordVar`，绝不再用两份名单（这正是"逻辑不清晰"的根源）。 */
    try {
        const _d = kfData(block.id, true);
        const _extra = new Set();
        if (_d.vars instanceof Set) _d.vars.forEach(n => _extra.add(n));
        if (_d.frames instanceof Map) for (const [, m] of _d.frames) for (const k of m.keys()) _extra.add(k);
        if (_d.exprs instanceof Map) for (const [, m] of _d.exprs) for (const k of m.keys()) _extra.add(k);
        for (const name of _extra) {
            if (newMap.has(name) || varNames.includes(name)) continue;
            if (isKeyframeInternalVar(name, block.id) || _kfIsNsInternal(name, block.id) || kfIsLegacyScaffoldTwin(name, block.id, block.scope && block.scope.program)) continue;
            if (!kfShouldRecordVar(block, name)) continue;
            // 骨骼子块：位置/父跟随旋转通道不录（保持父驱动），与上面 varNames 分支一致
            if (block._boneParent && !_inFolderBone && ['xpos', 'ypos', 'zpos', 'rotatex', 'rotatey', 'rotatez'].includes(name)) continue;
            newMap.set(name, capVal(block, name));
        }
        /* ★ 回填：本次录制新纳入的变量，若**更早的帧**里还没有它的值，用那些帧当时应有的值补齐。
           否则会出现「第 1 帧 side_a 缺失、第 2 帧才有」→ 编译器只能用单值 ⇒ 无插值。
           回填值取该变量的**当前值**（用户在第 1 帧时的历史值已不可考，但至少保证每帧都有值、
           插值链路成立；用户随后可在时间表里逐帧改成不同值）。 */
        if (data.frames instanceof Map) {
            for (const [t, m] of data.frames) {
                if (t === time || !(m instanceof Map)) continue;
                for (const [name, val] of newMap) {
                    if (m.has(name)) continue;
                    m.set(name, val);
                }
            }
        }
    } catch (e) { }
    // ★ r18·2 闸门：该时刻还没有帧时，非「+」按钮路径（文件夹 Gizmo 同步 / 自动流程）不得新建帧
    if (!(data.frames instanceof Map) || !data.frames.has(time)) {
        if (!kfAllowNewFrame) return;
    }
    data.frames.set(time, newMap);
    keyframeEpoch++; // 标记关键帧数据变更，使骨骼播放缓存失效并重建
    // 【Molang 模式同步】创建关键帧后，若方块在 Molang 模式则重新生成 Molang 程序
    refreshMolangProgramForBlock(block.id);
    addKeyframeBlockTag(block.id);
    // ★★★【2026-10-14 用户要求】方块**首次**进入关键帧动画 → 自动纳入全部非派生变量
    //   （不再弹「选择要作为关键帧的变量」面板；需要排除个别变量时点面板头「变量」）。
    //   ⚠ 触发判据不能用 `!_kfHadData`：keyframeData 的条目在**渲染时间表时**就已被
    //     kfData(id,true) 预创建 ⇒ `_kfHadData` 恒为 true ⇒ 自动纳入永远不触发（实测踩到）。
    //   正确判据：`d.autoWired` 未置位，且这是该方块**第一个**关键帧。
    try {
        if (isNewLayoutMode && !data.autoWired && data.frames.size === 1) {
            data.autoWired = true;
            setTimeout(() => { try { kfOnBlockAddedToAnimation(block.id); } catch (e) { } }, 60);
        }
    } catch (e) { }
}

// 在当前播放头位置创建关键帧
// 关键帧数据始终挂在【每个方块（子集）】上；文件夹只是显示/选区容器，本身不承载关键帧数据。
// 录制目标 = 当前选中的方块集合（整组编辑时，openKeyframeWindow 已把组内全部子集方块装入 selectedBlocksSet）；
// 若没有多选则退化为单体 selectedKeyframeBlock。对每个方块单独快照其当前姿态并写入该时刻。
function createKeyframeAtCurrentTime() {
    // ★【2026-10-13】旧操作模式只读：不允许录制关键帧
    if (kfBlockLegacyEdit('录制关键帧，')) return;
    /* ★★【2026-10-16 P0 · 时间键必须量化】播放态下 `keyframeCurrentTime = t` 来自
       `(elapsed % duration)/1000`，是原始浮点（实测录出 `0.4243999999910593`）。
       而所有写入口（kfSetValueAtFrame / kfData 的键规范化）与 UI 显示都按 1ms 量化
       ⇒ 「显示的时间块」与「真实键」不一致，点它改值就会落到别的帧 / 新建一帧
       ⇒ 用户投诉的「帧的赋值和时间没有搞对 / 多出来一帧」。这里在录制入口统一量化，
       与 scrubToClientX、侧栏播放头输入保持同一口径（显示 = 键 = 编辑目标）。 */
    const time = kfQuantTime(keyframeCurrentTime);
    // ★ v2【2026-10-13】molang 编辑模式与关键帧彻底打通：不再拒绝录帧。
    //   编译产物会保留用户手写程序（前段/后段），只注入时间块 —— 手写表达式不会被覆盖丢失。
    // 文件夹骨骼关键帧：【复用已验证的「紫色加号」骨骼 molang 机制】——recordBoneKeyframe / applyBoneKeyframeAtTime。
    // 只记录每块【局部变量】：根方块记自身姿态(xpos/rotatex…)；子方块记相对父的局部偏移(xbasepos_bone)与局部旋转。
    // 子方块的 v.xpos 永远是 molang 表达式：  v.xpos = t.PARENT_px + pR·xbasepos_bone
    // 播放时由引擎【实时算出】世界坐标——父一旋转，pR 变、整个子坐标系绕父转，但 xbasepos_bone（bonebasepos）数值恒定不变。
    // 这正是正确的骨骼原理；绝不像旧“扁平化”路径那样把子块世界坐标存成常量（那会覆盖 molang、令子块脱离父骨骼自顾自动）。
    // 判定当前录制目标是否为文件夹骨骼：组编辑态看 selectedFolder；单体选中态看该块是否骨骼子块/根（取其所在骨骼文件夹）。
    /* ★【2026-10-18 修复「多选选中了却没被记录帧」- 根因 3】
       显式多选优先于文件夹：用户在面板里 Ctrl 多选后，只要选区内含有「不属于 selectedFolder 的方块」，
       就说明这次的编辑意图是【多选逐块录制】，绝不能让 selectedFolder 分支抢先
       （那只会录该文件夹自己的方块，把用户真正选中的其他方块整批漏掉）。
       ★ 判据必须用【亲手点选】集合 kfExplicitPickIds，而不是整个 selectedBlocksSet：
         点文件夹表头时选区会被自动扩展成「该文件夹及其子文件夹的全部方块」，
         子文件夹方块 group 必然 != selectedFolder ⇒ 用 selectedBlocksSet 判定会把
         嵌套骨骼文件夹（bone>bone1>Cube1）误判成“显式多选”，导致骨头级录制被跳过（真实回归）。
         kfExplicitPickIds 由 selectFolder 主动清空，因此“点文件夹”永远不会触发本守卫。 */
    const _explicitBlocks = Array.from(kfExplicitPickIds)
        .map(id => blocks.find(b => b.id === id)).filter(Boolean)
        // ★ 必须仍在本轮选区内才算数：selectKeyframeUnit/selectFolder 等会整体重建选区，
        //   此时【上一轮】残留的“亲手点选”id 必须自动失效，否则会凭空把骨头级录制打回逐块。
        .filter(b => selectedBlocksSet.has(b));
    const _multiOutsideFolder = !!(selectedFolder && _explicitBlocks.some(b => b.group !== selectedFolder));
    const _recFolder = _multiOutsideFolder ? null : selectedFolder;
    let _boneFolder = null;
    if (_recFolder && isFolderBoneSystem(_recFolder)) {
        _boneFolder = _recFolder;
    } else if (selectedKeyframeBlock && !_multiOutsideFolder) {
        const _b = blocks.find(x => x.id === selectedKeyframeBlock);
        if (_b) {
            const _pid = getBoneParentId(_b);
            const _pf = _pid ? (blocks.find(p => p.id === _pid) || {}).group : _b.group;
            if (_pf && isFolderBoneSystem(_pf)) _boneFolder = _pf;
        }
    }
    if (_boneFolder) {
        recordBoneKeyframe(_boneFolder, time);
        applyBoneKeyframeAtTime(_boneFolder, time); // 立即应用该帧便于视觉确认（molang 实时跟随）
        keyframeAnimDuration = Math.max(keyframeAnimDuration, Math.ceil(time) + 2);
        renderKeyframeTimeline();
        renderKeyframeDataPanel();
        recordAction();
        return;
    }
    let targets = [];
    if (_recFolder) {
        // 非骨骼文件夹：只录制【本文件夹直接所属】的方块（不含后代子文件夹的方块）。
        // 否则 getFolderAllCubeIds 会把嵌套子文件夹（如 bone>bone1>Cube1）的方块也录进来。
        const ids = blocks.filter(b => b.group === _recFolder).map(b => b.id);
        // 自动指定骨干的守卫仍用 getBoneBlocksOfFolder（语义＝「该文件夹里已经存在任何骨骼绑定关系则不再指定」）：
        // 普通文件夹里若有一个方块被 ✛ 绑到文件夹外的父块，绝不能把这个文件夹重新指定成骨骼，否则会拆掉那条绑定。
        if (ids.length >= 1 && !getBoneBlocksOfFolder(_recFolder)) {
            designateFolderBackbone(_recFolder, ids[0], true); // silent（内部会自动同步整棵文件夹骨骼树）
            if (typeof renderSideBlockList === 'function') renderSideBlockList();
        }
        // 只有【真的自成一根骨骼】的文件夹才走骨骼录制；普通文件夹（哪怕内含外部 ✛ 子块）走逐块录制，
        // 否则会伪造骨级轨道并抹掉同级方块的逐块关键帧（见 isFolderBoneSystem 注释）。
        if (isFolderBoneSystem(_recFolder)) {
            recordBoneKeyframe(_recFolder, time);
            applyBoneKeyframeAtTime(_recFolder, time); // 立即应用该帧便于视觉确认（molang 实时跟随）
            keyframeAnimDuration = Math.max(keyframeAnimDuration, Math.ceil(time) + 2);
            renderKeyframeTimeline();
            renderKeyframeDataPanel();
            recordAction();
            return;
        }
        targets = ids.map(id => blocks.find(b => b.id === id)).filter(Boolean);
    } else if (selectedBlocksSet && selectedBlocksSet.size > 0) {
        targets = Array.from(selectedBlocksSet);
    } else if (selectedKeyframeBlock) {
        const b = blocks.find(x => x.id === selectedKeyframeBlock);
        if (b) targets = [b];
    }
    if (targets.length === 0) { showKfBubble('请先选择一个方块', { confirmText: '知道了' }); return; }

    // ★ v2：molang 编辑模式的方块不再从录制目标里剔除（两者已打通）。
    // 以下仅处理【非骨骼】方块（骨骼分支已在上方 recordBoneKeyframe 路径 return）。
    // 非骨骼逐方块记录当前真实姿态；覆盖写入确保“拖动/旋转后再点 +”真实更新该帧。

    blocks.forEach(b => b.refresh()); // 确保 molang 表达式已求值到最新世界坐标
    // 逐方块快照当前姿态即可。覆盖写入确保“拖动/旋转后再点 +”真实更新该帧。
    targets.forEach(b => {
        kfRecordUserFrame(b, time, true);   // 始终覆盖写入当前姿态（逐方块，子集数据）；★ r18·2 经「+」按钮闸门放行建帧
        applyKeyframeToBlock(b.id, time);        // 立即应用该帧，便于视觉确认
    });

    keyframeAnimDuration = Math.max(keyframeAnimDuration, Math.ceil(time) + 2);
    kfRefreshAllPanels();      // ★ 两套界面（浮动窗 + 侧栏时间表）统一刷新
    recordAction();
}

function removeKeyframeAtTime(blockId, time) {
    // ★【2026-10-13】旧操作模式只读：不删除关键帧
    if (kfBlockLegacyEdit('删除关键帧，')) return;
    const data = keyframeData.get(blockId);
    if (!data) return;
    data.frames.delete(time);
    keyframeEpoch++; // 标记关键帧数据变更，使骨骼播放缓存失效并重建
    // 【Molang 模式同步】删除关键帧后，若方块在 Molang 模式则重新生成 Molang 程序
    refreshMolangProgramForBlock(blockId);
    kfRefreshAllPanels();      // ★ 两套界面统一刷新
    recordAction();
}

// 【2026-09-19】删除「当前编辑帧」——供关键帧窗口内的 Delete/Backspace 使用。
//   ★ 修复的用户反馈：此前关键帧窗口从未注册 Del 处理，全局 Del 快捷键（见 window keydown）
//   只判断「焦点不在输入框 + 鼠标不在左下变量面板」，于是按 Del 会直接走 deleteSelectedBlocks()
//   删掉整个方块（有动画时弹一次确认，无动画时静默删除），而不是删选中的关键帧。
//   语义与数据面板右上角「🗑 删除」按钮完全一致（单方块 → 该方块在最近帧；组编辑 → 整组的该帧）。
//   返回 true 表示确实删除了，false 表示当前无可删除的目标（调用方据此决定是否回退到其它行为）。
function deleteCurrentKeyframe() {
    if (!keyframeWindowOpen) return false;
    // ★【2026-10-13】旧操作模式只读：Del 键不删关键帧（回退到其它行为由调用方决定）
    if (kfLegacyReadOnly()) return false;
    const win = document.getElementById('keyframeWindow');
    // 窗口必须真实可见（display 非 none）才接管 Del，避免窗口隐藏时误吞按键
    if (!win || win.style.display === 'none') return false;
    if (!selectedKeyframeBlock) return false;
    const unit = getKeyframeFolderUnits().find(u => u.blocks.some(b => b.id === selectedKeyframeBlock));
    // 组编辑态：删整组在该时刻的关键帧（与数据面板 isGroup 分支一致）
    if (kfGroupEdit && unit && unit.id) {
        const times = Array.from(unit.times).sort((a, b) => a - b);
        if (times.length === 0) return false;
        let closest = times[0];
        for (const t of times) if (Math.abs(t - keyframeCurrentTime) < Math.abs(closest - keyframeCurrentTime)) closest = t;
        removeKeyframeUnitAtTime(unit, closest);
        return true;
    }
    // 单方块：删该方块在「离当前时间最近的那一帧」的关键帧
    const times = getKeyframeTimes(selectedKeyframeBlock);
    if (times.length === 0) return false;
    let closest = times[0];
    for (const t of times) if (Math.abs(t - keyframeCurrentTime) < Math.abs(closest - keyframeCurrentTime)) closest = t;
    removeKeyframeAtTime(selectedKeyframeBlock, closest);
    return true;
}

