/* 05-ui/04-sidebar-list.js · 源 测试版v.6b79.html 第 23901-25938 行 */
'use strict';
// ========== 新布局模式 ==========
function toggleNewLayoutMode(e) {
    setNewLayoutMode(!isNewLayoutMode, e);
}
// 显式设置操作模式：v=true → 新操作模式；v=false → 旧操作模式。
// 快捷键 Ctrl+N（新）/ Ctrl+O（旧）也走这里；设置里勾选走 toggleNewLayoutMode。
function setNewLayoutMode(v, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (isNewLayoutMode === v) return;   // 已是目标模式则跳过，避免重复渲染/退出关键帧模式
    isNewLayoutMode = v;
    applyNewLayoutMode();
    const cb = document.getElementById('newLayoutCheckbox');
    if (cb) {
        cb.classList.toggle('checked', isNewLayoutMode);
        cb.setAttribute('aria-pressed', String(isNewLayoutMode));
    }
    try { localStorage.setItem('ui_new_layout', isNewLayoutMode ? '1' : '0'); } catch (err) {}
}

function applyNewLayoutMode() {
    // ★【2026-10-20】切换操作模式前先收起旧操作模式的「方块列表」浮层。
    // 该列表是 showBlockDropdown 挂到 body 上的 position:fixed 元素（.block-dropdown），
    // 不随 #dataPanel 隐藏；若用户在旧模式打开列表后用 Ctrl+N / 设置里切换，会残留在画布上。
    if (activeDropdown) { activeDropdown.remove(); activeDropdown = null; }
    if (scrollListener) {
        window.removeEventListener('scroll', scrollListener);
        document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
        scrollListener = null;
    }
    const body = document.body;
    const newTopBar = document.getElementById('newTopBar');
    const sideList = document.getElementById('sideBlockList');
    const dataPanel = document.getElementById('dataPanel');
    
    const resizeHandle = document.getElementById('sideListResizeHandle');
    if (isNewLayoutMode) {
        body.classList.add('new-layout-active');
        if (newTopBar) newTopBar.style.display = 'flex';
        if (sideList) {
            sideList.style.display = 'block';
            // 根据侧边面板模式决定方块列表位置
            if (isSidePanelMode) {
                sideList.classList.remove('side-list-bottom');
                if (resizeHandle) resizeHandle.style.display = 'none';
            } else {
                sideList.classList.add('side-list-bottom');
                if (resizeHandle) {
                    resizeHandle.style.display = 'block';
                }
            }
            applySideListDimensions();
            updateSideListResizeHandle();
        }
        renderSideBlockList();
        updateSideListResizeHandle();   // 列表渲染完成后再定位蓝条，避免内容撑高后位置错位/不显示
        // 数据表内联数值面板：非侧边时展示选中方块/文件夹数据；侧边时隐藏（数值已内嵌大纲）
        const dtInsp = document.getElementById('dataTableInspector');
        if (dtInsp) dtInsp.style.display = '';   // 新布局下数据随“数据面板/≠”显示，不在此强制隐藏（与右侧方块列表互斥由显隐控制）
        // 新布局模式下数据表面板按内容自适应高度（清除旧模式遗留的 280px 固定高度，避免数据表被裁切）
        if (dataPanel) {
            dataPanel.style.height = '';
            dataPanel.style.borderRadius = '';   // 清除旧布局可能残留的内联圆角 → 回落到 CSS（面板上端 0 圆角）
            dataPanel.classList.remove('side-panel');   // 新布局下不独立侧显，避免与方块列表在右侧重叠成黑块
            // 新布局下数据面板默认隐藏（数据以内联 / 底部数据表呈现），由其自身显隐控制
            dataPanel.style.display = 'none';
        }
        syncDataPanelOffset();
        renderInspector();
        // 新操作模式时显示“新操作模式”分组、数据面板宽度设置，隐藏方块列表位置设置
        // revealSetting：显示项并确保其所在设置分组（可能默认收起）同步展开，避免被藏起来
        const revealSetting = (el) => { if (!el) return; el.style.display = 'flex'; };
        const newOpGroup = document.querySelector('.ui-settings-group[data-group="new-op"]');
        if (newOpGroup) newOpGroup.style.display = 'block';
        const worldAxisDispSetting = document.getElementById('worldAxisDispSetting');
        revealSetting(worldAxisDispSetting);
        const pivotLinkSetting = document.getElementById('pivotLinkSetting');
        revealSetting(pivotLinkSetting);
        revealSetting(sidePanelWidthSetting);
        const blockListTopLeftSetting = document.getElementById('blockListTopLeftSetting');
        if (blockListTopLeftSetting) blockListTopLeftSetting.style.display = 'none';
        const brushModeSetting = document.getElementById('brushModeSetting');
        revealSetting(brushModeSetting);
        const brushThicknessSetting = document.getElementById('brushThicknessSetting');
        revealSetting(brushThicknessSetting);
        const ptPrecisionSetting = document.getElementById('ptPrecisionSetting');
        revealSetting(ptPrecisionSetting);
        const ptKeepExprSetting = document.getElementById('ptKeepExprSetting');
        revealSetting(ptKeepExprSetting);
        const flagPoleSnapSetting = document.getElementById('flagPoleSnapSetting');
        if (flagPoleSnapSetting) flagPoleSnapSetting.style.display = 'flex';
        const measurePrecisionSetting = document.getElementById('measurePrecisionSetting');
        revealSetting(measurePrecisionSetting);
        const measureBoxSizeSetting = document.getElementById('measureBoxSizeSetting');
        revealSetting(measureBoxSizeSetting);
        const gizmoSubMemorySetting = document.getElementById('gizmoSubMemorySetting');
        revealSetting(gizmoSubMemorySetting);
    } else {
        body.classList.remove('new-layout-active');
        if (newTopBar) newTopBar.style.display = 'none';
        if (sideList) {
            sideList.style.display = 'none';
            sideList.classList.remove('side-list-bottom');
        }
        if (resizeHandle) resizeHandle.style.display = 'none';
        // 退出关键帧模式
        if (isKeyframeMode) {
            isKeyframeMode = false;
            if (keyframeWindowOpen && keyframeWindowEl) {
                stopKeyframePlayback();
                keyframeWindowEl.style.display = 'none';
                keyframeWindowOpen = false;
            }
        }
        // 恢复数据面板显示与默认高度（移除内联 style；旧非侧边模式恢复 280px 固定高度，侧边模式保持自适应）
        if (dataPanel) { dataPanel.style.display = ''; dataPanel.style.left = ''; dataPanel.style.height = isSidePanelMode ? '' : '280px'; }
        applySidePanelMode();   // 退出新布局后恢复数据面板侧显状态（若此前开启侧边显示）
        const dtInspExit = document.getElementById('dataTableInspector');
        if (dtInspExit) dtInspExit.style.display = 'none';
        // 非新操作模式时隐藏“新操作模式”分组，恢复方块列表位置设置
        const newOpGroup = document.querySelector('.ui-settings-group[data-group="new-op"]');
        if (newOpGroup) newOpGroup.style.display = 'none';
        const worldAxisDispSetting = document.getElementById('worldAxisDispSetting');
        if (worldAxisDispSetting) worldAxisDispSetting.style.display = 'none';
        const pivotLinkSetting = document.getElementById('pivotLinkSetting');
        if (pivotLinkSetting) pivotLinkSetting.style.display = 'none';
        const blockListTopLeftSetting = document.getElementById('blockListTopLeftSetting');
        if (blockListTopLeftSetting) blockListTopLeftSetting.style.display = 'flex';
        const brushModeSetting = document.getElementById('brushModeSetting');
        if (brushModeSetting) brushModeSetting.style.display = 'none';
        const brushThicknessSetting = document.getElementById('brushThicknessSetting');
        if (brushThicknessSetting) brushThicknessSetting.style.display = 'none';
        const flagPoleSnapSetting = document.getElementById('flagPoleSnapSetting');
        if (flagPoleSnapSetting) flagPoleSnapSetting.style.display = 'none';
        if (isBrushMode) exitBrushMode();
    }
    // 关闭所有下拉菜单
    closeAllTopDropdowns();
    if (uiSettingsPanel) uiSettingsPanel.style.display = 'none';
    // 同步关键帧模式开关/按钮视觉状态（切回新布局后需与 isKeyframeMode 对齐）
    syncKfModeUI();
    // ★【2026-10-13】旧操作模式 = 只读回放：布局切换后同步旧关键帧窗口上编辑类控件的显隐
    kfSyncLegacyReadOnlyUI();
    // 同步虚拟修饰键条显隐：新布局 + 非侧边时显示；侧边（桌面有实体键盘）/ 旧布局一律隐藏。
    // 必须在布局切换时显式调用，否则从「新布局」切到「旧布局」时键条会残留 vmk-on 类而继续显示。
    if (typeof syncVirtModKeybarVisibility === 'function') syncVirtModKeybarVisibility();
    // 同步数据视图头部细条显隐
    syncDataViewHeader();
}

// 拖拽进行中：renderSideBlockList 会被推迟而非立即重建，避免移除正在被拖拽的源节点
// （源节点被移除会导致原生 drag 的 dragend 永不触发，页面卡在拖拽态/定格）。
let _sideListRebuildQueued = false;

/* ★★★【2026-10-24 性能优化 · 侧栏列表两处减负】
   ① 事件委托：方块行内的操作按钮（复制 / 删除 / 隐藏 / 锁定 / 骨骼绑定 / 解绑）不再逐行
      addEventListener，改为在持久容器 #sideBlockList 上挂一次委托监听。
   ② 局部更新：选中 / 取消选中只改变 .selected 类时，不再重建整棵 DOM。
      HTML 生成时把「选中类」写成不可见标记 \u0001，渲染前先比较去掉标记后的结构 HTML：
      结构一致 ⇒ 就地切换类并返回；否则才写 innerHTML 并重绑行级事件。 */
const _SIDE_SEL_TOKEN = '\u0001';

/* 选中态差分：记录「上次真正写进 DOM 的选中集合」。
   若选中集合没变，直接跳过（连遍历都省）；变了也只切换 class 变化的行，不碰其余 2900 行。 */
let _sideSelState = null;
function _sideSelIsUnchanged() {
    const prev = _sideSelState;
    if (!prev) return false;
    if (prev.folder !== selectedFolder) return false;
    if (prev.blocks.size !== selectedBlocksSet.size) return false;
    for (const b of selectedBlocksSet) if (!prev.blocks.has(b)) return false;
    return true;
}
function _sideCommitSelState() {
    _sideSelState = { folder: selectedFolder, blocks: new Set(selectedBlocksSet) };
}
function _sideListApplySelectionDom(sideList) {
    if (!sideList) return;
    if (_sideSelIsUnchanged()) return;                   // 选中集合没变：零 DOM 操作
    // 行/文件夹头缓存（innerHTML 重建后重建一次），避免每次差分区都 querySelectorAll 整棵树
    let rows = sideList._selRows;
    if (!rows || !rows.length || rows[0].parentNode !== sideList) {
        rows = sideList._selRows = Array.from(sideList.querySelectorAll('.side-block-item[data-block-id]'));
    }
    const folderHeaders = sideList._selFolderRows || (sideList._selFolderRows = Array.from(sideList.querySelectorAll('.side-block-group-header')));
    // ① 先把「正在被选中」的行标记出来（O(n) 数组扫描，无 DOM 操作）
    const want = new Set(selectedBlocksSet);
    for (let i = 0; i < rows.length; i++) {
        const el = rows[i];
        const b = getBlockById(el.dataset.blockId);
        const on = !!(b && want.has(b));
        if (el._selOn !== on) { el.classList.toggle('selected', on); el._selOn = on; }
    }
    // ② 文件夹头
    for (let i = 0; i < folderHeaders.length; i++) {
        const el = folderHeaders[i];
        const on = selectedFolder === el.dataset.groupName;
        if (el._selOn !== on) { el.classList.toggle('selected', on); el._selOn = on; }
    }
    _sideCommitSelState();
}

// 行内操作按钮的事件委托（只挂一次）。返回 true 表示事件已被消费。
function _sideListActionDelegated(e, sideList, isTouch) {
    const SEL = '.side-block-copy,.side-block-delete,.side-block-eye,.side-block-lock,[data-bind-id],[data-unbind-id]';
    const t = (e.target && e.target.closest) ? e.target.closest(SEL) : null;
    if (!t || !sideList.contains(t)) return false;
    if (isTouch) e.preventDefault();
    e.stopPropagation();
    if (t.classList.contains('side-block-copy')) {
        if (!tryBlockAction('copy:' + t.dataset.id)) return true;
        const b = getBlockById(t.dataset.id);
        if (b) { duplicateBlock(b); renderSideBlockList(); }
        return true;
    }
    if (t.classList.contains('side-block-delete')) {
        if (!tryBlockAction('del:' + t.dataset.id)) return true;
        const b = getBlockById(t.dataset.id);
        if (b) {
            removeBlock(b);
            renderSideBlockList();
            if (selectedBlock) renderVariablesForBlock(selectedBlock);
        }
        return true;
    }
    if (t.classList.contains('side-block-eye')) {
        const b = getBlockById(t.dataset.eyeId);
        if (!b) return true;
        const targets = (selectedBlocksSet.size > 1 && selectedBlocksSet.has(b)) ? Array.from(selectedBlocksSet) : [b];
        setBlocksHidden(targets, !b.hidden);
        return true;
    }
    if (t.classList.contains('side-block-lock')) {
        const b = getBlockById(t.dataset.lockId);
        if (!b) return true;
        const targets = (selectedBlocksSet.size > 1 && selectedBlocksSet.has(b)) ? Array.from(selectedBlocksSet) : [b];
        setBlocksLocked(targets, !b.locked);
        return true;
    }
    if (t.dataset.bindId) {
        const b = getBlockById(t.dataset.bindId);
        if (b) {
            const sel = [...selectedBlocksSet];
            const useMulti = sel.length > 1 && sel.includes(b);
            showBoneModeSelector(useMulti ? sel : [b]);
        }
        return true;
    }
    if (t.dataset.unbindId) {
        const b = getBlockById(t.dataset.unbindId);
        if (!b) return true;
        // 只有 molang 表达式、没有 _boneParent 元数据的旧存档：先按表达式反推父级，再走标准解绑
        if (!b._boneParent && t.dataset.inferredParent) b._boneParent = t.dataset.inferredParent;
        unbindBone(b);
        try { recordAction(); } catch (_) {}
        renderSideBlockList();
        try { renderVariablesForBlock(selectedBlock); } catch (_) {}
        return true;
    }
    return true;
}

