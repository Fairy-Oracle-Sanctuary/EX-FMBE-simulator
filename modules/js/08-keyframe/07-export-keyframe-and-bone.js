/* 08-keyframe/07-export-keyframe-and-bone.js · 源 测试版v.6b79.html 第 46209-46986 行 */
'use strict';
// ==================== 导出关键帧 ====================
// 为方块生成关键帧命令文本（FMBE lerp 插值格式）
// 结构：用 q.anim_time 驱动每方块时间变量 v.<id>_time；所有属性共用一套全局
//   seg_time / dur / t（插值因子），每个动画变量只需各自的 start_<var> 和 T<var>。
//   每个关键帧时间点对应一个时间段，在该段内所有属性用同一套时间参数做 lerp 插值。
// 为方块生成关键帧命令文本（FMBE lerp 插值格式）
// 结构：用 q.anim_time 驱动每方块时间变量 v.<id>_time；所有属性共用一套全局
//   seg_time / dur / t（插值因子），每个动画变量只需各自的 start_<var> 和 T<var>。
//   每个关键帧时间点对应一个时间段，在该段内所有属性用同一套时间参数做 lerp 插值。
function getKeyframeCommandText(blockId, forMolangProgram) {
    const block = blocks.find(x => x.id === blockId);
    // ★ v2【2026-10-13】molang 编辑模式与关键帧彻底打通：不再这里 return null。
    //   方块在 molang 模式下的手写程序会被原样保留进编译产物（前段/后段），关键帧只注入时间块。
    // ★【2026-10-13】编译式关键帧：纯单方块 → 导出「编译产出的 molang 程序」，
    //   与运行时执行的完全同一份（关键帧算法不再单独承担导出效果，一切由 molang 跑）。
    if (block && kfCanUseCompiled(block) && keyframeData.has(blockId)) {
        const compiled = kfCompileProgram(blockId);
        if (compiled) {
            if (forMolangProgram) return compiled;
            return compiled + molangTag(`'anim:${getKeyframeAnimId(blockId)}';`) + molangTag(`'方块编号：${blockId}';`);
        }
    }
    // 骨骼文件夹关键帧：数据存在 boneKeyframes（以 folderName 为 key），不在 keyframeData 里。
    // 必须先处理这个分支，否则 hasKeyframeAnimation 即使识别到也会因 getKeyframeCommandText 返回 null 而漏导。
    if (block && !keyframeData.has(blockId) && boneKeyframes.size > 0) {
        let folderName = block.group;
        if (!folderName || !boneKeyframes.has(folderName) || boneKeyframes.get(folderName).frames.size === 0) {
            for (const [fn, entry] of boneKeyframes) {
                if (!entry || entry.frames.size === 0) continue;
                if (block.group === fn) { folderName = fn; break; }
                const f = getFolder(fn);
                if (f && f._backbone === blockId) { folderName = fn; break; }
                // 回退：帧状态包含该方块
                for (const [, frame] of entry.frames) { if (frame.has(blockId)) { folderName = fn; break; } }
                if (folderName === fn) break;
            }
        }
        if (folderName && boneKeyframes.has(folderName) && boneKeyframes.get(folderName).frames.size > 0) {
            // getBoneFolderKeyframeCommandText 内部读 block.group 定位关键帧；
            // 这里临时校正（用 try/finally 保证一定还原），让骨级关键帧导出在 group 错位时仍能命中正确数据。
            const origGroup = block.group;
            if (block.group !== folderName) block.group = folderName;
            try {
                return getBoneFolderKeyframeCommandText(block, forMolangProgram);
            } finally {
                block.group = origGroup;
            }
        }
    }
    if (!keyframeData.has(blockId)) return null;
    const data = keyframeData.get(blockId);
    const times = getKeyframeTimes(blockId);
    if (times.length === 0) return null;

    // 骨骼块：关键帧只导出「12 数据」中本块自驱动的部分（其余由骨骼指令的 molang 统一计算）
    //   子骨骼(_boneParent)：自旋转(3) + 相对父偏移(3)；根骨骼：世界坐标(3) + 旋转(3)。
    //   子骨骼的 xpos/ypos/zpos 是骨骼表达式计算结果，由导出时前置的「骨骼绑定指令」计算，故此处排除。
    const exportParents = resolveExportBoneParents();
    const isBoneChild = !!(block && (block._boneParent || exportParents.has(block.id)));
    const isBoneParent = !!(block && Array.from(exportParents.values()).includes(block.id));
    let coreOrder;
    if (isBoneChild && isBoneParent) {
        // 中间骨骼：位置由父公式每帧算，但自身旋转要驱动其子 → 只导出自旋转(3)，不导位置/偏移
        coreOrder = ['xrot','yrot','zrot'];
    } else if (isBoneParent) {
        // 根骨骼：世界坐标(3) + 旋转(3) —— 由关键帧驱动，即「骨骼的参数变量」的来源
        coreOrder = ['xpos','ypos','zpos','xrot','yrot','zrot'];
    } else if (isBoneChild) {
        // 【叶子子骨骼导出修复 2026-09-12】旧实现直接 return null（“位移由骨骼公式每帧算，不列关键帧”），
        // 但那是把【整块命令】退化为普通常量导出：紫色加号 ✛ 显式绑定的子骨骼上录的关键帧
        // （xrot/yrot/zrot 外观旋转、xbasepos_bone 相对偏移、scale/extend_*）在导出结果里全部丢失，
        // 导出的 FMBE 动画里子骨骼一动不动（用户报告）。
        // 现在与中间骨骼同策略：自身可驱动通道照常导出 lerp —— 通道集合与 getBoneInputConstantsString
        // （非关键帧路径）一致，并由下方 _BONE_CHILD_SELF_VARS 白名单做最终过滤。
        coreOrder = ['xrot','yrot','zrot'];
    } else {
        coreOrder = ['xpos','ypos','zpos','xrot','yrot','zrot','rotatex','rotatey','rotatez','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos'];
    }
    // 叶子子骨骼（xpos/ypos/zpos 由父公式每帧算）的导出白名单：只允许【自身可驱动通道】。
    // 其余变量要么由随后的 getBoneChildFollowString 公式计算（xpos/ypos/zpos、rotatex/y/z），
    // 要么是骨骼派生的 molang 中间量（parent_*、p_c*、pR00..22）或几何量（xbasepos/ybasepos/zbasepos），
    // 一律不能当关键帧常量导出，否则会与跟随公式抢同一个变量。
    // 用白名单（而非黑名单）可兜住 syncKeyframeFromBlock 等路径可能塞进帧里的派生量。
    const _BONE_CHILD_SELF_VARS = new Set(['xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos_bone','ybasepos_bone','zbasepos_bone','bone_rotx','bone_roty','bone_rotz']);

    // 收集所有"被动画"的变量（任一关键帧中出现过的）
    // 过滤掉关键帧 molang 程序自动创建的内部辅助变量（start_/T/seg_/dur_/seg_time/dur/t/<id>_time）
    const animatedSet = new Set();
    for (const t of times) for (const k of data.frames.get(t).keys()) {
        if (!isKeyframeInternalVar(k, blockId)) animatedSet.add(k);
    }
    const animatedVars = [];
    for (const n of coreOrder) if (animatedSet.has(n)) animatedVars.push(n);
    for (const k of animatedSet) if (!coreOrder.includes(k) && !animatedVars.includes(k)) animatedVars.push(k);
    // 叶子子骨骼：只保留自驱动通道白名单（见 _BONE_CHILD_SELF_VARS 注释）。
    // 过滤后若一帧可导变量都不剩（例如帧里只有跟随量），返回 null → 退回普通常量导出，
    // 与旧行为一致，绝不导出半截命令。
    if (isBoneChild && !isBoneParent) {
        for (let i = animatedVars.length - 1; i >= 0; i--) {
            if (!_BONE_CHILD_SELF_VARS.has(animatedVars[i])) animatedVars.splice(i, 1);
        }
    }
    if (animatedVars.length === 0) return null;

    const valAt = (t, name) => {
        const f = data.frames.get(t);
        if (f && f.has(name)) return f.get(name);
        // 骨骼子块偏移变量：旧/文件夹关键帧可能未记录，回退到相对偏移
        // （✛ 读已存值；文件夹映射子块从世界姿态反算），避免导出为 0 导致子块坍缩到父骨骼
        if (block) {
            const ebp = block._boneParent || exportParents.get(block.id);
            if (ebp && (name === 'xbasepos_bone' || name === 'ybasepos_bone' || name === 'zbasepos_bone')) {
                const parent = blocks.find(b => b.id === ebp);
                if (parent) {
                    const rel = computeRelativeTransform(block, parent);
                    if (name === 'xbasepos_bone') return rel.ox;
                    if (name === 'ybasepos_bone') return rel.oy;
                    return rel.oz;
                }
            }
        }
        return null;
    };
    const fmt = v => (typeof v === 'number' ? parseFloat(v.toFixed(6)) : v);
    // ★ extend_scale=0 → 0.0001（关键帧路径）。关键帧的每个输出点都伴随一个变量名（V / start_V / TV），
    //   用带名的格式化器收口，避免 lerp 端点落成 0 导致整段动画矩阵奇异。
    const fmtV = (name, v) => _isEsVar(name) ? parseFloat(_esNorm(v).toFixed(6)) : fmt(v);

    // 为每个动画变量计算在各关键帧时间点的值（向前回填：未设置则沿用上一个有值的关键帧）
    const valMatrix = {};
    for (const V of animatedVars) {
        valMatrix[V] = [];
        let lastVal = null;
        for (let i = 0; i < times.length; i++) {
            const v = valAt(times[i], V);
            if (v !== null) lastVal = v;
            valMatrix[V][i] = lastVal !== null ? lastVal : 0;
        }
    }

    // 标记常量变量（所有关键帧值相同 → 直接赋值，不参与 lerp）
    const constMap = {};
    for (const V of animatedVars) {
        constMap[V] = times.length <= 1 || valMatrix[V].every(v => Math.abs(v - valMatrix[V][0]) < 1e-9);
    }

    const timeVar = `v.${blockId}_time`;
    let out = `${timeVar}=q.anim_time;`;

    // 逐关键帧时间点生成时间段：所有属性共用 seg_time 和 dur
    // 条件使用范围检查（>=, <）而非精确相等（==），避免浮点动画时间无法命中关键帧时刻
    for (let i = 0; i < times.length; i++) {
        const t = times[i];
        const isLast = (i === times.length - 1);
        const nextT = isLast ? t : times[i + 1];
        const dur = isLast ? 0.0001 : Math.max(nextT - t, 0.0001);

        const parts = [];
        // 共享时间参数
        parts.push(`v.seg_time=${fmt(t)};v.dur=${fmt(dur)};`);
        // 仅输出非常量变量的 start_/T_（常量变量在末尾直接赋值，不参与 lerp）
        for (const V of animatedVars) {
            if (constMap[V]) continue; // 常量变量跳过
            const startVal = valMatrix[V][i];
            const targetVal = isLast ? startVal : valMatrix[V][i + 1];
            parts.push(`v.start_${V}=${fmtV('start_' + V, startVal)};v.T${V}=${fmtV('T' + V, targetVal)};`);
        }

        // 范围条件：首帧覆盖 [0, next)，中间帧覆盖 [t, next)，末帧覆盖 [t, ∞)
        let cond;
        const tFmt = parseFloat(t.toFixed(3));
        if (times.length === 1) {
            cond = `${timeVar}>=0`;
        } else if (i === 0) {
            cond = `${timeVar}<${parseFloat(times[1].toFixed(3))}`;
        } else if (isLast) {
            cond = `${timeVar}>=${tFmt}`;
        } else {
            cond = `${timeVar}>=${tFmt}&&${timeVar}<${parseFloat(nextT.toFixed(3))}`;
        }
        out += `${cond}?(${parts.join('')});`;
    }

    // 共享插值因子：仅当存在非常量变量时才需要
    const hasAnimVars = animatedVars.some(V => !constMap[V]);
    if (hasAnimVars) {
        out += `v.t=math.max(0,math.min((${timeVar}-v.seg_time)/v.dur,1));`;
    }
    // 常量变量直接赋值，非常量变量用共享 t 做 lerp 插值
    for (const V of animatedVars) {
        if (constMap[V]) {
            out += `v.${V}=${fmtV(V, valMatrix[V][0])};`;
        } else {
            // ★ 多圈角度（2026-09-12）：任一关键帧记录值超出 ±180°（如 0→-517 整圈转体）时，
            //   改用 math.lerp 字面插值 —— math.lerprotate 的最短弧会把目标坍缩回 ±180° 内等效姿态，
            //   模型永远只在一个圆内旋转。与引擎端 _kfAngleLerp 保持同一判定。
            const _angShortest = _kfIsAngleVar(V) && !_kfAngleNeedsLiteral(valMatrix[V]);
            out += `v.${V}=${_angShortest ? 'math.lerprotate' : 'math.lerp'}(v.start_${V},v.T${V},v.t);`;
        }
    }

    // 中间骨骼（有父也有子）：位置由父公式每帧算（（有）（是）→ 接收父骨骼变量并计算），
    // 必须在此处算出 v.xpos 后再发布 t.<id>_px，否则导出的中间骨骼命令从不写 v.xpos，
    // 游戏里子骨干位置悬空/坍缩到 0，孙级全部围着原点公转（导出缺跟随公式的 bug）。
    // 偏移若已被关键帧动画驱动则不重写（skipOffsets），保留关节位移动画。
    const _kfChildPid = isBoneChild ? (block._boneParent || exportParents.get(block.id)) : null;
    // ★【2026-09-12 修复】跟随公式对【导出】与【模拟器内 molang 程序】都要追加。
    //   旧条件 !forMolangProgram 导致：molang 接管 + 关键帧时 scope.program 被整段替换为关键帧脚本，
    //   v.xpos = t.父_px + pR·xbasepos_bone 从程序里消失。而 recompute() 的 molang 分支【只提交程序
    //   内的赋值】，不存在的 v.xpos 保持旧值冻结 → 子骨骼 pos 不生效、basepos_bone 关键帧赋了值
    //   也无人消费（用户报：子骨骼 basepos/pos 关键帧全不生效，脚本里看不到 pos 赋值）。
    //   在程序末尾（lerp 赋值之后）每帧重算 v.xpos/ypos/zpos 与 rotatex 跟随即可修复；
    //   skipOffsets 保证动画中的 xbasepos_bone 不被静态偏移覆盖。
    if (_kfChildPid) {
        const _kfPar = blocks.find(b => b.id === _kfChildPid);
        if (_kfPar) {
            const _offsAnim = animatedVars.some(V => V === 'xbasepos_bone' || V === 'ybasepos_bone' || V === 'zbasepos_bone');
            const _ownAnim = animatedVars.some(V => V.startsWith('own_bone_rot'));
            out += ' ' + getBoneChildFollowString(block, _kfPar, { skipOffsets: _offsAnim, noOwn: !_ownAnim });
        }
    }

    // 骨骼父块：在算完本帧 v.xpos/v.xrot 等动画值之后，立即发布 t.<id>_* 全局变量，
    // 供子块指令（getBoneChildPositionString 读 t.<id>_px/_xrot 等）引用。
    // 否则关键帧路径（patchedGetCommandTextForBlock 直接返回 getKeyframeCommandText）会绕过
    // originalGetCommandTextForBlock 里的 isBoneParentBlock→getBonePublishGlobalsString，
    // 导致父骨骼从不定义 t.<id>_*，子块命令里全部未定义 → 整条指令无效（用户报的严重 bug）。
    // ★【三处一致铁律 2026-09-30】forMolangProgram（= molang 编辑器 program）也必须带上这段广播：
    //   此前刻意只在导出时附加，导致「实时/导出有、编辑器看不到」→ 三处不一致（用户报）。
    //   解释器早已支持 t.<name>=(解析处 ~5400，运行期写 env.t 并同步 globalVars)，故写入 program 无副作用。
    if (isBoneParent) {
        out += ' ' + getBonePublishGlobalsString(block);
    }

    // forMolangProgram=true 时省略 'anim:...'/'方块编号:...' 标签，仅保留纯 molang 脚本
    if (!forMolangProgram) {
        out += molangTag(`'anim:${getKeyframeAnimId(blockId)}';`) + molangTag(`'方块编号：${blockId}';`);
    }
    return out;
}

