/* 07-scene/02-theme-and-view.js · 源 测试版v.6b79.html 第 35411-36031 行 */
'use strict';
// ==================== 主题切换 ====================
function applyTheme() {
    const body = document.body;
    if (isLightMode) {
        body.classList.add('light-mode');
        // ★【2026-10-22】引用变量而非固化色值：灰度滑条拖动时 body 底色必须实时跟随
        body.style.backgroundColor = 'var(--lm-body, #eef2f8)';
        scene.background = new THREE.Color(0xd4dee9); // 3D 清屏色：偏灰蓝，不做棋盘地面
        if (lightsReady) {
            ambient.intensity = 0.45;
            mainLight.intensity = 0.55;
        }
        document.getElementById('modeSwitchBtn').innerHTML = '<span>深色模式</span>';
    } else {
        body.classList.remove('light-mode');
        body.style.backgroundImage = '';
        body.style.backgroundColor = '';
        scene.background = new THREE.Color(0x030617);
        if (lightsReady) {
            ambient.intensity = 0.4;
            mainLight.intensity = 0.5;
        }
        document.getElementById('modeSwitchBtn').innerHTML = '<span>浅色模式</span>';
    }
    if (themeCheckbox) {
        themeCheckbox.classList.toggle('checked', isLightMode);
        themeCheckbox.setAttribute('aria-pressed', String(isLightMode));
    }
    updateAxesByDistance(true);
    // 测量（测长 / 测角）：连线颜色 / 文字底色（白底 ↔ 灰底）/ 删除 × 一起跟随主题
    try { if (typeof measureThemeRefresh === 'function') measureThemeRefresh(); } catch (e) {}
    try {
        const cbg = document.getElementById('canvasBgOverlay');
        if (cbg) {
            cbg.style.backgroundImage = body.style.backgroundImage || '';
            cbg.style.backgroundColor = body.style.backgroundColor || (isLightMode ? '#f7f9fc' : '#030617');
            cbg.style.opacity = isLightMode ? '1' : '0';
        }
    } catch (e) {}
    try {
        const dataOv = document.getElementById('dataPanelBgOverlay');
        if (dataOv) dataOv.style.opacity = isLightMode ? '1' : '0';
        document.querySelectorAll('.toolbar-bg-overlay').forEach(ov => ov.style.opacity = isLightMode ? '1' : '0');
    } catch (e) {}
    try {
        const saved = parseInt(localStorage.getItem('ui_grayscale') || '0', 10);
        setGrayscale(isNaN(saved) ? 0 : saved);
    } catch (e) {}
}
// 绑定主题切换按钮事件
document.getElementById('modeSwitchBtn').addEventListener('click', () => {
    isLightMode = !isLightMode;   // 翻转状态
    applyTheme();                  // 应用主题
});
// 轴线与网格
let originAxesGroup = null;  // 固定在世界原点的 XYZ 参考轴（X、Z 轴恒在 Y=0 平面，绝不随视点移动）
let axisGroup = null;        // 跟随视点、提供精细刻度的动态网格与坐标标签（始终位于 Y=0 平面）
let originGridGroup = null;  // 固定在世界原点的"home base"地面网格层：模型/坐标轴始终踩在其上，平移脱离原点时也不悬空
let originGridMat = null;    // 原点网格共享材质（每帧据相机到原点距离淡出）
let showAxes = true, showGrid = true, showTicks = true;
let lastGridSig = '';
let lastOriginSig = '';
let lastOriginGridSig = '';

/* ★【2026-10-22 用户澄清】3D 的 XZ 地面不要棋盘格：撤掉棋盘地面平面，
   分色只做在 UI 面板（浮窗左列/上部、Molang 编辑区、弹窗分区）上。 */

// 灯光与轴线变量均已就绪，重新应用主题以修正首次进入时的光强。
applyTheme();

