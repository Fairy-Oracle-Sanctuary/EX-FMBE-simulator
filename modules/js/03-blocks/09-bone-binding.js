/* 03-blocks/09-bone-binding.js · 源 测试版v.6b79.html 第 16106-17410 行 */
'use strict';
// ===== ✛ 骨骼绑定方式（紫加号分两种） =====
//  'pivot'  枢轴绑定（真骨骼）：子块位置 = 父枢轴 + pR(父rotate)·(枢轴差)，子块自带枢轴、继承父旋转、
//           带 bone_rotx/y/z 关节角（2026-10-24 起 pos 承载枢轴偏移，不再是虚拟枢轴）。
//  'basepos' basepos 绑定（2026-10-24 起 = 纯枢轴吸附，不是骨骼系统）：一次性把子块枢轴对齐到父枢轴
//           （v.xpos=t.<父>_px）并反算常量 basepos 让模型原地不动；不继承父旋转、无关节角、无 pR 链。
//           旧存档（2026-10-24 前）仍是「basepos 实时反解链」：v.xbasepos = A⁻¹·A0·(t.<父>_bx + bone)。
//  判定优先级：显式字段 _boneMode → 表达式里出现 t.<父>_bx/by/bz（旧链）→ 默认 pivot。
//  注意：新 basepos 吸附块要从表达式反推（pos 读 px 且无 pR00/bone_rot）→ isPureSnapBone，不能只看 px。
function getBoneMode(b) {
    if (!b) return 'pivot';
    if (b._boneMode === 'basepos') return 'basepos';
    if (b._boneMode === 'pivot') return 'pivot';
    // 旧存档/导入：没有 _boneMode 字段，按跟随表达式用的是 px 还是 bx 推断
    try {
        if (isPureSnapBone(b)) return 'basepos';
        if (b.scope && b.scope.vars) {
            for (const [, d] of b.scope.vars) {
                if (d && d.expr && /t(?:\[['"]?|\.)[A-Za-z0-9_]+_b[xyz]\b/.test(String(d.expr))) return 'basepos';
            }
        }
    } catch (_) {}
    return 'pivot';
}
function inferBoneModeFromBlock(b) {
    if (!b) return 'pivot';
    if (b._boneMode === 'basepos') return 'basepos';
    try {
        if (isPureSnapBone(b)) return 'basepos';
        if (b.scope && b.scope.vars) {
            for (const [, d] of b.scope.vars) {
                if (d && d.expr && /t(?:\[['"]?|\.)[A-Za-z0-9_]+_b[xyz]\b/.test(String(d.expr))) return 'basepos';
            }
        }
    } catch (_) {}
    return 'pivot';
}
// 父块是否需要额外广播 t.<父>_bx/by/bz（仅当存在 basepos 模式的显式子块时）
// 该块的 basepos 是否真的被跟随表达式驱动（t.<父>_bx/by/bz）
// ★2026-10-21 实时反解链：t.<父>_bx 出现在 p_u* 辅助变量里，不再只出现在 v.xbasepos 本身
//   ⇒ 扫描本块全部变量表达式（与 inferBoneModeFromBlock 同口径）；枢轴模式子块只引用 t.*_px，不会误判。
function isBaseposDrivenBlock(b) {
    if (!b || !b.scope || !b.scope.vars) return false;
    for (const [, d] of b.scope.vars) {
        if (d && d.expr && /t(?:\[['"]?|\.)[A-Za-z0-9_]+_b[xyz]\b/.test(String(d.expr))) return true;
    }
    return false;
}
function hasBaseposBoneChild(parent) {
    if (!parent) return false;
    return blocks.some(b => b._boneParent === parent.id && isBoneMolangDriven(b) && isBaseposDrivenBlock(b));
}
// ★★【2026-10-24 用户第 23 轮】basepos 绑定新语义 = 「纯枢轴吸附」：
//   只做一次性计算 —— 枢轴对齐到父骨骼枢轴、basepos 反算成常量使模型外观不变；
//   不继承父旋转、不建 pR·bone 位移链、无 bone_rot 关节角 ⇒ 不再是骨骼系统。
//   识别特征（可从表达式反推，导入老工程同样成立）：
//     ① pos 引用父枢轴 t.<父>_p*；② 没有 pR 矩阵；③ basepos 不跟随父 basepos（无 t.*）。
function isPureSnapBone(b) {
    if (!b || !b.scope || !b.scope.vars) return false;
    if (boneBaseposA0Of(b)) return false;
    const xp = b.scope.vars.get('v.xpos');
    if (!xp || !xp.expr || !/t(?:\[['"]?|\.)[A-Za-z0-9_]+_px\b/.test(String(xp.expr))) return false;
    if (b.scope.vars.has('v.pR00')) return false;
    if (b.scope.vars.has('v.bone_rotx')) return false;
    const xb = b.scope.vars.get('v.xbasepos');
    if (xb && xb.expr && /\bt(?:\[['"]?|\.)/.test(String(xb.expr))) return false;
    return true;
}
// 父块是否还有「以本块枢轴为基准」的 molang 子块 —— 没有则不发布父枢轴/锚点全局。
// ★【2026-10-24】新绑定一律读 t.<父>_px 作基准（basepos 吸附块同样读 px，只是不带 pR），
//   只有旧版局部轴链（basepos 表达式跟随父 basepos）不读父枢轴，故按【表达式】判定而非按绑定方式判定。
function hasPivotBoneChild(parent) {
    if (!parent) return false;
    return blocks.some(b => b._boneParent === parent.id && isBoneMolangDriven(b) && !isBaseposDrivenBlock(b));
}
// ==================== ★ 局部轴绑定：basepos 实时反解链路（2026-10-21） ====================
// 用户要求：「basepos 计算式应当是实时计算的才对，读入 rot 变量的数值计算后使得模型视觉上的模型重心不发生改变」。
// 数学目标（A = 子块自身外观矩阵 = computeTransformMatrix 里 localMat 的线性部分；A0 = 绑定瞬间的 A）：
//     引擎世界位置 = 父位置 + pR(父rotate)·(pos子 + A·basepos)
//     ⇒ 只要 A(t)·basepos(t) ≡ A0·basepos_bind = A0·(父basepos + bone) 恒定，子块几何原点(blockWorldPos)就不动
//   ⇒ basepos(t) = A(t)⁻¹·u，u = A0·(父basepos + bone)（u 已含绑定瞬间的父 basepos，不要再减父 basepos）
// 语义：
//   · 父 pos/rotate 变 → 子块刚性跟随（父 transform 在外层，子块局部量不变）；
//   · 父 basepos 变 → u 里的 t.<父>_b* 实时更新，子块随父走；
//   · 子块自己改 xrot/extend_scale/extend_xrot/extend_yrot → 世界原点不动，只绕自身中心旋转/拉伸；
//   · rot 不变（A=A0）时 basepos(t)=父basepos+bone → 与旧线性式 `t.父_bx + bone` 完全一致（零回归）。
// 实现约束：项目只有 molang 表达式通道（没有临时语句），故用若干 p_ 前缀辅助变量分步承载
//   （p_ 前缀在 getBoneInputConstantsString 里被过滤，不会当常量重复导出）。
// ★【2026-10-21 第二轮定稿】A⁻¹ **不展开成 9 个符号矩阵元素**（那会生成 6000+ 字符、含 p_ies*p_ies 的
//   冗余多项式），改为与 worldToBasepos 完全同构的【顺序逆变换链】：每步只对一个 3 维向量做一次单轴旋转，
//   3 个分量里只动 2 个，不变的分量直接沿用上一步的变量名 ⇒ 每步 2 个新变量、每条表达式 ≤ 3 个单项式。
//   对角缩放全部折叠到端点：
//     A = Ry(-ry)·Rx(rx)·Rz(-rz)·S·Ry(-ey)·Rx(ex)·Es·Rx(-ex)·Ry(ey)·Esy
//     A⁻¹ = (1/s)·Esy⁻¹·Ry(-ey)·Rx(ex)·Es⁻¹·Rx(-ex)·Ry(ey)·Rz(rz)·Rx(-rx)·Ry(ry)
//   应用顺序（右端先作用，与 worldToBasepos 的 applyAxisAngle 逐句一一对应）：
//     ① Ry(+ry) ② Rx(-rx) ③ Rz(+rz) ④ Ry(+ey) ⑤ Rx(-ex) ⑥ Rx(+ex) ⑦ Ry(-ey)
//   · S⁻¹ 是标量（1/scale）⇒ 折到三条输出式末尾；
//   · Esy⁻¹（y 除以 es）在链尾 ⇒ 折到输出 y；Es⁻¹ 夹在⑤⑥两个 X 旋转之间，折进⑤的 z 输出；
//   · 变量总数 26 = A0×9 + u×3 + 旋转步×12 + 1/es + 1/scale（三角函数全部内联，不占变量）。
// A0 常量用 1e-6 精度（bone 已按 _r4 量化，A0 若也按 _r4 会让绑定瞬间漂移逼近 2e-4 上限）。
function _r6bp(v) { return Math.round(Number(v) * 1000000) / 1000000; }
// 子块外观矩阵 A（行主序 9 元）：把 pos/basepos/rotate 全部置零后走 computeTransformMatrix，
// 与引擎渲染/反解用的是同一个矩阵实现，保证零口径差。
function boneAppearanceMat3(b) {
    const M = b.scope.toM();
    const M0 = [0, 0, 0, M[3], M[4], M[5], M[6], M[7], M[8], M[9], 0, 0, 0];
    const e = computeTransformMatrix(M0, 0, 0, 0).elements;   // 列主序
    return [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
}
// 取绑定瞬间的 A0：优先方块字段；从导出命令重新导入时字段不存在 → 读回 p_a0xx 常量变量
function boneBaseposA0Of(b) {
    if (b && Array.isArray(b._baseposA0) && b._baseposA0.length === 9 && b._baseposA0.every(Number.isFinite)) {
        return b._baseposA0.slice();
    }
    if (!b || !b.scope || !b.scope.vars) return null;
    const out = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const d = b.scope.vars.get(`v.p_a0${r}${c}`);
        out.push(d ? Number(d.value) : NaN);
        if (!d) return null;
    }
    return out.every(Number.isFinite) ? out : null;
}
function boneBaseposHelperNames() {
    const names = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) names.push(`v.p_a0${r}${c}`);
    names.push('v.p_ies', 'v.p_is', 'v.p_u0', 'v.p_u1', 'v.p_u2');
    // 顺序逆变换链的中间量（变量复用：每步只新建发生变化的两个分量）
    ['r1x', 'r1z', 'r2y', 'r2z', 'r3x', 'r3y', 'r4x', 'r4z', 'r5y', 'r5z', 'r6y', 'r6z']
        .forEach(n => names.push('v.p_' + n));
    // 旧版（符号矩阵展开）残留的三角函数与 p_i* 元素，换绑 / 切回枢轴时一并清掉
    ['p_crx', 'p_srx', 'p_cry', 'p_sry', 'p_crz', 'p_srz', 'p_cex', 'p_sex', 'p_cey', 'p_sey']
        .forEach(n => names.push('v.' + n));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) names.push(`v.p_i${r}${c}`);
    return names;
}
// 生成整条实时链的辅助变量（顺序 = 依赖顺序；模拟器写入与导出语句共用同一套字符串）
// 每步只对一个 3 维向量做一次单轴旋转，未变化的分量沿用上一步变量（见 boneAppearanceMat3 上方的推导）。
function boneBaseposChainVars(child, parent, a0) {
    const p = boneSafeId(parent.id);
    const bx = `t.${p}_bx`, by = `t.${p}_by`, bz = `t.${p}_bz`;
    const g = (r, c) => `v.p_a0${r}${c}`;
    const crx = 'math.cos(v.xrot)', srx = 'math.sin(v.xrot)';
    const cry = 'math.cos(v.yrot)', sry = 'math.sin(v.yrot)';
    const crz = 'math.cos(v.zrot)', srz = 'math.sin(v.zrot)';
    const cex = 'math.cos(v.extend_xrot)', sex = 'math.sin(v.extend_xrot)';
    const cey = 'math.cos(v.extend_yrot)', sey = 'math.sin(v.extend_yrot)';
    const out = [];
    // A0：绑定瞬间的外观矩阵（1e-6 精度；导入回退 boneBaseposA0Of 按名字读回，名字不可改）
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push([g(r, c), String(_r6bp(a0[r * 3 + c]))]);
    // u = A0·(父basepos + bone)
    out.push(
        ['v.p_u0', `${g(0, 0)}*(${bx}+v.xbasepos_bone)+${g(0, 1)}*(${by}+v.ybasepos_bone)+${g(0, 2)}*(${bz}+v.zbasepos_bone)`],
        ['v.p_u1', `${g(1, 0)}*(${bx}+v.xbasepos_bone)+${g(1, 1)}*(${by}+v.ybasepos_bone)+${g(1, 2)}*(${bz}+v.zbasepos_bone)`],
        ['v.p_u2', `${g(2, 0)}*(${bx}+v.xbasepos_bone)+${g(2, 1)}*(${by}+v.ybasepos_bone)+${g(2, 2)}*(${bz}+v.zbasepos_bone)`]
    );
    // 两个倒数（clampEs / clampScale 同口径：0 → ±1e-4，保留符号）
    out.push(
        ['v.p_ies', '1/(((v.extend_scale<0)?-1:1)*math.max(0.0001,math.abs(v.extend_scale)))'],
        ['v.p_is', '1/(((v.scale<0)?-1:1)*math.max(0.0001,math.abs(v.scale)))']
    );
    // ① Ry(+ry)：x/z 变化，y 沿用 u1
    out.push(
        ['v.p_r1x', `${cry}*v.p_u0+${sry}*v.p_u2`],
        ['v.p_r1z', `-${sry}*v.p_u0+${cry}*v.p_u2`]
    );
    // ② Rx(-rx)：y/z 变化，x 沿用 r1x
    out.push(
        ['v.p_r2y', `${crx}*v.p_u1+${srx}*v.p_r1z`],
        ['v.p_r2z', `-${srx}*v.p_u1+${crx}*v.p_r1z`]
    );
    // ③ Rz(+rz)：x/y 变化，z 沿用 r2z
    out.push(
        ['v.p_r3x', `${crz}*v.p_r1x-${srz}*v.p_r2y`],
        ['v.p_r3y', `${srz}*v.p_r1x+${crz}*v.p_r2y`]
    );
    // ④ Ry(+ey)：x/z 变化，y 沿用 r3y
    out.push(
        ['v.p_r4x', `${cey}*v.p_r3x+${sey}*v.p_r2z`],
        ['v.p_r4z', `-${sey}*v.p_r3x+${cey}*v.p_r2z`]
    );
    // ⑤ Rx(-ex) + Es⁻¹（z 除以 extend_scale）：x 沿用 r4x
    out.push(
        ['v.p_r5y', `${cex}*v.p_r3y+${sex}*v.p_r4z`],
        ['v.p_r5z', `(-${sex}*v.p_r3y+${cex}*v.p_r4z)*v.p_ies`]
    );
    // ⑥ Rx(+ex)：y/z 变化，x 沿用 r4x
    out.push(
        ['v.p_r6y', `${cex}*v.p_r5y-${sex}*v.p_r5z`],
        ['v.p_r6z', `${sex}*v.p_r5y+${cex}*v.p_r5z`]
    );
    return out;
}
// 三条输出式：basepos = A子⁻¹·u（u = A0·(父basepos + bone) 已含绑定瞬间的父 basepos 偏移，
// 引擎里的世界位置 = 父位置 + 父旋转·(pos + A·basepos)，故此处不能再减父 basepos，否则绑定瞬间就漂移）。
// 链尾的 ⑦ Ry(-ey) 直接折进 x/z 输出；Esy⁻¹ 折进 y 输出；S⁻¹（1/scale）折进三条输出末尾。
function boneBaseposOutputExprs(child, parent) {
    const cey = 'math.cos(v.extend_yrot)', sey = 'math.sin(v.extend_yrot)';
    return {
        x: `(${cey}*v.p_r4x-${sey}*v.p_r6z)*v.p_is`,
        y: `v.p_r6y*v.p_ies*v.p_is`,
        z: `(${sey}*v.p_r4x+${cey}*v.p_r6z)*v.p_is`
    };
}
// 把实时链写进（或刷新到）子块 scope：先补齐变量，再一次性求值
function applyBoneBaseposChain(child, parent, a0) {
    const chain = boneBaseposChainVars(child, parent, a0);
    for (const [n, e] of chain) {
        if (!child.scope.vars.has(n)) child.scope.addVar(n, '0', -1e6, 1e6, 0.0001);
        const d = child.scope.vars.get(n);
        d.expr = e;
        d.value = 0;
    }
    const out = boneBaseposOutputExprs(child, parent);
    [['v.xbasepos', out.x], ['v.ybasepos', out.y], ['v.zbasepos', out.z]].forEach(([n, e]) => {
        if (!child.scope.vars.has(n)) child.scope.addVar(n, '0', -5, 5, 0.01);
        child.scope.vars.get(n).expr = e;
    });
    child.scope.recompute();
}
// ==================== ★ 骨骼子树「绑定不改世界姿态」支持（2026-10-22） ====================
// 【为什么要额外广播锚点】枢轴模式子块的位置 = 父锚点 + R(父rotate)·偏移。
//   普通块（basepos 全 0）时 锚点 == v.xpos == 方块视觉中心，直接用 t.<父>_px 即可。
//   但【局部轴绑定块】的 v.xpos 只是「虚拟枢轴」（= 父枢轴副本），它的真实视觉中心 = v.xpos + R(rotate)·u，
//   其中 u = v.p_u0/u1/u2 = A·basepos（见 boneBaseposChainVars 推导：visual = pos + globalRot·U·basepos）。
//   ⇒ 把一棵树挂到这种中继骨骼下时，若仍读 t.<父>_px 当锚点，整棵子树会整体偏移（用户问题 1）。
//   做法：父块额外广播 t.<父>_ux/_uy/_uz = u，子块写 pos = t.父_px + pR·(bone + u)，
//   等价于「父视觉中心 + pR·bone」，且父块旋转时 u 一起被 pR 旋转，与引擎完全一致。
function boneAnchorSuffix(parent) {
    if (!parent) return 'p';
    return (getBoneMode(parent) === 'basepos' && boneBaseposA0Of(parent)) ? 'u' : 'p';
}
// 该父块若需要视觉锚点全局，补齐 t.<id>_ux/_uy/_uz（已存在则保留，不覆盖用户自定义）
function ensureBoneAnchorGlobals(parent) {
    if (!parent || boneAnchorSuffix(parent) !== 'u') return;
    const p = boneSafeId(parent.id);
    ensureGlobalVar(`${p}_ux`, 'v.p_u0', parent.id);
    ensureGlobalVar(`${p}_uy`, 'v.p_u1', parent.id);
    ensureGlobalVar(`${p}_uz`, 'v.p_u2', parent.id);
}
// 子树重解用的「父锚点」数值口径：必须与 bonePivotPosAssign 的字符串等价
//   = 父 pos + R(父rotate)·(u|0)；普通父 basepos≠0 时公式本就不含 basepos 项，这里同样不加。
function boneAnchorOf(parent) {
    const pos = new THREE.Vector3(vnum(parent, 'v.xpos'), vnum(parent, 'v.ypos'), vnum(parent, 'v.zpos'));
    if (boneAnchorSuffix(parent) === 'u') {
        const u = new THREE.Vector3(vnum(parent, 'v.p_u0'), vnum(parent, 'v.p_u1'), vnum(parent, 'v.p_u2'));
        pos.add(u.applyMatrix3(boneParentMatrix(vnum(parent, 'v.rotatex'), vnum(parent, 'v.rotatey'), vnum(parent, 'v.rotatez'))));
    }
    return pos;
}
// 枢轴模式子块的三条位置【表达式】（不含 v.xpos= 前缀）：绑定写入 scope / 子树重解 / 导出共用同一套字符串
function bonePivotPosExprs(parent) {
    const p = boneSafeId(parent.id);
    const off = ['v.xbasepos_bone', 'v.ybasepos_bone', 'v.zbasepos_bone'];
    // 父块有视觉锚点偏移 u（局部轴绑定块）→ 把 u 一起放进 pR 乘法里
    const sh = boneAnchorSuffix(parent) === 'u' ? [`t.${p}_ux`, `t.${p}_uy`, `t.${p}_uz`] : null;
    const R = ['pR00', 'pR01', 'pR02', 'pR10', 'pR11', 'pR12', 'pR20', 'pR21', 'pR22'];
    return ['x', 'y', 'z'].map((ax, i) => {
        const terms = [0, 1, 2].map(j => {
            const src = sh ? `(${off[j]}+${sh[j]})` : off[j];
            return `v.${R[i * 3 + j]}*${src}`;
        });
        return `t.${p}_p${ax} + ${terms.join(' + ')}`;
    });
}
// 绑定前快照整棵后代子树的【世界几何原点】（视觉上真正的位置）
function boneSnapshotSubtree(root) {
    const snap = new Map();
    const walk = (pid) => {
        blocks.filter(b => b._boneParent === pid).forEach(b => {
            snap.set(b.id, blockWorldPos(b));
            walk(b.id);
        });
    };
    if (root) walk(root.id);
    return snap;
}
// 绑定后逐级重解后代 xbasepos_bone，使世界原点精确回到绑定前（整棵树视觉零跳变）。
// 每级先写偏移 → refresh 父级 → 再处理下一级，顺序不可反。
function boneResolveSubtree(root, snap) {
    if (!root || !snap || !snap.size) return;
    const walk = (parent) => {
        try { parent.refresh(); } catch (e) { }
        blocks.filter(b => b._boneParent === parent.id).forEach(child => {
            const target = snap.get(child.id);
            const mode = getBoneMode(child);
            const ag = boneAnchorSuffix(parent);
            // 父块是局部轴模式（有 u 锚点）时，枢轴模式子块的 pos 跟随式必须补上 u 项，
            // 否则仍以父的【虚拟枢轴】为基准 → 子树整体偏移。
            if (ag === 'u' && mode !== 'basepos') {
                const xd = child.scope.vars.get('v.xpos');
                const ps = boneSafeId(parent.id);
                if (xd && isMolangExpr(xd.expr) && !String(xd.expr).includes(`t.${ps}_ux`)) {
                    ensureBoneAnchorGlobals(parent);
                    const [ex, ey, ez] = bonePivotPosExprs(parent);
                    child.scope.setVarExpr('v.xpos', ex);
                    child.scope.setVarExpr('v.ypos', ey);
                    child.scope.setVarExpr('v.zpos', ez);
                }
            }
            // 子块的新 rotate / 新的 pos 跟随式要先算出来，下面才能用它的「pos→视觉中心」偏移反解偏移量
            try { child.refresh(); } catch (e) { }
            if (target) {
                // ★【2026-10-24 r23】纯枢轴吸附后代：pos 直接读本块枢轴，父枢轴一变就自动跟随，
                //   不需要也不允许写 xbasepos_bone（那会凭空造出骨骼偏移量）。
                if (!isPureSnapBone(child)) {
                    const anchor = boneAnchorOf(parent);
                const parentPos = new THREE.Vector3(vnum(parent, 'v.xpos'), vnum(parent, 'v.ypos'), vnum(parent, 'v.zpos'));
                const parentBase = new THREE.Vector3(vnum(parent, 'v.xbasepos'), vnum(parent, 'v.ybasepos'), vnum(parent, 'v.zbasepos'));
                let bone = null;
                if (mode === 'basepos' && boneBaseposA0Of(child)) {
                    // 局部轴绑定：与 bindBone 的 basepos 分支同式（worldToBasepos 已过子块自身 A⁻¹·R⁻¹）
                    bone = worldToBasepos(child, target.clone().sub(parentPos)).sub(parentBase);
                } else {
                    // 枢轴绑定：先把几何原点还原成枢轴（减去 R·A·basepos），再在父旋转坐标系里解偏移
                    const pivot = new THREE.Vector3(vnum(child, 'v.xpos'), vnum(child, 'v.ypos'), vnum(child, 'v.zpos'));
                    const contrib = blockWorldPos(child).sub(pivot);
                    const wantPivot = target.clone().sub(contrib);
                    const inv = boneParentMatrix(vnum(parent, 'v.rotatex'), vnum(parent, 'v.rotatey'), vnum(parent, 'v.rotatez')).clone().invert();
                    bone = wantPivot.sub(anchor).applyMatrix3(inv);
                }
                if (bone && bone.toArray().every(Number.isFinite)) {
                    setConstVarValue(child, 'v.xbasepos_bone', _r4(bone.x));
                    setConstVarValue(child, 'v.ybasepos_bone', _r4(bone.y));
                    setConstVarValue(child, 'v.zbasepos_bone', _r4(bone.z));
                }
                }
            }
            walk(child);
        });
    };
    walk(root);
}
// 生成「跟随段」：把 scope 里的跟随表达式按依赖顺序拼成 molang（用于 molang 接管态子块的 program 末尾追加）
function boneBuildFollowSegment(child, parent) {
    const mode = getBoneMode(child);
    const names = [];
    const take = (n) => { if (child.scope.vars.has('v.' + n) && !names.includes(n)) names.push(n); };
    // ★【2026-10-24 r23】纯枢轴吸附（basepos 新语义）：只跟随父枢轴 + 自身常量，无需 pR / bone_rot
    if (isPureSnapBone(child)) {
        ['xpos', 'ypos', 'zpos'].forEach(take);
        return names.map(n => `v.${n}=${child.scope.vars.get('v.' + n).expr};`).join(' ');
    }
    if (mode === 'basepos' && boneBaseposA0Of(child)) {
        // 旧版局部轴链（A0 实时反解）：basepos 跟随父 basepos
        const a0 = boneBaseposA0Of(child);
        boneBaseposChainVars(child, parent, a0).forEach(([n]) => take(n.slice(2)));
        ['xbasepos', 'ybasepos', 'zbasepos'].forEach(take);
    } else if (mode === 'basepos' && isBaseposDrivenBlock(child)) {
        // 旧存档（无 A0）：basepos = 父 basepos + 偏移
        ['xbasepos', 'ybasepos', 'zbasepos'].forEach(take);
    } else {
        // ★【2026-10-24】库里剩下的都是枢轴绑定的 pR·bone 跟随式（basepos 吸附块在函数开头已单独返回）
        ['parent_xrot', 'parent_yrot', 'parent_zrot', 'p_cx', 'p_sx', 'p_cy', 'p_sy', 'p_cz', 'p_sz',
            'pR00', 'pR01', 'pR02', 'pR10', 'pR11', 'pR12', 'pR20', 'pR21', 'pR22'].forEach(take);
    }
    ['xbasepos_bone', 'ybasepos_bone', 'zbasepos_bone', 'xpos', 'ypos', 'zpos', 'bone_rotx', 'bone_roty', 'bone_rotz', 'rotatex', 'rotatey', 'rotatez'].forEach(take);
    let s = names.map(n => `v.${n}=${child.scope.vars.get('v.' + n).expr};`).join(' ');
    // 本块还是更下级的骨骼父块 → 末尾补发布，避免发布段早于新位置计算
    if (blocks.some(b => b._boneParent === child.id && isExplicitBoneBinding(b))) {
        ensureBoneAnchorGlobals(child);
        s += ' ' + getBonePublishGlobalsString(child);
    }
    return s;
}
// molang 接管态子块：scope 表达式不会被执行（recompute 只跑 program），必须把同一段跟随逻辑
// 追加到程序末尾（末尾赋值生效）。用 _boneFollowSeg 记录上次追加段，重绑/换绑时先摘掉，避免程序无限变长。
function bonePatchMolangFollow(child, parent) {
    if (!child || !child.scope || !child.scope.molangMode) return false;
    let prog = String(child.scope.program || '');
    if (child._boneFollowSeg && prog.includes(child._boneFollowSeg)) {
        prog = prog.split(child._boneFollowSeg).join(' ');
    }
    const seg = boneBuildFollowSegment(child, parent);
    if (!seg) return false;
    child._boneFollowSeg = seg;
    child.scope.program = (prog.replace(/\s+$/, '') + ' ' + seg).trim();
    try { child.refresh(); } catch (e) { }
    try { syncMolangEditorProgram(child); } catch (e) { }
    return true;
}
// ✛ 骨骼绑定向导（两步卡片：绑定方式 → 父骨骼）
// 候选父级：排除自身 + 骨骼后代 + 骨骼祖先（避免成环 / 父子互绑）
function boneBindCandidates(children) {
    const descendantIds = new Set();
    const ancestorIds = new Set();
    children.forEach(child => {
        const collectDescendants = (parentId) => {
            blocks.filter(b => b._boneParent === parentId).forEach(b => {
                if (!descendantIds.has(b.id)) { descendantIds.add(b.id); collectDescendants(b.id); }
            });
        };
        collectDescendants(child.id);
        let cur = child;
        while (cur && cur._boneParent) { ancestorIds.add(cur._boneParent); cur = blocks.find(b => b.id === cur._boneParent); }
    });
    const childIds = new Set(children.map(c => c.id));
    const candidates = blocks.filter(b => !childIds.has(b.id) && !descendantIds.has(b.id) && !ancestorIds.has(b.id));
    // 单块专属：已绑父但 molang 跟随链被剪断 → 提供「修复跟随」
    let followBroken = null;
    if (children.length === 1) {
        const child = children[0];
        const _xpDef = child.scope && child.scope.vars.get('v.xpos');
        const _bpDef = child.scope && child.scope.vars.get('v.xbasepos');
        // 跟随链是否完好：新绑定（枢轴 / basepos 吸附）看 v.xpos 是否引用父 _px；旧版 local-axis 链看 v.xbasepos 引用父 _bx
        const _followOk = !!(_xpDef && _xpDef.expr && /t(?:\[['"]?|\.)([A-Za-z0-9_]+)_[pg]x/.test(String(_xpDef.expr)))
            || !!(_bpDef && _bpDef.expr && /t(?:\[['"]?|\.)([A-Za-z0-9_]+)_bx/.test(String(_bpDef.expr)));
        if (child._boneParent && blocks.some(x => x.id === child._boneParent) && !_followOk) followBroken = child;
    }
    return { candidates, followBroken };
}

// 视图拾取：屏幕点射线命中方块（含旗帜等多网格块），返回 blocks 里的方块对象
function bbPickBlockAtEvent(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const pickable = blocks.filter(b => !isBlockInHiddenGroup(b));
    const meshes = pickable.flatMap(b => (b.getMeshes ? b.getMeshes() : (b.mesh ? [b.mesh] : [])));
    const hits = meshes.length ? raycaster.intersectObjects(meshes, true) : [];
    if (!hits.length) return null;
    const hitObj = hits[0].object;
    return pickable.find(b => (b.getMeshes ? b.getMeshes() : [b.mesh]).includes(hitObj)) || null;
}

// 执行绑定（面板刷新 / 撤销 / 提示），列表点选与视图拾取共用
function boneBindExecute(children, parent, boneMode) {
    children.forEach(child => {
        bindBone(child, parent, true, false, false, true, boneMode);
        try { child.refresh(); } catch (_) {}
    });
    if (typeof renderSideBlockList === 'function') renderSideBlockList();
    // ★ 必须切到选中子块并刷新变量面板：bindBone 写入整串 molang 跟随表达式，
    //   renderVariablesForBlock 只在「选中/编辑/删除变量」时调用，绑骨后不刷新 → 面板停在旧值。
    try {
        const last = children[children.length - 1];
        if (selectedBlock !== last) selectBlock(last);
        renderVariablesForBlock(last);
    } catch (_) {}
    try { renderInspector(); } catch (_) {}
    try { recordAction(); } catch (_) {}
    showToast(children.length > 1 ? `已将 ${children.length} 个方块绑定到 ${parent.id}` : `骨骼绑定：已将 ${children[0].id} 绑定到 ${parent.id}`);
}

// 第一步入口：绑定方式 → 父骨骼
function showBoneModeSelector(children) {
    if (!Array.isArray(children)) children = [children];
    children = children.filter(Boolean);
    if (!children.length) return;
    openBoneBindWizard(children, { step: 1, mode: null });
}

// 直接进入「父骨骼」步骤（保留给内部调用）
function showParentSelector(children, boneMode) {
    if (!Array.isArray(children)) children = [children];
    children = children.filter(Boolean);
    if (!children.length) return;
    openBoneBindWizard(children, { step: 2, mode: (boneMode === 'basepos') ? 'basepos' : 'pivot' });
}

// 「在视图中选中」：关闭卡片后监听画布单击，命中合法方块即绑定；Esc 取消
function startBoneParentPick(children, boneMode, allowedIds) {
    const canvasEl = renderer.domElement;
    let done = false;
    // 清理监听器：拾取结束 / 取消 / 关闭都必须走这里，避免残留监听误绑
    const cleanup = () => {
        done = true;
        canvasEl.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
    };
    const onClick = (ev) => {
        if (done) return;
        if (typeof _canvasDragMoved !== 'undefined' && _canvasDragMoved) return; // 拖动视角不算点选
        const hit = bbPickBlockAtEvent(ev);
        if (!hit) return;
        ev.stopPropagation(); ev.stopImmediatePropagation(); ev.preventDefault();
        if (!allowedIds.has(hit.id)) { showToast(`【${hit.id}】不能作为父级`); return; }
        cleanup();
        boneBindExecute(children, hit, boneMode);
    };
    const onKey = (ev) => { if (ev.key === 'Escape') { cleanup(); showToast('已取消选择父骨骼'); } };
    canvasEl.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    showToast('请在视图中点击要作为父骨骼的方块（Esc 取消）');
}

function openBoneBindWizard(children, opts) {
    opts = opts || {};
    const { candidates, followBroken } = boneBindCandidates(children);
    let mode = opts.mode === 'basepos' ? 'basepos' : (opts.mode === 'pivot' ? 'pivot' : null);
    let step = (opts.step === 2 && mode) ? 2 : 1;
    if (!candidates.length && !followBroken) { showToast('没有可作为父级的方块'); return; }

    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal io-soft bb-modal';
    modalDiv.style.zIndex = '1001';
    const listHtml = candidates.length
        ? candidates.map(p => `<div class="bb-pitem" data-pid="${escapeHtml(p.id)}" title="${escapeHtml(p.id)}">${escapeHtml(p.id)}</div>`).join('')
        : '<div class="bb-pempty">无可选父级</div>';
    modalDiv.innerHTML = `
        <div class="modal-content io-shell bb-shell">
            <div class="io-head bb-head">
                <span>骨骼绑定</span>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="bb-steps" id="bbSteps">
                        <span class="bb-step" data-step="1">绑定方式</span>
                        <span class="bb-step" data-step="2">父骨骼</span>
                        <span class="bb-tri" id="bbTri" aria-hidden="true"></span>
                    </div>
                    <button class="io-close" id="bbCloseBtn" type="button" title="关闭">✕</button>
                </div>
            </div>
            <div class="io-body bb-body">
                <div class="bb-stage" id="bbStage1">
                    <div class="bb-opts">
                        <button class="bb-opt" type="button" data-mode="pivot">枢轴绑定</button>
                        <button class="bb-opt" type="button" data-mode="basepos">basepos 绑定</button>
                    </div>
                </div>
                <div class="bb-stage" id="bbStage2">
                    <div class="bb-parent-row">
                        <div class="bb-plist" id="bbPList">${listHtml}</div>
                        <div class="bb-pside">
                            <button class="bb-pick" id="bbPickBtn" type="button">在视图中选中</button>
                            ${followBroken ? '<button class="bb-fix" id="bbFixBtn" type="button">修复跟随</button>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modalDiv);

    const stepsEl = modalDiv.querySelector('#bbSteps');
    const triEl = modalDiv.querySelector('#bbTri');
    const stage1 = modalDiv.querySelector('#bbStage1');
    const stage2 = modalDiv.querySelector('#bbStage2');
    const stepEls = Array.from(stepsEl.querySelectorAll('.bb-step'));
    // 三角指示器：居中于当前栏目，切换时靠 CSS transition 滑动
    const positionTri = () => {
        const active = stepsEl.querySelector('.bb-step.active');
        if (active) triEl.style.left = (active.offsetLeft + active.offsetWidth / 2) + 'px';
    };
    const gotoStep = (n) => {
        step = n;
        stepEls.forEach(el => {
            const idx = Number(el.dataset.step);
            el.classList.remove('fresh');
            el.classList.toggle('active', idx === n);
            el.classList.toggle('done', idx < n);
        });
        // 新栏目从右侧渐出并放大：重放一次入场动画
        const activeEl = stepEls.find(el => Number(el.dataset.step) === n);
        if (activeEl) { void activeEl.offsetWidth; activeEl.classList.add('fresh'); }
        stage1.classList.toggle('active', n === 1);
        stage2.classList.toggle('active', n === 2);
        requestAnimationFrame(positionTri);
        setTimeout(positionTri, 320); // 字号过渡结束后再校准三角，避免落位偏差
    };

    // 关闭：注销 Esc 监听，避免卡片关闭后仍拦截按键
    let escHandler = null;
    const closeWizard = () => {
        modalDiv.remove();
        if (escHandler) { document.removeEventListener('keydown', escHandler, true); escHandler = null; }
    };
    escHandler = (e) => { if (e.key === 'Escape') closeWizard(); };
    document.addEventListener('keydown', escHandler, true);
    modalDiv.querySelector('#bbCloseBtn').addEventListener('click', closeWizard);
    modalDiv.addEventListener('click', (e) => { if (e.target === modalDiv) closeWizard(); });

    // 第一步：只放两个选项，不加任何说明文字
    modalDiv.querySelectorAll('.bb-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            mode = btn.dataset.mode;
            gotoStep(2);
        });
    });

    // 第二步：点列表项直接绑定父级
    modalDiv.querySelectorAll('.bb-pitem').forEach(item => {
        item.addEventListener('click', () => {
            const p = blocks.find(b => b.id === item.dataset.pid);
            if (!p) return;
            closeWizard();
            boneBindExecute(children, p, mode || 'pivot');
        });
    });

    // 第二步：进入视图拾取（卡片关闭，点击画面中的方块即设为父级）
    modalDiv.querySelector('#bbPickBtn').addEventListener('click', () => {
        const allowed = new Set(candidates.map(b => b.id));
        const m = mode || 'pivot';
        closeWizard();
        startBoneParentPick(children, m, allowed);
    });

    // 🩹 修复跟随：按当前世界位置重建 molang（force=true 保住既有关键帧）
    const fixBtn = modalDiv.querySelector('#bbFixBtn');
    if (fixBtn && followBroken) {
        fixBtn.addEventListener('click', () => {
            const p = blocks.find(x => x.id === followBroken._boneParent);
            closeWizard();
            if (!p) return;
            bindBone(followBroken, p, true, false, true, true, getBoneMode(followBroken));
            try { if (selectedBlock !== followBroken) selectBlock(followBroken); } catch (_) {}
            try { renderVariablesForBlock(followBroken); } catch (_) {}
            try { renderInspector(); } catch (_) {}
            try { renderSideBlockList(); } catch (_) {}
            try { recordAction(); } catch (_) {}
            showToast('已重建【' + followBroken.id + '】对父骨骼【' + p.id + '】的 molang 跟随');
        });
    }

    gotoStep(step);
}

function bindBone(child, parent, silent, preservePos, force, explicit, boneMode) {
    // isKfMode 与全项目其它处定义一致：新布局 + 关键帧模式，或旧布局 + 关键帧窗口打开
    const isKfMode = (isNewLayoutMode && isKeyframeMode) || (!isNewLayoutMode && keyframeWindowOpen);
    // 绑定方式：
    //   'pivot'   枢轴绑定（真骨骼）：pos 承载父枢轴 + pR·bone，子块自带枢轴、继承父旋转、有 bone_rot 关节角；
    //   'basepos' basepos 绑定（2026-10-24 起 = 纯枢轴吸附）：枢轴对齐到父枢轴 + basepos 常量补偿，
    //             不继承父旋转、无关节角，只做一次性计算，不是骨骼系统。
    boneMode = (boneMode === 'basepos') ? 'basepos' : 'pivot';
    // 全局骨骼变量前缀必须走 boneSafeId：数字开头 id（如 "118"）加字母前缀 "b" → "b118"，
    // 得到 t.b118_px 等合法 molang（t.118_px 与 t['118_px'] 均非法：前者非法 molang、后者非法 JS）。
    const prefix = boneSafeId(parent.id);
    const tk = s => `t.${prefix}_${s}`;

    // ★ 文件夹骨骼自动绑定 / 导入 / 拖放层级（explicit=false）：静态（非关键帧）模式下
    // 只记录父子关系，不注入任何 molang 跟随表达式 / helper 变量（用户硬约束：无动画态文件夹骨骼
    // 由模拟器直接计算，变量面板必须干净）。进入关键帧模式时由 syncFolderBoneHierarchy(force) 重建为 molang。
    // ★ 紫色加号显式绑定（explicit=true）：用户明确要求该子块实时跟随父块，无论何时都注入完整 molang。
    // force=true（关键帧入口）或已在关键帧模式时也走完整 molang 分支。
    if (!force && !isKfMode && !explicit) {
        child._boneParent = parent.id;
        child._boneExplicit = false; // 文件夹骨骼自动绑定：无动画态不导出 molang（模拟器直接计算）
        if (!silent) {
            recordAction();
            renderSideBlockList();
            showModal("骨骼绑定", `已将 ${child.id} 绑定到 ${parent.id}（已记录父子关系；进入关键帧模式后自动生成跟随动画）`, null, false);
        }
        return;
    }

    // ★【以下为关键帧 / force 动画分支】子块外观旋转（v.xrot/yrot/zrot）保留用户原值，不被改写；
    //   骨骼只把子块 rotatex/y/z 设为父旋转源 molang 跟随（见下方），子块外观随父刚体跟随。
    //   位置偏移用「枢轴坐标差」单独算（见下方），不用 blockWorldPos 全量快照，
    //   以免把几何 basepos 折进骨骼偏移——那正是 basepos≠0 时模型视觉移位的根因。
    // ★ 父【骨骼旋转源】= v.rotatex/y/z（与子块重建 pR 矩阵完全一致）。
    //   t['父_xrot'] 发布的就是 v.rotatex（见 ensureGlobalVar(prefix+'_xrot','v.rotatex',…)），
    //   绝不可能是 rotatex+xrot —— 旧代码把"总旋转"误当父旋转源来提取子块偏移，
    //   而子块重建时 pR 只乘父 rotatex，二者不一致 → 绑定后台块偏移被多转一道父 xrot，
    //   带 xrot 外观旋转的模型（如本用户模型骨干 xrot=-20）拖入骨骼后部分方块位移/旋转、模型扭曲。
    //   中继根（父已有 _boneParent）的 rotatex 是 molang 表达式，取 value 需 refresh 后才有；
    //   这里在设置子块表达式前 refresh 一次父，拿到稳定基准。
    parent.refresh();
    // ★ 绑定前的子块世界原点必须在【改写 rotatex/y/z 与 pos 之前】快照。
    //   basepos 的世界贡献 = globalRot(rotate)·A(自身 extend/scale/xrot)·basepos，
    //   绑定会把子块 rotate 换成父 rotate、pos 换成父 pos —— 若之后才取世界坐标，取到的已不是
    //   "绑定前"的位置，反解出的偏移必然漂移（用户报：basepos 方式绑定后位置跳变）。
    child.refresh();
    // ★ 绑定前子块自身的骨骼旋转值（旧父旋转 + 旧关节角，自由块则是自身 rotate）。
    //   绑定后 rotate 改为「父旋转 + v.bone_rotX」，把差值写进 bone_rot ⇒ 姿态零跳变（用户问题 1 的姿态部分）。
    const _bindRot0 = new THREE.Vector3(vnum(child, 'v.rotatex'), vnum(child, 'v.rotatey'), vnum(child, 'v.rotatez'));
    // ★ 绑定前子块自身的枢轴坐标（pos）。必须在任何表达式改写 / refresh 之前取：
    //   换绑（已是骨骼子块）时先改 rotate 与 pR 辅助量，再 refresh 会让旧 pos 跟随式按【新】父旋转重算，
    //   取到的已不是绑定前枢轴 → 枢轴模式换绑后根块位置漂移（用户问题 1 的换绑场景）。
    const _bindPos0 = new THREE.Vector3(vnum(child, 'v.xpos'), vnum(child, 'v.ypos'), vnum(child, 'v.zpos'));
    // ★ 整棵后代子树的世界几何原点快照：绑定后逐级重解偏移，保证整棵树位置不变（用户问题 1 的位置部分）
    const _subtreeSnap = boneSnapshotSubtree(child);
    // ★ 父骨骼旋转源 = v.rotatex/y/z（用户算法规范：xrot/yrot/zrot 是方块自身外观旋转，
    //   不参与骨骼链）。反解 xbasepos_bone 只用父的骨骼旋转源 rotate，不用 rot。
    //   basepos_bone 与世界轴同为「1 单位 = 1 米」，直接由世界坐标差反解，不做任何缩放。
    const _pRotX = vnum(parent, 'v.rotatex');
    const _pRotY = vnum(parent, 'v.rotatey');
    const _pRotZ = vnum(parent, 'v.rotatez');
    const _pRpInv0 = boneParentMatrix(_pRotX, _pRotY, _pRotZ).clone().invert();

    const _prevBoneParentId = child._boneParent; // 换绑前的旧父（用于清理旧父的 basepos 广播全局）
    child._boneParent = parent.id; // 显式记录父子关系，动画/导出统一认这个
    child._boneExplicit = !!explicit; // 紫色加号显式绑定：导出时无条件输出 molang 跟随指令
    child._boneMode = boneMode; // 'pivot' 真骨骼 / 'basepos' 纯枢轴吸附（2026-10-24 起语义已分离）
    // ★ 骨骼旋转源 = v.rotatex/y/z（用户算法规范）。父此前被块级 Gizmo 旋转过时写进的就是
    //   v.rotatex —— 这正是我们要的骨骼旋转源，无需折叠（旧实现折叠进 xrot 是「子骨骼自旋」元凶）。
    // 子块成为骨骼子块后纯跟随父（molang 驱动），删除其遗留的独立关键帧（若有），
    // 避免 UI 残留轨道误导，并防止播放时子块被其独立关键帧干扰而脱离父骨骼。
    // 【2026-10-19 · 关键帧去文件夹化】不再有「文件夹骨级关键帧」这一例外：
    //   文件夹已退化为纯分组容器，子块一律按逐方块关键帧处理。
    // force=true（enterKeyframeMode 强制设骨干）：永远不清 keyframeData，保留用户既有逐方块关键帧
    //   —— 否则枢轴/关键帧被清空导致"原本模型被篡改"（用户报：手动设骨干后整组枢轴异常）。
    if (!force && keyframeData.has(child.id)) { keyframeData.delete(child.id); keyframeEpoch++; }
    /* ★★★【2026-10-24 用户第 23 轮 · basepos 绑定语义回退为「纯枢轴吸附 + 外观保持」】
       用户原话：「basepos骨骼绑定语义改一下，不再用于旋转等操作…它只负责计算一下，
       把枢轴设为父骨骼的枢轴，并计算basepos使得自身模型不变，不再是真正的骨骼系统」。
       ⇒ 一次性计算，不建立任何骨骼驱动：
         ① 枢轴 = 父枢轴（v.xpos/ypos/zpos 设为 t.<父>_px/py/pz 的跟随式，父动则子块被动位移）；
         ② basepos 直接写成常量：把「旧枢轴 → 父枢轴」的位移用普通减法并入 basepos，
            不做任何旋转 / 缩放的逆变换（枢轴已用顶点捕捉对齐时该位移为 0，模型原地不动）；
         ③ 不继承父旋转、无 bone_rot 关节角、无 pR·bone 位移链、basepos 之后不再实时反解。
       旧存档（basepos 表达式含 t.<父>_b* 或有 _baseposA0）不经过本分支，仍走下方原有骨链。 */
    if (boneMode === 'basepos') {
        child.refresh();
        // 绑前旧枢轴（必须在 ③ 改 pos 之前取）+ 新枢轴（= 父枢轴）
        const _p0 = new THREE.Vector3(vnum(child, 'v.xpos'), vnum(child, 'v.ypos'), vnum(child, 'v.zpos'));
        const _pivotW = new THREE.Vector3(vnum(parent, 'v.xpos'), vnum(parent, 'v.ypos'), vnum(parent, 'v.zpos'));
        // ① 清理换绑 / 旧局部轴链残留的骨骼驱动量（否则导出仍会带骨链）
        ['parent_xrot', 'parent_yrot', 'parent_zrot', 'p_cx', 'p_sx', 'p_cy', 'p_sy', 'p_cz', 'p_sz',
            'pR00', 'pR01', 'pR02', 'pR10', 'pR11', 'pR12', 'pR20', 'pR21', 'pR22',
            'xbasepos_bone', 'ybasepos_bone', 'zbasepos_bone',
            'bone_rotx', 'bone_roty', 'bone_rotz'].forEach(n => child.scope.deleteVar('v.' + n));
        boneBaseposHelperNames().forEach(n => child.scope.deleteVar(n));
        delete child._baseposA0;
        // ② 换绑自枢轴模式时 rotate 是「父旋转 + 关节角」表达式 → 固化成当前常量（本语义不接父旋转）
        ['rotatex', 'rotatey', 'rotatez'].forEach(rn => {
            const d = child.scope.vars.get('v.' + rn);
            if (!d || !isMolangExpr(d.expr)) return;
            d.expr = String(_r4(normRotDeg(vnum(child, 'v.' + rn))));
            d.value = parseFloat(d.expr) || 0;
        });
        // ③ 枢轴 = 父枢轴（只发布/读取父位置，不读父旋转）
        ensureGlobalVar(`${prefix}_px`, `v.xpos`, parent.id);
        ensureGlobalVar(`${prefix}_py`, `v.ypos`, parent.id);
        ensureGlobalVar(`${prefix}_pz`, `v.zpos`, parent.id);
        [['xpos', 'px'], ['ypos', 'py'], ['zpos', 'pz']].forEach(([pn, gs]) => {
            const e = tk(gs);
            if (child.scope.vars.has('v.' + pn)) child.scope.setVarExpr('v.' + pn, e);
            else child.scope.addVar('v.' + pn, e, -1e4, 1e4, 0.01);
        });
        child.refresh();
        // ④ basepos 直接固化为常量（不做任何矩阵 / 逆变换）：
        //    pos 已改读父枢轴，旧枢轴的差值用普通减法并入 basepos ⇒ 枢轴对齐时位移为 0、模型不跳。
        //    ★块自身带 rotate / scale / extend 时这是近似（basepos 在 A 之后的局部空间里），
        //      本语义不再做旋转运算，关节摆动请用枢轴绑定。
        const _dPivot = _p0.sub(_pivotW);
        [['xbasepos', 0], ['ybasepos', 1], ['zbasepos', 2]].forEach(([n, i]) => {
            const val = _r4(vnum(child, 'v.' + n) + _dPivot.getComponent(i));
            const rg = getDefaultRange('v.' + n);
            if (child.scope.vars.has('v.' + n)) setConstVarValue(child, 'v.' + n, val);
            else child.scope.addVar('v.' + n, String(val), rg.min, rg.max, rg.step);
        });
        child.refresh();
        // ⑤ 后代子树按新枢轴重解，保持整棵树位置不变
        boneResolveSubtree(child, _subtreeSnap);
        if (_prevBoneParentId && _prevBoneParentId !== parent.id
            && !blocks.some(b => b !== child && b._boneParent === _prevBoneParentId)) {
            ['_bx', '_by', '_bz', '_ux', '_uy', '_uz'].forEach(suf => globalVars.delete(boneSafeId(_prevBoneParentId) + suf));
        }
        if (!silent) { recordAction(); showToast(`骨骼绑定：已将 ${child.id} 的枢轴对齐到 ${parent.id}（basepos 已固化为常量）`); }
        try {
            if (parent && parent.scope && parent.scope.molangMode && appendBonePublishToProgram(parent)) {
                parent.refresh();
                syncMolangEditorProgram(parent);
            }
        } catch (e) {}
        try { bonePatchMolangFollow(child, parent); } catch (e) {}
        return;
    }
    // 确保父块（骨干）自身拥有骨骼旋转变量 xrot/yrot/zrot（默认保留原值，不破坏其姿态）。
    // 文件夹骨骼的旋转统一走 xrot（本地旋转，动画只动它；与 getKeyframeCommandText 对骨骼根
    // coreOrder=['xpos','ypos','zpos','xrot','yrot','zrot'] 一致、也与导出格式一致）；
    // 子块跟随父的 xrot 做 pR 旋转矩阵 + 位置公转（见下方）。
    ['xrot', 'yrot', 'zrot'].forEach(rn => {
        const full = 'v.' + rn;
        if (!parent.scope.vars.has(full)) parent.scope.addVar(full, '0', -180, 180, 1);
    });
    // 父块发布全局：t.<父>_px/py/pz（世界位置）+ t.<父>_xrot/yrot/zrot（骨骼旋转源）。
    // ★ 骨骼旋转源只用 v.rotatex/y/z（用户算法规范：v.xrot/yrot/zrot 是方块自身外观旋转，
    //   不参与骨骼链，否则父的外观倾斜会被子块叠加 → 子骨骼自旋）。
    //   同时确保父块有 v.rotatex/y/z 变量（自由根没有时补 0），避免 evaluateExpression 读到 undefined。
    ['rotatex', 'rotatey', 'rotatez'].forEach(rn => {
        if (!parent.scope.vars.has('v.' + rn)) parent.scope.addVar('v.' + rn, '0', -180, 180, 1);
    });
    // 父块发布全局：t.<父>_px/py/pz（世界位置）+ t.<父>_xrot/yrot/zrot（骨骼旋转源）。
    // ★ 骨骼旋转源 = v.rotatex/y/z（用户算法规范：旋转 Gizmo 就是把世界轴旋转转成骨干的 rotate；
    //    xrot/yrot/zrot 是方块【自身外观旋转】，不参与骨骼链，绝不发布给子 ——
    //    否则父的外观倾斜会被子块叠加 → 子骨骼自旋（用户报"其他模型自己自旋"）。
    //    子块跟随：v.rotatex = t[父_xrot] + own（rotatex 增量）+ 位置 pR(父rotate)·offset。
    ['rotatex', 'rotatey', 'rotatez'].forEach(rn => {
        if (!parent.scope.vars.has('v.' + rn)) parent.scope.addVar('v.' + rn, '0', -180, 180, 1);
    });
    // ★ 父块发布全局：t.<父>_px/py/pz（世界位置）+ t.<父>_xrot/yrot/zrot（骨骼旋转源）。
    // 旋转源只用 v.rotatex/y/z；v.xrot/yrot/zrot 是方块自身外观旋转，不参与骨骼链，
    // 否则父的外观倾斜会被子块叠加 → 子骨骼自旋。同时把导出侧的 getBonePublishGlobalsString
    // / computeRelativeTransform 也改回 rotate-only，确保模拟器与 FMBE 完全一致。
    ensureGlobalVar(`${prefix}_xrot`, `v.rotatex`, parent.id);
    ensureGlobalVar(`${prefix}_yrot`, `v.rotatey`, parent.id);
    ensureGlobalVar(`${prefix}_zrot`, `v.rotatez`, parent.id);
    // 父枢轴全局：枢轴模式子块用它算世界位置；局部轴模式子块用它作【虚拟枢轴】(v.xpos = t.<父>_px)。
    // 两种模式都要发布，缺了会导致导出后子块枢轴归零。
    ensureGlobalVar(`${prefix}_px`, `v.xpos`, parent.id);
    ensureGlobalVar(`${prefix}_py`, `v.ypos`, parent.id);
    ensureGlobalVar(`${prefix}_pz`, `v.zpos`, parent.id);
    // ★【2026-10-24】两种绑定方式统一后，子块 basepos 不再跟随父 basepos（t.<父>_bx/by/bz 只留给
    //   旧版局部轴绑定链使用），新绑定不再发布这三个全局。
    // ★ 父块本身是旧版局部轴绑定（有视觉偏移锚点 u）→ 发布 t.<父>_ux/uy/uz，
    //   供枢轴子块以「父的视觉中心」为基准（否则整棵子树立在虚拟枢轴上，位置偏移）。
    ensureBoneAnchorGlobals(parent);
    child.scope.addVar('v.xbasepos_bone', '0', -100, 100, 0.1);
    child.scope.addVar('v.ybasepos_bone', '0', -100, 100, 0.1);
    child.scope.addVar('v.zbasepos_bone', '0', -100, 100, 0.1);
    // ★【2026-10-24】两种绑定方式的 pos 公式已统一为「父锚点 + pR·bone」，故 pR 矩阵两种模式都必须建。
    //   子块读取父旋转源（父的本地旋转 rotatex/y/z），用于构建 pR 旋转矩阵。
    // ★ 换绑（旧父 → 新父）时这些 pR 辅助变量已存在、表达式仍引用【旧父】的 t.<旧父>_xrot。
    //   只 addVar 不会覆盖既有表达式 ⇒ pR 继续按旧父旋转，而偏移按新父反解 ⇒ 换绑后根块位置漂移。
    //   必须统一 setVarExpr 重写为新父的表达式。
    {
        const _pv = (n, e, lo, hi, st) => { if (child.scope.vars.has(n)) child.scope.setVarExpr(n, e); else child.scope.addVar(n, e, lo, hi, st); };
        _pv('v.parent_xrot', tk('xrot'), -180, 180, 1);
        _pv('v.parent_yrot', tk('yrot'), -180, 180, 1);
        _pv('v.parent_zrot', tk('zrot'), -180, 180, 1);
        _pv('v.p_cx', 'math.cos(v.parent_xrot)', -1, 1, 0.01);
        _pv('v.p_sx', 'math.sin(v.parent_xrot)', -1, 1, 0.01);
        _pv('v.p_cy', 'math.cos(v.parent_yrot)', -1, 1, 0.01);
        _pv('v.p_sy', 'math.sin(v.parent_yrot)', -1, 1, 0.01);
        _pv('v.p_cz', 'math.cos(v.parent_zrot)', -1, 1, 0.01);
        _pv('v.p_sz', 'math.sin(v.parent_zrot)', -1, 1, 0.01);
        _pv('v.pR00', 'v.p_cy*v.p_cz + v.p_sy*v.p_sx*v.p_sz', -2, 2, 0.01);
        _pv('v.pR01', 'v.p_cy*v.p_sz - v.p_sy*v.p_sx*v.p_cz', -2, 2, 0.01);
        _pv('v.pR02', '-v.p_sy*v.p_cx', -2, 2, 0.01);
        _pv('v.pR10', '-v.p_cx*v.p_sz', -2, 2, 0.01);
        _pv('v.pR11', 'v.p_cx*v.p_cz', -2, 2, 0.01);
        _pv('v.pR12', '-v.p_sx', -2, 2, 0.01);
        _pv('v.pR20', 'v.p_sy*v.p_cz - v.p_cy*v.p_sx*v.p_sz', -2, 2, 0.01);
        _pv('v.pR21', 'v.p_sy*v.p_sz + v.p_cy*v.p_sx*v.p_cz', -2, 2, 0.01);
        _pv('v.pR22', 'v.p_cy*v.p_cx', -2, 2, 0.01);
    }
    // ★★ 子块旋转 = 父骨骼旋转源 + 【关节自转角 v.bone_rotx/y/z】（默认 0）（用户问题 2）。
    //   旧实现 v.rotatex = t.<父>_xrot 是"硬绑定"：子块完全没有自己的关节旋转，关节活动做不出，只能生硬跟随。
    //   现改为 rotate = 父旋转 + bone_rot：
    //     · bone_rot 是普通自定义变量 → Gizmo / 数据表 / 关键帧都能像正常 rotate 一样写入
    //       （对 v.rotatex 的写入由 _boneJointRotChannelRedirect 自动转发到 bone_rot）；
    //     · 用户也可直接手改 v.bone_rotx 数值或表达式；
    //     · 绑定瞬间把 (旧 rotate − 新父旋转) 写进 bone_rot，姿态完全不变。
    //   ⚠ 欧拉角直加是用户指定口径：多轴大角度下与真正矩阵乘法有偏差，做复杂多轴关节时建议单轴为主。
    ['rotatex', 'rotatey', 'rotatez'].forEach((rn, i) => {
        const full = 'v.' + rn;
        const own = 'v.bone_rot' + rn.charAt(rn.length - 1);
        const pRot = tk(rn.charAt(rn.length - 1) + 'rot'); // rotatex→xrot / rotatey→yrot / rotatez→zrot
        if (!child.scope.vars.has(own)) child.scope.addVar(own, '0', -180, 180, 1);
        const expr = `${pRot} + ${own}`;
        if (!child.scope.vars.has(full)) child.scope.addVar(full, expr, -180, 180, 1);
        else child.scope.setVarExpr(full, expr);
        // 姿态保持：新 rotate = 新父旋转 + bone_rot = 旧 rotate
        setConstVarValue(child, own, _r4(normRotDeg(_bindRot0.getComponent(i) - [_pRotX, _pRotY, _pRotZ][i])));
    });
    // —— 不改写子块外观旋转（v.xrot/yrot/zrot）：骨骼旋转源只用 rotatex/y/z（父 v.rotatex/y/z），
    //   v.xrot/yrot/zrot 是「方块自身外观旋转」，按用户算法规范不参与骨骼链，绝不被绑定改写。
    //   绑定只把子块 rotatex/y/z 设为父旋转源 molang（见上方），子块外观旋转原样保留（用户设定不动）；
    //   绑定后子块世界旋转 = R(父 rotatex)·R(子 xrot_原值)，随父刚体跟随——这正是骨骼「子随父转」的预期，
    //   无需把世界旋转反解回 xrot（旧实现反解会覆盖用户 xrot，导致「rot 变量被篡改」）。
    // —— 位置保持：骨骼偏移【仅】由枢轴坐标(pos)之差决定，与 basepos 无关 ——
    // ★ basepos 是几何相对枢轴的【局部偏移】，由 computeTransformMatrix 的 localMat(matB) 自动挂在枢轴上，
    //   会随枢轴一起被父骨骼 pR 带动（localMat 在 globalRot 之后、自身旋转之前，故随子块 v.rotatex 跟随父旋转
    //   而整体公转）。所以【绝不】清零 basepos，也不把它折进 xbasepos_bone。
    //   旧实现用 blockWorldPos（= 枢轴 + 旋转后的 basepos）算偏移再清零 basepos，把「几何局部偏移」错当
    //   「枢轴偏移」折进世界帧，导致 basepos≠0 且子块有自身旋转/缩放时模型视觉移位
    //   （用户报：紫色加号绑骨后模型移位）。此处改用纯枢轴坐标差 (xpos,ypos,zpos)。
    // ★ pivot 取 (xpos,ypos,zpos)（computeTransformMatrix 的 matP 平移量，不含 basepos）；
    //   _pRpInv0 仍是父骨骼旋转源(v.rotatex/y/z)逆矩阵（表达式设置前快照，未被父旋转污染）。
    // ★★★【2026-10-24 用户第 22 轮 · 两种绑定共用一套「真枢轴」公式】
    //   旧局部轴绑定把位移全部塞进 basepos（basepos = A子(t)⁻¹·A0·(父basepos + bone)），后果：
    //     · 引擎旋转中心恒为 v.xpos，而局部轴子块的 v.xpos = 父枢轴 ⇒ rotate 绕【最高级父骨骼】转；
    //     · basepos 被实时反解补偿 ⇒ 改 rot 时几何原点不动、模型绕【自身重心】转（用户实测：两种绑定方式
    //       的旋转中心都不是自己设定的枢轴，做不出关节活动）。
    //   正解：枢轴偏移照样走 xbasepos_bone，但必须写进【pos】，且 basepos 保持「自身几何相对自身枢轴的
    //   偏移」常量不动 ⇒ rot 与 rotate 都绕【绑定前该方块自己的枢轴】转；下级方块读本块 pos 继续接力。
    //   两种绑定方式的差别只剩「初始 bone 偏移的表示空间」（局部轴额外过父的 A0），行为完全一致。
    //   旧版实时反解链（p_a0*/p_u*/p_r*）残留：先把 basepos 冻成常量，再整体删除，避免表达式引用已删变量。
    child.refresh();
    ['xbasepos', 'ybasepos', 'zbasepos'].forEach(n => {
        const d = child.scope.vars.get('v.' + n);
        if (d && isMolangExpr(d.expr)) { d.expr = String(_r4(vnum(child, 'v.' + n))); d.value = parseFloat(d.expr) || 0; }
    });
    boneBaseposHelperNames().forEach(n => child.scope.deleteVar(n));
    delete child._baseposA0;
    const _cp = _bindPos0.clone();
    // ★ 枢轴的基准是父的【锚点】：普通父块 = v.xpos，旧版局部轴父块还要把它的视觉偏移 u 一并计入。
    const _pp = boneAnchorOf(parent);
    const _off = _cp.sub(_pp).applyMatrix3(_pRpInv0);
    setConstVarValue(child, 'v.xbasepos_bone', _r4(_off.x));
    setConstVarValue(child, 'v.ybasepos_bone', _r4(_off.y));
    setConstVarValue(child, 'v.zbasepos_bone', _r4(_off.z));
    // 注意：不再 setConstVarValue(child, 'v.xbasepos'/'v.ybasepos'/'v.zbasepos', 0) —— basepos 保持绑前原值不动。
    ensureBoneAnchorGlobals(parent);
    const [_ex, _ey, _ez] = bonePivotPosExprs(parent);
    child.scope.setVarExpr('v.xpos', _ex);
    child.scope.setVarExpr('v.ypos', _ey);
    child.scope.setVarExpr('v.zpos', _ez);
    // ★★ 绑定后整棵后代子树的世界原点必须与绑定前完全一致（用户问题 1）：
    //   根块 rotate 被换成「父旋转 + bone_rot」、pos/basepos 被换成跟随式之后，后代仍按旧的局部偏移解算，
    //   整棵树就会位移/姿态跳变。这里按快照逐级重解 xbasepos_bone（父级先 refresh，子级再解）。
    boneResolveSubtree(child, _subtreeSnap);
    // 相对父偏移(枢轴差)已写入 xbasepos_bone；basepos 保持不动，由 localMat 自动挂枢轴随父公转，
    // 不在此重复叠加（避免双重错位），也不清零，故 basepos≠0 的模型绑定后视觉零位移。
    // 换绑：旧父已无任何子块时，清掉它发布的 t.<旧父>_bx/by/bz，避免导出残留无主的 basepos 广播
    if (_prevBoneParentId && _prevBoneParentId !== parent.id
        && !blocks.some(b => b !== child && b._boneParent === _prevBoneParentId)) {
        ['_bx', '_by', '_bz', '_ux', '_uy', '_uz'].forEach(suf => globalVars.delete(boneSafeId(_prevBoneParentId) + suf));
    }
    if (!silent) {
        child.refresh();
        recordAction();
        // 小提示冒泡：只保留简短成功消息（不要大弹窗干扰编辑）；极端未生成时仍用大弹窗提示排查。
        let _gen = 0;
        try { child.scope.vars.forEach(d => { if (d && d.expr && String(d.expr).includes(`t.${prefix}_`)) _gen++; }); } catch (_) {}
        if (_gen) {
            showToast(`骨骼绑定：已将 ${child.id} 绑定到 ${parent.id}`);
        } else {
            showModal("骨骼绑定", `已将 ${child.id} 绑定到 ${parent.id}，但未生成 molang。请把这句话截图发我排查。`, null, false);
        }
    }
    // ★【三处一致 2026-09-30】父块若已处于 molang 接管：把新增的「广播全局」段补进其 program，
    //   否则用户「先开 molang 再绑骨」时编辑器看不到 t.<父>_*，而导出会补上 → 三处不一致（用户报）。
    try {
        if (parent && parent.scope && parent.scope.molangMode && appendBonePublishToProgram(parent)) {
            parent.refresh();
            syncMolangEditorProgram(parent);
        }
    } catch (e) {}
    // ★【molang 接管态子块】scope 的跟随表达式不会被执行（recompute 只跑 program），
    //   必须把同一段跟随逻辑补到程序末尾，否则绑定后子块仍跟旧父/不跟父。
    try { bonePatchMolangFollow(child, parent); } catch (e) {}
}

// 解除骨骼绑定：冻结在当前世界位置，移除跟随表达式与骨骼辅助变量（t.PARENT_* 全局别名保留，无害）
// silent=true：由删除方块等内部流程调用，不弹窗、不重复 recordAction（调用方负责）。
function unbindBone(child, silent = false) {
    if (!child || !child.scope) return;
    const scope = child.scope;
    const parentId = child._boneParent;
    // ✅ 冻结【枢轴】而非几何原点：骨骼子块的 v.xpos 是 molang 跟随表达式，refresh 后求值即为枢轴坐标；
    // 若用 blockWorldPos（= 枢轴 + 旋转后的 basepos，几何原点）赋值给 v.xpos，普通块重渲时会再叠加一次
    // basepos（computeTransformMatrix 的 localMat 仍以 basepos 作局部位移）→ basepos 被重复累加、模型偏移。
    // 这是旧 bindBone「清零 basepos」时代的兼容写法：当时 geometry==pivot 故无碍；改为保留 basepos 后必须冻枢轴。
    // ★★【顺序铁律】必须在【删除 _boneParent / 清父全局之前】快照：此刻子块仍正确跟随父级，
    //   refresh 后求值即为当前世界值；一旦解绑并清掉父级 t.<id>_* 全局，残留的
    //   v.xpos=t.父_px+… / v.rotatex=t.父_xrot 再求值会退化成 0（子块位置/旋转被清成 0，模型跑位）。
    child.refresh();
    const _wasBasepos = getBoneMode(child) === 'basepos';
    const _FREEZE = ['xpos', 'ypos', 'zpos', 'rotatex', 'rotatey', 'rotatez'];
    // 局部轴绑定的 basepos 是跟随表达式，解绑前必须一并冻结成常量（删除 xbasepos_bone 后表达式会失效）
    if (_wasBasepos) _FREEZE.push('xbasepos', 'ybasepos', 'zbasepos');
    const _frozen = {};
    for (const n of _FREEZE) _frozen[n] = _r4(vnum(child, 'v.' + n));
    delete child._boneParent;
    delete child._boneExplicit;
    delete child._boneMode;
    /* ★★★【2026-10-17 用户第 16 轮 · 新操作模式「解绑」按钮"完全无效"的真根因】
       旧实现用 `setConstVarValue` 冻结，被两道闸各自拦下 —— 两闸都只看"残留 molang 表达式"、不看元数据：
         ① kfGizmoWriteVar：方块有关键帧时把写入改投到关键帧数据（value 落不到 scope.vars）；
         ② _guardBoneFollowWrite：_boneParent 删除后 getBoneParentId 回退 inferMolangBoneParent，
            凭残留的 v.xpos=t.父_px / v.rotatex=t.父_xrot 仍认出父级 → 旋转直接拒写、位置被改写成
            "相对父偏移"（等价于没冻结）。
       ⇒ 数值没冻结（用户看得见）+ 表达式残留 ⇒ inferMolangBoneParent 仍返回父级 ⇒ 方块列表缩进不取消。
       正解 = 与 constantizeBlock 同口径：**直接改元数据**（d.expr / d.value），绕过一切跟随通道守卫。 */
    for (const n of _FREEZE) {
        const full = 'v.' + n;
        const rg = getDefaultRange(full);
        const val = esGuardVarValue(full, _frozen[n]);
        const d = scope.vars.get(full);
        if (d) { d.expr = String(val); d.value = val; d.rangeMin = rg.min; d.rangeMax = rg.max; d.step = rg.step; }
        else scope.vars.set(full, new VarDef(String(val), val, rg.min, rg.max, rg.step));
    }
    // 骨骼跟随辅助量（pR 矩阵 / p_c* / parent_* / *basepos_bone / own_bone_rot*）整体删除：
    // 它们是指令末尾按需重算的派生态，残留会让 inferMolangBoneParent 继续认出父级（缩进不消失）。
    ['v.xbasepos_bone', 'v.ybasepos_bone', 'v.zbasepos_bone',
     'v.bone_rotx', 'v.bone_roty', 'v.bone_rotz',              // 关节角：解绑后已折进冻结的 rotate，无主
     'v.own_bone_rotx', 'v.own_bone_roty', 'v.own_bone_rotz',  // 旧版本残留的 own_bone_rot* 也清掉
     'v.parent_xrot', 'v.parent_yrot', 'v.parent_zrot',        // bindBone 实际创建的父旋转源变量
     'v.parent_rotatex', 'v.parent_rotatey', 'v.parent_rotatez', // 旧版本残留名也保留清理
     'v.p_cx', 'v.p_sx', 'v.p_cy', 'v.p_sy', 'v.p_cz', 'v.p_sz',
     'v.pR00', 'v.pR01', 'v.pR02', 'v.pR10', 'v.pR11', 'v.pR12', 'v.pR20', 'v.pR21', 'v.pR22'
    ].forEach(n => scope.deleteVar(n));
    delete child._boneFollowSeg; // molang 接管态追加的跟随段已随 program 重建而消失，标记一并清掉
    // molang 接管方块：program 里的整段跟随表达式也必须一并重建，否则编辑器/导出仍引用父骨骼 t.<父>_*
    // （非关键帧块 → generateMolangBaseline 按冻结后的变量表重生成；可编译的关键帧块 → 强制重编译）。
    if (scope.molangMode) {
        try {
            if (typeof hasKeyframeAnimation === 'function' && hasKeyframeAnimation(child.id) && kfCanUseCompiled(child)) {
                kfEnsureProgram(child, true);
            } else {
                scope.program = generateMolangBaseline(child);
                scope.kfLastCompiled = null;
            }
        } catch (e) { }
    }
    child.refresh();
    // 清理父骨骼的全局别名变量（t.PARENT_px/py/pz、t.PARENT_rotatex/y/z）：仅当已无其它子块
    // 仍以该父为骨骼父时才删除，避免误删仍被其它子块引用的父全局变量。否则父会被 isBoneRoot
    // 误判为骨骼根，导致「解除骨干」后文件夹仍被识别成骨骼（F_isBone_afterClear 不还原的根因）。
    if (parentId && !blocks.some(b => b !== child && b._boneParent === parentId)) {
        // 注意：bindBone 发布的是 t.<父>_xrot（_xrot 后缀），早期版本用 _rotatex —— 两个后缀都清，
        // 否则 'A_xrot' 残留在 globalVars → isBoneRoot(A) 仍为 true → 解除骨干后文件夹还被当骨骼。
        // 局部轴绑定额外发布的 _bx/_by/_bz 也必须清掉，否则残留父 basepos 全局。
        // _ux/_uy/_uz 是「视觉偏移锚点」(2026-10-22)，同样要清。
        ['_px', '_py', '_pz', '_ux', '_uy', '_uz', '_xrot', '_yrot', '_zrot', '_bx', '_by', '_bz'].forEach(suf => {
            const gk = boneSafeId(parentId) + suf;
            if (globalVars.has(gk)) globalVars.delete(gk);
        });
    }
    if (!silent) {
        recordAction();
        showModal("解除骨骼", `${child.id} 已脱离父骨骼并冻结在当前位置`, null, false);
    }
}

// 文件夹骨骼：把 folder 内【本级别】其余方块自动 ✛ 绑定到指定骨干方块(cubeId)，
// 等价于用户手动把每个块都 ✛ 绑定到同一个 cube。只有用户显式「设为骨干」才触发，
// 普通文件夹(无 _backbone)保持静态分组。骨干自身不绑定（做根），其余块写 _boneParent 成为其子。
// force=true：用户明确"将骨骼添加进动画"(enterKeyframeMode)，无视 hasPerBlockKf 守卫强制设骨干；
//              bindBone 内部不清子块已有 keyframeData（保护枢轴/关键帧不被篡改）。
function designateFolderBackbone(folderName, cubeId, silent, force) {
    const members = blocks.filter(b => b.group === folderName);
    if (members.length < 1) { if (!silent) showKfBubble('该文件夹没有方块，无法设为骨骼', { confirmText: '知道了' }); return null; }
    const backbone = members.find(b => b.id === cubeId) || members[0];
    const f = getFolder(folderName);
    if (f) {
        f._backbone = backbone.id;
        // 骨骼文件夹不存储任何枢轴数据（用户定稿：文件夹枢轴/旋转与骨干方块直接挂等号）。
        // folderGizmoCenterWorld 对骨骼文件夹实时读骨干世界位置，绑定瞬间固化的 f.pivot 反而是
        // 「父骨骼旋转后子骨骼 Gizmo 枢轴原地不动」的元凶，故删除任何遗留的静态枢轴。
        delete f.pivot;
    }
    // ★ 骨骼旋转源 = v.rotatex/y/z（用户算法规范）：骨干已有旋转就留在 rotate 变量里，
    //    bindBone 发布 t.父_xrot = v.rotatex，子块经 molang 实时跟随 —— 无需折叠进 xrot。
    // 把骨干文件夹内【本级别】其余方块绑到骨干
    members.forEach(b => {
        if (b.id === backbone.id) return;
        // 已绑定则跳过（保留既有层级）—— 除非 force=true（进入关键帧模式重建 molang）：
        // 静态模式绑定的子块只有 _boneParent 元数据、没有 molang 跟随表达式，
        // 关键帧入口必须重新注入 molang，否则进入动画后子块不跟随父骨骼。
        if (b._boneParent && !force) return;
        // 保留用户原先选择的绑定方式（枢轴 / 局部轴）；静态文件夹绑定不注入 molang，方式无影响
        bindBone(b, backbone, true, true, force, false, b._boneMode || 'pivot');
    });
    // 手动设骨干后同步整棵文件夹骨骼树：本文件夹骨干绑定到父文件夹骨干、并向下传播到子文件夹
    // （文件夹骨骼 = 自动 molang 绑定，bone→bone1 层级旋转实时联动）。
    // ★ 只同步当前文件夹：syncFolderBoneHierarchy 的第 2 步本身会遍历所有 folders 的
    // parentName 关系把子文件夹骨干绑上来，无需也无权全量处理（无参会把用户没碰的
    // 普通分组文件夹也强制设骨干 + bindBone，导致模型被篡改 —— 用户报告过的 bug）。
    if (!_syncFolderBoneBusy) syncFolderBoneHierarchy(new Set([folderName]));
    keyframeEpoch++;
    if (!silent) {
        if (typeof renderSideBlockList === 'function') renderSideBlockList();
        showToast(`文件夹「${folderName}」已绑定为骨骼，骨干=${backbone.id}`);
        recordAction();
    }
    return backbone.id;
}
// 解除文件夹骨骼：解除本级别所有块的绑定，清除 _backbone 标记，回到静态分组
function clearFolderBackbone(folderName) {
    const members = blocks.filter(b => b.group === folderName);
    members.forEach(b => { if (b._boneParent) unbindBone(b); });
    const f = getFolder(folderName);
    if (f) delete f._backbone;
    keyframeEpoch++;
    if (typeof renderSideBlockList === 'function') renderSideBlockList();
    recordAction();
    showToast(`已解除文件夹「${folderName}」骨骼`);
}

// 把方块加入一个【已设骨干的骨骼文件夹】时，自动 ✛ 绑定到骨干（等价于用户手动紫色加号），
// 使其通过 molang 实时跟随文件夹的骨骼关键帧动画。修复「关键帧动画下新建方块加入文件夹却吃不到动画」。
// 调用前必须先设置 block.group = folderName（bindBone 内部依赖 child.group 判断骨骼关键帧归属）。
function autoBoneBindOnFolderAdd(block, folderName) {
    const f = folderName ? getFolder(folderName) : null;
    if (!f || !block) return;
    // 已是骨骼文件夹：新块自动绑到骨干，跟随动画
    if (f._backbone) {
        const bb = blocks.find(b => b.id === f._backbone);
        if (bb && bb.id !== block.id) bindBone(block, bb, true, true);
    } else {
        // 文件夹尚无骨干：立即把当前方块指定为骨干，保证“拖入/导入后不允许出现无骨干文件夹”
        // designateFolderBackbone 会把同文件夹内其它方块也自动绑到该骨干。
        designateFolderBackbone(folderName, block.id, true, true);
    }
}
// 方块在列表里被拖动（拖到空白处 / 移出文件夹）时，解除其骨骼绑定并冻结在当前世界位置。
// 注意：紫色加号显式绑定（手动 ✛ 或导入命令里的 v.parent_* 子骨骼）是用户指定的骨骼关系，
//       与文件夹设骨干无关；这类子骨骼不应通过「在列表里拖拽」来解绑骨骼（用 isExplicitBoneBinding 判定，
//       它能正确识别手动绑定 _boneExplicit=true 以及导入命令里无文件夹的 v.parent_* 子骨骼）。
//       只有「文件夹设骨干」自动产生的骨骼子块，拖出文件夹时才解除绑定。
function autoBoneUnbindOnFolderRemove(block) {
    if (!block || !block._boneParent) return;
    if (isExplicitBoneBinding(block)) return; // 显式绑定保留，只移出文件夹分组
    unbindBone(block);
}

// 文件夹骨骼层级同步：把「文件夹层级(parentName)」自动换算成 molang 骨骼链 ——
// 等价于用户对每个子文件夹的骨干手动 ✛ 绑定到父文件夹骨干（用户要求的“文件夹骨骼 =
// 自动紫色加号绑定”）。这样即使不经导入，手动建出的 bone→bone1→… 文件夹树在旋转/位移
// 父文件夹时，子文件夹的方块也能实时刚性跟随。
// 规则：
//  1) 每个含方块的文件夹（哪怕只有 1 个方块）都设骨干（首块），
//     —— 骨干方块在方块列表中显示为【斜体】，用户可见；
//  2) 按 folder.parentName 把子文件夹骨干 ✛ 绑定到父文件夹骨干（树形无环，反复扫描直到全部解析）；
//  3) 已绑定的跳过（保留既有层级），避免覆盖用户显式绑定。
let _syncFolderBoneBusy = false;
function syncFolderBoneHierarchy(touchedNames, options) {
    if (_syncFolderBoneBusy) return; // 防重入：designateFolderBackbone 内部会再触发本函数
    _syncFolderBoneBusy = true;
    try {
        const names = (touchedNames && touchedNames.size)
            ? Array.from(touchedNames)
            : folders.map(f => f.name);
        const force = !!(options && options.force);
        // 1) 给每个含方块的文件夹设骨干（首块为根，其余绑到根；与父子顺序无关）。
        //    force=true（用户明确"将骨骼添加进动画"= enterKeyframeMode）时无视 hasPerBlockKf 守卫：
        //    含逐方块关键帧的文件夹也强制设骨干 —— 因为用户此时就是要"用骨骼统一管"，不是保留独立动画。
        //    bindBone 在 force 模式下不清子块 keyframeData（保护既有逐方块关键帧不被丢失/枢轴被篡改）。
        //    静态分组（drop/import 触及）仍保留 hasPerBlockKf 守卫，避免误把"独立动画文件夹"偷偷转骨骼。
        const hasPerBlockKf = (n) => getFolderAllCubeIds(n).some(id => keyframeData.has(id) && keyframeData.get(id).frames.size > 0);
        const needBackbone = names.filter(n => getFolderAllCubeIds(n).length >= 1 && (force || !hasPerBlockKf(n)));
        needBackbone.forEach(n => {
            if (!getBoneBlocksOfFolder(n)) {
                const ids = getFolderAllCubeIds(n);
                designateFolderBackbone(n, ids[0], true, force);
            }
        });
        // 2) 按 parentName 把子骨干绑到父骨干（父先于子完成设骨干，反复扫描直至全部解析）
        let changed = true, guard = 0;
        const maxIter = folders.length + 5;
        while (changed && guard++ < maxIter) {
            changed = false;
            for (const f of folders) {
                if (!f.parentName) continue;
                const parent = getFolder(f.parentName);
                if (!parent || !parent._backbone) continue;
                const fFolder = getFolder(f.name);
                const fBack = fFolder && fFolder._backbone;
                if (!fBack) continue;
                const fBlock = blocks.find(b => b.id === fBack);
                const pBlock = blocks.find(b => b.id === parent._backbone);
                if (!fBlock || !pBlock || fBlock._boneParent) continue; // 已绑定则跳过，避免覆盖既有层级
                // ★ 跨文件夹绑父骨前：快照 fBlock 全部后代子块的世界矩阵（含旋转）。
                //   绑定会改写 fBlock 自身的 xrot（旋转保持反解），而其后代子块（如左腿腿部的 54-72）
                //   此前已按【旧父姿态】反解过 xrot —— 父姿态一变，子块旋转基准失效 → 乱飞（用户报：
                //   同级导入 → 拖拽嵌套 → 进关键帧模式全量绑骨，子骨骼方块全部乱飞）。
                //   绑定完成后，对每个后代子块用 _kfWorldToVars 按【绑定前快照的世界矩阵】重新反解 xrot，
                //   使子块世界旋转精确保持绑定前姿态（且相对新父的跟随表达式 rotatex=t[父_xrot] 不变）。
                const _chainSnap = [];
                try {
                    collectBoneBlocks([fBlock.id]).forEach(id => {
                        if (id === fBlock.id) return;
                        const cb = blocks.find(x => x.id === id);
                        if (cb) _chainSnap.push({ id, W: _blockWorldMatrix(cb) });
                    });
                } catch (e) {}
                bindBone(fBlock, pBlock, true, true);
                if (_chainSnap.length) {
                    blocks.forEach(b => { try { b.refresh(); b.mesh.updateMatrixWorld(true); } catch (e) {} });
                    _chainSnap.forEach(({ id, W }) => {
                        const cb = blocks.find(x => x.id === id);
                        if (!cb) return;
                        try {
                            const pid2 = getBoneParentId(cb);
                            const pp = pid2 ? blocks.find(x => x.id === pid2) : null;
                            // ① 旋转保持：按【绑定前世界矩阵 W】反解新 xrot
                            const bv = {
                                rotatex: vnum(cb, 'v.rotatex'), rotatey: vnum(cb, 'v.rotatey'), rotatez: vnum(cb, 'v.rotatez'),
                                extend_scale: vnum(cb, 'v.extend_scale'), extend_xrot: vnum(cb, 'v.extend_xrot'), extend_yrot: vnum(cb, 'v.extend_yrot'),
                                scale: vnum(cb, 'v.scale')
                            };
                            const s = _kfWorldToVars(bv, W);
                            if (s && Number.isFinite(s.xrot)) {
                                setConstVarValue(cb, 'v.xrot', s.xrot);
                                setConstVarValue(cb, 'v.yrot', s.yrot);
                                setConstVarValue(cb, 'v.zrot', s.zrot);
                            }
                            // ② 位置保持：父姿态已变（pR 矩阵跟着变），旧 xbasepos_bone 失效，
                            //    按绑定前世界矩阵的平移反解新偏移：off = RpInv(父骨骼旋转源 rotatex)·(W位置 − 父世界位置)
                            if (pp) {
                                // ★ 父骨骼旋转源 = v.rotatex/y/z（与子块重建 pR 一致），绝不用 rotatex+xrot 总旋转，
                                //   否则跨文件夹绑定（如腿根→腿）后子块偏移被多转一道父 xrot → 错位。
                                const pRotX = vnum(pp, 'v.rotatex');
                                const pRotY = vnum(pp, 'v.rotatey');
                                const pRotZ = vnum(pp, 'v.rotatez');
                                const RpInv2 = boneParentMatrix(pRotX, pRotY, pRotZ).clone().invert();
                                const pw2 = blockWorldPos(pp);
                                const off2 = new THREE.Vector3(W.elements[12], W.elements[13], W.elements[14]).sub(pw2).applyMatrix3(RpInv2);
                                setConstVarValue(cb, 'v.xbasepos_bone', _r4(off2.x));
                                setConstVarValue(cb, 'v.ybasepos_bone', _r4(off2.y));
                                setConstVarValue(cb, 'v.zbasepos_bone', _r4(off2.z));
                            }
                        } catch (e) {}
                    });
                    blocks.forEach(b => { try { b.refresh(); b.mesh.updateMatrixWorld(true); } catch (e) {} });
                }
                changed = true;
            }
        }
        keyframeEpoch++;
        if (typeof renderSideBlockList === 'function') renderSideBlockList();
    } finally {
        _syncFolderBoneBusy = false;
    }
}

// 导入带有 parentbone 跨文件夹层级的模型时，把整段导入内容连成一根完整骨骼树：
//  · 每个多块文件夹默认以首块为骨干（designateFolderBackbone），等价于用户手动「设骨干」；
//  · 再按 folder.parentName（由 parentbone 链还原）把子文件夹的骨干 ✛ 绑定到父文件夹的骨干，
//    从而【身体→腿根→腿→脚跟】全部刚性联动（不仅是单文件夹内部）。
// 普通模型（文件夹无 parentName）不会进入跨文件夹绑定分支，保持原有静态分组 / 单文件夹骨骼行为。
// touchedNames：本次导入触及的文件夹集合；为空则处理全部文件夹（用于手动补链）。
function rigImportedBones(touchedNames) {
    syncFolderBoneHierarchy(touchedNames);
}

function ensureGlobalVar(key, expr, sourceBlockId) {
    if (!globalVars.has(key)) {
        const rg = getDefaultRange(`t.${key}`);
        globalVars.set(key, { def: new VarDef(expr, 0, rg.min, rg.max, rg.step), sourceBlockId: sourceBlockId });
    }
    // 已存在的全局变量（可能已被用户自定义，例如把 v.xrot 改为 v.rotatex）一律保留，
    // 不再用预设 expr 覆盖——否则对同一父级再次绑定时会把用户修改清空，导致骨骼绑定"失效"。
}
function escapeHtml(str) { return str.replace(/[&<>"]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : m === '>' ? '&gt;' : '&quot;'); }
// ==================== 通用科技泡泡管线 showTechBubble ====================
// 所有"提示/单按钮/双按钮/自动消失 toast"轻量气泡都走这里；showModal 无回调纯预览路径、
// showKfBubble、showToast 都通过它实现。视觉/动画与 .molang-num-bubble 一致：浅蓝菱形呼吸灯 + 呼吸辉光 + 爆闪炸开。
// opts:
//   mode          'bubble'(默认) | 'toast' — toast 形态无按钮、按 duration 自动消失
//   confirmText   单按钮文本（默认'知道了'）；当 cancelText 给出时成为确认按钮
//   cancelText    若给出则渲染双按钮（确认+取消）
//   onConfirm / onCancel  关闭回调（act=ok/cancel/toast）
//   variant       'info' | 'success' | 'warn' | 'danger' — 决定菱形灯+确认按钮配色
//   contentHtml   若给定则作为原始 HTML 插入（不转义）；否则 content 作为文本被 escapeHtml
//   duration      >0 时自动关闭（毫秒）；toast 模式为唯一关闭方式，bubble 模式单按钮时也支持
function showTechBubble(title, content, opts = {}) {
    const { confirmText = '知道了', cancelText = '', onConfirm = null, onCancel = null,
            variant = 'info', contentHtml = null, duration = 0, mode = 'bubble' } = opts;
    const isToast = mode === 'toast';
    const existing = document.querySelector('.tech-bubble:not(.tb-burst)');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'tech-bubble tb-' + variant + (isToast ? ' tb-toast' : '');
    const safeTitle = escapeHtml(title || '');
    const bodyCls = safeTitle.trim() ? '' : ' tb-no-title';
    const cHTML = contentHtml !== null ? contentHtml : escapeHtml(content || '');
    let btns = '';
    if (!isToast) {
        btns = `<button class="tb-ok tb-${variant === 'danger' ? 'danger' : 'confirm'}">${escapeHtml(confirmText)}</button>`;
        if (cancelText) btns += `<button class="tb-cancel">${escapeHtml(cancelText)}</button>`;
    }
    el.innerHTML = `<i class="tb-diamond" aria-hidden="true"></i><div class="tb-body${bodyCls}"><div class="tb-title">${safeTitle}</div><div class="tb-content">${cHTML}</div></div><div class="tb-btns">${btns}</div>`;
    document.body.appendChild(el);
    const close = (act) => {
        el.classList.add('tb-burst');
        el.addEventListener('animationend', () => el.remove(), { once: true });
        setTimeout(() => { if (el.parentNode) el.remove(); }, 380);
        if (act === 'ok' && onConfirm) onConfirm();
        else if (act === 'cancel' && onCancel) onCancel();
        else if (act === 'toast' && onConfirm) onConfirm();
    };
    if (!isToast) {
        el.querySelector('.tb-ok').onclick = () => close('ok');
        const cancelBtn = el.querySelector('.tb-cancel');
        if (cancelBtn) cancelBtn.onclick = () => close('cancel');
        if (duration > 0 && !cancelText) setTimeout(() => close('ok'), duration);
    } else {
        // toast：duration 到点自动炸开消失（不传 onConfirm 即可静默）
        const ms = duration > 0 ? duration : 2000;
        setTimeout(() => close('toast'), ms);
    }
    return el;
}
function showModal(title, content, onConfirm = null, isTextarea = true) {
    // 纯展示（无回调 + 非输入）→ 自动走通用科技泡泡管线（小冒泡）
    if (!onConfirm && !isTextarea) {
        return showTechBubble(title, '', { contentHtml: content, confirmText: '知道了' });
    }
    // 带输入或带回调 → 保留 modal 形态（不适合小冒泡的轻量感）
    const modalDiv = document.createElement('div'); modalDiv.className = 'modal';
    let innerHtml = `<div class="modal-content"><h3 style="color:#38bdf8;">${title}</h3>`;
    if (isTextarea) innerHtml += `<textarea class="modal-input-text" id="modalInput" rows="5">${content || ''}</textarea>`;
    else innerHtml += `<div class="preview-code" id="modalPreview">${content || ''}</div>`;
    innerHtml += `<div class="modal-buttons"><button class="modal-btn" id="modalConfirm">确认</button><button class="modal-btn" id="modalCancel">取消</button></div></div>`;
    modalDiv.innerHTML = innerHtml; document.body.appendChild(modalDiv);
    const confirmBtn = modalDiv.querySelector('#modalConfirm'), cancelBtn = modalDiv.querySelector('#modalCancel'), input = modalDiv.querySelector('#modalInput');
    confirmBtn.onclick = () => { const val = input ? input.value : null; modalDiv.remove(); if (onConfirm) onConfirm(val); };
    cancelBtn.onclick = () => modalDiv.remove(); if (input) input.focus();
}
// 关键帧专用轻量气泡提示（替代系统 alert）→ 内部走通用管线 showTechBubble
// opts: { confirmText, cancelText, onConfirm, onCancel }
function showKfBubble(msg, opts = {}) {
    const { confirmText = '知道了', cancelText = '', onConfirm = null, onCancel = null } = opts;
    if (cancelText) {
        return showTechBubble('', '', { contentHtml: escapeHtml(msg), confirmText, cancelText, onConfirm, onCancel });
    }
    return showTechBubble('', '', { contentHtml: escapeHtml(msg), confirmText, onConfirm });
}
function parseAssignment(str) { const m = str.match(/^([vt]\.[a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/); if (m) return { name: m[1], expr: m[2].trim() }; return null; }


// 导出命令的前缀/后缀（带本地存储）
let exportPrefix = localStorage.getItem('ex_export_prefix') || `execute  positioned ~-1~~ run playanimation @e[x=~,z=~,y=~,r=1] animation.player.attack.positions _ 0 "`;
let exportSuffix = (() => {
    const raw = localStorage.getItem('ex_export_suffix') || '';
    return raw.includes('方块编号：') ? '' : raw;   // 迁移：旧存档自带标签 → 交回自动附加，输入窗口只留自定义文本
})();
function savePrefixSuffix() {
    localStorage.setItem('ex_export_prefix', exportPrefix);
    localStorage.setItem('ex_export_suffix', exportSuffix);
}
