# ADR-0002：分离 Skill 来源快照与安装实例

- 状态：已接受
- 日期：2026-08-22

AgentHub 采用 `SkillSource → SkillDescriptor → SkillInstallation` 的三层模型，并以 `InstallPlan` 作为用户确认边界。这样一个仓库可包含多个 Skill，同一 Skill 可安全安装到多个 Agent/作用域，同时保留 requested ref、resolved commit、文件指纹和 Marketplace/Plugin 上下文。

## 被否决方案

- **以 Skill 名称为全局主键**：会合并不同仓库中的同名 Skill，丢失来源和版本边界。
- **以安装目录作为 Skill 实体**：无法表达同一 Skill 的多目标安装，也无法区分来源更新与本地外部修改。
- **只保存 SemVer**：分支、无版本本地目录和内容回滚场景无法可靠判断更新；因此 commit/内容指纹是权威依据，版本仅作展示。
- **把 Plugin/Marketplace 条目直接当 Skill**：条目可能只指向容器或缺少 `SKILL.md`，必须先解析并保留父子元数据。
