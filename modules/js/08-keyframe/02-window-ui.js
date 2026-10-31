/* 08-keyframe/02-window-ui.js · 源 测试版v.6b79.html 第 40043-41994 行 */
'use strict';
// ==================== 关键帧窗口UI ====================
// 关闭浮动关键帧窗（侧栏「浮动窗」按钮与面板头共用；不退出关键帧模式）
function closeKeyframeWindow() {
    /* ★【2026-10-20 修复】原来这里调了 stopKeyframePlayback() ⇒ 用户一收窗、动画立刻停住，
       而「收窗」只是收起面板、并没有退出关键帧模式，本该继续预览播放。
       播放的生命周期只跟关键帧模式走（由 exitKeyframeMode 负责停止），不跟窗口显隐走。 */
    if (keyframeWindowEl) keyframeWindowEl.style.display = 'none';
    keyframeWindowOpen = false;
    if (typeof renderSideBlockList === 'function') renderSideBlockList();
}
function openKeyframeWindow() {
    if (keyframeWindowEl) {
        keyframeWindowEl.style.display = 'flex';
        keyframeWindowOpen = true;
        // ★【2026-10-17】在「打开关键帧窗口」这个干净时刻清除历史遗留的幽灵空条目
        //   （此刻不会有"刚经选择器加入、变量待补"的方块在途，故不会误删）。
        try { kfPurgePhantomEntries(); } catch (e) { }
        clearNonKeyframeSelection();
        // 组编辑态下，clearNonKeyframeSelection 会清空 selectedBlocksSet（只保留已有关键帧数据的方块）；
        // 此处把整组（文件夹内全部子集方块）重新装入 selectedBlocksSet——
        // 录制/播放正是逐方块读取这个选区（文件夹本身不存关键帧数据，仅作选区/显示容器）。
        if (kfGroupEdit && selectedFolder) {
            const ids = getFolderAllCubeIds(selectedFolder);
            ids.forEach(id => { const b = blocks.find(x => x.id === id); if (b) selectedBlocksSet.add(b); });
            blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
        }
        // 若之前没有选中动画单位，默认选中第一个有数据的文件夹
        if (!selectedKeyframeBlock && keyframeData.size > 0) {
            const firstUnit = getKeyframeFolderUnits()[0];
            if (firstUnit && firstUnit.repBlock) selectedKeyframeBlock = firstUnit.repBlock.id;
        }
        renderKeyframeTimeline();
        renderKeyframeDataPanel();
        updateKfEditUnitLabel();
        renderSideBlockList();
        kfSyncLegacyReadOnlyUI();   // ★ 旧操作模式：隐藏全部编辑类控件，仅留播放
        return;
    }

    keyframeWindowOpen = true;
    const win = document.createElement('div');
    win.className = 'keyframe-window';
    win.id = 'keyframeWindow';
    win.style.display = 'flex';
    /* 【2026-10-22 优化】420×320 → 460×360：轨道升高到 24px、工具栏按钮变多后，
       原尺寸把工具行挤成两行、轨道只剩两三行，信息很憋。 */
    const initW = Math.min(460, window.innerWidth - 24);
    const initH = Math.min(360, window.innerHeight * 0.58);
    win.style.width = initW + 'px';
    win.style.height = initH + 'px';
    /* ★★【2026-10-14 设计修复】浮动窗**不再默认停在屏幕正中**。
       旧行为 `left=(innerWidth-initW)/2, top=(innerHeight-initH)/2` 正好压住 3D 画布中央，
       而新布局下画布是全屏的、方块模型恰好渲染在正中 ⇒ 用户想拖 Gizmo 时鼠标先落在
       浮动窗的时间轴上，会把播放头拖到别处（实测 0.2s → 9.569s）并可能误录一帧。
       新策略：默认停靠左上（在顶栏之下、模型左侧留白区），中心区完全留给模型与 Gizmo；
       用户拖动后的位置记进 localStorage，下次沿用（用户自己的选择优先）。 */
    let _kwL = null, _kwT = null;
    try {
        const saved = JSON.parse(localStorage.getItem('ui_kf_win_pos') || 'null');
        if (saved && Number.isFinite(saved.l) && Number.isFinite(saved.t)) { _kwL = saved.l; _kwT = saved.t; }
    } catch (e) { }
    if (_kwL === null) {
        const topBarH = 56;
        _kwL = 12;
        _kwT = topBarH + 8;
    }
    // 贴边裁剪：保证至少有 40px 在视口内可见（与拖拽时的约束一致）
    const _minVis = 40;
    _kwL = Math.max(_minVis - initW, Math.min(_kwL, window.innerWidth - _minVis));
    _kwT = Math.max(0, Math.min(_kwT, window.innerHeight - _minVis));
    win.style.left = _kwL + 'px';
    win.style.top = _kwT + 'px';
    
    win.innerHTML = `
        <div class="keyframe-window-header" id="kfWindowHeader">
            <div class="kf-drag-grip" aria-hidden="true"></div>
            <div class="keyframe-window-controls">
                <button class="keyframe-window-btn kf-header-btn" id="kfAddBlockBtn" title="添加方块到关键帧编辑">＋ 方块</button>
                <button class="keyframe-window-btn kf-header-btn" id="kfImportBtn">导入</button>
                <button class="keyframe-window-close" id="kfCloseBtn" title="关闭">✕</button>
            </div>
        </div>
        <div class="keyframe-timeline-area" id="kfTimelineArea">
            <div class="keyframe-timeline-controls">
                <button class="keyframe-play-btn" id="kfPlayBtn" title="播放 / 停止">▶</button>
                <span class="keyframe-fps-label" id="kfTimeLabel">0.00s</span>
                <button class="kf-primary-btn" id="kfAddKeyframeBtn" title="在当前时间添加关键帧">+ 关键帧</button>
                <span class="kf-ctrl-spacer"></span>
                <span class="kf-ctrl-group">
                    <button class="kf-ctrl-btn" id="kfZoomOutBtn" title="缩小时间轴">−</button>
                    <span class="keyframe-fps-label" id="kfZoomLabel">1.0x</span>
                    <button class="kf-ctrl-btn" id="kfZoomInBtn" title="放大时间轴">+</button>
                </span>
                <span class="kf-ctrl-group">
                    <button class="kf-ctrl-btn" id="kfScrollLeftBtn" title="向左滚动">‹</button>
                    <span class="keyframe-fps-label" id="kfScrollLabel">0.0s</span>
                    <button class="kf-ctrl-btn" id="kfScrollRightBtn" title="向右滚动">›</button>
                </span>
                <button class="kf-ctrl-btn kf-msel-btn" id="kfMselBtn" title="多选锁定：开启后点方块即加选，无需按住 Ctrl（触屏/无键盘设备专用）">多选</button>
            </div>
            <div class="keyframe-timeline-container" id="kfTimelineContainer" style="display:none;">
                <div class="keyframe-timeline-ruler" id="kfRuler"></div>
                <div class="keyframe-playhead" id="kfPlayhead" style="left:0px;"></div>
                <div class="keyframe-timeline-bg" id="kfTimelineBg">
                    <div class="keyframe-duration-handle" id="kfDurationHandle" title="拖拽调整动画总时长"></div>
                </div>
            </div>
            <!-- ★【2026-10-22 用户要求】每一帧的数据表不再显示在悬浮窗中（改由侧栏「数据」按钮查看） -->
        </div>
        <div class="keyframe-resize-handle" id="kfResizeHandle"></div>
        <div class="keyframe-resize-handle-l" id="kfResizeHandleL"></div>
    `;
    
    document.body.appendChild(win);
    keyframeWindowEl = win;
    win.style.zoom = getUiZoom(); // 让关键帧窗口跟随 UI 缩放（自身缩放围绕中心，位置不变）
    
    // 拖拽
    makeKeyframeDraggable(win);
    // 调整大小
    makeKeyframeResizable(win);
    
    // 关闭
    win.querySelector('#kfCloseBtn').addEventListener('click', () => {
        /* ★【2026-10-20 用户报 bug】「新操作模式关闭动画关键帧的悬浮窗老是自动切换为编辑模式」：
           原来这里关窗后额外调了 exitKeyframeMode() ⇒ 只要处于关键帧模式，一按 ✕ 就被踢回编辑模式，
           侧栏的关键帧时间表面板随之消失（用户只想关掉浮动窗，并不想退出关键帧模式）。
           正解：与侧栏「浮动窗」按钮共用 closeKeyframeWindow() —— 只隐藏窗口，不退出关键帧模式。 */
        closeKeyframeWindow();
    });
    
    // 添加方块
    win.querySelector('#kfAddBlockBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        showKeyframeBlockSelector();
    });
    
    // 导入
    win.querySelector('#kfImportBtn').addEventListener('click', () => {
        showKeyframeImportDialog();
    });
    
    // 播放
    win.querySelector('#kfPlayBtn').addEventListener('click', () => {
        toggleKeyframePlayback();
    });
    
    // +关键帧按钮
    win.querySelector('#kfAddKeyframeBtn').addEventListener('click', () => {
        createKeyframeAtCurrentTime();
    });

    /* ★【2026-10-18 新增】多选锁定开关：无键盘/触屏设备的多选入口。
       开启后 kfIsMultiGesture 恒为 true ⇒ 画布点方块、侧栏点方块、点文件夹一律按“加选”处理。 */
    const mselBtn = win.querySelector('#kfMselBtn');
    const syncMselBtn = () => {
        if (!mselBtn) return;
        mselBtn.classList.toggle('on', kfMselLock);
        mselBtn.textContent = kfMselLock ? '多选中' : '多选';
    };
    if (mselBtn) {
        mselBtn.addEventListener('click', () => {
            kfMselLock = !kfMselLock;
            syncMselBtn();
            showToast(kfMselLock
                ? '已开启多选：点方块即加选，再点一次取消该方块；关闭本开关可恢复单选'
                : '已关闭多选：恢复单选（电脑端仍可按住 Ctrl/Shift 加选）');
        });
        syncMselBtn();
    }

    // 时间轴容器点击+拖拽（定位时间，播放头跟随）
    const container = win.querySelector('#kfTimelineContainer');
    kfSyncLegacyReadOnlyUI();   // ★ 旧操作模式：新建窗口后立即隐藏编辑类控件
    
    function scrubToClientX(clientX) {
        const rect = (document.getElementById('kfTimelineBg') || container).getBoundingClientRect();
        const pct = (clientX - rect.left) / rect.width;
        const vd = getViewDuration();
        /* ★★★【2026-10-14 P0 修复 · 用户投诉「自定义变量改一个=改全部」/ 时间块重复】
           旧实现 `keyframeCurrentTime = t`（**未量化**）⇒ 录帧时写进 `d.frames` 的键是
           原始浮点（实测 `[0.12690355329949238, 2.4111675126903553, 5.532994923857868]`），
           而 UI 用 `kfFmtTime` 显示成 `0.127s / 2.411s / 5.533s` ⇒ **显示值与真实键不一致**：
             · 用户点显示的 `5.533s` 那块，代码按 `5.533` 找不到 `5.532994923857868` 的键，
               于是 `kfSetValueAtFrame` **新建**一个 5.533 的帧 / 或落到"最近帧"逻辑上，
               结果改一处却影响别处（用户感受："改一个=改全部"）；
             · 同一个显示值可能对应多个浮点键（截图里两个 `5.344s`）。
           正解：**播放头一律量化到 1ms**（与 `kfQuantTime` / 帧键口径完全一致），
           这样「显示 = 键 = 编辑目标」三者恒等。 */
        const rawT = Math.max(0, Math.min(keyframeAnimDuration, keyframeScrollOffset + pct * vd));
        /* ★★★【2026-10-18 新增 · 用户要求「时间对齐 / 播放头自动吸附」】
           旧实现播放头是连续浮点，想给 A 建一个与 B 同一时刻的帧只能靠肉眼对齐，几乎必然差几毫秒。
           现在：先量化到 1ms，再看【所有轨道的所有关键帧时刻】里有没有落在吸附阈值内的，
           有就吸过去 —— 与剪辑软件的时间轴吸附一致；吸附以【像素】为口径（8px），
           所以无论缩放多少，手感一致。吸附只影响播放头落点，不改变任何既有帧。 */
        /* ★★【2026-10-19】吸附逻辑已抽成统一咽喉函数 kfFindSnapTime（见 timeToPct 之后），
           与「拖动关键帧本身」共用同一口径，避免两处实现漂移。不传 excludeTimes ⇒ 播放头可吸到任意帧。 */
        const _snapT = kfFindSnapTime(rawT, rect.width, null);
        const t = _snapT !== null ? _snapT : kfQuantTime(rawT);
        keyframeSnappedTime = _snapT;
        keyframeCurrentTime = t;
        updateKeyframePlayhead();
        // 【2026-09-26】拖动/滑动时间轴 = 预览该时刻的【完整】动画：走统一预览咽喉点
        //   applyKeyframePreviewAtTime（= 播放语义：整条骨骼树 + 所有拥有关键帧的方块）。
        //   旧实现只施加 selectedKeyframeBlock 这一个方块 → 多选多个方块 / 多条轨道时，
        //   拖动时间轴只有 1 个方块跟着动，看起来就是「预览只能预览一个」（用户报告根因）。
        applyKeyframePreviewAtTime(keyframeCurrentTime);
        // 组编辑保底：文件夹已被选中但尚未录帧（不在 getPlaybackBlocks 中）时，仍按整组施加一次
        if (kfGroupEdit && selectedFolder) {
            try {
                const _gUnit = getKeyframeFolderUnits().find(u => u.id === selectedFolder);
                if (_gUnit && _gUnit.isBone && boneKeyframes.has(_gUnit.id)) applyKeyframeToUnit(_gUnit, keyframeCurrentTime);
            } catch (e) {}
        }
        // ★ 拖动时间轴时同步刷新数据面板数值
        try { if (typeof updateInspectorValues === 'function') updateInspectorValues(); } catch (e) {}
        // ★【2026-10-22】「数据」视图跟随播放头刷新当前帧数值
        kfScheduleDataViewLive();
        // 自动滚动：播放头到达右侧边缘时自动往右移
        if (keyframeCurrentTime >= keyframeScrollOffset + vd * 0.92 && keyframeScrollOffset + vd < keyframeAnimDuration - 0.01) {
            const step = vd * 0.3;
            keyframeScrollOffset += step;
            clampScrollOffset();
            renderKeyframeTimeline();
        }
    }
    
    container.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.keyframe-marker-group')) return;
        /* ★★【2026-10-24 修复「轨道名旁的隐藏/锁定图标点不动，一点就自动吸附帧」】
           左侧轨道名列（方块名 + 隐藏/锁定图标）不属于时间轴：这里原本会走下面的 else 分支
           —— preventDefault + setPointerCapture + scrubToClientX ⇒ 点一下就把播放头吸附到对应时刻，
           而 pointer capture 会把随后的 click 重定向到容器 ⇒ 图标自己的 click 监听永远收不到。
           整列直接放行：图标点击 / 方块名点选（label 自己的 click）都按原逻辑生效。 */
        if (e.target.closest('.kf-track-head-item') || e.target.closest('.kf-track-head')) return;
        // 轨道行：不阻止 click，让方块选中生效；同时标记以便 pointermove 全局拖拽
        if (e.target.closest('.keyframe-track-row')) {
            // ★【2026-10-19】记录按下起点 + 清上一次的拖拽标记（每次手势从「点按」假设开始）
            kfTrackPressPoint = { x: e.clientX, y: e.clientY };
            kfTrackWasDrag = false;
            keyframeDragging = true;
            scrubToClientX(e.clientX);
            return;
        }
        kfTrackPressPoint = null;
        kfTrackWasDrag = false;
        e.preventDefault();
        keyframeDragging = true;
        container.setPointerCapture(e.pointerId);
        scrubToClientX(e.clientX);
    });
    document.addEventListener('pointermove', (e) => {
        if (!keyframeDragging) return;
        // 位移判定放到 pointerup（松手时算总位移），pointermove 只负责推进播放头 —— 不在这里设抑制标记，
        // 否则真实鼠标/触控板的轻微抖动就会把普通点按也判成拖拽、click 被吞掉（曾造成「几乎无法单选」）。
        scrubToClientX(e.clientX);
    });
    document.addEventListener('pointerup', (e) => {
        if (!keyframeDragging) return;
        keyframeDragging = false;
        keyframeSnappedTime = null;   // ★【2026-10-18】松手后取消吸附高亮，避免常亮
        /* ★【2026-10-19】松手时按「总位移」判定：超 10px 才算「拖时间轴」⇒ 置一次性标记，
           紧随的轨道行 click 消费该标记后直接返回（不再点选，多选集合得以保住）。 */
        if (kfTrackPressPoint
            && (Math.abs(e.clientX - kfTrackPressPoint.x) > 10 || Math.abs(e.clientY - kfTrackPressPoint.y) > 10)) {
            kfTrackWasDrag = true;
        }
        kfTrackPressPoint = null;
        updateKeyframePlayhead();
        try { container.releasePointerCapture(e.pointerId); } catch (ex) {}
    });
    document.addEventListener('pointercancel', (e) => {
        const wasDragging = keyframeDragging;
        keyframeDragging = false;
        kfTrackPressPoint = null;
        kfTrackWasDrag = false;
        // ★【2026-10-19 修复】拖拽被系统取消（来电/手势打断）时也要清吸附高亮，否则播放头会常亮青色「已吸附」
        if (wasDragging) { keyframeSnappedTime = null; updateKeyframePlayhead(); }
        try { container.releasePointerCapture(e.pointerId); } catch (ex) {}
    });
    // 鼠标滚轮 + 触屏双指滚动时间轴
    const kfArea = document.getElementById('kfTimelineArea');
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        // 轨道区域可纵向滚动时，滚轮优先滚动轨道（解决多方块时无法上下看轨道）
        if (e.deltaY !== 0 && kfArea && kfArea.scrollHeight > kfArea.clientHeight + 1) {
            kfArea.scrollTop += e.deltaY;
            return;
        }
        // 否则横向滚动时间轴
        const vd = getViewDuration();
        const step = vd * 0.15;
        keyframeScrollOffset += e.deltaY > 0 ? step : -step;
        clampScrollOffset();
        renderKeyframeTimeline();
    }, { passive: false });
    // 时间轴容器触屏垂直滑动也用于水平滚动
    let touchScrollData = null;
    container.addEventListener('touchstart', (e) => {
        if (e.target.closest('.keyframe-marker-group') || e.target.closest('.keyframe-duration-handle')) return;
        touchScrollData = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
    }, { passive: true });
    container.addEventListener('touchmove', (e) => {
        if (!touchScrollData || e.touches.length > 1) return;
        if (e.target.closest('.keyframe-marker-group') || e.target.closest('.keyframe-duration-handle')) return;
        const dx = touchScrollData.startX - e.touches[0].clientX;
        const dy = Math.abs(touchScrollData.startY - e.touches[0].clientY);
        // 水平滑动距离大于垂直滑动距离时才触发滚动
        if (Math.abs(dx) > 5 && Math.abs(dx) > dy) {
            e.preventDefault();
            const vd = getViewDuration();
            const step = vd * 0.05 * (dx > 0 ? 1 : -1);
            keyframeScrollOffset += step;
            clampScrollOffset();
            renderKeyframeTimeline();
            touchScrollData.startX = e.touches[0].clientX;
            touchScrollData.startY = e.touches[0].clientY;
        }
    }, { passive: false });
    container.addEventListener('touchend', () => { touchScrollData = null; });
    container.addEventListener('touchcancel', () => { touchScrollData = null; });

    // 标尺第一行：独占区域，支持鼠标拖拽和触摸滑动滚动显示区间
    const rulerEl = win.querySelector('#kfRuler');
    let rulerTouchData = null;
    rulerEl.addEventListener('touchstart', (e) => {
        e.stopPropagation(); // 阻止冒泡到容器，避免触发播放头 scrub
        if (e.touches.length === 2) {
            // 双指缩放：记录初始距离和初始缩放
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            rulerTouchData = {
                mode: 'pinch',
                startDist: Math.hypot(dx, dy),
                startZoom: keyframeZoom,
            };
            e.preventDefault();
        } else if (e.touches.length === 1) {
            // 单指拖拽滚动
            rulerTouchData = {
                mode: 'pan',
                startX: e.touches[0].clientX,
                startY: e.touches[0].clientY,
                startScroll: keyframeScrollOffset,
                moved: false,
            };
        }
    }, { passive: false });
    rulerEl.addEventListener('touchmove', (e) => {
        if (!rulerTouchData) return;
        if (rulerTouchData.mode === 'pinch' && e.touches.length === 2) {
            // 双指缩放
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const ratio = dist / rulerTouchData.startDist;
            keyframeZoom = Math.max(1, Math.min(100, rulerTouchData.startZoom * ratio));
            const vd = getViewDuration();
            keyframeScrollOffset = keyframeCurrentTime - vd / 2;
            clampScrollOffset();
            renderKeyframeTimeline();
            e.preventDefault();
        } else if (rulerTouchData.mode === 'pan' && e.touches.length === 1) {
            const dx = rulerTouchData.startX - e.touches[0].clientX;
            const dy = Math.abs(rulerTouchData.startY - e.touches[0].clientY);
            // 水平滑动大于垂直才触发滚动
            if (Math.abs(dx) > 3 && Math.abs(dx) > dy) {
                rulerTouchData.moved = true;
                e.preventDefault();
                const vd = getViewDuration();
                const rect = rulerEl.getBoundingClientRect();
                const step = (dx / rect.width) * vd;
                keyframeScrollOffset = rulerTouchData.startScroll + step;
                clampScrollOffset();
                renderKeyframeTimeline();
            }
        }
    }, { passive: false });
    rulerEl.addEventListener('touchend', (e) => {
        if (rulerTouchData && rulerTouchData.mode === 'pan' && !rulerTouchData.moved) {
            // 单指点击标尺：定位播放头到该时间点
            scrubToClientX(e.changedTouches[0].clientX);
        }
        rulerTouchData = null;
    });
    rulerEl.addEventListener('touchcancel', () => { rulerTouchData = null; });

    // 电脑端：标尺鼠标拖拽滚动
    let rulerMouseDrag = null;
    rulerEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation(); // 阻止冒泡到容器，标尺专管滚动不 scrub
        rulerMouseDrag = { startX: e.clientX, startScroll: keyframeScrollOffset, moved: false };
    });
    document.addEventListener('pointermove', (e) => {
        if (!rulerMouseDrag) return;
        const dx = e.clientX - rulerMouseDrag.startX;
        if (Math.abs(dx) > 3) {
            rulerMouseDrag.moved = true;
            const vd = getViewDuration();
            const rect = rulerEl.getBoundingClientRect();
            const step = (dx / rect.width) * vd;
            keyframeScrollOffset = rulerMouseDrag.startScroll - step;
            clampScrollOffset();
            renderKeyframeTimeline();
        }
    });
    document.addEventListener('pointerup', (e) => {
        if (rulerMouseDrag && !rulerMouseDrag.moved) {
            // 点击标尺（未拖拽）：定位播放头
            scrubToClientX(e.clientX);
        }
        rulerMouseDrag = null;
    });

    // 标尺区域 Ctrl+滚轮缩放
    rulerEl.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                keyframeZoom = Math.min(100, keyframeZoom * 1.2);
            } else {
                keyframeZoom = Math.max(1, keyframeZoom / 1.2);
            }
            const newVd = getViewDuration();
            keyframeScrollOffset = keyframeCurrentTime - newVd / 2;
            clampScrollOffset();
            renderKeyframeTimeline();
        }
    }, { passive: false });
    // 时间轴容器双击
    /* ★★★【2026-10-14 用户投诉修复 · 「总是不小心创建了关键帧」】
       用户原话：「总是不小心创建了关键帧，为什么拖动时间轴有时会创建关键帧呢？」
       根因：这里原本 `dblclick → createKeyframeAtCurrentTime()`。而**拖动播放头**（pointerdown+move+up）
       之后紧接着再点一下时间轴，两次 pointerdown 间隔常落在系统双击阈值内 ⇒ 被浏览器判为 dblclick
       ⇒ **凭空多出一个关键帧**（用户完全没意识到自己"创建"了什么）。
       正解：双击只**定位播放头**（+预览该时刻），**绝不创建关键帧**。
       创建关键帧一律走显式入口：「+关键帧」按钮（浮动窗 / 侧栏时间表各一个）。
       这与用户「职责清晰」的诉求一致：拖动=看，按钮=录。 */
    container.addEventListener('dblclick', (e) => {
        if (e.target.closest('.keyframe-marker-group')) return;
        if (kfLegacyReadOnly()) return;
        const rect = container.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const vd = getViewDuration();
        keyframeCurrentTime = kfQuantTime(Math.max(0, Math.min(keyframeAnimDuration, keyframeScrollOffset + pct * vd)));
        updateKeyframePlayhead();
        applyKeyframePreviewAtTime(keyframeCurrentTime);
        if (typeof showToast === 'function') showToast('已定位到 ' + parseFloat(keyframeCurrentTime.toFixed(2)) + 's（创建关键帧请点「+关键帧」）');
    });
    
    // 缩放按钮
    function clampScrollOffset() {
        const vd = getViewDuration();
        const maxOff = Math.max(0, keyframeAnimDuration - vd);
        if (keyframeScrollOffset > maxOff) keyframeScrollOffset = maxOff;
        if (keyframeScrollOffset < 0) keyframeScrollOffset = 0;
    }
    win.querySelector('#kfZoomInBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        keyframeZoom = Math.min(100, keyframeZoom * 2);
        const vd = getViewDuration();
        keyframeScrollOffset = keyframeCurrentTime - vd / 2;
        clampScrollOffset();
        renderKeyframeTimeline();
    });
    win.querySelector('#kfZoomOutBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        keyframeZoom = Math.max(1, keyframeZoom / 2);
        clampScrollOffset();
        renderKeyframeTimeline();
    });
    
    // 紫色时长拖曳条
    const durHandle = win.querySelector('#kfDurationHandle');
    let durDragData = null;
    durHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (kfLegacyReadOnly()) return;   // ★ 旧操作模式只读：不改总时长
        durDragData = { startX: e.clientX, startDur: keyframeAnimDuration };
        durHandle.setPointerCapture(e.pointerId);
        durHandle.style.opacity = '1';
    });
    durHandle.addEventListener('pointermove', (e) => {
        if (!durDragData) return;
        const dx = e.clientX - durDragData.startX;
        // 每拖拽 3px 对应增减 1s，最小 1s，最大 300s
        const delta = dx / 3;
        const newDur = Math.max(1, Math.min(300, Math.round(durDragData.startDur + delta)));
        const oldDur = keyframeAnimDuration;
        if (newDur !== oldDur) {
            keyframeAnimDuration = newDur;
            if (keyframeCurrentTime > keyframeAnimDuration) keyframeCurrentTime = keyframeAnimDuration;
            // 增加时长时让视图跟随，使新增的时间段显示出来
            const vd = getViewDuration();
            if (newDur > oldDur) {
                keyframeScrollOffset = newDur - vd;
            }
            clampScrollOffset();
            renderKeyframeTimeline();
            updateKeyframePlayhead();
        }
    });
    durHandle.addEventListener('pointerup', (e) => {
        if (!durDragData) return;
        durHandle.releasePointerCapture(e.pointerId);
        durHandle.style.opacity = '0.6';
        if (keyframeAnimDuration !== durDragData.startDur) recordAction();
        durDragData = null;
    });
    durHandle.addEventListener('pointercancel', () => {
        durHandle.style.opacity = '0.6';
        durDragData = null;
    });
    
    // 滚动按钮
    function scrollTimeline(dir) {
        const vd = getViewDuration();
        const step = vd * 0.3; // 每次滚动可见窗口的30%
        keyframeScrollOffset += dir * step;
        clampScrollOffset();
        renderKeyframeTimeline();
    }
    win.querySelector('#kfScrollLeftBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        scrollTimeline(-1);
    });
    win.querySelector('#kfScrollRightBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        scrollTimeline(1);
    });
    
    // 首次创建窗口后：为已有的关键帧数据初始化默认选中单位
    if (!selectedKeyframeBlock && keyframeData.size > 0) {
        const firstUnit = getKeyframeFolderUnits()[0];
        if (firstUnit && firstUnit.repBlock) selectedKeyframeBlock = firstUnit.repBlock.id;
    }
    renderKeyframeTimeline();
    renderKeyframeDataPanel();
    updateKfEditUnitLabel();
    clearNonKeyframeSelection();
    renderSideBlockList();

    /* 宽度变化（拖拽改宽 / 旋转屏幕 / 浏览器缩放）后重算刻度与棋盘网格，
       否则播放头的像素位置会停在旧宽度上，与刻度错位。只监听宽度，避免高度变化自激。 */
    if (!win.__kfWidthRO) {
        let lastW = win.offsetWidth;
        win.__kfWidthRO = new ResizeObserver(() => {
            const w = win.offsetWidth;
            if (Math.abs(w - lastW) < 1) return;
            lastW = w;
            try { renderKeyframeTimeline(); } catch (e) { }
        });
        win.__kfWidthRO.observe(win);
    }
}

