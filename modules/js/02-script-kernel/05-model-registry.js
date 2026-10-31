/* 02-script-kernel/05-model-registry.js · 源 测试版v.6b79.html 第 9944-10234 行 */
'use strict';
// ============================================================================
// 模型注册表 MODEL_REGISTRY —— 模块化几何体工厂
// ----------------------------------------------------------------------------
// 注册格式说明:
//   模型名称: { cubes: [ cubeDef, cubeDef, ... ] }
//
// cubeDef 字段:
//   v  : 8个顶点坐标数组，按 (x,y,z) 字典序从小到大排列:
//        0:(xmin,ymin,zmin) 1:(xmin,ymin,zmax) 2:(xmin,ymax,zmin) 3:(xmin,ymax,zmax)
//        4:(xmax,ymin,zmin) 5:(xmax,ymin,zmax) 6:(xmax,ymax,zmin) 7:(xmax,ymax,zmax)
//   m  : 材质权限。true(默认,可省略)=允许贴图; false=不允许贴图(如旗杆)，须指定c
//   c  : 颜色(仅当 m:false 时需要，指定该cube的固定颜色)
//   uv : UV投影方式。'auto'(默认)=按面法线自动投影(适合轴对齐立方体);
//        {face: N}=以第N面作为正投影方向(适合倾斜立方体如旗帜旗面)
//        面索引: 0=底(Y-) 1=顶(Y+) 2=左(X-) 3=右(X+) 4=前(Z-) 5=后(Z+)
//        {face: N, rot: R}=在face投影基础上顺时针旋转UV，R可选0/90/180/270
//        {face: N, edge: true}=沿边继承，相邻面显示主面边缘像素延伸(需配合ClampToEdge纹理)
//        支持未来扩展: {faces: [tex0,...tex5]} 六面分别使用不同贴图
// ============================================================================
const MODEL_REGISTRY = {
    // 立方体: 单位立方体（可用全部“可用类别”贴图）
    cube: {
        materialCategories: ['color', 'ore', 'redstone', 'nether', 'nature', 'func', 'wood', 'stone', 'misc'],
        extraCats: ['custom'],   // 接受本地上传的图片
        cubes: [{
            v: [[-0.5,-0.5,-0.5], [-0.5,-0.5,0.5], [-0.5,0.5,-0.5], [-0.5,0.5,0.5],
                [ 0.5,-0.5,-0.5], [ 0.5,-0.5,0.5], [ 0.5,0.5,-0.5], [ 0.5,0.5,0.5]]
        }]
    },
    // 半砖(台阶): 仅允许 石质 / 木质 建材贴图
    halfbrick: {
        materialCategories: ['stone', 'wood'],
        extraCats: ['custom'],   // 接受本地上传的图片
        cubes: [{
            v: [[-0.5,-0.25,-0.5], [-0.5,-0.25,0.5], [-0.5,0.25,-0.5], [-0.5,0.25,0.5],
                [ 0.5,-0.25,-0.5], [ 0.5,-0.25,0.5], [ 0.5,0.25,-0.5], [ 0.5,0.25,0.5]]
        }]
    },
    // 楼梯: 底座 + 顶部台阶，仅允许 石质 / 木质 建材贴图
    stair: {
        materialCategories: ['stone', 'wood'],
        extraCats: ['custom'],   // 接受本地上传的图片
        cubes: [
            { v: [[-0.5,-0.5,-0.5], [-0.5,-0.5,0.5], [-0.5,0,-0.5], [-0.5,0,0.5],
                  [ 0.5,-0.5,-0.5], [ 0.5,-0.5,0.5], [ 0.5,0,-0.5], [ 0.5,0,0.5]] },
            { v: [[0,0,-0.5], [0,0,0.5], [0,0.5,-0.5], [0,0.5,0.5],
                  [0.5,0,-0.5], [0.5,0,0.5], [0.5,0.5,-0.5], [0.5,0.5,0.5]] }
        ]
    },
    // 旗帜: 仅允许本地上传图片作为贴图（materialCategories 为空 = 不走贴图库）
    flag: {
        materialCategories: [],   // 不走贴图库（仅本地上传/织布机）
        extraCats: ['banner', 'custom'],   // 仅接受织布机生成的旗帜 与 本地上传图片
        cubes: [
            { // 旗杆竖直段: 不允许贴图，固定棕色
                v: [[0.128575,0.23571425,-1.553565], [0.128575,0.23571425,0.5464255],
                    [0.128575,0.33571425,-1.553565], [0.128575,0.33571425,0.5464255],
                    [0.228575,0.23571425,-1.553565], [0.228575,0.23571425,0.5464255],
                    [0.228575,0.33571425,-1.553565], [0.228575,0.33571425,0.5464255]],
                m: false, c: 0x8B4513
            },
            { // 旗杆水平段: 不允许贴图，固定棕色
                v: [[-0.321428,0.23571425,-1.653565], [-0.321428,0.23571425,-1.553565],
                    [-0.321428,0.33571425,-1.653565], [-0.321428,0.33571425,-1.553565],
                    [0.678575,0.23571425,-1.653565], [0.678575,0.23571425,-1.553565],
                    [0.678575,0.33571425,-1.653565], [0.678575,0.33571425,-1.553565]],
                m: false, c: 0x8B4513
            },
            { // 旗面当前使用的是2026年5月的第二次测量数据，和旗杆精度不一样，但是作者没有很在意旗杆，所以你不要觉得位数不一样很奇怪: 倾斜薄板，允许贴图，以顶面(Y+)投影+沿边继承
                // 主面=顶面(Face1)正常显示贴图，相邻4面显示边缘像素延伸
                // 顶点为高精度数据（与原值一一对应，差值最小匹配替换）
                v: [[-0.3213778076,0.1856572144,-1.6574460938], [-0.3213786621,0.1072717285,0.3410104248],
                    [-0.3213777832,0.235752613,-1.6554835938], [-0.3213788574,0.1572331543,0.3429733398],
                    [0.6786216797,0.1857910400,-1.6574457031], [0.6786207031,0.1072715454,0.3410110596],
                    [0.6786218750,0.2357523926,-1.6554828125], [0.6786208496,0.1572329102,0.3429737549]],
                uv: { face: 0, rot: 270, edge: true }
            }
        ]
    },
    // 掉落物：地面平躺的 sprite —— 几何由物品贴图像素动态生成（每个不透明像素一根体素柱），
    // 因此不声明静态 cubes；渲染路径见 Block.createMesh 的 isDropItem 分支。
    dropitem: {
        materialCategories: [],   // 不走贴图库
        extraCats: ['custom'],    // 仅接受本地上传的物品贴图（16×16 / 32×32 均可）
        cubes: [],
        isDropItem: true
    }
};

