/* 03-blocks/08-value-bubble-and-events.js · 源 测试版v.6b79.html 第 14905-16105 行 */
'use strict';
// ========== 批量修改面板：molang 风格数字微调泡泡（复用 .molang-num-bubble 样式） ==========
// ★ 与 molang 数字泡泡的区别：这里的泡泡是「锚定行」而非「自由拖动」。
//   它有唯一的变量行，位置由锚点实时推导 ⇒ 面板滚动 / 窗口尺寸变化时必须跟随重排；
//   锚点滚出可视区或整行被移除（取消多选、切换选中）时自动关闭。
let batchBubbleEl = null;
let batchBubbleDocBound = false;
let batchBubbleCtx = null;          // { varName, anchorEl, value, step, onChange }
let batchBubbleTrackBound = false;
function hideBatchBubble() {
    if (batchBubbleEl) { batchBubbleEl.remove(); batchBubbleEl = null; }
    batchBubbleCtx = null;
}
// 锚点是否还在其滚动容器的可视范围内（滚出即视为不可见 → 关闭泡泡）
function batchAnchorVisible(el) {
    if (!el || !el.isConnected) return false;
    // getClientRects 为空 = 祖先 display:none（面板被关闭）→ 视为不可见
    if (el.getClientRects().length === 0) return false;
    const er = el.getBoundingClientRect();
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|overlay)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) {
            const pr = p.getBoundingClientRect();
            return er.bottom > pr.top - 2 && er.top < pr.bottom + 2;
        }
        p = p.parentElement;
    }
    return er.bottom > 0 && er.top < window.innerHeight;
}
// 依据锚点行重排泡泡位置（滚动 / 缩放 / 值变化后调用）
function positionBatchBubble() {
    if (!batchBubbleEl || !batchBubbleCtx) return;
    const anchor = batchBubbleCtx.anchorEl;
    if (!batchAnchorVisible(anchor)) { hideBatchBubble(); return; }
    const el = batchBubbleEl;
    const r = anchor.getBoundingClientRect();
    const bw = el.offsetWidth || 224, bh = el.offsetHeight || 150;
    const left = Math.max(8, Math.min(window.innerWidth - bw - 8, r.left + r.width / 2 - bw / 2));
    let top = r.top - bh - 12;      // 优先显示在行上方
    let below = false;
    if (top < 8) { top = r.bottom + 12; below = true; }   // 上方放不下 → 放到下方
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.classList.toggle('mnb-below', below);              // 箭头方向跟着翻
}
function bindBatchBubbleTracking() {
    if (batchBubbleTrackBound) return;
    batchBubbleTrackBound = true;
    // capture:true ⇒ 面板内部滚动容器的滚动事件也能收到
    document.addEventListener('scroll', positionBatchBubble, true);
    window.addEventListener('resize', positionBatchBubble);
    window.addEventListener('scroll', positionBatchBubble, true);
}
function buildBatchValueBubble(ctx) {
    // ctx = { varName, anchorEl, value, step, onChange, label }
    batchBubbleCtx = ctx;
    bindBatchBubbleTracking();
    const el = document.createElement('div');
    el.className = 'molang-num-bubble';
    const blockCount = selectedBlocksSet.size;
    // ★【2026-10-14 设计修复】泡泡头原来恒写「增量 · 批量 N 个方块」，即使只选 1 个方块、
    //   且是在关键帧时间表里改**单帧数值**时也照抄批量面板文案 —— 语义误导（用户以为在改整批）。
    //   现在允许调用方给 label；关键帧路径明确标注「关键帧 · 当前帧」。
    const _label = ctx.label || (blockCount > 1 ? `增量 · 批量 ${blockCount} 个方块` : '增量');
    el.innerHTML = `
      <div class="mnb-head">
        <i class="mnb-diamond" aria-hidden="true"></i>
        <span class="mnb-var" title="${ctx.varName}">${ctx.varName}</span>
        <span class="mnb-block" title="${_label}">${_label}</span>
        <button class="mnb-ico mnb-close" data-act="close" title="关闭">✕</button>
      </div>
      <div class="mnb-body">
        <div class="mnb-stepper" title="增大 / 减小（按步长）">
          <span data-act="inc" title="增大">▲</span>
          <span data-act="dec" title="减小">▼</span>
        </div>
        <div class="mnb-val">${fmtLit(ctx.value)}</div>
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
      <div class="mnb-hint">▲/▼ 或滚轮/↑↓ 微调 · 手机可长按 ▲/▼ 连续增减或拖动数值 · 点外部关闭</div>`;
    document.body.appendChild(el);
    // ★ 必须先登记 batchBubbleEl，positionBatchBubble 才有对象可排（旧写法在函数返回后才赋值 ⇒ 首次定位空转）
    batchBubbleEl = el;
    fitMnbVal(el.querySelector('.mnb-val'));
    // 定位：交给 positionBatchBubble（锚定变量行，滚动时实时跟随）
    positionBatchBubble();
    // 步长输入 + 快捷按钮
    const stepInput = el.querySelector('.mnb-stepinput');
    const getStep = () => { let v = parseFloat(stepInput.value); if (!isFinite(v) || v <= 0) v = 1; return v; };
    const syncQuick = () => {
        const v = parseFloat(stepInput.value);
        const map = { q001: 0.01, q01: 0.1, q1: 1, q10: 10 };
        el.querySelectorAll('.mnb-q').forEach(x => x.classList.toggle('active', Math.abs(map[x.dataset.act] - v) < 1e-9));
    };
    el.querySelectorAll('.mnb-q').forEach(b => {
        b.addEventListener('click', () => { stepInput.value = { q001: 0.01, q01: 0.1, q1: 1, q10: 10 }[b.dataset.act]; syncQuick(); });
    });
    stepInput.addEventListener('input', syncQuick);
    syncQuick();
    // 应用变更
    let currentValue = ctx.value;
    const applyStep = (dir, silent) => {
        const step = getStep();
        currentValue = currentValue + dir * step;
        ctx.onChange(currentValue);
        const valEl = el.querySelector('.mnb-val');
        if (valEl) { valEl.textContent = fmtLit(currentValue); fitMnbVal(valEl); }
    };
    // 长按连续步进
    const bindStepperHold = (btn, dir) => {
        if (!btn) return;
        let holdTimer = null, accTimer = null, t0 = 0;
        const stop = () => { clearTimeout(holdTimer); clearTimeout(accTimer); holdTimer = null; accTimer = null; };
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { btn.setPointerCapture(e.pointerId); } catch (_) {}
            t0 = Date.now();
            applyStep(dir);
            holdTimer = setTimeout(() => {
                const tick = () => {
                    applyStep(dir, true);
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
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    bindStepperHold(el.querySelector('[data-act="inc"]'), +1);
    bindStepperHold(el.querySelector('[data-act="dec"]'), -1);
    /* ★★【2026-10-14 设计修复】数值格 title 一直承诺「直接输入=设定」，但泡泡里**没有**可输入
       数值的文本框 —— 键盘敲数字无效，只能一格一格点（实测：敲 5 后数值仍为 0）。
       这里把「直接输入」真的做出来：点数值本身 → 变成输入框，回车/失焦提交为**设定值**。
       语义与 title 一致：▲/▼/滚轮/拖动 = 增量；直接输入数字 = 设定（abs）。 */
    const valEl0 = el.querySelector('.mnb-val');
    if (valEl0) {
        valEl0.title = '点击直接输入设定值 · 或上下拖动微调';
        valEl0.addEventListener('click', (e) => {
            if (valEl0.querySelector('input')) return;
            e.stopPropagation();
            const inp = document.createElement('input');
            inp.type = 'number'; inp.step = 'any';
            inp.value = String(fmtLit(currentValue));
            inp.className = 'mnb-valinput';
            inp.style.cssText = 'width:100%;background:transparent;border:1px solid rgba(59,130,246,.6);border-radius:4px;color:inherit;font:inherit;text-align:center;outline:none;';
            valEl0.textContent = '';
            valEl0.appendChild(inp);
            inp.focus(); inp.select();
            let done = false;
            const commit = (ok) => {
                if (done) return; done = true;
                const v = Number(inp.value);
                valEl0.textContent = fmtLit(currentValue);
                if (ok && Number.isFinite(v)) {
                    currentValue = v;
                    ctx.onChange(currentValue, 'abs');   // ★ 设定值（非增量）
                    valEl0.textContent = fmtLit(currentValue);
                }
                fitMnbVal(valEl0);
            };
            inp.addEventListener('keydown', (ev) => {
                ev.stopPropagation();
                if (ev.key === 'Enter') { commit(true); }
                else if (ev.key === 'Escape') { commit(false); }
            });
            inp.addEventListener('blur', () => commit(true));
            inp.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        });
    }
    // 数值区上下拖动连续增减
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
            while (accum <= -sens) { applyStep(-1, true); accum += sens; }
        });
        const endDrag = (e) => { dragging = false; try { valDragEl.releasePointerCapture(e.pointerId); } catch (_) {} };
        valDragEl.addEventListener('pointerup', endDrag);
        valDragEl.addEventListener('pointercancel', endDrag);
        valDragEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    // 关闭 / 滚轮 / 阻止冒泡
    el.querySelector('[data-act="close"]').addEventListener('click', hideBatchBubble);
    el.addEventListener('mousedown', (e) => { e.stopPropagation(); });
    el.addEventListener('wheel', (e) => { e.preventDefault(); applyStep(e.deltaY < 0 ? +1 : -1); }, { passive: false });
    // 点击外部关闭
    if (!batchBubbleDocBound) {
        batchBubbleDocBound = true;
        document.addEventListener('mousedown', (e) => { if (batchBubbleEl && !batchBubbleEl.contains(e.target)) hideBatchBubble(); });
    }
    return el;
}
function showBatchValueBubble(varName, anchorEl, value, step, onChange, label) {
    hideBatchBubble();
    batchBubbleEl = buildBatchValueBubble({ varName, anchorEl, value, step, onChange, label });
}

function mnbKeyStep(block, token, dir) {
    mnbWriteValue(block, token, token.value + dir * 1);
}
function setupMolangNumberBubble(block) {
    const ta = document.getElementById('molangTextarea');
    if (!ta) return;
    // 单击数字常量 → 弹泡泡；单击非数字位置 → 关闭
    ta.addEventListener('click', (e) => {
        if (ta.selectionStart !== ta.selectionEnd) return; // 有选区（拖动高亮）时不弹
        const tok = findNumberAt(ta.value, ta.selectionStart);
        if (tok) mnbShow(block, tok, e.clientX, e.clientY);
        else mnbHide();
    });
    // 泡泡开启时，方向键微调（已被全局守卫拦截、不会误移摄像机）
    ta.addEventListener('keydown', (e) => {
        if (!mnbState) return;
        const t = mnbState.token;
        if (e.key === 'ArrowUp') { e.preventDefault(); mnbKeyStep(block, t, +1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); mnbKeyStep(block, t, -1); }
        else if (e.key === 'Escape') { mnbHide(); }
    });
    ta.addEventListener('scroll', mnbHide);
    // 全局：点击泡泡外部（且不是文本框）时关闭瞬时泡泡（常显泡泡不受影响）
    if (!mnbDocBound) {
        mnbDocBound = true;
        document.addEventListener('mousedown', (e) => {
            if (mnbEl && !mnbEl.contains(e.target) && e.target !== document.getElementById('molangTextarea')) mnbHide();
        });
    }
}


function renderVariablesForBlock(block) {
    mnbHide();   // 重建/切换/关闭变量面板时关闭瞬时泡泡（修复"失焦后仍残留"）
    hideBatchBubble();   // 取消多选 / 切换选中 / 面板重建 → 增量泡泡必须一起消失（它对锚定行强依赖）
    const cont = document.getElementById('varsContainer'), newC = document.getElementById('newVarContainer');
    if (selectedBlocksSet.size > 1) { cont.innerHTML = `<div class="variables-left" style="width:100%;">${renderBatchPanel()}</div><div class="variables-right" style="display:none;"></div>`; newC.innerHTML = ''; attachBatchEvents(); return; }
    // 离开批量修改面板时清理临时的 batchDeltas，已应用的变更保持不变
    if (batchDeltas && batchDeltas.size > 0) batchDeltas.clear();
    if (!block) { 
        if (isBrushMode) {
            cont.innerHTML = `<div class="brush-thickness-panel" style="padding:16px; text-align:center;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-weight:bold;">画笔粗细(米)</span>
                    <span id="brushThicknessLabelPopup" style="font-family:monospace;">${brushThickness.toFixed(1)}</span>
                </div>
                <input id="brushThicknessRangePopup" type="range" min="0.1" max="5" step="0.1" value="${brushThickness}" style="width:100%;">
                <div style="margin-top:8px; font-size:12px; color:#64748b;">点击平面选中，再点击顶点绘制</div>
            </div>`;
            newC.innerHTML = '';
            const range = document.getElementById('brushThicknessRangePopup');
            const label = document.getElementById('brushThicknessLabelPopup');
            if (range) {
                range.addEventListener('input', (e) => {
                    brushThickness = parseFloat(e.target.value);
                    if (label) label.textContent = brushThickness.toFixed(1);
                    syncBrushThicknessUI();
                });
            }
            return;
        }
        cont.innerHTML = '<div class="empty-state">未选中任何方块<br>点击3D场景中的方块进行编辑</div>'; 
        newC.innerHTML = ''; 
        return; 
    }

    // molang 接管模式：变量区改为只读数值显示 + 高亮 molang 编辑器（不影响多选/未接管方块）
    const takeover = block.scope.molangMode || (block.scope.program && block.scope.program.trim());
    if (takeover) {
        cont.innerHTML = renderMolangEditor(block);
        newC.innerHTML = '';
        attachMolangEditorEvents(block);
        return;
    }

    const vars = block.getVarList();
    const localGrouped = {位移:[],缩放:[],旋转:[],自定义:[]};
    const core = {位移:['v.xpos','v.ypos','v.zpos','v.xbasepos','v.ybasepos','v.zbasepos'],缩放:['v.scale','v.extend_scale','v.extend_xrot','v.extend_yrot'],旋转:['v.xrot','v.yrot','v.zrot','v.rotatex','v.rotatey','v.rotatez']};
    vars.forEach(v => { let placed=false; for(let g in core) if(core[g].includes(v.name)) { localGrouped[g].push(v); placed=true; break; } if(!placed) localGrouped.自定义.push(v); });

    const customItems = localGrouped.自定义.map(v => ({name: v.name, def: v}));
    const customGroups = groupByPrefix(customItems, 'v.');

    let globalHtml = '';
    if (globalVars.size) {
        const globalItems = Array.from(globalVars.entries()).map(([k,g]) => ({name: `t.${k}`, def: g.def, source: g.sourceBlockId}));
        const globalGrouped = groupByPrefix(globalItems, 't.');
        let inner = '';
        globalGrouped.standalone.forEach(({name, def, source}) => {
            inner += renderGlobalVarCard(name, def, source);
        });
        globalGrouped.groups.forEach(g => {
            const gid = `global_${g.prefix}`, open = expandedVars.has(gid);
            inner += `<div class="var-group" data-group="${gid}"><div class="group-header" data-group-toggle="${gid}"><span class="group-title">📁 t.${g.prefix}_ (${g.vars.length})</span><span class="group-toggle">${open?'▼':'▶'}</span></div><div class="group-content" data-group-content="${gid}" style="${open?'display:block':'display:none'}">`;
            g.vars.forEach(({name, def, source}) => inner += renderGlobalVarCard(name, def, source));
            inner += `</div></div>`;
        });
        globalHtml = `<div class="var-group" data-group="global_top"><div class="group-header" data-group-toggle="global_top"><span class="group-title">🌎 全局变量 (${globalVars.size})</span><span class="group-toggle">${expandedVars.has('global_top')?'▼':'▶'}</span></div><div class="group-content" data-group-content="global_top" style="${expandedVars.has('global_top')?'display:block':'display:none'}">${inner}</div></div>`;
    }

    let rightHtml = '';
    ['位移','缩放','旋转'].forEach(g => {
        if (!localGrouped[g].length) return;
        const open = currentOpenGroup === g;
        rightHtml += `<div class="var-group" data-group="${g}"><div class="group-header" data-group-toggle="${g}"><span class="group-title">📁 ${g}</span><span class="group-toggle">${open?'▼':'▶'}</span></div><div class="group-content" data-group-content="${g}" style="${open?'display:block':'display:none'}">`;
        localGrouped[g].forEach(v => { rightHtml += renderVarCard(v, block.id); });
        rightHtml += `</div></div>`;
    });

    let customHtml = '';
    if (customGroups.standalone.length || customGroups.groups.length) {
        // 左列「自定义变量」用独立状态，避免被右列（位移/缩放/旋转）的展开态覆盖
        const customOpen = currentLeftGroup === '自定义';
        customHtml += `<div class="var-group" data-group="自定义"><div class="group-header" data-group-toggle="自定义"><span class="group-title">📁 自定义变量</span><span class="group-toggle">${customOpen?'▼':'▶'}</span></div><div class="group-content" data-group-content="自定义" style="${customOpen?'display:block':'display:none'}">`;
        customGroups.standalone.forEach(({name, def}) => { customHtml += renderVarCard(def, block.id); });
        customGroups.groups.forEach(g => {
            const gid = `custom_${g.prefix}`, open = expandedVars.has(gid);
            customHtml += `<div class="var-group" data-group="${gid}"><div class="group-header" data-group-toggle="${gid}"><span class="group-title">📁 v.${g.prefix}_ (${g.vars.length})</span><span class="group-toggle">${open?'▼':'▶'}</span></div><div class="group-content" data-group-content="${gid}" style="${open?'display:block':'display:none'}">`;
            g.vars.forEach(({name, def}) => { customHtml += renderVarCard(def, block.id); });
            customHtml += `</div></div>`;
        });
        customHtml += `</div></div>`;
    }
    let leftHtml = globalHtml + customHtml;
    if (!leftHtml) leftHtml = '<div class="empty-state">暂无全局/自定义变量</div>';

    // 旧版操作模式 + 面板横向宽度不足时：直接合并为单列（手机端样式），不使用两列布局
    const isOldModeNarrow = !document.body.classList.contains('new-layout-active') &&
        document.querySelector('.data-panel.side-panel')?.dataset.narrow === 'true';
    if (isOldModeNarrow) {
        cont.innerHTML = `<div class="variables-left" style="border-right:none !important;padding-right:0 !important;width:100% !important;">${leftHtml}${rightHtml}</div>`;
    } else {
        cont.innerHTML = `<div class="variables-left">${leftHtml}</div><div class="variables-right">${rightHtml}</div>`;
    }
    newC.innerHTML = `<div class="new-var-row"><input type="text" class="new-var-input" id="newVarInput" placeholder="v.变量 = 值 / t.变量 = 值 (回车)"></div>`;
    attachVariableEvents(block);
    document.querySelectorAll('.group-header').forEach(h => {
        h.removeEventListener('click', groupClick); h.addEventListener('click', groupClick);
    });
    function groupClick(e) {
    const gn = this.dataset.groupToggle;
    const cnt = document.querySelector(`.group-content[data-group-content="${gn}"]`);
    if (!cnt) return;
    const isOpen = cnt.style.display !== 'none';

    // 被点击分组的父级（用于嵌套子分组时，避免把父分组也一起折叠）
    const parent = this.closest('.group-content')?.closest('.var-group');
    const parentGroupName = parent ? parent.dataset.group : null;

    // 双列布局下左右列各自成组：互斥只在「被点击分组所在的那一列」内生效。
    // 单列模式（旧模式窄面板）所有内容都在 .variables-left 内，此时等同于全局互斥，行为不变。
    let scopeRoot = document;
    if (this.closest('.variables-left')) scopeRoot = this.closest('.variables-left');
    else if (this.closest('.variables-right')) scopeRoot = this.closest('.variables-right');

    if (isOpen) {
        cnt.style.display = 'none';
        this.querySelector('.group-toggle').textContent = '▶';
        if (currentOpenGroup === gn) currentOpenGroup = null;
        if (currentLeftGroup === gn) currentLeftGroup = null;
        expandedVars.delete(gn);
    } else {
        // 关闭同一列内的其他一级分组（位移、缩放、旋转、自定义变量 以及 全局变量顶级组），
        // 但**跳过被点击子分组的父级**——否则展开子分组（如 t.xx_）会把整个父分组（全局变量）折叠，
        // 表现为「子折叠影响到父折叠 / 整个全局变量被折叠」。
        const allTopGroups = scopeRoot.querySelectorAll('.var-group[data-group="位移"], .var-group[data-group="缩放"], .var-group[data-group="旋转"], .var-group[data-group="自定义"], .var-group[data-group="global_top"]');
        allTopGroups.forEach(g => {
            if (g.dataset.group === parentGroupName) return; // 保留父级不被折叠
            const content = g.querySelector('.group-content');
            if (content && content !== cnt) {
                content.style.display = 'none';
                g.querySelector('.group-toggle').textContent = '▶';
                // 同步清理状态，否则重绘时这些分组又会自己展开（此前只改了 DOM 没改状态）
                const gn2 = g.dataset.group;
                if (currentOpenGroup === gn2) currentOpenGroup = null;
                if (currentLeftGroup === gn2) currentLeftGroup = null;
                expandedVars.delete(gn2);
            }
        });

        // 对于多级分组（如 custom_xxx, global_xxx），关闭它们的兄弟组（与父级保护一致）
        if (parent) {
            const siblings = document.querySelectorAll(`.var-group[data-group="${parentGroupName}"] > .group-content > .var-group`);
            siblings.forEach(g => {
                const c = g.querySelector('.group-content');
                if (c && c !== cnt) {
                    c.style.display = 'none';
                    g.querySelector('.group-toggle').textContent = '▶';
                }
            });
        }

        cnt.style.display = 'block';
        this.querySelector('.group-toggle').textContent = '▼';
        // 按所在列分别记录当前打开的一级分组（右列 / 左列各自独立）
        if (['位移','缩放','旋转'].includes(gn)) currentOpenGroup = gn;
        else if (gn === '自定义') currentLeftGroup = gn;
        expandedVars.add(gn);
    }
}

function renderGlobalVarCard(name, def, source) {
    const isConst = isConstantExpr(def.expr), cls = isConst?'constant':'non-constant', inpCls = isConst?'constant-input':'non-constant-input', exp = expandedVars.has(name);
    return `<div class="var-card global ${cls}" data-var="${name}"><div class="var-header" data-toggle="${name}"><input class="assignment-input ${inpCls}" data-var="${name}" value="${escapeHtml(`${name} = ${def.expr}`)}"><span class="var-expand">${exp?'▲':'▼'}</span></div>
        <div class="var-details" data-details="${name}" style="${exp?'display:block':'display:none'}">` + renderVarDetails(name, def, source) + `</div></div>`;
}



// ========== 事件绑定 ==========
function attachVariableEvents(block) {
    document.querySelectorAll('.var-card .var-header').forEach(h => { h.removeEventListener('click', toggleDetail); h.addEventListener('click', toggleDetail); });
    function toggleDetail(e) {
        // 如果点击的是输入框或按钮区域，不触发折叠
        if (e.target.classList.contains('assignment-input') || e.target.closest('.auto-inc-btns') || e.target.closest('.slider-container')) return;
        const vn = this.dataset.toggle;
        const det = document.querySelector(`.var-details[data-details="${vn}"]`);
        const exp = this.querySelector('.var-expand');
        if (!det) return;
        const isOpen = det.style.display === 'block';
        if (isOpen) {
            det.style.display = 'none';
            if (exp) exp.textContent = '▼';
            expandedVars.delete(vn);
        } else {
            // 找到当前卡片所属的父分组容器（.group-content）
            const parentGroupContent = this.closest('.group-content');
            if (parentGroupContent) {
                // 关闭该分组内所有其他已展开的变量卡片
                parentGroupContent.querySelectorAll('.var-details').forEach(d => d.style.display = 'none');
                parentGroupContent.querySelectorAll('.var-expand').forEach(e => e.textContent = '▼');
            }
            det.style.display = 'block';
            if (exp) exp.textContent = '▲';
            expandedVars.add(vn);
        }
    }}
    


    document.querySelectorAll('.assignment-input').forEach(inp => inp.addEventListener('change', e => {
        const vn = inp.dataset.var, parsed = parseAssignment(inp.value);
        if (parsed && parsed.name === vn) {
            if (vn.startsWith('t.')) { const g = globalVars.get(vn.slice(2)); if(g){ g.def.expr = parsed.expr; blocks.forEach(b=>b.refresh()); recordAction(); renderVariablesForBlock(selectedBlock); } }
            else { const card = inp.closest('.var-card'), bid = card?.dataset.blockId, tb = blocks.find(b=>b.id===bid); if(tb){ tb.scope.setVarExpr(vn, parsed.expr); tb.refresh(); recordAction(); updateGlobalVarsDependingOn(tb, vn); syncKeyframeFromBlock(tb); renderVariablesForBlock(selectedBlock); } }
        }
    }));

    document.querySelectorAll('.inc-up, .inc-down').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const vn = btn.dataset.var, delta = btn.dataset.dir==='up'?1:-1, isG = vn.startsWith('t.');
        if (isG) { const g = globalVars.get(vn.slice(2)); if(g && isConstantExpr(g.def.expr)) toggleAutoInc(btn, true, null, vn.slice(2), delta * g.def.step); }
        else { const card = btn.closest('.var-card'), bid = card?.dataset.blockId, tb = blocks.find(b=>b.id===bid); if(tb){ const d = tb.scope.vars.get(vn); if(d && isConstantExpr(d.expr)) { toggleAutoInc(btn, false, tb, vn, delta * d.step); setTimeout(() => syncKeyframeFromBlock(tb), 50); } } }
    }));

    document.querySelectorAll('.var-slider').forEach(s => s.addEventListener('input', e => {
        const vn = s.dataset.var, val = parseFloat(s.value), card = s.closest('.var-card'), inp = card?.querySelector('.assignment-input');
        if (vn.startsWith('t.')) { const g = globalVars.get(vn.slice(2)); if(g){ stopAutoInc(true, vn.slice(2),0,null); g.def.expr = val.toString(); g.def.value = val; blocks.forEach(b=>b.refresh()); if(inp) inp.value = `${vn} = ${val}`; recordAction(); } }
        else { const bid = card?.dataset.blockId, tb = blocks.find(b=>b.id===bid); if(tb){ const d = tb.scope.vars.get(vn); if(d){ stopAutoInc(false, vn,0,null); d.expr = val.toString(); d.value = val; tb.refresh(); if(inp) inp.value = `${vn} = ${val}`; recordAction(); updateGlobalVarsDependingOn(tb, vn); syncKeyframeFromBlock(tb); } } }
    }));

    document.querySelectorAll('.range-min, .range-max, .range-step').forEach(inp => inp.addEventListener('change', e => {
        const vn = inp.dataset.var, isG = vn.startsWith('t.'); let newMin, newMax, newStep;
        if (inp.classList.contains('range-min')) newMin = parseFloat(inp.value);
        if (inp.classList.contains('range-max')) newMax = parseFloat(inp.value);
        if (inp.classList.contains('range-step')) newStep = parseFloat(inp.value);
        if (isG) {
            const g = globalVars.get(vn.slice(2)); if (!g) return;
            if (newStep !== undefined && g.def.step !== newStep) stopAutoInc(true, vn.slice(2), 0, null);
            if (newMin !== undefined) g.def.rangeMin = newMin;
            if (newMax !== undefined) g.def.rangeMax = newMax;
            if (newStep !== undefined) g.def.step = newStep;
            let cur = g.def.value;
            if (cur < g.def.rangeMin) { g.def.expr = g.def.rangeMin.toString(); g.def.value = g.def.rangeMin; }
            else if (cur > g.def.rangeMax) { g.def.expr = g.def.rangeMax.toString(); g.def.value = g.def.rangeMax; }
            blocks.forEach(b=>b.refresh()); recordAction(); renderVariablesForBlock(selectedBlock);
        } else {
            const card = inp.closest('.var-card'), bid = card?.dataset.blockId, tb = blocks.find(b=>b.id===bid); if(!tb) return;
            const d = tb.scope.vars.get(vn); if(!d) return;
            if (newStep !== undefined && d.step !== newStep) { stopAutoInc(false, vn, 1, tb.id); stopAutoInc(false, vn, -1, tb.id); }
            if (newMin !== undefined) d.rangeMin = newMin;
            if (newMax !== undefined) d.rangeMax = newMax;
            if (newStep !== undefined) d.step = newStep;
            let cur = d.value;
            if (cur < d.rangeMin) { d.expr = d.rangeMin.toString(); d.value = d.rangeMin; }
            else if (cur > d.rangeMax) { d.expr = d.rangeMax.toString(); d.value = d.rangeMax; }
            tb.refresh(); recordAction(); updateGlobalVarsDependingOn(tb, vn); syncKeyframeFromBlock(tb); renderVariablesForBlock(selectedBlock);
        }
    }));

    document.querySelectorAll('.delete-var').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const vn = btn.dataset.var, isG = vn.startsWith('t.');
        if (isG) {
            const key = vn.slice(2);
            showModal("确认删除", `确定删除全局变量 ${vn}?`, () => { stopAutoInc(true, key, 0, null); globalVars.delete(key); blocks.forEach(b=>b.refresh()); renderVariablesForBlock(selectedBlock); recordAction(); }, false);
        } else {
            const card = btn.closest('.var-card'), bid = card?.dataset.blockId, tb = blocks.find(b=>b.id===bid); if(!tb) return;
            const coreList = ['xpos','ypos','zpos','xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos','rotatex','rotatey','rotatez'];
            if (vn.startsWith('v.') && coreList.includes(vn.slice(2))) { showModal("禁止删除", "不能删除核心变换变量", null, false); return; }
            showModal("确认删除", `确定删除局部变量 ${vn}?`, () => { stopAutoInc(false, vn, 0, null); tb.scope.deleteVar(vn); tb.refresh(); renderVariablesForBlock(selectedBlock); recordAction(); updateGlobalVarsDependingOn(tb, vn); }, false);
        }
    }));

    const newInput = document.getElementById('newVarInput');
    if (newInput) {
        newInput.removeEventListener('keydown', newVarHandler);
        newInput.addEventListener('keydown', newVarHandler);
        function newVarHandler(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = newInput.value.trim(), parsed = parseAssignment(val);
                if (!parsed) { showModal("格式错误", "请使用: v.变量名 = 表达式 或 t.变量名 = 表达式", null, false); return; }
                const { name, expr } = parsed;
                if (name.startsWith('t.')) {
                    const varKey = name.slice(2);
                    if (globalVars.has(varKey)) { showModal("变量已存在", "全局变量已存在", null, false); return; }
                    const defaultRange = getDefaultRange(name);
                    globalVars.set(varKey, { def: new VarDef(expr, 0, defaultRange.min, defaultRange.max, 1), sourceBlockId: block.id });
                    blocks.forEach(b => b.refresh());
                    renderVariablesForBlock(block); recordAction(); newInput.value = '';
                } else {
                    if (block.scope.vars.has(name)) { showModal("变量已存在", "局部变量已存在", null, false); return; }
                    const defaultRange = getDefaultRange(name);
                    block.scope.addVar(name, expr, defaultRange.min, defaultRange.max, 1);
                    renderVariablesForBlock(block); recordAction(); newInput.value = '';
                }
            }
        }
    }

    document.querySelectorAll('.reset-btn').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const vn = btn.dataset.resetVar; if(!vn) return;
        if (vn.startsWith('t.')) resetVariable(vn, null);
        else { const card = btn.closest('.var-card'), bid = card?.dataset.blockId, tb = blocks.find(b=>b.id===bid); if(tb) resetVariable(vn, tb); }
    }));
}

