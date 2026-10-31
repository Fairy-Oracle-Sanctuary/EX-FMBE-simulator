/* 07-scene/04-marker-light-and-loop.js · 源 测试版v.6b79.html 第 36921-38538 行 */
'use strict';
/* ★绿点在「生成方块」模式下【支持选中】，而不是在「描点」模式下把新点吸过去。
   ★★只进出选区（ptVertexSelection），【绝不生成点】—— 用户明确要求：点绿点不要描点。
   点一次 = 选中该角点（绿点亮白），再点一次 = 取消；选够 need 个（可与「点」混选）即自动生成。 */
function brushToggleVertexSelect(group) {
    const c = group.userData.position;
    if (!c) return;
    ptToggleVertexSelect(c.x, c.z);
}

function handleBrushClick(event) {
    if (!isBrushMode) return;

    // 准备射线（用于拾取已有点标记）
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const pickMarker = () => {
        const meshes = ptMarkers.filter(p => p.mesh && p.mesh.visible).map(p => p.mesh);
        const hits = meshes.length ? raycaster.intersectObjects(meshes, false) : [];
        if (!hits.length) return null;
        return ptMarkers.find(p => p.mesh === hits[0].object) || null;
    };

    // ============ 描点（在网格上放点） ============
    if (ptBrushMode === 'draw') {
        // 排除摄像机平移 / 旋转：拖动超过阈值（_canvasDragMoved）视为转视角，绝不放点
        if (_canvasDragMoved) return;
        // 先命中已有点标记 → 切换选中（便于随后删除），否则在网格上落新点
        const hp = pickMarker();
        if (hp) { ptToggleSelect(hp.id); return; }
        // ★描点模式【不做角点吸附】：绿点只是参考，点必须落在鼠标真正指到的地面位置。
        //   旧实现走 getBrushHitPoint，命中绿点就返回角点坐标 → 新点被「吸」到角上。
        const gp = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(_ptGroundPlane, gp)) return;
        ptAddPoint(gp.x, gp.z, ptDrawColor, false);
        return;
    }

    // ============ 生成方块（点选已有点 → 自动生成） ============
    if (ptBrushMode === 'build') {
        // ★矩形「左右两侧」预览期间：这一次点击就是「选方向」，不再走选点逻辑
        if (ptRectPreview) {
            const side = ptPickRectSidePreview();
            if (side) { ptGenerateRectSide(side); return; }
            showToast('↔️ 请点其中一个预览：红 = A→B 作右边，绿 = A→B 作左边（或点「取消选择」退出）');
            return;
        }
        const hp = pickMarker();
        if (hp) { ptToggleSelect(hp.id); return; }   // 点选 / 取消选点
        // ★绿点（选中方块的角点）可点选：只进出选区，不放点
        const hv = brushPickVertexMarker();
        if (hv) { brushToggleVertexSelect(hv); return; }
        // 未命中点/绿点：允许选中已有平面/方块（并显示其角点标记，便于用角点继续造形）
        const hb = ptPickBlockAt();
        if (hb) { selectBlock(hb); setBrushSelectedBlock(hb); return; }
        return;
    }
}

// 画笔模式：按当前 raycaster 拾取一个方块（供「生成方块」模式选中平面用）
function ptPickBlockAt() {
    const meshes = [];
    for (const b of blocks) {
        if (!b.mesh || (typeof isBlockInHiddenGroup === 'function' && isBlockInHiddenGroup(b))) continue;
        const ms = (typeof b.getMeshes === 'function') ? b.getMeshes() : [b.mesh];
        for (const m of ms) { m.updateMatrixWorld(true); meshes.push(m); }
    }
    if (!meshes.length) return null;
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    return blocks.find(b => {
        const ms = (typeof b.getMeshes === 'function') ? b.getMeshes() : [b.mesh];
        return ms.includes(hits[0].object);
    }) || null;
}

function updateBrushPreview() {
    if (!isBrushMode || !brushPoint1) {
        hideBrushLine();
        return;
    }
    
    if (!brushLine) {
        brushLineGeo = new THREE.BufferGeometry();
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 3 });
        brushLine = new THREE.Line(brushLineGeo, lineMaterial);
        scene.add(brushLine);
    }
    
    const endPoint = brushPoint2 || brushPreviewPoint || brushPoint1;
    brushLineGeo.setFromPoints([brushPoint1, endPoint]);
    brushLineGeo.attributes.position.needsUpdate = true;
    
    if (brushPoint2) {
        if (brushClickMode === 'vertex') {
            if (brushPreviewPlaneCenter) {
                scene.remove(brushPreviewPlaneCenter);
                brushPreviewPlaneCenter.geometry.dispose();
                brushPreviewPlaneCenter.material.dispose();
                brushPreviewPlaneCenter = null;
            }
            updateBrushPlanePreviewVertexMode();
        } else {
            if (brushPreviewPlaneLeft) {
                scene.remove(brushPreviewPlaneLeft);
                brushPreviewPlaneLeft.geometry.dispose();
                brushPreviewPlaneLeft.material.dispose();
                brushPreviewPlaneLeft = null;
            }
            if (brushPreviewPlaneRight) {
                scene.remove(brushPreviewPlaneRight);
                brushPreviewPlaneRight.geometry.dispose();
                brushPreviewPlaneRight.material.dispose();
                brushPreviewPlaneRight = null;
            }
            updateBrushPlanePreviewPlaneMode();
        }
    }
}

function updateBrushPlanePreviewPlaneMode() {
    const dir = new THREE.Vector3().subVectors(brushPoint2, brushPoint1);
    const length = dir.length();
    if (length < 0.01) return;
    
    const width = brushThickness;
    const center = new THREE.Vector3().addVectors(brushPoint1, brushPoint2).multiplyScalar(0.5);
    
    if (!brushPreviewPlaneCenter) {
        const planeGeo = new THREE.PlaneGeometry(length, width);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x3b82f6, 
            transparent: true, 
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        brushPreviewPlaneCenter = new THREE.Mesh(planeGeo, material);
        scene.add(brushPreviewPlaneCenter);
    } else {
        brushPreviewPlaneCenter.geometry.dispose();
        brushPreviewPlaneCenter.geometry = new THREE.PlaneGeometry(length, width);
    }
    
    brushPreviewPlaneCenter.position.copy(center);
    brushPreviewPlaneCenter.lookAt(center.clone().add(dir));
    brushPreviewPlaneCenter.rotateX(Math.PI / 2);
}

function updateBrushPlanePreviewVertexMode() {
    const dir = new THREE.Vector3().subVectors(brushPoint2, brushPoint1);
    const length = dir.length();
    if (length < 0.01) return;
    
    const width = brushThickness;
    const angle = Math.atan2(dir.z, dir.x);
    const perpDir = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    
    const baseCenter = new THREE.Vector3()
        .copy(brushPoint1)
        .add(dir.clone().multiplyScalar(0.5));
    
    const leftCenter = baseCenter.clone().add(perpDir.clone().multiplyScalar(-width / 2));
    const rightCenter = baseCenter.clone().add(perpDir.clone().multiplyScalar(width / 2));
    
    if (!brushPreviewPlaneLeft) {
        const planeGeo = new THREE.PlaneGeometry(length, width);
        planeGeo.rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xff6666, 
            transparent: true, 
            opacity: 0.25,
            side: THREE.DoubleSide
        });
        brushPreviewPlaneLeft = new THREE.Mesh(planeGeo, material);
        scene.add(brushPreviewPlaneLeft);
    } else {
        brushPreviewPlaneLeft.geometry.dispose();
        const planeGeo = new THREE.PlaneGeometry(length, width);
        planeGeo.rotateX(-Math.PI / 2);
        brushPreviewPlaneLeft.geometry = planeGeo;
    }
    
    if (!brushPreviewPlaneRight) {
        const planeGeo = new THREE.PlaneGeometry(length, width);
        planeGeo.rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x66ff66, 
            transparent: true, 
            opacity: 0.25,
            side: THREE.DoubleSide
        });
        brushPreviewPlaneRight = new THREE.Mesh(planeGeo, material);
        scene.add(brushPreviewPlaneRight);
    } else {
        brushPreviewPlaneRight.geometry.dispose();
        const planeGeo = new THREE.PlaneGeometry(length, width);
        planeGeo.rotateX(-Math.PI / 2);
        brushPreviewPlaneRight.geometry = planeGeo;
    }
    
    brushPreviewPlaneLeft.position.copy(leftCenter);
    brushPreviewPlaneLeft.rotation.y = -angle;
    
    brushPreviewPlaneRight.position.copy(rightCenter);
    brushPreviewPlaneRight.rotation.y = -angle;
}

function createBrushPlane() {
    const dir = new THREE.Vector3().subVectors(brushPoint2, brushPoint1);
    const length = dir.length();
    
    if (length < 0.01) {
        showToast('❌ 线段太短，请重新选择');
        return;
    }
    
    const width = brushThickness;
    const center = new THREE.Vector3().addVectors(brushPoint1, brushPoint2).multiplyScalar(0.5);
    const angle = Math.atan2(dir.z, dir.x) * 180 / Math.PI;
    const p = generateRectParams(length, width);
    
    let blockId = 'Plane', _pi = 1;
    while (blocks.some(b => b.id === blockId)) blockId = 'Plane' + (_pi++);
    // 画笔平面恒为矩形（宽 = 笔刷厚度）。generateRectParams 返回的 yrot 恒为 0，
    // 平面朝向由 xrot/zrot 表达，线段方向 heading 直接放入 M[4]（yrot）即可。
    const M = [
        center.x, 0, center.z,
        p.xrot, angle, p.zrot,
        p.scale, p.extend_scale,
        p.extend_xrot, p.extend_yrot,
        0, 0, 0
    ];

    addBlock(new Block(blockId, M, null, '#aaccff', 'cube', null, null, true));
}

