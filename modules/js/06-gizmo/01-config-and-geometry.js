/* 06-gizmo/01-config-and-geometry.js · 源 测试版v.6b79.html 第 29090-30540 行 */
'use strict';
// ============================================================

// ---------- 配置常量 ----------
const HER_DEFAULT_COLORS = { x: 0xff4444, y: 0x44ff44, z: 0x4488ff };

// ---------- 全局状态 ----------
const herModes = new Set();            // 当前激活的模式：'origin', 'base', 'rotate', 'centerRotate', 'scale'
// 用户最近选择的局部/全局旋转子模式，供 R / Shift+R 快捷键激活
let currentLocalRotMode = 'rotate';        // 'rotate'(局部旋转) 或 'centerRotate'(模型旋转)
let currentGlobalRotMode = 'globalRotate'; // 'globalRotate'(全局旋转) 或 'globalCenterRotate'(全局模型旋转)
let gizmoRoot = null;                 // 在 scene 初始化后创建并添加到场景
let pickables = [];                   // 所有可拾取对象（隐藏命中体）
let activePick = null;                // 当前拖拽的控件元数据
let pendingInputPick = null;          // 数值标签短按待弹窗
let activeHighlight = null;           // 高亮发光体
let lastPX = 0, lastPY = 0;           // 上一帧鼠标位置
let gizmoArrowGroups = [];            // 箭头组（用于自适应缩放）
let originCenterLineObj = null;       // 原点→几何中心连线
let gizmoCamScale = 1;                // 摄像机自适应缩放系数（= camDist/14），与 Gizmo 控件同源
let rotArcGroups = [];                // 旋转弧组
let gizmoAxisLines = [];              // XYZ轴向指示线
let draggingGizmo = false;            // 是否正在拖拽
let gizmoDragJustEnded = false;       // Gizmo拖拽刚结束，用于阻止后续click事件误选方块
let dragNeedsRebuild = false;
let lastDragRebuild = 0;
let lastGizmoSig = '', gizmoDirty = true, lastGizmoCheck = 0;
let activeGizmoPointerId = null;
let activeGizmoTouchId = null;
let lastTouchGizmoAt = 0;
let lastPromptAt = 0;

// ---------- Gizmo 拖拽增量 HUD（新操作模式）----------
let gizmoDeltaHudEl = null;
let gizmoDeltaBaseline = null;   // { label, kind:'block'|'folder', count, vals:{name:num} }
// 拖拽中需要对比增量的方块变换变量（与 inspector/回填表口径一致）
const GIZMO_DELTA_TRACK = ['v.xpos','v.ypos','v.zpos','v.xbasepos','v.ybasepos','v.zbasepos','v.rotatex','v.rotatey','v.rotatez','v.xrot','v.yrot','v.zrot','v.scale','v.extend_scale','v.extend_xrot','v.extend_yrot'];
// 变量行一律显示**真实变量名**（去掉 v. 前缀），与变量面板/表达式里看到的名字一一对应。
// 不要再给方块变量起中文译名：曾把 extend_scale 译成「肢体拉伸」、extend_xrot 译成「肢体旋转X」，
// 既歪曲了原意（extend 是「沿拉伸轴伸缩」，与肢体无关），又让用户无法对应到 v.extend_scale。
const GIZMO_DELTA_LABEL = {
  // 仅这三个不是 molang 变量（文件夹枢轴 / 对称面旋转），没有原名可显示
  'pivot.x': '枢轴X', 'pivot.y': '枢轴Y', 'pivot.z': '枢轴Z',
  'rot.x': '旋转X', 'rot.y': '旋转Y', 'rot.z': '旋转Z'
};
const GIZMO_DELTA_DEG = {
  'v.rotatex':1,'v.rotatey':1,'v.rotatez':1,'v.xrot':1,'v.yrot':1,'v.zrot':1,
  'v.extend_xrot':1,'v.extend_yrot':1,'v.angle':1,'v.xita':1,'rot.x':1,'rot.y':1,'rot.z':1
};

// ---------- 辅助函数（依赖外部状态） ----------
function selected() {
    // 文件夹（骨骼）被选中时，Gizmo/工具优先操作骨骼，不返回方块
    if (selectedFolder) return null;
    return selectedBlocksSet.size ? [...selectedBlocksSet][0] : selectedBlock;
}

function originOfBlock(b) {
    const M = b.scope.toM();
    return new THREE.Vector3(M[0], M[1], M[2]);
}

function centerOfBlock(b) {
    const M = b.scope.toM();
    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
    const mat = computeTransformMatrix(M, rX, rY, rZ);
    return new THREE.Vector3().setFromMatrixPosition(mat);
}

function quatOfBlock(b) {
    const q = new THREE.Quaternion();
    if (b && b.mesh) {
        b.mesh.updateMatrixWorld(true);
        b.mesh.getWorldQuaternion(q);
    }
    return q;
}

// 计算包含剪切变换（extend_xrot / extend_yrot）的方块局部轴在世界空间的方向
// 返回值始终保证线性部分行列式为正（去除镜像翻转），与 quatOfBlock 一致
function shearedAxesOfBlock(b) {
    const M = b.scope.toM();
    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
    const worldMat = computeTransformMatrix(M, rX, rY, rZ);
    const origin = new THREE.Vector3().setFromMatrixPosition(worldMat);
    const sx = new THREE.Vector3(1,0,0).applyMatrix4(worldMat).sub(origin);
    const sy = new THREE.Vector3(0,1,0).applyMatrix4(worldMat).sub(origin);
    const sz = new THREE.Vector3(0,0,1).applyMatrix4(worldMat).sub(origin);
    // 若线性部分行列式为负（镜像/负scale），取反所有轴以匹配 quatOfBlock 的朝向
    if (worldMat.determinant() < 0) {
        sx.negate(); sy.negate(); sz.negate();
    }
    return {
        x: sx.normalize(),
        y: sy.normalize(),
        z: sz.normalize()
    };
}

function varValue(name) {
    const b = selected();
    const v = b?.scope?.vars?.get(name)?.value;
    return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function normRotDeg(v) {
    v = ((v + 180) % 360 + 360) % 360 - 180;
    return v === -180 ? 180 : v;
}

// ---------- 材质工厂 ----------
function mat(color, opacity = 0.98) {
    return new THREE.MeshBasicMaterial({
        color, depthTest: false, depthWrite: false,
        transparent: true, opacity, side: THREE.DoubleSide
    });
}

function hitMat() {
    return new THREE.MeshBasicMaterial({
        color: 0xffffff, depthTest: false, depthWrite: false,
        transparent: true, opacity: 0.001, side: THREE.DoubleSide
    });
}

// ---------- 拾取对象注册 ----------
let _herPickSeq = 0;
function addPick(obj, meta) {
    obj.userData.her = meta;
    obj.userData.herPriority = meta.priority || 0;
    // 唯一 id：同一 type+varName 可能有多个手柄（典型：缩放的 8 个角点全是 type='scale'/v.scale），
    // 拖拽中重建 Gizmo 后要按 id 找回「用户最初抓到的那个手柄」，否则会串到第一个同名牌手柄上。
    if (obj.userData.herPickId == null) obj.userData.herPickId = ++_herPickSeq;
    pickables.push(obj);
}

// ---------- 几何体工厂 ----------
function makeArrowShape(len = 2.15, width = 0.18, head = 0.55) {
    const sh = new THREE.Shape();
    const body = len - head;
    const half = width * 0.5;
    const headHalf = width * 0.95;
    sh.moveTo(0, -half);
    sh.lineTo(body, -half);
    sh.lineTo(body, -headHalf);
    sh.lineTo(len, 0);
    sh.lineTo(body, headHalf);
    sh.lineTo(body, half);
    sh.lineTo(0, half);
    sh.lineTo(0, -half);
    return new THREE.ShapeGeometry(sh);
}

function makeArcBandShape(radius = 2.05, thickness = 0.05, start = 0, end = Math.PI) {
    const sh = new THREE.Shape();
    const steps = 40;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const a = start + (end - start) * i / steps;
        pts.push([Math.cos(a) * (radius + thickness), Math.sin(a) * (radius + thickness)]);
    }
    for (let i = steps; i >= 0; i--) {
        const a = start + (end - start) * i / steps;
        pts.push([Math.cos(a) * (radius - thickness), Math.sin(a) * (radius - thickness)]);
    }
    sh.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(p => sh.lineTo(p[0], p[1]));
    sh.closePath();
    return new THREE.ShapeGeometry(sh);
}

function makeDiamondShape(d = 0.22) {
    const sh = new THREE.Shape();
    sh.moveTo(-d, 0);
    sh.lineTo(0, d);
    sh.lineTo(d, 0);
    sh.lineTo(0, -d);
    sh.closePath();
    return new THREE.ShapeGeometry(sh);
}

function makeArcHeadShape(size = 0.58) {
    const sh = new THREE.Shape();
    sh.moveTo(size, 0);
    sh.lineTo(-size * 0.45, size * 0.58);
    sh.lineTo(-size * 0.18, 0);
    sh.lineTo(-size * 0.45, -size * 0.58);
    sh.lineTo(size, 0);
    return new THREE.ShapeGeometry(sh);
}

// ---------- 朝向工具 ----------
function orientFlat(obj, dir, normal) {
    const x = dir.clone().normalize();
    let z = normal.clone().normalize();
    if (Math.abs(x.dot(z)) > 0.95) {
        z = camera.position.clone().sub(gizmoRoot.position).normalize();
    }
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    z = new THREE.Vector3().crossVectors(x, y).normalize();
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function orientCylinderAlong(obj, dir) {
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}

function orthonormalDiscBasis(axisNormal, preferredX) {
    const z = axisNormal.clone().normalize();
    let x = preferredX.clone().addScaledVector(z, -preferredX.dot(z));
    if (x.lengthSq() < 1e-5) {
        x = new THREE.Vector3(1, 0, 0).addScaledVector(z, -new THREE.Vector3(1, 0, 0).dot(z));
    }
    if (x.lengthSq() < 1e-5) {
        x = new THREE.Vector3(0, 1, 0).addScaledVector(z, -new THREE.Vector3(0, 1, 0).dot(z));
    }
    x.normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    return { x, y, z };
}

function orientDiscToBasis(group, xBasis, yBasis, axisNormal) {
    const d = orthonormalDiscBasis(axisNormal.clone().normalize(), xBasis.clone().normalize());
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d.x, d.y, d.z));
}

// ---------- 旋转轴计算 ----------
function rotLocalAxesOfBlock(b) {
    const rx = varValue('v.xrot');
    const ry = varValue('v.yrot');
    const grx = varValue('v.rotatex');
    const gry = varValue('v.rotatey');
    const grz = varValue('v.rotatez');
    const globalRz = new THREE.Matrix4().makeRotationZ(degToRad(-grz));
    const globalRx = new THREE.Matrix4().makeRotationX(degToRad(grx));
    const globalRy = new THREE.Matrix4().makeRotationY(degToRad(-gry));
    const globalRot = globalRy.clone().multiply(globalRx).multiply(globalRz);
    const matRy = new THREE.Matrix4().makeRotationY(degToRad(-ry));
    const matRx = new THREE.Matrix4().makeRotationX(degToRad(rx));
    return {
        yAxis: new THREE.Vector3(0, 1, 0).applyMatrix4(globalRot).normalize(),
        xAxis: new THREE.Vector3(1, 0, 0).applyMatrix4(matRy).applyMatrix4(globalRot).normalize(),
        zAxis: new THREE.Vector3(0, 0, 1).applyMatrix4(matRx).applyMatrix4(matRy).applyMatrix4(globalRot).normalize()
    };
}

