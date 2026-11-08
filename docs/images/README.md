# 产品截图

截图来自 `tests/browser/product-preview.tsx` 的当前产品组件与固定合成数据。不会读取本机数据库、项目、账号或任务，也不使用真实用户界面遮挡后发布。截图展示开发界面，已发布安装包以各版本说明为准。

## 主要页面

| 图片                        | 展示内容                                           |
| --------------------------- | -------------------------------------------------- |
| `project-workspace.png`     | 项目与工作树、文件浏览、文档和内嵌终端入口         |
| `git.png`                   | 源代码管理与提交图                                 |
| `tasks.png`                 | GitHub / GitLab 平台任务、项目筛选和账号入口       |
| `skill-library.png`         | 全部技能、技能组、标签、来源与部署状态             |
| `dashboard.png`             | 工作台概览、项目工作空间和近期技能                 |
| `automation.png`            | 任务列表、日程、执行状态、创建和运行入口           |
| `automation-create.png`     | 任务编辑器、项目目录、Agent 配置、提示词方案与日程 |
| `automation-detail.png`     | 任务概述、源码、VS Code 打开和编辑入口             |
| `automation-execution.png`  | 按次保存的本机执行记录                             |
| `automation-run-output.png` | 单次运行的时间、状态和输出                         |
| `automation-templates.png`  | 从模板新建任务                                     |
| `automation-hermes.png`     | Hermes 来源筛选                                    |
| `automation-cleanup.png`    | 命令任务的脚本与日程编辑                           |
| `automation-menu.png`       | 实际打开的主题筛选菜单                             |

默认深色、简体中文、默认字号，1440×900 CSS 像素、1 倍像素密度。技能数据包含 12 个技能、5 个启用 Agent 和 2 个示例项目；所有路径和身份均为合成数据。截图通过真实组件操作进入相应状态，不绘制产品界面的替代稿。

当前图片已同步新的三片穿插品牌图标，顶部标记默认使用深色版；仅使用固定合成数据。

## 更新截图

1. 启动或复用本机 Vite 前端预览服务器。默认地址为 `http://localhost:1420`。
2. 执行 `node scripts/website/capture-product-screenshots.mjs`；只更新一张时可附加文件名，例如 `node scripts/website/capture-product-screenshots.mjs project-workspace.png`。
3. 检查每张图片：没有空白、加载或报错页面，选中状态符合表中用途，文字可读且没有本机信息。项目页打开示例 README，Git 页打开提交图，技能页选择全部技能。
4. 执行 `npm run website:build` 和 `npx vitest run scripts/website/build-homepage.test.mjs`，验证站点资源和版本注入。
5. 预览桌面及移动端布局，点击官网各个截图标签，检查替代文本、标题和实际图片一致。发布后再核对线上资源，未发布时不要宣称官网已上线。

脚本只允许本地预览来源，使用隔离的临时 Chromium profile，以无界面模式捕获 PNG，结束后清理该 profile。它不读取日常浏览器数据。可用 `AGENT_HUB_SCREENSHOT_BROWSER` 指定浏览器可执行文件，用 `AGENT_HUB_PREVIEW_ORIGIN` 指定本地端口。

手动查看：`/tests/browser/product-preview.html?view=worktree&theme=dark&language=zh&capture`。`view` 还支持 `git`、`tasks`、`skills`、`dashboard`、`automation`。自动化的指定编辑、模板及执行状态见拍摄脚本的 `shots` 列表。

README 直接使用本目录的图片；官网构建将主要页面图复制到 `assets/`，两处共用同一图片源。修改源码中的图片集合后，同步更新构建脚本与资源校验，避免手工维护官网截图副本。
