/* 02-script-kernel/01-fmbe-interpreter.js · 源 测试版v.6b79.html 第 7591-8338 行 */
'use strict';
// ========== 程序式脚本解释器（FMBE 风格，顺序执行）==========
// 语法（自上而下顺序执行；同一变量可多次赋值，后写覆盖先写）：
//   语句以 ; 分隔（末尾 ; 可省略）
//   赋值语句：  v.NAME = 表达式
//   条件语句：  条件表达式 ? (语句序列) : (语句序列)    分支也可用 { } 包围
//   表达式支持：数字、v.NAME、t.NAME、math.xxx(...)、q.xxx(...)、
//              运算符 ! && || == != < <= > >= + - * / 、括号 ( )、以及表达式级三元 a?b:c
//   返回语句：  return 表达式;   —— 立即结束整段程序（FMBE 指令结尾常见的 `return 0;`）
//   变量若不存在视为 0；t. 引用全局变量；条件为真（非 0）走 then 分支。
// 词法分析：返回带行号(line, 1-based)的记号数组，供解释器与静态校验共用
function tokenizeMolang(text) {
    const tokens = [];
    let i = 0, line = 1;
    const isDig = c => c >= '0' && c <= '9';
    const isAlp = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
    const isAln = c => isAlp(c) || isDig(c);
    const TWO = ['==', '!=', '<=', '>=', '&&', '||', '??'];
    while (i < text.length) {
        const c = text[i];
        if (c === ' ' || c === '\t') { i++; continue; }
        if (c === '\n' || c === '\r') { if (c === '\n') line++; i++; continue; }
        // ★★【2026-10-02 修根因】成员访问点必须排在「小数」规则【前面】判断。
        //   紧跟标识符之后的 `.` 一定是成员点，绝不能当成小数开头。
        //   反例：`t.1_yrot`（骨骼 id 为数字时导出/关键帧驱动会产生，见 reconstructBoneAnimationImports）。
        //   旧代码把 `.1` 当成小数（parseFloat('.1') = 0.1）⇒ `t` 退化成裸命名空间、后面多出一个数字记号，
        //   最终在 parseStatement 里抛出【误导性的】「语句结尾缺少分号」，而且整段程序直接异常中断
        //   —— 该方块的 molang 完全不生效（用户报「这哪里有问题啊 / 哪都没缺分号」的真凶）。
        //   这里把成员名整段读成一个 id 记号（允许数字开头），与 evaluateExpression 里
        //   `t.<数字>` → `t["<数字>"]` 的既有约定保持一致，两条求值路径口径统一。
        if (c === '.' && tokens.length && tokens[tokens.length - 1].t === 'id' && isAln(text[i + 1] || '')) {
            tokens.push({ t: 'op', v: '.', s: i, e: i + 1, line });
            i++;
            let j = i;
            while (j < text.length && isAln(text[j])) j++;
            if (j > i) { tokens.push({ t: 'id', v: text.slice(i, j), s: i, e: j, line }); i = j; }
            continue;
        }
        if (isDig(c) || (c === '.' && isDig(text[i + 1]))) {
            let j = i + 1;
            while (j < text.length && (isDig(text[j]) || text[j] === '.')) j++;
            tokens.push({ t: 'num', v: parseFloat(text.slice(i, j)), s: i, e: j, line }); i = j; continue;
        }
        if (isAlp(c)) {
            let j = i + 1;
            while (j < text.length && isAln(text[j])) j++;
            tokens.push({ t: 'id', v: text.slice(i, j), s: i, e: j, line }); i = j; continue;
        }
        const two = text.substr(i, 2);
        if (TWO.indexOf(two) !== -1) { tokens.push({ t: 'op', v: two, s: i, e: i + 2, line }); i += 2; continue; }
        if ('!<>=&|?:(){};+-*/.,'.indexOf(c) !== -1) { tokens.push({ t: 'op', v: c, s: i, e: i + 1, line }); i += 1; continue; }
        i++;
    }
    return tokens;
}

/* ★★【2026-11-08 通用性能 · 编译缓存】
   旧实现每次 runBlockProgram 都 tokenizeMolang(text) 一遍；动画循环里每个块的每一层
   每帧都会重新走一遍词法分析（蜘蛛腿预设 37 块 × 多层 × 60fps）。
   这里按程序文本缓存「token 数组 + 读集/是否含 q./是否自引用」的分析结果：
     · 文本不变 ⇒ 只tokenize一次，后续直接复用；
     · 解析器只读 token 数组（游标 p 是 runBlockProgram 的局部变量，不会改 tokens），复用安全；
     · 有界 FIFO/LRU（超 64 条逐出最旧的），改一次程序最多留一条新条目，不会无限增长。
   读集 readsV/readsT 是后续「依赖脏标记」判断某块是否真的需要重算的输入基础。 */
const _molangParseCache = new Map();      // text -> { tokens, readsV, readsT, hasQ, selfRef }
const _MOLANG_PARSE_CACHE_MAX = 64;
function _molangAnalyze(text) {
    const src = text == null ? '' : String(text);
    let e = _molangParseCache.get(src);
    if (e) {
        _molangParseCache.delete(src);       // 命中 ⇒ 移到队尾（LRU）
        _molangParseCache.set(src, e);
        return e;
    }
    const tokens = tokenizeMolang(src);
    const readsV = new Set(), readsT = new Set(), readsQ = new Set(), writesV = new Set();
    let hasQ = false;
    for (let i = 0; i < tokens.length; i++) {
        const tk = tokens[i];
        if (tk.t !== 'id') continue;
        // id '.' id ⇒ 命名空间成员：v.xxx / t.xxx / q.xxx
        const isMember = tokens[i + 1] && tokens[i + 1].t === 'op' && tokens[i + 1].v === '.' && tokens[i + 2] && tokens[i + 2].t === 'id';
        if (tk.v === 'q') {
            hasQ = true;
            if (isMember) readsQ.add(tokens[i + 2].v);
            continue;
        }
        if (isMember) {
            if (tk.v === 'v') {
                const nm = tokens[i + 2].v;
                readsV.add(nm);
                // 下一个记号是单个 '='（不是 ==）⇒ 这是赋值左值，记为本程序「写出的变量」
                const nx = tokens[i + 3];
                if (nx && nx.t === 'op' && nx.v === '=') writesV.add(nm);
            }
            else if (tk.v === 't') readsT.add(tokens[i + 2].v);
        }
    }
    // ★「跨帧自引用」判定（取代旧的一刀切正则）：
    //   旧实现只要看到 `v.X=…v.X` 就断定「依赖上一帧必须每帧重算」，于是 IK 求解层
    //   （`v.ik_lxy=0; v.ik_lxy=v.ik_lxy+…;` 这种循环累加器）被误判成必须每帧跑，
    //   只能靠 `ikHasSolveLayer` 白名单特例豁免（用户质疑「搞特例」的根源）。
    //   正解：只有当同一变量【此前没有非自引用初始化】时，自引用才真正跨帧。
    //   例：`v.t=v.t+1;`（无 v.t=0 初始化）⇒ 跨帧；`v.ik_lxy=0; v.ik_lxy=v.ik_lxy+…;` ⇒ 程序内累加器，纯函数。
    const crossFrame = _molangCrossFrameSelfRef(src);
    // 稳定文本哈希（FNV-1a 32 位）：供「依赖签名」识别「程序正文变了但读集相同」的编辑，
    // 避免改完公式后因读集不变被误判成「输入没变」而跳过重算。只在首次分析时算一次。
    let hash = 2166136261;
    for (let i = 0; i < src.length; i++) { hash ^= src.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    hash = hash >>> 0;
    e = { tokens, readsV, readsT, readsQ, writesV, hasQ, crossFrame, hash };
    _molangParseCache.set(src, e);
    if (_molangParseCache.size > _MOLANG_PARSE_CACHE_MAX) {
        _molangParseCache.delete(_molangParseCache.keys().next().value);
    }
    return e;
}

// 逐「语句段」找赋值 `v.NAME = RHS`：RHS 读到自己且此前没有非自引用初始化 ⇒ 跨帧自引用。
// （molang 语句以 ; 分隔；ternary 里的小语句也在括号内用 ; 分隔，按 ; 切分足够。）
function _molangCrossFrameSelfRef(src) {
    const init = Object.create(null);   // name -> true：已出现非自引用初始化（v.x=0 / v.x=常量…）
    const segs = String(src).split(';');
    for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        const m = /v\.([A-Za-z_]\w*)\s*=(?!=)/.exec(seg);
        if (!m) continue;
        const name = m[1];
        const rhs = seg.slice(m.index + m[0].length);
        const selfRead = new RegExp('v\\.' + name + '(?![A-Za-z0-9_])').test(rhs);
        if (!selfRead) { init[name] = true; continue; }
        if (!init[name]) return true;   // 第一次出现就是自引用 ⇒ 依赖上一帧
    }
    return false;
}

/* 旧「逐 token 遍历 + 每帧重建闭包」解释器：仅在编译路径出现意外时作为兜底，
   正常运行不再走这里（性能参考见下方 _molangCompile）。 */
