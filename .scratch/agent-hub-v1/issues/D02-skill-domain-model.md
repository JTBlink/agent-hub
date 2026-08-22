# D02：确定 Skill 领域模型与来源规范

Type: decision
Status: resolved
Blocked by: D01

## 目标

区分 Skill、Plugin、Marketplace 条目、仓库来源和本地安装，定义一个不会丢失来源信息的统一模型。

## 验收标准

- 定义 `SkillDescriptor`、`SkillSource`、`SkillInstallation`、`AgentCompatibility` 和 `InstallPlan`。
- 明确一个仓库包含多个 Skill、同一 Skill 安装到多个 Agent/作用域的表示方式。
- 明确版本、ref、commit、校验和及更新判断规则。
- 决定非 `SKILL.md` 内容、插件内 Skills 和不兼容条目的展示方式。
- 以 ADR 记录结论及被否决方案。

## Result

- 已建立仓库根目录领域词汇表 [`CONTEXT.md`](../../../CONTEXT.md)。
- 已定义 `SkillDescriptor`、`SkillSource`、`SkillInstallation`、`AgentCompatibility` 和 `InstallPlan`，并明确仓库多 Skill 与多 Agent/作用域安装关系。
- 已确定 requested ref、resolved commit、SemVer 和内容指纹的职责及更新判断规则。
- 已规定非 `SKILL.md` 内容、Plugin 内 Skills、Marketplace 条目和不兼容条目的展示与安装边界。
- 已记录 ADR-0002 及被否决方案，并同步 SQLite 数据模型。
