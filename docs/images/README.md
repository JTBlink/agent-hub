# 产品截图

`skill-library.png` 与 `dashboard.png` 来自当前 React 产品组件，使用固定的示例技能、Agent、项目与路径，不读取本机数据库，也不包含个人信息。截图展示开发版本界面，已发布安装包可能有所不同。

## 当前截图

- `dashboard.png`：项目工作空间为默认视图，展示技能库 SVG、待部署与待分组入口、项目导航和最近 3 项技能；可切换 Agent 或展开更多近期技能。
- `skill-library.png`：技能库“全部”视图，展示新版紧凑筛选栏、技能组、标签、部署状态与未分组技能的加入入口。
- 两张图片使用同一套示例数据：12 个技能、5 个已启用 Agent、2 个项目；5 个技能已部署、7 个待部署、4 个未分组。深色主题、简体中文、默认字号，1440×900 CSS 像素、1 倍像素密度。

## 更新截图

1. 启动 Vite 前端服务器，或复用现有开发服务器。
2. 打开 `/tests/browser/product-preview.html?theme=dark&language=zh&undeployed&ungrouped`。保持技能库“全部”视图和卡片模式，不选择技能组、不展开更多筛选。
3. 打开 `/tests/browser/product-preview.html?view=dashboard&theme=dark&language=zh&undeployed&ungrouped`。保持默认项目工作空间与 3 项近期技能，不展开更多内容。
4. 使用 Chromium 浏览器，以 1440×900 CSS 像素、1 倍像素密度捕获页面内容。等待数据与字体加载完成，页面停在顶部，不包含浏览器工具栏，保存为对应 PNG。
5. 检查截图没有错误、加载状态、弹窗或个人信息；执行 `npm run website:build` 和 `npx vitest run scripts/build-homepage.test.mjs`，确认输出资源与源图片一致。
6. 检查 README 和官网图片替代文本、说明及尺寸；按现有 Pages 工作流部署后核对线上两张图片与源文件一致。

截图页直接复用 `Layout`、`MySkills`、`Dashboard` 和应用上下文，只在 Tauri 调用边界注入示例数据。它仅用于文档截图，不包含完整的写入与文件操作能力。

README 与官网默认展示工作台，技能库可展开或切换查看。主页构建将这两张图片复制至输出目录的 `assets/`，README 直接引用这里的源图片。更新源图片即可同步这两个展示入口，无需维护截图副本。
