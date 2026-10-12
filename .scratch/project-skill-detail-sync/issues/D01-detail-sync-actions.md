Type: task
Status: resolved
Blocked by: none

## Scope

复用项目卡片同步工具栏到详情标题，统一操作方向高亮，验证操作回调、互斥和更新后的详情刷新。

## Result

- [ProjectSkillDetailPanel](../../../src/components/ProjectSkillDetailPanel.tsx) 在详情标题展示共用同步工具栏；[DetailSheet](../../../src/components/DetailSheet.tsx) 提供可选标题操作插槽，长标题与操作可换行。
- [ProjectSkillSyncActions](../../../src/components/ProjectSkillSyncActions.tsx) 统一卡片、列表与详情的高亮方向，使用明暗主题语义背景和焦点 token；父页面复用原回调及等待状态，保留整个技能更新与多副本冲突流程。
- 新增 9 项回归测试，覆盖四种同步状态的卡片与列表高亮、详情操作回调、两个方向的执行互斥、更新后内容刷新和多副本浏览时操作范围一致。
- 验证：`npm test`（185 项）、`npm run lint`、`npm run build`、修改文件 Prettier、`git diff --check`。ESLint 仅有既存的 `MySkills` Hook 依赖警告。详情定向测试 22 项通过。
- 原生界面读取工具超时，未完成实机主题、缩放与键盘焦点验收；自动测试已验证可访问名称与禁用行为。

## Review

Standards：复用组件、领域同步状态、操作流程和国际化文案；只增标题组合插槽与页面回调接线，无后端契约或存储变化。Spec：更新与恢复入口同步展示、按方向高亮、执行中互斥、一致后隐藏，详情保持打开并重新加载内容；多副本选择仅改变内容浏览，操作范围与卡片一致。
