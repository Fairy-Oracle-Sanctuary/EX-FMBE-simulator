/* 10-project/04-image-trace.js · 识图 → 面片（笔画追踪 / 网格填充 / 手动多边形）
   ============================================================================
   目标：把「画笔模式手工一片一片描出来的二维图」变成程序化生成。
   必须做到与手绘一致：面片要**沿笔画方向斜置**（任意角度），不能用轴对齐的「直角像素」。

   三种方式（画笔工具栏「🖼识图」弹窗）：
     ① 笔画追踪（默认，推荐）：二值 → 距离变换估笔画粗细 → Zhang-Suen 细化出骨架
        → 骨架按端点/交叉点切成折线 → RDP 简化 → 每段生成一片**定向面片**
        （长边 = 线段方向、宽 = 该处笔画粗细）。曲线自然被拆成若干斜置短面片。
     ② 网格填充：轴对齐矩形分解（只适合方块/纯色块等规则形状，不作默认）。
     ③ 手动多边形填充：用户先描点勾勒轮廓，程序只在多边形内部填格（绝不越界）。

   输出：真实 Block（与画笔生成的面片同一构造口径），可用现有「输出命令」；
   弹窗内也提供「导出命令」，把本次生成的面片按 FMBE 静态指令逐条列出。

   ★ 构造口径沿用 03-points-and-shapes.js 的 ptMakeRectBlock：
     A→B 为长边、宽 = 画笔粗细；形心落在矩形中心；只在 XZ 平面（y=0）。
   ★ 本段只新增自己的函数/变量，不改动画笔既有逻辑；新增段需在 00-bootstrap.js
     的 EX_PARTS 里登记。
   ============================================================================ */
'use strict';

/* ---------------------------- 羊毛 16 色（自动配色用） ---------------------------- */
const IMTR_WOOLS = [
    { file: 'white_wool.png',      rgb: [233, 236, 236] },
    { file: 'orange_wool.png',     rgb: [240, 118,  19] },
    { file: 'magenta_wool.png',    rgb: [189,  68, 179] },
    { file: 'light_blue_wool.png', rgb: [ 58, 175, 217] },
    { file: 'yellow_wool.png',     rgb: [248, 198,  39] },
    { file: 'lime_wool.png',       rgb: [112, 185,  25] },
    { file: 'pink_wool.png',       rgb: [237, 141, 172] },
    { file: 'gray_wool.png',       rgb: [ 62,  68,  71] },
    { file: 'light_gray_wool.png', rgb: [142, 142, 134] },
    { file: 'cyan_wool.png',       rgb: [ 21, 137, 145] },
    { file: 'purple_wool.png',     rgb: [121,  42, 172] },
    { file: 'blue_wool.png',       rgb: [ 53,  57, 157] },
    { file: 'brown_wool.png',      rgb: [114,  71,  40] },
    { file: 'green_wool.png',      rgb: [ 84, 109,  27] },
    { file: 'red_wool.png',        rgb: [161,  39,  34] },
    { file: 'black_wool.png',      rgb: [ 20,  21,  25] }
];
function imtrNearestWool(r, g, b) {
    let best = IMTR_WOOLS[0], bestD = Infinity;
    for (const w of IMTR_WOOLS) {
        const dr = r - w.rgb[0], dg = g - w.rgb[1], db = b - w.rgb[2];
        const d = dr * dr * 0.5 + dg * dg * 0.8 + db * db * 0.35;
        if (d < bestD) { bestD = d; best = w; }
    }
    return best;
}

/* ------------------------------- 会话状态 ------------------------------- */
let imtrImg = null;            // 当前载入的 HTMLImageElement
let imtrProcCanvas = null;     // 处理用的（限尺寸）像素画布
let imtrResult = null;         // 见 imtrAnalyze 的返回结构
let imtrCreatedIds = [];       // 本次通过识图生成的面片 id（用于导出/清除）

