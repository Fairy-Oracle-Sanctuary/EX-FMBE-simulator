/* 05-ui/05-ai.js · 源 测试版v.6b79.html 第 25939-28081 行 */
'use strict';
// ==================== AI 服务：添加与管理 ====================
// 目标：统一配置「云端 API」与「本地 AI」两种接入方式，供 AI 产出作品时调用。
// 存储：localStorage 单键 'ai_services'（JSON：{version, items:[...], activeId}）。
//   ★敏感信息：API Key 明文保存在本机 localStorage 里（浏览器同源隔离），界面默认脱敏显示
//     （type=password + 眼睛按钮临时揭示）。不把 Key 写进任何导出/项目存档/changelog。
//   ★架构铁律：Key 绝不能被写进前端产物供他人使用（加密包也能逆出）——本窗口只负责
//     「本机自己的配置」；真正调用模型应经服务端代理（见 AI 产出功能），本窗口仅提供
//     「连接测试」直连校验（面向本地 Ollama 与自建代理，或用户自担风险的云端直连）。
const AI_SVC_KEY = 'ai_services';
const AI_SVC_VERSION = 1;
// 云端 OpenAI 兼容默认值（用户可改）；本地 Ollama 默认值。
const AI_SVC_DEFAULTS = {
    cloud: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    local: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' }
};

