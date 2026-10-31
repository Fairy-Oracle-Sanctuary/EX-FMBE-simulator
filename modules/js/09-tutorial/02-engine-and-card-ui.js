/* 09-tutorial/02-engine-and-card-ui.js · 源 测试版v.6b79.html 第 47185-49016 行 */
'use strict';
/* ============================================================
 * 分章节新手教程系统（引导式）：遮罩高亮 + 引导卡 + 章节目录
 * - 覆盖全功能，分 14 章 100+ 步
 * - localStorage 持久化（done/dismissed）；首启自动弹出章节目录
 * - 设置面板顶部注入「🎓 新手教程」可随时重开
 * - 遮罩全可穿透（pointer-events:none），只引导、不挡操作
 * ============================================================ */
const EX_TUT_KEY = 'ex_tutorial_v1';
// 各章「起点预设」（读档数据）：数组第 ci 项 = 第 ci 章开始时的唯一解模型状态。
// 由 gen_presets.cjs 构建教程后抓取 getState() 生成；进入某章即 restoreState 该预设，
// 保证每次打开都从正确基准开始（唯一解，不依赖用户此前是否手动搭过）。第 0 章=空场景（无方块）。
const TUT_CH_PRESETS = [null, null, null, null, null, null, null, null, null, null, null, null, null, null];
const EX_TUT_CHAPTERS = [
  { id: 'm1', icon: 'cube', title: '关于 EX版 FMBE', desc: '变量是什么 · 初步了解模拟器',
    steps: [
      { t: '变量', mode: 'new', prep: 'introBlock', canvas: true, demo: 'posMove',
        b: `EX版FMBE定义有很多变量，变量是控制方块姿态和形状的工具，本模拟器设计初衷是在场景里摆方块提高效率，而不是在代码里写方块。///对于新手而言，变量仅需知道是什么用即可，但并不否认灵活多样的表达式是无用的。接下来是简单的变量介绍///看画布：v.xpos 在变，方块就在动。///练习项目里已经替你放好一个方块并选中了它。` },
      { t: '黑话一：选中方块', mode: 'new', prep: 'introBlock', target: '#sideBlockList',
        b: `在画布上直接点方块，我们叫作视图选中。///在方块列表里点方块的名字，我们叫作方块列表选中。///两种方式都可以选中方块，只有选中后会显示它的变量。或者操作控件等///这块方块已经替你选中了（快说谢谢）` },
      { t: '旋转中心·枢轴', mode: 'new', prep: 'introAxes', canvas: true,
        b: `枢轴的坐标系是世界坐标系，是场景中的 X、Y、Z 三个方向，对应位置变量 xpos、ypos、zpos。///这三个变量是方块的旋转中心（枢轴），旋转和缩放都绕它进行。///这一步不用你操作。` },
      { t: 'rot 旋转', mode: 'new', prep: 'introRings', canvas: true, demo: 'localRot',
        b: `这三个环分别表示方块 X、Y、Z 的欧拉角旋转，对应旋转变量 xrot、yrot、zrot：沿某个环拖动，方块就绕那根轴转动。///旋转只改局部朝向（相关链接-basepos局部轴位移）。///看场景：xrot 在变，方块在原地转。` },
      { t: '黑话二：几个界面名称', mode: 'new', prep: 'introBlock', target: '#kfModeGroup',
        b: `新操作模式的右上角这排是主功能切换按钮：编辑模式、画笔模式、动画模式。///（据说作者可能参考了某简写为BB的建模软件和某二游，但是实际情况我们不得而知）///「编辑模式」主要职能是编辑方块常量赋值的变量，例如rotatex=67，但实际上有其他非显性功能///点「动画模式」会打开关键帧面板，专门摆关键帧做动画，后面有单独一节。///「画笔模式」其实质是一个二维描点工具，但该功能存在的意义尚不明确///切到旧操作模式后，底部那块是数据面板，选中方块的变量都列在里面。` },
      { t: '切到旧操作模式（变量编辑模式）', mode: 'new', freeMode: true, target: '#newLayoutSetting', thenTarget: ['#uiSettingsBtn', '#newLayoutSetting'],
        b: `前面认的都是新操作模式里的东西。接下来直接改变量，切到旧操作模式。///旧操作模式就是变量编辑模式：画布下方是数据面板，每个变量一张卡片，直接填表达式。///怎么切：点顶部「操作」→「设置」，左侧选「编辑」，把「启用新布局&操作方案」的勾去掉；电脑上也可以直接按 Alt+O。///如果上述按键都被狐狸叼走了就点下方「帮我做」。`,
        act: ['toOldMode'], check: () => !isNewLayoutMode },
      { t: '一个变量 = 一个表达式', mode: 'old', target: '#varsContainer',
        b: `旧模式下每个变量只能填一个表达式，不能按条件取值，也不能对同一个变量先后赋两次值。///仅能填无逻辑运算符的表达式。来试一下：把 v.xpos 改成纯数字 2。///额诶等一下，你应该知道表达式吧？///表达式是个黑话呢 但其实很简单 变量名=有值的算式 或者 直接就是数字 ///点 v.xpos 的输入框，更改一下数字值，改完后点击其他地方让表达式更新；不会做就点下方「帮我做」。`,
        act: ['setVarNumber'],
        check: () => { const b = selectedBlock; if (!b || (b.scope && b.scope.molangMode)) return false; const v = b.scope.vars.get('v.xpos'); const e = (v && v.expr != null) ? String(v.expr).trim() : ''; return /^[+-]?\d+(\.\d+)?$/.test(e) && parseFloat(e) !== 0; } },
      { t: '局部位移：xbasepos / ybasepos / zbasepos', mode: 'old', target: '#varsContainer', canvas: true, demo: 'rotBasepos',
        b: `局部位移 v.xbasepos / ybasepos / zbasepos：在方块自身的坐标系里挪动方块本体，其原点为枢轴。///看画布：先给方块一个固定的局部位移，再让旋转变量连续变化。方块会绕着枢轴画圈。` },
      { t: 'rotatex / rotatey / rotatez：第二层旋转矩阵', mode: 'old', target: '#varsContainer', canvas: true, demo: 'rotateAfterRot',
        b: `还有三个旋转变量 v.rotatex / v.rotatey / v.rotatez，它们是第二层旋转矩阵。///公版 ex 版前置里没有这三个变量：依梓爱做骨骼动画时遇上麻烦，于是改动了 ex 版前置，额外加了这三个变量。///它不是骨骼旋转，也不是父级旋转，而是 rot 旋转完之后的姿态再转一次；不只能用来做骨骼，配合 rot 用得得当，就能做出很多丰富的旋转效果。///在模拟器里，也可以把它当「全局旋转」的工具变量用。///看画布：方块先有一个固定倾斜，再沿世界的 Y 轴整体转。` },
      { t: '把 rotate 换算成 rot：欧拉角转换', mode: 'old', target: '#sideBlockEuler',
        b: `rotate 的三个数可以完全换算成 rot：方块列表上方或者新操作模式的工具栏有一行蓝色的「欧拉角转换」。///点它，模拟器会把当前选中方块的 rotatex / rotatey / rotatez 换算进 xrot / yrot / zrot，换算后外观不变。///该功能比较特殊，实际用途还需亲自体会` },
      { t: '缩放：scale 与延伸缩放', mode: 'old', target: '#varsContainer', canvas: true, demo: 'scalePulse',
        b: `v.scale 是一个数字同时控制长、宽、高的倍率，1 是原大小，缩放基准点同样是枢轴。///延伸缩放把方块沿一个方向拉长：v.extend_scale 是拉伸量，v.extend_xrot / v.extend_yrot 决定拉伸方向偏转多少度。///它和 v.scale 叠加生效，用来做长条、斜撑这类不等比的形状。///看画布：方块在枢轴处原地放大缩小。` },
    ] },
  { id: 'm2', icon: 'chart', title: 'molang 模式：表达式接管', desc: '开启接管 · 分支赋值 · 顺序赋值 · 编辑器进阶 · 骨骼跟随原理',
    steps: [
      { t: '什么是 molang 模式', mode: 'old', target: '#molangTakeoverSetting', thenTarget: ['#uiSettingsBtn', '#molangTakeoverSetting'],
        b: `旧模式每个变量只能填一个表达式，写不出条件判断。///molang 模式用一段脚本一次性接管方块的全部变量，条件赋值、先后赋值都能写。///v. 开头是方块自己的变量：v.xpos 位置、v.xrot 局部旋转、v.scale 尺寸。///t. 开头是场景共用的变量，骨骼子块跟随父块读的就是 t.父_px 这类。///q. 开头是引擎每帧提供的实时数据，q.anim_time 是动画时间；math. 开头是数学函数。` },
      { t: '开启 molang 接管', mode: 'old', target: '#molangTakeoverSetting', thenTarget: ['#uiSettingsBtn', '#molangTakeoverSetting'],
        b: `点顶部「操作」→「设置」，分类选「编辑」，找到「molang 表达式接管」，点「使用 molang 表达式完全接管当前方块」，在确认框里点确定。///确定后设置面板会关闭，右侧出现 molang 编辑器，里面是方块当前的全部变量，不是空白。///这个操作不可逆，方块之后只能改 molang 文字，不再显示普通变量卡片。///下面几步就在这段文字上继续加内容。`,
        act: ['enableMolang'], check: () => !!(selectedBlock && selectedBlock.scope && selectedBlock.scope.molangMode) },
      { t: '优点一：可以分支赋值', mode: 'old', target: '#molangTextarea',
        b: `等号右边那一整段叫表达式，可以是一个数字、一个算式，也可以是带条件的式子。///molang 支持按条件赋值：同一个变量，条件成立取一个值，不成立取另一个值。///写法：v.xrot = q.rotation_to_camera(1) > 0 ? 90 : -90; 其中 q.rotation_to_camera(1) 返回相机相对方块的水平朝向角。///读作：朝向角大于 0 就取 90，否则取 -90。? 前是条件，? 和 : 之间是成立时的值，: 后是不成立时的值。///点下方「帮我做」，这句会加到编辑器末尾，原来那段变量一句都不会少。///也可以自己在编辑器里补一句带 ? : 的表达式。`,
        act: ['writeConditional'], check: () => { const b = selectedBlock; if (!b || !b.scope || !b.scope.molangMode) return false; const pr = b.scope.program || ''; return pr.indexOf('?') >= 0 && pr.indexOf(':') >= 0; } },
      { t: '优点二：可以顺序赋值', mode: 'old', target: '#molangTextarea',
        b: `同一变量可以先后赋值，后写的覆盖先写的。///v.xrot = 0; 下一句再写 v.xrot = 90; 程序从上往下执行，最终 v.xrot 等于 90。///点「帮我做」，末尾会加上这两句，原来的内容保持不变。///也可以自己动手补第二句，看后一句把前一句覆盖掉。`,
        act: ['writeSequential'], check: () => { const b = selectedBlock; if (!b || !b.scope || !b.scope.molangMode) return false; const pr = b.scope.program || ''; const cnt = {}; pr.split(';').forEach(function (ss) { const mm = /^\s*v\.(\w+)\s*=/.exec(ss); if (mm) cnt[mm[1]] = (cnt[mm[1]] || 0) + 1; }); return Object.keys(cnt).some(function (k) { return cnt[k] >= 2; }); } },
      { t: '帮助按钮', mode: 'old', target: '#molangHelpBtn',
        b: `molang 编辑器上方的「帮助」按钮打开函数速查弹窗。///分两块：查询函数（q.）和数学函数（math.）。///每一条都写了参数、返回值、作用，右侧有「复制」按钮，点一下复制到剪贴板。` },
      { t: '输入前缀自动弹候选', mode: 'old', target: '#molangTextarea',
        b: `在 molang 编辑器里输入 v. / t. / q. / math. 会自动弹出候选列表。///用 ↑↓ 选择，Tab 补全并保持列表打开，点击候选补全并关闭列表，Esc 关闭。///继续打字会过滤候选，输入 math.s 只显示 sqrt / sin 这类。`,
        act: ['openMolangAndTypeV'], check: () => { const el = document.getElementById('molangAutocomplete'); return !!el && el.style.display !== 'none'; } },
      { t: '点数字常量弹微调泡泡', mode: 'old', target: '#molangTextarea',
        b: `在编辑器里点任意数字（如 90 或 0.5），它上方会弹出一个微调泡泡。///泡泡有 ▲/▼ 按钮，可用滚轮微调，也可以直接上下拖动数值。///步长默认 1，可以改成 0.01 / 0.1 / 10，也能自己填。///点「常显」把它固定住，就能拖到任意位置边看边调。`,
        act: ['openMolangAndClickNumber'], check: () => !!document.querySelector('.molang-num-bubble') },
      { t: '哪里错了——精确到字符', mode: 'old', target: '#molangError', thenTarget: '#molangTextarea',
        b: `molang 编辑器下方有错误提示条。///报错会把出错的那一小段字符标红，不是整行；漏写分号时只标红没写完的那一条。///提示条里同时写明第几行、什么错误。///即使整段程序写成一行，也能定位到具体是哪一条表达式出错。` },
      { t: 't.xxx = 跨方块共享的变量', mode: 'old', target: '#varsContainer',
        b: `v.xxx 是方块自己的变量，t.xxx 是场景里所有方块共用的变量。///一个方块给 t.xxx 赋值，其他方块读到的就是这个新值。///骨骼系统会自动发布 t.<父块id>_px、_xrot 等，子块靠读这些值跟随父块。///场景共用的变量显示在变量面板的「全局变量」分组里。` },
      { t: 'q. 系列查询函数', mode: 'old', target: '#molangHelpBtn',
        b: `q.life_time：方块存在时长（秒），持续增长。///q.anim_time：关键帧动画当前时间。///q.rotation_to_camera(0)：相机相对方块的俯仰角。///q.rotation_to_camera(1)：相机相对方块的水平朝向角。///如果在设置里关掉「查询函数更新」，q. 的值会冻结在关闭那一刻。` },
      { t: 'math. 系列', mode: 'old', target: '#molangHelpBtn',
        b: `基础：sin / cos / asin / acos / atan / atan2。///幂指：pow / sqrt / exp / ln。///取整：floor / ceil / round / trunc。///区间：min / max / clamp / mod。///插值：lerp / lerprotate，lerprotate 按最短方向插值角度。///随机：random / random_integer / die_roll / die_roll_integer，每帧自动变化。///常量：pi / PI。` },
      { t: '骨骼跟随的表达式是怎么算的', mode: 'old', target: '#varsContainer',
        b: `先在练习项目里绑定一个父块，再打开子块的变量区，就能看到这几行。///枢轴绑定的写法：v.parent_xrot = t.父_xrot 读父块旋转；v.pR00..22 用 cos / sin 算出父块的旋转；v.xpos = t.父_px + v.pR00*偏移x + v.pR01*偏移y + v.pR02*偏移z，即位置 = 父块枢轴 + 旋转后的偏移。///局部轴绑定的写法：v.xbasepos = 父块 _bx 经坐标换算 + v.xbasepos_bone 固定偏移。///两种写法都是每帧重新计算，父块一动，子块立刻跟上。///所以骨骼子块的位置写成表达式，而不是一个固定数字。` },
      { t: '⇦ 转普通方块', mode: 'old', target: '#molangConvertBtn',
        b: `molang 编辑器右上角有「⇦ 转普通方块」按钮。///程序里只有变量赋值时按钮可点，点一下转回旧模式的变量卡片。///转换时表达式原样保留，含先后赋值和 t. 骨骼跟随，数值不变。///程序里有条件判断或依赖实时数据时按钮置灰，避免转回后效果丢失。` },
    ] },
  { id: 'm3', icon: 'gear', title: '新操作模式：全新布局', desc: '切到新模式 · 双列变量面板 · Gizmo 与文件夹',
    steps: [
      { t: '切换到「新操作模式」', mode: 'new', target: '#newLayoutSetting',
        b: '前两章讲的是怎么写变量，这一章换成新的界面布局。///新操作模式：顶部新工具条、左侧方块列表、画布上的 Gizmo 变换手柄、文件夹拖拽分组、双列变量面板，以及数据面板里的数值检查器（选中谁就显示谁的位移、旋转、缩放数值）。///点顶部「操作」→「设置」，分类选「编辑」，勾选「启用新布局&操作方案」（电脑上也可以按 Alt+N）。',
        act: ['toNewMode'], check: () => isNewLayoutMode },
      { t: '新模式的变量面板：双列分区', mode: 'new', target: '#sideBlockNew', thenTarget: ['#createCubeBtn', '#varsContainer'], pass: ['#sideBlockList'],
        b: '新模式下变量面板分成左右两列：左边是位移（位置、基准偏移），右边是旋转、缩放、扩展。///动手做：点左侧方块列表顶部的「＋」→「方块」新建一个（不会做就点下方「帮我做」），选中它，观察两列的分区。///新建的方块是普通模式，变量可以直接改，和 molang 模式不同。',
        act: ['newModeNormalBlock'], check: () => isNewLayoutMode && !!selectedBlock && !(selectedBlock.scope && selectedBlock.scope.molangMode) },
      { t: 'Gizmo 工具栏总览', mode: 'new', target: '#herTransformToolbar', canvas: true,
        b: '新模式的核心操作在画布：选中方块会出现三色 Gizmo 手柄，顶部工具栏用来切换手柄类型。///数据面板里的数值检查器和手柄联动，拖动时数值实时刷新。///下面把工具栏上的按钮一个一个指给你看，紫色框挪到哪个，就是在讲哪个。' },
      { t: '手把手 · 位移（V）', mode: 'new', target: '#herTransformToolbar [data-mode="base"]', canvas: true,
        b: '紫色框里是「位移」按钮：点它或按 V，方块上出现三根箭头，X 橙黄、Y 黄绿、Z 青，按住任意一根箭头线沿方向拖，方块就沿该轴移动。///箭头不好抓时，先用滚轮把相机拉近；要对准箭头线按下，按偏了会变成转视角。///注意：位移改的是基准偏移 v.xbasepos / ybasepos / zbasepos，不是位置 pos。///把方块挪开一段距离，数据面板里的数值检查器会实时刷新。',
        act: ['gizmoMove'], check: () => isNewLayoutMode && tutMovedFromBaseline(0.15) },
      { t: '手把手 · 缩放（S）', mode: 'new', target: '#herTransformToolbar [data-mode="scale"]', canvas: true,
        b: '这个是「缩放」按钮：点它或按 S，方块角上出现小方点，拖动它整体放大或缩小，写回 v.scale，枢轴点不动。///把方块明显放大一段。',
        act: ['gizmoScale'], check: () => isNewLayoutMode && herModes.has('scale') && tutScaledFromBaseline(0.08) },
      { t: '手把手 · 局部旋转（R）', mode: 'new', target: '#localRotMenuBtn', canvas: true,
        b: '这个是「局部旋转 ▾」下拉，里面有两个选项。///正常旋转：绕枢轴 pos 转。///模型旋转：自动换算 basepos，看起来是绕模型中心转。///按 R 只是切到旋转手柄，用哪个子模式取决于下拉里当前选中的那项。///教程默认是正常旋转：方块上出现三个彩色圆环，沿环拖就绕方块自身轴转，写 v.xrot / yrot / zrot。///先转一段角度，再点开下拉切「模型旋转」对比手感。',
        act: ['gizmoRotLocal'], check: () => isNewLayoutMode && (herModes.has('rotate') || herModes.has('centerRotate')) && tutRotatedFromBaseline(5) },
      { t: '手把手 · 全局旋转（Shift+R）', mode: 'new', target: '#globalRotMenuBtn', canvas: true,
        b: '这个是「全局旋转 ▾」下拉，同样有两个选项。///全局旋转：绕世界轴、绕枢轴 pos 转。///全局模型旋转：自动换算 basepos，看起来是绕模型中心转，规则和局部的两个选项一样。///按 Shift+R 只是切到全局旋转手柄，用哪个子模式取决于下拉里当前选中的那项。///它们写的是 v.rotatex / y / z。///拖一个环，和刚才的局部旋转对比一下。',
        act: ['gizmoRotGlobal'], check: () => isNewLayoutMode && (herModes.has('globalRotate') || herModes.has('globalCenterRotate')) && tutRotatedFromBaseline(5) },
      { t: '手把手 · 枢轴（P）——联动开启（默认）', mode: 'new', target: '#herTransformToolbar [data-mode="origin"]', canvas: true,
        b: '这个是「枢轴」按钮：点它或按 P，手柄变成一组箭头，拖动的是旋转和缩放的中心点，写 v.xpos / ypos / zpos。///「枢轴联动模型」默认开启，拖枢轴时整个模型跟着枢轴一起平移。///把枢轴拖到方块一角，再切回旋转转一下，就能看到绕角转的效果。',
        act: ['gizmoPivot'], check: () => isNewLayoutMode && herModes.has('origin') },
      { t: '进阶 · 枢轴不联动——关闭「枢轴联动模型」', mode: 'new', target: '#pivotLinkSetting',
        b: '刚才看到的是「枢轴联动模型」开启时的效果。///现在把它关掉：点顶部「操作」→「设置」，分类选「编辑」，取消勾选「枢轴联动模型」（或点下方「帮我做」）。///关掉后进入下一步，再拖一次枢轴，看模型不跟着走是什么手感。',
        act: ['pivotLinkOff'], check: () => isNewLayoutMode && !pivotLinkModel },
      { t: '手把手 · 枢轴不联动拖移', mode: 'new', target: '#herTransformToolbar [data-mode="origin"]', canvas: true,
        b: '现在「枢轴联动模型」已经关闭。///点「枢轴」或按 P，把枢轴拖动一段距离：模拟器自动换算 basepos，方块看起来没动，只有旋转中心在动。///和刚才联动开启时模型跟着枢轴走的样子对比一下。///练习项目里它会保持关闭，随时可以在设置里改回来。',
        act: ['pivotDragDemo'], check: () => isNewLayoutMode && !pivotLinkModel && tutPivotDraggedUnlinked(0.2) },
      { t: '进阶 · 世界轴位移——开启（默认关）', mode: 'new', target: '#worldAxisDispSetting',
        b: '再看「世界轴位移」，它默认关闭。///关闭时位移箭头跟着方块自身的旋转走，方块转过 90 度后再拖 X 箭头，方块会斜着移动。///现在打开它：点顶部「操作」→「设置」，分类选「编辑」，勾选「世界轴位移」（或点下方「帮我做」）。///打开后位移箭头始终对齐世界的 X / Y / Z，方块怎么转，拖箭头都沿世界方向移动。',
        act: ['worldAxisOn'], check: () => isNewLayoutMode && useWorldAxisDisplacement },
      { t: '手把手 · 世界轴位移拖移', mode: 'new', target: '#herTransformToolbar [data-mode="base"]', canvas: true,
        b: '「世界轴位移」现在已经打开。///点「位移」或按 V，拖一根箭头试试：箭头固定对齐世界方向，方块转过也一样沿世界方向走。///记住这个手感，和关闭时对比。',
        act: ['gizmoWorldAxis'], check: () => isNewLayoutMode && useWorldAxisDisplacement && tutMovedFromBaseline(0.15) },
      { t: '三种模式小结', mode: 'new', target: '#newLayoutSetting', thenTarget: '#sideBlockList',
        b: '回顾三种模式。///旧操作模式：每个变量一张卡片、只能填一个表达式、不能写判断，能填纯数字，最直观。///molang 模式：用一段脚本接管方块全部变量，能写判断和先后赋值。///新操作模式：界面和交互升级，有双列变量面板、Gizmo 手柄、文件夹和数值检查器。///电脑上按 Alt+N 切换到新模式，Alt+O 切回旧模式，也可以在设置里改。' },
    ] },
  { id: 'm4', icon: 'image', title: '材质与外观', desc: '纯色 / 预设 / 单贴图 / 六面独立（覆参考图）/ 本地上传 / 织布机',
    mode: 'new', steps: [
      { t: '材质 = 方块长什么样', target: '#viewMenuBtn', thenTarget: '#viewDropdown [data-view-action="material"]',
        b: `每个方块的外观由材质决定。///材质分三种：纯色，从调色板挑一个颜色填充；整体贴图，整块用同一张贴图；六面独立，前、后、左、右、顶、底各贴各的。///注意：原版 Minecraft 一个方块只能用同一张贴图，六面独立只在模拟器里当参考用。///选中方块，点顶部「视图」菜单里的「add材质」，材质菜单就弹出来了。` },
      { t: '先来最简单的——纯色', target: '#viewMenuBtn', thenTarget: '#viewDropdown [data-view-action="material"]',
        b: `材质菜单里点「纯色材质」，弹出 20 色调色板，点一个色块就应用。///模拟器会给颜色统一提高一点饱和度，看起来更鲜，这是 FMBE 方块一贯的观感。///把方块换成任意一个非默认色，试一下。`,
        act: ['openMaterial', 'applySolidColor'], check: () => [...selectedBlocksSet].some(b => b.materialType === 'color' && b.materialColor && b.materialColor !== '#aaccff') },
      { t: '组合方块预设（一键六面）', target: '#viewMenuBtn', thenTarget: '#viewDropdown [data-view-action="material"]',
        b: `「原版方块」里是现成的六面组合预设，菜单项上直接标着当前可用的数量。///选一个，顶面、侧面、底面自动匹配不同贴图，不用一面上贴图。///这是快速还原 MC 原版方块观感的最佳方式，也适合要导出到游戏的方块。///菜单里的预设按类别分组（色彩建材 / 自然 / 木质 / 矿物金属 / 红石 / 下界 / 功能 / 石质 / 其他等），也可以用搜索框直接找。` },
      { t: '六面独立贴图 = 参考展示，不是游戏行为', target: '#viewMenuBtn', thenTarget: '#viewDropdown [data-view-action="material"]',
        b: `需要说明：原版 Minecraft 的方块只有一个贴图，六个面不能各不相同。///所以六面独立贴图在模拟器里只用于看参考：把一张展开图、模型渲染图或带标注的贴图贴到六个面上，当作参照。///想导出到游戏后六面正确显示，用整体贴图或组合预设。` },
      { t: '六面独立怎么用', target: '#viewMenuBtn', thenTarget: '#viewDropdown [data-view-action="material"]',
        b: `材质菜单点「六面独立贴图」，出现顶、底、前、后、左、右六个面，点任意一面挑贴图。///快捷操作：「六面同图」一张贴图铺满六面；「四侧同图」只改四个侧面；「顶面→底面」把顶面复制到底面；「清空全部」退回纯色。///也可以直接把图片拖到某一行上，贴图立刻更新。///试着只换一个顶面。`,
        act: ['openFaceEditor'], check: () => selectedBlocksSet.size && [...selectedBlocksSet].some(b => b.faceTextures && b.faceTextures.some(u => u)) },
      { t: '用自己的图——本地上传', target: '#viewMenuBtn', thenTarget: '#viewDropdown [data-view-action="material"]',
        b: `贴图选择器底部有「本地上传」，选一张本地图片就贴上去。///也可以直接把图片拖进菜单或某一面，同样生效。///上传的图会转成内嵌数据，随命令一起导出，重新导入也不会丢。`,
        act: ['openTexturePickerUploadOnly'] },
      { t: '旗帜——一张贴图画出一整个图案', target: '#viewMenuBtn', thenTarget: '#viewDropdown [data-view-action="material"]',
        b: `选中旗帜方块时材质菜单会多一个「织布机」。///这是 MC 旗帜生成器：先选底色（16 色），再加最多 6 层图案，每层选纹样缩写 + 染料色。///常用纹样：no 无 / cs 中竖条 / gru 上渐变 / bl 左底角 / br 右底角 / rd 菱形 / mc 半圆 / vhr 左半竖 / hhb 下半横 / cre 苦力怕脸 / sku 骷髅头 / moj 标志 / glb 地球 / pig 猪鼻。///点「应用为贴图」把生成的旗帜贴到旗帜方块上——一面旗帜能顶一整片用 1×1 方块拼的图案，是复杂纹样的最佳解法。///旗帜本身在 MC 里是单贴图（20×40 那张织出来的图），所以导出到游戏也是正确的。` },
    ] },
  { id: 'm5', icon: 'film', title: '关键帧动画', desc: '窗口 · 录帧 · 播放 · 时间轴 · 多轨道',
    mode: 'new', steps: [
      { t: '关键帧 = 动画的时间锚点', target: '#kfModeGroup', demo: 'kfLerp',
        b: `关键帧动画：你在时间轴的几个时间点摆好方块姿态，中间的过程由模拟器算出来。///两个关键帧之间，方块的位置和旋转连续过渡，中间时刻的数值由前后两个关键帧插值得到。///每个方块单独记录自己的关键帧。///文件夹只负责分组，不生成自己的轨道，里面的方块各自记录。` },
      { t: '打开关键帧窗口', target: '#kfAnimModeBtn',
        b: `点右上角「动画模式」按钮，切到动画模式，关键帧窗口会自动打开。///关键帧窗口只在动画模式下出现。///旧操作模式方块列表里的「▶ 播放动画」只能播放已有动画，不能打开时间轴。///窗口打开后有轨道、播放按钮和「+关键帧」按钮。///窗口可以拖动，右下角和左下角两个斜纹手柄可以缩放。`,
        act: ['enterKeyframeMode'], check: () => isKeyframeMode === true && keyframeWindowOpen === true },
      { t: '先让方块加入动画', target: '#kfAddBlockBtn',
        b: `普通方块不能直接录关键帧，要先加入动画。///点关键帧窗口标题栏的「＋ 方块」按钮，弹出方块选择器，按文件夹分组列出所有方块。///点一个方块名就加入，点文件夹行的「+全部」整组加入。///加入后，方块列表里该方块名左侧出现紫色小三角，表示已加入动画。///molang 模式的方块也能加入，编译时你手写的表达式会保留。`,
        act: ['addSelectedToKeyframe'], check: () => keyframeData.size > 0 },
      { t: '在 0 秒处录第一个关键帧', target: '#kfAddKeyframeBtn',
        b: `把播放头拖到 0 秒，也就是轨道最左端，先摆好方块姿态。///点「+关键帧」，当前姿态记录在 0 秒。///轨道上出现第一个菱形。///「+关键帧」记录的是方块此刻的姿态，不是复制上一帧。`,
        act: ['recordKfAt0'], check: () => { for (const [,d] of keyframeData) if (d.frames.has(0)) return true; return false; } },
      { t: '录第二个关键帧', target: '#kfAddKeyframeBtn', canvas: true,
        b: `把播放头拖到 1 秒处。///用 Gizmo 把方块挪开一段距离，或直接改数值。///再点「+关键帧」，1 秒处也有关键帧了。///两个菱形之间会自动生成过渡。///拖动播放头时，数据面板的数值实时刷新。`,
        act: ['recordKfAt1'], check: () => { for (const [,d] of keyframeData) if (d.frames.size >= 2) return true; return false; } },
      { t: '▶ 播放', target: '#kfPlayBtn',
        b: `点轨道旁的 ▶，方块在两帧之间动起来。///点 ⏸ 停止，播放头停在当前时刻，方块定格在那一帧。///播放不影响相机，可以边放边换角度看。///播放时数据面板里的数值检查器同步刷新。`,
        act: ['kfPlayThenStop'], check: () => keyframeCurrentTime > 0 },
      { t: '时间轴怎么用', target: '#kfTimelineContainer',
        b: `拖播放头：在时间轴上点击或拖动。///双击时间轴：把播放头定位到那个时刻，只定位，不建关键帧。///拖菱形：把这个关键帧移到别的时刻，靠近别的关键帧时会自动吸附。///右键菱形：弹出删除菜单，点删除。///滚轮：左右滚动。///− / + 两个按钮：缩小、放大时间轴；‹ / › 两个按钮：向左、向右滚动。///触屏双指捏合缩放，单指拖动滚动。` },
      { t: '紫色滑条 = 动画总时长', target: '#kfDurationHandle',
        b: `时间轴右边缘的紫色竖条是总时长手柄。///按住左右拖动，动画总时长就变长变短。///默认 10 秒，最长 300 秒。///拖动时右侧显示当前可视范围，形如 0.0s - 10.0s。`,
        act: ['dragDurationHandle'], check: () => keyframeAnimDuration !== 10 },
      { t: '一个方块一条轨道', target: '#kfTimelineBg',
        b: `每个方块一条轨道，菱形标在各自的轨道上。///轨道的顺序就是方块加入动画的顺序。///多选几个方块后拖其中一个菱形，这些方块的菱形会一起平移到同一时刻。///轨道名就是方块名称，左侧图标区分方块类型：方块、旗帜、楼梯、平面各有不同图标。///文件夹不生成轨道，里面的方块仍然各占一条。` },
      { t: 'molang 模式的方块也能录关键帧', target: '#kfAddKeyframeBtn',
        b: `molang 模式的方块也能录关键帧，两种编辑方式可以同时用。///录帧后，关键帧的时间段会写进这段 molang 程序，你手写的表达式原样保留。///播放或拖播放头时，程序按当前动画时间重新计算，你写的表达式照常生效。///在时间轴上单独改某一帧的表达式时，改动只作用于这一段。`,
        act: ['addSelectedToKeyframe'], check: () => keyframeData.size > 0 },
    ] },
  { id: 'm6', icon: 'bone', title: '文件夹骨骼与手动绑定', desc: '分组 · 骨干 · 文件夹骨骼树 · 紫色 ✛ 手动绑定',
    mode: 'new', steps: [
      { t: '文件夹把方块组织起来', target: '#sideBlockNewFolder',
        b: `文件夹用来把方块归到一起，方便整体选中和批量操作。///点方块列表顶部的「新建文件夹」图标，输入名称后回车创建。///名称留空会自动叫 bone、bone1、bone2。///新建的文件夹默认展开。`,
        act: ['createFolder'], check: () => folders.length > 0 },
      { t: '把方块拖进文件夹', target: '#sideBlockList',
        b: `按住方块行拖动，拖到文件夹标题上松手，方块进入该文件夹。///把文件夹拖到另一个文件夹上，嵌套成子文件夹。///拖到空白处，移出分组，回到最外层。///文件夹可以多层嵌套。///多选几个方块再拖其中一个，会把整个选区一起移进去。`,
        act: ['dragBlockIntoFolder'], check: () => blocks.some(b => b.group) },
      { t: '文件夹会自动得到骨干', target: '#sideBlockList',
        b: `方块拖进文件夹后，模拟器会自动给这个文件夹指定骨干。///第一个拖进去的方块就是骨干，它是这一组的旋转中心。///之后拖进同一个文件夹的方块会自动绑到骨干上，转骨干时整组跟着转。///骨干方块在方块列表里的名字显示为斜体。`,
        act: ['designateBackbone'], check: () => { const f = folders.find(x => x._backbone); return !!f; } },
      { t: '紫色 ✛ 是另一种绑定', target: '#sideBlockList', kf: 'out',
        b: `紫色 ✛ 是手动绑定，和文件夹骨骼不是一回事。///文件夹骨骼靠骨干把整组串起来；紫色 ✛ 是把一个方块直接绑到另一个方块上，两者不必在同一个文件夹。///✛ 只在非动画模式下出现，先点右上角「动画模式」退出动画模式。///新操作模式下 ✛ 在方块列表顶部工具栏，先点一个方块选中它，再点 ✛；旧操作模式下 ✛ 在方块行右侧。///点 ✛ 弹出父块选择，点一个方块当父级，绑定就建立。///绑定后子块位置改由 molang 按父块实时计算，父块一动子块就跟。`,
        act: ['openParentSelector'], check: () => blocks.some(b => b._boneParent) },
      { t: '绑定的两种方式', target: '#sideBlockList',
        b: `建立绑定时可以选两种方式。///枢轴绑定：子块位置 = 父块枢轴 + 按父块旋转换算后的偏移，子块绕父块枢轴转，父块转它就跟着转。///basepos 绑定：绑定那一刻把子块枢轴对齐到父块枢轴，并自动改 basepos 让模型留在原地，之后父块移动它会跟着走，但父块转动不会带着它转。///两种方式都可以解绑后重绑。` },
      { t: '多选一起绑', target: '#sideBlockList',
        b: `多选几个子块，点一次紫色 ✛，一次全绑到同一个父块。///绑定后各子块保留自己相对父块的偏移，不会挤到一起。///子块后面再解绑，也不影响其他子块。`,
        act: ['multiBindBone'], check: () => { const map = {}; blocks.forEach(b => { if (b._boneParent) map[b._boneParent] = (map[b._boneParent]||0)+1; }); return Object.values(map).some(n => n >= 2); } },
      { t: '解绑', target: '#sideBlockList',
        act: ['unbindOneDemo'],
        b: `子块行右侧有「解绑」按钮，点它脱离父块。///解绑时子块停在当前位置，不会回到原点。///解绑会删掉跟随用的 molang 表达式。///把方块从文件夹里拖到空白处，文件夹产生的绑定也会一起解除；只有用紫色 ✛ 手动建立的绑定会保留。` },
      { t: '嵌套文件夹 = 自动骨骼树', target: '#sideBlockList',
        b: `嵌套的文件夹会自动组成骨骼树。///每个子文件夹的骨干，会自动绑到父文件夹的骨干上。///父骨骼转动，子骨骼跟着转，孙骨骼再跟着，逐层传递。///不需要一个个手动绑，进入关键帧模式时会自动建立。///导出时层级会写进指令，重新导入后仍然完整。` },
      { t: '子块位置每帧重算', target: '#sideBlockList',
        b: `枢轴绑定时，子块位置写成父块枢轴加上父块旋转换算出的偏移。///父块每一帧的旋转都会重新代入，所以父块转多少，子块都严格绕父块枢轴走。///导出时这些计算式会写进指令，进游戏后子块同样实时跟随。` },
    ] },
  { id: 'm7', icon: 'folder', title: '导入与导出', desc: '命令 · 压缩 · 结构 · 覆盖 · URL · 只认 playanimation',
    mode: 'new', steps: [
      { t: '把模型变成命令', target: '#fileMenuBtn',
        b: `点顶部「文件」菜单里的「输出命令」，打开导出面板。///点「生成命令列表」，出现一个滚动列表，每个方块一条 playanimation 指令。///每条可以单独复制，也可以点底部「全部复制」一次拷走。`,
        act: ['showExportModal'], check: () => !!document.getElementById('confirmExportBtn') },
      { t: '前缀 / 后缀', target: '#fileMenuBtn',
        b: `每条指令由三段组成：前缀 + molang 内容 + 后缀。///前缀默认是 execute positioned ~-1~~ run playanimation @e[...] animation.player.attack.positions _ 0 "。///后缀放你的额外标记，导出时会自动带上 方块编号：xxx，重新导入时靠它识别方块身份。///前缀和后缀保存在本机，下次打开面板还是上次填的内容。` },
      { t: '导出成 .txt', target: '#fileMenuBtn',
        b: `导出面板底部有「输出文件」按钮，直接生成一份 .txt 文件，方便保存和分享。///命令列表弹窗里也有「输出文件」，可以从列表生成。`,
        act: ['exportToFile'] },
      { t: '压缩导出——多条命令合并成一条', target: '#fileMenuBtn',
        act: ['openCompressExport'],
        b: `先点「文件」→「输出命令」打开导出面板，面板底部第二个按钮是「压缩导出」。///它把多条指令合成一条，适合方块很多的情况。///打开后是一个网格，每个方块占一个格子，可以拖动调整位置。///导出时按格子坐标分别写入，一条 playanimation 就能建出全部方块。///布局可以导出成方案文件，下次导入方案就能复用。///网格可以按分组或按材质配色查看，方便区分。` },
      { t: '结构导出（.mcstructure）', target: '#fileMenuBtn',
        b: `同一个导出面板里还有「结构导出」，生成 .mcstructure 文件。///文件里每个方块对应一个命令方块和一只狐狸，导入游戏后自动生成带指令的结构。///命令方块沿 Z 轴依次排开，狐狸放在对应命令方块的 x-1 处，和默认前缀里的 positioned ~-1~~ 对应。///这个按钮默认隐藏。进开发者模式后，在设置的「开发者工具」分组里勾选「显示 MC 结构导入 / 导出」才会出现。` },
      { t: '粘贴命令 → 变模型', target: '#fileMenuBtn',
        b: `点「文件」菜单里的「导入命令」，把 playanimation 指令粘进去。///也可以点「选择文件」，选 .txt、.mcfunction 或 .mcstructure 文件。///模拟器会解析指令里的 molang 内容、材质、分组、骨骼等标记，还原成方块。///带条件判断或查询函数的复杂指令会直接进入 molang 模式，逻辑不丢。`,
        act: ['showImportModal'], check: () => !!document.getElementById('importConfirmBtn') },
      { t: '只识别 playanimation', target: '#fileMenuBtn',
        b: `导入时只认 playanimation 指令。///其他指令一律跳过，比如 testfor、setblock、fill、summon、tag、effect、structure。///只有出现 playanimation 的行才会开始一条新指令，引号跨行时会先拼接完整。///没有「方块编号：」标记的指令，按出现顺序命名成 autoName、autoName1、autoName2……///只有 molang 内容没有编号的，会把引号之间的内容作为该方块的 molang 程序。` },
      { t: '两种特殊的导入', target: '#fileMenuBtn',
        b: `「文件」菜单里还有两个导入选项。///覆盖型导入：先清空当前项目内容，再导入新模型，项目名字和身份不变。///临时覆盖型导入：同样先清空，但项目变成临时项目，退出后删除，不进项目列表。///清空前的状态可以用 Ctrl+Z 撤销回来。` },
      { t: '从外部网站一键跳进来', target: '#fileMenuBtn',
        b: `模拟器支持带参数的链接：#cmds= 后面接编码后的指令。///网页上做一个指向这种链接的按钮，点开就会打开模拟器并导入这批指令。///导入后项目叫「外部导入」，是临时项目，不影响你正在编辑的项目。///点「保存项目」才会转成正式项目。` },
      { t: '导出再导入，骨骼动画不丢', target: '#fileMenuBtn',
        b: `方块：指令里带编号标记，重新导入后名称和材质还原。///骨骼：子块指令里带父块层级和跟随表达式，重新导入后骨骼树精确重建。///关键帧：导出时写成关键帧标记和对应程序，重新导入后回到时间轴。///结构导出走同一条导出流程，往返效果一致。` },
      { t: '导入时的一些自动处理', target: '#fileMenuBtn',
        b: `重名方块会自动加后缀，Cube 变成 Cubea、Cubeb。///重名文件夹也会自动改名，避免两次导入混进同一个文件夹。///场景里如果只剩系统默认的占位方块，会先移除它。///导入完成会提示导入了多少方块、识别到多少个关键帧动画、多少条指令没解析成功。` },
    ] },
  { id: 'm8', icon: 'image', title: '画笔模式与点集', desc: '描点 · 生成方块 · 绿点 · 导入点集',
    mode: 'new', steps: [
      { t: '画笔模式——用「点」来画', target: '#brushModeBtn',
        b: `画笔模式先在网格上打点，再由点生成方块。///进入方式：点顶栏的「画笔模式」按钮，或设置 → 编辑 → 画笔模式。///进入后视角变成接近俯视，方便打点，仍可以左右旋转方位角，不能上下俯仰。///顶栏会出现画笔工具栏：描点、生成方块、色板、删除、形状、导入点集。`,
        act: ['enterBrushMode'], check: () => isBrushMode === true },
      { t: '描点——在网格上点击放点', target: '#brushLengthToolbar',
        b: `顶栏选「描点」子模式。///先在色板里挑颜色，然后在网格上点一下，那个格子落一个彩点。///按住拖动是转视角，不算放点。///再点已有的点会切换它的选中状态。///点标签文字也能选中，小圆点不好点时点标签。`,
        act: ['ptAddPointDemo'], check: () => ptMarkers.length >= 1 },
      { t: '两点生成矩形', target: '#ptModeBuildBtn',
        b: `切到「生成方块」子模式。///点两个点，自动生成一个矩形。///两个点连成矩形的一条边，另一边长度由工具栏的「矩形宽」决定。///生成的矩形就是普通方块，可以继续用 Gizmo 编辑。///生成后选中状态自动清空，直接选下一组点。`,
        act: ['ptDemoRect'], check: () => blocks.length > 0 },
      { t: '三点造形状', target: '#ptShapeToggle', thenTarget: '#brushLengthToolbar',
        b: `形状切换按钮在「生成方块」模式下出现，点一下按 矩形 → 平行四边形 → 三角形 循环。///平行四边形：点 3 个点，第 2 个点作为顶角，两条边分别连向前后两点。///三角形：点 3 个点，内部用 3 个平行四边形拼成，贴在网格平面上没有缝。` },
      { t: '绿点——让形状顶角落在方块角上', target: '#ptModeBuildBtn',
        b: `在「生成方块」模式下选中一个已有方块，它的 8 个角会亮起绿点。///点绿点只是把这个角加入选区，不会自动打点。///再选另一个点生成矩形时，会先出现红色和绿色两个预览，红色表示把两点当右边，绿色表示当左边。///无论选哪个，生成的矩形都保证有一个顶角落在绿点上。///绿点在屏幕上的大小固定，拉远拉近都能看清。` },
      { t: '批量粘贴点', target: '#ptImportTopBtn',
        b: `侧边「点集」列表底部有导入框，每行写一个点。///格式是颜色名后面跟括号里的两个数字：red(0.48,0.77)，数字是网格上的横纵坐标。///点「导入点集」一次全部添加。///导入成功后输入框会清空，避免重复导入同一批。///点集只用来辅助生成方块，不参与导出。` },
    ] },
  { id: 'm9', icon: 'folder', title: '项目管理', desc: '项目列表 · 自动保存 · 临时项目 · 备份',
    mode: 'new', steps: [
      { t: '项目 = 一个作品', target: '#uiSettingsPanel',
        act: ['openSettings'], check: () => tutSettingsOpen(),
        b: `一个项目就是一件作品，方块、文件夹、变量都保存在项目里。///你现在做的是「新手教程·练习」项目。///点顶部「操作」→「设置」，左侧分类选「项目」，能看到当前项目名和保存状态。` },
      { t: '项目列表长什么样', target: '#uiSettingsPanel',
        b: `退出项目后回到项目列表。///每张卡片显示缩略图、名称和更新时间。///点卡片打开项目，卡片右上角可以重命名、删除。///列表末尾的「+ 新建项目」用来开始新作品。///新建项目会清空当前编辑内容，操作前先确认不需要保留。` },
      { t: '编辑时自动保存', target: '#projectSaveNowBtn',
        b: `编辑后模拟器会自动保存到浏览器本地，不需要手动点保存。///设置面板 → 项目 里显示上次保存时间。///关闭页面、切换项目、退出项目前都会先保存一次。` },
      { t: '三个项目操作', target: '#projectClearBtn',
        b: `「保存」：立刻保存一次，临时项目点它会转成正式项目。///「重命名」：改当前项目名，输入后回车。///「清空项目」：删掉所有方块、文件夹和变量，保留项目名，会弹确认框，清空后可以 Ctrl+Z 恢复。` },
      { t: '退出项目回到列表', target: '#projectBackBtn',
        b: `点设置面板 → 项目 →「退出项目」，或按 Esc。///Esc 会依次处理：先关关键帧窗口，再保存并退出项目，最后退出全屏。///退出前会自动保存，临时项目除外。///退出会离开当前这个教程项目，可以先在教程里看完，之后再自己试。` },
      { t: '临时项目 & 备份', target: '#projectSaveNowBtn',
        b: `通过链接导入、临时覆盖型导入进来的项目是临时项目，不会自动保存，退出后删除。///想保留就点「保存项目」。///清理浏览器数据会删掉本地项目，重要作品请定期用「输出文件」另存一份 .txt。///换浏览器看不到原浏览器里的项目。` },
    ] },
  { id: 'm10', icon: 'chart', title: '批量与效率工具', desc: '多选 · 批量加减 · 表达式查找替换 · 常量化 · 欧拉角 · 枢轴归位',
    mode: 'new', steps: [
      { t: '多选方块', target: '#sideBlockList',
        b: `多选有三种方式：Ctrl 点选累加；手机上长按进入多选；Ctrl 按住左键拖出蓝框，框到的方块全部选中。///框选只看画面，蓝框碰到方块的可见部分就算选中。///多选后，点方块列表头部的四个小方块按钮，切到数据面板，下面几步都在数据面板里操作。`,
        act: ['selectTwoBlocks'], check: () => selectedBlocksSet.size >= 2 },
      { t: '一次改多个', target: '#dataPanel', thenTarget: '#sideBlockList',
        b: `如果还停在方块列表，先点列表头部的四个小方块按钮切到数据面板。///多选方块后，变量面板变成「批量修改 (N)」，N 是选中数量。///变量按位移、缩放、旋转、自定义变量分成几组，点组名展开。///点某一行变量，例如 v.xpos，行上方弹出增量泡泡。///泡泡里的数值是本次要加的增量，不是绝对值，初始为 0。///用 ▲ / ▼、滚轮或在数值区上下拖动，所有选中方块的这个变量同时加上同样的量。`,
        act: ['openBatchPanelAndClickVar'], check: () => selectedBlocksSet.size >= 2 && document.querySelector('.batch-mv-delta') },
      { t: '哪些变量能批量改', target: '#dataPanel', thenTarget: '#sideBlockList',
        act: ['selectTwoBlocks'], check: () => selectedBlocksSet.size >= 2,
        b: `批量面板只列出所有选中方块都是常量表达式的变量。///如果某个方块的这个变量是跟随表达式，这一行会被排除，避免一次批量修改把跟随关系改断。///所有选中方块都有的自定义变量也会列出来。///数值一致时显示那个值，不一致显示 ≠。///molang 方块单独统计。` },
      { t: '批量面板标题栏', target: '#dataPanel', thenTarget: '#sideBlockList',
        act: ['openBatchPanelAndClickVar'], check: () => !!document.querySelector('.batch-mv-row[data-batch-var]'),
        b: `标题栏是「批量修改 (N)」，右边三个按钮都是图标，悬停显示说明。///「⇦」：把选中的 molang 方块转回普通方块，只对纯变量赋值的生效。///「⇄」：打开表达式查找替换。///「重置全部」：把每个变量行的增量清成 0 并重新施加。` },
      { t: '批量改表达式', target: '#dataPanel', thenTarget: '#sideBlockList',
        b: `多选后点批量面板标题栏的「⇄」，打开表达式查找替换面板。///也可以在单个 molang 方块的编辑器上方点「⇄ 批量」打开，这时默认范围是全部 molang 方块。///只有已经进入 molang 编辑模式的方块才会出现在候选里。`,
        act: ['openMolangBatchReplace'], check: () => !!document.getElementById('molangBatchModal') },
      { t: '通配符 / 正则 / 纯文本', target: '#dataPanel', thenTarget: '#sideBlockList',
        b: `匹配方式三选一。///通配符：每个 * 依次捕获一段文本，替换里用第 n 个 * 或 $1 引用第 n 段。///正则：按 JavaScript 正则匹配，替换里用 $1、$2 引用捕获。///纯文本：按字面匹配，* 就是普通星号。///替换里的 * 紧跟数字或左括号时会被当成乘法，例如 *0.05，要当引用就写 \\*。///面板下方有替换解析，实时显示识别结果。` },
      { t: '预览与批量应用', target: '#dataPanel', thenTarget: '#sideBlockList',
        b: `预览区逐条列出每个目标方块的改前和改后，命中的位置高亮，黄色是旧内容，绿色是新内容。///每行有状态标记：命中、跳过、语法存疑、转 molang。///点「应用到 N 个方块」一次改完，3D 画面和编辑器立刻刷新。///改完可以 Ctrl+Z 整批撤回。///查找和替换文本保存在本机，下次打开还是上次填的内容。` },
      { t: '常量化——把表达式换成数字', target: '#outlinerToolsBtn',
        act: ['openToolsMenuDemo'], check: () => !!((document.getElementById('outlinerToolsMenu') && document.getElementById('outlinerToolsMenu').classList.contains('open')) || tutActive === true),
        b: `选中方块 → 扳手工具菜单 →「表达式常量化」。///它会删掉中间变量和表达式，只保留 13 个核心变换变量，取当前数值。///结果是干净、稳定、Gizmo 直接可控的方块，也便于导出。///带关键帧的 molang 方块会自动跳过。///骨骼绑定也是一组表达式，常量化会解除绑定。` },
      { t: 'rotate → rot 一键换算', target: '#outlinerToolsBtn',
        act: ['openToolsMenuDemo'], check: () => !!((document.getElementById('outlinerToolsMenu') && document.getElementById('outlinerToolsMenu').classList.contains('open')) || tutActive === true),
        b: `选中方块 → 工具菜单 →「欧拉角转换」。///它把全局旋转 v.rotatex / rotatey / rotatez 折算成局部旋转 v.xrot / yrot / zrot，并把 rotate 清零。///导入别人的指令后统一旋转口径时用得上。///跟随父块的子块会被跳过，避免把跟随关系改写。///多选里同时有父块和子块时，子块自动跳过。///转换父块时，子链会一起转换，位置不偏移。` },
      { t: '枢轴归位与圆圈按钮', target: '#dataTableInspector', thenTarget: '#sideBlockList',
        b: `工具菜单里有两个归位枢轴的入口。///方式1「枢轴 → 骨骼枢轴」：统计这一层所有方块的枢轴，取出现最多的那个作为整个骨骼的枢轴。///方式2「方块枢轴 → 骨骼原点」：把选中方块的枢轴归到骨骼位置，同时换算 basepos，方块外观不动。///更快的入口：切到数据面板后，数值检查器「枢轴点」一行三个数值框右边有一个圆圈按钮。///点它把选中方块的枢轴设为 0,0,0，同时换算 basepos 保持外观位置。///已绑定的子块会被跳过，并提示跳过数量。///这些操作都能 Ctrl+Z 撤销。` },
    ] },
  { id: 'm11', icon: 'gear', title: '设置面板完全指南', desc: '界面 · 编辑 · 视图 · 帮助 · 项目',
    mode: 'new', steps: [
      { t: '布局设置', target: '#uiSettingsPanel', thenTarget: '#uiSettingsPanel',
        b: `点顶栏「操作」菜单里的「设置」，也可以按 Alt+S 或点顶栏齿轮。///左侧分类选「界面」，里面有浅色模式、浅色灰度、数据面板侧边显示、UI 缩放。///UI 缩放范围 50% 到 200%，可以拖动滑块或点吸附点。///改完 10 秒内可以一键撤销。///UI 缩放对画布、面板、设置窗口和教程卡片都生效。`,
        act: ['openSettings'], check: () => !!document.getElementById('uiSettingsPanel') && document.getElementById('uiSettingsPanel').style.display !== 'none' },
      { t: '显示细节设置', target: '#localAxesSetting',
        act: ['openSettings'], check: () => tutSettingsOpen(),
        b: `分类选「视图」，里面是显示细节。///渲染局部坐标系：关掉后所有方块的坐标轴都不显示。///关闭 basepos 局部位移轴显示：一个总开关，打开后下面出现 X / Y / Z 三个独立开关。///这些是视图偏好，保存在本机，不写进项目。` },
      { t: '新操作模式专属设置', target: '#worldAxisDispSetting',
        act: ['openSettings'], check: () => tutSettingsOpen(),
        b: `分类选「编辑」，里面是新操作模式的选项。///世界轴位移：关，位移箭头跟着方块自身旋转走；开，箭头始终对齐世界的 X / Y / Z。///枢轴联动模型：开，拖枢轴时模型跟着平移；关，模型不动，只移动旋转中心。///同一组里还有画笔模式的开关。///这几项只在新操作模式下显示。` },
      { t: 'Gizmo 拖拽步长', target: '#uiSettingsPanel',
        act: ['openSettings'], check: () => tutSettingsOpen(),
        b: `「编辑」分类里的控件精度设置，四档步长：无按键、Shift、Ctrl、Shift+Ctrl，默认 1、0.5、0.1、0.001。///拖 Gizmo 时，位移和旋转按当前档取整。///填 0 表示这一档不取整。///手机端数据面板底部的虚拟 Shift / Ctrl 键也能切换档位。` },
      { t: '摄像机坐标 & FOV', target: '#uiSettingsPanel',
        act: ['openSettings'], check: () => tutSettingsOpen(),
        b: `分类选「视图」，里面有摄像机设置。///直接输入 X / Y / Z 设定相机位置，点「应用坐标」生效，点「读取当前」把当前坐标读回输入框。///拖动滑块调视场角，范围 20 到 120 度，默认 45 度。///视场角越大画面越广，越小越接近长焦。` },
      { t: '完整快捷键列表', target: '#uiSettingsPanel',
        act: ['demoShortcutSettings'], check: () => tutSettingsOpen(),
        b: `分类选「帮助」，里面是快捷键卡片，可以折叠。///按通用、操作模式切换、Gizmo 模式、触摸、手机操作分类列出。///说明文字会自动换行，手机上也能看全。` },
      { t: '项目设置分组', target: '#uiSettingsPanel',
        act: ['demoShortcutSettings'], check: () => tutSettingsOpen(),
        b: `分类选「项目」。///当前项目名可以直接改，输入后回车。///「保存」立刻保存一次，临时项目点它会转成正式项目。///「退出项目」保存并回到项目列表。///项目保存状态显示上次保存时间，临时项目显示未保存。///「清空项目」是红按钮，删内容但保留项目名，会弹确认框。` },
    ] },
  { id: 'm12', icon: 'folder', title: '顶栏三大菜单与新建模型面板', desc: '文件 / 视图 / 操作 · 方块 · 平面 · 半砖 · 楼梯 · 旗帜 · 预设',
    mode: 'new', steps: [
      { t: '文件菜单 = 导入导出', target: '#fileMenuBtn',
        act: ['openFileMenu'], check: () => !!(document.getElementById('fileDropdown') && document.getElementById('fileDropdown').classList.contains('open')),
        b: `新操作模式顶栏第一个菜单是「文件」。///导入命令：粘贴或选择文件导入。///覆盖型导入：清空当前项目再导入，项目身份不变。///临时覆盖型导入：同样先清空，但项目变成临时项目，退出即删。///输出命令：打开导出面板。///旧操作模式下这些按钮在数据面板的工具栏里。` },
      { t: '视图菜单', target: '#viewMenuBtn',
        act: ['openViewMenu'], check: () => !!(document.getElementById('viewDropdown') && document.getElementById('viewDropdown').classList.contains('open')),
        b: `第二个菜单是「视图」。///显示轴线：切换世界原点的 X / Y / Z 参考轴。///显示平面：切换地面网格。///显示刻度：切换轴上的刻度数字。///add材质：打开材质菜单。///重置视角：相机回到默认位置。///隐藏：切换方块名标签的显示。///这几项的状态都会保留，刷新页面后仍是上次的设置。` },
      { t: '操作菜单', target: '#actionMenuBtn',
        act: ['openSettings'], check: () => tutSettingsOpen(),
        b: `第三个菜单是「操作」。///设置：打开设置面板。///全屏：切换全屏。///撤销：Ctrl+Z。///重做：Ctrl+Y。///网站日志：查看更新记录，也是进入开发者模式的入口。///撤销和重做可以连续点，菜单不会自动收起。` },
      { t: '5 种方块类型', target: '#addBlockBtn', thenTarget: '#sideBlockList',
        b: `按 N 键，或点「新建模型」，弹出方块类型选择。///方块：标准立方体，可以拉伸旋转，所有贴图都能用。///平面：弹出一个对话框，填长、宽、夹角，生成精确尺寸的面片。///半砖：高度只有一半的方块。///楼梯：底座加台阶。///旗帜：薄面和旗杆，可以用织布机生成图案，也可以上传图片。///面板底部还有「新建组」和「预设」两个入口。`,
        act: ['openCreateBlockMenu'], check: () => !!document.getElementById('createBlockMenuModal') },
      { t: '平面对话框与预设模板', target: '#addBlockBtn',
        act: ['openCreateBlockMenu'], check: () => !!document.getElementById('createBlockMenuModal'), thenTarget: '#createBlockMenuModal #presetBtn',
        b: `平面对话框里填长、宽、夹角，夹角 90 度是矩形，其他角度是平行四边形。///点「预设」打开模板列表，里面有方块侧面、平行四边形、旗帜杆、横向拉伸这几种模板。///模板里的平行四边形用 v.side_a、v.side_b、v.angle 三个变量，改参数就重新算形状。///双击模板就导入到场景。` },
    ] },
  { id: 'm13', icon: 'gear', title: '触摸操作与快捷键', desc: '触摸手势 · 虚拟修饰键 · 完整快捷键',
    mode: 'new', steps: [
      { t: '手机 / 平板怎么用', canvas: true,
        b: `画布：单指轻触选中方块，画笔模式下是放方块；单指拖动旋转视角；双指捏合缩放；双指拖动平移。///Gizmo：拖动手柄做位移、旋转、缩放、枢轴。///方块列表：轻触选中，长按多选；长按 ▲ / ▼ 连续增减；数值区上下拖动连续增减；双击是在绑定父级方块的选项里确认绑定。///画笔模式：单指用于描点，双指仍然可以缩放和平移。` },
      { t: '虚拟 Shift / Ctrl', target: '#dataPanel', thenTarget: '#sideBlockList',
        act: ['tapVirtModDemo'], check: () => tutActive === true,
        b: `手机端在新布局下，数据面板底部会出现 ⇧ Shift 和 Ctrl 两个虚拟键。///点一下点亮，再点关掉，两个同时点亮就是 Shift+Ctrl。///它们和键盘上的 Shift、Ctrl 一样，用来切换 Gizmo 的精度档。///电脑端不显示这一条，直接用键盘上的 Shift 或 Ctrl，作用相同。///切回方块列表或取消选中方块时自动熄灭。` },
      { t: '快捷键速查', target: '#uiSettingsPanel',
        act: ['demoShortcutSettings'], check: () => tutSettingsOpen(),
        b: `通用：N 新建模型；Alt+S 开关设置；Ctrl+Z 撤销；Ctrl+Y 重做；Ctrl+D 复制；Ctrl+C 复制；Ctrl+V 粘贴；Del 删除；F11 全屏；Esc 依次关闭关键帧窗口、保存并退出项目、退出全屏；Ctrl+Shift+0 把 UI 缩放恢复成 100%。///操作模式切换：Alt+N 切到新操作模式，Alt+O 或 Ctrl+O 切回旧操作模式。///Gizmo 模式：P 枢轴，V 位移，S 缩放，R 局部旋转，Shift+R 全局旋转。///完整列表在设置 → 帮助 → 快捷键。` },
    ] },
  { id: 'm14', icon: 'film', title: '教程系统与巡游', desc: '卡片 · 目录 · 菜单 · 自动 · 巡游',
    mode: 'new', steps: [
      { t: '教程卡片怎么用', target: '.ex-tut-card',
        b: `每张卡片一次讲一句。点卡片或点页面空白处，弹出下一句。///句子全部念完后，卡片底部才出现「下一步」；这一步有可代做的操作时，旁边还会出现「帮我做」。///「← 上一步」回到前一步，「目录」打开章节目录。///右上角是「自动」和「菜单」两个按钮，最右侧 ✕ 退出教程。///退出时进度自动保存，下次从设置 → 帮助 → 新手教程继续。` },
      { t: '目录——跳章节', target: '.ex-tut-card .ex-tut-btn',
        b: `点卡片底部的「目录」，打开章节目录。///目录一次显示一章：左上是第几章、章名、简介和本章已完成的目数。///下面是这一章的目题，一行一目，点一行就从该目第一步开始。///鼠标移到某个目上，右侧的图会换成该目的画面预览。///页面左右两侧的 ‹ › 换章，顶栏 ✕ 关闭目录。///左下角是「返回」和「巡游」。` },
      { t: '菜单 = 记录面板', target: '.ex-tut-card .ex-tut-tool.alt',
        b: `卡片右上角「菜单」按钮会弹出两个小按钮：☰ 和 »。///☰ 打开记录面板，按句子列出本步的所有讲解，已经念到的实心，还没念到的淡化。///» 跳过本目剩余讲解，直接到下一个目。///记录面板点右上角 ✕ 或按 Esc 关闭。` },
      { t: '自动——不必一直点', target: '.ex-tut-card .ex-tut-tool.auto',
        b: `点亮卡片右上角「自动」，每句打完后自动接下一句。///不点亮就自己点空白处推进。///开关状态跨步骤保留，随时可以再点一次关掉。///开启时按钮底色变黄，边框上有两道光点顺时针滚动。` },
      { t: '巡游——把开场模型装进新项目', target: '.ex-tut-card .ex-tut-btn',
        b: `首次打开模拟器会播放一段开场动画。///「巡游」把开场动画里的模型装进一个新项目，方便拆开看。///入口在章节目录左下角，和「返回」并排。///勾选想加载的模型，点「新建项目并加载」，就会新建项目并把模型并排摆好。///加载进来的是真实的 FMBE 方块，可以编辑，也可以导出成指令。` },
    ] },
];

