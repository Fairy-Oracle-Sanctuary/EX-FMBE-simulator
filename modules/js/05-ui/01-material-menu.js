/* 05-ui/01-material-menu.js · 源 测试版v.6b79.html 第 21701-22513 行 */
'use strict';
// ==================== 材质菜单（支持多选批量） ====================
const materialMenuDiv = document.createElement('div');
materialMenuDiv.className = 'material-menu';
materialMenuDiv.style.display = 'none';
document.body.appendChild(materialMenuDiv);
// 菜单内部点击标记：切换子面板时内容会被整体重建，
// 此时点击到的节点已从DOM移除，外部 closeHandler 用 contains() 判断会误判为"点击外部"而关闭菜单。
// 事件传播路径在派发前已确定，所以这里仍能收到冒泡事件，用它做标记最可靠。
let mmInternalClick = false;
materialMenuDiv.addEventListener('click', () => { mmInternalClick = true; });
const colorPresets = ['#aaccff','#88aaff','#06b6d4','#8b5cf6','#f43f5e','#10b981','#facc15','#ffffff','#1e293b','#ef4444','#3b82f6','#eab308','#ec4899','#14b8a6','#a855f7','#ff7f50','#2dd4bf','#f97316','#6366f1','#94a3b8'];

// ============== 贴图预设 ==================

// <<<NEWMENU_INJECT_BEGIN>>>
// ============== 材质菜单（支持整体贴图 / 六面独立贴图 / 组合方块预设） ==============
// 记住上次浏览状态，反复挑贴图时不用每次重选分类
const mmState = { cat: 'all', q: '' };
// 默认白名单：TEX_CATS 中标记 def:true 的类别（通用实心方块默认可用）。
// 权限的唯一真源是 MODEL_REGISTRY[type].materialCategories；专用模型类别
// 只有被某个模型显式声明才会出现在菜单里。生成器不写任何“禁止”规则。
const MM_DEFAULT_CATS = TEX_CATS.filter(c => c.def).map(c => c.id);

// 暂时不对任何模型开放的「原版方块」预设（临时下架）。
// 仅从材质选择器中隐藏，数据仍保留；未来要重新开放，把对应 key 移出本集合即可。
// 注意：这些预设的贴图类别（func / nature）仍被其它方块使用，故按“预设级别”下架，
// 而非禁用整个类别（否则会误伤其它方块）。
const RESERVED_BLOCK_PRESETS = new Set([
    'lectern',                    // 讲台
    'enchanting_table',           // 附魔台
    'sniffer_egg_not_cracked',    // 嗅探兽的蛋（未裂开）
    'sniffer_egg_slightly_cracked', // 嗅探兽的蛋（轻微裂开）
    'sniffer_egg_very_cracked',   // 嗅探兽的蛋（严重裂开）
    'cauldron'                    // 炼药锅（贴图已全部禁用）
]);
// 禁用的单张贴图（文件名）：炼药锅的三张贴图全部禁用，
// 不出现在贴图选择器里，导入命令时也不映射。
const TEX_DISABLED = new Set([
    'cauldron_inner.png',   // 炼药锅·内
    'cauldron_side.png',    // 炼药锅·侧
    'cauldron_top.png'      // 炼药锅·顶
]);
// 判断贴图是否被禁用
function isTexDisabled(file) { return TEX_DISABLED.has(file); }
// 判断预设是否可用（未被下架）
function presetAvailable(p) { return !RESERVED_BLOCK_PRESETS.has(p[0]); }