// ★ 主流模型供应商预设：全部走 OpenAI 兼容协议（/chat/completions + /models），
//   一键回填 Base URL 与常用模型名，省去手抄地址。用户填完仍可随意改。
//   注意：这里只放「地址与模型名」这类公开信息，绝不含任何密钥。
//   ⚠ 模型名随时间变动（厂商常改名/退役），这里的 models 只是「上手引导」，
//     真正权威的列表以「连接测试」从 /models 拉回来的为准（拉回后会自动覆盖下拉）。
const AI_SVC_PRESETS = [
    { id: 'deepseek', label: 'DeepSeek', type: 'cloud', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-flash', 'deepseek-v4-pro'] },
    { id: 'openai', label: 'OpenAI', type: 'cloud', baseUrl: 'https://api.openai.com/v1', models: ['gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5', 'gpt-4o-mini'] },
    { id: 'qwen', label: '通义千问', type: 'cloud', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen3.8-max', 'qwen3.7-max', 'qwen3.7-plus', 'qwen-plus', 'qwen3.7-flash'] },
    { id: 'moonshot', label: 'Kimi', type: 'cloud', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.8-preview', 'kimi-k2.6'] },
    { id: 'zhipu', label: '智谱 GLM', type: 'cloud', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-5.3', 'glm-5.3-flash', 'glm-5.2', 'glm-4.7-flash'] },
    { id: 'doubao', label: '豆包（火山方舟）', type: 'cloud', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: ['doubao-seed-2.1-pro', 'doubao-seed-2.1-turbo', 'doubao-seed-2.0-pro'] },
    { id: 'qianfan', label: '百度文心', type: 'cloud', baseUrl: 'https://qianfan.baidubce.com/v2', models: ['ernie-5.1', 'ernie-4.5-turbo'] },
    { id: 'hunyuan', label: '腾讯混元', type: 'cloud', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', models: ['hunyuan-turbo-s'] },
    { id: 'minimax', label: 'MiniMax', type: 'cloud', baseUrl: 'https://api.minimax.chat/v1', models: ['MiniMax-M3', 'abab6.5s-chat'] },
    { id: 'siliconflow', label: '硅基流动', type: 'cloud', baseUrl: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-235B-A22B-Instruct-2507', 'Qwen/Qwen2.5-72B-Instruct'] },
    { id: 'openrouter', label: 'OpenRouter', type: 'cloud', baseUrl: 'https://openrouter.ai/api/v1', models: ['openai/gpt-5.6-terra', 'anthropic/claude-sonnet-5', 'anthropic/claude-opus-5', 'google/gemini-3.6-flash', 'deepseek/deepseek-v4-pro', 'x-ai/grok-4.5'] },
    { id: 'ollama', label: '本地 Ollama', type: 'local', baseUrl: 'http://127.0.0.1:11434/v1', models: ['qwen3:8b', 'llama3.1:8b', 'deepseek-r1:7b'] },
    { id: 'lmstudio', label: '本地 LM Studio', type: 'local', baseUrl: 'http://127.0.0.1:1234/v1', models: ['local-model'] },
    { id: 'vllm', label: '本地 vLLM / 自建', type: 'local', baseUrl: 'http://127.0.0.1:8000/v1', models: [''] }
];

let aiServices = [];         // [{id, name, type:'cloud'|'local', baseUrl, apiKey, model, models:[]}]
let aiActiveServiceId = null; // 当前使用的服务 id
let aiEditingId = null;       // 表单正在编辑的条目 id（null = 新增态）
let aiAdding = false;         // 是否处于「新增表单」态（空列表时点「+ 新增」也要能出表单）
let aiFormType = 'cloud';     // 表单当前类型（动态显隐字段用）
let aiFormKeyVisible = false; // Key 是否处于「揭示」状态
let aiTestBusy = false;
let aiModelCache = { cloud: [], local: [] };  // 新增态下「连接测试」拉到的模型（条目未保存时暂存于此）

function aiGenId() { return 'ai' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function aiSvcLoad() {
    let raw = null;
    try { raw = localStorage.getItem(AI_SVC_KEY); } catch (e) { raw = null; }
    if (!raw) { aiServices = []; aiActiveServiceId = null; return; }
    try {
        const d = JSON.parse(raw);
        const items = Array.isArray(d.items) ? d.items : [];
        aiServices = items.filter(it => it && typeof it === 'object' && it.id).map(it => ({
            id: String(it.id),
            name: String(it.name || '未命名服务'),
            type: it.type === 'local' ? 'local' : 'cloud',
            baseUrl: String(it.baseUrl || ''),
            apiKey: String(it.apiKey || ''),
            model: String(it.model || ''),
            models: Array.isArray(it.models) ? it.models.map(String) : []
        }));
        aiActiveServiceId = d.activeId ? String(d.activeId) : null;
        // 活动服务必须真实存在，否则回退到第一条
        if (!aiServices.some(s => s.id === aiActiveServiceId)) {
            aiActiveServiceId = aiServices.length ? aiServices[0].id : null;
        }
    } catch (e) {
        console.warn('[AI 服务] 配置解析失败，已按空列表处理：', e && e.message);
        aiServices = []; aiActiveServiceId = null;
    }
}

function aiSvcSave() {
    try {
        localStorage.setItem(AI_SVC_KEY, JSON.stringify({
            version: AI_SVC_VERSION, items: aiServices, activeId: aiActiveServiceId
        }));
        return true;
    } catch (e) {
        console.warn('[AI 服务] 保存失败：', e && e.message);
        return false;
    }
}

function aiActiveService() { return aiServices.find(s => s.id === aiActiveServiceId) || null; }

function aiMaskKey(k) {
    if (!k) return '';
    const s = String(k);
    if (s.length <= 8) return '\u2022'.repeat(Math.max(4, s.length));
    return s.slice(0, 4) + '\u2022\u2022\u2022\u2022\u2022\u2022' + s.slice(-4);
}

// 简易 HTML 转义（列表/提示里插入用户输入的 name/model 必须转义，避免破坏 DOM）
function aiEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function aiSvcRefreshSettingsEntry() {
    const el = document.getElementById('aiServiceSummary');
    if (!el) return;
    if (!aiServices.length) { el.textContent = '尚未配置任何 AI 服务'; return; }
    const act = aiActiveService();
    el.textContent = act
        ? `当前使用：${act.name}（${act.type === 'local' ? '本地' : '云端'} · ${act.model || '未指定模型'}）`
        : `已配置 ${aiServices.length} 个服务，未选择当前服务`;
}

// ---------- 窗口骨架 ----------
let aiSvcPanelEl = null;
function ensureAiSvcPanel() {
    if (aiSvcPanelEl) return aiSvcPanelEl;
    const div = document.createElement('div');
    div.className = 'ai-svc-panel';
    div.id = 'aiServicePanel';
    div.style.display = 'none';
    div.innerHTML = `
        <div class="ai-svc-head"><span>AI 服务</span><span class="ui-settings-close" id="aiSvcCloseBtn" title="关闭">\u2715</span></div>
        <div class="ai-svc-root">
            <div class="ai-svc-side">
                <div class="ai-svc-side-head"><span>服务列表</span><button class="prj-btn prj-btn-plain" id="aiSvcAddBtn" type="button" title="新增服务"><span class="prj-face">+ 新增</span></button></div>
                <div class="ai-svc-list" id="aiSvcList"></div>
            </div>
            <div class="ai-svc-main" id="aiSvcMain"></div>
        </div>
        <div class="ai-svc-foot">
            <div class="ai-svc-foot-info" id="aiSvcFootInfo"></div>
            <button class="prj-btn" id="aiSvcDoneBtn" type="button"><span class="prj-face">完成</span></button>
        </div>`;
    document.body.appendChild(div);
    aiSvcPanelEl = div;
    div.querySelector('#aiSvcCloseBtn').addEventListener('click', () => aiSvcClose());
    div.querySelector('#aiSvcDoneBtn').addEventListener('click', () => aiSvcClose());
    div.querySelector('#aiSvcAddBtn').addEventListener('click', () => aiSvcBeginAdd());
    // 点遮罩空白（面板外）不关闭：本窗口是管理型窗口，允许点击其他区域，避免误触丢失编辑
    return div;
}

function aiSvcOpen() {
    if (typeof devMode !== 'undefined' && !devMode) {
        if (typeof showToast === 'function') showToast('AI 服务在开发者模式下才可用（设置 → 🛠 开发者工具）', { duration: 2800 });
        return;
    }
    aiSvcLoad();
    ensureAiSvcPanel();
    aiEditingId = null;
    aiAdding = false;
    aiSvcPanelEl.style.display = 'flex';
    aiSvcRenderAll();
}
function aiSvcClose() {
    if (!aiSvcPanelEl) return;
    aiSvcPanelEl.style.display = 'none';
    aiSvcRefreshSettingsEntry();
}
window.aiSvcOpen = aiSvcOpen;
window.aiSvcClose = aiSvcClose;

function aiSvcRenderAll() {
    aiSvcRenderList(); aiSvcRenderMain(); aiSvcRenderFoot();
    // 服务列表/默认项变化后，顺手同步对话窗口的「当前模型」标题与提示
    try { if (aiChatPanelEl) aiChatUpdateHeader(); } catch (e) {}
}

function aiSvcRenderFoot() {
    const el = aiSvcPanelEl && aiSvcPanelEl.querySelector('#aiSvcFootInfo');
    if (!el) return;
    if (!aiServices.length) { el.textContent = ''; return; }
    const act = aiActiveService();
    el.textContent = act ? `当前使用：${act.name}` : `已配置 ${aiServices.length} 个服务，尚未设为默认`;
}

function aiSvcRenderList() {
    const list = aiSvcPanelEl.querySelector('#aiSvcList');
    if (!aiServices.length) {
        list.innerHTML = `<div class="ai-svc-empty">
            <div class="ai-svc-empty-title">还没有任何 AI 服务</div>
            <div class="ai-svc-empty-desc">点左上方「+ 新增」添加第一个服务。<br>云端填 OpenAI 兼容地址与密钥；本地填 Ollama 地址（一般无需密钥）。</div>
        </div>`;
        return;
    }
    list.innerHTML = aiServices.map(s => {
        const isAct = s.id === aiActiveServiceId;
        const isEdit = s.id === aiEditingId;
        const badgeDef = isAct ? '<span class="ai-svc-badge def">默认</span>' : '';
        const badgeType = `<span class="ai-svc-badge ${s.type}">${s.type === 'local' ? '本地' : '云端'}</span>`;
        return `<div class="ai-svc-item${isAct ? ' is-active' : ''}" data-id="${aiEsc(s.id)}"${isEdit ? ' style="border-color:#3b82f6"' : ''}>
            <div class="ai-svc-item-top">
                <span class="ai-svc-item-name" title="${aiEsc(s.name)}">${aiEsc(s.name)}</span>
                ${badgeType}${badgeDef}
            </div>
            <div class="ai-svc-item-sub" title="${aiEsc(s.model || '')}">${aiEsc(s.model || '未指定模型')}</div>
        </div>`;
    }).join('');
    list.querySelectorAll('.ai-svc-item').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.getAttribute('data-id');
            aiEditingId = id;
            aiAdding = false;
            const s = aiServices.find(x => x.id === id);
            if (s) aiFormType = s.type;
            aiFormKeyVisible = false;
            aiSvcRenderAll();
        });
    });
}

function aiSvcBeginAdd() {
    aiEditingId = null;
    aiAdding = true;
    aiFormType = 'cloud';
    aiFormKeyVisible = false;
    aiSvcRenderAll();
}

// 取表单当前值（供渲染回填）
function aiSvcFormValues() {
    if (aiEditingId) {
        const s = aiServices.find(x => x.id === aiEditingId);
        if (s) return s;
    }
    return null;
}

function aiSvcRenderMain() {
    const main = aiSvcPanelEl.querySelector('#aiSvcMain');
    const cur = aiSvcFormValues();
    const isEdit = !!cur;
    if (!aiEditingId && !aiAdding && !aiServices.length) {
        main.innerHTML = `<div class="ai-svc-placeholder">
            <div class="ai-svc-placeholder-title">添加一个 AI 服务开始使用</div>
            <div class="ai-svc-placeholder-desc">左侧「+ 新增」即可填写。已内置 DeepSeek / OpenAI / 通义千问 / Kimi / 智谱 / 豆包 / OpenRouter / 本地 Ollama 等预设，选一个就能自动填好地址与模型名；云端服务再填 API Key 即可。</div>
        </div>`;
        return;
    }
    const v = cur || { name: '', type: aiFormType, baseUrl: AI_SVC_DEFAULTS[aiFormType].baseUrl, apiKey: '', model: AI_SVC_DEFAULTS[aiFormType].model, models: [] };
    const t = v.type || aiFormType;
    const isLocal = t === 'local';
    // 揭示态：已保存条目在未编辑时把明文从内存取回显示（密钥本就存本机，揭示即展示真实值）
    const revealedKey = aiFormKeyVisible ? String((cur && cur.apiKey) || v.apiKey || '') : '';
    const keyVal = aiEsc(revealedKey);
    // 「可用模型」下拉：优先用该条目已拉取的列表；新增态也可从同类型其他条目借用一份，避免漏斗形空下拉
    const modelList = (v.models && v.models.length) ? v.models
        : ((aiModelCache[t] && aiModelCache[t].length) ? aiModelCache[t]
            : (aiServices.find(s => s.type === t && s.models && s.models.length) || {}).models || []);
    const isDefault = isEdit && cur.id === aiActiveServiceId;

    main.innerHTML = `
    <div class="ai-svc-form">
        <div class="ai-svc-field">
            <label>显示名称</label>
            <input type="text" id="aiFName" placeholder="例如：我的 GPT-4o / 本地 Qwen" value="${aiEsc(v.name || '')}">
        </div>
        <div class="ai-svc-field">
            <label>类型</label>
            <div class="ai-svc-typewrap">
                <button type="button" class="ai-svc-typebtn${t === 'cloud' ? ' on' : ''}" data-type="cloud">云端 API</button>
                <button type="button" class="ai-svc-typebtn${t === 'local' ? ' on' : ''}" data-type="local">本地 AI</button>
            </div>
            <div class="ai-svc-hint">本地服务指运行在本机的 Ollama / LM Studio 等，一般无需 API Key。</div>
        </div>
        <div class="ai-svc-field">
            <label>快速预设</label>
            <select id="aiFPreset">
                <option value="">— 选择供应商一键回填（也可手填）—</option>
                ${['cloud', 'local'].map(tp => {
                    const list = AI_SVC_PRESETS.filter(p => p.type === tp);
                    if (!list.length) return '';
                    return `<optgroup label="${tp === 'cloud' ? '云端 API' : '本地 AI'}">` +
                        list.map(p => `<option value="${p.id}">${aiEsc(p.label)}</option>`).join('') + '</optgroup>';
                }).join('')}
            </select>
            <div class="ai-svc-hint">选一个即可自动填好类型、地址与常用模型名；密钥仍需自己填（本地服务可留空）。</div>
        </div>
        <div class="ai-svc-field">
            <label>接入地址（Base URL）</label>
            <input type="text" id="aiFBase" placeholder="${isLocal ? 'http://127.0.0.1:11434/v1' : 'https://api.openai.com/v1'}" value="${aiEsc(v.baseUrl || '')}">
            <div class="ai-svc-hint">OpenAI 兼容地址，通常以 <code>/v1</code> 结尾。</div>
        </div>
        <div class="ai-svc-field" id="aiFKeyField"${isLocal ? ' style="display:none"' : ''}>
            <label>API Key</label>
            <div class="ai-svc-keywrap">
                <input type="${aiFormKeyVisible ? 'text' : 'password'}" id="aiFKey" placeholder="${isLocal ? '本地服务通常留空' : 'sk-...'}" value="${keyVal}" autocomplete="off" spellcheck="false">
                <button type="button" class="ai-svc-eye" id="aiFEye" title="${aiFormKeyVisible ? '隐藏密钥' : '显示密钥'}">${aiFormKeyVisible
                    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.4 5.4A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7a12 12 0 0 1-2.2 3.4"/><path d="M6.2 6.2A12.3 12.3 0 0 0 3 12c0 2.5 4 7 9 7a9.6 9.6 0 0 0 3.6-.7"/></svg>'
                    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'}</button>
            </div>
            <div class="ai-svc-hint">${isEdit && cur.apiKey ? `已保存：${aiEsc(aiMaskKey(cur.apiKey))}` : '密钥仅保存在本机浏览器，界面默认脱敏显示。'}</div>
        </div>
        <div class="ai-svc-row">
            <div class="ai-svc-field">
                <label>模型名称</label>
                <input type="text" id="aiFModel" placeholder="${isLocal ? 'qwen2.5:7b' : 'gpt-4o-mini'}" value="${aiEsc(v.model || '')}">
            </div>
            <div class="ai-svc-field">
                <label>可用模型</label>
                <select id="aiFModelPick">
                    <option value="">— 点「连接测试 / 拉取模型」—</option>
                    ${(modelList || []).map(m => `<option value="${aiEsc(m)}"${m === v.model ? ' selected' : ''}>${aiEsc(m)}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="ai-svc-hint">「可用模型」下拉里的名字只是**上手引导**（各家模型名常变）；点「连接测试」会从服务实时拉取并**覆盖**为最新列表。也可直接在左侧手填任意模型名。</div>
        <div class="ai-svc-sep"></div>
        <div class="ai-svc-actions">
            <button class="prj-btn" id="aiFTestBtn" type="button"><span class="prj-face">连接测试 / 拉取模型</span></button>
            <button class="prj-btn prj-btn-primary" id="aiFSaveBtn" type="button"><span class="prj-face">${isEdit ? '保存修改' : '添加服务'}</span></button>
            ${isEdit ? `<button class="prj-btn" id="aiFDefaultBtn" type="button"><span class="prj-face">${isDefault ? '已是默认' : '设为默认'}</span></button>` : ''}
            <span class="ai-svc-actions-spacer"></span>
            ${isEdit ? `<button class="prj-btn prj-btn-danger" id="aiFDelBtn" type="button"><span class="prj-face">删除</span></button>` : ''}
        </div>
        <div class="ai-svc-status" id="aiFStatus"></div>
    </div>`;

    aiSvcBindForm(isEdit ? cur : null, t);
}

function aiSvcBindForm(cur, t) {
    const main = aiSvcPanelEl.querySelector('#aiSvcMain');
    const q = s => main.querySelector(s);

    // 类型切换：动态显隐 Key 字段 + 回填默认地址/模型（仅在字段为空或等于另一类型默认值时回填，避免覆盖用户输入）
    main.querySelectorAll('.ai-svc-typebtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const nt = btn.getAttribute('data-type');
            if (nt === aiFormType) return;
            const baseEl = q('#aiFBase'), modelEl = q('#aiFModel');
            const oldDef = AI_SVC_DEFAULTS[aiFormType];
            if (baseEl && (!baseEl.value.trim() || baseEl.value.trim() === oldDef.baseUrl)) baseEl.value = AI_SVC_DEFAULTS[nt].baseUrl;
            if (modelEl && (!modelEl.value.trim() || modelEl.value.trim() === oldDef.model)) modelEl.value = AI_SVC_DEFAULTS[nt].model;
            aiFormType = nt;
            // 重渲染（会重建表单）——先暂存当前输入，避免用户已填内容丢失
            const snapshot = aiSvcSnapshotForm();
            aiSvcRenderMainThenRestore(snapshot);
        });
    });

    const eye = q('#aiFEye');
    if (eye) eye.addEventListener('click', () => {
        // 眼睛切换：先快照当前输入（避免丢失未保存内容）。
        // ⚠ key 字段：隐藏态下 input.value 为空，若把空值也回填会清掉「已保存密钥」的明文展示；
        //   因此只保留用户新键入的值（非空才回填），空值交给渲染层从 cur.apiKey 取。
        const snapshot = aiSvcSnapshotForm();
        if (snapshot && !snapshot.apiKey) snapshot.apiKey = undefined;
        aiFormKeyVisible = !aiFormKeyVisible;
        aiSvcRenderMainThenRestore(snapshot);
    });

    const picker = q('#aiFModelPick');
    if (picker) picker.addEventListener('change', () => {
        const m = q('#aiFModel');
        if (m && picker.value) m.value = picker.value;
    });

    // 快速预设：选中后一键回填「类型 + 接入地址 + 模型候选」，并同步当前模型名
    const presetSel = q('#aiFPreset');
    if (presetSel) presetSel.addEventListener('change', () => {
        const p = AI_SVC_PRESETS.find(x => x.id === presetSel.value);
        if (!p) return;
        aiFormType = p.type;
        const baseEl = q('#aiFBase'), modelEl = q('#aiFModel'), nameEl = q('#aiFName');
        if (baseEl) baseEl.value = p.baseUrl;
        if (modelEl && p.models && p.models.length) modelEl.value = p.models[0];
        if (nameEl && !nameEl.value.trim()) nameEl.value = p.label;
        // 候选模型直接进内存缓存 + 下拉，用户无需先做连接测试也能选
        aiModelCache[p.type] = (p.models || []).filter(Boolean);
        // 预设可能是另一种类型（云↔本地）⇒ Key 字段显隐要跟着变，整体重渲染并回填输入
        const snapshot = aiSvcSnapshotForm();
        aiSvcRenderMainThenRestore(snapshot);
        aiSvcSetStatus(`已套用「${p.label}」预设，填好 API Key 后即可保存`, 'ok');
    });

    const testBtn = q('#aiFTestBtn');
    if (testBtn) testBtn.addEventListener('click', () => aiSvcRunTest());
    const saveBtn = q('#aiFSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => aiSvcSaveForm());
    const delBtn = q('#aiFDelBtn');
    if (delBtn) delBtn.addEventListener('click', () => aiSvcDelete(cur));
    const defBtn = q('#aiFDefaultBtn');
    if (defBtn) defBtn.addEventListener('click', () => {
        if (!cur) return;
        aiActiveServiceId = cur.id;
        aiSvcSave();
        aiSvcRenderAll();
        aiSvcSetStatus('已设为默认服务', 'ok');
    });
}

// 表单快照（类型/眼睛切换重渲染时保留用户未保存输入）
function aiSvcSnapshotForm() {
    const main = aiSvcPanelEl && aiSvcPanelEl.querySelector('#aiSvcMain');
    if (!main) return null;
    const q = s => main.querySelector(s);
    const g = s => { const e = q(s); return e ? e.value : undefined; };
    return { name: g('#aiFName'), baseUrl: g('#aiFBase'), apiKey: g('#aiFKey'), model: g('#aiFModel'), type: aiFormType };
}
function aiSvcRenderMainThenRestore(snap) {
    aiSvcRenderMain();
    if (!snap) return;
    const main = aiSvcPanelEl.querySelector('#aiSvcMain');
    const q = s => main.querySelector(s);
    const set = (s, val) => { const e = q(s); if (e && val !== undefined && val !== null) e.value = val; };
    // 类型切到本地时 Key 字段可能不存在，跳过即可
    set('#aiFName', snap.name); set('#aiFBase', snap.baseUrl); set('#aiFModel', snap.model);
    const keyEl = q('#aiFKey');
    if (keyEl && snap.apiKey !== undefined) keyEl.value = snap.apiKey;
}

function aiSvcSetStatus(msg, kind) {
    const el = aiSvcPanelEl && aiSvcPanelEl.querySelector('#aiFStatus');
    if (!el) return;
    el.className = 'ai-svc-status' + (kind ? ' ' + kind : '');
    el.textContent = msg || '';
}
function aiSvcGetStatus() {
    const el = aiSvcPanelEl && aiSvcPanelEl.querySelector('#aiFStatus');
    return el ? { cls: el.className, text: el.textContent } : null;
}

function aiSvcSaveForm() {
    const main = aiSvcPanelEl.querySelector('#aiSvcMain');
    const q = s => main.querySelector(s);
    const g = s => { const e = q(s); return e ? e.value.trim() : ''; };
    const name = g('#aiFName');
    const baseUrl = g('#aiFBase');
    const model = g('#aiFModel');
    const keyEl = q('#aiFKey');
    // Key 可能处于脱敏隐藏态：若字段不存在（本地类型）或值为空且原条目已有 Key，则沿用原 Key
    let apiKey = keyEl ? keyEl.value.trim() : '';
    const cur = aiSvcFormValues();
    if (!apiKey && cur && cur.apiKey) apiKey = cur.apiKey;

    // 校验（缺失给出可理解的提示）
    if (!name) { aiSvcSetStatus('请填写「显示名称」', 'err'); return; }
    if (!baseUrl) { aiSvcSetStatus('请填写「接入地址（Base URL）」', 'err'); return; }
    if (!/^https?:\/\//i.test(baseUrl)) { aiSvcSetStatus('接入地址需以 http:// 或 https:// 开头', 'err'); return; }
    if (aiFormType === 'cloud' && !apiKey) { aiSvcSetStatus('云端服务需要填写 API Key', 'err'); return; }
    if (!model) { aiSvcSetStatus('请填写「模型名称」', 'err'); return; }

    if (cur) {
        cur.name = name; cur.type = aiFormType; cur.baseUrl = baseUrl; cur.apiKey = apiKey; cur.model = model;
        if (!Array.isArray(cur.models)) cur.models = [];
    } else {
        const s = { id: aiGenId(), name, type: aiFormType, baseUrl, apiKey, model, models: [] };
        aiServices.push(s);
        aiEditingId = s.id;
        if (!aiActiveServiceId) aiActiveServiceId = s.id;   // 第一个服务自动设为默认
    }
    if (aiSvcSave()) {
        aiFormKeyVisible = false;
        aiAdding = false;
        aiSvcRenderAll();
        aiSvcSetStatus(cur ? '已保存修改' : '已添加服务', 'ok');
    } else {
        aiSvcSetStatus('保存失败：浏览器本地存储不可用（可能处于隐私模式）', 'err');
    }
}

function aiSvcDelete(cur) {
    if (!cur) return;
    const idx = aiServices.findIndex(s => s.id === cur.id);
    if (idx < 0) return;
    aiServices.splice(idx, 1);
    if (aiActiveServiceId === cur.id) aiActiveServiceId = aiServices.length ? aiServices[0].id : null;
    if (aiEditingId === cur.id) { aiEditingId = null; aiAdding = false; }
    aiSvcSave();
    aiSvcRenderAll();
    aiSvcSetStatus('已删除该服务', 'ok');
}

// ---------- 连接测试 ----------
// 说明：直连校验（GET /models 判定地址可达 + 密钥有效；顺带回填可用模型列表）。
//   ★云端服务在浏览器直连可能被 CORS 拦截 —— 这是浏览器安全策略，非配置错误，
//     故失败时给出可理解的区分提示（网络不可达 / 401 密钥无效 / CORS 被拦 / 超时）。
async function aiSvcRunTest() {
    if (aiTestBusy) return;
    const main = aiSvcPanelEl.querySelector('#aiSvcMain');
    const q = s => main.querySelector(s);
    const g = s => { const e = q(s); return e ? e.value.trim() : ''; };
    const baseUrl = g('#aiFBase');
    const keyEl = q('#aiFKey');
    const cur = aiSvcFormValues();
    let apiKey = keyEl ? keyEl.value.trim() : '';
    if (!apiKey && cur && cur.apiKey) apiKey = cur.apiKey;

    if (!baseUrl) { aiSvcSetStatus('请先填写接入地址再测试', 'err'); return; }
    if (!/^https?:\/\//i.test(baseUrl)) { aiSvcSetStatus('接入地址需以 http:// 或 https:// 开头', 'err'); return; }
    if (aiFormType === 'cloud' && !apiKey) { aiSvcSetStatus('云端服务需要 API Key 才能测试', 'err'); return; }

    aiTestBusy = true;
    const btn = q('#aiFTestBtn');
    if (btn) btn.setAttribute('disabled', 'disabled');
    aiSvcSetStatus('正在连接…', 'busy');

    const url = baseUrl.replace(/\/+$/, '') + '/models';
    const headers = {};
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    // 超时保护（12s）：直连被 CORS 静默拦截、或本地服务未启动时，fetch 可能长时间挂起
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) {} }, 12000);

    let result = null;
    try {
        const res = await fetch(url, { method: 'GET', headers, signal: ctrl ? ctrl.signal : undefined });
        clearTimeout(timer);
        if (res.ok) {
            let models = [];
            try {
                const data = await res.json();
                // 兼容多种 /models 返回形状：
                //   OpenAI/DeepSeek/通义/Moonshot → { data: [{id|name|model}] }
                //   Ollama 原生                    → { models: [{name|model}] }
                //   部分网关                       → 直接是数组
                let arr = [];
                if (Array.isArray(data)) arr = data;
                else if (data && Array.isArray(data.data)) arr = data.data;
                else if (data && Array.isArray(data.models)) arr = data.models;
                else if (data && Array.isArray(data.result)) arr = data.result;
                models = arr.map(x => {
                    if (x == null) return '';
                    if (typeof x === 'string') return x;
                    return (x.id || x.name || x.model || '') + '';
                }).filter(Boolean);
                // 去重 + 排序（同一模型可能被多个字段重复列出）
                models = Array.from(new Set(models)).sort();
            } catch (e) { /* 有些服务 /models 返回非 JSON，忽略 */ }
            result = { ok: true, models };
        } else if (res.status === 401 || res.status === 403) {
            result = { ok: false, kind: 'auth', detail: `HTTP ${res.status}` };
        } else if (res.status === 404) {
            // 地址可达但没有 /models 端点：视为「服务器在线，但接口路径可能不对」
            result = { ok: false, kind: 'notfound', detail: 'HTTP 404' };
        } else {
            result = { ok: false, kind: 'http', detail: `HTTP ${res.status}` };
        }
    } catch (e) {
        clearTimeout(timer);
        const msg = String((e && e.message) || e);
        if ((e && e.name) === 'AbortError') result = { ok: false, kind: 'timeout', detail: '12s 无响应' };
        else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) result = { ok: false, kind: aiFormType === 'local' ? 'refused' : 'cors', detail: msg };
        else result = { ok: false, kind: 'unknown', detail: msg };
    }

    aiTestBusy = false;
    const btn2 = aiSvcPanelEl.querySelector('#aiFTestBtn');
    if (btn2) btn2.removeAttribute('disabled');

    if (result.ok) {
        // 回填可用模型到下拉（保存态写回条目；新增态先缓存到内存的 _aiModelCache 供下拉即用）
        if (result.models && result.models.length) {
            const models = result.models.slice(0, 200);
            if (cur) { cur.models = models; aiSvcSave(); }
            else { aiModelCache[aiFormType] = models; }
            const picker = aiSvcPanelEl.querySelector('#aiFModelPick');
            if (picker) {
                const curModel = (cur ? cur.model : g('#aiFModel')) || '';
                picker.innerHTML = '<option value="">— 点「连接测试 / 拉取模型」—</option>' +
                    models.map(m => `<option value="${aiEsc(m)}"${m === curModel ? ' selected' : ''}>${aiEsc(m)}</option>`).join('');
            }
        }
        const n = (result.models || []).length;
        aiSvcSetStatus(`\u2713 连接成功${n ? `，发现 ${n} 个可用模型` : ''}（地址与密钥有效）`, 'ok');
    } else {
        let msg = '';
        switch (result.kind) {
            case 'auth': msg = `\u2717 连接失败：API Key 无效或无权限（${result.detail}）。请检查密钥是否正确、是否已过期。`; break;
            case 'cors': msg = '\u2717 连接失败：浏览器直连被 CORS 策略拦截（服务器不允许网页直接访问）。这不是密钥错误——云端服务请改由服务端代理调用；本地服务不会有此问题。'; break;
            case 'refused': msg = '\u2717 连接失败：无法连接到本地服务，请确认服务已启动、地址与端口正确（如 Ollama 默认 127.0.0.1:11434）。'; break;
            case 'timeout': msg = `\u2717 连接失败：请求超时（${result.detail}）。请检查地址是否可达、本地服务是否已启动。`; break;
            case 'notfound': msg = '\u2717 连接失败：地址可达但未找到 /models 接口（HTTP 404）。请确认 Base URL 是否正确（OpenAI 兼容地址通常以 /v1 结尾）。'; break;
            default: msg = `\u2717 连接失败：${result.detail || '未知错误'}。请检查地址与密钥。`; break;
        }
        aiSvcSetStatus(msg, 'err');
    }
}

// 设置面板入口按钮
(function bindAiServiceEntry() {
    const btn = document.getElementById('aiServiceManageBtn');
    if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); aiSvcOpen(); });
    aiSvcLoad();
    aiSvcRefreshSettingsEntry();
})();

// ==================== AI 对话窗口 ====================
// 与 AI 的对话框：可见 AI 的「操作」（工具调用 / 生成动作）与历史记录，并可切换模型。
// 历史持久化：localStorage 'ai_chat_history'（仅本机，最多保留 200 条，防膨胀）。
// 调用：走 aiSvcCallChat() —— 直连 OpenAI 兼容 /chat/completions（本地 Ollama 完全可用；
//   云端直连可能被 CORS 拦截，届时给出可理解提示，建议改走服务端代理）。
const AI_CHAT_KEY = 'ai_chat_history';
const AI_CHAT_MAX = 200;
let aiChatLog = [];            // [{role:'user'|'assistant'|'op'|'err', text, ts}]
let aiChatBusy = false;
let aiChatPanelEl = null;
let aiChatImage = [];          // 参考图数组 [{dataUrl, name, w, h}]（仅内存，不落库）
const AI_CHAT_IMG_MAX = 3;     // 一次最多附带几张参考图

function aiChatLoad() {
    try {
        const raw = localStorage.getItem(AI_CHAT_KEY);
        aiChatLog = raw ? (JSON.parse(raw) || []) : [];
        if (!Array.isArray(aiChatLog)) aiChatLog = [];
    } catch (e) { aiChatLog = []; }
}
function aiChatSave() {
    try {
        if (aiChatLog.length > AI_CHAT_MAX) aiChatLog = aiChatLog.slice(-AI_CHAT_MAX);
        localStorage.setItem(AI_CHAT_KEY, JSON.stringify(aiChatLog));
    } catch (e) { /* 存储不可用时静默，不影响本次会话 */ }
}

function ensureAiChatPanel() {
    if (aiChatPanelEl) return aiChatPanelEl;
    const div = document.createElement('div');
    div.className = 'ai-chat-panel';
    div.id = 'aiChatPanel';
    div.style.display = 'none';
    div.innerHTML = `
        <div class="ai-chat-head">
            <span class="ai-chat-title">AI 对话</span>
            <span class="ai-chat-model" id="aiChatModelLabel"></span>
            <button class="ai-chat-hbtn" id="aiChatSvcBtn" title="AI 服务设置"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>
            <button class="ai-chat-hbtn" id="aiChatClearBtn" title="清空对话记录"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
            <button class="ai-chat-hbtn" id="aiChatCloseBtn" title="收起"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
        </div>
        <div class="ai-chat-log" id="aiChatLog"></div>
        <div class="ai-chat-imgs" id="aiChatImgs" style="display:none"></div>
        <div class="ai-chat-foot">
            <div class="ai-chat-note" id="aiChatNote"></div>
            <div class="ai-chat-inputrow">
                <button class="ai-chat-attach" id="aiChatAttachBtn" type="button" title="上传参考图（让 AI 照着图建模）"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg></button>
                <input type="file" id="aiChatFile" accept="image/*" multiple style="display:none">
                <textarea class="ai-chat-input" id="aiChatInput" placeholder="描述你想要的模型或动画，例如：做一个旋转的立方体"></textarea>
                <button class="ai-chat-send" id="aiChatSendBtn" type="button">发送</button>
            </div>
        </div>`;
    document.body.appendChild(div);
    aiChatPanelEl = div;
    div.querySelector('#aiChatCloseBtn').addEventListener('click', () => aiChatToggle(false));
    div.querySelector('#aiChatSvcBtn').addEventListener('click', () => aiSvcOpen());
    div.querySelector('#aiChatClearBtn').addEventListener('click', () => {
        aiChatLog = []; aiChatSave(); aiChatRender();
    });
    const send = () => aiChatSend();
    div.querySelector('#aiChatSendBtn').addEventListener('click', send);
    const input = div.querySelector('#aiChatInput');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(120, input.scrollHeight) + 'px';
    });
    // 参考图：选择文件 → 压缩到 base64 data URL → 预览条
    const attachBtn = div.querySelector('#aiChatAttachBtn');
    const fileEl = div.querySelector('#aiChatFile');
    if (attachBtn && fileEl) {
        attachBtn.addEventListener('click', () => fileEl.click());
        fileEl.addEventListener('change', () => {
            const files = Array.from(fileEl.files || []);
            files.forEach(f => aiChatAddImage(f));
            fileEl.value = '';
        });
    }
    aiChatRenderImages();
    return div;
}

// 把一张图片读入并压缩成 data URL（长边压到 1024，控制体积也够视觉模型看清结构）
function aiChatAddImage(file) {
    if (!file || !/^image\//.test(file.type || '')) return;
    if (aiChatImage.length >= AI_CHAT_IMG_MAX) { aiChatPush('err', `一次最多附带 ${AI_CHAT_IMG_MAX} 张参考图。`); return; }
    const fr = new FileReader();
    fr.onload = () => {
        const dataUrl = String(fr.result || '');
        const img = new Image();
        img.onload = () => {
            let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            const MAXD = 1024;
            let out = dataUrl;
            if (Math.max(w, h) > MAXD) {
                const s = MAXD / Math.max(w, h);
                const cv = document.createElement('canvas');
                cv.width = Math.max(1, Math.round(w * s));
                cv.height = Math.max(1, Math.round(h * s));
                const cx = cv.getContext('2d');
                cx.drawImage(img, 0, 0, cv.width, cv.height);
                try { out = cv.toDataURL('image/jpeg', 0.85); } catch (e) { out = dataUrl; }
                w = cv.width; h = cv.height;
            }
            aiChatImage.push({ dataUrl: out, name: file.name || 'image', w, h });
            aiChatRenderImages();
            if (aiChatPanelEl) aiChatPanelEl.querySelector('#aiChatInput').focus();
        };
        img.onerror = () => {
            aiChatImage.push({ dataUrl, name: file.name || 'image', w: 0, h: 0 });
            aiChatRenderImages();
        };
        img.src = dataUrl;
    };
    fr.readAsDataURL(file);
}
window.aiChatAddImage = aiChatAddImage;

function aiChatRenderImages() {
    if (!aiChatPanelEl) return;
    const bar = aiChatPanelEl.querySelector('#aiChatImgs');
    if (!bar) return;
    if (!aiChatImage.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    bar.style.display = 'flex';
    bar.innerHTML = aiChatImage.map((im, i) =>
        `<div class="ai-chat-thumb" title="${aiEsc(im.name)}">
            <img src="${im.dataUrl}" alt="">
            <button class="ai-chat-thumb-x" data-i="${i}" title="移除">×</button>
        </div>`).join('');
    bar.querySelectorAll('.ai-chat-thumb-x').forEach(btn => {
        btn.addEventListener('click', () => {
            aiChatImage.splice(Number(btn.getAttribute('data-i')), 1);
            aiChatRenderImages();
        });
    });
}

function aiChatToggle(show) {
    // ★ AI 对话属于开发者模式功能：只有 devMode 开启时才允许展开
    if (show !== false && typeof devMode !== 'undefined' && !devMode) {
        if (typeof showToast === 'function') showToast('AI 对话在开发者模式下才可用（设置 → 🛠 开发者工具）', { duration: 2800 });
        return;
    }
    ensureAiChatPanel();
    const want = (show === undefined) ? (aiChatPanelEl.style.display === 'none') : !!show;
    aiChatPanelEl.style.display = want ? 'flex' : 'none';
    if (want) { aiChatRender(); aiChatUpdateHeader(); }
}
window.aiChatToggle = aiChatToggle;

function aiChatUpdateHeader() {
    if (!aiChatPanelEl) return;
    const act = aiActiveService();
    const label = aiChatPanelEl.querySelector('#aiChatModelLabel');
    const note = aiChatPanelEl.querySelector('#aiChatNote');
    if (label) label.textContent = act ? `${act.name} · ${act.model || '未指定模型'}` : '未配置服务';
    if (note) {
        if (!aiServices.length) {
            note.className = 'ai-chat-note warn';
            note.textContent = '尚未配置 AI 服务，点右上角齿轮添加。';
        } else if (!act) {
            note.className = 'ai-chat-note warn';
            note.textContent = '未选择当前服务，请在 AI 服务设置里设为默认。';
        } else if (act.type === 'cloud') {
            note.className = 'ai-chat-note warn';
            note.textContent = '云端直连可能被浏览器 CORS 拦截，正式使用建议经服务端代理。';
        } else {
            note.className = 'ai-chat-note';
            note.textContent = '本地服务对话（Ollama / LM Studio）。';
        }
    }
}

function aiChatRender() {
    if (!aiChatPanelEl) return;
    const log = aiChatPanelEl.querySelector('#aiChatLog');
    if (!aiChatLog.length) {
        log.innerHTML = `<div class="ai-chat-empty">开始和 AI 对话吧。<br>AI 的每一次操作（生成模型 / 修改动画）都会显示在这里，方便回溯。<br>也可以点左下角图片按钮，上传参考图让 AI 照着建模。</div>`;
        return;
    }
    log.innerHTML = aiChatLog.map((m, idx) => {
        const cls = m.role === 'user' ? 'user' : (m.role === 'op' ? 'op' : (m.role === 'err' ? 'err' : 'assistant'));
        const roleName = m.role === 'user' ? '我' : (m.role === 'op' ? 'AI 操作' : (m.role === 'err' ? '错误' : 'AI'));
        const opts = renderAiAskCard(m, idx);
        // 结构化问答卡已经完整呈现了题面与选项 ⇒ 不再重复显示纯文本气泡正文，
        // 否则题目会「蓝框里说一遍、卡片里再说一遍」，最显多余。
        const hasCard = m.ask && Array.isArray(m.askData) && m.askData.length;
        const body = hasCard ? '' : `<div class="ai-msg-body">${aiEsc(m.text || '')}</div>`;
        // 每轮的第一条「AI 操作」挂一个「撤销本次操作」小链接：一轮可能落账多次，
        // 手按 Ctrl+Z 要按好几下，这里一次撤到位。只挂在本轮首条 op 上，避免刷屏。
        const prev = aiChatLog[idx - 1];
        const isTurnHead = m.role === 'op' && (!prev || prev.role === 'user');
        const undoLink = isTurnHead
            ? `<div class="ai-msg-undo"><a href="javascript:void(0)" class="ai-undo-link" data-undo="1">撤销本次操作</a></div>`
            : '';
        return `<div class="ai-msg ${cls}${m.ask ? ' ask' : ''}${hasCard ? ' has-card' : ''}">
            <div class="ai-msg-role">${roleName}</div>
            ${body}
            ${opts}
            ${undoLink}
        </div>`;
    }).join('');
    bindAiAskCard(log);
    log.querySelectorAll('.ai-undo-link').forEach(a => {
        a.addEventListener('click', () => aiChatUndoLastTurn());
    });
    // 有未回答的问答卡时，把它「顶部对齐」滚进视野 —— 卡片较高（可含多题），
    // 直接滚到底会把第一题顶出画面，用户第一眼就看不到问题。
    const pendingCard = Array.from(log.querySelectorAll('.ai-q-card:not(.is-answered)')).pop();
    if (pendingCard && typeof pendingCard.scrollIntoView === 'function') {
        pendingCard.scrollIntoView({ block: 'start' });
        // 顶部留一点余量，别贴着面板头
        log.scrollTop = Math.max(0, pendingCard.offsetTop - 6);
    } else {
        log.scrollTop = log.scrollHeight;
    }
}

// ==================== AI 问答卡（极简：左色条 + 列表式选项 + 补充说明） ====================
// 渲染一条提问消息。有 askData 时渲染成结构化卡片；没有则退回旧的平铺按钮。
// 设计：每题一组；每个选项是一行「左侧竖色条 + 文字」，选中时色条填实、行底淡淡着色。
//       没有胶囊、没有边框块；全卡底部一个「补充说明」输入 + 一个发送按钮。
function renderAiAskCard(m, idx) {
    const data = Array.isArray(m.askData) ? m.askData : null;
    if (!data || !data.length) {
        return (m.options && m.options.length)
            ? `<div class="ai-msg-opts">${m.options.map(o => `<button class="ai-opt-btn" data-opt="${aiEscAttr(o)}">${aiEsc(o)}</button>`).join('')}</div>`
            : '';
    }
    const answered = !!m.askAnswered;
    const groups = data.map((g, gi) => {
        const rows = (g.options || []).map((o, oi) => {
            const note = o.note ? `<span class="ai-q-note">${aiEsc(o.note)}</span>` : '';
            return `<div class="ai-q-row${g.multi ? ' multi' : ''}" data-aiq="${idx}:${gi}:${oi}" role="${g.multi ? 'checkbox' : 'radio'}" aria-checked="false" tabindex="0"${answered ? ' aria-disabled="true"' : ''}>` +
                `<span class="ai-q-bar"></span><span class="ai-q-label">${aiEsc(o.label)}</span>${note}</div>`;
        }).join('');
        return `<div class="ai-q-group" data-aiq-group="${gi}">
            <div class="ai-q-title"><span class="ai-q-no">${gi + 1}</span>${aiEsc(g.q)}<span class="ai-q-mode">${g.multi ? '可多选' : '单选'}</span></div>
            <div class="ai-q-list">${rows}</div>
        </div>`;
    }).join('');
    const supp = answered
        ? (m.askSupplement ? `<div class="ai-q-supp-read">补充：${aiEsc(m.askSupplement)}</div>` : '')
        : `<textarea class="ai-q-custom" data-aiq-custom="${idx}" rows="2" placeholder="补充说明（可选，如「要橙色为主」「再加个底座」）"></textarea>`;
    if (answered) {
        return `<div class="ai-q-card is-answered" data-aiq-card="${idx}">${groups}${supp}</div>`;
    }
    return `<div class="ai-q-card" data-aiq-card="${idx}">${groups}
        <div class="ai-q-supp">${supp}</div>
        <div class="ai-q-foot">
            <button type="button" class="ai-q-send" data-aiq-send="${idx}" disabled>发送</button>
            <button type="button" class="ai-q-skip" data-aiq-skip="${idx}">都行，你定</button>
        </div></div>`;
}

// 给渲染出来的问答卡绑定事件（点选 / 输入 / 发送 / 跳过）
function bindAiAskCard(log) {
    // 旧平铺按钮（无 askData 时的兜底）
    log.querySelectorAll('.ai-opt-btn').forEach(btn => {
        btn.addEventListener('click', () => aiChatPick(btn.getAttribute('data-opt')));
    });
    // 选项行：切换选中态
    log.querySelectorAll('.ai-q-row').forEach(row => {
        const toggle = () => {
            if (row.getAttribute('aria-disabled') === 'true') return;
            const key = row.getAttribute('data-aiq') || '';
            const group = row.closest('.ai-q-group');
            const isMulti = row.classList.contains('multi');
            const on = row.classList.contains('on');
            if (!isMulti) {
                // 单选：同组互斥；点已选项则取消（允许改主意）
                group.querySelectorAll('.ai-q-row').forEach(r => { r.classList.remove('on'); r.setAttribute('aria-checked', 'false'); });
                if (!on) { row.classList.add('on'); row.setAttribute('aria-checked', 'true'); }
            } else {
                row.classList.toggle('on');
                row.setAttribute('aria-checked', row.classList.contains('on') ? 'true' : 'false');
            }
            const wrap = row.closest('.ai-q-card'); if (wrap) updateAiAskSendState(wrap);
        };
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
        });
    });
    // 补充说明：输入时刷新发送按钮可用性
    log.querySelectorAll('.ai-q-custom').forEach(inp => {
        inp.addEventListener('input', () => {
            const wrap = inp.closest('.ai-q-card'); if (wrap) updateAiAskSendState(wrap);
        });
    });
    // 发送 / 跳过
    log.querySelectorAll('.ai-q-send').forEach(sb => {
        sb.addEventListener('click', () => { const wrap = sb.closest('.ai-q-card'); if (wrap) submitAiAskCard(wrap); });
        const wrap = sb.closest('.ai-q-card'); if (wrap) updateAiAskSendState(wrap);
    });
    log.querySelectorAll('.ai-q-skip').forEach(sb => {
        sb.addEventListener('click', () => submitAiAskCard(null, sb.getAttribute('data-aiq-skip')));
    });
}

// 至少选了一个选项或填了补充说明才允许发送
function updateAiAskSendState(card) {
    const sb = card.querySelector('.ai-q-send');
    if (!sb) return;
    let any = !!card.querySelector('.ai-q-row.on');
    const ci = card.querySelector('.ai-q-custom');
    if (ci && ci.value.trim()) any = true;
    sb.disabled = !any;
}

// 收集一张问答卡的全部答案 → 拼成一条用户消息发出。
// skipIdx 不为空时表示「都行，你定」：该题不表态，交给 AI 自行决定。
function submitAiAskCard(card, skipIdx) {
    if (aiChatBusy) return;
    let m = null, qidx = null;
    if (card) {
        qidx = parseInt(card.getAttribute('data-aiq-card'), 10);
        m = aiChatLog[qidx];
    } else if (skipIdx != null) {
        qidx = parseInt(skipIdx, 10);
        m = aiChatLog[qidx];
        card = document.querySelector(`.ai-q-card[data-aiq-card="${qidx}"]`);
    }
    if (!m || !Array.isArray(m.askData)) return;
    const lines = [];
    m.askData.forEach((g, gi) => {
        const group = card ? card.querySelector(`.ai-q-group[data-aiq-group="${gi}"]`) : null;
        const picks = group ? Array.from(group.querySelectorAll('.ai-q-row.on')).map(r => (r.querySelector('.ai-q-label') || r).textContent.trim()) : [];
        const parts = picks.slice();
        if (parts.length) lines.push(`${gi + 1}. ${g.q}\n→ ${parts.join('、')}`);
        else lines.push(`${gi + 1}. ${g.q}\n→ 你定（我都可以）`);
    });
    const ci = card ? card.querySelector('.ai-q-custom') : null;
    const supp = ci ? ci.value.trim() : '';
    if (supp) { lines.push('补充说明：' + supp); m.askSupplement = supp; }
    if (!lines.length) return;
    m.askAnswered = true;
    aiChatSave();
    const input = aiChatPanelEl && aiChatPanelEl.querySelector('#aiChatInput');
    if (input) input.value = lines.join('\n');
    aiChatSend();
}
window.submitAiAskCard = submitAiAskCard;

function aiEscAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 记下「本轮 AI 操作开始前的历史深度」，用于「撤销本次操作」精确回退一整轮。
let aiTurnBaseDepth = null;
function aiChatMarkTurnStart() {
    try { const d = history && history._dbg ? history._dbg() : null; aiTurnBaseDepth = d ? d.u : null; } catch (e) { aiTurnBaseDepth = null; }
}

// 回退到「本轮 AI 操作开始前」的状态。AI 一轮可能落账多次（建块 + 写程序），
// 逐次 Ctrl+Z 要按好几下；这里按深度差一次性撤到位。
function aiChatUndoLastTurn() {
    try {
        const now = history && history._dbg ? history._dbg() : null;
        if (!now || aiTurnBaseDepth == null) return;
        let steps = now.u - aiTurnBaseDepth;
        if (steps <= 0) return;
        flushPendingRecords && flushPendingRecords();
        while (steps-- > 0) {
            const cur = getState();
            const prev = history.undo(cur);
            if (!prev) break;
            restoreState(prev);
        }
        if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
        aiChatPush('op', '已撤销上一轮 AI 操作。');
    } catch (e) {
        aiChatPush('err', '撤销失败：' + ((e && e.message) || e));
    }
}
window.aiChatUndoLastTurn = aiChatUndoLastTurn;

function aiChatPush(role, text) {
    aiChatLog.push({ role, text: String(text == null ? '' : text), ts: Date.now() });
    aiChatSave();
    aiChatRender();
}

// AI 提问：作为一条 assistant 消息落库，额外带 options，渲染成可点的按钮
function aiChatPushAsk(askText, options, askData) {
    const m = { role: 'assistant', text: askText, ts: Date.now(), ask: true };
    if (options && options.length) m.options = options;
    // ★ 结构化问答数据：每题的候选项 / 是否多选。有它才能渲染「按题分组 + 多选 + 自定义补充 + 确认发送」的卡片。
    if (Array.isArray(askData) && askData.length) m.askData = askData;
    m.askAnswered = false;
    aiChatLog.push(m);
    aiChatSave();
    aiChatRender();
}

// 用户点了某个候选项 → 直接当成一条用户消息发出去
function aiChatPick(text) {
    if (aiChatBusy) return;
    const input = aiChatPanelEl && aiChatPanelEl.querySelector('#aiChatInput');
    if (input) input.value = String(text || '');
    aiChatSend();
}
window.aiChatPick = aiChatPick;

// 历史消息 → 送给模型的 content。带图的历史消息只回传文字，避免每轮重传大体积 base64。
function aiChatHistoryContent(m) {
    return String((m && m.text) || '');
}

// 调用 OpenAI 兼容 /chat/completions（非流式，简单可靠）
async function aiChatComplete(svc, messages) {
    const url = String(svc.baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (svc.apiKey) headers['Authorization'] = 'Bearer ' + svc.apiKey;
    const body = { model: svc.model, messages, stream: false };
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) {} }, 60000);
    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
        clearTimeout(timer);
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            const e = new Error(`HTTP ${res.status}${t ? ' · ' + t.slice(0, 200) : ''}`);
            e.httpStatus = res.status;
            throw e;
        }
        const data = await res.json();
        const choice = data && data.choices && data.choices[0];
        const content = choice && ((choice.message && choice.message.content) || choice.text);
        if (!content) throw new Error('响应中没有内容（模型返回为空）');
        return String(content);
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

// ==================== AI 工具调用（让 AI 真正操作场景） ====================
// ★ 核心：给模型暴露「函数工具」，模型返回 tool_calls，我们在本地真正建方块 / 改程序。
//   这是「AI 自主创作」的通道 —— 没有它，AI 只能嘴上描述。
//   能力集（尽量小而正交，够拼出任意造型）：
//     add_blocks      批量建方块（网格坐标，自动避让已占用格子与名字；支持 sx/sy/sz 拉伸 + rotx/roty/rotz 旋转）
//     set_transform   修改已有方块的拉伸 / 旋转 / 位置（不新建，只改）
//     set_program     给指定方块写 molang 程序（做动画 / 参数化）
//     list_materials  查真实可用的材质（贴图）清单 —— 材质铁律：AI 只能用这里返回的名字
//     apply_material  给已有方块换材质（贴图 / 组合预设 / 纯色）
//     make_banner     生成旗帜（底色 + 图案图层）—— 单一平面上的图案化效果，风车/横幅首选
//     make_shape      参数化生成平行四边形/矩形面片（三角、梯形、斜边靠它，引擎给精确解）
//     create_folder   建文件夹（分组）并自动指定骨干
//     bind_bone       骨骼绑定 / 解绑（子块跟随父块运动）
//     get_scene       读当前场景（方块数 / 名字 / 程序），供多轮创作时了解现状
//     clear_scene     清空场景
//     ask_user        向用户反问（描述不足以唯一确定造型时先问再建）
//   坐标约定：格坐标整数，1 格 = 1 个方块边长；y 向上，x 向右，z 向前。
const AI_TOOLS_DESC =
`你是 EX 方块模拟器的「建模助手」，可以通过调用工具直接在用户的 3D 场景里创建方块。

【第零原则 · 硬禁令（违反＝不合格，最容易犯的错）】
- ★★★ **严禁用「同一个尺寸的小方块逐格堆叠」去拼形状。** 这是本模拟器里最糟糕的建模方式。
- 判定标准：只要你连续放了 3 个以上**同样大小、同样朝向**的方块，就说明你该用下面两种手段之一：
  · 一条长边 / 一根柱子 / 一段横梁 / 一片薄板 / 一面墙 / 一块地板 ⇒ **必须用 1 个方块 + 拉伸**（\`sy\`/\`sx\`/\`sz\` 或 \`w\`/\`h\`/\`face\`）。
  · 一段斜边 / 斜面 / 带角度的构件 ⇒ **必须用 \`rotx\`/\`roty\`/\`rotz\` 旋转 1 个拉伸后的方块**。
  · 一片带图案的面（风车叶片 / 横幅 / 招牌 / 徽标 / 渐变）⇒ **必须用 \`make_banner\`（旗帜）**，旗帜纹样是单方块做不到的。
- **自检硬指标**：一个成型的造型，\`拉伸块（带 sx/sy/sz 或 w/h）: 普通方块\` 的比例**必须 ≥ 1:3**（即每 4 块里至少 1 块是拉伸的）。
  纯堆叠造型（0 块拉伸）= 直接不合格，用户会看出来是一坨方块。
- **开工前先把预算说清楚**：你打算用几块？其中几块是拉伸/旋转的？几块是旗帜？如果算出来「块数多但几乎没拉伸」，立刻停下来重新设计。

【第一原则：先问清楚，再动手】
- 如果用户的描述**不足以唯一确定造型**（没说形状细节/风格/尺寸/用途），**先调用 ask_user 问 1~4 个关键问题**，
  等用户回答后再建。绝不靠猜。
- 必须问清楚的典型歧义（按需挑最关键的 1~2 个，别一口气问一堆）：
  · 风格：**方块堆叠（像素/体素风，直角硬边）** 还是 **平滑拟合（逐块拉伸微调尺寸做圆润过渡）**？
    ⚠ 注意：「方块堆叠」指的是**造型语言**像像素画（用大小不一的方块拼），**不是**允许你把 60 个 1×1 同尺寸方块堆成一条斜线。
  · 结构：**实心** 还是 **空心**（只做外壳，省方块）？厚度多少？
  · 尺寸：整体多少格高 / 多少格宽？有没有目标方块数量上限？
  · 对称：是否左右/前后对称？朝向（正面朝 +Z 还是 +X）？
  · 动态：静止，还是要有动画（旋转/浮动/呼吸/开合）？
- 只有当描述已经足够明确（或用户明确说"别问了直接做"），才直接开始创建。
- 问完之后**同一轮里**不要再重复问同样的问题；用户答复后立刻开工。

【第二原则：拉伸是默认手段，堆块是最后手段】
- ★★★ **这个模拟器的每个方块都能自由拉伸和旋转。默认就该用「少而大」的方块，堆块只是极少数例外。**
- 两种拉伸模式，按需求选：
  · **长条 / 柱子模式** —— 给 \`sx\` / \`sy\` / \`sz\`（方向尺寸倍数，1 = 原始大小）。引擎会把**最大的那一轴**拉长，另两轴保持原始粗细。
    例：柱子 \`sy: 12\`；横梁 \`sx: 10\`；伸出的杆 \`sz: 8\`；薄片 \`sz: 0.15\`（把 Z 压成薄板）。
    ⚠ 一次只能拉**一根轴**，所以「10 宽 × 5 高」这种两维同时拉伸做不到 —— 那种情况用下面的平板模式。
  · **平板 / 薄板模式** —— 给 \`w\` 和 \`h\`（两条边的格数），引擎用精确解生成一块严格 w×h 的**零厚度矩形面片**，
    再用 \`face\` 选朝向：\`'xz'\`=水平（地面/地板，默认）、\`'xy'\`=竖直朝前（墙/幕布）、\`'yz'\`=竖直朝右。
    例：一堵墙 \`w: 10, h: 5, face: 'xy'\`；一块地板 \`w: 8, h: 8\`（默认 xz）；一面招牌 \`w: 6, h: 3, face: 'xy'\`。
  · **任意尺寸的长方体** —— 需要「同时两个方向都变大」（如 10×5 的厚板）时：用平板模式给 \`w\`/\`h\` 定面，
    再用长条模式的第三轴 \`sx\`/\`sy\`/\`sz\` 给厚度（两种模式可叠加同一次传入）。
- 旋转：\`rotx\` / \`roty\` / \`rotz\` 是绕三轴的**度数**（局部旋转）。斜屋顶、叶片、斜边、倾斜构件都靠它。
- 位置 \`x/y/z\` 是格坐标，容器中心点即方块中心。
- **强制对照表（左边的做法一律不合格）**：
  · ✗ 500 个小方块拼一堵墙 ⇒ ✓ 1 块平板 \`w: 10, h: 5, face: 'xy'\`
  · ✗ 12 个小方块摞成一根柱子 ⇒ ✓ 1 块 \`sy: 12\`
  · ✗ 用 20 个小方块排成一条斜线 ⇒ ✓ 1 块 \`sx: 20\` + \`rotz: 45\`
  · ✗ 用阶梯状小方块拼屋顶斜面 ⇒ ✓ 1 块平板 \`w: 10, h: 6, face: 'xy'\` + \`rotx: 35\`
  · ✗ 用小方块拼一片叶子/叶片 ⇒ ✓ 1 块 \`make_banner\` 旗帜（叶片形态 + 纹样一次到位）
  · ✗ 一圈同尺寸方块拼成圆环 ⇒ ✓ 8 块**拉伸**方块首尾相接（每块 \`sx\` 按弦长）
- **允许逐格摆的例外**（说清楚理由才可以用）：像素爱心、棋盘、镂空图案、严格像素画的渐变 —— 这些**造型本身要求逐格不同**。
  即使是这些，也要先把「可拉伸的部分」抽出来（如底板用 1 块平板，只有图案内容逐格摆）。

【第三原则：先定解析式再采样】
- 想球体：半径 R，逐层用该层半径 r = sqrt(R² - y²) 定该层的 \`sx\`/\`sz\` 尺寸，**一层只放 1 块**（拉伸成该层直径的圆盘近似）。
- 想圆柱/锥/环/螺旋/波浪/爱心曲线：先写解析式，再按解析式决定每块的**位置 + 尺寸 + 角度**。每块的尺寸都应由公式算出，而不是常数。
- 对称造型：只算一半，镜像出另一半，保证左右严格对称。
- ★ **块数是结果，不是目标**：不要为了凑数而堆块，也不要为了"精确"而堆块。作为参考：简单造型 **≤ 15 块**，中等造型 **≤ 30 块**，
  复杂造型**超过 30 块时必须在回复里说明「为什么不能再合并/拉伸」**，否则就是没优化到位。
- 明确告知用户你的构造策略与**用量**（例：「用 12 层拉伸方块拟合的球体，每层边长按 sqrt 递减；共 12 块，全部为拉伸块」），
  让用户知道你在拟合而不是乱堆。

【第四原则：用变量与表达式让模型「可调」】
- 造型里的关键尺寸（半径、层高、间距、角度、相位）尽量抽成**变量**，方便用户后续一键改。
  可在 set_program 里给根块写含变量的 molang；也可以在 add_blocks 后用 set_program 给方块写带计算的位置表达式。
- 动画一律走 molang 表达式（用 q.life_time / q.anim_time + math.sin 等），而不是给关键帧硬塞数字。

【第五原则：参考图】
- 如果用户上传了参考图/实物照片，**先仔细看图**：数出主要结构层级、比例、配色（取近似色号），
  然后据此定网格尺寸与配色；不确定的细节用 ask_user 追问（如"图里是三段还是四段"）。
- 没有图也可以做，但如果有图就不要再凭空猜比例。

【第六原则：能用现成工具就别自己算，更别硬堆】
- ★★★ 这个模拟器内置了大量成熟能力，**优先调用工具**，不要自己用坐标硬拼、也不要心算半天：
  · 需要斜边 / 三角 / 梯形 / 斜屋顶这类「带角度或非直角的面」⇒ 用 **make_shape**（给两边长 a/b + 夹角 angle，引擎用精确解析解算好角度，你不用自己推角度）。
  · 需要「图案化的平面」⇒ 用 **make_banner**！见下一节。
  · 需要一组方块**整体一起动**（风车整体转、门窗整体开合、机械臂）⇒ 用 **create_folder** 建文件夹（自动指定骨干）+ **bind_bone** 把子块绑到骨干上，再给骨干写转动 molang。
  · 需要换材质 ⇒ 先 **list_materials** 查真实贴图，再用 **apply_material** 贴上去（也支持组合预设 preset，让原木/铁砧这类方块六面自动带顶侧区别）。
- 变形、拉伸、旋转已有方块用 set_transform；这些工具能省掉大量试错，**看到需求先想「有没有现成工具」，而不是马上堆坐标**。

【旗帜优先原则（★重点：很多造型旗帜比堆方块好得多）】
- ★★★ **凡是「一片带图案/带纹样的面」，一律优先用 \`make_banner\` 做旗帜，而不是用一堆小方块拼图案。**
- 为什么：旗帜是 20×40 的贴图平面，能画出**渐变、斜条、菱形、十字、边框、圆形、竖向条纹**等纹样，
  单方块永远做不到；而且只占 1 块，成本极低。
- 典型该用旗帜的场景（务必抓住）：
  · **风车叶片 / 风扇叶 / 螺旋桨** ⇒ 叶片用旗帜（如 \`gru\` 渐变 或 \`cs\` 竖条 做出叶片层次），比用小方块拼斜线好一个数量级。
  · **旗帜 / 横幅 / 锦旗 / 挂旗 / 条幅** ⇒ 直接旗帜。
  · **招牌 / 告示牌 / 路牌 / 店面招牌 / 霓虹字** ⇒ 旗帜（用条纹/边框纹样打底）。
  · **地毯 / 挂毯 / 桌布 / 壁画 / 海报** ⇒ 旗帜平铺（配 face:'xz'）。
  · **规整几何图案面**（棋盘、格纹、菱形阵、同心圆）⇒ 旗帜。
- 用法：\`make_banner\` 给 \`base\`（底色，16 色之一）+ \`layers\`（每层 {pat, dye}，最多 6 层）。参数名就是 \`base\` / \`layers\` / \`pat\` / \`dye\`，别写错。
  常用纹样 pat：\`gru\`=下渐变、\`cs\`=竖条、\`rd\`=菱形、\`mc\`=圆圈、\`bt\`=三角、\`ss\`=斜条、\`bs\`=底边、\`hhb\`=水平条、\`cre\`=苦力怕脸、\`sku\`=骷髅脸。
  dye 用英文色名：white / orange / magenta / light_blue / yellow / lime / pink / gray / silver / cyan / purple / blue / brown / green / red / black。
- 旗帜也能拉伸与旋转（同 add_blocks 的 \`sz\`/\`rotz\` 等），可以做成倾斜的叶片或招牌。

【材质铁律：只能用真实存在的材质，绝不许自造】
- ★★★ **贴图名必须来自 list_materials 的返回值**（真实存在的原版贴图文件名，如 oak_planks.png / stone.png）。**绝对不许编造贴图名**（如 "my_wood.png"）—— 编的名字贴上去就是空白/失败。
- 不确定有哪些材质就先调 list_materials（可按 category 或 keyword 筛，如 keyword:"oak" 或 category:"wood"），拿到真实清单后再用。
- 材质类型限制：cube 支持 color/ore/redstone/nether/nature/func/wood/stone/misc；stair 与 halfbrick **只能用 stone/wood 类**；flag 只能贴织布机旗帜或本地上传图（所以旗帜一律走 make_banner）。
- 纯色直接用 color（hex），调色板是标准 20 色或任意 #rrggbb。

【工具使用规矩】
1. 用户用自然语言描述想要的东西（如"YZ 平面上的爱心""一个旋转的立方体"）。
2. 你**必须调用工具**去真的创建，而不是只给文字描述或贴 JSON 代码块。
3. 拼造型时用 add_blocks 一次传多个方块，坐标用整数格（x 右 / y 上 / z 前）。
   **每一块都要想一下"这块能不能拉伸/旋转/换成旗帜"**；长条给 sy/sx/sz，平板给 w/h + face，图案面走 make_banner。
   要用变换就**同一次**传进去，别分两轮。
   要让物体居中，x、z 通常取对称值（如 -1 和 1），y 从 0 开始向上堆。
4. 需要动画时：先用 add_blocks 建好方块并给每块起唯一 name，再用 set_program 给某块写 molang。
   事后要改某块的尺寸/角度用 set_transform（不用重建）。
5. 创建完成后，用一句简短中文说明你做了什么（省去长篇解释和代码块），**并附上用量统计**：
   「共 N 块，其中拉伸块 M 块、旋转块 K 块、旗帜 F 块」。若 M 为 0，说明你违反了第零原则，请重做。

molang 程序要点（本项目方言）：
- 变量写法 v.xxx，读取用同名；改变位置用 v.xpos/v.ypos/v.zpos，旋转用 v.rotatex/v.rotatey/v.rotatez（全局旋转）/ v.xrot/v.yrot/v.zrot（局部旋转）。
- **尺寸可变**：v.scale 是整体缩放（1 = 原始大小）；v.extend_scale 是沿「拉伸轴」的长度倍数 —— 沿某个轴拉长靠「先转过去、拉长、再转回来」实现。
  想沿 X 轴拉长：v.extend_xrot = 0; v.extend_yrot = 90; v.extend_scale = 8;   沿 Y 轴拉长：v.extend_xrot = 90; v.extend_yrot = 0; v.extend_scale = 8;   沿 Z 轴拉长：v.extend_xrot = 0; v.extend_yrot = 0; v.extend_scale = 8;
- 每行语句必须以分号结尾（如 v.rotatey = 0;）。支持 q. 查询（如 q.life_time、q.anim_time）。
- 让方块转起来：[v.rotatey = q.life_time * 60;]  让方块上下浮动：[v.ypos = 0.5 + math.sin(q.life_time * 180) * 0.5;]
- 支持 math.sin/cos/sqrt/abs/pow/floor/round/min/max、三目 a?b:c、while 循环。
- 别用本项目不支持的写法：loop(…)、q.is_name_any(…)、math.mod(…) —— 这些会报错。用 while/普通表达式替代。
- ★ 若给出 while 循环生成大量方块的程序，务必确保循环变量每轮必然变化，避免死循环（迭代上限 4096）。
`;

function aiToolDefs() {
    return [
        {
            type: 'function',
            function: {
                name: 'add_blocks',
                description: '在场景中创建一批方块。坐标是整数格（x 右 / y 上 / z 前），1 格 = 1 个方块大小。同名会冲突，请给每块唯一 name。★★★ 严禁用同尺寸小方块逐格堆形状：长条/柱子给 sx/sy/sz（取最大轴拉长），矩形薄板给 w/h + face，任意角度给 rotx/roty/rotz，带图案的面请改用 make_banner 旗帜。成型造型里「拉伸块:普通块」应 ≥ 1:3；若你准备放 3 个以上同尺寸同朝向的方块，就说明你该改成 1 块拉伸块。',
                parameters: {
                    type: 'object',
                    properties: {
                        blocks: {
                            type: 'array',
                            description: '要创建的方块数组',
                            items: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string', description: '方块名称（唯一，如 heart_left）' },
                                    x: { type: 'number', description: 'X 坐标（格，向右为正）' },
                                    y: { type: 'number', description: 'Y 坐标（格，向上为正）' },
                                    z: { type: 'number', description: 'Z 坐标（格，向前为正）' },
                                    color: { type: 'string', description: '颜色，十六进制如 #ff5577，默认淡蓝' },
                                    type: { type: 'string', enum: ['cube', 'halfbrick', 'stair', 'flag'], description: '方块形状，默认 cube' },
                                    sx: { type: 'number', description: '★ 长条模式：X 方向尺寸倍数（1=原始大小）。做柱子/长条/梁用。' },
                                    sy: { type: 'number', description: '★ 长条模式：Y 方向尺寸倍数（如 12 = 12 格高的柱子）。' },
                                    sz: { type: 'number', description: '★ 长条模式：Z 方向尺寸倍数。' },
                                    w: { type: 'number', description: '★ 平板模式：矩形的第一边长（格）。给了 w/h 就按「精确矩形薄板」处理，忽略 sx/sy/sz。' },
                                    h: { type: 'number', description: '★ 平板模式：矩形的第二边长（格）。' },
                                    face: { type: 'string', enum: ['xz', 'xy', 'yz'], description: '★ 平板朝向：xz=水平地面(默认)，xy=竖直朝前(墙)，yz=竖直朝右。' },
                                    rotx: { type: 'number', description: '★ 绕 X 轴旋转（度，局部旋转）。' },
                                    roty: { type: 'number', description: '★ 绕 Y 轴旋转（度，局部旋转）。' },
                                    rotz: { type: 'number', description: '★ 绕 Z 轴旋转（度，局部旋转）。' },
                                    program: { type: 'string', description: '可选：该方块的 molang 程序（动画）' }
                                },
                                required: ['name', 'x', 'y', 'z']
                            }
                        }
                    },
                    required: ['blocks']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'set_transform',
                description: '★ 修改已有方块的拉伸/旋转/位置（不改颜色与程序）。用来把一个方块拉长、压扁、转角度。只传要改的字段即可。长条给 sx/sy/sz；精确矩形薄板给 w/h(+face)。',
                parameters: {
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            description: '要修改的方块数组',
                            items: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string', description: '目标方块名称' },
                                    sx: { type: 'number', description: '长条模式：X 方向尺寸倍数' },
                                    sy: { type: 'number', description: '长条模式：Y 方向尺寸倍数' },
                                    sz: { type: 'number', description: '长条模式：Z 方向尺寸倍数' },
                                    w: { type: 'number', description: '平板模式：矩形第一边长（格），与 h 搭配' },
                                    h: { type: 'number', description: '平板模式：矩形第二边长（格）' },
                                    face: { type: 'string', enum: ['xz', 'xy', 'yz'], description: '平板朝向：xz=水平 / xy=竖直朝前 / yz=竖直朝右' },
                                    rotx: { type: 'number', description: '绕 X 轴旋转（度）' },
                                    roty: { type: 'number', description: '绕 Y 轴旋转（度）' },
                                    rotz: { type: 'number', description: '绕 Z 轴旋转（度）' },
                                    x: { type: 'number', description: 'X 坐标（格）' },
                                    y: { type: 'number', description: 'Y 坐标（格）' },
                                    z: { type: 'number', description: 'Z 坐标（格）' }
                                },
                                required: ['name']
                            }
                        }
                    },
                    required: ['items']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'set_program',
                description: '给场景中已有的方块写入 molang 程序（做动画）。方块用 name 指定（与创建时一致）。',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: '目标方块名称' },
                        program: { type: 'string', description: 'molang 程序文本，每行以分号结尾' }
                    },
                    required: ['name', 'program']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'ask_user',
                description: '在信息不足时向用户提问（例如风格是方块堆叠还是平滑拟合、实心还是空心、尺寸多大）。调用后本轮结束，等用户回答再继续。一次最多 4 个问题。★ 每个问题请给 2~4 个候选项让用户点选（比让用户打字快）；用户始终可以自己补充说明。若某题可多选（如「要哪些功能」），把 multi 设为 true。',
                parameters: {
                    type: 'object',
                    properties: {
                        questions: {
                            type: 'array',
                            description: '要问的问题（1~4 个，简短、有明确选项更好）',
                            items: {
                                type: 'object',
                                properties: {
                                    q: { type: 'string', description: '问题文本，如「要哪种风格？」' },
                                    multi: { type: 'boolean', description: '该题是否可多选（默认单选）。如「需要哪些功能」设为 true。' },
                                    options: {
                                        type: 'array',
                                        description: '候选答案（建议 2~4 个）。可传字符串，或 {label,note}（note 是括号里的补充说明）',
                                        items: {
                                            anyOf: [
                                                { type: 'string' },
                                                {
                                                    type: 'object',
                                                    properties: {
                                                        label: { type: 'string', description: '选项主文字' },
                                                        note: { type: 'string', description: '可选：括号内的补充说明' }
                                                    },
                                                    required: ['label']
                                                }
                                            ]
                                        }
                                    }
                                },
                                required: ['q']
                            }
                        }
                    },
                    required: ['questions']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_scene',
                description: '读取当前场景里所有方块的列表（名称 / 位置 / 类型 / 是否带程序），用于了解现状再做修改。',
                parameters: { type: 'object', properties: {}, required: [] }
            }
        },
        {
            type: 'function',
            function: {
                name: 'clear_scene',
                description: '清空场景里的所有方块（用于重新开始）。谨慎使用。',
                parameters: { type: 'object', properties: {}, required: [] }
            }
        },
        {
            type: 'function',
            function: {
                name: 'list_materials',
                description: '★ 查询本模拟器真实可用的材质（贴图）清单。**要贴图前必须先查**，只能用这里返回的 file 值，绝不许自造贴图名。可不带参数（返回全部分类概览），也可按分类 / 关键词筛选。',
                parameters: {
                    type: 'object',
                    properties: {
                        category: { type: 'string', description: '分类 id：color色彩建材 / nature自然生态 / wood木质 / ore矿物金属 / redstone红石机械 / nether下界末地 / func功能方块 / stone石质 / misc其他 / trapdoor活板门 / rail铁轨 / door门 / fence栅栏 / grass草 / flower花 / nonsolid非实心 / anvil铁砧 / end_portal_frame末地传送门 / stonecutter切石机。留空=全部。' },
                        keyword: { type: 'string', description: '关键词（中英文皆可，如 oak / 石头 / planks），模糊匹配文件名与中文名。' }
                    },
                    required: []
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'apply_material',
                description: '★ 给已有方块换材质。三种方式任选：① tex=贴图文件名（必须来自 list_materials 的返回值）；② preset=组合方块预设 key（如 oak_log，让六面自动带顶/侧区别）；③ color=纯色 hex。type 为 stair/halfbrick 时只能用 stone/wood 类贴图。',
                parameters: {
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            description: '要换材质的方块数组',
                            items: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string', description: '目标方块名称' },
                                    tex: { type: 'string', description: '贴图文件名（如 oak_planks.png）或中文名（如 橡木木板）。' },
                                    preset: { type: 'string', description: '组合方块预设 key（如 oak_log / anvil），优先于 tex。' },
                                    color: { type: 'string', description: '纯色 hex，如 #ff5577。仅当没给 tex/preset 时使用。' }
                                },
                                required: ['name']
                            }
                        }
                    },
                    required: ['items']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'make_banner',
                description: '★ 生成一面旗帜（type=flag 的方块）并贴上图。旗帜能做出单方块做不到的效果（风车叶片、渐变横幅、人脸/图案徽标记等），需要「图案化的平面」时优先用它。图案用 MC 官方缩写：no无 bl左底角 br右底角 tr左上角 bs底条纹 rs右斜 ls左斜 cs中竖条 ms中斜条 dls左上斜 drs右上斜 ss细竖纹 sc底小三角 bt顶三角 bts三角底 rd菱形 mc半圆 mr边框 vhr左半竖 hhb下半横 gru上渐变 flo花 cre苦力怕脸 sku骷髅 moj标志 glb地球 pig猪鼻。',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: '旗帜方块名称（唯一）' },
                        x: { type: 'number', description: 'X 坐标（格）' },
                        y: { type: 'number', description: 'Y 坐标（格）' },
                        z: { type: 'number', description: 'Z 坐标（格）' },
                        base: { type: 'string', description: '底色，16 色之一：white/orange/magenta/light_blue/yellow/lime/pink/gray/light_gray/cyan/purple/blue/brown/green/red/black。默认 white。' },
                        layers: {
                            type: 'array',
                            description: '图案图层（最多 6 层，后加的画在上面）',
                            items: {
                                type: 'object',
                                properties: {
                                    pat: { type: 'string', description: '图案缩写（见工具说明）' },
                                    dye: { type: 'string', description: '该图案的染料色（同底色 16 色）' }
                                },
                                required: ['pat', 'dye']
                            }
                        },
                        rotx: { type: 'number', description: '绕 X 轴旋转（度）' },
                        roty: { type: 'number', description: '绕 Y 轴旋转（度）' },
                        rotz: { type: 'number', description: '绕 Z 轴旋转（度）' }
                    },
                    required: ['name', 'x', 'y', 'z']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'make_shape',
                description: '★ 用数学精确解生成一块平行四边形/矩形面片（三角、梯形、斜边、斜面都靠它），不用自己算角度。给两边长 a/b 与夹角 angle 即可；angle=90 就是矩形。返回的方块可直接再用 set_transform / set_program 调整。',
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: '方块名称（唯一）' },
                        x: { type: 'number', description: 'X 坐标（格）' },
                        y: { type: 'number', description: 'Y 坐标（格）' },
                        z: { type: 'number', description: 'Z 坐标（格）' },
                        a: { type: 'number', description: '第一条边长（格）' },
                        b: { type: 'number', description: '第二条边长（格）' },
                        angle: { type: 'number', description: '两边夹角（度，默认 90）。三角形可把一条边设很小近似。' },
                        color: { type: 'string', description: '纯色 hex，默认淡蓝' },
                        tex: { type: 'string', description: '可选贴图文件名（来自 list_materials）' }
                    },
                    required: ['name', 'x', 'y', 'z', 'a', 'b']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'create_folder',
                description: '★ 创建文件夹（分组）来组织方块，并自动指定骨干（backbone）。文件夹里的方块随骨干一起移动/旋转，是做「整体动画」（风车整体转、门整体开）的基础。若 folder 里已有方块，可传 backbone 指定哪块当骨干（不传则自动取第一块）。',
                parameters: {
                    type: 'object',
                    properties: {
                        folder: { type: 'string', description: '文件夹名称' },
                        block: { type: 'string', description: '要放进该文件夹的方块名（可选）' },
                        backbone: { type: 'string', description: '指定骨干方块名（可选，默认自动）' }
                    },
                    required: ['folder']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'bind_bone',
                description: '★ 骨骼绑定：把子方块绑到父方块（骨干）上，子块就会跟随父块运动（做机械臂、尾巴、连杆、风车叶片、门扇）。子块绑定后会带上跟随父块位置/旋转的 molang。传 unbind=true 可解绑。',
                parameters: {
                    type: 'object',
                    properties: {
                        child: { type: 'string', description: '子方块名称（要跟随的那个）' },
                        parent: { type: 'string', description: '父方块名称（骨干）。unbind=true 时可省略。' },
                        unbind: { type: 'boolean', description: '设为 true 时解绑 child 与父块的绑定。' }
                    },
                    required: ['child']
                }
            }
        }
    ];
}

