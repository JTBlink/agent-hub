# ADR-0001：第一版技术栈

- 状态：已接受
- 日期：2026-08-22

## 背景

AgentHub 需要跨平台桌面界面、本地文件和进程访问能力，以及轻量可靠的本地持久化。

## 决策

第一版采用 Tauri 2、React、TypeScript、Rust 和 SQLite。React 构建界面，Rust 承担业务逻辑和系统访问，SQLite 保存本地结构化数据。

Claude Code、Codex 和 OpenCode 通过统一 Agent interface 及各自 adapter 接入；Skills 通过独立 Skill 来源 adapter 接入，第一版覆盖 skills.sh、标准 Marketplace、Anthropic 官方 [`anthropics/skills`](https://github.com/anthropics/skills)、[`mattpocock/skills`](https://github.com/mattpocock/skills)、[`obra/superpowers`](https://github.com/obra/superpowers)、[`affaan-m/ECC`](https://github.com/affaan-m/ECC)、用户自定义 Git 仓库链接和本地仓库目录。

## 影响

该方案可以复用 Web UI 生态，同时利用 Rust 控制文件与进程安全。团队需要维护 Rust 与 TypeScript 之间的类型一致性，并验证三个桌面平台的打包和终端行为。

## 备选方案

- Electron：生态成熟，但第一版不选择更大的运行时和资源占用。
- 纯原生 UI：系统集成强，但跨平台开发与迭代成本更高。
