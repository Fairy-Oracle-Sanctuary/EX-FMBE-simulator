/* 06-gizmo/04-mirror.js · 源 测试版v.6b79.html 第 32072-33434 行 */
'use strict';
// ==================== 镜像工具 ====================
/* 数学口径（与 computeTransformMatrix 的变换链严格对齐）：
   世界矩阵 W = T(pos)·Ry(-ry)·Rx(rx)·Rz(-rz)·S(scale,scale,scale)·Rx(xrot)·Ry(yrot)·Rz(zrot)·S(es)·B(basepos)
   关于任意平面（世界法线 n、过点 p0）的反射矩阵 F = I − 2·n·nᵀ。
   ★★【2026-10-31 用户纠正】FMBE 原版不支持 scale / extend_scale 取负 ⇒ 镜像结果必须用正 scale 表达。
   引擎整条变换链（旋转 + 正统一缩放 + 平移）的行列式恒为 +1，而反射 det = −1
   ⇒ 那个负号只能「藏进局部形状」：F = M·R（M 是局部形状的一个 improper 对称）。
   本工具统一取 M = diag(1,1,−1)（局部 z 轴反射）：cube / halfbrick / stair 的局部模型都关于 z=0 对称
   （楼梯的底座 y∈[−0.5,0] 与台阶 y∈[0,0.5], x∈[0,0.5] 在 z 上都是 [−0.5,0.5]），所以
   「位置沿法线翻到对面 + 全局旋转 Rg' = F·Rg·M + 局部 xrot/yrot 与 extend_xrot/yrot 取反 +
   basepos.z 取反 + scale 保持正」与真反射的点集完全相同。
   （M 只与绕 z 的旋转、对角缩放可交换；故必须把 M 从 Q 里「换出来」，正是上面的取反规则。）
   ★你看到的「转 180°」不是额外动作，而是反射分解出来的那一半 —— 正 scale 只能这么做。
   ★【2026-10-31 用户纠正 2】dropitem 也有反射对称：它是「贴图平面挤出」的薄板，
     厚度沿局部 Y、上下两面同图 ⇒ 关于 y = DROP_ITEM_XFORM.y 的平面镜像对称（是精确对称，不是「准对称」）。
     同一套公式，只是 M = diag(1,-1,1)（法线沿局部 Y 的纯反射，无平移）：
     M 与绕 Y 的旋转、所有对角缩放都可交换 ⇒ 把 xrot / zrot、extend_xrot 取反即可把它「换出来」；
     真正的对称面在 y = y₀ ≠ 0（M 带平移 T(2y₀·ŷ)），该平移化简后只让 basepos.y 变成 −(b.y + 2y₀)。
     （掉落物材质是 DoubleSide 的 MeshBasicMaterial：不参与光照、上下两面同图，镜像后视觉完全一致。）
   ★flag（偏心旗杆 + 倾斜旗面）局部模型没有任何反射对称
   ⇒ 旋转 + 正 scale 数学上无法表达它的镜像，由 mirrorShapeMirrorable 判为不可镜像并在提交时跳过。
   （det<0 的渲染 / 拾取补丁仍保留，用于打开旧的负 scale 存档。）

   ★ 对称面本身是一个实体（位置 + 四元数），用「完整的三轴 Gizmo」操作：
     位移 = 3 根世界轴箭头，旋转 = 3 条世界轴圆环。
     两套手柄【不同时出现】（旧的 6 个手柄同时挂出会互相抢拾取，操控体验极差），
     由顶栏既有的「枢轴 / 旋转」两个按钮切换 —— 复用现有按钮，不新增控件。 */
const MIRROR_PREVIEW_MAX = 200;  // 超过这个数量就不做实时的副本预览（避免几千块卡死）
let mirrorActive = false;
let mirrorGizmoMode = 'move';      // 'move' 位移（三轴箭头）| 'rot' 旋转（三轴圆环）
let mirrorMode = 'free';          // 'free' 自由对称面 | 'face' 选取方块某个面作为对称面
let mirrorSelf = false;           // ★自身镜像：把源方块本身反射过去（不新建方块），见 mirrorCommitSelf
let mirrorFacePicking = false;    // 面选取阶段（对称面尚未确定）
let mirrorPlanePos = new THREE.Vector3();      // 对称面锚点（世界空间）
let mirrorPlaneQuat = new THREE.Quaternion();  // 对称面朝向（局部 +Z = 面法线）
let mirrorPlaneW = 2, mirrorPlaneH = 2;        // 对称面尺寸（世界单位，面选取时与所选面完全一致）
let mirrorSrc = [];               // 进入镜像时的源方块快照
let mirrorSrcIds = '';
let mirrorRoot = null;
let mirrorPlaneMesh = null;
let mirrorPlaneFill = null;       // 填充薄板（侧看时靠它保证可见厚度，见 mirrorUpdateEdgeThickness）
let mirrorPlaneGhost = null;      // 不做深度测试的淡色同款薄板：被方块挡住时仍能看见对称面
// 薄板的最小表观厚度（屏幕像素）。侧看时是一条清楚的色带，正对时几乎无感（只多出 ±6px 的边缘）。
const MIRROR_EDGE_MIN_PX = 12;
let mirrorHoverRoot = null;       // 面选取阶段的悬停高亮（预览「你将选中的那个面」）
let mirrorHoverKey = '';          // 悬停面指纹：同一张面不重复重建几何
let mirrorCutRoot = null;         // 平面与模型相交线的容器（世界坐标，独立于 mirrorRoot）
let mirrorPreview = [];           // [{src, block}] 实时镜像预览
let mirrorBubbleEl = null;

// 镜像只复制「静态几何」：表达式结果会随时间/随机数变化的方块不参与（副本会被脚本重新摆位，无意义）
/* ★【2026-10-25 用户纠正】不能一刀切拦掉所有 molang 方块：
   图上那串就是全常量赋值（`v.xpos=0; v.ypos=0; … v.scale=1;`），结果恒定，镜像完全可行。
   判据改成「这份表达式是否**会变**」：
   · 引用了动画时间 / 查询量 / 全局变量 / 临时量 / 随机数 → 每帧都可能不同 ⇒ 不能镜像；
   · 语句里等号右侧又读了别的 `v.*` → 可能逐帧累积/互相依赖 ⇒ 不能镜像；
   · 其余（纯常量赋值，含四则与常函数）→ 静态，可以镜像。 */
const MIRROR_DYNAMIC_SRC = /\b(?:q\.|query\.|variable\.|temp\.|t\.|context\.|math\.(?:random|die_roll|roll))\b/i;
function mirrorProgramIsStatic(prog) {
    if (!prog) return true;
    if (MIRROR_DYNAMIC_SRC.test(prog)) return false;
    for (const stmt of prog.split(';')) {
        const eq = stmt.indexOf('=');
        if (eq < 0) continue;
        if (/\bv\./i.test(stmt.slice(eq + 1))) return false;
    }
    return true;
}
function mirrorCanMirror(b) {
    return mirrorProgramIsStatic(b.scope.program);
}
/* ★【2026-10-31 用户纠正】镜像结果只能用正 scale（FMBE 原版不支持负 scale / 负 extend_scale）。
   正 scale 表达反射的唯一办法是把 improper 因子藏进【局部模型】（M 是局部形状的一个反射对称）：
   · cube / halfbrick / stair：M = diag(1,1,-1)（局部 z 轴反射；三者都关于 z=0 对称，楼梯两个盒子的 z 都是 [−0.5,0.5]）。
   · dropitem：贴图平面挤出、厚度沿局部 Y、上下两面同图 ⇒ M = diag(1,-1,1)
     （真正的对称面是 y = DROP_ITEM_XFORM.y，平移差额折进 basepos，见 mirrorParamsOf）。
   flag（偏心旗杆 + 倾斜旗面）没有任何反射对称 ⇒ null。 */
function mirrorShapeKind(b) {
    const t = (b && b.type) || 'cube';
    if (t === 'cube' || t === 'halfbrick' || t === 'stair') return 'zflip';
    if (t === 'dropitem') return 'ydrop';
    return null;
}
function mirrorShapeMirrorable(b) { return !!mirrorShapeKind(b); }
// 局部几何的反射对称矩阵（世界/局部坐标 = 模型注册表里烘焙后的几何坐标）
function mirrorSymmetryMatrix(kind) {
    // 只取「过局部原点」的纯反射（带平移的对称面会把 Rg' 变成非正交矩阵，无法反解成欧拉角）：
    //   zflip → diag(1,1,-1)；ydrop → diag(1,-1,1)（对称面 y=y₀ 的平移在 mirrorParamsOf 里折进 basepos）
    return kind === 'ydrop'
        ? new THREE.Matrix4().makeScale(1, -1, 1)
        : new THREE.Matrix4().makeScale(1, 1, kind === 'zflip' ? -1 : 1);
}
// 源方块的世界包围盒（用于摆对称面尺寸 / 默认位置）
function mirrorSelectionBox() {
    const box = new THREE.Box3();
    const tmp = new THREE.Vector3();
    for (const b of mirrorSrc) {
        // ★ 只取网格本身的顶点：b.mesh 可能挂着选中线框/坐标轴等子对象，
        //   直接用 expandByObject 会把它们算进包围盒（实测 1 格方块被撑到 2.5 格 → 对称面莫名巨大）
        for (const m of b.getMeshes()) {
            m.updateMatrixWorld(true);
            const pos = m.geometry?.attributes?.position;
            if (!pos) continue;
            const n = pos.count;
            for (let i = 0; i < n; i++) box.expandByPoint(tmp.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
        }
    }
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
    return box;
}
// 任意平面反射矩阵 F = I − 2·n·nᵀ（n 为单位法线）
function mirrorReflectMatrix(n) {
    const F = new THREE.Matrix4();
    F.set(
        1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
        -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
        -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0,
        0, 0, 0, 1
    );
    return F;
}
// 当前对称面的世界法线与平面方程常数 d（n·p = d）
function mirrorPlaneWorld() {
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(mirrorPlaneQuat).normalize();
    return { n, d: n.dot(mirrorPlanePos) };
}
// 全局旋转按 Ry(-ry')·Rx(rx')·Rz(-rz') 的顺序反解（与 computeTransformMatrix 的 globalRot 同序）
function mirrorDecomposeGlobal(R) {
    const e = R.elements;
    const sinB = Math.max(-1, Math.min(1, -e[9]));
    let rrx = Math.asin(sinB);
    const cosB = Math.cos(rrx);
    let rry, rrz;
    if (Math.abs(cosB) > 1e-6) {
        rry = -Math.atan2(e[8], e[10]);
        rrz = -Math.atan2(e[1], e[5]);
    } else {                       // 万向锁（rx≈±90°）：改用第一列求 rx
        rry = -Math.asin(sinB);
        rrz = 0;
        rrx = Math.atan2(-e[2], e[0]);
    }
    return {
        rotatex: THREE.MathUtils.radToDeg(rrx),
        rotatey: THREE.MathUtils.radToDeg(rry),
        rotatez: THREE.MathUtils.radToDeg(rrz)
    };
}
// 由源方块当前位姿 + 对称面 → 镜像副本的 13 个核心值
function mirrorParamsOf(src, plane) {
    const M = src.scope.toM();
    const rx = src.scope.vars.get('v.rotatex')?.value ?? 0;
    const ry = src.scope.vars.get('v.rotatey')?.value ?? 0;
    const rz = src.scope.vars.get('v.rotatez')?.value ?? 0;
    const pos = new THREE.Vector3(M[0], M[1], M[2]);
    // 位置沿法线翻到对称面另一侧：p' = p − 2(n·p − d)n
    pos.addScaledVector(plane.n, -2 * (plane.n.dot(pos) - plane.d));
    // 反射矩阵 F
    const F = mirrorReflectMatrix(plane.n);
    // 局部几何的反射对称（见 mirrorShapeKind / mirrorSymmetryMatrix）
    const kind = mirrorShapeKind(src);
    const Mloc = mirrorSymmetryMatrix(kind);
    // 全局旋转 Rg = Ry(-ry)·Rx(rx)·Rz(-rz)
    const Rg = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(-ry));
    Rg.multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(rx)));
    Rg.multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(-rz)));
    // Rg' = F·Rg·M（M 无平移、三轴对齐 ⇒ 可以整体挪进全局旋转，同时把 M 从局部链里「换出来」）
    const Rn = F.clone().multiply(Rg).multiply(Mloc);
    const ang = mirrorDecomposeGlobal(Rn);
    let xrot, yrot, zrot, ex, ey, bp;
    if (kind === 'ydrop') {
        /* 掉落物：M = T(2y₀)·D_y 是关于 y = y₀ 的反射，而 Rg' 里只能用无平移的 D_y。
           局部链 L = R·B(b)（B 在最右，先作用于几何），要求 L' = D_y·L·M：
             L·M = R·T(b)·T(2y₀·ŷ)·D_y = T(A_R·(b+2y₀ŷ))·D_y·R'      （R' = D_y·R·D_y）
             ⇒ L' = R'·T(b')，b' = A_R'⁻¹·D_y·A_R·(b+2y₀ŷ) = D_y·(b+2y₀ŷ)
               （A_R' = D_y·A_R·D_y 且 D_y² = I ⇒ 缩放/剪切全部约掉，与 A_R 无关）
           ⇒ basepos' = (bx, −(by + 2y₀), bz)。
           D_y 的共轭规则：R_x / R_z 变号，R_y 与所有对角缩放不变。 */
        bp = new THREE.Vector3(M[10], -(M[11] + 2 * DROP_ITEM_XFORM.y), M[12]);
        xrot = -M[3]; yrot = M[4]; zrot = -M[5];
        ex = -M[8]; ey = M[9];
    } else {
        /* M = diag(1,1,-1) 只与「绕 z 的旋转」「对角缩放」可交换 ⇒ x/y 旋转取反、z 旋转不变；
           basepos 是局部平移，M 会把它翻向（z 取反）。 */
        bp = new THREE.Vector3(M[10], M[11], M[12]).applyMatrix4(Mloc);
        xrot = -M[3]; yrot = -M[4]; zrot = M[5];
        ex = -M[8]; ey = -M[9];
    }
    return {
        pos,
        rotatex: ang.rotatex, rotatey: ang.rotatey, rotatez: ang.rotatez,
        /* ★【2026-10-31】FMBE 不支持负 scale ⇒ 保持正（旧实现这里是 −M[6]）。 */
        scale: Math.abs(M[6]),
        xrot, yrot, zrot,
        extend_scale: M[7],
        extend_xrot: ex, extend_yrot: ey,
        basepos: [bp.x, bp.y, bp.z]
    };
}
// 复制出一个镜像副本（不复制非核心变量/骨骼绑定/关键帧：副本是一条静态地理）
function mirrorBuildCopy(src, mp, usedIds) {
    const base = src.type === 'flag' ? 'Flag'
        : src.type === 'dropitem' ? 'DropItem'
            : src.type === 'stair' ? 'Stair'
                : src.type === 'halfbrick' ? 'Halfbrick'
                    : 'Cube';
    let id = base, n = 1;
    while (blocks.some(b => b.id === id) || usedIds.has(id)) id = base + (n++);
    usedIds.add(id);
    const nb = new Block(id,
        // M[3..9]：局部旋转 / extend 参数按 M = diag(1,1,-1) 换算（x/y 取反、z 保留）
        [mp.pos.x, mp.pos.y, mp.pos.z, mp.xrot, mp.yrot, mp.zrot, mp.scale,
         mp.extend_scale, mp.extend_xrot, mp.extend_yrot, mp.basepos[0], mp.basepos[1], mp.basepos[2]],
        src.textureUrl, src.materialColor, src.type, src.group,
        src.faceTextures ? src.faceTextures.slice() : null, src.forceDoubleSide);
    nb.materialType = src.materialType;
    nb.facePresetKey = src.facePresetKey;
    nb.materialPresetName = src.materialPresetName;
    if (src.loomCode) { nb.loomCode = src.loomCode; nb.loomUrl = src.loomUrl; }
    mirrorSetVar(nb, 'v.rotatex', mp.rotatex);
    mirrorSetVar(nb, 'v.rotatey', mp.rotatey);
    mirrorSetVar(nb, 'v.rotatez', mp.rotatez);
    nb.refresh();
    return nb;
}
// 对称面可视化。
/* ★【2026-10-24 用户反馈】原来的「半透明面 + depthTest:false 亮边」把整张面盖在所有模型之上，
   既看不出平面在空间的哪儿、也看不出它和模型谁在前谁在后 ⇒ 完全判断不了位置。
   现在的三层信息叠加（由弱到强）：
   · 屏幕门填充：像素交错镂空 + alpha≈1 ⇒ 远处的方块被它「实心」盖住、近处的方块也能透出一半，
     既有实体感（不再是那种轻飘飘的玻璃片），又不会像真·不透明面那样把模型全糊掉；
   · 深度测试网格 —— 被模型挡住的线段自然消失，留下的缺口就是平面与模型的遮挡边界；
   · 不与模型求交也不会瞎猜的「相交线」（见 mirrorRebuildCutLines）—— 直接画出平面切过模型的位置；
   · 边框 + 四角括号 + 面心短十字不做深度测试 —— 任何时候都能看清边界、朝向与锚点。 */
