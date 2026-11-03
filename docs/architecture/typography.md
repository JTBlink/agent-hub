# 工作台排版

字体由独立模块 `src/fonts/` 管理。字体声明、字体链、字号和基础行高统一定义在 `src/fonts/fonts.css`，由应用样式入口加载一次。Tailwind 配置、CodeMirror 和终端均消费该文件的 CSS 变量；调整排版从此处修改，不在组件中新增像素字号或另一套字体栈。

| 内容                             | 工具类                | 默认字号 |
| -------------------------------- | --------------------- | -------- |
| 辅助文字、分组标题、数量、快捷键 | `text-xs`             | 12px     |
| 导航、树节点、表单、列表正文     | `text-sm`             | 13px     |
| 代码                             | `font-mono text-code` | 14px     |
| 终端                             | `terminalFont()`      | 15px     |
| 小标题                           | `text-lg`             | 16px     |
| 页面标题                         | `text-xl`             | 18px     |
| 文档章节标题                     | `text-2xl`            | 20px     |
| 文档大标题                       | `text-3xl`            | 24px     |

界面使用系统无衬线字体和系统中文回退，代码与终端使用随应用提供的 JetBrains Mono，并保留终端符号字体。编辑器关闭编程连字，便于辨认运算符；终端保持连续行网格，避免 TUI 框线断开。紧凑导航通过间距和行高控制密度，不再降低至 8–11px。

模块的 TypeScript 入口 `src/fonts/index.ts` 提供 `terminalFont(styles)` 和 `loadTerminalFonts()`：前者读取共享变量并解析终端字号、字重和网格参数，后者预加载正文与图标的常规、粗体和斜体。模块不依赖 xterm、Herdr 或 Tauri；终端外观模块组合字体参数与颜色、光标选项，窗格在字体加载完成后测量 PTY 网格。原始字体文件和许可证保留在 `public/fonts/`。终端专用的 `src/fonts/terminal-icons/` 模块管理合成字体、ANSI 样式与按文档共享的加载状态；每个字体同时包含正文和全量私用区图标，CSS 内嵌字节，避免独立图标 URL 与跨字体回退。合成文件随源码保存，生成与完整性检查见 `scripts/fonts/build-terminal-fonts.py` 和 `public/fonts/README.md`。

设置中的文字大小通过现有 `--app-scale` 对全界面统一缩放。终端容器抵消 CSS zoom，由字体模块将缩放计入字号，以保持鼠标坐标与网格尺寸一致。终端以合成字体提供正文与单格图标，图标保持源轮廓比例并在字符格及大写字高内居中，中文沿用系统回退；编辑器继续使用原有代码字体链。字体就绪与后续加载事件经 `terminalFonts.ts` 触发 xterm 重新测量；仅 refresh / fit 不会更新 open 时缓存的后备字体格宽。`tests/browser/terminal-rendering-webkit.swift` 与 Chrome 回归同时检查迟到字体、真实正文格宽、非缺字图标像素、源图标宽高比、缩放和分屏缓存。
