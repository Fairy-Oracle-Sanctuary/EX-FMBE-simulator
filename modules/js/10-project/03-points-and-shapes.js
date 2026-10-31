/* 10-project/03-points-and-shapes.js · 源 测试版v.6b79.html 第 53628-55955 行 */
'use strict';
/* ==================== 点 / 形状系统 ====================
   ★ 设计约束（务必遵守，改动前先读）：
   1）点 = 纯辅助标记：不进 blocks、不参与任何导出指令（导出走既有的 getCommandTextForBlock），
      只在【画笔模式 isBrushMode】下可见、可被射线拾取。
   2）点带「颜色名」，点集文本格式固定为 `颜色(x,z)`，例：red(1,1) blue(2,3)。
      该格式同时用于面板展示与批量导入解析。
   3）生成形状 = 真实 FMBE 方块：
      · 两点矩形 —— 与画笔模式「createBrushPlane」同解：A→B 为长边、宽 = brushThickness（画笔粗细）。
      · 三点平行四边形 —— 走「两边一角」通用解 generatePlaneParams(a=|AB|, b=|AC|, angle=∠BAC)，
        第四点由 D = B + C − A 自动补齐，形心恰为 (B+C)/2。
   4）点按「手动选择」消费：模式决定需要的点数（矩形 2 / 平行四边形 3），选满才启用生成按钮。 */
const PT_COLORS = {
    red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e',
    cyan: '#06b6d4', blue: '#3b82f6', purple: '#a855f7', pink: '#ec4899',
    white: '#e2e8f0', gray: '#94a3b8'
};
const PT_MIN_X = -9999, PT_MAX_X = 9999;
let ptMarkers = [];      // { id, x, z, color, mesh, label }
let ptSelection = [];    // 按选择先后顺序存 marker id
// ★选中的「绿点」（当前选中方块的角点）：[{x,z}...]，按点击顺序。
//   它【不是点】：点绿点只把该角点纳入选区、不生成任何新点（用户明确要求不要自动描点），
//   造形时与已选中的点一起按 need 取用（先点后角）。角点属于某个方块，换选中方块时清空。
let ptVertexSelection = [];
// ★统一的【选择先后】序列（点 / 角点混选时也要知道「第一个选中的是谁」）：
//   { kind:'pt', id } | { kind:'vtx', x, z }。允许与上面两个数组短暂不同步，
//   读取前一律先 ptSelOrderNormalize()（剔掉已被删除/取消的项 + 去重）。
let ptSelOrder = [];
function ptSelOrderNormalize() {
    const seen = new Set();
    ptSelOrder = ptSelOrder.filter(e => {
        const alive = (e.kind === 'pt')
            ? ptSelection.indexOf(e.id) >= 0
            : ptVertexSelection.some(v => Math.abs(v.x - e.x) < 1e-6 && Math.abs(v.z - e.z) < 1e-6);
        if (!alive) return false;
        const k = (e.kind === 'pt') ? ('pt:' + e.id) : ('vtx:' + e.x.toFixed(6) + ',' + e.z.toFixed(6));
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}
// 矩形「左右两侧」预览（选了绿点时才出现，让用户挑生成方向）
let ptRectPreview = null;
let ptMode = 'rect2';    // 'rect2' = 两点矩形 | 'para3' = 三点平行四边形 | 'tri3' = 三角形（旗帜由 ptBlockIsFlag 切换，非第 4 种形状）
let ptShapeLpFired = false;   // 「三角形」按钮长按已触发（吞掉紧随其后的一次 click，避免又切换形状）
let ptSeq = 0;
// 导入文本框的用户草稿：列表每次重渲染都会重建 DOM，靠它保住打字内容与焦点。
// ★导入成功后会被清空（避免「导入 → 文本框又被点集填满 → 再点一次重复导入」）。
let ptImportDraft = '';
let ptBrushMode = 'draw';   // 画笔子模式：'draw' = 描点 | 'build' = 生成方块
let ptBlockIsFlag = false;   // ★方块/旗帜切换：true 时用旗帜生成 矩形/平行四边形/三角形（同一组形状求解器）
let ptDrawColor = 'red';    // 描点模式下当前画笔颜色
// 点坐标「显示精度」（小数位 0-6）：只影响列表/标签的显示，绝不改动实际存储数值
let ptDisplayPrecision = (() => {
    try {
        const v = parseInt(localStorage.getItem('ui_pt_precision'), 10);
        return Number.isFinite(v) ? Math.max(0, Math.min(6, v)) : 3;
    } catch (e) { return 3; }
})();
function ptFmt(v) { return (typeof v === 'number' && isFinite(v)) ? v.toFixed(ptDisplayPrecision) : String(v); }
(function ptInitPrecisionSetting() {
    const rng = document.getElementById('ptPrecisionRange');
    const lbl = document.getElementById('ptPrecisionLabel');
    const sync = () => { if (rng) rng.value = String(ptDisplayPrecision); if (lbl) lbl.textContent = String(ptDisplayPrecision); };
    sync();
    if (rng) rng.addEventListener('input', () => {
        const v = parseInt(rng.value, 10);
        ptDisplayPrecision = Number.isFinite(v) ? Math.max(0, Math.min(6, v)) : 3;
        try { localStorage.setItem('ui_pt_precision', String(ptDisplayPrecision)); } catch (e) {}
        sync();
        // 只刷新显示：3D 标签 + 侧边列表（实际数值不动）
        if (typeof ptRefreshMarkerLabels === 'function') ptRefreshMarkerLabels();
        if (typeof ptSyncPanel === 'function') ptSyncPanel();
    });
})();
// 「保留通用计算式」（画笔模式子选项）：开启后画笔生成的方块/旗帜改用预设的完整计算式
// （presetTemplates[1]「平行四边形：两边一角」/ [3]「旗帜：任意平行四边形」），
// 只做「两边一角直接赋值 + 位置直接赋值 + yrot 追加增量」三种代参 ⇒ 用户可自行改参数重算；
// 关闭（默认）时仍是 generateMolangBaseline 生成的「核心变量=常量」指令。
let ptKeepExpr = (() => {
    try { return localStorage.getItem('ui_pt_keep_expr') === '1'; } catch (e) { return false; }
})();
(function ptInitKeepExprSetting() {
    const cb = document.getElementById('ptKeepExprCheckbox');
    if (!cb) return;
    const sync = () => {
        cb.classList.toggle('checked', ptKeepExpr);
        cb.setAttribute('aria-pressed', String(ptKeepExpr));
    };
    sync();
    cb.addEventListener('click', (e) => {
        e.stopPropagation();
        ptKeepExpr = !ptKeepExpr;
        try { localStorage.setItem('ui_pt_keep_expr', ptKeepExpr ? '1' : '0'); } catch (err) {}
        sync();
    });
})();
let _brushSavedUp = new THREE.Vector3(0, 1, 0);  // 进入画笔模式前保存 camera.up，退出时还原

function ptColorHex(name) {
    const n = String(name || '').trim().toLowerCase();
    return PT_COLORS[n] || PT_COLORS.blue;
}

/* ---- 点集导入 / 取消选择：原「浮动面板」已并入侧边「点集」列表 ----------------
   曾有一个 .pt-panel 浮窗（fixed right/bottom）承载 文本框 + 导入 + 取消选择 + 清空点，
   它悬在面板之上，用户要求把它并入方块列表。现在：
     · 文本框 + 导入按钮 → 内联在列表底部的 .pt-side-import-box（见 ptRenderSideList）；
     · 取消选择 → 列表头部的 #ptUnselBtn；
     · 清空点 → 列表头部的 #ptClearBtn（🗑，原 #ptSideClear 已统一为该 id）；
     · 关闭 → 不需要了（不再有浮窗）。
   故 ptEnsurePanel / #ptPanel / .pt-panel 全部移除，不要再加回来。 */
function ptClearSelection() {
    ptSelection = [];
    ptVertexSelection = [];    // 绿点选区一起清（「取消选择」不该留下还亮着的角点）
    ptSelOrder = [];
    ptClearRectSidePreview();  // 左右预览也一并收掉
    ptRefreshMarkerLabels();   // ★ 同步清掉 3D 标签上的「● 」选中前缀
    ptSyncPanel();
}

/* 选区总数 = 已选中的「点」+ 已选中的「绿点（角点）」 */
function ptSelCount() { return ptSelection.length + ptVertexSelection.length; }

function ptClearAllPoints() {
    if (!ptMarkers.length) return;
    ptClearPoints();
    showToast('🗑 点已清空');
}

/* 内联「导入点集」：解析 → 落地 → ★清空文本框（防二次重复导入） */
function ptImportPointsInline() {
    const ta = document.getElementById('ptText');
    const txt = ta ? ta.value : ptImportDraft;
    const found = ptParsePoints(txt || '');
    if (!found.length) { showToast('❌ 没解析到点，格式示例：red(1,1) 每行一个'); return; }
    found.forEach(p => ptAddPoint(p.x, p.z, p.color, true));
    ptImportDraft = '';                 // ★清草稿 + 清文本框：避免再点一次把同一批点导入第二遍
    if (ta) ta.value = '';
    showToast('✅ 已导入 ' + found.length + ' 个点');
    ptSyncPanel();
}

/* 确保侧边「点集」列表可见（顶部「📋导入点集」按钮用它把内联导入框露出来） */
function ptRevealSideList() {
    if (!isBrushMode) return null;
    const sl = document.getElementById('sideBlockList');
    if (!sl) return null;
    if (sl.style.display === 'none') { try { toggleBlockListSidebar(); } catch (e) {} }
    ptSyncPanel();
    return sl;
}

/* ---- 点集文本解析：`red(1,1) blue(2,3)` / 逗号或分号分隔都行 ---- */
function ptParsePoints(txt) {
    const out = [];
    const re = /([A-Za-z0-9_]+)\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
    let m;
    while ((m = re.exec(txt)) !== null) {
        out.push({ color: m[1], x: parseFloat(m[2]), z: parseFloat(m[3]) });
    }
    return out;
}

/* ---- 场景内的点标记 ---- */
function ptAddPoint(x, z, color, silent) {
    const hex = ptColorHex(color);
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(hex) })
    );
    mesh.position.set(x, 0.07, z);
    const id = ++ptSeq;
    mesh.userData.ptId = id;
    scene.add(mesh);

    const div = document.createElement('div');
    // ★标签本身就是点的点击热区（文字小、球小，只靠球不好点中）；只在画笔模式下接管指针事件
    div.style.cssText = 'font:10px ui-monospace,monospace;color:' + hex + ';text-shadow:0 0 2px rgba(0,0,0,.85);' +
        'pointer-events:none;white-space:nowrap;transform:translate(-50%,-50%);cursor:pointer;padding:0 2px;';
    div.className = 'pt-tag';
    const label = new CSS2DObject(div);
    // ★★标签必须锚在【球心那一个世界点】，且每帧跟着球心走（见 ptUpdateMarkerSizes 里的同步）。
    //   曾经写成固定世界高度 y=0.26 —— 那就是「放大后文字严重偏离」的根因：画笔模式是【近垂直俯视】
    //   相机（polar 锁 0.01），俯视下世界 Y 偏移不产生“向上分离”，只变成【径向透视放大】：
    //   屏幕位置 ∝ 世界XZ / (相机高H − 世界Y)。标签深度 (H−0.26) 比球心 (H−R) 小，
    //   于是标签被放大 (H−R)/(H−0.26) 倍、越放大（H 越小）越发散。
    //   实测偏差：H=6→23px、H=3→97px、H=1→1129px、H=0.45→10944px；H≤0.30 时标签跑到近裁剪面之后，
    //   被 CSS2DRenderer 的 `_vector.z ∈ [-1,1]` 判定直接 display:none（实测三个标签全消失）。
    //   ★注意【球心自己也不是 y=0】：ptUpdateMarkerSizes 令 mesh.position.y = R，R 随缩放变
    //   （0.0004~0.011），所以只把标签压到 y=0 仍残留 ≤28px 的径向漂移（H=0.2）——必须与球心
    //   【同一个世界点】才真正归零。锚点定在后，标签恒贴点，与缩放无关。
    label.position.set(x, 0.07, z);   // 与上面 mesh.position 的初值一致；之后每帧由 ptUpdateMarkerSizes 锁定
    scene.add(label);
    div.textContent = (color || 'red') + '(' + ptFmt(x) + ',' + ptFmt(z) + ')';   // 未选中时也要显示坐标（显示精度不影响实际值）

    // 点本体（球）太小不好点 → 标签本身也当热区：命中标签直接切选中。
    div.addEventListener('pointerdown', (ev) => {
        if (!isBrushMode) return;
        ev.stopPropagation();
        ptToggleSelect(id);
    });

    // con：约束预留字段（默认 null，自由点）
    ptMarkers.push({ id, x, z, color: String(color || '').trim().toLowerCase() || 'red', mesh, label, div, con: null });
    ptSyncVisibility();
    if (!silent) ptSyncPanel();
    return ptSeq;
}

// 画笔点标记「投影面积恒定」：世界半径随相机距离线性缩放，使屏幕上点的直径固定不变（与缩放远近无关）。
// 目标投影直径 targetPx（px）；想更小/更大改这里。比原 0.07 世界半径球小很多，且不再随远近忽大忽小。
function ptUpdateMarkerSizes() {
    if (!isBrushMode || !ptMarkers.length) return;
    const cam = camera;
    const fh = (renderer && renderer.domElement) ? renderer.domElement.clientHeight : window.innerHeight;
    if (!fh) return;
    const half = fh / 2;
    const tanHalf = Math.tan((cam.fov * Math.PI / 180) / 2);
    const targetPx = 1.5;                          // 目标投影直径(px)
    const K = (targetPx * tanHalf) / fh;            // 世界半径/深度，令投影直径≈targetPx
    ptSyncCamInverse(cam);
    for (const p of ptMarkers) {
        if (!p.mesh) continue;
        // ★同绿点：用【视线深度】而非直线距离，否则远离画面中心的点会被放大（口径见 ptCamViewDepth）
        const d = ptCamViewDepth(cam, p.mesh.position) || 1;
        const R = Math.max(0.0004, K * d);          // 世界半径 ∝ 深度 → 投影直径恒定
        const s = R / 0.07;                          // 基准球半径 0.07
        // ★选中态放大 1.6× 必须在这里乘：本函数每帧跑，ptToggleSelect 里单独 setScalar 会被覆盖失效。
        p.mesh.scale.setScalar(s * (ptSelection.indexOf(p.id) >= 0 ? 1.6 : 1));
        p.mesh.position.y = R;                        // 球心抬到半径高度，底部贴地
        // ★★标签必须与球心【同一个世界点】——R 随缩放变，且近垂直俯视会把 Y 差径向放大，
        //    只把标签写死在一个固定高度就会随缩放发散（实测球心 y=0.07 恒定 + 缩放 → 偏差 10684px@H=0.2）。
        //    这一步是「放大后坐标文字严重偏离」的真正修复，删掉它就复发（详见 ptAddPoint 里那段注释）。
        if (p.label) p.label.position.set(p.x, R, p.z);
    }
}

function ptRemovePoint(id) {
    const i = ptMarkers.findIndex(p => p.id === id);
    if (i < 0) return;
    const p = ptMarkers[i];
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
    scene.remove(p.label);
    if (p.label.element) p.label.element.remove();
    ptMarkers.splice(i, 1);
    const si = ptSelection.indexOf(id);
    if (si >= 0) ptSelection.splice(si, 1);
}

function ptClearPoints() {
    ptMarkers.slice().forEach(p => ptRemovePoint(p.id));
    ptSelection = [];
    ptSelOrder = [];
    ptClearRectSidePreview();
    ptSyncPanel();
}

/* ---- 画笔子模式：描点 / 生成方块 ---- */
function ptSetBrushMode(m) {
    ptBrushMode = (m === 'build') ? 'build' : 'draw';
    ptClearRectSidePreview();   // 切子模式时收掉「左右预览」（它只在生成方块·矩形下有意义）
    ptSyncTopUI();
    ptSyncPanel();   // 同步侧边点集列表的标题 / 底部提示
    showToast(ptBrushMode === 'draw'
        ? '✏️ 描点模式：选颜色后在网格上点击放点（拖拽视角不会放点）'
        : '▦ 生成方块模式：点选 2 / 3 个点后自动生成矩形 / 平行四边形 / 三角形；🚩按钮切换为旗帜');
}

/* ---- 旗帜形状求解（供 ptBlockIsFlag 切换「用旗帜生成 矩形/平行四边形/三角形」用） --------
   复刻已验证的「旗帜：任意平行四边形」预设 molang（引擎 molang 角度单位为度：
   math.sin/cos 取度、math.asin/atan2 返度）。旗帜模型为 MODEL_REGISTRY.flag，
   旗面薄板经 computeTransformMatrix 与方块共用同一变换通道，故直接算 13 元 M
   即可（与预设导入产出的几何一致，见 _dbg_flag_preset.cjs）。
   basepos 为常量：把旗面可见中心移到枢轴（与 a/b/θ 无关，预设写死验证过）。 */
function ptComputeFlagM(a, b, angleDeg) {
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const msin = d => Math.sin(d * D2R), mcos = d => Math.cos(d * D2R);
    const masin = x => Math.asin(Math.max(-1, Math.min(1, x))) * R2D;
    const matan2 = (y, x) => Math.atan2(y, x) * R2D;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const fit_a = Math.max(Math.abs(a), 0.01);
    const fit_b = Math.max(Math.abs(b), 0.01);
    const sin_th = msin(angleDeg), cos_th = mcos(angleDeg);
    const Q1 = fit_a * fit_a;
    const Q2 = fit_b * fit_b / 4;
    const QS = Q1 + Q2;
    const QK = Q1 * Q2 * sin_th * sin_th;
    const Qd = Math.sqrt(Math.max(QS * QS - 4 * QK, 0));
    const X2 = (QS + Qd) / 2;
    const scale = Math.sqrt(Math.max(X2, 0.0001));
    const es_v = Math.sqrt(Math.max(QK, 0)) / Math.max(X2, 0.0001);
    const extend_scale = Math.max(es_v, 0.0001);
    const extend_xrot = 0;
    const den2 = QS / X2 - 2;
    const sin_ey_sq = (Math.abs(den2) < 0.0001) ? 0 : clamp((Q1 / X2 - 1) / den2, 0, 1);
    const ey_sign = (cos_th / (1 - es_v * es_v) >= 0) ? 1 : -1;
    const extend_yrot = masin(Math.sqrt(Math.max(sin_ey_sq, 0))) * ey_sign;
    const sin_ey = msin(extend_yrot), cos_ey = mcos(extend_yrot);
    let nx = 0.039223 * (1 - es_v) * sin_ey * cos_ey;
    let nz = -0.039223 * (cos_ey * cos_ey + es_v * sin_ey * sin_ey);
    const nl = Math.sqrt(nx * nx + 1 + nz * nz);
    nx /= nl; nz /= nl;
    const xrot = masin(clamp(-nz, -1, 1));
    const yrot = 0;
    const zrot = matan2(-nx, -1 / nl);
    // basepos 居中（与已验证预设完全一致）
    const xbasepos = -0.178621, ybasepos = -0.146515, zbasepos = 0.658218;
    return [
        0, 0, 0,
        xrot, yrot, zrot,
        scale, extend_scale,
        extend_xrot, extend_yrot,
        xbasepos, ybasepos, zbasepos
    ];
}

