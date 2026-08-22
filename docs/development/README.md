# 开发指南

> 状态：工程骨架已初始化，以下命令已在 macOS 验证。

## 预期环境

- Node.js 当前 LTS
- Rust stable
- Tauri 2 所需的平台工具链
- SQLite

## 开发命令

```bash
npm ci
npm run tauri dev
npm run lint
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

以 `package.json` 和 CI 中实际可运行的命令为准。业务变更至少覆盖 Rust 模块测试；配置解析和 adapter 行为使用文件夹具测试；关键桌面流程放入 `tests/e2e/`。

## 代码规范

完整规范见 [ADR-0005：代码架构规范与 SOLID 约束](../adr/0005-code-architecture-conventions.md)。

**审查时重点检查：**

- `persistence.rs` 超过约 300 行时须拆分为子模块
- agent、scope、format 等有限集合用 `enum` 而非裸 `String`
- Tauri command 依赖 repository trait，不依赖 `Database` 具体类型
- `run_migrations` 使用循环版本遍历，不硬编码版本号
- schema 中禁止出现 `token`、`secret`、`password`、`credential`、`content`、`raw_content` 列名
- `storage_summary` 等跨域诊断方法不归属于领域 repository trait

跨平台检查、打包和发布流程见 [CI/CD 与跨平台发布](ci-cd.md)。
发布前逐项执行 [V1 发布验收清单](release-checklist.md)，并把远程 run 结果回写 `.scratch/agent-hub-v1/issues/B14-release.md`。
