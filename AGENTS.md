# Repository Guidelines

本指南（仓库贡献指南）适用于 AgentHub 的开发、文档和发布工作。

## 项目结构与模块组织

本仓库是 AgentHub（AI Agent 工作空间管理器）的 Tauri 2 + React 工程。`src/` 存放 React/TypeScript 前端，`src-tauri/` 存放 Rust 桌面端和 Tauri 配置，`docs/` 存放产品与架构文档，GitHub Issues 是规格、任务、依赖、讨论和状态的唯一来源；GitHub 同时承载 Actions、安装包与 Release。

完整的代码目录树与每个文件的职责说明见 [目录结构](docs/architecture/directory-structure.md)。以下是顶层模块概览：

- `src/views/`、`src/components/`：页面与共享 UI。
- `src/lib/`、`src/hooks/`、`src/context/`：共享逻辑、Tauri bindings 与状态。
- `src/i18n/`：国际化资源（中/英/繁体）。
- `src-tauri/src/commands/`：Tauri IPC 命令层。
- `src-tauri/src/core/`：核心业务（技能库、同步引擎、Git 备份、合并引擎、扫描器）。
- `src-tauri/src/bin/`：agent-hub-cli 入口。
- `scripts/`：Node.js 构建、发布与版本管理脚本。
- `skills/`：随产品分发的内置 Skill。
- `.agents/skills/rust-dev/`：随仓库共享的项目内部开发、UI、测试与提交规范。
- `.agents/skills/github-cli/`：GitHub 版本发布、自动 tag、Actions 与产物验收规范。
- `docs/`：产品、架构与 ADR；后续规划统一放在 `docs/plans/agent-hub.md`。
- `docs/agents/`：工程技能的 Issue tracker、分诊标签和领域文档入口；任务按版本关联 GitHub Milestones。
- `.github/workflows/`：CI、跨平台安装包构建和主页部署。

新增代码遵循 [ADR-0006：文件体量、模块拆分与代码复用规范](docs/adr/0006-file-size-and-reuse-conventions.md)：页面文件超过 600 行、Rust 模块超过 800 行必须拆分；优先复用领域类型、路径解析、扫描器、bindings 和展示纯函数，禁止复制 Agent 路径、安全校验或诊断文案。

具体的 SOLID 落地、模块边界、状态迁移、错误处理与验证要求见[开发规范](.agents/skills/rust-dev/references/coding-standards.md)。

## 构建、测试与开发命令

- `npm run tauri dev`：启动桌面应用开发环境。
- `npm run build`：执行 TypeScript 检查并构建前端。
- `npm run test`：运行前端测试。
- `npm run lint`：执行 ESLint。
- `cargo test --manifest-path src-tauri/Cargo.toml`：运行 Rust 测试。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`：检查 Rust 格式。
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`：执行严格的 Rust 静态检查。

## 版本管理

版本号的唯一来源是根目录 `VERSION` 文件。以下命令会将版本同步到 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock`：

- `npm run version:set -- <version>`：设置并同步所有文件到指定版本。
- `npm run version:sync`：从 `VERSION` 文件读取版本号并同步到所有配置文件。

版本变更需在 `CHANGELOG.md` 的 `Unreleased` 章节记录对应的用户可见变更。

## 编码风格与命名约定

使用标准 `rustfmt` 格式（四空格缩进），并解决所有 Clippy 警告。模块、函数和变量使用 `snake_case`；类型和 trait 使用 `UpperCamelCase`；常量使用 `SCREAMING_SNAKE_CASE`。优先创建职责单一的小型模块，提供清晰的错误信息，并为公开 API 编写文档。不要提交 `target/`、`debug/`、变异测试产物或 IDE 元数据。

## 隐私与示例数据

本项目对外发布。代码、内置任务、工程规范、文档与测试不得包含组织专属平台、内网域名、内部工具路由或公司账户信息；平台操作沿用目标项目声明的通用工具和流程，不绑定某个组织的基础设施。

禁止在代码、测试、文档、截图、fixture、日志或提交说明中写入可识别个人身份的信息，包括真实姓名、本机用户名、个人邮箱、电话号码、访问令牌以及包含用户名的绝对路径。任何真实姓名或账户名都禁止出现。用户主目录路径统一写成 `~/...`（例如 `~/projects/demo`），不得使用任何带账户名的绝对路径；其他示例使用 `<workspace>` 等不可关联个人的占位内容，邮箱只使用 `user@example.invalid` 等保留域名。提交前应搜索并清理个人姓名、用户名、邮箱和本机绝对路径。

## 测试规范

单元测试应与被测代码放在一起，并使用 `#[cfg(test)]`；公开行为和端到端流程放入 `tests/*.rs`。测试名称应描述具体行为，例如 `creates_workspace_with_default_settings`。每次修复缺陷都应添加回归测试。提交拉取请求前，请运行 `cargo test`、格式检查和 Clippy 检查。

## 提交与变更审查规范

完整的 Git 提交标题、正文、提交前检查和双轴审查要求见 [Git 提交规范](.agents/skills/rust-dev/references/commit-conventions.md)。需求状态、验证结果和版本里程碑必须及时回写对应 GitHub Issue。

每次提交前都必须检查本次变更是否影响用户可见行为、发布流程或兼容性；如有影响，及时在根目录 `CHANGELOG.md` 的 `Unreleased` 或对应版本章节中补充记录。

## Agent skills

### Project development

在本仓库开发、调整 UI 或审查时，使用 [rust-dev](.agents/skills/rust-dev/SKILL.md)。发布版本或维护 GitHub Actions 时，使用 [github-cli](.agents/skills/github-cli/SKILL.md)。开发与发布规范集中维护于这两个项目级 Skill；工程技能共享的任务、标签与领域文档规则见 `docs/agents/`。领域上下文、架构文档和有效 ADR 保留原位。

### Issue tracker

Issues and specs live in GitHub Issues (uses `gh` CLI), grouped by release milestones. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout; read `CONTEXT.md`, `GLOSSARY.md` (if present), and relevant ADRs before working. See `docs/agents/domain.md`.
