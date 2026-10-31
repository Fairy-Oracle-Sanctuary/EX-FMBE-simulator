/* 07-scene/03-box-select-and-mirror-select.js · 源 测试版v.6b79.html 第 36032-36920 行 */
'use strict';
// ==================== 框选多选（电脑端：按住 Ctrl/Cmd + 鼠标左键拖拽） ====================
let boxSelectStart = null;       // { x, y } 起始点（clientX/Y）
let boxSelectActive = false;     // 是否已越过拖拽阈值（真正开始框选）
let boxSelectOverlay = null;     // 选择框 DOM
let boxSelectPrevControlsEnabled = true;
let justBoxSelected = false;     // 框选拖拽结束后抑制随后的 click，避免误清空/误选

function boxSelectCreateOverlay() {
    if (boxSelectOverlay) return;
    const div = document.createElement('div');
    div.id = 'boxSelectOverlay';
    div.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.15);border-radius:3px;';
    document.body.appendChild(div);
    boxSelectOverlay = div;
}
function boxSelectUpdateOverlay(x1, y1, x2, y2) {
    if (!boxSelectOverlay) return;
    boxSelectOverlay.style.left = Math.min(x1, x2) + 'px';
    boxSelectOverlay.style.top = Math.min(y1, y2) + 'px';
    boxSelectOverlay.style.width = Math.abs(x2 - x1) + 'px';
    boxSelectOverlay.style.height = Math.abs(y2 - y1) + 'px';
}
function boxSelectRemoveOverlay() {
    if (boxSelectOverlay) { boxSelectOverlay.remove(); boxSelectOverlay = null; }
}

// 计算屏幕矩形内的所有方块。
// ★★ 判定口径：**纯屏幕空间的视觉轮廓**（与摄像机角度无关）——
//   只选「视觉上落在蓝框里」的方块，而不是「世界坐标包围盒与框相交」的方块。
//   ★ 历史 bug（用户报「有时候选的范围特别偏」）根因两条：
//     ① 旧实现用 Box3.setFromObject(b.mesh)，而 b.mesh 下挂着一个**不可见的轴辅助器**
//        （ArrowHelper 三根箭头，长度 2）。three 的 Box3 遍历**不看 visible** ⇒ 任何方块的世界
//        AABB 都被撑到 2.5×2.5×2.5（真实方块只有 1×1×1）⇒ 屏幕上轮廓每边约 3 倍大 ⇒ 蓝框在
//        方块几个身位之外也能选中它。改为只取 **b.meshes（真正的 cube 网格）** 的几何顶点。
//     ② 旧实现把「世界 AABB 的 8 角」投到屏幕再取包围盒。方块旋转后世界 AABB 远大于真实造型
//        （细长的骨骼方块尤其离谱），投影包围盒还会把斜置的薄片摊成一个大方块。改为逐 mesh
//        取顶点投影后的**凸包**：凸多面体的中心投影像 = 其顶点像的凸包 ⇒ 恰好等于视觉轮廓。
//   另：近平面之后的顶点必须剔除（project 会给出镜像坐标，会造出整屏大的假轮廓）。
const _bsVec = new THREE.Vector3();
const _bsBoxCorners = [[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1], [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]];
const BS_MAX_VERTS = 256;   // 单 mesh 顶点数上限：超过则退化为其几何包围盒 8 角（避免复杂模型卡顿）