function mirrorRemoveCut() {
    if (!mirrorCutRoot) return;
    scene.remove(mirrorCutRoot);
    mirrorCutRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    mirrorCutRoot = null;
}
function mirrorRemovePlane() {
    mirrorRemoveCut();
    if (mirrorRoot) {
        scene.remove(mirrorRoot);
        mirrorRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        mirrorRoot = null;
    }
    mirrorPlaneMesh = null;
    mirrorPlaneFill = null;
    mirrorPlaneGhost = null;
}
// 线材质工厂：depthTest 决定是否会被模型遮挡
function mirrorLineMat(color, opacity, depthTest) {
    return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest, depthWrite: false });
}
function mirrorLineSeg(arr, color, opacity, depthTest, order) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const l = new THREE.LineSegments(g, mirrorLineMat(color, opacity, depthTest));
    l.renderOrder = order;
    return l;
}
// 对称面配色：浅色主题用深青系线条压住淡青填充；深色主题反之（否则网格与填充同色 = 看不见网格）
function mirrorPalette() {
    const light = document.body.classList.contains('light-mode');
    return light
        ? { fill: 0x0ea5e9, fillAlpha: 0.20, minor: 0x0284c7, major: 0x075985, edge: 0x082f49, cut: 0xc026d3 }
        : { fill: 0x38bdf8, fillAlpha: 0.16, minor: 0x7dd3fc, major: 0xffffff, edge: 0xffffff, cut: 0xe879f9 };
}
// 平面与方块的相交线：把每个方块的 12 条盒子棱与平面求交，交点连成亮线。
// ★这是「一眼判断平面到底在哪」最关键的线索 —— 其余手段（网格/边框/填充）只说明面朝哪、有多大，
//   只有相交线能说明它此刻正切过模型的什么位置。
function mirrorRebuildCutLines() {
    mirrorRemoveCut();
    if (!mirrorActive || !blocks.length) return;
    const { n, d } = mirrorPlaneWorld();
    // 面内正交基：角度排序要用
    const uB = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.dot(uB)) > 0.95) uB.set(0, 1, 0);
    uB.crossVectors(n, uB).normalize();
    const vB = new THREE.Vector3().crossVectors(n, uB).normalize();
    const arr = [], a = new THREE.Vector3(), b = new THREE.Vector3();
    const EDGES = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
    let used = 0;
    for (const blk of blocks) {
        if (used >= 240) break;                 // 上限：超高模时不做相交线，避免拖拽时卡顿
        if (isBlockHidden(blk) || !blk.mesh) continue;
        used++;
        for (const m of blk.getMeshes()) {
            if (!m.geometry) continue;
            if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
            const bb = m.geometry.boundingBox;
            if (!bb) continue;
            m.updateMatrixWorld(true);
            // 8 个角（AABB 经仿射变换后棱仍是直线 → 直接拿 12 条棱做线段-平面求交）
            const cs = [];
            for (let i = 0; i < 8; i++) {
                cs.push(new THREE.Vector3(
                    i & 1 ? bb.max.x : bb.min.x,
                    i & 2 ? bb.max.y : bb.min.y,
                    i & 4 ? bb.max.z : bb.min.z
                ).applyMatrix4(m.matrixWorld));
            }
            const hits = [];
            for (const [i0, i1] of EDGES) {
                a.copy(cs[i0]); b.copy(cs[i1]);
                const da = n.dot(a) - d, db = n.dot(b) - d;
                if ((da > 1e-6 && db > 1e-6) || (da < -1e-6 && db < -1e-6)) continue;  // 整条棱在同一侧
                const t = Math.abs(da - db) < 1e-9 ? 0.5 : da / (da - db);
                if (t < 0 || t > 1) continue;
                const p = a.clone().lerp(b, t);
                if (hits.some(q => q.distanceToSquared(p) < 1e-10)) continue;          // 顶点重复命中
                hits.push(p);
            }
            if (hits.length < 2) continue;
            // 凸盒与平面相交必得凸多边形：按面内极角排序后首尾相连
            const ctr = new THREE.Vector3();
            hits.forEach(p => ctr.add(p));
            ctr.multiplyScalar(1 / hits.length);
            hits.sort((p, q) => {
                const pa = Math.atan2(p.clone().sub(ctr).dot(vB), p.clone().sub(ctr).dot(uB));
                const qa = Math.atan2(q.clone().sub(ctr).dot(vB), q.clone().sub(ctr).dot(uB));
                return pa - qa;
            });
            for (let i = 0; i < hits.length; i++) {
                const p = hits[i], q = hits[(i + 1) % hits.length];
                arr.push(p.x, p.y, p.z, q.x, q.y, q.z);
            }
        }
    }
    if (!arr.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    // depthTest:false：相交线正好贴在方块表面上，测深度会与面 z-fighting 闪烁
    const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
        color: mirrorPalette().cut, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false
    }));
    line.renderOrder = 999;
    mirrorCutRoot = new THREE.Group();
    mirrorCutRoot.add(line);
    scene.add(mirrorCutRoot);
    bumpDrawRev('mat');
}
// 填充薄板的「表观厚度」：按当前相机距离把 MIRROR_EDGE_MIN_PX 像素换算成世界单位
function mirrorUpdateEdgeThickness() {
    if (!mirrorPlaneFill) return;
    const hPx = renderer.domElement.clientHeight || 1;
    const dist = Math.max(0.05, camera.position.distanceTo(mirrorPlanePos));
    // 该距离上 1 像素 = 多少世界单位（透视相机、竖直视场）
    const worldPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist) / hPx;
    const t = MIRROR_EDGE_MIN_PX * worldPerPx;
    // 变化不明显就不写（避免每帧改矩阵、触发无谓的重建标记）
    if (Math.abs(mirrorPlaneFill.scale.z - t) > Math.max(1e-4, t * 0.02)) {
        mirrorPlaneFill.scale.z = t;
        if (mirrorPlaneGhost) mirrorPlaneGhost.scale.z = t;
    }
}
function mirrorPlaneCore() {
    mirrorRemovePlane();
    const w = mirrorPlaneW, h = mirrorPlaneH;
    const hw = w / 2, hh = h / 2;
    const root = new THREE.Group();
    // ① 屏幕门（screen-door）填充：按屏幕像素交错丢一半像素、留下的一半 alpha≈1。
    //    结果是一张看起来「实心」的面（远看是一整片颜色、有实体感），但仍有 50% 像素能看穿，
    //    因此既不像半透明玻璃那样判断不了空间位置，也不像全不透明面那样糊死模型。
    //    ★这是用户要求的「特殊手段」：不透明观感 + 保留可读性，二者兼得。
    const pal = mirrorPalette();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    /* ★★【2026-10-25 再修 · 用户第 3 次反馈「拖一下视角对称面就消失」】
       ★真凶不是对象被删（探针证明 active/hasPlane 全真），而是**侧看时面在屏幕上退化成 1px 线**：
         自由对称面默认法线 = 世界 X，而默认相机在 (0,1.2,7) 沿 −Z 看 ⇒ |n·view| = 0，
         面正好侧对镜头、投影面积为 0；拖动视角时任何接近这个方位的姿态都会让它「看不见」。
       修法：把填充从**零厚度平面**换成**厚度随相机距离自适应的薄板**（局部 Z 上按像素换算，
       永远保证 ≥ MIRROR_EDGE_MIN_PX 像素的表观厚度）⇒ 正对时与原来一模一样，
       侧看时是一条足够宽、看得清的实体色带 + 亮边框，任何角度都不会「消失」。
       厚度只用于显示（数学上的对称面仍是零厚度的 mirrorPlanePos/mirrorPlaneQuat）。 */
    /* 填充薄板：正面/背面走棋盘淡色；**侧面（= 侧看时唯一看得见的那部分）走饱和实色**。
       这是「侧看也一定认得出对称面」的关键：原来的零厚度平面在侧看时投影面积为 0，
       只剩一条 1px 网格线，用户观感就是「一拖视角就消失了」。 */
    const fillMat = (alpha, sideAlpha, useDepth) => new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(pal.fill) }, uSide: { value: new THREE.Color(pal.edge) },
            uDpr: { value: dpr }, uAlpha: { value: alpha }, uSideAlpha: { value: sideAlpha }
        },
        vertexShader: 'varying vec3 vObjN; void main(){ vObjN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: [
            'uniform vec3 uColor; uniform vec3 uSide; uniform float uDpr; uniform float uAlpha; uniform float uSideAlpha;',
            'varying vec3 vObjN;',
            'void main(){',
            '  if (abs(vObjN.z) < 0.5) { gl_FragColor = vec4(uSide, uSideAlpha); return; }',   // 侧面：实色色带
            '  vec2 p = floor(gl_FragCoord.xy / uDpr);',       // 以 CSS 像素为单位，避免高 DPI 下图案变碎
            '  if (mod(p.x + p.y, 2.0) < 1.0) discard;',       // 棋盘交错：留一半像素
            '  gl_FragColor = vec4(uColor, uAlpha);',
            '}'
        ].join('\n'),
        transparent: true, depthTest: useDepth, depthWrite: false, side: THREE.DoubleSide
    });
    const fill = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1), fillMat(0.92, 0.92, true));
    fill.renderOrder = 900;
    root.add(fill);
    mirrorPlaneFill = fill;
    /* ★【2026-10-25 第二次补强 · 对称面被自身方块遮住就「看不见」】
       「以方块面作对称面」时对称面与那个面严格重合（只沿法线外移 1cm），
       转到方块背面时整块面被方块挡住，边框又和方块轮廓重合 ⇒ 观感就是「一拖视角就消失」。
       补一层**不做深度测试的淡色同款棋盘**：被挡住时它仍是淡淡一片 + 亮边框（后面 ③ 的线条本就 depthTest:false），
       正对时它被上层 0.92 的主填充盖住，正常使用完全无感。 */
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1), fillMat(0.26, 0.42, false));
    ghost.renderOrder = 899;
    root.add(ghost);
    mirrorPlaneGhost = ghost;
    mirrorUpdateEdgeThickness();   // 立刻按当前相机距离定厚度（不要等到下一帧才变厚）
    // ② 网格（深度测试）：分格数按世界尺寸取，保证格子近似正方形
    const cell = 0.25;
    const nx = Math.max(2, Math.round(w / cell)), ny = Math.max(2, Math.round(h / cell));
    const minor = [], major = [];
    for (let i = 0; i <= nx; i++) {
        const x = -hw + (w * i) / nx;
        (i % 4 === 0 ? major : minor).push(x, -hh, 0, x, hh, 0);
    }
    for (let j = 0; j <= ny; j++) {
        const y = -hh + (h * j) / ny;
        (j % 4 === 0 ? major : minor).push(-hw, y, 0, hw, y, 0);
    }
    root.add(mirrorLineSeg(minor, pal.minor, 0.5, true, 901));
    root.add(mirrorLineSeg(major, pal.major, 0.9, true, 902));
    // ③ 边框 + 四角括号（不做深度测试）：任何角度都能读到平面的边界与朝向
    const border = [ -hw,-hh,0, hw,-hh,0,  hw,-hh,0, hw,hh,0,  hw,hh,0, -hw,hh,0,  -hw,hh,0, -hw,-hh,0 ];
    root.add(mirrorLineSeg(border, pal.edge, 0.95, false, 996));
    // 双线边框：往里缩 2px 当量的一条内框，让「面」有厚度感（不依赖 linewidth，浏览器普遍忽略它）
    const inset = Math.min(w, h) * 0.012, iw = hw - inset, ih = hh - inset;
    root.add(mirrorLineSeg([ -iw,-ih,0, iw,-ih,0,  iw,-ih,0, iw,ih,0,  iw,ih,0, -iw,ih,0,  -iw,ih,0, -iw,-ih,0 ], pal.edge, 0.55, false, 995));
    const k = Math.min(w, h) * 0.16, tick = [];
    [[-hw,-hh,1,1], [hw,-hh,-1,1], [hw,hh,-1,-1], [-hw,hh,1,-1]].forEach(([x, y, sx, sy]) => {
        tick.push(x, y, 0, x + sx * k, y, 0);
        tick.push(x, y, 0, x, y + sy * k, 0);
    });
    root.add(mirrorLineSeg(tick, pal.edge, 0.95, false, 997));
    // ④ 面心短十字（X 暖色 / Y 冷绿）：锚点位置与面内朝向，配色与两条倾斜圆环一致
    const c = Math.min(w, h) * 0.12;
    root.add(mirrorLineSeg([-c,0,0, c,0,0], 0xf59e0b, 0.95, false, 998));
    root.add(mirrorLineSeg([0,-c,0, 0,c,0], 0x22c55e, 0.95, false, 998));
    root.position.copy(mirrorPlanePos)
        .addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(mirrorPlaneQuat), MIRROR_VISUAL_EPS);
    root.quaternion.copy(mirrorPlaneQuat);
    scene.add(root);
    mirrorRoot = root;
    mirrorPlaneMesh = fill;
    mirrorRebuildCutLines();
    bumpDrawRev('mat');
}
// 自由对称面：尺寸按源包围盒；法线默认沿世界 X（贴着包围盒 x 最小侧）
function mirrorCreatePlane() {
    const box = mirrorSelectionBox();
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 0.5);
    mirrorPlaneW = mirrorPlaneH = Math.max(1.6, span * 1.35 + 0.4);
    mirrorPlaneCore();
}
// 面选取得到的精确面 → 对称面；尺寸取该面自身的长宽，保证与世界里的那个面完全重合
function mirrorCreatePlaneFromFace(rect) {
    mirrorPlaneW = Math.max(rect.w, 0.05);
    mirrorPlaneH = Math.max(rect.h, 0.05);
    mirrorPlaneCore();
}
// 视觉上的微小法线偏移：面选取时对称面与方块表面严格重合，不偏移就会 z-fighting 闪烁。
// 1cm 在方块尺度下肉眼不可见，但足以让网格线稳定显示；数学上仍用零偏移的 mirrorPlanePos。
const MIRROR_VISUAL_EPS = 0.01;
// 对称面实体 → 场景（Gizmo 中心同步到面锚点）
function mirrorUpdatePlane() {
    if (!mirrorRoot) return;
    mirrorRoot.position.copy(mirrorPlanePos).addScaledVector(mirrorPlaneWorld().n, MIRROR_VISUAL_EPS);
    mirrorRoot.quaternion.copy(mirrorPlaneQuat);
    mirrorRoot.updateMatrixWorld(true);
    gizmoRoot.position.copy(mirrorPlanePos);
    mirrorRebuildCutLines();     // 平面一动，它与模型的相交位置就变了
    bumpDrawRev('mat');
}
// 写入变量：核心变量 initFromM 已建好；全局旋转 rotatex/rotatey/rotatez 需按需新建
function mirrorSetVar(b, name, v) {
    const d = b.scope.vars.get(name);
    if (d) { d.expr = String(v); d.value = v; }
    else b.scope.addVar(name, String(v), -180, 180, 0.5);
}
// 预览块只更新字面常量（不引入任何表达式，避免依赖已不存在的父级全局）
function mirrorApplyParams(b, mp) {
    const set = (name, v) => {
        const d = b.scope.vars.get(name);
        if (d) { d.expr = String(v); d.value = v; }
    };
    set('v.xpos', mp.pos.x); set('v.ypos', mp.pos.y); set('v.zpos', mp.pos.z);
    set('v.scale', mp.scale);
    // ★【2026-10-31】局部 improper 对称 M = diag(1,1,-1)：局部 x/y 旋转与 extend x/y 旋转取反，
    //   z 旋转与 extend_scale 不变，basepos 是局部平移 ⇒ z 取反（见 mirrorParamsOf 推导）
    set('v.xrot', mp.xrot); set('v.yrot', mp.yrot); set('v.zrot', mp.zrot);
    set('v.extend_scale', mp.extend_scale);
    set('v.extend_xrot', mp.extend_xrot); set('v.extend_yrot', mp.extend_yrot);
    set('v.xbasepos', mp.basepos[0]); set('v.ybasepos', mp.basepos[1]); set('v.zbasepos', mp.basepos[2]);
    mirrorSetVar(b, 'v.rotatex', mp.rotatex);
    mirrorSetVar(b, 'v.rotatey', mp.rotatey);
    mirrorSetVar(b, 'v.rotatez', mp.rotatez);
    b.refresh();
}
function mirrorUpdatePreviews() {
    const plane = mirrorPlaneWorld();
    for (const rec of mirrorPreview) {
        if (!rec.block || !rec.block.mesh) continue;
        mirrorApplyParams(rec.block, mirrorParamsOf(rec.src, plane));
    }
}
/* ★【2026-10-25 用户要求】「镜像预览显示的方块能否把它搞得特别一些？以表示这个方块是预览的」
   做法＝不改几何、不改颜色（免得误导用户以为镜像后就是这个颜色），只加两样「全息」特征：
   · 半透明 + 关深度写入：能透出后面的方块，一眼区分实体；
   · 每一段棱线一根亮青色线（实体块平时没有任何棱线，这是最强区分点）；
   不再加发光/脉冲（避免喧宾夺主、也不增加每帧开销）。
   皮肤信息存在 WeakMap（材质 → 原属性），提交转正时由 mirrorUnskinPreview 原样还原。 */
