/* 09-tutorial/05-practice-and-clear.js · 源 测试版v.6b79.html 第 50813-51179 行 */
'use strict';
// ---- 实操小助手（课程 demo 共用） ----
function tutMakeCube(id, color, group) {
    const dm = [0, 0, 0, 0, 0, 0, 1, 1, -90, 0, 0, 0, 0];
    const b = new Block(id, dm.slice(), null, color || '#aaccff', 'cube', group || '');
    b.group = group || '';
    addBlock(b, false, false);
    return b;
}
function tutPlace(b, x, y, z) {
    if (!b) return;
    setConstVarValue(b, 'v.xbasepos', _r4(x || 0));
    setConstVarValue(b, 'v.ybasepos', _r4(y || 0));
    setConstVarValue(b, 'v.zbasepos', _r4(z || 0));
    try { b.refresh(); b.mesh && b.mesh.updateMatrixWorld(true); } catch (e) {}
}
function tutFirstBody() {
    // 教程身体优先 id='cube1'（「帮我做」路径建的）；否则取第一个「非系统占位块」——
    // 用户在 2.1 手动建出的第一块会被正确当成身体，门控 / 移动基线 / 归组都盯它。
    // （_tutNormal = 教程讲解动画临时造的教学方块，不算用户建的）
    const cube1 = blocks.find(b => b.id === 'cube1');
    if (cube1) return cube1;
    return blocks.find(b => !tutIsDefaultPlaceholder(b) && !b._tutNormal) || null;
}
// 清理教程自己造的临时教学方块（tutEnsureNormalBlock 建的 _tutNormal）。
// 只在「用户没动过它」时才删：有分组 / 有关键帧 / 已被用户选中改造过的一律保留。
// 调用点：① 进入第 1 章之后的章节（tutEnsureBody 顶部）；② 退出教程（closeTutorial）。
function tutCleanupDemoBlocks() {
    try {
        blocks.slice().forEach(b => {
            if (!b || !b._tutNormal) return;
            if (b.group) return;                       // 已被归组 ⇒ 用户已接纳它
            try { if (hasKeyframeAnimation(b.id)) return; } catch (e) {}
            try { removeBlock(b, true); } catch (e) {}   // silent：不做"存在关键帧，确认删除？"询问（removeBlock 自会处理取消选中）
        });
    } catch (e) {}
}
function tutEnsureBody() {
    // ★先清理第 1 章遗留的「教程临时教学方块」（_tutNormal），否则它会被当成小人身体、
    //   永远留在场景里（用户 2026-10-17：「新手教程初始场景似乎有个方块是没删的」）。
    //   只在第 1 章之后清理：第 1 章里 tutEnsureBody 会被环境恢复逐帧调用，若也清理会造成反复建删。
    if (tutChapter > 0) tutCleanupDemoBlocks();
    // 始终确保存在身体块（教程帮做路径建 id='cube1'），绝不把系统默认占位块当身体
    let b = (tutBody && blocks.find(x => x.id === tutBody.id)) || blocks.find(x => x.id === 'cube1');
    // 用户已在第 2.1 步手动建过一块（哪怕 id 恰好是 'Cube'）：复用它当身体，
    // 否则「帮我做」会在用户那块旁边再造一块，场景里出现两个身体。
    if (!b) b = blocks.find(x => !tutIsDefaultPlaceholder(x)) || null;
    // 第 2 章先以「未分组」方块创建身体 —— 归入「小人」组是第 3.2 步（拖进文件夹）的练习，
    // 不能提前自动归组，否则该步门控永远处于「已满足」、用户无需动手。
    if (!b) { b = tutMakeCube('cube1', '#7dd3fc', ''); tutPlace(b, 0, 0, 0); }
    tutBody = b;
    return b;
}
function tutMakeHead() {
    if (blocks.filter(b => b.group === '小人').length >= 2) return;
    const h = tutMakeCube('head', '#f9a8d4', '小人'); tutPlace(h, 0, 1.6, 0);
    return h;
}
function tutArrangeMan() {
    tutEnsureBody();
    const body = tutBody || tutFirstBody();
    const mk = (id, color, x, y, z) => { if (blocks.find(b => b.id === id)) return; const c = tutMakeCube(id, color, '小人'); tutPlace(c, x, y, z); };
    mk('head', '#f9a8d4', 0, 1.6, 0);
    mk('armL', '#a5b4fc', -1, 0.5, 0);
    mk('armR', '#a5b4fc', 1, 0.5, 0);
    mk('legL', '#6b7280', -0.3, -1.6, 0);
    mk('legR', '#6b7280', 0.3, -1.6, 0);
    blocks.filter(b => b.group === '小人').forEach(b => { b.group = '小人'; try { setConstVarValue(b, 'v.xpos', 0); setConstVarValue(b, 'v.ypos', 0); setConstVarValue(b, 'v.zpos', 0); setConstVarValue(b, 'v.rotatex', 0); setConstVarValue(b, 'v.rotatey', 0); setConstVarValue(b, 'v.rotatez', 0); b.refresh(); } catch (e) {} });
    const _f = getFolder('小人'); if (_f) { try { _f.position = [0, 0, 0]; } catch (e) {} }
    if (!getFolder('小人')) createFolder('小人');
    try { renderSideBlockList(); } catch (e) {}
}
function tutBindAll() {
    tutArrangeMan();
    const f = getFolder('小人'); const body = tutBody || tutFirstBody();
    if (!f || !body) return;
    if (!f._backbone) { try { designateFolderBackbone('小人', body.id, true, false); } catch (e) {} }
    blocks.filter(b => b.group === '小人' && b.id !== body.id).forEach(cb => {
        try { if (getBoneParentId(cb) !== body.id) bindBone(cb, body, true, true, false, true); cb.refresh(); } catch (e) {}
    });
    try { refreshBlocksUnderFolder('小人'); } catch (e) {}
    try { renderSideBlockList(); } catch (e) {}
}
// ---- 练习项目（独立）：自动保存当前 → 新建/打开「新手教程·练习」 ----
function tutIsPracticeLive() { const s = tutLoad(); return !!currentProjectId && !!s.practiceId && s.practiceId === currentProjectId; }
// 切到练习项目之前，把用户当前项目立即落盘（自动保存有 1.2s 防抖，切走会丢最近的改动）
async function tutSaveCurrentBeforeSwitch(exemptId) {
    if (!currentProjectId || currentProjectId === exemptId || currentProjectIsTemp) return;
    try {
        await saveProjectToDB({
            id: currentProjectId, name: currentProjectName,
            state: JSON.stringify(getState()), thumbnail: captureThumbnail(),
            updatedAt: Date.now(), createdAt: currentProjectSavedAt || 0
        });
    } catch (e) { console.warn('切换前保存当前项目失败', e); }
}
async function tutEnsurePracticeProject() {
    const s = tutLoad();
    // 即便内存里 practiceId 与 currentProjectId 匹配，也要到 DB 里确认项目还在
    // （用户可能在项目管理器删除了练习项目，但 currentProjectId 仍指向已删 id）
    if (s.practiceId && currentProjectId === s.practiceId) {
        let stillThere = false;
        try { stillThere = !!(await loadProjectFromDB(s.practiceId)); } catch (e) {}
        if (stillThere) return true;
        // DB 里没了：清状态、走新建
        try { currentProjectId = null; } catch (e) {}
        tutSave({ practiceId: '', inPractice: 0 });
    }
    // 还有 practiceId 但当前不在线（含内存校验后走到这里的分支）：尝试打开
    const s2 = tutLoad();
    if (s2.practiceId) {
        const pid = s2.practiceId;
        await tutSaveCurrentBeforeSwitch(pid);
        try { await openProject(pid); } catch (e) { /* 项目被删/加载失败 */ }
        if (tutIsPracticeLive()) return true;
        tutSave({ practiceId: '', inPractice: 0 });
    }
    // 当前已有项目：先显式落盘（不再干等 1.3s），再新建
    await tutSaveCurrentBeforeSwitch(null);
    try { await createNewProject(); }
    catch (e) { console.error('tut createNewProject failed', e); showToast('创建练习项目失败：' + (e && e.message || e)); return false; }
    const pid = currentProjectId;
    if (!pid) { showToast('创建后仍未拿到项目 ID，请刷新重试'); return false; }
    try { await renameProject(pid, '新手教程·练习'); } catch (e) { console.warn('renameProject 失败', e); }
    try { currentProjectName = '新手教程·练习'; } catch (e) {}
    tutSave({ practiceId: pid, inPractice: 1, practiceCreatedAt: Date.now() });
    tutBody = null;
    return tutIsPracticeLive();
}
// 把练习项目（若有）从内存 + DB 一并重置为「完全全新」：复用同一个 practiceId，
// 避免列表里堆出一堆「新手教程·练习」；无练习项目则先创建。
async function tutResetPracticeFresh() {
    let s = tutLoad();
    const pid = s.practiceId;
    let livePid = null;
    // 先把用户当前项目落盘，再切到练习项目（避免把别处的未保存改动冲掉）
    await tutSaveCurrentBeforeSwitch(pid);
    if (pid) {
        // 复用旧 id：直接覆盖成空场景（内存清空 + DB 空状态）
        currentProjectId = pid; currentProjectName = '新手教程·练习';
        enterProject();
        loadProjectIntoSimulator(null);
        // loadProjectIntoSimulator(null) 会补一个系统默认方块（id='Cube'），旧练习项目里
        // 还可能有上次留下的方块 —— 全部清掉再落库，否则保存下来的“全新项目”里仍有方块，
        // 用户看到的就是「压根没清空」，而且第一步 demo 会直接复用旧块、看起来毫无反应。
        tutClearAllBlocks();
        const fresh = { id: pid, name: '新手教程·练习', state: JSON.stringify(getState()), thumbnail: null, updatedAt: Date.now(), createdAt: Date.now() };
        await saveProjectToDB(fresh);
        currentProjectSavedAt = fresh.updatedAt;
        history.reset(getState());
        livePid = pid;
    } else {
        // 没有练习项目：等旧项目 autosave 落盘后新建
        if (currentProjectId) await new Promise(r => setTimeout(r, 1300));
        try { await createNewProject(); }
        catch (e) { console.error('createNewProject failed', e); return false; }
        livePid = currentProjectId;
        tutClearAllBlocks();   // 新建项目自带的默认方块同样清掉，保证第 1 章进来是空场景
        try { if (livePid) await renameProject(livePid, '新手教程·练习'); } catch (e) {}
        try { currentProjectName = '新手教程·练习'; } catch (e) {}
        tutSave({ practiceId: livePid, inPractice: 1, practiceCreatedAt: Date.now() });
    }
    if (!livePid) return false;
    tutBody = null;
    tutSave({ practiceId: livePid, inPractice: 1, practiceCreatedAt: Date.now(), chapter: 0, step: 0 });
    return tutIsPracticeLive();
}
// 把场景里所有方块真正清空（练习项目「全新」必须是无方块的空白场景）。
// 只删默认占位块不够：新建项目自带的那一块之外，复用的旧练习项目里还可能留着上次的方块。
function tutClearAllBlocks() {
    try {
        /* ★【2026-10-24 性能】整场清空包 _bulkAddDepth（removeBlock 批量模式只清数据），
           否则每删一块都刷侧栏（O(n²)）。下面已有的 renderSideBlockList() 负责收尾。 */
        _bulkAddDepth++;
        try { for (let i = blocks.length - 1; i >= 0; i--) { try { removeBlock(blocks[i], true); } catch (e) {} } }
        finally { _bulkAddDepth--; }
        try { if (selectedBlock && !blocks.includes(selectedBlock)) selectedBlock = null; } catch (e) {}
        try { if (selectedBlocksSet) selectedBlocksSet.clear(); } catch (e) {}
        try { renderSideBlockList(); } catch (e) {}
        // 清空之后场景里再出现的 id='Cube' 一律是用户/演示新建的，不能再当系统占位块排除
        tutPlaceholderCleared = true;
    } catch (e) { console.warn('[tutorial] 清空方块失败', e); }
}
// 教程练习项目启动后移除系统默认占位块 id='Cube'：它会在空场景自动创建、且一直停在原点，
// 会和教程身体重叠、并干扰「第 2.1 步新建身体」的门控判定（清掉后场景才是干净的空场景）。
// 仅当它是「未修改默认姿态」才移除，避免误删用户编辑过的同名块。
function tutRemoveDefaultPlaceholder() {
    try {
        const _defM = [0, 0, 0, 0, 0, 0, 1, 1, -90, 0, 0, 0, 0];
        for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i];
            if (b.id !== 'Cube' || b.group != null || b.type !== 'cube' || b.materialType !== 'color') continue;
            if (b._boneParent) continue;
            const m = b.scope.toM();
            let same = true;
            for (let k = 0; k < 13; k++) if (Math.abs(Number(m[k]) - _defM[k]) > 1e-6) { same = false; break; }
            if (!same) continue;
            blocks.splice(i, 1);
            invalidateBlockIdCache();   // 方块集合已变：getBlockById 立即重建
            if (b.mesh) scene.remove(b.mesh);
            if (b.label) scene.remove(b.label);
            if (b.selectionWireframe) scene.remove(b.selectionWireframe);
            if (typeof removeBubblesForBlock === 'function') removeBubblesForBlock(b);
            if (selectedBlock === b) selectedBlock = null;
            selectedBlocksSet.delete(b);
            break;
        }
        try { renderSideBlockList(); } catch (e) {}
    } catch (e) {}
    // 清理完毕：此后场景里再出现同签名方块（id='Cube'、默认姿态）也是「用户此刻新建的」，
    // 不能再当占位块排除，否则手动建块路径的门控不会放行。
    tutPlaceholderCleared = true;
}
// ---- 教程「加载仪式感」：全屏遮罩 + 左下角伪加载文本（2026-10-16 用户要求）----
// 每项 = [一本正经的伪加载文案, 抖机灵的翻车文案, 是否用"报错"样式]。
// 轮换播放，避免每次进教程都看到同一句。
const EX_TUT_RITUAL_PAIRS = [
    ['正在加载光线追踪程序…', '哈哈，其实压根没有这个功能', false],
    ['爱丽丝正在为您创建一个模型…', 'error!!! Alice NEED TOKEN!! Alice are NOT FREE AI', true],
    ['正在编译 molang 虚拟机…', '编译成功，但它只会回答「我不知道」', false],
    ['正在预热 GPU 着色器…', '你的显卡说它今天想休息一下', false],
    ['正在连接方块宇宙…', '连接成功，可惜对面是单人模式', false],
    ['正在校准 Gizmo 陀螺仪…', '校准完毕，方向感依然很差', false],
    ['正在申请算力配额…', '配额到账 0.0003 次，请节约使用', true],
];
let tutRitualSeq = 0;
// 返回 Promise：动画放完（或用户点击跳过）后 resolve。绝不让异常卡住教程流程。
function showTutRitual() {
    return new Promise((resolve) => {
        let done = false;
        const timers = [];
        const finish = () => {
            if (done) return; done = true;
            timers.forEach(t => { try { clearTimeout(t); clearInterval(t); } catch (e) {} });
            try { ov.classList.add('out'); } catch (e) {}
            setTimeout(() => { try { ov.remove(); } catch (e) {} resolve(); }, 360);
        };
        let ov = null;
        try {
            if (document.getElementById('exTutRitual')) { resolve(); return; }   // 已在播，不叠层
            // ★必须先注入教程样式表：本函数在 tutStartCourse 里被调用，而 tutInjectCSS() 是在
            //   tutEnsureUI() 里才跑的 —— 若这里不主动注入，仪式层会以「无样式」的裸 div 出现
            //   （实测 rect 只有 1280×48、无背景、position:static），等于整个仪式不生效。
            try { tutInjectCSS(); } catch (e) {}
            const pair = EX_TUT_RITUAL_PAIRS[(tutRitualSeq++) % EX_TUT_RITUAL_PAIRS.length];
            ov = document.createElement('div'); ov.id = 'exTutRitual'; ov.className = 'ex-tut-ritual';
            const box = document.createElement('div'); box.className = 'ex-tut-ritual-box';
            const line = document.createElement('div'); line.className = 'ex-tut-ritual-line';
            const bar = document.createElement('div'); bar.className = 'ex-tut-ritual-bar';
            const fill = document.createElement('i');
            const hint = document.createElement('div'); hint.className = 'ex-tut-ritual-hint'; hint.textContent = '点击任意处跳过';
            bar.appendChild(fill); box.appendChild(line); box.appendChild(bar); box.appendChild(hint);
            ov.appendChild(box);
            ov.addEventListener('click', finish);
            document.body.appendChild(ov);
            // 阶段 1：逐字打出伪加载文案（打字机），进度条同步走到 62%
            const fake = pair[0];
            let i = 0;
            const caret = '<span class="rt-caret"></span>';
            line.innerHTML = caret;
            const typer = setInterval(() => {
                i++;
                line.innerHTML = fake.slice(0, i) + caret;
                fill.style.width = Math.round(62 * i / fake.length) + '%';
                // 打字配音：每 tick 一声（55ms 节流 + 随机音高抖动，由 exTutSfxType 内部处理）；
                // 最后一 tick 不响，避免收尾多一声（与主卡片打字动画一致）。
                if (i < fake.length) { try { exTutSfxType(); } catch (e) {} }
                if (i >= fake.length) {
                    clearInterval(typer);
                    // 阶段 2：抖机灵（换色 / 报错抖动），进度条卡在 88% 再走满
                    timers.push(setTimeout(() => {
                        line.className = 'ex-tut-ritual-line joke' + (pair[2] ? ' err' : '');
                        line.textContent = pair[1];
                        fill.style.width = '88%';
                        timers.push(setTimeout(() => { fill.style.width = '100%'; }, 320));
                        timers.push(setTimeout(finish, 900));
                    }, 340));
                }
            }, 26);
            timers.push(typer);
            // 兜底：最长 3.4s 必须结束，避免任何异常把用户锁在遮罩里
            timers.push(setTimeout(finish, 3400));
        } catch (e) { finish(); }
    });
}
async function tutStartCourse(fromChapter, fromStep, fresh) {
    tutClearPoll();
    // 进入任一章节前先清掉欢迎卡（整屏 .modal 会盖住目录/画布/新建方块菜单，导致「点什么都没反应」）
    try { const w = document.getElementById('exTutWelcome'); if (w) w.remove(); } catch (e) {}
    const ov = document.getElementById('exTutOverlay'); if (ov) ov.remove();
    const s = tutLoad();
    // ★第 1 章（索引 0）的**第一步**必须从「全空场景」开始：把练习项目重置为空
    //   （复用同一个 practiceId，不会在项目列表里堆一堆「新手教程·练习」）。
    //   只在该章第 0 步重置——否则刷新/续接会把用户在本章里已经做出来的方块清掉。
    const _pcEarly = (typeof fromChapter === 'number') ? fromChapter : (s.chapter || 0);
    const _stEarly = (typeof fromStep === 'number') ? fromStep : (fresh ? 0 : (s.step || 0));
    const _needFresh = !!fresh || (_pcEarly === 0 && _stEarly === 0);
    // ★仪式感：与真实的项目准备**并行**跑，所以不会额外拖慢；放完（或点击跳过）才继续。
    const _ritual = showTutRitual();
    if (typeof showMaskLight === 'function') { try { showMaskLight('正在准备「新手教程·练习」项目…'); } catch (e) {} }
    showToast('正在准备练习项目…');
    let okP;
    if (_needFresh) {
        okP = await tutResetPracticeFresh();
    } else {
        okP = await tutEnsurePracticeProject();
    }
    try { hideMaskLight && hideMaskLight(); } catch (e) {}
    try { await _ritual; } catch (e) {}
    if (!okP) { showToast('练习项目创建失败，请稍后重试'); return; }
    // ★不要在这里删 id='Cube' 的方块：第 1 章让用户亲手建的方块就是这个 id，
    //   续接/重进本章时删掉它，用户会觉得「我刚建的方块没了」。
    // 读档：进入该章即加载该章起点预设（唯一解模型），保证每次打开都从正确基准开始；
    // 第 0 章预设为空场景 => 新手项目一开始“没有方块”。跳章/续接也都走这一支。
    try {
        const _s0 = tutLoad();
        let _pc = (typeof fromChapter === 'number') ? fromChapter : (_s0.chapter || 0);
        _pc = Math.max(0, Math.min(_pc, EX_TUT_CHAPTERS.length - 1));
        const _preset = (typeof TUT_CH_PRESETS !== 'undefined') ? TUT_CH_PRESETS[_pc] : null;
        if (_preset) {
            restoreState(_preset);     // 重置为第 _pc 章起点模型（唯一解）
            tutBody = null;
            try { renderSideBlockList(); } catch (e) {}
            try { requestGizmoRefresh(); } catch (e) {}
            try { if (typeof updateToolbar === 'function') updateToolbar(true); } catch (e) {}
            try { if (typeof history !== 'undefined' && history.reset) history.reset(getState()); } catch (e) {}
        }
    } catch (e) { console.warn('tut load preset failed', e); }
    const s3 = tutLoad();
    const ch = (typeof fromChapter === 'number') ? fromChapter : (fresh ? 0 : (s3.chapter || 0));
    const stp = (typeof fromStep === 'number') ? fromStep : (fresh ? 0 : (s3.step || 0));
    tutChapter = Math.max(0, Math.min(ch, EX_TUT_CHAPTERS.length - 1));
    tutStep = Math.max(0, Math.min(stp, (EX_TUT_CHAPTERS[tutChapter].steps.length - 1)));
    tutSetDock(true);   // 2026-10-17：统一入口，进教程 → 底部预留带生效 + 顶部工具行贴顶
    tutEnsureUI();
    const _startSt = EX_TUT_CHAPTERS[tutChapter].steps[tutStep];
    // ★跨章模式收尾（2026-10-16）：上一章的残留模式会**霸占本 step 的界面**，导致本章 UI 压根不出现。
    //   实测：第 8 章（画笔模式）切进去后没退出 ⇒ 第 10 章的 #varsContainer 仍是画笔工具栏
    //   （「画笔粗细(米)/点击平面选中」）、#sideBlockList 只剩 978 字节 ⇒ 批量面板不渲染
    //   ⇒ ch10.0~3 点了「帮我做」也永远无法放行。
    //   规则：本 step 属于画笔章（第 8 章索引 7）或本步 act 显式要画笔时不动，
    //   否则一律退出画笔模式，保证本章从干净界面开始。
    try {
        const _isBrushChapter = tutChapter === 7;
        const _wantsBrush = !!(_startSt && Array.isArray(_startSt.act) &&
            (_startSt.act.indexOf('enterBrushMode') >= 0 || _startSt.act.indexOf('ptAddPointDemo') >= 0 || _startSt.act.indexOf('ptDemoRect') >= 0));
        if (!_isBrushChapter && !_wantsBrush && typeof isBrushMode !== 'undefined' && isBrushMode) {
            try { exitBrushMode(); } catch (e) {}
        }
    } catch (e) {}
    // 项目管理器浮层收尾：第 9 章为演示把它显示了，离开该章必须收起，
    // 否则它会盖住整个编辑器 —— 第 10 章的 #sideBlockList / #varsContainer
    // 虽在 DOM 里却完全不可见、不可交互（实测 sideLen 13003 且 UI 不更新）。
    // 只改 style.display，**绝不调 backToProjectList()**（那会切屏幕、拆掉教程 UI）。
    try {
        const _isPmChapter = tutChapter === 8;
        const _pmTargeted = !!(_startSt && _startSt.target && typeof TUT_PM_RE !== 'undefined' && TUT_PM_RE.test(_startSt.target));
        if (!_isPmChapter && !_pmTargeted && typeof projectManagerEl !== 'undefined' && projectManagerEl && projectManagerEl.style.display !== 'none') {
            projectManagerEl.style.display = 'none';
            try { renderSideBlockList(); } catch (e) {}
        }
    } catch (e) {}
    // 进入首步前先按本步声明的模式扳正界面，避免打开教程后仍停留在原模式
    try { tutRecoverEnv(_startSt); } catch (e) { console.warn('tutStartCourse recover', e); }
    tutRender(); tutLayout();
    // 延迟再校正一次：setNewLayoutMode 会触发 DOM 重排，确保目标元素已出现在正确模式下
    setTimeout(() => { try { tutRecoverEnv(_startSt); tutLayout(); tutUpdateGuard(); } catch (e) {} }, 80);
}
