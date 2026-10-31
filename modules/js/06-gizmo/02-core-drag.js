/* 06-gizmo/02-core-drag.js · 源 测试版v.6b79.html 第 30541-31494 行 */
'use strict';
// ========== 3D Gizmo 核心实现 ==========

// ---------- 高亮显示 ----------
function clearActiveHighlight() {
    if (activeHighlight && activeHighlight.parent) {
        activeHighlight.parent.remove(activeHighlight);
        if (activeHighlight.geometry) activeHighlight.geometry.dispose();
        if (activeHighlight.material) activeHighlight.material.dispose();
    }
    activeHighlight = null;
}

function makeActiveHighlight(meta) {
    clearActiveHighlight();
    if (!meta || meta.type === 'input') return;
    if (meta.folder) return; // 文件夹 Gizmo 不显示方块式黄色高亮环，避免错位
    /* ★【2026-10-31】旋转手柄也不再额外画黄色高亮环：
       这里按「方块局部轴 + 默认半径 2.05」重建一条半圆弧，而 ex/ey 拉伸环挂在 eyFrame 下、
       半径 1.9/2.2 且随 ey 实时转动 ⇒ 方向/半径都对不上，用户拖动旋转环时会看到凭空多出一个淡黄色圆环。
       旋转环自身已有菱形抓手 + 增量 HUD，无需额外高亮（scale / stretch / plg 手柄本来也不画）。
       镜像的旋转手柄保留原行为（对称面有自己的可视化）。*/
    if (meta.type === 'rot' && !meta.mirrorPlane) return;
    const g = new THREE.Group();
    if (meta.type === 'rot') {
        const plane = new THREE.Group();
        const radius = meta.radius || 2.05;
        const end = Math.PI;
        const halo = new THREE.Mesh(
            makeArcBandShape(radius, 0.12, 0, end),
            new THREE.MeshBasicMaterial({ color: 0xffff66, transparent: true, opacity: 0.56, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
        );
        const pHalo = new THREE.Mesh(
            makeDiamondShape(0.28),
            new THREE.MeshBasicMaterial({ color: 0xffff66, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
        );
        pHalo.position.set(Math.cos(end * 0.5) * radius, Math.sin(end * 0.5) * radius, 0);
        pHalo.rotation.z = end * 0.5;
        plane.add(halo); plane.add(pHalo);
        const b = selected(); if (b) {
            let d;
            // 全局旋转（rotatex/y/z）按 Ry(-rotatey)*Rx(rotatex)*Rz(-rotatez) 顺序计算旋转轴方向
            if (meta.varName && meta.varName.startsWith('v.rotate')) {
                d = globalRotBasisFor(meta.axis);
            } else {
                d = rotDiscBasisFor(b, meta.axis);
            }
            g.position.copy(rotGizmoCenterLocal(b, meta.rotMode));
            orientDiscToBasis(g, d.x, d.y, d.z);
            // 从对应的 arc 组获取一致的 faceAngle，确保高亮与弧线对齐
            const arcGroup = rotArcGroups.find(ag =>
                ag.userData.herRotAxis === meta.axis &&
                ag.userData.herRotVar === meta.varName &&
                ag.userData.herRotMode === meta.rotMode
            );
            const faceAngle = arcGroup ? arcGroup.userData.herFaceAngle : 0;
            plane.rotation.z = rotVisualAngle(meta.axis, meta.varName) + faceAngle - Math.PI * 0.5;
        }
        g.add(plane);
    } else if (meta.type === 'scale' || meta.type === 'stretch' || meta.type === 'plgEdge' || meta.type === 'plgAngle') {
        // 调整 scale / es / 两边一角时也不显示黄色圆环高亮（按需求移除；两边一角的手柄本身已高亮着色）
    } else {
        // ★ 位移(base)箭头在非世界轴模式下：箭头本体沿【局部基轴 X/Y/Z】建模，再由组四元数旋转到剪切轴。
        //   高亮杆必须与箭头同构，否则会把「已剪切的方向」再旋转一次（双重旋转）：
        //   按下瞬间黄色高亮轴指向一个与真实箭头不同的方向，而其后的位移又沿真实箭头走
        //   → 用户看到「按下去的高亮轴和最终位置对不上」。
        const _isBaseMove = !!(meta.varName && meta.varName.includes('basepos'));
        const _axisName = meta.axisName || (meta.varName && meta.varName.includes('x') ? 'x' : meta.varName && meta.varName.includes('y') ? 'y' : 'z');
        const _localBaseAxis = _isBaseMove && !useWorldAxisDisplacement;
        const d = _localBaseAxis
            ? { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) }[_axisName]
            : (meta.axis || new THREE.Vector3(1,0,0)).clone().normalize();
        const vl = meta.visualLen || 1;
        const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035*vl, 0.035*vl, 1.6*vl, 6),
            new THREE.MeshBasicMaterial({ color: 0xffff66, transparent: true, opacity: 0.56, depthTest: false, depthWrite: false })
        );
        shaft.position.copy(d.clone().multiplyScalar((meta.start||0.55)+0.8*vl));
        shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.14*vl, 0.4*vl, 8),
            new THREE.MeshBasicMaterial({ color: 0xffff66, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false })
        );
        cone.position.copy(d.clone().multiplyScalar((meta.start||0.55)+1.8*vl+0.2*vl));
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d);
        g.add(shaft); g.add(cone);
        // 位移模式高亮定位到方块中心
        if (meta.varName && meta.varName.includes('basepos')) {
            const b = selected();
            if (b) {
                if (useWorldAxisDisplacement) {
                    // 世界轴位移模式：高亮定位到视觉中心，保持世界坐标轴朝向
                    const M = b.scope.toM();
                    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
                    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
                    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
                    const wm = computeTransformMatrix(M, rX, rY, rZ);
                    const vc = new THREE.Vector3().setFromMatrixPosition(wm).sub(originOfBlock(b));
                    g.position.copy(vc);
                    g.quaternion.identity();
                } else {
                    // 非世界轴模式：高亮跟随剪切轴方向
                    g.position.copy(centerOfBlock(b).sub(originOfBlock(b)));
                    const axes = shearedAxesOfBlock(b);
                    // 根据高亮对应的轴名称设置朝向
                    const axisName = meta.axisName || (meta.varName && meta.varName.includes('x') ? 'x' : meta.varName && meta.varName.includes('y') ? 'y' : 'z');
                    const wd = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) }[axisName];
                    const ad = { x: axes.x, y: axes.y, z: axes.z }[axisName];
                    if (wd && ad) g.quaternion.setFromUnitVectors(wd, ad);
                    else g.quaternion.copy(quatOfBlock(b));
                }
            }
        }
    }
    g.userData.herMeta = Object.assign({}, meta);
    g.renderOrder = 1200;
    activeHighlight = g;
    gizmoRoot.add(g);
}

function updateActiveHighlightPose() {
    if (!activeHighlight || !activePick) return;
    activeHighlight.userData.herMeta = Object.assign({}, activePick);
    const b = selected();
    if (activePick.type === 'rot') {
        if (!b) return;
        // 仅用于高亮显示的方向更新，不修改 activePick 基准方向
        // （activePick 基准方向在拖拽过程中保持初始值不变，保证 screenAngleFor 角度计算一致性）
        let d;
        // 全局旋转（rotatex/y/z）按 Ry(-rotatey)*Rx(rotatex)*Rz(-rotatez) 顺序计算旋转轴方向
        if (activePick.varName && activePick.varName.startsWith('v.rotate')) {
            d = globalRotBasisFor(activePick.axis);
        } else {
            d = rotDiscBasisFor(b, activePick.axis);
        }
        activeHighlight.position.copy(rotGizmoCenterLocal(b, activePick.rotMode));
        orientDiscToBasis(activeHighlight, d.x, d.y, d.z);
        const planeG = activeHighlight.children.find(c => c.type === 'Group');
        if (planeG) {
            // 使用与 arc 组一致的 stored faceAngle
            const arcGroup = rotArcGroups.find(ag =>
                ag.userData.herRotAxis === activePick.axis &&
                ag.userData.herRotVar === activePick.varName &&
                ag.userData.herRotMode === activePick.rotMode
            );
            const faceAngle = arcGroup ? arcGroup.userData.herFaceAngle : 0;
            planeG.rotation.z = rotVisualAngle(activePick.axis, activePick.varName) + faceAngle - Math.PI * 0.5;
        }
    } else if (activePick.type === 'move' && b) {
        // 位移模式：高亮跟随箭头位置
        const isBase = activePick.varName && activePick.varName.includes('basepos');
        if (isBase) {
            if (useWorldAxisDisplacement) {
                // 世界轴位移模式：高亮定位到视觉中心，保持世界坐标轴朝向
                const M = b.scope.toM();
                const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
                const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
                const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
                const wm = computeTransformMatrix(M, rX, rY, rZ);
                const vc = new THREE.Vector3().setFromMatrixPosition(wm).sub(originOfBlock(b));
                activeHighlight.position.copy(vc);
                activeHighlight.quaternion.identity();
            } else {
                // 非世界轴模式：高亮跟随剪切轴方向
                activeHighlight.position.copy(centerOfBlock(b).sub(originOfBlock(b)));
                const axes = shearedAxesOfBlock(b);
                const axisName = activePick.axisName || (activePick.varName && activePick.varName.includes('x') ? 'x' : activePick.varName && activePick.varName.includes('y') ? 'y' : 'z');
                const wd = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) }[axisName];
                const ad = { x: axes.x, y: axes.y, z: axes.z }[axisName];
                if (wd && ad) activeHighlight.quaternion.setFromUnitVectors(wd, ad);
                else activeHighlight.quaternion.copy(quatOfBlock(b));
            }
        } else {
            activeHighlight.position.set(0, 0, 0);
            activeHighlight.quaternion.identity();
        }
    }
}

