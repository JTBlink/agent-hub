# 编译、打包与安装

以下命令均在仓库根目录执行。桌面与 CLI 共用 Rust core，桌面打包入口会先构建前端和配套 CLI，再调用 Tauri 打包。

## 环境准备

- Node.js 22、npm、Rust stable（包含 Cargo）。
- macOS：安装 Xcode Command Line Tools；生成 DMG 需在 macOS 上执行。
- Windows：安装 Visual Studio C++ Build Tools、Windows SDK 和 WebView2。
- Linux：安装目标发行版的 Tauri 2 系统依赖，包括 WebKitGTK 4.1 开发库及对应打包工具。

平台支持与依赖详情见[平台说明](../.agents/skills/github-cli/references/platform-support.md)。

```bash
npm ci
npm run version:check
```

## 常用命令

| 目的             | 命令                                           | 结果                                    |
| ---------------- | ---------------------------------------------- | --------------------------------------- |
| 桌面开发         | `npm run app:dev`                              | 启动 Vite 与 Tauri 开发窗口             |
| 只构建前端       | `npm run build`                                | 类型检查后输出到 `dist/`，不生成安装包  |
| 当前平台安装包   | `npm run app:build`                            | release 安装包及配套 CLI                |
| macOS 调试应用   | `npm run tauri -- build --debug --bundles app` | debug `.app`                            |
| 运行 CLI         | `npm run cli -- --help`                        | 编译并运行开发 CLI                      |
| 编译 CLI         | `npm run cli:build`                            | debug CLI                               |
| 编译 release CLI | `npm run cli:build -- --release`               | release CLI                             |
| 安装 CLI         | `npm run cli:install`                          | Cargo 安装 CLI，默认放到 Cargo bin 目录 |
| 全量应用测试     | `npm run app:test`                             | 前端测试成功后运行 Rust 测试            |
| 静态检查         | `npm run app:lint`                             | ESLint、Rust 格式和严格 Clippy 检查     |

Unix 也可执行 `./agent-hub.sh build`；Windows 可执行 `agent-hub.bat build`。参数继续传给 Tauri，例如 `npm run app:build -- --bundles dmg`。默认构建本机架构；显式目标通过 `--target <triple>` 指定，并需事先安装相应 Rust target 和原生工具链。

请使用项目包装入口打包，使 sidecar 与桌面版本一致。普通本地打包不会创建 Git tag 或发布 Release；签名、更新器与正式发布见[发布流程](../.agents/skills/github-cli/references/release-flow.md)。

## 产物位置与安装

默认 Cargo 构建目录为 `src-tauri/target/`：

- CLI：`debug/agent-hub-cli` 或 `release/agent-hub-cli`，Windows 带 `.exe` 后缀。
- 桌面安装包：`release/bundle/`；debug 打包在 `debug/bundle/`。
- 指定 `--target` 后，在构建目录与 profile 之间增加目标架构目录，例如 `src-tauri/target/aarch64-apple-darwin/release/bundle/`。
- sidecar 暂存于 `src-tauri/binaries/`，由脚本生成，不手动维护。

macOS 可打开生成的 DMG，将应用拖入 Applications；Windows 运行生成的安装程序；Linux 使用生成的 deb/rpm 或 AppImage。`./agent-hub.sh install` 的含义是**构建安装包**，需要随后手动安装桌面应用。

Unix 开发环境只更新 CLI 时可执行：

```bash
./agent-hub.sh install --dev
./agent-hub.sh install --dev release
```

这会构建 CLI，将 Cargo bin 目录中的 `agent-hub-cli` 链接到本仓库产物，并更新 `~/.agent-hub/bin/agent-hub-cli` bridge。已有普通文件或指向其他位置的链接会被拒绝覆盖。`AGENT_HUB_CLI_BIN_DIR` 和 `AGENT_HUB_BRIDGE_DIR` 可调整安装位置。此入口固定使用本仓库的 `src-tauri/target/`。

## 自动清理与缓存复用

以下项目入口会自动清理历史产物：

- 桌面打包成功后；桌面开发会话正常退出后。
- CLI 编译、安装成功后；`npm run cli` 成功运行并退出后。
- `app:test`、`app:lint` 全部成功后。
- `./agent-hub.sh install --dev` 复用 CLI 构建入口的清理逻辑。

同一架构、debug/release、编译模式和 feature 配置保留最新应用产物；安装包按名称、架构和格式保留最近构建的一份，并删除旧包签名。不同配置各保留一份；共享依赖、build-script 输出与增量缓存保留供下次复用。CLI 安装显式复用项目构建目录，避免每次使用临时目录重编依赖。

失败或被信号中断的构建保留产物。开发热更新期间不逐轮清理；直接运行 `cargo build/test/clippy` 不会触发项目脚本。清理会跳过本轮调用开始后更新的文件，因此保护中的残留可能在下次成功调用时才删除。清理失败报告原因，不改变成功构建的退出状态。

可在没有其他 Cargo 编译运行时手动清理：

```bash
npm run app:prune -- --dry-run  # 只预览
npm run app:prune              # 清理历史产物，保留最新构建及共享依赖
npm run app:clean              # 删除全部 Cargo 构建缓存，下次需要重新编译
```

默认入口支持 `CARGO_TARGET_DIR`；CLI 构建/安装也支持 `--target-dir <目录>`，显式参数优先于环境变量。相对目录从仓库根目录解析。清理目标与 CLI 实际编译目录一致。

## 常见问题

- **找不到 Cargo**：安装 Rust stable，并确保 `cargo`、`rustc` 在 PATH 中。
- **前端检查失败**：先执行 `npm run build` 查看具体错误；该阶段失败不会继续打包。
- **缺少 sidecar**：通过 `npm run app:build` 或 `npm run tauri -- build` 重新构建。
- **缓存持续增长**：先退出编译进程，再执行 `app:prune -- --dry-run`。共享依赖和增量缓存仍占空间是预期行为；确需彻底重建时使用 `app:clean`。
- **跨平台构建失败**：Rust target 不能替代目标平台的 SDK、链接器和打包工具。优先在对应平台构建并验收。
