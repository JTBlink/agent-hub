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

| 目的             | 命令                                           | 结果                                           |
| ---------------- | ---------------------------------------------- | ---------------------------------------------- |
| 桌面开发         | `npm run app:dev`                              | 自动更新配套 CLI 后启动 Vite 与 Tauri 开发窗口 |
| 只构建前端       | `npm run build`                                | 类型检查后输出到 `dist/`，不生成安装包         |
| 当前平台安装包   | `npm run app:build`                            | release 安装包及配套 CLI                       |
| macOS 调试应用   | `npm run tauri -- build --debug --bundles app` | debug `.app`                                   |
| 运行 CLI         | `npm run cli -- --help`                        | 编译并运行开发 CLI                             |
| 编译 CLI         | `npm run cli:build`                            | debug CLI                                      |
| 编译 release CLI | `npm run cli:build -- --release`               | release CLI                                    |
| 安装 CLI         | `npm run cli:install`                          | Cargo 安装 CLI，默认放到 Cargo bin 目录        |
| 全量应用测试     | `npm run app:test`                             | 前端测试成功后运行 Rust 测试                   |
| 静态检查         | `npm run app:lint`                             | ESLint、Rust 格式和严格 Clippy 检查            |

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

## CLI 自动更新

项目入口编译 CLI 成功后会自动验证并更新 `~/.agent-hub/bin/agent-hub-cli` 与版本戳；已有的本仓库开发软链接也会指向本次产物。首次创建 PATH 软链接仍使用 `install --dev`。普通文件、其他项目的软链接保持原样，不会被自动覆盖。

```bash
npm run cli:build                       # debug 编译并更新本机 CLI
npm run cli:build -- --release          # release 编译并更新本机 CLI
npm run cli -- --help                   # 先编译、更新，再执行 CLI
./agent-hub.sh dev                      # 停止旧开发实例，更新 CLI 后启动 Tauri + React
```

Unix 下 `./agent-hub.sh dev` 与 `npm run app:dev` 会先核实当前仓库的旧开发进程及工作目录，发送终止信号并等待退出，3 秒后仍未退出则强制结束；停止失败不启动新实例。其他仓库与正式安装版不参与清理。前端端口被其他服务占用时正常报错，不按端口强杀进程。

`npm run app:dev`、`npm run tauri -- dev` 与上述 `dev` 使用同一入口。这里指 dev 启动阶段的配套 CLI 构建；长驻会话中的 Tauri 热更新不等于重新编译 CLI，修改 CLI 后可执行 `npm run cli:build`，或重新启动 dev。

构建失败不会发布新副本；验证／发布失败会明确返回失败，dev 不继续启动。跨架构构建不替换本机入口。相同版本号的重编译也会按内容更新，不能只用 `--version` 验收。构建与发布提示输出到 stderr，不混入 CLI JSON 结果。

`AGENT_HUB_BRIDGE_DIR` 可指定发布目录；`AGENT_HUB_CLI_BIN_DIR` 或 `CARGO_HOME/bin` 决定已有开发软链接的位置。桌面启动也会校验并更新其配套副本；开发中应使用匹配的新桌面构建，避免启动旧应用后重新发布旧版 CLI。

开发交付要求见[开发规范](../.agents/skills/rust-dev/references/development.md#cli-自动更新约定)。

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

## 标准版与个人版

默认构建标准版；显式选择 `personal` 构建个人版。个人版不包含 Herdr 集成，普通终端、原生 Agent 启动及其他公共能力保留。产品与 `debug`／`release` 是两个独立维度。

```bash
./agent-hub.sh build                                      # 标准版 release
./agent-hub.sh build --product standard --debug            # 标准版 debug
./agent-hub.sh build --product personal --debug --bundles app
./agent-hub.sh dev --product personal                   # 个人版开发环境
./agent-hub.sh install --dev debug --product personal   # 个人版开发 CLI
npm run build -- --product personal                     # 只构建个人版前端
npm run cli:build -- --product personal                 # 编译个人版 CLI
```

`--product` 可放在命令前或后；Windows 的 `agent-hub.bat` 与 npm 入口使用相同解析规则。`products/standard.json`、`products/personal.json` 是公开示例，可通过产品配置文件路径选择其他组合；当前仅支持 Herdr 的完整可选性。

| 内容                         | 标准版                                                     | 个人版                                        |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| 产品 ID                      | `standard`                                                 | `personal`                                    |
| 应用名称                     | AgentHub                                                   | AgentHub Personal                             |
| 应用 identifier              | `com.jtstudio.agenthub`                                    | `com.jtstudio.agenthub.personal`              |
| 默认开发端口                 | 1420                                                       | 1421                                          |
| Cargo 输出根目录             | `src-tauri/target/`                                        | `src-tauri/target-products/<产品与配置摘要>/` |
| 前端、类型检查、sidecar 暂存 | `node_modules/.cache/agent-hub/products/<产品与配置摘要>/` | 同一父目录下的独立产品子目录                  |
| 默认用户数据及技能内容       | `~/.agent-hub/`                                            | `~/.agent-hub-products/personal/`             |
| CLI bridge                   | `~/.agent-hub/bin/`                                        | 独立产品数据目录中的独立 bridge 命名空间      |

运行产品的 `build-info` 命令可查看实际产品 ID、功能集合、配置摘要与基础提交。CLI bridge 同时验证版本和产品构建信息，相同版本号不代表可以互换。个人版开发 CLI 不覆盖标准版的 PATH 入口。

设置 `CARGO_TARGET_DIR` 时，标准版沿用该目录，其他产品使用其同级的 `<目录名>-products/`，避免共用根可执行文件或被标准清理影响。共享 Cargo 下载缓存不改变产品输出隔离。

产品 ID 决定稳定的运行数据身份，配置摘要决定构建产物身份。更改某产品的功能集合不清空数据，也不自动迁移标准版资料。已有项目、外部 Agent 登录和系统资源仍按用户明确操作访问；隔离不等于复制整个系统环境。