// 全局旋转（rotatex/y/z）圆环法线基准
// globalRot = Ry(-rotatey) * Rx(rotatex) * Rz(-rotatez)，矩阵右→左依次应用：Rz→Rx→Ry
// 旋转轴 = 最外层左乘的逆推：改变 rotatey 整体左乘 Ry, 改变 rotatex 整体左乘 Ry·Rx·Ry⁻¹, 改变 rotatez 整体左乘 Ry·Rx·Rz·Rx⁻¹·Ry⁻¹
// 因此各环法线：
//   y 环 = (0,1,0) ………… Ry 在最外层，绕世界 Y
//   x 环 = Ry(-gry) * (1,0,0) ………… 受 rotatey 影响
//   z 环 = Ry(-gry) * Rx(grx) * (0,0,1) ………… 受 rotatey 和 rotatex 影响
function globalRotBasisFor(axis) {
    const gry = varValue('v.rotatey');
    const grx = varValue('v.rotatex');
    const Ry = new THREE.Matrix4().makeRotationY(degToRad(-gry));
    const Rx = new THREE.Matrix4().makeRotationX(degToRad(grx));
    if (axis === 'x') {
        // rotatex 旋转轴 = Ry(-gry) * (1,0,0)
        const n = new THREE.Vector3(1, 0, 0).applyMatrix4(Ry).normalize();
        return orthonormalDiscBasis(n, new THREE.Vector3(0, 1, 0));
    } else if (axis === 'y') {
        // rotatey 旋转轴 = (0,1,0)：世界 Y（Ry 最后应用在最外层）
        return orthonormalDiscBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    } else {
        // rotatez 旋转轴 = Ry(-gry) * Rx(grx) * (0,0,1)：受 rotatey 和 rotatex 影响
        const n = new THREE.Vector3(0, 0, 1).applyMatrix4(Rx).applyMatrix4(Ry).normalize();
        return orthonormalDiscBasis(n, new THREE.Vector3(1, 0, 0));
    }
}

function rotDiscBasisFor(b, axis) {
    const a = rotLocalAxesOfBlock(b);
    if (axis === 'x') return orthonormalDiscBasis(a.xAxis, a.yAxis);
    if (axis === 'y') return orthonormalDiscBasis(a.yAxis, a.zAxis);
    return orthonormalDiscBasis(a.zAxis, a.xAxis);
}

function rotVisualAngle(axis, varName) {
    const v = varValue(varName);
    return axis === 'x' ? degToRad(v) : degToRad(-v);
}

function rotGizmoCenterLocal(b, mode) {
    return mode === 'center' ? centerOfBlock(b).sub(originOfBlock(b)) : new THREE.Vector3();
}

function rotGizmoCenterWorld(b, mode) {
    return mode === 'center' ? centerOfBlock(b) : originOfBlock(b);
}

// ---------- 数值标签（纹理） ----------
function makeLabelTexture(text, color = 0x111111) {
    const cvs = document.createElement('canvas');
    cvs.width = 512; cvs.height = 160;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    const r = 26, x = 18, y = 24, w = 476, h = 112;
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.strokeStyle = 'rgba(0,0,0,.72)'; ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillText(text, 256, 80);
    const tex = new THREE.CanvasTexture(cvs);
    tex.needsUpdate = true;
    return tex;
}

function makeEmbeddedLabel(varName, color, size = 1) {
    const text = `${varName.replace('v.', '')}=${varValue(varName).toFixed(4)}`;
    const label = new THREE.Mesh(
        new THREE.PlaneGeometry(1.22 * size, 0.38 * size),
        new THREE.MeshBasicMaterial({
            map: makeLabelTexture(text, color),
            transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide
        })
    );
    label.userData.herLabelVar = varName;
    label.renderOrder = 1000;
    return label;
}

// ---------- 创建箭头 ----------
function makeArrow(dir, planeNormal, color, varName, scale, offset = 0, opts = {}) {
    const group = new THREE.Group();
    const d = dir.clone().normalize();
    const vl = opts.visualScale || 1;
    const start = (opts.start || 0.55) + offset;
    const shaftLen = 1.8 * vl;
    const headLen = 0.28 * vl;
    const shaftR = 0.025 * vl;
    const isBase = opts.moveKind === 'base';
    if (isBase) {
        // 位移：分段细线（6段短圆柱 + 5个间隙）
        const segLen = shaftLen / 11;
        for (let i = 0; i < 6; i++) {
            const seg = new THREE.Mesh(
                new THREE.CylinderGeometry(shaftR, shaftR, segLen, 6),
                mat(color, 0.85)
            );
            const pos = start + (i * 2 + 0.5) * segLen;
            seg.position.copy(d.clone().multiplyScalar(pos));
            seg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
            group.add(seg);
        }
        // 圆锥头
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(shaftR * 3.5, headLen, 8),
            mat(color, 0.9)
        );
        cone.position.copy(d.clone().multiplyScalar(start + shaftLen));
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
        group.add(cone);
    } else {
        // 枢轴：细圆柱杆 + 圆锥头
        const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 6),
            mat(color, 0.9)
        );
        shaft.position.copy(d.clone().multiplyScalar(start + shaftLen * 0.5));
        shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
        group.add(shaft);
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(shaftR * 3.5, headLen, 8),
            mat(color, 0.95)
        );
        cone.position.copy(d.clone().multiplyScalar(start + shaftLen + headLen * 0.5));
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
        group.add(cone);
    }
    // 命中体
    const hitLen = 3.0 * vl;
    const hitRadius = Math.max(0.45 * vl, 0.40);
    const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(hitRadius, hitRadius, hitLen, 24, 1, true), hitMat()
    );
    orientCylinderAlong(hit, d);
    hit.position.copy(d.clone().multiplyScalar(start + hitLen * 0.5));
    const pickMeta = {
        type: 'move', varName, scale, axis: d,
        planeNormal: planeNormal.clone().normalize(), color,
        visualLen: vl, start, priority: opts.priority || 0, hitLen, hitRadius,
        axisName: opts.axisName || (varName.includes('x') ? 'x' : (varName.includes('y') ? 'y' : 'z'))
    };
    // 如果指定了 mode（如 'base'），添加到拾取元数据
    if (opts.mode) pickMeta.mode = opts.mode;
    addPick(hit, pickMeta);
    group.add(hit);
    group.userData.herMoveKind = opts.moveKind || 'origin';
    group.userData.herMoveAxis = opts.axisName || (varName.includes('x') ? 'x' : (varName.includes('y') ? 'y' : 'z'));
    return group;
}

// ---------- 统一Gizmo圆环工厂 ----------
// 所有旋转/拉伸圆环都通过此函数创建，消除重复代码。
// 核心参数：color 圆环颜色 | axis 对应轴('x'/'y'/'z') | radius 圆环大小
// 接口参数：varName 关联变量名 | axisNormal/xBasis/yBasis 圆盘朝向基向量
// opts 可选：bandWidth弧带宽 | diamondSize菱形大小 | end弧扫掠角 | rotMode旋转模式 |
//   priority拾取优先级 | offset位置偏移 | addHitSpheres是否挂拾取球(默认true) |
//   registerToArcGroups是否加入追踪数组(默认true) | renderOrderArc/Diamond渲染层级 |
//   skipFaceAngle跳过朝向角计算(拉伸环用，因其挂在嵌套旋转框下需用局部公式) |
//   arcOpacity/diamondOpacity材质透明度
// 返回：{ group, plane, axis, varName, radius, faceAngle, pickMeshes }
function createGizmoRing(color, axis, radius, varName, axisNormal, xBasis, yBasis, opts = {}) {
    const group = new THREE.Group(), plane = new THREE.Group(), pickMeshes = [];
    const end = opts.end ?? Math.PI, rotMode = opts.rotMode ?? 'origin';
    const d0 = orthonormalDiscBasis(axisNormal.clone().normalize(), xBasis.clone().normalize());
    // 弧带 + 菱形指示器
    const arc = new THREE.Mesh(makeArcBandShape(radius, opts.bandWidth ?? 0.05, 0, end), mat(color, opts.arcOpacity ?? 0.85));
    if (opts.renderOrderArc !== undefined) arc.renderOrder = opts.renderOrderArc;
    const pgram = new THREE.Mesh(makeDiamondShape(opts.diamondSize ?? 0.22), mat(color, opts.diamondOpacity ?? 0.95));
    pgram.position.set(Math.cos(end * 0.5) * radius, Math.sin(end * 0.5) * radius, 0);
    pgram.rotation.z = end * 0.5;
    if (opts.renderOrderDiamond !== undefined) pgram.renderOrder = opts.renderOrderDiamond;
    plane.add(arc, pgram);
    // 射线拾取球：旋转弧用球体命中，拉伸环不用(addHitSpheres:false，改用屏幕距离判定)
    if (opts.addHitSpheres !== false) {
        const rm = { type:'rot', varName, scale:1, axis, rotMode, priority: opts.priority ?? 35, axisNormal:d0.z.clone(), xBasis:d0.x.clone(), yBasis:d0.y.clone(), radius, end };
        const hg = new THREE.SphereGeometry(0.34, 14, 10);
        for (let i = 0; i <= 22; i++) {
            const a = end * i / 22, p = new THREE.Mesh(hg, hitMat());
            p.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
            addPick(p, Object.assign({}, rm)); pickMeshes.push(p); plane.add(p);
        }
        const ph = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 10), hitMat());
        ph.position.copy(pgram.position); addPick(ph, Object.assign({}, rm)); pickMeshes.push(ph); plane.add(ph);
    }
    group.add(plane);
    group.userData.herRotAxis = axis; group.userData.herRotVar = varName;
    group.userData.herRotMode = rotMode; group.userData.herRotPlane = plane;
    if (opts.offset) group.position.copy(opts.offset);
    orientDiscToBasis(group, d0.x, d0.y, d0.z);
    // 摄像机朝向角：让半圆弧始终正对相机。拉伸环用skipFaceAngle跳过(因嵌套框下worldPosition不准)
    let faceAngle = 0;
    if (opts.skipFaceAngle !== true) {
        const wc = new THREE.Vector3(); group.getWorldPosition(wc);
        const cd = camera.position.clone().sub(wc).normalize();
        faceAngle = Math.atan2(cd.dot(d0.y), cd.dot(d0.x));
        group.userData.herFaceAngle = faceAngle;
        plane.rotation.z = rotVisualAngle(axis, varName) + faceAngle - Math.PI * 0.5;
    }
    if (opts.registerToArcGroups !== false) rotArcGroups.push(group);
    return { group, plane, axis, varName, radius, faceAngle, pickMeshes };
}
// 创建旋转弧：薄包装，默认参数后直接调用工厂
function makeArc(axis, color, varName, axisNormal, xBasis, yBasis, opts = {}) {
    return createGizmoRing(color, axis, opts.radius || 2.05, varName, axisNormal, xBasis, yBasis, opts).group;
}

// ---------- 原点→中心连线 ----------
function makeOriginCenterLine(b) {
    const geom = new THREE.CylinderGeometry(0.022, 0.022, 1, 16, 1, true);
    const cyl = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9,
        depthTest: false, depthWrite: false
    }));
    cyl.renderOrder = 998;
    originCenterLineObj = cyl;
    updateOriginCenterLineLive(b);
    return cyl;
}

function updateOriginCenterLineLive(b = selected()) {
    if (!originCenterLineObj || !b) return;
    const center = centerOfBlock(b).sub(originOfBlock(b));
    const len = center.length();
    originCenterLineObj.visible = len >= 1e-4;
    if (len < 1e-4) return;
    originCenterLineObj.position.copy(center.clone().multiplyScalar(0.5));
    originCenterLineObj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), center.clone().normalize());
    // ★ X/Z 随摄像机距离缩放（与 Gizmo 控件同系数 gizmoCamScale），保持屏幕上粗细恒定；Y=真实长度，不缩放
    originCenterLineObj.scale.set(gizmoCamScale, len, gizmoCamScale);
}

