/* 03-blocks/06-molang-var-panel.js · 源 测试版v.6b79.html 第 12889-13795 行 */
'use strict';
// ========== 渲染变量面板 ==========

// ========== molang 接管：只读数值显示 + 高亮脚本编辑器 ==========
function fmtNumRaw(v) {
    if (!isFinite(v)) return '0';
    const r = Math.round(v * 1e6) / 1e6;
    return String(r);
}
// 判断表达式是否含有「逻辑判别式」：三元条件 ?: 、q. 查询、比较 / 逻辑运算符。
// 这些结构无法用普通变量卡片表示，必须以 molang 接管模式完整保留，否则指令内容会丢失。
function hasLogicalDiscriminator(expr) {
    if (!expr || typeof expr !== 'string') return false;
    if (/\?[\s\S]*:/.test(expr)) return true;                // 三元条件 (cond)?a:b
    if (/\bq\s*\./.test(expr)) return true;                  // q. 查询函数（如 q.rotation_to_camera）
    if (/(<=|>=|==|!=|&&|\|\||<|>)/.test(expr)) return true; // 比较 / 逻辑运算符
    return false;
}
// 判断一组赋值里是否存在「同一变量被先后定义多次」：普通变量卡片只保留最后一次赋值，
// 之前的赋值会被静默丢弃（表达式内容丢失）。这种指令必须以 molang 接管模式完整保留。
function hasRedefinedVariable(assignments) {
    if (!assignments || !assignments.length) return false;
    const seen = new Map(); // 'v.xxx' / 't.xxx' -> 出现次数
    for (const a of assignments) {
        const key = `${a.type}.${a.name}`;
        seen.set(key, (seen.get(key) || 0) + 1);
        if (seen.get(key) > 1) return true;
    }
    return false;
}
// 从命令内容中抽取 molang 程序本体：去掉材质/编号/类型等不含等号的 '...' 标签，
// 保留全部变量赋值（含三元条件与 q. 查询），使接管后脚本可完整执行与导出。
function extractMolangProgram(content) {
    return (content || '')
        .replace(/['"][^'"]*['"]/g, (m) => /[=]/.test(m) ? m : '')  // 去掉材质/编号等不含等号的标签
        .replace(/;\s*;/g, ';')   // 合并因去标签产生的空语句
        .replace(/^\s*;+/, '')    // 去掉开头残留的分号（由首标签如 'block：红色混凝土'; 产生）
        .trim();
}
function generateMolangBaseline(block) {
    // 标准变换变量（缺省值取自用户示例）。优先保留变量原有「表达式」(d.expr)，
    // 仅在无表达式时回退到求值数值(d.value)，从而接管后绝不把计算式吞成常量。
    const std = [
        ['xpos', 0], ['ypos', 0], ['zpos', 0],
        ['xrot', 0], ['yrot', 0], ['zrot', 0],
        ['scale', 1], ['extend_scale', 1],
        ['extend_xrot', -90], ['extend_yrot', 0],
        ['xbasepos', 0], ['ybasepos', 0], ['zbasepos', 0]
    ];
    const exprOrVal = (d, def) => {
        if (d && d.expr != null && String(d.expr).trim() !== '') return d.expr;
        if (d && d.value != null && isFinite(d.value)) return fmtNumRaw(d.value);
        return String(def);
    };
    // 收集全部变量（标准 + 自定义），统一参与依赖拓扑排序
    const entries = [];
    const seen = new Set();
    for (const [name, def] of std) {
        entries.push({ name, expr: exprOrVal(block.scope.vars.get('v.' + name), def) });
        seen.add(name);
    }
    for (const [n, d] of block.scope.vars) {
        if (!n.startsWith('v.')) continue;
        const name = n.slice(2);
        if (seen.has(name)) continue;
        entries.push({ name, expr: exprOrVal(d, 0) });
    }
    // 按依赖关系拓扑排序：被依赖的变量必须先定义，否则接管后自上而下求值时
    // 会引用到尚未定义的变量而得到 NaN（典型如 v.xrot 依赖自定义 v.scy_or/v.scy_rot）。
    const wrapped = entries.map(e => ({ name: 'v.' + e.name, def: { expr: e.expr } }));
    const ordered = topologicalSortVariables(wrapped);
    let program = ordered.map(o => `v.${o.name.slice(2)}=${o.def.expr};`).join(' ');
    // ★【三处一致铁律 2026-09-30】骨骼父块：把「广播全局」段也写进基线程序。
    //   否则 molang 编辑器看不到 t.<id>_px=…，而导出时原函数又会把它自动补上 → 编辑器 ≠ 导出（用户报）。
    if (bonePublishNeededInProgram(block)) program += ' ' + getBonePublishGlobalsString(block);
    return program;
}
// ===== 骨骼「广播全局」写入 molang program（实时 / 编辑器 / 导出 三处一致）=====
// 父块发布 t.<id>_px/py/pz + _xrot/yrot/zrot 供子块引用；这段此前只在导出时由
// getCommandTextForBlock / getKeyframeCommandText 追加，program 里没有 → 编辑器看不到、导出却有（用户报）。
// 判定口径与 getCommandTextForBlock 的 isBoneExporter 完全一致：只认【紫色加号显式绑定 ✛】的子块。
function bonePublishNeededInProgram(block) {
    if (!block || typeof isBoneParentBlock !== 'function' || !isBoneParentBlock(block)) return false;
    return blocks.some(b => b._boneParent === block.id && isExplicitBoneBinding(b));
}
// 幂等追加「广播全局」段到 program（已含则跳过）。返回是否实际写入。
function appendBonePublishToProgram(block) {
    if (!block || !block.scope) return false;
    const sid = boneSafeId(block.id);
    const hasPosPub = String(block.scope.program || '').includes(`t.${sid}_px=`);
    const needBasePub = hasBaseposBoneChild(block) && !String(block.scope.program || '').includes(`t.${sid}_bx=`);
    // 局部轴模式块作为父级：还需要补「视觉偏移锚点」广播（t.<id>_ux/uy/uz）
    const needUPub = hasPivotBoneChild(block) && boneAnchorSuffix(block) === 'u'
        && !String(block.scope.program || '').includes(`t.${sid}_ux=`);
    // 已有位置广播且不需要补 basepos / 锚点广播 → 无需改动（避免重复追加）
    if (hasPosPub && !needBasePub && !needUPub) return false;
    const pub = getBonePublishGlobalsString(block, { skipPos: hasPosPub });
    const trimmed = String(block.scope.program || '').replace(/\s+$/, '');
    block.scope.program = trimmed ? (trimmed + ' ' + pub) : pub;
    return true;
}
// 若 molang 编辑器正显示该块，同步刷新文本框与高亮（避免编辑器与 program 脱节）
function syncMolangEditorProgram(block) {
    const ta = document.getElementById('molangTextarea');
    if (ta && ta.dataset.blockId === String(block.id)) {
        ta.value = block.scope.program || '';
        try { refreshMolangEditor(block); } catch (e) {}
    }
}
// 把数值写回 molang 程序：仅当该变量的程序行右值已是纯常量时才覆盖（bake），
// 若原行是表达式（受程序驱动）则保持不动（保护，不被吞成常量）；程序里无此变量则追加。
// 返回是否被实际写入：true=已写回/追加，false=该行是表达式、受保护未写（调用方据此提示）。
function molangWriteBack(block, varName, value) {
    if (!block.scope.molangMode) return true;
    const lit = String(parseFloat(Number(value).toFixed(4)));
    const esc = varName.replace(/\./g, '\\.');
    const re = new RegExp('(\\b' + esc + '\\s*=\\s*)([^;]*?)(;)');
    const lines = (block.scope.program || '').split('\n');
    let replaced = false, hasExpr = false;
    for (let i = 0; i < lines.length; i++) {
        const code = lines[i].split('//')[0]; // 忽略行内注释，避免误改注释中的同名赋值
        re.lastIndex = 0;
        const m = re.exec(code);
        if (m) {
            const rhs = m[2].trim();
            if (isConstantExpr(rhs)) {
                // 原值是常量 → 允许写回为常数（bake）
                lines[i] = lines[i].replace(re, (mm, pre, rhs2, semi) => pre + lit + semi);
                replaced = true;
            } else {
                // 原值是表达式 → 受程序驱动，保护不被吞掉
                hasExpr = true;
            }
        }
    }
    if (!replaced && !hasExpr) {
        // 程序里完全没有该变量 → 作为新常量追加（基线未覆盖的自定义变量）。
        // 格式与常量化基线一致：等号两侧不带空格（导出归一化虽可兜底，但写入时就保持规范格式）
        const append = varName + '=' + lit + ';';
        if (lines.join('').trim() === '') lines[0] = append;
        else lines.push(append);
    }
    block.scope.program = lines.join('\n');
    return replaced || !hasExpr;
}
let _molangProtectToastAt = 0;
function molangProtectToast(varName, block) {
    const now = performance.now();
    if (now - _molangProtectToastAt < 1500) return; // 限频，避免拖拽时刷屏
    _molangProtectToastAt = now;
    // 标注触发该保护的方块，便于在多个选中/批量场景中定位是哪一块被拦下
    const tag = (block && block.id) ? ('【' + block.id + '】') : '';
    showToast('⚠️ ' + tag + varName + ' 由 molang 表达式驱动，拖动/批量修改无效；请在编辑器中修改表达式');
}
/* ★★【2026-10-16 用户纠正】「表达式非常量赋值（派生变量）模拟器本来就有新/旧操作模式的拦截，
   关键帧动画模式你又多余的写了一个」—— 正确。此前关键帧侧各自写了一份派生量拦截
   （`kfGizmoWriteVar` 里一个 `kfIsNonConstAssigned` 早退 + `setConstVarValue` 里又一段
    几乎同样的判断与 toast），与既有的 `gizmoMolangGuard` / `molangProtectToast` 重复。
   现在**只保留一个判定入口**：`gizmoMolangGuard()`，派生量提示文案也在这里一处给出。
   其它写入路径（kfGizmoWriteVar / setConstVarValue）只调它，不再各写一份。 */