/* 旗帜「形状参数」p：从 ptComputeFlagM 的 13 元 M 取出与 generatePlaneParams
   同口径的 { xrot,yrot,zrot,scale,extend_scale,extend_xrot,extend_yrot }，
   供 ptSolveParaPlacement 复用同一套摆放求解（旗帜局部 X/Z 轴 = 旗布两对边）。
   旗布在标准姿态为轴对齐矩形（见 MODEL_REGISTRY.flag），故可用 ptPlaneAxesWorld 求朝向。

   ★★两处口径（2026-10-14 修「第1点/第3点互换，旗杆不换边」，探针 _verify_polefinal 55/55）：
   ① a/b 与模型轴的对应：ptComputeFlagM(x,y,θ) 产出「模型 X 向边长 = x、模型 Z 向边长 = y」
      （实测 unit 轴长 lx = x、lz = y/2，乘上旗布模型 1.0(X)×2.0(Z) 后正好 x、y）。
      本项目约定「第 1 条输入边 a=len1 落局部 Z（旗杆所在边）、第 2 条 b=len2 落局部 X」
      （见 ptPlaneAxesWorld 上方注释），而求解器 fwd 映射（局部 Z ↔ 第 1 条边）的门限是
      wz≈len1 && wx≈len2（wz=lz·modelEdgeZ、wx=lx·modelEdgeX）。故必须令 Z 深=a=len1、
      X 宽=b=len2，即对调成 ptComputeFlagM(b, a, ang)；否则 fwd 门限恒不过，只能走 rev
      （旗杆落到第 3 点的边上）—— 这就是用户看到的「旗杆方向不随选点顺序改变」。
   ② 手性（镜像）：ptComputeFlagM 只依赖 |sin θ| 与 cos θ，对 θ 的符号不敏感 —— θ 与 θ+180
      产出完全相同的 es/scale，只翻手性。而「旗杆落在第 1 点那条边」要求「局部 X→局部 Z 的
      有向角 ≡ ang (mod 180)」。故此处【试 θ=ang 与 θ=ang+180 两个候选、取角条件最近者】。
      ★旧实现用「ang<0 时把 extend_scale 取负」来翻手性（clampEs 保留符号），但负 es 会连模型
        局部 Y 一起翻 ⇒ 旗杆从旗布下方翻到上方露出来，与「旗杆不得翻上来可见」冲突，且用户已
        明确禁止 extend_scale 取负数 ⇒ 该做法【已彻底废除，勿再引入】。
      ★ang<0 时被选中的候选，其局部 X 与第 2 条边【反平行】（求解器里 err≈180）—— 对平行四边形
        而言反平行与同向等价（两组四角只差一个平移），由 ptSolveParaPlacement 的 errEff 归一化
        （err 与 |180−err| 取小）吸收，不构成错配。 */
function ptFlagShapeParams(a, b, ang) {
    // ★★手性口径（2026-10-18 重写，废除旧的「负 extend_scale 镜像」）：
    //   旗杆在旗帜模型的【局部 Z】上，fwd 映射要求「局部 Z ↔ 第 1 条输入边」，等价于要求
    //   「局部 X→局部 Z 的【有向角】 ≡ ang (mod 180)」（对平行四边形而言同向/反向等价，只差一个平移）。
    //   ptComputeFlagM 只依赖 |sin θ| 与 cos θ ⇒ θ 与 θ+180 的 es/scale 完全相同，只翻手性，
    //   故直接试探这两个候选、取角条件最接近者 —— 不做任何符号分支的特判，钝角也自动正确。
    //   ★绝不再用负 extend_scale：负 es 会连模型局部 Y 一起翻 ⇒ 旗杆从旗布下方翻到上方露出来
    //     （用户硬约束：不允许 extend_scale 取负数）。
    let best = null, bestE = Infinity, bestYrot = 0, bestTheta = ang;
    for (const th of [ang, ang + 180]) {
        const M = ptComputeFlagM(b, a, th);
        const cand = {
            xrot: M[3], yrot: 0, zrot: M[5], scale: M[6], extend_scale: M[7],
            extend_xrot: M[8], extend_yrot: M[9],
            modelEdgeX: 1.0, modelEdgeZ: 2.0   // 旗帜旗布模型 1.0(X)×2.0(Z)：修正求解器 unit 轴长门限
        };
        // 绕 Y 的旋转对 hx/hz 加同一个偏移 ⇒ 有向角 hx−hz 与 yrot 无关，试探时置 0 即可
        const { ex, ez } = ptPlaneAxesWorld(cand);
        const hx = Math.atan2(ex.z, ex.x) * 180 / Math.PI;
        const hz = Math.atan2(ez.z, ez.x) * 180 / Math.PI;
        const r = ((hx - hz - ang) % 180 + 180) % 180;   // 0 或趋近 180 均表示「同向/反向」，等价
        const e = Math.min(r, 180 - r);
        if (e < bestE) { bestE = e; best = cand; bestYrot = M[4]; bestTheta = th; }
    }
    best.yrot = bestYrot;
    best.theta = bestTheta;   // ★回传选定候选的 θ：供「保留通用计算式」代入旗帜预设的 angle 与 Δyrot
    return best;
}

function ptDeleteSelected() {
    if (!ptSelCount()) return;
    const n = ptSelection.length;
    ptSelection.slice().forEach(id => ptRemovePoint(id));
    ptSelection = [];
    // 绿点（角点）不能被删除 —— 只能取消选中，这里一并从选区里剔除
    const nv = ptVertexSelection.length;
    ptVertexSelection = [];
    ptSelOrder = [];
    ptClearRectSidePreview();
    ptSyncPanel();
    ptSyncTopUI();
    showToast('🗑 已删除 ' + n + ' 个选中的点' + (nv ? '，并取消 ' + nv + ' 个角点选中' : ''));
}

/* 形状图标（描点模式不显示，生成方块模式显示，点击在 矩形/平行四边形 间切换） */
const PT_RECT_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="4.5" width="11" height="7"/></svg>';
const PT_PARA_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4.5 4.5 L13 4.5 L11.5 11.5 L3 11.5 Z"/></svg>';
const PT_TRI_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M8 3.2 L13.4 12.4 L2.6 12.4 Z"/></svg>';
const PT_FLAG_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M7.6 3.2 L13.2 3.2 L13.2 9.2 L7.6 9.2 Z"/><path d="M7.6 3.2 L2.8 9.2 L7.6 9.2 Z" fill="currentColor" fill-opacity="0.28"/></svg>';

/* 形状定义表：顶部按钮 / 侧边按钮 / 生成逻辑 / 提示文案 共用同一份数据。
   ★旗帜【不是】独立形状：由 ptBlockIsFlag 切换，把下面 矩形/平行四边形/三角形 都用旗帜生成
     （见 ptMakeFlagBlock 原语）。故这里只有 3 种形状。 */
const PT_SHAPES = {
    rect2: { name: '矩形',      icon: PT_RECT_ICON, need: 2 },
    para3: { name: '平行四边形', icon: PT_PARA_ICON, need: 3 },
    tri3:  { name: '三角形',    icon: PT_TRI_ICON,  need: 3 }
};
const PT_SHAPE_ORDER = ['rect2', 'para3', 'tri3'];
function ptShapeInfo() { return PT_SHAPES[ptMode] || PT_SHAPES.rect2; }
function ptShapeNeed() { return ptShapeInfo().need; }

/* 顶部工具栏（画笔模式下可见）与浮动面板的同步 */
function ptSyncTopUI() {
    const drawBtn = document.getElementById('ptModeDrawBtn');
    const buildBtn = document.getElementById('ptModeBuildBtn');
    if (drawBtn) drawBtn.classList.toggle('on', ptBrushMode === 'draw');
    if (buildBtn) buildBtn.classList.toggle('on', ptBrushMode === 'build');
    const colorRow = document.getElementById('ptColorRow');
    if (colorRow) {
        colorRow.style.display = (ptBrushMode === 'draw') ? 'inline-flex' : 'none';
        colorRow.querySelectorAll('.pt-swatch').forEach(s => s.classList.toggle('on', s.dataset.color === ptDrawColor));
    }
    // 形状切换按钮仅「生成方块」模式可见
    const shapeBtn = document.getElementById('ptShapeToggle');
    if (shapeBtn) {
        shapeBtn.style.display = (ptBrushMode === 'build') ? '' : 'none';
        const si = ptShapeInfo();
        shapeBtn.innerHTML = si.icon +
            '<span style="margin-left:4px;">' + si.name + '</span>';
    }
    // 方块 / 旗帜切换按钮：同样仅「生成方块」模式可见
    // ★用「创建方块」面板同款图片（ICON_CUBE / ICON_FLAG，base64 PNG），不用 emoji
    //   ⚠ 这两个 const 定义在本脚本块更后面（L5679+），而 ptInitTopToolbar() 在 L40282 就会调
    //     ptSyncTopUI() ⇒ 直接引用会撞 TDZ（ReferenceError: Cannot access 'ICON_CUBE' before initialization）。
    //     故用 typeof 探路：未初始化时退回纯文字，绝不抛错；待脚本块执行到位后图标自动补上。
    const flagBtn = document.getElementById('ptFlagToggle');
    if (flagBtn) {
        flagBtn.style.display = (ptBrushMode === 'build') ? '' : 'none';
        flagBtn.classList.toggle('on', ptBlockIsFlag);
        const _sz = 14, _sty = 'vertical-align:middle;margin-right:4px;image-rendering:pixelated;';
        if (ptBlockIsFlag) {
            flagBtn.innerHTML = (typeof ICON_FLAG !== 'undefined')
                ? '<img src="' + ICON_FLAG + '" width="' + _sz + '" height="' + _sz + '" alt="旗帜" style="' + _sty + '">旗帜'
                : '旗帜';
        } else {
            flagBtn.innerHTML = (typeof ICON_CUBE !== 'undefined')
                ? '<img src="' + ICON_CUBE + '" width="' + _sz + '" height="' + _sz + '" alt="方块" style="' + _sty + '">方块'
                : '方块';
        }
    }
    const del = document.getElementById('ptDeleteSelBtn');
    if (del) {
        del.disabled = ptSelCount() === 0;
        del.textContent = '🗑删除选中(' + ptSelCount() + ')';
    }
    // 画笔长度（矩形宽）由形状按钮下方浮层 ptBrushLenPop / 侧边 pt-side-len 控制；
    // 顶部工具条里的滑动条在画笔模式下统一隐藏——描点模式不需要、生成方块也改用浮层，
    // 仅隐藏滑动条本身，画笔的「描点/生成方块/颜色/删除/形状/导入」按钮仍正常显示。
    const lbl = document.querySelector('#brushLengthToolbar .brush-length-label');
    if (lbl) lbl.style.display = 'none';
    ['brushLengthRange', 'brushLengthLabel'].forEach(id => {
        const e2 = document.getElementById(id); if (e2) e2.style.display = 'none';
    });
    const bt = (typeof brushThickness === 'number' ? brushThickness : 1);
    const lenRange = document.getElementById('ptBrushLenRange');
    const lenVal = document.getElementById('ptBrushLenValue');
    if (lenRange && document.activeElement !== lenRange) lenRange.value = bt;
    if (lenVal) lenVal.textContent = bt.toFixed(1);
    if (typeof ptPositionLenPop === 'function') ptPositionLenPop();
    // 手机端（≤600px）：画笔工具条停靠到屏幕右侧，进入/切换画笔模式时立即定位（含首次进入）
    if (typeof syncMobileBrushDock === 'function') { try { syncMobileBrushDock(); } catch (e) {} }
}

/* 一次性绑定顶部工具栏控件（元素为静态 HTML，页面加载即存在） */
function ptInitTopToolbar() {
    const drawBtn = document.getElementById('ptModeDrawBtn');
    const buildBtn = document.getElementById('ptModeBuildBtn');
    if (drawBtn) drawBtn.onclick = () => ptSetBrushMode('draw');
    if (buildBtn) buildBtn.onclick = () => ptSetBrushMode('build');
    const colorRow = document.getElementById('ptColorRow');
    if (colorRow && !colorRow.children.length) {
        Object.keys(PT_COLORS).forEach(c => {
            const s = document.createElement('button');
            s.className = 'pt-swatch' + (c === ptDrawColor ? ' on' : '');
            s.dataset.color = c;
            s.style.background = PT_COLORS[c];
            s.title = c;
            s.onclick = () => { ptDrawColor = c; ptSyncTopUI(); };
            colorRow.appendChild(s);
        });
    }
    const delBtn = document.getElementById('ptDeleteSelBtn');
    if (delBtn) delBtn.onclick = ptDeleteSelected;
    const shapeBtn = document.getElementById('ptShapeToggle');
    if (shapeBtn) shapeBtn.onclick = ptToggleShapeMode;
    const flagBtn = document.getElementById('ptFlagToggle');
    if (flagBtn) flagBtn.onclick = ptToggleFlagMode;
    // 长按「三角形」按钮（新操作模式 · 画笔模式 · 生成方块 · 当前形状为三角形）⇒ 自动开启 OBJ 导入
    // 说明：形状按钮平时点击=循环切换形状；此处仅在「长按」时走另一条路径，松手后由 ptShapeLpFired 吞掉那次 click。
    if (shapeBtn) {
        let lpTimer = null;
        const lpCancel = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
        const lpStart = () => {
            if (lpTimer) return;
            lpTimer = setTimeout(() => {
                lpTimer = null;
                const ready = isNewLayoutMode && isBrushMode && ptBrushMode === 'build' && ptMode === 'tri3';
                if (!ready) return;
                ptShapeLpFired = true;      // 标记长按已生效：让随后的 click 不再切换形状
                // 安全兜底：面板弹出后会盖住按钮，紧随的 click 可能落到面板上而永远不来这里；
                // 超时自动复位，避免“下一次正常点击形状按钮被误吞”。
                setTimeout(() => { ptShapeLpFired = false; }, 500);
                enableObjImport();
            }, 550);
        };
        shapeBtn.addEventListener('pointerdown', lpStart);
        shapeBtn.addEventListener('pointerup', lpCancel);
        shapeBtn.addEventListener('pointerleave', lpCancel);
        shapeBtn.addEventListener('pointercancel', lpCancel);
        shapeBtn.addEventListener('contextmenu', (e) => e.preventDefault());   // 屏蔽移动端长按弹出的系统菜单
    }
    const impBtn = document.getElementById('ptImportTopBtn');
    if (impBtn) impBtn.onclick = () => {
        // ★导入框已并入侧边「点集」列表：这里只负责把列表露出来并聚焦到该文本框
        const sl = ptRevealSideList();
        const t = sl ? sl.querySelector('#ptText') : null;
        if (t) {
            t.focus();
            try { t.scrollIntoView({ block: 'center' }); } catch (e) {}
        } else {
            showToast('请在「点集」列表底部粘贴点集');
        }
    };
    // 画笔长度浮层（矩形宽）：拖动即改 brushThickness，并与顶部工具栏滑动条双向同步
    const lenPop = document.getElementById('ptBrushLenPop');
    if (lenPop) {
        const range = lenPop.querySelector('#ptBrushLenRange');
        const label = lenPop.querySelector('#ptBrushLenValue');
        if (range) range.oninput = () => {
            brushThickness = parseFloat(range.value);
            if (label) label.textContent = brushThickness.toFixed(1);
            if (typeof syncBrushThicknessUI === 'function') syncBrushThicknessUI();
        };
    }
    ptSyncTopUI();   // ★初始化即同步一次：让「形状/方块-旗帜」按钮的图标与显隐立刻到位
}

/* 形状切换（矩形 → 平行四边形 → 三角形 → 矩形）：顶部按钮与窄屏侧栏按钮共用 */
function ptToggleShapeMode() {
    // 长按「三角形」按钮已触发（开启了 OBJ 导入）⇒ 吞掉松手后紧随的一次 click，不切换形状
    if (ptShapeLpFired) { ptShapeLpFired = false; return; }
    const i = PT_SHAPE_ORDER.indexOf(ptMode);
    ptMode = PT_SHAPE_ORDER[(i + 1) % PT_SHAPE_ORDER.length];
    ptSyncTopUI();
    ptSyncPanel();
    // 切换后若已选够点，立即按新形状生成（矩形 + 含绿点 ⇒ 先给左右预览）
    ptClearRectSidePreview();
    const need = ptShapeNeed();
    if (ptBrushMode === 'build' && ptSelCount() >= need) ptMaybeGenerate();
}

/* 方块 / 旗帜切换（同一组形状：矩形 / 平行四边形 / 三角形）
   ★不在切换时立即重生成：生成会把点的选中态清空，用户一般是在选点前先决定旗/块；
     若此刻正好已选够点，也顺手补生成一次，行为与「切换形状」一致。 */
function ptToggleFlagMode() {
    ptBlockIsFlag = !ptBlockIsFlag;
    ptSyncTopUI();
    ptSyncPanel();
    ptClearRectSidePreview();
    showToast(ptBlockIsFlag
        ? '🚩 旗帜模式：矩形 / 平行四边形 / 三角形 都用旗帜生成'
        : '⬜ 方块模式：普通方块生成');
    const need = ptShapeNeed();
    if (ptBrushMode === 'build' && ptSelCount() >= need) ptMaybeGenerate();
}
ptInitTopToolbar();


/* 点只在画笔模式下可见（这是硬要求：点不参与导出，仅为绘制辅助） */
function ptSyncVisibility() {
    const vis = !!isBrushMode;
    for (const p of ptMarkers) {
        p.mesh.visible = vis;
        p.label.visible = vis;
        // ★拖拽中必须关掉标签命中：标签盖在 canvas 之上且 pointer-events:auto，
        //   会把 pointermove 全吃掉 ⇒ 拖动点完全失效（只在 canvas 上监听也收不到）。
        p.div.style.pointerEvents = vis ? 'auto' : 'none';
    }
}