// ========== 自增自减 ==========
function startAutoInc(blockId, isGlobal, varName, delta, btn) {
    const key = isGlobal ? `global_${varName}_${delta}` : `${blockId}_${varName}_${delta}`;
    if (activeAutoIncMap.has(key)) return;
    const doInc = () => {
        if (!activeAutoIncMap.has(key)) return;
        if (isGlobal) {
            const g = globalVars.get(varName); if (!g) return;
            let nv = g.def.value + delta;
            if (nv > g.def.rangeMax) nv = g.def.rangeMin;
            else if (nv < g.def.rangeMin) nv = g.def.rangeMax;
            const step = g.def.step;
            const dec = (step.toString().includes('.') ? step.toString().split('.')[1].length : 0);
            nv = parseFloat(nv.toFixed(dec));
            g.def.expr = nv.toString(); g.def.value = nv; blocks.forEach(b=>b.refresh());
            const card = document.querySelector(`.var-card[data-var="t.${varName}"]`);
            if(card){ card.querySelector('.var-slider').value = nv; card.querySelector('.assignment-input').value = `t.${varName} = ${nv}`; }
            recordAction();
        } else {
            const tb = blocks.find(b=>b.id===blockId); if(!tb) return;
            const d = tb.scope.vars.get(varName); if(!d) return;
            let nv = d.value + delta;
            if (nv > d.rangeMax) nv = d.rangeMin;
            else if (nv < d.rangeMin) nv = d.rangeMax;
            const dec = (d.step.toString().includes('.') ? d.step.toString().split('.')[1].length : 0);
            nv = parseFloat(nv.toFixed(dec));
            d.expr = nv.toString(); d.value = nv; tb.refresh();
            const card = document.querySelector(`.var-card[data-var="${varName}"][data-block-id="${blockId}"]`);
            if(card){ card.querySelector('.var-slider').value = nv; card.querySelector('.assignment-input').value = `${varName} = ${nv}`; }
            recordAction(); updateGlobalVarsDependingOn(tb, varName); syncKeyframeFromBlock(tb);
        }
    };
    doInc(); const int = setInterval(doInc, 1); activeAutoIncMap.set(key, int); if(btn) btn.classList.add('active');
}
function stopAutoInc(isGlobal, varName, delta, blockId) {
    for (let [k,i] of activeAutoIncMap) if ((isGlobal && k.startsWith(`global_${varName}_`)) || (!isGlobal && blockId && k===`${blockId}_${varName}_${delta}`)) { clearInterval(i); activeAutoIncMap.delete(k); }
}
function toggleAutoInc(btn, isGlobal, tb, varName, delta) {
    const bid = tb?.id; const key = isGlobal ? `global_${varName}_${delta}` : `${bid}_${varName}_${delta}`;
    if (activeAutoIncMap.has(key)) { stopAutoInc(isGlobal, varName, delta, bid); btn.classList.remove('active'); return; }
    startAutoInc(bid, isGlobal, varName, delta, btn);
}
let _inGlobalUpdate = false;
function updateGlobalVarsDependingOn(block, localVarName) {
    let changed = false;
    for (let [n, g] of globalVars) if (g.sourceBlockId === block.id) {
        const sb = blocks.find(b=>b.id===g.sourceBlockId); if(!sb) continue;
        let nv = isConstantExpr(g.def.expr) ? parseFloat(g.def.expr) : evaluateExpression(g.def.expr, sb.scope.vars, globalVars, sb.scope.blockId);
        if (Math.abs(nv - g.def.value) > 1e-8) { g.def.value = nv; changed = true; }
    }
    // 防止全局变量刷新引发的无界级联：本次调用内只允许触发一次全量 refresh 传播，
    // 避免“父变→刷新所有→子再触发父变→再刷新所有”的死循环（多骨骼时曾卡死）。
    if (changed && !_inGlobalUpdate) {
        _inGlobalUpdate = true;
        try { blocks.forEach(b=>b.refresh()); } finally { _inGlobalUpdate = false; }
    }
}

