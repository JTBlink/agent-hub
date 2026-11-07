# 运行与恢复

版本以 config/task.json 为准；日程以 config/task.json 为准。agent.py 委托 AgentHub CLI 的共享执行模块，工作中不重复投递，不自动回答审批。超时/状态不明保留 .local/state/.herdr-run.json，先核实原会话再恢复。

业务状态在 .local/state/task-state.json 的 extensions.mr_repair；写锁/原子替换失败时停止，不重置计数。上限与回调见[三态协议](review-labels.md)。执行记录在 .local/runs/，本地数据均不导出、备份或同步。升级保留配置、历史和计数，不启用暂停任务。未配置外部通知/webhook。