// 把格坐标换算成方块的世界坐标：默认新方块排布在 y=0 平面、以原点为中心，1 格 = 2 单位（方块边长 2）。
const AI_GRID_UNIT = 2;
function aiGridToWorld(x, y, z) {
    return { x: (Number(x) || 0) * AI_GRID_UNIT, y: (Number(y) || 0) * AI_GRID_UNIT, z: (Number(z) || 0) * AI_GRID_UNIT };
}

// ★ 把「尺寸缩放 / 旋转 / 位置」写进方块的 13 元变换变量。
//   本项目一个方块自带完整的拉伸+旋转能力（不是靠堆小方块拼形状）：
//     v.scale          —— 整体等比缩放
//     v.extend_scale   —— 沿「拉伸轴」的伸缩量（做长条/平板的核心；0 会让矩阵奇异，需钳到极小值）
//     v.extend_xrot / v.extend_yrot —— 拉伸轴自身的两个角度（决定往哪个方向拉）
//     v.xrot / v.yrot / v.zrot —— 局部旋转（度）
//   语义（导出侧注释）：S = Ry(-ey)·Rx(ex)·Sz(es)·Rx(-ex)·Ry(ey) 作用在单位立方体上。
//   常见的「沿某轴拉长 N 倍」= extend_scale=N 并把拉伸轴对齐到该轴：
//     沿 X 拉长：ex=0, ey=90    沿 Y 拉长：ex=90(或-90), ey=0    沿 Z 拉长：ex=0, ey=0
//
//   引擎一次拉伸只能拉「一根轴」（单参数 extend_scale），所以这里给 AI 两种友好模式：
//   ①【长条/柱子模式】只给 sx/sy/sz —— 取最大轴为拉伸轴，extend_scale = 该轴倍数，
//      另外两轴保持 1（原始粗细）。例：sy:12 → 一根 12 格高的柱子。
//   ②【平面/薄板模式】给 w 与 h（两维尺寸）+ 可选 face —— 走引擎现成的 generateRectParams(a,b)
//      精确解，得到一个严格 w×h 的矩形面片（零厚度），再按 face 摆到对应朝向。
//      face: 'xz'(水平，默认) | 'xy'(竖直朝前) | 'yz'(竖直朝右)。
function aiIsNum(v) { return typeof v === 'number' && isFinite(v); }