function ensureSideBlockActionsDelegation(sideList) {
    if (!sideList || sideList._actionsDelegated) return;
    sideList._actionsDelegated = true;
    // ★ 必须在**捕获阶段**拦截：行本身也挂着「点行 = 选中」的 click，
    //   气泡阶段才 stopPropagation 已经太晚（行监听先执行，会误触发选中）。
    sideList.addEventListener('click', (e) => { _sideListActionDelegated(e, sideList, false); }, true);
    // 触屏：父行 draggable 可能吞掉 click，故在 touchend 兜底（preventDefault 阻止随后的合成 click）
    sideList.addEventListener('touchend', (e) => { _sideListActionDelegated(e, sideList, true); }, { capture: true, passive: false });
}

function renderSideBlockList() {
    bumpDrawRev('ui');   // 侧栏刷新几乎总伴随选中/可见性变化：让大场景补一帧
    const sideList = document.getElementById('sideBlockList');
    if (!sideList) return;
    ensureSideBlockActionsDelegation(sideList);
    // 画笔模式：侧边列表改为显示「点集」，不显示方块列表
    // ★ 这两种模式会整体改写容器内容 ⇒ 清掉结构缓存，退出模式后必重建
    if (isBrushMode) { sideList._structHtml = null; sideList._modeKey = null; sideList._selRows = null; sideList._selFolderRows = null; _sideSelState = null; ptRenderSideList(sideList); return; }
    // ★【2026-10-13】关键帧模式：这块面板整体改为「关键帧时间表」
    //   （时间 × 变量 × 数值 + 分段表达式折叠栏；沿用新操作模式的面板样式与横竖自适应）
    if (isNewLayoutMode && isKeyframeMode) { sideList._structHtml = null; sideList._modeKey = null; sideList._selRows = null; sideList._selFolderRows = null; _sideSelState = null; kfRenderTimelinePanel(sideList); return; }
    // 拖拽中暂停重建：记下“需要重建”，等 dragend 后再做。
    // 自愈兜底：若拖拽异常中断导致 dragend 丢失（blockDragSrcId/folderDragSrcName 残留），
    // 超过 12 秒强制清理——否则列表永不刷新，所有文件夹按钮（折叠/隐藏/管理/删除）点击后
    // 界面都不更新，表现为“按键均无效”（用户报告）。
    if (blockDragSrcId || folderDragSrcName) {
        if (_dragSrcTs && Date.now() - _dragSrcTs > 12000) {
            blockDragSrcId = null; folderDragSrcName = null; _dragSrcTs = 0;
        } else {
            _sideListRebuildQueued = true; return;
        }
    }
    _sideListRebuildQueued = false;
    // 清理可能遗留在 body 上的工具菜单副本（菜单打开时若发生重渲染，会被移出面板挂在 body 下）
    // ★【2026-10-24】用 querySelectorAll 清全部：getElementById 只拿到面板里新建的那个，
    //   挂在 body 上的旧副本会被漏掉，变成一直飘在屏幕上的残影菜单。
    document.querySelectorAll('body > .outliner-tools-menu').forEach(m => m.remove());

    const isKfMode = isNewLayoutMode && isKeyframeMode;
    
    const kfReady = _kfSystemReady;
    /* ★【2026-10-24 事故修复】TDZ 守卫：`keyframePlaying` 在本文件后段用 let 声明，
       而模块初始化早期 applyNewLayoutMode() 就会走到这里。`typeof x` 对「TDZ 中的 let」
       同样抛 ReferenceError（不是返回 'undefined'），会直接中断整个模块初始化 ——
       表现就是项目列表空白、没有新建入口（用户报告）。所以统一用 try/catch 取值。 */
    let kfPlayingKey = 0;
    try { kfPlayingKey = keyframePlaying ? 1 : 0; } catch (e) { /* 初始化早期，忽略 */ }
    // 结构缓存另需带上「模式/布局」维度：同一份 HTML 在不同布局下容器语义不同
    const sideModeKey = `${isNewLayoutMode ? 1 : 0}|${isKfMode ? 1 : 0}|${isSidePanelMode ? 1 : 0}|${kfReady ? 1 : 0}|${kfPlayingKey}`;
    
    // 关键帧模式：显示所有方块（未加入关键帧系统的显示为不可选中状态）；普通模式：显示所有方块
    const displayBlocks = blocks;

    // 一次性收集“molang 骨源”方块 id：发布 t.<id>_px/py/pz/xrot/yrot/zrot 全局变量（供子块 molang 跟随）。
    // 传给 cubeItemHtml，避免逐块扫描全局变量。
    const molangSourceIds = new Set();
    for (const [n, g] of globalVars) {
        if (g && g.sourceBlockId && /_(px|py|pz|xrot|yrot|zrot)$/.test(n)) molangSourceIds.add(g.sourceBlockId);
    }
    
    let html = '';

    // 大纲标题：旧/新操作模式都显示“方块列表”
    html += `<div class="outliner-header"><span style="font-size:13px;font-weight:600;color:#60a5fa;">方块列表</span></div>`;

    if (isNewLayoutMode) {
        // 新操作模式：关键帧 / 欧拉角 / 全部选中 收纳到「工具」下拉（位于新建文件夹右侧）
        const wrenchSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M21.7 5.6c.5-1.1.4-2.4-.3-3.3-.7-.9-1.9-1.4-3.1-1.3l2.3 2.3-1.9 1.9-3.3-3.3 2.3-2.3c-.1 1.3.4 2.5 1.3 3.3.9.7 2.2.9 3.3.3L19 4.6c-.6.6-.6 1.5 0 2.1l-4.2 4.2c-.6.6-1.5.6-2.1 0-.6-.6-.6-1.5 0-2.1l4.2-4.2c.6-.6 1.5-.6 2.1 0l1.7-1.7zM4.5 17.8l-1.9 1.9 3.3 3.3c.6.6 1.5.6 2.1 0l7.7-7.7c-1.4-.5-2.6-1.4-3.5-2.8l-7.7 7.7z"/></svg>';
        // 工具菜单图标：单色描边 SVG，currentColor 跟随条目文字色（悬停 / 浅色主题自动变色），替代原来的彩色 emoji。
        const tmIco = (() => {
            const a = 'viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
            return {
                check:  `<svg ${a}><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12.3l2.8 2.8L16 9.4"/></svg>`,
                unlock: `<svg ${a}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7"/></svg>`,
                eye:    `<svg ${a}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
                rotate: `<svg ${a}><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M21 4v5h-5"/></svg>`,
                pivot:  `<svg ${a}><circle cx="12" cy="12" r="8.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></svg>`,
                hash:   `<svg ${a}><path d="M5 9h14M4 15h14M10 4l-2 16M16 4l-2 16"/></svg>`,
                mirror: `<svg ${a}><path d="M12 3v18" stroke-dasharray="3 2.5"/><path d="M9.5 6.5L4 12l5.5 5.5"/><path d="M14.5 6.5L20 12l-5.5 5.5"/></svg>`
            };
        })();
        // 视图切换按钮（图形）：内联在三个图标左侧，用斜杠分隔；仅「新布局 + 非侧边（手机底部）」显示。
        const viewToggleSvg = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="5.2" height="5.2" rx="0.9"/><rect x="8.8" y="2" width="5.2" height="5.2" rx="0.9"/><rect x="2" y="8.8" width="5.2" height="5.2" rx="0.9"/><rect x="8.8" y="8.8" width="5.2" height="5.2" rx="0.9"/></svg>';
        const viewToggleHtml = !isSidePanelMode
            ? `<button type="button" class="view-toggle-btn" id="quickViewToggleBtn" title="切换到数据表">${viewToggleSvg}</button><span class="outliner-actions-sep">/</span>`
            : '';
        html += `<div class="outliner-actions">
            ${viewToggleHtml}${!isKfMode ? `<button type="button" class="outliner-header-btn" id="sideBlockNew" title="新建方块">+</button>
            <button type="button" class="outliner-header-btn" id="sideBlockNewFolder" title="新建文件夹">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M2 2h4l2 2h6v2H2V2z"/><path d="M2 6h12v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6z"/><path d="M7 8h2v2h2v1H9v2H8v-2H6v-1h2V8z"/></svg>
            </button>
            <div class="side-block-bone-btn" id="sideBlockBone" title="为当前选中方块选择父级方块进行骨骼绑定（紫色加号）">✛</div>` : ''}
            <div class="outliner-tools-wrapper" style="position:relative;display:inline-flex;">
                <button type="button" class="outliner-header-btn outliner-tools-btn ${isKfMode ? 'kf-active' : ''}" id="outlinerToolsBtn" title="工具">${wrenchSvg}</button>
                <div class="outliner-tools-menu" id="outlinerToolsMenu">
                    ${!isKfMode ? `<div class="outliner-tools-menu-item side-block-all" id="sideBlockAll"><span class="tm-ico">${tmIco.check}</span><span class="tm-label">全部选中 (${displayBlocks.filter(b => !isBlockHidden(b) && !isBlockLocked(b)).length})</span></div>
                    <div class="outliner-tools-menu-divider"></div>` : ''}
                    <div class="outliner-tools-menu-item" id="sideBlockUnlockAll" title="清除所有方块的锁定状态（全部可重新选中）"><span class="tm-ico">${tmIco.unlock}</span><span class="tm-label">取消锁定</span></div>
                    <div class="outliner-tools-menu-item" id="sideBlockUnhideAll" title="清除所有方块的隐藏状态（全部恢复显示）"><span class="tm-ico">${tmIco.eye}</span><span class="tm-label">取消隐藏</span></div>
                    <div class="outliner-tools-menu-subtitle">该功能作用于本项目的所有方块</div>
                    <div class="outliner-tools-menu-divider"></div>
                    <div class="outliner-tools-menu-item" id="sideBlockEuler" style="color:#60a5fa;"><span class="tm-ico">${tmIco.rotate}</span><span class="tm-label">欧拉角转换</span></div>
                    <!-- ★【2026-10-24 用户要求】「枢轴归位到原点」与关键帧时间表里的同名工具合流：同一套实现（kfBlockToolPivotToOrigin），
                         有动画时写当前帧、无动画时写常量；模型世界位置保持不变（pos→basepos）。 -->
                    <div class="outliner-tools-menu-item" id="sideBlockPivotOrigin" title="把选中方块的枢轴归位到自身原点（0,0,0），模型在场景中的位置保持不变"><span class="tm-ico">${tmIco.pivot}</span><span class="tm-label">枢轴归位到原点</span></div>
                    <div class="outliner-tools-menu-item" id="sideBlockAlignPivot" title="方式2（当前方式）：把当前选中方块的枢轴归到骨骼原点/骨骼枢轴，模型位置不变（pos→basepos）"><span class="tm-ico">${tmIco.pivot}</span><span class="tm-label">归位枢轴到骨骼（方式2：方块枢轴→骨骼原点）</span></div>
                    <div class="outliner-tools-menu-item" id="sideBlockAlignBonePivot" title="方式1：以本层级方块（不含子文件夹）出现频率最高的枢轴，直接作为整个骨骼的枢轴"><span class="tm-ico">${tmIco.pivot}</span><span class="tm-label">归位枢轴到骨骼（方式1：最频繁枢轴→骨骼枢轴）</span></div>
                    <div class="outliner-tools-menu-item" id="sideBlockConstantize" title="删除选中方块的全部中间变量/表达式，仅保留变换核心变量并取其当前值（常量化），便于 Gizmo 直接操控"><span class="tm-ico">${tmIco.hash}</span><span class="tm-label">表达式常量化</span></div>
                    <!-- ★【2026-10-24 用户要求】镜像属于「工具」而非 Gizmo 控件，故收进扳手工具菜单：
                         ①自由对称面：进入后自己摆一张可旋转的对称面；
                         ②选取面作为对称面：点方块上的面，对称面与该面完全重合；
                         ③三点确定对称面：依次点三个方块顶点，三点定一张任意朝向的对称面（可跨方块取点）。 -->
                    <div class="outliner-tools-menu-divider"></div>
                    <div class="outliner-tools-menu-subtitle">镜像：把选中方块按对称面反射（进入后可在气泡里切换「镜像模型生成 / 自身对称」）</div>
                    <div class="outliner-tools-menu-item" id="sideBlockMirrorFree" title="进入镜像：自由摆放并旋转对称面（拖箭头平移、拖圆环倾斜）"><span class="tm-ico">${tmIco.mirror}</span><span class="tm-label">自由对称面</span></div>
                    <div class="outliner-tools-menu-item" id="sideBlockMirrorFace" title="进入镜像：点选方块上的一个面，对称面与该面完全重合"><span class="tm-ico">${tmIco.mirror}</span><span class="tm-label">选取面作为对称面</span></div>
                    <div class="outliner-tools-menu-item" id="sideBlockMirrorVtx" title="进入镜像：依次点击三个方块顶点确定对称面（三个点可来自不同方块）"><span class="tm-ico">${tmIco.mirror}</span><span class="tm-label">三点确定对称面</span></div>
                    <!-- ★【2026-10-31 用户要求】「自身对称」不做成第四个入口，而是气泡里的结果方式切换按钮：
                         三种定面方式（自由 / 选面 / 选点）都能切到「自身对称」，此时方块本身反射过去、不新建方块；
                         有关键帧动画时，镜像姿态写成当前时刻的关键帧。 -->
                    <div class="outliner-tools-menu-subtitle">自身对称：方块本身反射过去，不新建方块（有关键帧时写入当前时刻的帧）</div>
                </div>
            </div>
        </div>`;
        if (isKfMode) {
            html += `<div style="font-size:11px;color:#a855f7;padding:4px 12px 6px;">🎬 点击方块选中并编辑关键帧 (${displayBlocks.length})</div>`;
        }
    } else {
        /* ★【2026-10-20 用户要求】旧操作模式的关键帧只做「播放 / 停止」，不再弹出悬浮窗
           （编辑关键帧统一走新操作模式的动画模式）。入口按钮直接变成播放开关。 */
        // 画笔模式下禁用关键帧入口（避免创建平面后该按钮异常显示）
        const kfHiddenStyle = isBrushMode ? 'display:none;' : '';
        const kfPlaying = kfPlayingKey === 1;
        const kfActiveStyle = kfPlaying
            ? `border-bottom:2px solid #a855f7;margin-bottom:4px;padding-bottom:8px;color:#a855f7;background:rgba(168,85,247,0.1);border-radius:6px;${kfHiddenStyle}`
            : `border-bottom:1px solid rgba(59,130,246,0.3);margin-bottom:4px;padding-bottom:8px;color:#facc15;${kfHiddenStyle}`;
        html += `<div class="side-block-item side-block-box" id="sideBlockKeyframe" style="${kfActiveStyle}" title="${kfPlaying ? '停止播放关键帧动画' : '播放关键帧动画'}">
            <span>${kfPlaying ? '⏸ 停止播放' : '▶ 播放动画'}</span>
        </div>`;
        // 欧拉角转换入口（两种模式都显示）
        html += `<div class="side-block-item side-block-box" id="sideBlockEuler" style="border-bottom:1px solid rgba(59,130,246,0.3);margin-bottom:4px;padding-bottom:8px;color:#60a5fa;" title="将 rotatex/y/z 换算为 xrot/y/zrot">
            <span>🔄 欧拉角转换</span>
        </div>`;
        html += `<div class="side-block-item side-block-box" id="sideBlockConstantize" style="border-bottom:1px solid rgba(59,130,246,0.3);margin-bottom:4px;padding-bottom:8px;color:#f59e0b;" title="删除选中方块的全部中间变量/表达式，仅保留变换核心变量并取其当前值（常量化）">
            <span>🔢 表达式常量化</span>
        </div>`;
        if (!isKfMode) {
            // 普通模式：全选
            html += `<div class="side-block-item side-block-box side-block-all" id="sideBlockAll">全部选中 (${displayBlocks.filter(b => !isBlockHidden(b) && !isBlockLocked(b)).length})</div>`;
            html += `<div style="height:1px; background:rgba(59,130,246,0.2); margin:0 8px 6px 8px;"></div>`;
            // 新建方块 + 新建文件夹 + 紫色加号骨骼绑定按钮（恢复自备份）
            html += `<div class="outliner-actions">
                <button type="button" class="outliner-header-btn" id="sideBlockNew" title="新建方块">+</button>
                <button type="button" class="outliner-header-btn" id="sideBlockNewFolder" title="新建文件夹">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M2 2h4l2 2h6v2H2V2z"/><path d="M2 6h12v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6z"/><path d="M7 8h2v2h2v1H9v2H8v-2H6v-1h2V8z"/></svg>
                </button>
                <div class="side-block-bone-btn" id="sideBlockBone" title="为当前选中方块选择父级方块进行骨骼绑定">✛</div>
            </div>`;
        } else {
            // 关键帧模式：显示提示和动画方块数
            html += `<div style="font-size:11px;color:#a855f7;padding:4px 12px 6px;">🎬 点击方块选中并编辑关键帧 (${displayBlocks.length})</div>`;
        }
    }

    // 数值显示区（文件夹数值 / 方块常量）：仅“侧边显示”模式下随大纲内嵌数据栏；
    // 非侧边显示状态（底部 ☰ / ≠ 快捷按钮）不再内嵌数据栏，避免重复占用空间
    if (isSidePanelMode) {
        html += `<div id="inspectorPanel" class="inspector-panel"></div>`;
    }
    
    if (displayBlocks.length === 0 && isKfMode) {
        html += `<div class="side-block-item side-block-box" style="color:#64748b;font-size:12px;justify-content:center;cursor:default;">
            暂无动画方块，在关键帧窗口添加
        </div>`;
    }
    
    // 按组（文件夹）分组方块
    const groupedBlocks = {};
    const ungroupedBlocks = [];
    
    displayBlocks.forEach(b => {
        if (b.group && getFolder(b.group)) {
            if (!groupedBlocks[b.group]) groupedBlocks[b.group] = [];
            groupedBlocks[b.group].push(b);
        } else {
            ungroupedBlocks.push(b);
        }
    });
    
    // 显式 molang 骨骼绑定按钮（紫色加号 ✛）：旧/新操作模式都显示，仅关键帧模式隐藏。
    // 已绑定则显示「解绑」，未绑定则显示紫色 ✛（点开后选父级方块）。
    const boneBtnHtml = (b) => {
        if (isKfMode) return '';
        const inferredParent = inferMolangBoneParent(b);
        const parentId = b._boneParent || inferredParent;
        // ★ 只有【真 molang 绑定】才显示「解绑」。静态文件夹骨骼子块虽然也有 _boneParent，
        //   但按定稿语义它是纯分组、没有任何 molang 可解 —— 显示「解绑」既误导用户，点了还会
        //   unbindBone 把文件夹层级拆掉。这类块一律按【未绑定】显示紫色 ✛。
        if (isBoneMolangDriven(b)) {
            return `<button class="side-block-unbind" data-unbind-id="${b.id}" data-inferred-parent="${escapeHtml(String(inferredParent || ''))}" title="解除 molang 骨骼绑定（当前父级：${escapeHtml(String(parentId))}）">解绑</button>`;
        }
        // ★2026-10-04：新操作模式把「绑定」紫色加号（✛）**移到方块列表下方工具栏**（sideBlockBone），
        //   行内不再渲染 ✛（「解绑」仍逐块保留，因为它针对具体一块）。旧操作模式保持行内 ✛ 不变。
        if (isNewLayoutMode) return '';
        // 静态文件夹骨骼子块：无 molang 绑定，✛ 的 title 需说明它当前归属哪个文件夹骨干，
        // 避免用户以为层级丢了（层级仍由文件夹骨干维持，只是不走 molang）。
        const _bf = (b.group && getFolder(b.group)) ? getFolder(b.group) : null;
        const _isFolderBoneChild = !!(parentId && _bf && _bf._backbone === parentId);
        const _title = _isFolderBoneChild
            ? `文件夹「${escapeHtml(String(b.group))}」静态骨骼子块（骨干：${escapeHtml(String(parentId))}，无 molang 绑定）；点击可显式绑定到其它父级方块`
            : '选择父级方块进行 molang 骨骼绑定';
        return `<button class="side-block-bind" data-bind-id="${b.id}" title="${_title}">✛</button>`;
    };
    // 生成单个方块条目 HTML（供文件夹内与未分组共用）
    // depth: 在骨骼树中的层级缩进（0 = 根，子骨骼逐层右移）
    // inFolder: 是否位于文件夹内（决定要不要 side-block-group-item 的蓝色竖线）
    const cubeItemHtml = (b, depth = 0, inFolder = false) => {
        const isSel = selectedBlocksSet.has(b);
        // ★ Molang 编辑模式方块不显示紫色关键帧角标（它整体退出关键帧系统，不是关键帧方块）
        const isKfBlock = kfReady && !isMolangModeBlock(b) && keyframeData.has(b.id);
        // 动画模式：普通方块禁用；非动画模式：动画方块禁用
        const disabledClass = (isKfMode && !isKfBlock) || (!isKfMode && isKfBlock) ? 'side-block-disabled' : '';
        // 只要是动画方块就显示紫色小三角形（含骨骼文件夹：其关键帧在 boneKeyframes，不落 keyframeData）
        const kfBadge = isKfBlock ? '<span class="side-block-kf-badge"></span>' : '';
        // molang 驱动高亮：方块变换由 molang 表达式驱动（或完全接管 / 骨源发布）时，自动加样式类 + 角标，
        // 让导入/编辑后“哪些方块被 molang 控制”一目了然，无需手动开关。
        const molangInfo = blockMolangInfo(b, molangSourceIds);
        const molangClass = molangInfo ? ` side-block-molang side-block-molang-${molangInfo.kind}` : '';
        // 骨骼标记：骨干方块 = 方块名斜体（不再显示橙色条纹和 ★ 星标，用户认为太土）；
        // 判定条件：① 文件夹的 _backbone 指向该块（显式骨干）；② 该块是骨骼根（有 _rotatex 全局变量）。
        // 条件② 覆盖单方块文件夹（enterKeyframeMode 不自动设 _backbone），确保跨文件夹/单方块骨骼的根也标斜体。
        const _f = b.group ? getFolder(b.group) : null;
        const isBackbone = !!(_f && (_f._backbone === b.id || isBoneRoot(b)));
        const nameStyle = isBackbone ? ' style="font-style:italic;font-weight:600;"' : '';
        const folderClass = inFolder ? ' side-block-group-item' : '';
        const indentStyle = depth > 0 ? ` style="margin-left:${depth * 16}px;"` : '';
        // 单项隐藏：整行降透明度 + 名字划线（仅方块自身 hidden；文件夹隐藏时行本身不变灰）
        const hiddenClass = b.hidden ? ' side-block-hidden' : '';
        // ★2026-10-04 方块锁定：只禁止选中、仍显示。名字前挂一把小锁（svg 不是 span，不会被隐藏划线规则命中）。
        const lockedClass = b.locked ? ' side-block-locked' : '';
        const lockMark = b.locked ? getBlockLockIcon(true, 'side-block-lock-mark') : '';
        return `<div class="side-block-item${folderClass} ${isSel ? _SIDE_SEL_TOKEN : ''} ${disabledClass}${molangClass}${hiddenClass}${lockedClass}" data-block-id="${b.id}"${indentStyle}>
            <div class="side-block-box">
                <span class="side-block-name-wrap">${kfBadge}${lockMark}<span${nameStyle}>❒ ${b.id}</span></span>
                <div class="side-block-actions">
                    <button class="side-block-eye" data-eye-id="${b.id}" title="${b.hidden ? '显示该方块（当前隐藏：不显示且无法选中）' : '隐藏该方块（不显示且无法选中）'}">${getGroupEyeIcon(!!b.hidden)}</button>
                    <button class="side-block-lock" data-lock-id="${b.id}" title="${b.locked ? '解锁该方块（当前锁定：禁止选中，仍显示）' : '锁定该方块（禁止选中，仍保持显示）'}">${getBlockLockIcon(!!b.locked)}</button>
                    ${!isKfMode ? `<button class="side-block-copy" data-id="${b.id}" title="复制">复制</button>` : ''}
                    ${boneBtnHtml(b)}
                    <button class="side-block-delete" data-id="${b.id}" title="删除">删除</button>
                </div>
            </div>
        </div>`;
    };

    // 全局骨骼父子关系（所有方块）：用于跨文件夹显示骨骼树。
    // 子块即便在别的文件夹 / 未分组，只要在骨骼树里是某块的子，就缩进显示在该父块下方，
    // 真正反映 _boneParent 建立的父子层级（旧版列表此前的短板：跨文件夹绑定看不出树形）。
    const boneChildrenByParent = new Map();
    blocks.forEach(b => {
        const p = b._boneParent || inferMolangBoneParent(b);
        if (p && blocks.some(x => x.id === p)) {
            if (!boneChildrenByParent.has(p)) boneChildrenByParent.set(p, []);
            boneChildrenByParent.get(p).push(b);
        }
    });

    // 文件夹级骨骼父子关系：子骨骼文件夹应缩进显示在父骨骼文件夹下。
    // 判定：子骨骼文件夹的骨干方块 _boneParent 指向的父方块，其所在文件夹即为父骨骼文件夹。
    const folderBoneParent = new Map();
    const folderBoneChildren = new Map();
    folders.forEach(f => {
        if (!f._backbone) return;
        const backbone = blocks.find(b => b.id === f._backbone);
        if (!backbone || !backbone._boneParent) return;
        const parentBlock = blocks.find(b => b.id === backbone._boneParent);
        if (!parentBlock || !parentBlock.group) return;
        const parentFolder = getFolder(parentBlock.group);
        if (!parentFolder || parentFolder.name === f.name) return;
        folderBoneParent.set(f.name, parentFolder.name);
        if (!folderBoneChildren.has(parentFolder.name)) folderBoneChildren.set(parentFolder.name, []);
        folderBoneChildren.get(parentFolder.name).push(f);
    });
    // 已渲染集合：跨所有分组共享，保证一个块（尤其被父文件夹“拉过来”的未分组子块）只出现一次
    const renderedBoneBlocks = new Set();
    // 已渲染集合：保证子骨骼文件夹只被渲染一次（避免既是普通子文件夹又是骨骼子文件夹时重复）
    const renderedBoneFolders = new Set();
    const renderBoneSubtree = (b, baseDepth, depth, inFolder) => {
        if (renderedBoneBlocks.has(b.id)) return;
        renderedBoneBlocks.add(b.id);
        html += cubeItemHtml(b, baseDepth + depth, inFolder);
        const children = boneChildrenByParent.get(b.id) || [];
        children.forEach(child => renderBoneSubtree(child, baseDepth, depth + 1, inFolder));
    };

    // 递归渲染文件夹树（支持嵌套：父文件夹收起时其所有子级一并隐藏）
    const renderFolderNode = (folderName, depth) => {
        if (renderedBoneFolders.has(folderName)) return;
        renderedBoneFolders.add(folderName);
        const group = getFolder(folderName);
        if (!group) return;
        const groupBlocks = groupedBlocks[folderName] || [];
        const expandedClass = group.expanded ? '' : 'collapsed';
        const isFolderSelected = (selectedFolder === folderName);
        const treePad = depth > 0 ? ` style="padding-left:${depth * 12}px;"` : '';
        html += `<div class="side-block-tree-node"${treePad}>`;
        html += `<div class="side-block-group-header${isFolderSelected ? ' ' + _SIDE_SEL_TOKEN : ''}" draggable="true" data-group-name="${escapeHtml(group.name)}">
            <button type="button" class="side-block-group-toggle" draggable="false" data-group="${escapeHtml(group.name)}" title="折叠/展开">
                <svg class="folder-chevron" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="transform:rotate(${group.expanded ? 90 : 0}deg)"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
            </button>
            <span class="side-block-group-name">
                <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="#7dd3fc"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                ${group.name}
            </span>
            <div class="side-block-group-actions">
                <button class="side-block-group-eye" data-group="${escapeHtml(group.name)}" title="${group.hidden ? '显示组内模型' : '隐藏组内模型'}">${getGroupEyeIcon(!!group.hidden)}</button>
                <button class="side-block-group-manage" data-group="${escapeHtml(group.name)}" title="管理">管理</button>
                ${(!isNewLayoutMode && !isKfMode && groupBlocks.length >= 2) ? `<select class="side-block-backbone-select" data-group="${escapeHtml(group.name)}" title="设为骨干方块（文件夹骨骼的根；选择后其余方块自动绑定到它）">
                    <option value="">骨干…</option>
                    ${groupBlocks.map(b => `<option value="${escapeHtml(b.id)}" ${group._backbone === b.id ? 'selected' : ''}>${escapeHtml(b.id)}</option>`).join('')}
                    ${group._backbone ? '<option value="__clear__">解除骨干</option>' : ''}
                </select>` : ''}
                <button class="side-block-group-delete" data-group="${escapeHtml(group.name)}" title="删除文件夹">×</button>
            </div>
        </div>`;
        html += `<div class="side-block-group-content ${expandedClass}" data-group-name="${escapeHtml(group.name)}">`;
        if (groupBlocks.length === 0) {
            html += `<div class="side-block-group-empty" data-group-name="${escapeHtml(group.name)}">暂无方块</div>`;
        } else if (group._backbone) {
            // 骨骼文件夹：成员方块在视觉上视为同一骨骼的“皮肤/组成部分”，全部平级显示。
            // 子父缩进只在“子骨骼文件夹”这一层体现，避免骨干方块把同文件夹成员挤成子级。
            groupBlocks.forEach(b => {
                if (renderedBoneBlocks.has(b.id)) return;
                renderedBoneBlocks.add(b.id);
                html += cubeItemHtml(b, 0, true);
            });
        } else {
            // 普通文件夹：按 _boneParent 骨骼树组织：本地根（父不在本文件夹）先行，子树（含跨文件夹 / 未分组的子块）缩进显示在父块下方
            const localRoots = groupBlocks.filter(b => !b._boneParent || !groupBlocks.some(x => x.id === b._boneParent));
            localRoots.forEach(r => renderBoneSubtree(r, 0, 0, true));
        }
        // 递归渲染子文件夹（仅当父文件夹展开时）
        if (group.expanded) {
            getChildFolders(folderName).forEach(cf => renderFolderNode(cf.name, depth + 1));
            // 子骨骼文件夹：按骨骼关系缩进显示在父骨骼文件夹下（不依赖 folder.parentName）
            const boneChildFolders = folderBoneChildren.get(folderName) || [];
            boneChildFolders.forEach(cf => {
                if (renderedBoneFolders.has(cf.name)) return;
                renderFolderNode(cf.name, depth + 1);
            });
        }
        // 本级文件夹内容的底部横线：位于全部方块与各层级子文件夹之后，标记本级文件夹结束点
        html += `<div class="side-block-group-divider" data-group-name="${escapeHtml(group.name)}"></div>`;
        html += `</div></div>`;
    };
    
    // 先渲染根文件夹（排除作为其他文件夹子骨骼的文件夹，它们会被父骨骼文件夹拉进去）
    getRootFolders().forEach(f => {
        if (folderBoneParent.has(f.name)) return;
        renderFolderNode(f.name, 0);
    });
    
    // 显示未分组的方块：按骨骼树组织；已被父文件夹“拉走”的未分组子块不再重复出现
    if (ungroupedBlocks.length > 0) {
        // ★ 只渲染「父不在未分组区域」的根块，子块交由 renderBoneSubtree 递归缩进显示在其父下方。
        // 否则当子块显示顺序位于父块【之前】时，子块会先被当 root 渲染(无缩进)，
        // 父块处理时子块已 rendered 被跳过 → 缩进丢失（用户报：绑定后无缩进、且“子块显示在父块上面时出现”）。
        const ungroupedRoots = ungroupedBlocks.filter(b => {
            const p = b._boneParent || inferMolangBoneParent(b);
            return !p || !ungroupedBlocks.some(x => x.id === p);
        });
        ungroupedRoots.forEach(r => renderBoneSubtree(r, 0, 0, false));
    }
    
    /* ★【2026-10-24 性能优化】结构没变（只是选中集合 / 当前文件夹变了）时不重建 DOM：
       比较「去掉选中标记 \u0001 的结构 HTML」，一致 ⇒ 就地切换 .selected 类并返回。
       这样几百个方块时，选中 / 取消 / 多选 / 点文件夹都不会再解析整棵 innerHTML、重绑全部行事件。 */
    const structHtml = html.split(_SIDE_SEL_TOKEN).join('');
    if (sideList._structHtml === structHtml && sideList._modeKey === sideModeKey) {
        _sideListApplySelectionDom(sideList);
        renderInspector();
        if (isNewLayoutMode) updateSideListResizeHandle();
        if (folderAxesDirty) {
            try { updateFolderAxes(); } catch (e) {}
            folderAxesDirty = false;
        }
        return;
    }
    sideList._structHtml = structHtml;
    sideList._modeKey = sideModeKey;
    sideList.innerHTML = html.split(_SIDE_SEL_TOKEN).join(' selected');
    // ★ 重建后刷新差分区缓存：行、文件夹头、以及「已写进 DOM 的选中态」
    sideList._selRows = Array.from(sideList.querySelectorAll('.side-block-item[data-block-id]'));
    sideList._selFolderRows = Array.from(sideList.querySelectorAll('.side-block-group-header'));
    for (let i = 0; i < sideList._selRows.length; i++) sideList._selRows[i]._selOn = sideList._selRows[i].classList.contains('selected');
    for (let i = 0; i < sideList._selFolderRows.length; i++) {
        const el = sideList._selFolderRows[i];
        el._selOn = el.classList.contains('selected');
    }
    _sideCommitSelState();

    // 渲染数值显示区（文件夹 / 选中方块常量；其内部会同步数据面板头部按钮）
    renderInspector();

    // 绑定事件
    sideList.querySelectorAll('.side-block-item[data-block-id]').forEach(item => {
        // 多选选择逻辑：供 click 与 移动端长按 共用（长按等价电脑端 Ctrl+左键）
        const applySideSelect = (block, isMulti) => {
            if (isKfMode) {
                if (isMulti) {
                    toggleBlockSelection(block, true);
                } else {
                    selectedBlocksSet.clear();
                    selectedBlocksSet.add(block);
                    selectBlock(block);
                }
                // ★【2026-10-17 修复 · 用户投诉「老是会自动添加方块进入关键帧」】
                //   旧实现在关键帧模式下**只要点选侧边栏方块**就静默 initKeyframeForBlock 建空条目，
                //   于是方块凭空出现在时间轴（带「未添加」标签），用户完全没主动添加过。
                //   现改为：点选只做选中；「加入动画」只走用户主动入口（+关键帧 / ❒选择器 / 导入）。
                selectKeyframeBlock(block.id, isMulti);
                if (!keyframeWindowOpen) {
                    openKeyframeWindow();
                } else if (keyframeWindowEl) {
                    keyframeWindowEl.style.display = 'flex';
                }
                renderSideBlockList();
            } else {
                toggleBlockSelection(block, isMulti);
                renderSideBlockList();
            }
        };

        let lpTimer = null, isLongPress = false;

        item.addEventListener('click', (e) => {
            if (e.target.closest('.side-block-actions')) return;
            if (isLongPress) { isLongPress = false; return; }  // 长按已处理，忽略紧随的 click
            const bid = item.dataset.blockId;
            const block = blocks.find(b => b.id === bid);
            if (block) {
                // 关键帧模式下，未加入动画列表的方块不可选中（Molang 编辑模式方块除外：它本就不属关键帧系统）
                // ★【2026-10-18 r33】判据统一为 kfBlockIsInAnimation()（= 已加入动画列表），
                //   不再只看 keyframeData —— 否则「用「+全部」按文件夹（骨级）整组加入」的方块
                //   明明已在动画列表里、时间轴上有轨道，却在侧栏点不中（两处门禁口径打架）。
                if (isKfMode && kfReady && !isKeyframeSelectableBlock(block)) {
                    return;
                }
                // 非关键帧模式下，已加入关键帧系统的方块不可选中（Molang 编辑模式方块不属于关键帧系统，可选）
                if (!isKfMode && kfReady && isKeyframeRegistryBlock(block)) {
                    return;
                }
                const isMulti = kfIsMultiGesture(e);   // ★【2026-10-18】含「多选锁定」开关
                applySideSelect(block, isMulti);
            }
        });

        // 移动端长按 = 电脑端 Ctrl+左键 多选（含触屏与鼠标长按，等价）
        const fireLongPress = () => {
            isLongPress = true;
            const bid = item.dataset.blockId;
            const block = blocks.find(b => b.id === bid);
            if (!block) return;
            if (isKfMode && kfReady && !isKeyframeSelectableBlock(block)) return;
            if (!isKfMode && kfReady && isKeyframeRegistryBlock(block)) return;
            applySideSelect(block, true);
            if (navigator.vibrate) { try { navigator.vibrate(30); } catch (_) {} }
        };
        // 在「复制 / 删除」按钮上按下时不要启动长按计时器，否则长按（手机上很常见）会触发
        // fireLongPress → renderSideBlockList 重建列表 → 把正在按的按钮从 DOM 移除 → 点击落空，
        // 表现为「删除键按不动」。复制/删除只走自身 click，不参与长按多选。
        const _isOnActions = (e) => !!(e.target && e.target.closest && e.target.closest('.side-block-actions'));
        item.addEventListener('touchstart', (e) => {
            if (_isOnActions(e)) {
                // 触屏按到「复制 / 删除」按钮时，临时关闭整项 draggable：
                // 否则 Android WebView 会把这次点按当成拖拽起点（手指哪怕微移几像素），
                // 进而取消 touchend / click，按钮表现为“按不动”。松开后恢复，桌面拖拽不受影响。
                item.draggable = false;
                return;
            }
            item.draggable = true;
            lpTimer = setTimeout(fireLongPress, 500);
        }, { passive: true });
        item.addEventListener('touchend', () => { item.draggable = true; if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
        item.addEventListener('touchcancel', () => { item.draggable = true; if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
        item.addEventListener('touchmove', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
        item.addEventListener('mousedown', (e) => {
            if (_isOnActions(e)) return;
            lpTimer = setTimeout(fireLongPress, 500);
        });
        item.addEventListener('mouseup', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
        item.addEventListener('mouseleave', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
        // 屏蔽移动端长按弹出的系统文本选择/菜单，避免干扰多选
        item.addEventListener('contextmenu', (e) => { e.preventDefault(); });

        // 拖拽源：把方块拖入文件夹（dataTransfer 用 'block:' 前缀区分文件夹嵌套拖拽）
        item.setAttribute('draggable', 'true');
        item.addEventListener('dragstart', (e) => {
            // 关键：必须清掉本条目自己的长按计时器（变量名为 lpTimer，不是 longPressTimer），
            // 否则 500ms 后会触发 fireLongPress → renderSideBlockList 重建列表，
            // 会把正在拖拽的节点从 DOM 移除，导致拖拽被强制取消、永远 drop 不到文件夹。
            if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
            isLongPress = false;
            blockDragSrcId = item.dataset.blockId;
            _dragSrcTs = Date.now();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'block:' + item.dataset.blockId);
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            clearBlockDropHighlight();
            blockDragSrcId = null;
            _dragSrcTs = 0;
            if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
            // 拖拽结束后补做被推迟的列表重建（若有），恢复最新数据
            if (_sideListRebuildQueued) { _sideListRebuildQueued = false; renderSideBlockList(); }
        });
    });
    
    /* ★【2026-10-24 性能优化】行内操作按钮（复制 / 删除 / 隐藏 / 锁定 / 骨骼绑定 / 解绑）
       已改为容器级事件委托（见 ensureSideBlockActionsDelegation），不再逐行绑事件。 */


    /* 【2026-10-24】动画方块行的「工具」按钮已移到右侧时间表头（方块名称下方），
       本处不再渲染对应 DOM，故删除其绑定（旧写法只会空转）。 */

    if (!isKfMode) {
        const allBtn = document.getElementById('sideBlockAll');
        if (allBtn) {
            allBtn.addEventListener('click', () => {
                selectedBlocksSet.clear();
                // 隐藏 / 锁定方块不进入全选（它们不可被选中，进了选区会被渲染循环立刻剔除）
                displayBlocks.filter(b => !isBlockHidden(b) && !isBlockLocked(b)).forEach(b => selectedBlocksSet.add(b));
                selectedFolder = null; // 全选方块时退出文件夹选中态，让 Gizmo 回到方块多选
                if (selectedBlock) {
                    if (selectedBlock.axisHelper) selectedBlock.axisHelper.visible = false;
                    selectedBlock = null;
                }
                updateAxesVisibility();
                renderVariablesForBlock(null);
                blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
                renderSideBlockList();
            });
        }
        
        // 新建模型按钮
        const newBtn = document.getElementById('sideBlockNew');
        if (newBtn) {
            newBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showCreateBlockMenu();
            });
        }
        
        // 新建文件夹按钮（大纲顶部文件夹+图标）
        const folderBtn = document.getElementById('sideBlockNewFolder');
        if (folderBtn) {
            folderBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showCreateGroupModal();
            });
        }

        // 旧操作模式顶部紫色加号骨骼绑定按钮（恢复自备份）
        const boneBtn = document.getElementById('sideBlockBone');
        if (boneBtn) {
            boneBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // 多选骨绑定：选中多个方块时点紫色加号，一次性把整个选区绑到同一父级；否则只绑首个/当前选中块
                const targets = selectedBlocksSet.size > 1
                    ? [...selectedBlocksSet]
                    : [selectedBlocksSet.size ? [...selectedBlocksSet][0] : selectedBlock];
                if (!targets[0] || blocks.length < 2) {
                    showModal("提示", "请先选中一个方块，并确保有两个以上方块才能绑定", null, false);
                    return;
                }
                showBoneModeSelector(targets);
            });
        }

        // 工具收纳下拉（扳手按钮）：切换 .open 类显示/隐藏菜单
        const toolsBtn = document.getElementById('outlinerToolsBtn');
        const toolsMenu = document.getElementById('outlinerToolsMenu');
        if (toolsBtn && toolsMenu) {
            toolsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasOpen = toolsMenu.classList.contains('open');
                const open = !wasOpen;
                if (open) {
                    const rect = toolsBtn.getBoundingClientRect();
                    // 把菜单挂到 body 下：脱离 uiScaleTarget 的 zoom 缩放与面板 overflow 裁剪，
                    // 直接用「视口坐标」定位（无需除以 zoom），侧边栏/非侧边栏两种模式都精准贴合按钮。
                    if (toolsMenu.parentNode !== document.body) document.body.appendChild(toolsMenu);
                    // 显示后测量真实（视口）宽高
                    toolsMenu.classList.add('open');
                    const menuRect = toolsMenu.getBoundingClientRect();
                    const mw = menuRect.width;
                    const mh = menuRect.height;
                    // 侧边栏模式（面板在右侧）：菜单向左弹出，显示在方块列表左侧；
                    // 非侧边栏模式（面板在底部）：菜单显示在工具按钮正上方（水平居中于按钮）。
                    let left, top;
                    if (isSidePanelMode) {
                        left = rect.left - mw - 4;
                        top = rect.top;
                        if (left < 0) left = rect.right + 4;   // 左侧放不下则翻到按钮右侧
                    } else {
                        left = rect.left + rect.width / 2 - mw / 2;   // 水平居中于按钮，整体位于按钮正上方
                        top = rect.top - mh - 4;
                        if (top < 0) top = rect.bottom + 4;    // 上方放不下则翻到按钮下方
                    }
                    // 视口边界兜底
                    if (left < 0) left = 0;
                    if (top < 0) top = 0;
                    if (left + mw > window.innerWidth) left = Math.max(0, window.innerWidth - mw);
                    if (top + mh > window.innerHeight) top = Math.max(0, window.innerHeight - mh);
                    toolsMenu.style.top = top + 'px';
                    toolsMenu.style.left = left + 'px';
                } else {
                    toolsMenu.classList.remove('open');
                }
                toolsBtn.classList.toggle('active', open);
            });
            // 菜单项点击后自动收起
            toolsMenu.querySelectorAll('.outliner-tools-menu-item').forEach(item => {
                item.addEventListener('click', () => {
                    toolsMenu.classList.remove('open');
                    toolsBtn.classList.remove('active');
                });
            });
            // 全项目级状态重置：取消锁定 / 取消隐藏
            const unlockAllBtn = document.getElementById('sideBlockUnlockAll');
            if (unlockAllBtn) unlockAllBtn.addEventListener('click', () => unlockAllBlocks());
            const unhideAllBtn = document.getElementById('sideBlockUnhideAll');
            if (unhideAllBtn) unhideAllBtn.addEventListener('click', () => unhideAllBlocks());
            // 镜像（工具菜单内）：自由对称面 / 选取面作为对称面 / 三点确定对称面
            const mirrorFreeBtn = document.getElementById('sideBlockMirrorFree');
            if (mirrorFreeBtn) mirrorFreeBtn.addEventListener('click', (e) => { e.stopPropagation(); mirrorBegin('free'); });
            const mirrorFaceBtn = document.getElementById('sideBlockMirrorFace');
            if (mirrorFaceBtn) mirrorFaceBtn.addEventListener('click', (e) => { e.stopPropagation(); mirrorBegin('face'); });
            const mirrorVtxBtn = document.getElementById('sideBlockMirrorVtx');
            if (mirrorVtxBtn) mirrorVtxBtn.addEventListener('click', (e) => { e.stopPropagation(); mirrorBegin('vtx'); });
            // 「自身对称」不是单独入口：三种定面方式进入后，在气泡的「结果方式」里切换即可
        }
    }

    // 点击空白处关闭工具收纳菜单（仅新布局模式）
    if (isNewLayoutMode) {
        document.removeEventListener('click', closeOutlinerToolsMenu);
        closeOutlinerToolsMenu = function (e) {
            const btn = document.getElementById('outlinerToolsBtn');
            const menu = document.getElementById('outlinerToolsMenu');
            if (!btn || !menu) return;
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.classList.remove('open');
                btn.classList.remove('active');
            }
        };
        document.addEventListener('click', closeOutlinerToolsMenu);
    }
    
    // 组折叠/展开按钮
    sideList.querySelectorAll('.side-block-group-header').forEach(header => {
        let longPressTimer = null;
        let isLongPress = false;

        const groupName = header.dataset.groupName;
        const groupBlockIds = new Set(getFolderAllCubeIds(groupName));
        const groupBlocks = blocks.filter(b => groupBlockIds.has(b.id));
        const getSelectableGroupBlocks = () => {
            const isKfMode = (isNewLayoutMode && isKeyframeMode) || (!isNewLayoutMode && keyframeWindowOpen);
            if (isKfMode) return groupBlocks.filter(b => hasKeyframeAnimation(b.id));
            return groupBlocks;
        };

        // 折叠/展开按钮：独立处理，阻止冒泡与长按计时器，使折叠始终可靠
        const toggleBtn = header.querySelector('.side-block-group-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const group = folders.find(g => g.name === groupName);
                if (group) { group.expanded = !group.expanded; renderSideBlockList(); }
            });
        }

        header.addEventListener('click', (e) => {
            if (header.dataset.wasDragged === '1') { header.dataset.wasDragged = '0'; return; }
            if (touchMoved) {
                touchMoved = false;
                return;
            }
            if (e.target.closest('.side-block-group-actions')) return;
            if (isLongPress) {
                isLongPress = false;
                return;
            }
            const isMulti = kfIsMultiGesture(e);   // ★【2026-10-18】含「多选锁定」开关（触屏点文件夹=整组加选）
            if (isMulti) {
                e.preventDefault();
                const selectable = getSelectableGroupBlocks();
                selectable.forEach(b => selectedBlocksSet.add(b));
                // Ctrl+点击文件夹：整组方块高亮，同时保持文件夹本身处于选中状态，
                // 这样“归位枢轴到骨骼（方式1）”等文件夹工具才能正确作用在该骨骼上并实时显示。
                selectedFolder = groupName;
                selectedBlock = null;
                updateAxesVisibility();
                blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
                renderSideBlockList();
                renderInspector();
                requestGizmoRefresh();
                updateToolbar(true);
                return;
            }
            // 普通点击名称/头部：选中该文件夹（骨骼），用于 inspector 与 Gizmo
            selectFolder(groupName);
        });
        
        header.addEventListener('mousedown', () => {
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                const selectable = getSelectableGroupBlocks();
                selectable.forEach(b => selectedBlocksSet.add(b));
                updateAxesVisibility();
                blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
                // 长按多选：仅更新选中态与高亮，不再重渲染整个大纲。
                // 否则拖拽过程中 DOM 被销毁会打断原生拖放（导致“文件夹无法拖入其他文件夹”）。
                // 同时把文件夹设为选中，保证骨骼工具能作用在该文件夹上。
                if (selectable.length >= 0) {
                    selectedFolder = groupName;
                    selectedBlock = null;
                    renderInspector();
                    requestGizmoRefresh();
                    updateToolbar(true);
                    // 长按多选不整列表重渲染（防打断拖放），此处直接切换头部选中高亮，保证与方块选中视觉一致
                    sideList.querySelectorAll('.side-block-group-header.selected').forEach(el => el.classList.remove('selected'));
                    header.classList.add('selected');
                }
            }, 500);
        });
        
        header.addEventListener('mouseup', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        
        header.addEventListener('mouseleave', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        // 开始拖拽时取消长按多选计时器，避免其在拖拽过程中触发重渲染而打断原生拖放
        header.addEventListener('dragstart', () => {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            isLongPress = false;
        });

        let touchMoved = false;
        header.addEventListener('touchstart', (e) => {
            touchMoved = false;
            // 触屏按到文件夹头部的「眼睛 / 管理 / ×」或折叠箭头时，临时关闭整头 draggable，
            // 否则 Android WebView 会把点按当拖拽起点并吞掉 click / touchend。
            if (e.target.closest('.side-block-group-actions') || e.target.closest('.side-block-group-toggle')) {
                header.draggable = false;
                return;
            }
            header.draggable = true;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                const selectable = getSelectableGroupBlocks();
                selectable.forEach(b => selectedBlocksSet.add(b));
                updateAxesVisibility();
                blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
                // 同 mousedown：长按多选不重渲染大纲，避免打断拖拽
                // 但要把文件夹设为选中，保证骨骼工具能作用在该文件夹上。
                if (selectable.length >= 0) {
                    selectedFolder = groupName;
                    selectedBlock = null;
                    renderInspector();
                    requestGizmoRefresh();
                    updateToolbar(true);
                    sideList.querySelectorAll('.side-block-group-header.selected').forEach(el => el.classList.remove('selected'));
                    header.classList.add('selected');
                }
            }, 500);
        });
        
        header.addEventListener('touchend', () => {
            header.draggable = true;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        header.addEventListener('touchcancel', () => {
            header.draggable = true;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
        
        header.addEventListener('touchmove', () => {
            touchMoved = true;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });
    });
    
    // 组眼睛按钮（切换组隐藏/显示）
    sideList.querySelectorAll('.side-block-group-eye').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const groupName = btn.dataset.group;
            const g = folders.find(g2 => g2.name === groupName);
            if (g) {
                g.hidden = !g.hidden;
                bumpVisibilityRev();
                updateGroupVisibility(groupName);
            }
        });
    });

    // 组管理按钮
    sideList.querySelectorAll('.side-block-group-manage').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const groupName = btn.dataset.group;
            showGroupManageModal(groupName);
        });
    });
    
    // 组删除按钮
    sideList.querySelectorAll('.side-block-group-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const groupName = btn.dataset.group;
            // 不再使用浏览器原生 confirm()，改为删除按钮上方的红色内嵌提示（含确认/取消）
            openFolderDeleteTip(btn, groupName);
        });
    });

    // 旧操作模式：显式 molang 骨骼绑定 / 解绑（已改为事件委托，见 ensureSideBlockActionsDelegation）
    if (!isKfMode) {
        sideList.querySelectorAll('.side-block-backbone-select').forEach(sel => {
            sel.addEventListener('click', (e) => { e.stopPropagation(); });
            sel.addEventListener('change', (e) => {
                e.stopPropagation();
                const gname = sel.dataset.group;
                const val = sel.value;
                if (val === '__clear__') {
                    clearFolderBackbone(gname);
                } else if (val) {
                    designateFolderBackbone(gname, val, false);
                }
                try { recordAction(); } catch (_) {}
                renderSideBlockList();
            });
        });
    }

    // 组名右键编辑（电脑端）
    sideList.querySelectorAll('.side-block-group-name').forEach(nameEl => {
        nameEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const groupName = nameEl.closest('.side-block-group-header').dataset.groupName;
            editGroupName(groupName);
        });
    });
    
    // 关键帧动画按钮
    const kfBtnSide = document.getElementById('sideBlockKeyframe');
    if (kfBtnSide) {
        kfBtnSide.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isNewLayoutMode) {
                // 切换关键帧模式
                if (isKeyframeMode) {
                    exitKeyframeMode();
                } else {
                    enterKeyframeMode();
                }
            } else {
                /* ★【2026-10-20 用户要求】旧操作模式不再弹出关键帧悬浮窗：入口按钮直接播放/停止。 */
                let _hasAnim = false;
                try { _hasAnim = getPlaybackBlocks().length > 0; } catch (err) { _hasAnim = keyframeData.size > 0; }
                if (!keyframePlaying && !_hasAnim) { showToast('当前还没有关键帧动画可播放'); return; }
                toggleKeyframePlayback();
                renderSideBlockList();
            }
        });
    }
    // 欧拉角转换按钮
    const eulerBtnSide = document.getElementById('sideBlockEuler');
    if (eulerBtnSide) {
        eulerBtnSide.addEventListener('click', (e) => {
            e.stopPropagation();
            showEulerAngleConfirmDialog();
        });
    }
    /* ★【2026-10-24 用户要求】「枢轴归位到原点」并入扳手工具菜单（编辑模式也可见）：
       批量处理当前选中的方块，整批只记一次撤销、只弹一条汇总提示。 */
    const pivotOriginBtn = document.getElementById('sideBlockPivotOrigin');
    if (pivotOriginBtn) {
        pivotOriginBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targets = selectedBlocksSet.size ? [...selectedBlocksSet] : (selectedBlock ? [selectedBlock] : []);
            if (!targets.length) { showToast('请先选中至少一个方块'); return; }
            try { flushPendingRecords(); } catch (err) {}
            let done = 0, skipped = 0;
            targets.forEach(b => {
                try { if (kfBlockToolPivotToOrigin(b, { silent: true })) done++; else skipped++; } catch (err) { skipped++; }
            });
            if (done > 0) {
                try { history.record(getState()); } catch (err) {}
                showToast(skipped > 0 ? `已归位 ${done} 个方块的枢轴到原点（保持位置）；${skipped} 个绑骨子块跳过`
                    : `已将 ${done} 个方块的枢轴归位到原点（保持模型位置）`);
            } else {
                showToast(skipped > 0 ? `${skipped} 个方块为绑骨子块（位置由父骨驱动），已跳过` : '未处理任何方块');
            }
            renderSideBlockList();
        });
    }
    // 归位枢轴到骨骼（方式2：方块枢轴 → 骨骼原点/骨骼枢轴，pos→basepos，保持模型世界位置不变）
    const alignPivotBtn = document.getElementById('sideBlockAlignPivot');
    if (alignPivotBtn) {
        alignPivotBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedBlocksSet.size === 0) {
                showToast('请先选中至少一个方块');
                return;
            }
            const firstGroup = [...selectedBlocksSet][0]?.group;
            if (!firstGroup) { showToast('选中方块不属于任何骨骼'); return; }
            // 只处理【选中】的方块（同一文件夹内的选中项）；未选中的同文件夹方块不受影响
            const folderSel = new Set([...selectedBlocksSet].filter(b => b.group === firstGroup));
            if (folderSel.size === 0) { showToast('选中方块不属于任何骨骼'); return; }
            try { recordAction(); } catch (err) {}
            const res = applyAlignPivotToBone(firstGroup, folderSel);
            const c = res ? (res.count || 0) : 0;
            const sk = res ? (res.skippedBone || 0) : 0;
            if (c > 0 && sk > 0) showToast(`已将 ${c} 个方块枢轴归位到骨骼原点（保持位置）；${sk} 个已绑骨子块由父骨驱动，跳过`);
            else if (c > 0) showToast(`已将 ${c} 个方块枢轴归位到骨骼原点（保持位置）`);
            else if (sk > 0) showToast(`${sk} 个选中方块均为已绑骨子块（位置由父骨 molang 驱动），无法独立归位，已跳过`);
            else showToast('未处理任何方块');
        });
    }
    // 归位枢轴到骨骼（方式1：以组内出现频率最高的方块枢轴，直接作为整个骨骼的枢轴）
    const alignBonePivotBtn = document.getElementById('sideBlockAlignBonePivot');
    if (alignBonePivotBtn) {
        alignBonePivotBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // 目标骨骼：优先当前选中的文件夹，否则取选中方块所属组
            let folderName = selectedFolder;
            if (!folderName && selectedBlocksSet.size) folderName = [...selectedBlocksSet][0]?.group;
            if (!folderName) { showToast('请先选中一个骨骼（文件夹）或其中的方块'); return; }
            const f = getFolder(folderName);
            if (!f) { showToast('未找到对应骨骼'); return; }
            // 仅统计本层级（直接属于该骨骼）的方块枢轴，不含子文件夹内部方块
            const directCubes = blocks.filter(b => b.group === folderName);
            if (!directCubes.length) { showToast('该骨骼内没有直接方块，无法统计枢轴'); return; }
            // 统计直接子方块枢轴的出现频率，取最高频的 3 元组作为骨骼枢轴
            const tally = new Map();
            directCubes.forEach(b => {
                if (!b) return;
                const px = Number(b.scope.vars.get('v.xpos')?.value ?? 0);
                const py = Number(b.scope.vars.get('v.ypos')?.value ?? 0);
                const pz = Number(b.scope.vars.get('v.zpos')?.value ?? 0);
                const key = `${_r4(px)},${_r4(py)},${_r4(pz)}`;
                tally.set(key, (tally.get(key) || 0) + 1);
            });
            let bestKey = null, bestCount = 0;
            tally.forEach((cnt, key) => { if (cnt > bestCount) { bestCount = cnt; bestKey = key; } });
            if (!bestKey) { showToast('未读取到任何方块枢轴'); return; }
            const [bx, by, bz] = bestKey.split(',').map(Number);
            // ★ 骨骼文件夹不存独立枢轴（designateFolderBackbone 时已 delete f.pivot）：
            // 「骨骼枢轴」必须直接写到骨干方块上才会生效；同时把 (bx,by,bz) 备份到 f.pivot 作为 cache，
            // 便于下次访问 folderGizmoCenterWorld 在 _backbone 分支仍能稳定拿到（即时未渲染该骨干方块）。
            if (f._backbone) {
                const bb = folderBackboneBlock(f) || directCubes.find(b => isBoneRoot(b)) || directCubes[0];
                if (!bb || !bb.scope) { showToast('该骨骼尚未指定骨干方块'); return; }
                setPivotKeepingModel(bb, new THREE.Vector3(bx, by, bz));
                f.pivot = [bx, by, bz];
                rebuildFolderGizmo(folderName);
                renderSideBlockList();
                renderInspector();
                requestGizmoRefresh();
                try { recordAction(); } catch (err) {}
                showToast(`已将骨骼「${folderName}」枢轴设为骨干方块 [${bx}, ${by}, ${bz}]（本层级最频繁）`);
                return;
            }
            // 普通文件夹：直接修改 f.pivot
            f.pivot = [bx, by, bz];
            rebuildFolderGizmo(folderName);
            renderSideBlockList();
            renderInspector();
            requestGizmoRefresh();
            try { recordAction(); } catch (err) {}
            showToast(`已将骨骼「${folderName}」枢轴设为组内最频繁枢轴 (${bx}, ${by}, ${bz})`);
        });
    }
    // 表达式常量化：删除选中方块的中间变量/表达式，仅保留变换核心变量并取当前值（支持多选）
    document.querySelectorAll('#sideBlockConstantize').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targets = selectedBlocksSet.size ? [...selectedBlocksSet] : (selectedBlock ? [selectedBlock] : []);
            if (!targets.length) { showToast('请先选中至少一个方块'); return; }
            let done = 0, skipped = 0;
            for (const b of targets) {
                // 带关键帧的 molang 接管方块：改写程序会破坏动画脚本，跳过并提示
                if (b.scope.molangMode && typeof _kfSystemReady !== 'undefined' && _kfSystemReady
                    && typeof keyframeData !== 'undefined' && keyframeData.has(b.id) && keyframeData.get(b.id).frames.size > 0) {
                    skipped++; continue;
                }
                constantizeBlock(b);
                done++;
            }
            if (done > 0) recordAction();
            blocks.forEach(bl => bl.updateSelectionHighlight(selectedBlocksSet.has(bl)));
            renderSideBlockList();
            if (selectedBlock) renderVariablesForBlock(selectedBlock);
            showToast(skipped ? `已常量化 ${done} 个，跳过 ${skipped} 个带关键帧的动画方块` : `已对 ${done} 个方块执行表达式常量化`);
        });
    });
    // 文件夹拖拽嵌套 + 方块拖入文件夹（【两种操作模式都绑定】：
    // 原仅 `if (isNewLayoutMode)` 时绑定，而 isNewLayoutMode 默认 false →
    // 默认旧操作模式下方块完全无法拖入文件夹（用户报告）。
    // 方块拖入文件夹应始终可用，文件夹嵌套拖拽同理（与旧模式的管理弹窗并存，互不冲突）。
    {
        (function setupFolderDnD() {
            const isDescendantOrSelf = (ancestor, target) => {
                if (ancestor === target) return true;
                let cur = target;
                while (cur) {
                    const f = getFolder(cur);
                    if (!f) return false;
                    if (f.parentName === ancestor) return true;
                    cur = f.parentName;
                }
                return false;
            };
            const clearDropHighlight = () => {
                sideList.querySelectorAll('.side-block-group-header.drag-over').forEach(el => el.classList.remove('drag-over'));
            };
            sideList.querySelectorAll('.side-block-group-header[draggable="true"]').forEach(header => {
                header.addEventListener('dragstart', (e) => {
                    folderDragSrcName = header.dataset.groupName;
                    _dragSrcTs = Date.now();
                    header.dataset.wasDragged = '1';
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', folderDragSrcName);
                    header.classList.add('dragging');
                });
                header.addEventListener('dragend', () => {
                    header.classList.remove('dragging');
                    clearDropHighlight();
                    folderDragSrcName = null;
                    _dragSrcTs = 0;
                    setTimeout(() => { header.dataset.wasDragged = '0'; }, 60);
                    // 拖拽结束后补做被推迟的列表重建（若有），恢复最新数据
                    if (_sideListRebuildQueued) { _sideListRebuildQueued = false; renderSideBlockList(); }
                });
                header.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    const targetName = header.dataset.groupName;
                    if (folderDragSrcName) {
                        if (folderDragSrcName === targetName || isDescendantOrSelf(folderDragSrcName, targetName)) return;
                    } else if (!blockDragSrcId) {
                        return; // 非文件夹拖拽也非方块拖拽：不处理
                    }
                    clearDropHighlight();
                    header.classList.add('drag-over');
                });
                header.addEventListener('dragleave', (e) => {
                    if (!header.contains(e.relatedTarget)) header.classList.remove('drag-over');
                });
                header.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    header.classList.remove('drag-over');
                    const raw = (e.dataTransfer.getData('text/plain') || '');
                    const targetName = header.dataset.groupName;
                    // 方块拖入文件夹：把方块加入该文件夹（若尚未在其中）。
                    // 多选拖入：若被拖方块处于多选集合（selectedBlocksSet>1），把【全部选中方块】一起移入
                    // （用户建议：多选时可直接把选中的方块全拖入文件夹）。
                    if (raw.startsWith('block:') || blockDragSrcId) {
                        const bid = raw.startsWith('block:') ? raw.slice('block:'.length) : blockDragSrcId;
                        const block = blocks.find(b => b.id === bid);
                        const targets = (block && selectedBlocksSet.has(block) && selectedBlocksSet.size > 1)
                            ? Array.from(selectedBlocksSet).filter(b => b.group !== targetName)
                            : (block && block.group !== targetName ? [block] : []);
                        if (targets.length) {
                            targets.forEach(b => { b.group = targetName; autoBoneBindOnFolderAdd(b, targetName); });
                            refreshBlocksUnderFolder(targetName);
                            renderSideBlockList();
                            try { recordAction(); } catch (err) {}
                        }
                        blockDragSrcId = null;
                        clearDropHighlight();
                        return;
                    }
                    // 文件夹嵌套（原有逻辑）
                    const srcName = raw || folderDragSrcName;
                    if (!srcName || srcName === targetName || isDescendantOrSelf(srcName, targetName)) { folderDragSrcName = null; clearDropHighlight(); return; }
                    const srcFolder = getFolder(srcName);
                    if (!srcFolder) { folderDragSrcName = null; clearDropHighlight(); return; }
                    srcFolder.parentName = targetName;
                    const targetFolder = getFolder(targetName);
                    if (targetFolder) targetFolder.expanded = true;
                    folderAxesDirty = true;
                    // 文件夹嵌套后自动同步骨骼树：本文件夹骨干绑定到目标文件夹骨干（若目标已设骨干），
                    // 并向下传播 —— 旋转/位移父文件夹时，拖入的子文件夹实时刚性跟随（自动紫色加号绑定）。
                    // ★ 只在目标文件夹【已是骨骼（设了 _backbone）】时才同步，且只处理 src+target：
                    //   否则（纯分组文件夹拖拽）无差别调用 syncFolderBoneHierarchy() 会【全量】把所有文件夹
                    //   （含用户没碰的）强制设骨干 + bindBone → 静态分组被篡改成骨骼、模型炸开（用户报告：
                    //   拖「左腿根部」进「bone」，未碰的「左腿腿部」整个炸开）。
                    if (targetFolder && targetFolder._backbone) {
                        syncFolderBoneHierarchy(new Set([srcName, targetName]));
                    } else if (srcFolder._backbone) {
                        // 源已是骨骼但目标不是：仅保留源自身骨骼结构，不强制目标变骨骼
                        syncFolderBoneHierarchy(new Set([srcName]));
                    }
                    refreshBlocksUnderFolder(srcName);
                    renderSideBlockList();
                    try { recordAction(); } catch (err) {}
                    folderDragSrcName = null;
                    clearDropHighlight();
                });
            });
            // 拖到空白处：移回根目录（sideList 持久存在，仅绑定一次避免重复叠加监听）
            if (!sideList._folderDnDRootAttached) {
                sideList._folderDnDRootAttached = true;
                sideList.addEventListener('dragover', (e) => {
                    if ((folderDragSrcName || blockDragSrcId) && !e.target.closest('.side-block-group-header')) {
                        e.preventDefault();
                        clearDropHighlight();
                    }
                });
                sideList.addEventListener('drop', (e) => {
                    if (e.target.closest('.side-block-group-header')) return;
                    e.preventDefault();
                    // 方块拖到空白处：移出文件夹，变为未分组
                    if (blockDragSrcId) {
                        const block = blocks.find(b => b.id === blockDragSrcId);
                        if (block) {
                            autoBoneUnbindOnFolderRemove(block);
                            block.group = null;
                            renderSideBlockList();
                            try { recordAction(); } catch (err) {}
                        }
                        blockDragSrcId = null;
                        clearDropHighlight();
                        return;
                    }
                    if (!folderDragSrcName) return;
                    const srcFolder = getFolder(folderDragSrcName);
                    if (srcFolder) {
                        srcFolder.parentName = null;
                        // 移出父骨骼层级：解除本文件夹骨干对父文件夹骨干的绑定（冻结在当前世界位置），
                        // 否则拖出后仍被旧父骨骼的 t.* 全局变量驱动，无法独立。
                        const _fbk = srcFolder._backbone ? blocks.find(b => b.id === srcFolder._backbone) : null;
                        if (_fbk && _fbk._boneParent) unbindBone(_fbk);
                        folderAxesDirty = true;
                        // ★ 只同步被拖出的文件夹本身（含其子树），绝不无参全量调用 ——
                        // 无参 syncFolderBoneHierarchy() 会处理【所有文件夹】，把用户没碰的
                        // 普通分组文件夹也强制设骨干 + bindBone（同「拖入」场景的篡改 bug）。
                        syncFolderBoneHierarchy(new Set([folderDragSrcName]));
                        refreshBlocksUnderFolder(folderDragSrcName);
                        renderSideBlockList();
                        try { recordAction(); } catch (err) {}
                    }
                    folderDragSrcName = null;
                    clearDropHighlight();
                });
            }
        })();
    }

    // 列表内容变化后重新定位/显隐蓝条，避免偶尔不显示
    if (isNewLayoutMode) updateSideListResizeHandle();

    // 文件夹结构 / 变换变化后按需重建文件夹数轴
    if (folderAxesDirty) {
        try { updateFolderAxes(); } catch (e) {}
        folderAxesDirty = false;
    }
}

