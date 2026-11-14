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
    // ★★2026-11-10 用户定稿：**绑定语义 = 子块绕自身枢轴旋转，旋转中心恒为父块枢轴**。
    //   旧实现在「父块是 basepos 局部轴绑定（有 A0）」时返回 'u'，让子块去绕父块的
    //   **视觉中心**（枢轴 + R·u）转 —— 那会让父子距离随父块 basepos 变化，与骨骼语义冲突，
    //   而且每块 base 都要白写三条 `v.parent_ux=0;…`（共享动画的固定输入槽）。
    //   现已整层删除：偏移一律从父块枢轴量起（= v.xbasepos_bone 的定义），
    //   故这里恒返回 'p'；'u' 分支与 t.<id>_ux/uy/uz 发布全部废止。
    return 'p';
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
// ==================== ★ 共用骨骼跟随动画 bone_follow（2026-11-07） ====================
// 用户定稿：所有枢轴绑定子块的跟随数学完全一样（pR 矩阵 / 父枢轴 + pR·bone / 关节旋转），
// 因此抽成【一个】全局动画控制器，被全部骨骼子块共用（导出时每块仍带自己的方块编号 + 控制器名）。
// 动画只读写块局部变量（每个子块执行时各算各的），统一输入：
//   v.parent_xrot/yrot/zrot ← t.<父>_xrot/yrot/zrot
//   v.parent_px/py/pz       ← t.<父>_px/py/pz（父块的**枢轴**世界位置）
//   v.xbasepos_bone/y/z     ← 绑定偏移常量（在父块旋转系下，从父块枢轴量到子块枢轴）
// ★★2026-11-10 用户定稿语义：**子块绕自己的枢轴旋转，旋转中心 = 父块枢轴，距离恒定**。
//   原来的 v.parent_ux/uy/uz（父块「枢轴→视觉中心」的 basepos 补偿）是多余的一层：
//   它会让子块去绕父块的**视觉中心**转，而不是绕父块枢轴转 ⇒ 已整层删除（含输入槽与发布）。
//   v.bone_rotx/y/z         ← 关节角常量
// 输出：v.p_cx…v.p_sz、v.pR00…v.pR22、v.xpos/ypos/zpos、v.rotatex/rotatey/rotatez
// ⇒ 每块 base 只留「父引用 + 骨偏移」几条输入表达式，不再各自重复整套三角函数。
const BONE_FOLLOW_ANIM_NAME = 'bone_follow';
const BONE_FOLLOW_PROGRAM = [
    'v.p_cx=math.cos(v.parent_xrot); v.p_sx=math.sin(v.parent_xrot);',
    'v.p_cy=math.cos(v.parent_yrot); v.p_sy=math.sin(v.parent_yrot);',
    'v.p_cz=math.cos(v.parent_zrot); v.p_sz=math.sin(v.parent_zrot);',
    'v.pR00=v.p_cy*v.p_cz+v.p_sy*v.p_sx*v.p_sz; v.pR01=v.p_cy*v.p_sz-v.p_sy*v.p_sx*v.p_cz; v.pR02=-v.p_sy*v.p_cx;',
    'v.pR10=-v.p_cx*v.p_sz; v.pR11=v.p_cx*v.p_cz; v.pR12=-v.p_sx;',
    'v.pR20=v.p_sy*v.p_cz-v.p_cy*v.p_sx*v.p_sz; v.pR21=v.p_sy*v.p_sz+v.p_cy*v.p_sx*v.p_cz; v.pR22=v.p_cy*v.p_cx;',
    'v.xpos=v.parent_px+v.pR00*v.xbasepos_bone+v.pR01*v.ybasepos_bone+v.pR02*v.zbasepos_bone;',
    'v.ypos=v.parent_py+v.pR10*v.xbasepos_bone+v.pR11*v.ybasepos_bone+v.pR12*v.zbasepos_bone;',
    'v.zpos=v.parent_pz+v.pR20*v.xbasepos_bone+v.pR21*v.ybasepos_bone+v.pR22*v.zbasepos_bone;',
    'v.rotatex=v.parent_xrot+v.bone_rotx; v.rotatey=v.parent_yrot+v.bone_roty; v.rotatez=v.parent_zrot+v.bone_rotz;'
].join(' ').trim();
// 找（必要时创建）共用跟随动画。同名唯一 ⇒ 所有子块共享同一个控制器名，导出/导入靠名字还原。
function boneFollowAnimation() {
    let a = projectAnimations.find(x => x.name === BONE_FOLLOW_ANIM_NAME);
    if (!a) a = createProjectAnimation(BONE_FOLLOW_ANIM_NAME);
    if (String(a.program || '') !== BONE_FOLLOW_PROGRAM) a.program = BONE_FOLLOW_PROGRAM;
    return a;
}
// 该块是否挂着共用跟随动画（以「通道引用的动画名」判定，存档/复制粘贴后仍成立）
function boneFollowChannelIdOf(b) {
    if (!b || !b.scope || !b.scope.channels || b.scope.channels.size === 0) return null;
    // 识别到共用跟随动画就把正文刷成当前版本（旧工程残留的 v.parent_u* 版本已废止，见 boneAnchorSuffix）
    const heal = (k) => {
        if (typeof getProjectAnimation !== 'function') return;
        const a = getProjectAnimation(k);
        if (!a) return;
        const p = String(a.program || '');
        if (p !== BONE_FOLLOW_PROGRAM && p.includes('v.parent_xrot=') && p.includes('v.pR22=')) {
            try { a.program = BONE_FOLLOW_PROGRAM; } catch (_) { }
        }
    };
    if (b._boneFollowAnimId && b.scope.channels.has(b._boneFollowAnimId)) { heal(b._boneFollowAnimId); return b._boneFollowAnimId; }
    for (const k of b.scope.channels.keys()) {
        const a = (typeof getProjectAnimation === 'function') ? getProjectAnimation(k) : null;
        if (!a) continue;
        // 名字可能被用户在动画面板里改过 ⇒ 再按程序特征兜底识别（输入 parent_xrot + pR 矩阵）
        const prog = String(a.program || '');
        if (a.name === BONE_FOLLOW_ANIM_NAME || (prog.includes('v.parent_xrot=') && prog.includes('v.pR22='))) {
            // ★2026-11-10 自愈：跟随正文升级过（删掉 v.parent_u* 那层视觉锚点补偿）后，
            //   旧工程里残留的旧正文还会去读 v.parent_ux —— 而新 base 已不再写它，
            //   真机会抛 unknown variable。识别到就地把正文刷成当前版本（幂等，无副作用）。
            if (prog !== BONE_FOLLOW_PROGRAM) { try { a.program = BONE_FOLLOW_PROGRAM; } catch (_) { } }
            return k;
        }
    }
    return null;
}
function boneHasSharedFollow(b) { return !!boneFollowChannelIdOf(b); }
// 输入表达式（base 变量卡片 / molang program / 导出三者共用同一套字符串）
function boneFollowInputExprs(child, parent) {
    const p = boneSafeId(parent.id);
    return [
        ['v.parent_xrot', `t.${p}_xrot`, -180, 180, 1],
        ['v.parent_yrot', `t.${p}_yrot`, -180, 180, 1],
        ['v.parent_zrot', `t.${p}_zrot`, -180, 180, 1],
        ['v.parent_px', `t.${p}_px`, -1e4, 1e4, 0.01],
        ['v.parent_py', `t.${p}_py`, -1e4, 1e4, 0.01],
        ['v.parent_pz', `t.${p}_pz`, -1e4, 1e4, 0.01]
    ];
}
// 把跟随数学「冻成常量」的目标量：数学整体搬进 bone_follow，base 变量卡片不再重复计算
const BONE_FOLLOW_OUTPUT_VARS = [
    'p_cx', 'p_sx', 'p_cy', 'p_sy', 'p_cz', 'p_sz',
    'pR00', 'pR01', 'pR02', 'pR10', 'pR11', 'pR12', 'pR20', 'pR21', 'pR22',
    'xpos', 'ypos', 'zpos', 'rotatex', 'rotatey', 'rotatez'
];
function boneFollowInputSeg(child, parent) {
    return boneFollowInputExprs(child, parent).map(([n, e]) => `${n}=${e};`).join(' ');
}
// 子块挂上共用跟随动画：base 只保留输入，输出量冻成常量，动画排在 base 之后执行。
function boneAttachSharedFollow(child, parent) {
    if (!child || !child.scope || !parent) return false;
    const sc = child.scope;
    // 1) 输入（换绑时必须重写表达式，否则仍读旧父）
    boneFollowInputExprs(child, parent).forEach(([n, e, lo, hi, st]) => {
        if (sc.vars.has(n)) sc.setVarExpr(n, e); else sc.addVar(n, e, lo, hi, st);
    });
    // 1b) 清掉废止的「父视觉锚点」输入（旧工程/旧指令里还留着，恒 0，白占三张卡片）
    ['v.parent_ux', 'v.parent_uy', 'v.parent_uz'].forEach(n => {
        if (sc.vars.has(n)) { try { sc.deleteVar(n); } catch (_) { } }
    });
    // 2) 先按旧表达式算一次，拿到当前正确值，再把输出量冻成常量
    child.refresh();
    BONE_FOLLOW_OUTPUT_VARS.forEach(n => {
        const d = sc.vars.get('v.' + n);
        if (!d || !isMolangExpr(d.expr)) return;
        d.expr = String(_r4(vnum(child, 'v.' + n)));
        d.value = parseFloat(d.expr) || 0;
    });
    // 3) 挂共用动画（顺序紧跟 base，用户自己后加的动画保持更高优先级）
    const anim = boneFollowAnimation();
    if (typeof applyAnimationToBlock === 'function') applyAnimationToBlock(child, anim.id);
    if (Array.isArray(sc.stack)) {
        sc.stack = sc.stack.filter(k => k !== anim.id);
        const bi = sc.stack.indexOf('__base__');
        sc.stack.splice(bi >= 0 ? bi + 1 : 0, 0, anim.id);
    }
    child._boneFollowAnimId = anim.id;
    // 4) molang 接管态：变量卡片不执行 ⇒ 输入语句补进 program（重绑前先摘掉旧段）
    if (sc.molangMode) bonePatchBoneFollowInputs(child, parent);
    // 5) 旧版「整段跟随」追加段已由共用动画取代，摘掉避免重复/覆盖
    if (child._boneFollowSeg && String(sc.program || '').includes(child._boneFollowSeg)) {
        sc.program = String(sc.program).split(child._boneFollowSeg).join(' ').replace(/\s{2,}/g, ' ').trim();
    }
    delete child._boneFollowSeg;
    try { child.refresh(); } catch (_) { }
    try { syncMolangEditorProgram(child); } catch (_) { }
    return true;
}
// 删除共用动画通道（解绑 / 改绑 basepos 吸附时调用）；冻成的常量保留在变量里作为解绑后的静止值。
function boneDetachSharedFollow(child) {
    if (!child || !child.scope) return;
    const sc = child.scope;
    const id = boneFollowChannelIdOf(child);
    if (id && typeof removeAnimationFromBlock === 'function') removeAnimationFromBlock(child, id);
    delete child._boneFollowAnimId;
    if (sc.program && child._boneFollowInputSeg && String(sc.program).includes(child._boneFollowInputSeg)) {
        sc.program = String(sc.program).split(child._boneFollowInputSeg).join(' ').replace(/\s{2,}/g, ' ').trim();
        try { syncMolangEditorProgram(child); } catch (_) { }
    }
    delete child._boneFollowInputSeg;
}
// molang 接管态：把输入语句追加进 program（替换上一次追加的段）
function bonePatchBoneFollowInputs(child, parent) {
    const sc = child.scope;
    if (child._boneFollowInputSeg && String(sc.program || '').includes(child._boneFollowInputSeg)) {
        sc.program = String(sc.program).split(child._boneFollowInputSeg).join(' ').replace(/\s{2,}/g, ' ').trim();
    }
    const seg = boneFollowInputSeg(child, parent);
    child._boneFollowInputSeg = seg;
    sc.program = (String(sc.program || '').replace(/\s+$/, '') + ' ' + seg).trim();
    return seg;
}
// 导出用：base 命令里的输入段（含骨偏移常量），动画层只负责通用数学
function boneFollowInputsExportString(child, parent) {
    const p = boneSafeId(parent.id);
    let s = `v.parent_xrot=t.${p}_xrot; v.parent_yrot=t.${p}_yrot; v.parent_zrot=t.${p}_zrot;`
        + ` v.parent_px=t.${p}_px; v.parent_py=t.${p}_py; v.parent_pz=t.${p}_pz;`;
    s += ` v.xbasepos_bone=${_r4(vnum(child, 'v.xbasepos_bone'))};`
        + ` v.ybasepos_bone=${_r4(vnum(child, 'v.ybasepos_bone'))};`
        + ` v.zbasepos_bone=${_r4(vnum(child, 'v.zbasepos_bone'))};`;
    return s;
}
// ✛ 骨骼绑定向导（两步卡片：绑定方式 → 父骨骼）
// 候选父级：排除自身 + 骨骼后代 + 骨骼祖先（避免成环 / 父子互绑）
function boneBindCandidates(children, mode) {
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
    // ★2026-11-07：IK 的「父骨骼」就是链首的父级（= 选区的祖先），必须允许选；
    //   FK 不允许绑到自己的子孙（会成环）。此前一律把祖先过滤掉 ⇒ 用户整链多选后在第二步
    //   根本看不到 Cube，只能随便挑一个，结果就是「有些块没接上 / 死活没反应」。
    const isIk = mode === 'ik';
    const candidates = blocks.filter(b => !childIds.has(b.id) && !descendantIds.has(b.id) && (isIk || !ancestorIds.has(b.id)));
    // 单块专属：已绑父但 molang 跟随链被剪断 → 提供「修复跟随」
    let followBroken = null;
    if (children.length === 1) {
        const child = children[0];
        const _xpDef = child.scope && child.scope.vars.get('v.xpos');
        const _bpDef = child.scope && child.scope.vars.get('v.xbasepos');
        // 跟随链是否完好：新绑定（枢轴 / basepos 吸附）看 v.xpos 是否引用父 _px；旧版 local-axis 链看 v.xbasepos 引用父 _bx；
        // 枢轴绑定的跟随数学已搬进共用动画 bone_follow（v.xpos 是冻成常量的输出）→ 挂通道即视为完好
        const _followOk = boneHasSharedFollow(child)
            || !!(_xpDef && _xpDef.expr && /t(?:\[['"]?|\.)([A-Za-z0-9_]+)_[pg]x/.test(String(_xpDef.expr)))
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
    // ★★★2026-11-11【「视图选中作为父骨骼偶尔无效」的真因】
    //   `intersectObjects(meshes, true)` 是**递归**拾取：命中对象可能是块 mesh 的**子对象**
    //   （多 mesh 块：掉落物 / 旗帜 / 楼梯 / 合并过材质的块，以及带 Group 的块）。
    //   旧代码只拿 `hits[0].object` 去和 `getMeshes()` 做 `includes` ⇒ 命中子对象时匹配不到，
    //   直接返回 null ⇒ 点击被静默丢弃（表现为「偶尔点了没反应」，换个角度/换块又好了）。
    //   现在沿 parent 一路往上找归属块。
    const ownedBy = (obj) => {
        let cur = obj;
        while (cur) {
            if (cur.userData && cur.userData.blockId) {
                const hit = pickable.find(x => x.id === cur.userData.blockId);
                if (hit) return hit;
            }
            for (const b of pickable) {
                const list = b.getMeshes ? b.getMeshes() : (b.mesh ? [b.mesh] : []);
                if (list.indexOf(cur) >= 0) return b;
            }
            cur = cur.parent;
        }
        return null;
    };
    for (const h of hits) {
        const b = ownedBy(h.object);
        if (b) return b;
    }
    return null;
}

// 绑定方式归一：'ik' 逆骨骼 / 'basepos' 静态骨骼 / 其余一律 'pivot'（枢轴正向 FK）
function normalizeBoneMode(m) {
    return m === 'basepos' ? 'basepos' : (m === 'ik' ? 'ik' : 'pivot');
}

// 执行绑定（面板刷新 / 撤销 / 提示），列表点选与视图拾取共用
function boneBindExecute(children, parent, boneMode) {
    // IK 逆骨骼：链式绑定 + 解析两节求解，走独立分支（不逐块 bindBone 到同一父级）
    if (normalizeBoneMode(boneMode) === 'ik') { ikBindChain(children, parent); return; }
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
    openBoneBindWizard(children, { step: 2, mode: normalizeBoneMode(boneMode) });
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
        if (!hit) {
            // ★2026-11-11 不再静默丢弃：点空 / 被 UI 挡住 / 命中的是块以外的对象都明确说一声，
            //   否则用户只会看到「选了没反应」（原 bug 表现）。
            showToast('没点中方块：请点在方块本体上（点在背景/网格上不算）');
            return;
        }
        ev.stopPropagation(); ev.stopImmediatePropagation(); ev.preventDefault();
        if (!allowedIds.has(hit.id)) { showToast(`【${hit.id}】不能作为父级（是选中块本身/它的祖先或子块）`); return; }
        cleanup();
        boneBindExecute(children, hit, boneMode);
    };
    const onKey = (ev) => { if (ev.key === 'Escape') { cleanup(); showToast('已取消选择父骨骼'); } };
    // ★2026-11-11：进拾取时清掉上一轮拖视角可能残留的「拖过」标记，
    //   否则第一次点击会被 `_canvasDragMoved` 直接吞掉（表现就是「偶尔点了没反应」）。
    if (typeof _canvasDragMoved !== 'undefined') _canvasDragMoved = false;
    canvasEl.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    showToast('请在视图中点击要作为父骨骼的方块（Esc 取消）');
}

function openBoneBindWizard(children, opts) {
    opts = opts || {};
    let mode = opts.mode ? normalizeBoneMode(opts.mode) : null;
    let step = (opts.step === 2 && mode) ? 2 : 1;
    // 候选父级随绑定方式变化：IK 允许祖先（锚点就是链首的父级），FK 不允许
    const candOf = m => boneBindCandidates(children, m || 'pivot');
    let candidates = candOf(mode).candidates;
    const followBroken = boneBindCandidates(children, mode || 'pivot').followBroken;
    if (!candidates.length && !followBroken && step === 2) { showToast('没有可作为父级的方块'); return; }
    const listHtmlOf = list => list.length
        ? list.map(p => `<div class="bb-pitem" data-pid="${escapeHtml(p.id)}" title="${escapeHtml(p.id)}">${escapeHtml(p.id)}</div>`).join('')
        : '<div class="bb-pempty">无可选父级</div>';

    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal io-soft bb-modal';
    modalDiv.style.zIndex = '1001';
    const listHtml = listHtmlOf(candidates);
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
                        <button class="bb-opt" type="button" data-mode="pivot">枢轴正向骨骼绑定（FK）</button>
                        <button class="bb-opt" type="button" data-mode="basepos">basepos 静态骨骼</button>
                        <button class="bb-opt" type="button" data-mode="ik">IK 逆骨骼绑定</button>
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

    // 第一步：只放绑定方式选项，不加任何说明文字
    modalDiv.querySelectorAll('.bb-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            mode = btn.dataset.mode;
            // 换方式要换候选：IK 的锚点通常是链首的祖先（FK 会把它排除掉）
            candidates = candOf(mode).candidates;
            const plist = modalDiv.querySelector('#bbPList');
            if (plist) plist.innerHTML = listHtmlOf(candidates);
            bindParentItems();
            if (mode === 'ik' && children.length > 1) {
                showToast('IK：一次只绑一条连续骨链；第二步选「链首的上一个关节」作为锚点');
            }
            gotoStep(2);
        });
    });

    // 第二步：点列表项直接绑定父级（候选随绑定方式重渲染，故抽成可重复调用）
    function bindParentItems() {
        modalDiv.querySelectorAll('.bb-pitem').forEach(item => {
            if (item._bbBound) return;
            item._bbBound = true;
            item.addEventListener('click', () => {
                const p = blocks.find(b => b.id === item.dataset.pid);
                if (!p) return;
                closeWizard();
                boneBindExecute(children, p, mode || 'pivot');
            });
        });
    }
    bindParentItems();

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
        // 纯枢轴吸附不需要 pR 数学 ⇒ 不挂共用跟随动画；换绑自枢轴模式时把旧通道摘掉
        try { boneDetachSharedFollow(child); } catch (e) {}
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
    // ★【2026-11-07】跟随数学整体挂到共用动画 bone_follow：
    //   base 只保留父引用输入 + 骨偏移常量，pR/pos/rotate 由共用动画统一计算；
    //   molang 接管态由 boneAttachSharedFollow 内部把输入补进 program。
    try { boneAttachSharedFollow(child, parent); } catch (e) {}
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
    // 共用跟随动画通道（bone_follow）先摘掉：冻结值已快照，解绑后由常量承载，不再每帧被动画覆盖
    try { boneDetachSharedFollow(child); } catch (e) {}
    // IK 共用求解动画（ik_solve_N）同理：不摘掉的话动画还会按已删的 v.ik_* 继续求值
    try { ikDetachSolveLayer(child); } catch (e) {}
    delete child._ikMulti;
    delete child._ikSolveAnimId;
    // IK 输入/求解量（v.ik_*/v.ik_multi）与发布串一并清掉，否则导出仍带 t.<块>_ik_* 发布
    {
        const deadIk = [];
        scope.vars.forEach((_d, k) => { if (k.indexOf('v.ik_') === 0) deadIk.push(k); });
        deadIk.forEach(k => scope.deleteVar(k));
    }
    delete child._ikVars;
    delete child._ikPublish;
    delete child._ikPubList;
    // 骨骼跟随辅助量（pR 矩阵 / p_c* / parent_* / *basepos_bone / own_bone_rot*）整体删除：
    // 它们是指令末尾按需重算的派生态，残留会让 inferMolangBoneParent 继续认出父级（缩进不消失）。
    ['v.xbasepos_bone', 'v.ybasepos_bone', 'v.zbasepos_bone',
     'v.bone_rotx', 'v.bone_roty', 'v.bone_rotz',              // 关节角：解绑后已折进冻结的 rotate，无主
     'v.own_bone_rotx', 'v.own_bone_roty', 'v.own_bone_rotz',  // 旧版本残留的 own_bone_rot* 也清掉
     'v.parent_xrot', 'v.parent_yrot', 'v.parent_zrot',        // bindBone 实际创建的父旋转源变量
     'v.parent_px', 'v.parent_py', 'v.parent_pz',              // 共用动画 bone_follow 的父枢轴输入
     'v.parent_ux', 'v.parent_uy', 'v.parent_uz',              // 共用动画 bone_follow 的父锚点输入
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

// ★2026-11-06：IK 方块「发布全局」的自愈。_ikPubList = [[全局名(不含 t.), 本地表达式], ...]。
// globalVars 是运行期缓存（撤销 / 重载 / 清空项目都可能清掉），但全局的定义处就是发布块自己；
// 方块每次 refresh 时把它补回来，保证 t.point_px / t.<末端>_ik_jrx 这类跨块引用不会永久变 0。
function ikRepublishGlobals(block) {
    if (!block || !Array.isArray(block._ikPubList)) return;
    for (const it of block._ikPubList) {
        if (!it || typeof it[0] !== 'string') continue;
        // ★走 ensureIkGlobalVar：_ikPubList 里的键全是 IK 自己的输出（t.<末端>_ik_* / t.<点>_px / t.<关节>_ikW），
        //   所有权必须唯一属于本块。用会「保留已存在项」的 ensureGlobalVar 会让导入工程里
        //   被链首初值守卫占位的常量一直占着，末端块发布的值永远没人读（根关节恒 0）。
        ensureIkGlobalVar(it[0], it[1], block.id);
    }
}
// ★★通用铁律（2026-11-08）：一个块「发布」的全局（globalVars 里 sourceBlockId = 本块）必须同时出现在
// 它自己的 program 里（t.<名>=<表达式>;）。否则编辑器只显示 v.*，别的方块却引用 t.* —— 看起来像是凭空
// 出现的隐藏连线（用户报：蜘蛛腿预设的 point 方块看不到 t.point_px）。
// 这条不是 point 专属：普通骨骼父块、IK 目标点、IK 末端/关节的发布全都走这里。
// 安全边界：① 只处理已经有 program 的块（空 program = 变量卡片模式，不强行转成程序模式）；
//   ② 表达式只允许引用本块已存在的 v.*，避免把「引用不存在变量」的语句塞进旧工程（整帧抛错回退）；
//   ③ 已存在的声明不重复追加（幂等）。
// 返回新文本；无需追加时返回 null。
function molangAppendOwnedGlobals(block, text) {
    const sc = block && block.scope;
    if (!sc) return null;
    const src = String(text == null ? (sc.program || '') : text);
    if (!src.trim()) return null;
    if (typeof globalVars === 'undefined' || !globalVars) return null;
    const adds = [];
    for (const [k, g] of globalVars) {
        if (!g || g.sourceBlockId !== block.id) continue;
        const expr = String((g.def && g.def.expr) || '').trim();
        if (!expr) continue;
        const name = String(k);
        if (new RegExp('(^|[^A-Za-z0-9_.])t\\.' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=').test(src)) continue;
        const re = /v\.([A-Za-z_][A-Za-z0-9_]*)/g;
        let m, ok = true;
        while ((m = re.exec(expr))) { if (!sc.vars.has('v.' + m[1])) { ok = false; break; } }
        if (!ok) continue;
        adds.push(`t.${name}=${expr};`);
    }
    if (!adds.length) return null;
    return src.replace(/\s+$/, '') + ' ' + adds.join(' ');
}
function appendOwnedGlobalsToProgram(block) {
    const next = molangAppendOwnedGlobals(block);
    if (next == null) return false;
    block.scope.program = next;
    return true;
}
function ensureGlobalVar(key, expr, sourceBlockId) {
    if (!globalVars.has(key)) {
        const rg = getDefaultRange(`t.${key}`);
        globalVars.set(key, { def: new VarDef(expr, 0, rg.min, rg.max, rg.step), sourceBlockId: sourceBlockId });
    }
    // 已存在的全局变量（可能已被用户自定义，例如把 v.xrot 改为 v.rotatex）一律保留，
    // 不再用预设 expr 覆盖——否则对同一父级再次绑定时会把用户修改清空，导致骨骼绑定"失效"。
}
// ★★★2026-11-14【IK 重建后「根关节恒 0 / 整链形状不对」的根因 · 修】
//   IK 的输出全局（t.<末端>_ik_jrz、t.<末端>_ik_b{k}、t.<末端>_ikShape、t.<关节>_ikW）必须**唯一**
//   由对应方块实时发布。但导入的老工程里，导出侧在链首块写过一次性初值守卫：
//       v.fmbe_init==0?(t.Cube10_ik_jrx=0;t.Cube10_ik_jry=0;t.Cube10_ik_jrz=0;);v.fmbe_init=1;
//   导入器于是把 `t.Cube10_ik_jrz` 登记成「Cube11 发布的常量 0」。
//   `ensureGlobalVar` 见到 key 已存在就不覆盖（本意是保护用户改过的骨骼全局）⇒ 重建后
//   末端块写 v.ik_jrz 没有任何人读，根关节读到的永远是 0 ⇒ 整条链少了 R1 那次整体朝向，
//   末端偏一大截、关节角乱成锯齿（实测 12 节链末端偏 2.7，形状是正负交替的麻花）。
//   这里对「IK 自己的输出全局」强制纠正所有权：owner 不对就把 sourceBlockId/expr 改回来，
//   并保留用户手调过的默认值（v.ikShape 之类）。
function ensureIkGlobalVar(key, expr, sourceBlockId) {
    const cur = globalVars.get(key);
    if (!cur) { ensureGlobalVar(key, expr, sourceBlockId); return; }
    if (cur.sourceBlockId === sourceBlockId && cur.def && cur.def.expr === expr) return;
    const keepVal = (cur.def && typeof cur.def.value === 'number') ? cur.def.value : null;
    if (!cur.def) cur.def = new VarDef(expr, 0, -10000, 10000, 0.01);
    cur.def.expr = expr;
    if (keepVal !== null) cur.def.value = keepVal;
    cur.sourceBlockId = sourceBlockId;
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

// 位置公式（项目统一口径）：子块枢轴 = 父枢轴 + pR(父 rotate)·偏移
//   ⇒ 第 i 节的朝向由【上一节】的 rotate 决定，c1 自身的 rotate 决定第 2 节起的整段朝向。
// ==================== ★ IK 逆骨骼（解析两节 + 逐块追加，2026-11-05 v2） ====================
// 链结构：chain = [c1 … cN]；cN 是末端（tip），也是【IK 变量归属块】：
//   · v.ik_tx/ty/tz（唯一用户输入 = 末端目标世界坐标）与整套求解量全部写在 cN 上；
//   · 每个关节（c1…c(N-1)）的 bone_rotx/y/z 三轴全部由 IK 接管（不再留给 FK / 关键帧）：
//       c1（根关节）→ (ik_jrx, ik_jry, ik_jrz)（三轴全解，由帧映射 R1 反解欧拉）
//       肘（c(N-1)）→ (0, 0, ik_be)（欧拉相加 ⇒ 等价右乘 Rz(−β)，只绕本地 z 弯曲）
//       其余中间节 → (0,0,0)（刚性段，保证它们平移到同一平面）
//   · 根关节 = 链首 c1（锚点 P 的子骨骼）；锚点为空时 c1 自己是「自由根」（直接接管它自己的 rotate）。
// 追加：选中 1 块、父级选【当前链的末端】⇒ 链自动延长并整体重建（ikRebuildChain）。
// 2 块即可成链（1 关节 + 1 段）：末端落在以 c1 枢轴为心、半径 |uN| 的球面上（只指向、不改长度）。
// 求解（解析两节 + 自动平面，全部写成 molang；变量在 cN 上算完，用 t.<cN>_ik_* 发布给各关节）：
//   · 可动段 A = |u2+…+u(N-1)|（中间关节全部归零 ⇒ 这一段刚性），末端段 B = |uN|；
//   · 末端在 c1 本地系里 = Rz(−β)·uN + A·a1（β = 末节前一块的单轴 bone_rotz；欧拉角相加等价于右乘 Rz(−β)）；
//     |W|² = A²+B²+2[K cosβ + L sinβ + M]，K=A(a·p+b·q)/L=A(a·q−b·p)/M=A·c·r（a1=(a,b,c)、uN=(p,q,r)）
//     ⇒ cos(β−PHI) = (D²−A²−B²−2M)/2RAD，PHI=atan2(L,K)；**clamp 自动给出伸直分支**：
//     够不着 ⇒ acos→0 ⇒ β=PHI（最大伸展，共线链恰好完全伸直）；太近 ⇒ β=PHI+180；
//   · 帧映射 R1 = [u,nu,n]·[w1,w2,w3]ᵀ（u=目标方向，w1=W 方向）⇒ R1·W = D·u，末端精确落在目标上；
//   · 末节前一块（chain[N-2]）只用 bone_rotz 单轴弯曲，c1 用两轴（欧拉反解 jrx/jry/jrz）。
//   · 输入只有一个方块的三个末端坐标 v.ik_tx/ty/tz（建在 c1 上，可手改）。
const IK_EPS = 0.000001;
// ★★★2026-11-14【「形状不再是均匀圆弧、关节角正负交替」的第二根因 · 修】
//   旧判据：任一段方向与首段夹角 > **0.5°** 就算「用户摆过的造型」⇒ v.ik_arc=0 ⇒ 种子取 0。
//   实际上任何手工摆出来的链都有 2~4° 的抖动（用户这条 12 节链最大 3.9°），于是永远走不进
//   圆弧种子分支：DLS 从「近直链」这个退化点起步，虽然能把末端收到目标（pN=gg），但解出来的
//   关节角是 -0.6/-49/-51/-34/+6/+22/+24/+22/0/-19/-30 这种锯齿麻花 —— 用户视角
//   「现在的 IK 做不出以前那种形状了」。
//   12° 以内视为「基本共线 ⇒ 用等角圆弧种子」；超过 12° 才认定是用户有意摆的造型（保持原样）。
const IK_STRAIGHT_TOL = 12;
// ★2026-11-14【mode=0 直棒兜底的**严格**阈值】
//   mode=0（保形）种子 b=0；若绑定姿态是**数学上真共线**（≈0°），DLS 的 Jacobian 只张成一维
//   ⇒ 解不出径向缩短 ⇒ 整链转成一根直棒指目标、够不到（用户报「v.ikMode=0 咋出现直直棒」）。
//   这个兜底只能在**真退化**时生效，绝不能复用 12°（否则 2~4° 的手摆抖动链也会被当直链，
//   把「保形」的个性形状抹成圆弧 —— 实测 sd 20.31 → 0 = 回归）。
const IK_DEGENERATE_TOL = 0.5;
// 共用求解动画 ik_solve_N 的 DLS 迭代轮数：写死是为了让「同一段数」的链正文逐字一致（才能真正共用）
const IK_SOLVE_ITERS = 20;
function ikNum(v) { return String(_r4(Number(v) || 0)); }
// 与导出 pR 完全同构的行主序旋转矩阵（R = Ry(−y)·Rx(x)·Rz(−z)）
function ikRotMat3(x, y, z) {
    const d = Math.PI / 180;
    const cx = Math.cos(x * d), sx = Math.sin(x * d);
    const cy = Math.cos(y * d), sy = Math.sin(y * d);
    const cz = Math.cos(z * d), sz = Math.sin(z * d);
    return [
        cy * cz + sy * sx * sz, cy * sz - sy * sx * cz, -sy * cx,
        -cx * sz, cx * cz, -sx,
        sy * cz - cy * sx * sz, sy * sz + cy * sx * cz, cy * cx
    ];
}
// u = Rᵀ·d（R 正交，转置即逆）
function ikRotInvMul(R, d) {
    return [
        R[0] * d[0] + R[3] * d[1] + R[6] * d[2],
        R[1] * d[0] + R[4] * d[1] + R[7] * d[2],
        R[2] * d[0] + R[5] * d[1] + R[8] * d[2]
    ];
}
// d = R·u（与 ikRotInvMul 同一 R 表示；与引擎 pR 同口径）
function ikRotMul(R, d) {
    return [
        R[0] * d[0] + R[1] * d[1] + R[2] * d[2],
        R[3] * d[0] + R[4] * d[1] + R[5] * d[2],
        R[6] * d[0] + R[7] * d[1] + R[8] * d[2]
    ];
}
// 3×3 逆（只用于把「父局部方向」还原到方块未旋转的局部系；奇异时退回单位阵）
function ikMat3Inv(M) {
    const a = M[0], b = M[1], c = M[2], d = M[3], e = M[4], f = M[5], g = M[6], h = M[7], i = M[8];
    const c00 = e * i - f * h, c01 = -(d * i - f * g), c02 = d * h - e * g;
    const c10 = -(b * i - c * h), c11 = a * i - c * g, c12 = -(a * h - b * g);
    const c20 = b * f - c * e, c21 = -(a * f - c * d), c22 = a * e - b * d;
    const det = a * c00 + b * c01 + c * c02;
    if (!(Math.abs(det) > 1e-9)) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const s = 1 / det;
    // 逆 = 伴随矩阵（余子式矩阵的转置）
    return [c00 * s, c10 * s, c20 * s, c01 * s, c11 * s, c21 * s, c02 * s, c12 * s, c22 * s];
}
// 「角点枢轴」块：basepos 三分量都是 ±0.5 ⇒ 枢轴正好落在单位方块的某个角上（0 = 几何中心，不是角点）
function ikCornerPivotBasepos(b) {
    if (!b || !b.scope || !b.scope.vars) return null;
    const B = [vnum(b, 'v.xbasepos'), vnum(b, 'v.ybasepos'), vnum(b, 'v.zbasepos')];
    for (const k of B) if (Math.abs(Math.abs(k) - 0.5) > 1e-6) return null;
    return B;
}
// ★2026-11-07 顶点对顶点（角接角）链：关节 = 父块朝子块的那个【对角顶点】，
//   骨偏移 = A父·(角点 + basepos父)，A父 = 方块外观矩阵（含 xrot/yrot/zrot/scale/extend，不含 rotate/basepos）。
//   关键：这个偏移是**纯几何量**，与当前关节角、当前姿态完全无关 ⇒
//   ① 任意弯曲姿态下重绑都不会把弯折烘进偏移；② 相邻两块的「父块对角顶点」与「子块枢轴（子块最小角）」永久重合。
//   两个端点块都必须是角点枢轴，否则返回 null（交给原来的接缝吸附/枢轴差反解）。
function ikCornerJointOffset(par, child, parPiv, childPiv) {
    if (!par || !child || !parPiv || !childPiv) return null;
    const Bp = ikCornerPivotBasepos(par);
    const Bc = ikCornerPivotBasepos(child);
    if (!Bp || !Bc) return null;
    const A = boneAppearanceMat3(par);
    const G = ikRotMat3(vnum(par, 'v.rotatex'), vnum(par, 'v.rotatey'), vnum(par, 'v.rotatez'));
    // 子块相对父块的方向：世界 → 父旋转系 → 方块未旋转的局部系；取该方向上最远的那个角
    const dRoot = ikRotInvMul(G, [childPiv[0] - parPiv[0], childPiv[1] - parPiv[1], childPiv[2] - parPiv[2]]);
    const dLocal = ikRotMul(ikMat3Inv(A), dRoot);
    const c = [
        (dLocal[0] >= 0 ? 0.5 : -0.5) + Bp[0],
        (dLocal[1] >= 0 ? 0.5 : -0.5) + Bp[1],
        (dLocal[2] >= 0 ? 0.5 : -0.5) + Bp[2]
    ];
    return ikRotMul(A, c);
}
// 选中方块 → 链顺序：若能按 _boneParent 串成一条链就按链序，否则沿用选中顺序
function ikChainOrder(children) {
    const list = children.slice();
    const ids = new Set(list.map(b => b.id));
    // ★2026-11-07：**只按现有的骨骼父子关系（_boneParent）串链，绝不按名称/选择顺序猜**。
    //   多选里如果出现「一个父块挂了两个选中子块」（分叉）或几段互不相连的块，旧实现会
    //   `return list` 直接按选择顺序拼链 ⇒ 把不相邻的块硬接在一起，表现就是「有些块死活没反应 / 根本没接上」。
    //   现在只在选区内部沿唯一子节点往下走，取最长的一条连续链；没被选中的父级天然成为锚点。
    const childOf = new Map();
    list.forEach(b => { if (b._boneParent && ids.has(b._boneParent)) childOf.set(b._boneParent, b); });
    const roots = list.filter(b => !b._boneParent || !ids.has(b._boneParent));
    let best = [];
    for (const r of roots) {
        const out = [r];
        const seen = new Set([r.id]);
        let cur = r;
        while (childOf.has(cur.id)) {
            const nxt = childOf.get(cur.id);
            if (!nxt || seen.has(nxt.id)) break;
            seen.add(nxt.id); out.push(nxt); cur = nxt;
        }
        if (out.length > best.length) best = out;
    }
    return best.length ? best : list;
}
// 选区内没进入骨链的块（分叉/不相连）⇒ 绑定前提示，避免「点了没反应」的静默失败
function ikDroppedFromChain(children, chain, parent) {
    const keep = new Set(chain.map(b => b.id));
    return children.filter(b => b && b.id !== (parent && parent.id) && !keep.has(b.id));
}
// 多选但彼此还没有 _boneParent 关系时，按枢轴距离自动串链（链内相邻骨节）。
// ★2026-11-08：必须做「连续性检查」——几条腿一起多选时，最近邻串链会在腿与腿之间
//   产生一个远大于节距的跳跃，把不同腿拼成一条超长链（求解爆炸 + 拉散）。
//   判据：所有相邻枢轴间距的中位数 × 2.0 为上限，出现超限跳跃 ⇒ 拒绝自动串链，
//   退回「只绑一条真实父子链 + 提示逐段绑」。
function ikOrderByPivot(list, parent) {
    if (list.length < 2) return null;
    // 用「枢轴坐标」（v.xpos/ypos/zpos，与 IK 求解用的是同一套）而不是网格中心：
    // 长条段块的网格中心离枢轴有半段距离，用中心排序会把相邻节错配。
    const posOf = b => { try { const p = ikPivotOf(b); return (p && p.every(Number.isFinite)) ? p : null; } catch (_) { return null; } };
    const P = new Map();
    for (const b of list) { const p = posOf(b); if (!p) return null; P.set(b.id, p); }
    const d2 = (a, b) => (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2]);
    const ap = parent ? posOf(parent) : null;
    // ★★2026-11-11【选区跨过锚点 / 中间缺一节时串出「第 2 段偏移翻倍」的链】
    //   旧实现：从「离父级最近的一块」开始贪心最近邻，只在最后做一次连续性检查（超限就整个返回 null
    //   ⇒ 退回选择顺序，等于没修）。实测选 [y4,y1,y2,y0] + 父级 y3 时得到 y4→y2→y1→y0，
    //   第一段偏移 2.0（应为 1.0）⇒ 一弯就散。
    //   现在：**对每个块各试一次起点**做贪心（遇到「超过已有节距中位数 ×1.5」的跳跃就截断），
    //   取最长的那条连续链；同长时取链首离父级更近的。这样跨锚点的选择会自然截成一侧的连续段，
    //   剩下的块交给 ikBindChain 的 dropped 提示，而不是硬拼成一条断链。
    const buildFrom = (start) => {
        const remain = list.filter(b => b !== start);
        let cur = start;
        const out = [start], gaps = [];
        while (remain.length) {
            let bi = 0, bd = Infinity;
            for (let i = 0; i < remain.length; i++) {
                const d = d2(P.get(remain[i].id), P.get(cur.id));
                if (d < bd) { bd = d; bi = i; }
            }
            const L = Math.sqrt(bd);
            if (gaps.length) {
                const s = gaps.slice().sort((a, b) => a - b);
                const med = s[Math.floor(s.length / 2)] || L;
                if (med > 0 && L > med * 1.5) break;      // 跳段 ⇒ 在此截断
            }
            gaps.push(L);
            cur = remain.splice(bi, 1)[0];
            out.push(cur);
        }
        // ★第一步跳跃没有「已有节距」可比 ⇒ 必须在收尾按全部节距的中位数再截一刀，
        //   否则「先跳到隔一节的块、再回来」这种路径（跨度 2 打头）会被判成最长链（用户选 [y4,y1,y2,y0] 就是它）。
        if (gaps.length >= 2) {
            const s = gaps.slice().sort((a, b) => a - b);
            const med = s[Math.floor(s.length / 2)] || 0;
            if (med > 0) {
                const cut = gaps.findIndex(L => L > med * 1.5);
                if (cut >= 0) return { out: out.slice(0, cut + 1), gaps: gaps.slice(0, cut) };
            }
        }
        return { out, gaps };
    };
    let best = null;
    for (const st of list) {
        const r = buildFrom(st);
        if (!best || r.out.length > best.out.length) { best = r; continue; }
        if (r.out.length === best.out.length && ap) {
            if (d2(P.get(r.out[0].id), ap) < d2(P.get(best.out[0].id), ap)) best = r;
        }
    }
    if (!best || best.out.length < 2) return null;
    // 让链首贴近父级（反向链也允许：用户可能从下往上选）
    if (ap) {
        const head = best.out[0], tail = best.out[best.out.length - 1];
        if (d2(P.get(tail.id), ap) < d2(P.get(head.id), ap)) best.out.reverse();
    }
    return best.out;
}
// 段块自身的可视长度：extend_xrot=-90 且 ybasepos≈+0.5 时，段体沿局部 +Y 从枢轴伸出，
// 长 = scale·extend_scale²（横截面 = scale×scale）。末端块要用它把自己的「长出来的那一截」算进可达长度，
// 否则 IK 只把【末端枢轴】对准目标，而末端块还会朝同方向多伸一整节。
function ikSegLenOf(b) {
    if (!b) return 0;
    const ex = vnum(b, 'v.extend_xrot'), es = vnum(b, 'v.extend_scale');
    const s = vnum(b, 'v.scale'), by = vnum(b, 'v.ybasepos');
    if (!(Math.abs(ex + 90) < 1e-6)) return 0;
    if (!(by > 0.45)) return 0;
    return Math.abs(s) * es * es;
}
// ★2026-11-07 骨骼几何：沿世界单位向量 u，从方块「几何中心」到方块表面的支撑距离。
//  方块 = 单位立方体 [−0.5,0.5]³ 经外观矩阵 A（boneAppearanceMat3，含 scale/extend/自身旋转）线性变换后的平行六面体，
//  外层再乘全局 rotate R ⇒ 支撑距离 h(u) = 0.5·Σ|Aᵀ·(Rᵀu)|（支撑函数，顶点取符号）。
//  用途：骨节弯折的旋转中心必须是「关节」（节与节的接缝），而默认枢轴常在方块中心 —— 用 h 求接缝点。
function ikBodySupport(b, u) {
    const A = boneAppearanceMat3(b);      // 行主序 3×3 = localMat 线性部分
    const R = ikRotMat3(vnum(b, 'v.rotatex'), vnum(b, 'v.rotatey'), vnum(b, 'v.rotatez'));
    const ul = ikRotInvMul(R, [u[0], u[1], u[2]]);   // Rᵀ·u
    return 0.5 * (
        Math.abs(A[0] * ul[0] + A[3] * ul[1] + A[6] * ul[2]) +
        Math.abs(A[1] * ul[0] + A[4] * ul[1] + A[7] * ul[2]) +
        Math.abs(A[2] * ul[0] + A[5] * ul[1] + A[8] * ul[2])
    );
}
// 绑定前的世界枢轴（用于重新反解全部偏移，保证「骨节归零后仍有原来的形」）
function ikPivotOf(b) {
    return [vnum(b, 'v.xpos'), vnum(b, 'v.ypos'), vnum(b, 'v.zpos')];
}
// 生成求解用的 molang 变量表（顺序即依赖顺序）与烘焙常量
// ★2026-11-05 重写：原「平面解」把 A 段当世界向量做帧映射，与「位置由上一节 rotate 决定」的逐级旋转
//   不一致 ⇒ 一般构型打不准。现改用：本地系 W=Rz(−β)·uN+A·a1 → 帧映射 R1=[u,nu,n]·[w1,w2,w3]ᵀ。
//   数值验证（PowerShell，前向模拟 euler 相加 + pR 位置公式）13 组构型：可达 err≈1e-16，
//   够不着 ⇒ 末端严格落在目标方向的射线上且链为最大伸展（共线链 = 完全伸直）。
// opts（可选，v2 之后新增，仅预设构建用）：
//   · targetExpr：[xExpr, yExpr, zExpr] —— 用 molang 表达式代替常量目标（如 ['t.point_px','t.point_py','t.point_pz']）；
//   · rootPos：[xExpr, yExpr, zExpr] —— 链首枢轴表达式，缺省 t.<链首>_px/py/pz（自由根自己那节用 v.xpos）。
function ikBuildSolve(chain, parent, tipTarget, opts) {
    const c1 = chain[0];
    const N = chain.length;
    const safeRoot = boneSafeId(c1.id);
    const opt = opts || {};
    const bk = (b, n) => vnum(b, 'v.' + n);
    const off = b => [bk(b, 'xbasepos_bone'), bk(b, 'ybasepos_bone'), bk(b, 'zbasepos_bone')];
    // ★末端块自身还会沿局部 +Y 再伸出一截（extend_scale 段块）⇒ 末端枢轴偏移 + 这段 =
    //   真正的「可达末端向量」；末节 bone_rot 被归零，故这一截和 uN 同处肘关节坐标系，直接相加即精确。
    const tipLen = (opt && typeof opt.tipExtend === 'number') ? opt.tipExtend : ikSegLenOf(chain[N - 1]);
    const elbowIndex = (opt && typeof opt.elbowIndex === 'number' && opt.elbowIndex >= 1 && opt.elbowIndex <= N - 2)
        ? opt.elbowIndex : (N - 2);
    let uNraw = [0, 0, 0];
    for (let i = elbowIndex + 1; i <= N - 1; i++) { const o = off(chain[i]); uNraw = [uNraw[0] + o[0], uNraw[1] + o[1], uNraw[2] + o[2]]; }
    const uN = [uNraw[0], uNraw[1] + tipLen, uNraw[2]];
    let mid = [0, 0, 0];
    for (let i = 1; i <= elbowIndex; i++) { const o = off(chain[i]); mid = [mid[0] + o[0], mid[1] + o[1], mid[2] + o[2]]; }
    const A = Math.sqrt(mid[0] * mid[0] + mid[1] * mid[1] + mid[2] * mid[2]);
    const B = Math.sqrt(uN[0] * uN[0] + uN[1] * uN[1] + uN[2] * uN[2]);
    const hasMid = A > 1e-4 && B > 1e-4;
    // a1 = A 段单位方向（常量；A≈0 时退回末段方向）
    const refV = A > 1e-4 ? mid : uN;
    const rl = Math.max(1e-6, Math.sqrt(refV[0] * refV[0] + refV[1] * refV[1] + refV[2] * refV[2]));
    const a1 = [refV[0] / rl, refV[1] / rl, refV[2] / rl];
    // 烘焙 |W|² = A²+B²+2[K cosβ+L sinβ+M] 的三个系数 + 振幅/相位
    const K = A * (a1[0] * uN[0] + a1[1] * uN[1]);
    const L = A * (a1[0] * uN[1] - a1[1] * uN[0]);
    const MM = A * a1[2] * uN[2];
    const RAD = Math.sqrt(K * K + L * L);
    const PHI = RAD > 1e-9 ? Math.atan2(L, K) * 180 / Math.PI : 0;
    const bendable = hasMid && RAD > 1e-9;
    const safePar = parent ? boneSafeId(parent.id) : '';
    const vin = [];
    const push = (n, e) => vin.push(['v.ik_' + n, e]);
    const term = (coef, name) => `+(${ikNum(coef)})*${name}`;
    // ① 目标（用户唯一输入）与目标方向（opt.targetExpr 允许直接写全局表达式，如 t.point_px）
    const tgt = v => (typeof v === 'string' ? v : ikNum(v));
    const tgtSrc = (opt.targetExpr && opt.targetExpr.length === 3) ? opt.targetExpr : tipTarget;
    push('tx', tgt(tgtSrc[0])); push('ty', tgt(tgtSrc[1])); push('tz', tgt(tgtSrc[2]));
    // ★v2：求解量挂在【末端块】，末端自己的 v.xpos 不是链首枢轴 ⇒ 跨块读 t.<链首>_px
    const rootPos = (opt.rootPos && opt.rootPos.length === 3)
        ? opt.rootPos
        : [`t.${safeRoot}_px`, `t.${safeRoot}_py`, `t.${safeRoot}_pz`];
    push('dx', `v.ik_tx-${rootPos[0]}`); push('dy', `v.ik_ty-${rootPos[1]}`); push('dz', `v.ik_tz-${rootPos[2]}`);
    push('D', `math.max(${IK_EPS},math.sqrt(v.ik_dx*v.ik_dx+v.ik_dy*v.ik_dy+v.ik_dz*v.ik_dz))`);
    push('ux', 'v.ik_dx/v.ik_D'); push('uy', 'v.ik_dy/v.ik_D'); push('uz', 'v.ik_dz/v.ik_D');
    // ② 弯曲参考面：n = normalize(u×ref)，ref=世界 Y；u 与 Y 近平行（|uy|>0.95）时换世界 X
    push('dg', 'math.abs(v.ik_uy)>0.95?1:0');
    // ★三元的每个分支都【不能以 ( 开头】：解释器在 ? / : 之后见到 ( 会当成「语句块」，
    //   于是 v.ik_dg?0:(-v.ik_uz) 会被解析成 v.ik_dg?0: { -v.ik_uz } 并报「语句结尾缺少分号」。
    //   ⇒ 一律改写成以数字开头的等价式（0-x、1-x*x）。
    push('n0x', 'v.ik_dg?0:0-v.ik_uz');
    push('n0y', 'v.ik_dg?v.ik_uz:0');
    push('n0z', 'v.ik_dg?0-v.ik_uy:v.ik_ux');
    push('nl', `math.max(${IK_EPS},math.sqrt(v.ik_n0x*v.ik_n0x+v.ik_n0y*v.ik_n0y+v.ik_n0z*v.ik_n0z))`);
    push('nx', 'v.ik_n0x/v.ik_nl'); push('ny', 'v.ik_n0y/v.ik_nl'); push('nz', 'v.ik_n0z/v.ik_nl');
    // ③ 平面内正交方向 nu = n×u
    push('nux', 'v.ik_ny*v.ik_uz-v.ik_nz*v.ik_uy');
    push('nuy', 'v.ik_nz*v.ik_ux-v.ik_nx*v.ik_uz');
    push('nuz', 'v.ik_nx*v.ik_uy-v.ik_ny*v.ik_ux');
    // ④ 肘关节弯曲量 β = PHI + acos(clamp((D²−A²−B²−2M)/2RAD))（clamp 内含够不着/太近两个边界）
    if (bendable) {
        const c0 = ikNum(A * A + B * B + 2 * MM), den = ikNum(2 * RAD);
        push('be', `${ikNum(PHI)}+math.acos(math.clamp((v.ik_D*v.ik_D-(${c0}))/${den},-1,1))`);
    } else {
        push('be', '0');
    }
    push('sbe', 'math.sin(v.ik_be)'); push('cbe', 'math.cos(v.ik_be)');
    // ⑤ 本地末端向量 W = A·a1 + Rz(−β)·uN
    push('Wx', `${ikNum(A * a1[0])}${term(uN[0], 'v.ik_cbe')}${term(uN[1], 'v.ik_sbe')}`);
    push('Wy', `${ikNum(A * a1[1])}${term(-uN[0], 'v.ik_sbe')}${term(uN[1], 'v.ik_cbe')}`);
    push('Wz', ikNum(A * a1[2] + uN[2]));
    push('Wl', `math.max(${IK_EPS},math.sqrt(v.ik_Wx*v.ik_Wx+v.ik_Wy*v.ik_Wy+v.ik_Wz*v.ik_Wz))`);
    push('w1x', 'v.ik_Wx/v.ik_Wl'); push('w1y', 'v.ik_Wy/v.ik_Wl'); push('w1z', 'v.ik_Wz/v.ik_Wl');
    // ⑥ 本地帧补齐：w3 = normalize(Z−(Z·w1)w1)；w1 几乎沿 Z 时改用 Y 作参考（两者都只是取正交基）
    push('dgw', 'math.abs(v.ik_w1x)+math.abs(v.ik_w1y)<0.0001?1:0');
    push('w3x', 'v.ik_dgw?0-v.ik_w1y*v.ik_w1x:0-v.ik_w1z*v.ik_w1x');
    push('w3y', 'v.ik_dgw?1-v.ik_w1y*v.ik_w1y:0-v.ik_w1z*v.ik_w1y');
    push('w3z', 'v.ik_dgw?0-v.ik_w1y*v.ik_w1z:1-v.ik_w1z*v.ik_w1z');
    push('w3l', `math.max(${IK_EPS},math.sqrt(v.ik_w3x*v.ik_w3x+v.ik_w3y*v.ik_w3y+v.ik_w3z*v.ik_w3z))`);
    push('e3x', 'v.ik_w3x/v.ik_w3l'); push('e3y', 'v.ik_w3y/v.ik_w3l'); push('e3z', 'v.ik_w3z/v.ik_w3l');
    push('w2x', 'v.ik_e3y*v.ik_w1z-v.ik_e3z*v.ik_w1y');
    push('w2y', 'v.ik_e3z*v.ik_w1x-v.ik_e3x*v.ik_w1z');
    push('w2z', 'v.ik_e3x*v.ik_w1y-v.ik_e3y*v.ik_w1x');
    // ⑦ R1 = [u,nu,n]·[w1,w2,w3]ᵀ  ⇒  R1·w1 = u（末端方向精确）
    const uArr = ['v.ik_ux', 'v.ik_uy', 'v.ik_uz'];
    const nuArr = ['v.ik_nux', 'v.ik_nuy', 'v.ik_nuz'];
    const nArr = ['v.ik_nx', 'v.ik_ny', 'v.ik_nz'];
    const w1Arr = ['v.ik_w1x', 'v.ik_w1y', 'v.ik_w1z'];
    const w2Arr = ['v.ik_w2x', 'v.ik_w2y', 'v.ik_w2z'];
    const w3Arr = ['v.ik_e3x', 'v.ik_e3y', 'v.ik_e3z'];
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            push('M' + r + c, `${uArr[r]}*${w1Arr[c]}+${nuArr[r]}*${w2Arr[c]}+${nArr[r]}*${w3Arr[c]}`);
        }
    }
    // ⑧ 欧拉反解（与导出 pR 约定一致：x=atan2(-R12, |cx|)、y=atan2(-R02,R22)、z=atan2(-R10,R11)）
    push('ec', `math.max(${IK_EPS},math.sqrt(v.ik_M10*v.ik_M10+v.ik_M11*v.ik_M11))`);
    push('ax', 'math.atan2(-v.ik_M12,v.ik_ec)');
    push('ay', 'math.atan2(-v.ik_M02,v.ik_M22)');
    push('az', 'math.atan2(-v.ik_M10,v.ik_M11)');
    if (parent) {
        // 有锚点：关节角 = 反解出的绝对欧拉 − 锚点欧拉（引擎里 rotate = 父 rotate + bone_rot）
        push('jrx', `math.min_angle(v.ik_ax-t.${safePar}_xrot)`);
        push('jry', `math.min_angle(v.ik_ay-t.${safePar}_yrot)`);
        push('jrz', `math.min_angle(v.ik_az-t.${safePar}_zrot)`);
    } else {
        // 自由根：链首没有父骨骼，直接接管它自己的 absolute rotate
        push('jrx', 'v.ik_ax'); push('jry', 'v.ik_ay'); push('jrz', 'v.ik_az');
    }
    return { vars: vin, A, B, hasMid, a1, N, elbowIndex };
}
// ★★2026-11-07 多关节 IK（用户要求「必须全关节可活动」）：等角度圆弧 + 二分求弯角 δ。
//   两连杆闭式解只能让一个肘弯；这里把整条链当「每节都弯 δ」的圆弧：
//     · 段向量 vec_k（链首本地系，Rz 作用下绕 z 转）：k=0..N-2 = chain[k+1] 的骨骼偏移；
//       k=N-1 = 末端块自身沿局部 +Y 伸出的一节 (0,tipLen,0)；
//     · 累计角 c_k = k·δ（0 号段不弯 ⇒ 绑定瞬间的形状原样保留，其余逐节均分弯曲）；
//     · 本地末端向量 W(δ) = Σ Rz(−kδ)·vec_k，z 分量与 δ 无关 ⇒ |W| 随 δ 单调减；
//     · 用 Molang 官方 loop 做 20 次二分：|W|>D ⇒ 弯不够 → 抬 lo；否则压 hi；D ≥ |W(0)| ⇒ δ→0（全链伸直）。
//     · 之后复用两连杆的 ⑥⑦⑧ 帧映射 R1=[u,nu,n]·[w1,w2,w3]ᵀ ⇒ R1·W=|W|·u，末端精确落在目标方向射线上。
//   ★返回 program（语句文本）而不是 vars：loop 只能是语句，不能再写成单个变量的表达式。
//   由 ikRebuildChain 写进末端块 program（molangMode），关节读 t.<tip>_ik_be、末端自己读 v.ik_be。
function ikBuildSolveArc(chain, parent, tipTarget, opts) {
    const c1 = chain[0];
    const N = chain.length;
    const opt = opts || {};
    const safeRoot = boneSafeId(c1.id);
    const safeTip = boneSafeId(chain[N - 1].id);
    const safePar = parent ? boneSafeId(parent.id) : '';
    const bk = (b, n) => vnum(b, 'v.' + n);
    const tipLen = (typeof opt.tipExtend === 'number') ? opt.tipExtend : ikSegLenOf(chain[N - 1]);
    const vecs = [];
    for (let k = 0; k <= N - 2; k++) {
        vecs.push([bk(chain[k + 1], 'xbasepos_bone'), bk(chain[k + 1], 'ybasepos_bone'), bk(chain[k + 1], 'zbasepos_bone')]);
    }
    vecs.push([0, tipLen, 0]);
    let wz = 0; for (const v of vecs) wz += v[2];
    // 等长共线链在 δ = 360/N（角度制）时首尾闭合 ⇒ 二分区间上限即取它（不足时收敛到上限，尽力而为）
    const dmax = 360 / N;
    const tgt = v => (typeof v === 'string' ? v : ikNum(v));
    const tgtSrc = (opt.targetExpr && opt.targetExpr.length === 3) ? opt.targetExpr : tipTarget;
    const rootPos = (opt.rootPos && opt.rootPos.length === 3) ? opt.rootPos
        : [`t.${safeRoot}_px`, `t.${safeRoot}_py`, `t.${safeRoot}_pz`];
    const S = [];
    const st = s => S.push(s);
    // 标记：这行让「导入存档后再次重建」也能认出末端块里装的是多关节 IK 程序（v.ik_* 会被基线剥离）
    st('v.ik_multi=1;');
    // ① 目标 / 目标方向（与两连杆完全同口径）
    st(`v.ik_tx=${tgt(tgtSrc[0])};`);
    st(`v.ik_ty=${tgt(tgtSrc[1])};`);
    st(`v.ik_tz=${tgt(tgtSrc[2])};`);
    st(`v.ik_dx=v.ik_tx-${rootPos[0]};`);
    st(`v.ik_dy=v.ik_ty-${rootPos[1]};`);
    st(`v.ik_dz=v.ik_tz-${rootPos[2]};`);
    st(`v.ik_D=math.max(${IK_EPS},math.sqrt(v.ik_dx*v.ik_dx+v.ik_dy*v.ik_dy+v.ik_dz*v.ik_dz));`);
    st('v.ik_ux=v.ik_dx/v.ik_D;');
    st('v.ik_uy=v.ik_dy/v.ik_D;');
    st('v.ik_uz=v.ik_dz/v.ik_D;');
    // ② 弯曲参考面：n = normalize(u×ref)，ref=世界 Y ⇒ 含竖直线的垂直平面。
    //   ★2026-11-07：u 与 Y 近平行（|uy|>0.95）时 u×Y 退化，旧写法硬切到世界 X 平面 ⇒
    //   该腿的圆弧平面与其它腿完全不同、根骨朝侧面倒（用户反馈「有一根骨骼角度不对」）。
    //   改为切到「目标→髋」的水平径向 R̂ ⇒ n=u×R̂，仍是「含竖直线的那张自然平面」，六条腿观感一致。
    st(`v.ik_hx=${rootPos[0]}-v.ik_tx;`);              // 目标 → 根（水平分量）
    st(`v.ik_hz=${rootPos[2]}-v.ik_tz;`);
    // 目标正好在髋的正上/正下方时水平径向也为 0 ⇒ 回退到世界 X（绝不能给出零法向）
    st(`v.ik_hok=v.ik_hx*v.ik_hx+v.ik_hz*v.ik_hz<0.00000001?0:1;`);
    st(`v.ik_hl=math.max(${IK_EPS},math.sqrt(v.ik_hx*v.ik_hx+v.ik_hz*v.ik_hz));`);
    st('v.ik_hrx=v.ik_hok?v.ik_hx/v.ik_hl:1;');
    st('v.ik_hrz=v.ik_hok?v.ik_hz/v.ik_hl:0;');
    st('v.ik_dg=math.abs(v.ik_uy)>0.95?1:0;');
    st('v.ik_n0x=v.ik_dg?v.ik_uy*v.ik_hrz:0-v.ik_uz;');
    st('v.ik_n0y=v.ik_dg?v.ik_uz*v.ik_hrx-v.ik_ux*v.ik_hrz:0;');
    st('v.ik_n0z=v.ik_dg?0-v.ik_uy*v.ik_hrx:v.ik_ux;');
    st(`v.ik_nl=math.max(${IK_EPS},math.sqrt(v.ik_n0x*v.ik_n0x+v.ik_n0y*v.ik_n0y+v.ik_n0z*v.ik_n0z));`);
    st('v.ik_nx=v.ik_n0x/v.ik_nl;');
    st('v.ik_ny=v.ik_n0y/v.ik_nl;');
    st('v.ik_nz=v.ik_n0z/v.ik_nl;');
    st('v.ik_nux=v.ik_ny*v.ik_uz-v.ik_nz*v.ik_uy;');
    st('v.ik_nuy=v.ik_nz*v.ik_ux-v.ik_nx*v.ik_uz;');
    st('v.ik_nuz=v.ik_nx*v.ik_uy-v.ik_ny*v.ik_ux;');
    // ③ 末尾向量 W(δ)：每个段都绕本地 z 转 −kδ，z 分量不变（wz 常量）
    const emitW = () => {
        st('v.ik_c=0;');
        st('v.ik_Wx=0;');
        st('v.ik_Wy=0;');
        for (const [x, y] of vecs) {
            st(`v.ik_Wx=v.ik_Wx+(${ikNum(x)})*math.cos(v.ik_c)+(${ikNum(y)})*math.sin(v.ik_c);`);
            st(`v.ik_Wy=v.ik_Wy-(${ikNum(x)})*math.sin(v.ik_c)+(${ikNum(y)})*math.cos(v.ik_c);`);
            st('v.ik_c=v.ik_c+v.ik_be;');
        }
        st(`v.ik_Wl=math.max(${IK_EPS},math.sqrt(v.ik_Wx*v.ik_Wx+v.ik_Wy*v.ik_Wy+(${ikNum(wz * wz)})));`);
    };
    // ④ 二分求 δ：|W| 随 δ 单调减 ⇒ |W|>D 抬 lo，否则压 hi
    st('v.ik_lo=0;');
    st(`v.ik_hi=${ikNum(dmax)};`);
    st('loop(20,{');
    st('v.ik_be=(v.ik_lo+v.ik_hi)*0.5;');
    emitW();
    st('v.ik_gt=v.ik_Wl>v.ik_D?1:0;');
    st('v.ik_lo=v.ik_gt?v.ik_be:v.ik_lo;');
    st('v.ik_hi=v.ik_gt?v.ik_hi:v.ik_be;');
    st('});');
    st('v.ik_be=(v.ik_lo+v.ik_hi)*0.5;');
    emitW();
    st('v.ik_w1x=v.ik_Wx/v.ik_Wl;');
    st('v.ik_w1y=v.ik_Wy/v.ik_Wl;');
    st(`v.ik_w1z=${ikNum(wz)}/v.ik_Wl;`);
    // ⑤ 本地帧补齐（同两连杆 ⑥）
    st('v.ik_dgw=math.abs(v.ik_w1x)+math.abs(v.ik_w1y)<0.0001?1:0;');
    st('v.ik_w3x=v.ik_dgw?0-v.ik_w1y*v.ik_w1x:0-v.ik_w1z*v.ik_w1x;');
    st('v.ik_w3y=v.ik_dgw?1-v.ik_w1y*v.ik_w1y:0-v.ik_w1z*v.ik_w1y;');
    st('v.ik_w3z=v.ik_dgw?0-v.ik_w1y*v.ik_w1z:1-v.ik_w1z*v.ik_w1z;');
    st(`v.ik_w3l=math.max(${IK_EPS},math.sqrt(v.ik_w3x*v.ik_w3x+v.ik_w3y*v.ik_w3y+v.ik_w3z*v.ik_w3z));`);
    st('v.ik_e3x=v.ik_w3x/v.ik_w3l;');
    st('v.ik_e3y=v.ik_w3y/v.ik_w3l;');
    st('v.ik_e3z=v.ik_w3z/v.ik_w3l;');
    st('v.ik_w2x=v.ik_e3y*v.ik_w1z-v.ik_e3z*v.ik_w1y;');
    st('v.ik_w2y=v.ik_e3z*v.ik_w1x-v.ik_e3x*v.ik_w1z;');
    st('v.ik_w2z=v.ik_e3x*v.ik_w1y-v.ik_e3y*v.ik_w1x;');
    const uArr = ['v.ik_ux', 'v.ik_uy', 'v.ik_uz'];
    const nuArr = ['v.ik_nux', 'v.ik_nuy', 'v.ik_nuz'];
    const nArr = ['v.ik_nx', 'v.ik_ny', 'v.ik_nz'];
    const w1Arr = ['v.ik_w1x', 'v.ik_w1y', 'v.ik_w1z'];
    const w2Arr = ['v.ik_w2x', 'v.ik_w2y', 'v.ik_w2z'];
    const w3Arr = ['v.ik_e3x', 'v.ik_e3y', 'v.ik_e3z'];
    // 欧拉反解只用到 M10/M11/M12/M02/M22 五个元素 ⇒ 其余四行不生成（每行 ~95 字符）
    for (const [r, c] of [[0, 2], [1, 0], [1, 1], [1, 2], [2, 2]]) {
        st(`v.ik_M${r}${c}=${uArr[r]}*${w1Arr[c]}+${nuArr[r]}*${w2Arr[c]}+${nArr[r]}*${w3Arr[c]};`);
    }
    // ⑥ 欧拉反解（与导出 pR 约定一致）
    st(`v.ik_ec=math.max(${IK_EPS},math.sqrt(v.ik_M10*v.ik_M10+v.ik_M11*v.ik_M11));`);
    st('v.ik_ax=math.atan2(0-v.ik_M12,v.ik_ec);');
    st('v.ik_ay=math.atan2(0-v.ik_M02,v.ik_M22);');
    st('v.ik_az=math.atan2(0-v.ik_M10,v.ik_M11);');
    if (parent) {
        st(`v.ik_jrx=math.min_angle(v.ik_ax-t.${safePar}_xrot);`);
        st(`v.ik_jry=math.min_angle(v.ik_ay-t.${safePar}_yrot);`);
        st(`v.ik_jrz=math.min_angle(v.ik_az-t.${safePar}_zrot);`);
    } else {
        st('v.ik_jrx=v.ik_ax;');
        st('v.ik_jry=v.ik_ay;');
        st('v.ik_jrz=v.ik_az;');
    }
    // ⑦ 发布给各关节（程序里自带发布语句 ⇒ 导出 / 编辑器 / 运行三处一致）
    ['ik_jrx', 'ik_jry', 'ik_jrz', 'ik_be'].forEach(k => st(`t.${safeTip}_${k}=v.${k};`));
    return { multiJoint: true, N, tipLen, vecs, program: S.join(' '), aVar: 'v.ik_be' };
}
// ★★2026-11-07 通用 IK（用户：「等角圆弧只能往一侧弯，没法向上弯曲」「要效果最好的 / 任意造型优先」）：
//   把整条链看成平面 N 连杆（每节只绕本地 z 转，几何由 ikBuildSolveArc 同一套 vec_k 给出），
//   · 平面：与圆弧解同一张面（span(u, nu)，nu = n×u），目标只取平面内半径 rr = √(D²−wz²)（绕 z 转不改 z）；
//   · 初值（种子）：绑定姿态是弯的（任意造型）⇒ b=0 原样保留用户摆好的造型；
//     绑定姿态完全共线 ⇒ 共线构型是 DLS 的一阶退化点（解不出径向），才用等角圆弧 δ 破退化（二分求 |W(δ)|=D）。
//   · 精修 = 退火阻尼最小二乘 DLS（Levenberg–Marquardt）：每轮解 J Jᵀ+λ²I，Δb=Jᵀw，
//     即「最小关节改变」⇒ 变化沿整链均摊，不会像 CCD/FABRIK 那样把弯折全堆到末节或 ±170° 折叠；
//     λ² 每轮减半（0.5→0.01）⇒ 前几轮保形状、后几轮把末端收到机器精度。
//   · 够不着（rr ≥ 平面总长）⇒ 直接取直线：b_k = 基形夹角差，末端 = 平面总长沿基形方向。
//   · 关节角 v.ik_b{k} 每帧确定性求解（跨帧连续），程序交给末端块的 molang 程序执行。
function ikBuildSolveCcd(chain, parent, tipTarget, opts) {
    const c1 = chain[0];
    const N = chain.length;
    const opt = opts || {};
    const safeRoot = boneSafeId(c1.id);
    const safeTip = boneSafeId(chain[N - 1].id);
    const safePar = parent ? boneSafeId(parent.id) : '';
    const bk = (b, n) => vnum(b, 'v.' + n);
    const tipLen = (typeof opt.tipExtend === 'number') ? opt.tipExtend : ikSegLenOf(chain[N - 1]);
    const vecs = [];
    for (let k = 0; k <= N - 2; k++) {
        vecs.push([bk(chain[k + 1], 'xbasepos_bone'), bk(chain[k + 1], 'ybasepos_bone'), bk(chain[k + 1], 'zbasepos_bone')]);
    }
    vecs.push([0, tipLen, 0]);
    let wz = 0; for (const v of vecs) wz += v[2];
    // ★2026-11-07 每关节「活动权重」(0..1)：0 = 完全不活动（DLS 给该关节的增量恒为 0），1 = 正常。
    //   由 ikRebuildChain 传入各关节块的 t.<关节>_ikW；缺省 1 ⇒ 不带权重时生成的程序与旧版逐字一致（零回归）。
    const wExpr = [null];
    let hasW = false;
    for (let k = 1; k < N; k++) {
        const w = (opt.weights && opt.weights[k - 1] != null) ? String(opt.weights[k - 1]) : '1';
        wExpr.push(w);
        if (w !== '1') hasW = true;
    }
    const R2D = 180 / Math.PI;
    const lenXY = vecs.map(v => Math.hypot(v[0], v[1]));
    const Lxy = lenXY.reduce((s, x) => s + x, 0);
    // 段在平面内的基准方向角（用于「直线兜底」与关节角反解：b_k = Δbase_k 时整链共线）
    const base = vecs.map(v => (Math.abs(v[0]) + Math.abs(v[1]) < 1e-9 ? 0 : Math.atan2(v[1], v[0]) * R2D));
    const dBase = [0];
    for (let k = 1; k < N; k++) dBase.push(base[k] - base[k - 1]);
    // ★种子 = 只在「绑定姿态共线」时用等角圆弧（见 ikBuildSolveArc）：所有关节都弯同一角 δ，形状自然、无折叠；
    //   任意造型走 b=0 保留姿态。之后统一由 DLS 精修，见 ⑤。
    const dmax = 360 / N;
    const wxS = Lxy * Math.cos(base[0] * Math.PI / 180);
    const wyS = Lxy * Math.sin(base[0] * Math.PI / 180);
    const iters = Math.max(4, Math.floor(typeof opt.ikIter === 'number' ? opt.ikIter
        : (typeof opt.ccdIter === 'number' ? opt.ccdIter : 20)));
    const tgt = v => (typeof v === 'string' ? v : ikNum(v));
    const tgtSrc = (opt.targetExpr && opt.targetExpr.length === 3) ? opt.targetExpr : tipTarget;
    const rootPos = (opt.rootPos && opt.rootPos.length === 3) ? opt.rootPos
        : [`t.${safeRoot}_px`, `t.${safeRoot}_py`, `t.${safeRoot}_pz`];
    const S = [];
    const st = s => S.push(s);
    // 三元分支不能以 '(' 或负号开头（解释器会把 '(' 当语句块）⇒ 负数写成 0-12.3
    const nf = x => { const s = ikNum(x); return s.charAt(0) === '-' ? '0-' + s.slice(1) : s; };
    // ★★求解正文必须与具体链无关：所有几何/目标/权重/父旋转一律走输入变量，
    //   这样「段数 N 相同」的链可以共用同一个动画 ik_solve_N（见 ikSolveAnimation）。
    const gx = v => `v.ik_g${v}x`;
    const gy = v => `v.ik_g${v}y`;
    const posX = v => `v.ik_p${v + 1}x=v.ik_p${v}x+(${gx(v)})*math.cos(v.ik_c)+(${gy(v)})*math.sin(v.ik_c);`;
    const posY = v => `v.ik_p${v + 1}y=v.ik_p${v}y-(${gx(v)})*math.sin(v.ik_c)+(${gy(v)})*math.cos(v.ik_c);`;
    // ① 目标 / 目标方向（输入由每块 base 提供：v.ik_tx/ty/tz、v.ik_rx0/ry0/rz0）
    // ★2026-11-07 精简：凡是由「段向量 g_k」能推出来的量，一律挪到共用正文里算，
    //   每块 base 只留这条链独有的数据（目标/根位置/段向量/权重/父旋转）。
    //   wz2 = wz²；lxy = Σ|g_k|；基形方向角 db_k = atan2(g_k) − atan2(g_{k−1})（度）；
    //   Wx/Wy = lxy·(cos,sin)(基形 0 号段方向) —— 同 N 的所有链共用这一份计算。
    st('v.ik_wz2=v.ik_wz*v.ik_wz;');
    st('v.ik_lxy=0;');
    for (let k = 0; k < N; k++) st(`v.ik_lxy=v.ik_lxy+math.sqrt(v.ik_g${k}x*v.ik_g${k}x+v.ik_g${k}y*v.ik_g${k}y);`);
    st('v.ik_db0=math.atan2(v.ik_g0y,v.ik_g0x);');
    // ★坑（已修）：曾写成 `db_k = atan2(g_k) − v.ik_db{k-1}`，但 k−1 本身已经是「差值」，
    //   于是 preset 那种全共线链会算出 db2=90°、db3=0°、db4=90° 的 0/90 交替 ⇒ 够不着分支
    //   把关节折成锯齿、末端掉到地面（用户反馈「效果和以前不一样 / 腿散架」）。
    //   差值必须用相邻两段的【绝对方向角】相减。
    for (let k = 1; k < N; k++) st(`v.ik_db${k}=math.atan2(v.ik_g${k}y,v.ik_g${k}x)-math.atan2(v.ik_g${k - 1}y,v.ik_g${k - 1}x);`);
    st('v.ik_wx=v.ik_lxy*math.cos(v.ik_db0);');
    st('v.ik_wy=v.ik_lxy*math.sin(v.ik_db0);');
    st('v.ik_dx=v.ik_tx-v.ik_rx0;');
    st('v.ik_dy=v.ik_ty-v.ik_ry0;');
    st('v.ik_dz=v.ik_tz-v.ik_rz0;');
    st(`v.ik_D=math.max(${IK_EPS},math.sqrt(v.ik_dx*v.ik_dx+v.ik_dy*v.ik_dy+v.ik_dz*v.ik_dz));`);
    st('v.ik_ux=v.ik_dx/v.ik_D;');
    st('v.ik_uy=v.ik_dy/v.ik_D;');
    st('v.ik_uz=v.ik_dz/v.ik_D;');
    // ② 弯曲参考面（同圆弧解：n = normalize(u×ref)，近竖直时 ref 换成水平径向）
    st('v.ik_hx=v.ik_rx0-v.ik_tx;');
    st('v.ik_hz=v.ik_rz0-v.ik_tz;');
    st(`v.ik_hok=v.ik_hx*v.ik_hx+v.ik_hz*v.ik_hz<0.00000001?0:1;`);
    st(`v.ik_hl=math.max(${IK_EPS},math.sqrt(v.ik_hx*v.ik_hx+v.ik_hz*v.ik_hz));`);
    st('v.ik_hrx=v.ik_hok?v.ik_hx/v.ik_hl:1;');
    st('v.ik_hrz=v.ik_hok?v.ik_hz/v.ik_hl:0;');
    st('v.ik_dg=math.abs(v.ik_uy)>0.95?1:0;');
    st('v.ik_n0x=v.ik_dg?v.ik_uy*v.ik_hrz:0-v.ik_uz;');
    st('v.ik_n0y=v.ik_dg?v.ik_uz*v.ik_hrx-v.ik_ux*v.ik_hrz:0;');
    st('v.ik_n0z=v.ik_dg?0-v.ik_uy*v.ik_hrx:v.ik_ux;');
    st(`v.ik_nl=math.max(${IK_EPS},math.sqrt(v.ik_n0x*v.ik_n0x+v.ik_n0y*v.ik_n0y+v.ik_n0z*v.ik_n0z));`);
    st('v.ik_nx=v.ik_n0x/v.ik_nl;');
    st('v.ik_ny=v.ik_n0y/v.ik_nl;');
    st('v.ik_nz=v.ik_n0z/v.ik_nl;');
    st('v.ik_nux=v.ik_ny*v.ik_uz-v.ik_nz*v.ik_uy;');
    st('v.ik_nuy=v.ik_nz*v.ik_ux-v.ik_nx*v.ik_uz;');
    st('v.ik_nuz=v.ik_nx*v.ik_uy-v.ik_ny*v.ik_ux;');
    // ③ 平面内目标半径（z 分量在绕本地 z 的旋转下不变）
    st('v.ik_rr=math.sqrt(math.max(0,v.ik_D*v.ik_D-(v.ik_wz2)));');
    // ④ 种子（决定「形状从哪来」）：
    //   · 绑定姿态本来就是弯的（任意造型）⇒ 关节角全 0 = 原样保留用户摆好的形状，只求末端对准；
    //   · 绑定姿态完全拉直（所有段共线）⇒ DLS 在共线构型是退化点（一阶解不出径向），
    //     用等角圆弧 δ 打破退化：二分求 |W(δ)|=D，符号按 +nu 朝上 ⇒ 从「均匀向上拱」起步。
    // ★★★2026-11-14【「明明够得着却是一根棍子」的根因】
    //   旧实现用 dBase（相邻段方向角之差）判共线。末端段的 g 若长度为 0（tipLen 算成 0），
    //   atan2(0,0) 被当成 0°，于是 dBase = 90°-0° = -90° ⇒ 误判「非共线」⇒ v.ik_arc=0 ⇒ 种子取 0。
    //   而种子 0 正好是**共线退化点**：直链绕关节一转，末端只会往横向走（一阶 rx=0）⇒ DLS 解不出径向位移
    //   ⇒ 永远停在直链 ⇒ 就是用户看到的「一根棍子」。
    //   现在改成：跳过零长段，用单位方向向量的夹角判共线（不再依赖角度差）。
    // 绑定姿态「最大偏离首段方向」的夹角（度）。两个用途，阈值不同：
    //   · straightBind   ≤ IK_STRAIGHT_TOL(12°)  = 基本共线 ⇒ 默认走圆弧种子（手工链有 2~4° 抖动）
    //   · degenerateBind ≤ IK_DEGENERATE_TOL(0.5°)= 数学上真退化 ⇒ mode=0 也必须退回圆弧（否则直棒）
    const bindWorstDeg = (() => {
        let ref = null, worst = 0;
        for (let k = 0; k < N; k++) {
            const v = vecs[k];
            if (!v) continue;
            const L = Math.hypot(v[0], v[1]);
            if (!(L > 1e-9)) continue;                 // 零长段没有方向，不参与判断
            const d = [v[0] / L, v[1] / L];
            if (!ref) { ref = d; continue; }
            const dot = Math.max(-1, Math.min(1, ref[0] * d[0] + ref[1] * d[1]));
            worst = Math.max(worst, Math.acos(dot) * 180 / Math.PI);
        }
        return worst;
    })();
    const straightBind = bindWorstDeg <= IK_STRAIGHT_TOL;
    const degenerateBind = bindWorstDeg <= IK_DEGENERATE_TOL;
    // 末端链位置前向传播（p0→pN）：种子、DLS 每轮、以及最终位置都用它，避免重复展开
    const emitForward = (useB) => {
        st('v.ik_p0x=0;');
        st('v.ik_p0y=0;');
        st('v.ik_c=0;');
        for (let k = 0; k < N; k++) {
            // useB=false（二分）：用「真实种子方向」sd_k 求弦长 ⇒ wav=0 时 sd≡1，与旧版逐字一致；
            //   wav=±1 时 sd=±W（S 形），二分直接给出「S 弦长 = D」的 δ，DLS 才不会把 S 抹平。
            if (k > 0) st(useB ? `v.ik_c=v.ik_c+v.ik_b${k};` : `v.ik_c=v.ik_c+v.ik_bs*v.ik_sd${k};`);
            st(posX(k));
            st(posY(k));
        }
    };
    // ★共用正文只有一份 ⇒ 两条种子分支合并：先一律跑等角圆弧二分，再由输入 v.ik_arc
    //   （1 = 绑定姿态共线、需要破退化；0 = 任意造型、种子取 0 保留姿态）决定是否采用。
    st('v.ik_sgn=v.ik_nuy>=0?1:0-1;');
    st('v.ik_loa=0;');
    st(`v.ik_hib=${ikNum(dmax)}*v.ik_sgn;`);
    // ★★2026-11-14【S 形多弧：带符号波形种子 v.ikWave】
    //   现有 v.ik_sh{k} 恒 ≥0 ⇒ 所有关节同号 ⇒ 只能出 C/U 单弧，**结构上出不了 S**。
    //   这里给每个关节一条「根 +1 → 末端 −1」的线性带符号波形，让曲率沿链反号 ⇒ 真 S 形多弧。
    //   ★关键：sd_k 必须参与【二分求 δ】，否则二分按 C 弧算出「能到 D」的 δ，而 S 弦更短
    //     ⇒ DLS 为够到目标会把 S 重新抹平（实测 b 全正、flips=0）。
    //   · wav = 0  ⇒ sd_k ≡ 1 ⇒ 二分与种子都与旧版逐字一致（零回归）
    //   · wav = ±1 ⇒ sd_k = ±W_k ⇒ 纯 S 种子，且二分给的是「S 弦长 = D」的 δ
    //   · sd 不乘 gw/sh：二分保持旧口径；实际种子 b_k = bs·sh_k·sd_k 仍受权重约束（gw=0 ⇒ 0）
    st('v.ik_wav=math.max(0-1,math.min(1,v.ik_wave));');
    for (let k = 1; k < N; k++) {
        const W = (N > 2) ? (1 - 2 * (k - 1) / (N - 1)) : 0;   // 根 +1 → 末端 −1
        const wLit = W < 0 ? '0' + ikNum(W) : ikNum(W);
        st(`v.ik_sd${k}=(1-math.abs(v.ik_wav))+v.ik_wav*(${wLit});`);
    }
    // ★单调性能：只有「绑定姿态共线」才需要圆弧种子；否则整段二分白跑（20×22 条语句/帧）
    // ★★★【2026-11-10 语法修正 · 真机 unknown token 报错根因】
    //   Molang **没有 `if(cond){…}` 语句**！官方流程控制只有两种写法：
    //     · `cond ? { …语句… };`      —— 条件执行一段（brace scope，bedrock.dev「Brace Scope Delimiters」）
    //     · `a ? b : c`               —— 三元表达式
    //   以前写成 `if(v.ik_arc){ … };` 只在**本项目的宽松解释器**里跑得通；真机解析到 `if` 就抛
    //   `Error: unknown token: if(v.ik_arc){ …` ⇒ 整段求解程序作废、关节角恒 0 ⇒ 触手散架。
    //   凡是往导出正文里写条件语句，一律用 `(cond)?{` … `};`。
    // ★★2026-11-14【v.ikMode=0 + 直链 = 一根直棒】
    //   保形路线种子 b=0（保留绑定姿态）；若绑定姿态本来就是共线直链 ⇒ 没有「形」可保，
    //   而 DLS 在完全共线构型是退化点（一阶解不出径向缩短）⇒ 只会整链转成直棒指向目标、够不到。
    //   这里用输入 v.ik_straightb（= 绑定姿态是否共线，链自己的常量）做兜底：
    //   直链时即使 mode=0 也走圆弧种子（不然必是一根棍子）；非直链 mode=0 仍原样保形（零回归）。
    st('(v.ik_arc+v.ik_straightb>0)?{');
    st('loop(20,{');
    st('v.ik_bs=(v.ik_loa+v.ik_hib)*0.5;');
    // 二分求「等角圆弧」弦长：直接用同一套前向传播，末尾 pN 就是弦向量 W
    emitForward(false);
    // 只需比较弦长大小 ⇒ 用平方比较，省掉每次迭代的 sqrt 与 max
    st(`v.ik_gt=v.ik_p${N}x*v.ik_p${N}x+v.ik_p${N}y*v.ik_p${N}y+(v.ik_wz2)>v.ik_D*v.ik_D?1:0;`);
    st('v.ik_loa=v.ik_gt?v.ik_bs:v.ik_loa;');
    st('v.ik_hib=v.ik_gt?v.ik_hib:v.ik_bs;');
    st('});');
    st('};');
    st('v.ik_bs=(v.ik_arc+v.ik_straightb)>0?v.ik_bs:0;');
    // 权重变量（夹到 [0,1]）：0 ⇒ DLS 给该关节的 Δb 恒为 0 = 完全不活动
    for (let k = 1; k < N; k++) st(`v.ik_gw${k}=math.max(0,math.min(1,v.ik_w${k}));`);
    // ★★2026-11-10 造型旋钮 v.ik_shape（末端块上的普通变量 v.ikShape，-1..1）
    //   DLS 的解是「最小关节改变」⇒ 从等角圆弧出发永远只会得到正圆（用户：「做不出那种奇诡的触手了」）。
    //   这里给每关节再乘一个**沿链线性变化的重心因子**，把弯折量有意地往某一端偏：
    //     S_k = 2(k−1)/(N−1) − 1      （根 −1 … 末端 +1）
    //     w'_k = gw_k · (1 + shape·S_k)
    //   · shape = 0    ⇒ w'≡gw，完全等价于原来的等角圆弧（正圆，零回归）
    //   · shape > 0    ⇒ 根部权重被压到 0、末端放大 ⇒ 弯折全堆到末端（CCD 那种鞭子/触手手形）
    //   · shape < 0    ⇒ 反过来，根部弯得多（从根卷起的螺旋）
    //   权重同时进「种子」与「DLS 增量」，所以这个形状会被保留，而末端仍由 DLS 收准（不会脱靶）。
    st('v.ik_shp=math.max(0-1,math.min(1,v.ik_shape));');
    for (let k = 1; k < N; k++) {
        const S = (N > 2) ? (2 * (k - 1) / (N - 1) - 1) : 0;
        const sLit = S < 0 ? '0' + ikNum(S) : ikNum(S);
        st(`v.ik_sh${k}=v.ik_gw${k}*(1+v.ik_shp*(${sLit}));`);
    }
    // ★★2026-11-14 S 形多弧：实际种子 = bs·sh_k·sd_k
    //   （sd 在二分前已算好，参与 δ 求解；wav=0 时 sd≡1 ⇒ 与旧版逐字一致，零回归）
    for (let k = 1; k < N; k++) {
        st(`v.ik_b${k}=v.ik_bs*v.ik_sh${k}*v.ik_sd${k};`);
    }
    // b=0 / 圆弧种子对应的初始链位置（DLS 第一轮用）
    emitForward(true);
    st(`v.ik_wl2=math.max(${IK_EPS},math.sqrt(v.ik_p${N}x*v.ik_p${N}x+v.ik_p${N}y*v.ik_p${N}y));`);
    st(`v.ik_ggx=v.ik_rr*v.ik_p${N}x/v.ik_wl2;`);
    st(`v.ik_ggy=v.ik_rr*v.ik_p${N}y/v.ik_wl2;`);
    // ⑤ 精修 = 退火阻尼最小二乘（DLS / Levenberg–Marquardt）：
    //   每轮：摆枢轴 → e = 目标−末端 → 每关节 J_j=(ry,−rx) → 解 2×2 的 (J Jᵀ+λ²I) → Δb = Jᵀw
    //   · 解是「最小关节改变」⇒ 变化在整条链上均摊，不会像 CCD 那样全堆到末节或 ±170° 折叠；
    //   · λ² 每轮减半（0.5 → 0.01）⇒ 前几轮保形状，后几轮把末端收到 1e-9 级；
    //   · 关节角限幅 ±170°（防对折）；够不着时整链伸直由 ⑦ 覆盖。
    st('v.ik_lam=0.5;');
    // ★迭代数写死：共用正文必须逐字一致（不同链传不同 ikIter 会退化成各一份程序）
    st(`loop(${IK_SOLVE_ITERS},{`);
    // ★每轮「先算残差/Jacobian（用上一轮已经摆好的 p），再更新关节角，最后前向重摆」：
    //   与旧版「先摆后更新」逐轮等价，但出循环时 p 已经是最终关节角对应的位置 ⇒ 不需要再补一趟前向。
    st(`v.ik_ex=v.ik_ggx-v.ik_p${N}x;`);
    st(`v.ik_ey=v.ik_ggy-v.ik_p${N}y;`);
    // ★性能：末端已收敛（误差 <5e-4 单位）就直接跳过本轮更新与前向重摆。
    //   等角圆弧种子往往第一轮就已经到位 ⇒ 绝大多数帧只跑残差那两条语句，省掉 20×(整链更新+重摆)。
    st('v.ik_e2=v.ik_ex*v.ik_ex+v.ik_ey*v.ik_ey;');
    st('(v.ik_e2>0.00000025)?{');
    st('v.ik_m00=v.ik_lam;');
    st('v.ik_m01=0;');
    st('v.ik_m11=v.ik_lam;');
    for (let j = 1; j < N; j++) {
        const w = `v.ik_sh${j}*`;
        st(`v.ik_rx=v.ik_p${N}x-v.ik_p${j}x;`);
        st(`v.ik_ry=v.ik_p${N}y-v.ik_p${j}y;`);
        st(`v.ik_m00=v.ik_m00+${w}v.ik_ry*v.ik_ry;`);
        st(`v.ik_m01=v.ik_m01-${w}v.ik_ry*v.ik_rx;`);
        st(`v.ik_m11=v.ik_m11+${w}v.ik_rx*v.ik_rx;`);
    }
    st('v.ik_det=v.ik_m00*v.ik_m11-v.ik_m01*v.ik_m01;');
    st('v.ik_dinv=1/math.max(0.000001,v.ik_det);');
    st('v.ik_w0=(v.ik_m11*v.ik_ex-v.ik_m01*v.ik_ey)*v.ik_dinv;');
    st('v.ik_w1=(v.ik_m00*v.ik_ey-v.ik_m01*v.ik_ex)*v.ik_dinv;');
    for (let j = 1; j < N; j++) {
        const w = `v.ik_sh${j}*`;
        st(`v.ik_rx=v.ik_p${N}x-v.ik_p${j}x;`);
        st(`v.ik_ry=v.ik_p${N}y-v.ik_p${j}y;`);
        st(`v.ik_dj=${w}(v.ik_ry*v.ik_w0-v.ik_rx*v.ik_w1)*57.2957795;`);
        st(`v.ik_b${j}=math.max(0-170,math.min(170,v.ik_b${j}+v.ik_dj));`);
    }
    st('v.ik_lam=math.max(0.01,v.ik_lam*0.5);');
    emitForward(true);   // 用刚更新的关节角重摆 ⇒ 出循环 p 即最终位置（替代旧的 ⑥ 补算）
    st('};');
    st('});');
    // ⑦ 够不着 / 正好拉满 ⇒ 整链直线指向目标（b_k = 基形夹角差；W = 平面总长沿基形 0 号段方向）
    st(`v.ik_str=v.ik_rr>=v.ik_lxy-0.000001?1:0;`);
    for (let k = 1; k < N; k++) {
        // 够不着时按权重缩放基形夹角：权重 0 的关节保持不动（「完全不活动」优先于「必须拉直」）
        st(`v.ik_b${k}=v.ik_str?v.ik_gw${k}*(v.ik_db${k}):v.ik_b${k};`);
    }
    st(`v.ik_Wx=v.ik_str?v.ik_wx:v.ik_p${N}x;`);
    st(`v.ik_Wy=v.ik_str?v.ik_wy:v.ik_p${N}y;`);
    st(`v.ik_Wl=math.max(${IK_EPS},math.sqrt(v.ik_Wx*v.ik_Wx+v.ik_Wy*v.ik_Wy+(v.ik_wz2)));`);
    st('v.ik_w1x=v.ik_Wx/v.ik_Wl;');
    st('v.ik_w1y=v.ik_Wy/v.ik_Wl;');
    st('v.ik_w1z=v.ik_wz/v.ik_Wl;');
    // ⑧ 本地帧补齐（同圆弧解）：w3 = normalize(Z−(Z·w1)w1)
    st('v.ik_dgw=math.abs(v.ik_w1x)+math.abs(v.ik_w1y)<0.0001?1:0;');
    st('v.ik_w3x=v.ik_dgw?0-v.ik_w1y*v.ik_w1x:0-v.ik_w1z*v.ik_w1x;');
    st('v.ik_w3y=v.ik_dgw?1-v.ik_w1y*v.ik_w1y:0-v.ik_w1z*v.ik_w1y;');
    st('v.ik_w3z=v.ik_dgw?0-v.ik_w1y*v.ik_w1z:1-v.ik_w1z*v.ik_w1z;');
    st(`v.ik_w3l=math.max(${IK_EPS},math.sqrt(v.ik_w3x*v.ik_w3x+v.ik_w3y*v.ik_w3y+v.ik_w3z*v.ik_w3z));`);
    st('v.ik_e3x=v.ik_w3x/v.ik_w3l;');
    st('v.ik_e3y=v.ik_w3y/v.ik_w3l;');
    st('v.ik_e3z=v.ik_w3z/v.ik_w3l;');
    st('v.ik_w2x=v.ik_e3y*v.ik_w1z-v.ik_e3z*v.ik_w1y;');
    st('v.ik_w2y=v.ik_e3z*v.ik_w1x-v.ik_e3x*v.ik_w1z;');
    st('v.ik_w2z=v.ik_e3x*v.ik_w1y-v.ik_e3y*v.ik_w1x;');
    const uArr = ['v.ik_ux', 'v.ik_uy', 'v.ik_uz'];
    const nuArr = ['v.ik_nux', 'v.ik_nuy', 'v.ik_nuz'];
    const nArr = ['v.ik_nx', 'v.ik_ny', 'v.ik_nz'];
    const w1Arr = ['v.ik_w1x', 'v.ik_w1y', 'v.ik_w1z'];
    const w2Arr = ['v.ik_w2x', 'v.ik_w2y', 'v.ik_w2z'];
    const w3Arr = ['v.ik_e3x', 'v.ik_e3y', 'v.ik_e3z'];
    // 欧拉反解只用到 M10/M11/M12/M02/M22 五个元素 ⇒ 其余四行不生成（每行 ~95 字符）
    for (const [r, c] of [[0, 2], [1, 0], [1, 1], [1, 2], [2, 2]]) {
        st(`v.ik_M${r}${c}=${uArr[r]}*${w1Arr[c]}+${nuArr[r]}*${w2Arr[c]}+${nArr[r]}*${w3Arr[c]};`);
    }
    // ⑨ 欧拉反解（与导出 pR 约定一致）
    st(`v.ik_ec=math.max(${IK_EPS},math.sqrt(v.ik_M10*v.ik_M10+v.ik_M11*v.ik_M11));`);
    st('v.ik_ax=math.atan2(0-v.ik_M12,v.ik_ec);');
    st('v.ik_ay=math.atan2(0-v.ik_M02,v.ik_M22);');
    st('v.ik_az=math.atan2(0-v.ik_M10,v.ik_M11);');
    // 父块旋转同样走输入变量（无父时 v.ik_haspar=0，直接用世界角）
    st('v.ik_jrx=v.ik_haspar?math.min_angle(v.ik_ax-v.ik_parx):v.ik_ax;');
    st('v.ik_jry=v.ik_haspar?math.min_angle(v.ik_ay-v.ik_pary):v.ik_ay;');
    st('v.ik_jrz=v.ik_haspar?math.min_angle(v.ik_az-v.ik_parz):v.ik_az;');
    // ⑩ 末端块自己的 z 关节角直接由本动画写入 ⇒ 后面的 bone_follow（旋转跟随）读到的是本帧值
    st(`v.bone_rotz=v.ik_b${N - 1};`);
    // ── 每块 base 所需的输入（全部是「这个链独有的东西」，求解正文不含任何链特有常量） ──
    const inputs = [];
    const addIn = (name, expr) => inputs.push([name, expr]);
    addIn('v.ik_multi', '1');   // 标记：导入/重建时识别「这条链的末端块由 IK 共用动画驱动」
    addIn('v.ik_tx', tgt(tgtSrc[0]));
    addIn('v.ik_ty', tgt(tgtSrc[1]));
    addIn('v.ik_tz', tgt(tgtSrc[2]));
    addIn('v.ik_rx0', String(rootPos[0]));
    addIn('v.ik_ry0', String(rootPos[1]));
    addIn('v.ik_rz0', String(rootPos[2]));
    for (let k = 0; k < N; k++) {
        addIn(`v.ik_g${k}x`, ikNum(vecs[k][0]));
        addIn(`v.ik_g${k}y`, ikNum(vecs[k][1]));
    }
    addIn('v.ik_wz', ikNum(wz));
    // wz2 / lxy / wx / wy / dmx / db_k 全部由正文从 g_k 推导，不再逐块写进 base（见上方 ★精简）
    // ★★2026-11-14【第二条 IK 路线：保形 / 圆弧 由用户切】
    //   以前 `v.ik_arc` 是**绑定时烘死的常量**（straightBind 判定），一旦绑完就再也改不了：
    //     · 1 = 等角圆弧种子 ⇒ 均匀圆弧（触手/尾巴/藤蔓，稳定、可预测）
    //     · 0 = 保留绑定瞬间手摆的造型 ⇒ 只做最小改动去够目标（有骨感/有个性，但近直链会退化）
    //   现在改成读末端块上的普通变量 v.ikMode（经 t.<tip>_ikMode 全局），
    //   ⇒ 同一条链可以在变量面板里随时切换两种"解法"，而且两种链共用同一份 ik_solve_N 正文
    //     （因为差别只在输入），所以**混绑天然成立**：每条链各自带一个 v.ikMode。
    addIn('v.ik_arc', `t.${safeTip}_ikMode`);
    // ★2026-11-10 造型旋钮：整条链一个数（末端块的 v.ikShape 发布成 t.<tip>_ikShape）。
    //   缺省 '0' ⇒ 正圆；改它就能把弯折往根部/末端偏，做出非圆弧的触手形状。
    addIn('v.ik_shape', (typeof opt.shapeExpr === 'string' && opt.shapeExpr) ? opt.shapeExpr : '0');
    // ★★2026-11-14 S 形多弧旋钮（整条链一个数）：末端块 v.ikWave → t.<tip>_ikWave。
    //   与 v.ikShape 同一条通路（普通变量 + 全局发布）⇒ 面板可改、导出/导入不丢、游戏里也能调。
    addIn('v.ik_wave', (typeof opt.waveExpr === 'string' && opt.waveExpr) ? opt.waveExpr : '0');
    // ★绑定姿态是否共线（链自己的常量）：mode=0 时若为直链，没有「形」可保 ⇒ 退回圆弧种子，
    //   否则 DLS 在共线退化点解不动，只会得到一根直棒（见上方 ④ 的说明）。
    addIn('v.ik_straightb', degenerateBind ? '1' : '0');
    for (let k = 1; k < N; k++) addIn(`v.ik_w${k}`, wExpr[k]);
    addIn('v.ik_haspar', parent ? '1' : '0');
    addIn('v.ik_parx', parent ? `t.${safePar}_xrot` : '0');
    addIn('v.ik_pary', parent ? `t.${safePar}_yrot` : '0');
    addIn('v.ik_parz', parent ? `t.${safePar}_zrot` : '0');
    const publishText = ['ik_jrx', 'ik_jry', 'ik_jrz'].map(k => `t.${safeTip}_${k}=v.${k};`).join(' ')
        + ' ' + Array.from({ length: N - 1 }, (_x, i) => `t.${safeTip}_ik_b${i + 1}=v.ik_b${i + 1};`).join(' ');
    return { multiJoint: true, N, tipLen, vecs, body: S.join(' '), inputs, publishText, aVar: 'v.ik_b' + (N - 1), arcDefault: straightBind ? 1 : 0 };
}
// 多关节末端块的普通变量基线（把上一轮 IK 语句/变量剥掉，否则 loop 二分无法用普通表达式重建）
function ikBaselineOf(tip) {
    let base = '';
    try { base = generateMolangBaseline(tip) || ''; } catch (_) {}
    base = String(base)
        .replace(/\bv\.ik_[A-Za-z0-9_]*=[^;]*;/g, ' ')
        // 末端块自己的活动权重 v.ikW 不能被 program 里的常量覆盖（用户改权重后每帧都被重置成绑定值）
        .replace(/\bv\.ikW=[^;]*;/g, ' ')
        .replace(/\s{2,}/g, ' ').trim();
    return base;
}
// ============ IK 共用求解动画（ik_solve_<段数>） ============
// 同一段数 N 的所有 IK 链共用一模一样的一段求解正文：几何/目标/权重/父旋转全部是
// base 提供的输入变量（见 ikBuildSolveCcd 的 inputs），因此 6 条腿只需 1 个控制器。
const IK_SOLVE_ANIM_PREFIX = 'ik_solve_';
function ikSolveAnimName(n) { return IK_SOLVE_ANIM_PREFIX + String(n); }
function ikSolveAnimation(n, body) {
    const name = ikSolveAnimName(n);
    let a = projectAnimations.find(x => x.name === name);
    if (!a) a = createProjectAnimation(name);
    if (String(a.program || '') !== body) a.program = body;
    return a;
}
// 末端块挂着的求解动画 id：优先元数据，其次按动画名/正文特征扫通道（改名后仍可识别）
function ikSolveAnimIdOf(b) {
    if (!b || !b.scope || !b.scope.channels || b.scope.channels.size === 0) return null;
    if (b._ikSolveAnimId && b.scope.channels.has(b._ikSolveAnimId)) return b._ikSolveAnimId;
    for (const k of b.scope.channels.keys()) {
        const a = (typeof getProjectAnimation === 'function') ? getProjectAnimation(k) : null;
        if (!a) continue;
        const prog = String(a.program || '');
        if (String(a.name || '').indexOf(IK_SOLVE_ANIM_PREFIX) === 0 || prog.includes('v.ik_gw1=')) {
            b._ikSolveAnimId = k;   // 缓存：导入/重载丢了元数据后，第一次扫到就补回来
            return k;
        }
    }
    return null;
}
// 「这个块是否挂着 IK 共用求解层」——热路径用：优先读缓存，没有才扫通道（导入/重载后自愈）
function ikHasSolveLayer(b) {
    if (!b) return false;
    if (b._ikSolveAnimId) return true;
    return !!(typeof ikSolveAnimIdOf === 'function' && ikSolveAnimIdOf(b));
}
function ikDetachSolveLayer(tip) {
    if (!tip || !tip.scope) return;
    const id = ikSolveAnimIdOf(tip);
    if (id && typeof removeAnimationFromBlock === 'function') {
        try { removeAnimationFromBlock(tip, id); } catch (_) { }
    }
    delete tip._ikSolveAnimId;
}
// 末端块挂上共用求解动画；层序必须是 base → ik_solve → bone_follow
// ============ 「动画层自有变量」——base 的基线 / 导出必须跳过它们 ============
// 用户 2026-11-10：「FMBE variables 里我只想看见赋值的语句，其它当成函数放到其他动画中」。
// 动画层的中间量（IK 求解的 v.ik_p1x / v.ik_db0 / v.ik_M02 …、跟随的 v.pR00 / v.p_cx …）在层跑过一次后
// 会被写进 scope.vars（变量是 per-block 的），于是：
//   ① 控制器面板的 base 卡片变成一堵计算式墙；
//   ② 这些量在 base 层每帧又重算一遍（和动画层重复）；
//   ③ 再导出时整段正文被抄进 base 指令 —— 就是「旧格式」的来源。
// ⇒ 凡是「被某个启用中的动画控制器正文赋过值」的非核心变量，一律视为该层私有，base 不再输出。
//   核心变换量（pos/rot/rotate/scale/extend/basepos）仍由 base 拥有，绝不过滤（否则方块会丢姿态）。
const BONE_CORE_VAR_SET = new Set([
    'v.xpos', 'v.ypos', 'v.zpos', 'v.xrot', 'v.yrot', 'v.zrot',
    'v.rotatex', 'v.rotatey', 'v.rotatez', 'v.scale',
    'v.extend_scale', 'v.extend_xrot', 'v.extend_yrot',
    'v.xbasepos', 'v.ybasepos', 'v.zbasepos'
]);
const _EMPTY_VAR_SET = new Set();
function animLayerOwnedVars(block) {
    const sc = block && block.scope;
    if (!sc || !sc.channels || !sc.channels.size) return _EMPTY_VAR_SET;
    let sig = '';
    sc.channels.forEach((ch, k) => {
        const on = !(ch && ch.enabled === false);
        let len = 0;
        try { len = on ? String(getAnimationProgram(k) || '').length : 0; } catch (_) { len = 0; }
        sig += k + (on ? '1' : '0') + len + '|';
    });
    const c = block._layerOwnedCache;
    if (c && c.sig === sig && c.set) return c.set;
    const out = new Set();
    sc.channels.forEach((ch, k) => {
        if (ch && ch.enabled === false) return;
        let prog = '';
        try { prog = String(getAnimationProgram(k) || ''); } catch (_) { prog = ''; }
        if (!prog) return;
        const re = /\bv\.([A-Za-z0-9_]+)\s*=/g;
        let m;
        while ((m = re.exec(prog)) !== null) {
            const full = 'v.' + m[1];
            if (!BONE_CORE_VAR_SET.has(full)) out.add(full);
        }
    });
    block._layerOwnedCache = { sig, set: out };
    return out;
}

// 背景（用户 2026-11-10）：「FMBE variables 里我只想看见赋值的语句，其它当成函数放到其他动画中」。
//   2026-11-07 起求解数学本来就该住在共用动画 ik_solve_<N> 里，base 只留输入 + 发布；
//   但【导入旧格式工程】会把整段正文当成 base 的普通变量搬回来（v.ik_p1x / v.ik_db0 / v.ik_M02 …），
//   于是动画控制器里 base 变成一堵计算式墙，而且这些变量每帧还会在 base 层跑一遍（重复计算）。
//   这里做一次**无损迁移**：按变量插入顺序把正文拼回去 → 挂成共用求解动画 → 把正文变量从 scope 删掉
//   （只留输入；jrx/jry/jrz/ik_b* 由 ikAttachSolveLayer 补占位）。幂等：已经有求解层的块直接跳过。
const IK_SOLVE_INPUT_NAME = /^v\.ik_(multi|tx|ty|tz|rx0|ry0|rz0|wz|arc|shape|haspar|parx|pary|parz|init|w\d+|g\d+[xy])$/;
function ikInlineSolveN(sc) {
    let n = 0;
    sc.vars.forEach((_d, k) => {
        const m = String(k).match(/^v\.ik_g(\d+)y$/);
        if (m) n = Math.max(n, Number(m[1]) + 1);
    });
    return n;
}
function ikExtractInlineSolve(tip) {
    const sc = tip && tip.scope;
    if (!sc || !sc.vars || !sc.vars.has('v.ik_multi')) return false;
    const prog = String(sc.program || '');
    const hasLayer = (typeof ikHasSolveLayer === 'function') && ikHasSolveLayer(tip);
    // ── 情形 A：已经有求解层，但 base 的 program 里还抄着整段求解正文 ──
    //   典型：导入旧格式工程后，末端块是 molangMode，program = 正文 + 发布；
    //   求解其实已经由 ik_solve_<N> 层算了一遍 ⇒ base 这份是**重复计算**，还霸占控制器面板。
    //   直接用「过滤后的基线」覆盖 program（generateMolangBaseline 已跳过动画层自有变量），
    //   保留 molangMode 与 t.* 发布，行为不变、面板只剩赋值语句。
    if (hasLayer) {
        if (!/v\.ik_p1x\s*=/.test(prog)) return false;
        if (sc.molangEditedByUser) return false;          // 用户手写过程序 ⇒ 尊重，不动
        let base = '';
        try { base = generateMolangBaseline(tip) || ''; } catch (_) { return false; }
        if (!base.trim()) return false;
        sc.program = base;
        try { tip.refresh(); } catch (_) { }
        return true;
    }
    // ── 情形 B：没有求解层，正文只以变量形式挂在 base 上 ⇒ 搬进共用动画 ──
    if (!sc.vars.has('v.ik_p1x')) return false;          // 没有正文特征量 ⇒ 本来就是干净的
    const N = ikInlineSolveN(sc);
    if (N < 3) return false;
    const body = [], dead = [], inputs = [];
    sc.vars.forEach((d, k) => {
        if (String(k).indexOf('v.ik_') !== 0) return;
        if (IK_SOLVE_INPUT_NAME.test(k)) { inputs.push([k, String(d && d.expr)]); return; }
        const ex = String(d && d.expr);
        if (!ex) return;
        body.push(`${k}=${ex};`);
        dead.push(k);
    });
    if (body.length < 8) return false;                    // 太短 ⇒ 不是整段正文，别乱动
    const text = body.join(' ');
    try { sc.program = ''; sc.molangMode = false; } catch (_) { }
    dead.forEach(k => { try { sc.deleteVar(k); } catch (_) { } });
    try { ikAttachSolveLayer(tip, { N, body: text }); } catch (_) { return false; }
    // 发布清单：老工程可能没存 _ikPublish（内存元数据），这里补齐，保证「再导出」不丢 t.<tip>_*
    const safeTip = boneSafeId(tip.id);
    const pubNames = ['ik_jrx', 'ik_jry', 'ik_jrz'].concat(Array.from({ length: N - 1 }, (_x, i) => `ik_b${i + 1}`));
    if (!tip._ikPublish) tip._ikPublish = pubNames.map(k => `t.${safeTip}_${k}=v.${k};`).join(' ');
    if (!Array.isArray(tip._ikPubList) || !tip._ikPubList.length) tip._ikPubList = pubNames.map(k => [`${safeTip}_${k}`, `v.${k}`]);
    tip._ikVars = inputs;                                 // base 只导出输入
    tip._ikMulti = true;
    try { tip.refresh(); } catch (_) { }
    return true;
}
// 末端块挂上共用求解动画；层序必须是 base → ik_solve → bone_follow
function ikAttachSolveLayer(tip, sol) {
    const sc = tip.scope;
    // 旧「语句版」程序（IK 自己生成的）→ 清掉，求解改由共用动画执行
    const prog = String(sc.program || '');
    // ★2026-11-12 只有「旧语句版求解正文」才需要清掉（正文会被搬到共用动画 ik_solve_<N>）。
    //   注意别用 `v.ik_multi=`/`v.ik_b` 当判据：现在 molang 模式是「往末尾追加权威赋值」，
    //   追加段里本来就有 v.ik_multi=1 ⇒ 用旧判据会把用户的程序整个清掉。
    if (sc.molangMode && prog.indexOf('v.ik_p1x') >= 0) {
        sc.program = '';
        sc.molangMode = false;
    }
    const anim = ikSolveAnimation(sol.N, sol.body);
    // 求解动画会写这些输出量。运行器只在【赋值】时自动建变量，读取未定义变量会抛错；
    // base（先于动画层执行）与发布语句都可能先读它们 ⇒ 先补上占位变量。
    const outs = ['v.ik_jrx', 'v.ik_jry', 'v.ik_jrz'];
    for (let i = 1; i <= sol.N - 1; i++) outs.push('v.ik_b' + i);
    outs.forEach(n => { if (!sc.vars.has(n)) sc.addVar(n, '0', -360, 360, 0.01); });
    if (typeof applyAnimationToBlock === 'function') applyAnimationToBlock(tip, anim.id);
    if (Array.isArray(sc.stack)) {
        sc.stack = sc.stack.filter(k => k !== anim.id);
        const bi = sc.stack.indexOf('__base__');
        sc.stack.splice(bi >= 0 ? bi + 1 : 0, 0, anim.id);
        // 跟随层必须在求解层之后（否则读到上一帧的 bone_rotz）
        const fId = (typeof boneFollowChannelIdOf === 'function') ? boneFollowChannelIdOf(tip) : null;
        if (fId) {
            sc.stack = sc.stack.filter(k => k !== fId);
            sc.stack.push(fId);
        }
    }
    tip._ikSolveAnimId = anim.id;
    try { sc.recompute(); } catch (_) { }
}
// 清理一条 IK 链的全部痕迹：v.ik_* 求解量 / 已发布全局 / 元数据（不动骨骼绑定本身）
function ikClearChain(list) {
    (list || []).forEach(b => {
        if (!b || !b.scope) return;
        // 共用求解动画先摘掉（否则动画还会继续按已删的 v.ik_* 求值）
        try { ikDetachSolveLayer(b); } catch (_) { }
        delete b._ikSolveAnimId;
        const dead = [];
        b.scope.vars.forEach((_d, n) => { if (n.indexOf('v.ik_') === 0) dead.push(n); });
        dead.forEach(n => b.scope.deleteVar(n));
        if (Array.isArray(b._ikChain) && b._ikChain.length) {
            const s = boneSafeId(b._ikChain[b._ikChain.length - 1]);
            const names = ['ik_jrx', 'ik_jry', 'ik_jrz', 'ik_be'];
            for (let i = 1; i < b._ikChain.length; i++) names.push('ik_b' + i);
            names.forEach(k => {
                if (globalVars.has(`${s}_${k}`)) globalVars.delete(`${s}_${k}`);
            });
        }
        const wasMulti = !!b._ikMulti;
        // 关节活动权重全局（v.ikW 的发布）随链一起清掉；v.ikW 本身保留（用户设置不丢）
        const ikwKey = `${boneSafeId(b.id)}_ikW`;
        if (globalVars.has(ikwKey)) globalVars.delete(ikwKey);
        // 造型旋钮的全局（t.<tip>_ikShape）也随链一起清掉；v.ikShape 本身保留（用户设置不丢）
        const ikShapeKey = `${boneSafeId(b.id)}_ikShape`;
        if (globalVars.has(ikShapeKey)) globalVars.delete(ikShapeKey);
        // 路线开关的全局（t.<tip>_ikMode）同理
        const ikModeKey = `${boneSafeId(b.id)}_ikMode`;
        if (globalVars.has(ikModeKey)) globalVars.delete(ikModeKey);
        // S 形多弧旋钮的全局（t.<tip>_ikWave）同理；v.ikWave 本身保留（用户设置不丢）
        const ikWaveKey = `${boneSafeId(b.id)}_ikWave`;
        if (globalVars.has(ikWaveKey)) globalVars.delete(ikWaveKey);
        delete b._ikRole; delete b._ikChain; delete b._ikVars; delete b._ikPublish; delete b._ikAnchorId; delete b._ikPubList;
        delete b._ikMulti;
        // 多关节末端块是 molang 接管态：v.ik_* 已删，必须按剩余变量重建 program，
        // 否则 loop 二分语句留在程序里会继续重建 v.ik_*（下一次重建的基线会被污染）
        if (wasMulti && b.scope.molangMode) {
            try { b.scope.program = ikBaselineOf(b); } catch (_) { }
        }
    });
}
function ikSetJoint(b, n, e) {
    if (b.scope.vars.has('v.' + n)) b.scope.setVarExpr('v.' + n, e);
    else b.scope.addVar('v.' + n, e, -180, 180, 1);
}
// ★2026-11-07 用户反馈「明明点了 IK 逆骨骼，末端却没有 v.ik_* 变量动画、模型还缩到一起」：
//   导入的骨骼 base 命令带 'baseprog:1'（见 04-import-export/04），整块被存成 molang 程序模式。
//   IK 的输入/输出都是【普通变量表达式】：program 模式下这些表达式既不会逐帧求值，
//   导出也只写程序正文 ⇒ 求解量凭空消失、export 里连 v.ik_multi 都没有。
//   这里复用「转回普通方块」的无损路径（在临时作用域跑一遍程序，把右值源码写回变量表达式），
//   把链上各块释放回变量模式。含条件分支 / q. 查询 / 循环等动态语句的块不能转，保持原样。
function ikReleaseProgramBlock(b) {
    if (!b || !b.scope || !b.scope.molangMode) return true;
    const sc = b.scope;
    let prog = String(sc.program || '');
    if (!prog.trim()) { sc.molangMode = false; return true; }
    // ★★★2026-11-11 用户要求：「干嘛不允许 molang 编辑模式绑」
    //   这条释放路径的唯一正当用途是**把整段求解正文抽出来**（搬到共用动画 ik_solve_<N>）。
    //   程序里没有正文（只是变量基线 / 骨骼跟随输入）⇒ 一律保留 molangMode，
    //   改由 `ikPatchChainProgram()` 把本轮的权威赋值追加到程序末尾（末尾赋值生效，用户程序不被清）。
    if (prog.indexOf('v.ik_p1x') < 0) return false;
    // 程序里由「父块广播」自动追加的 `t.<id>_<字段>=v.<var>;` 只是发布语句（导入时同名全局已按
    // 「源变量 + sourceBlockId」建成惰性表达式），不是可执行的 v. 赋值 ⇒ 先摘掉再判可转换性。
    prog = prog.replace(/\bt\.[A-Za-z0-9_]+_[A-Za-z0-9_]+\s*=[^;]*;/g, ' ').replace(/\s{2,}/g, ' ').trim();
    // ★★2026-11-10 【重绑导入态链没反应】导入的 base 开头有一段链式命令方块专用的一次性守卫：
    //     `v.fmbe_init=(v.fmbe_init??0);v.fmbe_init==0?(t.x=0;…);v.fmbe_init=1;`
    //   它里面的 `?(` 会被 molangProgramConvertible 判成「条件分支」⇒ 整块拒绝转回变量模式 ⇒
    //   重绑后 base 仍按 program 执行、新写入的 v.ik_* 输入表达式根本不参与求值 ⇒ 求解层读到未定义输入
    //   ⇒ 关节角恒 0（用户视角：「点了 IK 逆骨骼，什么都没变」）。这段守卫不属于方块变量，先摘掉。
    prog = prog
        .replace(/v\.fmbe_init==0\?\([^)]*\)\s*;/g, ' ')
        .replace(/v\.fmbe_init=[^;]*;/g, ' ')
        .replace(/\s{2,}/g, ' ').trim();
    if (!prog) { sc.molangMode = false; sc.program = ''; return true; }
    if (typeof molangProgramConvertible !== 'function' || typeof runBlockProgram !== 'function') return false;
    if (!molangProgramConvertible(prog)) return false;
    // ★★2026-11-10 兜底（导入态链重绑「点了没反应」第二根因）：
    //   程序是**纯赋值清单**（没有 ? / loop / return / q. 这类动态语句）时，不必真的再跑一遍：
    //   导入侧早就把同一条 `v.x=…;` 按 assignments 写进 scope.vars 了（右值保留原文，含 `t.px` 这类表达式）。
    //   真跑这段反而会因为 `v.ik_tx=t.px`（t.* 在临时作用域里取不到）抛错 ⇒ 整块被判「不可转换」，
    //   于是末端块留在 molangMode：新写入的 v.ik_* 输入不参与求值 ⇒ 求解层读到未定义输入 ⇒ 关节角恒 0。
    const pureAssign = !/[?]|loop\s*\(|\breturn\b|\bq\./.test(prog);
    if (pureAssign) {
        sc.molangMode = false;
        sc.program = '';
        sc.molangEditedByUser = false;
        delete b._boneFollowSeg;
        try { ensureCoreVars(sc); } catch (_) { }
        try { b.refresh(); } catch (_) { }
        return true;
    }
    const tmp = { vars: new Map(sc.vars), _assigned: new Set(), blockId: sc.blockId, molangMode: true, program: prog };
    try { runBlockProgram(prog, tmp); } catch (_) { return false; }
    sc.vars.clear();
    for (const [k, d] of tmp.vars) sc.vars.set(k, d);
    sc.molangMode = false;
    sc.program = '';
    sc.molangEditedByUser = false;
    delete b._boneFollowSeg;
    try { ensureCoreVars(sc); } catch (_) {}
    try { b.refresh(); } catch (_) {}
    return true;
}
// ★★★2026-11-11【molang 编辑模式也能绑 IK】不去清用户的程序，而是把「本轮算出的权威赋值」
//   追加到程序末尾（Molang 末尾赋值生效）——FK 子块一直就是这么做的（见 bonePatchBoneFollowInputs）。
//   这样 molangMode 下：用户自己的程序保住了，parent_*/basepos_bone/bone_rot*/v.ik_* 也真正参与求值，
//   而且程序里那串**旧值**（例如还是 6 节时写的 v.ik_ty=5.961）会被末尾的新值覆盖。
//   段首打 `v.ik_patch=1;` 作标记：重绑时从标记处截断，避免越绑越长（该变量没有任何地方读，纯哨兵）。
const IK_CHAIN_PATCH_VARS = [
    'parent_xrot', 'parent_yrot', 'parent_zrot', 'parent_px', 'parent_py', 'parent_pz',
    'xbasepos_bone', 'ybasepos_bone', 'zbasepos_bone', 'bone_rotx', 'bone_roty', 'bone_rotz',
    'rotatex', 'rotatey', 'rotatez', 'xbasepos', 'ybasepos', 'zbasepos'
];
function ikPatchChainProgram(b) {
    const sc = b && b.scope;
    if (!sc || !sc.molangMode) return false;
    let prog = String(sc.program || '');
    const mark = 'v.ik_patch=1;';
    const at = prog.indexOf(mark);
    if (at >= 0) prog = prog.slice(0, at);                 // 摘掉上一轮追加的段（不叠加）
    // ★2026-11-11 用户：「可调的变量写在上面」= **molang 编辑器正文里**也要置顶。
    //   ① 先把正文前半段里遗留的「旋钮赋值」删掉（例如旧节数时写的 v.ik_ty=5.961），
    //      保证全文只有一个地方能改它们；② 追加段内部按「旋钮 → 骨骼跟随输入 → 几何量」排列。
    const IK_KNOB_NAMES = ['v.ik_tx', 'v.ik_ty', 'v.ik_tz', 'v.ikMode', 'v.ik_shape', 'v.ik_wave'];
    IK_KNOB_NAMES.forEach(n => {
        const re = new RegExp('\\s*' + n.replace('.', '\\.') + '\\s*=[^;]*;', 'g');
        prog = prog.replace(re, ' ');
    });
    // ②-b 把正文前半段里「求解层的派生量」赋值也清掉（旧补丁曾把 v.ik_lxy / v.ik_bs / v.ik_str /
    //   v.ik_M02 / v.ik_jr* 这些**中间结果**当输入抄进 base）。留着它们 = base 先跑一遍半成品求解，
    //   求解层再拿被污染的变量 ⇒ 整链伸直成棍子。
    prog = prog.replace(/\s*v\.ik_(?:wz2|lxy|db\d+|wx|wy|dx|dy|dz|D|ux|uy|uz|hx|hz|hok|hl|hrx|hrz|dg|n0[xyz]|nl|n[xyz]|nu[xyz]|rr|sgn|loa|hib|bs|gw\d+|shp|wav|sd\d+|sh\d+|b\d+|p\d+[xy]|wl2|gg[xy]|lam|e[xy2]|m\d+|det|dinv|w[012]|rx|ry|dj|str|W[xy]|Wl|w[123][xyz]|dgw|e3[xyz]|w2[xyz]|M\d+|ec|a[xyz]|jr[xyz])\s*=\s*[^;]*;/g, ' ');
    const parts = [mark];
    // ① 旋钮（第一屏就能看到、且只有这一处）
    IK_KNOB_NAMES.forEach(n => {
        const d = sc.vars.get(n);
        if (d && d.expr != null && String(d.expr).trim() !== '') parts.push(`${n}=${d.expr};`);
    });
    // ② 骨骼跟随 / 关节角输入
    IK_CHAIN_PATCH_VARS.forEach(n => {
        const d = sc.vars.get('v.' + n);
        if (d && d.expr != null && String(d.expr).trim() !== '') parts.push(`v.${n}=${d.expr};`);
    });
    // ③ 其余 IK 输入（几何量 v.ik_g* / rx0 / wz / arc / w* / haspar / par* …），
    //    排除由求解动画产出的输出量（v.ik_jrx/jry/jrz、v.ik_b*）。
    // ★★只允许「输入类」`v.ik_*` 进程序。**派生量一律不写**：
    //   求解层跑过一次后，`v.ik_lxy / v.ik_bs / v.ik_str / v.ik_p* / v.ik_M* / v.ik_jr*` 这些中间结果
    //   会被 materialize 进 scope.vars，旧实现把它们当输入抄进 base ⇒ base 先跑一遍「半成品求解」，
    //   只要顺序/变量名有一处对不上，求解层拿到的就是 0 ⇒ 整链伸直成一根棍子（用户 2026-11-13 报）。
    // ★2026-11-14：新增 wave（S 形波形）/ straightb（直链兜底）两个输入，必须一起放行，
    //   否则 molang 编辑模式下这两个变量进不了程序 ⇒ 求解层读到未定义（S 失效 / 直棒）。
    const IK_INPUT_RE = /^v\.ik_(multi|tx|ty|tz|rx0|ry0|rz0|wz|arc|shape|wave|straightb|haspar|parx|pary|parz|w\d+|g\d+[xy])$/;
    sc.vars.forEach((d, k) => {
        if (!IK_INPUT_RE.test(k)) return;
        if (d && d.expr != null && String(d.expr).trim() !== '') parts.push(`${k}=${d.expr};`);
    });
    if (parts.length <= 1) return false;
    b._ikMolangSeg = parts.join(' ');
    sc.program = (prog.replace(/\s+$/, '') + ' ' + b._ikMolangSeg).trim();
    try { b.refresh(); } catch (_) { }
    try { if (typeof syncMolangEditorProgram === 'function') syncMolangEditorProgram(b); } catch (_) { }
    return true;
}
// 强制把一个 molang 接管态的块切回「变量驱动」：跑一遍程序把当前值冻结成变量，再丢掉程序壳。
// 用于 IK 绑定前——molangMode 下写 vars 不参与求值，不切回来绑定等于没绑。
// 会丢掉条件/循环语义（只保当前姿态），所以只在「这条链马上就要被 IK 全面接管」时调用。
function ikForceReleaseProgram(b) {
    const sc = b && b.scope;
    if (!sc || !sc.molangMode) return false;
    const prog = String(sc.program || '');
    if (!prog.trim()) { sc.molangMode = false; return true; }
    try {
        if (typeof runBlockProgram === 'function') {
            const tmp = { vars: new Map(sc.vars), _assigned: new Set(), blockId: sc.blockId, molangMode: true, program: prog };
            runBlockProgram(prog, tmp);
            sc.vars.clear();
            for (const [k, d] of tmp.vars) sc.vars.set(k, d);
        }
    } catch (_) { /* 跑不动（读未定义 t.* 等）就只清壳，值沿用 vars 里现有的 */ }
    sc.program = '';
    sc.molangMode = false;
    sc.molangEditedByUser = false;
    try { ensureCoreVars(sc); } catch (_) { }
    try { b.refresh(); } catch (_) { }
    return true;
}
// 静止姿态自愈：把「看起来就是一条等长段链」的歪偏移拉直成 (0, 段长, 0)。
// 只处理逐节等长 extend 段、偏移长度≈段长、各段方向离散度 <70° 的链 —— 这种形状几乎不可能是有意造型，
// 而是历史绑定漂移（31.6°/58° 折角）。返回 true 表示真的改写了。
function ikNormalizeChainRest(chain) {
    if (!Array.isArray(chain) || chain.length < 3) return false;
    const lens = [], dirs = [];
    for (let i = 1; i < chain.length; i++) {
        const b = chain[i];
        if (!b) return false;
        const bodyLen = ikSegLenOf(b);
        const off = [vnum(b, 'v.xbasepos_bone'), vnum(b, 'v.ybasepos_bone'), vnum(b, 'v.zbasepos_bone')];
        const L = Math.hypot(off[0], off[1], off[2]);
        if (!(bodyLen > 1e-6) || !(L > 1e-6)) return false;                    // 有非 extend 段/无偏移 ⇒ 不动
        if (Math.abs(L - bodyLen) / Math.max(L, bodyLen) > 0.3) return false;   // 偏移和段长差太多 ⇒ 用户另有意图
        lens.push(bodyLen);
        dirs.push([off[0] / L, off[1] / L, off[2] / L]);
    }
    const cos70 = Math.cos(70 * Math.PI / 180);
    for (let i = 0; i < dirs.length; i++) {
        for (let j = i + 1; j < dirs.length; j++) {
            const dot = dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1] + dirs[i][2] * dirs[j][2];
            if (dot < cos70) return false;                                      // 方向差太大 ⇒ 视为有意造型
        }
    }
    if (dirs.every(d => d[1] > 0.9999 && Math.abs(d[0]) < 1e-3 && Math.abs(d[2]) < 1e-3)) return false;  // 已经是直的
    for (let i = 1; i < chain.length; i++) {
        const b = chain[i], L = lens[i - 1];
        const put = (n, v) => {
            if (b.scope.vars.has('v.' + n)) setConstVarValue(b, 'v.' + n, v);
            else b.scope.addVar('v.' + n, ikNum(v), -1000, 1000, 0.01);
        };
        put('xbasepos_bone', 0);
        put('ybasepos_bone', _r4(L));
        put('zbasepos_bone', 0);
    }
    return true;
}
// 整链重建：首个绑定与「追加一节」共用同一条路径（保证结构与变量归属永远一致）//  · 所有求解量 / 唯一输入 v.ik_tx/ty/tz 全部写在【末端块】上；
//  · 末端块发布 t.<末端>_ik_jrx/jry/jrz/be，各关节读全局；
//  · 关节三轴全部由 IK 接管：根 = (jrx,jry,jrz)，肘 = (0,0,be)，其余中间节 = (0,0,0)。
// ★2026-11-13：IK 绑定时是否自动创建 point 目标点（默认开；设置面板可关，并记忆到 localStorage）。
let ikBindWithPoint = (localStorage.getItem('ui_ik_bind_point') !== '0'); // '0'=关，其余（含未设置）=开

function ikRebuildChain(chain, anchor, opts) {
    chain = (chain || []).filter(Boolean);
    if (chain.length < 2) { showToast('IK 逆骨骼：至少需要 2 个方块（链首关节 + 末端）'); return; }
    if (anchor && chain.some(b => b.id === anchor.id)) { showToast('IK 逆骨骼：父级不能同时是链上的方块'); return; }
    const o = opts || {};
    const silent = !!o.silent;
    // 静止姿态自愈：历史上「绑歪」的链（偏移被写成 (0.85,0.52) 这种 31.6° 折角）
    //   以前只能删掉重摆，因为重绑会继续沿用坏偏移。这里在快照之前先把「看着就是一条段链」的链拉直：
    //   条件是每节都是等长 extend 段、偏移长度与段长接近（±30%）、各段方向离散度 < 70°。
    try { ikNormalizeChainRest(chain); } catch (_) { }
    const N = chain.length;
    const tip = chain[N - 1];
    // ★先记下「上一轮是否多关节」：ikClearChain 会清掉 _ikMulti，但重建时仍应继续走多关节
    const wasMultiTip = !!tip._ikMulti;
    // 目标表达式（预设用：直接读某个方块的世界 pos 全局）；追加重建时沿用末端块上记录的旧目标
    let targetExpr = (o.targetExpr && o.targetExpr.length === 3) ? o.targetExpr : (tip._ikTarget || null);
    // ① 快照：锚点枢轴/旋转 + 链上各节世界枢轴（必须在任何改写之前）
    try { if (anchor) anchor.refresh(); } catch (_) {}
    chain.forEach(b => { try { b.refresh(); } catch (_) {} });
    const rotSrc = anchor || chain[0];
    const pPar = ikPivotOf(rotSrc);
    const Rpar = ikRotMat3(vnum(rotSrc, 'v.rotatex'), vnum(rotSrc, 'v.rotatey'), vnum(rotSrc, 'v.rotatez'));
    const pivLive = chain.map(ikPivotOf);
    // ★2026-11-07 重绑修正（用户反馈「绑定后关节还是不连接、末端脱节」）：
    //   旧 IK 程序正在驱动这条链时，refresh() 得到的枢轴是【已经弯折】后的位置，
    //   按它反解偏移 ⇒ 弯折量被烘焙进 xbasepos_bone 常量；随后关节角又归零（步骤④），
    //   于是每节都错开一个弯折角，链看起来「没有链接」。
    //   静止姿态 = 根枢轴 + Rpar·各节【已存骨偏移】（与当前关节角无关，重绑对偏移幂等）；
    //   新追加的节没有 _ikChain，用它自己的真实枢轴。
    const piv = pivLive.slice();
    // ★★★2026-11-11【「从末端一节点紫色加号」逐段追加，偏移越绑越歪】必须先记下**这一轮之前**的父子关系。
    //   ③ 会给链上每节重新 bindBone（改写 _boneParent），而 ② 又把 _ikChain 清掉，
    //   所以到了 ④ 已经无法判断「这一节原本是不是就挂在 chain[i-1] 上」⇒ 只能全部重算，
    //   而重算要经过接缝吸附（依赖 basepos/外观矩阵），每轮都漂一点点（实测 4 次追加累积到 3.2°，
    //   用户那份工程的偏移直接歪成 31.6°）。
    //   记下 oldParents + hadOffset：链接没变、而且本来就有偏移的一节 ⇒ ④ 原样沿用、也不再吸附。
    const oldParents = chain.map(b => (b && b._boneParent) ? b._boneParent : null);
    const hadOffset = chain.map(b => !!b && (Math.abs(vnum(b, 'v.xbasepos_bone')) + Math.abs(vnum(b, 'v.ybasepos_bone')) + Math.abs(vnum(b, 'v.zbasepos_bone'))) > 1e-9);
    // ★★★2026-11-11【圆形 IK 重绑后「炸开」的根因】骨偏移是存在「当轮 rotSrc 的旋转系」里的常量。
    //   一旦这次重建换了根（自由根 → 挂到某个父级、或反向追加把父级接到链首之前），旧偏移还是
    //   **旧根**的旋转系 ⇒ 若直接拿新 Rpar 去还原方向，整条链的静止姿态会被再转一次，
    //   段与段之间就散了（用户实测 3 节圆弧重绑后变成三块悬空的碎片）。
    //   正解：还原「已存偏移」时一律用**旧根的 R**，把它转回世界方向；④ 会再按新的 rotSrc 重新表达成新偏移。
    const _oldChainIds = (Array.isArray(tip._ikChain) && tip._ikChain.length) ? tip._ikChain.slice() : null;
    // ★导入来的链没有 _ikChain 元数据（内存态、不随存档走）⇒ 旧帧要从末端块的 `v.ik_rx0=t.<旧根>_px`
    //   里读回来。否则「圆形链重绑」会按新根的旋转系去还原旧偏移，整条链被再转一次 ⇒ 段段分离。
    let _oldFrameId = tip._ikFrameId || (_oldChainIds ? _oldChainIds[0] : null);
    if (!_oldFrameId) {
        const rx0 = tip.scope.vars.get('v.ik_rx0');
        const m = rx0 && String(rx0.expr || '').match(/\bt\.([A-Za-z0-9_]+)_px\b/);
        if (m) _oldFrameId = m[1];
    }
    const _oldFrame = _oldFrameId ? getBlockById(_oldFrameId) : null;
    const _frameChanged = !!(_oldFrame && _oldFrame.id !== rotSrc.id);
    const _Rold = _oldFrame
        ? ikRotMat3(vnum(_oldFrame, 'v.rotatex'), vnum(_oldFrame, 'v.rotatey'), vnum(_oldFrame, 'v.rotatez'))
        : null;
    const _Ruse = (_frameChanged && _Rold) ? _Rold : Rpar;
    // ★「这一节已经有骨偏移」不能只看 _ikChain：导入来的链没有该元数据，但 xbasepos_bone 是有的。
    //   判据 = 有 _ikChain 或 偏移非零。否则导入链重绑会被当成「新节」用活体枢轴当静止位置 ⇒ 把弯折烘进偏移。
    const _hasStoredOffset = (bb) => {
        if (!bb) return false;
        if (Array.isArray(bb._ikChain) && bb._ikChain.length) return true;
        return Math.hypot(vnum(bb, 'v.xbasepos_bone'), vnum(bb, 'v.ybasepos_bone'), vnum(bb, 'v.zbasepos_bone')) > 1e-6;
    };
    for (let i = 1; i < N; i++) {
        const b = chain[i];
        if (!_hasStoredOffset(b)) {
            // ★★2026-11-10【绑到第 7 节「前面的方块突然散了」· 追加节的静止位置】
            //   已绑过的前几节，静止位置是用**已存偏移**一路推出来的（= 原来的直线姿态）；
            //   而新追加的那一节，用户摆它的时候链已经弯了 —— 它的活体枢轴和「静止链尾」根本不在一个坐标里。
            //   旧实现直接拿它的活体枢轴当静止位置 ⇒ 最后一节的偏移 = 「静止链尾 → 摆在原位的那个点」，
            //   实测段长 0.78 变成 1.9~2.4 ⇒ 视觉上整条链断开，而且越往上绑差得越多（用户报的第 7 节）。
            //   正解：追加节按「上一节的静止方向 × 本节段长」接着长出去（段长取自身 extend 尺寸，取不到才退回活体差）。
            const prevHasRest = i >= 1 && _hasStoredOffset(chain[i - 1]);
            if (!prevHasRest) { piv[i] = pivLive[i].slice(); continue; }
            let dir = null;
            if (i >= 2) {
                const A = piv[i - 2], B = piv[i - 1];
                const L0 = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
                if (L0 > 1e-6) dir = [(B[0] - A[0]) / L0, (B[1] - A[1]) / L0, (B[2] - A[2]) / L0];
            }
            if (!dir) dir = ikRotMul(Rpar, [0, 1, 0]);
            const liveLen = Math.hypot(pivLive[i][0] - pivLive[i - 1][0], pivLive[i][1] - pivLive[i - 1][1], pivLive[i][2] - pivLive[i - 1][2]);
            // 段长取「用户实际摆出来的距离」；只有当活体差离谱（>25% 偏差，说明链当时是弯的、
            // 活体位置不可信）才退回块体长度 ikSegLenOf。
            const bodyLen = ikSegLenOf(b);
            const segLen = (() => {
                if (!(liveLen > 1e-6)) return bodyLen > 1e-6 ? bodyLen : 0;
                if (!(bodyLen > 1e-6)) return liveLen;
                return (Math.abs(liveLen - bodyLen) / Math.max(liveLen, bodyLen) <= 0.25) ? liveLen : bodyLen;
            })();
            piv[i] = [
                piv[i - 1][0] + dir[0] * segLen,
                piv[i - 1][1] + dir[1] * segLen,
                piv[i - 1][2] + dir[2] * segLen
            ];
            continue;
        }
        // ★★【2026-11-08 修复 · 用户报「从末端往上一段段用紫色加号绑 IK，绑完整个模型缩到一起」】
        //   只有「这一节原本就是 chain[i-1] 的子块」才能用已存骨偏移重建静止姿态。
        //   反向追加（`ikBindChain` 分支 C：把父级接到链首之前）时，旧链首这一轮之前是**自由根**，
        //   根本没写过骨偏移（`xbasepos_bone` 恒 0）。若仍按 `_ikChain` 重建，就把它的真实枢轴
        //   当成「父枢轴 + 0」⇒ 静止位置塌到父枢轴上，步骤④ 反解出的偏移也跟着变 0。
        //   每往上绑一段就塌掉一节，最终整条链只剩末节一个真实偏移（用户导出里就是 Cube1..Cube9
        //   全 0、只剩 Cube10 的 0.8009），目标 v.ik_ty 也只剩 0.8009 ⇒ 11 节全挤在一点上「缩成一团」。
        if (!(b._boneParent && b._boneParent === chain[i - 1].id)) continue;
        const u = ikRotMul(_Ruse, [vnum(b, 'v.xbasepos_bone'), vnum(b, 'v.ybasepos_bone'), vnum(b, 'v.zbasepos_bone')]);
        piv[i] = [piv[i - 1][0] + u[0], piv[i - 1][1] + u[1], piv[i - 1][2] + u[2]];
    }
    // ② 清旧 IK 痕迹（必须在快照之后：先清会把链塌成直线，快照就不准了）
    // ★先释放链上各块的 molang 程序（'baseprog:1' 导入态）⇒ IK 的普通变量才会被逐帧求值/导出。
    chain.forEach(b => { try { ikReleaseProgramBlock(b); } catch (_) { } });
    const olds = [];
    chain.forEach(b => {
        if (Array.isArray(b._ikChain)) b._ikChain.forEach(id => { if (olds.indexOf(id) < 0) olds.push(id); });
    });
    if (olds.length) ikClearChain(olds.map(getBlockById).filter(Boolean));
    ikClearChain(chain);
    // ★★2026-11-10 释放必须**再跑一次**：第一遍对「末端块里还装着上一轮整段求解正文」的情况
    //   （7900+ 字符，含 loop/?，判不可转换）必然失败；而 ikClearChain 会把它的 program 换成
    //   `ikBaselineOf()` 出来的纯赋值基线 —— 那才是可无损转成变量表的东西。
    //   不补这一遍，末端块会一直留在 molangMode：新写入的 v.ik_* 输入不参与求值 ⇒ 求解层读到未定义
    //   输入 ⇒ 关节角恒 0（用户视角：「重新绑了 IK，模型一动不动」）。
    chain.forEach(b => { try { ikReleaseProgramBlock(b); } catch (_) { } });
    // ★★2026-11-11【用户要求：molang 编辑模式必须能绑】这里**不再**强制把块转回变量模式。
    //   molangMode 下写 vars 不参与求值，解决方式是 `ikPatchChainProgram()`：在重建收尾把本轮的
    //   权威赋值**追加到程序末尾**（末尾赋值生效），既保住用户程序，又让 parent_*/basepos_bone/
    //   bone_rot*/v.ik_* 真正生效，还能覆盖程序里遗留的旧值（例如旧节数时的 v.ik_ty）。
    //   只有「程序里装着整段求解正文」时才需要把它抽出来（见 ikReleaseProgramBlock 的开头判断）。
    // ③ 逐级 pivot 绑定（有锚点时链首绑到锚点；自由根保持原样）
    let prev = anchor;
    chain.forEach((b, i) => {
        if (!(i === 0 && !anchor)) bindBone(b, prev, true, false, false, true, 'pivot');
        prev = b;
    });
    // ④a 接缝吸附（2026-11-07，用户反馈「带 rotate/extend 姿态绑骨骼，关节没有完全贴合」）：
    //   IK/FK 的每节方块是绕「自己的枢轴」转的。方块默认枢轴在几何中心（basepos=0），而节与节的接缝
    //   在方块的近端面上 ⇒ 弯折时是绕中心转，相邻两节只在角上接触、接缝张开成缝。
    //   这里把每一节的枢轴搬到它「朝向上一节的那一面」（接缝点 J），并用 basepos 反向补偿使外观零位移；
    //   之后骨偏移 = J_i − J_{i−1}（= 上一节的体长），弯折时子节绕上一节的几何末端转 ⇒ 接缝始终贴合。
    //   只对「extend 段」口径（extend_xrot=-90 且补偿后 ybasepos>0.45）生效：其它方块保持原枢轴，
    //   因为 IK 求解的 tipExtend / 体轴朝向都建立在段约定上，乱搬枢轴会让求解失准。
    // ★几何也取静止姿态：刚体整体平移 = 枢轴平移量，把 live 中心搬到静止枢轴上（避免在弯折姿态上算接缝）
    const centers = chain.map((b, i) => {
        try {
            const C = blockWorldPos(b);
            const dx = piv[i][0] - pivLive[i][0], dy = piv[i][1] - pivLive[i][1], dz = piv[i][2] - pivLive[i][2];
            if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-9) return C;
            return C.clone().add(new THREE.Vector3(dx, dy, dz));
        } catch (_) { return null; }
    });
    // ★★★2026-11-11【「一开始都是竖着的，绑着绑着就弯了」的真正根因】
    //   求解器瞄准的是「末节的**视觉远端**」——`vecs` 最后一项恒为 (0, tipExtend)，tipExtend = 末节体长（≈0.961），
    //   而这里的默认目标却写成了末节**枢轴**（piv[N-1]）⇒ 求解器为了让「远端」落到枢轴上，
    //   必须把整条链缩短一整节 ⇒ 每绑一次就多弯一点，逐段追加几次就卷起来/看着炸开。
    //   正解：默认目标 = 末节枢轴 + 末段方向 × tipExtend（= 视觉远端），这样「竖着绑」就应该一直竖着。
    let _tipExt = (typeof o.tipExtend === 'number') ? o.tipExtend : ikSegLenOf(tip);
    // ★2026-11-14【v.ik_g{末}=0 的真因】末端块**自身长度算不出来**时（绑定那一瞬间它还不是标准 extend 段，
    //   例如 scale/extend_scale 还没设好），`tipLen` 会取 0 ⇒ 求解器把「末节远端」当成 0 长：
    //   可达半径少一整节、末端还会比别人多伸出一截。这里用「上一段的长度」兜底。
    if (!(_tipExt > 1e-6) && N >= 2) {
        const _a = piv[N - 2], _b = piv[N - 1];
        const _L = Math.hypot(_b[0] - _a[0], _b[1] - _a[1], _b[2] - _a[2]);
        if (_L > 1e-6) _tipExt = _L;
    }
    let bindTarget = (() => {
        const t = piv[N - 1];
        if (!(N >= 2) || !(_tipExt > 1e-9)) return t.slice();
        const a = piv[N - 2];
        const dx = t[0] - a[0], dy = t[1] - a[1], dz = t[2] - a[2];
        const L = Math.hypot(dx, dy, dz);
        if (!(L > 1e-9)) return t.slice();
        return [t[0] + dx / L * _tipExt, t[1] + dy / L * _tipExt, t[2] + dz / L * _tipExt];
    })();
    // ★★2026-11-13：IK 自动目标点（point）。开关开 + 非 silent + 当前目标不是已有的 point 形式时，
    //   自动建/复用 point 方块（红色、可拖、发布 t.<id>_px/py/pz），让末端读它 —— 绑完 IK 场景里立刻
    //   多一个可拖的目标点，拖它整条链实时跟随（与蜘蛛腿预设同机制）。
    if (ikBindWithPoint && !o.silent) {
        const _isPt = Array.isArray(targetExpr) && targetExpr.length === 3
            && /^t\.[A-Za-z0-9_]+_px$/.test(String(targetExpr[0]));
        if (!_isPt) {
            // uniq 是蜘蛛腿预设里的局部 helper，此处不在作用域；内联一个同逻辑的防重名生成器。
            let pid = 'point', _pk = 2; while (blocks.some(b => b.id === pid)) pid = 'point' + (_pk++);
            const pb = new Block(pid,
                [_r4(bindTarget[0]), _r4(bindTarget[1]), _r4(bindTarget[2]), 0, 0, 0, 0.8, 1, -90, 0, 0, 0, 0],
                null, '#ff4d4f');
            addBlock(pb, false, false);
            const pSafe = boneSafeId(pid);
            ensureIkGlobalVar(`${pSafe}_px`, 'v.xpos', pb.id);
            ensureIkGlobalVar(`${pSafe}_py`, 'v.ypos', pb.id);
            ensureIkGlobalVar(`${pSafe}_pz`, 'v.zpos', pb.id);
            pb._ikVars = [[`t.${pSafe}_px`, 'v.xpos'], [`t.${pSafe}_py`, 'v.ypos'], [`t.${pSafe}_pz`, 'v.zpos']];
            pb._ikPubList = [[`${pSafe}_px`, 'v.xpos'], [`${pSafe}_py`, 'v.ypos'], [`${pSafe}_pz`, 'v.zpos']];
            pb._ikGoalMarker = true;
            pb._ikPoint = true;
            pb.refresh();
            if (typeof bumpDrawRev === 'function') bumpDrawRev('all');
            targetExpr = [`t.${pSafe}_px`, `t.${pSafe}_py`, `t.${pSafe}_pz`];
        }
    }
    const joints = chain.map((b, i) => {
        const C = centers[i];
        if (!C) return null;
        const freeRoot = !anchor && i === 0;
        if (freeRoot) return null;                   // 自由根没有上一节 ⇒ 枢轴是用户手放的髋部，保留
        // ★已稳定的一节（父级没变、本来就有偏移）⇒ 不再做接缝吸附：吸附依赖外观矩阵/basepos，
        //   每轮重算都会漂一点点，逐段追加几次就把静止姿态弄歪了（用户报的「越加越歪」）。
        if (i >= 1 && hadOffset[i] && oldParents[i] === chain[i - 1].id) return null;
        // 角接角链：关节位置由 ikCornerJointOffset 纯几何给出（父块对角顶点），不做接缝吸附
        if (ikCornerJointOffset(chain[i - 1], b, pivLive[i - 1], pivLive[i])) return null;
        const parC = (i === 0)
            ? new THREE.Vector3(pPar[0], pPar[1], pPar[2])
            : centers[i - 1];
        if (!parC) return null;
        const u = parC.clone().sub(C);
        const L = u.length();
        if (L < 1e-9) return null;
        u.multiplyScalar(1 / L);
        const J = C.clone().addScaledVector(u, ikBodySupport(b, [u.x, u.y, u.z]));
        const d = J.clone().sub(new THREE.Vector3(piv[i][0], piv[i][1], piv[i][2]));
        if (d.length() < 1e-6) return null;           // 枢轴本来就在接缝上（预设腿）⇒ 保持原样
        const db = worldToBasepos(b, d.clone().negate());
        const newBy = vnum(b, 'v.ybasepos') + db.y;
        if (!(Math.abs(vnum(b, 'v.extend_xrot') + 90) < 1e-6) || !(newBy > 0.45)) return null;
        // 自身外观旋转（xrot/yrot/zrot）会让体轴偏离局部 +Y，IK 求解的 tipExtend 方向假设不再成立 ⇒ 不吸附
        if (Math.abs(vnum(b, 'v.xrot')) + Math.abs(vnum(b, 'v.yrot')) + Math.abs(vnum(b, 'v.zrot')) > 1e-6) return null;
        if (i === N - 1) {
            // 末节的枢轴搬到近面后，求解必须瞄准「末节的视觉远端」（否则绑定瞬间整链平移一节）
            const uf = C.clone().sub(parC);
            const lf = uf.length();
            if (lf > 1e-9) {
                uf.multiplyScalar(1 / lf);
                const hf = ikBodySupport(b, [uf.x, uf.y, uf.z]);
                bindTarget = C.clone().addScaledVector(uf, hf).toArray();
            }
        }
        return J;
    });
    // ④ 关节归零 + 按「绑前世界枢轴（吸附后的接缝）」重新反解每一节偏移：位置不变，并统一到锚点旋转坐标系
    let prevPos = pPar;
    // 静止姿态末端：链首枢轴不动（锚点链首节的位置由 ③ 保持不变），从它开始累加各段纯几何偏移。
    // ★必须从 pivLive[0] 起算，不能只从第一条 geo 段起算：有锚点时 i=0 走「枢轴差反解」，
    //   若 restTip 从 i=1 才开始，bindTarget 会落回旧的 stale piv[N-1]（上一轮弯折姿态），
    //   求解器随后把链掰到那个错点上 ⇒ 重绑立刻又弯折。
    let restTip = pivLive[0].slice(), geoCount = 0, nonGeo = 0;
    chain.forEach((b, i) => {
        const J = joints[i];
        if (J) {
            // 枢轴 → 接缝，basepos 反向补偿（世界位移 = globalRot·A·basepos，故补偿量 = −A⁻¹Rᵀ·Δ）
            const d = J.clone().sub(new THREE.Vector3(piv[i][0], piv[i][1], piv[i][2]));
            const db = worldToBasepos(b, d.clone().negate());
            [['xbasepos', db.x], ['ybasepos', db.y], ['zbasepos', db.z]].forEach(([n, dv]) => {
                const v = vnum(b, 'v.' + n) + dv;
                if (b.scope.vars.has('v.' + n)) setConstVarValue(b, 'v.' + n, _r4(v));
                else b.scope.addVar('v.' + n, ikNum(v), -1000, 1000, 0.001);
            });
        }
        const posNow = J ? [J.x, J.y, J.z] : piv[i];
        const freeRoot = !anchor && i === 0;
        if (!freeRoot) {
            // ★角接角链：偏移 = 父块朝向子块的对角顶点（纯几何量），与当前姿态/关节角无关
            //   ⇒ 弯着的状态下重绑也不会烘进弯折；「父块对角顶点 = 子块枢轴（最小角）」永久重合
            const geo = ikCornerJointOffset(chain[i - 1], b, pivLive[i - 1], pivLive[i]);
            const d = [posNow[0] - prevPos[0], posNow[1] - prevPos[1], posNow[2] - prevPos[2]];
            const u = geo || ikRotInvMul(Rpar, d);
            // ★★2026-11-10【反复追加时前几节被越拉越长】已经绑过、且父级没变的一节，偏移就是上次算好的常量
            //   ⇒ 直接沿用，不要再用「当前枢轴差」重算一遍。重算会把上一节接缝吸附（J）带来的微小错位
            //   逐次累加进段长（实测 0.783 的段被拉成 0.86/0.89/1.06，越追加越明显）。
            const _already = !geo && i >= 1 && hadOffset[i] && oldParents[i] === chain[i - 1].id;
            if (!_already) {
                [['xbasepos_bone', 0], ['ybasepos_bone', 1], ['zbasepos_bone', 2]].forEach(([n, k]) => {
                    // 骨骼偏移可能是几十个单位（大模型），范围不能沿用默认 ±10
                    if (b.scope.vars.has('v.' + n)) setConstVarValue(b, 'v.' + n, _r4(u[k]));
                    else b.scope.addVar('v.' + n, ikNum(u[k]), -1000, 1000, 0.01);
                });
            }
            ['bone_rotx', 'bone_roty', 'bone_rotz'].forEach(n => ikSetJoint(b, n, '0'));
            if (geo) {
                const g = ikRotMul(Rpar, geo);
                restTip = [restTip[0] + g[0], restTip[1] + g[1], restTip[2] + g[2]];
                geoCount++;
            } else if (i >= 1) nonGeo++;   // i=0（锚点链首）不算几何失败：它的位置本来就保持不变
        }
        b._ikVars = [];
        b._ikPublish = '';
        prevPos = posNow;
        try { b.refresh(); } catch (_) {}
    });
    // 整链角接角：绑定目标取「静止姿态的末端」，否则会把重绑瞬间的弯折姿态当目标保留下来
    if (geoCount > 0 && nonGeo === 0) {
        // restTip 同样是「枢轴」，也要补上末节体长才对得上求解器的视觉远端（否则每次重绑都缩一节）
        const a = (N >= 2) ? piv[N - 2] : null;
        let dir = null;
        if (a) {
            const dx = piv[N - 1][0] - a[0], dy = piv[N - 1][1] - a[1], dz = piv[N - 1][2] - a[2];
            const L = Math.hypot(dx, dy, dz);
            if (L > 1e-9) dir = [dx / L, dy / L, dz / L];
        }
        bindTarget = (dir && _tipExt > 1e-9)
            ? [restTip[0] + dir[0] * _tipExt, restTip[1] + dir[1] * _tipExt, restTip[2] + dir[2] * _tipExt]
            : restTip;
    }
    const tipExtend = _tipExt;
    // ⑤ 求解：变量与目标全部写进末端块。N≥3 ⇒ 走「通用多关节解」。
    // ★★★2026-11-12【用户报「绑 ik 后少了一个动画（没有 ik_solve_N）」】
    //   旧判据 `tipBusyProgram`：末端块是 molang 编辑模式、程序里又没有 `v.ik_multi=` ⇒ 判定「程序被用户占用」，
    //   于是**降级成 2 节解**（那个解不带求解层）⇒ 动画控制器里自然少一个 ik_solve_N。
    //   但现在 molang 模式已经改成「往程序末尾追加权威赋值」（ikPatchChainProgram），根本不会覆盖用户程序，
    //   这个降级判据不再成立 ⇒ 去掉它，molang 模式也照常走多关节解 + 求解层。
    const tipBusyProgram = false;
    const useCcd = N >= 3 && o.multiJoint !== false && !tipBusyProgram;
    // ★★2026-11-10 造型旋钮：整条链一个普通变量 v.ikShape（-1..1，默认 0 = 正圆）。
    //   0 < shape ⇒ 弯折往**末端**集中（CCD 那种鞭子/触手手形）；shape < 0 ⇒ 往**根部**集中（从根卷起）。
    //   和 v.ikW 同一条通路（普通变量 + 全局发布）⇒ 变量面板能改、导出/导入都不丢、游戏里也能调。
    if (useCcd) {
        const safeTipS = boneSafeId(tip.id);
        if (!tip.scope.vars.has('v.ikShape')) tip.scope.addVar('v.ikShape', '0', -1, 1, 0.05);
        ensureIkGlobalVar(`${safeTipS}_ikShape`, 'v.ikShape', tip.id);
        // ★★2026-11-14 S 形多弧旋钮（-1..1，默认 0 = 只出 C/U 弧；±1 = 明显 S 形）
        if (!tip.scope.vars.has('v.ikWave')) tip.scope.addVar('v.ikWave', '0', -1, 1, 0.05);
        ensureIkGlobalVar(`${safeTipS}_ikWave`, 'v.ikWave', tip.id);
    }
    // ★2026-11-07 每关节活动权重：每个关节块一个普通变量 v.ikW（0..1，默认 1）；
    //   终端程序读 t.<关节>_ikW ⇒ 改权重立刻重算。变量名不带 ik_ 前缀 ⇒ 按常量导出、重导入不丢。
    const ikWeights = [];
    if (useCcd) {
        for (let i = 1; i < N; i++) {
            const jb = chain[i];
            const js = boneSafeId(jb.id);
            if (!jb.scope.vars.has('v.ikW')) jb.scope.addVar('v.ikW', '1', 0, 1, 0.05);
            ensureIkGlobalVar(`${js}_ikW`, 'v.ikW', jb.id);
            ikWeights.push(`t.${js}_ikW`);
        }
    }
    const sol = useCcd
        ? ikBuildSolveCcd(chain, anchor, bindTarget, {
            targetExpr: targetExpr || null, tipExtend, ccdIter: o.ccdIter, weights: ikWeights,
            // ★2026-11-10 造型旋钮（整条链一个数）：末端块 v.ikShape → t.<tip>_ikShape
            shapeExpr: `t.${boneSafeId(tip.id)}_ikShape`,
            // ★2026-11-14 S 形多弧旋钮：末端块 v.ikWave → t.<tip>_ikWave
            waveExpr: `t.${boneSafeId(tip.id)}_ikWave`
        })
        : ikBuildSolve(chain, anchor, bindTarget, { targetExpr: targetExpr || null, tipExtend, elbowIndex: o.elbowIndex });
    if (targetExpr) tip._ikTarget = targetExpr.slice();
    // ★★2026-11-14【第二条 IK 路线：v.ikMode（0=保形 / 1=圆弧）】
    //   求解正文读的是 t.<末端>_ikMode（见 ikBuildSolveCcd 的 addIn('v.ik_arc', …)）。
    //   默认值按「绑定姿态是否基本共线」给：共线 ⇒ 圆弧（唯一不退化的一阶解），否则 ⇒ 保形。
    //   ★必须在这里（sol 之后、写 inputs 之前）建，否则 v.ik_arc=t.<tip>_ikMode 求值时会读到未定义全局。
    if (sol.multiJoint) {
        const _modeKey = `${boneSafeId(tip.id)}_ikMode`;
        if (!tip.scope.vars.has('v.ikMode')) {
            tip.scope.addVar('v.ikMode', String(sol.arcDefault ? 1 : 0), 0, 1, 1);
        }
        ensureIkGlobalVar(_modeKey, 'v.ikMode', tip.id);
    }
    // 多关节：旧的 v.ik_* 变量必须清掉（否则会被卷进普通变量基线、与 loop 语句重复定义）
    if (sol.multiJoint) {
        const deadI = [];
        tip.scope.vars.forEach((_d, n) => { if (n.indexOf('v.ik_') === 0) deadI.push(n); });
        deadI.forEach(n => tip.scope.deleteVar(n));
        tip._ikMulti = true;
    }
    const ikRange = name => {
        const short = name.slice(5);
        if (short === 'tx' || short === 'ty' || short === 'tz') return { min: -1000, max: 1000, step: 0.01 };
        if (['ax', 'ay', 'az', 'jrx', 'jry', 'jrz', 'be'].indexOf(short) >= 0 || /^b\d+$/.test(short)) return { min: -360, max: 360, step: 0.01 };
        return { min: -10000, max: 10000, step: 0.01 };
    };
    (sol.vars || []).forEach(([name, expr]) => {
        const rg = ikRange(name);
        if (tip.scope.vars.has(name)) tip.scope.setVarExpr(name, expr);
        else tip.scope.addVar(name, expr, rg.min, rg.max, rg.step);
    });
    // 多关节：求解正文不在 base 里，这里只写「输入参数」（几何/目标/权重/父旋转）
    (sol.inputs || []).forEach(([name, expr]) => {
        const rg = ikRange(name);
        if (tip.scope.vars.has(name)) tip.scope.setVarExpr(name, expr);
        else tip.scope.addVar(name, expr, rg.min, rg.max, rg.step);
    });
    const safeTip = boneSafeId(tip.id);
    const pubNames = sol.multiJoint
        ? ['ik_jrx', 'ik_jry', 'ik_jrz'].concat(Array.from({ length: N - 1 }, (_x, i) => `ik_b${i + 1}`))
        : ['ik_jrx', 'ik_jry', 'ik_jrz', 'ik_be'];
    pubNames.forEach(k => ensureIkGlobalVar(`${safeTip}_${k}`, `v.${k}`, tip.id));
    tip._ikVars = sol.multiJoint ? (sol.inputs || []).slice() : (sol.vars || []).slice();
    tip._ikPublish = sol.multiJoint ? sol.publishText : ['ik_jrx', 'ik_jry', 'ik_jrz', 'ik_be'].map(k => `t.${safeTip}_${k}=v.${k};`).join(' ');
    tip._ikPubList = pubNames.map(k => [`${safeTip}_${k}`, `v.${k}`]);
    // 造型旋钮的发布：游戏里由末端块自己把 v.ikShape 广播成 t.<tip>_ikShape 供共用求解动画读取
    if (sol.multiJoint) {
        const _shpKey = `${safeTip}_ikShape`;
        if (!tip._ikPubList.some(it => it && it[0] === _shpKey)) tip._ikPubList.push([_shpKey, 'v.ikShape']);
        const _shpPub = `t.${_shpKey}=v.ikShape;`;
        if (String(tip._ikPublish || '').indexOf(_shpPub) < 0) {
            tip._ikPublish = (String(tip._ikPublish || '') + ' ' + _shpPub).trim();
        }
        // 第二条路线开关同样要发布，否则游戏里 v.ikMode 改了没人读
        const _modKey = `${safeTip}_ikMode`;
        if (!tip._ikPubList.some(it => it && it[0] === _modKey)) tip._ikPubList.push([_modKey, 'v.ikMode']);
        const _modPub = `t.${_modKey}=v.ikMode;`;
        if (String(tip._ikPublish || '').indexOf(_modPub) < 0) {
            tip._ikPublish = (String(tip._ikPublish || '') + ' ' + _modPub).trim();
        }
        // S 形多弧旋钮同样要发布，否则游戏里 v.ikWave 改了没人读
        const _wavKey = `${safeTip}_ikWave`;
        if (!tip._ikPubList.some(it => it && it[0] === _wavKey)) tip._ikPubList.push([_wavKey, 'v.ikWave']);
        const _wavPub = `t.${_wavKey}=v.ikWave;`;
        if (String(tip._ikPublish || '').indexOf(_wavPub) < 0) {
            tip._ikPublish = (String(tip._ikPublish || '') + ' ' + _wavPub).trim();
        }
    }
    // 关节活动权重的发布：运行时按 sourceBlockId 实时取值；导出时各关节自己输出 t.<id>_ikW=v.ikW;
    if (useCcd) {
        chain.slice(1).forEach(jb => {
            const js = boneSafeId(jb.id);
            const key = `${js}_ikW`;
            jb._ikPubList = (Array.isArray(jb._ikPubList) ? jb._ikPubList : []).filter(it => it && it[0] !== key);
            jb._ikPubList.push([key, 'v.ikW']);
            const pub = `t.${key}=v.ikW;`;
            if (String(jb._ikPublish || '').indexOf(pub) < 0) jb._ikPublish = (String(jb._ikPublish || '') + ' ' + pub).trim();
        });
    }
    // ⑥ 关节接管：每个关节的 x/y/z 三轴全部由 IK 决定（不再留给 FK / 关键帧）
    const root = chain[0];
    const drive = (b, n, e) => { ikSetJoint(b, n, e); b._ikVars.push(['v.' + n, e]); };
    const jr = ['ik_jrx', 'ik_jry', 'ik_jrz'];
    ['x', 'y', 'z'].forEach((ax, i) => {
        const expr = `t.${safeTip}_${jr[i]}`;
        // 有锚点：关节角进 bone_rot（rotate = 父 rotate + bone_rot）；自由根：直接接管 rotate
        drive(root, (anchor ? 'bone_rot' : 'rotate') + ax, expr);
    });
    const elbow = (N >= 3 && !sol.multiJoint) ? chain[sol.elbowIndex] : null;
    const lastJoint = sol.multiJoint ? N - 1 : N - 2;
    for (let i = 1; i <= lastJoint; i++) {
        const b = chain[i];
        drive(b, 'bone_rotx', '0');
        drive(b, 'bone_roty', '0');
        if (sol.multiJoint) {
            // 末端自己的 z 关节角由共用求解动画末句写入（v.bone_rotz=v.ik_b{N-1}）。
            // base 里绝不能写 `v.bone_rotz=v.ik_b5` —— base 先于动画层执行，导入/首帧时该变量还不存在，
            // 运行器会抛「未定义的变量 v.ik_b5」并让整帧回退。
            if (b === tip) ikSetJoint(b, 'bone_rotz', '0');
            else drive(b, 'bone_rotz', `t.${safeTip}_ik_b${i}`);
        } else {
            drive(b, 'bone_rotz', (b === elbow && sol.hasMid) ? `t.${safeTip}_ik_be` : '0');
        }
    }
    // ⑥b 多关节：求解函数搬进共用动画 ik_solve_<N>（所有同段数的链共用一份正文）；
    //     末端块 base 只留输入参数 + 输出发布，不再是又臭又长的语句版 program。
    if (sol.multiJoint) {
        ikAttachSolveLayer(tip, sol);
        // 逐段追加会为每一环新建 ik_solve_N；旧段数的控制器此时已无任何块引用 ⇒ 顺手删掉，
        // 避免动画列表/导出里残留 ik_solve_3..N-1 一堆废动画（其它链仍在用的不会删）。
        if (typeof animationUsageCount === 'function' && typeof deleteProjectAnimation === 'function') {
            projectAnimations.slice().forEach(a => {
                if (!a || String(a.name).indexOf(IK_SOLVE_ANIM_PREFIX) !== 0) return;
                if (a.id === tip._ikSolveAnimId) return;
                try { if (animationUsageCount(a.id) === 0) deleteProjectAnimation(a.id); } catch (_) { }
            });
        }
    }
    // ⑥ 元数据：链上每节都记录（末端用于「追加」，能反查到整条链与锚点）
    const ids = chain.map(b => b.id);
    chain.forEach((b, i) => {
        b._ikChain = ids.slice();
        b._ikAnchorId = anchor ? anchor.id : null;
        b._ikRole = i === 0 ? 'root' : (i === N - 1 ? 'tip' : (b === elbow ? 'elbow' : 'joint'));
    });
    // 记录本轮「偏移所对应的旋转系」= rotSrc：下次重建若换了根，1① 要按它把旧偏移转回世界方向
    // （否则圆形链重绑后会整条被再转一次 ⇒ 段段分离，用户报的「炸开」）。
    tip._ikFrameId = rotSrc ? rotSrc.id : null;
    // molang 编辑模式的块：把本轮算出的权威赋值追加到程序末尾（**不清用户的程序**）。
    // 这一步必须在所有 vars/drive 都写完之后做，否则补进去的还是旧值。
    chain.forEach(b => { try { ikPatchChainProgram(b); } catch (_) { } });
    chain.forEach(b => { try { b.refresh(); } catch (_) {} });
    // ★2026-11-14 够不着提示：目标比「链长」远时，求解器只能整链伸直对准目标（看起来就是一根棍子）。
    //   用户会以为是 bug，这里明确报距离，避免再靠猜。
    try {
        const _p0 = piv[0];
        const _D = Math.hypot(bindTarget[0] - _p0[0], bindTarget[1] - _p0[1], bindTarget[2] - _p0[2]);
        const _L = (sol.vecs || []).reduce((acc, v) => acc + Math.hypot(v[0], v[1], v[2]), 0);
        if (_L > 1e-6 && _D > _L + 1e-3 && !silent) {
            showToast(`IK：目标距离 ${_D.toFixed(2)} 超出链长 ${_L.toFixed(2)} ⇒ 求解器只能整链伸直指向目标（看起来像一根棍子）。把目标拖近到 ${_L.toFixed(2)} 以内就会弯。`);
        }
    } catch (_) { }
    // ⑦ 面板 / 撤销 / 提示（预设批量构建时静默，由调用方统一收尾）
    // ★2026-11-11【段长自检】`v.ik_g{k}` 是求解器眼里的「第 k 段长度」。如果它和该节方块自己的
    //   体长（ikSegLenOf）差太多，说明这一节的偏移被烘歪了（典型：某节 g 长成 2.4 而块只有 1），
    //   链一定会「散」。这里点名提示，不用再靠人肉看变量表。
    try {
        const bad = [];
        (sol.vecs || []).forEach((v, k) => {
            const owner = chain[k + 1];
            if (!owner) return;
            const body = ikSegLenOf(owner);
            if (!(body > 1e-6)) return;
            const L = Math.hypot(v[0], v[1], v[2]);
            if (!(L > 1e-6)) return;
            if (L > body * 1.6 || L < body * 0.6) bad.push(`${owner.id}（段长 ${L.toFixed(2)} vs 块长 ${body.toFixed(2)}）`);
        });
        if (bad.length) {
            console.warn('[IK 段长异常]', bad);
            if (!silent) showToast(`IK 段长异常：${bad.slice(0, 3).join('、')}${bad.length > 3 ? ' 等' : ''} —— 这一节的骨骼偏移和方块体长对不上，链会断开；请把该节摆回原位再绑。`);
        }
    } catch (_) { }
    if (!silent) {
        if (typeof renderSideBlockList === 'function') renderSideBlockList();
        try { if (selectedBlock !== tip) selectBlock(tip); renderVariablesForBlock(tip); } catch (_) {}
        try { renderInspector(); } catch (_) {}
        try { recordAction(); } catch (_) {}
        const tipInfo = sol.multiJoint ? `（${N} 节全关节一起弯曲；各关节块 v.ikW=0~1 控活动强度，0=完全不活动；末端块 v.ikShape=-1~1 调整形状：0=正圆、>0 弯折往末端集中、<0 往根部集中）` : (sol.hasMid ? '' : `（2 节只能改朝向：末端固定在半径 ${ikNum(sol.B)} 的球面上）`);
        const chainIds = N <= 12 ? `（${chain.map(b => b.id).join('→')}）` : '';
        showToast(`IK 逆骨骼：${N} 节${chainIds}，已自动建 point 目标点（红色，可拖动改变目标）${tipInfo}`);
    }
}
// ★2026-11-06：IK 的输入变量必须落在【真正的链尾】。用户常常只选到 a→b 这一段，
//   而 b 下面还挂着已用普通骨骼绑定接好的 c ⇒ 沿 _boneParent 继续向下展开到叶子，
//   让 c 成为末端块（v.ik_tx/ty/tz 与整套解算量都落在 c 上）；分叉（多于 1 个骨骼子块）时停下。
function ikChainToLeaf(chain) {
    const ids = new Set(chain.map(b => b.id));
    let cur = chain[chain.length - 1];
    while (cur) {
        const kids = blocks.filter(b => b._boneParent === cur.id && b._boneExplicit !== false && !ids.has(b.id));
        if (kids.length !== 1) break;
        ids.add(kids[0].id);
        chain.push(kids[0]);
        cur = kids[0];
    }
    return chain;
}
// 主入口：IK 绑定。支持「一次选中整条链」与「逐块追加」两条路径
function ikBindChain(children, parent) {
    if (!Array.isArray(children)) children = [children];
    children = children.filter(Boolean);
    if (!children.length) { showToast('IK 逆骨骼：没有可绑定的方块'); return; }
    // A. 追加：父级正是现有链的末端 ⇒ 新方块接到链尾，整链重建（末端随之变成新方块）
    if (parent && parent._ikRole === 'tip' && Array.isArray(parent._ikChain)) {
        const oldChain = parent._ikChain.map(getBlockById).filter(Boolean);
        if (oldChain.length >= 2) {
            const fresh = ikChainOrder(children.filter(b => oldChain.every(x => x.id !== b.id)));
            if (!fresh.length) { showToast('IK 逆骨骼：选中的方块已经在这条链里了'); return; }
            const anchor = oldChain[0]._ikAnchorId ? getBlockById(oldChain[0]._ikAnchorId) : null;
            // ★★2026-11-13：追加时把旧末端的 _ikTarget 透传下去（可能是自动建的 point，也可能是用户自定义目标），
            //   让重建后的新末端沿用同一目标 ⇒ 不会每次追加都新建一个 point。
            ikRebuildChain(ikChainToLeaf(oldChain.concat(fresh)), anchor, { targetExpr: parent._ikTarget || undefined });
            return;
        }
    }
    if (!parent) { showToast('IK 逆骨骼：请先选择链首要绑定的父骨骼'); return; }
    // C. 反向追加（用户实际习惯：从末端往上依次绑）：选中的块是现有链的首节、父级又不在链上
    //    ⇒ 把父级接到链首之前，整条链重建（不能再走 B 分支，那会把新链重置成 2 块、原链被清掉，
    //      表现就是「依次绑完模型缩到一起、末端变量动画也没了」）。
    {
        const head = ikChainOrder(children.filter(b => b.id !== parent.id))[0];
        if (head && head._ikRole === 'root' && Array.isArray(head._ikChain) && head._ikChain.length >= 2
            && head._ikChain.every(id => id !== parent.id)) {
            const oldChain = head._ikChain.map(getBlockById).filter(Boolean);
            // 链尾已经是叶子，不要再 ikChainToLeaf 向下展开（向上追加不应吞进链外的兄弟块）
            ikRebuildChain([parent].concat(oldChain), parent._boneParent ? getBlockById(parent._boneParent) : null);
            return;
        }
    }
    // ★★2026-11-08 多选 IK 语义（用户要求）：「先有 FK，再以当前选中的最高级 FK 作为 IK 最根部」
    //   选区本身已经是一条 FK 链（相邻块 _boneParent 逐级相连）时：
    //     · 链 = 整个选区（按 FK 顺序），链首 = 选区内最高级 FK ⇒ 它自己就是 IK 根关节，
    //       必须参与求解、会被驱动转弯，绝不能被当作锚点从链里剔出去；
    //     · 这个根若本身是另一个 FK 的子骨骼（父级在选区外）⇒ 那个父级才是锚点（根绕它转）；
    //       没有 FK 父级 ⇒ 自由根。
    //   旧实现不管 FK 结构，先把 parent 从选区里剔掉再 `anchor = parent` ⇒ 链首被踢出驱动组，
    //   「最高级 FK 永远不弯」，正是用户说的「多选 IK 不对」。
    {
        const fkAll = ikChainOrder(children.slice());
        const fkLinked = fkAll.length >= 2 && fkAll.slice(1).every((b, i) => b._boneParent === fkAll[i].id);
        if (fkLinked) {
            const chain0 = ikChainToLeaf(fkAll.slice());
            const extra = children.filter(b => !fkAll.some(x => x.id === b.id) && (!parent || b.id !== parent.id));
            if (extra.length) {
                const names = extra.slice(0, 3).map(b => b.name || b.id).join('、');
                showToast(`IK：选中的方块不是一条连续骨链，已只用 ${fkAll.map(b => b.name || b.id).join('→')}；${names}${extra.length > 3 ? ' 等' : ''}未参与`);
            }
            const fkParentId = fkAll[0]._boneParent;
            // 锚点 = 最高级 FK 的外部父级（FK 结构优先）；没有 FK 父级时才用第二步选的父级
            const anchor0 = fkParentId ? (getBlockById(fkParentId) || parent) : parent;
            if (anchor0 && chain0.some(b => b.id === anchor0.id)) {
                showToast('IK 逆骨骼：锚点不能同时是链上的方块'); return;
            }
            ikRebuildChain(chain0, anchor0);
            return;
        }
    }
    let chain = ikChainOrder(children.filter(b => b.id !== parent.id));
    let dropped = ikDroppedFromChain(children, chain, parent);
    // ★★2026-11-11【「一根长条上往下绑就炸开」的根因】选区彼此还没有 `_boneParent` 时，
    //   `ikChainOrder` 只能原样返回**选择顺序**（侧栏顺序 = 建块顺序，通常和几何顺序无关）。
    //   一根 10 节长条按建块顺序串起来，相邻两节可能隔了 2~3 段 ⇒ 每段偏移被烘成 2~3 倍，
    //   求解再一弯，视觉上就是「几个长条各飞一处」（用户截图）。
    //   旧实现只在「有块被 dropped」时才尝试按枢轴串链，可这种情况下 dropped 是空的 ⇒ 从不触发。
    //   ⇒ 只要选区不是一条现成的 FK 链，就必须先按枢轴距离串一次（连续性不通过时 ikOrderByPivot 返回 null，
    //     这时才退回原顺序）。
    {
        const fkLinkedSel = chain.length >= 2 && chain.slice(1).every((b, i) => b._boneParent === chain[i].id);
        if (!fkLinkedSel && chain.length >= 2) {
            const auto = ikOrderByPivot(children.filter(b => b.id !== parent.id), parent);
            if (auto && auto.length >= 2) {
                chain = auto;
                dropped = children.filter(b => b.id !== parent.id && !auto.some(x => x.id === b.id));
            }
        }
    }
    // 多选但还没用 FK 串过（互相没有 _boneParent 关系）时不必先做一遍 FK：
    // 同一段骨链内按枢轴距离自动串链；若选到了多条骨链（出现超节距跳跃）则拒绝，退回逐段绑。
    if (dropped.length) {
        const auto = ikOrderByPivot(children.filter(b => b.id !== parent.id), parent);
        if (auto && auto.length > chain.length) {
            chain = auto;
            dropped = [];
            showToast('IK：选中方块之间还没有父子关系，已按枢轴距离串成一条链，请检查顺序（多条骨链请分开绑）');
        }
    }
    // 分叉 / 互不相连的多选：只用其中一条连续链，其余块明示忽略（否则会被按选择顺序硬接，表现像「没反应」）
    if (dropped.length && chain.length >= 2) {
        const names = dropped.slice(0, 3).map(b => b.name || b.id).join('、');
        showToast(`IK：选中的方块不是一条连续骨链，已只用 ${chain.map(b => b.name || b.id).join('→')}；${names}${dropped.length > 3 ? ' 等' : ''}未参与`);
    } else if (dropped.length) {
        const child = chain[0];
        showToast(`IK：选中的方块之间还没有父子关系，本次只会把 ${parent.id}→${child ? (child.name || child.id) : '?'} 连起来；其余块请从末端往上逐段绑 IK`);
    }
    let anchor = parent;
    if (chain.length < 2) {
        // B. 只选 1 块 + 父级是普通方块 ⇒ 父级直接作为链首关节（2 个方块即可成链）
        const child = chain[0] || children.find(b => b.id !== parent.id);
        if (!child) { showToast('IK 逆骨骼：请选中要作为末端的方块'); return; }
        chain = [parent, child];
        // 链首 = 父级本身：它自己的父骨骼才是锚点（没有父骨骼 ⇒ 自由根，直接接管它自己的 rotate）
        anchor = parent._boneParent ? getBlockById(parent._boneParent) : null;
    }
    ikRebuildChain(ikChainToLeaf(chain), anchor);
}
// ==================== ★ 预设：蜘蛛腿（1 个 point 目标 + 6 条 IK 逆骨骼腿） ====================
// 用户 2026-11-06 要求：
//   · 一个名为 point 的方块作为目标；
//   · 剩下六条腿复用与「IK 逆骨骼绑定」完全相同的表达式（v.ik_* / _ikVars / _ikPublish）；
//   · 唯一改动 = 目标输入：v.ik_tx/ty/tz 直接读全局 t.point_px/py/pz（point 方块的世界 pos）；
//   · 每条腿的链首是「自由根」⇒ v.xpos/ypos/zpos 仍是普通可编辑变量，IK 顶端枢轴可手改。
// 段块几何（引擎实测口径）：extend_xrot=-90 + ybasepos=+0.5 ⇒ 段体 = 从枢轴沿局部 +Y 伸出，
//   长 = scale·extend_scale²、横截面 = scale×scale。
//   故 extend_scale = sqrt(段长/scale) 就能让每一节正好接到下一节的枢轴（首尾相接、无缝隙无重叠）。
function createSpiderLegPreset() {
    const center = [0, 2.0, 0];     // point 方块（六条腿的共同目标）
    const hipR = 2.5;               // 髋部（IK 自由根）离中心的水平距离
    const hipY = 1.2;               // 髋部高度
    const segLen = 0.5;             // 每节长度（6 节 ⇒ 全伸 3.0）
    const widths = [0.22, 0.20, 0.18, 0.16, 0.14, 0.12];   // 横截面（scale 逐级递减）
    const colors = ['#4b5563', '#565f6b', '#616a78', '#6c7585', '#778192', '#828d9f'];
    const uniq = base => { let id = base, k = 2; while (blocks.some(b => b.id === id)) id = base + (k++); return id; };
    const make = (id, pos, scale, es, color) => {
        const b = new Block(id, [_r4(pos[0]), _r4(pos[1]), _r4(pos[2]), 0, 0, 0,
            scale, _r4(es), -90, 0, 0, 0.5, 0], null, color);
        addBlock(b, false, false);
        return b;
    };
    // ① point：目标方块（红色）。t.point_px/py/pz 由它发布（导出侧写进 _ikVars）
    const pid = uniq('point');
    const pb = new Block(pid, [_r4(center[0]), _r4(center[1]), _r4(center[2]), 0, 0, 0,
        0.8, 1, -90, 0, 0, 0, 0], null, '#ff4d4f');
    addBlock(pb, false, false);
    const pSafe = boneSafeId(pid);
    ensureGlobalVar(`${pSafe}_px`, 'v.xpos', pb.id);
    ensureGlobalVar(`${pSafe}_py`, 'v.ypos', pb.id);
    ensureGlobalVar(`${pSafe}_pz`, 'v.zpos', pb.id);
    pb._ikVars = [
        [`t.${pSafe}_px`, 'v.xpos'],
        [`t.${pSafe}_py`, 'v.ypos'],
        [`t.${pSafe}_pz`, 'v.zpos']
    ];
    // 发布全局的自愈清单（撤销 / 重载后 globalVars 被清空时，point 每次 refresh 会自动重建 t.point_px/py/pz）
    pb._ikPubList = [[`${pSafe}_px`, 'v.xpos'], [`${pSafe}_py`, 'v.ypos'], [`${pSafe}_pz`, 'v.zpos']];
    // ★2026-11-07：目标点标记。Gizmo「位移(V)」默认只写 basepos（不动枢轴），发布的 t.point_p* 就不变、
    //   六条腿冻结不跟随；标记后位移直接写枢轴 xpos/ypos/zpos，IK 目标才真正实时（见 06-gizmo/02-core-drag.js）。
    pb._ikGoalMarker = true;
    pb.refresh();
    // ② 六条腿：每条 6 个 cube（全部 extend_scale 拉伸的细杆、scale 逐级递减、首尾相接）；
    //    初始沿 +Y 竖直排开（rotate 全 0 ⇒ 反解出的骨偏移恰好是 [0, segLen, 0]），IK 随后整链折叠指向 point。
    const targetExpr = [`t.${pSafe}_px`, `t.${pSafe}_py`, `t.${pSafe}_pz`];
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const hip = [hipR * Math.cos(a), hipY, hipR * Math.sin(a)];
        const chain = [];
        for (let k = 0; k < widths.length; k++) {
            const p = [hip[0], hip[1] + segLen * k, hip[2]];
            chain.push(make(uniq(`leg${i + 1}_${k + 1}`), p, widths[k], Math.sqrt(segLen / widths[k]), colors[k]));
        }
        // 肘关节放在第 3 节（leg*_4）：髋 1.0 + 胫 1.5 的比例更像腿；
        // 默认（不传 elbowIndex）仍是倒数第 2 节，用户手绑的链行为不变。
        ikRebuildChain(chain, null, { targetExpr, silent: true, elbowIndex: 3 });
    }
    // ③ 收尾：面板 / 撤销 / 选中 point（用户可直接改它的 pos 观察六条腿跟随）
    try { renderSideBlockList(); } catch (_) {}
    try { selectBlock(pb); renderVariablesForBlock(pb); } catch (_) {}
    try { recordAction(); } catch (_) {}
    if (typeof bumpDrawRev === 'function') bumpDrawRev('all');
    showToast(`蜘蛛腿预设：1 个 point + 6 条 IK 腿（每条腿 6 个 extend_scale 细杆、首尾相接；目标直接读 t.${pSafe}_px/py/pz，改 point 的 pos 六条腿即跟随；每条腿顶端枢轴 v.xpos 可手改）`);
    return pb;
}

