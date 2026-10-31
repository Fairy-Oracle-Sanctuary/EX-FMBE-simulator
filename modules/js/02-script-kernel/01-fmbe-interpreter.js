/* 02-script-kernel/01-fmbe-interpreter.js · 源 测试版v.6b79.html 第 7591-8338 行 */
'use strict';
// ========== 程序式脚本解释器（FMBE 风格，顺序执行）==========
// 语法（自上而下顺序执行；同一变量可多次赋值，后写覆盖先写）：
//   语句以 ; 分隔（末尾 ; 可省略）
//   赋值语句：  v.NAME = 表达式
//   条件语句：  条件表达式 ? (语句序列) : (语句序列)    分支也可用 { } 包围
//   表达式支持：数字、v.NAME、t.NAME、math.xxx(...)、q.xxx(...)、
//              运算符 ! && || == != < <= > >= + - * / 、括号 ( )、以及表达式级三元 a?b:c
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

function runBlockProgram(text, scope, opts) {
    const validateOnly = !!(opts && opts.validateOnly);
    const collectDecl = opts && opts.collectDecl;
    const tokens = tokenizeMolang(text);
    scope._assigned = new Set(); // 本次执行中被赋值的变量（供核心变量默认回退使用）
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
                if (!_isKfScaffold) d.expr = srcExpr;
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
    function parseStatement() {
        const tk = peek();
        if (!tk) return () => {};
        // 当前语句的源码区间：从本语句第一个记号起，到最后一个已消费记号止。
        // 缺分号报错时用它精确定位「到底是哪一条表达式没闭合」（而非整行/整段标红）。
        const stmtStart = tk.s;
        const stmtRange = () => ({ s: stmtStart, e: tokens[p - 1] ? tokens[p - 1].e : stmtStart + 1 });
        if (tk.t === 'id' && tk.v === ';') { next(); return () => {}; } // 允许连续分号 / 空语句
        if (tk.t === 'id' && tk.v === 'if') {
            next(); expect('(');
            const cond = parseExpr(false); expect(')');
            const thenB = parseBlock();
            let elseB = null;
            if (peek() && peek().v === 'else') { next(); elseB = parseBlock(); }
            if (peek() && peek().v === ';') next(); else synErr('语句结尾缺少分号', stmtRange()); // FMBE：分号硬性要求
            return () => { if (cond()) runList(thenB); else if (elseB) runList(elseB); };
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
                    if (g) { g.def.value = val; if (rhsText != null) g.def.expr = rhsText; }
                    else { globalVars.set(name, { def: new VarDef(rhsText != null ? rhsText : String(val), val, -1e9, 1e9, 1), sourceBlockId: scope.blockId || null }); }
                    if (scope._assigned) scope._assigned.add('t.' + name);
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
    try { parseProgram(); } finally { _currentEvalBlockId = prevBlockId; }
}

//修改了预设的min max

class VarDef {
    constructor(expr, val, min = -10, max = 10, step = 0.01) {
        this.expr = expr; this.value = val; this.rangeMin = min; this.rangeMax = max; this.step = step;
    }
}

class VariableScope {
    constructor(bid) { this.blockId = bid; this.vars = new Map(); this.program = ''; this.molangMode = false; this._spontCache = null; }
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
        if (this.molangMode || (this.program && this.program.trim())) {
            if (this.molangMode) {
                // FMBE 语义：以「上一帧已提交的数值」为起点建立本帧语境（复制上一帧的 vars）。
                // 这样 v.t = v.t ?? 0 能读到上一帧的 v.t 并逐帧累加；
                // v.xpos = v.rot 在 v.rot 本帧尚未赋值时，读到的是上一帧的 v.rot（首帧无数据→按 molang 约定回退 0）。
                // 先在临时作用域执行，成功后才提交，避免“出错帧”污染方块状态。
                const tmp = { vars: new Map(this.vars), _assigned: new Set(), blockId: this.blockId, molangMode: true, program: this.program };
                let ok = true;
                let errMsg = null;
                try { runBlockProgram(this.program || '', tmp); }
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
                    try { runBlockProgram(this.program || '', initTmp); } catch (e) { /* 初始化错误忽略，尽力而为 */ }
                    // 2. 以初始化后的 vars 为起点，按当前时间重新执行
                    keyframeCurrentTime = _savedTime;
                    const retryTmp = { vars: new Map(initTmp.vars), _assigned: new Set(), blockId: this.blockId, molangMode: true, program: this.program };
                    try { runBlockProgram(this.program || '', retryTmp); ok = true; tmp.vars = retryTmp.vars; }
                    catch (e) { ok = false; errMsg = e.message; }
                }
                if (!ok) console.warn('高级脚本执行错误:', errMsg);
                if (ok) {
                    this.vars.clear();
                    for (const [k, v] of tmp.vars) this.vars.set(k, v);
                    ensureCoreVars(this); // 未赋值的「核心变换变量」补中性默认值，保证方块不消失
                }
                // 出错则不提交，保留上一帧正确状态
                return;
            }
            // 非接管模式下携带 program 的罕见情况：维持原行为，直接在本作用域执行
            let ok = true;
            try { runBlockProgram(this.program || '', this); } catch (e) { ok = false; console.warn('高级脚本执行错误:', e.message); }
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
function constantizeBlock(block) {
    const scope = block.scope;
    scope.recompute(); // 先把所有表达式求值，得到当前数值（molang / VarDef 都适用）
    const CORE = ['xpos','ypos','zpos','xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos'];
    const rotateNames = ['rotatex','rotatey','rotatez'].filter(n => scope.vars.has('v.' + n));
    const keep = [...CORE, ...rotateNames];
    // ★★ 顺序铁律：必须在【解除骨骼绑定之前】快照当前求值结果。
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
    //   仅当该块【会以骨子块身份导出】时解绑（= 反推 getCommandTextForBlock 的 isBoneChild）；
    //   无动画态的文件夹纯分组子块（_boneExplicit=false 且无 molang）保持元数据不动。
    if (block._boneParent && isBoneMolangDriven(block)) {
        const parentId = block._boneParent;
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
        scope.recompute();
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
    // extend_scale=0 会让矩阵某列缩放为 0 → matrixWorld 奇异（det=0），
    // three.js Raycaster 对奇异矩阵求逆得到零矩阵 → 射线永远与方块无交点 → 点击选不中。
    // 钳制为极小非零厚度（视觉上与 0 无差别，同 generateRectParams 的 1e-4 惯例）。
    // ★2026-10-31：FMBE 原版不支持负 scale / 负 extend_scale，镜像工具已改为正 scale + 局部 z 反射，
    //   不再产出负值；这里保留符号只是为了打开旧存档时不擅自翻转它的几何。
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
