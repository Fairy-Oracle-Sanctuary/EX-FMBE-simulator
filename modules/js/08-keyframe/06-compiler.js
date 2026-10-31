/* 08-keyframe/06-compiler.js · 源 测试版v.6b79.html 第 43578-46208 行 */
'use strict';
/* ============================================================================
   【2026-10-13】关键帧「编译式」动画内核（用户需求：关键帧动画大完善）
   ----------------------------------------------------------------------------
   设计：关键帧不再由引擎逐变量赋值，而是【编译成一段 molang 程序】交给 molang
   引擎执行；导出即这段程序本身。由此自然得到四件事：
     · 任意变量可建帧（核心变量自动入列，其余走候选面板）
     · 时间分段运行部分不同的表达式
     · 缓动函数可插拔（KEYFRAME_EASINGS 注册表 + registerKeyframeEasing）
     · 多选编辑（每个方块各自编译一份程序）

   数据模型 keyframeData.get(blockId)：
     { frames:  Map<time, Map<varName, number>>,   // 数值帧（原有，保留兼容）
       exprs:   Map<time, Map<varName, string>>,   // 表达式帧：自该时刻起该变量改用此表达式
       easings: Map<time, string>,                 // 自该时刻起的缓动 key
       vars:    Set<varName>,                      // 用户确认的可写变量（决定时间表列）
       animId }

   编译产物结构（与用户给的参考样式一致，条件用范围式而非 ==，避开浮点命中问题）：
     v.<id>_time=q.anim_time;
     <每帧参数>  cond?(v.seg_time=..;v.dur=..;v.start_X=..;v.TX=..;);
     <缓动>      v.t=<缓动表达式>;
     <区间表达式> cond?(v.X=<用户表达式>;);
     <动画变量>  v.X=math.lerp(v.start_X,v.TX,v.t);
     <公共段>   未被任何帧/表达式驱动的变量 = 其自身表达式（查重下沉段）
   ========================================================================== */

// ---- 缓动注册表（留好扩展位：区间缓动 / 函数生成器只需 registerKeyframeEasing）----
const KEYFRAME_EASINGS = {
    linear: { label: '线性', build: tv => tv },
    easeIn: { label: '缓入', build: tv => `(${tv})*(${tv})` },
    easeOut: { label: '缓出', build: tv => `1-(1-(${tv}))*(1-(${tv}))` },
    easeInOut: { label: '缓入缓出', build: tv => `0.5-0.5*math.cos((${tv})*180)` },
    smooth: { label: '平滑', build: tv => `(3-2*(${tv}))*(${tv})*(${tv})` }
};
// 注册自定义缓动：build(tv) 返回关于插值因子 tv（已含 0..1 限幅）的 molang 表达式字符串
function registerKeyframeEasing(key, def) {
    if (!key || !def || typeof def.build !== 'function') return false;
    KEYFRAME_EASINGS[key] = { label: def.label || key, build: def.build };
    return true;
}
function kfEasingOf(key) { return KEYFRAME_EASINGS[key] || KEYFRAME_EASINGS.linear; }

// ---- 数据访问 ----
/* ★★【2026-10-13 修复】播放头/帧时间必须**量化到 1ms**。
   实测事故：点「+0.1s」步进 10 次得到 0.9999999999999999 ——
   · 录出的帧时间键是 0.9999999999999999（时间表显示怪数字）
   · 编译后时间块边界是 1，但 `v.<id>_time>=1` 对 0.9999999999999999 判 **false**
     → 落回上一块 → 插值出旧值 ⇒ 用户看到"改了没反应 / 方块不动"
   · 探针按时间找编辑框（data-kf-seg-time="1"）也找不到
   统一在「写入 keyframeCurrentTime / 帧时间键」处量化，杜绝浮点噪声。 */
function kfQuantTime(t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 1000) / 1000;
}
/* ★★★【2026-10-16 r11 修复 · 用户投诉「Gizmo 编辑关键帧时几乎必然错误生成新帧 / 又完全无法编辑(未改动)」】
   把「想要的编辑时刻」解析成**该方块真实存在的帧键**：
     ① 命中真实键              → 原样返回（**绝不因量化而落到别的时间**）；
     ② 命中量化后的键          → 返回量化键；
     ③ 2ms 容差内最近的键      → 返回它（播放头来自拖动预览/未量化旧键时的兜底）；
     ④ 都不命中                → 量化到 1ms（= 真正的 auto-key 新建帧）。
   背景（真浏览器探针 `_r11_repro.cjs` 实证）：时间轴拖动关键帧菱形曾写入**未量化**的帧键
   （实测 4.474351 与 4.474 并存）。此时播放头停在 4.474351，而 Gizmo 写入只做
   `kfQuantTime(keyframeCurrentTime)` → 落到 4.474（另一个键）⇒ 用户看到「凭空多一帧」；
   又因编译产物的时间块条件是 `toFixed(3)` 的 4.474（两块边界相同、中间块区间为空），
   真正执行的仍是旧的那一块 ⇒ 运行期读到的还是**旧帧的值** ⇒ 用户看到「改了没反应 / 未改动」。
   统一走本函数后，「播放头所在的那一帧」= 「被写入的那一帧」= 「显示值来源的那一帧」。 */
function kfResolveFrameTime(blockId, t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return 0;
    const d = keyframeData.get(blockId);
    if (d && d.frames instanceof Map && d.frames.size) {
        if (d.frames.has(n)) return n;          // ① 正好命中真实键
        const q = kfQuantTime(n);
        if (d.frames.has(q)) return q;          // ② 量化后命中真实键
        /* ③ 仅对**历史遗留的非 1ms 坏键**做就近吸附（容差 2ms）：
           绝不对两个都已是 1ms 网格点的合法帧做吸附，否则会把 4.474 与 4.475
           这类相隔 1ms 的**两个真实帧**错误合并。 */
        let best = null, bd = Infinity;
        for (const k of d.frames.keys()) {
            const kn = Number(k);
            if (kfQuantTime(kn) === kn) continue;
            const dd = Math.abs(kn - n);
            if (dd < bd) { bd = dd; best = k; }
        }
        if (best !== null && bd <= 0.002) return best;
    }
    return kfQuantTime(n);
}
/* ★★★【r18·3 · 用户要求「非帧时刻的编辑一律吸附到最近的已有帧，绝不新建帧」】
   返回该方块**时间上最近的已有帧键**（无任何帧时返回 null）。
   与 `kfResolveFrameTime` 的区别：后者命中不了就量化**新建**（auto-key），本函数**只吸附、绝不新建**。 */
function kfNearestFrameTime(blockId, t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    const d = keyframeData.get(blockId);
    if (!d || !(d.frames instanceof Map) || !d.frames.size) return null;
    if (d.frames.has(n)) return n;             // 正好命中真实键
    const q = kfQuantTime(n);
    if (d.frames.has(q)) return q;             // 量化后命中
    let best = null, bd = Infinity;
    for (const k of d.frames.keys()) { const dd = Math.abs(Number(k) - n); if (dd < bd) { bd = dd; best = k; } }
    return best;
}
/* r18·3：编辑写入用的目标帧时刻。
   · 显式加帧（kfAllowNewFrame=true，走「+」/教程/导入）→ 按给定时刻解析（允许新建）；
   · 否则（Gizmo 拖拽 / 改数值 / 骨骼换算 / 文件夹同步）→ **吸附最近的已有帧**；无帧可吸附返回 null，
     由调用方拦下并（防抖）提示用户先点「+」加帧。 */
function kfEditFrameTime(blockId, t) {
    if (kfAllowNewFrame) return kfResolveFrameTime(blockId, t);
    return kfNearestFrameTime(blockId, t);
}
/* ★★★【2026-10-14 P0 修复 · 用户投诉「数据表以及其他东西的更新仍然不及时」】
   用户原话：「数据表以及其他的东西的更新仍然不及时，例如我把方块添加进关键帧列表
             或者是创建方块的关键帧，这些东西都没有及时更新」。
   根因：关键帧有**两套界面**，各自的刷新散落在各处、且**互相不知道对方**：
     · 浮动窗（#keyframeWindow → renderKeyframeTimeline / renderKeyframeDataPanel）
     · 侧栏时间表（#sideBlockList → kfRenderTimelinePanel）
   `createKeyframeAtCurrentTime` 只刷新了浮动窗的两个函数；**侧栏时间表没被刷新**
   ⇒ 用户在侧栏看到的还是旧内容（"没有及时更新"）。同理「把方块加入动画列表」
   （❒ / 变量候选确认）之后，侧栏也常不刷新。
   正解：提供**唯一刷新咽喉点** `kfRefreshAllPanels()`，任何关键帧数据/选区/模式变化后
   一律调它；它负责按当前布局把两套界面都对齐。以后新增改动点也只调这一个函数，
   避免再次出现"某一处忘了刷新"（用户感受就是"更新不及时/乱"）。 */
function kfRefreshAllPanels() {
    try { renderKeyframeTimeline(); } catch (e) { }
    try { renderKeyframeDataPanel(); } catch (e) { }
    try { updateKeyframePlayhead(); } catch (e) { }
    try {
        // 新布局：侧栏在关键帧模式下就是时间表本体 → 必须重建
        if (isNewLayoutMode && isKeyframeMode) {
            const side = document.getElementById('sideBlockList');
            if (side) kfRenderTimelinePanel(side);
        }
    } catch (e) { }
    try { if (typeof updateInspectorValues === 'function') updateInspectorValues(); } catch (e) { }
}
/* 节流版 `kfRefreshAllPanels`（r17）：Gizmo 拖拽期间 60fps 调用也不会卡。
   ★★★【用户投诉「Gizmo 拖动换算后右侧数据表完全不动」的部分根因】
   拖拽过程中只有 `updateInspectorValues()`（检查器数值）在刷新，
   侧栏「关键帧时间表」要等拖拽结束才可能被重建 —— 拖动中看数据表就是"纹丝不动"。 */
let _kfPanelRefreshTs = 0;
function kfSchedulePanelRefresh(minGap) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - _kfPanelRefreshTs < (minGap || 90)) return;
    _kfPanelRefreshTs = now;
    try { kfRefreshAllPanels(); } catch (e) { }
}
/* ★★【2026-10-14 显示修复】时间标签必须是**人读的短数字**。
   用户截图里出现 `0.07146621423881312s` / `7.908318238098664s` —— 那是把
   `q.anim_time` 的原始浮点直接贴进 DOM。读取/拖动播放头时由浮点运算产生的长尾巴
   既难看又像是"数据错了"。统一走这里：量化到 1ms 后再 toFixed(3) 去尾零。
   （数据层仍用 kfQuantTime 做键量化，两者口径一致。） */
function kfFmtTime(t) {
    const n = kfQuantTime(t);
    // 最多 3 位小数，去掉无意义的尾零：0.071 / 1.5 / 2 / 0.25
    return String(parseFloat(n.toFixed(3)));
}
function kfData(blockId, create) {
    if (!keyframeData.has(blockId)) {
        if (!create) return null;
        keyframeData.set(blockId, { frames: new Map(), animId: getKeyframeAnimId(blockId) });
    }
    const d = keyframeData.get(blockId);
    if (create) {
        if (!(d.exprs instanceof Map)) d.exprs = new Map();
        if (!(d.easings instanceof Map)) d.easings = new Map();
        if (!(d.vars instanceof Set)) d.vars = new Set();
        // ★★【2026-10-14 P0】把历史遗留的**原始浮点时间键**就地规范化到 1ms。
        //   根因：`scrubToClientX` 曾直接写未量化的 `keyframeCurrentTime` ⇒ 帧键是
        //   `0.12690355329949238` 这种长浮点；而所有写入 API（kfSetValueAtFrame）与 UI 显示
        //   都按 1ms 量化 ⇒ **用户点显示的那一块，代码找不到对应键**，于是新建/落到别的帧
        //   ⇒ 表现为「改一个自定义变量 = 改了全部 / 时间块重复」。
        //   这里把旧键搬到量化键上（同一变量多键冲突时后者覆盖前者，与"同一显示时刻"语义一致）。
        /* ★★★【2026-10-16 r11 修复】旧实现用一次性标志 `__keysNormalized` 只修一次 ⇒
           只要坏键是在「首次 kfData(create) 之后」写入的（时间轴拖动的落点），就**永不修复**
           ⇒ 4.474 与 4.474351 并存（用户所见"重复帧"）。改为**每次调用都幂等自愈**：
           每次扫描非 1ms 的键并就地合并；这正是"坏键源头已封堵 + 存量坏键自愈"的双保险。 */
        if (d.frames instanceof Map && d.frames.size) {
            const bad = Array.from(d.frames.keys()).filter(t => kfQuantTime(t) !== t);
            // 同步搬 exprs 的键（分段表达式按时间点存）—— 与 frames 独立判定，任一有坏键都要修
            const badEx = (d.exprs instanceof Map) ? Array.from(d.exprs.keys()).filter(t => kfQuantTime(t) !== t) : [];
            if (bad.length || badEx.length) {
                for (const t of bad) {
                    const q = kfQuantTime(t);
                    const src = d.frames.get(t);
                    if (!d.frames.has(q)) d.frames.set(q, src);
                    else { const dst = d.frames.get(q); if (src instanceof Map) for (const [k, v] of src) if (!dst.has(k)) dst.set(k, v); }
                    d.frames.delete(t);
                }
                for (const t of badEx) {
                    const q = kfQuantTime(t); const src = d.exprs.get(t);
                    if (!d.exprs.has(q)) d.exprs.set(q, src);
                    d.exprs.delete(t);
                }
                try { keyframeEpoch++; } catch (e) { }
            }
        }
        // ★★★【2026-10-14 P0 · 用户投诉「自定义变量改一个=改全部」的第二根因】
        //   不变式：**每个被关键帧接管的变量，在每一帧里都必须有值**（要么全有、要么全无）。
        //   破坏它的三条路径：
        //    ① 自动纳入（kfOnBlockAddedToAnimation）往 d.vars 加变量，但**已存在的帧**没补该键；
        //    ② kfSyncDataFromProgram / 导入 / 撤销只重建了部分帧；
        //    ③ ★【2026-10-16】**Gizmo 在非帧时刻拖动**（kfGizmoWriteVar 的 auto-key）会
        //       只在当前播放头建一个「只有一个变量」的帧（实测 t=1.3 的帧 size=1，
        //       其余 14 个被管变量全部缺失）。
        //   后果（真浏览器实测 `_flag_diag.cjs` / `_r10_probe2.cjs`）：
        //     · UI 渲染时 `kfValueAt` 对缺键的变量回退到 `scope.vars` **当前值**
        //       ⇒ 两帧显示同一个数、编辑后旧值"弹回"（用户投诉「数据会回弹」）；
        //     · 编译器取值矩阵拿不到值 ⇒ 真的零插值 / 派生链断链。
        //   修法：抽出 `kfCompleteFrames()` 作为**幂等不变式**，在 kfData(create) 每次调用都跑
        //   （旧的 `__framesCompleted` 一次性标志只能修一次，之后新建的半截帧永远漏网 ——
        //     这正是用户第 10 轮「多出来一帧、数据回弹」的加剧因子）。
        //   补齐值 = 该变量「最近一个更早帧里的值」，没有再取 scope 当前值（与编译器的
        //   前向回填口径一致，保证显示值与运行值恒等）。
        //   ★ 性能：kfCompleteFrames 自带 `__completedSig` 快照短路 —— 只有
        //     「帧数 / 变量数 / 各帧键数」变化时才真正扫描一遍（本函数被渲染路径高频调用）。
        kfCompleteFrames(blockId);
    }
    return d;
}
/* 幂等不变式：每个驱动变量在每一帧都必须有值。返回是否发生了补齐。
   签名短路：帧数、d.vars 大小、逐帧键数拼成的字符串不变 → 直接返回（O(帧数) 轻量计算）。 */
function kfCompleteFrames(blockId) {
    const d = keyframeData.get(blockId);
    if (!d || !(d.frames instanceof Map) || !d.frames.size) return false;
    const _sig = () => {
        let sig = (d.vars instanceof Set ? d.vars.size : 0) + '/' + d.frames.size + ':';
        for (const [t, m] of d.frames) sig += t + '=' + (m instanceof Map ? m.size : -1) + ',';
        return sig;
    };
    let sig;
    try { sig = _sig(); if (d.__completedSig === sig) return false; } catch (e) { }
    const changed = kfCompleteFramesScan(blockId, d);
    // ★ 签名在**扫描之后**再落库：扫描本身会加键，若用扫描前的签名，下一轮会白扫一次。
    try { d.__completedSig = _sig(); } catch (e) { }
    return changed;
}
function kfCompleteFramesScan(blockId, d) {
    const _blk = blocks.find(x => x.id === blockId);
    let changed = false;
    try {
        const _names = new Set();
        if (d.vars instanceof Set) for (const n of d.vars) _names.add(n);
        for (const [, m] of d.frames) if (m instanceof Map) for (const k of m.keys()) _names.add(k);
        const _times = Array.from(d.frames.keys()).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
        for (const n of _names) {
            if (isKeyframeInternalVar(n, blockId) || _kfIsNsInternal(n, blockId)) continue;
            // 派生量绝不补进帧（进了帧就会被当"驱动"、表达式被剔除、值冻死）
            if (_blk) { try { if (kfIsNonConstAssigned(_blk, n)) continue; } catch (e) { } }
            let last = null;
            for (const t of _times) {
                const f = d.frames.get(t);
                if (!(f instanceof Map)) continue;
                if (f.has(n)) { last = f.get(n); continue; }
                if (last === null) {
                    const dv = _blk && _blk.scope ? _blk.scope.vars.get('v.' + n) : null;
                    last = (dv && Number.isFinite(dv.value)) ? dv.value : 0;
                }
                f.set(n, last); changed = true;
            }
        }
    } catch (e) { }
    return changed;
}
// 该方块的全部时间边界（数值帧 ∪ 表达式帧 ∪ 缓动点），升序
function kfBoundaries(blockId) {
    const d = kfData(blockId);
    if (!d) return [];
    const s = new Set();
    if (d.frames instanceof Map) for (const t of d.frames.keys()) s.add(Number(t));
    if (d.exprs instanceof Map) for (const t of d.exprs.keys()) s.add(Number(t));
    if (d.easings instanceof Map) for (const t of d.easings.keys()) s.add(Number(t));
    return Array.from(s).filter(Number.isFinite).sort((a, b) => a - b);
}
// 表达式数据版本号：任何表达式/可写变量集合变更时自增（编译缓存失效用）
let kfExprEpoch = 1;
function kfMarkDirty() { kfExprEpoch++; kfCompileCache.clear(); }

// 取"自 time 起生效"的表达式（≤time 的最近一条）；无则 null
function kfVarExprAt(blockId, time, varName) {
    const d = kfData(blockId);
    if (!d || !(d.exprs instanceof Map)) return null;
    let best = null;
    for (const [t, m] of d.exprs) {
        if (!(t <= time + 1e-9)) continue;
        if (!m.has(varName)) continue;
        if (best === null || t > best.t) best = { t, expr: m.get(varName) };
    }
    return best ? best.expr : null;
}
// 写入某时刻的变量表达式（expr 为 null/'' 表示清除该点覆盖）
function kfSetVarExprAt(blockId, time, varName, expr) {
    time = kfQuantTime(time);                    // ★ 时间键量化到 1ms，杜绝浮点噪声键
    const d = kfData(blockId, true);
    if (!(d.exprs instanceof Map)) d.exprs = new Map();
    if (!d.exprs.has(time)) d.exprs.set(time, new Map());
    const m = d.exprs.get(time);
    if (expr === null || expr === undefined || String(expr).trim() === '') m.delete(varName);
    else m.set(varName, String(expr).trim());
    if (m.size === 0) d.exprs.delete(time);
    kfMarkDirty();
}
// 列出该方块的"表达式区间"（供 UI：起止时间 + 每个变量的表达式）：
// [{ start, end, exprs: Map<varName, expr>, changed: Set<varName> }]
function kfExprSegments(blockId) {
    const bd = kfBoundaries(blockId);
    const d = kfData(blockId);
    if (!d || !bd.length) return [];
    const segs = [];
    const last = bd[bd.length - 1];
    // 段 = [bd[i], bd[i+1])，末段 [bd[last], +∞)
    for (let i = 0; i < bd.length; i++) {
        const start = bd[i];
        const end = i === bd.length - 1 ? null : bd[i + 1];
        const exprs = new Map();
        const changed = new Set();
        if (d.exprs instanceof Map) {
            for (const [t, m] of d.exprs) {
                if (!(t <= start + 1e-9)) continue;
                for (const [v, e] of m) exprs.set(v, e);
            }
            // 本段起点新增的覆盖算"本段特殊表达式"
            const here = d.exprs.get(start);
            if (here) for (const v of here.keys()) changed.add(v);
        }
        segs.push({ start, end, exprs, changed });
    }
    return segs;
}

// ---- 可写变量集 ----
// 核心（内定）变量名：与 CORE_VAR_DEFAULTS 一致（去掉 v. 前缀的裸名）
const KF_CORE_VARS = ['xpos', 'ypos', 'zpos', 'xrot', 'yrot', 'zrot', 'rotatex', 'rotatey', 'rotatez',
    'scale', 'extend_scale', 'extend_xrot', 'extend_yrot', 'xbasepos', 'ybasepos', 'zbasepos'];
