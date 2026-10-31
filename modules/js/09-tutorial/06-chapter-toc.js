/* 09-tutorial/06-chapter-toc.js · 源 测试版v.6b79.html 第 51180-51752 行 */
'use strict';
// ---- 章节目录 ----
// ---- 巡游：把「初次开启时看到的开场模型」加载进一个新建项目 ----
// 1) 用 playCinematicIntro 的「只采集」模式把开场模型原样构建一遍并导出 FMBE 指令（与初次开启同源）；
// 2) 弹出可勾选的模型清单；3) 选定后新建项目并导入（教程进度自动保存，可在「设置 → 新手教程」继续）。
function openIntroTourPanel() {
    let groups = null, _err = null;
    try {
        playCinematicIntro(null, { allowSkip: true, collectOnly: true, onCollect: g => { groups = g; } });
    } catch (e) { _err = e; console.warn('[巡游] 采集开场模型失败：', e); }
    if (!groups || !groups.length) {
        // ★ 2026-09-26：把真实原因一并抛出（有异常 → 异常信息；无异常 → 一个模型都没采到），
        //   便于下次直接定位；同时打到控制台。
        const why = _err ? ((_err && _err.message) ? _err.message : String(_err)) : '未采集到任何模型';
        console.warn('[巡游] 采集失败原因：', why);
        if (typeof showToast === 'function') showToast('开场模型采集失败：' + why);
        return;
    }

    const old = document.getElementById('exTourOverlay'); if (old) old.remove();
    const ov = document.createElement('div'); ov.id = 'exTourOverlay';
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    const panel = document.createElement('div'); panel.className = 'ex-tour-panel';
    ov.appendChild(panel);

    const x = document.createElement('button'); x.type = 'button'; x.className = 'ex-tour-x'; x.title = '关闭'; x.textContent = '✕';
    x.addEventListener('click', e => { e.stopPropagation(); ov.remove(); });
    panel.appendChild(x);

    const h = document.createElement('h3');
    h.appendChild(tutIconEl('film', 20));
    const hT = document.createElement('span'); hT.textContent = '巡游 · 开场模型'; h.appendChild(hT);
    panel.appendChild(h);

    const sub = document.createElement('div'); sub.className = 'ex-tour-sub';
    sub.textContent = '勾选要载入的模型，选定后会新建一个项目把它们装进去。每一项都是真实 FMBE 方块，可用「导出指令」原样复刻。';
    panel.appendChild(sub);

    const list = document.createElement('div'); list.className = 'ex-tour-list';
    const picked = new Set(groups.map(g => g.key));
    let syncGo = () => {};
    groups.forEach(g => {
        const row = document.createElement('div');
        row.className = 'ex-tour-item on';
        const tick = document.createElement('span'); tick.className = 'ex-tour-tick'; tick.textContent = '✓';
        const ic = document.createElement('span'); ic.className = 'ic'; ic.appendChild(tutIconEl(g.icon, 22));
        const tx = document.createElement('div'); tx.className = 'tx';
        const tt = document.createElement('div'); tt.className = 'tt'; tt.textContent = g.name;
        const ds = document.createElement('div'); ds.className = 'ds';
        ds.textContent = `${g.desc} · ${g.count} 块 · 约 ${g.size[0]}×${g.size[1]} 单位`;
        tx.appendChild(tt); tx.appendChild(ds);
        row.appendChild(tick); row.appendChild(ic); row.appendChild(tx);
        row.addEventListener('click', () => {
            if (picked.has(g.key)) picked.delete(g.key); else picked.add(g.key);
            row.classList.toggle('on', picked.has(g.key));
            syncGo();
        });
        list.appendChild(row);
    });
    panel.appendChild(list);

    const foot = document.createElement('div'); foot.className = 'ex-tour-foot';
    const all = document.createElement('button'); all.type = 'button'; all.className = 'ex-tour-all';
    all.textContent = '全选 / 全不选';
    all.addEventListener('click', e => {
        e.stopPropagation();
        const turnOn = picked.size !== groups.length;
        picked.clear(); if (turnOn) groups.forEach(g => picked.add(g.key));
        list.querySelectorAll('.ex-tour-item').forEach((row, i) => row.classList.toggle('on', picked.has(groups[i].key)));
        syncGo();
    });
    const sp = document.createElement('span'); sp.className = 'ex-tour-sp';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'ex-tour-btn ghost'; cancel.textContent = '取消';
    cancel.addEventListener('click', e => { e.stopPropagation(); ov.remove(); });
    const go = document.createElement('button'); go.type = 'button'; go.className = 'ex-tour-btn go';
    go.addEventListener('click', async e => {
        e.stopPropagation();
        const sel = groups.filter(g => picked.has(g.key));
        if (!sel.length) return;
        go.disabled = true; go.textContent = '正在载入…';
        const text = sel.map(g => g.commands.join('\n')).join('\n');
        const total = sel.reduce((n, g) => n + g.count, 0);
        ov.remove();
        // 离开教程（进度已保存，可在「设置 → 新手教程」继续），再开新项目，避免教程状态与新项目错位
        try { if (typeof tutActive !== 'undefined' && tutActive) closeTutorial(false); } catch (e2) {}
        try { await createProjectFromCommands(text, '开场模型'); } catch (e2) { console.error('[巡游] 新建项目失败', e2); }
        if (typeof showToast === 'function') showToast(`已新建项目「开场模型」：${sel.length} 组 / 共 ${total} 个方块`);
    });
    syncGo = () => {
        go.textContent = picked.size ? `新建项目并加载（${picked.size} 项）` : '请至少勾选一项';
        go.disabled = picked.size === 0;
    };
    syncGo();
    foot.appendChild(all); foot.appendChild(sp); foot.appendChild(cancel); foot.appendChild(go);
    panel.appendChild(foot);

    document.body.appendChild(ov);
}