// 把「沿拉伸轴的对齐角度」写进去
function aiSetStretchAxis(setV, axis) {
    if (axis === 'x') { setV('v.extend_xrot', 0); setV('v.extend_yrot', 90); }
    else if (axis === 'z') { setV('v.extend_xrot', 0); setV('v.extend_yrot', 0); }
    else { setV('v.extend_xrot', 90); setV('v.extend_yrot', 0); }
}

// spec:
//   x/y/z     位置（格）
//   sx/sy/sz  长条模式：按最大轴拉伸
//   w/h       平面模式：精确 w×h 矩形（与 generateRectParams 共用解）
//   face      'xz'|'xy'|'yz'（平面模式朝向，默认 xz）
//   rotx/roty/rotz  局部旋转（度）—— 在平面模式里作为「额外朝向微调」，加到解出的角度上
function aiApplyTransform(blk, spec) {
    if (!blk || !blk.scope || !blk.scope.vars) return false;
    if (!spec || typeof spec !== 'object') return false;
    const V = blk.scope.vars;
    const setV = (name, val) => {
        try { if (typeof blk.scope.setVarExpr === 'function') blk.scope.setVarExpr(name, String(round6(Number(val) || 0))); } catch (e) { }
    };
    const getV = (name) => { const d = V.get(name); return d ? Number(d.value) : null; };
    let touched = false;

    // —— 位置（格 → 世界）——
    if (aiIsNum(spec.x) || aiIsNum(spec.y) || aiIsNum(spec.z)) {
        const cx = aiIsNum(spec.x) ? spec.x : (getV('v.xpos') || 0) / AI_GRID_UNIT;
        const cy = aiIsNum(spec.y) ? spec.y : (getV('v.ypos') || 0) / AI_GRID_UNIT;
        const cz = aiIsNum(spec.z) ? spec.z : (getV('v.zpos') || 0) / AI_GRID_UNIT;
        const w = aiGridToWorld(cx, cy, cz);
        setV('v.xpos', w.x); setV('v.ypos', w.y); setV('v.zpos', w.z);
        touched = true;
    }

    // —— 模式②：平面 / 薄板（w × h）——
    const hasPlane = aiIsNum(spec.w) || aiIsNum(spec.h);
    if (hasPlane) {
        const a = aiIsNum(spec.w) ? Math.abs(spec.w) : 1;   // 第一边
        const b = aiIsNum(spec.h) ? Math.abs(spec.h) : 1;   // 第二边
        const p = generateRectParams(Math.max(a, 1e-3), Math.max(b, 1e-3));
        // generateRectParams 解出的是「躺在 XZ 平面、长边沿 X、宽边沿 Z」的矩形
        let xr = p.xrot, yr = 0, zr = p.zrot;
        const face = String(spec.face || 'xz').toLowerCase();
        if (face === 'xy') { yr = 90; }        // 竖直朝前（立起来，面朝 ±Z）
        else if (face === 'yz') { yr = 0; xr = p.xrot + 90; }  // 竖直朝右
        // 额外旋转微调
        if (aiIsNum(spec.rotx)) xr += spec.rotx;
        if (aiIsNum(spec.roty)) yr += spec.roty;
        if (aiIsNum(spec.rotz)) zr += spec.rotz;
        setV('v.scale', p.scale);
        setV('v.extend_scale', p.extend_scale);   // ≈0.0001（零厚度薄板）
        setV('v.extend_xrot', p.extend_xrot);
        setV('v.extend_yrot', p.extend_yrot);
        setV('v.xrot', xr); setV('v.yrot', yr); setV('v.zrot', zr);
        touched = true;
        if (touched) { try { blk.refresh(); } catch (e) { } }
        return true;
    }

    // —— 模式①：长条 / 柱子（sx/sy/sz，取最大轴拉伸）——
    const hasSize = aiIsNum(spec.sx) || aiIsNum(spec.sy) || aiIsNum(spec.sz);
    if (hasSize) {
        const sx = aiIsNum(spec.sx) ? Math.abs(spec.sx) : 1;
        const sy = aiIsNum(spec.sy) ? Math.abs(spec.sy) : 1;
        const sz = aiIsNum(spec.sz) ? Math.abs(spec.sz) : 1;
        let axis = 'y', mx = sy;
        if (sx >= sy && sx >= sz) { axis = 'x'; mx = sx; }
        else if (sz >= sx && sz >= sy) { axis = 'z'; mx = sz; }
        else { axis = 'y'; mx = sy; }
        setV('v.extend_scale', Math.max(mx, 1e-4));
        aiSetStretchAxis(setV, axis);
        touched = true;
    }

    // —— 局部旋转（长条模式下的额外旋转；平面模式下上面已加过）——
    if (aiIsNum(spec.rotx)) { setV('v.xrot', spec.rotx); touched = true; }
    if (aiIsNum(spec.roty)) { setV('v.yrot', spec.roty); touched = true; }
    if (aiIsNum(spec.rotz)) { setV('v.zrot', spec.rotz); touched = true; }

    if (touched) { try { blk.refresh(); } catch (e) { } }
    return touched;
}
window.aiApplyTransform = aiApplyTransform;

