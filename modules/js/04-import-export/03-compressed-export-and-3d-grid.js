/* 04-import-export/03-compressed-export-and-3d-grid.js · 源 测试版v.6b79.html 第 18775-20426 行 */
'use strict';
// ==================== 压缩导出功能 ====================
let compressGridGroup = null;
let compressLabelGroup = null;
let compressCellMeshes = [];
let compressCellData = [];
let compressGrid = [];
let compressLitSlots = [];
let compressLitCount = 0;
let compressParamsList = [];

function showCompressExportModal(returnToList = false) {
    if (blocks.length === 0) {
        showModal('⚠️ 暂无方块', '请先创建方块');
        return;
    }

    // 隐藏主场景对象，避免两个3D场景干扰
    saveSceneState();

    compressParamsList = [];
    // 批次内若含 molang 接管方块，统一用全称（禁用短名压缩），否则短名恢复串会覆盖全称变量导致脚本错乱
    let compressHasMolang = false;
    for (let b of blocks) {
        if (b.scope && b.scope.molangMode && b.scope.program && b.scope.program.trim()) { compressHasMolang = true; break; }
    }
    for (let b of blocks) {
        let varsStr = '';
        const isMolang = b.scope && b.scope.molangMode && b.scope.program && b.scope.program.trim();
        if (isMolang) {
            varsStr = b.scope.program.trim();
        } else if (compressHasMolang) {
            varsStr = getOrderedAssignmentsString(b, false);
        } else {
            try { varsStr = getOrderedAssignmentsString(b, true); } catch(e) { varsStr = ''; }
        }
        
        let blockIdPrefix = getMaterialTag(b);
        let groupPrefix = '';
        if (b.group) {
            groupPrefix = molangTag(`'group:${b.group}';`);
        }
        const parentBonePrefix = getParentBonePrefix(b);
        const boneTag = getBoneTagForBlock(b);
        if (b.type === 'flag') {
            varsStr = molangTag(`'方块类型：旗帜';`) + varsStr;
        }

        const xposVar = b.scope && b.scope.vars ? b.scope.vars.get('v.xpos') : null;
        const zposVar = b.scope && b.scope.vars ? b.scope.vars.get('v.zpos') : null;

        // ★mat 只用于导出面板的图例文字与配色分组：旗帜材质现在有两种形态 —— 【banner 配方代码】
        //   （如 PbsKboA）与【内嵌的 data URL】——都不适合当图例名（代码不可读、base64 撑爆图例）。
        //   ⇒ 旗帜统一用材质名（'旗帜'/'自定义'/上传图名）；普通方块行为不变。
        const matMatch = blockIdPrefix.match(/^'(?:block|faces)：([^']+)'/);
        let matLabel = matMatch ? matMatch[1] : '';
        if (b.type === 'flag') matLabel = b.materialPresetName || '旗帜';
        else if (/^(data:|blob:)/i.test(matLabel)) matLabel = b.materialPresetName || '自定义';

        compressParamsList.push({
            id: b.id,
            rawParams: blockIdPrefix + groupPrefix + parentBonePrefix + boneTag + varsStr,
            xpos: xposVar ? xposVar.value : 0,
            zpos: zposVar ? zposVar.value : 0,
            group: b.group || '',
            mat: matLabel
        });
    }

    const isMobile = window.innerWidth < 768;
    const isLightMode = document.body.classList.contains('light-mode');
    const winWidth = isMobile ? '90%' : '720px';
    const winHeight = isMobile ? '80vh' : '400px';
    const winLeft = isMobile ? '5%' : '100px';
    const winTop = isMobile ? '10vh' : '100px';

    const colors = isLightMode ? {
        winBg: '#f8fafc',
        winBorder: '#cbd5e1',
        headerBg: '#e2e8f0',
        headerBorder: '#cbd5e1',
        titleColor: '#1e293b',
        textColor: '#475569',
        inputBg: '#ffffff',
        inputBorder: '#cbd5e1',
        inputText: '#0f172a',
        canvasBg: '#f7f9fc',
        canvasBorder: '#cbd5e1',
        gridBg: '#f8fafc',
        gridCellBg: '#fff',
        gridCellBorder: '#e2e8f0',
        gridCellText: '#94a3b8',
        legendBg: '#f1f5f9',
        legendBorder: '#cbd5e1',
        closeBtnColor: '#64748b',
        cancelBtnBg: '#e2e8f0',
        cancelBtnColor: '#1e293b',
        confirmBtnColor: '#fff'
    } : {
        winBg: '#1e293b',
        winBorder: '#3b82f6',
        headerBg: '#1a2332',
        headerBorder: '#3b82f6',
        titleColor: '#fff',
        textColor: '#94a3b8',
        inputBg: '#0f172a',
        inputBorder: '#3b82f6',
        inputText: '#fff',
        canvasBg: '#0b1122',
        canvasBorder: '#3b82f6',
        gridBg: '#0b1122',
        gridCellBg: '#111a2e',
        gridCellBorder: '#1a2a4a',
        gridCellText: '#4a6a8a',
        legendBg: '#0b1122',
        legendBorder: '#3b82f6',
        closeBtnColor: '#94a3b8',
        cancelBtnBg: '#374151',
        cancelBtnColor: '#fff',
        confirmBtnColor: '#fff'
    };
    
    const win = document.createElement('div');
    win.style.position = 'fixed';
    win.style.left = winLeft;
    win.style.top = winTop;
    win.style.width = winWidth;
    win.style.height = winHeight;
    win.style.zIndex = '10001';
    win.style.background = colors.winBg;
    win.style.border = `1px solid ${colors.winBorder}`;
    win.style.borderRadius = '8px';
    win.style.boxShadow = isLightMode ? '0 10px 40px rgba(0,0,0,0.1)' : '0 10px 40px rgba(0,0,0,0.5)';
    win.style.display = 'flex';
    win.style.flexDirection = 'column';

    const header = document.createElement('div');
    header.style.height = '36px';
    header.style.background = colors.headerBg;
    header.style.borderBottom = `1px solid ${colors.headerBorder}`;
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '0 12px';
    header.style.cursor = 'move';

    const title = document.createElement('span');
    title.textContent = '📦 压缩导出 - 设置坐标';
    title.style.color = colors.titleColor;
    title.style.fontSize = '13px';
    title.style.fontWeight = 'bold';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.color = colors.closeBtnColor;
    closeBtn.style.fontSize = '14px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '4px 8px';

    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.gap = '6px';
    headerRight.style.alignItems = 'center';

    const exportSchemeBtn = document.createElement('button');
    exportSchemeBtn.id = 'cpExportScheme';
    exportSchemeBtn.textContent = '导出方案';
    exportSchemeBtn.style.background = '#7c3aed';
    exportSchemeBtn.style.border = 'none';
    exportSchemeBtn.style.borderRadius = '4px';
    exportSchemeBtn.style.color = '#ddd6fe';
    exportSchemeBtn.style.fontSize = '11px';
    exportSchemeBtn.style.cursor = 'pointer';
    exportSchemeBtn.style.padding = '3px 8px';
    exportSchemeBtn.style.transform = 'skewX(-5deg)';
    exportSchemeBtn.style.display = 'none';

    const importSchemeBtn = document.createElement('button');
    importSchemeBtn.id = 'cpImportScheme';
    importSchemeBtn.textContent = '导入方案';
    importSchemeBtn.style.background = '#0d9488';
    importSchemeBtn.style.border = 'none';
    importSchemeBtn.style.borderRadius = '4px';
    importSchemeBtn.style.color = '#6ee7b7';
    importSchemeBtn.style.fontSize = '11px';
    importSchemeBtn.style.cursor = 'pointer';
    importSchemeBtn.style.padding = '3px 8px';
    importSchemeBtn.style.transform = 'skewX(-5deg)';
    importSchemeBtn.style.display = 'none';

    const patternBtn = document.createElement('button');
    patternBtn.id = 'cpPattern';
    patternBtn.textContent = '设为图案并清空选中';
    patternBtn.style.background = '#166534';
    patternBtn.style.border = 'none';
    patternBtn.style.borderRadius = '4px';
    patternBtn.style.color = '#a7f3d0';
    patternBtn.style.fontSize = '11px';
    patternBtn.style.cursor = 'pointer';
    patternBtn.style.padding = '3px 8px';
    patternBtn.style.transform = 'skewX(-5deg)';
    patternBtn.style.display = 'none';

    headerRight.appendChild(exportSchemeBtn);
    headerRight.appendChild(patternBtn);
    headerRight.appendChild(importSchemeBtn);
    headerRight.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(headerRight);
    win.appendChild(header);

    const body = document.createElement('div');
    body.style.flex = '1';
    body.style.padding = '12px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.alignItems = 'center';
    body.style.justifyContent = 'center';
    body.id = 'compressBody';
    body.style.overflow = 'hidden';

    body.innerHTML = `
        <div style="text-align:center;margin-bottom:12px;">
            <span style="font-size:14px;color:${colors.textColor};">请设置画布起始和终止坐标</span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;width:100%;">
            <div style="flex:1;">
                <label style="display:block;font-size:11px;color:${colors.textColor};margin-bottom:2px;">起始 X</label>
                <input id="cpSX" type="number" value="0" style="width:100%;padding:4px;border-radius:4px;border:1px solid ${colors.inputBorder};background:${colors.inputBg};color:${colors.inputText};font-size:12px;box-sizing:border-box;">
            </div>
            <div style="flex:1;">
                <label style="display:block;font-size:11px;color:${colors.textColor};margin-bottom:2px;">起始 Z</label>
                <input id="cpSZ" type="number" value="0" style="width:100%;padding:4px;border-radius:4px;border:1px solid ${colors.inputBorder};background:${colors.inputBg};color:${colors.inputText};font-size:12px;box-sizing:border-box;">
            </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;width:100%;">
            <div style="flex:1;">
                <label style="display:block;font-size:11px;color:${colors.textColor};margin-bottom:2px;">终止 X</label>
                <input id="cpEX" type="number" value="11" style="width:100%;padding:4px;border-radius:4px;border:1px solid ${colors.inputBorder};background:${colors.inputBg};color:${colors.inputText};font-size:12px;box-sizing:border-box;">
            </div>
            <div style="flex:1;">
                <label style="display:block;font-size:11px;color:${colors.textColor};margin-bottom:2px;">终止 Z</label>
                <input id="cpEZ" type="number" value="7" style="width:100%;padding:4px;border-radius:4px;border:1px solid ${colors.inputBorder};background:${colors.inputBg};color:${colors.inputText};font-size:12px;box-sizing:border-box;">
            </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:center;width:100%;">
            <button id="cpCancel" style="flex:1;padding:6px;border:none;border-radius:4px;background:${colors.cancelBtnBg};color:${colors.cancelBtnColor};font-size:12px;cursor:pointer;transform:skewX(-5deg);">取消</button>
            <button id="cpConfirmCoords" style="flex:1;padding:6px;border:none;border-radius:4px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:12px;font-weight:bold;cursor:pointer;transform:skewX(-5deg);">确认坐标</button>
        </div>
    `;

    win.appendChild(body);

    const resizeHandle = document.createElement('div');
    resizeHandle.style.position = 'absolute';
    resizeHandle.style.right = '0';
    resizeHandle.style.bottom = '0';
    resizeHandle.style.width = '12px';
    resizeHandle.style.height = '12px';
    resizeHandle.style.cursor = 'nwse-resize';
    resizeHandle.style.background = '#3b82f6';
    resizeHandle.style.borderRadius = '0 0 8px 0';
    win.appendChild(resizeHandle);

    document.body.appendChild(win);

    let sxInput = win.querySelector('#cpSX');
    let szInput = win.querySelector('#cpSZ');
    let exInput = win.querySelector('#cpEX');
    let ezInput = win.querySelector('#cpEZ');

    let compressGrid = [];
    let compressLitSlots = [];
    let compressPatternSlots = [];
    let compressW = 0, compressH = 0, compressSx = 0, compressSz = 0, compressStepX = 1, compressStepZ = 1;
    let canvas = null;
    let canvasScale = 1;
    let isMouseDown = false;
    let drawMode = 'toggle'; // 'light' | 'dark' | 'toggle'
    let canvasRotation = 0;
    let zoomFactor = 1;
    let baseCameraDist = 0;
    let colorMode = 'group'; // 'group' 按组配色 | 'material' 按材质配色

    function showLimitToast(msg) {
        const existing = win.querySelector('.cp-limit-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'cp-limit-toast';
        toast.textContent = msg;
        toast.style.cssText = `
            position:absolute; left:50%; top:50%;
            transform:translate(-50%,-50%) scale(0.5);
            background:rgba(0,0,0,0.75); color:#fca5a5; padding:10px 22px;
            border-radius:10px; font-size:14px; font-weight:600;
            pointer-events:none; z-index:999; white-space:nowrap;
            border:1px solid rgba(239,68,68,0.4);
            opacity:0; transition:none;
        `;
        win.appendChild(toast);
        win.style.position = 'relative';
        requestAnimationFrame(() => {
            toast.style.transition = 'opacity 0.2s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)';
            toast.style.opacity = '1';
            toast.style.transform = 'translate(-50%,-50%) scale(1)';
        });
        setTimeout(() => {
            toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%,-50%) scale(0.7)';
            setTimeout(() => toast.remove(), 250);
        }, 1600);
    }

    function closeWin() {
        if (canvas) {
            if (canvas._cleanupEvents) canvas._cleanupEvents();
            if (canvas._resizeHandler) {
                window.removeEventListener('resize', canvas._resizeHandler);
                canvas._resizeHandler = null;
            }
        }
        win.remove();
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('mousemove', onResize);
        document.removeEventListener('mouseup', onResizeEnd);
        
        // 恢复主场景渲染
        restoreSceneState();
        // 强制主场景重新渲染（防止 WebGL 上下文状态异常）
        if (typeof renderer !== 'undefined' && typeof scene !== 'undefined' && typeof camera !== 'undefined') {
            renderer.render(scene, camera);
        }
        
        if (returnToList) {
            showCommandListModal();
        }
    }

    function getLitEntries() {
        const arr = [];
        for (let i = 0; i < compressParamsList.length; i++) {
            if (compressLitSlots[i]) arr.push({ x: compressLitSlots[i].x, z: compressLitSlots[i].z, idx: i });
        }
        return arr;
    }

    function nextFreeIdx() {
        for (let i = 0; i < compressParamsList.length; i++) {
            if (!compressLitSlots[i]) return i;
        }
        return -1;
    }

    function toggleCell(x, z) {
        if (!compressGrid[x]) compressGrid[x] = [];
        
        const isLit = compressGrid[x][z] >= 0;
        
        if (drawMode === 'toggle') {
            if (isLit) {
                const oldIdx = compressGrid[x][z];
                compressGrid[x][z] = -1;
                if (oldIdx >= 0) compressLitSlots[oldIdx] = undefined;
            } else {
                const idx = nextFreeIdx();
                if (idx >= 0) {
                    compressGrid[x][z] = idx;
                    compressLitSlots[idx] = { x, z };
                } else {
                    showLimitToast(`已达到参数上限 ${compressParamsList.length} 个`);
                }
            }
        } else if (drawMode === 'light') {
            if (!isLit) {
                const idx = nextFreeIdx();
                if (idx >= 0) {
                    compressGrid[x][z] = idx;
                    compressLitSlots[idx] = { x, z };
                }
            }
        } else if (drawMode === 'dark') {
            if (isLit) {
                const oldIdx = compressGrid[x][z];
                compressGrid[x][z] = -1;
                if (oldIdx >= 0) compressLitSlots[oldIdx] = undefined;
            }
        }
        // 3D 场景已建 → 只刷新当前格子（大画布涂抹不卡）；未建 → 首次全量构建
        if (canvas && canvas._sceneReady && canvas._updateCellAt) {
            canvas._updateCellAt(x, z);
        } else {
            renderGrid();
        }
    }

    function renderGrid() {
        if (!canvas) return;

        const minX = compressSx;
        const maxX = compressSx + compressW - 1;
        const minZ = compressSz;
        const maxZ = compressSz + compressH - 1;

        const W = compressW;
        const H = compressH;

        compressW = W;
        compressH = H;
        compressSx = minX;
        compressSz = minZ;
        compressStepX = 1;
        compressStepZ = 1;

        // 持久化引用，确保后续 renderGrid 调用时 refreshCellAppearance 可访问
        let cellData = canvas._cellData || [];
        let cellMeshes = canvas._cellMeshes || [];

        if (compressGrid.length !== W || (compressGrid.length > 0 && compressGrid[0].length !== H)) {
            const newGrid = Array.from({ length: W }, () => Array(H).fill(-1));
            for (let x = 0; x < Math.min(W, compressGrid.length); x++) {
                for (let z = 0; z < Math.min(H, compressGrid[x] ? compressGrid[x].length : 0); z++) {
                    newGrid[x][z] = compressGrid[x][z];
                }
            }
            compressGrid = newGrid;
        }

        // ---- 如果 3D 场景已初始化，只需更新格子颜色和文字（不重建渲染器） ----
        if (canvas._sceneReady) {
            refreshCellAppearance();
            return;
        }

        // ---- 首次初始化 3D 场景（仅执行一次） ----
        canvas._sceneReady = true;

        // 自适应字号测量上下文必须在 refreshCellAppearance 首次调用前就绪——
        // renderGrid 下方第 10024 行有首次全量刷新，而 fitFontSize 会读取 _fitCtx。
        // 函数声明会提升到 renderGrid 顶部，但 const 是 TDZ，因此把 _fitCtx 放在函数顶部提前声明。
        const _fitCtx = document.createElement('canvas').getContext('2d');

        const groupColors = {
            '': { bg: '#2a3a5e', border: '#4a6a9e', text: '#ffd200' },
            '一': { bg: '#2a5e3a', border: '#4a9e6a', text: '#4ade80' },
            '二': { bg: '#5e3a2a', border: '#9e6a4a', text: '#fb923c' },
            '三': { bg: '#5e2a5e', border: '#9e4a9e', text: '#f472b6' },
            '四': { bg: '#2a3a5e', border: '#4a6a9e', text: '#60a5fa' },
            '五': { bg: '#5e5e2a', border: '#9e9e4a', text: '#facc15' },
            '六': { bg: '#2a5e5e', border: '#4a9e9e', text: '#22d3ee' },
            '七': { bg: '#5e2a3a', border: '#9e4a6a', text: '#f87171' },
        };

        const usedGroups = new Set();
        compressParamsList.forEach(p => { if (p.group) usedGroups.add(p.group); });

        let groupIndex = 0;
        const customGroupColors = {};
        usedGroups.forEach(g => {
            if (!groupColors[g]) {
                const colors = ['#2a5e3a,#4a9e6a,#4ade80', '#5e3a2a,#9e6a4a,#fb923c', '#5e2a5e,#9e4a9e,#f472b6', '#5e5e2a,#9e9e4a,#facc15', '#2a5e5e,#4a9e9e,#22d3ee', '#5e2a3a,#9e4a6a,#f87171'];
                const [bg, border, text] = colors[groupIndex % colors.length].split(',');
                customGroupColors[g] = { bg, border, text };
                groupIndex++;
            }
        });
        const getGroupColor = (groupName) => {
            if (groupColors[groupName]) return groupColors[groupName];
            if (customGroupColors[groupName]) return customGroupColors[groupName];
            return groupColors[''];
        };

        canvas.innerHTML = '';
        canvas.style.display = 'flex';
        canvas.style.flexDirection = 'column';
        canvas.style.overflow = 'hidden';

        const legend = document.createElement('div');
        legend.style.display = 'flex';
        legend.style.flexWrap = 'wrap';
        legend.style.gap = '12px';
        legend.style.padding = '8px';
        legend.style.background = colors.legendBg;
        legend.style.borderBottom = `1px solid ${colors.legendBorder}`;
        legend.style.borderRadius = '4px 4px 0 0';
        legend.style.flexShrink = '0';

        // 按材质配色的调色板（与按组共用同一组色系，保证两模式视觉一致）
        const materialPalette = [
            ['#2a3a5e','#4a6a9e','#60a5fa'],
            ['#2a5e3a','#4a9e6a','#4ade80'],
            ['#5e3a2a','#9e6a4a','#fb923c'],
            ['#5e2a5e','#9e4a9e','#f472b6'],
            ['#5e5e2a','#9e9e4a','#facc15'],
            ['#2a5e5e','#4a9e9e','#22d3ee'],
            ['#5e2a3a','#9e4a6a','#f87171']
        ];
        const _matColorIdx = new Map();
        let _matColorNext = 0;
        // 统一取色入口：mode='group' 按组名取色；mode='material' 按材质名取色（自动分配调色板）
        function getCellColor(name, mode) {
            if (mode === 'material') {
                if (!name) return { bg: '#374151', border: '#4b5563', text: '#9ca3af' };
                if (!_matColorIdx.has(name)) { _matColorIdx.set(name, _matColorNext++ % materialPalette.length); }
                const [bg, border, text] = materialPalette[_matColorIdx.get(name)];
                return { bg, border, text };
            }
            if (groupColors[name]) return groupColors[name];
            if (customGroupColors[name]) return customGroupColors[name];
            return groupColors[''];
        }
        canvas._getCellColor = getCellColor;

        // 图例：按当前 colorMode 列出（组名 / 材质名）
        function renderLegend() {
            legend.innerHTML = '';
            const noGroupItem = document.createElement('div');
            noGroupItem.style.display = 'flex';
            noGroupItem.style.alignItems = 'center';
            noGroupItem.style.gap = '6px';
            noGroupItem.style.fontSize = '12px';

            const noGroupDot = document.createElement('div');
            noGroupDot.style.width = '12px';
            noGroupDot.style.height = '12px';
            noGroupDot.style.borderRadius = '50%';
            noGroupDot.style.background = '#374151';
            noGroupDot.style.border = '1px solid #4b5563';

            const noGroupLabel = document.createElement('span');
            noGroupLabel.style.color = colors.textColor;
            noGroupLabel.textContent = colorMode === 'material' ? '无材质' : '无组';

            noGroupItem.appendChild(noGroupDot);
            noGroupItem.appendChild(noGroupLabel);
            legend.appendChild(noGroupItem);

            const used = colorMode === 'material'
                ? Array.from(new Set(compressParamsList.map(p => p.mat || '').filter(n => n)))
                : Array.from(new Set(compressParamsList.map(p => p.group).filter(n => n)));
            for (const nm of used) {
                const cc = getCellColor(nm, colorMode);
                const item = document.createElement('div');
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '6px';
                item.style.fontSize = '12px';

                const dot = document.createElement('div');
                dot.style.width = '12px';
                dot.style.height = '12px';
                dot.style.borderRadius = '50%';
                dot.style.background = cc.bg;
                dot.style.border = `1px solid ${cc.border}`;

                const label = document.createElement('span');
                label.style.color = cc.text;
                label.textContent = nm;

                item.appendChild(dot);
                item.appendChild(label);
                legend.appendChild(item);
            }
        }

        renderLegend();
        canvas._renderLegend = renderLegend;

        canvas.appendChild(legend);

        const threeContainer = document.createElement('div');
        threeContainer.style.width = '100%';
        threeContainer.style.flex = '1';
        threeContainer.style.minHeight = '0';
        threeContainer.style.position = 'relative';
        threeContainer.style.touchAction = 'none';
        threeContainer.style.webkitUserDrag = 'none';
        threeContainer.style.userSelect = 'none';
        threeContainer.style.cursor = 'crosshair';
        canvas.appendChild(threeContainer);

        const containerRect = threeContainer.getBoundingClientRect();
        const cw = containerRect.width || 100;
        const ch = containerRect.height || 100;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(colors.canvasBg);

        const camera = new THREE.PerspectiveCamera(40, cw / ch, 0.1, 500);
        camera.position.set(0, 18, 14);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(cw, ch);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(colors.canvasBg);
        threeContainer.appendChild(renderer.domElement);

        const labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize(cw, ch);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0';
        labelRenderer.domElement.style.left = '0';
        labelRenderer.domElement.style.pointerEvents = 'none';
        threeContainer.appendChild(labelRenderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.12;
        controls.minDistance = 5;
        controls.maxDistance = 120;
        // 放开俯仰上限到完整 180°（0~π）。OrbitControls 内部自带 EPS 极点保护，
        // 不会因到达正上/正下而退化成万向锁；旧值 Math.PI/2.1 会让相机永远无法下潜到地平线以下。
        controls.maxPolarAngle = Math.PI;
        // 左键=涂抹点亮格子；中键=旋转视角；右键=平移画布（大画布不再"只能俯视"）；
        // 双指=缩放+旋转+平移（TOUCH.DOLLY_ROTATE_PAN）
        controls.enablePan = true;
        controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
        // 单指触控交由我们自己处理（涂抹选中格子），双指缩放+旋转+平移
        controls.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_ROTATE_PAN };
        controls.update();

        let isRightButtonDown = false;
        
        const canvasEl = renderer.domElement;
        const threeContainerEl = threeContainer;
        
        const stopRightEvent = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        };
        
        canvasEl.addEventListener('contextmenu', stopRightEvent, { capture: true });
        threeContainerEl.addEventListener('contextmenu', stopRightEvent, { capture: true });
        
        const onMouseDown = (e) => {
            if (e.button === 2) {
                isRightButtonDown = true;
                stopRightEvent(e);
            }
        };
        
        const onMouseMove = (e) => {
            if (isRightButtonDown || (e.buttons && e.buttons === 2)) {
                stopRightEvent(e);
            }
        };
        
        const onMouseUp = (e) => {
            if (e.button === 2) {
                isRightButtonDown = false;
                stopRightEvent(e);
            }
        };
        
        const onMouseLeave = () => {
            isRightButtonDown = false;
        };
        
        canvasEl.addEventListener('mousedown', onMouseDown, { capture: true, passive: false });
        canvasEl.addEventListener('mousemove', onMouseMove, { capture: true, passive: false });
        canvasEl.addEventListener('mouseup', onMouseUp, { capture: true, passive: false });
        canvasEl.addEventListener('mouseleave', onMouseLeave, { capture: true });
        
        threeContainerEl.addEventListener('mousedown', onMouseDown, { capture: true, passive: false });
        threeContainerEl.addEventListener('mousemove', onMouseMove, { capture: true, passive: false });
        threeContainerEl.addEventListener('mouseup', onMouseUp, { capture: true, passive: false });
        threeContainerEl.addEventListener('mouseleave', onMouseLeave, { capture: true });
        
        canvasEl.addEventListener('pointerdown', onMouseDown, { capture: true, passive: false });
        canvasEl.addEventListener('pointermove', onMouseMove, { capture: true, passive: false });
        canvasEl.addEventListener('pointerup', onMouseUp, { capture: true, passive: false });
        canvasEl.addEventListener('pointerleave', onMouseLeave, { capture: true });
        canvasEl.addEventListener('pointercancel', onMouseLeave, { capture: true });
        
        threeContainerEl.addEventListener('pointerdown', onMouseDown, { capture: true, passive: false });
        threeContainerEl.addEventListener('pointermove', onMouseMove, { capture: true, passive: false });
        threeContainerEl.addEventListener('pointerup', onMouseUp, { capture: true, passive: false });
        threeContainerEl.addEventListener('pointerleave', onMouseLeave, { capture: true });
        threeContainerEl.addEventListener('pointercancel', onMouseLeave, { capture: true });
        
        canvasEl.addEventListener('auxclick', stopRightEvent, { capture: true });
        threeContainerEl.addEventListener('auxclick', stopRightEvent, { capture: true });
        
        canvasEl.addEventListener('dragstart', stopRightEvent, { capture: true });
        threeContainerEl.addEventListener('dragstart', stopRightEvent, { capture: true });

        const ambientLight = new THREE.AmbientLight(0x40406a, 0.5);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffeedd, 0.9);
        dirLight.position.set(10, 25, 15);
        scene.add(dirLight);

        const cellGroup = new THREE.Group();
        scene.add(cellGroup);
        const labelGroup = new THREE.Group();
        scene.add(labelGroup);

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        // ---- InstancedMesh：所有格子共享 2 个材质（面 + 边框），颜色逐实例 setColorAt ----
        // 大画布（如 100×100=10000 格）不再每格 clone 材质 / 建 mesh：draw call 从 2×N 降到 2，
        // 配合数学化拾取（ray-plane 求交，见 getHitCell），点亮 / 涂抹任意多格子都不卡。
        const matUnlit = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.9, metalness: 0.1,
            side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1
        });
        const matBorderBase = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 1, metalness: 0,
            side: THREE.DoubleSide
        });

        const maxDim = Math.max(W, H);
        const cellSize3D = Math.min(12 / maxDim, 1.8);
        const cellSizeFinal = Math.max(cellSize3D, 0.3);

        const centerX = (W - 1) / 2;
        const centerZ = (H - 1) / 2;
        const gap = cellSizeFinal * 0.15;

        // 边框底面（全尺寸，渲染在下方形成视觉边框）
        const borderGeo = new THREE.PlaneGeometry(cellSizeFinal, cellSizeFinal);
        // 格子面（缩小，渲染在边框上方，漏出边框底色）
        const geo = new THREE.PlaneGeometry(cellSizeFinal - gap, cellSizeFinal - gap);

        // 重置之前可能遗留的数组
        cellMeshes = [];
        cellData = [];

        const faceInst = new THREE.InstancedMesh(geo, matUnlit, W * H);
        const borderInst = new THREE.InstancedMesh(borderGeo, matBorderBase, W * H);
        const _dummyM = new THREE.Matrix4();
        const _dummyC = new THREE.Color();
        const unlitBgHex = isLightMode ? 0xd1d5db : 0x111a2e;
        const unlitBorderHex = isLightMode ? 0x9ca3af : 0x1a2a4a;
        let _instIdx = 0;
        for (let z = 0; z < H; z++) {
            for (let x = 0; x < W; x++) {
                const px = (x - centerX) * cellSizeFinal;
                const pz = (z - centerZ) * cellSizeFinal;
                _dummyM.makeRotationX(-Math.PI / 2).setPosition(px, 0, pz);
                faceInst.setMatrixAt(_instIdx, _dummyM);
                borderInst.setMatrixAt(_instIdx, _dummyM);
                _dummyC.setHex(unlitBgHex); faceInst.setColorAt(_instIdx, _dummyC);
                _dummyC.setHex(unlitBorderHex); borderInst.setColorAt(_instIdx, _dummyC);
                // 标签对象惰性创建：点亮才建 CSS2D label（大画布省 DOM）
                cellData.push({ x, z, label: null });
                _instIdx++;
            }
        }
        faceInst.instanceMatrix.needsUpdate = true;
        borderInst.instanceMatrix.needsUpdate = true;
        if (faceInst.instanceColor) faceInst.instanceColor.needsUpdate = true;
        if (borderInst.instanceColor) borderInst.instanceColor.needsUpdate = true;
        cellGroup.add(faceInst);
        cellGroup.add(borderInst);

        canvas._cellData = cellData;
        canvas._cellMeshes = cellMeshes;
        canvas._faceInst = faceInst;
        canvas._borderInst = borderInst;
        canvas._getGroupColor = getGroupColor;
        canvas._minX = minX;
        canvas._minZ = minZ;
        canvas._cellSizeFinal = cellSizeFinal;
        canvas._W = W;
        canvas._H = H;
        canvas._unlitBgHex = unlitBgHex;
        canvas._unlitBorderHex = unlitBorderHex;

        const originDiv = document.createElement('div');
        originDiv.textContent = `◀ 原点 (${minX},${minZ})`;
        originDiv.style.color = '#ff6b6b';
        originDiv.style.fontSize = '12px';
        originDiv.style.fontWeight = 'bold';
        originDiv.style.fontFamily = 'sans-serif';
        originDiv.style.textShadow = '0 0 6px #0b1122';
        originDiv.style.userSelect = 'none';
        const gridOriginLabel = new CSS2DObject(originDiv);
        const ox = (0 - centerX) * cellSizeFinal;
        const oz = (0 - centerZ) * cellSizeFinal;
        gridOriginLabel.position.set(ox, 0.05, oz);
        scene.add(gridOriginLabel);

        refreshCellAppearance();

        function updateCameraPosition() {
            const maxDim = Math.max(W, H);
            baseCameraDist = maxDim * 3.5 + 6;
            zoomFactor = 1;
            const angle = Math.atan2(0.6, 0.7);
            camera.position.set(0, baseCameraDist * Math.cos(angle), baseCameraDist * Math.sin(angle));
            controls.target.set(0, 0, 0);
            controls.update();
        }

        updateCameraPosition();

        // 数学化拾取：射线与 y=0 平面求交 → 世界坐标 → 网格坐标。
        // 大画布（数万格）不再遍历 cellMeshes 做 raycast（那是涂抹卡顿的元凶）。
        const _hitPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const _hitPt = new THREE.Vector3();
        function getHitCell(event) {
            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            if (!raycaster.ray.intersectPlane(_hitPlane, _hitPt)) return null;
            const gx = Math.round(_hitPt.x / cellSizeFinal + centerX);
            const gz = Math.round(_hitPt.z / cellSizeFinal + centerZ);
            if (gx < 0 || gx >= W || gz < 0 || gz >= H) return null;
            return { x: gx, z: gz };
        }

        let _isPainting = false;
        let _clickCell = null;

        renderer.domElement.addEventListener('pointerdown', function(e) {
            if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
            }
            if (e.button !== 0) return;
            const pos = getHitCell(e);
            if (!pos) return;
            _isPainting = true;
            _clickCell = `${pos.x},${pos.z}`;
            renderer.domElement._lastPainted = _clickCell;
            const x = pos.x, z = pos.z;
            if (!compressGrid[x]) compressGrid[x] = [];
            // 直接 toggle，无论是否已选中——单击已选中的格子立即熄灭，无需等 pointerup
            toggleCell(x, z);
        });

        renderer.domElement.addEventListener('pointermove', function(e) {
            if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
            if (!_isPainting) return;
            const pos = getHitCell(e);
            if (!pos) return;
            const key = `${pos.x},${pos.z}`;
            if (key === renderer.domElement._lastPainted) return;
            _clickCell = null;
            renderer.domElement._lastPainted = key;

            if (!compressGrid[pos.x]) compressGrid[pos.x] = [];
            if (compressGrid[pos.x][pos.z] < 0) {
                toggleCell(pos.x, pos.z);
            }
        });

        renderer.domElement.addEventListener('pointerup', function(e) {
            if (e.button === 2) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
            }
            if (e.button !== 0) return;
            _isPainting = false;
            _clickCell = null;
        });

        renderer.domElement.addEventListener('pointerleave', function() {
            _isPainting = false;
            _clickCell = null;
        });

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
            labelRenderer.render(scene, camera);
        }
        animate();

        canvas.cpRenderer = renderer;
        canvas.cpControls = controls;
        canvas.cpCamera = camera;

        // 移除旧 resize 监听器避免累积
        if (canvas._resizeHandler) {
            window.removeEventListener('resize', canvas._resizeHandler);
        }
        canvas._resizeHandler = () => {
            const rect = threeContainer.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            camera.aspect = rect.width / rect.height;
            camera.updateProjectionMatrix();
            renderer.setSize(rect.width, rect.height);
            labelRenderer.setSize(rect.width, rect.height);
        };
        window.addEventListener('resize', canvas._resizeHandler);

        // ----- 缩放（滚轮直接缩放；大画布可拉近看格子，不再只能远眺） -----
        // 沿当前视线方向缩放，保留平移后的 target（平移 + 缩放共存，不会跳回原点）
        const _applyZoom = () => {
            const dir = camera.position.clone().sub(controls.target).normalize();
            camera.position.copy(controls.target).addScaledVector(dir, baseCameraDist * zoomFactor);
            controls.update();
        };
        const _handleWheel = (e) => {
            e.preventDefault();
            zoomFactor = Math.max(0.3, Math.min(3, zoomFactor + (e.deltaY > 0 ? -0.1 : 0.1) * zoomFactor));
            const clampedDist = Math.max(baseCameraDist * 0.3, Math.min(baseCameraDist * 3, baseCameraDist * zoomFactor));
            zoomFactor = clampedDist / baseCameraDist;
            _applyZoom();
        };

        const _handleKeyDown = (e) => {
            if (!e.ctrlKey) return;
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                zoomFactor = Math.min(3, zoomFactor * 1.15);
            } else if (e.key === '-') {
                e.preventDefault();
                zoomFactor = Math.max(0.3, zoomFactor / 1.15);
            } else return;
            const clampedDist = Math.max(baseCameraDist * 0.3, Math.min(baseCameraDist * 3, baseCameraDist * zoomFactor));
            zoomFactor = clampedDist / baseCameraDist;
            _applyZoom();
        };

        // ----- 触控：单指轻触切换格子 / 滑动涂抹点亮 -----
        let _touchPos = null;
        let _touchMoved = false;
        let _lastPaintedTouch = null;
        let _touchStartTime = 0;
        const _onTouchStart = (e) => {
            if (e.touches.length === 1) {
                _touchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                _touchMoved = false;
                _lastPaintedTouch = null;
                _touchStartTime = Date.now();
            } else {
                _touchPos = null;
            }
        };
        const _onTouchMove = (e) => {
            if (e.touches.length === 1 && _touchPos) {
                const dx = e.touches[0].clientX - _touchPos.x;
                const dy = e.touches[0].clientY - _touchPos.y;
                if (dx * dx + dy * dy > 64) _touchMoved = true;
                // 滑动经过格子时点亮未选中的
                const pos = getHitCell({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
                if (pos) {
                    const key = `${pos.x},${pos.z}`;
                    if (key !== _lastPaintedTouch) {
                        _lastPaintedTouch = key;
                        if (!compressGrid[pos.x]) compressGrid[pos.x] = [];
                        if (compressGrid[pos.x][pos.z] < 0) {
                            toggleCell(pos.x, pos.z);
                        }
                    }
                }
            }
        };
        const _onTouchEnd = (e) => {
            if (_touchPos && e.changedTouches.length === 1) {
                const touch = e.changedTouches[0];
                const elapsed = Date.now() - _touchStartTime;
                // 短促轻触（<250ms）→ 切换（点亮/熄灭）；长滑由 _onTouchMove 处理
                if (elapsed < 250) {
                    const pos = getHitCell({ clientX: touch.clientX, clientY: touch.clientY });
                    if (pos) {
                        const x = pos.x, z = pos.z;
                        if (!compressGrid[x]) compressGrid[x] = [];
                        toggleCell(x, z);
                    }
                }
            }
            _touchPos = null;
        };

        const _onPointerUp = () => { isMouseDown = false; drawMode = 'toggle'; };

        // 保存清理函数，供 closeWin 使用
        canvas._cleanupEvents = () => {
            renderer.domElement.removeEventListener('wheel', _handleWheel);
            renderer.domElement.removeEventListener('touchstart', _onTouchStart);
            renderer.domElement.removeEventListener('touchmove', _onTouchMove);
            renderer.domElement.removeEventListener('touchend', _onTouchEnd);
            document.removeEventListener('keydown', _handleKeyDown);
            document.removeEventListener('pointerup', _onPointerUp);
        };

        document.addEventListener('keydown', _handleKeyDown);
        renderer.domElement.addEventListener('wheel', _handleWheel, { passive: false });
        renderer.domElement.addEventListener('touchstart', _onTouchStart, { passive: true });
        renderer.domElement.addEventListener('touchmove', _onTouchMove, { passive: true });
        renderer.domElement.addEventListener('touchend', _onTouchEnd);
        document.addEventListener('pointerup', _onPointerUp);

        // ---- 更新格子外观（首次和后续都调用此函数；点亮/涂抹走局部 updateCellAppearance） ----
        // 文字自适应：先按「格子当前屏幕像素尺寸」定基准字号，再用 canvas.measureText 收缩，
        // 保证编号/坐标/名称整行宽度 ≤ 格子宽度，永远待在正方形中（大画布缩小字号、小画布放大字号）。
        // _fitCtx 已在函数顶部提前声明（避开 TDZ）。
        function fitFontSize(text, maxW, base) {
            if (!text) return base;
            let size = Math.max(base, 4);
            _fitCtx.font = `bold ${size.toFixed(1)}px monospace`;
            while (size > 4 && _fitCtx.measureText(text).width > maxW) {
                size -= 0.5;
                _fitCtx.font = `bold ${size.toFixed(1)}px monospace`;
            }
            return size;
        }
        // 格子当前屏幕像素尺寸（随相机距离/缩放实时变化）
        function cellScreenPx() {
            const cam = canvas.cpCamera, ctl = canvas.cpControls;
            if (!cam || !ctl) return 40;
            const dist = cam.position.distanceTo(ctl.target);
            const viewH = 2 * dist * Math.tan(cam.fov * Math.PI / 360);
            const hPx = (renderer.domElement && renderer.domElement.clientHeight) || 400;
            const csfv = canvas._cellSizeFinal || cellSizeFinal;
            return Math.max(csfv / viewH * hPx, 6);
        }
        // 取显示名：材质模式显示材质名，组模式显示组名
        function cellNameOf(paramIdx) {
            const bd = compressParamsList[paramIdx];
            if (!bd) return '';
            return colorMode === 'material' ? (bd.mat || '') : (bd.group || '');
        }
        function createCellLabel(d) {
            const div = document.createElement('div');
            div.style.textAlign = 'center';
            div.style.fontFamily = 'monospace';
            div.style.userSelect = 'none';
            div.style.pointerEvents = 'none';
            div.style.textShadow = '0 0 4px rgba(0,0,0,0.75)';
            const label = new CSS2DObject(div);
            const csfv = canvas._cellSizeFinal || cellSizeFinal;
            const cx = (canvas._W || compressW), cz = (canvas._H || compressH);
            const px = (d.x - (cx - 1) / 2) * csfv;
            const pz = (d.z - (cz - 1) / 2) * csfv;
            label.position.set(px, 0.05, pz);
            labelGroup.add(label);
            d.label = label;
        }
        function updateCellAppearance(d) {
            if (!d) return;
            const key = `${d.x},${d.z}`;
            const isLit = !!(compressGrid[d.x] && compressGrid[d.x][d.z] >= 0);
            const isPattern = (canvas._patternSlots || compressPatternSlots || []).some(p => p.x === d.x && p.z === d.z);
            const wx = (canvas._minX !== undefined ? canvas._minX : compressSx) + d.x;
            const wz = (canvas._minZ !== undefined ? canvas._minZ : compressSz) + d.z;
            const inst = d.z * (canvas._W || compressW) + d.x;
            const face = canvas._faceInst, border = canvas._borderInst;
            const isLightMode = document.body.classList.contains('light-mode');
            const unlitBg = canvas._unlitBgHex !== undefined ? canvas._unlitBgHex : (isLightMode ? 0xd1d5db : 0x111a2e);
            const unlitBorder = canvas._unlitBorderHex !== undefined ? canvas._unlitBorderHex : (isLightMode ? 0x9ca3af : 0x1a2a4a);
            const cellPx = cellScreenPx();
            const gCc = canvas._getCellColor || getCellColor;
            const _setColor = (instObj, hex) => { if (!instObj) return; instObj.setColorAt(inst, _dummyC.setHex(hex)); if (instObj.instanceColor) instObj.instanceColor.needsUpdate = true; };

            if (isLit) {
                const idx0 = compressGrid[d.x][d.z];
                const blockData = compressParamsList[idx0];
                const name = cellNameOf(idx0);
                let bgHex = unlitBg, borderHex = unlitBorder, textColor = isLightMode ? '#475569' : '#94a3b8';
                if (blockData) {
                    const cc = gCc(colorMode === 'material' ? (blockData.mat || '') : blockData.group, colorMode);
                    bgHex = parseInt(cc.bg.replace('#', ''), 16);
                    borderHex = parseInt(cc.border.replace('#', ''), 16);
                    textColor = cc.text;
                }
                _setColor(face, bgHex);
                _setColor(border, borderHex);

                const numText = String(idx0 + 1);
                const coordText = `(${wx},${wz})`;
                let numSize = Math.min(cellPx * 0.52, 22);
                let coordSize = Math.min(numSize * 0.6, 12);
                numSize = fitFontSize(numText, cellPx * 0.98, numSize);
                coordSize = fitFontSize(coordText, cellPx * 0.98, coordSize);
                let nameHtml = '';
                if (name && cellPx >= 44) {
                    const nmSize = fitFontSize(name, cellPx * 0.98, Math.min(cellPx * 0.28, 12));
                    nameHtml = `<br><span style="color:${textColor};font-size:${nmSize.toFixed(1)}px;opacity:0.85;line-height:1.05">${escapeHtml(name)}</span>`;
                }
                if (!d.label) createCellLabel(d);
                d.label.element.innerHTML = `<b style="color:${textColor};font-size:${numSize.toFixed(1)}px;line-height:1.15">${numText}</b>` +
                    `<br><span style="color:#6a8aaa;font-size:${coordSize.toFixed(1)}px;line-height:1.05">${coordText}</span>` + nameHtml;
            } else if (isPattern) {
                const bgHex = isLightMode ? 0xe0f2fe : 0x111a2e;
                const patternColor = isLightMode ? '#3b82f6' : '#1e40af';
                _setColor(face, bgHex);
                _setColor(border, parseInt(patternColor.replace('#', ''), 16));
                if (!d.label) createCellLabel(d);
                const coordText = `(${wx},${wz})`;
                const cSize = fitFontSize(coordText, cellPx * 0.98, Math.min(cellPx * 0.4, 14));
                d.label.element.innerHTML = `<span style="color:${patternColor};font-size:${cSize.toFixed(1)}px">${coordText}</span>`;
            } else {
                _setColor(face, unlitBg);
                _setColor(border, unlitBorder);
                // 未点亮格子也显示坐标（用户需要看清网格每个格子的世界坐标用于落点）：
                // 字号自适应，比点亮格更小、淡化；保持与大画布性能的兼容（小画布字号可读、大画布字号收紧）。
                if (!d.label) createCellLabel(d);
                const coordText = `(${wx},${wz})`;
                const uSize = fitFontSize(coordText, cellPx * 0.98, Math.min(cellPx * 0.32, 11));
                d.label.element.innerHTML = `<span style="color:#6a8aaa;font-size:${uSize.toFixed(1)}px;opacity:0.7">${coordText}</span>`;
            }
        }
        function refreshCellAppearance() {
            const cd = canvas._cellData || cellData || [];
            for (const d of cd) updateCellAppearance(d);
        }
        // 单个格子局部刷新（点亮/熄灭/涂抹时调用，替代全量遍历——大画布涂抹不卡）
        function updateCellAt(x, z) {
            const d = (canvas._cellData || []).find(c => c.x === x && c.z === z);
            if (d) updateCellAppearance(d);
        }
        // 暴露给同弹窗内的兄弟函数（toggleCell / 颜色切换按钮）
        canvas._updateCellAt = updateCellAt;
        canvas._refreshCellAppearance = refreshCellAppearance;
    }

    function showCoordsMode() {
        title.textContent = '📦 压缩导出 - 设置坐标';
        win.style.height = '400px';
        
        body.innerHTML = `
            <div style="width:100%;padding:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                <div style="text-align:center;margin-bottom:12px;">
                    <span style="font-size:14px;color:${colors.textColor};">请设置画布起始和终止坐标</span>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:8px;width:100%;">
                    <div style="flex:1;">
                        <label style="display:block;font-size:11px;color:${colors.textColor};margin-bottom:2px;">起始 X</label>
                        <input id="cpSX" type="number" value="${sxInput.value}" style="width:100%;padding:4px;border-radius:4px;border:1px solid ${colors.inputBorder};background:${colors.inputBg};color:${colors.inputText};font-size:12px;box-sizing:border-box;">
                    </div>
                    <div style="flex:1;">
                        <label style="display:block;font-size:11px;color:${colors.textColor};margin-bottom:2px;">起始 Z</label>
                        <input id="cpSZ" type="number" value="${szInput.value}" style="width:100%;padding:4px;border-radius:4px;border:1px solid ${colors.inputBorder};background:${colors.inputBg};color:${colors.inputText};font-size:12px;box-sizing:border-box;">
                    </div>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:12px;width:100%;">
                    <div style="flex:1;">
                        <label style="display:block;font-size:11px;color:${colors.textColor};margin-bottom:2px;">终止 X</label>
                        <input id="cpEX" type="number" value="${exInput.value}" style="width:100%;padding:4px;border-radius:4px;border:1px solid ${colors.inputBorder};background:${colors.inputBg};color:${colors.inputText};font-size:12px;box-sizing:border-box;">
                    </div>
                    <div style="flex:1;">
                        <label style="display:block;font-size:11px;color:${colors.textColor};margin-bottom:2px;">终止 Z</label>
                        <input id="cpEZ" type="number" value="${ezInput.value}" style="width:100%;padding:4px;border-radius:4px;border:1px solid ${colors.inputBorder};background:${colors.inputBg};color:${colors.inputText};font-size:12px;box-sizing:border-box;">
                    </div>
                </div>
                <div style="display:flex;gap:8px;justify-content:center;width:100%;">
                    <button id="cpCancel" style="flex:1;padding:6px;border:none;border-radius:4px;background:${colors.cancelBtnBg};color:${colors.cancelBtnColor};font-size:12px;cursor:pointer;transform:skewX(-5deg);">取消</button>
                    <button id="cpConfirmCoords" style="flex:1;padding:6px;border:none;border-radius:4px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:12px;font-weight:bold;cursor:pointer;transform:skewX(-5deg);">确认坐标</button>
                </div>
            </div>
        `;

        win.querySelector('#cpCancel').onclick = closeWin;
        win.querySelector('#cpConfirmCoords').onclick = showCanvasMode;
    }

    function showCanvasMode() {
        canvasRotation = 0;
        sxInput = win.querySelector('#cpSX');
        szInput = win.querySelector('#cpSZ');
        exInput = win.querySelector('#cpEX');
        ezInput = win.querySelector('#cpEZ');

        title.textContent = '📦 压缩导出';
        win.querySelector('#cpExportScheme').style.display = 'block';
        win.querySelector('#cpPattern').style.display = 'block';
        win.querySelector('#cpImportScheme').style.display = 'block';
        win.style.height = isMobile ? '85vh' : '550px';
        
        const sx = parseInt(sxInput.value) || 0;
        const sz = parseInt(szInput.value) || 0;
        const ex = parseInt(exInput.value) || 0;
        const ez = parseInt(ezInput.value) || 0;

        const W = Math.abs(ex - sx) + 1;
        const H = Math.abs(ez - sz) + 1;
        compressGrid = Array.from({ length: W }, () => Array(H).fill(-1));
        compressLitSlots = [];
        compressPatternSlots = [];
        compressW = W;
        compressH = H;
        compressSx = Math.min(sx, ex);
        compressSz = Math.min(sz, ez);
        compressStepX = 1;
        compressStepZ = 1;

        // 修复：body 自身作为 flex 容器，避免内部 div height:100% 在 flex 父元素中失效
        body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'flex-start';
        body.style.padding = '12px';
        body.innerHTML = `
            <div id="cpCanvas" style="flex:1;min-height:0;border:1px solid ${colors.canvasBorder};border-radius:4px;background:${colors.canvasBg};overflow:hidden;margin-bottom:8px;"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0;">
                <button id="cpRotate" style="flex:1;min-width:100px;padding:6px;border:none;border-radius:4px;background:#6366f1;color:#fff;font-size:11px;cursor:pointer;transform:skewX(-5deg);">↻ 旋转90°</button>
                <button id="cpColorMode" style="flex:1;min-width:100px;padding:6px;border:none;border-radius:4px;background:#7c3aed;color:#ddd6fe;font-size:11px;cursor:pointer;transform:skewX(-5deg);">🎨 按组配色</button>
                <button id="cpReset" style="flex:1;min-width:100px;padding:6px;border:none;border-radius:4px;background:#2a3a6e;color:#fff;font-size:11px;cursor:pointer;transform:skewX(-5deg);">重置网格</button>
                <button id="cpExport" style="flex:2;min-width:120px;padding:6px;border:none;border-radius:4px;background:linear-gradient(135deg,#f7971e,#ffa82e);color:#0f172a;font-size:11px;font-weight:bold;cursor:pointer;transform:skewX(-5deg);">确认压缩导出</button>
            </div>
        `;

        canvas = body.querySelector('#cpCanvas');

        body.querySelector('#cpReset').onclick = () => {
            canvasRotation = 0;
            compressGrid = Array.from({ length: compressW }, () => Array(compressH).fill(-1));
            compressLitSlots = [];
            compressPatternSlots = [];
            zoomFactor = 1;
            renderGrid();
        };

        body.querySelector('#cpRotate').onclick = () => {
            showToast('🔄 使用鼠标中键拖拽旋转视角');
        };

        // 颜色模式切换：按组 ↔ 按材质（重建图例 + 全量刷新格子外观）
        body.querySelector('#cpColorMode').onclick = () => {
            colorMode = colorMode === 'group' ? 'material' : 'group';
            body.querySelector('#cpColorMode').textContent = colorMode === 'group' ? '🎨 按组配色' : '🎨 按材质配色';
            if (canvas._renderLegend) canvas._renderLegend();
            if (canvas._refreshCellAppearance) canvas._refreshCellAppearance();
        };

        win.querySelector('#cpPattern').onclick = () => {
            compressPatternSlots = [];
            for (let xi = 0; xi < compressW; xi++) {
                for (let zi = 0; zi < compressH; zi++) {
                    if (compressGrid[xi] && compressGrid[xi][zi] >= 0) {
                        compressPatternSlots.push({ x: xi, z: zi });
                        compressGrid[xi][zi] = -1;
                    }
                }
            }
            compressLitSlots = [];
            renderGrid();
        };

        win.querySelector('#cpExportScheme').onclick = () => {
            const lit = getLitEntries();
            const data = {
                sx: compressSx,
                sz: compressSz,
                ex: compressSx + compressW - 1,
                ez: compressSz + compressH - 1,
                rotation: canvasRotation,
                lit: lit.map(l => ({ x: l.x, z: l.z })),
                pattern: compressPatternSlots
            };
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `compress-scheme-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        win.querySelector('#cpImportScheme').onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        sxInput.value = data.sx;
                        szInput.value = data.sz;
                        exInput.value = data.ex;
                        ezInput.value = data.ez;
                        canvasRotation = data.rotation || 0;
                        
                        const sx = parseInt(data.sx) || 0;
                        const sz = parseInt(data.sz) || 0;
                        const ex = parseInt(data.ex) || 0;
                        const ez = parseInt(data.ez) || 0;
                        const W = Math.abs(ex - sx) + 1;
                        const H = Math.abs(ez - sz) + 1;
                        compressGrid = Array.from({ length: W }, () => Array(H).fill(-1));
                        compressLitSlots = [];
                        compressPatternSlots = [];
                        compressW = W;
                        compressH = H;
                        compressSx = Math.min(sx, ex);
                        compressSz = Math.min(sz, ez);

                        if (data.lit) {
                            data.lit.forEach(({ x, z }) => {
                                if (x >= 0 && x < W && z >= 0 && z < H) {
                                    const idx = nextFreeIdx();
                                    if (idx >= 0) {
                                        compressGrid[x][z] = idx;
                                        compressLitSlots[idx] = { x, z };
                                    }
                                }
                            });
                        }

                        if (data.pattern) {
                            data.pattern.forEach(({ x, z }) => {
                                if (x >= 0 && x < W && z >= 0 && z < H) {
                                    compressPatternSlots.push({ x, z });
                                }
                            });
                        }

                        renderGrid();
                    } catch (err) {
                        showModal('❌ 导入失败', '文件格式不正确');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        };

        body.querySelector('#cpExport').onclick = () => {
            const lit = getLitEntries();
            if (lit.length === 0) {
                showModal('⚠️ 请先点亮', '请点击网格点亮至少一个方块');
                return;
            }

            const expectedPrefix = 'playanimation @e[type=fox] animation.player.attack.positions _ 0 "';
            const expectedSuffix = 'return 1;"';
            
            if (exportPrefix.trim() !== expectedPrefix.trim() || exportSuffix.trim() !== expectedSuffix.trim()) {
                const warnMsg = '当前前后缀格式与压缩导出的标准格式不符，是否自动更新为标准格式？<br><br>标准前缀：<br>' + escapeHtml(expectedPrefix) + '<br><br>标准后缀：<br>' + escapeHtml(expectedSuffix);
                showConfirmModal(warnMsg, (confirmed) => {
                    if (confirmed) {
                        exportPrefix = expectedPrefix;
                        exportSuffix = expectedSuffix;
                        savePrefixSuffix();
                    }
                    doCompressExport(lit);
                });
            } else {
                doCompressExport(lit);
            }
        };
        
        function doCompressExport(lit) {
            const items = [];
            for (const { x, z, idx } of lit) {
                const block = compressParamsList[idx];
                const wx = compressSx + x * compressStepX;
                const wz = compressSz + z * compressStepZ;
                let param = block.rawParams;
                // 关键帧动画适配：带逐块/骨骼关键帧的方块 → 用动画程序（q.anim_time 驱动）替换静态参数。
                // 纯叶子子骨骼（getKeyframeCommandText 返回 null）保留 rawParams（含 t.父_* 跟随表达式），
                // 由父骨骼动画命令发布的全局变量驱动，压缩导出同样吃动画。
                const b = blocks.find(bb => bb.id === block.id);
                if (b && hasKeyframeAnimation(b.id)) {
                    const kfText = getKeyframeCommandText(b.id, false);
                    if (kfText) {
                        const blockIdPrefix = getMaterialTag(b);
                        const groupPrefix = b.group ? molangTag(`'group:${b.group}';`) : '';
                        const parentBonePrefix = getParentBonePrefix(b);
                        const boneTag = getBoneTagForBlock(b);
                        param = blockIdPrefix + groupPrefix + parentBonePrefix + boneTag + kfText;
                    }
                }
                items.push({ cond: `(v.x==${wx}&&v.z==${wz})`, param });
            }

            const MAX_LEN = 20000;
            const prefix = exportPrefix;
            const suffix = exportSuffix.replace(/{id}/g, '');
            const restoreStr = compressHasMolang ? '' : getShortNameRestoreString();
            const compressedBlocks = items.map(item => `${item.cond}?(${item.param})`);
            const cmds = [];
            let currentGroup = [];
            let currentLen = prefix.length + restoreStr.length + suffix.length;

            for (const block of compressedBlocks) {
                const blkLen = block.length + 1;
                if (currentLen + blkLen <= MAX_LEN) {
                    currentGroup.push(block);
                    currentLen += blkLen;
                } else {
                    if (currentGroup.length) cmds.push(prefix + currentGroup.join(';') + ';' + restoreStr + suffix);
                    currentGroup = [block];
                    currentLen = prefix.length + restoreStr.length + suffix.length + blkLen;
                }
            }
            if (currentGroup.length) cmds.push(prefix + currentGroup.join(';') + ';' + restoreStr + suffix);

            // 在坐标压缩导出结果最前面追加的定位初始化命令
            const prependCommand = 'playanimation @e[type=fox] animation.player.attack.positions _ 0 "    v.x=math.round(q.position(0)-0.5);v.z=math.round(q.position(2)-0.5);return 1;" a';
            cmds.unshift(prependCommand);

            // 清理可能残留的导出弹窗，避免遮挡压缩结果
            document.querySelectorAll('.modal').forEach(m => m.remove());

            showCompressedResultModal(cmds);
            closeWin();
        };

        setTimeout(() => {
            renderGrid();
        }, 50);
    }

    closeBtn.onclick = closeWin;
    win.querySelector('#cpCancel').onclick = closeWin;

    const confirmBtn = win.querySelector('#cpConfirmCoords');
    console.log('confirmBtn:', confirmBtn);
    if (confirmBtn) {
        confirmBtn.onclick = function() {
            console.log('确认坐标按钮被点击');
            try {
                showCanvasMode();
            } catch(e) {
                console.error('showCanvasMode error:', e);
                alert('错误: ' + e.message);
            }
        };
    } else {
        console.error('cpConfirmCoords button not found');
    }

    let isDragging = false, dragSX = 0, dragSY = 0, winX = 0, winY = 0;
    let isResizing = false, resizeSX = 0, resizeSY = 0, winW = 0, winH = 0;

    function onDrag(e) {
        if (!isDragging) return;
        win.style.left = `${winX + e.clientX - dragSX}px`;
        win.style.top = `${winY + e.clientY - dragSY}px`;
    }

    function onDragEnd() { isDragging = false; }

    function onResize(e) {
        if (!isResizing) return;
        const minW = isMobile ? 280 : 500;
        const minH = isMobile ? 200 : 300;
        const newW = Math.max(minW, winW + e.clientX - resizeSX);
        const newH = Math.max(minH, winH + e.clientY - resizeSY);
        win.style.width = `${newW}px`;
        win.style.height = `${newH}px`;
        if (canvas) renderGrid();
    }

    function onResizeEnd() { isResizing = false; }

    header.onmousedown = (e) => {
        isDragging = true;
        dragSX = e.clientX;
        dragSY = e.clientY;
        winX = win.offsetLeft;
        winY = win.offsetTop;
        e.preventDefault();
    };

    resizeHandle.onmousedown = (e) => {
        isResizing = true;
        resizeSX = e.clientX;
        resizeSY = e.clientY;
        winW = win.offsetWidth;
        winH = win.offsetHeight;
        e.preventDefault();
    };

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', onResizeEnd);
}

function generateCompressedCommands(sx, sz, ex, ez) {
    const W = Math.abs(ex - sx) + 1;
    const H = Math.abs(ez - sz) + 1;
    const stepX = ex >= sx ? 1 : -1;
    const stepZ = ez >= sz ? 1 : -1;

    const items = [];
    for (let b of blocks) {
        // 关键帧动画适配：带逐块/骨骼关键帧的方块 → 用动画程序替换静态参数
        // （纯叶子子骨骼返回 null → 保留 rawParams 跟随表达式，由父骨骼动画发布全局驱动）
        let varsStr;
        if (hasKeyframeAnimation(b.id)) {
            const kfText = getKeyframeCommandText(b.id, false);
            if (kfText) { varsStr = kfText; }
        }
        if (varsStr === undefined) {
            // molang 接管方块：直接输出完整 program，避免条件分支被重建吞掉
            if (b.scope && b.scope.molangMode && b.scope.program && b.scope.program.trim()) {
                varsStr = b.scope.program.trim();
            } else {
                varsStr = getOrderedAssignmentsString(b);
            }
        }
        let blockIdPrefix = getMaterialTag(b);
        let groupPrefix = '';
        if (b.group) {
            groupPrefix = molangTag(`'group:${b.group}';`);
        }
        const parentBonePrefix = getParentBonePrefix(b);
        const boneTag = getBoneTagForBlock(b);
        if (b.type === 'flag') {
            varsStr = molangTag(`'方块类型：旗帜';`) + varsStr;
        } else if (b.type === 'dropitem') {
            varsStr = molangTag(`'方块类型：掉落物';`) + varsStr;
        }

        // 定位坐标：从方块的静态 v.xpos/v.zpos 取整（关键帧文本里 v.xpos 是 lerp 表达式，正则解析会失败）
        const xposVar = b.scope && b.scope.vars ? b.scope.vars.get('v.xpos') : null;
        const zposVar = b.scope && b.scope.vars ? b.scope.vars.get('v.zpos') : null;
        let wx = xposVar ? Math.round(xposVar.value) : 0;
        let wz = zposVar ? Math.round(zposVar.value) : 0;

        items.push({ wx, wz, params: blockIdPrefix + groupPrefix + parentBonePrefix + boneTag + varsStr });
    }

    const MAX_LEN = 20000;
    const prefix = exportPrefix;
    const suffix = exportSuffix.replace(/{id}/g, '');
    const suffixWithId = exportSuffix;

    const compressedBlocks = items.map(item => `(v.x==${item.wx}&&v.z==${item.wz})?(${item.params})`);
    const cmds = [];
    let currentGroup = [];
    let currentLen = prefix.length + suffix.length;
    
    for (const block of compressedBlocks) {
        const blkLen = block.length + 1;
        if (currentLen + blkLen <= MAX_LEN) {
            currentGroup.push(block);
            currentLen += blkLen;
        } else {
            if (currentGroup.length) {
                cmds.push(prefix + currentGroup.join(';') + ';' + suffix);
            }
            currentGroup = [block];
            currentLen = prefix.length + suffix.length + blkLen;
        }
    }
    if (currentGroup.length) {
        cmds.push(prefix + currentGroup.join(';') + ';' + suffix);
    }

    return cmds;
}

function showCompressedResultModal(cmds) {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';
    modalDiv.style.zIndex = '10002';
    
    let totalChars = 0;
    for (const c of cmds) totalChars += c.length;

    let html = `
        <div class="modal-content" style="max-width: 600px; padding: 20px 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <span style="font-size: 18px; font-weight: bold;">📦 压缩结果</span>
                <button id="compressResultCloseBtn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: inherit;">✕</button>
            </div>
            <div class="stat-grid" style="margin-bottom: 16px; padding: 10px 14px;">
                <span class="label">命令条数</span>
                <span class="value" style="color: ${cmds.length > 1 ? '#f7971e' : '#4caf50'}">${cmds.length} ${cmds.length > 1 ? '条（已分割）' : '条'}
</span>
                <span class="label">总字符数</span>
                <span class="value">${totalChars}</span>
                <span class="label">方块数</span>
                <span class="value">${blocks.length}</span>
            </div>
            <div style="max-height: 50vh; overflow-y: auto; margin-bottom: 16px;">
    `;

    for (let i = 0; i < cmds.length; i++) {
        html += `
            <div style="background: #0f172a; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; border: 1px solid #2a3a5e;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 13px; font-weight: bold; color: #f7971e;">命令 ${i + 1}</span>
                    <button class="modal-btn" id="copyCmd${i}" style="padding: 4px 12px; font-size: 12px;">📋 复制</button>
                </div>
                <pre style="font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; color: #c8d8f0; margin: 0;">${escapeHtml(cmds[i])}</pre>
            </div>
        `;
    }

    html += `
            </div>
            <div class="modal-buttons">
                <button class="modal-btn" id="copyAllCompressedBtn">📋 复制全部</button>
                <button class="modal-btn" id="downloadCompressedBtn" style="background: linear-gradient(135deg, #1e9b6e, #28b87e);">⬇ 导出TXT</button>
                <button class="modal-btn" id="closeCompressedBtn">关闭</button>
            </div>
        </div>
    `;

    modalDiv.innerHTML = html;
    document.body.appendChild(modalDiv);

    const closeModal = () => modalDiv.remove();
    modalDiv.querySelector('#compressResultCloseBtn').onclick = closeModal;
    modalDiv.querySelector('#closeCompressedBtn').onclick = closeModal;

    for (let i = 0; i < cmds.length; i++) {
        modalDiv.querySelector(`#copyCmd${i}`).addEventListener('click', () => {
            copyToClipboard(cmds[i]);
            const btn = modalDiv.querySelector(`#copyCmd${i}`);
            const orig = btn.innerText;
            btn.innerText = '✅ 已复制';
            setTimeout(() => btn.innerText = orig, 1500);
        });
    }

    modalDiv.querySelector('#copyAllCompressedBtn').addEventListener('click', () => {
        const allCmds = cmds.join('\n\n');
        copyToClipboard(allCmds);
        const btn = modalDiv.querySelector('#copyAllCompressedBtn');
        const orig = btn.innerText;
        btn.innerText = '✅ 已复制全部';
        setTimeout(() => btn.innerText = orig, 1500);
    });

    modalDiv.querySelector('#downloadCompressedBtn').addEventListener('click', () => {
        const text = cmds.join('\n\n');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `compressed_commands_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        const btn = modalDiv.querySelector('#downloadCompressedBtn');
        const orig = btn.innerText;
        btn.innerText = '✅ 已下载';
        setTimeout(() => btn.innerText = orig, 1500);
    });
}

