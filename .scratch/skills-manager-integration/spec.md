# 主应用整合规格

当前以 [B10](issues/B10-primary-application.md) 和 [ADR-0008](../../docs/adr/0008-primary-application.md) 为准。

- Skills Manager 的前端与 Rust 核心成为唯一应用，根目录只保留一套依赖和构建入口。
- 对外名称 agent-hub；保留原 Logo、图标、主题与色调。
- 默认数据归于 `~/.agent-hub`，库位于其 `library/` 子目录，配置、日志与 CLI 使用固定目录，避免库移动影响应用身份。
- CLI、凭据服务、缓存和同步元数据使用新命名空间；不自动迁入旧库。
- 删除旧宿主代码、嵌套工程和过时文档，保留原许可证及导入清单。
- 完成本地构建、核心测试和桌面启动验证后提交，再继续迭代。

## 历史基线

最初导入源提交为 `def946d78ef4c739b0ba429e38ac509b8660ec34`，309 个跟踪文件。完整导入、独立入口和元数据清理已于 `4debf00` 提交，见 B00、B08、B09 及[来源清单](../../docs/reference/skills-manager/source-manifest.json)。这些阶段的原样保留及双窗口约束已由用户后续要求替代。

旧 V1 规格、原型以及 D01、B01–B07 旧候选任务已删除。后续统一基于现有 Skills Manager 实现，规划见 docs/plans/agent-hub.md。
