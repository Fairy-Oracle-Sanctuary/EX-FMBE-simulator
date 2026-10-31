/* 07-scene/01-scene-init.js · 源 测试版v.6b79.html 第 35180-35410 行 */
'use strict';
// ==================== 3D场景初始化 ====================
const container = document.getElementById('canvas-container');
/* ★【2026-10-24 性能】大场景渲染调度（用法见 animate 末尾）：
   · cam / mat / ui 三个版本号 = 「相机变了 / 方块矩阵变了 / 其它画面状态变了」；
   · 大场景下版本号都没变就不提交渲染（另有 1s 兜底），空闲帧不再白白烧 GPU/CPU；
   · 上一次渲染耗时超过阈值时自动跳帧，把空出来的帧还给浏览器处理点击与拖拽。
   任何会改变画面的入口都应调用 bumpDrawRev()；用 var + 判空是为了兼容模块初始化早期的调用。 */
var _drawRev = { cam: 0, mat: 0, ui: 0 };
var _drawnRev = { cam: -1, mat: -1, ui: -1 };
var _renderCostMs = 0;
var _lastDrawTs = 0;
var _frameTick = 0;
var _schedCamPos = null, _schedCamQuat = null, _schedCamZoom = 1;   // 上次提交渲染时的相机位姿
function bumpDrawRev(kind) { if (!_drawRev) return; _drawRev[kind]++; }
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030617);
gizmoRoot = new THREE.Group(); scene.add(gizmoRoot); gizmoRoot.visible = false;
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000000);
camera.position.set(8, 6, 10);
const BASE_CAM_DIST = camera.position.length(); // 默认视角相机到目标(原点)的轨道半径：作为网格精细度的基准（此距离时 step=1，即 1×1 网格）。旋转/平移不改变该半径 → 刻度不随转动变化；仅缩放(拉近/拉远)改变它 → 精细度平滑变化
/* ★【2026-10-24 性能】自适应画质：方块数超过阈值时自动降负载。
   2940 块实测：每帧 2940 次 draw call + 一张阴影贴图再画一遍。低端 GPU 上这是「卡炸」的主因，
   而用户在几千块的模型里也很难看清阴影/半分辨率差异，因此按块数自动切换：
     · 阴影关闭（少一整趟 shadow pass）
     · 设备像素比封顶 1（高 DPI 屏少 4 倍填充量）
   低于阈值自动恢复，无需用户干预。 */
const LARGE_SCENE_BLOCKS = 1000;
let _largeSceneLowRes = false;
let _qualityBlockCount = -1;
function applyBasePixelRatio() {
    const base = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(_largeSceneLowRes ? Math.min(1, base) : base);
    bumpDrawRev('ui');   // 改像素比会重建绘制缓冲（画面被清空），必须补一帧
}
function updateSceneQuality() {
    if (blocks.length === _qualityBlockCount) return;
    _qualityBlockCount = blocks.length;
    const low = blocks.length > LARGE_SCENE_BLOCKS;
    if (low === _largeSceneLowRes) return;
    _largeSceneLowRes = low;
    try { mainLight.castShadow = !low; } catch (e) {}
    try { renderer.shadowMap.enabled = !low; } catch (e) {}   // 直接关掉整个 shadow pass
    for (let i = 0; i < blocks.length; i++) {
        const ms = blocks[i].meshes;
        if (!ms) continue;
        for (let j = 0; j < ms.length; j++) if (ms[j]) ms[j].castShadow = !low;
    }
    bumpDrawRev('ui');   // 阴影开关变了：立即重画一帧
    try { if (!isDraggingPanel) applyBasePixelRatio(); } catch (e) {}
}
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 1); // 不透明背景，避免透明穿透导致空白
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // 高 DPI/视网膜屏按设备像素比渲染，避免画面发糊（拖拽面板时会临时降到 0.5 保流畅，松手即恢复）
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // 如需关闭阴影可改为 false
renderer.toneMapping = THREE.NoToneMapping; // 保持纹理原色，不用色调映射（避免灰化去饱和）
renderer.domElement.style.display = 'block';
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.top = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.style.zIndex = '0';
        container.appendChild(renderer.domElement);
        var labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.left = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
