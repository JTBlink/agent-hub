# 更新日志

本文件记录 AgentHub 的重大产品、架构和兼容性变更。格式参考 [Keep a Changelog](https://keepachangelog.com/)，尚未发布的内容统一放在 `Unreleased`。

## [Unreleased]

### 产品定位

- 明确 AgentHub 第一版以配置中心为核心：统一管理 Claude Code、Codex 和 OpenCode 的全局配置与工作空间配置。
- 规划配置文件发现、结构化/源码编辑、校验、Diff、自动备份和回滚能力。
- 规划全局及工作空间 Skills 的可视化盘点和生命周期管理。

### Skills 来源

- 纳入 skills.sh 生态和标准 Marketplace manifest 支持范围。
- 纳入 Anthropic 官方 [`anthropics/skills`](https://github.com/anthropics/skills) 预置仓库。
- 纳入 [`mattpocock/skills`](https://github.com/mattpocock/skills)、[`obra/superpowers`](https://github.com/obra/superpowers) 和 [`affaan-m/ECC`](https://github.com/affaan-m/ECC) 预置仓库。
- 规划自定义 Git 仓库链接，支持指定分支、tag、commit 和 Skill 子目录。
- 规划本地仓库目录来源，支持只读扫描、子目录选择和基于 commit/校验和的更新检测。
- 规定安装前展示来源、版本和文件清单，不自动执行仓库脚本或 hooks。

### 架构与工程

- 确定第一版技术栈：Tauri 2、React、TypeScript、Rust 和 SQLite。
- 增加产品、架构、数据模型、集成、ADR 和开发指南文档目录。
- 规划 GitHub Actions 跨平台 CI/CD，目标平台为 Windows、macOS 和 Linux，并生成完整安装包。
- 增加本地 `.scratch/` 任务草稿约定；正式需求计划迁移到 GitHub Issues。

## 版本约定

- `Added`：新增能力或支持范围。
- `Changed`：现有能力或架构发生变化。
- `Deprecated`：计划移除但仍暂时保留的能力。
- `Removed`：已移除能力。
- `Fixed`：缺陷修复。
- `Security`：安全相关变更。