// ---------- 变量更新 ----------
// 内部骨骼写回（applyBoneBlockState 等）需临时绕过「跟随通道保护」：
// 它们本来就是按骨骼语义把世界姿态还原进帧/方块，不是用户编辑。
let _constVarInternalWrite = 0;
// ✛ 骨骼子块的【跟随通道】：v.xpos/ypos/zpos 由 v.xpos = t.父_px + pR·xbasepos_bone 实时算，
// v.rotatex/y/z 由 v.rotatex = t.父_xrot 直接赋值。这些变量的 molang 表达式一旦被写成字面量数字，
// 子骨骼就【永久】脱离父骨骼（父旋转/父移动都不再带动它）—— 用户报的
// 「给子骨骼播放动画后失去父骨骼对其的控制、pos 变量数值被篡改而不是 molang 复制」即此。
// 保护策略（仅当当前表达式确实是 molang 表达式时生效，静态分组子块的常量照写不误）：
//   · 位置类（xpos/ypos/zpos）：换算成「相对父骨骼的偏移 xbasepos_bone」，枢轴照样到达目标坐标，
//     但跟随链不断 —— 与 Gizmo 位移(applyWorldDeltaToBoneOffset) 完全同构。
//   · 旋转类（rotatex/y/z）：拒绝并提示（跟随通道无法用常量表达；子块自旋请改 xrot/yrot/zrot）。
const _BONE_FOLLOW_POS_CHANNELS = { 'v.xpos': 0, 'v.ypos': 1, 'v.zpos': 2 };
const _BONE_FOLLOW_ROT_CHANNELS = new Set(['v.rotatex', 'v.rotatey', 'v.rotatez']);
// 局部轴绑定（basepos 绑定）的唯一位移通道是 v.xbasepos = A子⁻¹·A0·(父basepos + bone)。
// 对 v.xbasepos/y/z 的写入（Gizmo / 数值格）必须换算成 xbasepos_bone，否则会写死常量、切断跟随链。
// ★ 实时反解链（2026-10-21）下 bone→basepos 不再 1:1：basepos 变化 = A子⁻¹·A0·Δbone，
//   故必须先由【目标 basepos】反解出 bone（b = A0⁻¹·A子·目标basepos − 父basepos），拖动才按拖拽量走。
function _boneBaseposTargetBone(b, target) {
    const A0 = boneBaseposA0Of(b);
    const pid = getBoneParentId(b);
    const parent = pid ? blocks.find(x => x.id === pid) : null;
    if (!A0 || !parent) return null;
    const m0 = new THREE.Matrix3().set(A0[0], A0[1], A0[2], A0[3], A0[4], A0[5], A0[6], A0[7], A0[8]);
    if (!Number.isFinite(m0.determinant()) || Math.abs(m0.determinant()) < 1e-12) return null;
    const A = boneAppearanceMat3(b);
    const mA = new THREE.Matrix3().set(A[0], A[1], A[2], A[3], A[4], A[5], A[6], A[7], A[8]);
    const pb = new THREE.Vector3(tvnum(parent, 'v.xbasepos'), tvnum(parent, 'v.ybasepos'), tvnum(parent, 'v.zbasepos'));
    // basepos = A⁻¹·A0·(pb + bone) ⇒ bone = A0⁻¹·A·targetBasepos − pb
    const v = target.clone().applyMatrix3(mA).applyMatrix3(m0.clone().invert());
    return v.sub(pb);
}
// 返回 true = 已转发处理（调用方应停止直接写入）。
function _boneBaseposChannelRedirect(b, varName, value) {
    if (!b || !b.scope || getBoneMode(b) !== 'basepos') return false;
    const idx = { 'v.xbasepos': 0, 'v.ybasepos': 1, 'v.zbasepos': 2 }[varName];
    if (idx === undefined) return false;
    const def = b.scope.vars.get(varName);
    if (!def || !isMolangExpr(def.expr)) return false; // 未被跟随驱动 → 正常写常量
    const bn = ['xbasepos_bone', 'ybasepos_bone', 'zbasepos_bone'][idx];
    const full = 'v.' + bn;
    if (!b.scope.vars.has(full)) b.scope.addVar(full, '0', -100, 100, 0.1);
    const cur = new THREE.Vector3(tvnum(b, 'v.xbasepos'), tvnum(b, 'v.ybasepos'), tvnum(b, 'v.zbasepos'));
    const target = cur.clone(); target.setComponent(idx, Number(value));
    const boneVec = _boneBaseposTargetBone(b, target);
    if (boneVec && boneVec.toArray().every(Number.isFinite)) {
        // 三个分量一起写：反解结果是完整向量（只改一个分量也会牵动其余分量）
        ['x', 'y', 'z'].forEach((ax, i) => {
            const n = 'v.' + ax + 'basepos_bone';
            if (!b.scope.vars.has(n)) b.scope.addVar(n, '0', -100, 100, 0.1);
            kfChannelWrite(b, n, _r4(boneVec.getComponent(i)));
        });
    } else {
        const dv = Number(value) - tvnum(b, varName);
        if (Number.isFinite(dv)) kfChannelWrite(b, full, _r4(tvnum(b, full) + dv));
    }
    showToast('⚠️【' + b.id + '】是局部轴绑定子块：位移已写入 v.' + bn + '，保持跟随父骨骼');
    return true;
}
// ★【2026-10-22 用户问题 2】骨骼子块的「关节自转」通道：
//   v.rotatex = t.<父>_xrot + v.bone_rotx（rotate 是只读跟随量，真正可编辑的是 bone_rotx/y/z）。
//   对 v.rotatex/y/z 的写入（Gizmo / 数值格 / 关键帧）一律换算成对 bone_rotx/y/z 的写入，
//   增量口径：bone_rot += (目标 rotate − 当前 rotate)。手感与普通 rotate 完全一致，
//   关键帧模式下经 kfChannelWrite 落到关键帧数据。
function _boneJointRotChannelRedirect(b, varName, value) {
    if (!b || !b.scope) return false;
    const idx = { 'v.rotatex': 0, 'v.rotatey': 1, 'v.rotatez': 2 }[varName];
    if (idx === undefined) return false;
    const def = b.scope.vars.get(varName);
    if (!def || !isMolangExpr(def.expr)) return false; // 常量 rotate（未绑父）→ 正常写常量
    if (!getBoneParentId(b)) return false;
    const own = 'v.bone_rot' + ['x', 'y', 'z'][idx];
    if (!b.scope.vars.has(own)) b.scope.addVar(own, '0', -180, 180, 1);
    const dv = Number(value) - tvnum(b, varName);
    if (!Number.isFinite(dv)) return false;
    if (Math.abs(dv) < 1e-9) return true; // 值没变也算已处理，避免落到「跟随变量不可写」提示
    kfChannelWrite(b, own, _r4(tvnum(b, own) + dv));
    // 关节角写入后必须重算自身及全部后代（若非关键帧方块，kfChannelWrite 只改常量不 refresh）
    try { b.refresh(); b.mesh.updateMatrixWorld(true); refreshBoneFollowers(b); } catch (e) {}
    return true;
}
function _guardBoneFollowWrite(b, varName, value, def) {
    if (_constVarInternalWrite > 0) return false;
    if (!b) return false;
    const pid = getBoneParentId(b);           // 覆盖「只有 molang 表达式、_boneParent 缺失」的旧存档
    if (!pid) return false;
    const axis = _BONE_FOLLOW_POS_CHANNELS[varName];
    const isRot = _BONE_FOLLOW_ROT_CHANNELS.has(varName);
    // ★【2026-10-24 用户第 23 轮】basepos 绑定已退化为「纯枢轴吸附」：pos = 父枢轴（molang 跟随式），
    //   不可写；basepos / rot 都是自己的常量，写入照常放行（没有再转发成骨骼偏移的通道）。
    if (getBoneMode(b) === 'basepos' && !isBaseposDrivenBlock(b)) {
        if (axis !== undefined && def && isMolangExpr(def.expr)) {
            showToast('⚠️【' + b.id + '】的枢轴已对齐到父骨骼，位置不可直接修改；改几何请拖「位移」手柄（写 basepos）');
            return true;
        }
        return false;
    }
    // ★【2026-10-24】两种绑定方式的 pos 公式已统一为「父锚点 + pR·bone」：
    //   子块 pos 就是它【自己的枢轴】，改 pos 照常换算成 xbasepos_bone（关节偏移），不再拦截。
    // 旧版局部轴绑定（A0 实时反解链）：真正的位移通道是 basepos_bone，
    //   新绑定已统一为 pos 承载枢轴偏移（见上），本转发只对旧版链生效。
    if (_boneBaseposChannelRedirect(b, varName, value)) return true;
    // 骨骼子块：rotate 是「父旋转 + v.bone_rotX」跟随式 → 写入转发到关节角（用户问题 2）
    if (_boneJointRotChannelRedirect(b, varName, value)) return true;
    if (axis === undefined && !isRot) return false;
    if (!def || !isMolangExpr(def.expr)) return false;   // 已是常量（静态分组子块）→ 不拦
    if (axis !== undefined) {
        const parent = blocks.find(x => x.id === pid);
        const cur = new THREE.Vector3(tvnum(b, 'v.xpos'), tvnum(b, 'v.ypos'), tvnum(b, 'v.zpos'));
        const want = cur.clone(); want.setComponent(axis, Number(value));
        const delta = want.sub(cur);
        if (parent && delta.lengthSq() > 1e-12 && applyWorldDeltaToBoneOffset(b, parent, delta)) {
            showToast('⚠️【' + b.id + '】是骨骼子块：位置已按「相对父骨骼偏移」写入，保持跟随父骨骼');
            return true;
        }
    }
    molangProtectToast(varName, b);
    return true;
}
// ★★【2026-10-13 关键修复】关键帧方块：Gizmo 写入必须落到【关键帧数据】上。
/* 实测根因（探针 _giz_diag.cjs，证据链）：
     写 v.xpos=5 → scope.vars = 5
     b.refresh() → scope.vars = 1     ← 编译产物的 lerp 行把它覆盖回去了
     syncKeyframeFromBlock → 读到的还是 1 → 帧数据完全没变
   即：只要方块有编译式关键帧，任何"写 scope.vars + refresh"的 Gizmo 路径都无效
   （值被程序覆盖 → 回写读到旧值 → 用户看到"Gizmo 拖不动"）。
   解法：Gizmo 直接写 keyframeData（自动在当前播放头建帧/更新该帧）→ 重新编译 → 值就对了。 */
