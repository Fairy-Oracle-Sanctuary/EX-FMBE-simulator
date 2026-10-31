/* 06-gizmo/03-rebuild-and-vertex-snap.js · 源 测试版v.6b79.html 第 31495-32071 行 */
'use strict';
// ---------- 屏幕坐标辅助 ----------
function screenAxis(meta) {
    const rect = renderer.domElement.getBoundingClientRect();
    const c = gizmoRoot.position.clone();
    const p1 = c.clone().project(camera);
    const p2 = c.clone().add(meta.axis.clone().normalize()).project(camera);
    const sx = (p2.x - p1.x) * rect.width * 0.5;
    const sy = -(p2.y - p1.y) * rect.height * 0.5;
    const len = Math.hypot(sx, sy) || 1;
    return { x: sx / len, y: sy / len };
}

function screenAngleFor(meta, clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const center = meta.centerWorld ? meta.centerWorld.clone()
        : (meta.folder ? folderGizmoCenterWorld(meta.folderName) : rotGizmoCenterWorld(selected(), meta.rotMode));
    const normal = meta.axisNormal?.clone().normalize() || new THREE.Vector3(0,0,1);
    const viewDir = camera.position.clone().sub(center).normalize();
    const xb = meta.xBasis?.clone().normalize() || new THREE.Vector3(1,0,0);
    const yb = meta.yBasis?.clone().normalize() || new THREE.Vector3(0,1,0);
    const screenFallback = () => {
        const c = center.clone().project(camera);
        const cx = (c.x * 0.5 + 0.5) * rect.width + rect.left;
        const cy = (-c.y * 0.5 + 0.5) * rect.height + rect.top;
        const px = center.clone().add(xb).project(camera);
        const py = center.clone().add(yb).project(camera);
        const ux = { x: (px.x - c.x) * rect.width * 0.5, y: -(px.y - c.y) * rect.height * 0.5 };
        const uy = { x: (py.x - c.x) * rect.width * 0.5, y: -(py.y - c.y) * rect.height * 0.5 };
        const vx = clientX - cx, vy = clientY - cy;
        return Math.atan2(vx * uy.x + vy * uy.y, vx * ux.x + vy * ux.y);
    };
    if (Math.abs(normal.dot(viewDir)) < 0.18) return screenFallback();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return screenFallback();
    const v = hit.sub(center);
    if (v.lengthSq() < 1e-6) return screenFallback();
    return Math.atan2(v.dot(yb), v.dot(xb));
}

function screenTangentDelta(meta, clientX, clientY, dx, dy) {
    const rect = renderer.domElement.getBoundingClientRect();
    const center = rotGizmoCenterWorld(selected(), meta.rotMode);
    const c = center.clone().project(camera);
    const cx = (c.x * 0.5 + 0.5) * rect.width + rect.left;
    const cy = (-c.y * 0.5 + 0.5) * rect.height + rect.top;
    const rx = clientX - cx, ry = clientY - cy;
    let r = Math.hypot(rx, ry);
    let tx, ty;
    if (r > 8) { tx = -ry / r; ty = rx / r; }
    else {
        const xb = meta.xBasis?.clone().normalize() || new THREE.Vector3(1,0,0);
        const px = center.clone().add(xb).project(camera);
        tx = (px.x - c.x) * rect.width * 0.5;
        ty = -(px.y - c.y) * rect.height * 0.5;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl; r = 90;
    }
    const tangentPx = dx * tx + dy * ty;
    const xb = meta.xBasis?.clone().normalize() || new THREE.Vector3(1,0,0);
    const yb = meta.yBasis?.clone().normalize() || new THREE.Vector3(0,1,0);
    const radius = Number(meta.radius || 2.05);
    const px = center.clone().addScaledVector(xb, radius).project(camera);
    const py = center.clone().addScaledVector(yb, radius).project(camera);
    const lx = Math.hypot((px.x - c.x) * rect.width * 0.5, (px.y - c.y) * rect.height * 0.5);
    const ly = Math.hypot((py.x - c.x) * rect.width * 0.5, (py.y - c.y) * rect.height * 0.5);
    const screenRadius = Math.max(48, Math.min(260, (lx + ly) * 0.5 || r || 90));
    let da = tangentPx / screenRadius;
    if (!Number.isFinite(da) || Math.abs(da) < 1e-6) {
        const moved = Math.hypot(dx, dy);
        if (moved > 0.01) da = (dx - dy) * 0.006;
    }
    return da;
}

// ---------- 主重建 ----------
function clearGizmo() {
    clearActiveHighlight();
    stretchGizmoRefs = null;
    plgGizmoRefs = null;
    plgDrag = null;
    plgHoverKind = null;
    plgHideOverlay();
    rotArcGroups = [];
    gizmoArrowGroups = [];
    originCenterLineObj = null;
    gizmoAxisLines = [];
    folderScaleGroups.length = 0;
    while (gizmoRoot.children.length) {
        const child = gizmoRoot.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        gizmoRoot.remove(child);
    }
    pickables.length = 0;
}
// ==================== 顶点捕捉（快捷键 X）====================
// 数学语义：把选中方块集合的「接合点」（集合内某个方块的真实渲染顶点）平移到另一个方块的
// 真实渲染顶点（目标点）上，使两点世界坐标完全重合。
// 两种写入方式（按钮下拉可切换，默认位移移动型）：
//   · 位移移动型对齐：枢轴(xpos)不变，写 basepos —— worldToBasepos 逆变换后模型整体平移
//   · 枢轴移动型对齐：basepos 不变，直接加 x/y/zpos
//   · 沿边对齐（edge）：不移动，只旋转 —— 取两根线段（源=集合上的两点、目标=另一方块上的两点），
//     把集合绕第一个源点刚体旋转到「源线段 ∥ 目标线段」（见下方 vtxSnapEdge*）
// 顶点一律取自渲染网格：geometry.position × mesh.matrixWorld（直接复用渲染时已算好的世界矩阵），
// 因此旗帜 / 楼梯等不规则模型的顶点与屏幕上看到的完全一致，不需要再按 ±0.5 单位立方体推算。
const VTX_SNAP_PICK_PX = 12;     // 顶点拾取半径（屏幕像素）
const VTX_SNAP_MAX = 20000;      // 单次最多渲染 / 参与拾取的顶点数
let vtxSnapPhase = 0;            // 0=未激活 1=选接合点 2=选目标点
let vtxSnapMoveType = 'base';    // 'base' 位移移动型 | 'pivot' 枢轴移动型 | 'edge' 沿边对齐 | 'pivotpt' 枢轴改到顶点
let vtxSnapSet = [];             // 参与捕捉的方块集合（= 当前多选）
let vtxSnapSetIds = '';          // 集合签名（选区变化时重建流程）
let vtxSnapJoint = null;         // 接合点 { blockId, world }
let vtxSnapCands = [];           // 当前可选顶点 [{ blockId, world }]
let vtxSnapHover = -1;
let vtxSnapRoot = null;
let vtxSnapDots = null, vtxSnapHoverDot = null, vtxSnapJointDot = null;
let vtxSnapDotsHidden = null;    // 相机视角里看不到的候选顶点（淡紫，见 vtxSnapFillDotLayers）
let vtxSnapPickMarks = null;     // 镜像「三点定面」借用的已选点标记（容量 3；与捕捉图层同套样式）
let vtxSnapEdgeSrc = null, vtxSnapEdgeDst = null; // 沿边对齐：源线段两点 / 目标线段两点
// 沿边对齐的五步流程（0=未开始 1=选源点1 2=选源点2 3=点目标方块 4=选目标点1 5=选目标点2）
let vtxSnapEdge = null;          // { step, p1, p2, t1, t2 }（世界坐标）
let vtxSnapBase = null;          // 对齐快照：{ blocks:[{b, pre}], delta, type }
let vtxSnapPivotBase = null;     // 「枢轴改到顶点」快照：{ target, blocks:[{b, pre, w0}], skipped }
/* ★ 一次捕捉 = 一条撤销记录。X/Y/Z 轴反复开关只是修正同一次捕捉，
   不能再追加撤销记录（旧实现每次 apply 都 recordAction()，apply 与关轴间隔 >200ms 时会落成
   两条记录 ⇒ Ctrl+Z 只回到「刚捕捉完、轴还没关」的样子，用户以为「撤回不了」）。 */
let vtxSnapRecorded = false;
// ---- 测长 / 测角（下拉第五、六项）----
let vtxSnapMeasurePts = [];      // 本轮已取的点 [{ blockId, vi, world }]（最多 3）
let vtxSnapMeasureExtra = [];    // 临时加入顶点候选的方块（不改选区，用于跨模型测量）
let vtxSnapMeasureTemp = null;   // 取点过程中的临时连线（有厚度的布带）
let vtxSnapMeasureTempHalo = null; // 临时连线的深/浅色衬底（任何底色上都看得见）
let measures = [];               // 持久测量数据 [{ id, type:'len'|'ang', pts:[{blockId,vi}], 视觉对象... }]
let measureSeq = 0;
let measureRoot = null;          // 测量图层（挂 scene，不随顶点捕捉退出而消失）
let _measureSnapJson = null, _measureSnapArr = null;
let vtxSnapTargetBlockId = null; // 第二步「被指定为目标」的方块：只有它的顶点会被渲染
let vtxSnapMask = { x: true, y: true, z: true };

/* 选了接合点之后（第二步），参与捕捉的方块线框才切成紫色：
   这一步的集合是「正在被移动的一方」、目标方块是「参照物」，都不该再读成普通选中（黄色）。
   第一步选区仍是普通选中，保持黄色。 */
