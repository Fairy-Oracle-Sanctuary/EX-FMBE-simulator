/* 03-blocks/03-sidebar-and-selection.js · 源 测试版v.6b79.html 第 11144-11513 行 */
'use strict';
// ===== 侧边栏数值显示区（inspector）：文件夹数值 / 选中方块常量（仅新操作模式）=====
// 渲染到指定面板元素（侧边栏 #inspectorPanel 或浮动面板 #folderValuesFloat 复用同一套逻辑）
function renderInspectorInto(panel) {
    if (!panel) return;
    if (!isNewLayoutMode) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
    panel.style.display = '';
    const round4 = (v) => { const n = Number(v); return Math.round(n * 10000) / 10000; };

    // ----- 文件夹选中：显示骨骼枢轴与旋转（实时），不显示可编辑变换（文件夹不存储可编辑变换）-----
    if (selectedFolder) {
        const f = getFolder(selectedFolder);
        if (!f) { panel.innerHTML = ''; return; }
        // 读取文件夹自身的枢轴/旋转数组字段（pivot / rotation）。此函数曾被误删导致
        // 普通文件夹选中/隐藏/显示时 renderInspector 抛 ReferenceError → renderSideBlockList
        // 在事件绑定前中断 → 侧栏所有按钮（折叠/隐藏/管理/删除/添加模型/添加文件夹/工具）失效。
        const fmtFld = (kind, idx) => {
            const arr = kind === 'pivot' ? (f.pivot || [0, 0, 0]) : (f.rotation || [0, 0, 0]);
            return Number(arr[idx]) || 0;
        };
        const cubeIds = getFolderAllCubeIds(selectedFolder);
        const childCount = cubeIds.length;
        // 骨骼文件夹（有骨干）：枢轴/旋转与骨干方块【实时挂等号】——枢轴=骨干世界位置，旋转=骨干本地 xrot
        const isBoneFld = !!(f._backbone);
        const bb = isBoneFld ? folderBackboneBlock(f) : null;
        const round4v = (x) => round4(Number(x) || 0);
        const mkRow3 = (label, vals, dataFld) => {
            const colors = ['#ef4444', '#22c55e', '#3b82f6'];
            const cells = ['x', 'y', 'z'].map((ax, i) =>
                `<label class="insp-cell"><svg class="insp-marker" viewBox="0 0 8 8" width="8" height="8"><path d="M0 0 L0 6 L6 0 Z" fill="${colors[i]}"/></svg><input type="number" step="0.5" data-fld="${dataFld}" data-idx="${i}" value="${vals[i]}"></label>`
            ).join('');
            return `<div class="insp-row"><span class="insp-label">${escapeHtml(label)}</span><div class="insp-inputs">${cells}</div></div>`;
        };
        const bbRot = () => (bb && bb.scope)
            ? [Number(bb.scope.vars.get('v.rotatex')?.value ?? 0), Number(bb.scope.vars.get('v.rotatey')?.value ?? 0), Number(bb.scope.vars.get('v.rotatez')?.value ?? 0)]
            : [0, 0, 0];
        // ★ 骨骼文件夹：枢轴 = 骨干【v.xpos/ypos/zpos = 枢轴锚点】（与单方块枢轴手柄同构）。
        //   拖拽（联动开/关）与「归位枢轴」都改写 v.xpos，面板读 v.xpos 即实时跟随、且显示的就是枢轴数据。
        const bbPivotVals = () => (bb ? [tvnum(bb, 'v.xpos'), tvnum(bb, 'v.ypos'), tvnum(bb, 'v.zpos')] : [0, 0, 0]);
        // 旋转显示：与骨干方块自身面板【完全同构】——尊重 inspRotMode，
        // 全局模式读 v.rotatex/y/z、本地模式读 v.xrot/y/z。方针2：文件夹显示的数据 = 骨干方块数据。
        // （旧实现用 bbWorldRot 把 rotate⊗xrot 复合再符号翻转，与方块面板三套表示互不一致，已弃用）
        const bbRotVals = () => {
            if (!bb || !bb.scope) return [0, 0, 0];
            const g = (vn) => Number(bb.scope.vars.get(vn)?.value ?? 0);
            return (inspRotMode === 'rotate')
                ? [g('v.rotatex'), g('v.rotatey'), g('v.rotatez')]
                : [g('v.xrot'), g('v.yrot'), g('v.zrot')];
        };
        const pivotVals = isBoneFld
            ? bbPivotVals().map(round4v)
            : [round4v(fmtFld('pivot', 0)), round4v(fmtFld('pivot', 1)), round4v(fmtFld('pivot', 2))];
        const rotVals = isBoneFld
            ? bbRotVals().map(round4v)
            : [round4v(fmtFld('rotation', 0)), round4v(fmtFld('rotation', 1)), round4v(fmtFld('rotation', 2))];
        panel.innerHTML = `
            <div class="insp-title">📁 骨骼：${escapeHtml(f.name)}</div>
            <div class="insp-hint">子级方块 ${childCount} 个${isBoneFld ? `；骨干 = <b>${escapeHtml(bb ? bb.id : '?')}</b>` : ''}。</div>
            ${mkRow3('骨骼枢轴', pivotVals, 'pivot')}
            ${mkRow3('骨骼旋转', rotVals, 'rotation')}
            ${!isBoneFld ? `<div class="insp-hint">枢轴与旋转可直接编辑；详细概念见「设置 →→ 新手教程」。</div>` : ''}
        `;
        // 枢轴输入：骨骼文件夹 → 按差值整体移动骨骼（applyFolderMove）；普通文件夹 → 改 f.pivot
        panel.querySelectorAll('input[data-fld="pivot"][data-idx]').forEach(inp => {
            const idx = parseInt(inp.dataset.idx, 10);
            const apply = () => {
                let v = parseFloat(inp.value); if (isNaN(v)) v = 0;
                if (isBoneFld) {
                    // 差值基准 = 骨干枢轴锚点 v.xpos（与 Gizmo 手柄、folderGizmoCenterWorld 同构），
                    // 让「输入 N」=「枢轴锚点设为 N」，不累加、不漂移。
                    bb && bb.refresh && bb.refresh();
                    const cx = tvnum(bb, 'v.xpos'), cy = tvnum(bb, 'v.ypos'), cz = tvnum(bb, 'v.zpos');
                    const delta = new THREE.Vector3(idx === 0 ? v - cx : 0, idx === 1 ? v - cy : 0, idx === 2 ? v - cz : 0);
                    if (delta.lengthSq() > 1e-8) moveBoneFolderPivot(f.name, delta, pivotLinkModel);
                } else {
                    if (!f.pivot) f.pivot = [0, 0, 0];
                    f.pivot[idx] = v;
                }
                const gc = folderGizmoCenterWorld(f.name);
                if (gc) gizmoRoot.position.copy(gc);
                requestGizmoRefresh();
                renderInspectorInto(panel);
                try { recordAction(); } catch (e) {}
            };
            inp.addEventListener('change', apply);
        });
        // 旋转输入：骨骼文件夹 → 用世界旋转差值 applyFolderRotate（按目标世界角旋转到对应角度）；
        // 普通文件夹 → 绕世界轴（原逻辑）
        panel.querySelectorAll('input[data-fld="rotation"][data-idx]').forEach(inp => {
            const idx = parseInt(inp.dataset.idx, 10);
            const apply = () => {
                let v = parseFloat(inp.value); if (isNaN(v)) v = 0;
                const worldAxis = new THREE.Vector3(idx === 0 ? 1 : 0, idx === 1 ? 1 : 0, idx === 2 ? 1 : 0);
                const old = isBoneFld ? bbRotVals()[idx] : (f.rotation ? (f.rotation[idx] || 0) : 0);
                const delta = v - old;
                if (Math.abs(delta) > 1e-5) {
                    const c = folderGizmoCenterWorld(f.name);
                    if (c) applyFolderRotate(f.name, worldAxis, delta, c);
                    if (!isBoneFld) { if (!f.rotation) f.rotation = [0, 0, 0]; f.rotation[idx] = v; }
                }
                requestGizmoRefresh();
                renderInspectorInto(panel);
                try { recordAction(); } catch (e) {}
            };
            inp.addEventListener('change', apply);
        });
        return;
    }

    // ----- 选中单个方块：显示其常量数值（可编辑）-----
    const single = (selectedBlocksSet.size === 1) ? [...selectedBlocksSet][0] : (selectedBlock || null);
    if (single) {
        // ★ 显示兜底：extend_scale=0 在数值面板一律显示为 0.0001（与写入/导出侧同口径），
        //   避免用户看到「尺寸 = 0」这种会让人误以为模型坏了的读数。
        const sv = (n) => esGuardVarValue(n, Number(single.scope.vars.get(n)?.value ?? 0));
        // 文件夹骨骼（显式 ✛ 绑定）上下文状态：仅当方块属于【多块文件夹】时才有意义
        const grp = single.group || null;
        const folderObj = grp ? getFolder(grp) : null;
        const isBackbone = !!(folderObj && folderObj._backbone === single.id);
        const canBackbone = !!grp && getFolderAllCubeIds(grp).length >= 2;
        // 用红/绿/蓝三角形角标代替 XYZ 文本；extend_* 用专属颜色区分
        const axisColor = (vn) => {
            switch (vn) {
                case 'v.xbasepos': case 'v.xpos': case 'v.xrot': case 'v.rotatex': return '#ef4444';
                case 'v.ybasepos': case 'v.ypos': case 'v.yrot': case 'v.rotatey': return '#22c55e';
                case 'v.zbasepos': case 'v.zpos': case 'v.zrot': case 'v.rotatez': return '#3b82f6';
                case 'v.extend_scale': return '#a855f7';
                case 'v.extend_xrot': return '#f59e0b';
                case 'v.extend_yrot': return '#06b6d4';
                default: return '#94a3b8';
            }
        };
        const mkInp = (varName, step) =>
            `<label class="insp-cell"><svg class="insp-marker" viewBox="0 0 8 8" width="8" height="8"><path d="M0 0 L0 6 L6 0 Z" fill="${axisColor(varName)}"/></svg><input type="number" step="${step}" data-var="${varName}" value="${round4(sv(varName))}"></label>`;
        const mkRow = (label, inputs, actionBtn = '') => `
            <div class="insp-row">
                <span class="insp-label">${escapeHtml(label)}</span>
                <div class="insp-inputs">${inputs.join('')}</div>
                ${actionBtn}
            </div>`;
        // ✛ 骨骼子块：旋转行【强制走本地旋转 xrot/yrot/zrot】。
        // 全局旋转行写的是 v.rotatex/y/z —— 对骨骼子块那正是「跟随父骨骼」的通道
        // （v.rotatex = t.父_xrot），写常量会把跟随链接剪断、子骨骼不再随父旋转（用户报告）。
        // 子块自身的旋转应当在 xrot/yrot/zrot 上做，故此处直接给出可编辑的本地通道并隐藏切换按钮。
        const _isBoneChild = !!(single && single._boneParent);
        const m = !_isBoneChild && inspRotMode === 'rotate';
        const rotVars = [m ? 'v.rotatex' : 'v.xrot', m ? 'v.rotatey' : 'v.yrot', m ? 'v.rotatez' : 'v.zrot'];
        // ★ 多选时本面板仍以「主方块(selectedBlock)」显示数值，但 ◎ 归位必须对【全部选中】生效
        //   （旧实现只处理 single，导致多选点 ◎ 只有主方块枢轴归零，其余纹丝不动）。
        const selCount = selectedBlocksSet.size;
        const multiSel = selCount > 1;
        const pivotTargets = multiSel ? Array.from(selectedBlocksSet).filter(b => b && b.scope) : [single];
        const pivotTip = multiSel
            ? `把全部 ${selCount} 个选中方块的枢轴归到原点（各自保持模型位置）`
            : '归位到原点（保持模型位置）';
        panel.innerHTML = `
            <div class="insp-title">❒ ${multiSel ? `多选：${selCount} 个方块` : `方块：${escapeHtml(single.id)}`}</div>
            ${multiSel ? `<div class="insp-hint">数值为主方块 <b>${escapeHtml(single.id)}</b>；◎ 归位对全部 ${selCount} 个生效。</div>` : ''}
            ${mkRow('位置', ['v.xbasepos','v.ybasepos','v.zbasepos'].map(vn => mkInp(vn, 0.5)))}
            ${mkRow('尺寸', ['v.extend_scale','v.extend_xrot','v.extend_yrot'].map(vn => mkInp(vn, 0.05)))}
            ${mkRow('枢轴点', ['v.xpos','v.ypos','v.zpos'].map(vn => mkInp(vn, 0.5)),
                `<button type="button" class="insp-row-action" data-pivot-reset title="${pivotTip}">◎</button>`)}
            ${mkRow('旋转', rotVars.map(vn => mkInp(vn, 1)),
                _isBoneChild
                    ? `<span class="insp-row-action" style="cursor:default;opacity:0.6;" title="骨骼子块：旋转跟随父骨骼，此处只能编辑自身旋转 xrot/yrot/zrot">local</span>`
                    : `<button type="button" class="insp-row-action" data-rot-toggle title="切换 本地/全局 旋转">${m ? 'global' : 'local'}</button>`)}
        `;
        const rotToggle = panel.querySelector('[data-rot-toggle]');
        if (rotToggle) rotToggle.addEventListener('click', () => {
            inspRotMode = (inspRotMode === 'rot') ? 'rotate' : 'rot';
            renderInspectorInto(panel);
        });
        const resetPivotBtn = panel.querySelector('[data-pivot-reset]');
        if (resetPivotBtn) {
            resetPivotBtn.addEventListener('click', () => {
                // ★ 批量 mutation：不能用 recordAction()（200ms 防抖，窗口内 Ctrl+Z 会让撤销空转），
                //   必须「先 flush 再 mutation 再立即落账」。
                try { flushPendingRecords(); } catch (e) {}
                let n = 0, skipped = 0;
                pivotTargets.forEach(b => {
                    if (!b || !b.scope) return;
                    // 真 molang 绑骨子块的位置由父骨实时驱动，独立归位会剪断跟随 / 缩成一团 → 跳过
                    if (typeof isBoneMolangDriven === 'function' && isBoneMolangDriven(b)) { skipped++; return; }
                    setPivotKeepingModel(b, new THREE.Vector3(0, 0, 0));
                    n++;
                });
                try { history.record(getState()); } catch (e) {}
                try { renderVariablesForBlock(single); } catch (e) {}
                requestGizmoRefresh();
                renderInspector();
                if (multiSel || skipped > 0) {
                    if (n > 0 && skipped > 0) showToast(`已将 ${n} 个方块枢轴归位到原点（保持位置）；${skipped} 个为绑骨子块，跳过`);
                    else if (n > 0) showToast(`已将 ${n} 个方块枢轴归位到原点（保持位置）`);
                    else if (skipped > 0) showToast(`${skipped} 个选中方块均为绑骨子块（位置由父骨驱动），已跳过`);
                }
            });
        }
        panel.querySelectorAll('input[data-var]').forEach(inp => {
            const apply = () => {
                let v = parseFloat(inp.value); if (isNaN(v)) v = 0;
                setConstVarValue(single, inp.dataset.var, v);
                single.refresh();
                single.mesh.updateMatrixWorld(true);
                if (selectedBlock === single) renderVariablesForBlock(single);
                requestGizmoRefresh();
            };
            inp.addEventListener('input', apply);
            inp.addEventListener('change', () => { apply(); try { recordAction(); } catch (e) {} try { syncKeyframeFromBlock(single); } catch (e) {} });
        });
        return;
    }

    // ----- 多选：灰掉并显示提示 -----
    if (selectedBlocksSet.size > 1) {
        panel.innerHTML = `<div class="insp-disabled">当前选中了多个方块</div>`;
        return;
    }

    // ----- 无选择 -----
    panel.innerHTML = `<div class="insp-hint">未选中对象</div>`;
}
// 包装：刷新侧边栏数值区；若浮动文件夹数值面板可见，同步刷新
function renderInspector() {
    const insp = document.getElementById('inspectorPanel');
    if (insp) renderInspectorInto(insp);
    const fl = document.getElementById('folderValuesFloat');
    if (fl && fl.style.display !== 'none') renderInspectorInto(fl);
    // 数据表内联数值面板：仅新布局 + 非侧边时显示（数据表只显示数据，不显示方块列表/文件夹）
    const dt = document.getElementById('dataTableInspector');
    if (dt) {
        if (isNewLayoutMode && !isSidePanelMode) { dt.style.display = ''; renderInspectorInto(dt); }
        else dt.style.display = 'none';
    }
    // 虚拟键条随数据表同条件显隐（仅新布局 + 非侧边）
    if (typeof syncVirtModKeybarVisibility === 'function') syncVirtModKeybarVisibility();
    // 数据视图头部细条（「切回方块列表」图形按钮）随数据表同条件显隐
    if (typeof syncDataViewHeader === 'function') syncDataViewHeader();
}
// 实时更新数据面板里的数值（不整面板重渲染，避免拖拽时丢失焦点/闪烁）
function updateInspectorValues() {
    if (!isNewLayoutMode) return;
    const round4 = (v) => { const n = Number(v); return Math.round(n * 10000) / 10000; };
    [document.getElementById('inspectorPanel'), document.getElementById('folderValuesFloat'), document.getElementById('dataTableInspector')].forEach(panel => {
        if (!panel || panel.style.display === 'none') return;
        // 文件夹数值
    if (selectedFolder) {
            const f = getFolder(selectedFolder); if (!f) return;
            const isBoneFld = !!f._backbone;
            const bb = isBoneFld ? folderBackboneBlock(f) : null;
            // ★ 骨骼文件夹：枢轴 = 骨干【v.xpos 枢轴锚点】，旋转 = 骨干【骨骼旋转源 rotate】
            //   （与 Gizmo 手柄 / folderGizmoCenterWorld / 拖拽 全部同源；联动关闭时模型原地不动、
            //    v.xpos 照常平移，面板如实显示"枢轴已移动"）
            let livePivot = null, liveRot = null;
            if (isBoneFld && bb) {
                try {
                    bb.refresh && bb.refresh();
                    livePivot = [tvnum(bb, 'v.xpos'), tvnum(bb, 'v.ypos'), tvnum(bb, 'v.zpos')];
                    // 旋转与方块面板同构：跟随 inspRotMode 读 v.rotatex(全局)/v.xrot(本地)
                    liveRot = (inspRotMode === 'rotate')
                        ? [
                            Number(bb.scope.vars.get('v.rotatex')?.value ?? 0),
                            Number(bb.scope.vars.get('v.rotatey')?.value ?? 0),
                            Number(bb.scope.vars.get('v.rotatez')?.value ?? 0)
                          ]
                        : [
                            Number(bb.scope.vars.get('v.xrot')?.value ?? 0),
                            Number(bb.scope.vars.get('v.yrot')?.value ?? 0),
                            Number(bb.scope.vars.get('v.zrot')?.value ?? 0)
                          ];
                } catch (e) { livePivot = [0, 0, 0]; liveRot = [0, 0, 0]; }
            }
            panel.querySelectorAll('input[data-fld][data-idx]').forEach(inp => {
                if (document.activeElement === inp) return; // 用户正在编辑，不覆盖
                const fld = inp.dataset.fld, idx = parseInt(inp.dataset.idx, 10);
                let v;
                if (isBoneFld) {
                    if (fld === 'pivot') v = livePivot ? round4(livePivot[idx]) : 0;
                    else if (fld === 'rotation') v = liveRot ? round4(liveRot[idx]) : 0;
                } else if (f[fld] && f[fld][idx] !== undefined) {
                    v = round4(f[fld][idx]);
                }
                if (v !== undefined && inp.value !== String(v)) inp.value = v;
            });
        }
        // 单块数值
        const single = (selectedBlocksSet.size === 1) ? [...selectedBlocksSet][0] : (selectedBlock || null);
        if (single) {
            panel.querySelectorAll('input[data-var]').forEach(inp => {
                if (document.activeElement === inp) return;
                const d = single.scope.vars.get(inp.dataset.var);
                if (d) {
                    const v = round4(d.value);
                    if (inp.value !== String(v)) inp.value = v;
                }
            });
        }
    });
}
// 文件夹拖拽源（跨 renderSideBlockList 保持）
let folderDragSrcName = null;
// 方块拖拽源：把方块拖入文件夹时使用（dataTransfer 用 'block:' 前缀区分文件夹拖拽）
let blockDragSrcId = null;
// 拖拽起点时间戳（自愈兜底：拖拽异常中断导致 dragend 丢失时，renderSideBlockList 超时强制清理残留）
let _dragSrcTs = 0;
// 清除文件夹拖拽高亮（方块拖拽结束时复用）
function clearBlockDropHighlight() {
    const sl = document.getElementById('sideBlockList');
    if (sl) sl.querySelectorAll('.side-block-group-header.drag-over').forEach(el => el.classList.remove('drag-over'));
}