const _mirrorSkinSaved = new WeakMap();
const MIRROR_PREVIEW_EDGE = 0x22d3ee;     // 预览棱线（青色，与对称面的深藏青区分开）
function mirrorSkinPreview(block) {
    const meshes = (typeof block.getMeshes === 'function' ? block.getMeshes() : [block.mesh]) || [];
    for (const mesh of meshes) {
        if (!mesh || !mesh.geometry) continue;
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(mesh.geometry, 30),
            new THREE.LineBasicMaterial({ color: MIRROR_PREVIEW_EDGE, transparent: true, opacity: 0.9, depthWrite: false })
        );
        edges.name = '__mirrorPreviewEdge';
        edges.renderOrder = 991;
        edges.frustumCulled = false;
        mesh.add(edges);   // 挂在网格下：跟着方块的矩阵（含负 scale）走，无需逐帧同步
        forEachMat(mesh, m => {
            if (!m || _mirrorSkinSaved.has(m)) return;
            _mirrorSkinSaved.set(m, {
                transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite,
                color: m.color ? m.color.clone() : null
            });
            // 玻璃类本来就是半透明：取更低的那个，不要把原样弄得更实
            m.opacity = Math.min(m.opacity == null ? 1 : m.opacity, 0.6);
            m.transparent = true;
            m.depthWrite = false;
            if (m.color) m.color.lerp(new THREE.Color(MIRROR_PREVIEW_EDGE), 0.22);   // 极轻的青色偏移：像「全息投影」而不是变了个色
            m.needsUpdate = true;
        });
    }
}
function mirrorUnskinPreview(block) {
    const meshes = (typeof block.getMeshes === 'function' ? block.getMeshes() : [block.mesh]) || [];
    for (const mesh of meshes) {
        if (!mesh) continue;
        for (let i = mesh.children.length - 1; i >= 0; i--) {
            const o = mesh.children[i];
            if (o.name !== '__mirrorPreviewEdge') continue;
            mesh.remove(o);
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        }
        forEachMat(mesh, m => {
            const s = m && _mirrorSkinSaved.get(m);
            if (!s) return;
            _mirrorSkinSaved.delete(m);
            m.transparent = s.transparent;
            m.opacity = s.opacity;
            m.depthWrite = s.depthWrite;
            if (m.color && s.color) m.color.copy(s.color);
            m.needsUpdate = true;
        });
    }
}
function mirrorClearPreviews(dispose) {
    for (const rec of mirrorPreview) {
        const b = rec.block;
        if (!b) continue;
        if (dispose) {
            if (b.rootGroup) {
                if (b.rootGroup.parent) b.rootGroup.parent.remove(b.rootGroup);
                b.rootGroup.traverse(o => {
                    if (o.geometry && o.geometry.dispose) o.geometry.dispose();
                    if (o.material) o.material.dispose();
                });
            }
            if (b.mesh && b.mesh.parent && (!b.rootGroup || b.mesh !== b.rootGroup)) b.mesh.parent.remove(b.mesh);
            if (b.label && b.label.parent) b.label.parent.remove(b.label);
        }
    }
    mirrorPreview = [];
}
function mirrorBuildPreviews() {
    mirrorClearPreviews(true);
    // ★只预览「能严格镜像」的方块：脚本驱动 / 模型没有反射对称（旗帜）的不生成预览
    const srcs = mirrorSrc.filter(b => mirrorCanMirror(b) && mirrorShapeMirrorable(b));
    if (srcs.length > MIRROR_PREVIEW_MAX) return;   // 太多：不做实时预览，提交时再逐块生成
    const plane = mirrorPlaneWorld();
    const used = new Set();
    for (const src of srcs) {
        const nb = mirrorBuildCopy(src, mirrorParamsOf(src, plane), used);
        scene.add(nb.mesh);
        mirrorSkinPreview(nb);   // 全息预览外观（半透明 + 青色棱线），提交时还原
        mirrorPreview.push({ src, block: nb });
    }
    bumpDrawRev('mat');
}
function mirrorCloseBubble() {
    if (mirrorBubbleEl) { mirrorBubbleEl.remove(); mirrorBubbleEl = null; }
}
function mirrorUpdateBubble() {
    const info = document.getElementById('mirrorBubbleInfo');
    if (!info) return;
    const p = mirrorPlanePos;
    const t = v => (Math.round(v * 1000) / 1000);
    info.textContent = '对称面中心：' + t(p.x) + ', ' + t(p.y) + ', ' + t(p.z) +
        '　预览：' + mirrorPreview.length + ' 个　模式：' + (mirrorGizmoMode === 'move' ? '位移' : '旋转');
}
/* ★【2026-10-31 用户要求】结果方式切换控件：镜像模型生成（复制新方块） ↔ 自身对称（把方块本身反射过去，不复制）。
   三种对称方式（自由对称面 / 选取面 / 三点定面）的气泡都挂这同一套切换，
   因此任意入口都能自由组合「哪种定面方式 + 哪种结果方式」。
   视觉沿用整体简约风格：当前项加粗下划线，未选项淡出（不用胶囊样式）。 */
