# B05：Agent 能力注册与路径扩展

Type: task
Status: open
Blocked by: B03

## 目标

后续候选：参考 [后续集成备选方案](../future-integration.md)。当前用户仅要求 B00 整体导入，本任务暂不执行，后续需重新确认规格与依赖。

## 验收标准

- 实施前新增决策和纵向任务；以实际需要的一个 Agent 验证设计，不一次搬入全部适配器。
- 明确固定内置 Agent 与自定义 Agent 的身份模型，替代或扩展 ADR-0005 并迁移 SQL CHECK。
- 分别声明 Skills 扫描/安装与配置读取/编辑能力，禁止 Skills-only Agent 显示不支持的配置操作。
- 统一 global/workspace 路径解析，验证自定义路径、嵌套目录和冲突。
- 保持旧 Agent ID、数据库和 marker 可读；旧库未映射目标可继续完成映射。
- Agent 路径规则实现前核对当时官方文档，不把旧项目适配器当作永久正确的规则。

## Comments

- 2026-10-04：基于代码审查建立建议任务。实施时按依赖领取，并同步维护状态索引。