function createBrushPlaneWithCorner() {
    const dir = new THREE.Vector3().subVectors(brushPoint2, brushPoint1);
    const length = dir.length();
    
    if (length < 0.01) {
        showToast('❌ 线段太短，请重新选择');
        return;
    }
    
    const width = brushThickness;
    const perpDir = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    
    const vec12 = dir.clone();
    const vec13 = new THREE.Vector3().subVectors(brushPoint3, brushPoint1);
    const crossProduct = vec12.x * vec13.z - vec12.z * vec13.x;
    const side = crossProduct > 0 ? 1 : -1;
    
    const center = new THREE.Vector3()
        .copy(brushPoint1)
        .add(dir.multiplyScalar(0.5))
        .add(perpDir.multiplyScalar(width / 2 * side));
    
    const angle = Math.atan2(dir.z, dir.x) * 180 / Math.PI;
    const p = generateRectParams(length, width);
    
    let blockId = 'Plane', _pi = 1;
    while (blocks.some(b => b.id === blockId)) blockId = 'Plane' + (_pi++);
    // 画笔平面恒为矩形（宽 = 笔刷厚度）。generateRectParams 返回的 yrot 恒为 0，
    // 平面朝向由 xrot/zrot 表达，线段方向 heading 直接放入 M[4]（yrot）即可。
    const M = [
        center.x, 0, center.z,
        p.xrot, angle, p.zrot,
        p.scale, p.extend_scale,
        p.extend_xrot, p.extend_yrot,
        0, 0, 0
    ];

    addBlock(new Block(blockId, M, null, '#aaccff', 'cube', null, null, true));
}

// 动画循环
// ★ 上一帧的动画时钟快照：用于判断 keyframeCurrentTime 是否真的推进了。
//   q.anim_time 驱动的 molang 块「只在时钟变化 / 播放中」才需要重算 —— 暂停且时钟不变时重算是纯浪费。
let _lastMolangAnimTime = null;
/* ★【2026-10-24 性能】「隐藏 / 锁定」状态版本号：渲染循环据此只在状态变化时做全量同步，
   而不是每帧扫描全部方块。所有会改动 hidden / locked / 文件夹 hidden / 方块的 group 的入口
   都应调用 bumpVisibilityRev()；渲染循环另有 500ms 兜底，漏加也只是延迟收敛。 */
let _visRev = 0, _visSyncRev = -1, _visSyncLen = -1, _visSyncTs = 0;
function bumpVisibilityRev() { _visRev++; bumpDrawRev('ui'); }

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // 相机视角变化后，刷新直接使用了 q.（如 q.rotation_to_camera）的方块，使相机相关表达式实时生效
    if (_cameraExprDirty) {
        _cameraExprDirty = false;
        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            let usesCam = false;
            if (b.scope.program && b.scope.program.indexOf('q.') !== -1) usesCam = true;
            else { for (let [, d] of b.scope.vars) { if (d.expr && d.expr.indexOf('q.') !== -1) { usesCam = true; break; } } }
            if (usesCam) b.refresh();
        }
    }

    // 自发式随机函数（math.random / math.die_roll 系列）每帧重算，使其像查询函数一样持续变化；
    // 否则程序只在编辑/初始化时执行一次，zrot 等随机变量会一直保持最初那个值。
    // ★ 性能铁律（2026-10-02 修复结构导入后巨卡）：molang 接管块【只有“动画正在推进”或“含自发随机”时
    //   才每帧重算】。纯依赖 q.anim_time 的块在暂停态下 keyframeCurrentTime 不变，每帧重算结果恒等，
    //   白白把 78 个（乃至上千个）程序从头 tokenize+重解析+建闭包树，直接拖垮帧率；
    //   依赖相机(q.rotation_to_camera)的块由上方 _cameraExprDirty 分支在相机移动时刷新，也无需每帧跑。
    //   结构导出的模型每个方块都带 q.anim_time 动画表达式 → 全部沦为 molang 块 → 暂停态仍被每帧重算 → 巨卡。
    // ★★ 判据（必须同时满足「不卡」与「拖播放头照常生效」两件事）：
    //   · 含 q.anim_time 的块 → 仅在「时钟变化(_timeChanged) / 播放中(keyframePlaying)」时重算。
    //     暂停且时钟不变时结果恒等 ⇒ 不重算（这就是去掉巨卡的关键）；
    //     一旦拖动播放头/seek 改了 keyframeCurrentTime ⇒ _timeChanged 为真 ⇒ 立即重算（scrub 依然生效）。
    //   · 不含 q.anim_time 的程序（如 v.t=v.t+1 逐帧累加）→ 维持旧行为每帧重算，不做行为变更。
    //   · 含自发随机 → 每帧重算。
    // ★ TDZ 守卫：animate() 在模块初始化早期就会被调用，此时 keyframeCurrentTime / keyframePlaying
    //   可能尚未执行到 let 声明处（TDZ —— 注意 typeof 对 TDZ 变量同样会抛 ReferenceError）。
    //   那种时刻 blocks 必为空，本来也不需要重算，try/catch 兜住即可。
    let _molangTime = (_lastMolangAnimTime || 0), _playing = false;
    try { _molangTime = keyframeCurrentTime || 0; _playing = keyframePlaying; } catch (e) { /* 初始化早期，忽略 */ }
    const _timeChanged = _molangTime !== _lastMolangAnimTime;
    _lastMolangAnimTime = _molangTime;
    // q.life_time 自增时钟：受「查询函数更新」总开关与重置冻结控制。
    // 处于冻结（重置倒计时）或总开关关闭时停止累加；解冻/开启后从当前基准继续，避免瞬间跳变。
    {
        const _ltNow = performance.now();
        if (_queryUpdateEnabled && !_lifeTimeResetFreeze && _lifeTimeLast > 0) {
            _lifeTime += (_ltNow - _lifeTimeLast) / 1000;
        }
        _lifeTimeLast = _ltNow;
    }
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const sp = scopeUsesSpontaneous(b.scope);
        if (!b.scope.molangMode && !sp) continue;
        const _prog = b.scope.program || '';
        // 含 q.life_time 的方块需每帧重算（否则暂停态下不会自增显示）
        const usesLifeTime = _prog.includes('q.life_time');
        const needsPerFrame = sp || usesLifeTime || !_prog.includes('q.anim_time') || _playing || _timeChanged;
        if (needsPerFrame) {
            b.refresh();
            if (b === selectedBlock) updateMolangValueDisplay(b); // 让只读数值面板里的 zrot 等实时跳动
        }
        // molang 编辑模式下：选中块的「逻辑分支运行态」着色随动画时间实时跟随
        // （区间签名未变时内部直接返回，零 DOM 开销，见 updateMolangBranchColors）
        if (b === selectedBlock && b.scope.molangMode) {
            try { updateMolangBranchColors(b); } catch (e) { }
        }
    }

    // ---------- MC 式固定太阳光：从斜上方固定照射，不再跟随摄像机 ----------
    // 太阳方向已在初始化时固定为 (-12, 18, 8) -> (0, 0, 0)，保持与游戏内一致

    // 自适应画质：方块数跨过阈值时自动关/开阴影与半分辨率渲染（O(1) 检查）
    updateSceneQuality();
    updateAxesByDistance();
    try { updateScreenRuler(); } catch(e) { /* ignore ruler error */ }
    try { if (typeof syncGizmo === 'function') syncGizmo(); } catch(e) { /* ignore gizmo sync error */ }
    /* ★【2026-10-25 修复 · 用户投诉「移动/转动摄像机后对称面自动消失」】
       镜像进行中，对称面实体与它的 Gizmo 必须一直挂在场景里：
       相机移动、选区重绘、工具栏刷新等任何路径都不该把它们弄丢。
       这里做兜底自愈 —— 面丢了就重建，Gizmo 被隐藏就补一次刷新（只在异常时触发，正常帧零开销）。 */
    if (mirrorActive) {
        if (mirrorVtxPicking) {
            // 三点定面：候选顶点跟随方块实时姿态（播放/骨骼跟随改动 matrixWorld）
            mirrorVtxAutoRefresh();
        } else if (!mirrorFacePicking) {
            if (!mirrorRoot || !mirrorRoot.parent) mirrorCreatePlane();
            if (!gizmoRoot.visible) requestGizmoRefresh();
            // 侧看可见性：薄板表观厚度随相机距离更新（相机一动就重算，保证永远 >= 12px 宽）
            mirrorUpdateEdgeThickness();
        }
    }
    // ★【2026-10-24 性能】按「近端预算」更新标签：几千方块时不再每帧投影/写样式几千个元素
    updateAllBlockLabels(performance.now());

    // 同步组的隐藏状态到方块可见性（在 updateBlockLabel 之后，确保不被覆盖）
    /* ★【2026-10-24 性能】这段原本**每帧**遍历全部方块、逐个写 mesh.visible 与标签 display。
       隐藏/锁定只可能在用户操作时变化，逐帧重算纯属浪费（几千方块时是明确的帧时间）。
       改为「版本号 + 长度变化 + 500ms 兜底」触发：正常操作立刻生效，兜底保证任何遗漏路径最迟半秒收敛。 */
    const _visNow = performance.now();
    if (_visRev !== _visSyncRev || _visSyncLen !== blocks.length || _visNow - _visSyncTs > 500) {
    _visSyncRev = _visRev; _visSyncLen = blocks.length; _visSyncTs = _visNow;
    blocks.forEach(block => {
        const hidden = isBlockInHiddenGroup(block);
        if (block.mesh) block.mesh.visible = !hidden;
        if (block.label) {
            const shouldShow = !hideNames && !hidden;
            block.label.visible = shouldShow;
            if (block.label.element) {
                if (shouldShow) {
                    block.label.element.style.removeProperty('display');
                } else {
                    block.label.element.style.setProperty('display', 'none', 'important');
                }
            }
        }
        // 只对隐藏组的方块隐藏线框，非隐藏方块的线框由选中状态决定
        if (hidden && block.selectionWireframe) block.selectionWireframe.visible = false;
        // 隐藏时取消选中
        if (hidden && selectedBlocksSet.has(block)) {
            selectedBlocksSet.delete(block);
            if (selectedBlock === block) selectedBlock = null;
        }
        // ★2026-10-04：锁定方块禁止选中（但仍显示）——所有选中路径的统一兜底：
        //   无论哪个入口（框选 / 全选 / 文件夹全选 / 脚本）把锁定块塞进选区，都在此立刻剔除。
        if (block.locked && selectedBlocksSet.has(block)) {
            selectedBlocksSet.delete(block);
            if (selectedBlock === block) selectedBlock = null;
        }
    });
    }   // 结束「可见性/锁定同步」的按需执行

    for (let block of selectedBlocksSet) {
        if (block.selectionWireframe && block.selectionWireframe.visible) {
            // 单cube模型用mesh.matrixWorld，多cube模型用rootGroup.matrixWorld
            const sourceMatrix = (block.meshes.length > 1)
                ? (block.rootGroup && block.rootGroup.matrixWorld)
                : (block.mesh && block.mesh.matrixWorld);
            if (sourceMatrix) {
                block.selectionWireframe.matrix.copy(sourceMatrix);
                block.selectionWireframe.matrixWorldNeedsUpdate = true;
            }
        }
    }
    
    updateBrushPreview();
    try { if (typeof ptUpdateMarkerSizes === 'function') ptUpdateMarkerSizes(); } catch (e) {}
    // 绿点（选中方块的角点标记）同「点」一样每帧按相机距离重算尺寸 → 屏幕大小恒定
    try { if (typeof updateBrushVertexMarkerSizes === 'function') updateBrushVertexMarkerSizes(); } catch (e) {}
    // 顶点捕捉：候选顶点跟随方块实时姿态（关键帧播放 / 拖播放头 / 骨骼跟随）
    try { if (typeof vtxSnapAutoRefresh === 'function') vtxSnapAutoRefresh(); } catch (e) {}
    // 测量（测长 / 测角）：顶点锚定 → 连线 / 数量文字 / 删除 × 每帧跟随方块与相机
    try { if (typeof measureUpdate === 'function') measureUpdate(); } catch (e) {}
    /* 顶点捕捉的目标方块不在选区里，它的紫色线框得单独跟随（否则会停在指定那一刻的位置） */
    try {
        if (typeof vtxSnapPhase !== 'undefined' && vtxSnapPhase && vtxSnapTargetBlockId) {
            const tb = blocks.find(x => x.id === vtxSnapTargetBlockId);
            const wf = tb && tb.selectionWireframe;
            if (wf && wf.visible) {
                const sm = (tb.meshes.length > 1) ? (tb.rootGroup && tb.rootGroup.matrixWorld) : (tb.mesh && tb.mesh.matrixWorld);
                if (sm) { wf.matrix.copy(sm); wf.matrixWorldNeedsUpdate = true; }
            }
        }
    } catch (e) {}

    /* ★【2026-10-24 性能】大场景渲染调度（定义见 3D 场景初始化处的 _drawRev）：
       2940 块实测：每帧时间几乎全在 renderer.render（数千次 draw call + 逐对象状态检查），
       我们自己的每帧逻辑（molang / 标签 / 可见性）合计只有 ~17ms。因此：
         ① 静止不画：cam/mat/ui 三个版本号都没变就不提交渲染（1s 兜底一次），空闲 CPU 归零；
         ② 按耗时跳帧：上次渲染 >33ms / >80ms 时分别每 2 / 3 帧才真画一次，
            空出来的帧交给浏览器处理点击与拖拽 → 几千块时 UI 不再「卡炸」。
       画笔模式要实时预览，不参与调度（逐帧画）。 */
    const _bigScene = blocks.length > LARGE_SCENE_BLOCKS;
    let _snapActive = false;
    try { _snapActive = !!vtxSnapPhase; } catch (e) { /* 初始化早期变量尚未就绪 */ }
    let _needDraw = true;
    if (_bigScene && !isBrushMode && !_snapActive) {
        /* 相机「真的动了」才重画：OrbitControls 的 change 事件在阻尼微动时会连续触发，
           按事件判脏会让静止画面一直重画；这里直接比较位姿（位移 <1e-3、朝向差 <1e-4 视为没动）。 */
        let _camStill = false;
        if (_schedCamPos) {
            _camStill = camera.position.distanceToSquared(_schedCamPos) < 1e-6
                    && Math.abs(camera.quaternion.dot(_schedCamQuat)) > 0.999999
                    && camera.zoom === _schedCamZoom;
        }
        const _still = (_camStill && _drawRev.mat === _drawnRev.mat && _drawRev.ui === _drawnRev.ui
                        && performance.now() - _lastDrawTs < 1000);
        if (_still) _needDraw = false;
        else {
            const _skip = _renderCostMs > 80 ? 3 : (_renderCostMs > 33 ? 2 : 1);
            if (_skip > 1 && (_frameTick % _skip) !== 0) _needDraw = false;
        }
    }
    _frameTick++;
    if (_needDraw) {
        const _rt0 = performance.now();
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
        _renderCostMs = performance.now() - _rt0;
        _lastDrawTs = performance.now();
        if (!_schedCamPos) { _schedCamPos = camera.position.clone(); _schedCamQuat = camera.quaternion.clone(); }
        _schedCamPos.copy(camera.position); _schedCamQuat.copy(camera.quaternion); _schedCamZoom = camera.zoom;
        _drawnRev.cam = _drawRev.cam; _drawnRev.mat = _drawRev.mat; _drawnRev.ui = _drawRev.ui;
    }
}
animate();

