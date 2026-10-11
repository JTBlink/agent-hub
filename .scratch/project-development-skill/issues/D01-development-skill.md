# D01：整理代码、UI 与交付规范

Type: task
Status: resolved
Blocked by: none

## Acceptance

- 新增 `rust-dev` Skill，入口按任务路由代码、UI 与交付资料。
- 规范与当前领域上下文、开发规范、视觉规范和有效 ADR 一致，支持随技能目录部署。
- 提供界面元数据与 `AGENTS.md` 入口，验证结构、引用、格式与隐私。
- 记录交付结果，不改变应用行为，不自动提交、部署或发布。

## Comments

- 本次会话未请求 Git 提交，领取状态仅更新于工作区。

## Result

- 新增 [Skill 入口](../../../.agents/skills/rust-dev/SKILL.md)、代码、UI 与交付三份按需参考资料，以及 `agents/openai.yaml` 界面元数据。
- 在 [AGENTS.md](../../../AGENTS.md) 增加项目开发入口；参考资料说明当前文档与有效 ADR 的权威关系。
- 使用离线缓存的 PyYAML 运行 `quick_validate.py`，结果为 `Skill is valid!`；新增资料与 AGENTS.md 的 Prettier 检查、Markdown 链接、仓库路径引用、个人路径检查及 `git diff --check` 通过。
- 本次为 Skill 与规范文档变更，不改变产品行为、发布流程或兼容性，无需增加产品 changelog 或运行应用编译测试。未提交、部署或发布。

## Review

- Standards：职责、拆分阈值、bindings、安全边界与现有开发规范及 ADR 一致；颜色引用集中 token，参考资料不依赖部署后的仓库相对位置。
- Spec：已覆盖代码、UI、国际化、测试与任务交付；入口按需读取，具备界面元数据和项目使用入口。
