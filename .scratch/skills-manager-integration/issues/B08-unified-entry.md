# B08：统一 Skills 管理入口并移除旧功能

Type: task
Status: resolved
Blocked by: B00

## 目标

用户要求删除 AgentHub 原 Skills 入口相关功能，统一使用已导入模块。沿用独立模块边界，通过独立管理窗口接入。

## 验收标准

- Skills 导航启动新模块，有启动失败和重试反馈。
- 移除旧盘点、安装、更新、卸载、深链接安装和诊断迁移入口，撤销对应 Tauri 命令。
- 配置管理、配置历史和工作空间行为保留；已有技能文件和旧数据库保留。
- 开发和安装包构建均包含管理器及 CLI，不依赖外部 checkout 或开发服务器。
- 大页面和 command 文件拆分；运行前端、Rust 和真实桌面编译验证，记录平台限制。

## Comments

- 2026-10-04：根据用户追加要求执行；先完成独立进程接入，库化和数据迁移后续处理。
- 2026-10-04：提交前完成 Standards 与 Spec 两轴审查。宿主代码的模块边界、文件体量、固定启动路径、更新权限隔离及测试记录符合本次约束；入口替换、旧命令撤销、数据保留和打包接入与追加需求一致。后续仍需验证管理器 GUI、Windows/Linux/Universal 安装包，并处理上游新版提示与原始源码规范适配。

## Result

- Skills 导航统一启动内置管理器独立窗口，提供启动失败和重试反馈。主应用仅允许启动同目录固定二进制。
- 删除原 Skills 页面、扫描器、安装器、深链接及相关 IPC；配置、工作空间和历史能力保留。旧数据库、来源缓存及实际技能文件保留。
- 前端页面与 Rust commands 按职责拆分，满足文件体量限制。导入模块的 309 个文件散列、大小、执行权限仍与来源清单一致；来源仓库仍干净。
- 开发/桌面构建自动编译并携带管理器与 CLI；支持目标架构参数，Universal 同时准备分架构及合并产物。内置副本通过构建覆盖权限禁用上游应用更新安装，避免替换宿主包。
- 主要文件：[独立模块说明](../../../modules/README.md)、[ADR-0007](../../../docs/adr/0007-independent-skills-manager.md)、[构建入口](../../../scripts/tauri-with-skills.mjs)、[启动命令](../../../src-tauri/src/skills_module.rs)。

验证：

- `npm test`：19 个文件、75 项测试通过；`npm run build` 通过。
- `npm run lint`：通过，保留已有 `Modal.tsx` Fast Refresh 警告。
- `cargo test --manifest-path src-tauri/Cargo.toml --locked`：68 项测试通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` 和严格 Clippy 通过。
- `npm run tauri -- build --debug --bundles app`：macOS ARM64 `.app` 构建通过；包内管理器和 CLI 可执行文件与构建产物散列一致。
- 包内主程序 `--smoke` 与 CLI `--help` 通过；内置管理器包含宿主更新权限配置。
- 本次变更文件 Prettier、根版本检查及排除原始上游快照的 `git diff --check` 通过。

限制：未启动管理器 GUI 或触发其真实用户目录初始化；Windows、Linux 和 macOS Universal 安装包尚待各平台验证。上游新版提示可能仍显示，但内置副本不能通过它安装应用更新。未迁移数据或发布。