const VTX_SNAP_WIRE = 0xa855f7;
/* 被挡住的顶点用淡紫：与「能直接看到」的亮青区分开，又不至于和上方紫色目标线框混淆 */
const VTX_SNAP_HIDDEN = 0xc4b5fd;
function vtxSnapWireColorOf(b) {
    if (vtxSnapPhase !== 2 || !b) return 0xffaa00;
    return (vtxSnapSet.includes(b) || b.id === vtxSnapTargetBlockId) ? VTX_SNAP_WIRE : 0xffaa00;
}
function vtxSnapPaintWire(b) {
    const wf = b && b.selectionWireframe;
    if (wf) wf.material.color.setHex(vtxSnapWireColorOf(b));
}
function vtxSnapPaintSetWire() {
    vtxSnapSet.forEach(b => { if (selectedBlocksSet.has(b)) vtxSnapPaintWire(b); });
}
const _vtxProj = new THREE.Vector3();
let _vtxDotTex = null;
let _vtxSnapSig = NaN;           // 候选顶点的矩阵校验和（变化时才重建，见 vtxSnapAutoRefresh）
let _vtxSnapCamSig = NaN;        // 相机校验和（转视角后重新判定遮挡色：淡紫 / 亮青）
let _vtxSnapClsAt = 0;           // 上一次遮挡判定的时间戳（相机变化时按 10fps 节流）
// 顶点标记贴图（深色描边 + 白色实心方块，白色部分由材质 tint）—— 顶点用 Points 渲染，天然跟随屏幕像素大小。
// ★ 必须有描边：纯色小点在深浅场景里都会糊进背景，深色描边让它在任何底色上都是一枚清晰的"钉子"。
function vtxSnapDotTexture() {
    if (_vtxDotTex) return _vtxDotTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    /* ★【2026-10-30 用户要求】圆点改成正方形（小圆角只为抗锯齿），描边仍保持细（6/64 边长）：
       外框从 1 留白到 63、白芯从 7 到 57。 */
    const sq = (inset, r) => {
        const a = inset, w = 64 - inset * 2;
        g.beginPath();
        if (g.roundRect) g.roundRect(a, a, w, w, r);
        else { g.moveTo(a + r, a); g.lineTo(a + w - r, a); g.lineTo(a + w, a + r); g.lineTo(a + w, a + w - r); g.lineTo(a + w - r, a + w); g.lineTo(a + r, a + w); g.lineTo(a, a + w - r); g.lineTo(a, a + r); g.closePath(); }
    };
    sq(1, 4); g.fillStyle = 'rgba(15,23,42,0.85)'; g.fill();   // 深色描边
    sq(7, 2); g.fillStyle = '#fff'; g.fill();                  // 高亮芯（乘 tint）
    _vtxDotTex = new THREE.CanvasTexture(c);
    return _vtxDotTex;
}
function vtxSnapSetBlocks() {
    const arr = Array.from(selectedBlocksSet || []).filter(b => b && b.scope);
    if (arr.length) return arr;
    const s = selected();
    return s && s.scope ? [s] : [];
}
// 取方块真实渲染顶点（世界坐标）：遍历 getMeshes()，对每个 geometry.position 施加 mesh.matrixWorld
function vtxSnapBlockVerts(b) {
    const out = [];
    if (!b || !b.mesh) return out;
    b.mesh.updateMatrixWorld(true);
    let meshes = (typeof b.getMeshes === 'function' ? b.getMeshes() : (b.meshes || [])) || [];
    /* ★【2026-10-24 设置「关闭旗杆顶点捕捉」】旗帜模型由 3 个 cube 组成（竖直旗杆 / 水平旗杆 / 旗面），
       开启该设置后只取【旗面】那一个 cube 的顶点 —— 判定口径与 getBlockCorners 一致：
       旗帜内部 XZ 投影面积最大的 cube 即旗面；旗杆两段不计入，候选点上不再出现旗杆顶点。 */
    if (flagPoleSnapOff && b.type === 'flag' && meshes.length > 1) {
        let main = null, bestArea = -1;
        for (const m of meshes) {
            const p = m.geometry && m.geometry.attributes && m.geometry.attributes.position;
            if (!p) continue;
            let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
            for (let i = 0; i < p.count; i++) {
                x0 = Math.min(x0, p.getX(i)); x1 = Math.max(x1, p.getX(i));
                z0 = Math.min(z0, p.getZ(i)); z1 = Math.max(z1, p.getZ(i));
            }
            const area = (x1 - x0) * (z1 - z0);
            if (area > bestArea) { bestArea = area; main = m; }
        }
        if (main) meshes = [main];
    }
    const seen = new Set();
    const pushWorld = (x, y, z, mw) => {
        const v = new THREE.Vector3(x, y, z).applyMatrix4(mw);
        const k = v.x.toFixed(4) + ',' + v.y.toFixed(4) + ',' + v.z.toFixed(4); // 去重（多面共享顶点）
        if (seen.has(k)) return;
        seen.add(k);
        out.push(v);
    };
    for (const m of meshes) {
        m.updateMatrixWorld(true);
        const mw = m.matrixWorld;
        /* ★【2026-10-30 掉落物】掉落物几何是按像素挤出的，每个像素格四角都是几何顶点，
           直接遍历 position 会让整块板子内部铺满圆点（用户反馈「为什么内部也显示顶点」）。
           生成几何时已算好「剪影角点」（只有轮廓转角），这里优先用它 —— 顶点捕捉语义：
           只有边缘（轮廓）的顶点才显示。 */
        const ds = m.geometry && m.geometry.userData && m.geometry.userData.dropSnapPoints;
        if (ds) {
            for (let i = 0; i < ds.length; i += 3) pushWorld(ds[i], ds[i + 1], ds[i + 2], mw);
            continue;
        }
        const pos = m.geometry && m.geometry.attributes && m.geometry.attributes.position;
        if (!pos) continue;
        for (let i = 0; i < pos.count; i++) pushWorld(pos.getX(i), pos.getY(i), pos.getZ(i), mw);
    }
    return out;
}
function vtxSnapEnsureRoot() {
    if (vtxSnapRoot) return;
    const tex = vtxSnapDotTexture();
    const make = (color, size, count) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        g.setDrawRange(0, 0);
        const m = new THREE.PointsMaterial({ color, size, map: tex, sizeAttenuation: false, transparent: true, alphaTest: 0.3, depthTest: false, depthWrite: false });
        const p = new THREE.Points(g, m);
        p.renderOrder = 998;
        p.frustumCulled = false;
        return p;
    };
    vtxSnapRoot = new THREE.Group();
    vtxSnapDots = make(0x67e8f9, 8, VTX_SNAP_MAX);    // 候选顶点（亮青）
    vtxSnapDotsHidden = make(VTX_SNAP_HIDDEN, 8, VTX_SNAP_MAX); // 相机看不到的候选顶点（淡紫）
    vtxSnapDotsHidden.renderOrder = 997;              // 压在亮青点下面：重叠时以「能看见的顶点」为准
    /* ★【2026-10-30 用户要求】候选点整体降低存在感：亮青半透明，被挡住的淡紫更透（它只是提示，不该抢视线） */
    vtxSnapDots.material.opacity = 0.7;
    vtxSnapDotsHidden.material.opacity = 0.35;
    vtxSnapDots.material.alphaTest = 0.12;            // 低透明度下仍保留抗锯齿边缘（过高的 alphaTest 会把边缘切硬）
    vtxSnapDotsHidden.material.alphaTest = 0.12;
    vtxSnapHoverDot = make(0xffffff, 12, 1);          // 鼠标悬停顶点（白）
    vtxSnapJointDot = make(0xfbbf24, 14, 1);          // 已选接合点（橙）
    vtxSnapPickMarks = make(0xfbbf24, 14, 3);         // 镜像三点定面：已选的 3 个顶点（橙）
    vtxSnapEdgeSrc = make(0xfbbf24, 14, 2);           // 沿边对齐：源线段两端点（橙）
    vtxSnapEdgeDst = make(0xa855f7, 14, 2);           // 沿边对齐：目标线段两端点（紫，与目标线框同色）
    // 测长 / 测角取点期间的临时连线（最多两段：角的两条边）
    /* ★ WebGL 的 LineBasicMaterial 线宽在多数平台恒为 1px（几乎看不见），
       所以测量连线一律用「面向相机的布带网格」：宽度按像素换算成世界尺寸，
       近距离变细、远距离变粗，屏幕上始终是固定的几像素。 */
    vtxSnapMeasureTempHalo = new THREE.Mesh(measureRibbonGeometry(2), measureHaloMaterial());
    vtxSnapMeasureTempHalo.renderOrder = 1000;
    vtxSnapMeasureTempHalo.frustumCulled = false;
    vtxSnapMeasureTemp = new THREE.Mesh(measureRibbonGeometry(2), measureLineMaterial());
    vtxSnapMeasureTemp.renderOrder = 1001;
    vtxSnapMeasureTemp.frustumCulled = false;
    vtxSnapRoot.add(vtxSnapDots, vtxSnapDotsHidden, vtxSnapHoverDot, vtxSnapJointDot, vtxSnapPickMarks, vtxSnapEdgeSrc, vtxSnapEdgeDst, vtxSnapMeasureTempHalo, vtxSnapMeasureTemp);
    scene.add(vtxSnapRoot);
}
function vtxSnapBuildCands() {
    vtxSnapCands = [];
    vtxSnapHover = -1;
    const setIds = new Set(vtxSnapSet.map(b => b.id));
    if (vtxSnapPhase === 1) {
        /* 第一步：渲染「被选中的方块集合」的顶点；测长 / 测角允许把其它模型临时加入候选
           （点击方块本体即可加进来，用于跨模型测量），候选里带 vi = 该顶点在
           vtxSnapBlockVerts 结果里的下标 —— 测量数据靠 blockId + vi 锚定，实时跟随方块。 */
        const list = (vtxSnapMoveType === 'len' || vtxSnapMoveType === 'ang')
            ? vtxSnapSet.concat(vtxSnapMeasureExtra)
            : vtxSnapSet;
        for (const b of list) {
            if (!b || isBlockInHiddenGroup(b)) continue;
            const vs = vtxSnapBlockVerts(b);
            for (let vi = 0; vi < vs.length; vi++) {
                if (vtxSnapCands.length >= VTX_SNAP_MAX) break;
                vtxSnapCands.push({ blockId: b.id, vi, world: vs[vi] });
            }
        }
    } else {
        /* 第二步：只渲染「已被指定为目标」那一个方块的顶点。
           不把全场方块的顶点全铺出来 —— 那样画面上全是点，根本分不清哪个能点；
           用户先点一下要用的方块（指定目标），才出现它的顶点，再从里面挑目标点。 */
        const tb = vtxSnapTargetBlockOf();
        if (tb) {
            const vs = vtxSnapBlockVerts(tb);
            for (let vi = 0; vi < vs.length; vi++) {
                if (vtxSnapCands.length >= VTX_SNAP_MAX) break;
                vtxSnapCands.push({ blockId: tb.id, vi, world: vs[vi] });
            }
        }
    }
}
// 当前指定的目标方块（必须在集合之外、可见）
function vtxSnapTargetBlockOf() {
    if (!vtxSnapTargetBlockId) return null;
    const b = blocks.find(x => x.id === vtxSnapTargetBlockId);
    if (!b || isBlockInHiddenGroup(b) || vtxSnapSet.includes(b)) return null;
    return b;
}
// 射线命中哪一枚方块本体（用来区分「点到方块」与「点到空白」，以及第二步指定目标方块）
function vtxSnapPickBlock(cx, cy) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const meshes = [];
    for (const b of blocks) {
        if (!b.mesh || isBlockInHiddenGroup(b)) continue;
        b.mesh.updateMatrixWorld(true);
        for (const m of b.getMeshes()) meshes.push(m);
    }
    const hits = meshes.length ? raycaster.intersectObjects(meshes) : [];
    if (!hits.length) return null;
    const obj = hits[0].object;
    return blocks.find(b => b.getMeshes().includes(obj)) || null;
}
// 指定目标方块：只有它的顶点会被渲染出来，供选取目标点
function vtxSnapSetTarget(b) {
    if (!b || vtxSnapTargetBlockId === b.id) return;
    vtxSnapClearTarget();
    vtxSnapTargetBlockId = b.id;
    /* 目标方块用紫色线框标注（黄色在本模拟器里代表「被选中」，这里它只是捕捉对象） */
    b.updateSelectionHighlight(true);
    vtxSnapPaintWire(b);
    vtxSnapBuildCands();
    vtxSnapRender();
}
function vtxSnapClearTarget() {
    if (!vtxSnapTargetBlockId) return;
    const old = blocks.find(x => x.id === vtxSnapTargetBlockId);
    vtxSnapTargetBlockId = null;
    // 目标方块不是选区成员 → 它的线框只是捕捉辅助，撤掉
    if (old && !selectedBlocksSet.has(old)) old.updateSelectionHighlight(false);
}
/* ★【2026-10-30 遮挡可见性】顶点在相机视角里看不到时改用淡紫色显示：
   判据 = 从相机往顶点打一条射线，若在到达顶点之前先撞到方块网格（自己的背面 / 前方别的方块）
   就说明它被挡住；相机背后的顶点同样算不可见。 */