function _runBlockProgramLegacy(text, scope, opts) {
    const validateOnly = !!(opts && opts.validateOnly);
    const collectDecl = opts && opts.collectDecl;
    const tokens = _molangAnalyze(text).tokens;
    // return 语句用这个哨兵值中断执行（避免与用户程序的异常混淆）：抛到 parseProgram 顶层被吞掉。
    const RETURN_SIGNAL = {};
    scope._assigned = new Set(); // 本次执行中被赋值的变量（供核心变量默认回退使用）
    scope._tWrites = new Set();  // 本次执行中【数值真正变化】的 t.* 全局名（供刷新依赖它的块，避免读到上一帧旧值）
    scope._tolerant = false;     // ?? 左操作数求值时的“宽容模式”：允许读取尚未定义的变量（用于 v.x=v.x??0 初始化）
    let p = 0;
    const peek = () => tokens[p];
    const next = () => tokens[p++];
    const setVar = (name, val, srcExpr) => {
        let d = scope.vars.get('v.' + name);
        if (!d) { d = new VarDef(srcExpr != null ? srcExpr : String(val), val, -1e9, 1e9, 1); scope.vars.set('v.' + name, d); }
        else {
            d.value = val;
            /* ★★★【2026-10-14 P0 修复 · 用户投诉「自定义变量改一个=改全部 / 变量从数据表消失」的真根因】
               关键帧编译产物里，被驱动变量会被写成插值行
                 `v.side_b=math.lerp(v.Cube_start_side_b,v.Cube_Tside_b,v.Cube_u);`
               旧实现无条件 `d.expr = srcExpr` ⇒ **把用户原来的表达式/常量永久覆盖成这条 lerp 文本**。
               后果链（实测）：
                 ① `d.expr` 变成 `math.lerp(...)` ⇒ `isConstantExpr` 为 false
                    ⇒ `kfIsNonConstAssigned` 为 true ⇒ `kfIsDerivedVar` 判定它是「派生量」
                    ⇒ **该变量从数据表消失**（实测 `kfBlockVars(["side_a"])` 丢了 `side_b`），
                      而 `kfTableVars` 用另一套口径仍列出它 ⇒ 两处不一致；
                 ② 用户在表里改它的值 → 后端按"派生量"处理/找不到帧键 ⇒ 落值混乱
                    ⇒ 表现为「改一个 = 改全部」。
               正解：**编译器自己生成的插值/常量脚手架行，不得回写用户变量的 `expr`**
               （只更新 value）。判据：`srcExpr` 是本方块命名空间的关键帧内部量（`v.<id>_start_X`
               / `v.<id>_TX` / `_u` / `_seg_time` / `_time`）构成的 lerp 公式时，跳过 expr 回写。
               这样 `side_b.expr` 保持用户原文（常量 `2` 或用户表达式），变量身份稳定。 */
            if (srcExpr != null) {
                let _isKfScaffold = false;
                try {
                    const _bid = scope.blockId;
                    _isKfScaffold = /_start_[A-Za-z_]/.test(String(srcExpr)) || /_T[A-Za-z_]/.test(String(srcExpr))
                        || (typeof _kfIsNsInternal === 'function' && _bid && String(srcExpr).indexOf('v.' + _bid + '_') >= 0);
                } catch (e) { }
                // 另一种防护：scope 明确处于「编译式关键帧」时，插值行也不是用户原文
                if (!_isKfScaffold && scope._kfCompiledActive && /math\.lerp|math\.lerprotate/.test(String(srcExpr))) _isKfScaffold = true;
                /* ★★★【2026-11-08 性能 P0 · IK 巨卡根因】
                   骨骼/IK 求解动画的中间量（v.ik_* / v.ikW / v.parent_* / v.pR* / v.p_* / *_basepos_bone）
                   是「每帧重算的机器量」，绝不能把程序里的赋值语句回写成变量的定义表达式。
                   旧实现无条件回写 ⇒ `v.ik_lxy=v.ik_lxy+sqrt(...)` 变成它的 expr，
                   下一帧 base 层「变量卡片不动点」自己叠自己（每轮 +0.5），永远不收敛 ⇒
                   20 轮 × 179 变量 ≈ 16ms/块/帧（实测 spider preset 单块 recompute 19ms）。
                   IK 程序首句会把这些量清零/重算，故只更新 value、不碰 expr 完全安全。 */
                const _isBoneInternal = /^(ik_|ikW$|parent_|pR|p_|own_bone_rot)|basepos_bone$/.test(name);
                if (!_isKfScaffold && !_isBoneInternal) d.expr = srcExpr;
            }
        }
        if (scope._assigned) scope._assigned.add('v.' + name); // 记录本次执行中被赋值的变量
    };
    // ★★ 惰性 t 命名空间（2026-10-02 性能修复）：旧实现每次执行程序都先遍历【全部全局变量】做
    //   resolveGlobalValue。全局数量 ≈ 方块数 × 6（骨骼广播 t.<id>_px/py/pz/xrot/yrot/zrot），
    //   78 块导入后一次 refresh 就要解析 ~468 个全局，每个都走 evaluateExpression 编译求值，
    //   累计近 1ms/块 → 每帧 78 块 ≈ 76ms（用户实测「只有 78 块却巨卡」）。
    //   而本项目的方块广播程序【只写不读】t.*，绝大多数块根本用不到全局值 → 改为按需解析：
    //     · 读：先查本帧写入的 overlay，再查 globalVars（语义与旧「预先全量填充」完全等价）；
    //     · 写：落 overlay，保证同一程序内后续读回本帧刚写的值。
    const _tOverlay = Object.create(null);
    const envT = new Proxy(_tOverlay, {
        get(target, n) {
            if (typeof n !== 'string') return undefined;
            if (n in target) return target[n];
            const g = globalVars.get(n);
            return g ? resolveGlobalValue(n, g, 0) : 0;
        },
        set(target, n, v) { target[n] = v; return true; }
    });
    const env = { math: angleMath, q: queryNamespace, t: envT };

    // 带行号的语法错误：curLine 取当前待消费记号的行号（EOF 时返回 null）
    const curLine = () => { const tk = tokens[p]; return tk ? tk.line : null; };
    // ★★ 语法错误必须带「出错表达式的字符区间」（range = {s,e} 源码偏移）。
    //   旧实现只带行号，编辑器只能整行标红；而 molang 程序常被压成一行，
    //   `v.xpos=0 v.ypos=0;` 缺分号时整行（=整个编辑框）全红，用户根本看不出是哪一条。
    //   另外：缺分号的报错点其实是「下一条语句的第一个记号」，行号会指到下一行 —— 显式传 range 时
    //   行号改为按表达式自身起算，报错位置与标红位置口径一致。
    function synErr(m, range) {
        if (range && range.e > range.s) {
            let ln = 1;
            const stop = Math.min(range.s, text.length);
            for (let k = 0; k < stop; k++) if (text[k] === '\n') ln++;
            const err = new Error('语法错误：' + m + '（第 ' + ln + ' 行）');
            err.mlLine = ln; err.mlStart = range.s; err.mlEnd = range.e;
            throw err;
        }
        const ln = curLine(); const err = new Error('语法错误：' + m + (ln ? '（第 ' + ln + ' 行）' : '（末尾）')); err.mlLine = ln || 0; throw err;
    }
    function expect(v) { const tk = peek(); if (!tk || tk.v !== v) synErr('期望 ' + v); p++; }
    function parseExpr(allowTernary) {
        const left = parseNullCoalescing();
        if (allowTernary && peek() && peek().v === '?') {
            next();
            // FMBE 兼容：? 后面可以直接跟 ( ... ; ... ) 语句块，而不只是单一表达式
            const t = (peek() && (peek().v === '(' || peek().v === '{'))
                ? (() => { const list = parseBlock(); return () => { runList(list); return 0; }; })()
                : parseExpr(true);
            let f = null;
            if (peek() && peek().v === ':') {
                next();
                f = (peek() && (peek().v === '(' || peek().v === '{'))
                    ? (() => { const list = parseBlock(); return () => { runList(list); return 0; }; })()
                    : parseExpr(true);
            }
            return () => { const c = left(); if (c) return t(); else if (f) return f(); return 0; };
        }
        return left;
    }
    // ?? 空值合并（FMBE 初始化语法：v.x = v.x ?? 0）。左操作数在“宽容模式”下求值，
    // 允许读取尚未定义的变量（返回 undefined），从而不会因为前向未定义而误报错误。
    function parseNullCoalescing() {
        let left = parseLogicOr();
        while (peek() && peek().v === '??') {
            next();
            const r = parseNullCoalescing();
            const a = left;
            left = () => {
                scope._tolerant = true;
                let l;
                try { l = a(); } finally { scope._tolerant = false; }
                const undef = (l === undefined || l === null || (typeof l === 'number' && Number.isNaN(l)));
                return undef ? r() : l;
            };
        }
        return left;
    }
    function parseLogicOr() {
        let left = parseLogicAnd();
        while (peek() && peek().v === '||') { next(); const r = parseLogicAnd(); const a = left; left = () => (a() || r()); }
        return left;
    }
    function parseLogicAnd() {
        let left = parseEquality();
        while (peek() && peek().v === '&&') { next(); const r = parseEquality(); const a = left; left = () => (a() && r()); }
        return left;
    }
    function parseEquality() {
        let left = parseComparison();
        while (peek() && (peek().v === '==' || peek().v === '!=')) {
            const op = next().v; const r = parseComparison(); const a = left;
            left = () => { const x = a(), y = r(); return op === '==' ? (x === y ? 1 : 0) : (x !== y ? 1 : 0); };
        }
        return left;
    }
    function parseComparison() {
        let left = parseAdditive();
        while (peek() && (peek().v === '<' || peek().v === '<=' || peek().v === '>' || peek().v === '>=')) {
            const op = next().v; const r = parseAdditive(); const a = left;
            left = () => { const x = a(), y = r();
                if (op === '<') return x < y ? 1 : 0;
                if (op === '<=') return x <= y ? 1 : 0;
                if (op === '>') return x > y ? 1 : 0;
                return x >= y ? 1 : 0; };
        }
        return left;
    }
    function parseAdditive() {
        let left = parseMultiplicative();
        while (peek() && (peek().v === '+' || peek().v === '-')) {
            const op = next().v; const r = parseMultiplicative(); const a = left;
            left = () => { const x = a(), y = r(); return op === '+' ? x + y : x - y; };
        }
        return left;
    }
    function parseMultiplicative() {
        let left = parseUnary();
        while (peek() && (peek().v === '*' || peek().v === '/')) {
            const op = next().v; const r = parseUnary(); const a = left;
            left = () => { const x = a(), y = r(); return op === '*' ? x * y : (y === 0 ? 0 : x / y); };
        }
        return left;
    }
    function parseUnary() {
        if (peek() && peek().v === '!') { next(); const u = parseUnary(); return () => (u() ? 0 : 1); }
        if (peek() && peek().v === '-') { next(); const u = parseUnary(); return () => -u(); }
        if (peek() && peek().v === '+') { next(); return parseUnary(); }
        return parsePrimary();
    }
    function parsePrimary() {
        const tk = peek();
        if (!tk) synErr('表达式意外结束');
        if (tk.t === 'num') { next(); const v = tk.v; return () => v; }
        if (tk.t === 'op' && tk.v === '(') { next(); const e = parseExpr(true); expect(')'); return e; }
        if (tk.t === 'id') {
            const name = next().v;
            if (name === 'v') {
                if (peek() && peek().v === '.') {
                    next();
                    const prop = next();
                    if (!prop || prop.t !== 'id') synErr('v. 后需要变量名');
                    const full = 'v.' + prop.v, line = prop.line;
                    return () => {
                        // FMBE 语义：变量一旦赋值即持久化，后续帧可直接读取上一帧遗留值。
                        // scope.vars 包含本帧已赋值 + 上一帧遗留的变量；校验时 vars 为空，前向引用自然被捕获。
                        const d = scope.vars.get(full);
                        if (d) return d.value;
                        // 变量不存在于作用域中（既未本帧赋值，也无上一帧遗留值）
                        if (scope._tolerant) return undefined;  // 宽容模式（?? 左操作数）返回 undefined
                        const msg = '未定义的变量 ' + full + '（第 ' + line + ' 行）';
                        // 校验模式：收集全部错误（返回 0 让后续语句继续检查），而不是遇到第一个就中断
                        // 区间 = v.<名字> 整段，编辑器据此精确标红该引用（而不是整行）
                        const rng = { start: tk.s, end: prop.e };
                        if (opts && opts.collectErrors) { opts.collectErrors.push({ line, message: msg, ...rng }); return 0; }
                        const err = new Error(msg); err.mlLine = line; err.mlStart = rng.start; err.mlEnd = rng.end; throw err;
                    };
                }
                return () => 0;
            }
            if (name === 'q' || name === 'math' || name === 't') {
                if (peek() && peek().v === '.') {
                    next(); const member = next();
                    if (!member || member.t !== 'id') synErr(name + '. 后需要成员名');
                    if (peek() && peek().v === '(') {
                        next(); const args = [];
                        if (peek() && peek().v !== ')') { args.push(parseExpr(true)); while (peek() && peek().v === ',') { next(); args.push(parseExpr(true)); } }
                        expect(')');
                        return () => { const obj = name === 'q' ? queryNamespace : name === 'math' ? angleMath : env.t; const fn = obj[member.v]; if (typeof fn === 'function') return fn.apply(null, args.map(a => a())); return fn; };
                    }
                    // Molang 约定：q.xxx / math.xxx / t.xxx 不带括号时，若成员是函数则自动调用（如 q.anim_time 等价于 q.anim_time()）
                    return () => { const obj = name === 'q' ? queryNamespace : name === 'math' ? angleMath : env.t; const val = obj[member.v]; return typeof val === 'function' ? val() : val; };
                }
                return () => 0;
            }
            // 裸标识符（未带 v./q./math./t. 前缀）一律视为未定义变量，直接报错（含行号），不再静默当作 0
            if (name === 'true') return () => 1;
            if (name === 'false') return () => 0;
            if (name === 'if' || name === 'else') return () => 0; // 保留字兜底，正常不会走到这里
            // 行号取该标识符自身的行（旧代码用 curLine()=下一个记号的行，多行程序里会指错行）
            const ln = tk.line;
            const err = new Error('未定义的变量 ' + name + (ln ? '（第 ' + ln + ' 行）' : ''));
            err.mlLine = ln || 0; err.mlStart = tk.s; err.mlEnd = tk.e;
            throw err;
        }
        synErr('无法解析的记号: ' + tk.v);
    }

    function parseBlock() {
        const tk = peek();
        if (!tk || (tk.v !== '(' && tk.v !== '{')) synErr('条件分支需要 ( 或 { 包围');
        const close = tk.v === '(' ? ')' : '}';
        next();
        const list = [];
        while (p < tokens.length && peek().v !== close) list.push(parseStatement());
        if (peek() && peek().v === close) next(); else synErr('缺少 ' + close);
        return list;
    }
    function runList(list) {
        for (const s of list) s();
    }
    // loop 的循环体：优先 { 语句块 }；也允许单条语句（v./t. 赋值或普通表达式），分号由 loop 统一消费。
    function parseLoopBody() {
        if (peek() && peek().v === '{') return parseBlock();
        const t2 = peek();
        const isAssign = t2 && t2.t === 'id' && (t2.v === 'v' || t2.v === 't')
            && tokens[p + 1] && tokens[p + 1].v === '.' && tokens[p + 2] && tokens[p + 2].t === 'id'
            && tokens[p + 3] && tokens[p + 3].v === '=';
        if (isAssign) {
            const kind = t2.v; next(); next(); const name = next().v; next();
            const rhsStart = p, rhs = parseExpr(true), rhsEnd = p;
            const rhsText = (rhsStart < rhsEnd) ? text.slice(tokens[rhsStart].s, tokens[rhsEnd - 1].e) : '0';
            if (kind === 'v') return [() => setVar(name, rhs(), rhsText)];
            return [() => {
                const val = rhs(); env.t[name] = val;
                const g = globalVars.get(name);
                if (g) { g.def.value = val; g.def.expr = rhsText; }
                else globalVars.set(name, { def: new VarDef(rhsText, val, -1e9, 1e9, 1), sourceBlockId: scope.blockId || null });
                if (scope._assigned) scope._assigned.add('t.' + name);
            }];
        }
        const e = parseExpr(true);
        return [() => { e(); }];
    }
    function parseStatement() {
        const tk = peek();
        if (!tk) return () => {};
        // 当前语句的源码区间：从本语句第一个记号起，到最后一个已消费记号止。
        // 缺分号报错时用它精确定位「到底是哪一条表达式没闭合」（而非整行/整段标红）。
        const stmtStart = tk.s;
        const stmtRange = () => ({ s: stmtStart, e: tokens[p - 1] ? tokens[p - 1].e : stmtStart + 1 });
        if (tk.t === 'id' && tk.v === ';') { next(); return () => {}; } // 允许连续分号 / 空语句
        // return 表达式; —— 立即结束整段程序（FMBE 指令结尾常见的 `return 0;`，值本身模拟器用不到）
        if (tk.t === 'id' && tk.v === 'return') {
            next();
            if (!(peek() && peek().v === ';') && p < tokens.length) parseExpr(true);
            if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange());
            return () => { throw RETURN_SIGNAL; };
        }
        if (tk.t === 'id' && tk.v === 'if') {
            next(); expect('(');
            const cond = parseExpr(false); expect(')');
            const thenB = parseBlock();
            let elseB = null;
            if (peek() && peek().v === 'else') { next(); elseB = parseBlock(); }
            if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange()); // FMBE：分号硬性要求
            return () => { if (cond()) runList(thenB); else if (elseB) runList(elseB); };
        }
        // loop(<次数>, <循环体>) —— Molang 官方循环语句（loop(3, { v.x = v.x + 1; });）。
        // 官方安全上限 1024 次（含嵌套），这里同口径；循环体可为 { } 语句块或单条语句。
        if (tk.t === 'id' && tk.v === 'loop') {
            next(); expect('(');
            const cnt = parseExpr(false); expect(',');
            const body = parseLoopBody();
            expect(')');
            if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange());
            return () => {
                let n = Math.floor(Number(cnt()) || 0);
                if (!(n >= 0)) n = 0;
                if (n > 1024) n = 1024;
                for (let i = 0; i < n; i++) runList(body);
            };
        }
        if (tk.t === 'id' && tk.v === 'v' && tokens[p + 1] && tokens[p + 1].v === '.' && tokens[p + 2] && tokens[p + 2].t === 'id') {
            if (tokens[p + 3] && tokens[p + 3].v === '=') {
            next(); next(); const name = next().v; next();
            const rhsStart = p, rhs = parseExpr(true), rhsEnd = p;
            if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange()); // FMBE：分号硬性要求
            if (collectDecl) collectDecl.add(name);
            // 截取赋值号右侧的原始源码（保留 q./math. 等查询/函数调用，导出时原样输出，不转换为具体数值）
            const rhsText = (rhsStart < rhsEnd) ? text.slice(tokens[rhsStart].s, tokens[rhsEnd - 1].e) : '0';
            return () => setVar(name, rhs(), rhsText);
            }
        }
        // t.<name> = ... 赋值：用于骨骼中间块向全局发布父级姿态（t.Cube_px / t.Cube_xrot 等）。
        // 运行期写入 env.t 并同步 globalVars，使同一程序后续读取及子骨骼下一帧都能拿到新值。
        if (tk.t === 'id' && tk.v === 't' && tokens[p + 1] && tokens[p + 1].v === '.' && tokens[p + 2] && tokens[p + 2].t === 'id') {
            if (tokens[p + 3] && tokens[p + 3].v === '=') {
                next(); next(); const name = next().v; next();
                const rhsStart = p, rhs = parseExpr(true), rhsEnd = p;
                if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange());
                const rhsText = (rhsStart < rhsEnd) ? text.slice(tokens[rhsStart].s, tokens[rhsEnd - 1].e) : '0';
                return () => {
                    const val = rhs();
                    env.t[name] = val;
                    const g = globalVars.get(name);
                    const prevVal = g ? g.def.value : NaN;
                    if (g) { g.def.value = val; if (rhsText != null) g.def.expr = rhsText; }
                    else { globalVars.set(name, { def: new VarDef(rhsText != null ? rhsText : String(val), val, -1e9, 1e9, 1), sourceBlockId: scope.blockId || null }); }
                    if (scope._assigned) scope._assigned.add('t.' + name);
                    // 只有数值真的变了才登记：读到该全局的关节块随后需要重算（否则它们会停在上一帧的旧值）
                    if (!g || !(Math.abs(val - Number(prevVal)) <= 1e-8)) scope._tWrites.add(name);
                };
            }
        }
        const cond = parseExpr(false);
        if (peek() && peek().v === '?') {
            next();
            const thenB = parseBlock();
            let elseB = null;
            // FMBE 兼容：else 分支可选，允许省略 ':' 与 else 分支（如  v.n>1000?(v.zrot=math.random(0,360);v.n=0);  ）
            if (peek() && peek().v === ':') { next(); elseB = parseBlock(); }
            if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange()); // FMBE：分号硬性要求
            return () => { if (cond()) runList(thenB); else if (elseB) runList(elseB); };
        }
        if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange()); // FMBE：分号硬性要求
        const e = cond;
        return () => { e(); };
    }
    function parseProgram() {
        const stmts = [];
        while (p < tokens.length) {
            if (peek().v === ';') { next(); continue; }
            stmts.push(parseStatement());
        }
        for (const s of stmts) s(); // 完整解析后再执行：语法/未定义变量错误时整段不生效（异常会中断并向上抛出）
    }
    const prevBlockId = _currentEvalBlockId;
    _currentEvalBlockId = scope.blockId || null;
    // RETURN_SIGNAL 只用于 return 语句中断执行，不是错误：吞掉即可，其余异常照常抛出。
    try { parseProgram(); } catch (e) { if (e !== RETURN_SIGNAL) throw e; } finally { _currentEvalBlockId = prevBlockId; }
}

