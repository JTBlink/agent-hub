Type: task
Status: resolved
Blocked by: none

## Scope

为龙虾 Agent 技能列表补齐可见的“同步 Agent”入口，允许从其他类别的 Agent 同步受管技能。

## Result

工作区传入完整 Agent 列表，按截图反馈将同步图标入口放入刷新、视图切换所在的工具栏，位于刷新按钮左侧；抽取来源与缺失技能计算，支持双向跨类别来源选择，过滤当前/禁用/未安装 Agent。同步后的刷新失败正常报告并释放 loading 状态。补充跨类别来源、去重、入口可见性的回归测试。验证通过：`npm run build`、`npm run lint`（一条既有 Hook 依赖警告）、`npm test`（98 项）、`git diff --check`。

## 展示修正

同步来源菜单原先使用未配置的 `bg-surface-popover`，未生成背景样式而变透明。改为复用其他菜单的 `bg-surface`，使用已有深浅主题不透明背景。
