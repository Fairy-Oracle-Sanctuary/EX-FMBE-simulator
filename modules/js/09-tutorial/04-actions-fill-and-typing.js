/* 09-tutorial/04-actions-fill-and-typing.js · 源 测试版v.6b79.html 第 50263-50812 行 */
'use strict';
// ---- 进入步骤时的「解除预置」注册表：系统的自动行为（拖入文件夹自动设骨干/绑四肢、上一步残留的笔刷/枢轴模式等）
// 会把本步要教的状态提前满足，导致门控“没做就放行”。disarm 在进入该步时先把这类状态复位，
// 让本步真正需要用户/演示去完成。全部走官方 API（clearFolderBackbone / unbindBone / 模式切换…），安全可控。 ----
const TUT_DISARM = {
    clearBackbone() { try { if (typeof clearFolderBackbone === 'function') clearFolderBackbone('小人'); } catch (e) {} },
    clearBind() {
        const f = (typeof getFolder === 'function') ? getFolder('小人') : null; if (!f) return;
        const rootId = f._backbone || null;
        blocks.filter(b => b.group === '小人' && b.id !== rootId).forEach(b => { if (b._boneParent) { try { unbindBone(b); } catch (e) {} } });
        try { renderSideBlockList(); } catch (e) {}
    },
    exitPivot() {
        herModes.delete('origin');
        // 必须保留一个「非 origin」模式：selectBlock 触发的 updateToolbar() 在「无 origin/base/rotate」时
        // 会兜底补回 origin，使本步门控误判为「已完成」。保留 rotate 即可让 updateToolbar 不再补 origin。
        if (!herModes.has('base') && !herModes.has('rotate') && !herModes.has('centerRotate') && !herModes.has('globalRotate') && !herModes.has('globalCenterRotate') && !herModes.has('scale')) herModes.add('rotate');
        document.querySelectorAll('.her-mode-btn').forEach(b => b.classList.toggle('active', herModes.has(b.dataset.mode)));
        try { rebuildGizmo(); } catch (e) {}
    },
    exitBrush() { try { if (typeof isBrushMode !== 'undefined' && isBrushMode) exitBrushMode(); } catch (e) {} },
    enterBrush() { try { if (typeof isBrushMode === 'undefined' || !isBrushMode) enterBrushMode(); } catch (e) {} },
};
function tutRunDisarm(st) {
    if (!st || !Array.isArray(st.disarm) || !st.disarm.length) return;
    st.disarm.forEach(name => { const fn = TUT_DISARM[name]; if (typeof fn === 'function') { try { fn(); } catch (e) { console.warn('tut disarm', name, e); } } });
}
// ==================== 打字动画（逐句弹出） ====================
// 一大段讲解直接铺开会「吓哭」用户：这里把 st.b 拆成小句，一次只弹一句（带逐字打印），
// 用户点空白页 / 点卡片外的暗区 → 弹出下一句；全部弹完后才放出「帮我做 / 下一步」两个按钮。
let tutTypeLines = [];        // 本卡拆好的小句
let tutTypePtr = -1;          // 当前已弹到第几句
let tutTypeDone = false;      // 是否全部弹完（弹完才亮出操作按钮）
let tutTypeTimer = null;      // 逐字打印定时器
let tutTypeAutoTimer = null;  // 「自动」播放定时器
let tutAutoPlay = false;      // 「自动」开关状态（跨步骤保持）
let tutTypeLinesEl = null;    // 句子容器（一次只放一句）
let tutTypeHintEl = null;     // 「点击空白处继续」提示
let tutTypePgEl = null;       // 提示条右侧的句子进度 x / n
const TUT_SENT_MAX = 120;     // 兜底切分上限：仅当文案没写 /// 时才用标点兜底切分，切完单句超 120 字再按逗号切