// ==================== 20 节长链 IK 预设（U 弧 / S 多弧） ====================
// 一条 20 方块、首尾相接的长链 + 1 个可拖动目标点（point）。
//   · 末端块旋钮：v.ikWave = 0 → 单弧 C/U；±1 → S 形多弧（曲率沿链反号）
//                  v.ikShape → 弯折往根/末端偏；v.ikMode = 0 → 保形（不重解造型）
//   · 拖动 point ⇒ 整链实时重解（Gizmo 位移直接写枢轴，见 _ikGoalMarker）
function createLongChainIkPreset() {
    const segLen = 0.5;                 // 每节长度（20 节 ⇒ 全伸 10）
    const scale = 0.25;                 // 横截面（细杆）
    const N = 20;
    const goal = [5.0, 5.0, 0];         // 目标点：D≈7.07（链长 10）⇒ 中距，S 形最明显
    const uniq = base => { let id = base, k = 2; while (blocks.some(b => b.id === id)) id = base + (k++); return id; };
    const make = (id, pos, sc, es, color) => {
        const b = new Block(id, [_r4(pos[0]), _r4(pos[1]), _r4(pos[2]), 0, 0, 0,
            sc, _r4(es), -90, 0, 0, 0.5, 0], null, color);
        addBlock(b, false, false);
        return b;
    };
    // ① point：目标方块（红色，可拖）。t.<id>_px/py/pz 由它发布（导出侧写进 _ikVars）
    const pid = uniq('point');
    const pb = new Block(pid, [_r4(goal[0]), _r4(goal[1]), _r4(goal[2]), 0, 0, 0,
        0.7, 1, -90, 0, 0, 0, 0], null, '#ff4d4f');
    addBlock(pb, false, false);
    const pSafe = boneSafeId(pid);
    ensureGlobalVar(`${pSafe}_px`, 'v.xpos', pb.id);
    ensureGlobalVar(`${pSafe}_py`, 'v.ypos', pb.id);
    ensureGlobalVar(`${pSafe}_pz`, 'v.zpos', pb.id);
    pb._ikVars = [
        [`t.${pSafe}_px`, 'v.xpos'],
        [`t.${pSafe}_py`, 'v.ypos'],
        [`t.${pSafe}_pz`, 'v.zpos']
    ];
    pb._ikPubList = [[`${pSafe}_px`, 'v.xpos'], [`${pSafe}_py`, 'v.ypos'], [`${pSafe}_pz`, 'v.zpos']];
    pb._ikGoalMarker = true;   // Gizmo 位移直接写枢轴 ⇒ IK 目标实时跟随
    pb.refresh();
    // ② 20 节直链：沿 +Y 竖直排开（rotate 全 0 ⇒ 骨偏移恰好 [0, segLen, 0]），首尾相接
    const chain = [];
    const es = Math.sqrt(segLen / scale);
    for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        // 蓝色 → 青色 渐变（纯视觉，便于看清节序）
        const c = [Math.round(0x4f + (0x35 - 0x4f) * t), Math.round(0x8c + (0xd6 - 0x8c) * t), Math.round(0xf7 + (0xff - 0xf7) * t)];
        const color = `rgb(${c[0]},${c[1]},${c[2]})`;
        chain.push(make(uniq(`chain_${i + 1}`), [0, i * segLen, 0], scale, es, color));
    }
    try { refreshAllBlocksOrdered(); } catch (_) { }
    // ③ IK 逆骨骼绑定（自由根、全关节；目标读 point 的世界 pos）
    const targetExpr = [`t.${pSafe}_px`, `t.${pSafe}_py`, `t.${pSafe}_pz`];
    ikRebuildChain(chain, null, { targetExpr, silent: true });
    // ④ 默认展示 S 形多弧（wave=1）；用户改一个数即可在 U/C 与 S 之间切换
    const tip = chain[chain.length - 1];
    try { tip.scope.setVarExpr('v.ikWave', '1'); } catch (_) { }
    try { tip.scope.setVarExpr('v.ikMode', '1'); } catch (_) { }
    try { refreshAllBlocksOrdered(); } catch (_) { }
    // ⑤ 收尾：面板 / 撤销 / 选中 point（用户可直接拖它观察整链跟随）
    try { renderSideBlockList(); } catch (_) {}
    try { selectBlock(pb); renderVariablesForBlock(pb); } catch (_) {}
    try { recordAction(); } catch (_) {}
    if (typeof bumpDrawRev === 'function') bumpDrawRev('all');
    showToast(`20 节长链 IK：默认 S 形多弧。拖红色 point 改形状；选中末端块把 v.ikWave 调 0 → 单弧 C/U、-1 → 反向 S；v.ikMode=0 → 保形`);
    return pb;
}