const _occRay = new THREE.Raycaster();
const _occCam = new THREE.Vector3();
const _occFwd = new THREE.Vector3();
const _occDir = new THREE.Vector3();
// 遮挡物 = 当前场景里所有可见的方块网格（隐藏文件夹 / 隐藏方块不参与遮挡）
function vtxSnapOccluderMeshes() {
    const meshes = [];
    for (const b of blocks) {
        if (!b || !b.mesh || isBlockInHiddenGroup(b)) continue;
        b.mesh.updateMatrixWorld(true);
        for (const m of b.getMeshes()) if (m && m.visible) meshes.push(m);
    }
    return meshes;
}
function vtxSnapVertexHidden(w, meshes) {
    _occDir.copy(w).sub(_occCam);
    if (_occDir.dot(_occFwd) < 0) return true;   // 相机背后：画面上看不到
    const dist = _occDir.length();
    if (dist < 1e-5) return false;
    _occDir.divideScalar(dist);
    _occRay.set(_occCam, _occDir);
    _occRay.near = 0;
    /* far 停在顶点前一点点：顶点本身就在方块表面上，射线正好打在自己所在的面不算遮挡 */
    _occRay.far = Math.max(0, dist - 0.002);
    return _occRay.intersectObjects(meshes, false).length > 0;
}
// 把候选顶点按可见性分到两套 Points 图层（亮青 = 看得见 / 淡紫 = 被挡住）
function vtxSnapFillDotLayers(cands, n) {
    if (!vtxSnapDots || !vtxSnapDotsHidden) return;
    const va = vtxSnapDots.geometry.attributes.position.array;
    const ha = vtxSnapDotsHidden.geometry.attributes.position.array;
    const meshes = vtxSnapOccluderMeshes();
    camera.getWorldPosition(_occCam);
    camera.getWorldDirection(_occFwd);
    let nv = 0, nh = 0;
    for (let i = 0; i < n; i++) {
        const w = cands[i].world;
        if (vtxSnapVertexHidden(w, meshes)) {
            if (nh >= VTX_SNAP_MAX) continue;
            const k = nh++;
            ha[k * 3] = w.x; ha[k * 3 + 1] = w.y; ha[k * 3 + 2] = w.z;
        } else {
            if (nv >= VTX_SNAP_MAX) continue;
            const k = nv++;
            va[k * 3] = w.x; va[k * 3 + 1] = w.y; va[k * 3 + 2] = w.z;
        }
    }
    vtxSnapDots.geometry.attributes.position.needsUpdate = true;
    vtxSnapDots.geometry.setDrawRange(0, nv);
    vtxSnapDotsHidden.geometry.attributes.position.needsUpdate = true;
    vtxSnapDotsHidden.geometry.setDrawRange(0, nh);
}
function vtxSnapRender() {
    if (!vtxSnapRoot) return;
    vtxSnapFillDotLayers(vtxSnapCands, Math.min(vtxSnapCands.length, VTX_SNAP_MAX));
    // 接合点
    const jp = vtxSnapJointDot.geometry.attributes.position;
    if (vtxSnapJoint) {
        jp.array[0] = vtxSnapJoint.world.x; jp.array[1] = vtxSnapJoint.world.y; jp.array[2] = vtxSnapJoint.world.z;
        jp.needsUpdate = true;
        vtxSnapJointDot.geometry.setDrawRange(0, 1);
    } else {
        vtxSnapJointDot.geometry.setDrawRange(0, 0);
    }
    vtxSnapHoverDot.geometry.setDrawRange(0, 0);
    vtxSnapEdgeRenderMarks();
    vtxSnapMeasureRenderPending();
}
// 沿边对齐：把已选的源线段 / 目标线段端点画成橙 / 紫两组标记（其余模式保持空）
function vtxSnapEdgeRenderMarks() {
    if (!vtxSnapEdgeSrc || !vtxSnapEdgeDst) return;
    const e = vtxSnapMoveType === 'edge' ? vtxSnapEdge : null;
    const put = (obj, vecs) => {
        const p = obj.geometry.attributes.position;
        for (let i = 0; i < vecs.length; i++) {
            p.array[i * 3] = vecs[i].x; p.array[i * 3 + 1] = vecs[i].y; p.array[i * 3 + 2] = vecs[i].z;
        }
        p.needsUpdate = true;
        obj.geometry.setDrawRange(0, vecs.length);
    };
    put(vtxSnapEdgeSrc, e ? [e.p1, e.p2].filter(Boolean) : []);
    put(vtxSnapEdgeDst, e ? [e.t1, e.t2].filter(Boolean) : []);
}
// 测长 / 测角：把本轮已取的点画成橙色标记 + 临时连线（其余模式保持空）
function vtxSnapMeasureRenderPending() {
    if (!vtxSnapPickMarks || !vtxSnapMeasureTemp) return;
    const on = (vtxSnapMoveType === 'len' || vtxSnapMoveType === 'ang');
    const pts = on ? vtxSnapMeasurePts : [];
    const mp = vtxSnapPickMarks.geometry.attributes.position;
    for (let i = 0; i < pts.length; i++) {
        mp.array[i * 3] = pts[i].world.x; mp.array[i * 3 + 1] = pts[i].world.y; mp.array[i * 3 + 2] = pts[i].world.z;
    }
    mp.needsUpdate = true;
    vtxSnapPickMarks.geometry.setDrawRange(0, pts.length);
    // 临时线：测长 = 两点一段；测角 = 顶点（第 2 点）连到第 1 / 第 3 点（两段）
    const pairs = [];
    if (on && pts.length >= 2) {
        pairs.push([pts[1].world, pts[0].world]);
        if (vtxSnapMoveType === 'ang' && pts[2]) pairs.push([pts[1].world, pts[2].world]);
    }
    const halo = vtxSnapMeasureTempHalo;
    vtxSnapMeasureTemp.visible = pairs.length > 0;
    if (halo) halo.visible = pairs.length > 0;
    for (let i = 0; i < pairs.length; i++) {
        measureRibbonWrite(vtxSnapMeasureTemp.geometry, i, pairs[i][0], pairs[i][1], MEASURE_LINE_PX);
        if (halo) measureRibbonWrite(halo.geometry, i, pairs[i][0], pairs[i][1], MEASURE_LINE_PX + MEASURE_HALO_PX);
    }
    vtxSnapMeasureTemp.geometry.setDrawRange(0, pairs.length * 6);
    if (halo) halo.geometry.setDrawRange(0, pairs.length * 6);
}
// 屏幕空间最近顶点：返回候选索引，超出拾取半径返回 -1
// list 可选：镜像「三点定面」传入自己的候选集，其余调用照旧用 vtxSnapCands
function vtxSnapPick(cx, cy, list) {
    const cands = list || vtxSnapCands;
    if (!cands.length) return -1;
    const rect = renderer.domElement.getBoundingClientRect();
    const lx = cx - rect.left, ly = cy - rect.top;
    let best = -1, bd = Infinity;
    for (let i = 0, n = Math.min(cands.length, VTX_SNAP_MAX); i < n; i++) {
        _vtxProj.copy(cands[i].world).project(camera);
        if (_vtxProj.z > 1) continue; // 近平面之后（镜像坐标）不参与
        const dx = (_vtxProj.x * 0.5 + 0.5) * rect.width - lx;
        const dy = (-_vtxProj.y * 0.5 + 0.5) * rect.height - ly;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
    }
    return bd <= VTX_SNAP_PICK_PX * VTX_SNAP_PICK_PX ? best : -1;
}
function vtxSnapHoverAt(cx, cy) {
    if (!vtxSnapPhase || !vtxSnapRoot) return;
    const i = vtxSnapPick(cx, cy);
    if (i === vtxSnapHover) return;
    vtxSnapHover = i;
    if (i < 0) { vtxSnapHoverDot.geometry.setDrawRange(0, 0); return; }
    const w = vtxSnapCands[i].world;
    const p = vtxSnapHoverDot.geometry.attributes.position;
    p.array[0] = w.x; p.array[1] = w.y; p.array[2] = w.z;
    p.needsUpdate = true;
    vtxSnapHoverDot.geometry.setDrawRange(0, 1);
}
function vtxSnapWrite(b, vn, val) {
    const v = Math.round(val * 1e6) / 1e6;
    /* ★ 关键帧动画适配：有动画数据的方块，唯一合法写入口是 keyframeData
       （scope.vars 会被编译产物每帧覆盖 = 用户看到"移了又弹回"）。
       与 Gizmo 拖拽同口径：写不进就停在这里，绝不再回落到 scope.vars 去改程序基线。 */
    if (hasKeyframeAnimation(b.id)) { kfGizmoWriteVar(b, vn, v); return; }
    let def = b.scope.vars.get(vn);
    if (!def) {
        const rg = getDefaultRange(vn);
        b.scope.addVar(vn, '0', rg.min, rg.max, rg.step);
        def = b.scope.vars.get(vn);
    }
    if (!def) return;
    setConstVarValue(b, vn, v);
}
// 快照基准值：关键帧方块按「吸附后的帧」读帧数据（与 kfGizmoWriteVar 写入口同口径），
// 否则播放头停在两帧之间时会取到插值量，写进帧后产生漂移
function vtxSnapReadBase(b, vn) {
    if (hasKeyframeAnimation(b.id) && typeof keyframeCurrentTime === 'number') {
        const t = kfEditFrameTime(b.id, keyframeCurrentTime);
        const cur = kfValueAt(b, t !== null ? t : kfResolveFrameTime(b.id, keyframeCurrentTime), String(vn).replace(/^v\./, ''));
        if (Number.isFinite(Number(cur))) return Number(cur);
    }
    const def = b.scope.vars.get(vn);
    return Number(def ? (def.value ?? 0) : 0);
}
// 对齐快照：记录捕捉前的枢轴 / basepos 数值（轴开关反复切换时始终从同一基准重算）
function vtxSnapSnapshot(jointWorld, targetWorld) {
    /* 捕捉是「一步动作」：先把尚未落账的快照提交掉（否则撤销会跳过它、把更早的动作一起撤掉），
       然后再把本次捕捉落成一条独立记录（见 vtxSnapCommitHistory）。 */
    flushPendingRecords();
    /* ★ 撤销基线：本项目「打开项目」不会 history.reset，撤销栈可能是空的。
       若捕捉是打开项目后的第一个动作，栈里只会落进「捕捉后」这一条，undo 判 u.length<2 直接放弃 ⇒ 撤不回。
       变更前先 ensure 一份当前状态作为基线，本动作才是可撤销的一步。 */
    history.ensure(getState());
    vtxSnapRecorded = false;
    const names = vtxSnapMoveType === 'pivot' ? ['v.xpos', 'v.ypos', 'v.zpos'] : ['v.xbasepos', 'v.ybasepos', 'v.zbasepos'];
    const recs = vtxSnapSet.map(b => {
        const pre = {};
        for (const vn of names) {
            // null = 该分量由 molang / 派生量驱动，禁止写入（gizmoMolangGuard 内部会给出提示）
            pre[vn] = gizmoMolangGuard(b, vn) ? null : vtxSnapReadBase(b, vn);
        }
        return { b, pre };
    });
    vtxSnapBase = { blocks: recs, delta: targetWorld.clone().sub(jointWorld), type: vtxSnapMoveType };
    vtxSnapMask = { x: true, y: true, z: true };
}
/* 本次捕捉的历史落账（只落一次）：
   与镜像等「破坏性 mutation」同一铁律 —— 立即 history.record，不用 200ms 防抖，
   否则用户在防抖窗口内 Ctrl+Z 的落账顺序会错位；轴开关再次调用时不再追加记录。 */