/* ============================================================================
   ★★【2026-11-08 通用性能 · 编译型执行器】
   问题：旧的 runBlockProgram 每次调用都要
     ① 走一遍递归下降、为每个记号分配一个新闭包；
     ② 每条赋值都现场跑 2~3 个正则（关键帧脚手架 / IK 内部量判定）决定是否回写 expr；
     ③ 动画循环里每个块的每一层每帧都要重复以上全部工作。
   蜘蛛腿预设=6 条腿 × 20 轮 DLS（每轮 ~60 条语句）+ 20 轮圆弧二分 ⇒ 单帧上万次闭包调用，
   在高配机上也会掉帧。这是「解释器本身的结构性开销」，与具体预设无关 ——
   用户手搓的任何大程序都会遇到同样的瓶颈，所以修复必须做成通用的。

   方案：同一段程序文本只编译一次（递归下降直接产出 JS 源码，new Function 编译并缓存），
   之后每帧只是「带一个运行期上下文对象调用一次编译产物」。所有语义（?? 宽容模式、
   return 哨兵、t. 惰性读、赋值回写防覆盖、行号/区间报错、collectErrors/collectDecl）逐条保持。
   ============================================================================ */
const _MOLANG_RETURN_SIGNAL = {};
const _molangCodeCache = new Map();          // text\0blockId -> { fn, decls }
const _MOLANG_CODE_CACHE_MAX = 64;

// 赋值是否回写变量的「定义表达式」—— 编译期一次判定，运行期不再跑正则。
// （原逻辑见 _runBlockProgramLegacy 的 setVar：关键帧脚手架行 / IK 机器量都不回写 expr）
function _molangWbExpr(scopeBlockId, name, srcExpr) {
    let isKf = false;
    try {
        const s = String(srcExpr);
        isKf = /_start_[A-Za-z_]/.test(s) || /_T[A-Za-z_]/.test(s)
            || (typeof _kfIsNsInternal === 'function' && scopeBlockId
                && s.indexOf('v.' + scopeBlockId + '_') >= 0);
    } catch (e) { }
    // scope._kfCompiledActive 全工程无写入点（恒 false），不参与运行期判定。
    const isBoneInternal = /^(ik_|ikW$|parent_|pR|p_|own_bone_rot)|basepos_bone$/.test(name);
    return !isKf && !isBoneInternal;
}