// ==================== AI 材质 / 旗帜 / 骨骼 / 形状 辅助内核 ====================
// ★★ 材质铁律：AI 只能用「用户能手动选到的真实材质」，绝不许自造贴图名。
//    合法来源 = TEX_LIB（910 张原版贴图）+ TEX_BLOCK_PRESETS（组合方块预设）+ 纯色 + 织布机旗帜。
//    AI 选材质前必须先 list_materials 查（或直接用已知的原版贴图名），查到什么用什么。

// 旗帜图案缩写 → 中文含义（UI 只用缩写，必须给 AI 一份对照，否则它不知道 cre/bl 是什么）
const AI_BANNER_PATTERNS = {
    no: '无图案（纯底色）', bl: '左底角三角', br: '右底角三角', tr: '左上角三角',
    bs: '底部条纹', rs: '右侧斜纹', ls: '左侧斜纹', cs: '居中竖条', ms: '居中斜条',
    dls: '左上斜条', drs: '右上斜条', ss: '细竖条纹', sc: '底部小三角',
    bt: '顶部三角', bts: '三角底边', rd: '菱形', mc: '半圆',
    mr: '方框边框', vhr: '左半竖条', hhb: '下半横条', gru: '上渐变',
    flo: '花朵', cre: '苦力怕脸', sku: '骷髅头', moj: 'Mojang 标志',
    glb: '地球', pig: '猪鼻'
};
const AI_BANNER_DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
    'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const AI_BANNER_DYE_ZH = { white: '白', orange: '橙', magenta: '品红', light_blue: '淡蓝', yellow: '黄', lime: '黄绿', pink: '粉红', gray: '灰', light_gray: '淡灰', cyan: '青', purple: '紫', blue: '蓝', brown: '棕', green: '绿', red: '红', black: '黑' };