// 骨骼文件夹关键帧导出：boneKeyframes 以 folderName 为 key，根块需要导出带 lerp 的关键帧动画，
// 并发布 t.<id>_px/_xrot 等全局供子块引用。子块位置由父公式每帧计算，此处返回 null。
function getBoneFolderKeyframeCommandText(block, forMolangProgram) {
    const blockId = block.id;
    const folderName = block.group;
    const entry = boneKeyframes.get(folderName);
    if (!entry || entry.frames.size === 0) return null;

    const exportParents = resolveExportBoneParents();
    const isBoneChild = !!(block._boneParent || exportParents.has(block.id));
    const isBoneParent = Array.from(exportParents.values()).includes(block.id);

    // 叶子子骨骼通常世界坐标由父块公式计算（不导关键帧），但若本块自身在骨级关键帧里
    // 存在“变化”的变量（如骨骼根虽无子块、但其旋转/位置却被关键帧驱动），仍须导出缓动，
    // 否则该骨骼自己的关键帧动画在导出指令里整段丢失。具体判定见下方 _leafHasAnim。

    // 根/中间骨骼：驱动自身世界坐标 + 旋转
    const coreOrder = ['xpos','ypos','zpos','xrot','yrot','zrot'];

    const times = Array.from(entry.frames.keys()).sort((a, b) => a - b);
    const fmt = v => (typeof v === 'number' ? parseFloat(v.toFixed(6)) : v);
    // ★ extend_scale=0 → 0.0001（关键帧路径）。关键帧的每个输出点都伴随一个变量名（V / start_V / TV），
    //   用带名的格式化器收口，避免 lerp 端点落成 0 导致整段动画矩阵奇异。
    const fmtV = (name, v) => _isEsVar(name) ? parseFloat(_esNorm(v).toFixed(6)) : fmt(v);

    // 收集该方块在骨骼关键帧中出现过的动画变量（去掉 v. 前缀）
    const animatedSet = new Set();
    for (const t of times) {
        const frame = entry.frames.get(t);
        const state = frame.get(blockId);
        if (!state || !state.vars) continue;
        for (const k of Object.keys(state.vars)) {
            const short = k.startsWith('v.') ? k.slice(2) : k;
            if (!isKeyframeInternalVar(short, blockId)) animatedSet.add(short);
        }
    }
    const animatedVars = [];
    for (const n of coreOrder) if (animatedSet.has(n)) animatedVars.push(n);
    for (const k of animatedSet) if (!coreOrder.includes(k)) animatedVars.push(k);
    if (animatedVars.length === 0) return null;

    const valAt = (t, name) => {
        const frame = entry.frames.get(t);
        if (!frame) return null;
        const state = frame.get(blockId);
        if (!state || !state.vars) return null;
        const fullName = name.startsWith('v.') ? name : 'v.' + name;
        const v = state.vars[fullName];
        return v !== undefined && v !== null ? v : null;
    };

    const valMatrix = {};
    for (const V of animatedVars) {
        valMatrix[V] = [];
        let lastVal = null;
        for (let i = 0; i < times.length; i++) {
            const v = valAt(times[i], V);
            if (v !== null) lastVal = v;
            valMatrix[V][i] = lastVal !== null ? lastVal : 0;
        }
    }

    const constMap = {};
    for (const V of animatedVars) {
        constMap[V] = times.length <= 1 || valMatrix[V].every(v => Math.abs(v - valMatrix[V][0]) < 1e-9);
    }

    // 叶子子骨骼：若本块在骨级关键帧中没有任何“变化”的动画变量（纯跟随父骨骼），
    // 世界坐标由父公式每帧计算 → 不导关键帧，避免冗余常量指令。
    // 若本块自身被关键帧驱动（骨骼根虽无子块，但旋转/位置被录制），则继续导出缓动。
    const _leafHasAnim = animatedVars.some(V => !constMap[V]);
    if (isBoneChild && !isBoneParent && !_leafHasAnim) return null;

    const timeVar = `v.${blockId}_time`;
    let out = `${timeVar}=q.anim_time;`;

    for (let i = 0; i < times.length; i++) {
        const t = times[i];
        const isLast = (i === times.length - 1);
        const nextT = isLast ? t : times[i + 1];
        const dur = isLast ? 0.0001 : Math.max(nextT - t, 0.0001);

        const parts = [];
        parts.push(`v.seg_time=${fmt(t)};v.dur=${fmt(dur)};`);
        for (const V of animatedVars) {
            if (constMap[V]) continue;
            const startVal = valMatrix[V][i];
            const targetVal = isLast ? startVal : valMatrix[V][i + 1];
            parts.push(`v.start_${V}=${fmtV('start_' + V, startVal)};v.T${V}=${fmtV('T' + V, targetVal)};`);
        }

        let cond;
        const tFmt = parseFloat(t.toFixed(3));
        if (times.length === 1) {
            cond = `${timeVar}>=0`;
        } else if (i === 0) {
            cond = `${timeVar}<${parseFloat(times[1].toFixed(3))}`;
        } else if (isLast) {
            cond = `${timeVar}>=${tFmt}`;
        } else {
            cond = `${timeVar}>=${tFmt}&&${timeVar}<${parseFloat(nextT.toFixed(3))}`;
        }
        out += `${cond}?(${parts.join('')});`;
    }

    const hasAnimVars = animatedVars.some(V => !constMap[V]);
    if (hasAnimVars) {
        out += `v.t=math.max(0,math.min((${timeVar}-v.seg_time)/v.dur,1));`;
    }
    for (const V of animatedVars) {
        if (constMap[V]) {
            out += `v.${V}=${fmtV(V, valMatrix[V][0])};`;
        } else {
            // ★ 多圈角度（2026-09-12）：任一关键帧记录值超出 ±180°（如 0→-517 整圈转体）时，
            //   改用 math.lerp 字面插值 —— math.lerprotate 的最短弧会把目标坍缩回 ±180° 内等效姿态，
            //   模型永远只在一个圆内旋转。与引擎端 _kfAngleLerp 保持同一判定。
            const _angShortest = _kfIsAngleVar(V) && !_kfAngleNeedsLiteral(valMatrix[V]);
            out += `v.${V}=${_angShortest ? 'math.lerprotate' : 'math.lerp'}(v.start_${V},v.T${V},v.t);`;
        }
    }

    // 中间骨骼（有父也有子）：追加「跟随父块」的位置/旋转计算（与用户参考格式一致），
    // 必须在此处算出 v.xpos 后再发布 t.<id>_px，否则中间骨骼命令从不写 v.xpos，
    // 游戏里子骨干位置悬空、孙级围着原点公转。偏移若已被关键帧动画驱动则不重写。
    const _kfChildPid = isBoneChild ? (block._boneParent || exportParents.get(block.id)) : null;
    // ★【2026-09-12 修复】与 getKeyframeCommandText 同步：molang 程序（forMolangProgram=true）也必须
    //   每帧计算 v.xpos 跟随 —— molang 接管后未写进程序的 v.xpos 不再被引擎求值，会冻结在旧值。
    if (_kfChildPid) {
        const _kfPar = blocks.find(b => b.id === _kfChildPid);
        if (_kfPar) {
            const _offsAnim = animatedVars.some(V => V === 'xbasepos_bone' || V === 'ybasepos_bone' || V === 'zbasepos_bone');
            const _ownAnim = animatedVars.some(V => V.startsWith('own_bone_rot'));
            out += ' ' + getBoneChildFollowString(block, _kfPar, { skipOffsets: _offsAnim, noOwn: !_ownAnim });
        }
    }

    // 骨骼父块：发布 t.<id>_* 全局供子块引用
    // ★【三处一致】molang program（forMolangProgram=true）也要带，与 getKeyframeCommandText 同步。
    if (isBoneParent) {
        out += ' ' + getBonePublishGlobalsString(block);
    }

    if (!forMolangProgram) {
        out += molangTag(`'anim:${getKeyframeAnimId(blockId)}';`) + molangTag(`'方块编号：${blockId}';`);
    }
    return out;
}