// 刷新所有点标记的标签文字（选中态 = 加「● 」前缀）。清空选区 / 改显示精度后都要调，
// 否则只清了 ptSelection 数组、标记上仍留着「●」→ 点看起来还处于选中状态。
function ptRefreshMarkerLabels() {
    for (const p of ptMarkers) {
        if (!p || !p.div) continue;
        p.div.textContent = (ptSelection.indexOf(p.id) >= 0 ? '● ' : '') + p.color + '(' + ptFmt(p.x) + ',' + ptFmt(p.z) + ')';
    }
}

function ptToggleSelect(id) {
    const i = ptSelection.indexOf(id);
    let added = false;
    if (i >= 0) {
        ptSelection.splice(i, 1);
        ptSelOrder = ptSelOrder.filter(e => !(e.kind === 'pt' && e.id === id));
    } else {
        ptSelection.push(id);
        ptSelOrder.push({ kind: 'pt', id: id });
        added = true;
    }
    const p = ptMarkers.find(q => q.id === id);
    if (p) {
        const on = ptSelection.indexOf(id) >= 0;
        p.mesh.scale.setScalar(on ? 1.6 : 1);
    }
    ptRefreshMarkerLabels();
    ptSyncPanel();
    // 生成方块模式：选够点（矩形 2 / 平行四边形 3 / 三角形 3）后自动生成，无需单独「生成」按钮
    // ★计数含「绿点」选区：点与角点可混选。矩形 + 含绿点 ⇒ 走左右预览让用户挑方向。
    if (added && ptBrushMode === 'build') {
        const need = ptShapeNeed();
        if (ptSelCount() >= need) ptMaybeGenerate();
    }
}

/* 「绿点」（方块角点）的选中切换：只进出选区，【绝不生成点】（用户明确要求）。
   返回 true = 本次是「加入选中」。 */
function ptToggleVertexSelect(x, z) {
    const EPS = 1e-6;
    const i = ptVertexSelection.findIndex(v => Math.abs(v.x - x) < EPS && Math.abs(v.z - z) < EPS);
    let added = false;
    if (i >= 0) {
        ptVertexSelection.splice(i, 1);
        ptSelOrder = ptSelOrder.filter(e => !(e.kind === 'vtx' && Math.abs(e.x - x) < EPS && Math.abs(e.z - z) < EPS));
    } else {
        ptVertexSelection.push({ x: x, z: z });
        ptSelOrder.push({ kind: 'vtx', x: x, z: z });
        added = true;
    }
    ptSyncPanel();
    if (added && ptBrushMode === 'build' && ptSelCount() >= ptShapeNeed()) ptMaybeGenerate();
    return added;
}

/* ---- 矩形「左右两侧」预览：选区里有绿点时不直接生成，先让用户挑方向 ----------------
   为什么：矩形的常规解法以 A→B 为【长边的中心线】（矩形被摆在线段两侧各一半），
   于是选了角点也保证不「有顶角落在该角点上」。用户要求：**只要选了绿点，生成的矩形
   至少有一个顶角必须落在绿点上** ⇒ 改成以 A→B 为矩形的一条【边】，再让用户决定往哪侧长：
     · 红矩形：A→B 是矩形的【右边】⇒ 矩形长在 A→B 的左侧（法向 n = (uz, −ux)）
     · 绿矩形：A→B 是矩形的【左边】⇒ 矩形长在 A→B 的右侧（法向 n = (−uz, ux)）
   两侧矩形的四个角都是 {A, B, B+n·w, A+n·w} ⇒ A、B 都是真实顶角，绿点必然落在角上。
   （A→B 的「右侧」= 沿 A→B 行走时的右手边：俯视下屏幕右 = +X、屏幕上 = −Z，故右手法向 = (−uz, ux)。） */

/* 以 A→B 为一条边、朝法向 (nx,nz) 长出宽度 w 的矩形。
   复用 ptMakeRectBlock：把两端点整体平移 n·(w/2)，它内部再减去 n·(w/2) 求角，
   正好得到角集 {A, B, B+n·w, A+n·w}、形心 = 中点 + n·(w/2)。 */
function ptMakeRectBlockSide(A, B, nx, nz) {
    const w = (typeof brushThickness === 'number' && brushThickness > 0) ? brushThickness : 1;
    const hw = w / 2;
    return ptMakeRectBlock(
        { x: A.x + nx * hw, z: A.z + nz * hw },
        { x: B.x + nx * hw, z: B.z + nz * hw }
    );
}

function ptClearRectSidePreview() {
    if (!ptRectPreview) return;
    for (const it of ptRectPreview.items) {
        if (it.mesh) { scene.remove(it.mesh); it.mesh.geometry.dispose(); it.mesh.material.dispose(); }
        if (it.line) { scene.remove(it.line); it.line.geometry.dispose(); it.line.material.dispose(); }
    }
    ptRectPreview = null;
}

function ptShowRectSidePreview(A, B) {
    ptClearRectSidePreview();
    const dx = B.x - A.x, dz = B.z - A.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) return false;
    const ux = dx / L, uz = dz / L;
    const w = (typeof brushThickness === 'number' && brushThickness > 0) ? brushThickness : 1;
    const y = 0.004;                       // 略高于地面，避免与已生成的薄板 z-fighting
    const defs = [
        { key: 'red',   n: [uz, -ux],   color: 0xef4444 },   // A→B 为右边
        { key: 'green', n: [-uz, ux],   color: 0x22c55e }    // A→B 为左边
    ];
    const items = [];
    for (const d of defs) {
        const nx = d.n[0], nz = d.n[1];
        const c = [
            { x: A.x, z: A.z }, { x: B.x, z: B.z },
            { x: B.x + nx * w, z: B.z + nz * w }, { x: A.x + nx * w, z: A.z + nz * w }
        ];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            c[0].x, y, c[0].z, c[1].x, y, c[1].z, c[2].x, y, c[2].z,
            c[0].x, y, c[0].z, c[2].x, y, c[2].z, c[3].x, y, c[3].z
        ]), 3));
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
            color: d.color, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false
        }));
        scene.add(mesh);
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            c[0].x, y, c[0].z, c[1].x, y, c[1].z, c[2].x, y, c[2].z, c[3].x, y, c[3].z, c[0].x, y, c[0].z
        ]), 3));
        const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: d.color, transparent: true, opacity: 0.95 }));
        scene.add(line);
        items.push({ key: d.key, n: [nx, nz], color: d.color, corners: c, mesh, line });
    }
    ptRectPreview = { A: { x: A.x, z: A.z }, B: { x: B.x, z: B.z }, ux: ux, uz: uz, L: L, w: w, items: items };
    showToast('↔️ 选方向：点【红】= A→B 作右边；点【绿】= A→B 作左边');
    return true;
}

/* 点击落在哪个预览矩形里：把落点投到地面，再在 (A→B, 法向) 这组正交基里做矩形内判定 */
function ptPickRectSidePreview() {
    if (!ptRectPreview) return null;
    const gp = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(_ptGroundPlane, gp)) return null;
    const P = ptRectPreview;
    for (const it of P.items) {
        const u = (gp.x - P.A.x) * P.ux + (gp.z - P.A.z) * P.uz;
        const v = (gp.x - P.A.x) * it.n[0] + (gp.z - P.A.z) * it.n[1];
        if (u >= -1e-9 && u <= P.L + 1e-9 && v >= -1e-9 && v <= P.w + 1e-9) return it;
    }
    return null;
}

function ptGenerateRectSide(item) {
    const P = ptRectPreview;
    if (!P || !item) return false;
    const block = ptMakeRectBlockSide(P.A, P.B, item.n[0], item.n[1]);
    if (!block) return false;
    ptClearRectSidePreview();
    addBlock(block, true, true);
    selectBlock(block);
    ptSelection = []; ptVertexSelection = []; ptSelOrder = [];
    ptRefreshMarkerLabels();
    ptSyncPanel();
    showToast('✅ 已生成方块 ' + block.id + '（' + (item.key === 'red' ? '红' : '绿') + '侧）');
    return true;
}

/* 统一的「选够了就生成」入口：矩形 + 选区含绿点 ⇒ 先给左右预览，否则照旧直接生成 */
function ptMaybeGenerate() {
    if (ptBrushMode !== 'build') return false;
    if (ptSelCount() < ptShapeNeed()) return false;
    if (ptMode === 'rect2' && ptVertexSelection.length) {
        ptSelOrderNormalize();
        const sel = ptSelectedPoints();
        if (sel.length >= 2 && ptShowRectSidePreview(sel[0], sel[1])) return true;
    }
    ptGenerate();
    return true;
}

/* ---- 面板渲染 / 状态同步 ---- */
function ptSyncPanel() {
    // ★导入文本框**不再镜像点集**：它已并入侧边列表，是「纯粘贴导入框」。
    //   旧实现每次 sync 都用点集回填文本框 → 导入后文本框又被填满 → 再点一次就重复导入。
    //   现在文本框只认用户草稿 ptImportDraft，导入成功后由 ptImportPointsInline 清空。
    ptSyncTopUI();
    // 画笔模式下，点集主列表显示在侧边「方块列表」区域（取代方块列表）
    if (isBrushMode) {
        const sl = document.getElementById('sideBlockList');
        if (sl) {
            if (sl.style.display === 'none') { try { toggleBlockListSidebar(); } catch (e) {} }
            ptRenderSideList(sl);
        }
    }
}



/* 画笔模式下：把「点集」渲染进侧边方块列表区域（取代方块列表） */


function ptRenderSideList(sideList) {
    // ★【2026-10-24】本函数会整体改写容器内容 ⇒ 让侧栏「结构缓存」失效，
    //   否则退出画笔模式后可能因缓存命中而误判“结构未变”，把点集界面留在原地。
    if (sideList) { sideList._structHtml = null; sideList._modeKey = null; }
    const need = ptShapeNeed();
    const shapeName = ptShapeInfo().name;
    const headTitle = ptBrushMode === 'draw' ? '点集 · 描点' : '点集 · ' + shapeName;
    // 窄屏：动作按钮整行放在蓝色标题【上方】（CSS 媒体查询仅窄屏显示）
    const _bt = (typeof brushThickness === 'number' ? brushThickness : 1);
    let html = '<div class="pt-side-actions">' +
        '<button type="button" class="pt-top-btn" id="ptSideDelSel"' + (ptSelCount() ? '' : ' disabled') +
            '>🗑 删除选中(' + ptSelCount() + ')</button>' +
        (ptBrushMode === 'build'
            ? '<button type="button" class="pt-top-btn" id="ptSideShape">' +
                ptShapeInfo().icon +
                '<span style="margin-left:4px;">' + shapeName + '</span></button>'
            : '') +
        (ptBrushMode === 'build' && ptMode === 'rect2'
            ? '<span class="pt-side-len"><span style="font-size:11px;color:var(--color-text-muted,#94a3b8);">矩形宽</span>' +
              '<input type="range" id="ptSideLen" class="brush-length-range" min="0.1" max="5" step="0.1" value="' + _bt + '">' +
              '<span id="ptSideLenVal" style="font-size:11px;min-width:22px;text-align:right;color:var(--color-text-strong,#e2e8f0);">' + _bt.toFixed(1) + '</span></span>'
            : '') +
        '</div>';
    html += '<div class="outliner-header">' +
        '<span style="font-size:13px;font-weight:600;color:#60a5fa;">' + headTitle + '</span>' +
        '<button type="button" class="outliner-header-btn pt-side-unsel" id="ptUnselBtn" title="取消选择（清空已选中的点）">取消选择</button>' +
        '<span class="outliner-header-btn" id="ptClearBtn" title="清空全部点">🗑</span></div>';
    if (!ptMarkers.length) {
        html += '<div class="pt-empty" style="padding:10px 6px;">还没有点。' +
            (ptBrushMode === 'draw'
                ? '在上方选颜色后到网格上点击放点，或在下方「导入点集」粘贴点集。'
                : '切到「描点」放点，或导入点集后回到此模式选点。') + '</div>';
    } else {
        html += '<div class="pt-points">';
        html += ptMarkers.map((p, i) => {
            const on = ptSelection.indexOf(p.id) >= 0;
            return '<div class="pt-point' + (on ? ' on' : '') + '" data-id="' + p.id + '">' +
                '<span class="pt-dot" style="background:' + ptColorHex(p.color) + '"></span>' +
                '<span class="pt-idx">' + (i + 1) + '</span>' +
                '<span class="pt-coord">' + escapeHtml(p.color) + '(' + ptFmt(p.x) + ',' + ptFmt(p.z) + ')</span>' +
                '<button class="pt-del" data-del="' + p.id + '" title="删除">✕</button>' +
                '</div>';
        }).join('');
        html += '</div>';
    }
    if (ptBrushMode === 'build') {
        html += '<div class="pt-side-foot">已选 ' + ptSelCount() + ' / ' + need + ' 点 · 选够自动生成' +
            (ptVertexSelection.length ? '（含 ' + ptVertexSelection.length + ' 个方块角点）' : '') + '</div>';
    }
    // ★内联「导入点集」区（已并入列表，不再是浮在面板之上的独立窗口）
    //   sticky 与否由【实测内容高度】决定：内容没超过容器 ⇒ sticky（导入框常驻可见）；
    //   超过（点很多）⇒ 普通流式，避免 sticky-bottom 盖住上方内容。
    const _impSticky = (() => {
        const host = sideList.parentElement || sideList;
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0;' +
            'width:' + Math.max(1, sideList.clientWidth) + 'px;';   // ★同宽才能量出真实高度
        probe.innerHTML = html;
        host.appendChild(probe);
        const h = probe.scrollHeight;
        host.removeChild(probe);
        return h <= (sideList.clientHeight || 9999) + 2;
    })();
    html += '<div class="pt-side-import-box' + (_impSticky ? ' pt-import-sticky' : '') + '">' +
        '<div class="pt-side-import-head">📋 导入点集（每行一个：颜色(x,z)）</div>' +
        '<textarea class="pt-textarea" id="ptText" placeholder="red(0.48000,0.76800)&#10;red(0.20610,0.56900)"></textarea>' +
        '<button type="button" class="pt-side-import" id="ptSideImport">导入点集</button>' +
        '</div>';
    // ★列表整体重建 innerHTML ⇒ 文本框会丢内容/焦点，故先记焦点再按草稿还原
    const _impFocused = (() => { const a = document.activeElement; return !!(a && a.id === 'ptText'); })();
    sideList.innerHTML = html;
    const _ta = sideList.querySelector('#ptText');
    if (_ta) {
        _ta.value = ptImportDraft;
        _ta.addEventListener('input', () => { ptImportDraft = _ta.value; });
        if (_impFocused) { _ta.focus(); try { _ta.setSelectionRange(_ta.value.length, _ta.value.length); } catch (e) {} }
    }
    // 窄屏内联「矩形宽」滑动条绑定
    const sideLen = sideList.querySelector('#ptSideLen');
    if (sideLen) {
        sideLen.addEventListener('input', () => {
            brushThickness = parseFloat(sideLen.value);
            const v = sideList.querySelector('#ptSideLenVal');
            if (v) v.textContent = brushThickness.toFixed(1);
            if (typeof syncBrushThicknessUI === 'function') syncBrushThicknessUI();
        });
    }
    // 矩形模式：把画笔长度滑动条浮到形状切换按钮下方（窄屏改为内联显示，故此处隐藏浮层）
    ptPositionLenPop();
}

/* 把画笔长度浮层定位到形状切换按钮正下方（仅「生成方块·矩形」显示；窄屏不显示，改用列表内联） */
function ptPositionLenPop() {
    const pop = document.getElementById('ptBrushLenPop');
    if (!pop) return;
    const narrow = window.innerWidth <= 700;
    const show = !narrow && isBrushMode && ptBrushMode === 'build' && ptMode === 'rect2';
    const anchor = document.getElementById('ptShapeToggle');
    if (!show || !anchor) { pop.style.display = 'none'; return; }
    const r = anchor.getBoundingClientRect();
    if (r.width === 0) { pop.style.display = 'none'; return; }
    pop.style.display = 'flex';
    pop.style.left = Math.max(6, Math.round(r.left)) + 'px';
    pop.style.top = Math.round(r.bottom + 4) + 'px';
}

/* ---- 生成真实 FMBE 方块 ---- */
function ptSelectedPoints() {
    const need = ptShapeNeed();
    ptSelOrderNormalize();
    const out = [];
    const has = (x, z) => out.some(o => Math.abs(o.x - x) < 1e-6 && Math.abs(o.z - z) < 1e-6);
    // ★按【真实选择先后】输出（点 / 角点混选时也要分清谁是第一个选的）
    for (const e of ptSelOrder) {
        if (out.length >= need) break;
        if (e.kind === 'pt') {
            const p = ptMarkers.find(q => q.id === e.id);
            if (p) out.push(p);
        } else if (!has(e.x, e.z)) {
            out.push({ id: -1, x: e.x, z: e.z, color: ptDrawColor });   // 角点不是点：没有 id / 不在 ptMarkers 里
        }
    }
    // 兜底：ptSelOrder 缺失项（外部直接改数组等）时按「点 → 角点」补齐
    if (out.length < need) {
        for (const id of ptSelection) {
            if (out.length >= need) break;
            if (out.some(o => o.id === id)) continue;
            const p = ptMarkers.find(q => q.id === id);
            if (p) out.push(p);
        }
        for (const v of ptVertexSelection) {
            if (out.length >= need) break;
            if (has(v.x, v.z)) continue;
            out.push({ id: -1, x: v.x, z: v.z, color: ptDrawColor });
        }
    }
    return out;
}

/* ---- ★★画笔平面：去掉 forceDoubleSide，改走与普通方块完全一致的 FrontSide -----------
   摩尔纹根因：平面是 ≈零厚度薄板（extend_scale = 0.0001 ⇒ 世界厚度 ≈0.0004），
   以前又给它打了 forceDoubleSide=true（起源是"零厚度单面矩形要能正反拾取"），
   于是薄板正反两面相距仅 0.0004，而相机是 far=1e6/near=0.1（深度精度被压到 ~1e-4），
   两面挤进同一个深度桶 → 自相 z-fighting → 整面摩尔纹。
   ★关键认识：方块是【封闭六面体】，每个面都有朝外的法线 ⇒ FrontSide 下
     · 从上方看：顶面是正面 → 渲染顶面、背面（底面）被剔除；
     · 从下方看：底面是正面 → 同样可见、同样可被射线拾取。
   所以"能正反拾取"根本不需要双面 —— 去掉 forceDoubleSide 即可，且
   与「创建平面」对话框 / 预设产出的方块口径完全相同（它们就是这么做的、从来不摩尔纹）。
   ★厚度继续保持 0.0001 不动：实测把厚度加大（如 0.03）会因 extend_xrot/extend_yrot
     的斜切把平面角点推离选中点最多 ~0.037（探针 P1.1 起判据失效），属于几何精度回归。
     故"薄"不是问题、"双面"才是，薄板照旧、只削掉双面。 */
