/* 03-blocks/07-molang-batch-rewrite.js · 源 测试版v.6b79.html 第 13796-14904 行 */
'use strict';
// ==================== 批量改写 molang 表达式（多选一键改） ====================
// 使用场景：多个方块各自引用自己的父骨名（t.Cube_yrot / t.Hand_yrot…），想把同一处写法
// 批量换成新写法，例如
//   查找  v.rotatey=t.*_yrot;
//   替换  v.rotatey=v.rotatey + (t.*_yrot - v.rotatey)*0.05;
// 所以核心不是「文本替换」而是「通配符捕获」：查找里每个 * 依次对应一个捕获组
// （非贪婪、可跨行）；替换里第 n 个 * 依次引用第 n 个捕获组（也可写 $1/$2）。
// ★molang 里 * 同时是乘法号，因此替换里的 * 只在「不像乘法」时才当引用：
//   紧跟数字或 ( 的（*0.05 / *( ）以及 *-1 这类一律按字面乘法；要强制字面可写 \*。
//   面板里的「替换解析」行会把实际识别结果标出来，所见即所得。
let mbrState = {
    scope: 'selection',     // selection | all
    mode: 'replace',        // replace | overwrite
    engine: 'wildcard',     // wildcard | regex | plain
    find: localStorage.getItem('ex_mbr_find') || '',
    repl: localStorage.getItem('ex_mbr_repl') || '',
    overwrite: localStorage.getItem('ex_mbr_overwrite') || ''
};
function mbrSaveState() {
    try {
        localStorage.setItem('ex_mbr_find', mbrState.find);
        localStorage.setItem('ex_mbr_repl', mbrState.repl);
        localStorage.setItem('ex_mbr_overwrite', mbrState.overwrite);
    } catch (e) { }
}
// 「molang 方块」= 完全接管 或 已有程序文本
function mbrIsMolangBlock(b) {
    return !!(b && b.scope && (b.scope.molangMode || (b.scope.program && b.scope.program.trim())));
}
function mbrAllMolangBlocks() {
    return (typeof blocks !== 'undefined' && blocks ? blocks : []).filter(mbrIsMolangBlock);
}
function mbrTargets() {
    if (mbrState.scope === 'all') return mbrAllMolangBlocks();
    const sel = (typeof selectedBlocksSet !== 'undefined' && selectedBlocksSet) ? Array.from(selectedBlocksSet) : [];
    return sel;
}
function mbrEscapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// 查找 → RegExp（global）。通配符模式：转义全部正则元字符后，把 \* 还原成捕获组。
function mbrBuildRegex(find, engine) {
    if (!find) return null;
    let src;
    if (engine === 'regex') src = find;
    else if (engine === 'plain') src = mbrEscapeRe(find);
    else src = mbrEscapeRe(find).split('\\*').join('([\\s\\S]*?)');
    try {
        const re = new RegExp(src, 'g');
        // 病态正则保护：先空跑一次极短文本，能抛错就判非法
        re.lastIndex = 0; re.exec('');
        return re;
    } catch (e) { return null; }
}
// 查找里可用捕获组数量（用于提示「替换引用了第 n 个通配符，但查找里没有」）
function mbrGroupCount(find, engine) {
    if (!find) return 0;
    if (engine === 'wildcard') return (find.match(/\*/g) || []).length;
    if (engine === 'plain') return 0;
    return (find.replace(/\\./g, '').match(/\((?!\?)/g) || []).length;
}
// 替换文本 → 内部 $n 形式。返回 { js, refs: 通配符引用个数, maxRef: 引用到的最大序号 }
function mbrCompileRepl(repl, engine) {
    repl = String(repl || '');
    if (engine === 'plain') return { js: repl.replace(/\$/g, '$$$$'), refs: 0, maxRef: 0 };
    let out = '', i = 0, refs = 0, maxRef = 0;
    while (i < repl.length) {
        const c = repl[i];
        if (c === '\\' && repl[i + 1] === '*') { out += '*'; i += 2; continue; }   // \* → 字面星号
        if (c === '$') {
            if (repl[i + 1] === '$') { out += '$$'; i += 2; continue; }
            let j = i + 1, num = '';
            while (j < repl.length && /\d/.test(repl[j])) { num += repl[j]; j++; }
            if (num) { out += '$' + num; maxRef = Math.max(maxRef, parseInt(num, 10)); i = j; continue; }
            out += '$$'; i++; continue;                                            // 单个 $ 按字面
        }
        if (c === '*' && engine === 'wildcard') {
            const n1 = repl[i + 1] || '', n2 = repl[i + 2] || '';
            // 像乘法号：紧跟数字或 ( ，或 *-1 / *+1 → 字面
            const isMul = /[0-9(]/.test(n1) || (/[+-]/.test(n1) && /[0-9]/.test(n2));
            if (isMul) { out += '*'; i++; continue; }
            refs++; maxRef = Math.max(maxRef, refs); out += '$' + refs; i++; continue;
        }
        out += c; i++;
    }
    return { js: out, refs, maxRef };
}
// 展开一次替换（内部 $n 形式）：$n → 第 n 组（不存在则空），$$ → $，\* → *
function mbrExpand(jsRepl, m) {
    let out = '', i = 0;
    while (i < jsRepl.length) {
        const c = jsRepl[i];
        if (c === '\\' && jsRepl[i + 1] === '*') { out += '*'; i += 2; continue; }
        if (c === '$') {
            if (jsRepl[i + 1] === '$') { out += '$'; i += 2; continue; }
            let j = i + 1, num = '';
            while (j < jsRepl.length && /\d/.test(jsRepl[j])) { num += jsRepl[j]; j++; }
            if (num) { const g = m[parseInt(num, 10)]; out += (g === undefined ? '' : g); i = j; continue; }
        }
        out += c; i++;
    }
    return out;
}
// 对一段程序文本做替换：同时产出新文本 + 旧/新两份带高亮的 HTML（供预览）
function mbrRewriteText(text, re, jsRepl) {
    text = text || '';
    re.lastIndex = 0;
    let count = 0, last = 0, out = '', fromHtml = '', toHtml = '', m;
    while ((m = re.exec(text)) !== null) {
        if (m[0] === '') { re.lastIndex++; continue; }        // 防零宽匹配死循环
        count++;
        const before = text.slice(last, m.index);
        const expanded = mbrExpand(jsRepl, m);
        out += before + expanded;
        fromHtml += escapeHtml(before) + '<mark class="mbr-hit">' + escapeHtml(m[0]) + '</mark>';
        toHtml += escapeHtml(before) + '<mark class="mbr-ins">' + escapeHtml(expanded) + '</mark>';
        last = m.index + m[0].length;
        if (count > 4000) break;                              // 病态输入保护
    }
    const tail = text.slice(last);
    out += tail; fromHtml += escapeHtml(tail); toHtml += escapeHtml(tail);
    return { text: out, count, changed: count > 0 && out !== text, fromHtml, toHtml };
}
function mbrMakeTransform() {
    if (mbrState.mode !== 'replace') return null;
    const find = mbrState.find, engine = mbrState.engine;
    if (!find) return null;
    const re = mbrBuildRegex(find, engine);
    if (!re) return { invalid: true };
    const c = mbrCompileRepl(mbrState.repl, engine);
    const groups = mbrGroupCount(find, engine);
    return {
        re, js: c.js, refs: c.refs, groups,
        warn: c.maxRef > groups ? `替换引用了第 ${c.maxRef} 个捕获，但查找里只有 ${groups} 个` : ''
    };
}
// 语法校验：只需「几条」+「前几条是什么」（徽章悬停与行内提示用）。
// 复用编辑器同一套 validateMolang，口径一致 —— 编辑器报什么，这里就报什么。
function mbrCheckSyntax(text, scope) {
    try {
        const v = validateMolang(text, scope);
        const list = (v && v.errors) ? v.errors : [];
        return { n: list.length, msgs: list.slice(0, 4).map(e => (e.line ? '第 ' + e.line + ' 行：' : '') + (e.message || '语法错误')) };
    } catch (e) { return { n: 0, msgs: [] }; }
}
// 单个方块的改写方案（含语法校验，仅在命中时做）
function mbrPlanFor(b, t) {
    const oldText = (b && b.scope && b.scope.program) || '';
    if (mbrState.mode === 'overwrite') {
        const ov = mbrState.overwrite;
        const changed = oldText !== ov;
        if (!changed) return { oldText, text: oldText, changed: false, count: 0, err: 0, errMsgs: [], fromHtml: escapeHtml(oldText), toHtml: escapeHtml(oldText) };
        const chk = mbrCheckSyntax(ov, b.scope);
        return { oldText, text: ov, changed: true, count: 1, err: chk.n, errMsgs: chk.msgs, fromHtml: escapeHtml(oldText), toHtml: escapeHtml(ov), needMode: !b.scope.molangMode };
    }
    if (!t || t.invalid) return { oldText, text: oldText, changed: false, count: 0, err: 0, errMsgs: [], fromHtml: escapeHtml(oldText), toHtml: escapeHtml(oldText) };
    const r = mbrRewriteText(oldText, t.re, t.js);
    let chk = { n: 0, msgs: [] };
    if (r.changed) chk = mbrCheckSyntax(r.text, b.scope);
    return { oldText, text: r.text, changed: r.changed, count: r.count, err: chk.n, errMsgs: chk.msgs, fromHtml: r.fromHtml, toHtml: r.toHtml };
}
function mbrBuildPlan() {
    const t = mbrState.mode === 'replace' ? mbrMakeTransform() : null;
    const targets = mbrTargets();
    const rows = targets.map(b => ({ b, p: mbrPlanFor(b, t) }));
    const hits = rows.filter(r => r.p.changed);
    const errs = hits.filter(r => r.p.err && r.p.err > 0).length;
    const needModes = hits.filter(r => r.p.needMode).length;
    const badRe = !!(t && t.invalid);
    return { t, rows, hits, errs, needModes, badRe, warn: (t && !t.invalid && t.warn) || '' };
}
// 逐块预览 + 计数 + 应用按钮态
function mbrPreview() {
    const box = document.getElementById('mbrPreview');
    if (!box) return;
    const plan = mbrBuildPlan();
    const esc = escapeHtml;
    const MAXROWS = 80;
    let html = '';
    plan.rows.slice(0, MAXROWS).forEach(({ b, p }) => {
        const errMsgs = p.errMsgs || [];
        const errTip = errMsgs.length ? ` title="${esc(errMsgs.join('\n'))}"` : '';
        const badge = p.changed
            ? (p.err > 0 ? '<span class="mbr-pv-badge err"' + errTip + '>语法存疑 ' + p.err + '</span>' : '<span class="mbr-pv-badge">命中</span>')
            : '<span class="mbr-pv-badge skip">跳过</span>';
        const grow = (p.needMode ? '<span class="mbr-pv-badge new">转 molang</span>' : '');
        const kb = mbrIsMolangBlock(b) ? '' : '<span class="mbr-pv-badge skip">非 molang</span>';
        // 徽章只给数字，用户无法行动 → 把校验器原话摊在预览行里（手机端没有悬停，必须可见）
        const note = (p.changed && errMsgs.length)
            ? `<div class="mbr-pv-note">⚠️ ${esc(errMsgs.slice(0, 2).join('；'))}${errMsgs.length > 2 ? `（共 ${errMsgs.length} 条）` : ''}</div>`
            : '';
        html += `<div class="mbr-pv">
          <div class="mbr-pv-head">❒ ${esc(String(b.id))} ${badge}${grow}${kb}<span>${p.changed ? '命中 ' + p.count + ' 处' : ''}</span></div>
          <div class="mbr-pv-code old">${p.fromHtml || '（空程序）'}</div>
          ${p.changed ? `<div class="mbr-pv-code new">${p.toHtml}</div>` : ''}${note}
        </div>`;
    });
    if (plan.rows.length > MAXROWS) html += `<div class="mbr-pv"><div class="mbr-pv-head">…还有 ${plan.rows.length - MAXROWS} 个方块未列出</div></div>`;
    if (!plan.rows.length) html = '<div class="mbr-pv"><div class="mbr-pv-head">作用范围内没有方块</div></div>';
    box.innerHTML = html;
    // 计数 + 按钮态
    const cnt = document.getElementById('mbrCount');
    if (cnt) {
        cnt.textContent = `命中 ${plan.hits.length} · 跳过 ${plan.rows.length - plan.hits.length}`
            + (plan.errs ? ` · 语法存疑 ${plan.errs}` : '') + (plan.needModes ? ` · 转 molang ${plan.needModes}` : '');
        // 汇总原因：同一句提示会出现在很多方块上，去重后列出，避免刷屏
        const allMsgs = [...new Set(plan.rows.flatMap(r => (r.p && r.p.errMsgs) || []))];
        if (allMsgs.length) cnt.title = allMsgs.slice(0, 10).join('\n');
        else cnt.removeAttribute('title');
    }
    const applyBtn = document.getElementById('mbrApply');
    if (applyBtn) {
        const valid = mbrState.mode === 'overwrite' ? !!mbrState.overwrite.trim() : (!!mbrState.find && !plan.badRe);
        applyBtn.disabled = !valid || plan.hits.length === 0;
        applyBtn.textContent = `应用到 ${plan.hits.length} 个方块`;
    }
    // 替换解析行：把识别出的捕获引用标出来（所见即所得，消除 * 歧义）
    const parseEl = document.getElementById('mbrParse');
    if (parseEl) {
        if (mbrState.mode === 'overwrite') { parseEl.style.display = 'none'; }
        else {
            parseEl.style.display = '';
            const t = plan.t;
            let s = '';
            if (!mbrState.find) s = '查找为空：输入要匹配的表达式片段。';
            else if (plan.badRe) s = '⚠️ 正则语法错误，无法解析（切到「纯文本」可原样匹配）。';
            else {
                s = '替换解析：' + esc(t.js).replace(/\$(\d)/g, '<span class="ref">⟨捕获$1⟩</span>');
                if (t.warn) s += `　⚠️ ${esc(t.warn)}`;
                else if (mbrState.engine === 'wildcard') s += `　（查找 ${t.groups} 个通配符）`;
            }
            parseEl.innerHTML = s;
        }
    }
    // 作用范围按钮上的计数
    const selN = (typeof selectedBlocksSet !== 'undefined' && selectedBlocksSet) ? selectedBlocksSet.size : 0;
    const allN = mbrAllMolangBlocks().length;
    document.querySelectorAll('#mbrScopeSeg button').forEach(btn => {
        const s = btn.dataset.scope;
        btn.textContent = s === 'all' ? `全部 molang 方块 (${allN})` : `当前选中 (${selN})`;
        btn.classList.toggle('on', mbrState.scope === s);
    });
    document.querySelectorAll('#mbrModeSeg button').forEach(b => b.classList.toggle('on', mbrState.mode === b.dataset.mode));
    document.querySelectorAll('#mbrEngineSeg button').forEach(b => b.classList.toggle('on', mbrState.engine === b.dataset.engine));
    const ra = document.getElementById('mbrReplaceArea'), oa = document.getElementById('mbrOverwriteArea');
    if (ra) ra.style.display = mbrState.mode === 'replace' ? '' : 'none';
    if (oa) oa.style.display = mbrState.mode === 'overwrite' ? '' : 'none';
}
let mbrPreviewTimer = null;
function mbrSchedulePreview() {
    if (mbrPreviewTimer) clearTimeout(mbrPreviewTimer);
    mbrPreviewTimer = setTimeout(() => { mbrPreviewTimer = null; mbrPreview(); }, 120);
}
// 查找 / 替换框（textarea）：随内容自动长高，超出上限后内部滚动。
// ★这两个框必须支持「任意字符（含换行）」—— 多行表达式片段、含制表/空白的整段写法都要能匹配，
//   所以用 textarea 而非 input（input 天然无法输入换行）。手动 resize 关闭（.mbr-grow），改由内容驱动高度。
function mbrAutosize(el, maxH) {
    if (!el) return;
    const lim = maxH || 150;
    el.style.height = 'auto';
    const h = Math.min(el.scrollHeight, lim);
    el.style.height = h + 'px';
    el.style.overflowY = el.scrollHeight > lim ? 'auto' : 'hidden';
}
// ========== 通配符 / 正则教程（面板内「📖 教程」入口） ==========
// 复用 molang 帮助弹窗的视觉语言（.molang-help-modal / .mh-*），只换内容。
// 每条「示例」给 查找 / 替换 两个可一键复制的代码框，用户可直接抄进面板。
const MBR_TUTORIAL = [
    {
        title: '🃏 通配符模式（推荐：每块写法一样、只是名字不同）', cls: 'q',
        items: [
            { k: '规则', d: '查找里每个 <b>*</b> 依次捕获一段文本 —— <b>非贪婪、可跨行</b>（连换行一起吃掉）。替换里第 n 个 <b>*</b> 引用第 n 个捕获，也可写 <b>$1</b> / <b>$2</b>。' },
            { k: '规则', d: '<b>*</b> 紧跟数字或左括号时按「乘法」处理（<b>*0.05</b> 就是乘 0.05）；要强制当通配符，写 <b>\\*</b>。' },
            { k: '规则', d: '替换里想输出字面 <b>$</b> 写 <b>$$</b>；查找里 <b>*</b> 之外的字符都按字面匹配。' },
            { k: '提示', d: '一个 <b>*</b> 非贪婪会「尽量少吃字符」，所以最好用<b>固定上下文把它夹住</b>（如 <b>v.rotatey=t.*_yrot;</b> 里的 t. 与 _yrot;），否则可能截断在意外位置。' },
            { k: '示例', d: '让每块按自己的父骨名做阻尼跟随', find: 'v.rotatey=t.*_yrot;', repl: 'v.rotatey=v.rotatey+(t.*_yrot-v.rotatey)*0.05;' },
            { k: '示例', d: '批量把初值 +1 改成 ×2', find: 'v.xpos=v.xpos+1;', repl: 'v.xpos=v.xpos*2;' },
            { k: '示例', d: '捕获两段并交换（$1/$2 顺序对调）', find: 't.*_xrot=v.*_yrot;', repl: 't.$2_xrot=v.$1_yrot;' },
        ]
    },
    {
        title: '🧬 正则模式（需要「按模式」匹配时用）', cls: '',
        items: [
            { k: '规则', d: '写 <b>JavaScript 正则</b>，引擎自动全局匹配（不用写 g 标志）；替换里用 <b>$1</b> / <b>$2</b> 引用捕获组，<b>$&amp;</b> 是整段匹配，<b>$$</b> 输出字面 <b>$</b>。' },
            { k: '规则', d: '<b>.</b> 不匹配换行；要跨行用 <b>[\\s\\S]</b>（任意字符含换行）或 <b>[\\s\\S]*?</b>（跨行非贪婪）。' },
            { k: '规则', d: 'molang 里的 <b>. ( ) * + $ { }</b> 都是正则元字符 —— 匹配字面值必须转义，例如 <b>v\\.xpos</b>、<b>\\(</b>、<b>\\$</b>。' },
            { k: '提示', d: '写错时面板会直接报「正则语法错误，无法解析」并把「应用」置灰，可切「纯文本」原样匹配。' },
            { k: '示例', d: '把 v.x=0; 改成 v.x=1;（变量名任意）', find: 'v\\.([a-z]+)=0;', repl: 'v.$1=1;' },
            { k: '示例', d: '匹配「变量 = 数字;」并把数字翻倍（容忍空格、负号、小数）', find: 'v\\.(\\w+)\\s*=\\s*(-?\\d+(?:\\.\\d+)?);', repl: 'v.$1 = $2 * 2;' },
            { k: '示例', d: '跨行匹配「xpos=1; 到 xpos=0;」整段并替换', find: 'v\\.xpos=1;[\\s\\S]*?v\\.xpos=0;', repl: 'v.xpos=1;v.xpos=0;' },
        ]
    },
    {
        title: '🧰 常用正则片段速查', cls: '',
        chips: [
            { p: '\\d', d: '数字 0-9' }, { p: '\\w', d: '字母/数字/下划线' }, { p: '\\s', d: '空白（含换行/制表）' },
            { p: '.', d: '任意字符（不含换行）' }, { p: '[\\s\\S]', d: '任意字符（含换行）' },
            { p: '*', d: '前面一项 0 次以上' }, { p: '+', d: '前面一项 1 次以上' }, { p: '?', d: '前面一项 0 或 1 次（加在 * + 后=非贪婪）' },
            { p: '( … )', d: '捕获组，用 $1 引用' }, { p: '(?: … )', d: '只分组不捕获' }, { p: 'a|b', d: 'a 或 b' },
            { p: '^', d: '行/串首' }, { p: '$', d: '行/串尾' }, { p: '{2,5}', d: '前面一项 2~5 次' }
        ]
    },
    {
        title: '💡 通用技巧', cls: '',
        items: [
            { k: '换行', d: '查找框与替换框都<b>可输入任意字符（含换行）</b>；直接回车换行，框会随内容自动长高，多行片段也能匹配。' },
            { k: '范围', d: '「当前选中」只改选中的方块；「全部 molang 方块」改所有已接管的方块（按钮上实时显示各自数量）。' },
            { k: '安全', d: '先看<b>预览</b>（改前 → 改后逐块高亮）确认无误再点「应用」；应用后 <b>Ctrl+Z</b> 可一次整批回退。' },
            { k: '存疑', d: '命中的方块会做语法校验，骨名写错等会标「语法存疑」并摊开原因。' },
        ]
    }
];
function openMbrTutorial() {
    if (document.getElementById('mbrTutorialModal')) return;   // 防止重复打开
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const secHtml = MBR_TUTORIAL.map(sec => {
        let body = '';
        if (sec.items) body = sec.items.map(it => {
            let code = '';
            if (it.find !== undefined) {
                code = `<div class="mbrt-code"><span class="mbrt-tag">查找</span><code>${esc(it.find)}</code><button type="button" class="mh-copy" data-copy="${esc(it.find)}">📋</button></div>`
                     + `<div class="mbrt-code"><span class="mbrt-tag ins">替换</span><code>${esc(it.repl || '')}</code><button type="button" class="mh-copy" data-copy="${esc(it.repl || '')}">📋</button></div>`;
            }
            return `<div class="mbrt-item"><div class="mbrt-k">${esc(it.k)}</div><div class="mbrt-d">${it.d}</div>${code}</div>`;
        }).join('');
        else if (sec.chips) body = `<div class="mbrt-chips">${sec.chips.map(c =>
            `<span class="mbrt-chip"><code>${esc(c.p)}</code><i>${esc(c.d)}</i></span>`).join('')}</div>`;
        return `<div class="mh-sec-title ${sec.cls}">${esc(sec.title)}</div>${body}`;
    }).join('');
    const m = document.createElement('div');
    m.className = 'molang-help-modal mbrt-modal';
    m.id = 'mbrTutorialModal';
    m.innerHTML = `
      <div class="mh-box">
        <div class="mh-head"><h2>📖 通配符与正则教程</h2><button type="button" class="mh-close" id="mbrTutClose" title="关闭">✕</button></div>
        <div class="mh-body">
          <div class="mh-row" style="margin:0 0 6px;">批量查找替换支持三种匹配方式：<b>通配符 *</b>（最易上手）、<b>正则</b>（最灵活）、<b>纯文本</b>（原样匹配）。替换里都可用 <b>$1/$2</b> 引用捕获。</div>
          ${secHtml}
          <div class="mh-foot">示例可直接点 📋 复制，粘进「查找 / 替换为」框</div>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.tabIndex = -1; m.focus();   // 让 Esc 能收到（div 默认不可聚焦）
    const close = () => m.remove();
    m.addEventListener('click', (e) => { if (e.target === m) close(); });   // 点遮罩关闭
    m.querySelector('#mbrTutClose').addEventListener('click', close);
    m.querySelectorAll('.mh-copy').forEach(b => b.addEventListener('click', () => mhCopy(b.dataset.copy)));
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
}
// 打开面板
function openMolangBatchReplace() {
    if (document.getElementById('molangBatchModal')) return;
    // 智能默认范围：多选时改「选中的这几个」，单选/从编辑器进来时默认「全部 molang 方块」
    const selN = (typeof selectedBlocksSet !== 'undefined' && selectedBlocksSet) ? selectedBlocksSet.size : 0;
    mbrState.scope = selN > 1 ? 'selection' : 'all';
    const m = document.createElement('div');
    m.className = 'molang-batch-modal';
    m.id = 'molangBatchModal';
    m.innerHTML = `
      <div class="mbr-box">
        <div class="mbr-head"><h2>⇄ 批量查找替换表达式</h2><div class="mbr-head-actions">
          <button type="button" class="mbr-tut" id="mbrTutBtn" title="通配符与正则用法教程（含示例，可一键复制）">📖 教程</button>
          <button type="button" class="mbr-close" id="mbrClose" title="关闭（Esc）">✕</button>
        </div></div>
        <div class="mbr-body">
          <div class="mbr-rowline"><span class="mbr-label">作用范围</span><div class="mbr-seg" id="mbrScopeSeg">
            <button type="button" data-scope="selection"></button><button type="button" data-scope="all"></button>
          </div></div>
          <div class="mbr-rowline"><span class="mbr-label">改写方式</span><div class="mbr-seg" id="mbrModeSeg">
            <button type="button" data-mode="replace">查找替换</button><button type="button" data-mode="overwrite">整段覆盖</button>
          </div><div class="mbr-seg" id="mbrEngineSeg" style="margin-left:auto;">
            <button type="button" data-engine="wildcard" title="* 依次捕获一段文本（可跨行）">通配符 *</button>
            <button type="button" data-engine="regex" title="写 JavaScript 正则，替换里用 $1/$2 引用">正则</button>
            <button type="button" data-engine="plain" title="原样匹配，* 也是普通字符">纯文本</button>
          </div></div>
          <div id="mbrReplaceArea">
            <div class="mbr-rowline"><span class="mbr-label">查找</span><textarea class="mbr-input mbr-grow" id="mbrFind" rows="1" spellcheck="false" placeholder="v.xpos=v.xpos+1;（可输入任意字符，含换行）"></textarea></div>
            <div class="mbr-rowline"><span class="mbr-label">替换为</span><textarea class="mbr-input mbr-grow" id="mbrRepl" rows="1" spellcheck="false" placeholder="v.xpos=v.xpos*2;（可输入任意字符，含换行）"></textarea></div>
            <div class="mbr-parse" id="mbrParse"></div>
            <div class="mbr-hint">查找 / 替换是<b>通用字符串操作</b>：位置、旋转、缩放、自定义变量都能改，不限于骨骼相关写法。
              两个框都<b>可输入任意字符（含换行）</b>，会随内容自动长高，多行表达式片段也能匹配。
              需要「按块区分」时用「通配符」：每个 <b>*</b> 依次捕获一段文本（可跨行），替换里第 n 个 <b>*</b> 引用第 n 个捕获，也可写 $1/$2；
              <b>*</b> 紧跟数字或左括号时按乘法处理（如 <b>*0.05</b>），要强制当通配符可写 <b>\\*</b>。
              完整教程与示例见右上角 <b>📖 教程</b>。</div>
          </div>
          <div id="mbrOverwriteArea" style="display:none;">
            <div class="mbr-rowline"><span class="mbr-label">程序</span><textarea class="mbr-input" id="mbrOverwrite" rows="4" spellcheck="false" placeholder="整段写入这些方块的 molang 程序（例如 v.xrot = 0; v.xrot = 90;）"></textarea></div>
            <div class="mbr-hint">把这段程序原样写入每个目标方块；尚未 molang 接管的方块会一并转为接管。</div>
          </div>
          <div class="mbr-preview-head"><span>预览</span><span id="mbrCount"></span></div>
          <div class="mbr-preview" id="mbrPreview"></div>
        </div>
        <div class="mbr-foot">
          <button type="button" class="mbr-btn" id="mbrCancel">取消</button>
          <button type="button" class="mbr-btn primary" id="mbrApply">应用</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    // 容错取节点：传 'mbrFind' 或 '#mbrFind' 都能取到（避免 '##id' 这类拼接错误）
    const $ = sel => m.querySelector(sel.charAt(0) === '#' ? sel : '#' + sel);
    $('#mbrFind').value = mbrState.find;
    $('#mbrRepl').value = mbrState.repl;
    $('#mbrOverwrite').value = mbrState.overwrite;
    mbrAutosize($('#mbrFind')); mbrAutosize($('#mbrRepl'));   // 恢复的可能是多行内容 → 直接按内容高度展开
    const close = () => { mbrSaveState(); m.remove(); };
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
    $('#mbrClose').addEventListener('click', close);
    $('#mbrCancel').addEventListener('click', close);
    $('#mbrTutBtn').addEventListener('click', () => openMbrTutorial());
    m.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); mbrApply(); }
    });
    // 分段按钮
    m.querySelectorAll('#mbrScopeSeg button').forEach(b => b.addEventListener('click', () => { mbrState.scope = b.dataset.scope; mbrPreview(); }));
    m.querySelectorAll('#mbrModeSeg button').forEach(b => b.addEventListener('click', () => {
        mbrState.mode = b.dataset.mode;
        // 切到「整段覆盖」时，用当前第一个目标的程序预填，减少一次复制
        if (mbrState.mode === 'overwrite' && !mbrState.overwrite.trim()) {
            const first = mbrTargets().find(mbrIsMolangBlock);
            if (first) $('#mbrOverwrite').value = mbrState.overwrite = first.scope.program || '';
        }
        mbrPreview();
    }));
    m.querySelectorAll('#mbrEngineSeg button').forEach(b => b.addEventListener('click', () => { mbrState.engine = b.dataset.engine; mbrPreview(); }));
    // 输入
    $('#mbrFind').addEventListener('input', (e) => { mbrState.find = e.target.value; mbrSaveState(); mbrAutosize(e.target); mbrSchedulePreview(); });
    $('#mbrRepl').addEventListener('input', (e) => { mbrState.repl = e.target.value; mbrSaveState(); mbrAutosize(e.target); mbrSchedulePreview(); });
    $('#mbrOverwrite').addEventListener('input', (e) => { mbrState.overwrite = e.target.value; mbrSaveState(); mbrSchedulePreview(); });
    $('#mbrApply').addEventListener('click', () => mbrApply());
    mbrPreview();
    setTimeout(() => { const f = $('#mbrFind'); if (f && mbrState.mode === 'replace') f.focus(); }, 30);
}
// 应用：批量写回 + 立即落账（一次撤销整批回退）
// 程序里是否含「向全局发布」的写法：t.<id>_px / t.<id>_xrot 等（骨骼父块的广播段、用户手写的全局发布）。
// 用宽松正则：只要出现 t.某标识符 = 就算，宁可多传播一次也不漏。
function programPublishesGlobals(prog) {
    return /(^|[^A-Za-z0-9_.])t\.[A-Za-z0-9_]+\s*=/.test(String(prog || ''));
}
// ★立即生效（跨块级联）：某个方块的 program 被改写后，它发布出去的 t.<id>_* 全局变了，
//   而消费这些全局的方块（骨骼子块的 v.xpos=t.<父>_px+pR·偏移、v.rotatex=t.<父>_xrot，以及任何
//   手写引用 t.x 的表达式）依赖的是【自己的缓存值】，不会自己重算 —— 表现为「改了父块，子块旋转
//   跟上了但位置没跟上」（用户报）。这里补一次全量 refresh，与关键帧 / 变量编辑等既有路径同口径
//   （它们同样直接 blocks.forEach(b => b.refresh())）。
//   注意：必须全量、不能只 refresh 命中的块 —— 父块自身 refresh 时解释器已把 t.<id>_xrot 写进
//   globalVars，updateGlobalVarsDependingOn 会认为「值没变」而不触发级联（见 ~5558）。
function cascadeAfterProgramChange(changed) {
    try {
        const arr = Array.isArray(changed) ? changed : [changed];
        if (!arr.some(b => b && b.scope && programPublishesGlobals(b.scope.program))) return;
        blocks.forEach(b => { try { b.refresh(); } catch (e) { } });
    } catch (e) { }
}
function mbrApply() {
    const plan = mbrBuildPlan();
    if (!plan.hits.length) { showToast('⚠️ 没有方块命中，未做任何修改'); return; }
    // ★破坏性 mutation 前先消化防抖中的记录，mutation 后立即 record（不能用 recordAction 的 200ms 防抖，
    //   否则窗口内按 Ctrl+Z 会把「改完」的状态再压栈又弹掉 → 撤销空转）
    flushPendingRecords();
    let errBlocks = 0, newModes = 0;
    for (const { b, p } of plan.hits) {
        mnbSetProgramText(b, p.text);            // 同步正在编辑的 textarea（若正是该块）
        if (mbrState.mode === 'overwrite' && !b.scope.molangMode) { b.scope.molangMode = true; newModes++; }
        b.scope.molangEditedByUser = true;       // 标记手工编辑：关键帧增删改不再自动覆盖
        // ★立即生效：refresh() = scope.recompute()（按新程序重跑一遍）+ updateTransform()，
        //   再补一次 updateMatrixWorld，保证同一帧内读 matrixWorld / 世界坐标就已更新（与批量增量路径同口径）。
        try { b.refresh(); b.mesh.updateMatrixWorld(true); } catch (e) { }
        if (p.err > 0) errBlocks++;
    }
    // ★同帧传播：命中块若含 t.<id>_* 广播段，消费这些全局的方块（骨骼子块等）必须一起重算，
    //   否则它们停在旧值上（「父块改了、子块只跟旋转不跟位置」）。放在 record 之前，快照里就是新值。
    cascadeAfterProgramChange(plan.hits.map(h => h.b));
    history.record(getState());
    // 编辑器正在显示某个被改的方块时，同步刷新它的高亮与报错
    const ta = document.getElementById('molangTextarea');
    if (ta) {
        const cur = plan.hits.find(h => String(h.b.id) === String(ta.dataset.blockId));
        if (cur) { ta.value = cur.p.text; try { refreshMolangEditor(cur.b); } catch (e) { } }
    }
    if (selectedBlock) renderVariablesForBlock(selectedBlock);
    mbrPreview();
    showToast(`✅ 已改写 ${plan.hits.length} 个方块的 molang 表达式`
        + (newModes ? `（其中 ${newModes} 个新转为 molang 接管）` : '')
        + (errBlocks ? `；${errBlocks} 个可能有语法问题` : '')
        + '，按 Ctrl+Z 可整批撤销');
}