function vtxSnapCommitHistory() {
    if (!vtxSnapRecorded) {
        vtxSnapRecorded = true;
        history.record(getState());
    }
    if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
}
function vtxSnapApply(mask) {
    if (!vtxSnapBase) return;
    const D = vtxSnapBase.delta.clone();
    if (!mask.x) D.x = 0;
    if (!mask.y) D.y = 0;
    if (!mask.z) D.z = 0;
    const pivotType = vtxSnapBase.type === 'pivot';
    const names = pivotType ? ['v.xpos', 'v.ypos', 'v.zpos'] : ['v.xbasepos', 'v.ybasepos', 'v.zbasepos'];
    for (const rec of vtxSnapBase.blocks) {
        const b = rec.b;
        // 先还原到捕捉前的值，再按当前轴开关重新施加位移（保证反复开关不会累加）
        const d = pivotType ? D.clone() : worldToBasepos(b, D);
        names.forEach((vn, i) => {
            if (rec.pre[vn] === null) return;
            vtxSnapWrite(b, vn, rec.pre[vn] + d.getComponent(i));
        });
        b.refresh();
        if (b.mesh) b.mesh.updateMatrixWorld(true);
        syncKeyframeFromBlock(b);
        if (isBoneRoot(b)) refreshBoneFollowers(b);
    }
    vtxSnapCommitHistory();
}
function vtxSnapCloseBubble() {
    const row = document.querySelector('.tech-bubble .vtx-axis-row');
    if (!row) return;
    const el = row.closest('.tech-bubble');
    if (!el) return;
    el.classList.add('tb-burst');
    setTimeout(() => { if (el.parentNode) el.remove(); }, 380);
}
// 对齐完成后的轻量泡泡：X/Y/Z 三轴开关（关掉某轴 = 该世界轴分量不应用），短暂显示后自动消失
function vtxSnapShowAxisBubble(text, applyFn) {
    const html = '<div>' + (text || '接合点已移到目标点') + '</div>'
        + '<div class="vtx-axis-row">' + ['x', 'y', 'z'].map(a =>
            `<button class="vtx-axis-btn on" data-axis="${a}" aria-pressed="true">${a.toUpperCase()}</button>`).join('') + '</div>';
    const el = showTechBubble('顶点捕捉', '', { contentHtml: html, confirmText: '完成', duration: 12000 });
    el.querySelectorAll('.vtx-axis-btn').forEach(btn => {
        btn.onclick = () => {
            const a = btn.dataset.axis;
            vtxSnapMask[a] = !vtxSnapMask[a];
            btn.classList.toggle('on', vtxSnapMask[a]);
            btn.setAttribute('aria-pressed', String(vtxSnapMask[a]));
            (applyFn || vtxSnapApply)(vtxSnapMask);
        };
    });
    /* ★ 点「完成」= 这次捕捉结束：退出捕捉模式并取消选中（用户要求）。
       只挂按钮自己的监听、不用 onConfirm —— showTechBubble 的 12s 自动消失也走 'ok'，
       否则用户什么都没点也会被清空选区。 */
    const okBtn = el.querySelector('.tb-ok');
    if (okBtn) okBtn.addEventListener('click', () => { vtxSnapFinish(); });
}
// 撤掉已选的接合点，回到第一步（继续点集合里的另一枚顶点）
function vtxSnapCancelJoint() {
    vtxSnapPhase = 1;
    vtxSnapJoint = null;
    vtxSnapBase = null;
    vtxSnapPivotBase = null;
    vtxSnapHover = -1;
    vtxSnapClearTarget();
    vtxSnapCloseBubble();
    vtxSnapPaintSetWire();       // 回到第一步：集合线框变回普通选中的黄色
    vtxSnapBuildCands();
    vtxSnapRender();
}
// 「完成」= 这次捕捉结束：退出捕捉模式并取消选中，否则顶点圆点/接合点会一直挂在画布上
function vtxSnapFinish() {
    herModes.delete('vtxsnap');
    const vb = document.getElementById('vtxSnapMenuBtn');
    if (vb) vb.classList.remove('active');
    vtxSnapExit();
    selectedBlocksSet.clear();
    kfExplicitPickIds.clear();
    selectBlock(null);
    renderVariablesForBlock(null);
    updateDropdownSelection();
    updateToolbar(true);
}
// ==================== 沿边对齐（下拉第三项） ====================
/* 语义（用户设计）：先在被移动方块集合上点两个点，确定「源线段」；再点一个集合外的目标方块，
   在它上面点两个点确定「目标线段」；然后把整个集合绕【第一个源点】做刚体旋转，
   使源线段与目标线段平行（第一个源点保持不动）。只求平行，不做平移，也不做镜像翻转。 */
function vtxSnapEdgeResetFlow() {
    if (!vtxSnapEdge) return;
    vtxSnapEdge.step = 1;
    vtxSnapEdge.p1 = vtxSnapEdge.p2 = vtxSnapEdge.t1 = vtxSnapEdge.t2 = null;
    vtxSnapPhase = 1;
    vtxSnapClearTarget();
    vtxSnapBuildCands();
    vtxSnapRender();
}
function vtxSnapEdgeSetStep(step) {
    vtxSnapEdge.step = step;
    // 第 1~2 步在集合内取点（显示集合顶点）；第 3~5 步在目标方块上取点（显示目标顶点）
    vtxSnapPhase = step <= 2 ? 1 : 2;
    vtxSnapBuildCands();
    vtxSnapRender();
}
// 绕第一个源点把整个集合作为刚体转到「源线段 ∥ 目标线段」
function vtxSnapEdgeApply() {
    const e = vtxSnapEdge;
    if (!e || !e.p1 || !e.p2 || !e.t1 || !e.t2) return;
    const d1 = e.p2.clone().sub(e.p1);
    const d2 = e.t2.clone().sub(e.t1);
    if (d1.lengthSq() < 1e-10 || d2.lengthSq() < 1e-10) { vtxSnapEdgeResetFlow(); return; }
    // 最短弧：把源线段方向转到目标线段方向（方向已平行时是单位四元数，等于不转）
    const R = new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(d1.normalize(), d2.normalize()));
    const A = e.p1.clone();
    // 先提交待落账快照：沿边对齐自成一个撤销步骤
    flushPendingRecords();
    history.ensure(getState());
    vtxSnapRecorded = false;
    // 与 Gizmo 同口径：molang 表达式驱动的变量不覆盖，关键帧方块写进帧数据
    const writeVar = (bb, vn, val) => { if (!gizmoMolangGuard(bb, vn)) vtxSnapWrite(bb, vn, val); };
    vtxSnapSet.forEach(b => {
        if (!b || !b.mesh) return;
        // 骨骼根：旋转落到骨骼旋转源（子块经 molang 跟随）；普通块：绕 A 刚体旋转（写 basepos + xrot）
        if (isBoneRoot(b)) rotateBoneRoot(b, R, A);
        else rotateBlockAroundCenter(b, R, A, writeVar);
        b.refresh();
        b.mesh.updateMatrixWorld(true);
        syncKeyframeFromBlock(b);
        if (isBoneRoot(b)) refreshBoneFollowers(b);
    });
    vtxSnapCommitHistory();
    showToast('已沿边对齐');
    vtxSnapEdgeResetFlow();
}
function vtxSnapEdgeClick(cx, cy) {
    const e = vtxSnapEdge;
    if (!e) return false;
    const i = vtxSnapPick(cx, cy);
    if (e.step === 1) {
        if (i < 0) return false;   // 未点中顶点：交回常规选区逻辑
        e.p1 = vtxSnapCands[i].world.clone();
        vtxSnapEdgeSetStep(2);
        return true;
    }
    if (e.step === 2) {
        if (i < 0) return false;   // 点空白：交回常规逻辑（取消选中 → 退出捕捉）
        if (vtxSnapCands[i].world.distanceToSquared(e.p1) < 1e-8) return true; // 与第一点重合，忽略
        e.p2 = vtxSnapCands[i].world.clone();
        vtxSnapEdgeSetStep(3);
        showToast('点选目标方块');
        return true;
    }
    if (e.step === 3) {
        // 先点一下集合外的方块，才显示它的顶点
        const hb = vtxSnapPickBlock(cx, cy);
        if (!hb) return false;
        if (!vtxSnapSet.includes(hb)) { vtxSnapSetTarget(hb); vtxSnapEdgeSetStep(4); }
        else vtxSnapEdgeResetFlow();   // 点到被移动的方块：重来（吞掉这次点击）
        return true;
    }
    // 第 4~5 步：在目标方块顶点里取目标线段
    if (i >= 0) {
        if (e.step === 4) { e.t1 = vtxSnapCands[i].world.clone(); vtxSnapEdgeSetStep(5); }
        else {
            if (vtxSnapCands[i].world.distanceToSquared(e.t1) < 1e-8) return true;
            e.t2 = vtxSnapCands[i].world.clone();
            vtxSnapEdgeApply();
        }
        return true;
    }
    const hb = vtxSnapPickBlock(cx, cy);
    if (!hb) return false;
    if (hb.id === vtxSnapTargetBlockId) return true;   // 已是指定目标：等点顶点（吞掉）
    if (!vtxSnapSet.includes(hb)) {
        // 换目标方块 → 目标线段重选
        vtxSnapSetTarget(hb);
        e.t1 = e.t2 = null;
        vtxSnapEdgeSetStep(4);
        return true;
    }
    vtxSnapEdgeResetFlow();
    return true;
}
// ==================== 枢轴改到顶点（下拉第四项） ====================
/* 语义（用户设计）：先把要改枢轴的方块选中，再选一个顶点 —— 把所有选中方块的
   枢轴（v.xpos/ypos/zpos）一起改到这个点上，同时用 basepos 反向补偿，
   模型世界位置原地不变（与 Gizmo「枢轴移动」同一套换算，见 setPivotKeepingModel）。 */
