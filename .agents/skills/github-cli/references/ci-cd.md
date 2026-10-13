# CI/CD 与跨平台发布

> 状态：已落地基础工作流；生产签名凭据仍需在仓库 Secrets 中配置。

## 目标

GitHub Actions 负责质量检查、跨平台打包和主页部署。安装包与主页工作流支持推送 `v*` 版本 tag 或手动 `workflow_dispatch` 触发，独立 CI 工作流仅支持手动触发；普通分支提交和拉取请求不自动运行。版本 tag 负责构建完整安装包、生成校验和并创建 GitHub Release。

GitHub 在本项目只承担 CI/CD 自动化和发布产物承载；需求、任务依赖和开发状态以仓库内 `.scratch/` Markdown 为准。

## 工作流

### `ci.yml`

触发条件：仅手动 `workflow_dispatch`；tag 的质量门禁已由 `build-installers.yml` 执行，避免重复检查。

- 安装锁定版本的 Node.js、Rust stable 和平台依赖。
- 执行前端格式、lint、类型检查和测试。
- 执行 `cargo fmt`、Clippy 和 Rust 测试。
- 编译前端和 Rust 测试目标，但不生成安装包。
- 使用 npm 与 Cargo 缓存；锁文件变化时自动失效。

### `build-installers.yml`

触发条件：推送 `v*` tag 或手动 `workflow_dispatch`。手动运行只生成预编译 artifact，不创建 GitHub Release；`v*` tag 在质量门禁和打包流程通过后创建正式 Release。

| Runner           | 目标                                    | 安装包              |
| ---------------- | --------------------------------------- | ------------------- |
| `windows-latest` | Windows x86_64                          | NSIS `.exe`         |
| `macos-latest`   | macOS Universal (Apple Silicon + Intel) | `.dmg`              |
| `ubuntu-24.04`   | Linux x86_64                            | `.AppImage`、`.deb` |

使用 Tauri 官方构建工具生成平台原生包。预检任务检出事件的 `github.sha`，避免等待 Runner 时 branch / tag 前进导致源码变化；并发组按事件与 SHA 隔离，正常运行不被新候选取消。后续质量门禁、三平台构建和汇总任务统一检出该 SHA。手动运行会上传各平台 artifacts；汇总任务生成全部安装包、`SHA256SUMS`、`CHANGELOG.md`、版本说明和支持矩阵，并运行 `release:verify` 检查四种安装格式、元数据和每一条校验和。当前 workflow 没有上传汇总 artifact，不能将汇总目录描述为可下载候选。正式 tag 同时创建 GitHub Release。汇总目录中的安装包会扁平化，`SHA256SUMS` 可直接在 Release 附件所在目录校验。

平台构建命令统一经过 `scripts/build.mjs` 编排。Unix 使用 `./agent-hub.sh build`，Windows 使用 `agent-hub.bat build`，CI 使用 `npm run app:build -- <Tauri 参数>`；这些入口只在当前平台的原生 Runner 上生成该平台安装包，不能替代 macOS、Windows 和 Linux 之间的交叉编译工具链。

### `deploy-pages.yml`

触发条件：推送 `v*` tag 或手动 `workflow_dispatch`。通过锁定 Node.js 22 和 `npm ci`，校验版本与共享帮助内容，构建并部署对应版本的产品主页和 VitePress 文档站。统一产物为 `_site/`，公开文档位于 `/agent-hub/docs/`；普通主页或文档文件变更不自动部署。

仓库 Settings → Pages → Build and deployment → Source 必须选择 **GitHub Actions**（Pages API 的 `build_type: workflow`）。不要选择从 main 根目录发布：根 `index.html` 是桌面开发入口，会请求未发布的 `/src/main.tsx` 并返回 404。工作流通过 `scripts/check-pages-config.mjs` 在部署前核实真实发布源；API 查询失败或 legacy 模式都阻止发布。修复后从 main 手动运行本工作流并核验线上主页、文档和资源，不为官网修复重建版本 tag。

更新依赖锁文件后，使用 CI 对应的 npm 10 执行干净 `npm ci`；本机 npm 11 的检查不能代替这一步。VitePress 的 DocSearch 依赖可能需要独立的 React 18 peer 依赖，不能用 `--legacy-peer-deps` 绕过锁文件一致性校验。

