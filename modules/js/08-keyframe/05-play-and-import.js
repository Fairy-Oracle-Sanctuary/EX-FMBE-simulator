/* 08-keyframe/05-play-and-import.js · 源 测试版v.6b79.html 第 43261-43577 行 */
'use strict';
// ==================== 导入关键帧 ====================
function showKeyframeImportDialog() {
    // ★【2026-10-13】旧操作模式只读：不导入/不覆盖关键帧数据（导入入口已迁至新操作模式时间表）
    if (kfBlockLegacyEdit('导入关键帧，')) return;
    const overlay = document.createElement('div');
    overlay.className = 'keyframe-import-modal';
    
    let html = `<div class="keyframe-import-content">
        <div class="keyframe-import-title">📥 导入关键帧</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">
            粘贴Minecraft命令或关键帧数据。系统将解析其中的 <code>v.xxx=值;</code> 赋值语句。
        </div>
        <div class="keyframe-import-time-input">
            <label>关键帧时间:</label>
            <input type="number" id="kfImportTime" value="0" step="0.5" min="0">
            <label style="margin-left:12px;">秒</label>
        </div>
        <textarea class="keyframe-import-textarea" id="kfImportText" placeholder="粘贴命令或数据..."></textarea>
        <div class="keyframe-import-actions">
            <button class="keyframe-window-btn" id="kfImportConfirm">导入</button>
            <button class="keyframe-window-btn" id="kfImportCancel">取消</button>
        </div>
    </div>`;
    
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    
    const textarea = overlay.querySelector('#kfImportText');
    const timeInput = overlay.querySelector('#kfImportTime');
    
    overlay.querySelector('#kfImportConfirm').addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) { overlay.remove(); return; }
        const time = parseFloat(timeInput.value) || 0;
        processKeyframeImport(text, time, overlay);
    });
    
    overlay.querySelector('#kfImportCancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// 解析单条关键帧命令，返回 { blockId, frames: Map<time, Map<varName, value>> } 或 null
/* ★★★【2026-10-16 P0 修复 · 用户投诉「最末帧有时候会有变量丢失 / 生成的指令有问题」】
   根因（真浏览器实测 `_r10_parse.cjs`，同一份真实导出命令喂两个解析器）：
     · 本函数（旧正则解析器）用 `\(([^)]+)\)` 取条件块内容 —— **遇第一个 `)` 就截断**，
       而 v2 程序的块里含 `v.<id>_u=math.max(0,math.min((...)/...,1))` 这类嵌套括号
       ⇒ 第 2 帧起取到的是残缺文本；
     · 参数名匹配用 `v\.start_<var>` / `v\.T<var>`，**认不出带方块命名空间的
       `v.<id>_start_<var>` / `v.<id>_T<var>`** ⇒ `usedNew` 恒 false ⇒ 只能落进
       「旧格式兜底」，把 `v.Cube_seg_time` 这类内部量当成变量收下，
       真正的 side_a/side_b/angle **全部丢失**；
     · 首帧则抓到了**前段常量**（当前值 = 最后一帧编辑值）⇒ 首帧显示成末帧的值。
   实测对照：旧解析器得到 `帧0={side_a:9,side_b:8,angle:70}`（错的）、`帧1/帧2` 全空；
   统一解析器 `kfParseProgramText` 得到正确的 `帧0={1,2,30} / 帧1={5,4,50} / 帧2={9,8,70}`。
   ★ 用户明确要求「必须换成统一的 molang 注入、解析、修改写法」
   ⇒ 本函数**改为委托统一解析器 `kfParseProgramText`**（与编译器/时间表/反向同步同一真相源），
     仅在统一解析器认不出（纯旧版格式）时才回退到下面的旧正则分支。
   这样「导出文本 → 导入」与「编辑器内部」看到的是同一份帧数据，尾帧不再丢变量。 */
function parseSingleKeyframeCommand(cmd) {
    const idMatch = cmd.match(/['"]方块编号：([^'"]+)['"]/);
    const blockId = idMatch ? idMatch[1] : null;
    if (!blockId) return null;

    // ---- ① 统一解析（v2 命名空间程序 / 含嵌套括号的条件块都能正确解析）----
    try {
        if (typeof kfParseProgramText === 'function') {
            // 取出 playanimation 双引号内的 molang 载荷（没有引号就直接用原文）
            const qm = cmd.match(/"([\s\S]*)"\s*;?\s*$/);
            const payload = qm ? qm[1] : cmd;
            const p = kfParseProgramText(payload);
            if (p && p.blkStart && p.blkStart.size) {
                const frames = new Map();
                for (const [t, m] of p.blkStart) {
                    if (!Number.isFinite(t)) continue;
                    const vm = new Map();
                    for (const [n, v] of m) {
                        if (!Number.isFinite(v)) continue;
                        if (isKeyframeInternalVar(n, blockId) || _kfIsNsInternal(n, blockId)) continue;
                        vm.set(n, v);
                    }
                    // 数值帧可能只有内部量（异常数据）→ 不建空帧
                    if (vm.size) frames.set(t, vm);
                }
                // ★★ r13：程序**最前面**的常量（constLead）—— 去噪后不在任何时间块里，
                //   必须补进**每一帧**，否则导出再导入丢变量（见 kfParseProgramText 注释）。
                if (p.frontConst && p.frontConst.size && p.times.length) {
                    const _ts = p.times.filter(Number.isFinite).sort((a, b) => a - b);
                    for (const [n, v] of p.frontConst) {
                        if (!Number.isFinite(v)) continue;
                        if (isKeyframeInternalVar(n, blockId) || _kfIsNsInternal(n, blockId)) continue;
                        for (const t of _ts) {
                            if (!frames.has(t)) frames.set(t, new Map());
                            frames.get(t).set(n, v);
                        }
                    }
                }
                if (frames.size > 0) return { blockId, frames, viaUnified: true };
            }
        }
    } catch (e) { /* 统一解析失败 → 回退旧格式 */ }

    // ---- ② 旧格式回退（v1 裸 start_/T_ 或纯 v.<var>=<val> 直赋值导出）----
    const frames = new Map();
    // 兼容多种条件格式：
    //   旧格式：v.<id>_time==<t>?(...)
    //   新格式：v.<id>_time>=<t>?(...) 或 v.<id>_time>=<t>&&v.<id>_time<<t>?(...) 或 v.<id>_time<<t>?(...)
    const framePattern = /v\.[A-Za-z0-9_][A-Za-z0-9_]*_time(==|>=|<)(\d+(?:\.\d+)?)(?:&&v\.[A-Za-z0-9_][A-Za-z0-9_]*_time<(\d+(?:\.\d+)?))?\?\s*\(([^)]+)\)/g;
    let fm;
    while ((fm = framePattern.exec(cmd)) !== null) {
        // 提取关键帧时间：==/>= 取其后的数值；< 表示首帧，时间为 0
        const frameTime = fm[1] === '<' ? 0 : parseFloat(fm[2]);
        const assignmentsStr = fm[4];
        const varMap = new Map();
        // 最新格式：v.start_<var>=<val>; → <var> 在此关键帧的值（start 是该帧的实际值）
        // ★ 同时认带命名空间的形式 v.<id>_start_<var>（v2 编译器产物）
        const sp = /v\.([A-Za-z0-9_]*?)start_([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;]+);/g;
        let sm, usedNew = false;
        while ((sm = sp.exec(assignmentsStr)) !== null) {
            // 前缀必须是「空 或 方块命名空间」；否则像 v.xxstart_x 这种用户变量会被误吃
            if (sm[1] && sm[1] !== blockId + '_') continue;
            varMap.set(sm[2], parseFloat(sm[3]) || 0);
            usedNew = true;
        }
        if (!usedNew) {
            // 上一代新格式：v.T<var>=<val>; → <var> 的目标值（当时 T 就是该帧的值）
            const tp = /v\.([A-Za-z0-9_]*?)T([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;]+);/g;
            let tm;
            while ((tm = tp.exec(assignmentsStr)) !== null) {
                if (tm[1] && tm[1] !== blockId + '_') continue;
                varMap.set(tm[2], parseFloat(tm[3]) || 0);
                usedNew = true;
            }
        }
        // 旧格式兜底：v.<var>=<val>;（跳过辅助变量：start_/seg_/dur_ 前缀、T 前缀、共享变量 seg_time/dur/t）
        if (!usedNew) {
            const ap = /v\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;]+);/g;
            let am;
            while ((am = ap.exec(assignmentsStr)) !== null) {
                const name = am[1];
                if (name === 'seg_time' || name === 'dur' || name === 't') continue;
                if (name.startsWith('start_') || name.startsWith('seg_') || name.startsWith('dur_') || name.startsWith('T')) continue;
                if (isKeyframeInternalVar(name, blockId) || _kfIsNsInternal(name, blockId)) continue;
                varMap.set(name, parseFloat(am[2]) || 0);
            }
        }
        if (varMap.size > 0) {
            frames.set(frameTime, varMap);
        }
    }

    return frames.size > 0 ? { blockId, frames } : null;
}

