Type: task
Status: resolved
Blocked by: none

# 修复完整 SSH URL 被改写为 GitHub 仓库

## Comments

- 校验层允许 `ssh://`，但 `normalize_url` 的完整 URL 分支漏掉 SSH，导致地址进入 GitHub 简写分支并重复追加 `.git`。
- 修复前已执行回归测试，实际产生 `https://github.com/ssh://git@git.example.invalid:11022/team/skills.git.git` 并断言失败，复现用户报告。
- 在历史大模块中仅修补现有条件并补充行为测试，不新增业务职责或进行无关重构。
- 测试使用保留域名，不连接真实私有仓库。

## Result

- [共享解析器](../../../src-tauri/src/core/git_fetcher.rs) 对完整 `ssh://` 地址直接透传，保留主机、端口及路径，桌面预览、安装和 CLI 共用修复。
- 新增回归测试覆盖 HTTPS、HTTP、SCP 风格 SSH、自定义端口、嵌套路径、无后缀及普通 `tree` 路径，同时验证同步解析和安装预览使用的 resolved 入口。
- Git 模块测试：64 项通过，3 项网络测试忽略。Rust 全量测试：库测试 704 项及 CLI 测试 8 项通过，8 项测试忽略。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 和 `git diff --check` 通过。
- Standards：复用现有解析边界，安全校验、认证、IPC 及缓存规则保持兼容；测试无真实账户信息。Spec：SSH 地址不再拼接 GitHub 前缀，已有 GitHub 简写与分支链接测试通过，已更新 CHANGELOG。
- 未连接真实私有仓库，未启动桌面应用验收，未执行提交、打包或发布；正在运行的旧版应用需使用重新构建后的版本才能生效。
