/* 09-tutorial/01-init-and-sfx.js · 源 测试版v.6b79.html 第 46987-47184 行 */
'use strict';
// ==================== 初始化 ====================
// 初始化检查
console.log('关键帧动画系统已加载');
// 预构建「云端贴图 → data URI」反查索引：用户导出时若遇到 base64 贴图可直接反查出中文名，
// 避免命令里内嵌一长串 base64（用户明确要求）。后台执行，不阻塞任何操作。
setTimeout(ensureTexUriMap, 200);

/* ============================================================
 * 教程音效（2026-10-16 新增，用户要求「别只有视觉效果，太无聊」）
 * 设计：**双轨** —— ① 若 Sounds/ 文件夹里有同名音频文件就优先播文件；
 *       ② 没有则用 Web Audio 实时合成（零文件、零体积、必然可播）。
 * 音色：select 清脆「哒哒」/ next 轻快翻页 / prev 较低沉 / complete 上行音阶 / error 低闷。
 * 开关：设置面板「新手教程」卡片里的「教程音效」，持久化到 localStorage。
 * ⚠ 浏览器自动播放策略：AudioContext 必须在**用户手势**里 resume，见 exTutSfxUnlock。
 * ============================================================ */
const EX_TUT_SFX_KEY = 'ex_tut_sfx_v1';
// 'type' = 打字机逐字打印配音（密集音，走独立的 exTutSfxType，见下）
const EX_TUT_SFX_NAMES = ['select', 'next', 'prev', 'complete', 'error', 'type', 'stamp'];
const EX_TUT_SFX_EXTS = ['mp3', 'ogg', 'wav'];
let exTutSfxOn = true;          // 默认开启（用户要求「默认开启，设置里可关」）
let exTutSfxCtx = null;
let exTutSfxMaster = null;
const exTutSfxFiles = {};       // name -> HTMLAudioElement（已成功加载）
const exTutSfxFileOk = {};      // name -> true 表示文件可用
const exTutSfxLast = {};        // name -> 上次播放时间（防连响）