// 全局兜底：即使拖拽源节点被移除导致 dragend 未在其上触发，document 级 dragend 仍会派发，
// 确保清理拖拽状态并补做被推迟的列表重建，避免页面卡死在拖拽态。
document.addEventListener('dragend', () => {
    if (blockDragSrcId || folderDragSrcName) {
        blockDragSrcId = null;
        folderDragSrcName = null;
        try { clearBlockDropHighlight(); } catch (_) {}
    }
    if (_sideListRebuildQueued) { _sideListRebuildQueued = false; renderSideBlockList(); }
});

// ========== 方块列表边缘拖拽调整大小 ==========
let sideListWidth = Math.max(250, Math.min(460, parseInt(localStorage.getItem('ui_side_list_width') || '250', 10)));
let sideListHeight = Math.max(180, Math.min(500, parseInt(localStorage.getItem('ui_side_list_height') || '260', 10)));
let dataPanelHeight = Math.max(160, Math.min(500, parseInt(localStorage.getItem('ui_data_panel_height') || '260', 10)));
let resizeTargetPanel = 'sideList';
let isResizingSideList = false;
let resizeStartClient = 0;
let resizeStartDim = 0;

function setupSideListResize() {
    const sideList = document.getElementById('sideBlockList');
    const resizeHandle = document.getElementById('sideListResizeHandle');
    if (!sideList) return;

    function startResize(e) {
        const pt = e.touches ? e.touches[0] : e;
        e.preventDefault();
        isResizingSideList = true;
        document.body.classList.add('is-resizing');   // 拉伸中临时关闭过渡/模糊重算，消除卡顿
        if (isSidePanelMode) {
            resizeStartClient = pt.clientX;
            resizeStartDim = sideListWidth;
        } else {
            resizeStartClient = pt.clientY;
            // 底部模式：根据当前可见的底部面板确定拖拽目标（方块列表 或 数据表）
            const sl = document.getElementById('sideBlockList');
            const dp = document.getElementById('dataPanel');
            if (sl && sl.style.display !== 'none') { resizeTargetPanel = 'sideList'; resizeStartDim = sideListHeight; }
            else if (dp && dp.style.display !== 'none') { resizeTargetPanel = 'dataPanel'; resizeStartDim = dataPanelHeight; }
            else { resizeTargetPanel = 'sideList'; resizeStartDim = sideListHeight; }
        }
        document.body.style.userSelect = 'none';
        document.body.style.cursor = isSidePanelMode ? 'ew-resize' : 'ns-resize';
        document.addEventListener('pointermove', onSideListResizeMove);
        document.addEventListener('pointerup', onSideListResizeUp);
    }

    // 专用拖拽手柄（底部模式时显示在侧边列表上方）
    if (resizeHandle) {
        resizeHandle.addEventListener('pointerdown', startResize);
        resizeHandle.addEventListener('touchstart', startResize, { passive: false });
    }
    // 侧边模式仍然使用边缘检测
    if (isSidePanelMode) {
        sideList.addEventListener('pointerdown', (e) => {
            const rect = sideList.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.left + 10) {
                startResize(e);
            }
        });
        sideList.addEventListener('touchstart', (e) => {
            const rect = sideList.getBoundingClientRect();
            const pt = e.touches[0];
            if (pt.clientX >= rect.left && pt.clientX <= rect.left + 10) {
                startResize(e);
            }
        }, { passive: false });
    }
}

