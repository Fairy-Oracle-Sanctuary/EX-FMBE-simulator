/* 09-tutorial/03-steps-and-actions.js · 源 测试版v.6b79.html 第 49017-50262 行 */
'use strict';
// ---- 渲染当前步骤卡片 ----
// ============ 教程引擎：纯动作模式（教程自演 + 自动放行） ============
let tutDemoRunning = false, tutDemoSince = 0;
/* ============================================================
 * 步骤级「真实 3D 场景动画」（2026-10-17 用户要求）
 * ------------------------------------------------------------
 * 讲「底层定义」光靠文字不直观 —— 进入这类步骤时，直接在真实 3D 场景里
 * 把演示方块的变量按时间连续改写（走 b.refresh()），画布上就能看到动画：
 * 绕枢轴公转 / 自转 / 缩放 / 基准偏移 … 边讲边播。
 * 步骤上写 demo:'名字' 即启用；离开该步自动停止，并把方块还原到进入前的数值
 * （不还原会污染后续步骤的基线/门控）。与 act（点「帮我做」才执行）互不干扰。
 * ============================================================ */
const TUT_ANIM = {
    // 枢轴 = 旋转中心：方块绕枢轴公转（写第二层旋转 rotatey），枢轴点本身不动
    pivot: { dur: 7000, vars: ['v.rotatey'], tick: (b, p) => { setConstVarValue(b, 'v.rotatey', _r4(p * 360)); } },
    // 位置：枢轴连同方块一起左右平移（与「局部位移」对照）
    posMove: { dur: 6000, vars: ['v.xpos'], tick: (b, p) => { setConstVarValue(b, 'v.xpos', _r4(1.6 * Math.sin(p * Math.PI * 2))); } },
    // 局部位移 + rot 变化：basepos 固定有值，rot 连续转 ⇒ 方块绕枢轴画圈（位移跟着方块自身朝向）
    rotBasepos: { dur: 8000, vars: ['v.xbasepos', 'v.yrot'], tick: (b, p) => { setConstVarValue(b, 'v.xbasepos', 1.2); setConstVarValue(b, 'v.yrot', _r4(p * 360)); } },
    // 第二层旋转：rot 固定倾斜，rotate 沿世界 Y 轴再转一次（rot 之后的再旋转）
    rotateAfterRot: { dur: 8000, vars: ['v.xrot', 'v.rotatey'], tick: (b, p) => { setConstVarValue(b, 'v.xrot', 20); setConstVarValue(b, 'v.rotatey', _r4(p * 360)); } },
    // 局部旋转：方块绕自身轴自转（改外观朝向 xrot/yrot/zrot，位置不动）
    localRot: { dur: 6000, vars: ['v.xrot', 'v.yrot', 'v.zrot'], tick: (b, p) => { setConstVarValue(b, 'v.xrot', _r4(p * 360)); } },
    // 全局旋转：绕世界轴 / 枢轴公转 —— 与局部旋转对照，看清 rot 与 rotate 的差别
    globalRot: { dur: 7000, vars: ['v.rotatex', 'v.rotatey', 'v.rotatez'], tick: (b, p) => { setConstVarValue(b, 'v.rotatey', _r4(p * 360)); } },
    // 整体缩放：绕枢轴点原地放大缩小
    scalePulse: { dur: 5000, vars: ['v.scale'], tick: (b, p) => { setConstVarValue(b, 'v.scale', _r4(1 + 0.6 * Math.sin(p * Math.PI * 2))); } },
    // 基准偏移：在局部坐标系里位移（跟随方块的自身朝向）
    basepos: { dur: 6000, vars: ['v.xbasepos', 'v.ybasepos', 'v.zbasepos'], tick: (b, p) => { setConstVarValue(b, 'v.xbasepos', _r4(2 * Math.sin(p * Math.PI * 2))); } },
    // 关键帧插值原理：0 秒在 A 点、1 秒在 B 点，中间自动过渡（演示位置连续变化）
    kfLerp: { dur: 4000, vars: ['v.xpos', 'v.zpos'], tick: (b, p) => { setConstVarValue(b, 'v.xpos', _r4(-2 + 4 * p)); } },
};
let tutAnimRAF = null, tutAnimSnap = null, tutAnimName = null;
// 观测钩子（探针用）：当前在播哪个讲解动画、是否在跑、挂在哪块方块、各变量当前值
function tutAnimInfo() {
    const b = tutAnimSnap && tutAnimSnap.block;
    let vals = null;
    try {
        const def = TUT_ANIM[tutAnimName];
        if (b && def && def.vars) { vals = {}; def.vars.forEach(k => { vals[k] = tvnum(b, k); }); }
    } catch (e) {}
    return { name: tutAnimName, raf: !!tutAnimRAF, block: b ? b.id : null, vals: vals };
}
// 停止动画并还原到进入本步前的数值
function tutAnimStop() {
    if (tutAnimRAF) { cancelAnimationFrame(tutAnimRAF); tutAnimRAF = null; }
    tutAnimName = null;
    if (tutAnimSnap) {
        const b = tutAnimSnap.block;
        try {
            if (b && blocks.includes(b)) {
                tutAnimSnap.vals.forEach((kv) => { try { setConstVarValue(b, kv[0], kv[1]); } catch (e) {} });
                b.refresh();
            }
        } catch (e) {}
        tutAnimSnap = null;
    }
    tutAnimFocusClear();                        // 取消未执行完的「可见性补拍」
    tutAnimRectCache = null;                    // 可见带缓存作废（下一步重新量）
    try { tutAnimRestoreCam(); } catch (e) {}   // 离开该步：机位还原到进入前（不还原会把后续步骤的视角也带歪）
}

/* ============================================================
 * 讲解动画的「可见性保证」——用户反馈：动画根本不管方块是否被 UI 遮住（2026-10-17）。
 * 旧行为：直接在被选中的方块上播动画，但旧操作模式下底部工具行 + 变量面板（280px）
 * + 教程卡片预留带（--tut-band）会盖掉屏幕下方一大块，方块默认正好落在被盖住的区域里
 * ⇒ 动画在遮挡物背后空转 / 只在面板边缘抖出来一角（用户口中的「雷霆动画」）。
 * 做法：进步骤时先量出「真正没被 UI 盖住」的画布矩形（elementFromPoint 粗采样），
 * 再把方块投影到屏幕；若不在该矩形内，就把相机整机平移（连同 controls.target，
 * 不改朝向 / 缩放 / 变焦）把方块挪到可见带中心；离开该步再把机位还原。
 * ============================================================ */
let tutAnimCamRAF = null, tutAnimCamHome = null;

// 教程自身的「点击守卫 / 遮罩」（.ex-tut-guard 挂在 body 下的 #exTutGuardLayer，.ex-tut-shade 挂在 exTutRoot）
// 覆盖整个画布，elementFromPoint 永远先命中它们 ⇒ 采样前必须临时摘掉它们的点击命中。
// 注意：守卫只是把画布压暗（仍看得见方块），不算「遮挡」，所以这里只是让它别挡采样。
function tutAnimGuardSuppress(on) {
    document.querySelectorAll('.ex-tut-guard, .ex-tut-shade').forEach(el => {
        try {
            if (on) { el.dataset.tutPe = el.style.pointerEvents || ''; el.style.pointerEvents = 'none'; }
            else { el.style.pointerEvents = el.dataset.tutPe || ''; delete el.dataset.tutPe; }
        } catch (e) {}
    });
}
// 该屏幕点是否落在「没被 UI 遮挡」的画布上
function tutAnimPointFree(x, y) {
    const cv = document.getElementById('canvas-container');
    const gl = (typeof renderer !== 'undefined' && renderer && renderer.domElement) || null;
    if (!cv || !gl) return false;
    let ok = false;
    tutAnimGuardSuppress(true);
    try { const el = document.elementFromPoint(x, y); ok = (el === gl || el === cv); } catch (e) {}
    tutAnimGuardSuppress(false);
    return ok;
}

// 量出画布上真正可见的矩形：采样点只有命中 WebGL canvas 本体才算「没被遮挡」
function tutAnimVisibleRect() {
    const cv = document.getElementById('canvas-container');
    const gl = (typeof renderer !== 'undefined' && renderer && renderer.domElement) || null;
    if (!cv || !gl) return null;
    const r = cv.getBoundingClientRect();
    if (r.width < 60 || r.height < 60) return null;
    const NX = 15, NY = 15, cw = r.width / NX, ch = r.height / NY;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, hit = 0;
    tutAnimGuardSuppress(true);
    try {
        for (let i = 0; i < NX; i++) {
            for (let j = 0; j < NY; j++) {
                const x = r.left + (i + 0.5) * cw, y = r.top + (j + 0.5) * ch;
                const el = document.elementFromPoint(x, y);
                // 命中画布本体 ⇒ 该点没被遮挡；命中别的元素（面板 / 教程卡片 / 工具条）⇒ 视为被遮挡
                if (el !== gl && el !== cv) continue;
                hit++;
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
        }
    } catch (e) {}
    tutAnimGuardSuppress(false);
    if (hit < 3 || minX === Infinity) return null;
    // 采样只取到格子中心，向外各补半格，得到可见带的近似矩形
    const b = { left: minX - cw / 2, right: maxX + cw / 2, top: minY - ch / 2, bottom: maxY + ch / 2 };
    return (b.right - b.left >= 60 && b.bottom - b.top >= 60) ? b : null;
}

// 把方块的世界位置投影到画布像素坐标（画布铺满窗口，但坐标一律按 CSS 像素算，与 getBoundingClientRect 同口径）
function tutAnimBlockScreen(b) {
    if (!b || !b.mesh || typeof camera === 'undefined' || !camera || typeof renderer === 'undefined' || !renderer) return null;
    const gl = renderer.domElement;
    const W = gl.clientWidth || gl.width, H = gl.clientHeight || gl.height;
    if (!W || !H) return null;
    const wp = new THREE.Vector3(); b.mesh.getWorldPosition(wp);
    const n = wp.clone().project(camera);
    return { x: (n.x + 1) / 2 * W, y: (1 - n.y) / 2 * H, wp: wp, W: W, H: H };
}

// 平移相机整机（camera.position 与 controls.target 同步位移）：只挪构图，不改朝向 / 缩放
function tutAnimCamTween(toPos, toTarget, ms, done) {
    if (tutAnimCamRAF) { cancelAnimationFrame(tutAnimCamRAF); tutAnimCamRAF = null; }
    if (typeof camera === 'undefined' || !camera || typeof controls === 'undefined' || !controls) { try { if (done) done(); } catch (e) {} return; }
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    const dur = Math.max(1, ms || 1), st = performance.now();
    const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);   // easeInOutQuad
    const step = (now) => {
        const u = Math.min(1, (now - st) / dur), e = ease(u);
        try {
            camera.position.lerpVectors(p0, toPos, e);
            controls.target.lerpVectors(t0, toTarget, e);
            camera.lookAt(controls.target);
        } catch (err) {}
        if (u < 1) { tutAnimCamRAF = requestAnimationFrame(step); }
        else { tutAnimCamRAF = null; try { if (done) done(); } catch (e) {} }
    };
    tutAnimCamRAF = requestAnimationFrame(step);
}

