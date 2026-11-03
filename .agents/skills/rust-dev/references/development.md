# 开发指南

代码设计、SOLID 原则与模块边界见[开发规范](coding-standards.md)；文件拆分触发线见 [ADR-0006](../../../../docs/adr/0006-file-size-and-reuse-conventions.md)。

GitHub 登录配置与网页品牌维护见 [OAuth App 操作流程](github-oauth-setup.md)。

安装 Node.js 22、Rust stable、平台 Tauri 2 依赖，然后在仓库根目录运行：

```bash
npm ci
npm run app:dev
```

`npm run app:build` 构建当前平台安装包。macOS 本地调试包可用 `npm run tauri -- build --debug --bundles app`。所有打包入口自动编译 `agent-hub-cli`；不要绕过包装脚本直接构建发布包。

命令、产物目录、安装步骤与自动清理范围见[编译、打包与安装](../../../../docs/build-and-install.md)。

## CLI 自动更新约定

- 开发与交付必须使用项目入口：`npm run cli:build`、`npm run cli`、`npm run cli:install`、`./agent-hub.sh install --dev [debug|release]`，以及 `npm run app:dev`／`./agent-hub.sh dev`。编译成功后校验产物并自动发布到 CLI bridge，无需再手工安装。直接 `cargo build` 不执行 Node 编译钩子，不能作为本机 CLI 已更新的交付证据。
- `dev` 启动时先构建、验证和发布配套 CLI，再启动 Tauri；同时更新桌面可执行文件旁的 CLI，防止桌面启动后重新发布旧副本。发布失败时停止启动并报告原因，不得静默沿用旧 CLI。
- `~/.agent-hub/bin/agent-hub-cli` 是经过验证的独立副本；PATH 中经本仓库 `install --dev` 建立的开发软链接跟随本次成功构建的产物。自动更新只调整已存在且属于本仓库构建目录的软链接，保留普通文件和其他项目链接；不擅自创建 PATH 入口。
- 跨架构产物只用于目标平台，不覆盖本机 CLI；本机架构或可在本机运行的 universal 产物才允许自动发布。编译失败不发布；发布失败返回失败，版本戳只在新副本通过验证后写入。
- 相同 `VERSION` 的重编译也必须按内容更新。验收应检查实际使用的入口、新命令的 `--help` 和代表性只读操作；不能仅凭版本号相同判定已经更新。JSON 模式的 stdout 保持命令结果，构建发布提示写入 stderr。
- 配置格式升级前，先确认旧进程已停止、当前运行实例能识别新格式，再执行本地迁移。涉及桌面行为的改动需重启到已验证的新构建，检查页面和配套 CLI 均生效，不把“源码已改／文件已迁移”当作运行效果。

产物目录、可覆盖范围和操作命令见[编译、打包与安装](../../../../docs/build-and-install.md#cli-自动更新)。

## 检查

```bash
npm run version:check
npm run tasks:check
npm run format:check
npm run lint
npm test
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Rust 单元测试使用临时目录；需要网络仓库的 tag 测试默认忽略，显式配置测试 fixture 后才运行。包内 `agent-hub --smoke` 验证隔离数据库初始化和重开，不启动 UI。

本地默认数据位于 `~/.agent-hub`，不自动迁移其他应用数据。不要把运行数据、截图中的个人信息或访问令牌提交到仓库。

前端、桌面端和 CLI 共用根版本；使用 `npm run version:set -- <version>` 更新。提交遵循[提交规范](commit-conventions.md)，任务状态和里程碑回写 GitHub Issues。普通开发不创建 tag 或发布 Release。