/* ★★三角形三块必须【严格共面】（y 恒 0），不做任何 y 错层 —— 曾经的 PT_TRI_STACK=0.012 是错的。
   为什么共面重叠不会出问题：三块都由 ptSolveParaPlacement 同源求解 ⇒ 朝上的大面同为
   局部 +Y 面（顶点色烘焙 1.0）、渲染色同为 #aaccff；材质又是 FrontSide（背面被剔除）。
   同色 + 同面 ⇒ 共面处"深度谁赢都一样"，逐偏航角/逐像素量不出任何抖动（探针实测 Δ=0）。
   而错层会把三块抬成 0/12/24mm 的阶梯 —— 用户可见的"三角形没完全落在 XZ 平面上"即此。
   几何上三块的并集【正好】是三角形 ABC，唯一重叠区 = 中心中位三角形(M_ab,M_bc,M_ca)，
   每条边由相邻两块各占一半首尾相接，所以去掉错层也不会露出任何缝隙。 */

// 两点矩形：形状走【与「创建平面」对话框同源的通用解】generatePlaneParams(length, 画笔粗细, 90°)，
//   朝向交给与平行四边形一致的「实测局部轴 → 解 yrot」求解器（ptSolveParaPlacement）——
//   于是矩形 / 平行四边形 / 三角形 三者同源同口径，长边对准 A→B，形心 = 线段中点。
// ★★为什么不再用旧的 generateRectParams 手工解（实测根因，勿回退）：
//   方块几何的顶点色是【按局部面烘焙的假明暗】：局部 +Y 面 = 1.0、-Y 面 = 0.5、±X = 0.6、±Z = 0.8，
//   而平面板是"压扁的薄片"，两张【大面】正是局部 ±Y 面。旧手工解的 (xrot,zrot) 分支会把板
//   【翻过来】——朝上的大面变成局部 -Y 面（烘焙 0.5）⇒ 矩形平面渲染成 50% 暗色
//   （实测像素 #556680 = 0.5 × #aaccff，而平行四边形/三角形/对话框平面都是 #aaccff）。
//   同一现象的旧版还叠加了 DoubleSide：0.5 面与 1.0 面几乎共面（板厚 ~5e-4）互相抢深度
//   → 逐像素在 100%/50% 间跳 = 用户看到的「严重摩尔纹」（同 TITLE_PLATE_THICK 注释所述）。
function ptMakeRectBlock(p1, p2, isFlag) {
    const dir = new THREE.Vector3(p2.x - p1.x, 0, p2.z - p1.z);
    const length = dir.length();
    if (length < 1e-6) { showToast('❌ 两点重合，无法生成矩形'); return null; }   // ★与求解器同一口径：1 微米，不再用 0.01（小矩形会被误判为重合）
    const width = (typeof brushThickness === 'number' && brushThickness > 0) ? brushThickness : 1;
    // 合成长边 = length、宽边 = width、夹角 90° 的矩形：把顶角挪到「以线段中点为中心」的角上，
    // 使形心落在中点（与旧实现一致），宽边垂直于 A→B。
    const hw = width / 2;
    const ux = dir.x / length, uz = dir.z / length;   // 长边方向（A→B）
    const nx = -uz, nz = ux;                          // 宽边方向（垂直）
    const A2 = { x: p1.x - nx * hw, z: p1.z - nz * hw };
    const B2 = { x: p2.x - nx * hw, z: p2.z - nz * hw };
    const C2 = { x: A2.x + nx * width, z: A2.z + nz * width };
    // ★方块/旗帜切换：同一矩形，用旗帜模型（含旗杆）落成
    if (isFlag) return ptMakeFlagBlock(A2, B2, C2);
    const solved = ptSolveParaPlacement(A2, B2, C2);
    if (!solved) { showToast('❌ 无法生成矩形'); return null; }
    const p = solved.p;
    const center = new THREE.Vector3((p1.x + p2.x) / 2, 0, (p1.z + p2.z) / 2);
    let blockId = 'Plane', _pi = 1;
    while (blocks.some(b => b.id === blockId)) blockId = 'Plane' + (_pi++);
    const M = [
        center.x, 0, center.z,
        p.xrot, solved.yrot, p.zrot,
        p.scale, p.extend_scale,
        p.extend_xrot, p.extend_yrot,
        0, 0, 0
    ];
    const blk = new Block(blockId, M, null, '#aaccff', 'cube', null, null);   // ★ 不再 forceDoubleSide
    ptApplyKeepExpr(blk, false, solved, center.x, center.z);   // 开启「保留通用计算式」时改写为预设完整表达式
    return blk;
}

/* ---- 平行四边形朝向求解 --------------------------------------------------------
   引擎的局部矩阵（computeTransformMatrix）为
     L = Ry(-yrot)·Rx(xrot)·Rz(-zrot)·S·Eyl·Exl·Es·Exr·Eyr·Esy
   其中 yrot 位于链最外层、只绕【世界 Y】旋转 ⇒ 只改变平面在 XZ 内的朝向(heading)，
   而 xrot/zrot 负责把平面放平，两者解耦；且实测『heading 增量 = +Δyrot』。
   因此：用与引擎【完全一致】的矩阵链算出局部 X/Y 轴当前指向，再求 Δ 令其对准 A→B / A→C。
   （直接叠加 p.yrot 会让平面停在求解器的规范朝向上 → 就是用户看到的"没转到正确位置"。） */
function ptPlaneAxesWorld(p) {
    const d2r = Math.PI / 180;
    // ★必须与引擎 computeTransformMatrix 的 clampEs 同口径：extend_scale 的【符号】= 镜像。
    //   旧代码取 Math.abs 把符号抹了 ⇒ 负 es 的镜像块在这里被算成非镜像、求解器看不到镜像候选。
    //   （现在旗帜路径已不产生负 es，此处保留符号只是为了与引擎口径一致，不影响旗帜。）
    const es = clampEs(p.extend_scale);
    const Esy = new THREE.Matrix4().makeScale(1, es, 1);
    const Eyr = new THREE.Matrix4().makeRotationY(-d2r * (-p.extend_yrot));
    const Exr = new THREE.Matrix4().makeRotationX(-d2r * p.extend_xrot);
    const Es = new THREE.Matrix4().makeScale(1, 1, es);
    const Exl = new THREE.Matrix4().makeRotationX(d2r * p.extend_xrot);
    const Eyl = new THREE.Matrix4().makeRotationY(d2r * (-p.extend_yrot));
    const S = new THREE.Matrix4().makeScale(p.scale, p.scale, p.scale);
    const Rz = new THREE.Matrix4().makeRotationZ(d2r * (-p.zrot));
    const Rx = new THREE.Matrix4().makeRotationX(d2r * p.xrot);
    const Ry = new THREE.Matrix4().makeRotationY(d2r * (-p.yrot));
    // 与引擎 premultiply 顺序一致：Esy→Eyr→Exr→Es→Exl→Eyl→S→Rz→Rx→Ry
    const L = Esy.clone()
        .premultiply(Eyr).premultiply(Exr).premultiply(Es).premultiply(Exl).premultiply(Eyl)
        .premultiply(S).premultiply(Rz).premultiply(Rx).premultiply(Ry);
    // ★实测：平面两条真实的边是【局部 X】与【局部 Z】；局部 Y 是被 extend_scale 压扁的薄轴。
    //   且局部 Z ↔ 第 1 条输入边(a=len1)，局部 X ↔ 第 2 条输入边(b=len2)。
    return {
        ex: new THREE.Vector3(1, 0, 0).applyMatrix4(L),   // 局部 X 轴
        ez: new THREE.Vector3(0, 0, 1).applyMatrix4(L)    // 局部 Z 轴
    };
}
const _ptNormDeg = a => ((a % 360) + 540) % 360 - 180;

/* ============ 「保留通用计算式」：把预设的完整表达式代参写进生成物的 program ============
   开启（ptKeepExpr）后，画笔生成的方块用预设 index 1「平行四边形：两边一角」、
   旗帜用预设 index 3「旗帜：任意平行四边形」，不再走 generateMolangBaseline 的
   「核心变量 = 常量」，而是把预设里的完整计算链原样搬过来，只做三种代参：
     · 形状参数「两边一角」（side_a / side_b / angle）直接赋值；
     · 位置（xpos / zpos）直接赋值（生成物 y 恒 0，ypos 不动）；
     · yrot 追加本次求解相对预设规范朝向的增量 Δ（xrot/zrot/scale/extend_* 由表达式自行算出）。
   于是导出指令仍是「可自主改参数重算」的通用计算式。 */
// 从预设指令里抽出纯语句段：`... _ 0 "'<材质标签>'; <语句>; '<编号标签>'; "`
function ptPresetStatements(command) {
    const s = String(command || '');
    const i = s.indexOf("';");                 // 首个标签（材质 / 方块类型）结束处
    if (i < 0) return '';
    let rest = s.slice(i + 2).replace(/^\s+/, '');
    // 去掉末尾的「编号标签」段（形如 `...);'方块编号：Cube'; "`，注意 `;` 与 `'` 间常无空格；
    // ★不能连标签前面的那个 `;` 一起吃掉，它是前一条语句的结束分号，少一个就会出现
    //   「语句结尾缺少分号」的解析错误导致整段程序不执行。
    rest = rest.replace(/\s*'[^']*'\s*;\s*(?:"\s*)?$/, '');
    return rest.replace(/\s+/g, ' ').trim();
}
function ptFmtNum(v) {
    const n = Math.round(Number(v) * 1e6) / 1e6;
    return String(n === 0 ? 0 : n);
}
// 把程序里 v.<name>=<旧值>; 整条替换为常量赋值
function ptSubstVar(text, name, value) {
    return text.replace(new RegExp('v\\.' + name + '\\s*=\\s*[^;]*;'), 'v.' + name + '=' + ptFmtNum(value) + ';');
}
// 旗帜预设 index3 的 v.yrot=math.atan2(v.nz,v.nx) 之 JS 镜像（与 ptComputeFlagM 内部同源；
// ptComputeFlagM 把 yrot 固定成 0，故只能按同一套 nx/nz/nl 公式另算一次）。
function ptFlagPresetYrot(len2, len1, th) {
    const R2D = 180 / Math.PI;
    const fit_a = Math.max(Math.abs(len2), 0.01), fit_b = Math.max(Math.abs(len1), 0.01);
    const sin_th = Math.sin(th / R2D), cos_th = Math.cos(th / R2D);
    const Q1 = fit_a * fit_a, Q2 = fit_b * fit_b / 4;
    const QS = Q1 + Q2, QK = Q1 * Q2 * sin_th * sin_th;
    const Qd = Math.sqrt(Math.max(QS * QS - 4 * QK, 0));
    const X2 = (QS + Qd) / 2;
    const es_v = Math.sqrt(Math.max(QK, 0)) / Math.max(X2, 0.0001);
    const den2 = QS / X2 - 2;
    const sin_ey_sq = (Math.abs(den2) < 0.0001) ? 0 : Math.max(0, Math.min(1, (Q1 / X2 - 1) / den2));
    const ey_sign = (cos_th / (1 - es_v * es_v) >= 0) ? 1 : -1;
    const ey_deg = Math.asin(Math.sqrt(Math.max(sin_ey_sq, 0))) * R2D * ey_sign;
    const sin_ey = Math.sin(ey_deg / R2D), cos_ey = Math.cos(ey_deg / R2D);
    const nx = 0.039223 * (1 - es_v) * sin_ey * cos_ey;
    const nz = -0.039223 * (cos_ey * cos_ey + es_v * sin_ey * sin_ey);
    return Math.atan2(nz, nx) * R2D;
}
// 生成「保留通用计算式」版 program 文本
//   angSubst：写进 v.angle 的夹角值（旗帜需按所选 θ 换算，见 ptApplyKeepExpr）
//   d      ：求解出的 yrot 相对「预设表达式自身算出的 yrot」的增量（追加到表达式末尾）
function ptPresetExprText(isFlag, len1, len2, angSubst, cx, cz, d) {
    const tpl = presetTemplates[isFlag ? 3 : 1];
    let text = ptPresetStatements(tpl && tpl.command);
    if (!text) return '';
    // 旗帜预设 index3 先 side_b 后 side_a、方块预设 index1 先 side_a 后 side_b，两处都替，顺序无关
    text = ptSubstVar(text, 'side_a', len1);
    text = ptSubstVar(text, 'side_b', len2);
    text = ptSubstVar(text, 'angle', angSubst);
    text = ptSubstVar(text, 'xpos', cx);
    text = ptSubstVar(text, 'zpos', cz);
    if (Math.abs(d) > 1e-9) {
        // 增量追加在 yrot 表达式末尾（正数用 +、负数用 -，保证生成式始终可读可解析）
        const ds = (d > 0 ? ' + ' : ' - ') + ptFmtNum(Math.abs(d));
        text = text.replace(/v\.yrot\s*=\s*([^;]*);/, (m, rhs) => 'v.yrot=' + String(rhs).trim() + ds + ';');
    }
    return text;
}
// 给已构造好的方块套上该程序（返回是否套上）：molangMode 接管 + 立即按程序刷新几何
function ptApplyKeepExpr(block, isFlag, solved, cx, cz) {
    if (!ptKeepExpr || !block || !solved) return false;
    const p = solved.p;
    let presetYrot, angSubst;
    if (isFlag) {
        // ★夹角换算：ptComputeFlagM 直接吃 θ（sin/cos(θ)），而预设 index3 内部取的是
        //   sin/cos(v.angle−180) ⇒ 两者要产出同一几何必须 v.angle = θ + 180
        //   （d 再按 zrot/xrot/es/scale 之外的朝向差补齐）。θ 取求解器实际选中的那个候选。
        const theta = (p && p.theta != null) ? p.theta : solved.ang;
        angSubst = theta + 180;
        presetYrot = ptFlagPresetYrot(solved.len2, solved.len1, theta);
    } else {
        angSubst = solved.ang;
        presetYrot = (p && p.yrot != null) ? p.yrot : 0;
    }
    const d = _ptNormDeg(solved.yrot - presetYrot);
    const text = ptPresetExprText(isFlag, solved.len1, solved.len2, angSubst, cx, cz, d);
    if (!text) return false;
    block.scope.program = text;
    block.scope.molangMode = true;
    block.scope.molangEditedByUser = false;
    try { block.refresh(); } catch (e) {}
    return true;
}

// 求 (A,B,C) 三点平行四边形的摆放：返回 { p, yrot, err }，使两条边分别对准 A→B / A→C
// 两种边序都试，覆盖手性（镜像）——求解器只用 cos(夹角)，天然丢失折向符号。
// ★poleOnFirstEdge（仅旗帜传 true）：旗杆在旗帜模型的【局部 Z】上，「局部 Z ↔ 第 1 条边」
//   的候选才是用户要的（旗杆落在 apex→第 1 个选中的点 那条边）⇒ 选点顺序决定旗杆所在边。
//   两个 fwd 候选（旗杆在第 1 边 / 第 3 边）的 err 常只差 round6 噪声（实测 0.005~0.030°），
//   纯比 err 等于抛硬币，故 err 相差在 PT_ERR_TIE 以内视为打平、改按旗杆边决胜；
//   差得明显时仍听几何。★旗帜候选的 err 还需先做「反平行归一化」（见下方 errEff）。
//   （普通方块无旗杆，不传该参数，排序行为与从前完全一致。）
const PT_ERR_TIE = 1;   // 度：round6 噪声 ≤0.03°，真正的错配候选 err ≥ 2·|夹角|，取 1° 稳稳隔开
function ptSolveParaPlacement(A, B, C, shapeBuilder, poleOnFirstEdge) {
    const R2D = 180 / Math.PI;
    const cands = [];
    for (const [Q, R] of [[B, C], [C, B]]) {
        const e1x = Q.x - A.x, e1z = Q.z - A.z;
        const e2x = R.x - A.x, e2z = R.z - A.z;
        const len1 = Math.hypot(e1x, e1z), len2 = Math.hypot(e2x, e2z);
        // ★★两个阈值都必须【与图形尺度无关】（09-29 修「小三角形生成错位」）：
        //   ① 退化边判据：原写死 0.01（米）——边长 < 1cm 的图形一律被当成「两点重合」拒绝
        //      （实测把同一三角形缩到 0.1× 时，三块一块也生不出来）。改用 1e-6（1 微米）：
        //      仍在 double 精度之上，且 round6(scale) 在 scale≥1e-6 时不会把 scale 归零。
        //   ② lenOk（把「求解器重建出的两轴长度 lx/lz」与「两条输入边 len1/len2」配对）：
        //      原式 |a−b| < max(0.02, b·2%) 里的【0.02 绝对下限】在图形尺度 ≲1 米时彻底
        //      失去分辨力 ⇒ 「局部 X/Z 与两条输入边掉个儿」的错配候选也被放行：
        //        · 同一三角形，边长 0.056/0.091（差 0.035 > 0.02）⇒ 错配被挡，正确；
        //        · 缩到一半，边长差 0.017 < 0.02 ⇒ 错配放行，且它与正确解的 err 恰好
        //          并列 0.000000（镜像解），Array.sort 稳定排序取先入的错配 ⇒ 板子把
        //          「长边摆在短边方向」上 ⇒ 四角整体偏移 |len1−len2|（实测 0.016583）。
        //      改纯相对判据后：正确解 |a−b|≈0（只剩 round6 噪声），错配 |a−b|=|len1−len2|
        //      ⇒ 仅当 len1≈len2（长短边等价、两种摆法几何无差别）时才可能同时成立。
        //      ★别再给这个判据加任何绝对下限 —— 那正是本 bug 的来源。
        if (len1 < 1e-6 || len2 < 1e-6) continue;
        const ht1 = Math.atan2(e1z, e1x) * R2D, ht2 = Math.atan2(e2z, e2x) * R2D;
        const ang = Math.atan2(e1x * e2z - e1z * e2x, e1x * e2x + e1z * e2z) * R2D;
        const p = (shapeBuilder ? shapeBuilder(len1, len2, ang) : generatePlaneParams(len1, len2, ang));
        // ★兜底护栏（非机制）：extend_scale 若为负是镜像解，会把旗杆翻到旗布上方可见。
        //   ptFlagShapeParams 已保证 es 恒为正（ptComputeFlagM 的 es = √QK/X2 ≥ 0），
        //   这里只作为硬护栏保留；★真正的选边机制在 ptFlagShapeParams 的手性选择 + 下方 errEff。
        if (poleOnFirstEdge && p.extend_scale < 0) continue;
        const { ex, ez } = ptPlaneAxesWorld(p);
        const lx = Math.hypot(ex.x, ex.z), lz = Math.hypot(ez.x, ez.z);
        const hx = Math.atan2(ex.z, ex.x) * R2D, hz = Math.atan2(ez.z, ez.x) * R2D;
        // ★真实世界边长 = unit 轴长 × 模型该轴边长（旗帜旗布 1.0×2.0；矩形/平行四边形为 1×1）
        const meX = (p.modelEdgeX != null) ? p.modelEdgeX : 1;
        const meZ = (p.modelEdgeZ != null) ? p.modelEdgeZ : 1;
        const wx = lx * meX, wz = lz * meZ;
        const lenOk = (a, b) => Math.abs(a - b) < Math.max(b * 0.02, 1e-6);   // b·2% + 1e-6 抖动的纯相对判据
        // 期望映射：局部 Z ↔ 第 1 条边(ht1)、局部 X ↔ 第 2 条边(ht2)
        if (lenOk(wz, len1) && lenOk(wx, len2)) {
            const d = _ptNormDeg(ht1 - hz);
            cands.push({ p, yrot: _ptNormDeg(p.yrot + d), err: Math.abs(_ptNormDeg(hx + d - ht2)), poleFirst: Q === B, len1, len2, ang });
        }
        // 反向映射：局部 X ↔ 第 1 条边、局部 Z ↔ 第 2 条边
        if (lenOk(wx, len1) && lenOk(wz, len2)) {
            const d = _ptNormDeg(ht1 - hx);
            cands.push({ p, yrot: _ptNormDeg(p.yrot + d), err: Math.abs(_ptNormDeg(hz + d - ht2)), poleFirst: Q !== B, len1, len2, ang });
        }
    }
    if (!cands.length) return null;
    // ★旗帜：把「反平行」的 err(≈180) 归一化为 0 —— 平行四边形的两组邻边同向/反向等价
    //   （四角只差一个平移，实测角点集合差 0.0012）。ptFlagShapeParams 为 ang<0 选出的手性
    //   正是靠这一点成立的（见其注释 ②）。普通方块不传 poleOnFirstEdge ⇒ 维持原判据不变。
    if (poleOnFirstEdge) for (const c of cands) c.errEff = Math.min(c.err, Math.abs(180 - c.err));
    cands.sort((a, b) => {
        const ea = poleOnFirstEdge ? a.errEff : a.err, eb = poleOnFirstEdge ? b.errEff : b.err;
        if (Math.abs(ea - eb) > PT_ERR_TIE) return ea - eb;   // 几何差得明显 → 听几何
        if (poleOnFirstEdge && a.poleFirst !== b.poleFirst) return a.poleFirst ? -1 : 1;   // 打平 → 旗杆在第 1 边优先
        return ea - eb;
    });
    // ★同时回传所选候选的「两条边长 + 夹角」：供「保留通用计算式」把预设的
    //   side_a / side_b / angle 三个形状参数原样代入（该候选的 p 正是用这组值构造的）。
    return { p: cands[0].p, yrot: cands[0].yrot, err: cands[0].err, len1: cands[0].len1, len2: cands[0].len2, ang: cands[0].ang };
}

