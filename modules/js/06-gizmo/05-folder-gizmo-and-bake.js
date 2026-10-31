/* 06-gizmo/05-folder-gizmo-and-bake.js · 源 测试版v.6b79.html 第 33435-34886 行 */
'use strict';
// ===== 文件夹 Gizmo：把变换实时烘焙进所有子级方块（文件夹不存储任何变换）=====
// 文件夹 = 纯分组：对它的旋转/移动 = 对子级方块的统一多选编辑。
const _r4 = (v) => Math.round(Number(v) * 10000) / 10000;

// ★★ 导出侧的 extend_scale 安全下限（2026-10-01）
// 模拟器内部渲染/逆变换早就用 clampEs() 把 es=0 钳到 ES_MIN=1e-4，避免拉伸矩阵奇异
// （localMat 某列缩放为 0 → det=0 → three.js Raycaster 求逆得零矩阵 → 点选失效）。
// 但导出侧过去【全部原样输出用户的 0】：
//   · v.extend_scale=0;                  ← 静态命令 / 骨骼常量
//   · v.start_extend_scale=0;v.Textend_scale=0;  ← 关键帧 lerp 端点
// 一旦导出（无论进游戏还是回导本模拟器），矩阵当场奇异、方块不可拾取。
// 用户明确要求：只要出现 extend_scale=0，导出就落成 0.0001。
// 注意 NaN/±Infinity（表达式求值失败 / ÷0）同样会让矩阵炸，一并兜到 0.0001。
const ES_EXPORT_MIN = 0.0001;
// 命中三类命名：v.extend_scale / v.start_extend_scale / v.Textend_scale（关键帧端点变量），
// 以及短名 v.es（压缩导出）。一律用【后缀】匹配 extend_scale / es，避免漏掉 T 前缀。
const _isEsVar = (n) => /extend_scale$/.test(n) || n === 'es' || n === 'v.es' || /\.es$/.test(n);
const _esNorm = (v) => {
    const n = Number(v);
    return (!Number.isFinite(n) || n === 0) ? ES_EXPORT_MIN : n;
};
// 统一收口（静态/骨骼常量路径）：变量名是 extend_scale 时做 0 归一化，并沿用 _r4 的 4 位精度
function _fv(name, v) {
    if (!_isEsVar(name)) return v;
    return _r4(_esNorm(v));
}
// 关键帧路径（fmtV）另在各自函数内收口，精度与既有 fmt 一致（6 位）。
// 方块自身的「全局旋转」矩阵（来自 v.rotatex/y/z），用于把世界增量换算到方块局部 basepos 空间
function _blockGlobalRot(b) {
    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
    return new THREE.Matrix4().makeRotationY(degToRad(-rY))
        .multiply(new THREE.Matrix4().makeRotationX(degToRad(rX)))
        .multiply(new THREE.Matrix4().makeRotationZ(degToRad(-rZ)));
}
// ===== 世界位移 → 骨骼跟随偏移（xbasepos_bone/y/z）换算 =====
// 骨骼子块的位置语义（bindBone 写入）：v.xpos = t[父_px] + pR(父骨骼旋转)·(xbasepos_bone, y…, z…)
//   ⇒ Δ世界 = pR·Δbasepos_bone   ⇒  Δbasepos_bone = pR⁻¹·worldDelta
// ★ pR 的旋转源必须是父块的【v.rotatex / v.rotatey / v.rotatez】——与 bindBone 发布的
//   t[父_xrot] = v.rotatex 同源、与子块 molang 里 pR00..22 的公式完全同式。
//   绝不能用 v.xrot/yrot/zrot（那是方块自身的外观旋转，不参与骨骼链）：旧代码用错源，
//   父骨带 rotatex / rotatey 时世界位移被多转（或少转）一道父旋转 —— 拖世界 Y 箭头模型却沿斜向走，
//   正是「文件夹位移 Gizmo 的 UI 互动方向与实际模型移动方向不符」的根因。
// 父可能是中继根（其 rotatex 本身是 molang），故先 refresh 取实时值。
/* ==== 官方换算通道注册表（r16）====
   每条 = 一种「Gizmo 交互 → 关键帧变量」的官方快捷换算。
   · id       稳定标识
   · label    供 UI/提示使用
   · vars     本通道最终写入的关键帧变量名（裸名，不带 v.）
   · kind     'world-delta'（输入世界增量，需逆变换）| 'direct'（直接写值）
   · enabled(block)  该通道对此方块是否适用
   · convert(block, ctx, delta) → bool  换算并写入（写入必须经 kfChannelWrite）
   新增官方换算 = 追加一条；不得再往 changeVar / applyBatchDelta 里塞 if 分支。*/
const KF_OFFICIAL_CHANNELS = [
    {
        id: 'bone_offset',
        label: '骨骼跟随偏移',
        vars: ['xbasepos_bone', 'ybasepos_bone', 'zbasepos_bone'],
        kind: 'world-delta',
        // ★【2026-10-24】两种绑定方式的 pos 公式统一后，所有骨骼子块都靠 xbasepos_bone 承载枢轴偏移
        // ★【2026-10-24 r23】basepos 绑定已退化为「纯枢轴吸附」：pos 锁定父枢轴、没有 xbasepos_bone，
        //   世界位移换算不适用（位移请直接写 basepos，走普通分支）。
        enabled: (b) => !!getBoneParentId(b) && !(getBoneMode(b) === 'basepos' && !isBaseposDrivenBlock(b)),
        convert: (b, ctx, delta) => applyWorldDeltaToBoneOffset(b, ctx && ctx.parent, delta),
    },
];
// 官方换算的写入咽喉：结果一律进关键帧数据（= 缓动的赋值列表），失败才回落 scope.vars 直写。
//   setConstVarValue 内部已优先 kfGizmoWriteVar —— 这里只是把「写入」收敛为唯一具名入口，
//   便于未来给所有官方换算统一加「写前守卫 / 写后同步」钩子。
function kfChannelWrite(b, name, value) {
    if (!b || !b.scope) return false;
    const full = name.startsWith('v.') ? name : ('v.' + name);
    const short = full.replace(/^v\./, '');
    /* ★★★【r17 · 用户投诉「官方换算变量没被录入、右侧数据表纹丝不动」的真根因】
       旧实现只调 `setConstVarValue → kfGizmoWriteVar`；而 `kfGizmoWriteVar` 对「既不在 `d.vars`、
       也不在任何帧里」的变量会走 `kfGizmoWriteConst`（写进**程序基线常量**）——
       于是 `xbasepos_bone` 变成产物里一条无条件 `v.xbasepos_bone=-2.728;`：
       既没进「缓动的赋值列表」（数据表没有该行、自然"纹丝不动"），动画也不由它驱动。
       换算在语义上 == 「用户在该变量的数据表行手动改数值」⇒
       必须先把该变量纳入关键帧集（`kfRealizeTargetVar`：数据表自动新建该行并补齐到所有已存在帧），
       再走 `kfGizmoWriteVar` 写**当前帧**。
       非关键帧方块无帧可录，保持「写进基线常数」的旧行为（此时 realize 分支不执行）。*/
    if (hasKeyframeAnimation(b.id)) {
        const d = kfData(b.id, true);
        if (!(d.vars instanceof Set) || !d.vars.has(short)) {
            try { kfRealizeTargetVar([b], short); } catch (e) { }
        }
    }
    setConstVarValue(b, full, value);
    return true;
}
function applyWorldDeltaToBoneOffset(b, pBlock, worldDelta) {
    if (!b || !pBlock) return false;
    // ★【2026-10-24 r23】basepos 绑定（纯枢轴吸附）没有 xbasepos_bone 通道，世界位移直接写 basepos。
    if (getBoneMode(b) === 'basepos' && !isBaseposDrivenBlock(b)) return false;
    try { pBlock.refresh(); } catch (e) {}
    // ★ pR 旋转源只用父的 v.rotatex/y/z（xrot/yrot/zrot 是外观旋转，不参与骨骼链）。
    const prx = tvnum(pBlock, 'v.rotatex');
    const pry = tvnum(pBlock, 'v.rotatey');
    const prz = tvnum(pBlock, 'v.rotatez');
    const inv = boneParentMatrix(prx, pry, prz).clone().invert();
    if (!inv.elements.every(Number.isFinite)) return false;
    let local = new THREE.Vector3(worldDelta.x, worldDelta.y, worldDelta.z).applyMatrix3(inv);
    // ★ 局部轴绑定（2026-10-21 实时反解链）：父坐标系位移 = A0·Δbone，故 Δbone = A0⁻¹·(父坐标系位移)
    if (getBoneMode(b) === 'basepos') {
        const A0 = boneBaseposA0Of(b);
        if (A0) {
            const m0 = new THREE.Matrix3().set(A0[0], A0[1], A0[2], A0[3], A0[4], A0[5], A0[6], A0[7], A0[8]);
            if (Number.isFinite(m0.determinant()) && Math.abs(m0.determinant()) > 1e-12) local = local.applyMatrix3(m0.clone().invert());
        }
    }
    ['v.xbasepos_bone', 'v.ybasepos_bone', 'v.zbasepos_bone'].forEach((vn, i) => {
        if (!b.scope.vars.has(vn)) b.scope.addVar(vn, '0', -100, 100, 0.1);
        kfChannelWrite(b, vn, _r4(tvnum(b, vn) + local.getComponent(i)));
    });
    return true;
}
// 平移整个文件夹：worldDelta 为【世界空间】位移向量，逐子级换算到其局部 basepos
function applyFolderMove(folderName, worldDelta) {
    const boneIds = getBoneBlocksOfFolder(folderName);
    // ★ 判定：只有【真 molang 骨骼文件夹】才能「只移骨干、靠 molang 带动子块」。
    //   静态文件夹骨骼（设了 _backbone 但子块无 molang = 纯分组）若也走这条路径，子块不会跟随
    //   → 一拖就散架，必须落到下方【刚体逐块平移】分支（那分支本来就是为无 molang 情形写的）。
    //   单块骨骼文件夹（只有骨干、无子块）仍走骨骼路径：只移根 ≡ 整体平移，且避免位移被写进 basepos。
    const f = getFolder(folderName);
    const _fbM = (f && f._backbone) ? getFolderAllCubeIds(folderName).map(id => blocks.find(x => x.id === id)).filter(Boolean) : [];
    const isRealMolangBone = _fbM.length > 0 && (_fbM.length === 1 || _fbM.some(b => isBoneMolangDriven(b)));
    if (isRealMolangBone) {
        // 单块骨骼文件夹 getBoneBlocksOfFolder 会返回 null（无 bindBone 子块 → 无 <id>_xrot 全局 →
        // isBoneRoot false），但文件夹有骨干即骨骼，fallback 到文件夹全部方块作为骨骼块集合。
        const useIds = (boneIds && boneIds.length) ? boneIds : getFolderAllCubeIds(folderName);
        // 骨级：仅平移根方块，子方块由 molang 自动跟随（刚体、不散架）
        const rootIds = getBoneRootIds(folderName);
        const roots = rootIds.map(id => blocks.find(b => b.id === id)).filter(Boolean);
        const movers = roots.length ? roots : [blocks.find(b => b.id === useIds[0])].filter(Boolean);
        movers.forEach(b => {
            const pid = getBoneParentId(b);
            if (pid) {
                // 中继骨骼（自身也是父骨骼的子块）：位置由 molang 表达式（v.xpos = t[父_px] + pR·offset）
                // 实时计算，绝不能 setConstVarValue 写死 xpos 常量（那会覆盖 molang、使其脱离父骨骼）。
                // 改为在父坐标系内平移偏移 xbasepos_bone：世界位移 worldDelta → 父局部 Δ = R(父骨骼旋转)⁻¹·worldDelta，
                // 之后 molang 自动算回正确世界位置，子块也随之整体平移（见 applyWorldDeltaToBoneOffset）。
                applyWorldDeltaToBoneOffset(b, blocks.find(x => x.id === pid), worldDelta);
            } else {
                // 真根：整体平移直接写 v.xpos（其位置即为自身世界位置，子块经 t[父_px] 跟随）
                setConstVarValue(b, 'v.xpos', _r4(tvnum(b, 'v.xpos') + worldDelta.x));
                setConstVarValue(b, 'v.ypos', _r4(tvnum(b, 'v.ypos') + worldDelta.y));
                setConstVarValue(b, 'v.zpos', _r4(tvnum(b, 'v.zpos') + worldDelta.z));
            }
            b.refresh(); b.mesh.updateMatrixWorld(true);
        });
        // 平移后刷新整条骨骼（含所有后代文件夹方块）：子块 molang 读取父最新世界位置实时跟随
        refreshBlocksUnderFolder(folderName);
        /* 【2026-10-19 · 关键帧去文件夹化】原此处调用 syncBoneKeyframeAfterPose(folderName) 把骨骼姿态写回骨级关键帧，已删除 */
        const _self = getFolder(folderName);
        if (_self) {
            if (!_self.position) _self.position = [0, 0, 0];
            _self.position = [_r4(_self.position[0] + worldDelta.x), _r4(_self.position[1] + worldDelta.y), _r4(_self.position[2] + worldDelta.z)];
        }
        return;
    }
    // 文件夹骨骼（无 molang 绑定，整体刚体平移）或普通文件夹：整条骨骼 / 整组作为【刚体】逐方块平移
    // （文件夹骨骼没有 molang 表达式，不能只移根，必须整体刚体平移，与播放时的刚性重组同构）
    const ids = (boneIds && boneIds.length) ? boneIds : getFolderAllCubeIds(folderName);
    const idSet = new Set(ids);
    ids.forEach(id => {
        const b = blocks.find(x => x.id === id);
        if (!b) return;
        // ★ 已绑骨（跟随父骨 molang：v.xpos = t[父_px] + pR·basepos_bone）的方块：
        //   它的位置由父骨实时驱动，写 v.xbasepos 会被父旋转二次旋转 —— 父姿态一变，当初的
        //   "世界位移"方向就漂了。按用户规范：动画/骨骼跟随态一律换算成 bonebasepos 变量。
        // 静态文件夹骨骼子块是纯分组（无 molang），此处必须当普通块写 v.xbasepos；
        // 只有真 molang 子块才换算进 xbasepos_bone（否则写了也没人读，位移蒸发）。
        const _pid = isBoneMolangDriven(b) ? getBoneParentId(b) : null;
        if (_pid) {
            const _pb = blocks.find(x => x.id === _pid);
            // 双重位移防护：若父块也在本次移动集合里、且父自身也是"骨骼跟随块"（父这次走
            // basepos_bone ⇒ 父的 v.xpos 会变 ⇒ t[父_px] 会带着本块一起走），本块就不能再
            // 单独写偏移量，否则"父带动 + 自己偏移"叠加成 2 倍位移。
            // 反之（父不在集合内，或父是自由块走 basepos 分支、其 v.xpos 不变）本块必须自己写。
            const _pInSet = _pb && idSet.has(_pid);
            const _pMovesXpos = _pb ? !!getBoneParentId(_pb) : false;
            if (_pInSet && _pMovesXpos) {
                refreshBoneFollowers(_pb);
                return; // 靠 t[父_px] 自动跟随，跳过本块
            }
            if (applyWorldDeltaToBoneOffset(b, _pb, worldDelta)) {
                b.refresh(); b.mesh.updateMatrixWorld(true);
                return;
            }
        }
        const M = b.scope.toM();
        const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
        const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
        const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
        // 非动画（静态常量）方块：世界位移 → 局部 basepos 换算用逐因子逆变换（含缩放逆），避免对含
        // extend_scale≈0.0001 的近奇异矩阵整体求逆导致 basepos 爆炸（模型乱飞）。
        const base = new THREE.Vector3(M[10], M[11], M[12]);
        const nb = base.clone().add(worldToBasepos(b, worldDelta));
        setConstVarValue(b, 'v.xbasepos', _r4(nb.x));
        setConstVarValue(b, 'v.ybasepos', _r4(nb.y));
        setConstVarValue(b, 'v.zbasepos', _r4(nb.z));
        b.refresh(); b.mesh.updateMatrixWorld(true);
    });
    // 逐块遍历顺序不定：末尾统一再刷新一次，保证"靠父带动"的骨骼跟随块（上面跳过的）落到最新位置
    refreshBlocksUnderFolder(folderName);
    // 记录骨骼自身的平移偏移量（供骨级关键帧捕获“骨骼位移”）
    const _self = getFolder(folderName);
    if (_self) {
        if (!_self.position) _self.position = [0, 0, 0];
        _self.position = [_r4(_self.position[0] + worldDelta.x), _r4(_self.position[1] + worldDelta.y), _r4(_self.position[2] + worldDelta.z)];
    }
    // 层级平移：父文件夹整体平移 worldDelta，其所有子孙文件夹的枢轴参考点也应同步平移，
    // 否则子文件夹 Gizmo 中心会停留在旧位置（与旋转同理）。
    getDescendantFolderNames(folderName).forEach(dn => {
        const f = getFolder(dn);
        if (!f || !f.pivot || !Array.isArray(f.pivot)) return;
        const p = new THREE.Vector3(f.pivot[0], f.pivot[1], f.pivot[2]).add(worldDelta);
        f.pivot = [_r4(p.x), _r4(p.y), _r4(p.z)];
    });
}
// 文件夹局部 scale/extend 矩阵（不含主旋转与 basepos 平移），文件夹旋转中保持不变
function _blockLocalExtScale(b) {
    const M = b.scope.toM();
    const s = M[6], es = M[7], ex = M[8], ey = M[9];
    const matEsy = new THREE.Matrix4().makeScale(1, es, 1);
    const matEyr = new THREE.Matrix4().makeRotationY(-degToRad(-ey));
    const matExr = new THREE.Matrix4().makeRotationX(-degToRad(ex));
    const matEs = new THREE.Matrix4().makeScale(1, 1, es);
    const matExl = new THREE.Matrix4().makeRotationX(degToRad(ex));
    const matEyl = new THREE.Matrix4().makeRotationY(degToRad(-ey));
    const matS = new THREE.Matrix4().makeScale(s, s, s);
    return matS.clone().multiply(matEyl).multiply(matExl).multiply(matEs).multiply(matExr).multiply(matEyr).multiply(matEsy);
}
// 绕 center 旋转整个文件夹：worldAxis 为【世界空间】旋转轴，degDelta 为角度（度）。
// 将整个文件夹作为刚体绕 center 旋转 R：保持子块枢轴（v.xpos/ypos/zpos）、全局旋转
// （v.rotatex/y/z）、缩放/拉伸不变；仅把旋转烘焙进 v.xrot/yrot/zrot 与 v.xbasepos 等。
// 单方块绕 center 做刚体旋转（绕世界轴 worldAxis 转 degDelta），写回 v.xbasepos + v.xrot（与原逐块烘焙同逻辑）
// writeVar 可覆盖写入通道：顶点捕捉「沿边对齐」传入关键帧 / molang 守卫感知的写入器，其余调用保持原 setConstVarValue
function rotateBlockAroundCenter(b, R, center, writeVar = setConstVarValue) {
    const M = b.scope.toM();
    const rx = M[3], ry = M[4], rz = M[5];
    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
    const G = _blockGlobalRot(b);
    const invG = G.clone().invert();
    const Rloc = new THREE.Matrix4().makeRotationY(degToRad(-ry))
        .multiply(new THREE.Matrix4().makeRotationX(degToRad(rx)))
        .multiply(new THREE.Matrix4().makeRotationZ(degToRad(-rz)));
    const Sext = _blockLocalExtScale(b);
    const W = computeTransformMatrix(M, rX, rY, rZ);
    const O = new THREE.Vector3().setFromMatrixPosition(W);
    const Onew = center.clone().add(O.clone().sub(center).applyMatrix4(R));
    const RlocNew = invG.clone().multiply(R).multiply(G).multiply(Rloc);
    const rhs = Onew.clone().sub(new THREE.Vector3(M[0], M[1], M[2])).applyMatrix4(invG);
    const t1 = rhs.applyMatrix4(new THREE.Matrix4().copy(RlocNew).invert());
    const bNew = t1.applyMatrix4(new THREE.Matrix4().copy(Sext).invert());
    writeVar(b, 'v.xbasepos', _r4(bNew.x));
    writeVar(b, 'v.ybasepos', _r4(bNew.y));
    writeVar(b, 'v.zbasepos', _r4(bNew.z));
    const e = new THREE.Euler().setFromRotationMatrix(RlocNew, 'YXZ');
    const radToDeg = THREE.MathUtils.radToDeg;
    writeVar(b, 'v.xrot', normRotDeg(_r4(radToDeg(e.x))));
    writeVar(b, 'v.yrot', normRotDeg(_r4(-radToDeg(e.y))));
    writeVar(b, 'v.zrot', normRotDeg(_r4(-radToDeg(e.z))));
    b.refresh(); b.mesh.updateMatrixWorld(true);
}