labelRenderer.domElement.style.background = 'transparent';
labelRenderer.domElement.style.zIndex = '1';
container.appendChild(labelRenderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enablePan = true;
controls.panSpeed = 1.0;
controls.enableZoom = true;
controls.zoomSpeed = 0.8;
controls.rotateSpeed = 0.8;
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.touchRotate = true;
controls.touchZoom = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.listenToKeyEvents(window);
// 编辑文本（输入框/文本框/可编辑区）时禁用方向键平移相机：避免 molang 等多处文本编辑时方向键被识别为移动摄像机
function isEditableTarget(el) {
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true'));
}
document.addEventListener('focusin', (e) => { if (controls) controls.enableKeys = !isEditableTarget(e.target); });
document.addEventListener('focusout', () => { if (controls) controls.enableKeys = true; });

// 相机视角变化（旋转/缩放/平移）时标记脏，供 animate 刷新含 q.rotation_to_camera 等相机相关表达式的方块
let _cameraExprDirty = false;
controls.addEventListener('change', () => { if (_queryUpdateEnabled) _cameraExprDirty = true; bumpDrawRev('cam'); });

// ========== 摄像机坐标 & 视场角(FOV) 设置 ==========
const camPosX = document.getElementById('camPosX');
const camPosY = document.getElementById('camPosY');
const camPosZ = document.getElementById('camPosZ');
const camPosApplyBtn = document.getElementById('camPosApplyBtn');
const camPosReadBtn = document.getElementById('camPosReadBtn');
const cameraFovRange = document.getElementById('cameraFovRange');
const cameraFovLabel = document.getElementById('cameraFovLabel');

function readCamPosInputs() {
    const x = camPosX ? parseFloat(camPosX.value) : NaN;
    const y = camPosY ? parseFloat(camPosY.value) : NaN;
    const z = camPosZ ? parseFloat(camPosZ.value) : NaN;
    if (isNaN(x) || isNaN(y) || isNaN(z)) return null;
    return new THREE.Vector3(x, y, z);
}

function applyCamPos() {
    const p = readCamPosInputs();
    if (!p) return;
    camera.position.copy(p);
    if (controls) controls.update();
}

function syncCamPosInputs() {
    if (camPosX) camPosX.value = camera.position.x.toFixed(1);
    if (camPosY) camPosY.value = camera.position.y.toFixed(1);
    if (camPosZ) camPosZ.value = camera.position.z.toFixed(1);
}

if (camPosApplyBtn) camPosApplyBtn.addEventListener('click', applyCamPos);
if (camPosReadBtn) camPosReadBtn.addEventListener('click', syncCamPosInputs);
if (camPosX) camPosX.addEventListener('change', applyCamPos);
if (camPosY) camPosY.addEventListener('change', applyCamPos);
if (camPosZ) camPosZ.addEventListener('change', applyCamPos);

let cameraFov = 45;
/* 只改相机 FOV 与界面显示，不写 localStorage —— 正交视图临时切到窄视场角时用，
   避免把用户原本的视场角偏好覆盖成 2°。 */
function setCameraFovRaw(v) {
    cameraFov = v;
    camera.fov = v;
    camera.updateProjectionMatrix();
    bumpDrawRev('cam');
    if (cameraFovLabel) cameraFovLabel.textContent = Math.round(v) + '°';
    if (cameraFovRange) cameraFovRange.value = v;
}
function applyCameraFov(v) {
    setCameraFovRaw(Math.min(120, Math.max(20, v)));
    try { localStorage.setItem('camera_fov', String(cameraFov)); } catch (e) {}
}
if (cameraFovRange) {
    cameraFovRange.addEventListener('input', (e) => { applyCameraFov(parseFloat(e.target.value) || 45); });
}
// 恢复上次 FOV 偏好
try {
    const savedFov = parseFloat(localStorage.getItem('camera_fov'));
    if (!isNaN(savedFov)) cameraFov = savedFov;
} catch (e) {}
applyCameraFov(cameraFov);
syncCamPosInputs();

// ========== 正交视图（去透视）& 轴向视角 ==========
/* ★【2026-10-30】为什么不用 THREE.OrthographicCamera 直接换相机：
   全项目几十处投影 / 拾取 / 尺寸公式都直接吃这台透视相机（project(camera)、setFromCamera、
   fov、距离→屏幕占比等），换相机等于把整套换算重写一遍，回归风险极高。
   这里改用「近正交」：把视场角压到 2°（肉眼已看不出近大远小），同时把相机沿视线等比拉远，
   保持画面取景完全不变 —— 投影矩阵仍是透视的，所以拾取 / 投影代码天然一致。
   唯一要补偿的是「屏幕占比 ∝ 距离 × tan(fov/2)」的场合：凡用原始距离算尺寸 / 精度的，
   一律改走 framingDist() / framingRatio()（按默认 45° 归一化，默认视角下恒等于原值）。 */
const ORTHO_VIEW_FOV = 2;
let orthoViewOn = false;
let orthoViewPrevFov = 45;
function tanHalfDeg(f) { return Math.tan((f * Math.PI / 180) / 2); }
function framingRatio() { return tanHalfDeg(camera.fov) / tanHalfDeg(45); }
/* 「等效 45° 距离」= 屏幕占比不变的等价距离：默认 45° 时原样返回 */
function framingDist(point) {
    const p = point || (controls ? controls.target : null);
    const d = p ? camera.position.distanceTo(p) : camera.position.length();
    return d * framingRatio();
}
function homeCamDistance() { return BASE_CAM_DIST / framingRatio(); }
function homeCamDirection() { return new THREE.Vector3(8, 6, 10).normalize(); }

function syncOrthoViewUI() {
    const box = document.getElementById('orthoViewCheckbox');
    if (box) {
        box.classList.toggle('checked', orthoViewOn);
        box.setAttribute('aria-pressed', orthoViewOn ? 'true' : 'false');
    }
    // 视图下拉里的勾选文案（与「显示轴线 / 平面 / 刻度」同一套 ✓ 前缀写法）
    const viewItem = document.querySelector('#viewDropdown .top-dropdown-item[data-view-action="ortho"] span');
    if (viewItem) viewItem.textContent = (orthoViewOn ? '✓ ' : '') + '正交视图';
    // 正交时隐藏 FOV 滑块：此时视场角被锁定在 2°，拖它只会破坏模式
    const fovItem = document.getElementById('cameraFovSetting');
    if (fovItem) fovItem.style.display = orthoViewOn ? 'none' : '';
}

function setOrthoView(on, opts) {
    opts = opts || {};
    on = !!on;
    if (on === orthoViewOn) { syncOrthoViewUI(); return; }
    const tgt = controls.target;
    if (on) {
        // 开：距离按 tan(fov/2) 等比放大，同时把视场角压到 2° → 取景不变，近大远小消失
        orthoViewPrevFov = camera.fov;
        const k = tanHalfDeg(camera.fov) / tanHalfDeg(ORTHO_VIEW_FOV);
        camera.position.sub(tgt).multiplyScalar(k).add(tgt);
        setCameraFovRaw(ORTHO_VIEW_FOV);
        orthoViewOn = true;
    } else {
        // 关：按相反的比值收回距离，并恢复用户原本的视场角
        const k = tanHalfDeg(camera.fov) / Math.max(1e-6, tanHalfDeg(orthoViewPrevFov));
        camera.position.sub(tgt).multiplyScalar(k).add(tgt);
        setCameraFovRaw(orthoViewPrevFov);
        orthoViewOn = false;
    }
    if (controls) controls.update();
    syncOrthoViewUI();
    syncCamPosInputs();
    updateAxesByDistance(true);   // 网格 / 轴线精度按 framingDist 归一化，需立即重建
    if (!opts.skipSave) saveViewFlags();
    if (!opts.silent) showToast(on ? '正交视图已开启（已去透视）' : '已退出正交视图');
}
function toggleOrthoView() { setOrthoView(!orthoViewOn); }

/* 场景内容中心（所有方块包围盒中心；没有方块时退回世界原点）。
   轴向视角以它为观察点：否则只要之前平移过视图（controls.target 早就不是原点），
   正前/正左等就只是「以那个偏心点为正前方」，模型会偏到画面一侧。 */
function sceneContentCenter(out) {
    const v = out || new THREE.Vector3();
    v.set(0, 0, 0);
    if (typeof blocks === 'undefined' || !blocks || !blocks.length) return v;
    const box = new THREE.Box3();
    let counted = 0;
    for (const b of blocks) {
        const obj = b.mesh || (b.rootGroup && b.rootGroup.children.length ? b.rootGroup : null);
        if (obj && obj.visible !== false) { box.expandByObject(obj); counted++; }
    }
    if (counted === 0) return v;
    box.getCenter(v);
    return v;
}

/* 轴向视角：把相机摆到内容中心的正前 / 正后 / 正左 / 正右 / 正俯方向。
   距离保持不变（不打断当前缩放），观察点归位到模型中心（视图不再偏到一侧）。 */
function applyAxisView(kind) {
    if (typeof isBrushMode !== 'undefined' && isBrushMode) { showToast('请先退出画笔模式，再切换轴向视角'); return; }
    const dirs = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0] };
    const d = dirs[kind];
    if (!d) return;
    const center = sceneContentCenter();
    const dist = camera.position.distanceTo(controls.target) || homeCamDistance();
    controls.target.copy(center);   // 观察点归位：模型居中，轴向视角才是真正的「正 XX 视」
    camera.up.set(0, 1, 0);   // 正俯视时 up∥视线，OrbitControls.update() 会把极角夹到安全值，不会退化
    camera.position.set(center.x + d[0] * dist, center.y + d[1] * dist, center.z + d[2] * dist);
    controls.update();
    syncCamPosInputs();
    bumpDrawRev('cam');
    updateAxesByDistance(true);
}