// ============================================================
// 项目管理器
// ============================================================
const PROJECT_DB_NAME = 'ex_projects';
const PROJECT_DB_VERSION = 1;
const PROJECT_STORE_NAME = 'projects';
const PROJECT_LIST_KEY = 'ex_project_list_v1';
let projectDB = null;
let currentProjectId = null;
let currentProjectName = '';
let currentProjectSavedAt = 0;
let currentProjectIsTemp = false;   // 外部导入临时项目：默认不落库，用户手动「保存项目」后才转为正式项目
let autoSaveTimer = null;
// 项目库不可用的原因（'blocked' | 'timeout'）：用于在列表页给出「重试」提示
let _projectDBUnavailable = null;
const projectManagerEl = document.getElementById('projectManager');
const pmThemeBtn = document.getElementById('pmThemeBtn');

function openProjectDB() {
    return new Promise((resolve, reject) => {
        if (projectDB) { resolve(projectDB); return; }
        if (!window.indexedDB) { resolve(null); return; }
        const req = indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { projectDB = req.result; resolve(projectDB); };
        /* ★【2026-10-24】onblocked：别的标签页还占着旧连接时，open 会永远挂着不触发任何事件
           （旧代码于是永远停在空白项目列表、连新建入口都没有）。这里立即返回 null，
           让上层走 localStorage 兜底并给出重试提示。 */
        req.onblocked = () => { _projectDBUnavailable = 'blocked'; resolve(null); };
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
                db.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function getProjectCreatedAt(id) {
    try {
        const db = await openProjectDB();
        if (db) {
            const existing = await new Promise((resolve) => {
                const tx = db.transaction(PROJECT_STORE_NAME, 'readonly');
                const store = tx.objectStore(PROJECT_STORE_NAME);
                const getReq = store.get(id);
                getReq.onsuccess = () => resolve(getReq.result);
                getReq.onerror = () => resolve(null);
            });
            if (existing && existing.createdAt) return existing.createdAt;
        }
    } catch (e) { /* ignore */ }
    try {
        const list = JSON.parse(localStorage.getItem(PROJECT_LIST_KEY) || '[]');
        const meta = list.find(p => p.id === id);
        if (meta && meta.createdAt) return meta.createdAt;
    } catch (e) { /* ignore */ }
    return 0;
}

async function saveProjectToDB(project) {
    project.updatedAt = Date.now();
    // 保留创建时间：自动保存传入的 project 是新对象、createdAt 为 0，需回读已有记录补回，
    // 否则每次自动保存都会把 createdAt 抹成 0（元数据失真）。
    if (!project.createdAt) project.createdAt = await getProjectCreatedAt(project.id);
    // 1) IndexedDB
    try {
        const db = await openProjectDB();
        if (db) {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(PROJECT_STORE_NAME, 'readwrite');
                const store = tx.objectStore(PROJECT_STORE_NAME);
                const putReq = store.put(project);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = () => reject(putReq.error);
            });
        }
    } catch (e) { console.warn('IndexedDB save failed, fallback to localStorage', e); }
    // 2) localStorage fallback
    try {
        const list = JSON.parse(localStorage.getItem(PROJECT_LIST_KEY) || '[]');
        const idx = list.findIndex(p => p.id === project.id);
        const mini = { id: project.id, name: project.name, updatedAt: project.updatedAt, createdAt: project.createdAt, thumbnail: project.thumbnail };
        if (idx >= 0) list[idx] = mini; else list.push(mini);
        localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(list));
        localStorage.setItem('ex_project_state_' + project.id, JSON.stringify({ state: project.state, thumbnail: project.thumbnail, updatedAt: project.updatedAt }));
        return true;
    } catch (e) {
        console.error('Project save failed', e);
        return false;
    }
}

