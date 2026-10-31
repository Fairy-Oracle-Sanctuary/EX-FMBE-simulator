/* 04-import-export/04-command-import-and-obj-preview.js · 源 测试版v.6b79.html 第 20427-21700 行 */
'use strict';
// ==================== 导入命令（自动识别旗帜标识） ====================
// 骨骼动画导出（'anim:xxx' + t.<id>_* 引用）专用的导入后重建：
//  1) 识别发布 t.<id>_* 的骨干命令，按首三元 cond<T? 取出 v.start_xpos/_rotatez/_scale/_extend_scale 作为
//     t=0 姿态；常量 v.ypos/zpos/xrot/yrot/zrot/xbasepos/ybasepos/zbasepos/extend_xrot/extend_yrot
//     取首次出现值；写入骨干方块静态 vars。
//  2) 发布 t.<id>_px/py/pz/xrot/yrot/zrot 到 globalVars，sourceBlockId=骨干 finalId——子块 molang
//     v.xpos=t.<id>_px+pR·xbasepos_bone 即可在 refresh 时拿到正确的父骨世界位姿。
//  3) parseKeyframeFromMolang 从原始 molang 文本反解关键帧写入 keyframeData，动画保留。
// 不挂 FMBE program：历史上 v.<id>_time（数字开头）词法不识别会让 runBlockProgram 报错。
// 【2026-10-02 已修根因】tokenizeMolang 现在支持「成员名以数字开头」（`.` 紧跟标识符时按成员点处理，
//   整段读成一个 id 记号），与 evaluateExpression 的 t.<数字> 兼容口径一致 ⇒ 该限制已解除，
//   此处保留原逻辑只为兼容既有导出格式（关键帧由 parseKeyframeFromMolang 反解，不依赖挂 program）。
function reconstructBoneAnimationImports(exports) {
    // 先把所有导出按 groupName 分组；每组识别其骨干（发布 t.<id>_* 的命令）
    const groups = new Map(); // groupName -> { backbone:{finalId,content,boneId}, children:[...] }
    for (const ex of exports) {
        const g = ex.groupName || '__nogroup__';
        if (!groups.has(g)) groups.set(g, { backbone: null, children: [] });
        const slot = groups.get(g);
        // 发布 t.<id>_* 的命令即为骨干：内容里出现 t.<id>_px=... 或 t.<id>_xrot=... 的赋值
        const m = ex.content.match(/\bt\.([A-Za-z0-9_][A-Za-z0-9_]*)_(px|py|pz|xrot|yrot|zrot)\s*=/);
        if (m) slot.backbone = { finalId: ex.finalId, content: ex.content, boneId: m[1] };
        else slot.children.push(ex);
    }
    for (const [, slot] of groups) {
        if (!slot.backbone) continue;
        const bb = slot.backbone;
        const block = getBlockById(bb.finalId);
        if (!block) continue;
        const bid = bb.finalId;
        const c = bb.content;
        // 首三元（<T）：取出 t=0 起始值
        let xpos=0, rotatez=0, scale=1, extend_scale=1;
        const tern = c.match(/v\.([A-Za-z0-9_][A-Za-z0-9_]*)_time<\d+\.?\d*\?\s*\(([^)]+)\)/);
        if (tern) {
            const body = tern[2];
            const get = (k) => { const r = body.match(new RegExp(`v\\.${k}=(-?\\d+(?:\\.\\d+)?)`)); return r ? parseFloat(r[1]) : null; };
            const sx = get('start_xpos'); if (sx !== null) xpos = sx;
            const sr = get('start_rotatez'); if (sr !== null) rotatez = sr;
            const ss = get('start_scale'); if (ss !== null) scale = ss;
            const se = get('start_extend_scale'); if (se !== null) extend_scale = se;
        }
        // 常量（首条 v.xxx=value；外层不在三元里的）
        const getConst = (k) => { const r = c.match(new RegExp(`v\\.${k}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`)); return r ? parseFloat(r[1]) : null; };
        const ypos  = getConst('ypos')  ?? 0;
        const zpos  = getConst('zpos')  ?? 0;
        const xrot  = getConst('xrot')  ?? 0;
        const yrot  = getConst('yrot')  ?? 0;
        const zrot  = getConst('zrot')  ?? 0;
        const xbase = getConst('xbasepos') ?? 0;
        const ybase = getConst('ybasepos') ?? 0;
        const zbase = getConst('zbasepos') ?? 0;
        const exrot = getConst('extend_xrot') ?? -90;
        const eyrot = getConst('extend_yrot') ?? 0;
        // 写入骨干静态 vars（覆盖导入器坍缩的末态值）
        block.scope.initFromM([xpos, ypos, zpos, xrot, yrot, zrot, scale, extend_scale, exrot, eyrot, xbase, ybase, zbase]);
        // v.rotatex/y/z 不在 initFromM 的 13 核心名内，但骨级关键帧/子块跟随用的是 v.rotatex，
        // 必须显式设为 t=0 起始旋转（lerprotate(...).t=0 同样得 0，但保留 start_* 受 import 坍缩污染）
        if (block.scope.vars.has('v.rotatex')) { block.scope.vars.get('v.rotatex').expr = '0'; block.scope.vars.get('v.rotatex').value = 0; }
        if (block.scope.vars.has('v.rotatey')) { block.scope.vars.get('v.rotatey').expr = '0'; block.scope.vars.get('v.rotatey').value = 0; }
        if (block.scope.vars.has('v.rotatez')) { block.scope.vars.get('v.rotatez').expr = String(rotatez); block.scope.vars.get('v.rotatez').value = rotatez; }
        block.refresh();
        // 设文件夹的骨干（自包含：auto-bone 的 !getBoneBlocksOfFolder 在空数组时为 false 不可靠）
        if (block.group) {
            const f = getFolder(block.group);
            if (f && !f._backbone) f._backbone = bid;
        }
        // 子块设置 _boneParent = 骨干 finalId（不依赖 auto-bone）
        // 同时标记 _boneExplicit=true：这种 v.parent_xrot=t.<父>_* 的父子关系来自导入命令，
        // 属于用户指定的「紫色加号（显式）绑定」，与文件夹设骨干的自动骨骼是两回事；
        // 必须标记为显式，否则会被 isExplicitBoneBinding 误判为文件夹自动骨骼，导致拖拽时误解绑。
        for (const ex of slot.children) {
            const cb = getBlockById(ex.finalId);
            if (cb) {
                cb._boneParent = bid; cb._boneExplicit = true;
                // 【子骨骼自身关键帧还原 2026-09-12】紫色加号 ✛ 显式绑定的子骨骼可以有自己的局部关键帧
                // （xrot/yrot/zrot 外观旋转、xbasepos_bone 相对偏移、scale/extend_*），导出时它们是
                // 子块命令里独立的一段 'anim:' 关键帧（见 getKeyframeCommandText 的叶子子骨骼分支）。
                // 旧实现只解析骨干命令，子骨骼自己录的关键帧在「导出 → 重新导入」后全部丢失
                // （用户报告的往返丢动画）。这里对含 'anim:' 的子块命令逐个还原到它自己的 keyframeData。
                if (/['"]anim:/.test(ex.content)) {
                    const cp = parseSingleKeyframeCommand(ex.content);
                    if (cp && cp.frames && cp.frames.size > 0) {
                        const exist = keyframeData.get(ex.finalId);
                        if (exist && exist.frames instanceof Map) {
                            cp.frames.forEach((m, t) => exist.frames.set(t, m));
                        } else {
                            keyframeData.set(ex.finalId, { frames: cp.frames, animId: (ex.finalId + '_anim') });
                        }
                        const cts = Array.from(cp.frames.keys()).filter(k => typeof k === 'number');
                        if (cts.length) keyframeAnimDuration = Math.max(keyframeAnimDuration, Math.ceil(Math.max(...cts)) + 2);
                    }
                }
            }
        }
        // 发布 t.<id>_* 全局（sourceBlockId 指向骨干；expr='v.xpos'/'v.ypos' 等惰性实时解析）
        const publish = (suffix, expr) => {
            if (!globalVars.has(suffix)) {
                globalVars.set(suffix, { def: new VarDef(expr, 0, -100, 100, 1), sourceBlockId: bid });
            } else {
                const g = globalVars.get(suffix);
                g.def.expr = expr; g.def.value = 0; g.sourceBlockId = bid;
            }
        };
        publish(bid + '_px', 'v.xpos');
        publish(bid + '_py', 'v.ypos');
        publish(bid + '_pz', 'v.zpos');
        // 局部轴绑定：子块 basepos 引用父 t.<id>_bx/by/bz，按需发布（无该绑定时不产生多余全局）
        if (slot.children.some(ex => String(ex.content || '').includes(`t.${bid}_bx`))) {
            publish(bid + '_bx', 'v.xbasepos');
            publish(bid + '_by', 'v.ybasepos');
            publish(bid + '_bz', 'v.zbasepos');
        }
        // ★ 骨骼旋转源只用 v.rotatex/y/z；xrot/yrot/zrot 是方块外观旋转，不参与骨骼链。
        publish(bid + '_xrot', 'v.rotatex');
        publish(bid + '_yrot', 'v.rotatey');
        publish(bid + '_zrot', 'v.rotatez');
        // 刷新骨干与同组所有子块：子块 molang v.xpos=t.1_px+pR·xbasepos_bone 现在能解析到骨干真实位姿。
        // （evaluateExpression 已把 t.<数字>_* / v.<数字>_time 预处理成方括号下标，recompute 不再 SyntaxError→0；
        //   assignments 正则已放宽数字开头，v.<id>_time 在 scope 里、t.<id>_px 全局已发布。保留 molang 是关键：
        //   播放时 applyKeyframe 改骨干 → t.<id>_px 实时解析 → 子块跟随；写成常量则播放时子块钉死。）
        block.refresh();
        for (const ex of slot.children) {
            const cb = getBlockById(ex.finalId);
            if (cb) cb.refresh();
        }
        // 关键帧反解：直接复用 parseSingleKeyframeCommand —— 它兼容新版多段导出格式：
        //   v.N_time<T?(v.start_*=..;v.T*=..); v.N_time>=T1&&v.N_time<T2?(...); ...; v.N_time>=Tn?(...)
        //   逐段把每帧时间点的「该帧实际值」还原成 Map<time, Map<var,val>>（首帧用 start_*、后续用 T*），
        //   因此 1.26/2.209/3.072 这类中间帧不会丢失（旧的“只取首个 <T 和末个 >=T”双帧猜法会丢段）。
        //   v.<数字>_time / 数字开头变量由该函数内部宽松匹配处理。
        //   —— 注意：不再需要把命令里的静态常量 merge 进每帧；静态常量已在上方 initFromM 写入方块，
        //   播放插值 _kfVarLerp 对缺变量的帧按邻近帧/常量兜底，二者等价且不污染帧表。
        const parsedCmd = parseSingleKeyframeCommand(bb.content);
        const frames = (parsedCmd && parsedCmd.frames) ? parsedCmd.frames : new Map();
        if (frames.size > 0) {
            // 方块级（骨干）关键帧：无分组（用户直接粘贴单段/双段命令）也要入轨，否则时间轴永远空
            keyframeData.set(bid, { frames, animId: (bid + '_anim') });
            /* 【2026-10-19 · 关键帧去文件夹化】原此处额外写入骨级关键帧（boneKeyframes.set / kfAddedFolders.add），
               文件夹轨道不可能支持，已删除，只保留逐方块 keyframeData。 */
            const times = Array.from(frames.keys()).filter(k => typeof k === 'number').sort((a, b) => a - b);
            if (times.length) keyframeAnimDuration = Math.max(keyframeAnimDuration, Math.ceil(times[times.length - 1]) + 2);
        }
    }
    // 【无骨干组的子骨骼关键帧还原 2026-09-12】上面的主循环依赖「组内存在骨干（发布 t.<id>_*= 的命令）」，
    // 但紫色加号 ✛ 显式绑定链常常是「父块自己没有关键帧」：父块命令不含 'anim:' → 根本不进 boneAnimExports，
    // 于是该组只剩子块命令、被判为无骨干而整组 continue → 子骨骼自己录的局部关键帧在往返导入后全部丢失。
    // 这里兜底：组内没有骨干时，凡是自带 'anim:' 段的命令，直接把它的关键帧还原到自己的 keyframeData。
    for (const [, slot] of groups) {
        if (slot.backbone) continue;
        for (const ex of slot.children) {
            if (!/['"]anim:/.test(ex.content)) continue;
            const exist = keyframeData.get(ex.finalId);
            if (exist && exist.frames instanceof Map && exist.frames.size > 0) continue;
            const cp = parseSingleKeyframeCommand(ex.content);
            if (cp && cp.frames && cp.frames.size > 0) {
                keyframeData.set(ex.finalId, { frames: cp.frames, animId: (ex.finalId + '_anim') });
                const cts = Array.from(cp.frames.keys()).filter(k => typeof k === 'number');
                if (cts.length) keyframeAnimDuration = Math.max(keyframeAnimDuration, Math.ceil(Math.max(...cts)) + 2);
            }
        }
    }
}


function importFromCommands(text, opts) {
    const _silent = !!(opts && opts.silent);   // 静默模式：不弹「导入完成」模态（调用方自行给提示）
    // ★★★ 只认 playanimation（用户 2026-10-04 明确定稿）：
    //   一段命令文件里往往夹着大量非造型指令（脉冲/连锁标记、testfor、setblock、fill、
    //   summon、tag、effect、replaceitem、structure、tickingarea、execute …）。这些一律【跳过】，
    //   绝不当作方块导入；只有出现 playanimation 的行才启动一条新命令，并取其双引号内的 molang 载荷。
    //   引号可能跨行 ⇒ 用 inQuote 状态机把多行拼回一条命令。
    const lines = text.split(/\r?\n/);
    let current = '', inQuote = false, cmds = [];
    for (let line of lines) {
        if (inQuote) {
            // 正处于某条 playanimation 的双引号载荷内部：继续拼行，直到引号配对闭合
            current += '\n' + line;
            const qc = (line.match(/"/g) || []).length;
            if (qc % 2 === 1) inQuote = false;
            continue;
        }
        // 引号外：只有 playanimation 行才开启新命令；其余行显式忽略
        if (!line.includes('playanimation')) continue;
        if (current) cmds.push(current);
        current = line;
        const qc = (line.match(/"/g) || []).length;
        inQuote = qc % 2 === 1;
    }
    if (current) cmds.push(current);

    // ★ 无「方块编号：」标签已由上方自动命名（autoName）支持（用户 2026-10-04 定稿）：
    //   每块按出现顺序独立命名，不再全部退化成同一个 rawId。故此处不再给出「导入不完整」告警，
    //   仅记录一条 console 提示，方便排查「为什么方块叫 autoName」。
    let missingBlockIdTag = false;
    {
        const hasPlay = cmds.some(c => c.includes('playanimation'));
        const hasIdTag = cmds.some(c => /['"]方块编号：/.test(c));
        const looksCompressed = cmds.some(c => c.includes('v.x=='));
        missingBlockIdTag = hasPlay && !hasIdTag && !looksCompressed;
        if (missingBlockIdTag) console.info('[导入] 命令未携带 方块编号 标签：已按出现顺序自动命名（autoName / autoName1 / …）。');
    }

    // 移除「启动默认占位方块」：模块初始化时（见 init 代码）会在空场景里自动创建一个
    // id="Cube" 的占位方块。若不移除，用户导入的模型里恰好也有 "Cube" 时，import 的
    // 防冲突逻辑会把【真实方块】改名成 "Cubea"（幻象方块）→ 文件夹里出现两个方块、
    // 原方块 group 错位、骨骼绑定错乱 —— 这正是「导出无动画 / 父骨骼不带动子 /
    // 名字带 a 的幻象块」等一系列问题的根源之一。
    // 仅当该方块仍是【未修改的默认姿态】（默认坐标/旋转/缩放、未分组、未贴图、未绑定）才移除，
    // 避免误删用户编辑过的同名方块。
    {
        const _defM = [0,0,0,0,0,0,1,1,-90,0,0,0,0];
        for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i];
            if (b.id !== 'Cube' || b.group != null || b.type !== 'cube' || b.materialType !== 'color') continue;
            if (b._boneParent) continue;
            const m = b.scope.toM();
            let same = true;
            for (let k = 0; k < 13; k++) if (Math.abs(Number(m[k]) - _defM[k]) > 1e-6) { same = false; break; }
            if (!same) continue;
            // 确认是未修改的占位块：从场景移除
            blocks.splice(i, 1);
            invalidateBlockIdCache();   // 方块集合已变：getBlockById 立即重建
            scene.remove(b.mesh);
            if (b.label) scene.remove(b.label);
            if (b.selectionWireframe) scene.remove(b.selectionWireframe);
            removeBubblesForBlock(b);
            if (selectedBlock === b) selectedBlock = null;
            selectedBlocksSet.delete(b);
            break;
        }
    }

    let successCount = 0;
    let failCount = 0;

    // 若导入时选中了文件夹（骨骼），则本次导入新建的「根文件夹」与未指定分组的方块都归入该文件夹
    const importParentFolder = selectedFolder || null;
    const importedNewFolders = new Set();   // 本次导入中新建（而非已存在）的文件夹名
    const touchedFolders = new Set();       // 本次导入中任何方块/骨骼归属到的文件夹（含已存在的），用于统一展开
    const seenRawIds = new Set();           // 去重：同一 方块编号（逐帧烘焙导出会重复出现）只真正导入一次
    let _autoNameSeq = 1;                   // 无「方块编号」标签时的自动命名序号（autoName / autoName1 / …）
    const boneAnimExports = [];             // 收集骨骼动画导出命令（'anim:' + 骨骼引用），导入后重建 t=0 模型

    // —— 文件夹同名防冲突：与方块一致，导入的文件夹若与场景已有文件夹同名，自动改名（+a/+b…），
    // 避免重复导入时两次的方块混进同一个文件夹导致模型叠加错乱（用户要求）。
    // 预扫描全部指令的 group: 与 parentbone: 链，统一建立 旧名→新名 映射（整批一致）。
    const folderRename = new Map();
    {
        const usedNames = new Set(folders.map(f => f.name));
        const batchNames = new Set();
        for (const cmd of cmds) {
            if (!cmd.includes('playanimation')) continue;
            // ★载荷取【首个 " 到最后一个 "】之间：双引号注释标签会让「首个引号对」匹配成空段
            const q1 = cmd.indexOf('"'), q2 = cmd.lastIndexOf('"');
            if (q1 < 0 || q2 <= q1) continue;
            const content = cmd.slice(q1 + 1, q2);
            const gm = content.match(/['"]group:([^'"]+)['"]/);
            if (gm) batchNames.add(gm[1].trim());
            const pm = content.match(/['"]parentbone:([^'"]+)['"]/);
            if (pm) pm[1].split('>').map(s => s.trim()).filter(Boolean).forEach(n => batchNames.add(n));
        }
        for (const name of batchNames) {
            // 用户显式选中的导入目标文件夹不参与改名（方块应归入它）
            if (name === importParentFolder) { folderRename.set(name, name); continue; }
            if (usedNames.has(name)) {
                let n = name, i = 0;
                while (usedNames.has(n)) n = name + String.fromCharCode(97 + (i++ % 26));
                usedNames.add(n);
                folderRename.set(name, n);
            } else {
                usedNames.add(name);
                folderRename.set(name, name);
            }
        }
    }

    // 预先建立材质名称到URL的映射（不区分大小写）
    // 来源优先级: 新贴图库单图 < 组合方块预设
    const nameToUrl = new Map();
    TEX_LIB.forEach(t => { if (isTexDisabled(t[0])) return; nameToUrl.set(t[1].toLowerCase(), t[0]); });   // 中文名 -> 文件名
    TEX_LIB.forEach(t => { if (isTexDisabled(t[0])) return; nameToUrl.set(t[0].toLowerCase(), t[0]); });   // 文件名 -> 文件名
    TEX_LIB.forEach(t => { if (isTexDisabled(t[0])) return; nameToUrl.set(t[0].replace(/\.(png|jpg)$/i, '').toLowerCase(), t[0]); });
    // 组合方块预设: 中文名 / key 都能查到（下架的预设不映射）
    const nameToPreset = new Map();
    TEX_BLOCK_PRESETS.forEach(p => {
        if (RESERVED_BLOCK_PRESETS.has(p[0])) return;
        nameToPreset.set(p[1].toLowerCase(), p[0]);
        nameToPreset.set(p[0].toLowerCase(), p[0]);
    });

    for (let cmd of cmds) {
        if (!cmd.includes('playanimation')) {
            failCount++;
            continue;
        }
        // ★★★载荷提取必须取【首个 " 到最后一个 "】之间（外层命令参数引号对）：
        //    整段 molang 载荷被 playanimation 前缀/后缀双引号包住；内部标签一律单引号
        //    '方块编号：xxx';（10-01 定稿），不干扰外层提取。绝不能按「首个引号对」截取——
        //    载荷开头紧贴的标签会让 content 变成空串，整条指令直接解析失败。
        const q1 = cmd.indexOf('"'), q2 = cmd.lastIndexOf('"');
        if (q1 < 0 || q2 <= q1) {
            failCount++;
            continue;
        }
        const content = cmd.slice(q1 + 1, q2);
        
        // 检查方块类型
        let blockType = 'cube';
        if (content.includes("'方块类型：旗帜'") || content.includes('"方块类型：旗帜"')) {
            blockType = 'flag';
        } else if (content.includes("'方块类型：半砖'") || content.includes('"方块类型：半砖"') || content.includes("'方块类型：Slab'") || content.includes('"方块类型：Slab"')) {
            blockType = 'halfbrick';
        } else if (content.includes("'方块类型：楼梯'") || content.includes('"方块类型：楼梯"')) {
            blockType = 'stair';
        }
        
        // 提取材质名称 'block：xxx'（整体贴图或组合方块预设）
        let blockMaterialName = null;
        const blockMatch = content.match(/['"]block：([^'"]+)['"]/);
        if (blockMatch) {
            blockMaterialName = blockMatch[1].trim();
        }
        // 提取旗帜生成器配方 'banner：<底色><图案><染料>…'（紧凑文本，2026-10-18 r36）
        //   ★这是注释标签、不是变量，也不进作用域 ⇒ 变量面板不会出现任何额外字段。
        //   ★首字母必须是大写 A-P（底色），后面只允许小写图案缩写与大写染料 → 正则天然不与
        //     'block：' / 'faces：' 的贴图名/URL 混淆。
        let bannerCode = null;
        const bannerMatch = content.match(/['"]banner：([A-P](?:[a-z]{2,3}[A-P])*)['"]/);
        if (bannerMatch) bannerCode = bannerMatch[1];
        // 提取六面贴图 'faces：底|顶|左|右|前|后'
        let faceTexList = null;
        const facesMatch = content.match(/['"]faces：([^'"]+)['"]/);
        if (facesMatch) {
            const parts = facesMatch[1].split('|').map(s => s.trim());
            if (parts.length) {
                faceTexList = [];
                for (let i = 0; i < 6; i++) {
                    const p = parts[i];
                    faceTexList.push((!p || p === '-') ? null : (nameToUrl.get(p.toLowerCase()) || p));
                }
                if (!faceTexList.some(x => x)) faceTexList = null;
            }
        }
        
        // 提取分组名称 'group:xxx'
        let groupName = null;
        const groupMatch = content.match(/['"]group:([^'"]+)['"]/);
        if (groupMatch) {
            groupName = groupMatch[1].trim();
        }
        // 提取父骨骼链 'parentbone:A>B>...'（第一项为直接父骨骼，其后为祖先骨骼）
        let parentBoneChain = null;
        const pbMatch = content.match(/['"]parentbone:([^'"]+)['"]/);
        if (pbMatch) {
            parentBoneChain = pbMatch[1].split('>').map(s => s.trim()).filter(Boolean);
        }
        // 文件夹同名防冲突：整批统一按映射改名（group 与 parentbone 链内的名字都要改，保持层级一致）
        if (groupName) groupName = folderRename.get(groupName) || groupName;
        if (parentBoneChain) parentBoneChain = parentBoneChain.map(n => folderRename.get(n) || n);
        
        const assignments = [];
        // 变量名允许数字开头：骨骼/关键帧导出用 v.<id>_time（如 v.1_time）与 t.<id>_px（如 t.1_px），
        // 若只认字母/下划线开头会漏提取 → 时间变量不在 scope、t.<id>_* 全局不发布。
        // ★等号两侧允许空白：兼容 molang 编辑器手写格式 `v.xpos = 0;`（旧正则只认 `v.xpos=0;`，
        //   常量化/手写程序带空格时整条指令解析不到任何赋值 → 方块退化成默认姿态）。
        const reg = /([vt])\.([A-Za-z0-9_][A-Za-z0-9_]*)\s*=\s*([^;]+);/g;
        let m;
        while ((m = reg.exec(content)) !== null) {
            assignments.push({ type: m[1], name: m[2], expr: m[3].trim() });
        }
        const idMatch = content.match(/['"]方块编号：([^'"]+)['"]/);
        const hasIdTag = !!idMatch;
        // ★★★ 无「方块编号：」标签时的自动命名（用户 2026-10-04 要求）：
        //   命令里没有编号字段时，不再全部退化为字面量「新方块」（那会被下方 seenRawIds
        //   去重成唯一一块），而是按出现顺序自动命名 autoName_seq（首块直接叫 autoName，
        //   与 Block 默认命名习惯一致）。这样一份没有任何编号的命令文件也能完整建出 N 个方块。
        let rawId;
        if (hasIdTag) {
            rawId = idMatch[1];
        } else {
            rawId = 'autoName';
            let _seq = _autoNameSeq;
            while (blocks.some(b => b.id === rawId) || seenRawIds.has(rawId)) {
                rawId = 'autoName' + (_seq++);
            }
            _autoNameSeq = _seq;
        }
        const existIds = blocks.map(b => b.id);
        let finalId = rawId, cnt = 0;
        while (existIds.includes(finalId)) finalId = rawId + String.fromCharCode(97 + (cnt++ % 26));
        
        const M = [0,0,0,0,0,0,1,1,0,0,0,0,0];
        const varMap = new Map();
        assignments.forEach(a => { if (a.type === 'v') varMap.set(`v.${a.name}`, a.expr); });
        const basic = ['xpos','ypos','zpos','xrot','yrot','zrot','scale','extend_scale','extend_xrot','extend_yrot','xbasepos','ybasepos','zbasepos'];
        basic.forEach((name, idx) => {
            const val = varMap.get(`v.${name}`);
            if (val !== undefined && isConstantExpr(val)) M[idx] = parseFloat(val);
        });
        
        // 创建方块
        // 若导入时选中了文件夹且本方块未指定分组，则归入该文件夹
        if (!groupName && importParentFolder) groupName = importParentFolder;
        // 检测骨骼动画导出：含 'anim:' 且引用 t.<id>_*（父骨姿态）或发布 t.<id>_*=（自己就是父骨）。
        // 这类命令不能用「最后一条 v.xxx=value 胜出」的方式拆解：三元 cond?(stmts) 不是赋值；关键帧驱动
        // 变量 v.N_time 以数字开头（如 v.1_time）不被变量名正则捕获；主程序也不该挂到 FMBE 解释器
        // （v.1_time 让词法分析器拆成 1 与 _time 两个 token，runBlockProgram 报错）。统一在导入末尾
        // 重建 t=0 静态模型 + 发布 t.<id>_* 全局变量 + 提取关键帧。
        const isBoneAnim = /['"]anim:/.test(content) && /\bt\.[A-Za-z0-9_][A-Za-z0-9_]*_/.test(content);
        if (isBoneAnim) {
            boneAnimExports.push({ finalId, content, groupName });
        }
        const newBlock = new Block(finalId, M, null, '#aaccff', blockType, groupName);
        
        // 如果存在分组名称，自动创建组
        if (groupName) {
            if (!folders.find(g => g.name === groupName)) {
                createFolder(groupName);
                // 仅当该文件夹是本次导入新建的（非已存在）才纳入重新归父的范围
                if (groupName !== importParentFolder) importedNewFolders.add(groupName);
            }
            touchedFolders.add(groupName);   // 该方块归属的文件夹（无论新建还是已存在）都要展开
            // 还原父骨骼层级：parentbone 链中第一项为 groupName 的直接父级，其后依次为祖先
            if (parentBoneChain && parentBoneChain.length) {
                const g = folders.find(f => f.name === groupName);
                // 先确保链上每个祖先骨骼(文件夹)都存在
                let prevName = null;
                for (let i = 0; i < parentBoneChain.length; i++) {
                    const ancName = parentBoneChain[i];
                    if (!folders.find(f => f.name === ancName)) {
                        createFolder(ancName);
                        if (ancName !== importParentFolder) importedNewFolders.add(ancName);
                    }
                    touchedFolders.add(ancName);   // 祖先骨骼文件夹也要展开
                    prevName = ancName;
                }
                // 设置 groupName 的直接父级
                if (g) g.parentName = parentBoneChain[0];
                // 设置链上各祖先之间的父子关系
                for (let i = 0; i < parentBoneChain.length - 1; i++) {
                    const f = folders.find(ff => ff.name === parentBoneChain[i]);
                    if (f) f.parentName = parentBoneChain[i + 1];
                }
            }
            // 还原骨骼坐标（枢轴 pivot 与累计旋转 rotation），避免导入后骨骼坐标变为 0 0 0
            const bt = parseBoneTag(content);
            const btName = bt ? (folderRename.get(bt.name) || bt.name) : null;
            if (bt && btName === groupName) {
                const gf = folders.find(f => f.name === groupName);
                if (gf) {
                    if (bt.pivot) gf.pivot = bt.pivot;
                    if (bt.rotation) gf.rotation = bt.rotation;
                }
            }
        }
        
        assignments.forEach(a => {
            const full = `${a.type}.${a.name}`;
            if (a.type === 'v') {
                if (newBlock.scope.vars.has(full)) newBlock.scope.setVarExpr(full, a.expr);
                else newBlock.scope.addVar(full, a.expr, -10, 10, 0.01);
            } else if (a.type === 't') {
                if (!globalVars.has(a.name)) {
                    const rg = getDefaultRange(`t.${a.name}`);
                    globalVars.set(a.name, { def: new VarDef(a.expr, 0, rg.min, rg.max, 1), sourceBlockId: newBlock.id });
                } else {
                    globalVars.get(a.name).def.expr = a.expr;
                }
            }
        });
        
        // 应用材质（立方体、半砖、楼梯、旗帜）：旗帜生成器配方 > 六面贴图 > 组合方块预设 > 整体单贴图
        // ★旗帜纳入（2026-10-18 r36）：织布机生成的旗帜按 'banner：' 配方就地重渲染还原；
        //   本地上传的图片走既有 data:/blob: 分支（loadTexture 会自动跳过旗杆等不可贴图的 cube）。
        if (newBlock.type === 'cube' || newBlock.type === 'halfbrick' || newBlock.type === 'stair' || newBlock.type === 'flag') {
            const bannerRecipe = bannerCode ? loomCodeToRecipe(bannerCode) : null;
            if (bannerRecipe) {
                // ★用与织布机面板【完全相同】的渲染管线重建旗面 → 与用户所见逐像素一致
                try {
                    const bUrl = loomTextureCanvas({ baseDye: bannerRecipe.baseDye, layers: bannerRecipe.layers, activeLayer: -1 }).toDataURL('image/png');
                    newBlock.loomCode = loomRecipeToCode(bannerRecipe);
                    newBlock.loomUrl = bUrl;
                    newBlock.loadTexture(bUrl, '旗帜');
                } catch (e) { console.warn('旗帜配方还原失败：' + bannerCode, e); }
            } else if (faceTexList) {
                newBlock.applyFaceTextures(faceTexList, null);
            } else if (blockMaterialName) {
                // 本地上传的图片以 data:/blob: URL 内嵌在命令中，直接按 URL 加载即可还原（无需查贴图库）
                if (/^(data:|blob:)/i.test(blockMaterialName)) {
                    newBlock.loadTexture(blockMaterialName, '自定义');
                } else {
                    const lowerName = blockMaterialName.toLowerCase();
                    const presetKey = nameToPreset.get(lowerName);
                    const url = nameToUrl.get(lowerName);
                    if (presetKey) {
                        newBlock.applyBlockPreset(presetKey);
                    } else if (url) {
                        newBlock.loadTexture(url, blockMaterialName);
                    } else {
                        console.warn(`未找到材质预设: ${blockMaterialName}`);
                    }
                }
            }
        }
        
        // 若含有逻辑判别式（三元条件 / q. 查询 / 比较逻辑运算符），普通变量卡片无法表达，
        // 必须自动启用 molang 接管并把原始指令整段存为 program，否则条件逻辑会被拆分丢失。
        // 骨骼动画导出（isBoneAnim）除外：其时间变量 v.<数字>_time 词法不识别，挂 program 会
        // runBlockProgram 报错，统一走导入末尾 reconstructBoneAnimationImports 重建。
        // 触发 molang 接管的条件（任一满足即接管，避免指令内容拆分丢失）：
        //  ① 表达式含有逻辑判别式（三元条件 / q. 查询 / 比较逻辑运算符）；
        //  ② 同一变量被先后定义多次（普通变量卡片只保留末次赋值，之前的赋值会被丢弃）；
        //  ③ ★无「方块编号：」标签（用户 2026-10-04 要求）：这类命令是「裸 molang 程序」——
        //     用户原话「直接根据双引号包裹的 molang 创建方块」，整段载荷就是程序本体，
        //     不做变量卡片拆解（拆解会丢 return / loop / 三目 / 中间态），整段存进 program。
        // 骨骼动画导出（isBoneAnim）除外：其时间变量 v.<数字>_time 词法不识别，挂 program 会
        // runBlockProgram 报错，统一走导入末尾 reconstructBoneAnimationImports 重建。
        const hasLogic = assignments.some(a => hasLogicalDiscriminator(a.expr));
        const hasRedef = hasRedefinedVariable(assignments);
        const takeMolangProgram = (hasLogic || hasRedef || !hasIdTag) && !isBoneAnim;
        if (takeMolangProgram) {
            newBlock.scope.molangMode = true;
            newBlock.scope.molangEditedByUser = false;
            // 无编号标签时整段载荷即程序（含 return / loop 等非赋值语句），不能走 extractMolangProgram
            // 的「去标签」清洗（它会误删含 `=` 的标签判定外的内容），直接用 content 原文。
            let programText = hasIdTag ? extractMolangProgram(content) : content.trim();
            // ID 冲突时改名：molang 程序里的时间变量 v.<rawId>_time 需要同步改为 v.<finalId>_time，
            // 否则程序执行时时间变量名与方块 ID 不匹配，关键帧动画无法驱动
            if (rawId !== finalId) {
                programText = programText.replace(
                    new RegExp(`v\\.${rawId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_time`, 'g'),
                    `v.${finalId}_time`
                );
            }
            newBlock.scope.program = programText;
            // 尝试从 molang 程序反向解析关键帧数据
            // 用 finalId 匹配程序里的 v.<finalId>_time（已同步改名）
            const kfData = parseKeyframeFromMolang(programText, finalId);
            if (kfData && !seenRawIds.has(rawId)) {
                keyframeData.set(finalId, kfData);
                // 更新动画时长以覆盖导入的关键帧
                const times = Array.from(kfData.frames.keys()).sort((a, b) => a - b);
                if (times.length > 0) {
                    keyframeAnimDuration = Math.max(keyframeAnimDuration, Math.ceil(times[times.length - 1]) + 2);
                }
            }
        }

        // 去重：同一 方块编号只真正创建一次（逐帧烘焙导出里同一方块会在多行重复出现，
        // 若每次都建块会产生大量“1a/1b”重复方块、模型被各帧姿势打散）。上面的文件夹/骨骼层级构建仍照常执行。
        if (seenRawIds.has(rawId)) {
            // 重复帧：跳过建块（文件夹层级已在上方构建，无需重复方块）
        } else {
            seenRawIds.add(rawId);
            newBlock.refresh();
            // 若导入时选中了文件夹（活动容器），不自动选中导入方块，避免清空活动文件夹；否则保持原行为
            addBlock(newBlock, true, !importParentFolder);
            successCount++;
        }
    }

    // 展开本次导入涉及的全部文件夹（含嵌套子骨骼，以及“已存在”的父级/根文件夹）：
    // 导入的文件夹默认 expanded=false，而大纲只在文件夹展开时才渲染其内容与子文件夹，
    // 否则整段导入的模型/骨骼层级会“消失”在列表里。这里同时展开新建的与已存在但被导入内容触及的文件夹，
    // 保证无论是首次导入还是往已有场景里再导入，导入的方块/骨骼都立即可见。
    new Set([...importedNewFolders, ...touchedFolders]).forEach(name => {
        const f = getFolder(name);
        if (f) f.expanded = true;
    });

    // 若导入时选中了文件夹，将本次导入中新建的「根文件夹」（即自身没有父级）归到该文件夹下，
    // 从而把整段导入内容嵌套进当前选中的文件夹内（导入内部的父子层级保持不变）。
    if (importParentFolder) {
        importedNewFolders.forEach(name => {
            const f = getFolder(name);
            if (f && !f.parentName) f.parentName = importParentFolder;
        });
        const pf = getFolder(importParentFolder);
        if (pf) pf.expanded = true;
    }

    // 更新全局变量
    for (let [n, g] of globalVars.entries()) {
        const sb = blocks.find(b => b.id === g.sourceBlockId);
        if (sb) {
            let nv = isConstantExpr(g.def.expr) ? parseFloat(g.def.expr) : evaluateExpression(g.def.expr, sb.scope.vars, globalVars, sb.scope.blockId);
            if (g.def.rangeMin !== undefined) {
                if (nv > g.def.rangeMax) g.def.rangeMax = nv;
                if (nv < g.def.rangeMin) g.def.rangeMin = nv;
                nv = Math.min(g.def.rangeMax, Math.max(g.def.rangeMin, nv));
            }
            g.def.value = nv;
        }
    }
    blocks.forEach(b => b.refresh());
    // 导入时识别显式 molang 父子关系：子块 molang 里引用了 t.<父>_*（且父块 ≠ 自身、且确实存在）即视为
    // 显式骨骼绑定，标记为 _boneParent + _boneExplicit=true，与紫色加号 ✛ 绑定等价。
    // 这样下方 syncFolderBoneHierarchy 会跳过已绑定的块（fBlock._boneParent 已存在），不会把它误当成文件夹
    // 自动骨骼；列表里拖拽该子块时 autoBoneUnbindOnFolderRemove 也因 isExplicitBoneBinding=true 而保留绑定，不解绑。
    for (const b of blocks) {
        if (b._boneParent) {
            // 导入/旧存档：按跟随表达式推断绑定方式（px → 枢轴绑定；bx → 局部轴绑定）
            if (!b._boneMode) b._boneMode = inferBoneModeFromBlock(b);
            continue;
        }
        const pId = inferMolangBoneParent(b);
        if (pId && pId !== b.id && blocks.some(x => x.id === pId)) {
            b._boneParent = pId;
            b._boneExplicit = true;
            b._boneMode = inferBoneModeFromBlock(b);
        }
    }
    // 导入末尾自动设骨干：用户规范「文件夹必须检查本文件夹是否有骨干方块，如果没有必须立即指定，
    // 不允许出现导入、复制产生无骨干方块的文件夹」。
    // 用 syncFolderBoneHierarchy 一次性批量处理：
    //  · 对本次触及的每个含方块文件夹自动设骨干（首块），
    //  · 并按 folder.parentName 把子文件夹骨干绑定到父文件夹骨干；
    //  · 非动画导出：不强制注入 molang（bindBone 仅记录 _boneParent/_boneExplicit=false），
    //    保持变量面板干净，导出也不含骨骼跟随指令；
    //  · 骨骼动画导出（'anim:'）：才用 force=true 注入完整 molang 跟随，供后续关键帧重建。
    const autoBackboneNames = new Set([...touchedFolders, ...importedNewFolders]);
    const animatedFolderNames = new Set(boneAnimExports.map(e => e.groupName).filter(Boolean));
    if (autoBackboneNames.size) {
        syncFolderBoneHierarchy(autoBackboneNames);
    }
    if (animatedFolderNames.size) {
        syncFolderBoneHierarchy(animatedFolderNames, { force: true });
    }
    // 骨骼动画导出（'anim:' + t.<id>_*）的专门重建：补骨干 t=0 静态姿态、发布 t.<id>_* 全局变量、
    // 提取关键帧到 keyframeData。必须在 syncFolderBoneHierarchy(force) 之后——子块的 t.<id>_* 引用 molang
    // 已在 autoBone 时由 bindBone 写入（v.xpos=t.1_px+pR·xbasepos_bone 等），只要骨干发布 t.1_*，
    // 子块 refresh 时即可正确跟随。
    if (boneAnimExports.length) reconstructBoneAnimationImports(boneAnimExports);
    if (selectedBlock) renderVariablesForBlock(selectedBlock);

    // 导入后刷新关键帧面板：为含关键帧的方块添加标签并重建时间轴
    let kfCount = 0;
    for (const [bid, kf] of keyframeData) {
        if (kf.frames.size > 0 && blocks.find(b => b.id === bid)) {
            kfCount++;
        }
    }
    if (kfCount > 0) {
        renderKeyframeBlockSelector();
        renderKeyframeTimeline();
        renderKeyframeDataPanel();
    }

    // 刷新方块列表（让紫色三角形角标立即显示）
    renderSideBlockList();

    // 显示结果提示（静默模式下交给调用方提示）
    const kfNote = kfCount > 0 ? `，识别到 ${kfCount} 个关键帧动画` : '';
    const autoNote = missingBlockIdTag ? `（命令无编号标签，已自动命名为 autoName 系列）` : '';
    if (!_silent) {
        if (failCount > 0) {
            showModal("导入完成", `成功导入 ${successCount} 个方块${kfNote}${autoNote}，${failCount} 条指令无法解析`, null, false);
        } else {
            showModal("导入完成", `成功导入 ${successCount} 个方块${kfNote}${autoNote}`, null, false);
        }
    }
    return { successCount, failCount, kfCount };
}

function showImportModal(mode, initialTab) {
    // initialTab: 可选，'obj' = 打开后直接停在「模型」页签（仅在 objImportEnabled 时生效；长按三角形按钮走这里）
    // mode: 'normal'（默认，导入到【当前项目】，原版行为）| 'external'（导入为临时项目「外部导入」）
    //       | 'overwrite'（覆盖型）| 'tempOverwrite'（临时覆盖型）
    // 「外部导入」临时项目语义只属于 URL(#cmds=) 进站与显式选择；普通导入按钮绝不进临时项目（用户 2026-09-12 反馈）。
    if (mode !== 'overwrite' && mode !== 'tempOverwrite' && mode !== 'external') mode = 'normal';
    const isLight = document.body.classList.contains('light-mode');
    const titleText = mode === 'overwrite' ? '覆盖型导入' : (mode === 'tempOverwrite' ? '临时覆盖型导入' : '📥 导入');
    const confirmText = mode === 'overwrite' ? '确认覆盖导入' : (mode === 'tempOverwrite' ? '确认临时覆盖' : '确认导入');

    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal io-soft';
    modalDiv.style.zIndex = '1001';
    modalDiv.innerHTML = `
        <div class="modal-content io-shell" style="max-width: 460px;">
            <div class="io-head">
                <span>${titleText}</span>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="seg-group" id="importSegGroup">
                        <button class="seg-btn active" id="importModeCmd" type="button"><span class="seg-ico">📄</span>命令</button>
                        <button class="seg-btn" id="importModeStruct" type="button"><img class="seg-ico" src="Textures/structure_block_save.png" alt="">结构</button>
                        <button class="seg-btn" id="importModeObj" type="button"><span class="seg-ico"><svg viewBox="0 0 14 14" width="14" height="14" fill="#2563eb" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 2 H13 V13 H2 V6 Z"/></svg></span>模型</button>
                        <span class="seg-tri" aria-hidden="true"></span>
                    </div>
                    <button class="io-close" id="importCloseBtn" type="button" title="关闭">✕</button>
                </div>
            </div>
            <div class="io-body">
                <div id="cmdImportArea">
                    <div class="io-labelrow">
                        <span class="label-hint">命令内容</span>
                        <button class="io-link" id="importFileBtn" type="button">选择文件</button>
                    </div>
                    <div class="io-field">
                        <textarea id="importTextarea" class="io-textarea" rows="5" placeholder="粘贴 playanimation 命令文本"></textarea>
                    </div>
                </div>
                <div id="structImportArea" style="display:none;">
                    <div class="struct-drop" id="mcStructImportDropZone">
                        <img src="Textures/structure_block_save.png" alt="">
                        <div class="struct-drop-txt">
                            <b>选择 .mcstructure 文件</b>
                            <span>也可拖放到此处</span>
                        </div>
                    </div>
                    <div id="mcStructImportStatus" class="label-hint" style="margin-top:8px;min-height:16px;color:${isLight ? '#15803d' : '#4ade80'};"></div>
                </div>
                <div id="objImportArea" style="display:none;">
                    <div class="struct-drop" id="objImportDropZone">
                        <span class="drop-emoji"><svg viewBox="0 0 64 44" width="100%" height="100%" fill="#2563eb" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block"><path d="M4 30 H12 V34 L8 38 H4 Z"/><path d="M17 16 H31 V34 L27 38 H17 V20 L21 16 Z M21 20 H27 V30 L23 34 H21 V24 L25 20 Z" fill-rule="evenodd"/><path d="M36 6 H40 V18 H50 V34 L46 38 H36 V6 Z M40 22 H46 V30 L42 34 H40 V22 Z" fill-rule="evenodd"/><path d="M54 9 L57 6 H60 V9 L57 12 H54 Z"/><rect x="55" y="18" width="4" height="20"/><line x1="57" y1="38" x2="52.8" y2="42.2" stroke="#2563eb" stroke-width="4" stroke-linecap="round"/></svg></span>
                        <div class="struct-drop-txt">
                            <b>选择 .obj 模型文件</b>
                            <span>也可拖放到此处</span>
                            <span class="drop-name"></span>
                        </div>
                        <span class="drop-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                    </div>
                    <div class="obj-row">
                        <button class="obj-tog on" id="objNormOn" type="button"><span>归一化</span></button>
                        <span class="label-hint">最长边</span>
                        <input class="obj-num" id="objSize" type="number" min="0.01" step="1" value="1">
                    </div>
                    <div class="obj-row">
                        <span class="label-hint">落位</span>
                        <button class="obj-tog on" id="objPlaceGround" type="button"><span>贴地</span></button>
                        <button class="obj-tog" id="objPlaceCenter" type="button"><span>居中</span></button>
                        <button class="obj-tog" id="objPlaceOrigin" type="button"><span>保持 Y</span></button>
                    </div>
                    <div class="obj-row">
                        <span class="label-hint">法线朝向</span>
                        <div class="obj-lever on-r" id="objNormalLever" role="switch" aria-checked="true" title="像换轨拨杆：拨向右侧 = 亮面朝外；拨向左侧 = 亮面朝内（会变暗，正常现象）">
                            <span class="lever-opt lever-l">向内</span>
                            <span class="lever-opt lever-r on">向外</span>
                            <span class="lever-base"></span>
                            <span class="lever-stick"><svg viewBox="0 0 13 12" xmlns="http://www.w3.org/2000/svg"><polyline points="1,11 6.5,1 12,11" fill="none" stroke="#7c3aed" stroke-width="2.6" stroke-linecap="butt" stroke-linejoin="miter"/></svg></span>
                        </div>
                        <span class="normal-anim" id="objNormalAnim" title="紫色向量 = 法线方向：平面在左上、红色中心在右下，向量沿两者连线；平面挡在向量之前（穿过去的部分被遮住）。指向外部 → 亮面朝外；指向内部（薄片画阴影 = 会变暗，正常现象）→ 亮面朝内。">
                            <svg viewBox="0 0 116 88" xmlns="http://www.w3.org/2000/svg">
                                <!-- 薄片平面：3D 透视梯形（上窄下宽、侧边内收）再整体逆时针转 20° 增加动势，仅细紫描边、无填充 -->
                                <polygon id="naSheet" points="16,57 69,32 50,17 21,34" fill="none" stroke="#7c3aed" stroke-width="1" stroke-linejoin="miter"/>
                                <!-- 向内时的变暗阴影（覆盖在薄片上，平面区域变暗） -->
                                <polygon id="naShadow" points="16,57 69,32 50,17 21,34" fill="#0b1220" opacity="0"/>
                                <!-- 法线向量：与平面底边垂直（即平面法线），且穿过平面中心 P(39,35) 与红色中心 C(54,68)；向外=沿法线朝 P 外侧、向内=指向 C，同线反向 -->
                                <g id="naArrow" stroke="#7c3aed" stroke-width="1.5" fill="none" stroke-linecap="butt" stroke-linejoin="miter">
                                    <line id="naLine" x1="39" y1="35" x2="28" y2="11"/>
                                    <polyline id="naHead" points="28,20 28,11 35,17"/>
                                </g>
                                <!-- 红色中心点（落在平面法线上，与平面中心共线且箭头垂直平面） -->
                                <circle id="naDot" cx="54" cy="68" r="3.4" fill="#ef4444"/>
                                <text id="naCap" x="58" y="84" text-anchor="middle" font-size="9" fill="#64748b" font-family="sans-serif">亮面朝外</text>
                            </svg>
                        </span>
                    </div>
                    <div id="objImportStatus" class="label-hint" style="margin-top:8px;min-height:16px;color:${isLight ? '#15803d' : '#4ade80'};"></div>
                </div>
                <div class="io-actions">
                    <button class="io-chip io-chip-green" id="importConfirmBtn"><span>${confirmText}</span></button>
                </div>
            </div>
        </div>
    `;
    // 三角指示器：居中于当前活动页签，切换时靠 CSS transition 左右滑动
    // ★ 必须定义在 appendChild 之前：positionSegTri() 在挂载后立即调用一次做初始定位，
    //   若 const 写在后面会踩 TDZ（Cannot access before initialization），整段 import 面板直接抛异常、所有按钮失效。
    const segGroup = modalDiv.querySelector('#importSegGroup');
    const segTri = modalDiv.querySelector('.seg-tri');
    const positionSegTri = () => {
        const active = segGroup.querySelector('.seg-btn.active');
        if (!active || !segTri) return;
        segTri.style.left = (active.offsetLeft + active.offsetWidth / 2) + 'px';
    };
    document.body.appendChild(modalDiv);
    positionSegTri();   // 初始把三角定位到默认选中的「命令」页签

    /* ---------- OBJ 包围盒预览（归一化开启时）----------
       归一化一打开：① 场景里画 Box3Helper 线框；② 右下角泡泡显示三边尺寸；
       ③ 导入面板切「预览态」（遮罩近乎透明 + 面板靠左）——否则 .modal 默认 85% 黑遮罩，
          场景根本看不见，用户没法「确认包围盒实际大小」。
       ★必须在 closeModal 之前定义（closeModal 引用 objBBoxTeardown）。 */
    let objBBoxHelper = null, objBBoxBubble = null, objBBoxMuted = false, lastObjPlan = null;

    const objBBoxTeardown = () => {
        if (objBBoxHelper) {
            try { scene.remove(objBBoxHelper); if (objBBoxHelper.geometry) objBBoxHelper.geometry.dispose(); if (objBBoxHelper.material) objBBoxHelper.material.dispose(); } catch (e) {}
            objBBoxHelper = null;
        }
        if (objBBoxBubble) { try { objBBoxBubble.remove(); } catch (e) {} objBBoxBubble = null; }
        try { modalDiv.classList.remove('obj-bbox-preview'); } catch (e) {}
    };

    const objBBoxEnsureBubble = () => {
        if (objBBoxBubble) return objBBoxBubble;
        const el = document.createElement('div');
        el.className = 'obj-bbox-bubble';
        el.innerHTML = '<div class="obb-head"><span class="obb-diamond"></span><span class="obb-title">包围盒预览</span>'
            + '<button class="obb-x" type="button" title="隐藏预览（不影响导入参数）">✕</button></div>'
            + '<div class="obb-body">'
            + '<div class="obb-dim"><span>X</span><b data-obb="x">–</b></div>'
            + '<div class="obb-dim"><span>Y</span><b data-obb="y">–</b></div>'
            + '<div class="obb-dim"><span>Z</span><b data-obb="z">–</b></div>'
            + '<div class="obb-hint" data-obb="hint"></div></div>';
        document.body.appendChild(el);
        // 拖动：pointer capture，与 molang 泡泡同款手感
        const head = el.querySelector('.obb-head');
        let drag = null;
        head.addEventListener('pointerdown', (e) => {
            if (e.target.closest && e.target.closest('.obb-x')) return;
            const r = el.getBoundingClientRect();
            drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            el.classList.add('dragging');
            el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
            el.style.right = 'auto'; el.style.bottom = 'auto';
            try { head.setPointerCapture(e.pointerId); } catch (er) {}
            e.preventDefault();
        });
        head.addEventListener('pointermove', (e) => {
            if (!drag) return;
            el.style.left = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, e.clientX - drag.dx)) + 'px';
            el.style.top = Math.max(4, Math.min(window.innerHeight - el.offsetHeight - 4, e.clientY - drag.dy)) + 'px';
        });
        const endDrag = () => { if (drag) { drag = null; el.classList.remove('dragging'); } };
        head.addEventListener('pointerup', endDrag);
        head.addEventListener('pointercancel', endDrag);
        el.querySelector('.obb-x').onclick = (ev) => {
            ev.stopPropagation();
            objBBoxMuted = true;                       // 本次面板会话内不再自动冒出来
            updateObjBBoxPreview(lastObjPlan);
        };
        objBBoxBubble = el;
        return el;
    };

    const updateObjBBoxPreview = (r) => {
        lastObjPlan = r || lastObjPlan;
        const want = (importMode === 'obj') && objOpts.normalize && r && r.ok && r.bbox && !objBBoxMuted;
        if (!want) { objBBoxTeardown(); return; }
        // ① 场景线框（depthTest=false ⇒ 即使被方块/网格挡住也能看到轮廓）
        if (!objBBoxHelper) {
            objBBoxHelper = new THREE.Box3Helper(new THREE.Box3(), 0x38bdf8);
            objBBoxHelper.material.depthTest = false;
            objBBoxHelper.material.transparent = true;
            objBBoxHelper.material.opacity = 0.92;
            objBBoxHelper.renderOrder = 999;
            scene.add(objBBoxHelper);
        }
        const b = r.bbox;
        objBBoxHelper.box.min.set(b.min[0], b.min[1], b.min[2]);
        objBBoxHelper.box.max.set(b.max[0], b.max[1], b.max[2]);
        objBBoxHelper.updateMatrixWorld(true);
        // ② 泡泡尺寸
        const el = objBBoxBubble || objBBoxEnsureBubble();
        const F = v => (Math.round(Math.abs(v) * 1000) / 1000).toFixed(3);
        el.querySelector('[data-obb="x"]').textContent = F(b.size[0]);
        el.querySelector('[data-obb="y"]').textContent = F(b.size[1]);
        el.querySelector('[data-obb="z"]').textContent = F(b.size[2]);
        el.querySelector('[data-obb="hint"]').textContent =
            '最长边 ' + F(Math.max(b.size[0], b.size[1], b.size[2]))
            + '（原始 ' + F(r.rawMaxDim) + '，×' + F(r.k) + '）';
        // ③ 面板预览态：遮罩透明 + 靠左，露出场景中心的包围盒
        modalDiv.classList.add('obj-bbox-preview');
    };

    const closeModal = () => { try { objBBoxTeardown(); } catch (e) {} modalDiv.remove(); };
    modalDiv.querySelector('#importCloseBtn').onclick = closeModal;

    const cmdArea = modalDiv.querySelector('#cmdImportArea');
    const structArea = modalDiv.querySelector('#structImportArea');
    const objArea = modalDiv.querySelector('#objImportArea');
    const textarea = modalDiv.querySelector('#importTextarea');
    const fileBtn = modalDiv.querySelector('#importFileBtn');
    const modeCmdBtn = modalDiv.querySelector('#importModeCmd');
    const modeStructBtn = modalDiv.querySelector('#importModeStruct');
    const modeObjBtn = modalDiv.querySelector('#importModeObj');
    // OBJ 模型导入入口：默认关闭 ⇒ 未开启时隐藏「模型」页签（由长按三角形按钮 / 开发者选项清除来控制）
    if (!objImportEnabled && modeObjBtn) modeObjBtn.style.display = 'none';
    const confirmBtn = modalDiv.querySelector('#importConfirmBtn');
    let selectedFile = null;
    let isFileLoaded = false;
    let importMode = 'cmd'; // 'cmd' | 'struct' | 'obj'
    // OBJ 导入参数（页签级状态；切换页签不清空，便于来回比对）
    const objOpts = { normalize: true, size: 1, place: 'ground', axis: 'yup', normalOut: true };
    let objText = null;      // 已载入的 .obj 文本
    let objPlan = null;      // 最近一次解析出的待生成清单

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'mcStructFileInput';                 // 供 applyMcStructUiVisibility 按开关改 accept
    fileInput.dataset.cmdAccept = '.txt,.mcfunction';   // 「命令」页的基础 accept（不含 .mcstructure）
    fileInput.accept = '.txt,.mcfunction,.mcstructure';
    fileInput.style.display = 'none';
    modalDiv.appendChild(fileInput);

    const updateStructStatus = (text, isError) => {
        const status = modalDiv.querySelector('#mcStructImportStatus');
        if (!status) return;
        status.textContent = text || '';
        status.style.color = isError ? (isLight ? '#b91c1c' : '#f87171') : (isLight ? '#15803d' : '#4ade80');
    };
    const updateObjStatus = (text, isError) => {
        const status = modalDiv.querySelector('#objImportStatus');
        if (!status) return;
        status.textContent = text || '';
        status.style.color = isError ? (isLight ? '#b91c1c' : '#f87171') : (isLight ? '#15803d' : '#4ade80');
    };
    // OBJ 拖放区「已载入」视觉：隐藏提示文案、直接显示模型名、右下角画勾勾
    const objDropEl = modalDiv.querySelector('#objImportDropZone');
    const setObjDropLoaded = (name) => {
        if (!objDropEl) return;
        objDropEl.classList.add('is-loaded');
        const b = objDropEl.querySelector('.struct-drop-txt b');
        const nm = objDropEl.querySelector('.drop-name');
        if (b) { b.textContent = (name || '模型文件'); b.title = (name || ''); }
        if (nm) nm.textContent = '已载入 · 点击重新选择';
    };
    const setObjDropEmpty = () => {
        if (!objDropEl) return;
        objDropEl.classList.remove('is-loaded');
        const b = objDropEl.querySelector('.struct-drop-txt b');
        const nm = objDropEl.querySelector('.drop-name');
        if (b) { b.textContent = '选择 .obj 模型文件'; b.removeAttribute('title'); }
        if (nm) nm.textContent = '';
    };
    // 按当前页签设定 accept：三种页签互斥（避免「模型」页收进结构文件等混乱）
    const applyAccept = () => {
        if (importMode === 'obj') fileInput.accept = '.obj';
        else if (importMode === 'struct') fileInput.accept = '.mcstructure';
        else fileInput.accept = (typeof mcStructUiVisible === 'function' && mcStructUiVisible())
            ? '.txt,.mcfunction,.mcstructure' : fileInput.dataset.cmdAccept;
    };
    // OBJ：按当前参数（归一化 / 最长边 / 落位）重新解析出待生成清单并回显
    const objReplan = () => {
        if (!objText) { objPlan = null; try { updateObjBBoxPreview(null); } catch (e) {} return null; }
        const r = objPlanModel(objText, { normalize: objOpts.normalize, size: objOpts.size, place: objOpts.place, axis: objOpts.axis, normalOut: objOpts.normalOut, maxBlocks: 30000 });
        if (!r.ok) { objPlan = null; updateObjStatus('❌ ' + r.err, true); try { updateObjBBoxPreview(null); } catch (e) {} return null; }
        objPlan = r.plan;
        const warn = (r.plan.length > 4000 ? '（块数较大，生成可能较慢）' : '') + (r.overflow ? '（超出上限已截断）' : '');
        const coal = (r.coalescedTo && r.coalescedTo < r.coalescedFrom) ? `，共面合并 ${r.coalescedFrom}→${r.coalescedTo} 面` : '';
        const cull = (r.culledCoincident > 0) ? `，剔除接触面 ${r.culledCoincident} 片` : '';
        updateObjStatus(`已解析：${r.nVert} 顶点 / ${r.nFace} 面 → ${r.plan.length} 个方块`
            + coal + cull + (r.faceFail ? `，${r.faceFail} 面失败` : '') + ' ' + warn, r.faceFail > 0);
        try { updateObjBBoxPreview(r); } catch (e) {}   // 归一化开启 ⇒ 场景线框 + 尺寸泡泡
        return r;
    };

    const setImportMode = (m) => {
        if (m === 'obj' && !objImportEnabled) m = 'cmd';   // 防御：OBJ 入口未开启时绝不切到「模型」页
        importMode = m;
        // 选中态交给 .seg-btn.active 的 CSS（自动适配深/浅色），JS 只切 class
        modeCmdBtn.classList.toggle('active', m === 'cmd');
        modeStructBtn.classList.toggle('active', m === 'struct');
        modeObjBtn.classList.toggle('active', m === 'obj');
        positionSegTri();
        cmdArea.style.display = (m === 'cmd') ? 'block' : 'none';
        structArea.style.display = (m === 'struct') ? 'block' : 'none';
        objArea.style.display = (m === 'obj') ? 'block' : 'none';
        applyAccept();
        confirmBtn.querySelector('span').textContent = (m === 'struct') ? '导入结构' : (m === 'obj' ? '导入模型' : confirmText);
        selectedFile = null;
        isFileLoaded = false;
        fileInput.value = '';
        textarea.value = '';
        // 外观全部交给 .io-textarea / .io-textarea.is-loaded 的 CSS，JS 不再写内联样式
        textarea.classList.remove('is-loaded');
        textarea.readOnly = false;
        updateStructStatus('', false);
        if (m !== 'obj') { objText = null; objPlan = null; setObjDropEmpty(); }
        else if (objText) { setObjDropLoaded(objOpts._name); }
        updateObjStatus(objText ? `已载入：${objOpts._name || '模型'}` : '', false);
        if (m === 'obj' && objText) objReplan();
        else { try { updateObjBBoxPreview(null); } catch (e) {} }
    };

    modeCmdBtn.onclick = () => setImportMode('cmd');
    modeStructBtn.onclick = () => setImportMode('struct');
    modeObjBtn.onclick = () => setImportMode('obj');

    fileBtn.onclick = () => fileInput.click();

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            selectedFile = null;
            isFileLoaded = false;
            if (importMode === 'struct') updateStructStatus('', false);
            else {
                textarea.value = '';
                textarea.classList.remove('is-loaded');
                textarea.readOnly = false;
                if (importMode === 'obj') setObjDropEmpty();
            }
            return;
        }
        // 命令模式下若选到 .mcstructure，自动切到结构模式（结构入口被隐藏时不切，直接拒绝）
        if (importMode === 'cmd' && file.name.toLowerCase().endsWith('.mcstructure')) {
            if (typeof mcStructUiVisible === 'function' && !mcStructUiVisible()) {
                updateStructStatus('MC 结构功能未开启（设置 → 🛠 开发者工具 → 显示 MC 结构导入 / 导出）', true);
                return;
            }
            setImportMode('struct');
            selectedFile = file;
            isFileLoaded = true;
            updateStructStatus(`已载入：${file.name}`, false);
            return;
        }
        // 命令模式下若选到 .obj，自动切到「模型」模式
        if (importMode === 'cmd' && file.name.toLowerCase().endsWith('.obj')) {
            setImportMode('obj');
            selectedFile = file; isFileLoaded = true; objOpts._name = file.name;
            try { objText = await file.text(); } catch (err) { objText = null; }
            if (objText) { setObjDropLoaded(file.name); objReplan(); } else updateObjStatus('读取失败', true);
            return;
        }
        if (importMode === 'struct') {
            selectedFile = file;
            isFileLoaded = true;
            updateStructStatus(`已载入：${file.name}`, false);
            return;
        }
        if (importMode === 'obj') {
            if (!file.name.toLowerCase().endsWith('.obj')) { updateObjStatus('请选择 .obj 文件', true); return; }
            selectedFile = file; isFileLoaded = true; objOpts._name = file.name;
            try { objText = await file.text(); } catch (err) { objText = null; }
            if (objText) { setObjDropLoaded(file.name); objReplan(); } else updateObjStatus('读取失败', true);
            return;
        }
        selectedFile = file;
        isFileLoaded = true;
        textarea.value = `已载入文件：${file.name}`;
        textarea.classList.add('is-loaded');
        textarea.readOnly = true;
    });

    textarea.addEventListener('input', () => {
        if (textarea.value.trim() && !isFileLoaded) {
            selectedFile = null;
            fileInput.value = '';
        } else if (isFileLoaded && textarea.value !== `已载入文件：${selectedFile.name}`) {
            isFileLoaded = false;
            textarea.classList.remove('is-loaded');
            textarea.readOnly = false;
        }
    });

    // 取文逻辑：优先已载入文件，否则取文本框内容
    const collectImportText = async () => {
        if (isFileLoaded && selectedFile) {
            try {
                return await selectedFile.text();
            } catch (err) {
                showModal('❌ 读取失败', '无法读取文件内容', null, false);
                return null;
            }
        }
        const t = textarea.value.trim();
        if (!t) {
            showModal('⚠️ 输入为空', '请粘贴命令文本或选择文件', null, false);
            return null;
        }
        return t;
    };

    // 结构导入拖放
    const dropZone = modalDiv.querySelector('#mcStructImportDropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag'); });
        dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag'); });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag');
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!f) return;
            if (!f.name.toLowerCase().endsWith('.mcstructure')) {
                updateStructStatus('请选择 .mcstructure 文件', true);
                return;
            }
            selectedFile = f;
            isFileLoaded = true;
            updateStructStatus(`已载入：${f.name}`, false);
        });
        dropZone.onclick = () => fileInput.click();
    }

    // OBJ 模型导入拖放
    const objDropZone = modalDiv.querySelector('#objImportDropZone');
    if (objDropZone) {
        objDropZone.addEventListener('dragover', (e) => { e.preventDefault(); objDropZone.classList.add('drag'); });
        objDropZone.addEventListener('dragleave', () => objDropZone.classList.remove('drag'));
        objDropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            objDropZone.classList.remove('drag');
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!f) return;
            if (!f.name.toLowerCase().endsWith('.obj')) { updateObjStatus('请选择 .obj 文件', true); return; }
            selectedFile = f; isFileLoaded = true; objOpts._name = f.name;
            try { objText = await f.text(); } catch (err) { objText = null; }
            if (objText) { setObjDropLoaded(f.name); objReplan(); } else updateObjStatus('读取失败', true);
        });
        objDropZone.onclick = () => fileInput.click();
    }

    // OBJ 参数按钮（归一化 / 最长边 / 落位）：任一项变动都重算清单
    const objNormBtn = modalDiv.querySelector('#objNormOn');
    const objSizeInput = modalDiv.querySelector('#objSize');
    if (objSizeInput) objSizeInput.disabled = !objOpts.normalize;
    if (objNormBtn) objNormBtn.onclick = () => {
        objOpts.normalize = !objOpts.normalize;
        objNormBtn.classList.toggle('on', objOpts.normalize);
        if (objSizeInput) objSizeInput.disabled = !objOpts.normalize;
        objReplan();
    };
    if (objSizeInput) objSizeInput.addEventListener('input', () => {
        const val = parseFloat(objSizeInput.value);
        if (isFinite(val) && val > 0) { objOpts.size = val; objReplan(); }
    });
    const objPlaceBtns = [['#objPlaceGround', 'ground'], ['#objPlaceCenter', 'center'], ['#objPlaceOrigin', 'origin']];
    objPlaceBtns.forEach(([sel, val]) => {
        const b = modalDiv.querySelector(sel);
        if (!b) return;
        b.onclick = () => {
            objOpts.place = val;
            objPlaceBtns.forEach(([s2]) => { const bb = modalDiv.querySelector(s2); if (bb) bb.classList.toggle('on', bb === b); });
            objReplan();
        };
    });
    // 法线朝向：老式货车换轨拨杆（拨向右侧=向外 / 左侧=向内），点击切换；右侧薄片示意动画联动
    //（平面仅细紫描边无填充；向外=箭头画在平面上、向内=箭头指向红色中心+平面画阴影示意变暗）
    const objNormalLever = modalDiv.querySelector('#objNormalLever');
    const objLeverOptL = modalDiv.querySelector('#objNormalLever .lever-l');
    const objLeverOptR = modalDiv.querySelector('#objNormalLever .lever-r');
    const objNormalAnimUpdate = (out) => {
        const shadow = modalDiv.querySelector('#naShadow');
        const line = modalDiv.querySelector('#naLine');
        const head = modalDiv.querySelector('#naHead');
        const cap = modalDiv.querySelector('#naCap');
        if (out) {                                   // 向外：沿平面法线朝 P 外侧（与向内相反、同线、垂直于平面）
            line.setAttribute('x1', '39'); line.setAttribute('y1', '35');
            line.setAttribute('x2', '28'); line.setAttribute('y2', '11');
            head.setAttribute('points', '28,20 28,11 35,17');   // 翼沿杆向后掠（±28°），不是横杠
            shadow.setAttribute('opacity', '0');
            cap.textContent = '亮面朝外';
        } else {                                     // 向内：同一条法线，指向红色中心 C(54,68)，平面画阴影示意变暗
            line.setAttribute('x1', '39'); line.setAttribute('y1', '35');
            line.setAttribute('x2', '54'); line.setAttribute('y2', '68');
            head.setAttribute('points', '55,59 54,68 47,63');
            shadow.setAttribute('opacity', '0.45');
            cap.textContent = '亮面朝内·变暗';
        }
    };
    const objNormalSet = (out) => {
        objOpts.normalOut = out;
        if (objNormalLever) {
            objNormalLever.classList.toggle('on-r', out);
            objNormalLever.classList.toggle('on-l', !out);
            objNormalLever.setAttribute('aria-checked', out ? 'true' : 'false');
        }
        if (objLeverOptR) objLeverOptR.classList.toggle('on', out);
        if (objLeverOptL) objLeverOptL.classList.toggle('on', !out);
        objNormalAnimUpdate(out);
        objReplan();
    };
    if (objNormalLever) objNormalLever.onclick = () => objNormalSet(!objOpts.normalOut);
    objNormalSet(!!objOpts.normalOut);   // 初始态同步（拨杆方向 + 动画）

    // 初始态 + 开关同步：「结构」页签默认隐藏（见 mcStructUiVisible）
    // 暴露面板 API：长按三角形按钮时若面板已打开，可直接把页签切到 OBJ
    _importModalApi = { modalDiv, modeObjBtn, setImportMode };
    setImportMode((initialTab === 'obj' && objImportEnabled) ? 'obj' : 'cmd');
    try { if (typeof applyMcStructUiVisibility === 'function') applyMcStructUiVisibility(); } catch (e) {}

    modalDiv.querySelector('#importConfirmBtn').onclick = async () => {
        if (importMode === 'struct') {
            if (!isFileLoaded || !selectedFile) {
                showModal('⚠️ 未选择文件', '请选择 .mcstructure 文件', null, false);
                return;
            }
            try {
                const buf = await selectedFile.arrayBuffer();
                importMcStructure(new Uint8Array(buf), {});
                closeModal();
                showToast(`已导入结构：${selectedFile.name}`);
            } catch (e) {
                showModal('❌ 结构导入失败', e && e.message ? e.message : String(e), null, false);
            }
            return;
        }
        if (importMode === 'obj') {
            if (!objPlan || !objPlan.length) {
                showModal('⚠️ 未就绪', '请先选择 .obj 模型文件', null, false);
                return;
            }
            const plan = objPlan.slice();
            closeModal();
            // ★obj 也必须走「覆盖型 / 临时覆盖型 / 外部导入」的同一流程（清空 + 落库/转临时 + 撤销基线）。
            //   旧实现这里无条件 objCommitPlan(plan) 就 return，把上面 mode 的分支全绕过了 ⇒
            //   从文件菜单选「覆盖型导入 / 临时覆盖型导入」再导入 .obj 时，覆盖效果完全不生效。
            const applyPlan = () => objCommitPlan(plan, true, true);   // silent + clearFirst：toast 由外层统一给
            if (mode === 'overwrite' || mode === 'tempOverwrite') {
                await importOverwriteToCurrentProject(null, mode === 'tempOverwrite', applyPlan);
                return;
            }
            if (mode === 'external') {
                await importExternalToTempProject(null, applyPlan);
                return;
            }
            objCommitPlan(plan);
            return;
        }
        const text = await collectImportText();
        if (text == null) return;
        // 覆盖型 / 临时覆盖型（文件菜单子选项进入）：不再弹确认弹窗，仅 toast 提示后直接导入（用户 2026-09-12 要求）
        if (mode === 'overwrite' || mode === 'tempOverwrite') {
            if (!currentProjectId) {
                // 不在项目内：与确认导入同效
                closeModal();
                await importExternalToTempProject(text);
                return;
            }
            closeModal();
            showToast(mode === 'tempOverwrite'
                ? `⚠️ 将清空当前项目「${currentProjectName || '该项目'}」并导入为临时项目`
                : `⚠️ 将清空当前项目「${currentProjectName || '该项目'}」并导入新模型（可通过「撤销」恢复）`);
            await importOverwriteToCurrentProject(text, mode === 'tempOverwrite');
            return;
        }
        closeModal();
        if (mode === 'external') {
            await importExternalToTempProject(text);
            return;
        }
        // 普通导入（normal）：导入到当前项目（原版行为，不清场、不转临时项目）；
        // 仅当根本不在任何项目内时才落到「外部导入」临时项目，避免导入内容无处安放。
        if (!currentProjectId) {
            await importExternalToTempProject(text);
            return;
        }
        await importFromCommands(text);
    };
}

