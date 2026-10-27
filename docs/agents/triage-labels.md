# Triage labels

五个分诊角色直接映射到同名 GitHub label：

| Canonical role    | GitHub label      | 含义                                |
| ----------------- | ----------------- | ----------------------------------- |
| `needs-triage`    | `needs-triage`    | 等待判断范围和优先级                |
| `needs-info`      | `needs-info`      | 等待补充信息                        |
| `ready-for-agent` | `ready-for-agent` | 规格完整，依赖解除后可由 Agent 领取 |
| `ready-for-human` | `ready-for-human` | 需要人工执行                        |
| `wontfix`         | `wontfix`         | 已决定不实施                        |

Issue 的开放或关闭状态由 GitHub 原生 state 管理，负责人通过 assignee 表示；阻塞由依赖计算。完成任务关闭 Issue 并移除待处理标签，不增加本地 `claimed`、`resolved` 状态或重复标签。

自动同步行为与里程碑规则见 [issue-tracker.md](issue-tracker.md)。