// ---------- 缩放点（v.scale 角点 + es 拉伸轴 + ex/ey 旋转环） ----------
let stretchGizmoRefs = null; // { group, eyFrame, exFrame, rod, head, rodHit, eyRing, exRing, worldDir }

// 由三个局部轴构造朝向四元数
function quatFromAxes(xAx, yAx, zAx) {
    const m = new THREE.Matrix4().makeBasis(xAx, yAx, zAx);
    return new THREE.Quaternion().setFromRotationMatrix(m);
}

// 计算 es 拉伸轴在「局部帧」中的方向：
// 由 computeTransformMatrix 的拉伸算子 S = Ry(-ey)·Rx(ex)·Sz(es)·Rx(-ex)·Ry(ey) 可知，
// 其沿 Sz(es) 缩放的特征轴（即真实拉伸方向）为 Ry(-ey)·Rx(ex)·ẑ（已数值验证：S·v = es·v 恒成立）。
// 注意 ey 取负号：之前用 +ey 导致 ey 旋转方向完全相反。
function localStretchDir(exDeg, eyDeg) {
    const ex = THREE.MathUtils.degToRad(exDeg);
    const ey = THREE.MathUtils.degToRad(eyDeg);
    const v = new THREE.Vector3(0, 0, 1);
    v.applyAxisAngle(new THREE.Vector3(1, 0, 0), ex);    // Rx(ex)·ẑ
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), -ey);   // Ry(-ey)·Rx(ex)·ẑ  ← 关键负号
    return v.normalize();
}

// 拉伸专用旋转环：更细弧带+高渲染层级，不挂拾取球(改用屏幕距离判定)。
// skipFaceAngle=true 跳过工厂的朝向角计算，改用局部公式(因嵌套旋转框下worldPosition不准)
function makeStretchRing(varName, axis, color, axisNormalL, xBasisL, yBasisL, radius) {
    const r = createGizmoRing(color, axis, radius, varName, axisNormalL, xBasisL, yBasisL, {
        bandWidth: 0.03, diamondSize: 0.16, addHitSpheres: false, registerToArcGroups: false,
        renderOrderArc: 997, renderOrderDiamond: 998, skipFaceAngle: true
    });
    const d0 = orthonormalDiscBasis(axisNormalL.clone().normalize(), xBasisL.clone().normalize());
    r.faceAngle = Math.atan2(d0.y.clone().dot(camera.position), d0.x.clone().dot(camera.position));
    r.plane.rotation.z = rotVisualAngle(axis, varName) + r.faceAngle - Math.PI * 0.5;
    r.group.userData.herFaceAngle = r.faceAngle;
    return r;
}

// 实时刷新 es 拉伸轴方向 / 长度（随 ex、ey、extend_scale 变化），并使 ex/ey 圆环面向摄像机
function updateStretchGizmoLive(b = selected()) {
    if (!stretchGizmoRefs || !b) return;
    // ★ 整个拉伸控件（ex/ey 圆环 + es 杆）按模型真实尺寸缩放，替代原来的「摄像机距离」补偿：
    //   模型小 → 控件小；镜头拉远 → 控件随模型一起变小，不再恒定屏幕大小。
    const gk = scaleGizmoSizeOf(b);
    stretchGizmoRefs.group.scale.setScalar(gk);
    stretchGizmoRefs.sizeScale = gk;
    const ex = Number(b.scope.vars.get('v.extend_xrot')?.value ?? 0);
    const ey = Number(b.scope.vars.get('v.extend_yrot')?.value ?? 0);
    const es = Number(b.scope.vars.get('v.extend_scale')?.value ?? 1);
    const la = rotLocalAxesOfBlock(b);
    const nLocal = localStretchDir(ex, ey);                       // 局部方向（仅由 ex/ey 决定）
    const worldDir = la.xAxis.clone().multiplyScalar(nLocal.x)
        .add(la.yAxis.clone().multiplyScalar(nLocal.y))
        .add(la.zAxis.clone().multiplyScalar(nLocal.z)).normalize();
    // 框架旋转：ey 旋转框携带 ex 旋转环 + 拉伸杆；ex 倾斜框仅倾斜杆（圆环靠 head 表示角度）
    // 注意 ey 取负号（与真实拉伸轴 Ry(-ey)·Rx(ex)·ẑ 一致，否则 ey 旋转方向相反）
    stretchGizmoRefs.eyFrame.rotation.y = THREE.MathUtils.degToRad(-ey);
    stretchGizmoRefs.exFrame.rotation.x = THREE.MathUtils.degToRad(ex);
    stretchGizmoRefs.group.updateMatrixWorld(true);
    // ex/ey 圆环：复用旋转环的「面向摄像机」逻辑——用各自 group 的世界朝向求面朝向角，半圆始终正对相机
    const refreshRingFace = (ring) => {
        if (!ring) return;
        const wp = new THREE.Vector3(); ring.group.getWorldPosition(wp);
        const cd = camera.position.clone().sub(wp).normalize();
        const wq = ring.group.getWorldQuaternion(new THREE.Quaternion());
        const wx = new THREE.Vector3(1, 0, 0).applyQuaternion(wq);
        const wy = new THREE.Vector3(0, 1, 0).applyQuaternion(wq);
        const wz = new THREE.Vector3(0, 0, 1).applyQuaternion(wq);
        const faceAngle = Math.atan2(cd.dot(wy), cd.dot(wx));
        ring.plane.rotation.z = rotVisualAngle(ring.axis, ring.varName) + faceAngle - Math.PI * 0.5;
        ring.faceAngle = faceAngle; // 供 pickStretchByScreenDistance 采样半圆使用
        // 同步拖拽轴基到当前世界朝向（ex 环随 ey 旋转后，旋转拖拽方向才正确）
        ring.pickMeshes.forEach(m => {
            if (m.userData.her) {
                m.userData.her.axisNormal = wz.clone();
                m.userData.her.xBasis = wx.clone();
                m.userData.her.yBasis = wy.clone();
            }
        });
    };
    refreshRingFace(stretchGizmoRefs.eyRing);
    refreshRingFace(stretchGizmoRefs.exRing);
    // 杆长度随 es 变化（含可见下限，确保始终清晰可见）
    const len = THREE.MathUtils.clamp(0.9 + Math.abs(es) * 0.8, 0.9, 6);
    const { rod, head, rodHit } = stretchGizmoRefs;
    rod.scale.set(1, len, 1);
    rod.position.set(0, 0, len * 0.5);
    head.position.set(0, 0, len + 0.22);
    rodHit.scale.set(1, len + 0.6, 1);
    rodHit.position.set(0, 0, (len + 0.6) * 0.5);
    stretchGizmoRefs.worldDir = worldDir;                         // 供拖拽投影使用
}

// 缩放角点的 8 个基准角点（模型局部坐标）。
// 常规方块/静态模型 = 单位立方体 ±0.5；掉落物是「平躺的薄板精灵」，几何体已烘焙
// 155° 朝向 + 中心偏移 + 抬升，精灵 16×16 像素 ≈ 2.21 块、厚 0.138 —— 继续用 ±0.5
// 会让角点缩在模型内部、与整体外框完全对不上。这里改用精灵平面内的真实外框（不透明
// 像素范围）再按烘焙朝向/偏移/抬升映射回局部坐标，角点即落在掉落物外框的 8 个角上。
function blockLocalCorners(b) {
    const g = (b && b.mesh) ? b.mesh.geometry : null;
    const db = g && g.userData ? g.userData.dropBox : null;
    if (db) {
        const rot = db.rotY * Math.PI / 180, cs = Math.cos(rot), sn = Math.sin(rot);
        // 角点顺序与单位立方体一致：x 快、y 次、z 慢（(0,0,0)(1,0,0)(1,1,0)(0,1,0)(0,0,1)…）
        return [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(([ux, uy, uz]) => {
            const x = ux ? db.maxX : db.minX;
            const y = (uy ? db.maxY : db.minY) + db.y;
            const z = uz ? db.maxZ : db.minZ;
            return [x * cs - z * sn + (db.ox || 0), y, x * sn + z * cs + (db.oz || 0)];
        });
    }
    return [[-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[0.5,0.5,-0.5],[-0.5,0.5,-0.5],
            [-0.5,-0.5,0.5],[0.5,-0.5,0.5],[0.5,0.5,0.5],[-0.5,0.5,0.5]];
}

// scale Gizmo 的尺寸基准：跟随方块的真实世界边长（三根轴中最大跨度），上限 1（名义尺寸）。
// ★ 不再按「摄像机距离」补偿：镜头拉远时控件跟模型一起在屏幕上变小；模型变小控件也随之变小。
function scaleGizmoSizeOf(b = selected()) {
    if (!b) return 1;
    const M = b.scope.toM();
    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
    const e = computeTransformMatrix(M, rX, rY, rZ).elements;
    // 几何体为 ±0.5 的单位立方体 ⇒ 世界边长 = 变换矩阵三列向量长度
    const ex = Math.hypot(e[0], e[1], e[2]);
    const ey = Math.hypot(e[4], e[5], e[6]);
    const ez = Math.hypot(e[8], e[9], e[10]);
    const s = Math.max(ex, ey, ez);
    return (Number.isFinite(s) && s > 1e-6) ? Math.min(Math.max(s, 0.05), 1) : 1;
}

// 实时刷新 scale 角点到方块真实角点（随 extend / scale / 旋转 / 位移 任意变量变化而贴合模型）
function updateScaleDotsLive(b = selected()) {
    if (!stretchGizmoRefs || !stretchGizmoRefs.scaleDots || !b) return;
    const gk = scaleGizmoSizeOf(b);                                  // 角点大小跟随模型尺寸
    const Mfull = b.scope.toM();
    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
    const W = computeTransformMatrix(Mfull, rX, rY, rZ);
    const gizmoOrigin = gizmoRoot.position; // gizmoRoot 仅平移到 pivot，局部坐标 = 世界 - pivot
    // ★ 角点基准每帧重算（掉落物的外框由贴图几何决定，换贴图/异步加载后要立刻贴合）
    const corners = blockLocalCorners(b);
    for (const d of stretchGizmoRefs.scaleDots) {
        const p = corners[d.idx] || corners[0];
        const c = d.corner.set(p[0], p[1], p[2]).applyMatrix4(W).sub(gizmoOrigin);
        d.dot.position.copy(c);
        d.dot.lookAt(camera.position);
        d.dot.scale.setScalar(gk);
        d.hit.position.copy(c);
        d.hit.scale.setScalar(gk);
        // ★ 角点的拖拽轴必须跟着角点一起实时更新：makeScaleDots 只在「建造 gizmo 那一刻」
        //   烘死了 axis = 当时角点的世界径向；一旦方块旋转/拉伸/位移让角点换向，旧 axis 就和
        //   视觉角点方向不符，拖拽投影（screenAxis）会打到错误的方向上 —— 表现为
        //   「某些角点向外拖反而缩小 / 完全拖不动」。这里按最新径向同步刷新。
        if (d.hit.userData && d.hit.userData.her && d.hit.userData.her.type === 'scale') {
            if (c.lengthSq() > 1e-9) d.hit.userData.her.axis.copy(c.normalize());
        }
    }
}

function makeScaleDots(b) {
    const root = new THREE.Group();
    // ===== 1. 黄色角点（v.scale）—— 严格按完整变换矩阵定位到方块真实角点 =====
    const dotsGroup = new THREE.Group();
    // 角点基准按模型真实外框取（掉落物 = 精灵外框，其余 = 单位立方体 ±0.5）
    const pts = blockLocalCorners(b);
    // 完整世界变换矩阵（basepos / 拉伸 / 缩放 / 局部旋转 / 全局旋转 / 位移），与方块网格完全一致
    // 注：矩阵已含 v.scale 的缩放，几何体角点即为 ±0.5，故直接 W·(±0.5)，不可再乘 s
    const Mfull0 = b.scope.toM();
    const rX0 = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY0 = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ0 = b.scope.vars.get('v.rotatez')?.value ?? 0;
    const W0 = computeTransformMatrix(Mfull0, rX0, rY0, rZ0);
    const gizmoOrigin0 = gizmoRoot.position.clone(); // gizmoRoot 仅平移到 pivot，局部坐标 = 世界 - pivot
    // ★【2026-10-31】角点方块 0.18 → 0.11：0.18 在 1 格方块上接近 1/5 边长，视觉上过大、压住模型
    //   （用户反馈「顶点正方形太大」）。不可见命中球（半径 0.28）不动，点击容差不变。
    const dotGeom = new THREE.PlaneGeometry(0.11, 0.11);
    const scaleDotRefs = [];
    pts.forEach((p, idx) => {
        const corner = new THREE.Vector3(p[0], p[1], p[2]); // 基础角点，每帧用最新矩阵重算以贴合模型
        const c = corner.clone().applyMatrix4(W0).sub(gizmoOrigin0); // 真实世界角点（经完整矩阵）
        const dot = new THREE.Mesh(dotGeom, mat(0xfff7a8));
        dot.position.copy(c);
        dot.lookAt(camera.position);
        dotsGroup.add(dot);
        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), hitMat());
        hit.position.copy(c);
        addPick(hit, { type: 'scale', varName: 'v.scale', scale: 0.012, priority: 85, axis: c.clone().normalize() });
        dotsGroup.add(hit);
        scaleDotRefs.push({ dot, hit, corner, idx });
    });
    root.add(dotsGroup);

    // ===== 2. 拉伸轴 Gizmo（v.extend_scale / ex / ey）=====
    const la = rotLocalAxesOfBlock(b);
    const stretchGroup = new THREE.Group();
    stretchGroup.quaternion.copy(quatFromAxes(la.xAxis, la.yAxis, la.zAxis));
    root.add(stretchGroup);
    // ★ 不加入 gizmoArrowGroups：它的尺寸由 updateStretchGizmoLive 按模型真实尺寸决定（不按摄像机距离补偿）

    const ringMat = (c) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    // 拉伸轴与旋转环均挂在拉伸组（已对齐方块局部轴）下，使用「局部坐标系」基向量
    const lx = new THREE.Vector3(1, 0, 0), ly = new THREE.Vector3(0, 1, 0), lz = new THREE.Vector3(0, 0, 1);

    // ey 旋转环（绕局部 Y，控制 v.extend_yrot）—— 风格与其他旋转环统一，并面向摄像机
    const eyRing = makeStretchRing('v.extend_yrot', 'y', 0x3cd6ff, ly, lz, lx, 2.2);
    stretchGroup.add(eyRing.group);

    // ey 旋转框：承载 ex 旋转环 + 拉伸杆，使 ey 旋转时带着它们一起转（满足"ey 带着 ex"的需求）
    const eyCarryFrame = new THREE.Group();
    stretchGroup.add(eyCarryFrame);

    // ex 旋转环（绕局部 X，控制 v.extend_xrot）—— 作为 ey 旋转框的子节点，随 ey 一起转并面向摄像机
    const exRing = makeStretchRing('v.extend_xrot', 'x', 0xff9a3c, lx, ly, lz, 1.9);
    eyCarryFrame.add(exRing.group);

    // es 拉伸轴：细细的纯色紫色杆 + 锥头箭头，简洁优雅；随 ex 倾斜、随 ey 绕 Y 旋转
    const rodGroup = new THREE.Group();
    eyCarryFrame.add(rodGroup);
    const purple = 0xb15cff;
    const rodMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true, opacity: o, side: THREE.DoubleSide });
    // 细细的半透明紫杆（无描边）
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 18), rodMat(purple, 0.55));
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)); // 沿局部 Z（拉伸轴）
    rod.renderOrder = 997; rodGroup.add(rod);
    // 锥头箭头
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 24), rodMat(purple, 0.55));
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
    head.renderOrder = 998; rodGroup.add(head);
    // 命中体（沿轴，半透明，不与圆环抢判定）
    const rodHit = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 12), hitMat());
    rodHit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
    addPick(rodHit, { type: 'stretch', varName: 'v.extend_scale', scale: 0.012, priority: 12 });
    rodGroup.add(rodHit);

    stretchGizmoRefs = { group: stretchGroup, eyFrame: eyCarryFrame, exFrame: rodGroup, rod, head, rodHit, scaleDots: scaleDotRefs,
        eyRing, exRing, worldDir: new THREE.Vector3(0, 0, 1) };
    updateStretchGizmoLive(b);
    return root;
}