function mirrorSelfSwitchHtml() {
    return '<div style="margin-top:6px;">结果方式：<span class="mirror-self-opt" data-self="0" style="cursor:pointer;">镜像模型生成</span>' +
        '<span style="opacity:.4;">　/　</span>' +
        '<span class="mirror-self-opt" data-self="1" style="cursor:pointer;">自身对称</span></div>' +
        '<div id="mirrorSelfHint" style="margin-top:4px;opacity:.75;"></div>';
}
function mirrorSelfHintText() {
    return mirrorSelf
        ? '自身对称：把方块本身反射过去，不新建方块（有关键帧动画时写入当前时刻的帧）'
        : '镜像模型生成：在对称面另一侧生成新方块';
}
function mirrorSyncSelfSwitchUI() {
    if (!mirrorBubbleEl) return;
    mirrorBubbleEl.querySelectorAll('.mirror-self-opt').forEach(sp => {
        const on = (sp.dataset.self === '1') === mirrorSelf;
        sp.style.fontWeight = on ? '600' : '400';
        sp.style.textDecoration = on ? 'underline' : 'none';
        sp.style.opacity = on ? '1' : '.55';
    });
    // 说明文字随切换同步（否则切到自身对称后仍显示「生成新方块」的解释，误导用户）
    const hint = mirrorBubbleEl.querySelector('#mirrorSelfHint');
    if (hint) hint.textContent = mirrorSelfHintText();
    const ok = mirrorBubbleEl.querySelector('.tb-ok');
    // 选面 / 选点阶段的气泡只有「取消」一个出口，不能把按钮文案改成结果方式
    if (ok && !mirrorFacePicking && !mirrorVtxPicking) ok.textContent = mirrorSelf ? '自身对称' : '镜像';
}
function mirrorAttachSelfSwitch(el) {
    if (!el) return;
    // 结果方式在气泡里随时可切（生成模型 ↔ 自身对称），无需重新进入工具
    el.querySelectorAll('.mirror-self-opt').forEach(sp => {
        sp.addEventListener('click', (e) => {
            e.stopPropagation();
            const want = sp.dataset.self === '1';
            if (want === mirrorSelf) return;
            mirrorSelf = want;
            mirrorSyncSelfSwitchUI();
            if (!mirrorFacePicking && !mirrorVtxPicking) mirrorUpdateBubble();
            bumpDrawRev('mat');
        });
    });
    mirrorSyncSelfSwitchUI();
}
function mirrorShowBubble() {
    mirrorCloseBubble();
    const el = showTechBubble('镜像', '', {
        contentHtml: '<div id="mirrorBubbleInfo"></div>' +
            mirrorSelfSwitchHtml() +
            '<div style="margin-top:6px;opacity:.75;">顶栏「枢轴 / 旋转」切换：三轴箭头平移　三轴圆环旋转</div>',
        confirmText: mirrorSelf ? '自身对称' : '镜像', cancelText: '取消',
        onConfirm: () => mirrorCommit(),
        onCancel: () => mirrorExit(true)
    });
    mirrorBubbleEl = el;
    mirrorAttachSelfSwitch(el);
    mirrorUpdateBubble();
}
// 面选取阶段的提示气泡：此时还没有对称面，只有「取消」一个出口（结果方式可先切好）
function mirrorShowPickBubble() {
    mirrorCloseBubble();
    mirrorBubbleEl = showTechBubble('镜像', '', {
        contentHtml: '把鼠标移到方块表面：高亮的那一整块面，就是点下去后的对称面（两者完全重合）' +
            mirrorSelfSwitchHtml(),
        confirmText: '取消',
        onConfirm: () => mirrorExit(true)
    });
    mirrorAttachSelfSwitch(mirrorBubbleEl);
}
function mirrorCleanupScene() {
    mirrorVtxCleanup();   // 三点取点阶段的圆点图层是借顶点捕捉的，必须先交还
    mirrorClearPreviews(true);
    mirrorClearHover();
    mirrorRemovePlane();
    mirrorCloseBubble();
    renderer.domElement.style.cursor = '';
}
function mirrorExit(rebuild) {
    mirrorActive = false;
    mirrorFacePicking = false;
    mirrorSrc = [];
    mirrorSrcIds = '';
    mirrorCleanupScene();
    herModes.delete('mirror');
    applyMirrorToolbarUI();   // 顶栏恢复常规按钮（位移 / 缩放 / 顶点捕捉 / 两个旋转下拉）
    if (rebuild) rebuildGizmo();
}
// 当前镜像源（与 UI 选区同口径；极端情况下 selectedBlock 在集合外也能兜住）
function mirrorCurrentSel() {
    const arr = [...selectedBlocksSet];
    if (!arr.length) { const b = selected(); if (b) arr.push(b); }
    return arr;
}
// 进入镜像：mode='free' 自由对称面（默认法线沿世界 X、把世界原点夹进包围盒）；
//           mode='face' 先进入面选取阶段，点中任意方块的一个面后以「命中点 + 该面世界法线」定面。
//           self=true 进入「自身镜像」结果方式（可直接在气泡里切回复制）
function mirrorBegin(mode, self) {
    const srcs = mirrorCurrentSel();
    if (!srcs.length || selectedFolder || !isNewLayoutMode) {
        showToast('请先选中方块（文件夹不支持镜像）');
        return;
    }
    /* ★【2026-10-25 用户定稿】molang 表达式**结果会变**的方块不允许参与镜像（判据见 mirrorCanMirror）：
       副本一旦创建就会被脚本按原表达式重新摆位（位置/旋转/顶点每帧都在变），
       镜像结果与预览、对称面相交线全都会对不上 ⇒ 与其生成错误结果，不如在入口直接拦下。
       纯常量赋值的表达式（图上那种 `v.xpos=0; v.scale=1; …`）结果恒定，照常镜像。
       ★【2026-10-31 自身对称】有关键帧动画的方块**必须放行**：编译后的程序按时间取值，
       它属于「当前时刻是确定姿态」的情形；自身对称会把镜像姿态写成当前时刻的关键帧（见 mirrorCommitSelf），
       因此不受静态表达式限制（复制镜像仍然跳过它，见 mirrorCommit 的镜前过滤）。 */
    const scriptDriven = srcs.filter(b => !mirrorCanMirror(b) &&
        !(typeof hasKeyframeAnimation === 'function' && hasKeyframeAnimation(b.id)));
    if (scriptDriven.length) {
        showToast('选中的方块里有 ' + scriptDriven.length + ' 个的 molang 表达式会随动画变化（引用了动画时间 / 查询量 / 随机数），镜像结果无法固定，请取消选中后再试');
        return;
    }
    if (mirrorActive) mirrorCleanupScene();
    mirrorActive = true;
    mirrorSelf = !!self;
    mirrorMode = (mode === 'face') ? 'face' : (mode === 'vtx' ? 'vtx' : 'free');
    mirrorFacePicking = mirrorMode === 'face';
    mirrorSrc = srcs.slice();
    mirrorSrcIds = srcs.map(b => b.id).join(',');
    // 与顶点捕捉互斥（捕捉的画布图层优先级更高，不退出就会被盖住）
    if (herModes.has('vtxsnap')) {
        herModes.delete('vtxsnap');
        vtxSnapExit();
    }
    herModes.clear();
    herModes.add('mirror');
    mirrorGizmoMode = 'move';          // 每次进入默认「位移」：顶栏枢轴按钮高亮
    syncHerModeButtons();
    applyMirrorToolbarUI();            // 顶栏只留「枢轴 / 旋转」两个按钮
    if (mirrorFacePicking) {
        mirrorRemovePlane();
        mirrorClearPreviews(true);
        mirrorShowPickBubble();
        renderer.domElement.style.cursor = 'crosshair';
    } else if (mirrorMode === 'vtx') {
        // 三点定面：先进入取点阶段（对称面尚未确定），点满 3 个顶点才建面
        mirrorVtxPicking = true;
        mirrorRemovePlane();
        mirrorClearPreviews(true);
        mirrorShowVtxPickBubble();
        mirrorVtxEnter();
        renderer.domElement.style.cursor = 'crosshair';
    } else {
        const box = mirrorSelectionBox();
        const center = box.getCenter(new THREE.Vector3());
        const x = Math.min(Math.max(0, box.min.x), box.max.x);
        mirrorPlanePos.set(x, center.y, center.z);
        mirrorPlaneQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
        mirrorCreatePlane();
        mirrorBuildPreviews();
        mirrorShowBubble();
    }
    rebuildGizmo();
}
// 面选取完成：对称面与所选面「完全重合」（同平面 + 同中心 + 同长宽）
function mirrorApplyFace(rect) {
    if (!mirrorActive || !mirrorFacePicking) return;
    mirrorFacePicking = false;
    mirrorClearHover();
    mirrorPlanePos.copy(rect.center);
    mirrorPlaneQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rect.u, rect.v, rect.n));
    mirrorCreatePlaneFromFace(rect);
    mirrorBuildPreviews();
    mirrorShowBubble();
    renderer.domElement.style.cursor = '';
    applyMirrorToolbarUI();   // 面已定：顶栏恢复显示「枢轴 / 旋转」两个切换按钮
    mirrorGizmoMode = 'move';
    syncHerModeButtons();
    rebuildGizmo();
    bumpDrawRev('mat');
}
// 命中面 → 精确的「面矩形」：直接取命中三角形所属【那个面】的 4 个角（几何分组里的一格），
// 法线用世界空间两条真实边的叉积，面内基用相邻两条真实边。
// ★【2026-10-25 修复 · extend_xrot / extend_yrot 非默认时「以方块面建对称面」判定有误】
//   旧实现有两个根因，都会在带剪切的面（真平行四边形）上翻车：
//   ① 法线用 hit.face.normal.transformDirection(matrixWorld)。法线的正确变换是 inverse-transpose；
//      而 extend 的「先沿 Y 缩放 es、再沿 ex/ey 旋转后的 Z 缩放 es」叠起来会让方块矩阵带剪切，
//      M·n 不再垂直于面 —— 实测法线误差最大 90°，对称面整体歪掉。
//   ② 面内基取「命中三角形最短边」。平行四边形三角化后三条边是 e1、e2、|e1−e2|，
//      最短的可能是对角线，于是包围盒变成片面域的外接大矩形。
//      现在直接读该面的 4 个角，用相邻真实边 e1/e2 定基。
function mirrorFaceRectOf(hit) {
    const obj = hit.object;
    const geo = obj.geometry;
    const pos = geo?.attributes?.position;
    // ① 命中面所属分组的全部顶点 → 去重得到 3~4 个角（按面环绕顺序，世界坐标）。
    //   按分组取而不是「筛所有共面顶点」：压扁方块正反两面顶点只隔 4e-4，靠 EPS 筛永远有风险。
    let corners = null;
    if (pos && hit.face) {
        const groups = geo.groups || [];
        const triStart = (hit.faceIndex != null ? hit.faceIndex : Math.floor((hit.face.a || 0) / 3)) * 3;
        let start = -1, count = 0;
        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            if (triStart >= g.start && triStart < g.start + g.count) { start = g.start; count = g.count; break; }
        }
        // 无分组（非方块网格）：按三角形顶点号推所在的面（每面 6 个写入顶点 = 4 个唯一角）
        if (start < 0 && hit.face.a != null) { start = Math.floor(hit.face.a / 6) * 6; count = 6; }
        if (start >= 0) {
            const seen = [];
            for (let i = start; i < start + count && i < pos.count; i++) {
                const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
                if (!seen.some(q => q.distanceToSquared(p) < 1e-14)) seen.push(p);
            }
            if (seen.length >= 3) corners = seen;
        }
    }
    // ② 法线：世界空间真实边的叉积（Newell 公式对平面多边形精确，任何线性变换下都成立）
    const n = new THREE.Vector3();
    if (corners) {
        for (let i = 0; i < corners.length; i++) {
            const a = corners[i], b = corners[(i + 1) % corners.length];
            n.x += (a.y - b.y) * (a.z + b.z);
            n.y += (a.z - b.z) * (a.x + b.x);
            n.z += (a.x - b.x) * (a.y + b.y);
        }
    }
    if (n.lengthSq() < 1e-20 && hit.face && pos) {
        // 兜底：命中三角形三条边的世界叉积
        const a = new THREE.Vector3().fromBufferAttribute(pos, hit.face.a).applyMatrix4(obj.matrixWorld);
        const b = new THREE.Vector3().fromBufferAttribute(pos, hit.face.b).applyMatrix4(obj.matrixWorld);
        const c = new THREE.Vector3().fromBufferAttribute(pos, hit.face.c).applyMatrix4(obj.matrixWorld);
        n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    }
    if (n.lengthSq() < 1e-20) {
        n.set(0, 0, 1).transformDirection(obj.matrixWorld);   // 最后兜底（几乎不可达）
    }
    n.normalize();
    // ③ 面内基：u = 面的第一条真实边（退化时改用下一条），v = n×u
    let u = new THREE.Vector3(1, 0, 0);
    if (corners) {
        u.copy(corners[1]).sub(corners[0]);
        if (u.lengthSq() < 1e-12 && corners.length > 2) u.copy(corners[2]).sub(corners[1]);
    }
    u.addScaledVector(n, -u.dot(n));
    if (u.lengthSq() < 1e-12) { u.set(0, 1, 0).addScaledVector(n, -n.y); }
    u.normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    // ④ 面在 (u,v) 上的紧包围盒（平行四边形会外接成略大的矩形，正好完整盖住该面）
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    if (corners) {
        for (const p of corners) {
            const pu = p.dot(u), pv = p.dot(v);
            if (pu < minU) minU = pu;
            if (pu > maxU) maxU = pu;
            if (pv < minV) minV = pv;
            if (pv > maxV) maxV = pv;
        }
    }
    if (!(maxU > minU) || !(maxV > minV)) {
        // 退化（单点 / 顶点数据不可用）：给一个最小可见面
        return { n, u, v, center: hit.point.clone(), w: 0.5, h: 0.5 };
    }
    // 中心点：{u,v,n} 正交基下由两个面内分量 + 命中点所在的 n 分量重建
    const center = u.clone().multiplyScalar((minU + maxU) / 2)
        .add(v.clone().multiplyScalar((minV + maxV) / 2))
        .add(n.clone().multiplyScalar(n.dot(hit.point)));
    // ★法线必须朝外：镜像块（v.scale 为负 / det<0）时环绕方向翻转，叉积会给出朝内法线，
    //   若直接拿它建对称面，镜像副本会翻到方块内部一侧（看起来「镜像方向反了」）。
    //   判据：面心相对方块几何中心的位移应与法线同向。中心点对 n→−n 翻转不变，只需同时翻 v 保持右手系。
    try {
        geo.computeBoundingBox();
        const bc = geo.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(obj.matrixWorld);
        if (n.dot(center.clone().sub(bc)) < 0) { n.negate(); v.negate(); }
    } catch (e) {}
    return { n, u, v, center, w: maxU - minU, h: maxV - minV };
}
// 射线 → 最近的可选面（排除隐藏方块）
function mirrorRayFace(cx, cy) {
    camera.updateMatrixWorld(true);
    const list = blocks.filter(b => !isBlockInHiddenGroup(b));
    list.forEach(b => { if (b.mesh) b.mesh.updateMatrixWorld(true); });
    const meshes = list.flatMap(b => b.getMeshes());
    if (!meshes.length) return null;
    const hits = mirrorRayOf(cx, cy).intersectObjects(meshes, false);
    if (!hits.length) return null;
    return mirrorFaceRectOf(hits[0]);
}
// 面选取阶段的悬停高亮：让用户在点下去之前就看清「将要选中的是哪个面」
function mirrorClearHover() {
    if (mirrorHoverRoot) {
        scene.remove(mirrorHoverRoot);
        mirrorHoverRoot.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        mirrorHoverRoot = null;
    }
    mirrorHoverKey = '';
}
function mirrorHoverFaceAt(cx, cy) {
    if (!mirrorActive || !mirrorFacePicking) return;
    const rect = mirrorRayFace(cx, cy);
    if (!rect) { mirrorClearHover(); renderer.domElement.style.cursor = ''; return; }
    renderer.domElement.style.cursor = 'crosshair';
    // 同一张面不重复重建几何（pointermove 触发很频繁）
    const key = [rect.w, rect.h, ...rect.center.toArray(), ...rect.n.toArray()].map(v => v.toFixed(3)).join(',');
    if (key === mirrorHoverKey && mirrorHoverRoot) return;
    mirrorHoverKey = key;
    if (!mirrorHoverRoot) {
        const g = new THREE.Group();
        g.userData.hover = true;
        scene.add(g);
        mirrorHoverRoot = g;
    }
    // 每次重建几何（面尺寸会变）
    mirrorHoverRoot.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
    });
    mirrorHoverRoot.clear();
    const hw = rect.w / 2, hh = rect.h / 2;
    // 用「选中黄」做悬停色：青色在浅色方块上几乎看不出高亮（实测截图里整张面糊成一片）
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(rect.w, rect.h), new THREE.MeshBasicMaterial({
        color: 0xffaa00, transparent: true, opacity: 0.30, side: THREE.DoubleSide,
        depthTest: false, depthWrite: false
    }));
    fill.renderOrder = 1000;
    const border = mirrorLineSeg(
        [-hw,-hh,0, hw,-hh,0, hw,-hh,0, hw,hh,0, hw,hh,0, -hw,hh,0, -hw,hh,0, -hw,-hh,0],
        0xffaa00, 1, false, 1001);
    // 四角括号：即使面被方块本身颜色吃掉，也能看出「这一整块面」的边界
    const k = Math.min(rect.w, rect.h) * 0.18, tick = [];
    [[-hw,-hh,1,1], [hw,-hh,-1,1], [hw,hh,-1,-1], [-hw,hh,1,-1]].forEach(([x, y, sx, sy]) => {
        tick.push(x, y, 0, x + sx * k, y, 0);
        tick.push(x, y, 0, x, y + sy * k, 0);
    });
    const ticks = mirrorLineSeg(tick, 0xffaa00, 1, false, 1001);
    mirrorHoverRoot.add(fill, border, ticks);
    mirrorHoverRoot.position.copy(rect.center);
    mirrorHoverRoot.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(rect.u, rect.v, rect.n)));
    mirrorHoverRoot.updateMatrixWorld(true);
    bumpDrawRev('mat');
}
// 面选取阶段：画布点击 → 以点中面的精确矩形定义对称面（无需精确点在面中心，点在面内任意处即可）
function mirrorPickFaceAt(cx, cy) {
    if (!mirrorActive || !mirrorFacePicking) return false;
    const rect = mirrorRayFace(cx, cy);
    if (!rect) { showToast('请点选方块表面'); return true; }
    mirrorApplyFace(rect);
    return true;
}

