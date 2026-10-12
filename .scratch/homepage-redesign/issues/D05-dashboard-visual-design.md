Type: task
Status: resolved
Blocked by: D04

# 工作台首页视觉与布局

## Scope

按照 frontend-design 与 ui-ux-pro-max 重新组织工作台，加入主题适配的 SVG 插画和图标、主次分明的布局，修改副标题及近期技能文案。保留既有导航和任务行为。

## Acceptance

- 主技能库与紧凑待办呈现不同层级，工作空间可切换 Agent/项目且无内层滚动；最近更新技能显示两行描述和明确详情入口。
- SVG 不替代真实状态；覆盖率根据部署数据计算，加载和零值处理保留。
- 三语文案同步，明暗主题、窄窗口、字号放大、长文案和键盘导航可用。
- 前端测试、lint、build、格式与差异检查通过；完成后按用户授权提交并 push。

## Comments

- 用户明确要求工作台首页的 SVG 图标、流行视觉元素、布局设计和副标题调整，并授权完成后提交 push。
- 后续要求同步修改 GitHub Pages 的首页 slogan，范围包含官网模板、README 和当前工作台示例截图。
- 用户根据实际截图指出下半区难操作、项目嵌套滚动不便：改为全宽分区、工作空间类型切换与网格、最近技能卡片；保留单一页面滚动。

## Result

- [技能库主卡](../../../src/components/DashboardOverview.tsx) 搭配[装饰 SVG](../../../src/components/DashboardLibraryArt.tsx)、真实部署覆盖率与紧凑待办；沿用现有品牌、主题变量和 Lucide 图标，无新依赖。
- [工作空间](../../../src/components/DashboardWorkspaces.tsx) 提供 Agent/项目切换、数量和完整网格入口，保留编码与龙虾 Agent 路由、项目技能数和冲突提示；移除固定高度及内部滚动。选择是本地界面状态，数据刷新保留明确选择。
- [最近更新技能](../../../src/components/DashboardRecentSkills.tsx) 采用两行描述、部署 Agent 和明确详情入口；最新一项全宽，其余按内容宽度排列。技能库入口清理旧分组和详情，来源类型使用三语名称。
- [独立页面样式](../../../src/styles/dashboard.css) 实现内容宽度响应式布局、轻透面板和 SVG 分层高光；支持键盘焦点与减少动态效果，不改全局主题或其他页面样式。
- 副标题三语同步；[官网](../../../homepage/index.html) 与 [README](../../../README.md) slogan 改为“把好用的 Skills，带到每个 Agent。”，更新 1440×1360 的合成数据工作台截图及图片尺寸。
- `npm test`：69 个文件、335 项通过；`npm run lint`、`npm run build`、`npm run website:build`、Prettier、`git diff --check` 通过。截图更新后官网资源测试与 Dashboard 11 项行为测试再次通过。
- [浏览器布局回归](../../../tests/browser/dashboard-layout.py) 通过：800 / 960 / 1440px、明暗主题、三语、1.2 倍字号、空状态、12 个项目完整展示、滚轮只滚动主页面、Tab 焦点与 Enter 进入完整未部署列表。[Agent 管理导航回归](../../../tests/browser/dashboard-agents.py) 通过。
- 官网本地构建在 375 / 1440px 验证新 slogan 无横向溢出；应用及官网截图已目视检查。未执行 Tauri 原生应用验收。
- Standards：页面组合、SVG、技能与工作空间展示按职责拆分；统计和路由复用原数据，不新增 IPC 或持久化配置。Spec：视觉、布局、文案和统一滚动实现并验证；线上发布结果在部署后补记。

- 实现已提交并推送：`21fcbbd300474f6bc9b6522cd5620e3ebb1d7379`。[官网部署工作流](../../../.github/workflows/deploy-pages.yml) 手动运行 `38278480637` 使用同一 SHA，2026-10-13 构建与部署成功；未触发安装包发布。
- 线上核验通过：新 slogan 已显示，工作台预览切换可用，实际加载新版 1440×1360 截图。页面源码、文档和工作台截图均完成发布，任务验收结束。