// ==================== 「两边一角」预设专用 Gizmo ====================
/* 官方预设里有三套「两边一角」形状参数（都是两条边 + 夹角）：
     · 方块侧面：两边一角        → v.side_a / v.side_b / v.angle（v16 起与另两套统一；旧块仍用 l1 / l2 / xita）
     · 平行四边形：两边一角      → v.side_a / v.side_b / v.angle
     · 旗帜：任意平行四边形      → v.side_a / v.side_b / v.angle
   这些预设的 v.scale / v.extend_scale / v.extend_xrot / v.extend_yrot / v.xrot… 全是预设表达式
   算出来的**派生量**，用普通缩放的「角点 + 肢体拉伸」控件去改毫无意义（拖了也会被表达式覆盖）。
   因此缩放入口（工具栏 data-mode="scale"）在这三类方块上改为显示专用控件：
     · 两条真实边上的边长手柄（拖动直接改边长参数）
     · 公共顶点处的夹角圆环（拖动直接改夹角参数）
   写入统一走 plgWriteParamDelta：关键帧方块自动落到当前帧（kfGizmoWriteVar），
   molang 预设自动烘焙回程序常量行，未开 molang 的预设直接写变量 —— 与面板改值完全同一条通道。 */
let plgGizmoRefs = null;

const PLG_PRESETS = {
    // 每条边落在哪个局部轴上（实测：三套预设的平行四边形都展开在局部 X-Z 平面），
    // 具体「哪条轴由哪个变量驱动」不写死，由 plgCalcGains() 数值微分决定。
    // corner 是两条边的公共顶点（局部坐标）；uAxis / vAxis 是该顶点到另两个角的局部向量，
    // **长度必须等于真实模型边长**（方块 1.0；旗帜旗布是 1.0×2.0），否则量出来的边长会少一半。
    // 参数与「世界边长 / 几何夹角」并非处处 1:1（预设内部是旋转 + 非等比缩放的近似分解），
    // 所以换算系数同样由 plgCalcGains() 在每次重建时对当前姿态做数值微分求出。
    // 旗帜：旗布在局部是 1.0(x) × 2.0(z) 的薄盒（实测顶点 x∈[-0.321,0.679]、z∈[-1.657,0.343]）。
    // ★vAxis 取 **-Z**（配合 z=+0.343 那个角）：旗帜预设的默认摆位与「平行四边形」预设互为镜像
    //   （实测同机位下 A 边同向、B 边差 180°），负号把它掰回来，两套预设的 A/B 箭头看起来一致。
    //   只是换用同一根边的另一端当公共角，边长/几何都不变；也不能同时翻 u，否则 A 又反了。
    flag: {
        id: 'flag', aVar: 'v.side_a', bVar: 'v.side_b', angVar: 'v.angle',
        corner: [-0.3213778076, 0.171512, 0.3425539062], uAxis: [1, 0, 0], vAxis: [0, 0, -2]
    },
    cube: {
        id: 'cube', aVar: 'v.side_a', bVar: 'v.side_b', angVar: 'v.angle',
        corner: [-0.5, 0, -0.5], uAxis: [1, 0, 0], vAxis: [0, 0, 1]
    },
    side: {
        id: 'side', aVar: 'v.side_a', bVar: 'v.side_b', angVar: 'v.angle',
        corner: [-0.5, -0.5, -0.5], uAxis: [1, 0, 0], vAxis: [0, 0, 1]
    }
};

// v16 之前创建的「方块侧面」块，参数仍是旧名（l1 / l2 / xita）。变量绑定单独留一份，
// 免得老项目里的这类方块直接丢掉控件（识别见 plgDetectPreset 的旧名分支）。
const PLG_SIDE_LEGACY = { ...PLG_PRESETS.side, aVar: 'v.l1', bVar: 'v.l2', angVar: 'v.xita' };

// 识别方块是否来自「两边一角」预设。
// 三套预设的输入参数已统一成 side_a / side_b / angle（v16），所以第一道闸门只看这三个名字；
// 但三者取的**是模型上不同的角/轴**（旗帜 corner z=+0.343、vAxis=-Z），不知道是哪一种就摆不出控件，
// 因此仍各认一个只由该预设表达式派生出来的变量（scy_rot / fit_a / ratio）来区分种类。
function plgDetectPreset(b) {
    if (!b || !b.scope || !b.scope.vars) return null;
    const has = (n) => b.scope.vars.has('v.' + n);
    if (!(has('side_a') && has('side_b') && has('angle'))) {
        // 兼容 v16 之前的「方块侧面」块：参数还是旧名 l1 / l2 / xita
        return (has('l1') && has('l2') && has('xita')) ? PLG_SIDE_LEGACY : null;
    }
    if (has('scy_rot')) return PLG_PRESETS.side;
    if (has('fit_a')) return PLG_PRESETS.flag;
    if (has('ratio')) return PLG_PRESETS.cube;
    return null;
}

// 多选时挑出「该由两边一角控件来操刀的那块预设方块」。
// selected() 返回的是选区内第一块（insertion order），不是最后点的那块；用户先点普通方块、
// 再 Ctrl 追加预设块时，控件会一直绑在普通方块上 → plgMeasure 取不到预设变量，整组隐藏，
// 看起来就是「多选时用不了两边一角控件」。这里优先用最后点选的那块，否则在选区里找第一块预设块。
function plgPickPresetBlock(b) {
    if (plgDetectPreset(b)) return b;
    const sb = (typeof selectedBlock !== 'undefined') ? selectedBlock : null;
    if (sb && selectedBlocksSet.has(sb) && plgDetectPreset(sb)) return sb;
    for (const x of selectedBlocksSet) if (plgDetectPreset(x)) return x;
    return b;
}

// 从一份变量表量出「公共顶点 + 两条边」在世界空间的位置、边长与面内夹角。
// 传入的是纯 vars Map（可能来自扰动副本），不依赖方块对象，便于做数值微分。
function plgMeasure(vars, preset) {
    const g = (n, dflt) => {
        const x = Number(vars.get('v.' + n)?.value);
        return Number.isFinite(x) ? x : (dflt ?? 0);
    };
    // 与 VariableScope.toM() 同一份 13 元素布局（scale / extend_scale 缺省为 1，其余缺省 0）
    const M = [g('xpos'), g('ypos'), g('zpos'),
        g('xrot'), g('yrot'), g('zrot'),
        g('scale', 1), g('extend_scale', 1),
        g('extend_xrot'), g('extend_yrot'),
        g('xbasepos'), g('ybasepos'), g('zbasepos')];
    const W = computeTransformMatrix(M, g('rotatex'), g('rotatey'), g('rotatez'));
    const u = new THREE.Vector3().fromArray(preset.uAxis);
    const v = new THREE.Vector3().fromArray(preset.vAxis);
    const c0 = new THREE.Vector3().fromArray(preset.corner);
    const c = c0.clone().applyMatrix4(W);
    const pA = c0.clone().add(u).applyMatrix4(W);
    const pB = c0.clone().add(v).applyMatrix4(W);
    const vA = pA.clone().sub(c), vB = pB.clone().sub(c);
    const lenA = vA.length(), lenB = vB.length();
    if (![c.x, c.y, c.z, pA.x, pA.y, pA.z, pB.x, pB.y, pB.z].every(Number.isFinite)) return null;
    if (!(lenA > 1e-5) || !(lenB > 1e-5)) return null;
    const dirA = vA.clone().normalize(), dirB = vB.clone().normalize();
    const cosT = THREE.MathUtils.clamp(dirA.dot(dirB), -1, 1);
    return { c, dirA, dirB, lenA, lenB, angleRad: Math.acos(cosT) };
}

