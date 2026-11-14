/* 04-import-export/02-mcstructure-import-and-scene.js · 源 测试版v.6b79.html 第 18383-18774 行 */
'use strict';
// ===================  Minecraft Bedrock .mcstructure 导入  ==================
// ============================================================================
// 解析器：小端 NBT（与导出器共用 _NBT 常量表）
// ============================================================================
class NbtReader {
    constructor(bytes) {
        this.u8 = new Uint8Array(bytes);
        this.dv = new DataView(this.u8.buffer);
        this.off = 0;
    }
    _eof(n) { return this.off + n > this.u8.length; }
    _u8() { if (this._eof(1)) throw new Error('NBT 截断：读取 u8'); return this.u8[this.off++]; }
    _i8() { return this._u8() << 24 >> 24; }
    _u16() { const v = this.dv.getUint16(this.off, true); this.off += 2; return v; }
    _i16() { const v = this.dv.getInt16(this.off, true); this.off += 2; return v; }
    _i32() { const v = this.dv.getInt32(this.off, true); this.off += 4; return v; }
    _i64() { const v = this.dv.getBigInt64(this.off, true); this.off += 8; return v; }
    _f32() { const v = this.dv.getFloat32(this.off, true); this.off += 4; return v; }
    _f64() { const v = this.dv.getFloat64(this.off, true); this.off += 8; return v; }
    _utf8() {
        const len = this._u16();
        if (this._eof(len)) throw new Error('NBT 截断：读取字符串');
        const s = new TextDecoder('utf-8').decode(this.u8.subarray(this.off, this.off + len));
        this.off += len;
        return s;
    }
    _byteArray() {
        const len = this._i32();
        if (this._eof(len)) throw new Error('NBT 截断：读取 byte_array');
        const arr = Array.from(this.u8.subarray(this.off, this.off + len));
        this.off += len;
        return arr;
    }
    _intArray() {
        const len = this._i32();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(this._i32());
        return arr;
    }
    _longArray() {
        const len = this._i32();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(this._i64());
        return arr;
    }
    _list() {
        const elemType = this._u8();
        const len = this._i32();
        if (len === 0) return [];
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(this._payload(elemType, true));
        return arr;
    }
    _compound() {
        const obj = {};
        while (true) {
            const type = this._u8();
            if (type === _NBT.TAG_END) break;
            const name = this._utf8();
            obj[name] = this._payload(type, false);
        }
        return obj;
    }
    _payload(type, inList) {
        switch (type) {
            case _NBT.TAG_END: return null;
            case _NBT.TAG_BYTE: return this._i8();
            case _NBT.TAG_SHORT: return this._i16();
            case _NBT.TAG_INT: return this._i32();
            case _NBT.TAG_LONG: return this._i64();
            case _NBT.TAG_FLOAT: return this._f32();
            case _NBT.TAG_DOUBLE: return this._f64();
            case _NBT.TAG_BYTE_ARRAY: return this._byteArray();
            case _NBT.TAG_STRING: return this._utf8();
            case _NBT.TAG_LIST: return this._list();
            case _NBT.TAG_COMPOUND: return this._compound();
            case _NBT.TAG_INT_ARRAY: return this._intArray();
            case _NBT.TAG_LONG_ARRAY: return this._longArray();
            default: throw new Error(`未知 NBT 类型：${type}`);
        }
    }
    // 读取一个带名字的根标签（用于根 compound）
    readRoot() {
        const type = this._u8();
        const name = this._utf8();
        if (type !== _NBT.TAG_COMPOUND) throw new Error('根标签必须是 compound');
        return { name, value: this._compound() };
    }
}

// 解析 .mcstructure：返回 { size:[sx,sy,sz], origin:[ox,oy,oz], commands:[...] }
// 只读取 layer0 的方块索引，匹配 palette 中名字含 command_block 的项，
// 再从 block_position_data[线性索引].block_entity_data.Command 提取指令。
// 索引规则与导出一致：Z 最快 → Y → X，i = lz + ly*sz + lx*sy*sz（官方口径，见导出端注释）。
function parseMcStructure(bytes) {
    const r = new NbtReader(bytes);
    const root = r.readRoot().value;
    if (!root || typeof root !== 'object') throw new Error('无法解析结构根节点');

    const formatVersion = root.format_version;
    if (formatVersion !== 1) console.warn('[结构导入] format_version 非 1：', formatVersion);

    const size = Array.isArray(root.size) ? root.size : [0, 0, 0];
    const origin = Array.isArray(root.structure_world_origin) ? root.structure_world_origin : [0, 0, 0];
    const [sx, sy, sz] = size;
    if (!sx || !sy || !sz) throw new Error('结构尺寸无效');

    const structure = root.structure;
    if (!structure || typeof structure !== 'object') throw new Error('缺少 structure 节点');

    const blockIndices = structure.block_indices;
    if (!Array.isArray(blockIndices) || blockIndices.length < 1) throw new Error('缺少 block_indices');
    const layer0 = blockIndices[0];
    if (!Array.isArray(layer0) || layer0.length !== sx * sy * sz) {
        throw new Error(`block_indices[0] 长度 ${layer0?.length} 与尺寸 ${sx}×${sy}×${sz}=${sx * sy * sz} 不符`);
    }

    const palette = structure.palette;
    if (!palette || typeof palette !== 'object') throw new Error('缺少 palette 节点');
    const defPalette = palette.default;
    if (!defPalette || typeof defPalette !== 'object') throw new Error('缺少 palette.default 节点');

    const blockPalette = Array.isArray(defPalette.block_palette) ? defPalette.block_palette : [];
    const blockPosData = defPalette.block_position_data;
    if (!blockPosData || typeof blockPosData !== 'object') throw new Error('缺少 block_position_data');

    // 哪些 palette 索引是命令方块
    const cmdBlockPaletteIdx = new Set();
    blockPalette.forEach((entry, idx) => {
        if (entry && typeof entry.name === 'string' && entry.name.includes('command_block')) {
            cmdBlockPaletteIdx.add(idx);
        }
    });

    const commands = [];
    // 按索引升序遍历，保证命令顺序与导出一致
    for (let i = 0; i < layer0.length; i++) {
        const paletteIdx = layer0[i];
        if (!cmdBlockPaletteIdx.has(paletteIdx)) continue;
        const posData = blockPosData[String(i)];
        if (!posData || typeof posData !== 'object') continue;
        const be = posData.block_entity_data;
        if (!be || typeof be !== 'object') continue;
        const cmd = be.Command;
        if (typeof cmd === 'string' && cmd.trim()) commands.push(cmd.trim());
    }

    return { size, origin, commands };
}

