# 当前系统架构

agent-hub 使用单个 Tauri 2 桌面应用和 React 前端，业务实现来自导入的 Skills Manager。原配置管理宿主与独立 Skills 子进程已退役，替换决策见 [ADR-0008](../adr/0008-primary-application.md)。

前端 `src/App.tsx` 组合路由与 Provider，`views/` 提供总览、技能库、工作空间、项目、安装、备份和设置页面。可复用界面在 `components/`，状态和共享逻辑在 `context/`、`hooks/`、`lib/`。

`src-tauri/src/commands/` 提供桌面命令，`core/` 管理技能仓库、SQLite、工具适配、Git 和同步。`src-tauri/src/bin/agent-hub-cli.rs` 与桌面端共享核心逻辑。`main.rs` 仅负责启动及包内 smoke 分支。

`src-tauri/src/core/central_repo.rs` 统一解析库路径、配置和日志路径；`cli_bridge.rs` 负责将同版本 CLI 发布到固定的应用目录。应用默认根目录为 `~/.agent-hub`，不自动迁移旧数据库。

开发与打包共用 `scripts/primary-app.mjs`：先构建同版本 CLI，再把它作为 sidecar 放入主应用安装包。macOS Universal 的 CLI 同样合并两种架构。

继承代码中仍有超大页面和 Rust 模块，按 [ADR-0006](../adr/0006-file-size-and-reuse-conventions.md) 在后续功能修改时逐步拆分，避免本次主入口切换同时重写核心行为。