// 由 xrot/yrot/zrot（或 rotatex/y/z）的【实数值】构造旋转矩阵（与 computeTransformMatrix 的
// globalRot/localMat 旋转部分一致）：R = Ry(-ry)·Rx(rx)·Rz(-rz)。区别于 _blockGlobalRot
// （只读 .value，molang 驱动的 rotatex 可能陈旧），这里用 tvnum 实时求值取到最新合成角度。
function _blockGlobalRotVals(rX, rY, rZ) {
    return new THREE.Matrix4().makeRotationY(degToRad(-rY))
        .multiply(new THREE.Matrix4().makeRotationX(degToRad(rX)))
        .multiply(new THREE.Matrix4().makeRotationZ(degToRad(-rZ)));
}

// 骨骼根（无父骨骼的自由根）的旋转必须统一落在 v.xrot（骨骼旋转源）：
// 子块 molang（v.xpos = t.父_xrot + pR·offset、v.rotatex = t.父_xrot + own）与导出都认 v.xrot，
// 而块级 Gizmo 默认写 v.rotatex。若父此前被块级 Gizmo 旋转过（写进 v.rotatex），
// 子块 t.父_xrot 就永远读到 0 → 父转子完全不动（用户报 bug）。
// 故旋转骨骼根前，把 v.rotatex 折叠进 v.xrot 并清零 v.rotatex，使两者一致。
// 仅对「无父骨骼的自由根」折叠：中继根 rotatex 是 molang 表达式（t.父_xrot + own），
// 若被改写成常量 0 会断链，故跳过。
function normalizeBoneRootRotation(b) {
    if (!b || b._boneParent) return;            // 中继根：rotatex 为 molang，勿动
    const rx = Number(b.scope.vars.get('v.rotatex')?.value ?? 0);
    const ry = Number(b.scope.vars.get('v.rotatey')?.value ?? 0);
    const rz = Number(b.scope.vars.get('v.rotatez')?.value ?? 0);
    if (Math.abs(rx) < 1e-6 && Math.abs(ry) < 1e-6 && Math.abs(rz) < 1e-6) return; // 已全在 xrot
    const lx = Number(b.scope.vars.get('v.xrot')?.value ?? 0);
    const ly = Number(b.scope.vars.get('v.yrot')?.value ?? 0);
    const lz = Number(b.scope.vars.get('v.zrot')?.value ?? 0);
    const total = _blockGlobalRotVals(rx, ry, rz).multiply(_blockGlobalRotVals(lx, ly, lz));
    const e = new THREE.Euler().setFromRotationMatrix(total, 'YXZ');
    setConstVarValue(b, 'v.xrot', normRotDeg(_r4(THREE.MathUtils.radToDeg(e.x))));
    setConstVarValue(b, 'v.yrot', normRotDeg(_r4(-THREE.MathUtils.radToDeg(e.y))));
    setConstVarValue(b, 'v.zrot', normRotDeg(_r4(-THREE.MathUtils.radToDeg(e.z))));
    setConstVarValue(b, 'v.rotatex', 0);
    setConstVarValue(b, 'v.rotatey', 0);
    setConstVarValue(b, 'v.rotatez', 0);
    b.refresh();
}
// 块级旋转：若旋转对象是骨骼根（自由根或中继根），按用户算法规范旋转源 = v.rotatex/y/z
// （旋转 Gizmo 就是把世界轴旋转转成骨干的 rotate），故 v.rotatex/y/z 无需重定向，直接写。
// 旧实现曾把 rotate 折叠进 xrot 作为旋转源 —— 那是「子骨骼自旋 / 旋转父骨骼改位置」的元凶，
// 已按规范废弃。返回 null 表示不重定向（直接写原 varName）。
function boneRootRotateVarName(b, varName) {
    if (!b || !isBoneRoot(b)) return null;
    return null; // 骨骼旋转源 = v.rotatex/y/z 本身，无需重定向
}