// 把「贴图标识」解析成真实存在的贴图文件名。支持：文件名(oak_planks.png) / 中文名(橡木木板) / 去掉扩展名(oak_planks)。
// 解析失败返回 null —— 调用方必须报错，绝不落一个自造的名字。
function aiResolveTex(name) {
    if (!name) return null;
    const raw = String(name).trim();
    if (!raw) return null;
    // 直接是文件名
    if (TEX_NAME_MAP && TEX_NAME_MAP.has(raw)) return raw;
    // 中文名
    if (TEX_BY_NAME && TEX_BY_NAME.has(raw)) return TEX_BY_NAME.get(raw);
    // 补 .png 再试
    const withPng = raw.toLowerCase().endsWith('.png') ? raw : raw + '.png';
    if (TEX_NAME_MAP && TEX_NAME_MAP.has(withPng)) return withPng;
    // 去 .png 后按文件名匹配
    const noExt = raw.replace(/\.png$/i, '');
    if (TEX_LIB) {
        const hit = TEX_LIB.find(e => e[0] === noExt + '.png');
        if (hit) return hit[0];
    }
    // 模糊：中文名包含
    if (TEX_LIB) {
        const hit = TEX_LIB.find(e => e[1] === raw || e[1].includes(raw));
        if (hit) return hit[0];
    }
    return null;
}
// 贴图是否允许用在该方块类型上（复刻 MODEL_REGISTRY 的类别白名单；modelAcceptsCategory 是材料面板 IIFE 内的局部函数，模块作用域取不到）
function aiTexAllowedOnType(file, type) {
    const cat = (TEX_CAT_MAP && TEX_CAT_MAP.get(file)) || null;
    if (!cat) return false;
    try { if (typeof isTexDisabled === 'function' && isTexDisabled(file)) return false; } catch (e) { }
    const def = MODEL_REGISTRY[type] || {};
    const cats = def.materialCategories === undefined ? ((typeof MM_DEFAULT_CATS !== 'undefined' ? MM_DEFAULT_CATS : []) || []).slice() : def.materialCategories.slice();
    if (cats.includes(cat)) return true;
    if (def.extraCats && def.extraCats.includes(cat)) return true;
    return false;
}
// 只输出给 AI 的紧凑材质清单（按分类分组，带中文名；含总张数）
function aiListMaterials(cat, keyword) {
    const kw = keyword ? String(keyword).trim().toLowerCase() : '';
    let arr = (TEX_LIB || []).filter(e => {
        const file = e[0], zh = e[1], c = e[2];
        if (cat && c !== cat) return false;
        if (kw && !(file.toLowerCase().includes(kw) || String(zh).toLowerCase().includes(kw))) return false;
        try { if (typeof isTexDisabled === 'function' && isTexDisabled(file)) return false; } catch (e) { }
        return true;
    });
    return arr.map(e => ({ file: e[0], name: e[1], cat: e[2] }));
}
window.aiResolveTex = aiResolveTex;
window.aiListMaterials = aiListMaterials;