// 参数扰动后的变量副本：复制一份 def，改掉该参数后按「本块同一套求值口径」整段重算，
// 得到派生量（xrot / scale / extend_* 等）都跟着变的完整结果。全程不碰方块本体、不写关键帧。
function plgVarsAfterDelta(b, varName, delta) {
    const sc = b && b.scope;
    if (!sc || !sc.vars) return null;
    const vars = new Map();
    for (const [k, d] of sc.vars) vars.set(k, Object.assign({}, d));
    const molang = !!(sc.molangMode && sc.program && sc.program.trim());
    let program = sc.program || '';
    if (molang) {
        const short = String(varName).replace(/^v\./, '');
        const re = new RegExp('(v\\.' + short + '\\s*=\\s*)(-?[0-9.]+(?:\\.[0-9]+)?)');
        if (!re.test(program)) return null;
        program = program.replace(re, (m0, p1, p2) => p1 + (Number(p2) + delta));
    } else {
        const d = vars.get(varName);
        if (!d) return null;
        const v = (Number(d.value) || 0) + delta;
        d.value = v; d.expr = String(v);
    }
    const tmp = { vars, _assigned: new Set(), blockId: sc.blockId, molangMode: molang, program, _spontCache: null };
    try { VariableScope.prototype.recompute.call(tmp); } catch (e) { return null; }
    return tmp.vars;
}

// 数值微分求出「两条边各由哪个参数驱动」+「拖 1 世界单位 / 转 1° 几何夹角 → 参数增量」。
// 预设的几何分解只在一定范围内近似成立（方块侧面尤其明显：l1/l2 会同时拉动多条棱），
// 所以每次重建都按当前姿态重新求偏导，再把每条边绑给对它影响最大的那个参数。
function plgCalcGains(b, preset) {
    const res = { varA: preset.aVar, varB: preset.bVar, factorA: 1, factorB: 1, factorAng: 1 };
    const base = plgMeasure(b.scope.vars, preset);
    if (!base) return res;
    const baseDeg = THREE.MathUtils.radToDeg(base.angleRad);
    const pv = (n) => Number(b.scope.vars.get(n)?.value) || 0;
    // 某参数对 (A 边长, B 边长, 面内夹角) 的局部偏导
    const deriv = (name) => {
        const eps = Math.max(0.05, Math.abs(pv(name)) * 0.02);
        const vars = plgVarsAfterDelta(b, name, eps);
        if (!vars) return null;
        const m = plgMeasure(vars, preset);
        if (!m) return null;
        return {
            lenA: (m.lenA - base.lenA) / eps,
            lenB: (m.lenB - base.lenB) / eps,
            ang: (THREE.MathUtils.radToDeg(m.angleRad) - baseDeg) / eps
        };
    };
    const conv = (g) => {
        if (!Number.isFinite(g) || Math.abs(g) < 1e-3) return 1;   // 几乎不动这条边：保底 1:1
        const f = 1 / g;
        return (Math.abs(f) > 0.05 && Math.abs(f) < 20) ? f : 1;
    };
    const dA = deriv(preset.aVar), dB = deriv(preset.bVar);
    if (dA && dB) {
        // 两种绑定方案：A←aVar / B←bVar，或 A←bVar / B←aVar。
        // 取「各边与所绑参数的耦合强度之和」更大的那种，避免把一条边绑到几乎不动它的参数上。
        const direct = Math.abs(dA.lenA) + Math.abs(dB.lenB);
        const swapped = Math.abs(dA.lenB) + Math.abs(dB.lenA);
        if (swapped > direct) {
            // 交换后：边 A（沿 X 的边长）由 bVar 驱动，边 B（沿 Z 的边长）由 aVar 驱动
            res.varA = preset.bVar; res.varB = preset.aVar;
            res.factorA = conv(dB.lenA); res.factorB = conv(dA.lenB);
        } else {
            res.factorA = conv(dA.lenA); res.factorB = conv(dB.lenB);
        }
    }
    const dAng = deriv(preset.angVar);
    if (dAng) res.factorAng = conv(dAng.ang);
    return res;
}

// ---------- 屏幕空间（2D）控件基础设施 ----------
/* 3D 杆/环在斜视角下会被压扁：夹角很小时圆环缩成一条线、根本点不到，两根棒子也不符合
   模拟器已有的「箭头 / 圆环」语言。整套控件改为投影到屏幕、用 fixed 定位的 SVG 绘制：
     · 两条边 → 沿真实边投影的箭头（杆 + 三角头 + 圆形抓手），抓手上标注对应参数值
     · 夹角   → 固定屏幕半径的圆弧 + 楔形 + 菱形抓手
   尺寸一律以像素计（不随相机远近变化），命中区恒定 ≥ 17px，小角度也一定点得到。
   拖拽仍走 plgWriteParamDelta（关键帧 / molang / 普通变量三条通道与面板改值同一条）。 */
const PLG_SVG_NS = 'http://www.w3.org/2000/svg';
const PLG_COLOR = { a: '#49e6ff', b: '#ffb347', ang: '#b15cff' };
let plgOverlayEl = null, plgOverlayParts = null, plgDrag = null;
// 松手后抓手「滑回环中点」的过渡状态（拖动期间抓手跟着光标，与环中点最多差 20~70°，直接瞬移会跳）
let plgGripReturn = null;

function _plgNode(tag, attrs, css) {
    const e = document.createElementNS(PLG_SVG_NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (css) e.style.cssText = css;
    return e;
}
function plgVarNum(b, name) {
    const d = b && b.scope && b.scope.vars.get(name);
    const v = Number(d && d.value);
    return Number.isFinite(v) ? v : null;
}
// 世界坐标 → 屏幕像素（client 坐标）。相机后方返回 null，避免透视投影翻转成假点
function plgProjectWorld(p) {
    const cs = p.clone().applyMatrix4(camera.matrixWorldInverse);
    if (!(cs.z < -0.01)) return null;
    const v = p.clone().project(camera);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return null;
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
}
function plgNormAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}
function plgHideOverlay() { if (plgOverlayEl) plgOverlayEl.style.display = 'none'; }

function plgEnsureOverlay() {
    if (plgOverlayEl) return plgOverlayEl;
    const wrap = document.createElement('div');
    wrap.id = 'plgGizmoOverlay';
    // 画布之上（#canvas-container z=1）、面板之下（.data-panel z=15）
    wrap.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:6;pointer-events:none;display:none;';
    const svg = _plgNode('svg', { width: '100%', height: '100%' }, 'display:block;overflow:visible;pointer-events:none;');
    wrap.appendChild(svg);
    document.body.appendChild(wrap);
    plgOverlayEl = wrap;
    const hitCss = 'pointer-events:stroke;cursor:grab;touch-action:none;';
    const dotCss = 'pointer-events:all;cursor:grab;touch-action:none;';
    const bindDrag = (el, kind) => {
        el.setAttribute('data-plg', kind);
        el.addEventListener('pointerdown', plgOverlayDown);
        el.addEventListener('pointermove', ev => {
            if (plgDrag) { plgOverlayMove(ev); return; }
            // 悬停同样按几何判定：几个命中元素互相重叠，用元素自身归属会让标注亮错手柄
            if (!plgGizmoRefs) return;
            plgSetHover(plgResolveKind(ev.clientX, ev.clientY, plgGizmoRefs.screen) || kind);
        });
        el.addEventListener('pointerup', plgOverlayUp);
        el.addEventListener('pointercancel', plgOverlayUp);
        el.addEventListener('pointerleave', () => plgSetHover(null));
    };

    // ---- 夹角：模拟器旋转环同款「环带」观感（外圈淡色带 + 内圈实线）+ 弧中点的菱形抓手 ----
    const angG = _plgNode('g', {}, 'filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));');
    const arcBand = _plgNode('path', { fill: 'none', stroke: PLG_COLOR.ang, 'stroke-opacity': 0.16, 'stroke-width': 10, 'stroke-linecap': 'round' });
    const arcPad = _plgNode('path', { fill: 'none', stroke: PLG_COLOR.ang, 'stroke-opacity': 0.45, 'stroke-width': 2.4, 'stroke-dasharray': '5 5', 'stroke-linecap': 'round' });
    const arc = _plgNode('path', { fill: 'none', stroke: PLG_COLOR.ang, 'stroke-width': 3, 'stroke-linecap': 'round' });
    const grip = _plgNode('polygon', { fill: PLG_COLOR.ang });
    [arcBand, arcPad, arc, grip].forEach(e => {
        e.setAttribute('pointer-events', 'none');
        angG.appendChild(e);
    });
    svg.appendChild(angG);
    const arcHit = _plgNode('path', { fill: 'none', stroke: '#000', 'stroke-opacity': '0.001', 'stroke-width': 46, 'stroke-linecap': 'round' }, hitCss);
    const gripHit = _plgNode('circle', { r: 24, fill: '#000', 'fill-opacity': '0.001' }, dotCss);

    // ---- 两条边：模拟器同款箭头（3.2px 杆 + 15×17px 锥头），命中带宽 48px ----
    const mkEdge = (key) => {
        const g = _plgNode('g', {}, 'filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));');
        const shaft = _plgNode('line', { stroke: PLG_COLOR[key], 'stroke-width': 3.2 });
        const head = _plgNode('polygon', { fill: PLG_COLOR[key] });
        const label = _plgNode('text', {
            'font-size': 14, 'font-weight': 600, fill: PLG_COLOR[key], stroke: 'rgba(0,0,0,.6)',
            'stroke-width': 3, 'paint-order': 'stroke', 'text-anchor': 'middle', display: 'none'
        });
        const lineHit = _plgNode('line', { stroke: '#000', 'stroke-opacity': '0.001', 'stroke-width': 48, 'stroke-linecap': 'round' }, hitCss);
        [shaft, head, label].forEach(e => {
            e.setAttribute('pointer-events', 'none');
            g.appendChild(e);
        });
        svg.appendChild(g);
        bindDrag(lineHit, key);
        return { lineHit, shaft, head, label };
    };
    const a = mkEdge('a'), b = mkEdge('b');
    // ---- 命中层（追加在可视层之上）；重叠时由 plgResolveKind 按几何距离判定归属 ----
    const hitLayer = _plgNode('g');
    [arcHit, gripHit, a.lineHit, b.lineHit].forEach(e => hitLayer.appendChild(e));
    svg.appendChild(hitLayer);
    bindDrag(arcHit, 'angle');
    bindDrag(gripHit, 'angle');
    const angLabel = _plgNode('text', {
        'font-size': 14, 'font-weight': 600, fill: PLG_COLOR.ang, stroke: 'rgba(0,0,0,.6)',
        'stroke-width': 3, 'paint-order': 'stroke', 'text-anchor': 'middle', 'pointer-events': 'none', display: 'none'
    });
    angG.appendChild(angLabel);
    plgOverlayParts = { wrap, svg, angG, arcBand, arcPad, arc, grip, arcHit, gripHit, angLabel, a, b };
    // 兜底：指针捕获失败时（部分浏览器 / 触控）也能在窗口层收到 pointerup，避免拖拽卡死
    window.addEventListener('pointerup', plgOverlayUp, true);
    window.addEventListener('pointercancel', plgOverlayUp, true);
    return wrap;
}
// 悬停哪一类手柄（'a'/'b'/'angle'/null）：只用于「把参数值亮出来」和加粗笔触，不改变命中
let plgHoverKind = null;
function plgSetHover(kind) {
    if (plgHoverKind === kind) return;
    plgHoverKind = kind;
    if (plgGizmoRefs) updatePlgGizmoLive(selected());
}