function _molangCompile(text, blockId, owner) {
    const srcText = text == null ? '' : String(text);
    const cacheKey = srcText + '\u0001' + (blockId || '');
    /* ★【多骨骼工程保护】每个方块每帧都会用它自己的 2~3 段程序（base + 动画层）。
       如果只依赖全局 LRU（容量有限），当工程里程序数超过容量时会「每帧全部重编译」——
       比旧解释器还慢。所以方块路径把编译产物挂在方块自己的 scope 上（小容量 LRU，8 条），
       与方块同生命周期、永不因全局逐出而重编译。全局 LRU 只服务无归属的临时沙箱调用。 */
    if (owner) {
        const m = owner._molangCompiledMap;
        if (m) {
            const hit = m.get(cacheKey);
            if (hit) { m.delete(cacheKey); m.set(cacheKey, hit); return hit; }
        }
    }
    const cached = _molangCodeCache.get(cacheKey);
    if (cached) {
        // LRU：命中的条目移到队尾
        _molangCodeCache.delete(cacheKey);
        _molangCodeCache.set(cacheKey, cached);
        return cached;
    }
    const tokens = _molangAnalyze(srcText).tokens;
    let p = 0, tmpSeq = 0, loopSeq = 0;
    const temps = ['$d'];
    const newTemp = () => { const n = '$t' + (++tmpSeq); temps.push(n); return n; };
    const declaredSet = new Set();
    const peek = () => tokens[p];
    const next = () => tokens[p++];

    function curLine() { const tk = tokens[p]; return tk ? tk.line : null; }
    function synErr(m, range) {
        if (range && range.e > range.s) {
            let ln = 1;
            const stop = Math.min(range.s, srcText.length);
            for (let k = 0; k < stop; k++) if (srcText[k] === '\n') ln++;
            const err = new Error('语法错误：' + m + '（第 ' + ln + ' 行）');
            err.mlLine = ln; err.mlStart = range.s; err.mlEnd = range.e;
            throw err;
        }
        const ln = curLine();
        const err = new Error('语法错误：' + m + (ln ? '（第 ' + ln + ' 行）' : '（末尾）'));
        err.mlLine = ln || 0;
        throw err;
    }
    function expect(v) { const tk = peek(); if (!tk || tk.v !== v) synErr('期望 ' + v); p++; }

    function parseExpr(allowTernary) {
        const left = parseNullCoalescing();
        if (allowTernary && peek() && peek().v === '?') {
            next();
            const t = (peek() && (peek().v === '(' || peek().v === '{')) ? inlineBlock() : parseExpr(true);
            let f = '0';
            if (peek() && peek().v === ':') {
                next();
                f = (peek() && (peek().v === '(' || peek().v === '{')) ? inlineBlock() : parseExpr(true);
            }
            return '(' + left + '?' + t + ':' + f + ')';
        }
        return left;
    }
    // 表达式位置的「语句块分支」：用 IIFE 包一层，语义 = 执行语句后返回 0（与旧闭包版一致）
    function inlineBlock() {
        const body = parseBlock();
        return '(function(){' + body + 'return 0;})()';
    }
    // ?? 空值合并：左操作数在宽容模式下求值（允许读未定义变量 → undefined）
    function parseNullCoalescing() {
        let left = parseLogicOr();
        while (peek() && peek().v === '??') {
            next();
            const r = parseNullCoalescing();
            const tv = newTemp();
            // 求值异常时整段程序本来就会中断并被上层丢弃，故无需 try/finally 还原 _tolerant
            left = '(' + tv + '=(rt.scope._tolerant=true,' + left + '),rt.scope._tolerant=false,'
                + '(' + tv + '===undefined||' + tv + '===null||(typeof ' + tv + "==='number'&&Number.isNaN(" + tv + '))?'
                + r + ':' + tv + '))';
        }
        return left;
    }
    function parseLogicOr() {
        let left = parseLogicAnd();
        while (peek() && peek().v === '||') { next(); const r = parseLogicAnd(); left = '(' + left + '||' + r + ')'; }
        return left;
    }
    function parseLogicAnd() {
        let left = parseEquality();
        while (peek() && peek().v === '&&') { next(); const r = parseEquality(); left = '(' + left + '&&' + r + ')'; }
        return left;
    }
    function parseEquality() {
        let left = parseComparison();
        while (peek() && (peek().v === '==' || peek().v === '!=')) {
            const op = next().v; const r = parseComparison();
            left = '(' + left + (op === '==' ? '===' : '!==') + r + '?1:0)';
        }
        return left;
    }
    function parseComparison() {
        let left = parseAdditive();
        while (peek() && (peek().v === '<' || peek().v === '<=' || peek().v === '>' || peek().v === '>=')) {
            const op = next().v; const r = parseAdditive();
            left = '(' + left + op + r + '?1:0)';
        }
        return left;
    }
    function parseAdditive() {
        let left = parseMultiplicative();
        while (peek() && (peek().v === '+' || peek().v === '-')) {
            const op = next().v; const r = parseMultiplicative();
            left = '(' + left + op + r + ')';
        }
        return left;
    }
    function parseMultiplicative() {
        let left = parseUnary();
        while (peek() && (peek().v === '*' || peek().v === '/')) {
            const op = next().v; const r = parseUnary();
            left = op === '*' ? '(' + left + '*' + r + ')' : 'rt.div(' + left + ',' + r + ')';
        }
        return left;
    }
    function parseUnary() {
        if (peek() && peek().v === '!') { next(); const u = parseUnary(); return '(' + u + '?0:1)'; }
        if (peek() && peek().v === '-') { next(); const u = parseUnary(); return '(-' + u + ')'; }
        if (peek() && peek().v === '+') { next(); return parseUnary(); }
        return parsePrimary();
    }
    function parsePrimary() {
        const tk = peek();
        if (!tk) synErr('表达式意外结束');
        if (tk.t === 'num') { next(); return String(tk.v); }
        if (tk.t === 'op' && tk.v === '(') { next(); const e = parseExpr(true); expect(')'); return e; }
        if (tk.t === 'id') {
            const name = next().v;
            if (name === 'v') {
                if (peek() && peek().v === '.') {
                    next();
                    const prop = next();
                    if (!prop || prop.t !== 'id') synErr('v. 后需要变量名');
                    const lit = JSON.stringify('v.' + prop.v);
                    // 命中路径零函数调用：($d = Map.get) 成功就直接取 .value
                    return '(($d=rt.vars.get(' + lit + '))!==undefined?$d.value:rt.missV('
                        + lit + ',' + prop.line + ',' + tk.s + ',' + prop.e + '))';
                }
                return '0';
            }
            if (name === 'q' || name === 'math' || name === 't') {
                if (peek() && peek().v === '.') {
                    next(); const member = next();
                    if (!member || member.t !== 'id') synErr(name + '. 后需要成员名');
                    const mname = member.v;
                    if (name === 't') {
                        // t.* 是数值：即使写了括号，旧实现也只在「成员是函数」时才调用；实际恒为数值 ⇒ 忽略参数。
                        // 但仍解析参数以保持语法校验口径。
                        if (peek() && peek().v === '(') {
                            next();
                            if (peek() && peek().v !== ')') { parseExpr(true); while (peek() && peek().v === ',') { next(); parseExpr(true); } }
                            expect(')');
                        }
                        return 'rt.tGet(' + JSON.stringify(mname) + ')';
                    }
                    const isQ = name === 'q';
                    const nsObj = isQ ? queryNamespace : angleMath;
                    const isFn = typeof nsObj[mname] === 'function';
                    const acc = 'rt.' + (isQ ? 'q' : 'math') + '[' + JSON.stringify(mname) + ']';
                    if (peek() && peek().v === '(') {
                        next(); const args = [];
                        if (peek() && peek().v !== ')') { args.push(parseExpr(true)); while (peek() && peek().v === ',') { next(); args.push(parseExpr(true)); } }
                        expect(')');
                        if (isFn) return acc + '(' + args.join(',') + ')';
                        // 非函数成员却写了括号 ⇒ 旧实现直接返回该值（不执行参数）
                        return 'rt.cf(' + acc + (args.length ? ',' + args.join(',') : '') + ')';
                    }
                    return isFn ? (acc + '()') : acc;
                }
                return '0';
            }
            if (name === 'true') return '1';
            if (name === 'false') return '0';
            if (name === 'if' || name === 'else') return '0';
            // 裸标识符：旧实现在「解析阶段」就抛错（整段不执行）——这里同样在编译期抛出
            const ln = tk.line;
            const err = new Error('未定义的变量 ' + name + (ln ? '（第 ' + ln + ' 行）' : ''));
            err.mlLine = ln || 0; err.mlStart = tk.s; err.mlEnd = tk.e;
            throw err;
        }
        synErr('无法解析的记号: ' + tk.v);
    }

    function parseBlock() {
        const tk = peek();
        if (!tk || (tk.v !== '(' && tk.v !== '{')) synErr('条件分支需要 ( 或 { 包围');
        const close = tk.v === '(' ? ')' : '}';
        next();
        const parts = [];
        while (p < tokens.length && peek().v !== close) parts.push(parseStatement());
        if (peek() && peek().v === close) next(); else synErr('缺少 ' + close);
        return parts.join('\n');
    }
    function parseLoopBody() {
        if (peek() && peek().v === '{') return parseBlock();
        const t2 = peek();
        const isAssign = t2 && t2.t === 'id' && (t2.v === 'v' || t2.v === 't')
            && tokens[p + 1] && tokens[p + 1].v === '.' && tokens[p + 2] && tokens[p + 2].t === 'id'
            && tokens[p + 3] && tokens[p + 3].v === '=';
        if (isAssign) {
            const kind = t2.v; next(); next(); const name = next().v; next();
            const rhsStart = p, rhs = parseExpr(true), rhsEnd = p;
            const rhsText = (rhsStart < rhsEnd) ? srcText.slice(tokens[rhsStart].s, tokens[rhsEnd - 1].e) : '0';
            if (kind === 'v') {
                const lit = JSON.stringify('v.' + name);
                return 'rt.setV(' + JSON.stringify(name) + ',' + lit + ',(' + rhs + '),'
                    + (_molangWbExpr(blockId, name, rhsText) ? 1 : 0) + ',' + JSON.stringify(rhsText) + ');';
            }
            return 'rt.setT(' + JSON.stringify(name) + ',(' + rhs + '),' + JSON.stringify(rhsText) + ');';
        }
        return parseExpr(true) + ';';
    }
    function parseStatement() {
        const tk = peek();
        if (!tk) return '';
        const stmtStart = tk.s;
        const stmtRange = () => ({ s: stmtStart, e: tokens[p - 1] ? tokens[p - 1].e : stmtStart + 1 });
        if (tk.v === ';') { next(); return ''; }
        if (tk.t === 'id' && tk.v === 'return') {
            next();
            if (!(peek() && peek().v === ';') && p < tokens.length) parseExpr(true);
            if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange());
            return 'throw rt.RET;';
        }
        if (tk.t === 'id' && tk.v === 'if') {
            next(); expect('(');
            const cond = parseExpr(false); expect(')');
            const thenB = parseBlock();
            let elseB = null;
            if (peek() && peek().v === 'else') { next(); elseB = parseBlock(); }
            if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange());
            return 'if(' + cond + '){' + thenB + '}' + (elseB ? 'else{' + elseB + '}' : '');
        }
        if (tk.t === 'id' && tk.v === 'loop') {
            next(); expect('(');
            const cnt = parseExpr(false); expect(',');
            const body = parseLoopBody();
            expect(')');
            if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange());
            const id = ++loopSeq;
            const n = '$n' + id, i = '$i' + id;
            return '{var ' + n + '=Math.floor(Number(' + cnt + ')||0);if(!(' + n + '>=0))' + n + '=0;'
                + 'if(' + n + '>1024)' + n + '=1024;for(var ' + i + '=0;' + i + '<' + n + ';' + i + '++){' + body + '}}';
        }
        if (tk.t === 'id' && tk.v === 'v' && tokens[p + 1] && tokens[p + 1].v === '.' && tokens[p + 2] && tokens[p + 2].t === 'id') {
            if (tokens[p + 3] && tokens[p + 3].v === '=') {
                next(); next(); const name = next().v; next();
                const rhsStart = p, rhs = parseExpr(true), rhsEnd = p;
                if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange());
                declaredSet.add(name);
                const rhsText = (rhsStart < rhsEnd) ? srcText.slice(tokens[rhsStart].s, tokens[rhsEnd - 1].e) : '0';
                const lit = JSON.stringify('v.' + name);
                return 'rt.setV(' + JSON.stringify(name) + ',' + lit + ',(' + rhs + '),'
                    + (_molangWbExpr(blockId, name, rhsText) ? 1 : 0) + ',' + JSON.stringify(rhsText) + ');';
            }
        }
        if (tk.t === 'id' && tk.v === 't' && tokens[p + 1] && tokens[p + 1].v === '.' && tokens[p + 2] && tokens[p + 2].t === 'id') {
            if (tokens[p + 3] && tokens[p + 3].v === '=') {
                next(); next(); const name = next().v; next();
                const rhsStart = p, rhs = parseExpr(true), rhsEnd = p;
                if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange());
                const rhsText = (rhsStart < rhsEnd) ? srcText.slice(tokens[rhsStart].s, tokens[rhsEnd - 1].e) : '0';
                return 'rt.setT(' + JSON.stringify(name) + ',(' + rhs + '),' + JSON.stringify(rhsText) + ');';
            }
        }
        const cond = parseExpr(false);
        if (peek() && peek().v === '?') {
            next();
            const thenB = parseBlock();
            let elseB = null;
            if (peek() && peek().v === ':') { next(); elseB = parseBlock(); }
            if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange());
            return 'if(' + cond + '){' + thenB + '}' + (elseB ? 'else{' + elseB + '}' : '');
        }
        if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange());
        return cond + ';';
    }
    function parseProgram() {
        const parts = [];
        while (p < tokens.length) {
            if (peek().v === ';') { next(); continue; }
            parts.push(parseStatement());
        }
        return parts.join('\n');
    }

    const code = parseProgram();   // 语法/未定义裸标识符错误在此抛出（与旧实现时机一致）
    const fn = new Function('rt', 'var ' + temps.join(',') + ';\n' + code);
    const compiled = { fn, decls: Array.from(declaredSet) };
    if (owner) {
        if (!owner._molangCompiledMap) owner._molangCompiledMap = new Map();
        owner._molangCompiledMap.set(cacheKey, compiled);
        if (owner._molangCompiledMap.size > 8) {
            owner._molangCompiledMap.delete(owner._molangCompiledMap.keys().next().value);
        }
        return compiled;
    }
    _molangCodeCache.set(cacheKey, compiled);
    if (_molangCodeCache.size > _MOLANG_CODE_CACHE_MAX) {
        _molangCodeCache.delete(_molangCodeCache.keys().next().value);
    }
    return compiled;
}