// 教程 UI 状态
let tutActive = false, tutChapter = 0, tutStep = 0, tutUIReady = false;
let tutSettingsStepActive = false; // 上一步目标是否在设置面板内（用于离开该类步骤时自动收起面板）
// ---- localStorage 状态 ----
function tutLoad() { try { return JSON.parse(localStorage.getItem(EX_TUT_KEY) || '{}'); } catch (e) { return {}; } }
function tutSave(patch) { const s = Object.assign(tutLoad(), patch); try { localStorage.setItem(EX_TUT_KEY, JSON.stringify(s)); } catch (e) {} }
// ---- CSS（首次使用时注入） ----
function tutInjectCSS() {
    if (document.getElementById('exTutStyle')) return;
    const st = document.createElement('style'); st.id = 'exTutStyle'; st.textContent = `
/* --tut-ui：教程卡片跟随「设置→UI缩放」的原始倍率（= uiScale/100，范围 0.5~2.0）。
   用 CSS 变量做乘算（而非 zoom），可保持卡片布局尺寸可被 offsetHeight 正确测量 → 贴顶/贴底定位不漂移。
   各部分最终放大 = --tut-ui × 自身影响倍率（见各选择器 calc）：
     文本 / 卡片 / 状态条 ×100% ｜ 按键(按钮·工具·关闭✕·圆点) ×60% ｜ 左上角章节 chip ×70% ｜ 左下角提示 ×50%
   ★ 基准值已按 1/倍率 预放大（按键 ×10/6、章节 ×10/7、提示 ×2），
     保证 UI 缩放 100% 时各部分尺寸与引入倍率之前完全一致（如按钮 20×0.6=12px、chip 14.29×0.7≈10px）。 */
#exTutRoot{position:fixed;inset:0;z-index:2147483000;pointer-events:none;--tut-ui:1;}
#exTutRoot *{box-sizing:border-box;}
/* 教程专用圆体：寒蝉全圆体（子集）——【外链文件，不是 base64 内嵌】
   @font-face 在 <style id="exTutRoundFont">（~3639/3650），src 指向同目录
   Fonts/ChillRoundF-sub.woff2（258KB，1545 码位），该文件必须与 HTML 一起分发；
   缺了不会报错，只会静默退化成系统字体。APP 打包（build.js 只收 vendor + Textures）未含
   Fonts/，故安卓端无圆体。留意：HTML 里内嵌 base64 的只有 5 个方块类型图标（image/png）。
   笔画横竖收笔带 R 角，柔和圆润、不带锋利折角，降低教程的「正式压迫感」。 */
#exTutRoot,#exTutRoot *,#exTutLog,#exTutLog *,#exTutOverlay,#exTutOverlay *{font-family:'EXRoundTut','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}
/* 需要真正显粗的短标签：「自动 / 菜单」按钮 + 记录面板标题「记录」。
   走 EXRoundTutB（无字重区间）才能触发浏览器合成加粗。 */
#exTutRoot .ex-tut-tool > span{font-family:'EXRoundTutB','EXRoundTut','Segoe UI','Microsoft YaHei',sans-serif;}
#exTutLog .ex-tut-log-head .ttl{font-family:'EXRoundTutB','EXRoundTut','Segoe UI','Microsoft YaHei',sans-serif;font-style:normal;font-weight:900;}
.ex-tut-shade{position:absolute;inset:0;pointer-events:none;background:transparent;}
.ex-tut-shade.dim{background:transparent;}
.ex-tut-spot{position:absolute;pointer-events:none;border-radius:10px;
  box-shadow:0 0 0 2px rgba(139,92,246,.95), 0 0 16px 3px rgba(139,92,246,.55);
  outline:1.5px dashed rgba(139,92,246,.75);outline-offset:6px;
  transition:all .28s cubic-bezier(.2,.7,.3,1);opacity:0;}
.ex-tut-spot.show{opacity:1;animation:exTutPulse 1.6s ease-in-out infinite;}
@keyframes exTutPulse{0%,100%{box-shadow:0 0 0 2px rgba(139,92,246,.95),0 0 12px 2px rgba(139,92,246,.45);}50%{box-shadow:0 0 0 3px rgba(167,139,250,1),0 0 26px 6px rgba(139,92,246,.75);}}
/* ★卡片底板「紫色背景框」已整体删除（用户明确要求，2026-10-12）：
   旧实现给 .ex-tut-card 一层 rgba(18,16,38,1) 的不透明底 + 一层 0 0 0 7px 同色 box-shadow 环，
   两者叠起来就是「深紫圆角矩形 + 同色粗描边」，与用户的「不要框框」直接冲突；
   那圈同色环本是用来遮卡片圆角处漏出的亮变量面板（亮角）的，既然底板本身都不要了，环更无意义。
   现改为：卡片**完全透明、无边框、无投影、无圆角底板**，只剩文字/控件直接浮在画面上
   （深色 text=#e6e8f5、浅色 text=#1e293b，两种底色都可读）。
   独立的 .ex-tut-card-bg 图层早已 display:none !important（见下方），这里不再复述。
   注意：入/出场动画仍只动 opacity（见 @keyframes exTutPop 与下方 .top/.bot 注释），
   卡片上下位置继续由 transform 表达 —— 这条铁律不能因为改透明就破坏。 */
/* ★卡片底板（2026-10-16 用户：「教程弹窗透明也不太好」）：
   早期（2026-10-12）曾按用户要求「删掉紫色背景框」做成全透明；现用户反馈全透明导致
   文字压在 3D 场景上不好读，故**恢复一层半透明深色底板**：足够压住背景、又留一点通透感。
   深色 rgba(16,13,34,.86) + backdrop-filter 模糊；浅色模式用近白底。
   ⚠ 铁律不变：入场动画只允许动 opacity（见 exTutPop），位置仍由 transform 表达。 */
/* ★★教程卡片位置根治（2026-10-17 用户：卡片「位置不稳定、随意浮动」）：
   旧实现靠 .top/.bot 两个 class + transform:translateY 在「贴顶/贴底」之间翻边，
   滚动/面板滑入/卡片长高都会让判定抖动 ⇒ 视觉上卡片到处漂。现改为**恒定停在预留带内**（位置由 CSS 锚定，
   不再翻边、不再有 translateY），随后按用户最新要求升级为「填满数据列表下方整条带」的停靠面板。 */
/* ★2026-10-17（用户："把教程卡片完全放到数据列表下面，是整个直接填充，而不是把卡片移动到那里"）：
   卡片不再是「居中的小浮卡」，而是**停靠在数据列表正下方、把整条预留带直接填满**的底部面板：
   左/右/下贴边、width:auto、height=预留带高（--tut-band），顶部只留上圆角；面板底边 = 卡片顶边，两者相接无缝。
   内部改成 flex 纵列：head/foot 固定，body 占满剩余高度并在超高时自身滚动（不再靠卡片整体滚动）。 */
.ex-tut-card{position:fixed;left:0;right:0;bottom:0;transform:none;width:auto;max-height:none;height:var(--tut-band);
  display:flex;flex-direction:column;
  background:rgba(16,13,34,.94);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  border:1px solid rgba(139,92,246,.28);border-bottom:none;border-radius:16px 16px 0 0;color:#e6e8f5;
  box-shadow:0 -12px 36px rgba(0,0,0,.42);pointer-events:auto;overflow:hidden;animation:exTutPop .22s ease;transition:none;}
/* 内容列限宽并居中，避免全宽后每行文字过长（面板本身仍铺满整条带） */
.ex-tut-card .ex-tut-head,.ex-tut-card .ex-tut-body,.ex-tut-card .ex-tut-foot{width:min(100%,1200px);margin-left:auto;margin-right:auto;box-sizing:border-box;}
.ex-tut-card .ex-tut-body{flex:1 1 auto;min-height:0;overflow-y:auto;}
body.light-mode .ex-tut-card{background:rgba(255,255,255,.94);color:#1e293b;border-color:rgba(124,58,237,.22);box-shadow:0 18px 50px rgba(76,29,149,.22);}
/* 入场动画**只允许动 opacity**——绝不能再动 transform（也不要 scale，避免任何纵向位移）：
   .ex-tut-card 的贴顶/贴底位置正是靠 transform:translateY(--tut-bot-shift) 表达的，
   而 CSS 动画运行期间会**覆盖** class 的 transform。旧写法 to 状态是 translateY(0)=最上方，
   于是每建一张新卡片（每一步）都会先被甩到最上方、动画结束再落回下方 = 卡片「上下飞来飞去」
   （用户多次反馈的现象）。改后入场只淡入，卡片直接出现在正确的一侧、零纵向位移。 */
@keyframes exTutPop{from{opacity:0;}to{opacity:1;}}
/* 2026-10-17：卡片位置恒定贴底（由上面的 bottom:14px 锚定），.top/.bot 只是历史类名残留，
   不再表达任何位移——保留这两条 no-op 规则只为兼容旧代码里仍在 toggle 的 class，防止未知 transform 覆盖。 */
.ex-tut-card.top{transform:none;}
.ex-tut-card.bot{transform:none;}
.ex-tut-head{display:flex;align-items:center;gap:calc(8px * var(--tut-ui));padding:calc(10px * var(--tut-ui)) calc(14px * var(--tut-ui)) 0;}
.ex-tut-chip{display:inline-flex;align-items:center;gap:calc(5.71px * var(--tut-ui) * 0.7);font-size:calc(14.29px * var(--tut-ui) * 0.7);color:#c4b5fd;background:rgba(139,92,246,.16);border-radius:999px;padding:calc(2.86px * var(--tut-ui) * 0.7) calc(11.43px * var(--tut-ui) * 0.7);white-space:nowrap;}
body.light-mode .ex-tut-chip{color:#6d28d9;background:rgba(139,92,246,.12);}
.ex-tut-chip svg{display:block;flex:0 0 auto;}
/* 步骤标题（如「新模式的变量面板：双列分区」）的灰色小字：按用户要求不再显示；
   标题本身仍可在「菜单 → 记录」面板里看到，卡片顶部只留「第 N 节 · x/y」章节 chip */
.ex-tut-count{display:none;}
.ex-tut-x{pointer-events:auto;cursor:pointer;border:none;background:none;color:#94a3b8;font-size:calc(21.67px * var(--tut-ui) * 0.6);padding:calc(1.67px * var(--tut-ui) * 0.6) calc(8.33px * var(--tut-ui) * 0.6);border-radius:calc(10px * var(--tut-ui) * 0.6);line-height:1;}
.ex-tut-x:hover{color:#f87171;background:rgba(248,113,113,.12);}
.ex-tut-body{padding:calc(7px * var(--tut-ui)) calc(16px * var(--tut-ui)) calc(6px * var(--tut-ui));font-size:calc(15.5px * var(--tut-ui));line-height:1.5;}
.ex-tut-foot{display:flex;align-items:center;gap:calc(8px * var(--tut-ui));padding:calc(6px * var(--tut-ui)) calc(14px * var(--tut-ui)) calc(12px * var(--tut-ui));}
.ex-tut-dots{flex:1;display:flex;gap:calc(8.33px * var(--tut-ui) * 0.6);align-items:center;min-width:0;}
.ex-tut-dot{width:calc(11.67px * var(--tut-ui) * 0.6);height:calc(11.67px * var(--tut-ui) * 0.6);border-radius:50%;background:rgba(139,92,246,.25);flex:0 0 auto;}
.ex-tut-dot.on{background:#a78bfa;box-shadow:0 0 8px rgba(167,139,250,.9);}
body.light-mode .ex-tut-dot{background:rgba(109,40,217,.25);}
body.light-mode .ex-tut-dot.on{background:#7c3aed;}
.ex-tut-btn{pointer-events:auto;cursor:pointer;border:1px solid rgba(139,92,246,.45);color:#c4b5fd;background:rgba(139,92,246,.1);font-size:calc(20px * var(--tut-ui) * 0.6);padding:calc(10px * var(--tut-ui) * 0.6) calc(20px * var(--tut-ui) * 0.6);border-radius:calc(13.33px * var(--tut-ui) * 0.6);white-space:nowrap;}
.ex-tut-btn:hover{background:rgba(139,92,246,.22);}
.ex-tut-btn.primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);border-color:transparent;color:#fff;box-shadow:0 4px 14px rgba(109,40,217,.4);}
.ex-tut-btn.primary:hover{filter:brightness(1.1);}
.ex-tut-btn.ghost{border-color:transparent;color:#94a3b8;background:none;}
.ex-tut-btn.ghost:hover{color:#e2e8f0;background:rgba(148,163,184,.1);}
.ex-tut-btn:disabled{cursor:not-allowed;opacity:.45;}
.ex-tut-btn.ready{box-shadow:0 0 0 1.5px rgba(52,211,153,.85);}
/* 浅色模式下的按钮/提示对比度（原来只做了深色配色，浅色下几乎看不清：「← 上一步 / 目录」发白） */
body.light-mode .ex-tut-btn{color:#6d28d9;border-color:rgba(109,40,217,.38);background:rgba(139,92,246,.09);}
body.light-mode .ex-tut-btn:hover{background:rgba(139,92,246,.2);}
body.light-mode .ex-tut-btn.ready{box-shadow:0 0 0 1.5px rgba(16,185,129,.8);}
body.light-mode .ex-tut-hint{color:#64748b;}
body.light-mode .ex-tut-caret{background:#7c3aed;}
.ex-tut-btn.tut-demo{color:#fbbf24;border-color:rgba(251,191,36,.55);background:rgba(251,191,36,.1);}
/* 状态条：类名原为 'tut-status' 而 CSS 写的是 .ex-tut-status → 从未命中（橙框/绿色态一直失效）。
   现已把 JS 侧统一为 ex-tut-status；字号随正文一起放大（原 12px 是失效时的兜底值）。 */
.ex-tut-status{font-size:calc(16px * var(--tut-ui));line-height:1.5;color:#f59e0b;background:rgba(245,158,11,.1);border:1px dashed rgba(245,158,11,.35);border-radius:calc(8px * var(--tut-ui));padding:calc(6px * var(--tut-ui)) calc(11px * var(--tut-ui));margin-top:calc(8px * var(--tut-ui));}
.ex-tut-status.ok{color:#34d399;background:rgba(52,211,153,.12);border-color:rgba(52,211,153,.45);}
/* 浅色模式下橙/绿在浅底上对比度不足，单独加深（与按钮/hint 的浅色补偿同一套思路） */
body.light-mode .ex-tut-status{color:#b45309;background:rgba(245,158,11,.14);border-color:rgba(180,83,9,.4);}
body.light-mode .ex-tut-status.ok{color:#047857;background:rgba(16,185,129,.14);border-color:rgba(4,120,87,.45);}
/* 章节目录 */
.ex-tut-overlay{position:fixed;inset:0;z-index:2147483100;background:rgba(8,6,26,.68);pointer-events:auto;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;}
body.light-mode .ex-tut-overlay{background:rgba(30,27,75,.35);}
.ex-tut-toc{width:min(720px,96vw);max-height:88vh;overflow:auto;background:rgba(18,16,38,.97);border:1px solid rgba(139,92,246,.45);border-radius:18px;color:#e6e8f5;padding:20px 22px;box-shadow:0 24px 80px rgba(0,0,0,.65);position:relative;}
body.light-mode .ex-tut-toc{background:rgba(252,251,255,.98);color:#1e293b;}
/* 目录弹窗右上角退出按钮（删除底部按钮后提供的显式关闭入口） */
.ex-tut-toc-x{position:absolute;top:10px;right:12px;z-index:2;}
.ex-tut-toc h3{margin:0 0 4px;font-size:19px;line-height:1.5;padding-right:40px;}

/* ---------- 章完成弹窗（2026-10-17 重设计：弃用裸 .ex-tut-toc 复用壳 + 矩形按钮 + emoji，
   改为教程紫色设计语言的独立弹窗：玻璃卡 + 顶部渐变徽章 + 渐变标题 + 胶囊按钮） ---------- */
.ex-tut-done{position:relative;width:min(380px,92vw);max-height:none;overflow:visible;padding:0 26px 24px;text-align:center;
  background:linear-gradient(165deg,rgba(43,16,64,.97),rgba(22,12,42,.97) 55%,rgba(29,10,44,.97));
  border:1px solid rgba(167,139,250,.38);border-radius:20px;
  box-shadow:0 30px 90px rgba(0,0,0,.7),0 0 0 1px rgba(139,92,246,.12),0 0 46px rgba(139,92,246,.22);
  animation:exTutDoneIn .32s cubic-bezier(.22,1.2,.36,1);}
@keyframes exTutDoneIn{from{opacity:0;transform:translateY(14px) scale(.96);}to{opacity:1;transform:translateY(0) scale(1);}}
/* 印章砸到瞬间：卡片被震一下（极短，左右各一次） */
@keyframes exTutDoneShake{0%{transform:translateY(0) rotate(0);}40%{transform:translate(3px,-1px) rotate(.5deg);}70%{transform:translate(-2px,0) rotate(-.35deg);}100%{transform:translate(0,0) rotate(0);}}
.ex-tut-done.shake{animation:exTutDoneIn .32s cubic-bezier(.22,1.2,.36,1),exTutDoneShake .26s ease-out .41s;}
body.light-mode .ex-tut-done{background:linear-gradient(165deg,#fdfaff,#f4ecfe 60%,#efe4fc);border-color:rgba(124,58,237,.3);box-shadow:0 30px 80px rgba(76,29,149,.3),0 0 46px rgba(139,92,246,.16);}
/* 顶部/角落印章：写实风红色墨章，重重砸在卡片右下角。
   写实感来源：SVG turbulence 位移滤镜让边缘/字呈手盖章的毛糙墨渍；feColorMatrix 把纯红压成印泥暗红；
   叠加一层 svg 噪声做墨色浓淡斑驳；伪元素 ::after 做纸张透出的浅红晕染。 */
.ex-tut-done-stamp{position:absolute;right:-24px;bottom:-20px;z-index:3;width:120px;height:66px;
  display:flex;align-items:center;justify-content:center;
  color:#c0271d;font-family:"STKaiti","KaiTi","Kaiti SC","SimSun",serif;font-size:30px;font-weight:900;letter-spacing:6px;
  padding-left:6px;pointer-events:none;
  transform:rotate(-16deg);transform-origin:60% 70%;
  filter:url(#exTutInkFilter) drop-shadow(0 2px 1px rgba(150,20,10,.18));
  animation:exTutStampSlam .5s cubic-bezier(.5,0,.92,.45) .14s both;}
/* 墨章外框（双线红框，手盖章的边框） */
.ex-tut-done-stamp::before{content:'';position:absolute;inset:3px;border-radius:6px;border:3px solid #c0271d;
  opacity:.92;mix-blend-mode:multiply;pointer-events:none;z-index:2;}
/* 印章下方纸张透出的浅红晕（墨透纸背） */
.ex-tut-done-stamp::after{content:'';position:absolute;inset:-3px;border-radius:8px;
  background:radial-gradient(60% 70% at 55% 60%,rgba(192,39,29,.16),rgba(192,39,29,0) 72%);
  mix-blend-mode:multiply;pointer-events:none;z-index:0;}
/* 文字本身抬到墨渍噪声之上，避免被盖住 */
.ex-tut-done-stamp .zd{position:relative;z-index:3;}
@keyframes exTutStampSlam{
  0%{opacity:0;transform:translate(34px,-150px) rotate(-16deg) scale(.5);}
  54%{opacity:1;transform:translate(0,0) rotate(-16deg) scaleY(1.16) scaleX(.86);}   /* 砸到：横向压扁、纵向拉长 */
  70%{transform:translate(0,0) rotate(-16deg) scaleY(.9) scaleX(1.1);}               /* 回弹：反向鼓起 */
  85%{transform:translate(0,0) rotate(-16deg) scaleY(1.04) scaleX(.98);}
  100%{transform:translate(0,0) rotate(-16deg) scale(1);}}
/* 墨渍斑驳：盖一层极淡的 svg 噪声（透明度随位置变化 ⇒ 像没盖匀的印泥） */
.ex-tut-done-stamp-ink{position:absolute;inset:0;border-radius:6px;pointer-events:none;mix-blend-mode:multiply;opacity:.5;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='66'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 0.75  0 0 0 0 0.15  0 0 0 0 0.11  0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  -webkit-mask-image:linear-gradient(135deg,#000,#000 70%,transparent);mask-image:linear-gradient(135deg,#000,#000 70%,transparent);}
.ex-tut-done-title{margin:12px 0 0;font-size:21px;font-weight:800;letter-spacing:.5px;line-height:1.4;
  background:linear-gradient(95deg,#e9d5ff,#c4b5fd 45%,#a78bfa);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
body.light-mode .ex-tut-done-title{background:linear-gradient(95deg,#6d28d9,#7c3aed 55%,#9333ea);-webkit-background-clip:text;background-clip:text;}
.ex-tut-done-text{margin:9px 0 20px;font-size:13px;line-height:1.75;color:#a5b4fc;}
body.light-mode .ex-tut-done-text{color:#64748b;}
/* 按钮行：两枚等高胶囊（左幽灵 / 右渐变主按钮带箭头微动效） */
.ex-tut-done-foot{display:flex;gap:10px;justify-content:center;align-items:center;}
.ex-tut-done-back,.ex-tut-done-go{cursor:pointer;border-radius:999px;font-size:14px;font-weight:600;letter-spacing:.3px;
  padding:10px 22px;line-height:1;transition:filter .15s ease,background .15s ease,transform .15s ease;}
.ex-tut-done-back{border:1px solid rgba(148,163,184,.4);background:none;color:#94a3b8;}
.ex-tut-done-back:hover{color:#e2e8f0;border-color:rgba(196,181,253,.55);background:rgba(148,163,184,.1);}
body.light-mode .ex-tut-done-back{color:#64748b;border-color:rgba(100,116,139,.35);}
body.light-mode .ex-tut-done-back:hover{color:#334155;background:rgba(100,116,139,.08);}
.ex-tut-done-go{border:none;color:#fff;background:linear-gradient(135deg,#8b5cf6,#6d28d9);
  box-shadow:0 6px 20px rgba(109,40,217,.45),inset 0 1px 0 rgba(255,255,255,.22);display:inline-flex;align-items:center;gap:7px;}
.ex-tut-done-go:hover{filter:brightness(1.12);transform:translateY(-1px);}
.ex-tut-done-go:active{transform:translateY(0);filter:brightness(.98);}
.ex-tut-done-go .ar{display:inline-block;transition:transform .18s ease;}
.ex-tut-done-go:hover .ar{transform:translateX(3px);}

/* ---------- 教程目录 · 章节页（参考图版：左紫色胶囊目题 + 右相册实时截图；默认深紫，含浅色模式） ---------- */
.ex-tut-page{position:relative;width:min(960px,94vw);max-height:88vh;display:flex;flex-direction:column;border-radius:8px;overflow:hidden;color:#f4e9ff;pointer-events:auto;
  background:radial-gradient(80% 60% at 84% 6%, rgba(255,45,149,.16), transparent 62%),linear-gradient(150deg,#2b1040 0%,#3d1259 48%,#1d0a2c 100%);
  border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 80px rgba(0,0,0,.62);}
.ex-tut-page .ex-tut-head{position:relative;z-index:3;flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.10);}
.ex-tut-page .ex-tut-brand{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:800;letter-spacing:.5px;color:#f4e9ff;white-space:nowrap;}
.ex-tut-page .ex-tut-head-right{margin-left:auto;display:flex;align-items:center;gap:9px;}
.ex-tut-page .ex-tut-page-x{position:static;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(255,255,255,.06);color:#e3d3f2;font-size:15px;line-height:1;cursor:pointer;padding:0;font-family:inherit;transition:background .15s ease,color .15s ease,border-color .15s ease;}
.ex-tut-page .ex-tut-page-x:hover{color:#fff;background:#e11d74;border-color:#e11d74;}
.ex-tut-page .ex-tut-flag{position:static;display:inline-flex;align-items:center;height:26px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.24);color:#fff;font-size:12.5px;font-weight:800;letter-spacing:.5px;white-space:nowrap;}
.ex-tut-page .ex-tut-flag span{display:inline-block;}
/* 左右各留出 52px 给两侧的 < > 章切换按钮（40px 按钮 + 10px 边距 + 2px 余量），避免遮挡文字/相纸 */
.ex-tut-page .ex-tut-main{position:relative;flex:1 1 auto;min-height:0;display:flex;gap:18px;padding:16px 52px;}
.ex-tut-page .ex-tut-left{flex:0 0 auto;width:min(320px,40%);min-height:0;display:flex;flex-direction:column;gap:11px;padding:2px 0;}
/* ★章节信息三级权重（2026-10-16 用户：「各个部分视觉权重都太相近了」）。
   之前 ch-num(20px/800) 与 ch-name(14px/800) 同为 800、字号又接近 ⇒ 主次不分。
   现在按「大→小 / 亮→暗 / 重→轻」三轴同时拉开：
     ① ch-num  26px/800 最亮  —— 页面视觉锚点（第 N 章）
     ② ch-name 15px/600 中灰  —— 靠**降低字重**与 ① 分离（同字重是之前最大的问题）
     ③ ch-desc 11.5px/400 最暗 —— 说明性文字，不参与竞争
     ④ ch-prog 做成小胶囊徽章 —— 不再是一条游离的粉字，改为有边界的「计数标签」 */
.ex-tut-page .ex-tut-chinfo{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;}
.ex-tut-page .ex-tut-chinfo .ch-num{font-size:26px;font-weight:800;color:#fdf4ff;letter-spacing:.5px;line-height:1.15;}
.ex-tut-page .ex-tut-chinfo .ch-name{font-size:15px;font-weight:600;color:#c9a8e8;letter-spacing:.3px;}
.ex-tut-page .ex-tut-chinfo .ch-desc{flex-basis:100%;font-size:11.5px;font-weight:400;color:#8f79a8;line-height:1.5;}
.ex-tut-page .ex-tut-chinfo .ch-prog{font-size:10.5px;font-weight:700;color:#ffb3dd;margin-left:auto;
  background:rgba(255,45,149,.14);border:1px solid rgba(255,45,149,.30);border-radius:999px;padding:2px 9px;white-space:nowrap;}
.ex-tut-page .ex-tut-pills{flex:1 1 auto;min-height:120px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;overflow-x:hidden;padding:2px 8px 2px 2px;}
.ex-tut-page .ex-tut-pills::-webkit-scrollbar{width:7px;}
.ex-tut-page .ex-tut-pills::-webkit-scrollbar-track{background:rgba(255,255,255,.07);border-radius:4px;}
.ex-tut-page .ex-tut-pills::-webkit-scrollbar-thumb{background:#c98ce0;border-radius:4px;}
/* 目题条 = 文字坐在一块「浅紫色低 R 角矩形」上（用户 2026-10-16 指定）：
   矩形**恒定不变** —— 不论 hover / 选中 / 已通关，底色、圆角、尺寸、位置都不动，
   只有文字本身的颜色与「从左往右扫过的曝光光晕」在变。
   ⚠ 因此**绝不能在 :hover/.sel 里改 background/border-radius/padding**，也不要把
   filter 挂在 pill 上（那会连矩形一起发光/位移）—— 光晕一律只挂到 .pl-tx 上。 */
.ex-tut-page .ex-tut-pill{position:relative;display:flex;align-items:center;gap:10px;text-align:left;font-family:inherit;-webkit-appearance:none;appearance:none;padding:9px 12px;border:0;outline:none;border-radius:6px;background:rgba(139,92,246,.24);box-shadow:none;cursor:pointer;white-space:nowrap;overflow:hidden;
  color:rgba(255,255,255,.58);font-size:13px;font-weight:500;letter-spacing:.3px;transition:color .18s ease;}
.ex-tut-page .ex-tut-pill .pl-num{flex:0 0 auto;font-size:10.5px;font-weight:700;color:rgba(255,255,255,.28);font-variant-numeric:tabular-nums;transition:color .18s ease;}
.ex-tut-page .ex-tut-pill .pl-tx{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;-webkit-background-clip:text;background-clip:text;}
.ex-tut-page .ex-tut-pill:hover{color:rgba(255,255,255,.9);font-weight:600;}
.ex-tut-page .ex-tut-pill:hover .pl-num{color:rgba(255,255,255,.66);}
.ex-tut-page .ex-tut-pill.sel{color:#fff;font-weight:700;}
.ex-tut-page .ex-tut-pill.sel .pl-num{color:#ffb6e0;font-weight:800;}
.ex-tut-page .ex-tut-pill.done .pl-num{color:#9ff5c4;}
.ex-tut-page .ex-tut-pill.locked{color:rgba(255,255,255,.3);cursor:not-allowed;}
/* 从左往右扫过文字的曝光光晕：窗格沿 300% 宽的渐变由 0% 滑到 100% ⇒ 高光自左向右掠过 */
@keyframes exTutShine{0%{background-position:0% 0;}100%{background-position:100% 0;}}
.ex-tut-page .ex-tut-pill:hover .pl-tx,.ex-tut-page .ex-tut-pill.sel .pl-tx{
  background-image:linear-gradient(90deg,#d9a9d6 0%,#d9a9d6 32%,#ffffff 41%,#fff2fc 50%,#ff8fd0 57%,#ffffff 67%,#ffffff 100%);
  background-size:300% 100%;background-repeat:no-repeat;
  -webkit-text-fill-color:transparent;color:transparent;
  animation:exTutShine .78s cubic-bezier(.22,.62,.28,1) 1 both;}
/* 光晕只作用在文字上（挂 .pl-tx，不挂 .ex-tut-pill）——保证那块浅紫矩形恒定不动 */
.ex-tut-page .ex-tut-pill:hover .pl-tx,.ex-tut-page .ex-tut-pill.sel .pl-tx{filter:drop-shadow(0 0 7px rgba(255,120,200,.5));}
.ex-tut-page .ex-tut-lfoot{flex:0 0 auto;display:flex;align-items:center;gap:10px;}
.ex-tut-page .ex-tut-return{flex:1 1 auto;font-family:inherit;-webkit-appearance:none;appearance:none;font-size:13px;font-weight:800;letter-spacing:1px;color:#e9d5ff;background:rgba(255,255,255,.09);border:0;border-radius:5px;padding:10px 15px;cursor:pointer;transition:background .15s ease;}
.ex-tut-page .ex-tut-return:hover{background:rgba(255,255,255,.18);}
.ex-tut-page .ex-tut-tour-link{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:#e9d5ff;cursor:pointer;background:rgba(255,255,255,.09);border:0;border-radius:5px;padding:10px 14px;transition:background .15s ease;}
.ex-tut-page .ex-tut-tour-link:hover{background:rgba(255,255,255,.18);}
.ex-tut-page .ex-tut-tour-link svg path{stroke:currentColor;}
/* ★章切换按钮（2026-10-16 用户要求：移到页面左右两侧，做成 < >；★不要圆圈）。
   用户明确否掉了圆形底板 —— 只要**裸露的 < / > 箭头字形**本身：
   无背景、无边框、无圆角容器；只留箭头 + 悬停时的放大/变亮反馈。
   点击热区仍保持 44×44（满足可点性），但视觉上完全透明。 */
.ex-tut-page .ex-tut-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:6;
  width:44px;height:44px;display:flex;align-items:center;justify-content:center;
  background:none;border:0;border-radius:0;box-shadow:none;
  cursor:pointer;padding:0;transition:opacity .15s ease,transform .15s ease;}
.ex-tut-page .ex-tut-nav.prev{left:6px;}
.ex-tut-page .ex-tut-nav.next{right:6px;}
.ex-tut-page .ex-tut-nav svg{width:auto;height:22px;}
.ex-tut-page .ex-tut-nav svg path{stroke:#f2ddff;}
/* 悬停：仅放大 + 提亮（无底板，避免又变回「圆圈」） */
.ex-tut-page .ex-tut-nav:hover{background:none;transform:translateY(-50%) scale(1.22);}
.ex-tut-page .ex-tut-nav:hover svg path{stroke:#ffffff;}
.ex-tut-page .ex-tut-nav.off{opacity:.18;pointer-events:none;}
.ex-tut-page .ex-tut-right{flex:1 1 auto;min-width:0;display:flex;align-items:center;justify-content:center;}
/* 相纸三层结构（★2026-10-16 重构，修「左下角缺三角形」）：
   .ex-tut-photo      = 纯定位 + 落纸动画壳（**不带** clip-path / 白底 / padding）
   .ex-tut-photo-card = 真正的白卡纸（白底 + padding + 斜切 clip-path）
   .ex-tut-photo-corner / -pin = photo 的**兄弟**节点，不再被白卡的 clip-path 裁掉。
   旧结构把折角当白卡子节点，而折角正好落在白卡被斜切掉的那块区域 ⇒ 整个三角被裁没。
   ★★**下留白必须 ≥ 斜切边长**（padding-bottom:96px vs bevel 88px）：
   参考图是「图片完整显示、下方空白处一个折角三角」；若 padding-bottom 小于斜切边长，
   45° 斜线会**横穿图片本体**（把预览图右下角切掉一块）—— 这是本轮修的第二处几何错。 */
.ex-tut-page .ex-tut-photo{position:relative;width:100%;max-width:430px;transform:rotate(-0.8deg);}
.ex-tut-page .ex-tut-photo-card{position:relative;background:#fff;border:0;border-radius:3px;box-shadow:0 18px 44px rgba(0,0,0,.5);padding:12px 12px 96px;
  clip-path:polygon(0 0,100% 0,100% 100%,88px 100%,0 calc(100% - 88px));}
.ex-tut-page .ex-tut-photo-in{position:relative;background:#0b0714;overflow:hidden;border:6px solid #ff2d95;}
.ex-tut-page .ex-tut-shot{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:linear-gradient(160deg,#3a1c56,#160a24);}
.ex-tut-page .ex-tut-shot.empty{background:linear-gradient(160deg,#3a1c56,#160a24);}
/* 该目暂无截图时的占位文字（叠在渐变上，不显示浏览器破图图标） */
.ex-tut-page .ex-tut-shot-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 16px;text-align:center;color:#c9b6df;font-size:12.5px;letter-spacing:.04em;pointer-events:none;opacity:0;transition:opacity .18s ease;}
.ex-tut-page .ex-tut-shot-ph.on{opacity:1;}
/* 左下角折角（★2026-10-16 修正方向：三角要朝【右上】）。
   原理：折角 = 把被斜切掉的那个角【沿折痕翻折过来】的纸片。
   被切掉的角 = 左下三角（TL,BL,BR）；折痕 = 对角线 y=x；
   把 BL 关于 y=x 镜像 → 落在 (88,0) 即【右上】⇒ 翻折后的纸片 = 右上三角（TL,TR,BR）。
   旧实现直接画「左下三角」= 正好填回被切掉的洞里，看起来是"补丁"而不是"折角"（用户报方向反了）。
   紫色 = 整片折纸；粉色 = 内层更小的折角（同锚右上角），沿折痕留出一条紫边。 */
.ex-tut-page .ex-tut-photo-corner{position:absolute;left:0;bottom:0;width:88px;height:88px;pointer-events:none;
  background:#6d28d9;clip-path:polygon(0 0,100% 0,100% 100%);}
.ex-tut-page .ex-tut-photo-corner::after{content:'';position:absolute;right:0;top:0;width:70px;height:70px;
  background:linear-gradient(135deg,#ff62b3,#ff2d95);clip-path:polygon(0 0,100% 0,100% 100%);}
/* 右下角：打孔 —— 白卡纸上一个「倒角孔」（对齐参考图二，2026-10-16 重做）：
   外圈 = 被左上光源照亮的浅紫倒角环（左上最亮 → 右下渐深）；
   内圈 = 深紫孔洞，孔内左上受遮挡最暗、右下反光略亮（凹陷感）。
   旧实现只有一层柔和深色 radial（没有倒角环）⇒ 看起来像「污渍」而不是「打孔」。 */
.ex-tut-page .ex-tut-photo-pin{position:absolute;right:26px;bottom:32px;width:24px;height:24px;border-radius:50%;pointer-events:none;
  background:linear-gradient(140deg,#e6cbf7 0%,#cba3e6 34%,#9d68c8 68%,#7c3aed 100%);
  box-shadow:0 1px 2px rgba(21,3,24,.35);}
.ex-tut-page .ex-tut-photo-pin::before{content:'';position:absolute;left:2px;top:2px;right:2px;bottom:2px;border-radius:50%;
  background:radial-gradient(circle at 66% 72%,#5a2361 0%,#3d1142 52%,#1e0524 100%);
  box-shadow:inset 1.6px 1.6px 2.4px rgba(0,0,0,.72),inset -1px -1px 1.6px rgba(255,255,255,.12);}
/* 悬停目题：相纸以一个「小随机角度」落下，落定后**略微越过边界再回弹**（阻尼弹跳），
   而不是左右晃动（用户 2026-10-16 明确纠正）。
   轨迹 = 上方落下 → 略冲过落点(+7px) → 回弹到上方(-3px) → 再小幅(+1.4px) → 停在落点。 */
@keyframes exTutDrop{
  0%{transform:translateY(-54px) rotate(var(--exDropR,-3deg)) scale(.96);opacity:0;animation-timing-function:cubic-bezier(.4,.05,.72,.28);}
  46%{transform:translateY(0) rotate(-0.8deg) scale(1);opacity:1;animation-timing-function:ease-out;}
  64%{transform:translateY(7px) rotate(-0.8deg) scale(1.016);animation-timing-function:ease-in-out;}
  80%{transform:translateY(-3px) rotate(-0.8deg) scale(.994);animation-timing-function:ease-in-out;}
  91%{transform:translateY(1.4px) rotate(-0.8deg) scale(1.003);animation-timing-function:ease-out;}
  100%{transform:translateY(0) rotate(-0.8deg) scale(1);}
}
.ex-tut-page .ex-tut-photo.dropin{animation:exTutDrop .92s both;}
/* ---- 教程「加载仪式感」（2026-10-16 用户要求）----
   进入教程时用一层全屏遮罩糊住画面，左下角走伪加载文本（先一本正经、再抖个机灵），
   给「开始上课」一点仪式感。点击任意处可立刻跳过；总时长约 2.2s。
   z-index 高于教程根（2147483000），保证把整个屏幕都盖住。 */
.ex-tut-ritual{position:fixed;inset:0;z-index:2147483200;pointer-events:auto;cursor:pointer;
  display:flex;align-items:flex-end;padding:30px 36px;
  background:radial-gradient(90% 70% at 78% 12%, rgba(255,45,149,.10), transparent 62%),linear-gradient(150deg,#150b26 0%,#1d0f31 55%,#0b0714 100%);
  opacity:1;transition:opacity .34s ease;}
.ex-tut-ritual.out{opacity:0;}
.ex-tut-ritual-box{display:flex;flex-direction:column;gap:9px;max-width:min(560px,82vw);}
.ex-tut-ritual-line{font-size:14px;font-weight:600;letter-spacing:.4px;color:#9d8fb8;line-height:1.5;min-height:1.5em;
  font-family:'EXRoundTut','Segoe UI','Microsoft YaHei',sans-serif;}
.ex-tut-ritual-line .rt-caret{display:inline-block;width:8px;height:14px;margin-left:2px;vertical-align:-2px;
  background:#a78bfa;border-radius:1px;animation:exTutCaret .8s steps(1) infinite;}
/* 抖机灵那一句：转成警示色 + 轻微抖动，制造「翻车」的喜剧感 */
.ex-tut-ritual-line.joke{color:#ff9ec7;}
.ex-tut-ritual-line.joke.err{color:#ff8a8a;animation:exTutRitualShake .34s ease;}
@keyframes exTutRitualShake{0%,100%{transform:translateX(0);}22%{transform:translateX(-3px);}55%{transform:translateX(2.5px);}80%{transform:translateX(-1.2px);}}
.ex-tut-ritual-bar{width:min(240px,54vw);height:3px;border-radius:2px;background:rgba(255,255,255,.10);overflow:hidden;}
.ex-tut-ritual-bar > i{display:block;height:100%;width:0;border-radius:2px;
  background:linear-gradient(90deg,#a78bfa,#ff2d95);transition:width .28s ease;}
.ex-tut-ritual-hint{font-size:10.5px;color:#6b5f80;letter-spacing:.3px;}
body.light-mode .ex-tut-ritual{background:radial-gradient(90% 70% at 78% 12%, rgba(217,70,239,.10), transparent 62%),linear-gradient(150deg,#faf7ff 0%,#f1e8fc 55%,#e9dcfa 100%);}
body.light-mode .ex-tut-ritual-line{color:#7c6a99;}
body.light-mode .ex-tut-ritual-line.joke{color:#a21caf;}
body.light-mode .ex-tut-ritual-line.joke.err{color:#b91c1c;}
body.light-mode .ex-tut-ritual-bar{background:rgba(124,58,237,.14);}
body.light-mode .ex-tut-ritual-hint{color:#a99cc0;}
@media (max-width:760px){
  .ex-tut-page{width:96vw;}
  .ex-tut-page .ex-tut-main{flex-direction:column;gap:12px;padding:12px 52px;}
  .ex-tut-page .ex-tut-left{width:100%;}
  .ex-tut-page .ex-tut-pills{min-height:0;max-height:34vh;}
  .ex-tut-page .ex-tut-photo{max-width:100%;transform:none;}
}

/* -------- 浅色模式 -------- */
body.light-mode .ex-tut-page{color:#3b1264;
  background:radial-gradient(70% 55% at 84% 6%, rgba(217,70,239,.12), transparent 60%),linear-gradient(150deg,#ffffff 0%,#f5eefc 52%,#efe4fb 100%);
  border-color:#e6d8f6;box-shadow:0 26px 64px rgba(76,29,149,.30);}
body.light-mode .ex-tut-page .ex-tut-head{background:linear-gradient(135deg,#f5ebfe,#ecdcfb);border-bottom:1px solid #e2d2f6;}
body.light-mode .ex-tut-page .ex-tut-left{background:transparent;box-shadow:none;}
body.light-mode .ex-tut-page .ex-tut-brand{color:#6d28d9;}
body.light-mode .ex-tut-page .ex-tut-flag{background:rgba(124,58,237,.10);border-color:rgba(124,58,237,.26);color:#6d28d9;}
body.light-mode .ex-tut-page .ex-tut-page-x{background:#fff;border-color:#e2d2f6;color:#7c3aed;}
body.light-mode .ex-tut-page .ex-tut-page-x:hover{color:#fff;background:#e11d74;border-color:#e11d74;}
/* 浅色模式：同样保持「无圆圈」，只换箭头颜色 */
body.light-mode .ex-tut-page .ex-tut-nav{background:none;border:0;box-shadow:none;}
body.light-mode .ex-tut-page .ex-tut-nav svg path{stroke:#7c3aed;}
body.light-mode .ex-tut-page .ex-tut-nav:hover{background:none;}
body.light-mode .ex-tut-page .ex-tut-nav:hover svg path{stroke:#5b21b6;}
body.light-mode .ex-tut-page .ex-tut-chinfo .ch-num{color:#3b0f7a;}
body.light-mode .ex-tut-page .ex-tut-chinfo .ch-name{color:#7c5aa8;}
body.light-mode .ex-tut-page .ex-tut-chinfo .ch-desc{color:#9585ad;}
body.light-mode .ex-tut-page .ex-tut-chinfo .ch-prog{color:#a21caf;
  background:rgba(217,70,239,.12);border-color:rgba(217,70,239,.30);}
body.light-mode .ex-tut-page .ex-tut-pills::-webkit-scrollbar-track{background:rgba(124,58,237,.08);}
body.light-mode .ex-tut-page .ex-tut-pills::-webkit-scrollbar-thumb{background:#c4a2e0;}
body.light-mode .ex-tut-page .ex-tut-pill{background:rgba(124,58,237,.13);border:0;box-shadow:none;color:rgba(76,29,149,.52);}
body.light-mode .ex-tut-page .ex-tut-pill .pl-num{color:rgba(109,40,217,.34);}
body.light-mode .ex-tut-page .ex-tut-pill:hover{color:#4c1d95;}
body.light-mode .ex-tut-page .ex-tut-pill.sel{color:#3b0f7a;}
body.light-mode .ex-tut-page .ex-tut-pill.sel .pl-num{color:#a21caf;}
body.light-mode .ex-tut-page .ex-tut-pill.done .pl-num{color:#15803d;}
body.light-mode .ex-tut-page .ex-tut-pill.locked{color:rgba(76,29,149,.32);}
body.light-mode .ex-tut-page .ex-tut-pill:hover .pl-tx,body.light-mode .ex-tut-page .ex-tut-pill.sel .pl-tx{
  background-image:linear-gradient(90deg,#8b5cf6 0%,#8b5cf6 32%,#d946ef 41%,#ff2d95 50%,#c026d3 57%,#5b21b6 67%,#5b21b6 100%);}
body.light-mode .ex-tut-page .ex-tut-pill:hover .pl-tx,body.light-mode .ex-tut-page .ex-tut-pill.sel .pl-tx{filter:drop-shadow(0 0 7px rgba(217,70,239,.42));}
body.light-mode .ex-tut-page .ex-tut-return{color:#6d28d9;background:rgba(124,58,237,.09);border:0;}
body.light-mode .ex-tut-page .ex-tut-return:hover{background:rgba(124,58,237,.16);}
body.light-mode .ex-tut-page .ex-tut-tour-link{color:#6d28d9;background:rgba(124,58,237,.09);border:0;}
body.light-mode .ex-tut-page .ex-tut-tour-link:hover{background:rgba(124,58,237,.16);}
/* 章节目录：长条平行四边形卡片 + 扇形渐隐（中间最大最亮）*/
.ex-tut-ch{margin:14px 0;border:1px solid rgba(139,92,246,.28);border-radius:10px;padding:0;cursor:pointer;background:linear-gradient(100deg,rgba(139,92,246,.10),rgba(99,102,241,.18));transform:skewX(-10deg) scale(1);transform-origin:center center;transition:transform .2s ease,opacity .2s ease,box-shadow .2s ease;will-change:transform,opacity;box-shadow:0 6px 22px rgba(76,29,149,.20);}
.ex-tut-ch:hover{box-shadow:0 10px 32px rgba(124,58,237,.42);}
.ex-tut-ch .ex-tut-ch-inner{transform:skewX(10deg);display:flex;align-items:center;gap:14px;padding:14px 20px;}
.ex-tut-ch .ic{font-size:24px;flex:0 0 auto;}
.ex-tut-ch .tx{flex:1;min-width:0;}
.ex-tut-ch .tt{font-weight:700;font-size:15px;line-height:1.4;}
.ex-tut-ch .ds{font-size:12px;color:#a5b4fc;margin-top:3px;line-height:1.5;}
.ex-tut-ch .go{color:#c4b5fd;font-size:12px;font-weight:600;white-space:nowrap;}
.ex-tut-ch .lock{margin-left:auto;color:#94a3b8;font-size:13px;font-weight:600;white-space:nowrap;}
.ex-tut-ch .donebadge{margin-left:10px;color:#4ade80;font-size:12px;font-weight:600;white-space:nowrap;}
.ex-tut-ch.done{box-shadow:0 6px 22px rgba(34,197,94,.28);border-color:rgba(34,197,94,.5);}
.ex-tut-ch.locked{opacity:.34 !important;cursor:not-allowed;filter:grayscale(.7);transform:skewX(-10deg) scale(.82) !important;}
.ex-tut-ch.locked:hover{box-shadow:0 6px 22px rgba(76,29,149,.20);}
/* 巡游入口行保持原「虚线紫框普通行」样式，不参与平行四边形/扇形 */
.ex-tut-ch.ex-tour-ch{transform:none !important;opacity:1 !important;background:rgba(139,92,246,.04);}
body.light-mode .ex-tut-ch .ds{color:#5b21b6;}
body.light-mode .ex-tut-ch .go{color:#6d28d9;}
body.light-mode .ex-tut-ch .tt{color:#1e1b4b;}
body.light-mode .ex-tut-ch .lock{color:#64748b;}
/* 防护层改为独立顶层 layer：z 介于「全部应用 UI(≤10000)」与「教程卡片/聚光(2147483000)」之间。
   这样被教程引导点开的浮层只需临时抬到本层之上(见 tutElevatePopups)即可既不被压暗也不被拦截，
   而教程卡片/聚光始终在最上方、浮层关闭后防护层仍挡住其余外壳 UI。 */
.ex-tut-guards{position:fixed;inset:0;pointer-events:none;z-index:2147482000;}
.ex-tut-guard{position:absolute;background:rgba(8,6,26,.32);pointer-events:auto;}
body.light-mode .ex-tut-guard{background:rgba(30,27,75,.18);}
.ex-tut-card{z-index:20;}
/* 【已废弃】圆角底板 .ex-tut-card-bg：原用于遮挡卡片圆角处漏出的亮变量面板（亮角）。
   该 7px 同色环已并入 .ex-tut-card 自身的 box-shadow，无需第二个图层（见上方「脱影根治」注释）。
   规则保留为 display:none 兜底：即便有历史/残留代码创建了该元素，也不可能再参与绘制或拖尾。 */
.ex-tut-card-bg{display:none !important;}
/* ---- 打字对话：一次只显示一句话，点空白处换下一句（避免一次性糊一大片文字吓到用户） ---- */
.ex-tut-lines{display:flex;flex-direction:column;justify-content:center;min-height:3.1em;padding-right:2px;}
.ex-tut-line{font-size:calc(18px * var(--tut-ui));line-height:1.72;animation:exTutLineIn .26s ease;}
@keyframes exTutLineIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
.ex-tut-caret{display:inline-block;width:calc(8px * var(--tut-ui));height:calc(17px * var(--tut-ui));margin-left:calc(2px * var(--tut-ui));vertical-align:calc(-3px * var(--tut-ui));background:#a78bfa;border-radius:1px;animation:exTutCaret .8s steps(1) infinite;}
@keyframes exTutCaret{0%,49%{opacity:1;}50%,100%{opacity:0;}}
.ex-tut-hint{margin-top:calc(20px * var(--tut-ui) * 0.5);font-size:calc(27px * var(--tut-ui) * 0.5);color:#94a3b8;display:flex;align-items:center;gap:calc(12px * var(--tut-ui) * 0.5);user-select:none;}
.ex-tut-hint .tri{display:inline-block;animation:exTutBlink 1.15s ease-in-out infinite;}
.ex-tut-hint .pg{margin-left:auto;opacity:.85;font-variant-numeric:tabular-nums;}
@keyframes exTutBlink{0%,100%{opacity:.3;transform:translateX(0);}50%{opacity:1;transform:translateX(3px);}}
/* ---- 卡片右上角两个按钮：自动 / 菜单（小圆角斜切平行四边形 + 斜体粗字；
        自动点亮=黄底深棕字 + 右下角加深倒置三角 + 两颗白黄光点顺时针绕边框滚动、向内发光）
   ★2026-10-16 用户：「自动和菜单按钮的比例过大」⇒ 尺寸整体缩到原来的 ~62%：
        自动 140×67 → 88×42，菜单 124×67 → 78×42，字号 31 → 19.5，
        内边距/圆角/光点同步缩小；**形状与配色规则完全不变**（只等比缩小）。 ---- */
/* 灰色步骤标题已 display:none，这里用 margin-left:auto 保证按钮仍靠右 */
.ex-tut-tools{display:flex;align-items:center;gap:calc(12px * var(--tut-ui) * 0.6);margin-left:auto;}
.ex-tut-tool{pointer-events:auto;position:relative;cursor:pointer;border:none;font-family:inherit;padding:0;
  display:inline-flex;align-items:center;justify-content:center;
  border-radius:calc(7px * var(--tut-ui) * 0.6);overflow:hidden;
  /* 平行四边形：整体斜切，内部文字再反向斜切回正 */
  transform:skewX(-9deg);
  /* 半透明白（2026-10-12 用户要求「提高这两个按钮的透明度」）：卡片底板已改成透明，
     按钮继续用不透明白会显得突兀，故降到 ~52% 让背后的 3D 画面透出来 */
  background:rgba(253,253,255,.52);color:#22456e;box-shadow:0 2px 5px rgba(15,30,50,.3);
  transition:background .15s,color .15s,box-shadow .15s;}
.ex-tut-tool > span{display:block;position:relative;z-index:2;transform:skewX(9deg);font-weight:900;font-style:italic;letter-spacing:.08em;}
/* 顶部轻微高光（设计稿的亮面）：只作背景装饰、不挡文字 */
.ex-tut-tool::before{content:'';position:absolute;left:0;top:0;right:0;height:38%;pointer-events:none;z-index:0;
  background:linear-gradient(180deg,rgba(255,255,255,.32),rgba(255,255,255,0));}
/* 「自动」未开启：白底深蓝（形状/字号恒定，开关只换配色，绝不变形） */
.ex-tut-tool.auto{width:calc(88px * var(--tut-ui) * 0.6);height:calc(42px * var(--tut-ui) * 0.6);}
.ex-tut-tool.auto > span{font-size:calc(19.5px * var(--tut-ui) * 0.6);line-height:1;}
/* 已开启：黄底深棕字 + 底部立体薄边（无静态外发光——发光交给绕边滚动的光点）。
   渐变同步加透明度（与关闭态的 ~52% 一套口径），开启态略高（~72%→58%）以保持「点亮」辨识度 */
.ex-tut-tool.auto.on{background:linear-gradient(180deg,rgba(255,240,78,.78) 0%,rgba(255,213,20,.70) 58%,rgba(242,179,6,.64) 100%);
  color:#6b3d06;text-shadow:0 1px 0 rgba(255,255,255,.5);
  box-shadow:0 2px 0 #d99a00,0 2px 5px rgba(15,30,50,.3);}
/* 右下角加深倒置正三角装饰（仅点亮态；几何按设计稿逐像素实测：
   顶边水平、位于按钮高 65% 处；左上顶点在宽 ~81% 处；尖点落到底边 ~93.5% 宽，
   右侧超出部分由 overflow:hidden 沿斜边裁掉（与设计稿一致）。
   left/right 已补偿 skewX(-9°) 使最终渲染位置落在实测坐标上） */
.ex-tut-tool.auto.on::after{content:'';position:absolute;left:81.7%;right:-12.9%;top:65%;bottom:0;z-index:1;pointer-events:none;
  background:rgba(255,145,0,.36);
  clip-path:polygon(0 0,100% 0,50% 100%);}
/* 绕边框滚动的两颗白黄光点：顺时针沿边框跑，光晕向按钮中心发散（overflow:hidden 裁出圆角） */
.ex-tut-orb{display:none;position:absolute;z-index:1;pointer-events:none;width:calc(11px * var(--tut-ui) * 0.6);height:calc(11px * var(--tut-ui) * 0.6);
  transform:translate(-50%,-50%);border-radius:50%;
  background:radial-gradient(circle,#ffffff 0%,#ffef9e 42%,rgba(255,222,90,0) 72%);
  box-shadow:0 0 calc(6px * var(--tut-ui) * 0.6) calc(1.3px * var(--tut-ui) * 0.6) rgba(255,240,160,.85);}
.ex-tut-tool.auto.on .ex-tut-orb{display:block;animation:exTutOrbit 2.6s linear infinite;}
.ex-tut-tool.auto.on .ex-tut-orb.o2{animation-delay:-1.3s;}
@keyframes exTutOrbit{
  0%{left:0%;top:0%;}25%{left:100%;top:0%;}50%{left:100%;top:100%;}75%{left:0%;top:100%;}100%{left:0%;top:0%;}
}
/* 「菜单」按钮：同一套造型，半透明白底深藏青字（按设计稿，勿用深蓝底反白） */
.ex-tut-tool.alt{width:calc(78px * var(--tut-ui) * 0.6);height:calc(42px * var(--tut-ui) * 0.6);background:rgba(253,253,255,.52);color:#22456e;}
.ex-tut-tool.alt > span{font-size:calc(19.5px * var(--tut-ui) * 0.6);}
.ex-tut-tool.alt:hover{background:rgba(253,253,255,.72);}
/* ---- 「菜单」按下：先弹出两枚深灰蓝斜角低R角小按钮（左 ☰ 看对话列表 / 右 » 双箭头跳过本目）----
   挂在 #exTutRoot 内（继承 --tut-ui 缩放、且天然位于防护层与卡片之上），position:fixed 贴「菜单」按钮下方 */
.ex-tut-menu-pop{position:fixed;z-index:40;pointer-events:auto;display:flex;align-items:center;gap:calc(3.5px * var(--tut-ui));
  padding:calc(3px * var(--tut-ui)) calc(3.5px * var(--tut-ui));
  background:rgba(26,36,52,.85);border-radius:calc(4px * var(--tut-ui));
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  box-shadow:0 8px 20px rgba(0,0,0,.5);animation:exTutMenuPop .16s ease both;}
@keyframes exTutMenuPop{from{opacity:0;transform:translateY(-4px) scale(.95);}to{opacity:1;transform:none;}}
.ex-tut-mbtn{position:relative;cursor:pointer;border:none;font-family:inherit;padding:0;overflow:hidden;
  display:inline-flex;align-items:center;justify-content:center;
  width:calc(24px * var(--tut-ui));height:calc(15px * var(--tut-ui));
  /* 平行四边形：整体斜切，内部图标再反向斜切回正（与「自动/菜单」同口径） */
  border-radius:calc(3px * var(--tut-ui));transform:skewX(-9deg);
  background:linear-gradient(180deg,#43596f 0%,#35495e 52%,#2b3b4f 100%);
  color:#f3f7fc;box-shadow:0 1px 3px rgba(5,10,20,.5),inset 0 1px 0 rgba(255,255,255,.16);
  transition:background .15s,box-shadow .15s;}
.ex-tut-mbtn > span{display:flex;align-items:center;justify-content:center;position:relative;z-index:2;
  transform:skewX(9deg);font-weight:900;line-height:1;}
.ex-tut-mbtn:hover{background:linear-gradient(180deg,#51697f 0%,#3f566e 52%,#33465c 100%);}
.ex-tut-mbtn:active{box-shadow:0 1px 2px rgba(5,10,20,.5),inset 0 1px 0 rgba(255,255,255,.16);}
/* 左：三横杠（纯 CSS 三条，避免字体字形差异） */
.ex-tut-mbtn .bars{display:flex;flex-direction:column;gap:calc(1.5px * var(--tut-ui));}
.ex-tut-mbtn .bars > i{display:block;width:calc(7px * var(--tut-ui));height:calc(1.5px * var(--tut-ui));background:#f3f7fc;}
/* 右：双箭头（» 双 V 形，纯 CSS 两个 V 字 chevron，不用字体字形） */
.ex-tut-mbtn .gt{display:flex;align-items:center;gap:calc(1.3px * var(--tut-ui));}
.ex-tut-mbtn .gt > b{display:block;width:calc(3.8px * var(--tut-ui));height:calc(6.5px * var(--tut-ui));
  background:#f3f7fc;clip-path:polygon(0 0,100% 50%,0 100%,32% 50%);}
/* ---- 「菜单」面板：记录（按设计稿：平行四边形条 / 白描边标题 / 低多边形装饰） ---- */
.ex-tut-log-ov{position:fixed;inset:0;z-index:2147483300;display:flex;align-items:center;justify-content:center;
  padding:18px;background:rgba(28,40,60,.38);pointer-events:auto;}
.ex-tut-log{position:relative;width:min(600px,94vw);max-height:84vh;display:flex;flex-direction:column;
  background:#e9eaec;border:2px solid #1d3c60;border-radius:18px;overflow:hidden;
  box-shadow:0 24px 70px rgba(0,0,0,.45);color:#22303f;}
/* 低多边形扇形装饰（左上 / 右下）：同色系不同明度的三角扇面，避免单调 */
.ex-tut-log-deco{position:absolute;pointer-events:none;}
.ex-tut-log-deco.tl{left:0;top:0;width:140px;height:70px;z-index:0;}
.ex-tut-log-deco.br{right:0;bottom:0;width:170px;height:236px;z-index:1;}
.ex-tut-log-head{position:relative;z-index:3;flex:0 0 auto;display:flex;align-items:center;justify-content:center;
  padding:14px 48px 13px;overflow:hidden;background:linear-gradient(100deg,#dfe9f6 0%,#f4f7fb 46%,#fbfcfe 100%);}
.ex-tut-log-head .ttl{position:relative;z-index:1;font-size:20px;font-weight:900;-webkit-text-stroke:.8px #1f3a5f;color:#1f3a5f;letter-spacing:.16em;}
.ex-tut-log-head .ttl::after{content:'';position:absolute;left:50%;transform:translateX(-50%);
  bottom:-7px;width:54px;height:4px;border-radius:2px;background:#ffd21f;}
.ex-tut-log-x{position:absolute;right:10px;top:50%;transform:translateY(-50%);z-index:2;border:none;background:none;
  font-size:20px;line-height:1;color:#1f3a5f;cursor:pointer;padding:4px 9px;border-radius:8px;}
.ex-tut-log-x:hover{background:rgba(31,58,95,.12);}
.ex-tut-log-body{position:relative;z-index:2;flex:1;overflow:auto;padding:0 18px 22px;background:transparent;}
/* 章节 / 卡片标题：平行四边形 + 圆角 + 白字（无描边，文字正体） */
.ex-tut-log-chap{background:#2a4a72;color:#fff;font-size:19px;font-weight:800;letter-spacing:.03em;
  border-radius:11px;padding:12px 18px;margin:16px 0 10px;transform:skewX(-9deg);}
.ex-tut-log-chap>span{display:block;transform:skewX(9deg);}
.ex-tut-log-card{background:#2a4a72;color:#fff;font-size:13px;font-weight:700;letter-spacing:.02em;
  border-radius:9px;padding:8px 14px;margin:0 14px 13px;transform:skewX(-9deg);}
.ex-tut-log-card>span{display:block;transform:skewX(9deg);}
/* 对话气泡：平行四边形白卡 + 左侧小尾巴 */
.ex-tut-bub{position:relative;background:linear-gradient(180deg,#ffffff 0%,#ffffff 42%,#f1f1f3 100%);
  border-radius:14px;padding:11px 16px 14px;margin:0 0 16px 10px;transform:skewX(-9deg);
  box-shadow:0 3px 9px rgba(20,35,55,.13);}
.ex-tut-bub>.in{display:block;transform:skewX(9deg);}
.ex-tut-bub::before{content:'';position:absolute;left:-7px;top:20px;width:0;height:0;
  border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:9px solid #ffffff;}
.ex-tut-bub .lab{font-size:11px;color:#8b9aad;margin-bottom:3px;}
/* 正文取消斜体：去掉 skewX(-6deg) 斜切，文字保持正体（卡片/气泡的平行四边形外形仍由父级 skewX(-9deg) + 内部 span 反向 skew 抵消，与文字是否斜体无关） */
.ex-tut-bub .txt{font-size:16px;font-weight:700;line-height:1.6;color:#2a3b4d;}
.ex-tut-bub.pending{opacity:.42;}
/* ---- 巡游（开场模型巡游）：弹窗 + 勾选行 + 按钮 ---- */
#exTourOverlay{position:fixed;inset:0;z-index:2147483100;background:rgba(8,6,26,.68);pointer-events:auto;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;font-family:'EXRoundTut','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;}
body.light-mode #exTourOverlay{background:rgba(30,27,75,.35);}
.ex-tour-panel{width:min(560px,96vw);max-height:88vh;overflow:auto;background:rgba(18,16,38,.97);border:1px solid rgba(139,92,246,.45);border-radius:18px;color:#e6e8f5;padding:20px 22px;box-shadow:0 24px 80px rgba(0,0,0,.65);position:relative;}
body.light-mode .ex-tour-panel{background:rgba(252,251,255,.98);color:#1e293b;}
.ex-tour-panel h3{margin:0 0 5px;font-size:19px;line-height:1.5;padding-right:42px;display:flex;align-items:center;gap:8px;color:#c4b5fd;}
body.light-mode .ex-tour-panel h3{color:#6d28d9;}
.ex-tour-sub{font-size:12.5px;color:#94a3b8;line-height:1.7;margin:0 0 14px;}
.ex-tour-list{display:flex;flex-direction:column;gap:9px;}
.ex-tour-item{display:flex;align-items:center;gap:11px;border:1px solid rgba(139,92,246,.2);border-radius:12px;padding:10px 12px;cursor:pointer;background:rgba(139,92,246,.05);transition:background .15s,border-color .15s;}
.ex-tour-item:hover{background:rgba(139,92,246,.14);}
.ex-tour-item.on{border-color:rgba(167,139,250,.75);background:rgba(139,92,246,.16);}
.ex-tour-item .ic{flex:0 0 auto;display:inline-flex;align-items:center;color:#a78bfa;}
.ex-tour-item .tx{flex:1;min-width:0;}
.ex-tour-item .tt{font-weight:600;font-size:14px;line-height:1.45;}
.ex-tour-item .ds{font-size:12px;color:#94a3b8;margin-top:3px;line-height:1.55;}
.ex-tour-tick{flex:0 0 auto;width:20px;height:20px;border-radius:6px;border:1.5px solid rgba(139,92,246,.55);display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:#fff;background:transparent;transition:background .15s,border-color .15s;}
.ex-tour-item.on .ex-tour-tick{background:#8b5cf6;border-color:#8b5cf6;}
.ex-tour-foot{display:flex;align-items:center;gap:10px;margin-top:16px;}
.ex-tour-all{font-family:inherit;font-size:12.5px;color:#a78bfa;cursor:pointer;user-select:none;background:none;border:none;padding:4px 2px;}
.ex-tour-all:hover{text-decoration:underline;}
body.light-mode .ex-tour-all{color:#6d28d9;}
.ex-tour-sp{flex:1;}
.ex-tour-btn{cursor:pointer;border:none;font-family:inherit;font-size:13.5px;font-weight:700;border-radius:11px;padding:9px 16px;transition:background .15s,transform .1s;}
.ex-tour-btn:active{transform:scale(.97);}
.ex-tour-btn.ghost{background:rgba(139,92,246,.12);color:#c4b5fd;}
.ex-tour-btn.ghost:hover{background:rgba(139,92,246,.22);}
body.light-mode .ex-tour-btn.ghost{color:#6d28d9;}
.ex-tour-btn.go{background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;box-shadow:0 6px 18px rgba(124,58,237,.4);}
.ex-tour-btn.go[disabled]{opacity:.45;cursor:not-allowed;box-shadow:none;}
.ex-tour-x{position:absolute;top:10px;right:12px;z-index:2;cursor:pointer;border:none;background:none;color:#94a3b8;font-size:19px;line-height:1;padding:3px 8px;border-radius:9px;}
.ex-tour-x:hover{color:#f87171;background:rgba(248,113,113,.12);}
/* 「故事」目录弹窗里的巡游入口行（与章节行区分：虚线边框 + 紫色） */
.ex-tour-sep{display:flex;align-items:center;gap:10px;margin:16px 2px 8px;color:#7c7a99;font-size:12px;}
.ex-tour-sep i{flex:1;height:1px;background:rgba(139,92,246,.25);}
body.light-mode .ex-tour-sep{color:#94a3b8;}
body.light-mode .ex-tour-sep i{background:rgba(139,92,246,.2);}
.ex-tour-ch{border-style:dashed;border-color:rgba(167,139,250,.55);background:rgba(139,92,246,.1);}
.ex-tour-ch:hover{background:rgba(139,92,246,.2);}
.ex-tour-ch .ic{color:#a78bfa;}
.ex-tour-ch .go{color:#c4b5fd;font-weight:700;}
body.light-mode .ex-tour-ch .ic,body.light-mode .ex-tour-ch .go{color:#6d28d9;}
`;
    (document.head || document.documentElement).appendChild(st);
}
// ---- 章节内「目」划分：每章拆成若干目（目录页黄色文件夹标签），from/to 为步骤下标（含） ----
const TUT_SECTIONS = {
  0: [
    { n: '变量与界面名称', d: '变量就是方块的参数，改变量方块就跟着变。先认几个词：视图选中、方块列表选中、画布上的三根轴（位置 xpos / ypos / zpos）、三个环（旋转 xrot / yrot / zrot）、模式按钮、方块列表、数据面板、关键帧面板。', from: 0, to: 4 },
    { n: '切到旧模式', d: '旧操作模式就是变量编辑模式：底部是数据面板，每个变量只能填一个表达式，但可以直接填数字。', from: 5, to: 6 },
    { n: '局部位移', d: 'basepos 是局部位移，在方块自身的坐标系里挪动本体，枢轴不动；位置挪的是枢轴。画布会演示：basepos 有值时旋转连续变化，方块绕枢轴画圈。', from: 7, to: 7 },
    { n: '两层旋转', d: 'rotatex / y / z 是第二层旋转矩阵，rot 之后再转一次，也可以当全局旋转的工具变量用；欧拉角转换能把 rotate 换算成 rot。', from: 8, to: 9 },
    { n: '缩放', d: 'scale 是整体缩放，extend_* 沿方向拉长。', from: 10, to: 10 },
  ],
  1: [
    { n: '开启接管', d: 'molang 模式用一段程序接管方块的全部变量。点确定后右侧出现编辑器，里面是方块当前的全部变量，不是空白。', from: 0, to: 1 },
    { n: '分支与顺序', d: '条件赋值用 a ? b : c 按情况取值；同一个变量还能先后赋值，后写的覆盖先写的。', from: 2, to: 3 },
    { n: '编辑器进阶', d: '帮助按钮查函数；输入前缀自动弹候选；点数字弹微调泡泡；写错时精确标红到出错的那段字符。', from: 4, to: 7 },
    { n: '共享与查询', d: 't.xxx 是场景里所有方块共用的变量，骨骼跟随靠它；q. 系列是引擎每帧提供的实时数据；math. 是数学函数。', from: 8, to: 10 },
    { n: '骨骼跟随原理', d: '拆开看子块的跟随表达式怎么算：枢轴绑定用父块枢轴加旋转换算的偏移；basepos 绑定只把枢轴对齐到父块枢轴，模型位置由 basepos 常量补偿。最后转回普通方块收尾。', from: 11, to: 12 },
  ],
  2: [
    { n: '全新布局', d: '切到新操作模式：双列变量面板，左侧方块列表，画布上有 Gizmo 手柄。', from: 0, to: 1 },
    { n: 'Gizmo 总览', d: '位移 V、缩放 S、局部旋转 R、全局旋转 Shift+R、枢轴 P，这一目把工具栏认全。', from: 2, to: 2 },
    { n: '位移与缩放', d: '拖动三色箭头做位移，拖动角上小方点做缩放，教程会检测方块真的动了才放行。', from: 3, to: 4 },
    { n: '两种旋转', d: '局部旋转绕方块自身轴转，全局旋转绕枢轴转。两个都练一遍。', from: 5, to: 6 },
    { n: '枢轴进阶', d: '枢轴联动开启时拖枢轴，模型跟着平移；关掉联动再拖，模型不动，只有旋转中心移动。', from: 7, to: 9 },
    { n: '世界轴位移', d: '默认关闭。打开后位移箭头始终对齐世界的 X / Y / Z，不受方块自身旋转影响。最后三种模式小结收尾。', from: 10, to: 12 },
  ],
  3: [
    { n: '纯色', d: '材质决定方块的外观。纯色最简单：20 色调色板点一下就换，颜色会统一提高饱和度。', from: 0, to: 1 },
    { n: '预设与六面', d: '原版方块是现成的六面组合预设；六面独立贴图只用于在模拟器里看参考，原版 MC 的方块不支持六面不同贴图。', from: 2, to: 4 },
    { n: '上传与旗帜', d: '本地上传用自己的图片当贴图；旗帜用织布机生成图案，也可以直接上传图片。', from: 5, to: 6 },
  ],
  4: [
    { n: '认识关键帧', d: '关键帧记录时间点上的姿态，中间由模拟器插值。这一目打开关键帧窗口，认识时间轴和播放头。', from: 0, to: 1 },
    { n: '录制与播放', d: '先把方块加入动画，0 秒录一帧、1 秒录一帧，再点播放。', from: 2, to: 5 },
    { n: '时间轴', d: '拖播放头查看任意时刻的姿态；紫色滑条控制动画总时长。', from: 6, to: 7 },
    { n: '轨道与 molang', d: '一个方块一条轨道，多选后可以一起挪帧；molang 模式的方块也能录关键帧，手写的表达式会保留。', from: 8, to: 9 },
  ],
  5: [
    { n: '分组与骨干', d: '文件夹把方块组织起来；方块拖进文件夹后，模拟器自动把第一个方块设为骨干，后面的方块自动绑到骨干上。', from: 0, to: 2 },
    { n: '手动绑定', d: '紫色 ✛ 是把一个方块直接绑到另一个方块上，和文件夹骨骼是两件事。绑定可以选枢轴绑定或 basepos 绑定，也可以多选一起绑。', from: 3, to: 5 },
    { n: '骨骼树与跟随', d: '点子块行的「解绑」脱离父块；把方块拖出文件夹也会解除文件夹产生的绑定。嵌套文件夹自动组成骨骼树；子块位置每帧重新计算。', from: 6, to: 8 },
  ],
  6: [
    { n: '导出命令', d: '把模型变成 playanimation 指令，可加前缀后缀，也能直接导出成 .txt 文件。', from: 0, to: 2 },
    { n: '压缩与结构', d: '压缩导出把多条指令合并成一条；结构导出生成 .mcstructure 文件。', from: 3, to: 4 },
    { n: '导入', d: '粘贴指令变回模型；只识别 playanimation，其他指令跳过；还有覆盖型导入和临时覆盖型导入。', from: 5, to: 7 },
    { n: '互通与细节', d: '从外部链接一键导入；导出再导入骨骼和关键帧都不丢；导入时的自动改名与结果提示。', from: 8, to: 10 },
  ],
  7: [
    { n: '描点', d: '画笔模式在网格上打点，一个点是一个方块的角。这一目进入模式并放第一个点。', from: 0, to: 1 },
    { n: '成形', d: '两点生成矩形，三点生成平行四边形或三角形；绿点让形状的顶角落在已有方块的角上。', from: 2, to: 4 },
    { n: '批量粘贴', d: '一次导入一批点，铺平面时不用一个个点。', from: 5, to: 5 },
  ],
  8: [
    { n: '项目列表', d: '项目列表里是所有作品；新建一个项目开始做新模型。', from: 0, to: 1 },
    { n: '自动保存', d: '编辑时自动保存到浏览器本地，关闭、切换、退出项目前都会先保存。', from: 2, to: 2 },
    { n: '操作与备份', d: '保存、重命名、清空三种操作；退出项目的方法；临时项目不会自动保存，重要作品要另存 .txt。', from: 3, to: 5 },
  ],
  9: [
    { n: '多选批量', d: 'Ctrl 点选、手机长按、Ctrl 拖蓝框三种多选方式；选中多个后在批量面板里统一加减数值。', from: 0, to: 3 },
    { n: '批量改表达式', d: '批量改 molang 表达式：通配符、正则、纯文本三种匹配，改之前先看预览。', from: 4, to: 6 },
    { n: '一键换算', d: '常量化把表达式换成数字；欧拉角转换统一旋转口径；枢轴归位与数值检查器里的圆圈按钮。', from: 7, to: 9 },
  ],
  10: [
    { n: '布局与显示', d: '界面分类的布局设置，视图分类的灰度、折叠按钮、坐标轴显示。', from: 0, to: 1 },
    { n: '新模式专属', d: '新操作模式专属的开关和 Gizmo 拖拽步长。', from: 2, to: 3 },
    { n: '摄像机与快捷键', d: '摄像机坐标与视场角；快捷键分类；项目设置分组。', from: 4, to: 6 },
  ],
  11: [
    { n: '三大菜单', d: '文件菜单管导入导出，视图菜单管显示，操作菜单管设置与撤销。', from: 0, to: 2 },
    { n: '新建模型', d: '方块、平面、半砖、楼梯、旗帜五种类型；平面对话框与预设模板。', from: 3, to: 4 },
  ],
  12: [
    { n: '触摸操作', d: '手机和平板上的手势；虚拟 Shift / Ctrl 键补齐键盘修饰键。', from: 0, to: 1 },
    { n: '快捷键', d: '通用快捷键、操作模式切换、Gizmo 模式按键速查。', from: 2, to: 2 },
  ],
  13: [
    { n: '卡片与目录', d: '卡片一次讲一句，点空白推进；目录可以跳到任意章节，进度自动保存。', from: 0, to: 1 },
    { n: '记录与自动', d: '菜单按钮打开记录面板；自动模式让卡片自己往下走。', from: 2, to: 3 },
    { n: '巡游', d: '巡游把开场动画里的模型装进一个新项目，方便拆开看。', from: 4, to: 4 },
  ],
};
// ---- 目录页内联 SVG 素材（黄色文件夹标签 / 左右箭头 / 完成印章）----
const TUT_FOLDER_SVG = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M2.5 6.2A1.7 1.7 0 0 1 4.2 4.5h4.9l2.1 2.4h8.1a1.7 1.7 0 0 1 1.7 1.7v9.2a1.7 1.7 0 0 1-1.7 1.7H4.2a1.7 1.7 0 0 1-1.7-1.7z" fill="#ffc53d"/><path d="M2.5 9h19v1.6h-19z" fill="#eda93c"/></svg>';
const TUT_CHEV_L = '<svg viewBox="0 0 24 24" width="34" height="56"><path d="M16 3 6 12l10 9" fill="none" stroke="#4a86c6" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TUT_CHEV_R = '<svg viewBox="0 0 24 24" width="34" height="56"><path d="M8 3l10 9-10 9" fill="none" stroke="#4a86c6" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TUT_FILM_SVG = '<svg viewBox="0 0 24 24" width="15" height="15"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="#5b7ba6" stroke-width="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" stroke="#5b7ba6" stroke-width="1.6" fill="none"/></svg>';
const TUT_STAMP_STAR = '<svg viewBox="0 0 100 100" width="152" height="152"><path d="M50 4 62 36 96 38 69 59 79 93 50 72 21 93 31 59 4 38 38 36z" fill="#1d4e89" opacity=".88" transform="rotate(12 50 50)"/></svg>';
const TUT_STAMP_SEAL = '<svg viewBox="0 0 100 100" width="142" height="142"><g transform="rotate(-14 50 50)"><circle cx="50" cy="50" r="44" fill="rgba(255,255,255,.35)" stroke="#e23b3b" stroke-width="5"/><circle cx="50" cy="50" r="33.5" fill="none" stroke="#e23b3b" stroke-width="2.4" stroke-dasharray="5 3.5"/><text x="50" y="49" text-anchor="middle" font-size="20" font-weight="900" fill="#e23b3b" font-family="sans-serif">完成!</text><text x="50" y="67" text-anchor="middle" font-size="11" fill="#e23b3b" font-family="sans-serif">★ ★ ★</text></g></svg>';

