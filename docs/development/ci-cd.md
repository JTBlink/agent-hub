# CI/CD 与跨平台发布

> 状态：已落地基础工作流；生产签名凭据仍需在仓库 Secrets 中配置。

## 目标

GitHub Actions 负责持续检查和跨平台打包。普通提交和拉取请求只运行验证；版本 tag 负责构建完整安装包、生成校验和并创建 GitHub Release。

GitHub 在本项目只承担 CI/CD 自动化和发布产物承载；需求、任务依赖和开发状态以仓库内 `.scratch/` Markdown 为准。

## 工作流

### `ci.yml`

触发条件：拉取请求及 `main` 分支提交。

- 安装锁定版本的 Node.js、Rust stable 和平台依赖。
- 执行前端格式、lint、类型检查和测试。
- 执行 `cargo fmt`、Clippy 和 Rust 测试。
- 编译前端和 Rust 测试目标，但不生成安装包。
- 使用 npm 与 Cargo 缓存；锁文件变化时自动失效。

### `build-installers.yml`

触发条件：`main` 分支 push、`v*` tag 和手动 `workflow_dispatch`。`main` push 只生成预编译 artifact，不创建 GitHub Release；`v*` tag 在相同质量门禁和打包流程通过后创建正式 Release。

| Runner           | 目标                                    | 安装包              |
| ---------------- | --------------------------------------- | ------------------- |
| `windows-latest` | Windows x86_64                          | `.msi`、NSIS `.exe` |
| `macos-latest`   | macOS Universal (Apple Silicon + Intel) | `.dmg`              |
| `ubuntu-24.04`   | Linux x86_64                            | `.AppImage`、`.deb` |

使用 Tauri 官方构建工具生成平台原生包。预检任务先把输入的 branch、tag 或 commit 解析为不可变 commit SHA，后续质量门禁、三平台构建和汇总任务统一检出该 SHA。手动运行会上传各平台 artifacts，并额外上传包含全部安装包、`SHA256SUMS`、`CHANGELOG.md`、版本说明和支持矩阵的汇总 artifact；汇总任务还会运行 `release:verify`，在发布前检查五种安装格式、元数据和每一条校验和。正式 tag 同时创建 GitHub Release。汇总目录中的安装包会扁平化，`SHA256SUMS` 可直接在 Release 附件所在目录校验。

## 手动构建

在 GitHub Actions 中运行 `Build Installers` → `Run workflow` 即可手动预编译当前选中的分支。手动运行不需要填写额外参数，Actions artifact 固定保留 90 天，只上传候选安装包和汇总校验文件，不创建 GitHub Release，也不读取生产签名 Secrets。Actions artifact 不能永久保存；正式 tag 发布后，上传到 GitHub Release 的安装包和 `CHANGELOG.md` 会持续保留，直到手动删除 Release 或附件。

## Tag 发布

版本唯一维护在仓库根目录的 `VERSION` 文件。直接修改它后运行 `npm run version:sync`，即可同步生成 `package.json`、lockfile、Cargo 和 Tauri 版本号；也可以用 `npm run version:set -- <version>` 一步完成修改与同步。完成后提交版本变更并推送同名 tag：

```bash
npm run version:set -- 0.1.0
npm run version:check -- v0.1.0
git tag v0.1.0
git push origin v0.1.0
```

推送 `v*` tag 会先重新执行格式、lint、前端/Rust 测试和版本一致性校验，再触发全部平台构建。只有事件类型为 tag push 且所有质量门禁及矩阵任务成功后，工作流才读取生产签名 Secrets（若已显式开启）并创建 GitHub Release；任一环节失败都不会发布不完整的正式版本。

## 签名与密钥

- tag 发布默认生成未签名包。macOS 需要完整配置 `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID` 六项 Secrets，并将仓库 Variable `ENABLE_APPLE_SIGNING` 设为 `true`；只有 tag 的 macOS step 满足该开关时才读取 Secrets。
- Windows Authenticode 签名需要 `WINDOWS_CERTIFICATE`（Base64 PFX）、`WINDOWS_CERTIFICATE_PASSWORD`、`WINDOWS_SIGNING_TIMESTAMP_URL` 三项 Secrets，并将 `ENABLE_WINDOWS_SIGNING` 设为 `true`。tag 的 Windows step 使用 runner 的 `signtool.exe` 签署 `.exe`/`.msi`；开关关闭时生成明确标注的未签名包。
- 签名证书、密码和 Apple/Windows 凭据只存入 GitHub Actions Secrets；发布使用最小权限的内置 `GITHUB_TOKEN`。
- 手动构建永远不读取上述生产签名 Secrets；开关开启但 Secrets 不完整时，tag preflight 直接失败，不发布半签名产物。
- 来自 fork 的拉取请求不得访问发布密钥或执行发布步骤。

## 发布保护

- 仅 tag 对应的提交通过全部 CI 后才允许发布。
- release job 使用最小 `contents: write` 权限；仓库可进一步为正式发布配置受保护 Environment。
- 三个平台任一失败时不发布不完整的正式 Release。
- 发布后在干净虚拟机上验证安装、启动、数据库初始化和卸载。