function kfGizmoWriteVar(block, varName, value) {
    if (!block || !block.scope || !Number.isFinite(value)) return false;
    /* ★★★【2026-10-17 用户第 15 轮 · 骨骼子块 Gizmo 恒「未改动」的真根因】
       旧门禁 `if (!kfCanUseCompiled(block)) return false;` 把骨骼/✛显式绑定方块挡在**关键帧写入**之外，
       它们于是落到下方 `setConstVarValue` 的 `scope.vars` 直写分支 —— 但这类有 keyframe 的方块
       `refresh()` 会**执行** scope.program（= getKeyframeCommandText 产物，含 `v.xbasepos=<旧值>;`
       等无条件常量），当场把刚写的值覆盖回去 ⇒ 用户看到「Gizmo 拖不动 / 恒显示未改动」。
       ★ 而**数值格**路径（`kfSetValueAtFrame`）从来**没有**这道门禁，它直接 `kfEnsureProgram` 重编译
       ⇒ 同一块方块用数值格能改、用 Gizmo 改不了 —— 这是两套入口不一致的 bug，不是骨骼设计。
       按用户裁决（第 14 轮「骨绑 = 普通方块，不写特殊流程」），这里与数值格路径对齐：
       只要有 keyframe 就写进 keyframeData 并重编译（骨骼跟随链由基线在后段原样保留）。 */
    // 局部轴绑定子块的 basepos 通道：先转发到 xbasepos_bone，避免被关键帧接管成 lerp 后切断跟随
    if (_boneBaseposChannelRedirect(block, varName, value)) return true;
    // 骨骼子块的旋转通道：转发到关节角 bone_rot（关键帧模式下同样落到关键帧数据）——用户问题 2
    if (_boneJointRotChannelRedirect(block, varName, value)) return true;
    // ★【2026-10-24】两种绑定方式公式统一后，子块 pos 就是【自身枢轴】，
    //   拖动它 = 改关节偏移（由 _guardBoneFollowWrite 换算到 xbasepos_bone），不再拦截。
    if (!hasKeyframeAnimation(block.id)) return false;
    /* ★★【2026-10-16 用户明确规格】「Gizmo 控件去变量数据仅针对于某某帧；
       如果是播放状态的 Gizmo 控件，是跟正常方块一样实时只读数据的。」
       ⇒ 播放中**不写关键帧**（否则会在不断移动的播放头上到处建帧/改帧 —— 正是
         "无缘无故多出来一帧""帧的赋值和时间没搞对"的放大器）。
       播放态只读实时值，等暂停/定位到某一帧再改。 */
    try {
        if (typeof keyframePlaying !== 'undefined' && keyframePlaying) {
            if (typeof showToast === 'function') showToast('播放中 Gizmo 为实时只读：请先暂停并定位到某一帧再修改');
            return false;
        }
    } catch (e) { }
    const short = String(varName).replace(/^v\./, '');
    const d = kfData(block.id, true);
    const driven = (d.vars instanceof Set) && d.vars.has(short);
    const framed = (d.frames instanceof Map) && Array.from(d.frames.values()).some(m => m instanceof Map && m.has(short));
    /* ★★★【2026-10-14 P0 · 用户投诉「Gizmo 拖动后突然回弹」的真根因】
       Gizmo 拖动**派生量**（被表达式赋值的变量）时必须被拒 —— 旧代码走 `kfGizmoWriteConst`
       把值写进 `kfBaseProgram` 的 `v.scale=3;`，但编译器 `kfBackChain` 仍把用户原来的
       `v.scale=math.sqrt(...)` 收进**后段**，而后段在**前段常量之后**执行
       ⇒ 拖出来的 3 被当场覆盖 ⇒ 用户看到"拖完就弹回"。
       ★【2026-10-16 用户纠正】这里的判定与提示**统一走 `gizmoMolangGuard`**（唯一入口），
         不再在本函数里重复写第二份派生量判断/文案（"新操作模式与旧操作模式本来就有拦截"）。 */
    if (gizmoMolangGuard(block, varName)) return false;
    if (!driven && !framed) {
        /* ★★★【2026-10-19 · 探针 _r53 实测：ret=true 但值原地不动 = 用户「Gizmo 能拖能显示、立马弹回、
           泡泡显示未改动」的真凶（"错误重复覆写"）】
           `kfGizmoWriteConst` 只认基线里 `v.X=<数字>;` 这种**字面量**行（正则替换），
           而旗帜「任意平行四边形」预设的核心通道是**表达式赋值**：`v.xrot=math.asin(math.clamp(-v.nz,-1,1));`。
           此时正则不匹配 ⇒ 走"末尾追加一行 `v.xrot=<新值>;`"兜底 —— 但 `kfBackChain` 收集后段时
           对同名变量已有条目（backMap）**丢弃后写的重复赋值** ⇒ 新值被静默吞掉：
           函数返回 true（调用方以为写成功）、scope 值却是表达式算出的旧值 ⇒ 拖拽原地弹回 + HUD 恒「未改动」。
           ★ 正解（与本文件第 28529 行作者原注释「这里与数值格路径对齐」一致）：只要是**表达式赋值**的变量，
           就不再走常量基线替换，直接落下去走「关键帧驱动」路径 —— d.vars 收编该变量 + 当前帧赋值，
           编译器 drivenSet 随即把后段那条表达式剔除、改由前段 lerp 驱动 ⇒ 值真正生效且 1:1 跟手，
           与用户在数据表数值格里改 xrot 的效果**完全一致**（数值格路径从来就没有这道常量分支）。 */
        let _exprAssigned = false;
        try { const _def = block.scope && block.scope.vars.get(varName); _exprAssigned = !!(_def && isMolangExpr(_def.expr)); } catch (e) { }
        if (!_exprAssigned) return kfGizmoWriteConst(block, short, value);
    }
    // 自动在当前播放头建帧/更新该帧（标准 auto-key 语义，保证拖拽 1:1 跟手）
    /* ★★★【2026-10-16 r11 修复】必须走 `kfResolveFrameTime` —— 播放头若停在**已存在的帧键**上
       （含历史遗留的未量化键），就直接编辑那一帧；只有真的不在任何帧附近才 auto-key 新建。
       旧实现 `kfQuantTime(keyframeCurrentTime)` 会把 4.474351 量化成 4.474 ⇒ 与真实帧错位，
       凭空多建一帧、且运行时读到的仍是旧帧值（用户投诉「多出一帧 / 编辑不了 / 未改动」）。 */
    /* ★★★【r18·3 · 用户要求「吸附到最近的已有帧」】非「+」显式加帧时，把编辑时刻吸附到
       该方块**最近的已有帧**（绝不新建）；无任何帧可吸附（t=null）才拦下并（防抖）提示。 */
    const t = kfEditFrameTime(block.id, keyframeCurrentTime);
    if (!(d.frames instanceof Map)) d.frames = new Map();
    if (!d.frames.has(t)) {
        if (!kfAllowNewFrame) {
            kfNotifyNoFrameBlocked();
            return true;
        }
        /* ★★★【2026-10-16 P0 · 用户投诉「无缘无故多出来一帧」「数据回弹」】——
           旧实现在非帧时刻建了一个**只有一个变量**的帧（实测 t=1.3 的帧 size=1）。
           半截帧会立刻被后续的 `kfCompleteFrames` 用"当前 scope 值"补齐，
           而那时 scope 里是**别的帧的结算值** ⇒ 用户看到"多出一帧 + 数值被覆写/回弹"。
           正解：新帧必须以**当前播放头时刻应有的完整姿态**建帧：先在 t 处求一次值，
           再把全部被管变量（d.vars ∪ 帧内已出现变量）按 `kfShouldRecordVar` 口径快照进去，
           与本文件 recordKeyframeForBlock 的录制口径完全一致（统一注入写法）。 */
        d.frames.set(t, new Map());
        try {
            const _names = new Set();
            if (d.vars instanceof Set) for (const n of d.vars) _names.add(n);
            for (const [, m] of d.frames) if (m instanceof Map) for (const k of m.keys()) _names.add(k);
            _names.add(short);
            const _f = d.frames.get(t);
            for (const n of _names) {
                if (isKeyframeInternalVar(n, block.id) || _kfIsNsInternal(n, block.id) || kfIsLegacyScaffoldTwin(n, block.id, block.scope && block.scope.program)) continue;   // ★ r18：v1 裸名脚手架（有命名空间孪生）不写进数据
                let nv;
                try { nv = kfShouldRecordVar(block, n) ? Number(capVal(block, n)) : NaN; } catch (e) { nv = NaN; }
                if (!Number.isFinite(nv)) {
                    const _dd = block.scope.vars.get('v.' + n);
                    nv = (_dd && Number.isFinite(Number(_dd.value))) ? Number(_dd.value) : 0;
                }
                _f.set(n, nv);
            }
        } catch (e) { }
        if (!d.frames.has(t)) d.frames.set(t, new Map());
    }
    if (!(d.frames.get(t) instanceof Map)) d.frames.set(t, new Map());
    d.frames.get(t).set(short, value);
    if (!(d.vars instanceof Set)) d.vars = new Set();
    d.vars.add(short);
    // 数值优先：清掉该时刻该变量的分段表达式覆盖，避免"改了数值却被表达式接管"
    if (d.exprs instanceof Map && d.exprs.has(t)) d.exprs.get(t).delete(short);
    kfRecompileBlocks([block.id]);
    return true;
}
// 改「程序基线」里的常量字面量（未被关键帧驱动的核心/自定义常量走这里）
function kfGizmoWriteConst(block, name, value) {
    const sc = block.scope;
    const lit = String(parseFloat(Number(value).toFixed(6)));
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const base = (typeof sc.kfBaseProgram === 'string') ? sc.kfBaseProgram : '';
    if (base) {
        const re = new RegExp('(v\\.' + esc + '\\s*=\\s*)(-?[0-9.]+)(\\s*;)');
        if (re.test(base)) {
            sc.kfBaseProgram = base.replace(re, (_m, a, _v, c) => a + lit + c);
            sc.kfBaseSig = sc.kfBaseProgram;
            kfRecompileBlocks([block.id]);
            return true;
        }
    }
    /* ★★【2026-10-14 P0 修复 · 用户投诉「Gizmo 改不动 scale 等常量」的真根因之一】
       旧实现：基线里找不到该变量的 `v.X=<数字>;` 就 **直接 return false**，
       于是调用方（setConstVarValue）继续往下走普通 scope.vars 写入 —— 但**关键帧方块的
       refresh() 会用编译产物覆盖 scope.vars**（产物把未驱动变量当"前段常量"或后段表达式重新赋值），
       用户看到的仍是拖之前的值 ⇒「拖了没反应、HUD 还说未改动」。
       触发条件很常见：**方块只有 1 个关键帧 / 变量从未被写进程序文本**（如新建的 scale、
       或把变量移出 d.vars 之后的常量）时，kfBaseProgram 里根本没有这一行。
       正解：基线里没有该变量时，**把这一行补进基线**（用户从此由基线接管它），
       再重编译 —— 与「在 molang 编辑器里手写一行」语义完全一致，不再需要"有旧行才能改"。 */
    const decl = `v.${name}=${lit};`;
    sc.kfBaseProgram = base ? (base.replace(/;\s*$/, '') + ';' + decl) : decl;
    sc.kfBaseSig = sc.kfBaseProgram;
    kfRecompileBlocks([block.id]);
    return true;
}
// 只重编译 + 刷新，**不动用户基线**（Gizmo/面板改数据走这条；
//   kfAfterExternalDataChange 是"程序被外部整体替换"才用，它会 kfResetBase）
function kfRecompileBlocks(ids) {
    keyframeEpoch++;
    kfMarkDirty();
    const list = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    for (const id of list) {
        const b = blocks.find(x => x.id === id);
        if (!b || !b.scope) continue;
        if (!hasKeyframeAnimation(id)) continue;
        /* ★★★【2026-10-17 第 15 轮】与 `kfSetValueAtFrame` 同口径：只要有关键帧就重编译
           （不再用 `kfCanUseCompiled` 把骨骼/✛绑定方块排除 —— 那会让它们的 Gizmo 写入
           永远被 refresh 里执行的旧 program 覆盖，表现为「拖不动 / 未改动」）。 */
        if (kfEnsureProgram(b, true)) b.refresh();
    }
}
function setConstVarValue(b, varName, value) {
    // ★ extend_scale 强检（最高优先级，且在骨骼跟随保护之前）：用户明确要求「一出现 0 就改成 0.0001」。
    //   放在最前是为了连 molang 接管块的 bake 路径、骨骼跟随通道一起覆盖 —— 0 是无论如何都不允许落库的值。
    if (_isEsName(varName)) value = esGuardNum(value);
    /* ★★★【2026-10-16 用户纠正】这里原有一份与 gizmoMolangGuard 重复的派生量拦截
       （`kfIsNonConstAssigned` + 自己的 toast 文案），用户指出「关键帧动画模式你又多余的
       写了一个」—— 现删除，改由下方 `kfGizmoWriteVar → gizmoMolangGuard` 统一受理
       （唯一判定入口 + 唯一文案），避免两处判定漂移。 */
    // ★★ 关键帧方块优先：写进关键帧数据（否则 refresh 时被编译产物覆盖 = Gizmo 无效）
    if (kfGizmoWriteVar(b, varName, value)) return;
    let def = b.scope.vars.get(varName);
    if (!def) {
        const rg = getDefaultRange(varName);
        b.scope.addVar(varName, '0', rg.min, rg.max, rg.step);
        def = b.scope.vars.get(varName);
    }
    if (!def || !Number.isFinite(value)) return;
    // ✛ 骨骼子块跟随通道保护（详见 _guardBoneFollowWrite 注释）
    if (_guardBoneFollowWrite(b, varName, value, def)) return;
    // 被 molang 接管的方块：仅当原程序行右值是常量时才写回（bake），避免吞掉表达式
    if (b.scope.molangMode) {
        if (['v.xrot','v.yrot','v.zrot'].includes(varName)) value = normRotDeg(value);
        const wrote = molangWriteBack(b, varName, value);
        if (wrote) {
            def.expr = String(parseFloat(Number(value).toFixed(4))); // 保持增量拖拽基准正确
            b.refresh();
        } else {
            // 该变量由 molang 表达式驱动，拖动/批量修改无效（限频提示）
            molangProtectToast(varName, b);
        }
        return;
    }
    if (['v.xrot','v.yrot','v.zrot'].includes(varName)) value = normRotDeg(value);
    const highPrecision = ['v.xpos','v.ypos','v.zpos','v.xbasepos','v.ybasepos','v.zbasepos'].includes(varName);
    let dec = highPrecision ? 4 : ((def.step && def.step.toString().includes('.')) ? Math.max(4, def.step.toString().split('.')[1].length) : 4);
    // ★ 拖拽期间：写入精度必须覆盖当前精度档步长的小数位，否则比 1e-4 更细的档（1e-5 …）被 toFixed 抹平
    //   → 方块原地不动、增量表恒显示「未改动」。非拖拽路径保持原口径不变。
    if (draggingGizmo || activePick) {
        const _step = gizmoPrecisionStep();
        const _stepDecs = _step > 0 ? gizmoPrecDecimals(_step) : 0;
        dec = Math.max(dec, _stepDecs);
    }
    def.expr = String(parseFloat(value.toFixed(dec)));
    def.value = parseFloat(value.toFixed(dec));
}