// ---- 教程目录背景：SVG 打点绘制（参考图 1:1 坐标系）----
// 实测自 1debdb02…jpg（2780x1134）：背景 = 平涂色块 + 锐利 30° 直边 + 淡蓝三角线稿交织。
// 色板（像素采样）：底白 #fbfbfd / 淡蓝 #afd2f0 / 薰衣草 #dbe3fb / 灰 #ccd2dc / 靛蓝 #465aa0 / 深藏青 #28466e
// 各块位置均为连通域/网格实测比例，非目测。
// ---- 教程目录背景：参考图「打点」矢量化（非目测/非渐变近似）----
// 数据来源：把 1debdb02…jpg（2780x1134）按语义栅格化 -> 3x3 众数滤波去噪
//   -> 连通域 -> 边界链 -> RDP 简化，得到 46 个平涂色块的锐边直边多边形。
// 卡片/按钮所占的 x .398-.947 / y .162-.888 区域被挖空并由邻域回填，因为那部分
// 由 HTML 卡片层自己绘制；背景不得重复画。
// 客观验证：与参考图同分类器逐格比对，整页一致度 95.0%、背景区 96.1%。
// ---- 教程目录背景：参考图「打点」矢量化（非目测/非渐变近似）----
// 数据来源：把 1debdb02…jpg（2780x1134）按语义栅格化 -> 3x3 众数滤波去噪
//   -> 连通域 -> 边界链 -> RDP 简化，得到 46 个平涂色块的锐边直边多边形。
// 卡片/按钮所占的 x .398-.947 / y .162-.888 区域被挖空并由邻域回填，因为那部分
// 由 HTML 卡片层自己绘制；背景不得重复画。
// 客观验证：与参考图同分类器逐格比对，整页一致度 95.0%、背景区 96.1%。
// ---- 教程目录背景：参考图「打点」矢量化（非目测/非渐变近似）----
// 数据来源：把 1debdb02…jpg（2780x1134）按语义栅格化 -> 3x3 众数滤波去噪
//   -> 连通域 -> 边界链 -> RDP 简化，得到 46 个平涂色块的锐边直边多边形。
// 卡片/按钮所占的 x .398-.947 / y .162-.888 区域被挖空并由邻域回填，因为那部分
// 由 HTML 卡片层自己绘制；背景不得重复画。
// 客观验证：与参考图同分类器逐格比对，整页一致度 95.0%、背景区 96.1%。
// ---- 教程目录背景：参考图「打点」矢量化（非目测/非渐变近似）----
// 数据来源：把 1debdb02…jpg（2780x1134）按语义栅格化 -> 3x3 众数滤波去噪
//   -> 连通域 -> 边界链 -> RDP 简化，得到 46 个平涂色块的锐边直边多边形。
// 整图矢量化（含藏青横幅、左侧靛蓝面板、白卡、淡蓝三角线稿）；DOM 卡片层
// （白色平行四边形 + 青色描边）叠在其上，靛蓝从卡片缝隙透出，与参考图一致。
// ---- 教程目录背景：参考图「打点」矢量化（非目测/非渐变近似）----
// 数据来源：把 1debdb02…jpg（2780x1134）按语义栅格化 -> 3x3 众数滤波去噪
//   -> 连通域 -> 边界链 -> RDP 简化，得到 46 个平涂色块的锐边直边多边形。
// 整图矢量化（含藏青横幅、左侧靛蓝面板、白卡、淡蓝三角线稿）；DOM 卡片层
// （白色平行四边形 + 青色描边）叠在其上，靛蓝从卡片缝隙透出，与参考图一致。
// ---- 教程目录背景：参考图「打点」矢量化（非目测/非渐变近似）----
// 数据来源：把 1debdb02…jpg（2780x1134）按语义栅格化 -> 3x3 众数滤波去噪
//   -> 连通域 -> 边界链 -> RDP 简化，得到 46 个平涂色块的锐边直边多边形。
// 整图矢量化（含藏青横幅、左侧靛蓝面板、白卡、淡蓝三角线稿）；DOM 卡片层
// （白色平行四边形 + 青色描边）叠在其上，靛蓝从卡片缝隙透出，与参考图一致。
function tutBgSVG() {
  const W = 2780, H = 1134;
  // ---- 低多边形浅蓝网格：按列从左到右平滑渐变（实测 左(195,216,240)→右(232,240,252)），
  //      相邻三角用极接近双色切面，呈干净低多边形质感 ----
  const cols = 7, rows = 4;
  const jx = (c, r) => Math.sin(c * 12.9 + r * 78.2) * (W / cols) * 0.16;
  const jy = (c, r) => Math.cos(c * 39.3 + r * 11.7) * (H / rows) * 0.16;
  const P = (c, r) => [ (c * (W / cols) + jx(c, r)).toFixed(1), (r * (H / rows) + jy(c, r)).toFixed(1) ];
  function shadeAt(c, rr) {
    const t = c / cols;
    let R = Math.round(195 + 37 * t);
    let G = Math.round(216 + 24 * t);
    let B = Math.round(240 + 12 * t);
    if ((c + rr) % 2 === 1) { R -= 9; G -= 9; B -= 9; }
    return 'rgb(' + R + ',' + G + ',' + B + ')';
  }
  let mesh = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = P(c, r), b = P(c + 1, r), d = P(c, r + 1), e = P(c + 1, r + 1);
      const sh = shadeAt(c, r);
      mesh += '<path fill="' + sh + '" d="M' + a[0] + ',' + a[1] + 'L' + b[0] + ',' + b[1] + 'L' + e[0] + ',' + e[1] + 'Z"/>';
      mesh += '<path fill="' + sh + '" d="M' + a[0] + ',' + a[1] + 'L' + e[0] + ',' + e[1] + 'L' + d[0] + ',' + d[1] + 'Z"/>';
    }
  }
  const defs = '<defs>'
    + '<linearGradient id="gradNavy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a6e92"/><stop offset="1" stop-color="#284e6e"/></linearGradient>'
    // 左侧靛蓝章节面板：实测为「左深靛蓝(65,83,154) → 右接浅网格(215,227,253)」的横向渐变
    + '<linearGradient id="gradIndigo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#41598c"/><stop offset="0.55" stop-color="#8ea2cf"/><stop offset="1" stop-color="#cdd9f4"/></linearGradient>'
    + '</defs>';
  const base = '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#d6e3f4"/>';
  const beam = '<path fill="#ffffff" opacity="0.13" d="M-60,0L470,0L1830,1134L1350,1134Z"/>';
  const indigo = '<path fill="url(#gradIndigo)" d="M417,113L1084,113L1084,567L417,567Z"/>';
  const banner = '<path fill="url(#gradNavy)" d="M1466,84L2272,84L2272,158L1466,158Z"/>';
  // 右缘大「>」箭头（青色，实测 x.785-.893 y.24-.66 → viewBox 2184-2486,272-748）
  const arrow = '<path fill="#6cc6f4" d="M2240,470L2400,567L2240,664L2308,567Z"/>';
  return '<svg class="ex-tut-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" '
    + 'xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">'
    + defs + base + mesh + beam + indigo + banner + arrow + '</svg>';
}

