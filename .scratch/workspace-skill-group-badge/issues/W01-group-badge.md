Type: task
Status: resolved
Blocked by: none

## Scope

以对应技能组名称替换 Agent 技能卡片中的“与中心一致”，覆盖卡片和列表视图。

## Result

- 抽取 [WorkspaceSkillCard](../../../src/components/WorkspaceSkillCard.tsx) 与 [展示规则](../../../src/lib/workspaceSkillStatus.ts)，从中心技能 ID 查找技能组，复用默认名称本地化。
- 卡片和列表显示技能组；已知无分组显示“未分组”，缺失数据保留同步状态，有差异的技能保持原提示。长组名截断并提供完整名称 tooltip。
- 更新根目录 CHANGELOG，新增 7 项回归测试。
- 验证：`npm test` 通过（113 项），本次变更文件 ESLint 与新文件 Prettier 检查通过，`git diff --check` 通过。
- 全量 `npm run build` 与 `npm run lint` 受工作区其他并行变更影响：`SkillDetailPanel.tsx` 的两个未使用 import 与 `belongsToGroups` 未使用变量导致失败；未改动该文件。另有 `MySkills.tsx` 的已有 Hook 依赖警告。

后续复验：并行变更完成后，`npm run build` 与 `npm run lint` 均通过（保留一条已有 Hook 依赖警告），`npm test` 共 118 项通过。

## Review

Standards：卡片与状态提取为独立模块，复用默认分组本地化。Spec：健康状态显示分组，有差异保留提示，缺失数据回退、未分组与长名称展示已覆盖。
