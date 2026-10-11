Type: task
Status: resolved
Blocked by: none

## Scope

为当前 Agent 的技能组跳过详情添加逐项覆盖入口。

## Result

补齐 WorkspaceView 当前 Agent 详情页的 onForceSync 回调，通过现有 force 部署能力只覆盖对应技能与 Agent。冲突项显示覆盖按钮，成功刷新并显示已覆盖，真实失败项保持只读；执行期间阻止重复提交和弹窗关闭。新增冲突与普通失败混合列表、无覆盖处理器的回归测试。验证通过：`npm run build`、`npm run lint`（一条既有 Hook 依赖警告）、`npm test`（100 项）、`git diff --check`。
