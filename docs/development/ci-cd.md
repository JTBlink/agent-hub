# CI/CD 与跨平台发布

> 状态：规划中；Tauri 工程初始化后落地工作流。

## 目标

GitHub Actions 负责持续检查和跨平台打包。普通提交和拉取请求只运行验证；版本 tag 负责构建完整安装包、生成校验和并创建 GitHub Release。

## 工作流

### `ci.yml`

触发条件：拉取请求及 `main` 分支提交。

- 安装锁定版本的 Node.js、Rust stable 和平台依赖。
- 执行前端格式、lint、类型检查和测试。
- 执行 `cargo fmt`、Clippy 和 Rust 测试。
- 执行 Tauri 构建检查，但不发布安装包。
- 使用 npm 与 Cargo 缓存；锁文件变化时自动失效。

### `release.yml`

触发条件：`v*` tag 和手动 `workflow_dispatch`。

| Runner | 目标 | 安装包 |
| --- | --- | --- |
| `windows-latest` | Windows x86_64 | `.msi`、NSIS `.exe` |
| `macos-latest` | macOS Apple Silicon / Intel | `.dmg`、`.app` bundle |
| `ubuntu-latest` | Linux x86_64 | `.AppImage`、`.deb` |

使用 Tauri 官方构建工具生成平台原生包。所有产物上传为 Actions artifacts；正式 tag 同时创建 GitHub Release，附带 `SHA256SUMS`、版本说明和支持矩阵。

## 签名与密钥

- macOS 使用 Developer ID 签名并执行 notarization。
- Windows 配置代码签名证书；无签名的测试构建必须明确标记。
- 签名证书、密码、Apple 凭据和发布 Token 只存入 GitHub Actions Secrets。
- 来自 fork 的拉取请求不得访问发布密钥或执行发布步骤。

## 发布保护

- 仅 tag 对应的提交通过全部 CI 后才允许发布。
- release job 使用最小 `contents: write` 权限，并绑定受保护 Environment。
- 三个平台任一失败时不发布不完整的正式 Release。
- 发布后在干净虚拟机上验证安装、启动、数据库初始化和卸载。