function baseposDeltaToWorldMatrix(b) {
    const baseM = b.scope.toM().slice();
    const rotX = Number(b.scope.vars.get('v.rotatex')?.value ?? 0);
    const rotY = Number(b.scope.vars.get('v.rotatey')?.value ?? 0);
    const rotZ = Number(b.scope.vars.get('v.rotatez')?.value ?? 0);
    const pointForBase = (bx, by, bz) => {
        const M = baseM.slice();
        M[10] = bx; M[11] = by; M[12] = bz;
        return new THREE.Vector3(0,0,0).applyMatrix4(computeTransformMatrix(M, rotX, rotY, rotZ));
    };
    const bx = Number(b.scope.vars.get('v.xbasepos')?.value ?? 0);
    const by = Number(b.scope.vars.get('v.ybasepos')?.value ?? 0);
    const bz = Number(b.scope.vars.get('v.zbasepos')?.value ?? 0);
    const p0 = pointForBase(bx, by, bz);
    return new THREE.Matrix4().makeBasis(
        pointForBase(bx+1, by, bz).sub(p0),
        pointForBase(bx, by+1, bz).sub(p0),
        pointForBase(bx, by, bz+1).sub(p0)
    );
}

function compensateBaseposForFixedCenter(b, targetCenter) {
    b.refresh(); b.mesh.updateMatrixWorld(true);
    const curCenter = centerOfBlock(b);
    const fixWorld = targetCenter.clone().sub(curCenter);
    if (fixWorld.lengthSq() < 1e-14) return;
    const basis = baseposDeltaToWorldMatrix(b);
    if (Math.abs(basis.determinant()) < 1e-12) return;
    const deltaBase = fixWorld.applyMatrix4(basis.clone().invert());
    setConstVarValue(b, 'v.xbasepos', Number(b.scope.vars.get('v.xbasepos')?.value ?? 0) + deltaBase.x);
    setConstVarValue(b, 'v.ybasepos', Number(b.scope.vars.get('v.ybasepos')?.value ?? 0) + deltaBase.y);
    setConstVarValue(b, 'v.zbasepos', Number(b.scope.vars.get('v.zbasepos')?.value ?? 0) + deltaBase.z);
    b.refresh(); b.mesh.updateMatrixWorld(true);
}