// 骨骼根旋转核心：把世界旋转 R 施加到骨骼根方块的【骨骼旋转源 v.rotatex/y/z】，
// 使整条骨骼（含所有子块）实时跟随。
// ★ 用户算法规范（2026-08-21）：
//   - 旋转 Gizmo = 把世界轴旋转角度转换为骨干方块的 rotate（v.rotatex/y/z）。
//   - xrot/yrot/zrot 是方块【自身外观旋转】，不参与骨骼链，绝不写。
//   - 位置 xpos 绝不改：旋转父骨骼不该移动父的枢轴（"旋转最高级父骨骼改变枢轴位置/模型乱飞"的根因
//     就是旧实现写 xrot + 反解改写 xpos）。子块位置由 molang（v.xpos = t.父_px + pR·offset）自动绕父枢轴公转。
//   - 世界旋转矩阵 G = Ry(-rotatey)·Rx(rotatex)·Rz(-rotatez)（与 computeTransformMatrix 一致）；
//     施加世界旋转 R → G' = R·G，反解出新 rotatex/y/z 写回。
function rotateBoneRoot(rb, R, center) {
    const radToDeg = THREE.MathUtils.radToDeg;
    const grX = tvnum(rb, 'v.rotatex'), grY = tvnum(rb, 'v.rotatey'), grZ = tvnum(rb, 'v.rotatez');
    const G = _blockGlobalRotVals(grX, grY, grZ);
    const Gnew = R.clone().multiply(G);
    const e = new THREE.Euler().setFromRotationMatrix(Gnew, 'YXZ');
    setConstVarValue(rb, 'v.rotatex', normRotDeg(_r4(radToDeg(e.x))));
    setConstVarValue(rb, 'v.rotatey', normRotDeg(_r4(-radToDeg(e.y))));
    setConstVarValue(rb, 'v.rotatez', normRotDeg(_r4(-radToDeg(e.z))));
    // ★★★ 保持骨干几何中心不漂移（修复"旋转父骨骼时骨骼枢轴改变"）★★★
    //   世界位置 = xpos + G(rotate)·T(局部链)·basepos。G 变 Gnew=R·G 后，若 basepos≠0，
    //   G·basepos 项被 R 旋转 → 几何中心漂移 → 面板"骨骼枢轴"(=blockWorldPos) 改变。
    //   反解补偿：xpos' = Onew − R·(O − xpos)，O=旋转前几何中心、Onew=center+R·(O−center)。
    //   - center=O（Gizmo 绕骨干自身中心旋转）→ Onew=O → 几何中心完全不动
    //   - basepos=0 → O=xpos → xpos'=xpos（只写 rotate，符合用户规范）
    //   - 真根 v.xpos 是常量可直接写；中继根 v.xpos 是 molang 表达式（t[父_px]+pR·xbasepos_bone），
    //     改为在父局部坐标系里调整 xbasepos_bone 抵消漂移（绝不覆盖 molang 表达式）。
    const pid = getBoneParentId(rb);
    if (pid) {
        // 中继根：位置 = xpos(表达式) + G·basepos。xpos 表达式值不变，漂移全来自 G·basepos→R·G·basepos。
        // 补偿到 xbasepos_bone（父局部坐标系，用自身 pR 矩阵 = 父局部→世界）。
        const xposV = new THREE.Vector3(tvnum(rb, 'v.xpos'), tvnum(rb, 'v.ypos'), tvnum(rb, 'v.zpos'));
        const O = blockWorldPos(rb);
        const contrib = O.clone().sub(xposV);                 // G·T·basepos（世界）
        const contribNew = contrib.clone().applyMatrix4(R);   // Gnew·T·basepos
        const drift = contribNew.clone().sub(contrib);        // basepos 项漂移量
        if (Math.abs(drift.lengthSq()) > 1e-8 && center) {
            const pr = (n) => { const v = rb.scope.vars.get('v.' + n); return v ? (Number(v.value) || 0) : 0; };
            const Gp = new THREE.Matrix4().set(
                pr('pR00'), pr('pR01'), pr('pR02'), 0,
                pr('pR10'), pr('pR11'), pr('pR12'), 0,
                pr('pR20'), pr('pR21'), pr('pR22'), 0,
                0, 0, 0, 1
            );
            const driftLocal = drift.clone().applyMatrix4(Gp.clone().invert());
            ['v.xbasepos_bone', 'v.ybasepos_bone', 'v.zbasepos_bone'].forEach((vn, i) => {
                if (!rb.scope.vars.has(vn)) rb.scope.addVar(vn, '0', -100, 100, 0.1);
                setConstVarValue(rb, vn, _r4(tvnum(rb, vn) - driftLocal.getComponent(i)));
            });
        }
    } else if (center) {
        // 真根：直接反解 v.xpos（常量）保持几何中心
        const O = blockWorldPos(rb);
        const xposV = new THREE.Vector3(tvnum(rb, 'v.xpos'), tvnum(rb, 'v.ypos'), tvnum(rb, 'v.zpos'));
        const Onew = center.clone().add(O.clone().sub(center).applyMatrix4(R));
        const d = O.clone().sub(xposV).applyMatrix4(R);
        const xp = Onew.clone().sub(d);
        setConstVarValue(rb, 'v.xpos', _r4(xp.x));
        setConstVarValue(rb, 'v.ypos', _r4(xp.y));
        setConstVarValue(rb, 'v.zpos', _r4(xp.z));
    }
    rb.refresh(); rb.mesh.updateMatrixWorld(true);
    // 刷新全部后代骨骼块：子块 molang（v.rotatex = t.父_xrot + own、v.xpos = t.父_px + pR·offset）
    // 读取父最新 rotate → 实时绕父枢轴公转（纯 molang 跟随，不写任何子块常量）。
    try { refreshBoneFollowers(rb); } catch (err) {}
}

// 编辑骨骼姿态后把当前姿态同步进【最近的】骨骼关键帧（与单方块路径 syncKeyframeFromBlock 对齐）。
// 关键帧窗口打开且该文件夹已有骨骼关键帧时才生效：用户用 Gizmo 调整骨骼 → 帧数据即时更新，
// 播放时就会按新姿态插值（修复“播放没反应”——编辑没进帧数据）。
function syncBoneKeyframeAfterPose(folderName) {
    // 编辑骨骼姿态后把当前姿态同步进【当前播放头所在的关键帧】。
    // 守卫不依赖 keyframeWindowOpen：用户可能只选中文件夹（未打开关键帧窗口）就直接用 Gizmo 旋转，
    // 若此时跳过同步，播放时会被帧数据旧值覆盖 → 旋转“看着转了、一播放就跳回去 / 子骨骼脱节”
    // （用户报：选中第一帧旋转 bone，C 级子骨骼明显偏移脱离 B —— 根因就是这里被 keyframeWindowOpen 挡住）。
    // 只要该文件夹确有骨骼关键帧、且播放头精确落在某个帧时刻，就必须同步，与窗口可见性无关。
    if (!folderName) return;
    const entry = boneKeyframes.get(folderName);
    if (!entry) return;
    const times = Array.from(entry.frames.keys()).sort((a, b) => a - b);
    if (times.length === 0) return;
    // 仅在播放头【恰好落在某个关键帧时间】上时才同步该帧（实时编辑当前帧）。
    // 绝不覆盖“最近”的帧：否则用户「录 t0 初始姿态 → 移到 t1 → 旋转父骨骼 → 录 t1」时，
    // 旋转发生时 t1 尚无帧，会把 t0 覆盖成旋转后姿态 → 两帧相同 → 骨骼动画完全不动
    // （用户反复报告「骨骼自己动自己的/动画做不出来」的根因之一）。
    let hit = null;
    for (const t of times) {
        if (Math.abs(t - keyframeCurrentTime) < 1e-6) { hit = t; break; }
    }
    if (hit === null) return;
    recordBoneKeyframe(folderName, hit);
}

// 绕 center 旋转整个文件夹：worldAxis=世界轴，degDelta=角度。
// 骨骼（文件夹）= molang 骨骼：只旋转根方块，子方块由 bindBone 的 molang 表达式自动跟随
// （整条骨骼绕同一枢轴公转 → 刚体、不散架）。非骨骼文件夹：逐方块烘焙（原逻辑）。
function applyFolderRotate(folderName, worldAxis, degDelta, center) {
    const R = new THREE.Matrix4().makeRotationAxis(worldAxis.clone().normalize(), degToRad(degDelta));
    const boneIds = getBoneBlocksOfFolder(folderName);
    // 判定改为「文件夹有骨干」即骨骼文件夹（用户规范：骨干=骨骼，旋转源=骨干 rotate）。
    // 原判定要求有子块带 _boneParent —— 单块骨骼文件夹（只有骨干）会误走下方刚体烘焙分支，
    // 把旋转写进 xbasepos/xrot（枢轴数据）而非 rotate，导致"旋转时枢轴改变"。有骨干即走骨骼路径。
    // ★ 同理 applyFolderMove：静态文件夹骨骼（有骨干但子块无 molang = 纯分组）绝不能走「只转骨干」
    //   路径 —— 子块没有跟随表达式，转了骨干其余方块原地不动 → 散架。必须走下方刚体逐块旋转。
    const f = getFolder(folderName);
    const _frM = (f && f._backbone) ? getFolderAllCubeIds(folderName).map(id => blocks.find(x => x.id === id)).filter(Boolean) : [];
    const isRealMolangBone = _frM.length > 0 && (_frM.length === 1 || _frM.some(b => isBoneMolangDriven(b)));
    if (isRealMolangBone) {
        // ✛ 真骨骼：仅旋转根方块，子方块靠 molang 跟随（刚体、不散架）。
        // 旋转写入根方块的 xrot（骨骼旋转源），子块的 molang（v.rotatex = t[父_xrot] + own、
        // v.xpos = t[父_px] + pR·offset）会实时跟随 —— 与导出格式一致。
        // 单块骨骼文件夹 boneIds 可能为 null，fallback 到文件夹全部方块。
        const useIds = (boneIds && boneIds.length) ? boneIds : getFolderAllCubeIds(folderName);
        const rootIds = getBoneRootIds(folderName);
        const roots = rootIds.map(id => blocks.find(b => b.id === id)).filter(Boolean);
        let rotatedAny = false;
        if (roots.length === 0 && useIds.length) {
            const fb = blocks.find(b => b.id === useIds[0]);
            if (fb) { rotateBoneRoot(fb, R, center); rotatedAny = true; }
        } else {
            roots.forEach(rb => { rotateBoneRoot(rb, R, center); rotatedAny = true; });
        }
        // 旋转后刷新整条骨骼（含所有后代文件夹方块）：子块 molang 读取父最新 xrot/xpos 实时跟随
        if (rotatedAny) {
            refreshBlocksUnderFolder(folderName);
            /* 【2026-10-19 · 关键帧去文件夹化】原此处调用 syncBoneKeyframeAfterPose(folderName)，已删除 */
        }
        const f = getFolder(folderName);
        // 骨骼文件夹不存储任何数据：枢轴/旋转都由骨干方块实时决定（folderGizmoCenterWorld / folderLocalAxes），
        // 这里绝不维护 f.pivot / f.rotation（陈旧数据会让 Gizmo 与骨干脱节）。
        if (f && !f._backbone) {
            if (!f.rotation) f.rotation = [0, 0, 0];
            const _ax = Math.abs(worldAxis.x) > 0.5 ? 0 : Math.abs(worldAxis.y) > 0.5 ? 1 : 2;
            f.rotation[_ax] = normRotDeg(_r4((f.rotation[_ax] || 0) + degDelta));
            if (f.pivot && Array.isArray(f.pivot)) {
                const p = new THREE.Vector3(f.pivot[0], f.pivot[1], f.pivot[2]);
                const pn = center.clone().add(p.clone().sub(center).applyMatrix4(R));
                f.pivot = [_r4(pn.x), _r4(pn.y), _r4(pn.z)];
            }
        }
        return;
    }
    // 文件夹骨骼（无 molang 绑定，整体刚体旋转）或普通文件夹：整条骨骼 / 整组作为【刚体】逐方块旋转
    const ids = (boneIds && boneIds.length) ? boneIds : getFolderAllCubeIds(folderName);
    ids.forEach(id => {
        const b = blocks.find(x => x.id === id);
        if (b) rotateBlockAroundCenter(b, R, center);
    });
    // ===== 层级烘焙：父文件夹绕 center 做刚体旋转 R，其所有子孙文件夹作为“子骨骼”也须吸收这次旋转 =====
    const _descNames = getDescendantFolderNames(folderName);
    _descNames.forEach(dn => {
        const f = getFolder(dn);
        if (!f) return;
        if (f.pivot && Array.isArray(f.pivot)) {
            const p = new THREE.Vector3(f.pivot[0], f.pivot[1], f.pivot[2]);
            const pn = center.clone().add(p.clone().sub(center).applyMatrix4(R));
            f.pivot = [_r4(pn.x), _r4(pn.y), _r4(pn.z)];
        }
        if (!f.rotation) f.rotation = [0, 0, 0];
        const _ax = Math.abs(worldAxis.x) > 0.5 ? 0 : Math.abs(worldAxis.y) > 0.5 ? 1 : 2;
        f.rotation[_ax] = normRotDeg(_r4((f.rotation[_ax] || 0) + degDelta));
    });
}

