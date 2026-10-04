# 开发指南

代码设计、SOLID 原则与模块边界见[开发规范](coding-standards.md)；文件拆分触发线见 [ADR-0006](../adr/0006-file-size-and-reuse-conventions.md)。

安装 Node.js 22、Rust stable、平台 Tauri 2 依赖，然后在仓库根目录运行：

```bash
npm ci
npm run app:dev
```

`npm run app:build` 构建当前平台安装包。macOS 本地调试包可用 `npm run tauri -- build --debug --bundles app`。所有打包入口自动编译 `agent-hub-cli`；不要绕过包装脚本直接构建发布包。

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

前端、桌面端和 CLI 共用根版本；使用 `npm run version:set -- <version>` 更新。提交遵循[提交规范](commit-conventions.md)，任务状态回写 `.scratch/`；发布方式见 [CI/CD](ci-cd.md)。