// 顶点排序后的6面定义(按 xyz 字典序排列的顶点索引)
// 面索引: 0=底(Y-) 1=顶(Y+) 2=左(X-) 3=右(X+) 4=前(Z-) 5=后(Z+)
// 每个面的4个顶点按逆时针排列(从外部观察)，确保叉积法线朝外
// uv: 每面对应的固定UV映射，确保从外部看贴图方向一致(不镜像/不翻转)
//     UV坐标按面顶点顺序对应: [(u0,v0),(u1,v1),(u2,v2),(u3,v3)]
const CUBE_FACES = [
    { idx: [0,4,5,1], uv: [[0,0],[1,0],[1,1],[0,1]] }, // 0: 底面 Y- (从下看: 右=+X, 上=+Z)
    { idx: [2,3,7,6], uv: [[0,1],[0,0],[1,0],[1,1]] }, // 1: 顶面 Y+ (从上看: 右=+X, 上=-Z)
    { idx: [0,1,3,2], uv: [[0,0],[1,0],[1,1],[0,1]] }, // 2: 左面 X- (从左看: 右=+Z, 上=+Y)
    { idx: [4,6,7,5], uv: [[1,0],[1,1],[0,1],[0,0]] }, // 3: 右面 X+ (从右看: 右=-Z, 上=+Y)
    { idx: [0,2,6,4], uv: [[0,0],[0,1],[1,1],[1,0]] }, // 4: 前面 Z- (从前看: 右=+X, 上=+Y)
    { idx: [1,5,7,3], uv: [[1,0],[0,0],[0,1],[1,1]] }  // 5: 后面 Z+ (从后看: 右=-X, 上=+Y)
];

