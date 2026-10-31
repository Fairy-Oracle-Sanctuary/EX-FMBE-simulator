/* 00-bootstrap.js —— 全站唯一的 module 入口
   ① 走 importmap 加载 three / OrbitControls / CSS2DRenderer（与拆分前同一份 vendor 文件）；
   ② 挂到 window：拆分后的功能脚本按全局作用域读取
      THREE / OrbitControls / CSS2DRenderer / CSS2DObject（等价于原 module 顶层 import 的裸标识符）；
   ③ 取回 54 个功能段后「拼接成一个脚本、一次性同步执行」：
      拆分前是一个大 module，函数/var 声明在整个文件内提升，加载期就能被后段定义的函数调用；
      若把各段当独立脚本逐个执行（中间让出事件循环），这些提升就断了，定时器/rAF 还会抢跑。
      拼成同一段脚本即可原样恢复：同一作用域、同一执行顺序、同一任务内跑完。
      各段开头保留了「源文件行号」注释；报错行号落在拼接后的虚拟文件里，
      下方 各段起始行 表可用于反查具体文件。 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

window.THREE = THREE;
window.OrbitControls = OrbitControls;
window.CSS2DRenderer = CSS2DRenderer;
window.CSS2DObject = CSS2DObject;

const EX_PARTS = [
    "01-core/01-constants-and-errors.js",
    "01-core/02-math-and-query.js",
    "01-core/03-changelog-data.js",
    "02-script-kernel/01-fmbe-interpreter.js",
    "02-script-kernel/02-texture-library.js",
    "02-script-kernel/03-flag-recipes.js",
    "02-script-kernel/04-loom-popup.js",
    "02-script-kernel/05-model-registry.js",
    "03-blocks/01-block-material.js",
    "03-blocks/02-folder-and-bone.js",
    "03-blocks/03-sidebar-and-selection.js",
    "03-blocks/04-multiselect-and-undo.js",
    "03-blocks/05-copy-paste-and-batch.js",
    "03-blocks/06-molang-var-panel.js",
    "03-blocks/07-molang-batch-rewrite.js",
    "03-blocks/08-value-bubble-and-events.js",
    "03-blocks/09-bone-binding.js",
    "04-import-export/01-var-deps-and-mcstructure-export.js",
    "04-import-export/02-mcstructure-import-and-scene.js",
    "04-import-export/03-compressed-export-and-3d-grid.js",
    "04-import-export/04-command-import-and-obj-preview.js",
    "05-ui/01-material-menu.js",
    "05-ui/02-buttons-and-group-manage.js",
    "05-ui/03-changelog-and-settings-panel.js",
    "05-ui/04-sidebar-list.js",
    "05-ui/05-ai.js",
    "05-ui/06-settings-and-zoom.js",
    "06-gizmo/01-config-and-geometry.js",
    "06-gizmo/02-core-drag.js",
    "06-gizmo/03-rebuild-and-vertex-snap.js",
    "06-gizmo/04-mirror.js",
    "06-gizmo/05-folder-gizmo-and-bake.js",
    "06-gizmo/06-hud-and-hotkeys.js",
    "07-scene/01-scene-init.js",
    "07-scene/02-theme-and-view.js",
    "07-scene/03-box-select-and-mirror-select.js",
    "07-scene/04-marker-light-and-loop.js",
    "08-keyframe/01-gesture-and-euler.js",
    "08-keyframe/02-window-ui.js",
    "08-keyframe/03-timeline.js",
    "08-keyframe/04-confirm-dialog-and-data-panel.js",
    "08-keyframe/05-play-and-import.js",
    "08-keyframe/06-compiler.js",
    "08-keyframe/07-export-keyframe-and-bone.js",
    "09-tutorial/01-init-and-sfx.js",
    "09-tutorial/02-engine-and-card-ui.js",
    "09-tutorial/03-steps-and-actions.js",
    "09-tutorial/04-actions-fill-and-typing.js",
    "09-tutorial/05-practice-and-clear.js",
    "09-tutorial/06-chapter-toc.js",
    "09-tutorial/07-welcome-card-and-intro.js",
    "10-project/01-dev-mode-and-project-manager.js",
    "10-project/03-points-and-shapes.js"
];
window.__exParts = EX_PARTS;
window.__exFailedParts = [];

window.__exReady = (async () => {
    const base = import.meta.url;
    const texts = [];
    for (const rel of EX_PARTS) {
        const res = await fetch(new URL(rel, base).href, { cache: 'no-store' });
        if (!res.ok) { window.__exFailedParts.push(rel + ' (HTTP ' + res.status + ')'); return false; }
        texts.push(await res.text());
    }
    // 各段在虚拟文件中的起始行（报错行号反查用）
    const starts = {};
    let lineNo = 1;
    const chunks = texts.map((t, i) => {
        const head = '\n/* ======== ' + EX_PARTS[i] + ' ======== */\n';
        starts[EX_PARTS[i]] = lineNo + 2;
        lineNo += 2 + t.split('\n').length;
        return head + t;
    });
    window.__exPartLines = starts;

    const s = document.createElement('script');
    s.textContent = chunks.join('\n') + '\n//# sourceURL=ex-split-bundle.js';
    document.body.appendChild(s);          // 同步执行，不排队
    if (window.__exFailedParts.length) console.error('[EX] 脚本加载失败:', window.__exFailedParts);
    return true;
})();
