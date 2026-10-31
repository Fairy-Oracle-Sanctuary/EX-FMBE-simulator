/* 01-core/02-math-and-query.js · 源 测试版v.6b79.html 第 7141-7266 行 */
'use strict';
// ==================== 数学库 ====================
// 每个方块独立的伪随机数状态（math.random / die_roll 等按方块隔离，每帧自发推进）
const _blockRngStates = new Map();
let _globalRngSeed = 0x9e3779b9;
let _currentEvalBlockId = null;

function hashString(str) {
    let h = 1779033703;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
    }
    return h >>> 0;
}
function nextRng(seed) {
    let s = seed + 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
}
function blockRandom(blockId) {
    if (!blockId) return globalRandom();
    let seed = _blockRngStates.get(blockId);
    if (seed === undefined) { seed = hashString(String(blockId)); _blockRngStates.set(blockId, seed); }
    const r = nextRng(seed);
    _blockRngStates.set(blockId, r.state);
    return r.value;
}
function globalRandom() {
    const r = nextRng(_globalRngSeed);
    _globalRngSeed = r.state;
    return r.value;
}
function randomFloat(low, high, blockId) {
    const lo = Number(low) || 0, hi = Number(high) || 0;
    return lo + (blockId ? blockRandom(blockId) : globalRandom()) * (hi - lo);
}
function randomInt(low, high, blockId) {
    const lo = Math.ceil(Number(low) || 0), hi = Math.floor(Number(high) || 0);
    if (hi < lo) return lo;
    return lo + Math.floor((blockId ? blockRandom(blockId) : globalRandom()) * (hi - lo + 1));
}

const angleMath = {
    sin: d => Math.sin(d * Math.PI / 180), cos: d => Math.cos(d * Math.PI / 180),
    asin: v => Math.asin(v) * 180 / Math.PI, acos: v => Math.acos(v) * 180 / Math.PI, atan: v => Math.atan(v) * 180 / Math.PI,
    atan2: (y, x) => Math.atan2(y, x) * 180 / Math.PI, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
    round: Math.round, pow: Math.pow, exp: Math.exp, ln: Math.log, min: Math.min, max: Math.max,
    trunc: Math.trunc, mod: (v, d) => (d === 0 ? v : v % d),
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    lerp_rotate: (start, end, t) => { let diff = (end - start) % 360; if (diff > 180) diff -= 360; if (diff <= -180) diff += 360; return start + diff * t; },
    lerprotate: (start, end, t) => { let diff = (end - start) % 360; if (diff > 180) diff -= 360; if (diff <= -180) diff += 360; return start + diff * t; },
    min_angle: a => { a = a % 360; if (a > 180) a -= 360; if (a <= -180) a += 360; return a; },
    hermite_blend: t => 3 * t * t - 2 * t * t * t,
    pi: Math.PI, PI: Math.PI,
    random: (low, high) => randomFloat(low, high, _currentEvalBlockId),
    random_integer: (low, high) => randomInt(low, high, _currentEvalBlockId),
    die_roll: (num, low, high) => { let sum = 0; const n = Math.max(0, Math.floor(Number(num) || 0)); for (let i = 0; i < n; i++) sum += angleMath.random(low, high); return sum; },
    die_roll_integer: (num, low, high) => { let sum = 0; const n = Math.max(0, Math.floor(Number(num) || 0)); for (let i = 0; i < n; i++) sum += angleMath.random_integer(low, high); return sum; }
};

