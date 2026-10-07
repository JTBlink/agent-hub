# B23：减少 Git 备份凭证的重复钥匙串弹窗

Type: task
Status: claimed
Blocked by: none

## Scope

检查 Git 备份凭证读取与开发构建签名。进程内共享凭证读取结果，合并并发读取；登录与退出立即更新缓存，拒绝授权后避免后台反复弹窗。保留 OS 钥匙串存储和系统授权边界。

## Acceptance

- 用隔离后端计数验证重复读取、并发读取、拒绝与凭证变更，不读取真实钥匙串。
- 说明开发版签名变化仍可能需要系统重新授权，不承诺绕过 macOS。
- 更新文档、CHANGELOG 并通过 Rust 测试、格式与严格 Clippy。