function vtxSnapPivotSnapshot(target) {
    // 与顶点对齐同口径：先提交待落账快照，本次改枢轴落成一条独立撤销记录
    flushPendingRecords();
    history.ensure(getState());
    vtxSnapRecorded = false;
    const recs = [];
    let skipped = 0;
    vtxSnapSet.forEach(b => {
        if (!b || !b.scope || !b.mesh) return;
        // 骨骼跟随子块的 v.xpos 由父骨实时算，改它等于把子块从父骨上撕下来 → 跳过
        if (isBoneMolangDriven(b)) { skipped++; return; }
        const names = ['v.xpos', 'v.ypos', 'v.zpos', 'v.xbasepos', 'v.ybasepos', 'v.zbasepos'];
        if (names.some(vn => gizmoMolangGuard(b, vn))) { skipped++; return; }
        // 补偿量必须按【改枢轴之前】的世界位置算（w0 = 旧枢轴位置）
        const M = b.scope.toM();
        const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
        const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
        const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
        recs.push({
            b,
            pre: { x: vtxSnapReadBase(b, 'v.xpos'), y: vtxSnapReadBase(b, 'v.ypos'), z: vtxSnapReadBase(b, 'v.zpos') },
            w0: new THREE.Vector3().setFromMatrixPosition(computeTransformMatrix(M, rX, rY, rZ))
        });
    });
    vtxSnapPivotBase = { target: target.clone(), blocks: recs, skipped };
    vtxSnapMask = { x: true, y: true, z: true };
    return { ok: recs.length, skip: skipped };
}
// 按 X/Y/Z 开关应用：关掉的轴 = 该分量的枢轴保持原值
function vtxSnapPivotApply(mask) {
    const base = vtxSnapPivotBase;
    if (!base || !base.blocks.length) return;
    const m = mask || { x: true, y: true, z: true };
    for (const rec of base.blocks) {
        const b = rec.b;
        const np = new THREE.Vector3(
            m.x ? base.target.x : rec.pre.x,
            m.y ? base.target.y : rec.pre.y,
            m.z ? base.target.z : rec.pre.z);
        const baseNew = worldToBasepos(b, rec.w0.clone().sub(np));
        ['v.xpos', 'v.ypos', 'v.zpos'].forEach((vn, i) => vtxSnapWrite(b, vn, np.getComponent(i)));
        ['v.xbasepos', 'v.ybasepos', 'v.zbasepos'].forEach((vn, i) => vtxSnapWrite(b, vn, baseNew.getComponent(i)));
        b.refresh();
        b.mesh.updateMatrixWorld(true);
        syncKeyframeFromBlock(b);
        if (isBoneRoot(b)) refreshBoneFollowers(b);
    }
    vtxSnapCommitHistory();
}
function vtxSnapPivotClick(cx, cy) {
    const i = vtxSnapPick(cx, cy);
    if (i >= 0) {
        const r = vtxSnapPivotSnapshot(vtxSnapCands[i].world);
        vtxSnapPivotApply(vtxSnapMask);
        // 枢轴变了、模型没动 ⇒ 顶点位置不变：留在第一步，可再点另一个点继续改
        vtxSnapPhase = 1;
        vtxSnapClearTarget();   // 第二步借用过目标方块时撤掉它的紫色线框
        vtxSnapBuildCands();
        vtxSnapRender();
        if (r.ok) {
            // 「应用轴」泡泡：关掉某轴 = 该轴分量不改（点空白/取消即可回退，无需确认按钮）
            vtxSnapShowAxisBubble('枢轴已改到目标点', () => vtxSnapPivotApply(vtxSnapMask));
        } else {
            showToast(r.skip ? '选中的方块枢轴由 molang / 骨骼驱动，无法修改' : '没有可改枢轴的方块');
        }
        return true;
    }
    if (vtxSnapPhase === 1) {
        // 点集合外的方块 = 借它的顶点当枢轴目标（先显示它的顶点，再点其中一枚）
        const hb = vtxSnapPickBlock(cx, cy);
        if (hb && !vtxSnapSet.includes(hb)) {
            vtxSnapSetTarget(hb);
            vtxSnapPhase = 2;
            vtxSnapBuildCands();
            vtxSnapRender();
            return true;
        }
        return false;   // 点空白：交回常规选区逻辑（取消选中 ⇒ 自动退出捕捉）
    }
    vtxSnapCancelJoint();   // 第二步点空白：撤掉目标方块，回到从集合顶点取点
    return false;
}
// ==================== 测长 / 测角（下拉第五、六项） ====================
/* 语义（用户设计）：在任意模型上取顶点 —— 测长取 2 点连一线并显示长度；
   测角取 3 点（第一点 = 一条边上的点，第二点 = 角顶点，第三点 = 另一条边上的点），
   连线并标出角度 —— 与常见软件一致：第二个点的两条连线围成被测角。
   测量不隐藏、不自动消失：数据用 blockId + vi 锚定顶点，每帧跟着方块位置重算；
   文字与删除 × 用投影片（Sprite）挂在 3D 点上，随摄像机远近自然缩放。 */