// 为给定面法线选择 triplanar 平面投影的 U/V 轴及翻转，使贴图朝向正确、避免镜像
function pickPlanarAxes(n) {
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    if (ax >= ay && ax >= az) {
        return n.x > 0
            ? { u: 'z', v: 'y', flipU: true,  flipV: false }  // +X 右面
            : { u: 'z', v: 'y', flipU: false, flipV: false }; // -X 左面
    } else if (ay >= ax && ay >= az) {
        return n.y > 0
            ? { u: 'x', v: 'z', flipU: false, flipV: true }   // +Y 顶面
            : { u: 'x', v: 'z', flipU: false, flipV: false }; // -Y 底面
    }
    return n.z > 0
        ? { u: 'x', v: 'y', flipU: false, flipV: false }      // +Z 后面
        : { u: 'x', v: 'y', flipU: true,  flipV: false };     // -Z 前面
}

// 立方体12条边的顶点索引对(用于线框生成)
const CUBE_EDGES = [
    [0,4],[4,5],[5,1],[1,0],  // 底面4条边
    [2,3],[3,7],[7,6],[6,2],  // 顶面4条边
    [0,2],[1,3],[4,6],[5,7]   // 4条垂直边
];

// 从cubeDef创建BufferGeometry(含position/normal/uv)
// uvMode: 'auto'=按面法线投影(适合轴对齐立方体);
//         {face:N}=以第N面作为正投影方向(适合倾斜立方体如旗帜)，将所有顶点投影到该面平面并归一化UV
//         {face:N, rot:R}=顺时针旋转UV(0/90/180/270)
//         {face:N, edge:true}=沿边继承，相邻面显示主面边缘像素延伸效果
function createCubeGeometry(verts, uvMode = 'auto', bbox = null) {
    const positions = [], normals = [], uvs = [], shades = [];
    const v = verts.map(p => p instanceof THREE.Vector3 ? p : new THREE.Vector3(p[0], p[1], p[2]));

    // face模式: 预计算投影面信息(原点、u轴、v轴、u长度、v长度)
    let projOrigin, projUAxis, projVAxis, projULen, projVLen;
    let uvRot = 0;          // UV顺时针旋转角度(0/90/180/270)
    let edgeMode = false;   // 沿边继承模式
    if (uvMode && typeof uvMode === 'object' && uvMode.face !== undefined) {
        const refQuad = CUBE_FACES[uvMode.face].idx;
        const v0 = v[refQuad[0]], v1 = v[refQuad[1]], v3 = v[refQuad[3]];
        projOrigin = v0.clone();
        projUAxis = new THREE.Vector3().subVectors(v1, v0); // u轴方向(含长度)
        projVAxis = new THREE.Vector3().subVectors(v3, v0); // v轴方向(含长度)
        projULen = projUAxis.length();
        projVLen = projVAxis.length();
        if (projULen > 1e-6) projUAxis.divideScalar(projULen);
        if (projVLen > 1e-6) projVAxis.divideScalar(projVLen);
        uvRot = ((uvMode.rot || 0) % 360 + 360) % 360; // 规范化到0/90/180/270
        edgeMode = !!uvMode.edge;
    }

    CUBE_FACES.forEach((face, faceIdx) => {
        const quad = face.idx;
        // 两个三角形: [0,1,2] 和 [0,2,3]
        const tris = [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]];

        // 计算面法线(使用前3个顶点的叉积)
        const a = v[quad[0]], b = v[quad[1]], c = v[quad[2]];
        const u = new THREE.Vector3().subVectors(b, a);
        const w = new THREE.Vector3().subVectors(c, a);
        const normal = new THREE.Vector3().crossVectors(u, w).normalize();

        // 为该面4个顶点计算最终UV
        let faceUVs;
        if (projOrigin) {
            // face模式: 投影到参考面平面
            // projUAxis=面第二条边方向(高度), projVAxis=面第四条边方向(宽度)
            // 纹理U=水平(宽度)=v轴投影, V=垂直(高度)=u轴投影
            const rawUVs = quad.map(i => {
                const d = new THREE.Vector3().subVectors(v[i], projOrigin);
                return [
                    d.dot(projVAxis) / Math.max(projVLen, 1e-6),
                    d.dot(projUAxis) / Math.max(projULen, 1e-6)
                ];
            });

            if (edgeMode) {
                // 沿边继承: 检测退化方向(相邻面与参考面垂直时，某方向UV范围极小)
                // 将退化方向钳制到精确边缘(0或1)，配合ClampToEdge实现边缘像素延伸
                const uVals = rawUVs.map(uv => uv[0]);
                const vVals = rawUVs.map(uv => uv[1]);
                const uRange = Math.max(...uVals) - Math.min(...uVals);
                const vRange = Math.max(...vVals) - Math.min(...vVals);
                const EDGE_THRESH = 0.01; // 退化检测阈值

                faceUVs = rawUVs.map(uv => {
                    let ru, rv;
                    if (uRange < EDGE_THRESH) {
                        // U方向退化(相邻面): 钳制到最近边缘
                        ru = (uv[0] < 0.5) ? 0 : 1;
                    } else {
                        ru = Math.max(0, Math.min(1, uv[0]));
                    }
                    if (vRange < EDGE_THRESH) {
                        // V方向退化(相邻面): 钳制到最近边缘
                        rv = (uv[1] < 0.5) ? 0 : 1;
                    } else {
                        rv = Math.max(0, Math.min(1, uv[1]));
                    }
                    return [ru, rv];
                });
            } else {
                // 普通face模式: 钳制到[0,1]
                faceUVs = rawUVs.map(uv => [
                    Math.max(0, Math.min(1, uv[0])),
                    Math.max(0, Math.min(1, uv[1]))
                ]);
            }

            // 顺时针旋转UV: 0°不变, 90°→(v,1-u), 180°→(1-u,1-v), 270°→(1-v,u)
            if (uvRot === 90) faceUVs = faceUVs.map(uv => [uv[1], 1 - uv[0]]);
            else if (uvRot === 180) faceUVs = faceUVs.map(uv => [1 - uv[0], 1 - uv[1]]);
            else if (uvRot === 270) faceUVs = faceUVs.map(uv => [1 - uv[1], uv[0]]);
        } else if (bbox) {
            // auto + 整体包围盒: 基于整体 bbox 的 per-face 主轴平面投影(triplanar)
            // 多 cube 模型(如楼梯)贴图整体连贯，缺角处无几何自然裁切；
            // 单 cube 模型 bbox=自身，退化为每面整图(0..1)，与原固定UV行为一致。
            const lo = bbox.min, hi = bbox.max;
            const axes = pickPlanarAxes(normal);
            const su = Math.max(hi[axes.u] - lo[axes.u], 1e-6);
            const sv = Math.max(hi[axes.v] - lo[axes.v], 1e-6);
            faceUVs = quad.map(i => {
                let u = (v[i][axes.u] - lo[axes.u]) / su;
                let vv = (v[i][axes.v] - lo[axes.v]) / sv;
                if (axes.flipU) u = 1 - u;
                if (axes.flipV) vv = 1 - vv;
                return [Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, vv))];
            });
        } else {
            // auto模式(无bbox): 使用CUBE_FACES中预定义的固定UV，确保每个面从外部看贴图方向一致
            faceUVs = quad.map((i, qi) => face.uv[qi] || [0, 0]);
        }

        // 按三角形写入顶点数据
        tris.forEach(tri => {
            tri.forEach(i => {
                positions.push(v[i].x, v[i].y, v[i].z);
                normals.push(normal.x, normal.y, normal.z);
                const qi = quad.indexOf(i);
                uvs.push(faceUVs[qi][0], faceUVs[qi][1]);
                // 老版 fmbeSim 假明暗：亮度不再按固定逐面值烘焙，改由着色器按世界法线动态计算（见上方 ShaderChunk 覆写）
                // 顶点色恒为 1，仅保留 color 属性以兼容 vertexColors 管线
                shades.push(1.0, 1.0, 1.0);
            });
        });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(shades), 3));
    // 六面材质分组: CUBE_FACES 按序写入，每面=2三角形=6顶点，故第i面占 [i*6, i*6+6)
    // 分组后可给 mesh.material 传入长度为6的材质数组，实现六面不同贴图
    // (材质为单个对象时 three.js 会忽略分组，行为与改造前完全一致)
    for (let i = 0; i < 6; i++) geometry.addGroup(i * 6, 6, i);
    return geometry;
}