// 该变量是否被"非常量表达式"赋值（= 派生量：由别的变量算出来的中间结果）
function kfIsNonConstAssigned(block, name) {
    if (!block || !block.scope) return false;
    // ★ v2：不再用 hasKeyframeAnimation 短路。v2 的编译产物把驱动变量写成 v.<id>_start_X / v.<id>_TX，
    //   绝不会覆盖 scope.vars 里 X 自身的 expr，所以 d.expr 始终是"用户写的表达式"这个真相源。
    const d = block.scope.vars.get('v.' + name);
    if (!d) return false;
    return !isConstantExpr(String(d.expr == null ? '' : d.expr));
}
// 该方块"可写（可入关键帧）变量"的完整清单：
//   核心变量：未被非常量表达式赋值 → auto（无需过问，直接进序列）
//             被非常量表达式赋值     → 候选（用户可能想接管，例如 v.extend_scale=v.a/math.sqrt(...)）
//   自定义变量：常量赋值 / 未被赋值 → 候选（= 输入参数，这才是该打关键帧的东西）
//               ★被非常量表达式赋值 → **派生量**，不进候选（见下）
//   已显式确认过的变量（data.vars）始终在列
/* ★★【2026-10-13 用户明确要求】派生量不列进候选：
   用户原话「有一些变量你明知道被表达式赋值了你干嘛还要列举出来？这些肯定理论上就不该也不可能
   给他创建关键帧啊，他们就应该在指令最后好好呆着，接收其他变量传给他的数据然后计算」。
   以旗帜预设为例：v.side_a / v.side_b / v.angle 是**输入参数**（常量赋值）→ 该打关键帧；
   而 v.fit_a / v.sin_th / v.Q1 / v.Qd / v.nx / v.nl … 全是**中间计算结果**（表达式赋值）
   → 它们就该在程序末尾接收输入、算出结果，绝不作为关键帧候选。 */
function kfIsDerivedVar(block, name) {
    if (KF_CORE_VARS.includes(name)) return false;      // 核心变换变量不算派生（用户可能想接管）
    return kfIsNonConstAssigned(block, name);
}
function kfWritableVars(block) {
    const out = { auto: [], candidates: [], derived: [] };
    // ★【2026-10-17】纯查询：方块还没加入动画时 d 为空，用空集合即可，绝不为了"列变量"而创建条目。
    const d = kfData(block.id, false);
    const confirmed = (d && d.vars instanceof Set) ? d.vars : new Set();
    const seen = new Set();
    for (const name of KF_CORE_VARS) {
        if (!block.scope || !block.scope.vars.has('v.' + name)) continue;
        seen.add(name);
        if (confirmed.has(name) || !kfIsNonConstAssigned(block, name)) out.auto.push(name);
        else out.candidates.push(name);
    }
    if (block.scope) {
        for (const key of block.scope.vars.keys()) {
            if (!key.startsWith('v.')) continue;
            const name = key.slice(2);
            if (seen.has(name)) continue;
            // 编译内部量不进候选：裸名（seg_time/dur/t/start_*/T*）与方块命名空间形式
            // （v.<id>_seg_time/_dur/_u/_seg_start/_kv/_start_X/_TX）都要过滤
            if (isKeyframeInternalVar(name, block.id) || _kfIsNsInternal(name, block.id) || kfIsLegacyScaffoldTwin(name, block.id, block.scope && block.scope.program)) continue;
            seen.add(name);
            if (confirmed.has(name)) { out.auto.push(name); continue; }   // 已确认过 → 保留
            // 派生量（被表达式赋值）→ 单独归类，不给勾选框
            if (kfIsDerivedVar(block, name)) { out.derived.push(name); continue; }
            out.candidates.push(name);
        }
    }
    return out;
}
// 实际参与编辑/录制的变量集（自动 + 已确认）
function kfActiveVars(block) {
    const w = kfWritableVars(block);
    return w.auto.concat(w.candidates.filter(n => {
        const d = kfData(block.id);
        return d && d.vars instanceof Set && d.vars.has(n);
    }));
}

// ---- 编译 ----
const kfCompileCache = new Map();   // blockId -> { sig, program }
// 编译诊断：被「后段（查重下沉）」同名遮蔽的关键帧驱动变量（面板据此提示用户）
let kfLastShadowWarn = [];
function kfCompileSig(block) {
    const d = kfData(block.id);
    const nv = (d && d.vars instanceof Set) ? d.vars.size : 0;
    return 'v2:' + keyframeEpoch + ':' + kfExprEpoch + ':' + nv + ':' + (keyframeAnimDuration || 0);
}
/* ----------------------------------------------------------------------------
   【v2 · 2026-10-13】编译式关键帧的三层程序结构
   ----------------------------------------------------------------------------
   用户已明确：关键帧编辑模式与 molang 编辑模式必须彻底打通，且最终指令由「通用 molang
   程序」跑 —— 导出文本就是这段程序。为此程序固定分三层（前段 / 中段 / 后段）：

     ① 前段（常量参数层）：
          v.<id>_time=q.anim_time;
          v.side_a=1;v.side_b=2;v.angle=60;          ← 用户常量（对 driven 变量跳过）
          <时间块条件>?( v.<id>_seg_time=0; v.<id>_dur=1; v.<id>_start_X=..; v.<id>_TX=..; );
          <时间块条件>?( ...; v.<id>_t=<缓动>(...); );   ← 每块末尾顺带算缓动因子
     ② 中段（分段表达式层）：
          <区间条件>?( v.X=<用户的截断表达式>; );       ← 只写「与本段之外不同」的那些
     ③ 后段（查重下沉层）：
          v.fit_a=...;v.scale=...;                        ← 上下文全都没动过的表达式原样带下来

   ★★ 三条铁律（v1 血坑，v2 继续遵守）：
     1. 绝不把「只是可写、用户没打帧」的变量写进程序 —— 否则 scale/extend_scale/extend_xrot
        被写成常量 0，方块当场缩没。
     2. `scope.program` 是唯一真相；外层改写数据后必须 kfAfterExternalDataChange（编译签名不含数值）。
     3. 未参与动画的变量交给后段按自身表达式下沉，绝不在前段用默认值覆盖。
   ★ v2 新增铁律：
     4. 无条件 `v.X=math.lerp(...)` **不允许**再出现（会被反向解析误判成常量赋值，
        导致 X 永远打不上关键帧）。所有 lerp 行都必须落在时间块条件里，且**每个变量独立成块**。
     5. 内部变量必须按方块命名空间隔离（v.<id>_seg_time / _dur / _t / _start_X / _TX）：
        同一程序里多块共用 v.t / v.seg_time 会互相踩。
   ★ v2 关键帧动画只服务「无文件夹单方块」：文件夹骨骼 / ✛ 显式绑定仍走原骨骼路径。
   -------------------------------------------------------------------------- */

// 拆出方块的「程序基线」：按顶层分号切分、剥掉注释后，取出每条「单变量赋值」语句。
// 返回 { defs: [{name, expr, const, isConst}], plainLines: string[] }
//   常量赋值 → 归入前段「常量参数层」（可被关键帧驱动）
//   表达式赋值 → 保留原样（它们是程序依赖的中间量，必须在前段可用）
/* ★★ v2 铁律：编译产物绝不能反过来当作"用户基线"。
   原因：kfEnsureProgram 会把产物写回 scope.program；若编译器再从 scope.program 取基线，
   就把上一次的产物（含旧时间块）当成用户代码再吃一遍 —— 实测程序无界增长
   （272→835→1398→1961… 每次 +4 个条件块），旧的 seg/dur/start/T 还会覆盖新的内部参数。
   解法：把「用户基线」快照进 scope.kfBaseProgram，只在真正变化时刷新：
     · 从未捕获过 → 用当前 scope.program
     · scope.program 等于我们上次编译的产物 → 说明是编译器自己写的，沿用旧基线
     · 其它情况 → 用户（molang 编辑器 / 导入 / 撤销）改了程序 → 重新捕获
*/
function kfCaptureBase(block) {
    if (!block || !block.scope) return '';
    const sc = block.scope;
    const cur = String(sc.program == null ? '' : sc.program);
    if (typeof sc.kfBaseProgram !== 'string') {
        sc.kfBaseProgram = cur; sc.kfBaseSig = cur; sc.kfLastCompiled = null;
        return sc.kfBaseProgram;
    }
    if (cur === sc.kfLastCompiled) return sc.kfBaseProgram;   // 是我们刚写的产物 → 基线不变
    if (cur === sc.kfBaseSig) return sc.kfBaseProgram;        // 没有变化
    sc.kfBaseProgram = cur; sc.kfBaseSig = cur;
    return sc.kfBaseProgram;
}
// 外部（导入 / 撤销重做 / 程序被整体替换）改写了程序时显式重设基线
function kfResetBase(block) {
    if (!block || !block.scope) return;
    const sc = block.scope;
    const cur = String(sc.program == null ? '' : sc.program);
    sc.kfBaseProgram = cur; sc.kfBaseSig = cur; sc.kfLastCompiled = null;
}
/* ★★【2026-10-14 P0-② 同类根因 · 第二个自我喂养点，已由栈追踪证实】
   kfAfterExternalDataChange 原本无条件调 kfResetBase，而它被**改数值**路径调用：
     kfRealizeTargetVar → kfAfterExternalDataChange → kfResetBase
   （栈：Object.onChange <- applyStep <- 泡泡 ▲ / kfSetValueAtFrame）
   此时 scope.program 就是**编译器刚写的产物**，于是 kfBaseProgram 被产物覆盖：
   实测每点一次 ▲ 基线 0 → 1680 → 3459 → 5238（每次 +1773 字），下一轮编译再把产物
   当用户代码吃一遍 ⇒ 程序无界增长、旧 v.<id>_start_X/_TX/_dur 排在真正的时间块之前
   ⇒ 帧数据明明改成 3，运行期 v.xpos 恒为 0、方块一动不动。
   正解：**只有程序真的被外部替换过**（导入 / 撤销 / 手改 molang）才重设基线；
   若当前程序正是我们上次编译的产物，保持用户基线不变（= 防自我喂养的唯一安全判据，
   与 kfCaptureBase 里 `cur === sc.kfLastCompiled → 基线不变` 同源）。 */
function kfResetBaseIfForeign(block) {
    if (!block || !block.scope) return;
    const sc = block.scope;
    const cur = String(sc.program == null ? '' : sc.program);
    if (typeof sc.kfLastCompiled === 'string' && cur === sc.kfLastCompiled) return;  // 自己的产物 → 基线不动
    if (cur === sc.kfBaseSig) return;                                                // 没有变化
    sc.kfBaseProgram = cur; sc.kfBaseSig = cur; sc.kfLastCompiled = null;
}
function kfSplitProgramDefs(block) {
    const text = (block && block.scope && typeof block.scope.kfBaseProgram === 'string')
        ? block.scope.kfBaseProgram
        : String(block && block.scope ? (block.scope.program || '') : '');
    const out = { defs: [], plainLines: [] };
    if (!text.trim()) return out;
    let stmts;
    try { stmts = kfSplitStatements(text); } catch (e) { stmts = []; }
    /* ★★★【2026-10-17 用户第 16 轮 · 产物污染（"指令大量重复 / 效果与编辑不符 / 末帧跳回 Gizmo 初值"）】
       本函数是「用户基线」的解析器，它必须**绝不把编译器自己的产物当成用户代码**。
       旧实现的内部量正则只认 `seg_time|dur|t|u|seg_start`，**漏了 `kv`/`start_*`/`T*`**
       （与 `_kfIsNsInternal` 口径不一致）⇒ 一旦 `scope.program` 被某条未更新
       `scope.kfLastCompiled` 的路径（撤销/重做 / 导入 / legacy 骨骼路径 / 外部替换）
       换成一份**编译产物**，`kfCaptureBase` 就会把它当基线钉下来，随后：
         · `v.<id>_kv=1;` / `v.<id>_start_X` / `v.<id>_TX` 被当成"用户定义"重写进块 0；
         · `v.<id>_time<..?(…)` 这类条件块语句不匹配 `v.X=` ⇒ 落进 plainLines ⇒ 作为 strays 原样拼回。
       ⇒ 每次重编译都把旧产物再复制一份：program 无界增长、重复时间块（旧 _seg_time/_dur/_start/_T/_u
         覆盖新值）⇒ 运行值是两次编译的混合（"效果≠编辑"）、末帧命中旧块（"跳变回最初 Gizmo 样子"）。
       探针 `_r16b_baseline_pollute.cjs` 精确复现：二次编译后产物里出现 **2 个** `v.Cube_kv=1;`
       及旧整组 `<1.2` / `>=1.2`(dur=0.0001) 块（用户样例是 3 个 ⇒ 连续三次叠加）。
       修法（一条，稳健，不依赖 kfLastCompiled 身份判定的脆弱性）：
         ① 内部量判定改用 `_kfIsNsInternal`（覆盖 kv / start_* / T* / seg_time / dur / t / u / seg_start / _time）；
         ② 含脚手架变量的**条件块 / lerp 语句**整体丢弃，绝不携带进 plainLines（= 绝不成为 strays）。 */
    const _id = String(block.id);
    const _nsEsc = _id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const _scaffoldRe = new RegExp('v\\.' + _nsEsc + '_(kv|seg_time|dur|u|seg_start|start_|T)');
    for (const st of stmts) {
        // ★ 名字必须以字母/下划线开头 —— 否则 `v.Cube_time=q.anim_time;v.Cube_time<1?(...)` 这类
        //   "本块拼接文本"会被 [A-Za-z0-9_]+ 贪心吃成一条 name=`Cube_time` expr=`q.anim_time;v.Cube_time<1?...`
        //   的巨型赋值（实测：导致常量参数没被内联、用户代码被重复写两遍）。
        const m = /^v\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(st);
        if (m) {
            const name = m[1], expr = m[2].trim();
            // 只把「编译器自己生成的脚手架变量」视为内部量；绝不能把 side_a/xpos/rotatey 等
            // 用户变量误判成内部（isKeyframeInternalVar 会把任何 start_*/T* 名字都判成内部）。
            const isInternal = _kfIsNsInternal(name, _id)
                || (name.indexOf(_id + '_') === 0 && /^(seg_time|dur|t|u|seg_start)$/.test(name.slice(_id.length + 1)))
                || /^(seg_time|dur|t|u|seg_start)$/.test(name);
            out.defs.push({ name, expr, const: isConstantExpr(expr), isConst: isConstantExpr(expr), internal: isInternal });
            continue;
        }
        // ★ 编译器生成的时间块条件语句 / lerp 语句（引用本块脚手架变量）不是用户代码 —— 直接丢弃。
        if (_scaffoldRe.test(st)) continue;
        out.plainLines.push(st);
    }
    return out;
}
// 方块命名空间内部量：v.<blockId>_seg_time / _dur / _t / _time / _start_X / _TX
//   （isKeyframeInternalVar 只认裸名 seg_time/dur/t/start_*/T*，认不出带 ID 前缀的形式）
function _kfIsNsInternal(name, blockId) {
    const p = String(blockId) + '_';
    if (name === String(blockId) + '_time') return true;
    if (name.indexOf(p) !== 0) return false;
    const rest = name.slice(p.length);
    if (rest === 'seg_time' || rest === 'dur' || rest === 't' || rest === 'u' || rest === 'seg_start' || rest === 'kv') return true;
    if (rest.indexOf('start_') === 0) return true;
    if (/^T[A-Za-z_]/.test(rest)) return true;
    return false;
}
// 变量 ↔ 方块命名空间系数名
function kfNsName(blockId, kind, v) {
    const id = String(blockId);
    if (kind === 'start') return `${id}_start_${v}`;
    if (kind === 'target') return `${id}_T${v}`;
    return `${id}_${kind}`;          // time / seg_time / dur / t
}
// 每个变量「最近一次表达式」（真正的时间变化解析；空闲变量向后继承）
function kfVarExprTimeline(d) {
    const out = new Map();            // Map<time, Map<name, expr>>
    if (!d || !(d.exprs instanceof Map)) return out;
    const ts = Array.from(d.exprs.keys()).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    let acc = new Map();
    for (const t of ts) {
        const m = d.exprs.get(t);
        if (!(m instanceof Map)) continue;
        for (const [n, e] of m) if (String(e).trim() === '') acc.delete(n); else acc.set(n, String(e).trim());
        out.set(t, new Map(acc));
    }
    return out;
}
// 某时刻该变量「生效的表达式」（不存在 → null）
function kfExprEffectiveAt(d, t, name) {
    const em = d && d.exprs instanceof Map ? d.exprs : null;
    if (!em) return null;
    let best = null;
    for (const [et, m] of em) {
        if (!(et <= t + 1e-9)) continue;
        if (!(m instanceof Map) || !m.has(name)) continue;
        if (best === null || et > best) best = et;
    }
    return best === null ? null : String(em.get(best).get(name));
}
/* ★★【2026-10-14 深测发现】分段表达式框看不见「后段派生表达式链」——
   用户原话：「v.side_a=… 后面那一坨实际上应该待在 molang 表达式最底部，
   并且在动画模式的分段表达式能看见它（但是前面的常量数值不显示它）」。
   根因：`kfBlockSegText` 只读 `d.exprs`（= 用户手写的区间覆盖），从未读后段候选 backCand，
   而编译器里的 backCand 又是临时局部变量 ⇒ UI 与编译产物永远看不到彼此，重复实现必然漂移。
   正解：把后段候选的构造抽成这一个纯函数，**编译器与 UI 共用**，
   框里看到的 `v.X=expr;` 与编译产物后段逐字一致（单一真相源）。 */