// 拖放添加自定义贴图：仅当贴图选择器打开（mmDropOnPick 已设置）时生效，
// 避免影响其它菜单面板。拖入的图片与“本地上传”走同一路径（URL.createObjectURL）。
let mmDropOnPick = null;
materialMenuDiv.addEventListener('dragover', e => {
    if (!mmDropOnPick) return;
    e.preventDefault(); e.stopPropagation();
    materialMenuDiv.classList.add('mm-drag');
});
materialMenuDiv.addEventListener('dragleave', e => {
    if (e.target === materialMenuDiv) materialMenuDiv.classList.remove('mm-drag');
});
materialMenuDiv.addEventListener('drop', e => {
    if (!mmDropOnPick) return;
    e.preventDefault(); e.stopPropagation();
    materialMenuDiv.classList.remove('mm-drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { alert('请拖入图片文件'); return; }
    const cb = mmDropOnPick; mmDropOnPick = null;
    fileToDataURL(f).then(url => cb(url));   // 转 data URL，存档/导出/导入都能还原
});

// 缩略图懒加载：贴图库有 900+ 张 1024x1024 PNG，一次性加载会直接卡死浏览器
const mmLazyIO = new IntersectionObserver((entries, ob) => {
    entries.forEach(en => {
        if (!en.isIntersecting) return;
        const img = en.target;
        if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
        ob.unobserve(img);
    });
}, { rootMargin: '150px' });

// file 为空 -> 占位空图；lazy=false 时立即加载（用于只有6张图的分面面板）
function mmThumb(file, lazy = true) {
    // 必须用 .mm-thumb 包裹 <img>，否则图片无尺寸约束会按原图（1024²）溢出格子
    const wrap = document.createElement('div');
    wrap.className = 'mm-thumb';
    const img = document.createElement('img');
    img.alt = '';
    img.onerror = () => {
        // 懒加载尚未赋值时不算失败；真正的加载失败重试一次（带随机查询绕开可能存在的旧缓存），
        // 仍失败才隐藏，避免浏览器把历史上存错的图片一直显示成空白格子。
        if (!img.getAttribute('src')) return;
        if (img.dataset.retried) { img.style.visibility = 'hidden'; return; }
        img.dataset.retried = '1';
        const s = img.getAttribute('src');
        if (/^(data:|blob:)/i.test(s)) { img.style.visibility = 'hidden'; return; }
        img.src = s + (s.includes('?') ? '&' : '?') + 'r=' + Date.now();
    };
    if (file) {
        const u = texUrl(file);
        if (lazy) { img.dataset.src = u; mmLazyIO.observe(img); } else { img.src = u; }
    }
    wrap.appendChild(img);
    return wrap;
}

function mmHead(title, onBack, countText) {
    const h = document.createElement('div');
    h.className = 'mm-head';
    if (onBack) {
        const b = document.createElement('div');
        b.className = 'mm-back';
        b.textContent = '◀';
        b.addEventListener('click', e => { e.stopPropagation(); onBack(); });
        h.appendChild(b);
    }
    const t = document.createElement('div');
    t.className = 'mm-title';
    t.textContent = title;
    h.appendChild(t);
    if (countText) {
        const c = document.createElement('div');
        c.className = 'mm-count';
        c.textContent = countText;
        h.appendChild(c);
    }
    mmEnableDrag(h);   // ★r37：顶栏作为拖拽把手，让整个悬浮窗可移动
    return h;
}

// ★★【r37 悬浮窗拖拽】把材质菜单（含织布机）变成可拖动窗口。
//   此前完全没有拖拽逻辑，且 positionMaterialMenu() 会在 window / .panel-content 滚动时
//   强制重写 inline left/top/right ⇒ 即使加了拖拽也会被“拽回去”。解决方案：
//   拖动时置全局 mmUserMoved=true，positionMaterialMenu 见到它就提前 return，
//   不再覆盖用户手动摆放的位置。
//   实现细节：用 pointer events + setPointerCapture（无需 document 级监听器，
//   每个 .mm-head 是全新元素、只绑定一次，天然无监听器泄漏）；窄屏（≤768px）
//   交给 CSS 布局（普通材质菜单居中浮动小窗；织布机改用独立浮动窗 .loom-window），不启用拖拽。
let mmUserMoved = false;
function mmEnableDrag(h) {
    if (!h || h.__draggable) return;
    h.__draggable = true;
    let sx = 0, sy = 0, ox = 0, oy = 0, pid = null, dragging = false;
    h.addEventListener('pointerdown', (e) => {
        if (window.innerWidth <= 768) return;                     // 窄屏不拖拽
        if (e.target.closest && e.target.closest('.mm-back')) return; // 返回按钮不触发拖动
        const r = materialMenuDiv.getBoundingClientRect();
        sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        pid = e.pointerId; dragging = true;
        materialMenuDiv.style.right = 'auto';
        materialMenuDiv.style.left = ox + 'px';
        materialMenuDiv.style.top = oy + 'px';
        materialMenuDiv.classList.add('mm-dragging');
        try { h.setPointerCapture(pid); } catch (_) {}
        e.preventDefault();
    });
    h.addEventListener('pointermove', (e) => {
        if (!dragging || e.pointerId !== pid) return;
        const w = materialMenuDiv.offsetWidth, hh = materialMenuDiv.offsetHeight;
        let nl = ox + (e.clientX - sx), nt = oy + (e.clientY - sy);
        // 夹在视口内：避免拖出屏幕后无法找回
        nl = Math.max(4, Math.min(window.innerWidth - w - 4, nl));
        nt = Math.max(4, Math.min(window.innerHeight - hh - 4, nt));
        materialMenuDiv.style.left = nl + 'px';
        materialMenuDiv.style.top = nt + 'px';
        mmUserMoved = true;
        e.preventDefault();
    });
    const end = (e) => {
        if (e.pointerId !== pid) return;
        dragging = false; pid = null;
        materialMenuDiv.classList.remove('mm-dragging');
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
}

function mmOption(text, sub, onClick) {
    const d = document.createElement('div');
    d.className = 'menu-option';
    d.style.marginBottom = '6px';
    d.textContent = text;
    if (sub) {
        const s = document.createElement('div');
        s.className = 'mm-sub';
        s.textContent = sub;
        d.appendChild(s);
    }
    d.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    return d;
}

function buildMaterialMenu() {
    materialMenuDiv.innerHTML = '';
    materialMenuDiv.classList.remove('wide');
    const targetBlocks = selectedBlocksSet.size ? [...selectedBlocksSet] : (selectedBlock ? [selectedBlock] : []);
    // 贴图开放策略：
    //  - 旗帜：只能用「本地上传」自己选图片，禁用贴图库（用户要求）。
    //    旗面用整面投影UV(uv:{face})，单张整体贴图适用，但来源必须是本地上传。
    //  - 非旗帜方块：单张贴图（含贴图库浏览 + 本地上传）/ 原版方块预设 / 六面独立，全部开放。
    const texBlocks = targetBlocks;                                  // 单张贴图/上传：含旗帜
    const canTex = texBlocks.length > 0;
    // 掉落物：形状由物品图标像素生成，因此不接受「原版方块六面预设」与「六面独立」，
    // 只接受「物品库图标」或本地上传的图标。
    const itemBlocks = targetBlocks.filter(b => b.type === 'dropitem');
    const onlyItems = targetBlocks.length > 0 && itemBlocks.length === targetBlocks.length;
    const presetBlocks = targetBlocks.filter(b => b.type !== 'flag' && b.type !== 'dropitem');
    const canPreset = presetBlocks.length > 0;
    const hasFlags = targetBlocks.some(b => b.type === 'flag');      // 含旗帜 -> 贴图库仅禁用，只给本地上传

    // 计算“允许使用的材质类别”：取所有可贴图方块(非旗帜)类别白名单的交集。
    // 这样菜单只展示这些方块都能用的类别；保留类别(活板门/铁轨/草/花等)因无任何
    // 已注册方块引用，自动不会出现在菜单里。未来新增对应模型时，只要给它加上
    // 对应 materialCategories 即可解锁该类贴图。
    function blockMatCats(b) {
        const def = MODEL_REGISTRY[b.type] || {};
        // 未声明 materialCategories -> 使用默认白名单(= TEX_CATS 里 def:true 的类别)；
        // 显式写成 [] 表示“禁用贴图库，仅本地上传”。权限只来自模型声明，生成器不写禁止规则。
        if (def.materialCategories === undefined) return MM_DEFAULT_CATS;
        return def.materialCategories;
    }
    function intersectCats(blocks) {
        let acc = null;
        for (const b of blocks) {
            const set = new Set(blockMatCats(b));
            acc = acc === null ? set : new Set([...acc].filter(x => set.has(x)));
        }
        return acc || new Set();
    }
    // 仅对真正会用到贴图库的方块(非旗帜)求交集；旗帜单独走“本地上传”
    const allowedCats = intersectCats(presetBlocks.length ? presetBlocks : targetBlocks);

    // 判断某方块模型是否接受某个“材质来源类别”：
    //   - 普通库类别(如 stone/wood/ore...) 看 materialCategories；
    //   - 特殊来源类别(本地上传 'custom'、织布机 'banner') 看 extraCats。
    // extraCats 中的项不属于 TEX_CATS，因此永远不会污染贴图库的筛选/交集。
    // 未来新增模型：只需在 MODEL_REGISTRY 声明 materialCategories(+可选 extraCats)，
    // 即可自动接入这套“按类别隔离”材质算法，无需修改任何调用点。
    function modelAcceptsCategory(type, cat) {
        const def = MODEL_REGISTRY[type] || {};
        const cats = def.materialCategories === undefined ? MM_DEFAULT_CATS.slice() : def.materialCategories.slice();
        if (cats.includes(cat)) return true;
        if (def.extraCats && def.extraCats.includes(cat)) return true;
        return false;
    }
    // 对所有“单图”方块执行操作并记录历史（含旗帜）。
    // 传入 cat 时仅对“接受该来源类别”的方块生效 —— 多选混合类型时按类别隔离。
    // ★r41：目标一律按「调用当下的选区」重算，不用菜单构建时的 texBlocks 快照 ——
    //   织布机是独立常驻浮窗，用户可能在它开着时改选另一面旗帜；用快照会把改动写到上一次选中的旗帜上。
    function currentTexTargets() {
        const cur = selectedBlocksSet.size ? [...selectedBlocksSet] : (selectedBlock ? [selectedBlock] : []);
        return cur.length ? cur : texBlocks;
    }
    function applyTex(fn, cat) {
        const all = currentTexTargets();
        const targets = cat ? all.filter(b => modelAcceptsCategory(b.type, cat)) : all;
        targets.forEach(fn);
        if (targets.length) recordAction();
        return targets.length;
    }
    // 对“多面/预设”方块执行操作并记录历史（仅非旗帜）。同上支持按类别隔离。
    function applyPreset(fn, cat) {
        const targets = cat ? presetBlocks.filter(b => modelAcceptsCategory(b.type, cat)) : presetBlocks;
        targets.forEach(fn);
        if (targets.length) recordAction();
        return targets.length;
    }

    // ---------- 主菜单 ----------
    function showMain() {
        materialMenuDiv.innerHTML = '';
        materialMenuDiv.classList.remove('wide');
        const wrap = document.createElement('div');
        wrap.className = 'material-menu-main';
        wrap.appendChild(mmHead(`材质设置${targetBlocks.length > 1 ? ` (${targetBlocks.length}个方块)` : ''}`, null));

        // 掉落物没有「纯色」路径：模型完全由图标像素生成，没有贴图就没有几何
        if (!onlyItems) wrap.appendChild(mmOption('纯色材质', '使用调色板填充', showColorPalette));
        if (onlyItems) {
            // 掉落物：唯一合理的材质来源是物品图标（图标即模型）
            wrap.appendChild(mmOption('物品贴图', '物品库全部图标 + 本地上传', showItemPicker));
        }
        if (canPreset) {
            wrap.appendChild(mmOption('原版方块', `${TEX_BLOCK_PRESETS.filter(p => allowedCats.has(p[2]) && presetAvailable(p)).length} 种，自动匹配六面`, showBlockPresets));
        }
        // 掉落物只有「物品贴图」一条路（六面独立/方块贴图库对它无意义），故整组隐藏
        if (canTex && !onlyItems) {
            // 通过 api 把本闭包内的 applyTex/applyPreset/showMain 传给 openLoomWindow（否则跨注入块取不到）
            if (hasFlags) {
                wrap.appendChild(mmOption('织布机', '旗帜生成器：底色 + 图案图层', () => openLoomWindow({
                    applyTex, applyPreset, showMain,
                    // ★【r37】把「读取当前选中旗帜配方」的入口传给织布机。
                    //   此前织布机只拿到 applyTex/applyPreset/showMain，无法感知选中方块 ⇒
                    //   面板永远显示上次编辑的全局状态，与当前旗帜无关（用户反馈的根因）。
                    //   取第一个「材质就是织布机产物」的旗帜（loomUrl 与 textureUrl 相等，
                    //   与导出侧 getMaterialTag 的回退判据同口径）；上传图片旗帜无配方 → null。
                    readLoomRecipe: () => {
                        // ★r41：同样按「当下选区」读，选区变了要能读到新旗帜的配方
                        const b = currentTexTargets().find(x => x.type === 'flag' && x.loomCode && x.loomUrl === x.textureUrl);
                        return b ? loomCodeToRecipe(b.loomCode) : null;
                    }
                })));
            }
            // 自定义贴图：折叠列表，内含「单张贴图」与（非旗帜的）「六面独立贴图」
            // （本地上传能力由子面板的“本地上传”按钮提供，故此处不再单独上传）
            const group = document.createElement('div');
            group.className = 'mm-group';
            const head = document.createElement('div');
            head.className = 'menu-option mm-group-head';
            head.style.marginBottom = '6px';
            head.textContent = '自定义贴图 ▸';
            group.appendChild(head);

            const list = document.createElement('div');
            list.className = 'mm-group-list';
            list.style.display = 'none';
            list.appendChild(mmOption('单张贴图', hasFlags ? '仅本地上传图片' : `${TEX_LIB.filter(t => !isTexDisabled(t[0])).length} 张，整块使用同一张`, () => showTexturePicker({
                title: '单张贴图（整体）',
                current: texBlocks[0] && texBlocks[0].materialType === 'texture' ? texName(texBlocks[0].textureUrl) : null,
                uploadOnly: hasFlags,   // 含旗帜时禁用贴图库，只给本地上传
                onBack: showMain,
                onPick: (file, cat) => { applyTex(b => b.loadTexture(file, cat === 'custom' ? '自定义' : texDisplayName(file)), cat); showMain(); }
            })));
            if (canPreset) {
                list.appendChild(mmOption('六面独立贴图', '每个面单独指定贴图', showFaceEditor));
            }
            group.appendChild(list);

            head.addEventListener('click', e => {
                e.stopPropagation();
                const open = list.style.display !== 'none';
                list.style.display = open ? 'none' : 'block';
                head.textContent = open ? '自定义贴图 ▸' : '自定义贴图 ▾';
            });
            wrap.appendChild(group);
        }
        materialMenuDiv.appendChild(wrap);
        // 退出织布机（或任意返回）后：重新按当前内容夹回视口。
        // 否则会继承织布机被 positionMaterialMenu 夹出的 top（常接近 0，因织布机很高），
        // 桌面端主菜单就变成贴右边的一整条竖直栏、失去小弹窗约束；
        // 移动端则交给 CSS（.material-menu 居中浮动小窗；织布机走独立浮窗 .loom-window）。
        if (typeof positionMaterialMenu === 'function') positionMaterialMenu();
    }

    // ---------- 本地上传 ----------
    function pickCustomFile(onDone) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = ev => {
            const file = ev.target.files[0];
            if (!file) return;
            fileToDataURL(file).then(url => {
                if (typeof onDone === 'function') { onDone(url); return; }
                applyTex(b => b.loadTexture(url, '自定义'), 'custom');   // 本地上传：对接受 'custom' 的方块生效
                materialMenuDiv.style.display = 'none';
            });
        };
        fileInput.click();
    }

    // ---------- 纯色 ----------
    function showColorPalette() {
        materialMenuDiv.innerHTML = '';
        materialMenuDiv.classList.remove('wide');
        materialMenuDiv.appendChild(mmHead('纯色材质', showMain));
        const panel = document.createElement('div');
        panel.className = 'color-palette';
        panel.style.cssText = 'display:grid; grid-template-columns:repeat(6,1fr); gap:8px;';
        colorPresets.forEach(hex => {
            const sw = document.createElement('div');
            sw.className = 'color-swatch';
            sw.style.cssText = `background:${hex}; border:2px solid #334155; border-radius:12px; cursor:pointer; aspect-ratio:1/1;`;
            sw.addEventListener('click', e => {
                e.stopPropagation();
                targetBlocks.forEach(b => b.setSolidColor(hex));
                recordAction();
                materialMenuDiv.style.display = 'none';
            });
            panel.appendChild(sw);
        });
        materialMenuDiv.appendChild(panel);
    }

    // ---------- 组合方块预设（六面自动映射） ----------
    function showBlockPresets() {
        materialMenuDiv.innerHTML = '';
        materialMenuDiv.classList.add('wide');
        const curKey = presetBlocks[0] ? presetBlocks[0].facePresetKey : null;
        const head = mmHead('原版方块（六面）', showMain);
        materialMenuDiv.appendChild(head);

        const search = document.createElement('input');
        search.className = 'mm-search';
        search.placeholder = '搜索方块名，如 草方块 / furnace';
        materialMenuDiv.appendChild(search);

        const catBar = document.createElement('div');
        catBar.className = 'mm-cats';
        materialMenuDiv.appendChild(catBar);
        const grid = document.createElement('div');
        grid.className = 'mm-grid';
        materialMenuDiv.appendChild(grid);

        let cat = 'all';
        function renderCats() {
            if (cat !== 'all' && !allowedCats.has(cat)) cat = 'all';  // 切换方块后旧的类别可能已不可选
            catBar.innerHTML = '';
            const used = new Set(TEX_BLOCK_PRESETS.map(p => p[2]).filter(c => allowedCats.has(c)));
            [{ id: 'all', n: '全部' }, ...TEX_CATS.filter(c => used.has(c.id) && allowedCats.has(c.id))].forEach(c => {
                const chip = document.createElement('div');
                chip.className = 'mm-cat' + (cat === c.id ? ' active' : '');
                chip.textContent = c.n;
                chip.addEventListener('click', e => { e.stopPropagation(); cat = c.id; renderCats(); render(); });
                catBar.appendChild(chip);
            });
        }
        function render() {
            grid.innerHTML = '';
            const kw = search.value.trim().toLowerCase();
            const list = TEX_BLOCK_PRESETS.filter(p =>
                presetAvailable(p) &&
                (cat === 'all' || p[2] === cat) &&
                allowedCats.has(p[2]) &&
                (!kw || p[1].toLowerCase().includes(kw) || p[0].toLowerCase().includes(kw)));
            head.querySelector('.mm-title').textContent = `原版方块（${list.length}）`;
            if (!list.length) {
                grid.innerHTML = '<div class="mm-hint" style="grid-column:1/-1">没有匹配的方块</div>';
                return;
            }
            list.forEach(p => {
                const cell = document.createElement('div');
                cell.className = 'mm-cell' + (curKey === p[0] ? ' sel' : '');
                cell.title = `${p[1]}\n顶: ${p[3][1]}\n侧: ${p[3][4]}\n底: ${p[3][0]}`;
                cell.appendChild(mmThumb(p[3][1]));   // 缩略图用顶面
                const lb = document.createElement('span');
                lb.textContent = p[1];
                cell.appendChild(lb);
                cell.addEventListener('click', e => {
                    e.stopPropagation();
                    applyPreset(b => b.applyBlockPreset(p[0]), p[2]);   // 按预设自身类别隔离
                    materialMenuDiv.style.display = 'none';
                });
                grid.appendChild(cell);
            });
        }
        search.addEventListener('input', render);
        search.addEventListener('click', e => e.stopPropagation());
        renderCats();
        render();
        setTimeout(() => search.focus(), 0);
    }

    // ---------- 通用贴图选择器 ----------
    // opts: { title, current, onPick(file), onBack, allowClear }
    function showTexturePicker(opts) {
        materialMenuDiv.innerHTML = '';
        materialMenuDiv.classList.add('wide');
        // 拖放支持：打开选择器即允许拖入图片；退出（返回/选中）时清除标志
        const realOnPick = opts.onPick;
        opts.onPick = (url, cat) => { mmDropOnPick = null; realOnPick(url, cat); };   // 透传类别
        const realBack = opts.onBack;
        opts.onBack = () => { mmDropOnPick = null; if (realBack) realBack(); };
        mmDropOnPick = opts.onPick;
        // 拖放提示遮罩（仅在拖拽悬停时显示，纯 CSS 控制）
        const dropOverlay = document.createElement('div');
        dropOverlay.className = 'mm-drop-overlay';
        dropOverlay.textContent = '拖放图片到此处，作为自定义贴图';
        const head = mmHead(opts.title, opts.onBack);
        materialMenuDiv.appendChild(head);
        materialMenuDiv.appendChild(dropOverlay);

        // 仅上传模式：旗帜等方块禁用贴图库，只提供本地上传入口
        if (opts.uploadOnly) {
            const note = document.createElement('div');
            note.className = 'mm-hint';
            note.style.cssText = 'grid-column:1/-1; padding:14px; text-align:center; line-height:1.6;';
            note.textContent = '此方块仅支持本地上传图片作为贴图（贴图库不可用）';
            materialMenuDiv.appendChild(note);
            const row = document.createElement('div');
            row.className = 'mm-row';
            const up = document.createElement('div');
            up.className = 'mm-btn';
            up.textContent = '本地上传图片';
            up.addEventListener('click', e => { e.stopPropagation(); pickCustomFile(url => opts.onPick(url, 'custom')); });
            row.appendChild(up);
            if (opts.allowClear) {
                const clr = document.createElement('div');
                clr.className = 'mm-btn';
                clr.textContent = '清除贴图';
                clr.addEventListener('click', e => { e.stopPropagation(); opts.onPick(null); });
                row.appendChild(clr);
            }
            materialMenuDiv.appendChild(row);
            return;
        }

        const search = document.createElement('input');
        search.className = 'mm-search';
        search.placeholder = '搜索贴图（中文名或英文文件名）';
        search.value = mmState.q;
        materialMenuDiv.appendChild(search);

        const catBar = document.createElement('div');
        catBar.className = 'mm-cats';
        materialMenuDiv.appendChild(catBar);
        const grid = document.createElement('div');
        grid.className = 'mm-grid';
        materialMenuDiv.appendChild(grid);

        // 若当前方块类别受限（如楼梯/台阶只允许石质/木质），给出提示
        const ALL_USABLE = MM_DEFAULT_CATS;
        if (allowedCats.size < ALL_USABLE.length) {
            const names = [...allowedCats].map(id => { const c = TEX_CATS.find(x => x.id === id); return c ? c.n : id; });
            const hint = document.createElement('div');
            hint.className = 'mm-hint';
            hint.style.cssText = 'grid-column:1/-1; padding:6px 12px; line-height:1.5;';
            hint.textContent = `此方块仅允许使用：${names.join(' / ')}`;
            materialMenuDiv.appendChild(hint);
        }

        const MAX = 200;   // 单次最多渲染数量，超出提示用搜索缩小范围
        function renderCats() {
            if (mmState.cat !== 'all' && !allowedCats.has(mmState.cat)) mmState.cat = 'all';
            catBar.innerHTML = '';
            [{ id: 'all', n: '全部' }, ...TEX_CATS.filter(c => allowedCats.has(c.id))].forEach(c => {
                const chip = document.createElement('div');
                chip.className = 'mm-cat' + (mmState.cat === c.id ? ' active' : '');
                chip.textContent = c.n;
                chip.addEventListener('click', e => { e.stopPropagation(); mmState.cat = c.id; renderCats(); render(); });
                catBar.appendChild(chip);
            });
        }
        function render() {
            grid.innerHTML = '';
            const kw = mmState.q.trim().toLowerCase();
            const list = TEX_LIB.filter(t =>
                !isTexDisabled(t[0]) &&
                (mmState.cat === 'all' || t[2] === mmState.cat) &&
                allowedCats.has(t[2]) &&
                (!kw || t[1].toLowerCase().includes(kw) || t[0].toLowerCase().includes(kw)));
            const cnt = head.querySelector('.mm-count');
            if (cnt) cnt.textContent = `${list.length}`;
            else head.appendChild(Object.assign(document.createElement('div'), { className: 'mm-count', textContent: `${list.length}` }));

            if (!list.length) {
                grid.innerHTML = '<div class="mm-hint" style="grid-column:1/-1">没有匹配的贴图<br>试试搜索"石头""oak"等关键词</div>';
                return;
            }
            list.slice(0, MAX).forEach(t => {
                const cell = document.createElement('div');
                cell.className = 'mm-cell' + (opts.current === t[0] ? ' sel' : '');
                cell.title = `${t[1]}\n${t[0]}`;
                cell.appendChild(mmThumb(t[0]));
                const lb = document.createElement('span');
                lb.textContent = t[1];
                cell.appendChild(lb);
                cell.addEventListener('click', e => { e.stopPropagation(); opts.onPick(t[0], t[2]); });   // t[2] = 该贴图类别
                grid.appendChild(cell);
            });
            if (list.length > MAX) {
                const more = document.createElement('div');
                more.className = 'mm-hint';
                more.style.gridColumn = '1/-1';
                more.textContent = `仅显示前 ${MAX} 项，共 ${list.length} 项，请用搜索或分类缩小范围`;
                grid.appendChild(more);
            }
        }
        search.addEventListener('input', () => { mmState.q = search.value; render(); });
        search.addEventListener('click', e => e.stopPropagation());

        const row = document.createElement('div');
        row.className = 'mm-row';
        if (opts.allowClear) {
            const clr = document.createElement('div');
            clr.className = 'mm-btn';
            clr.textContent = '清除该面';
            clr.addEventListener('click', e => { e.stopPropagation(); opts.onPick(null); });
            row.appendChild(clr);
        }
        const up = document.createElement('div');
        up.className = 'mm-btn';
        up.textContent = '本地上传';
        up.addEventListener('click', e => { e.stopPropagation(); pickCustomFile(url => opts.onPick(url, 'custom')); });
        row.appendChild(up);
        materialMenuDiv.appendChild(row);

        renderCats();
        render();
        setTimeout(() => search.focus(), 0);
    }

    // ---------- 物品贴图（掉落物专用） ----------
    // 掉落物的形状/贴图都来自「物品图标」：一个不透明像素 = 一根体素柱。
    // 所以它的材质面板不给贴图库，只给「物品库」（Textures/items，基岩版原版图标）+ 本地上传。
    let _itemLibPromise = null;
    function getItemLib() {
        if (!_itemLibPromise) {
            _itemLibPromise = fetch(texUrl('items/_manifest.json'))
                .then(r => (r.ok ? r.json() : []))
                .catch(() => []);
        }
        return _itemLibPromise;
    }

    function showItemPicker() {
        materialMenuDiv.innerHTML = '';
        materialMenuDiv.classList.add('wide');
        materialMenuDiv.appendChild(mmHead('物品贴图', showMain));

        const search = document.createElement('input');
        search.className = 'mm-search';
        search.placeholder = '搜索物品（中文名 / 英文文件名）';
        search.addEventListener('click', e => e.stopPropagation());
        const grid = document.createElement('div');
        grid.className = 'mm-grid mm-items';
        const tip = document.createElement('div');
        tip.className = 'mm-hint';
        tip.style.cssText = 'grid-column:1/-1;padding:10px 12px;';
        tip.textContent = '加载物品库…';
        materialMenuDiv.appendChild(search);
        materialMenuDiv.appendChild(tip);
        materialMenuDiv.appendChild(grid);

        const curNames = new Set(currentTexTargets().filter(b => b.type === 'dropitem').map(b => texName(b.textureUrl)));
        let lib = [], kw = '';

        const render = () => {
            grid.innerHTML = '';
            const k = kw.trim().toLowerCase();
            const list = lib.filter(it => !k
                || (it.n && it.n.toLowerCase().includes(k))
                || (it.e && it.e.toLowerCase().includes(k))
                || it.f.toLowerCase().includes(k));
            const cnt = materialMenuDiv.querySelector('.mm-count');
            if (cnt) cnt.textContent = `${list.length}`;
            if (!list.length) {
                grid.innerHTML = '<div class="mm-hint" style="grid-column:1/-1">没有匹配的物品<br>试试搜索"染料""apple"等关键词</div>';
                return;
            }
            list.forEach(it => {
                const cell = document.createElement('div');
                cell.className = 'mm-cell' + (curNames.has('items/' + it.f) ? ' sel' : '');
                cell.title = `${it.n || it.e}\n${it.f}`;
                cell.appendChild(mmThumb('items/' + it.f, false));   // 物品图标只有几 KB，直接加载，别让懒加载拖成空白格子
                const lb = document.createElement('span');
                lb.textContent = it.n || it.e || it.f.replace(/\.png$/i, '');
                cell.appendChild(lb);
                cell.addEventListener('click', e => {
                    e.stopPropagation();
                    const disp = it.n || it.e || it.f.replace(/\.png$/i, '');
                    applyTex(b => b.loadTexture('items/' + it.f, disp), 'custom');
                    showMain();
                });
                grid.appendChild(cell);
            });
        };

        search.addEventListener('input', () => { kw = search.value; render(); });

        const row = document.createElement('div');
        row.className = 'mm-row';
        const up = document.createElement('div');
        up.className = 'mm-btn';
        up.textContent = '本地上传图片';
        up.addEventListener('click', e => {
            e.stopPropagation();
            pickCustomFile(url => { applyTex(b => b.loadTexture(url, '自定义'), 'custom'); showMain(); });
        });
        row.appendChild(up);
        materialMenuDiv.appendChild(row);

        getItemLib().then(items => {
            lib = Array.isArray(items) ? items : [];
            tip.textContent = `物品库共 ${lib.length} 件（图标即模型，16×16 或 32×32 效果最好）`;
            render();
        });
        setTimeout(() => search.focus(), 0);
    }

    // ---------- 六面独立贴图面板 ----------
    function showFaceEditor() {
        materialMenuDiv.innerHTML = '';
        materialMenuDiv.classList.add('wide');
        if (!presetBlocks.length) { showMain(); return; }
        // 以第一个方块的状态作为界面显示基准，操作会同步到全部选中方块
        const cur = presetBlocks[0].getFaceTextures().map(u => (u ? texName(u) : null));
        materialMenuDiv.appendChild(mmHead('六面独立贴图', showMain));

        const list = document.createElement('div');
        list.className = 'mm-faces';
        // 按 顶-侧-底 的直观顺序展示，而不是内部索引顺序
        [1, 4, 5, 2, 3, 0].forEach(idx => {
            const fi = FACE_INFO[idx];
            const row = document.createElement('div');
            row.className = 'mm-face';
            row.appendChild(mmThumb(cur[idx], false));

            const info = document.createElement('div');
            info.className = 'mm-face-info';
            const nm = document.createElement('div');
            nm.className = 'mm-face-name';
            nm.textContent = `${fi.n}  ${fi.ax}`;
            const tx = document.createElement('div');
            tx.className = 'mm-face-tex';
            tx.textContent = cur[idx] ? texDisplayName(cur[idx]) : '未设置（显示纯色）';
            info.appendChild(nm);
            info.appendChild(tx);
            row.appendChild(info);

            if (cur[idx]) {
                const x = document.createElement('div');
                x.className = 'mm-face-clear';
                x.textContent = '×';
                x.title = '清除该面贴图';
                x.addEventListener('click', e => {
                    e.stopPropagation();
                    applyPreset(b => b.setFaceTexture(idx, null));
                    showFaceEditor();
                });
                row.appendChild(x);
            }

            row.addEventListener('click', e => {
                e.stopPropagation();
                showTexturePicker({
                    title: `选择${fi.n}贴图`,
                    current: cur[idx],
                    allowClear: true,
                    onBack: showFaceEditor,
                    onPick: (file, cat) => {
                        applyPreset(b => b.setFaceTexture(idx, file), cat);
                        showFaceEditor();   // 返回面板，方便连续设置其它面
                    }
                });
            });
            // 直接把图片拖到某一行 -> 应用到该面（与“本地上传”同一路径）
            row.addEventListener('dragover', e => {
                e.preventDefault(); e.stopPropagation();
                row.classList.add('mm-face-drag');
            });
            row.addEventListener('dragleave', e => {
                if (e.target === row) row.classList.remove('mm-face-drag');
            });
            row.addEventListener('drop', e => {
                e.preventDefault(); e.stopPropagation();
                row.classList.remove('mm-face-drag');
                const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (!f) return;
                if (!/^image\//.test(f.type)) { alert('请拖入图片文件'); return; }
                fileToDataURL(f).then(url => {
                    applyPreset(b => b.setFaceTexture(idx, url), 'custom');   // 拖入图片 = 本地上传来源
                    showFaceEditor();   // 刷新面板，显示新贴图
                });
            });
            list.appendChild(row);
        });
        materialMenuDiv.appendChild(list);

        // 快捷操作
        const row1 = document.createElement('div');
        row1.className = 'mm-row';
        const sameAll = document.createElement('div');
        sameAll.className = 'mm-btn';
        sameAll.textContent = '六面同图';
        sameAll.title = '选一张贴图应用到全部六个面';
        sameAll.addEventListener('click', e => {
            e.stopPropagation();
            showTexturePicker({
                title: '六面同图',
                current: cur[1],
                onBack: showFaceEditor,
                onPick: (file, cat) => {
                    applyPreset(b => b.applyFaceTextures(new Array(6).fill(file), null), cat);
                    showFaceEditor();
                }
            });
        });
        const sideSame = document.createElement('div');
        sideSame.className = 'mm-btn';
        sideSame.textContent = '四侧同图';
        sideSame.title = '只把一张贴图应用到前后左右四个侧面';
        sideSame.addEventListener('click', e => {
            e.stopPropagation();
            showTexturePicker({
                title: '四侧同图',
                current: cur[4],
                onBack: showFaceEditor,
                onPick: (file, cat) => {
                    applyPreset(b => {
                        const arr = b.getFaceTextures().map(u => (u ? texName(u) : null));
                        [2, 3, 4, 5].forEach(i => { arr[i] = file; });
                        b.applyFaceTextures(arr, null);
                    }, cat);
                    showFaceEditor();
                }
            });
        });
        row1.appendChild(sameAll);
        row1.appendChild(sideSame);
        materialMenuDiv.appendChild(row1);

        const row2 = document.createElement('div');
        row2.className = 'mm-row';
        const copyTop = document.createElement('div');
        copyTop.className = 'mm-btn';
        copyTop.textContent = '顶面→底面';
        copyTop.addEventListener('click', e => {
            e.stopPropagation();
            applyPreset(b => {
                const arr = b.getFaceTextures().map(u => (u ? texName(u) : null));
                arr[0] = arr[1];
                b.applyFaceTextures(arr, null);
            });
            showFaceEditor();
        });
        const reset = document.createElement('div');
        reset.className = 'mm-btn';
        reset.textContent = '清空全部';
        reset.addEventListener('click', e => {
            e.stopPropagation();
            applyPreset(b => b.setSolidColor(b.materialColor || '#aaccff'));
            showFaceEditor();
        });
        row2.appendChild(copyTop);
        row2.appendChild(reset);
        materialMenuDiv.appendChild(row2);
    }

    showMain();
}
// <<<NEWMENU_INJECT_END>>>


// 材质菜单滚动监听器（全局）
let materialMenuScrollListener = null;
// ★r37h-fix2：材质菜单的「外部点击关闭」抽成一对可复用的装配/拆卸函数。
//   根因（用户「关掉织布机后这个一直关不掉」）：材质菜单通过 织布机 项打开浮窗时，
//   `openLoomWindow` 把菜单 `display` 置为 none，但**织布机窗口不在 materialMenuDiv 内**，
//   用户只要在织布机里点一下，菜单原先登记的外部点击 closeHandler 就会把自己注销掉
//   （判定为“点了外部”）。此后关织布机只用 `style.display=''` 恢复显示，
//   菜单就再也没有关闭监听了 ⇒ 点哪都关不掉。
//   ⇒ 恢复显示时必须重新武装监听，隐藏时必须主动拆卸。
let mmCloseHandler = null;
function mmUnarmClose() {
  if (mmCloseHandler) { document.removeEventListener('click', mmCloseHandler); mmCloseHandler = null; }
  // 同时清掉「菜单内部点击」标记：若上一次菜单内部点击没被处理器消费（例如处理器刚好还没注册），
  // 残留的 true 会把下一次真正的外部点击误吞掉，导致菜单又关不掉。
  mmInternalClick = false;
  if (materialMenuScrollListener) {
    window.removeEventListener('scroll', materialMenuScrollListener);
    document.querySelector('.panel-content')?.removeEventListener('scroll', materialMenuScrollListener);
    materialMenuScrollListener = null;
  }
}
function mmArmClose() {
  mmUnarmClose();
  materialMenuScrollListener = () => { positionMaterialMenu(); };
  window.addEventListener('scroll', materialMenuScrollListener);
  const panelContent = document.querySelector('.panel-content');
  if (panelContent) panelContent.addEventListener('scroll', materialMenuScrollListener);
  const h = (ev) => {
    if (mmInternalClick) { mmInternalClick = false; return; }  // 菜单内部点击（切换子面板 / 重建DOM）不关闭
    if (!materialMenuDiv.contains(ev.target) && ev.target !== materialMenuBtn) {
      materialMenuDiv.style.display = 'none';
      mmUnarmClose();
    }
  };
  mmCloseHandler = h;
  // 同步注册会立刻吃掉触发本次打开的那一次点击 ⇒ 延后一拍；并校验仍是当前处理器，避免重复注册
  setTimeout(() => { if (mmCloseHandler === h) document.addEventListener('click', h); }, 10);
}
// 打开材质菜单时记录触发按钮，供定位与滚动跟随使用
let materialMenuBtn = null;

// 根据触发按钮位置 + 菜单真实尺寸，把菜单夹在视口内（桌面端）。
// 关键点：用 materialMenuDiv 实际宽高（而非假设值），否则织布机等更宽/更高的面板会溢出屏幕。
function positionMaterialMenu() {
    // ★r37：用户已手动拖动过 → 不再用自动定位覆盖其位置。
    //   否则滚动/子面板重建会调用本函数，把窗口重新钉回触发按钮旁 ⇒ “拖不动”。
    if (mmUserMoved && window.innerWidth > 768) return;
    if (window.innerWidth <= 768) {
        // 移动端交给 CSS 媒体查询控制（普通材质菜单居中浮动小窗；织布机走独立浮窗铺满全屏）
        materialMenuDiv.style.top = '';
        materialMenuDiv.style.left = '';
        materialMenuDiv.style.right = '';
        return;
    }
    if (!materialMenuBtn) return;
    const rect = materialMenuBtn.getBoundingClientRect();
    const menuW = materialMenuDiv.offsetWidth || 270;
    const menuH = materialMenuDiv.offsetHeight || 320;
    const M = 8; // 视口边距
    let left = rect.right - menuW;
    if (left < M) left = M;
    if (left + menuW > window.innerWidth - M) left = Math.max(M, window.innerWidth - menuW - M);
    let top = rect.bottom + 5;
    if (top + menuH > window.innerHeight - M) top = rect.top - menuH - 5;
    if (top < M) top = M;
    if (top + menuH > window.innerHeight - M) top = Math.max(M, window.innerHeight - menuH - M);
    materialMenuDiv.style.right = 'auto';
    materialMenuDiv.style.left = left + 'px';
    materialMenuDiv.style.top = top + 'px';
}

// 绑定材质按钮事件
document.getElementById('materialPresetBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const targetBlocks = selectedBlocksSet.size ? [...selectedBlocksSet] : (selectedBlock ? [selectedBlock] : []);
    if (!targetBlocks.length) {
        showModal("提示", "请先选中至少一个方块", null, false);
        return;
    }
    buildMaterialMenu();
    materialMenuBtn = e.target;
    materialMenuDiv.style.display = 'block';
    positionMaterialMenu();
    mmArmClose();   // ★r37h-fix2：统一装配「外部点击关闭」（原内联 closeHandler 已抽成 mmArmClose）
});

