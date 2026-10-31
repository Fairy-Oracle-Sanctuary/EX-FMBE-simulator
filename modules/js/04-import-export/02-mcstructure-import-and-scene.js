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
// 索引规则与导出一致：Z 最快 i = z + x*sz + y*sz*sx。
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
    // 导出前确保 base64 贴图反查索引已就绪（未就绪则本次回退内嵌，下次导出命中）
    ensureTexUriMap();
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
        listModal.className = 'modal io-soft';
        let listHtml = `<div class="modal-content io-shell">
            <div class="io-head">
                <span>📋 命令列表</span>
                <div style="display:flex;align-items:center;gap:4px;">
                    <button class="modal-btn" id="outputFileListBtn" style="color:#1e9b6e;font-size:12.5px;padding:6px 10px;">📄 输出文件</button>
                    <button class="io-close" id="closeListBtn" type="button" title="关闭">✕</button>
                </div>
            </div>
            <div class="io-body" style="padding-bottom:0;">
            <div style="max-height:56vh; overflow-y:auto;">`;

        if (blocks.length === 0) {
            listHtml += '<div class="empty-state">暂无方块</div>';
        } else {
            const boneInstr = getBoneBindInstruction();
            if (boneInstr) {
                listHtml += `<div class="command-card">
                    <div class="command-header">
                        <span class="block-id-badge">🦴 骨骼绑定指令（molang）</span>
                        <button class="copy-cmd-btn" data-block-id="骨骼">📋 复制</button>
                    </div>
                    <pre class="cmd-preview">${escapeHtml(boneInstr)}</pre>
                </div>`;
            }
            const exportBlocks = getBoneOrderedBlocks();
            for (let b of exportBlocks) {
                const cmdText = getCommandTextForBlock(b);
                listHtml += `<div class="command-card">
                    <div class="command-header">
                        <span class="block-id-badge">📦 ${escapeHtml(b.id)} (${b.type === 'flag' ? '旗帜' : b.type === 'halfbrick' ? 'Slab' : b.type === 'stair' ? '楼梯' : '立方体'})</span>
                        <button class="copy-cmd-btn" data-block-id="${b.id}">📋 复制</button>
                    </div>
                    <pre class="cmd-preview">${escapeHtml(cmdText)}</pre>
                </div>`;
            }
        }

        listHtml += `</div>
            <div class="io-actions">
                <button class="modal-btn" id="copyAllBtn">📋 全部复制</button>
            </div>
            </div>
        </div>`;

        listModal.innerHTML = listHtml;
        document.body.appendChild(listModal);

        // 单个复制
        listModal.querySelectorAll('.copy-cmd-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.command-card');
                const preview = card?.querySelector('.cmd-preview');
                if (!preview) return;
                const cmd = preview.textContent;
                copyToClipboard(cmd);
                const orig = btn.innerText;
                btn.innerText = '✅ 已复制';
                setTimeout(() => btn.innerText = orig, 1500);
            });
        });

        const copyAllBtn = listModal.querySelector('#copyAllBtn');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', () => {
                const allCmds = Array.from(listModal.querySelectorAll('.cmd-preview'))
                    .map(pre => pre.textContent)
                    .join('\n');
                copyToClipboard(allCmds, '已复制全部命令');
                const orig = copyAllBtn.innerText;
                copyAllBtn.innerText = '✅ 已复制全部';
                setTimeout(() => copyAllBtn.innerText = orig, 1500);
            });
        }
        const outputFileListBtn = listModal.querySelector('#outputFileListBtn');
        if (outputFileListBtn) {
            outputFileListBtn.addEventListener('click', () => {
                const allCmds = Array.from(listModal.querySelectorAll('.cmd-preview'))
                    .map(pre => pre.textContent)
                    .join('\n') || '（暂无方块）';
                downloadTextFile(allCmds, `commands_${Date.now()}.txt`);
                const orig = outputFileListBtn.innerText;
                outputFileListBtn.innerText = '✅ 已保存';
                setTimeout(() => outputFileListBtn.innerText = orig, 1500);
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

    // 结构导出：生成 Bedrock .mcstructure（1 命令方块 ↔ 1 狐狸）
    mcStructBtn.onclick = () => {
        exportPrefix = prefixInp.value.trim();
        exportSuffix = suffixInp.value.trim();
        savePrefixSuffix();
        downloadMcStructure();
        closeModal();
    };

    // 输出文件：直接下载常规指令 TXT（非压缩导出）
    outputFileBtn.onclick = () => { doOutputFile(); };
    function doOutputFile() {
        exportPrefix = prefixInp.value.trim();
        exportSuffix = suffixInp.value.trim();
        savePrefixSuffix();
        const text = blocks.length === 0
            ? '（暂无方块）'
            : getBoneOrderedBlocks().map(b => getCommandTextForBlock(b)).join('\n');
        downloadTextFile(text, `commands_${Date.now()}.txt`);
    };

    cancelBtn.onclick = closeModal;
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