/* ==================== 镜像 · 第三种：三点确定对称面 ==================== */
/* ★【2026-10-25 用户要求】「选择顶点似乎已有现成的风格和选择逻辑，稍微改改复用，不用新建逻辑」：
   · 现成逻辑 = 顶点捕捉（vtxsnap）的圆点图层 + 屏幕最近点拾取 + 「点方块 → 显示它的顶点」两步流程；
   · 复用口径：直接借 `vtxSnapRoot` 这套 Points 图层（候选点 / 悬停点 / `vtxSnapPickMarks` 已选点）、
     `vtxSnapPick(cx,cy,list)`、`vtxSnapPickBlock`、`vtxSnapBlockVerts`、`vtxSnapExit`（用完交还图层）；
   · 与捕捉的唯一区别是「候选集从哪来」：捕捉 = 选中集合（第二步 = 指定的单个方块），
     这里 = 初始为镜像源选区，**点任意方块就切换成那个方块的顶点**（因此可跨方块取点）。
   三个顶点定面：法线 = (p2−p1)×(p3−p1)；锚点 = 三点重心；尺寸覆盖三点跨度与镜像源包围盒。
   取点期间**吞掉一切画布点击**（点空白也不清选区，否则 mirrorSync 会直接结束镜像）。 */
let mirrorVtxPicking = false;      // 三点选点阶段
let mirrorVtxPicked = [];          // 已选顶点 [{ blockId, world }]（最多 3）
let mirrorVtxCands = [];           // 当前可选顶点 [{ blockId, world }]
let mirrorVtxCandIds = [];         // 当前显示顶点的方块 id（默认 = 镜像源选区）
let mirrorVtxTipBlockId = null;    // 「取点用」的选区外方块（紫线框提示，切块/退出时还原）
let mirrorVtxHover = -1;
let _mirrorVtxSig = NaN;           // 候选顶点矩阵校验和（姿态变化时才重建）
let _mirrorVtxCamSig = NaN;        // 相机校验和（转视角后重新判定遮挡色）
let _mirrorVtxClsAt = 0;           // 上一次遮挡判定的时间戳（转视角时按 10fps 节流）