function makeKeyframeDraggable(win) {
    const header = win.querySelector('#kfWindowHeader');
    let isDragging = false, startX, startY, startLeft, startTop;
    
    header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(win.style.left);
        startTop = parseInt(win.style.top);
        win.style.transition = 'none';
        document.addEventListener('pointermove', onDrag);
        document.addEventListener('pointerup', onDragEnd);
    });
    
    function onDrag(e) {
        if (!isDragging) return;
        e.preventDefault();
        const z = getUiZoom();
        let newLeft = startLeft + (e.clientX - startX) / z;
        let newTop = startTop + (e.clientY - startY) / z;
        const winW = win.offsetWidth;
        const winH = win.offsetHeight;
        const minVisible = 40;
        newLeft = Math.max(minVisible - winW, Math.min(newLeft, window.innerWidth - minVisible));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - minVisible));
        win.style.left = newLeft + 'px';
        win.style.top = newTop + 'px';
    }
    
    function onDragEnd() {
        isDragging = false;
        document.removeEventListener('pointermove', onDrag);
        document.removeEventListener('pointerup', onDragEnd);
        // ★【2026-10-14】记住用户自己摆的位置，下次打开沿用（尊重用户选择优先于默认停靠）
        try { localStorage.setItem('ui_kf_win_pos', JSON.stringify({ l: parseInt(win.style.left) || 0, t: parseInt(win.style.top) || 0 })); } catch (e) { }
    }
}