// 修改导出 - 如果方块有关键帧动画，使用关键帧格式输出
const originalGetCommandTextForBlock = getCommandTextForBlock;
function patchedGetCommandTextForBlock(block) {
    if (hasKeyframeAnimation(block.id)) {
        const kfText = getKeyframeCommandText(block.id);
        if (kfText) {
            // 关键帧文本已包含'方块编号'标记与骨骼发布全局（getBoneFolderKeyframeCommandText 内追加），
            // 但仍需补齐材质 / 分组 / 父骨骼 / 骨骼标签——此前漏掉导致导出指令里没有 'group:bone' 等元数据。
            const blockIdPrefix = getMaterialTag(block);
            const groupPrefix = block.group ? molangTag(`'group:${block.group}';`) : '';
            const parentBonePrefix = getParentBonePrefix(block);
            const boneTag = getBoneTagForBlock(block);
            // ★★引号配对（2026-10-01）：载荷必须以 " 开头、以 " 收尾，中间才是 molang。
            //   前缀若自带起始 " 就直接用，否则补一个；后缀固定以 " 收口（effectiveExportSuffix 已保证）。
            // ★【双倍后缀去重 2026-10-18】kfText 在 !forMolangProgram 时末尾已自带 'anim:...'; + '方块编号：<id>';，
            //   故此处调用 effectiveExportSuffix 必须传 skipIdTag=true，否则同一条指令会出现两份「方块编号」标签
            //   （用户报：部分（= 带关键帧的）方块导出指令后缀双倍）。
            const hasOpenQuote = exportPrefix.trimEnd().endsWith('"');
            const suffixEnd = effectiveExportSuffix(exportSuffix, true);
            return (hasOpenQuote ? exportPrefix : exportPrefix + ' "') + blockIdPrefix + groupPrefix + parentBonePrefix + boneTag + kfText + suffixEnd;
        }
    }
    return originalGetCommandTextForBlock(block);
}
// 替换导出函数
getCommandTextForBlock = patchedGetCommandTextForBlock;