function mirrorVtxCandBlocks() {
    return mirrorVtxCandIds.map(id => blocks.find(b => b.id === id)).filter(Boolean);
}
function mirrorVtxUpdateHint() {
    const el = document.getElementById('mirrorVtxCount');
    if (el) el.textContent = String(mirrorVtxPicked.length);
}
function mirrorVtxBuildCands() {
    mirrorVtxCands = [];
    mirrorVtxHover = -1;
    for (const b of mirrorVtxCandBlocks()) {
        if (!b.mesh || isBlockInHiddenGroup(b)) continue;
        for (const w of vtxSnapBlockVerts(b)) {
            if (mirrorVtxCands.length >= VTX_SNAP_MAX) return;
            mirrorVtxCands.push({ blockId: b.id, world: w });
        }
    }
}
function mirrorVtxRender() {
    if (!vtxSnapRoot) return;
    // 借用顶点捕捉的双层圆点：看得见的亮青 / 被挡住的淡紫（口径与顶点捕捉完全一致）
    vtxSnapFillDotLayers(mirrorVtxCands, Math.min(mirrorVtxCands.length, VTX_SNAP_MAX));
    vtxSnapHoverDot.geometry.setDrawRange(0, 0);
    // 已选的 1~3 个点：橙色圆点留在原位，作为「已经定了哪几个角」的可见凭据
    const pm = vtxSnapPickMarks.geometry.attributes.position;
    mirrorVtxPicked.forEach((p, i) => {
        pm.array[i * 3] = p.world.x; pm.array[i * 3 + 1] = p.world.y; pm.array[i * 3 + 2] = p.world.z;
    });
    pm.needsUpdate = true;
    vtxSnapPickMarks.geometry.setDrawRange(0, mirrorVtxPicked.length);
    mirrorVtxUpdateHint();
}
// 切换「取点方块」：选区内的方块保持普通选中黄框；选区外的借用顶点捕捉的紫色线框做提示
function mirrorVtxSetCandBlocks(ids) {
    if (mirrorVtxTipBlockId) {
        const ob = blocks.find(b => b.id === mirrorVtxTipBlockId);
        mirrorVtxTipBlockId = null;
        if (ob && !selectedBlocksSet.has(ob)) ob.updateSelectionHighlight(false);
    }
    mirrorVtxCandIds = ids.slice();
    if (ids.length === 1 && !mirrorSrc.some(b => b.id === ids[0])) {
        const nb = blocks.find(b => b.id === ids[0]);
        if (nb) {
            mirrorVtxTipBlockId = nb.id;
            nb.updateSelectionHighlight(true);
            if (nb.selectionWireframe) nb.selectionWireframe.material.color.setHex(VTX_SNAP_WIRE);
        }
    }
    mirrorVtxBuildCands();
    mirrorVtxRender();
}
function mirrorVtxEnter() {
    vtxSnapEnsureRoot();
    vtxSnapRoot.visible = true;
    mirrorVtxPicked = [];
    mirrorVtxHover = -1;
    _mirrorVtxSig = NaN;
    mirrorVtxSetCandBlocks(mirrorSrc.map(b => b.id));
}
function mirrorVtxCleanup() {
    const had = mirrorVtxPicking;
    mirrorVtxPicking = false;
    if (mirrorVtxTipBlockId) {
        const ob = blocks.find(b => b.id === mirrorVtxTipBlockId);
        mirrorVtxTipBlockId = null;
        if (ob && !selectedBlocksSet.has(ob)) ob.updateSelectionHighlight(false);
    }
    mirrorVtxPicked = []; mirrorVtxCands = []; mirrorVtxCandIds = [];
    mirrorVtxHover = -1; _mirrorVtxSig = NaN; _mirrorVtxCamSig = NaN;
    if (had && vtxSnapRoot) vtxSnapExit();   // 圆点图层是借来的，用完必须交还（否则会一直挂在画布上）
}
// 候选顶点跟随实时姿态（与 vtxSnapAutoRefresh 同口径的矩阵校验和，变了才重建）
function mirrorVtxAutoRefresh() {
    if (!mirrorVtxPicking || !vtxSnapRoot) return;
    let h = 0;
    for (const b of mirrorVtxCandBlocks()) {
        const e = (b && b.mesh) ? b.mesh.matrixWorld.elements : null;
        if (!e) continue;
        for (let i = 0; i < 16; i++) h = (h * 31 + Math.round(e[i] * 1000)) | 0;
    }
    /* 相机也进校验和：转视角后遮挡关系变了，圆点颜色（亮青 / 淡紫）要重新判定 */
    const ce = camera.matrixWorld.elements;
    let cs = 0;
    for (let i = 0; i < 16; i++) cs = (cs * 31 + Math.round(ce[i] * 1000)) | 0;
    if (h === _mirrorVtxSig && cs === _mirrorVtxCamSig) return;
    const poseChanged = (h !== _mirrorVtxSig);
    const now = performance.now();
    if (!poseChanged && now - _mirrorVtxClsAt < 100) return;   // 与顶点捕捉同口径：转视角时遮挡色 10fps 更新
    _mirrorVtxSig = h;
    _mirrorVtxCamSig = cs;
    _mirrorVtxClsAt = now;
    if (poseChanged) mirrorVtxBuildCands();
    mirrorVtxRender();
}
function mirrorVtxHoverAt(cx, cy) {
    if (!mirrorVtxPicking || !vtxSnapRoot) return;
    const i = vtxSnapPick(cx, cy, mirrorVtxCands);
    if (i === mirrorVtxHover) return;
    mirrorVtxHover = i;
    if (i < 0) { vtxSnapHoverDot.geometry.setDrawRange(0, 0); return; }
    const w = mirrorVtxCands[i].world;
    const p = vtxSnapHoverDot.geometry.attributes.position;
    p.array[0] = w.x; p.array[1] = w.y; p.array[2] = w.z;
    p.needsUpdate = true;
    vtxSnapHoverDot.geometry.setDrawRange(0, 1);
}
// 三个顶点 → 对称面实体（与面选取同样走 mirrorPlaneCore 那套可视化 + Gizmo）
function mirrorApplyVtxPlane(pts) {
    const a = pts[0].world, b = pts[1].world, c = pts[2].world;
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (n.lengthSq() < 1e-12) {
        // 三点几乎共线：撤掉第三个点让用户重选（不要带着一张歪面进入镜像）
        mirrorVtxPicked.pop();
        mirrorVtxRender();
        showToast('三个顶点几乎在同一条直线上，请重新选第三个顶点');
        return false;
    }
    n.normalize();
    // 面内基与「面选取」同口径：u = 第一条边在面内的投影，v = n×u（保证右手系）
    const u = b.clone().sub(a);
    u.addScaledVector(n, -u.dot(n));
    if (u.lengthSq() < 1e-12) u.set(0, 1, 0).addScaledVector(n, -n.y);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    mirrorPlanePos.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    mirrorPlaneQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
    // 尺寸：三点跨度与镜像源包围盒取大者（对称面必须完整盖住被镜像的模型）
    const box = mirrorSelectionBox();
    const size = box.getSize(new THREE.Vector3());
    const tri = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const span = Math.max(size.x, size.y, size.z, tri, 0.5);
    mirrorPlaneW = mirrorPlaneH = Math.max(1.6, span * 1.35 + 0.4);
    mirrorVtxCleanup();
    mirrorPlaneCore();
    mirrorBuildPreviews();
    mirrorShowBubble();
    renderer.domElement.style.cursor = '';
    applyMirrorToolbarUI();
    mirrorGizmoMode = 'move';
    syncHerModeButtons();
    rebuildGizmo();
    bumpDrawRev('mat');
    return true;
}
// 取点阶段的画布点击：点中顶点 = 落一个点；点中方块本体 = 切换取点方块；点空白 = 吞掉
function mirrorVtxClick(cx, cy) {
    if (!mirrorVtxPicking) return false;
    if (typeof _canvasDragMoved !== 'undefined' && _canvasDragMoved) return false;
    const i = vtxSnapPick(cx, cy, mirrorVtxCands);
    if (i >= 0) {
        const w = mirrorVtxCands[i].world;
        if (!mirrorVtxPicked.some(p => p.world.distanceToSquared(w) < 1e-8)) {   // 同一点重复点不计数
            mirrorVtxPicked.push({ blockId: mirrorVtxCands[i].blockId, world: w.clone() });
            mirrorVtxRender();
            if (mirrorVtxPicked.length >= 3) mirrorApplyVtxPlane(mirrorVtxPicked.slice());
        }
        return true;
    }
    const hb = vtxSnapPickBlock(cx, cy);
    if (hb) {
        // 与入口同一条规则：表达式结果会变的方块顶点每帧都不一样，不能用来定面（常量表达式可以）
        if (!mirrorCanMirror(hb)) { showToast('该方块的 molang 表达式会随动画变化，顶点不能用来确定对称面'); return true; }
        mirrorVtxSetCandBlocks([hb.id]);
        return true;
    }
    return true;   // 空白：吞掉本次点击（不清选区、不结束镜像）
}
function mirrorShowVtxPickBubble() {
    mirrorCloseBubble();
    mirrorBubbleEl = showTechBubble('镜像', '', {
        contentHtml: '依次点击方块顶点确定对称面（已选 <b id="mirrorVtxCount">0</b> / 3）'
            + '<div style="margin-top:6px;opacity:.75;">点方块可切换取点方块，三个点可以来自不同方块</div>'
            + mirrorSelfSwitchHtml(),
        confirmText: '取消',
        onConfirm: () => mirrorExit(true)
    });
    mirrorAttachSelfSwitch(mirrorBubbleEl);
}

// 确认：把预览块（或按需新建的副本）转正并选中
function mirrorCommit() {
    if (!mirrorActive || mirrorFacePicking || mirrorVtxPicking) return;
    if (mirrorSelf) { mirrorCommitSelf(); return; }
    mirrorUpdatePreviews();
    const plane = mirrorPlaneWorld();
    const used = new Set(mirrorPreview.map(r => r.block.id));
    const previewBySrc = new Map(mirrorPreview.map(r => [r.src, r.block]));
    let skipped = 0;
    let shapeSkipped = 0;    // 模型没有反射对称（旗帜）：正 scale 表达不了真镜像，跳过
    const news = [];
    // ★【破坏性 mutation 落账铁律】必须先冲刷未落账的防抖快照，再在 mutation 后立即 history.record。
    //   旧实现末尾用 recordAction()（200ms 防抖）：用户在 200ms 内按 Ctrl+Z 时，undo() 里的
    //   flushPendingRecords() 会把「镜像后」的状态压栈再弹掉 ⇒ 撤销空转、镜像方块删不掉（用户报）。
    flushPendingRecords();
    _bulkAddDepth++;
    try {
        for (const src of mirrorSrc) {
            if (!mirrorCanMirror(src)) { skipped++; continue; }
            if (!mirrorShapeMirrorable(src)) { shapeSkipped++; continue; }
            const nb = previewBySrc.get(src) ||
                mirrorBuildCopy(src, mirrorParamsOf(src, plane), used);
            // 预览块转正：先剥掉全息皮肤（半透明/青色棱线），否则镜像出来的方块会一直是「预览样」
            mirrorUnskinPreview(nb);
            addBlock(nb, false, false);
            news.push(nb);
        }
    } finally { _bulkAddDepth--; }
    mirrorPreview = [];          // 预览已转正，不能再被清理函数销毁
    mirrorExit(false);
    if (!news.length) {
        showToast(shapeSkipped
            ? '没有可镜像的方块（' + shapeSkipped + ' 个是旗帜：局部模型没有反射对称，无法用正 scale 镜像）'
            : '没有可镜像的方块（脚本驱动的方块已跳过）');
        updateToolbar(true);
        return;
    }
    // 批量入口跳过的收尾：补标签 + 侧栏列表只重建一次
    news.forEach(n => updateBlockLabel(n));
    if (isNewLayoutMode) renderSideBlockList();
    history.record(getState());   // 立即落账（不走 recordAction 防抖，见上方铁律注释）
    selectedBlocksSet.clear();
    news.forEach(n => selectedBlocksSet.add(n));
    selectBlock(news[0]);
    showToast('已镜像 ' + news.length + ' 个方块' + (skipped ? '，跳过 ' + skipped + ' 个脚本方块' : '') +
        (shapeSkipped ? '，跳过 ' + shapeSkipped + ' 个无法正 scale 镜像的方块（旗帜）' : ''));
}
/* ★【2026-10-31 用户要求】「自身镜像」：把源方块**本身**反射到对称面另一侧，不新建方块。
   · 无动画的方块：直接把镜像后的核心值（位置 / 全局旋转 / 正 scale / basepos）写回它自己。
   · 有关键帧动画的方块：镜像姿态必须写成【当前时刻的关键帧】（该时刻已有帧则覆盖），
     否则播放 / 插值时下一帧就会把镜像结果冲掉 —— 这正是「关键帧动画需要支持」的含义。
     顺序必须是「先出该时刻的完整帧 → 覆盖帧值 → 重编译 → applyKeyframeToBlock」。
   · 骨骼里的方块（位置/旋转由父级 molang 驱动）原地写常量会把它从父骨骼上拆下来 ⇒ 直接拦下，提示改用复制镜像。
   · ★FMBE 不支持负 scale ⇒ 用局部 z 反射 M = diag(1,1,-1) 表达真镜像，
     立方体 / 半砖 / 楼梯关于 z=0 对称、掉落物关于 y=y₀ 对称 ⇒ 都能镜像；旗帜没有反射对称 ⇒ 跳过并提示。 */
