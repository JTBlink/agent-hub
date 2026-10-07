# B19：删除成功后立即关闭本地 Skill 弹窗

Type: task
Status: claimed
Blocked by: none

## Scope

删除成功后关闭确认弹窗，不等待耗时的扫描和全局刷新。失败时保留弹窗，显示错误并允许重试。

## Acceptance

- 延迟扫描的浏览器回归中，删除成功且刷新仍未完成时弹窗已关闭。
- 删除失败时停止加载，保留弹窗；刷新失败不将成功删除误报为失败。
- 保留其他确认弹窗默认行为，更新文档、CHANGELOG 与 tracker。
