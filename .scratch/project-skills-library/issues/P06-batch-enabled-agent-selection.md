Type: task
Status: resolved
Blocked by: P05

# 项目批量启停复用可用 Agent 规则

## Comments

- 用户提供“按 Agent 启用”窗口截图，要求复用已安装且已启用的 Agent 选择规则。
- 页面传递与添加窗口相同的个人可用目标；批量窗口复用公共列表过滤，窗口打开后停用的选择即时移除，防止隐藏目标提交。启用和停用两个模式采用相同规则，保留已启用数量展示与错误重试。

## Result

- 页面将 [统一项目可用目标](../../../src/views/ProjectDetail.tsx)传给批量窗口，与添加技能复用同一份 installationTargets，个人启用状态不再被完整的支持目标列表覆盖。
- [批量窗口](../../../src/components/ProjectBatchAgentDialog.tsx)复用 enabledInstalledAgents，移除停用或消失的勾选并禁用空选择提交；保留启用数量和现有异步错误反馈。
- 复用无已启用 Agent 的设置引导文案，三语选择提示与 ADR-0012 范围同步。
- [回归测试](../../../src/components/ProjectBatchAgentDialog.test.tsx)4 项通过，覆盖启用/停用提交、未安装和未启用目标隐藏、已选择目标停用或移除、重新可用后不恢复过期勾选。
- `npm test`：52 文件、227 项通过；`npm run build`、`npm run lint`、改动文件 Prettier 与 `git diff --check` 通过。无 Rust 或 IPC 改动，未重新执行 Tauri 原生人工验收。
- Standards：复用个人状态适配和公共过滤，不复制安装检测或 Agent 路径规则。Spec：两个批量模式只展示已安装且已启用的目标，旧选择不会隐式参与操作。
