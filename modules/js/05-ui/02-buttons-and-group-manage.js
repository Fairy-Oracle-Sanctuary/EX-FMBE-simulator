/* 05-ui/02-buttons-and-group-manage.js · 源 测试版v.6b79.html 第 22514-23262 行 */
'use strict';
// ==================== 按钮事件 ====================

function showCreateBlockMenu() {
    // 已打开「新建模型」面板时不再重复弹出：避免连按 N（或连点「新建模型」）叠加出多个面板。
    // 关闭面板（closeModal → remove）后 id 消失，守卫自动解除，下次按 N 可再次弹出。
    if (document.getElementById('createBlockMenuModal')) return;
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';
    modalDiv.id = 'createBlockMenuModal';
    modalDiv.style.zIndex = '1001';
    // 若当前选中了文件夹，新建的方块 / 模型将创建到该文件夹内
    const blockParentHint = selectedFolder
        ? `<div style="font-size: 12px; color: #60a5fa; margin-bottom: 14px;">将创建到文件夹：<b>${selectedFolder}</b> 内</div>`
        : '';
    modalDiv.innerHTML = `
        <div class="modal-content" style="max-width: 320px; padding: 16px 20px; text-align: center;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <span style="font-size: 18px; font-weight: bold;">选择方块类型</span>
                <button id="closeTypeMenuBtn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: inherit;">✕</button>
            </div>
            ${blockParentHint}
            <div style="margin-bottom: 16px;">
                <div id="createCubeBtn" style="display: block; width: 100%; padding: 10px; border-radius: 8px; cursor: pointer; color: inherit;"><img src="${ICON_CUBE}" width="24" height="24" style="vertical-align:middle;margin-right:6px;image-rendering:pixelated;">方块</div>
                <div id="createPlaneBtn" style="display: block; width: 100%; padding: 10px; border-radius: 8px; cursor: pointer; color: inherit; margin-top: 4px;"><img src="${ICON_PLANE}" width="24" height="24" style="vertical-align:middle;margin-right:6px;image-rendering:pixelated;">平面</div>
                <div id="createHalfbrickBtn" style="display: block; width: 100%; padding: 10px; border-radius: 8px; cursor: pointer; color: inherit; margin-top: 4px;"><img src="${ICON_SLAB}" width="24" height="24" style="vertical-align:middle;margin-right:6px;image-rendering:pixelated;">半砖</div>
                <div id="createStairBtn" style="display: block; width: 100%; padding: 10px; border-radius: 8px; cursor: pointer; color: inherit; margin-top: 4px;"><img src="${ICON_STAIR}" width="24" height="24" style="vertical-align:middle;margin-right:6px;image-rendering:pixelated;">楼梯</div>
                <div id="createFlagBtn" style="display: block; width: 100%; padding: 10px; border-radius: 8px; cursor: pointer; color: inherit; margin-top: 4px;"><img src="${ICON_FLAG}" width="24" height="24" style="vertical-align:middle;margin-right:6px;image-rendering:pixelated;">旗帜</div>
                <div id="createDropItemBtn" style="display: block; width: 100%; padding: 10px; border-radius: 8px; cursor: pointer; color: inherit; margin-top: 4px;"><img src="${texUrl('items/dye_powder_yellow.png')}" width="24" height="24" style="vertical-align:middle;margin-right:6px;image-rendering:pixelated;">掉落物</div>
            </div>
            <div style="border-top: 1px solid #334155; margin: 12px 0;"></div>
            <div id="createGroupBtn" style="display: block; width: 100%; padding: 10px; border-radius: 8px; cursor: pointer; color: inherit; margin-bottom: 8px;">📂 新建组</div>
            <div id="presetBtn" style="display: block; width: 100%; padding: 10px; border-radius: 8px; cursor: pointer; font-style: italic; color: inherit;">📁 预设</div>
        </div>
    `;
    document.body.appendChild(modalDiv);

    const closeModal = () => modalDiv.remove();
    modalDiv.querySelector('#closeTypeMenuBtn').onclick = closeModal;
    
    const createCubeBtn = modalDiv.querySelector('#createCubeBtn');
    const createPlaneBtn = modalDiv.querySelector('#createPlaneBtn');
    const createHalfbrickBtn = modalDiv.querySelector('#createHalfbrickBtn');
    const createStairBtn = modalDiv.querySelector('#createStairBtn');
    const createFlagBtn = modalDiv.querySelector('#createFlagBtn');
    const createDropItemBtn = modalDiv.querySelector('#createDropItemBtn');
    const createGroupBtn = modalDiv.querySelector('#createGroupBtn');
    const presetBtn = modalDiv.querySelector('#presetBtn');
    
    const addHoverEffect = (el) => {
        el.addEventListener('mouseenter', () => {
            el.style.backgroundColor = '#3b82f6';
            el.style.color = '#0f172a';
        });
        el.addEventListener('mouseleave', () => {
            el.style.backgroundColor = '';
            el.style.color = '';
        });
    };
    addHoverEffect(createCubeBtn);
    addHoverEffect(createPlaneBtn);
    addHoverEffect(createHalfbrickBtn);
    addHoverEffect(createStairBtn);
    addHoverEffect(createFlagBtn);
    addHoverEffect(createDropItemBtn);
    addHoverEffect(createGroupBtn);
    addHoverEffect(presetBtn);
    
    createCubeBtn.onclick = () => {
        createBlockOfType('cube');
        closeModal();
    };
    createPlaneBtn.onclick = () => {
        closeModal();
        createPlaneBlock();
    };
    createHalfbrickBtn.onclick = () => {
        createBlockOfType('halfbrick');
        closeModal();
    };
    createStairBtn.onclick = () => {
        createBlockOfType('stair');
        closeModal();
    };
    createFlagBtn.onclick = () => {
        createBlockOfType('flag');
        closeModal();
    };
    createDropItemBtn.onclick = () => {
        createBlockOfType('dropitem');
        closeModal();
    };
    createGroupBtn.onclick = () => {
        closeModal();
        showCreateGroupModal();
    };
    presetBtn.onclick = () => {
        closeModal();
        showPresetMenu();
    };
}
// 实际创建方块的函数（复用原有逻辑）
function createBlockOfType(type) {
    const defaultM = [0,0,0,0,0,0,1,1,-90,0,0,0,0];
    let base;
    if (type === 'flag') base = "Flag";
    else if (type === 'dropitem') base = "DropItem";
    else if (type === 'halfbrick') base = "Halfbrick";
    else if (type === 'stair') base = "Stair";
    else base = "Cube";
    let id = base, idx = 1;
    while (blocks.some(b => b.id === id)) id = base + (idx++).toString();
    // 若当前选中了文件夹（骨骼），新方块/模型直接创建到该文件夹内
    const newBlock = new Block(id, defaultM, null, '#aaccff', type, selectedFolder || null);
    // 掉落物默认用黄色染料贴图；材质面板「本地上传图片」可换成任意物品贴图（16×16/32×32）
    if (type === 'dropitem') newBlock.loadTexture('items/dye_powder_yellow.png', '掉落物');
    if (selectedFolder) {
        // 组内（骨骼）创建方块：自动把新模型的位置对齐到骨骼枢轴（骨干方块所在位置），
        // 并把新模型的 pos 变量初始化为骨干方块的 pos，使新方块直接生成在骨骼当前位置、随骨骼一起运动。
        const f = getFolder(selectedFolder);
        if (f && f._backbone) {
            const backbone = folderBackboneBlock(f);
            if (backbone && backbone.scope) {
                const bp = backbone.scope.vars.get('v.xpos')?.value ?? 0;
                const bpy = backbone.scope.vars.get('v.ypos')?.value ?? 0;
                const bpz = backbone.scope.vars.get('v.zpos')?.value ?? 0;
                newBlock.scope.setVarExpr('v.xpos', String(_r4(bp)));
                newBlock.scope.setVarExpr('v.ypos', String(_r4(bpy)));
                newBlock.scope.setVarExpr('v.zpos', String(_r4(bpz)));
                // 立即把新 mesh 变换到骨骼枢轴位置，否则视觉上仍停留在原点
                newBlock.refresh();
            }
        }
        // 保持文件夹选中（活动容器），便于连续添加：不让 addBlock 自动选中方块（否则会清空活动文件夹）
        addBlock(newBlock, true, false);
        // 文件夹必须检查骨干：新建方块归入文件夹后，无骨干则立即把本方块指定为骨干，
        // 有骨干则自动绑定到骨干（与拖入/导入行为一致，避免用户从“+ 新建”路径产生无骨干文件夹）。
        autoBoneBindOnFolderAdd(newBlock, selectedFolder);
        if (isNewLayoutMode) renderSideBlockList();
    } else {
        addBlock(newBlock);
    }
}