// ==================== 掉落物（地面平躺 sprite）====================
// 标定来源（2026-10-30 第二轮，用户重新给的两张实机正俯视图）：
//   · 图二「蜡烛」单件：图标不透明区 7×15 格 → 最小外接矩形 1306×609.5 px
//     ⇒ 每格 87.1 px；同图默认方块顶面 630.5 px = 1 块 ⇒ 每格 0.1379 块，精灵边长 16 格 = 2.21 块
//   · 图一「全物品叠加」：所有图标 alpha 并集 = 16×16 全满（确认精灵就是 16×16 像素格）
//   · 朝向：把图标逐格采样回原始 PNG（含两根深蓝芯像素）后反解，格轴与方块边成 25°；
//     且图标「列」沿 +X、图标「行」沿 −Z（行索引要反向），绕 Y 角 = 155.03°
//   · 精灵中心相对方块中心偏移：实测屏移 (−222.3, −360.8) px → X +0.572、Z −0.352 块
//   · 厚度/高度：第三轮侧剖图（YZ 平面）—— 默认方块灰面 891 px = 1 块，薄板 193..317 px
//     ⇒ 厚 124.5/891 = 0.138 块（与精灵像素一致），中心 0.380 块（顶 0.450 / 底 0.311）
//     （第一轮的 +0.28 来自透视图，作废）
// FMBE 是黑箱，这是近似模型；所有常量集中在此，后续对齐只需改这里。
const DROP_ITEM_XFORM = {
    size: 2.21,     // 精灵边长（块）= 16 像素 × 0.1379 块/像素
    thick: 0.138,   // 挤出厚度（块）≈ 1 个精灵像素
    y: 0.38,        // 中心高度（局部坐标，方块中心为 0）
    rotY: 155.03,   // 绕 Y 的固定朝向（度），配合「行反向」的贴图落点
    ox: 0.572,      // 精灵中心相对方块中心的 X 偏移（块）
    oz: -0.352      // 精灵中心相对方块中心的 Z 偏移（块）
};