// ===== 文件夹 Gizmo 构建：位移箭头（3 轴）+ 旋转弧（3 轴），无缩放、中心小蓝点 =====
function rebuildFolderGizmo(name) {
    const f = getFolder(name);
    const gc = folderGizmoCenterWorld(name);
    if (!f || !gc) { gizmoRoot.visible = false; return; }
    gizmoRoot.visible = true;
    gizmoRoot.position.copy(gc); // 定位到文件夹枢轴世界坐标
    gizmoRoot.quaternion.identity();
    // 隐藏全部方块自带坐标轴（新操作模式）
    if (isNewLayoutMode) blocks.forEach(blk => { if (blk.axisHelper) blk.axisHelper.visible = false; });

    // 旋转弧：始终绕【世界轴】（用户要求：Gizmo 控件始终按世界轴旋转，然后换算为 rotate 变量数值；
    // 不再用 folderLocalAxes 局部轴——骨骼已旋转时局部轴跟着骨骼走，拖"Y 环"Y 值不变，违背直觉）。
    const axes = {
        xAxis: new THREE.Vector3(1, 0, 0),
        yAxis: new THREE.Vector3(0, 1, 0),
        zAxis: new THREE.Vector3(0, 0, 1)
    };
    const arcColors = { x: 0xff3030, y: 0x25d94f, z: 0x2078ff };
    const axisToIdx = { x: 0, y: 1, z: 2 };
    const showRotate = herModes.has('rotate') || herModes.has('centerRotate') || herModes.has('globalRotate') || herModes.has('globalCenterRotate');

    // 中心小蓝点：文件夹“位置”指示（无黄色大球、无缩放手柄）
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x2078ff, depthTest: false, transparent: true, opacity: 0.95 }));
    ball.renderOrder = 998; ball.traverse(o => { o.raycast = () => {}; });
    gizmoRoot.add(ball);

    // 旋转弧：绕文件夹【世界轴】（骨骼文件夹同样始终世界轴；旋转经 applyFolderRotate→rotateBoneRoot
    // 换算进骨干旋转变量 xrot，子块经 molang 跟随，与 ZXY 欧拉顺序的世界轴直觉一致）
    if (showRotate) {
        ['x', 'y', 'z'].forEach(axis => {
            const idx = axisToIdx[axis];
            const d = axis === 'x' ? orthonormalDiscBasis(axes.xAxis, axes.yAxis)
                     : axis === 'y' ? orthonormalDiscBasis(axes.yAxis, axes.zAxis)
                     : orthonormalDiscBasis(axes.zAxis, axes.xAxis);
            const varName = 'folderRot' + axis.toUpperCase();
            const grp = createGizmoRing(arcColors[axis], axis, 2.05, varName, d.z, d.x, d.y, { rotMode: 'origin', priority: 35 });
            grp.group.userData.herFolder = true;
            grp.group.userData.herFolderIdx = idx;
            grp.group.userData.herRotVar = varName;
            grp.pickMeshes.forEach(p => {
                if (p.userData.her) { p.userData.her.folder = true; p.userData.her.folderName = name; p.userData.her.folderIdx = idx; }
            });
            gizmoRoot.add(grp.group);
        });
    }

    // 枢轴箭头（folderPivot）：沿世界轴，拖动即移动骨骼枢轴参考点 f.pivot（模型原地不动）
    if (herModes.has('origin')) {
        const moveColors = { x: 0xff3030, y: 0x25d94f, z: 0x2078ff };
        const moveDirs = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) };
        ['x', 'y', 'z'].forEach(axis => {
            const idx = axisToIdx[axis];
            const d = moveDirs[axis];
            const normal = Math.abs(d.y) > 0.9 ? new THREE.Vector3(0,0,1) : new THREE.Vector3(0,1,0);
            const arrow = makeArrow(d, normal, moveColors[axis], 'folderPivot' + axis.toUpperCase(), 0.012, 0, { visualScale: 1.0, start: 0.42, priority: 30, moveKind: 'origin', axisName: axis });
            arrow.traverse(o => {
                if (o.userData && o.userData.her && o.userData.her.type === 'move') {
                    o.userData.her.folder = true;
                    o.userData.her.folderName = name;
                    o.userData.her.folderIdx = idx;
                    o.userData.her.folderPivot = true;
                    o.userData.her.axis = d.clone();
                    o.userData.her.axisName = axis;
                    o.userData.her.scale = 0.012;
                }
            });
            gizmoArrowGroups.push(arrow);
            gizmoRoot.add(arrow);
        });
    }
    // 位移箭头（folderDisplace）：沿世界轴，拖动即把平移烘焙进所有子级（模型移动、枢轴不变）
    if (herModes.has('base')) {
        const moveColors = { x: 0xffb347, y: 0xc6ff5c, z: 0x49e6ff };
        const moveDirs = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) };
        ['x', 'y', 'z'].forEach(axis => {
            const idx = axisToIdx[axis];
            const d = moveDirs[axis];
            const normal = Math.abs(d.y) > 0.9 ? new THREE.Vector3(0,0,1) : new THREE.Vector3(0,1,0);
            const arrow = makeArrow(d, normal, moveColors[axis], 'folderDisp' + axis.toUpperCase(), 0.012, 0, { visualScale: 1.0, start: 0.78, priority: 31, moveKind: 'base', axisName: axis, mode: 'base' });
            arrow.traverse(o => {
                if (o.userData && o.userData.her && o.userData.her.type === 'move') {
                    o.userData.her.folder = true;
                    o.userData.her.folderName = name;
                    o.userData.her.folderIdx = idx;
                    o.userData.her.folderDisplace = true;
                    o.userData.her.axis = d.clone();
                    o.userData.her.axisName = axis;
                    o.userData.her.scale = 0.012;
                }
            });
            gizmoArrowGroups.push(arrow);
            gizmoRoot.add(arrow);
        });
    }
}

// 文件夹缩放手柄（单轴）：彩色杆 + 锥头 + 命中球；沿 dir 方向从枢轴伸出
function makeFolderScaleHandle(dir, color, idx, name) {
    const group = new THREE.Group();
    const ndir = dir.clone().normalize();
    const dn = ndir.clone();
    const vl = 1.85;
    const mkMat = (o) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: o, side: THREE.DoubleSide });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, vl, 8), mkMat(0.95));
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dn);
    shaft.position.copy(dn.clone().multiplyScalar(vl * 0.5));
    shaft.renderOrder = 996; group.add(shaft);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.42, 14), mkMat(1));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dn);
    cone.position.copy(dn.clone().multiplyScalar(vl + 0.2));
    cone.renderOrder = 997; group.add(cone);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), hitMat());
    hit.position.copy(dn.clone().multiplyScalar(vl * 0.7));
    addPick(hit, { type: 'scale', folder: true, folderName: name, folderIdx: idx, scale: 0.006, priority: 50 });
    group.add(hit);
    return group;
}
// 动态更新 Gizmo 旋转轴细线方向，跟随当前旋转值
function updateGizmoAxisLines(b) {
    const isCenter = herModes.has('centerRotate') || herModes.has('globalCenterRotate');
    const centerOffset = isCenter ? centerOfBlock(b).sub(originOfBlock(b)) : new THREE.Vector3();
    const hasLocal = herModes.has('rotate') || herModes.has('centerRotate');
    const hasGlobal = herModes.has('globalRotate') || herModes.has('globalCenterRotate');
    for (const line of gizmoAxisLines) {
        const axis = line.userData.axisName;
        if (!axis) continue;
        let dir;
        if (line.userData.axisType === 'local' && hasLocal) {
            const la = rotLocalAxesOfBlock(b);
            const dirs = { x: la.xAxis, y: la.yAxis, z: la.zAxis };
            dir = dirs[axis];
        } else if (line.userData.axisType === 'global' && hasGlobal) {
            const basis = globalRotBasisFor(axis);
            dir = basis.z;
        } else {
            continue;
        }
        // 更新线几何体顶点
        const d = dir.clone().normalize();
        const len = 2.5;
        const positions = new Float32Array([
            -d.x * len, -d.y * len, -d.z * len,
             d.x * len,  d.y * len,  d.z * len
        ]);
        line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        line.geometry.attributes.position.needsUpdate = true;
        line.position.copy(centerOffset);
    }
}

function updateRotGizmosLive() {
    const b = selected(); if (!b || !rotArcGroups.length) return;
    gizmoRoot.updateMatrixWorld(true);
    for (const g of rotArcGroups) {
        const axis = g.userData.herRotAxis;
        const plane = g.userData.herRotPlane;
        if (g.userData.herGlobalRot) {
            // 全局旋转：圆环法线 = 按 Ry(-rotatey)*Rx(rotatex)*Rz(-rotatez) 顺序计算的旋转轴方向
            g.position.copy(rotGizmoCenterLocal(b, g.userData.herRotMode));
            const d = globalRotBasisFor(axis);
            orientDiscToBasis(g, d.x, d.y, d.z);
            const wc = new THREE.Vector3();
            g.getWorldPosition(wc);
            const cd = camera.position.clone().sub(wc).normalize();
            g.userData.herFaceAngle = Math.atan2(cd.dot(d.y), cd.dot(d.x));
            if (plane) {
                const visualAngle = rotVisualAngle(g.userData.herRotAxis, g.userData.herRotVar);
                plane.rotation.z = visualAngle + g.userData.herFaceAngle - Math.PI * 0.5;
            }
        } else {
            // 局部旋转：圆环法线 = 方块局部轴
            const d = rotDiscBasisFor(b, axis);
            g.position.copy(rotGizmoCenterLocal(b, g.userData.herRotMode));
            orientDiscToBasis(g, d.x, d.y, d.z);
            const wc = new THREE.Vector3();
            g.getWorldPosition(wc);
            const cd = camera.position.clone().sub(wc).normalize();
            g.userData.herFaceAngle = Math.atan2(cd.dot(d.y), cd.dot(d.x));
            if (plane) {
                const visualAngle = rotVisualAngle(g.userData.herRotAxis, g.userData.herRotVar);
                plane.rotation.z = visualAngle + g.userData.herFaceAngle - Math.PI * 0.5;
            }
        }
    }
    if (activePick && activePick.type === 'rot') updateActiveHighlightPose();
}
function updateMoveGizmosLive(b) {
    b = b || selected(); if (!b || !gizmoRoot.visible) return;
    gizmoRoot.position.copy(originOfBlock(b));
    const co = centerOfBlock(b).sub(originOfBlock(b)), q = quatOfBlock(b);
    // 计算世界轴位移模式的视觉中心位置
    let visualCenter = null;
    if (useWorldAxisDisplacement && herModes.has('base')) {
        const M = b.scope.toM();
        const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
        const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
        const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
        const wm = computeTransformMatrix(M, rX, rY, rZ);
        visualCenter = new THREE.Vector3().setFromMatrixPosition(wm).sub(originOfBlock(b));
    }
    // 非世界轴模式下，实时计算剪切轴方向
    let shearedChanged = false;
    if (!useWorldAxisDisplacement && herModes.has('base')) {
        const curAxes = shearedAxesOfBlock(b);
        for (const g of gizmoArrowGroups) {
            if (!g || !g.userData.usesShearedAxes) continue;
            g.position.copy(co);
            const axisMap = { x: curAxes.x, y: curAxes.y, z: curAxes.z };
            const worldDirMap = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) };
            const ad = axisMap[g.userData.herMoveAxis];
            const wd = worldDirMap[g.userData.herMoveAxis];
            if (ad && wd) {
                g.quaternion.setFromUnitVectors(wd, ad);
            }
            shearedChanged = true;
        }
    }
    if (!shearedChanged) {
        for (const g of gizmoArrowGroups) {
            if (!g) continue;
            if (g.userData.isBaseWorldAxis && visualCenter) {
                g.position.copy(visualCenter);
                g.quaternion.identity();
            } else if (g.userData.herMoveWrapper === 'base') {
                g.position.copy(co);
                g.quaternion.copy(q);
            } else if (g.userData.herMoveWrapper === 'origin') {
                g.position.set(0,0,0);
                g.quaternion.identity();
            }
        }
    }
    if (activePick && activePick.type === 'move') updateActiveHighlightPose();
}
// ===== Gizmo 子控件记忆（设置：新操作模式 → Gizmo子控件记忆）=====
// 开启后把「上次使用的 Gizmo 子控件（含顶点捕捉对齐方式 / 旋转子类型）」写入 localStorage，
// 换项目 / 刷新页面后再次选中方块时回填一次；关闭时不回填（记忆内容保留，下次开启仍可用）。
const GIZMO_SUB_MEM_KEY = 'ui_gizmo_sub_memory';
const GIZMO_SUB_LAST_KEY = 'ui_gizmo_last_sub';
const GIZMO_SUB_MODES = ['origin', 'base', 'rotate', 'centerRotate', 'globalRotate', 'globalCenterRotate', 'scale', 'vtxsnap'];
const GIZMO_SUB_VTX = ['base', 'pivot', 'edge', 'pivotpt', 'len', 'ang'];
var gizmoSubMemoryArmed = true;   // 启动 / 从「无选中」回到「有选中」时允许回填一次
function gizmoSubMemoryOn() { try { return localStorage.getItem(GIZMO_SUB_MEM_KEY) === '1'; } catch (e) { return false; } }
function gizmoSubMemoryLoad() {
    try {
        const o = JSON.parse(localStorage.getItem(GIZMO_SUB_LAST_KEY) || 'null');
        return (o && typeof o === 'object') ? o : null;
    } catch (e) { return null; }
}
// mode=null 时只更新顶点捕捉的对齐方式（切换对齐类型时用）
function gizmoSubMemorySave(mode) {
    try {
        const o = gizmoSubMemoryLoad() || {};
        if (mode && GIZMO_SUB_MODES.includes(mode)) o.mode = mode;
        if (GIZMO_SUB_VTX.includes(vtxSnapMoveType)) o.vtx = vtxSnapMoveType;
        localStorage.setItem(GIZMO_SUB_LAST_KEY, JSON.stringify(o));
    } catch (e) {}
}
// 回填上次使用的子控件（只在普通方块上生效；文件夹走各自的归一化规则）
function restoreGizmoSubMemory() {
    const o = gizmoSubMemoryLoad();
    if (!o || !GIZMO_SUB_MODES.includes(o.mode)) return false;
    if (GIZMO_SUB_VTX.includes(o.vtx)) { vtxSnapMoveType = o.vtx; vtxSnapUpdateBtnTitle(); }
    herModes.clear();
    herModes.add(o.mode);
    if (o.mode === 'rotate' || o.mode === 'centerRotate') currentLocalRotMode = o.mode;
    if (o.mode === 'globalRotate' || o.mode === 'globalCenterRotate') currentGlobalRotMode = o.mode;
    const localBtn = document.getElementById('localRotMenuBtn');
    const globalBtn = document.getElementById('globalRotMenuBtn');
    if (localBtn && (o.mode === 'rotate' || o.mode === 'centerRotate')) {
        setRotMenuBtn(localBtn, o.mode === 'rotate' ? '局部旋转' : '模型旋转',
            o.mode === 'rotate' ? 'rotate-local' : 'rotate-center');
    }
    if (globalBtn && (o.mode === 'globalRotate' || o.mode === 'globalCenterRotate')) {
        setRotMenuBtn(globalBtn, o.mode === 'globalRotate' ? '全局旋转' : '全局模型旋转',
            o.mode === 'globalRotate' ? 'rotate-global' : 'rotate-global-center');
    }
    syncHerModeButtons();
    syncWorldAxisForMultiSelect();
    rebuildGizmo();
    return true;
}