// ---------- 2D 手柄拖拽 ----------
// 边长：鼠标位移沿该边的屏幕方向投影 → 除以「像素/世界单位」得到世界边长增量 → 乘参数系数。
// 夹角：鼠标绕过顶点的切向投影换算成转角 → 累加成夹角增量。口径固定为 1:1（鼠标转多少度，夹角改多少度），
//   任何视角、任何预设下都不变；方向由绘制层的 A/B 屏幕排序保证（顺时针 = 夹角增大）。
function plgOverlayDown(ev) {
    if (plgDrag) return;
    plgGripReturn = null;   // 新的一次拖拽开始：去掉上一轮的回归过渡
    const refs = plgGizmoRefs;
    // 多选时 selected() 是「选区第一块」，操刀的应是控件主人（见 makeParallelogramGizmo 注释）；
    // 撤销/重建重建了 Block 实例后 refs.block 会失效，故先校验它仍在 blocks 里。
    const b = (refs && refs.block && blocks.includes(refs.block)) ? refs.block : selected();
    if (!b || !refs || !refs.screen) return;
    const kind0 = ev.currentTarget.getAttribute('data-plg');
    if (!kind0) return;
    // 几何重判：避免「顶点附近两条边命中带重叠」时按层级误判成另一条边
    const kind = plgResolveKind(ev.clientX, ev.clientY, refs.screen) || kind0;
    ev.preventDefault(); ev.stopPropagation();
    // 抓住 Gizmo = 明确要编辑该块，与真实点击选择语义对齐（changeVar 依赖选中集合非空）
    if (!selectedBlocksSet.has(b)) selectedBlocksSet.add(b);
    controls.enabled = false;
    plgHoverKind = kind;   // 拖拽期间也亮出该手柄的参数值
    const isAng = kind === 'angle';
    const varName = isAng ? refs.preset.angVar : (kind === 'a' ? refs.varA : refs.varB);
    activePick = { type: isAng ? 'plgAngle' : 'plgEdge', varName, plgEdge: kind, _plg2d: true };
    draggingGizmo = true; dragNeedsRebuild = false; lastDragRebuild = 0;
    captureGizmoDeltaBaseline();
    resetGizmoPrecAccum();
    const angVal = Number(b.scope.vars.get(refs.preset.angVar)?.value);
    // 拖拽开始这一帧重算一次偏导：把「实际夹角对参数」的局部斜率取准（模型已摆到别的角度时，
    // 创建控件那一刻算的 factorAng 可能偏离），夹角拖拽期间这个斜率基本恒定，不必逐帧重算。
    const gains = plgCalcGains(b, refs.preset);
    // ★口径：鼠标转多少度，**显示的实际夹角**就改多少度（顺时针 = 数字变大 = 楔形张开）。
    //   不直接 1:1 写参数：旗帜预设参数是实际夹角的补角，写参数会让数字与楔形反向。
    //   参数增量 = 鼠标转角 × factorAng（factorAng = 1/(d实际夹角/d参数)，见 plgCalcGains）。
    // 参数安全域 = 0°~180°（含端点）。曾按 1°~179° 夹，理由是怕 0/180 让预设分解式出 NaN，
    // 实测三者都安全（各预设在端点用 math.clamp / max 兜住了除零，派生量全为有限值、mesh 正常），
    // 所以放开到端点 —— 用户能拖到真正的 0° 与 180°。
    // ★夹的是"落库后的值"（见下），只靠累计量夹不住：量化取整会多走半格。
    const pMin = 0, pMax = 180;
    // ★「跟手」的关键：抓手不能钉在角平分线上。
    //   实测（`_plg15`）环中点（= 角平分线）的角速度只有参数角速度的 0.14~1.03 倍，方块背面甚至反向
    //   —— 预设不同、视角不同差 7 倍，钉在平分线上的抓手永远追不上光标（用户：「比鼠标快得多/慢得多」）。
    //   所以拖动期间把抓手改成「跟随光标的旋钮」：它始终落在「顶点→光标」的半径方向上（抓在环带别处时
    //   保留按下那一刻的角度偏移），半径锁在按下时的 R ⇒ 看起来就是旋钮在环上滑、指尖按着它走。
    //   参数值仍保持 1:1（光标转过一度 = 参数一度），不因预设/视角而变；环带本身照旧表示真实楔形。
    //   同时把切向分母固定为按下时的半径 r0：否则鼠标往外飘时同样位移量出的角度变小（慢），往里飘就变大（快）。
    const S0 = refs.screen;
    // 抓手相对光标的角度偏移：抓在菱形上时 ≈0（然后它就完全跟着手指），抓在环带别处时保持该偏移，
    // 不会一点下去就跳到光标位置。
    const gripAng0 = S0 ? Math.atan2(S0.gy - S0.C.y, S0.gx - S0.C.x) : 0;
    const cursorAng0 = S0 ? Math.atan2(ev.clientY - S0.C.y, ev.clientX - S0.C.x) : 0;
    plgDrag = {
        kind, varName, lastX: ev.clientX, lastY: ev.clientY,
        // 夹角拖拽：每帧用切向投影量出鼠标转过的角度（见 plgOverlayMove），直接加到参数上。
        //   1) 累计的是「参数」增量，并夹在安全域内：到边界停住、反向立即响应，绝不折返；
        //   2) 交给 quantizeDragDelta 的始终是「本帧目标的增量」，避免量化格乒乓；
        //   3) 顶点漂移不影响转角（切向投影与圆心无关），也不会整圈回绕。
        startParam: angVal, lastTarget: angVal, accParam: 0,
        pMin, pMax,
        // ★夹角通道的换算：鼠标转过的角度 → **参数**增量。
        //   显示的是「实际夹角」（见绘制层），而预设参数与实际夹角未必 1:1（旗帜预设是互补角，
        //   参数↑ = 实际夹角↓，偏导 -1），所以乘上 plgCalcGains 求出的 factorAng（= 1/偏导）。
        //   这样每套预设里「顺时针拖 = 显示的数字变大 = 楔形张开」，与用户的直觉一致。
        angGain: Number.isFinite(gains.factorAng) ? gains.factorAng : 1,
        // 抓手跟手用的状态：半径（按下时）＋相对光标的角度偏移＋光标当前位置
        gripOff: gripAng0 - cursorAng0,
        gripR: S0 ? Math.hypot(S0.gx - S0.C.x, S0.gy - S0.C.y) : 104,
        curX: ev.clientX, curY: ev.clientY,
        r0: S0 ? Math.max(24, Math.hypot(ev.clientX - S0.C.x, ev.clientY - S0.C.y)) : 0,
        target: ev.currentTarget, pid: ev.pointerId
    };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (_) { }
}
function plgOverlayMove(ev) {
    if (!plgDrag) return;
    ev.preventDefault();
    const refs = plgGizmoRefs;
    const b = (refs && refs.block && blocks.includes(refs.block)) ? refs.block : selected();
    if (!b || !refs || !refs.screen) { plgOverlayUp(ev); return; }
    const S = refs.screen;
    const prevX = plgDrag.lastX, prevY = plgDrag.lastY;
    const dx = ev.clientX - prevX, dy = ev.clientY - prevY;
    plgDrag.lastX = ev.clientX; plgDrag.lastY = ev.clientY;
    if (plgDrag.kind === 'angle') {
        // ★用「切向投影」量鼠标转角，而不是 atan2 差：
        //   顶点会随形变漂移，若把两个鼠标点都相对「本帧顶点」求 atan2 差，漂移量会被算进转角
        //   （实测同样 15° 的手势在正视下只量出 1°、背视下量出 3.6° —— 灵敏度随视角乱变）；
        //   若钉死在按下瞬间的旧顶点，顶点漂到鼠标另一侧时 atan2 会整圈回绕（数值瞬间打满 179°）。
        //   切向投影只看鼠标自己走了多长、垂直于半径的分量占半径的比例，天然与顶点漂移无关，
        //   小步长下就是精确转角，也不会回绕。
        const Cx = S.C.x, Cy = S.C.y;
        const rNow = Math.hypot(ev.clientX - Cx, ev.clientY - Cy);
        // 太靠近顶点时半径太小、切向没有定义（角度会在 0 附近乱跳），跳过这一帧
        if (rNow > 24) {
            const mxm = (ev.clientX + prevX) * 0.5, mym = (ev.clientY + prevY) * 0.5;
            const ux = (mxm - Cx) / rNow, uy = (mym - Cy) / rNow;
            // 屏幕 y 向下：顺时针 = 切向 (-uy, ux) 为正
            // ★分母用按下时的固定半径 r0（不用 rNow）：鼠标沿直线拖动时离顶点会越来越远，
            //   同样 10px 位移量出的角度就越来越小（越拖越慢）；离得近了又反过来变快。r0 固定后全程恒定。
            const dPsi = (dx * -uy + dy * ux) / plgDrag.r0;
            if (Math.abs(dPsi) > 1e-5) {
                // 鼠标转角 → 参数增量（换算见 plgDrag.angGain）；标志位/预设不同，倍率与符号都不同。
                const dAngDeg = THREE.MathUtils.radToDeg(dPsi) * plgDrag.angGain;
                // 抓手跟手：只记光标位置，角度留到绘制层按「本帧顶点」现算（见 updatePlgGizmoLive）。
                // 这里若用本帧顶点算好角度，绘制时顶点又漂了一次，抓手会比光标慢 2~3°（实测）。
                plgDrag.curX = ev.clientX; plgDrag.curY = ev.clientY;
                // 累计参数增量并夹在安全域内（参数域 = 0~180，与显示的实际夹角 0~180 一一对应）
                plgDrag.accParam = Math.min(Math.max(plgDrag.accParam + dAngDeg, plgDrag.pMin - plgDrag.startParam), plgDrag.pMax - plgDrag.startParam);
                const targetParam = plgDrag.startParam + plgDrag.accParam;
                // 交给 quantizeDragDelta 的必须是「本帧目标的增量」：它内部自带跨帧累积+取整。
                // 传「目标与已写的差」会被二次累积，目标卡在量化格中间时 132/133 反复跳（实测乒乓）。
                const dTarget = targetParam - plgDrag.lastTarget;
                plgDrag.lastTarget = targetParam;
                const dParamRaw = quantizeDragDelta(dTarget);
                // ★夹的是「落库后的值」而不是只夹累计量：量化取整会多走半格（step=1 时能停到 180 之外），
                //   单靠 accParam 夹不住，越界后预设的三角分解会回绕。
                const curAng = plgVarNum(b, plgDrag.varName);
                const dParam = curAng == null ? dParamRaw
                    : Math.min(Math.max(dParamRaw, plgDrag.pMin - curAng), plgDrag.pMax - curAng);
                // 多选：别的预设块用同一增量，各自再按自身当前值夹一次（见 plgWriteParamDeltaMulti）
                if (Math.abs(dParam) > 1e-9) plgWriteParamDeltaMulti('angle', dParam);
            }
        }
    } else {
        const edgeA = plgDrag.kind !== 'b';
        const ux = edgeA ? S.uxA : S.uxB, uy = edgeA ? S.uyA : S.uyB;
        const ppw = edgeA ? S.pxPerWorldA : S.pxPerWorldB;
        const f = edgeA ? refs.factorA : refs.factorB;
        if (ppw > 1e-6) {
            const dParam = quantizeDragDelta((dx * ux + dy * uy) / ppw * f);
            // 多选：同一增量写进选区里所有预设块（见 plgWriteParamDeltaMulti）
            if (Math.abs(dParam) > 1e-9) plgWriteParamDeltaMulti(edgeA ? 'a' : 'b', dParam);
        }
    }
    updatePlgGizmoLive(b);
    updateInspectorValues();
    updateGizmoDeltaHud(ev.clientX, ev.clientY);
}
function plgOverlayUp(ev) {
    if (!plgDrag) return;
    const d = plgDrag; plgDrag = null;
    // 夹角拖拽松手：抓手从指尖的方向平滑滑回环中点（绘制层做插值），避免 20~70° 的瞬移。
    // 半径在绘制层用 R，即目标位置就是「环中点 + 环半径」，不会径向跳。
    if (d.kind === 'angle' && d.curX != null && plgGizmoRefs && plgGizmoRefs.screen) {
        const S = plgGizmoRefs.screen;
        plgGripReturn = { from: Math.atan2(d.curY - S.C.y, d.curX - S.C.x) + d.gripOff, t0: performance.now() };
    }
    try { if (d.pid != null) d.target.releasePointerCapture(d.pid); } catch (_) { }
    if (ev) { try { ev.preventDefault(); } catch (_) { } }
    // 收尾复用 3D 手柄的同一套流程：记撤销点、刷新面板/关键帧、隐藏增量 HUD
    endGizmoDrag({ preventDefault() { }, pointerId: null });
}