async function loadProjectFromDB(id) {
    try {
        const db = await openProjectDB();
        if (db) {
            const result = await new Promise((resolve, reject) => {
                const tx = db.transaction(PROJECT_STORE_NAME, 'readonly');
                const store = tx.objectStore(PROJECT_STORE_NAME);
                const getReq = store.get(id);
                getReq.onsuccess = () => resolve(getReq.result);
                getReq.onerror = () => reject(getReq.error);
            });
            if (result) return result;
        }
    } catch (e) { console.warn('IndexedDB load failed', e); }
    // localStorage fallback
    try {
        const list = JSON.parse(localStorage.getItem(PROJECT_LIST_KEY) || '[]');
        const meta = list.find(p => p.id === id);
        const saved = JSON.parse(localStorage.getItem('ex_project_state_' + id) || 'null');
        if (saved) {
            return { id, name: meta ? meta.name : id, state: saved.state, thumbnail: saved.thumbnail, updatedAt: saved.updatedAt, createdAt: meta ? meta.createdAt : saved.updatedAt };
        }
    } catch (e) { console.error('Project load failed', e); }
    return null;
}

async function deleteProjectFromDB(id) {
    try {
        const db = await openProjectDB();
        if (db) {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(PROJECT_STORE_NAME, 'readwrite');
                const store = tx.objectStore(PROJECT_STORE_NAME);
                const delReq = store.delete(id);
                delReq.onsuccess = () => resolve(true);
                delReq.onerror = () => reject(delReq.error);
            });
        }
    } catch (e) { console.warn('IndexedDB delete failed', e); }
    try {
        const list = JSON.parse(localStorage.getItem(PROJECT_LIST_KEY) || '[]');
        const idx = list.findIndex(p => p.id === id);
        if (idx >= 0) { list.splice(idx, 1); localStorage.setItem(PROJECT_LIST_KEY, JSON.stringify(list)); }
        localStorage.removeItem('ex_project_state_' + id);
    } catch (e) { console.error('Project delete failed', e); }
}

async function listProjectsFromDB() {
    const projects = [];
    try {
        /* ★【2026-10-24】读库加超时：项目里若有几千方块的超大记录，openCursor 长时间不返回时
           旧代码会让列表永远空白（用户看到「所有项目都不显示、也没有新建入口」）。
           ★ 同时只保留元数据：整条记录里的 state 是几 MB~几十 MB 的 JSON，列表页根本用不到，
           旧实现把整条读进内存数组 → 项目一多就慢到像「全部消失」。 */
        const db = await Promise.race([openProjectDB(), new Promise(r => setTimeout(() => r(null), 3000))]);
        if (!db) { if (!_projectDBUnavailable) _projectDBUnavailable = 'timeout'; }
        if (db) {
            _projectDBUnavailable = null;   // 这次读通了：清掉上次的失败标记
            await Promise.race([
                new Promise((resolve, reject) => {
                    const tx = db.transaction(PROJECT_STORE_NAME, 'readonly');
                    const store = tx.objectStore(PROJECT_STORE_NAME);
                    const cursorReq = store.openCursor();
                    cursorReq.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            const v = cursor.value || {};
                            projects.push({ id: v.id, name: v.name, updatedAt: v.updatedAt, createdAt: v.createdAt, thumbnail: v.thumbnail });
                            cursor.continue();
                        }
                        else resolve();
                    };
                    cursorReq.onerror = () => reject(cursorReq.error);
                }),
                new Promise(r => setTimeout(r, 8000))   // 超时就不再等，改用下面的 localStorage 兜底
            ]);
        }
    } catch (e) { console.warn('IndexedDB list failed', e); }
    if (!projects.length) {
        try {
            const list = JSON.parse(localStorage.getItem(PROJECT_LIST_KEY) || '[]');
            for (const meta of list) {
                const saved = JSON.parse(localStorage.getItem('ex_project_state_' + meta.id) || 'null');
                projects.push({ ...meta, state: saved ? saved.state : null, thumbnail: saved ? saved.thumbnail : meta.thumbnail });
            }
        } catch (e) { console.error('Project list fallback failed', e); }
    }
    return projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function generateProjectId() {
    return 'proj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function formatProjectTime(ts) {
    const d = new Date(ts || Date.now());
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function captureThumbnail() {
    try {
        if (!renderer || !scene || !camera) return null;
        const canvas = renderer.domElement;
        if (!canvas || canvas.width < 10 || canvas.height < 10) return null;

        // ===== 自动取景：临时移动相机让模型居中完整显示 =====
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3();
        let counted = 0;
        // 第一遍：只算可见的
        for (const b of blocks) {
            const obj = b.mesh || (b.rootGroup && b.rootGroup.children.length ? b.rootGroup : null);
            if (obj && obj.visible !== false) { box.expandByObject(obj); counted++; }
        }
        // 如果可见方块为 0（可能被隐藏组或主题影响），强制包含所有有 mesh 的方块
        if (counted === 0) {
            for (const b of blocks) {
                const obj = b.mesh || (b.rootGroup && b.rootGroup.children.length ? b.rootGroup : null);
                if (obj) { box.expandByObject(obj); counted++; }
            }
        }

        const savedPos = camera.position.clone();
        const savedTarget = (typeof controls !== 'undefined' && controls) ? controls.target.clone() : null;
        const savedUp = camera.up.clone();
        // 缩略图恒定 4:3：临时把相机宽高比设为 4:3 取景/渲染，主画面与用户视角不受影响
        const savedAspect = camera.aspect;
        camera.aspect = 4 / 3;
        camera.updateProjectionMatrix();

        if (counted > 0 && !box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            let dir = new THREE.Vector3().subVectors(camera.position, (savedTarget || camera.position)).normalize();
            if (!isFinite(dir.x) || dir.lengthSq() < 1e-6) dir.set(0.6, 0.5, 1).normalize();
            // 取景距离同时考虑垂直与水平 FOV（目标 4:3 比多数屏幕更方，确保模型在两个方向都完整）
            const vfov = camera.fov * Math.PI / 180;
            const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
            const distV = (maxDim / 2) / Math.tan(vfov / 2);
            const distH = (maxDim / 2) / Math.tan(hfov / 2);
            const dist = Math.max(distV, distH) * 1.15;
            camera.position.copy(center).add(dir.multiplyScalar(dist));
            camera.up.set(0, 1, 0);
            camera.lookAt(center);
            camera.updateMatrixWorld(true);
            if (typeof controls !== 'undefined' && controls) controls.target.copy(center);
        }

        // 临时固定场景背景色——确保浅色/深色模式缩略图的画面内容完全一致
        const savedBg = scene.background ? scene.background.clone() : null;
        const fixedBg = new THREE.Color('#1a1a2e');
        scene.background = fixedBg;

        // 恒定 4:3 渲染：把场景渲染到离屏 800×600 渲染目标（相机已设为 4:3），
        // 再读取像素。无论实际窗口横竖，缩略图都按 4:3 重新构图，且完全不影响主画面。
        const TW = 800, TH = 600;
        let result = null;
        try {
            const rt = new THREE.WebGLRenderTarget(TW, TH, {
                minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
                depthBuffer: true, stencilBuffer: false
            });
            renderer.setRenderTarget(rt);
            renderer.render(scene, camera);
            const pixels = new Uint8Array(TW * TH * 4);
            renderer.readRenderTargetPixels(rt, 0, 0, TW, TH, pixels);
            renderer.setRenderTarget(null);
            rt.dispose();

            // 检查像素有效性
            let sum = 0;
            for (let i = 0; i < Math.min(pixels.length, 10000); i++) sum += pixels[i];
            const avg = sum / Math.min(pixels.length, 10000);

            if (avg > 1) {
                const tmpCanvas = document.createElement('canvas');
                tmpCanvas.width = TW; tmpCanvas.height = TH;
                const ctx = tmpCanvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, TW, TH);

                // Y 轴翻转（WebGL 原点左下 → Canvas 原点左上）
                const rowBytes = TW * 4;
                const srcImgData = ctx.createImageData(TW, TH);
                for (let y = 0; y < TH; y++)
                    srcImgData.data.set(pixels.subarray((TH - 1 - y) * rowBytes, (TH - y) * rowBytes), y * rowBytes);

                const srcCanvas = document.createElement('canvas');
                srcCanvas.width = TW; srcCanvas.height = TH;
                srcCanvas.getContext('2d').putImageData(srcImgData, 0, 0);

                // 4:3 → 4:3 比例一致，直接绘制即可（零黑边）
                ctx.drawImage(srcCanvas, 0, 0);
                result = tmpCanvas.toDataURL('image/jpeg', 0.90);
            }
        } catch (rtErr) {
            console.warn('[captureThumbnail] 离屏渲染失败，降级', rtErr);
        }

        // 恢复场景背景色（不影响用户编辑器）
        if (savedBg !== null) scene.background = savedBg;

        // 恢复用户相机
        camera.position.copy(savedPos);
        camera.up.copy(savedUp);
        if (savedTarget && typeof controls !== 'undefined' && controls) {
            controls.target.copy(savedTarget);
            controls.update();
        } else {
            camera.lookAt(savedTarget || new THREE.Vector3(0, 0, 0));
        }
        // 恢复相机宽高比与主投影矩阵
        if (typeof savedAspect !== 'undefined') { camera.aspect = savedAspect; camera.updateProjectionMatrix(); }
        camera.updateMatrixWorld(true);

        if (result) return result;

        // 降级方案
        try { const d = canvas.toDataURL('image/jpeg', 0.90); if (d && d.length > 1000) return d; } catch(e) {}
        return null;
    } catch (e) {
        return null;
    }
}