// ==================== 查询函数（供方块变量表达式调用） ====================
// 命名空间 q：可在方块变量表达式中以 q.xxx(...) 形式调用。
// 查询函数是否随相机实时更新（false 时冻结为关闭瞬间的“当前值”）
let _queryUpdateEnabled = true;
const _queryCache = {};
// q.life_time 全局自增时钟：模拟器语义下的「方块存在时长」（秒）。
// 实际上是全局自增参数（不会真追踪每块创建时刻）——提高效率，无需删建方块重来。
let _lifeTime = 0;                 // 全局自增时钟（秒）：每个方块记录自己的出生时刻 _lifeBorn，life_time = _lifeTime - _lifeBorn
let _lifeTimeLast = 0;             // 上一帧 performance.now() 时间戳
let _lifeTimeResetFreeze = false;  // 重置倒计时期间冻结（停止自增）
let _lifeTimeResetTimer = null;    // 重置用的 setTimeout 句柄
// 例如 v.yrot = q.rotation_to_camera(1) 可让方块绕 Y 轴对准摄像机。
const queryNamespace = {
    // 返回当前动画时间（秒），由关键帧播放系统驱动；未播放时返回上次暂停的时间点
    anim_time: function () {
        return keyframeCurrentTime || 0;
    },
    // 坐标原点 (0,0,0) 看向摄像机的角度（单位：度，与 math / 方块旋转统一为角度制）
    // mode = 0：返回俯仰角（相对水平面，符号与方块 xrot 约定一致，故此处取负）
    // mode = 1：返回偏航角（XZ 平面方位角），对齐方块 yrot 基准，故整体减 90°
    rotation_to_camera: function (mode) {
        if (!_queryUpdateEnabled && _queryCache[mode] !== undefined) return _queryCache[mode];
        const dx = camera.position.x, dy = camera.position.y, dz = camera.position.z;
        const horiz = Math.sqrt(dx * dx + dz * dz);
        const len = Math.sqrt(horiz * horiz + dy * dy);
        let val;
        if (len < 1e-9) val = 0;
        else if (Number(mode) === 1) val = Math.atan2(dz, dx) * 180 / Math.PI - 90;
        else val = -Math.atan2(dy, horiz) * 180 / Math.PI;
        _queryCache[mode] = val; // 始终记录最近一次真实值，关闭更新时即为冻结的“当前值”
        return val;
    },
    // 返回【该方块自身】自创建 / 复制 / 加载以来经历的时间（秒）。
    // 每个方块在 addBlock 时记录自己的出生时刻 _lifeBorn（= 当时全局时钟 _lifeTime 的值），
    // 因此不同方块各自独立计时；复制 / 新建的方块是「新生的」，life_time 从接近 0 开始，与原件不同。
    // 与 rotation_to_camera 一样受「查询函数更新」总开关控制：关闭时冻结为关闭瞬间该方块自己的数值。
    life_time: function () {
        const b = (_currentEvalBlockId != null) ? getBlockById(_currentEvalBlockId) : null;
        const born = (b && b._lifeBorn != null) ? b._lifeBorn : 0;
        const val = _lifeTime - born;
        if (!_queryUpdateEnabled) return (b && b._lifeFrozen !== undefined) ? b._lifeFrozen : val;
        if (b) b._lifeFrozen = val;
        return val;
    }
};
// q.life_time 重置：先冻结所有方块的 life_time（停止自增），3 秒后把所有方块的出生时刻对齐到当前时钟，
// 使其 life_time 同时归零，再从 0 一起重新开始自增。
function resetLifeTime() {
    _lifeTimeResetFreeze = true;
    if (_lifeTimeResetTimer) clearTimeout(_lifeTimeResetTimer);
    _lifeTimeResetTimer = setTimeout(() => {
        const t = _lifeTime;                       // 冻结期间 _lifeTime 未前进，此刻即为按下重置时的时刻
        for (const b of blocks) b._lifeBorn = t;  // 所有方块同时归零
        _lifeTimeResetFreeze = false;
        _lifeTimeResetTimer = null;
        if (typeof showToast === 'function') showToast('q.life_time 已归零，重新开始计时');
    }, 3000);
    if (typeof showToast === 'function') showToast('q.life_time 正在重置（3 秒后归零）');
}

// 更新日志库
