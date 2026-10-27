# 产品截图

`skill-library.png`、`dashboard.png` 与 `automation*.png` 来自当前 React 产品组件，使用固定的示例技能、Agent、项目与路径，不读取本机数据库，也不包含个人信息。截图展示开发版本界面，已发布安装包可能有所不同。

## 当前截图

- `dashboard.png`：侧栏首页使用“工作台”，非活动分组自动折叠；项目工作空间为默认视图，展示技能库 SVG、待部署与待分组入口、项目导航和最近 3 项技能；可切换 Agent 或展开更多近期技能。
- `skill-library.png`：侧栏展开技能库并选中“全部技能”，其余分组折叠；技能库“全部”视图，展示新版紧凑筛选栏、技能组、标签、部署状态与未分组技能的加入入口。
- 两张图片使用同一套示例数据：12 个技能、5 个已启用 Agent、2 个项目；5 个技能已部署、7 个待部署、4 个未分组。深色主题、简体中文、默认字号，1440×900 CSS 像素、1 倍像素密度。

## 更新截图

1. 启动 Vite 前端服务器，或复用现有开发服务器。
2. 打开 `/tests/browser/product-preview.html?theme=dark&language=zh&undeployed&ungrouped`。保持技能库“全部”视图和卡片模式，不选择技能组、不展开更多筛选，保持侧栏默认技能库展开与“全部技能”选中。
3. 打开 `/tests/browser/product-preview.html?view=dashboard&theme=dark&language=zh&undeployed&ungrouped`。保持默认项目工作空间与 3 项近期技能，不展开更多内容，保持侧栏非活动分组默认折叠。
4. 使用 Chromium 浏览器，以 1440×900 CSS 像素、1 倍像素密度捕获页面内容。等待数据与字体加载完成，页面停在顶部，不包含浏览器工具栏，保存为对应 PNG。
5. 检查截图没有错误、加载状态、弹窗或个人信息；执行 `npm run website:build` 和 `npx vitest run scripts/build-homepage.test.mjs`，确认输出资源与源图片一致。
6. 检查 README 和官网图片替代文本、说明及尺寸；按现有 Pages 工作流部署后核对线上两张图片与源文件一致。

截图页直接复用 `Layout`、`MySkills`、`Dashboard` 和应用上下文，只在 Tauri 调用边界注入示例数据。它仅用于文档截图，不包含完整的写入与文件操作能力。

README 与官网默认展示工作台，技能库可展开或切换查看。主页构建将这两张图片复制至输出目录的 `assets/`，README 直接引用这里的源图片。更新源图片即可同步这两个展示入口，无需维护截图副本。

## 自动化截图

所有截图可由下方脚本统一更新。自动化截图同样来自 `tests/browser/product-preview.tsx` 的合成数据，复用实际列表、创建、模板、详情和菜单组件。任务名、命令、提示词、项目与目录均为示例，不读取真实任务或账号；不采用真实用户截图后遮挡信息的方式。

- `automation.png`：创建者、调度器、状态及系统内置过滤，列表行的手动触发。
- `automation-create.png`：从合成 Hermes 模板填入的创建表单，默认独立工作目录提示。
- `automation-detail.png`：示例仓库审计任务详情与立即运行入口。
- `automation-templates.png`：系统与 Hermes 模板，支持从 Git 备份新建。
- `automation-menu.png`：实际打开的主题下拉菜单，验证弹出面板沿用应用主题。

复用本机 Vite 后执行：

```bash
node scripts/capture-product-screenshots.mjs
```

脚本只允许本地预览来源，以隔离的临时 Chromium profile 捕获 1440×900、1 倍像素密度的 PNG，结束后清理 profile，不读取日常浏览器数据。可通过 `AGENT_HUB_SCREENSHOT_BROWSER` 指定浏览器执行文件，通过 `AGENT_HUB_PREVIEW_ORIGIN` 指定本地开发端口。拍摄后检查加载、错误与菜单打开状态，并检查示例内容及个人信息。