function onSideListResizeMove(e) {
    if (!isResizingSideList) return;
    const sideList = document.getElementById('sideBlockList');
    if (!sideList) return;
    const pt = e.touches ? e.touches[0] : e;
    if (isSidePanelMode) {
        // 拖动方块列表左边缘时，只改方块列表自己的宽度，不再联动右侧数据面板
        let newWidth = resizeStartDim + (resizeStartClient - pt.clientX);
        newWidth = Math.max(250, Math.min(460, newWidth));
        sideListWidth = newWidth;
        sideList.style.width = newWidth + 'px';
        sideList.style.height = '';
        try { localStorage.setItem('ui_side_list_width', String(newWidth)); } catch (err) {}
    } else {
        let newHeight = resizeStartDim + (resizeStartClient - pt.clientY);
        newHeight = Math.max(160, Math.min(500, newHeight));
        if (resizeTargetPanel === 'dataPanel') {
            // 拖拽数据表面板：用 !important 覆盖 CSS 的 max-height 限制，调节数据表高度
            const dp = document.getElementById('dataPanel');
            if (dp) {
                dp.style.setProperty('height', newHeight + 'px', 'important');
                dp.style.setProperty('max-height', newHeight + 'px', 'important');
            }
            dataPanelHeight = newHeight;
            try { localStorage.setItem('ui_data_panel_height', String(newHeight)); } catch (err) {}
        } else {
            sideListHeight = newHeight;
            // 必须用 !important 覆盖 CSS 的 height:200px !important，否则拖动后高度回弹、看似无效
            sideList.style.setProperty('height', newHeight + 'px', 'important');
            sideList.style.setProperty('min-height', newHeight + 'px', 'important');
            sideList.style.width = '';
            sideList.style.left = '';
            sideList.style.right = '';
            try { localStorage.setItem('ui_side_list_height', String(newHeight)); } catch (err) {}
        }
    }
    updateSideListResizeHandle();
}

