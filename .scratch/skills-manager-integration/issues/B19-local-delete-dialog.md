# B19：删除成功后立即关闭本地 Skill 弹窗

Type: task
Status: resolved
Blocked by: none

## Scope

删除成功后关闭确认弹窗，不等待耗时的扫描和全局刷新。失败时保留弹窗，显示错误并允许重试。

## Acceptance

- 延迟扫描的浏览器回归中，删除成功且刷新仍未完成时弹窗已关闭。
- 删除失败时停止加载，保留弹窗；刷新失败不将成功删除误报为失败。
- 保留其他确认弹窗默认行为，更新文档、CHANGELOG 与 tracker。

## Result

- 删除 IPC 成功后清除目标并结束忙碌状态，扫描与列表刷新在后台继续；刷新失败单独提示。
- 确认回调可返回 false 保留弹窗，原有 void 回调仍默认关闭；删除失败显示错误且恢复重试。
- `browser-use < tests/browser/local-skill-delete.py` 在修复前失败：dialog is still open while the post-delete scan is pending。修复后成功、刷新失败和删除失败三个场景通过，无真实文件操作。
- npm build、lint、52 项前端测试、diff 与 tracker 检查通过。固定回归直接覆盖真实组件、hook 和弹窗链路；明确的延迟扫描复现足以定位，无需广泛假设探查。

## Review

Standards：复用原有异步流程与文案，确认回调保持向后兼容；fixture 不含身份信息。

Spec：成功关闭不等待扫描，删除失败保留且可重试，刷新错误不影响已完成删除。