function scheduleAutoSave() {
    if (!currentProjectId) return;
    if (currentProjectIsTemp) return; // 临时项目不自动保存，需用户手动「保存项目」
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => { autoSaveTimer = null; autoSaveNow(); }, 1200);
}
/* 立刻落盘（不等 1200ms 防抖）：
   测量（测长/测角）这类「用户停手就再也不会改动」的对象必须在创建/删除的当下写进项目，
   否则用户随手刷新网页时，200ms 撤销防抖 + 1200ms 自动保存窗口里的改动会整条丢失
   （用户 2026-10-31 报障「测量工具刷新网页会消失」，探针实测刷新早于 ~1.4s 必丢）。 */
function autoSaveNow() {
    if (!currentProjectId) return;
    if (currentProjectIsTemp) return;
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
    const project = {
        id: currentProjectId,
        name: currentProjectName,
        state: JSON.stringify(getState()),
        thumbnail: captureThumbnail(),
        updatedAt: Date.now(),
        createdAt: 0
    };
    try {
        saveProjectToDB(project).then(() => {
            currentProjectSavedAt = project.updatedAt;
            if (typeof syncProjectSettingsUI === 'function') syncProjectSettingsUI();
        }).catch(e => console.error('Auto-save failed', e));
    } catch (e) { console.error('Auto-save failed', e); }
}

