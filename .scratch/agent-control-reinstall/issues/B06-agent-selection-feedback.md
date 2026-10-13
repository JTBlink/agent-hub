Type: task
Status: resolved
Blocked by: none

## Scope

用户反馈管理 Skill 卡片无法点击。验证选中目标后的启用链路，补齐 Agent 选择反馈和未选择时的提示。

## Comments

组件测试证明现有点击目标后可正常调用部署；截图符合尚未选择目标、启用按钮禁用的状态。旧卡片使用活动背景但无勾选或可访问选中状态，难以分辨。未把组件测试结果等同于用户桌面的复现。

## Result

- [AgentControlSetupCard](../../../src/components/AgentControlSetupCard.tsx) 为 Agent 选择提供方框、选中勾选、悬停和焦点反馈，使用 `aria-pressed` 表达状态；未选目标时展示“选择 Agent”，启用按钮同时提供原因提示。保留用户显式选择的部署范围。
- [组件回归测试](../../../src/components/AgentControlSetupCard.test.tsx) 先验证原有选择后可启用的链路通过，而选中反馈用例失败（缺少 `aria-pressed`）；修复后两项均通过，覆盖取消选择及只向所选 Agent 部署。
- 验证：相关测试 2 项通过；`npm run lint`、`npm run build`、修改文件 Prettier 与 `git diff --check` 通过。全量测试 429 项通过、1 项失败：并行工作中的 `SettingsTabs.test.tsx` 键盘导航断言失败，本次未修改设置组件。
- 原生检查时仅找到旧版 Skills Manager，截图对应的 AgentHub 未运行，未核验截图中实际点击。仍无法排除用户所指为选中后发生的另一故障；本次已解决未选状态与禁用原因不明确的问题。

## Review

Standards：沿用现有部署方法和三语文案，不自动选择或扩大部署范围。Spec：Agent 可显式选中并显示勾选，选择后主按钮可用；实际桌面故障仍需对应应用状态证据。