function toggleHerMode(m) {
    // 镜像模式：顶栏「枢轴 / 旋转」两个既有按钮在这里被复用为「位移 / 旋转」切换器。
    // 只切 Gizmo 手柄的构建方式（mirrorSetGizmoMode），不改 herModes，因此不会退出镜像；
    // 缩放 / 顶点捕捉与对称面无关，直接忽略（也不退出镜像）。
    if (mirrorActive && herModes.has('mirror')) {
        if (m === 'origin' || m === 'base') { mirrorSetGizmoMode('move'); return; }
        if (m === 'rotate' || m === 'centerRotate' || m === 'globalRotate' || m === 'globalCenterRotate') {
            mirrorSetGizmoMode('rot');
            return;
        }
        return;
    }
    if (herModes.has(m)) { herModes.delete(m); }
    else {
        herModes.clear(); herModes.add(m);
        // Gizmo子控件记忆：用户选中某个子控件时记下它（连同当前顶点捕捉对齐方式）
        if (gizmoSubMemoryOn()) gizmoSubMemorySave(m);
    }
    // 记录用户最近选择的局部/全局旋转子模式，供 R / Shift+R 快捷键使用
    if (m === 'rotate' || m === 'centerRotate') currentLocalRotMode = m;
    if (m === 'globalRotate' || m === 'globalCenterRotate') currentGlobalRotMode = m;
    syncHerModeButtons();
    // 旋转按钮不显示文字；图标配色随子模式切换（局部=红+蓝 / 模型=粉+青 / 全局=橙+蓝 / 全局模型=橘黄+青，
    // 与各模式 Gizmo 圆环的 x、z 环颜色一致），当前子模式改用 title 悬浮提示
    const localBtn = document.getElementById('localRotMenuBtn');
    const globalBtn = document.getElementById('globalRotMenuBtn');
    if (localBtn && (m === 'rotate' || m === 'centerRotate')) {
        setRotMenuBtn(localBtn, m === 'rotate' ? '局部旋转' : '模型旋转',
            m === 'rotate' ? 'rotate-local' : 'rotate-center');
    }
    if (globalBtn && (m === 'globalRotate' || m === 'globalCenterRotate')) {
        setRotMenuBtn(globalBtn, m === 'globalRotate' ? '全局旋转' : '全局模型旋转',
            m === 'globalRotate' ? 'rotate-global' : 'rotate-global-center');
    }
    syncWorldAxisForMultiSelect(); // 进入/退出位移模式时，按需强制开启世界轴位移
    rebuildGizmo();
}


