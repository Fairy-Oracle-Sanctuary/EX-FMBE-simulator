/* 03-blocks/01-block-material.js · 源 测试版v.6b79.html 第 10235-10664 行 */
'use strict';
// ---- 材质数组辅助: 统一处理 mesh.material 可能是单个材质或长度6的数组 ----
function matList(m) { return !m ? [] : (Array.isArray(m) ? m : [m]); }
function forEachMat(mesh, fn) { matList(mesh && mesh.material).forEach(fn); }
function disposeMat(m) { matList(m).forEach(x => { if (x && x.dispose) x.dispose(); }); }

// 创建简单的细线坐标轴（替代 ArrowHelper）
function makeLineAxes(len = 2) {
    const group = new THREE.Group();
    const colors = [0xff6666, 0x66ff66, 0x66aaff];
    const dirs = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)];
    dirs.forEach((dir, i) => {
        const pts = [new THREE.Vector3(0,0,0), dir.clone().multiplyScalar(len)];
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: colors[i], depthTest: false, transparent: true, opacity: 0.9 });
        group.add(new THREE.Line(geom, mat));
    });
    return group;
}
// 创建 Gizmo 旋转轴细线：沿 dir 方向从 -len 到 +len，穿过中心
function makeGizmoAxisLine(dir, color, len = 2.5) {
    const d = dir.clone().normalize();
    const pts = [d.clone().multiplyScalar(-len), d.clone().multiplyScalar(len)];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 999;
    return line;
}

/* ★【2026-10-24 性能】大选区封顶：选中块数超过此值时，只有主选中块显示线框/自身坐标轴。
   几千块同时选中时逐块线框与逐块 ArrowHelper 会产生上万场景对象（实测 23.7k draw call），
   而视觉上只是糊成一片橙色 —— 封顶后大选区依然可整体移动/删除/改色。 */
const _SEL_WIREFRAME_MAX = 256;
const _AXIS_HELPER_MAX = 64;

class Block {
    // 把任意写法的面贴图描述规范化为长度6的数组 [底,顶,左,右,前,后]
    // 支持: 数组 | {all,side,top,bottom,north/front,south/back,east/right,west/left}
    // 全部为空时返回 null（表示不使用分面贴图）
    static normFaces(faces) {
        if (!faces) return null;
        let arr;
        if (Array.isArray(faces)) {
            arr = faces.slice(0, 6);
        } else {
            const f = faces, side = f.side ?? f.all;
            arr = [
                f.bottom ?? f.down  ?? side,
                f.top    ?? f.up    ?? side,
                f.west   ?? f.left  ?? side,
                f.east   ?? f.right ?? side,
                f.north  ?? f.front ?? side,
                f.south  ?? f.back  ?? side
            ];
        }
        while (arr.length < 6) arr.push(null);
        arr = arr.slice(0, 6).map(u => u || null);
        return arr.some(u => u) ? arr : null;
    }

    constructor(id, M, textureUrl = null, materialColor = '#aaccff', type = 'cube', groupName = null, faceTextures = null, forceDoubleSide = false) {
        this.id = id;
        this.type = type;
        this.group = groupName;
        this.scope = new VariableScope(id);
        this.scope.initFromM(M);
        this.scope.recompute();
        this.textureUrl = textureUrl;
        this.materialColor = materialColor;
        this.materialPresetName = null;   // 记录材质预设名称（用于命令导出）
        this.faceTextures = Block.normFaces(faceTextures); // null 或 长度6数组[底,顶,左,右,前,后]
        this.forceDoubleSide = forceDoubleSide; // 画笔平面为零厚度单面矩形，需强制双面以保证正反均可被射线选中
        this.facePresetKey = null;        // 命中的组合方块预设 key
        this.materialType = this.faceTextures ? 'faces' : (textureUrl ? 'texture' : 'color');
        this.rootGroup = null;
        this.meshes = [];
        this.label = null;
        this.axisHelper = null;
        this.selectionWireframe = null;
        this.createMesh();
    }