function onSideListResizeUp() {
    isResizingSideList = false;
    document.body.classList.remove('is-resizing');   // 恢复过渡与毛玻璃模糊
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', onSideListResizeMove);
    document.removeEventListener('pointerup', onSideListResizeUp);
}

function applySideListDimensions() {
    const sideList = document.getElementById('sideBlockList');
    if (!sideList) return;
    if (isSidePanelMode) {
        // 方块列表宽度与右侧数据面板宽度解耦：各自独立可调，限制最小 250px
        const w = Math.max(250, sideListWidth);
        sideList.style.width = w + 'px';
        sideList.style.height = '';
        sideList.style.minHeight = '';   // 清掉底部模式残留的 min-height（!important）
        sideList.style.top = '';
        sideList.style.bottom = '';
        sideList.style.left = '';
        sideList.style.right = '';
    } else {
        // 底部模式：宽度由 CSS 铺满屏幕（left:0; right:0），高度由 JS 可调
        // 必须用 !important 覆盖 .side-list-bottom 里的 height:200px !important，否则拖动无效
        const h = Math.max(160, Math.min(500, sideListHeight));
        sideList.style.setProperty('height', h + 'px', 'important');
        sideList.style.setProperty('min-height', h + 'px', 'important');
        sideList.style.width = '';
        sideList.style.left = '';
        sideList.style.right = '';
        sideList.style.top = '';
        sideList.style.bottom = '';
    }
}