// ==================== 导出用"文件夹层级 → molang 骨骼"映射 ====================
// 用户用文件夹层级做骨骼动画（无需手动 ✛ 绑定）时，导出也应生成 molang 骨骼指令。
// 规则：每个文件夹取"第一个直接方块"作为该骨骼的根（发布 t.*），同文件夹其余直接方块、以及
// 子文件夹的根方块，都以它（或向上递归到父文件夹的根）为 molang 父。✛ 真骨骼(_boneParent)优先覆盖。
function resolveExportBoneParents() {
    const parents = new Map(); // childId -> parentId（仅导出视图，不改模型）
    const folderNames = folders.map(f => f.name);
    const childFolders = new Map(); // parentName -> [childName]
    folders.forEach(f => {
        if (f.parentName && folderNames.includes(f.parentName)) {
            if (!childFolders.has(f.parentName)) childFolders.set(f.parentName, []);
            childFolders.get(f.parentName).push(f.name);
        }
    });
    const directCubes = new Map(); // folderName -> [blockId]
    blocks.forEach(b => {
        if (b.group && folderNames.includes(b.group)) {
            if (!directCubes.has(b.group)) directCubes.set(b.group, []);
            directCubes.get(b.group).push(b.id);
        }
    });
    const rootCache = new Map();
    function rootOf(fn) {
        if (rootCache.has(fn)) return rootCache.get(fn);
        const cubes = directCubes.get(fn) || [];
        let r = cubes.length ? cubes[0] : null;
        if (!r) {
            const kids = childFolders.get(fn) || [];
            for (const k of kids) { r = rootOf(k); if (r) break; }
        }
        rootCache.set(fn, r);
        return r;
    }
    function process(fn) {
        const r = rootOf(fn);
        const kids = childFolders.get(fn) || [];
        for (const k of kids) {
            const kr = rootOf(k);
            if (kr && kr !== r && !parents.has(kr)) parents.set(kr, r);
            process(k);
        }
        const cubes = directCubes.get(fn) || [];
        for (let i = 1; i < cubes.length; i++) {
            const c = cubes[i];
            if (!parents.has(c)) parents.set(c, r);
        }
    }
    folderNames.forEach(fn => { const f = getFolder(fn); if (f && !f.parentName) process(fn); });
    // ✛ 真骨骼优先覆盖
    blocks.forEach(b => { if (b._boneParent) parents.set(b.id, b._boneParent); });
    // 过滤无效父（父不是存在的方块）
    for (const [c, p] of [...parents]) { if (!blocks.some(x => x.id === p)) parents.delete(c); }
    return parents;
}
function getExportBoneParentId(block) {
    if (!block) return null;
    if (block._boneParent) return block._boneParent;
    return resolveExportBoneParents().get(block.id) || null;
}
// 计算子块相对父的变换：✛ 子块直接读已存相对值；文件夹映射子块从世界姿态反算。
function computeRelativeTransform(child, parent) {
    if (child && child._boneParent) {
        return {
            ox: vnum(child, 'v.xbasepos_bone'), oy: vnum(child, 'v.ybasepos_bone'), oz: vnum(child, 'v.zbasepos_bone'),
            rx: vnum(child, 'v.xrot'), ry: vnum(child, 'v.yrot'), rz: vnum(child, 'v.zrot')
        };
    }
    const cw = blockWorldPos(child);
    const pw = blockWorldPos(parent);
    // ★ 父旋转源 = v.rotatex/y/z（用户算法规范：xrot/yrot/zrot 是外观旋转，不参与骨骼链）
    const prx = vnum(parent, 'v.rotatex');
    const pry = vnum(parent, 'v.rotatey');
    const prz = vnum(parent, 'v.rotatez');
    const RpInv = boneParentMatrix(prx, pry, prz).clone().invert();
    const off = new THREE.Vector3().subVectors(cw, pw).applyMatrix3(RpInv);
    const crx = vnum(child, 'v.xrot'), cry = vnum(child, 'v.yrot'), crz = vnum(child, 'v.zrot');
    // 相对旋转用欧拉差（子世界旋转 − 父世界旋转）。刚体骨骼下子的 xrot 关键帧即世界旋转，
    // 导出后随父旋转一起变化，无需逐帧减父；与 FMBE 骨骼角度线性语义一致。
    return { ox: off.x, oy: off.y, oz: off.z, rx: crx - prx, ry: cry - pry, rz: crz - prz };
}