// 编译产物的运行期上下文：把 scope / 全局变量 / 查询命名空间等接进生成的代码
function _MolangRT(scope, opts) {
    this.vars = scope.vars;
    this.assigned = scope._assigned;
    this.tWrites = scope._tWrites;
    this.scope = scope;
    this.opts = opts || null;
    this.to = Object.create(null);      // 本帧 t. 写入 overlay（同一程序内可读回）
    this.q = queryNamespace;
    this.math = angleMath;
    this.RET = _MOLANG_RETURN_SIGNAL;
}
_MolangRT.prototype.missV = function (key, line, s, e) {
    if (this.scope._tolerant) return undefined;   // ?? 左操作数：允许未定义
    const msg = '未定义的变量 ' + key + '（第 ' + line + ' 行）';
    const ce = this.opts && this.opts.collectErrors;
    if (ce) { ce.push({ line, message: msg, start: s, end: e }); return 0; }
    const err = new Error(msg);
    err.mlLine = line; err.mlStart = s; err.mlEnd = e;
    throw err;
};
_MolangRT.prototype.tGet = function (n) {
    const o = this.to;
    if (n in o) return o[n];
    const g = globalVars.get(n);
    return g ? resolveGlobalValue(n, g, 0) : 0;
};
_MolangRT.prototype.setV = function (name, key, val, wb, srcExpr) {
    const d = this.vars.get(key);
    if (d === undefined) {
        this.vars.set(key, new VarDef(srcExpr, val, -1e9, 1e9, 1));
    } else {
        d.value = val;
        if (wb) d.expr = srcExpr;   // 脚手架 / IK 机器量不回写（编译期已判定）
    }
    this.assigned.add(key);
};
_MolangRT.prototype.setT = function (name, val, srcText) {
    this.to[name] = val;
    const g = globalVars.get(name);
    const prevVal = g ? g.def.value : NaN;
    if (g) { g.def.value = val; g.def.expr = srcText; }
    else {
        globalVars.set(name, {
            def: new VarDef(srcText != null ? srcText : String(val), val, -1e9, 1e9, 1),
            sourceBlockId: this.scope.blockId || null
        });
    }
    this.assigned.add('t.' + name);
    if (!g || !(Math.abs(val - Number(prevVal)) <= 1e-8)) this.tWrites.add(name);
};
_MolangRT.prototype.div = function (x, y) { return y === 0 ? 0 : x / y; };
// 非函数成员却带括号调用（罕见）：与旧实现一致，直接返回该值
_MolangRT.prototype.cf = function (fn) {
    if (typeof fn !== 'function') return fn;
    return fn.apply(null, Array.prototype.slice.call(arguments, 1));
};

function runBlockProgram(text, scope, opts) {
    let compiled;
    try {
        compiled = _molangCompile(text, scope.blockId, opts && opts.ownerScope);
    } catch (e) {
        // 只对「生成源码被 JS 引擎判为语法错误」这种情况回退到旧解释器（两者行为一致，
        // 但可避免代码生成器覆盖不到的极端写法导致整段程序完全失效）。
        // 语义错误（未定义变量、我们自己的「语法错误：…」）照常抛给上层。
        if (e instanceof SyntaxError) return _runBlockProgramLegacy(text, scope, opts);
        throw e;
    }
    const collectDecl = opts && opts.collectDecl;
    if (collectDecl && compiled.decls.length) for (const n of compiled.decls) collectDecl.add(n);
    scope._assigned = new Set();
    scope._tWrites = new Set();
    scope._tolerant = false;
    const rt = new _MolangRT(scope, opts);
    const prevBlockId = _currentEvalBlockId;
    _currentEvalBlockId = scope.blockId || null;
    try { compiled.fn(rt); }
    catch (e) { if (e !== _MOLANG_RETURN_SIGNAL) throw e; }
    finally { _currentEvalBlockId = prevBlockId; }
}

//修改了预设的min max

class VarDef {
    constructor(expr, val, min = -10, max = 10, step = 0.01) {
        this.expr = expr; this.value = val; this.rangeMin = min; this.rangeMax = max; this.step = step;
    }
}

/* ===== 全局动画（动画控制器）注册表（2026-11-07）=====
   一条动画 = 一个动画控制器：名字全局唯一（用户可改），程序文本全局共享，
   可被若干方块同时引用；每个方块在自己的 scope 里用自己的一份变量执行它。
   block.scope.channels = Map<animId, {enabled}> 只记录「本块是否启用这条动画」，
   程序正文不存进方块（否则改一次动画得逐块改）。
   base 不是全局动画：它是每块自己的 scope.program，显示名固定为 BASE_ANIM_NAME。 */
const BASE_ANIM_NAME = 'FMBE_variables';
let projectAnimations = [];            // [{ id, name, program, enabled }]
let _animIdSeq = 0;
function nextAnimationId() {
    let n = 1;
    while (projectAnimations.some(a => a.id === 'anim' + n)) n++;
    _animIdSeq = n;
    return 'anim' + n;
}
function createProjectAnimation(name) {
    let nm = String(name == null ? '' : name).trim();
    if (!nm) { let i = 1; while (projectAnimations.some(a => a.name === '动画' + i)) i++; nm = '动画' + i; }
    // 同名追加后缀，保证「动画名称 = 控制器名称」可唯一寻址
    if (projectAnimations.some(a => a.name === nm)) {
        let i = 2; const base = nm; while (projectAnimations.some(a => a.name === base + ' (' + i + ')')) i++;
        nm = base + ' (' + i + ')';
    }
    const anim = { id: nextAnimationId(), name: nm, program: '', enabled: true };
    projectAnimations.push(anim);
    return anim;
}
function getProjectAnimation(id) { return projectAnimations.find(a => a.id === id) || null; }
function animationDisplayName(id) {
    if (id === '__base__') return BASE_ANIM_NAME;
    const a = getProjectAnimation(id);
    return a ? a.name : String(id);
}
function getAnimationProgram(id) {
    if (id === '__base__') return '';
    const a = getProjectAnimation(id);
    return a ? String(a.program || '') : '';
}
function setAnimationProgram(id, text) {
    let a = getProjectAnimation(id);
    if (!a) return null;
    a.program = String(text == null ? '' : text);
    return a;
}
function renameProjectAnimation(id, name) {
    const a = getProjectAnimation(id);
    if (!a) return false;
    const nm = String(name == null ? '' : name).trim();
    if (!nm || nm === a.name) return false;
    if (projectAnimations.some(x => x.id !== id && x.name === nm)) return false;
    a.name = nm;
    return true;
}
// 把全局动画应用到某个方块（可在多选时批量调用）
function applyAnimationToBlock(block, animId) {
    if (!block || !block.scope || !getProjectAnimation(animId)) return false;
    const sc = block.scope;
    if (typeof sc.ensureLayerModel !== 'function') return false;
    sc.ensureLayerModel();
    if (!sc.channels.has(animId)) sc.channels.set(animId, { enabled: true });
    if (!sc.stack.includes(animId)) sc.stack.push(animId);
    return true;
}
function removeAnimationFromBlock(block, animId) {
    if (!block || !block.scope || animId === '__base__') return false;
    const sc = block.scope;
    if (!sc.channels || !sc.channels.has(animId)) return false;
    sc.channels.delete(animId);
    sc.stack = (Array.isArray(sc.stack) ? sc.stack : ['__base__']).filter(k => k !== animId);
    if (sc.activeLayer === animId) sc.activeLayer = '__base__';
    return true;
}
// 这条动画当前被多少个方块引用（管理面板显示 / 删除前提示用）
function animationUsageCount(animId) {
    let n = 0;
    try {
        blocks.forEach(b => { if (b.scope && b.scope.channels && b.scope.channels.has(animId)) n++; });
    } catch (e) {}
    return n;
}
// 彻底删除一个动画控制器（从所有方块解除引用；不可撤销的操作，调用方需二次确认）
function deleteProjectAnimation(animId) {
    const idx = projectAnimations.findIndex(a => a.id === animId);
    if (idx < 0) return false;
    try {
        blocks.forEach(b => {
            const sc = b.scope;
            if (sc && sc.channels && sc.channels.has(animId)) {
                sc.channels.delete(animId);
                sc.stack = (Array.isArray(sc.stack) ? sc.stack : ['__base__']).filter(k => k !== animId);
                if (sc.activeLayer === animId) sc.activeLayer = '__base__';
                b.refresh();
            }
        });
    } catch (e) {}
    projectAnimations.splice(idx, 1);
    return true;
}