// 根据相机状态计算坐标网格参数：精细度(step)取「整齐档位」(0.5/1/2/5/10…)，由「默认视角相机到目标的轨道半径(BASE_CAM_DIST)」决定——默认视角时 step=1(1×1 网格)；
// 旋转/平移不改变轨道半径 → 刻度不变；仅缩放改变它并按约 2 倍档位整档切换（标准地图式缩放级别，标签始终干净）；显示范围 = camDist*GRID_K（覆盖视野）。
// 坐标轴 + 轴上刻度显示范围须超过网格长度（axisActualMax = 网格 × AXIS_OVER）。
// 刻度数值格式化：按步长动态取小数位（最多 3 位），避免精细时（如 0.5）被 toFixed(1) 显示成 0.0；整齐档位下刻度通常为整数或半格(0.5)。
function formatTick(v, stepHint) {
    let s = String(stepHint);
    let i = s.indexOf('.');
    let dec = i < 0 ? 0 : (s.length - i - 1);
    dec = Math.min(dec, 3);
    const r = Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    return r.toFixed(dec);
}
function computeGridParams(camDist, panDist = 0) {
    // 精细度(step)取「整齐档位」：间距恒为 0.5/1/2/5/10… 这类整齐值 → 刻度标签永远干净（整数或半格0.5），最高精度精确停在 0.5；
    //   旋转/平移不改变 camDist，故刻度不变；仅缩放改变它，按约 2 倍档位整档切换（标准地图式缩放级别）。默认 step=1（1×1 网格）。
    const NICE_STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];  // 整齐档位：0.5 最高精度、10000 最低精度
    const minStep = 0.5;                                 // 最高精度下限（最精细网格间距）
    const maxStep = 10000;                               // 最低精度上限
    const minMax = minStep * 16;                         // 贴地时最小可见半径下限
    // 连续间距随 camDist 线性缩放（原离散档位表已移除）→ 跨阈值时不再"啪"地整档跳变，网格中心也不再随取整平移错位
    // 相对默认轨道半径：=1 时 step=1（1×1 网格）。加 epsilon 吸附，避免浮点误差使 rel 略大于 1 时
    // 落入"放大"分支误取更大档位（默认视角 step 应为 1 而非 2）。
    let rel = camDist / BASE_CAM_DIST;
    if (Math.abs(rel - 1) < 1e-6) rel = 1;   // 默认视角：精确 step=1
    rel = Math.max(1e-9, rel);
    let step;
    if (rel <= 1) {
        // 比默认更近(放大)：取最大整齐档位 <= rel（更精细），下限 0.5
        step = minStep;
        for (const s of NICE_STEPS) { if (s <= rel) step = s; else break; }
    } else {
        // 比默认更远(缩小)：取最小整齐档位 >= rel（更粗略）
        step = maxStep;
        for (let i = NICE_STEPS.length - 1; i >= 0; i--) { if (NICE_STEPS[i] >= rel) step = NICE_STEPS[i]; }
    }
    // 网格显示范围（半幅）：= camDist*GRID_K（始终覆盖视野，保证网格可见），并至少 MIN_CELLS 格
    const GRID_K = 3.0;       // 网格范围 = camDist * 3（较原 1.5 加大）
    const MIN_CELLS = 16;     // 网格半幅最少格数（保证至少可见一片网格）
    const N_MAX = 400;        // 网格半幅线条数上限（性能护栏）
    let gridMaxLen = Math.max(minMax, camDist * GRID_K, step * MIN_CELLS);
    // 性能护栏：若格数超过 N_MAX，放宽到「不小于 gridMaxLen/N_MAX 的最小整齐档位」（仍为整齐值、标签干净），避免海量网格线卡顿
    if (gridMaxLen / step > N_MAX) {
        const need = gridMaxLen / N_MAX;
        step = maxStep;
        for (let i = NICE_STEPS.length - 1; i >= 0; i--) { if (NICE_STEPS[i] >= need) step = NICE_STEPS[i]; }
    }
    step = Math.min(maxStep, Math.max(minStep, step));   // 精度区间 [0.5, 10000] 收口
    const gridActualMax = Math.floor(gridMaxLen / step) * step;
    // 坐标轴 + 轴上刻度显示范围须超过网格长度；并随平移"延伸"：覆盖"原点→相机目标"整段跨度，
    // 使原点 XYZ 轴在平移后也延伸到你所在位置（而不是只钉在原点），刻度步长自适应保证标签数量有界。
    const AXIS_OVER = 1.5;
    const axisZoomMax = Math.floor((gridMaxLen * AXIS_OVER) / step) * step;
    const axisExtendMax = Math.ceil((panDist + gridActualMax) / step) * step; // 延伸到覆盖平移目标处的网格
    const axisActualMax = Math.max(axisZoomMax, axisExtendMax);
    // 轴刻度步长：取网格步长 step 的「整齐整数倍」（与网格对齐、标签永远干净，不出二/三位小数）。
    //   允许为 step×1（与网格同精度，缩放贴近原点时可显示 0.5 刻度），仅在轴半幅刻度超过 AXIS_TICK_MAX 时才按 2/5/10… 放大，
    //   使放大/延伸更远时标签数量仍可控。step 本身为整齐值(0.5/1/2/5…)，乘以整数倍后仍为干净刻度，无小数位问题。
    const AXIS_TICK_MAX = 60;
    const AXIS_K_MUL = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    const axisNeedK = axisActualMax / (step * AXIS_TICK_MAX);
    let axisK = AXIS_K_MUL[0];
    for (const m of AXIS_K_MUL) { axisK = m; if (m >= axisNeedK) break; }
    const axisTickStep = step * axisK;
    return { maxLen: gridMaxLen, step, actualMax: gridActualMax, gridActualMax, axisActualMax, axisTickStep };
}
// 世界原点参考轴：X(红)/Y(绿)/Z(蓝) 三条轴钉在世界原点，X、Z 轴位于 Y=0 平面，绝不随视点移动。
// 轴的精细度(step)由轨道半径决定（旋转/平移不变，仅缩放改变）；显示范围(半幅)由「相机到视点的距离(轨道半径)」与「原点到目标点的水平距离(平移)」共同决定：
// 平移时坐标轴会"延伸"加长，覆盖"原点→相机目标"整段跨度，保证脚下始终能踩到坐标轴参考。
function createOriginAxes(step, actualMax, axisTickStep) {
    if (originAxesGroup) {
        originAxesGroup.traverse(c => { if (c.isCSS2DObject && c.element) c.element.remove(); });
        scene.remove(originAxesGroup);
    }
    originAxesGroup = new THREE.Group();
    const L = actualMax;
    const isMobile = window.innerWidth <= 700;
    const fontSize = isMobile ? '9px' : '12px';
    const textColor = document.body.classList.contains('light-mode') ? '#0f172a' : '#e2e8f0';
    // 沿轴的刻度数值：每 axisTickStep 一个（比网格步长稀疏，使轴延伸到超过网格长度）
    const tickStep = axisTickStep || step;
    const axisTicks = (c) => {
        const out = [];
        const k0 = Math.ceil((c - actualMax) / tickStep), k1 = Math.floor((c + actualMax) / tickStep);
        for (let k = k0; k <= k1; k++) { const v = k * tickStep; if (Math.abs(v) > 0.01) out.push(v); }
        return out;
    };
    const ticksX = axisTicks(0), ticksY = axisTicks(0), ticksZ = axisTicks(0);
    const axes = [
        { label:'X', color:0xff6666, start:new THREE.Vector3(-L,0,0), end:new THREE.Vector3(L,0,0) },
        { label:'Y', color:0x66ff66, start:new THREE.Vector3(0,-L,0), end:new THREE.Vector3(0,L,0) },
        { label:'Z', color:0x66aaff, start:new THREE.Vector3(0,0,-L), end:new THREE.Vector3(0,0,L) }
    ];
    axes.forEach(axis => {
        // 轴线/箭头始终构建进 group，是否显示只由 originAxesGroup.visible 决定，
        // 避免「先关刻度触发重建时 showAxes 为假、几何未生成，之后单独开轴线却无几何可显示」的 bug
        const geo = new THREE.BufferGeometry().setFromPoints([axis.start, axis.end]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: axis.color }));
        originAxesGroup.add(line);
        const dir = new THREE.Vector3().subVectors(axis.end, axis.start).normalize();
        const arrow = new THREE.ArrowHelper(dir, axis.end, 0.4, axis.color, 0.2, 0.1);
        originAxesGroup.add(arrow);
        if (showTicks) {
            const vals = axis.label === 'X' ? ticksX : axis.label === 'Y' ? ticksY : ticksZ;
            const tickLen = Math.max(0.05, tickStep * 0.12); // 斜线刻度长度随刻度步长缩放，使其在任何缩放下都可见
            vals.forEach(val => {
                let pos = axis.label === 'X' ? new THREE.Vector3(val,0,0) : axis.label === 'Y' ? new THREE.Vector3(0,val,0) : new THREE.Vector3(0,0,val);
                // 灰色小斜线刻度（恢复原始外观）：沿轴每 step 一个，斜向离开轴线
                let tickDir = axis.label === 'X' ? new THREE.Vector3(0, tickLen, tickLen) : axis.label === 'Y' ? new THREE.Vector3(tickLen, 0, tickLen) : new THREE.Vector3(tickLen, tickLen, 0);
                const tickGeo = new THREE.BufferGeometry().setFromPoints([pos, pos.clone().add(tickDir)]);
                originAxesGroup.add(new THREE.Line(tickGeo, new THREE.LineBasicMaterial({ color: 0x888888 })));
                const div = document.createElement('div');
                div.textContent = formatTick(val, tickStep);
                div.style.cssText = `color:${textColor};font-size:${fontSize};font-weight:bold;text-shadow:0 0 2px rgba(0,0,0,0.3);padding:0 2px;white-space:nowrap;`;
                const labelObj = new CSS2DObject(div);
                labelObj.position.copy(pos);
                originAxesGroup.add(labelObj);
            });
        }
    });
    originAxesGroup.visible = showAxes;
    scene.add(originAxesGroup);
}
// 动态网格：始终位于 Y=0 平面（与原点 X、Z 轴保持一致），水平中心跟随视点(controls.target)，
// 因此无论在世界哪个象限、缩放到多近，都能获得精细网格与真实世界坐标刻度（如 5020），
// 而原点 XYZ 参考轴保持钉在世界原点不动。
function createDynamicGrid(camDist, center) {
    if (axisGroup) {
        axisGroup.traverse(c => { if (c.isCSS2DObject && c.element) c.element.remove(); });
        scene.remove(axisGroup);
    }
    axisGroup = new THREE.Group();
    const { step, gridActualMax } = computeGridParams(camDist);
    const actualMax = gridActualMax; // 网格显示范围（小于坐标轴范围）
    const cx = center.x, cz = center.z; // Y 强制为 0：网格保持在水平面
    const axisTicks = (c) => {
        const out = [];
        const k0 = Math.ceil((c - actualMax) / step), k1 = Math.floor((c + actualMax) / step);
        for (let k = k0; k <= k1; k++) { const v = k * step; if (Math.abs(v) > 0.01) out.push(v); }
        return out;
    };
    const ticksX = axisTicks(cx), ticksZ = axisTicks(cz);
    const isMobile = window.innerWidth <= 700;
    const fontSize = isMobile ? '9px' : '12px';
    const textColor = document.body.classList.contains('light-mode') ? '#0f172a' : '#e2e8f0';
    if (showGrid) {
        const lineMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.35 });
        // 沿 X 方向的线（常数 Z）
        ticksZ.forEach(z => {
            if (Math.abs(z - cz) > actualMax) return;
            const points = [new THREE.Vector3(cx-actualMax,0,z), new THREE.Vector3(cx+actualMax,0,z)];
            axisGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
        });
        // 沿 Z 方向的线（常数 X）
        ticksX.forEach(x => {
            if (Math.abs(x - cx) > actualMax) return;
            const points = [new THREE.Vector3(x,0,cz-actualMax), new THREE.Vector3(x,0,cz+actualMax)];
            axisGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMat));
        });
    }
    // 注：坐标数值不再散落在地面网格上（之前被认为太乱）。当原点坐标轴滚出屏幕、看不见数值时，
    // 由屏幕边框标尺 updateScreenRuler() 在网格接触边框处显示 XZ 坐标刻度。
    axisGroup.visible = showGrid;
    scene.add(axisGroup);
}
// 原点锚定网格层（"home base" 地面参考）：固定在世界原点(模型/坐标轴所在)的粗糙网格，
// 使模型与原点坐标轴始终踩在网格上、不随平移脱离原点而"悬空"于黑暗中。
// 步长取 fineStep 的整数倍（与精细网格/原点轴刻度严格对齐），并用线数护栏保证性能。
function createOriginGrid(camDistOrigin, themeTag) {
    if (originGridGroup) {
        originGridGroup.traverse(c => { if (c.isCSS2DObject && c.element) c.element.remove(); });
        scene.remove(originGridGroup);
    }
    originGridGroup = new THREE.Group();
    // 原点网格层锚定世界原点；其精细度由「相机到原点的距离」决定（与精细网格同源算法 computeGridParams），
    // 因此当你缩放贴近原点时，原点处也会细分到 0.5；距离远时自动变粗并限制半幅，避免线条爆炸（线条数天然受控）。
    const ORIGIN_EXTENT_MAX = 20000;   // 原点网格最大半幅（极远时作为远处"地面"参考）
    const opO = computeGridParams(camDistOrigin, 0);
    const originStep = opO.step;
    const half = Math.min(ORIGIN_EXTENT_MAX, opO.gridActualMax);
    const baseColor = document.body.classList.contains('light-mode') ? 0x1d4ed8 : 0x1e3a8a; // 比精细网格更暗，读起来像背景地面
    originGridMat = new THREE.LineBasicMaterial({ color: baseColor, transparent: true, opacity: 0.25 });
    if (showGrid) {
        // 沿 X 方向的线（常数 Z）
        for (let z = -half; z <= half + 1e-6; z += originStep) {
            const zz = Math.round(z / originStep) * originStep;
            const points = [new THREE.Vector3(-half, 0, zz), new THREE.Vector3(half, 0, zz)];
            originGridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), originGridMat));
        }
        // 沿 Z 方向的线（常数 X）
        for (let x = -half; x <= half + 1e-6; x += originStep) {
            const xx = Math.round(x / originStep) * originStep;
            const points = [new THREE.Vector3(xx, 0, -half), new THREE.Vector3(xx, 0, half)];
            originGridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), originGridMat));
        }
    }
    originGridGroup.visible = showGrid;
    scene.add(originGridGroup);
}
function updateAxesByDistance(force = false) {
    const themeTag = document.body.classList.contains('light-mode') ? 'L' : 'D';
    // 精细度(step)由「轨道半径 camDist」决定：旋转/平移不改变 camDist，故刻度不随转动变化；仅缩放改变它
    // ★ 用 framingDist（等效 45° 距离）而非原始距离：正交视图的机位被等比拉远，原始距离会让网格整整粗 20 多档
    const camDist = framingDist();
    const panDist = Math.hypot(controls.target.x, controls.target.z); // 原点到相机目标(平移)的水平距离，用于让坐标轴延伸过去
    const op = computeGridParams(camDist, panDist);
    // ① 原点参考轴（钉在世界原点）：轴与刻度范围须超过网格长度
    const originSig = op.step + '|' + op.axisActualMax + '|' + op.axisTickStep + '|' + themeTag;
    if (force || originSig !== lastOriginSig) {
        lastOriginSig = originSig;
        bumpDrawRev('ui');   // 原点轴重建了
        createOriginAxes(op.step, op.axisActualMax, op.axisTickStep);
    }
    // ② 动态网格：水平中心跟随视点(controls.target)、始终位于 Y=0 平面，步长与原点轴一致（仅由轨道半径决定），范围 = 网格长度
    const p = op;
    const cx = Math.round(controls.target.x / p.step) * p.step;
    const cz = Math.round(controls.target.z / p.step) * p.step;
    const gridSig = p.step + '|' + p.gridActualMax + '|' + cx + ',' + cz + '|' + themeTag;
    // 仅当步长/范围/中心真正改变时才重建（平移跨过 step 边界或缩放改变时重建，支持无限距离）
    if (force || gridSig !== lastGridSig) {
        lastGridSig = gridSig;
        bumpDrawRev('ui');   // 动态网格重建了
        createDynamicGrid(camDist, { x: cx, y: 0, z: cz });
    }
    // ③ 原点锚定网格层：固定世界原点，使原点附近的模型/坐标轴始终有"地面"参考而不悬空。
    //    协调逻辑：当轨道中心(target)距原点很近、动态网格已覆盖原点时，原点层与动态网格步长/对齐完全一致 → 二者会完美重叠，
    //    若强行叠加只会变暗/重影且浪费线条，故此时跳过重建并隐藏原点层；仅在平移使原点脱离动态网格覆盖范围后才启用原点层。
    //    注意：原点层精细度由「相机到原点的距离 camera.position.length()」同源计算（与精细网格共用 computeGridParams），
    //    因此贴近原点缩放时原点处也会细分到 0.5（不再被固定粗网格卡住）。
    const panDistForOrigin = Math.hypot(controls.target.x, controls.target.z);
    const originCoveredByDynamic = panDistForOrigin <= op.gridActualMax + 1e-6;
    if (originCoveredByDynamic) {
        // 动态网格已覆盖原点：隐藏原点层（二者重叠，无需重复绘制）
        if (originGridGroup) originGridGroup.visible = false;
        lastOriginGridSig = '__covered__';
    } else {
        const camDistOrigin = camera.position.length() * framingRatio(); // 相机到世界原点的「等效 45° 距离」（原点层精细度基准）
        const originGridSig = camDistOrigin + '|' + themeTag;
        if (force || originGridSig !== lastOriginGridSig) {
            lastOriginGridSig = originGridSig;
            bumpDrawRev('ui');   // 原点锚定网格重建了
            createOriginGrid(camDistOrigin, themeTag);
        }
        if (originGridGroup) originGridGroup.visible = showGrid;
    }
    // 原点网格淡出：仅在极端远距离（原点已成远处小点）时轻微淡出避免杂乱；常规平移范围保持可见，
    // 确保模型始终被"地面"托住（不重新引入悬空错觉）。
    if (originGridMat) {
        const distOrigin = camera.position.length() * framingRatio(); // 相机到世界原点的「等效 45° 距离」
        const t = THREE.MathUtils.clamp((distOrigin - 10000) / 50000, 0, 1);
        originGridMat.opacity = 0.25 * (1 - 0.75 * t); // 0.25 → 0.0625（极端远时）
    }
}
// ---- 四个视图开关的「全局保留」：隐藏方块名 / 显示轴线 / 显示平面 / 显示刻度 ----
// 它们属于「用户视图偏好」，不属于任何单个项目的数据（getState() 不含这四项，
// 项目存档与撤销快照都不该管它们）。此前只活在当前页面里，刷新 / 重开 APP 后一律
// 回落到 HTML 写死的默认值（轴线/平面/刻度全开、隐藏关闭），用户每次都要重设。
// 现统一落 localStorage（键 ui_view_flags），启动时恢复，切项目 / 撤销均不受影响。
const VIEW_FLAGS_KEY = 'ui_view_flags';
function saveViewFlags() {
    try {
        localStorage.setItem(VIEW_FLAGS_KEY, JSON.stringify({
            axes: !!showAxes, grid: !!showGrid, ticks: !!showTicks, hideNames: !!hideNames,
            ortho: !!orthoViewOn
        }));
    } catch (e) {}
}
function restoreViewFlags() {
    try {
        const raw = localStorage.getItem(VIEW_FLAGS_KEY);
        if (!raw) return;
        const v = JSON.parse(raw);
        if (!v || typeof v !== 'object') return;
        if (typeof v.axes === 'boolean') showAxes = v.axes;
        if (typeof v.grid === 'boolean') showGrid = v.grid;
        if (typeof v.ticks === 'boolean') showTicks = v.ticks;
        if (typeof v.hideNames === 'boolean') hideNames = v.hideNames;
        // 正交视图偏好：静默切回（不弹提示、不重复写库），随后由调用方统一重建网格
        if (typeof v.ortho === 'boolean') setOrthoView(v.ortho, { silent: true, skipSave: true });
        // 侧栏勾选框是这三个开关的 DOM 真实来源（新布局视图下拉的 ✓ 也读它）
        // → 必须同步 checked，否则界面勾选态与真实状态脱节。
        const _ac = document.getElementById('showAxesCheckbox');
        const _gc = document.getElementById('showGridCheckbox');
        const _tc = document.getElementById('showTicksCheckbox');
        if (_ac) _ac.checked = showAxes;
        if (_gc) _gc.checked = showGrid;
        if (_tc) _tc.checked = showTicks;
        // 隐藏方块名的文案/标签同步（此刻 blocks 还是空的，标签可见性由建块时读 hideNames 决定）
        syncHideNamesUI();
    } catch (e) {}
}
document.getElementById('showAxesCheckbox').addEventListener('change', (e) => { showAxes = e.target.checked; if (originAxesGroup) originAxesGroup.visible = showAxes; bumpDrawRev('ui'); saveViewFlags(); });
document.getElementById('showGridCheckbox').addEventListener('change', (e) => { showGrid = e.target.checked; updateAxesByDistance(true); saveViewFlags(); });
document.getElementById('showTicksCheckbox').addEventListener('change', (e) => { showTicks = e.target.checked; updateAxesByDistance(true); saveViewFlags(); });