function exTutSfxLoadPref() {
    try {
        const v = localStorage.getItem(EX_TUT_SFX_KEY);
        if (v === '0') exTutSfxOn = false;
        else if (v === '1') exTutSfxOn = true;
    } catch (e) {}
}
function exTutSfxSetOn(v) {
    exTutSfxOn = !!v;
    try { localStorage.setItem(EX_TUT_SFX_KEY, exTutSfxOn ? '1' : '0'); } catch (e) {}
}
function exTutSfxEnsureCtx() {
    if (exTutSfxCtx) return exTutSfxCtx;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        exTutSfxCtx = new AC();
        exTutSfxMaster = exTutSfxCtx.createGain();
        exTutSfxMaster.gain.value = 0.16;   // 总音量压得较低，避免突兀
        exTutSfxMaster.connect(exTutSfxCtx.destination);
    } catch (e) { exTutSfxCtx = null; }
    return exTutSfxCtx;
}
// 首次用户手势解锁音频（自动播放策略）
function exTutSfxUnlock() {
    const c = exTutSfxEnsureCtx();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
}
document.addEventListener('pointerdown', exTutSfxUnlock, { passive: true });
document.addEventListener('keydown', exTutSfxUnlock, { passive: true });
// 预热 Sounds/ 里的可选文件（存在就用文件，不存在就保持合成）
function exTutSfxPreload() {
    EX_TUT_SFX_NAMES.forEach(function (nm) {
        let i = 0;
        const tryNext = function () {
            if (i >= EX_TUT_SFX_EXTS.length) { exTutSfxFileOk[nm] = false; return; }
            try {
                const a = new Audio();
                a.preload = 'auto';
                a.src = 'Sounds/' + nm + '.' + EX_TUT_SFX_EXTS[i++];
                a.addEventListener('canplaythrough', function () {
                    exTutSfxFiles[nm] = a; exTutSfxFileOk[nm] = true;
                }, { once: true });
                a.addEventListener('error', tryNext, { once: true });
            } catch (e) { exTutSfxFileOk[nm] = false; }
        };
        tryNext();
    });
}
// 单个音：起始频率 f0 → 结束频率 f1，指数包络
function exTutSfxTone(t0, f0, f1, dur, type, peak) {
    const c = exTutSfxCtx; if (!c) return;
    try {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(f0, t0);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak || 0.9, t0 + Math.min(0.012, dur * 0.25));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(exTutSfxMaster);
        o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
}
function exTutSfxSynth(name) {
    const c = exTutSfxEnsureCtx(); if (!c) return;
    const t = c.currentTime + 0.005;
    if (name === 'select') {
        // 清脆「哒哒」：两声极短高频点击
        exTutSfxTone(t, 1500, 1180, 0.045, 'triangle', 0.85);
        exTutSfxTone(t + 0.055, 1900, 1500, 0.05, 'triangle', 0.7);
    } else if (name === 'next') {
        exTutSfxTone(t, 780, 900, 0.09, 'sine', 0.7);
        exTutSfxTone(t + 0.075, 1170, 1320, 0.11, 'sine', 0.62);
    } else if (name === 'prev') {
        exTutSfxTone(t, 700, 560, 0.1, 'sine', 0.66);
        exTutSfxTone(t + 0.08, 520, 400, 0.13, 'sine', 0.58);
    } else if (name === 'complete') {
        // 上行音阶 C-E-G-C
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
            exTutSfxTone(t + i * 0.085, f, f * 1.002, 0.24, 'sine', 0.6);
        });
    } else if (name === 'error') {
        exTutSfxTone(t, 200, 150, 0.16, 'square', 0.42);
        exTutSfxTone(t + 0.1, 160, 120, 0.2, 'square', 0.36);
    } else if (name === 'type') {
        // 打字「嗒」：极短高频点击 + 随机音高抖动 ⇒ 像机械键盘，不是电子蜂鸣
        const j = 1 + (Math.random() * 0.16 - 0.08);       // ±8% 音高抖动
        const f = 2350 * j;
        exTutSfxTone(t, f, f * 0.72, 0.028, 'triangle', 0.34);
        // 叠一层极轻的高频瞬态，增加「脆」感（几乎听不见但让颗粒更清晰）
        exTutSfxTone(t, f * 1.9, f * 1.45, 0.014, 'sine', 0.12);
    } else if (name === 'stamp') {
        // 「印章重重砸下」：低频闷击「咚」+ 木质瞬态 + 短促纸噪。
        // 主击：低频正弦 180→90Hz 快速下滑 + 中频三角 420→240 增加「实体感」，强起音短衰减。
        exTutSfxTone(t, 180, 90, 0.22, 'sine', 0.95);
        exTutSfxTone(t, 420, 240, 0.12, 'triangle', 0.5);
        // 木质瞬态：极短高频方波「嗒」，像印章边沿砸到纸面
        exTutSfxTone(t, 1500, 900, 0.025, 'square', 0.3);
        // 砸下后纸面余震：一记更轻的低频回响
        exTutSfxTone(t + 0.03, 120, 80, 0.18, 'sine', 0.4);
        // 短促纸噪（白噪 burst）：用 createBuffer 灌一段衰减噪声，增强「啪」的打击质感
        try {
            const c = exTutSfxCtx; if (c) {
                const len = Math.floor(c.sampleRate * 0.06);
                const buf = c.createBuffer(1, len, c.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
                const src = c.createBufferSource(); src.buffer = buf;
                const ng = c.createGain(); ng.gain.value = 0.35;
                const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
                src.connect(lp); lp.connect(ng); ng.connect(exTutSfxMaster);
                src.start(t); src.stop(t + 0.06 + 0.02);
            }
        } catch (e3) {}
    }
}
// 统一入口：教程各交互点调它即可
function exTutSfx(name) {
    if (!exTutSfxOn) return;
    try {
        const now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (exTutSfxLast[name] && now - exTutSfxLast[name] < 45) return;   // 45ms 内同名不重响
        exTutSfxLast[name] = now;
        exTutSfxLast.__any = now;
        if (exTutSfxFileOk[name] && exTutSfxFiles[name]) {
            const a = exTutSfxFiles[name].cloneNode();
            a.volume = 0.55;
            const p = a.play();
            if (p && p.catch) p.catch(function () { exTutSfxSynth(name); });
            return;
        }
        exTutSfxSynth(name);
    } catch (e) {}
}
// 打字机配音：逐字打印的每个 tick 调一次。
// 与 exTutSfx 分开的原因：主入口有 45ms 同名去重，而打字 tick 只有 22ms ⇒ 会漏一半节奏。
// 这里用 55ms 最小间隔（≈18 次/秒）：像快速键盘，又不会糊成一片电流声。
let exTutSfxTypeLast = 0;
let exTutSfxTypeCount = 0;      // 已播放次数（调试/探针可观测）
function exTutSfxType() {
    if (!exTutSfxOn) return;
    try {
        const now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (now - exTutSfxTypeLast < 55) return;
        exTutSfxTypeLast = now;
        exTutSfxTypeCount++;
        exTutSfxLast.__any = now;
        if (exTutSfxFileOk['type'] && exTutSfxFiles['type']) {
            const a = exTutSfxFiles['type'].cloneNode();
            a.volume = 0.32;                                  // 打字音比其他音效更轻
            const p = a.play();
            if (p && p.catch) p.catch(function () { exTutSfxSynth('type'); });
            return;
        }
        exTutSfxSynth('type');
    } catch (e) {}
}
// 「卡片出现」音：新步骤卡片浮出时的轻快翻页声。
// ⚠ 去重关键：上一步/下一步/通关等**点击瞬间**已经响过了，而 tutRender 紧随其后，
//   若这里无条件再响一次就会「一声变两声」。故用「最近 160ms 内有没有响过别的音」来抑制。
function exTutSfxCard() {
    if (!exTutSfxOn) return;
    try {
        const now = (window.performance && performance.now) ? performance.now() : Date.now();
        if (exTutSfxLast.__any && now - exTutSfxLast.__any < 160) return;
        exTutSfx('next');
    } catch (e) {}
}
try { exTutSfxLoadPref(); } catch (e) {}
setTimeout(exTutSfxPreload, 600);