class VariableScope {
    constructor(bid) {
        this.blockId = bid; this.vars = new Map(); this.program = ''; this.molangMode = false; this._spontCache = null;
    /* ===== 动画层（2026-11-07 定稿）=====
       基础动画 = this.program（必需，拥有 13 个核心变换变量；可清空但不可删），显示名 FMBE变量。
       附加动画 = this.channels[animId] = { enabled }（**程序正文在 projectAnimations 里全局共享**），
       顺序由 this.stack 决定（本块局部），base 可以不在第一位。
       一帧内按 stack 顺序全部执行，同 scope 共享 v.（跨帧持久）与 t.（每帧重置）。 */
        this.channels = null;      // null / Map<animId, {enabled}>
        this.stack = ['__base__'];
        this.activeLayer = '__base__';   // 编辑器正在查看/编辑的层（不参与求值，仅 UI 状态）
    }
    // 当前活动层归一化：指向不存在的通道时回退到 base
    activeLayerKey() {
        const k = this.activeLayer || '__base__';
        if (k === '__base__') return '__base__';
        return (this.channels && this.channels.has(k)) ? k : '__base__';
    }
    layerProgram(key) {
        if (key === '__base__') return this.program || '';
        // 全局动画正文；旧会话里残留的 channel.program 作为兜底（不覆盖全局定义）
        const ch = this.channels && this.channels.get(key);
        const gp = getAnimationProgram(key);
        return gp || (ch ? String(ch.program || '') : '');
    }
    setLayerProgram(key, text) {
        if (key === '__base__') { this.program = text; this.molangMode = true; return; }
        if (!this.channels) this.channels = new Map();
        // 全局共享：写一次，所有引用这条动画的方块都会跟着变
        if (!setAnimationProgram(key, text)) {
            const ch = this.channels.get(key) || { enabled: true };
            ch.program = text; this.channels.set(key, ch);
        }
        if (!this.channels.has(key)) this.channels.set(key, { enabled: true });
        this.ensureLayerModel();
    }
    // 惰性建层模型：把 stack 归一化成「含 base + 只含真实存在的通道 + 不漏通道」
    ensureLayerModel() {
        if (!this.channels) this.channels = new Map();
        const st = Array.isArray(this.stack) ? this.stack.filter(k => k === '__base__' || this.channels.has(k)) : [];
        if (!st.includes('__base__')) st.unshift('__base__');
        // 通道存在但没进栈 ⇒ 按插入顺序补到末尾，避免静默丢动画
        for (const k of this.channels.keys()) if (!st.includes(k)) st.push(k);
        this.stack = st;
        return this;
    }
    // 按本块栈序返回要执行的层；没有附加通道时返回 null（调用方据此走旧的单层路径）
    // base 永远出现在结果里（即使 program 为空 —— 空 program 的 base 走变量卡片求值）
    layersOrdered() {
        if (!this.channels || this.channels.size === 0) return null;
        this.ensureLayerModel();
        const out = [];
        for (const key of this.stack) {
            if (key === '__base__') {
                out.push({ key: '__base__', program: String(this.program || ''), molangMode: !!this.molangMode });
                continue;
            }
            const ch = this.channels.get(key);
            if (!ch || ch.enabled === false) continue;
            const ga = (typeof getProjectAnimation === 'function') ? getProjectAnimation(key) : null;
            if (ga && ga.enabled === false) continue;   // 控制器全局停用 ⇒ 本块这一层也不执行
            const p = String(this.layerProgram(key) || '').trim();
            if (p) out.push({ key, program: p });
        }
        return out;
    }
    initFromM(M) {
        const names = ['xpos','ypos','zpos','xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos'];
        for (let i = 0; i < names.length; i++) {
            const name = `v.${names[i]}`;
            // ★ 存量强检：命令导入 / 项目装载 / 预设生成的 extend_scale=0 在此就地改为 1e-4
            const val = esGuardVarValue(name, M[i]); const rg = getDefaultRange(name);
            if (!this.vars.has(name)) 
    this.vars.set(name, new VarDef(val.toString(), val, rg.min, rg.max, rg.step));
else { 
    const d = this.vars.get(name); 
    d.expr = val.toString(); 
    d.value = val; 
    d.rangeMin = rg.min; 
    d.rangeMax = rg.max;
    d.step = rg.step;   // 同时更新步长
}
        }
    }
    toM() {
        return [ this.vars.get('v.xpos')?.value ?? 0, this.vars.get('v.ypos')?.value ?? 0, this.vars.get('v.zpos')?.value ?? 0,
                 this.vars.get('v.xrot')?.value ?? 0, this.vars.get('v.yrot')?.value ?? 0, this.vars.get('v.zrot')?.value ?? 0,
                 this.vars.get('v.scale')?.value ?? 1, this.vars.get('v.extend_scale')?.value ?? 1,
                 this.vars.get('v.extend_xrot')?.value ?? 0, this.vars.get('v.extend_yrot')?.value ?? 0,
                 this.vars.get('v.xbasepos')?.value ?? 0, this.vars.get('v.ybasepos')?.value ?? 0, this.vars.get('v.zbasepos')?.value ?? 0 ];
    }
    recompute() {
        this._spontCache = null;   // 变量/程序即将变化 ⇒ 自发随机判定缓存失效
        // ★动画层：只有存在附加通道时才走多层路径；channels 为空 ⇒ 旧路径逐字节不变（单层零回归）
        const _layers = this.layersOrdered();
        if (_layers) { this.recomputeLayers(_layers); return; }
        if (this.molangMode || (this.program && this.program.trim())) {
            if (this.molangMode) {
                // FMBE 语义：以「上一帧已提交的数值」为起点建立本帧语境（复制上一帧的 vars）。
                // 这样 v.t = v.t ?? 0 能读到上一帧的 v.t 并逐帧累加；
                // v.xpos = v.rot 在 v.rot 本帧尚未赋值时，读到的是上一帧的 v.rot（首帧无数据→按 molang 约定回退 0）。
                // 先在临时作用域执行，成功后才提交，避免“出错帧”污染方块状态。
                const tmp = { vars: new Map(this.vars), _assigned: new Set(), blockId: this.blockId, molangMode: true, program: this.program };
                let ok = true;
                let errMsg = null;
                try { runBlockProgram(this.program || '', tmp, { ownerScope: this }); }
                catch (e) { ok = false; errMsg = e.message; }
                // 关键帧 molang 程序在非零时间首次执行时，初始化块（time==0）被条件跳过，
                // 辅助变量（start_/T/seg_time/dur/t）未定义导致 math.lerp 引用报错。
                // 修复：检测到此类失败后，先在 time=0 下执行初始化块设置辅助变量，
                // 再以初始化后的 vars 为起点按当前时间重新执行。
                if (!ok && typeof keyframeCurrentTime !== 'undefined' && keyframeCurrentTime !== 0
                    && this.program && this.program.includes('q.anim_time')) {
                    const _savedTime = keyframeCurrentTime;
                    // 1. time=0 下执行初始化块（首段条件设置所有 start_/T/seg_time/dur）
                    keyframeCurrentTime = 0;
                    const initTmp = { vars: new Map(this.vars), _assigned: new Set(), blockId: this.blockId, molangMode: true, program: this.program };
                    try { runBlockProgram(this.program || '', initTmp, { ownerScope: this }); } catch (e) { /* 初始化错误忽略，尽力而为 */ }
                    // 2. 以初始化后的 vars 为起点，按当前时间重新执行
                    keyframeCurrentTime = _savedTime;
                    const retryTmp = { vars: new Map(initTmp.vars), _assigned: new Set(), blockId: this.blockId, molangMode: true, program: this.program };
                    try { runBlockProgram(this.program || '', retryTmp, { ownerScope: this }); ok = true; tmp.vars = retryTmp.vars; tmp._tWrites = retryTmp._tWrites; }
                    catch (e) { ok = false; errMsg = e.message; }
                }
                if (!ok) console.warn('高级脚本执行错误:', errMsg);
                if (ok) {
                    this.vars.clear();
                    for (const [k, v] of tmp.vars) this.vars.set(k, v);
                    ensureCoreVars(this); // 未赋值的「核心变换变量」补中性默认值，保证方块不消失
                }
                // ★本帧真正变化过的 t.* 全局（数值未变的不算）→ 供 Block.refresh 通知依赖块重算
                this._tWrites = ok ? (tmp._tWrites || new Set()) : new Set();
                // 出错则不提交，保留上一帧正确状态
                return;
            }
            // 非接管模式下携带 program 的罕见情况：维持原行为，直接在本作用域执行
            let ok = true;
            try { runBlockProgram(this.program || '', this, { ownerScope: this }); } catch (e) { ok = false; console.warn('高级脚本执行错误:', e.message); }
            if (ok) ensureCoreVars(this);
            return;
        }
        let changed = true, iter = 0;
        while (changed && iter++ < 20) {
            changed = false;
            for (let [n, d] of this.vars) {
                let old = d.value;
                let nv = isConstantExpr(d.expr) ? parseFloat(d.expr) : evaluateExpression(d.expr, this.vars, globalVars, this.blockId);
                if (d.rangeMin !== undefined) {
                    if (nv > d.rangeMax) d.rangeMax = nv;
                    if (nv < d.rangeMin) d.rangeMin = nv;
                    nv = Math.min(d.rangeMax, Math.max(d.rangeMin, nv));
                }
                if (Math.abs(old - nv) > 1e-8) { d.value = nv; changed = true; }
            }
        }
    }
    /* ===== 多层求值（动画层 P1）=====
       一次更新帧内按 layersOrdered() 的顺序把各层全部执行完，共用同一份 vars：
         · base 空程序 = 变量卡片模式 → 在 tmp 上做不动点求值（与单层同口径）；
         · base 有程序 / 附加通道 → runBlockProgram 依次在同一个 tmp 上执行。
       前一层写的 v. 后一层能直接读到（同帧）；t. 写进 globalVars，跨层同样可见。
       任一层抛错 ⇒ 整帧不提交，保留上一帧状态（与单层 molang 路径一致）。
       注：单层路径里的「关键帧 time=0 初始化重试」暂未复制到这里（P2 关键帧层化时再补）。 */
    recomputeLayers(layers) {
        /* ★ 必须深拷贝 VarDef：runBlockProgram 写 v. 时是原地改 d.expr / d.value，
           若直接 new Map(this.vars) 共享 VarDef，前一层（如附加动画）的赋值会永久写进方块的
           变量表达式本身 —— 后面 base 的变量卡片求值会读回被改写的 expr（实测：导入后
           v.xrot 的 expr 被动画层的 v.xrot=45 覆盖），且中途出错也无法整帧回滚。 */
        const tmpVars = new Map();
        const _origExprs = new Map();   // 各变量的「定义表达式」原文（本帧内不被层赋值改写）
        for (const [n, d] of this.vars) {
            /* ★自愈（2026-11-08）：旧版会把 IK 求解程序的赋值语句回写成 expr，
               如 `v.ik_lxy=v.ik_lxy+math.sqrt(...)` ⇒ base 不动点每帧自己叠自己、永不收敛。
               已按 setVar 修复不再产生；这里把【存量被污染】的自引用 ik_ 变量重置成常量 0，
               IK 求解层首句会重新算正确值。 */
            if (/^v\.(ik_|ikW)/.test(n)) {
                try {
                    const self = new RegExp('(^|[^A-Za-z0-9_.])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9_]|$)');
                    if (self.test(String(d.expr || ''))) { d.expr = '0'; d.value = 0; }
                } catch (_) { }
            }
            _origExprs.set(n, d.expr);
            tmpVars.set(n, new VarDef(d.expr, d.value, d.rangeMin, d.rangeMax, d.step));
        }
        const tmp = { vars: tmpVars, _assigned: new Set(), blockId: this.blockId, molangMode: true, program: '' };
        const tWrites = new Set();
        let ok = true, errMsg = null;
        for (const layer of layers) {
            const text = String(layer.program || '');
            if (!text.trim()) {
                // base 无程序 = 变量卡片求值：对 tmp.vars 做不动点迭代
                if (layer.key === '__base__') {
                    let changed = true, iter = 0;
                    while (changed && iter++ < 20) {
                        changed = false;
                        for (let [n, d] of tmp.vars) {
                            let old = d.value;
                            // 变量卡片的定义表达式取本帧开头快照（不能被前面动画层的赋值改写）
                            const _e = _origExprs.has(n) ? _origExprs.get(n) : d.expr;
                            let nv = isConstantExpr(_e) ? parseFloat(_e) : evaluateExpression(_e, tmp.vars, globalVars, this.blockId);
                            if (d.rangeMin !== undefined) {
                                if (nv > d.rangeMax) d.rangeMax = nv;
                                if (nv < d.rangeMin) d.rangeMin = nv;
                                nv = Math.min(d.rangeMax, Math.max(d.rangeMin, nv));
                            }
                            if (Math.abs(old - nv) > 1e-8) { d.value = nv; changed = true; }
                        }
                    }
                }
                continue;
            }
            try {
                runBlockProgram(text, tmp, { ownerScope: this });
                if (tmp._tWrites) for (const k of tmp._tWrites) tWrites.add(k);
            } catch (e) { ok = false; errMsg = e.message; break; }
        }
        if (ok) {
            this.vars.clear();
            for (const [k, v] of tmp.vars) {
                // 变量「定义表达式」保持用户所写，不被本帧的层赋值污染
                if (_origExprs.has(k)) v.expr = _origExprs.get(k);
                this.vars.set(k, v);
            }
            ensureCoreVars(this);
        } else {
            console.warn('动画层执行错误:', errMsg);
        }
        this._tWrites = ok ? tWrites : new Set();
    }
    // ★ extend_scale 强检：纯数值 0 → ES_MIN（含 NaN/Inf）；含变量的 molang 表达式原样保留
    setVarExpr(n, expr) { const d = this.vars.get(n); if (d) { d.expr = esGuardVarExpr(n, expr); this.recompute(); } }
    addVar(n, expr, min = -100, max = 100, step = 1) { if (!this.vars.has(n)) { this.vars.set(n, new VarDef(esGuardVarExpr(n, expr), 0, min, max, step)); this.recompute(); } }
    deleteVar(n) { this.vars.delete(n); }
}

