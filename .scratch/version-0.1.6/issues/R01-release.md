Type: task
Status: claimed
Blocked by: none

# 自动选版并发布 0.1.6

## Acceptance

- VERSION、前端、Rust、Tauri 和锁文件同步为 0.1.6，已提交的 Unreleased 内容归档。
- 固定 SHA 的三平台质量、core tests、安装 smoke 和汇总全部通过；release:ready 通过后创建 tag。
- main 单线、tag 精确推送；正式 Actions、官网和 Release 产物校验完成，记录签名与验收边界。
- 保留其他任务未提交改动，续发不重新升级版本。

## Selection

- 当前 VERSION：0.1.5。
- 远端最新稳定版 tag：v0.1.5；选版 reason：patch。
- 固定目标版本：0.1.6，tag：v0.1.6。

## Comments

- 候选与正式发布 SHA / run ID 将在实际触发后写入本任务。