// ==================== AI 工具执行 ====================

// 执行一次工具调用，返回 {ok, summary} —— summary 会作为「AI 操作」日志展示并可回给模型
function aiRunTool(name, args) {
    args = args || {};
    try {
        if (name === 'ask_user') {
            const qs = Array.isArray(args.questions) ? args.questions.slice(0, 4) : [];
            const askData = [];
            const lines = qs.map((it, i) => {
                const q = typeof it === 'string' ? it : String((it && it.q) || '').trim();
                if (!q) return '';
                // 候选项：统一成 [{label, note}]（字符串也接受）
                const rawOpts = (it && Array.isArray(it.options)) ? it.options : [];
                const opts = [];
                rawOpts.forEach(o => {
                    let label, note = '';
                    if (o && typeof o === 'object') { label = String(o.label || o.text || o.name || '').trim(); note = String(o.note || o.desc || '').trim(); }
                    else {
                        // 字符串形态：尝试拆「主标签（说明）」→ 分成 label + note
                        const str = String(o == null ? '' : o).trim();
                        const mm = str.match(/^([^（(]+)[（(]([^）)]*)[）)]\s*$/);
                        if (mm) { label = mm[1].trim(); note = mm[2].trim(); } else label = str;
                    }
                    if (label && !opts.some(x => x.label === label)) opts.push({ label, note });
                });
                // 单选 / 多选：显式 multi 优先；否则看问题里是否含多选语义关键词
                const multi = (it && typeof it.multi === 'boolean') ? it.multi
                    : /多选|哪些|都有哪些|列出|可以选多个|可多选|all that|multiple/i.test(q);
                askData.push({ q, options: opts, multi });
                const optTxt = opts.length ? '（可选：' + opts.map(o => o.note ? `${o.label}（${o.note}）` : o.label).join(' / ') + '）' : '';
                return `${i + 1}. ${q}${optTxt}`;
            }).filter(Boolean);
            if (!askData.length) return { ok: false, summary: 'ask_user 没有收到问题' };
            return { ok: true, summary: '', ask: lines.join('\n'), askData };
        }
        if (name === 'get_scene') {
            const list = blocks.map(b => {
                const g = b.scope.vars.get('v.xpos'), gy = b.scope.vars.get('v.ypos'), gz = b.scope.vars.get('v.zpos');
                return {
                    name: b.id,
                    type: b.type || 'cube',
                    x: g ? Number(g.value) : 0, y: gy ? Number(gy.value) : 0, z: gz ? Number(gz.value) : 0,
                    hasProgram: !!b.scope.program
                };
            });
            return { ok: true, summary: `读取场景：共 ${list.length} 个方块`, data: list };
        }
        if (name === 'clear_scene') {
            const n = blocks.length;
            flushPendingRecords && flushPendingRecords();
            restoreState({ blocks: [], globalVars: [], keyframes: [] });
            history.record(getState());
            if (isNewLayoutMode) renderSideBlockList();
            return { ok: true, summary: `已清空场景（移除 ${n} 个方块）` };
        }
        if (name === 'add_blocks') {
            const arr = Array.isArray(args.blocks) ? args.blocks : [];
            if (!arr.length) return { ok: false, summary: 'add_blocks 没有收到任何方块' };
            flushPendingRecords && flushPendingRecords();
            const made = [];
            let usedTransform = false;
            arr.forEach((spec, i) => {
                if (!spec || typeof spec !== 'object') return;
                // 名字唯一化：AI 可能重名，自动加后缀避让
                let id = String(spec.name || ('ai_block' + (i + 1))).trim() || ('ai_block' + (i + 1));
                if (blocks.some(b => b.id === id)) {
                    let k = 1; const base = id;
                    while (blocks.some(b => b.id === id)) id = base + '_' + (k++);
                }
                const t = ['cube', 'halfbrick', 'stair', 'flag'].indexOf(spec.type) >= 0 ? spec.type : 'cube';
                const M = [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0];
                let blk;
                try { blk = new Block(id, M, null, spec.color || '#aaccff', t, selectedFolder || null); }
                catch (e) { return; }
                const w = aiGridToWorld(spec.x, spec.y, spec.z);
                // 写入位置变量（xpos/ypos/zpos 是本项目位置的标准变量名）
                try {
                    blk.scope.setVarExpr('v.xpos', String(_r4(w.x)));
                    blk.scope.setVarExpr('v.ypos', String(_r4(w.y)));
                    blk.scope.setVarExpr('v.zpos', String(_r4(w.z)));
                } catch (e) { }
                // ★ 拉伸 / 旋转：AI 现在可以直接给尺寸与角度，不用堆小方块拼形状
                //   长条模式 sx/sy/sz；平板模式 w/h(+face)；两者都支持 rotx/roty/rotz 微调
                const hasExt = aiIsNum(spec.sx) || aiIsNum(spec.sy) || aiIsNum(spec.sz);
                const hasPlane = aiIsNum(spec.w) || aiIsNum(spec.h);
                const hasRot = aiIsNum(spec.rotx) || aiIsNum(spec.roty) || aiIsNum(spec.rotz);
                if (hasExt || hasPlane || hasRot) {
                    aiApplyTransform(blk, {
                        sx: spec.sx, sy: spec.sy, sz: spec.sz,
                        w: spec.w, h: spec.h, face: spec.face,
                        rotx: spec.rotx, roty: spec.roty, rotz: spec.rotz
                    });
                    usedTransform = true;
                }
                if (spec.program) { blk.scope.program = String(spec.program); blk.scope.molangMode = true; }
                addBlock(blk, false, false);
                blk.refresh();
                made.push(id);
            });
            history.record(getState());
            if (!made.length) return { ok: false, summary: 'add_blocks 未能创建任何方块（参数可能不合法）' };
            return { ok: true, summary: `创建了 ${made.length} 个方块：${made.join('、')}${usedTransform ? '（含拉伸/旋转）' : ''}` };
        }
        if (name === 'set_transform') {
            const arr = Array.isArray(args.items) ? args.items : (Array.isArray(args.blocks) ? args.blocks : []);
            if (!arr.length) return { ok: false, summary: 'set_transform 没有收到任何方块' };
            flushPendingRecords && flushPendingRecords();
            const done = [], miss = [];
            arr.forEach(spec => {
                if (!spec || typeof spec !== 'object') return;
                const id = String(spec.name || '').trim();
                const blk = blocks.find(b => b.id === id);
                if (!blk) { miss.push(id); return; }
                if (aiApplyTransform(blk, spec)) done.push(id);
            });
            if (done.length) {
                blocks.forEach(b => { try { b.refresh(); } catch (e) { } });
                history.record(getState());
                if (isNewLayoutMode) renderSideBlockList();
            }
            const parts = [];
            if (done.length) parts.push(`已调整 ${done.length} 个方块的拉伸/旋转：${done.join('、')}`);
            if (miss.length) parts.push(`未找到：${miss.join('、')}`);
            return { ok: done.length > 0, summary: parts.join('；') || 'set_transform 未产生改动' };
        }
        if (name === 'set_program') {
            const id = String(args.name || '').trim();
            const blk = blocks.find(b => b.id === id);
            if (!blk) return { ok: false, summary: `set_program：找不到名为「${id}」的方块` };
            flushPendingRecords && flushPendingRecords();
            blk.scope.program = String(args.program || '');
            blk.scope.molangMode = true;
            blk.scope.molangEditedByUser = true;
            try { blk.refresh(); } catch (e) { }
            blocks.forEach(b => { try { b.refresh(); } catch (e) { } });
            history.record(getState());
            if (isNewLayoutMode) renderSideBlockList();
            return { ok: true, summary: `已为「${id}」写入 molang 程序（${(args.program || '').split('\n').filter(Boolean).length} 行）` };
        }
        if (name === 'list_materials') {
            const cat = args.category ? String(args.category).trim() : '';
            const kw = args.keyword ? String(args.keyword).trim() : '';
            const list = aiListMaterials(cat, kw);
            if (!list.length) {
                const cats = (TEX_CATS || []).map(c => `${c.id}(${c.n})`).join('、');
                return { ok: false, summary: `没有匹配的材质。可用分类：${cats}` };
            }
            const cap = list.slice(0, 80);
            const lines = cap.map(m => `${m.file} = ${m.name}`).join('\n');
            const more = list.length > cap.length ? `\n……共 ${list.length} 个，已列前 ${cap.length} 个，可加 keyword 缩小范围。` : `\n共 ${list.length} 个。`;
            return { ok: true, summary: `材质清单（${cat || '全部'}${kw ? ' 关键词:' + kw : ''}）：\n` + lines + more };
        }
        if (name === 'apply_material') {
            const arr = Array.isArray(args.items) ? args.items : [];
            if (!arr.length) return { ok: false, summary: 'apply_material 没有收到任何方块' };
            flushPendingRecords && flushPendingRecords();
            const done = [], miss = [], bad = [];
            arr.forEach(spec => {
                if (!spec || typeof spec !== 'object') return;
                const id = String(spec.name || '').trim();
                const blk = blocks.find(b => b.id === id);
                if (!blk) { miss.push(id); return; }
                try {
                    if (spec.preset) {
                        const p = (TEX_BLOCK_PRESETS || []).find(x => x[0] === String(spec.preset).trim());
                        if (!p) { bad.push(`${id}(预设不存在:${spec.preset})`); return; }
                        blk.applyBlockPreset(p[0]);
                        done.push(`${id}←预设:${p[1]}`);
                    } else if (spec.tex) {
                        const file = aiResolveTex(spec.tex);
                        if (!file) { bad.push(`${id}(贴图不存在:${spec.tex})`); return; }
                        if (!aiTexAllowedOnType(file, blk.type)) { bad.push(`${id}(${blk.type} 不支持 ${file} 所在分类)`); return; }
                        blk.loadTexture(texUrl(file), texDisplayName ? texDisplayName(file) : file);
                        done.push(`${id}←${texDisplayName ? texDisplayName(file) : file}`);
                    } else if (spec.color) {
                        blk.setSolidColor(String(spec.color).trim());
                        done.push(`${id}←色:${spec.color}`);
                    } else { bad.push(`${id}(未给 tex/preset/color)`); }
                } catch (e) { bad.push(`${id}(${(e && e.message) || e})`); }
            });
            if (done.length) { blocks.forEach(b => { try { b.refresh(); } catch (e) { } }); history.record(getState()); if (isNewLayoutMode) renderSideBlockList(); }
            const parts = [];
            if (done.length) parts.push(`已换材质 ${done.length} 个：${done.join('、')}`);
            if (miss.length) parts.push(`未找到：${miss.join('、')}`);
            if (bad.length) parts.push(`跳过：${bad.join('、')}（材质名必须是 list_materials 返回过的真实贴图）`);
            return { ok: done.length > 0, summary: parts.join('；') || 'apply_material 未产生改动' };
        }
        if (name === 'make_banner') {
            const id = String(args.name || '').trim();
            if (!id) return { ok: false, summary: 'make_banner 需要一个 name' };
            flushPendingRecords && flushPendingRecords();
            let bannerId = id;
            if (blocks.some(b => b.id === bannerId)) { let k = 1; const base = id; while (blocks.some(b => b.id === bannerId)) bannerId = base + '_' + (k++); }
            const baseIdx = Math.max(0, AI_BANNER_DYES.indexOf(String(args.base || 'white').trim()));
            const layers = (Array.isArray(args.layers) ? args.layers : []).slice(0, 6).map(l => ({
                pat: String((l && l.pat) || 'no').trim(),
                dye: Math.max(0, AI_BANNER_DYES.indexOf(String((l && l.dye) || 'white').trim()))
            })).filter(l => LOOM_TEX[l.pat]);
            const M = [0, 0, 0, 0, 0, 0, 1, 1, -90, 0, 0, 0, 0];
            let blk;
            try { blk = new Block(bannerId, M, null, '#dddddd', 'flag', selectedFolder || null); }
            catch (e) { return { ok: false, summary: `make_banner 创建失败：${(e && e.message) || e}` }; }
            const w = aiGridToWorld(args.x, args.y, args.z);
            try {
                blk.scope.setVarExpr('v.xpos', String(_r4(w.x)));
                blk.scope.setVarExpr('v.ypos', String(_r4(w.y)));
                blk.scope.setVarExpr('v.zpos', String(_r4(w.z)));
            } catch (e) { }
            addBlock(blk, false, false);
            try {
                const canvas = loomTextureCanvas({ baseDye: baseIdx, layers: layers, activeLayer: -1 });
                // ★与织布机面板同一口径（2026-10-18 r36）：配方以紧凑文本记在方块上，
                //   导出即输出生成器代码而不是内嵌 base64。
                const bUrl = canvas.toDataURL('image/png');
                blk.loomCode = loomRecipeToCode({ baseDye: baseIdx, layers: layers });
                blk.loomUrl = bUrl;
                blk.loadTexture(bUrl, '旗帜');
            } catch (e) { }
            if (aiIsNum(args.rotx) || aiIsNum(args.roty) || aiIsNum(args.rotz)) {
                aiApplyTransform(blk, { rotx: args.rotx, roty: args.roty, rotz: args.rotz });
            }
            blk.refresh();
            history.record(getState());
            if (isNewLayoutMode) renderSideBlockList();
            const desc = layers.length ? layers.map(l => `${AI_BANNER_PATTERNS[l.pat] || l.pat}/${AI_BANNER_DYE_ZH[AI_BANNER_DYES[l.dye]] || l.dye}`).join('+') : '纯底色';
            return { ok: true, summary: `已生成旗帜「${bannerId}」：底色${AI_BANNER_DYE_ZH[AI_BANNER_DYES[baseIdx]] || args.base} + ${desc}` };
        }
        if (name === 'make_shape') {
            const id = String(args.name || '').trim();
            if (!id) return { ok: false, summary: 'make_shape 需要一个 name' };
            const a = Number(args.a), b = Number(args.b);
            if (!aiIsNum(a) || !aiIsNum(b) || a <= 0 || b <= 0) return { ok: false, summary: 'make_shape 需要正数 a/b 边长' };
            flushPendingRecords && flushPendingRecords();
            let shapeId = id;
            if (blocks.some(b => b.id === shapeId)) { let k = 1; const base = id; while (blocks.some(b => b.id === shapeId)) shapeId = base + '_' + (k++); }
            const M = [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0];
            let blk;
            try { blk = new Block(shapeId, M, null, args.color || '#aaccff', 'cube', selectedFolder || null); }
            catch (e) { return { ok: false, summary: `make_shape 创建失败：${(e && e.message) || e}` }; }
            const w = aiGridToWorld(args.x, args.y, args.z);
            try {
                blk.scope.setVarExpr('v.xpos', String(_r4(w.x)));
                blk.scope.setVarExpr('v.ypos', String(_r4(w.y)));
                blk.scope.setVarExpr('v.zpos', String(_r4(w.z)));
            } catch (e) { }
            addBlock(blk, false, false);
            // 精确平行四边形解（两边一角）
            try {
                const p = generatePlaneParams(Math.max(a, 1e-3), Math.max(b, 1e-3), aiIsNum(Number(args.angle)) ? Number(args.angle) : 90);
                const setV = (n, v) => { try { blk.scope.setVarExpr(n, String(round6(Number(v) || 0))); } catch (e) { } };
                setV('v.scale', p.scale); setV('v.extend_scale', p.extend_scale);
                setV('v.extend_xrot', p.extend_xrot); setV('v.extend_yrot', p.extend_yrot);
                setV('v.xrot', p.xrot); setV('v.yrot', p.yrot); setV('v.zrot', p.zrot);
            } catch (e) { }
            if (args.tex) {
                const file = aiResolveTex(args.tex);
                if (file) { try { blk.loadTexture(texUrl(file), texDisplayName ? texDisplayName(file) : file); } catch (e) { } }
            }
            blk.refresh();
            history.record(getState());
            if (isNewLayoutMode) renderSideBlockList();
            return { ok: true, summary: `已生成面片「${shapeId}」：${a}×${b}${aiIsNum(Number(args.angle)) ? ' 夹角' + Number(args.angle) + '°' : ' 矩形'}` };
        }
        if (name === 'create_folder') {
            const fname = String(args.folder || '').trim();
            if (!fname) return { ok: false, summary: 'create_folder 需要 folder 名称' };
            flushPendingRecords && flushPendingRecords();
            if (!getFolder(fname)) { try { createFolder(fname, null); } catch (e) { return { ok: false, summary: `创建文件夹失败：${(e && e.message) || e}` }; } }
            let moved = null;
            if (args.block) {
                const blk = blocks.find(b => b.id === String(args.block).trim());
                if (blk) { try { blk.group = fname; moved = blk.id; } catch (e) { } }
            }
            // 指定骨干（不指定则取文件夹内第一块）
            let bbId = args.backbone ? String(args.backbone).trim() : null;
            const inFolder = blocks.filter(b => (b.group || null) === fname);
            if (!bbId && inFolder.length) bbId = inFolder[0].id;
            if (bbId) {
                const bb = blocks.find(b => b.id === bbId);
                if (bb) { try { designateFolderBackbone(fname, bb.id, true, true); } catch (e) { } }
            }
            blocks.forEach(b => { try { b.refresh(); } catch (e) { } });
            history.record(getState());
            if (isNewLayoutMode) renderSideBlockList();
            return { ok: true, summary: `已创建文件夹「${fname}」${moved ? `，放入 ${moved}` : ''}${bbId ? `，骨干=${bbId}` : '（暂无方块作为骨干）'}` };
        }
        if (name === 'bind_bone') {
            const childId = String(args.child || '').trim();
            const child = blocks.find(b => b.id === childId);
            if (!child) return { ok: false, summary: `bind_bone：找不到子方块「${childId}」` };
            flushPendingRecords && flushPendingRecords();
            if (args.unbind) {
                try { unbindBone(child); } catch (e) { return { ok: false, summary: `解绑失败：${(e && e.message) || e}` }; }
                blocks.forEach(b => { try { b.refresh(); } catch (e) { } });
                history.record(getState());
                if (isNewLayoutMode) renderSideBlockList();
                return { ok: true, summary: `已解绑「${childId}」的骨骼关系` };
            }
            const parentId = String(args.parent || '').trim();
            const parent = blocks.find(b => b.id === parentId);
            if (!parent) return { ok: false, summary: `bind_bone：找不到父方块「${parentId}」` };
            if (parent.id === child.id) return { ok: false, summary: 'bind_bone：父块与子块不能是同一个' };
            // 防成环：父块不能是子块的后代
            let p = parent, guard = 0;
            while (p && guard++ < 64) {
                if (p.id === child.id) return { ok: false, summary: 'bind_bone：会形成循环引用（该父块已在子块的下游）' };
                const pid = (typeof getBoneParentId === 'function') ? getBoneParentId(p) : (p._boneParent || null);
                p = pid ? blocks.find(b => b.id === pid) : null;
            }
            try { bindBone(child, parent, false, false, false, true); } catch (e) { return { ok: false, summary: `骨骼绑定失败：${(e && e.message) || e}` }; }
            blocks.forEach(b => { try { b.refresh(); } catch (e) { } });
            history.record(getState());
            if (isNewLayoutMode) renderSideBlockList();
            return { ok: true, summary: `已把「${childId}」绑到父块「${parentId}」：子块现在会跟随父块运动` };
        }
        return { ok: false, summary: `未知工具：${name}` };
    } catch (e) {
        return { ok: false, summary: `工具 ${name} 执行失败：${(e && e.message) || e}` };
    }
}