// ---- 章节 SVG 图标（线性矢量图形，替代 emoji） ----
const EX_TUT_ICONS = {
    cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.6 20 7.1v9.8L12 21.4 4 16.9V7.1z"/><path d="M4 7.1l8 4.5 8-4.5M12 11.6v9.8"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    bone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.6" r="2.4"/><circle cx="5.4" cy="18.8" r="2.4"/><circle cx="18.6" cy="18.8" r="2.4"/><path d="M10.6 6.7 6.9 16.6M13.4 6.7l3.7 9.9"/></svg>',
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M10 8.7l6 3.3-6 3.3z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 20V13M10 20V7M15.5 20V10.5M20.5 20V4.5"/><path d="M3 20h18"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><circle cx="9" cy="10.6" r="1.5"/><path d="M3.5 15.5l4.8-4.3 4.2 3.4 3.2-2.8 4.8 4.2"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6.5h5m5 0h6M4 17.5h8m4 0h4"/><circle cx="12.5" cy="6.5" r="2.2"/><circle cx="15" cy="17.5" r="2.2"/></svg>'
};
function tutIconEl(name, px) {
    const span = document.createElement('span');
    span.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:' + (px || 18) + 'px;height:' + (px || 18) + 'px;';
    span.innerHTML = EX_TUT_ICONS[name] || '';
    return span;
}
// ---- 建 UI 骨架（幂等：每次进入都重建遮罩/高亮/卡容器，可反复开关） ----
let tutListenersOn = false;
// ---- 设置面板「新手教程」入口：页面加载即注入（不依赖教程是否打开过） ----
// 造型（2026-10-17 第 18 轮，用户反馈「教程入口太抢占视觉权重」）：降权为「紧凑单行条目」——
// 图标 + 标题 + 右侧小号描边按钮「开始 / 继续」，进度用 3px 细线；
// 不再用通栏紫罗兰实心大按钮 + 整条进度条（那是整个面板里唯一的彩色实心块，会把注意力全抓走）。
// 位置：作为「帮助」分类的分组（data-cat="help"），默认带 .ui-settings-cat-off 隐藏，不占首屏。
function ensureTutorialSettingEntry() {
    const sp = document.getElementById('uiSettingsPanel');
    if (!sp) return;
    if (document.getElementById('exTutSettingItem')) { try { tutRefreshSettingEntry(); } catch (e) {} return; }
    const box = document.createElement('div');
    box.id = 'exTutSettingItem';
    box.className = 'ui-settings-group ui-settings-cat-off';
    box.setAttribute('data-group', 'tutorial');
    box.setAttribute('data-cat', 'help');
    // 头部：图标 + 标题
    const head = document.createElement('div'); head.className = 'ui-settings-group-head';
    head.appendChild(tutIconEl('gear', 13));
    const ht = document.createElement('span'); ht.textContent = '新手教程 · 引导课';
    head.appendChild(ht);
    // 主体：紧凑单行（说明 + 右侧小按钮），下面一条 3px 细进度线
    const body = document.createElement('div'); body.className = 'ui-settings-group-body';
    const row = document.createElement('div'); row.className = 'ui-settings-item extut-row';
    const tx = document.createElement('span'); tx.className = 'extut-row-tx';
    tx.textContent = '指引式引导课：会新建一个项目，不影响您当前编辑的项目。';
    const btn = document.createElement('button'); btn.type = 'button';
    btn.className = 'extut-mini-btn'; btn.id = 'exTutEntryBtn';
    btn.textContent = '开始 / 继续';
    btn.addEventListener('click', (e) => { e.stopPropagation(); openTutorialOverview(); });
    row.appendChild(tx); row.appendChild(btn);
    const prog = document.createElement('div'); prog.className = 'extut-prog';
    const bar = document.createElement('div'); bar.className = 'extut-bar';
    const fill = document.createElement('i'); fill.id = 'exTutProgFill';
    bar.appendChild(fill); prog.appendChild(bar);
    body.appendChild(row); body.appendChild(prog);
    // 教程音效开关（用户 2026-10-16 要求：默认开启、设置里可关）
    const sfxRow = document.createElement('label');
    sfxRow.className = 'extut-sfx-row'; sfxRow.id = 'exTutSfxRow';
    const sfxBox = document.createElement('input'); sfxBox.type = 'checkbox'; sfxBox.id = 'exTutSfxToggle';
    sfxBox.checked = !!exTutSfxOn;
    const sfxTx = document.createElement('span'); sfxTx.className = 'extut-sfx-tx'; sfxTx.textContent = '教程音效';
    const sfxHint = document.createElement('span'); sfxHint.className = 'extut-sfx-hint'; sfxHint.textContent = '点击 / 切换 / 通关的提示音';
    sfxBox.addEventListener('change', () => {
        exTutSfxSetOn(sfxBox.checked);
        if (sfxBox.checked) { try { exTutSfxUnlock(); exTutSfx('select'); } catch (e) {} }
    });
    // 点整行也能切换（label 包裹 input 天然如此），但要点在文字上时也生效
    sfxRow.appendChild(sfxBox); sfxRow.appendChild(sfxTx); sfxRow.appendChild(sfxHint);
    body.appendChild(sfxRow);
    box.appendChild(head); box.appendChild(body);
    // 插到滚动区最前面（比 appendChild 到面板更靠前，位置也正确）
    const scroll = sp.querySelector('.ui-settings-scroll');
    if (scroll) scroll.prepend(box); else sp.appendChild(box);
    try { tutRefreshSettingEntry(); } catch (e) {}
}
// 进度回填：打开设置面板时刷新一次，教程完成/推进后回到设置能立刻看到进度变化
function tutRefreshSettingEntry() {
    const fill = document.getElementById('exTutProgFill');
    if (!fill) return;
    const s = tutLoad();
    const total = EX_TUT_CHAPTERS.length;
    const totalSteps = EX_TUT_CHAPTERS.reduce((a, c) => a + c.steps.length, 0);
    if (s.done) { fill.style.width = '100%'; return; }
    if (s.practiceId && typeof s.chapter === 'number') {
        const ci = Math.max(0, Math.min(total - 1, s.chapter));
        const doneSteps = EX_TUT_CHAPTERS.slice(0, ci).reduce((a, c) => a + c.steps.length, 0) + (s.step || 0);
        const pct = Math.max(4, Math.min(100, Math.round(doneSteps / totalSteps * 100)));
        fill.style.width = pct + '%';
        return;
    }
    fill.style.width = '0%';
}
// ★2026-10-17（用户反馈：教程没有限制用户可以使用哪些功能、点击哪些按钮 → 用户乱点导致方块/场景被改坏，后续无法交互卡关）：
// 防护层只能拦住「凹洞之外」的点击；但设置面板 / 各类模态浮层被主动抬到防护层之上（tutElevatePopups），
// 内部的所有控件都会漏点。这里补一层【捕获阶段的点击闸门】：只监管设置面板与模态浮层，
// 内部除「本步需要的控件」外一律拦截，从而把用户的操作范围锁死在本步之内。
function tutStepAllowSels() {
    const st = (EX_TUT_CHAPTERS[tutChapter] && EX_TUT_CHAPTERS[tutChapter].steps[tutStep]) || {};
    const out = [];
    if (st.target) out.push(st.target);
    if (st.thenTarget) out.push.apply(out, Array.isArray(st.thenTarget) ? st.thenTarget : [st.thenTarget]);
    if (st.pass) out.push.apply(out, Array.isArray(st.pass) ? st.pass : [st.pass]);
    return out;
}
function tutClickAllowed(el) {
    if (!el || !el.closest) return false;
    const st = (EX_TUT_CHAPTERS[tutChapter] && EX_TUT_CHAPTERS[tutChapter].steps[tutStep]) || {};
    const acts = Array.isArray(st.act) ? st.act : [];
    // 「操作模式切换」控件：任何步骤都不放行（除非本步的演示动作就是切模式）——这是卡关的头号原因
    if (el.closest('#newLayoutSetting') || el.closest('#newLayoutCheckbox')) {
        return acts.indexOf('toOldMode') >= 0 || acts.indexOf('toNewMode') >= 0;
    }
    const sels = tutStepAllowSels();
    for (let i = 0; i < sels.length; i++) {
        let t = null; try { t = document.querySelector(sels[i]); } catch (e) { t = null; }
        if (!t) continue;
        // 命中本步目标本身，或点在其内部（如目标是一个容器 / 一行里的任意位置）→ 放行
        if (t === el || t.contains(el)) return true;
    }
    return false;
}
function tutClickGate(e) {
    if (!tutActive) return;
    // 只拦「真实用户点击」：合成事件（element.click()，如程序内部调用 / 自动化脚本）isTrusted===false，
    // 放行它们不会削弱对用户的锁定，却能避免误伤应用自身的程序化点击与验收脚本。
    if (e.isTrusted === false) return;
    const el = e.target;
    if (!el || !el.closest) return;
    if (el.closest('#exTutRoot')) return;                 // 教程卡片自身永远可点
    const host = el.closest('#uiSettingsPanel, .modal'); // 只监管设置面板与模态浮层
    if (!host) return;                                    // 下拉菜单 / 材质菜单等小浮层保持原有放行
    if (tutClickAllowed(el)) return;
    try { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } catch (er) {}
}
function tutEnsureUI() {
    tutInjectCSS();
    let root = document.getElementById('exTutRoot');
    if (!root) { root = document.createElement('div'); root.id = 'exTutRoot'; document.body.appendChild(root); }
    root.innerHTML = '';
    const shade = document.createElement('div'); shade.className = 'ex-tut-shade';
    const spot = document.createElement('div'); spot.className = 'ex-tut-spot';
    root.appendChild(shade); root.appendChild(spot);
    tutUIReady = true;
    ensureTutorialSettingEntry();
    if (!tutListenersOn) {
        tutListenersOn = true;
        window.addEventListener('resize', () => { if (tutActive) { tutSyncBand(); tutLayout(); } });
        document.addEventListener('pointerdown', () => { if (tutActive) setTimeout(() => tutLayout(), 80); }, true);
        document.addEventListener('scroll', () => { if (tutActive) tutLayout(); }, true);
        // 教程进行中：把设置面板 / 模态浮层内的点击锁死在本步所需控件上（见 tutClickGate 注释）
        document.addEventListener('click', tutClickGate, true);
        // 教程进行中屏蔽破坏性快捷键：撤销/重做/删除，避免用户「瞎按」把预设模型搞乱
        document.addEventListener('keydown', (e) => {
            if (!tutActive) return;
            const t = (e.target && e.target.tagName) || '';
            const inField = /INPUT|TEXTAREA|SELECT/.test(t) || (e.target && e.target.isContentEditable);
            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); return; }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); return; }
            if (!inField && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); e.stopPropagation(); return; }
            // ★2026-10-17（用户反馈：教程没有限制用户在哪个模式 → 用户切走模式后本步的 UI/目标全部消失，导致无法交互卡关）：
            //   教程进行中屏蔽「切换操作模式」快捷键（Alt+N 新 / Alt+O、Ctrl+O 旧），除非本步的演示动作就是要切模式。
            //   注意必须拦在【捕获阶段】且早于下方 window/document 的模式切换监听（本监听为 document capture，先于 document bubble）。
            const _st = (EX_TUT_CHAPTERS[tutChapter] && EX_TUT_CHAPTERS[tutChapter].steps[tutStep]) || {};
            const _acts = Array.isArray(_st.act) ? _st.act : [];
            const _needSwitch = _acts.indexOf('toOldMode') >= 0 || _acts.indexOf('toNewMode') >= 0;
            const _k = (e.key || '').toLowerCase();
            const _isModeKey = (e.altKey && !e.ctrlKey && !e.shiftKey && (_k === 'n' || _k === 'o'))
                || (e.ctrlKey && !e.altKey && !e.shiftKey && _k === 'o');
            if (_isModeKey && !_needSwitch) { e.preventDefault(); e.stopPropagation(); try { e.stopImmediatePropagation(); } catch (e2) {} return; }
        }, true);
    }
}
// ---- 目标解析 / 可见性 ----
function tutTargetEl(sel) {
    if (!sel) return null;
    let el = null;
    try { el = document.querySelector(sel); } catch (e) {}
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r || r.width < 2 || r.height < 2) return null;
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    return el;
}
// 链式引导目标：thenTarget 是「一层层更深」的浮层（如 操作菜单 → 设置面板 → 画笔模式）。
// 取链中最后一个「当前可见」的元素作为聚光目标 —— 用户点开一级，聚光自动跟到下一级；
// 都没打开时回落到主 target，做到「点开之前指按钮、点开之后指下一步该点的东西」。
function tutActiveTargetEl(st) {
    if (!st) return null;
    const chain = Array.isArray(st.thenTarget) ? st.thenTarget : (st.thenTarget ? [st.thenTarget] : []);
    for (let i = chain.length - 1; i >= 0; i--) { const e = tutTargetEl(chain[i]); if (e) return e; }
    return tutTargetEl(st.target);
}
// 计算目标元素在「overflow 裁剪祖先 + 视口」约束下的可见矩形：
// 高亮框若直接用 el.getBoundingClientRect()，会把被滚动容器裁掉（不可见）的部分也框进去，
// 表现为「紫色引导框比变量列表的实际可见区更大、溢出到面板下方」。这里逐层与裁剪祖先的可见区
// 求交，使高亮框只覆盖用户真正能看到的范围。求不出可见区时返回 null（调用方回退到完整 rect）。
function tutVisibleRect(el) {
    const r = el.getBoundingClientRect();
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    // 裁剪框 = 所有裁剪祖先 ∩ 视口（不含元素自身）。用于把高亮环精确截断在滚动容器边界。
    let c1 = 0, c2 = 0, c3 = window.innerWidth, c4 = window.innerHeight;
    let p = el.parentElement;
    while (p && p !== document.documentElement && p !== document.body) {
        const cs = getComputedStyle(p);
        const clips = ['hidden', 'auto', 'scroll', 'clip'].includes(cs.overflow) ||
                      ['hidden', 'auto', 'scroll', 'clip'].includes(cs.overflowX) ||
                      ['hidden', 'auto', 'scroll', 'clip'].includes(cs.overflowY);
        if (clips) {
            const pr = p.getBoundingClientRect();
            if (pr.width > 0 && pr.height > 0) {
                x1 = Math.max(x1, pr.left); y1 = Math.max(y1, pr.top);
                x2 = Math.min(x2, pr.right); y2 = Math.min(y2, pr.bottom);
                c1 = Math.max(c1, pr.left); c2 = Math.max(c2, pr.top);
                c3 = Math.min(c3, pr.right); c4 = Math.min(c4, pr.bottom);
            }
        }
        p = p.parentElement;
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    x1 = Math.max(x1, 0); y1 = Math.max(y1, 0);
    x2 = Math.min(x2, vw); y2 = Math.min(y2, vh);
    if (x2 - x1 < 2 || y2 - y1 < 2) return null;
    return { left: x1, top: y1, width: x2 - x1, height: y2 - y1,
             clipLeft: c1, clipTop: c2, clipRight: c3, clipBottom: c4 };
}
// 高亮（边框框 + 防护层亮洞）统一使用的矩形：先把目标裁剪到可见区（含滚动容器裁剪），
// 再外扩一圈 padding，使「紫色边框框」与「可点亮洞」完全一致、同步截断。
// 关键：padding 只往「未被裁剪」的方向外扩；被裁剪的一侧紧贴裁剪边界并把它记录在 clip* 字段，
// 由 tutLayout 用 clip-path 把高亮环/光晕像素级截断在滚动容器边界（否则 ring 会溢出面板，看起来「没截断」）。
function tutHighlightRect(el) {
    const br = el.getBoundingClientRect();
    const vis = tutVisibleRect(el);
    if (!vis) return { left: br.left, top: br.top, width: br.width, height: br.height,
                       clipLeft: 0, clipTop: 0, clipRight: window.innerWidth, clipBottom: window.innerHeight };
    const base = Math.min(10, vis.height * 0.15 + 4);
    const padL = (br.left >= vis.left - 1) ? base : 0;   // 左侧被裁剪 → 不外扩
    const padT = (br.top >= vis.top - 1) ? base : 0;
    const padR = (br.right <= vis.left + vis.width + 1) ? base : 0;
    const padB = (br.bottom <= vis.top + vis.height + 1) ? base : 0;
    let L = vis.left - padL, T = vis.top - padT, R = vis.left + vis.width + padR, B = vis.top + vis.height + padB;
    // 无论是否被裁剪，环都不得超出裁剪框（条目贴边时同样截断在面板边界）
    L = Math.max(L, vis.clipLeft); T = Math.max(T, vis.clipTop);
    R = Math.min(R, vis.clipRight); B = Math.min(B, vis.clipBottom);
    if (R - L < 2 || B - T < 2) return { left: vis.left, top: vis.top, width: vis.width, height: vis.height,
                                        clipLeft: vis.clipLeft, clipTop: vis.clipTop, clipRight: vis.clipRight, clipBottom: vis.clipBottom };
    return { left: L, top: T, width: R - L, height: B - T,
             clipLeft: vis.clipLeft, clipTop: vis.clipTop, clipRight: vis.clipRight, clipBottom: vis.clipBottom };
}
// ---- 聚光框定位 v2：内嵌目标布局上下文（修手机 QQ 紫色引导框偏移）----
// 现象（用户实测）：手机 QQ 内置浏览器（XWeb 内核）打开模拟器，教程聚光框相对目标整体偏移；
// 桌面 QQ、桌面 Chrome/Edge、其他手机浏览器全部正常。
// 根因：旧实现用 getBoundingClientRect(el) 的【上报值】在 #exTutRoot（未缩放 fixed 层）里画框，
// 而本应用大量依赖 CSS zoom 做 UI 缩放（#uiScaleTarget / 设置面板都是 style.zoom），XWeb 对
// zoom 子树内元素的 gBCR 上报值与真实视觉位置存在偏差（页面本身渲染正确，仅坐标上报不准）
// → 框必然错位，且无论轮询还是点击重算都无法纠正（每次上报的都是同一个错误值）。
// 修复：让聚光框和目标活在同一个布局上下文里，用布局值（offsetLeft/offsetTop/offsetWidth/
// offsetHeight）定位——内核怎么渲染目标就怎么渲染框，结构上不可能错位：
//   ① 首选【offsetParent 模式】：框插进 el.offsetParent（必然与目标同一 zoom 上下文），
//      用 offsetLeft/offsetTop/offsetWidth/offsetHeight（布局值，非 gBCR）定位。
//      像 #varsContainer 这类「内容会被应用 innerHTML 重建」的目标也不受影响——框挂在宿主上，
//      不随目标子树重建而消失；宿主本身是滚动容器时还能原生跟随滚动 + 原生裁剪光晕。
//   ② 目标没有 offsetParent（fixed 元素等）且能容纳子元素 → 【子元素模式】：框插进目标自己
//      内部，inset:-pad 定位（必要时把目标临时提为 position:relative，摘框时还原）。
//   ③ 都不行 → 退回旧 gBCR 视口定位（未缩放顶层元素不受该内核差异影响）。
// 摘框（tutSpotDetach）时还原目标上临时的 position:relative 并把框移回 #exTutRoot。
const _SPOT_VOID_TAGS = { INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1, IMG: 1, IFRAME: 1, CANVAS: 1, VIDEO: 1, SVG: 1 };
let tutSpotViewportRect = null;  // 聚光框当前视口矩形（防护层挖洞复用，避免防护层用 gBCR 再算一遍产生偏差）
let tutSpotRectFor = null;       // 上述矩形对应的目标元素（换目标即失效）
function tutSpotAttach(spot, el) {
    try {
        const cs = getComputedStyle(el);
        const disp = cs.display || '';
        const canChild = !_SPOT_VOID_TAGS[el.tagName] && !disp.includes('table-row') && disp !== 'inline'
            && cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible';
        // ① 先找 el 与 body 之间最近的可滚动祖先：把框挂进它（或它内部更近的定位祖先），
        //    框随内容一起滚动、光晕被原生裁剪——不会出现「面板滚走了框还留在原地」。
        //    静态定位的滚动容器临时提为 relative（摘框时还原），让 offsetLeft/Top 以它为参照。
        let scrollAncestor = null;
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
            const st = getComputedStyle(n);
            if (st.overflowY === 'auto' || st.overflowY === 'scroll' || st.overflowX === 'auto' || st.overflowX === 'scroll') { scrollAncestor = n; break; }
        }
        const markRelative = (x) => {
            const ps = getComputedStyle(x).position;
            if ((ps === 'static' || ps === '') && x._tutPosSaved === undefined) {
                x._tutPosSaved = x.style.position || '';
                x.style.position = 'relative';
                (spot._tutPosRestores = spot._tutPosRestores || []).push({ el: x, val: x._tutPosSaved });
            }
        };
        if (scrollAncestor) markRelative(scrollAncestor);
        let host = null, mode = '';
        if (el.offsetParent) { host = el.offsetParent; mode = 'sibling'; }
        else if (canChild) { host = el; mode = 'child'; }
        if (!host) { tutSpotRectFor = null; return null; }
        // 子元素模式要求目标可为绝对定位子元素的包含块：static → 临时提为 relative
        // （相对定位不改变流内布局，摘框时还原），若目标本来就 positioned 则不动。
        if (mode === 'child') markRelative(el);
        if (spot._tutHost !== host) {
            tutSpotDetach(spot);          // 先还原上一个宿主（position 还原 + 框移回 root）
            host.appendChild(spot);
            spot._tutHost = host;
        }
        const pad = Math.max(4, Math.min(10, (el.offsetHeight || 40) * 0.15 + 4));
        if (mode === 'child') {
            spot.style.left = spot.style.top = spot.style.right = spot.style.bottom = (-pad) + 'px';
            spot.style.width = 'auto'; spot.style.height = 'auto';
        } else {
            spot.style.left = (el.offsetLeft - pad) + 'px';
            spot.style.top = (el.offsetTop - pad) + 'px';
            spot.style.right = 'auto'; spot.style.bottom = 'auto';
            spot.style.width = (el.offsetWidth + pad * 2) + 'px';
            spot.style.height = (el.offsetHeight + pad * 2) + 'px';
        }
        spot.style.display = 'block';
        // ★2026-10-17（用户反馈：明亮引导框溢出数据列表、把画布照亮）：
        // 内嵌模式此前**完全不裁剪** spot（clipPath=''），而 .ex-tut-spot 自带 16~26px 的紫色 box-shadow 光晕
        // + 6px outline —— 光晕会画到宿主容器之外、盖在深色防护层上，表现为「数据列表外/画布上冒出一条亮紫光带」。
        // 这里按最近裁剪祖先（数据面板的滚动容器）把光晕截断在面板边界内，与 tutLayout 的 clip-path 逻辑一致。
        try {
            const vis = tutVisibleRect(el);
            const vw0 = window.innerWidth, vh0 = window.innerHeight;
            const hasClip0 = (vis.clipLeft > 0 || vis.clipTop > 0 || vis.clipRight < vw0 || vis.clipBottom < vh0);
            if (hasClip0) {
                const sr0 = spot.getBoundingClientRect();
                const cl0 = (v) => Math.max(-48, v);
                const cT0 = cl0(vis.clipTop - sr0.top), cL0 = cl0(vis.clipLeft - sr0.left);
                const cR0 = cl0(sr0.right - vis.clipRight), cB0 = cl0(sr0.bottom - vis.clipBottom);
                spot.style.clipPath = 'inset(' + cT0 + 'px ' + cR0 + 'px ' + cB0 + 'px ' + cL0 + 'px)';
            } else spot.style.clipPath = '';
        } catch (e) {}
        // 记录聚光框的视口矩形（防护层挖洞 / 卡片判定用）。注意：在 gBCR 有偏差的内核上
        // 这个矩形同样有偏差，但它是「与防护层/卡片同一坐标系的上报值」，至少自洽；
        // 框本身的视觉位置已由内嵌定位保证正确。
        const sr = spot.getBoundingClientRect();
        tutSpotViewportRect = { left: sr.left, top: sr.top, width: sr.width, height: sr.height,
                                clipLeft: 0, clipTop: 0, clipRight: window.innerWidth, clipBottom: window.innerHeight };
        tutSpotRectFor = el;
        return tutSpotViewportRect;
    } catch (e) { tutSpotRectFor = null; return null; }
}
function tutSpotDetach(spot) {
    if (!spot) return;
    spot._tutHost = null;
    // 还原本轮内嵌期间所有被临时提为 relative 的元素（滚动容器 / 目标自身）
    const rs = spot._tutPosRestores || [];
    for (const r of rs) {
        try { r.el.style.position = r.val; } catch (e) {}
        delete r.el._tutPosSaved;
    }
    spot._tutPosRestores = [];
    const root = document.getElementById('exTutRoot');
    if (root && spot.parentNode !== root) { try { root.appendChild(spot); } catch (e) {} }
}
// ---- 布局：spot 高亮 + 卡片位置 ----
// ---- 卡片「贴顶 / 贴底」的稳定性控制（修「卡片上下瞬移」） ----
// 旧实现是单阈值硬切换：putTop = (目标底边 > 视口 58%)。而 tutLayout 会被
// render / 60ms / 260ms 回调、check 轮询（tutTick）、以及 **捕获阶段的 document scroll 监听**
// 反复调用；设置面板自动打开时 tutScrollSettingsTarget 用 behavior:'smooth' 平滑滚动，
// 目标底边在 58% 阈值附近来回穿越 → 若按「单阈值硬切」会**无过渡地反复瞬移**
// （用户反馈：「为什么这个卡片总是上下瞬移啊，例如自动打开设置的时候」）。
// 「粘性锁侧」方案又会**永远贴住一侧**（目标低时卡片在顶部永不遮挡、永远不会翻回）→ 已弃用。
// 现改为「时间阈值法 + 矩形稳定性冻结」：
//   · 原始判据 rawTop = 目标底边 > 视口高 58% 保留，但**不再即时翻边**；
//   · 连续「判定贴顶」超过 TUT_TOP_HOLD(ms) 才真正贴顶（tutTopSince 累计）；贴顶后判据消失 → 缓动回下方；
//   · 任一刻不再判贴顶 → 立即回到「默认贴底」（tutTopSince 清零）；已贴顶也缓动回下方；
//   · 无聚光目标(r=null) → 保持当前侧，不强行拽动（避免浮层开合时卡片滑动）。
//   · **矩形稳定性冻结（修偶发「双重跳变」）**：旧实现只冻结「滚动中」，但设置步/弹窗的
//     面板是 CSS transition 滑入的——**不产生任何滚动事件**，目标 rect 仍会每帧穿越 58% 线，
//     于是卡片会「先贴顶、面板滑完又落回下方」= 卡片上下移动两次。现改为直接比对两次布局间
//     目标矩形是否移动：只要目标还在动（面板滑入 / 平滑滚动 / 模态动画 / 浮层开合），就冻结
//     当前侧不翻边；等目标稳定 TUT_RECT_SETTLE(ms) 后再按**最终落点**判定一次。对滚动/滑入统一生效。
//   · **新建卡片首帧保持上一步侧 + 稳定后即时落位（tutCardFresh / tutFreshPending）**：
//     tutRender 每步重建卡片并继承上一步侧(prevSide)。注意**首帧不能按 rect 落位**——此刻目标
//     可能还在动画中（面板刚开滑 / tutRecoverEnv 改布局），且无前帧可比对其是否在动，按瞬态 rect
//     判定会让卡片「在贴合下方时转场闪现到最上方再落回」= 闪烁（用户反馈）。故首帧默认返回 prevSide
//     （tutCardFresh）；**但若能证明目标此刻已就位**（无待滚入可见区的目标 tutAwaitScroll、且元素及
//     祖先无正在运行的有限动画 tutEnvAnimating）→ 首帧直接落正确侧，转场不再有那一下滑动。
//     证明不了才推迟到「目标稳定后」：由 tutFreshPending 让首次稳定判定直接落正确侧
//     并把 tutTopSince 置为已满足(now-TUT_TOP_HOLD)，既无 350ms 空等、又防回落双跳。
//     若目标在首帧后仍在动（面板滑入），tutRectIsMoving 会持续冻结在 prevSide，落定后再判。
//   · **设置面板目标「待滚入可见区」冻结（tutAwaitScroll）**：进入设置步时 tutRender 在 +300ms 才
//     调 tutScrollSettingsTarget 平滑滚动目标入可见区；但 +260ms 那次 layout 会先按目标**滚动前**的
//     位置判一次（目标多在折叠线下方 → 判成贴顶），滚动完目标落到 58% 线另一侧 → 卡片再翻回来
//     = 又一次上下移动。故滚动发出前一律冻结当前侧，滚动时把稳定性计时清零交给矩形冻结接管。
//   · **目标不可见(在折叠线下方/上方)→ rawTop 提前判 false**：同样避免进入设置步时下方目标提前触发贴顶。
// 翻边靠 CSS transition:transform 缓动完成（.top/.bot 只改 translateY，不再改 top/bottom），
// 因此「上方↔下方」是平滑位移而非瞬移；exTutPop 入场动画只在新建卡片时播放一次。
let tutTopSince = 0;                            // 连续判定「贴顶」的起始时间(performance.now)，非贴顶时为 0
let tutLastRect = null;                         // 上一次布局采到的目标矩形（用于判定目标是否仍在移动）
let tutRectStableSince = 0;                     // 目标矩形「稳定(位置不再变化)」的起始时间(performance.now)
let tutCardFresh = false;                       // 当前卡片是刚新建的步骤卡片：首帧保持上一步侧，待目标稳定后再判（防转场闪现到错误侧）
let tutFreshPending = false;                    // 新鲜卡片首帧已冻结在 prevSide，待目标稳定后首次判定直接落正确侧（免 350ms 空等、且防回落双跳）
// ---- 设置面板目标的「待滚入可见区」冻结（修「进入设置步时卡片先贴顶再落回下方」）----
// 进入设置步时 tutRender 会在 +300ms 才调 tutScrollSettingsTarget 做 behavior:'smooth' 平滑滚动，
// 但卡片在 +260ms 那次 tutLayout 就会按目标**滚动前的位置**判定（该类目标常在折叠线下方 → 判成贴顶）。
// 平滑滚动随后把它滚到 58% 线另一侧 → 目标落定后卡片又翻回下方 = 又一次上下移动（用户反馈的「飞来飞去」）。
// 滚动本身会持续改变目标 rect，矩形稳定性冻结能接住；问题只在**滚动开始之前**那 ~300ms 提前判了。
// 故：滚动发出前一律冻结当前侧（tutAwaitScroll），滚动发出时把稳定性计时清零交给矩形冻结接管。
let tutAwaitScroll = false;                     // 本步有「设置面板内目标待滚入可见区」→ 冻结贴顶/贴底判定，等滚动发出并落定
let tutScrollTimer = null;                      // 上述延迟滚动的定时器（切步/关教程时要清，避免旧定时器污染新步）
const TUT_TOP_HOLD = 350;                       // 时间阈值(ms)：raw 判据持续贴顶超过此值才真正贴顶，否则默认贴底
const TUT_RECT_MOVE_EPS = 4;                    // 像素阈值：目标矩形相对上次位移超过此值即视为「仍在移动」(面板滑入/平滑滚动/模态动画)
const TUT_RECT_SETTLE = 200;                    // 目标稳定多久后才允许重新判定贴顶(ms)：移动期间冻结当前侧，不翻边
function tutRawWantsTop(r) {
    if (!r) return false;
    // 目标不在可见区（多被滚动容器挡在下方/上方）→ 视为「不贴顶」：
    // 否则进入设置步时目标在折叠线以下、scrollIntoView 平滑滚到中央前会先判成「贴顶」→ 滚完又落回下方 = 偶发双重跳变(上下两次)
    if (r.top >= window.innerHeight || (r.top + r.height) <= 0) return false;
    return (r.top + r.height) > window.innerHeight * 0.58;
}
// 目标矩形是否仍在移动（CSS 滑入 / 平滑滚动 / 模态动画都会让它每帧变化）→ 移动中冻结、不翻边
function tutRectIsMoving(r, now) {
    if (!tutLastRect) { tutLastRect = { l: r.left, t: r.top, w: r.width, h: r.height }; return false; }
    const moved = Math.abs(r.top - tutLastRect.t) > TUT_RECT_MOVE_EPS
               || Math.abs(r.left - tutLastRect.l) > TUT_RECT_MOVE_EPS
               || Math.abs(r.width - tutLastRect.w) > TUT_RECT_MOVE_EPS
               || Math.abs(r.height - tutLastRect.h) > TUT_RECT_MOVE_EPS;
    if (moved) { tutLastRect = { l: r.left, t: r.top, w: r.width, h: r.height }; tutRectStableSince = 0; return true; }
    if (!tutRectStableSince) tutRectStableSince = now;
    return (now - tutRectStableSince) < TUT_RECT_SETTLE;
}
// 目标元素自身或任一祖先元素上是否有「正在运行的有限动画/过渡」（面板滑入、模态动画、菜单展开…）。
// 无限动画（光标闪烁、装饰脉动）不算——否则会永远判「在动」而永不落位。
function tutEnvAnimating(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
        let p = el, guard = 0;
        while (p && p.nodeType === 1 && guard++ < 40) {
            const anims = p.getAnimations ? p.getAnimations() : [];
            for (const a of anims) {
                if (!a || a.playState !== 'running') continue;
                let inf = false;
                try { const ct = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null; inf = !!(ct && ct.iterations === Infinity); } catch (e2) {}
                if (!inf) return true;
            }
            if (p === document.body || p === document.documentElement) break;
            p = p.parentElement;
        }
    } catch (e) {}
    return false;
}
function tutDesiredSide(r, curSide, el) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // 新建卡片首帧：此刻目标可能还在动画中（无前帧可比对是否在动），绝不能按瞬态 rect 直接落位，
    // 否则转场时目标若暂处上方区域会被判「贴顶」→ 卡片闪现到最上方再落回（用户反馈的闪烁）。
    // 但若此刻能**证明目标已就位**（无待滚入可见区的目标、元素及祖先也没有正在跑的动画/过渡），
    // 就直接按当前 rect 落正确侧 —— 卡片从第一帧起就在正确一侧，转场不会再有那一下滑动。
    // 证明不了（设置步待滚动 / 面板正在滑入）就保持上一步侧(prevSide)，等目标落定后再判。
    if (tutCardFresh) {
        tutCardFresh = false;
        if (r) tutLastRect = { l: r.left, t: r.top, w: r.width, h: r.height };
        tutRectStableSince = 0;
        if (r && !tutAwaitScroll && !tutEnvAnimating(el)) return tutRawWantsTop(r) ? 'top' : 'bot';
        return curSide;
    }
    if (!r) return curSide;                     // 无目标 → 保持当前侧（避免浮层开合时卡片滑动）
    // 设置面板目标尚未被滚入可见区（tutScrollSettingsTarget 还没发出）→ 冻结：此刻的 rect 是
    // 滚动前的瞬态位置，据此判定必然会被随后的平滑滚动推翻（= 卡片先按旧位置翻一次、滚动完再翻回来）
    if (tutAwaitScroll) return curSide;
    // 目标仍在移动（面板滑入 / 平滑滚动 / 模态动画 / 浮层开合）→ 冻结：保持当前侧，不翻边
    // （修「偶发双重跳变」：面板滑入不产生滚动事件，旧滚动冻结抓不到，目标会穿越 58% 两次）
    if (tutRectIsMoving(r, now)) return curSide;
    const rawTop = tutRawWantsTop(r);
    if (rawTop) {
        // 新鲜卡片稳定后首次判定：直接落正确侧且把「贴顶计时」置为已满足——既无 350ms 空等，又防回落双跳
        if (tutFreshPending) { tutFreshPending = false; tutTopSince = now - TUT_TOP_HOLD; return 'top'; }
        if (!tutTopSince) tutTopSince = now;
        // 满足时间阈值才「贴顶」，否则维持默认贴底（让平滑滚动/滑入短暂穿越 58% 不触发翻边）
        return (now - tutTopSince >= TUT_TOP_HOLD) ? 'top' : 'bot';
    }
    tutTopSince = 0; tutFreshPending = false;    // 不再判贴顶 → 清零并回到贴底
    return 'bot';
}
function tutPlaceCard(card, r, el) {
    if (!card) return;
    // ★2026-10-17（用户：卡片「位置不稳定、随意浮动」）：
    // 改为**恒定贴底**，不再按目标位置在 top/bot 间翻边。位置完全由 CSS 的 bottom:14px 锚定，
    // 此处只把历史类名统一成 bot（兼容旧代码里对 .top/.bot 的读取），r/el 参数保留仅为签名兼容。
    card.classList.remove('top'); card.classList.add('bot');
}
// 教程卡片跟随「设置→UI缩放」：把原始倍率写进 #exTutRoot 的 --tut-ui（CSS 乘算，各部分再按自身影响倍率缩放，见 CSS）。
// 之前卡片挂在 #exTutRoot、逃过了 #uiScaleTarget 的 zoom → UI 缩放对它完全无效；现改为独立 --tut-ui 跟随。
// 原始倍率 uiZoom 范围 0.5~2.0（与滑块一致），此处只做区间兜底、不额外封顶——
// 文本/卡片按 100% 跟随（宽度由 94vw 兜底防溢出），按键 60% / 章节 70% / 提示 50% 已自带收敛。
const TUT_UI_MIN = 0.5, TUT_UI_MAX = 2.0;
function tutSyncScale() {
    const root = document.getElementById('exTutRoot');
    if (!root) return;
    const z = (typeof getUiZoom === 'function') ? getUiZoom() : 1;
    const s = Math.max(TUT_UI_MIN, Math.min(z, TUT_UI_MAX));
    root.style.setProperty('--tut-ui', String(s));
    try { tutSyncBand(); } catch (e) {}   // UI缩放变化 → 底部预留带随之重算
}
// ★2026-10-17（用户）：教程进行时在屏幕底部预留一条完全空旷的带（--tut-band），把面板/工具栏向上让位，
// 让恒定为贴底的教程卡片无遮挡显示；教程结束还原为 0px，UI 完全回到既有布局。
function tutSyncBand() {
    const rs = document.documentElement.style;
    if (!tutActive) { rs.setProperty('--tut-band', '0px'); return 0; }
    const z = (typeof getUiZoom === 'function') ? getUiZoom() : 1;
    const s = Math.max(TUT_UI_MIN, Math.min(z, TUT_UI_MAX));
    const vh = window.innerHeight || 800;
    const band = Math.round(Math.min(168 * s, vh * 0.30));
    if (rs.getPropertyValue('--tut-band') !== band + 'px') rs.setProperty('--tut-band', band + 'px');
    return band;
}
// 教程开关统一入口：切 body.ex-tut-on class（驱动 .top-bar/.top-left-bar 贴顶）并同步底部预留带。
function tutSetDock(on) {
    tutActive = !!on;
    try { document.body.classList.toggle('ex-tut-on', tutActive); } catch (e) {}
    try { tutSyncBand(); } catch (e) {}
}
// 卡片尺寸会变（打字逐步显字、状态条/按钮后出现、UI 缩放改变 --tut-ui）→
// --tut-bot-shift 必须在「当前高度」下重算，否则贴底会算旧值、卡片底部溢出视口。
// 用 ResizeObserver 监听卡片尺寸变化即时重排（transform 变化不触发 resize，不会死循环）。
let tutCardRO = null;
function tutObserveCard(card) {
    try {
        if (tutCardRO) { tutCardRO.disconnect(); tutCardRO = null; }
        if (!card || typeof ResizeObserver === 'undefined') return;
        tutCardRO = new ResizeObserver(() => { try { tutLayout(); } catch (e) {} });
        tutCardRO.observe(card);
    } catch (e) {}
}
// ★★聚光框自愈（2026-10-16 修「后面几章没有引导框」）：
// tutSpotAttach 会把 .ex-tut-spot **移出 #exTutRoot**、内嵌进目标的宿主元素（如 .ui-settings-scroll /
// panelContent / outliner-actions / toolbar-integrated）。一旦教程推进导致该宿主被 App 重渲染
// （renderSideBlockList() / applyNewLayoutMode() 会重建其 innerHTML），宿主连同聚光框一起被销毁
// ⇒ 下面 querySelector('.ex-tut-spot') 得到 null ⇒ spot.style / spot.classList 抛 TypeError
// ⇒ tutLayout 永久中断；而聚光框只在 tutEnsureUI()（开课时）创建一次 ⇒ **此后所有步骤都没有引导框**
// （用户报「后面好几个章节既没有引导框」的真根因，实测在第 3 章 step2 首次触发）。
// 这里每次布局都检查一次：丢了 / 被销毁了就就地重建并挂回 root，保证后续步骤照常有框。
function tutEnsureSpotEls(root) {
    let shade = root.querySelector('.ex-tut-shade');
    if (!shade) { shade = document.createElement('div'); shade.className = 'ex-tut-shade'; root.appendChild(shade); }
    let spot = document.querySelector('.ex-tut-spot');
    // 丢失 或 已从文档树脱落（宿主被重建）⇒ 重建/回收
    if (!spot || !spot.isConnected) {
        if (spot && spot.parentNode) { try { spot.parentNode.removeChild(spot); } catch (e) {} }
        spot = document.createElement('div'); spot.className = 'ex-tut-spot';
        root.appendChild(spot);
    }
    return { shade, spot };
}
function tutLayout() {
    if (!tutActive || !tutUIReady) return;
    const root = document.getElementById('exTutRoot'); if (!root) return;
    const ch = EX_TUT_CHAPTERS[tutChapter], st = ch.steps[tutStep];
    const _els = tutEnsureSpotEls(root);
    const shade = _els.shade, spot = _els.spot;
    if (!spot || !shade) return;
    // 链式目标：用户点开浮层后，聚光自动跟到浮层里「下一步该点的那个东西」
    let el = tutActiveTargetEl(st);
    // 已打开全屏浮层(.modal) 且目标在其后方（浮层之外）时，继续把聚光框画在浮层之上会造成层级错乱
    // → 先收起聚光框；浮层关闭后 watcher 会重排（tutLayout）自动恢复。
    if (el && tutGuideModalVisible() && !(el.closest && el.closest('.modal'))) el = null;
    if (el) {
        let r;
        // 聚光框 v2：优先内嵌进目标的布局上下文（tutSpotAttach，免疫 QQ/XWeb 等内核对
        // CSS zoom 子树内 gBCR 的上报偏差——手机 QQ 上紫色框整体偏移的修复）。
        // 返回聚光框当前视口矩形（框自身的 getBoundingClientRect），供卡片贴顶/贴底判定复用；
        // 内嵌失败（目标无 offsetParent 等）才退回旧的 gBCR 视口定位。
        // ★tutSpotAttach 会把 spot 移进宿主；若期间宿主被重渲染，spot 会失效 ⇒ 重新取一次。
        let vr = null;
        try { vr = tutSpotAttach(spot, el); } catch (e) {}
        if (!spot.isConnected) {
            const _e2 = tutEnsureSpotEls(root); spot = _e2.spot;
            try { vr = tutSpotAttach(spot, el); } catch (e) {}
        }
        if (vr) {
            r = vr;
            // ★2026-10-17：**不要**在这里清空 clipPath！tutSpotAttach 内嵌定位时会按最近裁剪祖先
            // （数据面板的滚动容器）算好 inset 裁剪；此处清空会让发光/虚线重新溢出面板、照亮画布
            // （用户反馈的「明亮引导框超出数据列表」正是被这行清掉的）。裁剪由 tutSpotAttach 负责。
        } else {
            r = tutHighlightRect(el); // 裁剪到可见区（含滚动容器），边框框与亮洞同步截断
            spot.style.display = 'block';
            spot.style.left = r.left + 'px'; spot.style.top = r.top + 'px';
            spot.style.width = Math.max(r.width, 8) + 'px'; spot.style.height = Math.max(r.height, 8) + 'px';
            // clip-path 把高亮环 + 发光 + 虚线 outline 一并像素级截断在滚动容器边界：
            // inset 用「裁剪框相对 spot 框」的有符号偏移（负值 = 把裁剪形状外扩到滚动容器边界，
            // 光晕只能在面板内晕开、不会再溢出到面板外）；无裁剪祖先（clip 框 = 视口）时不裁剪。
            const vw2 = window.innerWidth, vh2 = window.innerHeight;
            const hasClip = (r.clipLeft > 0 || r.clipTop > 0 || r.clipRight < vw2 || r.clipBottom < vh2);
            if (hasClip) {
                const cl = (v) => Math.max(-48, v);
                const cT = cl(r.clipTop - r.top), cL = cl(r.clipLeft - r.left);
                const cR = cl((r.left + r.width) - r.clipRight), cB = cl((r.top + r.height) - r.clipBottom);
                spot.style.clipPath = 'inset(' + cT + 'px ' + cR + 'px ' + cB + 'px ' + cL + 'px)';
            } else spot.style.clipPath = '';
        }
        try { spot.classList.add('show'); } catch (e) {}
        try { shade.classList.remove('dim'); } catch (e) {}
        // 卡片贴顶/贴底：交给 tutPlaceCard（时间阈值法，避免平滑滚动穿越 58% 阈值时上下瞬移）
        const card = root.querySelector('.ex-tut-card');
        if (card) tutPlaceCard(card, r, el);
    } else {
        try { tutSpotDetach(spot); } catch (e) {}
        try { spot.classList.remove('show'); } catch (e) {}
        try { shade.classList.add('dim'); } catch (e) {}
        // 无聚光目标时不再无条件拽回底部——保持当前侧，避免「浮层开合 → 卡片跳一下」
        const card = root.querySelector('.ex-tut-card');
        if (card) tutPlaceCard(card, null, null);
    }
    tutUpdateGuard();
}
// ---- 教程点击防护：非允许区域（聚光目标 / 3D 画布 / 教程卡 / 引导浮层 之外）一律拦截，杜绝用户「瞎按」破坏预设 ----
// 教程会引导用户点开的「浮层」白名单：下拉菜单 / 设置面板 / 材质菜单 / 新建方块菜单 / 关键帧窗口。
// 防护层必须为它们让路，否则这些浮层会被压在教程层之下——表现为「整体发暗 + 点不动」的 UI 层级错误
// （用户反馈：第 2 节打开「选择方块类型」后既点不了、又被压暗）。
// 注意：#actionMenuBtn(操作) 与 #uiSettingsBtn(⚙) 必须放行——它们是「打开设置面板」的入口，
// 若被防护层挡住，用户在本步就无法手动开启设置面板（之前的根因：面板关闭时无聚光洞、且入口按钮被挡）。
const TUT_PASS_SEL = '#actionMenuBtn, #fileMenuBtn, #viewMenuBtn, #uiSettingsBtn, #uiSettingsPanel, .ui-settings-close, #keyframeWindow, #viewDropdown, #actionDropdown, #fileDropdown, #outlinerToolsMenu, .view-toggle-btn, #localRotMenuBtn, #globalRotMenuBtn, #localRotDropdown, #globalRotDropdown, .material-menu, .modal';
let tutGuardTimer = null;
let tutLastGuideModal = false;
function tutGuardWatchStop() { if (tutGuardTimer) { clearInterval(tutGuardTimer); tutGuardTimer = null; } }
function tutGuardWatch() {
    if (tutGuardTimer || !tutActive) return;
    // 浮层（下拉 / 设置面板 / 新建方块菜单）开合随时在变，只在渲染那一刻算一次抓不全：
    // 教程进行中低频重算防护层；「大浮层(.modal)」开合时同步重排一次聚光框。
    tutGuardTimer = setInterval(() => {
        if (!tutActive) { tutGuardWatchStop(); return; }
        // ★2026-10-17（用户反馈：教程没限制用户处于哪个模式 → 切走后目标消失、卡关）：
        //   「模式锁定」放在这个**始终运行**的守卫循环里（每 260ms），而不是只在 canvas/toolbar 步才跑的
        //   tutTick 轮询里——否则纯阅读步被用户切了模式就没人扳正了。只做模式扳正，无重副作用。
        try {
            const _c = EX_TUT_CHAPTERS[tutChapter], _s = _c && _c.steps[tutStep];
            if (_s) tutEnsureMode(_s);
        } catch (e) {}
        try {
            const mo = tutGuideModalVisible();
            if (mo !== tutLastGuideModal) { tutLastGuideModal = mo; tutLayout(); }
            else {
                // 260ms 兜底重排：部分内核（如手机 QQ/XWeb）滚动/过渡期间不派发 scroll 事件，
                // 聚光框/防护层会停留在旧位置；tutLayout 内部含矩形稳定性冻结，高频重排安全，
                // 且末尾会调 tutUpdateGuard，防护层随之同步。
                if (tutUIReady) tutLayout();
                else tutUpdateGuard();
            }
        } catch (e) {}
    }, 260);
}
// 被教程引导点开的浮层，临时抬到防护层之上（但仍在教程卡片/聚光之下），从根本上杜绝
// 「被防护层压暗 + 点不动」的 UI 层级错误。原 z-index 存入 tutElevated，关闭/退出时还原。
const EX_TUT_POPUP_Z = 2147482500;
const tutElevated = new Map();
function tutElevatePopups() {
    try {
        const list = document.querySelectorAll(TUT_PASS_SEL);
        const visible = new Set();
        list.forEach(p => {
            const cs = getComputedStyle(p);
            if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.05) return;
            const r = p.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return;
            visible.add(p);
            if (!tutElevated.has(p)) { tutElevated.set(p, p.style.zIndex || ''); p.style.zIndex = String(EX_TUT_POPUP_Z); }
            // ★2026-10-22：浮层自己的定位函数会把 z-index 写回原值（positionUISettingsPanel 在
            //   resize / 重新打开设置面板时写 fixed 面板的 9999），而 Map 里仍记着「已抬升」⇒ 永不重抬
            //   ⇒ 面板掉到防护层（2147482000）之下，整体被压暗且关闭键点不动（用户报的 molang 关卡卡死）。
            //   这里每轮校对一次，被覆盖就立刻写回。
            else if (p.style.zIndex !== String(EX_TUT_POPUP_Z)) { p.style.zIndex = String(EX_TUT_POPUP_Z); }
        });
        tutElevated.forEach((orig, p) => { if (!visible.has(p)) { try { p.style.zIndex = orig; } catch (e) {} tutElevated.delete(p); } });
    } catch (e) {}
}
function tutElevateRestoreAll() {
    tutElevated.forEach((orig, p) => { try { p.style.zIndex = orig; } catch (e) {} });
    tutElevated.clear();
}
// 是否存在「已打开的全屏浮层」(.modal 自带全屏遮罩)：用于判断聚光框是否该让位
function tutGuideModalVisible() {
    try {
        const list = document.querySelectorAll('.modal');
        for (let i = 0; i < list.length; i++) {
            const m = list[i], cs = getComputedStyle(m);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const r = m.getBoundingClientRect();
            if (r.width > 40 && r.height > 40 && parseFloat(cs.opacity || '1') > 0.05) return true;
        }
    } catch (e) {}
    return false;
}
function tutUpdateGuard() {
    // 防护层是独立顶层 layer（见 CSS .ex-tut-guards），不再挂在 exTutRoot 内，
    // 以便被教程引导的浮层可抬到它之上（tutElevatePopups）。
    let g = document.getElementById('exTutGuardLayer');
    if (!g) { g = document.createElement('div'); g.id = 'exTutGuardLayer'; g.className = 'ex-tut-guards'; document.body.appendChild(g); }
    // 「点击空白处继续」：暗区就是防护层，点它 = 弹下一句讲解（聚光目标/画布/卡片都是挖了洞的，不会走到这里）
    if (!g._tutBlankBound) {
        g._tutBlankBound = true;
        g.addEventListener('click', (e) => {
            // 关键：拦在这里不让它冒泡到 document——应用有「点面板外部就收起设置面板 / 关下拉菜单」的
            // document 级监听，放任冒泡会导致「点一下空白推进文字，设置面板跟着被关掉、聚光框消失」。
            try { e.stopPropagation(); } catch (err) {}
            try { tutTypeOnBlankClick(); } catch (err) {}
        });
    }
    if (!tutActive) { if (g.firstChild) g.innerHTML = ''; g._sig = ''; tutGuardWatchStop(); tutElevateRestoreAll(); return; }
    const root = document.getElementById('exTutRoot');
    const st = (EX_TUT_CHAPTERS[tutChapter] && EX_TUT_CHAPTERS[tutChapter].steps[tutStep]) || {};
    const vw = window.innerWidth, vh = window.innerHeight;
    const holes = [];
    // 不再默认挖出「中央 3D 操作窗口」——这会在屏幕四周留下固定黑框，用户反馈像遮挡。
    // 现在只围绕当前步骤的聚光目标、教程卡片、以及被引导打开的浮层挖洞，其余区域才遮罩。
    // 当前步骤聚光目标（按钮 / 面板）：仅此处可点。
    // 优先复用聚光框 v2 内嵌定位时实测的视口矩形（tutSpotViewportRect）——在 gBCR 有内核偏差的
    // 环境（手机 QQ/XWeb）下，单独再算一遍 tutHighlightRect 会和框/真实目标对不上。
    const el = tutTargetEl(st.target);
    if (el) {
        let r = (tutSpotViewportRect && tutSpotRectFor === el && tutSpotViewportRect.width > 2) ? tutSpotViewportRect : tutHighlightRect(el);
        // ★2026-10-17（用户：明亮引导框溢出数据列表、把画布照亮）：把「洞」也夹进最近裁剪祖先（数据面板的
        // 滚动容器）内。目标贴面板边缘时，洞若不夹会溢出面板 → 防护层在面板外留下一条未被遮罩的亮区。
        try {
            const vis = tutVisibleRect(el);
            const nl = Math.max(r.left, vis.clipLeft), nt = Math.max(r.top, vis.clipTop);
            const nr = Math.min(r.left + r.width, vis.clipRight), nb = Math.min(r.top + r.height, vis.clipBottom);
            if (nr - nl > 2 && nb - nt > 2) r = { left: nl, top: nt, width: nr - nl, height: nb - nt };
        } catch (e) {}
        if (r.width > 2 && r.height > 2) holes.push(r);
    }
    // 本步需要画布实操（Gizmo 拖拽等，步骤标 canvas:true）时，把 3D 渲染区整体挖洞放行：
    // 否则防护层盖住整个画布，用户无法拖动 Gizmo 手柄（新操作模式「手把手」系列步的致命锁死）。
    if (st.canvas) {
        try {
            const cv = (typeof renderer !== 'undefined' && renderer && renderer.domElement) ? renderer.domElement : null;
            if (cv) {
                const r = cv.getBoundingClientRect();
                if (r.width > 2 && r.height > 2) holes.push(r);
                // ★画布挖洞后，点画布就不再落到防护层 ⇒ 「点击空白处继续」失效，卡片停在半句话上、
                //   下一步按钮永远不出现（实测第 2 步永久卡死）。这里让画布也承担「弹下一句」，
                //   只在文字还没打完时生效，打完就恢复画布原本的拖拽/选择。
                if (!cv._tutBlankBound) {
                    cv._tutBlankBound = true;
                    cv.addEventListener('click', () => { if (!tutTypeDone) { try { tutTypeNext(); } catch (e) {} } });
                }
            }
        } catch (e) {}
    }
    // 步骤可用 pass:['#sel', …] 额外放行任意元素（如「拖进文件夹」步的左侧方块列表）
    if (Array.isArray(st.pass)) {
        st.pass.forEach(sel => {
            try {
                const p = document.querySelector(sel);
                if (!p) return;
                const cs = getComputedStyle(p);
                if (cs.display === 'none' || cs.visibility === 'hidden') return;
                const r = p.getBoundingClientRect();
                if (r.width > 2 && r.height > 2) holes.push(r);
            } catch (e) {}
        });
    }
    // ★教程卡片**不再参与挖洞**（原写法：holes.push(card.getBoundingClientRect())）。
    // 理由一（为何多余）：防护层是独立顶层 layer（.ex-tut-guards，z-index 2147482000），
    //   而 #exTutRoot 是 2147483000 → 遮罩根本盖不到卡片；卡片又完全不透明（圆角缺口已被自身
    //   box-shadow 里的 7px 同色环填满），所以「卡片底下那块亮/暗」在视觉上永远看不见 = 挖洞白挖。
    // 理由二（为何有害）：洞是按卡片【当前动画中的 rect】算的，而卡片翻边是 380ms 的 translateY 缓动，
    //   守卫循环（tutGuardWatch，260ms）追不上它 → 卡片飞走后原地残留一个「卡片形状的亮矩形」，
    //   即用户反馈的「缓动时能很明显看见一个亮的挖洞」。卡片不参与挖洞 → 该现象从根上消失。
    // （卡片自身仍完全可点：它位于防护层之上，命中测试先到卡片。）
    // 引导浮层：可见即整块让路。.modal（新建方块菜单等）自带全屏遮罩（position:fixed;inset:0），
    // 它本身就会拦住其余区域，不会因此放走「瞎按」；下拉菜单 / 材质菜单 / 设置面板 / 关键帧窗口是
    // 局部浮层，挖洞后周边外壳（顶栏 / 侧栏）依然被防护层挡住。
    try {
        document.querySelectorAll(TUT_PASS_SEL).forEach(p => {
            if (root.contains(p)) return;
            const cs = getComputedStyle(p);
            if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.05) return;
            const r = p.getBoundingClientRect();
            if (r.width > 2 && r.height > 2) holes.push(r);
        });
    } catch (e) {}
    // 被拦截区域 = 视口 减去「所有洞（画布/目标/卡片）的并集」。
    // 注意：不能用「每个洞的补集之并集」——多个不相交的洞会让并集覆盖全屏（连目标也被挡）。
    // 这里用「矩形集逐洞扣减」算法：初始全屏，依次把每个洞从已有矩形中挖掉。
    let rects = [{ l: 0, t: 0, w: vw, h: vh }];
    const clampHole = (r) => ({ left: Math.max(0, r.left), top: Math.max(0, r.top), width: Math.min(vw - Math.max(0, r.left), r.width), height: Math.min(vh - Math.max(0, r.top), r.height) });
    const subtract = (list, hh) => {
        const out = [];
        const hl = hh.left, ht = hh.top, hw = hh.width, hgt = hh.height, hr = hl + hw, hb = ht + hgt;
        if (hw <= 0 || hgt <= 0) return list;
        for (const r of list) {
            const rl = r.l, rt = r.t, rr = r.l + r.w, rb = r.t + r.h;
            if (hl >= rr || hr <= rl || ht >= rb || hb <= rt) { out.push(r); continue; }
            const cl = Math.max(rl, hl), cr = Math.min(rr, hr), ct = Math.max(rt, ht), cb = Math.min(rb, hb);
            if (hl > rl) out.push({ l: rl, t: rt, w: hl - rl, h: rb - rt });
            if (hr < rr) out.push({ l: hr, t: rt, w: rr - hr, h: rb - rt });
            if (ht > rt) out.push({ l: cl, t: rt, w: cr - cl, h: ht - rt });
            if (hb < rb) out.push({ l: cl, t: hb, w: cr - cl, h: rb - hb });
        }
        return out;
    };
    holes.forEach(h => { rects = subtract(rects, clampHole(h)); });
    // 仅在「拦截矩形集合」变化时才重建 DOM：低频重算下若每次都重建，进行中的点击会落在被替换掉的旧节点上而丢失
    const sig = rects.map(rc => [rc.l, rc.t, rc.w, rc.h].map(v => Math.round(v)).join(',')).join('|');
    if (g._sig !== sig) {
        g._sig = sig;
        g.innerHTML = '';
        rects.forEach(rc => {
            if (rc.w <= 0 || rc.h <= 0) return;
            const d = document.createElement('div'); d.className = 'ex-tut-guard';
            d.style.left = rc.l + 'px'; d.style.top = rc.t + 'px';
            d.style.width = rc.w + 'px'; d.style.height = rc.h + 'px';
            g.appendChild(d);
        });
    }
    tutElevatePopups();
    tutGuardWatch();
}