function vtxSnapMeasureClick(cx, cy) {
    const i = vtxSnapPick(cx, cy);
    if (i < 0) {
        // 点集合外的方块本体 = 把它的顶点临时加入候选（跨模型测量，不改选区）
        const hb = vtxSnapPickBlock(cx, cy);
        if (hb && !vtxSnapSet.includes(hb) && !vtxSnapMeasureExtra.includes(hb)) {
            vtxSnapMeasureExtra.push(hb);
            vtxSnapBuildCands();
            vtxSnapRender();
            return true;
        }
        return false;   // 点空白：交回常规选区逻辑
    }
    const c = vtxSnapCands[i];
    if (vtxSnapMeasurePts.some(p => p.blockId === c.blockId && p.vi === c.vi)) return true; // 同一点不重复取
    vtxSnapMeasurePts.push({ blockId: c.blockId, vi: c.vi, world: c.world.clone() });
    const need = vtxSnapMoveType === 'len' ? 2 : 3;
    if (vtxSnapMeasurePts.length >= need) {
        const type = vtxSnapMoveType;
        const pts = vtxSnapMeasurePts;
        vtxSnapMeasurePts = [];
        measureCreate(type, pts, { record: true });
        showToast(type === 'len' ? '已添加长度测量' : '已添加角度测量');
    }
    vtxSnapRender();
    return true;
}
// 截获画布点击：返回 true = 本次点击归顶点捕捉处理（不再走选方块逻辑）
function vtxSnapClick(cx, cy) {
    if (!vtxSnapPhase) return false;
    if (typeof _canvasDragMoved !== 'undefined' && _canvasDragMoved) return false; // 拖视角不算点选
    if (vtxSnapMoveType === 'edge') return vtxSnapEdgeClick(cx, cy);
    if (vtxSnapMoveType === 'pivotpt') return vtxSnapPivotClick(cx, cy);
    if (vtxSnapMoveType === 'len' || vtxSnapMoveType === 'ang') return vtxSnapMeasureClick(cx, cy);
    const i = vtxSnapPick(cx, cy);
    if (i < 0) {
        /* 第一步：没点中顶点就把点击交回常规选区逻辑 ——
           接合点只能从「被选中方块集合」的顶点里取，所以选区本身就是集合：
           点空白 = 取消选中（选区空 ⇒ 捕捉自动退出）；点别的方块 = 换成那个方块（旧方块的点随之消失）；
           Ctrl/Shift = 加减集合。 */
        if (vtxSnapPhase === 1) return false;
        /* 第二步：点中集合外的方块本体 = 把它指定为目标（这时才画它的顶点）；
           点空白 = 撤掉接合点并放行 → 一次点击就能取消选中 */
        const hb = vtxSnapPickBlock(cx, cy);
        if (hb && !vtxSnapSet.includes(hb)) { vtxSnapSetTarget(hb); return true; }
        vtxSnapCancelJoint();
        return !!hb;   // 点到集合内方块本体：撤接合点但吞掉这次点击；点空白：让常规逻辑去取消选中
    }
    if (vtxSnapPhase === 1) {
        vtxSnapJoint = { blockId: vtxSnapCands[i].blockId, world: vtxSnapCands[i].world.clone() };
        vtxSnapPhase = 2;
        vtxSnapBase = null;
        vtxSnapCloseBubble();
        vtxSnapPaintSetWire();   // 接合点已定 → 集合进入「紫色特殊选中」
        vtxSnapBuildCands();
        vtxSnapRender();
    } else {
        const target = vtxSnapCands[i].world.clone();
        vtxSnapSnapshot(vtxSnapJoint.world, target);
        vtxSnapApply(vtxSnapMask);
        // 回到第一步，方便连续捕捉（接合点已随集合一起移动，候选顶点按新位置重建）
        vtxSnapPhase = 1;
        vtxSnapJoint = null;
        vtxSnapClearTarget();
        vtxSnapPaintSetWire();   // 回到第一步 → 线框恢复黄色
        vtxSnapBuildCands();
        vtxSnapRender();
        vtxSnapShowAxisBubble();
    }
    return true;
}
function vtxSnapEnter() {
    // 镜像三点定面阶段也在用这套圆点图层：优先让给镜像，别在这里把候选/悬停点抢过去
    if (mirrorVtxPicking) return;
    const set = vtxSnapSetBlocks();
    if (!set.length) { vtxSnapExit(); return; }
    vtxSnapSet = set;
    vtxSnapSetIds = set.map(b => b.id).join(',');
    vtxSnapPhase = 1;
    vtxSnapRecorded = false;
    vtxSnapJoint = null;
    vtxSnapBase = null;
    vtxSnapPivotBase = null;
    vtxSnapMeasurePts = [];
    vtxSnapMeasureExtra = [];
    vtxSnapTargetBlockId = null;
    // 沿边对齐：每次进入 / 选区变化都从第 1 步重来（源线段两点、目标线段两点）
    vtxSnapEdge = { step: 1, p1: null, p2: null, t1: null, t2: null };
    vtxSnapEnsureRoot();
    vtxSnapRoot.visible = true;
    /* 集合方块的线框改成紫色：捕捉期间它们是「被移动的一方」，不是普通选中 */
    vtxSnapSet.forEach(b => vtxSnapPaintWire(b));
    vtxSnapBuildCands();
    vtxSnapRender();
}
// ★ 关键帧适配：候选顶点必须跟着方块的**实时姿态**走 —— 播放、拖播放头、骨骼跟随都会改 matrixWorld，
// 若只在进入捕捉时算一次，屏幕上的点就会停在旧位置，点下去抓的是"上一个姿势"的顶点。
// 用整数校验和做廉价比较，变了才重建（播放中每帧调用也不卡）。
function vtxSnapAutoRefresh() {
    if (!vtxSnapPhase || !vtxSnapRoot) return;
    const arr = (vtxSnapPhase === 1) ? vtxSnapSet.concat(vtxSnapMeasureExtra) : blocks;
    let h = 0;
    for (let j = 0; j < arr.length; j++) {
        const b = arr[j];
        const e = (b && b.mesh) ? b.mesh.matrixWorld.elements : null;
        if (!e) continue;
        for (let i = 0; i < 16; i++) h = (h * 31 + Math.round(e[i] * 1000)) | 0;
    }
    /* 相机也进校验和：转了视角遮挡关系就变了，淡紫 / 亮青必须跟着重新判定（此时顶点位置不用重建） */
    const ce = camera.matrixWorld.elements;
    let cs = 0;
    for (let i = 0; i < 16; i++) cs = (cs * 31 + Math.round(ce[i] * 1000)) | 0;
    if (h === _vtxSnapSig && cs === _vtxSnapCamSig) return;
    const poseChanged = (h !== _vtxSnapSig);
    /* ★ 遮挡判定要逐顶点打射线，转动视角时按 10fps 节流重算：顶点位置没变，只有颜色在更新，
       10fps 已经看不出跳变，却能把大场景里每帧全场景射线测试的开销压下来。 */
    const now = performance.now();
    if (!poseChanged && now - _vtxSnapClsAt < 100) return;
    _vtxSnapSig = h;
    _vtxSnapCamSig = cs;
    _vtxSnapClsAt = now;
    if (poseChanged) vtxSnapBuildCands();
    vtxSnapRender();
}
function vtxSnapExit() {
    const prevSet = vtxSnapSet.slice();          // 退出后要把它们的线框颜色还原成黄色
    const prevTarget = vtxSnapTargetBlockId;
    vtxSnapPhase = 0;
    vtxSnapRecorded = false;
    _vtxSnapSig = NaN;
    _vtxSnapCamSig = NaN;
    vtxSnapSet = []; vtxSnapSetIds = ''; vtxSnapJoint = null; vtxSnapCands = [];
    vtxSnapHover = -1; vtxSnapBase = null; vtxSnapPivotBase = null; vtxSnapTargetBlockId = null;
    vtxSnapMeasurePts = []; vtxSnapMeasureExtra = [];
    vtxSnapEdge = null;
    prevSet.forEach(b => { if (selectedBlocksSet.has(b)) vtxSnapPaintWire(b); });
    if (prevTarget) {
        const t = blocks.find(x => x.id === prevTarget);
        if (t && !selectedBlocksSet.has(t)) t.updateSelectionHighlight(false);
    }
    if (vtxSnapRoot) {
        scene.remove(vtxSnapRoot);
        vtxSnapRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        vtxSnapRoot = null; vtxSnapDots = null; vtxSnapDotsHidden = null; vtxSnapHoverDot = null; vtxSnapJointDot = null;
        vtxSnapPickMarks = null; vtxSnapEdgeSrc = null; vtxSnapEdgeDst = null;
        vtxSnapMeasureTemp = null; vtxSnapMeasureTempHalo = null;
    }
    vtxSnapCloseBubble();
}
// 与 herModes 同步：只有「新操作模式 + 选中方块且非文件夹 + vtxsnap 激活」时才渲染顶点
function vtxSnapSync() {
    if (mirrorVtxPicking) return;   // 圆点图层正被镜像三点定面借用
    if (!isNewLayoutMode || !herModes.has('vtxsnap') || selectedFolder) {
        if (vtxSnapPhase) vtxSnapExit();
        return;
    }
    const ids = vtxSnapSetBlocks().map(b => b.id).join(',');
    if (!vtxSnapPhase || ids !== vtxSnapSetIds) { vtxSnapEnter(); return; }
    // 选区没变但方块可能被移动/缩放（面板改数值、Gizmo 拖动）→ 顶点位置必须重建，否则会点到旧位置的顶点
    vtxSnapSet = vtxSnapSetBlocks();
    vtxSnapBuildCands();
    vtxSnapRender();
}
function vtxSnapUpdateBtnTitle() {
    const t = vtxSnapMoveType;
    const label = t === 'edge' ? '沿边对齐' : (t === 'pivot' ? '枢轴移动型对齐' : (t === 'pivotpt' ? '枢轴改到顶点' : (t === 'len' ? '测长' : (t === 'ang' ? '测角' : '位移移动型对齐'))));
    const vb = document.getElementById('vtxSnapMenuBtn');
    if (vb) vb.title = '顶点捕捉（X）· ' + label;
    /* 按钮显示 = 顶点捕捉图标 + 紫色「对齐方式」功能图标（不再带文字）；
       功能图标左上角被一条短白斜线裁开（样式见 08-...css 的 .hmb-fn-*）。 */
    const fnIcon = document.getElementById('vtxSnapFnIcon');
    const fnWrap = document.getElementById('vtxSnapFnWrap');
    const fnKey = (t === 'edge' || t === 'pivotpt' || t === 'len' || t === 'ang' || t === 'pivot') ? t : 'base';
    if (fnIcon) fnIcon.setAttribute('data-fn', fnKey);
    if (fnWrap) fnWrap.setAttribute('data-mode', fnKey);
    document.querySelectorAll('#vtxSnapDropdown .top-dropdown-item').forEach(it => {
        it.classList.toggle('active', it.dataset.vtx === t);
    });
}

// ==================== 测量系统（持久：测长 / 测角） ====================
/* 数据锚定：blockId + 顶点下标 vi（= vtxSnapBlockVerts 的顺序），方块一动测量就跟着动。
   视觉：连线是「面向相机的布带网格」—— WebGL 的 linewidth 恒为 1px（几乎看不见），
   所以宽度按相机距离换算成世界尺寸，屏幕上始终是固定的几像素；外面再垫一层深/浅色衬底，
   任何底色上都能看清。数值 / 删除 × 用 Sprite，按相机距离反算世界尺寸 ⇒ **屏幕上像素尺寸恒定**
   （远离相机时变大、贴近时变小，才符合「投影」直觉）。
   持久化：测量数据进 getState()/restoreState()，随项目存档 + 撤销/重做一起走。 */
function measurePalette() {
    const light = document.body.classList.contains('light-mode');
    return light
        ? { line: 0x075985, halo: 0xffffff, text: '#7c3aed', bg: '#e5e7eb' }
        : { line: 0xffffff, halo: 0x0b1220, text: '#7c3aed', bg: '#ffffff' };
}
// 线材质：半透、不写深度、不参与遮挡，任何角度都看得见（布带网格，非 Line）
function measureLineMaterial() {
    return new THREE.MeshBasicMaterial({ color: measurePalette().line, transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
}
function measureHaloMaterial() {
    return new THREE.MeshBasicMaterial({ color: measurePalette().halo, transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
}
/* 屏幕像素宽度（CSS px）：主线上 3px、衬底再宽 1.6px；标签高 32px、删除 × 边长 20px */
const MEASURE_LINE_PX = 3.0;
const MEASURE_ARC_PX = 2.4;
const MEASURE_HALO_PX = 1.6;
const MEASURE_LABEL_PX_H = 32;
const MEASURE_DEL_PX = 20;
const MEASURE_LABEL_GAP_PX = 4;
// 该世界点处「1 个 CSS 像素 = 多少世界单位」（透视 / 正交都支持）
function measureWorldPerPxAt(p) {
    const h = Math.max(1, renderer.domElement.clientHeight || 1);
    if (camera.isOrthographicCamera) {
        return ((camera.top - camera.bottom) / (camera.zoom || 1)) / h;
    }
    const d = Math.max(1e-4, camera.position.distanceTo(p));
    return (2 * d * Math.tan((camera.fov * Math.PI / 180) * 0.5)) / h;
}
// 布带几何：每段 4 个顶点（A±、B±），两张三角形；顶点位置每帧按相机重写
function measureRibbonGeometry(segCount) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segCount * 4 * 3), 3));
    const idx = new Uint16Array(segCount * 6);
    for (let i = 0; i < segCount; i++) {
        const v = i * 4, o = i * 6;
        idx[o] = v; idx[o + 1] = v + 2; idx[o + 2] = v + 1;
        idx[o + 3] = v + 2; idx[o + 4] = v + 3; idx[o + 5] = v + 1;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, segCount * 6);
    return geo;
}
const _mrMid = new THREE.Vector3(), _mrDir = new THREE.Vector3(), _mrView = new THREE.Vector3(), _mrPerp = new THREE.Vector3();
const _mrCamUp = new THREE.Vector3(), _mrCamRight = new THREE.Vector3();
/* 把第 i 段写成「宽度 = pxWidth 像素」的面向相机布带（a、b 为世界端点） */
function measureRibbonWrite(geo, i, a, b, pxWidth) {
    const at = geo.attributes.position;
    const o = i * 12;
    _mrDir.subVectors(b, a);
    const len = _mrDir.length();
    _mrMid.addVectors(a, b).multiplyScalar(0.5);
    if (len < 1e-9) {
        // 退化段：四个顶点重合 ⇒ 零面积，不会闪出奇怪的长条
        at.array[o] = at.array[o + 3] = at.array[o + 6] = at.array[o + 9] = a.x;
        at.array[o + 1] = at.array[o + 4] = at.array[o + 7] = at.array[o + 10] = a.y;
        at.array[o + 2] = at.array[o + 5] = at.array[o + 8] = at.array[o + 11] = a.z;
        at.needsUpdate = true;
        return;
    }
    _mrDir.divideScalar(len);
    _mrView.subVectors(_mrMid, camera.position);
    _mrPerp.crossVectors(_mrDir, _mrView);
    if (_mrPerp.lengthSq() < 1e-12) {
        _mrCamUp.setFromMatrixColumn(camera.matrixWorld, 1);
        _mrPerp.crossVectors(_mrDir, _mrCamUp);
    }
    if (_mrPerp.lengthSq() < 1e-12) {
        _mrCamRight.setFromMatrixColumn(camera.matrixWorld, 0);
        _mrPerp.copy(_mrCamRight);
    }
    _mrPerp.normalize();
    const hw = pxWidth * measureWorldPerPxAt(_mrMid) * 0.5;
    const ax = a.x + _mrPerp.x * hw, ay = a.y + _mrPerp.y * hw, az = a.z + _mrPerp.z * hw;
    const bx = b.x + _mrPerp.x * hw, by = b.y + _mrPerp.y * hw, bz = b.z + _mrPerp.z * hw;
    at.array[o] = ax; at.array[o + 1] = ay; at.array[o + 2] = az;
    at.array[o + 3] = a.x - _mrPerp.x * hw; at.array[o + 4] = a.y - _mrPerp.y * hw; at.array[o + 5] = a.z - _mrPerp.z * hw;
    at.array[o + 6] = bx; at.array[o + 7] = by; at.array[o + 8] = bz;
    at.array[o + 9] = b.x - _mrPerp.x * hw; at.array[o + 10] = b.y - _mrPerp.y * hw; at.array[o + 11] = b.z - _mrPerp.z * hw;
    at.needsUpdate = true;
}
// 数值底板：矩形无圆角、无描边；只靠「右下偏移的暗色投影」表达体积（不占额外空间）
function measureMakeTextTex(text) {
    const pal = measurePalette();
    const f = 30, padX = 10, padY = 6, off = 3;
    const c = document.createElement('canvas');
    let g = c.getContext('2d');
    g.font = 'bold ' + f + 'px system-ui, "Segoe UI", sans-serif';
    const tw = Math.ceil(g.measureText(text).width);
    const w = tw + padX * 2, h = f + padY * 2;
    c.width = w + off; c.height = h + off;
    g = c.getContext('2d');
    g.font = 'bold ' + f + 'px system-ui, "Segoe UI", sans-serif';
    g.fillStyle = 'rgba(15,23,42,0.4)';
    g.fillRect(off, off, w, h);                    // 投影（右下）
    g.fillStyle = pal.bg;
    g.fillRect(0, 0, w, h);                        // 底板（直角）
    g.fillStyle = pal.text;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
}
// 删除 ×：同款直角底板 + 右下投影 + 紫色叉（无粗描边、无圆角）
function measureMakeDeleteTex() {
    const pal = measurePalette();
    const c = document.createElement('canvas'); c.width = c.height = 72;
    const g = c.getContext('2d');
    const s = 66, off = 3;
    g.fillStyle = 'rgba(15,23,42,0.4)';
    g.fillRect(off, off, s, s);
    g.fillStyle = pal.bg;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = pal.text; g.lineWidth = 6; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(20, 20); g.lineTo(46, 46); g.moveTo(46, 20); g.lineTo(20, 46); g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
}

