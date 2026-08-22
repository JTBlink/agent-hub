# AgentHub V1 规格入口

## 目标

交付一个本地优先的桌面应用，统一管理 Claude Code、Codex、OpenCode 的全局及工作空间配置，并可视化管理来自多种来源的 Skills。

## 规格文档

- 产品范围：[`docs/product/overview.md`](../../docs/product/overview.md)
- 系统架构：[`docs/architecture/overview.md`](../../docs/architecture/overview.md)
- 配置安全：[`docs/architecture/configuration-management.md`](../../docs/architecture/configuration-management.md)
- 数据模型：[`docs/architecture/data-model.md`](../../docs/architecture/data-model.md)
- Agent 兼容：[`docs/integrations/agents.md`](../../docs/integrations/agents.md)
- Skills 来源：[`docs/integrations/skills-sh.md`](../../docs/integrations/skills-sh.md)
- CI/CD：[`docs/development/ci-cd.md`](../../docs/development/ci-cd.md)

## V1 完成条件

- 三个 Agent 的全局和工作空间配置可发现、诊断、安全编辑、备份及回滚。
- Skills 可从 skills.sh、Marketplace、预置/自定义远程仓库和本地目录发现及管理。
- Windows、macOS、Linux 均生成可安装产物。
- GitHub 仅承载 CI/CD 和 Release，需求状态完全由本目录管理。
