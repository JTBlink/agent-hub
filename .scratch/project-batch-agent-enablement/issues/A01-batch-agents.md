Type: task
Status: resolved
Blocked by: none

# 实现按 Agent 批量启用与状态展示

## Comments

用户反馈：整体已启用状态未显示具体 Agent，批量操作没有 Agent 选择入口。

## Result

- 项目多选操作提供独立的按 Agent 启用与停用入口；窗口勾选目标并展示启用数量。
- 自动安装中心库的缺失副本，恢复停用副本，跳过已达到目标状态的副本，错误保留技能与 Agent 信息。
- 卡片和列表直接显示启用 Agent 名称，多选模式也可见。项目统计明确以技能数量为单位。
- 主要模块：[批量操作](../../../src/lib/projectBatchAgents.ts)、[Agent 选择窗口](../../../src/components/ProjectBatchAgentDialog.tsx)、[启用名单](../../../src/components/ProjectEnabledAgents.tsx)。
- 验证：`npm run build`；`npm run test`（136 项通过，随后新增状态展示测试与批量测试共 8 项通过）；`npm run lint`（0 错误，MySkills.tsx 有既存 hook 依赖警告）；修改文件 ESLint 通过；`git diff --check`。本次不改 Rust。
- 一键创建按当前上下文实现为：选择技能和 Agent 后一次点击自动创建缺失目录并部署。

- 最终验证：前端测试 144 项通过。Standards 审查通过：新交互与批量服务独立模块，复用项目部署 API。Spec 审查通过：可选择 Agent，自动安装缺失中心库副本，卡片显示启用目标。