// 按几何关系判定「这次按下抓的是哪个手柄」，不依赖 SVG 层级：
// 相邻两条边在公共顶点附近会互相重叠（夹角 47° 时离顶点 13px 处的点距另一条边只有 9.6px），
// 靠 z-order 决定主人必然误判 —— 所以统一按「离哪个手柄更近」来判，优先级：菱形抓手 → 边 → 环。
// 边必须压在环之前：环的两端正好落在两条边的方向上，否则箭头端头永远点不到。
// 边箭头的长度跟随该边的屏幕投影长度（模型拉长 → 控制轴同步变长），但保底 96px，小模型也够点；
// 命中跨度因此按边分别存（spanA/spanB），环半径同理随模型放大但有下限。
const PLG_EDGE_FROM = 8, PLG_EDGE_MIN = 116, PLG_RING_R = 104, PLG_RING_MAX = 220;
function plgResolveKind(x, y, S) {
    if (!S) return null;
    // 菱形抓手：小目标，永远优先（它就是专门给角度准备的）
    if (S.gx != null && Math.hypot(x - S.gx, y - S.gy) <= 22) return 'angle';
    const dx = x - S.C.x, dy = y - S.C.y;
    // 边：只在「这根箭头自己的跨度内」比较垂距 —— 环中段常落在边的延长线附近，
    // 若不限制跨度，环会被判成边。
    const projA = dx * S.uxA + dy * S.uyA, projB = dx * S.uxB + dy * S.uyB;
    const inA = projA > PLG_EDGE_FROM && projA < (S.spanA || PLG_EDGE_MIN);
    const inB = projB > PLG_EDGE_FROM && projB < (S.spanB || PLG_EDGE_MIN);
    const dA = inA ? Math.abs(dx * -S.uyA + dy * S.uxA) : 1e9;
    const dB = inB ? Math.abs(dx * -S.uyB + dy * S.uxB) : 1e9;
    if (dA <= 14 || dB <= 14) return dA <= dB ? 'a' : 'b';
    // 环：径向距离 + 角向落在环的跨度内
    const distC = Math.hypot(dx, dy);
    if (S.R && Math.abs(distC - S.R) <= 22 && S.arcHalf != null) {
        const rel = plgNormAngle(Math.atan2(dy, dx) - S.arcMid);
        if (Math.abs(rel) <= S.arcHalf + 0.09) return 'angle';
    }
    return null;
}

function makeParallelogramGizmo(b, preset) {
    const root = new THREE.Group();   // 占位容器：真正的控件画在屏幕空间 SVG 上（plgEnsureOverlay）
    // 先把「哪条边跟哪个参数最跟手」算出来：预设的边/参数并非固定一一对应
    // （方块侧面 l1 会同时拉动 X 与 Z 两条棱），所以绑定时按当前姿态的实际偏导决定。
    const gains = plgCalcGains(b, preset);
    plgGizmoRefs = {
        preset, group: root,
        cornerWorld: new THREE.Vector3(),
        dirA: new THREE.Vector3(1, 0, 0), dirB: new THREE.Vector3(0, 0, 1),
        angleDeg: 90, angleRad: Math.PI / 2, screen: null,
        // ★控件的主人：多选时 selected() 只返回「选区第一块」，不一定就是这块预设块。
        //   绘制/拖拽一律以 refs.block 为准（见 updatePlgGizmoLive / plgOverlayDown），
        //   否则先点普通方块、再 Ctrl 追加预设块时，控件会按普通方块算而整体隐藏
        //   —— 用户报的「多选时没办法使用两边一角控件」。
        block: b,
        ...gains,
        // 参数绑定（A←aVar / B←bVar 由 plgCalcGains 按实际偏导求出）：A/B 不再按屏幕角向交换，
        // 这两份就是箭头的最终归属，永远与 dirA / dirB 对应。
        baseVarA: gains.varA, baseVarB: gains.varB,
        baseFactorA: gains.factorA, baseFactorB: gains.factorB
    };
    plgEnsureOverlay();
    updatePlgGizmoLive(b);
    return root;
}