// 三点平行四边形：以【第 2 个选中的点】为公共顶角(apex)，邻边 = 顶角→第1点 / 顶角→第3点。
//   用户点击顺序的直觉：先点一条边的一端 → 再点顶角 → 最后点另一条边的一端（「两边一角」）。
//   四角 = apex、e1、e2、e1+e2−apex；形心 = (e1+e2)/2（与选谁当顶点无关）。
//   ★注意 ptSolveParaPlacement(A,B,C) 内部以 A 为顶角、A→B / A→C 为两条边，故 apex 传第一个参数。
//   ★三块共面（不再有 yBase 错层参数）：生成物的 y 恒 = 0，与矩形/平行四边形完全一致，
//    整座三角形严丝合缝落在 XZ 平面上（原因见上方「三角形三块必须严格共面」注释）。
function ptMakeParaBlock(apex, e1, e2, isFlag) {
    // ★方块/旗帜切换：同一平行四边形，用旗帜模型（含旗杆）落成
    if (isFlag) return ptMakeFlagBlock(apex, e1, e2);
    const solved = ptSolveParaPlacement(apex, e1, e2);
    if (!solved) { showToast('❌ 有两点重合，无法生成平行四边形'); return null; }
    const p = solved.p;
    const center = new THREE.Vector3((e1.x + e2.x) / 2, 0, (e1.z + e2.z) / 2);
    let blockId = 'Plane', _pi = 1;
    while (blocks.some(bb => bb.id === blockId)) blockId = 'Plane' + (_pi++);
    const M = [
        center.x, 0, center.z,                  // ★ y 恒 0：三块共面（错层已废除，见上）
        p.xrot, solved.yrot, p.zrot,
        p.scale, p.extend_scale,                // 厚度口径与对话框/预设完全一致（0.0001 归一）
        p.extend_xrot, p.extend_yrot,
        0, 0, 0
    ];
    const blk = new Block(blockId, M, null, '#aaccff', 'cube', null, null);
    ptApplyKeepExpr(blk, false, solved, center.x, center.z);   // 开启「保留通用计算式」时改写为预设完整表达式
    return blk;
}

/* ---- 旗帜生成原语（方块/旗帜切换时复用） ---------------------------------------
   与 ptMakeParaBlock 同源：同一个 ptSolveParaPlacement 摆放求解（传入旗帜形状构造器
   ptFlagShapeParams）算出旗布两对边对准 apex→e1 / apex→e2；再把旗帜模型（含旗杆）按该姿态
   放置，旗布中心对齐平行四边形形心。basepos 为旗帜模型常量（见 ptComputeFlagM），使旗布
   中心落在 transform 原点，故 position 直接设形心即可。
   ★由 ptMakeRectBlock / ptMakeParaBlock / ptGenerateTriangle 在 ptBlockIsFlag=true 时调用：
     矩形(直角平行四边形) / 平行四边形 / 三角形的三个子平行四边形 → 一律落成旗帜。 */
function ptMakeFlagBlock(apex, e1, e2) {
    // ★第 5 参 true：旗杆必须落在 apex→e1（第 1 个选中的点）那条边上，
    //   不随「第 1/第 3 点互换」而漂到另一条边（见 ptSolveParaPlacement 的 poleOnFirstEdge）。
    const solved = ptSolveParaPlacement(apex, e1, e2, ptFlagShapeParams, true);
    if (!solved) { showToast('❌ 有两点重合，无法生成旗帜'); return null; }
    const p = solved.p;
    const center = new THREE.Vector3((e1.x + e2.x) / 2, 0, (e1.z + e2.z) / 2);
    let blockId = 'Flag', _pi = 1;
    while (blocks.some(bb => bb.id === blockId)) blockId = 'Flag' + (_pi++);
    // ★es 恒非负（ptFlagShapeParams 的手性改用 θ/θ+180 二选一实现，不再借道负 es）
    //   ⇒ 旗杆稳定停在旗布下方（模型局部 +Y 映射到世界 −Y），不会被翻上来、也无镜像副作用，
    //   故此处不需要任何旋转/取反补偿。
    const M = [
        center.x, 0, center.z,
        p.xrot, solved.yrot, p.zrot,
        p.scale, p.extend_scale,
        p.extend_xrot, p.extend_yrot,
        -0.178621, -0.146515, 0.658218   // 旗帜模型 basepos 常量（令旗布中心对齐 transform 原点）
    ];
    const blk = new Block(blockId, M, null, '#dddddd', 'flag', null);
    ptApplyKeepExpr(blk, true, solved, center.x, center.z);   // 开启「保留通用计算式」时改写为旗帜预设完整表达式
    return blk;
}

/* ---- 三角形生成：由【三个平行四边形】拼成 ------------------------------------
   取三边中点 M_ab=(A+B)/2、M_bc=(B+C)/2、M_ca=(C+A)/2，以每个顶点 + 它的两条
   邻边中点为一个平行四边形（第 4 角自动 = 两条邻边中点之和 − 顶点 = 对边中点）：
     顶点 A → (A, M_ab, M_ca)，第 4 角 = M_bc
     顶点 B → (B, M_ab, M_bc)，第 4 角 = M_ca
     顶点 C → (C, M_bc, M_ca)，第 4 角 = M_ab
   这三块的并集【正好】覆盖三角形 ABC：三条边各由两块各占一半首尾相接，
   内部只在中心的中位三角形(M_ab,M_bc,M_ca)处三块重叠。三块【严格共面】(y=0) ——
   同色同面重叠不会 z-fighting（原因见上方「三角形三块必须严格共面」注释），
   整座三角形因此严丝合缝落在 XZ 平面上，与矩形/平行四边形同一水平。
   复用 ptMakeParaBlock ⇒ 与「两点矩形/三点平行四边形」同一套求解与厚度口径。 */
function ptGenerateTriangle(A, B, C, isFlag) {
    const mid = (u, v) => ({ x: (u.x + v.x) / 2, z: (u.z + v.z) / 2 });
    const Mab = mid(A, B), Mbc = mid(B, C), Mca = mid(C, A);
    const parts = [[A, Mab, Mca], [B, Mab, Mbc], [C, Mbc, Mca]];
    const made = [];
    parts.forEach(([v, m1, m2]) => {
        // ★逐个 addBlock：ptMakeParaBlock 靠 blocks 生成唯一 id（Plane/Plane1/Plane2），
        //   若先建三块再一起加，会三块同名。
        const blk = ptMakeParaBlock(v, m1, m2, isFlag);   // ★不传 yBase：三块共面于 y=0
        if (blk) { addBlock(blk, true, false); made.push(blk); }
    });
    if (!made.length) return;
    // 三块作为整体选中，便于立刻移动/删除整座三角形
    made.forEach(b => selectedBlocksSet.add(b));
    selectBlock(made[made.length - 1]);
    // 生成后清空点的选中态（数组 + 标记上的「●」视觉）
    ptSelection = [];
    ptVertexSelection = [];    // 角点选区同样清空，否则绿点会一直亮着
    ptSelOrder = [];
    ptClearRectSidePreview();
    ptRefreshMarkerLabels();
    ptSyncPanel();
    showToast('✅ 已生成' + (isFlag ? '旗帜' : '') + '三角形（' + made.length + ' 个' + (isFlag ? '旗帜' : '平行四边形') + '）');
}

function ptGenerate() {
    const pts = ptSelectedPoints();
    const need = ptShapeNeed();
    if (pts.length < need) { showToast('❌ 请先选择 ' + need + ' 个点'); return; }
    // ★旗帜不是第 4 种形状：ptBlockIsFlag 决定「同一组形状（矩形/平行四边形/三角形）用旗帜还是方块生成」
    if (ptMode === 'tri3') { ptGenerateTriangle(pts[0], pts[1], pts[2], ptBlockIsFlag); return; }
    let block = null;
    if (ptMode === 'rect2') block = ptMakeRectBlock(pts[0], pts[1], ptBlockIsFlag);
    else block = ptMakeParaBlock(pts[1], pts[0], pts[2], ptBlockIsFlag);   // ★顶角 = 第 2 个选中的点 pts[1]
    if (!block) return;
    addBlock(block, true, true);
    selectBlock(block);
    // 生成后清空点的选中态（数组 + 标记上的「●」视觉），否则点看起来仍处于选中状态
    ptSelection = [];
    ptVertexSelection = [];    // 角点选区同样清空，否则绿点会一直亮着
    ptSelOrder = [];
    ptClearRectSidePreview();
    ptRefreshMarkerLabels();
    ptSyncPanel();
    showToast('✅ 已生成' + (ptBlockIsFlag ? '旗帜 ' : '方块 ') + block.id);
}

/* =====================================================================================
   OBJ 模型导入 —— 三维平行四边形解算核 + 解析 + 分面生成
   -------------------------------------------------------------------------------------
   路线（详见 _OBJ导入_研究与计划.md，已用真模型逐面验证：26 块、覆盖性 0 失败）：
     · 形状解直接复用 generatePlaneParams(a, b, ang)（吃两条边长 + 夹角，与维度无关）
     · 姿态解用「闭式欧拉反解」：引擎局部旋转段 R = Ry(-yrot)·Rx(xrot)·Rz(-zrot) ⇒
         xrot = asin(-R₂₃)   yrot = -atan2(R₁₃, R₃₃)   zrot = -atan2(R₂₁, R₂₂)
       ★必须取 R 的三【行】（踩坑记录：取列会让部分面误差飙到 10° 量级）
     · 姿态构造 Q = T·F⁻¹（F=平铺姿态基、T=目标基），det(Q)<0 是镜像 → 直接剔除；
       两种边序 × 两法向 = 4 候选，其中 det>0 的为合法解
     · 朝向不能靠角点误差选（薄片关于自身中面对称，镜像前后角点完全相同）——
       改为【实测】薄片局部 +Y（烘焙最亮那面）的世界指向，令其朝向面外法向 outwardN
     · 分面决策树：精确平行四边形 → 1 块；平面梯形 → 内接平行四边形 + 余量三角 = 4 块；
       其余（含非平面四边面 / n-gon）→ 三角化，每三角 3 块（顶点 + 两条邻边中点）
   ===================================================================================== */

const OBJ_R2D = 180 / Math.PI, OBJ_D2R = Math.PI / 180;
const objV = (x, y, z) => new THREE.Vector3(x, y, z);
const objSub = (a, b) => a.clone().sub(b);
const objCross = (a, b) => new THREE.Vector3().crossVectors(a, b);
const objNrm = a => { const l = a.length(); return l > 1e-12 ? a.clone().multiplyScalar(1 / l) : objV(0, 0, 0); };

/* 与引擎矩阵链【完全一致】的旋转段：R = Ry(-yrot)·Rx(xrot)·Rz(-zrot) */
function objRotMatrix(xr, yr, zr) {
    return new THREE.Matrix4().makeRotationY(OBJ_D2R * (-yr))
        .multiply(new THREE.Matrix4().makeRotationX(OBJ_D2R * xr))
        .multiply(new THREE.Matrix4().makeRotationZ(OBJ_D2R * (-zr)));
}

/* 引擎矩阵 → 单位立方体 8 角 → 去重得薄片 4 个真实角（厚度 ~1e-4 会自动合并） */
function objSlabCorners(M) {
    const mat = computeTransformMatrix(M, 0, 0, 0);
    const out = [];
    for (let i = 0; i < 8; i++) {
        const p = objV(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5).applyMatrix4(mat);
        if (!out.some(q => q.distanceTo(p) < 1e-3)) out.push(p);
    }
    return out;
}

/* 实测局部某轴（如 +Y）在世界中的方向：引擎矩阵真值 */
function objLocalAxisWorld(M, ax) {
    const mat = computeTransformMatrix(M, 0, 0, 0);
    const o = objV(0, 0, 0).applyMatrix4(mat);
    const p = ax.clone().applyMatrix4(mat);
    return objNrm(p.sub(o));
}

/* 闭式反解：R = Ry(θy)·Rx(θx)·Rz(θz)（θy=-yrot、θz=-zrot）取 R 的三【行】 */
function objExtractEuler(R) {
    const e = R.elements;                       // column-major
    const A = objV(e[0], e[4], e[8]);           // row1
    const B = objV(e[1], e[5], e[9]);           // row2
    const C = objV(e[2], e[6], e[10]);          // row3
    const cl = x => Math.max(-1, Math.min(1, x));
    const cz = cl(-B.z);                        // = sin(xrot)
    const ca = Math.sqrt(Math.max(0, 1 - cz * cz));   // |cos(xrot)|
    if (ca > 1e-6) {
        return {
            xrot: Math.asin(cz) * OBJ_R2D,
            yrot: -Math.atan2(A.z, C.z) * OBJ_R2D,
            zrot: -Math.atan2(B.x, B.y) * OBJ_R2D
        };
    }
    // ★★万向锁（xrot ≈ ±90°）：Ry 与 Rz 退化成只含 (yrot∓zrot) 一个自由度。
    //   旧实现在此走通用公式 → atan2(0,0)=0，等于把该自由度整个丢掉 ⇒ 重建出的朝向
    //   与 R 差 O(0.7)（实测往返差 7.07e-1）⇒ 薄片既错位又「暗面朝外」。
    //   修法：取 zrot=0，把自由度全部交给 yrot（α=+90 → row1=(cos yrot, −sin yrot, 0)；
    //   α=−90 → row1=(cos yrot, +sin yrot, 0)），可精确还原 R。
    return {
        xrot: Math.asin(cz) * OBJ_R2D,
        yrot: (cz > 0 ? Math.atan2(-A.y, A.x) : Math.atan2(A.y, A.x)) * OBJ_R2D,
        zrot: 0
    };
}

/* 两组 4 点（顺序无关）按形心对齐后的最近邻最大距离 */
function objSetErr(A, B) {
    const ca = A.reduce((s, p) => s.add(p), objV(0, 0, 0)).multiplyScalar(1 / A.length);
    const cb = B.reduce((s, p) => s.add(p), objV(0, 0, 0)).multiplyScalar(1 / B.length);
    let worst = 0;
    for (const p of A) {
        let m = Infinity;
        for (const q of B) m = Math.min(m, objSub(p, ca).distanceTo(objSub(q, cb)));
        worst = Math.max(worst, m);
    }
    return worst;
}

/* 三维解算：目标平行四边形（顶点 apex，两条边向量 e1/e2，面外法向 outwardN）→ 方块参数 M
   返回 { M, err, face } 或 null。M 平移段为 0，调用方再叠加形心。
   ★枚举「输入边序」×「局部轴映射」×「目标法向符号」：
     只换 target 方向（swap）会得到「边长相配错位」的坏候选；而把输入两条边对调（ord）
     会得到同一平行四边形、法向相反的【正确】候选 —— 朝向正是靠这一路修好的
     （若只靠 swap 硬凑朝向，会选中几何错位的碎片 → 实测梯形面碎块明显偏位）。 */