// 外部网站（bf 转换器）用 URL 带入模型的会话：跳过开场动画与新手教程，直接进项目导入。
// ⚠ 必须在模块求值期就算好并缓存：autoImportHashProject 一开始就 replaceState 清掉 #cmds，
//   之后（导入完成时）再读 location.hash 已经看不到标记了。
const EXTERNAL_URL_IMPORT = /(?:^|[#&?])cmds=/.test(location.hash || '');

async function autoImportHashProject() {
    const h = location.hash || '';
    const i = h.indexOf('cmds=');
    if (i === -1) return;
    // ⚠ 必须用 window.history：模块作用域的 history 是撤销栈管理器（遮蔽了原生 History），
    //   直接写 history.replaceState 会抛 TypeError 且被吞掉，导致 #cmds 残留、
    //   之后每次新建/打开项目都会重复消费同一份 URL 指令。
    try { window.history.replaceState(null, '', location.pathname + location.search); } catch (e) { console.error('[autoImport] replaceState 失败', e); }
    const b64 = h.slice(i + 5);
    function b64urlToUtf8(b64) {
        b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        try { return decodeURIComponent(escape(atob(b64))); } catch (e) { return null; }
    }
    const text = b64urlToUtf8(b64);
    if (!text || typeof importFromCommands !== 'function') return;
    // 转换器通过 URL 带入的指令 = 外部导入：统一进入「外部导入」临时项目（默认不落库）
    try {
        await importExternalToTempProject(text);
    } catch (e) {
        console.error('自动导入出错:', e);
        if (typeof showToast === 'function') showToast('❌ 自动导入失败');
    }
}

// 从外部导入的模型统一进入「外部导入」临时项目：
// - 默认 currentProjectIsTemp=true，不自动保存、返回列表也不落库；
// - 用户在设置面板点击「保存项目」后才正式写入数据库，成为普通项目。
// - applyFn：可选（同 importOverwriteToCurrentProject），让 OBJ 导入也能走这条路径。
async function importExternalToTempProject(text, applyFn = null) {
    if (!text && !applyFn) return;
    // 若当前正在编辑真实项目，先把改动落库，避免切换到临时项目时丢失
    if (currentProjectId && !currentProjectIsTemp) {
        try {
            await saveProjectToDB({
                id: currentProjectId,
                name: currentProjectName,
                state: JSON.stringify(getState()),
                thumbnail: captureThumbnail(),
                updatedAt: Date.now(),
                createdAt: currentProjectSavedAt || 0
            });
        } catch (e) { console.warn('切换前保存当前项目失败', e); }
    }
    // 建立临时项目上下文（默认不保存）
    currentProjectId = generateProjectId();
    currentProjectName = '外部导入';
    currentProjectIsTemp = true;
    currentProjectSavedAt = 0;
    enterProject();
    await runProjectOpenLoad(async () => {
        loadProjectIntoSimulator(null); // 全新空场景（含默认 Cube 占位，import 会自动移除）
        if (applyFn) applyFn(); else importFromCommands(text);
    });
    // 撤销栈基线重置为导入后的状态
    if (typeof history !== 'undefined' && history.reset) history.reset(getState());
    syncProjectSettingsUI();
    if (typeof showToast === 'function') {
        showToast('✅ 已导入到临时项目「外部导入」（默认不保存，可在设置中点击「保存项目」）');
    }
}

// 覆盖型导入（导入弹窗按钮）：
// - temp=false「覆盖型导入」：清空当前项目内容后导入新模型。项目身份不变——
//   正式项目覆盖后立即落库一次（保留 createdAt），临时项目仍为临时；
//   清空前内容可通过「撤销」恢复。
// - temp=true「临时覆盖型导入」：清空当前项目内容后导入新模型，且项目变为临时项目，
//   关闭后即删除干净、不出现在项目列表中；若原来是正式项目，数据库中的原项目记录一并删除。
// - applyFn：可选。给出时用它在清空后的场景里落地内容（如 OBJ 导入的 objCommitPlan），
//   不给则按命令文本走 importFromCommands(text)。—— 让 OBJ 也能复用覆盖语义。
async function importOverwriteToCurrentProject(text, temp = false, applyFn = null) {
    if (!text && !applyFn) return;
    // 不在项目内（导入按钮仅在项目内可见，此为兜底）：等价于外部导入临时项目
    if (!currentProjectId) { await importExternalToTempProject(text, applyFn); return; }
    // 留存清空前状态，导入完成后压入撤销栈（undo 可回到导入前）
    try { if (typeof flushPendingRecords === 'function') flushPendingRecords(); } catch (e) {}
    const prevState = getState();
    await runProjectOpenLoad(async () => {
        loadProjectIntoSimulator(null); // 清空当前项目内容（含默认 Cube 占位，import 会自动移除）
        if (applyFn) applyFn(); else importFromCommands(text);
    });
    if (temp) {
        // 临时覆盖：正式项目先从数据库删除原记录，确保「关闭后删除干净」
        if (!currentProjectIsTemp) {
            // 取消已排队的自动保存，避免删除后又被写回
            if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
            try { await deleteProjectFromDB(currentProjectId); } catch (e) { console.warn('删除原项目记录失败', e); }
            currentProjectSavedAt = 0;
        }
        currentProjectIsTemp = true;
    } else if (!currentProjectIsTemp) {
        // 覆盖型（正式项目）：立即落库一次，保留原 createdAt
        try {
            const existing = await loadProjectFromDB(currentProjectId);
            const project = {
                id: currentProjectId,
                name: currentProjectName,
                state: JSON.stringify(getState()),
                thumbnail: captureThumbnail(),
                updatedAt: Date.now(),
                createdAt: existing && existing.createdAt ? existing.createdAt : Date.now()
            };
            await saveProjectToDB(project);
            currentProjectSavedAt = project.updatedAt;
        } catch (e) { console.error('覆盖导入保存失败', e); }
    }
    // 撤销基线：以「导入前状态」重建，再把导入后状态压栈
    if (typeof history !== 'undefined' && history.reset) {
        history.reset(prevState);
        history.record(getState());
    }
    syncProjectSettingsUI();
    if (typeof showToast === 'function') {
        showToast(temp
            ? '✅ 已覆盖导入为临时项目（关闭后自动删除，可在设置中「保存项目」保留）'
            : '✅ 已清空当前项目并覆盖导入');
    }
}

function loadProjectIntoSimulator(project, addDefaultBlock = true) {
    // 清空当前场景
    blocks.forEach(b => { scene.remove(b.mesh); if(b.label) scene.remove(b.label); if(b.selectionWireframe) scene.remove(b.selectionWireframe); });
    blocks = [];
    selectedBlocksSet.clear();
    selectedBlock = null;
    if (project && project.state) {
        try {
            const state = JSON.parse(project.state);
            restoreState(state);
        } catch (e) { console.error('恢复项目状态失败', e); }
    }
    if (blocks.length === 0) {
        updateAxesByDistance(true);
        // 重置为「全新空项目」：除方块外，全局变量/文件夹/关键帧/骨骼缓存一并清空，
        // 与 restoreState() 行为对齐；否则清空项目后这些仍残留，重新打开又恢复。
        folders = []; window.folders = folders; folderAxesDirty = true;
        globalVars.clear();
        keyframeData.clear();
        /* 【2026-10-19 · 关键帧去文件夹化】原此处还 clear() 骨级关键帧容器（boneKeyframes / kfAddedFolders），已删除 */
        if (addDefaultBlock) {
            const defM = [0,0,0,0,0,0,1,1,-90,0,0,0,0];
            let base = "Cube", bid = base, idx = 1;
            while (blocks.some(b => b.id === bid)) bid = base + (idx++).toString();
            // record=false：自动补的默认方块不该进撤销栈，否则它的防抖快照会插在
            // 「清空前状态」之后，导致清空项目后第一次 Ctrl+Z 撤不回内容。
            addBlock(new Block(bid, defM, null, '#aaccff', 'cube'), false);
            selectBlock(blocks[0]);
        } else {
            // 纯清空（如「清空项目」）：不要补默认方块，结果就是 0 个方块。
            selectBlock(null);
        }
    } else {
        selectBlock(blocks[0]);
    }
    applyTheme();
    if (typeof renderSideBlockList === 'function') renderSideBlockList();
    requestGizmoRefresh();
    updateToolbar(true);
}

async function createNewProject() {
    const name = '项目' + ((await listProjectsFromDB()).length + 1);
    const id = generateProjectId();
    currentProjectId = id;
    currentProjectName = name;
    enterProject();
    // ★ 修复：新项目必须“完全全新”。旧实现用当前内存 getState() 作初始状态，
    //   若从旧项目返回列表（内存未清空）后再新建，会把上一份模型/文件夹/变量的快照
    //   写进新项目 DB —— 打开“新项目”却发现残留旧内容（用户反馈）。
    //   先清空内存（方块/文件夹/全局变量/关键帧/骨骼缓存一并重置，并补产品默认块），
    //   再以“空状态”落库，保证新建即全新。
    loadProjectIntoSimulator(null);
    const project = { id, name, state: JSON.stringify(getState()), thumbnail: null, updatedAt: Date.now(), createdAt: Date.now() };
    await saveProjectToDB(project);
    currentProjectSavedAt = project.updatedAt;
    await runProjectOpenLoad(async () => {
        loadProjectIntoSimulator(null); // 重新走一遍正常加载生命周期（遮罩/默认块/贴图）
        await autoImportHashProject();
    });
    // ★ 撤销栈基线重置为“全新状态”：否则 history 里残留上一项目的快照，
    //   新建后按 Ctrl+Z 会一路退回旧项目内容（另一处“旧模型复活”来源）。
    history.reset(getState());
    renderProjectManager();
}

// 「巡游」专用：把给定 FMBE 指令直接建成一个【全新项目】（不是塞进当前项目），并落库到项目列表。
// 等价于 createNewProject()，只是空场景建好后立刻导入这批指令。
async function createProjectFromCommands(text, name) {
    if (!text || !text.trim()) { if (typeof showToast === 'function') showToast('没有可加载的模型'); return false; }
    // 切换前先把当前项目落盘（教程练习项目常有未保存改动），避免自动保存防抖还没跑就被切走
    if (currentProjectId && !currentProjectIsTemp) {
        try {
            await saveProjectToDB({
                id: currentProjectId, name: currentProjectName,
                state: JSON.stringify(getState()), thumbnail: captureThumbnail(),
                updatedAt: Date.now(), createdAt: currentProjectSavedAt || 0
            });
        } catch (e) { console.warn('切换前保存当前项目失败', e); }
    }
    const id = generateProjectId();
    currentProjectId = id;
    currentProjectName = name || '开场模型';
    currentProjectSavedAt = 0;
    currentProjectIsTemp = false;   // 全新正式项目：出现在项目列表里、并参与自动保存
    enterProject();
    let imported = null;
    await runProjectOpenLoad(async () => {
        loadProjectIntoSimulator(null);                     // 全新空场景（含默认 Cube 占位，import 会自动移除）
        imported = importFromCommands(text, { silent: true });
    });
    try {
        const project = {
            id, name: currentProjectName,
            state: JSON.stringify(getState()), thumbnail: captureThumbnail(),
            updatedAt: Date.now(), createdAt: Date.now()
        };
        await saveProjectToDB(project);
        currentProjectSavedAt = project.updatedAt;
    } catch (e) { console.error('巡游项目落库失败', e); }
    if (typeof history !== 'undefined' && history.reset) history.reset(getState());
    syncProjectSettingsUI();
    try { renderProjectManager(); } catch (e) {}
    return imported || true;
}

async function openProject(id) {
    const project = await loadProjectFromDB(id);
    if (!project) { showToast('项目加载失败'); return; }
    currentProjectId = id;
    currentProjectName = project.name || id;
    currentProjectSavedAt = project.updatedAt || Date.now();
    enterProject();
    // 先估算方块数：重项目要在 restoreState（同步阻塞）之前就把加载遮罩画出来
    const blockCount = estimateStateBlockCount(project.state);
    await runProjectOpenLoad(async () => {
        loadProjectIntoSimulator(project);
        await autoImportHashProject();
    }, { blockCount });
}

// 同步「项目」设置分组里的当前项目名与保存状态显示
function syncProjectSettingsUI() {
    const nameInput = document.getElementById('projectNameInput');
    const statusEl = document.getElementById('projectSaveStatus');
    if (nameInput) nameInput.value = currentProjectName || '';
    if (statusEl) {
        if (currentProjectIsTemp) {
            statusEl.textContent = '临时项目（未保存）· 可在设置中点击「保存项目」';
            statusEl.classList.remove('saved');
        } else {
            statusEl.textContent = currentProjectId ? ('上次保存：' + formatProjectTime(currentProjectSavedAt || Date.now())) : '尚未打开项目';
            statusEl.classList.add('saved');
        }
    }
}

function enterProject() {
    projectManagerEl.style.display = 'none';
    document.body.classList.add('in-simulator');
    syncProjectSettingsUI();
}

async function backToProjectList() {
    console.log('[backToProjectList] called, currentProjectId:', currentProjectId);
    if (currentProjectId) {
        if (currentProjectIsTemp) {
            // 临时项目默认不保存：直接丢弃，返回列表不落库
            currentProjectId = null;
            currentProjectName = '';
        } else {
            // 先同步抓取缩略图（仍在项目内，保证截图正确）
            console.log('[backToProjectList] calling captureThumbnail...');
            const thumb = captureThumbnail();
            console.log('[backToProjectList] captureThumbnail result:', thumb ? 'got data, len=' + thumb.length : 'NULL');
            const project = {
                id: currentProjectId,
                name: currentProjectName,
                state: JSON.stringify(getState()),
                thumbnail: thumb,
                updatedAt: Date.now(),
                createdAt: 0
            };
            // 关键：先同步切回项目列表（显示管理器、移除 in-simulator），
            // 让 ESC 时「退出项目」的视觉变化先于浏览器原生全屏退出（ESC 默认动作）发生；
            // 保存异步在后台完成。否则 await 完成前 DOM 不切换，浏览器又先把原生全屏退掉，
            // 表现为「先退出全屏、再退出项目」，与预期相反。
            projectManagerEl.style.display = 'flex';
            document.body.classList.remove('in-simulator');
            await saveProjectToDB(project);
            currentProjectId = null;
            currentProjectName = '';
        }
    }
    currentProjectIsTemp = false;
    projectManagerEl.style.display = 'flex';
    document.body.classList.remove('in-simulator');
    syncProjectSettingsUI();
    renderProjectManager();
    // 教程进行中退出项目：干净地挂起教程（保存进度、移除悬浮卡片），
    // 避免教程卡浮在项目管理器上方；下次从「设置→新手教程」进入时可继续上次练习。
    if (typeof tutActive !== 'undefined' && tutActive) { try { closeTutorial(false); } catch (e) {} }
}

function showProjectDeleteConfirm(projectName) {
    return new Promise((resolve) => {
        const existing = document.querySelector('.pm-delete-confirm');
        if (existing) existing.remove();
        const wrap = document.createElement('div');
        wrap.className = 'pm-delete-confirm';
        wrap.innerHTML = `
            <div class="pm-delete-confirm-box">
                <h4>删除项目</h4>
                <p>确定要删除 <b>${projectName || '该项目'}</b> 吗？此操作不可恢复。</p>
                <div class="pm-delete-confirm-btns">
                    <button id="pmDeleteConfirm" class="pm-confirm-del">删除</button>
                    <button id="pmDeleteCancel">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);
        wrap.addEventListener('click', (e) => {
            if (e.target === wrap) { wrap.remove(); resolve(false); }
        });
        wrap.querySelector('#pmDeleteCancel').onclick = () => { wrap.remove(); resolve(false); };
        wrap.querySelector('#pmDeleteConfirm').onclick = () => { wrap.remove(); resolve(true); };
    });
}

function showProjectClearConfirm() {
    return new Promise((resolve) => {
        const existing = document.querySelector('.pm-delete-confirm');
        if (existing) existing.remove();
        const wrap = document.createElement('div');
        wrap.className = 'pm-delete-confirm';
        wrap.innerHTML = `
            <div class="pm-delete-confirm-box">
                <h4>清空项目</h4>
                <p>确定要清空当前项目吗？所有方块、文件夹与变量都会被移除，仅保留项目名称。清空后可通过「撤销」按钮恢复。</p>
                <div class="pm-delete-confirm-btns">
                    <button id="pmClearConfirm" class="pm-confirm-del">清空</button>
                    <button id="pmClearCancel">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);
        wrap.addEventListener('click', (e) => {
            if (e.target === wrap) { wrap.remove(); resolve(false); }
        });
        wrap.querySelector('#pmClearCancel').onclick = () => { wrap.remove(); resolve(false); };
        wrap.querySelector('#pmClearConfirm').onclick = () => { wrap.remove(); resolve(true); };
    });
}

// 覆盖型导入（temp=true 为临时覆盖型）确认弹窗：已废弃——2026-09-12 起导入流程仅 toast 提示、不再要求用户确认。
// 保留定义与导出以兼容测试引用；UI 不再调用。
function showProjectOverwriteConfirm(temp) {
    return new Promise((resolve) => {
        const name = currentProjectName || '该项目';
        const desc = temp
            ? `将清空当前项目 <b>${name}</b> 的全部内容并导入新模型。导入后项目变为<b>临时项目</b>：关闭后即删除干净、不出现在项目列表中${currentProjectIsTemp ? '。' : '，原项目记录也会一并删除。'}`
            : `将清空当前项目 <b>${name}</b> 的全部内容并导入新模型，项目名称与保存状态保持不变。清空前的内容可通过「撤销」按钮恢复。`;
        showTechBubble(temp ? '临时覆盖型导入' : '覆盖型导入', '', {
            variant: 'danger',
            contentHtml: desc,
            confirmText: temp ? '临时覆盖导入' : '覆盖导入',
            cancelText: '取消',
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false)
        });
    });
}

