# Skill 领域模型

> 状态：已确定（D02，2026-08-22）

AgentHub 将“来源发现”和“目标安装”分开建模。一个仓库可以发现多个 Skill；同一 Skill 通过多个 `SkillInstallation` 关联到不同 Agent、作用域或工作空间。

## 核心对象

### `SkillDescriptor`

代表来源快照中的一个 Skill，至少包含：

- 稳定 `skill_key`（规范化来源身份 + Skill 相对路径），显示名、描述和有效 frontmatter。
- `source_id`、`source_revision`、`resolved_commit`、入口 `SKILL.md` 路径和内容指纹。
- `kind`（标准 Skill 或 Plugin 内 Skill）及父 Plugin/Marketplace 元数据（如有）。
- 三个 Agent 的 `AgentCompatibility` 结论和诊断证据。

同名但来源或相对路径不同的 Skill 不自动合并；内容相同只作为“可能重复”提示。

### `SkillSource`

描述来源容器而非安装目标：`source_type`（preset、git、local-directory、skills-sh、marketplace）、规范化 URL/本地路径、manifest 路径、`requested_ref`、`resolved_commit`、凭据引用和最近扫描指纹。preset 只是受信任的仓库别名，仍需解析成实际来源。

skills.sh 和 Marketplace 条目保存发现入口及原始 manifest；真正安装前必须解析为 Git 或本地内容快照。私有仓库凭据只引用系统凭据管理器，不进入 SQLite。

### `SkillInstallation`

是 `SkillDescriptor` 与目标的关联：`skill_key`、Agent、`scope`、可选 `workspace_id`、目标目录、安装 revision、安装指纹、启用状态和受 AgentHub 管理的文件清单。唯一键为 Skill + Agent + 作用域 + 工作空间 + 目标根目录，允许一个 Skill 安装到多个目标。

### `AgentCompatibility`

按 Agent 保存 `supported`、`incompatible` 或 `unknown`、原因、检测版本和证据来源。缺失 frontmatter、未知扩展或目标 Agent 不支持所需能力都产生诊断；`incompatible` 不进入默认安装计划。

### `InstallPlan`

由来源快照和一个或多个目标组成，操作为 `install`、`update`、`enable`、`disable` 或 `remove`。每个动作列出新增/修改/删除文件、目标路径、权限变化、前置指纹和回滚信息。UI 展示并确认后，Rust 在 staging 目录校验，再原子替换；任一失败保留旧安装并记录结构化错误。

## 版本与更新规则

1. `requested_ref` 只用于复现用户选择；每次扫描解析 `resolved_commit`。不可解析 commit 的本地普通目录使用内容指纹。
2. 有效 SemVer 仅用于展示和排序；更新判断以 resolved commit 或内容指纹为准，不能仅凭版本字符串覆盖文件。
3. 内容指纹覆盖 `SKILL.md` 和被安装的附属文件，按规范化路径排序后计算 SHA-256；忽略 `.git` 元数据。安装指纹与当前目标指纹不同即标记 `externally_modified`，先让用户查看 Diff。
4. 同一来源 ref 未变化且指纹一致时无需更新；commit 或指纹变化时标记 `update_available`，由用户确认安装计划。

## 非标准内容与 Plugin

- 找不到 `SKILL.md` 的目录只显示来源诊断，不生成 Descriptor、不执行脚本。
- 脚本、hooks、模板和参考资料作为 Descriptor 的受管理文件清单，导入和扫描阶段绝不执行。
- Marketplace Plugin 是容器；`.claude-plugin/marketplace.json` 条目、Plugin manifest 和 Plugin 内 Skills 的父子关系均保留。第一版展示 Plugin 与其 Skills，但只把解析出的 `SKILL.md` 纳入 Skill 安装计划。
- 对不兼容或未知 Skill 仍可浏览元数据、来源和原因；默认不纳入批量安装，只有在高级操作中明确确认风险后，才可为 `unknown` 条目创建带警告的计划。`incompatible` 条目不能创建安装计划。