// ==================== 骨骼绑定指令（单独导出，置于最前） ====================
// 把整条骨骼的「长骨骼计算 molang」汇总成一条独立指令：为每个子骨骼发布父骨骼的
// t.<父>_* 全局变量（引用父块自身的 v.*），并由 pR 旋转矩阵把子骨骼「相对父偏移」
// 刚体旋转后加到父骨骼世界坐标上 → 得到子骨骼世界坐标。这与 bindBone 生成的 molang 同构，
// 满足用户要求的「骨骼 molang 单独写成一个指令」「FMBE 动画叠加」「默认排在最前面」。
function getBoneBindCommandText() {
    const parents = resolveExportBoneParents();
    if (parents.size === 0) return null;
    // 按父块分组：每个父块的「t.* 全局 + pR 旋转矩阵」只声明一次，
    // 其下每个子块仅输出「相对父偏移（骨骼参数）+ 世界坐标计算」——即一条紧凑的
    // 骨骼 molang 计算式，在游戏里每帧持续计算子块位移（FMBE 动画叠加，置于导出最前）。
    const childrenByParent = new Map();
    for (const [childId, parentId] of parents) {
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(childId);
    }
    const parts = [];
    for (const [parentId, childIds] of childrenByParent) {
        const parent = blocks.find(b => b.id === parentId);
        if (!parent) continue;
        const p = boneSafeId(parentId);
        // ① 父骨骼全局变量（引用父块自身的 v.* —— 由关键帧指令动画驱动）。每父只声明一次。
        parts.push(`t.${p}_xrot=v.xrot; t.${p}_yrot=v.yrot; t.${p}_zrot=v.zrot; t.${p}_px=v.xpos; t.${p}_py=v.ypos; t.${p}_pz=v.zpos;`);
        // ② 父旋转 → 旋转矩阵 pR（math.cos/sin 吃角度，与引擎一致）。每父只算一次。
        parts.push(`v.parent_xrot=t.${p}_xrot; v.parent_yrot=t.${p}_yrot; v.parent_zrot=t.${p}_zrot;`);
        parts.push(`v.p_cx=math.cos(v.parent_xrot); v.p_sx=math.sin(v.parent_xrot); v.p_cy=math.cos(v.parent_yrot); v.p_sy=math.sin(v.parent_yrot); v.p_cz=math.cos(v.parent_zrot); v.p_sz=math.sin(v.parent_zrot);`);
        parts.push(`v.pR00=v.p_cy*v.p_cz+v.p_sy*v.p_sx*v.p_sz; v.pR01=v.p_cy*v.p_sz-v.p_sy*v.p_sx*v.p_cz; v.pR02=-v.p_sy*v.p_cx; v.pR10=-v.p_cx*v.p_sz; v.pR11=v.p_cx*v.p_cz; v.pR12=-v.p_sx; v.pR20=v.p_sy*v.p_cz-v.p_cy*v.p_sx*v.p_sz; v.pR21=v.p_sy*v.p_sz+v.p_cy*v.p_sx*v.p_cz; v.pR22=v.p_cy*v.p_cx;`);
        // ③ 每个子块：仅其相对父偏移（骨骼参数）+ 世界坐标（复用上面已算的 pR）
        for (const childId of childIds) {
            const child = blocks.find(b => b.id === childId);
            if (!child) continue;
            const rel = computeRelativeTransform(child, parent);
            parts.push(`v.xbasepos_bone=${_r4(rel.ox)}; v.ybasepos_bone=${_r4(rel.oy)}; v.zbasepos_bone=${_r4(rel.oz)};`);
            parts.push(`v.xpos=t.${p}_px+v.pR00*v.xbasepos_bone+v.pR01*v.ybasepos_bone+v.pR02*v.zbasepos_bone; v.ypos=t.${p}_py+v.pR10*v.xbasepos_bone+v.pR11*v.ybasepos_bone+v.pR12*v.zbasepos_bone; v.zpos=t.${p}_pz+v.pR20*v.xbasepos_bone+v.pR21*v.ybasepos_bone+v.pR22*v.zbasepos_bone;`);
        }
    }
    return parts.join('');
}
// 包装成带前缀/后缀的完整指令（{id} 用「骨骼」占位），置于导出最前
// 注：骨骼导出已改为「每块独立命令 + 父矩阵存全局」（见 getBoneChildPositionString /
// getBonePublishGlobalsString / getBoneOrderedBlocks），不再需要这条独立的巨命令。
// 保留函数返回 null，避免影响既有引用（导出装配处已改为按骨骼深度排序的逐块命令）。
function getBoneBindInstruction() { return null; }
// 骨骼子块静态导出：只输出本块自驱动的输入（自身旋转 + 缩放等）。
// 相对父偏移(xbasepos_bone 等)已由 getBoneChildPositionString 用 molang 统一计算（骨骼参数只活在公式里），
// 世界坐标也交由该公式每帧计算，故此处既不导偏移也不导位置，避免与公式抢 v.xpos。
// 按用户指定的合法格式，子块【不输出 rotatex/y/z】：骨骼旋转源在父的 xrot（t.<父>_xrot），
// 子块朝向由其 xrot 决定；如需子块刚体跟随父旋转，可在游戏里用 v.rotatex=t.<父>_xrot 自行叠加。
function getBoneInputConstantsString(block) {
    const isFolderBone = !!(block && !block._boneParent && getExportBoneParentId(block));
    const boneParentId = block._boneParent ? block._boneParent : (isFolderBone ? getExportBoneParentId(block) : null);
    const parent = (boneParentId) ? blocks.find(b => b.id === boneParentId) : null;
    const rel = (isFolderBone && parent) ? computeRelativeTransform(block, parent) : null;
    // ★ 几何 basepos（xbasepos/ybasepos/zbasepos）= 方块网格相对【自身枢轴】的局部偏移，由 computeTransformMatrix 的
    //   localMat(matB) 自动挂在枢轴上。骨骼只接管枢轴位置(xpos = 父 + pR·xbasepos_bone)，并不接管 basepos；basepos 是独立的
    //   网格偏移，必须随指令导出，否则子块网格会被错误拉回枢轴原点（用户报：紫色加号显式骨绑定的方块导出后 basepos 完全丢失）。
    //   basepos 与父旋转无关，永远取本块自身值（不做文件夹相对旋转换算）。
    const names = ['xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos'];
    // 局部轴绑定：basepos 由跟随公式 v.xbasepos=t.<父>_bx + 偏移 生成，不能再输出常量覆盖
    const _baseposDriven = !!boneParentId && getBoneMode(block) === 'basepos' && isBaseposDrivenBlock(block);
    const stmts = [];
    for (const n of names) {
        if (_baseposDriven && (n === 'xbasepos' || n === 'ybasepos' || n === 'zbasepos')) continue;
        if (!block.scope.vars.has(`v.${n}`)) continue;
        let val;
        // 文件夹映射子块：xrot/yrot/zrot 用相对旋转（世界旋转 − 父旋转），否则会带父旋转导致翻倍
        if (isFolderBone && rel && (n === 'xrot' || n === 'yrot' || n === 'zrot')) val = rel[n === 'xrot' ? 'rx' : n === 'yrot' ? 'ry' : 'rz'];
        else val = vnum(block, `v.${n}`);
        // ★ extend_scale=0 → 0.0001（同 getConstantAssignmentsString，避免导出后矩阵奇异）
        stmts.push(`v.${n}=${_fv(n, _r4(val))};`);
    }
    // ★ 追加用户自定义变量（v.xxx 凡非骨骼内部量）：骨子块若只走固定 names 列表，自定义变量会被整条丢弃，
    //   重导入后「变量不存在」（用户报：紫色加号骨绑定的方块导出后变量也丢失）。这里与 getConstantAssignmentsString
    //   的兜底循环同口径，过滤掉骨骼 molang 内部辅助量后全部以当前值常量导出。
    const seenNames = new Set(names.map(n => 'v.' + n));
    for (const [name, def] of block.scope.vars) {
        if (!name.startsWith('v.')) continue;
        if (seenNames.has(name)) continue;
        const short = name.slice(2);
        // 骨骼 molang 内部辅助量：由导出端重新计算，不应污染导出
        if (short.startsWith('pR') || short.startsWith('p_') || short.startsWith('parent_') || short.startsWith('own_bone_rot')) continue;
        if (short === 'xbasepos_bone' || short === 'ybasepos_bone' || short === 'zbasepos_bone') continue;
        // 枢轴位置(xpos/ypos/zpos)与旋转跟随(rotatex/y/z)由下方跟随公式(t.父_px / pR·xbasepos_bone / t.父_*rot)生成，不在此重复
        if (name === 'v.xpos' || name === 'v.ypos' || name === 'v.zpos') continue;
        if (name === 'v.rotatex' || name === 'v.rotatey' || name === 'v.rotatez') continue;
        // 关键帧内部变量不导出
        if (typeof isKeyframeInternalVar === 'function' && isKeyframeInternalVar(short, block.id)) continue;
        stmts.push(`${name}=${_fv(short, _r4(vnum(block, name)))};`);
    }
    return stmts.join(' ');
}