// 2D 凸包（Andrew monotone chain，逆时针）。输入 [{x,y}]，返回逆时针顶点序列。
function boxSelectConvexHull(pts) {
    if (pts.length < 3) return pts.slice();
    const a = pts.slice().sort((p, q) => (p.x - q.x) || (p.y - q.y));
    const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
    const lower = [];
    for (const p of a) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = a.length - 1; i >= 0; i--) {
        const p = a[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
}
// 点是否在凸多边形内（多边形须为逆时针）
function boxSelectPointInHull(hull, x, y) {
    for (let i = 0, n = hull.length; i < n; i++) {
        const p = hull[i], q = hull[(i + 1) % n];
        if ((q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x) < 0) return false;
    }
    return true;
}
// 线段相交（含端点接触）
function boxSelectSegCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
// 凸包与轴对齐矩形是否相交
function boxSelectHullHitsRect(hull, left, top, right, bottom) {
    const n = hull.length;
    if (n < 3) return false;
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const p of hull) {
        if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x;
        if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y;
    }
    if (mxx < left || mnx > right || mxy < top || mny > bottom) return false;   // 粗筛
    for (const p of hull) if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) return true;  // 轮廓顶点落在框内
    // 框被整个轮廓包住（一个角在包内即成立，凸性保证其余角同理）
    if (boxSelectPointInHull(hull, left, top) || boxSelectPointInHull(hull, right, top)
        || boxSelectPointInHull(hull, left, bottom) || boxSelectPointInHull(hull, right, bottom)) return true;
    // 边相交（细长轮廓斜穿框、且两者顶点互不在对方内部的情形）
    for (let i = 0; i < n; i++) {
        const a = hull[i], b = hull[(i + 1) % n];
        if (boxSelectSegCross(a.x, a.y, b.x, b.y, left, top, right, top)
            || boxSelectSegCross(a.x, a.y, b.x, b.y, right, top, right, bottom)
            || boxSelectSegCross(a.x, a.y, b.x, b.y, right, bottom, left, bottom)
            || boxSelectSegCross(a.x, a.y, b.x, b.y, left, bottom, left, top)) return true;
    }
    return false;
}
// 取方块「真正的视觉几何网格」：优先 block.getMeshes()（工厂生成的 cube 网格），
// 否则遍历 b.mesh 但**排除轴辅助器子树与不可见对象**（旧实现把它们算进包围盒是 bug 根源）。
function boxSelectRealMeshes(block) {
    if (typeof block.getMeshes === 'function') { const ms = block.getMeshes(); if (ms && ms.length) return ms; }
    if (block.meshes && block.meshes.length) return block.meshes;
    const out = [];
    if (block.mesh) {
        block.mesh.traverse(o => {
            if (!o.geometry || o.visible === false) return;
            for (let n = o; n; n = n.parent) if (n === block.axisHelper) return;   // 轴辅助器不算视觉体
            out.push(o);
        });
    }
    return out;
}
// 单个 mesh 的屏幕轮廓凸包（rect 为画布 client 矩形）。不可投影（近平面之后）的顶点被剔除；
// 剩余顶点不足 3 个则返回 null（该 mesh 无有效视觉轮廓）。
function boxSelectMeshHull(mesh, rect) {
    const geo = mesh.geometry;
    const pos = geo && geo.attributes ? geo.attributes.position : null;
    const pts = [];
    const e = mesh.matrixWorld.elements;
    const push = (x, y, z) => {
        _bsVec.set(e[0] * x + e[4] * y + e[8] * z + e[12],
            e[1] * x + e[5] * y + e[9] * z + e[13],
            e[2] * x + e[6] * y + e[10] * z + e[14]);
        if (_bsVec.applyMatrix4(camera.matrixWorldInverse).z > -camera.near) return;   // 近平面之后：投影会镜像
        _bsVec.applyMatrix4(camera.projectionMatrix);
        pts.push({ x: (_bsVec.x * 0.5 + 0.5) * rect.width + rect.left, y: (-_bsVec.y * 0.5 + 0.5) * rect.height + rect.top });
    };
    if (pos && pos.count > 0 && pos.count <= BS_MAX_VERTS) {
        for (let i = 0; i < pos.count; i++) push(pos.getX(i), pos.getY(i), pos.getZ(i));
    } else {
        if (!geo) return null;
        if (!geo.boundingBox) { try { geo.computeBoundingBox(); } catch (err) { return null; } }
        const bb = geo.boundingBox; if (!bb) return null;
        const mn = bb.min, mx = bb.max;
        for (const c of _bsBoxCorners) push(c[0] ? mx.x : mn.x, c[1] ? mx.y : mn.y, c[2] ? mx.z : mn.z);
    }
    if (pts.length < 3) return null;
    return boxSelectConvexHull(pts);
}
function getBlocksInScreenRect(sx1, sy1, sx2, sy2) {
    const rect = renderer.domElement.getBoundingClientRect();
    const left = Math.min(sx1, sx2), right = Math.max(sx1, sx2);
    const top = Math.min(sy1, sy2), bottom = Math.max(sy1, sy2);
    const isKfMode = (isNewLayoutMode && isKeyframeMode) || (!isNewLayoutMode && keyframeWindowOpen);
    camera.updateMatrixWorld(true);   // 保证 matrixWorldInverse 是最新的（刚转过摄像机也能立刻框选）
    const result = [];
    for (const b of blocks) {
        if (!b.mesh || isBlockInHiddenGroup(b) || isBlockLocked(b)) continue;   // 锁定方块不参与框选
        // ★【2026-10-18 r33】关键帧动画模式下，框选与点选同口径：只收「已加入动画列表」的方块。
        //   判据用 isKeyframeSelectableBlock（= 已加入，含 0 帧空轨道 / 整组加入），而不是 hasKeyframeAnimation
        //   （后者要求"真的录了帧"，会把刚用 ❒ 加入、还是 0 帧的方块漏掉，与点选口径不一致）。
        if (isKfMode && !isKeyframeSelectableBlock(b)) continue;
        b.mesh.updateMatrixWorld(true);
        const meshes = boxSelectRealMeshes(b);
        let hit = false;
        for (const m of meshes) {
            const hull = boxSelectMeshHull(m, rect);
            if (hull && boxSelectHullHitsRect(hull, left, top, right, bottom)) { hit = true; break; }
        }
        if (hit) result.push(b);
    }
    return result;
}

// 在画布捕获阶段拦截 Ctrl/Cmd + 左键：专用于框选，绝不让 OrbitControls 把它当成平移/旋转。
// 注意：three r128 的 OrbitControls 会在 左键 + (Ctrl/Meta/Shift) 时把旋转切换为平移。
// 因此这里用 stopImmediatePropagation 直接拦住同元素的 OrbitControls 监听，
// 使 Ctrl/Cmd+左键只走框选；而 Shift+左键（不带 Ctrl/Meta）放行，由 OrbitControls 提升为平移。
function boxSelectIntercept(e) {
    if (isBrushMode) return;
    /* 顶点捕捉：第一步（还没选接合点）时必须允许框选 —— 捕捉的"集合"就是当前多选，
       用户需要一边开着捕捉一边把方块框进来；第二步（已在等目标点）才禁掉，避免框选打断流程。 */
    if (vtxSnapPhase >= 2) return;
    if (e.button !== 0) return;
    if (!(e.ctrlKey || e.metaKey)) return;                 // 仅 Ctrl/Cmd+左键走框选；Shift+左键留给摄像机平移
    if (!renderer.domElement.contains(e.target)) return;  // 事件必须在主画布范围内
    if (e.target.closest && (e.target.closest('.data-panel') || e.target.closest('.top-bar') || e.target.closest('.new-top-bar') || e.target.closest('.side-block-list'))) return;
    if (gizmoRoot && gizmoRoot.visible) return;
    boxSelectStart = { x: e.clientX, y: e.clientY };
    boxSelectActive = false;
    /* ★【2026-10-24 修复「顶点捕捉里 Ctrl+左键选不中、反而 Shift+左键能选」】
       本监听会 stopImmediatePropagation()，下面 L34046 那个 pointerdown 复位的监听收不到事件。
       于是上一次「拖动旋转视角」留下的 _canvasDragMoved = true 会一直挂着，紧随的 click 被当成
       「拖视角松手」直接 return（画布 click 处理器在 vtxSnapPhase 时对 _canvasDragMoved 直接忽略）
       ⇒ Ctrl+点击在捕捉里完全无效。Shift+点击不走本拦截器、能正常复位，所以看似「快捷键被换成 Shift」。
       修法：拦事件的同时自己把拖拽起点/位移标记复位（未越过阈值的 Ctrl 点击本就是点击，不是拖拽）。 */
    _downX = e.clientX; _downY = e.clientY; _canvasDragMoved = false;
    boxSelectPrevControlsEnabled = controls.enabled;
    controls.enabled = false;                             // 禁用 OrbitControls，避免其把 Ctrl+左键当成平移
    e.stopImmediatePropagation();                         // 阻止同元素上的 OrbitControls 监听触发
}
renderer.domElement.addEventListener('pointerdown', boxSelectIntercept, { capture: true });