// ========== molang 帮助弹窗：查询函数（q.）+ 数学函数（math.）速查 ==========
// 数据须与 queryNamespace / angleMath 实际实现保持一致
const MOLANG_QUERY_FUNCS = [
    { name: 'q.anim_time', copy: 'q.anim_time',
      params: '无参数',
      desc: '返回当前动画时间（秒），由关键帧播放系统驱动。配合关键帧 molang 指令使用，可实现 lerp 插值动画。',
      ret: '当前动画时间（浮点数，单位秒）。未播放时返回上次暂停的时间点。' },
    { name: 'q.rotation_to_camera(mode)', copy: 'q.rotation_to_camera(1)',
      params: 'mode（0 或 1）：选择返回的角度类型',
      desc: '返回「方块原点 (0,0,0) 看向摄像机」的角度（单位：度，与 math / 方块旋转统一为角度制）。常用于让方块始终朝向或背向摄像机。',
      ret: 'mode=0 → 俯仰角（pitch，相对水平面，符号与方块 xrot 约定一致）；mode=1 → 偏航角（yaw，XZ 平面方位角）。' },
    { name: 'q.life_time', copy: 'q.life_time',
      params: '无参数',
      desc: '返回【该方块自身】自创建 / 复制 / 加载以来经历的时间（秒）。每个方块独立计时：方块在加入场景时记录自己的出生时刻，复制 / 新建出来的方块是「新生的」，life_time 从接近 0 开始，因此和原件数值不同。',
      ret: '该方块的存在时长（浮点数，单位秒），随时间持续增长。受「查询函数更新」开关控制；帮助面板该项右侧的（重置）按钮可让所有方块同时归零并从 0 重新自增。',
      reset: true }
];
const MOLANG_MATH_FUNCS = [
    { name: 'math.sin(x)', desc: '正弦。输入为角度（度），返回正弦值，范围 -1~1。' },
    { name: 'math.cos(x)', desc: '余弦。输入为角度（度），返回余弦值，范围 -1~1。' },
    { name: 'math.asin(x)', desc: '反正弦。输入 -1~1，返回角度（度）。' },
    { name: 'math.acos(x)', desc: '反余弦。输入 -1~1，返回角度（度）。' },
    { name: 'math.atan(x)', desc: '反正切。输入数值，返回角度（度）。' },
    { name: 'math.atan2(y,x)', desc: '四象限反正切。返回 y/x 的角度（度），可正确处理各象限与符号。' },
    { name: 'math.sqrt(x)', desc: '平方根 √x（x≥0）。' },
    { name: 'math.abs(x)', desc: '绝对值 |x|。' },
    { name: 'math.floor(x)', desc: '向下取整（不大于 x 的最大整数）。' },
    { name: 'math.ceil(x)', desc: '向上取整（不小于 x 的最小整数）。' },
    { name: 'math.round(x)', desc: '四舍五入到最接近的整数。' },
    { name: 'math.trunc(x)', desc: '截断取整（直接舍去小数部分）。' },
    { name: 'math.pow(a,b)', desc: '幂运算 a 的 b 次幂（a^b）。' },
    { name: 'math.exp(x)', desc: '自然指数 e^x。' },
    { name: 'math.ln(x)', desc: '自然对数 ln(x)。' },
    { name: 'math.min(a,b,...)', desc: '返回所有参数中的最小值。' },
    { name: 'math.max(a,b,...)', desc: '返回所有参数中的最大值。' },
    { name: 'math.mod(x,d)', desc: '取模 x % d；若 d=0 则返回 x（避免除零异常）。' },
    { name: 'math.clamp(v,lo,hi)', desc: '将 v 限制在 [lo, hi] 区间内并返回。' },
    { name: 'math.lerp(a,b,t)', desc: '线性插值，返回 a + (b-a)*t（t 建议 0~1）。' },
    { name: 'math.lerprotate(start,end,t)', desc: '角度线性插值，自动走最短路径（正确处理 ±180° 环绕）。' },
    { name: 'math.min_angle(a)', desc: '将角度归一化到 (-180, 180] 区间。' },
    { name: 'math.hermite_blend(t)', desc: '平滑插值曲线 3t²-2t³（输入建议 0~1），常用于缓动。' },
    { name: 'math.pi / math.PI', desc: '圆周率 π ≈ 3.14159。' },
    { name: 'math.random(low,high)', desc: '返回 [low, high] 间的随机浮点数。按方块隔离、且每帧自发变化（自发性函数）。' },
    { name: 'math.random_integer(low,high)', desc: '返回 [low, high] 间的随机整数。按方块隔离、每帧自发变化。' },
    { name: 'math.die_roll(num,low,high)', desc: '投掷 num 次骰子并将结果求和，每次范围 [low, high]（浮点）。' },
    { name: 'math.die_roll_integer(num,low,high)', desc: '投掷 num 次骰子并将结果求和，每次范围 [low, high]（整数）。' }
];
function mhCopy(text) {
    const done = () => showToast('已复制：' + text);
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { showToast('复制失败'); }
        ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else fallback();
}
function openMolangHelp() {
    if (document.getElementById('molangHelpModal')) return; // 防止重复打开
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const qHtml = MOLANG_QUERY_FUNCS.map(f => `
      <div class="mh-fn">
        <div class="mh-fn-top">
          <span class="mh-name q">${esc(f.name)}</span>
          <span class="mh-actions">
            <button type="button" class="mh-copy" data-copy="${esc(f.copy)}">📋 复制</button>
            ${f.reset ? `<button type="button" class="mh-reset" id="mhLifeResetBtn">（重置）</button>` : ''}
          </span>
        </div>
        <div class="mh-row"><span class="mh-k">参数：</span><b>${esc(f.params)}</b></div>
        <div class="mh-row"><span class="mh-k">作用：</span>${esc(f.desc)}</div>
        <div class="mh-row"><span class="mh-k">返回值：</span>${esc(f.ret)}</div>
      </div>`).join('');
    const mHtml = MOLANG_MATH_FUNCS.map(f => `
      <div class="mh-fn">
        <div class="mh-fn-top"><span class="mh-name">${esc(f.name)}</span><button type="button" class="mh-copy" data-copy="${esc(f.name)}">📋 复制</button></div>
        <div class="mh-row">${esc(f.desc)}</div>
      </div>`).join('');
    const m = document.createElement('div');
    m.className = 'molang-help-modal';
    m.id = 'molangHelpModal';
    m.innerHTML = `
      <div class="mh-box">
        <div class="mh-head"><h2>📘 molang 函数帮助</h2><button type="button" class="mh-close" id="mhCloseBtn" title="关闭">✕</button></div>
        <div class="mh-body">
          <div class="mh-sec-title q">🔍 查询函数（q.）</div>
          ${qHtml}
          <div class="mh-sec-title">🧮 数学函数（math.）</div>
          ${mHtml}
          <div class="mh-foot">学习 molang？QQ1057514348</div>
        </div>
      </div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.addEventListener('click', (e) => { if (e.target === m) close(); }); // 点击遮罩关闭
    m.querySelector('#mhCloseBtn').addEventListener('click', close);
    m.querySelectorAll('.mh-copy').forEach(b => b.addEventListener('click', () => mhCopy(b.dataset.copy)));
    const lifeResetBtn = m.querySelector('#mhLifeResetBtn');
    if (lifeResetBtn) lifeResetBtn.addEventListener('click', () => resetLifeTime());
}

// ========== molang 自动补全（在 v./variable./t./temp./q./math. 后弹出候选） ==========
// 电脑端 Tab 补全（保持泡泡不关闭）；点击候选项补全并关闭；↑↓ 选择；Esc 关闭。
// 输入过程中动态过滤：math 显示全部数学函数，math.s 只显示 sqrt/sin 等。
let acEl = null, acItems = [], acIndex = 0, acBlock = null, acSuppress = false;

// textarea 光标像素坐标（镜像法，用于把泡泡放在光标上方）
function getCaretCoordinates(el, position) {
    const div = document.createElement('div');
    const style = getComputedStyle(el);
    const props = ['boxSizing', 'width', 'height', 'overflowX', 'overflowY',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
        'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
        'letterSpacing', 'wordSpacing', 'tabSize', 'whiteSpace', 'wordWrap'];
    props.forEach(p => { try { div.style[p] = style[p]; } catch (e) {} });
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.textContent = el.value.substring(0, position);
    const span = document.createElement('span');
    span.textContent = el.value.substring(position) || '.';
    div.appendChild(span);
    document.body.appendChild(div);
    const coords = {
        top: span.offsetTop + (parseInt(style.borderTopWidth, 10) || 0),
        left: span.offsetLeft + (parseInt(style.borderLeftWidth, 10) || 0),
        height: parseInt(style.lineHeight, 10) || parseInt(style.fontSize, 10) || 16
    };
    document.body.removeChild(div);
    return coords;
}

function acEnsureEl() {
    if (acEl) return acEl;
    acEl = document.createElement('div');
    acEl.id = 'molangAutocomplete';
    // 点击候选项：阻止默认（保留 textarea 焦点、避免 blur），补全并关闭
    acEl.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.ac-item');
        if (!item || !acItems.length) return;
        e.preventDefault();
        const idx = parseInt(item.dataset.idx, 10);
        acApply(acItems[idx], true);
    });
    // 点击泡泡之外：关闭（点到 textarea 本身不关，便于继续输入）
    document.addEventListener('mousedown', (e) => {
        if (acEl && acEl.style.display !== 'none' && !acEl.contains(e.target)) {
            const ta = document.getElementById('molangTextarea');
            if (e.target !== ta) acHide();
        }
    });
    document.body.appendChild(acEl);
    return acEl;
}

function acHide() {
    if (acEl) acEl.style.display = 'none';
    acItems = []; acIndex = 0;
}

// 依据光标前的 token 计算候选列表（含每个候选项的替换区间与插入文本）
function acBuildCandidates(ta, block) {
    const caret = ta.selectionStart;
    const before = ta.value.slice(0, caret);
    // 向后扫描标识符字符（含 . 与 _）
    let start = caret;
    while (start > 0) {
        const ch = before[start - 1];
        if (/[A-Za-z0-9_.]/.test(ch)) start--; else break;
    }
    const token = before.slice(start, caret);
    if (!token) return null;
    let base, rest, hasDot;
    const dotIdx = token.indexOf('.');
    if (dotIdx >= 0) { base = token.slice(0, dotIdx); rest = token.slice(dotIdx + 1); hasDot = true; }
    else { base = token; rest = ''; hasDot = false; }
    const lb = base.toLowerCase();
    const filter = rest.toLowerCase();
    const matchName = (n) => n.toLowerCase().startsWith(filter);
    const list = [];
    if (lb === 'v' || lb === 'variable') {
        for (const k of block.scope.vars.keys()) {
            const bare = k.startsWith('v.') ? k.slice(2) : k;
            if (matchName(bare)) list.push({ kind: 'var', bare, ns: lb === 'variable' ? 'variable.' : 'v.' });
        }
    } else if (lb === 't' || lb === 'temp') {
        for (const k of globalVars.keys()) {
            if (matchName(k)) list.push({ kind: 'var', bare: k, ns: lb === 'temp' ? 'temp.' : 't.' });
        }
    } else if (lb === 'q') {
        for (const f of MOLANG_QUERY_FUNCS) {
            const p = f.name.indexOf('(');
            const fn = p >= 0 ? f.name.slice(2, p) : f.name.slice(2);
            if (matchName(fn)) list.push({ kind: 'func', bare: fn, display: f.name, ns: 'q.', paren: p >= 0 });
        }
    } else if (lb === 'math') {
        for (const f of MOLANG_MATH_FUNCS) {
            const p = f.name.indexOf('(');
            const fn = p >= 0 ? f.name.slice(5, p) : f.name.slice(5).split(/\s+/)[0];
            if (matchName(fn)) list.push({ kind: 'func', bare: fn, display: f.name, ns: 'math.', paren: p >= 0 });
        }
    } else {
        return null;
    }
    if (!list.length) return null;
    return list.map((it) => {
        let replaceStart, insertText, label, tag, tagCls;
        if (it.kind === 'var') {
            if (hasDot) { replaceStart = start + base.length + 1; insertText = it.bare; }
            else { replaceStart = start; insertText = it.ns + it.bare; }
            label = it.ns + it.bare; tag = '变量'; tagCls = 'var';
        } else {
            if (hasDot) { replaceStart = start + base.length + 1; insertText = it.paren ? it.bare + '(' : it.bare; }
            else { replaceStart = start; insertText = it.paren ? it.ns + it.bare + '(' : it.ns + it.bare; }
            label = it.display; tag = it.ns === 'q.' ? '查询' : '函数'; tagCls = it.ns === 'q.' ? 'q' : 'func';
        }
        return { replaceStart, replaceEnd: caret, insertText, label, tag, tagCls };
    });
}

function acRender(items) {
    const el = acEnsureEl();
    if (acIndex >= items.length) acIndex = items.length - 1;
    if (acIndex < 0) acIndex = 0;
    el.innerHTML = '';
    items.forEach((it, i) => {
        const d = document.createElement('div');
        d.className = 'ac-item' + (i === acIndex ? ' active' : '');
        d.dataset.idx = i;
        d.innerHTML = `<span class="ac-name">${escapeHtml(it.label)}</span><span class="ac-tag ${it.tagCls}">${it.tag}</span>`;
        el.appendChild(d);
    });
    const hint = document.createElement('div');
    hint.className = 'ac-hint';
    hint.textContent = '↑↓ 选择 · Tab 补全（保持打开）· 点击选择（关闭）· Esc 关闭';
    el.appendChild(hint);
    el.style.display = 'block';
    const active = el.querySelector('.ac-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
}

function acPosition(ta) {
    if (!acEl || acEl.style.display === 'none') return;
    const c = getCaretCoordinates(ta, ta.selectionStart);
    const tr = ta.getBoundingClientRect();
    const pw = acEl.offsetWidth, ph = acEl.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = tr.left + c.left - ta.scrollLeft;
    let top = tr.top + c.top - ta.scrollTop - ph - 8;
    if (left + pw > vw - 8) left = vw - pw - 8;
    if (left < 8) left = 8;
    if (top < 8) {
        top = tr.top + c.top - ta.scrollTop + c.height + 8;
        if (top + ph > vh - 8) top = vh - ph - 8;
    }
    acEl.style.left = left + 'px';
    acEl.style.top = top + 'px';
}

function acUpdate(ta, block) {
    acBlock = block;
    const items = acBuildCandidates(ta, block);
    if (!items) { acHide(); return; }
    acItems = items;
    acIndex = 0;
    acRender(items);
    acPosition(ta);
}

function acApply(item, closeAfter) {
    const ta = document.getElementById('molangTextarea');
    if (!ta || !item) return;
    const val = ta.value;
    ta.value = val.slice(0, item.replaceStart) + item.insertText + val.slice(item.replaceEnd);
    const caret = item.replaceStart + item.insertText.length;
    ta.setSelectionRange(caret, caret);
    if (closeAfter) acSuppress = true; // 阻止后续 input 事件重新弹出
    ta.dispatchEvent(new Event('input'));
    if (closeAfter) { acSuppress = false; acHide(); }
    // Tab 路径（closeAfter=false）：上面的 input 事件触发 acUpdate 重新渲染并保持打开
}


// ========== molang 数字常量：单击弹出自增/自减泡泡（含"常显"固定泡泡） ==========
// 触发：在 molang 文本框单击任意数字常量 → 在其【上方】弹出微调泡泡（点外部自动关闭）。
// 泡泡可一键"📌 常显"固定为浮动控件：显示 变量名 + 方块名、可拖动、层级最高；
// 变量被删 / 方块被删 / 手动关闭 时泡泡炸开消失。步长可自定义（输入框 + 0.1/1/10 快捷）。
let mnbEl = null, mnbState = null, mnbDocBound = false;
const pinnedBubbles = [];   // {id, block, varName, el, left, top, step}
let mnbIdSeq = 1;
function fmtLit(v) {
    if (v === 0) return '0';
    const r = Math.round(v * 1e6) / 1e6;
    return String(r === 0 ? 0 : r);   // 避免 -0
}
// 扫描文本里的数字字面量（含一元负号），返回 {start, end, value}（下标基于原文）
function scanNumberTokens(text) {
    const out = [];
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        const isDig = c >= '0' && c <= '9';
        if (isDig || (c === '.' && text[i + 1] >= '0' && text[i + 1] <= '9')) {
            let j = i + 1;
            while (j < text.length && ((text[j] >= '0' && text[j] <= '9') || text[j] === '.')) j++;
            let start = i;
            let value = parseFloat(text.slice(i, j));
            if (start > 0 && text[start - 1] === '-') {
                const p = text[start - 2];
                const unary = (p === undefined) || /[\s+\-*/()<>=!&|?:;.,]/.test(p);
                if (unary) { start -= 1; value = -value; }
            }
            out.push({ start, end: j, value });
            i = j;
        } else { i++; }
    }
    return out;
}
function findNumberAt(text, pos) {
    for (const t of scanNumberTokens(text)) {
        if (pos >= t.start && pos <= t.end) return t;
    }
    return null;
}
// 找到 token 左侧、同一语句内最近被赋值的变量名（如 v.xrot 或 t.xxx）；找不到返回 null。
// 若该赋值的右侧到被点数字之间包含函数调用/条件表达式（如 v.zrot=math.random(0,360)），
// 则该数字不是变量的"直接字面量"，不归属（避免把 360 误判为 v.zrot 的值）。
function findVarForToken(text, token) {
    let s = token.start;
    while (s > 0 && text[s - 1] !== ';') s--;
    const seg = text.slice(s, token.start);
    const re = /([A-Za-z_][\w.]*)\s*=(?!=)/g;
    let m, last = null, lastIdx = -1, lastLen = 0;
    while ((m = re.exec(seg)) !== null) { last = m[1]; lastIdx = m.index; lastLen = m[0].length; }
    if (!last) return null;
    const between = seg.slice(lastIdx + lastLen);
    if (/[()?:]/.test(between)) return null;
    return last;
}
// 按变量名定位其赋值后的第一个数字 token（绝对下标）；找不到返回 null（变量可能已被删）
function findVarNumberToken(text, varName) {
    if (!varName) return null;
    const esc = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc + '\\s*=(?!=)', 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
        const after = text.slice(m.index + m[0].length);
        const toks = scanNumberTokens(after);
        if (toks.length) {
            const t = toks[0];
            return { start: m.index + m[0].length + t.start, end: m.index + m[0].length + t.end, value: t.value };
        }
    }
    return null;
}
function mnbGetProgramText(block) {
    const ta = document.getElementById('molangTextarea');
    if (ta && ta.dataset.blockId === String(block.id)) return ta.value;
    return block.scope.program || '';
}
function mnbSetProgramText(block, text) {
    const ta = document.getElementById('molangTextarea');
    if (ta && ta.dataset.blockId === String(block.id)) ta.value = text;
    block.scope.program = text;
}
// 把新数值写回程序文本并重算 3D / 刷新只读数值 /（延迟）记录撤销；同步原地 token 位置
function mnbWriteValue(block, token, newVal, silent) {
    let text = mnbGetProgramText(block);
    const lit = fmtLit(newVal);
    text = text.slice(0, token.start) + lit + text.slice(token.end);
    mnbSetProgramText(block, text);
    token.end = token.start + lit.length;
    token.value = newVal;
    const ta = document.getElementById('molangTextarea');
    // 连续/拖拽模式（silent）不重建编辑器，避免高频刷新卡顿；只读数值仍由 updateMolangValueDisplay 轻量同步
    if (ta && ta.dataset.blockId === String(block.id) && !silent) refreshMolangEditor(block);
    block.refresh();
    cascadeAfterProgramChange(block); // 泡泡改的若是父块广播段里的数值，子块同帧跟随
    if (typeof updateMolangValueDisplay === 'function') updateMolangValueDisplay(block);
    mnbScheduleRecord();
}
let mnbRecordTimer = null;
function mnbScheduleRecord() {
    if (mnbRecordTimer) clearTimeout(mnbRecordTimer);
    mnbRecordTimer = setTimeout(() => { mnbRecordTimer = null; recordAction(); }, 400);
}
// 关闭瞬时泡泡（并固化最近一次调整手势的撤销记录）
function mnbHide() {
    if (mnbEl) { mnbEl.remove(); mnbEl = null; }
    mnbState = null;
    if (mnbRecordTimer) { clearTimeout(mnbRecordTimer); mnbRecordTimer = null; recordAction(); }
}
// 炸开并移除一个常显泡泡（带消失动画）
function burstRemovePinned(entry) {
    const el = entry.el;
    if (!el || el.classList.contains('mnb-burst')) return;
    const idx = pinnedBubbles.findIndex(p => p.el === el);
    if (idx >= 0) pinnedBubbles.splice(idx, 1);
    el.classList.add('mnb-burst');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => { if (el.parentNode) el.remove(); }, 420);   // 兜底
}
// 方块被删除时，移除它名下的所有泡泡（瞬时 + 常显）
function removeBubblesForBlock(block) {
    if (mnbState && mnbState.block === block) mnbHide();
    for (let i = pinnedBubbles.length - 1; i >= 0; i--) {
        if (pinnedBubbles[i].block === block) burstRemovePinned(pinnedBubbles[i]);
    }
}
// 手动编辑文本后，同步常显泡泡的显示 / 清理已删除变量的泡泡
function refreshPinnedBubbles(block) {
    for (let i = pinnedBubbles.length - 1; i >= 0; i--) {
        const p = pinnedBubbles[i];
        if (p.block !== block) continue;
        const tok = findVarNumberToken(block.scope.program || '', p.varName);
        if (!tok) { burstRemovePinned(p); continue; }
        const valEl = p.el.querySelector('.mnb-val');
        if (valEl) { valEl.textContent = fmtLit(tok.value); fitMnbVal(valEl); }
    }
}
// 让数值文本根据长度自适应字号，避免超大 / 超小数值在框内被截断
function fitMnbVal(valEl) {
    if (!valEl) return;
    const len = valEl.textContent.length;
    let fs = 18;
    if (len > 12) fs = 10; else if (len > 8) fs = 11; else if (len > 5) fs = 14;
    valEl.style.fontSize = fs + 'px';
}
// 构建泡泡 DOM（transient 与 pinned 共用）。ctx = {block, varName, token, pinned, anchorX, anchorY, left, top, step}
function buildMolangBubble(ctx) {
    const el = document.createElement('div');
    el.className = 'molang-num-bubble' + (ctx.pinned ? ' pinned' : '');
    const blockName = (ctx.block && ctx.block.id != null) ? String(ctx.block.id) : '方块';
    const showPin = !!ctx.varName;
    el.innerHTML = `
      <div class="mnb-head">
        <i class="mnb-diamond" aria-hidden="true"></i>
        <span class="mnb-var" title="${ctx.varName || ''}">${ctx.varName || '数值'}</span>
        <span class="mnb-block" title="${escapeHtml(blockName)}">🧊 ${escapeHtml(blockName)}</span>
        ${showPin ? '<button class="mnb-ico mnb-pin' + (ctx.pinned ? ' active' : '') + '" data-act="pin" title="常显 / 固定（可拖动）">📌</button>' : ''}
        <button class="mnb-ico mnb-close" data-act="close" title="关闭">✕</button>
      </div>
      <div class="mnb-body">
        <div class="mnb-stepper" title="增大 / 减小（按步长）">
          <span data-act="inc" title="增大">▲</span>
          <span data-act="dec" title="减小">▼</span>
        </div>
        <div class="mnb-val">${fmtLit(ctx.token.value)}</div>
      </div>
      <div class="mnb-foot">
        <label class="mnb-stepwrap">步长<input class="mnb-stepinput" type="number" value="${ctx.step}" step="0.1" min="0" /></label>
        <div class="mnb-quickrow">
          <button class="mnb-q" data-act="q001">0.01</button>
          <button class="mnb-q" data-act="q01">0.1</button>
          <button class="mnb-q" data-act="q1">1</button>
          <button class="mnb-q" data-act="q10">10</button>
        </div>
      </div>
      <div class="mnb-hint">${ctx.pinned ? '拖动标题栏移动 · 点 ✕ 关闭' : '▲/▼ 或滚轮/↑↓ 微调 · 手机可长按 ▲/▼ 连续增减或拖动数值 · 点外部关闭 · 点 📌 常显'}</div>`;
    document.body.appendChild(el);
    ctx.el = el;
    fitMnbVal(el.querySelector('.mnb-val'));   // 数值自适应字号（防超大/超小数值截断）
    // 定位（瞬时：点击点上方；常显：沿用记录位置或初始锚点）
    const bw = el.offsetWidth || 214, bh = el.offsetHeight || 150;
    let left, top;
    if (ctx.pinned && ctx.left != null) { left = ctx.left; top = ctx.top; }
    else {
        left = Math.max(8, Math.min(window.innerWidth - bw - 8, ctx.anchorX - bw / 2));
        top = ctx.anchorY - bh - 16;                 // 显示在数值上方
        if (top < 8) top = ctx.anchorY + 22;          // 上方空间不足则放到下方
    }
    left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
    top = Math.max(8, Math.min(window.innerHeight - bh - 8, top));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    if (ctx.pinned) { ctx.left = left; ctx.top = top; }
    // 步长：输入框 + 快捷按钮（以输入框为准）
    const stepInput = el.querySelector('.mnb-stepinput');
    const getStep = () => { let v = parseFloat(stepInput.value); if (!isFinite(v) || v <= 0) v = 1; return v; };
    const syncQuick = () => {
        const v = parseFloat(stepInput.value);
        el.querySelectorAll('.mnb-q').forEach(x => {
            const map = { q001: 0.01, q01: 0.1, q1: 1, q10: 10 };
            x.classList.toggle('active', Math.abs(map[x.dataset.act] - v) < 1e-9);
        });
    };
    el.querySelectorAll('.mnb-q').forEach(b => {
        b.addEventListener('click', () => { stepInput.value = { q001: 0.01, q01: 0.1, q1: 1, q10: 10 }[b.dataset.act]; syncQuick(); });
    });
    stepInput.addEventListener('input', syncQuick);
    // 增量应用（统一入口）。silent=true 表示连续/拖拽模式，不重建编辑器防卡顿
    const applyStep = (dir, silent) => {
        const step = getStep();
        if (ctx.pinned) {
            const tok = findVarNumberToken(mnbGetProgramText(ctx.block), ctx.varName);
            if (!tok) { burstRemovePinned(ctx); return; }
            ctx.token = tok;
        }
        mnbWriteValue(ctx.block, ctx.token, ctx.token.value + dir * step, !!silent);
        const valEl = el.querySelector('.mnb-val');
        if (valEl) { valEl.textContent = fmtLit(ctx.token.value); fitMnbVal(valEl); }
    };
    // 手机端友好：▲/▼ 短按=单步，长按=连续增减（约 55ms/步，按住 >800ms 加速到 ~15ms/步）
    const bindStepperHold = (btn, dir) => {
        if (!btn) return;
        let holdTimer = null, accTimer = null, t0 = 0;
        const stop = () => {
            if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
            if (accTimer) { clearTimeout(accTimer); accTimer = null; }
        };
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { btn.setPointerCapture(e.pointerId); } catch (_) {}
            t0 = Date.now();
            applyStep(dir, false);                 // 短按：立即单步（并同步编辑器）
            holdTimer = setTimeout(() => {
                const tick = () => {
                    applyStep(dir, true);          // 连续：不重建编辑器
                    const held = Date.now() - t0;
                    accTimer = setTimeout(tick, held > 800 ? 15 : 55);
                };
                tick();
            }, 320);
        });
        const end = (e) => { try { btn.releasePointerCapture(e.pointerId); } catch (_) {} stop(); };
        btn.addEventListener('pointerup', end);
        btn.addEventListener('pointercancel', end);
        btn.addEventListener('pointerleave', end);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());   // 屏蔽移动端长按复制菜单
    };
    bindStepperHold(el.querySelector('[data-act="inc"]'), +1);
    bindStepperHold(el.querySelector('[data-act="dec"]'), -1);
    // 手机端友好：在数值区上下拖动连续增减（每约 4px 一个步长）
    const valDragEl = el.querySelector('.mnb-val');
    if (valDragEl) {
        let dragging = false, lastY = 0, accum = 0;
        valDragEl.style.cursor = 'ns-resize';
        valDragEl.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { valDragEl.setPointerCapture(e.pointerId); } catch (_) {}
            dragging = true; lastY = e.clientY; accum = 0;
        });
        valDragEl.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dy = lastY - e.clientY; lastY = e.clientY; accum += dy;
            const sens = 4;
            while (accum >= sens) { applyStep(+1, true); accum -= sens; }
            while (accum <= -sens) { applyStep(-1, true); accum -= sens; }
        });
        const endDrag = (e) => { dragging = false; try { valDragEl.releasePointerCapture(e.pointerId); } catch (_) {} };
        valDragEl.addEventListener('pointerup', endDrag);
        valDragEl.addEventListener('pointercancel', endDrag);
        valDragEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    el.querySelector('[data-act="close"]').addEventListener('click', () => {
        if (ctx.pinned) burstRemovePinned(ctx); else mnbHide();
    });
    el.addEventListener('mousedown', (e) => { e.stopPropagation(); });   // 防止触发外部关闭 / 文本框失焦
    el.addEventListener('wheel', (e) => { e.preventDefault(); applyStep(e.deltaY < 0 ? +1 : -1); }, { passive: false });
    // 固定 / 取消固定
    const pinBtn = el.querySelector('[data-act="pin"]');
    if (pinBtn) {
        pinBtn.addEventListener('click', () => {
            if (ctx.pinned) burstRemovePinned(ctx);
            else {
                const r = el.getBoundingClientRect();
                mnbHide();   // 关闭原瞬时泡泡（不炸开）
                const p = { id: mnbIdSeq++, block: ctx.block, varName: ctx.varName, el: null, left: r.left, top: r.top, step: ctx.step };
                pinnedBubbles.push(p);
                const newCtx = { block: p.block, varName: p.varName, token: ctx.token, pinned: true, left: r.left, top: r.top, step: p.step };
                buildMolangBubble(newCtx);
                p.el = newCtx.el;
            }
        });
    }
    // 常显模式：标题栏拖动（pointer 事件，兼容触屏）
    if (ctx.pinned) {
        const head = el.querySelector('.mnb-head');
        head.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.mnb-ico')) return;   // 按钮不触发拖动
            e.preventDefault();
            const r = el.getBoundingClientRect();
            const ox = e.clientX - r.left, oy = e.clientY - r.top;
            const pid = e.pointerId;
            el.classList.add('dragging');
            try { head.setPointerCapture(pid); } catch (_) {}   // 触屏：捕获指针，手指移出标题栏也继续跟手；捕获失败（指针已失效）不影响主流程
            const move = (ev) => {
                if (ev.pointerId !== pid) return;   // 只跟同一根手指，忽略多指
                let nl = ev.clientX - ox, nt = ev.clientY - oy;
                nl = Math.max(4, Math.min(window.innerWidth - r.width - 4, nl));
                nt = Math.max(4, Math.min(window.innerHeight - r.height - 4, nt));
                el.style.left = nl + 'px'; el.style.top = nt + 'px';
                ctx.left = nl; ctx.top = nt;
            };
            const up = () => {
                try { head.releasePointerCapture(pid); } catch (_) {}
                head.removeEventListener('pointermove', move);
                head.removeEventListener('pointerup', up);
                head.removeEventListener('pointercancel', up);
                el.classList.remove('dragging');
            };
            head.addEventListener('pointermove', move);
            head.addEventListener('pointerup', up);
            // pointercancel（系统手势/多指干扰打断指针流）也必须收尾，否则 move 监听一直挂着、泡泡卡住不动
            head.addEventListener('pointercancel', up);
        });
    }
    return el;
}
function mnbShow(block, token, clientX, clientY) {
    mnbHide();
    const varName = findVarForToken(block.scope.program || '', token);
    const ctx = { block, varName, token, pinned: false, anchorX: clientX, anchorY: clientY, step: 1 };
    buildMolangBubble(ctx);
    mnbEl = ctx.el;
    mnbState = ctx;
}