// ---- 屏幕边框 XZ 标尺：原点坐标轴滚出屏幕、看不见数值时，在网格接触屏幕边框处显示 XZ 坐标刻度 ----
let rulerEl = null, rulerW = 0, rulerH = 0, lastRulerKey = '';
let rulerLastTick = { left: null, right: null, top: null, bottom: null };
function ensureRulerEl() {
    if (rulerEl) return;
    const style = document.createElement('style');
    style.textContent = '#screenRuler{position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden;}' +
        '.ruler-tick{position:absolute;display:flex;align-items:center;justify-content:center;font:bold 11px/1 sans-serif;white-space:nowrap;text-shadow:0 0 2px rgba(0,0,0,.55);}' +
        '.ruler-tick .bar{background:currentColor;opacity:.85;flex:none;}' +
        '.ruler-tick.left{flex-direction:row;} .ruler-tick.left .bar{width:7px;height:2px;margin-right:3px;}' +
        '.ruler-tick.right{flex-direction:row-reverse;} .ruler-tick.right .bar{width:7px;height:2px;margin-left:3px;}' +
        '.ruler-tick.top{flex-direction:column;} .ruler-tick.top .bar{height:7px;width:2px;margin-bottom:3px;}' +
        '.ruler-tick.bottom{flex-direction:column-reverse;} .ruler-tick.bottom .bar{height:7px;width:2px;margin-top:3px;}';
    document.head.appendChild(style);
    rulerEl = document.createElement('div');
    rulerEl.id = 'screenRuler';
    document.body.appendChild(rulerEl);
}
function w2s(v) { const n = v.clone().project(camera); return { x: (n.x * 0.5 + 0.5) * rulerW, y: (-n.y * 0.5 + 0.5) * rulerH, behind: n.z > 1 }; }
// 屏幕像素坐标 → 地面(Y=0)上的真实 3D 点：用于判断边框标尺某个数字离相机到底有多远
function screenToGround(sx, sy) {
    const ndcX = (sx / rulerW) * 2 - 1;
    const ndcY = -(sy / rulerH) * 2 + 1;
    const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    if (Math.abs(dir.y) < 1e-6) return null; // 视线几乎平行地面（地平线附近）→ 视为过远，不显示
    const tHit = -camera.position.y / dir.y;
    if (tHit <= 0) return null;
    return camera.position.clone().add(dir.multiplyScalar(tHit));
}
// 线段 P0-P1（屏幕像素）与视口四边相交点
function segRectHits(P0, P1) {
    const res = [];
    const tryEdge = (fixed, vertical, t) => {
        if (t < 0 || t > 1) return;
        let x, y;
        if (vertical) { x = fixed; y = P0.y + t * (P1.y - P0.y); if (y < 0 || y > rulerH) return; }
        else { y = fixed; x = P0.x + t * (P1.x - P0.x); if (x < 0 || x > rulerW) return; }
        res.push({ edge: vertical ? (fixed <= 0 ? 'left' : 'right') : (fixed <= 0 ? 'top' : 'bottom'), x, y });
    };
    if (P1.x !== P0.x) { tryEdge(0, true, (0 - P0.x) / (P1.x - P0.x)); tryEdge(rulerW, true, (rulerW - P0.x) / (P1.x - P0.x)); }
    if (P1.y !== P0.y) { tryEdge(0, false, (0 - P0.y) / (P1.y - P0.y)); tryEdge(rulerH, false, (rulerH - P0.y) / (P1.y - P0.y)); }
    return res;
}
function addRulerTick(edge, x, y, text, col) {
    // 同一条边框上去重：避免偏航角任意时两条网格线在角落处贴出重叠标签（看着像幽灵数字）。
    const pos = (edge === 'left' || edge === 'right') ? y : x;
    if (rulerLastTick[edge] !== null && Math.abs(pos - rulerLastTick[edge]) < 16) return;
    rulerLastTick[edge] = pos;
    const el = document.createElement('div');
    el.className = 'ruler-tick';
    el.style.color = col;
    if (edge === 'left') { el.style.left = '0px'; el.style.top = y + 'px'; el.style.transform = 'translateY(-50%)'; }
    else if (edge === 'right') { el.style.right = '0px'; el.style.top = y + 'px'; el.style.transform = 'translateY(-50%)'; }
    else if (edge === 'top') { el.style.top = '0px'; el.style.left = x + 'px'; el.style.transform = 'translateX(-50%)'; }
    else { el.style.bottom = '0px'; el.style.left = x + 'px'; el.style.transform = 'translateX(-50%)'; }
    const bar = document.createElement('span'); bar.className = 'bar';
    const num = document.createElement('span'); num.textContent = text;
    el.appendChild(bar); el.appendChild(num);
    rulerEl.appendChild(el);
}
function updateScreenRuler() {
    if (!showTicks) { if (rulerEl) rulerEl.style.display = 'none'; return; }
    ensureRulerEl();
    rulerW = renderer.domElement.clientWidth;
    rulerH = renderer.domElement.clientHeight;
    // 仅在原点坐标轴完全不可见时才显示边框标尺：坐标读数由原点轴上的数字刻度承担；
    // 原点一旦回到屏幕内（坐标轴可见），边框标尺自动隐藏，避免重复。
    const o = new THREE.Vector3(0, 0, 0).project(camera);
    const sx = (o.x * 0.5 + 0.5) * rulerW, sy = (-o.y * 0.5 + 0.5) * rulerH;
    const onScreen = o.z <= 1 && sx >= 0 && sx <= rulerW && sy >= 0 && sy <= rulerH;
    if (onScreen) { rulerEl.style.display = 'none'; return; }
    rulerEl.style.display = 'block';
    // 节流：相机位置/朝向、视口尺寸、主题未变则不重建
    const key = camera.position.toArray().join(',') + '|' + controls.target.toArray().join(',') + '|' + camera.quaternion.toArray().join(',') + '|' + rulerW + 'x' + rulerH + '|' + (document.body.classList.contains('light-mode') ? 'L' : 'D');
    if (key === lastRulerKey) return;
    lastRulerKey = key;
    rulerEl.innerHTML = '';
    rulerLastTick = { left: null, right: null, top: null, bottom: null };
    const dist = framingDist(); // 边框标尺与原点轴/网格一致：精细度由等效轨道半径决定（正交下机位被拉远，需归一化）
    const p = computeGridParams(dist);
    const cx = Math.round(controls.target.x / p.step) * p.step;
    const cz = Math.round(controls.target.z / p.step) * p.step;
    // 边框标尺：每个网格线都在屏幕边框处标一个数字，使「数字数量 == 网格线数量」（不再比网格少一倍）
    const labelStep = p.step;
    // X/Z 标尺标签使用各自坐标轴的颜色（与原点坐标轴一致），避免偏航角非 90° 倍数时
    // 网格斜穿屏幕、X 值被标到 Z 边框（或反之）造成的「串轴/幽灵数字」误读。
    const colX = '#ff6666', colZ = '#66aaff';
    // 距离过滤：距相机超过 maxShowDist 的网格线标签不显示。避免抬头看时，
    // 接近地平线的远处网格线在屏幕边框上挤一堆、随视角滑动（“一堆数字在移动”）的问题。
    const camPos = camera.position;
    const maxShowDist = p.actualMax * 1.5;
    // 象限过滤：原点轴不可见时，只显示「摄像机本象限」相邻半轴（+X/-X、+Z/-Z）的刻度数字。
    // 例如摄像机在 (+X,+Z) 象限，则只标 +X、+Z 方向的刻度，避免四象限数字全堆在边框上造成干扰。
    const camSx = camera.position.x >= 0 ? 1 : -1;
    const camSz = camera.position.z >= 0 ? 1 : -1;
    // 常数 X 线（沿 Z 延伸）：在边框处标 X 值
    const k0x = Math.ceil((cx - p.actualMax) / labelStep), k1x = Math.floor((cx + p.actualMax) / labelStep);
    for (let k = k0x; k <= k1x; k++) {
        const x = k * labelStep;
        if (Math.sign(x) !== camSx) continue; // 仅显示摄像机本象限相邻的 X 半轴刻度
        if (Math.abs(x - cx) > p.actualMax) continue;
        const A = new THREE.Vector3(x, 0, cz - p.actualMax), B = new THREE.Vector3(x, 0, cz + p.actualMax);
        const sa = w2s(A), sb = w2s(B);
        if (sa.behind || sb.behind) continue;
        segRectHits(sa, sb).forEach(h => {
            const wp = screenToGround(h.x, h.y);
            if (!wp || framingDist(wp) > maxShowDist) return; // 远处（近地平线）数字：隐藏（距离同样按等效口径）
            addRulerTick(h.edge, h.x, h.y, formatTick(x, p.step), colX);
        });
    }
    // 常数 Z 线（沿 X 延伸）：在边框处标 Z 值
    const k0z = Math.ceil((cz - p.actualMax) / labelStep), k1z = Math.floor((cz + p.actualMax) / labelStep);
    for (let k = k0z; k <= k1z; k++) {
        const z = k * labelStep;
        if (Math.sign(z) !== camSz) continue; // 仅显示摄像机本象限相邻的 Z 半轴刻度
        if (Math.abs(z - cz) > p.actualMax) continue;
        const A = new THREE.Vector3(cx - p.actualMax, 0, z), B = new THREE.Vector3(cx + p.actualMax, 0, z);
        const sa = w2s(A), sb = w2s(B);
        if (sa.behind || sb.behind) continue;
        segRectHits(sa, sb).forEach(h => {
            const wp = screenToGround(h.x, h.y);
            if (!wp || framingDist(wp) > maxShowDist) return; // 远处（近地平线）数字：隐藏（距离同样按等效口径）
            addRulerTick(h.edge, h.x, h.y, formatTick(z, p.step), colZ);
        });
    }
}

