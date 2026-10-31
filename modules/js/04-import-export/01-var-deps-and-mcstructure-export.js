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
    const localEntries = Array.from(block.scope.vars.entries()).map(([name, def]) => ({
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
function getCommandTextForBlock(block) {
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
    } else if (isBoneChild) {
        // 骨骼子块：自驱动输入（相对父旋转 + 缩放），世界坐标由下方「跟随父块」公式给出
        varsStr = getBoneInputConstantsString(block);
    } else {
        // 非骨骼动画：输出常量数值（molang 表达式求值为当前值），保证导入后外观一致
        varsStr = hasBoneAnim ? getOrderedAssignmentsString(block) : getConstantAssignmentsString(block);
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
        const _followDone = isPureSnapBone(block)
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
    return exportPrefix + blockIdPrefix + groupPrefix + parentBonePrefix + boneTag + varsStr + suffix;
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
//     索引 i = x + z*sx + y*sx*sz（X 变化最快），**不是**坐标。
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
function getBlockStructureCommand(block) {
    // ★ 不再静默吞异常：命令方块没有指令 = 功能失效，必须让调用方发现。
    //   （旧实现 catch 后返回 '' → 结构、尺寸、位置全对，唯独命令方块是空的，
    //     极难从产物上看出根因；见 2026-10-01 "命令方块里啥也没有" 报障。）
    if (!block || typeof block !== 'object') throw new Error('getBlockStructureCommand: 入参不是方块对象');
    return getCommandTextForBlock(block);
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
// ★ 承载布局（用户定稿）：命令方块沿 Z 正轴依次排开，狐狸在各自命令方块的 x-1 处。
function getFoxSpawnPosForCommandBlock(cmdX, cmdY, cmdZ) {
    return [cmdX - 1 + 0.5, cmdY + 0.0, cmdZ + 0.5];
}

// 生成一个狐狸实体复合标签（字段对齐实测样本 72 项 / 2026-10-01）
// ★★ 为什么不再"精简"：Bedrock 加载结构里的实体时会做**完整性校验**，
//    缺 Attributes / definitions / neteaseComponents 等核心字段时，
//    实体会被当作"不完整实体"对待 —— 表现为：不刷新、不执行 playanimation、
//    或在部分版本被直接丢弃（用户实测：深色的"狐狸已识别"标识时有时无）。
//    因此这里按实测样本逐字段还原（值取"中立默认"，不含样本项目特有数据）。
// ★ 有意【不写】的字段：
//    Tags —— 样本是 ["zscale","wiki:fmbe","expro"]（其项目私有标记）；
//            本工具的狐狸是纯指令载体，不带 Tag 以免与其他装置的 @e[tag=..] 冲突。
function writeFoxEntity(w, pos, uid) {
    const end = w.beginListCompoundElem();
    w.writeString('identifier', 'minecraft:fox');

    // --- 位置 / 朝向 ---
    w.beginList('Pos', _NBT.TAG_FLOAT, 3);
    pos.forEach(v => w.writeListFloat(v));
    w.beginList('Rotation', _NBT.TAG_FLOAT, 2);
    w.writeListFloat(0.0); w.writeListFloat(0.0);   // 朝 +Z 平视

    // --- 身份 ---
    w.writeLong('UniqueID', uid);
    w.writeLong('OldEntityUniqueID', -1);

    // --- 运动 / 生存（缺 Air 会在水下窒息、缺 Motion 部分版本不给实体重力） ---
    w.beginList('Motion', _NBT.TAG_FLOAT, 3);
    w.writeListFloat(0.0); w.writeListFloat(0.0); w.writeListFloat(0.0);
    w.writeShort('Air', 300);
    w.writeByte('OnGround', 0);
    w.writeFloat('FallDistance', 0);
    w.writeShort('DeathTime', 0);
    w.writeShort('HurtTime', 0);
    w.writeByte('Dead', 0);
    w.writeByte('Invulnerable', 1);      // 防止狐狸被打死导致指令载体消失
    w.writeByte('ignoreHurt', 1);
    w.writeByte('Fire', -1);
    w.writeShort('FireHurtTime', 0);

    // --- 狐狸本体状态 ---
    w.writeByte('IsAutonomous', 1);
    w.writeByte('Persistent', 1);
    w.writeByte('IsGlobal', 1);          // 全局实体：不随区块卸载，保证指令载体常在
    w.writeByte('IsTamed', 0);
    w.writeByte('IsTrusting', 0);
    w.writeByte('IsBaby', 0);
    w.writeByte('IsAngry', 0);
    w.writeByte('Sitting', 0);
    w.writeByte('SittingDown', 0);
    w.writeByte('ShowBottom', 1);
    w.writeByte('Saddled', 0);
    w.writeByte('Sheared', 0);
    w.writeByte('Chested', 0);
    w.writeInt('Variant', 0);            // ★TAG_INT(3)，实测样本口径（写成 Byte 会被判类型不符）
    w.writeInt('MarkVariant', 0);
    w.writeInt('SkinID', 0);
    w.writeByte('Color', 0);
    w.writeByte('Color2', 0);

    // --- AI 开关（全关：载体狐不许乱跑） ---
    w.writeByte('IsCloseAi', 0);
    w.writeByte('IsEating', 0);
    w.writeByte('IsGliding', 0);
    w.writeByte('IsIllagerCaptain', 0);
    w.writeByte('IsOrphaned', 0);
    w.writeByte('IsOutOfControl', 0);
    w.writeByte('IsPregnant', 0);
    w.writeByte('IsRoaring', 0);
    w.writeByte('IsScared', 0);
    w.writeByte('IsStunned', 0);
    w.writeByte('IsSwimming', 0);
    w.writeByte('NaturalSpawn', 0);
    w.writeByte('LootDropped', 0);
    w.writeByte('canPickupItems', 0);
    w.writeByte('hasSetCanPickupItems', 1);
    w.writeByte('collidableMob', 1);
    w.writeByte('needDispatchKnock', 0);
    w.writeByte('hasBoundOrigin', 0);
    w.writeByte('Surface', 0);

    // --- 维度 / 传送 / 目标 ---
    w.writeInt('LastDimensionId', 0);
    w.writeInt('PortalCooldown', 0);
    w.writeLong('TargetID', -1);
    w.writeLong('LeasherID', -1);
    w.writeLong('OwnerNew', 0);

    // --- 交易 / 战斗数值（中立默认） ---
    w.writeInt('TradeExperience', 0);
    w.writeInt('TradeTier', 0);
    w.writeInt('Strength', 0);
    w.writeInt('StrengthMax', 0);
    w.writeInt('boundX', 0);
    w.writeInt('boundY', 0);
    w.writeInt('boundZ', 0);

    // --- 装备槽（5 甲 + 主手 + 副手，须为空但字段存在） ---
    const emptySlot = () => {
        const e = w.beginListCompoundElem();
        w.writeByte('Count', 0);
        w.writeShort('Damage', 0);
        w.writeString('Name', '');
        w.writeByte('WasPickedUp', 0);
        e();
    };
    w.beginList('Armor', _NBT.TAG_COMPOUND, 5);
    for (let i = 0; i < 5; i++) emptySlot();
    w.beginList('Mainhand', _NBT.TAG_COMPOUND, 1); emptySlot();
    w.beginList('Offhand',  _NBT.TAG_COMPOUND, 1); emptySlot();

    // --- 效果 / 座位（空表，但字段须在） ---
    w.beginList('ActiveEffects', _NBT.TAG_COMPOUND, 0);
    w.beginList('ExtraSeats', _NBT.TAG_COMPOUND, 0);

    // --- ★ 属性表：health 必须有，否则实体被判定为"无生命值"而丢弃 ---
    {
        const attrs = [
            // [名字, Base, Current, Min, Max, DefaultMin, DefaultMax]
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
        w.beginList('Attributes', _NBT.TAG_COMPOUND, attrs.length);
        attrs.forEach(a => {
            const e = w.beginListCompoundElem();
            w.writeFloat('Base', a[1]);
            w.writeFloat('Current', a[2]);
            w.writeFloat('DefaultMax', a[6]);
            w.writeFloat('DefaultMin', a[5]);
            w.writeFloat('Max', a[4]);
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
        const endNC = w.beginCompound('neteaseComponents');
        w.writeString('minecraft:collision_box', '{"width":1,"height":1}');
        w.writeString('minecraft:free_camera_controlled', '{"backwards_movement_modifier":1,"strafe_speed_modifier":1}');
        w.writeString('minecraft:friction_modifier', '{"value":0.01}');
        w.writeString('minecraft:physics', '{"has_collision":true,"has_gravity":true}');
        w.writeString('minecraft:scale', '{"value":1}');
        endNC();
    }

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

// --- 主生成函数 ------------------------------------------------------------
// 参数：{ox, oy, oz} 结构原点（可选，默认 ox=-1 / oy=0 / oz=0）
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

    // ★★ 承载布局（用户定稿）：命令方块沿 **Z 正轴** 一个接一个横向排开，
    //    狐狸放在对应命令方块的 **x-1** 处。
    //    ⇒ 结构里只有两列方块 + 一条 Z 车道：
    //       local x=0 → 狐狸列；local x=1 → 命令方块列；local y=0 → 唯一一层；z = 0..n-1。
    //
    //    ★★★ 尺寸必须由【最终落位】推导，绝不能用模型自身的坐标跨度：
    //      命令方块只占 1 列 X、1 层 Y、n 格 Z；狐狸只占 1 列 X。
    //      ⇒ 真实尺寸恒为 sx = 2、sy = 1、sz = n。
    //      旧实现拿 minX/minY/maxX/maxY 算 sx/sy（= 模型的 X/Y 跨度），而命令方块又摆在别处
    //      ⇒ 盒子比实际内容大一圈（用户实测：2 宽 2 高的模型 → size 报成 [3,2,12]，
    //        纯直线本应是 [2,1,12]），预览里方块浮在大片空白中间、看着像"螺旋"。
    const n = list.length;
    // 载体方块：只作为「第几个」的序号来源（落位完全由布局规则决定，与方块自身坐标无关）
    const placed = list;
    // 原点取 ox = -1，使狐狸落在 local x=0、命令方块落在 local x=1 —— sx=2 恰好包住两列。
    const ox = (opts.ox !== undefined) ? opts.ox : -1;
    const oy = (opts.oy !== undefined) ? opts.oy : 0;
    const oz = (opts.oz !== undefined) ? opts.oz : 0;
    const sx = 2;                       // 两列：狐狸 + 命令方块
    const sy = 1;                       // 一层
    const sz = Math.max(1, n);          // 车道长度 = 方块数

    // 2) 调色板。★实测样本调色板第 0 项恒为 minecraft:air（val=0）——
    //    这是 Bedrock 结构的既定约定：空气必须占 0 号位，其余方块从 1 开始编号。
    //    （旧实现把 minecraft:block 放 0 号位 → 与游戏约定不符，导入时被拒。）
    //    ★ val 是 TAG_SHORT（实测 type=2），不是 TAG_INT。
    const PAL_AIR      = { name: 'minecraft:air',                  states: {}, val: 0, version: 18168865 };
    // ★ states 类型严格对齐实测样本：conditional_bit=BYTE、facing_direction=INT
    const PAL_CMDBLOCK = {
        name: 'minecraft:chain_command_block',
        states: { conditional_bit: { t: _NBT.TAG_BYTE, v: 0 }, facing_direction: { t: _NBT.TAG_INT, v: 3 } },
        val: 3, version: 18168865
    };
    const palette = [PAL_AIR, PAL_CMDBLOCK];
    const IDX_CMD = 1;

    // 3) block_indices：两层
    // ★★★【块索引约定 —— 致命，2026-10-01 用户第 6 次报障后靠原生样本反推确认】
    //    游戏用的是 **Z 最快**：i = (z-oz) + (x-ox)*sz + (y-oy)*sz*sx
    //    （即 Z 变化最快，其次 X，最后 Y；等价于「先沿 Z 填一整列，再换 X」）
    //
    //    旧实现用的是 **X 最快**：i = (x-ox) + (z-oz)*sx + (y-oy)*sx*sz —— 完全反了。
    //
    //    ★判据（用游戏自己导出的 `导出.mcstructure` 反证）：
    //      样本 size=[2,1,4]、bpd 键=[4,5,6,7]、be=(33,-60,0..3) 一条 Z 直线。
    //      · Z 最快解码：key4→(x1,z0)、key5→(x1,z1)、key6→(x1,z2)、key7→(x1,z3)
    //        → x 恒 1（世界 33）、z=0..3 连续 ⇒ 与 be 100% 吻合（4/4）
    //      · X 最快解码：key4→(x0,z2)、key5→(x1,z2)、key6→(x0,z3)、key7→(x1,z3)
    //        → 2×2 方格 ⇒ 与 be 完全不吻合（1/4）
    //
    //    ★错用 X 最快的后果（用户截图实测）：我写的 key=1,3,5,…,23 在 Z 最快下被解成
    //      z=1,3,5,…,11 且 **一半落 x=0、一半落 x=1** ⇒ 画面上命令方块沿 X 左右交替、
    //      Z 上还隔位跳 —— 就是用户看到的「X 方向锯齿形、狐狸与命令方块位置交替交换」。
    //      （t 越大越明显：key≥sz 后就跨到下一列 x 去了。）
    const total = sx * sy * sz;
    // ★ 空格子约定（实测样本口径）：
    //   layer0（主层）空格 = 0 —— 即调色板 0 号位的 minecraft:air。
    //   layer1（第二层：水/覆雪）无内容 = -1 —— 实测样本整层皆 -1。
    //   两层语义不同，切勿统一填同一个值。
    const layer0 = new Int32Array(total).fill(0);
    const layer1 = new Int32Array(total).fill(-1);
    // ★★块索引：Z 最快（见上方长注释）。dx/dy/dz 为结构内局部坐标。
    const idxOfLocal = (lx, ly, lz) => lz + lx * sz + ly * sz * sx;
    const idxOf = (x, y, z) => idxOfLocal(x - ox, y - oy, z - oz);

    // 4) 命令方块实体：每个模型方块 → 一个 chain_command_block + 一只狐狸。
    //    规则（用户定稿）：1 个命令方块 ↔ 1 只狐狸。
    //    ★ 布局：命令方块沿 Z 正轴依次排开（第 k 个命令方块落在 z = oz + k），
    //      狐狸放在该命令方块的 x-1 处 —— 与模板前缀 `positioned ~-1~~` 严格对应。
    //      X 上：local 1 = 命令方块列、local 0 = 狐狸列（狐狸在 x-1）。
    const blockEntityData = [];   // { idx, cmd, wx, wy, wz }
    const foxEntities = [];       // 狐狸世界坐标

    // ★ 用局部序号 k（0..n-1）驱动车道位置，与 placed 的遍历顺序解耦、绝不重叠。
    placed.forEach((p, k) => {
        const cmdZ = oz + k;            // 沿 Z 正轴：第 k 个 → z = oz + k
        const cmdX = ox + 1;            // 命令方块列（local x=1）
        const cmdY = oy;                // 只有一层（local y=0）
        // ★★★ 承载指令：placed 里装的就是【方块对象本身】（getBoneOrderedBlocks 返回 raw blocks），
        //   绝不能写成 p.block —— 那是 undefined，getCommandTextForBlock 会抛错，
        //   而 getBlockStructureCommand 的 try/catch 会把异常静默吞掉返回 ''，
        //   结果就是「结构、尺寸、位置全对，但命令方块里啥也没有」。
        //   （2026-10-01 用户实测报障；探针 _dbg_parse_cmd.cjs 解析出 Command 长度为 0。）
        const blkObj = (p && p.block) ? p.block : p;   // 兼容两种形状，别再赌
        const cmd = getBlockStructureCommand(blkObj);
        const i = idxOf(cmdX, cmdY, cmdZ);
        if (i < 0 || i >= total) return;
        // 命令方块占据该格（承载指令）
        layer0[i] = IDX_CMD;
        // ★★★ block_entity_data 的 x/y/z 必须写【结构内的世界格坐标】(cmdX/cmdY/cmdZ)，
        //      绝不能写方块自己的原始坐标！游戏是按这三个字段来摆放命令方块实体的
        //      —— 写成原始坐标 → 格子是对的但实体散落在模型各处 → 画面呈"锯齿/阶梯"状
        //      （用户实测截图：狐狸成一条直线，命令方块却东一个西一个）。
        //      旧实现误传 p.pos → 就是这个 bug。
        blockEntityData.push({ idx: i, cmd, wx: cmdX, wy: cmdY, wz: cmdZ });
        // 配对的狐狸：放在该命令方块的 x-1 格（与 @e[x=~,z=~,y=~,r=1] + positioned ~-1~~ 配合）
        foxEntities.push(getFoxSpawnPosForCommandBlock(cmdX, cmdY, cmdZ));
        // 狐狸所在格留空（layer0 空格 = 0 = air，上面 already 填好；此处仅显式说明语义）
        const fi = idxOf(cmdX - 1, cmdY, cmdZ);
        if (fi >= 0 && fi < total && layer0[fi] === 0) layer0[fi] = 0; // 保持空气（0 = air）
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
        foxEntities.forEach((pos, fi) => writeFoxEntity(w, pos, -(1000000 + fi)));
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
    return { bytes: w.finish(), size: [sx, sy, sz], origin: [ox, oy, oz], blockCount: placed.length, entityCount: foxEntities.length };
}

// 触发下载 .mcstructure（二进制）
function downloadMcStructure() {
    let res;
    try {
        res = buildMcStructureBytes();
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
    showToast(`已导出 .mcstructure：${res.blockCount} 个方块 · ${res.entityCount} 只狐狸 · 尺寸 ${res.size.join('×')}`);
}