    createMesh() {
        // 清理旧网格和材质
        if (this.rootGroup) {
            if (this.rootGroup.parent) this.rootGroup.parent.remove(this.rootGroup);
            this.rootGroup.traverse(obj => { if (obj.isMesh && obj.material) disposeMat(obj.material); });
            this.rootGroup = null;
        }
        if (this.mesh && this.mesh !== this.rootGroup && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
        this.rootGroup = new THREE.Group();
        this.meshes = [];

        // 从注册表获取模型定义
        const modelDef = MODEL_REGISTRY[this.type];
        const useDoubleSide = (this.type !== 'cube') || this.forceDoubleSide; // cube默认FrontSide(由updateMaterialSide调整)，其余/强制双面的用DoubleSide

        if (modelDef.isDropItem) {
            // 掉落物：几何由物品贴图像素动态生成，这里先建空壳，贴图到位后重建几何
            const mat = new THREE.MeshBasicMaterial({
                color: 0xffffff, vertexColors: true, transparent: true, side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
            mesh.userData = { blockId: this.id, cubeIdx: 0, part: 'main' };
            this.rootGroup.add(mesh);
            this.meshes.push(mesh);
            this.mesh = mesh;
        } else {

        // 计算整体局部包围盒(跨所有 cube)：供 triplanar 投影 UV，使多 cube 模型贴图整体连贯、缺角自然裁切
        const _bb = {
            min: new THREE.Vector3(Infinity, Infinity, Infinity),
            max: new THREE.Vector3(-Infinity, -Infinity, -Infinity)
        };
        modelDef.cubes.forEach(c => c.v.forEach(p => {
            const pt = p instanceof THREE.Vector3 ? p : new THREE.Vector3(p[0], p[1], p[2]);
            _bb.min.min(pt); _bb.max.max(pt);
        }));
        // 仅多 cube 模型(如楼梯)启用整体投影 UV；单 cube 模型沿用原固定 UV，保持贴图朝向零回归
        const modelBBox = (modelDef.cubes.length > 1 && _bb.max.x > _bb.min.x) ? _bb : null;

        // 遍历所有cube，使用统一工厂创建
        modelDef.cubes.forEach((cubeDef, idx) => {
            const mesh = createCubeMesh(cubeDef, this.materialType, this.textureUrl, this.materialColor, useDoubleSide, this.faceTextures, modelBBox);
            // part: 'fixed'=不允许贴图的固定色cube(如旗杆); 'main'=允许贴图的主cube
            mesh.userData = { blockId: this.id, cubeIdx: idx, part: cubeDef.m === false ? 'fixed' : 'main' };
            this.rootGroup.add(mesh);
            this.meshes.push(mesh);
        });

        // 单cube模型: mesh直接指向该cube; 多cube模型: mesh指向rootGroup
        this.mesh = this.meshes.length === 1 ? this.meshes[0] : this.rootGroup;
        }

        /* ★【2026-10-24 性能】坐标轴辅助器改为「按需创建」（见 setBlockAxisHelper）。
           旧实现每建一块就 new 3 个 ArrowHelper（Line + Cone，共 6 个场景对象）并挂进场景：
           2940 块时多出 1.7 万个场景节点，渲染器每帧都要遍历/投影它们 —— 这是「几千方块直接卡炸」的主因之一。
           默认状态本来就是隐藏的，只有选中的块才需要，因此惰性创建即可，行为完全不变。 */
        this.axisHelper = null;

        // rootGroup 恒为单位矩阵（方块自身矩阵由 mesh 承载）：关掉自动矩阵计算，
        // 避免每帧为 2940 个 Group 各做一次 compose + 世界矩阵相乘。
        this.rootGroup.matrixAutoUpdate = false;
        this.rootGroup.matrixWorldNeedsUpdate = false;

        // 加载贴图
        if (this.materialType === 'faces' && this.faceTextures) {
            this.applyFaceTextures(this.faceTextures, this.facePresetKey);
        } else if (this.materialType === 'texture' && this.textureUrl) {
            this.loadTexture(this.textureUrl, this.materialPresetName);
        }

        this.rootGroup.frustumCulled = false;
        this.updateTransform();
        this.updateMaterialSide();
    }

    // 根据注册表判断cube是否允许贴图
    isCubeTexturable(cubeIdx) {
        const modelDef = MODEL_REGISTRY[this.type];
        if (!modelDef || !modelDef.cubes[cubeIdx]) return true;
        return modelDef.cubes[cubeIdx].m !== false;
    }

    // 掉落物：用已加载贴图的像素生成体素几何（同贴图共享一份，避免重复建几何）
    rebuildDropItemGeometry(tex) {
        const img = tex && tex.image;
        const mesh = this.meshes && this.meshes[0];
        if (!img || !img.width || !mesh) return;
        const key = this.textureUrl || '';
        let geo = _dropItemGeoCache.get(key);
        if (!geo) {
            geo = buildDropItemGeometry(img);
            _dropItemGeoCache.set(key, geo);
        }
        mesh.geometry = geo;

        // ★贴图克隆 + 双 Nearest + 关 mipmap：
        //   贴图缓存里的同一张纹理还被方块模型使用（magFilter 已是 Nearest），
        //   但 minFilter 默认带 mipmap —— 镶嵌在斜角/远距离时会跨 mip 混色，像素糊成一片。
        //   掉落物是「一像素一色块」，必须硬采样。克隆一份只对掉落物生效，不动方块。
        if (!_dropItemTexCache.has(key)) {
            const t = tex.clone();
            t.magFilter = THREE.NearestFilter;
            t.minFilter = THREE.NearestFilter;
            t.generateMipmaps = false;
            t.anisotropy = 1;
            t.needsUpdate = true;
            _dropItemTexCache.set(key, t);
        }
        const m = mesh.material;
        m.map = _dropItemTexCache.get(key);
        m.alphaTest = 0.5;        // 透明像素直接 discard ⇒ 边缘硬、深度写入正常
        m.transparent = false;
        m.needsUpdate = true;
        bumpDrawRev('mat');

        // 换物品贴图后精灵外框变了 ⇒ 选中线框里的旧点集已过期，按新外框重建；
        // 贴图晚于选中到达（几何还是空壳）时也在这里补建。
        if (this.selectionWireframe || (selectedBlocksSet.has(this) && selectedBlocksSet.size <= _SEL_WIREFRAME_MAX)) {
            const wasVisible = this.selectionWireframe ? this.selectionWireframe.visible : true;
            this.buildSelectionWireframe();
            if (this.selectionWireframe) this.selectionWireframe.visible = wasVisible;
        }
    }



// 设置纯色材质：遍历所有允许贴图的cube，替换为饱和色材质(不贴图)
// 不允许贴图的cube(如旗杆)保持其固定颜色不变
    setSolidColor(hex) {
    if (!this.mesh) return;
    const useDoubleSide = (this.type !== 'cube') || this.forceDoubleSide;
    this.meshes.forEach(mesh => {
        // 跳过不允许贴图的cube(通过userData.cubeIdx查注册表)
        if (!this.isCubeTexturable(mesh.userData.cubeIdx)) return;
        const newMat = makeSaturatedMaterial(hex, {
            side: useDoubleSide ? THREE.DoubleSide : THREE.FrontSide
        });
        disposeMat(mesh.material);   // 兼容材质数组
        mesh.material = newMat;
    });
    this.materialType = 'color';
    this.materialColor = hex;
    this.textureUrl = null;
    this.faceTextures = null;
    this.facePresetKey = null;
    this.materialPresetName = null;
}

// 加载整体贴图：六个面使用同一张图（保持原有行为）
// 不允许贴图的cube(如旗杆)保持其固定颜色不变
// presetName: 材质名称，用于命令导出
loadTexture(url, presetName = null, skipCreate = false) {
    if (!url) return;
    const full = texUrl(url);
    const isGlass = /glass/i.test(full);
    const useDoubleSide = (this.type !== 'cube') || isGlass || this.forceDoubleSide;
    const side = useDoubleSide ? THREE.DoubleSide : THREE.FrontSide;

    this.meshes.forEach(mesh => {
        if (!this.isCubeTexturable(mesh.userData.cubeIdx)) return;
        // 若此前是六面材质数组，先合并回单材质
        if (Array.isArray(mesh.material)) {
            disposeMat(mesh.material);
            mesh.material = new THREE.MeshBasicMaterial({
                color: 0xffffff, vertexColors: true, transparent: isGlass, side
            });
        }
        const mat = mesh.material || (mesh.material = new THREE.MeshBasicMaterial({
            vertexColors: true, transparent: isGlass, side
        }));
        mat.map = loadTextureCached(full, t => { matApplyTexAlpha(mat, t, isGlass); });
        if (mat.color) mat.color.setHex(0xffffff);
        mat.side = side;
        mat.needsUpdate = true;
    });

    this.textureUrl = full;
    this.materialType = 'texture';
    this.materialColor = null;
    this.faceTextures = null;
    this.facePresetKey = null;
    this.materialPresetName = presetName || texDisplayName(texName(full));
    this.updateMaterialSide();

    // 掉落物：贴图就绪后按像素（重新）生成体素几何
    const _def = MODEL_REGISTRY[this.type];
    if (_def && _def.isDropItem) {
        loadTextureCached(full, t => this.rebuildDropItemGeometry(t));
    }
}

// ===== 六面独立贴图 =====
// faces: 长度6数组 [底,顶,左,右,前,后]，元素可为贴图文件名 / 完整URL / null(该面用纯色)
// presetKey: 若来自组合方块预设，记录其 key 以便命令导出时用一个名字表示
applyFaceTextures(faces, presetKey = null) {
    const arr = Block.normFaces(faces);
    if (!arr) return;
    this.faceTextures = arr;
    this.materialType = 'faces';
    this.textureUrl = null;
    this.facePresetKey = presetKey || null;
    this.materialPresetName = presetKey ? blockPresetName(presetKey) : null;
    this.rebuildFaceMaterials();
}

// 依据 this.faceTextures 重建每个可贴图 cube 的 6 个材质
rebuildFaceMaterials() {
    const arr = this.faceTextures;
    if (!arr || !this.meshes.length) return;
    // 掉落物是「贴图即几何」的单材质 sprite，不适用六面材质数组
    const _md = MODEL_REGISTRY[this.type];
    if (_md && _md.isDropItem) return;
    const isGlass = arr.some(u => u && /glass/i.test(u));
    const useDoubleSide = (this.type !== 'cube') || isGlass || this.forceDoubleSide;
    const side = useDoubleSide ? THREE.DoubleSide : THREE.FrontSide;
    const fallback = this.materialColor || '#aaccff';

    this.meshes.forEach(mesh => {
        if (!this.isCubeTexturable(mesh.userData.cubeIdx)) return;
        const mats = arr.map(u => {
            if (!u) return makeSaturatedMaterial(fallback, { side });
            const m = new THREE.MeshBasicMaterial({
                color: 0xffffff, vertexColors: true,
                transparent: /glass/i.test(u), side
            });
            const t = loadTextureCached(texUrl(u), tt => matApplyTexAlpha(m, tt, /glass/i.test(u)));
            m.map = t;
            return m;
        });
        disposeMat(mesh.material);
        mesh.material = mats;   // 长度6，配合几何体分组实现六面不同贴图
    });
    this.updateMaterialSide();
}

// 设置单个面的贴图（faceIdx: 0底 1顶 2左 3右 4前 5后）
// 会自动把当前的整体贴图 / 纯色状态展开为六面数组
setFaceTexture(faceIdx, url) {
    if (faceIdx < 0 || faceIdx > 5) return;
    let base;
    if (this.faceTextures) base = this.faceTextures.slice();
    else if (this.materialType === 'texture' && this.textureUrl) base = new Array(6).fill(this.textureUrl);
    else base = new Array(6).fill(null);
    base[faceIdx] = url || null;
    // 六面全空则回退为纯色
    if (!base.some(u => u)) { this.setSolidColor(this.materialColor || '#aaccff'); return; }
    this.applyFaceTextures(base, null);
}

// 应用组合方块预设（如"草方块""熔炉"），一次性设置六面
applyBlockPreset(key) {
    const p = TEX_PRESET_MAP.get(key);
    if (!p) return false;
    this.applyFaceTextures(p.faces.slice(), key);
    return true;
}

// 取当前六面贴图（无论处于哪种材质模式，都归一化成6元素数组，供UI显示）
getFaceTextures() {
    if (this.faceTextures) return this.faceTextures.slice();
    if (this.materialType === 'texture' && this.textureUrl) return new Array(6).fill(this.textureUrl);
    return new Array(6).fill(null);
}
    

    updateTransform() {
        const M = this.scope.toM();
        const rotX = this.scope.vars.get('v.rotatex')?.value ?? 0;
        const rotY = this.scope.vars.get('v.rotatey')?.value ?? 0;
        const rotZ = this.scope.vars.get('v.rotatez')?.value ?? 0;
        const matrix = computeTransformMatrix(M, rotX, rotY, rotZ);
        // 文件夹不存储任何变换：方块矩阵仅由自身 v.* 决定（文件夹只是分组容器，
        // 对文件夹的旋转/移动已实时烘焙进子级方块数值，见 applyFolderRotate/applyFolderMove）
        this.mesh.matrix.copy(matrix);
        this.mesh.matrixAutoUpdate = false;
        this.mesh.matrixWorldNeedsUpdate = true;
        this.mesh.updateMatrixWorld(true);
        /* ★2026-10-31：FMBE 原版不支持负 scale / 负 extend_scale，出现负值即不渲染该模型。
           这里逐次刷新时直接同步显隐（关键帧 / molang / 拖拽改值都能立即生效，不必等渲染循环的
           500ms 兜底）；用 _negScaleHidden 记住「是自己因负值隐藏的」，恢复非负时只还原这一种情况，
           不干扰教程等外部路径对 mesh.visible 的直接控制。 */
        if (blockHasNegativeScale(this)) {
            this.mesh.visible = false;
            this._negScaleHidden = true;
            if (this.selectionWireframe) this.selectionWireframe.visible = false;
        } else if (this._negScaleHidden) {
            this._negScaleHidden = false;
            this.mesh.visible = !isBlockHidden(this);
        }
        bumpDrawRev('mat');   // 大场景渲染调度：方块动了才重画
    }
    // 材质渲染面：一律保持 FrontSide（负 scale 由 three.js 内部翻转正反面定义来正确渲染）
updateMaterialSide() {
        // ※ 历史：这里原本按 world 矩阵行列式 det<0 把材质切成 BackSide（"负体积"）。
        //   实测 det<0 时【渲染】与【拾取】都已经是错的（见下方说明），故不再使用行列式。
        // 掉落物是「贴图即几何」的薄体素壳，材质由 rebuildDropItemGeometry 设成 transparent=false，
        // 若走下方默认逻辑会被切成 FrontSide —— 变量一变（refresh）就改变显示与拾取。
        // 这里始终保留其初始的 DoubleSide（正/反/侧视可见，镜像 det<0 时射线也不受影响）。
        if (MODEL_REGISTRY[this.type] && MODEL_REGISTRY[this.type].isDropItem) {
            for (let i = 0; i < this.meshes.length; i++) {
                forEachMat(this.meshes[i], m => {
                    if (m.side !== THREE.DoubleSide) { m.side = THREE.DoubleSide; m.needsUpdate = true; }
                });
            }
            return;
        }
        // 旗帜通常为薄面几何，避免因矩阵镜像导致面不可见，始终使用 DoubleSide
        if (this.type === 'flag') {
            for (let i = 0; i < this.meshes.length; i++) {
                forEachMat(this.meshes[i], m => {
                    if (m.side !== THREE.DoubleSide) { m.side = THREE.DoubleSide; m.needsUpdate = true; }
                });
            }
            return;
        }

        // 画笔平面为零厚度单面矩形：强制双面，保证正/反/侧视均能被射线选中（否则背面点击选不中、无法用 Gizmo 修改）
        if (this.forceDoubleSide) {
            for (let i = 0; i < this.meshes.length; i++) {
                forEachMat(this.meshes[i], m => {
                    if (m.side !== THREE.DoubleSide) { m.side = THREE.DoubleSide; m.needsUpdate = true; }
                });
            }
            return;
        }

        // 材质渲染面：一律保持 FrontSide，不按行列式切 BackSide
    // ★【2026-10-25 修复】旧实现「det<0 → BackSide」是基于「负 scale 会翻转面朝向」的错误前提：
    //   three.js 渲染时对 det<0 的对象会自动翻转正反面定义（renderObject 里 frontFaceCW），
    //   FrontSide 本来就能正确画出镜像方块的【外表面】；再切 BackSide 等于把外表面剔掉、
    //   只剩内表面 ⇒ 镜像块看起来像镂空/缺面，且射线拾取会穿过近面命中【远面】（面选取选错面）。
    //   透明贴图仍保持 DoubleSide，否则背面被剔除会看穿。
    const baseSide = THREE.FrontSide;

        // 将目标 side 应用于相关网格的材质，确保所有部件一致（仅限立方体等需要翻转的类型）
        // 透明贴图(玻璃)始终保持 DoubleSide，否则背面会被剔除导致看穿
        for (let i = 0; i < this.meshes.length; i++) {
            forEachMat(this.meshes[i], m => {
                const target = m.transparent ? THREE.DoubleSide : baseSide;
                if (m.side !== target) { m.side = target; m.needsUpdate = true; }
            });
        }
}

    refresh() {
    this.scope.recompute();
    this.updateTransform();
    updateGlobalVarsDependingOn(this, null);
    this.updateMaterialSide();   // 新增：根据 scale 调整材质背面
}

    getVarList() {
        return Array.from(this.scope.vars.entries()).map(([n, d]) => ({ name: n, expr: d.expr, value: d.value, rangeMin: d.rangeMin, rangeMax: d.rangeMax, step: d.step }));
    }

    incVar(name, delta) {
        const d = this.scope.vars.get(name);
        if (d && isConstantExpr(d.expr)) {
            let nv = d.value + delta;
            const dec = (d.step.toString().includes('.') ? d.step.toString().split('.')[1].length : 0);
            nv = parseFloat(nv.toFixed(dec));
            if (nv > d.rangeMax) nv = d.rangeMin;
            else if (nv < d.rangeMin) nv = d.rangeMax;
            d.expr = nv.toString();
            d.value = nv;
            this.refresh();
            return true;
        }
        return false;
    }

    getMeshes() {
        return this.meshes;
    }

    /* 按当前模型生成选中线框：静态模型取注册表 cubes 的 12 条棱；
       掉落物没有静态 cubes（几何由物品图标像素动态生成），改画几何本身的特征棱。
       已存在线框时整体重建（换物品贴图后几何变、棱也变）。 */
    buildSelectionWireframe() {
        if (this.selectionWireframe) {
            scene.remove(this.selectionWireframe);
            this.selectionWireframe.geometry.dispose();
            this.selectionWireframe.material.dispose();
            this.selectionWireframe = null;
        }
        const modelDef = MODEL_REGISTRY[this.type] || { cubes: [] };
        const positions = [];
        // 遍历模型中所有cube，使用CUBE_EDGES统一生成12条边
        (modelDef.cubes || []).forEach(cubeDef => {
            const v = cubeDef.v.map(p => new THREE.Vector3(p[0], p[1], p[2]));
            CUBE_EDGES.forEach(pair => {
                const v1 = v[pair[0]], v2 = v[pair[1]];
                positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
            });
        });
        if (!positions.length && modelDef.isDropItem) {
            const g = this.mesh && this.mesh.geometry;
            // 贴图未加载时几何还是空壳（没有 dropBox），此时不画（不要退回 ±0.5 的单位立方体框）
            if (g && g.userData && g.userData.dropBox && g.getAttribute('position')) {
                /* 掉落物画「真实模型边框」：EdgesGeometry 会合并共面相邻三角形，
                   只保留精灵轮廓（顶/底边界）和侧壁竖棱 —— 形状贴着图标实际像素外形，
                   而不是外接矩形棱柱。 */
                const eg = new THREE.EdgesGeometry(g);
                const ea = eg.getAttribute('position');
                for (let i = 0; i < ea.count; i++) positions.push(ea.getX(i), ea.getY(i), ea.getZ(i));
                eg.dispose();
            }
        }
        if (!positions.length) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        const material = new THREE.LineBasicMaterial({ color: 0xffaa00 });
        this.selectionWireframe = new THREE.LineSegments(geometry, material);
        // 使用与方块相同的世界矩阵，禁止自动更新以便精确匹配
        this.selectionWireframe.matrixAutoUpdate = false;
        // 单cube用mesh.matrixWorld，多cube用rootGroup.matrixWorld
        const srcMatrix = (this.meshes.length === 1) ? this.mesh.matrixWorld : (this.rootGroup.matrixWorld || this.mesh.matrixWorld);
        this.selectionWireframe.matrix.copy(srcMatrix);
        this.selectionWireframe.matrixWorldNeedsUpdate = true;
        scene.add(this.selectionWireframe); // 添加到场景，便于统一更新变换
    }

    updateSelectionHighlight(selected) {
    bumpDrawRev('ui');   // 选中线框显隐/颜色变了
    /* ★【2026-10-24 性能】线框封顶：旧实现「每选中一块就 new 一个 LineSegments 挂进场景」，
       导入 OBJ 时整批选中 2940 块 → 2940 个线框对象（2940 次 draw call + 每帧矩阵更新）。
       超过 _SEL_WIREFRAME_MAX 时只给主选中块画线框（几千个橙色框本来也看不清）。 */
    const wantWire = selected && (selectedBlocksSet.size <= _SEL_WIREFRAME_MAX || this === selectedBlock);
    if (wantWire) {
        // 如果没有创建线框，则立即创建(从注册表统一生成所有cube的边线)
        if (!this.selectionWireframe) this.buildSelectionWireframe();
        // 显示线框（掉落物贴图未就绪时点集为空 ⇒ 还没有线框对象，跳过）
        if (!this.selectionWireframe) return;
        this.selectionWireframe.visible = true;
        /* 捕捉期间参与运算的方块（被移动集合 / 目标方块）必须是紫色：
           黄色在本模拟器里读作「被选中」，会把它们误读成普通选中 */
        try { this.selectionWireframe.material.color.setHex(vtxSnapWireColorOf(this)); } catch (e) {}
        // 注意：线框的实际位置、旋转、缩放将在动画循环中通过世界矩阵更新
        // （见 animate 函数中的 selectedBlocksSet 遍历部分）

    } else {
        // 未选中时隐藏线框
        if (this.selectionWireframe) {
            this.selectionWireframe.visible = false;
        }
    }
}
}

let globalVars = new Map();
let activeAutoIncMap = new Map();
let blocks = [];
// 提前声明骨骼父子映射缓存，避免新布局初始化（renderInspectorInto→getBoneParentId→_getBoneParentMap）
// 在声明前访问 _bpmCache 触发 TDZ 崩溃（整个模块中断 → 所有事件绑定未注册 → 按钮按不动）。
let _bpmCache = null, _bpmSig = null;
let folders = [];   // 文件夹树（骨骼）：每项 { name, parentName(null=根), pivot:[x,y,z], rotation:[x,y,z], expanded, hidden }
window.folders = folders;