/* 重置视角：回到默认斜 45° 机位。距离按当前视场角折算，保证正交模式下取景与原默认一致。 */
function resetCameraHome() {
    const dist = homeCamDistance();
    camera.up.set(0, 1, 0);
    camera.position.copy(homeCamDirection().multiplyScalar(dist));
    controls.target.set(0, 0, 0);
    controls.update();
    syncCamPosInputs();
    bumpDrawRev('cam');
    updateAxesByDistance(true);
}

const _orthoViewBox = document.getElementById('orthoViewCheckbox');
if (_orthoViewBox) _orthoViewBox.addEventListener('click', (e) => { e.stopPropagation(); toggleOrthoView(); });
document.querySelectorAll('[data-axis-view]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); applyAxisView(btn.dataset.axisView); });
});
syncOrthoViewUI();

// ---------- 挂载 Gizmo 拖拽事件 ----------
renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.data-panel') || e.target.closest('.top-bar') || e.target.closest('.new-top-bar') || e.target.closest('.side-block-list')) return;
    if (!gizmoRoot?.visible) return;
    const handled = beginGizmoDrag(e.clientX, e.clientY, e);
    if (handled) e.stopPropagation();
});
renderer.domElement.addEventListener('pointermove', (e) => {
    if (isBrushMode && brushPoint1) {
        const hitResult = getBrushHitPoint(e);
        if (hitResult && hitResult.point) {
            hitResult.point.y = 0;
            brushPreviewPoint = hitResult.point.clone();
        }
        return;
    }
    if (!draggingGizmo && !pendingInputPick) return;
    moveGizmoDrag(e.clientX, e.clientY);
});
renderer.domElement.addEventListener('pointerup', (e) => {
    if (!draggingGizmo && !pendingInputPick) return;
    endGizmoDrag(e);
});
renderer.domElement.addEventListener('pointerleave', (e) => {
    // 仅在未成功抢占指针（极少数浏览器不支持）时才允许“离开画布即结束”，
    // 正常抢占了指针时浏览器不会派发 pointerleave，避免拖拽中途被误终止。
    if ((draggingGizmo || pendingInputPick) && !(renderer.domElement.hasPointerCapture && renderer.domElement.hasPointerCapture(e.pointerId))) endGizmoDrag(e);
});
renderer.domElement.addEventListener('pointercancel', (e) => {
    if (draggingGizmo || pendingInputPick) endGizmoDrag(e);
});
renderer.domElement.addEventListener('touchstart', (e) => {
    if (e.target.closest('.data-panel') || e.target.closest('.top-bar') || e.target.closest('.new-top-bar') || e.target.closest('.side-block-list')) return;
    if (!gizmoRoot?.visible) return;
    const touch = e.touches[0];
    const handled = beginGizmoDrag(touch.clientX, touch.clientY, e);
    if (handled) e.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener('touchmove', (e) => {
    if (!draggingGizmo && !pendingInputPick) return;
    const touch = e.touches[0];
    moveGizmoDrag(touch.clientX, touch.clientY);
    e.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener('touchend', (e) => {
    if (!draggingGizmo && !pendingInputPick) return;
    endGizmoDrag(e);
});

// 监听窗口尺寸变化，自适应屏幕
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
    bumpDrawRev('cam');   // 画布尺寸变了：必须重画，否则画面停在旧缓冲
}

// 环境光（偏冷天空光；强度适中，保留各面明暗对比，避免惨白扁平）
const ambient = new THREE.AmbientLight(0x9fb0c4, 0.45);
scene.add(ambient);
// 主方向光（白色，模拟 MC 太阳光；固定在世界空间，像太阳一样从斜上方照射）
const mainLight = new THREE.DirectionalLight(0xffffff, 0.55);
mainLight.decay = 0;
mainLight.castShadow = true;
mainLight.position.set(-12, 18, 8);
mainLight.target.position.set(0, 0, 0);
mainLight.target.updateMatrixWorld();
scene.add(mainLight);

// 灯光已就绪；applyTheme() 会在轴线变量声明完成后再调用一次，
// 以修正首次进入时因灯光尚未创建而漏掉的光强设置。
lightsReady = true;