function ptSolvePara3D(apex, e1, e2, outwardN, wantOut) {
    if (e1.length() < 1e-6 || e2.length() < 1e-6) return null;
    const want = (wantOut === false) ? -1 : 1;   // 期望亮面（局部 +Y 面）朝外 / 朝内
    let best = null;
    // ★评分：几何误差差得明显时【几何优先】，朝向只在几何等价（|Δerr| ≤ 1e-3）时做决胜。
    //   原实现是「朝向绝对优先」，在矩形/近平行四边形基元下会出致命问题：
    //   该族薄片的局部 +Y（压缩轴）会退化到【面内】，face = aY·n 变成 ±2e-4 级噪声，
    //   于是用一个噪声值压掉了角点误差小 6 个数量级的正确解 ⇒ 模型缺面/破洞。
    const ERR_TIE = 1e-3;
    const better = (A, B) => {
        if (Math.abs(A.err - B.err) > ERR_TIE) return A.err < B.err;   // 几何差得明显 → 听几何
        const fa = A.face > 0 ? 1 : 0, fb = B.face > 0 ? 1 : 0;
        if (fa !== fb) return fa > fb;                                 // 几何等价 → 朝向决胜
        return A.err < B.err;
    };
    for (const ord of [false, true]) {
        const f1 = ord ? e2 : e1, f2 = ord ? e1 : e2;
        const a = f1.length(), b = f2.length();
        if (a < 1e-6 || b < 1e-6) continue;
        const angDeg = Math.atan2(objCross(f1, f2).length(), f1.dot(f2)) * OBJ_R2D;
        const sp = generatePlaneParams(a, b, angDeg);
        if (!sp || !isFinite(sp.scale) || !isFinite(sp.extend_scale)) continue;
        const axes = ptPlaneAxesWorld(sp);
        const x0 = objNrm(axes.ex), z0 = objNrm(axes.ez), n0 = objNrm(objCross(z0, x0));
        const Rflat = objRotMatrix(sp.xrot, sp.yrot, sp.zrot);
        const u1 = objNrm(f1), u2 = objNrm(f2), nT = objNrm(objCross(f1, f2));
        const target = [objV(0, 0, 0), f1.clone(), f2.clone(), f1.clone().add(f2)];
        for (const swap of [false, true]) {
            for (const sg of [1, -1]) {
                const tz = swap ? u2 : u1, tx = swap ? u1 : u2;
                const tn = nT.clone().multiplyScalar(sg);
                const F = new THREE.Matrix4().makeBasis(z0, x0, n0);   // 平铺姿态：局部 Z/X/法向
                const T = new THREE.Matrix4().makeBasis(tz, tx, tn);   // 目标姿态
                const Q = T.multiply(F.clone().invert());
                if (Q.determinant() < 0) continue;                     // 反射不可由旋转实现 → 剔除镜像解
                const R = Q.multiply(Rflat);
                const trip = objExtractEuler(R);
                if (!isFinite(trip.xrot) || !isFinite(trip.yrot) || !isFinite(trip.zrot)) continue;
                const M = [0, 0, 0, trip.xrot, trip.yrot, trip.zrot, sp.scale, sp.extend_scale, sp.extend_xrot, sp.extend_yrot, 0, 0, 0];
                const c = objSlabCorners(M);
                if (c.length !== 4) continue;
                const err = objSetErr(c, target);
                // ★薄片朝向 = 局部 **+Y 面的共法向** · 期望方向。
                //   立方体 +Y 面的 CCW 边序是 (Z, X) ⇒ 该面法向 ∝ A·Z × A·X（不是 A·Y！）。
                //   旧实现用 `objLocalAxisWorld(M,+Y)`：夹角 90° 的矩形基元下两次 es 压缩方向重合、
                //   映射降秩为 2，局部 Y 会退化到**面内** ⇒ 该值只可能 ±0.707/±2e-4（永远到不了 ±1），
                //   评分于是拿噪声压掉误差小 6 个数量级的正确解 ⇒ 模型缺面。
                //   改用共法向后，退化平面同样给出干净的 ±1，可统一使用（无需再特判 objSlabIsFlat）。
                const nYface = objNrm(objCross(objLocalAxisWorld(M, objV(0, 0, 1)), objLocalAxisWorld(M, objV(1, 0, 0))));
                const face = outwardN ? nYface.dot(outwardN) * want : 0;
                const cand = { M, err, face };
                if (!best || better(cand, best)) best = cand;
            }
        }
    }
    return best;
}

/* 唯一 id 的方块工厂（OBJ 导入用 'Obj' 前缀，便于与画笔生成的 'Plane*' 区分） */
/* OBJ 导入专用数值净化：把 M 各分量收敛到 6 位小数。
   —— 三维解算会产出 -9.354676251637585e-19 这类浮点噪声，直接 toString() 会写进
      变量表达式（用户可见、非常丑，用户 2026-10-09 反馈「不用这么高精度」）。
   6 位小数的非零下限是 1e-6，正好避开 JS 科学计数法阈值（< 1e-6 才用 e 记法），
   且远小于几何容差 1e-4，不影响导入精度。 */
function objRoundM(v) {
    const n = Math.round(Number(v) * 1e6) / 1e6;
    return n === 0 ? 0 : n;          // 归一 -0 → 0
}
/* ★【2026-10-24 性能】OBJ 方块 id 用单调计数器生成。
   旧实现 `blocks.some(bb => bb.id === blockId)` 每块都扫全表 ⇒ O(n²)：
   2940 块时实测在这一行烧掉 4.4 秒（导入总耗时 8.8 秒的一半）。 */
let _objBlockSeq = 0;
let _objIdLookup = null;      // 本批导入的 id 集合（objCommitPlan 开始时重建）
function objMakeBlockFromM(M) {
    if (!blocks.length) _objBlockSeq = 0;                 // 空场景重新导入：命名从 Obj 起（与旧行为一致）
    if (!_objIdLookup) _objIdLookup = new Set(blocks.map(b => b.id));
    let blockId = 'Obj' + (_objBlockSeq || '');
    while (_objIdLookup.has(blockId)) { _objBlockSeq++; blockId = 'Obj' + _objBlockSeq; }
    _objBlockSeq++;
    _objIdLookup.add(blockId);
    return new Block(blockId, M.map(objRoundM), null, '#aaccff', 'cube', null, null);
}

/* 一个「待生成平行四边形」→ 已解算的 M 数组（含形心位置）；失败返回 null
   wantOut：期望亮面（局部 +Y 面）朝外（默认 true）/ 朝内（false，导入面板「法线朝向」拨片） */
function objSolvePart(part, wantOut) {
    const r = ptSolvePara3D(part.apex, part.e1, part.e2, part.n, wantOut);
    if (!r) return null;
    const c = part.apex.clone().add(part.e1.clone().add(part.e2).multiplyScalar(0.5));
    const M = r.M.slice();
    M[0] = c.x; M[1] = c.y; M[2] = c.z;
    return M;
}

/* 三维平行四边形 → Block（位置 = 形心 = apex + (e1+e2)/2，与 ptMakeParaBlock 同口径） */
function ptMakeParaBlock3D(apex, e1, e2, outwardN) {
    const r = ptSolvePara3D(apex, e1, e2, outwardN);
    if (!r) return null;
    const c = apex.clone().add(e1.clone().add(e2).multiplyScalar(0.5));
    const M = r.M.slice();
    M[0] = c.x; M[1] = c.y; M[2] = c.z;
    return objMakeBlockFromM(M);
}

/* ---------------- OBJ 解析 ---------------- */
function objParse(text) {
    const verts = [], faces = [];
    const lines = String(text).split(/\r?\n/);
    for (let li = 0; li < lines.length; li++) {
        const s = lines[li].trim();
        if (!s || s[0] === '#') continue;
        const t = s.split(/\s+/);
        if (t[0] === 'v') {
            const x = +t[1], y = +t[2], z = +t[3];
            if (isFinite(x) && isFinite(y) && isFinite(z)) verts.push(objV(x, y, z));
        } else if (t[0] === 'f') {
            const vs = [];
            for (let i = 1; i < t.length; i++) {
                const raw = t[i];
                if (!raw) continue;
                const vi = parseInt(raw.split('/')[0], 10);
                if (!isFinite(vi) || vi === 0) continue;
                const k = vi > 0 ? vi - 1 : verts.length + vi;    // 支持负索引（相对末尾）
                if (k < 0 || k >= verts.length) continue;
                vs.push(verts[k].clone());
            }
            if (vs.length >= 3) faces.push({ v: vs });
        }
    }
    return { verts, faces };
}

/* Newell 法求多边形法向（对非平面多边形也稳健；OBJ 逆时针绕序 ⇒ 指向外侧） */
function objFaceNormal(v) {
    const n = objV(0, 0, 0);
    for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length];
        n.x += (a.y - b.y) * (a.z + b.z);
        n.y += (a.z - b.z) * (a.x + b.x);
        n.z += (a.x - b.x) * (a.y + b.y);
    }
    return objNrm(n);
}

function objIsPlanar(v, tol) {
    if (v.length <= 3) return true;
    const n = objNrm(objCross(objSub(v[1], v[0]), objSub(v[2], v[0])));
    if (n.lengthSq() < 1e-18) return true;
    const s = Math.max.apply(null, v.map(p => objSub(p, v[0]).length()).concat([1e-9]));
    return v.every(p => Math.abs(objSub(p, v[0]).dot(n)) <= tol * s);
}
function objParaErr(v) {   // 四边面：p0+p2 与 p1+p3 之差（相对）
    const s1 = v[0].clone().add(v[2]), s2 = v[1].clone().add(v[3]);
    const sc = Math.max(objSub(v[1], v[0]).length(), objSub(v[2], v[1]).length(), 1e-9);
    return s1.distanceTo(s2) / sc;
}

/* 三角 → 3 个平行四边形（顶点 + 两条邻边中点；并集【恰好】覆盖三角形）
   ★朝向用【该三角形自身】的法向（非平面四边面拆出的两个子三角面法向可能差很多，
     用整面的 Newell 法向会让子片贴错亮面）

   ★关于「中点三角形三重覆盖」——这是本拆法的固有性质，不是 bug：
     三角形 ABC 的三条边中点 M_ab/M_bc/M_ca 构成的「中点三角形」面积为 T/4。
     - 以 A 为顶点的那片 = 角三角 A-M_ab-M_ca ∪ 中点三角形，面积 T/2；
     - B、C 同理，三片各 T/2、合计 3T/2 ⇒ 三片在中点三角形上【三重共面重叠】。
     实测：采样 220² 网格，空洞样本 0、最大覆盖重数 3、面积比恰 1.5（见 `_tri_tile_check.cjs`）。
     为什么无害：三片完全共面、法向相同、材质相同 ⇒ 渲染结果与「无重叠」逐像素等价
     （唯一能看出差别的方式是强行给每片不同颜色，那时才会显出 z-fighting）。
     且体素/mcstructure 导出是「写入同色同位置」⇒ 幂等，不会变稠。
     排除了其它可能：3 片无重叠铺满三角形在数学上不存在
     （角计数：360·n_i + 180·n_b + 180 = 3×360 ⇒ 2n_i + n_b = 5，且各顶点约束矛盾），
     2 片铺满同样不存在 ⇒ 只能沿用此经典拆法。 */
function objTriangleParts(A, B, C, N) {
    const mid = (u, w) => u.clone().add(w).multiplyScalar(0.5);
    const Mab = mid(A, B), Mbc = mid(B, C), Mca = mid(C, A);
    const Nt = objFaceNormal([A, B, C]);
    const NN = (Nt.lengthSq() > 1e-18) ? Nt : N;
    return [
        { apex: A, e1: objSub(Mab, A), e2: objSub(Mca, A), n: NN },
        { apex: B, e1: objSub(Mab, B), e2: objSub(Mbc, B), n: NN },
        { apex: C, e1: objSub(Mbc, C), e2: objSub(Mca, C), n: NN }
    ];
}

/* ---- 面内 2D 辅助（坐标系 (û, n̂)）：凸多边形包含 / 平行四边形包含 ---- */
function objConv2DHas(p, poly, eps) {
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < -eps) return false;
    }
    return true;
}
function objPara2DHas(p, P, eps) {
    const px = p[0] - P.ax, py = p[1] - P.ay;
    const det = P.e1x * P.e2y - P.e1y * P.e2x;
    if (Math.abs(det) < 1e-15) return false;
    const al = (px * P.e2y - py * P.e2x) / det;
    const be = (P.e1x * py - P.e1y * px) / det;
    return al >= -eps && al <= 1 + eps && be >= -eps && be <= 1 + eps;
}

/* 平面梯形（一对对边平行）→ 2 / 3 片平行四边形（严格贴合：每片都落在梯形内，并集恰为梯形）
   ── 构造（用户给的思路：两个「交叉」的平行四边形 + 补片）─────────────────────────
   记长底 A→B（长 a）、短底 D→C（长 b ≤ a）；û = unit(AB)，n̂ = 面内 ⊥û 且指向短底，
   h = 两底间距，du = (D−A)·û。取
     P1 = {A, A+b·û, C, D}       把「短底长度」平移到长底左端（贴腰 AD）
     P2 = {D, C, B, A+(a−b)·û}   把「短底长度」平移到长底右端（贴腰 BC）
   两片各自贴住一条腰、并沿另一条腰的方向交叉（重叠），并集恰好覆盖整个梯形：
     · a ≤ 2b ：两片已相交 ⇒ 2 片
     · a > 2b ：中间残留一个三角形空隙（底边落在长底 [b, a−b] 上、顶点朝短底）⇒ 补 1 片 = 3 片
   补片存在性（可证）：补片底边必在 AB 上（要盖住底边上的空隙），设其长为 L、高 ey ≥ y*，
   由「左腰内收 / 右腰内收」两式相减得 L ≥ a−2b 且 L ≤ a−(a−b)·ey/h，联立 ⇒ **a ≤ 4b**（必要条件）；
   而 a ≤ 4b 时下面的候选表必命中（含解析给出的 ex 区间端点）。故：
     · a ≤ 2b        → 2 片
     · 2b < a ≤ 4b   → 3 片
     · a > 4b        → 本族无解（极扁/极斜梯形），退回旧拆法
                        「内接平行四边形 + 余量三角(3)」= 4 片（与旧实现等价，不退步）
   注：与三角拆法一样，允许共面重叠（同法向同材质 ⇒ 渲染逐像素等价，导出幂等）。 */
function objTrapezoidDecomp(v, N) {
    const tol = 1e-3;
    const par = (a, b) => objCross(a, b).length() / Math.max(a.length() * b.length(), 1e-12) < tol;
    let q = null;
    for (let r = 0; r < 4; r++) {
        const w = [v[r % 4], v[(r + 1) % 4], v[(r + 2) % 4], v[(r + 3) % 4]];
        const u = objSub(w[1], w[0]);
        if (u.lengthSq() < 1e-12) continue;
        if (!par(u, objSub(w[2], w[3]))) continue;              // v0v1 ∥ v3v2 ?
        const c = objSub(w[2], w[3]).dot(u) / u.dot(u);          // v2−v3 = c·u
        if (!(c > 1e-4 && c < 1 - 1e-4)) continue;               // 短底必须严格短于长底
        q = w; break;
    }
    if (!q) return null;
    const A = q[0], B = q[1], C = q[2], D = q[3];

    // 面内正交基：û 沿长底、n̂ 指向短底（⇒ h > 0）
    const ABv = objSub(B, A);
    const a = ABv.length();
    const eU = ABv.clone().multiplyScalar(1 / Math.max(a, 1e-12));
    const dA = objSub(D, A);
    const perp = dA.clone().sub(eU.clone().multiplyScalar(dA.dot(eU)));
    const h = perp.length();
    if (h < 1e-9) return null;
    const eN = perp.clone().multiplyScalar(1 / h);
    const b = objSub(C, D).length();
    const du = dA.dot(eU);
    const vec3 = (x, y) => eU.clone().multiplyScalar(x).add(eN.clone().multiplyScalar(y));
    const pt3 = (x, y) => A.clone().add(vec3(x, y));
    const trap2 = [[0, 0], [a, 0], [du + b, h], [du, h]];        // 2D 梯形（CCW）
    const eps2 = 1e-7 * Math.max(a, h);
    const mk = P => ({ apex: pt3(P.ax, P.ay), e1: vec3(P.e1x, P.e1y), e2: vec3(P.e2x, P.e2y), n: N });
    const cs = P => [[P.ax, P.ay], [P.ax + P.e1x, P.ay + P.e1y],
                     [P.ax + P.e2x, P.ay + P.e2y], [P.ax + P.e1x + P.e2x, P.ay + P.e1y + P.e2y]];
    const fits = P => cs(P).every(c => objConv2DHas(c, trap2, eps2));

    const P1 = { ax: 0, ay: 0, e1x: b, e1y: 0, e2x: du, e2y: h };
    const P2 = { ax: du, ay: h, e1x: b, e1y: 0, e2x: a - b - du, e2y: -h };
    if (!fits(P1) || !fits(P2)) return null;                     // 理论上恒成立；数值兜底
    const out = [mk(P1), mk(P2)];
    if (a <= 2 * b + 1e-12) return out;                          // 两片已相交 ⇒ 2 片

    const ys = h * (a - 2 * b) / (a - b);                        // 空隙三角形的高
    const u2 = [b, 0], v2 = [a - b, 0], w2 = [b + du * ys / h, ys];
    const covers = P => [u2, v2, w2].every(p => objPara2DHas(p, P, 1e-9));
    const cands = [
        { ax: b, ay: 0, e1x: a - 2 * b, e1y: 0, e2x: 0, e2y: ys },               // 轴对齐矩形
        { ax: b, ay: 0, e1x: a - 2 * b, e1y: 0, e2x: du * ys / h, e2y: ys },     // ∥û × ∥腰AD
        { ax: a - b, ay: 0, e1x: -(a - 2 * b), e1y: 0, e2x: w2[0] - v2[0], e2y: w2[1] },       // ∥û × ∥腰BC
        { ax: w2[0], ay: w2[1], e1x: u2[0] - w2[0], e1y: -w2[1], e2x: v2[0] - w2[0], e2y: -w2[1] } // ∥AD × ∥BC
    ];
    if (a <= 4 * b + 1e-9) {                                     // 必要条件满足 ⇒ 解析候选网格
        const s2 = (du + b - a) / h;
        const exLo = Math.min(du * ys / h - b, du * ys / h - (a - 2 * b));
        const exHi = b + Math.min(s2 * ys, du * ys / h);
        if (exHi >= exLo - 1e-12) {
            for (let i = 0; i <= 8; i++) {
                const ex = exLo + (exHi - exLo) * i / 8;
                for (let j = 0; j <= 4; j++) {
                    const c = b * j / 4;
                    cands.push({ ax: c, ay: 0, e1x: a - b - c, e1y: 0, e2x: ex, e2y: ys });
                }
            }
        }
    }
    for (let i = 0; i < cands.length; i++) {
        const P = cands[i];
        if (!covers(P) || !fits(P)) continue;
        out.push(mk(P));
        return out;
    }
    // 补片无解 → 退回旧拆法（内接平行四边形 + 余量三角）
    const E = A.clone().add(eU.clone().multiplyScalar(a - b));
    const para = { apex: E, e1: objSub(B, E), e2: objSub(D, E), n: N };
    return [para].concat(objTriangleParts(A, E, D, N));
}