async function clearCurrentProject() {
    if (!currentProjectId) { if (typeof showToast === 'function') showToast('尚未打开项目'); return; }
    const confirmed = await showProjectClearConfirm();
    if (!confirmed) return;
    try {
        // 临时项目：仅清空内存视图，不落库（避免误把临时项目写入数据库）
        if (currentProjectIsTemp) {
            if (typeof flushPendingRecords === 'function') flushPendingRecords();
            if (typeof history !== 'undefined' && history.reset) history.reset(getState());
            await runProjectOpenLoad(async () => {
                loadProjectIntoSimulator(null, false); // 纯清空：不补默认方块（保留临时项目状态）
                await autoImportHashProject();
            });
            syncProjectSettingsUI();
            if (typeof showToast === 'function') showToast('✅ 临时项目已清空');
            return;
        }
        // 撤销支持：先取「清空前状态」留存
        if (typeof flushPendingRecords === 'function') flushPendingRecords();
        const prevState = getState();

        await runProjectOpenLoad(async () => {
            loadProjectIntoSimulator(null, false); // 纯清空：不补默认方块（保留当前项目 id / name）
            await autoImportHashProject();
        });

        // 覆盖保存到当前项目，保留 id/name/createdAt
        const existing = await loadProjectFromDB(currentProjectId);
        const project = {
            id: currentProjectId,
            name: currentProjectName,
            state: JSON.stringify(getState()),
            thumbnail: captureThumbnail(),
            updatedAt: Date.now(),
            createdAt: existing && existing.createdAt ? existing.createdAt : Date.now()
        };
        await saveProjectToDB(project);
        currentProjectSavedAt = project.updatedAt;
        syncProjectSettingsUI();

        // 以「清空前状态」重建撤销基线，再把空状态压栈：
        // undo 弹出空状态即回到清空前；同时 record 会触发自动保存。
        history.reset(prevState);
        history.record(getState());

        if (typeof showToast === 'function') showToast('✅ 项目已清空（可撤销）');
    } catch (e) {
        console.error('清空失败', e);
        if (typeof showToast === 'function') showToast('❌ 清空失败');
    }
}

async function deleteProject(id) {
    const project = await loadProjectFromDB(id);
    const confirmed = await showProjectDeleteConfirm(project ? project.name : null);
    if (!confirmed) return;
    await deleteProjectFromDB(id);
    if (currentProjectId === id) { currentProjectId = null; currentProjectName = ''; }
    renderProjectManager();
}

async function renameProject(id, newName) {
    if (!newName || !newName.trim()) return;
    const project = await loadProjectFromDB(id);
    if (!project) return;
    project.name = newName.trim();
    await saveProjectToDB(project);
    if (currentProjectId === id) currentProjectName = project.name;
    renderProjectManager();
}

function renderProjectManager() {
    const grid = document.getElementById('pmProjectGrid');
    const count = document.getElementById('pmProjectCount');
    if (!grid || !count) return;
    /* ★【2026-10-24】「新建项目」卡片必须先落地：旧实现要等 IndexedDB 把所有项目
       （含超大 state 字符串）读进内存后才清空并重画，读库一慢/一卡，整个列表就空白 ——
       用户看到的就是「所有项目都不显示，也没有新建项目的入口」。
       现在先放新建卡，项目卡读到一条插一条，即使读库失败也永远有入口。 */
    grid.innerHTML = '';
    const newCard = document.createElement('div');
    newCard.className = 'pm-card pm-new-card';
    newCard.innerHTML = `<div class="pm-new-icon">+</div><div class="pm-new-label">新建项目</div>`;
    newCard.onclick = createNewProject;
    grid.appendChild(newCard);

    listProjectsFromDB().then(projects => {
        count.textContent = String(projects.length);
        /* 项目库读不出来（被其它标签页占用 / 超时）且一个项目都没读到：
           明确给一张「重试」卡，而不是让用户以为项目都没了。 */
        if (!projects.length && _projectDBUnavailable) {
            const tip = _pmMakeTipCard('项目库暂时读不出来（可能被其它打开的模拟器页面占用）· 点此重试', () => { projectDB = null; _projectDBUnavailable = null; renderProjectManager(); });
            grid.insertBefore(tip, newCard);
        }

        projects.forEach(p => {
            const card = document.createElement('div');
            card.className = 'pm-card';
            card.onclick = (e) => {
                if (e.target.closest('.pm-card-action') || e.target.classList.contains('pm-rename-input')) return;
                openProject(p.id);
            };

            const thumb = document.createElement('div');
            thumb.className = 'pm-card-thumb';
            if (p.thumbnail) {
                const img = document.createElement('img');
                img.className = 'pm-card-thumb-img';
                img.src = p.thumbnail;
                img.alt = p.name || '项目缩略图';
                img.loading = 'lazy';
                thumb.appendChild(img);
            } else {
                thumb.classList.add('pm-card-thumb-empty');
                thumb.style.background = 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)';
            }

            const overlay = document.createElement('div');
            overlay.className = 'pm-card-title-overlay';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = p.name || '未命名项目';
            overlay.appendChild(titleSpan);
            thumb.appendChild(overlay);

            const meta = document.createElement('div');
            meta.className = 'pm-card-meta';
            const updateLabel = document.createElement('span');
            updateLabel.className = 'pm-card-update-label';
            updateLabel.textContent = '更新';
            const updateTime = document.createElement('span');
            updateTime.className = 'pm-card-update-time';
            updateTime.textContent = formatProjectTime(p.updatedAt);
            const actions = document.createElement('div');
            actions.className = 'pm-card-actions';

            const renameBtn = document.createElement('button');
            renameBtn.className = 'pm-card-action';
            renameBtn.title = '重命名';
            renameBtn.textContent = '✎';
            renameBtn.onclick = (e) => {
                e.stopPropagation();
                const input = document.createElement('input');
                input.className = 'pm-rename-input';
                input.value = p.name || '';
                overlay.appendChild(input);
                input.focus();
                input.select();
                function finish() {
                    const v = input.value.trim();
                    if (v) renameProject(p.id, v);
                    input.remove();
                }
                input.addEventListener('blur', finish);
                input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); finish(); } if (ev.key === 'Escape') input.remove(); });
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'pm-card-action';
            delBtn.title = '删除';
            delBtn.textContent = '🗑';
            delBtn.onclick = (e) => { e.stopPropagation(); deleteProject(p.id); };

            actions.appendChild(renameBtn);
            actions.appendChild(delBtn);
            meta.appendChild(updateLabel);
            meta.appendChild(updateTime);
            meta.appendChild(actions);

            card.appendChild(thumb);
            card.appendChild(meta);
            grid.insertBefore(card, newCard);   // 项目卡插在「新建」卡片之前
        });

    }).catch(err => {
        // 读库出错：不再静默留一片空白，给出可点的重试入口
        count.textContent = '?';
        const tip = _pmMakeTipCard('项目列表读取失败，点此重试', () => { projectDB = null; _projectDBUnavailable = null; renderProjectManager(); });
        grid.insertBefore(tip, newCard);
        console.error('项目列表读取失败', err);
    });
}
// 列表页的「提示 + 重试」卡片（读库失败/超时时使用，保证用户永远有可点的地方）
function _pmMakeTipCard(text, onRetry) {
    const tip = document.createElement('div');
    tip.className = 'pm-card pm-new-card';
    tip.innerHTML = `<div class="pm-new-icon">!</div><div class="pm-new-label"></div>`;
    tip.querySelector('.pm-new-label').textContent = text;
    tip.onclick = onRetry;
    return tip;
}