function mirrorCommitSelf() {
    if (typeof keyframePlaying !== 'undefined' && keyframePlaying) {
        showToast('关键帧播放中不能镜像，请先暂停');
        return;
    }
    const plane = mirrorPlaneWorld();
    const boneBound = mirrorSrc.filter(b =>
        (typeof getBoneParentId === 'function' && getBoneParentId(b)) ||
        (b.group && typeof isFolderBoneSystem === 'function' && isFolderBoneSystem(b.group)));
    if (boneBound.length) {
        showToast('选中的方块里有 ' + boneBound.length + ' 个在骨骼动画里（位置由父级驱动），不能原地镜像，请改用复制镜像');
        return;
    }
    const kfOn = typeof _kfSystemReady !== 'undefined' && _kfSystemReady &&
        typeof keyframeData !== 'undefined' && typeof kfQuantTime === 'function';
    // 时间键与所有关键帧写入口同口径量化（1ms），避免「显示的时刻」与「真实键」不一致
    const t = kfOn ? kfQuantTime(keyframeCurrentTime) : 0;
    flushPendingRecords();
    let done = 0, skipped = 0, kfCount = 0, shapeSkipped = 0;
    for (const src of mirrorSrc) {
        // 有关键帧动画的方块不受「静态表达式」限制：它的姿态由当前时刻的帧决定，镜像后写回当前帧
        const anim = kfOn && typeof hasKeyframeAnimation === 'function' && hasKeyframeAnimation(src.id);
        if (!mirrorCanMirror(src) && !anim) { skipped++; continue; }
        // ★FMBE 不支持负 scale：局部模型没有反射对称（旗帜）⇒ 无法用「旋转 + 正 scale」表达真镜像
        if (!mirrorShapeMirrorable(src)) { shapeSkipped++; continue; }
        src.refresh();   // 保证 toM() 读到的是表达式求值后的最新姿态
        const mp = mirrorParamsOf(src, plane);
        if (anim) {
            /* ★【2026-10-31】动画方块【不能】走 mirrorApplyParams：那条路把新值写进 scope.vars，
               而 refresh() 会执行编译产物（按时间取值）把它们当场覆盖 ⇒ 镜像值存活不下来，
               旧实现还会被 kfGizmoWriteVar「吸附到最近已有帧」写进错误时刻。
               正确顺序：先按时录制该时刻的完整帧 → 再把镜像解算出的 6 个核心值覆盖进这一帧
               → 重编译 → 按帧回写 live 值。 */
            const data = kfData(src.id, true);
            kfRecordUserFrame(src, t, true);          // 用户显式点「自身对称」⇒ 允许在该时刻新建帧
            const fr = data && data.frames && data.frames.get(t);
            if (fr) {
                fr.set('xpos', mp.pos.x); fr.set('ypos', mp.pos.y); fr.set('zpos', mp.pos.z);
                fr.set('scale', mp.scale);
                fr.set('xrot', mp.xrot); fr.set('yrot', mp.yrot); fr.set('zrot', mp.zrot);
                fr.set('extend_scale', mp.extend_scale);
                fr.set('extend_xrot', mp.extend_xrot); fr.set('extend_yrot', mp.extend_yrot);
                fr.set('xbasepos', mp.basepos[0]); fr.set('ybasepos', mp.basepos[1]); fr.set('zbasepos', mp.basepos[2]);
                fr.set('rotatex', mp.rotatex); fr.set('rotatey', mp.rotatey); fr.set('rotatez', mp.rotatez);
            }
            refreshMolangProgramForBlock(src.id);     // 帧值已改 → 必须重编译，否则 apply 仍读旧程序
            applyKeyframeToBlock(src.id, t);          // 立即按该帧回写，视觉确认与回放一致
            kfCount++;
        } else {
            mirrorApplyParams(src, mp);
        }
        updateBlockLabel(src);
        done++;
    }
    mirrorExit(true);    // 清预览 + 还原顶栏 + 重建常规 Gizmo（选区不变）
    if (!done) {
        showToast(shapeSkipped
            ? '没有可镜像的方块（' + shapeSkipped + ' 个是旗帜：局部模型没有反射对称，无法用正 scale 镜像）'
            : '没有可镜像的方块（脚本驱动的方块已跳过）');
        updateToolbar(true);
        return;
    }
    history.record(getState());   // 方块变量 + 关键帧一起落账（getState 已包含 keyframes）
    if (kfCount) {
        keyframeAnimDuration = Math.max(keyframeAnimDuration, Math.ceil(t) + 2);
        kfRefreshAllPanels();
    }
    showToast('已原地镜像 ' + done + ' 个方块' + (kfCount ? '，写入 ' + t + 's 关键帧' : '') +
        (skipped ? '，跳过 ' + skipped + ' 个脚本方块' : '') +
        (shapeSkipped ? '，跳过 ' + shapeSkipped + ' 个无法正 scale 镜像的方块（旗帜）' : ''));
    updateToolbar(true);
}
// 与 herModes 同步：选区变化 / 退出新操作模式 / 选中文件夹 时自动结束镜像
function mirrorSync() {
    if (!mirrorActive) return;
    if (!isNewLayoutMode || !herModes.has('mirror') || selectedFolder) { mirrorExit(false); return; }
    const ids = mirrorCurrentSel().map(b => b.id).join(',');
    if (ids !== mirrorSrcIds) { mirrorExit(false); return; }
    if (!mirrorFacePicking && !mirrorVtxPicking && (!mirrorRoot || !mirrorRoot.parent)) mirrorCreatePlane();
}
// 画布拾取：把屏幕点转成射线（返回已就绪的 raycaster，复用全局实例）
function mirrorRayOf(cx, cy) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster;
}
// 点是否落在对称面上（对称面是覆盖画面的大半透明面，点它不该穿透去改选区）
function mirrorPlaneHitAt(cx, cy) {
    if (!mirrorActive || !mirrorPlaneMesh) return false;
    mirrorPlaneMesh.updateMatrixWorld(true);
    return mirrorRayOf(cx, cy).intersectObject(mirrorPlaneMesh, false).length > 0;
}

// 镜像 Gizmo：对称面的位移 / 旋转各用一套【完整的三轴控件】，两套不同时出现。
/* ★【2026-10-25 用户定稿】恢复完整三轴箭头，用顶栏「枢轴 / 旋转」两个既有按钮切换：
   · 位移模式：3 根世界轴箭头（红/绿/蓝）平移对称面
   · 旋转模式：3 条世界轴圆环（红/绿/蓝）绕对称面锚点旋转
   只构建当前模式的那一套 ⇒ 手柄数量永远是 3 个，另一套完全不存在（不是隐藏），
   因此不会有 r7 之前「两套手柄一起显示互相抢拾取」的问题。 */
function buildMirrorGizmo() {
    gizmoRoot.visible = true;
    gizmoRoot.position.copy(mirrorPlanePos);
    gizmoRoot.quaternion.identity();
    const axes = [
        { key: 'x', dir: new THREE.Vector3(1, 0, 0), normal: new THREE.Vector3(0, 0, 1), color: 0xff3030 },
        { key: 'y', dir: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0, 0, 1), color: 0x25d94f },
        { key: 'z', dir: new THREE.Vector3(0, 0, 1), normal: new THREE.Vector3(0, 1, 0), color: 0x2078ff },
    ];
    if (mirrorGizmoMode === 'move') {
        for (const a of axes) {
            // 轴方向 / 屏幕投影参考法线与方块「枢轴」Gizmo 完全一致，拖拽手感一致
            const arrow = makeArrow(a.dir, a.normal, a.color, 'mirror.pos.' + a.key, 0.012, 0, {
                visualScale: 1.05, start: 0.58, priority: 60, moveKind: 'origin', axisName: a.key
            });
            arrow.traverse(o => { if (o.userData.her) o.userData.her.mirrorPlane = 'move'; });
            gizmoRoot.add(arrow);
            gizmoArrowGroups.push(arrow);
        }
        return;
    }
    for (const a of axes) {
        // 圆盘基按世界轴正交化（y 轴优先用世界 X 作参考 x，避免与 z 轴共线退化）
        const basis = orthonormalDiscBasis(a.dir, a.key === 'y' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
        const arc = makeArc(a.key, a.color, 'mirror.rot.' + a.key, basis.z, basis.x, basis.y, { rotMode: 'origin' });
        arc.traverse(o => { if (o.userData.her) o.userData.her.mirrorPlane = 'rot'; });
        arc.userData.herMirrorArc = true;     // 半圆弧始终正对相机（updateMirrorGizmoLive 每帧刷新）
        arc.userData.herMirrorBasis = { x: basis.x, y: basis.y, z: basis.z };
        gizmoRoot.add(arc);
    }
}
// 位移 / 旋转两套手柄的切换：由顶栏复用的「枢轴」「旋转」两个按钮触发
function mirrorSetGizmoMode(mode) {
    const m = (mode === 'rot') ? 'rot' : 'move';
    if (mirrorGizmoMode !== m) {
        mirrorGizmoMode = m;
        rebuildGizmo();
        // 重建后立刻按相机距离缩放一次，避免中间一帧控件突然放大（与 updateToolbar 同口径）
        try { syncGizmo(); } catch (e) {}
        mirrorUpdateBubble();
        bumpDrawRev('mat');
    }
    syncHerModeButtons();
}
// 顶栏模式按钮的 active 高亮。镜像模式下 herModes 里只有 'mirror'，
// 「枢轴」= 位移手柄、「旋转」= 旋转手柄（folderRotBtn），其余按钮一律不高亮。
function syncHerModeButtons() {
    const inMirror = !!(mirrorActive && herModes.has('mirror'));
    const folderRot = document.getElementById('folderRotBtn');
    document.querySelectorAll('.her-mode-btn').forEach(b => {
        let on = herModes.has(b.dataset.mode);
        if (inMirror) {
            if (b.dataset.mode === 'origin') on = mirrorGizmoMode === 'move';
            else if (b === folderRot) on = mirrorGizmoMode === 'rot';
            else on = false;
        }
        b.classList.toggle('active', on);
    });
    // 顶点捕捉按钮是下拉按钮（无 data-mode），激活态需单独同步
    const _vtxBtn = document.getElementById('vtxSnapMenuBtn');
    if (_vtxBtn) _vtxBtn.classList.toggle('active', herModes.has('vtxsnap'));
}
// 镜像模式下顶栏只保留「枢轴 / 旋转」两个既有按钮（复用作位移 / 旋转切换器）；
// 面选取阶段还没有对称面 ⇒ 两个按钮一起隐藏。退出镜像后按常规规则还原可见性。
function applyMirrorToolbarUI() {
    const tb = document.getElementById('herTransformToolbar');
    if (!tb) return;
    const originBtn = tb.querySelector('.her-mode-btn[data-mode="origin"]');
    const scaleBtn  = tb.querySelector('.her-mode-btn[data-mode="scale"]');
    const baseBtn   = tb.querySelector('.her-mode-btn[data-mode="base"]');
    const folderRot = document.getElementById('folderRotBtn');
    const localWrap  = document.getElementById('localRotMenuBtn')?.parentElement || null;
    const globalWrap = document.getElementById('globalRotMenuBtn')?.parentElement || null;
    const vtxWrap    = document.getElementById('vtxSnapMenuBtn')?.parentElement || null;
    const hide = el => { if (el) el.style.display = 'none'; };
    const show = el => { if (el) el.style.display = ''; };
    if (mirrorActive && herModes.has('mirror')) {
        hide(scaleBtn); hide(baseBtn); hide(localWrap); hide(globalWrap); hide(vtxWrap);
        if (mirrorFacePicking || mirrorVtxPicking) { hide(originBtn); hide(folderRot); }
        else { show(originBtn); show(folderRot); }
        syncHerModeButtons();
        return;
    }
    // 退出镜像：还原常规可见性（与 updateToolbar 的常规分支同口径）
    const hasBlock = !!selected();
    if (scaleBtn) scaleBtn.style.display = (selectedFolder || !hasBlock) ? 'none' : '';
    show(baseBtn);
    if (vtxWrap) vtxWrap.style.display = (selectedFolder || !hasBlock) ? 'none' : '';
    if (localWrap) localWrap.style.display = selectedFolder ? 'none' : '';
    if (globalWrap) globalWrap.style.display = selectedFolder ? 'none' : '';
    if (folderRot) folderRot.style.display = selectedFolder ? '' : 'none';
    syncHerModeButtons();
}
// 镜像 Gizmo 每帧跟随：位置 = 面锚点、屏幕恒定大小、旋转弧始终正对相机
function updateMirrorGizmoLive() {
    if (!mirrorRoot) return;
    gizmoRoot.position.copy(mirrorPlanePos);
    gizmoRoot.updateMatrixWorld(true);
    const s = Math.max(0.1, framingDist(mirrorPlanePos)) / 14;
    gizmoCamScale = s;
    gizmoArrowGroups.forEach(g => g.scale.set(s, s, s));
    const wc = new THREE.Vector3();
    const cd = new THREE.Vector3();
    rotArcGroups.forEach(g => {
        g.scale.set(s, s, s);
        if (!g.userData.herMirrorArc) return;
        const b2 = g.userData.herMirrorBasis;
        g.getWorldPosition(wc);
        cd.copy(camera.position).sub(wc).normalize();
        const fa = Math.atan2(cd.dot(b2.y), cd.dot(b2.x));
        g.userData.herFaceAngle = fa;
        if (g.userData.herRotPlane) g.userData.herRotPlane.rotation.z = fa - Math.PI * 0.5;
    });
}

