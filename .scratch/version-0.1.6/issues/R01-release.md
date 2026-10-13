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

## Preparation

- Skill 提交：48b0d72，已 push main。
- 隔离检出中同步六个版本文件为 0.1.6，归档已提交 main 的 Unreleased 说明，保留新的 Unreleased。
- Node.js 22.23.3 / npm 10.9.8 干净 npm ci 通过；全仓 Prettier、ESLint、403 项测试、TypeScript / Vite 前端构建、官网与文档构建、版本和任务检查通过。Rust 门禁与三平台原生安装验收由同 SHA 候选执行。
- 版本固定为 0.1.6；尚未创建 tag，先等待候选完整验证。