// 确保被讲解的方块落在可见带里；已在带内（留 28px 余量）就不动机位
let tutAnimFocusDbg = null;   // 观测用（探针）
function tutAnimFocusBlock(b) {
    tutAnimFocusDbg = { called: true, reason: '', rect: null, sp: null };
    if (typeof camera === 'undefined' || !camera || typeof controls === 'undefined' || !controls) { tutAnimFocusDbg.reason = 'no-camera'; return false; }
    const rect = tutAnimVisibleRect(); tutAnimFocusDbg.rect = rect;
    if (!rect) { tutAnimFocusDbg.reason = 'no-rect'; return false; }
    tutAnimRectCache = rect;               // 顺手喂给每帧跟踪用的缓存（它自己重采样太重）
    const sp = tutAnimBlockScreen(b); tutAnimFocusDbg.sp = sp ? { x: sp.x, y: sp.y } : null;
    if (!sp) { tutAnimFocusDbg.reason = 'no-sp'; return false; }
    const cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2, m = 28;
    if (sp.x > rect.left + m && sp.x < rect.right - m && sp.y > rect.top + m && sp.y < rect.bottom - m) { tutAnimFocusDbg.reason = 'already-inside'; return false; }
    // 屏幕像素 ↔ 世界单位的换算：k = 2·d·tan(fov/2) / (zoom·画布高)
    const d = Math.max(0.001, camera.position.distanceTo(sp.wp));
    const k = 2 * d * Math.tan((camera.fov * Math.PI / 180) / 2) / ((camera.zoom || 1) * sp.H);
    const right = new THREE.Vector3(), up = new THREE.Vector3();
    camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    // 符号推导（once 搞对，勿再翻）：相机整机平移 +V ⇒ 画面反向位移。
    // 屏幕 x 位移 = -(V·right)/k，屏幕 y 位移（向下为正）= +(V·up)/k。
    // 要让方块从 (sp.x, sp.y) 落到带中心 (cx, cy)：V·right = k·(sp.x-cx)，V·up = k·(cy-sp.y)。
    const V = new THREE.Vector3()
        .addScaledVector(right, (sp.x - cx) * k)
        .addScaledVector(up, (cy - sp.y) * k);
    // 机位只记录一次（进入讲解动画前的原始机位），后续步骤恢复都以它为准，不会累积漂移
    if (!tutAnimCamHome) tutAnimCamHome = { pos: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom, fromScreen: { x: sp.x, y: sp.y } };
    tutAnimCamTween(camera.position.clone().add(V), controls.target.clone().add(V), 420);
    return true;
}

// ★进入步骤那一刻，底部工具行 / 变量面板 / 教程卡片往往还没布好
// （tutRender 里一打字就调 tutAnimStart，DOM 与 let位带都还在上一帧的状态），
// 此时量出来的「可见区」可能是假的（甚至是全屏）⇒ 方块被判 already-inside 而不挪机位
// ⇒ 动画照旧在面板背后空转。故：先立即试一次，再补拍几帧（200/600ms）直到真的落在带内。
let tutAnimFocusTimers = [];
function tutAnimFocusClear() {
    tutAnimFocusTimers.forEach((t) => { try { clearTimeout(t); } catch (e) {} });
    tutAnimFocusTimers = [];
}
function tutAnimFocusSchedule(b) {
    tutAnimFocusClear();
    [0, 200, 600].forEach((ms) => {
        tutAnimFocusTimers.push(setTimeout(() => {
            try { if (tutAnimName) tutAnimFocusBlock(b); } catch (e) {}
        }, ms));
    });
}

/* ------------------------------------------------------------
 * 「始终聚焦」：动画每帧都在改方块的世界坐标（pivot/basepos 等会让方块绕枢轴公转甚至整体
 * 平移出画布），只在进步骤时挪一次机位 ⇒ 方块很快又飘出可见带（用户二次反馈原话：
 * 「那个摄像机要始终聚焦在被展示的方块上」）。故在 rAF 循环里每帧做一次轻量跟踪。
 * 三个设计要点：
 *   ① 可见带不每帧重采样（225 次 elementFromPoint 太重）⇒ 缓存 + 每 20 帧刷新一次；
 *   ② 留 dead zone（约带短边的 22%，最小 12px），否则会把公转的弧线感压成原地抖动；
 *   ③ 每帧只补 14% 的超出量（平滑跟随、不硬拉）；正在跑「进步骤/还原」补间时不抢。
 * ---------------------------------------------------------- */
let tutAnimRectCache = null, tutAnimTrackI = 0;
function tutAnimTrack(b) {
    if (tutAnimCamRAF) return;   // 正在做「进步骤 / 还原」补间：不抢
    if (typeof camera === 'undefined' || !camera || typeof controls === 'undefined' || !controls) return;
    tutAnimTrackI++;
    let rect = tutAnimRectCache;
    if (!rect || tutAnimTrackI % 20 === 0) { const r = tutAnimVisibleRect(); if (r) { tutAnimRectCache = rect = r; } }
    if (!rect) return;
    const sp = tutAnimBlockScreen(b); if (!sp) return;
    const cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2;
    const halfW = Math.max(24, (rect.right - rect.left) / 2), halfH = Math.max(24, (rect.bottom - rect.top) / 2);
    const dz = Math.max(12, Math.min(halfW, halfH) * 0.22);   // dead zone：带中心这一圈内不追
    const dx = sp.x - cx, dy = sp.y - cy;
    let ex = 0, ey = 0;
    if (Math.abs(dx) > dz) ex = dx - Math.sign(dx) * dz;
    if (Math.abs(dy) > dz) ey = dy - Math.sign(dy) * dz;
    if (!ex && !ey) return;                                    // 还在 dead zone 里：不动机位（保留动画弧线感）
    // 屏幕像素 ↔ 世界单位换算与符号，与 tutAnimFocusBlock 完全同一套（见那里的推导注释）
    const d = Math.max(0.001, camera.position.distanceTo(sp.wp));
    const k = 2 * d * Math.tan((camera.fov * Math.PI / 180) / 2) / ((camera.zoom || 1) * sp.H);
    const right = new THREE.Vector3(), up = new THREE.Vector3();
    camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    const fix = new THREE.Vector3()
        .addScaledVector(right, ex * k)
        .addScaledVector(up, -ey * k)
        .multiplyScalar(0.14);
    if (!tutAnimCamHome) tutAnimCamHome = { pos: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom, fromScreen: { x: sp.x, y: sp.y } };
    try {
        camera.position.add(fix);
        controls.target.add(fix);
        camera.lookAt(controls.target);
    } catch (e) {}
}