function rebuildGizmo() {
    clearGizmo();
    const b = selected();
    // 顶点捕捉：此模式不显示任何 Gizmo 箭头/圆环，只在画布上渲染候选顶点（由 vtxSnapSync 维护）
    if (isNewLayoutMode && herModes.has('vtxsnap') && !selectedFolder && b) {
        if (mirrorActive) mirrorExit(false);   // 两模式互斥：捕捉优先接管
        vtxSnapSync();
        gizmoRoot.visible = false;
        blocks.forEach(blk => { if (blk.axisHelper) blk.axisHelper.visible = false; });
        return;
    }
    vtxSnapSync(); // 其它模式（或退出捕捉）时清理顶点渲染
    // 镜像：对称面是实体，直接给它挂位移箭头 + 旋转圆环（由 mirrorSync 维护）
    if (isNewLayoutMode && herModes.has('mirror') && !selectedFolder && b) {
        mirrorSync();
        if (mirrorActive) {
            blocks.forEach(blk => { if (blk.axisHelper) blk.axisHelper.visible = false; });
            if (mirrorFacePicking || mirrorVtxPicking) { gizmoRoot.visible = false; return; }
            buildMirrorGizmo();
            return;
        }
    } else if (mirrorActive) {
        mirrorExit(false);
    }
    // 文件夹 Gizmo：枢轴 + 位移 + 旋转（无缩放），仅新操作模式
    if (selectedFolder && !b && isNewLayoutMode) {
        rebuildFolderGizmo(selectedFolder);
        return;
    }
    if (!b || herModes.size === 0) { gizmoRoot.visible = false; return; }
    // 顶点捕捉模式独占：只显示顶点圆点，不显示 Gizmo 手柄
    if (isNewLayoutMode && herModes.has('vtxsnap')) { gizmoRoot.visible = false; return; }
    gizmoRoot.visible = true;
    gizmoRoot.position.copy(originOfBlock(b));
    gizmoRoot.quaternion.identity();
    // 新操作模式下，枢轴/位移时隐藏方块自身坐标轴（使用 gizmo 代替）
    // 旋转模式使用 gizmo 旋转轴细线，也隐藏旧 axisHelper 避免双重渲染
    if (isNewLayoutMode) {
        const isRot = herModes.has('rotate') || herModes.has('centerRotate') || herModes.has('globalRotate') || herModes.has('globalCenterRotate');
        // 两边一角专用控件激活时，方块自身的 RGB 轴箭头会和控件叠在同一角上 → 一并隐藏，保持画面干净
        const plgActive = herModes.has('scale') && !!plgDetectPreset(plgPickPresetBlock(b));
        const hideAxes = plgActive || !showLocalAxes || herModes.has('origin') || herModes.has('base') || isRot;
        blocks.forEach(blk => {
            if (blk.axisHelper) {
                if (hideAxes) { blk.axisHelper.visible = false; }
                else setBlockAxisHelper(blk);
            }
        });
    }
    gizmoRoot.add(makeOriginCenterLine(b));
    const wx = new THREE.Vector3(1,0,0), wy = new THREE.Vector3(0,1,0), wz = new THREE.Vector3(0,0,1);
    if (herModes.has('origin')) {
        gizmoRoot.add(makeAt(new THREE.Vector3(), makeArrow(wx,wz,0xff3030,'v.xpos',0.012,0,{visualScale:1.05,start:0.58,priority:10,moveKind:'origin',axisName:'x'}),{moveWrapper:'origin'}));
        gizmoRoot.add(makeAt(new THREE.Vector3(), makeArrow(wy,wz,0x25d94f,'v.ypos',0.012,0,{visualScale:1.05,start:0.58,priority:10,moveKind:'origin',axisName:'y'}),{moveWrapper:'origin'}));
        gizmoRoot.add(makeAt(new THREE.Vector3(), makeArrow(wz,wy,0x2078ff,'v.zpos',0.012,0,{visualScale:1.05,start:0.58,priority:10,moveKind:'origin',axisName:'z'}),{moveWrapper:'origin'}));
    }
    if (herModes.has('base')) {
        if (useWorldAxisDisplacement) {
            // 世界轴位移模式：箭头沿世界坐标轴方向，不随方块旋转，定位到视觉中心
            const co = centerOfBlock(b).sub(originOfBlock(b));
            const baseVarMap = { x: 'v.xbasepos', y: 'v.ybasepos', z: 'v.zbasepos' };
            const axisColors = { x: 0xffb347, y: 0xc6ff5c, z: 0x49e6ff };
            const axisDirs = { x: wx, y: wy, z: wz };
            const axisNormals = { x: wz, y: wz, z: wy };
            ['x','y','z'].forEach(axis => {
                const dir = axisDirs[axis];
                const arrowGroup = makeArrow(dir, axisNormals[axis], axisColors[axis], baseVarMap[axis], 0.012, 0, {
                    visualScale: 1.05, start: 0.58, priority: 90,
                    moveKind: 'base', axisName: axis,
                    mode: 'base'  // 标记为 base 模式，用于 drag 中的特殊处理
                });
                arrowGroup.userData.isBaseWorldAxis = true;
                arrowGroup.userData.baseAxis = axis;
                gizmoArrowGroups.push(arrowGroup);
                gizmoRoot.add(arrowGroup);
            });
        } else {
            // 原始位移模式：箭头沿世界轴创建，每帧通过 setFromUnitVectors 旋转到剪切轴方向
            const co = centerOfBlock(b).sub(originOfBlock(b));
            // ★ mode:'base' 必须带上：它决定 moveGizmoDrag / changeVar 走「世界位移 → basepos 逆变换」通道。
            //   漏掉时拖拽会落到 applyBatchDelta 的单变量标量分支（只加 xbasepos 一个分量、且不除以剪切轴长度），
            //   extend_xrot/yrot≠0、extend_scale≠1 时表现为「拖拽方向/位移量全错」（用户报告）。
            const gx = makeAt(co, makeArrow(wx,wz,0xffb347,'v.xbasepos',0.012,0,{visualScale:1.05,start:0.58,priority:25,moveKind:'base',axisName:'x',mode:'base'}),{moveWrapper:'base'});
            const gy = makeAt(co, makeArrow(wy,wz,0xc6ff5c,'v.ybasepos',0.012,0,{visualScale:1.05,start:0.58,priority:25,moveKind:'base',axisName:'y',mode:'base'}),{moveWrapper:'base'});
            const gz = makeAt(co, makeArrow(wz,wy,0x49e6ff,'v.zbasepos',0.012,0,{visualScale:1.05,start:0.58,priority:25,moveKind:'base',axisName:'z',mode:'base'}),{moveWrapper:'base'});
            gx.userData.usesShearedAxes = true; gx.userData.herMoveAxis = 'x';
            gy.userData.usesShearedAxes = true; gy.userData.herMoveAxis = 'y';
            gz.userData.usesShearedAxes = true; gz.userData.herMoveAxis = 'z';
            gizmoRoot.add(gx); gizmoRoot.add(gy); gizmoRoot.add(gz);
        }
    }
    if (herModes.has('rotate')) {
        rotArcGroups = [];
        const bx = rotDiscBasisFor(b,'x'), by = rotDiscBasisFor(b,'y'), bz = rotDiscBasisFor(b,'z');
        gizmoRoot.add(makeArc('x',0xff3030,'v.xrot',bx.z,bx.x,bx.y,{rotMode:'origin'}));
        gizmoRoot.add(makeArc('y',0x25d94f,'v.yrot',by.z,by.x,by.y,{rotMode:'origin'}));
        gizmoRoot.add(makeArc('z',0x2078ff,'v.zrot',bz.z,bz.x,bz.y,{rotMode:'origin'}));
    }
    if (herModes.has('centerRotate')) {
        rotArcGroups = rotArcGroups || [];
        const co = centerOfBlock(b).sub(originOfBlock(b));
        const bx = rotDiscBasisFor(b,'x'), by = rotDiscBasisFor(b,'y'), bz = rotDiscBasisFor(b,'z');
        gizmoRoot.add(makeArc('x',0xff66cc,'v.xrot',bx.z,bx.x,bx.y,{rotMode:'center',offset:co,priority:45}));
        gizmoRoot.add(makeArc('y',0xd87cff,'v.yrot',by.z,by.x,by.y,{rotMode:'center',offset:co,priority:45}));
        gizmoRoot.add(makeArc('z',0x66ffe8,'v.zrot',bz.z,bz.x,bz.y,{rotMode:'center',offset:co,priority:45}));
    }

    if (herModes.has('globalRotate')) {
        const bx = globalRotBasisFor('x'), by = globalRotBasisFor('y'), bz = globalRotBasisFor('z');
        gizmoRoot.add(makeArc('x',0xff8c00,'v.rotatex',bx.z,bx.x,bx.y,{rotMode:'origin',priority:30}));
        gizmoRoot.add(makeArc('y',0x00c853,'v.rotatey',by.z,by.x,by.y,{rotMode:'origin',priority:30}));
        gizmoRoot.add(makeArc('z',0x2979ff,'v.rotatez',bz.z,bz.x,bz.y,{rotMode:'origin',priority:30}));
        rotArcGroups.slice(-3).forEach(g => { g.userData.herGlobalRot = true; });
    }
    if (herModes.has('globalCenterRotate')) {
        const co = centerOfBlock(b).sub(originOfBlock(b));
        const bx = globalRotBasisFor('x'), by = globalRotBasisFor('y'), bz = globalRotBasisFor('z');
        gizmoRoot.add(makeArc('x',0xffab40,'v.rotatex',bx.z,bx.x,bx.y,{rotMode:'center',offset:co,priority:40}));
        gizmoRoot.add(makeArc('y',0x69f0ae,'v.rotatey',by.z,by.x,by.y,{rotMode:'center',offset:co,priority:40}));
        gizmoRoot.add(makeArc('z',0x40c4ff,'v.rotatez',bz.z,bz.x,bz.y,{rotMode:'center',offset:co,priority:40}));
        rotArcGroups.slice(-3).forEach(g => { g.userData.herGlobalRot = true; });
    }
    // 旋转模式下添加穿过旋转中心的旋转轴细线（userData 记录类型，供动态更新用）
    const isAnyRot = herModes.has('rotate') || herModes.has('centerRotate') || herModes.has('globalRotate') || herModes.has('globalCenterRotate');
    if (isAnyRot) {
        const axisColors = { x: 0xff6666, y: 0x66ff66, z: 0x66aaff };
        const isCenter = herModes.has('centerRotate') || herModes.has('globalCenterRotate');
        const centerOffset = isCenter ? centerOfBlock(b).sub(originOfBlock(b)) : new THREE.Vector3();
        const hasLocal = herModes.has('rotate') || herModes.has('centerRotate');
        const hasGlobal = herModes.has('globalRotate') || herModes.has('globalCenterRotate');
        // 局部旋转轴 = 方块局部坐标轴方向
        if (hasLocal) {
            const la = rotLocalAxesOfBlock(b);
            const laDirs = { x: la.xAxis, y: la.yAxis, z: la.zAxis };
            ['x','y','z'].forEach(axis => {
                const line = makeGizmoAxisLine(laDirs[axis], axisColors[axis], 2.5);
                line.position.copy(centerOffset);
                line.userData.axisType = 'local';
                line.userData.axisName = axis;
                gizmoRoot.add(line);
                gizmoAxisLines.push(line);
            });
        }
        // 全局旋转轴 = 按 Ry*Rx*Rz 顺序计算的旋转轴方向
        if (hasGlobal) {
            ['x','y','z'].forEach(axis => {
                const basis = globalRotBasisFor(axis);
                const line = makeGizmoAxisLine(basis.z, axisColors[axis], 2.5);
                line.position.copy(centerOffset);
                line.userData.axisType = 'global';
                line.userData.axisName = axis;
                gizmoRoot.add(line);
                gizmoAxisLines.push(line);
            });
        }
    }
    /* 【两边一角预设】缩放入口改为专用控件：两条边的边长手柄 + 夹角圆环。
       这类方块的 v.scale / extend_scale / extend_xrot / extend_yrot 全是预设表达式算出的派生量，
       普通缩放的角点/肢体拉伸拖了也会被表达式覆盖 —— 所以直接整组替换。
       ★多选：控件绑的是选区里的预设块，不一定是 selected()（选区第一块）——
         先点普通方块、再 Ctrl 追加预设块时，控件会一直按那块普通方块算而整组消失，
         用户报「多选时没办法使用两边一角控件」。 */
    const _plgB = plgPickPresetBlock(b);
    const _plgPreset = plgDetectPreset(_plgB);
    if (herModes.has('scale')) gizmoRoot.add(_plgPreset ? makeParallelogramGizmo(_plgB, _plgPreset) : makeScaleDots(b));
}