// ==================== 组管理函数 ====================
function showCreateGroupModal() {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';
    modalDiv.style.zIndex = '1001';
    // 若当前选中了文件夹，新文件夹将作为其子文件夹创建
    const parentFolder = selectedFolder || null;
    const parentHint = parentFolder
        ? `<div style="font-size: 12px; color: #60a5fa; margin-bottom: 16px;">将创建到文件夹：<b>${parentFolder}</b> 内</div>`
        : '';
    modalDiv.innerHTML = `
        <div class="modal-content" style="max-width: 320px; padding: 16px 20px; text-align: center;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <span style="font-size: 18px; font-weight: bold;">新建组</span>
                <button id="closeGroupModalBtn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: inherit;">✕</button>
            </div>
            <input type="text" id="groupNameInput" class="modal-input-text" placeholder="请输入组名称" style="margin-bottom: 8px;">
            ${parentHint}
            <div style="display: flex; justify-content: center; gap: 10px;">
                <button class="modal-btn" id="cancelGroupBtn">取消</button>
                <button class="modal-btn" id="confirmGroupBtn">创建</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalDiv);
    
    const closeModal = () => modalDiv.remove();
    const input = modalDiv.querySelector('#groupNameInput');
    const confirmBtn = modalDiv.querySelector('#confirmGroupBtn');
    const cancelBtn = modalDiv.querySelector('#cancelGroupBtn');
    const closeBtn = modalDiv.querySelector('#closeGroupModalBtn');

    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    const createGroup = () => {
        let name = input.value.trim();
        // 名称为空时自动生成 bone / bone1 / bone2...
        if (!name) {
            const base = 'bone';
            let candidate = base;
            let idx = 1;
            while (folders.find(g => g.name === candidate)) {
                candidate = base + idx;
                idx++;
            }
            name = candidate;
        }
        if (folders.find(g => g.name === name)) {
            showModal("提示", "组名称已存在", null, false);
            return;
        }
        const f = createFolder(name, parentFolder || null);
        // 新文件夹默认展开，便于立即看到其下的方块 / 子文件夹
        if (f) f.expanded = true;
        renderSideBlockList();
        closeModal();
    };
    
    confirmBtn.onclick = createGroup;
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            createGroup();
        }
    });
    
    input.focus();
}

function showGroupManageModal(groupName) {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';
    modalDiv.style.zIndex = '1001';
    
    const groupBlocks = blocks.filter(b => b.group === groupName);
    const otherBlocks = blocks.filter(b => !b.group || b.group !== groupName);
    
    const selectedIds = Array.from(selectedBlocksSet).map(b => b.id);
    const hasSelected = selectedIds.length > 0;
    
    const group = folders.find(g => g.name === groupName);
    const isHidden = group && group.hidden;
    
    let html = `
        <div class="modal-content" style="max-width: 500px; max-height: 70vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 18px; font-weight: bold;">管理组: ${escapeHtml(groupName)}</span>
                    <button id="renameGroupBtn" style="background: none; border: none; cursor: pointer; color: #60a5fa; font-size: 16px; padding: 2px;">✏️</button>
                </div>
                <button id="closeGroupManageBtn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: inherit;">✕</button>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                    <input type="checkbox" id="groupHiddenCheckbox" ${isHidden ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer;">
                    <span>组内方块不显示</span>
                </label>
            </div>
            <div style="margin-bottom: 16px; font-size: 12px; color: #94a3b8;">
                选择方块添加到组中，或从组中移除
            </div>
            <div style="margin-bottom: 16px;">
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; color: #60a5fa;">组内方块</div>
                <div id="groupBlocksList" style="max-height: 200px; overflow-y: auto; border: 1px solid #3b82f6; border-radius: 8px; padding: 4px;">
    `;
    
    if (groupBlocks.length === 0) {
        html += `<div style="padding: 8px; color: #64748b; text-align: center;">暂无方块</div>`;
    } else {
        groupBlocks.forEach(b => {
            html += `<div class="group-manage-item" data-block-id="${b.id}" data-action="remove" style="padding: 6px 10px; cursor: pointer; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                <span>❒ ${b.id}</span>
                <span style="color: #f43f5e; font-size: 12px;">移除</span>
            </div>`;
        });
    }
    
    html += `</div></div>`;
    
    html += `
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 14px; font-weight: bold; color: #60a5fa;">可添加方块</span>
                    ${hasSelected ? `<button id="moveSelectedBtn" style="padding: 3px 8px; border: none; border-radius: 4px; background: linear-gradient(135deg, #f7971e, #ffa82e); color: #0f172a; font-size: 11px; font-weight: bold; cursor: pointer; transform: skewX(-5deg);">📦 移入(${selectedIds.length})</button>` : ''}
                </div>
                <div id="otherBlocksList" style="max-height: 200px; overflow-y: auto; border: 1px solid #334155; border-radius: 8px; padding: 4px;">
    `;
    
    if (otherBlocks.length === 0) {
        html += `<div style="padding: 8px; color: #64748b; text-align: center;">暂无可用方块</div>`;
    } else {
        otherBlocks.forEach(b => {
            html += `<div class="group-manage-item" data-block-id="${b.id}" data-action="add" style="padding: 6px 10px; cursor: pointer; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                <span>❒ ${b.id}</span>
                <span style="color: #3b82f6; font-size: 12px;">添加</span>
            </div>`;
        });
    }
    
    html += `</div></div>`;
    
    html += `<div style="text-align: center;">
        <button id="confirmGroupManageBtn" class="modal-btn">完成</button>
    </div></div>`;
    
    modalDiv.innerHTML = html;
    document.body.appendChild(modalDiv);
    
    const closeModal = () => modalDiv.remove();
    modalDiv.querySelector('#closeGroupManageBtn').onclick = closeModal;
    modalDiv.querySelector('#confirmGroupManageBtn').onclick = closeModal;

    modalDiv.querySelector('#renameGroupBtn').onclick = () => {
        closeModal();
        editGroupName(groupName);
    };
    
    // 组内方块隐藏复选框
    const hiddenCheckbox = modalDiv.querySelector('#groupHiddenCheckbox');
    if (hiddenCheckbox) {
        hiddenCheckbox.addEventListener('change', () => {
            const g = folders.find(g2 => g2.name === groupName);
            if (g) {
                g.hidden = hiddenCheckbox.checked;
                bumpVisibilityRev();
                updateGroupVisibility(groupName);
            }
        });
    }

    // 嵌套层级（父子关系）仅通过大纲内的拖拽（套娃）来设定，管理弹窗不再提供父级选择控件。

    if (hasSelected) {
        modalDiv.querySelector('#moveSelectedBtn').onclick = () => {
            selectedBlocksSet.forEach(block => {
                block.group = groupName;
                autoBoneBindOnFolderAdd(block, groupName);
            });
            refreshBlocksUnderFolder(groupName);
            renderSideBlockList();
            showGroupManageModal(groupName);
            closeModal();
        };
    }
    
    modalDiv.querySelectorAll('.group-manage-item').forEach(item => {
        item.addEventListener('click', () => {
            const blockId = item.dataset.blockId;
            const action = item.dataset.action;
            const block = blocks.find(b => b.id === blockId);
            if (block) {
                if (action === 'add') {
                    block.group = groupName;
                    autoBoneBindOnFolderAdd(block, groupName);
                    refreshBlocksUnderFolder(groupName);
                } else {
                    autoBoneUnbindOnFolderRemove(block);
                    block.group = null;
                }
                renderSideBlockList();
                showGroupManageModal(groupName);
                closeModal();
            }
        });
        
        item.addEventListener('mouseenter', () => {
            item.style.background = 'rgba(59,130,246,0.1)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = '';
        });
    });
}

// 返回组“眼睛”图标 SVG（hidden=true 表示当前隐藏，返回闭眼）
function getGroupEyeIcon(hidden) {
    return hidden
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

// ★2026-10-04：方块「锁定」图标 —— 锁定时为闭合挂锁，未锁定时为开锁。与 👁 同尺寸。
function getBlockLockIcon(locked, cls) {
    const shackle = locked
        ? '<path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>'      // 闭合：锁梁落回锁体
        : '<path d="M8 10.5V7a4 4 0 0 1 7.6-1.7"/>';     // 打开：锁梁右端翘起
    return `<svg${cls ? ` class="${cls}"` : ''} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/>${shackle}</svg>`;
}

function updateGroupVisibility(groupName) {
    updateFolderVisibility(groupName);
}

function isBlockInHiddenGroup(block) {
    // 统一口径：文件夹隐藏（含祖先）∪ 方块自身隐藏
    return isBlockHidden(block);
}

function removeGroup(groupName) {
    removeFolder(groupName);
}

function editGroupName(oldName) {
    showModal(`编辑组名（当前: ${escapeHtml(oldName)}）`, '', (newName) => {
        const trimmedName = (newName || '').trim();
        if (!trimmedName) {
            showModal("提示", "请输入有效的组名称", null, false);
            return;
        }
        if (!renameFolder(oldName, trimmedName)) {
            showModal("提示", "组名称已存在或重命名失败", null, false);
            return;
        }
        renderSideBlockList();
    }, true);
}

// ==================== 平面生成函数 ====================
function round6(v) {
    return Math.round(v * 1e6) / 1e6;
}

// ---------- 通用平行四边形解（两边一角） ----------
// 输入：两边长 a / b（a 沿平面「第一边」、b 沿第二边）+ 夹角 angleDeg（度）。
// 输出：13 元变换所需的 scale / extend_scale / extend_xrot / extend_yrot / xrot / yrot / zrot。
//
// 原理：单位立方体经引擎拉伸算子 S = Ry(-ey)·Rx(ex)·Sz(es)·Rx(-ex)·Ry(ey) 作用后，
// 顶面会被拉成平行四边形。本函数先由「边长比 → 各向异性拉伸量」解二次方程求出使两条边
// 长度比恰为 a/b 的 (sin²ex, sin²ey)，再由该拉伸构造真实世界边向量 edge1 / 法向 normal /
// 切向 tangent，最后反解出把单位面片摆正到该姿态的 xrot/yrot/zrot。
//
// ★矩形（夹角 90°）是本解的特例，且与旧 generateRectParams 的矩形结果完全一致
//   （已验证：a=5,b=3 → scale=5, ex=-36.8699°, ey=90°, xrot=0, yrot=90°, zrot=53.1301°）。
//   extend_scale 取极小值（≈0，而非 0）——0 会让拉伸矩阵奇异、面片坍缩成一条线。
function generatePlaneParams(a, b, angleDeg) {
    const EPS_ES = 0.0001;                          // extend_scale：用极小值代替 0，避免矩阵奇异
    const ang = Number(angleDeg);
    const angle = (isFinite(ang) ? ang : 90) * Math.PI / 180;   // 转弧度（引擎 math.cos 取弧度）

    const ratio = (a / b) * (a / b);                 // 边长比的平方
    const cosAngle = Math.cos(angle);
    const cosAngleSq = cosAngle * cosAngle;

    // 解 sin²ex 的二次方程：K·x² + B·x + K = 0 形式（此处按用户解法写的系数）
    const coefK = ratio * (cosAngleSq - 1);
    const coefB = 2 * cosAngleSq * ratio + ratio * ratio + 1;
    const discriminant = Math.sqrt(Math.max(coefB * coefB - 4 * coefK * coefK, 0));
    const clamp01 = x => Math.max(0, Math.min(1, x));

    // 两个真实解分支
    const sinEyFrom = (sEx) => {
        const den = (1 - sEx) * (1 + ratio);
        // 退化解保护：sEx→1（ratio→1 且夹角→90°）时分母→0，此处按极限取 0，
        // 即两轴等比、无各向异性拉伸（正方形/菱形情形）。
        if (Math.abs(den) < 1e-12) return 0;
        return clamp01((ratio - sEx) / den);
    };

    let sinExSq, sinEySq;
    if (Math.abs(coefK) < 1e-12) {
        // coefK→0（ratio→1 且夹角→0/180）：退化为纯一轴拉伸
        sinExSq = 0;
        sinEySq = sinEyFrom(sinExSq);
    } else {
        const r1 = (-coefB + discriminant) / (2 * coefK);
        const r2 = (-coefB - discriminant) / (2 * coefK);
        const cand = [r1, r2].filter(Number.isFinite);
        // 优先取落在 [0,1] 内的根（合法解）；都不合法时取较小值再夹紧
        const inRange = cand.filter(x => x >= 0 && x <= 1);
        sinExSq = clamp01(inRange.length ? Math.min(...inRange) : Math.min(...(cand.length ? cand : [0])));
        sinEySq = sinEyFrom(sinExSq);
    }

    const eySign = (cosAngle >= 0) ? 1 : -1;
    // ★单位：sim 的 molang math.asin/atan2 返回【度】（见 MATH_FUNCS: asin 带 *180/PI），
    //   而 JS 的 Math.asin 返回弧度 —— 必须显式转换，否则写进 v.extend_xrot 的弧度值
    //   会被引擎当作"度"解读，拉伸角被压成 1/57，平面坍缩成一条细缝。
    const R2D = 180 / Math.PI;
    const extend_xrot = -Math.asin(Math.sqrt(sinExSq)) * R2D;
    const extend_yrot = Math.asin(Math.sqrt(sinEySq)) * R2D * eySign;
    const scale = a / Math.sqrt(sinEySq + (1 - sinEySq) * sinExSq);

    // ---- 由拉伸参数构造真实世界边向量，再反解摆放姿态 ----
    // 注意：此处用于构造几何的 ex/ey 需用【弧度】（三角函数入参），
    // 而返回值需用【度】，故分开保存。
    const exRad = extend_xrot / R2D, eyRad = extend_yrot / R2D;
    const cosEx = Math.cos(exRad), sinEx = Math.sin(exRad);
    const cosEy = Math.cos(eyRad), sinEy = Math.sin(eyRad);
    const edge1 = [
        cosEy * cosEy + sinEx * sinEx * sinEy * sinEy,
        -sinEx * cosEx * sinEy,
        sinEy * cosEy * cosEx * cosEx
    ];
    const edge1Len = Math.hypot(edge1[0], edge1[1], edge1[2]) || 1;
    const e1h = [edge1[0] / edge1Len, edge1[1] / edge1Len, edge1[2] / edge1Len];
    const normal = [-cosEx * sinEy, -sinEx, cosEx * cosEy];
    const tangent = [
        normal[1] * e1h[2] - normal[2] * e1h[1],
        normal[2] * e1h[0] - normal[0] * e1h[2],
        normal[0] * e1h[1] - normal[1] * e1h[0]
    ];

    const xrot = Math.asin(Math.max(-1, Math.min(1, -normal[2]))) * 180 / Math.PI;
    const yrot = Math.atan2(-tangent[2], e1h[2]) * 180 / Math.PI;
    const zrot = Math.atan2(-normal[0], normal[1]) * 180 / Math.PI;

    return {
        // ★单位语义：extend_xrot / extend_yrot / xrot / yrot / zrot 一律为【度】。
        //   与预设指令一致（sim 的 math.asin/atan2 返回度，而非 JS 的弧度）。
        extend_yrot: round6(extend_yrot),
        scale: round6(scale),
        extend_scale: EPS_ES,
        extend_xrot: round6(extend_xrot),
        xrot: round6(xrot),
        yrot: round6(yrot),
        zrot: round6(zrot)
    };
}

// 兼容旧调用：矩形平面 = 夹角 90° 的通用解特例。
// ★专供「画笔平面」使用：画笔平面恒为矩形，且需要把线段方向作为平面朝向（heading）叠加到 yrot。
//   通用解在 (a>b) 与 (b>a) 两种情形下会走不同分支（长边落在 edge1 或 edge2），
//   直接叠加 heading 会导致长边朝向错位。故此处单独提供「长边沿 heading」的稳定矩形解。
function generateRectParams(a, b) {
    let ey, sc, l1;
    if (a > b) { ey = 0.0; sc = a; l1 = b / a; }
    else if (b > a) { ey = 90.0; sc = b; l1 = a / b; }
    else { ey = 0.0; sc = a; l1 = 1.0; }
    const clamped = Math.max(-1.0, Math.min(1.0, l1));
    const ex_deg = -Math.asin(clamped) * 180 / Math.PI;
    const xr = (90.0 - ex_deg) * Math.cos(ey * Math.PI / 180.0);
    const zr = (90.0 + ex_deg) * Math.sin(ey * Math.PI / 180.0);
    return {
        extend_yrot: round6(ey),
        scale: round6(sc),
        extend_scale: 0.0001,
        extend_xrot: round6(ex_deg),
        xrot: round6(xr),
        yrot: 0,          // 矩形解自身朝向不含 yrot；画笔的 heading 直接写 M[4]
        zrot: round6(zr)
    };
}

// 由 长/宽/夹角 生成导入指令（「创建平面」对话框用）。
// 统一走通用平行四边形解；夹角缺省 90° 时即为矩形。
// ★此处只输出算好的几何终值，不输出 angle/side_a/side_b 原始输入：
//   对话框里用户已填过这三个数、JS 也已算完，回显它们只是噪音；
//   且它们不参与 molang 重算（改数值不会重新推 scale/extend_*），留着反而误导。
//   需要「改参数实时重算」的通用解请用预设「平行四边形：两边一角」。
function buildPlaneCommand(a, b, angleDeg) {
    const p = generatePlaneParams(a, b, angleDeg);
    return `execute  positioned ~-1~~ run playanimation @e[x=~,z=~,y=~,r=1] animation.player.attack.positions _ 0 "'block：白色羊毛'; v.xpos=0; v.ypos=0; v.zpos=0; v.xbasepos=0; v.ybasepos=0; v.zbasepos=0; v.scale=${p.scale}; v.extend_scale=${p.extend_scale}; v.extend_xrot=${p.extend_xrot}; v.extend_yrot=${p.extend_yrot}; v.xrot=${p.xrot}; v.yrot=${p.yrot}; v.zrot=${p.zrot};'方块编号：plane'; "`;
}

function createPlaneBlock() {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';
    modalDiv.style.zIndex = '1001';
    modalDiv.innerHTML = `
        <div class="modal-content" style="max-width: 360px; padding: 20px 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <span style="font-size: 18px; font-weight: bold;">▭ 创建平面</span>
                <button id="planeCloseBtn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: inherit;">✕</button>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; margin-bottom: 6px; color: #94a3b8;">长（X轴方向）</label>
                <input id="planeLengthInput" type="number" value="5" min="0.01" step="0.01" style="width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #3b82f6; background: #0f172a; color: white; font-size: 14px; outline: none; box-sizing: border-box;">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; margin-bottom: 6px; color: #94a3b8;">宽（Z轴方向）</label>
                <input id="planeWidthInput" type="number" value="3" min="0.01" step="0.01" style="width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #3b82f6; background: #0f172a; color: white; font-size: 14px; outline: none; box-sizing: border-box;">
            </div>
            <div style="margin-bottom: 24px;">
                <label style="display: block; font-size: 13px; margin-bottom: 6px; color: #94a3b8;">夹角（度，90 = 矩形）</label>
                <input id="planeAngleInput" type="number" value="90" min="0.01" max="179.99" step="1" style="width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #3b82f6; background: #0f172a; color: white; font-size: 14px; outline: none; box-sizing: border-box;">
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button class="modal-btn" id="planeCancelBtn">取消</button>
                <button class="modal-btn" id="planeConfirmBtn" style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white;">确认创建</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalDiv);

    const closeModal = () => modalDiv.remove();
    modalDiv.querySelector('#planeCloseBtn').onclick = closeModal;
    modalDiv.querySelector('#planeCancelBtn').onclick = closeModal;

    const lenInput = modalDiv.querySelector('#planeLengthInput');
    const widInput = modalDiv.querySelector('#planeWidthInput');
    const angInput = modalDiv.querySelector('#planeAngleInput');

    lenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') widInput.focus(); });
    widInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') angInput.focus(); });
    angInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') modalDiv.querySelector('#planeConfirmBtn').click(); });

    modalDiv.querySelector('#planeConfirmBtn').onclick = () => {
        const a = parseFloat(lenInput.value);
        const b = parseFloat(widInput.value);
        const ang = parseFloat(angInput.value);
        if (!isFinite(a) || a <= 0) {
            lenInput.style.borderColor = '#ef4444';
            lenInput.focus();
            return;
        }
        if (!isFinite(b) || b <= 0) {
            widInput.style.borderColor = '#ef4444';
            widInput.focus();
            return;
        }
        // 夹角合法区间 (0, 180)：0/180 会让平行四边形退化成线段，无意义
        if (!isFinite(ang) || ang <= 0 || ang >= 180) {
            angInput.style.borderColor = '#ef4444';
            angInput.focus();
            return;
        }
        closeModal();
        const cmd = buildPlaneCommand(a, b, ang);
        importFromCommands(cmd);
    };

    setTimeout(() => lenInput.focus(), 100);
}

// 绑定新建按钮
document.getElementById('addBlockBtn').onclick = () => {
    showCreateBlockMenu();
};

// ==================== 预设模板数据中心 ====================
const presetTemplates = [
    {
        description: "方块侧面：两边一角",
        command: `execute  positioned ~-1~~ run playanimation @e[x=~,z=~,y=~,r=1] animation.player.attack.positions _ 0 "'block：钻石块'; v.xpos=0; v.ypos=0; v.zpos=0; v.yrot=0; v.zrot=90; v.extend_xrot=0; v.xbasepos=0.5; v.ybasepos=0; v.zbasepos=0; v.side_a=2.16; v.side_b=1.43; v.angle=136.43; v.rotatez=0; v.rotatey=0; v.rotatex=0; v.first=math.pow(v.side_a*10,2); v.B=math.pow(v.side_b*10,2); v.C=100*v.side_a*v.side_b*math.cos(v.angle); v.scy_or=(90 - v.angle)/math.abs(v.angle - 90); v.det=v.first*v.B-math.pow(v.C,2); v.D=math.sqrt(v.det); v.T=math.sqrt(v.first+v.B+2*v.D); v.R11=(v.first+v.D)/v.T; v.R12=v.C/v.T; v.R22=(v.B+v.D)/v.T; v.extend_yrot=0.5*math.atan2(2*v.R12,v.R11-v.R22); v.c=math.cos(v.extend_yrot); v.scale_sin=math.sin(v.extend_yrot); v.scy_y=math.sin(v.extend_yrot)*math.sin(v.extend_yrot); v.d1=v.c*v.c*v.R11+2*v.c*v.scale_sin*v.R12+v.scale_sin*v.scale_sin*v.R22; v.d2=v.scale_sin*v.scale_sin*v.R11-2*v.c*v.scale_sin*v.R12+v.c*v.c*v.R22; v.scale=v.d1/10; v.extend_scale=v.d2/v.d1; v.scy_sy=v.extend_scale*math.cos(v.extend_yrot)*math.cos(v.extend_yrot); v.scy_division=(-v.scy_sy-v.scy_y) / math.sqrt(v.scy_sy*v.extend_scale+v.scy_y); v.scy_rot=180-math.acos(v.scy_division); v.xrot=-v.scy_or * v.scy_rot;'方块编号：Cube1'; "`
    },
    {
       
        description: "平行四边形：两边一角",
        command: `execute  positioned ~-1~~ run playanimation @e[x=~,z=~,y=~,r=1] animation.player.attack.positions _ 0 "'block：钻石块'; v.xpos=0; v.ypos=0; v.zpos=0; v.xbasepos=0; v.ybasepos=0; v.zbasepos=0; v.side_a=1; v.side_b=1; v.angle=90;


        v.ratio=math.pow(v.side_a/v.side_b,2); v.cos_angle=math.cos(v.angle); v.cos_angle_sq=v.cos_angle*v.cos_angle; v.coef_K=v.ratio*(v.cos_angle_sq-1); v.coef_B=2*v.cos_angle_sq*v.ratio+v.ratio*v.ratio+1; v.discriminant=math.sqrt(math.max(v.coef_B*v.coef_B-4*v.coef_K*v.coef_K,0)); v.sin_ex_sq=math.clamp(math.min((-v.coef_B+v.discriminant)/(2*v.coef_K),(-v.coef_B-v.discriminant)/(2*v.coef_K)),0,1); v.sin_ey_sq=math.clamp((v.ratio-v.sin_ex_sq)/((1-v.sin_ex_sq)*(1+v.ratio)),0,1); v.ey_sign=(v.cos_angle>=0)?1:-1; v.extend_scale=0; v.extend_xrot=-math.asin(math.sqrt(v.sin_ex_sq)); v.extend_yrot=math.asin(math.sqrt(v.sin_ey_sq))*v.ey_sign; v.scale=v.side_a/math.sqrt(v.sin_ey_sq+(1-v.sin_ey_sq)*v.sin_ex_sq); v.cos_ex=math.cos(v.extend_xrot); v.sin_ex=math.sin(v.extend_xrot); v.cos_ey=math.cos(v.extend_yrot); v.sin_ey=math.sin(v.extend_yrot); v.edge1_x=v.cos_ey*v.cos_ey+v.sin_ex*v.sin_ex*v.sin_ey*v.sin_ey; v.edge1_y=-v.sin_ex*v.cos_ex*v.sin_ey; v.edge1_z=v.sin_ey*v.cos_ey*v.cos_ex*v.cos_ex; v.edge1_len=math.sqrt(v.edge1_x*v.edge1_x+v.edge1_y*v.edge1_y+v.edge1_z*v.edge1_z); v.edge1_hat_x=v.edge1_x/v.edge1_len; v.edge1_hat_y=v.edge1_y/v.edge1_len; v.edge1_hat_z=v.edge1_z/v.edge1_len; v.normal_x=-v.cos_ex*v.sin_ey; v.normal_y=-v.sin_ex; v.normal_z=v.cos_ex*v.cos_ey; v.tangent_x=v.normal_y*v.edge1_hat_z-v.normal_z*v.edge1_hat_y; v.tangent_y=v.normal_z*v.edge1_hat_x-v.normal_x*v.edge1_hat_z; v.tangent_z=v.normal_x*v.edge1_hat_y-v.normal_y*v.edge1_hat_x; v.xrot=math.asin(math.clamp(-v.normal_z,-1,1)); v.yrot=math.atan2(-v.tangent_z,v.edge1_hat_z); v.zrot=math.atan2(-v.normal_x,v.normal_y);'方块编号：Cube'; "`
    },
    {

        description: "旗帜杆 根部为旋转中心",
        command: `execute  positioned ~-1~~ run playanimation @e[x=~,z=~,y=~,r=1] animation.player.attack.positions _ 0 "'方块类型：旗帜'; v.xpos=0; v.ypos=0; v.zpos=0; v.xrot=3; v.yrot=0; v.zrot=180; v.scale=1; v.extend_scale=1; v.extend_xrot=-90; v.extend_yrot=0; v.xbasepos=-0.178575; v.ybasepos=-0.33571425; v.zbasepos=-0.5464285; '方块编号：Flag'; "旗帜`
    },
    {

        description: "旗帜：任意平行四边形（旗面 a×b 夹角 θ）",
        command: `execute  positioned ~-1~~ run playanimation @e[x=~,z=~,y=~,dx=1,dy=0,dz=0] animation.player.attack.positions _ 0 "'方块类型：旗帜'; v.xpos=0; v.ypos=0; v.zpos=0; v.xbasepos=-0.178621; v.ybasepos=-0.146515; v.zbasepos=0.658218; v.side_b=1; v.side_a=1; v.angle=90; v.fit_a=math.max(math.abs(v.side_b),0.01); v.fit_b=math.max(math.abs(v.side_a),0.01); v.sin_th=math.sin(v.angle-180); v.cos_th=math.cos(v.angle-180); v.Q1=v.fit_a*v.fit_a; v.Q2=v.fit_b*v.fit_b/4; v.QS=v.Q1+v.Q2; v.QK=v.Q1*v.Q2*v.sin_th*v.sin_th; v.Qd=math.sqrt(math.max(v.QS*v.QS-4*v.QK,0)); v.X2=(v.QS+v.Qd)/2; v.scale=math.sqrt(math.max(v.X2,0.0001)); v.es_v=math.sqrt(math.max(v.QK,0))/math.max(v.X2,0.0001); v.extend_scale=math.max(v.es_v,0.0001); v.extend_xrot=0; v.den2=v.QS/v.X2-2; v.sin_ey_sq=0; v.sin_ey_sq=(math.abs(v.den2)<0.0001)?0:math.clamp((v.Q1/v.X2-1)/v.den2,0,1); v.ey_sign=(v.cos_th/(1-v.es_v*v.es_v)>=0)?1:-1; v.extend_yrot=math.asin(math.sqrt(math.max(v.sin_ey_sq,0)))*v.ey_sign; v.sin_ey=math.sin(v.extend_yrot); v.cos_ey=math.cos(v.extend_yrot); v.nx=0.039223*(1-v.es_v)*v.sin_ey*v.cos_ey; v.nz=-0.039223*(v.cos_ey*v.cos_ey+v.es_v*v.sin_ey*v.sin_ey); v.nl=math.sqrt(v.nx*v.nx+1+v.nz*v.nz); v.nx=v.nx/v.nl; v.nz=v.nz/v.nl; v.xrot=math.asin(math.clamp(-v.nz,-1,1)); v.yrot=math.atan2(v.nz,v.nx); v.zrot=math.atan2(-v.nx,-1/v.nl);'方块编号：Flag'; "  `
    },
    {
        description: "x/z 横向拉伸预设-ey=0/90",
        command: `execute  positioned ~-1~~ run playanimation @e[x=~,z=~,y=~,r=1] animation.player.attack.positions _ 0 "'block：绿宝石块'; v.xpos=0; v.ypos=0; v.zpos=0; v.xrot=0; v.yrot=0; v.zrot=0; v.extend_xrot=0; v.extend_yrot=180; v.xbasepos=0; v.ybasepos=0; v.zbasepos=0; v.h=7.74; v.m=3.41; v.extend_scale=v.m/v.h; v.scale=v.m/v.extend_scale;'方块编号：Cube'; "`
    }
    
    // 添加新预设只需在此数组中增加对象即可
];

// 显示预设选择菜单
function showPresetMenu() {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal';
    modalDiv.style.zIndex = '1002';
    
    let itemsHtml = '';
    for (let i = 0; i < presetTemplates.length; i++) {
        const preset = presetTemplates[i];
        itemsHtml += `
            <div class="preset-item" data-index="${i}" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #334155;">
                <div style="font-size: 14px;">${escapeHtml(preset.description)}</div>
                <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">双击导入</div>
            </div>
        `;
    }
    
    modalDiv.innerHTML = `
        <div class="modal-content" style="max-width: 400px; padding: 16px 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <span style="font-size: 18px; font-weight: bold;">选中并创建预设</span>
                <button id="closePresetMenuBtn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: inherit;">✕</button>
            </div>
            <div id="presetList" style="max-height: 400px; overflow-y: auto;">
                ${itemsHtml}
            </div>
        </div>
    `;
    document.body.appendChild(modalDiv);
    
    const closeModal = () => modalDiv.remove();
    modalDiv.querySelector('#closePresetMenuBtn').onclick = closeModal;
    
    const presetItems = modalDiv.querySelectorAll('.preset-item');
    presetItems.forEach(item => {
        item.addEventListener('dblclick', (e) => {
            const idx = parseInt(item.dataset.index);
            const preset = presetTemplates[idx];
            if (preset && preset.command) {
                importFromCommands(preset.command);  // 使用已有的导入函数
                closeModal();
            }
        });
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = '#3b82f6';
            item.style.color = '#0f172a';
        });
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = '';
            item.style.color = '';
        });
    });
}