/* 开启 OBJ 模型导入入口（★ 状态持久化：写入 localStorage，刷新后仍然有效）。
   触发方式：新操作模式 · 画笔模式 · 生成方块状态下【长按「三角形」按钮】。
   —— 若导入面板此刻开着，就地露出「模型」页签并切过去；否则打开导入面板并定位到「模型」。 */
function enableObjImport() {
    objImportEnabled = true;
    try { localStorage.setItem('ex_obj_import_enabled', '1'); } catch (e) {}
    if (_importModalApi && document.body.contains(_importModalApi.modalDiv)) {
        try {
            if (_importModalApi.modeObjBtn) _importModalApi.modeObjBtn.style.display = '';
            _importModalApi.setImportMode('obj');
        } catch (e) {}
    } else {
        try { showImportModal('normal', 'obj'); } catch (e) {}
    }
    showToast('已开启 OBJ 模型导入', { duration: 2200 });
}

/* 清除 OBJ 模型导入「已开启」状态：入口恢复默认关闭（供开发者选项调用），并清掉持久化标记 */
function clearObjImportEnabled() {
    objImportEnabled = false;
    try { localStorage.removeItem('ex_obj_import_enabled'); } catch (e) {}
    if (_importModalApi && document.body.contains(_importModalApi.modalDiv)) {
        try {
            if (_importModalApi.modeObjBtn) _importModalApi.modeObjBtn.style.display = 'none';
            _importModalApi.setImportMode('cmd');   // 若正停在「模型」页，退回「命令」页
        } catch (e) {}
    }
}
document.getElementById('importBtn').onclick = showImportModal;

