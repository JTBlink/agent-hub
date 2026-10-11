Type: task
Status: resolved
Blocked by: none

## Scope

修复历史 `agent_control_setup_prompt=installed` 设置导致已移除的 `manage-skills` 不再显示首页安装入口的问题。明确关闭提示的选择继续保留。

## Result

入口仅在设置值为 `dismissed` 时隐藏；安装成功后不再写入冗余的 `installed` 标记。回归测试覆盖已安装后移除、明确关闭和首次使用。

验证：`npx vitest run src/components/agentControlPrompt.test.ts` 先失败后通过；`npm run test`、`npm run build`、`npm run lint` 通过（lint 有一处与本次无关的既有 warning）。