// 核心变换变量的中性默认值：位置/旋转为 0，scale 系列为 1
const CORE_VAR_DEFAULTS = { xpos:0, ypos:0, zpos:0, xrot:0, yrot:0, zrot:0, scale:1, extend_scale:1, extend_xrot:0, extend_yrot:0, xbasepos:0, ybasepos:0, zbasepos:0 };
// molang 接管后确保核心变量存在且有限：未赋值（被用户删除该行）或非有限值 → 还原为默认值，避免方块消失/NaN
function ensureCoreVars(scope) {
    // 仅保证「核心变换变量」存在且为有限值（供 3D 变换使用），不做“未赋值即回退默认”的语义覆盖；
    // 表达式层面的未定义引用已在运行器里按 FMBE 严格报错，这里不会把程序已赋的值重置掉。
    for (const name in CORE_VAR_DEFAULTS) {
        const full = 'v.' + name, def = CORE_VAR_DEFAULTS[name];
        let d = scope.vars.get(full);
        if (!d) {
            const rg = getDefaultRange(full);
            d = new VarDef(String(def), def, rg.min, rg.max, rg.step);
            scope.vars.set(full, d);
        } else if (!Number.isFinite(d.value)) {
            d.value = def; d.expr = String(def);
        }
    }
    // 全局兜底：任何非有限值归零，防止渲染出现 NaN
    for (const [, d] of scope.vars) { if (!Number.isFinite(d.value)) d.value = 0; }
}

// 表达式常量化：删除方块的全部中间变量/表达式，仅保留「变换核心变量」并取其当前值作为字面常量写入。
// 变换核心变量 = 13 个标准变换变量（CORE_VAR_DEFAULTS）+ 该方块已使用的 v.rotatex/y/z（全局旋转）。
// 这样导出/再导入后只剩干净常量，Gizmo 直接可控、不再被一长串表达式拖累。
// 支持多选；molang 接管模式同样处理（把程序改写为仅含核心常量的脚本），带关键帧的 molang 方块由调用方跳过以免破坏动画。
// ★★★ 2026-11-13 修：常量化必须【两阶段】执行（prepare 全部快照 → commit 全部改写）。
//   原实现逐块「快照+改写」一气呵成，多选时前面的块改写后会污染后面块的快照：
//   父块被常量化 ⇒ 它的 vars 被清空/重写 ⇒ 后处理的子块 recompute 读到空父级值，常量被烘成 0（模型跑位）。
//   更致命的是【附加动画层】：常量化只改 base program，附加层（bone_follow / ik_solve_*）仍每帧执行，
//   而它依赖的 v.parent_* / v.*basepos_bone 已被删掉 ⇒ 读未初始化变量抛错 ⇒ recomputeLayers 整帧不提交
//   ⇒ scope.vars 保持空 ⇒ 方块塌到原点（探针实测 Cube1..Cube10 全部 y=0、v.xpos=null）。
//   ⇒ 常量化语义「无任何非常量表达式」必须连【块的动画层引用】一起解除（全局动画正文不动，其它块不受影响）。
function constantizeBlockPlan(block) {
    const scope = block.scope;
    scope.recompute(); // 先把所有表达式求值，得到当前数值（molang / VarDef 都适用）
    const CORE = ['xpos','ypos','zpos','xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos'];
    const rotateNames = ['rotatex','rotatey','rotatez'].filter(n => scope.vars.has('v.' + n));
    const keep = [...CORE, ...rotateNames];
    // 该块挂着的动画层（引用关系，正文在 projectAnimations 全局共享 —— 这里只解引用，不删正文）
    const layers = [];
    if (scope.channels && scope.channels.size) scope.channels.forEach((_ch, k) => layers.push(k));
    // ★★ 顺序铁律：必须在【解除骨骼绑定 / 解除动画层之前】快照当前求值结果。
    //   此刻子块仍正确跟随父级，v.xpos/rotatex 等已被上面的 scope.recompute() 求出有效值；
    //   一旦解绑并删掉父级 t.<id>_* 全局，残留的 v.rotatex=t.父_xrot / v.xpos=t.父_px+… 再求值会退化成 0
    //   （若先解绑再取值 → 子块位置/旋转被清成 0，模型跑位）。
    const vals = {};
    for (const name of keep) {
        const d = scope.vars.get('v.' + name);
        const raw = (d && Number.isFinite(d.value)) ? d.value : (CORE_VAR_DEFAULTS[name] ?? 0);
        // ★ extend_scale 强检：常量化是「把表达式塌成常量」的写库操作，0 必须落成 1e-4
        vals[name] = esGuardVarValue('v.' + name, raw);
    }
    // 仅当该块【会以骨子块身份导出】时解绑（= 反推 getCommandTextForBlock 的 isBoneChild）；
    // 无动画态的文件夹纯分组子块（_boneExplicit=false 且无 molang）保持元数据不动。
    const parentId = (block._boneParent && isBoneMolangDriven(block)) ? block._boneParent : null;
    return { block, keep, vals, layers, parentId };
}

// 阶段 2（提交）：解层 → 解绑 → 写常量。返回 { layers, parentId } 供 UI 汇总提示。
// ★ 必须等【全部目标块都跑完 plan】之后再逐块 commit，否则父块改写会污染兄弟/子块的快照。
function constantizeBlockCommit(plan) {
    const block = plan.block, keep = plan.keep, vals = plan.vals;
    const scope = block.scope;
    // ① 解除附加动画层（只解本块对全局动画的【引用】，正文仍归 projectAnimations，其它块不受影响）。
    //    不改的话：附加层每帧仍执行，读已被删掉的 v.parent_* / *basepos_bone ⇒ 抛错 ⇒ 整帧不提交 ⇒ 方块塌 0。
    if (plan.layers && plan.layers.length) {
        scope.channels = null;
        scope.stack = ['__base__'];
        scope.activeLayer = '__base__';
        block._layerOwnedCache = null;
    }
    // ★★ 解除骨骼绑定（用户报的核心 bug）。紫色加号显式骨绑定（_boneParent + _boneExplicit=true）
    //   会让导出分支 isBoneChild 无条件为 true（见 getCommandTextForBlock：
    //   `_boneParent && (hasBoneAnim || isExplicitBoneBinding)`）；即使本函数已把 scope.vars 清成常量，
    //   getBoneInputConstantsString + getBoneChildFollowString 仍会把整段 molang 跟随
    //   （v.parent_*=t.父_*、pR 矩阵、v.xpos=t.父_px+…）重新注入导出指令。
    //   常量化语义 = 删除方块【全部表达式】只留核心常量；骨绑定本身就是一组 molang 表达式，故一并解除。
    //   ★ 直接改元数据，【绝不】走 setConstVarValue/unbindBone：其「骨骼跟随通道保护」_guardBoneFollowWrite
    //     会凭残留 molang 表达式识别出跟随通道并拦下写入（旋转直接拒绝、位置改写成偏移），
    //     导致冻结失败并弹出「由 molang 表达式驱动…」的误导提示。
    //   中间变量（v.parent_* / v.pR* / v.p_* / *basepos_bone）无需单独清理：下方会整体重建 scope.vars。
    if (plan.parentId) {
        const parentId = plan.parentId;
        delete block._boneParent;
        delete block._boneExplicit;
        // 父级已无其它子块 → 清掉它发布的 t.<父>_* 全局（与 unbindBone 同口径，避免残留误导骨骼识别）
        if (parentId && !blocks.some(b => b !== block && b._boneParent === parentId)) {
            ['_px', '_py', '_pz', '_xrot', '_yrot', '_zrot'].forEach(suf => {
                const gk = boneSafeId(parentId) + suf;
                if (globalVars.has(gk)) globalVars.delete(gk);
            });
        }
    }
    if (scope.molangMode) {
        // 保留 molang 接管：程序改写为仅含核心变量的常量赋值（均为常量，顺序无关）。
        // ★格式铁律：必须输出 `v.name=值;`（等号两侧无空格、单行空格连接）——
        //   指令导入端正则 `([vt])\.name\s*=\s*值` 虽已兼容空格，但导出指令要同时保证
        //   Minecraft 命令单行可粘贴；绝不用 '\n' 连接或 ' = ' 写法（曾导致导出指令
        //   带一堆换行、再导入解析不到任何赋值而退化成默认方块）。
        scope.program = keep.map(name => `v.${name}=${fmtNumRaw(vals[name])};`).join(' ');
        scope.vars.clear();
        // ★★ 预置核心常量再求值（2026-11-13）：万一程序执行仍抛错（未初始化变量等），
        //   recompute 的「出错不提交」会让 vars 保持空 ⇒ 方块塌到原点。先把常量落进 vars 兜住。
        for (const name of keep) {
            const full = 'v.' + name;
            const rg = getDefaultRange(full);
            scope.vars.set(full, new VarDef(fmtNumRaw(vals[name]), vals[name], rg.min, rg.max, rg.step));
        }
        scope.recompute();
        ensureCoreVars(scope);
    } else {
        const newVars = new Map();
        for (const name of keep) {
            const full = 'v.' + name;
            const rg = getDefaultRange(full);
            newVars.set(full, new VarDef(fmtNumRaw(vals[name]), vals[name], rg.min, rg.max, rg.step));
        }
        scope.vars = newVars;
    }
    block.refresh();
    if (typeof syncKeyframeFromBlock === 'function') syncKeyframeFromBlock(block);
    return { layers: plan.layers || [], parentId: plan.parentId || null };
}

// 单块便捷入口（探针 / 其它调用方）：内部就是 plan → commit。
function constantizeBlock(block) {
    return constantizeBlockCommit(constantizeBlockPlan(block));
}

const degToRad = d => d * Math.PI / 180;

