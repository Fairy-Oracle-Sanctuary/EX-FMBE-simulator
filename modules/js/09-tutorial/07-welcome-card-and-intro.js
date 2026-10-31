/* 09-tutorial/07-welcome-card-and-intro.js · 源 测试版v.6b79.html 第 51753-52929 行 */
'use strict';
// ============ 新用户欢迎卡（替代直接弹教程章节，避免突兀） ============
function showTutorialWelcome() {
    if (document.getElementById('exTutWelcome')) return;
    // ★教程已在目录/进行中时绝不能再弹欢迎卡：欢迎卡是整屏 .modal（z-index 与浮层同级、pointer-events:auto），
    //   后弹出来会盖住章节目录、新建方块菜单和防护层，表现为「点什么都没反应」（用户报的第一章全部卡关）。
    try {
        if (document.getElementById('exTutOverlay') || document.body.classList.contains('ex-tut-on') ||
            document.querySelector('#exTutRoot .ex-tut-card')) return;
    } catch (e) {}
    const m = document.createElement('div');
    m.className = 'modal ex-tut-welcome-modal';
    m.id = 'exTutWelcome';
    m.innerHTML = `
        <div class="modal-content ex-tut-welcome">
            <div class="ex-tut-welcome-title">欢迎使用 EX 模拟器</div>
            <div class="ex-tut-welcome-text">检测到你是第一次使用，我们准备了一个 <b>互动新手教程</b>，手把手带你快速上手，几分钟就能学会基本操作。随时可退出，不影响你的项目。</div>
            <div class="ex-tut-welcome-actions">
                <button class="prj-btn prj-btn-tut" id="exTutWelcomeStart"><span class="prj-face">开始新手教程</span></button>
                <button class="prj-btn prj-btn-ghost" id="exTutWelcomeLater">以后再说</button>
            </div>
        </div>`;
    document.body.appendChild(m);
    const close = () => {
        const el = document.getElementById('exTutWelcome');
        if (!el) return;
        const card = el.querySelector('.ex-tut-welcome');
        el.classList.add('closing'); if (card) card.classList.add('closing');
        setTimeout(() => { const e2 = document.getElementById('exTutWelcome'); if (e2) e2.remove(); }, 210);
    };
    m.querySelector('#exTutWelcomeStart').onclick = () => { close(); openTutorialOverview(); };
    m.querySelector('#exTutWelcomeLater').onclick = () => { close(); tutSave({ welcomed: true }); };
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
}

// ============ 电影感运镜开场（可由开发者工具「重播开场动画」手动播放） ============
const EX_INTRO_KEY = 'ex_intro_seen';
function introSeen() { try { return localStorage.getItem(EX_INTRO_KEY) === '1'; } catch (e) { return false; } }
function markIntroSeen() { try { localStorage.setItem(EX_INTRO_KEY, '1'); } catch (e) {} }