const _dropItemGeoCache = new Map();   // 贴图 URL → BufferGeometry（同贴图的块共享几何）
const _dropItemTexCache = new Map();   // 贴图 URL → THREE.Texture 克隆（Nearest 采样专用）

// 由物品贴图生成体素几何：每个不透明像素 → 1 像素 × 1 像素 × thick 的柱体，
// 只保留顶/底面与轮廓侧壁（相邻不透明像素之间的内壁剔除），侧壁取该像素中心色。
function buildDropItemGeometry(img) {
    const S = DROP_ITEM_XFORM.size, T = DROP_ITEM_XFORM.thick;
    // 采样网格：物品贴图通常是 16×16（少数 32×32）。大尺寸贴图（如方块贴图 128×128）先最近邻降到 32，
    // 否则每个像素都生成体素柱会让面数爆炸（4M 面级）。
    const nW = Math.min(32, img.width), nH = Math.min(32, img.height);

    const canvas = document.createElement('canvas');
    canvas.width = nW; canvas.height = nH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, nW, nH);
    const px = S / nW, pz = S / nH;
    const data = ctx.getImageData(0, 0, nW, nH).data;
    const A = (ix, iy) => (ix < 0 || iy < 0 || ix >= nW || iy >= nH) ? 0 : data[(iy * nW + ix) * 4 + 3];

    const rot = DROP_ITEM_XFORM.rotY * Math.PI / 180;
    const cs = Math.cos(rot), sn = Math.sin(rot), Y0 = DROP_ITEM_XFORM.y;
    const OX = DROP_ITEM_XFORM.ox, OZ = DROP_ITEM_XFORM.oz;
    const P = [], N = [], U = [], C = [];

    // 顶点/法线写入时统一做「绕 Y 旋转 + 中心偏移 + 抬升」：几何自带固定朝向，不干扰用户旋转变量
    const putV = (x, y, z) => P.push(x * cs - z * sn + OX, y + Y0, x * sn + z * cs + OZ);
    const putN = (nx, ny, nz) => N.push(nx * cs - nz * sn, ny, nx * sn + nz * cs);
    // 四边形 → 2 三角形；uv 与顶点顺序一一对应
    const quad = (a, b, c, d, nx, ny, nz, ua, ub, uc, ud) => {
        const tris = [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]];
        for (const [p, t] of tris) { putV(p[0], p[1], p[2]); putN(nx, ny, nz); U.push(t[0], t[1]); C.push(1, 1, 1); }
    };

    const halfT = T / 2, x0w = -S / 2, z0w = -S / 2;
    // 不透明像素在「贴图平面坐标系」里的真实范围：缩放 Gizmo 角点按它贴合模型整体外框
    // （不能用几何 AABB —— 几何已烘焙 155° 朝向且剪影不是矩形，AABB 会把角点甩到模型四角之外）
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (let iy = 0; iy < nH; iy++) {
        for (let ix = 0; ix < nW; ix++) {
            if (A(ix, iy) < 128) continue;
            const x0 = x0w + ix * px, x1 = x0 + px;
            // ★ 图标「行」沿 −Z（实机逐格反解）：行索引反向 → z 从 +Z 边往 −Z 排
            //   （原先 iy→+Z 会让整张贴图在 Z 轴镜像，方向与原版 31° 一起偏掉）
            const z0 = z0w + (nH - 1 - iy) * pz, z1 = z0 + pz;
            if (x0 < bx0) bx0 = x0; if (x1 > bx1) bx1 = x1;
            if (z0 < bz0) bz0 = z0; if (z1 > bz1) bz1 = z1;
            const u0 = ix / nW, u1 = (ix + 1) / nW;
            const v1 = 1 - iy / nH, v0 = 1 - (iy + 1) / nH;   // 图像行向下 = +Z
            const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;      // 该像素中心

            // ★ UV 一律取「像素中心」（一格内四角同 UV）：
            //   若四角铺满 [u0,u1]×[v0,v1]，采样点正好压在像素边界上，会被双线性插值糊成渐变
            //   （实测渲染色数 10742，而原图只有 7 种颜色）；取中心则整格恒为同一 texel 颜色，
            //   得到 MC 那种硬像素块。顺带解决 extend 拉伸后顶/底面「贴图漂移」——UV 不再随
            //   四边形长度插值，拉伸只影响几何、不影响采样。
            const cc = [cu, cv];
            const c1 = [cu, cv], c2 = [cu, cv], c3 = [cu, cv];

            // 顶面(+Y)：从上看 右=+X、上=-Z
            quad([x0, halfT, z0], [x1, halfT, z0], [x1, halfT, z1], [x0, halfT, z1], 0, 1, 0, cc, c1, c2, c3);
            // 底面(-Y)
            quad([x0, -halfT, z1], [x1, -halfT, z1], [x1, -halfT, z0], [x0, -halfT, z0], 0, -1, 0, cc, c1, c2, c3);
            // 侧壁：仅在与透明像素相邻处生成（内壁剔除）
            const su = [cu, cv], sv = [cu, cv], sw = [cu, cv], sx = [cu, cv];
            if (A(ix + 1, iy) < 128) quad([x1, -halfT, z1], [x1, -halfT, z0], [x1, halfT, z0], [x1, halfT, z1], 1, 0, 0, su, sv, sw, sx);
            if (A(ix - 1, iy) < 128) quad([x0, -halfT, z0], [x0, -halfT, z1], [x0, halfT, z1], [x0, halfT, z0], -1, 0, 0, su, sv, sw, sx);
            // ★ 行也是反向的：+Z 侧的邻格是 iy−1、−Z 侧是 iy+1（照搬「行→+Z」的旧写法会让
            //   邻格判据整体反一次 —— 结果是内壁保留、外沿缺口，拉伸后能直接看穿模型）
            if (A(ix, iy - 1) < 128) quad([x0, -halfT, z1], [x1, -halfT, z1], [x1, halfT, z1], [x0, halfT, z1], 0, 0, 1, su, sv, sw, sx);
            if (A(ix, iy + 1) < 128) quad([x1, -halfT, z0], [x0, -halfT, z0], [x0, halfT, z0], [x1, halfT, z0], 0, 0, -1, su, sv, sw, sx);
        }
    }

    /* ★ 顶点捕捉可用的「剪影角点」：几何是按像素挤出的，每个像素格四角都是几何顶点，
       直接拿来当捕捉点会让整块板子内部铺满圆点（用户反馈）。这里只保留轮廓真正的转角，
       判定依据是「以该格点为角的那 2×2 个像素的不透明个数」：
         · 1 或 3 → 凸角 / 凹角；· 对角 2 → 尖点（真正拐角）
         · 同边 2 → 直边穿过该点（只是边中点，不算顶点）；· 0 / 4 → 图案外 / 内部
       顶、底两层各存一份（同一 XZ、不同 Y），与几何同空间（已含旋转 + 抬升）。 */
    const snap = [];
    for (let iy = 0; iy <= nH; iy++) {
        for (let ix = 0; ix <= nW; ix++) {
            const f0 = A(ix - 1, iy - 1) >= 128, f1 = A(ix, iy - 1) >= 128;
            const f2 = A(ix - 1, iy) >= 128, f3 = A(ix, iy) >= 128;
            const cnt = (f0 ? 1 : 0) + (f1 ? 1 : 0) + (f2 ? 1 : 0) + (f3 ? 1 : 0);
            if (cnt === 0 || cnt === 4) continue;
            if (cnt === 2 && !((f0 && f3) || (f1 && f2))) continue;
            const gx = x0w + ix * px, gz = z0w + (nH - iy) * pz;   // 与像素块同一「行反向」坐标系
            const wx = gx * cs - gz * sn + OX, wz = gx * sn + gz * cs + OZ;
            snap.push(wx, halfT + Y0, wz, wx, -halfT + Y0, wz);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3));
    geometry.addGroup(0, P.length / 3, 0);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometry.userData.dropSnapPoints = new Float32Array(snap);
    // 供缩放 Gizmo（06-gizmo/blockLocalCorners）取「精灵平面内的真实外框」：
    // minY/maxY 是烘焙前的 ±thick/2，rotY/y 是烘焙时的朝向与抬升，映射回模型局部坐标要用
    if (bx1 > bx0 && bz1 > bz0) {
        geometry.userData.dropBox = {
            minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1,
            minY: -halfT, maxY: halfT,
            rotY: DROP_ITEM_XFORM.rotY, y: Y0, ox: OX, oz: OZ
        };
    }
    return geometry;
}