function kfBackChain(block, drivenSet) {
    const blockId = block ? block.id : null;
    const recs = [];
    try {
        const split = kfSplitProgramDefs(block);
        for (const def of split.defs) {
            if (def.internal) continue;                                   // 脚手架内部量不进后段
            if (drivenSet && drivenSet.has(def.name)) continue;           // 被关键帧驱动 → 时间块接管
            const ex = String(def.expr || '').trim();
            if (!ex) continue;
            recs.push({ name: def.name, expr: ex, isConst: !!def.isConst });
        }
        if (block && block.scope) {
            for (const [key, dd] of block.scope.vars) {
                if (!key.startsWith('v.')) continue;
                const name = key.slice(2);
                if (isKeyframeInternalVar(name, blockId) || _kfIsNsInternal(name, blockId)) continue;
                if (drivenSet && drivenSet.has(name)) continue;
                if (recs.some(r => r.name === name)) continue;            // 程序文本里已有 → 不重复补
                const ex = String(dd && dd.expr == null ? '' : dd.expr).trim();
                if (!ex || isConstantExpr(ex)) continue;                  // 常量属前段基线，不进后段
                recs.push({ name, expr: ex, isConst: false });
            }
        }
    } catch (e) { }
    // 按变量名聚合：同名多次赋值全部保留（顺序不变），末次定义决定 const/dyn
    const byName = new Map();
    const order = [];
    for (const r of recs) {
        let rec = byName.get(r.name);
        if (!rec) { rec = { name: r.name, stmts: [], lastConst: null }; byName.set(r.name, rec); order.push(r.name); }
        rec.stmts.push(r.expr);
        rec.lastConst = r.isConst ? r.expr : null;
    }
    const records = order.map(n => byName.get(n));
    const items = [];
    for (const rec of records) {
        for (const ex of rec.stmts) {
            items.push({ name: rec.name, expr: ex, isConst: rec.lastConst !== null && ex === rec.lastConst });
        }
    }
    return { records, items, names: order };
}
// 后段「派生表达式链」纯文本（分段表达式框显示用）：只列非常量赋值，
//   ∵ 用户明确要求「前面的常量数值不显示」；常量参数交由数值表 / Gizmo 负责。
function kfBackChainText(block, drivenSet) {
    const ch = kfBackChain(block, drivenSet);
    const lines = [];
    for (const it of ch.items) {
        if (it.isConst) continue;
        lines.push(`v.${it.name}=${String(it.expr).replace(/;\s*$/, '')};`);
    }
    return lines.join('\n');
}
// 该方块「已被关键帧接管」的变量集合（d.vars ∪ 所有帧里出现过的变量）
function kfBlockDrivenSet(block) {
    const s = new Set();
    const d = kfData(block.id);
    if (d && d.vars instanceof Set) for (const n of d.vars) s.add(n);
    if (d && d.frames instanceof Map) for (const [, m] of d.frames) for (const k of m.keys()) s.add(k);
    return s;
}
// 该方块当前由后段承接（未进关键帧时间块）的「派生表达式链」文本
function kfBlockBackChainText(block) {
    if (!block || !block.scope) return '';
    return kfBackChainText(block, kfBlockDrivenSet(block));
}
// 把 keyframeData 编译成这段自包含的 molang 程序
function kfCompileProgram(blockId, opts) {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !block.scope) return null;
    // ★【2026-10-17】编译只针对**已加入动画**的方块做只读读取，未加入时直接返回 null，不创建条目。
    const d = kfData(blockId, false);
    if (!d) return null;
    // ★ v2：molang 编辑模式的方块同样进关键帧体系 —— 用户手写的整段程序会被原样保留在前/后段，
    //   只在其中注入时间块与内部变量。旧版这里 return null 造成「新代码与历史代码打架」。
    const frames = (d.frames instanceof Map) ? d.frames : new Map();
    const times = Array.from(frames.keys()).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const hasExprs = (d.exprs instanceof Map) && d.exprs.size > 0;
    const hasProgram = !!(block.scope.program && block.scope.program.trim());
    // 什么都没有 → 不编译（不能凭空造程序，否则等于清空用户数据）
    if (!times.length && !hasExprs && !hasProgram) return null;

    const fmt = v => (typeof v === 'number' ? parseFloat(v.toFixed(6)) : v);
    const fmtV = (name, v) => _isEsVar(name) ? parseFloat(_esNorm(v).toFixed(6)) : fmt(v);
    /* ★【2026-10-16 r11】时间文本精度提到 6 位小数：旧 `toFixed(3)` 会把残留的非 ms 键
       （如 4.474351）四舍五入成 4.474 ⇒ 相邻两个时间块的边界**相同** ⇒ 中间块条件变成
       `>=4.474&&<4.474` 的**空区间**（永不执行），正是用户所见"时间块重复/失效"。
       配合时间键全量化（帧键已恒为 1ms）+ kfData 幂等自愈，任何残留坏键也不会再撞边界。 */
    const tl = (x) => parseFloat(Number(x).toFixed(6));

    // ---- 程序基线（用户手写/导入的原始程序）----
    const split = kfSplitProgramDefs(block);
    const baseClean = [];                       // 去掉内部变量赋值与裸 v.X=... 之后的保留语句
    const baseDefs = [];                        // 用户显式写的 v.X=… 定义（保持顺序）
    for (const st of split.plainLines) baseClean.push(st);
    for (const def of split.defs) {
        if (def.internal) continue;             // 旧程序里的 v.seg_time / v.t / v.<id>_time 全部丢弃重建
        baseDefs.push(def);
    }

    // ---- drivenVars：用户确认要管（d.vars）∪ 帧里真的出现过的变量 ----
    const framesVars = new Set();
    for (const t of times) {
        const f = frames.get(t);
        if (!(f instanceof Map)) continue;
        for (const k of f.keys()) if (!isKeyframeInternalVar(k, blockId) && !_kfIsNsInternal(k, blockId)) framesVars.add(k);
    }
    const drivenSet = new Set();
    if (d.vars instanceof Set) for (const n of d.vars) { if (!isKeyframeInternalVar(n, blockId) && !_kfIsNsInternal(n, blockId)) drivenSet.add(n); }
    for (const n of framesVars) drivenSet.add(n);
    // 有帧数据的变量一定在列表里；顺序：核心变量优先，其余按字母
    const drivenVars = [];
    for (const n of KF_CORE_VARS) if (drivenSet.has(n)) drivenVars.push(n);
    for (const n of Array.from(drivenSet).sort()) if (!drivenVars.includes(n)) drivenVars.push(n);

    // ---- 后段（查重下沉）候选：有表达式、且不被驱动的变量 ----
    /* ★★【2026-10-14 P1-① 修复】「后段去重」必须 **保留同一变量的全部赋值**，并由
       **末次定义**决定它是常量还是非常量。molang 是顺序执行的语句序列，同一变量被写多次
       合法且常见（前面是「初值/占位」，后面才是真正干活的表达式）。
       旧实现 `if (definedNames.has(def.name)) continue;` 取**首次定义**，
       而旗帜预设恰好把顺序写成「占位在前、真表达式在后」：
         v.sin_ey_sq=0;                                  ← 占位（被挑中，真表达式被丢）
         v.sin_ey_sq=(math.abs(v.den2)<0.0001)?0:...    ← 真表达式（被吞）
         v.nx=…; v.nx=v.nx/v.nl;                        ← 归一化那一步被吞
       ⇒ 产物只剩 `v.sin_ey_sq=0;` 与未归一化的 `v.nx` ⇒ `v.xrot/v.zrot/v.scale/v.extend_yrot`
         的依赖链断裂、这些表达式直接从产物里消失，派生量变成冻结死值
         （实测：改 v.side_a 1→3，scale 恒 1.224745 应 3.044996；sin_ey_sq 恒 0 应 0.03184）。
       同时修掉 P1-②：`dynStr.join('') + dynStr.join('')` 把动态段写了两遍。
       构造逻辑抽成 kfBackChain()，与「分段表达式」框共用 ⇒ 框里看到的 === 编译产物的后段。 */
    const chain = kfBackChain(block, drivenSet);
    const backCand = [];
    for (const rec of chain.records) {
        for (const ex of rec.stmts) {
            backCand.push({ name: rec.name, expr: ex, isConst: rec.lastConst !== null && ex === rec.lastConst });
        }
    }
    const backMap = new Map(backCand.map(x => [x.name, x]));

    // ---- 中段（分段表达式）：按【时间块】独立成段 ----
    //   ★ 语义（与 UI 一致）：某个时间块的「分段表达式」只在该块起作用。用户如果想让它一直
    //     延续，就复制到后面的块。这样「参考样式 时间>=x&&时间<x?(表达式);」自然成立，
    //     不需要额外推断"结束点"，也不会出现"只在中间块写一次却影响到结尾"的意外。
    //   查重下沉：与前一段相同 / 与后段默认相同 → 不写。
    const tlMap = kfVarExprTimeline(d);           // Map<time, Map<name, expr>>（累积态）
    const midSeq = Array.from(tlMap.keys());      // 升序（有表达式的时间点）
    const blocksList = (() => {
        const s = new Set(times);
        for (const t of midSeq) s.add(t);
        s.add(0);
        return Array.from(s).filter(Number.isFinite).sort((a, b) => a - b);
    })();
    const empMid = new Map();
    const _norm = (x) => String(x == null ? '' : x).replace(/\s+/g, '');
    /* ★★ v2 铁律：中段（分段表达式）必须对【任何】变量都可用 —— 包括
       · 被关键帧驱动的变量（用户要"这一段用表达式接管、其它段照常插值"）
       · 有后段默认表达式的变量（用户要"这一段换一套表达式"）
       旧实现 `if (drivenSet.has(name) || backMap.has(name)) continue;` 会把这两类覆盖静默丢弃，
       而后段位于 lerp 之后 ⇒ 用户的区间编辑完全不生效（实测 P1-C）。 */
    for (const bs of blocksList) {
        // 本块显式声明的覆盖（该时刻的 d.exprs 条目）
        const here = tlMap.get(bs);
        if (!here || !here.size) continue;
        const acc = new Map();
        for (const [name, ex] of here) {
            const s = String(ex).trim();
            if (!s) continue;
            if (isKeyframeInternalVar(name, blockId) || _kfIsNsInternal(name, blockId)) continue;
            // 查重：与前一段（该块之前生效的）相同 → 不写
            let prev = null;
            for (const [tt, m] of tlMap) { if (tt < bs - 1e-9 && m.has(name)) prev = m.get(name); }
            if (prev !== null && _norm(prev) === _norm(s)) continue;
            const bk = backMap.get(name);
            if (bk && _norm(bk.expr) === _norm(s)) continue;           // 与后段默认相同 → 不写（查重下沉）
            acc.set(name, s);
        }
        if (acc.size) empMid.set(bs, acc);
    }
    /* ★★★【2026-10-16 r13 · 用户规格：分段表达式的区间按「表达式真正变化的时刻」划分，
       **包前不包后**】逐变量建立一条「原始累积」变化时间线：把该变量在 tlMap 各时刻的
       有效表达式（含"此刻没有表达式"=null）串起来，只记录值发生变化的时刻。
       · empMid 只收录「与上一段/后段默认都不同」的条目 ⇒ 用户把分段框**清空/回落默认**
         的那一刻在 empMid 里没有标记；若拿 empMid 找上界，区间会一直延伸到结尾（错误）。
       · 这些变化时刻同时也是**时间块边界**：否则区间在块中途结束、而该块的 lerp 已被
         "区间接管"跳过 ⇒ 区间结束后的那段时间该变量无人赋值（读到上一帧残留）。 */
    const _midVarSeq = new Map();       // name -> [[t, expr|null], ...] 仅记录发生变化的时刻
    {
        const _tSorted = Array.from(tlMap.keys()).sort((a, b) => a - b);
        const _names = new Set();
        for (const t of _tSorted) for (const n of tlMap.get(t).keys()) _names.add(n);
        for (const n of _names) {
            if (isKeyframeInternalVar(n, blockId) || _kfIsNsInternal(n, blockId)) continue;
            const seq = [];
            let prev = null;            // null = 该变量此刻没有表达式
            for (const t of _tSorted) {
                const m = tlMap.get(t);
                const val = m.has(n) ? String(m.get(n)) : null;
                if (val !== prev) { seq.push([t, val]); prev = val; }
            }
            if (seq.length) _midVarSeq.set(n, seq);
        }
    }
    // ---- 时间块边界 = 帧时间 ∪ 有表达式的时间点 ∪ 表达式变化时刻 ∪ {0} ----
    //   因为中段覆盖现在**只在本块生效**，边界集合天然一致：每个覆盖都被完整包含在
    //   一个时间块里，不会出现"某块被部分覆盖"从而 lerp 冲掉覆盖结果的情况。
    const boundaries = new Set(times);
    for (const t of midSeq) if (empMid.has(t) && empMid.get(t).size) boundaries.add(t);
    for (const seq of _midVarSeq.values()) for (const [t] of seq) if (t > 1e-9) boundaries.add(t);
    boundaries.add(0);
    const _origLast = times.length ? times[times.length - 1] : null;
    const _bSorted = Array.from(boundaries).filter(Number.isFinite).sort((a, b) => a - b);
    const _bLast = _bSorted.length ? _bSorted[_bSorted.length - 1] : 0;
    const blocks0 = (_origLast === null || Math.abs(_bLast - _origLast) < 1e-9)
        ? _bSorted
        : _bSorted.map(t => (Math.abs(t - _bLast) < 1e-9 ? _origLast : t)).sort((a, b) => a - b);
    const nBlocks = blocks0.length;
    const condOf = (i) => {
        const t0 = blocks0[i];
        if (nBlocks === 1) return { cond: 'true', text: `${timeVar}>=0` };
        if (i === 0) return { cond: `${timeVar}<${tl(blocks0[1])}`, text: `${timeVar}<${tl(blocks0[1])}` };
        if (i === nBlocks - 1) return { cond: `${timeVar}>=${tl(t0)}`, text: `${timeVar}>=${tl(t0)}` };
        return { cond: `${timeVar}>=${tl(t0)}&&${timeVar}<${tl(blocks0[i + 1])}`, text: `${timeVar}>=${tl(t0)}&&${timeVar}<${tl(blocks0[i + 1])}` };
    };

    // ---- 数值矩阵（前向回填；首帧种子取变量当前值而非 0）----
    //   在任意块边界取值 = 「≤该边界的所有帧里的最后一个有值帧」（前向回填）。
    const _vAt = (V, t) => {
        let best = null;
        for (const ft of times) {
            if (!(ft <= t + 1e-9)) break;
            const f = frames.get(ft);
            if (f && f.has(V)) best = f.get(V);
        }
        return best;
    };
    const valMatrix = {};
    const seedMap = {};        // V -> 首块起点的「确定性种子」（口径见下）
    for (const V of drivenVars) {
        valMatrix[V] = [];
        /* ★★★【2026-10-18 r32 · 用户投诉「我的第一帧之前居然有缓动效果，方块在移动」】
           根因：时间块边界恒含 {0} ⇒ 首块区间恒为 [0, 第一帧)；而首块起点 `_vAt(V,0)` 在
           「用户没在 t=0 建帧」时取不到帧值，旧实现回退成 block.scope.vars 里的**实时残留值**
           ——上一次拖拽/播放停在哪、上一次编译时该变量求值成什么，种子就是什么。两个后果：
             ① 首帧之前凭空多出一段「残留值 → 首帧值」的缓动（用户看到的"方块在移动"）；
             ② 起点随编译时刻漂移（探针 _r32_kf_lead：同一个数据，实时值设 -3.344435 得
                `_start_zpos=-3.344435`、设 7.5 得 `_start_zpos=7.5`）。
           正解：兜底种子改为【该变量最早的帧值】——与「第一个关键帧之前保持该帧的值」这一通行
           语义一致；只有该变量**一个帧都没有**（纯派生/被驱动量）时才退回实时值。
           用户在 t=0 真建了帧的情形完全不变（那时 `_vAt(V,0)` 本就取到帧值，直接覆盖种子）。 */
        let lastVal = null;
        for (const _ft of times) {
            const _f = frames.get(_ft);
            if (_f && _f.has(V)) { lastVal = _f.get(V); break; }
        }
        if (lastVal === null) {
            const _dv = block.scope.vars.get('v.' + V);
            lastVal = (_dv && Number.isFinite(_dv.value)) ? _dv.value : null;
        }
        seedMap[V] = lastVal;
        for (let i = 0; i < nBlocks; i++) {
            const v = _vAt(V, blocks0[i]);
            if (v !== null) lastVal = v;
            valMatrix[V][i] = lastVal !== null ? lastVal : 0;
        }
    }
    const constMap = {};
    for (const V of drivenVars) {
        let same = true;
        for (let i = 1; i < nBlocks; i++) if (Math.abs(valMatrix[V][i] - valMatrix[V][0]) > 1e-9) { same = false; break; }
        constMap[V] = same;
    }

    const timeVar = `v.${kfNsName(blockId, 'time')}`;
    const segVar = `v.${kfNsName(blockId, 'seg_time')}`;
    const durVar = `v.${kfNsName(blockId, 'dur')}`;
    const tVar = `v.${kfNsName(blockId, 'u')}`;          // 插值因子（= 缓动后的 0..1 进度）
    const uVar = tVar;                                    // 缓动注册表的输入/输出变量
    const kvMarkVar = `v.${kfNsName(blockId, 'kv')}`;     // 前段结束分界标记
    const startN = V => `v.${kfNsName(blockId, 'start', V)}`;
    const targetN = V => `v.${kfNsName(blockId, 'target', V)}`;

    // ---- 前段（常量参数层）：本块要写进程序最前面的 v.X=… ----
    //   · driven 变量：跳过（由时间块参数 v.<id>_start_X / v.<id>_TX 供值）
    //   · 出现在后段的变量：跳过（后段会覆盖它，写前段只会造成"改了没用"的困惑）
    //   · 其余：常量写数值、表达式原样写（它是程序依赖的中间量，必须在前段可用）
    const leadMap = new Map();               // name -> 赋值语句
    for (const def of baseDefs) {
        if (def.internal) continue;
        if (drivenSet.has(def.name)) continue;
        if (backMap.has(def.name)) continue;
        leadMap.set(def.name, `v.${def.name}=${def.isConst ? fmtV(def.name, parseFloat(def.expr)) : def.expr};`);
    }
    // ★ 用户/预设的「常量参数」：scope.vars 里所有非内部、非驱动、非后段的常量都要写到最前面。
    //   用户要求：「放最前面是为了避免后面的 molang 代码会调用到空变量的情况」——
    //   例如预设计算里 v.scale=…math.sqrt(v.X2)… 依赖 v.side_a/v.side_b/v.angle，
    //   这些常量必须先在前段定义好。（旧实现只内联 baseDefs 里的，scope.vars 里的常量被漏掉。）
    try {
        for (const [key, dd] of block.scope.vars) {
            if (!key.startsWith('v.')) continue;
            const name = key.slice(2);
            if (leadMap.has(name) || drivenSet.has(name) || backMap.has(name)) continue;
            if (isKeyframeInternalVar(name, blockId) || _kfIsNsInternal(name, blockId)) continue;
            const ex = String(dd && dd.expr == null ? '' : dd.expr).trim();
            if (!ex || !isConstantExpr(ex)) continue;
            leadMap.set(name, `v.${name}=${fmtV(name, parseFloat(ex))};`);
        }
    } catch (e) { }
    // ★★ 编译产物里绝不能插 `/* */` 或 `//` 注释：本项目的 molang 词法器**不认注释**，
    //   一个 `/*x:关键帧驱动*/` 就会让整段程序求值失败、关键帧动画完全不动（实测事故）。
    //   （kfSplitStatements/kfStripMolangComments 只在**解析用户手写文本**时剥注释，
    //     真正交给 runBlockProgram 的产物必须是纯语句。）
    /* ★★★【2026-10-16 r13 · 用户投诉「一眼看去很多变量前后都是一个值，为啥还写进指令里 / 指令太不优雅」】
       全程同值（constMap）的驱动变量 = 常量 ⇒ **只在程序最前面无条件写一次**（constLead）。
         · 时间块条件互斥（每帧只执行一块）⇒ 把常量写进块里 = 只有那块执行时才赋值；
         · 无条件写在最前面 ⇒ 每帧都赋值：既满足 v10 铁律①的初衷（不依赖跨帧残留的 scope 状态、
           不出现「显示值取决于播放历史」），又不必在 N 个块里重复同一句话；
         · 派生链（postStr）排在它之后，引用这些常量的表达式照样拿得到值。
         · 与旧 v1 生成器（getKeyframeCommandText 里的「常量变量跳过」）口径一致 —— 那边早就这么做了。
       ⚠ 时间块 0 仍**保留一次**这类变量的 `_start_X/_TX`：反向解析靠块的 `_start_/_T` 恢复
         「帧值 + 变量集」，块里缺项会让导出再导入时该变量整个消失（见 v10 铁律①③）。
       ⚠ 解析侧（`kfSyncDataFromProgram` 的 shadow 判据）已同步放宽：无条件**数值**赋值
         不是「后段派生表达式遮蔽」，不得据此把变量剔出 `d.vars`。 */
    const constLead = [];
    for (const n of drivenVars) {
        if (constMap[n]) { constLead.push(`v.${n}=${fmtV(n, valMatrix[n][0])};`); continue; }
        // ★ 非常量驱动变量的「种子常量」必须写在时间块 0：它是程序执行期 v.<n> 的初值。
        //   否则 v.<n> 在程序里从未被直接赋值，后面的表达式引用它（例如
        //   v.zrot=math.atan2(-v.nx,-1/v.nl) 引用被关键帧驱动的 v.nl）在 FMBE 严格语义下
        //   会立刻抛「未定义的变量」，整帧回退上一帧状态。
        // ★ r32：种子常量必须与首块起点同源（seedMap），不得再用实时残留值 ——
        //   否则首块里仍会先写一次残留值（`v.zpos=-3.344435;`）再写 `_start_zpos`，首帧之前照样缓动。
        const v0b = (seedMap[n] !== null && seedMap[n] !== undefined) ? seedMap[n] : valMatrix[n][0];
        leadMap.set(n, `v.${n}=${fmtV(n, v0b)};`);
    }
    const inlined = Array.from(leadMap.values());

    const outBlocks = [];      // 时间块（含前段常量与块内 lerp）
    const outMid = [];         // 中段（分段表达式）
    const outPublic = [];      // 后段（查重下沉）

    // ---- 中段区间表（提前构建：块内 lerp 需要它判断"本块是否被中段接管"）----
    //   ★★★【2026-10-16 r13 · 用户规格】分段表达式的区间**不是按帧划分的**，而是按
    //     「该变量表达式真正发生变化的时刻」划分，且**包前不包后**：
    //       第 11 帧改了表达式、一直用到第 67 帧才换 ⇒ 条件必须是
    //       `time>=t(第11帧) && time<t(第67帧)`（= 第 10 帧结束那一刻起，到第 66 帧末）。
    //     旧实现直接把上界钉在「下一个帧时间」（blocks0[bi+1]）⇒ 表达式只活了一个帧间隔。
    //   现在：每个变量单独求它自己的「下一个变化时刻」作上界；起点+上界相同的变量合并成一条语句。
    const midRanges = [];               // 每项 = 一个变量的有效区间 {t, end, name, ex}
    const _midNextFor = (n, t) => {
        const seq = _midVarSeq.get(n);
        if (!seq) return null;
        for (const [tt] of seq) if (tt > t + 1e-9) return tt;
        return null;                    // null = 一直持续到结束
    };
    for (const mt of Array.from(empMid.keys()).sort((a, b) => a - b)) {
        for (const [n, ex] of empMid.get(mt)) midRanges.push({ t: mt, end: _midNextFor(n, mt), name: n, ex });
    }

    // ---- 块内 lerp 行（★r16 去冗余）----
    //   ★★【2026-10-17 r16 · 用户投诉「缓动函数被扔进逻辑运算符里」】
    //     旧实现把每个驱动变量、每个时间块的 lerp 各自独立成一条 `cond?(v.X=math.lerp(…));`，
    //     相邻互补块（`time<1.799` / `time>=1.799`）各写一条、外层再套一层三元 ⇒ 冗余且难读。
    //     正解：lerp 就近放进【该块已有的条件体内部】—— 与 `_start_X/_TX/_u` 同块求值、
    //     与 kfEasingAssign 紧邻，既保留「每块自包含」铁律（末帧变量不丢），又只有一层三元。
    //     ⚠ molang 不能按块传参，`cond?(…)` 这一层本身必需；本次消除的是"第二层重复三元"。
    //   本块区间被中段表达式接管 → 该变量的 lerp 不写（值由表达式负责）。
    const lerpLinesFor = (i) => {
        const bStart = blocks0[i], bEnd = (i === nBlocks - 1) ? Infinity : blocks0[i + 1];
        const lines = [];
        for (const V of drivenVars) {
            if (constMap[V]) continue;   // ★ r13：常量只写一次（顶部 constLead），块里不再重复
            let taken = false;
            for (const r of midRanges) {
                if (r.name !== V) continue;
                const rStart = r.t, rEnd = r.end === null ? Infinity : r.end;
                if (rStart < bEnd - 1e-9 && rEnd > bStart + 1e-9) { taken = true; break; }
            }
            if (taken) continue;
            const _angShortest = _kfIsAngleVar(V) && !_kfAngleNeedsLiteral(valMatrix[V]);
            lines.push(`v.${V}=${_angShortest ? 'math.lerprotate' : 'math.lerp'}(${startN(V)},${targetN(V)},${tVar});`);
        }
        return lines.join('');
    };

    // ---- 时间块 0：前段常量 + 分界标记 + 全部时间块参数 + 缓动 ----
    //   ★ 记号变量 v.<id>_kv 是「前段结束」的显式分界：
    //     反向解析据此把「前段常量（派生量）」与「关键帧驱动参数」区分开 ——
    //     否则 pre-generated 的 scale/extend_xrot 等常量会被误判成帧值，
    //     同步回 keyframeData 后凭空多出一堆"关键帧"，甚至影响画面。
    {
        const c = condOf(0);
        const parts = [];
        for (const s of inlined) parts.push(s);
        parts.push(`${kvMarkVar}=1;`);
        parts.push(`${segVar}=${fmt(blocks0[0])};`);
        const nextT = nBlocks > 1 ? blocks0[1] : blocks0[0];
        parts.push(`${durVar}=${fmt(nBlocks > 1 ? Math.max(nextT - blocks0[0], 0.0001) : 0.0001)};`);
        /* ★★★【2026-10-16 P0 修复 · 每个时间块必须"自包含"】——用户第 10 轮投诉的
           「帧的赋值和时间没有搞对 / 编辑时和渲染出来完全不同 / 末帧变量丢失」。
           根因（真浏览器实测 `_r10_trace.cjs` / `_r10_probe2.cjs`）：
             ① 时间块条件互斥（`t<1` / `>=1&&<2` / `>=2`）⇒ **每帧只有一个块执行**；
             ② 旧实现只在该变量数值**发生变化**的块里写 `_start_X`/`_TX`，且 `constMap`
                （全程同值）的变量只在第 0 块写一次 ⇒ 运行到第 1 块以后，
                `v.side_b`/`v.angle`/`v.extend_*` 等**从未被本帧赋值**，
                读到的是「上一帧遗留在 scope 里的旧值」（本引擎 molang 作用域跨帧持久化）
                ⇒ **显示值取决于播放历史**，正是"编辑时和渲染不一致"的来源；
             ③ 反向解析（`kfParseProgramText`）按块读 `_start_/_T`，块内缺项 ⇒
                导出的文本再导入时，**中间帧与末帧只剩 1 个变量**（实测末帧 18 个变量
                只剩 `side_a`），这就是用户说的「最末帧有时候会有变量丢失」。
           正解：**每个时间块无条件写全部被驱动变量的 `_start_X` 与 `_TX`**，
           使任一时刻执行任一块时，该帧所需的所有参数都已被本帧显式赋值 ——
           「帧的赋值」与「时间」一一对应，不依赖跨块/跨帧残留，正反解析恒等。 */
        // ★★★【2026-10-16 r13 · 用户规格「能省就省」】时间块参数层**只服务「会变化」的变量**：
        //   全程同值（constMap）的变量已在顶部 constLead 无条件写一次，**任何块都不再重复**
        //   `_start_X`/`_TX`（用户投诉：「明明只动了 xbasepos，其余变量全被记录、还带一堆内部参数」）。
        //   ⚠ 反向解析靠 `_start_X`/`_TX` 恢复「帧值 + 变量集」——所以解析侧必须同步：
        //     `kfParseProgramText` 抓「最前面的常量」（frontConst）并把它补进**每一帧**
        //     （`kfSyncDataFromProgram` / `parseKeyframeFromMolang` / `parseSingleKeyframeCommand`）。
        //     只改编译端不改解析端 ⇒ 必然复发「末帧变量丢失」（实测 _r10_verify A1：17/17/17 → 17/2/2）。
        for (const V of drivenVars) {
            if (constMap[V]) continue;      // ★ r13：常量只写一次（顶部 constLead），块里不再重复
            parts.push(`${startN(V)}=${fmtV('start_' + V, valMatrix[V][0])};`);
            parts.push(`${targetN(V)}=${fmtV('T' + V, nBlocks > 1 ? valMatrix[V][1] : valMatrix[V][0])};`);
        }
        parts.push(kfEasingAssign(blockId, 0, blocks0, d, timeVar, segVar, durVar, uVar));
        parts.push(lerpLinesFor(0));      // ★r16：本块的 lerp 就近写在块内（去冗余）
        outBlocks.push(`${c.text}?(${parts.join('')});`);
    }
    // ---- 时间块 1..N-1（同样自包含：全部 `_start_X` / `_TX`，见上方铁律）----
    for (let i = 1; i < nBlocks; i++) {
        const c = condOf(i);
        const parts = [];
        parts.push(`${segVar}=${fmt(blocks0[i])};`);
        const isLast = (i === nBlocks - 1);
        const dur = isLast ? 0.0001 : Math.max(blocks0[i + 1] - blocks0[i], 0.0001);
        parts.push(`${durVar}=${fmt(dur)};`);
        for (const V of drivenVars) {
            /* ★ r13：常量变量（constMap）在顶部 constLead 写一次，任何块都不再重复 ——
               去噪时**必须同步改解析端**（frontConst 补进每一帧），否则复发 v10 铁律①③
               的「末帧变量丢失」（实测 _r10_verify A1：跳过即 parsedN 17→2）。 */
            if (constMap[V]) continue;
            const sv = valMatrix[V][i];
            const tv = isLast ? sv : valMatrix[V][i + 1];
            parts.push(`${startN(V)}=${fmtV('start_' + V, sv)};`);
            parts.push(`${targetN(V)}=${fmtV('T' + V, tv)};`);
        }
        parts.push(kfEasingAssign(blockId, i, blocks0, d, timeVar, segVar, durVar, uVar));
        parts.push(lerpLinesFor(i));      // ★r16：本块的 lerp 就近写在块内（去冗余）
        outBlocks.push(`${c.text}?(${parts.join('')});`);
    }

    // ---- 中段（分段表达式层）----
    //   区间表 midRanges 已在块循环之前构建（见 lerpLinesFor 上方注释）。
    const _midCond = (t, end) => (t <= 1e-9)
        ? ((end === null) ? `${timeVar}>=0` : `${timeVar}<${tl(end)}`)
        : ((end === null) ? `${timeVar}>=${tl(t)}` : `${timeVar}>=${tl(t)}&&${timeVar}<${tl(end)}`);
    const _midGroups = new Map();        // key: t|end → 同区间的变量合并成一条
    for (const r of midRanges) {
        const k = `${r.t}|${r.end === null ? 'inf' : r.end}`;
        if (!_midGroups.has(k)) _midGroups.set(k, { t: r.t, end: r.end, parts: [] });
        _midGroups.get(k).parts.push(`v.${r.name}=${String(r.ex).replace(/;\s*$/, '')};`);
    }
    for (const g of _midGroups.values()) outMid.push(`${_midCond(g.t, g.end)}?(${g.parts.join('')});`);

    // ---- 数值驱动变量赋值已并入各时间块条件体内（★r16 去冗余）----
    //   见上方 `lerpLinesFor(i)`：lerp 在【本块条件体】内与其 `_start_X/_TX/_u` 同块求值，
    //   既保留「每块自包含」（末帧变量不丢），又不再出现"第二层重复三元"。
    //   本段区间被中段表达式接管的变量照旧不写（值由中段表达式负责）。

    // ---- 后段（查重下沉层）：公开变量每帧求值一次 ----
    //   ★★ 常量必须排在非常量表达式**前面**：molang 求值顺序敏感且**不宽容**，
    //      `v.custom=v.a*3;` 排在 `v.a=2;` 之前会立刻抛「未定义的变量 v.a」，
    //      整帧回退 ⇒ 关键帧动画完全不动（复核队友实测反例 A）。
    /* ★★★【2026-10-14 P0 修复 · 用户投诉「数据表数值压根没被应用」的真根因】
       旧实现把**所有**后段表达式（含 `v.zrot=v.myval*10` 这种"读驱动变量"的）
       塞进 `outPublic`，而 outPublic 排在 `outLerp`（驱动变量的 lerp 行）**之前** ⇒
       表达式读到的 `v.myval` 是**上一帧的陈旧值**（种子/上次 lerp 的结果）。
       实测：`v.myval` 帧值 30/60，程序却是
         v.Cube_time<1?(… v.myval=60; …);        ← 种子
         v.zrot=v.myval*10;                       ← 读旧值 ⇒ 600（应 300）
         v.Cube_time<1?(v.myval=math.lerp(30,60,u));  ← 真正插值在最后
       ⇒ t=0 得 600、t=1 得 450，依赖链完全错位，用户看到"自定义变量完全无效/数值没被应用"。
       正解：**区分两类表达式**
         · 常量（constStr）：仍放前面（被引用前必须已定义）
         · 引用了「本块被驱动变量」的表达式：**推迟到 outLerp 之后**（用最新插值结果算）
         · 其余非常量表达式：留在原位（保持既有依赖顺序，避免回归）
       判据用「表达式里是否出现 v.<drivenName> 标识符」——比通用拓扑排序保守、可预测。 */
    /* ★★★【2026-10-16 P0 修复 · 派生表达式链必须整体排在「驱动变量 lerp」之后】
       用户第 10 轮投诉：「一开始编辑可以看到派生表达式因为自定义自变量的改变而发生改变，
       但是后面不知道为什么就突然发生了问题，数据被覆写」/「编辑时和渲染出来完全不同」。
       真浏览器实测（`_r10_trace.cjs` T2，逐 0.1s 采样 + 独立复算逐点比对）：
         t=0.1 运行值 scale=1.2247，按当时 side_a=1.2 独立复算应为 1.544
         ⇒ **scale 永远比 side_a 慢一拍**（实测 21/21 个采样点全部不匹配）。
       根因：后段派生链 `v.Q1=v.fit_a*v.fit_a; … v.scale=math.sqrt(...)` 排在 outLerp 之前，
       而 `fit_a = math.max(math.abs(v.side_a),0.01)` 这类"间接依赖驱动变量"的表达式
       不匹配旧的 `_drivenRe`（只匹配**直接**出现 `v.<驱动名>` 的表达式）⇒ 留在原位
       ⇒ 派生链读到的是**上一帧遗留的 v.side_a**。
       正解（与用户给的参考样式一致）：**全部非常量派生表达式一律排到 outLerp 之后**，
       保持它们彼此之间的原有顺序（`v.fit_a` → `v.Q1` → … → `v.scale` 依赖链不断）。
       常量表达式仍留在前面（它们是派生链的输入，必须先定义）。
       这样「派生量在指令末尾接收输入、算出结果」才真正成立。 */
    const constStr = [], postStr = [];
    for (const bk of backCand) {
        if (bk.isConst) constStr.push(`v.${bk.name}=${fmtV(bk.name, parseFloat(bk.expr))};`);
        else postStr.push(`v.${bk.name}=${String(bk.expr).replace(/;\s*$/, '')};`);
    }
    if (constStr.length) outPublic.push(constStr.join(''));

    // 用户程序里那些无法解析成 v.X=… 的语句（return / loop / 条件块等）原样保留在末尾
    const strays = baseClean.filter(st => !/^v\.[A-Za-z_][A-Za-z0-9_]*\s*=/.test(st));
    for (const st of strays) outPublic.push(st + ';');

    // ---- 组装顺序（每帧从上到下执行）----
    //   ① 时间变量 + 时间块（前段常量 + seg/dur/start/T + 缓动因子 + ★r16 本块 lerp）
    //   ② 中段：本区间的分段表达式（压在数值之上 = 该段被接管）
    //   ③ 后段：查重下沉的**常量**表达式（派生链的输入，必须先定义）
    //   ④ 末段：**全部非常量派生表达式**（读取①刚算好的驱动值再计算）
    // ★ 时间变量量化到 1ms：保证 `v.<id>_time>=t` 这类时间块条件与帧时间**精确命中**，
    //   不受 q.anim_time 的浮点噪声影响（否则 0.9999999999999999 会落回上一块 → 改值没反应）。
    // ★★【2026-10-16】「派生链必须在 lerp 之后」是硬约束：r16 把 lerp 并入①时间块后，
    //   它依然排在④末段派生表达式之前，约束继续成立（实测 21/21 采样匹配）。
    // ★★【2026-10-17 r16】原独立的最外层 outLerp 段已删除 —— lerp 就近写在时间块条件体内，
    //   消除「同一变量同一块的第二层冗余三元」（用户投诉「缓动被扔进逻辑运算符里」）。
    const out = `${timeVar}=math.round(q.anim_time*1000)/1000;` + constLead.join('') + outBlocks.join('') + outMid.join('') + outPublic.join('') + postStr.join('');
    // ---- 诊断：后段同名遮蔽（同名变量既被关键帧驱动、又在后段被写）----
    const shadow = drivenVars.filter(n => backMap.has(n));
    kfLastShadowWarn = shadow;
    return out;
}
// 某时间块末尾的缓动因子赋值（区间可挂不同缓动；没注册就线性）
//  ★ 铁律：0..1 线性因子与缓动结果都落在同一个变量 v.<id>_u 上，分两条语句写。
//    绝不能「把结果写进 v.<id>_t 而输入读 v.<id>_t」（自引用 → 首帧 undefined → 全段 NaN，
//    实测事故：关键帧动画完全不动）。v.<id>_t 只是 v.<id>_u 的别名（lerp 行读它）。
function kfEasingAssign(blockId, i, blocks0, d, timeVar, segVar, durVar, uVar) {
    const em = (d && d.easings instanceof Map) ? d.easings : new Map();
    const t0 = blocks0[i];
    let key = 'linear', best = -Infinity;
    for (const [et, k] of em) if (et <= t0 + 1e-9 && et > best) { best = et; key = k; }
    const raw = `v.${kfNsName(blockId, 'seg_start')}`;
    const built = kfEasingOf(key).build(uVar);
    // linear 时 build(uv) 返回的就是 uv 本身 → 跳过自我赋值
    const easeLine = (built === uVar) ? '' : `${uVar}=${built};`;
    return `${raw}=${segVar};${uVar}=math.max(0,math.min((${timeVar}-${raw})/${durVar},1));${easeLine}`;
}