// 主入口：Uint8Array -> 调用现有 importFromCommands
function importMcStructure(bytes, opts) {
    opts = opts || {};
    const parsed = parseMcStructure(bytes);
    if (!parsed.commands.length) throw new Error('未在结构中找到任何命令方块指令');
    const text = parsed.commands.join('\n');
    return importFromCommands(text, { silent: true });
}

// 覆盖原有的 showCommandListModal 函数，使用依赖排序
function showCommandListModal() {
    // 不再在导出时预热 base64 贴图反查索引：该索引需要下载全部 910 张贴图（约 3.7MB），
    // 而当前导出逻辑（getMaterialTag）已不依赖它，只在调试/探针里按需手动调用。
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal io-soft';
    let html = `<div class="modal-content io-shell" style="max-width:480px;">
        <div class="io-head">
            <span>📤 导出</span>
            <div style="display:flex;align-items:center;gap:4px;">
                <button class="modal-icon-btn" id="mcStructExportBtn" title="导出为 Minecraft 结构文件（.mcstructure）">
                    <img src="Textures/structure_block_data.png" alt="">
                </button>
                <button class="io-close" id="cancelModalBtn" type="button" title="关闭">✕</button>
            </div>
        </div>
        <div class="io-body">
            <div class="io-labelrow">
                <span class="label-hint">前缀</span>
                <button class="io-link" id="resetDefaultBtn" type="button">重置默认</button>
            </div>
            <textarea id="prefixInput" class="modal-input-text" rows="1" spellcheck="false">${escapeHtml(exportPrefix)}</textarea>
            <div class="io-labelrow">
                <span class="label-hint">后缀</span>
                <span class="label-hint">自动附加「方块编号：{id}」</span>
            </div>
            <textarea id="suffixInput" class="modal-input-text" rows="1" spellcheck="false">${escapeHtml(exportSuffix)}</textarea>
            <div class="io-actions">
                <button class="io-textbtn io-tb-green" id="outputFileBtn" type="button">输出文件</button>
                <button class="io-textbtn io-tb-orange" id="compressExportBtn" type="button">压缩导出</button>
                <button class="io-chip io-chip-blue" id="confirmExportBtn" type="button"><span>生成命令列表</span></button>
            </div>
        </div></div>`;
    modalDiv.innerHTML = html;
    document.body.appendChild(modalDiv);

    const prefixInp = modalDiv.querySelector('#prefixInput');
    const suffixInp = modalDiv.querySelector('#suffixInput');
    const confirmBtn = modalDiv.querySelector('#confirmExportBtn');
    const compressBtn = modalDiv.querySelector('#compressExportBtn');
    const mcStructBtn = modalDiv.querySelector('#mcStructExportBtn');
    const outputFileBtn = modalDiv.querySelector('#outputFileBtn');
    const cancelBtn = modalDiv.querySelector('#cancelModalBtn');
    const resetBtn = modalDiv.querySelector('#resetDefaultBtn');
    const closeModal = () => modalDiv.remove();
    // MC 结构导出按钮：默认隐藏，需【开发者模式 → 🛠 开发者工具 → 显示 MC 结构导入 / 导出】
    try { if (typeof applyMcStructUiVisibility === 'function') applyMcStructUiVisibility(); } catch (e) {}

    // 前缀/后缀：聚焦编辑时自动纵向长开（按内容自适应，≤140px），失焦收回单行
    const fitPSText = (el) => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; };
    [prefixInp, suffixInp].forEach(inp => {
        inp.addEventListener('focus', () => fitPSText(inp));
        inp.addEventListener('input', () => fitPSText(inp));
        inp.addEventListener('blur', () => { inp.style.height = ''; });
    });

    resetBtn.onclick = () => {
        prefixInp.value = `execute  positioned ~-1~~ run playanimation @e[x=~,z=~,y=~,r=1] animation.player.attack.positions _ 0 "`;
        suffixInp.value = '';   // 后缀自定义部分为空即可，'方块编号：{id}' 由导出自动附加
    };

    confirmBtn.onclick = () => { doGenerateCommandList(); };
    function doGenerateCommandList() {
        exportPrefix = prefixInp.value.trim();
        exportSuffix = suffixInp.value.trim();
        savePrefixSuffix();
        closeModal();

        const listModal = document.createElement('div');
        listModal.className = 'modal io-soft cmd-list-modal';
        let cmdSeq = 0;
        let listHtml = `<div class="modal-content io-shell cmd-list-shell">
            <div class="io-head cmd-list-head">
                <span class="cmd-list-title">命令列表</span>
                <div class="cmd-list-head-actions">
                    <button class="cmd-head-link" id="outputFileListBtn"><span>输出文件</span></button>
                    <button class="io-close cmd-list-close" id="closeListBtn" type="button" title="关闭">✕</button>
                </div>
            </div>
            <div class="io-body cmd-list-body">
            <div class="cmd-list-scroll">`;

        if (blocks.length === 0) {
            listHtml += '<div class="empty-state">暂无方块</div>';
        } else {
            const boneInstr = getBoneBindInstruction();
            if (boneInstr) {
                cmdSeq++;
                listHtml += `<div class="cmd-card cmd-card-bone">
                    <div class="cmd-card-head">
                        <span class="cmd-card-mark">
                            <img class="cmd-card-icon" src="${ICON_CUBE}" alt="">
                        </span>
                        <span class="cmd-card-name">骨骼绑定指令</span>
                        <button class="cmd-copy-btn" data-block-id="骨骼"><span>molang</span></button>
                    </div>
                    <pre class="cmd-preview">${escapeHtml(boneInstr)}</pre>
                </div>`;
            }
            const exportBlocks = getBoneOrderedBlocks();
            for (let b of exportBlocks) {
                // 多层动画：一个方块可能输出多条指令（base + 各动画控制器）
                const cmds = (typeof getCommandTextsForBlock === 'function')
                    ? getCommandTextsForBlock(b)
                    : [{ key: '__base__', name: 'FMBE_variables', base: true, text: getCommandTextForBlock(b) }];
                const typeIcon = b.type === 'dropitem'
                    ? texUrl('items/dye_powder_yellow.png')
                    : blockTypeIcon(b.type);
                const typeName = b.type === 'flag' ? '旗帜' : b.type === 'halfbrick' ? '半砖' : b.type === 'stair' ? '楼梯' : b.type === 'plane' ? '平面' : b.type === 'dropitem' ? '掉落物' : '方块';
                for (const c of cmds) {
                    cmdSeq++;
                    listHtml += `<div class="cmd-card">
                    <div class="cmd-card-head">
                        <span class="cmd-card-mark">
                            <img class="cmd-card-icon" src="${typeIcon}" alt="${typeName}" title="${typeName}">
                        </span>
                        <span class="cmd-card-name">${escapeHtml(b.id)}</span>
                        <button class="cmd-copy-btn" data-block-id="${escapeHtml(b.id)}" title="复制本行指令"><span>${escapeHtml(c.name || '复制')}</span></button>
                    </div>
                    <pre class="cmd-preview">${escapeHtml(c.text)}</pre>
                </div>`;
                }
            }
        }

        listHtml += `</div>
            <div class="io-actions cmd-list-actions">
                <span class="cmd-list-count">共 ${cmdSeq} 条指令</span>
                <button class="cmd-copy-all" id="copyAllBtn"><span>全部复制</span></button>
            </div>
            </div>
        </div>`;

        listModal.innerHTML = listHtml;
        document.body.appendChild(listModal);

        // 单个复制
        listModal.querySelectorAll('.cmd-copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.cmd-card');
                const preview = card?.querySelector('.cmd-preview');
                if (!preview) return;
                const cmd = preview.textContent;
                copyToClipboard(cmd);
                const label = btn.querySelector('span') || btn;
                const orig = label.textContent;
                label.textContent = '已复制';
                setTimeout(() => label.textContent = orig, 1500);
            });
        });

        const copyAllBtn = listModal.querySelector('#copyAllBtn');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', () => {
                const allCmds = Array.from(listModal.querySelectorAll('.cmd-preview'))
                    .map(pre => pre.textContent)
                    .join('\n');
                copyToClipboard(allCmds, '已复制全部命令');
                const label = copyAllBtn.querySelector('span') || copyAllBtn;
                const orig = label.textContent;
                label.textContent = '已复制全部';
                setTimeout(() => label.textContent = orig, 1500);
            });
        }
        const outputFileListBtn = listModal.querySelector('#outputFileListBtn');
        if (outputFileListBtn) {
            outputFileListBtn.addEventListener('click', () => {
                const allCmds = Array.from(listModal.querySelectorAll('.cmd-preview'))
                    .map(pre => pre.textContent)
                    .join('\n') || '（暂无方块）';
                downloadTextFile(allCmds, `commands_${Date.now()}.txt`);
                const label = outputFileListBtn.querySelector('span') || outputFileListBtn;
                const orig = label.textContent;
                label.textContent = '已保存';
                setTimeout(() => label.textContent = orig, 1500);
            });
        }
        listModal.querySelector('#closeListBtn').onclick = () => listModal.remove();
    }

    compressBtn.onclick = () => {
        exportPrefix = prefixInp.value.trim();
        exportSuffix = suffixInp.value.trim();
        savePrefixSuffix();
        closeModal();
        showCompressExportModal(true);
    };

    // 结构导出：先开「预览 + 自定义长宽高」弹窗，确认后再生成 Bedrock .mcstructure
    mcStructBtn.onclick = () => {
        exportPrefix = prefixInp.value.trim();
        exportSuffix = suffixInp.value.trim();
        savePrefixSuffix();
        closeModal();
        showMcStructExportModal();
    };

    // 输出文件：直接下载常规指令 TXT（非压缩导出）
    outputFileBtn.onclick = () => { doOutputFile(); };
    function doOutputFile() {
        exportPrefix = prefixInp.value.trim();
        exportSuffix = suffixInp.value.trim();
        savePrefixSuffix();
        const text = blocks.length === 0
            ? '（暂无方块）'
            : getBoneOrderedBlocks().map(b => {
                const cmds = (typeof getCommandTextsForBlock === 'function') ? getCommandTextsForBlock(b) : [{ text: getCommandTextForBlock(b) }];
                return cmds.map(c => c.text).join('\n');
            }).join('\n');
        downloadTextFile(text, `commands_${Date.now()}.txt`);
    };

    cancelBtn.onclick = closeModal;
}

