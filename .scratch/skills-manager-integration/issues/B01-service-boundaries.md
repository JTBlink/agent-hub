# B01：安装服务边界与页面职责拆分

Type: task
Status: open
Blocked by: D01

## 目标

后续候选：参考 [后续集成备选方案](../future-integration.md)。当前用户仅要求 B00 整体导入，本任务暂不执行，后续需重新确认规格与依赖。

## 验收标准

- 选择既有单 Skill 安装和更新流程，拆出 plan/apply 服务，Tauri command 仅做适配。
- 拆出触及的 skills、skill_installation、lib 与 AppShellView 职责，满足 ADR-0006。
- GUI 沿用现有 bindings；路径、指纹、目标所有权和诊断保持单一实现。
- 安装、更新、外部修改拒绝、失败回滚的公开行为回归通过，不引入第二套数据库或安装器。

## Comments

- 2026-10-04：基于代码审查建立建议任务。实施时按依赖领取，并同步维护状态索引。