// 编译并写入方块（脏检查缓存）：写 scope.program，随后 block.refresh() 即生效
// ★ v2：不再排除 molang 编辑模式的方块 —— 用户手写程序会被原样保留进编译产物（前/后段）。
function kfEnsureProgram(block, force) {
    if (!block || !block.scope) return false;
    if (!hasKeyframeAnimation(block.id)) return false;
    kfCaptureBase(block);                     // ★ 先钉住用户基线，再编译
    const sig = kfCompileSig(block);
    const cached = kfCompileCache.get(block.id);
    if (!force && cached && cached.sig === sig && block.scope.program === cached.program) return true;
    const prog = kfCompileProgram(block.id);
    if (!prog) return false;
    kfCompileCache.set(block.id, { sig, program: prog });
    block.scope.program = prog;
    block.scope.kfLastCompiled = prog;        // 让 kfCaptureBase 认出"这是我们自己写的"
    return true;
}
// 关键帧动画在运行时的施加入口（替代逐变量赋值）：编译 → 执行
function kfApplyCompiled(block, time) {
    if (!block || !block.scope) return false;
    if (!kfEnsureProgram(block)) return false;
    block.refresh();                    // recompute() 检测到 program 非空 → 用 molang 引擎执行
    return true;
}
// 导出用：关键帧方块 → 编译产出的 molang 程序
function kfProgramForExport(blockId) {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !block.scope) return null;
    return kfCompileProgram(blockId);
}

/* ----------------------------------------------------------------------------
   反向解析：molang 程序 → 时间表结构
   ★ 真相源是 scope.program（molang 程序）本身。时间表面板只是它的一个视图，
     编辑时间表 = 改写程序里对应的片段。这样「导入的预设动画时间变量」也能被识别、
     解析并显示到列表里，不需要用户重新录一遍。
   识别格式（生成器输出 + 旧版 lerp 关键帧导出）：
     v.<id>_time=q.anim_time;
     <timeVar><a | >=a&&<b | >=a ?( v.seg_time=..;v.dur=..;v.start_X=..;v.TX=..; );
     cond?( v.X=<表达式>; );                      // 区间特殊表达式
     v.t=<缓动表达式>;
     v.X=math.lerp(v.start_X,v.TX,v.t);           // 数值插值
     v.X=<常量或表达式>;                            // 公共段（查重下沉）
   -------------------------------------------------------------------------- */
