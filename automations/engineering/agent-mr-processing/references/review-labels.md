# 当前 MR / PR 三态协议

按统一审查约定，只在本轮 MR/PR 管理三个互斥标签，保留业务/人工/队列标签，不修改关联 Issue，不新增 needs-human/failed 等评审标签：

- ai-review::pending：等待独立审查，或必要证据不足且没有已确认未处理必修问题。
- ai-review::rejected：当前版本有已确认未处理的必修问题，包括验收不符。
- ai-review::passed：独立完成 Standards/Spec，必修问题有处置与复验证据。

修复推送新 SHA 后 pending，由新上下文重审；修复 Worker 不自签 passed。同版本缺证不撤销有效 rejected。标签不代替版本证据，不授权合入。

## 回调

先核实项目允许的 CLI/身份、来源/目标版本及唯一写入归属；其他 CI/人工流程同时管理或归属不明时停止。按上下文 argv 调用，参数用 --help 查询。

1. callback_argv 追加 --action begin --head <实际SHA>；仅登记成功才修复。验证后回调 success/failed，附最终 head 和 evidence。success 为 awaiting_review，返回本轮，不继续自审。
2. 审查用 reviewed，提供 head/base、verdict、blocking-count、standards/spec（complete/unavailable）、evidence、已读回的 comment-url。缺证不通过，passed 必须是未参与修复的新 run_id。
3. label_callback_argv 追加 --head/--base。脚本按证据决定标签，写前/读后核对 opened、版本、分支与执行归属，passed/rejected 还要读回绑定版本的评论。只最小增删三态标签。GitHub PR 原生使用该 PR 编号的 issue-label API，不是关联 Issue。
4. 仅 verified 算成功；权限不足 failed，超时/版本竞争/结果未知 uncertain，保存原因并非零退出。只读核实，不盲重发，不换身份或工具绕过拒绝。结果保存在本地 review/label_sync。

## 人工交接

累计上限由脚本 LIMIT 实施，不随重跑或新 SHA 清零。耗尽禁止新 begin，仍允许独立核实与交接；次数本身不是 rejected 的依据，按实际必修问题判断，缺证/执行受阻为 pending。

mode=handoff_only 禁止修复，reconcile_only 只核实原尝试，review_only 只独立重审，labels_only 只核实标签。交接仅记本地和评论，说明失败证据、未完成项、人工动作及标签/原生打回的权限缺口，包含 `<!-- agent-hub-manual-handoff:<最终源提交SHA> -->`；读回后回调 handoff，附 head、evidence、comment-url。交接后不再自动处理。不删记录绕过上限，不合并、不强推、不擅自解决冲突。