// 从模型回复里兜底抽取工具调用（有些兼容端点把 tool_calls 塞在文本里，或模型直接吐 JSON）
function aiExtractFallbackToolCall(text) {
    if (!text) return null;
    // 形如 {"name":"add_blocks","arguments":{...}} 或 {"tool":"add_blocks","args":{...}}
    const s = String(text);
    const m = s.match(/\{[\s\S]*"(?:name|tool)"\s*:\s*"(add_blocks|set_transform|set_program|list_materials|apply_material|make_banner|make_shape|create_folder|bind_bone|clear_scene|get_scene|ask_user)"[\s\S]*\}/);
    if (!m) return null;
    try {
        const obj = JSON.parse(m[0]);
        const nm = obj.name || obj.tool;
        const a = obj.arguments || obj.args || obj.parameters || {};
        return { name: nm, args: typeof a === 'string' ? JSON.parse(a) : a };
    } catch (e) { return null; }
}

// 展示前把 markdown 代码围栏去掉（模型若仍吐代码块，展示成普通文本避免误导）
function aiStripCodeFenceForDisplay(t) {
    return String(t || '').replace(/```[a-zA-Z]*\n?/g, '').trim();
}

// 一次带工具能力的对话往返：返回 {content, toolCalls}
// opts.images：本轮的参考图 [{dataUrl}]，会拼成 OpenAI 兼容的多模态 content 数组（仅云端视觉模型用得上）
async function aiChatCompleteWithTools(svc, messages, useTools, opts) {
    const url = String(svc.baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (svc.apiKey) headers['Authorization'] = 'Bearer ' + svc.apiKey;
    const imgs = (opts && Array.isArray(opts.images)) ? opts.images : [];
    let msgs = messages;
    if (imgs.length) {
        // 把最后一条 user 消息改成多模态：先文字、再若干图片
        msgs = messages.map(m => ({ ...m }));
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'user') {
                const t = String(msgs[i].content || '');
                msgs[i].content = [{ type: 'text', text: t || '请参考这些图片建模。' }]
                    .concat(imgs.map(im => ({ type: 'image_url', image_url: { url: im.dataUrl } })));
                break;
            }
        }
        if (!msgs.some(m => Array.isArray(m.content))) {
            msgs.push({ role: 'user', content: [{ type: 'text', text: '请参考这些图片建模。' }]
                .concat(imgs.map(im => ({ type: 'image_url', image_url: { url: im.dataUrl } }))) });
        }
    }
    const body = { model: svc.model, messages: msgs, stream: false };
    if (useTools) { body.tools = aiToolDefs(); body.tool_choice = 'auto'; }
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) { } }, 90000);
    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
        clearTimeout(timer);
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            const e = new Error(`HTTP ${res.status}${t ? ' · ' + t.slice(0, 200) : ''}`);
            e.httpStatus = res.status;
            throw e;
        }
        const data = await res.json();
        const choice = (data && data.choices && data.choices[0]) || {};
        const msg = choice.message || {};
        const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        let content = msg.content || choice.text || '';
        // 多模态模型可能把正文放进数组里
        if (Array.isArray(content)) content = content.map(c => (c && (c.text || c.content)) || '').join('');
        return { content, toolCalls, raw: data };
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

async function aiChatSend() {
    if (aiChatBusy) return;
    const input = aiChatPanelEl.querySelector('#aiChatInput');
    const text = (input.value || '').trim();
    if (!text) return;
    const svc = aiActiveService();
    if (!aiServices.length) { aiChatPush('err', '尚未配置任何 AI 服务，请先点右上角齿轮添加。'); return; }
    if (!svc) { aiChatPush('err', '未选择当前服务，请在 AI 服务设置中「设为默认」。'); return; }
    if (!svc.baseUrl || !svc.model) { aiChatPush('err', `服务「${svc.name}」缺少接入地址或模型名称，请补全后再试。`); return; }

    input.value = ''; input.style.height = '38px';
    const imgs = aiChatImage.slice();
    aiChatPush('user', text + (imgs.length ? `\n[已附带 ${imgs.length} 张参考图]` : ''));
    aiChatImage = []; aiChatRenderImages();
    aiChatBusy = true;
    aiChatMarkTurnStart();   // 记录本轮起点，供「撤销本次操作」精确回退
    const sendBtn = aiChatPanelEl.querySelector('#aiChatSendBtn');
    if (sendBtn) sendBtn.disabled = true;
    aiChatPush('op', `调用 ${svc.name}（${svc.type === 'local' ? '本地' : '云端'}）· 模型 ${svc.model} …`);

    const messages = [{ role: 'system', content: AI_TOOLS_DESC }];
    // 场景现状一并告知，AI 才能正确避让 / 修改已有方块
    try {
        const scene = aiRunTool('get_scene', {});
        messages.push({ role: 'system', content: `当前场景：${JSON.stringify(scene.data || [])}` });
    } catch (e) { }
    aiChatLog.filter(m => m.role === 'user' || m.role === 'assistant').slice(-16)
        .forEach(m => messages.push({ role: m.role, content: aiChatHistoryContent(m) }));

    try {
        let useTools = true;              // 首次尝试原生工具调用
        let guard = 0;
        let asked = null;                 // 本轮若 AI 提问，则记住问题文本（避免重复追问同一批）
        while (guard++ < 4) {
            let resp;
            try {
                resp = await aiChatCompleteWithTools(svc, messages, useTools, { images: guard === 1 ? imgs : null });
            } catch (e) {
                // 服务端不支持 tools 参数（部分兼容端点会 400）→ 降级为纯文本模式重试一次
                if (useTools && e && (e.httpStatus === 400 || e.httpStatus === 404 || e.httpStatus === 422)) {
                    useTools = false; guard--;
                    aiChatPush('op', '该服务不支持原生工具调用，已切换为「文本指令」模式（AI 会在回复里给出结构化指令）。');
                    continue;
                }
                throw e;
            }

            // 情况 A：原生 tool_calls
            if (resp.toolCalls && resp.toolCalls.length) {
                messages.push({ role: 'assistant', content: resp.content || '', tool_calls: resp.toolCalls });
                let askedNow = null, askedOpts = null, askedData = null;
                for (const tc of resp.toolCalls) {
                    const fn = (tc && tc.function) || {};
                    let args = {};
                    try { args = fn.arguments ? (typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments) : {}; } catch (e) { args = {}; }
                    const r = aiRunTool(fn.name, args);
                    if (r.ask) { askedNow = r.ask; askedOpts = r.askOptions || null; askedData = r.askData || null; continue; }
                    aiChatPush('op', r.summary + (r.ok ? '' : ' ⚠'));
                    messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: r.ok, summary: r.summary }) });
                }
                if (askedNow) {
                    aiChatPushAsk(askedNow, askedOpts, askedData);
                    aiChatPush('op', '等待你回答后再继续。');
                    return;
                }
                continue;   // 让模型基于工具结果继续说
            }

            // 情况 B：纯文本回复 —— 尝试兜底抽取工具调用（模型把 JSON 写在正文里）
            const raw = resp.content || '';
            if (raw) {
                const fb = aiExtractFallbackToolCall(raw);
                if (fb) {
                    const r = aiRunTool(fb.name, fb.args || {});
                    if (r.ask) { aiChatPushAsk(r.ask, r.askOptions || null, r.askData || null); aiChatPush('op', '等待你回答后再继续。'); return; }
                    aiChatPush('op', r.summary + (r.ok ? '' : ' ⚠'));
                    messages.push({ role: 'assistant', content: raw });
                    messages.push({ role: 'user', content: `[系统] 已执行你的指令：${r.summary}。请用一句话确认结果，不要再输出代码块。` });
                    continue;
                }
                aiChatPush('assistant', aiStripCodeFenceForDisplay(raw));
                return;
            }
            break;
        }
        aiChatPush('assistant', '已完成上述操作。如果还需要调整，继续告诉我。');
    } catch (e) {
        const st = e && e.httpStatus;
        let msg;
        if (st === 401 || st === 403) msg = 'API Key 无效或无权限，请到「AI 服务」里检查密钥。';
        else if ((e && e.name) === 'AbortError') msg = '请求超时（90s 无响应），请检查服务是否可达。';
        else if (/Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message))) {
            msg = svc.type === 'local'
                ? '无法连接本地服务，请确认它已启动、地址与端口正确。'
                : '浏览器直连被 CORS 拦截或服务不可达。云端服务建议改走服务端代理；也可确认 Base URL 是否正确。';
        } else msg = String((e && e.message) || e);
        aiChatPush('err', msg);
    } finally {
        aiChatBusy = false;
        if (sendBtn) sendBtn.disabled = false;
        // ★ 操作结束后主动释放输入框焦点：否则焦点一直留在 #aiChatInput，
        //   后续 Ctrl+Z / Delete 等全局快捷键会被 isEditable 判定拦下（AI 操作撤不掉）。
        //   用户想继续输入时点一下输入框即可，成本远低于「快捷键静默失效」。
        try {
            const ae = document.activeElement;
            if (ae && ae.id === 'aiChatInput' && !(ae.value || '').length) ae.blur();
        } catch (e) { }
        aiChatUpdateHeader();
    }
}

aiChatLoad();
aiChatUpdateHeader();
// 顶栏 AI 按钮已移除：AI 入口统一收在「设置 → 🛠 开发者工具」内（AI 对话 / AI 服务设置）。
// 这里不再绑定任何 UI，保留函数名仅为可读性。
(function bindAiChatEntry() { /* no-op：入口已并入开发者工具 */ })();


// 主题与灰度控件行为
let isLightMode = true;
let lightModeBgSet = false;
let lightsReady = false; // 场景灯光是否已创建（applyTheme 据此决定是否设置光强）
const themeCheckbox = document.getElementById('themeToggleCheckbox');
const grayscaleRange = document.getElementById('grayscaleRange');
const grayscaleLabel = document.getElementById('grayscaleValueLabel');