// 设置方块枢轴并保持模型在世界空间位置不变：直接复用“枢轴不联动模型”模式里 changeVar 的
// pos→basepos 换算（baseNew = A⁻¹·(w₀ − posNew)），不要再另写一套矩阵反算。
// newPivot：v.xpos/ypos/zpos 的目标值；例如归零传入 new THREE.Vector3(0,0,0)。
// 计算核心：将 folderName 骨骼下所有子方块的枢轴归位到骨骼枢轴（保持模型世界位置不变）。
// 不刷新 UI，供拖拽结束时对“文件夹自身 + 所有后代文件夹”批量调用，避免逐文件夹重渲染。
function bakeFolderCubesToBone(folderName, onlySet) {
    const f = folderName ? getFolder(folderName) : null;
    if (!f) return 0;
    // 骨骼文件夹不存独立枢轴（designateFolderBackbone 时已 delete f.pivot），目标退化为 (0,0,0) 会把所有非骨干方块枢轴全归零。
    // 这里统一走 folderGizmoCenterWorld：骨骼文件夹→骨干方块实时世界位置；普通文件夹→质心或 f.pivot。
    let target;
    try {
        target = folderGizmoCenterWorld(folderName) || new THREE.Vector3(0, 0, 0);
    } catch (e) { target = new THREE.Vector3(0, 0, 0); }
    let ids = getFolderAllCubeIds(folderName);
    // 若传入 onlySet（大纲工具点选），只处理选中方块；否则全文件夹（骨骼自动烘焙路径）
    if (onlySet && onlySet.size) {
        ids = ids.filter(id => { const b = blocks.find(x => x.id === id); return b && onlySet.has(b); });
    }
    const backboneId = f._backbone || null;
    let count = 0, skippedBone = 0;
    ids.forEach(id => {
        const b = blocks.find(x => x.id === id);
        if (b && b.scope) {
            // ★ 骨干方块（f._backbone === b.id）的枢轴 = 骨骼枢轴，由「归位枢轴到骨骼（方式1）」专门负责修改，
            // 这里跳过它，避免方式2 静默吞掉用户已调好的骨干枢轴。
            if (backboneId && id === backboneId) return;
            if (isBoneMolangDriven(b)) {
                // ★ 【真 molang 绑骨】子块的 v.xpos 是 molang 跟随表达式（t.骨干_px + pR·xbasepos_bone），
                //   位置由父骨实时决定，「枢轴归到骨骼原点」对它们无意义（动它必改模型视觉位置，
                //   用户明确不接受「缩成一团」）。正确行为：跳过（保持当前位置），并计入 skippedBone
                //   供 toast 明确提示「已绑骨子块由父骨驱动，无法独立归位」。
                //   静态文件夹骨骼子块是纯分组（v.xpos 为常量），与普通块无异，照常归位。
                skippedBone++;
                return;
            }
            setPivotKeepingModel(b, target.clone()); count++;
        }
    });
    return { count, skippedBone };
}
// 方式2：将 folderName 骨骼下所有子方块的枢轴归位到骨骼原点/骨骼枢轴，保持模型世界位置不变。
// 被“骨骼自动烘焙”与大纲工具菜单共用（带 UI 刷新）。
function applyAlignPivotToBone(folderName, onlySet) {
    const res = bakeFolderCubesToBone(folderName, onlySet);
    blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
    renderInspector();
    renderSideBlockList();
    return res;
}