// ── 切句方式（2026-09-15 改版，改文案前必读）────────────────────────────
// 教程卡片「一句一弹」的断句**不再由标点符号决定**，改为作者在文案里手动标记：
//   在 EX_TUT_CHAPTERS 各步骤的 b 文案中，想在哪里换一张卡，就在那里写三个斜杠 ///
//   程序按 '///' 精确切分并丢弃标记本身；句中的句号/逗号等所有标点一律原样显示，不参与切分。
// 这样做的原因：
//   1. 断句位置完全可控——可以在句号处换卡，也可以在长句中间任意位置换卡；
//   2. molang 代码示例里的半角 ; ? : 不会再被误当成切分点（旧逻辑会切碎代码句）。
// 兜底：若某段文案忘了写 ///，才退回旧标点逻辑（按 。！？!?；; 切，超 TUT_SENT_MAX 再按 ，,、：: 切），
//       防止漏标导致整段挤成一张卡。新写的文案请一律用 ///。
// ─────────────────────────────────────────────────────────────────────
function tutSplitSentences(text) {
    const src = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!src) return [];
    // 主路径：按作者标记 /// 切分（标记只作断句用，不显示）
    if (src.indexOf('///') >= 0) return src.split('///').map(s => s.trim()).filter(Boolean);
    // 兜底路径：没写 /// 的文案按句末标点切，超长句再按逗号/顿号贪心切
    const out = [];
    src.split(/(?<=[。！？!?；;])/).map(s => s.trim()).filter(Boolean).forEach(seg => {
        if (seg.length <= TUT_SENT_MAX) { out.push(seg); return; }
        let buf = '';
        seg.split(/(?<=[，,、：:])/).forEach(part => {
            if (buf && (buf + part).length > TUT_SENT_MAX) { out.push(buf); buf = part; }
            else buf += part;
        });
        if (buf.trim()) out.push(buf.trim());
    });
    return out.length ? out : [src];
}
// 取「当前卡片」的实时句子容器：打字写入一律以它为准，不要信任缓存的 tutTypeLinesEl。
// 缓存引用一旦指向已脱离 DOM 的旧节点（上一张卡片被 remove 后仍被持有），就会把正文写进看不见的
// 节点 → 卡片正文空白、点卡片「毫无反应」、提示条永远停在「点击卡片继续」，即用户报的「教程卡死」。
function tutLiveLinesEl() {
    try {
        const c = document.querySelector('#exTutRoot .ex-tut-card');
        const el = c && c.querySelector('.ex-tut-lines');
        if (el) tutTypeLinesEl = el;
        return el || tutTypeLinesEl;
    } catch (e) { return tutTypeLinesEl; }
}
// 同理：提示条 / 进度条也以当前卡片的实时节点为准（缓存失效会让提示条一直挂着不下去）
function tutLiveHintEl() {
    try {
        const h = document.querySelector('#exTutRoot .ex-tut-hint');
        if (h) { tutTypeHintEl = h; tutTypePgEl = h.querySelector('.pg') || tutTypePgEl; }
    } catch (e) {}
    return tutTypeHintEl;
}
function tutTypeStop() {
    if (tutTypeTimer) { clearInterval(tutTypeTimer); tutTypeTimer = null; }
    if (tutTypeAutoTimer) { clearTimeout(tutTypeAutoTimer); tutTypeAutoTimer = null; }
}
// 「自动」开着时，一句打完后等一小会儿自动弹下一句（用户就不必点空白处了）
function tutTypeArmAuto() {
    if (tutTypeAutoTimer) { clearTimeout(tutTypeAutoTimer); tutTypeAutoTimer = null; }
    if (!tutAutoPlay || tutTypeDone || !tutActive) return;
    tutTypeAutoTimer = setTimeout(() => { tutTypeAutoTimer = null; if (tutAutoPlay && !tutTypeDone && tutActive) tutTypeNext(); }, 760);
}
// 弹下一句：正在逐字打印 → 先把本句一次性补完；否则显示下一句
function tutTypeNext() {
    if (tutTypeDone) return;
    const el = tutLiveLinesEl(); if (!el) return;
    const cur = el.querySelector('.ex-tut-line.typing');
    if (cur) {
        if (tutTypeTimer) { clearInterval(tutTypeTimer); tutTypeTimer = null; }
        const txt = cur.querySelector('span');
        if (txt) txt.textContent = tutTypeLines[tutTypePtr] || '';
        const caret = cur.querySelector('.ex-tut-caret');
        if (caret && caret.parentNode) caret.parentNode.removeChild(caret);
        cur.classList.remove('typing');
        if (tutTypePtr >= tutTypeLines.length - 1) tutTypeComplete();
        else tutTypeArmAuto();
        return;
    }
    tutTypePrintNext();
}
function tutTypePrintNext() {
    const el = tutLiveLinesEl(); if (!el) return;
    tutTypePtr++;
    if (tutTypePtr >= tutTypeLines.length) { tutTypeComplete(); return; }
    const full = tutTypeLines[tutTypePtr];
    // 一次只留一句：换句时清掉上一句，绝不堆成一大片文字
    el.innerHTML = '';
    const line = document.createElement('div'); line.className = 'ex-tut-line typing';
    const txt = document.createElement('span'); line.appendChild(txt);
    const caret = document.createElement('i'); caret.className = 'ex-tut-caret'; line.appendChild(caret);
    el.appendChild(line);
    tutTypeSyncPg();
    let i = 0;
    // 长句每次多打几个字，保证每句整体节奏差不多（都在 ~0.6s 内打完）
    const stepN = Math.max(1, Math.round(full.length / 26));
    tutTypeTimer = setInterval(() => {
        i += stepN;
        txt.textContent = full.slice(0, i);
        // 打字配音：每 tick 一声（55ms 节流 + 随机音高抖动）；最后一 tick 不响，避免收尾多一声
        if (i < full.length) { try { exTutSfxType(); } catch (e) {} }
        if (i >= full.length) {
            if (tutTypeTimer) { clearInterval(tutTypeTimer); tutTypeTimer = null; }
            txt.textContent = full;
            line.classList.remove('typing');
            if (caret.parentNode) caret.parentNode.removeChild(caret);
            if (tutTypePtr >= tutTypeLines.length - 1) tutTypeComplete();
            else tutTypeArmAuto();
        }
    }, 22);
}
// 提示条右侧的进度：第 x / n 句
function tutTypeSyncPg() {
    try { const h = document.querySelector('#exTutRoot .ex-tut-hint'); if (h) { const p = h.querySelector('.pg'); if (p) tutTypePgEl = p; } } catch (e) {}
    if (!tutTypePgEl) return;
    tutTypePgEl.textContent = (tutTypePtr >= 0 && tutTypeLines.length)
        ? `${Math.min(tutTypePtr + 1, tutTypeLines.length)} / ${tutTypeLines.length}` : '';
}
function tutTypeComplete() {
    tutTypeDone = true;
    tutTypeStop();
    const el = tutLiveLinesEl();
    if (el) el.querySelectorAll('.ex-tut-line.typing').forEach(n => n.classList.remove('typing'));
    // 提示条也取当前卡片的实时节点：缓存引用若失效，提示条会永远停在「点击卡片继续」不下去（正是用户截图症状）
    tutLiveHintEl();
    if (tutTypeHintEl) tutTypeHintEl.style.display = 'none';
    tutTypeRevealActions();
}
// 全部句子弹完 → 放出「帮我做」「下一步」与状态条
function tutTypeRevealActions() {
    const root = document.getElementById('exTutRoot'); if (!root) return;
    const card = root.querySelector('.ex-tut-card'); if (!card) return;
    const demo = card.querySelector('.tut-demo');
    const next = card.querySelector('.tut-next');
    const stbar = card.querySelector('.ex-tut-status');
    if (demo) demo.style.display = demo.dataset.hasact === '1' ? '' : 'none';
    if (next) next.style.display = '';
    if (stbar) stbar.style.display = '';
    try { tutApplyUI(); } catch (e) {}
    try { tutLayout(); } catch (e) {}
}
function tutTypeBegin(st) {
    tutTypeStop();
    // 防呆：若本卡片容器已脱离 DOM（上一张卡片被移除、tutTypeLinesEl 仍指向旧节点），
    // 重新绑定到「当前卡片」的 .ex-tut-lines，避免正文被写入失效节点导致卡片空白、点击无反应。
    try {
        const _card = document.querySelector('#exTutRoot .ex-tut-card');
        const _lines = _card && _card.querySelector('.ex-tut-lines');
        if (_lines && _lines !== tutTypeLinesEl) tutTypeLinesEl = _lines;
    } catch (e) {}
    tutTypeLines = tutSplitSentences(st && st.b);
    tutTypePtr = -1;
    tutTypeDone = tutTypeLines.length === 0;
    if (tutTypeDone) { tutTypeRevealActions(); return; }
    tutTypePrintNext();
}
// 「点击空白页」= 点防护层（非聚光目标 / 非画布 / 非卡片的暗区）→ 弹下一句
function tutTypeOnBlankClick() {
    if (!tutActive) return;
    // 冒泡已被阻断（见 tutUpdateGuard 的防护层监听），这里自行补上「点外部关下拉菜单」的行为
    try {
        if (typeof activeTopDropdown !== 'undefined' && activeTopDropdown) { closeAllTopDropdowns(); return; }
    } catch (e) {}
    if (tutTypeDone) return;
    tutTypeNext();
}
// ---- 低多边形装饰：由「正三角形」互相拼接 / 叠压组成（同色系不同明度），卡片的左上与右下各一组 ----
// 梯形网格：行高 = side·√3/2（正三角形的高），每行水平错开 side/2，交替生成「正三角 + 倒三角」。
// mode='tl' 时向右侧渐隐（融进标题栏），mode='br' 时向对角线方向渐隐（贴住右下角）。
const TUT_FAN_TINT = ['#dbe7f5', '#cbdbee', '#e7f0fa', '#d3e1f2', '#eaf2fb', '#c6d8ec', '#dee9f6', '#f0f6fd'];
function tutTriDeco(w, h, side, mode) {
    const r3 = Math.sqrt(3) / 2, hh = side * r3;
    const rows = Math.ceil(h / hh) + 1, cols = Math.ceil(w / side) + 2;
    let s = '', k = 0;
    for (let r = 0; r < rows; r++) {
        const y = r * hh;
        for (let c = -1; c < cols; c++) {
            const x = c * side + (r % 2 ? side / 2 : 0);
            const cx = x + side * 0.5, cy = y + hh * 0.5;
            if (cx < -side || cy < -hh || cx > w + side || cy > h + hh) continue;
            let t = (mode === 'br') ? ((cx / w) * 0.5 + (cy / h) * 0.5) : (1 - cx / (w * 0.95));
            t = Math.max(0, Math.min(1, t));
            const op = (0.12 + 0.88 * t).toFixed(2);
            // 正三角（尖朝上）
            s += '<polygon points="' + [x, y + hh, x + side, y + hh, (x + side / 2).toFixed(1), y.toFixed(1)].join(' ') +
                 '" fill="' + TUT_FAN_TINT[k % TUT_FAN_TINT.length] + '" opacity="' + op + '"/>';
            // 倒三角（与右侧相邻格拼接成同一行）
            s += '<polygon points="' + [(x + side / 2).toFixed(1), y.toFixed(1), (x + side * 1.5).toFixed(1), y.toFixed(1), x + side, y + hh].join(' ') +
                 '" fill="' + TUT_FAN_TINT[(k + 3) % TUT_FAN_TINT.length] + '" opacity="' + op + '"/>';
            k++;
        }
    }
    return s;
}
// ---- 「菜单」按下：先弹两枚小按钮（☰ 看对话列表 / » 双箭头跳过本目），不再直接开记录（2026-10-12 用户设计稿）----
function tutCloseMenuPop() {
    const p = document.getElementById('exTutMenuPop'); if (p) p.remove();
    if (window.__tutMenuPopKey) { document.removeEventListener('keydown', window.__tutMenuPopKey, true); window.__tutMenuPopKey = null; }
    if (window.__tutMenuPopDoc) { document.removeEventListener('pointerdown', window.__tutMenuPopDoc, true); window.__tutMenuPopDoc = null; }
}
function tutOpenMenuPop(anchorBtn) {
    if (document.getElementById('exTutMenuPop')) { tutCloseMenuPop(); return; }
    const root = document.getElementById('exTutRoot'); if (!root) return;
    const pop = document.createElement('div'); pop.className = 'ex-tut-menu-pop'; pop.id = 'exTutMenuPop';
    const mk = (cls, inner, title, fn) => {
        const b = document.createElement('button'); b.type = 'button';
        b.className = 'ex-tut-mbtn' + (cls ? ' ' + cls : ''); b.title = title;
        const s = document.createElement('span'); s.innerHTML = inner; b.appendChild(s);
        b.addEventListener('click', (e) => { e.stopPropagation(); tutCloseMenuPop(); try { fn(); } catch (err) { console.warn('tutMenuPop', err); } });
        return b;
    };
    pop.appendChild(mk('log', '<i class="bars"><i></i><i></i><i></i></i>', '查看对话列表', () => tutOpenLogPanel()));
    pop.appendChild(mk('skip', '<i class="gt"><b></b><b></b></i>', '跳过本目教程', () => tutSkipSection()));
    root.appendChild(pop);   // 挂 root 内：继承 --tut-ui、位于防护层(2147482000)与卡片(z20)之上
    // 定位：贴在「菜单」按钮正下方、右对齐；下方不够则翻到上方
    const r = anchorBtn.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = r.right - w; if (left < 8) left = 8;
    if (left + w > innerWidth - 8) left = innerWidth - 8 - w;
    let top = r.bottom + 8;
    if (top + h > innerHeight - 8) top = r.top - h - 8;
    if (top < 8) top = 8;
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    // 点外面收起（捕获阶段；点「菜单」本身交给按钮 click 的 toggle，不在此处拦）
    const onDoc = (e) => { if (!pop.contains(e.target) && !anchorBtn.contains(e.target)) tutCloseMenuPop(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tutCloseMenuPop(); } };
    window.__tutMenuPopDoc = onDoc; window.__tutMenuPopKey = onKey;
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    try { tutUpdateGuard(); } catch (e) {}
}
// ---- 「菜单」= 记录面板（按用户设计稿）：大章节标题条 → 本卡片标题条 → 逐句白色对话气泡 ----
function tutCloseLogPanel() {
    const ov = document.getElementById('exTutLog'); if (ov) ov.remove();
    if (window.__tutMenuKey) { document.removeEventListener('keydown', window.__tutMenuKey, true); window.__tutMenuKey = null; }
    try { if (tutActive) tutUpdateGuard(); } catch (e) {}
}
function tutOpenLogPanel() {
    if (document.getElementById('exTutLog')) { tutCloseLogPanel(); return; }
    const ch = EX_TUT_CHAPTERS[tutChapter]; if (!ch) return;
    const st = ch.steps[tutStep];
    const ov = document.createElement('div'); ov.className = 'ex-tut-log-ov'; ov.id = 'exTutLog';
    ov.addEventListener('click', (e) => { if (e.target === ov) tutCloseLogPanel(); });
    const panel = document.createElement('div'); panel.className = 'ex-tut-log';
    // 标题栏：左侧低多边形装饰 + 居中「记录」+ 黄色下划线 + 右侧关闭
    const head = document.createElement('div'); head.className = 'ex-tut-log-head';
    const decoTL = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    decoTL.setAttribute('class', 'ex-tut-log-deco tl'); decoTL.setAttribute('viewBox', '0 0 140 70');
    decoTL.setAttribute('aria-hidden', 'true');
    decoTL.innerHTML = tutTriDeco(140, 70, 46, 'tl');   // 左上：正三角拼接，向右渐隐
    const ttl = document.createElement('div'); ttl.className = 'ttl'; ttl.textContent = '记录';
    const bx = document.createElement('button'); bx.type = 'button'; bx.className = 'ex-tut-log-x'; bx.textContent = '✕'; bx.title = '关闭';
    bx.addEventListener('click', () => tutCloseLogPanel());
    head.appendChild(decoTL); head.appendChild(ttl); head.appendChild(bx);
    const bodyEl = document.createElement('div'); bodyEl.className = 'ex-tut-log-body';
    // 大章节标题（平行四边形 + 白字深描边）
    const chap = document.createElement('div'); chap.className = 'ex-tut-log-chap';
    const chapIn = document.createElement('span'); chapIn.textContent = `第 ${tutChapter + 1} 节 · ${ch.title}`;
    chap.appendChild(chapIn); bodyEl.appendChild(chap);
    // 本卡片标题
    const cardT = document.createElement('div'); cardT.className = 'ex-tut-log-card';
    const cardIn = document.createElement('span'); cardIn.textContent = st.t;
    cardT.appendChild(cardIn); bodyEl.appendChild(cardT);
    // 本卡的文字气泡：已念出的实心，还没念到的淡化（可读全，但一眼能看出讲到哪）
    const sents = tutSplitSentences(st.b);
    sents.forEach((tx, i) => {
        const bub = document.createElement('div');
        bub.className = 'ex-tut-bub' + (i > tutTypePtr ? ' pending' : '');
        const inb = document.createElement('div'); inb.className = 'in';
        const lab = document.createElement('div'); lab.className = 'lab'; lab.textContent = st.t;
        const txt = document.createElement('div'); txt.className = 'txt'; txt.textContent = tx;
        inb.appendChild(lab); inb.appendChild(txt);
        bub.appendChild(inb);
        bodyEl.appendChild(bub);
    });
    if (!sents.length) {
        const bub = document.createElement('div'); bub.className = 'ex-tut-bub';
        const inb = document.createElement('div'); inb.className = 'in';
        const txt = document.createElement('div'); txt.className = 'txt'; txt.textContent = '（本卡片没有讲解文字）';
        inb.appendChild(txt); bub.appendChild(inb); bodyEl.appendChild(bub);
    }
    // 右下角低多边形扇形装饰（顶点在右下角，向左上扇开）
    const decoBR = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    decoBR.setAttribute('class', 'ex-tut-log-deco br'); decoBR.setAttribute('viewBox', '0 0 170 236');
    decoBR.setAttribute('aria-hidden', 'true');
    decoBR.innerHTML = tutTriDeco(170, 236, 58, 'br');
    panel.appendChild(head); panel.appendChild(bodyEl); panel.appendChild(decoBR);
    ov.appendChild(panel);
    document.body.appendChild(ov);
    try { bodyEl.scrollTop = bodyEl.scrollHeight; } catch (e) {}
    // ESC 收起（捕获阶段 + 阻断冒泡：避免同时触发「退出项目」的全局 ESC 处理）
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tutCloseLogPanel(); } };
    window.__tutMenuKey = onKey;
    document.addEventListener('keydown', onKey, true);
    try { tutUpdateGuard(); } catch (e) {}
}
function tutRender() {
    // 换步即停掉上一步的讲解动画并还原方块（否则动画会一直改方块、污染本步基线）
    try { tutAnimStop(); } catch (e) {}
    if (!tutUIReady) return;
    if (!EX_TUT_CHAPTERS || !EX_TUT_CHAPTERS.length) { try { showToast('教程数据未加载，请刷新页面重试'); } catch (e) {} return; }
    tutClearPoll();
    // ★离开第 1 章时清掉讲解动画造的临时教学方块（_tutNormal）：
    //   否则它会一直留在场景里（还会被当成小人身体），成为用户口中「那个没删的方块」。
    if (tutChapter > 0) { try { tutCleanupDemoBlocks(); } catch (e) {} }
    const root = document.getElementById('exTutRoot'); if (!root) return;
    try { tutSyncScale(); } catch (e) {}   // 渲染前同步一次 UI 缩放系数，保证卡片大小与当前 UI 缩放一致
    const ch = EX_TUT_CHAPTERS[tutChapter], st = ch.steps[tutStep];
    // 自动收起设置面板：上一步目标在设置面板内（面板是教程自动打开的），本步不在了 → 收起，
    // 别让遗留的设置面板一直挡着画布。标记记录「上一步是否设置面板步」，进入设置步时 tutRecoverEnv 会再自动打开。
    const stInSettings = (st.target && tutTargetInSettings(st.target)) || (Array.isArray(st.thenTarget) && st.thenTarget.some(tutTargetInSettings));
    // ★2026-10-22：只要本步不需要设置面板，就一律收起（不再要求「上一步是设置步」）。
    //   根因：用户自己点开设置面板时 tutSettingsStepActive 是 false，教程不会替它收起来，
    //   面板就整块盖住编辑器/画布，用户又以为教程卡住（用户报的 molang 关卡卡关之一）。
    if (!stInSettings && tutSettingsOpen()) {
        try { toggleUISettingsPanel(); } catch (e) { try { const p = document.getElementById('uiSettingsPanel'); if (p) p.style.display = 'none'; } catch (e2) {} }
    }
    tutSettingsStepActive = stInSettings;
    // 进入本步前先把环境扳回正轨（新操作模式 / 关键帧模式 / 工具菜单），这是“中途切旧模式也不卡死”的核心
    try { tutRecoverEnv(st); } catch (e) { console.warn('tutRecoverEnv', e); }
    // 进入本步即确保有可编辑方块（误点文件夹/空白导致无选中时立即恢复身体块，杜绝卡关）
    try { tutEnsureStepSelection(st); } catch (e) { console.warn('tutEnsureStepSelection', e); }
    // 进入本步先解除被「系统自动行为/上一步残留」提前满足的状态，避免门控“没做就放行”
    try { tutRunDisarm(st); } catch (e) { console.warn('tutRunDisarm', e); }
    const n = ch.steps.length;
    const hasAct = Array.isArray(st.act) && st.act.length > 0;
    const gated = hasAct || typeof st.check === 'function';
    const old = root.querySelector('.ex-tut-card');
    const prevSide = old ? (old.classList.contains('top') ? 'top' : 'bot') : 'bot';
    if (old) old.remove();
    const oldBg = root.querySelector('.ex-tut-card-bg');
    if (oldBg) oldBg.remove();
    tutTypeStop();
    try { tutCloseLogPanel(); } catch (e) {}
    const card = document.createElement('div'); card.className = 'ex-tut-card ' + prevSide;
    try { exTutSfxCard(); } catch (e3) {}   // 新步骤卡片浮出：轻快翻页声（已被点击音抑制时不重复）
    tutTopSince = 0;     // 新卡片 = 新步骤 → 重新计「贴顶」时长（见 tutDesiredSide / tutPlaceCard）
    tutCardFresh = true;    // 新建卡片首帧保持上一步侧，待目标稳定后再判（防转场闪现到最上方）
    tutFreshPending = true; // 稳定后首次判定直接落正确侧（置 hold 为已满足），免 350ms 空等
    // 圆角底板：略大于卡片、同圆角、不透明，遮挡卡片圆角处漏出的明亮变量面板（见 .ex-tut-card-bg）
    const posCls = (card.className.match(/\b(top|bot)\b/) || ['bot'])[0];
    const cardBg = document.createElement('div'); cardBg.className = 'ex-tut-card-bg ' + posCls;
    const head = document.createElement('div'); head.className = 'ex-tut-head';
    const chip = document.createElement('span'); chip.className = 'ex-tut-chip';
    chip.appendChild(tutIconEl(ch.icon, 11));
    const chipT = document.createElement('span'); chipT.textContent = `第 ${tutChapter + 1} 节 · ${tutStep + 1}/${n}`; chip.appendChild(chipT);
    const cnt = document.createElement('span'); cnt.className = 'ex-tut-count';
    cnt.textContent = st.t;
    // 右上角两个按钮（按设计稿：平行四边形 + 圆角 + 斜体粗字）：
    // 「自动」未开启=白底深蓝横排文字，开启=黄底深棕横排文字 + 同色系装饰三角（仅换配色，形状不变）；
    // 「菜单」= 先弹两枚深灰蓝斜角小按钮：☰ 看对话列表（记录面板）、» 双箭头跳过本目教程
    const tools = document.createElement('div'); tools.className = 'ex-tut-tools';
    const btAuto = document.createElement('button'); btAuto.type = 'button';
    btAuto.className = 'ex-tut-tool auto' + (tutAutoPlay ? ' on' : '');
    btAuto.title = '自动：逐句自动播放，不必点击空白处';
    const btAutoT = document.createElement('span');
    const paintAuto = () => {
        btAuto.classList.toggle('on', tutAutoPlay);
        // 固定横排「自动」：开关只换配色与装饰，形状/朝向绝不变（避免「竖起来又躺下去」）
        btAutoT.innerHTML = '自动';
    };
    btAuto.appendChild(btAutoT);
    // 点亮态的两颗白黄光点：顺时针绕按钮边框滚动、向内发光（纯装饰，CSS exTutOrbit 驱动）
    const orb1 = document.createElement('i'); orb1.className = 'ex-tut-orb';
    const orb2 = document.createElement('i'); orb2.className = 'ex-tut-orb o2';
    btAuto.appendChild(orb1); btAuto.appendChild(orb2);
    paintAuto();
    btAuto.addEventListener('click', () => {
        tutAutoPlay = !tutAutoPlay;
        paintAuto();
        if (tutAutoPlay) { if (!tutTypeDone) tutTypeArmAuto(); }
        else if (tutTypeAutoTimer) { clearTimeout(tutTypeAutoTimer); tutTypeAutoTimer = null; }
    });
    const btMenu = document.createElement('button'); btMenu.type = 'button';
    btMenu.className = 'ex-tut-tool alt'; btMenu.title = '菜单：☰ 查看对话列表，» 双箭头跳过本目教程';
    const btMenuT = document.createElement('span'); btMenuT.textContent = '菜单';
    btMenu.appendChild(btMenuT);
    // 按下先弹两枚小按钮（☰ 对话列表 / » 双箭头跳过本目），不再直接开记录面板
    btMenu.addEventListener('click', (e) => { e.stopPropagation(); tutOpenMenuPop(btMenu); });
    // 「巡游」入口【只放在「故事」目录弹窗里】（见 openTutorialOverview），卡片右上角保持「自动 / 菜单」两个按钮。
    tools.appendChild(btAuto); tools.appendChild(btMenu);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ex-tut-x'; x.title = '退出（进度自动保存，可在设置中继续）'; x.textContent = '✕';
    x.addEventListener('click', () => { tutSaveProgress(); closeTutorial(false); });
    head.appendChild(chip); head.appendChild(cnt); head.appendChild(tools); head.appendChild(x);
    const body = document.createElement('div'); body.className = 'ex-tut-body';
    // 讲解不再一次性铺开：先给一个空容器，由打字动画逐句填进去
    const linesEl = document.createElement('div'); linesEl.className = 'ex-tut-lines';
    body.appendChild(linesEl);
    let hintEl = null, pgEl = null;
    if (st.b) {
        hintEl = document.createElement('div'); hintEl.className = 'ex-tut-hint';
        const tri = document.createElement('span'); tri.className = 'tri'; tri.textContent = '▸';
        // 画布类步骤（canvas:true）整屏都是放行的 3D 操作区、没有暗区可点，所以提示改成「点卡片继续」
        const ht = document.createElement('span'); ht.textContent = st.canvas ? '点击卡片继续' : '点击空白处继续';
        pgEl = document.createElement('span'); pgEl.className = 'pg';
        hintEl.appendChild(tri); hintEl.appendChild(ht); hintEl.appendChild(pgEl);
        body.appendChild(hintEl);
    }
    let stbar = null;
    if (gated) {
        stbar = document.createElement('div'); stbar.className = 'ex-tut-status';
        stbar.textContent = '完成任务进入下一关';
        stbar.style.display = 'none';   // 全部句子弹完后再露出
        body.appendChild(stbar);
    }
    const foot = document.createElement('div'); foot.className = 'ex-tut-foot';
    const dots = document.createElement('div'); dots.className = 'ex-tut-dots';
    for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'ex-tut-dot' + (i === tutStep ? ' on' : ''); dots.appendChild(d); }
    const btChapter = document.createElement('button'); btChapter.type = 'button'; btChapter.className = 'ex-tut-btn'; btChapter.textContent = '目录';
    btChapter.addEventListener('click', () => openTutorialOverview());
    const btPrev = document.createElement('button'); btPrev.type = 'button'; btPrev.className = 'ex-tut-btn'; btPrev.textContent = '← 上一步';
    btPrev.disabled = tutStep === 0; if (btPrev.disabled) btPrev.style.opacity = '.4';
    btPrev.addEventListener('click', () => { if (tutStep > 0) { try { exTutSfx('prev'); } catch (e3) {} tutStep--; tutRender(); tutLayout(); } });
    const btDemo = document.createElement('button'); btDemo.type = 'button'; btDemo.className = 'ex-tut-btn tut-demo';
    btDemo.textContent = '帮我做';
    btDemo.dataset.hasact = hasAct ? '1' : '0';
    // ★「帮我做」从本步一出现就可见（有 act 才显示）。原来要等全部句子打完才显示，
    //   用户在前面几句点它没反应，就以为教程坏了（用户报「点帮我做没反应」）。
    btDemo.style.display = hasAct ? '' : 'none';
    btDemo.addEventListener('click', () => {
        // 还没打完字就点了：先把本步讲解一次性补完，再执行动作，避免“点了像没点”
        try { if (!tutTypeDone) tutTypeComplete(); } catch (e) {}
        tutRunDemo(st);
    });
    const btNext = document.createElement('button'); btNext.type = 'button'; btNext.className = 'ex-tut-btn primary tut-next';
    btNext.textContent = (tutStep === n - 1) ? (tutChapter === EX_TUT_CHAPTERS.length - 1 ? '完成 ✓' : '下一节 →') : '下一步 →';
    btNext.style.display = 'none';   // 讲完才出现
    const tutGoNext = () => {
        tutSaveProgress();
        // 「目」完成判定：当前步是所在目的最后一步 → 该目通关（点亮目录页黄标签）
        const _secs = tutChapterSections(tutChapter);
        const _si = _secs.findIndex(x => tutStep >= x.from && tutStep <= x.to);
        if (_si >= 0 && tutStep === _secs[_si].to) { tutMarkSectionDone(tutChapter, _si); try { exTutSfx('complete'); } catch (e3) {} }
        else { try { exTutSfx('next'); } catch (e3) {} }
        if (tutStep < n - 1) { tutStep++; tutRender(); tutLayout(); return; }
        // 本章最后一节已完成：所有目都过了 → 章通关（解锁下一章，且可自由复习本/前章节）
        if (_secs.every((x, i) => tutIsSectionDone(tutChapter, i))) tutMarkChapterDone(tutChapter);
        if (tutChapter < EX_TUT_CHAPTERS.length - 1) {
            const nextCi = tutChapter + 1;
            try { exTutSfx('complete'); } catch (e3) {}
            tutShowChapterDone(tutChapter, nextCi);   // 弹「是否继续」而不是直接跳过
            return;
        }
        try { exTutSfx('complete'); } catch (e3) {}
        tutSave({ done: 1, ts: Date.now(), chapter: tutChapter, step: tutStep });
        closeTutorial(true);
        showToast('课程完成！你已掌握三种操作模式。练习项目保存在项目列表里，可随时再玩');
    };
    btNext.addEventListener('click', tutGoNext);
    foot.appendChild(btPrev); foot.appendChild(btChapter); foot.appendChild(dots); foot.appendChild(btDemo); foot.appendChild(btNext);
    card.appendChild(head); card.appendChild(body); card.appendChild(foot);
    // 阻止教程卡片点击冒泡到页面（应用有“点外部关闭面板/菜单”等 document 级监听）
    card.addEventListener('click', (e) => e.stopPropagation());
    // 点卡片空白处也能推进文字：canvas 类步骤整屏都是放行的 3D 操作区（没有暗区可点），
    // 若只认防护层点击，这些步骤会「一句话卡住、按钮永远不出现」。按钮上不触发。
    card.addEventListener('click', (e) => { if (e.target.closest('button')) return; try { tutTypeNext(); } catch (err) {} });
    root.appendChild(card);
    tutObserveCard(card);   // 卡片尺寸变化（打字/缩放）即时重排，保证贴底不溢出
    tutTypeLinesEl = linesEl; tutTypeHintEl = hintEl; tutTypePgEl = pgEl;   // 打字动画目标
    // 此处 tutLayout 必须包 try/catch：下方 30580 行才会调用 tutTypeBegin 开始打字；
    // 若 tutLayout 抛错冒泡，tutRender 会在打字开始前中断 → 卡片已建出（提示条可见）但正文永远空白、
    // 点击卡片又落到已脱离 DOM 的旧 .ex-tut-lines 上「毫无反应」，正是用户报的「新操作模式教程卡死」。
    try { tutLayout(); } catch (e) { console.warn('tutRender tutLayout', e); }
    // 延迟补一次布局：部分高亮目标依赖布局类切换后才可见（如设置按钮），渲染当时可能尚未就绪，稍后补点亮
    setTimeout(() => { try { tutLayout(); tutUpdateGuard(); } catch (e) {} }, 60);
    setTimeout(() => { try { tutLayout(); tutUpdateGuard(); } catch (e) {} }, 260);
    // 设置面板目标：面板已自动打开，稍后把目标滚入可见区（面板可滚动、目标很长时尤其必要）。
    // 滚动发出前冻结卡片侧判定（tutAwaitScroll）：否则 +260ms 那次 layout 会按目标**滚动前**的位置
    // 先判一次（该类目标常在折叠线下方 → 判成贴顶），平滑滚动完它落到 58% 线另一侧 → 卡片再翻回来
    // = 进入设置步时卡片上下移动两次（用户反馈的「飞来飞去」）。
    if (tutScrollTimer) { clearTimeout(tutScrollTimer); tutScrollTimer = null; }
    tutAwaitScroll = !!(stInSettings && tutSettingsOpen());
    if (tutAwaitScroll) {
        tutScrollTimer = setTimeout(() => {
            tutScrollTimer = null;
            try { tutScrollSettingsTarget(st); } catch (e) {}
            tutAwaitScroll = false;
            // 只清零稳定性计时，**绝不能把 tutLastRect 置 null**：置 null 会让 tutRectIsMoving 误判
            // 「没在动」→ tutFreshPending 立刻按滚动前的位置落位，等于没修。
            tutRectStableSince = 0;   // 从滚动起点重算稳定性，之后交给矩形冻结接管
            try { tutLayout(); } catch (e) {}
        }, 300);
    }
    // 步骤完成度门控：
    //  · 有 check 的步骤 → 轮询真实完成度，用户真的做出来（或点「帮我做」）才放行；
    //  · 只有 act 的步骤 → 必须由用户点「帮我做」演示完成才放行（手动操作无法程序化校验时以此为准）；
    //  · 纯说明步骤（无 act 无 check）→ 读完即可继续。
    if (typeof st.check === 'function') {
        tutStepDone = false; tutRecordBaseline(); tutApplyUI(); tutPollStart();
    } else if (Array.isArray(st.act) && st.act.length) {
        tutStepDone = false; tutApplyUI();
    } else {
        tutStepDone = true; tutApplyUI();
        // 纯说明步骤：一般无需轮询；但若本步聚光在画布 / 变换工具栏（需「已选中方块」才有可见目标），
        // 仍启动轮询做「误点文件夹 / 空白」自愈，避免出现「有 Gizmo 控件却没有任何方块被选中」的困惑。
        if (st.canvas || (st.target && TUT_TOOLBAR_RE.test(st.target))) tutPollStart(); else tutClearPoll();
    }
    // 打字动画：逐句弹出；全部弹完才放出「帮我做 / 下一步」
    try { tutTypeBegin(st); } catch (e) { console.warn('tutTypeBegin', e); try { tutTypeDone = true; tutTypeRevealActions(); } catch (e2) {} }
    // 「底层定义」讲解动画：进入本步即边讲边播（真实 3D 场景），离开该步由 tutRender 顶部自动停播并还原
    if (st && st.demo) { try { tutAnimStart(st.demo); } catch (e) { console.warn('tutAnimStart', e); } }
    // 安全兜底：进入本步后若正文始终空白且未在读（任何环境/时序下打字未启动），延迟重试一次，
    // 与上方 tutLayout try/catch、tutTypeBegin 防呆配套，杜绝「卡片空正文 + 点击无反应」的卡死。
    if (st && st.b) {
        setTimeout(() => {
            try {
                if (tutTypeDone) return;
                // 只对「本步」生效：600ms 内若已切到别的步骤，绝不能拿旧 st 覆盖新卡片的正文
                if (!EX_TUT_CHAPTERS[tutChapter] || EX_TUT_CHAPTERS[tutChapter].steps[tutStep] !== st) return;
                const _lines = document.querySelector('#exTutRoot .ex-tut-lines');
                const _typing = document.querySelector('#exTutRoot .ex-tut-line.typing');
                if (_lines && !_typing && !_lines.textContent.trim() && !tutTypeTimer) tutTypeBegin(st);
            } catch (e) {}
        }, 600);
    }
}