window.addEventListener('pointermove', (e) => {
    if (!boxSelectStart) return;
    const dx = e.clientX - boxSelectStart.x;
    const dy = e.clientY - boxSelectStart.y;
    if (!boxSelectActive) {
        if (Math.hypot(dx, dy) < 4) return; // 未达拖拽阈值，仍视为普通 Ctrl 点击
        boxSelectActive = true;
        boxSelectCreateOverlay();
    }
    boxSelectUpdateOverlay(boxSelectStart.x, boxSelectStart.y, e.clientX, e.clientY);
});

function endBoxSelect(e) {
    if (!boxSelectStart) return;
    if (boxSelectActive) {
        // 关键帧动画模式下的「只收已加入动画列表的方块」门禁已在 getBlocksInScreenRect 内统一处理
        // （见上方 r33 注释），此处无需再过滤，保持单一真相源。
        const hits = getBlocksInScreenRect(boxSelectStart.x, boxSelectStart.y, e.clientX, e.clientY);
        // ★【2026-10-18】框选进来的方块同样记为“亲手点选”，保证之后 Ctrl+点击能正常剔除它们
        hits.forEach(b => { selectedBlocksSet.add(b); kfExplicitPickIds.add(b.id); });
        if (selectedBlocksSet.size > 0) selectBlock(Array.from(selectedBlocksSet)[0]);
        updateAxesVisibility();
        updateDropdownSelection();
        if (isNewLayoutMode) renderSideBlockList();
        if (hits.length) showToast('已框选 ' + hits.length + ' 个方块');
        boxSelectRemoveOverlay();
        justBoxSelected = true; // 抑制随后的 click，避免误清空/误选
        setTimeout(() => { justBoxSelected = false; }, 100);
    }
    controls.enabled = boxSelectPrevControlsEnabled;
    boxSelectStart = null;
    boxSelectActive = false;
}
window.addEventListener('pointerup', endBoxSelect);
window.addEventListener('pointercancel', endBoxSelect);