/* ------------------------------- 弹窗骨架 ------------------------------- */
function imtrEnsureModal() {
    let over = document.getElementById('imtrOverlay');
    if (over) return over;
    over = document.createElement('div');
    over.id = 'imtrOverlay';
    over.className = 'imtr-overlay';
    over.innerHTML = `
      <div class="imtr-modal" role="dialog" aria-modal="true">
        <div class="imtr-head">
          <span>🖼 识图生成面片</span>
          <button class="imtr-x" id="imtrCloseBtn" title="关闭">✕</button>
        </div>
        <div class="imtr-body">
          <div class="imtr-left">
            <div class="imtr-file-row">
              <label class="imtr-file-btn">选择图片
                <input type="file" id="imtrFileInput" accept="image/*" style="display:none;">
              </label>
              <span class="imtr-file-name" id="imtrFileName">未选择</span>
            </div>
            <div class="imtr-preview-wrap">
              <canvas id="imtrCanvas" class="imtr-canvas"></canvas>
              <div class="imtr-empty" id="imtrEmpty">选择一张图片<br>或直接使用「多边形填充」</div>
            </div>
            <div class="imtr-stats" id="imtrStats">—</div>
            <div class="imtr-export-row">
              <button class="imtr-btn" id="imtrExportBtn">导出命令</button>
              <button class="imtr-btn ghost" id="imtrClearBtn">清除本次面片</button>
            </div>
            <textarea id="imtrCmdOut" class="imtr-cmd" spellcheck="false" placeholder="导出的静态面片指令会出现在这里"></textarea>
          </div>
          <div class="imtr-right">
            <div class="imtr-group">
              <div class="imtr-group-title">识别（完整分辨率）</div>
              <label class="imtr-row"><span>块数预算上限</span>
                <input type="number" id="imtrBudget" min="0" max="5000" step="1" value="0" title="0 = 不限；超出时自动删点简化"></label>
              <label class="imtr-row"><span>可接受超预算(%)</span>
                <input type="number" id="imtrOver" min="0" max="200" step="5" value="20"></label>
              <label class="imtr-row"><span>世界尺寸(米)</span>
                <input type="number" id="imtrWorldSize" min="1" max="200" step="1" value="16"></label>
              <label class="imtr-row"><span>配色</span>
                <select id="imtrColorMode">
                  <option value="auto">自动配色（羊毛16色）</option>
                  <option value="white">单色（白色羊毛）</option>
                </select></label>
              <button class="imtr-btn primary" id="imtrAnalyzeBtn">预览识别</button>
            </div>
            <div class="imtr-group">
              <div class="imtr-group-title">手动多边形填充</div>
              <div class="imtr-hint">在「✏️描点」模式用点勾勒轮廓，选中这些点后点下面按钮；未选中时用全部点。</div>
              <label class="imtr-row"><span>格子尺寸(米)</span>
                <input type="number" id="imtrPolyCell" min="0.05" max="5" step="0.05" value="0.3"></label>
              <button class="imtr-btn" id="imtrPolyBtn">按多边形填充</button>
            </div>
            <button class="imtr-btn primary big" id="imtrGenBtn">生成面片</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(over);
    imtrBindModal(over);
    return over;
}

function imtrBindModal(over) {
    over.addEventListener('pointerdown', (e) => { if (e.target === over) imtrClose(); });
    over.querySelector('#imtrCloseBtn').onclick = imtrClose;
    over.querySelector('#imtrFileInput').onchange = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const nm = over.querySelector('#imtrFileName');
        if (nm) nm.textContent = f.name;
        imtrLoadFile(f).then(() => { imtrAnalyzeAndPreview(); }).catch(() => showToast('❌ 图片读取失败'));
    };
    over.querySelector('#imtrAnalyzeBtn').onclick = imtrAnalyzeAndPreview;
    over.querySelector('#imtrGenBtn').onclick = imtrGenerate;
    over.querySelector('#imtrPolyBtn').onclick = imtrFillPolygon;
    over.querySelector('#imtrExportBtn').onclick = imtrExportCommands;
    over.querySelector('#imtrClearBtn').onclick = imtrClearCreated;
}

function imtrOpen() { imtrEnsureModal().style.display = 'flex'; }
function imtrClose() { const o = document.getElementById('imtrOverlay'); if (o) o.style.display = 'none'; }

/* ------------------------------- 图片载入 ------------------------------- */
function imtrLoadFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { imtrImg = img; URL.revokeObjectURL(url); resolve(); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load fail')); };
        img.src = url;
    });
}

/* ------------------------------- 参数读取 ------------------------------- */
function imtrGetParams() {
    const o = document.getElementById('imtrOverlay');
    const q = (id, dv) => { const e = o && o.querySelector('#' + id); return e ? e.value : dv; };
    return {
        threshold: parseInt(q('imtrThresh', 60), 10) || 60,
        budget: Math.max(0, parseInt(q('imtrBudget', 0), 10) || 0),
        overPct: Math.max(0, parseFloat(q('imtrOver', 20)) || 0),
        fitPx: Math.max(0, parseFloat(q('imtrFit', 0)) || 0),
        worldSize: parseFloat(q('imtrWorldSize', 16)) || 16,
        colorMode: q('imtrColorMode', 'auto'),
        polyCell: parseFloat(q('imtrPolyCell', 0.3)) || 0.3,
        minArea: 1
    };
}

/* ============================ 通用图像准备 ============================ */
/* 把图片画到限尺寸画布，并按「四边像素中位数」识别背景色，颜色距离超容差 ⇒ 墨。
   ★不能写死「暗=墨」：用户图是黑底浅色笔画。 */
function imtrPrepare(p) {
    const sw = imtrImg.naturalWidth || imtrImg.width;
    const sh = imtrImg.naturalHeight || imtrImg.height;
    // ★按用户要求：识别一律用【完整分辨率】。只对超大图（>2400px）做一次安全缩放防爆内存。
    const k = Math.min(1, 2400 / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * k));
    const h = Math.max(1, Math.round(sh * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(imtrImg, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const edgePx = [];
    const stepX = Math.max(1, Math.floor(w / 32)), stepY = Math.max(1, Math.floor(h / 32));
    for (let x = 0; x < w; x += stepX) { edgePx.push(0 * w + x); edgePx.push((h - 1) * w + x); }
    for (let y = 0; y < h; y += stepY) { edgePx.push(y * w + 0); edgePx.push(y * w + (w - 1)); }
    const med = (arr) => { const a = arr.slice().sort((p2, q2) => p2 - q2); return a[Math.floor(a.length / 2)] || 0; };
    const bgR = med(edgePx.map(i => data[i * 4]));
    const bgG = med(edgePx.map(i => data[i * 4 + 1]));
    const bgB = med(edgePx.map(i => data[i * 4 + 2]));
    const tol2 = p.threshold * p.threshold * 3;
    const ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
        if (a <= 8) { ink[i] = 0; continue; }
        const dr = r - bgR, dg = g - bgG, db = b - bgB;
        ink[i] = (dr * dr + dg * dg + db * db > tol2) ? 1 : 0;
    }
    return { cv, data, ink, w, h };
}

/* ========================= ① 笔画追踪（斜置面片） ========================= */

/* 距离变换（两遍 chamfer 3-4）：返回每像素到最近背景的距离（前景为内距）。 */
function imtrDistanceTransform(mask, w, h) {
    const INF = 1e8;
    const d = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (!mask[i]) continue;
            let v = d[i];
            if (x > 0) v = Math.min(v, d[i - 1] + 1);
            if (y > 0) {
                v = Math.min(v, d[i - w] + 1);
                if (x > 0) v = Math.min(v, d[i - w - 1] + 1.4142);
                if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.4142);
            }
            d[i] = v;
        }
    }
    for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x;
            if (!mask[i]) continue;
            let v = d[i];
            if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
            if (y < h - 1) {
                v = Math.min(v, d[i + w] + 1);
                if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.4142);
                if (x > 0) v = Math.min(v, d[i + w - 1] + 1.4142);
            }
            d[i] = v;
        }
    }
    return d;
}



/* Ramer–Douglas–Peucker：返回保留下来的点索引（相对 pts 数组）。 */
function imtrRdp(pts, tol) {
    if (pts.length <= 2) return [0, pts.length - 1];
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    const tol2 = tol * tol;
    while (stack.length) {
        const [a, b] = stack.pop();
        if (b - a < 2) continue;
        const ax = pts[a].x, ay = pts[a].y;
        const bx = pts[b].x, by = pts[b].y;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let maxD = -1, maxI = -1;
        for (let i = a + 1; i < b; i++) {
            const px = pts[i].x - ax, py = pts[i].y - ay;
            let d2;
            if (len2 < 1e-9) d2 = px * px + py * py;
            else {
                let t = (px * dx + py * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                const qx = px - t * dx, qy = py - t * dy;
                d2 = qx * qx + qy * qy;
            }
            if (d2 > maxD) { maxD = d2; maxI = i; }
        }
        if (maxD > tol2) {
            keep[maxI] = 1;
            stack.push([a, maxI], [maxI, b]);
        }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(i);
    return out;
}

/* 连通块标号：去掉面积过小的噪点。 */
function imtrFilterComponents(mask, w, h, minArea) {
    const label = new Int32Array(w * h).fill(-1);
    const stack = [];
    const keep = new Uint8Array(w * h);
    const sizes = [];
    let id = 0;
    for (let i = 0; i < w * h; i++) {
        if (!mask[i] || label[i] >= 0) continue;
        stack.length = 0; stack.push(i); label[i] = id; sizes.push(0);
        while (stack.length) {
            const p = stack.pop(); sizes[id]++;
            const x = p % w, y = (p - x) / w;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const j = ny * w + nx;
                if (mask[j] && label[j] < 0) { label[j] = id; stack.push(j); }
            }
        }
        id++;
    }
    for (let i = 0; i < w * h; i++) {
        if (mask[i] && label[i] >= 0 && sizes[label[i]] >= minArea) keep[i] = 1;
    }
    return keep;
}

/* 3×3 先膨胀后腐蚀（闭运算）：抹平笔画边缘的锯齿/噪点。
   ★必须做：实测原图 1080² 的笔画边缘很毛糙，直接细化会得到 121 条碎骨架路径（5 个字母！），
   闭运算后骨架干净，拟合点数量也随之合理。 */
function imtrMorphClose(mask, w, h) {
    const dil = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let v = 0;
            for (let dy = -1; dy <= 1 && !v; dy++) {
                const ny = y + dy; if (ny < 0 || ny >= h) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx; if (nx < 0 || nx >= w) continue;
                    if (mask[ny * w + nx]) { v = 1; break; }
                }
            }
            dil[y * w + x] = v;
        }
    }
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let v = 1;
            for (let dy = -1; dy <= 1 && v; dy++) {
                const ny = y + dy; if (ny < 0 || ny >= h) { v = 0; break; }
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx; if (nx < 0 || nx >= w) { v = 0; break; }
                    if (!dil[ny * w + nx]) { v = 0; break; }
                }
            }
            out[y * w + x] = v;
        }
    }
    return out;
}

/* -------------------- 笔画（拟合点）收集：距离场脊线追踪 --------------------
   ★用户要求的链路：完整分辨率 → 沿笔画描一批拟合点 → 按预算删点 → 连点生成方块 → 仍空白处再描。
   ★为什么不走「骨架图」：Zhang-Suen 骨架在斜向笔画上会留下阶梯状双像素，
   实测 2199 个骨架像素里有 584 个是「三邻居」假交叉点 ⇒ 一条腿被切成 5~12px 的碎片，
   117 条路径只有 11 条能过长度筛选，A 的腿整段丢失，生成图与原图完全对不上。
   改为直接在距离场上工作：**最粗处当种子 → 沿笔画走向走一条折线 → 把这根笔画「覆盖」掉 → 找剩余最粗处**。 */

function imtrCollectStrokes(mask, dist, w, h) {
    const n = w * h;
    const covered = new Uint8Array(n);
    const dAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : dist[y * w + x];
    const mAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : mask[y * w + x];

    // 种子 = 还没被覆盖、最粗的地方（从粗到细处理：先出大腿、再出横杠、再出细枝）
    // ★种子不能太细：笔画边缘的 1~3px 残渣会生成一堆碎块（实测 38 条里一半是这种边角料）
    const dsum = [];
    for (let i = 0; i < n; i += 7) if (mask[i] && dist[i] > 0) dsum.push(dist[i]);
    dsum.sort((a, b) => a - b);
    const medHalf = dsum.length ? dsum[Math.floor(dsum.length * 0.5)] : 2;
    const seedMin = Math.max(2.5, medHalf * 0.35);
    /* ★交叉点检测：以 d0+3 为半径沿圆周采样，数「墨弧」数量。
       直笔画的圆环只与笔画相交 2 段（前后各一段），端点 1 段，交叉点（T/十字）≥3 段。
       ★为什么必须跳过交叉点种子：交叉处的内切圆比笔画本身粗（≈1.41×），种子按 dist 从粗到细排序时
       它会排到最前面 → 一根横杠会顺着另一条腿穿出去（A 的横杠越到腿外），并且用 rmax 圆盘
       把那条腿的下半段盖掉，剩下一条细缝只能描出一小截歪块（A 的右腿看着像断了）。 */
    const isJunction = (xi, yi) => {
        const d0 = dist[yi * w + xi];
        const R = Math.max(4, d0 + 3);
        const N = 36;
        let arcs = 0, prev = false;
        for (let k = 0; k < N; k++) {
            const a = k / N * Math.PI * 2;
            const inInk = mAt(Math.round(xi + Math.cos(a) * R), Math.round(yi + Math.sin(a) * R)) === 1;
            if (inInk && !prev) arcs++;
            prev = inInk;
        }
        // 处理首尾相接（圆周是闭环）
        if (prev) {
            const a0 = Math.round(xi + R);
            if (mAt(a0, yi) === 1) arcs--;
        }
        return arcs >= 3;
    };
    const seeds = [];
    for (let i = 0; i < n; i++) {
        if (!mask[i] || dist[i] < seedMin) continue;
        const sx = i % w, sy = (i - sx) / w;
        if (isJunction(sx, sy)) continue;
        seeds.push(i);
    }
    seeds.sort((a, b) => dist[b] - dist[a]);

    // ★MAXSTEP 要够长：一条腿 700px 时每方向只有 300px（120×2.5）会走不完，
    // 后半个腿就会被当成「新笔画」再描一遍（单字母 A 的左右腿各被拆成 2 段，5 片）。
    // 400×2.5 = 1000px/方向，足够覆盖整条笔画；同色连通区内会拐弯继续，反而更省片。
    const STEP = 2.5, MAXSTEP = 400;
    // ★角度候选要「细」不要「粗」：粗候选（±7°）会让脊线左右随机漂移，累计 10px，RDP 把一条直笔画切成四五块；
    // 但转弯罚项也不能太大，否则走不动圆弧（`(` 会被拉成直线并重复描 3 遍）。1.5° 一挡 + 轻罚项 = 跟得住曲线又不抖。
    const ANG = [];
    for (let a = -30; a <= 30; a += 1.5) ANG.push(a);
    const cover = (x, y, r) => {
        const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(w - 1, Math.ceil(x + r));
        const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(h - 1, Math.ceil(y + r));
        for (let yy = y0; yy <= y1; yy++) {
            for (let xx = x0; xx <= x1; xx++) {
                if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= r * r) covered[yy * w + xx] = 1;
            }
        }
    };

    const out = [];
    /* 单条笔画追踪：seed 双向生长 → 两端延伸 → 返回折线；不合格返回 null（且不覆盖像素） */
    const traceOne = (seed, minLen, dupFrac, avoidCov) => {
        const r = dist[seed];                        // 笔画半宽
        const sx = seed % w, sy = (seed - sx) / w;
        // 初始走向 = 距离场梯度的垂直方向（梯度指向笔画外，垂直方向就是笔画走向）
        const gx = dAt(sx + 1, sy) - dAt(sx - 1, sy);
        const gy = dAt(sx, sy + 1) - dAt(sx, sy - 1);
        let ux = 1, uy = 0;
        if (Math.hypot(gx, gy) >= 0.35) {
            const gl = Math.hypot(gx, gy);
            ux = -gy / gl; uy = gx / gl;
        }
        const fwd = [{ x: sx, y: sy, i: seed }];
        const back = [];
        for (const sgn of [1, -1]) {
            let px = sx, py = sy, dx = ux * sgn, dy = uy * sgn;
            const dst = sgn > 0 ? fwd : back;
            for (let k = 0; k < MAXSTEP; k++) {
                let best = null;
                for (const a of ANG) {
                    const th = a * Math.PI / 180, ca = Math.cos(th), sa = Math.sin(th);
                    const ndx = dx * ca - dy * sa, ndy = dx * sa + dy * ca;
                    const nx = px + ndx * STEP, ny = py + ndy * STEP;
                    if (!mAt(Math.round(nx), Math.round(ny))) continue;   // 出墨了 → 到头
                    // 不许折返：离刚走过的点太近就跳过
                    let back2 = false;
                    for (let q = dst.length - 1, c = 0; q >= 0 && c < 12; q--, c++) {
                        const ddx = nx - dst[q].x, ddy = ny - dst[q].y;
                        if (ddx * ddx + ddy * ddy < (STEP * 0.85) ** 2) { back2 = true; break; }
                    }
                    if (back2) continue;
                    const d = dAt(Math.round(nx), Math.round(ny));
                    if (d < Math.max(1.2, r * 0.4)) continue;             // 笔画变细 → 到头
                    // ★进入交叉区就停：两笔相交处的内切圆比笔画本身粗（≈1.41×）。
                    // 不停会顺着交叉笔画的厚度穿过去（A 的横杠越到腿外，并把腿下半段盖掉）。
                    // 被截断的同一根腿会在后续「共线合并」里合回一片，不会多出块。
                    if (d > r * 1.3) continue;
                    // 补描时不许走进已覆盖区域：否则会顺着相邻的腿走远，整条又被判「重复」丢弃
                    if (avoidCov && covered[Math.round(ny) * w + Math.round(nx)]) continue;
                    const score = d - Math.abs(a) * 0.06;                 // 偏粗、轻偏好直走
                    if (!best || score > best.score) best = { score, nx, ny, ndx, ndy };
                }
                if (!best) break;
                px = best.nx; py = best.ny; dx = best.ndx; dy = best.ndy;
                const cx = Math.min(w - 1, Math.max(0, Math.round(px)));
                const cy = Math.min(h - 1, Math.max(0, Math.round(py)));
                dst.push({ x: px, y: py, i: cy * w + cx });
            }
        }
        let pts = back.reverse().concat(fwd);
        let skipExtA = false, skipExtB = false;
        /* ★交叉截断（不依赖种子粗细）：路径两端若撞进别的笔画，距离场会明显变粗（交叉处内切圆 ≈1.4×），
           把这一段从两端截掉。否则一根横杠会顺着腿的厚度穿到字外（A 的横杠越到腿右侧），
           并且它的覆盖圆盘会把腿的中间盖掉，腿下半段只剩一条细缝、只能描出一小截歪块。 */
        {
            const dv = pts.map(q => dAt(Math.round(q.x), Math.round(q.y)));
            const ds = dv.slice().sort((a, b) => a - b);
            const rMed = Math.max(1.5, ds[Math.floor(ds.length / 2)]);
            const peakLim = rMed * 1.12;
            // 从端点向内最多找 16 个点（≈40px）：出现「明显变粗」的点即为交叉处内切圆峰，
            // 把峰外那截细尾巴砍掉（尾巴的 d 很小，是被抗锯齿光晕拖出去的，不代表真实笔画）。
            // 真正的笔画端头 d 只会单调变小、不会出现这种峰，所以不会被误砍。
            const findPeak = (fromStart) => {
                const n2 = pts.length;
                const lim = Math.min(n2 - 3, 16);
                for (let k = 0; k < lim; k++) {
                    const i = fromStart ? k : n2 - 1 - k;
                    if (dv[i] > peakLim) return i;
                }
                return -1;
            };
            let i0 = findPeak(true), i1 = findPeak(false);
            if (i0 < 0) i0 = 0;
            if (i1 < 0) i1 = pts.length - 1;
            if (i0 > 0 || i1 < pts.length - 1) pts = pts.slice(i0, i1 + 1);
            // ★端点在交叉峰上就不要再沿线延伸：延伸会把刚砍掉的尾巴又接回去
            //（实测从峰上沿切线外推 17px 会让横杠重新越到腿外），交叉处本来就由另一笔覆盖。
            skipExtA = dv[i0] > peakLim;
            skipExtB = dv[i1] > peakLim;
        }
        // ★两端沿切线延伸（最多 2 个笔画半宽）：距离场在笔画端头会自然收细，
        // 走线会停在「端头内部」，不延伸就会剩下一整块端头残渣，被当成新笔画再描一遍
        // （单字母 A 会因此多出 2 块：顶部那个竖直碎块 + 横碎块）。
        const extendEnd = (arr, atFront) => {
            if (arr.length < 2) return;
            const p0 = atFront ? arr[0] : arr[arr.length - 1];
            const p1 = atFront ? arr[1] : arr[arr.length - 2];
            let dx = p0.x - p1.x, dy = p0.y - p1.y;
            const l = Math.hypot(dx, dy);
            if (l < 1e-6) return;
            dx /= l; dy /= l;
            const add = [];
            let px = p0.x, py = p0.y, prevD = dAt(Math.round(px), Math.round(py));
            // 延伸上限 = 1.2 个笔画半宽；遇到「变粗」（进入交叉/拐角合并区）就停，
            // 否则会顺着另一条腿继续走、把面片拖出字形（顶部/腿底的青块越界）。
            const maxPx = Math.max(6, rmax * 1.2);
            for (let k = 0; k < Math.round(maxPx / 2); k++) {
                px += dx * 2; py += dy * 2;
                const ix = Math.round(px), iy = Math.round(py);
                if (!mAt(ix, iy)) break;
                const dcur = dAt(ix, iy);
                if (dcur > prevD + 0.5) break;
                if (avoidCov && covered[iy * w + ix]) break;
                prevD = dcur;
                add.push({ x: px, y: py, i: iy * w + ix });
            }
            if (!add.length) return;
            if (atFront) { add.reverse(); for (const q of add) arr.unshift(q); }
            else for (const q of add) arr.push(q);
        };
        // 按这根笔画的最大半宽整体覆盖（逐点取宽会漏掉边缘，留下大量 1~3px 残渣）
        let rmax = r;
        for (const q of pts) {
            const rr = Math.max(1.5, dAt(Math.round(q.x), Math.round(q.y)));
            if (rr > rmax) rmax = rr;
        }
        if (!skipExtA) extendEnd(pts, true);
        if (!skipExtB) extendEnd(pts, false);
        let len = 0;
        for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
        // ① 重复笔画：这条折线一半以上都落在已覆盖区域里（同一条腿被描了第二遍）→ 丢掉
        let preCov = 0;
        for (const q of pts) if (covered[Math.round(q.y) * w + Math.round(q.x)]) preCov++;
        if (preCov > pts.length * (dupFrac == null ? 0.5 : dupFrac)) return null;
        // ② 边角料：长度不到自身宽度的 3.2 倍（15~25px 的小方块，笔画端头/JPEG 光晕残渣）→ 丢掉，
        //    否则每个字母都会多出四五个碎块，既难看又白占预算
        const minLenEff = minLen == null ? Math.max(12, rmax * 3.2) : minLen;
        if (len < minLenEff) return null;
        for (const q of pts) cover(q.x, q.y, rmax + 1);
        return pts;
    };

    for (const seed of seeds) {
        if (covered[seed]) continue;
        const pts = traceOne(seed, null);
        if (!pts) continue;
        out.push(pts);
        if (out.length >= 400) break;
    }

    /* ★补描（用户要的「生成方块-仍空白-再描点」）：主循环后仍没被覆盖的墨块。
       典型：字母 A 的横杠夹在两腿之间，先被两条腿的覆盖圆盘吃掉一半，整条笔画因
       「重复/太短」被丢弃 ⇒ 横杠永久缺失。这里按连通块面积筛（小块是端头残渣，跳过），
       只对真正的整块空白补一条笔画。 */
    const seen = new Uint8Array(n);
    const needArea = Math.max(30, medHalf * medHalf * 4);
    for (let i = 0; i < n && out.length < 400; i++) {
        if (!mask[i] || covered[i] || seen[i]) continue;
        const stack = [i];
        seen[i] = 1;
        let bestIdx = i, bestD = dist[i], area = 0;
        while (stack.length) {
            const p = stack.pop();
            area++;
            if (dist[p] > bestD) {
                const bx2 = p % w, by2 = (p - bx2) / w;
                if (!isJunction(bx2, by2)) { bestD = dist[p]; bestIdx = p; }
            }
            const px = p % w, py = (p - px) / w;
            for (const dxy of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = px + dxy[0], ny = py + dxy[1];
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const q = ny * w + nx;
                if (!mask[q] || covered[q] || seen[q]) continue;
                seen[q] = 1;
                stack.push(q);
            }
        }
        if (area < needArea) continue;
        const pts = traceOne(bestIdx, 6, 0.9, true);
        if (pts && out.length < 400) out.push(pts);
    }
    return out;
}

/* 均值平滑（端点固定）；win 是「多方案」里的一个种子参数 */
function imtrSmoothStroke(pts, win) {
    if (!win) return pts.map(q => ({ x: q.x, y: q.y, i: q.i }));
    return pts.map((q, k) => {
        if (k === 0 || k === pts.length - 1) return { x: q.x, y: q.y, i: q.i };
        let sx = 0, sy = 0, n = 0;
        for (let d = -win; d <= win; d++) {
            const j = k + d;
            if (j < 0 || j >= pts.length) continue;
            sx += pts[j].x; sy += pts[j].y; n++;
        }
        return { x: sx / n, y: sy / n, i: q.i };
    });
}

/* 折线（已 RDP）→ 线段；每段记住自己来自哪根笔画/哪两个保留点（生成面片时要用） */
function imtrSegsOf(pts, keep) {
    const out = [];
    for (let s = 0; s + 1 < keep.length; s++) {
        const A = pts[keep[s]], B = pts[keep[s + 1]];
        if (Math.hypot(B.x - A.x, B.y - A.y) < 0.7) continue;
        out.push({
            ax: A.x, ay: A.y, bx: B.x, by: B.y,
            parts: [{ pts, k0: keep[s], k1: keep[s + 1] }]
        });
    }
    return out;
}

/* 点→无限直线距离 */
function imtrPtLine(px, py, s) {
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    const l = Math.hypot(dx, dy) || 1;
    return Math.abs((px - s.ax) * dy - (py - s.ay) * dx) / l;
}

/* ★缩减算法②：把「没有突变」的相邻/重叠线段并成一条。
   典型：一条腿被拆成 2~3 根笔画（各自都很直、方向只差几度），RDP 会当成多段 →
   每段一片 ⇒ 一个字母凭空多出 3~4 片。这里只要「共线 + 垂直偏差小 + 沿轴间隙小」
   就合成一条直线段，与用户说的「周围没有突变就删掉这些点」一致。
   注意：拐点（两条腿的交角、横杠两端）角度差大，不会被并掉。 */
function imtrMergeSegs(segs, angTolDeg, perp, gapTol) {
    if (segs.length < 2) return segs;
    const angTol = angTolDeg * Math.PI / 180;
    let changed = true;
    while (changed) {
        changed = false;
        outer:
        for (let i = 0; i < segs.length; i++) {
            for (let j = i + 1; j < segs.length; j++) {
                const a = segs[i], b = segs[j];
                const la = Math.hypot(a.bx - a.ax, a.by - a.ay);
                const lb = Math.hypot(b.bx - b.ax, b.by - b.ay);
                if (la < 1e-6 || lb < 1e-6) continue;
                let da = Math.abs(Math.atan2(a.by - a.ay, a.bx - a.ax) - Math.atan2(b.by - b.ay, b.bx - b.ax));
                if (da > Math.PI / 2) da = Math.PI - da;
                if (da > angTol) continue;
                // 用中点判「是否在同一条直线上」：同一条腿被两笔各描一半时，两端点会各偏
                // 半个笔画宽，逐端点判永远合不上；中点只偏移一点点，才是「没有突变」的证据
                const amx = (a.ax + a.bx) / 2, amy = (a.ay + a.by) / 2;
                const bmx = (b.ax + b.bx) / 2, bmy = (b.ay + b.by) / 2;
                if (imtrPtLine(bmx, bmy, a) > perp || imtrPtLine(amx, amy, b) > perp) continue;
                const axis = la >= lb ? a : b;
                const ux = (axis.bx - axis.ax) / (la >= lb ? la : lb);
                const uy = (axis.by - axis.ay) / (la >= lb ? la : lb);
                const pj = (px, py) => (px - axis.ax) * ux + (py - axis.ay) * uy;
                const a0 = pj(a.ax, a.ay), a1 = pj(a.bx, a.by);
                const b0 = pj(b.ax, b.ay), b1 = pj(b.bx, b.by);
                const amin = Math.min(a0, a1), amax = Math.max(a0, a1);
                const bmin = Math.min(b0, b1), bmax = Math.max(b0, b1);
                if (Math.max(bmin - amax, amin - bmax, 0) > gapTol) continue;
                const lo = Math.min(amin, bmin), hi = Math.max(amax, bmax);
                segs[i] = {
                    ax: axis.ax + ux * lo, ay: axis.ay + uy * lo,
                    bx: axis.ax + ux * hi, by: axis.ay + uy * hi,
                    parts: a.parts.concat(b.parts)
                };
                segs.splice(j, 1);
                changed = true;
                break outer;
            }
        }
    }
    return segs;
}

/* 一个候选方案：按 tol 删点 + 共线合并，只统计块数（不建方块，快） */
function imtrCountCandidate(strokes, tol, win) {
    let fitPts = 0;
    const all = [];
    for (const raw of strokes) {
        const pts = imtrSmoothStroke(raw, win);
        const keep = imtrRdp(pts, tol);
        fitPts += keep.length;
        for (const s of imtrSegsOf(pts, keep)) all.push(s);
    }
    const blocks = imtrMergeSegs(all, 14, Math.max(3, tol * 0.55), Math.max(8, tol * 1.6)).length;
    return { tol, win, blocks, fitPts };
}

/* 把某段的一个端点收回到它与另一段（非平行）的交点（只收不放）。
   典型：A 的横杠穿进腿后，终点会落在腿的外侧（JPEG 光晕让你多走 10~20px），块就伸出字外；
   收到两条中线的交点上，端点正好藏在腿的宽度里，看起来就和手绘命令一致。 */
function imtrTrimEndToCross(segs, i, atB, maxPull) {
    const s = segs[i];
    const li = Math.hypot(s.bx - s.ax, s.by - s.ay);
    if (li < 1) return false;
    const ux = (s.bx - s.ax) / li, uy = (s.by - s.ay) / li;
    let best = Infinity, bx = s.ax, by = s.ay;
    for (let j = 0; j < segs.length; j++) {
        if (j === i) continue;
        const t = segs[j];
        const lt = Math.hypot(t.bx - t.ax, t.by - t.ay);
        if (lt < 1) continue;
        const tx = (t.bx - t.ax) / lt, ty = (t.by - t.ay) / lt;
        const cr = ux * ty - uy * tx;
        if (Math.abs(cr) < 0.30) continue;                  // 夹角 < 17°：近平行，不算交叉
        const wx = t.ax - s.ax, wy = t.ay - s.ay;
        const k = (wx * ty - wy * tx) / cr;                 // 交点在 S 上的位置（px）
        const m = (wx * uy - wy * ux) / cr;                 // 交点在 T 上的位置（px）
        if (m < -0.5 * lt || m > 1.5 * lt) continue;        // 交点不在对方那段身上
        const pull = atB ? li - k : k;                      // 要往回收多少
        if (pull < -0.5 || pull > maxPull) continue;
        if (pull < best) { best = pull; bx = s.ax + ux * k; by = s.ay + uy * k; }
    }
    if (best === Infinity) return false;
    if (atB) { s.bx = bx; s.by = by; } else { s.ax = bx; s.ay = by; }
    return true;
}

/* 由选中的方案真正生成面片（每段一片斜置面片） */
function imtrPiecesFromStrokes(strokes, tol, win, ctx) {
    const { dist, ink, data, w, h, sw } = ctx;
    const pieces = [];
    const convert = (x, y) => ({ x: (x - w / 2) * sw, z: (y - h / 2) * sw });
    const minThick = 2;

    // 与 imtrCountCandidate 完全同一套「RDP + 共线合并」，保证统计块数 = 真实面片数
    const all = [];
    for (const raw of strokes) {
        const pts = imtrSmoothStroke(raw, win);
        const keep = imtrRdp(pts, tol);
        for (const s of imtrSegsOf(pts, keep)) all.push(s);
    }
    const segs = imtrMergeSegs(all, 14, Math.max(3, tol * 0.55), Math.max(8, tol * 1.6));
    const nearPt = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) <= 2;

    for (let si = 0; si < segs.length; si++) {
        const s = segs[si];
        const dx0 = s.bx - s.ax, dy0 = s.by - s.ay;
        const lenPx0 = Math.hypot(dx0, dy0);
        if (lenPx0 < 0.7) continue;
        // 该段笔画粗细/颜色：沿并入本段的所有原始片段采样
        const vals = [];
        let sr = 0, sg = 0, sb = 0, cn = 0;
        for (const part of s.parts) {
            const step = Math.max(1, Math.floor((part.k1 - part.k0) / 24));
            for (let k = part.k0; k <= part.k1; k += step) {
                const idx = part.pts[k].i;
                vals.push(dist[idx] * 2);
                if (ink[idx]) { sr += data[idx * 4]; sg += data[idx * 4 + 1]; sb += data[idx * 4 + 2]; cn++; }
            }
        }
        vals.sort((a, b) => a - b);
        const thickPx = Math.max(minThick, vals.length ? vals[Math.floor(vals.length * 0.5)] : 2);
        const rgb = cn ? [sr / cn, sg / cn, sb / cn] : [233, 236, 236];
        // 端点若与另一段端点重合（= 拐点），两端都外扩 1 个宽度以盖住拐角；否则是笔画端头，只扩半宽
        const cornerA = segs.some(o => o !== s && (nearPt(o.ax, o.ay, s.ax, s.ay) || nearPt(o.bx, o.by, s.ax, s.ay)));
        const cornerB = segs.some(o => o !== s && (nearPt(o.ax, o.ay, s.bx, s.by) || nearPt(o.bx, o.by, s.bx, s.by)));
        // ★非拐点端点若越过另一段（横杠穿进腿），先收回到两条中线的交点，并且不再外扩；
        //   否则那截会伸出字形（A 的横杠在腿外侧露个尖），也和手绘的四片 A 不一致。
        const maxPull = Math.max(12, thickPx * 1.2);
        const trimmedA = !cornerA && imtrTrimEndToCross(segs, si, false, maxPull);
        const trimmedB = !cornerB && imtrTrimEndToCross(segs, si, true, maxPull);
        const dx = s.bx - s.ax, dy = s.by - s.ay;
        const lenPx = Math.hypot(dx, dy) || 1;
        const ux = dx / lenPx, uy = dy / lenPx;
        const extA = trimmedA ? 0 : (cornerA ? thickPx : thickPx * 0.5);
        const extB = trimmedB ? 0 : (cornerB ? thickPx : thickPx * 0.5);
        const axPx = s.ax - ux * extA, ayPx = s.ay - uy * extA;
        const bxPx = s.bx + ux * extB, byPx = s.by + uy * extB;
        const wa = convert(axPx, ayPx), wb = convert(bxPx, byPx);
        pieces.push({
            ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z,
            width: thickPx * sw, rgb,
            px: [axPx, ayPx, bxPx, byPx, thickPx]
        });
    }
    return pieces;
}

/* 分析入口（完整分辨率 / 预算驱动 / 多方案取最少块） */
function imtrAnalyzeStroke(p, prep) {
    const { data, ink, w, h } = prep;
    const sw = p.worldSize / Math.max(w, h);

    const mask = imtrMorphClose(imtrFilterComponents(ink, w, h, 6), w, h);
    const dist = imtrDistanceTransform(mask, w, h);
    const strokes = imtrCollectStrokes(mask, dist, w, h);

    // 笔画宽中位数 → 自动贴合精度（半个笔画宽）；这就是「不限制块的长宽」的前提：
    // 块的大小由字形本身决定，只由片数预算去控制总量。
    const ws = [];
    for (const pts of strokes) for (let k = 0; k < pts.length; k += 4) {
        const d = dist[pts[k].i] * 2;
        if (d > 0) ws.push(d);
    }
    ws.sort((a, b) => a - b);
    const medW = ws.length ? ws[Math.floor(ws.length * 0.5)] : 4;
    const errTol = p.fitPx > 0 ? p.fitPx : Math.max(1.5, medW * 1.0);

    // 多方案并行评估：{平滑窗口 0/1/2} × {容忍度 1/1.25/1.5/2/2.5/3.5/5 倍}
    const cands = [];
    for (const win of [0, 1, 2]) {
        for (const m of [1, 1.25, 1.5, 2, 2.5, 3.5, 5]) {
            cands.push(imtrCountCandidate(strokes, errTol * m, win));
        }
    }

    // 贴合达标（偏差 ≤ errTol）的方案里取块数最少的一种
    const faithful = cands.filter(c => c.tol <= errTol + 1e-6)
        .sort((a, b) => (a.blocks - b.blocks) || (a.tol - b.tol));
    const best = faithful[0] || cands[0];

    let chosen = best, note = '';
    if (p.budget > 0 && best.blocks > p.budget) {
        const allow = Math.ceil(p.budget * (1 + p.overPct / 100));
        if (best.blocks <= allow) {
            note = '超预算 ' + (best.blocks - p.budget) + ' 片（在可接受 ' + p.overPct + '% 内）';
        } else {
            // 优先删曲率小的点（= 放大 RDP 容忍度）：取「能压进预算」的最小容忍度
            const fit = cands.filter(c => c.blocks <= p.budget).sort((a, b) => a.tol - b.tol)[0];
            if (fit) {
                chosen = fit;
                note = '为压进预算已放宽贴合精度到 ' + fit.tol.toFixed(1) + 'px';
            } else {
                const minBlocks = cands.reduce((m, c) => Math.min(m, c.blocks), Infinity);
                chosen = cands.find(c => c.blocks === minBlocks) || cands[0];
                note = '预算不足：这个图形最少要 ' + minBlocks + ' 片，已自动把预算提到 ' + minBlocks;
                showToast('⚠ 预算 ' + p.budget + ' 片画不出这个图形（最少 ' + minBlocks + ' 片），已自动提高预算');
            }
        }
    }

    const pieces = imtrPiecesFromStrokes(strokes, chosen.tol, chosen.win, { dist, ink, data, w, h, sw });
    imtrProcCanvas = prep.cv;
    return {
        kind: 'stroke', pieces, pxW: w, pxH: h,
        strokes: strokes.length, points: chosen.fitPts,
        tol: chosen.tol, errTol, note, mask
    };
}

/* ========================= ② 矩形分解（仅手动多边形填充用） ========================= */
function imtrDecompose(grid, cols, rows) {
    const used = new Uint8Array(cols * rows);
    const rects = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            if (!grid[i] || used[i]) continue;
            let w = 1;
            while (x + w < cols && grid[y * cols + x + w] && !used[y * cols + x + w]) w++;
            let h = 1;
            outer:
            while (y + h < rows) {
                for (let k = 0; k < w; k++) {
                    const j = (y + h) * cols + x + k;
                    if (!grid[j] || used[j]) break outer;
                }
                h++;
            }
            for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) used[yy * cols + xx] = 1;
            rects.push({ x, y, w, h });
        }
    }
    return rects;
}
/* ------------------------------- 分析入口 ------------------------------- */
function imtrAnalyze() {
    if (!imtrImg) { showToast('请先选择图片'); return null; }
    const p = imtrGetParams();
    const prep = imtrPrepare(p);
    imtrResult = imtrAnalyzeStroke(p, prep);
    return imtrResult;
}

/* ------------------------------- 预览绘制 ------------------------------- */
function imtrDrawPreview() {
    const o = document.getElementById('imtrOverlay');
    const cvs = o && o.querySelector('#imtrCanvas');
    const empty = o && o.querySelector('#imtrEmpty');
    const stats = o && o.querySelector('#imtrStats');
    if (!cvs) return;
    const r = imtrResult;
    if (r && imtrProcCanvas) {
        if (empty) empty.style.display = 'none';
        const dw = 320, dh = Math.max(1, Math.round(320 * r.pxH / r.pxW));
        cvs.width = dw; cvs.height = dh;
        const cx = cvs.getContext('2d');
        cx.clearRect(0, 0, dw, dh);
        cx.drawImage(imtrProcCanvas, 0, 0, dw, dh);
        const sx = dw / r.pxW, sy = dh / r.pxH;
        cx.strokeStyle = 'rgba(56,189,248,0.95)';
        cx.fillStyle = 'rgba(56,189,248,0.18)';
        cx.lineWidth = 1;
        for (const q of r.pieces) {
            const [ax, ay, bx, by, wp] = q.px;
            const dx = bx - ax, dy = by - ay;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len * wp / 2, ny = dx / len * wp / 2;
            cx.beginPath();
            cx.moveTo((ax + nx) * sx, (ay + ny) * sy);
            cx.lineTo((bx + nx) * sx, (by + ny) * sy);
            cx.lineTo((bx - nx) * sx, (by - ny) * sy);
            cx.lineTo((ax - nx) * sx, (ay - ny) * sy);
            cx.closePath();
            cx.fill(); cx.stroke();
        }
        // 拟合点（连点生成方块的顶点）
        cx.fillStyle = 'rgba(250,204,21,0.95)';
        for (const q of r.pieces) {
            const [ax, ay, bx, by] = q.px;
            cx.beginPath(); cx.arc(ax * sx, ay * sy, 1.6, 0, Math.PI * 2); cx.fill();
            cx.beginPath(); cx.arc(bx * sx, by * sy, 1.6, 0, Math.PI * 2); cx.fill();
        }
        if (stats) {
            stats.textContent = '笔画 ' + r.strokes + ' 条 · 拟合点 ' + r.points + ' 个 · 面片 ' +
                r.pieces.length + ' 片（贴合精度 ' + r.tol.toFixed(1) + 'px）' +
                (r.note ? ' · ' + r.note : '');
        }
    } else {
        if (empty) empty.style.display = '';
        if (stats) stats.textContent = '—';
    }
}

function imtrAnalyzeAndPreview() {
    try {
        imtrAnalyze();
        imtrDrawPreview();
    } catch (e) {
        console.error(e);
        showToast('❌ 识别失败：' + ((e && e.message) || e));
    }
}

/* ------------------------------- 面片构造 -------------------------------
   与 ptMakeRectBlock 同口径，但宽度与材质色显式传入：
   A→B 为长边（任意方向）、width 为垂直方向的宽度；形心 = A/B 中点；y 恒 0。
   ★复制而非改画笔的全局 brushThickness，避免影响用户手绘流程。 */
function imtrMakeRectBlockW(A, B, width, matColor) {
    const dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z);
    const length = dir.length();
    if (length < 1e-6 || width < 1e-6) return null;
    const hw = width / 2;
    const ux = dir.x / length, uz = dir.z / length;
    const nx = -uz, nz = ux;
    const A2 = { x: A.x - nx * hw, z: A.z - nz * hw };
    const B2 = { x: B.x - nx * hw, z: B.z - nz * hw };
    const C2 = { x: A2.x + nx * width, z: A2.z + nz * width };
    const solved = ptSolveParaPlacement(A2, B2, C2);
    if (!solved) return null;
    const p = solved.p;
    const center = new THREE.Vector3((A.x + B.x) / 2, 0, (A.z + B.z) / 2);
    let id = 'Plane', i = 1;
    while (blocks.some(b => b.id === id)) id = 'Plane' + (i++);
    const M = [
        center.x, 0, center.z,
        p.xrot, solved.yrot, p.zrot,
        p.scale, p.extend_scale,
        p.extend_xrot, p.extend_yrot,
        0, 0, 0
    ];
    return new Block(id, M, null, matColor || '#aaccff', 'cube', null, null);
}

/* ------------------------------- 生成面片 ------------------------------- */
function imtrGenerate() {
    if (!imtrResult || !imtrResult.pieces.length) {
        showToast('还没有可生成的面片，请先「预览识别」或「按多边形填充」');
        return;
    }
    const p = imtrGetParams();
    const r = imtrResult;
    if (r.pieces.length > 5000) {
        showToast('❌ 面片过多（' + r.pieces.length + '），请降低分辨率 / 提高平滑度后再生成');
        return;
    }

    let made = 0;
    _bulkAddDepth++;
    try {
        for (const q of r.pieces) {
            let blk = imtrMakeRectBlockW(
                { x: q.ax, z: q.az }, { x: q.bx, z: q.bz }, q.width, '#aaccff'
            );
            if (!blk) continue;
            let wool = IMTR_WOOLS[0].file;
            if (p.colorMode === 'auto' && q.rgb) wool = imtrNearestWool(q.rgb[0], q.rgb[1], q.rgb[2]).file;
            try { blk.applyFaceTextures(new Array(6).fill(wool), null); } catch (e) {}
            addBlock(blk, false, false);
            // ★面片与「显示平面」网格都在 y=0，共面会 z-fighting（看起来像蓝白条纹/断线）。
            //   给生成的面片材质加负 polygonOffset，把它轻微拉向相机，开网格时也实心。
            try {
                if (blk.mesh && blk.mesh.material) {
                    blk.mesh.material.polygonOffset = true;
                    blk.mesh.material.polygonOffsetFactor = -2;
                    blk.mesh.material.polygonOffsetUnits = -2;
                }
            } catch (e) {}
            imtrCreatedIds.push(blk.id);
            made++;
        }
    } finally { _bulkAddDepth--; }

    try { if (typeof renderSideBlockList === 'function' && isNewLayoutMode) renderSideBlockList(); } catch (e) {}
    try { recordAction(); } catch (e) {}
    const st = document.querySelector('#imtrOverlay #imtrStats');
    if (st) st.textContent = '已生成 ' + made + ' 片定向面片';
    showToast('✅ 已生成 ' + made + ' 片');
}

/* ---------------------------- 手动多边形填充 ----------------------------
   用户已在描点模式勾勒了多边形顶点：优先取「已选中的点」（按选择顺序），
   没有选中时取全部点（按创建顺序）。只对多边形内部格子置 1，再矩形分解。 */
function imtrFillPolygon() {
    const p = imtrGetParams();
    let pts = [];
    if (typeof ptSelection !== 'undefined' && ptSelection.length >= 3) {
        pts = ptSelection.map(id => ptMarkers.find(m => m.id === id)).filter(Boolean).map(m => ({ x: m.x, z: m.z }));
    } else if (typeof ptMarkers !== 'undefined') {
        pts = ptMarkers.map(m => ({ x: m.x, z: m.z }));
    }
    if (pts.length < 3) { showToast('❌ 至少需要 3 个点（已选中或全部点）'); return; }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const q of pts) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z); }
    const cell = Math.max(0.05, p.polyCell);
    const cols = Math.max(1, Math.ceil((maxX - minX) / cell));
    const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
    if (cols * rows > 200000) { showToast('❌ 格子过多，请增大格子尺寸'); return; }

    const grid = new Uint8Array(cols * rows);
    const inside = (x, z) => {
        let ok = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].x, zi = pts[i].z, xj = pts[j].x, zj = pts[j].z;
            if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi)) ok = !ok;
        }
        return ok;
    };
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
        if (inside(minX + (cx + 0.5) * cell, minZ + (cy + 0.5) * cell)) grid[cy * cols + cx] = 1;
    }

    let rects = imtrDecompose(grid, cols, rows);
    rects = rects.filter(r => r.w * r.h >= p.minArea);
    const pieces = rects.map(r => {
        const x0 = minX + r.x * cell, z0 = minZ + r.y * cell;
        const wX = r.w * cell, dZ = r.h * cell;
        let ax, az, bx, bz, width;
        if (wX >= dZ) { ax = x0; az = z0 + dZ / 2; bx = x0 + wX; bz = az; width = dZ; }
        else { ax = x0 + wX / 2; az = z0; bx = ax; bz = z0 + dZ; width = wX; }
        return { ax, az, bx, bz, width, rgb: [233, 236, 236] };
    });

    imtrProcCanvas = null;
    imtrResult = { kind: 'poly', pieces, pxW: cols, pxH: rows, cols, rows, rects };
    imtrDrawPolyPreview();
    showToast('✅ 多边形内共 ' + pieces.length + ' 片，可以生成');
}

function imtrDrawPolyPreview() {
    const o = document.getElementById('imtrOverlay');
    const cvs = o && o.querySelector('#imtrCanvas');
    const empty = o && o.querySelector('#imtrEmpty');
    const stats = o && o.querySelector('#imtrStats');
    if (!cvs || !imtrResult) return;
    if (empty) empty.style.display = 'none';
    const r = imtrResult;
    const dw = 320, dh = Math.max(1, Math.round(320 * r.rows / r.cols));
    cvs.width = dw; cvs.height = dh;
    const cx = cvs.getContext('2d');
    cx.fillStyle = 'rgba(255,255,255,0.06)';
    cx.fillRect(0, 0, dw, dh);
    cx.strokeStyle = 'rgba(59,130,246,0.95)';
    cx.fillStyle = 'rgba(59,130,246,0.28)';
    for (const q of r.rects) {
        const x = q.x / r.cols * dw, y = q.y / r.rows * dh;
        const ww = q.w / r.cols * dw, hh = q.h / r.rows * dh;
        cx.fillRect(x, y, ww, hh); cx.strokeRect(x, y, ww, hh);
    }
    if (stats) stats.textContent = '多边形网格 ' + r.cols + '×' + r.rows + ' · 共 ' + r.pieces.length + ' 片';
}

/* ------------------------------- 导出 / 清除 ------------------------------- */
function imtrExportCommands() {
    const out = document.querySelector('#imtrOverlay #imtrCmdOut');
    if (!imtrCreatedIds.length) { showToast('还没有生成面片，先点「生成面片」'); return; }
    const list = blocks.filter(b => imtrCreatedIds.indexOf(b.id) >= 0);
    let texts;
    try { texts = list.map(b => getCommandTextForBlock(b, {})).filter(Boolean); }
    catch (e) { texts = []; }
    const s = texts.join('\n');
    if (out) {
        out.value = s;
        try { out.focus(); out.select(); } catch (e) {}
    }
    if (s) {
        try { document.execCommand('copy'); showToast('✅ 已复制 ' + texts.length + ' 条指令'); }
        catch (e) { showToast('已输出 ' + texts.length + ' 条指令'); }
    } else showToast('❌ 指令生成失败');
}

function imtrClearCreated() {
    if (!imtrCreatedIds.length) { showToast('本次还没有生成面片'); return; }
    const ids = imtrCreatedIds.slice();
    imtrCreatedIds = [];
    _bulkAddDepth++;
    try {
        for (const id of ids) {
            const b = blocks.find(x => x.id === id);
            if (b) { try { removeBlock(b, true); } catch (e) {} }
        }
    } finally { _bulkAddDepth--; }
    try { if (typeof renderSideBlockList === 'function' && isNewLayoutMode) renderSideBlockList(); } catch (e) {}
    try { recordAction(); } catch (e) {}
    showToast('🗑 已清除本次生成的 ' + ids.length + ' 片');
}

/* ------------------------------- 入口绑定 ------------------------------- */
function imtrInit() {
    const btn = document.getElementById('imtrOpenBtn');
    if (btn) btn.onclick = () => { imtrEnsureModal().style.display = 'flex'; };
    // 入口默认隐藏，仅开发者模式可见（HTML 里已内联 display:none，这里按当前 devMode 同步）
    try { if (typeof applyImtrEntryVisibility === 'function') applyImtrEntryVisibility(); } catch (e) {}
}
imtrInit();