// ★ 停靠前必须先把工具栏「搬出顶栏」：顶栏 .new-top-bar 带 backdrop-filter: blur(10px)，
//   而 backdrop-filter 会给 position:fixed 的后代当包含块 —— 不搬出去的话 fixed 是相对
//   那个 48px 高的顶栏算的，bottom:268px 会把工具栏整个甩到屏幕上方（实测 top=-409）。
//   搬到 #kfModeGroup 前面（同一层级、同在 #uiScaleTarget 内），与右上角模式切换控件同语境。
//   宽屏时按原位置搬回顶栏（记录原来的下一个兄弟节点，逐个还原）。
let _herTbHomeNextSibling = null;
function relocateHerToolbar(docked) {
    const tb = document.getElementById('herTransformToolbar');
    const topBar = document.getElementById('newTopBar');
    if (!tb || !topBar) return;
    const inTopBar = topBar.contains(tb);
    if (docked && inTopBar) {
        _herTbHomeNextSibling = tb.nextSibling;   // 可能是文本节点，原样保留作为搬回锚点
        const kf = document.getElementById('kfModeGroup');
        const host = (kf && kf.parentNode) ? kf.parentNode : document.body;
        if (kf && kf.parentNode) host.insertBefore(tb, kf);
        else host.appendChild(tb);
    } else if (!docked && !inTopBar) {
        const left = topBar.querySelector('.new-top-bar-left');
        if (!left) return;
        if (_herTbHomeNextSibling && _herTbHomeNextSibling.parentNode === left) left.insertBefore(tb, _herTbHomeNextSibling);
        else left.appendChild(tb);
    }
}