// 将世界空间向量 w 换算到方块的 basepos 局部空间（逐步逆变换）。
// 关键：basepos 的世界贡献 = globalRot·(Ry·Rx·Rz·S·Eyl·Exl·Es·Exr·Eyr·Esy)·basepos。
// 若对含 extend_scale≈0.0001 的乘积矩阵整体求逆，矩阵近奇异 → 逆矩阵数值爆炸，
// basepos 被算成天文数字（用户报告的“枢轴没动但 basepos 大变 / 导出模型乱飞”）。
// 这里按相反顺序逐因子求逆：旋转用转置角、缩放用倒数，每一步都数值稳定（1/es=10000 有限）。
function worldToBasepos(b, w) {
    const M = b.scope.toM();
    const [, , , rx, ry, rz, s, es, ex, ey] = M;
    const esSafe = clampEs(es);   // es=0 时直接 d.x/=0 会除零（basepos 写成 NaN）→ 世界轴位移失效；钳到 ES_MIN
    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
    const d = w.clone();
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    const rad = degToRad;
    // globalRot⁻¹ = Rz(+rZ)·Rx(-rX)·Ry(+rY)，乘积右端先作用：先 Ry(+rY)
    d.applyAxisAngle(Y, rad(rY));
    d.applyAxisAngle(X, rad(-rX));
    d.applyAxisAngle(Z, rad(rZ));
    // U⁻¹ = Esy⁻¹·Eyr⁻¹·Exr⁻¹·Es⁻¹·Exl⁻¹·Eyl⁻¹·S⁻¹·Rz⁻¹·Rx⁻¹·Ry⁻¹，乘积右端先作用：
    // 先 Ry⁻¹ → Rx⁻¹ → Rz⁻¹ → S⁻¹ → Eyl⁻¹ → Exl⁻¹ → Es⁻¹ → Exr⁻¹ → Eyr⁻¹ → Esy⁻¹
    d.applyAxisAngle(Y, rad(ry));         // Ry⁻¹（Ry = Ry(-ry)）
    d.applyAxisAngle(X, rad(-rx));        // Rx⁻¹（Rx = Rx(+rx)）
    d.applyAxisAngle(Z, rad(rz));         // Rz⁻¹（Rz = Rz(-rz)）
    if (Math.abs(s) > 1e-12) d.multiplyScalar(1 / s);  // S⁻¹
    d.applyAxisAngle(Y, rad(ey));         // Eyl⁻¹（Eyl = Ry(-ey)）
    d.applyAxisAngle(X, rad(-ex));        // Exl⁻¹（Exl = Rx(+ex)）
    d.z /= esSafe;                       // Es⁻¹（z 除以 extend_scale，es 已钳制避免除零）
    d.applyAxisAngle(X, rad(ex));         // Exr⁻¹（Exr = Rx(-ex)）
    d.applyAxisAngle(Y, rad(-ey));        // Eyr⁻¹（Eyr = Ry(+ey)）
    d.y /= esSafe;                       // Esy⁻¹（y 除以 extend_scale，es 已钳制避免除零）
    return d;
}

function setPivotKeepingModel(b, newPivot) {
    const M = b.scope.toM();
    const rX = b.scope.vars.get('v.rotatex')?.value ?? 0;
    const rY = b.scope.vars.get('v.rotatey')?.value ?? 0;
    const rZ = b.scope.vars.get('v.rotatez')?.value ?? 0;
    const worldMat = computeTransformMatrix(M, rX, rY, rZ);
    const w0 = new THREE.Vector3().setFromMatrixPosition(worldMat); // 当前世界位置（含旧枢轴）
    // 直接写新枢轴
    setConstVarValue(b, 'v.xpos', newPivot.x);
    setConstVarValue(b, 'v.ypos', newPivot.y);
    setConstVarValue(b, 'v.zpos', newPivot.z);
    // baseNew = 逐步逆变换(w₀ − posNew)，与拖拽“枢轴不联动”完全一致的公式；
    // 逐因子求逆，避免对含 extend_scale≈0.0001 的近奇异矩阵整体求逆导致 basepos 爆炸。
    const baseNew = worldToBasepos(b, w0.clone().sub(newPivot));
    setConstVarValue(b, 'v.xbasepos', baseNew.x);
    setConstVarValue(b, 'v.ybasepos', baseNew.y);
    setConstVarValue(b, 'v.zbasepos', baseNew.z);
    b.refresh(); b.mesh.updateMatrixWorld(true);
}

// 判断变量 expr 是否为 molang 表达式（而非纯数字字面量）。
// 纯数字（如 "30"、"-12.5"、"0"）视为字面量，可被 Gizmo 直接写入；
// 其余（含 t.Cube_xrot、q.x+5、math.sin(...)、v.xpos*2 等）视为表达式，Gizmo 不应覆盖。
function isMolangExpr(expr) {
    if (typeof expr !== 'string') return false;
    const s = expr.trim();
    if (!s) return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return false;
    return true;
}

// 方块是否由 molang 表达式驱动（用于方块列表自动特殊高亮，无需手动开关）：
// ① molangMode 完全接管；② 自身变换变量被 molang 表达式驱动（如 v.rotatex=t.Cube_xrot）；
// ③ 作为骨源发布 t.<id>_px/py/... 全局变量供其它块 molang 跟随。
// molangSourceIds：由调用方在每次渲染时一次性算好传入，避免逐块扫全局变量。
const MOLANG_TRANSFORM_VARS = new Set([
    'v.xpos','v.ypos','v.zpos',
    'v.xrot','v.yrot','v.zrot',
    'v.rotatex','v.rotatey','v.rotatez',
    'v.scale','v.extend_scale','v.extend_xrot','v.extend_yrot',
    'v.xbasepos','v.ybasepos','v.zbasepos',
    'v.xbasepos_bone','v.ybasepos_bone','v.zbasepos_bone'
]);
function blockMolangInfo(b, molangSourceIds) {
    if (!b || !b.scope) return null;
    if (b.scope.molangMode) return { kind: 'mode', label: 'molang 完全接管（变量区只读）' };
    for (const [name, def] of b.scope.vars) {
        const ev = def && def.expr;
        if (ev && MOLANG_TRANSFORM_VARS.has(name) && isMolangExpr(ev)) {
            return { kind: 'driven', label: 'molang 驱动（变换变量为表达式，如 ' + name + '=' + ev + '）' };
        }
    }
    if (molangSourceIds && molangSourceIds.has(b.id)) {
        return { kind: 'source', label: 'molang 骨源（发布 t.' + b.id + '_* 供子块跟随）' };
    }
    return null;
}

// 从 molang 表达式推断骨骼父级：用于导入/旧存档中只有表达式、没有 _boneParent 元数据的方块。
// 扫描所有变量表达式，若出现 t.<id>_xrot / t.<id>_px 等跟随模式，即认为该方块被 <id> 驱动。
function inferMolangBoneParent(b) {
    if (!b || !b.scope) return null;
    if (b._boneParent) return b._boneParent;
    const exprs = [];
    for (const [name, def] of b.scope.vars) {
        if (def && def.expr) exprs.push(def.expr);
    }
    const all = exprs.join(';');
    // bx/by/bz = 局部轴绑定（子块读父 basepos）的父级标记，与 px/py/pz 二选一
    const m = all.match(/t\.([A-Za-z0-9_]+)_(?:xrot|yrot|zrot|px|py|pz|bx|by|bz)\b/);
    return m ? m[1] : null;
}