function updateDropdownSelection() {
    if (!activeDropdown) return;
    const items = activeDropdown.querySelectorAll('.block-dropdown-content > .block-dropdown-item');
    items.forEach(item => {
        const copyBtn = item.querySelector('.copy-block');
        if (!copyBtn) return;
        const blockId = copyBtn.dataset.id;
        const block = blocks.find(b => b.id === blockId);
        if (!block) return;
        const isSelected = selectedBlocksSet.has(block);
        item.classList.toggle('selected', isSelected);
        // Update the text span to show/hide checkmark
        const textSpan = item.querySelector('span:first-child');
        if (textSpan) {
            textSpan.textContent = `${block.id} ${isSelected ? '✓' : ''}`;
        }
    });
}

function toggleBlockSelection(block, multi) {
    if (!block) return;
    // ★ 隐藏 / 锁定的方块不可被选中；若已在选区内，仍允许取消选中（否则用户无法把它从选区里剔除）
    if ((isBlockHidden(block) || isBlockLocked(block)) && !selectedBlocksSet.has(block)) return;
    if (!multi) { 
        selectedBlocksSet.clear(); 
        selectedBlocksSet.add(block); 
        kfExplicitPickIds.clear(); kfExplicitPickIds.add(block.id);   // 单选：重置“显式点选”集合
        selectBlock(block); 
    } else { 
        /* ★【2026-10-18 修复「先单击选中它，再 Ctrl 选取，它就录不到帧」】
           旧实现：只要 block 在 selectedBlocksSet 里就删除 ⇒ 单选一个文件夹方块时选区被自动扩展成整组，
           之后再 Ctrl 点组内成员，该成员会被当成“取消选中”剔除（用户以为是在加选），录帧时缺帧。
           新实现：只有【用户亲手点选过】的方块才允许被剔除；由文件夹单位自动带进来的成员，
           Ctrl 点它视为加选/确认，保留在选区里。 */
        if (selectedBlocksSet.has(block) && kfExplicitPickIds.has(block.id)) { 
            selectedBlocksSet.delete(block); 
            kfExplicitPickIds.delete(block.id);
            if (selectedBlocksSet.size === 0) { 
                selectedBlocksSet.add(block); 
                selectBlock(block); 
            } else {
                selectBlock(Array.from(selectedBlocksSet)[0]); 
            }
        } else { 
            selectedBlocksSet.add(block); 
            kfExplicitPickIds.add(block.id);
            selectBlock(block); 
        } 
    }
    if (selectedBlocksSet.size > 1) { 
        batchDeltas.clear(); 
        ['v.xpos','v.ypos','v.zpos','v.xbasepos','v.ybasepos','v.zbasepos','v.scale','v.extend_scale','v.extend_xrot','v.extend_yrot','v.xrot','v.yrot','v.zrot','v.rotatex','v.rotatey','v.rotatez'].forEach(v=>batchDeltas.set(v,0)); 
    }
    updateAxesVisibility(); 
    renderVariablesForBlock(selectedBlock); 
    blocks.forEach(b=>b.updateSelectionHighlight(selectedBlocksSet.has(b)));
    updateDropdownSelection();
    if (isNewLayoutMode) renderSideBlockList();
    /* 选区变了 ⇒ 时间轴轨道名必须立刻同步（见 scheduleKfTrackTimelineSync 的注释）。
       本函数内两条分支都会调 selectBlock（选区真相源的收口），故同步统一挂在 selectBlock 末尾。 */
}