// ==================== 骨骼导出：每块独立命令 + 父矩阵存全局 ====================
// 取代原先「一条巨命令塞进全部父子」的做法：
//  · 父块命令里发布自己的 t.<id>_* 全局（旋转/位置）+ 把旋转矩阵 9 元存成 t.<id>_pR00..22（每父只算一次三角函数）
//  · 子块命令里直接引用父的 t.<id>_pR* 与自身相对父偏移，做 3 行乘加得到世界坐标（不再每块重算三角函数）
// 这样每条命令都很短，且 t.* 全局在 FMBE 模拟器里跨块共享（globalVars 单 Map，见 6329 行解析）。

// 本块是否为骨骼父块（导出骨骼树里是某块的父）
function isBoneParentBlock(block) {
    const parents = resolveExportBoneParents();
    for (const [, p] of parents) if (p === block.id) return true;
    return false;
}
// 父块发布的全局 molang（每父一条）：父的【世界位置】(px/py/pz) + 父的【骨骼旋转源】(xrot 源）。
// ★ 旋转源只用 v.rotatex/y/z；v.xrot/yrot/zrot 是方块自身外观旋转，不参与骨骼链。
//   若把外观旋转也发出去，父的 xrot 会被子块叠加 → 子骨骼自旋；中继根的孙级同理：
//   孙块收到的 t.父_xrot = 父.rotatex，父.rotatex = 父的父.rotatex + 父.own，已经是骨骼链总旋转。
function getBonePublishGlobalsString(block, opts) {
    const id = boneSafeId(block.id);
    // 点号语法 t.<id>_xxx（FMBE 合法 molang，数字 id 已加 "b" 前缀），不使用 t['...'] 括号形式
    let s = '';
    // 局部轴绑定的子块不读父枢轴：仅当仍有读 px/py/pz 的子块（枢轴模式或局部轴虚拟枢轴）时发布父枢轴全局
    const _posUsed = hasPivotBoneChild(block) || hasBaseposBoneChild(block) || globalVars.has(`${id}_px`);
    if (_posUsed && (!opts || !opts.skipPos)) {
        s += `t.${id}_px=v.xpos; t.${id}_py=v.ypos; t.${id}_pz=v.zpos;`;
    }
    s += ` t.${id}_xrot=v.rotatex; t.${id}_yrot=v.rotatey; t.${id}_zrot=v.rotatez;`;
    // 局部轴绑定的子块读父 basepos（t.<父>_bx/by/bz），仅在该父确有此类子块时发布
    if (hasBaseposBoneChild(block)) {
        s += ` t.${id}_bx=v.xbasepos; t.${id}_by=v.ybasepos; t.${id}_bz=v.zbasepos;`;
    }
    // ★ 局部轴模式块作为父级：额外广播【视觉偏移锚点】t.<id>_ux/uy/uz = p_u，
    //   枢轴模式子块写 pos = t.<id>_px + pR·(bone + u)，等价于「父视觉中心 + pR·bone」。
    //   只发 t.<id>_px 会让挂在局部轴中继骨骼下的整棵子树整体偏移（用户问题 1）。
    if (hasPivotBoneChild(block) && boneAnchorSuffix(block) === 'u') {
        s += ` t.${id}_ux=v.p_u0; t.${id}_uy=v.p_u1; t.${id}_uz=v.p_u2;`;
    }
    return s;
}
// 子块跟随父块的位置计算：读父全局位置与旋转源，在子块指令内本地构建 pR 旋转矩阵，
// 世界坐标 = 父世界位置 + pR(父xrot)·相对父偏移（与用户指定的合法 molang 格式完全一致）。
// opts.skipOffsets=true：不重写 v.xbasepos_bone（该偏移已由关键帧动画 lerp 驱动，避免覆盖关节位移动画）。
function getBoneChildPositionString(child, parent, opts) {
    const p = boneSafeId(parent.id);
    // ★【2026-10-24 r23】纯枢轴吸附（basepos 新语义）：只输出枢轴跟随，不重写 basepos、不接父旋转。
    //   basepos 是用户自己的常量（绑定瞬间已反算好），导出时按普通变量原样输出。
    if (isPureSnapBone(child)) {
        return `v.xpos=t.${p}_px; v.ypos=t.${p}_py; v.zpos=t.${p}_pz;`;
    }
    const rel = computeRelativeTransform(child, parent);
    const offs = (opts && opts.skipOffsets)
        ? ''
        : `v.xbasepos_bone=${_r4(rel.ox)}; v.ybasepos_bone=${_r4(rel.oy)}; v.zbasepos_bone=${_r4(rel.oz)};`;
    // 局部轴绑定：位移全部走 basepos —— basepos = 父 basepos + 偏移；pos 不参与计算，
    // 枢轴为【虚拟枢轴】= 父骨骼枢轴（直接读父 pos 数值）。
    if (getBoneMode(child) === 'basepos') {
        const _a0 = boneBaseposA0Of(child);
        if (_a0) {
            // ★ 实时反解导出（2026-10-21）：与模拟器写入 scope 的表达式【同一套字符串】，
            //   basepos(t) = A子(t)⁻¹·A0·(父basepos + bone) ⇒ 模拟器所见 = 导出所得。
            //   p_ 前缀辅助量按依赖顺序逐条赋值（导出语句顺序执行，父全局 t.<父>_b* 每帧实时取值）。
            const out = boneBaseposOutputExprs(child, parent);
            let s = offs;
            for (const [n, e] of boneBaseposChainVars(child, parent, _a0)) s += ` ${n}=${e};`;
            s += ` v.xbasepos=${out.x}; v.ybasepos=${out.y}; v.zbasepos=${out.z};`;
            s += ` v.xpos=t.${p}_px; v.ypos=t.${p}_py; v.zpos=t.${p}_pz;`;
            return s;
        }
        // ★【2026-10-24】新 basepos 绑定 = 纯枢轴吸附（在 getBoneChildPositionString 开头已单独返回，
        //   只输出 t.<父>_p*）；这里只剩两种旧存档：有 A0 的实时反解链、无 A0 的线性跟随链。
        if (!isBaseposDrivenBlock(child)) {
            // 既无 A0 也不跟随父 basepos：理论不可达，落到下方公共 pR 分支兜底
        } else {
            return offs
                + ` v.xbasepos=t.${p}_bx + v.xbasepos_bone;`
                + ` v.ybasepos=t.${p}_by + v.ybasepos_bone;`
                + ` v.zbasepos=t.${p}_bz + v.zbasepos_bone;`
                + ` v.xpos=t.${p}_px; v.ypos=t.${p}_py; v.zpos=t.${p}_pz;`;
        }
    }
    return offs
        + ` v.parent_xrot=t.${p}_xrot; v.parent_yrot=t.${p}_yrot; v.parent_zrot=t.${p}_zrot;`
        + ` v.p_cx=math.cos(v.parent_xrot); v.p_sx=math.sin(v.parent_xrot); v.p_cy=math.cos(v.parent_yrot); v.p_sy=math.sin(v.parent_yrot); v.p_cz=math.cos(v.parent_zrot); v.p_sz=math.sin(v.parent_zrot);`
        + ` v.pR00=v.p_cy*v.p_cz+v.p_sy*v.p_sx*v.p_sz; v.pR01=v.p_cy*v.p_sz-v.p_sy*v.p_sx*v.p_cz; v.pR02=-v.p_sy*v.p_cx; v.pR10=-v.p_cx*v.p_sz; v.pR11=v.p_cx*v.p_cz; v.pR12=-v.p_sx; v.pR20=v.p_sy*v.p_cz-v.p_cy*v.p_sx*v.p_sz; v.pR21=v.p_sy*v.p_sz+v.p_cy*v.p_sx*v.p_cz; v.pR22=v.p_cy*v.p_cx;`
        + ` v.xpos=${bonePivotPosExprs(parent)[0]};`
        + ` v.ypos=${bonePivotPosExprs(parent)[1]};`
        + ` v.zpos=${bonePivotPosExprs(parent)[2]};`;
}
// 子块导出追加：位置跟随 + 【旋转跟随】。旋转跟随与 bindBone 的 molang（v.rotatex = t.<父>_xrot）
// 同构 —— 子块直接接收父的骨骼旋转源变量（角度不叠加）。
// 否则子块导出后不随父旋转（网格朝向固定），父一转、子块自己不动（「骨骼没跟父转」）。
function getBoneChildFollowString(child, parent, opts) {
    let s = getBoneChildPositionString(child, parent, opts);
    // ★【2026-10-24 r23】纯枢轴吸附不是骨骼系统：不继承父旋转（rotate 保持自身常量）。
    if (isPureSnapBone(child)) return s;
    const p = boneSafeId(parent.id);
    // ★【2026-10-22 用户问题 2】子块旋转 = 父骨骼旋转 + 关节角 v.bone_rotx/y/z（默认 0）。
    //   bone_rot 由关键帧 / 数据表 / Gizmo 驱动，这才有「关节活动」；为 0 时与旧版硬跟随完全等价。
    //   旧模型没有 bone_rot 变量时不追加，保持原样（避免导出引用未定义变量）。
    ['x', 'y', 'z'].forEach(ax => {
        const own = 'v.bone_rot' + ax;
        s += (child.scope && child.scope.vars.has(own))
            ? ` v.rotate${ax}=t.${p}_${ax}rot + ${own};`
            : ` v.rotate${ax}=t.${p}_${ax}rot;`;
    });
    return s;
}
// 骨骼树深度（用于导出排序：父必须在子之前，保证父发布的 t.* 先存在）
function getBoneDepthOf(block, parentsMap, seen) {
    const p = parentsMap.get(block.id);
    if (!p) return 0;
    if (seen.has(block.id)) return 0;
    seen.add(block.id);
    const pb = blocks.find(b => b.id === p);
    return 1 + (pb ? getBoneDepthOf(pb, parentsMap, seen) : 0);
}
// 按骨骼深度稳定排序（父先于子；非骨骼块保持原序）
function getBoneOrderedBlocks() {
    const parentsMap = resolveExportBoneParents();
    return blocks.slice().sort((a, b) => {
        const da = getBoneDepthOf(a, parentsMap, new Set());
        const db = getBoneDepthOf(b, parentsMap, new Set());
        if (da !== db) return da - db;
        return blocks.indexOf(a) - blocks.indexOf(b);
    });
}

