# 仓库贡献指南

## 项目结构与模块组织

本仓库目前是 AgentHub（AI Agent 工作空间管理器）的早期脚手架。根目录包含 `README.md`、`LICENSE` 和仓库配置，尚未提交应用 crate 或测试套件。根据面向 Rust 的 `.gitignore`，项目预计使用 Cargo。

创建首个 crate 时，请采用标准 Rust 目录结构：

- `src/`：存放生产代码；保持 `main.rs` 精简，将可复用逻辑放入职责明确的模块或 `lib.rs`。
- `tests/`：存放跨模块集成测试。
- `assets/`：仅存放运行时必需的静态资源。
- `docs/`：存放不适合写入 README 的详细设计说明。

## 构建、测试与开发命令

仓库暂时没有 `Cargo.toml`，因此目前没有可用的构建或测试命令。初始化 Rust crate 后，应使用：

- `cargo run`：构建并在本地运行应用。
- `cargo build`：仅编译项目，不运行程序。
- `cargo test`：运行单元测试、集成测试和文档测试。
- `cargo fmt --all -- --check`：检查代码格式。
- `cargo clippy --all-targets --all-features -- -D warnings`：执行严格的静态检查。

引入工作空间、任务运行器或平台专用流程后，请同步更新本节。

## 编码风格与命名约定

使用标准 `rustfmt` 格式（四空格缩进），并解决所有 Clippy 警告。模块、函数和变量使用 `snake_case`；类型和 trait 使用 `UpperCamelCase`；常量使用 `SCREAMING_SNAKE_CASE`。优先创建职责单一的小型模块，提供清晰的错误信息，并为公开 API 编写文档。不要提交 `target/`、`debug/`、变异测试产物或 IDE 元数据。

## 测试规范

单元测试应与被测代码放在一起，并使用 `#[cfg(test)]`；公开行为和端到端流程放入 `tests/*.rs`。测试名称应描述具体行为，例如 `creates_workspace_with_default_settings`。每次修复缺陷都应添加回归测试。提交拉取请求前，请运行 `cargo test`、格式检查和 Clippy 检查。

## 提交与拉取请求规范

当前历史记录仅有 `Initial commit`，尚未形成正式的提交规范。提交标题应简洁并采用祈使语气，例如 `Add workspace configuration loader`；每个提交只处理一个明确事项。拉取请求应说明问题与解决方案、列出验证步骤，并关联相关 Issue。涉及用户可见的变更时，请附上截图或终端输出；配置变更和后续事项也应明确说明。
