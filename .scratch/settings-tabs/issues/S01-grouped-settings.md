Type: task
Status: claimed
Blocked by: none

# 实现分组 Tab 与正式版检查

按 [规格](../spec.md) 重组设置页，完成正式 Release 检查和下载入口，保留原有设置行为。

## 验收

- 五组入口和设置归属符合规格，旧 Agent 深链接可用。
- Tab 可用键盘切换，编辑内容和滚动位置保留。
- 更新检查使用当前仓库、SemVer 和现有代理，失败与无正式版本不会显示最新版。
- 完成前端测试、lint、构建及 Rust 测试、格式、Clippy，记录实际 UI 验收结果。

## Comments

- 用户明确要求完成全部任务，不需额外确认；本次不触发发布。