// 「隐藏方块名」的唯一咽喉：同时刷新场景标签 + 旧布局按钮文案 + 新布局视图菜单文案。
// 启动恢复（restoreViewFlags）与点击切换共用它，避免两处实现各写一份而漂移。
function syncHideNamesUI() {
    bumpDrawRev('ui');   // 标签显隐变了，大场景下需补一帧
    blocks.forEach(b => { if (b.label) {
        const shouldShow = !hideNames && !isBlockInHiddenGroup(b);
        b.label.visible = shouldShow;
        if (b.label.element) {
            if (shouldShow) {
                b.label.element.style.removeProperty('display');
            } else {
                b.label.element.style.setProperty('display', 'none', 'important');
            }
        }
    } });
    const _hnBtn = document.getElementById('hideNameBtn');
    if (_hnBtn) { const _sp = _hnBtn.querySelector('span'); if (_sp) _sp.textContent = hideNames ? '显示' : '隐藏'; }
    // 更新新布局视图菜单项
    const viewHideItem = document.querySelector('#viewDropdown .top-dropdown-item[data-view-action="hideNames"] span');
    if (viewHideItem) viewHideItem.textContent = hideNames ? '显示' : '隐藏';
}
document.getElementById('hideNameBtn').addEventListener('click', () => {
    hideNames = !hideNames;
    syncHideNamesUI();
    saveViewFlags();   // 全局保留：立即落 localStorage（跨刷新 / 重启 APP / 切项目）
});
function safeUndo() {
    // 优先调用原生接口（仅 APK 中有效）
    if (window.Android && typeof window.Android.undo === 'function') {
        window.Android.undo();
        return;
    }
    // 否则使用 JS 实现（网站环境）
    undo();
}

function safeRedo() {
    if (window.Android && typeof window.Android.redo === 'function') {
        window.Android.redo();
        return;
    }
    redo();
}

document.getElementById('resetViewBtn').addEventListener('click', () => {
    // 统一走 resetCameraHome：按当前视场角折算距离，正交视图中重置后取景与默认视角一致
    resetCameraHome();
});
// 把 title 拆成「版本号」+「剩余说明」两段
// 蓝色胶囊里只放 title 开头的版本号，**原样显示、不做任何归一化**（点几个点由数据说了算）；
// 剩余文字只有在「没有版本号的条目」上才显示（有胶囊的条目不再旁边挂灰字）。
function splitChangelogTitle(title) {
    const t = (title || '').trim();
    if (!t) return { pill: '', label: '' };
    const m = t.match(/^v\s*[.\-]?\s*[\d]+(?:\s*[.\-]\s*[\d]+)*\.?/i);
    if (!m) return { pill: '', label: t };
    const pill = m[0].replace(/[\s\-]+/g, '').replace(/\.$/, '');
    return { pill, label: '' };
}