function measureEnsureRoot() {
    if (!measureRoot) { measureRoot = new THREE.Group(); measureRoot.renderOrder = 1000; scene.add(measureRoot); }
}
function measureRemoveVisual(m) {
    if (!m) return;
    [m.line, m.lineHalo, m.arc, m.arcHalo, m.label, m.del].forEach(o => {
        if (!o) return;
        if (o.parent) o.parent.remove(o);
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
        }
    });
}
function measureClearAll() {
    measures.forEach(m => measureRemoveVisual(m));
    measures = [];
    if (measureRoot) while (measureRoot.children.length) measureRoot.remove(measureRoot.children[0]);
    _measureSnapJson = null; _measureSnapArr = null;
}
/* 测量创建 / 删除的落账：立即进撤销栈 + 立即写项目。
   测量是「做完就不再改动」的对象，走 200ms 撤销防抖 / 1200ms 自动保存会让
   用户随手刷新网页时整条测量丢失（2026-10-31 报障，见 autoSaveNow 注释）。 */
function measureCommitState() {
    flushPendingRecords();
    history.record(getState());
    if (typeof autoSaveNow === 'function') autoSaveNow();
}
function measureCreate(type, pts, opt) {
    const o = opt || {};
    // 新建测量要在变更【之前】备好撤销基线（打开项目后栈可能是空的，否则 undo 撤不掉这一条）
    if (o.record) { flushPendingRecords(); history.ensure(getState()); }
    measureEnsureRoot();
    const isAng = type === 'ang';
    const id = Number.isFinite(o.id) ? o.id : ++measureSeq;
    measureSeq = Math.max(measureSeq, id);
    const m = { id, type: isAng ? 'ang' : 'len', pts: pts.map(p => ({ blockId: p.blockId, vi: p.vi })), text: '' };
    const nSeg = isAng ? 2 : 1;
    // 连线 = 衬底 + 彩色布带（先衬底后主线，renderOrder 保证叠放次序）
    const mkStroke = (seg, halo) => {
        const mesh = new THREE.Mesh(measureRibbonGeometry(seg), halo ? measureHaloMaterial() : measureLineMaterial());
        mesh.renderOrder = halo ? 1000 : 1001;
        mesh.frustumCulled = false;
        measureRoot.add(mesh);
        return mesh;
    };
    m.lineHalo = mkStroke(nSeg, true);
    m.line = mkStroke(nSeg, false);
    if (isAng) {
        m.arcHalo = mkStroke(16, true);
        m.arc = mkStroke(16, false);
    }
    m.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: measureMakeTextTex('0'), transparent: true, depthTest: false, depthWrite: false }));
    m.label.renderOrder = 1002; m.label.frustumCulled = false;
    measureRoot.add(m.label);
    m.del = new THREE.Sprite(new THREE.SpriteMaterial({ map: measureMakeDeleteTex(), transparent: true, depthTest: false, depthWrite: false }));
    m.del.renderOrder = 1003; m.del.frustumCulled = false;
    m.del.userData.measureId = id;
    measureRoot.add(m.del);
    measures.push(m);
    if (o.record) measureCommitState();
    measureUpdate();
    return m;
}
/* 数值显示精度（小数位 0-10，面板「设置 → 编辑 → 新操作模式 → 测量工具显示精度」）：
   0 = 四舍五入为整数、不显示小数点；只影响显示，测量数据本身不取整。 */
const MEASURE_PRECISION_MAX = 10;
let measureDisplayPrecision = (() => {
    try {
        const v = parseInt(localStorage.getItem('ui_measure_precision'), 10);
        return Number.isFinite(v) ? Math.max(0, Math.min(MEASURE_PRECISION_MAX, v)) : 2;
    } catch (e) { return 2; }
})();
function measureFmt(v) { return (typeof v === 'number' && isFinite(v)) ? v.toFixed(measureDisplayPrecision) : String(v); }
/* 度量显示框大小倍率（11.25% - 150%，面板「设置 → 编辑 → 新操作模式 → 度量显示框大小」）：
   只缩放数值框 / 删除 × 的基础像素尺寸与二者之间的间距；「屏幕尺寸恒定」的换算逻辑不变，
   倍率改动只影响观感，不改任何测量值。 */