/* 凸性检查（共面多边形；N 与绕序一致 ⇒ 相邻边叉积同号）。凹面不能走梯形分解。 */
function objIsConvexPoly(v) {
    const N = objFaceNormal(v), n = v.length;
    let sign = 0;
    for (let i = 0; i < n; i++) {
        const a = v[i], b = v[(i + 1) % n], c = v[(i + 2) % n];
        const cr = objCross(objSub(b, a), objSub(c, b)).dot(N);
        if (Math.abs(cr) < 1e-12) continue;                 // 三点共线：跳过
        const s = cr > 0 ? 1 : -1;
        if (sign === 0) sign = s; else if (s !== sign) return false;
    }
    return true;
}

/* 耳切（ear clipping）：简单多边形 → 三角索引数组（索引指向入参 v）。
   ★扇形三角化只对凸多边形成立；凹多边形会有三角跑到区域外（实测凹 5 边形 24% 采样点越界、最远 0.3）。
   返回 null 表示失败（自交 / 退化 / 找不到耳），调用方回退扇形。 */
function objEarClip(v) {
    const n = v.length;
    if (n < 3) return null;
    if (n === 3) return [[0, 1, 2]];
    const N = objFaceNormal(v);
    if (N.lengthSq() < 1e-18) return null;
    let u = null;                                            // 面内基向量
    for (let i = 1; i < n && !u; i++) { const e = objSub(v[i], v[0]); if (e.lengthSq() > 1e-18) u = objNrm(e); }
    if (!u) return null;
    const w = objCross(objNrm(N), u);
    const p2 = v.map(p => { const d = objSub(p, v[0]); return [d.dot(u), d.dot(w)]; });
    const cr2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    let A = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; A += p2[i][0] * p2[j][1] - p2[j][0] * p2[i][1]; }
    if (Math.abs(A) < 1e-18) return null;
    const idx = []; for (let i = 0; i < n; i++) idx.push(i);
    if (A < 0) idx.reverse();                                // 统一成逆时针
    const inTri = (p, a, b, c) => {
        const d1 = cr2(a, b, p), d2 = cr2(b, c, p), d3 = cr2(c, a, p);
        const neg = (d1 < -1e-14) || (d2 < -1e-14) || (d3 < -1e-14);
        const pos = (d1 > 1e-14) || (d2 > 1e-14) || (d3 > 1e-14);
        return !(neg && pos);
    };
    const out = [];
    let guard = 0;
    while (idx.length > 3 && guard++ < 4 * n + 64) {
        let clipped = false;
        for (let i = 0; i < idx.length; i++) {
            const ia = idx[(i - 1 + idx.length) % idx.length];
            const ib = idx[i];
            const ic = idx[(i + 1) % idx.length];
            const a = p2[ia], b = p2[ib], c = p2[ic];
            if (cr2(a, b, c) <= 1e-14) continue;             // 凹点 / 退化 ⇒ 不是耳
            let ok = true;
            for (const o of idx) {
                if (o === ia || o === ib || o === ic) continue;
                if (inTri(p2[o], a, b, c)) { ok = false; break; }
            }
            if (!ok) continue;
            out.push([ia, ib, ic]);
            idx.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) return null;                           // 找不到耳 ⇒ 交给调用方兜底
    }
    if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
    return (out.length === n - 2) ? out : null;
}

/* 一个面 → 若干「待生成平行四边形」 */
function objFaceToParts(v) {
    const n = v.length, N = objFaceNormal(v);
    const byEar = () => {                                        // 耳切 → 三角 → 各 3 片
        const ec = objEarClip(v);
        if (!ec) return null;
        let o = [];
        ec.forEach(t => { o = o.concat(objTriangleParts(v[t[0]], v[t[1]], v[t[2]], N)); });
        return o;
    };
    if (n === 4) {
        const planar = objIsPlanar(v, 1e-5);
        if (planar && objParaErr(v) < 1e-4) {                    // 规则 1：精确平行四边形 / 矩形 → 1 块
            return [{ apex: v[0], e1: objSub(v[1], v[0]), e2: objSub(v[3], v[0]), n: N }];
        }
        if (planar && objIsConvexPoly(v)) {                      // 规则 2：平面凸梯形 → 2~3 片（凹面不适用）
            const tp = objTrapezoidDecomp(v, N);
            if (tp) return tp;
        }
        if (planar) { const e = byEar(); if (e) return e; }       // 平面凹四边形 / 非梯形凸四边形 → 耳切
        // 非平面四边面：耳切假定共面、不适用 ⇒ 按折角小的对角线三角化
        const d1 = Math.abs(objSub(v[2], v[0]).dot(objNrm(objCross(objSub(v[1], v[0]), objSub(v[3], v[0])))));
        const d2 = Math.abs(objSub(v[3], v[1]).dot(objNrm(objCross(objSub(v[2], v[1]), objSub(v[0], v[1])))));
        const tris = (d1 <= d2) ? [[0, 1, 2], [0, 2, 3]] : [[1, 2, 3], [1, 3, 0]];
        let out = [];
        tris.forEach(t => { out = out.concat(objTriangleParts(v[t[0]], v[t[1]], v[t[2]], N)); });
        return out;
    }
    if (n === 3) return objTriangleParts(v[0], v[1], v[2], N);
    if (objIsPlanar(v, 1e-5)) { const e = byEar(); if (e) return e; }   // 平面 n-gon（含凹）→ 耳切
    let out = [];                                                // 非平面 n-gon / 耳切失败：扇形兜底
    for (let i = 1; i < n - 1; i++) out = out.concat(objTriangleParts(v[0], v[i], v[i + 1], N));
    return out;
}

/* ---------------- 共面合并（块数优化） ----------------
   模型被切成很多共面小面时（体素导出 / 建筑 / 地板 / 平板），逐面生成会让块数暴涨：
   实测 8×8 共面小矩形 = 64 块、小三角 = 384 块，而那个平面本身只需要 1 片。
   做法：① 按 (量化法向, 量化偏移) 平面分组；② 组内「有向边抵消」求并集轮廓；
        ③ 轮廓环按相对外法向的带符号面积分正负（出现负环 = 有洞 ⇒ 保守放弃）；
        ④ 合并结果与「逐面」比较片数，**只有严格更少才采纳**（保证永不倒退）。
   边抵消原理：两个相邻面共享的内部边在并集里成对出现且方向相反，抵消后只剩外轮廓。 */
function objCoalesceFaces(faces) {
    const Q = x => Math.round(x / 1e-4);
    const groups = new Map();
    const out = [];
    faces.forEach(f => {
        const N = objFaceNormal(f.v);
        if (N.lengthSq() < 1e-18) { out.push(f); return; }        // 退化面：不参与分组
        const d = f.v[0].dot(N);
        const key = Q(N.x) + ',' + Q(N.y) + ',' + Q(N.z) + ',' + Q(d);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(f);
    });
    groups.forEach(list => {
        if (list.length === 1) { out.push(list[0]); return; }
        let merged = null;
        try { merged = objMergeCoplanarGroup(list); } catch (e) { merged = null; }
        if (merged) out.push.apply(out, merged); else out.push.apply(out, list);
    });
    return out;
}

/* 组内合并；不能合并（有洞 / 不划算 / 非流形 / 未闭合）时返回 null */
function objMergeCoplanarGroup(list) {
    const K = x => Math.round(x / 1e-5);
    const vk = p => K(p.x) + ',' + K(p.y) + ',' + K(p.z);
    // ① 有向边抵消：内部边成对反向 ⇒ 消掉；剩下并集外轮廓
    const edges = new Map();
    for (const f of list) {
        const v = f.v, n = v.length;
        for (let i = 0; i < n; i++) {
            const a = v[i], b = v[(i + 1) % n];
            const ka = vk(a), kb = vk(b);
            if (ka === kb) continue;                              // 退化边
            const rev = kb + '>' + ka;
            if (edges.has(rev)) edges.delete(rev);                 // 有反向边 ⇒ 互相抵消
            else if (!edges.has(ka + '>' + kb)) edges.set(ka + '>' + kb, { a: a, b: b, ka: ka, kb: kb });
        }
    }
    if (edges.size < 3) return null;
    // ② 串联成闭合环
    const byStart = new Map();
    edges.forEach(e => { if (!byStart.has(e.ka)) byStart.set(e.ka, []); byStart.get(e.ka).push(e); });
    const used = new Set(), loops = [];
    for (const e0 of edges.values()) {
        if (used.has(e0)) continue;
        const loop = [];
        let cur = e0, firstKey = e0.ka, lastKey = e0.ka;
        while (cur && !used.has(cur)) {
            used.add(cur);
            loop.push(cur.a);
            lastKey = cur.kb;
            const nx = byStart.get(cur.kb) || [];
            cur = nx.find(x => !used.has(x)) || null;
        }
        if (loop.length >= 3 && lastKey === firstKey) loops.push(loop);   // 未闭合 ⇒ 丢弃（非流形）
    }
    if (!loops.length) return null;
    // ③ 轮廓简化：抹掉边上的共线中间点。
    //    ★关键：8×8 网格合并后，外轮廓每条边仍带 8 个共线顶点（共 32 顶点）——
    //    不简化的话耳切会退化成一堆小三角（32 顶点 → 30 三角 → 90 块），
    //    反而比原样「逐面」更差，于是被 ④ 判为不划算而放弃合并。
    const simplify = lp => {
        const n = lp.length, keep = [];
        for (let i = 0; i < n; i++) {
            const a = lp[(i - 1 + n) % n], b = lp[i], c = lp[(i + 1) % n];
            const ac = objSub(c, a), L = ac.length();
            if (L < 1e-12) { keep.push(b); continue; }
            const d = objCross(ac, objSub(b, a)).length() / L;      // b 到直线 a–c 的距离
            const scale = Math.max(objSub(b, a).length(), objSub(c, b).length(), 1e-9);
            if (d / scale > 1e-4) keep.push(b);                    // 非共线 ⇒ 保留为折点
        }
        return keep.length >= 3 ? keep : lp;
    };
    // ④ 定向判定：逆时针（相对外法向）= 外轮廓；负面积环 = 洞 ⇒ 整组放弃
    const N = objFaceNormal(list[0].v);
    const signedArea = lp => {
        let s = 0;
        for (let i = 0; i < lp.length; i++) { const a = lp[i], b = lp[(i + 1) % lp.length]; s += objCross(a, b).dot(N); }
        return s * 0.5;
    };
    const polys = [];
    for (const lp of loops) {
        if (signedArea(lp) < 0) return null;                       // 有洞：保守放弃
        polys.push({ v: simplify(lp) });
    }
    // ⑤ 只在严格更少块时采纳
    let cntMerged = 0, cntOrig = 0;
    try {
        polys.forEach(p => { cntMerged += objFaceToParts(p.v).length; });
        list.forEach(f => { cntOrig += objFaceToParts(f.v).length; });
    } catch (e) { return null; }
    return (cntMerged < cntOrig) ? polys : null;
}

/* 接触面完全剔除：两个面「同平面」且「多边形完全重合」（顶点集合逐个一致）⇒ 判定为内部接触面，
   把这几片全部剔除（它们贴在内部、看不见，留着只会双面叠影/多耗方块）。
   ★严格只剔「完全重合」；「同平面但未完全重合」（只是挨着或部分重叠）一律不剔、不动。 */
function objCullCoincidentFaces(faces) {
    if (!faces || faces.length < 2) return faces;
    const faceNormal = (v) => {
        let nx = 0, ny = 0, nz = 0;
        const n = v.length;
        for (let i = 0; i < n; i++) {
            const a = v[i], b = v[(i + 1) % n];
            nx += (a.y - b.y) * (a.z + b.z);
            ny += (a.z - b.z) * (a.x + b.x);
            nz += (a.x - b.x) * (a.y + b.y);
        }
        const L = Math.hypot(nx, ny, nz);
        return L < 1e-12 ? null : { x: nx / L, y: ny / L, z: nz / L };
    };
    const planeKey = (f) => {
        const n = faceNormal(f.v); if (!n) return null;
        // 法线量化 + 规范符号（相反朝向也归为同一平面）
        let nx = Math.round(n.x * 1e3) / 1e3, ny = Math.round(n.y * 1e3) / 1e3, nz = Math.round(n.z * 1e3) / 1e3;
        if (nx < 0 || (nx === 0 && ny < 0) || (nx === 0 && ny === 0 && nz < 0)) { nx = -nx; ny = -ny; nz = -nz; }
        let c = 0; f.v.forEach(p => { c += p.x * nx + p.y * ny + p.z * nz; });
        c /= f.v.length;
        return nx.toFixed(3) + ',' + ny.toFixed(3) + ',' + nz.toFixed(3) + '|' + Math.round(c * 1e3);
    };
    const polyKey = (f) => f.v.map(p =>
        p.x.toFixed(4) + ',' + p.y.toFixed(4) + ',' + p.z.toFixed(4)).sort().join(';');
    const groups = new Map();
    faces.forEach((f, i) => {
        const pk = planeKey(f); if (!pk) return;
        const gk = pk + '#' + polyKey(f);
        if (!groups.has(gk)) groups.set(gk, []);
        groups.get(gk).push(i);
    });
    const kill = new Set();
    groups.forEach(arr => { if (arr.length > 1) arr.forEach(i => kill.add(i)); });
    if (!kill.size) return faces;
    return faces.filter((f, i) => !kill.has(i));
}

/* 解析 + 变换（缩放 / 坐标轴 / 落位）→ 待生成清单（不落地，供预览） */
function objPlanModel(text, opts) {
    opts = opts || {};
    const norm = opts.normalize !== false;
    const targetSize = (typeof opts.size === 'number' && opts.size > 0) ? opts.size : 1;
    const place = opts.place || 'ground';
    const axis = opts.axis || 'yup';
    const maxBlocks = opts.maxBlocks || 20000;
    const normalOut = opts.normalOut !== false;   // 法线朝向：true=朝外（默认）/ false=朝内
    const parsed = objParse(text);
    if (!parsed.faces.length) return { ok: false, err: '未找到任何面（f 行）' };
    const mapAxis = p => axis === 'zup' ? objV(p.x, p.z, -p.y) : p.clone();
    const verts = parsed.verts.map(mapAxis);
    const faces = parsed.faces.map(f => ({ v: f.v.map(mapAxis) }));
    const bbMin = objV(Infinity, Infinity, Infinity), bbMax = objV(-Infinity, -Infinity, -Infinity);
    verts.forEach(p => { bbMin.min(p); bbMax.max(p); });
    const rawSize = bbMax.clone().sub(bbMin);
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);
    const k = (norm && maxDim > 1e-9) ? targetSize / maxDim : 1;
    const cx = (bbMin.x + bbMax.x) / 2 * k, cz = (bbMin.z + bbMax.z) / 2 * k;
    const mapP = p => {
        const q = objV(p.x * k, p.y * k, p.z * k);
        let y = q.y;
        if (place === 'ground') y = q.y - bbMin.y * k;                 // 底面贴地
        else if (place === 'center') y = q.y - (bbMin.y + bbMax.y) / 2 * k;  // 竖直居中
        return objV(q.x - cx, y, q.z - cz);
    };
    const plan = [];                                 // 已解算的 M 数组（含位置）
    let faceOk = 0, faceFail = 0, partFail = 0, partTotal = 0, overflow = false;
    // ★共面合并：先把同一平面上被切成很多小块的面拼回大块（仅在减少片数时采纳，绝不倒退）
    const mappedFaces = faces.map(f => ({ v: f.v.map(mapP) }));
    // ★接触面完全剔除（先于共面合并）：完全重合的面（内部接触面）成对全剔
    let culledFaces = mappedFaces;
    try { culledFaces = objCullCoincidentFaces(mappedFaces); } catch (e) { culledFaces = mappedFaces; }
    const culledCoincident = mappedFaces.length - culledFaces.length;
    let workFaces = culledFaces;
    try { workFaces = objCoalesceFaces(culledFaces); } catch (e) { workFaces = culledFaces; }
    // 归一化 / 落位之后的模型 AABB —— 供「包围盒预览」泡泡与场景线框使用
    const bMin = objV(Infinity, Infinity, Infinity), bMax = objV(-Infinity, -Infinity, -Infinity);
    mappedFaces.forEach(f => f.v.forEach(p => { bMin.min(p); bMax.max(p); }));
    const bbox = isFinite(bMin.x) ? {
        min: [bMin.x, bMin.y, bMin.z], max: [bMax.x, bMax.y, bMax.z],
        size: [bMax.x - bMin.x, bMax.y - bMin.y, bMax.z - bMin.z]
    } : null;
    workFaces.forEach(f => {
        const vv = f.v;
        let parts = null;
        try { parts = objFaceToParts(vv); } catch (e) { parts = null; }
        if (!parts || !parts.length) { faceFail++; return; }
        let made = 0;
        for (const p of parts) {
            partTotal++;
            if (plan.length >= maxBlocks) { overflow = true; break; }
            const M = objSolvePart(p, normalOut);
            if (M) { plan.push(M); made++; } else partFail++;
        }
        if (made) faceOk++; else faceFail++;
    });
    return {
        ok: true, plan, faceOk, faceFail, partFail, partTotal, overflow, k,
        nVert: verts.length, nFace: faces.length,
        coalescedFrom: culledFaces.length, coalescedTo: workFaces.length,
        culledCoincident: culledCoincident,
        bbox: bbox, rawMaxDim: maxDim,
        size: rawSize.clone().multiplyScalar(k)
    };
}

/* 纯清空场景里的方块（供 OBJ 覆盖导入用）。
   ★loadProjectIntoSimulator(null) 默认会补一个「默认 Cube 占位」，命令导入路径由
     importFromCommands 负责移除，OBJ 路径没人管 ⇒ 覆盖后块数会多 1（实测踩过）。 */
