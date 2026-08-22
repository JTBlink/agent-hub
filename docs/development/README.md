# 开发指南

> 状态：规划中；命令将在项目脚手架初始化后验证。

## 预期环境

- Node.js 当前 LTS
- Rust stable
- Tauri 2 所需的平台工具链
- SQLite

## 预期命令

```bash
npm install
npm run tauri dev
npm run lint
npm test
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

脚手架创建后，应以 `package.json` 和 CI 中实际可运行的命令为准，并更新本文件。业务变更至少覆盖 Rust 模块测试；配置解析和 adapter 行为使用文件夹具测试；关键桌面流程放入 `tests/e2e/`。

跨平台检查、打包和发布流程见 [CI/CD 与跨平台发布](ci-cd.md)。