// ==================== 方块选择集成 ====================
// 扩展 toggleBlockSelection 以支持关键帧约束
const originalToggleBlockSelection = toggleBlockSelection;
function patchedToggleBlockSelection(block, multi) {
    // 检查是否是混合选择（动画+非动画）- 只允许同类多选
    if (selectedBlocksSet.size > 0 && multi) {
        const hasAnim = hasKeyframeAnimation(block.id);
        for (const b of selectedBlocksSet) {
            const bHasAnim = hasKeyframeAnimation(b.id);
            if (hasAnim !== bHasAnim) {
                // 如果尝试将动画方块与非动画方块多选，阻止并提示
                if (hasAnim) {
                    // 打开关键帧窗口（★【2026-10-20】旧操作模式不再弹悬浮窗，仅新操作模式需要）
                    if (isNewLayoutMode) {
                        if (!keyframeWindowOpen) openKeyframeWindow();
                        else if (keyframeWindowEl) keyframeWindowEl.style.display = 'flex';
                    }
                    return; // 阻止选择
                } else {
                    // 非动画方块不能与动画方块多选
                    return; // 阻止选择
                }
            }
        }
    }
    
    // 如果多选的都是动画方块，强制打开关键帧窗口时间轴（★【2026-10-20】仅新操作模式）
    if (multi && selectedBlocksSet.size > 0) {
        const allAnim = Array.from(selectedBlocksSet).every(b => hasKeyframeAnimation(b.id)) && hasKeyframeAnimation(block.id);
        if (allAnim && isNewLayoutMode) {
            if (!keyframeWindowOpen) openKeyframeWindow();
            else if (keyframeWindowEl) keyframeWindowEl.style.display = 'flex';
        }
    }
    
    return originalToggleBlockSelection(block, multi);
}
toggleBlockSelection = patchedToggleBlockSelection;

// ==================== 关键帧模式下的新操作模式集成 ====================
// 扩展 renderSideBlockList 以支持关键帧编辑模式
const originalRenderSideBlockList = renderSideBlockList;
function patchedRenderSideBlockList() {
    if (isNewLayoutMode) {
        if (!isKeyframeMode) {
            // 普通模式：从选中集合中移除已加入关键帧系统的方块
            for (const b of Array.from(selectedBlocksSet)) {
                if (_kfSystemReady && keyframeData.has(b.id)) {
                    selectedBlocksSet.delete(b);
                }
            }
            if (selectedBlock && _kfSystemReady && keyframeData.has(selectedBlock.id)) {
                const firstNonAnim = blocks.find(b => !_kfSystemReady || !keyframeData.has(b.id));
                if (firstNonAnim) selectBlock(firstNonAnim);
                else selectBlock(null);
            }
        }
    }
    // 调用原函数（在其内部会根据 isKeyframeMode 做不同渲染）
    return originalRenderSideBlockList();
}
renderSideBlockList = patchedRenderSideBlockList;