// 每帧把「公共顶点 / 两条边 / 夹角」投影到屏幕并重排 2D 控件。
// 边长、夹角、姿态、平移任意变量变化都会实时贴合；预设退化（NaN / 投影到相机后方）时整体隐藏。
function updatePlgGizmoLive(b) {
    const refs = plgGizmoRefs;
    // 以控件主人为准（多选时传入/默认的 selected() 可能是另一块方块，见 makeParallelogramGizmo 注释）
    b = (refs && refs.block && blocks.includes(refs.block)) ? refs.block : (b || selected());
    if (!refs || !b) { plgHideOverlay(); if (refs) refs.screen = null; return; }
    const hide = () => { plgHideOverlay(); refs.screen = null; };
    const m = plgMeasure(b.scope.vars, refs.preset);
    if (!m) { hide(); return; }
    const C = plgProjectWorld(m.c);
    const A = plgProjectWorld(m.c.clone().addScaledVector(m.dirA, m.lenA));
    const B = plgProjectWorld(m.c.clone().addScaledVector(m.dirB, m.lenB));
    if (!C || !A || !B) { hide(); return; }
    const ax = A.x - C.x, ay = A.y - C.y, la = Math.hypot(ax, ay);
    const bx = B.x - C.x, by = B.y - C.y, lb = Math.hypot(bx, by);
    if (!(la > 2) || !(lb > 2)) { hide(); return; }   // 边几乎正对相机（投影成点）时无方向可言
    const uxA_ = ax / la, uyA_ = ay / la, uxB_ = bx / lb, uyB_ = by / lb;
    const aA = Math.atan2(ay, ax), aB = Math.atan2(by, bx);
    // ★A/B 只跟「参数绑定」走，不按屏幕角向重排（2026-10-26 v14）。
    //   旧实现把 A 钉成「屏幕角度较小」的那条边（B 在它的顺时针侧），于是同一个参数在不同预设、
    //   不同朝向下会挂到另一根箭头上：实测 2D 平面 A=side_b、旗帜 A=side_a，改夹角时
    //   2D 平面转动的是橙色 B、旗帜转动的是青色 A —— 用户看到的就是「两套预设的 AB 边不一样」。
    //   现在 A 恒为预设 uAxis 那条边、B 恒为 vAxis（各绑 plgCalcGains 求出的、真正驱动它的参数），
    //   与摄像机、方块朝向都无关。于是两套 side_a/side_b 预设（2D 平面 / 旗帜）里 A 都是
    //   「改夹角时不动的那条」、B 都是「跟着角度转的那条」；方块侧面（l1/l2）相反 —— 它的 l1
    //   恰好就是随 xita 转动的那条棱，属于该预设自身的参数语义，不强行对调。
    //   按屏幕角向排序原本只是为了 dPhi>0；改用带符号的 rawD 定弧中点后不需要交换了。
    const rawD = plgNormAngle(aB - aA);
    const dPhi = Math.abs(rawD);
    const a0 = aA;                  // 弧的起点角 = A 边（恒定）
    const uxA = uxA_, uyA = uyA_, uxB = uxB_, uyB = uyB_;
    const laS = la, lbS = lb, ppwA = la / m.lenA, ppwB = lb / m.lenB;
    const varAS = refs.baseVarA || refs.varA, varBS = refs.baseVarB || refs.varB;
    const facA = refs.baseFactorA || refs.factorA, facB = refs.baseFactorB || refs.factorB;
    plgEnsureOverlay();
    const P = plgOverlayParts;

    refs.cornerWorld.copy(m.c);
    refs.dirA.copy(m.dirA); refs.dirB.copy(m.dirB);
    refs.angleRad = m.angleRad; refs.angleDeg = THREE.MathUtils.radToDeg(m.angleRad);
    refs.varA = varAS; refs.varB = varBS; refs.factorA = facA; refs.factorB = facB;
    // 箭头长度 = 该边屏幕投影长度（保底 96px）；命中跨度把它整个盖住
    const arrowLen = (len) => Math.max(96, len);
    const spanA = Math.max(PLG_EDGE_MIN, arrowLen(laS) + 20);
    const spanB = Math.max(PLG_EDGE_MIN, arrowLen(lbS) + 20);
    refs.screen = { C, uxA, uyA, uxB, uyB, la: laS, lb: lbS, phi: dPhi, pxPerWorldA: ppwA, pxPerWorldB: ppwB, spanA, spanB };

    const put = (el, attrs) => { for (const k in attrs) el.setAttribute(k, attrs[k]); };
    // 参数值默认不显示（常驻文字在工作面上又乱又挡模型），只在「悬停该手柄 / 正在拖它」时亮出来。
    const activeKind = plgDrag ? plgDrag.kind : null;
    const showLabel = (k) => activeKind === k || plgHoverKind === k;
    const Cen = plgProjectWorld(m.c.clone().addScaledVector(m.dirA, m.lenA * 0.5).addScaledVector(m.dirB, m.lenB * 0.5));
    // 边箭头：长度跟随这条边的屏幕投影（模型拉长 → 控制轴同步变长），保底 96px ——
    // 小模型照样够点（此时箭头会伸出模型之外），大模型也不会把长边缩成一小截。
    // 可拖区域覆盖整根箭头（含伸出模型的部分）。
    const ARROW_FROM = 14, HEAD_LEN = 17, HEAD_HALF = 7.5;
    // 边长标注的小数位：跟随精度档（Shift+Ctrl 步长 0.001 → 3 位），保底 2 位。
    // 写死 2 位时，高精度档拖出的 0.001 级变化全被 toFixed(2) 吃掉 ⇒ 边拖了、数字不动
    // （与 v12 夹角标注同类问题，见 angDec）。
    const lenDec = Math.max(2, gizmoPrecDecimals(gizmoPrecisionStep()));
    const drawEdge = (e, key, ux, uy, realLen) => {
        const hot = showLabel(key);
        const s1 = arrowLen(realLen);
        const x0 = C.x + ux * ARROW_FROM, y0 = C.y + uy * ARROW_FROM;
        const x1 = C.x + ux * s1, y1 = C.y + uy * s1;
        // 锥头：宽 15px、长 17px（与 makeArrow 的 cone 同比例）
        const qx = -uy * HEAD_HALF, qy = ux * HEAD_HALF;
        put(e.shaft, { x1: x0.toFixed(1), y1: y0.toFixed(1), x2: (x1 - ux * 3).toFixed(1), y2: (y1 - uy * 3).toFixed(1), 'stroke-width': hot ? 4.4 : 3.2 });
        put(e.head, {
            points: [x1 + ux * HEAD_LEN, y1 + uy * HEAD_LEN, x1 + qx, y1 + qy, x1 - qx, y1 - qy].map(n => n.toFixed(1)).join(' ')
        });
        put(e.lineHit, {
            x1: (C.x + ux * PLG_EDGE_FROM).toFixed(1), y1: (C.y + uy * PLG_EDGE_FROM).toFixed(1),
            x2: (x1 + ux * HEAD_LEN).toFixed(1), y2: (y1 + uy * HEAD_LEN).toFixed(1)
        });
        // 标注贴在箭头中段、沿边的垂向外侧（朝向图形外），悬停时才出现
        const lx = (x0 + x1) * 0.5, ly = (y0 + y1) * 0.5;
        let px = -uy, py = ux;
        if (Cen && ((lx + px) - Cen.x) * px + ((ly + py) - Cen.y) * py < 0) { px = -px; py = -py; }
        put(e.label, { x: (lx + px * 19).toFixed(1), y: (ly + py * 19 + 5).toFixed(1), display: hot ? 'inline' : 'none' });
        const vn = key === 'a' ? refs.varA : refs.varB;
        // 直接用 lenDec：不做 fmtVal 的「|v|≥100 减一位」，否则长边在高精度档又被截掉有效位
        const lv = plgVarNum(b, vn);
        e.label.textContent = shortName(vn) + ' ' + (lv == null ? '?' : lv.toFixed(lenDec));
    };
    const shortName = (n) => String(n).replace(/^v\./, '');
    drawEdge(P.a, 'a', uxA, uyA, laS);
    drawEdge(P.b, 'b', uxB, uyB, lbS);

    // 夹角：环带半径跟随较短边的屏幕投影（保底 104px、上限 220px）——
    // 模型拉长时角和环也同步放大，不会被两条长箭头衬得像个小玩具
    const R = Math.min(Math.max(Math.min(laS, lbS) * 0.78, PLG_RING_R), PLG_RING_MAX);
    const angHot = showLabel('angle');
    // 楔形很窄（两条边几乎重合）时，环挤在两条箭头之间既看不清也难点 —— 把它**挪到外侧**，
    // 那里是空白区，抓手点得开。★但不能用布尔阈值硬切（`narrow ? +π : 0`）：夹角一跨过阈值，
    // 弧心瞬间跳 180°，还会在阈值附近逐帧来回切（小角度颤抖的另一半原因）。
    // 用连续插值：|dPhi| 从 26° 收到 0° 时，弧心从分角线平滑滑到对侧，不存在跳变点。
    const blend = THREE.MathUtils.clamp((0.45 - Math.abs(dPhi)) / 0.45, 0, 1);
    // ★用带符号的 rawD 定弧中点（不是 dPhi/2）：A/B 不再按屏幕排序，rawD 可能为负，
    //   取 aA + rawD/2 后弧带 [arcMid-arcHalf, arcMid+arcHalf] 仍正好落在两条边之间
    //   （|rawD|<π 时 arcD 从 arcMid-h 到 arcMid+h 覆盖的就是 [aA, aB]，与方向无关）。
    const arcMid = a0 + rawD * 0.5 + blend * Math.PI;
    const arcHalf = Math.abs(dPhi) * 0.5;
    const toPt = (ang) => ({ x: C.x + Math.cos(ang) * R, y: C.y + Math.sin(ang) * R });
    const arcD = (h) => {
        const p0 = toPt(arcMid - h), p1 = toPt(arcMid + h);
        return `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 ${1} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    };
    // 可视夹角小于 24° 时补足到 12° 半幅（补出来的一段用虚线提示「实际夹角更小」）；
    // 挪到外侧时固定半幅 19.5°，让外侧那也是「一个能点到的弧」而不是一小段头。
    const minHalf = 0.2094;   // 12°
    const showHalf = Math.max(arcHalf, minHalf) * (1 - blend) + 0.34 * blend;
    // 环带：外圈淡色带负责「一眼看出这是角度环」，内圈实线负责精确指向
    put(P.arcBand, {
        d: arcD(showHalf),
        'stroke-opacity': angHot ? 0.3 : 0.16
    });
    put(P.arc, {
        d: arcD(showHalf),
        'stroke-width': angHot ? 4 : 3, 'stroke-opacity': angHot ? 1 : 0.92
    });
    put(P.arcPad, {
        d: arcD(showHalf),
        display: showHalf > arcHalf + 1e-3 ? 'inline' : 'none'
    });
    put(P.arcHit, { d: arcD(showHalf) });
    // 抓手骑在环中点：菱形比环线更粗，明确是「可拖的旋钮」
    // ★拖动期间不钉在平分线，而是跟着光标转（见 plgOverlayDown 注释）；半径用按下时的 gripR，
    //   免得环半径随形变缩放时抓手在径向跳动。松手后由 plgGripReturn 把它滑回环中点。
    let dragAng = null;
    if (plgDrag && plgDrag.kind === 'angle' && plgDrag.curX != null) {
        dragAng = Math.atan2(plgDrag.curY - C.y, plgDrag.curX - C.x) + plgDrag.gripOff;
    } else if (plgGripReturn) {
        const k = Math.min(1, (performance.now() - plgGripReturn.t0) / 180);
        if (k >= 1) plgGripReturn = null;
        else dragAng = plgGripReturn.from + plgNormAngle(arcMid - plgGripReturn.from) * (1 - (1 - k) ** 3);
    }
    const gAng = dragAng == null ? arcMid : dragAng;
    const gRad = (dragAng != null && plgDrag && plgDrag.kind === 'angle') ? plgDrag.gripR : R;
    const gx = C.x + Math.cos(gAng) * gRad, gy = C.y + Math.sin(gAng) * gRad;
    const gs = angHot ? 12 : 10;
    put(P.grip, { points: `${gx.toFixed(1)},${(gy - gs).toFixed(1)} ${(gx + gs).toFixed(1)},${gy.toFixed(1)} ${gx.toFixed(1)},${(gy + gs).toFixed(1)} ${(gx - gs).toFixed(1)},${gy.toFixed(1)}` });
    put(P.gripHit, { cx: gx.toFixed(1), cy: gy.toFixed(1) });
    put(P.angLabel, {
        x: (gx + Math.cos(gAng) * 30).toFixed(1), y: (gy + Math.sin(gAng) * 30 + 5).toFixed(1),
        display: angHot ? 'inline' : 'none'
    });
    // 标注显示 **A/B 两条边实际所夹的角**（`refs.angleDeg`，由 plgMeasure 直接量出来），
    // 不是预设参数的补角 —— 旗帜预设内部按互补角（`sin(v.angle-180)`）建形，直接显示参数会
    // 出现「楔形看着 120°、数字写 60°」的错位（用户：「显示的角度要等于 ab 边实际所夹的角，而不是补角」）。
    // 小数位跟随当前精度档：写死 1 位时，Shift+Ctrl（步长 0.001）拖出的变化全被抹成同一个数字，
    // 看起来像「夹角不显示数据」；fmtVal 还会在 |v|≥100 时再减一位，这里直接用档位小数位。
    const angDec = Math.max(1, gizmoPrecDecimals(gizmoPrecisionStep()));
    const angNum = Number.isFinite(refs.angleDeg) ? refs.angleDeg : null;
    P.angLabel.textContent = (angNum == null ? '?' : angNum.toFixed(angDec)) + '°';
    // 供命中判定用
    Object.assign(refs.screen, { R, arcMid, arcHalf: showHalf, gx, gy, blend });
    plgOverlayEl.style.display = 'block';
}

// 多选批量：同一次拖拽把同一个增量写到**选区里所有「两边一角」方块**上（用户预期「多选 = 一起改」）。
// 参数名按每块自己的预设取（v16 前的老块仍是 l1/l2/xita）；增量只量化一次、整份复用。
// 夹角按每块自己的当前值再夹一次 0~180，避免某块已贴端点时被推出去。
// ★边 A/B 绑哪个参数不能直接读 preset.aVar/bVar：plgCalcGains 会按实测耦合强度**对调**
//   （旗帜预设就是 A←side_b、B←side_a）。v19 首版错用了 preset.aVar，于是多选时拖边 A，
//   被写的却是另一条边的参数 —— 用户看到「变长的是对边、被拖的那条不动」。
//   改为「每块按自己的 gains 解析」，并按 block.id 缓存（gains 要跑多次有限差分，不能每帧重算）。
function plgEdgeVarsFor(b, preset) {
    let e = plgDrag && plgDrag.edgeVars && plgDrag.edgeVars.get(b.id);
    if (!e) {
        const g = plgCalcGains(b, preset);
        e = { a: g.varA, b: g.varB };
        if (plgDrag) { if (!plgDrag.edgeVars) plgDrag.edgeVars = new Map(); plgDrag.edgeVars.set(b.id, e); }
    }
    return e;
}
function plgWriteParamDeltaMulti(kind, delta) {
    const refs = plgGizmoRefs;
    const owner = refs && refs.block;
    let any = false;
    const write = (b, preset) => {
        const ev = plgEdgeVarsFor(b, preset);
        const vn = kind === 'angle' ? preset.angVar : (kind === 'a' ? ev.a : ev.b);
        let d = delta;
        if (kind === 'angle') {
            const cur = plgVarNum(b, vn);
            if (cur != null) d = Math.min(Math.max(d, -cur), 180 - cur);
        }
        if (Math.abs(d) > 1e-9) plgWriteParamDelta(b, vn, d);
    };
    for (const x of selectedBlocksSet) {
        const p = plgDetectPreset(x);
        if (!p) continue;
        any = true; write(x, p);
    }
    // 选区里一块预设块都没有时退回单块（正常不会走到：控件存在就说明选区里至少有一块）
    if (!any && owner && refs.preset) write(owner, refs.preset);
}

// 把「两边一角」参数的增量写到方块上（关键帧 / molang / 普通变量三条通道与面板改值同一条）
function plgWriteParamDelta(b, varName, delta) {
    if (!b || !b.scope || !Number.isFinite(delta) || Math.abs(delta) < 1e-9) return;
    let def = b.scope.vars.get(varName);
    if (!def) return;
    if (gizmoMolangGuard(b, varName)) return;
    if (hasKeyframeAnimation(b.id)) {
        // 与 applyBatchDelta 同口径：基准值取吸附后的帧值，写入走 kfGizmoWriteVar（自动建/改当前帧）
        const bt = kfEditFrameTime(b.id, keyframeCurrentTime);
        const curKf = kfValueAt(b, bt !== null ? bt : kfResolveFrameTime(b.id, keyframeCurrentTime), String(varName).replace(/^v\./, ''));
        const base = Number.isFinite(Number(curKf)) ? Number(curKf) : (Number(def.value) || 0);
        kfGizmoWriteVar(b, varName, base + delta);
        b.mesh.updateMatrixWorld(true);
        return;
    }
    if (!b.scope.molangMode && !isConstantExpr(def.expr)) {
        // 参数被用户改成了表达式：保持表达式形态只追加增量（与面板批量改值同口径），
        // 否则 setConstVarValue 会把表达式整行抹成常量。
        def.expr = `(${def.expr}) ${delta >= 0 ? '+' : '-'} ${Math.abs(delta)}`;
        def.value = evaluateExpression(def.expr, b.scope.vars, globalVars, b.scope.blockId);
    } else {
        // molang 预设由 setConstVarValue 走 molangWriteBack 烘焙回程序常量行
        setConstVarValue(b, varName, (Number(def.value) || 0) + delta);
    }
    b.refresh();
    b.mesh.updateMatrixWorld(true);
    syncKeyframeFromBlock(b);
    try { kfSchedulePanelRefresh(90); } catch (e) { }
}

// ---------- 包装器 ----------
function makeAt(offset, child, opts = {}) {
    const g = new THREE.Group();
    g.position.copy(offset);
    g.userData.herMoveWrapper = opts.moveWrapper || '';
    if (opts.quaternion) g.quaternion.copy(opts.quaternion);
    g.add(child);
    if (g.userData.herMoveWrapper) gizmoArrowGroups.push(g);
    return g;
}

// ========== 新Gizmo系统占位 ==========
// 完整实现将在此处替换