## 手动构建

在 GitHub Actions 中运行 `Build Installers` → `Run workflow` 即可手动预编译当前选中的分支。手动运行不需要填写额外参数，平台 artifacts 保留 1 天，只上传各平台候选安装包；汇总目录经过校验，但当前没有汇总 artifact 上传步骤，不创建 GitHub Release，也不读取生产签名 Secrets。Actions artifact 不能永久保存；正式 tag 发布后，上传到 GitHub Release 的安装包和 `CHANGELOG.md` 会持续保留，直到手动删除 Release 或附件。

## Tag 发布

正式发布时由 Agent 根据远端 tag 自动判断是否升级 VERSION，核对上一个正式 tag 到发布 SHA 的提交并自动补全该版本 CHANGELOG，串联版本同步、提交 push、候选验证、tag、正式构建与下载验收；发布期间纳入的修复更新同一版本，指定版本和失败续发保持原版本。版本选择、增量说明、幂等检查与恢复见 [发布流程](release-flow.md)。现有 workflow 不自行升级版本或创建 tag。

版本唯一来源为根目录 `VERSION`，发布 tag 固定为 `v<version>`；版本同步、发布提交和 annotated tag 的完整操作统一维护于 [发布流程](release-flow.md)，不在此重复维护。

推送 `v*` tag 会先重新执行格式、lint、前端/Rust 测试和版本一致性校验，再触发全部平台构建。生产签名 Secrets 仅在已启用的 tag preflight 和对应平台 step 中读取；所有质量门禁及矩阵任务成功后才创建 GitHub Release；任一环节失败都不会发布不完整的正式版本。

tag preflight 还会验证同一提交已有成功的手动三平台 Build Installers 候选；发布前运行 `npm run release:ready -- v<version>`，没有候选或 SHA 不同则阻止发布。各平台 Rust core tests 在安装包编译前执行，候选与 tag 的并发组独立。仅默认分支写入 Rust 缓存，平台 artifacts 继续保留 1 天；公共仓库当前标准 Runner 运行分钟免费，存储与 larger Runner 分别计费，详见 [发布前验证与资源控制](release-prevention.md)。

## 签名与密钥

- tag 发布默认生成未签名包。macOS 需要完整配置 `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID` 六项 Secrets，并将仓库 Variable `ENABLE_APPLE_SIGNING` 设为 `true`；只有 tag 的 macOS step 满足该开关时才读取 Secrets。Tauri 在同一 tag-only step 中使用 Apple ID、应用专用密码和 Team ID 执行 notarization；任一公证凭据缺失时 preflight 失败，不会发布半签名包。
- Windows Authenticode 签名需要 `WINDOWS_CERTIFICATE`（Base64 PFX）、`WINDOWS_CERTIFICATE_PASSWORD`、`WINDOWS_SIGNING_TIMESTAMP_URL` 三项 Secrets，并将 `ENABLE_WINDOWS_SIGNING` 设为 `true`。tag 的 Windows step 使用 runner 的 `signtool.exe` 签署 `.exe`；开关关闭时生成明确标注的未签名包。
- 签名证书、密码和 Apple/Windows 凭据只存入 GitHub Actions Secrets；发布使用最小权限的内置 `GITHUB_TOKEN`。
- 手动构建永远不读取上述生产签名 Secrets；开关开启但 Secrets 不完整时，tag preflight 直接失败，不发布半签名产物。
- 来自 fork 的拉取请求不得访问发布密钥或执行发布步骤。
- macOS notarization 不使用工作流输入或明文配置；公证凭据只通过 GitHub Actions Secrets 注入 tag job，手动构建和非 tag 事件不会读取这些变量。

## 发布保护

- 仅 tag 对应的提交通过全部 CI 后才允许发布。
- release job 使用最小 `contents: write` 权限；仓库可进一步为正式发布配置受保护 Environment。
- 三个平台任一失败时不发布不完整的正式 Release。
- 发布后在干净虚拟机上验证安装、启动、数据库初始化和卸载。