let selectedBlock = null;
// 当前选中的文件夹（骨骼）对象：新操作模式下用于 inspector 面板与文件夹 Gizmo；一次只选中一个文件夹
let selectedFolder = null;
// 单块检查器「旋转」区切换：'rot' = 本地旋转(xrot/yrot/zrot)，'rotate' = 全局旋转(rotatex/rotatey/rotatez)
let inspRotMode = 'rot';
let pendingDeleteFolder = null;
let pendingDeleteBtn = null;
let pendingDeleteTip = null;
let pendingDeleteTimeout = null;
let hideNames = false;

// 删除文件夹：用「删除按钮上方的内嵌红色文本 + 确认/取消」替代浏览器原生 confirm()
function _folderDeleteDocHandler(e) {
    if (!pendingDeleteTip) return;
    if (pendingDeleteTip.contains(e.target)) return;            // 点在提示框内：由其自身处理
    if (pendingDeleteBtn && pendingDeleteBtn.contains(e.target)) return; // 再次点删除按钮：由其自身处理
    closeFolderDeleteTip();
}
function closeFolderDeleteTip() {
    if (pendingDeleteTip && pendingDeleteTip.parentNode) pendingDeleteTip.parentNode.removeChild(pendingDeleteTip);
    pendingDeleteTip = null;
    pendingDeleteFolder = null;
    pendingDeleteBtn = null;
    document.removeEventListener('mousedown', _folderDeleteDocHandler, true);
}
function openFolderDeleteTip(btn, groupName) {
    closeFolderDeleteTip();
    const tip = document.createElement('div');
    tip.className = 'folder-delete-tip';
    tip.innerHTML = `<span>删除 <b title="${escapeHtml(groupName)}">${escapeHtml(groupName)}</b> 及子文件夹（含内部全部方块）？</span>` +
        `<span class="folder-delete-confirm">删除</span>` +
        `<span class="folder-delete-cancel">取消</span>`;
    document.body.appendChild(tip);
    // 定位到删除按钮上方（getBoundingClientRect 已是视口真实坐标，position:fixed 亦为视口坐标，无需除以 zoom）
    const rect = btn.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = rect.left + rect.width / 2 - tw / 2;
    let top = rect.top - th - 6;
    if (top < 4) top = rect.bottom + 6;                         // 上方放不下则改到下方
    if (left < 4) left = 4;
    const maxLeft = window.innerWidth - tw - 4;
    if (left > maxLeft) left = Math.max(4, maxLeft);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    pendingDeleteFolder = groupName;
    pendingDeleteBtn = btn;
    pendingDeleteTip = tip;
    tip.querySelector('.folder-delete-confirm').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFolder(groupName);
        if (selectedFolder === groupName) selectedFolder = null;
        closeFolderDeleteTip();
        renderSideBlockList();
    });
    tip.querySelector('.folder-delete-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        closeFolderDeleteTip();
    });
    document.addEventListener('mousedown', _folderDeleteDocHandler, true);
}
let selectedBlocksSet = new Set();