function makeKeyframeResizable(win) {
    function setupResize(handleId, fromLeft) {
        const handle = win.querySelector('#' + handleId);
        if (!handle) return;
        let isResizing = false, startX, startY, startW, startH, startL;
        handle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startW = win.offsetWidth;
            startH = win.offsetHeight;
            startL = parseInt(win.style.left) || 0;
            win.style.transition = 'none';
            document.addEventListener('pointermove', onResize);
            document.addEventListener('pointerup', onResizeEnd);
        });
        function onResize(e) {
            if (!isResizing) return;
            e.preventDefault();
            const z = getUiZoom();
            const dx = (e.clientX - startX) / z;
            const dy = (e.clientY - startY) / z;
            const newW = Math.max(280, fromLeft ? startW - dx : startW + dx);
            const newH = Math.max(180, startH + dy);
            win.style.width = newW + 'px';
            win.style.height = newH + 'px';
            if (fromLeft) {
                win.style.left = (startL + startW - newW) + 'px';
            }
        }
        function onResizeEnd() {
            isResizing = false;
            document.removeEventListener('pointermove', onResize);
            document.removeEventListener('pointerup', onResizeEnd);
            // 窗口宽度变化后重算棋盘网格与刻度，避免网格被拉伸变形
            try { renderKeyframeTimeline(); } catch (e) { }
        }
    }
    setupResize('kfResizeHandle', false);
    setupResize('kfResizeHandleL', true);
}

// 初始化方块的关键帧数据
function initKeyframeForBlock(blockId) {
    if (!keyframeData.has(blockId)) {
        keyframeData.set(blockId, { frames: new Map(), animId: getKeyframeAnimId(blockId) });
    }
}

// 渲染关键帧窗口的方块选择器（按文件夹分组，不再平铺散件）
function renderKeyframeBlockSelector() {
    const selector = document.getElementById('kfBlockSelector');
    if (!selector) return;
    selector.innerHTML = '';

    // 按文件夹分组
    const grouped = {};
    const ungrouped = [];
    for (const [blockId] of keyframeData) {
        const b = blocks.find(bl => bl.id === blockId);
        if (!b) continue;
        if (b.group && getFolder(b.group)) {
            if (!grouped[b.group]) grouped[b.group] = [];
            grouped[b.group].push(b);
        } else {
            ungrouped.push(b);
        }
    }

    const renderFolderRow = (folderName, depth) => {
        const folder = getFolder(folderName);
        if (!folder) return;
        const folderBlocks = grouped[folderName] || [];
        const childFolders = getChildFolders(folderName);
        const expanded = folder.expanded !== false;

        const row = document.createElement('div');
        const isActiveFolder = selectedFolder === folderName ||
            (selectedFolder === null && selectedKeyframeBlock && folderBlocks.some(b => b.id === selectedKeyframeBlock));
        row.className = 'kf-folder-row' + (isActiveFolder ? ' active' : '');
        row.style.paddingLeft = (4 + depth * 12) + 'px';
        row.innerHTML = childFolders.length > 0
            ? `<span class="kf-folder-row-toggle ${expanded ? '' : 'collapsed'}"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg></span>
               <svg class="kf-folder-row-icon" width="14" height="14" viewBox="0 0 24 24" fill="#7dd3fc"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
               <span class="kf-folder-row-name">${escapeHtml(folder.name)}</span>
               <span class="kf-folder-row-count">${folderBlocks.length}</span>
               <span class="kf-folder-row-remove" data-remove-folder="${escapeHtml(folder.name)}">✕</span>`
            : `<span class="kf-folder-row-placeholder"></span>
               <svg class="kf-folder-row-icon" width="14" height="14" viewBox="0 0 24 24" fill="#7dd3fc"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
               <span class="kf-folder-row-name">${escapeHtml(folder.name)}</span>
               <span class="kf-folder-row-count">${folderBlocks.length}</span>
               <span class="kf-folder-row-remove" data-remove-folder="${escapeHtml(folder.name)}">✕</span>`;

        row.addEventListener('click', (e) => {
            if (e.target.closest('.kf-folder-row-remove')) return;
            if (e.target.closest('.kf-folder-row-toggle')) {
                folder.expanded = !folder.expanded;
                renderKeyframeBlockSelector();
                return;
            }
            // 选中该文件夹：以组内第一个含关键帧的方块作代表进入组编辑
            const unit = getFolderAllCubeIds(folderName).map(id => blocks.find(bl => bl.id === id)).filter(Boolean);
            const rep = unit.find(b => keyframeData.has(b.id)) || folderBlocks[0] || unit[0];
            if (rep) selectKeyframeBlock(rep.id, false, false);
        });

        row.querySelector('.kf-folder-row-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            const toRemove = [...folderBlocks.map(b => b.id)];
            toRemove.forEach(id => removeKeyframeBlock(id));
            // 骨级关键帧：删除该文件夹及其所有子孙文件夹的骨级关键帧
            boneKeyframes.delete(folderName);
            getDescendantFolderNames(folderName).forEach(dn => boneKeyframes.delete(dn));
            kfAddedFolders.delete(folderName);
            renderKeyframeTimeline();
            renderKeyframeDataPanel();
        });

        selector.appendChild(row);

        if (expanded) {
            childFolders.forEach(cf => renderFolderRow(cf.name, depth + 1));
        }
    };

    getRootFolders().forEach(f => renderFolderRow(f.name, 0));

    // 未分组方块
    if (ungrouped.length > 0) {
        const row = document.createElement('div');
        const hasActiveUngrouped = selectedFolder === null && ungrouped.some(b => selectedKeyframeBlock === b.id);
        row.className = 'kf-folder-row' + (hasActiveUngrouped ? ' active' : '');
        row.innerHTML = `<span class="kf-folder-row-placeholder"></span>
            <svg class="kf-folder-row-icon" width="14" height="14" viewBox="0 0 24 24" fill="#94a3b8"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>
            <span class="kf-folder-row-name">未分组方块</span>
            <span class="kf-folder-row-count">${ungrouped.length}</span>`;
        row.addEventListener('click', () => {
            if (ungrouped.length > 0) selectKeyframeBlock(ungrouped[0].id, false, true);
        });
        selector.appendChild(row);
    }
}

// 添加方块后刷新时间轴（已改为按文件夹轨道显示，不再保留顶部选择器）
function addKeyframeBlockTag(blockId) {
    renderKeyframeTimeline();
}

// 选中关键帧方块（同时联动 3D 视图中的选中）
// 返回关键帧动画的「变换单位」方块集合：
// 若方块属于骨骼（文件夹），则返回该骨骼下所有子方块（含嵌套），实现“以骨骼为单位变换”；
// 否则返回该方块本身。
function getKeyframeUnitForBlock(blockId) {
    const b = blocks.find(x => x.id === blockId);
    if (!b || !b.group) return b ? [b] : [];
    const f = getFolder(b.group);
    if (!f) return [b];
    return getFolderAllCubeIds(b.group).map(id => blocks.find(x => x.id === id)).filter(Boolean);
}

function selectKeyframeBlock(blockId, keepMulti, forceBlock) {
    selectedKeyframeBlock = blockId;
    // 更新文件夹列表高亮
    renderKeyframeBlockSelector();
    renderKeyframeTimeline();
    renderKeyframeDataPanel();
    // 联动：在 3D 视图中也选中该方块（但不破坏已有的多选）
    const block = blocks.find(b => b.id === blockId);
    if (block && !keepMulti) {
        // 选中骨骼内的方块时，默认把动画选区扩展为整个骨骼组（组编辑，文件夹 Gizmo）。
        // forceBlock=true（3D 直接点方块 / 点时间轴或标签栏的方块）时改为单体编辑。
        /* ★【2026-10-18 修复「多选选中了却没被记录帧」- 根因 1】
           旧实现 forceBlock 只影响 Gizmo（selectBlock 单体），却仍把【整文件夹单位】灌进
           selectedBlocksSet ⇒「侧栏/面板里高亮成组的方块」≠「实际会录帧的方块」，
           用户单击一个方块后 Ctrl 加选别的方块时，视觉上“选中了”的块会被随后的一次 Ctrl 点击
           从选区里挤掉，表现为「先单击选中它、再 Ctrl 选取，它就录不到帧」。
           正解：forceBlock 时选区就只放这一块 —— 面板高亮的集合必须恒等于会录帧的集合。 */
        const unit = forceBlock ? [block] : getKeyframeUnitForBlock(blockId);
        selectedBlocksSet.clear();
        /* 选区被“文件夹单位”自动扩展 ⇒ 组内其他成员不算亲手点选（Ctrl 点它们只作“加选/确认”，不会误剔除）；
           但【被点的那一块】始终记为亲手点选 —— 这样「Ctrl/双击再点它一次」仍能把它剔除，
           给用户保留“把整组选区缩小到子集”的可达路径（否则只能扩大不能缩小）。 */
        kfExplicitPickIds.clear(); kfExplicitPickIds.add(block.id);
        unit.forEach(u => selectedBlocksSet.add(u));
        const isFolderBlock = block.group && getFolder(block.group);
        if (isFolderBlock && !forceBlock) {
            // 组编辑：保持文件夹选中 → 文件夹 Gizmo（无缩放、世界轴旋转/位移）
            selectedFolder = block.group;
            selectedBlock = null;
            kfGroupEdit = true;
            blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
            requestGizmoRefresh();
            updateToolbar(true);
            if (isNewLayoutMode) renderSideBlockList();
        } else {
            selectedFolder = null;
            selectBlock(block);
            kfGroupEdit = false;
        }
    } else if (block && keepMulti) {
        /* ★【2026-10-18 修复「多选选中了却没被记录帧」- 根因 2】
           旧实现 keepMulti 分支是【空操作】：Ctrl+点击方块列表只改了 selectedKeyframeBlock，
           完全没碰 selectedBlocksSet ⇒ 面板/侧栏能看到的“多选选中”与「+关键帧」实际写入的集合脱节：
           先单击 A、再 Ctrl 选 B/C，录帧时只有 A 被写入，B/C 永远缺帧。
           正解：选区增删的唯一真相源是 toggleBlockSelection（调用方 applySideSelect 已先调用它），
           这里只同步「当前编辑块」指针并重绘面板；绝不能再动 selectedBlocksSet ——
           否则同一手势会被“加一次又删一次”互相抵消，反而更糟。 */
        renderKeyframeBlockSelector();
        renderKeyframeTimeline();
        renderKeyframeDataPanel();
    }
    updateKfEditUnitLabel();
}

// 移除方块的关键帧
function removeKeyframeBlock(blockId) {
    keyframeData.delete(blockId);
    // 【Molang 模式同步】方块关键帧被清空时，若在 Molang 模式则回退为普通基线 Molang 程序
    const block = blocks.find(b => b.id === blockId);
    if (block && block.scope.molangMode) {
        block.scope.program = generateMolangBaseline(block);
        block.refresh();
    }
    renderKeyframeBlockSelector();
    if (selectedKeyframeBlock === blockId) {
        // 选中的方块被移除后，尝试转移到同文件夹其他方块；否则选第一个剩余
        const nextSameGroup = block && block.group
            ? Array.from(keyframeData.keys()).find(id => {
                  const b = blocks.find(bl => bl.id === id);
                  return b && b.group === block.group;
              })
            : null;
        const anyRemaining = keyframeData.size > 0 ? Array.from(keyframeData.keys())[0] : null;
        if (nextSameGroup) {
            selectKeyframeBlock(nextSameGroup, false, false);
        } else if (anyRemaining) {
            const nb = blocks.find(bl => bl.id === anyRemaining);
            selectKeyframeBlock(anyRemaining, false, nb && nb.group && getFolder(nb.group) ? false : true);
        } else {
            selectedKeyframeBlock = null;
            renderKeyframeTimeline();
            renderKeyframeDataPanel();
        }
    } else {
        // 非选中方块被删除时也需要刷新时间轴
        renderKeyframeTimeline();
        renderKeyframeDataPanel();
    }
}