const MEASURE_BOX_SCALE_MIN = 0.1125, MEASURE_BOX_SCALE_MAX = 1.5;
let measureBoxScale = (() => {
    try {
        const v = parseFloat(localStorage.getItem('ui_measure_box_scale'));
        return Number.isFinite(v) ? Math.max(MEASURE_BOX_SCALE_MIN, Math.min(MEASURE_BOX_SCALE_MAX, v)) : 1;
    } catch (e) { return 1; }
})();
// 数值 / 删除 × 屏幕像素尺寸恒定：按相机距离反算世界尺寸（远离变大、贴近变小）
function measureSetLabelScale(m, labelPos) {
    const perPx = measureWorldPerPxAt(labelPos);
    const H = MEASURE_LABEL_PX_H * measureBoxScale * perPx;
    const img = m.label.material.map && m.label.material.map.image;
    const aspect = img && img.height ? img.width / img.height : 2.2;
    m.label.scale.set(H * aspect, H, 1);
    const d = MEASURE_DEL_PX * measureBoxScale * perPx;
    m.del.scale.set(d, d, 1);
    return perPx;
}
let _measureVertCache = new Map();
const _measureUp = new THREE.Vector3(), _measureRight = new THREE.Vector3();
const _measureA = new THREE.Vector3(), _measureB = new THREE.Vector3(), _measureC = new THREE.Vector3();
const _measureU1 = new THREE.Vector3(), _measureU2 = new THREE.Vector3(), _measureE2 = new THREE.Vector3(), _measureBi = new THREE.Vector3();
const _measureLabelPos = new THREE.Vector3(), _measureArcA = new THREE.Vector3(), _measureArcB = new THREE.Vector3();
const _measureArcPts = new Float32Array(17 * 3);   // 圆弧 17 个采样点（16 段布带）
function measureVertsOfBlock(b) {
    if (!b) return null;
    let vs = _measureVertCache.get(b.id);
    if (!vs) { vs = vtxSnapBlockVerts(b); _measureVertCache.set(b.id, vs); }
    return vs;
}
// 每帧重算：顶点锚定 → 连线 / 圆弧 / 文字 / 删除 × 全部跟着方块与相机走
function measureUpdate() {
    if (!measures.length) return;
    _measureVertCache.clear();
    _measureUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    _measureRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    for (let k = measures.length - 1; k >= 0; k--) {
        const m = measures[k];
        const bs = m.pts.map(p => (typeof getBlockById === 'function' ? getBlockById(p.blockId) : blocks.find(x => x.id === p.blockId)));
        /* ★ 只有「方块真的不存在」才作废这条测量。
           顶点取不到 ≠ 方块被删：掉落物的几何/贴图是异步重建的，项目装载（restoreState）当帧
           还拿不到顶点，旧逻辑直接 splice 会把这条测量永久删掉 ⇒ 用户看到「刷新后测量消失」。
           顶点暂缺时只隐藏视觉对象，下一帧顶点可用再恢复。 */
        if (bs.some(b => !b)) {
            measureRemoveVisual(m);
            measures.splice(k, 1);
            _measureSnapJson = null; _measureSnapArr = null;
            continue;
        }
        const w = bs.map((b, i) => {
            const vs = measureVertsOfBlock(b);
            return (vs && vs[m.pts[i].vi]) ? vs[m.pts[i].vi] : null;
        });
        const ready = !w.some(v => !v);
        [m.line, m.lineHalo, m.arc, m.arcHalo, m.label, m.del].forEach(o => { if (o) o.visible = ready; });
        if (!ready) continue;
        let text;
        if (m.type === 'len') {
            _measureA.copy(w[0]); _measureB.copy(w[1]);
            measureRibbonWrite(m.line.geometry, 0, _measureA, _measureB, MEASURE_LINE_PX);
            measureRibbonWrite(m.lineHalo.geometry, 0, _measureA, _measureB, MEASURE_LINE_PX + MEASURE_HALO_PX);
            text = measureFmt(_measureA.distanceTo(_measureB));
            _measureLabelPos.addVectors(_measureA, _measureB).multiplyScalar(0.5).addScaledVector(_measureUp, 0.18);
        } else {
            _measureB.copy(w[1]); _measureA.copy(w[0]); _measureC.copy(w[2]);   // B = 角顶点（第 2 个点）
            _measureU1.copy(_measureA).sub(_measureB);
            _measureU2.copy(_measureC).sub(_measureB);
            const la = _measureU1.length(), lc = _measureU2.length();
            measureRibbonWrite(m.line.geometry, 0, _measureB, _measureA, MEASURE_LINE_PX);
            measureRibbonWrite(m.line.geometry, 1, _measureB, _measureC, MEASURE_LINE_PX);
            measureRibbonWrite(m.lineHalo.geometry, 0, _measureB, _measureA, MEASURE_LINE_PX + MEASURE_HALO_PX);
            measureRibbonWrite(m.lineHalo.geometry, 1, _measureB, _measureC, MEASURE_LINE_PX + MEASURE_HALO_PX);
            if (la < 1e-6 || lc < 1e-6) {
                if (m.arc) { m.arc.visible = false; m.arcHalo.visible = false; }
                _measureLabelPos.copy(_measureB).addScaledVector(_measureUp, 0.18);
                text = measureFmt(0) + '°';
            } else {
                _measureU1.divideScalar(la); _measureU2.divideScalar(lc);
                const ang = _measureU1.angleTo(_measureU2);
                const r = Math.min(0.5, Math.max(0.08, Math.min(la, lc) * 0.3));
                // 面内正交基：e1 = 第一条边方向，e2 = 第二条边在 e1 垂面内的分量
                _measureE2.copy(_measureU2).addScaledVector(_measureU1, -_measureU1.dot(_measureU2));
                if (_measureE2.lengthSq() < 1e-10) _measureE2.copy(_measureU1);
                _measureE2.normalize();
                for (let i = 0; i <= 16; i++) {
                    const t = ang * i / 16;
                    _measureArcPts[i * 3] = _measureB.x + (_measureU1.x * Math.cos(t) + _measureE2.x * Math.sin(t)) * r;
                    _measureArcPts[i * 3 + 1] = _measureB.y + (_measureU1.y * Math.cos(t) + _measureE2.y * Math.sin(t)) * r;
                    _measureArcPts[i * 3 + 2] = _measureB.z + (_measureU1.z * Math.cos(t) + _measureE2.z * Math.sin(t)) * r;
                }
                for (let i = 0; i < 16; i++) {
                    _measureArcA.set(_measureArcPts[i * 3], _measureArcPts[i * 3 + 1], _measureArcPts[i * 3 + 2]);
                    _measureArcB.set(_measureArcPts[i * 3 + 3], _measureArcPts[i * 3 + 4], _measureArcPts[i * 3 + 5]);
                    measureRibbonWrite(m.arc.geometry, i, _measureArcA, _measureArcB, MEASURE_ARC_PX);
                    measureRibbonWrite(m.arcHalo.geometry, i, _measureArcA, _measureArcB, MEASURE_ARC_PX + MEASURE_HALO_PX);
                }
                m.arc.visible = true; m.arcHalo.visible = true;
                _measureBi.copy(_measureU1).add(_measureU2);
                if (_measureBi.lengthSq() < 1e-10) _measureBi.copy(_measureU1);
                _measureBi.normalize();
                _measureLabelPos.copy(_measureB).addScaledVector(_measureBi, r + 0.18).addScaledVector(_measureUp, 0.04);
                text = measureFmt(ang * 180 / Math.PI) + '°';
            }
        }
        if (m.text !== text) {
            m.text = text;
            const old = m.label.material.map;
            m.label.material.map = measureMakeTextTex(text);
            m.label.material.needsUpdate = true;
            if (old) old.dispose();
        }
        // 文字 / 删除 × 的屏幕像素尺寸恒定 ⇒ 每帧按相机距离重算世界尺寸
        const perPx = measureSetLabelScale(m, _measureLabelPos);
        m.label.position.copy(_measureLabelPos);
        // 删除 × 挂在文字右侧（相机右方向偏移，间距同样是固定像素）
        m.del.position.copy(_measureLabelPos).addScaledVector(_measureRight, m.label.scale.x * 0.5 + m.del.scale.x * 0.5 + MEASURE_LABEL_GAP_PX * measureBoxScale * perPx);
    }
}
// 点删除 ×：返回 true = 这次点击是删测量（不再选方块 / 拖 Gizmo）
function measureDeleteClick(cx, cy) {
    if (!measures.length || !measureRoot) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const targets = measures.map(m => m.del).filter(Boolean);
    const hit = targets.length ? raycaster.intersectObjects(targets, false) : [];
    if (!hit.length) return false;
    const id = hit[0].object.userData.measureId;
    const i = measures.findIndex(m => m.id === id);
    if (i >= 0) {
        // 删除前先备好撤销基线（同 measureCreate：空栈时 undo 才有可回退的一步）
        flushPendingRecords();
        history.ensure(getState());
        measureRemoveVisual(measures[i]);
        measures.splice(i, 1);
        _measureSnapJson = null; _measureSnapArr = null;
        measureCommitState();
        showToast('已删除测量');
    }
    return true;
}
// 供项目存档 / 撤销快照使用（返回不可变的大致结构；内容不变时复用同一引用）
function measureStateSnapshot() {
    const arr = measures.map(m => ({ id: m.id, type: m.type, pts: m.pts.map(p => ({ blockId: p.blockId, vi: p.vi })), angV: m.type === 'ang' ? 2 : undefined }));
    const json = JSON.stringify(arr);
    if (json === _measureSnapJson && _measureSnapArr) return _measureSnapArr;
    _measureSnapJson = json; _measureSnapArr = arr;
    return arr;
}
// 撤销/重做 / 项目装载：按状态里的测量数据重建（旧存档没有 measures 字段 ⇒ 清空）
function measureRestoreFromState(list) {
    measureClearAll();
    measureSeq = 0;
    const arr = Array.isArray(list) ? list : [];
    arr.forEach(s => {
        if (!s || !Array.isArray(s.pts)) return;
        const type = s.type === 'ang' ? 'ang' : 'len';
        const need = type === 'ang' ? 3 : 2;
        if (s.pts.length !== need) return;
        if (!s.pts.every(p => p && typeof p.blockId !== 'undefined' && Number.isFinite(Number(p.vi)))) return;
        /* ★测角取点顺序在 2026-10-31 当天从「第 1 点=角顶点」改成「第 2 点=角顶点」。
           当天早先存下的角度测量没有 angV 标记，重排成新顺序（旧 [顶点, a, b] → 新 [a, 顶点, b]），
           否则老存档里的角会被按新语义解释成错的角。 */
        const pts = (type === 'ang' && !(Number(s.angV) >= 2)) ? [s.pts[1], s.pts[0], s.pts[2]] : s.pts;
        measureCreate(type, pts, { record: false, id: Number.isFinite(Number(s.id)) ? Number(s.id) : undefined });
    });
}
// 主题切换：线色 / 衬底色 / 文字底色 / 删除 × 一起换（文字贴图在 measureUpdate 里按新主题重建）
function measureThemeRefresh() {
    const pal = measurePalette();
    if (vtxSnapMeasureTemp) vtxSnapMeasureTemp.material.color.setHex(pal.line);
    if (vtxSnapMeasureTempHalo) vtxSnapMeasureTempHalo.material.color.setHex(pal.halo);
    measures.forEach(m => {
        if (m.line) m.line.material.color.setHex(pal.line);
        if (m.arc) m.arc.material.color.setHex(pal.line);
        if (m.lineHalo) m.lineHalo.material.color.setHex(pal.halo);
        if (m.arcHalo) m.arcHalo.material.color.setHex(pal.halo);
        if (m.del) {
            const old = m.del.material.map;
            m.del.material.map = measureMakeDeleteTex();
            m.del.material.needsUpdate = true;
            if (old) old.dispose();
        }
        m.text = '';   // 强制重建文字贴图（底色跟随主题）
    });
    if (measures.length) measureUpdate();
}
/* 「测量工具显示精度」控件接线（0-10 位小数，0 = 四舍五入为整数）。
   与「点显示精度」同款：localStorage 持久化，改完立刻重建文字贴图。 */
(function measureInitPrecisionSetting() {
    const rng = document.getElementById('measurePrecisionRange');
    const lbl = document.getElementById('measurePrecisionLabel');
    const sync = () => {
        if (rng) rng.value = String(measureDisplayPrecision);
        if (lbl) lbl.textContent = String(measureDisplayPrecision);
    };
    sync();
    if (!rng) return;
    rng.addEventListener('input', () => {
        const v = parseInt(rng.value, 10);
        measureDisplayPrecision = Number.isFinite(v) ? Math.max(0, Math.min(MEASURE_PRECISION_MAX, v)) : 2;
        try { localStorage.setItem('ui_measure_precision', String(measureDisplayPrecision)); } catch (e) {}
        sync();
        measures.forEach(m => { m.text = ''; });   // 强制按新精度重建文字
        if (measures.length) measureUpdate();
    });
})();
/* 「度量显示框大小」控件接线（11.25% - 150%，默认 100%）。
   localStorage 持久化；改完只需重算 Sprite 的屏幕尺寸（文字贴图与倍率无关，不必重建）。 */
(function measureInitBoxSizeSetting() {
    const rng = document.getElementById('measureBoxSizeRange');
    const lbl = document.getElementById('measureBoxSizeLabel');
    const pctOf = v => +(v * 100).toFixed(2);
    const sync = () => {
        if (rng) rng.value = String(pctOf(measureBoxScale));
        if (lbl) lbl.textContent = pctOf(measureBoxScale) + '%';
    };
    sync();
    if (!rng) return;
    rng.addEventListener('input', () => {
        const pct = parseFloat(rng.value);
        measureBoxScale = Number.isFinite(pct)
            ? Math.max(MEASURE_BOX_SCALE_MIN, Math.min(MEASURE_BOX_SCALE_MAX, pct / 100))
            : 1;
        try { localStorage.setItem('ui_measure_box_scale', String(measureBoxScale)); } catch (e) {}
        sync();
        if (measures.length) measureUpdate();
    });
})();
/* 预加载「对齐方式」功能图标：CSS mask-image 只在首次绘制时才解码，
   切换对齐方式时可能闪一帧空白（尤其是从下拉里点选的冷启动）。这里在模块加载时预热。 */
(function vtxPreloadFnIcons() {
    ['move', 'pivot', 'snap-edge', 'snap-pivotpt', 'snap-len', 'snap-ang'].forEach(n => {
        const im = new Image();
        im.decoding = 'async';
        im.src = 'Icons/' + n + '.svg';
    });
})();