async function processKeyframeImport(text, defaultTime, overlay) {
    // 检查是否是完整的关键帧动画（包含'anim:xxx_anim'标识符）
    if (/['"]anim:/.test(text)) {
        // 支持同时导入多条命令：按 execute 分割
        const commands = text.split(/(?=execute\s+)/g).filter(c => c.trim());
        let anySuccess = false;
        let processedBlocks = [];
        
        for (const cmd of commands) {
            const parsed = parseSingleKeyframeCommand(cmd);
            if (!parsed) continue;
            
            const { blockId, frames } = parsed;
            
            // 检查方块是否存在
            const blockExists = blocks.some(b => b.id === blockId);
            if (!blockExists) {
                const createResult = await new Promise(resolve => {
                    showConfirmModal(`方块 "${blockId}" 不存在，是否创建？`, resolve);
                });
                if (!createResult) continue;
                const M = [0,0,0,0,0,0,1,1,0,0,0,0,0];
                const nb = new Block(blockId, M, null, '#aaccff', 'cube');
                nb.refresh();
                addBlock(nb);
            }
            
            // 检查是否已有关键帧
            if (keyframeData.has(blockId) && keyframeData.get(blockId).frames.size > 0) {
                const mergeResult = await new Promise(resolve => {
                    showConfirmModal(`方块 "${blockId}" 已有关键帧动画，是否删除现有动画？<br><small style="color:#94a3b8;">取消则合并关键帧</small>`, resolve);
                });
                if (mergeResult) {
                    keyframeData.get(blockId).frames.clear();
                }
            } else {
                initKeyframeForBlock(blockId);
            }
            
            // 写入帧数据
            const data = keyframeData.get(blockId);
            for (const [time, varMap] of frames) {
                data.frames.set(time, varMap);
            }
            
            processedBlocks.push(blockId);
            anySuccess = true;
            
            // 更新动画时长
            const times = getKeyframeTimes(blockId);
            if (times.length > 0) {
                keyframeAnimDuration = Math.max(keyframeAnimDuration, Math.ceil(times[times.length - 1]) + 2);
            }
        }
        
        if (!anySuccess) {
            showKfBubble('未能解析到有效的关键帧数据', { confirmText: '知道了' });
            overlay.remove();
            return;
        }
        
        renderKeyframeBlockSelector();
        
        // 选中第一个处理的方块
        if (processedBlocks.length > 0) {
            selectKeyframeBlock(processedBlocks[0]);
        }
        
        // 【Molang 模式同步】导入关键帧后为已在 Molang 模式的方块刷新程序
        refreshMolangProgramForBlocks(processedBlocks);
        kfAfterExternalDataChange(processedBlocks);   // ★ 编译式内核：导入后强制重建程序

        renderKeyframeTimeline();
        renderKeyframeDataPanel();
        renderSideBlockList();   // 新操作模式：时间表随导入刷新
        overlay.remove();
        return;
    }
    
    // 普通命令导入 - 提取 v.xxx=值; 和 方块编号
    const idMatch = text.match(/['"]方块编号：([^'"]+)['"]/);
    let blockId = idMatch ? idMatch[1] : null;
    
    // 提取赋值（等号两侧允许空白，兼容手写/常量化格式 `v.xpos = 0;`）
    const assignPattern = /v\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;]+);/g;
    let assignMatch;
    const frameData = new Map();
    
    while ((assignMatch = assignPattern.exec(text)) !== null) {
        const key = assignMatch[1];
        const val = parseFloat(assignMatch[2]) || 0;
        frameData.set(key, val);
    }
    
    if (frameData.size === 0) {
        showKfBubble('未能解析到有效的变量赋值', { confirmText: '知道了' });
        overlay.remove();
        return;
    }
    
    // 确定目标方块
    let targetId = blockId || selectedKeyframeBlock;
    if (!targetId) {
        showKfBubble('未指定方块编号，请先选中一个方块', { confirmText: '知道了' });
        overlay.remove();
        return;
    }
    
    // 检查是否存在
    const blockExists = blocks.some(b => b.id === targetId);
    if (!blockExists) {
        const createResult = await new Promise(resolve => {
            showConfirmModal(`方块 "${targetId}" 不存在，是否创建？`, resolve);
        });
        if (createResult) {
            const M = [0,0,0,0,0,0,1,1,0,0,0,0,0];
            const nb = new Block(targetId, M, null, '#aaccff', 'cube');
            for (const [key, val] of frameData) {
                const fullName = `v.${key}`;
                if (nb.scope.vars.has(fullName)) {
                    nb.scope.setVarExpr(fullName, val.toString());
                } else {
                    nb.scope.addVar(fullName, val.toString(), -100, 100, 0.01);
                }
            }
            nb.refresh();
            addBlock(nb);
        } else {
            overlay.remove();
            return;
        }
    }
    
    initKeyframeForBlock(targetId);
    const data = keyframeData.get(targetId);
    if (!data.frames.has(defaultTime)) {
        data.frames.set(defaultTime, new Map());
    }
    
    for (const [key, val] of frameData) {
        data.frames.get(defaultTime).set(key, val);
    }
    
    addKeyframeBlockTag(targetId);
    selectKeyframeBlock(targetId);
    
    // 更新动画时长
    const times = getKeyframeTimes(targetId);
    if (times.length > 0) {
        keyframeAnimDuration = Math.max(keyframeAnimDuration, Math.ceil(times[times.length - 1]) + 2);
    }
    
    // 【Molang 模式同步】普通命令导入关键帧后刷新 Molang 程序
    refreshMolangProgramForBlock(targetId);
    kfAfterExternalDataChange([targetId]);   // ★ 编译式内核：导入后强制重建程序

    renderKeyframeTimeline();
    renderKeyframeDataPanel();
    renderSideBlockList();   // 新操作模式：时间表随导入刷新
    overlay.remove();
}