function initProjectManager() {
    // 主题按钮：只在项目管理器内切换图标，不影响 body light-mode（由 applyTheme 控制）
    if (pmThemeBtn) {
        pmThemeBtn.onclick = () => {
            const body = document.body;
            const next = !body.classList.contains('light-mode');
            isLightMode = next;
            applyTheme();
            pmThemeBtn.textContent = next ? '☀' : '☾';
            try { localStorage.setItem('ui_light_mode', next ? '1' : '0'); } catch (e) {}
        };
    }
    // 「项目」设置分组：重命名 / 立即保存 / 返回项目列表
    const nameApplyBtn = document.getElementById('projectNameApplyBtn');
    const nameInput = document.getElementById('projectNameInput');
    if (nameApplyBtn && nameInput) {
        const applyRename = async () => {
            nameInput.focus();
            if (!currentProjectId) { if (typeof showToast === 'function') showToast('尚未打开项目'); return; }
            const v = (nameInput.value || '').trim();
            if (!v) { if (typeof showToast === 'function') showToast('请输入新项目名'); nameInput.select(); return; }
            if (v === currentProjectName) { if (typeof showToast === 'function') showToast('请输入与当前不同的名称'); nameInput.select(); return; }
            if (currentProjectIsTemp) {
                // 临时项目：仅更新内存名，保存时才落库
                currentProjectName = v;
                nameInput.value = currentProjectName;
                syncProjectSettingsUI();
                if (typeof showToast === 'function') showToast('✅ 已重命名为「' + currentProjectName + '」（保存后生效）');
                return;
            }
            await renameProject(currentProjectId, v);
            nameInput.value = currentProjectName;
            if (typeof showToast === 'function') showToast('✅ 已重命名为「' + currentProjectName + '」');
        };
        nameApplyBtn.onclick = applyRename;
        nameInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); applyRename(); } });
    }

    const saveNowBtn = document.getElementById('projectSaveNowBtn');
    if (saveNowBtn) {
        saveNowBtn.onclick = async () => {
            if (!currentProjectId) { if (typeof showToast === 'function') showToast('尚未打开项目'); return; }
            // 读取设置面板中可能已修改的项目名（临时项目重命名后应立即生效）
            const ni = document.getElementById('projectNameInput');
            const liveName = (ni && ni.value && ni.value.trim()) ? ni.value.trim() : currentProjectName;
            currentProjectName = liveName;
            const project = {
                id: currentProjectId,
                name: currentProjectName,
                state: JSON.stringify(getState()),
                thumbnail: captureThumbnail(),
                updatedAt: Date.now(),
                // 临时项目首次保存时赋予真实创建时间；已有 createdAt 的正式项目保持原值
                createdAt: currentProjectIsTemp ? Date.now() : (currentProjectSavedAt || 0)
            };
            try {
                await saveProjectToDB(project);
                currentProjectIsTemp = false;   // ★ 保存后转为正式项目
                currentProjectSavedAt = project.updatedAt;
                syncProjectSettingsUI();
                if (typeof showToast === 'function') showToast('✅ 项目已保存');
            } catch (e) {
                console.error('保存失败', e);
                if (typeof showToast === 'function') showToast('❌ 保存失败');
            }
        };
    }

    const backBtn = document.getElementById('projectBackBtn');
    if (backBtn) backBtn.onclick = backToProjectList;

    const clearBtn = document.getElementById('projectClearBtn');
    if (clearBtn) clearBtn.onclick = clearCurrentProject;

    // 同步主题图标
    const isLight = document.body.classList.contains('light-mode');
    if (pmThemeBtn) pmThemeBtn.textContent = isLight ? '☀' : '☾';

    // 显示项目管理器
    projectManagerEl.style.display = 'flex';
    syncProjectSettingsUI();
    renderProjectManager();
}

initProjectManager();
// 首启新手引导（电影感运镜开场 / 欢迎卡）：在「项目列表」界面就触发，而非等进了项目才弹
setTimeout(() => { try { if (typeof maybeStartTutorial === 'function') maybeStartTutorial(); } catch (e) {} }, 0);

// 转换器跳转（URL 带 #cmds=…）：进站即消费指令，自动导入到「外部导入」临时项目。
// ⚠ 必须延迟到模块求值结束后执行：导入链路会触达 keyframe/骨骼等在文件更后方
//   声明的模块变量（boneKeyframes 等），同步调用会撞 TDZ（ReferenceError）。
setTimeout(() => { try { autoImportHashProject(); } catch (e) { console.error('URL 自动导入失败', e); } }, 0);

// 初始化默认方块（现在通过 loadProjectIntoSimulator 延迟到进入项目时）
// 保留占位调用，使场景初始化后先不显示方块
// 先恢复「四个视图开关」的全局偏好，再建首帧网格/轴线：开关状态决定几何是否生成
// （若轴线为关时先建几何，之后单独打开会无几何可显示）。
restoreViewFlags();
updateAxesByDistance(true);

// 面板拖拽调整高度（使用 rAF 节流避免卡顿）
const resizeHandle = document.getElementById('resizeHandle');
let isDraggingPanel = false, dragStartClientY = 0, dragStartHeight = 0, dragStartClientX = 0, dragStartWidth = 0;
let resizeRAFId = null;
function applyPanelWidth(newWidth) {
    panel.style.width = newWidth + 'px';
    sidePanelWidth = newWidth;
    if (sidePanelWidthLabel) sidePanelWidthLabel.textContent = `${sidePanelWidth}px`;
    if (sidePanelWidthRange) sidePanelWidthRange.value = sidePanelWidth;
    const narrow = sidePanelWidth < 400 ? 'true' : 'false';
    const narrowChanged = panel.dataset.narrow !== narrow;
    panel.dataset.narrow = narrow;
    /* ★★★【2026-10-17 用户报障 · molang 编辑模式拖宽度「上下跳变 + 卡顿】】
       拖拽逐帧（rAF）**只更新宽度，不重建变量面板**，除非单列⇄双列布局真正翻转（400px 阈值）。
       旧实现每帧 `renderVariablesForBlock(selectedBlock)` ⇒ molang 编辑器被持续销毁重建 +
       autosize 重算高度 ⇒ 只读数值表上下跳变、编辑区高度抖动、滚动位置重置 ⇒ 卡顿。
       拖拽结束（onPointerUp）仍会整体重建一次，保证落定后的布局与编辑器高度正确。 */
    if (selectedBlock && narrowChanged && !isNewLayoutMode) renderVariablesForBlock(selectedBlock);
}
function applyPanelHeight(newHeight) {
    panel.style.height = newHeight + 'px';
    panelBottomHeight = newHeight;
}
function onPointerDown(e) {
    e.preventDefault();
    isDraggingPanel = true;
    const pt = e.touches ? e.touches[0] : e;
    dragStartClientY = pt.clientY;
    dragStartHeight = panel.offsetHeight;
    dragStartClientX = pt.clientX;
    dragStartWidth = panel.offsetWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isSidePanelMode || isNewLayoutMode ? 'ew-resize' : 'ns-resize';
    // 侧边模式或新布局模式拖拽时降低 3D 渲染精度以减少卡顿
    if (isSidePanelMode || isNewLayoutMode) {
        panel.style.willChange = 'width';
        renderer.setPixelRatio(Math.min(1, window.devicePixelRatio * 0.5));
        bumpDrawRev('ui');   // 改像素比会清空画布，必须补一帧
    }
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
}
function onPointerMove(e) {
    if (!isDraggingPanel) return;
    if (resizeRAFId) cancelAnimationFrame(resizeRAFId);
    resizeRAFId = requestAnimationFrame(() => {
        resizeRAFId = null;
        const pt = e.touches ? e.touches[0] : e;
        if (isSidePanelMode || isNewLayoutMode) {
            const dx = pt.clientX - dragStartClientX;
            let newWidth = dragStartWidth - dx;
            newWidth = Math.min(maxSidePanelWidth(), Math.max(MIN_SIDE_PANEL_WIDTH, newWidth));
            applyPanelWidth(newWidth);
            // 数据面板宽度与方块列表宽度解耦，不再联动左侧方块列表
        } else {
            const dy = pt.clientY - dragStartClientY;
            let newHeight = dragStartHeight - dy;
            newHeight = Math.min(window.innerHeight * 0.85, Math.max(140, newHeight));
            applyPanelHeight(newHeight);
        }
    });
}
function onPointerUp() {
    isDraggingPanel = false;
    if (resizeRAFId) { cancelAnimationFrame(resizeRAFId); resizeRAFId = null; }
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    if (isSidePanelMode || isNewLayoutMode) {
        panel.style.willChange = '';
        if (_largeSceneLowRes) applyBasePixelRatio();          // 大场景保持低分辨率（不因松手而回升）
        else { renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); bumpDrawRev('ui'); }
        try { localStorage.setItem('ui_side_panel_width', String(sidePanelWidth)); } catch (e) {}
        if (selectedBlock) renderVariablesForBlock(selectedBlock);
    }
    try { positionUISettingsPanel(); } catch (e) { /* ignore */ }
}
resizeHandle.addEventListener('pointerdown', onPointerDown);
resizeHandle.addEventListener('touchstart', onPointerDown, { passive: false });
// 仅底部模式设置默认高度；侧边模式由 applySidePanelMode 设为 100% 占满全高，
// 此处若无条件覆盖回 280px，会在「旧操作模式 + 已启用侧边栏」重新打开时被拦腰斩断。
if (!isSidePanelMode) panel.style.height = '280px';

// 窗口尺寸变化时，把面板宽/高钳制在视口范围内，使数据面板（含 molang 编辑器）自动适应屏幕，
// 不会因窗口缩小而溢出或变得过宽/过高。用 rAF 节流，且只改尺寸不重建面板（避免编辑器高度被重置）。
let _panelResizeClampRAF = null;
window.addEventListener('resize', () => {
    if (_panelResizeClampRAF) cancelAnimationFrame(_panelResizeClampRAF);
    _panelResizeClampRAF = requestAnimationFrame(() => {
        _panelResizeClampRAF = null;
        // 滑杆上限随视口变化（侧边最多占屏宽 80%）—— 必须先同步上限，再钳制当前宽度，
        // 否则窗口变大后滑杆仍停在旧上限、用户拉不到新的 80%。
        if (sidePanelWidthRange) sidePanelWidthRange.max = String(maxSidePanelWidth());
        if (isSidePanelMode) {
            // 与 maxSidePanelWidth() 口径一致（80%），不再用 92% —— 避免出现「拖拽/滑杆上限 80%、
            // 但 resize 允许 92%」两套标准导致宽度在窗口变化时反向跳动。
            const maxW = maxSidePanelWidth();
            if (sidePanelWidth > maxW) {
                sidePanelWidth = maxW;
                panel.style.width = maxW + 'px';
                panel.dataset.narrow = maxW < 400 ? 'true' : 'false';
                if (sidePanelWidthRange) sidePanelWidthRange.value = maxW;
                if (sidePanelWidthLabel) sidePanelWidthLabel.textContent = maxW + 'px';
            }
        } else {
            const maxH = Math.floor(window.innerHeight * 0.85);
            if (panelBottomHeight > maxH) {
                panelBottomHeight = maxH;
                panel.style.height = maxH + 'px';
            }
        }
    });
});