// 手机屏幕比例（≤600px）下，Gizmo 工具栏从顶栏摘出、停靠在屏幕右侧「方块列表之上」。
// 顶栏窄屏放不下「文件/视图/操作 + Gizmo 工具栏」，而右上角常驻的「编辑/动画」模式切换控件
// （#kfModeGroup，fixed top:12px right:12px）会盖住 Gizmo 按钮（390px 宽实测重叠 144px）。
// CSS 媒体查询负责形态（fixed + 竖排 + 卡片外观），这里负责两件事：
//   ① 把节点搬到顶栏之外（见 relocateHerToolbar 的说明）；
//   ② 把 bottom 对准底部面板上沿 —— 面板高度可拖拽调节（160~500px），故每次布局/拖拽/改窗口后都要重算。
// 坐标系：工具栏位于 #uiScaleTarget 内，其 fixed 偏移量按 zoom 缩放，故需除以 zoom 还原
//（与 updateSideListResizeHandle 里拖拽条的换算口径一致）。
// 「停靠到屏幕右侧」时 bottom 的取值：紧贴当前可见的底部面板（方块列表 / 数据表）上沿；
// 无底部面板时贴屏幕底。工具栏在 #uiScaleTarget 内，其 fixed 偏移量按 zoom 缩放，故需除以 zoom 还原
//（与 updateSideListResizeHandle 里拖拽条的换算口径一致）。Gizmo 工具栏与画笔工具条共用。
function mobileDockBottomPx() {
    const zoom = (typeof uiScale === 'number' ? uiScale : 100) / 100 || 1;
    const sideList = document.getElementById('sideBlockList');
    const dataPanel = document.getElementById('dataPanel');
    let target = null;
    // 方块列表与数据表互斥，取当前可见的那个；侧边（右侧）模式的列表不是「底部面板」，不参与
    if (sideList && sideList.style.display !== 'none' && sideList.classList.contains('side-list-bottom')) target = sideList;
    else if (dataPanel && dataPanel.style.display !== 'none') target = dataPanel;
    let bottomCss = 12;   // 没有底部面板时贴屏幕底
    if (target) {
        const rect = target.getBoundingClientRect();
        if (rect.height > 0) bottomCss = Math.round((window.innerHeight - rect.top) / zoom + 8);
    }
    return bottomCss;
}

function syncMobileGizmoDock() {
    const docked = window.matchMedia('(max-width: 600px)').matches;
    relocateHerToolbar(docked);
    const tb = document.getElementById('herTransformToolbar');
    if (!tb) return;
    if (!docked) {
        tb.style.removeProperty('bottom');   // 宽屏：交回顶栏常规布局
        return;
    }
    tb.style.setProperty('bottom', mobileDockBottomPx() + 'px', 'important');
}

// 画笔工具条：≤600px 同样停靠到屏幕右侧、方块列表之上（与 Gizmo 工具栏一套方案）。
// 顶栏 .new-top-bar 带 backdrop-filter，会给 position:fixed 的后代当包含块，故必须先搬出顶栏
//（搬到 #kfModeGroup 前，与模式切换控件同层级、同在 #uiScaleTarget 内），宽屏再按原锚点搬回。
let _brushTbHomeNextSibling = null;
function relocateBrushToolbar(docked) {
    const tb = document.getElementById('brushLengthToolbar');
    const topBar = document.getElementById('newTopBar');
    if (!tb || !topBar) return;
    const inTopBar = topBar.contains(tb);
    if (docked && inTopBar) {
        _brushTbHomeNextSibling = tb.nextSibling;   // 可能是文本节点，原样保留作为搬回锚点
        const kf = document.getElementById('kfModeGroup');
        const host = (kf && kf.parentNode) ? kf.parentNode : document.body;
        if (kf && kf.parentNode) host.insertBefore(tb, kf);
        else host.appendChild(tb);
    } else if (!docked && !inTopBar) {
        const left = topBar.querySelector('.new-top-bar-left');
        if (!left) return;
        if (_brushTbHomeNextSibling && _brushTbHomeNextSibling.parentNode === left) left.insertBefore(tb, _brushTbHomeNextSibling);
        else left.appendChild(tb);
    }
}

// 画笔工具条是否需要停靠：铺在顶栏里右缘会超出视口、或压到右上角模式控件（#kfModeGroup）时就停靠。
// 不写死断点：工具条在描点模式宽 563px、生成方块 414px（实测临界分别约 990 / 840px），
// 故实时量一次自然宽度决定；且统一按「最宽子模式」量（临时把色板置为可见、形状按钮隐藏），
// 保证切换描点/生成方块时停靠状态不跳变。手机（≤600px）一律停靠。
// 缓存：仅在 视口宽 / 是否画笔态 变化时重新测量（切子模式不重测）。
let _brushDockKey = '', _brushDockVal = false;
function brushDockNeeded() {
    const key = window.innerWidth + '|' + (isBrushMode ? 1 : 0);
    if (key === _brushDockKey) return _brushDockVal;
    let res = window.innerWidth <= 600;
    if (!res && isBrushMode) {
        const tb = document.getElementById('brushLengthToolbar');
        const kf = document.getElementById('kfModeGroup');
        const colorRow = document.getElementById('ptColorRow');
        const shapeBtn = document.getElementById('ptShapeToggle');
        const flagBtn = document.getElementById('ptFlagToggle');
        if (tb && kf) {
            document.body.classList.remove('brush-dock');
            relocateBrushToolbar(false);                 // 先搬回顶栏才能量出自然宽度
            const cd = colorRow ? colorRow.style.display : '';
            const sd = shapeBtn ? shapeBtn.style.display : '';
            const fd = flagBtn ? flagBtn.style.display : '';
            tb.style.visibility = 'hidden';
            if (colorRow) colorRow.style.display = 'inline-flex';   // 按最宽子模式（描点）量
            if (shapeBtn) shapeBtn.style.display = 'none';
            if (flagBtn) flagBtn.style.display = 'none';            // 旗帜/方块按钮仅生成方块模式可见，同形状按钮一并隐藏
            const l = tb.getBoundingClientRect(), k = kf.getBoundingClientRect();
            if (colorRow) colorRow.style.display = cd;
            if (shapeBtn) shapeBtn.style.display = sd;
            if (flagBtn) flagBtn.style.display = fd;
            tb.style.visibility = '';
            res = l.width > 0 && (l.right > window.innerWidth - 4 || (k.width > 0 && l.right > k.left - 4));
        }
    }
    _brushDockKey = key; _brushDockVal = res;
    return res;
}