function openTutorialOverview() {
    // 打开目录 = 用户已选择进入教程：先清掉可能残留的欢迎卡，避免它整屏盖住目录与后续操作
    try { const w = document.getElementById('exTutWelcome'); if (w) w.remove(); } catch (e) {}
    tutEnsureUI();
    tutSetDock(false);   // 2026-10-17：退出教程 → 还原底部预留带与顶部布局
    tutClearPoll();
    try { tutTypeStop(); } catch (e) {}
    try { tutCloseLogPanel(); } catch (e) {}
    try { tutUpdateGuard(); } catch (e) {}
    tutEnsureDoneLoaded();
    const root = document.getElementById('exTutRoot'); if (!root) return;
    const oldOv = document.getElementById('exTutOverlay'); if (oldOv) oldOv.remove();
    const ov = document.createElement('div'); ov.className = 'ex-tut-overlay'; ov.id = 'exTutOverlay';
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    const page = document.createElement('div'); page.className = 'ex-tut-page';
    page.addEventListener('click', (e) => e.stopPropagation());

    // ---- 顶栏：品牌 + 总进度 + 关闭（★2026-10-16 用户要求：章切换按钮从顶栏移到页面左右两侧）----
    const head = document.createElement('div'); head.className = 'ex-tut-head';
    const brand = document.createElement('div'); brand.className = 'ex-tut-brand';
    const bTx = document.createElement('span'); bTx.textContent = '新手教程 · 章节目录';
    brand.appendChild(bTx);
    head.appendChild(brand);
    const headR = document.createElement('div'); headR.className = 'ex-tut-head-right';
    const navPrev = document.createElement('button'); navPrev.type = 'button'; navPrev.className = 'ex-tut-nav prev'; navPrev.innerHTML = TUT_CHEV_L; navPrev.title = '上一章';
    const navNext = document.createElement('button'); navNext.type = 'button'; navNext.className = 'ex-tut-nav next'; navNext.innerHTML = TUT_CHEV_R; navNext.title = '下一章';
    const flag = document.createElement('div'); flag.className = 'ex-tut-flag';
    const flagTxt = document.createElement('span'); flag.appendChild(flagTxt);
    const tocX = document.createElement('button'); tocX.type = 'button'; tocX.className = 'ex-tut-x ex-tut-page-x';
    tocX.title = '退出（进度已保存，随时可在「设置 → 新手教程」继续）'; tocX.textContent = '✕';
    tocX.addEventListener('click', (e) => { e.stopPropagation(); try { exTutSfx('prev'); } catch (e3) {} ov.remove(); try { showToast('进度已保存；随时可在「设置 → 新手教程」继续'); } catch (e2) {} });
    headR.appendChild(flag); headR.appendChild(tocX);
    head.appendChild(headR);
    page.appendChild(head);

    // ---- 主体：左（章信息 + 目题胶囊 + 返回）/ 右（相册实时截图） ----
    const main = document.createElement('div'); main.className = 'ex-tut-main';
    const left = document.createElement('div'); left.className = 'ex-tut-left';
    const chinfo = document.createElement('div'); chinfo.className = 'ex-tut-chinfo';
    const chNum = document.createElement('div'); chNum.className = 'ch-num';
    const chName = document.createElement('div'); chName.className = 'ch-name';
    const chDesc = document.createElement('div'); chDesc.className = 'ch-desc';
    const chProg = document.createElement('div'); chProg.className = 'ch-prog';
    chinfo.appendChild(chNum); chinfo.appendChild(chName); chinfo.appendChild(chDesc); chinfo.appendChild(chProg);
    const pills = document.createElement('div'); pills.className = 'ex-tut-pills';
    const lfoot = document.createElement('div'); lfoot.className = 'ex-tut-lfoot';
    const retBtn = document.createElement('button'); retBtn.type = 'button'; retBtn.className = 'ex-tut-return'; retBtn.textContent = '返回';
    retBtn.addEventListener('click', (e) => { e.stopPropagation(); try { exTutSfx('prev'); } catch (e3) {} ov.remove(); });
    const tour = document.createElement('div'); tour.className = 'ex-tut-tour-link';
    tour.innerHTML = TUT_FILM_SVG + '<span>巡游</span>';
    tour.title = '开场模型巡游';
    tour.addEventListener('click', (e) => { e.stopPropagation(); try { exTutSfx('next'); } catch (e3) {} ov.remove(); try { openIntroTourPanel(); } catch (e2) {} });
    lfoot.appendChild(retBtn); lfoot.appendChild(tour);
    left.appendChild(chinfo); left.appendChild(pills); left.appendChild(lfoot);

    const right = document.createElement('div'); right.className = 'ex-tut-right';
    const photo = document.createElement('div'); photo.className = 'ex-tut-photo';
    // ★外层 photo = 纯定位/动画壳（不再承担白卡与 clip-path），内层 photo-card 才是「白卡纸 + 斜切」。
    //   原因：左下角折角三角(.ex-tut-photo-corner)正好落在白卡的斜切区内，
    //   若它还是白卡的子节点，就会被白卡的 clip-path **一起裁掉**（用户报「左下角缺一个三角形」）。
    //   拆成兄弟节点后折角不再受白卡裁剪，才能画出来。
    const card = document.createElement('div'); card.className = 'ex-tut-photo-card';
    const photoIn = document.createElement('div'); photoIn.className = 'ex-tut-photo-in';
    const shot = document.createElement('img'); shot.className = 'ex-tut-shot'; shot.alt = '该目画面预览';
    const shotPh = document.createElement('div'); shotPh.className = 'ex-tut-shot-ph';
    shotPh.textContent = '该目暂无截图';
    // 相册 = 「该目会有的画面」：每目一张、浅/深两套，放在与 index.html 同级的 TutorialShots/ 目录
    // （`L_章_目.jpg` / `D_章_目.jpg`，由 _gen_tut_shots_dir.cjs 驱动教程逐目截「整屏（含 App UI）」生成）；
    // 图缺失 / 加载失败时退回「实时截当前 3D 场景」。
    shot.classList.add('empty');
    let _liveUrl = '';
    const _liveGrab = () => {
        try {
            const u = (typeof window.__exCaptureCanvas === 'function') ? window.__exCaptureCanvas() : '';
            if (u && u.length > _liveUrl.length) _liveUrl = u;
        } catch (e) {}
        return _liveUrl;
    };
    const _shotPath = (ci, si) => 'TutorialShots/' + (document.body.classList.contains('light-mode') ? 'L' : 'D')
        + '_' + String(ci).padStart(2, '0') + '_' + String(si).padStart(2, '0') + '.jpg';
    let _shotSeq = 0;
    const _fallbackLive = () => {
        let tries = 0;
        const tick = () => {
            const u = _liveGrab();
            if (u && u.length > 20000) { shot.src = u; shot.classList.remove('empty'); shotPh.classList.remove('on'); return; }
            if (++tries < 6) setTimeout(tick, 300);
        };
        tick();
    };
    const showShotFor = (ci, si) => {
        const seq = ++_shotSeq;
        shot.classList.remove('empty');
        // 该目没有截图文件时，占位框里显示文字而不是破图图标
        try {
            const secs = tutChapterSections(ci);
            const sec = secs && secs[si];
            shotPh.textContent = sec ? (sec.n + ' · 暂无截图') : '该目暂无截图';
        } catch (e) {}
        shot.onload = () => { if (seq === _shotSeq) { shot.classList.remove('empty'); shotPh.classList.remove('on'); } };
        shot.onerror = () => {
            if (seq !== _shotSeq) return;
            shot.onerror = null;
            // ★2026-10-22：该目没有截图文件时，不能留着坏掉的 src（浏览器会画出破图图标）。
            //   先撤掉 src 回到渐变占位，再尝试用实时画面顶上；实时画面也拿不到就保留文字占位，不显示破图。
            shot.classList.add('empty');
            shot.removeAttribute('src');
            shotPh.classList.add('on');
            _fallbackLive();
        };
        shot.src = _shotPath(ci, si);
    };
    _liveGrab();   // 预热（供 onerror 兜底立刻可用）
    const corner = document.createElement('div'); corner.className = 'ex-tut-photo-corner';
    const pin = document.createElement('div'); pin.className = 'ex-tut-photo-pin';
    photoIn.appendChild(shot);
    photoIn.appendChild(shotPh);
    // card = 白卡纸（承担 padding + 斜切）；corner/pin 挂在 photo 上做兄弟，
    // 否则会被 card 的 clip-path 一起裁掉（折角三角消失）。
    card.appendChild(photoIn);
    photo.appendChild(card); photo.appendChild(corner); photo.appendChild(pin);
    // 悬停目题 → 相纸以一个小随机角度缓动落下，落定后左右快速晃两下
    let _dropT = null;
    const dropCard = () => {
        try {
            photo.style.setProperty('--exDropR', (Math.random() * 12 - 6).toFixed(2) + 'deg');
            photo.classList.remove('dropin');
            void photo.offsetWidth;                 // 强制重排以重启动画
            photo.classList.add('dropin');
            if (_dropT) clearTimeout(_dropT);
            _dropT = setTimeout(() => photo.classList.remove('dropin'), 1000);
        } catch (e) {}
    };
    right.appendChild(photo);
    main.appendChild(left); main.appendChild(right);
    page.appendChild(main);
    // ★章切换按钮：贴在页面【左右两侧】垂直居中（用户 2026-10-16：「从左上角改到左右两边，做一个 <>」）。
    //   绝对定位于 .ex-tut-page（它本身 position:relative），比顶栏更符合「翻页」直觉；
    //   禁用态用 .off（半透明 + 不可点），仍占位、不跳布局。
    page.appendChild(navPrev); page.appendChild(navNext);

    // 浏览定位：默认停在「最高已解锁」的章（= 当前进度所在处）
    let tutBrowseCi = 0;
    for (let i = EX_TUT_CHAPTERS.length - 1; i >= 0; i--) { if (tutIsChapterUnlocked(i)) { tutBrowseCi = i; break; } }

    function renderPage() {
        const ci = tutBrowseCi;
        const ch = EX_TUT_CHAPTERS[ci];
        const secs = tutChapterSections(ci);
        const unlocked = tutIsChapterUnlocked(ci);
        chNum.textContent = '第' + (ci + 1) + '章';
        chName.textContent = ch.title;
        chDesc.textContent = ch.desc || '';
        const doneCnt = secs.filter((_, si) => tutIsSectionDone(ci, si)).length;
        chProg.textContent = unlocked ? (doneCnt >= secs.length ? '本章已通关' : ('本章 ' + doneCnt + ' / ' + secs.length + ' 目')) : '先完成上一章';
        const t = tutSectionTotals();
        flagTxt.textContent = (t[0] >= t[1]) ? '已通关所有' : ('总进度 ' + t[0] + ' / ' + t[1] + ' 目');
        pills.innerHTML = '';
        let firstUnlocked = -1;
        secs.forEach((sec, si) => {
            const done = tutIsSectionDone(ci, si);
            const p = document.createElement('button'); p.type = 'button';
            p.className = 'ex-tut-pill' + (done ? ' done' : '') + (unlocked ? '' : ' locked');
            const num = document.createElement('span'); num.className = 'pl-num'; num.textContent = String(si + 1).padStart(2, '0');
            const tx = document.createElement('span'); tx.className = 'pl-tx'; tx.textContent = sec.n;
            p.appendChild(num); p.appendChild(tx);
            if (unlocked) {
                if (firstUnlocked < 0) firstUnlocked = si;
                p.addEventListener('mouseenter', () => {
                    // 音效：悬停切换目题 = 清脆「哒」；同一目反复划过不重复响
                    if (!p.classList.contains('sel')) { try { exTutSfx('select'); } catch (e3) {} }
                    for (const c of pills.children) c.classList.remove('sel');
                    p.classList.add('sel'); showShotFor(ci, si); dropCard();
                });
                p.addEventListener('click', (e) => { e.stopPropagation(); try { exTutSfx('next'); } catch (e3) {} ov.remove(); try { tutStartCourse(ci, sec.from, false); } catch (e2) {} });
            } else {
                p.addEventListener('click', (e) => { e.stopPropagation(); try { exTutSfx('error'); } catch (e3) {} try { showToast('先完成上一章才能解锁这一章哦'); } catch (e2) {} });
            }
            pills.appendChild(p);
        });
        if (firstUnlocked >= 0 && pills.children[firstUnlocked]) pills.children[firstUnlocked].classList.add('sel');
        showShotFor(ci, firstUnlocked >= 0 ? firstUnlocked : 0);
        dropCard();
        navPrev.classList.toggle('off', ci <= 0);
        navNext.classList.toggle('off', ci >= EX_TUT_CHAPTERS.length - 1);
    }
    navPrev.addEventListener('click', () => { if (tutBrowseCi > 0) { tutBrowseCi--; try { exTutSfx('prev'); } catch (e3) {} renderPage(); } });
    navNext.addEventListener('click', () => { if (tutBrowseCi < EX_TUT_CHAPTERS.length - 1) { tutBrowseCi++; try { exTutSfx('next'); } catch (e3) {} renderPage(); } });
    // 键盘 ←/→ 也能换章；弹窗关闭后监听自毁
    const keyH = (e) => {
        if (!document.getElementById('exTutOverlay')) { document.removeEventListener('keydown', keyH); return; }
        if (e.key === 'ArrowLeft') navPrev.click();
        if (e.key === 'ArrowRight') navNext.click();
    };
    document.addEventListener('keydown', keyH);

    renderPage();
    ov.appendChild(page);
    document.body.appendChild(ov);
}