// 机位还原到进入讲解动画前的原始机位（tutAnimStop 调用）
function tutAnimRestoreCam(ms) {
    const home = tutAnimCamHome; if (!home) return;
    if (typeof camera === 'undefined' || !camera || typeof controls === 'undefined' || !controls) { tutAnimCamHome = null; return; }
    tutAnimCamTween(home.pos.clone(), home.target.clone(), ms == null ? 320 : ms, () => { tutAnimCamHome = null; });
}
// 播放本步的讲解动画（循环，直到离开该步）
function tutAnimStart(name) {
    tutAnimStop();
    const def = TUT_ANIM[name]; if (!def) return;
    let b = (selectedBlock && !(selectedBlock.scope && selectedBlock.scope.molangMode)) ? selectedBlock : null;
    // 没有可写的普通方块时，让 Gizmo 教学同款函数兜底（必要时新建一块非 molang 方块）：
    // molang 方块不能直写变量（会被 program 覆盖），讲解动画必须挂在普通方块上。
    if (!b) { try { b = TUT_ACT.tutEnsureNormalBlock(); } catch (e) { b = null; } }
    if (!b) { try { b = tutEnsureBody(); } catch (e) { b = null; } }
    if (!b) return;
    try { if (selectedBlock !== b) selectBlock(b); } catch (e) {}
    const vals = (def.vars || []).map(k => [k, tvnum(b, k)]);
    tutAnimSnap = { block: b, vals: vals };
    tutAnimName = name;
    try { b.refresh(); } catch (e) {}             // 先把方块摆到它自己的位置，再做可见性判断
    try { tutAnimFocusSchedule(b); } catch (e) {} // 被底部面板 / 卡片挡住时先挪机位，保证动画真的看得见
    const t0 = performance.now();
    const step = (now) => {
        try { def.tick(b, ((now - t0) / (def.dur || 6000)) % 1); b.refresh(); } catch (e) {}
        try { tutAnimTrack(b); } catch (e) {}    // ★每帧跟踪：动画会让方块持续移动，机位必须跟着走
        tutAnimRAF = requestAnimationFrame(step);
    };
    tutAnimRAF = requestAnimationFrame(step);
}
function tutRunDemo(st) {
    if (!st) return;
    // 若上一次演示因 act 长时间不返回而残留“执行中”，超过 8s 强制解锁，避免「帮我做」永久点不动
    if (tutDemoRunning) {
        if (Date.now() - tutDemoSince < 8000) return;
        console.warn('[tutorial] 上一次演示超时未结束，已强制解锁');
        tutDemoRunning = false;
    }
    tutDemoSince = Date.now();
    try { tutAnimStop(); } catch (e) {}   // 「帮我做」接管后停掉讲解动画，避免两者同时改同一个方块
    const acts = Array.isArray(st.act) ? st.act : [];
    if (!acts.length) return;
    tutDemoRunning = true;
    const card = document.querySelector('#exTutRoot .ex-tut-card'); if (!card) { tutDemoRunning = false; return; }
    const stbar = card.querySelector('.ex-tut-status');
    const btDemo = card.querySelector('.tut-demo');
    if (stbar) { stbar.textContent = '▶ 正在执行…'; stbar.classList.remove('ok', 'err'); }
    if (btDemo) { btDemo.disabled = true; btDemo.textContent = '执行中…'; }
    (async () => {
        // 先自愈环境（切回新操作模式 / 关键帧模式 / 工具菜单），再执行动作
        try { tutRecoverEnv(st); } catch (e) { console.warn('tutRecoverEnv failed', e); }
        let failed = false, failMsg = '';
        for (const name of acts) {
            const fn = TUT_ACT && TUT_ACT[name];
            // 未注册 / 抛错的 act 不再硬失败卡死步骤：跳过并告警，便于后续补齐 handler；
            // 已有注册的 act（旧教程三章）行为不变。纯 act 步骤会因 ok=true 正常放行，
            // 带 check 的步骤仍由真实完成度复核，不会因跳过而误放行。
            if (typeof fn !== 'function') { console.warn('[tutorial] act 未注册，已跳过:', name); continue; }
            try { await fn(); }
            catch (e) { console.warn('[tutorial] act 执行异常，已跳过:', name, e); continue; }
        }
        if (failed) {
            if (stbar) { stbar.textContent = '✗ 执行失败：' + failMsg; stbar.classList.add('err'); }
            showToast('演示执行失败：' + failMsg);
        } else {
            // 放行：有 check 的步骤复核 check 是否真的通过；只有 act 的步骤由演示完成直接放行
            let ok = true;
            if (typeof st.check === 'function') { try { ok = !!st.check(); } catch (e) { ok = false; } }
            if (ok) {
                tutStepDone = true; tutApplyUI();   // 文案交给 tutApplyUI（统一为「完成任务进入下一关」+ 绿色）
                // 明确指出「已通过、请点下一步」：否则状态条与未通过时文字一样，用户以为没反应
                if (stbar) { stbar.textContent = '已完成，点「下一步 →」'; stbar.classList.add('ok'); }
            } else if (stbar) {
                // 未通过也要有可见反馈：告诉用户动作已执行但条件还没满足
                stbar.textContent = '还没通过：按上面的说明再操作一次';
                stbar.classList.remove('ok'); stbar.classList.add('err');
            }
        }
        tutDemoRunning = false;
        if (btDemo) { btDemo.disabled = false; btDemo.textContent = '帮我做'; }
    })();
}
let tutStepDone = false, tutTimer = null;
let tutBody = null; // 练习里“身体”块引用
function tutSetNewLayout(v) { isNewLayoutMode = v; try { applyNewLayoutMode(); } catch (e) {} try { renderSideBlockList(); } catch (e) {} }
function tutSettingsOpen() { const p = document.getElementById('uiSettingsPanel'); return !!p && p.style.display !== 'none'; }
function tutOpenSettings() {
    const ab = document.getElementById('actionMenuBtn');
    if (ab) { try { ab.click(); } catch (e) {} const item = document.querySelector('#actionDropdown .top-dropdown-item[data-action="settings"]'); if (item) { try { item.click(); } catch (e) {} return; } }
    const b = document.getElementById('uiSettingsBtn'); if (b) { b.click(); return; }
    const p = document.getElementById('uiSettingsPanel'); if (p) p.style.display = '';
}
// 目标选择器是否落在「设置面板」内（不受可见性影响，仅解析 DOM 层级）——用于决定是否自动开面板
function tutTargetInSettings(sel) {
    if (!sel) return false;
    try { const el = document.querySelector(sel); return !!(el && el.closest && el.closest('#uiSettingsPanel')); } catch (e) { return false; }
}
// 把设置面板内的目标滚入可见区（设置面板 .ui-settings-scroll 可滚动；目标很长时用户看不到也会被聚光框漏标）
function tutScrollSettingsTarget(st) {
    if (!st) return;
    const sels = [st.target].concat(Array.isArray(st.thenTarget) ? st.thenTarget : (st.thenTarget ? [st.thenTarget] : []));
    let el = null;
    for (const s of sels) { try { const e = document.querySelector(s); if (e && e.closest && e.closest('#uiSettingsPanel')) { el = e; break; } } catch (e2) {} }
    if (!el) return;
    const p = document.getElementById('uiSettingsPanel');
    if (!p || p.style.display === 'none') return;
    // 分类导航（第 18 轮）：目标可能落在非当前分类页里（如 #newLayoutSetting / #pivotLinkSetting 属「编辑」、#grayscaleSetting 属「视图」），
    // 先切到目标所属分类，否则元素被 .ui-settings-cat-off 隐藏，scrollIntoView 与聚光框都会落空。
    try {
        const grp = el.closest && el.closest('.ui-settings-group');
        if (grp) uiSettingsShowCategory(grp.getAttribute('data-cat') || 'ui');
    } catch (e) {}
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) {}
}
function tutBlocks() { return (blocks && blocks.length) || 0; }
function tutClearPoll() { if (tutTimer) { clearInterval(tutTimer); tutTimer = null; } }
function tutSaveProgress() { tutSave({ chapter: tutChapter, step: tutStep, ts: Date.now() }); }
function tutTick() {
    const ch = EX_TUT_CHAPTERS[tutChapter]; if (!ch) return;
    const st = ch.steps[tutStep]; if (!st) return;
    // 自愈：本步需要选中方块却因误点文件夹/空白导致没有可编辑方块时，自动恢复身体块，避免卡关
    try { tutEnsureStepSelection(st); } catch (e) {}
    // 自愈：本步要求处于旧/新操作模式或关键帧模式时，周期性扳回（用户切走模式会直接卡关）
    try { tutEnsureMode(st); } catch (e) {}
    if (typeof st.check !== 'function') return;   // 无门控步骤：只做自愈，不判完成
    let ok = false; try { ok = !!st.check(); } catch (e) {}
    if (ok && !tutStepDone) { tutStepDone = true; tutApplyUI(); }
    // 持续刷新聚光：部分高亮目标（如设置按钮）依赖布局类切换后才可见，需在可见后补点亮
    try { tutLayout(); } catch (e) {}
}
function tutApplyUI() {
    const root = document.getElementById('exTutRoot'); if (!root) return;
    const card = root.querySelector('.ex-tut-card'); if (!card) return;
    const next = card.querySelector('.tut-next');
    const stbar = card.querySelector('.ex-tut-status');
    if (next) {
        if (tutStepDone) { next.disabled = false; next.classList.add('ready'); next.style.opacity = '1'; }
        else { next.disabled = true; next.classList.remove('ready'); next.style.opacity = '.45'; }
    }
    // 文案只保留一句「完成任务进入下一关」；完成与否用绿色状态条表示，不再堆长句。
    if (stbar) {
        stbar.textContent = '完成任务进入下一关';
        stbar.classList.toggle('ok', !!tutStepDone);
    }
}
// ---- 步骤完成度检测：动作类步骤必须「用户真的做了」或点「帮我做」后才放行下一步 ----
let tutStepBaseline = null;
let tutUnlinkPivotBase = null; // 「枢轴不联动」步：枢轴(pos)基线，用于检测用户在联动关闭后真的拖过枢轴
function tutRecordBaseline() {
    const b = tutBody || tutFirstBody();
    if (!b) { tutStepBaseline = null; return; }
    // k='xpos' → 'v.xpos' + 'v.xbasepos'（注意 basepos 变量名是 v.xbasepos，不是 v.xposbasepos）
    const wx = (k) => (tvnum(b, 'v.' + k) + tvnum(b, 'v.' + k[0] + 'basepos'));
    tutStepBaseline = {
        id: b.id,
        x: wx('xpos'), y: wx('ypos'), z: wx('zpos'),
        rx: tvnum(b, 'v.rotatex') || 0, ry: tvnum(b, 'v.rotatey') || 0, rz: tvnum(b, 'v.rotatez') || 0,
        lx: tvnum(b, 'v.xrot') || 0, ly: tvnum(b, 'v.yrot') || 0, lz: tvnum(b, 'v.zrot') || 0,
        s: tvnum(b, 'v.scale') || 1
    };
}
function tutMovedFromBaseline(minDist) {
    if (!tutStepBaseline) return false;
    const b = blocks.find(x => x.id === tutStepBaseline.id); if (!b) return false;
    const wx = (k) => (tvnum(b, 'v.' + k) + tvnum(b, 'v.' + k[0] + 'basepos'));
    const dx = wx('xpos') - tutStepBaseline.x, dy = wx('ypos') - tutStepBaseline.y, dz = wx('zpos') - tutStepBaseline.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) >= (minDist || 0.15);
}
function tutRotatedFromBaseline(minDeg) {
    if (!tutStepBaseline) return false;
    const b = blocks.find(x => x.id === tutStepBaseline.id); if (!b) return false;
    // 局部旋转 Gizmo 写 v.xrot/yrot/zrot，全局旋转写 v.rotatex/y/z —— 两组都计入
    const dr = Math.abs((tvnum(b, 'v.rotatex') || 0) - tutStepBaseline.rx)
            + Math.abs((tvnum(b, 'v.rotatey') || 0) - tutStepBaseline.ry)
            + Math.abs((tvnum(b, 'v.rotatez') || 0) - tutStepBaseline.rz)
            + Math.abs((tvnum(b, 'v.xrot') || 0) - tutStepBaseline.lx)
            + Math.abs((tvnum(b, 'v.yrot') || 0) - tutStepBaseline.ly)
            + Math.abs((tvnum(b, 'v.zrot') || 0) - tutStepBaseline.lz);
    return dr >= (minDeg || 5) * Math.PI / 180;
}
function tutScaledFromBaseline(minDelta) {
    if (!tutStepBaseline) return false;
    const b = blocks.find(x => x.id === tutStepBaseline.id); if (!b) return false;
    return Math.abs((tvnum(b, 'v.scale') || 1) - (tutStepBaseline.s || 1)) >= (minDelta || 0.08);
}
// 「枢轴不联动」步专用：检测用户在「枢轴联动模型」关闭后真的拖动过枢轴（v.xpos/ypos/zpos 变化）。
// 注意不能用 tutMovedFromBaseline——不联动拖枢轴时 basepos 反向补偿、模型视觉位置不变。
// 基线自愈：联动仍开 / 换了方块 / 刚进入本步时重新记录，之后才比较位移。
function tutPivotDraggedUnlinked(minDist) {
    const b = tutBody || tutFirstBody(); if (!b) return false;
    const px = tvnum(b, 'v.xpos'), py = tvnum(b, 'v.ypos'), pz = tvnum(b, 'v.zpos');
    if (pivotLinkModel) { tutUnlinkPivotBase = { id: b.id, px, py, pz }; return false; }
    if (!tutUnlinkPivotBase || tutUnlinkPivotBase.id !== b.id) { tutUnlinkPivotBase = { id: b.id, px, py, pz }; return false; }
    const dx = px - tutUnlinkPivotBase.px, dy = py - tutUnlinkPivotBase.py, dz = pz - tutUnlinkPivotBase.pz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) >= (minDist || 0.2);
}
function tutMaterialOpen() { const m = document.querySelector('.material-menu'); return !!m && (m.style.display === 'block' || (typeof getComputedStyle !== 'undefined' && getComputedStyle(m).display !== 'none')); }
// 系统初始化自动创建的默认占位块（id='Cube'、未改动、未分组）：空场景里自动出现，不是用户/教程所建。
// 教程开始时会把它清掉；清掉之后「同一签名」就不再视为占位块 —— 这一点很关键：
// 用户手动「+ → 方块」建出的第一块，id 恰好也叫 'Cube'、姿态也是默认值，若一直按签名排除，
// 就会出现「用户手动做对了、门控却不放行」的隐藏坑。
let tutPlaceholderCleared = false;
function tutIsDefaultPlaceholder(b) {
    if (tutPlaceholderCleared) return false;
    try {
        if (!b || b.id !== 'Cube' || b.group != null || b.type !== 'cube' || b.materialType !== 'color' || b._boneParent) return false;
        const m = b.scope.toM(), dm = [0, 0, 0, 0, 0, 0, 1, 1, -90, 0, 0, 0, 0];
        for (let k = 0; k < 13; k++) if (Math.abs(Number(m[k]) - dm[k]) > 1e-6) return false;
        return true;
    } catch (e) { return false; }
}
function tutManCount() {
    // 小人块总数 = 场景里所有「用户/教程建的方块」（排除系统默认占位块）。
    // 不能只数 group==='小人'：第 2 章身体是未分组状态；也不能只数 id==='cube1'：
    // 用户手动「+ → 方块」建出的第一块叫 'Cube' —— 只认这两者会导致手动做对了也不放行。
    try { return blocks.filter(b => !tutIsDefaultPlaceholder(b)).length; } catch (e) { return 0; }
}
function tutBlockCount() { try { return blocks.length; } catch (e) { return 0; } }
function tutBodyInFolder() { const b = tutBody || tutFirstBody(); return !!(b && b.group === '小人'); }
function tutBoundCount() {
    const body = tutBody || tutFirstBody(); if (!body) return 0;
    try { return blocks.filter(b => b.group === '小人' && b.id !== body.id && (typeof getBoneParentId === 'function' ? getBoneParentId(b) === body.id : false)).length; } catch (e) { return 0; }
}
function tutKfFrameAt(t) { const e = (typeof boneKeyframes !== 'undefined') ? boneKeyframes.get('小人') : null; return !!(e && e.frames && e.frames.has(t)); }
function tutBackboneSet() { const f = getFolder('小人'); return !!(f && f._backbone); }
// ---- 环境自愈：无论用户此前切了旧模式 / 关掉菜单 / 进错关键帧模式，都先把界面恢复到本步所需基准状态 ----
function ensureToolsMenuOpen() {
    const btn = document.getElementById('outlinerToolsBtn');
    const menu = document.getElementById('outlinerToolsMenu');
    if (!btn || !menu) return;
    if (!menu.classList.contains('open')) { try { btn.click(); } catch (e) {} }
}
// 教程步骤若需要「已选中方块」，但当前选中为空 / 文件夹 / 错位（selectedBlocksSet 残留旧块）时，
// 恢复为身体块，避免新手在 Gizmo 步因误点文件夹或空白处导致卡关——
// 表现为：控件（变量面板）残留上一个方块的数据、却没有任何方块可被编辑，门控永远不满足。
const TUT_TOOLBAR_RE = /^#herTransformToolbar|^#localRotMenuBtn|^#globalRotMenuBtn/;
// 项目管理器内部目标（第 9 章）：需要先 backToProjectList() 才会有可见矩形
const TUT_PM_RE = /^#(pmProjectGrid|pm-body|projectSaveNowBtn|projectClearBtn|projectBackBtn|projectSaveStatus|projectNameInput|projectNameApplyBtn|pmProjectCount)/;
function tutEnsureStepSelection(st) {
    if (!st) return;
    const needsBlock = (st.target && TUT_TOOLBAR_RE.test(st.target)) || st.canvas ||
        (Array.isArray(st.act) && st.act.some(n => typeof n === 'string' && /^(gizmo|pivot|rotate|shift|body|worldAxis|ensureBody|newModeNormalBlock)/.test(n)));
    if (!needsBlock) return;
    // 教程每一步都是单块编辑：先清掉可能残留的多选集合 —— 否则 selected() 会返回集合里的旧块，
    // 造成「工具栏 / Gizmo 绑错块、变量面板却是身体块」的错位，用户拖 Gizmo 不动身体 = 卡关。
    if (selectedBlocksSet.size > 0) { try { selectedBlocksSet.clear(); } catch (e) {} }
    let cur = selected();
    // selected() 返回的块若已不在场景（换项目 / 旧块被删），同样按「无选中」处理
    if (cur && !selectedFolder && !blocks.includes(cur)) cur = null;
    const curIsBlock = cur && !selectedFolder;
    if (curIsBlock) return;            // 已有可编辑方块选中：不干扰用户操作
    const tb = tutEnsureBody();
    if (!tb) return;
    try { selectBlock(tb); } catch (e) {}
    try { if (typeof updateToolbar === 'function') updateToolbar(true); } catch (e) {}
}
// ★2026-10-17（用户反馈：教程没限制用户处于哪个模式，用户切模式后本步所需的 UI/目标消失 → 无法交互卡关）：
// 每轮轮询（tutTick）复核并自动扳回本步要求的操作模式与关键帧模式——即使快捷键/设置被绕过也能自愈。
// 注意：这里**只做模式扳正**，不重跑 tutRecoverEnv 的全部副作用（否则会周期性把「模型旋转」等用户正在体验的子模式扳回去）。
function tutEnsureMode(st) {
    if (!st) return;
    let m = st.mode;
    if (!m && EX_TUT_CHAPTERS[tutChapter]) m = EX_TUT_CHAPTERS[tutChapter].mode;
    // ★freeMode：本步要用户亲手切模式（如「切到旧操作模式」）⇒ 不能锁模式。
    //   守卫循环每 260ms 调一次本函数，否则会把用户刚取消的勾又勾回去，这一步永远过不去（用户反馈：卡关）。
    if (!st.freeMode) {
        if (m === 'old' && isNewLayoutMode) { try { setNewLayoutMode(false); } catch (e) {} }
        else if (m === 'new' && !isNewLayoutMode) { try { setNewLayoutMode(true); } catch (e) {} }
    }
    // 目标落在关键帧窗口内的步骤（#kf…）：确保仍处于关键帧模式且时间轴窗口可见，否则目标全部不可见
    // ★例外 #kfModeGroup：它就是「编辑/画笔/动画」模式按钮本身，常被用作「点动画模式」的目标；
    //   若在这里自动 enterKeyframeMode，就会在上一步就替用户把模式切好，且会顺带清掉 Gizmo。
    if (st.target && /^#kf/.test(st.target) && st.target !== '#kfModeGroup') {
        if (!isKeyframeMode) { try { enterKeyframeMode(); } catch (e) {} }
        if (!keyframeWindowOpen) { try { openKeyframeWindow(); } catch (e) {} }
    }
}
function tutRecoverEnv(st) {
    if (!st) return;
    // ★第 1 章开篇：练习项目是空白场景，这里替用户放好一块方块并选中、把显示切到「位置」，
    //   用户第一步只需要看和读，不用先自己建方块/选方块（用户反馈：一上来就让人选太不合理）。
    // ★introAxes / introRings：位置显示与旋转显示**分开两步**打开（不能同时开——
    //   三根箭头和三个环都居中在方块上，同时显示会互相重叠、看起来乱成一团）。
    //   ★必须用 'origin'（位置 xpos/ypos/zpos）而不是 'base'（局部偏移 basepos）：
    //   本章开篇讲的是「变量改变、方块跟着动」，用户看到 base 的位移控件会问
    //   「为什么讲 pos 却用 basepos 的位移控件」。
    if (st.prep === 'introBlock' || st.prep === 'introAxes' || st.prep === 'introRings') {
        try {
            const _b = selectedBlock || tutEnsureBody();
            if (_b) {
                try { selectedBlocksSet.clear(); } catch (e) {}
                try { selectBlock(_b); } catch (e) {}
            }
            if (st.prep === 'introRings') {
                herModes.clear(); herModes.add('rotate');
            } else if (st.prep === 'introAxes') {
                herModes.clear(); herModes.add('origin');
            } else if (!herModes.has('origin') && !herModes.has('base') && !herModes.has('rotate') && !herModes.has('scale')) {
                herModes.add('origin');
            }
            try {
                document.querySelectorAll('.her-mode-btn').forEach(x => x.classList.toggle('active', herModes.has(x.dataset.mode)));
                rebuildGizmo();
                // 重建后立刻套用相机自适应缩放，否则这一步的第一帧箭头会以 scale=1 巨大显示一下
                try { syncGizmo(); } catch (e) {}
            } catch (e) {}
        } catch (e) {}
    }
    // ★模式回落（2026-10-16）：mode 可以写在**章**上（整章统一模式），也可以写在**步**上（逐步覆盖）。
    //   tutRecoverEnv 只认 st.mode，若步骤没写就回落到所属章的 mode，否则整章声明会被忽略。
    if (!st.mode && EX_TUT_CHAPTERS[tutChapter] && EX_TUT_CHAPTERS[tutChapter].mode) {
        st.mode = EX_TUT_CHAPTERS[tutChapter].mode;
    }
    // 1) 按本步声明的操作模式把界面扳正：mode==='old' 切旧模式，mode==='new' 切新模式；
    //    未声明则不强行改动，保持用户当前模式（旧教程强制新模式的逻辑已移除）。
    if (st.mode === 'old' && isNewLayoutMode) {
        try { setNewLayoutMode(false); } catch (e) { try { isNewLayoutMode = false; applyNewLayoutMode(); renderSideBlockList(); } catch (e2) {} }
    } else if (st.mode === 'new' && !isNewLayoutMode) {
        try { setNewLayoutMode(true); } catch (e) { try { isNewLayoutMode = true; applyNewLayoutMode(); renderSideBlockList(); } catch (e2) {} }
    }
    // 2) 关键帧模式核对（kf: 'in' 需要已进入 / 'out' 需要已退出）
    if (st.kf === 'in' && !isKeyframeMode) { try { enterKeyframeMode(); } catch (e) {} }
    if (st.kf === 'out' && isKeyframeMode) { try { exitKeyframeMode(); } catch (e) {} }
    // 进入关键帧模式后确保时间轴窗口可见（否则后续步骤的 target 找不到）
    if (st.kf === 'in' && !keyframeWindowOpen) { try { openKeyframeWindow(); } catch (e) {} }
    // 3) 工具菜单（openMenu: true 时本步目标在菜单内）
    if (st.openMenu) { ensureToolsMenuOpen(); }
    // 3.5) 本步目标在设置面板内时，确保面板已打开：否则面板关闭→目标不可见（无聚光洞），
    //      且若入口按钮被挡，用户会完全无法手动开启设置面板（见 TUT_PASS_SEL 注释）。
    //      打开后再把目标滚入可见区，处理「面板被划到下面、目标看不见」的情况。
    if ((st.target && tutTargetInSettings(st.target)) || (Array.isArray(st.thenTarget) && st.thenTarget.some(tutTargetInSettings))) {
        try { if (!tutSettingsOpen()) tutOpenSettings(); } catch (e) {}
    }
    // 3.7) 目标在项目管理器里时，先打开项目列表（2026-10-16）。
    //      #pmProjectGrid / #projectSaveNowBtn / #projectClearBtn / #projectBackBtn 全在
    //      #projectManager 内，而它默认 display:none ⇒ rect 0×0 ⇒ 无引导框（第 9 章实测 0/6 的真因）。
    if (st.target && typeof TUT_PM_RE !== 'undefined' && TUT_PM_RE.test(st.target)) {
        // ★只显示项目管理器浮层，**绝不能**调 backToProjectList()：
        //   它会切换屏幕（落盘 + 清 currentProjectId + 隐藏编辑器），教程 root/卡片会被一并拆掉
        //   （实测 card/root true->false、tutActive true->false）。这里只要那个浮层可见即可。
        try {
            if (projectManagerEl) {
                if (projectManagerEl.style.display === 'none') projectManagerEl.style.display = 'flex';
                if (projectManagerEl.style.visibility === 'hidden') projectManagerEl.style.visibility = 'visible';
            }
        } catch (e) {}
    }
    // Gizmo 实操段目标（新工具栏及其子按钮 / 旋转下拉按钮）：这些步骤需要「已选中方块」才有可见目标，
    // 且入场要强制恢复新操作模式默认基线（见 3.6）。
    // 3.6) Gizmo 实操段（target 在新工具栏上）强制恢复「新操作模式默认基线」：
    //      正常旋转（非模型旋转）、枢轴联动模型开（默认）、世界轴位移关。无论用户此前把设置改成什么，
    //      教程都从同一基准讲起；世界轴位移「开启后的效果」由后面的进阶步骤单独教学。
    if (st.target && TUT_TOOLBAR_RE.test(st.target)) {
        try {
            // 模型旋转子选项 → 扳回正常旋转（教程默认从正常旋转讲起）
            if (herModes.has('centerRotate')) { herModes.delete('centerRotate'); herModes.add('rotate'); }
            if (herModes.has('globalCenterRotate')) { herModes.delete('globalCenterRotate'); herModes.add('globalRotate'); }
        } catch (e) {}
        try {
            // 「枢轴联动模型」基线强制：仅在未到达「关闭联动」教学步（pivotLinkOff 步）之前生效。
            // 一旦用户在教学中真正关闭了它，后续步骤不得再把它偷偷扳回开启（用户实测反馈：关了又自己变回去）。
            const _pIdx = EX_TUT_CHAPTERS[tutChapter].steps.findIndex(s => Array.isArray(s.act) && s.act.indexOf('pivotLinkOff') >= 0);
            if (!pivotLinkModel && !(_pIdx >= 0 && tutStep > _pIdx)) {
                pivotLinkModel = true;
                try { localStorage.setItem('ui_pivot_link_model', '1'); } catch (e) {}
                const pc = document.getElementById('pivotLinkCheckbox');
                if (pc) { pc.classList.add('checked'); pc.setAttribute('aria-pressed', 'true'); }
            }
        } catch (e) {}
        try {
            // 「世界轴位移」基线强制：位移箭头默认跟局部轴，所以 Gizmo 段一律先扳回「关」。
            // 但一旦到了「世界轴位移·开启」教学步之后，不得再把它偷偷扳回关闭
            // （否则刚教用户打开、下一步又自己关掉——与枢轴联动同一类 bug）。
            const _wIdx = EX_TUT_CHAPTERS[tutChapter].steps.findIndex(s => Array.isArray(s.act) && s.act.indexOf('worldAxisOn') >= 0);
            if (useWorldAxisDisplacement && !worldAxisDispForced && !(_wIdx >= 0 && tutStep > _wIdx)) {
                useWorldAxisDisplacement = false; userWorldAxisPref = false;
                const wc = document.getElementById('worldAxisDispCheckbox');
                if (wc) { wc.classList.remove('checked'); wc.setAttribute('aria-pressed', 'false'); }
            }
        } catch (e) {}
    }
    // 4) 部分高亮目标需「已选中方块」才可见（变换工具栏及其子按钮 / 旋转下拉 / 材质按钮），
    //    预先选中身体使落到的那一步立刻出现紫色光圈，且符合步骤文案「选中身体」的预期
    if ((st.target && TUT_TOOLBAR_RE.test(st.target)) || st.target === '#viewMenuBtn') {
        try {
            const tb = tutEnsureBody();
            if (tb) {
                try { selectedBlocksSet.clear(); } catch (e) {}   // 清掉可能残留的多选旧块，避免 selected() 返回错位块导致 Gizmo 绑错对象
                try { selectBlock(tb); } catch (e) {} try { if (typeof updateToolbar === 'function') updateToolbar(true); } catch (e) {}
            }
        } catch (e) {}
    }
    // 4.5) 进入「枢轴不联动」两步（关开关 / 拖枢轴演示）时重置枢轴基线，防止上一次教程运行/上一步残留的 pos 位移直接放行门控
    if (st.act && (st.act.indexOf('pivotLinkOff') >= 0 || st.act.indexOf('pivotDragDemo') >= 0)) {
        try { tutUnlinkPivotBase = null; } catch (e) {}
    }
    // 5) 进入「枢轴模式」教学步时，先把 origin 模式清掉并保留一个非 origin 模式（rotate）。
    //    否则 selectBlock 触发的 updateToolbar() 在「无任何模式」会兜底补回 origin，使门控“没做就放行”。
    if (st.act && st.act.indexOf('pivotMode') >= 0) {        try {
            herModes.delete('origin');
            if (!herModes.has('base') && !herModes.has('rotate') && !herModes.has('centerRotate') && !herModes.has('globalRotate') && !herModes.has('globalCenterRotate') && !herModes.has('scale')) herModes.add('rotate');
            document.querySelectorAll('.her-mode-btn').forEach(b => b.classList.toggle('active', herModes.has(b.dataset.mode)));
            rebuildGizmo();
        } catch (e) {}
    }
    // 6) 画笔教学步：进入时先切到「与本步骤目标相反」的状态，保证本步确实需要用户/演示去切换，
    //    否则（如笔刷已开时来到「关闭画笔」步）门控会一直满足、无需动手。
    if (st.act && st.act.indexOf('brushOn') >= 0) { try { if (typeof isBrushMode !== 'undefined' && isBrushMode) exitBrushMode(); } catch (e) {} }
    if (st.act && st.act.indexOf('brushOff') >= 0) { try { if (typeof isBrushMode === 'undefined' || !isBrushMode) enterBrushMode(); } catch (e) {} }
    // 6.5) 开关类教学步的「入场反向复位」：这两步要求用户/演示亲手扳动开关，
    //      若跳步进来时开关已处于目标态，门控会「没做就放行」。所以入场先扳到相反状态。
    if (st.act && st.act.indexOf('worldAxisOn') >= 0) {
        try {
            if (useWorldAxisDisplacement || worldAxisDispForced) {
                useWorldAxisDisplacement = false; userWorldAxisPref = false; worldAxisDispForced = false;
                const wc = document.getElementById('worldAxisDispCheckbox');
                if (wc) { wc.classList.remove('checked'); wc.setAttribute('aria-pressed', 'false'); }
            }
        } catch (e) {}
    }
    if (st.act && st.act.indexOf('pivotLinkOff') >= 0) {
        try {
            if (!pivotLinkModel) {
                pivotLinkModel = true;
                try { localStorage.setItem('ui_pivot_link_model', '1'); } catch (e) {}
                const pc = document.getElementById('pivotLinkCheckbox');
                if (pc) { pc.classList.add('checked'); pc.setAttribute('aria-pressed', 'true'); }
            }
        } catch (e) {}
    }
    // 7) Gizmo 教学步：先准备好「非 molang」教学方块并选中（Gizmo 对 molang 块被拦截），
    //    基线在 tutRender 末段记录，此刻 tutBody 已指向教学方块，位移/旋转/缩放门控才能盯对块。
    if (st.act && st.act.some(n => typeof n === 'string' && n.indexOf('gizmo') === 0)) {
        try { TUT_ACT.tutEnsureNormalBlock(); } catch (e) {}
    }
    // ★注意（2026-10-16 踩坑）：这里**不能**自动打开 `.modal` 类浮层（新建方块面板 / 导出面板 /
    //   导入面板 / 批量替换弹窗）—— tutLayout 有一条既有规则：
    //     「有 .modal 可见且目标在浮层之外 ⇒ 主动收起聚光框」，自动开浮层反而会把引导框压没
    //     （实测第 1 章聚光覆盖从 6/6 掉到 2/6）。正确做法是把 target 指向当前模式下真实可见的入口，
    //     并靠 thenTarget 链在用户点开下拉后把聚光跟到菜单项。
}
// ---- 模式教程专用助手：确保某方块处于 molang 接管（幂等）----
function tutEnsureMolangOn(b) {
    if (!b) return false;
    try { selectBlock(b); } catch (e) {}
    if (b.scope.molangMode) return true;
    try { b.scope.program = (typeof generateMolangBaseline === 'function') ? generateMolangBaseline(b) : ''; } catch (e) { b.scope.program = ''; }
    b.scope.molangMode = true;
    b.scope.molangEditedByUser = false;
    try { b.refresh(); } catch (e) {}
    try { if (selectedBlock) renderVariablesForBlock(selectedBlock); } catch (e) {}
    return true;
}
// ★2026-10-17（用户反馈：molang 教程割裂——「一开始明明有很多变量显示在那里，结果点『帮我做』就只剩一小串表达式」）：
// molang 接管后方块的所有变量都由基线一次性写进程序（v./t./q./math. 四类前缀），
// 「帮我做」绝不能把这一大段基线整段替换掉。这里统一改为「在末尾追加」：保留已有程序，只把示范语句追加到最后。
function tutAppendMolang(program, add) {
    const p = (program == null) ? '' : String(program);
    const a = (add == null) ? '' : String(add);
    if (!a) return p;
    const t = p.replace(/\s+$/, '');      // 去掉尾部空白，便于判断结尾是否已是分号
    if (!t) return a;                     // 原本就是空程序：直接写入示范语句
    return (t.slice(-1) === ';' ? t : t + ';') + '\n' + a;
}
// ---- 具名动作注册表：步骤数据通过 act:['name'] 引用；全部幂等自愈，可重复安全执行 ----
const TUT_ACT = {
    ensureBody() { const b = tutEnsureBody(); if (b) { try { selectBlock(b); } catch (e) {} } return b; },
    shiftShow() {
        const b = tutBody || tutFirstBody(); if (!b) return;
        try { selectBlock(b); } catch (e) {}
        // 演示「挪开一点即可」，不回弹——本步检测的就是“方块被移动过”，回弹反而通不过
        try { setConstVarValue(b, 'v.ypos', _r4(tvnum(b, 'v.ypos') + 0.6)); b.refresh(); } catch (e) {}
    },
    makeFolder() { if (!getFolder('小人')) { try { createFolder('小人'); } catch (e) {} } try { renderSideBlockList(); } catch (e) {} },
    putBodyInFolder() {
        const b = tutEnsureBody(); if (!b) return;
        b.group = '小人';
        if (!getFolder('小人')) { try { createFolder('小人'); } catch (e) {} }
        try { syncFolderBoneHierarchy(['小人']); } catch (e) {}
        try { refreshBlocksUnderFolder('小人'); } catch (e) {}
        try { renderSideBlockList(); } catch (e) {}
    },
    folderMoveShow() {
        try { selectFolder('小人'); } catch (e) {}
        // 演示整组平移后停在偏移处（与“挪开一点即可”一致）
        try { applyFolderMove('小人', new THREE.Vector3(1, 0, 0)); } catch (e) {}
    },
    arrangeMan() { try { tutArrangeMan(); } catch (e) {} },
    setBackbone() {
        const b = tutEnsureBody(); if (!b) return;
        b.group = '小人';
        if (!getFolder('小人')) { try { createFolder('小人'); } catch (e) {} }
        try { designateFolderBackbone('小人', b.id, true, false); } catch (e) {}
        try { renderSideBlockList(); } catch (e) {}
    },
    bindKids() { try { tutBindAll(); } catch (e) {} },
    bodyDragShow() {
        const b = tutBody || tutFirstBody(); if (!b) return;
        try { selectBlock(b); } catch (e) {}
        // 演示“父骨骼带动子骨骼”：身体抬起后停住，四肢跟着一起动（不回弹）
        try { setConstVarValue(b, 'v.ypos', _r4(tvnum(b, 'v.ypos') + 0.8)); b.refresh(); refreshBoneFollowers(b); } catch (e) {}
    },
    rotateShow() {
        const b = tutBody || tutFirstBody(); if (!b) return;
        try { selectBlock(b); } catch (e) {}
        // 演示绕枢轴旋转：转过约 17° 后停住（本步检测“被旋转过”）
        try { setConstVarValue(b, 'v.rotatey', _r4(tvnum(b, 'v.rotatey') + 0.3)); b.refresh(); refreshBoneFollowers(b); } catch (e) {}
    },
    toolsOpen() { ensureToolsMenuOpen(); },
    kfEnter() { try { enterKeyframeMode(); } catch (e) {} try { openKeyframeWindow(); } catch (e) {} },
    kf0() {
        try { if (!isKeyframeMode) enterKeyframeMode(); } catch (e) {}
        try { if (!keyframeWindowOpen) openKeyframeWindow(); } catch (e) {}
        try { keyframeCurrentTime = 0; } catch (e) {}
        try { recordBoneKeyframe('小人', 0); } catch (e) {}
    },
    kfJump() {
        try { if (!isKeyframeMode) enterKeyframeMode(); } catch (e) {}
        try { if (!keyframeWindowOpen) openKeyframeWindow(); } catch (e) {}
        try { applyFolderMove('小人', new THREE.Vector3(1.2, 0, 0)); } catch (e) {}
        try { keyframeCurrentTime = 0.5; } catch (e) {}
        try { recordBoneKeyframe('小人', 0.5); } catch (e) {}
    },
    kfPlay() {
        try { if (!keyframeWindowOpen) openKeyframeWindow(); } catch (e) {}
        try { startKeyframePlayback(); } catch (e) {}
        setTimeout(() => { try { stopKeyframePlayback(); } catch (e) {} }, 2600);
    },
    finish() { try { tutSave({ done: 1, ts: Date.now() }); } catch (e) {} try { showToast('教程完成，你已掌握三种操作模式。练习项目保存在「新手教程·练习」项目'); } catch (e) {} },
    openMaterial() {
      try { const b = tutEnsureBody(); if (b) { try { selectBlock(b); } catch (e) {} } } catch (e) {}
      try {
        const vb = document.getElementById('viewMenuBtn');
        if (vb) vb.click();
        const item = document.querySelector('#viewDropdown .top-dropdown-item[data-view-action="material"]');
        if (item) item.click();
        else { const mb = document.getElementById('materialPresetBtn'); if (mb) mb.click(); }
      } catch (e) { try { const mb = document.getElementById('materialPresetBtn'); if (mb) mb.click(); } catch (e2) {} }
    },
    pivotMode() { const b = document.querySelector('#herTransformToolbar [data-mode="origin"]'); if (b) b.click(); },
    openSettings() {
        const ab = document.getElementById('actionMenuBtn');
        if (ab) {
            try { ab.click(); } catch (e) {}
            const item = document.querySelector('#actionDropdown .top-dropdown-item[data-action="settings"]');
            if (item) { try { item.click(); } catch (e) {} return; }
        }
        const b = document.getElementById('uiSettingsBtn'); if (b) b.click();
    },
    brushOn() { try { if (typeof isBrushMode === 'undefined' || !isBrushMode) enterBrushMode(); } catch (e) { try { enterBrushMode(); } catch (e2) {} } },
    brushOff() { try { if (typeof isBrushMode !== 'undefined' && isBrushMode) exitBrushMode(); } catch (e) {} },
    // —— 模式教程动作 ——
    toOldMode() { try { setNewLayoutMode(false); } catch (e) { try { isNewLayoutMode = false; applyNewLayoutMode(); renderSideBlockList(); } catch (e2) {} } },
    toNewMode() { try { setNewLayoutMode(true); } catch (e) { try { isNewLayoutMode = true; applyNewLayoutMode(); renderSideBlockList(); } catch (e2) {} } },
    ensureBlock() { const b = tutEnsureBody(); if (b) { try { selectBlock(b); } catch (e) {} try { renderVariablesForBlock(b); } catch (e) {} } },
    setVarNumber() {
        const b = selectedBlock || tutEnsureBody(); if (!b) return;
        try { selectBlock(b); } catch (e) {}
        try { setConstVarValue(b, 'v.xpos', 2); b.refresh(); } catch (e) {}
    },
    enableMolang() {
        let b = selectedBlock; if (!b) b = tutEnsureBody();
        if (!b) return;
        tutEnsureMolangOn(b);
    },
    writeConditional() {
        let b = selectedBlock; if (!b) b = tutEnsureBody();
        if (!b) return;
        tutEnsureMolangOn(b);
        b = selectedBlock; if (!b || !b.scope.molangMode) return;
        // ★2026-10-17（用户反馈）：改为「在既有基线末尾追加」，不再整段替换——保留方块的完整变量基线
        b.scope.program = tutAppendMolang(b.scope.program, 'v.xrot = q.rotation_to_camera(1) > 0 ? 90 : -90;');
        b.scope.molangEditedByUser = true;
        try { b.refresh(); } catch (e) {}
    },
    writeSequential() {
        let b = selectedBlock; if (!b) b = tutEnsureBody();
        if (!b) return;
        tutEnsureMolangOn(b);
        b = selectedBlock; if (!b || !b.scope.molangMode) return;
        // ★2026-10-17（用户反馈）：同上，改为末尾追加，保留方块已有的完整变量基线
        b.scope.program = tutAppendMolang(b.scope.program, 'v.xrot = 0;\nv.xrot = 90;');
        b.scope.molangEditedByUser = true;
        try { b.refresh(); } catch (e) {}
    },
    newModeNormalBlock() {
        try { setNewLayoutMode(true); } catch (e) { try { isNewLayoutMode = true; applyNewLayoutMode(); renderSideBlockList(); } catch (e2) {} }
        TUT_ACT.tutEnsureNormalBlock();
    },
    // —— Gizmo 教学共用：确保有一块「非 molang」方块被选中 ——
    // Gizmo 拖拽对 molang 块会被 gizmoMolangGuard 拦截；同时把 tutBody 指到这块，
    // 让位移/旋转/缩放基线（tutRecordBaseline）盯住教学方块而不是上一章遗留的 molang 块。
    tutEnsureNormalBlock() {
        let b = (selectedBlock && !(selectedBlock.scope && selectedBlock.scope.molangMode)) ? selectedBlock : null;
        if (!b) {
            const id = 'tutNormal_' + Date.now();
            try { b = new Block(id, [0, 0, 0, 0, 0, 0, 1, 1, -90, 0, 0, 0, 0], null, '#7dd3fc', 'cube', ''); addBlock(b, false, false); } catch (e) { b = null; }
            // ★打标记：这是「教程讲解/教学用的临时方块」，不是用户建的 ⇒
            //   ① 不能被当作小人身体（见 tutFirstBody/tutEnsureBody）；② 教程结束后要删掉，
            //   否则它会留在场景里变成用户口中「没删的方块」（2026-10-17 用户反馈）。
            if (b) b._tutNormal = true;
        }
        if (b) {
            tutBody = b;
            try { selectBlock(b); } catch (e) {}
            try { renderVariablesForBlock(b); } catch (e) {}
        }
        return b;
    },
    // 切换 Gizmo 模式：局部/全局旋转在子菜单里（data-her-mode），其余是工具栏按钮（data-mode）
    gizmoMode(name) {
        const item = document.querySelector('#localRotDropdown [data-her-mode="' + name + '"], #globalRotDropdown [data-her-mode="' + name + '"]');
        if (item) { try { item.click(); } catch (e) {} return; }
        const btn = document.querySelector('#herTransformToolbar [data-mode="' + name + '"]');
        if (btn) { try { btn.click(); } catch (e) {} }
    },
    gizmoMove() {
        const b = TUT_ACT.tutEnsureNormalBlock(); if (!b) return;
        TUT_ACT.gizmoMode('base');
        // 与真实位移 Gizmo 一致：位移写基准偏移 basepos，不改 pos
        try { setConstVarValue(b, 'v.ybasepos', _r4(tvnum(b, 'v.ybasepos') + 0.6)); b.refresh(); } catch (e) {}
    },
    // 「世界轴位移」教学（第二步）：切到位移模式并在世界轴已开启的前提下沿世界 X 挪一段。
    // 名字以 gizmo 开头 → tutRecoverEnv 会自动准备好非 molang 教学方块并选中。
    gizmoWorldAxis() {
        const b = TUT_ACT.tutEnsureNormalBlock(); if (!b) return;
        TUT_ACT.gizmoMode('base');
        try { setConstVarValue(b, 'v.xbasepos', _r4(tvnum(b, 'v.xbasepos') + 0.6)); b.refresh(); } catch (e) {}
    },
    gizmoScale() {
        const b = TUT_ACT.tutEnsureNormalBlock(); if (!b) return;
        TUT_ACT.gizmoMode('scale');
        try { setConstVarValue(b, 'v.scale', _r4((tvnum(b, 'v.scale') || 1) * 1.4)); b.refresh(); } catch (e) {}
    },
    gizmoRotLocal() {
        const b = TUT_ACT.tutEnsureNormalBlock(); if (!b) return;
        TUT_ACT.gizmoMode('rotate');
        try { setConstVarValue(b, 'v.xrot', _r4(tvnum(b, 'v.xrot') + 0.3)); b.refresh(); } catch (e) {}
    },
    gizmoRotGlobal() {
        const b = TUT_ACT.tutEnsureNormalBlock(); if (!b) return;
        TUT_ACT.gizmoMode('globalRotate');
        try { setConstVarValue(b, 'v.rotatex', _r4(tvnum(b, 'v.rotatex') + 0.3)); b.refresh(); } catch (e) {}
    },
    gizmoPivot() {
        const b = TUT_ACT.tutEnsureNormalBlock(); if (!b) return;
        TUT_ACT.gizmoMode('origin');
    },
    // 进阶教学：开启「世界轴位移」（默认关）。直接置变量并同步复选框 UI，走与点击处理器一致的同步方式；
    // 并写入 localStorage——与枢轴联动同理：教程里真开了就真的开，之后不会再被基线偷偷扳回关闭。
    worldAxisOn() {
        try { userWorldAxisPref = true; useWorldAxisDisplacement = true; worldAxisDispForced = false; } catch (e) {}
        try { localStorage.setItem('ui_world_axis_disp', '1'); } catch (e) {}
        const wc = document.getElementById('worldAxisDispCheckbox');
        if (wc) { wc.classList.add('checked'); wc.setAttribute('aria-pressed', 'true'); }
    },
    // 进阶教学 A：关闭「枢轴联动模型」。与真实开关一致写入 localStorage——
    // 用户反馈教程关掉后设置里又变回开启；此后它保持关闭，基线强制也不再扳回（见 tutRecoverEnv 3.6）。
    // 拖枢轴的演示在下一步 pivotDragDemo 中进行（本步只负责关开关）。
    pivotLinkOff() {
        try { pivotLinkModel = false; } catch (e) {}
        try { localStorage.setItem('ui_pivot_link_model', '0'); } catch (e) {}
        const pc = document.getElementById('pivotLinkCheckbox');
        if (pc) { pc.classList.remove('checked'); pc.setAttribute('aria-pressed', 'false'); }
    },
    // 进阶教学 B：在「不联动」前提下演示拖枢轴（setPivotKeepingModel = 官方公式，pos 变 + basepos 补偿、模型不动）
    pivotDragDemo() {
        const b = TUT_ACT.tutEnsureNormalBlock(); if (!b) return;
        TUT_ACT.gizmoMode('origin');
        try {
            const px = tvnum(b, 'v.xpos'), py = tvnum(b, 'v.ypos'), pz = tvnum(b, 'v.zpos');
            // 先记录拖拽前的枢轴基线，门控（tutPivotDraggedUnlinked）才能识别这次演示位移
            try { tutUnlinkPivotBase = { id: b.id, px, py, pz }; } catch (e) {}
            setPivotKeepingModel(b, new THREE.Vector3(_r4(px + 0.6), py, pz));
        } catch (e) {}
    },
    // —— 第 1~14 章新增功能补的 25 个具名动作（含 1 个内部取块helper）——
    // 取一个「非 molang」方块作为教学对象（保证关键帧 / molang 演示安全、可重复）
    tutKfBlock() {
        let b = (selectedBlock && !(selectedBlock.scope && selectedBlock.scope.molangMode)) ? selectedBlock : null;
        if (!b) b = TUT_ACT.tutEnsureNormalBlock();
        return b;
    },
    // 旧操作模式：molang 编辑器进阶——输入前缀弹候选（v）
    openMolangAndTypeV() {
        let b = selectedBlock; if (!b || b._boneParent) b = TUT_ACT.tutEnsureNormalBlock();
        if (!b) b = tutEnsureBody(); if (!b) return;
        selectedBlocksSet.clear();
        try { tutEnsureMolangOn(b); selectBlock(b); } catch (e) {}
        try { renderVariablesForBlock(b); } catch (e) {}
        const ta = document.getElementById('molangTextarea');
        if (ta) { try { ta.focus(); ta.value = 'v'; ta.setSelectionRange(1, 1); ta.dispatchEvent(new Event('input')); } catch (e) {} }
    },
    // 旧操作模式：点数字常量弹微调泡泡
    openMolangAndClickNumber() {
        let b = selectedBlock; if (!b || b._boneParent) b = TUT_ACT.tutEnsureNormalBlock();
        if (!b) b = tutEnsureBody(); if (!b) return;
        selectedBlocksSet.clear();
        try { tutEnsureMolangOn(b); } catch (e) {}
        b.scope.program = 'v.xrot = 90;'; b.scope.molangEditedByUser = true;
        try { b.refresh(); selectBlock(b); renderVariablesForBlock(b); } catch (e) {}
        const ta = document.getElementById('molangTextarea'); if (ta) { try { ta.focus(); } catch (e) {} }
        const toks = (typeof scanNumberTokens === 'function') ? scanNumberTokens(b.scope.program || '') : [];
        const tok = toks[0];
        if (tok) { try { mnbShow(b, tok, 0, 0); } catch (e) {} }
    },
    // 第4章 4.2 纯色：选中进多选集 + 设非默认纯色（修复「4.2 无法放行」：门控只读 selectedBlocksSet）
    applySolidColor() {
        let b = selectedBlock;
        if (!b || b._boneParent) b = TUT_ACT.tutEnsureNormalBlock();
        if (!b) b = tutEnsureBody(); if (!b) return;
        selectedBlocksSet.add(b);
        try { selectBlock(b); } catch (e) {}
        try { b.setSolidColor('#7dd3fc'); b.refresh(); b.updateSelectionHighlight(true); } catch (e) {}
    },
    // 第4章 4.5 六面独立贴图：给选中块设一个面贴图（演示六面独立）
    openFaceEditor() {
        let b = selectedBlock;
        if (!b || b._boneParent) b = TUT_ACT.tutEnsureNormalBlock();
        if (!b) b = tutEnsureBody(); if (!b) return;
        selectedBlocksSet.add(b);
        try { selectBlock(b); } catch (e) {}
        try { b.applyFaceTextures(['', '', '', '', 'oak_planks', ''], null); } catch (e) {}
    },
    // 第4章 4.6 本地上传：打开材质菜单并尽量打开贴图选择器（无门控，演示用）
    openTexturePickerUploadOnly() {
        try { TUT_ACT.openMaterial(); } catch (e) {}
        try { if (typeof showTexturePicker === 'function') showTexturePicker({ uploadOnly: true }); } catch (e) {}
    },
    // 第5章：把选中块加入动画系统（keyframeData 有记录）
    addSelectedToKeyframe() {
        try { if (!isKeyframeMode) enterKeyframeMode(); } catch (e) { try { isKeyframeMode = true; } catch (e2) {} }
        try { if (!keyframeWindowOpen) openKeyframeWindow(); } catch (e) {}
        const b = TUT_ACT.tutKfBlock(); if (!b) return;
        try { initKeyframeForBlock(b.id); } catch (e) {}
    },
    // 第5章：在 0 秒录关键帧
    recordKfAt0() {
        try { if (!isKeyframeMode) enterKeyframeMode(); } catch (e) {}
        try { if (!keyframeWindowOpen) openKeyframeWindow(); } catch (e) {}
        const b = TUT_ACT.tutKfBlock(); if (!b) return;
        try { initKeyframeForBlock(b.id); keyframeCurrentTime = 0; kfRecordUserFrame(b, 0, true); } catch (e) {}
    },
    // 第5章：在 1 秒录第二个关键帧（同一块 frames>=2）
    recordKfAt1() {
        try { if (!isKeyframeMode) enterKeyframeMode(); } catch (e) {}
        try { if (!keyframeWindowOpen) openKeyframeWindow(); } catch (e) {}
        const b = TUT_ACT.tutKfBlock(); if (!b) return;
        try { initKeyframeForBlock(b.id); keyframeCurrentTime = 1; kfRecordUserFrame(b, 1, true); } catch (e) {}
    },
    // 第5章：播放后停止（并直接把播放头推到 >0 让门控立即可过）
    kfPlayThenStop() {
        try { if (!keyframeWindowOpen) openKeyframeWindow(); } catch (e) {}
        try { keyframeCurrentTime = 0.5; } catch (e) {}
        try { startKeyframePlayback(); } catch (e) {}
        setTimeout(() => { try { stopKeyframePlayback(); } catch (e) {} }, 2600);
    },
    // 第5章：拖动总时长手柄（改 keyframeAnimDuration）
    dragDurationHandle() {
        try { if (!keyframeWindowOpen) openKeyframeWindow(); } catch (e) {}
        try { keyframeAnimDuration = 15; } catch (e) {}
        try { if (typeof renderKeyframeTimeline === 'function') renderKeyframeTimeline(); } catch (e) {}
    },
    // 第6章：把方块拖进文件夹
    dragBlockIntoFolder() {
        const b = TUT_ACT.tutEnsureNormalBlock(); if (!b) return;
        const fn = 'tutFolder';
        if (!getFolder(fn)) { try { createFolder(fn); } catch (e) {} }
        b.group = fn;
        try { syncFolderBoneHierarchy([fn]); } catch (e) {}
        try { renderSideBlockList(); } catch (e) {}
    },
    // 第6章：设骨干
    designateBackbone() {
        const b = TUT_ACT.tutEnsureNormalBlock(); if (!b) return;
        const fn = getFolder('tutFolder') ? 'tutFolder' : (b.group || 'tutFolder');
        if (!getFolder(fn)) { try { createFolder(fn); } catch (e) {} }
        b.group = fn;
        try { designateFolderBackbone(fn, b.id, true, false); } catch (e) {}
        try { renderSideBlockList(); } catch (e) {}
    },
    // 第6章：打开父骨骼选择器并绑定（直接 bindBone 让门控通过）
    openParentSelector() {
        const parent = TUT_ACT.tutEnsureNormalBlock();
        let child = blocks.find(x => x !== parent && !x._boneParent && !x.group && x.type === 'cube');
        if (!child) { try { child = new Block('tutChild_' + Date.now(), [0, 0, 0, 0, 0, 0, 1, 1, -90, 0, 0, 0, 0], null, '#fca5a5', 'cube', ''); addBlock(child, false, false); } catch (e) {} }
        if (!child) return;
        try { bindBone(child, parent, true, false, false, true); } catch (e) {}
    },
    // 第6章：多个子块绑到同一父级
    multiBindBone() {
        const parent = TUT_ACT.tutEnsureNormalBlock();
        let kids = blocks.filter(x => x !== parent && !x._boneParent && !x.group && x.type === 'cube');
        while (kids.length < 2) {
            try { const c = new Block('tutKid_' + Date.now() + '_' + kids.length, [0, 0, 0, 0, 0, 0, 1, 1, -90, 0, 0, 0, 0], null, '#fcd34d', 'cube', ''); addBlock(c, false, false); kids.push(c); } catch (e) { break; }
        }
        if (kids.length < 2) return;
        try { bindBone(kids[0], parent, true, false, false, true); bindBone(kids[1], parent, true, false, false, true); } catch (e) {}
    },
    // 第7章：打开导出（命令列表）弹窗
    showExportModal() {
        try { showCommandListModal(); } catch (e) {}
    },
    // 第7章：生成并导出到文件（点击确认导出按钮）
    exportToFile() {
        try { showCommandListModal(); } catch (e) {}
        const btn = document.getElementById('confirmExportBtn');
        if (btn) { try { btn.click(); } catch (e) {} }
    },
    // 第7章：打开导入弹窗
    showImportModal() {
        try { showImportModal('normal'); } catch (e) {}
    },
    // 第8章：画笔点工具——加一个点
    ptAddPointDemo() {
        try { if (typeof isBrushMode === 'undefined' || !isBrushMode) enterBrushMode(); } catch (e) { try { enterBrushMode(); } catch (e2) {} }
        try { ptAddPoint(1, 1, 'red', true); } catch (e) {}
    },
    // 第8章：两点矩形生成方块
    ptDemoRect() {
        try { if (typeof isBrushMode === 'undefined' || !isBrushMode) enterBrushMode(); } catch (e) { try { enterBrushMode(); } catch (e2) {} }
        try {
            ptMode = 'rect2';
            ptAddPoint(0, 0, 'red', true); const p1 = ptMarkers[ptMarkers.length - 1];
            ptAddPoint(2, 2, 'blue', true); const p2 = ptMarkers[ptMarkers.length - 1];
            if (p1) ptToggleSelect(p1.id);
            if (p2) ptToggleSelect(p2.id);
            ptGenerate();
        } catch (e) {}
    },
    // 第9章：新建项目
    createNewProject() {
        try { createNewProject(); } catch (e) {}
    },
    // 第9章：返回项目列表
    backToList() {
        try { backToProjectList(); } catch (e) {}
    },
    // 第9章：**只把项目管理器浮层显示出来**，不切屏幕、不动 currentProjectId。
    // ⚠ backToList/backToProjectList 会拆掉教程 UI（卡片随屏幕切换消失），不能用于教学演示。
    showProjectListOnly() {
        try {
            if (typeof projectManagerEl !== 'undefined' && projectManagerEl) {
                if (projectManagerEl.style.display === 'none') projectManagerEl.style.display = 'flex';
                if (projectManagerEl.style.visibility === 'hidden') projectManagerEl.style.visibility = 'visible';
            }
        } catch (e) {}
    },
    // 第10章：选中两个方块
    // ★顺序铁律（2026-10-16 实测）：必须先 `renderSideBlockList()` 再写 `selectedBlocksSet`。
    //   反过来的话，renderSideBlockList 内部同步选中态时走单选语义（`selectBlock` 会 clear 集合），
    //   把刚加的 2 块收缩成 1 块 ⇒ `check: size>=2` 永远不满足 ⇒ ch10.0~3 点「帮我做」也无法放行。
    //   另外标亮只用 `updateSelectionHighlight`，**不要**用 `selectBlock`（它会 clear）。
    selectTwoBlocks() {
        let bs = blocks.filter(b => !isBlockHidden(b) && !isBlockLocked(b));
        while (bs.length < 2) {
            try { const c = new Block('tutSel_' + Date.now() + '_' + bs.length, [0, 0, 0, 0, 0, 0, 1, 1, -90, 0, 0, 0, 0], null, '#a5b4fc', 'cube', ''); addBlock(c, false, false); bs.push(c); } catch (e) { break; }
        }
        if (bs.length < 2) return;
        const two = bs.slice(0, 2);
        // ① 先把列表渲染好（此时还没有选中，列表不会把选中态改回去）
        try { renderSideBlockList(); } catch (e) {}
        // ② 再写选中集合（render 之后再写，就不会被覆盖）
        try { selectedBlocksSet.clear(); } catch (e) {}
        two.forEach(b => {
            try { selectedBlocksSet.add(b); } catch (e) {}
            try { b.updateSelectionHighlight(true); } catch (e) {}
        });
        // ③ 面板切到批量态（openBatchPanelAndClickVar 依赖它）
        try { if (typeof renderVariablesForBlock === 'function') renderVariablesForBlock(null); } catch (e) {}
    },
    // 第10章：打开批量修改变量面板并点一个变量
    openBatchPanelAndClickVar() {
        TUT_ACT.selectTwoBlocks();
        try { renderVariablesForBlock(null); } catch (e) {}
        const row = document.querySelector('.batch-mv-row[data-batch-var]');
        if (row) { try { row.click(); } catch (e) {} }
    },
    // 第11章：molang 表达式查找替换
    openMolangBatchReplace() {
        try { openMolangBatchReplace(); } catch (e) {}
    },
    // 第12章：打开新建方块菜单
    openCreateBlockMenu() {
        const btn = document.getElementById('addBlockBtn');
        if (btn) { try { btn.click(); } catch (e) {} }
    },
    // ---- 补齐缺失的 act 注册（第4~12章引用、但此前未登记，导致整章卡在第一步）----
    // 第4章 4.1 打开材质菜单：先确保有选中块，再点「add材质」按钮
    openMaterial() {
        let b = selectedBlock;
        if (!b || b._boneParent) b = TUT_ACT.tutEnsureNormalBlock();
        if (!b) b = tutEnsureBody(); if (!b) return;
        selectedBlocksSet.clear(); selectedBlocksSet.add(b);
        try { selectBlock(b); } catch (e) {}
        try { const btn = document.getElementById('materialPresetBtn'); if (btn) btn.click(); } catch (e) {}
    },
    // 第5章 5.1 进入关键帧模式并打开窗口
    enterKeyframeMode() {
        try { if (typeof isKeyframeMode === 'undefined' || !isKeyframeMode) enterKeyframeMode(); } catch (e) { try { enterKeyframeMode(); } catch (e2) {} }
        try { if (typeof keyframeWindowOpen === 'undefined' || !keyframeWindowOpen) openKeyframeWindow(); } catch (e) {}
    },
    // 第6章 6.1 新建文件夹
    createFolder() {
        try { if (typeof folders === 'undefined' || !folders.length) createFolder('tutFolder'); } catch (e) { try { createFolder('tutFolder'); } catch (e2) {} }
    },
    // 第8章 8.1 进入画笔模式
    enterBrushMode() {
        try { if (typeof isBrushMode === 'undefined' || !isBrushMode) enterBrushMode(); } catch (e) { try { enterBrushMode(); } catch (e2) {} }
    },
    // 第11章 11.1 打开设置面板
    openSettings() {
        try { tutOpenSettings(); } catch (e) {}
    },
    // ---- 2026-10-16 补齐「后半教程的手把手」----
    // 第11章：把灰度强度设为 30%（演示滑块生效；只改状态，不改用户其他偏好）
    setGrayStrength() {
        try {
            const el = document.getElementById('grayStrengthSlider') || document.querySelector('[id*="grayStrength" i]');
            if (el) { el.value = '30'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
        } catch (e) {}
    },
    // 第11章：切换「浅色模式」并切回（让用户看见效果；最终保持原样以免吓到）
    toggleLightModeDemo() {
        try { document.body.classList.toggle('light-mode'); } catch (e) {}
    },
    // 第11章：重置 UI 缩放到 100%（演示 UI 缩放对卡片也生效）
    resetUiScaleDemo() {
        try { if (typeof applyUIScale === 'function') applyUIScale(100); } catch (e) {}
    },
    // 第12章：新建一个「平面」方块（演示 5 种方块类型里的第二种）
    createPlaneBlock() {
        try {
            const btn = document.getElementById('addBlockBtn'); if (btn) btn.click();
            setTimeout(() => {
                const item = document.querySelector('#createBlockMenuModal [data-block-type="plane"], #createBlockMenuModal .cb-type-item:nth-child(2)');
                if (item) item.click();
            }, 120);
        } catch (e) {}
    },
    // 第12章：打开「视图」菜单（演示轴线/平面/刻度开关所在处）
    openViewMenu() {
        try { const b = document.getElementById('viewMenuBtn'); if (b) b.click(); } catch (e) {}
    },
    // 第12章：打开「文件」菜单（演示导入导出入口）
    openFileMenu() {
        try { const b = document.getElementById('fileMenuBtn'); if (b) b.click(); } catch (e) {}
    },
    // 第13章：点亮一次虚拟 Shift（手机端虚拟键；桌面端调用同样安全）
    tapVirtModDemo() {
        try {
            const k = document.getElementById('virtModShift');
            if (k) k.click();
        } catch (e) {}
    },
    // 第13章：按 Alt+S 打开设置（快捷键演示；只在没开时开，幂等）
    demoShortcutSettings() {
        try { if (!tutSettingsOpen()) tutOpenSettings(); } catch (e) {}
    },
    // 第14章：打开「记录」面板（菜单两级化的左键）
    openTutLogPanel() {
        try { if (typeof tutOpenLogPanel === 'function') tutOpenLogPanel(); } catch (e) {}
    },
    // 第14章：打开章节目录（目录按钮）
    openTutOverview() {
        try { openTutorialOverview(); } catch (e) {}
    },
    // 第10章：打开扳手工具菜单（常量化 / 欧拉角转换入口）
    openToolsMenuDemo() {
        try { ensureToolsMenuOpen(); } catch (e) {}
        try {
            // ★健壮化：按钮/菜单只在新操作模式渲染；若因前面章节（如项目管理器）导致侧栏 DOM
            //   重建后按钮缺失，先补渲染再开，避免 act 静默失败 ⇒ 门控永不满足。
            let btn = document.getElementById('outlinerToolsBtn');
            if (!btn) {
                if (!isNewLayoutMode) { try { setNewLayoutMode(true); } catch (e) {} }
                try { renderSideBlockList(); } catch (e) {}
                btn = document.getElementById('outlinerToolsBtn');
            }
            const menu = document.getElementById('outlinerToolsMenu');
            if (btn && menu && !menu.classList.contains('open')) { try { btn.click(); } catch (e) {} }
        } catch (e) {}
    },
    // 第7章：打开压缩导出面板（把多条命令合并）
    openCompressExport() {
        try {
            const btn = document.getElementById('compressExportBtn') || document.querySelector('[id*="compress" i]');
            if (btn) btn.click();
            else if (typeof showCommandListModal === 'function') showCommandListModal();
        } catch (e) {}
    },
    // 第6章：解绑一个子块（让子块恢复自由）
    unbindOneDemo() {
        try {
            const kid = blocks.find(b => b._boneParent);
            if (kid && typeof unbindBone === 'function') unbindBone(kid);
        } catch (e) {}
    },
};