// Gizmo 守卫：未开启 molang 全权控制（scope.molangMode）时，若目标核心变量是 molang 表达式
// （非纯字面量，如 t.Cube_xrot、q.x+5、math.sin(...)），禁止 Gizmo 直接写值——
// 否则会把表达式剪断成字面量（如 31.8953），破坏 molang 链接。命中则提示（标注方块）并返回 true。
// 注意：molangMode 开启时由 setConstVarValue 的 molangWriteBack 路径处理，此处不拦截。
function gizmoMolangGuard(b, varName) {
    if (!b || !b.scope) return false;
    const _short = String(varName).replace(/^v\./, '');
    /* ★★★【2026-10-17 r16 · 用户投诉「骨绑子块的 x/y/zrot 也不让我改」】
       派生量判定只服务「被表达式赋值、且**不参与关键帧**」的中间量（如 v.scale=math.sqrt(…)）。
       若该变量已被关键帧接管（在 d.vars 里，或任一帧已含该变量）⇒ 它是**数值驱动通道**，
       由 Gizmo 直写关键帧数据是天经地义，绝不能当成派生量拦下。
       （实测：骨绑子块的 xrot 曾被误判成派生量 → derivedVarProtectToast 拦掉 Gizmo。）
       注意用 kfData(id, false)：只读查询，绝不为查询创建条目。 */
    try {
        const _dd = kfData(b.id, false);
        if (_dd) {
            if (_dd.vars instanceof Set && _dd.vars.has(_short)) return false;
            if (_dd.frames instanceof Map) {
                for (const [, m] of _dd.frames) { if (m && m.has && m.has(_short)) return false; }
            }
        }
    } catch (e) { }
    /* ★★★【2026-10-16】派生量判定必须是**第一道闸**，且对「molangMode / 编译式关键帧」
       同样生效 —— 这两类方块此前直接 `return false` 放行，导致派生量被写进前段常量、
       又被后段表达式当场覆盖 ⇒ 用户看到「拖完就弹回」。
       顺序：关键帧驱动量（放行）→ 派生量（任何方块）→ molangMode → 编译式关键帧 → 普通 molang 表达式。 */
    /* ★★★【2026-10-19 · 用户投诉「点数据表自定义变量框后 Gizmo 失效：能拖动、能显示，但立马弹回原样，
       泡泡显示『未改动』」的真根因 · 探针 _r49 复现：旗帜方块拖「旋转」手柄 ⇒ HUD 恒「未改动」】
       此处原为 `kfIsNonConstAssigned(b,_short)`（只判"是否被表达式赋值"），与本项目**唯一**的派生量定义
       `kfIsDerivedVar` 不一致 —— 后者的第一句就是「核心变换变量不算派生（用户可能想接管）」。
       于是旗帜/骨绑这类"核心通道被预设表达式赋值"（v.xrot=math.asin(…)、v.extend_scale=math.max(…)、
       v.xpos=t.父_px+…）的方块，**整个旋转/缩放 Gizmo 被误判成派生量而拒绝**：
       手柄能抓能显示，方块原地不动（拖完弹回），增量泡泡必然显示「未改动」。
       正解：与 kfIsDerivedVar 同口径 —— 只有**非核心**的表达式中间量（v.nz / v.nl / v.Q1 …）才拒。
       首次拖动即把该核心变量写进 d.vars（Gizmo 自动建帧），编译器 drivenSet 随即把它挪进前段 lerp、
       后段那条表达式被剔除（见 kfBackChain 的 drivenSet 分支）⇒ 写入立即生效，且不会回弹。 */
    // 局部轴绑定的 basepos 是跟随表达式，但它是官方换算通道（写入会转发到 xbasepos_bone）→ 放行
    if (getBoneMode(b) === 'basepos' && (_short === 'xbasepos' || _short === 'ybasepos' || _short === 'zbasepos')) return false;
    // 骨骼子块的 rotate 是「父旋转 + v.bone_rotX」跟随表达式，同样是官方换算通道
    // （写入经 _boneJointRotChannelRedirect 转发到关节角）→ 放行，否则关节活动做不出（用户问题 2）
    if (getBoneParentId(b) && (_short === 'rotatex' || _short === 'rotatey' || _short === 'rotatez')) return false;
    let _isDerived = false;
    try { _isDerived = !!kfIsDerivedVar(b, _short); } catch (e) { }
    if (_isDerived) { derivedVarProtectToast(varName, b); return true; }
    if (b.scope.molangMode) return false;
    // ★★【2026-10-13 修复】编译式关键帧方块：v.X 的 expr 是**编译器写的 lerp 行**
    //   （math.lerp(v.<id>_start_X, v.<id>_TX, v.<id>_u)），不是用户手写表达式。
    //   旧逻辑把它当 molang 表达式拦下 → 用户拖 Gizmo 只弹「由 molang 驱动，修改无效」
    //   → 表现就是「关键帧动画没法用 Gizmo 改」（用户投诉的第二半根因）。
    //   这类方块的 Gizmo 写入由 kfGizmoWriteVar 落到 keyframeData，必须放行。
    if (kfCanUseCompiled(b) && hasKeyframeAnimation(b.id)) return false;
    const def = b.scope.vars.get(varName);
    if (!def || !isMolangExpr(def.expr)) return false;
    molangProtectToast(varName, b);
    return true;
}

function applyOriginRotateDelta(varName, delta) {
    if (!selectedBlocksSet || !selectedBlocksSet.size || Math.abs(delta) < 1e-8) return;
    for (const b of selectedBlocksSet) {
        const vn = boneRootRotateVarName(b, varName) || varName;
        // 禁止 Gizmo 覆盖 molang 表达式（未开启 molang 全权控制时）：跳过并提示（标注方块）
        if (gizmoMolangGuard(b, vn)) continue;
        const cur = Number(b.scope.vars.get(vn)?.value ?? 0);
        setConstVarValue(b, vn, cur + delta);
        b.refresh(); b.mesh.updateMatrixWorld(true);
        syncKeyframeFromBlock(b);
    }
    // 骨骼根被旋转后，其全部后代骨骼块须实时刷新，才能经 molang 跟随父（统一纯 molang 骨骼）。
    // 否则仅刷新父块、子块不动 —— 用户报告的“父骨骼转、子骨骼不动 / 啥都没发生”的根因。
    for (const b of selectedBlocksSet) { if (isBoneRoot(b)) refreshBoneFollowers(b); }
}

function applyCenterRotateDelta(varName, delta) {
    if (!selectedBlocksSet || !selectedBlocksSet.size || Math.abs(delta) < 1e-8) return;
    for (const b of selectedBlocksSet) {
        const vn = boneRootRotateVarName(b, varName) || varName;
        // 禁止 Gizmo 覆盖 molang 表达式（未开启 molang 全权控制时）：跳过并提示（标注方块）
        if (gizmoMolangGuard(b, vn)) continue;
        const beforeCenter = centerOfBlock(b);
        const cur = Number(b.scope.vars.get(vn)?.value ?? 0);
        setConstVarValue(b, vn, cur + delta);
        compensateBaseposForFixedCenter(b, beforeCenter);
        syncKeyframeFromBlock(b);
    }
    // 骨骼根被旋转后，其全部后代骨骼块须实时刷新，才能经 molang 跟随父（统一纯 molang 骨骼）。
    for (const b of selectedBlocksSet) { if (isBoneRoot(b)) refreshBoneFollowers(b); }
}

    const ns = ['v.xpos','v.ypos','v.zpos','v.xbasepos','v.ybasepos','v.zbasepos','v.xrot','v.yrot','v.zrot','v.rotatex','v.rotatey','v.rotatez','v.scale','v.extend_scale','v.extend_xrot','v.extend_yrot'];