function clearHerModes() { herModes.clear(); syncHerModeButtons(); resetRotDropdownLabels(); rebuildGizmo(); }
// 更新旋转按钮：按钮不显示文字，只同步「当前子模式 → title 悬浮提示」与「配色图标 key」。
// 绝不整体重写 innerHTML（否则会把图标 span 一并抹掉）。
function setRotMenuBtn(btn, label, iconKey) {
    if (!btn) return;
    if (label) btn.setAttribute('title', label);
    const ic = btn.querySelector('.hmb-icon');
    if (ic && iconKey) ic.setAttribute('data-icon', iconKey);
}
// 清空模式时重置旋转按钮的悬浮提示与图标配色
function resetRotDropdownLabels() {
    setRotMenuBtn(document.getElementById('localRotMenuBtn'), '局部旋转', 'rotate-local');
    setRotMenuBtn(document.getElementById('globalRotMenuBtn'), '全局旋转', 'rotate-global');
}
function updateToolbar(force) {
    syncWorldAxisForMultiSelect(); // 选择集 / 模式变化后，按需强制或恢复世界轴位移
    const ok = !!selected() || !!selectedFolder;
    const tb = document.getElementById('herTransformToolbar');
    if (tb) tb.style.display = (ok && isNewLayoutMode) ? 'flex' : 'none';
    if (ok && isNewLayoutMode) {
        // 确保工具栏容器可见
        const topBar = document.getElementById('newTopBar');
        if (topBar && topBar.style.display === 'none') topBar.style.display = 'flex';
    }
    // 文件夹（骨骼）不允许缩放：只有“选中方块且未选中文件夹”时才显示缩放按钮
    const scaleBtn = document.querySelector('.her-mode-btn[data-mode="scale"]');
    if (scaleBtn) {
        scaleBtn.style.display = (selectedFolder || !selected()) ? 'none' : '';
        // 「两边一角」预设：同一个按钮（缩放入口）在预设方块上改为显示专用控件，提示文案同步
        try {
            const _sb = selected();
            scaleBtn.title = (_sb && plgDetectPreset(_sb)) ? '两边一角' : '缩放';
        } catch (e) { }
    }
    // 顶点捕捉按钮：文件夹 / 未选方块时不可用
    const vtxBtnEl = document.getElementById('vtxSnapMenuBtn');
    if (vtxBtnEl) {
        const wrap = vtxBtnEl.parentElement;
        if (wrap) wrap.style.display = (selectedFolder || !selected()) ? 'none' : '';
    }
    // 文件夹（骨骼）支持「枢轴 / 位移 / 旋转」三种功能（与正常模型一致）：隐藏缩放、局部旋转、全局旋转，
    // 并显示统一的「旋转」按钮（世界轴旋转，无需区分局部/全局）。
    const baseBtnEl = document.querySelector('.her-mode-btn[data-mode="base"]');
    const localRotEl = document.getElementById('localRotMenuBtn');
    const globalRotEl = document.getElementById('globalRotMenuBtn');
    const folderRotEl = document.getElementById('folderRotBtn');
    if (selectedFolder) {
        if (baseBtnEl) baseBtnEl.style.display = '';        // 位移按钮：文件夹下同样可用
        if (localRotEl) localRotEl.style.display = 'none';
        if (globalRotEl) globalRotEl.style.display = 'none';
        if (folderRotEl) folderRotEl.style.display = '';
        // 归一化模式集合：文件夹下只保留 origin / base / rotate（清除 scale 及其余旋转子模式）
        const anyRot = herModes.has('rotate') || herModes.has('centerRotate') || herModes.has('globalRotate') || herModes.has('globalCenterRotate');
        herModes.delete('scale');
        herModes.delete('vtxsnap');   // 文件夹（骨骼）不支持顶点捕捉
        ['centerRotate', 'globalRotate', 'globalCenterRotate'].forEach(m => herModes.delete(m));
        if (anyRot && !herModes.has('rotate')) herModes.add('rotate');
        // 若没有任何可用模式（初次选中文件夹），默认进入「枢轴」模式
        if (!herModes.has('origin') && !herModes.has('base') && !herModes.has('rotate')) herModes.add('origin');
    } else {
        if (baseBtnEl) baseBtnEl.style.display = '';
        if (localRotEl) localRotEl.style.display = '';
        if (globalRotEl) globalRotEl.style.display = '';
        if (folderRotEl) folderRotEl.style.display = 'none';
    }
    // 镜像：对称面模式顶栏只留「枢轴 / 旋转」两个既有按钮（复用它们切换位移 / 旋转手柄）
    if (mirrorActive && herModes.has('mirror')) applyMirrorToolbarUI();
    if (!ok) { clearHerModes(); gizmoSubMemoryArmed = true; return; }
    // Gizmo子控件记忆：启动或从「无选中」回到「有选中」且当前没有任何子控件时，回填一次上次使用项。
    // 文件夹不参与（其模式集合有单独归一化规则），保留 armed 等下次选中普通方块再回填。
    if (gizmoSubMemoryArmed && isNewLayoutMode && !selectedFolder && selected() && herModes.size === 0) {
        // 新手教程期间不回填：教程各步会自行设定 Gizmo 模式，回填会干扰步骤门控
        let tutOn = false;
        try { tutOn = !!tutActive; } catch (e) { /* 初始化早期 TDZ，忽略 */ }
        if (!tutOn) {
            gizmoSubMemoryArmed = false;
            if (gizmoSubMemoryOn()) { try { restoreGizmoSubMemory(); } catch (e) {} }
        }
    }
    // 非新操作模式时强制清除所有 Gizmo 模式，恢复方块自身坐标轴
    if (!isNewLayoutMode && herModes.size > 0) {
        herModes.clear();
        document.querySelectorAll('.her-mode-btn').forEach(b => b.classList.remove('active'));
        blocks.forEach(setBlockAxisHelper);
        rebuildGizmo();
        return;
    }
    if (draggingGizmo) return; // 拖拽中不触发重建，避免闪烁
    if (_kfSystemReady && keyframePlaying) return; // 播放关键帧时禁止重建，避免变量值变化导致 Gizmo 闪烁（用 _kfSystemReady 防止 keyframePlaying 的 TDZ）
    const n = performance.now();
    if (!force && !gizmoDirty && n - lastGizmoCheck < 220) return;
    lastGizmoCheck = n;
    const sig = gizmoSignature();
    if (force || gizmoDirty || sig !== lastGizmoSig) {
        lastGizmoSig = sig; gizmoDirty = false; rebuildGizmo();
        // ★重建后必须立刻按相机距离缩放一次：重建出来的箭头/圆环 scale 是 1，
        //   而真正的屏幕恒定缩放要等下一帧动画里的 syncGizmo 才写入 ⇒ 中间那一帧控件突然放大十几倍，
        //   表现为「控件一直抖 / 尺寸忽大忽小」（用户反馈）。紧跟一次 syncGizmo 即可消除。
        try { syncGizmo(); } catch (e) {}
    }
}
function gizmoSignature() {
    const b = selected();
    if (b) {
        const ns = ['v.xpos','v.ypos','v.zpos','v.xbasepos','v.ybasepos','v.zbasepos','v.xrot','v.yrot','v.zrot','v.scale'];
        return [...herModes].sort().join('|') + '#' + b.id + '#' + (useWorldAxisDisplacement?'W':'') + '#' + ns.map(n => Number(b.scope?.vars?.get(n)?.value??0).toFixed(4)).join(',');
    }
    if (selectedFolder) {
        // 文件夹不存储变换，签名仅用名称（Gizmo 显示为子级烘焙工具）
        return 'folder#' + selectedFolder;
    }
    return 'none';
}
function requestGizmoRefresh() { gizmoDirty = true; }
function syncGizmo() {
    // 镜像模式：Gizmo 属于对称面实体，不走方块通道
    if (mirrorActive && herModes.has('mirror')) {
        if (!mirrorFacePicking) updateMirrorGizmoLive();
        return;
    }
    const b = selected();
    if (b) {
        // 摄像机自适应缩放：使 Gizmo 在屏幕上投影大小恒定（先算系数，供下方连线同步缩放，避免一帧滞后）
        const refDist = 14;
        const camDist = Math.max(0.1, framingDist(originOfBlock(b)));
        const s = camDist / refDist;
        gizmoCamScale = s;   // 供原点→中心连线同步缩放（与 Gizmo 控件同系数）
        updateMoveGizmosLive(b);
        updateOriginCenterLineLive(b);
        if (herModes.has('rotate') || herModes.has('centerRotate')) updateRotGizmosLive();
        if (herModes.has('globalRotate') || herModes.has('globalCenterRotate')) {
            updateRotGizmosLive();
        }
        gizmoArrowGroups.forEach(g => g.scale.set(s, s, s));
        rotArcGroups.forEach(g => g.scale.set(s, s, s));
        gizmoAxisLines.forEach(g => g.scale.set(s, s, s));
        if (activeHighlight) activeHighlight.scale.set(s, s, s);
        // 动态更新旋转轴方向，使其跟随圆环变化
        if (herModes.has('rotate') || herModes.has('centerRotate') || herModes.has('globalRotate') || herModes.has('globalCenterRotate')) {
            updateGizmoAxisLines(b);
        }
        // ex/ey 圆环、es 杆与 scale 角点：每帧按当前矩阵/相机刷新（角点需随 extend 等变量实时贴合方块）
        if (herModes.has('scale') && stretchGizmoRefs) { updateStretchGizmoLive(b); updateScaleDotsLive(b); }
        // 「两边一角」专用控件同样每帧贴合（边长/夹角/姿态任意一路变化都要跟手）
        if (herModes.has('scale') && plgGizmoRefs) updatePlgGizmoLive(b);

    }
    // 文件夹 Gizmo：枢轴【每帧】实时跟随骨干世界位置（folderGizmoCenterWorld 对骨骼文件夹
    // 实时读 blockWorldPos(骨干)）——关键帧播放/缓动时骨骼移动，Gizmo 中心与旋转弧必须跟着走，
    // 否则枢轴停留在 rebuild 时的旧位置（用户报告「缓动时骨骼枢轴显示不是实时的」）。
    // 同时做相机自适应缩放（保持屏幕大小恒定）。
    if (selectedFolder && gizmoRoot.visible) {
        const fc = folderGizmoCenterWorld(selectedFolder);
        if (fc) {
            gizmoRoot.position.copy(fc);
            const center = gizmoRoot.position;
            const camDist = Math.max(0.1, framingDist(center));
            const s = camDist / 14;
            rotArcGroups.forEach(g => g.scale.set(s, s, s));
            gizmoArrowGroups.forEach(g => g.scale.set(s, s, s));
        } else {
            gizmoRoot.visible = false;
        }
    }
    updateToolbar(false);
    // 关键帧播放时，文件夹（尤其是骨骼文件夹）的属性面板数值必须随动画实时刷新
    if (selectedFolder && typeof updateInspectorValues === 'function') updateInspectorValues();
}
function pickRotByScreenDistance(cx, cy) {
    const b = selected();
    const fld = selectedFolder;
    if (!b && !fld) return null;
    if (!rotArcGroups.length) return null;
    if (b && !(herModes.has('rotate')||herModes.has('centerRotate'))) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const radius = 2.05, S = 0, E = Math.PI;
    let best = null;
    const dS = (px,py,ax,ay,bx,by) => { const vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay,l2=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/l2)); return Math.hypot(px-(ax+vx*t),py-(ay+vy*t)); };
    for (const g of rotArcGroups) {
        let axis, vn, d, rm, c;
        if (g.userData.herFolder) {
            if (!fld) continue;
            axis = g.userData.herRotAxis; vn = g.userData.herRotVar; rm = 'origin';
            // 与 rebuildFolderGizmo 一致：文件夹旋转弧始终世界轴
            const na = {
                xAxis: new THREE.Vector3(1, 0, 0),
                yAxis: new THREE.Vector3(0, 1, 0),
                zAxis: new THREE.Vector3(0, 0, 1)
            };
            d = axis === 'x' ? orthonormalDiscBasis(na.xAxis, na.yAxis)
              : axis === 'y' ? orthonormalDiscBasis(na.yAxis, na.zAxis)
              : orthonormalDiscBasis(na.zAxis, na.xAxis);
            c = folderGizmoCenterWorld(fld);
            if (!c) continue;
        } else {
            if (!b) continue;
            axis = g.userData.herRotAxis; vn = g.userData.herRotVar; d = rotDiscBasisFor(b,axis); rm = g.userData.herRotMode||'origin'; c = rotGizmoCenterWorld(b,rm);
        }
        const sp = rotVisualAngle(axis, vn);
        // 采样偏移需与 updateRotGizmosLive 中的 plane.rotation.z 一致：
        // plane.rotation.z = visualAngle + herFaceAngle - Math.PI/2
        // 因此采样起始角 = sp + herFaceAngle - Math.PI/2
        const offset = (g.userData.herFaceAngle || 0) - Math.PI * 0.5;
        let prev = null, md = Infinity;
        for (let i=0;i<=64;i++) { const a=S+(E-S)*i/64+sp+offset, wp=c.clone().addScaledVector(d.x,Math.cos(a)*radius).addScaledVector(d.y,Math.sin(a)*radius), sp2=wp.project(camera), p={x:(sp2.x*0.5+0.5)*rect.width+rect.left,y:(-sp2.y*0.5+0.5)*rect.height+rect.top}; if(prev) md=Math.min(md,dS(cx,cy,prev.x,prev.y,p.x,p.y)); prev=p; }
        if (md<14 && (!best || md<best.distance)) best = {distance:md, object:{userData:{her:{type:'rot',varName:vn,scale:1,axis,rotMode:rm,priority:80,axisNormal:d.z.clone(),xBasis:d.x.clone(),yBasis:d.y.clone(),radius,end:Math.PI, folder: !!g.userData.herFolder, folderName: fld||null, folderIdx: g.userData.herFolderIdx||0},herPriority:80}}};
    }
    return best;
}
// ex/ey 圆环与 es 杆：用「屏幕距离」统一拾取，保证三者判定区域互不打架（谁离光标最近就选谁）
function pickStretchByScreenDistance(cx, cy) {
    const b = selected();
    if (!b || !herModes.has('scale') || !stretchGizmoRefs) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const toScreen = (wp) => { const p = wp.clone().project(camera); return { x: (p.x*0.5+0.5)*rect.width+rect.left, y: (-p.y*0.5+0.5)*rect.height+rect.top }; };
    const dS = (px,py,ax,ay,bx,by) => { const vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay,l2=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/l2)); return Math.hypot(px-(ax+vx*t),py-(ay+vy*t)); };
    const origin = originOfBlock(b);
    const oS = toScreen(origin);
    let best = null;
    // es 拉伸杆：原点 → 杆尖 的线段距离（杆长要乘控件尺寸系数，否则拾取区域与视觉杆尖错位）
    const wd = stretchGizmoRefs.worldDir;
    const es = Number(b.scope.vars.get('v.extend_scale')?.value ?? 1);
    const len = THREE.MathUtils.clamp(0.9 + Math.abs(es)*0.8, 0.9, 6) * (stretchGizmoRefs.sizeScale ?? 1);
    const tip = origin.clone().add(wd.clone().multiplyScalar(len));
    const tipS = toScreen(tip);
    const dRod = dS(cx, cy, oS.x, oS.y, tipS.x, tipS.y);
    if (dRod < 24 && (!best || dRod < best.distance)) best = { distance: dRod, type:'stretch', varName:'v.extend_scale', axis: wd.clone(), priority: 70 };
    // ex / ey 圆环：采样半圆弧，取弧上离光标最近的距离
    const ringDist = (ring, varName, axis, priority) => {
        const gp = new THREE.Vector3(); ring.group.getWorldPosition(gp);
        const wq = ring.group.getWorldQuaternion(new THREE.Quaternion());
        const ws = ring.group.getWorldScale(new THREE.Vector3());
        const wx = new THREE.Vector3(1,0,0).applyQuaternion(wq);
        const wy = new THREE.Vector3(0,1,0).applyQuaternion(wq);
        const wz = new THREE.Vector3(0,0,1).applyQuaternion(wq);
        const radius = ring.radius * ws.x; // 乘父级缩放，使采样半径=实际世界半径
        const sp = rotVisualAngle(axis, varName);
        const offset = (ring.faceAngle || 0) - Math.PI*0.5;
        let prev = null, md = Infinity;
        for (let i=0;i<=48;i++) {
            const a = Math.PI*i/48 + sp + offset;
            const wp = gp.clone().addScaledVector(wx, Math.cos(a)*radius).addScaledVector(wy, Math.sin(a)*radius);
            const p = toScreen(wp);
            if (prev) md = Math.min(md, dS(cx, cy, prev.x, prev.y, p.x, p.y));
            prev = p;
        }
        if (md < 14 && (!best || md < best.distance)) best = { distance: md, type:'rot', varName, axis, priority, axisNormal: wz.clone(), xBasis: wx.clone(), yBasis: wy.clone() };
    };
    ringDist(stretchGizmoRefs.eyRing, 'v.extend_yrot', 'y', 60);
    ringDist(stretchGizmoRefs.exRing, 'v.extend_xrot', 'x', 55);
    if (!best) return null;
    const meta = { type: best.type, varName: best.varName, scale: 0.012, axis: best.axis, rotMode: 'origin', priority: best.priority };
    if (best.axisNormal) { meta.axisNormal = best.axisNormal; meta.xBasis = best.xBasis; meta.yBasis = best.yBasis; }
    return { distance: best.distance, object: { userData: { her: meta, herPriority: best.priority } } };
}
function pickGizmo(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const gp = new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1);
    const gr = new THREE.Raycaster(); gr.setFromCamera(gp, camera);
    const hits = gr.intersectObjects(pickables, true);
    const ranked = hits.map(h => { let o = h.object; while(o&&!o.userData?.her&&o.parent) o=o.parent; return o&&o.userData?.her ? {object:o, distance:h.distance, meta:o.userData.her, priority:o.userData.herPriority||0} : null; }).filter(Boolean);
    const rf = pickRotByScreenDistance(e.clientX, e.clientY);
    if (rf) ranked.push({object:rf.object, distance:rf.distance, meta:rf.object.userData.her, priority:rf.object.userData.herPriority||60});
    const sf = pickStretchByScreenDistance(e.clientX, e.clientY);
    if (sf) ranked.push({object:sf.object, distance:sf.distance, meta:sf.object.userData.her, priority:sf.object.userData.herPriority||60});
    const s = (a,b) => b.priority-a.priority || a.distance-b.distance;
    const dr = ranked.filter(h => h.meta.type !== 'input');
    return dr.length ? dr.sort(s)[0].object : (ranked.sort(s)[0]?.object || null);
}
function beginGizmoDrag(cx, cy, ev) {
    if (activePick || pendingInputPick) return false;
    if (ev?.target?.closest && ev.target.closest('#her-transform-toolbar')) return false;
    const obj = pickGizmo({clientX:cx, clientY:cy});
    if (!obj) return false; const meta = obj.userData.her; if (!meta) return false;
    // 立即禁用 OrbitControls，防止其响应此次点击导致摄像机漂移
    controls.enabled = false; if(ev) ev.preventDefault();
    // 镜像：对称面实体的手柄 —— 不走方块变量通道，直接改 mirrorPlanePos / mirrorPlaneQuat
    if (meta.mirrorPlane) {
        activePick = Object.assign({}, meta, {_hitObj:obj});
        activePick.centerWorld = mirrorPlanePos.clone();   // 旋转角计算以面锚点为中心
        lastPX = cx; lastPY = cy;
        if (activePick.type === 'rot') activePick.lastAngle = screenAngleFor(activePick, cx, cy);
        draggingGizmo = true; dragNeedsRebuild = false;
        captureGizmoDeltaBaseline();   // 与方块/文件夹拖拽一致：显示增量 HUD（标题「对称面位移 / 对称面旋转」）
        resetGizmoPrecAccum();
        if (ev && ev.pointerId != null) { try { renderer.domElement.setPointerCapture(ev.pointerId); } catch (_) {} }
        return true;
    }
    if (meta.type === 'input') { pendingInputPick = {varName:meta.varName, x:cx, y:cy, lastX:cx, lastY:cy, moved:false, t:performance.now()}; return true; }
    activePick = Object.assign({}, meta, {_hitObj:obj}); lastPX = cx; lastPY = cy;
    // 记住「最初抓到的手柄」唯一 id：Gizmo 拖拽中会重建（scale 会移动角点），
    // refreshActivePickMeta 必须按它找回同一个手柄，而不是按 type+varName 找到第一个同名牌。
    if (obj && obj.userData && obj.userData.herPickId != null) activePick._pickId = obj.userData.herPickId;
    // ★ 单选路径（selectBlock）只写 selectedBlock、从不写 selectedBlocksSet，
    //   而 changeVar / applyOriginRotateDelta / applyCenterRotateDelta 第一行都在集合为空时静默 return
    //   → 表现为「Gizmo 显示正常、拖拽也能开始（activePick 已设置）、但方块永远不动」。
    //   普通用户点画布选中走 toggleBlockSelection 会写集合所以无感。
    //   抓住 Gizmo = 明确要编辑该块，与真实点击选择语义对齐：开始拖拽即补进集合。
    const _grabbed = selected();
    if (_grabbed && !selectedBlocksSet.has(_grabbed)) selectedBlocksSet.add(_grabbed);
    // 拉伸轴：记录当前世界方向，供拖拽时沿轴投影
    if (activePick.type === 'stretch' && stretchGizmoRefs) activePick.axis = (stretchGizmoRefs.worldDir || new THREE.Vector3(0,0,1)).clone();
    // 缩放角点：轴方向 = 角点相对 Gizmo 中心的世界径向（随方块旋转/拉伸实时正确，拖拽向外即放大）
    if (activePick.type === 'scale' && obj) {
        const _ctr = new THREE.Vector3(); gizmoRoot.getWorldPosition(_ctr);
        const _wp = new THREE.Vector3(); obj.getWorldPosition(_wp);
        const _ax = _wp.sub(_ctr);
        if (_ax.lengthSq() > 1e-9) activePick.axis = _ax.normalize().clone();
    }
    // 两边一角的夹角圆环交给 plgOverlayDown 处理，这里不再初始化
    draggingGizmo = true; dragNeedsRebuild = false; lastDragRebuild = 0;
    captureGizmoDeltaBaseline();   // 记录拖拽起点，用于实时显示增量
    resetGizmoPrecAccum();         // 精度取整：清零本次拖拽的原始/已下发增量累计
    // 拖拽起点即抢占指针：保证鼠标移动到面板/工具栏上方或移出画布时，move/up 事件仍持续送达画布，
    // 避免 Gizmo 拖拽中途丢失事件而“改不动数据”；同时抢占后浏览器不会再派发 pointerleave，
    // 也就不会触发下面“离开画布即结束拖拽”的提前终止分支。
    if (ev && ev.pointerId != null) { try { renderer.domElement.setPointerCapture(ev.pointerId); } catch (_) {} }
    // 世界轴位移模式：预先计算世界矩阵及其逆矩阵，用于将世界空间增量转换到局部 basepos 空间
    if (activePick.mode === 'base') {
        const b = selected();
        if (b) {
            const M = b.scope.toM();
            const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
            const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
            const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
            const worldMat = computeTransformMatrix(M, rX, rY, rZ);
            activePick.w0 = new THREE.Vector3().setFromMatrixPosition(worldMat);
            const A3 = new THREE.Matrix3().setFromMatrix4(worldMat);
            activePick.Ainv = new THREE.Matrix3().copy(A3).invert();
        }
    }
    // 枢轴不联动模式：拖拽原点箭头时记录 w₀ 和 A⁻¹，用于换算 basepos 保持模型位置不变
    if (!pivotLinkModel && herModes.has('origin') && activePick.type === 'move' && activePick.varName && !activePick.varName.includes('basepos')) {
        const b = selected();
        if (b) {
            const M = b.scope.toM();
            const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
            const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
            const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
            const worldMat = computeTransformMatrix(M, rX, rY, rZ);
            activePick.w0 = new THREE.Vector3().setFromMatrixPosition(worldMat);
            const A3 = new THREE.Matrix3().setFromMatrix4(worldMat);
            activePick.Ainv = new THREE.Matrix3().copy(A3).invert();
        }
    }
    if (meta.folder) clearActiveHighlight(); else makeActiveHighlight(activePick);
    if (activePick.type === 'rot') activePick.lastAngle = screenAngleFor(activePick, cx, cy);
    return true;
}
// 骨骼文件夹平移（统一改写骨干 v.xpos，与单方块枢轴手柄同构）：
//   - 联动开启：整体平移骨骼——骨干 v.xpos += Δ（basepos 不变 → 网格随之走），
//     molang 子块经 t[父_px] 自动跟随，静态子块独立需手动平移其 v.xpos。
//   - 联动关闭：只移枢轴锚点（骨干 v.xpos += Δ），basepos 反向补偿使骨干网格原地不动；
//     molang 子块反向补偿 xbasepos_bone 使其视觉原地不动；静态子块独立、不受影响。
//   ★ 必须用此函数（而非 applyFolderMove 的刚体分支）：applyFolderMove 对静态骨骼文件夹写的是
//     xbasepos（网格动、v.xpos 不动），会导致 Gizmo 手柄（锚定 v.xpos）不跟随 → 拖不动。
function moveBoneFolderPivot(folderName, worldDelta, linkModel) {
    const f = getFolder(folderName);
    if (!f || !f._backbone) return false;
    const bb = folderBackboneBlock(f);
    if (!bb) return false;
    // ★【2026-10-24】新绑定统一后骨干 pos 就是自身枢轴（含局部轴绑定），枢轴手柄照常可拖
    const newPivot = new THREE.Vector3(tvnum(bb, 'v.xpos'), tvnum(bb, 'v.ypos'), tvnum(bb, 'v.zpos')).add(worldDelta);
    if (linkModel) {
        setConstVarValue(bb, 'v.xpos', _r4(newPivot.x));
        setConstVarValue(bb, 'v.ypos', _r4(newPivot.y));
        setConstVarValue(bb, 'v.zpos', _r4(newPivot.z));
        bb.refresh();
        getFolderAllCubeIds(folderName).forEach(id => {
            if (id === bb.id) return;
            const cb = blocks.find(x => x.id === id);
            if (!cb) return;
            if (isBoneMolangDriven(cb)) { cb.refresh(); }
            else {
                setConstVarValue(cb, 'v.xpos', _r4(tvnum(cb, 'v.xpos') + worldDelta.x));
                setConstVarValue(cb, 'v.ypos', _r4(tvnum(cb, 'v.ypos') + worldDelta.y));
                setConstVarValue(cb, 'v.zpos', _r4(tvnum(cb, 'v.zpos') + worldDelta.z));
                cb.refresh();
            }
        });
        refreshBlocksUnderFolder(folderName);
        /* 【2026-10-19 · 关键帧去文件夹化】原此处调用 syncBoneKeyframeAfterPose(folderName)，已删除 */
    } else {
        // 联动关闭：只移枢轴锚点，basepos 补偿使模型原地不动。
        // 方针1：操作换算到其下【所有模型】——骨干与每个子块都平移枢轴锚点 v.xpos 并补偿各自 basepos，
        // 模型视觉原地不动、但"枢轴已移动"。molang 子块经 xbasepos_bone 反向补偿；静态子块经 setPivotKeepingModel。
        setPivotKeepingModel(bb, newPivot);
        getFolderAllCubeIds(folderName).forEach(id => {
            if (id === bb.id) return;
            const cb = blocks.find(x => x.id === id);
            if (!cb) return;
            if (isBoneMolangDriven(cb)) {
                // ★【2026-10-24】新绑定统一后所有 molang 子块都以 pos 为枢轴基准，反向补偿同样落在 bone 偏移
                applyWorldDeltaToBoneOffset(cb, bb, worldDelta.clone().multiplyScalar(-1));
            } else {
                const cp = new THREE.Vector3(tvnum(cb, 'v.xpos'), tvnum(cb, 'v.ypos'), tvnum(cb, 'v.zpos')).add(worldDelta);
                setPivotKeepingModel(cb, cp);
            }
        });
        refreshBlocksUnderFolder(folderName);
    }
    if (!f.position) f.position = [0, 0, 0];
    f.position = [_r4(f.position[0] + worldDelta.x), _r4(f.position[1] + worldDelta.y), _r4(f.position[2] + worldDelta.z)];
    return true;
}
// 骨骼文件夹【位移】手柄（folderDisplace）专用：整体平移骨骼的网格，【绝不写任何 v.xpos/ypos/zpos】。
// ★ 用户算法规范（2026-09-12）：位移改 basepos 通道，枢轴（pos）只有枢轴手柄才能改——
//   旧实现把位移手柄也转发进 moveBoneFolderPivot（写骨干 v.xpos），位移一动枢轴就跑，属于搞错通道。
//   - 根/骨干（无父骨骼）：世界位移经 worldToBasepos 换算进自身 v.xbasepos/y/z
//     （网格动、枢轴锚点 v.xpos 不动 → Gizmo 手柄仍锚在原枢轴上，与普通文件夹位移手柄一致）；
//   - molang 绑定子块：其 v.xpos 是 molang（t.父_px + pR·offset），t.父_px 不变 →
//     必须换算进 xbasepos_bone（applyWorldDeltaToBoneOffset），子块枢轴与网格随骨骼整体刚体平移；
//     每个链上枢轴都平移同一个 worldDelta（pR⁻¹ 换算到各自父局部），相对关系不变、不散架；
//   - 静态子块（纯分组、非 molang）：与普通刚体一致，直接烘焙 v.xbasepos。
// 关键帧侧天然兼容：骨级关键帧分开捕根的 xpos（枢轴）与 xbasepos（位移），✛ 子块的自驱动通道
// 含 xbasepos_bone —— 位移落在会被录制/回放的通道上，不会丢。
function applyBoneFolderDisplace(folderName, worldDelta) {
    const f = getFolder(folderName);
    if (!f || !f._backbone) return false;
    let ids = getBoneBlocksOfFolder(folderName);
    if (!ids || !ids.length) ids = getFolderAllCubeIds(folderName);
    ids.forEach(id => {
        const b = blocks.find(x => x.id === id);
        if (!b) return;
        // molang 绑定块：位移换算进 xbasepos_bone（父局部坐标系），枢轴随骨骼刚体平移
        const _pid = isBoneMolangDriven(b) ? getBoneParentId(b) : null;
        if (_pid) {
            const _pb = blocks.find(x => x.id === _pid);
            if (_pb && applyWorldDeltaToBoneOffset(b, _pb, worldDelta)) {
                b.refresh(); b.mesh.updateMatrixWorld(true);
                return;
            }
        }
        // 根骨干 / 静态块：位移烘焙进自身 basepos（枢轴 v.xpos 不动）
        const M = b.scope.toM();
        const base = new THREE.Vector3(M[10], M[11], M[12]);
        const nb = base.clone().add(worldToBasepos(b, worldDelta));
        setConstVarValue(b, 'v.xbasepos', _r4(nb.x));
        setConstVarValue(b, 'v.ybasepos', _r4(nb.y));
        setConstVarValue(b, 'v.zbasepos', _r4(nb.z));
        b.refresh(); b.mesh.updateMatrixWorld(true);
    });
    // 末尾统一刷新：molang 子块按最新偏移实时跟随
    refreshBlocksUnderFolder(folderName);
    syncBoneKeyframeAfterPose(folderName);
    if (!f.position) f.position = [0, 0, 0];
    f.position = [_r4(f.position[0] + worldDelta.x), _r4(f.position[1] + worldDelta.y), _r4(f.position[2] + worldDelta.z)];
    return true;
}
function moveGizmoDrag(cx, cy, ev) {
    if (pendingInputPick) { pendingInputPick.lastX=cx; pendingInputPick.lastY=cy; if(Math.hypot(cx-pendingInputPick.x,cy-pendingInputPick.y)>10) pendingInputPick.moved=true; if(ev) ev.preventDefault(); return true; }
    if (!activePick) return false;
    const dx = cx-lastPX, dy = cy-lastPY; lastPX=cx; lastPY=cy;
    // 镜像：对称面手柄（位移箭头平移面锚点 / 旋转圆环绕世界轴转面）
    if (activePick.mirrorPlane) {
        if (activePick.mirrorPlane === 'move') {
            const a = screenAxis(activePick);
            const d = quantizeDragDelta((dx * a.x + dy * a.y) * activePick.scale);
            if (Math.abs(d) > 1e-8) {
                mirrorPlanePos.addScaledVector(activePick.axis, d);
                mirrorUpdatePlane();
                mirrorUpdatePreviews();
                mirrorUpdateBubble();
            }
        } else {
            const na = screenAngleFor(activePick, cx, cy);
            let da = na - (Number.isFinite(activePick.lastAngle) ? activePick.lastAngle : na);
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            activePick.lastAngle = na;
            const dd = quantizeDragDelta(THREE.MathUtils.radToDeg(da));
            if (Math.abs(dd) > 1e-5) {
                const n = activePick.axisNormal.clone().normalize();
                const q = new THREE.Quaternion().setFromAxisAngle(n, THREE.MathUtils.degToRad(dd));
                mirrorPlaneQuat.premultiply(q).normalize();
                mirrorUpdatePlane();
                mirrorUpdatePreviews();
                mirrorUpdateBubble();
            }
        }
        updateGizmoDeltaHud(cx, cy);   // 实时显示对称面增量（与方块拖拽同一套 HUD）
        if (ev) ev.preventDefault();
        return true;
    }
    // 文件夹「枢轴 / 位移」手柄：由 activePick.folderPivot / folderDisplace 区分两种语义
    if (activePick.type === 'move' && activePick.folder) {
        // ★ 用户拖动文件夹 Gizmo = 明确的骨骼编辑意图：文件夹若有方块但还没骨干，立即指定一个。
        //   否则 applyFolderMove/applyFolderRotate 走"普通分组刚体烘焙"分支（无 molang 跟随），
        //   用户期望的"父骨骼带动子骨骼"不会发生（用户报：Gizmo 初次编辑完全无效、父骨骼自己动
        //   自己的没带子骨骼转 —— 根因就是目标文件夹没设骨干/没绑骨）。
        //   只在这里补（不污染 selectFolder）：点"归位枢轴到骨骼"等工具按钮不触发，工具仍可用。
        const f = getFolder(activePick.folderName);
        if (!f) return true;
        // ★ 拖动文件夹 Gizmo = 明确骨骼编辑意图。若该文件夹还不是骨骼（无骨干），用【全量 force】同步：
        //   不只给本文件夹设骨干，而是给整棵文件夹树（含所有后代子文件夹）都设骨干 + 按 parentName 绑定，
        //   否则子文件夹没骨干时第 2 步 `if (!fBack) continue` 跳过 → 父旋转带不动子骨骼
        //   （用户报：父骨骼自己动自己的，根本没带着子骨骼转）。
        if (!f._backbone) {
            syncFolderBoneHierarchy(null, { force: true });
        }
        const a = screenAxis(activePick);
        const deltaS = quantizeDragDelta((dx * a.x + dy * a.y) * activePick.scale);   // 精度取整
        const worldDelta = (activePick.axis && activePick.axis.clone)
            ? activePick.axis.clone().multiplyScalar(deltaS)
            : new THREE.Vector3(0, 0, 0);
        // 骨骼文件夹：枢轴=骨干方块实时位置，不存 f.pivot 数据。
        // 分两种语义（与单方块「枢轴联动模型」开关一致）：
        //   - 枢轴手柄（folderPivot）：moveBoneFolderPivot 改骨干 v.xpos（枢轴锚点）。
        //     联动开启：整体平移骨骼（骨干+跟随块刚体平移，模型随枢轴一起走）；
        //     联动关闭：只移枢轴锚点，basepos 反向补偿使骨干网格与所有子块视觉原地不动。
        //   - 位移手柄（folderDisplace）：★ 用户算法规范（2026-09-12）——位移写 basepos 通道
        //     （根/静态块 → v.xbasepos；molang 子块 → xbasepos_bone），【绝不写 v.xpos】；
        //     枢轴（pos）只有枢轴手柄能改。手柄锚定 v.xpos，位移后原地不动（与普通文件夹一致）。
        //   ★ 旧实现把两种手柄都转发进 moveBoneFolderPivot —— 拖位移也改 v.xpos，
        //     位移一动枢轴就跑（用户报"位移 Gizmo 搞错了，它不该改 pos 而该改 basepos"）。
        const isBoneFld = !!(f._backbone);
        if (isBoneFld) {
            if (activePick.folderPivot) {
                moveBoneFolderPivot(activePick.folderName, worldDelta, pivotLinkModel);
            } else {
                applyBoneFolderDisplace(activePick.folderName, worldDelta);
            }
            // 手柄永远锚定在枢轴锚点（= 骨干 v.xpos）：枢轴手柄拖完枢轴已平移、手柄跟随；
            // 位移手柄不改 v.xpos、手柄原地不动（模型整体走、枢轴留在原地）
            const bb = folderBackboneBlock(f);
            if (bb) gizmoRoot.position.set(tvnum(bb, 'v.xpos'), tvnum(bb, 'v.ypos'), tvnum(bb, 'v.zpos'));
            dragNeedsRebuild = true;
            updateInspectorValues();
            updateGizmoDeltaHud(cx, cy);
            if (ev) ev.preventDefault();
            return true;
        }
        if (!f.pivot) {
            // 普通文件夹：仍允许通过拖动设置 f.pivot（用户规范的"枢轴工具"对普通分组合法）。
            const c = folderGizmoCenterWorld(activePick.folderName);
            f.pivot = c ? [c.x, c.y, c.z] : [0, 0, 0];
        }
        if (activePick.folderPivot) {
            const np = new THREE.Vector3(f.pivot[0], f.pivot[1], f.pivot[2]).add(worldDelta);
            f.pivot = [np.x, np.y, np.z];
            if (pivotLinkModel) {
                // 枢轴联动模型：移动枢轴时连带着模型一起走（枢轴与模型同时平移、相对关系不变），
                // 与单方块「枢轴」模式 pivotLinkModel=true 的行为完全一致。关闭则该手柄只移枢轴、模型原地不动。
                applyFolderMove(activePick.folderName, worldDelta);
            }
            gizmoRoot.position.copy(np); // Gizmo 中心 = 新枢轴，手柄实时跟随
        } else {
            // 位移手柄：强制世界轴，只把位移烘焙进所有子级方块的 basepos（模型移动、枢轴 f.pivot 不变），
            // 子文件夹的枢轴参考点随整组平移（保持层级 Gizmo 中心一致），见 applyFolderMove 内。
            applyFolderMove(activePick.folderName, worldDelta);
            gizmoRoot.position.copy(new THREE.Vector3(f.pivot[0], f.pivot[1], f.pivot[2]));
        }
        dragNeedsRebuild = true;
        updateInspectorValues(); // 拖动过程中实时刷新面板数值（否则要等松手才更新）
        updateGizmoDeltaHud(cx, cy);
        if (ev) ev.preventDefault();
        return true;
    }
    if (activePick.type === 'rot') {
        const na = screenAngleFor(activePick, cx, cy);
        let da = na-(Number.isFinite(activePick.lastAngle)?activePick.lastAngle:na); while(da>Math.PI) da-=Math.PI*2; while(da<-Math.PI) da+=Math.PI*2;
        if (!Number.isFinite(da)||Math.abs(da)<1e-6) { if(Math.hypot(dx,dy)>0.01) da=(Math.abs(dx)>=Math.abs(dy)?dx:-dy)*0.01; }
        activePick.lastAngle = na;
        const sign = activePick.axis==='x'?-1:1, bd = THREE.MathUtils.radToDeg(da)*sign;
        let dd = quantizeDragDelta(-bd);   // 精度取整（旋转按角度步长）
        if (Math.abs(dd) > 1e-5) {
            if (activePick.folder) {
                // ★ 用户拖动文件夹旋转 Gizmo = 明确骨骼编辑意图。文件夹不是骨骼则全量 force 同步
                //   （给整棵文件夹树设骨干 + 按 parentName 绑定，父旋转才能带动子骨骼）。
                const rf = getFolder(activePick.folderName);
                if (rf && !rf._backbone) {
                    syncFolderBoneHierarchy(null, { force: true });
                }
                // 文件夹旋转弧始终绕【世界轴】：拖 X/Y/Z 环 = 绕世界 X/Y/Z 旋转。
                // 骨骼文件夹经 applyFolderRotate→rotateBoneRoot 把世界旋转换算进骨干旋转变量
                // （RlocNew = G⁻¹·R·G·Rloc，写 xrot），子块经 molang 实时跟随；
                // ZXY 顺序下绕世界 Y 旋转 → yrot 直接变化，符合直觉。
                const worldAxis = (activePick.folderIdx === 0) ? new THREE.Vector3(1, 0, 0)
                    : (activePick.folderIdx === 1) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
                // X 轴旋转已与鼠标同向（与单方块一致）；Y/Z 轴此前符号相反，取反以匹配鼠标拖动方向
                const folderDd = activePick.folderIdx === 0 ? dd : -dd;
                const gc = folderGizmoCenterWorld(activePick.folderName);
                if (gc) applyFolderRotate(activePick.folderName, worldAxis, folderDd, gc);
                // 累计骨骼旋转增量（边转边烘焙，故为增量数据；按世界轴分量累加，便于实时显示）。
                // 骨骼文件夹不存数据，跳过 f.rotation（其旋转=骨干方块实时旋转）。
                const _ff = getFolder(activePick.folderName);
                if (_ff && !_ff._backbone) { if (!_ff.rotation) _ff.rotation = [0, 0, 0]; _ff.rotation[activePick.folderIdx] = _r4((_ff.rotation[activePick.folderIdx] || 0) + folderDd); }
                dragNeedsRebuild = true; // 拖拽结束统一重建，弧随文件夹朝向贴合
            } else if (activePick.rotMode==='center') applyCenterRotateDelta(activePick.varName,dd);
            else applyOriginRotateDelta(activePick.varName,dd);
        }
        updateOriginCenterLineLive(selectedBlock);
        if (!activePick.folder) updateRotGizmosLive();
        // ex/ey 旋转环拖拽时实时刷新拉伸轴方向
        if (activePick.varName === 'v.extend_xrot' || activePick.varName === 'v.extend_yrot') updateStretchGizmoLive(selected());
    } else if (activePick.type === 'move' && activePick.mode === 'base') {
        // 位移模式：每帧根据当前方块状态重新计算变换矩阵，确保 Ainv 和轴方向始终正确
        const b = selected();
        if (b) {
            // 保证被拖动的块在 selectedBlocksSet 内：changeVar 第一行会在集合为空时直接 return，
            // 若某些选择路径（关键帧/组编辑态、或集合未含该块）没把块加进集合，块级位移 Gizmo 会静默失效。
            // 抓 Gizmo 即代表要编辑该块，与真实点击选择（toggleBlockSelection）语义一致，不改变多选。
            if (!selectedBlocksSet.has(b)) selectedBlocksSet.add(b);
            const M = b.scope.toM();
            const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
            const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
            const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
            const worldMat = computeTransformMatrix(M, rX, rY, rZ);
            activePick.w0 = new THREE.Vector3().setFromMatrixPosition(worldMat);
            const A3 = new THREE.Matrix3().setFromMatrix4(worldMat);
            activePick.Ainv = new THREE.Matrix3().copy(A3).invert();
            // 非世界轴模式：更新轴方向匹配当前剪切轴
            if (!useWorldAxisDisplacement) {
                const axes = shearedAxesOfBlock(b);
                const axName = activePick.axisName || (activePick.varName && activePick.varName.includes('x') ? 'x' : activePick.varName && activePick.varName.includes('y') ? 'y' : 'z');
                if (axes[axName]) activePick.axis = axes[axName].clone();
            }
        }
        const a = screenAxis(activePick);
        const deltaS = quantizeDragDelta((dx * a.x + dy * a.y) * activePick.scale);   // 精度取整
        changeVar(activePick.varName, deltaS, false);
        updateActiveHighlightPose();
    } else if (activePick.type === 'scale') {
        // 方块自身缩放：沿角点相对中心的「世界径向」投影鼠标位移，拖拽向外即放大、向中心即缩小（任意角点方向均一致）
        const a = screenAxis(activePick);
        const deltaS = quantizeDragDelta((dx * a.x + dy * a.y) * activePick.scale);   // 精度取整
        changeVar(activePick.varName, deltaS, false);
        updateActiveHighlightPose();
    }
    else if (activePick.type === 'plgEdge' || activePick.type === 'plgAngle') {
        // 「两边一角」的 2D 手柄由屏幕叠加层自己的 pointer 事件驱动（plgOverlayMove），
        // 不走 3D 拾取这条路径；这里留空避免误入旧分支。
    }
    else if (activePick.type === 'stretch') {
        // 沿拉伸轴方向投影鼠标位移 → 改变 v.extend_scale
        const a = screenAxis(activePick);
        const deltaS = quantizeDragDelta((dx * a.x + dy * a.y) * activePick.scale);   // 精度取整
        changeVar(activePick.varName, deltaS, false);
        updateStretchGizmoLive(selected());
    }
    else { const a = screenAxis(activePick); changeVar(activePick.varName, quantizeDragDelta((dx*a.x+dy*a.y)*activePick.scale), false); updateActiveHighlightPose(); }
    // 拖拽过程中实时刷新数据面板数值（不整面板重渲染）
    updateInspectorValues();
    updateGizmoDeltaHud(cx, cy);
    if (ev) ev.preventDefault(); return true;
}
function endGizmoDrag(ev) {
    hideGizmoDeltaHud(); gizmoDeltaBaseline = null;   // 拖拽结束，收起增量 HUD
    resetGizmoPrecAccum();                            // 精度取整：清零累计，避免泄漏到下一次拖拽
    const _pid = (ev && ev.pointerId != null) ? ev.pointerId : null;
    const _rel = () => { if (_pid != null) { try { renderer.domElement.releasePointerCapture(_pid); } catch (_) {} } };
    if (pendingInputPick) { const p=pendingInputPick; pendingInputPick=null; _rel(); controls.enabled=true; const dt=performance.now()-p.t, md=Math.hypot((p.lastX??p.x)-p.x,(p.lastY??p.y)-p.y); if(!p.moved&&md<=10&&dt<=650) promptVarInput(p.varName,ev); if(ev) ev.preventDefault(); gizmoDragJustEnded = true; setTimeout(() => { gizmoDragJustEnded = false; }, 300); return true; }
    if (activePick) {
        // 镜像对称面手柄：几何已实时改在对称面上，这里只需按新姿态重排手柄（圆环轴随面转）
        if (activePick.mirrorPlane) {
            activePick = null; draggingGizmo = false; controls.enabled = true; _rel();
            rebuildGizmo();
            return true;
        }
        const wr = activePick.type==='rot';
        const wrPlg = activePick.type==='plgEdge' || activePick.type==='plgAngle';
        const wasFolder = !!activePick.folder;
        const wasFolderMove = wasFolder && activePick.type === 'move';
        const wasFolderPivotMove = wasFolderMove && !!activePick.folderPivot;
        const wasFolderDisplace = wasFolderMove && !!activePick.folderDisplace;
        const folderName = wasFolder ? activePick.folderName : null;
        clearActiveHighlight(); activePick=null; draggingGizmo=false; controls.enabled=true; _rel();
        if (wr) { recordAction(); if (selectedBlock) renderVariablesForBlock(selectedBlock); updateOriginCenterLineLive(selectedBlock); if (!selectedFolder) updateRotGizmosLive(); }
        // 「两边一角」手柄：数值已在拖拽中实时写入，这里补撤销点并按新形状重排手柄
        if (wrPlg) { recordAction(); if (selectedBlock) renderVariablesForBlock(selectedBlock); requestGizmoRefresh(); }
        if (dragNeedsRebuild || wasFolder) { dragNeedsRebuild=false; if (wasFolder) folderAxesDirty=true; requestGizmoRefresh(); updateToolbar(true); }
        // 文件夹移动（含联动烘焙方块）需记录撤销点；旋转已在 wr 分支记录。
        if (wasFolderMove) { recordAction(); }
        // 骨骼自动烘焙：文件夹（移动或旋转）结束后，把【自身 + 所有子孙文件夹】中已设枢轴的骨骼下属的
        // 子方块枢轴烘焙到各自骨骼枢轴（保持模型世界位置不变）。
        // 此前仅在“移动结束”且只烘焙被直接拖动的那一个文件夹；父骨骼旋转/移动驱动子文件夹枢轴变化时，
        // 子文件夹内 cube 的枢轴未被烘焙——这正是“父骨骼旋转带动子文件夹旋转，但内部 cube 枢轴没自动烘焙”的场景。
        if (autoBakeBone && folderName && (wasFolderPivotMove || (wr && wasFolder))) {
            let total = 0;
            const names = [folderName, ...getDescendantFolderNames(folderName)];
            names.forEach(n => {
                const f = getFolder(n);
                // 骨骼文件夹按方针不存储 f.pivot（designateFolderBackbone 时已 delete f.pivot），
                // 故须用 f._backbone 判定；普通文件夹仍用 f.pivot。否则 autoBake 对骨骼文件夹永远不触发。
                if (f && (f._backbone || (f.pivot && Array.isArray(f.pivot)))) {
                    const res = bakeFolderCubesToBone(n);
                    total += (res && res.count) || 0;
                }
            });
            if (total > 0) {
                blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
                renderInspector(); renderSideBlockList();
                showToast(`已自动烘焙 ${total} 个方块到骨骼枢轴`);
            }
        }
        // 拖拽结束后同步关键帧数据与数值面板
        renderInspector();
        if (keyframeWindowOpen) {
            if (selectedBlock) {
                syncKeyframeFromBlock(selectedBlock);
            }
            /* 【2026-10-19 · 关键帧去文件夹化】原此处还有 `else if (kfGroupEdit && selectedFolder)` 的文件夹骨级回写分支
               （recordBoneKeyframe / applyBoneKeyframeAtTime），文件夹轨道不可能支持，已整体删除。 */
        }
        /* ★★★【r17 · 用户投诉「Gizmo 拖完右侧数据表完全不动」的真根因】
           旧实现拖拽结束只 `renderInspector()` +（浮动窗开着时）`syncKeyframeFromBlock`，
           **从不重建新操作模式侧栏的「关键帧时间表」** ⇒ 关键帧数据其实已经写进帧
           （程序文本里能看得到新值），但右侧数据表显示的还是拖动前的旧值。
           统一走唯一刷新咽喉 `kfRefreshAllPanels()`（侧栏时间表 + 浮动窗 + 播放头）。
           仅在关键帧模式调用，其余模式无侧栏时间表，无谓开销。 */
        try { if (isKeyframeMode) kfRefreshAllPanels(); } catch (e) { }
        gizmoDragJustEnded = true; setTimeout(() => { gizmoDragJustEnded = false; }, 300);
        if (ev) ev.preventDefault(); return true;
    } return false;
}

