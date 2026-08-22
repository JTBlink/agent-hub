# agent-hub

AgentHub —— AI Agent 工作空间管理器

## 文档

项目设计与开发文档见 [`docs/`](docs/README.md)。
重大变更记录见 [`CHANGELOG.md`](CHANGELOG.md)。
需求、任务依赖和开发状态见 [`.scratch/agent-hub-v1/`](.scratch/agent-hub-v1/README.md)。
任务总状态索引见 [`.scratch/agent-hub-v1/status.md`](.scratch/agent-hub-v1/status.md)。

## 本地开发

```bash
npm ci
./start.sh
```

`./start.sh` 会启动 Tauri 开发模式；需要传递 Tauri 参数时直接追加，例如 `./start.sh --config src-tauri/tauri.conf.json`。生成当前平台安装包可运行 `./build.sh`，参数会原样传给 `tauri build`。两个入口都会读取 `package.json` 中的应用版本；运行 `./start.sh --version` 可仅查看版本号。

提交前运行 `npm run format:check`、`npm run lint`、`npm run test` 和 Rust 检查，完整命令见 [`docs/development/`](docs/development/README.md)。

## CI/CD

GitHub 仅用于 Actions 持续集成、跨平台安装包构建和 Release；需求、依赖与开发状态不存放在 GitHub Issues/Projects 中。

- `CI`：主分支、Pull Request 或手动触发，执行前端和 Rust 全部检查。
- `Build Installers` 手动触发：构建 Windows、macOS Universal 和 Linux 安装包，保存为 Actions artifacts。
- 推送 `v*` tag：验证 tag 与应用版本一致，构建全部平台，生成 `SHA256SUMS` 并创建 GitHub Release。

详细操作和签名配置见 [CI/CD 文档](docs/development/ci-cd.md)。