function changeVar(name, delta, refresh = true) {
    if (!selectedBlocksSet || !selectedBlocksSet.size) return;
    // ★ 骨骼子块（molang 绑定）的「枢轴」拖拽：位置由 molang（v.xpos = t[父_px] + pR·xbasepos_bone）实时跟随父骨骼，
    //   不能直接写 v.xpos（molang 表达式）。世界轴位移换算进【相对父骨骼的偏移 xbasepos_bone】，
    //   与 位移(V) 模式、applyFolderMove 骨骼分支完全同构。
    //   - 枢轴联动模型：位移只写 xbasepos_bone（模型随枢轴一起走）。
    //   - 枢轴不联动模型：枢轴移动后模型需保持原位 → 额外把【几何 basepos v.xbasepos】反向补偿
    //     worldToBasepos(b, -worldDelta)，与单方块「枢轴不联动」补偿公式一致。
    _skipBoneInBatch = !!(activePick && activePick.type === 'move' && name && !name.includes('basepos'));
    if (_skipBoneInBatch && activePick.axis && activePick.axis.clone) {
        const wd = activePick.axis.clone().multiplyScalar(delta);
        for (const b of selectedBlocksSet) {
            // ★ 只有【真 molang 骨骼子块】才把世界位移换算进 xbasepos_bone。
            //   静态文件夹骨骼是纯分组（无 molang、v.xpos 为常量），xbasepos_bone 无人读取，
            //   写进去位移直接蒸发 → 表现为「Gizmo 拖不动」。这类块落到下方普通分支直接写 v.xpos。
            const pid = isBoneMolangDriven(b) ? getBoneParentId(b) : null;
            if (!pid) continue;
            // ★【2026-10-24 r23】basepos 绑定（纯枢轴吸附）的枢轴锁定在父枢轴，拖枢轴手柄无效；
            //   要移动模型请用「位移」手柄（写 basepos）或解除绑定。
            if (getBoneMode(b) === 'basepos' && !isBaseposDrivenBlock(b)) continue;
            // ★【2026-10-24】两种绑定方式公式统一后，子块 pos 就是自身枢轴，
            //   拖枢轴手柄同样换算成 xbasepos_bone（关节偏移），不再跳过。
            const pBlock = blocks.find(x => x.id === pid);
            if (!pBlock) continue;
            // ★r16：改走【官方换算通道注册表】。当前仅 'bone_offset'（世界位移 → xbasepos_bone 三件套），
            //   行为与旧硬编码完全一致；未来新增官方换算只加注册项，不再往本函数塞 if 分支。
            const _ctx = { parent: pBlock, worldDelta: wd, activePick, pivotLinkModel };
            let _done = false;
            for (const ch of KF_OFFICIAL_CHANNELS) {
                if (ch.kind !== 'world-delta') continue;
                let _en = false; try { _en = !!ch.enabled(b); } catch (e) { _en = false; }
                if (!_en) continue;
                try { if (ch.convert(b, _ctx, wd)) _done = true; } catch (e) { }
            }
            if (_done) {
                if (!pivotLinkModel) {
                    const comp = worldToBasepos(b, wd.clone().negate());
                    ['v.xbasepos','v.ybasepos','v.zbasepos'].forEach((bn, i) => {
                        if (gizmoMolangGuard(b, bn)) return;
                        let def = b.scope.vars.get(bn);
                        if (!def) { const rg = getDefaultRange(bn); b.scope.addVar(bn, '0', rg.min, rg.max, rg.step); def = b.scope.vars.get(bn); }
                        if (def) { const cur = parseFloat(def.expr) || def.value; setConstVarValue(b, bn, _r4(cur + comp.getComponent(i))); }
                    });
                }
                b.refresh(); b.mesh.updateMatrixWorld(true);
                if (b.group) refreshBlocksUnderFolder(b.group);
                syncKeyframeFromBlock(b);
                // ★【r17】换算已写入帧 → 立刻（节流）刷新右侧「关键帧时间表」，
                //   否则拖动过程中数据表停在旧值，用户看到「表完全不动」。
                try { kfSchedulePanelRefresh(90); } catch (e) { }
            }
        }
    }
    // 世界轴位移模式：将世界空间增量转换到局部 basepos 空间（逐因子逆变换，数值稳定）
    if (activePick && activePick.mode === 'base') {
        const worldDeltaVec = activePick.axis.clone().multiplyScalar(delta);
        for (const b of selectedBlocksSet) {
            // 位移模式：骨骼子块与普通块、骨骼根完全一致 —— 只改【几何局部偏移 basepos】。
            // 骨骼 molang 只接管 v.xpos（枢轴位置 = t[父_px] + pR·xbasepos_bone），并不接管 basepos；
            // basepos 是几何相对【本块枢轴】的局部偏移，由 computeTransformMatrix 的 localMat 自动挂枢轴、
            // 随本块自身 v.rotatex 旋转而公转。因此「位移」Gizmo 对骨骼子块也直接写 basepos，
            // 绝不走 xbasepos_bone 的父骨偏移换算（那是「枢轴」拖拽的职责，二者严格正交）。
            const baseDeltaVec = worldToBasepos(b, worldDeltaVec);
            ['xbasepos','ybasepos','zbasepos'].forEach((axis, i) => {
                const vn = 'v.' + axis;
                let def = b.scope.vars.get(vn);
                if (!def) {
                    const rg = getDefaultRange(vn);
                    b.scope.addVar(vn, '0', rg.min, rg.max, rg.step);
                    def = b.scope.vars.get(vn);
                }
                if (def) {
                    if (gizmoMolangGuard(b, vn)) return; // 禁止 Gizmo 覆盖 molang 表达式（标注方块）
                    const cur = parseFloat(def.expr) || def.value;
                    const nv = cur + baseDeltaVec.getComponent(i);
                    // 拖拽时保留较高精度（6位小数），避免 toFixed(2) 丢失小增量导致大数值抖动
                    setConstVarValue(b, vn, nv);
                }
            });
            b.refresh();
            b.mesh.updateMatrixWorld(true);
            syncKeyframeFromBlock(b);
        }
        recordAction();
    // 枢轴不联动模式：更新 xpos/ypos/zpos 后换算 basepos 保持模型在世界空间中的位置不变
    } else if (!pivotLinkModel && activePick && activePick.w0 && activePick.Ainv && herModes.has('origin') && activePick.type === 'move' && !name.includes('basepos')) {
        for (const b of selectedBlocksSet) {
            // 真 molang 骨骼子块由上方统一处理（枢轴位移→xbasepos_bone + 几何 basepos 补偿），
            // 此处跳过避免重复写入。静态文件夹骨骼子块是纯分组，必须继续走本分支写 v.xpos。
            if (isBoneMolangDriven(b)) continue;
            // 1. 先更新枢轴变量 (xpos/ypos/zpos)
            const d = b.scope.vars.get(name);
            if (!d) continue;
            if (gizmoMolangGuard(b, name)) continue; // 禁止 Gizmo 覆盖 molang 表达式（标注方块）
            let nv = (parseFloat(d.expr) || d.value) + delta;
            const dec = (d.step.toString().includes('.') ? d.step.toString().split('.')[1].length : 0);
            nv = parseFloat(nv.toFixed(dragWriteDecimals(dec)));   // 拖拽期间保留更高精度（避免逐帧取整漂移）
            setConstVarValue(b, name, nv);

            // 2. 获取更新后的位置 pos_new
            const posNew = new THREE.Vector3(
                Number(b.scope.vars.get('v.xpos')?.value ?? 0),
                Number(b.scope.vars.get('v.ypos')?.value ?? 0),
                Number(b.scope.vars.get('v.zpos')?.value ?? 0)
            );

            // 3. 核心公式：basepos_new = 逐步逆变换(w₀ - pos_new)（逐因子求逆，避免近奇异矩阵整体求逆爆炸）
            const diff = activePick.w0.clone().sub(posNew);
            const baseNew = worldToBasepos(b, diff);

            // 4. 写回 xbasepos / ybasepos / zbasepos
            ['xbasepos','ybasepos','zbasepos'].forEach((axis, i) => {
                const bn = 'v.' + axis;
                const bd = b.scope.vars.get(bn);
                if (bd) {
                    if (gizmoMolangGuard(b, bn)) return; // 禁止 Gizmo 覆盖 molang 表达式（标注方块）
                    const val = baseNew.getComponent(i);
                    setConstVarValue(b, bn, val);
                }
            });

            b.refresh();
            b.mesh.updateMatrixWorld(true);
            syncKeyframeFromBlock(b);
        }
        recordAction();
    } else {
        // 第三个实参 = 来自 Gizmo 拖拽：scale / extend_scale 若被压到非正数，本帧增量作废
        applyBatchDelta(name, delta, true);
    }
    updateOriginCenterLineLive(selectedBlock);
    renderVariablesForBlock(selectedBlock);
    // 非拖拽时同步关键帧
    if (!draggingGizmo && selectedBlock) {
        syncKeyframeFromBlock(selectedBlock);
    }
    if (refresh && !draggingGizmo) {
        requestGizmoRefresh(); updateToolbar(true);
    } else {
        // rot 与 stretch 均实时刷新，拖拽中不重建 Gizmo（避免刷新覆盖 activePick.axis）
        const isLiveDrag = activePick && (activePick.type === 'rot' || activePick.type === 'stretch');
        const isRotDrag = activePick && activePick.type === 'rot';
        dragNeedsRebuild = !isLiveDrag;
        const now = performance.now();
        if (!isLiveDrag && activePick && now - lastDragRebuild > 16) {
            lastDragRebuild = now; requestGizmoRefresh(); updateToolbar(true);
            refreshActivePickMeta(lastPX, lastPY);
        }
    }
}

function setVarDirect(varName, value) {
    if (!selectedBlocksSet || !selectedBlocksSet.size || !Number.isFinite(value)) return;
    for (const b of selectedBlocksSet) {
        let def = b.scope.vars.get(varName);
        if (!def) {
            const rg = getDefaultRange(varName);
            b.scope.addVar(varName, '0', rg.min, rg.max, 1);
            def = b.scope.vars.get(varName);
        }
        if (def) {
            // 禁止 Gizmo 覆盖 molang 表达式（未开启 molang 全权控制时）：跳过并提示（标注方块）
            if (gizmoMolangGuard(b, varName)) continue;
            if (['v.xrot','v.yrot','v.zrot'].includes(varName)) value = normRotDeg(value);
            setConstVarValue(b, varName, value);
            b.mesh.updateMatrixWorld(true);
            syncKeyframeFromBlock(b);
        }
    }
    recordAction(); renderVariablesForBlock(selectedBlock);
    requestGizmoRefresh(); updateToolbar(true);
}

