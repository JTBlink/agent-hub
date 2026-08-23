# Repository Guidelines

本指南（仓库贡献指南）适用于 AgentHub 的开发、文档和发布工作。

## 项目结构与模块组织

本仓库是 AgentHub（AI Agent 工作空间管理器）的 Tauri 2 + React 工程。`src/` 存放 React/TypeScript 前端，`src-tauri/` 存放 Rust 桌面端和 Tauri 配置，`docs/` 存放产品与架构文档，`.scratch/` 是仓库内需求 tracker。GitHub 仅用于 Actions 持续集成、跨平台安装包构建和发布产物，不作为需求或项目状态数据库。

- `src/app/`：页面壳和应用级 UI。
- `src/lib/`：前端共享逻辑及 Tauri bindings。
- `src-tauri/src/`：Rust 业务逻辑；保持 `main.rs` 精简。
- `src-tauri/tests/`：跨模块集成测试（引入后）。
- `docs/`：产品、架构、集成和开发说明。
- `.scratch/<feature>/`：存放可提交的规格、任务、依赖和开发状态；它是本仓库的正式 Issue tracker。

新增代码遵循 [ADR-0006：文件体量、模块拆分与代码复用规范](docs/adr/0006-file-size-and-reuse-conventions.md)：页面文件超过 600 行、Rust 模块超过 800 行必须拆分；优先复用领域类型、路径解析、扫描器、bindings 和展示纯函数，禁止复制 Agent 路径、安全校验或诊断文案。

## 构建、测试与开发命令

- `npm run tauri dev`：启动桌面应用开发环境。
- `npm run build`：执行 TypeScript 检查并构建前端。
- `npm run test`：运行前端测试。
- `npm run lint`：执行 ESLint。
- `cargo test --manifest-path src-tauri/Cargo.toml`：运行 Rust 测试。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`：检查 Rust 格式。
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`：执行严格的 Rust 静态检查。

## 编码风格与命名约定

使用标准 `rustfmt` 格式（四空格缩进），并解决所有 Clippy 警告。模块、函数和变量使用 `snake_case`；类型和 trait 使用 `UpperCamelCase`；常量使用 `SCREAMING_SNAKE_CASE`。优先创建职责单一的小型模块，提供清晰的错误信息，并为公开 API 编写文档。不要提交 `target/`、`debug/`、变异测试产物或 IDE 元数据。

## 隐私与示例数据

禁止在代码、测试、文档、截图、fixture、日志或提交说明中写入可识别个人身份的信息，包括真实姓名、本机用户名、个人邮箱、电话号码、访问令牌以及包含用户名的绝对路径。任何真实姓名或账户名都禁止出现。用户主目录路径统一写成 `~/...`（例如 `~/projects/demo`），不得使用任何带账户名的绝对路径；其他示例使用 `<workspace>` 等不可关联个人的占位内容，邮箱只使用 `user@example.invalid` 等保留域名。提交前应搜索并清理个人姓名、用户名、邮箱和本机绝对路径。

## 测试规范

单元测试应与被测代码放在一起，并使用 `#[cfg(test)]`；公开行为和端到端流程放入 `tests/*.rs`。测试名称应描述具体行为，例如 `creates_workspace_with_default_settings`。每次修复缺陷都应添加回归测试。提交拉取请求前，请运行 `cargo test`、格式检查和 Clippy 检查。

## 提交与变更审查规范

当前历史记录仅有 `Initial commit`，尚未形成正式的提交规范。提交标题应简洁并采用祈使语气，例如 `Add workspace configuration loader`；每个提交只处理一个明确事项。变更说明应链接对应的 `.scratch/<feature>/issues/<id>-<slug>.md`，并列出验证步骤。涉及用户可见的变更时，请附上截图或终端输出；配置变更和后续事项也应明确说明。代码审查可以使用任意协作入口，但需求状态必须回写 `.scratch/`。

每次提交前都必须检查本次变更是否影响用户可见行为、发布流程或兼容性；如有影响，及时在根目录 `CHANGELOG.md` 的 `Unreleased` 或对应版本章节中补充记录。

## Agent skills

### Issue tracker

需求和开发状态使用仓库内 `.scratch/<feature>/` 的 Markdown 文件管理，不依赖 GitHub Issues。参见 `docs/agents/issue-tracker.md`。

### Triage labels

使用仓库默认的 Agent 分诊状态词汇。参见 `docs/agents/triage-labels.md`。

### Domain docs

仓库采用单上下文领域文档布局；工作前读取根目录 `CONTEXT.md`（如存在）和相关 ADR。参见 `docs/agents/domain.md`。