// 射线检测与点击选择
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let clickTimer = null;
let lastClickedBlock = null;
// 区分「空白处点击」与「空白处拖动摄像机」：记录指针按下后是否发生过明显位移
let _downX = 0, _downY = 0, _canvasDragMoved = false;
// ★【2026-10-25 修复 · 用户投诉「每次移动/转动摄像机，对称面就自动消失」】
//   旧判据只看 `_canvasDragMoved`，而它只在 pointermove 里 `e.buttons` 为真时才置位；
//   某些输入路径（触控板轻推、指针捕获丢失、快速微推、按下点与释放点之间没有 pointermove）
//   会让它一直是 false，于是拖完摄像机松手产生的 click 被当成「空白处点击」
//   ⇒ 清空选区 ⇒ 镜像自动结束 ⇒ 对称面消失。
//   这里再加一道「按下点 → 释放点」的实际距离判据：只要移动超过 6px 就绝不当成点击。
const CANVAS_CLICK_SLOP = 6;
function canvasClickWasDrag(e) {
    if (_canvasDragMoved) return true;
    if (!e || typeof e.clientX !== 'number') return false;
    return Math.hypot(e.clientX - _downX, e.clientY - _downY) > CANVAS_CLICK_SLOP;
}
function onCanvasClick(event) {
    if (event.target.closest('.data-panel') || event.target.closest('.top-bar') || event.target.closest('.new-top-bar') || event.target.closest('.side-block-list')) return;
    // ★「点」的拾取优先于方块：点只在画笔模式下可见，命中点即切换它的选中状态（供两点矩形/三点平行四边形生成）。
    if (isBrushMode && ptMarkers.length) {
        const ptMeshes = ptMarkers.filter(p => p.mesh && p.mesh.visible).map(p => p.mesh);
        const ptHits = ptMeshes.length ? raycaster.intersectObjects(ptMeshes, false) : [];
        if (ptHits.length) {
            const pt = ptMarkers.find(p => p.mesh === ptHits[0].object);
            if (pt) { ptToggleSelect(pt.id); return; }
        }
    }
    if (draggingGizmo || pendingInputPick) return;
    if (gizmoDragJustEnded) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    blocks.forEach(b => { if (b.mesh) b.mesh.updateMatrixWorld(true); });
    const isKfMode = (isNewLayoutMode && isKeyframeMode) || (!isNewLayoutMode && keyframeWindowOpen);
    /* ★★【2026-10-14 P0 修复 · 用户投诉「Gizmo 根本改不动 xpos/basepos」的真根因】
       旧实现：`blocks.filter(b => !isBlockInHiddenGroup(b) && (!isKfMode || hasKeyframeAnimation(b.id)))`
       —— 动画模式(关键帧模式)下**只把"已有关键帧的方块"放进拾取列表**。后果链（真浏览器实测确认）：
         ① 用户想给一个新方块做动画：它在画布上点方块本体 → 该块没有关键帧 ⇒ 不在 allMeshes 里
            ⇒ `hits.length === 0` ⇒ 落进下方「点击空白处」分支 ⇒ **selectedBlocksSet 被清空**（实测 1→0）；
         ② `updateToolbar()` 里 `ok = !!selected() || !!selectedFolder` → 变 false ⇒
            **整个 #herTransformToolbar 被 display:none 隐藏** ⇒ Gizmo 手柄消失；
         ③ 用户再想拖动就完全没有手柄；即便靠 ❒/API 临时选中，下一画布点击又被打回。
       结论：这不是"写入被拦"，而是**选中根本建立不起来** ⇒ Gizmo 无从谈起（xpos/xbasepos 都改不动）。
       修复：关键帧模式也允许拾取**任意未被隐藏的方块**（隐藏块仍排除）。选中后
       `toggleBlockSelection` → `selectBlock` → `updateToolbar` 会正常显示工具栏与 Gizmo；
       下方 `selectKeyframeBlock(...)` 调用原本就有 `keyframeData.has(block.id)` 守卫，无需改动。

       ★★★【2026-10-18 r33 · 用户投诉「关键帧动画模式为啥可以选中没添加到动画列表中的方块」】
       上一条把拾取放宽到"任意未隐藏方块"确实偏宽：**没加入动画列表的方块也能被点中并选中**，
       于是时间表把它当编辑对象、浮动窗还给它补一条「未添加」幽灵轨道（35201 那段兜底）。
       现在门禁换成正确的资格判据 `kfBlockIsInAnimation()`（= 已加入动画列表），注意它**不等于**
       `hasKeyframeAnimation()`：后者要求"真的录了帧"，而「刚用 ❒ 选择器加入、还是 0 帧空轨道」的方块
       必须照样可选中（否则上面 ① 的 Gizmo 消失 P0 会复活）。两条路径因此同时成立：
         · 已加入（含 0 帧）→ 可点选 → Gizmo 正常；
         · 未加入 → 点选**不改动选区**（保住当前选中，绝不能走下面的清空分支）、不建空轨道，只提示加入入口。
       拾取列表仍保持"任意未隐藏方块"：靠过滤列表做门禁会让 hits 变空 → 落进清空分支，反而更糟。 */
    const allMeshes = blocks.filter(b => !isBlockInHiddenGroup(b)).flatMap(b => b.getMeshes());
    const hits = raycaster.intersectObjects(allMeshes);
    if (hits.length) {
        const hit = hits[0].object;
        const block = blocks.find(b => b.getMeshes().includes(hit));
        if (block && !isBlockInHiddenGroup(block)) {
            // ★ r33：关键帧动画模式下，未加入动画列表的方块不可选中（口径 = isKeyframeSelectableBlock）
            if (isKfMode && _kfSystemReady && !isKeyframeSelectableBlock(block)) {
                if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
                lastClickedBlock = null;
                showToast('该方块尚未加入动画列表 · 请先用关键帧窗口标题栏的「❒」选择器加入，加入后即可选中编辑');
                return;
            }
            const isMulti = kfIsMultiGesture(event);   // ★【2026-10-18】含「多选锁定」开关（触屏无键盘设备可用）
            if (isMulti) {
                if (clickTimer !== null) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                toggleBlockSelection(block, true);
            } else if (clickTimer !== null && lastClickedBlock === block) {
                toggleBlockSelection(block, true);
                clearTimeout(clickTimer);
                clickTimer = null;
                lastClickedBlock = null;
                if (keyframeWindowOpen && keyframeData.has(block.id)) {
                    selectKeyframeBlock(block.id);
                }
            } else {
                if (clickTimer !== null) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                lastClickedBlock = block;
                clickTimer = setTimeout(() => {
                    toggleBlockSelection(block, false);
                    clickTimer = null;
                    lastClickedBlock = null;
                    if (keyframeWindowOpen && keyframeData.has(block.id)) {
                        selectKeyframeBlock(block.id, false, true);
                    }
                }, 200);
            }
        }
    } else if (!kfIsMultiGesture(event)) {
        // 点击空白处（未命中任何方块）。
        // ★【2026-10-19 修复】原判据只认 event.ctrlKey ⇒ 开着「多选锁定」或按着手机虚拟 Ctrl 时，
        //   点一下空白画布会把辛苦攒起来的整批多选直接清空（锁定语义“等同一直按着 Ctrl”被破坏）。
        //   统一改用 kfIsMultiGesture：与 Ctrl 按住时的行为一致 —— 不清空选区。
        // 区分「在空白处拖动摄像机」与「明确的空白处点击」：拖动过（移动超过阈值）
        // 视为摄像机旋转/平移操作，不取消选中，否则用户想转视角却把方块给取消了。
        if (canvasClickWasDrag(event)) {
            if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
            lastClickedBlock = null;
            return;
        }
        // ★【2026-10-25】镜像（对称面）进行中：空白处点击【不】清空选区。
        //   镜像的唯一出口是气泡「取消」/ Esc / 改选别的方块 —— 绝不能因为一次落空的手势
        //   就把整个对称面连同预览一起销毁（用户投诉的「转个视角就消失」就是这条路径）。
        if (mirrorActive) {
            if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
            lastClickedBlock = null;
            return;
        }
        // 真正的空白处点击 → 取消所有选中（新旧操作模式均生效）
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        lastClickedBlock = null;
        selectedBlocksSet.clear();
        kfExplicitPickIds.clear();   // 全清时同步重置“亲手点选”集合，避免残留 id 在后续选中同名块时被误判成显式点选
        selectBlock(null);
        renderVariablesForBlock(null);
        updateDropdownSelection();
    }
}