function playCinematicIntro(onDone, opts) {
    const _allowSkip = !opts || opts.allowSkip !== false; // 手动重播 / 开发者工具可跳过
    // 降级：无 THREE / 无 WebGL 时直接回调 onDone 走后续。
    // ★ 复用页面已有的 renderer 判活（它存在即证明 WebGL 可用，且不再新增 canvas 上下文）——
    //   浏览器在 GPU 进程刚崩过 / 上下文被回收时会拒绝【新】上下文（返回 null），
    //   而页面既有的 renderer 上下文照常工作，故不能靠新建 canvas 探测。
    try {
        if (typeof THREE === 'undefined') throw 0;
        const _alive = (typeof renderer !== 'undefined' && renderer
            && typeof renderer.getContext === 'function') ? renderer.getContext() : null;
        if (!_alive) throw 0;
    } catch (e) { if (typeof onDone === 'function') onDone(); return; }

    // ===== 全程基于模拟器现有体系：直接驱动真实 scene / camera / controls / 网格 =====
    // 隐藏项目管理器，露出真实 WebGL 画布（含真实坐标网格）；结束后恢复。
    const pm = document.getElementById('projectManager');
    let _pmDisplay = '';
    if (pm) { _pmDisplay = pm.style.display; pm.style.display = 'none'; }

    // 接管相机：关闭用户控制，逐帧设定 camera.position / controls.target
    const _cEnabled = controls.enabled, _cDamp = controls.enableDamping;
    controls.enabled = false; controls.enableDamping = false;
    window.__introRunning = true;   // 供 enterBrushMode 等外部在开场动画进行中安全中止
    const _camPos0 = camera.position.clone();
    const _tgt0 = controls.target.clone();
    const _camZoom0 = camera.zoom;
    // 开场构图按 45° 视场角硬算（TAN = tan(22.5°)），正交视图下视场角是 2° → 先把 FOV 拉回 45°，
    // 结束时再还原（否则标题/字块会整体飞出画面）。位置与缩放由 _camPos0/_camZoom0 负责还原。
    const _camFov0 = camera.fov;
    camera.fov = 45; camera.updateProjectionMatrix();

    // 隐藏场景里既有的方块（若有），只展示开场专属方块
    const _hiddenBlocks = [];
    blocks.forEach(b => { if (b.mesh && b.mesh.visible) { b.mesh.visible = false; _hiddenBlocks.push(b); } });

    const _showGridSaved = showGrid, _showTicksSaved = showTicks;
    showGrid = true; showTicks = false;   // 只留干净网格，隐藏刻度数字（避免俯仰角下数字挤成一串）

    // 真实材质：原版贴图全部来自 Textures/
    const OAK_TOP = 'oak_log_top.png', OAK = 'oak_log.png', DIAMOND = 'diamond_block.png';
    const oakFaces = [OAK_TOP, OAK_TOP, OAK, OAK, OAK, OAK]; // [底,顶,左,右,前,后]
    // 正确的 13 元 M 数组（与模拟器 initFromM 完全同序：xpos,ypos,zpos,xrot,yrot,zrot,scale,extend_scale,extend_xrot,extend_yrot,xbasepos,ybasepos,zbasepos）
    function M13(o) {
        return [
            o.xpos || 0, o.ypos || 0, o.zpos || 0, o.xrot || 0, o.yrot || 0, o.zrot || 0,
            o.scale == null ? 1 : o.scale, o.extend_scale == null ? 1 : o.extend_scale,
            o.extend_xrot || 0, o.extend_yrot || 0, o.xbasepos || 0, o.ybasepos || 0, o.zbasepos || 0
        ];
    }
    const introBlocks = [];
    function makeBlock(id, type, m, opt) {
        opt = opt || {};
        const b = new Block(id, m, opt.url || null, opt.color || '#aaccff', type, null, opt.faces || null);
        scene.add(b.mesh); introBlocks.push(b);
        return b;
    }
    function setVar(b, name, val) {
        const d = b.scope.vars.get(name);
        if (d) { d.value = val; d.expr = String(val); }
        b.refresh();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ④ 标题「EX FMBE模拟器」= 场景里真实搭建的「笔画板」
    //    2026-09-19 第二轮：上一版把字打散成 1000+ 个小方块（体素文字），用户否决
    //    「不是体素的那种风格，而是最少化方块去制作，可以使用网站内现成的 2D 平行四边形
    //      生成器或者预设」。→ 改为：每个字只用几条细长板拼出笔画，整条标题 ≈ 68 块。
    //
    //    ★ 每条板都出自网站自带的「2D 平面生成器」：
    //        generateRectParams(L, T) → 平行四边形的形状参数（scale / extend_*）
    //        xrot -= 90°              → 板从「平铺 XZ」立起来变成「正对相机」（面法线 ±Z）
    //        全局 rotatez = -角度      → 板在自身面内旋转 ⇒ 撇/捺/X 这类斜笔画也能拼
    //      离线用 computeTransformMatrix 复刻引擎矩阵逐项验证过：
    //        面法线恒为 ±Z、长轴落在世界 X、短轴落在世界 Y、中心精确等于给定的 xpos/ypos。
    //      ⚠️ 全局旋转在引擎里合成为 Ry·Rx·Rz（Rz 在最内层）。所以「面内旋转」必须放在
    //         rotatez、而把 90° 立起烘焙进 xrot；反过来写（rotatex=90 + rotatez）实测会
    //         退化成绕 Y 的偏航 —— 板会斜着插进画面，不再是正对相机。
    //    ※ 板虽极薄（extend_scale≈0.006 世界单位），但方块是封闭立方体、近侧大面恒为
    //      正面 → 引擎默认 FrontSide 即可正常显示；实测 FrontSide 与 DoubleSide 渲染像素
    //      完全一致（delta=0），故【不需要】任何特殊双面标志，模型与其他方块完全通用。
    //    ★ 材质沿用钻石块 → 与开场其余部分同一套贴图 / 顶点色。
    // ═══════════════════════════════════════════════════════════════════════
    const TITLE_TEX = DIAMOND;             // 其余字母维持原设计（钻石薄板笔画）；
                                           //   M 同样走笔画板管线，仅材质换成橙色羊毛（见 TITLE_M_TEX）。
    const TITLE_T_LAT = 0.155;    // 拉丁笔画粗细（设计单位，字高 = 1）
    const TITLE_T_CN = 0.105;     // 汉字笔画粗细
    const TITLE_LINE_GAP = 0.42;  // 行距（设计单位）
    const TITLE_CAM_DIST = 11.5;  // 收尾机位到标题中心的距离（≈ 下落段终点半径，衔接自然）
    const TITLE_FILL_W = 0.78;    // 标题横向占画幅比
    const TITLE_FILL_H = 0.55;    // 标题纵向占画幅比（两者取更严者决定「设计单位 → 世界单位」）
    // 视线比牌心【低】这么多（画幅高的比例）→ 标题在画面上整体上移，占上 2/3，
    // 给 bottom:27% 的 DOM 副标题（exIntroTitle）留净空；否则 模拟器 会被副标题压住。
    const TITLE_LOOK_DY = 0.115;
    // 视线比牌心【右】偏这么多（画幅宽的比例）：3/4 视角下近端(+X)被透视放大 →
    // 屏幕包围盒整体右倾（实测 cx 53.8%，左边距 188px / 右边距仅 78px）。
    // 右移 view 点 = 相机右偏航 = 标题在画面上左移，把包围盒重新摆正。
    //   （0.038 → 实测把 cx 从 53.8% 推到 48.8%，偏了 1.2%；取 0.029 ≈ 落回 50%）
    const TITLE_LOOK_DX = 0.029;
    // 标题牌面所在的 z。开场「下落」段那颗钻石方块停在 z≈0，若标题也放 z=0 就会与它
    // 互相穿插、方块正面（z=+0.5）盖在字上（实测挡住「拟」）。前移 0.8 → 字压住方块，
    // 方块退成字缝里的背景，构图反而更深。★ 机位距离是【到牌面】的距离，故 camNear
    // 由含 z 的 center 推得，画面比例不受影响。
    // ★ 2026-09-19 用户要「那个字 Z 轴调远一点」：0.8 → 0.35（牌面后退 0.45 世界单位）。
    //   ⚠️ 光改这一项画面上【什么都看不出来】——因为 u 是按 TITLE_CAM_DIST 反推的、
    //     而 camNear 又是「牌面 + 朝向×TITLE_CAM_DIST」，机位跟着牌面走 → 放大率恒定。
    //     所以必须同时把机位【锚定】在原来的绝对位置（见 TITLE_CAM_ANCHOR_Z），
    //     字才真的离镜头远了：投影缩小 11.5/11.95 ≈ 3.8%，且更靠场景深处。
    //   ⚠️ 下限：牌面 z 必须 > 下落方块的前表面 z≈0.2625（方块 scale1.5×es0.35→z∈±0.2625），
    //     否则两者穿插。故最多退到 ~0.30，本次取 0.35。
    const TITLE_Z = 0.35;
    // 机位锚点所在的 z：机位按「牌面在这个 z」来摆，与实际的 TITLE_Z 解耦 →
    // 牌面后退时镜头不动，字才在画面上真的变小/变远。
    // （等于 0.8 时与历史机位逐位相同，运镜路径 CAM 完全不受影响）
    const TITLE_CAM_ANCHOR_Z = 0.8;
    // ★ 笔画板的最小厚度（世界单位）。generateRectParams 给的是 1e-4 的相对值，
    //   实际厚度 = scale × extend_scale；len≈2.5 的斜笔只有 2.5e-4，相机在 11.5 外
    //   时前后两大面深度分辨不开 → z-fighting → 单像素暗点连成弧状条纹（摩尔纹）。
    //   0.006 ≈ 0.57 CSS px（1440×900 / fov45 / 距离 11.5 时 1 世界单位 ≈ 94.5px），
    //   视觉上仍是发丝级薄板，但深度稳定可辨。（0.006 与 0.02 实测指标完全相同 → 取小者）
    const TITLE_PLATE_THICK = 0.006;
    // ★ 2026-09-21 定稿：标题笔画回到「2D 平面生成器」的无厚度扁平观感（用户明确要求，
    //   厚实 3D 方块方案 TITLE_BAR_DEPTH=1.0 已废弃删除）。方块是封闭立方体，薄不影响
    //   可见性（FrontSide 与 DoubleSide 实测渲染像素一致），故不加任何特殊材质标志。
    // ─────────────────────────────────────────────────────────────────────────
    // ★ M 用【写死的用户模型】：4 块橙色羊毛平板（= 用户给的 4 条 playanimation 指令），
    //   其余字母用钻石薄板（走笔画板生成管线，便于自适应排版）。M 的模型数据就是下面这张表，
    //   想改参数直接改这里即可。
    //   原生模型平躺在 Y-Z 平面（法线沿 X）→ 整体绕 Y 转 TITLE_M_YAW=90° 让它正对相机（+Z）；
    //   相似变换只做「等比缩放 + 平移」，不动各块自身的 xrot/yrot/zrot，形状完全保留。
    //   ⚠️ 原始 extend_scale=0（零厚）会与同面片深度打架产生摩尔纹 → 装配时改用发丝级厚度
    //      TITLE_PLATE_THICK/(mS×scale)（见 buildIntroTitleBlocks 的 M 段）。
    const TITLE_M_TEX = 'orange_wool.png';
    const TITLE_M_YAW = 90;     // 整组绕 Y 旋转（度）：使模型法线由 ∓X 转到 ±Z 正对相机
    // 用户 4 条 playanimation 指令原样（xpos/ypos/zpos 均为 0；xbasepos/zbasepos 是模型自身站位）
    const TITLE_M_MODEL = [
        { xrot: -3.606741, yrot: 118,  zrot: -83.252552, scale: 3.005954, extend_scale: 0, extend_xrot: -6.734022,  extend_yrot: -86.36817,  xbasepos: -7.6522, ybasepos: 0, zbasepos: -0.5, rotatez: -90 },
        { xrot: -6.365108, yrot: 62.1, zrot: 78.173966,  scale: 3.018608, extend_scale: 0, extend_xrot: -11.752091, extend_yrot: 83.498028,  xbasepos: -0.1522, ybasepos: 0, zbasepos: -0.5, rotatez: -90 },
        { xrot: -2.020999, yrot: 118,  zrot: -86.205399, scale: 4.00249,  extend_scale: 0, extend_xrot: -3.792237,  extend_yrot: -87.974564, xbasepos: -2.1522, ybasepos: 0, zbasepos: -0.5, rotatez: -90 },
        { xrot: -4.737736, yrot: 62.1, zrot: 81.133626,  scale: 4.013714, extend_scale: 0, extend_xrot: -8.835837,  extend_yrot: 85.205231,  xbasepos: 4.7478,  ybasepos: 0, zbasepos: -0.5, rotatez: -90 }
    ];

    // 一条笔画 = [中心x, 中心y, 长度, 角度°, 粗细]
    // 角度：0 = 水平，正值 = 逆时针（屏幕坐标 y 向上）→ 方块用全局 rotatez = -角度 实现。
    // 拉丁字格：宽 0.72（M=1.0、B=0.88），字高 1.0，基线 y=0。
    const TITLE_LATIN = {
        E: [
            [0.078, 0.500, 1.000, 90, TITLE_T_LAT],      // 竖
            [0.360, 0.922, 0.720, 0, TITLE_T_LAT],       // 上横
            [0.290, 0.500, 0.580, 0, TITLE_T_LAT],       // 中横
            [0.360, 0.078, 0.720, 0, TITLE_T_LAT]        // 下横
        ],
        // ★ 2026-09-20 二次修正（用户："EX 就该和 ex_logo 一样，X 歪了"）——X = logo 里的
        //   【小写 x】：高只有 E 的 0.70、坐在基线上（底端略出头 −0.02），不是通高大 X。
        //   量测 logo（E 高=1.0 归一）：/ 55° 长0.78 粗≈TITLE_T_LAT；\ −36° 长0.73 只占
        //   下半截（y −0.02..0.42）粗 1.2×；交叉点在 / 的 30% 处（偏左下），两笔不共中心！
        //   上一版"歪"就是把两笔都摆在字格正中交叉 + 粗细比 1.75 太夸张。
        X: [
            [0.379, 0.334, 0.784, 55, TITLE_T_LAT * 0.9],       // / 陡·细（x 的通高笔）
            [0.355, 0.195, 0.680, -38, TITLE_T_LAT * 1.1]       // \ 浅·粗（下半截）
        ],
        // ★ 2026-09-20 第三轮（用户："FMBE 重新设计，更现代大气；F/B/E 左上角切角；
        //   M 改成参考图的双峰 + 内腿交叉；M 最大；B/E 缩小"）：
        //   - 切角做法（加法系统里不能减法）：竖笔截短 + 36° 斜板搭桥 + 上横右移，
        //     三块融合后轮廓左上角自然缺一个三角 = 切角。斜板 th=0.775× 是为了挤进
        //     titleUsePara 的平行四边形分支（端头水平、顶不冒出 y=1.0）。
        //   - M = 双峰 ΛΛ：外腿 70.7°，内腿从峰顶穿过交叉点一直伸到基线（交叉点在
        //     y=0.286、基线开口 0.55..0.75），参考用户 4 条 playanimation 指令的
        //     「短-长-短-长」板序（内腿视觉更长）。四腿同角度斜交替 = 现代感。
        //   - B/E 整体 ×0.9（含粗细 ×0.9），小写 e 是末尾 E 的独立字形（LINES 里改用 'e'）。
        F: [
            [0.078, 0.400, 0.800, 90, TITLE_T_LAT],            // 竖（截短让位切角）
            [0.229, 0.890, 0.374, 36, TITLE_T_LAT * 0.775],    // 左上切角斜边
            [0.490, 0.922, 0.460, 0, TITLE_T_LAT],             // 上横（右移让位切角）
            [0.280, 0.588, 0.560, 0, TITLE_T_LAT]              // 中横
        ],
        M: [
            [0.225, 0.500, 1.0595, 70.7, TITLE_T_LAT],         // 左外腿 ↗
            [0.575, 0.500, 1.0595, -70.7, TITLE_T_LAT],        // 左内腿 ↘（穿交叉点到基线）
            [0.725, 0.500, 1.0595, 70.7, TITLE_T_LAT],         // 右内腿 ↗（穿交叉点到基线）
            [1.075, 0.500, 1.0595, -70.7, TITLE_T_LAT]         // 右外腿 ↘
        ],
        // ★ 2026-09-26 用户：「B 字母弄得跟 8 一样」。根因（不是错觉）：原 B 的上下两个「碗」
        //   等高（上 0.450~0.830、下 0.070~0.450 各 0.38）、左右两条竖笔又齐平（都在 x=0.720）
        //   → 这 7 条笔画恰好等于【七段数码管的 8】。修法 = 按经典 B 的字形把【上碗收小、
        //   下碗加大】，并让【下碗右竖比上碗右竖更靠右】→ 中横处出现台阶、轮廓不再上下对称
        //   → 一眼读成 B。总高（0.000~0.900 含粗细）与原来一致，缩放归一后字号不变。
        B: [
            [0.0702, 0.351, 0.702, 90, TITLE_T_LAT * 0.9],     // 竖（截短，让位切角）
            [0.206, 0.801, 0.336, 36, TITLE_T_LAT * 0.7],      // 左上切角斜边
            [0.480, 0.830, 0.440, 0, TITLE_T_LAT * 0.9],       // 上横（右移让位切角；只伸到上碗右竖）
            [0.380, 0.526, 0.760, 0, TITLE_T_LAT * 0.9],       // 中横（抬到 0.526 → 上碗小、下碗大）
            [0.380, 0.070, 0.760, 0, TITLE_T_LAT * 0.9],       // 下横
            [0.700, 0.678, 0.304, 90, TITLE_T_LAT * 0.9],      // 上碗右竖（窄、短）
            [0.760, 0.298, 0.456, 90, TITLE_T_LAT * 0.9]       // 下碗右竖（宽、长、更靠右 → 台阶）
        ],
        e: [                                                   // 末尾 E：×0.9 + 左上切角
            [0.0702, 0.351, 0.702, 90, TITLE_T_LAT * 0.9],     // 竖（截短）
            [0.206, 0.801, 0.336, 36, TITLE_T_LAT * 0.7],      // 左上切角斜边
            [0.454, 0.830, 0.388, 0, TITLE_T_LAT * 0.9],       // 上横（右移）
            [0.252, 0.529, 0.504, 0, TITLE_T_LAT * 0.9],       // 中横
            [0.324, 0.070, 0.648, 0, TITLE_T_LAT * 0.9]        // 下横
        ]
    };

    // 「口」类方框 = 4 条矩形边（汉字里口/日/器都要用）
    function titleBoxStrokes(cx, cy, w, h) {
        return [
            [cx - w / 2 + TITLE_T_CN / 2, cy, h, 90, TITLE_T_CN],
            [cx + w / 2 - TITLE_T_CN / 2, cy, h, 90, TITLE_T_CN],
            [cx, cy + h / 2 - TITLE_T_CN / 2, w - TITLE_T_CN, 0, TITLE_T_CN],
            [cx, cy - h / 2 + TITLE_T_CN / 2, w - TITLE_T_CN, 0, TITLE_T_CN]
        ];
    }
    // 汉字：按部件拆成笔画（木 / 艹 / 日 / 大 / 扌 / 以 / 四口+犬）
    const TITLE_CN = {
        '模': [                                       // 木 + 莫(艹+日+大)
            [0.195, 0.640, 0.350, 0, TITLE_T_CN],        // 木·横
            [0.195, 0.470, 0.660, 90, TITLE_T_CN],       // 木·竖
            [0.135, 0.370, 0.490, -110.3, TITLE_T_CN],   // 木·撇
            [0.290, 0.455, 0.225, -57.7, TITLE_T_CN],    // 木·点
            [0.700, 0.915, 0.580, 0, TITLE_T_CN],        // 艹·横
            [0.565, 0.923, 0.155, 90, TITLE_T_CN],       // 艹·竖
            [0.845, 0.923, 0.155, 90, TITLE_T_CN],       // 艹·竖
            [0.505, 0.605, 0.380, 90, TITLE_T_CN],       // 日·左竖
            [0.845, 0.605, 0.380, 90, TITLE_T_CN],       // 日·右竖
            [0.675, 0.795, 0.340, 0, TITLE_T_CN],        // 日·上横
            [0.675, 0.605, 0.340, 0, TITLE_T_CN],        // 日·中横
            [0.675, 0.415, 0.340, 0, TITLE_T_CN],        // 日·下横
            [0.700, 0.270, 0.580, 0, TITLE_T_CN],        // 大·横
            [0.575, 0.140, 0.302, -127.7, TITLE_T_CN],   // 大·撇
            [0.810, 0.135, 0.286, -49.4, TITLE_T_CN]     // 大·捺
        ],
        // ★ 2026-09-19 第三轮（用户仍嫌不好看）：弃用「雅黑竖撇」的两段拼法 —— 那样以
        //   部会出现一根孤立竖条 + 一根趴在方块上的斜板，读成「扌 + 一堆碎木条」。
        //   改回【教科书式 以】：一根贯通长撇（0.860,0.920 → 0.520,0.070）+ 捺从撇的
        //   中段 (0.695,0.545) 分叉，两者在 0.105 板厚下正好贴合 → 「人」一眼可读；
        //   丶 缩短成 0.20 的短点，卡在 ㇙ 与撇顶之间的空档里。㇙ 左移到 0.425 给
        //   以 部让出通道。8 条笔画（原 9），ink 外框 x 0.002~0.984 / y 0.070~0.970。
        '拟': [                                       // 扌 + 以
            [0.185, 0.760, 0.340, 0.0, TITLE_T_CN],      // 扌·横
            [0.185, 0.555, 0.830, 90.0, TITLE_T_CN],     // 扌·竖
            [0.175, 0.470, 0.330, 22.1, TITLE_T_CN],     // 扌·提
            [0.425, 0.565, 0.760, 90.0, TITLE_T_CN],     // 以·㇙竖
            [0.470, 0.240, 0.220, 33.0, TITLE_T_CN],     // 以·㇙提
            [0.665, 0.865, 0.200, -62.0, TITLE_T_CN],    // 以·点（贴近撇顶，别悬空）
            [0.690, 0.495, 0.915, -111.8, TITLE_T_CN],   // 以·撇（贯通长撇）
            [0.810, 0.315, 0.514, -63.4, TITLE_T_CN]     // 以·捺
        ],
        '器': [].concat(                              // 四口 + 犬
            titleBoxStrokes(0.215, 0.790, 0.340, 0.320),   // 左上口
            titleBoxStrokes(0.785, 0.790, 0.340, 0.320),   // 右上口
            titleBoxStrokes(0.215, 0.210, 0.340, 0.320),   // 左下口
            titleBoxStrokes(0.785, 0.210, 0.340, 0.320),   // 右下口
            [
                [0.500, 0.500, 0.920, 0, TITLE_T_CN],        // 犬·横
                [0.450, 0.290, 0.366, -112.4, TITLE_T_CN],   // 犬·撇
                [0.590, 0.280, 0.353, -66.4, TITLE_T_CN]     // 犬·捺
            ]
        )
    };
    // 字宽（含字间距）；汉字统一 1.08
    const TITLE_ADV = { E: 0.86, X: 0.90, F: 0.86, M: 1.42, B: 0.86, e: 0.80, ' ': 0.50, '模': 1.17, '拟': 1.17, '器': 1.17 };
    // ★ 2026-09-26 用户：「把 FBE 三个字母调小一些，M 不动」。
    //   F/B/E = 三个「左上切角」字母。原稿 F 通高 1.0、B/e 手缩到 0.9 → 三者不等高、且都比 M 抢眼。
    //   这里按【各字形实测高度】归一，把三者统一收到 TITLE_CUT_H（M 完全不动），
    //   缩放锚点 = 各字形自己的「底部基线 + 水平中心」→ 仍稳坐基线、水平居中不带偏。
    const TITLE_CUT_H = 0.85;                    // F/B/E 目标字形高（设计单位；X/E ≈ 1.0、M 更大）
    const TITLE_CUT_LETTERS = { F: 1, B: 1, e: 1 };
    // （曾有一个 TITLE_TEX_INSET「取贴图内芯」常量，2026-09-26 第二轮已撤销 —— 见下方撤销说明）
    // 某个字形（笔画表）的设计单位外接框 —— 用于算归一缩放锚点 / 系数
    function titleGlyphBox(tbl) {
        let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
        tbl.forEach(st => {
            const ex = titleStrokeExtent(st[2], st[4], st[3]);
            if (st[0] - ex.hx < mnX) mnX = st[0] - ex.hx;
            if (st[0] + ex.hx > mxX) mxX = st[0] + ex.hx;
            if (st[1] - ex.hy < mnY) mnY = st[1] - ex.hy;
            if (st[1] + ex.hy > mxY) mxY = st[1] + ex.hy;
        });
        return { mnX: mnX, mxX: mxX, mnY: mnY, mxY: mxY };
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  笔画板形状：轴对齐笔用矩形，斜笔用【平行四边形】（端头水平）
    // ───────────────────────────────────────────────────────────────────────
    //  矩形板的两个端头【垂直于笔画】→ 斜笔的四角会伸出字格：X 的外接框实测
    //  高 1.0905，而 E/F/M/B 恰好 1.0000 → X 比其它字母高 9%、四个尖端上下各
    //  戳出 4.5%（截图可见 X 左下尖穿透 E 的底横线）。
    //  平行四边形把端头切成【水平】，与字顶/基线齐平 → X 精确 1.0000 高。
    //  边长不变（中心线仍 L、粗细仍 T），端头总宽 w = T/|sin a|
    //  （保证两条长边垂距仍为 T → 粗细与面积都不变：L·T = L·w·|sin a|）。
    //
    //  ★ 姿态不能直接用 generatePlaneParams 返回的 xrot/yrot/zrot —— 那是「平铺」
    //    姿态（法线 ±Y）。斜笔的 yrot≠0（实测 84.74°），此时既有的 (xrot-90)
    //    不再等价于绕世界 X 立起 → 板被斜着插进画面、投影压扁
    //    （实测畸形外框 1.1241 × 0.1436）。故只取它解出的拉伸量 (extend_*)，
    //    姿态自己解：
    //      ① 用引擎自己的 computeTransformMatrix 把单位立方体拉成薄片（零旋转），
    //         数值读出 4 个真实角 → 两条边向量 + 法线（不手推拉伸公式）；
    //      ② 求旋转 R：长边 → 屏幕 X、法线 → 屏幕 Z；
    //      ③ 闭式分解回 Ry(-yrot)·Rx(xrot)·Rz(-zrot)（与引擎合成顺序一致）。
    //  ⚠️ 分解公式依赖 elements 的【列主序】：R[1][2]=e[9]、R[0][2]=e[8]、
    //     R[2][2]=e[10]、R[1][0]=e[1]、R[1][1]=e[5]。把 e[4] 误当 R[1][0]
    //     会让 zrot 全错（踩过：解出 zrot≈-97° 的畸形姿态）。
    //  ⚠️ 法线取反那一支（flip）与 ang 的符号有关，且随「取角顺序」而变 →
    //     不写死规律，直接两支都算、用引擎矩阵实测【端头 Δy 最小】的那支。
    //     离线逐角验证：X(±54.25°)、M(±54.13°)、以·提(33.7°) 均得端头 Δy=0，
    //     X 外框 0.9108 × 0.9999。
    // ═══════════════════════════════════════════════════════════════════════
    const R2D = 180 / Math.PI;
    // 是否走平行四边形：端头不能比笔画还宽（w ≤ L），且不能近似水平（|cos|→0 时 w→∞）
    // ★★ 2026-09-19 追加「**端头不许太长**」这条：w = th/|sin a| 只保证 w ≤ L，
    //   但短笔（如「提」）即使 w 略小于 L，切出水平端头后整块会长成一个【方斜块】——
    //   实测 拟·扌提(len 0.330 / ang 22.1°)：w/len = 0.846 → 板的真实外框 0.507×0.322
    //   （本该是 0.306×0.124），横向戳出字格到 x=-0.079；拟·以㇙提 w/len = 0.861 同理。
    //   渲染出来就是两团楔形尖片，「拟」直接读不出字形。
    //   → 再要求 w ≤ 0.60·L；不满足就退回【矩形】（端头垂直于笔画，短笔的正统形状）。
    //   ⚠️ 全标题只有这两条「提」会翻（已用离线复刻逐笔扫描确认：16 → 14 条平行四边形），
    //      X/M/撇/捺/点 等长笔 w/len ≤ 0.49 全部不受影响。
    //   ⚠️ `titleStrokeExtent` 必须与本函数同源（它已按同一判据分路），改这里就够。
    const TITLE_PARA_MAX_W = 0.60;
    function titleUsePara(len, th, ang) {
        const a = ang * Math.PI / 180;
        const sa = Math.abs(Math.sin(a));
        return sa > th / len
            && Math.abs(Math.cos(a)) > 0.05
            && (th / sa) <= TITLE_PARA_MAX_W * len;
    }
    // 笔画板在 x/y 上的【半展宽】（设计单位）——两遍都要用，必须同源
    function titleStrokeExtent(len, th, ang) {
        const a = ang * Math.PI / 180, sa = Math.abs(Math.sin(a)), ca = Math.abs(Math.cos(a));
        if (titleUsePara(len, th, ang)) {
            return { hx: 0.5 * len * ca + 0.5 * (th / sa), hy: 0.5 * len * sa };
        }
        return { hx: 0.5 * (len * ca + th * sa), hy: 0.5 * (len * sa + th * ca) };
    }
    // 单位立方体的 8 个角（与引擎 BoxGeometry(1,1,1) 一致）
    function titleCubeCorners(mat) {
        const out = [];
        for (let i = 0; i < 8; i++) {
            const v = new THREE.Vector3(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5).applyMatrix4(mat);
            if (!out.some(q => q.distanceTo(v) < 1e-3)) out.push(v);   // 去厚度（es=1e-4）
        }
        return out;
    }
    // 端头边（最短的那对角的连线）的 Δy：0 = 端头水平
    function titleCapDy(pts) {
        let minD = Infinity, dy = 0;
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
            const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
            if (d < minD) { minD = d; dy = Math.abs(pts[i].y - pts[j].y); }
        }
        return dy;
    }
    function titlePlateParams(len, th, ang) {
        if (!titleUsePara(len, th, ang)) {
            const r = generateRectParams(len, th);
            return { xrot: r.xrot - 90, yrot: r.yrot, zrot: r.zrot,     // ★ 立起来 → 正对相机
                scale: r.scale, extend_scale: r.extend_scale, extend_xrot: r.extend_xrot, extend_yrot: r.extend_yrot };
        }
        const a = ang * Math.PI / 180;
        const w = th / Math.abs(Math.sin(a));                            // 水平端头总宽
        const sp = generatePlaneParams(len, w, Math.abs(ang));           // 形状解（与预设同源）
        // ① 薄片的两条真实边 + 法线
        const cs = titleCubeCorners(computeTransformMatrix(
            [0, 0, 0, 0, 0, 0, sp.scale, sp.extend_scale, sp.extend_xrot, sp.extend_yrot, 0, 0, 0], 0, 0, 0));
        const ed = cs.slice(1).map(p => p.clone().sub(cs[0]));
        let e1 = ed[0], e2 = ed[1], minDot = Infinity;
        for (let i = 1; i < ed.length; i++) {
            const d = Math.abs(ed[i].clone().normalize().dot(e1.clone().normalize()));
            if (d < minDot) { minDot = d; e2 = ed[i]; }
        }
        const longV = (e1.length() >= e2.length() ? e1 : e2).clone().normalize();
        const nrm = new THREE.Vector3().crossVectors(e1, e2).normalize();
        // ②③ 两支法线方向各解一次姿态，取「端头水平」的那支（用引擎矩阵实测）
        let best = null;
        for (const sgn of [1, -1]) {
            const v2 = nrm.clone().multiplyScalar(sgn);
            const v1 = new THREE.Vector3().crossVectors(v2, longV);
            const e = new THREE.Matrix4().set(
                longV.x, longV.y, longV.z, 0,
                v1.x, v1.y, v1.z, 0,
                v2.x, v2.y, v2.z, 0, 0, 0, 0, 1).elements;
            const p = {
                xrot: Math.asin(Math.max(-1, Math.min(1, -e[9]))) * R2D,
                yrot: -Math.atan2(e[8], e[10]) * R2D,
                zrot: -Math.atan2(e[1], e[5]) * R2D,
                scale: sp.scale, extend_scale: sp.extend_scale,
                extend_xrot: sp.extend_xrot, extend_yrot: sp.extend_yrot
            };
            const dy = titleCapDy(titleCubeCorners(computeTransformMatrix(
                [0, 0, 0, p.xrot, p.yrot, p.zrot, p.scale, p.extend_scale, p.extend_xrot, p.extend_yrot, 0, 0, 0],
                0, 0, -ang)));
            if (!best || dy < best.dy) best = { p: p, dy: dy };
        }
        return best.p;
    }

    function buildIntroTitleBlocks() {
        let asp = camera.aspect;
        if (!(asp > 0) || !isFinite(asp)) asp = window.innerWidth / Math.max(1, window.innerHeight);

        // 排版：宽屏两行；竖屏「EX FMBE」一行太细（文字本身 ≈ 5.9:1）→ 拆成三行
        const LINES = asp >= 1.2
            ? [['E', 'X', ' ', 'F', 'M', 'B', 'e'], ['模', '拟', '器']]
            : [['E', 'X'], ['F', 'M', 'B', 'e'], ['模', '拟', '器']];

        const lineW = LINES.map(ln => ln.reduce((s, ch) => s + (TITLE_ADV[ch] || 1), 0));
        const W = Math.max.apply(null, lineW);
        const H = LINES.length + (LINES.length - 1) * TITLE_LINE_GAP;

        // ── 第 1 遍：把所有笔画摊平到设计坐标，量出【真实】外接矩形 ────────────
        //   ★ 不能拿「字宽之和 W × 行高之和 H」当外接框：笔画的 cx/cy 是【中心】，
        //     两端还要再各伸出 len/2（斜笔按 |cos|/|sin| 分解到 x/y）。
        //     按字框当外接框会偏小 → u 被算大 → 标题冲出画幅（实测横向 96%、
        //     顶部被切、右侧最后一个 E 直接出屏）。必须量真实外框。
        const place = [];                                     // {dx, dy, len, ang, th}（设计坐标）
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let mSlot = null;                                     // M 字槽（设计坐标）：M 用写死的用户模型，不走笔画板
        LINES.forEach((ln, li) => {
            const baseY = H - li * (1 + TITLE_LINE_GAP) - 1;   // 该行字形底边（设计坐标，y 向上）
            let x = (W - lineW[li]) / 2;
            ln.forEach(ch => {
                if (ch === 'M') { mSlot = { x: x, baseY: baseY }; x += (TITLE_ADV[ch] || 1); return; }  // M 用写死的用户模型，不生成笔画板
                const tbl = TITLE_LATIN[ch] || TITLE_CN[ch];
                // ★ 切角字母（F/B/e）统一收小：按字形实测高度归一到 TITLE_CUT_H，锚在「底部基线 + 水平中心」
                let _sc = 1, _ax = 0, _ay = 0;
                if (tbl && TITLE_CUT_LETTERS[ch]) {
                    const gb = titleGlyphBox(tbl);
                    _sc = TITLE_CUT_H / Math.max(1e-6, gb.mxY - gb.mnY);
                    _ax = (gb.mnX + gb.mxX) / 2; _ay = gb.mnY;
                }
                if (tbl) for (let si = 0; si < tbl.length; si++) {
                    const st = tbl[si];
                    const cx = _ax + (st[0] - _ax) * _sc, cy = _ay + (st[1] - _ay) * _sc;
                    const len = st[2] * _sc, ang = st[3], th = st[4] * _sc;
                    const dx = x + cx, dy = baseY + cy;
                    // 笔画绕自身中心转 ang 后，在 x/y 上的半展宽（矩形 / 平行四边形分路）
                    const hxTh = titleStrokeExtent(len, th, ang);
                    const hx = hxTh.hx, hy = hxTh.hy;
                    if (dx - hx < minX) minX = dx - hx;
                    if (dx + hx > maxX) maxX = dx + hx;
                    if (dy - hy < minY) minY = dy - hy;
                    if (dy + hy > maxY) maxY = dy + hy;
                    place.push({ dx: dx, dy: dy, len: len, ang: ang, th: th, ch: ch });
                }
                x += (TITLE_ADV[ch] || 1);
            });
        });
        const TW = maxX - minX, THH = maxY - minY;            // 真实外接框（设计单位）
        const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
        if (!(TW > 0) || !(THH > 0)) throw new Error('标题外接框异常');

        // ── 第 2 遍：按真实外接框反推「设计单位 → 世界单位」→ 任何画幅都不溢出 ──
        const TAN = Math.tan(45 * Math.PI / 360);             // fov=45 → 纵向半角 22.5°
        const frameW = 2 * TAN * asp * TITLE_CAM_DIST;
        const frameH = 2 * TAN * TITLE_CAM_DIST;
        const u = Math.min(frameW * TITLE_FILL_W / TW, frameH * TITLE_FILL_H / THH);
        if (!(u > 0) || !isFinite(u)) throw new Error('设计单位异常');

        // 牌心抬高到「下沿离地 0.65」。★ 0.42 不够：下落方块落地后是 scale1.5×es0.35 的
        //   扁板，顶面在 y≈0.526 —— 高出 0.42 的下沿 0.106 世界单位（≈10px），从「拟/器」
        //   的撇捺缝隙里顶出来，看着像字底下垫了一块random板子。
        //   抬到 0.65 后净空 0.124；又因为机位跟着牌心走（刚性），整个世界（网格/方块）
        //   在画面上整体下移 ≈0.23/11.94×1086 ≈ 21px → 方块彻底退到字底下，不再穿帮。
        const center = new THREE.Vector3(0, Math.max(1.60, THH * u / 2 + 0.65), TITLE_Z);
        const dir = new THREE.Vector3(0.18, 0.13, 1).normalize(); // 轻微 3/4 视角
        // ★ 机位锚在【TITLE_CAM_ANCHOR_Z】那张牌面上（不是实际牌面）→ 牌面后退时机位不动，
        //   字才真的离镜头远（缩小 11.5/真实距离）。锚点取 0.8 时与历史机位逐位相同。
        const camNear = new THREE.Vector3(center.x, center.y, TITLE_CAM_ANCHOR_Z)
            .addScaledVector(dir, TITLE_CAM_DIST);
        // ★ 视线仍落在【实际牌面】上（跟着后退），且偏移量按【真实距离】折算 →
        //   视线相对画幅的夹角与原来完全一致（= 2·TAN·asp·TITLE_LOOK_*），
        //   所以构图（字的屏幕位置 / 副标题净空）严格保持，只是整体缩小了 3.8%。
        const _dReal = camNear.distanceTo(center);
        const _frameW2 = 2 * TAN * asp * _dReal;
        const _frameH2 = 2 * TAN * _dReal;
        // ★ 视线对准牌心 → 牌心精确落在画面正中（与相机横向偏移无关）；
        //   再压低 view 点让标题上移（给副标题留净空）、右移 view 点抵消透视右倾。
        const look = new THREE.Vector3(
            center.x + _frameW2 * TITLE_LOOK_DX,
            center.y - _frameH2 * TITLE_LOOK_DY,
            center.z
        );

        // 逐条笔画建方块
        const plates = [];
        const normK = TW + THH * 0.9;                         // 斜向（右下）搭建波
        for (let i = 0; i < place.length; i++) {
            const sp = place[i];
            const len = sp.len, ang = sp.ang, th = sp.th;
            const p = titlePlateParams(len * u, th * u, ang);
            const b = makeBlock('intro_tb' + plates.length, 'cube', M13({
                xpos: (sp.dx - midX) * u,
                ypos: center.y + (sp.dy - midY) * u,
                zpos: center.z,
                xrot: p.xrot,                         // ★ 已在 titlePlateParams 内立起/解姿态
                yrot: p.yrot,
                zrot: p.zrot,
                scale: p.scale,
                // ★★ 板厚不能真的取 generateRectParams 的 1e-4：那样实际厚度只有
                //    scale×1e-4 ≈ 2.5e-4（世界单位），而相机在 11.5 外 → 前后两个大面
                //    落在同一个深度量化台阶里，逐像素互相抢深度（z-fighting）。
                //    症状：整条笔画上撒满单像素暗点；又因为板的倾斜角处处不同、深度差
                //    平滑变化 → 抢深度的概率也平滑变化 → 暗点连成弧状条纹 = 用户报的「摩尔纹」。
                //    （实测：混叠误差 6.4% of contrast → 0.7%，笔画内部噪声 1.91 → 1.02）
                //    抬到 0.006 世界单位 ≈ 0.57 CSS px，仍是发丝级，但深度已能稳定分辨。
                // ★ 2026-09-21 用户定稿：标题笔画回到「2D 平面生成器」的无厚度扁平观感，
                //   不要厚实 3D 方块（TITLE_BAR_DEPTH=1.0 实验方案已废弃删除）。
                //   厚度取发丝级 TITLE_PLATE_THICK：纯 0 会被深度量化产生摩尔纹（暗点连成
                //   弧状条纹），0.006 世界单位 ≈ 0.57 CSS px，视觉上是平面但深度稳定。
                //   world 厚度 = p.scale × extend_scale，故 extend_scale = TITLE_PLATE_THICK/p.scale。
                extend_scale: TITLE_PLATE_THICK / p.scale,
                extend_xrot: p.extend_xrot,
                extend_yrot: p.extend_yrot
            }), { url: TITLE_TEX });
            // ★ 真实方块：保留 createCubeGeometry 的局部法线顶点烘焙（顶/底/侧明暗），
            //   不强制双面、也不统一亮度 —— 立体倒角即来自此，且符合模拟器普通方块行为。
            // ★★ v.rotatez 不在 initFromM 的 13 个核心名里（见 12595 行注释）→ 新方块
            //    scope 里【根本没有】这个变量；而 setVar 内部是 `if (d) {…}`（没有 else）
            //    → 变量不存在时【静默什么都不做】。
            //    踩过的坑：所有笔画因此停在 generateRectParams 的原始朝向（长边恒为水平），
            //    渲染出来是一堆横条，字完全不成形（竖笔、撇捺全丢）。
            //    故此处必须先补建变量，再写值。
            if (ang) {
                if (!b.scope.vars.has('v.rotatez')) {
                    const rgZ = getDefaultRange('v.rotatez');
                    b.scope.addVar('v.rotatez', '0', rgZ.min, rgZ.max, rgZ.step);
                }
                setVar(b, 'v.rotatez', -ang);          // ★ 全局 rotatez = 面内旋转
            }
            // ★★ 2026-09-26 用户报「字体左上切角有点发黑」的真正根因：
            //   createCubeGeometry 给两个大面（local ±Y —— 板厚恒在 local Y）烘焙了【不同】明度：
            //   Y− 面 0.5、Y+ 面 1.0。rect 板「立起来」后朝向相机的恰是亮的 Y+ 面；而 36° 斜板
            //   （切角搭桥那三条中的斜边）走的是另一支解姿态、法线符号被取反 → 朝向相机的变成暗的
            //   Y− 面 ⇒ 整块斜板只剩一半亮度，叠在竖笔頂部 = 左上切角「发黑」。
            //   （实证：把该几何的顶点色全强制 1.0 后，暗带/发黑完全消失。）
            //   修法：把这两个大面的顶点色统一成较亮那个（都是发丝级薄板、朝相机的那面恒亮）；
            //   rim 面顶点色保持不动，仍留一圈发丝级倒角（像素级不可见）。顶点色是运行期几何属性，
            //   不参与命令导出 → 导出指令与「真实方块」通用性完全不受影响。
            try {
                const _cg = b.mesh && b.mesh.geometry && b.mesh.geometry.attributes && b.mesh.geometry.attributes.color;
                if (_cg && _cg.count >= 12) {                 // 前 12 个顶点 = CUBE_FACES 的 0/1 两面（非索引，每面 6 顶点）
                    let _mx = 0;
                    for (let i = 0; i < 12; i++) _mx = Math.max(_mx, _cg.getX(i));
                    if (_mx > 0) { for (let i = 0; i < 12; i++) _cg.setXYZ(i, _mx, _mx, _mx); _cg.needsUpdate = true; }
                }
            } catch (e) {}

            // 记录基矩阵，并把当前矩阵压成零缩放（退化三角形 → 不产生任何像素），
            // 保证 T_TITLE 之前绝对不可见（截图实证）
            const base = Float32Array.from(b.mesh.matrix.elements);
            const el = b.mesh.matrix.elements;
            el[0] = el[1] = el[2] = el[4] = el[5] = el[6] = el[8] = el[9] = el[10] = 0;
            b.mesh.matrixWorldNeedsUpdate = true;

            plates.push({
                mesh: b.mesh, base: base,
                k: ((sp.dx - minX) + (maxY - sp.dy) * 0.9) / normK,   // 右下斜向搭建波
                block: b                                              // ★ 保留方块引用（导出可复制指令/调试用）
            });
        }

        // ★ 2026-09-26（第二轮）：这里曾把标题笔画换成「只取贴图内芯」的克隆贴图
        //   （repeat 0.72 / offset 0.14）来避开钻石贴图外圈的深色边框。**已撤销，不要再加回来。**
        //   原因（A/B 实测，同一机位同一冻结时刻）：
        //     · 内芯 0.72：字母亮度 mean=197.8 / p10=175.8 → 通体发白、扁平、没有方块质感；
        //     · 完整贴图： 字母亮度 mean=189.2 / p10=142.7 → 与「改动前」的 190 / 142.7 逐位吻合。
        //   即「字变亮变平」100% 来自取内芯（贴图整幅 194.6 vs 内芯 203.3，且整幅那圈 143 的
        //   暗边正是字母的立体感来源）。而它原本要治的「左上切角发黑」真凶是**顶点色面翻转**
        //   （见上方每块板统一前 12 顶点那段），那处已单独修好 —— 恢复完整贴图后放大看，
        //   切角只剩一层自然的倒角暗面，与所有笔画边缘一致，不再发黑。

        // ── M 专用：写死的用户 4 块橙色羊毛模型（真实 makeBlock；只改 v.rotatey 把它正对相机）──
        //   相似变换 final = T·Ry(theta)·(C0 + mS·(q−C0))：等比缩放 mS 保形不拉伸；绕 Y 转
        //   theta 让原生「法线沿 X」的平躺 M 正对相机（+Z）；平移 T 落到 M 字槽中心。
        //   ★ 各块自身的 xrot/yrot/zrot 与全局 rotatez 一律原样保留，只动 v.rotatey。
        if (mSlot) {
            // ① M 字槽外接框（同 place 算法）
            let mMinX = Infinity, mMaxX = -Infinity, mMinY = Infinity, mMaxY = -Infinity;
            for (const st of TITLE_LATIN.M) {
                const hx = titleStrokeExtent(st[2], st[4], st[3]);
                const dx = mSlot.x + st[0], dy = mSlot.baseY + st[1];
                if (dx - hx.hx < mMinX) mMinX = dx - hx.hx;
                if (dx + hx.hx > mMaxX) mMaxX = dx + hx.hx;
                if (dy - hx.hy < mMinY) mMinY = dy - hx.hy;
                if (dy + hx.hy > mMaxY) mMaxY = dy + hx.hy;
            }
            const mTargetW = (mMaxX - mMinX) * u, mTargetH = (mMaxY - mMinY) * u;
            const mTargetCenter = new THREE.Vector3(
                ((mMinX + mMaxX) / 2 - midX) * u,
                center.y + ((mMinY + mMaxY) / 2 - midY) * u,
                center.z
            );
            // ② 引擎同款矩阵量出模型原生中心 + 绕 Y(theta) 后的展宽（theta=Ry(90)：(x,z)→(z,−x)）
            const mCorners = [];
            for (const blk of TITLE_M_MODEL) {
                const m = computeTransformMatrix(M13(blk), 0, 0, blk.rotatez);
                for (let i = 0; i < 8; i++) {
                    const v = new THREE.Vector3((i & 1) ? 0.5 : -0.5, (i & 2) ? 0.5 : -0.5, (i & 4) ? 0.5 : -0.5);
                    mCorners.push(v.applyMatrix4(m));
                }
            }
            const mC0 = new THREE.Vector3();
            mCorners.forEach(p => mC0.add(p)); mC0.multiplyScalar(1 / mCorners.length);
            const _cy = Math.cos(TITLE_M_YAW * Math.PI / 180), _sy = Math.sin(TITLE_M_YAW * Math.PI / 180);
            let mMinYr = Infinity, mMaxYr = -Infinity, mMinXr = Infinity, mMaxXr = -Infinity;
            for (const p of mCorners) {
                const rx = p.x * _cy + p.z * _sy, ry = p.y, rz = -p.x * _sy + p.z * _cy;
                if (ry < mMinYr) mMinYr = ry; if (ry > mMaxYr) mMaxYr = ry;
                if (rx < mMinXr) mMinXr = rx; if (rx > mMaxXr) mMaxXr = rx;
            }
            const mWn0 = mMaxXr - mMinXr, mHn0 = mMaxYr - mMinYr;
            const mS = Math.min(mTargetW / mWn0, mTargetH / mHn0);   // 等比缩放（设计/原生）
            // ★ 竖直对齐：让模型【底边坐在基线上】，与其余字母共用同一条基线。
            //   用户模型长宽比 1.96、字槽 1.37 → mS 由宽度定，高度只有字槽的 ~70%，
            //   若把外接框中心对到字槽中心，M 会比别的字母整体上浮（实测浮 0.25 世界单位）。
            //   基线 = 设计字格 y=0 对应的世界高度 = center.y + (字槽底 − midY)·u。
            mTargetCenter.y = (center.y + (mMinY - midY) * u) + (mHn0 * mS) / 2;
            // ③ 逐块装配：模型中心 → 字槽中心
            const sC0 = new THREE.Vector3(mC0.x * mS, mC0.y * mS, mC0.z * mS);
            const sC0r = new THREE.Vector3(sC0.x * _cy + sC0.z * _sy, sC0.y, -sC0.x * _sy + sC0.z * _cy);
            const mT = mTargetCenter.clone().sub(sC0r);
            const mK = (((mMinX + mMaxX) / 2 - minX) + (maxY - (mMinY + mMaxY) / 2) * 0.9) / normK;  // build 波次
            for (const blk of TITLE_M_MODEL) {
                const b = makeBlock('intro_tb' + plates.length, 'cube', M13({
                    xpos: mT.x, ypos: mT.y, zpos: mT.z,
                    xrot: blk.xrot, yrot: blk.yrot, zrot: blk.zrot,
                    scale: mS * blk.scale,
                    // ★ extend_scale 保持用户的 0【构造期原样不改】：clampEs 早已把 es=0 钳成 1e-4，
                    //   不存在真零厚片；此前"零厚摩尔纹 / 被剪切"的判断都不成立，唯一真凶是 basepos。
                    //   ▲ 注意：这只是【模型构造】层面的原样保留；导出侧已于 2026-10-01 统一收口，
                    //     任何 es=0 落库时都会写成 0.0001（见 _fv / fmtV / ES_EXPORT_MIN），两者并不矛盾。
                    extend_scale: blk.extend_scale,
                    extend_xrot: blk.extend_xrot, extend_yrot: blk.extend_yrot,
                    // ★★ basepos 必须保持【原值】，绝不能再乘 mS！
                    //   引擎矩阵链 localMat = Ry·Rx·Rz · S · Eyl·Exl·Es·Exr·Eyr·Esy · B，
                    //   basepos 的平移 B 位于 S 的【里层】→ 它已经天然被 scale 缩放了一次。
                    //   若这里再乘 mS，平移量会变成 mS²（实测 mS=0.3223 → 布局被径向压到 0.32
                    //   倍），四笔互相穿插塌成一团乱麻。保持原值 ⇒ final = mS·原生 + 偏航 + 平移。
                    //   （逐块验证：偏移 = 原生偏移 × mS² 完全吻合，确认就是这里多乘了一次。）
                    xbasepos: blk.xbasepos, ybasepos: blk.ybasepos, zbasepos: blk.zbasepos
                }), { url: TITLE_M_TEX });
                // v.rotatey / v.rotatez 不在 initFromM 的 13 核心名内 → 先补建变量再写值
                for (const nm of ['v.rotatey', 'v.rotatez']) {
                    if (!b.scope.vars.has(nm)) {
                        const rg = getDefaultRange(nm);
                        b.scope.addVar(nm, '0', rg.min, rg.max, rg.step);
                    }
                }
                setVar(b, 'v.rotatey', -TITLE_M_YAW);   // ★ 只改这个旋转变量把 M 转正对相机
                setVar(b, 'v.rotatez', blk.rotatez);    //   模型自身的 rotatez 原样保留
                // 记录基矩阵并压成零缩放（T_TITLE 前不可见），与笔画板一致
                const base = Float32Array.from(b.mesh.matrix.elements);
                const el = b.mesh.matrix.elements;
                el[0] = el[1] = el[2] = el[4] = el[5] = el[6] = el[8] = el[9] = el[10] = 0;
                b.mesh.matrixWorldNeedsUpdate = true;
                plates.push({ mesh: b.mesh, base: base, k: mK, block: b });
            }
        }

        if (plates.length < 8) throw new Error('笔画数过少: ' + plates.length);

        return {
            plates, camNear: camNear.toArray(), look: look.toArray(),
            W: W, H: H, TW: TW, TH: THH, u: u, asp: asp, lines: LINES.length
        };
    }
    let titleBlocks = null;
    try { titleBlocks = buildIntroTitleBlocks(); }
    catch (e) { console.warn('[开场] 笔画标题构建失败，回退 DOM 文字标题：', e); titleBlocks = null; }
    window.__introTitle = titleBlocks;   // 探针挂钩：量测/导出标题方块（量完即弃，但保留无副作用）

    // —— ① 单个原木方块（项目原木）——
    const oak = makeBlock('intro_oak', 'cube', M13({ ypos: 0.5, scale: 1 }), { faces: oakFaces });
    // —— ② 钻石 5 块模型（来自 model.geo_ex公版_5块.txt）——
    const MODEL = [
        { xpos: 0, ypos: 1, zpos: 0, scale: 2, extend_xrot: -90 },
        { ypos: 3, scale: 2, extend_xrot: -90 },
        { ypos: 3.66094, zpos: -0.05938, xrot: 20, scale: 2, ybasepos: 0.5, extend_xrot: -90 },
        { ypos: 0.53646, zpos: -1.84393, xrot: 32.5, scale: 2, extend_scale: 0.0223606798, extend_xrot: -90 },
        { ypos: 1.89318, zpos: -3.26118, xrot: 55, scale: 2, extend_scale: 0.0223606798, extend_xrot: -90 }
    ];
    const diamonds = MODEL.map((m, i) => makeBlock('intro_d' + i, 'cube', M13(m), { url: DIAMOND }));
    diamonds.forEach(d => { d.mesh.visible = false; d._targetScale = 2; });
    // —— ②b 千禧年科技学院校徽（6 块薄板，Cube1~Cube6；user 提供的 playanimation 数据）——
    //     6 块均为 X 向薄板（厚≈0.28），整体平铺在 Y-Z 平面 → 正面欣赏须沿 X 轴观看
    //     每块保留自己的 v.scale（0.22~0.45）；数据本身已居中（整体中心≈[-0.06,-0.24,0.11]），不做偏移
    const ATK = [
        { xbasepos: -1.7491, ybasepos: -1.2403, zbasepos: -0.9773, zrot: 90, scale: 0.2485, extend_scale: 0.4797, extend_yrot: 90 },        // Cube6
        { xrot: -12.1659, zrot: 90, scale: 0.2199, extend_scale: 0.5033, extend_yrot: 64.1046, xbasepos: -1.7434, ybasepos: -1.2964, zbasepos: 1.0007 }, // Cube5
        { xrot: 14.1974, zrot: 90, scale: 0.2595, extend_scale: 0.4235, extend_yrot: -64.2652, xbasepos: -1.7434, ybasepos: -1.303, zbasepos: 0.1066 }, // Cube4
        { xrot: 56.9117, zrot: 90, scale: 0.4022, extend_scale: 0.2732, extend_yrot: 85.2175, xbasepos: 1.7154, ybasepos: -1.3155, zbasepos: -0.4456 }, // Cube3
        { xrot: 57.195, zrot: 90, scale: 0.4475, extend_scale: 0.2456, extend_yrot: 85.7689, xbasepos: 0.2137, ybasepos: -1.3027, zbasepos: -0.1324 }, // Cube2
        { xrot: 57.195, zrot: 90, scale: 0.4475, extend_scale: 0.2456, extend_yrot: 85.7689, xbasepos: -1.2845, ybasepos: -1.3027, zbasepos: 0.1803 }  // Cube1
    ];
    const atk = ATK.map((m, i) => makeBlock('intro_atk' + i, 'cube', M13(m), { url: DIAMOND }));
    atk.forEach(d => { d.mesh.visible = false; d._targetScale = (d.scope.vars.get('v.scale') || { value: 1 }).value; });

    // —— 巡游：把上面刚构建好的开场模型按「组」切开 → 一字排开 → 逐块导出 FMBE 指令 ——
    //   ★ 必须在这些方块被销毁前调用；导出完由调用方统一 dispose。
    //   ★ 位移直接加在 xpos/ypos/zpos 上：引擎矩阵链 matP·globalRot·localMat 里 matP 是
    //     【最外层纯世界平移】，与方块自身旋转无关，所以「世界轴 +d」就是这三个变量 +d。
    function collectIntroModelCommands() {
        const mk = (key, name, icon, desc, entries) => ({ key, name, icon, desc, entries });
        const fromBlocks = bs => bs.map(b => ({ block: b, mat: b.mesh.matrix }));
        // ★ fall 块在开场里被关键帧接管（scope 变成 molang 程序，由 q.anim_time 驱动下落）→
        //   直接导出会输出一长串「动画程序」而不是静态姿态，还带 'anim:' 标签（导入后又自己播起来）。
        //   巡游要的是【静态模型】：先摘掉它的关键帧，再用同一份构造参数建一个「平装孪生块」导出。
        try { keyframeData.delete('intro_fall'); } catch (e) {}
        const fallPlain = makeBlock('intro_fall', 'cube', M13({ ypos: 12, scale: 1.5 }), { url: DIAMOND });
        // 标题笔画板：构建后矩阵被压成零缩放（T_TITLE 前不可见），必须用 pl.base 里的【完整矩阵】量尺寸
        const fromPlates = () => ((titleBlocks && titleBlocks.plates) ? titleBlocks.plates.map(pl => ({
            block: pl.block, mat: new THREE.Matrix4().fromArray(pl.base)
        })) : []);
        const raw = [
            mk('oak',     '原木方块',             'cube',   '1 块 · 橡木原木（开场起点）',   fromBlocks([oak])),
            mk('diamond', '钻石 5 块',            'cube',   '5 块 · 开场俯视模型',           fromBlocks(diamonds)),
            mk('badge',   '学院校徽',             'image',  '6 块 · 钻石薄板',               fromBlocks(atk)),
            mk('fall',    '下落钻石方块',         'film',   '1 块 · 开场下落主体（静态姿态）', fromBlocks([fallPlain])),
            mk('title',   '标题「EX FMBE模拟器」', 'folder', '64 钻石 + 4 橙色羊毛（M）',    fromPlates())
        ].filter(g => g.entries.length > 0);

        // ① 逐组量世界包围盒（用构建时的矩阵，与后面加的位移无关）
        const GAP = 1.6;                      // 组间水平间距（世界单位）
        const st = raw.map(g => {
            let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity, mnZ = Infinity, mxZ = -Infinity;
            for (const e of g.entries) {
                for (let i = 0; i < 8; i++) {
                    const v = new THREE.Vector3((i & 1) ? .5 : -.5, (i & 2) ? .5 : -.5, (i & 4) ? .5 : -.5).applyMatrix4(e.mat);
                    if (v.x < mnX) mnX = v.x; if (v.x > mxX) mxX = v.x;
                    if (v.y < mnY) mnY = v.y; if (v.y > mxY) mxY = v.y;
                    if (v.z < mnZ) mnZ = v.z; if (v.z > mxZ) mxZ = v.z;
                }
            }
            if (!isFinite(mnX)) { mnX = mxX = mnY = mxY = mnZ = mxZ = 0; }
            return { g, mnX, mxX, mnY, mxY, mnZ, mxZ, w: mxX - mnX, h: mxY - mnY };
        });
        // ② 一字排开：底边贴地（minY→0）、前后居中（z 中心→0），最后整排居中到原点
        let cur = 0;
        for (const s of st) {
            s.dx = cur - s.mnX;
            s.dy = -s.mnY;
            s.dz = -((s.mnZ + s.mxZ) / 2);
            cur += s.w + GAP;
        }
        const totalW = st.length ? Math.max(0, cur - GAP) : 0;
        for (const s of st) s.dx -= totalW / 2;

        // ③ 导出指令（位移写进变量 → 取指令文本；这批方块随后即被销毁，无需还原）
        //   ★ 2026-09-26：每组独立 try/catch —— 任何一组导出失败只丢这一组，不再让整场
        //     巡游因单组异常而整体「采集失败」；同时把失败组打到控制台便于定位。
        const out = [];
        for (const s of st) {
            try {
                const bump = (b, n, d) => {
                    if (!d) return;
                    const d0 = b.scope.vars.get('v.' + n);
                    setVar(b, 'v.' + n, (d0 ? Number(d0.value) || 0 : 0) + d);
                };
                const commands = s.g.entries.map(e => {
                    bump(e.block, 'xpos', s.dx); bump(e.block, 'ypos', s.dy); bump(e.block, 'zpos', s.dz);
                    return getCommandTextForBlock(e.block);
                });
                out.push({
                    key: s.g.key, name: s.g.name, icon: s.g.icon, desc: s.g.desc,
                    count: s.g.entries.length, commands,
                    size: [Math.round(s.w * 100) / 100, Math.round(s.h * 100) / 100]
                });
            } catch (e) { console.warn('[巡游] 分组导出失败，已跳过该组：', s.g && s.g.key, e); }
        }
        return out;
    }


    // —— ③ 下落的钻石方块（真实关键帧动画：下落 + 旋转 + 变扁）——
    const fall = makeBlock('intro_fall', 'cube', M13({ ypos: 12, scale: 1.5 }), { url: DIAMOND });
    fall.mesh.visible = false;
    const fallFrames = new Map();
    fallFrames.set(0,    new Map([['ypos', 12], ['yrot', 0], ['extend_scale', 1]]));
    fallFrames.set(2.6,  new Map([['ypos', 0.75], ['yrot', 620], ['extend_scale', 1]]));
    fallFrames.set(3.0,  new Map([['ypos', 0.263], ['yrot', 720], ['extend_scale', 0.35]]));
    keyframeData.set('intro_fall', { frames: fallFrames, animId: 'intro_fall_anim' });

    // ★ 巡游采集出口（opts.collectOnly）：不播动画，只把开场模型【原样构建一遍】→ 导出 FMBE
    //   指令 → 立刻把场景/相机/网格/方块可见性还原（不淡出、不写「已看过」）。
    //   与开场共用同一份构建代码（makeBlock / buildIntroTitleBlocks / TITLE_M_MODEL），
    //   保证「巡游」加载到的模型与初次开启时看到的完全同源、可被 playanimation 复刻。
    // ═══════════════════════════════════════════════════════════════════════
    if (opts && opts.collectOnly) {
        let results = [];
        try { results = collectIntroModelCommands(); }
        catch (e) { console.warn('[巡游] 采集开场模型失败：', e); }
        try {   // —— 还原进入前的真实场景（与 finish() 的收尾一致，但不 markIntroSeen / 不淡出）——
            introBlocks.forEach(b => {
                const obj = b.mesh || b.rootGroup;
                if (obj && obj.parent) obj.parent.remove(obj);
                try {
                    obj.traverse(o => {
                        if (o.geometry) o.geometry.dispose();
                        if (o.material) {
                            const ms = Array.isArray(o.material) ? o.material : [o.material];
                            ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
                        }
                    });
                } catch (e) {}
            });
        } catch (e) {}
        keyframeData.delete('intro_fall');
        _hiddenBlocks.forEach(b => { if (b.mesh) b.mesh.visible = true; });
        showGrid = _showGridSaved; showTicks = _showTicksSaved;
        controls.enabled = _cEnabled; controls.enableDamping = _cDamp;
        camera.position.copy(_camPos0); controls.target.copy(_tgt0); camera.zoom = _camZoom0; camera.fov = _camFov0; camera.updateProjectionMatrix();
        if (pm) pm.style.display = _pmDisplay;
        if (typeof opts.onCollect === 'function') opts.onCollect(results);
        return;
    }

    // 预加载用到的原版贴图，避免开场白块闪现
    const _need = [OAK, OAK_TOP, DIAMOND, 'orange_wool.png'];
    const _loadOne = (u) => new Promise(res => {
        try { loadTextureCached(texUrl(u), () => res()); } catch (e) { res(); }
        setTimeout(res, 2500);
    });

    // 透明舞台层：仅承载文字（标题 / 跳过提示 / 节拍字幕），真实场景从画布透出
    const overlay = document.createElement('div');
    overlay.id = 'exIntro';
    overlay.innerHTML =
        '<div class="ex-intro-title" id="exIntroTitle">' +
            '<div class="ex-intro-logo">EX FMBE模拟器</div>' +
            '<div class="ex-intro-sub">MCBE FMBE(EX版) 模拟器 · 帮助你高效折磨狐狸</div>' +
        '</div>' +
        '<div class="ex-intro-cap" id="exIntroCap"></div>' +
        '<div class="ex-intro-skip" id="exIntroSkip">点击任意处 / 按 Esc 跳过</div>';
    const style = document.createElement('style');
    style.id = 'exIntroStyle';
    style.textContent =
        '#exIntro{position:fixed;inset:0;z-index:10002;overflow:hidden;background:transparent;opacity:1;transition:opacity .6s ease;}' +
        '#exIntro.fade{opacity:0;}' +
        '.ex-intro-title{position:absolute;left:0;right:0;top:37%;text-align:center;color:#eef3ff;opacity:0;transform:translateY(16px);transition:opacity 1s ease,transform 1s ease;pointer-events:none;font-family:"Segoe UI","PingFang SC",sans-serif;text-shadow:0 6px 40px rgba(0,0,0,.55);}' +
        '.ex-intro-title.show{opacity:1;transform:none;}' +
        '.ex-intro-logo{font-size:56px;font-weight:800;letter-spacing:2px;}' +
        '.ex-intro-sub{margin-top:12px;font-size:15px;opacity:.82;letter-spacing:1px;}' +
        // 方块标题模式：主标题已由场景内方块承担，DOM 只留副标题，并落到方块标题带下方
        '.ex-intro-blocktitle .ex-intro-title{top:auto;bottom:27%;}' +
        '.ex-intro-blocktitle .ex-intro-sub{margin-top:0;font-size:16px;text-shadow:0 2px 14px rgba(0,0,0,.7);}' +
        '.ex-intro-cap{position:absolute;left:0;right:0;bottom:56px;text-align:center;color:rgba(230,238,255,.8);font-size:13.5px;letter-spacing:1px;opacity:0;transition:opacity .5s ease;pointer-events:none;font-family:"Segoe UI","PingFang SC",sans-serif;text-shadow:0 2px 12px rgba(0,0,0,.6);}' +
        '.ex-intro-cap.show{opacity:1;}' +
        '.ex-intro-skip{position:absolute;left:0;right:0;bottom:24px;text-align:center;color:rgba(230,238,255,.55);font-size:12.5px;letter-spacing:1px;opacity:0;transition:opacity .5s ease;pointer-events:none;}' +
        '.ex-intro-skip.show{opacity:1;}' +
        // 纯展示开场：隐藏所有编辑器 UI 铬（顶栏 / 变量面板 / 侧栏 / 关键帧面板 等），避免透出影响观感；结尾还原
        'body.ex-intro-playing #uiScaleTarget,body.ex-intro-playing #dataPanel,body.ex-intro-playing #kfDataPanel,body.ex-intro-playing #sideBlockList,body.ex-intro-playing #dataViewHeader,body.ex-intro-playing #folderValuesFloat,body.ex-intro-playing #sideListResizeHandle{display:none!important;}';
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    document.body.classList.add('ex-intro-playing'); // 隐藏编辑器 UI 铬，纯展示开场

    if (titleBlocks) {   // 方块标题已建好 → 收起 DOM 主标题（构建失败时保留它做兜底）
        overlay.classList.add('ex-intro-blocktitle');
        const _logoEl = overlay.querySelector('.ex-intro-logo');
        if (_logoEl) _logoEl.style.display = 'none';
    }

    const titleEl = overlay.querySelector('#exIntroTitle');
    const capEl = overlay.querySelector('#exIntroCap');
    const skipEl = overlay.querySelector('#exIntroSkip');

    // ★ 收尾机位：T_TITLE 之后停在「场景内方块搭建的标题」正前方
    //   _TC = 标题方块算出来的机位/视点；若体素标题构建失败则退回旧的收尾机位（DOM 标题）
    //   _FC = 跟随下落方块那一段（frame() 里覆盖相机）的终点；25.8 处两者同值 → 交接零跳变
    //   _MX(f) = 在 _FC → _TC 之间取 f 比例的内插点，保证逐轴单调（F–C 切线才不会被打成 0）
    const _TN = (titleBlocks && titleBlocks.camNear) ? titleBlocks.camNear : [5.5, 4.5, 9.5];
    const _TL = (titleBlocks && titleBlocks.look) ? titleBlocks.look : [0, 2.0, 0];
    const _FC = { p: [7, 0.263 + 2.6, 11], l: [0, 0.263, 0] };
    // ★ 全部关键帧都落在「_FC → 收尾机位」这条直线的不同比例点上 → 逐轴严格单调，
    //   F–C 切线不会被折返打回 0 → 收尾段全程匀速无停顿（用户对"一顿一顿"极敏感，勿改成先拉远再推近）
    const _P = (f) => [0, 1, 2].map(i => _FC.p[i] + (_TN[i] - _FC.p[i]) * f);
    const _L = (f) => [0, 1, 2].map(i => _FC.l[i] + (_TL[i] - _FC.l[i]) * f);

    // 相机运镜路径（绝对时刻 → 机位 / 视点）；下落段会额外用「跟随方块」覆盖
    // 注：已取消 cut 硬切 —— 钻石→校徽改为「模型先交换、相机再短距滑入」的柔和过渡
    const CAM = [
        { t: 0,    p: [0, 1.2, 7],        l: [0, 0.6, 0] },
        { t: 4,    p: [0, 1.2, 7],        l: [0, 0.6, 0] },
        // ② 钻石 5 块：从正视拉到俯视
        { t: 9,    p: [0, 8.6, 0.01],     l: [0, 0.6, 0] },
        { t: 11.5, p: [7, 4.5, 9],        l: [0, 2.0, -1.0] },
        { t: 14.2, p: [7, 6.5, 10.5],     l: [0, 4.0, -0.5] },
        // ②→③ 推镜 → 转校徽：单段推进 + 单段滑入（关键帧少 = Hermite 切线平缓 = 速度均匀）
        //   钻石整体 AABB（运行期 Box3 实测）：x∈[-1,4] y∈[-1.613,8.415] z∈[-3.835,4.097]
        //   ★ 相机必须停在块体之外（+X 面 x=4、+Z 面 z=4 → 机位 x>4.5 或 z>4.5）
        //   ★ 曾把 14.9/15.3/15.65 三帧挤在 0.8s 内 → 切线被邻段撑大 → 速度冲到 23.6u/s 又急刹到 0.24u/s。
        //     现合并为 15.4（推镜终点，贴着钻石外沿）+ 16.6（校徽正面），时长按距离配平，峰值降到 ~7u/s。
        { t: 15.4, p: [4.6, 2.2, 5.2],    l: [1.2, 0.6, 1.2] },   // ← 推镜终点：贴近钻石块外沿
        // ★★ 过渡（无硬切）：模型在 t=T_ATK=15.4 已交换为校徽、钻石已隐藏 → 走廊内无几何体，相机自由滑入
        //    校徽实测 AABB center=[-0.058,-0.240,0.133] size=[0.298,1.019,1.073]
        //    滑入 1.2s（峰值 ~8u/s，减速平缓，不会"急刹"）；收在 d=1.68 → 占画幅高 75%（正面清晰不裁切）
        { t: 16.6, p: [1.62, -0.24, 0.133], l: [-0.058, -0.24, 0.133] }, // ← 校徽正面清晰
        { t: 18.6, p: [2.41, -0.24, 0.133], l: [-0.058, -0.24, 0.133] },
        { t: 20.6, p: [3.66, -0.22, 0.133], l: [-0.058, -0.24, 0.133] },
        // ③ 落回全景 → ④ 收在「场景内方块搭建的标题」正前方
        { t: 23.5, p: [7, 3, 11],         l: [0, 0.6, 0] },
        // ★ 25.8 = 下方「跟随下落方块」覆盖段的结束时刻，此帧与覆盖段终点严格同值 → 交接无跳变
        { t: 25.8, p: _FC.p,              l: _FC.l },
        // 1.2s 内把机位摆正 + 视线抬起（看向落地方块 → 看向标题中心）；
        // 视线在 27.0 就已到位（标题 27.2 开始搭建 → 搭建全程画面居中），
        // 机位则一路缓推到 32.0 —— 搭建期间始终有极缓运镜，避免"停在那一动不动"。
        { t: 26.4, p: _P(0.30),           l: _L(0.85) },
        { t: 27.0, p: _P(0.60),           l: _TL },
        { t: 32.0, p: _TN,                l: _TL },
        { t: 34,   p: _TN,                l: _TL }
    ];
    const DUR = 34;
    const smooth = (x) => x * x * (3 - 2 * x);

    // ★ 单调三次（Fritsch–Carlson）切线表 —— 运镜平滑的关键，务必保留。
    //   为什么不用逐段 ease：ease 两端导数=0 → 每个关键帧都"停一下"（停—走—停）。
    //   为什么不用普通 Hermite：中央差分在「换向关键帧」会算出反向切线
    //     （例：校徽正面 x 由递减转递增，m.x 被算成负数）→ 相机先倒退再前进，即"顿"。
    //   F–C 逐轴限幅（|m| ≤ 3·min|相邻段斜率|，异号则置 0）→ 每段每轴严格单调，无反向、无过冲。
    const CAM_TAN = (() => {
        const n = CAM.length, out = {};
        for (const key of ['p', 'l']) {
            const tabs = Array.from({ length: n }, () => [0, 0, 0]);
            for (let c = 0; c < 3; c++) {
                const sec = [];                                   // 各段斜率（单位/秒）
                for (let i = 0; i < n - 1; i++) {
                    const dt = Math.max(0.0001, CAM[i + 1].t - CAM[i].t);
                    sec.push((CAM[i + 1][key][c] - CAM[i][key][c]) / dt);
                }
                const m = new Array(n).fill(0);
                for (let i = 0; i < n; i++) {
                    if (i === 0) m[i] = sec[0];
                    else if (i === n - 1) m[i] = sec[n - 2];
                    else { const a = sec[i - 1], b = sec[i]; m[i] = (a * b <= 0) ? 0 : (a + b) / 2; }
                }
                for (let i = 0; i < n - 1; i++) {                 // F–C 限幅
                    const a = sec[i];
                    if (a === 0) { m[i] = 0; m[i + 1] = 0; continue; }
                    const r0 = m[i] / a, r1 = m[i + 1] / a, s = Math.sqrt(r0 * r0 + r1 * r1);
                    if (s > 3) { m[i] = 3 * a * r0 / s; m[i + 1] = 3 * a * r1 / s; }
                }
                for (let i = 0; i < n; i++) tabs[i][c] = m[i];
            }
            out[key] = tabs;
        }
        return out;
    })();

    function camAt(time) {
        const n = CAM.length;
        const at = (k) => CAM[Math.max(0, Math.min(n - 1, k))];
        let i = 0; while (i < n - 1 && time >= CAM[i + 1].t) i++;
        const a = at(i), b = at(i + 1);
        const h = Math.max(0.0001, b.t - a.t);
        const s = Math.min(1, Math.max(0, (time - a.t) / h));
        const h00 = 2*s*s*s - 3*s*s + 1, h10 = s*s*s - 2*s*s + s;
        const h01 = -2*s*s*s + 3*s*s,     h11 = s*s*s - s*s;
        const out = {};
        for (const key of ['p', 'l']) {
            // ★ 越界钳制：time 超过末帧时 i=n-1，i+1 会越界（曾致 m1 undefined → 报错）
            const m0 = CAM_TAN[key][i], m1 = CAM_TAN[key][Math.min(i + 1, n - 1)];
            out[key] = [0,1,2].map(c =>
                h00 * a[key][c] + h10 * h * m0[c] + h01 * b[key][c] + h11 * h * m1[c]
            );
        }
        return { p: out.p, l: out.l };
    }
    function setCap(text) {
        if (capEl.textContent !== text) { capEl.textContent = text; capEl.classList.add('show'); }
    }

    const T_MORPH = 9, T_ATK = 15.4, T_FALL = 21.5, T_TITLE = 27.2;
    const FALL_CAM_END = 25.8;          // 「跟随下落方块」覆盖段结束时刻（须与 CAM 里 25.8 那帧一致）
    const TITLE_SPAN = 3.2;             // 标题方块逐块搭建的总时长
    const TITLE_POP = 0.30;             // 单块弹出时长
    let finished = false, rafId = null, _t0 = null, morphed = false, atkSpawned = false, fallSpawned = false;

    // —— 标题笔画板：逐条「写」出来（斜向波延迟 + 断面先长满、再沿笔画延伸）——
    // Block.updateTransform() 是把整块矩阵一次性 copy 进 mesh.matrix 的（且 matrixAutoUpdate=false），
    // 所以不能改 mesh.scale —— 直接改矩阵前三列：列0 = 板长轴、列1 = 厚度、列2 = 板宽。
    let _titleBuilt = false;
    function updateTitleBlocks(time) {
        if (!titleBlocks || _titleBuilt) return;
        const plates = titleBlocks.plates;
        let done = true;
        for (let i = 0; i < plates.length; i++) {
            const pl = plates[i];
            const el = time - (T_TITLE + pl.k * TITLE_SPAN);
            let kx = 1, kc = 1;
            if (el < TITLE_POP) {
                done = false;
                if (el <= 0) kx = kc = 0;
                else {
                    const q = el / TITLE_POP - 1;                 // easeOutBack：0 → 过冲 ~1.1 → 1
                    kx = 1 + 2.70158 * q * q * q + 1.70158 * q * q;
                    if (kx < 0) kx = 0;
                    const pc = Math.min(1, (el / TITLE_POP) * 2.2); // 断面先长满
                    kc = 1 - (1 - pc) * (1 - pc) * (1 - pc);
                }
            }
            const e = pl.mesh.matrix.elements, g = pl.base;
            e[0] = g[0] * kx; e[1] = g[1] * kx; e[2] = g[2] * kx;
            e[4] = g[4] * kc; e[5] = g[5] * kc; e[6] = g[6] * kc;
            e[8] = g[8] * kc; e[9] = g[9] * kc; e[10] = g[10] * kc;
            pl.mesh.matrixWorldNeedsUpdate = true;
        }
        if (done) _titleBuilt = true;      // 全部到位后停止写矩阵
    }

    function finish(immediate) {
        if (finished) return; finished = true;
        if (rafId) cancelAnimationFrame(rafId);
        window.__introRunning = false;
        window.removeEventListener('keydown', introKey);
        window.removeEventListener('keydown', introRapidKey);
        overlay.removeEventListener('click', introRapidClick);
        // 还原真实场景状态
        try {
            introBlocks.forEach(b => {
                const obj = b.mesh || b.rootGroup;
                if (obj && obj.parent) obj.parent.remove(obj);
                try {
                    obj.traverse(o => {
                        if (o.geometry) o.geometry.dispose();
                        if (o.material) {
                            const ms = Array.isArray(o.material) ? o.material : [o.material];
                            ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
                        }
                    });
                } catch (e) {}
            });
        } catch (e) {}
        keyframeData.delete('intro_fall');
        _hiddenBlocks.forEach(b => { if (b.mesh) b.mesh.visible = true; });
        showGrid = _showGridSaved; showTicks = _showTicksSaved;
        controls.enabled = _cEnabled; controls.enableDamping = _cDamp;
        camera.position.copy(_camPos0); controls.target.copy(_tgt0); camera.zoom = _camZoom0; camera.fov = _camFov0; camera.updateProjectionMatrix();
        if (pm) pm.style.display = _pmDisplay;
        markIntroSeen();
        const done = () => {
            document.body.classList.remove('ex-intro-playing'); // 还原编辑器 UI 铬
            const st = document.getElementById('exIntroStyle'); if (st && st.parentNode) st.remove();
            if (overlay.parentNode) overlay.remove();
            if (typeof onDone === 'function') onDone();
        };
        if (immediate) { done(); return; }
        overlay.classList.add('fade');
        setTimeout(done, 640);
    }
    function onSkip() { finish(false); }
    window.__finishIntro = finish;   // 外部（如画笔模式）可在开场动画进行中立即、干净地中止它
    function introKey(e) { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); finish(false); } }

    // ★ 快速连按退出通道（首次展示也可用）：点击屏幕 / 敲击任意键，相邻两次间隔不超过 RAPID_GAP 毫秒
    //   时计数累加，满 RAPID_NEED 次即关闭开场动画。首次展示原本完全不可跳过，这里给用户留一个
    //   连按退出的出口；中途停顿超过 RAPID_GAP 则计数自动归零，避免零散误触把开场动画关掉。
    //   hold 键的系统自动重复（e.repeat）不计入，保证必须是「连按」而不是「长按」。
    const RAPID_NEED = 10, RAPID_GAP = 600;
    let _rapidCount = 0, _rapidLast = -Infinity;
    function introRapidHit() {
        const now = performance.now();
        _rapidCount = (now - _rapidLast <= RAPID_GAP) ? _rapidCount + 1 : 1;
        _rapidLast = now;
        if (_rapidCount >= RAPID_NEED) finish(false);
    }
    function introRapidClick() { introRapidHit(); }
    function introRapidKey(e) { if (e.repeat) return; introRapidHit(); }
    overlay.addEventListener('click', introRapidClick);
    window.addEventListener('keydown', introRapidKey);
    if (_allowSkip) { // 手动重播 / 开发者工具可跳过
        overlay.addEventListener('click', onSkip);
        window.addEventListener('keydown', introKey);
    }

    function frame() {
        if (finished) return;
        const now = performance.now();
        if (_t0 === null) _t0 = now;
        const time = Math.min((now - _t0) / 1000, DUR);

        // —— 节拍编排 ——
        if (!morphed && time >= T_MORPH) {
            morphed = true;
            oak.mesh.visible = false;
            diamonds.forEach(d => { d.mesh.visible = true; setVar(d, 'v.scale', d._targetScale * 0.02); });
        }
        if (morphed && time < T_MORPH + 0.9) {
            const k = smooth(Math.min(1, (time - T_MORPH) / 0.9));
            diamonds.forEach(d => setVar(d, 'v.scale', d._targetScale * (0.02 + 0.98 * k)));
        }
        // —— ③ 千禧年科技学院校徽：硬切登场（镜头瞬移到校徽正面后拉远，块不再做生长动画，保持"切场景"的干脆感）——
        if (morphed && time >= T_ATK && !atkSpawned) {
            atkSpawned = true;
            diamonds.forEach(d => { d.mesh.visible = false; });
            atk.forEach(a => { a.mesh.visible = true; setVar(a, 'v.scale', a._targetScale); });
        }
        if (atkSpawned && time >= T_FALL && !fallSpawned) {
            fallSpawned = true;
            atk.forEach(a => { a.mesh.visible = false; });
            fall.mesh.visible = true;
        }
        let fallY = 0.6;
        if (fallSpawned) {
            const v = interpolateKeyframes('intro_fall', Math.min(time - T_FALL, 3.0));
            if (v) { _writeKfVarsToBlock(fall, v); if (typeof v.ypos === 'number') fallY = v.ypos; }
        }

        // —— 相机：下落段跟随方块（读真实关键帧 ypos），其余按运镜路径 ——
        const c = camAt(time);
        let camP = c.p, camL = c.l;
        if (fallSpawned && time < FALL_CAM_END) {
            const blend = smooth(Math.min(1, Math.max(0, (time - T_FALL) / 0.7)));
            const tp = [7, fallY + 2.6, 11], tl = [0, fallY, 0];
            camP = [0, 1, 2].map(n => c.p[n] + (tp[n] - c.p[n]) * blend);
            camL = [0, 1, 2].map(n => c.l[n] + (tl[n] - c.l[n]) * blend);
        }
        camera.position.set(camP[0], camP[1], camP[2]);
        controls.target.set(camL[0], camL[1], camL[2]);
        camera.lookAt(camL[0], camL[1], camL[2]);

        // —— ④ 标题方块：逐块搭建 ——
        updateTitleBlocks(time);

        // 字幕 / 标题
        if (time < T_MORPH) setCap('对齐网格的1*1*1方块，FMBE的默认大小');
        else if (time < T_ATK) setCap('通过修改变量');
        else if (time < T_FALL) setCap('制作你的富有创意的的组合模型');
        else if (time < T_TITLE) setCap('关键帧动画，让方块动起来');
        else if (time < T_TITLE + TITLE_SPAN) setCap(titleBlocks ? '为了效率，我们制作了' : 'FMBE编辑器');
        else setCap('');
        // 副标题（DOM）等方块搭完再浮出；若体素标题失败，DOM 主标题同样在此刻登场
        if (time >= T_TITLE + TITLE_SPAN + 0.6 && !titleEl.classList.contains('show')) titleEl.classList.add('show');
        if (_allowSkip && time > 1.5) skipEl.classList.add('show');

        if (time >= DUR) { finish(false); return; }
        rafId = requestAnimationFrame(frame);
    }

    Promise.all(_need.map(_loadOne)).then(() => { rafId = requestAnimationFrame(frame); }).catch(() => { rafId = requestAnimationFrame(frame); });
}