// 在空白处拖动（旋转/平移摄像机）时记录位移量，供 onCanvasClick 判断是否“拖动摄像机”
renderer.domElement.addEventListener('pointerdown', (e) => {
    // 任何按键都记录按下点：右键平移 / 中键推拉产生的 click 也要能靠「按下→释放距离」判成拖拽
    _downX = e.clientX; _downY = e.clientY; _canvasDragMoved = false;
});
renderer.domElement.addEventListener('pointermove', (e) => {
    // ★ 只有「按住指针拖动」才算拖过画布；纯悬停移动不该把后续点击误判成拖拽
    //   （否则每次移动鼠标都会让 _canvasDragMoved 置真，镜像面选取的悬停高亮永远亮不起来）
    if (!_canvasDragMoved && e.buttons && Math.hypot(e.clientX - _downX, e.clientY - _downY) > 6) _canvasDragMoved = true;
    // 顶点捕捉：悬停高亮最近顶点（未拖动时）
    if (!_canvasDragMoved && vtxSnapPhase) vtxSnapHoverAt(e.clientX, e.clientY);
    // 镜像三点定面：悬停高亮最近的可选顶点（同一套圆点图层）
    if (!_canvasDragMoved && mirrorVtxPicking) mirrorVtxHoverAt(e.clientX, e.clientY);
    // 镜像面选取：悬停预览「即将选中的那个面」（与点下去时选中的是完全同一个面）
    if (mirrorFacePicking) mirrorHoverFaceAt(e.clientX, e.clientY);
});
// ==================== 镜像：面选取 / 画布点击 ====================
renderer.domElement.addEventListener('click', (e) => {
    if (justBoxSelected) { justBoxSelected = false; return; }
    // 只要这次手势移动过（含 pointermove 丢失、微推不足 6px 之外的所有情况）就不当点击处理
    const _gestureMoved = canvasClickWasDrag(e);
    /* ★【2026-10-25 修复 · 用户再次反馈「拖一下视角对称面就消失」】
       拖摄像机松手后浏览器必然补发一次 click。旧实现只在「面选取 / 命中对称面 / 点顶点 / 空白」
       这几处拦了它，**命中方块这一支没拦** ⇒ 松手正好落在另一个方块上就把选区改成那个块
       ⇒ mirrorSync 判定镜像源变了 ⇒ mirrorExit ⇒ 对称面连同预览一起被销毁。
       现在一律在入口拦掉：拖拽结束的 click 不参与任何选区/面选取逻辑（框选已由 justBoxSelected 前置处理）。 */
    if (_gestureMoved) return;
    // 测量（测长 / 测角）：点到删除 × = 只删测量，不参与选方块
    if (typeof measureDeleteClick === 'function' && measureDeleteClick(e.clientX, e.clientY)) return;
    // 镜像三点定面：点顶点落点 / 点方块切换取点方块 / 点空白吞掉（绝不改选区）
    if (mirrorVtxPicking) { mirrorVtxClick(e.clientX, e.clientY); return; }
    // 镜像面选取阶段：画布点击 = 指定对称面（不参与选方块）
    if (mirrorFacePicking) {
        if (mirrorPickFaceAt(e.clientX, e.clientY)) return;
    }
    // 已摆好对称面：点在对称面上不穿透去改选区（否则会因选区变化直接结束镜像）
    if (mirrorActive && mirrorPlaneHitAt(e.clientX, e.clientY)) return;
    // 顶点捕捉进行中：点中顶点归捕捉流程；没点中顶点则交回常规选区逻辑（改集合 / 取消选中）
    if (vtxSnapPhase) {
        if (vtxSnapClick(e.clientX, e.clientY)) return;
    }
    if (isBrushMode) {
        handleBrushClick(e);
        return;
    }
    onCanvasClick(e);
});
renderer.domElement.addEventListener('touchstart', e => {
    if (e.target.closest('.new-top-bar') || e.target.closest('.side-block-list')) return;
    let start = { x: e.touches[0].clientX, y: e.touches[0].clientY }, moved = false;
    const onMove = me => {
        if (Math.abs(me.touches[0].clientX - start.x) > 5 || Math.abs(me.touches[0].clientY - start.y) > 5) moved = true;
    };
    const onEnd = ee => {
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        if (gizmoDragJustEnded) return;
        if (!moved && !ee.target.closest('.data-panel') && !ee.target.closest('.top-bar') && !ee.target.closest('.new-top-bar') && !ee.target.closest('.side-block-list')) {
            // 测量（测长 / 测角）：触摸点删除 ×
            if (typeof measureDeleteClick === 'function' && measureDeleteClick(ee.changedTouches[0].clientX, ee.changedTouches[0].clientY)) return;
            // 镜像面选取阶段（触摸）：点方块某个面 = 指定对称面
            // 镜像三点定面（触摸）：与鼠标同一条路径
            if (mirrorVtxPicking && !_canvasDragMoved) { mirrorVtxClick(ee.changedTouches[0].clientX, ee.changedTouches[0].clientY); return; }
            if (mirrorFacePicking && !_canvasDragMoved && mirrorPickFaceAt(ee.changedTouches[0].clientX, ee.changedTouches[0].clientY)) return;
            if (mirrorActive && mirrorPlaneHitAt(ee.changedTouches[0].clientX, ee.changedTouches[0].clientY)) return;
            if (isBrushMode) {
                const rect = renderer.domElement.getBoundingClientRect();
                pointer.x = ((ee.changedTouches[0].clientX - rect.left) / rect.width) * 2 - 1;
                pointer.y = -((ee.changedTouches[0].clientY - rect.top) / rect.height) * 2 + 1;
                raycaster.setFromCamera(pointer, camera);
                const event = { clientX: ee.changedTouches[0].clientX, clientY: ee.changedTouches[0].clientY };
                handleBrushClick(event);
                return;
            }
            const rect = renderer.domElement.getBoundingClientRect();
            // 顶点捕捉（触摸）：点不中顶点则本次不作数
            if (vtxSnapClick(ee.changedTouches[0].clientX, ee.changedTouches[0].clientY)) return;
            pointer.x = ((ee.changedTouches[0].clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((ee.changedTouches[0].clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            blocks.forEach(b => { if (b.mesh) b.mesh.updateMatrixWorld(true); });
            const isKfMode = (isNewLayoutMode && isKeyframeMode) || (!isNewLayoutMode && keyframeWindowOpen);
            /* ★★【2026-10-14 P0 修复 · 与 onCanvasClick 同一根因，这里是**触摸路径**】
               旧实现同样带 `(!isKfMode || hasKeyframeAnimation(b.id))` —— 手机上（本文件的触摸
               分支）给新方块做动画时点它 → 不在拾取列表 → hits 空 → 走 else 分支把选区清空。
               修复：与鼠标路径保持一致，动画模式也允许拾取任意未隐藏方块。
               ★【2026-10-18 r33】门禁与鼠标路径同步收紧为 `kfBlockIsInAnimation()`（已加入动画列表即可选，
               0 帧空轨道也算已加入；真没加入则不改动选区、只提示）。 */
            const allMeshes = blocks.filter(b => !isBlockInHiddenGroup(b)).flatMap(b => b.getMeshes());
            const hits = raycaster.intersectObjects(allMeshes);
            if (hits.length) {
                const hitBlock = blocks.find(b => b.getMeshes().includes(hits[0].object));
                if (hitBlock && !isBlockInHiddenGroup(hitBlock)) {
                    if (isKfMode && _kfSystemReady && !isKeyframeSelectableBlock(hitBlock)) {
                        showToast('该方块尚未加入动画列表 · 请先用关键帧窗口标题栏的「❒」选择器加入，加入后即可选中编辑');
                        return;
                    }
                    toggleBlockSelection(hitBlock, false);
                    if (keyframeWindowOpen && keyframeData.has(hitBlock.id)) {
                        selectKeyframeBlock(hitBlock.id);
                    }
                }
            } else {
                selectedBlocksSet.clear();
                selectBlock(null);
                renderVariablesForBlock(null);
                updateDropdownSelection();
            }
        }
    };
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onEnd);
    e.preventDefault();
}, { passive: false });

// ============================================================
// 画笔模式系统
// ============================================================
var isBrushMode = false;
var brushThickness = 1.0;
var brushPoint1 = null;
var brushPoint2 = null;
var brushPoint3 = null;
var brushClickMode = null;
var brushPreviewPoint = null;
var brushLine = null;
var brushLineGeo = null;
var brushPreviewPlaneCenter = null;
var brushPreviewPlaneLeft = null;
var brushPreviewPlaneRight = null;
var brushVertexMarkers = [];
var brushHoveredVertex = null;
var brushSelectedBlock = null;

// 同步所有画笔长度/粗细控件（顶部工具栏滑动条 与 设置面板滑动条）
function syncBrushThicknessUI() {
    const lenRange = document.getElementById('brushLengthRange');
    const lenLabel = document.getElementById('brushLengthLabel');
    const thickRange = document.getElementById('brushThicknessRange');
    const thickLabel = document.getElementById('brushThicknessLabel');
    if (lenRange) lenRange.value = brushThickness;
    if (lenLabel) lenLabel.textContent = brushThickness.toFixed(1);
    if (thickRange) thickRange.value = brushThickness;
    if (thickLabel) thickLabel.textContent = brushThickness.toFixed(1);
}

function toggleBrushMode() {
    if (isBrushMode) {
        exitBrushMode();
    } else {
        enterBrushMode();
    }
}

function enterBrushMode() {
    isBrushMode = true;
    // 画笔与编辑 / 动画互斥：进入画笔先退出关键帧动画模式
    if (isKeyframeMode) { try { exitKeyframeMode(); } catch (e) {} }

    // 显示顶部工具栏中的画笔工具条（画笔长度滑动条由 ptSyncTopUI 在画笔模式下隐藏，矩形宽走浮层/侧边）
    const blt = document.getElementById('brushLengthToolbar');
    if (blt) blt.style.display = 'flex';
    syncBrushThicknessUI();
    
    const cb = document.getElementById('brushModeCheckbox');
    if (cb) { cb.classList.add('checked'); cb.setAttribute('aria-pressed', 'true'); }
    
    clearHerModes();
    if (gizmoRoot) gizmoRoot.visible = false;
    
    document.querySelectorAll('.her-mode-btn').forEach(b => b.style.display = 'none');
    // 画笔模式下不显示变换 Gizmo 工具栏（枢轴/位移/旋转/缩放）及其分隔线
    const htb = document.getElementById('herTransformToolbar');
    if (htb) htb.style.display = 'none';
    const htd = document.getElementById('herToolbarDivider');
    if (htd) htd.style.display = 'none';
    
    const kfBtn = document.getElementById('sideBlockKeyframe');
    if (kfBtn) kfBtn.style.display = 'none';
    
    const kfToolbarBtn = document.querySelector('.top-dropdown-wrapper[data-menu="keyframeMenu"]');
    if (kfToolbarBtn) kfToolbarBtn.style.display = 'none';
    
    const kfPanel = document.querySelector('.keyframe-timeline-container');
    if (kfPanel) kfPanel.style.display = 'none';
    
    if (selectedBlock) {
        clearActiveHighlight();
        selectedBlock = null;
        selectedBlocksSet.clear();
        renderVariablesForBlock(null);
    }
    
    // 若开场动画仍在进行（其帧循环会每帧强写 camera.position / controls.target），先干净中止，
    // 否则画笔相机会被它每帧覆盖、无法稳定。finish 会还原 controls 并停止其 rAF。
    if (window.__introRunning && typeof window.__finishIntro === 'function') window.__finishIntro(true);

    // 画笔模式沿用模拟器统一的视角控制：左键旋转（含偏航）、右键平移、中键缩放；
    // 不特殊改写鼠标映射（右拖偏航会触发浏览器右键菜单，且和模拟器其它模式不一致）。
    // 仅初始给一个近正俯视机位（约 9° 俯角）便于描点；up 保持竖直 (0,1,0) 以让 OrbitControls 正常。
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    _brushSavedUp.copy(camera.up);
    const H = Math.max(8, camera.position.length());
    const _brushTilt = 0.01;   // ≈0.57°：视觉上直接垂直于 XZ 平面；不取 0 是因为正下方 up∥视线 朝向退化、且 OrbitControls 极点处偏航失效
    camera.up.set(0, 1, 0);
    camera.position.set(0, H * Math.cos(_brushTilt), H * Math.sin(_brushTilt));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    if (controls) {
        controls.target.set(0, 0, 0);
        // ★ 俯仰角锁定：只允许偏航（绕 Y 旋转方位角），不允许上下俯仰。
        // 把极角上下限都设为起始俯角，OrbitControls 拖拽时 phi 被钳制不动、仅 theta（偏航）生效。
        controls.minPolarAngle = _brushTilt;
        controls.maxPolarAngle = _brushTilt;
        try { controls.update(); } catch (e) {}
    }
    
    brushPoint1 = null;
    brushPoint2 = null;
    brushPoint3 = null;
    brushClickMode = null;
    brushPreviewPoint = null;
    brushSelectedBlock = null;
    hideBrushLine();
    clearBrushVertexMarkers();
    if (typeof ptClearRectSidePreview === 'function') ptClearRectSidePreview();

    // 画笔模式拆成两个子模式：默认「描点」，顶部工具栏可切到「生成方块」
    ptBrushMode = 'draw';
    // 点集主列表占用侧边「方块列表」区域：若未显示则切到方块列表视图
    const sl = document.getElementById('sideBlockList');
    if (sl && sl.style.display === 'none') { try { toggleBlockListSidebar(); } catch (e) {} }
    ptSyncPanel();


    showToast('🎨 画笔模式已开启：默认「描点」——选颜色后在网格上点击放点；顶部可切到「生成方块」');
}

function exitBrushMode() {
    isBrushMode = false;
    
    // 隐藏顶部工具栏中的画笔长度滑动条
    const blt = document.getElementById('brushLengthToolbar');
    if (blt) blt.style.display = 'none';
    
    const cb = document.getElementById('brushModeCheckbox');
    if (cb) { cb.classList.remove('checked'); cb.setAttribute('aria-pressed', 'false'); }
    
    document.querySelectorAll('.her-mode-btn').forEach(b => b.style.display = '');
    
    const kfBtn = document.getElementById('sideBlockKeyframe');
    if (kfBtn) kfBtn.style.display = '';
    
    const kfToolbarBtn = document.querySelector('.top-dropdown-wrapper[data-menu="keyframeMenu"]');
    if (kfToolbarBtn) kfToolbarBtn.style.display = '';
    
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.minPolarAngle = 0;
    // 退出画笔模式后还原为完整 180° 俯仰（0~π），与初始化保持一致；旧值 Math.PI/2.1 会限制俯仰。
    controls.maxPolarAngle = Math.PI;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    // 还原 camera.up（画笔模式不再翻转 up，此处保险还原），否则普通 3D 视角会歪
    camera.up.copy(_brushSavedUp);
    camera.updateMatrixWorld(true);
    
    brushPoint1 = null;
    brushPoint2 = null;
    brushPoint3 = null;
    brushClickMode = null;
    brushPreviewPoint = null;
    brushSelectedBlock = null;
    hideBrushLine();
    clearBrushVertexMarkers();
    if (typeof ptClearRectSidePreview === 'function') ptClearRectSidePreview();
    
    renderVariablesForBlock(null);

    updateToolbar(true); // 重新应用顶部变换工具栏（含文件夹模式下仅显示枢轴/旋转的隐藏规则）
    // 恢复变换 Gizmo 工具栏与分隔线
    const htb = document.getElementById('herTransformToolbar');
    if (htb) htb.style.display = '';
    const htd = document.getElementById('herToolbarDivider');
    if (htd) htd.style.display = '';
    // 退出画笔：侧边列表恢复为方块列表
    const sl = document.getElementById('sideBlockList');
    if (sl) renderSideBlockList();
    showToast('🎨 画笔模式已关闭');
}

function hideBrushLine() {
    if (brushLine) {
        scene.remove(brushLine);
        brushLine = null;
    }
    if (brushPreviewPlaneCenter) {
        scene.remove(brushPreviewPlaneCenter);
        brushPreviewPlaneCenter.geometry.dispose();
        brushPreviewPlaneCenter.material.dispose();
        brushPreviewPlaneCenter = null;
    }
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
}

/* 绿点（画笔模式下「选中方块」亮起的角点标记）的尺寸策略 —— 与「点」(ptUpdateMarkerSizes) 完全一致：
   几何按【基准世界边长】BRUSH_VERTEX_BASE 建一次，之后每帧按【相机距离】重算 scale，
   使它在屏幕上的像素边长恒为 BRUSH_VERTEX_TARGET_PX —— 即「随视角远近产生大小变化」：
   拉远不会缩成看不见、拉近不会糊成一坨（旧实现写死 0.2 世界单位，远近差异极大）。 */
const BRUSH_VERTEX_BASE = 0.2;         // 基准世界边长（几何尺寸，缩放前）
const BRUSH_VERTEX_TARGET_PX = 14;     // 目标屏幕边长(px)：想更大/更小改这里
let brushVertexWorldSize = BRUSH_VERTEX_BASE;   // 当前实际世界边长（射线阈值等处复用）

/* ★屏幕尺寸恒定的正确口径 = 用【视线方向的深度】，不是「到相机的直线距离」。
   透视投影的像素/世界 之比只由【相机空间的 −z（沿视轴的深度）】决定；画笔是近正俯视相机，
   地面点的视轴深度 ≈ 相机高度 H，而直线距离 = √(H²+r²)（r = 该点到画面中心的水平距离）。
   用直线距离会让「远离画面中心的角点」被放大 √(H²+r²)/H 倍 —— 实测 H=1 时画面边缘的绿点
   从 14px 涨到 32px。故统一走这个 helper（点与绿点共用）。 */
const _ptViewTmp = new THREE.Vector3();
function ptCamViewDepth(cam, v) {
    _ptViewTmp.copy(v).applyMatrix4(cam.matrixWorldInverse);
    return Math.max(1e-4, -_ptViewTmp.z);
}
function ptSyncCamInverse(cam) {
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
}

function renderBrushVertexMarkers() {
    clearBrushVertexMarkers();
    
    if (!brushSelectedBlock || !brushSelectedBlock.mesh || !brushSelectedBlock.mesh.matrixWorld) {
        return;
    }
    
    const corners = getBlockCorners(brushSelectedBlock);
    for (const corner of corners) {
        const markerSize = BRUSH_VERTEX_BASE;
        
        const borderGeo = new THREE.BufferGeometry();
        const borderVertices = new Float32Array([
            -markerSize/2, 0, -markerSize/2,
            markerSize/2, 0, -markerSize/2,
            markerSize/2, 0, markerSize/2,
            -markerSize/2, 0, markerSize/2,
            -markerSize/2, 0, -markerSize/2
        ]);
        borderGeo.setAttribute('position', new THREE.BufferAttribute(borderVertices, 3));
        const borderMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
        const border = new THREE.Line(borderGeo, borderMat);
        // ★只给【相对组原点的偏移】：组本身锚在角点上，之后每帧只改 scale，位置绝不动。
        //   （旧实现把角点世界坐标写进子节点 position，一旦给组加 scale 就会把角点整体推离原位。）
        border.position.set(0, 0.015, 0);
        border.rotation.x = -Math.PI / 2;
        border.userData = { role: 'border' };
        
        const innerGeo = new THREE.PlaneGeometry(markerSize * 0.6, markerSize * 0.6);
        const innerMat = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00, 
            transparent: true, 
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        inner.position.set(0, 0.01, 0);
        inner.rotation.x = -Math.PI / 2;
        inner.userData = { role: 'inner' };
        
        const marker = new THREE.Group();
        marker.position.set(corner.x, 0, corner.z);   // ★组锚在角点（世界），子节点只带微小 Y 偏移
        marker.add(border);
        marker.add(inner);
        marker.userData = { isBrushVertex: true, position: corner.clone(), block: brushSelectedBlock };
        
        scene.add(marker);
        brushVertexMarkers.push(marker);
    }
    updateBrushVertexMarkerSizes();   // 建好立刻按当前机位定一次尺寸
}

/* 每帧刷新绿点：① 世界边长 ∝ 相机距离（屏幕像素恒定）；② 把「该角点是否已被选中」反映到颜色上。
   选中判定 = 该角点在【绿点选区】ptVertexSelection 里（见 brushToggleVertexSelect：点绿点 = 选中该角点）。 */
function updateBrushVertexMarkerSizes() {
    if (!isBrushMode || !brushVertexMarkers.length) return;
    const cam = camera;
    const fh = (renderer && renderer.domElement) ? renderer.domElement.clientHeight : window.innerHeight;
    if (!fh) return;
    const tanHalf = Math.tan((cam.fov * Math.PI / 180) / 2);
    const K = (BRUSH_VERTEX_TARGET_PX * 2 * tanHalf) / fh;   // 世界边长/深度：px = S·fh/(2·depth·tanHalf) = TARGET
    ptSyncCamInverse(cam);
    let S0 = 0;
    for (const m of brushVertexMarkers) {
        const c = m.userData.position || m.position;
        const d = ptCamViewDepth(cam, c);                     // ★视线深度（不是直线距离）
        const S = Math.max(1e-5, K * d);
        if (!S0) S0 = S;
        m.scale.setScalar(S / BRUSH_VERTEX_BASE);
        const hovered = !!brushHoveredVertex &&
            Math.abs(brushHoveredVertex.x - c.x) < 1e-6 && Math.abs(brushHoveredVertex.z - c.z) < 1e-6;
        // 选中态只看【绿点选区】ptVertexSelection（角点不是点，不存在于 ptMarkers 里）
        const sel = !hovered && ptVertexSelection.some(v =>
            Math.abs(v.x - c.x) < 1e-6 && Math.abs(v.z - c.z) < 1e-6);
        m.traverse(obj => {
            if (!obj.material || !obj.material.color) return;
            const role = obj.userData.role;
            if (role === 'border') {
                obj.material.color.setHex(hovered ? 0xff0000 : 0x00ffff);
            } else if (role === 'inner') {
                obj.material.color.setHex(hovered ? 0xff0000 : (sel ? 0xffffff : 0x00ff00));
                obj.material.opacity = hovered ? 1 : (sel ? 0.95 : 0.6);
            } else if (role === 'glow') {
                obj.material.color.setHex(0x00ffff);
                obj.material.opacity = 0.4;
            }
        });
    }
    brushVertexWorldSize = S0 || BRUSH_VERTEX_BASE;
}

function clearBrushVertexMarkers() {
    for (const marker of brushVertexMarkers) {
        scene.remove(marker);
        marker.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }
    brushVertexMarkers = [];
    brushHoveredVertex = null;
}

function setBrushSelectedBlock(block) {
    // 换选中方块 ⇒ 旧方块的角点选区失效（角点是「某个方块」的角，不属于点集）
    if (brushSelectedBlock !== block) ptVertexSelection = [];
    brushSelectedBlock = block;
    renderBrushVertexMarkers();
}

function getBrushHitPoint(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    // ★线命中阈值必须跟【绿点当前的世界尺寸】成比例，且必须【小】：
    //   全局默认 1 个世界单位会让每个角点带上一个半径 1 的模糊命中圈（比绿点本身大 4~70 倍）。
    //   真正的点击判定已改走 brushPickVertexMarker（地面方块判定），这里只留一点贴合边缘的余量。
    raycaster.params.Line.threshold = Math.max(1e-5, (brushVertexWorldSize || BRUSH_VERTEX_BASE) * 0.15);
    
    const result = {
        type: 'none',
        point: null,
        marker: null,
        block: null
    };
    
    for (const m of brushVertexMarkers) {
        m.traverse(obj => {
            if (obj.material && obj.material.color) {
                const role = obj.userData.role;
                if (role === 'glow') {
                    obj.material.color.setHex(0x00ffff);
                    obj.material.opacity = 0.4;
                } else if (role === 'border') {
                    obj.material.color.setHex(0x00ffff);
                } else if (role === 'inner') {
                    obj.material.color.setHex(0x00ff00);
                    obj.material.opacity = 0.6;
                }
            }
        });
    }
    
    const markerIntersects = raycaster.intersectObjects(brushVertexMarkers, true);
    if (markerIntersects.length > 0) {
        let markerGroup = markerIntersects[0].object;
        while (markerGroup && !markerGroup.userData.isBrushVertex) {
            markerGroup = markerGroup.parent;
        }
        if (markerGroup) {
            brushHoveredVertex = markerGroup.userData.position;
            
            markerGroup.traverse(obj => {
                if (obj.material && obj.material.color) {
                    obj.material.color.setHex(0xff0000);
                    obj.material.opacity = 1;
                }
            });
            
            result.type = 'vertex';
            result.point = brushHoveredVertex.clone();
            result.marker = markerGroup;
            result.block = markerGroup.userData.block;
            return result;
        }
    }
    
    brushHoveredVertex = null;
    
    const blockMeshes = blocks
        .filter(b => b.mesh && b.type === 'cube')
        .map(b => b.mesh);
    
    const blockIntersects = raycaster.intersectObjects(blockMeshes);
    if (blockIntersects.length > 0) {
        const mesh = blockIntersects[0].object;
        const block = blocks.find(b => b.mesh === mesh);
        
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersectPoint);
        
        result.type = 'block';
        result.point = intersectPoint;
        result.block = block;
        return result;
    }
    
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectPoint);
    
    result.type = 'plane';
    result.point = intersectPoint;
    return result;
}

function getBlockCorners(block) {
    const corners = [];
    
    if (block.mesh) {
        block.mesh.updateMatrixWorld();
        const matrix = block.mesh.matrixWorld.clone();
        // ★多 cube 模型（旗帜）：block.mesh 是 Group（无 geometry），旧实现会掉进下方的
        //   「单位方块 ±0.5」兜底分支 ⇒ 绿点整体漂离旗面。旗帜的初始状态与方块不同
        //   （旗面是 1.0(X)×2.0(Z) 的倾斜薄板 + 两根旗杆固定 cube），不能套用方块那一套。
        //   这里只取【主 cube（旗面，即 XZ 投影面积最大者）】的顶点做投影去重：旗杆 cube
        //   不参与，绿点才会落在真实旗面顶点上（旗杆的竖直段会往外多出一截 Z，不能并进来）。
        if (block.meshes && block.meshes.length > 1) {
            let main = null, bestArea = -1;
            for (const m of block.meshes) {
                if (!m.geometry || !m.geometry.attributes || !m.geometry.attributes.position) continue;
                const p = m.geometry.attributes.position;
                let ax0 = Infinity, ax1 = -Infinity, az0 = Infinity, az1 = -Infinity;
                for (let i = 0; i < p.count; i++) {
                    ax0 = Math.min(ax0, p.getX(i)); ax1 = Math.max(ax1, p.getX(i));
                    az0 = Math.min(az0, p.getZ(i)); az1 = Math.max(az1, p.getZ(i));
                }
                const area = (ax1 - ax0) * (az1 - az0);
                if (area > bestArea) { bestArea = area; main = m; }
            }
            if (main) {
                main.updateMatrixWorld(true);
                const mw = main.matrixWorld;
                const pos = main.geometry.attributes.position;
                // ★旗面是【极薄且带倾角的斜板】：8 个顶点 = 4 个真实旗面角点 × 2 个厚度面。
                //   两面在 XZ 投影上只差 ~0.001（厚度的水平分量），6 位小数去重根本合并不掉 ⇒
                //   会得到 8 个「两两近乎重合」的点。
                //   ★不能反过来按「板法线正侧」筛面：旗面沿长度方向有 ~0.04 的倾角落差，四个
                //   角点各自处在不同的世界高度，按法线筛只会筛掉一半角点（实测只剩 2 个角 ×2 份）。
                //   正确做法：按 XZ 位置做【带容差的聚类】，≈0.05 以内视为同一个角点、每簇取代表，
                //   ⇒ 恰好 4 个真实旗面顶点（厚度水平分量 ~0.001 远小于容差，旗杆 cube 已在上面被排除）。
                const CORNER_EPS = 0.05;
                for (let i = 0; i < pos.count; i++) {
                    const w = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mw);
                    w.y = 0;
                    let dup = null;
                    for (const c of corners) {
                        if (Math.hypot(c.x - w.x, c.z - w.z) < CORNER_EPS) { dup = c; break; }
                    }
                    if (!dup) corners.push(w);
                }
            }
            return corners;
        }
        const geometry = block.mesh.geometry;
        
        if (geometry && geometry.attributes && geometry.attributes.position) {
            const positions = geometry.attributes.position;
            const uniquePositions = new Set();
            
            for (let i = 0; i < positions.count; i++) {
                const localPos = new THREE.Vector3(
                    positions.getX(i),
                    positions.getY(i),
                    positions.getZ(i)
                );
                const worldPos = localPos.applyMatrix4(matrix);
                worldPos.y = 0;
                
                const key = `${worldPos.x.toFixed(6)},${worldPos.z.toFixed(6)}`;
                if (!uniquePositions.has(key)) {
                    uniquePositions.add(key);
                    corners.push(worldPos.clone());
                }
            }
        } else {
            const positions = [
                new THREE.Vector3(-0.5, 0, -0.5),
                new THREE.Vector3(0.5, 0, -0.5),
                new THREE.Vector3(0.5, 0, 0.5),
                new THREE.Vector3(-0.5, 0, 0.5)
            ];
            
            for (const pos of positions) {
                const worldPos = pos.clone().applyMatrix4(matrix);
                worldPos.y = 0;
                corners.push(worldPos);
            }
        }
    }
    
    return corners;
}