// ==================== 结构导出预览（用户指定 长/宽/高） ====================
// 布局由 planMcStructureLayout 计算（见 01-…mcstructure-export.js）：
//   奇数 x = 命令方块列、偶数 x = 狐狸列；车道间用空指令导线跨接。
// ★ 预览改为【3D 体素视图】：用程序化贴图模拟游戏里的「链式命令方块」外观，
//   所有格子（含转向格）都是命令方块，橙色圆点 = 狐狸；画布可拖动旋转，左下角固定 XYZ 正方向坐标轴。
// ---------- 程序化贴图（不依赖外部图片，离线可用） ----------
// 链式命令方块：青绿色底 + 斜角边框 + 指向右侧的箭头（对应 Minecraft 的 chain_command_block）
function makeCmdFaceTexture() {
    const S = 64;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#3f8d7d'; g.fillRect(0, 0, S, S);                 // 底色
    g.fillStyle = '#236353'; g.fillRect(0, 0, S, 3); g.fillRect(0, 0, 3, S);      // 左上暗边
    g.fillStyle = '#6fc4ad'; g.fillRect(0, S - 3, S, 3); g.fillRect(S - 3, 0, 3, S); // 右下亮边
    g.fillStyle = '#58a691'; g.fillRect(7, 7, 50, 50);               // 内面板
    g.fillStyle = '#2c7567'; g.fillRect(7, 7, 50, 3); g.fillRect(7, 7, 3, 50);
    g.fillStyle = '#7dd2bb'; g.fillRect(7, 54, 50, 3); g.fillRect(54, 7, 3, 50);
    // 箭头（命令方块标志）
    g.strokeStyle = '#153f38'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(16, 32); g.lineTo(46, 32); g.stroke();
    g.beginPath(); g.moveTo(36, 20); g.lineTo(50, 32); g.lineTo(36, 44); g.stroke();
    g.strokeStyle = '#a9e9d7'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(17, 30); g.lineTo(45, 30); g.stroke();
    return cv;
}
// ★ 转向格（位置法的跨道导线）同样按【普通链式命令方块】渲染（用户 2026-11-08 要求）：
//   不再用灰色虚线贴图，整片都是命令方块外观，与游戏内一致。
function showMcStructExportModal() {
    let plan0;
    try { plan0 = planMcStructureLayout({}); }
    catch (e) { showToast('生成结构失败：' + (e && e.message ? e.message : e)); return; }

    const n = plan0.n;
    const defZ = Math.max(1, Math.ceil(Math.sqrt(n)));
    const defY = Math.max(1, Math.ceil(n / defZ));

    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal io-soft';
    modalDiv.innerHTML = `
      <div class="modal-content io-shell" style="max-width:470px;">
        <div class="io-head">
          <span>🧱 结构导出预览</span>
          <button class="io-close" id="pvCancel" type="button" title="关闭">✕</button>
        </div>
        <div class="io-body">
          <div class="io-labelrow">
            <span class="label-hint">长（Z）</span>
            <span class="label-hint">宽（X，偶数）</span>
            <span class="label-hint">高（Y）</span>
          </div>
          <div style="display:flex;gap:8px;">
            <input id="pvZ" class="modal-input-text" style="flex:1;min-width:0;" type="number" min="1" max="64" value="${defZ}">
            <input id="pvX" class="modal-input-text" style="flex:1;min-width:0;" type="number" min="2" max="64" step="2" value="2">
            <input id="pvY" class="modal-input-text" style="flex:1;min-width:0;" type="number" min="1" max="64" value="${defY}">
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
            <label class="label-hint" style="display:flex;align-items:center;gap:5px;white-space:nowrap;cursor:pointer;">
              <input id="pvTagMode" type="checkbox"> 双 tag 识别法
            </label>
            <input id="pvModelTag" class="modal-input-text" style="flex:1;min-width:0;" placeholder="模型 tag（支持中文）" value="FMBE" disabled>
          </div>
          <div id="pvTagHint" class="label-hint" style="line-height:1.5;margin-top:4px;color:#8fb0a6;word-break:break-all;"></div>
          <details id="pvNbtBox" style="margin-top:8px;">
            <summary class="label-hint" style="cursor:pointer;color:#8fb0a6;">
              狐狸实体 NBT 预设（展开可勾选/改值）<span id="pvNbtCount" style="margin-left:6px;"></span>
            </summary>
            <div id="pvNbtList" style="max-height:240px;overflow:auto;border:1px solid rgba(255,255,255,.10);border-radius:8px;padding:4px 6px;margin-top:4px;"></div>
            <div class="label-hint" style="line-height:1.5;margin-top:4px;color:#8fb0a6;">
              默认值与原先硬编码一致；取消勾选 = 不写该字段。装备槽 Name 填物品 id（如 minecraft:diamond_helmet，留空 = 空槽）；
              属性只改 Base / Current / Max（Min 等固定）；neteaseComponents 是 JSON 字符串，留空 = 用默认。
              Pos / Motion / Rotation / definitions 等结构字段仍固定写入。
            </div>
          </details>
          <canvas id="pvCanvas" width="600" height="420"
            style="width:100%;height:auto;border-radius:8px;margin:10px 0 6px;background:#0b1220;cursor:grab;touch-action:none;"></canvas>
          <div class="label-hint" style="line-height:1.6;margin-bottom:6px;">
            拖动画面可旋转视角 ·
            <span style="color:#6fc4ad;">■</span> 链式命令方块（含转向格） ·
            <span style="color:#fb923c;">●</span> 狐狸
          </div>
          <div id="pvInfo" class="label-hint" style="line-height:1.6;"></div>
          <div class="io-actions" style="margin-top:10px;">
            <button class="io-chip io-chip-blue" id="pvExport" type="button"><span>导出 .mcstructure</span></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modalDiv);

    const inZ = modalDiv.querySelector('#pvZ');
    const inX = modalDiv.querySelector('#pvX');
    const inY = modalDiv.querySelector('#pvY');
    const canvas = modalDiv.querySelector('#pvCanvas');
    const infoEl = modalDiv.querySelector('#pvInfo');
    const tagChk = modalDiv.querySelector('#pvTagMode');
    const tagInp = modalDiv.querySelector('#pvModelTag');
    const tagHint = modalDiv.querySelector('#pvTagHint');
    const nbtList = modalDiv.querySelector('#pvNbtList');
    const nbtCount = modalDiv.querySelector('#pvNbtCount');
    let curPlan = plan0;

    // 预设狐狸 NBT：按 FOX_NBT_SPEC 分组渲染「勾选框 + 键名 + 值输入框」（默认全写、值＝原硬编码）
    function renderFoxNbtRows() {
        if (typeof FOX_NBT_SPEC === 'undefined' || !nbtList) return;
        const groups = [];
        FOX_NBT_SPEC.forEach(f => {
            let g = groups.find(x => x.g === f.g);
            if (!g) groups.push(g = { g: f.g, items: [] });
            g.items.push(f);
        });
        nbtList.innerHTML = groups.map(g =>
            `<div style="font-size:11px;color:#7fa1a0;margin:6px 0 2px;letter-spacing:.5px;">${escapeHtml(g.g)}</div>`
            + g.items.map(f =>
                `<label style="display:flex;align-items:center;gap:6px;font-size:12px;line-height:1.7;">`
                + `<input type="checkbox" class="pv-nbt-chk" data-k="${f.k}" checked>`
                + `<span style="flex:0 0 150px;color:#a8c0b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:monospace;" title="${f.t}">${f.k}</span>`
                + `<input class="pv-nbt-val modal-input-text" data-k="${f.k}" value="${f.v}" style="flex:1 1 auto;min-width:0;height:22px;padding:1px 6px;">`
                + `</label>`).join('')
        ).join('') + renderFoxStructuredRows();
        nbtList.querySelectorAll('.pv-nbt-chk').forEach(chk => chk.addEventListener('change', updateFoxNbtCount));
        updateFoxNbtCount();
    }

    // 结构化字段（装备槽 / 属性 / netease 组件）：形状固定，只让用户改内容
    function renderFoxStructuredRows() {
        const grpTitle = t => `<div style="font-size:11px;color:#7fa1a0;margin:10px 0 2px;letter-spacing:.5px;">${escapeHtml(t)}</div>`;
        const smallInp = (cls, attr, val) =>
            `<input class="${cls} modal-input-text" ${attr} value="${escapeHtml(String(val))}" style="flex:1 1 0;min-width:0;height:22px;padding:1px 6px;">`;
        let html = '';

        // 装备槽：7 格 × Name / Count / Damage
        if (typeof FOX_EQUIP_SLOTS !== 'undefined') {
            html += grpTitle('装备槽（Name 填物品 id，留空 = 空槽）');
            html += FOX_EQUIP_SLOTS.map(s =>
                `<div style="display:flex;align-items:center;gap:6px;font-size:12px;line-height:1.7;">`
                + `<span style="flex:0 0 96px;color:#a8c0b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${s.key}">${escapeHtml(s.label)}</span>`
                + smallInp('pv-eq-name', `data-slot="${s.key}"`, '')
                + smallInp('pv-eq-count', `data-slot="${s.key}"`, 0)
                + smallInp('pv-eq-dmg', `data-slot="${s.key}"`, 0)
                + `</div>`).join('');
        }

        // 属性：19 条 × Base / Current / Max（Min / DefaultMin / DefaultMax 固定）
        if (typeof FOX_ATTR_SPEC !== 'undefined') {
            html += grpTitle('属性 Attributes（Base / Current / Max）');
            html += FOX_ATTR_SPEC.map(a =>
                `<div style="display:flex;align-items:center;gap:6px;font-size:12px;line-height:1.7;">`
                + `<span style="flex:0 0 150px;color:#a8c0b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:monospace;" title="${a[0]}">${escapeHtml(a[0])}</span>`
                + smallInp('pv-attr-base', `data-attr="${a[0]}"`, a[1])
                + smallInp('pv-attr-curr', `data-attr="${a[0]}"`, a[2])
                + smallInp('pv-attr-max', `data-attr="${a[0]}"`, a[4])
                + `</div>`).join('');
        }

        // neteaseComponents：5 条 JSON 字符串
        if (typeof FOX_NETEASE_COMPONENTS !== 'undefined') {
            html += grpTitle('neteaseComponents（JSON 字符串）');
            html += FOX_NETEASE_COMPONENTS.map(c =>
                `<div style="display:flex;align-items:center;gap:6px;font-size:12px;line-height:1.7;">`
                + `<span style="flex:0 0 150px;color:#a8c0b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:monospace;" title="${c.k}">${escapeHtml(c.k)}</span>`
                + `<input class="pv-nc modal-input-text" data-nc="${c.k}" value="${escapeHtml(c.v)}" style="flex:1 1 auto;min-width:0;height:22px;padding:1px 6px;">`
                + `</div>`).join('');
        }
        return html;
    }

    function updateFoxNbtCount() {
        if (!nbtList || !nbtCount) return;
        const all = nbtList.querySelectorAll('.pv-nbt-chk');
        const on = nbtList.querySelectorAll('.pv-nbt-chk:checked');
        nbtCount.textContent = `写入 ${on.length} / ${all.length} 项`;
    }

    // 从 UI 收集用户选择：
    //   { values:{键:值}, drop:{键:true}, equip:{槽:{Name,Count,Damage}}, attr:{名:{Base,Current,Max}}, netease:{组件:JSON串} }
    function foxNbtOptsFromUi() {
        const values = {}, drop = {}, equip = {}, attr = {}, netease = {};
        if (!nbtList) return null;
        const hasSpec = (typeof FOX_NBT_SPEC !== 'undefined');
        if (hasSpec) {
            nbtList.querySelectorAll('.pv-nbt-chk').forEach(chk => {
                const k = chk.getAttribute('data-k');
                if (!chk.checked) { drop[k] = true; return; }
                const spec = FOX_NBT_SPEC.find(f => f.k === k);
                const el = nbtList.querySelector('.pv-nbt-val[data-k="' + k + '"]');
                let v = String(el ? el.value : '').trim();
                if (spec && (spec.t === 'byte' || spec.t === 'short' || spec.t === 'int' || spec.t === 'long'
                    || spec.t === 'float' || spec.t === 'double')) {
                    const n = Number(v);
                    values[k] = Number.isFinite(n) ? n : spec.v;
                } else {
                    values[k] = v;
                }
            });
        }

        const numOr = (el, def) => {
            const n = Number(String(el ? el.value : '').trim());
            return Number.isFinite(n) ? n : def;
        };
        // 装备槽：Name 空 = 空槽（导出端写空名字），Count / Damage 非法则 0
        if (typeof FOX_EQUIP_SLOTS !== 'undefined') {
            FOX_EQUIP_SLOTS.forEach(s => {
                const nameEl = nbtList.querySelector('.pv-eq-name[data-slot="' + s.key + '"]');
                const cntEl = nbtList.querySelector('.pv-eq-count[data-slot="' + s.key + '"]');
                const dmgEl = nbtList.querySelector('.pv-eq-dmg[data-slot="' + s.key + '"]');
                equip[s.key] = {
                    Name: String(nameEl ? nameEl.value : '').trim(),
                    Count: numOr(cntEl, 0),
                    Damage: numOr(dmgEl, 0)
                };
            });
        }
        // 属性：只收集 Base / Current / Max，非法回退默认值
        if (typeof FOX_ATTR_SPEC !== 'undefined') {
            FOX_ATTR_SPEC.forEach(a => {
                attr[a[0]] = {
                    Base: numOr(nbtList.querySelector('.pv-attr-base[data-attr="' + a[0] + '"]'), a[1]),
                    Current: numOr(nbtList.querySelector('.pv-attr-curr[data-attr="' + a[0] + '"]'), a[2]),
                    Max: numOr(nbtList.querySelector('.pv-attr-max[data-attr="' + a[0] + '"]'), a[4])
                };
            });
        }
        // neteaseComponents：留空不收集，导出端自动回退默认 JSON
        if (typeof FOX_NETEASE_COMPONENTS !== 'undefined') {
            FOX_NETEASE_COMPONENTS.forEach(c => {
                const el = nbtList.querySelector('.pv-nc[data-nc="' + c.k + '"]');
                const v = String(el ? el.value : '').trim();
                if (v) netease[c.k] = v;
            });
        }
        return { values, drop, equip, attr, netease };
    }

    // 双 tag 识别法选项：勾选且 tag 非空才生效（空 tag 会退回位置法）
    function tagOpts() {
        const modelTag = String(tagInp.value || '').trim();
        return (tagChk.checked && modelTag) ? { tagMode: true, modelTag } : {};
    }
    function syncTagUi() {
        tagInp.disabled = !tagChk.checked;
        const on = tagChk.checked && String(tagInp.value || '').trim() !== '';
        // tag 法没有狐狸列 ⇒ 宽可以任意（不用偶数），最小 1
        inX.min = on ? 1 : 2;
        inX.step = on ? 1 : 2;
        if (tagChk.checked && !on) {
            tagHint.textContent = '请填写模型 tag（支持中文）；留空会退回默认位置法。';
        } else if (on) {
            const tpl = (typeof structTagPrefixTemplate === 'function') ? structTagPrefixTemplate(tagInp.value) : '';
            tagHint.textContent = '前缀已锁定（不可改）· ' + tpl.replace('{tags}', '<方块名>');
        } else {
            tagHint.textContent = '默认位置法：1 命令方块 ↔ 1 只狐狸（前缀可改）；一个方块的多个动画控制器会落到不同狐狸上。';
        }
    }

    // ======================= Three.js 真实 3D 预览 =======================
    // 画布交给 WebGL 渲染器：真实方块几何 + 逐面 UV，贴图不会再镜像/旋转，方块也不会对不齐。
    let yaw = 0.72, pitch = 0.5;
    // 逻辑尺寸固定 600×420（CSS 再等比缩放）；setViewport/setScissor 都要用它，不能用 canvas.width
    // （setPixelRatio 之后 canvas.width 已经是物理像素，再传进去会被乘两次 dpr）。
    const CW = 600, CH = 420;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(CW, CH, false);
    renderer.setClearColor(0x0b1220, 1);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    const camera = new THREE.PerspectiveCamera(40, CW / CH, 0.1, 4000);

    // ---- 贴图：真实链式命令方块 front / side / back（需 http 打开），失败时退回程序化贴图 ----
    const texFallback = new THREE.CanvasTexture(makeCmdFaceTexture());
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    texFallback.anisotropy = maxAniso; texFallback.needsUpdate = true;
    const texImgs = { front: null, side: null, back: null };
    function loadCmdTexture(key, src) {
        const img = new Image();
        img.onload = () => {
            const t = new THREE.Texture(img);
            if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
            t.anisotropy = maxAniso;
            t.needsUpdate = true;
            texImgs[key] = t;
            rebuildVoxels();
            renderPreview();
        };
        img.src = src;
    }
    loadCmdTexture('front', 'Textures/chain_command_block_front.png');
    loadCmdTexture('side', 'Textures/chain_command_block_side.png');
    loadCmdTexture('back', 'Textures/chain_command_block_back.png');

    // facing_direction（0=下 1=上 2=北(-Z) 3=南(+Z) 4=西(-X) 5=东(+X)）→ 单位法线
    const FACING_VEC = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
    // ★ 花纹有方向：命令方块的图案要「箭头指向下一格」（facing），而不是每面都按世界朝上贴。
    //   实测（chain_command_block_side.png，逐行统计浅色面板宽度）：五边形尖端在贴图「顶部」，
    //   而 Texture.flipY=true 下贴图顶部 = UV v 增大的方向（+v）；代码里 v = -w，
    //   所以要让尖端 = +facing，必须让 w（贴图“下”方向）= -facing。
    //   facing 落在该面平面内（侧面/顶底面）⇒ w = -facing；
    //   正/背对面 facing 是法线 ⇒ 退回世界 -Y（顶/底面以 +Z 为“下”）。
    //   u = 贴图 +x（屏幕右）、v = -w（贴图顶部方向），o = 面中心 - (u+v)/2。
    const FACES = [
        { n: [1, 0, 0],  shade: 0.78 }, // +X
        { n: [-1, 0, 0], shade: 0.68 }, // -X
        { n: [0, 1, 0],  shade: 1.00 }, // +Y 顶
        { n: [0, -1, 0], shade: 0.55 }, // -Y 底
        { n: [0, 0, 1],  shade: 0.92 }, // +Z
        { n: [0, 0, -1], shade: 0.74 }, // -Z
    ];
    function cross3(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }

    let voxelGroup = null;
    function disposeGroup(obj) {
        if (!obj) return;
        obj.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => m.dispose());   // 贴图本身复用，只释放材质
            }
        });
        scene.remove(obj);
    }

    // 按「贴图槽」合并几何：front / back / side 各一个 mesh，
    // 几千个方块也只有 3 次 draw call，且每面 UV 独立（不会再出现整面贴错）
    // ★ 转向格（real:false 的跨道导线）也按命令方块渲染：facing 同样由布局给出。
    function rebuildVoxels() {
        disposeGroup(voxelGroup);
        voxelGroup = new THREE.Group();
        const buckets = {};
        const slotOf = (face, fv) => {
            const n = face.n;
            if (n[0] === fv[0] && n[1] === fv[1] && n[2] === fv[2]) return 'front';
            if (n[0] === -fv[0] && n[1] === -fv[1] && n[2] === -fv[2]) return 'back';
            return 'side';
        };
        // 占用集合：相邻格子有方块时就不生成那一面（否则两片共面四边形会 z-fighting 闪烁）
        const occupied = new Set();
        curPlan.chain.forEach(c => occupied.add(c.lx + ',' + c.ly + ',' + c.lz));
        curPlan.chain.forEach(c => {
            const fv = FACING_VEC[c.facing] || FACING_VEC[3];
            FACES.forEach(face => {
                if (occupied.has((c.lx + face.n[0]) + ',' + (c.ly + face.n[1]) + ',' + (c.lz + face.n[2]))) return;
                const key = slotOf(face, fv);
                const B = buckets[key] || (buckets[key] = { p: [], n: [], uv: [], col: [], idx: [], next: 0 });
                const n = face.n;
                const dot = fv ? (n[0] * fv[0] + n[1] * fv[1] + n[2] * fv[2]) : 0;
                // w = 贴图「下」方向。五边形尖端在贴图顶部（= +v = -w），要让它指向下一格：
                //   facing 在该面平面内 ⇒ w = -facing；否则退回世界 -Y（顶/底用 +Z）。
                const w = (fv && Math.abs(dot) < 0.5)
                    ? [-fv[0], -fv[1], -fv[2]]
                    : (n[1] !== 0 ? [0, 0, 1] : [0, -1, 0]);
                const u = cross3(w, n);                 // 贴图 +x（屏幕右）
                const v = [-w[0], -w[1], -w[2]];        // 贴图 +y（屏幕下）
                // 面中心用「方块局部坐标」（0..1）：下面 push 时会再加 c.lx/ly/lz，不能重复加
                const cx = 0.5 + n[0] * 0.5;
                const cy = 0.5 + n[1] * 0.5;
                const cz = 0.5 + n[2] * 0.5;
                const o = [cx - (u[0] + v[0]) / 2, cy - (u[1] + v[1]) / 2, cz - (u[2] + v[2]) / 2];
                const q = [
                    [o[0], o[1], o[2], 0, 0],
                    [o[0] + u[0], o[1] + u[1], o[2] + u[2], 1, 0],
                    [o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2], 1, 1],
                    [o[0] + v[0], o[1] + v[1], o[2] + v[2], 0, 1]
                ];
                q.forEach(pt => {
                    B.p.push(c.lx + pt[0], c.ly + pt[1], c.lz + pt[2]);
                    B.n.push(face.n[0], face.n[1], face.n[2]);
                    B.uv.push(pt[3], pt[4]);
                    B.col.push(face.shade, face.shade, face.shade);
                });
                const i0 = B.next;
                B.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
                B.next += 4;
            });
        });
        const maps = {
            front: texImgs.front || texFallback,
            side: texImgs.side || texFallback,
            back: texImgs.back || texFallback
        };
        Object.keys(buckets).forEach(key => {
            const B = buckets[key];
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
            g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
            g.setIndex(B.idx);
            const m = new THREE.MeshBasicMaterial({
                map: maps[key], vertexColors: true, side: THREE.DoubleSide
            });
            voxelGroup.add(new THREE.Mesh(g, m));
        });
        // 狐狸：橙色小球。
        //  位置法 → 每个 real 格一只，站在命令方块 x-1 格中心；
        //  tag 法 → 全部叠在同一点（结构正上方中央），N 只重合 ⇒ 只画一个点。
        const foxPositions = curPlan.tagMode
            ? [curPlan.foxPosLocal.slice()]
            : curPlan.chain.filter(c => c.real).map(c => [c.lx - 0.5, c.ly + 0.5, c.lz + 0.5]);
        if (foxPositions.length) {
            const fg = new THREE.SphereGeometry(0.22, 8, 6);
            const fm = new THREE.MeshBasicMaterial({ color: 0xfb923c });
            const foxes = new THREE.InstancedMesh(fg, fm, foxPositions.length);
            const mtx = new THREE.Matrix4();
            foxPositions.forEach((p, i) => {
                mtx.makeTranslation(p[0], p[1], p[2]);
                foxes.setMatrixAt(i, mtx);
            });
            foxes.instanceMatrix.needsUpdate = true;
            voxelGroup.add(foxes);
        }
        scene.add(voxelGroup);
    }

    // ---- 左下角 XYZ 正方向坐标轴：仿 Gizmo 的细杆 + 小圆锥 + 字母标签（独立正交相机画在角落）----
    const axisScene = new THREE.Scene();
    const axisCamera = new THREE.OrthographicCamera(-2.4, 2.4, 2.4, -2.4, 0.1, 100);
    (function buildAxes() {
        const AX = [
            { dir: [1, 0, 0], col: 0xff4b4b, label: 'X+' },
            { dir: [0, 1, 0], col: 0x35e06a, label: 'Y+' },
            { dir: [0, 0, 1], col: 0x3f8dff, label: 'Z+' },
        ];
        const up = new THREE.Vector3(0, 1, 0);
        AX.forEach(a => {
            const dir = new THREE.Vector3(a.dir[0], a.dir[1], a.dir[2]);
            const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
            const mat = new THREE.MeshBasicMaterial({ color: a.col });
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.32, 8), mat);
            shaft.quaternion.copy(q);
            shaft.position.copy(dir).multiplyScalar(0.66);
            axisScene.add(shaft);
            const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 10), mat);
            head.quaternion.copy(q);
            head.position.copy(dir).multiplyScalar(1.50);
            axisScene.add(head);
            const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 96;
            const g2 = cv2.getContext('2d');
            g2.font = 'bold 44px sans-serif';
            g2.fillStyle = '#' + a.col.toString(16).padStart(6, '0');
            g2.textAlign = 'center'; g2.textBaseline = 'middle';
            g2.fillText(a.label, 48, 50);
            const texL = new THREE.CanvasTexture(cv2);
            if (THREE.SRGBColorSpace) texL.colorSpace = THREE.SRGBColorSpace;
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texL, transparent: true, depthTest: false }));
            sp.scale.set(0.72, 0.72, 1);
            sp.position.copy(dir).multiplyScalar(1.94);
            axisScene.add(sp);
        });
        axisScene.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0xdbe4f0 })
        ));
    })();

    function renderPreview() {
        const p = curPlan;
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const target = new THREE.Vector3(p.sizeX / 2, p.sizeY / 2, p.sizeZ / 2);
        const halfH = Math.tan((camera.fov * Math.PI / 180) / 2);
        const halfW = halfH * (CW / CH);
        const radius = Math.sqrt(p.sizeX * p.sizeX + p.sizeY * p.sizeY + p.sizeZ * p.sizeZ) / 2;
        const dist = radius / Math.min(halfH, halfW) * 1.12 + 1.5;
        // 视角方向：yaw 绕 Y、pitch 抬头（与拖动方向一致）
        const dir = new THREE.Vector3(cp * Math.sin(yaw), sp, cp * Math.cos(yaw));
        camera.position.copy(target).addScaledVector(dir, dist);
        camera.up.set(0, 1, 0);
        camera.lookAt(target);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, CW, CH);
        renderer.render(scene, camera);

        // 左下角坐标轴（scissor 小视口，跟着视角一起转）
        const S = 96, M = 10;
        renderer.setScissorTest(true);
        renderer.setScissor(M, M, S, S);
        renderer.setViewport(M, M, S, S);
        renderer.setClearColor(0x0b1220, 1);
        renderer.clear();
        axisCamera.position.copy(dir).multiplyScalar(9);
        axisCamera.up.set(0, 1, 0);
        axisCamera.lookAt(0, 0, 0);
        renderer.render(axisScene, axisCamera);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, CW, CH);
    }

    let disposed = false;
    function destroyPreview() {
        if (disposed) return;
        disposed = true;
        disposeGroup(voxelGroup);
        voxelGroup = null;
        try { renderer.dispose(); } catch (e) {}
        try { if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) {}
    }

    function refresh() {
        const dims = { sizeX: Number(inX.value), sizeY: Number(inY.value), sizeZ: Number(inZ.value) };
        const to = tagOpts();
        try { curPlan = planMcStructureLayout(Object.assign({ dims }, to)); }
        catch (e) { infoEl.textContent = '布局失败：' + (e && e.message ? e.message : e); return; }
        rebuildVoxels();
        renderPreview();
        const p = curPlan;
        let hint;
        if (p.tagMode) {
            hint = `tag 识别法「${p.modelTag}」：承载指令 ${p.n} 条 · 方块 ${p.blockCount} 个 → 狐狸 ${p.blockCount} 只（全部叠放于长方体顶部 1 格）`
                + (p.dummyCount > 0 ? ` + 空导线 ${p.dummyCount} 个` : ' · 无空导线（跨道也是命令方块）')
                + ` · 实际 宽 ${p.sizeX} × 高 ${p.sizeY} × 长 ${p.sizeZ}`;
            hint += ' · 前缀已锁定为 tag 专用前缀';
        } else {
            hint = `承载指令 ${p.n} 条${p.blockCount > 0 ? `（方块 ${p.blockCount} 个）` : ''} + 导线 ${p.dummyCount} 个 · 实际 宽 ${p.sizeX} × 高 ${p.sizeY} × 长 ${p.sizeZ} · 车道 ${p.lanes}`;
        }
        if (p.blockLayers > p.asked.sizeY) hint += ` · 高已自动加到 ${p.blockLayers} 层（装不下）`;
        if (p.sizeZ > p.asked.sizeZ) hint += ` · 长已至少为 ${p.sizeZ}（多车道要留跨道走廊）`;
        if (!p.tagMode && Math.floor(Number(inX.value) || 2) % 2 !== 0) hint += ' · 宽已取偶';
        infoEl.textContent = hint;
    }

    // 拖动旋转视角（yaw 绕 Y、pitch 绕 X，pitch 限制在 ±77° 防止翻转）
    let dragState = null;
    canvas.addEventListener('pointerdown', e => {
        dragState = { x: e.clientX, y: e.clientY };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', e => {
        if (!dragState) return;
        // ★ 手指/鼠标“抓住”模型拖动：往右划模型往右转（yaw 要反向），往下划看到更多顶面
        yaw -= (e.clientX - dragState.x) * 0.012;
        pitch = Math.max(-1.35, Math.min(1.35, pitch + (e.clientY - dragState.y) * 0.009));
        dragState = { x: e.clientX, y: e.clientY };
        renderPreview();
    });
    const endDrag = () => { dragState = null; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    [inZ, inX, inY].forEach(el => el.addEventListener('input', refresh));
    tagChk.addEventListener('change', () => { syncTagUi(); refresh(); });
    tagInp.addEventListener('input', () => { syncTagUi(); refresh(); });
    modalDiv.querySelector('#pvCancel').onclick = () => { destroyPreview(); modalDiv.remove(); };
    modalDiv.querySelector('#pvExport').onclick = () => {
        const dims = { sizeX: Number(inX.value), sizeY: Number(inY.value), sizeZ: Number(inZ.value) };
        const to = tagOpts();
        const foxNbt = foxNbtOptsFromUi();
        destroyPreview();
        modalDiv.remove();
        downloadMcStructure(Object.assign({ dims, foxNbt }, to));
    };
    syncTagUi();
    renderFoxNbtRows();
    refresh();
}

// 重新绑定导出按钮事件（确保使用新的函数）
document.getElementById('exportBtn').onclick = showCommandListModal;

// 结构导入 / 导出入口已分别并入导入/导出面板，此处不再保留独立按钮绑定

// ==================== 场景状态保存与恢复 ====================
let savedSceneState = null;

function saveSceneState() {
    savedSceneState = {
        blocks: blocks.map(b => ({
            meshVisible: b.mesh?.visible ?? true,
            labelVisible: b.label?.visible ?? true,
            selectionWireframeVisible: b.selectionWireframe?.visible ?? true
        })),
        gizmoVisible: gizmoRoot?.visible ?? false
    };

    blocks.forEach(b => {
        if (b.mesh) b.mesh.visible = false;
        if (b.label) b.label.visible = false;
        if (b.selectionWireframe) b.selectionWireframe.visible = false;
    });
    if (gizmoRoot) gizmoRoot.visible = false;
}

function restoreSceneState() {
    if (!savedSceneState) return;

    blocks.forEach((b, i) => {
        const state = savedSceneState.blocks[i];
        if (state) {
            if (b.mesh) b.mesh.visible = state.meshVisible;
            if (b.label) b.label.visible = state.labelVisible;
            if (b.selectionWireframe) b.selectionWireframe.visible = state.selectionWireframeVisible;
        }
    });
    if (gizmoRoot) gizmoRoot.visible = savedSceneState.gizmoVisible;

    savedSceneState = null;
}