function derivedVarProtectToast(varName, block) {
    const now = performance.now();
    if (now - _molangProtectToastAt < 1500) return;
    _molangProtectToastAt = now;
    const short = String(varName).replace(/^v\./, '');
    showToast('v.' + short + ' 由表达式算出（派生量），不能直接拖数值；请改它依赖的自定义变量');
}
// molang 程序静态校验：语法错误（带行号）+ 未定义变量 / 未知函数成员；返回 errors[{line,message,kind}]
/* ★★【2026-10-13 严重 bug 修复】校验必须使用**独立的 VarDef 副本**。
   旧实现 `vars: new Map(scope.vars)` 只复制了 Map，值仍是**同一批 VarDef 对象**；
   而 runBlockProgram 的 setVar 会写 `d.value = val` —— 于是"校验"把真实变量改掉了。
   又因校验会临时把 keyframeCurrentTime 归零，编译式关键帧程序在 time=0 运行，
   直接把 v.xpos 等写成首帧值（实测：xpos 2 → 0，用户看到"Gizmo 拖完弹回"）。
   现在深拷贝 VarDef，校验彻底无副作用。 */
function _cloneVarsForValidate(vars) {
    const m = new Map();
    if (!vars) return m;
    for (const [k, d] of vars) {
        m.set(k, new VarDef(d ? d.expr : '', d ? d.value : 0,
            d ? d.rangeMin : -1e9, d ? d.rangeMax : 1e9, d ? d.step : 1));
    }
    return m;
}
function validateMolang(text, scope) {
    const errors = [];
    // 以方块的当前作用域为起点（模拟 FMBE 变量持久化：上一帧赋值的变量在本帧可读）。
    // 这样关键帧 molang 程序在非首帧（q.anim_time≠0）时也能读到首帧初始化的变量，
    // 不会因为初始化块被条件跳过而误报"未定义的变量"。
    const sandbox = {
        vars: _cloneVarsForValidate(scope && scope.vars),
        _assigned: new Set(),
        blockId: scope ? scope.blockId : null,
        molangMode: true
    };
    // 关键帧程序校验时强制 q.anim_time=0，确保首帧初始化块执行，
    // 从而设置所有 start_/T/seg_time/dur 辅助变量，避免后续 lerp 引用报未定义。
    const _savedKfTime = keyframeCurrentTime;
    keyframeCurrentTime = 0;
    try {
        runBlockProgram(text || '', sandbox, { validateOnly: true, collectErrors: errors });
    } catch (e) {
        errors.push({ line: e.mlLine || 0, message: e.message, kind: 'syntax', start: e.mlStart, end: e.mlEnd });
    } finally {
        keyframeCurrentTime = _savedKfTime;
    }
    // 静态扫描：q./math./t. 未知成员（运行期不会抛，需单独检查；与顺序无关）
    const tokens = tokenizeMolang(text || '');
    const globalSet = new Set([...globalVars].map(([n]) => n));
    const qKeys = new Set(Object.keys(queryNamespace));
    const mKeys = new Set(Object.keys(angleMath));
    for (let k = 0; k < tokens.length; k++) {
        const tk = tokens[k];
        if (tk.t === 'id' && (tk.v === 't' || tk.v === 'q' || tk.v === 'math')
            && tokens[k + 1] && tokens[k + 1].t === 'op' && tokens[k + 1].v === '.'
            && tokens[k + 2] && tokens[k + 2].t === 'id') {
            const ns = tk.v, member = tokens[k + 2].v;
            // t.xxx = ... 赋值目标视为声明，不报未定义，并加入全局集合供后续引用检查
            if (ns === 't' && tokens[k + 3] && tokens[k + 3].v === '=') {
                globalSet.add(member);
                continue;
            }
            if (ns === 't' && !globalSet.has(member)) errors.push({ line: tk.line, message: '未定义的全局变量 t.' + member, kind: 'undef', start: tk.s, end: tokens[k + 2].e });
            else if (ns === 'q' && !qKeys.has(member)) errors.push({ line: tk.line, message: '未知的查询函数 q.' + member, kind: 'undef', start: tk.s, end: tokens[k + 2].e });
            else if (ns === 'math' && !mKeys.has(member)) errors.push({ line: tk.line, message: '未知的数学函数 math.' + member, kind: 'undef', start: tk.s, end: tokens[k + 2].e });
        }
    }
    // 去重（同一行同一消息只报一次）；同一错误的重复项里优先保留「带字符区间」的那条，
    // 否则后面的精确标红会被先到的无区间项挤掉、退化成整行标红。
    const seen = new Map(); const dedup = [];
    for (const e of errors) {
        const key = e.line + '|' + e.message;
        const prev = seen.get(key);
        if (!prev) { seen.set(key, e); dedup.push(e); }
        else if (prev.start == null && e.start != null) { prev.start = e.start; prev.end = e.end; }
    }
    return { errors: dedup };
}
// ========== molang → 普通方块 一键转换 ==========
// 判断 molang 程序能否无损转回「普通变量修改器」（旧操作模式）：
// ① 每条语句都是 v.NAME = 表达式（出现 if / 条件 ?: / t. 赋值 / 裸表达式 → 不可转换）；
// ② 程序内被赋值的变量之间不允许循环依赖（含自引用 v.x=v.x+1 逐帧累加）——
//    普通模式按「每变量一条表达式」做不动点求值，只有无环依赖才与程序逐帧执行结果一致；
//    无环的先后赋值（如 v.a=5; v.b=v.a*2;）可以转换，结果完全相同。
// t. 骨骼引用允许保留（普通模式本就支持“molang 驱动”表达式变量）；
// q. 查询函数（时间/相机等外部逐帧状态）视为特殊语句，不予转换（转回后会失去逐帧刷新语义）。
function molangProgramConvertible(program) {
    if (typeof program !== 'string' || !program.trim()) return false;
    const text = program.replace(/\/\/[^\n]*/g, ''); // 先去行内注释，避免注释里的 ?/q. 误拦
    if (text.includes('?')) return false;            // 三元 / 条件分支 / ??（含 ? 即程序语义）
    if (/(^|[^A-Za-z0-9_.])if([^A-Za-z0-9_]|$)/.test(text)) return false; // if 语句
    if (/\bq\s*\./.test(text)) return false;         // 查询函数 = 外部状态
    // 第一遍：收集程序内被赋值的变量名
    const assigned = new Set();
    const stmts = [];
    for (let raw of text.split(';')) {
        const stmt = raw.trim();
        if (!stmt) continue;
        const m = stmt.match(/^v\.([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
        if (!m) return false;                        // 非「v.x = 表达式」形态（含 t. 赋值/裸表达式）
        assigned.add(m[1]);
        stmts.push({ name: m[1], rhs: m[2] });
    }
    if (!assigned.size) return false;
    // 第二遍：依赖图（仅统计指向“程序内被赋值变量”的引用），自引用/前向引用一并计入
    const deps = new Map();
    for (const st of stmts) {
        const set = new Set();
        const re = /\bv\s*\.\s*([A-Za-z_]\w*)/g; let mm;
        while ((mm = re.exec(st.rhs)) !== null) { if (assigned.has(mm[1])) set.add(mm[1]); }
        deps.set(st.name, set);
    }
    // 环检测（DFS 三色标记）：有环 ⇒ 不动点求值 ≠ 逐帧程序语义 ⇒ 不可转换
    const color = new Map();
    const acyclic = (n) => {
        color.set(n, 1);
        for (const r of deps.get(n)) {
            const c = color.get(r);
            if (c === 1) return false;
            if (!c && !acyclic(r)) return false;
        }
        color.set(n, 2); return true;
    };
    for (const n of deps.keys()) { if (!color.get(n) && !acyclic(n)) return false; }
    return true;
}
// 执行转换：把接管程序交还给普通变量修改器。
// runBlockProgram 的 setVar 在每次赋值时已把右值源码写回 d.expr（见解释器实现），
// 因此只需在临时作用域完整跑一遍程序（失败则不动），随后关闭 molangMode、清空程序，
// 普通模式的 recompute 会对这批表达式做不动点求值，数值与接管状态完全一致。
function convertMolangBlockToNormal(block) {
    if (!block || !block.scope) return;
    const scope = block.scope;
    const ta = document.getElementById('molangTextarea');
    const program = ta ? ta.value : (scope.program || '');
    if (!molangProgramConvertible(program)) {
        showToast('⚠️ 程序含条件分支 / q. 查询 / 循环赋值等动态语句，转回普通方块会改变行为，已阻止');
        return;
    }
    // ★先消化掉防抖中未落账的编辑（可能压入「转换前」状态），再执行转换，最后立即落账。
    //   不能图省事用 recordAction()：它是 200ms 防抖，用户在这窗口内按 Ctrl+Z 时，
    //   undo() 开头的 flushPendingRecords() 会把「转换后」状态再压一次栈、随即被弹掉 →
    //   撤销原地空转，表现为「转换不支持撤回」。立即 record 才能保证栈顶就是本次结果。
    flushPendingRecords();
    const tmp = { vars: new Map(scope.vars), _assigned: new Set(), blockId: scope.blockId, molangMode: true, program };
    try { runBlockProgram(program, tmp); }
    catch (e) { showToast('⚠️ 程序执行失败，未转换：' + e.message); return; }
    scope.vars.clear();
    for (const [k, d] of tmp.vars) scope.vars.set(k, d);
    scope.molangMode = false;
    scope.program = '';
    scope.molangEditedByUser = false;
    ensureCoreVars(scope);
    block.refresh();
    history.record(getState());   // 立即落账（见上方注释：不能用 recordAction 的防抖）
    if (selectedBlock === block || (selectedBlocksSet && selectedBlocksSet.has(block))) renderVariablesForBlock(block);
    showToast('✅ 已转回普通方块：变量表达式原样保留，按 Ctrl+Z 或点撤销可撤回');
}
// ========== molang → 普通方块 批量转换（多选批量修改面板用） ==========
// 复用单块转换的安全语义（runBlockProgram 把右值源码写回 d.expr），但一次作用于所有选中的 molang 接管方块：
// 可无损转换的转，含动态语义（条件分支 / q. 查询 / 循环赋值 / 自引用等）的直接跳过并报告，
// 避免「只要有一个块含条件分支就整个操作失败」——多选场景里这是刚需。
function convertMolangBlocksToNormal(blocks) {
    const arr = (blocks ? Array.from(blocks) : Array.from(selectedBlocksSet)).filter(b => b && b.scope);
    const targets = arr.filter(mbrIsMolangBlock);
    if (!targets.length) { showToast('⚠️ 选中的方块都不是 molang 接管方块'); return; }
    const conv = [], skip = [];
    for (const b of targets) {
        if (molangProgramConvertible(b.scope.program || '')) conv.push(b);
        else skip.push(b);
    }
    if (!conv.length) {
        showToast('⚠️ 选中的 ' + targets.length + ' 个 molang 方块均含动态语句（条件分支 / q. 查询 / 循环赋值 / 自引用等），转回普通会改变行为，已全部跳过');
        return;
    }
    // ★先消化防抖中未落账的编辑，再统一转换，最后立即落账一次（与单块转换同一考量：不能用 recordAction 防抖，否则 Ctrl+Z 原地空转）
    flushPendingRecords();
    let okN = 0;
    for (const b of conv) {
        const scope = b.scope;
        const program = scope.program || '';
        const tmp = { vars: new Map(scope.vars), _assigned: new Set(), blockId: scope.blockId, molangMode: true, program };
        try { runBlockProgram(program, tmp); }
        catch (e) { skip.push(b); continue; }
        scope.vars.clear();
        for (const [k, d] of tmp.vars) scope.vars.set(k, d);
        scope.molangMode = false;
        scope.program = '';
        scope.molangEditedByUser = false;
        ensureCoreVars(scope);
        b.refresh();
        okN++;
    }
    if (okN) {
        history.record(getState());        // 立即落账一次（覆盖本次所有块的转换）
        const anchor = [...selectedBlocksSet][0];
        if (anchor) renderVariablesForBlock(anchor);   // 重渲染批量面板（molang 计数 / 变量卡更新）
        if (skip.length) showToast('✅ 已转回 ' + okN + ' 个普通方块；' + skip.length + ' 个含动态语句未转（' + skip.map(b => b.id).join('/') + '），表达式已保留');
        else showToast('✅ 已批量转回 ' + okN + ' 个普通方块：变量表达式原样保留，按 Ctrl+Z 可撤回');
    }
}
// 依据当前编辑器内容实时更新「转普通方块」按钮的可用态与提示
function updateMolangConvertBtn(block) {
    const btn = document.getElementById('molangConvertBtn');
    if (!btn) return;
    const ta = document.getElementById('molangTextarea');
    const program = ta ? ta.value : (block && block.scope ? block.scope.program : '');
    const ok = molangProgramConvertible(program);
    btn.disabled = !ok;
    btn.title = ok
        ? '程序只含变量赋值（无条件分支 / q. 查询 / 循环赋值），点击转回普通方块（旧操作模式变量修改器），表达式原样保留'
        : '程序含条件分支 / q. 查询函数 / 自引用或循环赋值等动态语句，转回会改变行为，暂不可转换';
}
// 只读数值小节：并入 molang 编辑器组尾部（不再是独立 var-group）。
// 折叠态存全局 molangValsOpen，重渲染（选中切换/失焦重建）后保持不变。
let molangValsOpen = true;
function renderMolangValsSection(block) {
    let rows = '';
    for (const [n, d] of block.scope.vars) {
        if (!n.startsWith('v.')) continue;
        rows += `<div class="mv-row"><span class="mv-name" title="${escapeHtml(n)}">${escapeHtml(n)}</span><span class="mv-val">${fmtNumRaw(esGuardVarValue(n, d.value))}</span></div>`;
    }
    if (!rows) rows = '<div class="mv-row"><span class="mv-name">（暂无局部变量）</span></div>';
    // 折叠态用类控制（.folded → display:none）：早先这里写内联 style="display:grid"，
    // 内联优先级压过 CSS 的 flex-wrap，导致布局永远锁成单列 grid。
    return `<div class="molang-vals${molangValsOpen ? '' : ' sec-folded'}"><div class="molang-vals-head" id="molangValsHead" title="点击折叠/展开只读数值"><span class="group-toggle">${molangValsOpen ? '▼' : '▶'}</span>📊 当前数值（只读）</div><div class="molang-vals-grid${molangValsOpen ? '' : ' folded'}" id="molangValsGrid">${rows}</div></div>`;
}
// 数值区排版守卫（每次挂载 / resize / 网格尺寸变化时重算）：
// ① 名字统一宽度 = 实测最长名（上限 150px，超出省略号）→ 各列数值起点相同、纵向成列；
// ② 末行跨列补齐：span = cols - rem + 1，且必须 clamp 到 ≤ cols ——
//    span 超过当前列数会挤出一条约等于 min-content 的「隐式列」，
//    把等宽列搅成 [168,119] 这种参差宽度（实测 vw603 踩坑）。
// ★ 泛化：molang 只读数值区与「多选批量修改」面板共用同一套排版守卫
//   （两处的网格类名同为 .molang-vals-grid / .mv-row，口径必须完全一致）
// ---------- 折叠动画（.sec-folded 驱动 grid-template-rows，机制见同名 CSS 注释）----------
// folded = 目标状态（true 表示本次要「折叠」）。折起后延时再挂 .folded（display:none），
// 保证动画期间元素仍在渲染树里；展开则先摘 .folded 再摘 .sec-folded 触发过渡。
const VALS_FOLD_MS = 260;          // 略长于 CSS 的 .24s，留一帧余量
function animateValsFold(wrap, grid, folded, onDone) {
    if (!wrap || !grid) return;
    if (wrap.__foldT) { clearTimeout(wrap.__foldT); wrap.__foldT = null; }
    if (folded) {
        wrap.classList.add('sec-folded');                       // 1fr → 0fr，开始收拢
        wrap.__foldT = setTimeout(() => {
            wrap.__foldT = null;
            if (wrap.classList.contains('sec-folded')) grid.classList.add('folded');
            if (typeof onDone === 'function') onDone();
        }, VALS_FOLD_MS);
    } else {
        grid.classList.remove('folded');                        // 先恢复 display（父级仍 0fr ⇒ 看不到跳变）
        void wrap.offsetHeight;                                 // 强制重排提交起始值，否则两次改动被并成一次、不动画
        wrap.classList.remove('sec-folded');                    // 0fr → 1fr，开始展开
        if (typeof onDone === 'function') setTimeout(onDone, VALS_FOLD_MS);
    }
}
// 网格是否「已折叠 / 正在收拢」——排版守卫据此跳过它。
// ★不能只看 .folded：收拢动画进行中的那 240ms 里 .folded 还没挂上，
//   此时若去测量会读到一个正在变矮的网格（宽度没变、量值本身没错，但没必要白跑一趟）。
function isValsGridCollapsed(grid) {
    if (!grid) return true;
    if (grid.classList.contains('folded')) return true;
    const wrap = grid.closest ? grid.closest('.molang-vals') : null;
    return !!(wrap && wrap.classList.contains('sec-folded'));
}

function fitValsGrid(grid, nameWOverride) {
    if (isValsGridCollapsed(grid)) return;
    if (getComputedStyle(grid).display === 'none') return;
    const rows = grid.querySelectorAll('.mv-row');
    if (!rows.length || !grid.getBoundingClientRect().width) return;
    // ① 先把名字列放宽到 max-content 实测最长名，再收拢到 [56,150] 区间。
    // ★nameWOverride：多分类面板由外层统一算出「全局最长名」后传入 —— 每个网格各算各的
    //   会让各组名字列宽不同（实测 56px vs 91px）→ 数值起点上下错位 35px，看着「怪怪的」。
    let nameW = nameWOverride;
    if (!nameW) {
        grid.style.setProperty('--mv-name-w', 'max-content');
        let maxW = 0;
        rows.forEach(r => {
            const n = r.querySelector('.mv-name');
            if (n) maxW = Math.max(maxW, n.scrollWidth);
        });
        nameW = Math.min(Math.max(Math.ceil(maxW) + 2, 56), 150) + 'px';
    }
    grid.style.setProperty('--mv-name-w', nameW);
    // ② 末行跨列补齐（span ≤ cols 硬约束）。
    // ★必须先清掉旧 span 再读列数：带 span 的网格会把隐式列算进 computed
    // gridTemplateColumns（如 [168,123]）→ cols 被读成 2 → span 2 恒「合法」→
    // 反馈循环永远洗不掉旧 span。先清 → 强制同步重排 → 读到纯 auto-fill 列数。
    const last = rows[rows.length - 1];
    last.style.gridColumn = '';
    const colList = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean);
    const cols = colList.length;
    if (!cols) return;
    // 列数留档（批量面板恒为 1 列；这里保留用于诊断与末行补齐）
    grid.dataset.valsCols = String(cols);
    const rem = rows.length % cols;
    if (rem !== 0) last.style.gridColumn = 'span ' + Math.min(cols - rem + 1, cols);
}
function fitMolangValsGrid() { fitValsGrid(document.getElementById('molangValsGrid')); }
// 多选批量面板：多个分类网格 → 先跨全部网格实测「全局最长名」，再把同一宽度下发给每一个网格。
// ★不能让各网格自算自宽：实测 位移组 56px / 缩放组 91px ⇒ 数值起点差 35px，四组竖线对不齐。
function fitBatchValsGrids() {
    const grids = Array.from(document.querySelectorAll('.batch-groups .molang-vals-grid'))
        .filter(g => !isValsGridCollapsed(g)
            && getComputedStyle(g).display !== 'none'
            && g.querySelector('.mv-row'));
    if (!grids.length) return;
    let globalMax = 0;
    grids.forEach(g => {
        // 名字列放宽到 max-content 实测文字自然宽（各 .mv-name 各自 max-content ⇒ scrollWidth ≈ 自身文本宽）
        g.style.setProperty('--mv-name-w', 'max-content');
        g.querySelectorAll('.mv-row .mv-name').forEach(n => {
            if (n.scrollWidth > globalMax) globalMax = n.scrollWidth;
        });
    });
    const nameW = Math.min(Math.max(Math.ceil(globalMax) + 2, 56), 150) + 'px';
    // 统一宽度下发：各组名字列同宽 ⇒ 同一行相邻卡片、以及同卡内各行，值都落在同一条竖线上。
    // ★这里不再切 vals-single（组内恒单列、值恒左对齐，见 .batch-groups .molang-vals-grid 的注释）。
    grids.forEach(g => fitValsGrid(g, nameW));
}
// molang 语法高亮 + 错误标红。
// errorRanges：[{s,e}] 源码字符区间（精确到「哪一个表达式出问题」），区间内的字符统一套上
// .molang-err-token。★不做整行标红：molang 程序常整段写在一行，整行标红的 display:block
// 会把整个编辑框染红，反而看不出错在哪一条。
function highlightMolang(text, errorRanges, branchRanges) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const re = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(\bt\.[A-Za-z_]\w*)|(\bv\.[A-Za-z_]\w*)|(\bq\.[A-Za-z_]\w*)|(\bmath\.[A-Za-z_]\w*)|(&&|\|\||!=|==|<=|>=|\?\?)|([<>!?=:])|(\d+(?:\.\d+)?)|([+\-*\/])|([A-Za-z_]\w*)|(\s+)/g;
    const CLS = ['tok-comment', 'tok-str', 'tok-global', 'tok-local', 'tok-query', 'tok-math',
                 'tok-logic', 'tok-logic', 'tok-num', 'tok-arith', 'tok-fn', null];
    const ranges = (errorRanges || []).filter(r => r && r.e > r.s).sort((a, b) => a.s - b.s);
    // 逻辑分支运行态着色区间（molang 编辑模式传入 {s,e,cls:'molang-branch-on'|'molang-branch-off'}）；
    // 缺省（如关键帧分段表达式框）不传 ⇒ 行为与旧版完全一致。
    const brs = (branchRanges || []).filter(r => r && r.e > r.s);
    // ① 全量切词（跨行整体切，不再逐行处理）：得到 [{s,e,cls}]，cls=null 表示无着色的原样文本
    const pieces = [];
    let last = 0, m; re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) pieces.push({ s: last, e: m.index, cls: null });
        let ci = 1; while (ci <= 12 && m[ci] === undefined) ci++;
        pieces.push({ s: m.index, e: re.lastIndex, cls: CLS[ci - 1] || null });
        last = re.lastIndex;
    }
    if (last < text.length) pieces.push({ s: last, e: text.length, cls: null });
    // ② 逐片切段：按「错误区间 + 分支着色区间」在本片内的全部边界切分，
    //   每段记录 token 类 + 是否标红 + 分支着色类（错误优先于分支着色）
    const parts = [];
    for (const pc of pieces) {
        const bounds = [pc.s, pc.e];
        for (const r of ranges) if (r.e > pc.s && r.s < pc.e) bounds.push(Math.max(pc.s, r.s), Math.min(pc.e, r.e));
        for (const r of brs) if (r.e > pc.s && r.s < pc.e) bounds.push(Math.max(pc.s, r.s), Math.min(pc.e, r.e));
        bounds.sort((a, b) => a - b);
        let cur = pc.s;
        for (const nx of bounds) {
            if (nx <= cur) continue;
            const a = cur, b = nx;
            const err = ranges.some(r => r.s < b && r.e > a);
            const br = err ? null : brs.find(r => r.s < b && r.e > a);
            parts.push({ s: a, e: b, cls: pc.cls, err, brCls: br ? br.cls : null });
            cur = b;
        }
    }
    // ③ 渲染：字符级片段按原 token 类名输出；标红的片段把「连续的一段」整体包进**同一个**
    //   .molang-err-token 里（不按记号拆开 —— 否则 `v.xpos` / `=` / `0` 各套一层 inset 描边，
    //   一条表达式内部会冒出竖线、看起来像三段独立标红。用户要的是「一个表达式一块红」。）
    //   分支着色段（未标红时）外包 .molang-branch-on / .molang-branch-off 一层。
    let out = '', run = [];
    const flushRun = () => {
        if (run.length) { out += `<span class="molang-err-token">${run.join('')}</span>`; run = []; }
    };
    for (const pt of parts) {
        const raw = esc(text.slice(pt.s, pt.e));
        let h;
        if (pt.brCls) h = `<span class="${pt.brCls}">${raw}</span>`;
        else h = pt.cls ? `<span class="${pt.cls}">${raw}</span>` : raw;
        if (pt.err) run.push(h);
        else { flushRun(); out += h; }
    }
    flushRun();
    return out;
}
// 把一条校验错误映射到源码字符区间：优先用错误自带的「表达式区间」；
// 拿不到区间时（整段末尾意外中断这类没有具体记号归属的错误）退化为该行整行。
function molangErrorRange(text, e) {
    if (e.start != null && e.end != null && e.end > e.start) {
        const s = Math.max(0, Math.min(e.start, text.length));
        return { s, e: Math.max(s + 1, Math.min(e.end, text.length)) };
    }
    const arr = text.split('\n');
    let ln = e.line > 0 ? e.line : arr.length;
    if (!e.line) { while (ln > 1 && arr[ln - 1].trim() === '') ln--; }   // 整体错误：标最后一行非空内容
    if (!(ln > 0) || ln > arr.length) return null;
    let s = 0; for (let i = 1; i < ln; i++) { const k = text.indexOf('\n', s); if (k < 0) break; s = k + 1; }
    let en = text.indexOf('\n', s); if (en < 0) en = text.length;
    return { s, e: Math.max(s + 1, en) };
}
// ===== 逻辑分支「运行态」分析（molang 编辑模式专用）=====
// 目的：把三元条件式里「哪一支正在执行」直观染出来 —— 正在执行 = 绿、未执行 = 灰。
// 判据：用方块当前作用域的**真实变量值**求值条件（复用运行期同一套 evaluateExpression，
//       因此 q.anim_time / t.* 等查询量都会随动画时间实时变化）。
// 例：
//   v.Cube_time<4.474?(v.ybasepos=0;);     条件真 → 整条语句绿；条件假 → 整条灰
//   v.a==1?(v.xpos=0;):(v.xpos=1;);        条件真 → (v.xpos=0;) 绿、(v.xpos=1;) 灰；反之相反
//   v.xrot=q.x>0?90:-90;                   条件真 → 90 绿、-90 灰；反之相反
// 返回 [{s,e,cls}]，cls ∈ {'molang-branch-on','molang-branch-off'}。
// ★仅处理顶层（括号深度 0）三元式：编辑框里的 FMBE 条件语句就是这种形态；
//   分支块内部嵌套的三元不参与着色（避免与外层区间交叠、产生错乱色块）。
function molangBranchRanges(text, scope) {
    const out = [];
    if (!text || !scope) return out;
    let tokens;
    try { tokens = tokenizeMolang(text); } catch (e) { return out; }
    if (!tokens.length) return out;
    // 每个记号的括号深度（'(' / '{' 之后 +1；记在记号上的深度是它「外层」的层级）
    const depth = new Array(tokens.length);
    let d = 0;
    for (let i = 0; i < tokens.length; i++) {
        const tk = tokens[i];
        depth[i] = d;
        if (tk.t === 'op' && (tk.v === '(' || tk.v === '{')) d++;
        else if (tk.t === 'op' && (tk.v === ')' || tk.v === '}')) d = Math.max(0, d - 1);
    }
    const isOp = (i, v) => tokens[i] && tokens[i].t === 'op' && tokens[i].v === v;
    // 从 openIdx（'(' 或 '{'）找配对的收尾记号下标；找不到返回 -1
    const matchClose = (openIdx) => {
        let dep = 0;
        for (let k = openIdx; k < tokens.length; k++) {
            if (tokens[k].t !== 'op') continue;
            if (tokens[k].v === '(' || tokens[k].v === '{') dep++;
            else if (tokens[k].v === ')' || tokens[k].v === '}') { dep--; if (dep === 0) return k; }
        }
        return -1;
    };
    const ON = 'molang-branch-on', OFF = 'molang-branch-off';
    for (let i = 0; i < tokens.length; i++) {
        if (!isOp(i, '?') || depth[i] !== 0) continue;
        // ① 条件区间：从本语句起点（或最近一个同级分隔符）到 '?' 之前。
        //    分隔符取「本级」的 ; ( { : ? , = —— 条件本身可含比较/算术/逻辑记号，故不把它们当边界。
        let cs = 0;
        for (let k = i - 1; k >= 0; k--) {
            if (depth[k] !== 0) continue;
            if (tokens[k].t === 'op' && [';', '(', '{', ':', '?', ',', '='].indexOf(tokens[k].v) !== -1) { cs = k + 1; break; }
        }
        if (cs >= i) continue;
        const condText = text.slice(tokens[cs].s, tokens[i].s);
        // ② 本语句顶层 ';' 之前 = 语句末尾（供「无 else 时整条语句着色」用）
        let stmtEnd = text.length;
        for (let k = i + 1; k < tokens.length; k++) {
            if (depth[k] === 0 && isOp(k, ';')) { stmtEnd = tokens[k].s; break; }
        }
        // ③ 读一支：块式 ( ... )/{ ... } 取其整体区间；表达式式取到同级 ':' / ';' / ')' 之前
        //    表达式分支用「相对深度」扫描 —— 否则分支里含函数调用（math.sqrt(x)）时，
        //    内层 '(' 的 depth 仍是外层值，会误判成同级而多吞后面的 else 分支。
        const readExprEnd = (startIdx) => {
            let dep = 0;
            for (let k = startIdx; k < tokens.length; k++) {
                const tk = tokens[k];
                if (tk.t !== 'op') continue;
                if (tk.v === '(' || tk.v === '{') dep++;
                else if (tk.v === ')' || tk.v === '}') { if (dep === 0) return k; dep--; }
                else if (dep === 0 && (tk.v === ':' || tk.v === ';')) return k;
            }
            return tokens.length;
        };
        const readBranch = (fromIdx) => {
            let j = fromIdx;
            while (j < tokens.length && isOp(j, ';')) j++;
            if (j >= tokens.length) return { range: null, nextIdx: j };
            if (isOp(j, '(') || isOp(j, '{')) {
                const close = matchClose(j);
                if (close < 0) return { range: null, nextIdx: j };
                return { range: { s: tokens[j].s, e: tokens[close].e }, nextIdx: close + 1 };
            }
            const k = readExprEnd(j);
            const endChar = (k < tokens.length) ? tokens[k].s : stmtEnd;
            return { range: endChar > tokens[j].s ? { s: tokens[j].s, e: endChar } : null, nextIdx: k };
        };
        const t1 = readBranch(i + 1);
        const thenR = t1.range, afterThen = t1.nextIdx;
        let elseR = null;
        if (afterThen < tokens.length && depth[afterThen] === 0 && isOp(afterThen, ':')) {
            elseR = readBranch(afterThen + 1).range;
        }
        // ④ 求值条件（真值 = 非 0 / 非空）
        let truthy = false;
        try { truthy = !!evaluateExpression(condText, scope.vars, globalVars, scope.blockId); } catch (e) { truthy = false; }
        // ⑤ 着色
        if (elseR) {
            // 有 else：条件恒参与执行 → 绿；两支一绿一灰
            out.push({ s: tokens[cs].s, e: tokens[i].s, cls: ON });
            if (thenR) out.push({ s: thenR.s, e: thenR.e, cls: truthy ? ON : OFF });
            out.push({ s: elseR.s, e: elseR.e, cls: truthy ? OFF : ON });
        } else {
            // 无 else（FMBE 条件语句）：条件真 → 整条语句在执行（整条绿）；假 → 整条灰
            out.push({ s: tokens[cs].s, e: stmtEnd, cls: truthy ? ON : OFF });
        }
    }
    return out.filter(r => r.e > r.s);
}
function renderMolangEditor(block) {
    return `<div class="var-group" data-group="molang">
      <div class="group-header" data-group-toggle="molang"><span class="molang-header-actions"><button type="button" class="molang-head-btn" id="molangBatchBtn" title="批量查找替换表达式：对所选/全部 molang 方块做通用字符串替换（任意变量与写法），可逐块预览、一次撤销">⇄ 批量</button><button type="button" class="molang-head-btn" id="molangHelpBtn" title="molang 帮助：查询函数 / math 函数">❓ 帮助</button><button type="button" class="molang-head-btn primary" id="molangConvertBtn" title="转回普通方块（旧操作模式变量修改器）">⇦ 转普通方块</button><span class="group-toggle">▼</span></span><span class="group-title">📜 molang 表达式（完全接管）</span></div>
      <div class="group-content" data-group-content="molang" style="display:block">
        <div class="molang-editor">
          <pre class="molang-highlight" id="molangHighlight" aria-hidden="true"></pre>
          <textarea class="molang-textarea" id="molangTextarea" data-block-id="${escapeHtml(block.id)}" spellcheck="false" placeholder="例如：&#10;v.xrot = q.rotation_to_camera(1) > 0 ? 90 : -90;"></textarea>
        </div>
        <div class="molang-error" id="molangError"></div>
        <div class="program-help">终止表达式</div>
        ${renderMolangValsSection(block)}
      </div>
    </div>`;
}
// 实时校验 + 着色 + 错误显示：高亮、错误表达式标红、错误面板，且不重建文本框（光标不跳）
function refreshMolangEditor(block) {
    const ta = document.getElementById('molangTextarea'), pre = document.getElementById('molangHighlight');
    const errBox = document.getElementById('molangError');
    if (!ta || !pre) return;
    const { errors } = validateMolang(ta.value, block.scope);
    // ★错误标红按「表达式字段」精确到字符区间（见 molangErrorRange）：只染红真正出问题的那一条，
    //   其余同名/同行内容一律不受影响（旧实现整行标红，程序写成一行时等于把整个编辑框染红）。
    const errorRanges = [];
    for (const e of errors) { const r = molangErrorRange(ta.value, e); if (r) errorRanges.push(r); }
    // ★逻辑分支「运行态」着色：按当前变量值判定三元条件哪一支在执行（见 molangBranchRanges）。
    //   正在执行 = 绿、未执行 = 灰；随编辑输入与播放时间实时刷新。
    let branchRanges = [];
    try { branchRanges = molangBranchRanges(ta.value, block.scope); } catch (e) { branchRanges = []; }
    pre.innerHTML = highlightMolang(ta.value, errorRanges, branchRanges) + '\n';
    // 缓存本次着色结果：渲染循环按帧做轻量刷新时复用（见 updateMolangBranchColors），避免逐帧重跑校验
    pre.__errRanges = errorRanges;
    pre.__branchSig = branchRanges.map(r => r.s + ':' + r.e + ':' + r.cls).join('|');
    // innerHTML 重置会把 pre.scrollTop 清零，必须还原与文本框一致，否则高亮层跳回顶部、与文本框错位
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
    if (errBox) {
        if (errors.length) {
            errBox.innerHTML = errors.map(e => {
                const loc = e.line > 0 ? ('第 ' + e.line + ' 行：') : '';
                return '<div>❌ ' + loc + escapeHtml(e.message) + '</div>';
            }).join('');
            errBox.classList.add('show');
        } else {
            errBox.innerHTML = ''; // 清空残留旧错误文本（面板隐藏时不可见，但需清除以免下次误显）
            errBox.classList.remove('show');
        }
    }
    // 「转普通方块」按钮随输入实时刷新可用态（程序改成纯变量赋值即亮起）
    updateMolangConvertBtn(block);
}
// 逻辑分支着色的「按帧轻量刷新」：渲染循环里对选中块调用（动画/时间推进时跟随）。
// 只重算三元条件求值 + 着色区间，复用上次缓存的错误区间，不重跑 validateMolang（省性能）；
// 区间签名未变则直接返回，避免每帧重建 innerHTML / 反复滚动定位。
function updateMolangBranchColors(block) {
    const ta = document.getElementById('molangTextarea');
    const pre = document.getElementById('molangHighlight');
    if (!ta || !pre || ta.dataset.blockId !== String(block.id)) return;
    let branchRanges = [];
    try { branchRanges = molangBranchRanges(ta.value, block.scope); } catch (e) { branchRanges = []; }
    const sig = branchRanges.map(r => r.s + ':' + r.e + ':' + r.cls).join('|');
    if (pre.__branchSig === sig) return;
    pre.__branchSig = sig;
    const errorRanges = pre.__errRanges || [];
    pre.innerHTML = highlightMolang(ta.value, errorRanges, branchRanges) + '\n';
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
}
// 仅就地更新只读数值显示，不重建文本框（避免光标/焦点跳动）
function updateMolangValueDisplay(block) {
    const wrap = document.getElementById('molangValsGrid');
    if (!wrap) return;
    wrap.querySelectorAll('.mv-row').forEach(row => {
        const name = row.querySelector('.mv-name')?.textContent;
        const valEl = row.querySelector('.mv-val');
        if (!name || !valEl) return;
        const d = block.scope.vars.get(name);
        if (d) valEl.textContent = fmtNumRaw(esGuardVarValue(name, d.value));
    });
}
// 判断某作用域是否用到自发式随机函数（math.random / math.random_integer / math.die_roll / math.die_roll_integer）。
// 这些函数每调用一次推进一次种子，需要每帧重算才能持续变化，像查询函数一样“每一帧返回一个值”。
function scopeUsesSpontaneous(scope) {
    /* ★【2026-10-24 性能】判定结果按 (program, 变量数) 缓存。
       动画循环每帧对**每个**方块调用本函数，旧实现要遍历 12 个变量各做一次正则 →
       几千方块时每帧 3 万多次正则匹配（实测约占帧时间 3~4ms）。
       程序字符串未变时 `===` 走同一引用快路径；变量表达式改写统一走 setVarExpr/addVar → recompute() 会清缓存。 */
    const c = scope._spontCache;
    if (c && c.prog === scope.program && c.n === scope.vars.size) return c.sp;
    let sp = false;
    if (scope.molangMode && scope.program) {
        sp = /\bmath\.(random|die_roll)/.test(scope.program);
    } else if (!scope.molangMode) {
        for (const [, d] of scope.vars) {
            if (d.expr && /\bmath\.(random|die_roll)/.test(d.expr)) { sp = true; break; }
        }
    }
    scope._spontCache = { prog: scope.program, n: scope.vars.size, sp };
    return sp;
}
// molang 接管视图的折叠（接管分支会提前 return，走不到 RVFB 末尾的通用 groupClick 绑定）
function molangGroupClick(e) {
    const gn = this.dataset.groupToggle;
    const cnt = document.querySelector(`.group-content[data-group-content="${gn}"]`);
    if (!cnt) return;
    const open = cnt.style.display !== 'none';
    if (open) { cnt.style.display = 'none'; this.querySelector('.group-toggle').textContent = '▶'; }
    else { cnt.style.display = 'block'; this.querySelector('.group-toggle').textContent = '▼'; }
    // 折叠/展开会改变编辑器组的可用竖直空间，下一帧重算编辑器高度
    requestAnimationFrame(autosizeMolangEditor);
}
// 数值小节折叠：只收起网格，编辑器不动；下一帧 autosize 会把释放的空间还给编辑器（双向跟随）
function molangValsClick(e) {
    e.stopPropagation();
    const grid = document.getElementById('molangValsGrid');
    if (!grid) return;
    const wrap = grid.closest('.molang-vals');
    const willFold = !isValsGridCollapsed(grid);   // 当前是展开的 ⇒ 本次要折叠
    molangValsOpen = !willFold;
    const t = this.querySelector('.group-toggle');
    if (t) t.textContent = molangValsOpen ? '▼' : '▶';
    // 展开后格子宽度恢复，重新测量一次数值竖线
    if (molangValsOpen) fitMolangValsGrid();
    // 动画结束后再让编辑器重新分配空间 —— 否则 autosize 量到的是收拢中途的高度，底部会留一条空隙
    animateValsFold(wrap, grid, willFold, () => requestAnimationFrame(autosizeMolangEditor));
    requestAnimationFrame(autosizeMolangEditor);
}
// molang 编辑器默认高度自适应：根据侧栏当前可视高度自动撑满竖直区域，
// 不再固定 min-height:132px 的小窗。用户仍可用文本框右下角 resize 手柄手动调整。
function autosizeMolangEditor() {
    const ta = document.getElementById('molangTextarea');
    if (!ta) return;
    const group = ta.closest('.var-group[data-group="molang"]');
    const sc = ta.closest('.panel-content');
    const varsCont = document.getElementById('varsContainer');
    // 只在 molang 接管布局（#varsContainer 直接子元素 = 数值组 + 编辑器组）下生效
    if (!group || !sc || group.parentElement !== varsCont) return;
    const cs = getComputedStyle(sc);
    const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
    const innerH = sc.clientHeight - padT - padB;
    if (!(innerH > 0)) return; // 面板收起/不可见时跳过
    // 归零滚动后测量「编辑器组顶部 → 内容顶部」的固定偏移（含头部/工具栏），测完还原
    const savedScroll = sc.scrollTop;
    sc.scrollTop = 0;
    const topOffset = group.getBoundingClientRect().top - sc.getBoundingClientRect().top - padT;
    // 组内 textarea 以外的固定高度（组头 + 错误条 + 帮助文字 + 内边距）
    const fixed = group.offsetHeight - ta.offsetHeight;
    // varsContainer 之后仍需可见的内容（新建变量区 / 反馈信息等）
    let belowH = 0;
    for (let s = varsCont.nextElementSibling; s; s = s.nextElementSibling) {
        const st = getComputedStyle(s);
        if (st.display === 'none') continue;
        belowH += s.offsetHeight + (parseFloat(st.marginTop) || 0) + (parseFloat(st.marginBottom) || 0);
    }
    sc.scrollTop = savedScroll;
    const avail = innerH - topOffset - fixed - belowH - 8; // 8px 底部余量
    // 双向跟随：折叠数值小节 → 编辑器撑满释放的空间；重新展开 → 编辑器自动让位。
    // avail 过小（≤0）时不写 height，CSS min-height 兜底，面板整体转滚动。
    if (avail > 0) ta.style.height = Math.round(avail) + 'px';
}
function attachMolangEditorEvents(block) {
    const ta = document.getElementById('molangTextarea'), pre = document.getElementById('molangHighlight');
    if (!ta || !pre) return;
    mnbHide(); // 重建编辑器时关闭可能残留的数字气泡（旧的 textarea 已失效）
    acHide();  // 同时关闭可能残留的自动补全泡泡
    // 绑定 molang 接管视图里的分组折叠（编辑器组组头 + 组内只读数值小节头）
    document.querySelectorAll('.var-group[data-group="molang"] .group-header').forEach(h => {
        h.removeEventListener('click', molangGroupClick);
        h.addEventListener('click', molangGroupClick);
    });
    const valsHead = document.getElementById('molangValsHead');
    if (valsHead) { valsHead.removeEventListener('click', molangValsClick); valsHead.addEventListener('click', molangValsClick); }
    // 末行贴边：挂载时算一次；面板宽度变化导致每行项数变化时重算（只绑一次，避免重复叠加）
    fitMolangValsGrid();
    // 布局可能在挂载当帧尚未定型（面板过渡/媒体查询切换），下一帧再校一次
    requestAnimationFrame(fitMolangValsGrid);
    if (!window.__molangFitBound) {
        window.__molangFitBound = true;
        window.addEventListener('resize', fitMolangValsGrid);
        if (typeof ResizeObserver !== 'undefined') window.__molangFitRO = new ResizeObserver(() => fitMolangValsGrid());
    }
    // 编辑器重建后 grid 是新节点，RO 必须改挂到当前节点（旧的已脱离 DOM）
    if (window.__molangFitRO) {
        window.__molangFitRO.disconnect();
        const g0 = document.getElementById('molangValsGrid');
        if (g0) window.__molangFitRO.observe(g0);
    }
    // 「转普通方块」：仅当程序为纯变量赋值（无条件/查询/循环依赖）时可点（disabled 态见 updateMolangConvertBtn）
    const convBtn = document.getElementById('molangConvertBtn');
    if (convBtn) convBtn.addEventListener('click', (e) => { e.stopPropagation(); convertMolangBlockToNormal(block); });
    // 「批量」：打开批量改写面板（单选时默认作用于全部 molang 方块，多选时作用于所选）
    const batchBtn = document.getElementById('molangBatchBtn');
    if (batchBtn) batchBtn.addEventListener('click', (e) => { e.stopPropagation(); openMolangBatchReplace(); });
    ta.value = block.scope.program || '';
    refreshMolangEditor(block);
    // 关键修复：每次输入即时生效（写入程序 → 重算 → 刷新 3D → 更新只读数值 + 实时校验报错），无需失焦
    ta.addEventListener('input', () => {
        refreshMolangEditor(block);
        block.scope.program = ta.value;
        // 标记"用户手动编辑过 Molang"：之后关键帧增删改不再自动覆盖此代码，
        // 保留用户在编辑器里做的手工修改（比如改 Tyrot 做疯狂旋转等自定义效果）
        block.scope.molangEditedByUser = true;
        block.refresh(); // 内部 recompute（表达式未完成时静默忽略）并应用变换
        cascadeAfterProgramChange(block); // 若刚改动的是父块广播段（t.<id>_*），依赖它的子块同帧跟随
        updateMolangValueDisplay(block);
        if (mnbEl) mnbHide();        // 手动编辑时关闭（可能已失效的）瞬时泡泡
        refreshPinnedBubbles(block); // 同步 / 清理常显泡泡（变量被删则炸开消失）
        recordAction();              // 纳入撤销系统：recordAction 内部 200ms 防抖，连续打字只产生一个检查点
        if (!acSuppress) acUpdate(ta, block); // 输入时动态刷新自动补全候选（acSuppress 时跳过，避免补全点击后重开）
    });
    // 自动补全键盘控制：Tab 补全（保持打开）/ ↑↓ 选择 / Esc 关闭
    ta.addEventListener('keydown', (e) => {
        if (!acItems.length || (acEl && acEl.style.display === 'none')) return;
        if (e.key === 'Tab') {
            e.preventDefault();
            const it = acItems[acIndex] || acItems[0];
            if (it) acApply(it, false); // Tab 补全：不关闭泡泡
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            acIndex = (acIndex + 1) % acItems.length;
            acRender(acItems); acPosition(ta);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            acIndex = (acIndex - 1 + acItems.length) % acItems.length;
            acRender(acItems); acPosition(ta);
        } else if (e.key === 'Escape') {
            e.preventDefault(); acHide();
        }
    });
    ta.addEventListener('blur', () => {
        // 延迟关闭：避免与候选项 mousedown（已 preventDefault 不会触发 blur）冲突
        setTimeout(() => { if (acEl && acEl.style.display !== 'none' && document.activeElement !== ta) acHide(); }, 120);
    });
    ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; if (acEl && acEl.style.display !== 'none') acPosition(ta); });
    ta.addEventListener('change', () => {
        block.scope.program = ta.value;
        block.refresh();
        cascadeAfterProgramChange(block);
        if (selectedBlock) renderVariablesForBlock(selectedBlock); // 失焦时整体重建一次，校正数值
    });
    setupMolangNumberBubble(block); // 单击数字常量弹出自增/自减泡泡
    // 帮助按钮：打开 molang 函数速查弹窗（阻止冒泡，避免触发分组折叠）
    const helpBtn = document.getElementById('molangHelpBtn');
    if (helpBtn) helpBtn.addEventListener('click', (e) => { e.stopPropagation(); openMolangHelp(); });
    // 编辑器渲染完成后按当前面板高度自适应撑满竖直区域；窗口尺寸变化时重算（全局只绑一次）
    requestAnimationFrame(autosizeMolangEditor);
    if (!window._molangEditorResizeBound) {
        window._molangEditorResizeBound = true;
        window.addEventListener('resize', () => { if (document.getElementById('molangTextarea')) autosizeMolangEditor(); });
    }
}

