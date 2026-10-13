Type: task
Status: resolved
Blocked by: none

## Scope

按截图移除技能库详情顶部重复 Agent 图标，下方保留操作；新增 VS Code 目录入口并封装通用打开方法。

## Comments

用户补充要求 VS Code 打开方法可在多处复用。沿用已有目录组件与路径编码，补齐通用启动函数。

## Result

- [SkillDetailPanel](../../../src/components/SkillDetailPanel.tsx) 移除顶部 Agent 图标，说明下方只保留一组交互入口；技能组沿用启停回调，全部技能沿用已有部署与取消部署回调。图标提供操作提示、键盘焦点和等待状态。
- [openDirectoryInVscode](../../../src/lib/openInVscode.ts) 封装实际打开动作，沿用跨平台路径编码并向调用方传播失败；[SkillDirectoryActions](../../../src/components/SkillDirectoryActions.tsx) 共用该函数，统一显示失败提示。技能库目录与项目当前副本目录均使用该组件。
- 回归测试覆盖单组图标、顶部去重、技能组操作、全库部署、等待状态、两个详情入口的目录参数；通用方法测试覆盖编码、无效路径拒绝与启动失败传播。
- 验证：`npm test` 全量 419 项通过；`npm run lint`、`npm run build`、`npm run tasks:check`、修改文件 Prettier 与 `git diff --check` 通过。首次并行执行测试/构建时共享帮助生成目录发生冲突；等待生成结束后重新构建通过。
- 未执行原生桌面 VS Code 启动、主题、缩放与焦点验收；未修改 Rust、后端契约或 opener 权限。

## Review

Standards：复用现有路径编码、权限、目录组件与部署回调，没有新增路径规则或持久化状态；新增文案使用已有三语 key。Spec：顶部 Agent 图标移除，下方保留可操作图标；VS Code 打开当前目录，实际启动函数可独立复用。