// ---- 章节通关进度（持久化到教程存档）----
let tutChapterDoneSet = new Set();      // 已通关章节下标集合
let tutSectionDoneSet = new Set();      // 已通关「目」键集合："ci:si"
let tutDoneLoaded = false;
function tutEnsureDoneLoaded() {
    if (tutDoneLoaded) return;
    tutDoneLoaded = true;
    try {
        const sv = tutLoad();
        (sv.doneChapters || []).forEach(ci => tutChapterDoneSet.add(ci));
        (sv.doneSections || []).forEach(k => tutSectionDoneSet.add(k));
        // 旧版已「整课完成」的用户：放开全部章节与目自由复习
        if (sv.done) {
            for (let i = 0; i < EX_TUT_CHAPTERS.length; i++) {
                tutChapterDoneSet.add(i);
                tutChapterSections(i).forEach((_, si) => tutSectionDoneSet.add(i + ':' + si));
            }
        }
    } catch (e) {}
}
// 章 → 目 划分（TUT_SECTIONS 无划分的章整章算一目）
function tutChapterSections(ci) {
    const ch = EX_TUT_CHAPTERS[ci]; if (!ch) return [];
    const arr = (typeof TUT_SECTIONS !== 'undefined') && TUT_SECTIONS[ci];
    if (arr && arr.length) return arr;
    return [{ n: '完整通关', d: ch.desc || '', from: 0, to: Math.max(0, ch.steps.length - 1) }];
}
function tutMarkChapterDone(ci) { tutEnsureDoneLoaded(); tutChapterDoneSet.add(ci); try { tutSave({ doneChapters: [...tutChapterDoneSet] }); } catch (e) {} }
function tutMarkSectionDone(ci, si) { tutEnsureDoneLoaded(); tutSectionDoneSet.add(ci + ':' + si); try { tutSave({ doneSections: [...tutSectionDoneSet] }); } catch (e) {} }
function tutIsSectionDone(ci, si) { tutEnsureDoneLoaded(); return tutSectionDoneSet.has(ci + ':' + si); }
// 解锁规则：第 1 章恒开；上一章已通关、或本章程已通关（自由复习前面的章节）才开
function tutIsChapterUnlocked(ci) { tutEnsureDoneLoaded(); return ci === 0 || tutChapterDoneSet.has(ci - 1) || tutChapterDoneSet.has(ci); }
// 全课程目进度：[已完成目数, 总目数]
function tutSectionTotals() {
    let done = 0, total = 0;
    for (let ci = 0; ci < EX_TUT_CHAPTERS.length; ci++) {
        tutChapterSections(ci).forEach((_, si) => { total++; if (tutIsSectionDone(ci, si)) done++; });
    }
    return [done, total];
}
// 「» 双箭头跳过本目」：把当前所在「目」标记通关，并推进到下一目第一步。
// 推进口径与卡片「下一步」(tutGoNext) 完全一致：落本目最后一步再 +1 = 下一目第一步；
// 本目即章末最后一目时走章末统一分支（全目过 → 章通关 → 问是否继续下一章 / 全课完成）。
function tutSkipSection() {
    if (!EX_TUT_CHAPTERS || !EX_TUT_CHAPTERS.length) return;
    const ch = EX_TUT_CHAPTERS[tutChapter]; if (!ch) return;
    const n = ch.steps.length;
    const secs = tutChapterSections(tutChapter);
    const si = secs.findIndex(x => tutStep >= x.from && tutStep <= x.to);
    try { tutSaveProgress(); } catch (e) {}
    if (si >= 0) tutMarkSectionDone(tutChapter, si);
    if (si >= 0 && tutStep < secs[si].to) tutStep = secs[si].to;
    try { exTutSfx('complete'); } catch (e3) {}
    if (tutStep < n - 1) {
        tutStep++;
        try { tutRender(); tutLayout(); } catch (e) { console.warn('tutSkipSection render', e); }
        try { showToast('已跳过本目'); } catch (e) {}
        return;
    }
    if (secs.every((x, i) => tutIsSectionDone(tutChapter, i))) tutMarkChapterDone(tutChapter);
    if (tutChapter < EX_TUT_CHAPTERS.length - 1) { tutShowChapterDone(tutChapter, tutChapter + 1); return; }
    try { tutSave({ done: 1, ts: Date.now(), chapter: tutChapter, step: tutStep }); } catch (e) {}
    try { closeTutorial(true); } catch (e) {}
    try { showToast('课程完成！'); } catch (e) {}
}
// 章节结束：询问是否继续下一章
// 2026-10-17 重设计：不再复用目录弹窗的裸 .ex-tut-toc 壳（矩形按钮 + 🎉 emoji 被用户点名「没设计感/掉价」），
// 改用专属 .ex-tut-done 弹窗：顶部渐变对勾徽章（SVG，无 emoji）+ 渐变标题 + 胶囊按钮。
function tutShowChapterDone(curCi, nextCi) {
    const old = document.getElementById('exTutChapterDone'); if (old) old.remove();
    const ov = document.createElement('div'); ov.id = 'exTutChapterDone'; ov.className = 'ex-tut-overlay';
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    const box = document.createElement('div'); box.className = 'ex-tut-done';
    // 写实红墨章：透明底 + 红框 + 红字「完成」，边缘经 SVG turbulence 位移滤镜做毛糙墨渍，
    // 叠一层 svg 噪声做墨色浓淡斑驳；重重砸在卡片右下角。
    const badge = document.createElement('div'); badge.className = 'ex-tut-done-stamp';
    badge.innerHTML = '<span class="zd">完成</span>';
    const ink = document.createElement('div'); ink.className = 'ex-tut-done-stamp-ink'; badge.appendChild(ink);
    // 注入墨渍位移滤镜（胶带感边缘），供 stamp 的 filter:url(#exTutInkFilter) 引用
    const svgns = 'http://www.w3.org/2000/svg';
    const svgF = document.createElementNS(svgns, 'svg');
    svgF.setAttribute('width', '0'); svgF.setAttribute('height', '0');
    svgF.style.position = 'absolute';
    const filt = document.createElementNS(svgns, 'filter');
    filt.setAttribute('id', 'exTutInkFilter');
    filt.setAttribute('x', '-25%'); filt.setAttribute('y', '-25%');
    filt.setAttribute('width', '150%'); filt.setAttribute('height', '150%');
    const turb = document.createElementNS(svgns, 'feTurbulence');
    turb.setAttribute('type', 'fractalNoise');
    turb.setAttribute('baseFrequency', '0.045 0.06');
    turb.setAttribute('numOctaves', '3'); turb.setAttribute('seed', '7');
    turb.setAttribute('result', 't');
    const disp = document.createElementNS(svgns, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic'); disp.setAttribute('in2', 't');
    disp.setAttribute('scale', '4');
    disp.setAttribute('xChannelSelector', 'R'); disp.setAttribute('yChannelSelector', 'G');
    filt.appendChild(turb); filt.appendChild(disp); svgF.appendChild(filt);
    ov.appendChild(svgF);
    // 印章砸下配音（低频闷击「咚」+ 木质瞬态 + 纸噪），与落地时刻（delay .41s）同步触发
    setTimeout(() => { try { exTutSfx('stamp'); } catch (e3) {} box.classList.add('shake'); }, 410);
    const h = document.createElement('div'); h.className = 'ex-tut-done-title';
    h.textContent = '第 ' + (curCi + 1) + ' 章';
    const p = document.createElement('div'); p.className = 'ex-tut-done-text';
    p.textContent = '做得好！下一章是第 ' + (nextCi + 1) + ' 章。要现在继续，还是先回到目录自由复习前面的章节？';
    const foot = document.createElement('div'); foot.className = 'ex-tut-done-foot';
    const back = document.createElement('button'); back.type = 'button'; back.className = 'ex-tut-done-back';
    back.textContent = '返回目录';
    back.addEventListener('click', () => { try { exTutSfx('prev'); } catch (e3) {} ov.remove(); try { closeTutorial(false); } catch (e) {} openTutorialOverview(); });
    const go = document.createElement('button'); go.type = 'button'; go.className = 'ex-tut-done-go';
    go.innerHTML = '继续第 ' + (nextCi + 1) + ' 章 <span class="ar">→</span>';
    go.addEventListener('click', () => { try { exTutSfx('next'); } catch (e3) {} ov.remove(); tutChapter = nextCi; tutStep = 0; try { tutRender(); tutLayout(); } catch (e) {} });
    foot.appendChild(back); foot.appendChild(go);
    box.appendChild(badge); box.appendChild(h); box.appendChild(p); box.appendChild(foot);
    ov.appendChild(box); document.body.appendChild(ov);
}
// ---- 关闭 ----
function closeTutorial(completed) {
    tutClearPoll();
    try { tutAnimStop(); } catch (e) {}   // 退出教程：停掉讲解动画并还原方块，不留残余
    try { tutCleanupDemoBlocks(); } catch (e) {}   // 退出教程：删掉教程自己造的临时教学方块（用户原话：「有个方块是没删的」）
    try { if (tutScrollTimer) { clearTimeout(tutScrollTimer); tutScrollTimer = null; } } catch (e) {}
    tutAwaitScroll = false;
    try { if (tutCardRO) { tutCardRO.disconnect(); tutCardRO = null; } } catch (e) {}
    try { tutTypeStop(); } catch (e) {}
    try { tutCloseLogPanel(); } catch (e) {}
    try { tutCloseMenuPop(); } catch (e) {}   // 一并摘掉「菜单」两枚小按钮的 document 监听
    // 教程退出时收起由设置面板步自动打开的面板（避免退出后仍挡着画布）
    if (tutSettingsStepActive && tutSettingsOpen()) { try { toggleUISettingsPanel(); } catch (e) {} }
    tutSettingsStepActive = false;
    const ov = document.getElementById('exTutOverlay'); if (ov) ov.remove();
    const tov = document.getElementById('exTourOverlay'); if (tov) tov.remove();   // 巡游清单弹窗一并收起
    // 聚光框 v2 可能内嵌在目标/其 offsetParent 里（tutSpotAttach）：先还原宿主上的临时
    // position:relative 并把框移回 root，再移除 root，避免框残留在应用 DOM、宿主样式不复原。
    try { tutSpotDetach(document.querySelector('.ex-tut-spot')); } catch (e) {}
    const root = document.getElementById('exTutRoot'); if (root) root.remove();
    const gl = document.getElementById('exTutGuardLayer'); if (gl) gl.remove();
    tutElevateRestoreAll();
    tutUIReady = false; tutSetDock(false);   // 2026-10-17：退出教程 → 还原底部预留带与顶部布局
    if (!completed) tutSaveProgress();
}
// ---- 首启自动弹出 ----
let tutAutoShown = false;
// 真机资源 / 场景就绪后再播片头：避免设备尚未加载好（首帧未渲染、WebGL 未热身、场景未就绪）
// 就开播导致黑屏 / 缺块；同时设上限兜底，超时直接进欢迎卡，绝不卡死用户。
let _introReadyToken = 0;
function startCinematicIntroWhenReady(onDone, opts) {
    _introReadyToken++;
    const token = _introReadyToken;
    let frames = 0, attempts = 0;
    const MAXA = 420; // 约 7s（60fps）上限，超时直接放行（不播片头）
    const sceneReady = () =>
        (typeof renderer !== 'undefined' && renderer) &&
        (typeof scene !== 'undefined' && scene) &&
        (typeof camera !== 'undefined' && camera) &&
        (typeof controls !== 'undefined' && controls) &&
        (typeof THREE !== 'undefined') &&
        (document.readyState === 'complete' || document.readyState === 'interactive');
    function tick() {
        if (token !== _introReadyToken) return; // 已有更新的触发，本路作废
        attempts++;
        if (sceneReady()) {
            frames++;
            if (frames >= 2) { // 至少两帧已渲染：WebGL 已热身、网格已建好、场景已稳定
                try { playCinematicIntro(onDone, opts); } catch (e) { try { onDone && onDone(); } catch (_) {} }
                return;
            }
        } else {
            frames = 0;
        }
        if (attempts >= MAXA) { try { onDone && onDone(); } catch (_) {} return; }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function maybeStartTutorial() {
    if (tutAutoShown) return;
    // bf 转换器等外部网站经 URL(#cmds=) 导入模型：不播开场动画、不弹新手教程，直接导入。
    if (EXTERNAL_URL_IMPORT) { tutAutoShown = true; return; }
    const s = tutLoad();
    if (s.done || s.welcomed) { tutAutoShown = true; return; } // 已完成 / 点过「以后再说」：不再自动打扰
    // 仅「项目列表」界面首次进入才自动播片头；不在项目内误触发
    const atList = projectManagerEl && projectManagerEl.style.display !== 'none';
    if (!introSeen()) {
        if (atList) {
            tutAutoShown = true;
            startCinematicIntroWhenReady(() => setTimeout(showTutorialWelcome, 350), { allowSkip: false });
        }
        // 不在列表界面则暂不触发，等回到列表的后续调用（tutAutoShown 仍为 false，允许重试）
        return;
    }
    tutAutoShown = true;
    setTimeout(showTutorialWelcome, 900);
}
function openTutorialNow() { tutAutoShown = true; openTutorialOverview(); }

