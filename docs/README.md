# AgentHub 文档

本目录记录 AgentHub 的产品定位、架构设计、外部集成和工程决策。文档应与代码变更同步更新。

版本级重大变更记录见仓库根目录的 [`CHANGELOG.md`](../CHANGELOG.md)。

## 文档导航

- [V1 PRD 与页面效果图](agenthub-prd/agenthub-prd.html)：产品目标、功能需求、信息架构和 8 个核心页面的可视化静态稿。
- [界面规范](design/ui-guidelines.md)：视觉语言、响应式、交互反馈与可访问性约束。
- [产品概述](product/overview.md)：目标用户、核心能力和第一版范围。
- [系统架构](architecture/overview.md)：前后端分层、核心模块和依赖方向。
- [目录结构](architecture/directory-structure.md)：建议的仓库与源码布局。
- [配置管理架构](architecture/configuration-management.md)：配置发现、编辑、校验、备份和回滚流程。
- [作用域与冲突规则](architecture/scope-and-conflicts.md)：工作空间身份、Agent 层级和 Skill 冲突处理。
- [数据模型](architecture/data-model.md)：SQLite 核心实体和关系。
- [Skill 领域模型](architecture/skill-domain-model.md)：来源、快照、兼容性和多目标安装规则。
- [Agent 兼容设计](integrations/agents.md)：Claude Code、Codex 和 OpenCode 的适配策略。
- [Skills 来源集成](integrations/skills-sh.md)：skills.sh、标准 Marketplace、远程 Git 仓库和本地仓库目录的发现、安装和生命周期。
- [架构决策记录](adr/README.md)：已确认的重要技术决策，包括 SOLID 架构规范。
- [开发指南](development/README.md)：本地开发、检查和测试约定。
- [CI/CD 与跨平台发布](development/ci-cd.md)：自动检查、手动/tag 安装包构建和 GitHub Release 方案。
- [平台支持矩阵](development/platform-support.md)：V1 安装包格式、架构和发布限制。
- [V1 发布验收清单](development/release-checklist.md)：本地门禁、手动构建、tag 发布和完成判定。
- [需求与状态管理](agents/issue-tracker.md)：仓库内任务、状态、依赖和 AI 领取规则。

## 文档约定

架构文档描述当前目标设计；未实现内容需标记为“规划中”。重大且难以撤销的决策应新增 ADR，不直接改写旧决策的结论。
