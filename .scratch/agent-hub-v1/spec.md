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

## PRD 与原型数据规范

- PRD、交互原型、截图和演示数据不得包含真实姓名、账户名、个人邮箱、电话号码、访问令牌或带本机用户名的绝对路径。
- 人物统一使用“开发者”等通用称呼；工作空间、组织和项目使用明显虚构的名称；用户主目录路径统一写成 `~/...`（例如 `~/projects/demo`），不得出现包含账户名的绝对路径；其他路径使用 `<workspace>` 等不可关联个人的占位形式。
- 邮箱示例只使用 `example.invalid` 等保留域名。发布或提交前必须检查并清理可识别个人身份的信息。

## V1 完成条件

- 三个 Agent 的全局和工作空间配置可发现、诊断、安全编辑、备份及回滚。
- Skills 可从 skills.sh、Marketplace、预置/自定义远程仓库和本地目录发现及管理。
- Windows、macOS、Linux 均生成可安装产物。
- GitHub 仅承载 CI/CD 和 Release，需求状态完全由本目录管理。