function objClearBlocks() {
    try {
        blocks.slice().forEach(b => {
            try {
                scene.remove(b.mesh);
                if (b.label) scene.remove(b.label);
                if (b.selectionWireframe) scene.remove(b.selectionWireframe);
            } catch (e) {}
        });
        blocks = [];
        try { selectedBlocksSet.clear(); } catch (e) {}
        selectedBlock = null;
    } catch (e) {}
}

/* 清单 → 落地：批量 addBlock（undo 只记一条）
   clearFirst=true 用于覆盖导入：先清掉场景里残留的占位块，保证「覆盖后 = 刚好 K 块」。 */
function objCommitPlan(plan, silent, clearFirst) {
    if (!plan || !plan.length) { if (!silent) showToast('❌ 没有可生成的方块'); return 0; }
    if (clearFirst) objClearBlocks();
    flushPendingRecords();                       // 先把导入前的编辑落账，保证撤销一步回到导入前
    try { history.ensure(getState()); } catch (e) {}   // 空栈兜底：见 history.ensure 注释
    const made = [];
    _objIdLookup = null;          // 本批 id 集合重建（见 objMakeBlockFromM：避免逐块 O(n) 查重）
    _bulkAddDepth++;              // 批量期间抑制 addBlock 里的「逐块重建侧栏」（O(n²) 的 HTML 生成）
    try {
        for (const M of plan) {
            if (!M) continue;
            const blk = objMakeBlockFromM(M);
            if (blk) { addBlock(blk, false, false); made.push(blk); }   // record=false：整批只记一次
        }
    } finally { _bulkAddDepth--; }
    if (!made.length) { if (!silent) showToast('❌ 全部面求解失败'); return 0; }
    try { selectedBlocksSet.clear(); } catch (e) {}
    /* ★【2026-10-24 性能】保持「导入后全部选中」的原行为：线框与自身坐标轴已按
       _SEL_WIREFRAME_MAX / _AXIS_HELPER_MAX 封顶（大选区只画主选中块），
       因此再多的选中块也不会像以前那样产生上万个场景对象与 draw call。 */
    made.forEach(b => { try { selectedBlocksSet.add(b); } catch (e) {} });
    selectBlock(made[made.length - 1]);
    /* ★【2026-10-24 性能】批量落地：方块刚由构造器按 M 建好、变量也已 recompute 过，
       故只需把矩阵落到位 + 同步材质正反面。旧实现 `blocks.forEach(b => b.refresh())`
       每块还会重算 scope、并跑一遍全局变量传播（全表扫描），2940 块时实测烧掉 3.2 秒。 */
    made.forEach(b => {
        try { b.updateTransform(); b.updateMaterialSide(); } catch (e) {}
    });
    try { bumpVisibilityRev(); updateAllBlockLabels(performance.now()); } catch (e) {}
    if (typeof renderSideBlockList === 'function') renderSideBlockList();
    // ★取消 addBlock / selectBlock / refresh 顺带排下的「防抖记录」，否则顶层会多出一条
    //   与导入后状态相同的重复快照 → 用户按一次撤销看似毫无反应（实测踩过）。
    if (recordDebounceTimer) { clearTimeout(recordDebounceTimer); recordDebounceTimer = null; }
    if (typeof mnbRecordTimer !== 'undefined' && mnbRecordTimer) { clearTimeout(mnbRecordTimer); mnbRecordTimer = null; }
    history.record(getState());                  // 一条快照 = 整批导入
    if (!silent) showToast('✅ 已导入模型：' + made.length + ' 个方块');
    return made.length;
}

/* 一步到位（供命令/脚本调用） */
function objImportModel(text, opts) {
    const r = objPlanModel(text, opts);
    if (!r.ok) { showToast('❌ ' + r.err); return null; }
    const n = objCommitPlan(r.plan);
    return { blocks: n, faces: r.faceOk, failed: r.faceFail };
}

/* ---- 事件：侧边点集列表 点击（选择 / 删除 / 清空 / 取消选择 / 导入） ---- */
document.addEventListener('click', (e) => {
    // 侧边「点集」列表（画笔模式下显示在 #sideBlockList 内）
    const sideList = document.getElementById('sideBlockList');
    if (isBrushMode && sideList && sideList.contains(e.target)) {
        // ★导入按钮放在最前：它在文本框下方，但必须早于其它分支判断，
        //   否则点击时不会触发导入（其余分支都 return）
        if (e.target.closest('#ptSideImport')) { ptImportPointsInline(); return; }
        const del = e.target.closest('.pt-del');
        if (del) { ptRemovePoint(parseInt(del.dataset.del, 10)); ptSyncPanel(); return; }
        if (e.target.closest('#ptClearBtn')) { ptClearAllPoints(); return; }
        if (e.target.closest('#ptUnselBtn')) { ptClearSelection(); return; }
        if (e.target.closest('#ptSideDelSel')) { ptDeleteSelected(); return; }
        if (e.target.closest('#ptSideShape')) { ptToggleShapeMode(); return; }
        const row = e.target.closest('.pt-point');
        if (row) { ptToggleSelect(parseInt(row.dataset.id, 10)); return; }
        return;
    }
});

/* ---- 画笔模式切换时同步点的可见性 ---- */
const _ptEnterBrush = enterBrushMode;
enterBrushMode = function () { _ptEnterBrush.apply(this, arguments); ptSyncVisibility(); syncBrushModeBtn(); };
const _ptExitBrush = exitBrushMode;
exitBrushMode = function () { _ptExitBrush.apply(this, arguments); ptSyncVisibility(); syncBrushModeBtn(); };

/* 顶部「编辑 / 画笔 / 动画」三按钮中，画笔按钮的激活态与点击 */
function syncBrushModeBtn() {
    syncModeButtons();
}
(function initBrushModeBtn() {
    const b = document.getElementById('brushModeBtn');
    if (b) b.addEventListener('click', () => toggleBrushMode());
    syncBrushModeBtn();
})();

/* ---- 暴露测试句柄（探针用） ---- */
window._pt = {
    addPoint: (x, z, color) => ptAddPoint(x, z, color || 'red', true),
    count: () => ptMarkers.length,
    selection: () => ptSelection.slice(),
    mode: () => ptMode,
    setMode: (m) => { ptMode = PT_SHAPES[m] ? m : 'rect2'; ptSyncTopUI(); ptSyncPanel(); },
    flagMode: () => ptBlockIsFlag,
    setFlagMode: (v) => { ptBlockIsFlag = !!v; ptSyncTopUI(); ptSyncPanel(); },
    brushMode: () => ptBrushMode,
    setBrushMode: (m) => { ptSetBrushMode(m); },
    drawColor: () => ptDrawColor,
    setDrawColor: (c) => { ptDrawColor = c; ptSyncTopUI(); },
    deleteSelected: () => ptDeleteSelected(),
    select: (id) => ptToggleSelect(id),
    open: () => { ptRevealSideList(); return true; },
    generate: () => ptGenerate(),
    parse: (t) => ptParsePoints(t),
    flagFromPoints: (ax, az, e1x, e1z, e2x, e2z) => {
        const blk = ptMakeFlagBlock({ x: ax, z: az }, { x: e1x, z: e1z }, { x: e2x, z: e2z });
        if (blk) { addBlock(blk, true, true); selectBlock(blk); return blk.id; }
        return null;
    },
    clear: () => ptClearPoints(),
    // 「保留通用计算式」探针句柄：生成器直调 + 状态读写（探针在普通脚本作用域，够不到模块内绑定）
    keepExpr: () => ptKeepExpr,
    setKeepExpr: (v) => { ptKeepExpr = !!v; },
    makeRect: (x1, z1, x2, z2, isFlag) => ptMakeRectBlock({ x: x1, z: z1 }, { x: x2, z: z2 }, !!isFlag),
    makePara: (ax, az, e1x, e1z, e2x, e2z, isFlag) => ptMakeParaBlock({ x: ax, z: az }, { x: e1x, z: e1z }, { x: e2x, z: e2z }, !!isFlag),
    pickAt: (clientX, clientY) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const meshes = ptMarkers.filter(p => p.mesh && p.mesh.visible).map(p => p.mesh);
        const hits = raycaster.intersectObjects(meshes, false);
        if (!hits.length) return null;
        const p = ptMarkers.find(q => q.mesh === hits[0].object);
        return p ? p.id : null;
    },
    worldToScreen: (x, z) => {
        camera.updateMatrixWorld(true);
        try { camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); } catch (e) {}
        const rect = renderer.domElement.getBoundingClientRect();
        const v = new THREE.Vector3(x, 0, z).project(camera);
        return { x: Math.round(rect.left + (v.x * 0.5 + 0.5) * rect.width), y: Math.round(rect.top + (-v.y * 0.5 + 0.5) * rect.height) };
    },
    // 模拟「在网格 (clientX,clientY) 处点击」：moved=true 表示这是一次摄像机拖拽（不应放点）
    handleGridClickAt: (clientX, clientY, moved) => {
        camera.updateMatrixWorld(true);
        if (typeof _canvasDragMoved !== 'undefined') _canvasDragMoved = !!moved;
        handleBrushClick({ clientX, clientY });
    },
    enterBrush: () => { if (!isBrushMode) toggleBrushMode(); ptSyncVisibility(); },
    exitBrush: () => { if (isBrushMode) toggleBrushMode(); ptSyncVisibility(); },
    brushOn: () => !!isBrushMode,
    // 绿点（选中方块的角点标记）测试钩子：世界边长 / 屏幕投影边长(px) / 该角点是否已被选中
    vertexMarkers: () => {
        camera.updateMatrixWorld(true);
        try { camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); } catch (e) {}
        const rect = renderer.domElement.getBoundingClientRect();
        return brushVertexMarkers.map(m => {
            const c = m.userData.position;
            const S = m.scale.x * BRUSH_VERTEX_BASE;
            const pa = new THREE.Vector3(c.x - S / 2, 0, c.z).project(camera);
            const pb = new THREE.Vector3(c.x + S / 2, 0, c.z).project(camera);
            return {
                x: +c.x.toFixed(6), z: +c.z.toFixed(6),
                worldSize: +S.toFixed(6),
                screenPx: +Math.abs((pb.x - pa.x) * 0.5 * rect.width).toFixed(2),
                selected: ptVertexSelection.some(v => Math.abs(v.x - c.x) < 1e-6 && Math.abs(v.z - c.z) < 1e-6)
            };
        });
    },
    vertexWorldSize: () => brushVertexWorldSize,
    brushSelectedId: () => (brushSelectedBlock ? brushSelectedBlock.id : null),
    vertexSelection: () => ptVertexSelection.map(v => ({ x: +v.x.toFixed(6), z: +v.z.toFixed(6) })),
    selCount: () => ptSelCount(),
    clearSelection: () => { ptClearSelection(); return true; },
    // 矩形「左右两侧」预览（选了绿点后出现）
    rectPreview: () => {
        if (!ptRectPreview) return null;
        const P = ptRectPreview;
        return {
            A: { x: +P.A.x.toFixed(6), z: +P.A.z.toFixed(6) },
            B: { x: +P.B.x.toFixed(6), z: +P.B.z.toFixed(6) },
            L: +P.L.toFixed(6), w: +P.w.toFixed(6), ux: +P.ux.toFixed(6), uz: +P.uz.toFixed(6),
            items: P.items.map(it => ({
                key: it.key, n: [+it.n[0].toFixed(6), +it.n[1].toFixed(6)],
                corners: it.corners.map(c => [+c.x.toFixed(6), +c.z.toFixed(6)])
            }))
        };
    },
    // 直接选一侧（探针用）：'red' = A→B 作右边 | 'green' = A→B 作左边
    rectSideChoose: (key) => {
        if (!ptRectPreview) return false;
        const it = ptRectPreview.items.find(i => i.key === key);
        return it ? ptGenerateRectSide(it) : false;
    },
    // 某个方块在地面上的角点（用画笔同一套 getBlockCorners）
    blockCorners: (id) => {
        const b = blocks.find(q => q.id === id);
        if (!b) return null;
        return getBlockCorners(b).map(c => [+c.x.toFixed(6), +c.z.toFixed(6)]);
    },
    lastBlockId: () => (blocks.length ? blocks[blocks.length - 1].id : null),
    pointAt: (x, z) => {
        const p = ptMarkers.find(q => Math.abs(q.x - x) < 1e-6 && Math.abs(q.z - z) < 1e-6);
        return p ? { id: p.id, x: p.x, z: p.z } : null;
    },
    lastPointAt: (x, z) => {
        const p = ptMarkers[ptMarkers.length - 1];
        return p ? { id: p.id, x: +p.x.toFixed(6), z: +p.z.toFixed(6) } : null;
    },
    sync: () => ptSyncPanel(),
    dbgPara: (A, B, C) => {
        const R2D = 180 / Math.PI, out = [];
        for (const [Q, R] of [[B, C], [C, B]]) {
            const e1x = Q.x - A.x, e1z = Q.z - A.z, e2x = R.x - A.x, e2z = R.z - A.z;
            const len1 = Math.hypot(e1x, e1z), len2 = Math.hypot(e2x, e2z);
            const ht1 = Math.atan2(e1z, e1x) * R2D, ht2 = Math.atan2(e2z, e2x) * R2D;
            const ang = Math.atan2(e1x * e2z - e1z * e2x, e1x * e2x + e1z * e2z) * R2D;
            const p = generatePlaneParams(len1, len2, ang);
            const { ex, ez } = ptPlaneAxesWorld(p);
            const solved = ptSolveParaPlacement(A, B, C);
            out.push({
                len1: +len1.toFixed(3), len2: +len2.toFixed(3), ang: +ang.toFixed(2),
                lx: +Math.hypot(ex.x, ex.z).toFixed(3), lz: +Math.hypot(ez.x, ez.z).toFixed(3),
                hx: +(Math.atan2(ex.z, ex.x) * R2D).toFixed(2), hz: +(Math.atan2(ez.z, ez.x) * R2D).toFixed(2),
                ht1: +ht1.toFixed(2), ht2: +ht2.toFixed(2),
                p: JSON.parse(JSON.stringify(p)),
                yrotSolved: solved ? +solved.yrot.toFixed(3) : null,
                err: solved ? +solved.err.toFixed(3) : null
            });
        }
        return out;
    },
    camUp: () => ({ x: camera.up.x, y: camera.up.y, z: camera.up.z }),
    camPos: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
    // 测试用：把相机移到正上方距离 d 处（垂直俯视），并立即刷新点标记缩放
    setCamDist: (d) => {
        camera.position.set(0, d, 0); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        if (controls) { controls.target.set(0, 0, 0); try { controls.update(); } catch (e) {} }
        if (typeof ptUpdateMarkerSizes === 'function') ptUpdateMarkerSizes();
        return true;
    },
    precision: () => ptDisplayPrecision,
    setPrecision: (n) => {
        const rng = document.getElementById('ptPrecisionRange');
        if (rng) { rng.value = String(n); rng.dispatchEvent(new Event('input', { bubbles: true })); }
        return ptDisplayPrecision;
    },
    controlsState: () => ({
        enableRotate: controls.enableRotate,
        minPolar: +controls.minPolarAngle.toFixed(3),
        maxPolar: +controls.maxPolarAngle.toFixed(3),
        left: controls.mouseButtons.LEFT,
        right: controls.mouseButtons.RIGHT
    }),
    // 模拟「右键拖拽偏航」：绕世界 Y 轴旋转相机（等价于 OrbitControls 方位角旋转）
    yawBy: (delta) => {
        if (!controls) return false;
        const off = camera.position.clone().sub(controls.target);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), delta);
        camera.position.copy(controls.target).add(off);
        camera.lookAt(controls.target);
        camera.updateMatrixWorld(true);
        try { controls.update(); } catch (e) {}
        return true;
    },
    lastPoint: () => ptMarkers.length ? { x: ptMarkers[ptMarkers.length - 1].x, z: ptMarkers[ptMarkers.length - 1].z } : null,
    thickness: () => (typeof brushThickness === 'number' ? brushThickness : 1),
    dbgRender: () => {
        try {
            labelRenderer.render(scene, camera);
        } catch (e) { return 'ERR ' + e.message; }
        const el = ptMarkers[0] ? ptMarkers[0].label.element : null;
        return { inDom: !!(el && el.parentNode), parentTag: el && el.parentNode ? el.parentNode.tagName : null,
                 frame: renderer.info.render.frame, domChildren: labelRenderer.domElement.children.length };
    },
    dbgProject: () => {
        const p = ptMarkers[0];
        if (!p) return { markers: 0 };
        const v = p.mesh.position.clone().project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return {
            meshPos: [p.mesh.position.x, p.mesh.position.y, p.mesh.position.z],
            camPos: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z],
            ndc: [v.x, v.y, v.z], rect: [rect.left, rect.top, rect.width, rect.height],
            fov: camera.fov, zoom: camera.zoom
        };
    },
    dbg: () => {
        const p = ptMarkers[0];
        if (!p) return { markers: 0 };
        const el = p.label.element;
        return {
            markers: ptMarkers.length,
            labelVisible: p.label.visible,
            meshVisible: p.mesh.visible,
            inDom: !!(el && el.parentNode),
            parentTag: el && el.parentNode ? el.parentNode.tagName : null,
            parentId: el && el.parentNode ? el.parentNode.id : null,
            parentCls: el && el.parentNode ? String(el.parentNode.className || '').slice(0, 40) : null,
            txt: el ? el.textContent : null,
            parentType: p.label.parent ? p.label.parent.type : null,
            inRenderedScene: (() => { let f = false; try { scene.traverse(o => { if (o === p.label) f = true; }); } catch (e) { return 'ERR:' + e.message; } return f; })(),
            sceneChildCount: (() => { try { return scene.children.length; } catch (e) { return -1; } })()
        };
    },
    markers: () => ptMarkers.map(p => {
        const r = p.div && p.div.getBoundingClientRect ? p.div.getBoundingClientRect() : null;
        // 球心（而非标签）的屏幕投影，便于按「点本体」来点击
        let hx = null, hy = null;
        try {
            const rect = renderer.domElement.getBoundingClientRect();
            const v = p.mesh.position.clone().project(camera);
            hx = rect.left + (v.x * 0.5 + 0.5) * rect.width;
            hy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
        } catch (e) { /* ignore */ }
        return {
            id: p.id, x: p.x, z: p.z, color: p.color, visible: p.mesh.visible,
            inDom: !!(p.div && p.div.parentNode),
            cx: r ? r.x + r.width / 2 : null, cy: r ? r.y + r.height / 2 : null,
            hitX: hx, hitY: hy, con: p.con || null
        };
    }),
    colors: PT_COLORS
};

