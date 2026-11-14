/* 04-import-export/01-var-deps-and-mcstructure-export.js · 源 测试版v.6b79.html 第 17411-18382 行 */
'use strict';
// ==================== 导出后缀自动附带 id 标签（09-29） ====================
// 用户只需在「后缀」输入框里写自定义文本；"方块编号：{id}" 始终在导出时自动附加在末尾，
// 保证重新导入能识别方块身份（见导入防呆 09-28）。输入框不再显示该标签，也不再做任何警告/强制。
// ★★【引号配对铁律（2026-10-01 定稿：单引号标签）】
//   载荷整体被 exportPrefix 末尾的 " 与本函数补的 " 包成【一对】双引号命令参数；
//   ★内部标签一律用【单引号】'方块编号：xxx'; —— 单引号串是合法 Molang 字符串字面量、
//   独立成句被求值器忽略（等效注释），且绝不与外层双引号冲突（内置预设一直这么写、已验证）；
//   ★内部绝不能再用双引号（会提前闭合命令字符串 → 整条指令失效）；v.fmbe= 赋值也不合法（数值域）。
function effectiveExportSuffix(custom, skipIdTag) {
    const s = (custom || '').trim();
    // 自定义文本在前（若有），'方块编号：{id}' 单引号标签收尾，最后补上关闭引号（载荷整体被外层双引号包住，内部标签只能用单引号，否则会提前闭合命令字符串）。
    const idTag = molangTag(`'方块编号：{id}';`);            // → 单引号注释标签（正确形态）
    // ★【双倍后缀去重 2026-10-18】skipIdTag=true 时调用方载荷（关键帧文本 getKeyframeCommandText /
    //   getBoneFolderKeyframeCommandText 在 !forMolangProgram 分支）已自带 '方块编号：<id>'; 标签，
    //   这里必须【不再自动附加】，否则同一条指令末尾会出现两份「方块编号」标签（用户报：关键帧方块导出双倍后缀）。
    //   此时用户后缀里若也手写了标签，一并剥离，只留真正的自定义文本 + 收尾引号。
    if (skipIdTag && s.includes('方块编号：')) {
        let inner = s.replace(/"\s*$/, '').trim();
        inner = inner.replace(/"([^"]*方块编号：[^"]*)"/g, "'$1'");
        inner = inner.replace(/'[^']*方块编号：[^']*';\s*/g, '').trim();
        return (inner ? inner + ' ' : '') + '"';
    }
    if (s.includes('方块编号：')) {
        // 兼容：旧存档/手动已含标签 → 剥掉收尾关闭引号，标签统一重归为【单引号】形态（双引号会提前闭合命令字符串）
        let inner = s.replace(/"\s*$/, '').trim();
        inner = inner.replace(/"([^"]*方块编号：[^"]*)"/g, "'$1'");
        if (!/;\s*$/.test(inner)) inner += ';';
        return inner + ' "';
    }
    // 无自定义标签：默认自动附加 id 标签；skipIdTag 时载荷已自带，不再重复附加（见上方去重说明）。
    return (s ? s + ' ' : '') + (skipIdTag ? '' : idTag) + '"';
}
// ==================== 变量依赖排序与命令生成（修复依赖顺序） ====================
// 获取一个方块的所有可导出变量（局部变量 + 该方块创建的全局变量）
function getExportableVariables(block) {
    // ★2026-11-10 跳过「动画层自有变量」：它们由某个动画控制器正文赋值（IK 求解中间量 / 跟随 pR 矩阵…），
    //   base 再导出一次等于把整段函数正文抄进 base 指令（旧格式的病根）。
    const _layerOwned = (typeof animLayerOwnedVars === 'function') ? animLayerOwnedVars(block) : null;
    const localEntries = Array.from(block.scope.vars.entries())
        .filter(([name]) => !(_layerOwned && _layerOwned.has(name)))
        .map(([name, def]) => ({
            name: name,           // 例如 "v.xpos"
            def: def,
            type: 'local'
        }));
    const globalEntries = Array.from(globalVars.entries())
        .filter(([_, g]) => g.sourceBlockId === block.id)
        .map(([key, g]) => ({
            name: `t.${key}`,
            def: g.def,
            type: 'global'
        }));
    return [...localEntries, ...globalEntries];
}

// 从表达式中提取依赖的变量名（仅限 v.xxx 或 t.xxx）
function extractDependencies(expr, allVarNames) {
    const deps = new Set();
    const regex = /(?:v|t)\.[a-zA-Z_][a-zA-Z0-9_]*/g;
    let match;
    while ((match = regex.exec(expr)) !== null) {
        const depName = match[0];
        if (allVarNames.has(depName)) {
            deps.add(depName);
        }
    }
    return deps;
}

// 拓扑排序变量，确保依赖的变量出现在前面
function topologicalSortVariables(variables) {
    const nodeMap = new Map(); // name -> { def, type, expr, deps }
    const allNames = new Set(variables.map(v => v.name));
    
    for (const v of variables) {
        const expr = v.def.expr;
        const deps = extractDependencies(expr, allNames);
        nodeMap.set(v.name, {
            def: v.def,
            type: v.type,
            expr: expr,
            deps: deps
        });
    }
    
    // Kahn 算法
    const inDegree = new Map();
    const graph = new Map(); // 被依赖者 -> 依赖者列表
    for (const [name, node] of nodeMap.entries()) {
        inDegree.set(name, 0);
        graph.set(name, []);
    }
    for (const [name, node] of nodeMap.entries()) {
        for (const dep of node.deps) {
            if (nodeMap.has(dep)) {
                inDegree.set(name, (inDegree.get(name) || 0) + 1);
                graph.get(dep).push(name);
            }
        }
    }
    
    const queue = [];
    for (const [name, deg] of inDegree.entries()) {
        if (deg === 0) queue.push(name);
    }
    const sorted = [];
    while (queue.length) {
        const curr = queue.shift();
        sorted.push(curr);
        for (const next of graph.get(curr)) {
            inDegree.set(next, inDegree.get(next) - 1);
            if (inDegree.get(next) === 0) {
                queue.push(next);
            }
        }
    }
    
    // 如果有环，把剩余未排序的节点追加到末尾（维持原有顺序尽可能）
    const remaining = [];
    for (const [name, deg] of inDegree.entries()) {
        if (deg > 0 && !sorted.includes(name)) {
            remaining.push(name);
        }
    }
    // 按原始顺序追加剩余节点
    for (const v of variables) {
        if (remaining.includes(v.name) && !sorted.includes(v.name)) {
            sorted.push(v.name);
        }
    }
    
    // 返回排序后的变量对象数组
    const sortedVars = [];
    for (const name of sorted) {
        const original = variables.find(v => v.name === name);
        if (original) sortedVars.push(original);
    }
    return sortedVars;
}

// 为单个方块生成排序后的赋值语句字符串（不包括额外标记）
const shortVarNames = {
    'v.xpos': 'v.xp', 'v.ypos': 'v.yp', 'v.zpos': 'v.zp',
    'v.xbasepos': 'v.xb', 'v.ybasepos': 'v.yb', 'v.zbasepos': 'v.zb',
    'v.extend_scale': 'v.es', 'v.extend_xrot': 'v.ex', 'v.extend_yrot': 'v.ey',
    'v.xrot': 'v.xr', 'v.yrot': 'v.yr', 'v.zrot': 'v.zr',
    'v.rotatex': 'v.rx', 'v.rotatey': 'v.ry', 'v.rotatez': 'v.rz',
    'v.scale': 'v.s'
};

const reverseShortVarNames = Object.fromEntries(Object.entries(shortVarNames).map(([k, v]) => [v, k]));

function getOrderedAssignmentsString(block, useShortNames = false) {
    const variables = getExportableVariables(block);
    if (variables.length === 0) return '';
    const sorted = topologicalSortVariables(variables);
    const statements = [];
    for (const v of sorted) {
        let varName = v.name;
        if (useShortNames && shortVarNames[v.name]) {
            varName = shortVarNames[v.name];
        }
        let expr = v.def.expr;
        if (useShortNames) {
            Object.keys(shortVarNames).forEach(longName => {
                const shortName = shortVarNames[longName];
                const regex = new RegExp('\\b' + longName + '\\b', 'g');
                expr = expr.replace(regex, shortName);
            });
        }
        // ★ extend_scale 表达式求值结果为 0（含纯字面量 "0"）→ 强制 0.0001。
        //   此处导出的是 molang 表达式原文；若表达式在当前档位下求值恰为 0，直接改写为字面量
        //   0.0001（表达式本身保留原样不动，避免破坏 v.m/v.h 这类关联表达式）。
        //   短名模式下同一变量名 v.es 也会被 _isEsVar 命中（正则后缀匹配）。
        if (_isEsVar(v.name)) {
            const ev = Number(vnum(block, v.name));
            if (Number.isFinite(ev) && ev === 0) expr = String(ES_EXPORT_MIN);
        }
        statements.push(`${varName}=${expr};`);
    }
    return statements.join(' ');
}

function getShortNameRestoreString() {
    const restore = [];
    Object.entries(shortVarNames).forEach(([longName, shortName]) => {
        restore.push(`${longName}=${shortName};`);
    });
    return restore.join(' ');
}

// 生成方块的「常量数值」导出串：每个变量输出【当前求值结果】（v.xxx=<数值>），
// 而不是 molang 表达式。用于「未启用动画关键帧」的静态模型导出——骨骼子块的
// v.xpos/v.rotatex 等是 molang 跟随表达式，此时必须落成常量，否则命令里会塞满
// 一长串 t.父_px + pR·offset 的骨骼 molang（用户明确要求：非动画模式只输出常量）。
// 过滤掉骨骼 molang 内部辅助变量（pRxx/p_xx/parent_xx/own_bone_rot*/xbasepos_bone 等），
// 它们要么由导出端重新计算，要么是纯内部量，不应污染常量导出。
function getConstantAssignmentsString(block) {
    const order = ['xpos','ypos','zpos','xrot','yrot','zrot','rotatex','rotatey','rotatez','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos'];
    const stmts = [];
    const seen = new Set();
    for (const n of order) {
        const full = 'v.' + n;
        if (!block.scope.vars.has(full)) continue;
        // ★ extend_scale=0 → 0.0001（否则导出后拉伸矩阵奇异，见 ES_EXPORT_MIN 注释）
        stmts.push(`${full}=${_fv(n, _r4(vnum(block, full)))};`);
        seen.add(full);
    }
    for (const [name, def] of block.scope.vars) {
        if (!name.startsWith('v.')) continue;
        if (seen.has(name)) continue;
        const short = name.slice(2);
        if (isKeyframeInternalVar(short, block.id)) continue;
        // 骨骼 molang 内部辅助：跳过，导出端会按需重建
        if (short.startsWith('pR') || short.startsWith('p_') || short.startsWith('parent_') || short.startsWith('own_bone_rot')) continue;
        if (short === 'xbasepos_bone' || short === 'ybasepos_bone' || short === 'zbasepos_bone') continue;
        // IK 内部求解量 / 输入参数：由 _ikVars 按表达式导出（多关节的输入端全在 _ikVars 里）
        if (short.startsWith('ik_')) continue;
        if (name === 'v.xpos' || name === 'v.ypos' || name === 'v.zpos') continue; // 已在 order 处理
        stmts.push(`${name}=${_fv(short, _r4(vnum(block, name)))};`);
    }
    return stmts.join(' ');
}

// 生成方块的材质标记（用于命令导出），三种情况：
//   1. 组合方块预设 / 整体贴图  -> "block：名称";   （双引号注释形态，见 molangTag 注释块）
//   2. 自定义六面贴图          -> "faces：底|顶|左|右|前|后";（文件名，空面用 - 占位）
//   3. 纯色                    -> 空字符串
// ============================================================================
// ★★★【标签 = 单引号形态（2026-10-01 用户定稿，第 11 次报障修正）】
// ----------------------------------------------------------------------------
// 教训链（第 8/9 轮误判「双引号」后，第 11 次报障由用户游戏实测推翻，特此覆盖）：
//   ① 双引号 "方块编号：xxx"; —— 【错误】。整段 molang 程序是 playanimation 的【双引号命令参数】，
//      载荷已被外层双引号包住；内部再写双引号会【提前闭合命令字符串】→ 整条指令直接失效
//      （用户截图实证：指令变成 `... _ 0 ""方块编号：xxx";` 这种 `""` 空串 + 裸标签，游戏拒绝执行）。
//      第 8/9 轮所谓「双引号被求值器当注释跳过」是【假结论】：那是孤立看程序文本，没考虑它已被包进命令参数的双引号里。
//   ② 单引号 '方块编号：xxx'; —— 【正确，定稿】。单引号串在 Molang 里是合法字符串字面量，独立成句被求值器忽略
//      （等效注释/元数据），且绝不与外层双引号冲突；标签内冒号用中文全角（方块编号：/block：/faces：）不与三目运算符 : 冲突。
//      本文件内置预设（buildPlaneCommand / presetTemplates）用的就是单引号，已验证可游戏侧执行。
//   ③ v.fmbe='方块编号：xxx'; 惰性赋值 —— 不合法：Molang 变量是数值域，装不下字符串。任何赋值包装都错。
// 所有导出生成点一律经 molangTag() 输出 "内容"; 形态（调用方字面量自带双引号）。
function molangTag(literal) {
    // 透传 + 规范化尾随空白（保证拼进载荷后与前后语句以单空格分隔）。
    // ★禁止在这里做任何「赋值包装 / 引号改写」—— 引号形态由调用方字面量决定，全库统一双引号。
    return String(literal).trim() + ' ';
}

function getMaterialTag(block) {
    if (!block) return '';
    // ★★【旗帜材质字段（2026-10-18 r36 定稿）】旗帜的旗面材质只有两种来源：织布机生成的旗帜、
    //   本地上传的图片。二者都不走贴图库 ⇒ 没有可反查的云端贴图名，必须把「材质本体」写进命令。
    //   ★用户否决策略「内嵌 base64」：织布机生成的旗帜【只导出生成器配方】——紧凑文本
    //     'banner：<底色><图案><染料>…'（如 banner：PbsKboA，约 17 字符；base64 要 300-1000 字符）。
    //   ★导出前必须校验 loomUrl === textureUrl：用户之后若给方块换了别的材质，textureUrl 会被
    //     改写、两者不再相等 ⇒ 自动回退，绝不会把过期配方当成当前材质导出。
    //   ★配方以【注释标签】承载、绝不用 v.* 变量承载（用户硬性要求：不能让这些字段作为
    //     显示的变量出现在变量面板里）。标签是惰性文本、不进作用域。
    //   真·本地上传图片没有生成器配方 ⇒ 只能内嵌 data URL（blob: 不内嵌，会话结束即失效）。
    if (block.type === 'flag') {
        const u = block.textureUrl;
        if (block.materialType === 'texture' && u) {
            if (block.loomCode && block.loomUrl === u) return molangTag(`'banner：${block.loomCode}';`);
            if (/^data:/i.test(u)) return molangTag(`'block：${u}';`);
        }
        return '';
    }
    if (block.type !== 'cube' && block.type !== 'halfbrick' && block.type !== 'stair') return '';
    if (block.materialType === 'faces' && block.faceTextures) {
        // 命中预设时用可读的预设名，否则逐面列出文件名
        if (block.facePresetKey && TEX_PRESET_MAP.has(block.facePresetKey)) {
            return molangTag(`'block：${blockPresetName(block.facePresetKey)}';`);
        }
        const parts = block.faceTextures.map(u => u ? texName(u) : '-');
        return molangTag(`'faces：${parts.join('|')}';`);
    }
    // 整体单贴图：若为本地上传的图片（data:/blob: URL），必须把真实 URL 内嵌进命令，
    // 否则重新导入指令时该链接已失效（blob 会话结束即失效），导致材质丢失。
    // 但如果 data URI 的内容能反查出【云端贴图库】里的贴图名，则优先输出名字
    // （用户强烈反馈：云端材质一直在，命令里不应内嵌 base64）。
    if (block.materialType === 'texture' && block.textureUrl) {
        if (/^(data:|blob:)/i.test(block.textureUrl)) {
            // blob: URL 会话结束即失效、无法跨设备/重启保留，且内嵌进导出指令既巨大又无意义——
            // 用户要求：自定义上传贴图（无论 data: 反查云端还是 blob）直接归类为「无贴图」。
            // 之前 data: 反查云端名仍可保留，现在统一改为返回空：图例/配色显示「无材质」组。
            return '';
        }
        if (block.materialPresetName) return molangTag(`'block：${block.materialPresetName}';`);
    }
    return '';
}

// 获取单个方块的完整命令文本（包括前缀、后缀、旗帜标记）
// 判定「紫色加号显式绑定」：导出时即便没有关键帧动画也必须输出完整 molang 跟随指令。
// 文件夹自动绑骨（父 = 本文件夹的 _backbone）返回 false —— 无动画时按用户要求不输出 molang，由模拟器内部计算。
// _boneExplicit 是后加字段：旧存档 / 旧会话里的方块没有该字段，此时按上面的规则推断，
// 保证此前已绑定的老工程在导出时不会静默丢掉整段骨骼 molang。
function isExplicitBoneBinding(b) {
    if (!b || !b._boneParent) return false;
    if (b._boneExplicit !== undefined) return !!b._boneExplicit;
    const f = b.group ? getFolder(b.group) : null;
    return !(f && f._backbone && f._backbone === b._boneParent);
}
// ★ 该方块是否【真正】处于 molang 骨骼驱动态。与 isExplicitBoneBinding 的区别：
//   _boneParent 这一个字段承载了两种语义，运行时必须区分，否则静态文件夹骨骼会被误当成 molang 骨骼：
//   ① 紫色加号显式绑定（isExplicitBoneBinding=true）—— bindBone 无条件注入 molang，是【真骨骼】；
//   ② 文件夹静态骨骼（bindBone 的 !force && !isKfMode && !explicit 分支）—— 只写 _boneParent 作为
//      【纯层级分组元数据】，不注入任何 molang、不创建 xbasepos_bone。按用户定稿语义：无动画态的
//      文件夹骨骼就是普通分组，由模拟器直接计算，绝不走 molang 路径。
// 因此「是否有骨骼父」一律不能用 getBoneParentId 直接判定，凡涉及【写入哪个变量】的地方都必须先过本函数：
//   - false（纯分组）→ 枢轴拖拽写 v.xpos、文件夹整体变换走刚体逐块分支；
//   - true （真 molang）→ 枢轴拖拽换算进 xbasepos_bone、文件夹整体变换只动骨干靠 molang 带动子块。
function isBoneMolangDriven(b) {
    if (!b || !b._boneParent) return false;
    if (isExplicitBoneBinding(b)) return true; // 紫色加号显式绑定：bindBone 必然已注入 molang
    const xp = (b.scope && b.scope.vars) ? b.scope.vars.get('v.xpos') : null;
    if (xp && xp.expr && /t(?:\[['"]?|\.)[A-Za-z0-9_]+_[pg]x/.test(String(xp.expr))) return true;
    // 旧版局部轴链：pos 不参与跟随，父级标记在 v.xbasepos = t.<父>_bx + …（新绑定都读 px，已在上方命中）
    const bp = (b.scope && b.scope.vars) ? b.scope.vars.get('v.xbasepos') : null;
    return !!(bp && bp.expr && /t(?:\[['"]?|\.)([A-Za-z0-9_]+)_bx/.test(String(bp.expr)));
}
function getCommandTextForBlock(block, opts) {
    const _o = opts || {};
    // molang 接管方块：直接输出完整 program（含三元条件、q. 查询与全部变量），
    // 不能用 def.expr 重建，否则条件分支会被吞成单一求值结果而丢失指令内容。
    // 【2026-10-19 · 关键帧去文件夹化】文件夹骨骼已整体移除：
    //   骨绑定导出只认「紫色加号显式绑定(_boneExplicit)」——即使无关键帧动画也输出完整 molang 跟随指令（用户硬要求）；
    //   其余方块（普通编辑 / 静态模型 / 纯分组文件夹子块）一律直接输出【常量数值】，绝不输出一长串骨骼 molang。
    const isBoneChild = !!(block._boneParent && isExplicitBoneBinding(block));
    const isBoneExporter = blocks.some(b => b._boneParent === block.id && isExplicitBoneBinding(b));
    // ★该声明在「关键帧去文件夹化」重构里被删掉，但下方 else 分支仍在引用 ⇒ 导出任何方块都会
    //   抛 ReferenceError。按原语义补回（有无骨级动画数据），供「常量 vs 表达式」二选一。
    const hasBoneAnim = (typeof boneKeyframes !== 'undefined' && boneKeyframes.size > 0);
    let varsStr;
    if (block.scope && block.scope.program && block.scope.program.trim()) {
        // ★★★【2026-10-17 用户第 16 轮 · 「导出没有任何变量、开一次 molang 编辑模式再导出就有了」的真根因】
        //   旧条件写死为 `molangMode && program`，而变量面板/moang 编辑器的可见条件
        //   （renderVariablesForBlock：`takeover = molangMode || program`）**只看 program 非空**。
        //   ⇒ 只要 scope.program 有内容（关键帧编译产物 / 解绑后残留 / 用户手写），编辑器就把它当
        //     molang 程序显示给用户，导出却因 molangMode=false 落回常量分支 —— 「编辑器看得到、导出没输出」。
        //   现改为与编辑器同口径：program 非空即按 program 导出，消除这次状态依赖。
        // ★导出前归一化：molang 编辑器里的程序允许多行书写（用户手动换行 / 旧版常量化用 '\n' 连接），
        //   但导出指令必须单行（Minecraft 命令不能含换行，且换行会破坏按行拆分与复制粘贴）。
        //   把换行折叠成空格即可——molang 语法里换行与空格等价，引号字符串内不应出现换行。
        varsStr = block.scope.program.replace(/\s*\r?\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
        // 关键帧+molang 接管：确保 anim 标签和方块编号标签在导出时被补上。
        // forMolangProgram=true 生成的 program 不带这两个标签（仅模拟执行用），
        // 但导出需要用它们来标记 FMBE 动画名。仅当 program 本身尚未包含它们时才追加。
        // （用户手动编辑过的 program 也保留这一行为，保证无论如何导出 anim 标签不会丢）
        // ★ Molang 编辑模式的方块已退出关键帧体系：不得再往导出指令里补 anim 标签，
        //   否则用户手写的表达式导出来会多出一段关键帧动画标记、与原本的不一致。
        if (!block.scope.molangMode && hasKeyframeAnimation(block.id)) {
            if (!/['"]anim:/.test(varsStr)) {
                varsStr += molangTag(`'anim:${getKeyframeAnimId(block.id)}';`);
            }
        }
        // ★IK 末端块走 program 分支时（导入后程序里只剩输入赋值），求解输出发布必须补回来：
        //   t.<tip>_ik_b* 是动画层产出的变量的「惰性全局定义」，导入时已被摘出程序，
        //   程序分支又不像骨子块分支那样自动追加 _ikPublish ⇒ 不补就会在「导入 → 再导出」时丢发布。
        if (block && block._ikPublish && !varsStr.includes(`${boneSafeId(block.id)}_ik_jrx=`)) {
            varsStr += ' ' + block._ikPublish;
        }
    } else if (isBoneChild) {
        // 骨骼子块：自驱动输入（相对父旋转 + 缩放），世界坐标由下方「跟随父块」公式给出
        varsStr = getBoneInputConstantsString(block);
        // ★共用跟随动画 bone_follow：base 只需补「父引用 + 骨偏移」输入，
        //    pR / pos / rotate 由动画控制器统一计算（导出时每块仍带自己的方块编号 + 控制器名）。
        if (boneHasSharedFollow(block)) {
            const _bp = blocks.find(b => b.id === getExportBoneParentId(block));
            if (_bp) varsStr = (varsStr ? varsStr + ' ' : '') + boneFollowInputsExportString(block, _bp);
        }
    } else {
        // 非骨骼动画：输出常量数值（molang 表达式求值为当前值），保证导入后外观一致
        varsStr = hasBoneAnim ? getOrderedAssignmentsString(block) : getConstantAssignmentsString(block);
        // ★IK 逆骨骼「自由根」（链首没有父骨骼，直接接管自己的 rotate）：关节角必须按表达式导出，
        //   getBoneInputConstantsString 只在骨子块路径追加 _ikVars，这条路径要自己补一次（追加在常量段之后即可覆盖）。
        if (block && Array.isArray(block._ikVars) && block._ikVars.length) {
            for (const [n, e] of block._ikVars) varsStr += ` ${n}=${e};`;
            if (block._ikPublish) varsStr += ' ' + block._ikPublish;
        }
    }
    // 骨骼子块：追加「跟随父块」的世界坐标计算（引用父全局矩阵 + 自身相对父偏移）。
    // 取代原先独立的巨命令，使每条方块命令自包含且很短（父全局见 getBonePublishGlobalsString）。
    // 仅当骨骼动画启用时才追加；非动画模式不输出，避免命令里塞满 pR 矩阵 molang。
    const boneParentId = isBoneChild ? getExportBoneParentId(block) : null;
    if (boneParentId) {
        const boneParent = blocks.find(b => b.id === boneParentId);
        // ★【幂等】molang 接管方块的 program（generateMolangBaseline 输出全部变量 / 关键帧脚本）
        //   本身已含跟随公式（v.parent_xrot=… / pR 矩阵 / v.xpos=t.父_px+…），此处若无条件追加，
        //   同一条命令里会重复整整一段 pR 矩阵（用户报：导出的结构看上去像重复了指令）。
        //   与下方「父块广播全局」的判据同口径：program 里已有 v.parent_xrot= 就不再补。
        //   非 molang 分支走 getBoneInputConstantsString，已刻意剔除 parent_*/pR*/xpos（见 31929-31933），
        //   故那种情况 varsStr 不含该标记、照常追加，不会漏。
        // 去重按【跟随式特征】判定（不再按绑定方式）：新绑定统一后都是 pR 矩阵 + pos 跟随式，
        // 旧版局部轴链看 p_u0/basepos 跟随。缺偏移常量时（只写 v.xbasepos=t.父_bx）会跑位，必须补全。
        const _isBp = isBaseposDrivenBlock(block);
        // ★枢轴绑定的跟随数学已搬进共用动画 bone_follow：base 只留输入，follower 由动画层输出，
        //   绝不能再把整段跟随公式重复追加进 base（否则同一条指令出现两份 pR 矩阵）。
        const _followDone = boneHasSharedFollow(block)
            ? true
            : isPureSnapBone(block)
            ? /v\.xpos=t\./.test(varsStr)
            : _isBp
            ? (varsStr.includes('v.p_u0=') || varsStr.includes('v.xbasepos=t.') && varsStr.includes('v.xbasepos_bone='))
            : varsStr.includes('v.parent_xrot=');
        if (boneParent && !_followDone) {
            varsStr += ' ' + getBoneChildFollowString(block, boneParent);
        }
    }
    // 骨骼父块：在本块命令末尾发布 t.<id>_* 全局 + 旋转矩阵（每父一条），供其子块引用。
    // 注意：getOrderedAssignmentsString / getExportableVariables 已经把 globalVars 中以本块为 sourceBlockId 的
    // 全局变量（如 t.Cube_px）导出了，若再次追加会导致同一命令里重复发布。这里先检查是否已存在。
    if (isBoneExporter && isBoneParentBlock(block)) {
        const _sid = boneSafeId(block.id);
        const _hasPosPub = varsStr.includes(`t.${_sid}_px=`);
        const _needBasePub = hasBaseposBoneChild(block) && !varsStr.includes(`t.${_sid}_bx=`);
        if (!_hasPosPub || _needBasePub) {
            varsStr += ' ' + getBonePublishGlobalsString(block, { skipPos: _hasPosPub });
        }
    }
    let blockIdPrefix = getMaterialTag(block);
    let groupPrefix = '';
    if (block.group) {
        groupPrefix = molangTag(`'group:${block.group}';`);
    }
    const parentBonePrefix = getParentBonePrefix(block);
    const boneTag = getBoneTagForBlock(block);
    if (block.type === 'flag') {
        varsStr = molangTag(`'方块类型：旗帜';`) + varsStr;
    } else if (block.type === 'halfbrick') {
        varsStr = molangTag(`'方块类型：Slab';`) + varsStr;
    } else if (block.type === 'stair') {
        varsStr = molangTag(`'方块类型：楼梯';`) + varsStr;
    } else if (block.type === 'dropitem') {
        varsStr = molangTag(`'方块类型：掉落物';`) + varsStr;
    }
    const suffix = effectiveExportSuffix(exportSuffix).replace(/{id}/g, block.id);
    // 多层导出：base 也要打 ao（顺序）；{anim} 在 prefix 里展开成动画名（单层工程无该占位符 ⇒ 逐字节不变）
    const _animName = _o.animName || BASE_ANIM_NAME;
    const _prefix = expandStructurePrefix(block, _animName);
    const _tags = _o.extraTags || '';
    // ★ 指令末尾追加动画控制器（playanimation 的收尾参数）：裸名字接在收尾引号后。
    //   base 用默认控制器名 FMBE_variables，附加动画层由调用方传 animName。
    const _ctrlName = _o.controllerName != null ? String(_o.controllerName).trim() : _animName;
    const _ctrlArg = _ctrlName ? ' ' + _ctrlName : '';
    return _prefix + blockIdPrefix + groupPrefix + parentBonePrefix + boneTag + molangFixFlowControl(varsStr) + _tags + suffix + _ctrlArg;
}

// ★★★【2026-11-10】Molang **没有 `if(cond){…}` 语句** —— 真机解析到 `if` 直接抛
//   `Error: unknown token: if(cond){…`，整条 playanimation 当场作废（关节角恒 0、模型散架）。
//   官方流程控制只有 `cond ? { …语句… };`（brace scope）与三元 `a ? b : c`。
//   本项目的解释器历史上宽松放行 `if`，于是老工程 / 老动画里可能残留这种写法；
//   导出时统一改写成官方条件块，语义完全等价：`if(C){A}` ≡ `(C)?{A}`。
function molangFixFlowControl(text) {
    return String(text == null ? '' : text)
        .replace(/\bif\s*\(([^()]*)\)\s*\{/g, '($1)?{')
        // 空条件块（`cond?();` / `cond?{};`）在 Molang 里是语法错误 ⇒ 压成无害空语句
        .replace(/\?\(\s*\)\s*;/g, ';')
        .replace(/\?\{\s*\}\s*;/g, ';')
        // 废止项：`v.parent_ux/uy/uz`（父块视觉锚点补偿）已从 bone_follow 公式整层删除。
        // 老工程里还留在 molang 程序正文中 ⇒ 导出时统一抹掉，免得每条指令白带三条恒 0 赋值。
        .replace(/\bv\.parent_u[xyz]\s*=[^;]*;/g, ' ');
}

// ===== 多层动画导出（2026-11-07）=====
// 单层（无 channels）⇒ 只输出原来那一条，逐字节不变。
// 多层 ⇒ 按 scope.stack 顺序，每层一条 playanimation；载荷内加：
//   'anim:<animId>';        —— 非 base 层身份；没有 anim 标签的那条就是该块的 base
//   'anim名称：<name>';      —— 控制器显示名（导入还原用，导入端不依赖它寻址）
//   'ao:<order>';           —— 本块内的执行顺序（base 也带，保证 base 可不在第一位）
//   {anim} 占位符在 prefix 里展开成动画名。
function getBlockLayerList(block) {
    const sc = block && block.scope;
    if (!sc || !sc.channels || sc.channels.size === 0) return null;
    if (typeof sc.ensureLayerModel === 'function') sc.ensureLayerModel();
    const stack = Array.isArray(sc.stack) ? sc.stack : ['__base__'];
    const out = [];
    for (const key of stack) {
        if (key === '__base__') {
            out.push({ key, name: (typeof BASE_ANIM_NAME !== 'undefined') ? BASE_ANIM_NAME : 'FMBE_variables', base: true, program: String(sc.program || '') });
        } else if (sc.channels.has(key)) {
            const ch = sc.channels.get(key);
            if (ch && ch.enabled === false) continue;
            const anim = (typeof getProjectAnimation === 'function') ? getProjectAnimation(key) : null;
            let prog = String((typeof getAnimationProgram === 'function') ? getAnimationProgram(key) : (ch && ch.program) || '');
            // ★2026-11-10 共用跟随动画（bone_follow）的正文由 app 拥有，老工程里可能还是
            //   「带 v.parent_ux/uy/uz」的旧版 ⇒ 导出时直接换成当前版本。
            //   不换的话每条指令白带三条废止赋值，而且真机上这三条是它自己的输入槽、没人再写它们。
            if (typeof BONE_FOLLOW_PROGRAM === 'string' && prog.includes('v.parent_ux') && prog.includes('v.pR22=')) {
                prog = BONE_FOLLOW_PROGRAM;
                try { const a = getProjectAnimation(key); if (a) a.program = BONE_FOLLOW_PROGRAM; } catch (_) { }
            }
            if (!prog.trim()) continue;   // 空层不产出指令
            out.push({ key, name: anim ? anim.name : key, base: false, program: prog });
        }
    }
    if (!out.some(l => l.base)) {
        out.unshift({ key: '__base__', name: (typeof BASE_ANIM_NAME !== 'undefined') ? BASE_ANIM_NAME : 'FMBE_variables', base: true, program: String(sc.program || '') });
    }
    return out;
}
function buildAnimationLayerCommand(block, layer, ao) {
    const prog = molangFixFlowControl(String(layer.program || '')).replace(/\s*\r?\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const prefix = expandStructurePrefix(block, layer.name);
    const matTag = getMaterialTag(block);
    const groupTag = block.group ? molangTag(`'group:${block.group}';`) : '';
    const identTags = molangTag(`'anim:${layer.key}';`) + molangTag(`'anim名称：${layer.name}';`) + molangTag(`'ao:${ao}';`);
    const suffix = effectiveExportSuffix(exportSuffix).replace(/{id}/g, block.id);
    return prefix + matTag + groupTag + identTags + prog + suffix + (layer.name ? ' ' + layer.name : '');
}
// ===== 双 tag 识别法（结构导出可选，2026-11-08）=====
// 位置法：1 命令方块 → 1 只狐狸（前缀 `positioned ~-1~~` + `@e[x=~,z=~,y=~,r=1]`）。
//   ⇒ 前缀一改就失效，且「一个方块的多层动画」会分摊到多只狐狸，控制器无法叠加到同一只身上。
// Tag 法：所有狐狸叠在同一个坐标，靠实体 tag 选中：
//   模型 tag（用户输入，支持中文）= 本结构全部狐狸；方块名 tag = 某一块的狐狸。
//   双否定 `unless entity @s[tag=!A,tag=!B]` 等价于「拥有 A 或 B 中任意一个」⇒ 一条指令可同时作用多块。
//   ★★ unless 后面必须带 `entity`（`unless <选择器>` 是非法语法，游戏会整条拒绝执行）。
const STRUCT_TAG_ANIM = 'animation.player.attack.positions';   // playanimation 的动画名（原模板同款）
// tag 里不能出现空格/逗号/方括号/感叹号/引号（会破坏选择器解析）；中文等其他字符原样保留。
function structTagSafe(s) {
    return String(s == null ? '' : s).replace(/[\s,\[\]!"'`]+/g, '_').replace(/^_+|_+$/g, '');
}
// 方块名 tag：用面板上显示的名字（block.id，导入时即「方块编号」），允许中文
function structBlockNameTag(block) {
    if (!block) return '';
    return structTagSafe(block.name || block.id);
}
// 强制专用前缀；{tags} 由 expandStructurePrefix 逐条替换成 `tag=!<方块名>,…`
function structTagPrefixTemplate(modelTag) {
    const t = structTagSafe(modelTag) || 'FMBE';
    return `execute as @e[type=fox,tag=${t}] unless entity @s[tag=!{tags}] run playanimation @s ${STRUCT_TAG_ANIM} _ 0 "`;
}
// 统一展开 prefix：{anim} → 动画名；{tags} → 本方块（可多个）的名字 tag 否定式
function expandStructurePrefix(block, animName) {
    let p = String(exportPrefix == null ? '' : exportPrefix).replace(/{anim}/g, animName);
    if (p.indexOf('{tags}') >= 0) {
        const tags = [];
        const t = structBlockNameTag(block);
        if (t) tags.push(t);
        // 模板里已写好 `tag=!{tags}`，这里只填「方块名」本身（多个用 ,tag=! 连接）
        p = p.replace(/{tags}/g, tags.join(',tag=!'));
    }
    return p;
}

// 返回 [{ key, name, base, text }]：一个方块的所有导出指令（单层只有一条）
// ★base 指令恒定排在第一行（导入需要先建块再挂层），真实执行顺序由每条载荷里的 'ao:<n>' 还原。
function getCommandTextsForBlock(block, opts) {
    const layers = getBlockLayerList(block);
    if (!layers || layers.length < 2) {
        return [{ key: '__base__', name: (typeof BASE_ANIM_NAME !== 'undefined') ? BASE_ANIM_NAME : 'FMBE_variables', base: true, text: getCommandTextForBlock(block, opts) }];
    }
    const ordered = layers.map((l, i) => ({ layer: l, ao: i }));
    const baseItem = ordered.find(x => x.layer.base);
    if (baseItem) {
        ordered.splice(ordered.indexOf(baseItem), 1);
        ordered.unshift(baseItem);
    }
    const items = ordered.map(({ layer: l, ao }) => ({
        key: l.key, name: l.name, base: l.base,
        text: l.base
            ? getCommandTextForBlock(block, Object.assign({}, opts, {
                animName: l.name,
                // 'baseprog:1' 标记「base 来自 molang 程序」：导入侧据此整段存回 program，
                // 否则会被拆成变量卡片，基础动画就不再按 stack 顺序执行（会重算所有变量、覆盖前面动画的写入）
                extraTags: molangTag((block.scope && block.scope.program && block.scope.program.trim() ? `'baseprog:1'; ` : '') + `'ao:${ao}';`)
            }))
            : buildAnimationLayerCommand(block, l, ao, opts)
    }));
    return moveBonePublishToFollowLayer(block, ordered, items);
}

// ★★【命令执行顺序修复 2026-11-08】父块的 t.<id>_* 发布必须发生在「算出被发布变量」的那一层之后。
//   base（ao:0）是独立的一条 playanimation；v.xpos/v.rotatex 由 bone_follow（ao:1）才写入，
//   IK 的 v.ik_jr*/v.ik_b* 由 ik_solve 层（ao:1/2）才写入。发布留在 base ⇒ 游戏里读到的是
//   【上一 tick】的位姿（首帧更会读到未定义 / 0）。
//   ⇒ 导出时按「右侧变量在哪个附加层被写」逐条后移：
//        t.<id>_xrot=v.rotatex  → bone_follow 末尾
//        t.<id>_ik_b1=v.ik_b1   → ik_solve 末尾
//      右侧变量只在本块 base 里写的（如 v.xbasepos 常量、v.ikW）则原地不动。
function moveBonePublishToFollowLayer(block, ordered, items) {
    if (!items || items.length < 2 || !items[0] || !items[0].base) return items;
    const sid = (typeof boneSafeId === 'function') ? boneSafeId(block.id) : String(block.id);
    const esc = sid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\s*t\\.${esc}_[A-Za-z0-9_]*\\s*=\\s*v\\.([A-Za-z_][A-Za-z0-9_]*)\\s*;`, 'g');
    const moved = new Map();           // targetLayerIndex -> 语句串
    const kept = String(items[0].text || '').replace(re, (m, rhs) => {
        let target = -1;
        for (let i = 1; i < ordered.length; i++) {
            const prog = String((ordered[i].layer && ordered[i].layer.program) || '');
            if (prog.includes('v.' + rhs + '=')) target = i;
        }
        if (target < 0) return m;                       // 没有计算层 → 留在 base（顺序本来就对）
        moved.set(target, (moved.get(target) || '') + m.trim() + ' ');
        return '';
    });
    if (!moved.size) return items;
    items[0].text = kept;
    for (const [idx, text] of moved) {
        const t = String(items[idx].text || '');
        const q = t.lastIndexOf('"');
        items[idx].text = q < 0 ? t + ' ' + text : t.slice(0, q) + text + t.slice(q);
    }
    return items;
}

// 下载纯文本为文件
function downloadTextFile(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ============================================================================
// ===================  Minecraft Bedrock .mcstructure 导出  ==================
// ============================================================================
// 格式（依实测 `导出.mcstructure` 逆向确认，2026-10-01）：
//   根 TAG_Compound（空名）
//     format_version       int    = 1
//     size                 List<int> = [sx, sy, sz]   ← ★TAG_List(9)，不是 Int_Array(11)
//     structure_world_origin List<int> = [ox, oy, oz] ← ★同上
//     structure            TAG_Compound
//       block_indices      TAG_List<TAG_List<int>>  两层：layer0 方块 / layer1 全 -1
//       entities           TAG_List<TAG_Compound>  狐狸等「指令载体」实体
//       palette            TAG_Compound
//         default          TAG_Compound
//           block_palette    TAG_List<TAG_Compound>  去重后的方块状态表
//           block_position_data TAG_Compound
//             "<格子索引>"  → { block_entity_data: { Command, ... } }
//   ★ 关键：命令方块指令存在 palette.default.block_position_data[索引].block_entity_data.Command，
//     索引 i = lz + ly*sz + lx*sy*sz（Z 最快 → Y → X，官方口径），**不是**坐标。
//   ★ 载体设计：1 命令方块 → 1 狐狸。狐狸站在命令方块上，命令方块用
//     `execute positioned ~-1~~ run playanimation @e[x=~,z=~,y=~,r=1]`（模板前缀自带 `~-1~~`）
//     选中半径 1 内最近的实体（= 该狐狸）执行动画指令，狐狸身上无 Tag、无指令。
//     即：命令方块只负责"念指令"，狐狸是 playanimation 的目标。
// ----------------------------------------------------------------------------

// --- 小端 NBT 写入器 -------------------------------------------------------
const _NBT = {
    TAG_END: 0, TAG_BYTE: 1, TAG_SHORT: 2, TAG_INT: 3, TAG_LONG: 4, TAG_FLOAT: 5,
    TAG_DOUBLE: 6, TAG_BYTE_ARRAY: 7, TAG_STRING: 8, TAG_LIST: 9, TAG_COMPOUND: 10,
    TAG_INT_ARRAY: 11, TAG_LONG_ARRAY: 12
};
class NbtWriter {
    constructor() { this.chunks = []; }
    _u8(v)  { this.chunks.push(new Uint8Array([v & 0xff])); }
    _u16(v) { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, v & 0xffff, true); this.chunks.push(a); }
    _i32(v) { const a = new Uint8Array(4); new DataView(a.buffer).setInt32(0, v | 0, true); this.chunks.push(a); }
    _i8(v)  { const a = new Uint8Array(1); new DataView(a.buffer).setInt8(0, v | 0); this.chunks.push(a); }
    _i16(v) { const a = new Uint8Array(2); new DataView(a.buffer).setInt16(0, v | 0, true); this.chunks.push(a); }
    _i64(v) { const a = new Uint8Array(8); new DataView(a.buffer).setBigInt64(0, BigInt(Math.trunc(v)), true); this.chunks.push(a); }
    _f32(v) { const a = new Uint8Array(4); new DataView(a.buffer).setFloat32(0, v, true); this.chunks.push(a); }
    _f64(v) { const a = new Uint8Array(8); new DataView(a.buffer).setFloat64(0, v, true); this.chunks.push(a); }
    _utf8(s) {
        const bytes = new TextEncoder().encode(String(s));
        this._u16(bytes.length);
        this.chunks.push(bytes);
    }
    _tagHeader(type, name) { this._u8(type); if (type !== _NBT.TAG_END) this._utf8(name); }
    // --- 具体类型写入（带名字，用于 compound 内成员） ---
    writeInt(name, v)    { this._tagHeader(_NBT.TAG_INT, name); this._i32(v); }
    writeByte(name, v)   { this._tagHeader(_NBT.TAG_BYTE, name); this._i8(v); }
    writeShort(name, v)  { this._tagHeader(_NBT.TAG_SHORT, name); this._i16(v); }
    writeLong(name, v)   { this._tagHeader(_NBT.TAG_LONG, name); this._i64(v); }
    writeFloat(name, v)  { this._tagHeader(_NBT.TAG_FLOAT, name); this._f32(v); }
    writeDouble(name, v) { this._tagHeader(_NBT.TAG_DOUBLE, name); this._f64(v); }
    writeString(name, s) { this._tagHeader(_NBT.TAG_STRING, name); this._utf8(s); }
    writeIntArray(name, arr) {
        this._tagHeader(_NBT.TAG_INT_ARRAY, name);
        this._i32(arr.length);
        arr.forEach(v => this._i32(v));
    }
    // ★★ 游戏原生 size / structure_world_origin 实际是 TAG_List<TAG_INT>（实测 type=9），
    //    而【不是】TAG_Int_Array(11)。写成 11 会被 Bedrock 判定格式非法 → "结构导入失败"。
    writeIntList(name, arr) {
        this._tagHeader(_NBT.TAG_LIST, name);
        this._u8(_NBT.TAG_INT);
        this._i32(arr.length);
        arr.forEach(v => this._i32(v));
    }
    // 开启一个有名 compound，返回写结束标记(TAG_END)的闭包
    beginCompound(name) { this._tagHeader(_NBT.TAG_COMPOUND, name); return () => this._u8(_NBT.TAG_END); }
    // 开启一个有名 list：需要元素类型与元素个数
    // ★★ NBT 规范：**空 list 的元素类型必须写 TAG_END(0)**，不能写真实元素类型。
    //    违规后果：严格解析器（Bedrock 导入器）在读到 count=0 却带非零 elemType 时
    //    判定数据非法 → 整个 structure 被丢弃 / 实体不生成（实测差异：
    //    ExtraSeats / LastOutputParams 等空表被写成 L10、L8，而样本恒为 L0）。
    //    此处统一兜底，调用方无需关心。
    beginList(name, elemType, count) {
        this._tagHeader(_NBT.TAG_LIST, name);
        this._u8(count > 0 ? elemType : _NBT.TAG_END);
        this._i32(count);
    }
    // ★ list 的 compound 元素：元素类型已在 list 头声明，这里【只写 compound 内容】
    //   （旧实现在这里多写了一次 TAG_COMPOUND 字节 → 解析器偏移错位、palette 整个丢失）
    beginListCompoundElem() { return () => this._u8(_NBT.TAG_END); }
    // 无名字的标量元素（用于 list 内）
    writeListInt(v) { this._i32(v); }
    writeListFloat(v) { this._f32(v); }
    writeListString(s) { this._utf8(s); }
    finish() {
        let total = 0;
        this.chunks.forEach(c => total += c.length);
        const out = new Uint8Array(total);
        let off = 0;
        this.chunks.forEach(c => { out.set(c, off); off += c.length; });
        return out;
    }
}

// --- 折叠方块/实体模型 -----------------------------------------------------

// 从方块读取「导出指令正文」（不含前缀，取 getCommandTextForBlock 去掉前缀后的部分）
// 说明：getCommandTextForBlock 返回 = exportPrefix + materialTag + ... + varsStr + suffix
// 结构里命令方块只需承载 playanimation 的目标参数，故这里直接复用完整 getCommandTextForBlock()
// ——它本身就含前缀（execute positioned ~-1~~ run playanimation ...）+ 全部变量 + '方块编号：id' 后缀。
function getBlockStructureCommand(block, opts) {
    // ★ 不再静默吞异常：命令方块没有指令 = 功能失效，必须让调用方发现。
    //   （旧实现 catch 后返回 '' → 结构、尺寸、位置全对，唯独命令方块是空的，
    //     极难从产物上看出根因；见 2026-10-01 "命令方块里啥也没有" 报障。）
    if (!block || typeof block !== 'object') throw new Error('getBlockStructureCommand: 入参不是方块对象');
    return getCommandTextForBlock(block, opts);
}

// 方块世界坐标（四舍五入到整数格）。
// ★ 权威接口是 blockWorldPos（mesh.position 不反映位置：模拟器每帧从 v.* 重建变换矩阵）。
// ★ 但 blockWorldPos 依赖 scope 内部缓存；批量导出时若方块刚被创建/改动、尚未 refresh，
//   会读到陈旧值 → 多个方块重合到同一格（实测：3 块全挤到 (0,0,0)）。
//   故这里【先强制 refresh 自身】再取，并且 refresh 失败时回退到 v.xpos/ypos/zpos 的数值。
function getBlockWorldIntPos(block) {
    try { if (block && typeof block.refresh === 'function') block.refresh(); } catch (e) {}
    let p = null;
    try { p = blockWorldPos(block); } catch (e) { p = null; }
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
        return [Math.round(p.x), Math.round(p.y), Math.round(p.z)];
    }
    return [Math.round(capVal(block, 'xpos')), Math.round(capVal(block, 'ypos')), Math.round(capVal(block, 'zpos'))];
}

// 狐狸落位：放在命令方块的【x-1】格，使其被 @e[x=~,z=~,y=~,r=1] 命中。
// 返回狐狸的世界坐标（浮点，方块中心 = 整数 + 0.5）。
// ★ 承载布局：命令方块折成三维区块（见 buildMcStructureBytes），狐狸恒在各自命令方块的 x-1 处。
function getFoxSpawnPosForCommandBlock(cmdX, cmdY, cmdZ) {
    return [cmdX - 1 + 0.5, cmdY + 0.0, cmdZ + 0.5];
}

// --- 狐狸实体的「预设标量 NBT」表（2026-11-08 用户要求可交互）-------------------
// 下列字段本来就是硬编码写进狐狸实体的；现在统一挪到这张表，导出弹窗据此渲染
// 【勾选框（是否写入）+ 值输入框】，用户可以逐项开关、改值。
// g=分组名  k=键名  t=类型  v=默认值（与原先硬编码完全一致）。
// ★ 结构化字段（Pos / Rotation / Motion / Tags / Attributes / definitions /
//   neteaseComponents / 装备槽 / 效果表 …）不在这张表里：它们的形状或取值依赖布局，
//   仍按原样固定写入（其中 Attributes/definitions 是实体能否被加载的关键，不能删）。
const FOX_NBT_SPEC = [
    // 身份
    { g: '身份',           k: 'OldEntityUniqueID', t: 'long',  v: -1 },
    // 运动 / 生存
    { g: '运动 / 生存',    k: 'Air',             t: 'short', v: 300 },
    { g: '运动 / 生存',    k: 'OnGround',        t: 'byte',  v: 0 },
    { g: '运动 / 生存',    k: 'FallDistance',    t: 'float', v: 0 },
    { g: '运动 / 生存',    k: 'DeathTime',       t: 'short', v: 0 },
    { g: '运动 / 生存',    k: 'HurtTime',        t: 'short', v: 0 },
    { g: '运动 / 生存',    k: 'Dead',            t: 'byte',  v: 0 },
    { g: '运动 / 生存',    k: 'Invulnerable',    t: 'byte',  v: 1 },
    { g: '运动 / 生存',    k: 'ignoreHurt',      t: 'byte',  v: 1 },
    { g: '运动 / 生存',    k: 'Fire',            t: 'byte',  v: -1 },
    { g: '运动 / 生存',    k: 'FireHurtTime',    t: 'short', v: 0 },
    // 狐狸本体状态
    { g: '狐狸本体状态',   k: 'IsAutonomous',    t: 'byte',  v: 1 },
    { g: '狐狸本体状态',   k: 'Persistent',      t: 'byte',  v: 1 },
    { g: '狐狸本体状态',   k: 'IsGlobal',        t: 'byte',  v: 1 },
    { g: '狐狸本体状态',   k: 'IsTamed',         t: 'byte',  v: 0 },
    { g: '狐狸本体状态',   k: 'IsTrusting',      t: 'byte',  v: 0 },
    { g: '狐狸本体状态',   k: 'IsBaby',          t: 'byte',  v: 0 },
    { g: '狐狸本体状态',   k: 'IsAngry',         t: 'byte',  v: 0 },
    { g: '狐狸本体状态',   k: 'Sitting',         t: 'byte',  v: 0 },
    { g: '狐狸本体状态',   k: 'SittingDown',     t: 'byte',  v: 0 },
    { g: '狐狸本体状态',   k: 'ShowBottom',      t: 'byte',  v: 1 },
    { g: '狐狸本体状态',   k: 'Saddled',         t: 'byte',  v: 0 },
    { g: '狐狸本体状态',   k: 'Sheared',         t: 'byte',  v: 0 },
    { g: '狐狸本体状态',   k: 'Chested',         t: 'byte',  v: 0 },
    { g: '狐狸本体状态',   k: 'Variant',         t: 'int',   v: 0 },
    { g: '狐狸本体状态',   k: 'MarkVariant',     t: 'int',   v: 0 },
    { g: '狐狸本体状态',   k: 'SkinID',          t: 'int',   v: 0 },
    { g: '狐狸本体状态',   k: 'Color',           t: 'byte',  v: 0 },
    { g: '狐狸本体状态',   k: 'Color2',          t: 'byte',  v: 0 },
    // AI 开关
    { g: 'AI 开关',        k: 'IsCloseAi',        t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'IsEating',         t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'IsGliding',        t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'IsIllagerCaptain', t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'IsOrphaned',       t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'IsOutOfControl',   t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'IsPregnant',       t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'IsRoaring',        t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'IsScared',         t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'IsStunned',        t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'IsSwimming',       t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'NaturalSpawn',     t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'LootDropped',      t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'canPickupItems',   t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'hasSetCanPickupItems', t: 'byte', v: 1 },
    { g: 'AI 开关',        k: 'collidableMob',    t: 'byte', v: 1 },
    { g: 'AI 开关',        k: 'needDispatchKnock', t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'hasBoundOrigin',   t: 'byte', v: 0 },
    { g: 'AI 开关',        k: 'Surface',          t: 'byte', v: 0 },
    // 维度 / 传送 / 目标
    { g: '维度 / 传送',    k: 'LastDimensionId',  t: 'int',  v: 0 },
    { g: '维度 / 传送',    k: 'PortalCooldown',   t: 'int',  v: 0 },
    { g: '维度 / 传送',    k: 'TargetID',         t: 'long', v: -1 },
    { g: '维度 / 传送',    k: 'LeasherID',        t: 'long', v: -1 },
    { g: '维度 / 传送',    k: 'OwnerNew',         t: 'long', v: 0 },
    // 交易 / 战斗数值
    { g: '交易 / 战斗',    k: 'TradeExperience',  t: 'int',  v: 0 },
    { g: '交易 / 战斗',    k: 'TradeTier',        t: 'int',  v: 0 },
    { g: '交易 / 战斗',    k: 'Strength',         t: 'int',  v: 0 },
    { g: '交易 / 战斗',    k: 'StrengthMax',      t: 'int',  v: 0 },
    { g: '交易 / 战斗',    k: 'boundX',           t: 'int',  v: 0 },
    { g: '交易 / 战斗',    k: 'boundY',           t: 'int',  v: 0 },
    { g: '交易 / 战斗',    k: 'boundZ',           t: 'int',  v: 0 }
];

// --- 结构化 NBT 预设（2026-11-08 用户要求也开放编辑）--------------------------
// 装备槽：Armor 5 格 + 主手 + 副手；每格可改 Name（物品 id，空=空槽）/ Count / Damage。
// 注意 key 里的 # 只是 UI 用的分隔符，Armor#i 对应 Armor 列表第 i 项。
const FOX_EQUIP_SLOTS = [
    { key: 'Armor#0', list: 'Armor', idx: 0, label: '头盔 Armor[0]' },
    { key: 'Armor#1', list: 'Armor', idx: 1, label: '胸甲 Armor[1]' },
    { key: 'Armor#2', list: 'Armor', idx: 2, label: '护腿 Armor[2]' },
    { key: 'Armor#3', list: 'Armor', idx: 3, label: '靴子 Armor[3]' },
    { key: 'Armor#4', list: 'Armor', idx: 4, label: '盔甲槽 Armor[4]' },
    { key: 'Mainhand', list: 'Mainhand', idx: 0, label: '主手 Mainhand' },
    { key: 'Offhand', list: 'Offhand', idx: 0, label: '副手 Offhand' }
];

// 属性表（[名字, Base, Current, Min, Max, DefaultMin, DefaultMax]）
// ★ health 必须有，否则实体被判「无生命值」而丢弃；UI 只开放 Base/Current/Max，Min/Default 保持默认。
const FOX_ATTR_SPEC = [
    ['minecraft:luck',                0,  0, -1024, 1024, -1024, 1024],
    ['minecraft:health',             10, 10,     0,   10,     0,   10],
    ['minecraft:absorption',          0,  0,     0,   16,     0,   16],
    ['minecraft:movement',            0,  0,     0, 1024,     0, 1024],
    ['minecraft:underwater_movement', 0,  0,     0, 1024,     0, 1024],
    ['minecraft:lava_movement',       0,  0,     0, 1024,     0, 1024],
    ['minecraft:attack_damage',       2,  2,     0, 1024,     0, 1024],
    ['minecraft:follow_range',       16, 16,     0, 2048,     0, 2048],
    ['minecraft:knockback_resistance',0,  0,     0, 1024,     0, 1024],
    ['minecraft:horse.jump_strength', 0,  0,     0, 1024,     0, 1024],
    ['minecraft:zombie.spawn_reinforcements', 0, 0, 0, 1024, 0, 1024],
    ['minecraft:player.exhaustion',   0,  0,     0, 1024,     0, 1024],
    ['minecraft:player.hunger',       0,  0,     0,   20,     0,   20],
    ['minecraft:player.saturation',   0,  0,     0,   20,     0,   20],
    ['minecraft:player.level',        0,  0,     0, 1024,     0, 1024],
    ['minecraft:player.experience',   0,  0,     0, 1024,     0, 1024],
    ['minecraft:friction',            0,  0,     0, 1024,     0, 1024],
    ['minecraft:buoyant',             0,  0,     0, 1024,     0, 1024],
    ['minecraft:fall_damage',         0,  0,     0, 1024,     0, 1024]
];

// neteaseComponents：值本身是 JSON 字符串，UI 里给文本框直接改
const FOX_NETEASE_COMPONENTS = [
    { k: 'minecraft:collision_box',            v: '{"width":1,"height":1}' },
    { k: 'minecraft:free_camera_controlled',   v: '{"backwards_movement_modifier":1,"strafe_speed_modifier":1}' },
    { k: 'minecraft:friction_modifier',        v: '{"value":0.01}' },
    { k: 'minecraft:physics',                  v: '{"has_collision":true,"has_gravity":true}' },
    { k: 'minecraft:scale',                    v: '{"value":1}' }
];

function writeFoxNbtScalar(w, t, k, v) {
    if (t === 'byte') w.writeByte(k, v);
    else if (t === 'short') w.writeShort(k, v);
    else if (t === 'int') w.writeInt(k, v);
    else if (t === 'long') w.writeLong(k, v);
    else if (t === 'float') w.writeFloat(k, v);
    else if (t === 'double') w.writeDouble(k, v);
    else w.writeString(k, String(v));
}

// 按用户选择写预设标量字段：opts = { values:{键:值}, drop:{键:true} }
function writeFoxNbtSpecFields(w, opts) {
    const o = opts || {};
    const values = o.values || {};
    const drop = o.drop || {};
    FOX_NBT_SPEC.forEach(f => {
        if (drop[f.k]) return;
        const v = Object.prototype.hasOwnProperty.call(values, f.k) ? values[f.k] : f.v;
        writeFoxNbtScalar(w, f.t, f.k, v);
    });
}

// 实际会写入的预设字段条数（UI 展示 / 导出 toast 用）
function foxNbtCount(opts) {
    const o = opts || {};
    const drop = o.drop || {};
    return FOX_NBT_SPEC.filter(f => !drop[f.k]).length;
}

// 生成一个狐狸实体复合标签（字段对齐实测样本 72 项 / 2026-10-01）
// ★★ 为什么不再"精简"：Bedrock 加载结构里的实体时会做**完整性校验**，
//    缺 Attributes / definitions / neteaseComponents 等核心字段时，
//    实体会被当作"不完整实体"对待 —— 表现为：不刷新、不执行 playanimation、
//    或在部分版本被直接丢弃（用户实测：深色的"狐狸已识别"标识时有时无）。
//    因此这里按实测样本逐字段还原（值取"中立默认"，不含样本项目特有数据）。
// ★ Tags：位置法不写（狐狸是纯坐标载体，避免与其他装置的 @e[tag=..] 冲突）；
//   tag 识别法必须写（模型 tag + 方块名 tag），否则 @e[type=fox,tag=…] 选不中。
function writeFoxEntity(w, pos, uid, tags, foxNbt) {
    const end = w.beginListCompoundElem();
    w.writeString('identifier', 'minecraft:fox');

    // --- tag 识别法标记（可选）：Tags = [模型 tag, 方块名 tag] ---
    if (Array.isArray(tags) && tags.length) {
        const tagList = tags.map(t => structTagSafe(t)).filter((t, i, a) => t && a.indexOf(t) === i);
        w.beginList('Tags', _NBT.TAG_STRING, tagList.length);
        tagList.forEach(t => w.writeListString(t));
    }

    // --- 位置 / 朝向 ---
    w.beginList('Pos', _NBT.TAG_FLOAT, 3);
    pos.forEach(v => w.writeListFloat(v));
    w.beginList('Rotation', _NBT.TAG_FLOAT, 2);
    w.writeListFloat(0.0); w.writeListFloat(0.0);   // 朝 +Z 平视

    // --- 身份 ---
    w.writeLong('UniqueID', uid);

    // --- 运动向量（列表型，固定写入） ---
    //   Air 会在水下窒息、Motion 缺字段部分版本不给实体重力，因此保留原值：
    //   标量部分（Air / OnGround / … / boundZ）见文件顶部 FOX_NBT_SPEC，由用户决定写不写/改值。
    w.beginList('Motion', _NBT.TAG_FLOAT, 3);
    w.writeListFloat(0.0); w.writeListFloat(0.0); w.writeListFloat(0.0);

    // --- 装备槽（5 甲 + 主手 + 副手；字段须在，内容可由用户编辑） ---
    const equipOv = (foxNbt && foxNbt.equip) || {};
    const emptySlot = (slotKey) => {
        const o = equipOv[slotKey] || {};
        const name = String(o.Name == null ? '' : o.Name).trim();
        const count = Number(o.Count);
        const dmg = Number(o.Damage);
        const e = w.beginListCompoundElem();
        w.writeByte('Count', Number.isFinite(count) ? count : 0);
        w.writeShort('Damage', Number.isFinite(dmg) ? dmg : 0);
        w.writeString('Name', name);
        w.writeByte('WasPickedUp', 0);
        e();
    };
    w.beginList('Armor', _NBT.TAG_COMPOUND, 5);
    for (let i = 0; i < 5; i++) emptySlot('Armor#' + i);
    w.beginList('Mainhand', _NBT.TAG_COMPOUND, 1); emptySlot('Mainhand');
    w.beginList('Offhand',  _NBT.TAG_COMPOUND, 1); emptySlot('Offhand');

    // --- 效果 / 座位（空表，但字段须在） ---
    w.beginList('ActiveEffects', _NBT.TAG_COMPOUND, 0);
    w.beginList('ExtraSeats', _NBT.TAG_COMPOUND, 0);

    // --- ★ 属性表：health 必须有，否则实体被判定为"无生命值"而丢弃 ---
    {
        // 属性表见文件顶部 FOX_ATTR_SPEC；用户可改 Base / Current / Max，其余保持默认
        const attrOv = (foxNbt && foxNbt.attr) || {};
        const num = (v, def) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
        w.beginList('Attributes', _NBT.TAG_COMPOUND, FOX_ATTR_SPEC.length);
        FOX_ATTR_SPEC.forEach(a => {
            const o = attrOv[a[0]] || {};
            const e = w.beginListCompoundElem();
            w.writeFloat('Base', num(o.Base, a[1]));
            w.writeFloat('Current', num(o.Current, a[2]));
            w.writeFloat('DefaultMax', a[6]);
            w.writeFloat('DefaultMin', a[5]);
            w.writeFloat('Max', num(o.Max, a[4]));
            w.writeFloat('Min', a[3]);
            w.writeString('Name', a[0]);
            e();
        });
    }

    // --- ★ 定义 / 组件：网易版（China 版）必需；缺 definitions 时实体可能不被激活 ---
    {
        const defs = [
            '+minecraft:fox',
            '+##netease::minecraft:scale',
            '+##netease::minecraft:collision_box',
            '+##netease::minecraft:physics',
            '+##netease::minecraft:friction_modifier',
            '+##netease::minecraft:free_camera_controlled',
            '+##netease::minecraft:pushable',
            '+##netease::minecraft:knockback_resistance',
            '+##netease::minecraft:health'
        ];
        w.beginList('definitions', _NBT.TAG_STRING, defs.length);
        defs.forEach(s => w.writeListString(s));
    }
    {
        const endIC = w.beginCompound('internalComponents');
        endIC();
    }
    {
        // 组件值本身是 JSON 字符串，见文件顶部 FOX_NETEASE_COMPONENTS；用户可改，留空/非法回退默认
        const ncOv = (foxNbt && foxNbt.netease) || {};
        const endNC = w.beginCompound('neteaseComponents');
        FOX_NETEASE_COMPONENTS.forEach(c => {
            const uv = ncOv[c.k];
            const val = (uv == null || String(uv).trim() === '') ? c.v : String(uv);
            w.writeString(c.k, val);
        });
        endNC();
    }

    // --- 预设标量 NBT（用户可逐项勾选 / 改值，见 FOX_NBT_SPEC） ---
    writeFoxNbtSpecFields(w, foxNbt);

    end();
}

// 写入一个命令方块的 block_entity_data
// 字段与实测样本对齐（Version=44, id="CommandBlock", auto=1 ...）
function writeCommandBlockEntityData(w, cmdText, wx, wy, wz) {
    const end = w.beginCompound('block_entity_data');
    w.writeString('Command', cmdText);
    w.writeString('CustomName', '');
    w.writeByte('ExecuteOnFirstTick', 0);
    w.writeInt('LPCommandMode', 0);
    w.writeByte('LPCondionalMode', 0);
    w.writeByte('LPRedstoneMode', 0);
    w.writeLong('LastExecution', 0);
    w.writeString('LastOutput', '');
    w.beginList('LastOutputParams', _NBT.TAG_STRING, 0);
    w.writeInt('SuccessCount', 0);
    w.writeInt('TickDelay', 0);
    w.writeByte('TrackOutput', 0);
    w.writeInt('Version', 44);
    w.writeByte('auto', 1);
    w.writeByte('conditionMet', 1);
    w.writeByte('conditionalMode', 0);
    w.writeString('id', 'CommandBlock');
    w.writeByte('isMovable', 1);
    w.writeByte('powered', 0);
    w.writeInt('x', wx);
    w.writeInt('y', wy);
    w.writeInt('z', wz);
    end();
}

// --- 承载布局规划：用户可指定 长(Z) / 宽(X) / 高(Y)（2026-11-02 重写）------------
// ★ 结构坐标系与 .mcstructure 一致：size = [X, Y, Z]（宽 / 高 / 长）。
// ★ 宽度必须偶数：奇数 x = 命令方块列，偶数 x = 该车道命令方块的狐狸列（狐狸恒在 x-1）。
//   每条车道恒占 2 列 ⇒ 车道数 lanes = 宽/2，实际宽 = lanes×2。
// ★ 车道之间用【空指令命令方块】当导线跨接（用户 2026-11-02 授权）：导线不需要狐狸，
//   因此它可以走在偶数 x（狐狸列）以及任何空格上，只要相邻格面贴面、facing 指向下一格。
// ★ 跨接走「走廊列」：多车道时 Z 两端各留 1 列走廊（z=0 与 z=sizeZ-1），真实方块只占
//   z=1..sizeZ-2。车道蛇形必然在某端收尾，从那一端的走廊列横穿到下一车道 ⇒ 走廊列从不放真实块，
//   下一车道的狐狸格永远空着，导线不会把狐狸挤进方块里。
// ★ 车道内 = Z 蛇形 + Y 层交替：lane0 从 y=0 向上、lane1 从 y=sizeY-1 向下 ……
//   每层沿 Z 折返；首层方向由「从哪条走廊进入」决定（低端进=+Z、高端进=−Z），保证接得上。
// ★ 用户给的尺寸装不下 n 个方块时，只把「高」自动加上去（预览里显示实际尺寸），
//   绝不用网格散开（那会断链）。
// ★ 多动画（2026-11-07）：结构导出的承载单位是「一条指令」而不是「一个方块」——
//   一个方块有多层动画时，每层各占一个命令方块格（同一部链），否则附加动画会整体丢失。
function getMcStructureUnits(opts) {
    opts = opts || {};
    const src = (typeof getBoneOrderedBlocks === 'function' ? getBoneOrderedBlocks() : blocks)
        .filter(b => b && typeof b === 'object');
    const units = [];
    // tag 识别法：前缀强制为专用模板（临时顶替 exportPrefix，生成完立刻还原，不影响命令列表导出）
    const tagMode = isTagIdentifyMode(opts);
    const savedPrefix = exportPrefix;
    if (tagMode) exportPrefix = structTagPrefixTemplate(opts.modelTag);
    try {
        for (const b of src) {
            let ts = null;
            try { if (typeof getCommandTextsForBlock === 'function') ts = getCommandTextsForBlock(b, opts); } catch (_) { ts = null; }
            if (ts && ts.length) ts.forEach(t => units.push({ blk: b, text: t.text }));
            else units.push({ blk: b, text: '' });
        }
    } finally {
        if (tagMode) exportPrefix = savedPrefix;
    }
    return { units: injectChainInitDeclarations(units), srcCount: src.length };
}
// ★★【首帧 unknown variable 修复 2026-11-08】链式命令方块按 units 顺序执行，但骨骼/IK 链存在
//   「先读后写」的反馈边（链头读链尾的 IK 求解量、point 目标读末块等）⇒ 游戏第一帧读到未赋值的
//   `t.*` 会报 `unknown variable` 并整条指令失效（连锁后面全部不写，形成级联报错）。
//   这里在「每个方块的第一条指令」里补一次性的全局声明：
//     v.fmbe_init==0?(t.a=0;t.b=0;...);v.fmbe_init=1;
//   · v.fmbe_init 是狐狸自己的变量（默认 0）⇒ 每只狐狸只在第一帧初始化一次，
//     之后不再清零，IK/父级反馈量得以按「上一 tick」正常传递；
//   · 只初始化「本方块会读、但链上此前没有任何指令写过」的名字（通常就是 IK/反馈边），注入量极小；
//   · 语法与关键帧导出同款（`cond?(stmt;stmt;);`），游戏已验证可解析。
function injectChainInitDeclarations(units) {
    if (!Array.isArray(units) || !units.length) return units;
    const globalWritten = new Set();       // 链上此前所有指令已写过的 t.* 名
    let i = 0;
    while (i < units.length) {
        const blk = units[i].blk;
        let j = i;
        const localWritten = new Set();    // 本方块此前指令写过的 t.* 名
        const missing = new Set();         // 本方块读到、但链上此前还没写过的名字
        while (j < units.length && units[j].blk === blk) {
            const txt = String(units[j].text || '');
            const re = /t\.([A-Za-z_][A-Za-z0-9_]*)\s*(=)?/g;
            const reads = [];
            const writes = [];
            let m;
            while ((m = re.exec(txt)) !== null) {
                if (m[2] === '=') writes.push(m[1]); else reads.push(m[1]);
            }
            for (const n of reads) if (!globalWritten.has(n) && !localWritten.has(n)) missing.add(n);
            for (const n of writes) { localWritten.add(n); globalWritten.add(n); }
            j++;
        }
        if (missing.size && typeof units[i].text === 'string' && units[i].text) {
            const decl = Array.from(missing).map(n => `t.${n}=0;`).join('');
            // ★★★【2026-11-10 首帧报错根因修复】`v.fmbe_init` 在狐狸身上**第一次被读取时根本不存在**。
            //   真机遇到未初始化变量会直接抛 `unhandled request for unknown variable 'variable.fmbe_init'`
            //   ⇒ 整条 playanimation 指令当场作废 ⇒ 后面 `t.<id>_*` 全都没发布 ⇒ 子块读父级 t.* 连锁报
            //   `unknown variable`（用户实测那一大片红字，顺序完全对得上）。旧写法只在模拟器的宽松解释器里成立。
            //   官方写法 = 空值合并 `??`（1.18+）：`variable.x = (variable.x ?? 1.2) + 0.3;`
            //   先安全取一次默认值，再判 `==0`，这一步永不报错。
            const init = `v.fmbe_init=(v.fmbe_init??0);v.fmbe_init==0?(${decl});v.fmbe_init=1;`;
            const txt = units[i].text;
            const pIdx = txt.indexOf('playanimation');
            const q = txt.indexOf('"', pIdx >= 0 ? pIdx : 0);
            if (q >= 0) units[i].text = txt.slice(0, q + 1) + init + txt.slice(q + 1);
        }
        i = j;
    }
    return units;
}
// 是否启用「双 tag 识别法」（模型 tag 非空才算）
function isTagIdentifyMode(opts) {
    return !!(opts && opts.tagMode && structTagSafe(opts.modelTag));
}

function planMcStructureLayout(opts) {
    opts = opts || {};
    const tagMode = isTagIdentifyMode(opts);
    const _pack = Array.isArray(opts.units) ? { units: opts.units, srcCount: -1 } : getMcStructureUnits(opts);
    const srcBlocks = _pack.units;
    const n = srcBlocks.length;
    if (n === 0) throw new Error('没有可导出的方块');

    const dims = opts.dims || {};
    const askX = Math.max(tagMode ? 1 : 2, Math.floor(Number(dims.sizeX) || 2));
    const askY = Math.max(1, Math.floor(Number(dims.sizeY) || 1));
    const askZ = Math.max(1, Math.floor(Number(dims.sizeZ) || 1));
    // 位置法：宽 = 车道数×2（奇数列命令方块、偶数列狐狸）
    // tag 法：没有狐狸列 ⇒ 每一列都能放命令方块（整片实心），故 lanes = 宽
    const lanes = Math.max(1, tagMode ? askX : Math.floor(askX / 2));
    // tag 法（2026-11-08 用户要求）：狐狸改放到【长方体顶部】，不再占用侧边空列。
    // 实体必须落在结构尺寸内（否则部分版本导入时会被丢弃）⇒ 顶部额外留 1 层空层给狐狸。
    const sizeX = tagMode ? lanes : (lanes * 2);
    // 位置法多车道时 Z 两端各留 1 列走廊跨道；tag 法不用走廊（每层沿 X 逐行铺满整块）
    const sizeZ = (!tagMode && lanes > 1) ? Math.max(3, askZ) : askZ;
    const ZR = (!tagMode && lanes > 1) ? sizeZ - 2 : sizeZ;   // 位置法每条车道的真实 Z 列数
    const zLo = (!tagMode && lanes > 1) ? 1 : 0;
    const zHi = (!tagMode && lanes > 1) ? sizeZ - 2 : sizeZ - 1;
    // 方块实际需要的层数；tag 法再加 1 层空层放狐狸（狐狸站在长方体顶部）
    const blockLayers = Math.max(askY, Math.ceil(n / (lanes * ZR)));
    const sizeY = tagMode ? (blockLayers + 1) : blockLayers;

    const chain = [];              // 链路顺序：{ lx, ly, lz, real, blk? }
    let k = 0;
    if (tagMode) {
        // ★★ tag 法（2026-11-08 用户反馈后重写）：【层优先的实心蛇形】。
        //   旧实现「先把一条车道铺满再换列」⇒ 指令装不满全部车道时只剩一个 L 形（用户报障）。
        //   现在：每层 Y 内沿 Z 逐行、行内沿 X 走满所有车道列；换 Z 行 / 换 Y 层都只跨相邻格，
        //   所以铺出来是【完整长方体】，只有最顶一层可能不满（用户明确允许「顶部不满一个面」）。
        //   · 每格都是真实命令方块，不存在空导线/走廊格；
        //   · 车道间不需要额外跨接块（行内 X 方向直接相邻）。
        let zPlus = true;   // 本层 Z 遍历方向
        let xPlus = true;   // 当前 Z 行的 X 遍历方向
        for (let y = 0; y < sizeY && k < n; y++) {
            for (let zi = 0; zi < sizeZ && k < n; zi++) {
                const z = zPlus ? zi : (sizeZ - 1 - zi);
                for (let xi = 0; xi < lanes && k < n; xi++) {
                    const x = xPlus ? xi : (lanes - 1 - xi);
                    chain.push({ lx: x, ly: y, lz: z, real: true, blk: srcBlocks[k] });
                    k++;
                }
                xPlus = !xPlus;      // 换 Z 行：X 方向折返（下一行从本行末格正上方 → 实为同列邻格接上）
            }
            zPlus = !zPlus;          // 换 Y 层：Z 方向折返
            // ★ xPlus 不再翻转：换层第一格就在上一层末格的正上方（同 x 同 z），
            //   翻转后的方向正好从该端走回另一端，整行仍然铺满。
        }
    } else {
        let entryPlus = true;          // true = 从 z 低端进入（首层 +Z）
        for (let L = 0; L < lanes && k < n; L++) {
            const cx = 1 + 2 * L;       // 本车道命令方块列（奇数列）
            const dy = (L % 2 === 0) ? 1 : -1;         // 车道内 Y 走向交替
            const yStart = (L % 2 === 0) ? 0 : sizeY - 1;
            for (let j = 0; j < sizeY && k < n; j++) {
                const y = yStart + dy * j;
                const zPlus = entryPlus ? (j % 2 === 0) : (j % 2 !== 0);   // 每层沿 Z 折返
                for (let t = 0; t < ZR && k < n; t++) {
                    const z = zPlus ? (zLo + t) : (zHi - t);
                    chain.push({ lx: cx, ly: y, lz: z, real: true, blk: srcBlocks[k] });
                    k++;
                }
            }
            // 本车道已铺满、且还有方块 → 用空指令导线从「收尾那一端的走廊」跨到下一车道
            if (k < n && L + 1 < lanes) {
                const last = chain[chain.length - 1];
                const cornerZ = (last.lz === zLo) ? (zLo - 1) : (zHi + 1);   // 相邻的走廊列
                chain.push({ lx: cx, ly: last.ly, lz: cornerZ, real: false });      // 挪到走廊
                chain.push({ lx: cx + 1, ly: last.ly, lz: cornerZ, real: false });  // 跨过下一车道狐狸列
                chain.push({ lx: cx + 2, ly: last.ly, lz: cornerZ, real: false });  // 落到下一车道命令列
                entryPlus = (cornerZ === zLo - 1);                                  // 下一车道从这条走廊进入
            }
        }
    }

    // 逐格 facing：指向链路下一格（0=下 1=上 2=北(-Z) 3=南(+Z) 4=西 5=东）
    // ★ 链尾【沿最后一步的方向继续朝外】，不能随便给一个朝向 —— 否则可能指回链上的格子
    //   形成闭环（连锁会互相重复触发）。
    const dirOf = (from, to) => {
        const dx = to.lx - from.lx, dyy = to.ly - from.ly, dz = to.lz - from.lz;
        return dx === 1 ? 5 : dx === -1 ? 4 : dyy === 1 ? 1 : dyy === -1 ? 0 : dz === 1 ? 3 : 2;
    };
    chain.forEach((c, i) => {
        if (i + 1 < chain.length) c.facing = dirOf(c, chain[i + 1]);
        else if (i > 0) c.facing = dirOf(chain[i - 1], c);   // 链尾：延续最后一步方向
        else c.facing = 3;
    });

    // tag 识别法：所有狐狸叠在同一个坐标 —— 长方体的顶部空层正中（落在结构尺寸内）
    const modelTag = tagMode ? structTagSafe(opts.modelTag) : '';
    const foxPosLocal = tagMode
        ? [lanes / 2, blockLayers + 0.5, sizeZ / 2]
        : null;

    return {
        chain, n, sizeX, sizeY, sizeZ, lanes, ZR, blockLayers,
        blockCount: _pack.srcCount,
        dummyCount: chain.length - n,
        tagMode, modelTag, foxPosLocal,
        asked: { sizeX, sizeY: askY, sizeZ: askZ }
    };
}

// --- 主生成函数 ------------------------------------------------------------
// 参数：{ox, oy, oz, dims:{sizeX, sizeY, sizeZ}}（原点可选，默认 ox=-1 / oy=0 / oz=0）
// 返回 Uint8Array（未压缩 .mcstructure 字节）
function buildMcStructureBytes(opts) {
    opts = opts || {};
    const srcBlocks = (typeof getBoneOrderedBlocks === 'function' ? getBoneOrderedBlocks() : blocks)
        .filter(b => b && typeof b === 'object');
    // ★★ 隐藏的方块【照常导出】——本项目的既定约定是「隐藏 ≠ 删除」，
    //   眼睛只影响显示与选中，不影响导出（见 isBlockHidden 处的注释）。
    //   旧实现按 isBlockHidden 过滤 → 用户把大部分方块收进隐藏文件夹后，
    //   几十个方块导出只剩 3 个（实测：5 块隐藏 3 块 → 只导出 2 块）。
    const list = srcBlocks;
    if (list.length === 0) throw new Error('没有可导出的方块');

    // 说明：这里【不再】用方块自身坐标算包围盒（旧实现正是栽在这上面，见下方注释）。
    //      方块只作为「第几个」的序号来源，落位完全由布局规则决定。

    // ★★ 承载布局（2026-11-02 重写）：尺寸与落位全部交给 planMcStructureLayout。
    //    · 用户可在导出预览里指定 长(Z) / 宽(X) / 高(Y)；宽 = 车道数×2（奇数 x=命令方块列、偶数 x=狐狸列）。
    //    · 车道间用「空指令命令方块」当导线跨接（导线无需狐狸），见 planMcStructureLayout 长注释。
    //    · 相邻两格恒面贴面 + 逐格 facing 指向下一格 ⇒ 连锁能一路传下去。
    const plan = planMcStructureLayout(opts);
    const chain = plan.chain;
    const n = plan.n;
    // 原点取 ox = -1，使狐狸落在 local x=0、命令方块落在 local x=1（宽度恒为偶数，恰好包住两列）。
    const ox = (opts.ox !== undefined) ? opts.ox : -1;
    const oy = (opts.oy !== undefined) ? opts.oy : 0;
    const oz = (opts.oz !== undefined) ? opts.oz : 0;
    const sx = plan.sizeX;
    const sy = plan.sizeY;
    const sz = plan.sizeZ;

    // 2) 调色板。★实测样本调色板第 0 项恒为 minecraft:air（val=0）——
    //    这是 Bedrock 结构的既定约定：空气必须占 0 号位，其余方块从 1 开始编号。
    //    （旧实现把 minecraft:block 放 0 号位 → 与游戏约定不符，导入时被拒。）
    //    ★ val 是 TAG_SHORT（实测 type=2），不是 TAG_INT。
    const PAL_AIR      = { name: 'minecraft:air',                  states: {}, val: 0, version: 18168865 };
    // ★ states 类型严格对齐实测样本：conditional_bit=BYTE、facing_direction=INT
    // ★ 同一性质但朝向不同的方块必须各占一条调色板项 ⇒ 按链路里【实际用到】的朝向来建。
    const mkCmdPal = (dir, val) => ({
        name: 'minecraft:chain_command_block',
        states: { conditional_bit: { t: _NBT.TAG_BYTE, v: 0 }, facing_direction: { t: _NBT.TAG_INT, v: dir } },
        val, version: 18168865
    });
    const facingUsed = Array.from(new Set(chain.map(c => c.facing))).sort((a, b) => a - b);
    const palette = [PAL_AIR];
    const palOfFacing = new Map();
    facingUsed.forEach((dir, i) => { palOfFacing.set(dir, i + 1); palette.push(mkCmdPal(dir, i + 1)); });

    // 3) block_indices：两层
    // ★★★【块索引约定 —— 致命；2026-11-02 定稿：Z 最快 → Y → X】
    //    官方文档（wiki.bedrock.dev/nbt/mcstructure，TrimMCStruct 译）原文：
    //      「将结构中每个方块依照从 Z 轴到 Y 轴到 X 轴且沿轴正方向的顺序一字排开」
    //      size=[2,3,4] 时索引顺序 = (0,0,0..3),(0,1,0..3),(0,2,0..3),(1,0,0..3),(1,1,..),…
    //    ⇒ i = lx*(sy*sz) + ly*sz + lz
    //
    //    ★★★ 旧公式 i = lz + lx*sz + ly*sz*sx（Z→X→Y）是错的：sy=1 的样本（size=[2,1,4]）
    //      无法区分后两轴顺序，所以 2026-10-01 的「Z 最快」结论只在 Y 单层时成立。
    //      3D 折叠后按旧公式落位，游戏实际解码成 x'=i/(sy*sz)、y'=(i/sz)%sy ⇒
    //      每层只出现 1 格厚、隔一层有空隙的「层状板」——就是用户 2026-11-02 报的
    //      「上下两层的命令方块根本没连一起」。
    const total = sx * sy * sz;
    // ★ 空格子约定（实测样本口径）：
    //   layer0（主层）空格 = 0 —— 即调色板 0 号位的 minecraft:air。
    //   layer1（第二层：水/覆雪）无内容 = -1 —— 实测样本整层皆 -1。
    //   两层语义不同，切勿统一填同一个值。
    const layer0 = new Int32Array(total).fill(0);
    const layer1 = new Int32Array(total).fill(-1);
    // ★★块索引：Z 最快 → Y → X（见上方长注释）。参数为结构内局部坐标。
    const idxOfLocal = (lx, ly, lz) => lz + ly * sz + lx * sz * sy;
    const idxOf = (x, y, z) => idxOfLocal(x - ox, y - oy, z - oz);

    // 4) 落位：chain 里每一格 = 一个 chain_command_block
    //    · real=true  → 承载指令，且配一只狐狸在 x-1（与模板前缀 `positioned ~-1~~` 对应）
    //    · real=false → 空指令导线（Command 写空串），不配狐狸
    const blockEntityData = [];   // { idx, cmd, wx, wy, wz }
    const foxEntities = [];       // { pos:[x,y,z], tags?:[模型tag, 方块名tag] }
    // ★ tag 识别法：狐狸不再跟命令方块 1:1 落位（否则一个方块的多层动画会分摊到多只狐狸），
    //   而是「每个方块一只狐狸」，全部叠在同一个坐标，靠 tag 选中 ⇒ 同一只狐狸可叠加任意多层控制器。
    const tagMode = !!plan.tagMode;
    // 预设狐狸 NBT 的用户选择（{values, drop}，每只狐狸都写，位置法/tag 法通用）
    const foxNbtOpts = opts.foxNbt || null;
    const extraNbtCount = foxNbtCount(foxNbtOpts);
    const tagFoxPos = tagMode
        ? [ox + plan.foxPosLocal[0], oy + plan.foxPosLocal[1], oz + plan.foxPosLocal[2]]
        : null;
    const tagFoxSeen = new Set();
    chain.forEach(c => {
        const i = idxOfLocal(c.lx, c.ly, c.lz);
        if (i < 0 || i >= total) return;
        layer0[i] = palOfFacing.get(c.facing);
        const wx = ox + c.lx, wy = oy + c.ly, wz = oz + c.lz;
        if (c.real) {
            // ★★★ 承载指令：c.blk 现在是「承载单位」{ blk, text }（一个方块的多层动画各占一格）。
            //   优先用预先算好的 text，避免再次走 getCommandTextForBlock 丢失多层信息。
            const blkObj = (c.blk && c.blk.block) ? c.blk.block : (c.blk && c.blk.blk) ? c.blk.blk : c.blk;
            const cmd = (c.blk && typeof c.blk.text === 'string') ? c.blk.text : getBlockStructureCommand(blkObj);
            // ★★★ block_entity_data 的 x/y/z 必须写【结构内的世界格坐标】，
            //      绝不能写方块自己的原始坐标（否则格子对、实体散落 → 锯齿/阶梯）。
            blockEntityData.push({ idx: i, cmd, wx, wy, wz });
            if (tagMode) {
                const bkey = (blkObj && (blkObj.id || blkObj)) || null;
                const bTag = structBlockNameTag(blkObj);
                if (bkey && !tagFoxSeen.has(bkey)) {
                    tagFoxSeen.add(bkey);
                    foxEntities.push({ pos: tagFoxPos, tags: [plan.modelTag, bTag].filter(Boolean) });
                }
            } else {
                foxEntities.push({ pos: getFoxSpawnPosForCommandBlock(wx, wy, wz) });
            }
        } else {
            blockEntityData.push({ idx: i, cmd: '', wx, wy, wz });
        }
    });

    // 5) 序列化
    const w = new NbtWriter();
    w._u8(_NBT.TAG_COMPOUND); w._utf8('');   // 根（空名）
    w.writeInt('format_version', 1);
    w.writeIntList('size', [sx, sy, sz]);   // ★必须是 List<int>，见 writeIntList 注释
    {
        const endStruct = w.beginCompound('structure');
        // block_indices
        w.beginList('block_indices', _NBT.TAG_LIST, 2);
        // layer0：外层列表元素是「TAG_List<int>」，故元素头 = u8(TAG_INT) + i32(count)
        w._u8(_NBT.TAG_INT); w._i32(total); layer0.forEach(v => w.writeListInt(v));
        // layer1
        w._u8(_NBT.TAG_INT); w._i32(total); layer1.forEach(v => w.writeListInt(v));
        // entities
        w.beginList('entities', _NBT.TAG_COMPOUND, foxEntities.length);
        foxEntities.forEach((fe, fi) => writeFoxEntity(w, fe.pos, -(1000000 + fi), fe.tags, foxNbtOpts));
        // palette
        {
            const endPal = w.beginCompound('palette');
            const endDef = w.beginCompound('default');
            // block_palette
            w.beginList('block_palette', _NBT.TAG_COMPOUND, palette.length);
            palette.forEach(entry => {
                const endE = w.beginListCompoundElem();
                w.writeString('name', entry.name);
                const endS = w.beginCompound('states');
                // ★★ 方块状态的类型必须与 Bedrock 原生状态表严格一致（实测样本口径）：
                //    conditional_bit     → TAG_BYTE(1)
                //    facing_direction    → TAG_INT(3)
                //    （旧实现统一 writeInt → conditional_bit 写成 Int，与原生不符；
                //      游戏对方块状态做严格类型校验，类型不符可能被判非法状态而丢弃方块。）
                Object.keys(entry.states).forEach(k => {
                    const sv = entry.states[k];
                    if (sv && typeof sv === 'object' && sv.t !== undefined) {
                        // 显式类型：{t: _NBT.TAG_XXX, v: 值}
                        if (sv.t === _NBT.TAG_BYTE)       w.writeByte(k, sv.v);
                        else if (sv.t === _NBT.TAG_SHORT) w.writeShort(k, sv.v);
                        else if (sv.t === _NBT.TAG_LONG)  w.writeLong(k, sv.v);
                        else                              w.writeInt(k, sv.v);
                    } else {
                        w.writeInt(k, sv);
                    }
                });
                endS();
                w.writeShort('val', entry.val);          // ★TAG_SHORT(2)，实测样本口径
                w.writeInt('version', entry.version);
                endE();
            });
            // block_position_data
            {
                const endBPD = w.beginCompound('block_position_data');
                blockEntityData.forEach(be => {
                    const endOne = w.beginCompound(String(be.idx));
                    writeCommandBlockEntityData(w, be.cmd, be.wx, be.wy, be.wz);
                    endOne();
                });
                endBPD();
            }
            endDef();
            endPal();
        }
        endStruct();
    }
    w.writeIntList('structure_world_origin', [ox, oy, oz]);   // ★必须是 List<int>
    w._u8(_NBT.TAG_END);   // ★ 根 compound 的结束标记（漏写 → 整个文件非法、游戏拒绝导入）
    return {
        bytes: w.finish(), size: [sx, sy, sz], origin: [ox, oy, oz],
        blockCount: plan.n, entityCount: foxEntities.length, dummyCount: plan.dummyCount,
        extraNbtCount,
        tagMode: !!plan.tagMode, modelTag: plan.modelTag || ''
    };
}

// 触发下载 .mcstructure（二进制）
// opts = { dims: {sizeX(宽), sizeY(高), sizeZ(长)} }（可选，默认 宽2 × 自动高 × 自动长）
function downloadMcStructure(opts) {
    let res;
    try {
        res = buildMcStructureBytes(opts);
    } catch (e) {
        showToast('生成结构失败：' + (e && e.message ? e.message : e));
        return;
    }
    const blob = new Blob([res.bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(currentProjectName || 'structure')}_${Date.now()}.mcstructure`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast(`已导出 .mcstructure：${res.blockCount} 方块 + ${res.dummyCount} 导线 · ${res.entityCount} 狐狸 · 尺寸 ${res.size.join('×')}`
        + (res.tagMode ? ` · tag 识别「${res.modelTag}」` : '')
        + (res.extraNbtCount ? ` · 附加 NBT ${res.extraNbtCount} 项` : ''));
}

