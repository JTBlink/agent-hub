Type: task
Status: resolved
Blocked by: B01

## Scope

首页管理 Skill 入口需检查技能库和 Agent 实际部署路径，并在内置版本升级或远端更新可用时提示更新。路径已被其他内容占用时提供检查提示，不覆盖目标。

## Result

新增桌面状态查询，复用现有部署路径解析，读取技能库和 Agent 目录的 `SKILL.md` 名称与版本。首页分别提示安装、部署、更新及路径检查；Git 来源通过已有更新命令处理，可能移除文件时引导到技能库审阅。

验证：`cargo test --manifest-path src-tauri/Cargo.toml`（624 通过、8 忽略）、`cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 均通过。