// ========== 方块列表下拉菜单 ==========
let activeDropdown = null, scrollListener = null;
function updateDropdownPosition(btn) {
    if (!activeDropdown || !btn) return;
    const rect = btn.getBoundingClientRect();
    activeDropdown.style.left = rect.left + 'px';
    activeDropdown.style.top = (rect.bottom + 5) + 'px';
    if (parseInt(activeDropdown.style.left) + activeDropdown.offsetWidth > window.innerWidth) activeDropdown.style.left = (window.innerWidth - activeDropdown.offsetWidth - 10) + 'px';
}
function showBlockDropdown(btn) {
    if (activeDropdown) { activeDropdown.remove(); activeDropdown = null; }
    if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; }
    const menu = document.createElement('div'); menu.className = 'block-dropdown';
    // header + collapsible content
    const header = document.createElement('div'); header.className = 'block-dropdown-header';
    header.innerHTML = ``;
    const content = document.createElement('div'); content.className = 'block-dropdown-content';
    menu.appendChild(header);

    if (blocks.length === 0) {
        content.innerHTML = '<div class="block-dropdown-item">暂无方块</div>';
    } else {
        // ----- 关键帧动画入口（★【2026-10-20 用户要求】旧操作模式只做播放/停止，不弹悬浮窗）-----
        const _kfPlayingNow = (typeof keyframePlaying !== 'undefined') && keyframePlaying;
        const kfItem = document.createElement('div');
        kfItem.className = 'block-dropdown-item';
        kfItem.style.borderBottom = '1px solid rgba(59,130,246,0.3)';
        kfItem.style.marginBottom = '4px';
        kfItem.style.paddingBottom = '8px';
        kfItem.innerHTML = `<span style="color:#facc15;">${_kfPlayingNow ? '⏸ 停止播放' : '▶ 播放动画'}</span>`;
        // ★★【2026-10-14 设计修复】原实现**只绑了 dblclick**，单击被 stopPropagation 吞掉
        //   （无提示 / 无 toast / 下拉还开着）。同一菜单里其它条目（欧拉角转换等）都是单击，
        //   用户没有任何理由去双击 ⇒ 普遍反馈「点关键帧动画没反应 / 找不到入口」。
        //   改为单击即进入（双击仍保留，兼容已习惯双击的老用户）。
        const _kfEnter = () => {
            menu.remove();
            activeDropdown = null;
            if (scrollListener) {
                window.removeEventListener('scroll', scrollListener);
                document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                scrollListener = null;
            }
            // ★【2026-10-20】旧操作模式：入口即播放开关（不再弹悬浮窗）
            let _hasAnim = false;
            try { _hasAnim = getPlaybackBlocks().length > 0; } catch (err) { _hasAnim = keyframeData.size > 0; }
            if (!keyframePlaying && !_hasAnim) { showToast('当前还没有关键帧动画可播放'); return; }
            toggleKeyframePlayback();
            renderSideBlockList();
        };
        kfItem.addEventListener('click', (e) => {
            e.stopPropagation();
            _kfEnter();
        });
        kfItem.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            _kfEnter();
        });
        content.appendChild(kfItem);

        // ----- 欧拉角转换入口-----
        const eulerItem = document.createElement('div');
        eulerItem.className = 'block-dropdown-item';
        eulerItem.style.borderBottom = '1px solid rgba(59,130,246,0.3)';
        eulerItem.style.marginBottom = '4px';
        eulerItem.style.paddingBottom = '8px';
        eulerItem.innerHTML = `<span style="color:#60a5fa;">🔄 欧拉角转换</span>`;
        eulerItem.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.remove();
            activeDropdown = null;
            if (scrollListener) {
                window.removeEventListener('scroll', scrollListener);
                document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                scrollListener = null;
            }
            showEulerAngleConfirmDialog();
        });
        content.appendChild(eulerItem);

        // ----- 全选按钮-----
        const allItem = document.createElement('div');
        allItem.className = 'block-dropdown-item';
        allItem.innerHTML = `<span>--- ALL ---</span>`;
        allItem.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedBlocksSet.clear();
            blocks.forEach(b => selectedBlocksSet.add(b));
            selectedFolder = null; // 全选方块时退出文件夹选中态
            if (selectedBlock) {
                if (selectedBlock.axisHelper) selectedBlock.axisHelper.visible = false;
                selectedBlock = null;
            }
            updateAxesVisibility();
            renderVariablesForBlock(null);
            blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
            menu.remove();
            activeDropdown = null;
            if (scrollListener) {
                window.removeEventListener('scroll', scrollListener);
                document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                scrollListener = null;
            }
        });
        content.appendChild(allItem);

        // 分隔线
        const divider = document.createElement('div');
        divider.className = 'divider';
        content.appendChild(divider);

        // 获取全局组数据
        const globalBlockGroups = window.folders || [];
        
        // 关键帧模式状态：新操作模式下的关键帧模式，或旧操作模式下打开了关键帧编辑窗口
        const isKfMode = (isNewLayoutMode && isKeyframeMode) || (!isNewLayoutMode && keyframeWindowOpen);
        const kfReady = _kfSystemReady;
        
        // 按组分组方块
        const groupedBlocks = {};
        const ungroupedBlocks = [];
        blocks.forEach(b => {
            if (b.group && globalBlockGroups.find(g => g.name === b.group)) {
                if (!groupedBlocks[b.group]) groupedBlocks[b.group] = [];
                groupedBlocks[b.group].push(b);
            } else {
                ungroupedBlocks.push(b);
            }
        });
        
        // 显示所有组（包括空组）
        globalBlockGroups.forEach(group => {
            const groupName = group.name;
            const groupBlocks = groupedBlocks[groupName] || [];
            const isExpanded = group.expanded !== false;
            const getSelectableGroupBlocks = () => {
                if (isKfMode) return groupBlocks.filter(b => hasKeyframeAnimation(b.id));
                return groupBlocks;
            };
            
            const groupHeader = document.createElement('div');
            groupHeader.className = 'block-dropdown-item';
            groupHeader.style.fontWeight = 'bold';
            groupHeader.style.color = '#60a5fa';
            groupHeader.style.cursor = 'pointer';
            groupHeader.style.display = 'flex';
            groupHeader.style.justifyContent = 'space-between';
            groupHeader.style.alignItems = 'center';
            const groupHidden = !!group.hidden;
            const chevronRot = isExpanded ? 90 : 0;
            groupHeader.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="transform:rotate(${chevronRot}deg);transition:transform .15s;color:#94a3b8;"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#7dd3fc"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                ${groupName}
            </span><div style="display:flex; gap:4px;">
                <button class="action-para" style="background:rgba(16,185,129,0.3);border:none;color:white;font-size:11px;padding:2px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;" data-group-eye="${groupName}" title="${groupHidden ? '显示组内模型' : '隐藏组内模型'}">${getGroupEyeIcon(groupHidden)}</button>
                <button class="action-para" style="background:rgba(59,130,246,0.3);border:none;color:white;font-size:11px;padding:2px 6px;border-radius:4px;cursor:pointer;" data-group-manage="${groupName}" title="管理">管理</button>
                <button class="action-para" style="background:rgba(244,63,94,0.3);border:none;color:white;font-size:11px;padding:2px 6px;border-radius:4px;cursor:pointer;" data-group-delete="${groupName}" title="删除">×</button>
            </div>`;
            
            // 组标题点击事件（折叠/展开）
            let longPressTimer = null;
            let isLongPress = false;
            
            groupHeader.addEventListener('click', (e) => {
                if (touchMoved) {
                    touchMoved = false;
                    return;
                }
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                if (isLongPress) {
                    isLongPress = false;
                    return;
                }
                
                const isMulti = e.ctrlKey || e.metaKey;
                if (isMulti) {
                    e.preventDefault();
                    const selectable = getSelectableGroupBlocks();
                    selectable.forEach(b => {
                        selectedBlocksSet.add(b);
                    });
                    updateAxesVisibility();
                    blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
                    menu.remove();
                    activeDropdown = null;
                    if (scrollListener) {
                        window.removeEventListener('scroll', scrollListener);
                        document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                        scrollListener = null;
                    }
                    if (selectable.length > 0) {
                        selectBlock(selectable[0]);
                    }
                    return;
                }
                
                group.expanded = !group.expanded;
                menu.remove();
                activeDropdown = null;
                if (scrollListener) {
                    window.removeEventListener('scroll', scrollListener);
                    document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                    scrollListener = null;
                }
                showBlockDropdown(btn);
            });
            
            groupHeader.addEventListener('mousedown', () => {
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    const selectable = getSelectableGroupBlocks();
                    selectable.forEach(b => {
                        selectedBlocksSet.add(b);
                    });
                    updateAxesVisibility();
                    blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
                    menu.remove();
                    activeDropdown = null;
                    if (scrollListener) {
                        window.removeEventListener('scroll', scrollListener);
                        document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                        scrollListener = null;
                    }
                    if (selectable.length > 0) {
                        selectBlock(selectable[0]);
                    }
                }, 500);
            });
            
            groupHeader.addEventListener('mouseup', () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            
            groupHeader.addEventListener('mouseleave', () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            
            let touchMoved = false;
            groupHeader.addEventListener('touchstart', () => {
                touchMoved = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    const selectable = getSelectableGroupBlocks();
                    selectable.forEach(b => {
                        selectedBlocksSet.add(b);
                    });
                    updateAxesVisibility();
                    blocks.forEach(b => b.updateSelectionHighlight(selectedBlocksSet.has(b)));
                    menu.remove();
                    activeDropdown = null;
                    if (scrollListener) {
                        window.removeEventListener('scroll', scrollListener);
                        document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                        scrollListener = null;
                    }
                    if (selectable.length > 0) {
                        selectBlock(selectable[0]);
                    }
                }, 500);
            });
            
            groupHeader.addEventListener('touchend', () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            
            groupHeader.addEventListener('touchmove', () => {
                touchMoved = true;
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });
            
            // 眼睛按钮事件（切换组隐藏/显示）
            const eyeBtn = groupHeader.querySelector('[data-group-eye]');
            eyeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const g = folders.find(g2 => g2.name === groupName);
                if (g) {
                    g.hidden = !g.hidden;
                    bumpVisibilityRev();
                    updateGroupVisibility(groupName);
                    eyeBtn.innerHTML = getGroupEyeIcon(g.hidden);
                    eyeBtn.title = g.hidden ? '显示组内模型' : '隐藏组内模型';
                }
            });

            // 管理按钮事件
            const manageBtn = groupHeader.querySelector('[data-group-manage]');
            manageBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showGroupManageModal(groupName);
                menu.remove();
                activeDropdown = null;
                if (scrollListener) {
                    window.removeEventListener('scroll', scrollListener);
                    document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                    scrollListener = null;
                }
            });
            
            // 删除按钮事件
            const deleteBtn = groupHeader.querySelector('[data-group-delete]');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirmModal(`确定要删除文件夹 "${groupName}" 及其所有子文件夹吗？<br><small style="color:#94a3b8;">内部方块将一并删除（连同整个模型）。</small>`, (confirmed) => {
                    if (confirmed) {
                        removeFolder(groupName);
                        menu.remove();
                        activeDropdown = null;
                        if (scrollListener) {
                            window.removeEventListener('scroll', scrollListener);
                            document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                            scrollListener = null;
                        }
                    }
                });
            });
            
            // 右键编辑组名（电脑端）
            groupHeader.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                editGroupName(groupName);
                menu.remove();
                activeDropdown = null;
                if (scrollListener) {
                    window.removeEventListener('scroll', scrollListener);
                    document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                    scrollListener = null;
                }
            });
            
            content.appendChild(groupHeader);
            
            // 组内容容器
            if (isExpanded) {
                if (groupBlocks.length === 0) {
                    const emptyItem = document.createElement('div');
                    emptyItem.className = 'block-dropdown-item';
                    emptyItem.style.paddingLeft = '20px';
                    emptyItem.style.color = '#64748b';
                    emptyItem.style.fontSize = '12px';
                    emptyItem.textContent = '暂无方块';
                    content.appendChild(emptyItem);
                } else {
                    groupBlocks.forEach((b, index) => {
                        // ★ Molang 编辑模式方块不显示紫色关键帧角标（它整体退出关键帧系统，不是关键帧方块）
        const isKfBlock = kfReady && !isMolangModeBlock(b) && keyframeData.has(b.id);
                        const isDisabled = (isKfMode && !isKfBlock) || (!isKfMode && isKfBlock);
                        
                        const item = document.createElement('div'); item.className = 'block-dropdown-item';
                        item.style.paddingLeft = '20px';
                        item.style.position = 'relative';
                        item.innerHTML += `<span style="position:absolute;left:12px;top:6px;bottom:6px;width:2px;background:#3b82f6;opacity:0.5;"></span>`;
                        
                        // 紫色小三角形标识动画方块
                        if (isKfBlock) {
                            item.innerHTML += `<span style="position:absolute;top:0;left:12px;width:0;height:0;border-left:8px solid #a855f7;border-bottom:8px solid transparent;"></span>`;
                        }
                        
                        if (selectedBlocksSet.has(b)) item.classList.add('selected');
                        if (isDisabled) {
                            item.style.opacity = '0.55';
                            item.style.cursor = 'not-allowed';
                        }
                        
                        item.innerHTML += `<span>${b.id} ${selectedBlocksSet.has(b) ? '✓' : ''}</span><div class="dropdown-actions"><button class="copy-block action-para" data-id="${b.id}"><span>📄 复制</span></button><button class="delete-block action-para" data-id="${b.id}"><span>🗑 删除</span></button><button class="bone-block action-para" data-id="${b.id}" style="background:#8b5cf6;"><span>✛</span></button></div>`;
                        const copyBtn = item.querySelector('.copy-block');
                        copyBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!tryBlockAction('copy:' + b.id)) return; duplicateBlock(b); menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; } });
                        copyBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); if (!tryBlockAction('copy:' + b.id)) return; duplicateBlock(b); menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; } });
                        const deleteBtn = item.querySelector('.delete-block');
                        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!tryBlockAction('del:' + b.id)) return; removeBlock(b); menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; } });
                        deleteBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); if (!tryBlockAction('del:' + b.id)) return; removeBlock(b); menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; } });
                        const boneBtn = item.querySelector('.bone-block');
                        if (boneBtn) {
                            const bindParent = (e) => {
                            e.stopPropagation();
                            // 多选骨绑定：若选中了多个方块且本次点击的块在其中，则一次性把整个选区绑到同一父级
                            const sel = [...selectedBlocksSet];
                            const useMulti = sel.length > 1 && sel.includes(b);
                            showBoneModeSelector(useMulti ? sel : [b]);
                            menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; }
                        };
                            boneBtn.addEventListener('click', bindParent);
                            boneBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); bindParent(e); });
                        }
                        item.addEventListener('click', (e) => {
                            if (e.target.tagName === 'BUTTON') return;
                            if (isDisabled) return;
                            const isMulti = kfIsMultiGesture(e);   // ★【2026-10-18】含「多选锁定」开关
                            toggleBlockSelection(b, isMulti);
                            menu.remove();
                            activeDropdown = null;
                            if (scrollListener) {
                                window.removeEventListener('scroll', scrollListener);
                                document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                                scrollListener = null;
                            }
                        });
                        item.addEventListener('contextmenu', (e) => {
                            e.preventDefault();
                            if (isDisabled) return;
                            toggleBlockSelection(b, true);
                            menu.remove();
                            activeDropdown = null;
                            if (scrollListener) {
                                window.removeEventListener('scroll', scrollListener);
                                document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                                scrollListener = null;
                            }
                        });
                        content.appendChild(item);
                        
                        // 在组内最后一个方块后面添加横线
                        if (index === groupBlocks.length - 1) {
                            const divider = document.createElement('div');
                            divider.style.height = '1px';
                            divider.style.background = 'rgba(59,130,246,0.3)';
                            divider.style.margin = '4px 8px';
                            content.appendChild(divider);
                        }
                    });
                }
            }
        });
        
        // 显示未分组的方块
        if (ungroupedBlocks.length > 0) {
            ungroupedBlocks.forEach(b => {
                // ★ Molang 编辑模式方块不显示紫色关键帧角标（它整体退出关键帧系统，不是关键帧方块）
        const isKfBlock = kfReady && !isMolangModeBlock(b) && keyframeData.has(b.id);
                const isDisabled = (isKfMode && !isKfBlock) || (!isKfMode && isKfBlock);
                
                const item = document.createElement('div'); item.className = 'block-dropdown-item';
                item.style.position = 'relative';
                
                if (selectedBlocksSet.has(b)) item.classList.add('selected');
                if (isDisabled) {
                    item.style.opacity = '0.55';
                    item.style.cursor = 'not-allowed';
                }
                
                // 紫色小三角形标识动画方块
                if (isKfBlock) {
                    item.innerHTML += `<span style="position:absolute;top:0;left:0;width:0;height:0;border-left:8px solid #a855f7;border-bottom:8px solid transparent;"></span>`;
                }
                
                item.innerHTML += `<span>${b.id} ${selectedBlocksSet.has(b) ? '✓' : ''}</span><div class="dropdown-actions"><button class="copy-block action-para" data-id="${b.id}"><span>📄 复制</span></button><button class="delete-block action-para" data-id="${b.id}"><span>🗑 删除</span></button><button class="bone-block action-para" data-id="${b.id}" style="background:#8b5cf6;"><span>✛</span></button></div>`;
                const copyBtn = item.querySelector('.copy-block');
                copyBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!tryBlockAction('copy:' + b.id)) return; duplicateBlock(b); menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; } });
                copyBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); if (!tryBlockAction('copy:' + b.id)) return; duplicateBlock(b); menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; } });
                const deleteBtn = item.querySelector('.delete-block');
                deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!tryBlockAction('del:' + b.id)) return; removeBlock(b); menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; } });
                deleteBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); if (!tryBlockAction('del:' + b.id)) return; removeBlock(b); menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; } });
                const boneBtn = item.querySelector('.bone-block');
                if (boneBtn) {
                    const bindParent = (e) => {
                        e.stopPropagation();
                        const sel = [...selectedBlocksSet];
                        const useMulti = sel.length > 1 && sel.includes(b);
                        showBoneModeSelector(useMulti ? sel : [b]);
                        menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; }
                    };
                    boneBtn.addEventListener('click', bindParent);
                    boneBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); bindParent(e); });
                }
                item.addEventListener('click', (e) => {
                    if (e.target.tagName === 'BUTTON') return;
                    if (isDisabled) return;
                    const isMulti = kfIsMultiGesture(e);   // ★【2026-10-18】含「多选锁定」开关
                    toggleBlockSelection(b, isMulti);
                    menu.remove();
                    activeDropdown = null;
                    if (scrollListener) {
                        window.removeEventListener('scroll', scrollListener);
                        document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                        scrollListener = null;
                    }
                });
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (isDisabled) return;
                    toggleBlockSelection(b, true);
                    menu.remove();
                    activeDropdown = null;
                    if (scrollListener) {
                        window.removeEventListener('scroll', scrollListener);
                        document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener);
                        scrollListener = null;
                    }
                });
                content.appendChild(item);
            });
        }
    }
    menu.appendChild(content);
    document.body.appendChild(menu); activeDropdown = menu;
    // header 本身不再包含折叠按钮；通过顶部按钮控制展示/隐藏
    const rect = btn.getBoundingClientRect();
    menu.style.left = rect.left + 'px'; menu.style.top = (rect.bottom + 5) + 'px';
    if (parseInt(menu.style.left) + menu.offsetWidth > window.innerWidth) menu.style.left = (window.innerWidth - menu.offsetWidth - 10) + 'px';
    const closeHandler = (e) => {
        // 如果点击在3D视图（canvas-container）内，不关闭方块列表
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer && canvasContainer.contains(e.target)) return;
        if (!menu.contains(e.target) && e.target !== btn) { if (menu.parentNode) menu.remove(); activeDropdown = null; if (scrollListener) { window.removeEventListener('scroll', scrollListener); document.querySelector('.panel-content')?.removeEventListener('scroll', scrollListener); scrollListener = null; } document.removeEventListener('click', closeHandler); }
    };
    setTimeout(() => { document.addEventListener('click', closeHandler); }, 10);
    scrollListener = () => updateDropdownPosition(btn);
    window.addEventListener('scroll', scrollListener);
    const panelContent = document.querySelector('.panel-content');
    if (panelContent) panelContent.addEventListener('scroll', scrollListener);
}