function syncMobileBrushDock() {
    const docked = brushDockNeeded();
    // 矮视口（横屏手机）：竖排卡片会高过「列表上沿以上」的可用空间 → 改底部横排条（仍停在列表之上）
    const flat = docked && window.innerHeight < 560;
    document.body.classList.toggle('brush-dock', docked);
    document.body.classList.toggle('brush-dock-flat', flat);
    relocateBrushToolbar(docked);
    const tb = document.getElementById('brushLengthToolbar');
    if (!tb) return;
    if (!docked) {
        tb.style.removeProperty('bottom');
        tb.style.removeProperty('right');
        return;
    }
    tb.style.setProperty('bottom', mobileDockBottomPx() + 'px', 'important');
    // 侧边（右侧）模式的点集列表占用右侧时，把竖排停靠条让到列表左侧，避免压住点集
    //（横排条用 CSS 的 left/right 铺满，不在此处理）
    const sl = document.getElementById('sideBlockList');
    const sideListRight = sl && sl.style.display !== 'none' && !sl.classList.contains('side-list-bottom');
    if (!flat && sideListRight) {
        const zoom = (typeof uiScale === 'number' ? uiScale : 100) / 100 || 1;
        const lr = sl.getBoundingClientRect();
        tb.style.setProperty('right', Math.round((window.innerWidth - lr.left) / zoom + 8) + 'px', 'important');
    } else {
        tb.style.removeProperty('right');
    }
}

function updateSideListResizeHandle() {
    syncMobileGizmoDock();   // 手机端：Gizmo 工具栏停靠位随底部面板高度同步
    syncMobileBrushDock();   // 手机端：画笔工具条停靠位同步（画笔模式下它接管右侧）
    const handle = document.getElementById('sideListResizeHandle');
    if (!handle) return;
    if (isNewLayoutMode && !isSidePanelMode) {
        // 底部模式：蓝色拖拽条位于“当前可见的底部面板”顶部上方，用于调节该面板高度。
        // 方块列表与数据表互斥：显示哪个就用哪个定位，因此显示数据表时拖拽条也会跟随。
        const sideList = document.getElementById('sideBlockList');
        const dataPanel = document.getElementById('dataPanel');
        let target = null;
        if (sideList && sideList.style.display !== 'none') target = sideList;
        else if (dataPanel && dataPanel.style.display !== 'none') target = dataPanel;
        if (target) {
            const rect = target.getBoundingClientRect();
            // UI 缩放（uiScaleTarget 的 zoom）会缩放拖拽条自身的 CSS 像素坐标系，
            // 因此用视口坐标 rect.top 除以 zoom 还原成容器内的 CSS 像素，避免拖拽条错位。
            const zoom = (typeof uiScale === 'number' ? uiScale : 100) / 100 || 1;
            handle.style.display = 'block';
            handle.style.left = '0';
            handle.style.right = '0';
            handle.style.width = 'auto';
            // 手柄高 14px、视觉蓝条在底部 4px；上移 12px 使细条精确贴合面板顶边（2px 叠入面板，其余为命中区），
            // 整体比原先 28px 的一半更薄，且为半透浅色，与侧边栏 resize-handle 视觉一致。
            handle.style.top = ((rect.top - 12) / zoom) + 'px';
            handle.style.position = 'fixed';
        } else {
            handle.style.display = 'none';
        }
    } else {
        handle.style.display = 'none';
    }
}

// ========== 顶部下拉菜单 ==========
let activeTopDropdown = null;

function closeAllTopDropdowns() {
    document.querySelectorAll('.top-dropdown-menu.open').forEach(m => m.classList.remove('open'));
    activeTopDropdown = null;
    // 收起后同样立即重算防护层，避免残留过期洞口
    try { if (typeof tutActive !== 'undefined' && tutActive) tutUpdateGuard(); } catch (e) {}
}

function toggleTopDropdown(dropdownId) {
    const menu = document.getElementById(dropdownId);
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    closeAllTopDropdowns();
    if (!isOpen) {
        menu.classList.add('open');
        activeTopDropdown = dropdownId;
        // 教程防护层立即让路：防护层靠 260ms 轮询重挖洞，下拉刚打开的窗口期菜单会被
        // .ex-tut-guard 盖住（表现为「点了没反应/被拦截」），必须同步重算一次
        try { if (typeof tutActive !== 'undefined' && tutActive) tutUpdateGuard(); } catch (e) {}
        // 定位下拉菜单
        const btn = menu.closest('.top-dropdown-wrapper')?.querySelector('.top-menu-btn, .her-mode-btn');
        if (btn) {
            const rect = btn.getBoundingClientRect();
            // 手机端（≤600px）Gizmo 工具栏停靠在屏幕右边缘，若仍按按钮左边缘左对齐，160px 宽的下拉会滑出屏幕，
            // 故统一做一次「右边界回收」。桌面端按钮都在屏幕左侧、本就不会超界，此判断不命中，行为不变。
            let left = rect.left;
            const menuW = menu.getBoundingClientRect().width || 160;
            const maxLeft = window.innerWidth - menuW - 8;
            if (left > maxLeft) left = Math.max(8, maxLeft);
            menu.style.left = left + 'px';
            // 变换工具栏（旋转 / 顶点捕捉）的下拉卡片贴着顶栏底边，读作「从顶栏往下渐出」的一张卡；
            // 手机端该工具栏会停靠到屏幕右侧（脱离顶栏），此时仍按按钮底边定位
            const bar = btn.closest('#herTransformToolbar') ? document.querySelector('.new-top-bar') : null;
            const barRect = bar ? bar.getBoundingClientRect() : null;
            const inBar = barRect && rect.top >= barRect.top - 2 && rect.bottom <= barRect.bottom + 2;
            menu.style.top = (inBar ? barRect.bottom : rect.bottom + 4) + 'px';
        }
        // 如果是视图菜单，更新勾选状态
        if (dropdownId === 'viewDropdown') {
            const axesChk = document.getElementById('showAxesCheckbox');
            const gridChk = document.getElementById('showGridCheckbox');
            const ticksChk = document.getElementById('showTicksCheckbox');
            const items = {
                'showAxes': axesChk?.checked,
                'showGrid': gridChk?.checked,
                'showTicks': ticksChk?.checked
            };
            menu.querySelectorAll('.top-dropdown-item[data-view-action]').forEach(item => {
                const action = item.dataset.viewAction;
                const span = item.querySelector('span');
                if (action in items && span) {
                    const checked = items[action];
                    if (checked !== undefined) {
                        span.textContent = checked ? `✓ ${item.dataset.viewAction === 'showAxes' ? '显示轴线' : item.dataset.viewAction === 'showGrid' ? '显示平面' : '显示刻度'}` : 
                            (item.dataset.viewAction === 'showAxes' ? '显示轴线' : item.dataset.viewAction === 'showGrid' ? '显示平面' : '显示刻度');
                    }
                }
                // 隐藏按钮状态
                if (action === 'hideNames' && span) {
                    span.textContent = hideNames ? '显示' : '隐藏';
                }
            });
        }
    }
}

function setupNewLayoutUI() {
    // 文件菜单
    const fileBtn = document.getElementById('fileMenuBtn');
    if (fileBtn) {
        fileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTopDropdown('fileDropdown');
        });
    }
    document.getElementById('fileImportBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllTopDropdowns();
        showImportModal('normal'); // 普通导入：进当前项目；「外部导入」临时项目只留给 URL(#cmds=) 进站
    });
    // 覆盖型 / 临时覆盖型导入：文件菜单子选项（清空当前项目后导入；临时覆盖还会把项目转为临时）
    document.getElementById('fileOverwriteImportBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllTopDropdowns();
        showImportModal('overwrite');
    });
    document.getElementById('fileTempOverwriteImportBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllTopDropdowns();
        showImportModal('tempOverwrite');
    });
    document.getElementById('fileExportBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllTopDropdowns();
        showCommandListModal();
    });
    
    // 视图菜单
    const viewBtn = document.getElementById('viewMenuBtn');
    if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTopDropdown('viewDropdown');
        });
    }
    document.querySelectorAll('#viewDropdown .top-dropdown-item[data-view-action]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllTopDropdowns();
            const action = item.dataset.viewAction;
            switch (action) {
                case 'showAxes':
                    document.getElementById('showAxesCheckbox').checked = !document.getElementById('showAxesCheckbox').checked;
                    document.getElementById('showAxesCheckbox').dispatchEvent(new Event('change'));
                    break;
                case 'showGrid':
                    document.getElementById('showGridCheckbox').checked = !document.getElementById('showGridCheckbox').checked;
                    document.getElementById('showGridCheckbox').dispatchEvent(new Event('change'));
                    break;
                case 'showTicks':
                    document.getElementById('showTicksCheckbox').checked = !document.getElementById('showTicksCheckbox').checked;
                    document.getElementById('showTicksCheckbox').dispatchEvent(new Event('change'));
                    break;
                case 'material':
                    document.getElementById('materialPresetBtn').click();
                    break;
                case 'ortho':
                    toggleOrthoView();
                    break;
                case 'viewFront':
                    applyAxisView('front');
                    break;
                case 'viewBack':
                    applyAxisView('back');
                    break;
                case 'viewLeft':
                    applyAxisView('left');
                    break;
                case 'viewRight':
                    applyAxisView('right');
                    break;
                case 'viewTop':
                    applyAxisView('top');
                    break;
                case 'resetView':
                    document.getElementById('resetViewBtn').click();
                    break;
                case 'hideNames':
                    document.getElementById('hideNameBtn').click();
                    break;
            }
        });
    });
    
    // 操作菜单
    const actionBtn = document.getElementById('actionMenuBtn');
    if (actionBtn) {
        actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTopDropdown('actionDropdown');
        });
    }
    document.querySelectorAll('#actionDropdown .top-dropdown-item[data-action]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = item.dataset.action;
            switch (action) {
                case 'settings':
                    closeAllTopDropdowns();   // 打开设置面板：收起操作列表（避免与设置面板叠放）
                    // 打开设置面板
                    if (uiSettingsPanel) {
                        const show = uiSettingsPanel.style.display !== 'flex';
                        uiSettingsPanel.style.display = show ? 'flex' : 'none';
                        window.__exaSettingsOpen = show;
                        if (show) {
                            try {
                                if (uiSettingsPanel.parentElement !== document.body) document.body.appendChild(uiSettingsPanel);
                            } catch (err) {}
                            positionUISettingsPanel();
                            // 顺手刷新「新手教程」入口的进度文案（教程可能在面板关闭期间推进/完成）
                            try { ensureTutorialSettingEntry(); tutRefreshSettingEntry(); } catch (e) {}
                        }
                    }
                    break;
                case 'fullscreen':
                    closeAllTopDropdowns();
                    toggleFullscreen();
                    break;
                case 'undo':
                    // 撤销/重做：保持操作列表打开，方便连续多次撤销或紧接着点重做（不再自动收起）
                    safeUndo();
                    break;
                case 'redo':
                    safeRedo();
                    break;
                case 'changelog':
                    closeAllTopDropdowns();
                    showChangelogModal();
                    break;
            }
        });
    });
    
    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
        if (activeTopDropdown) {
            const menu = document.getElementById(activeTopDropdown);
            if (menu && !menu.contains(e.target) && !e.target.closest('.top-menu-btn')) {
                closeAllTopDropdowns();
            }
        }
    });
}

function toggleUISettingsPanel(e) {
    if (e) e.stopPropagation();
    if (!uiSettingsPanel) return;
    const show = uiSettingsPanel.style.display !== 'flex';
    uiSettingsPanel.style.display = show ? 'flex' : 'none';
    window.__exaSettingsOpen = show;
    if (show) {
        // 确保面板脱离可能造成 stacking context 的父容器
        try {
            if (uiSettingsPanel.parentElement !== document.body) document.body.appendChild(uiSettingsPanel);
        } catch (err) { /* ignore */ }
        positionUISettingsPanel();
        try { syncCamPosInputs(); } catch (e) {}
        // 打开设置面板时同步侧边栏显示开关状态，避免状态与 UI 不同步
        syncSidePanelSettingUI();
        // 顺手刷新「新手教程」入口的进度文案（教程可能在面板关闭期间推进/完成）
        try { ensureTutorialSettingEntry(); tutRefreshSettingEntry(); } catch (e) {}
    }
}
window.toggleUISettingsPanel = toggleUISettingsPanel;
// 返回键/手势统一入口：设置面板开着先关面板，关了之后再按才保存并退出项目
window.exaHandleBack = function () {
    if (window.__exaSettingsOpen) { toggleUISettingsPanel(); return; }
    if (typeof window.exaBack === 'function') window.exaBack();
};

function positionUISettingsPanel() {
    const panel = document.getElementById('uiSettingsPanel');
    const btn = document.getElementById('uiSettingsBtn');
    if (!panel) return;
    // ★2026-10-22：教程进行中（body.ex-tut-on）绝不能把 z-index 写回 9999——教程防护层是 2147482000，
    //   面板一旦掉到它下面就会「整体变暗 + 关闭键点不动」，直接卡死关卡。用与 EX_TUT_POPUP_Z 相同的值。
    const tutZ = document.body.classList.contains('ex-tut-on') ? '2147482500' : '9999';
    // 手机（窄屏或触摸设备，含横屏）下设置列表直接全屏显示，避免操作困难
    const exIsTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (window.innerWidth <= 820 || exIsTouch) {
        panel.style.position = 'fixed';
        panel.style.left = '0px'; panel.style.top = '0px';
        panel.style.right = '0px'; panel.style.bottom = '0px';
        panel.style.transform = 'none';
        panel.style.borderRadius = '0px';
        panel.style.zIndex = tutZ;
        panel.style.pointerEvents = 'auto';
        // 尺寸交给 syncOverlayZoom() 按 UI 缩放反向折算
        syncOverlayZoom();
        return;
    }
    // 桌面端：设置为居中模态弹窗，避免列表过小不便使用（更宽、双列网格、几乎一屏看全）
    panel.style.position = 'fixed';
    panel.style.zIndex = tutZ;
    panel.style.pointerEvents = 'auto';
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.transform = 'translate(-50%, -50%)';
    // 尺寸交给 syncOverlayZoom() 按 UI 缩放反向折算
    syncOverlayZoom();
}

window.addEventListener('resize', () => { positionUISettingsPanel(); });

