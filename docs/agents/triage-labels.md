# 分诊状态词汇

| 角色              | 仓库状态          | 含义                               |
| ----------------- | ----------------- | ---------------------------------- |
| `needs-triage`    | `needs-triage`    | 新需求等待判断范围和优先级         |
| `needs-info`      | `needs-info`      | 等待用户或外部信息                 |
| `ready-for-agent` | `open`            | 规格完整，可在依赖解除后由 AI 领取 |
| `ready-for-human` | `ready-for-human` | 明确要求人工执行                   |
| `wontfix`         | `wontfix`         | 已决定不实施                       |

实现中的任务使用 `claimed`，完成任务使用 `resolved`。阻塞不是单独状态，由 `Blocked by` 中未解决的依赖计算得出。