// 显示方块选择器（按文件夹分组）
function showKeyframeBlockSelector() {
    // ★【2026-10-13】旧操作模式只读：不允许把方块加入/移出动画列表
    if (kfBlockLegacyEdit('增删动画方块，')) return;
    const existing = document.querySelector('.keyframe-block-picker');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'keyframe-import-modal';
    overlay.style.zIndex = '700';

    // 按文件夹分组
    const grouped = {};
    const ungrouped = [];
    blocks.forEach(b => {
        // ★ Molang 编辑模式方块允许加入动画列表（蹭 q.anim_time 播放时钟），只是不能创建关键帧
        if (b.group && getFolder(b.group)) {
            if (!grouped[b.group]) grouped[b.group] = [];
            grouped[b.group].push(b);
        } else {
            ungrouped.push(b);
        }
    });

    let html = `<div class="keyframe-import-content">
        <div class="keyframe-import-title">选择要添加的方块</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">按文件夹（骨骼）分组；点击文件夹名可折叠。★ 点击方块标签 = <b>勾选</b>（可多选，支持批量），再点右下角「加入所选」一次性加入动画列表；点「+全部」可批量添加整个文件夹。</div>
        <div class="kf-picker-body">`;

    // 递归渲染文件夹树
    const renderFolder = (folderName) => {
        const folder = getFolder(folderName);
        if (!folder) return;
        const folderBlocks = grouped[folderName] || [];
        const childFolders = getChildFolders(folderName);
        const expanded = folder.expanded !== false;

        // 统计本文件夹及其后代中所有方块，判断「全部已添加」
        const allUnderFolder = [];
        const collectBlocks = (name) => {
            const f = getFolder(name);
            if (!f) return;
            (grouped[name] || []).forEach(b => allUnderFolder.push(b));
            getChildFolders(name).forEach(cf => collectBlocks(cf.name));
        };
        collectBlocks(folderName);
        const allAdded = allUnderFolder.length > 0 && (allUnderFolder.every(b => keyframeData.has(b.id)) || kfAddedFolders.has(folderName));
        const hasAny = allUnderFolder.length > 0;

        html += `<div class="kf-folder-section">
            <div class="kf-folder-header" data-folder-header="${escapeHtml(folder.name)}">
                <span class="kf-folder-toggle ${expanded ? '' : 'collapsed'}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
                </span>
                <span class="kf-folder-name" title="${escapeHtml(folder.name)}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#7dd3fc"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                    ${escapeHtml(folder.name)}
                </span>
                <button type="button" class="kf-folder-addall" data-add-folder="${escapeHtml(folder.name)}" ${allAdded || !hasAny ? 'disabled' : ''}>
                    ${allAdded ? '已全添加' : '+全部'}
                </button>
            </div>
            <div class="kf-folder-content ${expanded ? '' : 'collapsed'}">`;

        if (folderBlocks.length === 0 && childFolders.length === 0) {
            html += `<div class="kf-folder-empty">暂无方块</div>`;
        } else {
            folderBlocks.forEach(b => {
                const has = keyframeData.has(b.id);
                html += `<div class="keyframe-block-tag" data-pick-block="${b.id}" style="${has ? 'opacity:0.5;pointer-events:none;' : ''}">
                    ${b.id} ${has ? '(已添加)' : ''}
                </div>`;
            });
            childFolders.forEach(cf => renderFolder(cf.name));
        }
        html += `</div></div>`;
    };

    getRootFolders().forEach(f => renderFolder(f.name));

    // 未分组方块
    if (ungrouped.length > 0) {
        html += `<div class="kf-picker-ungrouped-title">未分组方块</div>
            <div class="kf-picker-ungrouped-list">`;
        ungrouped.forEach(b => {
            const has = keyframeData.has(b.id);
            html += `<div class="keyframe-block-tag" data-pick-block="${b.id}" style="${has ? 'opacity:0.5;pointer-events:none;' : ''}">
                ${b.id} ${has ? '(已添加)' : ''}
            </div>`;
        });
        html += `</div>`;
    }

    html += `</div>
        <div class="kf-picker-foot">
            <span class="kf-picker-count" id="kfPickCount">已勾选 0 个方块</span>
            <button class="keyframe-window-btn" id="kfPickerMarkAll">全选未添加</button>
            <button class="keyframe-window-btn" id="kfPickerClearMark">清空勾选</button>
            <button class="kf-primary-btn" id="kfPickerAddPicked">加入所选</button>
            <button class="keyframe-window-btn" id="kfPickerClose">关闭</button>
        </div></div>`;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    // ===== 多选勾选辅助：标记态与计数（❒ 选择器批量加入的入口）=====
    const markedEls = () => Array.from(overlay.querySelectorAll('[data-pick-block].kf-pick-marked'));
    const syncPickCount = () => {
        const c = overlay.querySelector('#kfPickCount');
        if (c) c.textContent = '已勾选 ' + markedEls().length + ' 个方块';
    };
    const markAll = () => {
        overlay.querySelectorAll('[data-pick-block]').forEach(el => {
            // 已添加的条目本身 pointer-events:none 且带 opacity，不参与勾选
            if (!keyframeData.has(el.dataset.pickBlock)) el.classList.add('kf-pick-marked');
        });
        syncPickCount();
    };
    const clearMark = () => { markedEls().forEach(el => el.classList.remove('kf-pick-marked')); syncPickCount(); };

    // 单个方块点击 = 勾选/取消勾选（不再“点一下就关窗”）
    overlay.querySelectorAll('[data-pick-block]').forEach(el => {
        el.addEventListener('click', () => {
            const bid = el.dataset.pickBlock;
            if (keyframeData.has(bid)) return;   // 已添加的不可再勾选
            el.classList.toggle('kf-pick-marked');
            syncPickCount();
        });
    });

    // 「加入所选」：把勾选的方块一次性批量加入动画列表，并把它们整体装进动画选区
    overlay.querySelector('#kfPickerAddPicked').addEventListener('click', () => {
        const picked = markedEls().map(el => el.dataset.pickBlock).filter(bid => !keyframeData.has(bid));
        if (picked.length === 0) { showToast('请先点击方块标签勾选要加入的方块'); return; }
        picked.forEach(bid => { initKeyframeForBlock(bid); addKeyframeBlockTag(bid); });
        // 批量加入后把这些方块【整体】设为动画选区（多选），随即就能对整批「+关键帧」/编辑
        const bs = picked.map(id => blocks.find(b => b.id === id)).filter(Boolean);
        if (bs.length) {
            selectedBlocksSet.clear();
            kfExplicitPickIds.clear();
            bs.forEach(b => { selectedBlocksSet.add(b); kfExplicitPickIds.add(b.id); });
            selectedFolder = null;
            kfGroupEdit = false;
            selectedKeyframeBlock = bs[0].id;
            selectBlock(bs[0]);
            blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
            requestGizmoRefresh();
            updateToolbar(true);
        }
        overlay.remove();
        if (isNewLayoutMode) renderSideBlockList();
        kfRefreshAllPanels();
        /* 变量自动纳入：只对第一个方块走 kfOnBlockAddedToAnimation（它会弹一次 toast），
           其余方块在录制时由 recordKeyframeForBlock 的 autoWired 通道自动纳入同口径变量，
           避免批量加入时弹出 N 条重复提示。 */
        const first = picked[0];
        setTimeout(() => { try { kfOnBlockAddedToAnimation(first); } catch (e) { } }, 60);
        if (picked.length > 1) showToast('已把 ' + picked.length + ' 个方块加入动画列表（已整体选中，可直接「+关键帧」批量录制）');
    });
    overlay.querySelector('#kfPickerMarkAll').addEventListener('click', markAll);
    overlay.querySelector('#kfPickerClearMark').addEventListener('click', clearMark);

    // 文件夹折叠/展开
    overlay.querySelectorAll('[data-folder-header]').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.kf-folder-addall')) return;
            const name = header.dataset.folderHeader;
            const folder = getFolder(name);
            if (!folder) return;
            folder.expanded = !folder.expanded;
            const content = header.nextElementSibling;
            const toggle = header.querySelector('.kf-folder-toggle');
            if (folder.expanded) {
                content.classList.remove('collapsed');
                toggle.classList.remove('collapsed');
            } else {
                content.classList.add('collapsed');
                toggle.classList.add('collapsed');
            }
        });
    });

    // 批量添加整个文件夹
    overlay.querySelectorAll('[data-add-folder]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const folderName = btn.dataset.addFolder;
            const allIds = getFolderAllCubeIds(folderName);   // Molang 编辑模式方块也加入动画列表（不建帧，只蹭时钟）
            if (isKeyframeMode) {
                // 骨骼（文件夹）以【骨级】方式加入关键帧：进入组编辑，
                // 录制走 recordBoneKeyframe（整条骨骼刚体施加），其方块不落 keyframeData。
                if (allIds.length > 0) {
                    kfAddedFolders.add(folderName);
                    selectFolder(folderName); // 关键帧模式：装入选区 + kfGroupEdit=true
                }
            } else {
                const toAdd = allIds.filter(id => !keyframeData.has(id));
                toAdd.forEach(bid => initKeyframeForBlock(bid));
                if (toAdd.length > 0) {
                    renderKeyframeBlockSelector();
                    const repId = toAdd.find(id => { const b = blocks.find(x => x.id === id); return b && b.group === folderName; }) || toAdd[0];
                    if (repId) selectKeyframeBlock(repId, false, false);
                }
            }
            overlay.remove();
            if (isNewLayoutMode) renderSideBlockList();
        });
    });

    overlay.querySelector('#kfPickerClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

/* ★★★【2026-10-17 修复 · 用户投诉「老是会自动添加方块进入关键帧」】
   清除历史遗留的「幽灵条目」：只有空壳、既无帧、也无变量、也无表达式
   （来源 = 旧版「关键帧模式下点选方块 / 渲染时间表」时静默 kfData(id,true) 建的空条目）。
   ★必须在【进入关键帧模式 / 打开关键帧窗口】这个"干净时刻"清除，**绝不能**放在每次时间轴渲染里——
     否则会误删「刚经 ❒ 选择器加入、变量还要等 ~60ms 才由 kfOnBlockAddedToAnimation 补上」的方块，
     表现为用户投诉的「加了两个方块却只显示一条轨道」。
   真正有效的条目必然有「帧 / 变量 / 表达式」之一，绝不会被误删。 */
function kfPurgePhantomEntries() {
    for (const [bid, d] of keyframeData) {
        const noFrames = !(d.frames instanceof Map) || d.frames.size === 0;
        const noVars = !(d.vars instanceof Set) || d.vars.size === 0;
        const noExprs = !(d.exprs instanceof Map) || d.exprs.size === 0;
        if (noFrames && noVars && noExprs) { keyframeData.delete(bid); continue; }
        /* ★【2026-10-18 r18】清掉「v1 裸名脚手架」的历史污染（v.Txrot / v.start_xrot …）：
           这些名字早期版本被误写进 d.vars，现被规则③永久锁成用户量 ⇒ 数据表冒出一排 -1。
           判据是结构性的（见 kfIsLegacyScaffoldTwin）：仅当程序里有同名命名空间孪生时才清。 */
        try {
            const _blk = blocks.find(b => b.id === bid);
            const _prog = _blk && _blk.scope ? _blk.scope.program : '';
            if (_prog) {
                const _kill = (n) => kfIsLegacyScaffoldTwin(n, bid, _prog);
                if (d.vars instanceof Set) for (const n of Array.from(d.vars)) if (_kill(n)) d.vars.delete(n);
                if (d.frames instanceof Map) for (const [, m] of d.frames) if (m instanceof Map) for (const n of Array.from(m.keys())) if (_kill(n)) m.delete(n);
                if (d.exprs instanceof Map) for (const [, m] of d.exprs) if (m instanceof Map) for (const n of Array.from(m.keys())) if (_kill(n)) m.delete(n);
            }
        } catch (e) { }
    }
}

// 获取关键帧「轨道单位」：每个方块一条逐块轨道（文件夹不再参与）
function getKeyframeFolderUnits() {
    // 【2026-10-19 · 关键帧去文件夹化】时间轴只显示【真实方块】的逐块轨道：
    //   文件夹不再是轨道单位（不聚合、不生成骨级轨道）；紫色加号 ✛ 显式绑定的子骨骼
    //   也一律保留自己的逐块轨道（可独立设关键帧）。
    const ungrouped = [];
    for (const blockId of keyframeData.keys()) {
        const block = blocks.find(b => b.id === blockId);
        if (!block) continue;
        ungrouped.push(block);
    }
    const units = [];
    // 每个方块单独一条轨道，标签用方块自身 id（即名称），不再汇总成“未分组方块”
    ungrouped.forEach(b => {
        const times = new Set();
        const kf = keyframeData.get(b.id);
        if (kf && kf.frames) kf.frames.forEach((_, t) => times.add(t));
        units.push({
            id: null,
            label: b.id,
            blocks: [b],
            repBlock: b,
            times
        });
    });
    // 【2026-10-19 · 关键帧去文件夹化】原「骨级关键帧轨道」与「骨级加入的文件夹轨道」及
    //   「整组编辑态空轨道」「按加入顺序重排」四段已整体删除：
    //   文件夹不再生成任何轨道，时间轴只保留真实方块的逐块轨道，顺序即加入顺序。
    return units;
}

// 对某个轨道单位应用指定时间的关键帧（单位 = 单个真实方块）
function applyKeyframeToUnit(unit, time) {
    if (!unit) return;
    // 【2026-10-19 · 关键帧去文件夹化】原「先施加整条骨骼树 + 文件夹骨级刚体」逻辑已删除：
    //   单位不再有文件夹，直接把该方块的逐块关键帧施加到 time 时刻即可。
    unit.blocks.forEach(b => applyKeyframeToBlock(b.id, time));
}

// 【2026-09-26】把「某一时刻」的【完整】动画预览施加到场景：
//   所有拥有关键帧数据的逐块方块。
//   ★ 这是"预览 = 播放"语义的唯一咽喉点：拖动时间轴、拖动/点击关键帧菱形、
//     选中轨道帧等一切 seek 预览都必须走它。
//   【2026-10-19 · 关键帧去文件夹化】原「先施加整条跨文件夹骨骼树」已删除（不再有骨级帧）。
function applyKeyframePreviewAtTime(time) {
    if (!Number.isFinite(time)) return;
    try {
        getPlaybackBlocks().forEach(b => {
            try { applyKeyframeToBlock(b.id, time); } catch (e) {}
        });
    } catch (e) { console.warn('关键帧预览施加跳过:', e.message); }
}

// 选中轨道单位的指定时间：切换选区并应用关键帧
function selectKeyframeUnit(unit, time) {
    if (!unit) return;
    keyframeCurrentTime = time;
    updateKeyframePlayhead();
    // 【2026-10-19 · 关键帧去文件夹化】单位恒为单方块，不再有「文件夹骨级单位整体选中」分支。
    if (unit.repBlock) selectKeyframeBlock(unit.repBlock.id, false, false);
    applyKeyframeToUnit(unit, time);
    // 【2026-09-26】点选任一帧 = 预览该时刻的完整动画：除本轨道单位外，
    //   同时把其它所有有关键帧的方块施加到 time（预览 = 播放语义）。
    applyKeyframePreviewAtTime(time);
    renderKeyframeDataPanel();
}

// 取某轨道单位在关键帧移动/删除时应覆盖的全部方块 id：
// 【2026-10-19 · 关键帧去文件夹化】单位 = 单方块，直接返回其自身 id（不再级联文件夹子树）。
function unitKeyframeCubeIds(unit) {
    if (!unit) return [];
    return unit.blocks.map(b => b.id);
}

// 移动轨道单位上某一时刻的关键帧
function moveKeyframeUnit(unit, oldTime, newTime) {
    if (!unit) return false;
    /* ★【2026-10-16 r11】目标时刻必须是 1ms 网格点：拖动落点若带浮点噪声（4.474351），
       会把坏键写回 keyframeData，导致编译产物出现空区间时间块（用户所见"重复/失效"）。 */
    newTime = kfQuantTime(newTime);
    const ids = unitKeyframeCubeIds(unit).filter(id => {
        const d = keyframeData.get(id);
        return d && d.frames.has(oldTime);
    });
    if (ids.length === 0) return false;

    // 统一解析目标时间：若子树中任一方块已在新时间有帧，则整体微调，保持整组同步
    const epsilon = 0.001;
    let offset = 0;
    while (ids.some(id => { const d = keyframeData.get(id); return d && d.frames.has(newTime + offset); })) {
        offset += epsilon;
        if (offset > 1) break;
    }
    const finalTime = kfQuantTime(newTime + offset);

    let moved = false;
    ids.forEach(id => {
        const data = keyframeData.get(id);
        if (!data || !data.frames.has(oldTime)) return;
        const frameData = data.frames.get(oldTime);
        data.frames.delete(oldTime);
        data.frames.set(finalTime, frameData);
        refreshMolangProgramForBlock(id);
        moved = true;
    });
    return moved;
}

// 【2026-09-26】整组平移：把【多个轨道单位】在同一时刻 oldTime 的关键帧一起移动到 newTime。
// 用户报告：多选方块创建的「同一秒关键帧」此前只能一条一条拖（moveKeyframeUnit 只处理一个单位），
// 无法整组移动。时间轴上同一秒的帧在语义上就是一个「动画瞬间」，应能一起拖。
// 与 moveKeyframeUnit 同语义：任一目标帧已占用则整组统一微调，保证组内严格同步、绝不散开。
function moveKeyframeGroupAtTime(units, oldTime, newTime) {
    if (!units || !units.length) return false;
    newTime = kfQuantTime(newTime);   // ★【2026-10-16 r11】目标时刻 1ms 量化（同上）
    // 收集要移动的目标：各轨道单位的逐块方块 id
    const cubeIds = new Set();
    units.forEach(u => {
        if (!u) return;
        unitKeyframeCubeIds(u).forEach(id => {
            const d = keyframeData.get(id);
            if (d && d.frames.has(oldTime)) cubeIds.add(id);
        });
    });
    if (cubeIds.size === 0) return false;

    // 统一解析目标时间：排除「源时刻 oldTime」（它就是待移动的帧本身），
    // 其余任一被占用则整组一起微调 → 组内所有帧始终落在同一时间。
    const epsilon = 0.001;
    const occupied = (t) => {
        if (Math.abs(t - oldTime) < 1e-9) return false;
        for (const id of cubeIds) { const d = keyframeData.get(id); if (d && d.frames.has(t)) return true; }
        return false;
    };
    let offset = 0;
    while (occupied(newTime + offset)) { offset += epsilon; if (offset > 1) break; }
    const finalTime = kfQuantTime(newTime + offset);

    let moved = false;
    cubeIds.forEach(id => {
        const data = keyframeData.get(id);
        if (!data || !data.frames.has(oldTime)) return;
        const frameData = data.frames.get(oldTime);
        data.frames.delete(oldTime);
        data.frames.set(finalTime, frameData);
        refreshMolangProgramForBlock(id);
        moved = true;
    });
    if (moved) keyframeEpoch++;
    return moved;
}


function removeKeyframeUnitAtTime(unit, time) {
    if (!unit) return;
    // ★【2026-10-13】旧操作模式只读：不删除关键帧
    if (kfBlockLegacyEdit('删除关键帧，')) return;
    // 【2026-10-19 · 关键帧去文件夹化】原「文件夹骨级关键帧整条删除」分支已移除。
    unitKeyframeCubeIds(unit).forEach(id => {
        const data = keyframeData.get(id);
        if (data && data.frames.has(time)) {
            data.frames.delete(time);
            refreshMolangProgramForBlock(id);
        }
    });
    renderKeyframeTimeline();
    renderKeyframeDataPanel();
    recordAction();
}

// 文件夹轨道右键删除菜单
function showKeyframeFolderDeleteMenu(unit, time, x, y) {
    // ★【2026-10-13】旧操作模式只读：不提供删除入口
    if (kfBlockLegacyEdit('删除关键帧，')) return;
    if (kfDeleteMenu) { kfDeleteMenu.remove(); kfDeleteMenu = null; }
    const menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;z-index:800;background:rgba(15,23,42,0.95);border:1px solid #f43f5e;border-radius:8px;padding:4px 0;min-width:140px;backdrop-filter:blur(8px);left:' + x + 'px;top:' + y + 'px;';
    const item = document.createElement('div');
    item.style.cssText = 'padding:8px 14px;font-size:12px;color:#fca5a5;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px;';
    item.innerHTML = '🗑 删除 ' + escapeHtml(unit.label) + ' @ ' + time.toFixed(2) + 's';
    item.addEventListener('mouseenter', () => item.style.background = 'rgba(244,63,94,0.2)');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', () => {
        removeKeyframeUnitAtTime(unit, time);
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

// ==================== 骨级关键帧（fmbe / molang 骨骼驱动） ====================
// 关键帧存【骨骼的 rotation + position（+pivot）】，而非逐方块世界姿态；
// 播放时用世界空间刚体变换 F_t(F_ref⁻¹(·)) 把整条骨骼（含所有嵌套子方块）一起施加，
// 每个子方块绕【同一骨骼枢轴】公转 → 天然走弧、不散架（与 bindBone 的 molang 刚体变换同构）。
// 这修正了此前“逐方块线性插值世界坐标”导致的散架（每方块各自最小范数中心→绕不同点转→刚体变形）。
let boneKeyframes = new Map(); // folderName -> { frames:Map<time,{rot,pos,pivot}>, refRot, refPivot, refPos, refWorld:Map<id,{pos:Vector3,quat:Quaternion,scale,erx,ery,es}> }

// ============ 骨骼父子关系统一解析（✛ 真骨骼 + 文件夹层级映射） ============
// 关键修复：此前 getBoneBlocksOfFolder / getBoneParentId 只认 _boneParent（✛ 真骨骼），
// 文件夹层级建立的骨骼树被完全漏掉 → 播放/拖轴落回“逐方块线性插值世界坐标” → 父转子不跟（脱节）。
// 现在两种骨骼共用同一份“父子映射”，getBoneBlocksOfFolder / getBoneRootIds / collectBoneBlocks /
// topoBoneOrder / applyRigidBoneAtTime 全部自动认识文件夹骨骼，与 ✛ 真骨骼完全等效。
// 带签名缓存：仅在 folders / 方块 group / _boneParent 改变时重算 resolveExportBoneParents。
// （_bpmCache / _bpmSig 已提前到文件顶端声明，避免新布局初始化 TDZ 崩溃）
function _hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }

// 把方块 id 转换成「合法 molang 全局变量前缀」。
// 【2026-10-02 校正】新名字仍统一用字母前缀（纯数字开头的 id，如 "118" → "b118"）：
//   理由已不再是「molang 词法不接受」—— tokenizeMolang 现已支持成员名以数字开头（见其内的成员点分支），
//   而是「兼容既有导出与已保存工程」：早期导出/存档里的 t.b118_px 必须继续解析得到同一个全局。
//   已是字母/下划线开头的 id（如 "Cube1"）原样返回。全局骨骼变量 key 与 molang 引用必须用同一函数。
// ⚠ 注意：读取侧必须同时兼容【原始 id】形式（t.1_px）—— publish() 用的是 raw finalId，见 reconstructBoneAnimationImports。
function boneSafeId(id) {
    const s = String(id);
    return /^[A-Za-z_]/.test(s) ? s : 'b' + s;
}
function _boneSig() {
    let s = ((folders.length * 1000003) ^ (blocks.length * 99991)) >>> 0;
    for (const f of folders) { s = (Math.imul(s, 31) + _hashStr(f.name) + (f.parentName ? _hashStr(f.parentName) : 0)) >>> 0; }
    for (const b of blocks) {
        if (b.group) s = (Math.imul(s, 31) + _hashStr(b.id) + _hashStr(b.group)) >>> 0;
        if (b._boneParent) s = (Math.imul(s, 31) + _hashStr(b.id) + _hashStr(b._boneParent)) >>> 0;
    }
    return s;
}
function _getBoneParentMap() {
    const sig = _boneSig();
    if (_bpmCache !== null && _bpmSig === sig) return _bpmCache;
    _bpmCache = resolveExportBoneParents(); _bpmSig = sig; return _bpmCache;
}
// 取某方块绑定的父级 id：✛ 真骨骼(_boneParent) → molang 表达式 t.<父>_px。
// 注意：不再回退到「文件夹层级自动骨骼」（resolveExportBoneParents）。
// 那套层次只用于【导出视图】，若放进动画判定会让任何普通多方块文件夹被误判成骨骼、
// 导致 +关键帧 只录根、其余方块被刚体绑飞。文件夹要成为动画骨骼，必须由用户显式
// 「设为骨干方块」(designateFolderBackbone) 写入 _boneParent，与普通分组彻底解耦。
function getBoneParentId(b) {
    if (b && b._boneParent) return b._boneParent;
    const xp = b.scope.vars.get('v.xpos');
    if (xp && xp.expr) { const m = xp.expr.match(/t(?:\[['"]?|\.)([A-Za-z0-9_]+)_[pg]x/); if (m) return m[1]; }
    // 旧版局部轴链：pos 不参与，父级写在 v.xbasepos = t.<父>_bx + … 里（新绑定都读 px，已在上方命中）
    const bp = b.scope.vars.get('v.xbasepos');
    if (bp && bp.expr) { const m = bp.expr.match(/t(?:\[['"]?|\.)([A-Za-z0-9_]+)_bx/); if (m) return m[1]; }
    return null;
}
// 是否为骨骼根（有其它方块以它为父：看 globalVars 里是否有 <id>_xrot 或 <id>_rotatex）
function isBoneRoot(b) { return globalVars.has(boneSafeId(b.id) + '_xrot'); }
// 从若干种子方块收集整条骨骼（含所有嵌套子方块）
function collectBoneBlocks(seedIds) {
    const visited = new Set();
    const stack = [...seedIds];
    while (stack.length) {
        const id = stack.pop();
        if (visited.has(id)) continue;
        visited.add(id);
        blocks.forEach(b => { const pid = getBoneParentId(b); if (pid === id && !visited.has(b.id)) stack.push(b.id); });
    }
    return Array.from(visited);
}
// 文件夹作为骨骼时的根方块（父在文件夹外或无父）。
// 注意：必须用【本文件夹自身】的方块（b.group===name），不能用 getFolderAllCubeIds（它含后代子文件夹）。
// 否则父文件夹(如「身体」)会因其子文件夹(如「右腿根部」)的骨干块被误判为“已是骨骼”，
// 导致 rigImportedBones 跳过给父文件夹自身方块设骨干 → 整条骨骼树断了根。
// 关键修正：只要某方块存在父骨骼（无论父是否在同文件夹），它就不是“根”——否则跨文件夹父子
// （父在「身体」、子在「右腿根部」）会把子块误判为根，录帧/seek 把它当根处理、用世界常量覆盖 molang，
// 子块即脱离父骨骼“自己动”（用户报告的典型场景）。
function getBoneRootIds(folderName) {
    const ownIds = blocks.filter(b => b.group === folderName).map(b => b.id);
    const inFolder = ownIds.map(id => blocks.find(b => b.id === id)).filter(Boolean);
    return inFolder.filter(b => { const pid = getBoneParentId(b); return !pid; }).map(b => b.id);
}
// 读取文件夹现有骨骼结构（不绑定），无骨骼返回 null
function getBoneBlocksOfFolder(folderName) {
    const ownIds = blocks.filter(b => b.group === folderName).map(b => b.id);
    const inFolder = ownIds.map(id => blocks.find(b => b.id === id)).filter(Boolean);
    const hasBinding = inFolder.some(b => getBoneParentId(b) || isBoneRoot(b));
    if (!hasBinding) return null;
    const roots = getBoneRootIds(folderName);
    const seed = roots.length ? roots : (inFolder[0] ? [inFolder[0].id] : []);
    return collectBoneBlocks(seed);
}
// 文件夹是否【真的自成一根骨骼】：本文件夹内必须存在「无父的根块」，且该根块确实带子块。
// ⚠ 关键帧子系统里【不能】用 getBoneBlocksOfFolder 当布尔判定：它把「文件夹内存在任意 _boneParent
// 方块」也算作有绑定（hasBinding 只看方块有没有父，不看父在不在文件夹内）。于是
// 「普通文件夹里恰好有一个方块被紫色加号 ✛ 绑到文件夹外的父块」会被误判成骨骼文件夹：
//   · createKeyframeAtCurrentTime 把该文件夹的录制劫持成 recordBoneKeyframe → 伪造一条以文件夹为名的
//     骨级轨道，并删掉同级方块已有的逐块关键帧；
//   · getKeyframeFolderUnits / applyKeyframeToUnit 又按“骨骼文件夹”处理 → 真正的逐块关键帧被隐藏、seek 不生效。
//   ——这正是用户报的「录了关键帧却在时间轴上完全看不到」的第二类成因（2026-09-12 修复）。
function isFolderBoneSystem(folderName) {
    if (!folderName) return false;
    if (boneKeyframes.has(folderName)) return true;   // 已有骨级关键帧数据
    const f = getFolder(folderName);
    if (f && f._backbone) return true;                // 用户显式设了骨干 → 该文件夹就是骨骼（单块也算）
    const roots = getBoneRootIds(folderName);
    if (roots.length === 0) return false;             // 全部方块都挂在文件夹外的父上 → 不是本文件夹的骨骼
    return roots.some(rid => blocks.some(b => b.id !== rid && getBoneParentId(b) === rid));
}
// 确保文件夹是一根骨骼：若尚未绑定则自动把首块作根、其余绑到根（位置保持，不瞬移）。silent=true 不弹窗。
function ensureFolderBone(folderName, silent) {
    const ownIds = blocks.filter(b => b.group === folderName).map(b => b.id);
    const inFolder = ownIds.map(id => blocks.find(b => b.id === id)).filter(Boolean);
    if (inFolder.length === 0) return [];
    const hasBinding = inFolder.some(b => getBoneParentId(b) || isBoneRoot(b));
    if (!hasBinding && inFolder.length >= 1) {
        const root = inFolder[0];
        for (let i = 1; i < inFolder.length; i++) bindBone(inFolder[i], root, true, true);
        if (!silent) showToast('已把文件夹「' + folderName + '」绑定为骨骼（' + inFolder.length + ' 个方块）');
    }
    const roots = getBoneRootIds(folderName);
    const seed = roots.length ? roots : [inFolder[0].id];
    return collectBoneBlocks(seed);
}
// 方块当前某变量数值
function vnum(b, name) { const d = b.scope.vars.get(name); return d ? Number(d.value) : 0; }
// 父级旋转矩阵（与 bindBone 的 pR00..22 完全一致：molang 的 math.cos 吃角度 → 与模拟器一致）
function boneParentMatrix(rx, ry, rz) {
    const d2r = d => d * Math.PI / 180;
    const cx = Math.cos(d2r(rx)), sx = Math.sin(d2r(rx));
    const cy = Math.cos(d2r(ry)), sy = Math.sin(d2r(ry));
    const cz = Math.cos(d2r(rz)), sz = Math.sin(d2r(rz));
    return new THREE.Matrix3().set(
        cy * cz + sy * sx * sz, cy * sz - sy * sx * cz, -sy * cx,
        -cx * sz, cx * cz, -sx,
        sy * cz - cy * sx * sz, sy * sz + cy * sx * cz, cy * cx
    );
}
// 方块世界坐标
function blockWorldPos(b) {
    const M = b.scope.toM();
    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
    const W = computeTransformMatrix(M, rX, rY, rZ);
    return new THREE.Vector3().setFromMatrixPosition(W);
}
// 一根骨骼里，根/子方块各自需要写回的 molang 驱动变量
const ROOT_BONE_VARS = ['v.xpos', 'v.ypos', 'v.zpos', 'v.xbasepos', 'v.ybasepos', 'v.zbasepos', 'v.xrot', 'v.yrot', 'v.zrot', 'v.rotatex', 'v.rotatey', 'v.rotatez', 'v.scale', 'v.extend_scale', 'v.extend_xrot', 'v.extend_yrot'];
// 子骨骼回放【绝不】写 rotatex/y/z：子块旋转由 bindBone 建立的 molang（v.rotatex = t.<父>_xrot）
// 刚性跟随父骨骼，是「父转→子整坐标系跟着转」的唯一来源。若把 rotatex/y/z 当常量写回就会覆盖这条
// molang、子块不再跟父旋转（用户报告「子骨骼根本没跟随父旋转」的真正根因）。
// 子块的【局部动画】来自 xrot/yrot/zrot（自身外观旋转）、xbasepos_bone（枢轴位置偏移），二者保留录制/回放。
const CHILD_BONE_VARS = ['v.xrot', 'v.yrot', 'v.zrot', 'v.xbasepos_bone', 'v.ybasepos_bone', 'v.zbasepos_bone',
    'v.scale', 'v.extend_scale', 'v.extend_xrot', 'v.extend_yrot'];
// 录制骨骼关键帧：快照整条骨骼每个方块的 molang 驱动变量（根=完整变换；子=相对父的偏移+旋转）
function recordBoneKeyframe(folderName, time) {
    // 仅记录【已被绑成骨骼】的文件夹（调用方需先判断 isRealBone）。
    // 普通文件夹不应被偷偷绑骨：若未绑定则直接返回，由逐方块关键帧路径接管。
    const blockIds = getBoneBlocksOfFolder(folderName);
    if (!blockIds || blockIds.length === 0) return;
    blocks.forEach(b => b.refresh()); // 先全局刷新，确保 capture 读到的是最新世界坐标（含 t.PARENT_* 全局变量）
    // 清理该骨骼内方块遗留的逐方块关键帧（旧路径/旧版本在转骨骼前录下的残留数据）：
    // 骨骼统一由 boneKeyframes 驱动，遗留 keyframeData 会造成时间轴“两个同名骨骼轨道”重复
    // （用户报告）并可能干扰播放。bindBone 只删子块，根的残留在这里一并清掉。
    blockIds.forEach(id => { if (keyframeData.has(id)) { keyframeData.delete(id); keyframeEpoch++; } });
    let entry = boneKeyframes.get(folderName);
    if (!entry) { entry = { frames: new Map(), blockIds: blockIds.slice() }; boneKeyframes.set(folderName, entry); }
    entry.blockIds = blockIds.slice();
    const frame = new Map();
    blockIds.forEach(id => { const b = blocks.find(x => x.id === id); if (b) frame.set(id, captureBoneBlockState(b)); });
    entry.frames.set(time, frame);
}
// 角度类变量：关键帧插值/导出必须用最短弧插值（math.lerprotate 语义），否则 350°→10°
// 会被 math.lerp 算成 180°（绕远路）。参考：蓝色鲸鱼。
const _KF_ANGLE_VARS = new Set(['xrot','yrot','zrot','rotatex','rotatey','rotatez','extend_xrot','extend_yrot']);
function _kfIsAngleVar(V) { const s = (typeof V === 'string' && V.startsWith('v.')) ? V.slice(2) : V; return _KF_ANGLE_VARS.has(s); }
// ★ 关键帧角度插值【2026-09-12 多圈修复】：默认最短弧（lerprotate 语义，350°→10° 走 +20° 绕行）；
//   但任一端点记录值超出 ±180°（用户显式录了多圈转体，如 0 → -517.25）时，按【字面数值】线性插值、
//   保留整圈圈数——绝不能把 500° 的目标坍缩成 ±180° 内的等效姿态（旧 lerpRot 走短弧导致
//   "模型永远只在一个圆内旋转"，用户报）。导出端 _kfAngleNeedsLiteral 与本函数保持同一判定。
function _kfAngleLerp(a, b, t) {
    if (Math.abs(a) <= 180 && Math.abs(b) <= 180) {
        let d = (b - a) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360;
        return a + d * t;
    }
    return a + (b - a) * t; // 多圈：0→-517 完整转 -517°，不再短弧化
}
// 该角度变量在各关键帧记录值里是否出现 ±180° 之外的「多圈意图」值（true → 导出用 math.lerp 字面插值）
function _kfAngleNeedsLiteral(valList) {
    return (valList || []).some(v => Math.abs(Number(v) || 0) > 180);
}
// 骨级插值：逐方块插值 molang 驱动变量（角度变量走最短弧 math.lerprotate 语义，位置走线性插值）
function boneInterpAtTime(entry, time) {
    const times = Array.from(entry.frames.keys()).sort((a, b) => a - b);
    if (times.length === 0) return null;
    if (entry.frames.has(time)) return entry.frames.get(time);
    if (time <= times[0]) return entry.frames.get(times[0]);
    if (time >= times[times.length - 1]) return entry.frames.get(times[times.length - 1]);
    let p = times[0], n = times[times.length - 1];
    for (let i = 0; i < times.length - 1; i++) { if (time >= times[i] && time <= times[i + 1]) { p = times[i]; n = times[i + 1]; break; } }
    const t = (time - p) / (n - p);
    const A = entry.frames.get(p), B = entry.frames.get(n);
    const out = new Map();
    entry.blockIds.forEach(id => {
        const sa = A.get(id), sb = B.get(id);
        if (!sa || !sb) { if (sa || sb) out.set(id, sa || sb); return; }
        const lerp = (u, v) => u + (v - u) * t;
        // 角度插值：默认最短弧；端点出现 ±180° 外的多圈记录值时按字面数值插值（_kfAngleLerp，2026-09-12）
        const lerpRot = (a, b) => _kfAngleLerp(a, b, t);
        const vars = {};
        Object.keys(sa.vars).forEach(k => { vars[k] = _kfIsAngleVar(k) ? lerpRot(sa.vars[k], sb.vars[k]) : lerp(sa.vars[k], sb.vars[k]); });
        out.set(id, {
            parentId: sa.parentId, isChild: sa.isChild,
            parentCoords: sa.parentCoords.map((x, i) => lerp(x, sb.parentCoords[i])),
            parentRot: sa.parentRot.map((x, i) => lerpRot(x, sb.parentRot[i])),
            vars
        });
    });
    return out;
}
// 复刻 computeTransformMatrix 的“局部线性部分” L = matS·Eyl·Exl·Es·Exr·Eyr·matEsy
// （原函数用 premultiply 链，顺序被反转；此处用 .multiply 顺序构造，确保与正向完全一致）
function _kfEblockSblock(es, ex, ey, s) {
    const matS = new THREE.Matrix4().makeScale(s, s, s);
    const matEyl = new THREE.Matrix4().makeRotationY(degToRad(-ey));
    const matExl = new THREE.Matrix4().makeRotationX(degToRad(ex));
    const matEs = new THREE.Matrix4().makeScale(1, 1, es);
    const matExr = new THREE.Matrix4().makeRotationX(-degToRad(ex));
    const matEyr = new THREE.Matrix4().makeRotationY(degToRad(ey));
    const matEsy = new THREE.Matrix4().makeScale(1, es, 1);
    return matS.clone().multiply(matEyl).multiply(matExl).multiply(matEs).multiply(matExr).multiply(matEyr).multiply(matEsy);
}
// 把“期望世界矩阵 W”反解成方块 v.* 变量映射（供骨骼播放 _kfWorldToVars / _writeKfVarsToBlock 写回）。
// 旧实现用 W.decompose 再剥离：遇到 es 极小且 ex≠0（倾斜各向异性缩放）时 decompose 病态 → 旋转错乱；
// 且位置剥离把 xpos 与 basepos 互换（basepos 达千万级时方块飞散）。改为精确矩阵代数剥离：
//   正向 W = matP(px)·G·Rblock·L·matB(bx)，线性块 Wrot=G·Rblock·L，平移 Wtrans=px+G·Rblock·L·bx。
//   反解 Rblock = invG·Wrot·inv(L)；bx = inv(L)·inv(Rblock)·invG·(Wtrans−px)。全程精确，无 decompose 病态。
function _kfWorldToVars(baseVar, W) {
    const rX = baseVar.rotatex ?? 0, rY = baseVar.rotatey ?? 0, rZ = baseVar.rotatez ?? 0;
    const es = baseVar.extend_scale ?? 1, ex = baseVar.extend_xrot ?? 0, ey = baseVar.extend_yrot ?? 0, s = baseVar.scale ?? 1;
    const G = _kfGlobalRotMtx(rX, rY, rZ);
    const invG = G.clone().invert();
    // 仅当 es/s 恰好为 0（或 1/es 非有限=次正规下溢）才用极小 epsilon 代换，正的极小 es 保持原值
    const _esSafe = (es === 0 || !Number.isFinite(1 / es)) ? (es < 0 ? -1e-6 : 1e-6) : es;
    const _sSafe = (s === 0 || !Number.isFinite(1 / s)) ? (s < 0 ? -1e-6 : 1e-6) : s;
    const L = _kfEblockSblock(_esSafe, ex, ey, _sSafe);
    const invL = L.clone().invert();
    // Wrot = W 的左上 3x3（elements 列主序 → Matrix4.set 行主序，需转置索引）
    const Wrot = new THREE.Matrix4().set(
        W.elements[0], W.elements[4], W.elements[8], 0,
        W.elements[1], W.elements[5], W.elements[9], 0,
        W.elements[2], W.elements[6], W.elements[10], 0,
        0, 0, 0, 1
    );
    // Rblock = invG · Wrot · inv(L) —— 精确等于前向 matRy·matRx·matRz，无 decompose 病态
    const Rblock = invG.clone().multiply(Wrot).multiply(invL);
    const e = new THREE.Euler().setFromRotationMatrix(Rblock, 'YXZ');
    const radToDeg = THREE.MathUtils.radToDeg;
    const out = { ...baseVar };
    out.xrot = normRotDeg(_r4(radToDeg(e.x)));
    out.yrot = normRotDeg(_r4(radToDeg(-e.y)));
    out.zrot = normRotDeg(_r4(radToDeg(-e.z)));
    const Wtrans = new THREE.Vector3(W.elements[12], W.elements[13], W.elements[14]);
    // 子块若自身有关键帧（base 含世界坐标 xpos），保留其插值结果为世界坐标（与 _kfRigidLerp 约定一致）；
    // 若没有（简化骨骼模型：子块纯靠父参数跟随，不需要自己的关键帧），则用 cw 的世界平移直接作为世界坐标。
    if (baseVar.xpos !== undefined && baseVar.xpos !== null) {
        out.xpos = baseVar.xpos; out.ypos = baseVar.ypos; out.zpos = baseVar.zpos;
    } else {
        out.xpos = _r4(Wtrans.x); out.ypos = _r4(Wtrans.y); out.zpos = _r4(Wtrans.z);
    }
    // 反解局部偏移 bx（供 molang 表达式随父旋转）；px 取“基准世界坐标”，无则退化为 Wtrans
    const pVec = new THREE.Vector3(baseVar.xpos ?? Wtrans.x, baseVar.ypos ?? Wtrans.y, baseVar.zpos ?? Wtrans.z);
    const tmp = Wtrans.clone().sub(pVec).applyMatrix4(invG);        // invG·(Wtrans - px)
    const tmp2 = tmp.applyMatrix4(Rblock.clone().invert());         // invRblock·invG·(Wtrans - px)
    const bNew = tmp2.applyMatrix4(invL);                           // invL·invRblock·invG·(Wtrans - px) = bx
    // 退化保护：es 恰好为 0 时 L 奇异，沿该轴的 basepos 不可恢复；若出现 NaN/Inf 则保留原值，避免渲染崩溃
    if (!Number.isFinite(bNew.x) || !Number.isFinite(bNew.y) || !Number.isFinite(bNew.z)) {
        out.xbasepos = baseVar.xbasepos ?? 0;
        out.ybasepos = baseVar.ybasepos ?? 0;
        out.zbasepos = baseVar.zbasepos ?? 0;
    } else {
        out.xbasepos = _r4(bNew.x);
        out.ybasepos = _r4(bNew.y);
        out.zbasepos = _r4(bNew.z);
    }
    return out;
}

// 骨骼拓扑排序：父骨骼排在子骨骼之前
function topoBoneOrder(list) {
    const inSet = new Set(list.map(b => b.id));
    const visited = new Set();
    const out = [];
    const visit = (b) => {
        if (visited.has(b.id)) return;
        visited.add(b.id);
        const pid = getBoneParentId(b);
        const p = pid ? list.find(x => x.id === pid) : null;
        if (p && inSet.has(pid) && !visited.has(pid)) visit(p);
        out.push(b);
    };
    list.forEach(visit);
    return out;
}

// 刚体骨骼播放/烘焙：仅父骨骼做“世界姿态插值”，子骨骼的世界姿态由【父骨骼插值结果 × 子局部变换】
// 实时组合得到 —— 与 molang 引擎 v.xpos = t.PARENT_px + pR·offset 完全同构。
// 子骨骼永远跟随父骨骼的旋转弧线，绝不独立线性插值世界坐标 → 大角度旋转不再散开。
// （这正是用户直觉：父角度对了，子就跟着对；之前散开是因为子被“独立”插值了。）
//
// 【性能修复 4.69.7】骨骼含 N 个方块时，原实现每帧调用 getBoneBlocksOfFolder 两次（各含 O(n²) 的
// blocks.find 扫描 + collectBoneBlocks），并每帧重算恒定的 childLocal —— 185 块时每帧 ~231ms（≈4fps）。
// 现改为：骨骼块列表/顺序/childLocal 仅在「骨骼结构(_boneSig)」或「关键帧(keyframeEpoch)」变更时重建，
// 播放每帧只做一次 O(n) 签名校验后复用缓存，开销降到帧预算内。pre 由调用方（播放）传入；
// 其它一次性调用（轨道 seek）不传 pre，仍内部构建，行为与旧版一致。
let _kfPlayPre = null; // { folder, sig, boneBlocks, order, childLocal }
// 取方块当前的完整世界矩阵（位置+旋转+缩放），用于计算子骨骼相对父骨骼的固定偏移。
// 与 blockWorldPos 同源：b.scope.toM() 已是按当前（含 molang 求值后的）姿态渲染的世界矩阵。
function _blockWorldMatrix(b) {
    const M = b.scope.toM();
    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
    return computeTransformMatrix(M, rX, rY, rZ);
}
// 子骨骼的「静止态相对父变换」：结构属性，随骨骼结构(_boneSig)重建，播放期间恒定不漂移。
// 返回 Map<childId, { offset: Vector3, relRot: THREE.Matrix3 }>：
//   offset = 子块相对父块的世界偏移（骨骼参数，来自 computeRelativeTransform 的 ox/oy/oz，恒定）；
//   relRot = 子块相对父块的旋转（骨骼参数：相对父的旋转角度，恒定）。
// 播放时：子世界坐标 = 父世界坐标 + 父世界旋转·offset；子世界旋转 = 父世界旋转（写入 v.rotatex）。
// 全程只做「提取父旋转(3x3) + 3x3·向量 / 3x3·3x3」，绝不做复合世界矩阵 Euler/分解 —— 与骨骼定义公式
// (getBoneChildPositionString) 同构，刚体跟随绝不散开、相对偏移恒定不漂移。
function _computeBoneChildLocal(boneBlocks) {
    const childLocal = new Map();
    for (const b of boneBlocks) {
        const pid = getBoneParentId(b);
        if (!pid) continue;
        const parent = blocks.find(x => x.id === pid);
        if (!parent) continue;
        const rel = computeRelativeTransform(b, parent); // 静止态：块/父均为休息姿态
        childLocal.set(b.id, {
            offset: new THREE.Vector3(rel.ox, rel.oy, rel.oz),
            relRot: boneParentMatrix(rel.rx, rel.ry, rel.rz)
        });
    }
    return childLocal;
}
function _buildBonePlayPre(folderName) {
    const boneIds = getBoneBlocksOfFolder(folderName);
    if (!boneIds || boneIds.length === 0) return null;
    const boneBlocks = boneIds.map(id => blocks.find(b => b.id === id)).filter(Boolean);
    const order = topoBoneOrder(boneBlocks);
    const childLocal = _computeBoneChildLocal(boneBlocks);
    // childLocal 是「静止姿态固定偏移」（结构属性），只随骨骼结构变化重建；
    // 不再随 keyframeEpoch 重建，否则播放中重算会把偏移漂移到动画中途姿态。
    const sig = _boneSig();
    return { folder: folderName, sig, boneBlocks, order, childLocal };
}
// 收集场景中【所有】骨骼块（跨文件夹），用于跨文件夹骨骼树的全局播放/烘焙。
// 任一文件夹被播放时，整条骨骼树（含其它文件夹的子骨骼）必须一起按拓扑序施加——
// 否则子文件夹的骨干依赖父文件夹骨干的世界坐标、而父未被播放 → 子骨塌缩到父局部原点（散开）。
function collectAllBoneBlocks() {
    const ids = new Set();
    blocks.forEach(b => { if (b._boneParent || isBoneRoot(b)) ids.add(b.id); });
    return Array.from(ids).map(id => blocks.find(b => b.id === id)).filter(Boolean);
}
// 全局骨骼播放预缓存：覆盖整条骨骼树（所有文件夹），拓扑序跨文件夹（父必先于子），
// 与 applyRigidBoneAtTime 完全兼容（其迭代 order + 共享 worldCache，父先子后自动联动）。
function getGlobalBonePlayPre() {
    const boneBlocks = collectAllBoneBlocks();
    if (boneBlocks.length === 0) return null;
    const order = topoBoneOrder(boneBlocks);
    const childLocal = _computeBoneChildLocal(boneBlocks);
    return { folder: '__global__', sig: _boneSig(), boneBlocks, order, childLocal };
}
function applyRigidBoneAtTime(folderName, time, pre) {
    let boneBlocks, order, childLocal;
    if (pre) {
        boneBlocks = pre.boneBlocks; order = pre.order; childLocal = pre.childLocal;
    } else {
        const boneIds = getBoneBlocksOfFolder(folderName);
        if (!boneIds || boneIds.length === 0) return;
        boneBlocks = boneIds.map(id => blocks.find(b => b.id === id)).filter(Boolean);
        order = topoBoneOrder(boneBlocks);
        childLocal = _computeBoneChildLocal(boneBlocks);
    }
    if (boneBlocks.length === 0) return;
    const worldCache = new Map();
    for (const b of order) {
        const pid = getBoneParentId(b);
        const pw = (pid && worldCache.has(pid)) ? worldCache.get(pid) : null;
        if (!pw) {
            // 根骨骼（或父在骨骼外）：正常“世界姿态插值”写回
            applyKeyframeToBlock(b.id, time);
            const wm = interpolateKeyframes(b.id, time);
            if (wm) worldCache.set(b.id, _kfVarToWorldMatrix(wm));
        } else {
            // 子骨骼：纯 molang 刚性跟随（用户要求的「纯 molang 骨骼」）。
            // 父根已按关键帧插值写回并 refresh；子块自带 molang 表达式
            //   v.xpos = t.<父>_px + pR·offset ,  v.rotatex = t.<父>_rotatex ,  pR 由 t.<父>_rotatex/y/z 实时构造。
            // 引擎对 t.<父>_* 做【实时解析】（evaluateExpression 按 sourceBlockId 在父块作用域求值），
            // 故子块无需任何 JS 写位置——refresh 即自动绕父公转、绝不散架，也绝不破坏 bindBone 的 molang 绑定。
            // 不再 setConstVarValue 写死常量（那是上一版「非纯 molang」的根因）。
            const cl = childLocal.get(b.id);
            if (cl) {
                // 子骨骼：先应用其【局部关键帧】（相对父的偏移 xbasepos_bone 与相对旋转 xrot/yrot/zrot/rotatex…），
                // 再 b.refresh() 由 molang 表达式（v.xpos = t.父_px + pR·offset）实时跟随父骨骼世界姿态。
                // 这样子骨骼既能“相对父做局部动画”（用户给子骨骼设的枢轴关键帧真正生效），
                // 又始终刚性跟随父骨骼旋转/位移，绝不脱离父骨骼“自己动”。
                // 注意：v.xpos/ypos/zpos 由 molang 驱动，绝不被局部关键帧的世界常量覆盖（_writeKfVarsToBlock 已锁）。
                const interp = interpolateKeyframes(b.id, time);
                if (interp) {
                    // 子块旋转【绝不】写 rotatex/y/z：子块朝向由 bindBone 的 molang（v.rotatex = t['PARENT_rotatex']）
                    // 刚性跟随父骨骼，是“父转→子整坐标系跟着转”的唯一来源。若把 rotatex/y/z 当常量写回就会覆盖
                    // 这条 molang、子块不再跟父旋转（用户报告“子骨骼没跟随父旋转改变枢轴”的核心根因之一）。
                    // 子块局部动画只来自 xrot/yrot/zrot（相对父外观旋转）+ xbasepos_bone（枢轴偏移），二者保留。
                    ['xbasepos_bone', 'ybasepos_bone', 'zbasepos_bone', 'xrot', 'yrot', 'zrot',
                     'scale', 'extend_scale', 'extend_xrot', 'extend_yrot'
                    ].forEach(n => { if (n in interp) setConstVarValue(b, 'v.' + n, interp[n]); });
                }
                b.refresh(); // molang 实时跟随父（世界坐标 = 父世界 + 父旋转·局部偏移）
                const wx = vnum(b, 'v.xpos'), wy = vnum(b, 'v.ypos'), wz = vnum(b, 'v.zpos');
                const rx = THREE.MathUtils.degToRad(vnum(b, 'v.rotatex'));
                const ry = THREE.MathUtils.degToRad(vnum(b, 'v.rotatey'));
                const rz = THREE.MathUtils.degToRad(vnum(b, 'v.rotatez'));
                const wm4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
                wm4.setPosition(wx, wy, wz);
                worldCache.set(b.id, wm4); // 供更深层级子块链式跟随（若有）
            } else {
                applyKeyframeToBlock(b.id, time);
                const wm = interpolateKeyframes(b.id, time);
                if (wm) worldCache.set(b.id, _kfVarToWorldMatrix(wm));
            }
        }
    }
}

// 读取方块变量当前真实值：常量直接取 value，表达式经 molang 引擎实时求值（避免 molangMode 下
// def.value 未刷新导致 capture 读到陈旧/零值——这正是“缩到原点”的隐患来源）。
function tvnum(b, name) {
    const d = b.scope.vars.get(name);
    if (!d) return 0;
    return isConstantExpr(d.expr) ? Number(d.value) : evaluateExpression(d.expr, b.scope.vars, globalVars, b.scope.blockId);
}
// 把骨骼在 time 时刻的姿态刚体施加到整条骨骼的所有子方块（绕同一枢轴公转 → 不散架）
// 捕获方块 12 个（及外观）molang 相关数据：根=完整变换；子=父 6 值（参考）+ 自身 6 值（旋转+相对父偏移）
function captureBoneBlockState(b) {
    const parentId = getBoneParentId(b);
    const list = parentId ? CHILD_BONE_VARS : ROOT_BONE_VARS;
    const vars = {};
    list.forEach(vn => { vars[vn] = tvnum(b, vn); });
    let parentCoords = [0, 0, 0], parentRot = [0, 0, 0];
    // ★ 骨骼根：【直接捕获编辑态变量】——xpos/ypos/zpos 就是“枢轴锚点”，
    //   xbasepos/ybasepos/zbasepos 是几何相对枢轴的【局部偏移】（几何中心 = xpos + R·basepos）。
    //   t.<根>_px(=v.xpos) 是子骨骼的锚点，而根自身的 mesh 额外带 basepos 公转。
    //   两者必须【分开记录、分开插值】：
    //     - 若把 blockWorldPos(几何中心) 折进 xpos 并清零 basepos，则播放时
    //       ① 子块锚点被带偏 = 旋转后的 basepos 模长（父一旋转，子块整体平移量随角度变）；
    //       ② 根几何中心的旋转圆心从“枢轴”变成“自身中心”，中间帧走弦而非绕枢轴画弧。
    //       这正是“父骨骼播放时不计算 basepos”/播放结束定格时闪跳 的根因。
    //     - basepos≠0 常见：枢轴在模型脚底/关节而几何悬在上方、或 4.65 前版本旧枢轴拖拽补偿。
    //   播放/纯 molang 一律以 v.xpos(枢轴) 作锚点、basepos 由 localMat 挂枢轴公转——两者语义一致。
    //   （旧版“把根的世界位移落在 xbasepos 时归一化进 xpos”的 hack 只对 basepos==0 的根是 no-op；
    //     一旦根带 basepos 旋转就把它错当枢轴位移。移除法：枢轴位移请走 v.xpos/骨级平移路径。）
    //   上面的 list.forEach 已用 tvnum 捕获 xpos/ypos/zpos 与 xbasepos/ybasepos/zbasepos 现值，无需覆盖。
    if (parentId) {
        const p = blocks.find(x => x.id === parentId);
        if (p) {
            parentCoords = [tvnum(p, 'v.xpos'), tvnum(p, 'v.ypos'), tvnum(p, 'v.zpos')];
            parentRot = [tvnum(p, 'v.xrot'), tvnum(p, 'v.yrot'), tvnum(p, 'v.zrot')];
            // 子块偏移：优先【直读绑定值 v.xbasepos_bone】（与 computeRelativeTransform 一致）。
            // 正常绑定态（v.xpos 是 molang 跟随表达式）下绑定值才是「当前真实姿态」——
            // 重算偏移会与绑定值不一致（导入 parentbone 链时子块先绑本文件夹骨干、骨干再被
            // 跨文件夹绑到父骨骼，54-72 的旧偏移基于「53 独立根」算；此时重算得到不同值，
            // 添加第一个关键帧时写回错误偏移 → 模型炸开。用户报：左腿腿部加关键帧后全炸）。
            // 仅当子块被 remapBoneKeyframes 展开成【世界常量】姿态（v.xpos 非 molang 表达式）
            // 时才需要重算——那是“按当前父子关系重新捕获”的意图。
            const xposExpr = b.scope.vars.get('v.xpos');
            const isBoneFollowExpr = xposExpr && !isConstantExpr(String(xposExpr.expr));
            if (!isBoneFollowExpr) {
                const cw = blockWorldPos(b), pw = blockWorldPos(p);
                // 与 bindBone 一致：父旋转源 = rotatex + xrot（中继骨骼下纯 xrot 会算错偏移）
                const prx = vnum(p, 'v.rotatex') + vnum(p, 'v.xrot');
                const pry = vnum(p, 'v.rotatey') + vnum(p, 'v.yrot');
                const prz = vnum(p, 'v.rotatez') + vnum(p, 'v.zrot');
                const RpInv = boneParentMatrix(prx, pry, prz).clone().invert();
                const off = new THREE.Vector3().subVectors(cw, pw).applyMatrix3(RpInv);
                vars['v.xbasepos_bone'] = _r4(off.x);
                vars['v.ybasepos_bone'] = _r4(off.y);
                vars['v.zbasepos_bone'] = _r4(off.z);
            }
            // 直读绑定值（v.xpos 是 molang 跟随表达式的情况）：vars 已在上方
            // list.forEach(vn => vars[vn] = tvnum(b, vn)) 捕获了 v.xbasepos_bone 现值，无需覆盖。
        }
    }
    return { parentId, isChild: !!parentId, vars, parentCoords, parentRot };
}
// 把一个方块的 molang 驱动变量写回（根写完整变换；子写相对父偏移+旋转），由 molang 表达式自行算出刚体世界位置
function applyBoneBlockState(b, st) {
    const list = st.isChild ? CHILD_BONE_VARS : ROOT_BONE_VARS;
    // 内部骨骼写回：临时绕过「跟随通道保护」（这里写的正是骨骼语义的世界/局部变量，非用户编辑）
    _constVarInternalWrite++;
    try { list.forEach(vn => { setConstVarValue(b, vn, st.vars[vn]); }); }
    finally { _constVarInternalWrite--; }
    b.refresh();
}
// —— 骨骼树变更后的关键帧重映射 ——
// 把一帧的“旧世界变换”从存储状态还原成世界矩阵：
//   · 根块：直接由 ROOT_BONE_VARS 组装；
//   · 子块：父世界矩阵(parentCoords/parentRot) × 局部矩阵(CHILD_BONE_VARS)。
function _worldMatrixFromVars(v) {
    const g = k => (v[k] !== undefined && v[k] !== null) ? Number(v[k]) : 0;
    const M = [g('v.xpos'), g('v.ypos'), g('v.zpos'), g('v.xrot'), g('v.yrot'), g('v.zrot'),
        g('v.scale') || 1, g('v.extend_scale') || 1, g('v.extend_xrot') || 0, g('v.extend_yrot') || 0,
        g('v.xbasepos'), g('v.ybasepos'), g('v.zbasepos')];
    return computeTransformMatrix(M, g('v.rotatex'), g('v.rotatey'), g('v.rotatez'));
}
function _worldMatrixFromCoords(coords, rot) {
    const c = coords || [0, 0, 0], r = rot || [0, 0, 0];
    const M = [c[0], c[1], c[2], r[0], r[1], r[2], 1, 1, 0, 0, 0, 0, 0];
    return computeTransformMatrix(M, r[0], r[1], r[2]);
}
function _localMatrixFromChildVars(v) {
    const g = k => (v[k] !== undefined && v[k] !== null) ? Number(v[k]) : 0;
    const M = [0, 0, 0, g('v.xrot'), g('v.yrot'), g('v.zrot'), g('v.scale') || 1, g('v.extend_scale') || 1, g('v.extend_xrot') || 0, g('v.extend_yrot') || 0,
        g('v.xbasepos_bone'), g('v.ybasepos_bone'), g('v.zbasepos_bone')];
    return computeTransformMatrix(M, g('v.xrot'), g('v.yrot'), g('v.zrot'));
}
// 从世界矩阵反解“世界平移 + 骨骼旋转”（与引擎 computeTransformMatrix 约定一致，复用 _kfWorldToVars）
function _worldRotOfMatrix(W) {
    const base = { rotatex: 0, rotatey: 0, rotatez: 0, extend_scale: 1, extend_xrot: 0, extend_yrot: 0, scale: 1 };
    const o = _kfWorldToVars(base, W);
    return { xpos: o.xpos, ypos: o.ypos, zpos: o.zpos, rx: o.xrot, ry: o.yrot, rz: o.zrot };
}
// 骨骼文件夹的父子关系变化（拖入/拖出其他骨骼）后，把该文件夹已有的骨骼关键帧动画
// 重新映射到【当前】骨骼坐标系下：子块会相对新父骨骼写入局部偏移，从而既保留自身动画、
// 又刚性跟随父骨骼移动/旋转（修复“拖入其他骨骼后动画失效”）。
// 复用引擎自带的 captureBoneBlockState，不引入新的旋转数学；对未变化层级是幂等的。
function remapBoneKeyframes(folderName) {
    const entry = boneKeyframes.get(folderName);
    if (!entry || entry.frames.size === 0) return;
    const times = Array.from(entry.frames.keys()).sort((a, b) => a - b);
    const ids = Array.from(entry.blockIds);
    // 快照相关方块作用域，结束还原（molang 跟随表达式不丢失）
    const snap = new Map();
    ids.forEach(id => {
        const b = blocks.find(x => x.id === id);
        if (!b) return;
        const s = {};
        b.scope.vars.forEach((d, n) => { s[n] = { expr: d.expr, value: d.value }; });
        snap.set(id, s);
    });
    const newFrames = new Map();
    // 内部骨骼重映射：整段绕过「跟随通道保护」（这里就是要临时把块按世界常量摆到旧姿态再重新捕获，
    // 结束后由 finally 用快照把 molang 表达式原样还原）。见 _guardBoneFollowWrite 注释。
    _constVarInternalWrite++;
    try {
        for (const t of times) {
            const oldFrame = entry.frames.get(t);
            // 1) 把每个块还原到该帧的【旧世界变换】，再按当前父子关系重新捕获
            ids.forEach(id => {
                const b = blocks.find(x => x.id === id);
                if (!b) return;
                const st = oldFrame.get(id);
                if (!st) return;
                const W = st.isChild
                    ? _worldMatrixFromCoords(st.parentCoords, st.parentRot).multiply(_localMatrixFromChildVars(st.vars))
                    : _worldMatrixFromVars(st.vars);
                const w = _worldRotOfMatrix(W);
                setConstVarValue(b, 'v.xpos', _r4(w.xpos)); setConstVarValue(b, 'v.ypos', _r4(w.ypos)); setConstVarValue(b, 'v.zpos', _r4(w.zpos));
                setConstVarValue(b, 'v.xbasepos', 0); setConstVarValue(b, 'v.ybasepos', 0); setConstVarValue(b, 'v.zbasepos', 0);
                setConstVarValue(b, 'v.rotatex', _r4(w.rx)); setConstVarValue(b, 'v.rotatey', _r4(w.ry)); setConstVarValue(b, 'v.rotatez', _r4(w.rz));
                setConstVarValue(b, 'v.xrot', _r4(w.rx)); setConstVarValue(b, 'v.yrot', _r4(w.ry)); setConstVarValue(b, 'v.zrot', _r4(w.rz));
            });
            blocks.forEach(b => b.refresh());
            // 2) 当前父子关系下重新捕获（子块相对新父骨骼写局部偏移/旋转）
            const nf = new Map();
            ids.forEach(id => {
                const b = blocks.find(x => x.id === id);
                if (b) nf.set(id, captureBoneBlockState(b));
            });
            newFrames.set(t, nf);
        }
        entry.frames = newFrames;
    } finally {
        _constVarInternalWrite--;
        snap.forEach((s, id) => {
            const b = blocks.find(x => x.id === id);
            if (!b) return;
            Object.entries(s).forEach(([n, st]) => {
                if (b.scope.vars.has(n)) {
                    b.scope.setVarExpr(n, st.expr);
                    const d = b.scope.vars.get(n);
                    if (d) d.value = st.value;
                }
            });
            b.refresh();
        });
    }
    keyframeEpoch++;
}
// 把骨骼在 time 时刻的姿态写回 molang 变量（驱动 bindBone 表达式 → 整条骨骼刚体、不散架）
function applyBoneKeyframeAtTime(folderName, time) {
    const entry = boneKeyframes.get(folderName);
    if (!entry) return;
    const kf = boneInterpAtTime(entry, time);
    if (!kf) return;
    entry.blockIds.forEach(id => {
        const b = blocks.find(x => x.id === id);
        if (!b) return;
        const st = kf.get(id);
        if (!st) return;
        applyBoneBlockState(b, st);
    });
    // 文件夹枢轴已由 folderGizmoCenterWorld 对骨骼文件夹实时读骨干世界位置（不存任何元数据），
    // 这里不再写 f.pivot（陈旧固化点会导致播放时 Gizmo 枢轴原地不动）。
    // 强制全局同步：确保父骨骼写回 v.xpos 后，其子方块依赖的全局变量 t.PARENT_* 都被刷新，
    // 否则子方块会失去父的世界平移、坍缩到父局部原点（即“缩到原点”现象）。
    blocks.forEach(b => b.refresh());
}

// 只更新骨骼关键帧姿态的【value】（保留 molang expr 表达式），供暂停/停止时把骨骼定格在
// “当前播放头时间”的插值姿态——而不是还原成播放前快照（那通常是最后录制帧的姿态，用户看到“闪跳”）。
// 注意：骨骼根/子的骨骼变量（xpos/xrot/rotatex/xbasepos_bone…）在骨骼体系里本来就是【常量表达式】，
// 必须连同 expr 一起改成插值常量，否则后续 refresh 的 recompute 会用旧 expr 把 value 重算回旧值。
// 子块的 v.xpos 是 molang 跟随表达式（不在 CHILD_BONE_VARS 列表内），不受影响。
function applyBoneValueOnly(folderName, time) {
    const entry = boneKeyframes.get(folderName);
    if (!entry) return;
    const kf = boneInterpAtTime(entry, time);
    if (!kf) return;
    entry.blockIds.forEach(id => {
        const b = blocks.find(x => x.id === id);
        if (!b) return;
        const st = kf.get(id);
        if (!st) return;
        const list = st.isChild ? CHILD_BONE_VARS : ROOT_BONE_VARS;
        list.forEach(vn => {
            const d = b.scope.vars.get(vn);
            if (!d) return;
            const v = st.vars[vn];
            if (v !== undefined && v !== null && Number.isFinite(v)) {
                const s = String(parseFloat(Number(v).toFixed(6)));
                d.expr = s;
                d.value = v;
            }
        });
    });
}

// 关键帧轨道行左侧图标：方块类型 → 内嵌 base64 图标；文件夹 → 蓝色文件夹 SVG
const ICON_FOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h3.6l1.8 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" fill="#3b82f6"/></svg>');
function blockTypeIcon(type) {
    if (type === 'stair') return ICON_STAIR;       // 楼梯
    if (type === 'halfbrick') return ICON_SLAB;     // 台阶 / 半砖
    if (type === 'flag') return ICON_FLAG;          // 旗帜
    if (type === 'plane') return ICON_PLANE;        // 平面
    return ICON_CUBE;                               // 方块 / 未知默认
}