// 从cubeDef创建Mesh(含材质)
// materialType: 'texture'(整体单贴图) | 'faces'(六面各自贴图) | 'color'(纯色)
// textureUrl: 整体贴图URL; materialColor: 纯色时的颜色; faceTextures: 长度6的URL数组
function createCubeMesh(cubeDef, materialType, textureUrl, materialColor, useDoubleSide, faceTextures, bbox) {
    const verts = cubeDef.v;
    const uvMode = cubeDef.uv || 'auto';
    const geometry = createCubeGeometry(verts, uvMode, bbox);
    const allowTexture = cubeDef.m !== false; // 默认true
    const side = useDoubleSide ? THREE.DoubleSide : THREE.FrontSide;

    let material;
    if (!allowTexture) {
        // 不允许贴图: 使用固定颜色
        material = new THREE.MeshBasicMaterial({
            color: cubeDef.c, vertexColors: true, side
        });
    } else if (materialType === 'faces' && Array.isArray(faceTextures)) {
        // 六面独立贴图: 生成6个白色占位材质，贴图由 applyFaceTextures 异步填充
        // 某面为空时退化为饱和色，保证未指定的面依然可见
        material = faceTextures.map(u => u
            ? new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side })
            : makeSaturatedMaterial(materialColor || '#aaccff', { side }));
    } else if (materialType === 'texture' && textureUrl) {
        // 允许贴图且有贴图: 使用白色材质(贴图后续加载)
        material = new THREE.MeshBasicMaterial({
            color: 0xffffff, vertexColors: true, side
        });
    } else {
        // 允许贴图但无贴图: 使用饱和色
        material = makeSaturatedMaterial(materialColor, { side });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    return mesh;
}