// extend_scale 安全下限：所有依赖“可逆矩阵 / 对 es 求倒数”的路径（computeTransformMatrix 命中矩阵、
// worldToBasepos 世界轴位移逆变换、Matrix3 逆等）统一把 es 钳到该值，避免 es=0 导致矩阵奇异或除零。
// 保留符号以支持负向镜像。与 worldToBasepos 共用，改一处必须同步另一处。
const ES_MIN = 1e-4;
function clampEs(es) { return es < 0 ? -Math.max(ES_MIN, Math.abs(es)) : Math.max(ES_MIN, es); }

// ★★ extend_scale=0 写入侧强检（2026-10-01）
// 用户要求：「一出现 extendscale=0 就立即帮用户改为 0.0001」—— 不只是导出时兜，而是【存量文件、显示、
// 落库】全部强检。理由：0 存在 scope 里虽然被 clampEs 兜住渲染，但会把 0 一路带到：
//   · 变量面板显示（renderVarCard 直出 expr → 用户看到 v.extend_scale = 0）
//   · 项目保存 / 命令导入导出（0 落盘 → 下次打开还是 0）
//   · 关键帧快照（capVal 记到 0 → 动画端点 lerp 出 0）
// 因此统一在【三个写入原语】处收口，而不是在各读取点打补丁：
//   setConstVarValue（数值常量） / scope.setVarExpr（表达式） / scope.initFromM（批量装载）
// 这样显示、导出、保存自动全部干净，无需逐处重复处理。
// 判定与导出侧同口径：名字后缀命中 extend_scale（含 start_/T 前缀），或短名 v.es。
// NaN/±Infinity 一并兜到 ES_MIN（表达式求值失败 / ÷0 同样会让缩放矩阵炸）。
const _isEsName = (n) => /extend_scale$/.test(n) || n === 'es' || n === 'v.es' || /\.es$/.test(n);
function esGuardNum(v) {
    const n = Number(v);
    return (!Number.isFinite(n) || n === 0) ? ES_MIN : n;
}
// 表达式守卫：只有「纯数值字面量且为 0（或 NaN/Inf）」才改写；含变量/运算符的表达式原样保留
// （那类表达式由 molang 每帧求值，写死常量会吞掉用户逻辑）。
function esGuardExpr(expr) {
    if (expr == null) return expr;
    const s = String(expr).trim();
    if (s === '') return expr;
    // 纯数值字面量（含小数点/正负号/科学计数）
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
        const n = Number(s);
        if (!Number.isFinite(n) || n === 0) return String(ES_MIN);
        return expr;
    }
    return expr;
}
// 变量名 + 值 → 守卫后的值（非 es 变量原样透传）
function esGuardVarValue(name, v) { return _isEsName(name) ? esGuardNum(v) : v; }
// 变量名 + 表达式 → 守卫后的表达式（非 es 变量原样透传）
function esGuardVarExpr(name, expr) { return _isEsName(name) ? esGuardExpr(expr) : expr; }

// ★ 全场景强检（「已有的文件也要强检」的兜底总闸）：扫所有方块的 scope.vars（含 molang 程序文本）、
//   全局变量、以及所有关键帧帧数据，把任何 extend_scale / v.es 的 0（含 NaN/±Inf）改写为 ES_MIN。
//   在项目装载 / 命令导入收尾调用一次，保证「修复之前保存的旧工程」打开即被洗净 —— 
//   即使某条历史路径绕过了三个写入原语也不会漏。
//   返回修复条数（>0 时调用方可提示用户）。
function esSweepAllScopes() {
    let fixed = 0;
    const fixVar = (def) => {
        if (!def) return;
        const ne = esGuardExpr(def.expr);
        if (ne !== def.expr) { def.expr = ne; fixed++; }
        const nv = esGuardNum(def.value);
        if (nv !== def.value) { def.value = nv; fixed++; }
    };
    try {
        // ① 所有方块局部变量
        for (const b of blocks) {
            if (!b || !b.scope || !b.scope.vars) continue;
            for (const [name, def] of b.scope.vars) { if (_isEsName(name)) fixVar(def); }
            // ② molang 程序文本里的 extend_scale=0;（含 v.es=0;）
            if (b.scope.program) {
                // ★★ 值尾部绝不能用 \b：`.` 是非单词字符，会让 `\b` 在 `0` 与 `.` 之间误判成边界
                //    ⇒ 已归一化的 0.0001 会被再次命中并改写，每跑一次多叠一段 →
                //    v.extend_scale=0.0001.0001.0001（用户报「结构导出/正常导出都有」）。
                //    改用负向前瞻 (?![\d.]) 确保只命中「完整独立」的 0 / NaN / Infinity 字面量。
                const esLit = String(ES_MIN);                 // "0.0001"
                const frac = esLit.slice(esLit.indexOf('.')); // ".0001"
                const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                let np = b.scope.program.replace(
                    /\b([A-Za-z0-9_.]*(?:extend_scale|\.es))\s*=\s*(0(?:\.0+)?|NaN|Infinity|-Infinity)(?![\d.])/g,
                    (m, varName) => { fixed++; return `${varName}=${ES_MIN}`; });
                // ★ 修复历史腐蚀：把旧版已写坏的 `0.0001.0001…` 折叠回单个 0.0001（幂等，只认 es 赋值处）
                if (frac.length > 1) {
                    const corruptRe = new RegExp('([A-Za-z0-9_.]*(?:extend_scale|\\.es))\\s*=\\s*' + escRe(esLit) + '(?:' + escRe(frac) + ')+', 'g');
                    np = np.replace(corruptRe, (m, varName) => { fixed++; return varName + '=' + esLit; });
                }
                if (np !== b.scope.program) b.scope.program = np;
            }
        }
        // ③ 全局变量（t.* 里也可能被写 0，例如 t.xxx_extend_scale 这类广播量）
        for (const [name, g] of globalVars) { if (g && g.def && _isEsName(name)) fixVar(g.def); }
        // ④ 关键帧帧数据（每个 blockId 的每帧 varMap）
        for (const [, data] of keyframeData) {
            if (!data || !(data.frames instanceof Map)) continue;
            for (const [, varMap] of data.frames) {
                if (!(varMap instanceof Map)) continue;
                for (const [name, val] of varMap) {
                    if (!_isEsName(name)) continue;
                    const nv = esGuardNum(val);
                    if (nv !== val) { varMap.set(name, nv); fixed++; }
                }
            }
        }
    } catch (e) { console.warn('esSweepAllScopes 失败:', e && e.message); }
    return fixed;
}


//ey旋转
function computeTransformMatrix(M, rotatex = 0, rotatey = 0, rotatez = 0) {
    const [px, py, pz, rx, ry, rz, s, es, ex, ey, bx, by, bz] = M;
    const esEff = clampEs(es);
    const matB = new THREE.Matrix4().makeTranslation(bx, by, bz);
    const matEsy = new THREE.Matrix4().makeScale(1, esEff, 1);
    const matEyr = new THREE.Matrix4().makeRotationY(-degToRad(-ey));
    const matExr = new THREE.Matrix4().makeRotationX(-degToRad(ex));
    const matEs = new THREE.Matrix4().makeScale(1, 1, esEff);
    const matExl = new THREE.Matrix4().makeRotationX(degToRad(ex));
    const matEyl = new THREE.Matrix4().makeRotationY(degToRad(-ey));
    const matS = new THREE.Matrix4().makeScale(s, s, s);
    const matRx = new THREE.Matrix4().makeRotationX(degToRad(rx));
    const matRy = new THREE.Matrix4().makeRotationY(degToRad(-ry));
    const matRz = new THREE.Matrix4().makeRotationZ(degToRad(-rz));

    let localMat = matB.clone();
    localMat.premultiply(matEsy).premultiply(matEyr).premultiply(matExr).premultiply(matEs).premultiply(matExl).premultiply(matEyl).premultiply(matS).premultiply(matRz).premultiply(matRx).premultiply(matRy);

    const globalRz = new THREE.Matrix4().makeRotationZ(degToRad(-rotatez));
    const globalRx = new THREE.Matrix4().makeRotationX(degToRad(rotatex));
    const globalRy = new THREE.Matrix4().makeRotationY(degToRad(-rotatey));
    const globalRot = globalRy.clone().multiply(globalRx).multiply(globalRz);
    const matP = new THREE.Matrix4().makeTranslation(px, py, pz);
    return matP.clone().multiply(globalRot).multiply(localMat);
}
// 全局饱和度增强倍数（>1 提高饱和度，1 不变）
const SATURATION_BOOST = 1.6;
function boostColorSaturation(hexColor) {
    const c = new THREE.Color(hexColor);
    const hsl = {};
    c.getHSL(hsl);
    hsl.s = Math.min(1, hsl.s * SATURATION_BOOST);
    c.setHSL(hsl.h, hsl.s, hsl.l);
    return c;
}
// ===== 老版 fmbeSim 假明暗（照抄旧模拟器顶点着色器解析公式） =====
// 无光源、无 shadow map：逐顶点按世界空间法线计算亮度系数
// diff = 0.713(环境光) + 0.272*ny(顶亮底暗) + 0.098*(nz²-nx²)/r²(东西/南北面修正)
// 法线用模型矩阵的逆转置方向（cross 组合 = 伴随转置，r 归一化抵消行列式缩放），
// 与旧版 mAdjMat = t(adj(mMat)) 行为一致，方块旋转/缩放时明暗随之实时变化
// 通过覆写 ShaderChunk 并加 USE_COLOR 守卫：只有 vertexColors 材质(即方块)受影响，
// 地面网格(StandardMaterial)、Gizmo/指示器等无顶点色对象不受影响
THREE.ShaderChunk['color_pars_vertex'] += '\nvarying float vFaceShade;';
THREE.ShaderChunk['color_pars_fragment'] += '\nvarying float vFaceShade;';
THREE.ShaderChunk['begin_vertex'] += '\n' + [
    '#ifdef USE_COLOR',
    'mat3 fmbeM3 = mat3(modelMatrix);',
    'vec3 fmbeN = normal.x * cross(fmbeM3[1], fmbeM3[2])',
    '           + normal.y * cross(fmbeM3[2], fmbeM3[0])',
    '           + normal.z * cross(fmbeM3[0], fmbeM3[1]);',
    // ★镜像块（负 scale / det<0）：上面的 cross 组合 = 伴随矩阵 = det·M⁻ᵀ，det<0 时方向整体反向
    //   ⇒ 世界法线朝内、明暗上下颠倒（顶面被算成底面）。乘一次 det 的符号即恢复朝外的世界法线。
    'if (determinant(fmbeM3) < 0.0) fmbeN = -fmbeN;',
    'float fmbeR = length(fmbeN);',
    'vFaceShade = fmbeR < 0.001 ? 1.0',
    '        : 0.713 + 0.272 * fmbeN.y / fmbeR',
    '        + 0.098 * (fmbeN.z * fmbeN.z - fmbeN.x * fmbeN.x) / fmbeR / fmbeR;',
    '#endif'
].join('\n');
THREE.ShaderChunk['color_fragment'] += '\n' + [
    '#ifdef USE_COLOR',
    'diffuseColor.rgb *= vFaceShade;',
    '#endif'
].join('\n');

function makeSaturatedMaterial(color, opts = {}) {
    // MC 风格：方块不受光照影响，颜色 × 逐面顶点色亮度，杜绝塑料高光和惨白/发黑
    return new THREE.MeshBasicMaterial({
        color: boostColorSaturation(color),
        vertexColors: true,
        side: opts.side || THREE.FrontSide
    });
}












// <<<TEXLIB_INJECT_BEGIN>>>
