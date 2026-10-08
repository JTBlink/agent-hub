# GitHub Actions 触发策略

CI、安装包构建与主页部署仅支持手动 `workflow_dispatch` 和推送 `v*` 版本 tag 触发。普通分支提交、PR 和非版本 tag 不自动执行工作流。保留现有质量门禁及仅版本 tag 自动创建 Release 的规则。

执行记录：[B01](issues/B01-manual-and-tag-triggers.md)。工作流说明见 [CI/CD 文档](../../docs/development/ci-cd.md)。