// 按顶层分号切分语句（忽略括号内与字符串内的分号；// 与 /* */ 注释先剥掉 ——
// 用户手写的 molang 程序常带注释，注释里的分号/括号会打乱切分）
function kfStripMolangComments(text) {
    let out = '', inStr = false, q = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i], n = text[i + 1];
        if (inStr) { out += c; if (c === q && text[i - 1] !== '\\') inStr = false; continue; }
        if (c === '"' || c === "'") { inStr = true; q = c; out += c; continue; }
        if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
        if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; out += ' '; continue; }
        out += c;
    }
    return out;
}
function kfSplitStatements(text) {
    const src = (text.indexOf('//') >= 0 || text.indexOf('/*') >= 0) ? kfStripMolangComments(text) : text;
    const out = [];
    let depth = 0, cur = '', inStr = false, q = '';
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (inStr) { cur += c; if (c === q && src[i - 1] !== '\\') inStr = false; continue; }
        if (c === '"' || c === "'") { inStr = true; q = c; cur += c; continue; }
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        if (c === ';' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
        cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}
const KF_INTERNAL_RE = /^(start_|T|seg_|dur_)/;
/* ★★【2026-10-14 架构修复 · 用户明确要求「支持所有名称的自定义变量」】
   这里同样不能只靠**名字前缀**判内部量，否则用户自定义变量（total / segment / duration / StartTime…）
   会被无声过滤掉。
   判据顺序：命名空间内部量（结构性） → 全局共享时间量 → **用户显式纳入的一律放行** →
   最后才是旧版前缀兼容（仅当没有方块命名空间上下文时，避免前缀枚举吞掉带上下文的用户变量）。 */
function kfIsInternalName(n, blockId) {
    if (blockId && typeof _kfIsNsInternal === 'function' && _kfIsNsInternal(n, blockId)) return true;
    if (n === 't' || n === 'seg_time' || n === 'dur') return true;
    // ★ 用户显式纳入 → 一律放行（任何名字都算用户变量）
    try {
        if (blockId && typeof keyframeData !== 'undefined' && keyframeData && keyframeData.has(blockId)) {
            const d = keyframeData.get(blockId);
            if (d && d.vars instanceof Set && d.vars.has(n)) return false;
            if (d && d.frames instanceof Map) { for (const [, m] of d.frames) { if (m && m.has && m.has(n)) return false; } }
            if (d && d.exprs instanceof Map) { for (const [, m] of d.exprs) { if (m && m.has && m.has(n)) return false; } }
        }
    } catch (e) { }
    // 旧版裸名兼容：只在「无命名空间上下文」的裸名上兜底（v1 程序 v.start_X / v.TX）。
    if (!blockId) return KF_INTERNAL_RE.test(n);
    return false;
}

/* 解析结果结构（v2）：
   { timeVar: 前缀名（不含 v.）,   times: [数值帧时间…],
     blkStart: Map<time, Map<name, num>>,   // 时间块里 v.<id>_start_X / v.<id>_TX 或旧版裸 start_X
     initVals: Map<name, num>,              // 前段常量参数（程序里 v.X=<常量>）
     mid: Map<time, Map<name, expr>>,       // 中段：按区间生效的截断表达式
     publics: Map<name, expr>,              // 后段（查重下沉）/ 无条件赋值
     lerpVars: Set<name>,                   // 被 lerp 驱动的变量（v1/v2 两种写法都认）
     values / segExprs / times / easingExpr / raw   // 向后兼容别名
   } */
function kfParseProgramText(text) {
    if (!text || !text.trim()) return null;
    const res = {
        timeVar: null, times: [], blkStart: new Map(), initVals: new Map(),
        mid: new Map(), publics: new Map(), lerpVars: new Set(),
        values: new Map(), segExprs: new Map(), easingExpr: null, raw: text,
        frontConst: new Map(),          // ★ r13：程序最前面的无条件纯数值赋值（constLead 常量）
        ns: null, nsDelims: null
    };
    /* ★★★【2026-10-16 r13 · 编译产物去噪后的反向解析】编译器把「全程同值」的驱动变量
       只写一次，放在**程序最前面**（`v.Cube_time=…;v.xpos=0;…` 之后、第一个条件块之前）。
       这些常量不再出现在任何时间块里，所以**不能**靠块的 `_start_X/_TX` 恢复 ——
       必须单独抓出来、补进每一帧（否则导出再导入丢变量 = v10 铁律①③的「末帧变量丢失」）。
       判据 = 「位置」：出现在**首个条件块之前**的无条件纯数值赋值。 */
    let sawCond = false;            // 是否已遇到第一个条件块（`cond?(...)`）
    const bumpTime = (t) => { if (Number.isFinite(t) && !res.times.includes(t)) res.times.push(t); };
    const _aliasBlk = (t, n, v) => {
        if (!res.values.has(t)) res.values.set(t, new Map());
        res.values.get(t).set(n, v);
        bumpTime(t);
    };
    for (const st of kfSplitStatements(text)) {
        // ---- 时间变量绑定：v.<id>_time=q.anim_time ; 兼容旧版 v.seg_time=...（在条件块里）----
        let m = /^v\.([A-Za-z0-9_]*?)_?time\s*=\s*q\.anim_time$/.exec(st);
        if (m) { res.timeVar = m[1] ? m[1] + '_time' : 'time'; continue; }
        // ---- 条件块 cond?( ... ) ----
        m = /^([\s\S]+?)\?\(([\s\S]*)\)$/.exec(st);
        if (m) {
            sawCond = true;                 // ★ r13：其后所有无条件赋值都不再算「最前面的常量」
            const cond = m[1];
            // 该条件的时间区间（只认本方块命名空间或裸 timeVar）
            let cStart = null, cEnd = null;
            const tvRe = (t) => {
                const leaf = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return new RegExp('v\\.' + leaf + '\\s*>=\\s*(-?[\\d.]+)', 'i');
            };
            const tvLt = (t) => {
                const leaf = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return new RegExp('v\\.' + leaf + '\\s*<\\s*(-?[\\d.]+)', 'i');
            };
            const cands = [];
            if (res.timeVar) cands.push(res.timeVar);
            if (/^v\.[A-Za-z0-9_]*?time/i.test(cond)) { const mm = /^v\.([A-Za-z0-9_]*?time)/i.exec(cond.replace(/^\s*/, '')); if (mm) cands.push(mm[1]); }
            // v2：先按「同一条件里出现的 >= 与 <」定区间
            for (const t of (cands.length ? cands : [res.timeVar || 'time'])) {
                const mg = tvRe(t).exec(cond); if (mg) { cStart = parseFloat(mg[1]); break; }
            }
            for (const t of (cands.length ? cands : [res.timeVar || 'time'])) {
                const ml = tvLt(t).exec(cond); if (ml) { cEnd = parseFloat(ml[1]); break; }
            }
            // 条件里的命名空间线索（v.<id>_seg_time= 或 v.<id>_start_）
            if (!res.ns) {
                const mn = /v\.([A-Za-z0-9_]+)_seg_time\s*=/.exec(m[2]) || /v\.([A-Za-z0-9_]+)_start_([A-Za-z0-9_]+)\s*=/.exec(m[2]);
                if (mn) res.ns = mn[1];
            }
            const ns = res.ns;
            const inner = kfSplitStatements(m[2]);
            const pairs = [];
            let segT = cStart;
            // ★ 本块里除 v.X=math.lerp(...) 之外的「其它 v.X=表达式」才算法分段表达式。
            //   （编码器自己的插值行 `cond?(v.X=math.lerp(...));` 不能被误认成分段表达式，
            //     否则同步回数据后，面板会把这个变量标成"分段"，而用户从没编辑过它。）
            const midHere = new Map();
            // ★ 分界标记之前的 v.X=常量 属于「前段常量参数」（派生量），不是关键帧帧值
            const kvMark = ns ? new RegExp('^v\\.' + ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_kv\\s*=') : null;
            // ★★ 前段常量区的精确范围 = 「kv 标记之前」。用字符偏移判定，而不是"遇到标记翻标志位"：
            //   标志位写法下，若标记因故缺失/位置变化，`if (inLead) continue;` 会**静默吞掉整块的
            //   中段覆盖行**（复核队友实测反例 B：程序里明明有 `v.<id>_time<2?(v.xpos=7;);`，
            //   kfParseProgramText().mid 却是空的 ⇒ 分段表达式根本无法从程序反向恢复）。
            //   现在：只有「确实在标记之前」的常量才算前段派生量；没有标记 → 该块没有前段区，
            //   所有 v.X=… 都按 mid / 帧值正常处理。
            let leadEnd = -1;
            if (ns && kvMark) {
                const mmkv = new RegExp('v\\.' + ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_kv\\s*=\\s*1\\s*;').exec(m[2]);
                if (mmkv) leadEnd = mmkv.index + mmkv[0].length;
            }
            const _isLeadConst = (idx) => leadEnd > 0 && idx >= 0 && idx < leadEnd;
            let hasBlockParams = false;      // 本条件块是否含时间块参数（_start_/_T → 它是数值时间块）
            for (const s2 of inner) {
                let m2;
                const _s2At = m[2].indexOf(s2);
                // seg_time（v2 命名空间 / v1 裸）
                if (ns) { m2 = new RegExp('^v\\.' + ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_seg_time\\s*=\\s*(-?[\\d.eE+]+)$').exec(s2); }
                if (!m2) m2 = /^v\.seg_time\s*=\s*(-?[\d.eE+]+)$/.exec(s2);
                if (m2) { segT = parseFloat(m2[1]); continue; }
                // dur
                if (ns && new RegExp('^v\\.' + ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_dur\\s*=').test(s2)) continue;
                if (/^v\.dur\s*=/.test(s2)) continue;
                // 缓动因子 / 原始线性因子 / 段起点：v.<id>_t / v.<id>_u / v.<id>_seg_start（也认 v1 的裸 v.t）
                if (ns) {
                    const pre0 = ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    if (new RegExp('^v\\.' + pre0 + '_(t|u|seg_start)\\s*=').test(s2)) continue;
                }
                if (/^v\.(t|u|seg_start)\s*=/.test(s2)) { if (!res.easingExpr) res.easingExpr = s2.replace(/^v\.t\s*=\s*/, '').trim(); continue; }
                // start_X / TX 参数（v2 命名空间）
                if (ns) {
                    const pre = ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    m2 = new RegExp('^v\\.' + pre + '_start_([A-Za-z0-9_]+)\\s*=\\s*(-?[\\d.eE+]+)$').exec(s2);
                    if (m2) { pairs.push({ name: m2[1], from: parseFloat(m2[2]) }); hasBlockParams = true; continue; }
                    m2 = new RegExp('^v\\.' + pre + '_T([A-Za-z0-9_]+)\\s*=\\s*(-?[\\d.eE+]+)$').exec(s2);
                    if (m2) { const p = pairs.find(x => x.name === m2[1]); if (p) p.to = parseFloat(m2[2]); res.lerpVars.add(m2[1]); hasBlockParams = true; continue; }
                }
                // 旧版裸 start_X / TX（以及 v1 的 v.<id>_start_X 若不认 ns 也兜一下）
                m2 = /^v\.(?:[A-Za-z0-9_]+_)?start_([A-Za-z0-9_]+)\s*=\s*(-?[\d.eE+]+)$/.exec(s2);
                if (m2) { pairs.push({ name: m2[1], from: parseFloat(m2[2]) }); hasBlockParams = true; continue; }
                m2 = /^v\.(?:[A-Za-z0-9_]+_)?T([A-Za-z0-9_]+)\s*=\s*(-?[\d.eE+]+)$/.exec(s2);
                if (m2) { const p = pairs.find(x => x.name === m2[1]); if (p) p.to = parseFloat(m2[2]); res.lerpVars.add(m2[1]); hasBlockParams = true; continue; }
                // 其它 v.X=值
                m2 = /^v\.([A-Za-z0-9_]+)\s*=\s*(-?[\d.eE+]+)$/.exec(s2);
                if (m2 && !kfIsInternalName(m2[1]) && !_kfIsNsInternal(m2[1], ns || '')) {
                    const _condTrue = /^\s*true\s*$/.test(cond);
                    const _isLead = _isLeadConst(_s2At);
                    if (cStart === null && cEnd === null && !_condTrue) { res.initVals.set(m2[1], parseFloat(m2[2])); continue; }
                    if (_isLead) continue;      // 分界标记之前的常量 = 前段常量参数（派生量，不是帧值/覆盖）
                    // ★ 只有「含时间块参数的数值时间块」里的常量才算帧值；
                    //   纯表达式条件块（如 `true?(v.xpos=7;);` = t=0 的区间覆盖）绝不进 initVals，
                    //   否则反向解析会把 t=0 的分段表达式误判成前段常量、mid 丢失（复核队友实测反例 B）。
                    if (!hasBlockParams) { midHere.set(m2[1], String(m2[2]).trim()); continue; }
                    pairs.push({ name: m2[1], from: parseFloat(m2[2]) });
                    continue;
                }
                // 其它 v.X=表达式
                m2 = /^v\.([A-Za-z0-9_]+)\s*=\s*([\s\S]+)$/.exec(s2);
                if (m2) {
                    const nm = m2[1], ex = m2[2].trim();
                    if (kfIsInternalName(nm) || _kfIsNsInternal(nm, ns || '')) continue;
                    if (ns && nm.indexOf(ns + '_') === 0) continue;
                    // ★ 编译器自己的插值行不是分段表达式（否则同步后会把驱动变量误标成"分段"）
                    if (/^math\.(lerp|lerprotate)\s*\(/.test(ex)) { res.lerpVars.add(nm); continue; }
                    if (cStart === null && cEnd === null) continue;    // 前段块里的表达式赋值 → 保留在原文，不回写
                    midHere.set(nm, ex);
                }
            }
            const bt = (segT === null || segT === undefined) ? cStart : segT;
            if (bt !== null && bt !== undefined && Number.isFinite(bt)) {
                for (const p of pairs) {
                    if (!res.blkStart.has(bt)) res.blkStart.set(bt, new Map());
                    res.blkStart.get(bt).set(p.name, p.from);
                    _aliasBlk(bt, p.name, p.from);
                }
                bumpTime(bt);
            }
            // 中段表达式挂到「本块起始时间」或「根据块条件推出的起始时间」
            const midKey = (bt !== null && bt !== undefined) ? bt : (cStart !== null ? cStart : 0);
            if (midHere.size) {
                if (!res.mid.has(midKey)) res.mid.set(midKey, new Map());
                for (const [nm2, ex2] of midHere) {
                    res.mid.get(midKey).set(nm2, ex2);
                    if (!res.segExprs.has(midKey)) res.segExprs.set(midKey, new Map());
                    res.segExprs.get(midKey).set(nm2, ex2);
                }
                bumpTime(midKey);
            }
            continue;
        }
        // ---- 无条件语句 ----
        m = /^v\.([A-Za-z0-9_]+)\s*=\s*([\s\S]+)$/.exec(st);
        if (!m) continue;
        const nm = m[1], ex = m[2].trim();
        if (/^v\.([A-Za-z0-9_]*?)_?time\s*=\s*q\.anim_time$/.test(st)) continue;
        // 无条件 lerp（v1/v2 旧版）→ 只登记为驱动变量，不进后段
        if (/^math\.(lerp|lerprotate)\s*\(/.test(ex)) { res.lerpVars.add(nm); continue; }
        // 命名空间内部量：v.<ns>_t / _u / _seg_start / _seg_time / _dur / _start_X / _TX
        if (_kfIsNsInternal(nm, res.ns || '')) {
            if (nm === 't' && !res.easingExpr) res.easingExpr = ex;
            continue;
        }
        // 裸 v.t / v.u / v.seg_time / v.dur / 裸 start_*/T*
        if (/^(t|u|seg_start|seg_time|dur)$/.test(nm) || kfIsInternalName(nm)) {
            if (nm === 't' && !res.easingExpr) res.easingExpr = ex;
            continue;
        }
        // ★ r13：首个条件块**之前**的无条件纯数值赋值 = 编译器为「全程同值」驱动变量写的
        //   constLead 常量 → 单独记录，供反向解析补进每一帧（见函数头注释）。
        if (!sawCond && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(ex).trim())) {
            res.frontConst.set(nm, parseFloat(ex));
        }
        res.publics.set(nm, ex);
    }
    /* ★★★【2026-10-16 r13】把「程序最前面的常量」（frontConst）并回每个时间块的 `blkStart`：
       编译器对「全程同值」的驱动变量做了去噪（块里不再写 `_start_X`/`_TX`），
       而所有反向解析的消费者（时间表 / Gizmo / 导入）都按 `blkStart` 读帧值 ⇒
       不并回去就等于「导出再导入丢变量」（实测 _r10_verify A1：17 → 2）。 */
    if (res.frontConst.size && res.blkStart.size) {
        for (const [, m] of res.blkStart) {
            for (const [n, v] of res.frontConst) if (!m.has(n)) m.set(n, v);
        }
    }
    res.times.sort((a, b) => a - b);
    return res;
}
/* 程序分类（r16 · 用户诉求 4「手改 molang 不应一刀切拒绝」）
   决定「这份 scope.program 能否作为关键帧真相」：
   · 'none'          空程序 / 无 q.anim_time                      → 不反解
   · 'keyframe'      含 q.anim_time 且解析出时间块/帧值            → 可反解（含用户手改末段派生表达式的情形）
   · 'keyframe-lite' 含 q.anim_time 但只解析出 lerp/常量（无时间块）→ 可部分反解
   · 'foreign'       含 q.anim_time 但解析不出任何关键帧结构        → 不反解（真外部程序，保留原文）
   ★ 判据以 kfParseProgramText 的**实际产出**为准（不靠标志位），与 kfResetBaseIfForeign 同源，避免漂移。 */
function kfClassifyProgram(block) {
    const text = String(block && block.scope ? (block.scope.program || '') : '');
    if (!text.trim() || !/q\.anim_time/.test(text)) return 'none';
    let p = null; try { p = kfParseProgramText(text); } catch (e) { p = null; }
    if (!p) return 'foreign';
    if (p.blkStart && p.blkStart.size) return 'keyframe';
    if ((p.times && p.times.length) || (p.lerpVars && p.lerpVars.size)) return 'keyframe-lite';
    return 'foreign';
}
// 解析方块的 program 并回填 keyframeData（导入预设动画 / molang 编辑器改动后同步用）
// ★ v2：合并式同步（不整表清空）—— 只要解析里有该变量的数值就更新，没有就保留原值。
//   否则「一帧只有部分变量」的程序同步一次就会把其它变量的帧值抹掉。
// ★ 绝不动 d.vars（用户的「要管哪些变量」意图）；只在 d.vars 为空且解析出 lerp 变量时补齐。
function kfSyncDataFromProgram(block, opts) {
    if (!block || !block.scope) return false;
    const text = block.scope.program || '';
    if (!/q\.anim_time/.test(text)) return false;
    const p = kfParseProgramText(text);
    if (!p) return false;
    const d = kfData(block.id, true);
    let changed = false;
    // 1) 数值帧：以时间块起始值（或无条件常量）为准
    for (const [t, m] of p.blkStart) {
        for (const [n, v] of m) {
            if (isKeyframeInternalVar(n, block.id) || _kfIsNsInternal(n, block.id) || kfIsLegacyScaffoldTwin(n, block.id, text)) continue;   // ★ r18：v1 裸名脚手架（有命名空间孪生）不写进数据
            if (!Number.isFinite(v)) continue;
            if (!(d.frames instanceof Map)) d.frames = new Map();
            if (!d.frames.has(t)) d.frames.set(t, new Map());
            const f = d.frames.get(t);
            if (f.get(n) === v) continue;
            f.set(n, v); changed = true;
        }
    }
    // 1b) ★★ r13：程序**最前面**的常量（编译器 constLead = 全程同值的驱动变量）——它们不再
    //     出现在任何时间块里（去噪后块内无 `_start_X`/`_TX`），必须补进**每一帧**，
    //     否则导出再导入这批变量整个消失（v10 铁律①③的「末帧变量丢失」再现）。
    if (p.frontConst.size && p.times.length) {
        if (!(d.frames instanceof Map)) d.frames = new Map();
        if (!(d.vars instanceof Set)) d.vars = new Set();
        const _ts = p.times.filter(Number.isFinite).sort((a, b) => a - b);
        for (const [n, v] of p.frontConst) {
            if (isKeyframeInternalVar(n, block.id) || _kfIsNsInternal(n, block.id) || kfIsLegacyScaffoldTwin(n, block.id, text)) continue;   // ★ r18：v1 裸名脚手架（有命名空间孪生）不写进数据
            if (!Number.isFinite(v)) continue;
            for (const t of _ts) {
                if (!d.frames.has(t)) d.frames.set(t, new Map());
                const f = d.frames.get(t);
                if (f.get(n) === v) continue;
                f.set(n, v); changed = true;
            }
            if (!d.vars.has(n)) { d.vars.add(n); changed = true; }
        }
    }
    // 2) 分段表达式（只由中段覆盖重建；后段/前段常量不写入）
    if (!(d.exprs instanceof Map)) d.exprs = new Map();
    for (const [t, m] of p.mid) {
        if (!d.exprs.has(t)) d.exprs.set(t, new Map());
        const dst = d.exprs.get(t);
        for (const [n, e] of m) { if (dst.get(n) !== e) { dst.set(n, e); changed = true; } }
    }
    // 3) 关键帧驱动变量名（d.vars 为空时补齐，保证数值表/编译都有驱动集合）
    if (!(d.vars instanceof Set)) d.vars = new Set();
    const _hasNs = p.blkStart.size > 0;
    if (_hasNs) {
        for (const [, m] of p.blkStart) {
            for (const n of m.keys()) {
                if (isKeyframeInternalVar(n, block.id) || _kfIsNsInternal(n, block.id) || kfIsLegacyScaffoldTwin(n, block.id, text)) continue;   // ★ r18：v1 裸名脚手架（有命名空间孪生）不写进数据
                if (!d.vars.has(n)) { d.vars.add(n); changed = true; }
            }
        }
    }
    // 4) 诊断：后段（无条件赋值）里出现的同名变量会遮蔽关键帧驱动 → 记录并剔出 d.vars
    /* ★ r13：编译器为「全程同值」的驱动变量写的**单条无条件数值赋值**（`v.X=0;`）不是
       「后段派生表达式遮蔽」，绝不能因此把该变量剔出 `d.vars`（否则下一轮重编译它就不再被驱动
       ⇒ 该常量可能整个从程序里消失，正是「scale/extend_xrot 被清零 → 方块缩没」那类事故）。
       只把**非纯数值**的无条件赋值（真表达式）当遮蔽。 */
    const _plainNumRe = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
    const shadow = [];
    for (const n of Array.from(d.vars)) {
        if (!p.publics.has(n)) continue;
        if (_plainNumRe.test(String(p.publics.get(n)).trim())) continue;
        shadow.push(n); d.vars.delete(n); changed = true;
    }
    kfLastShadowWarn = shadow;
    if (changed) kfMarkDirty();
    return changed;
}

/* ============================================================================
   时间表面板（关键帧模式下的那块面板）
   · 版式：时间 × 变量 × 数值 三列；点数值 → 弹 molang 数值泡泡（增量同步多选）
   · 变量数列下方一个表达式折叠栏；展开时与变量数列互斥折叠
   · 面板头参考 molang 编辑模式（切角按钮），并留「变量候选」入口
   ========================================================================== */
// ★【2026-10-16 用户裁决】关键帧时间表**不再做任何骨骼特判**：
//   紫色✛显式骨骼绑定走的是**纯 molang 路线**（骨骼跟随 = 普通派生变量表达式），
//   所以它与普通方块**完全同权**，直接进时间表，不写任何特殊流程。
//   ⇒ 2026-10-13 的「本期约束②」已作废：`kfIsBoneRelatedBlock` / `kfLastSkippedBone` / 面板提示一并删除。
function kfEditTargets() {
    let all;
    if (selectedBlocksSet && selectedBlocksSet.size) all = Array.from(selectedBlocksSet);
    else if (selectedKeyframeBlock) all = [blocks.find(x => x.id === selectedKeyframeBlock)];
    else if (selectedBlock) all = [selectedBlock];
    else all = [];
    const out = [];
    for (const b of all) {
        if (!b || !b.scope) continue;
        // ★ v2：molang 编辑模式方块同样进时间表（两者彻底打通；编译会保留用户手写程序）
        out.push(b);
    }
    return out;
}
// 确保方块的时间表数据可用：优先用 keyframeData；没有数据但 program 里有动画 → 反向解析
function kfPrepareTargets(targets) {
    for (const b of targets) {
        if (!b || !b.scope) continue;
        /* ★★★【2026-10-17 修复 · 用户投诉「添加关键帧后 Ctrl+Z 撤回根本无效」的真根因】
           普通方块的 `scope.program` **不是真相**，只是编译器把 keyframeData 编译后写回的**派生缓存**
           （见 refreshMolangProgramForBlock → kfEnsureProgram）。撤销时 restoreState 清空了 keyframeData，
           但这段派生的 program 文本仍在方块上（且含 q.anim_time 时间块）——
           旧实现把它当真相反解 ⇒ kfSyncDataFromProgram 把**刚被撤销掉的关键帧整段重建回来**
           （实测：撤销后 keyframeData 立刻又冒出 `Cube1:[0,1]`，用户看到「撤回无效」）。
           正解：只有「程序即真相」的方块（molang 编辑模式 / 用户手改过 molang）才允许反解；
           其余方块的 program 是派生产物，绝不可作为关键帧的来源。 */
        /* ★★★【2026-10-17 r16 · 用户诉求 4「手改 molang 应先解析识别再拒绝」】
           放宽准入：只要程序能被 kfClassifyProgram 识别为关键帧可解析（keyframe / keyframe-lite），
           就允许反解（含用户手改末段派生表达式、改某帧某变量值等合法语义）。
           ★ 但**必须保留 `!keyframeData.has(b.id)` 这道准入** —— 它是上面「撤销不回魂」的唯一防线：
             分类器只放宽「谁有资格被反解」，不取消「已被撤销（keyframeData 已被清空）则绝不下手」。 */
        const cls = kfClassifyProgram(b);
        if ((cls === 'keyframe' || cls === 'keyframe-lite') && !keyframeData.has(b.id) && b.scope.program && /q\.anim_time/.test(b.scope.program)) {
            kfSyncDataFromProgram(b);
        } else if (hasKeyframeAnimation(b.id)) {
            kfEnsureProgram(b);   // 数据 → program（双向对齐）
        }
    }
}
// 该方块在时间表里要显示的变量（已确认 + 数据里出现过的）。
//  ★ 铁律：绝不把「只是可写（核心常量、auto）」的变量算进来 —— 那会让它们被当成"被驱动"，
//    编译时写进程序（scale=1 / extend_xrot=-90 被当常量），或反过来把方块"缩没"/弄僵。
//    v1 的缩没事故正是同类错误，v2 在这里再守一道。
function kfTableVars(block) {
    // ★【2026-10-17】只读查询：未加入动画的方块直接返回空表，不创建条目。
    const d = kfData(block.id, false);
    if (!d) return [];
    const set = new Set();
    if (d.vars instanceof Set) d.vars.forEach(n => set.add(n));
    if (d.frames instanceof Map) for (const [, m] of d.frames) for (const k of m.keys()) set.add(k);
    if (d.exprs instanceof Map) for (const [, m] of d.exprs) for (const k of m.keys()) set.add(k);
    /* ★★★【2026-10-14 用户明确要求 · 数据表只服务「自定义变量」】
       用户原话：「我没说过如果核心变量例如 xpos 是常量数值给他赋值，例如 xpos=1，
                 这里就不显示的吗？（在新操作模式中它应当通过更快速的 Gizmo 控件来编辑数值），
                 我叫你设计这个数据表是给自定义变量用的」
       ⇒ 核心变换变量（xpos/ypos/zpos/xrot/…/extend_yrot，共 16 个）**不再列进数值表**：
         它们是"用 Gizmo 直接拖"的通道，重复列一遍纯属噪音、还把自定义变量挤到屏幕外
         （用户截图里自定义变量 v.angle/v.side_a/v.side_b 全在可见区之外）。
         例外：**被分段表达式接管**的核心变量仍要显示（否则用户无法在表里看到/改它的分段值）。 */
    const segTouched = new Set();
    if (d.exprs instanceof Map) for (const [, m] of d.exprs) for (const k of m.keys()) segTouched.add(k);
    const out = [];
    for (const n of KF_CORE_VARS) {
        if (!set.has(n)) continue;
        if (segTouched.has(n)) out.push(n);          // 被分段表达式接管 → 显示（需要能改/能看）
    }
    for (const n of Array.from(set).sort()) {
        if (out.includes(n) || kfIsInternalName(n, block.id)) continue;   // ★ 带 blockId：用户变量一律放行（含 start_a/Total/segment/duration）
        if (_kfIsNsInternal(n, block.id)) continue;   // 编译内部量（v.<id>_seg_time/_start_X/…）不进表
        if (KF_CORE_VARS.includes(n)) continue;       // ★ 核心变量默认不进表（走 Gizmo）
        if (kfIsDerivedVar(block, n)) continue;       // 派生量不进表（由表达式算）
        out.push(n);
    }
    return out;
}
// 数值写入：abs=设为相同值；delta=同步增量（各目标按自己的当前值 +Δ）
function kfSetValueAtFrame(targets, time, varName, value, mode, anchorBlock) {
    if (!targets || !targets.length) return;
    /* ★★★【2026-10-16 r11 修复】不再无条件 `time = kfQuantTime(time)`：
       历史遗留的**非 ms 真实帧键**（如 4.474351）会被量化成 4.474 = **另一个键**
       ⇒ 编辑落到别的帧、并凭空多建一帧（用户投诉「编辑即生成新帧 / 未改动」）。
       改为**逐方块**把「想编辑的时刻」解析到该方块**真实存在的帧键**（`kfResolveFrameTime`），
       与 Gizmo 写入口 `kfGizmoWriteVar` 完全同口径；只有真的不在任何帧附近才落到量化时刻新建。 */
    let delta = 0;
    if (mode === 'delta' && anchorBlock) {
        const at = kfResolveFrameTime(anchorBlock.id, time);
        const ad = kfData(anchorBlock.id);
        const af = ad && ad.frames.get(at);
        const cur = af && af.has(varName) ? af.get(varName) : null;
        delta = value - (cur === null ? 0 : cur);
    }
    for (const b of targets) {
        // ★ r18·3：非「+」显式加帧时先吸附最近的已有帧；无帧可吸附（t=null）才拦下并跳过
        const t = kfEditFrameTime(b.id, time);
        const d = kfData(b.id, true);
        if (!d.frames.has(t)) {
            if (!kfAllowNewFrame) { kfNotifyNoFrameBlocked(); continue; }
            d.frames.set(t, new Map());
        }
        const f = d.frames.get(t);
        if (mode === 'delta') {
            const cur = f.has(varName) ? f.get(varName) : null;
            f.set(varName, (cur === null ? 0 : cur) + delta);
        } else {
            f.set(varName, value);
        }
        // 数值被显式改动 → 该时刻若还有表达式覆盖，清掉（数值优先，避免互相打架）
        if (d.exprs instanceof Map && d.exprs.has(t)) d.exprs.get(t).delete(varName);
        /* ★★【2026-10-16】写完立刻守住「每帧变量齐全」不变式：若这一帧是新建的，
           其余被管变量必须马上按本帧口径补齐，绝不能留一个半截帧给后续路径去猜
           （半截帧 = 用户投诉的"多出来一帧 + 数值被覆写"）。 */
        try { kfCompleteFrames(b.id); } catch (e) { }
        kfEnsureProgram(b, true);
        b.refresh();
    }
    kfMarkDirty();
}
// 表达式写入：广播覆盖（多选一致语义）；expr 为空 = 清除该时刻的覆盖
function kfSetExprAtFrame(targets, time, varName, expr) {
    for (const b of targets) {
        kfSetVarExprAt(b.id, time, varName, expr);
        kfEnsureProgram(b, true);
        b.refresh();
    }
    kfMarkDirty();
}
// ★【2026-10-13】外部途径（导入 / 撤销重做 / 删除）直接改写了 keyframeData 之后调用：
//   编译签名只含 epoch（不含数值），故这里必须显式失效 + 强制重编译，否则画面停在旧程序上。
function kfAfterExternalDataChange(ids) {
    keyframeEpoch++;
    kfMarkDirty();
    const list = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    for (const id of list) {
        const b = blocks.find(x => x.id === id);
        if (!b || !b.scope) continue;
        // ★★【2026-10-14 P0 修复】必须用 kfResetBaseIfForeign：
        //   本函数也被**改数值**路径调用（kfRealizeTargetVar → 这里），此时 scope.program
        //   就是我们刚编译的产物 —— 无条件 kfResetBase 会把产物钉成「用户基线」，
        //   造成基线/程序自我喂养无界增长、关键帧动画恒不动（栈追踪实证）。
        //   只有程序真被外部替换（导入/撤销/手改）时才重设基线。
        if (typeof kfResetBaseIfForeign === 'function') kfResetBaseIfForeign(b);
        else if (typeof kfResetBase === 'function') kfResetBase(b);
        if (!hasKeyframeAnimation(id)) continue;
        if (!kfCanUseCompiled(b)) continue;   // 骨骼类仍走原路径
        if (kfEnsureProgram(b, true)) b.refresh();
    }
}
// 读取某个变量在某时刻的"表内值"（帧值；没有帧值则取当前 scope 值）
function kfValueAt(block, time, name) {
    const d = kfData(block.id);
    const f = d && d.frames.get(time);
    if (f && f.has(name)) return f.get(name);
    const dd = block.scope.vars.get('v.' + name);
    return dd ? dd.value : 0;
}

let kfExprFoldOpen = false;   // 表达式折叠栏是否展开（展开时数值表折叠）
const kfSegOpen = new Set();  // 多选时「逐块编辑」展开的区间键（"时间|变量"）
const kfOpenBlock = new Set(); // 展开「分段表达式」的时间块（时间）
const kfHelpBlock = new Set(); // ★【2026-10-18】展开了「?」说明文字的时间块（时间）
let kfDataView = false;        // ★【2026-10-22】「数据」视图：时间表只显示当前帧的核心变量数值
// ★【2026-10-20】原 kfEmptyHelp（空态说明的展开集合）随空态文案整体删除。
// ---- 时间块辅助 ----
// 该时间块的时长（末块 0.0001；否则 = 到下一块的距离，不足动画总时长时补到总时长）
function kfBlockDur(times, i) {
    const t = times[i];
    if (i >= times.length - 1) {
        const tail = Math.max(0, Number(keyframeAnimDuration || 0) - t);
        return tail > 1e-6 ? parseFloat(tail.toFixed(4)) : 0.0001;
    }
    return parseFloat(Math.max(times[i + 1] - t, 0.0001).toFixed(4));
}
// 把「变量」真正纳入关键帧体系：加入 d.vars，并为它建立基线帧（空数据时补 t=0 当前值）
function kfRealizeTargetVar(targets, name) {
    for (const b of targets) {
        if (!b || !b.scope) continue;
        const d = kfData(b.id, true);
        if (!(d.vars instanceof Set)) d.vars = new Set();
        if (!(d.frames instanceof Map)) d.frames = new Map();
        const dd = b.scope.vars.get('v.' + name);
        const cur = (dd && Number.isFinite(dd.value)) ? dd.value : 0;
        if (!d.frames.size) {
            // ★ r18·3：无任何帧可吸附 → 非「+」显式流程不建 t=0 基线帧，提示后跳过本方块
            if (!kfAllowNewFrame) { kfNotifyNoFrameBlocked(); continue; }
            d.frames.set(0, new Map([[name, cur]]));
        } else {
            /* ★★★【2026-10-14 P0 修复 · 用户投诉「自定义变量改一个=改全部 / 有些变量不显示」的真根因】
               旧实现只在 `!d.vars.has(name)` 时才回填 —— 但**自动纳入**（kfOnBlockAddedToAnimation）
               早已把变量放进 `d.vars`，而那时**帧还没建立该变量的值** ⇒ 这个 `else if` 永远不成立
               ⇒ 该变量在**部分帧里有值、部分帧里没有**（实测：`dVars` 含 side_b，但
               `kfBlockVars` 只列出 side_a，因为 side_b 只出现在后建的帧里、
               而第 1 帧缺它 → 逐帧渲染时某些块显示不出该变量）。
               后果（用户视角）：**某些帧显示该变量、某些帧不显示**；改值只落在"有值"的那一帧，
               其余帧因为缺键而被 `kfValueAt` 回退到 `scope` 当前值 ⇒ 看起来"改一个等于改全部"。
               正解：**无条件把该变量补齐到所有已存在的帧**（缺哪个补哪个），保证
               「变量在帧集合里要么全有、要么全无」这一不变式成立。 */
            const ts = Array.from(d.frames.keys());
            for (const t of ts) { const f = d.frames.get(t); if (f instanceof Map && !f.has(name)) f.set(name, cur); }
        }
        d.vars.add(name);
    }
    kfAfterExternalDataChange(targets.map(b => b.id));
}
// 该时间块里要显示的变量（= 所有编辑目标里"已驱动"或"可写"的变量并集）
/* ★★★【2026-10-14 用户明确要求】数据表只服务「自定义变量」：
   核心变换变量（xpos…extend_yrot）不再进表 —— 它们用 Gizmo 直接拖更快；
   派生量也不进表（由表达式算）。被“分段表达式”接管的核心变量例外保留（需要能看/能改）。
   ★ 与 kfTableVars 保持同一口径，否则两处不一致会让变量一会出现一会消失。 */
function kfBlockVars(targets, t) {
    const set = new Set();
    const segTouched = new Set();
    for (const b of targets) {
        const d = kfData(b.id);
        if (!d) continue;
        if (d.vars instanceof Set) for (const n of d.vars) set.add(n);
        const f = d.frames instanceof Map ? d.frames.get(t) : null;
        if (f instanceof Map) for (const k of f.keys()) set.add(k);
        if (d.exprs instanceof Map) for (const [, m] of d.exprs) for (const k of m.keys()) segTouched.add(k);
    }
    const out = [];
    // 被分段表达式接管的核心变量：仍显示（用户要能在表里看到并修改该段表达式）
    for (const n of KF_CORE_VARS) if (set.has(n) && segTouched.has(n)) out.push(n);
    for (const n of Array.from(set).sort()) {
        if (out.includes(n)) continue;
        if (targets.some(b => { try { return kfIsInternalName(n, b.id); } catch (e) { return false; } })) continue;   // ★ 带 blockId：用户变量一律放行
        if (targets.some(b => _kfIsNsInternal(n, b.id))) continue;
        // ★ r18：v1 裸名脚手架（程序里有同名命名空间孪生）→ 不进数值表
        if (targets.some(b => { try { return kfIsLegacyScaffoldTwin(n, b.id, b.scope && b.scope.program); } catch (e) { return false; } })) continue;
        if (KF_CORE_VARS.includes(n)) continue;          // ★ 核心变量走 Gizmo，不进表
        if (targets.some(b => { try { return kfIsDerivedVar(b, n); } catch (e) { return false; } })) continue;  // 派生量不进表
        out.push(n);
    }
    return out;
}
// 本块运行的「截断 molang 代码」：中段覆盖（该时刻生效）+ 本块数值插值行
function kfBlockCode(block, t, i, times) {
    const d = kfData(block.id);
    if (!d) return '';
    const lines = [];
    const seen = new Set();
    // 1) 该时刻起生效的分段表达式（含从更早时刻继承、且在本段发生的）
    if (d.exprs instanceof Map) {
        const eff = new Map();
        const ts = Array.from(d.exprs.keys()).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
        for (const tt of ts) {
            if (tt > t + 1e-9) break;
            const m = d.exprs.get(tt);
            if (!(m instanceof Map)) continue;
            for (const [n, e] of m) { if (String(e).trim() === '') eff.delete(n); else eff.set(n, String(e).trim()); }
        }
        for (const [n, e] of eff) {
            if (seen.has(n)) continue;
            seen.add(n);
            lines.push(`v.${n}=${String(e).replace(/;\s*$/, '')};`);
        }
    }
    // 2) 数值插值行（本块实际执行的赋值）
    const dvars = (d.vars instanceof Set) ? Array.from(d.vars) : [];
    const f = d.frames instanceof Map ? d.frames.get(t) : null;
    const fv = f instanceof Map ? Array.from(f.keys()) : [];
    const names = [];
    for (const n of KF_CORE_VARS) if (dvars.includes(n) || fv.includes(n)) names.push(n);
    for (const n of fv) if (!names.includes(n)) names.push(n);
    for (const n of dvars) if (!names.includes(n)) names.push(n);
    for (const n of names) {
        if (seen.has(n)) continue;
        const from = kfValueAt(block, t, n);
        const isLast = i >= times.length - 1;
        const to = isLast ? from : kfValueAt(block, times[i + 1], n);
        if (isLast && Math.abs(from - to) < 1e-9) lines.push(`v.${n}=${fmt2(from)};`);
        else lines.push(`v.${n}=math.lerp(${fmt2(from)},${fmt2(to)},v.${kfNsName(block.id, 'u')});`);
    }
    return lines.join('\n');
}
// 分段接管的变量在【该时间块】算出来的值（供数值列显示；算不出就退回帧值/当前值）
function kfEvalSegExpr(block, t, name, fallback) {
    try {
        const expr = kfExprEffectiveAt(kfData(block.id), t, name);
        if (!expr) return fallback;
        const v = (typeof evaluateExpression === 'function')
            ? evaluateExpression(expr, block.scope.vars, globalVars, block.id)
            : NaN;
        return Number.isFinite(v) ? v : fallback;
    } catch (e) { return fallback; }
}
/* 本块 molang 表达式框的文本（可读、可编辑），由两部分组成：
    ① 后段「派生表达式链」——用户 2026-10-14 明确要求「v.side_a=… 后面那一坨要待在
       molang 表达式最底部，并且在动画模式的分段表达式能看见它（常量数值不显示）」。
       ∵ 它不属于任一具体时间块（全段都跑），且正是 panel 上一直看不见的东西。
       `includeBackChain=false` 时只返回区间覆盖（保留旧行为，供内部调用）。
    ② 本块的分段表达式覆盖（`d.exprs` 里 ≤t 的最近一条）。
   写回时（kfSetBlockSegText）只解析「本块区间覆盖」部分：
       已存在于后段链的变量 → 跳过（那是常量/派生链，改它要走别处）；
       其余 `v.X=…;` → 作为本块的区间覆盖写入（清空 = 删除覆盖）。 */
function kfBlockSegText(block, t, includeBackChain) {
    const d = kfData(block.id);
    if (!d) return '';
    const lines = [];
    // ① 后段派生表达式链（不含常量参数；用户明确要求常量不显示）
    if (includeBackChain !== false && block && block.scope) {
        const tail = kfBlockBackChainText(block);
        if (tail) lines.push(tail);
    }
    // ② 本块的区间覆盖（该时刻生效的）
    if (d.exprs instanceof Map) {
        const m = d.exprs.get(t);
        if (m instanceof Map) {
            for (const [n, e] of m) {
                const s = String(e == null ? '' : e).trim();
                if (!s) continue;
                lines.push(`v.${n}=${s.replace(/;\s*$/, '')};`);
            }
        }
    }
    return lines.join('\n');
}
// 把编辑框里的多行 molang 写回该时刻的覆盖（解析成 name→expr；空行/删掉的变量即清除）
/* ★★【2026-10-14】框里现在除了「本块区间覆盖」，还会显示「后段派生表达式链」
   （kfBlockSegText 的 includeBackChain 部分）。写回时必须只认后者：
     · 变量已在后段链里 → 它是常量/派生链成员，**跳过**（改它应走数值表 / Gizmo / molang 编辑器）
     · 其余 `v.X=…;` → 作为本块的区间覆盖写入
   否则用户一编辑就会把后段链表达式误当成区间覆盖，产生"改了却没效果/反向污染"的怪象。 */
function kfSetBlockSegText(block, t, text) {
    const d = kfData(block.id, true);
    if (!(d.exprs instanceof Map)) d.exprs = new Map();
    const prev = d.exprs.get(t);
    const prevNames = prev instanceof Map ? Array.from(prev.keys()) : [];
    const next = new Map();
    // 后段链里的变量名（跳过它们）
    const backNames = new Set();
    try { for (const n of kfBackChain(block, kfBlockDrivenSet(block)).names) backNames.add(n); } catch (e) { }
    for (const st of kfSplitStatements(String(text || ''))) {
        const m = /^v\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(st);
        if (!m) continue;
        const nm = m[1], ex = m[2].trim();
        if (kfIsInternalName(nm) || _kfIsNsInternal(nm, block.id)) continue;
        if (backNames.has(nm)) continue;            // 后段链成员 → 不作区间覆盖
        if (ex) next.set(nm, ex.replace(/;\s*$/, ''));
    }
    for (const n of prevNames) if (!next.has(n)) kfSetVarExprAt(block.id, t, n, '');
    for (const [n, e] of next) kfSetVarExprAt(block.id, t, n, e);
    kfRecompileBlocks([block.id]);
}
// 本块特化（中段覆盖）的变量集合
function kfBlockSpecialVars(block, t) {
    const d = kfData(block.id);
    const set = new Set();
    if (!d || !(d.exprs instanceof Map)) return set;
    const eff = new Map();
    const ts = Array.from(d.exprs.keys()).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    for (const tt of ts) {
        if (tt > t + 1e-9) break;
        const m = d.exprs.get(tt);
        if (!(m instanceof Map)) continue;
        for (const [n, e] of m) { if (String(e).trim() === '') eff.delete(n); else eff.set(n, String(e).trim()); }
    }
    for (const n of eff.keys()) set.add(n);
    return set;
}
// 主渲染：时间块 → （互斥）变量数值列表 ⇄ 分段表达式代码
/* 【2026-10-24】时间表「方块工具」菜单：挂在 body 上的 fixed 浮层（面板只有 200px 高，内联菜单会被裁）。
   打开时按按钮位置向上弹出、放不下则向下；点外部自动关闭。 */
let kfTlToolsMenuEl = null;
function kfTlCloseToolsMenu() {
    document.querySelectorAll('body > .kf-tl-toolsmenu').forEach(m => m.remove());
    kfTlToolsMenuEl = null;
    const b = document.getElementById('kfTlToolsBtn');
    if (b) b.classList.remove('open');
}
function kfTlOpenToolsMenu(btn, container) {
    kfTlCloseToolsMenu();
    const targets = kfEditTargets();
    const multi = targets.length > 1;
    const el = document.createElement('div');
    el.className = 'kf-tl-toolsmenu open';
    el.id = 'kfTlToolsMenu';
    const ico = (d, extra) => `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra || ''}</svg>`;
    el.innerHTML = (targets.length ? `
        <button type="button" class="kf-tl-toolitem" data-kf-act="euler">${ico('<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M21 4v5h-5"/>')}<span>欧拉角转换</span></button>
        <button type="button" class="kf-tl-toolitem" data-kf-act="pivot">${ico('<circle cx="12" cy="12" r="7"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>')}<span>枢轴归位到原点</span></button>` : '') + `
        <button type="button" class="kf-tl-toolitem" data-kf-act="unhideAll">${ico('<path d="M2.2 12s3.6-6.4 9.8-6.4S21.8 12 21.8 12s-3.6 6.4-9.8 6.4S2.2 12 2.2 12z"/><circle cx="12" cy="12" r="2.6"/>')}<span>取消所有方块隐藏</span></button>
        <button type="button" class="kf-tl-toolitem" data-kf-act="unlockAll">${ico('<rect x="4.5" y="10.5" width="15" height="10" rx="1.6"/><path d="M8.2 10.5V7.2a3.8 3.8 0 0 1 7.6 0"/>')}<span>取消所有方块锁定</span></button>`;
    document.body.appendChild(el);
    kfTlToolsMenuEl = el;
    // 定位：优先在按钮正上方（右对齐），上方空间不足则落在下方
    const br = btn.getBoundingClientRect();
    const mh = el.getBoundingClientRect().height;
    el.style.right = Math.max(6, window.innerWidth - br.right) + 'px';
    el.style.top = (br.top - mh - 6 >= 6) ? (br.top - mh - 6) + 'px' : Math.min(window.innerHeight - mh - 6, br.bottom + 4) + 'px';
    btn.classList.add('open');
    // ★★【2026-10-24 用户打回】用 pointerdown 触发而不是 click：
    //   时间表会因任意方块状态变化异步重绘，重绘会关掉这个浮层；若等着 click，节点可能已被替换/移除 ⇒ 点了没反应。
    //   pointerdown 发生在节点还在的瞬间，稳定生效。
    el.querySelectorAll('.kf-tl-toolitem').forEach(it => {
        const run = () => {
            const act = it.dataset.kfAct;
            if (act === 'unhideAll' || act === 'unlockAll') {
                kfTlCloseToolsMenu();
                if (act === 'unhideAll') unhideAllBlocks(); else unlockAllBlocks();
                try { renderKeyframeTimeline(); } catch (e) {}
                kfRenderTimelinePanel(container);
                return;
            }
            if (!targets.length) { kfTlCloseToolsMenu(); showToast('请先选中一个方块再用该工具'); return; }
            if (multi) { kfTlCloseToolsMenu(); showToast('请先只选中一个方块再用这些工具'); return; }
            kfTlCloseToolsMenu();
            if (act === 'euler') kfBlockToolEuler(targets[0]);
            else if (act === 'pivot') kfBlockToolPivotToOrigin(targets[0]);
            kfRenderTimelinePanel(container);
        };
        // pointerdown 先执行（节点可能在下一次重绘时被替换，等 click 会丢）；
        // click 兜底（键盘回车 / 程序化 click），用 done 标记避免重复执行。
        it.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation(); ev.preventDefault();
            if (it.dataset.done) return;
            it.dataset.done = '1';
            /* 菜单在 pointerdown 时就被移除了 ⇒ 随后的 click 会落到下面的画布/面板上（可能误改选区）。
               吞掉紧跟着的那一次 click。 */
            const swallow = (e2) => { e2.stopPropagation(); e2.preventDefault(); };
            document.addEventListener('click', swallow, { capture: true, once: true });
            setTimeout(() => document.removeEventListener('click', swallow, true), 400);
            run();
        });
        it.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (it.dataset.done) return;
            it.dataset.done = '1';
            run();
        });
    });
    setTimeout(() => {
        const onDoc = (ev) => {
            if (el.contains(ev.target) || btn.contains(ev.target)) return;
            kfTlCloseToolsMenu();
            document.removeEventListener('pointerdown', onDoc, true);
        };
        document.addEventListener('pointerdown', onDoc, true);
    }, 0);
}

function kfRenderTimelinePanel(container) {
    if (!container) return;
    // ★【2026-10-24】本函数会整体改写容器内容 ⇒ 让侧栏「结构缓存」失效（退出动画模式时必须全量重建）
    container._structHtml = null; container._modeKey = null;
    /* ★【2026-10-24】关键帧模式下侧栏被时间表取代，扳手菜单不再渲染 ——
       但上次在编辑模式打开、被挂到 body 上的菜单副本会一直飘着（用户可能误以为那就是"工具列表"）。
       这里一并清掉，避免残影与误解。 */
    document.querySelectorAll('body > .outliner-tools-menu').forEach(m => m.remove());
    // 时间表工具菜单同样挂在 body：面板重绘后按钮已是新节点，旧浮层必须关掉，否则会飘在屏幕上
    kfTlCloseToolsMenu();
    const targets = kfEditTargets();
    kfPrepareTargets(targets);
    const anchor = targets[0] || null;
    const multi = targets.length > 1;
    // ★【2026-10-22 用户要求】数据视图不支持多选：一旦多选就自动退出数据视图，回到正常时间列表
    if (kfDataView && multi) kfDataView = false;
    const idOf = targets.map(b => escapeHtml(b.id)).join(', ');

    let html = '';
    // ---- 面板头（参考 molang 编辑模式：切角按钮 + 变量名紫色）----
    //   ★★【2026-10-13 修复】必须提供「+关键帧 / ▶播放 / 播放头」快捷入口：
    //     侧栏在关键帧模式下整体取代方块列表；若这里没有录帧按钮、浮动窗又被隐藏，
    //     用户就完全找不到创建关键帧的入口（实测投诉）。两条路都要通。
    const _playLabel = (typeof keyframePlaying !== 'undefined' && keyframePlaying) ? '⏸ 暂停' : '▶ 播放';
    const _curT = (typeof keyframeCurrentTime === 'number') ? parseFloat(keyframeCurrentTime.toFixed(2)) : 0;
    /* ★【2026-10-20 用户要求】面板头彻底去掉「🎬 关键帧时间表」标题与 emoji
       （上一轮误判为"保留标题、只重排"，用户明确：「"关键帧时间表"文字和emoji也没删啊」）；
       第一行只留按钮，并按「主操作 / 辅助操作」分两组、组间留白拉开层次；
       选中方块名下移到第二行（与播放头/时间步进/浮动窗同排，小胶囊标签）。 */
    html += `<div class="outliner-header kf-tl-header">
        <span class="kf-tl-hbtnbar">
            <span class="kf-tl-bgrp">
                <button type="button" class="kf-tl-btn kf-tl-btn-primary" id="kfTlRecord" title="在当前播放头位置录制关键帧（等于浮动窗的 +关键帧）">+关键帧</button>
                <button type="button" class="kf-tl-btn kf-tl-btn-primary" id="kfTlPlay" title="播放/暂停整段动画">${_playLabel}</button>
            </span>
            <span class="kf-tl-bgrp kf-tl-bgrp-aux">
                <!-- ★【2026-10-20 用户要求】❒（加入/移出动画列表）与「导入」已由浮动关键帧窗实现，此处重复入口删除 -->
                <button type="button" class="kf-tl-btn${kfDataView ? ' on' : ''}" id="kfTlData" title="只显示播放头所在帧的核心变量数值（多选时自动回到时间列表）">数据</button>
                <button type="button" class="kf-tl-btn" id="kfTlVars">变量</button>
                <button type="button" class="kf-tl-btn" id="kfTlOpenWin" title="打开/关闭浮动关键帧窗口（时间轴拖动与缩放）">浮动窗</button>
                <button type="button" class="kf-tl-btn kf-tl-toolbtn" id="kfTlToolsBtn" title="方块工具：欧拉角转换 / 枢轴归位到原点 / 取消所有方块隐藏 / 取消所有方块锁定">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M21.7 5.6c.5-1.1.4-2.4-.3-3.3-.7-.9-1.9-1.4-3.1-1.3l2.3 2.3-1.9 1.9-3.3-3.3 2.3-2.3c-.1 1.3.4 2.5 1.3 3.3.9.7 2.2.9 3.3.3L19 4.6c-.6.6-.6 1.5 0 2.1l-4.2 4.2c-.6.6-1.5.6-2.1 0-.6-.6-.6-1.5 0-2.1l4.2-4.2c.6-.6 1.5-.6 2.1 0l1.7-1.7zM4.5 17.8l-1.9 1.9 3.3 3.3c.6.6 1.5.6 2.1 0l7.7-7.7c-1.4-.5-2.6-1.4-3.5-2.8l-7.7 7.7z"/></svg><span>工具</span>
                </button>
            </span>
        </span>
    </div>
    <div class="kf-tl-subbar">
        <span class="kf-tl-targets" title="当前编辑方块">${idOf || '未选中'}${multi ? ' (' + targets.length + ')' : ''}</span>
        <span class="kf-tl-curtime">播放头 <b id="kfTlCurT" title="点击直接输入秒数（如 2 或 1.5）">${_curT}s</b> / 总长 ${parseFloat((Number(keyframeAnimDuration) || 0).toFixed(2))}s</span>
    </div>`;
    /* ★【2026-10-31】原「工具」独立成一行（.kf-tl-toolsrow）已取消：
       名称与播放头信息独占第二行，不再有任何单独成行的按钮。 */

    /* ★【2026-10-24 用户打回：菜单四项在 200px 高的底部面板里放不下（向上弹会被面板顶边裁掉第一项）】
       菜单改为【挂在 body 上的 fixed 浮层】：不受面板 overflow 裁剪、不受侧栏 backdrop-filter 的包含块影响。 */
    if (!anchor) {
        html += `<div class="kf-tl-empty">选择或添加一个方块开始编辑关键帧</div>`;
        container.innerHTML = html;
        kfBindTimelinePanel(container, []); return;
    }
    // ★【2026-10-22 用户要求】「数据」视图：只显示**当前播放头时间**所在帧的核心变量所有数值
    //   规则：① 如果多选（targets.length > 1），自动切回时间列表样式（数据视图不支持多选）；
    //        ② 数据视图下只渲染当前播放头最近一帧，不渲染所有时间块。
    const d = kfData(anchor.id, false);
    // ★ 用户规则：多选了就自动回到正常时间列表样式（数据视图不支持多选）
    const doDataView = kfDataView && !multi;
    let times = [];
    if (doDataView) {
        // 数据视图：只取离当前播放头最近的那一个时间块
        const allTimes = Array.from((d && d.frames instanceof Map ? d.frames : new Map()).keys())
            .map(Number).filter(Number.isFinite).sort((a, b) => a - b);
        if (allTimes.length) {
            let closest = allTimes[0], bestDist = Math.abs(keyframeCurrentTime - closest);
            for (const t of allTimes) { const dist = Math.abs(keyframeCurrentTime - t); if (dist < bestDist) { closest = t; bestDist = dist; } }
            times = [closest];
        }
    } else {
        // 正常视图：全部时间块
        times = Array.from((d && d.frames instanceof Map ? d.frames : new Map()).keys())
            .map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    }

    if (kfLastShadowWarn && kfLastShadowWarn.length) {
        html += `<div class="kf-tl-note">⚠️ ${kfLastShadowWarn.map(n => 'v.' + escapeHtml(n)).join('、')} 同时出现在「后段（查重下沉）」里，
            后段会每帧覆盖它，关键帧数值不会生效。请把它从程序后段删掉，或改到「分段表达式」里。</div>`;
    }

    if (!times.length) {
        if (doDataView) {
            html += `<div class="kf-tl-empty">当前方块暂无关键帧</div>`;
            container.innerHTML = html;
            kfBindTimelinePanel(container, targets); return;
        }
        html += `<div class="kf-tl-empty">暂无关键帧：点 +关键帧 录制，或在下面点数值直接建帧</div>`;
        // 仍然给出一个 t=0 的块，让用户能把变量直接纳入关键帧
        html += `<div class="kf-tl-block">` + kfBlockHtml(anchor, targets, 0, [0], 0, multi) + `</div>`;
        container.innerHTML = html;
        kfBindTimelinePanel(container, targets); return;
    }

    if (doDataView) {
        // ★ 数据视图：只渲染「播放头所在帧」的核心变量数值表
        html += `<div class="kf-tl-blocks">` + kfDataViewHtml(anchor, times[0]) + `</div>`;
        container.innerHTML = html;
        kfBindTimelinePanel(container, targets); return;
    }

    html += `<div class="kf-tl-blocks">`;
    for (let i = 0; i < times.length; i++) {
        html += `<div class="kf-tl-block">` + kfBlockHtml(anchor, targets, times[i], times, i, multi) + `</div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
    kfBindTimelinePanel(container, targets);
}
// 单个时间块的 HTML
function kfBlockHtml(block, targets, t, times, i, multi) {
    const dur = kfBlockDur(times, i);
    /* ★★【2026-10-22 P0 修复 · 用户投诉「非第一帧的分段表达式不显示，右键/全选才看得到文字」】
       根因：HTML 里的 id 是 `kfSegHi_3.666`（原样时间），而 kfBindTimelinePanel 里
       querySelector 用的是 `3_666`（把非字母数字换成下划线）⇒ 只有整数帧（如 0s）能命中，
       小数帧的高亮层 hi 取不到、永不绘制，而 textarea 文字本身是透明的（靠高亮层显示）
       ⇒ 视觉上整块空白，只有系统选中时才显示蓝底文字。
       正解：生成 id 与查询使用**同一个腌料后缀**。 */
    const _sid = String(t).replace(/[^A-Za-z0-9_-]/g, '_');
    /* ★【2026-10-18 用户要求】多选编辑时禁用「分段表达式」：
       分段表达式是【按单个方块】写入的 molang 片段，而 kfBlockSegText 取的是 anchor（第一个选中方块）的表达式，
       多选态下它既无意义（显示的永远是 anchor 的表达式）、又极易误改只属于 anchor 的代码。
       故多选时：折叠按钮直接不渲染，本块恒定走数值表（数值表本身已支持多块同名变量合并编辑）。 */
    const open = kfOpenBlock.has(t) && !multi;
    const helpOpen = kfHelpBlock.has(t) && !multi;
    const special = kfBlockSpecialVars(block, t);
    // 后段派生表达式链（用户 2026-10-14 要求"看得见"）：存在时在下方说明里补一句分组说明
    const backText = (() => { try { return kfBlockBackChainText(block); } catch (e) { return ''; } })();
    let html = '';
    /* ★【2026-10-20 用户要求】提前算出数值表变量：折叠（数值表）状态若一个变量都没有，
       连容器带它的边框都不要渲染（见下方 `else if (vars.length)`）——
       用户报「为啥不显示文字了但是还是有一个框框？？？」。
       open（表达式）状态用不到它，直接给空数组，保持零额外开销。 */
    const vars = open ? [] : kfBlockVars(targets, t);
    const _noBody = !open && vars.length === 0;
    // 块头：时间 / 时长 / 「?」说明按钮 + 折叠按钮（折叠栏展开 = 显示 molang 表达式框；收起 = 显示数值表）
    html += `<div class="kf-tl-bhead${_noBody ? ' kf-tl-bhead-bare' : ''}">
        <span class="kf-tl-bt">${kfFmtTime(t)}s</span>
        <span class="kf-tl-bdash" aria-hidden="true"></span>
        <span class="kf-tl-bd">时长 ${kfFmtTime(dur)}s${i >= times.length - 1 ? '（末帧）' : ''}</span>
        <span class="kf-tl-bactions" style="margin-left:auto;display:inline-flex;align-items:center;gap:6px;">
            ${multi ? '' : `<button type="button" class="kf-tl-bhelp${helpOpen ? ' on' : ''}" data-kf-bhelp="${t}" title="分段表达式说明">?</button>`}
            ${multi ? '' : `<button type="button" class="kf-tl-btn kf-tl-bfold${open ? ' on' : ''}" data-kf-bfold="${t}">${open ? '▾ 数值表' : '▸ 分段表达式'}</button>`}
        </span>
    </div>`;
    /* ★【2026-10-20 用户要求】「?」说明提示的位置修正 + 两种状态都可用：
       原来 data-kf-bhint 只写在 `if (open)` 分支内（即藏在表达式框里面），
       收起成数值表时点「?」根本找不到提示元素 —— 用户要求「?」显示在分段表达式切换按钮旁边。
       现在：「?」恒与切换按钮同排相邻（见上），提示内容放在块头正下方、两种状态都能展开。默认隐藏。 */
    html += `<div class="kf-tl-hint kf-tl-bhint" data-kf-bhint="${t}" style="margin:4px 8px 6px;display:${helpOpen ? 'block' : 'none'};">`
        + `这一段等价于 <code>时间&gt;=${t}&amp;&amp;时间&lt;下一帧 ?( 上面这些语句 );</code>。`
        + `留空 = 本块沿用数值插值；写了的变量在本块由表达式接管（该块不再 lerp 它）。`
        + `语法高亮/报错与 molang 编辑模式完全一致。`
        + (backText ? `<br><b>顶部不带时间条件的 <code>v.X=…;</code> 是后段「派生表达式链」</b>（由常量参数算出、每帧都跑；改它请走数值表 / Gizmo 或 molang 编辑器）。` : '')
        + `</div>`;
    if (open) {
        // ★★【2026-10-13 用户要求】这里就是一个**跟 molang 编辑模式近乎相同**的编辑框：
        //   透明 textarea + 彩色高亮层（复用 highlightMolang）+ 错误条，直接写本块运行的截断代码。
        //   旧版只显示只读行、编辑要走「+ 表达式」弹窗 —— 用户明确说"我完全搞不懂你弄的啥东西"。
        const segText = kfBlockSegText(block, t);
        html += `<div class="kf-tl-bexpr">
            <div class="kf-seg-editor molang-editor">
                <pre class="molang-highlight" id="kfSegHi_${_sid}" aria-hidden="true"></pre>
                <textarea class="molang-textarea kf-seg-ta" id="kfSegTa_${_sid}"
                    data-kf-seg-time="${t}" spellcheck="false"
                    placeholder="本块要跑的 molang 代码，例如：&#10;v.xpos = v.a * math.sin(时间 * 180);">${escapeHtml(segText)}</textarea>
            </div>
            <div class="molang-error" id="kfSegErr_${_sid}"></div>
        </div>`;
    } else if (vars.length) {
        // 变量数值列表（vars 已在上方提前算好；为空 ⇒ 整个容器都不渲染，不留空框）
        html += `<div class="kf-tl-vars">`;
        /* ★【2026-10-20 用户要求】没有自定义变量时**一个字都不显示**，**连框都不要** ——
           原来这里有一行「该方块暂无可在此编辑的自定义变量。」+「?」+ 可展开的详细说明；
           只删文案后仍会输出一个空的 <div class="kf-tl-vars">（有 padding、又嵌在 .kf-tl-block 的边框里）
           ⇒ 用户看到"没有字却还有一个空框框"。现在 vars 为空时直接不渲染该容器。 */
        for (const n of vars) {
            const v = kfValueAt(block, t, n);
            /* ★【2026-10-19】「多」徽标只在 `multi && !shared` 时显示 ⇒ 多选各方块数值恰好一致时
               徽标会静默消失，用户以为多选没生效（投诉「没有显示黄色的『多』字，这有点刻意」）。
               改成：只要本次是**多选编辑**（multi）就恒显示「多」；「一致 / 不一致」的差异仍由 title 提示区分。 */
            const shared = !multi || targets.every(b => {
                const bd = kfData(b.id); const bf = bd && bd.frames instanceof Map ? bd.frames.get(t) : null;
                return bf && bf.has(n) && Math.abs(bf.get(n) - v) < 1e-9;
            });
            const isDrv = (() => { const dd = kfData(block.id); return !!(dd && dd.vars instanceof Set && dd.vars.has(n)); })();
            const hasFrame = (() => { const dd = kfData(block.id); const bf = dd && dd.frames instanceof Map ? dd.frames.get(t) : null; return !!(bf && bf.has(n)); })();
            // 被分段表达式接管的变量：本段的值由表达式算出（不是帧值）→ 求值显示 + 分段徽标
            const isSeg = special.has(n);
            const shown = isSeg ? kfEvalSegExpr(block, t, n, v) : v;
            html += `<div class="kf-tl-row">
                <span class="mv-name kf-tl-var">v.${escapeHtml(n)}</span>${isSeg ? '<em class="kf-tl-sp">分段</em>' : ''}
                <span class="kf-tl-val${hasFrame || isSeg ? '' : ' dim'}${isDrv ? ' drv' : ''}" data-kf-t="${t}" data-kf-var="${escapeHtml(n)}"
                    title="${isSeg ? '本段由分段表达式接管：值由表达式实时算出（改数值会清掉本段覆盖）' : (multi ? (shared ? '多选：数值一致（点数字=输入设定值；▲▼=同步增量）' : '多选：数值不一致（▲▼=同步增量）') : '点击数字可调整：▲▼/滚轮/拖动=增量，点数字本身=输入设定值')}">${fmt2(shown)}${multi ? ' <em class="kf-tl-multi">多</em>' : ''}</span>
            </div>`;
        }
        html += `</div>`;
    }
    return html;
}
/* ★【2026-10-22 用户要求】「数据」按钮视图：只列**当前帧**的所有核心变量数值。
   编辑复用 .kf-tl-val 的数值泡泡逻辑（点击数字 → 播放头定位到该帧 → 改值）。 */
function kfDataViewHtml(block, t) {
    const d = kfData(block.id);
    const f = d && d.frames instanceof Map ? d.frames.get(t) : null;
    const special = kfBlockSpecialVars(block, t);
    let html = `<div class="kf-tl-block">
        <div class="kf-tl-bhead">
            <span class="kf-tl-bt">${kfFmtTime(t)}s</span>
            <span class="kf-tl-bdash" aria-hidden="true"></span>
            <span class="kf-tl-bd">当前帧数据</span>
        </div>
        <div class="kf-tl-vars">`;
    for (const n of KF_CORE_VARS) {
        const base = kfValueAt(block, t, n);
        const isSeg = special.has(n);
        const shown = isSeg ? kfEvalSegExpr(block, t, n, base) : base;
        const hasFrame = !!(f && f.has(n));
        html += `<div class="kf-tl-row">
            <span class="mv-name kf-tl-var">v.${escapeHtml(n)}</span>${isSeg ? '<em class="kf-tl-sp">分段</em>' : ''}
            <span class="kf-tl-val${hasFrame || isSeg ? '' : ' dim'}" data-kf-t="${t}" data-kf-var="${escapeHtml(n)}"
                title="点击数字可调整：▲▼/滚轮/拖动=增量，点数字本身=输入设定值">${fmt2(shown)}</span>
        </div>`;
    }
    html += `</div></div>`;
    return html;
}
/* ★【2026-10-22】数据视图随播放头实时刷新：只改数值文本，不重建整个列表
   （拖动播放头每帧都会触发；若整表重建会明显掉帧）。 */
let kfDataViewLiveRaf = 0;
function kfScheduleDataViewLive() {
    if (!kfDataView || kfDataViewLiveRaf) return;
    kfDataViewLiveRaf = requestAnimationFrame(() => {
        kfDataViewLiveRaf = 0;
        try { kfRefreshDataViewLive(); } catch (e) { }
    });
}
function kfRefreshDataViewLive() {
    if (!kfDataView) return;
    const host = document.getElementById('sideBlockList');
    if (!host) return;
    const cells = host.querySelectorAll('.kf-tl-blocks .kf-tl-val[data-kf-var]');
    if (!cells.length) return;
    const targets = kfEditTargets();
    if (targets.length !== 1) return;
    const b = targets[0];
    const d = kfData(b.id, false);
    if (!d || !(d.frames instanceof Map) || !d.frames.size) return;
    const ts = Array.from(d.frames.keys()).map(Number).filter(Number.isFinite).sort((a, c) => a - c);
    if (!ts.length) return;
    let t = ts[0], best = Math.abs(keyframeCurrentTime - t);
    for (const x of ts) { const dist = Math.abs(keyframeCurrentTime - x); if (dist < best) { t = x; best = dist; } }
    const head = host.querySelector('.kf-tl-blocks .kf-tl-bt');
    if (head) head.textContent = kfFmtTime(t) + 's';
    const special = kfBlockSpecialVars(b, t);
    cells.forEach(el => {
        const n = el.dataset.kfVar;
        if (!n) return;
        const base = kfValueAt(b, t, n);
        el.dataset.kfT = String(t);
        el.textContent = fmt2(special.has(n) ? kfEvalSegExpr(b, t, n, base) : base);
    });
}
function fmt2(v) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    return String(parseFloat(v.toFixed(4)));
}
// 事件绑定
function kfBindTimelinePanel(container, targets) {
    // ★★ 录帧 / 播放 / 播放头 / 浮动窗（面板头快捷入口 —— 用户找不到录帧入口的事故修复点）
    const rec = container.querySelector('#kfTlRecord');
    if (rec) rec.addEventListener('click', (e) => {
        e.stopPropagation();
        const _before = getKeyframeTimes(selectedKeyframeBlock || (targets[0] && targets[0].id) || '').length;
        if (typeof createKeyframeAtCurrentTime === 'function') createKeyframeAtCurrentTime();
        // ★【2026-10-14 设计修复】原来录帧后**没有任何反馈**，新手只能靠"面板里多出一个时间块"
        //   这个细节判断录没录上。现在给出明确提示（含时间点与总帧数）。
        try {
            const _id = selectedKeyframeBlock || (targets[0] && targets[0].id) || '';
            const _after = getKeyframeTimes(_id).length;
            const _t = parseFloat((Number(keyframeCurrentTime) || 0).toFixed(2));
            if (typeof showToast === 'function') {
                showToast(_after > _before
                    ? `已在 ${_t}s 录制关键帧（共 ${_after} 帧）`
                    : `已更新 ${_t}s 的关键帧（共 ${_after} 帧）`);
            }
        } catch (err) { }
        kfRenderTimelinePanel(container);
    });
    const play = container.querySelector('#kfTlPlay');
    if (play) play.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof toggleKeyframePlayback === 'function') toggleKeyframePlayback();
        kfRenderTimelinePanel(container);
    });
    // ★【2026-10-20 用户要求】播放头 ◀/▶ 步进按钮及其绑定已删除（浮动窗时间轴可拖动/定位）。
    // ★【2026-10-14 设计修复】播放头数字可点击直接输入秒数（比连点 ◀/▶ 快得多）。
    //   ★★ 绝不能用 `window.prompt()`：它**阻塞渲染线程**，把整个页面卡死
    //      （实测：`_kf_flow.cjs` 的 F8 点到这个数字后，后续 steps 全部 protocol timeout）。
    //      改用就地生成 input，回车/失焦提交。
    const curT = container.querySelector('#kfTlCurT');
    if (curT) {
        curT.style.cursor = 'text';
        curT.addEventListener('click', (e) => {
            e.stopPropagation();
            if (curT.querySelector('input')) return;
            // 打开时的原值：只有用户**真的改了**才写回。
            const opened = parseFloat((Number(keyframeCurrentTime) || 0).toFixed(2));
            const inp = document.createElement('input');
            inp.type = 'number'; inp.step = '0.1'; inp.min = '0'; inp.value = String(opened);
            inp.style.cssText = 'width:64px;background:rgba(0,0,0,.35);border:1px solid #3b82f6;border-radius:4px;color:inherit;font:inherit;padding:0 2px;outline:none;';
            curT.textContent = '';
            curT.appendChild(inp);
            inp.focus(); inp.select();
            let done = false;
            const commit = (ok) => {
                if (done) return; done = true;
                const v = Number(inp.value);
                /* ★★【2026-10-14 自身修复】必须区分「用户改过」与「只是点开又点走」：
                   旧写法无条件把输入框的值写回 ⇒ 点一下播放头数字再点别处（失焦提交）
                   会把播放头**倒退**回点击那一刻的旧值。实测事故：先在 0s 点开播放头，
                   再用 setKfTime(1) 把播放头推到 1s，然后点「+关键帧」→ 失焦提交把播放头
                   拽回 0 ⇒ 录到的帧落在 0s 而不是 1s（`_kf_flow.cjs` F9 实测复现）。
                   现在：值未变 → 完全不碰播放头；值变了 → 才按新值跳转。 */
                const changed = Number.isFinite(v) && Math.abs(v - opened) > 1e-9;
                if (ok && changed) {
                    keyframeCurrentTime = kfQuantTime(Math.max(0, Math.min(Number(keyframeAnimDuration) || 0, v)));
                    if (typeof updateKeyframePlayhead === 'function') updateKeyframePlayhead();
                    if (typeof applyKeyframePreviewAtTime === 'function') applyKeyframePreviewAtTime(keyframeCurrentTime);
                }
                // 文本永远按**当前真实播放头**回填，绝不用旧快照
                curT.textContent = parseFloat((Number(keyframeCurrentTime) || 0).toFixed(2)) + 's';
                /* ★★【2026-10-14 自身修复】重渲染必须**延后到下一个宏任务**：
                   commit 是由 blur 触发的，而 blur 时用户的手指已经按在下一个按钮上
                   （例如「+关键帧」的 mousedown）。若在此同步 `kfRenderTimelinePanel`，
                   整个面板 DOM 会被重建，紧接着的 mouseup/click 落在**已脱离文档**的按钮上
                   ⇒ 那一次点击被静默吞掉（实测：点播放头输入秒数后，点「+关键帧」
                   第一下没反应，必须再点一次）。
                   延后 0ms 后：click 先在该按钮上正常派发完，再刷新面板。 */
                if (changed) setTimeout(() => { try { kfRenderTimelinePanel(container); } catch (e) { } }, 0);
            };
            inp.addEventListener('keydown', (ev) => {
                ev.stopPropagation();
                if (ev.key === 'Enter') commit(true);
                else if (ev.key === 'Escape') commit(false);
            });
            inp.addEventListener('blur', () => commit(true));
            inp.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        });
    }
    const openWin = container.querySelector('#kfTlOpenWin');
    if (openWin) openWin.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof keyframeWindowOpen !== 'undefined' && keyframeWindowOpen) {
            if (typeof closeKeyframeWindow === 'function') closeKeyframeWindow();
            else if (keyframeWindowEl) { keyframeWindowEl.style.display = 'none'; keyframeWindowOpen = false; }
        } else if (typeof openKeyframeWindow === 'function') {
            openKeyframeWindow();
        }
        kfRenderTimelinePanel(container);
    });
    // ★【2026-10-20 用户要求】❒（加入/移出动画列表）与「导入」按钮已删除，对应绑定一并移除。
    const varsBtn = container.querySelector('#kfTlVars');
    if (varsBtn) varsBtn.addEventListener('click', () => kfShowVarCandidates(targets[0] || null));
    // ★【2026-10-22】「数据」视图开关：多选时不允许进入（保持正常时间列表样式）
    const dataBtn = container.querySelector('#kfTlData');
    if (dataBtn) dataBtn.addEventListener('click', () => {
        kfDataView = targets.length > 1 ? false : !kfDataView;
        kfRenderTimelinePanel(container);
    });
    /* 【2026-10-24 用户要求】方块名称下方的「工具」图标：打开挂在 body 上的 fixed 浮层菜单，
       含「欧拉角转换 / 枢轴归位到原点 / 取消所有方块隐藏 / 取消所有方块锁定」。
       后两项是全项目级的，不依赖编辑目标。 */
    const toolBtn = container.querySelector('#kfTlToolsBtn');
    if (toolBtn) toolBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (kfTlToolsMenuEl) kfTlCloseToolsMenu();
        else kfTlOpenToolsMenu(toolBtn, container);
    });
    // ★★ 本块 molang 表达式框：与 molang 编辑模式同款的「透明 textarea + 彩色高亮层 + 错误条」。
    //   输入即时高亮 + 校验；change/失焦写回 keyframeData 并重编译（= 直接改指令）。
    container.querySelectorAll('.kf-seg-ta[data-kf-seg-time]').forEach(ta => {
        const t = parseFloat(ta.dataset.kfSegTime);
        const safeId = String(t).replace(/[^A-Za-z0-9_-]/g, '_');
        const hi = container.querySelector('#kfSegHi_' + safeId);
        const errBox = container.querySelector('#kfSegErr_' + safeId);
        const blk = targets[0] || null;
        const paint = () => {
            if (!hi) return;
            let ranges = [];
            try {
                const scope = blk ? blk.scope : null;
                const r = (typeof validateMolang === 'function') ? validateMolang(ta.value, scope) : { errors: [] };
                ranges = (r.errors || []).map(e => (typeof molangErrorRange === 'function') ? molangErrorRange(ta.value, e) : null).filter(Boolean);
                if (errBox) {
                    if ((r.errors || []).length) {
                        errBox.innerHTML = r.errors.map(e => '<div>❌ ' + escapeHtml(e.message) + '</div>').join('');
                        errBox.classList.add('show');
                    } else { errBox.innerHTML = ''; errBox.classList.remove('show'); }
                }
            } catch (e) { }
            hi.innerHTML = highlightMolang(ta.value, ranges) + '\n';
        };
        const commit = () => {
            if (!blk) return;
            // 多选：本框内容**广播**到所有编辑目标（面板头已列出目标，语义直观）
            for (const b of targets) kfSetBlockSegText(b, t, ta.value);
            if (typeof applyKeyframePreviewAtTime === 'function') applyKeyframePreviewAtTime(keyframeCurrentTime);
            paint();
        };
        ta.addEventListener('input', () => { paint(); ta._kfDirty = true; });
        ta.addEventListener('change', commit);
        ta.addEventListener('blur', () => { if (ta._kfDirty) { ta._kfDirty = false; commit(); } });
        ta.addEventListener('scroll', () => { if (hi) { hi.scrollTop = ta.scrollTop; hi.scrollLeft = ta.scrollLeft; } });
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart, en = ta.selectionEnd; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2; paint(); }
        });
        paint();
    });
    // 时间块折叠（数值表 ⇄ 分段表达式：互斥）
    container.querySelectorAll('[data-kf-bfold]').forEach(btn => {
        btn.addEventListener('click', () => {
            const t = parseFloat(btn.dataset.kfBfold);
            if (kfOpenBlock.has(t)) kfOpenBlock.delete(t); else kfOpenBlock.add(t);
            kfRenderTimelinePanel(container);
        });
    });
    // ★【2026-10-18 用户要求】块头「?」按钮 → 切换本块的表达式说明文字（默认不显示，不再常显）
    container.querySelectorAll('[data-kf-bhelp]').forEach(btn => {
        btn.addEventListener('click', () => {
            const t = parseFloat(btn.dataset.kfBhelp);
            const show = !kfHelpBlock.has(t);
            if (show) kfHelpBlock.add(t); else kfHelpBlock.delete(t);
            btn.classList.toggle('on', show);
            const hint = container.querySelector(`[data-kf-bhint="${t}"]`);
            if (hint) hint.style.display = show ? 'block' : 'none';
        });
    });
    // 数值单元格 → 弹泡泡（步进=增量同步；直接输入=设为相同值）
    container.querySelectorAll('.kf-tl-val[data-kf-var]').forEach(el => {
        el.addEventListener('click', () => {
            const block = targets[0];
            if (!block) return;
            const t = parseFloat(el.dataset.kfT);
            const name = el.dataset.kfVar;
            /* ★★【2026-10-14 P0】必须把「格子上的时间」解析成**帧里真实存在的键**。
               历史遗留的原始浮点键（如 0.12690355329949238）与量化后写入口径不一致时，
               直接用它会让 kfSetValueAtFrame 新建一个 0.127 的帧、旧的浮点帧仍留着
               ⇒ 看起来"改一个影响一堆/时间块重复"。这里统一解析到最近的真实键。 */
            const _realT = (() => {
                const d = kfData(block.id);
                if (!d || !(d.frames instanceof Map) || !d.frames.size) return kfQuantTime(t);
                if (d.frames.has(t)) return t;
                let best = kfQuantTime(t), bd = Infinity;
                for (const k of d.frames.keys()) { const dd = Math.abs(k - t); if (dd < bd) { bd = dd; best = k; } }
                return bd <= 0.0015 ? best : kfQuantTime(t);   // 1ms 量化容差内 → 用真实键
            })();
            const dd = block.scope.vars.get('v.' + name);
            const step = (dd && dd.step) ? dd.step : 1;
            const cur = kfValueAt(block, _realT, name);
            /* ★★★【2026-10-16 P0 · 用户投诉「编辑时和渲染出来完全不同」「数据回弹 + 多出一帧」】
               根因链（真浏览器实测 `_r10_probe2.cjs` F1）：**点数值格不会移动播放头**。
               于是用户在「1s 的那一格」改了 side_b=7 之后：
                 · 程序按 q.anim_time 在**当前播放头**（别的时间，如 0.69s）重新求值
                 ⇒ 画面/面板显示的是别处的值 ⇒ 用户看到"数据回弹、编辑与渲染不一致"；
                 · 接着一拖 Gizmo，auto-key 又落在**当前播放头**那个非帧时刻，
                   凭空新建一帧（用户原话：「无缘无故多出来一帧」）。
               正解：点某一帧的数值格 = **把播放头定位到该帧**（与时间表/预览的语义一致：
               表里看到的那一帧就是当前编辑帧），再做写入。这样数据表、Gizmo、画面三者
               永远作用在同一个时间点上（用户要求：统一 molang 注入/解析/修改写法）。 */
            const _jumpTo = () => {
                if (Math.abs((Number(keyframeCurrentTime) || 0) - _realT) < 1e-9) return;
                keyframeCurrentTime = _realT;
                try { if (typeof updateKeyframePlayhead === 'function') updateKeyframePlayhead(); } catch (e) { }
                try { if (typeof applyKeyframePreviewAtTime === 'function') applyKeyframePreviewAtTime(_realT); } catch (e) { }
            };
            _jumpTo();
            if (typeof showBatchValueBubble === 'function') {
                showBatchValueBubble(name, el, cur, step, (nv, mode) => {
                    const useDelta = (mode === 'delta' || mode === undefined);
                    _jumpTo();                                // 泡泡可能停留很久，提交前再对齐一次
                    kfRealizeTargetVar(targets, name);       // 首次改数值 = 正式把它纳入关键帧体系
                    kfSetValueAtFrame(targets, _realT, name, nv, useDelta ? 'delta' : 'abs', block);
                    kfRefreshAllPanels();
                    try { if (typeof applyKeyframePreviewAtTime === 'function') applyKeyframePreviewAtTime(_realT); } catch (e) { }
                }, `${kfFmtTime(_realT)}s 关键帧 · ${targets.length > 1 ? '批量 ' + targets.length + ' 个方块' : '本帧数值'}`);
            } else {
                const nv = parseFloat(prompt('v.' + name + ' @' + _realT + 's =', String(cur)));
                if (Number.isFinite(nv)) {
                    _jumpTo();
                    kfRealizeTargetVar(targets, name);
                    kfSetValueAtFrame(targets, _realT, name, nv, 'abs', block);
                    kfRefreshAllPanels();
                    try { if (typeof applyKeyframePreviewAtTime === 'function') applyKeyframePreviewAtTime(_realT); } catch (e) { }
                }
            }
        });
    });
}
/* 变量候选面板（molang 风格；手机全屏）
   ★ 用户语义（2026-10-13 修正）：面板出现的时机是「把方块加入关键帧动画的那一刻」，
     它决定的是【这个变量要不要管】—— 管 = 写进 molang 最前面当常量参数，供后面所有代码使用
     （放最前面是为了避免后面的 molang 代码调用到尚未定义的变量）。 */
function kfShowVarCandidates(block, opts) {
    if (!block) return;
    const segTime = opts && opts.segTime !== undefined ? opts.segTime : null;
    const onAdded = !!(opts && opts.onAdded);
    const w = kfWritableVars(block);
    // ★【2026-10-17】打开候选面板只做只读查询、不创建条目；用户点「确定」真正写入时才创建（见下方 apply）。
    const d = kfData(block.id, false);
    const confirmed = (d && d.vars instanceof Set) ? d.vars : new Set();
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
    const old = document.getElementById('kfVarPicker'); if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.className = 'kf-var-picker' + (isMobile ? ' fullscreen' : '');
    overlay.id = 'kfVarPicker';
    // 已有帧数据的变量 → 显示"已有动画"
    const framed = new Set();
    if (d && d.frames instanceof Map) for (const [, m] of d.frames) for (const k of m.keys()) framed.add(k);
    let rows = '';
    const rowHtml = (n, why, checked, locked) => `<label class="kf-vp-row${checked ? ' on' : ''}${locked ? ' locked' : ''}"${locked ? ' title="核心变量且为常量赋值：Gizmo 可直接改，无需过问（取消勾选可把它交回表达式）"' : ''}>
        <input type="checkbox" data-kf-vp="${escapeHtml(n)}" ${checked ? 'checked' : ''}${locked ? ' disabled' : ''}>
        <span class="mv-name">v.${escapeHtml(n)}</span>
        <span class="kf-vp-why">${why}</span></label>`;
    if (w.candidates.length === 0 && w.auto.length === 0) {
        rows = `<div class="kf-vp-empty">该方块暂无变量</div>`;
    } else {
        if (w.auto.length) {
            // 核心变量且为常量赋值 → 自动入列（Gizmo 直接可改，无需过问）
            rows += `<div class="kf-vp-group">核心变量（常量赋值 · 自动入列，Gizmo 可直接改）</div>`;
            for (const n of w.auto) {
                const why = framed.has(n) ? '已有动画' : '自动可用';
                rows += rowHtml(n, why, true, true);
            }
        }
        if (w.candidates.length) {
            rows += `<div class="kf-vp-group">候选变量（自定义变量 / 被非常量表达式赋值的核心变量）</div>`;
            for (const n of w.candidates) {
                const why = framed.has(n) ? '已有动画' : (kfIsNonConstAssigned(block, n) ? '被表达式赋值' : '自定义变量');
                rows += rowHtml(n, why, confirmed.has(n) || framed.has(n));
            }
        }
        // ★★【2026-10-13 用户要求】派生量**不提供勾选框**，只列出说明：
        //   「它们由表达式算出来，就该在指令末尾接收输入、算出结果，不该也不可能打关键帧」。
        if (w.derived && w.derived.length) {
            rows += `<div class="kf-vp-group">派生量（由表达式赋值 · 不可作关键帧）</div>`;
            rows += `<div class="kf-vp-derived">这些变量由其它变量经表达式算出来（中间结果），
                它们会留在程序末尾接收输入并计算，无需也不该打关键帧：<br>`
                + w.derived.slice(0, 24).map(n => '<code>v.' + escapeHtml(n) + '</code>').join('、')
                + (w.derived.length > 24 ? ' …共 ' + w.derived.length + ' 个' : '') + `</div>`;
        }
    }
    const title = segTime !== null
        ? `本段要接管的变量 · ${segTime}s`
        : (onAdded ? `已加入关键帧动画：选择要管的变量` : `选择要作为关键帧的变量`);
    overlay.innerHTML = `<div class="kf-vp-box">
        <div class="kf-vp-head"><span>${title}</span>
            <button type="button" class="molang-head-btn" id="kfVpAll">全选</button>
            <button type="button" class="molang-head-btn" id="kfVpNone">全不选</button>
            <button type="button" class="molang-head-btn" id="kfVpClose">确定</button></div>
        <div class="kf-vp-body">${rows}</div>
        <div class="kf-vp-foot">${segTime === null
            ? '勾选 = <b>要管它</b>：该变量会被写成 molang <b>最前面的常量参数</b>（避免后面的代码调用到未定义变量），并出现在时间表的数值列里。'
            : '勾选 = 把该变量当前的表达式写成本段（' + segTime + 's 起）的分段表达式覆盖。'}</div>
    </div>`;
    document.body.appendChild(overlay);
    const apply = () => {
        const picked = Array.from(overlay.querySelectorAll('input[data-kf-vp]')).filter(i => i.checked).map(i => i.dataset.kfVp);
        const autoNames = w.auto;
        // ★【2026-10-17】用户点「确定」= 明确把变量纳入关键帧 → 这一刻才真正创建/写入条目。
        const dw = d || kfData(block.id, true);
        dw.vars = new Set([...autoNames, ...picked]);
        kfMarkDirty();
        if (segTime !== null) {
            // 区间表达式模式：为勾选变量写入当前表达式
            for (const n of picked) {
                const dd = block.scope.vars.get('v.' + n);
                kfSetExprAtFrame([block], segTime, n, dd ? String(dd.expr || '') : '0');
            }
        } else {
            kfEnsureProgram(block, true);
            block.refresh();
        }
        overlay.remove();
        kfRefreshAllPanels();   // ★ 变量候选确认后两套界面统一刷新
    };
    overlay.querySelector('#kfVpAll').addEventListener('click', () => {
        overlay.querySelectorAll('input[data-kf-vp]').forEach(i => { i.checked = true; i.parentElement.classList.add('on'); });
    });
    const noneBtn = overlay.querySelector('#kfVpNone');
    if (noneBtn) noneBtn.addEventListener('click', () => {
        overlay.querySelectorAll('input[data-kf-vp]').forEach(i => { if (!i.disabled) { i.checked = false; i.parentElement.classList.remove('on'); } });
    });
    overlay.querySelector('#kfVpClose').addEventListener('click', apply);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) apply(); });
    overlay.querySelectorAll('input[data-kf-vp]').forEach(i => i.addEventListener('change', () => i.parentElement.classList.toggle('on', i.checked)));
}
// 方块「刚刚加入关键帧动画」时调用。
/* ★★★【2026-10-14 用户明确要求 · 取消「手动选变量」】
   用户原话：「你没发现需要手动选择变量很蠢吗？直接全部默认添加所有非派生变量进入该方块的关键帧动画好吗。」
   ⇒ 方块首次进入关键帧动画时，**自动把全部非派生变量纳入**（核心通道 + 自定义输入参数），
     不再弹「选择要作为关键帧的变量」面板。
   纳入哪些（与 kfShouldRecordVar 同口径）：
     · 全部核心变换变量（xpos…extend_yrot）—— 常态数值，Gizmo/数据表都能改
     · 自定义变量中「常量赋值 / 未赋值」的（= 输入参数）
     · 不纳入：派生量（由表达式算出）、编译内部量（v.<id>_seg_time/_start_X/…）
   需要排除个别变量时，仍可从面板头「变量」按钮打开候选面板手动取消（入口保留，默认全量）。 */
function kfOnBlockAddedToAnimation(blockId) {
    const b = blocks.find(x => x.id === blockId);
    if (!b || !b.scope) return;
    try { kfPrepareTargets([b]); } catch (e) { }
    try {
        const d = kfData(b.id, true);
        if (!(d.vars instanceof Set)) d.vars = new Set();
        /* ★ 口径 = 「全部非派生变量」（用户原话：「直接全部默认添加所有非派生变量」）：
             · 核心变换变量：**仅当它是常量赋值**（xpos=0 / scale=1 这种常态数值）才纳入；
               若它是表达式赋值（如旗帜预设 `v.scale=math.sqrt(...)`、`v.zrot=math.atan2(...)`）
               那就是**派生量**，必须留在指令末尾接收输入再计算 —— 纳入会把表达式剔除、值冻死
               （这正是上一轮 T6 回归的根因：scale/zrot 被误纳入 → side_a 改了对 scale 无影响）。
             · 自定义变量：常量/未赋值 → 纳入；表达式赋值 → 派生量，不纳入。
             · 编译内部量（v.<id>_seg_time/_start_X/_TX/…）永不纳入。 */
        for (const key of b.scope.vars.keys()) {
            if (!key.startsWith('v.')) continue;
            const n = key.slice(2);
            if (isKeyframeInternalVar(n, b.id) || _kfIsNsInternal(n, b.id)) continue;
            if (kfIsNonConstAssigned(b, n)) continue;      // 派生量 → 留在末尾算，不纳入
            d.vars.add(n);
        }
        kfEnsureProgram(b, true);
        b.refresh();
        try {
            const side = document.getElementById('sideBlockList');
            if (side) kfRenderTimelinePanel(side);
        } catch (e) { }
        // ★【2026-10-17 修复】同时刷新浮动窗时间轴：变量是加入后 ~60ms 才补上的，
        //   若只刷侧栏时间表，浮动窗会停留在"刚加入时条目还空着"的旧渲染里
        //   ⇒ 表现为用户投诉的「加了方块却看不到它的轨道」。
        try { renderKeyframeTimeline(); } catch (e) { }
        if (typeof showToast === 'function') {
            showToast(`已自动纳入 ${(d.vars && d.vars.size) || 0} 个变量（派生量留在指令末尾计算）· 如需排除可点「变量」`);
        }
    } catch (e) { }
}