// 地面平面（y=0）：描点落点 / 角点判定共用，避免每次 new
const _ptGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/* ★命中「绿点」【不走射线】：把点击投到地面 y=0，再看落进哪个绿方块 → 返回它的 Group。
   旧实现用 raycaster.intersectObjects(brushVertexMarkers, true) —— 外框是 THREE.Line，
   而 raycaster.params.Line.threshold 是【全局默认 1 个世界单位】（getBrushHitPoint 里那份比例阈值
   只作用于它自己 new 的 Raycaster，管不到这里的全局 raycaster），与绿点随缩放变化的实际尺寸
   （0.014~0.23）彻底脱钩 ⇒ 每个角点都有一个半径 1 的模糊命中圈，相邻角点被一起命中，
   最后只能按「沿射线的距离」取 hits[0] —— 近正俯视下这个距离几乎一样，于是稳定偏向
   【XZ 更大的那个角点】，表现就是用户报的「打偏」。
   现在：命中区 = 屏幕上看到的那个方块本身（半边长再留 15% 余量），多个候选取【离角点中心最近】的，
   判定与视觉严格一一对应，且与相机角度、缩放完全无关。 */
const BRUSH_VERTEX_PICK_PAD = 1.15;    // 命中区相对视觉方块的余量（1 = 严丝合缝）
function brushPickVertexMarker() {
    if (!brushVertexMarkers.length) return null;
    const gp = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(_ptGroundPlane, gp)) return null;
    const half = Math.max(1e-6, brushVertexWorldSize * 0.5 * BRUSH_VERTEX_PICK_PAD);
    let best = null, bestD = Infinity;
    for (const m of brushVertexMarkers) {
        const c = m.userData.position;
        if (!c) continue;
        if (Math.abs(gp.x - c.x) > half || Math.abs(gp.z - c.z) > half) continue;
        const d = Math.hypot(gp.x - c.x, gp.z - c.z);
        if (d < bestD) { bestD = d; best = m; }   // ★歧义（相邻角点区重叠）取最近的角点中心
    }
    return best;
}

