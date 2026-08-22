# AgentHub 领域上下文

AgentHub 管理 AI Agent 的配置与 Skills。本文只定义跨 UI、Rust、SQLite 和来源适配器使用的业务词汇；具体字段和持久化方式见架构文档。

## Skill 领域

**Skill**：一个以 `SKILL.md` 为入口、可被 Agent 发现和调用的能力目录。Skill 可以包含脚本、模板和参考资料，但这些附属文件不单独成为 Skill。
_避免_：把任意脚本目录、Marketplace 条目或 Plugin 统称为 Skill。

**Skill 来源（Skill Source）**：提供一个或多个 Skill 的可追溯来源，例如远程 Git 仓库、本地目录、skills.sh 发现结果或 Marketplace manifest。来源描述“从哪里来”，不描述“装到哪里”。
_避免_：用安装路径代替来源。

**Skill 描述（Skill Descriptor）**：某个来源在特定版本和相对路径下发现的一个 Skill 快照。目录名是显示名称的兜底，`SKILL.md` frontmatter 和来源元数据优先。

**Marketplace 条目（Marketplace Entry）**：目录 manifest 中指向 Plugin 或 Skill 来源的条目。它只有在解析出有效 Skill 入口后才产生 Skill Descriptor。

**Skill 安装（Skill Installation）**：一个 Skill Descriptor 在一个 Agent、一个作用域和一个工作空间中的落地实例。同一 Skill 可有多个安装实例。
_避免_：把一次来源扫描误认为安装。

**作用域（Scope）**：安装或配置生效的范围，第一版只有 `global`（用户级）和 `workspace`（工作空间级）。

**安装计划（Install Plan）**：用户确认前的不可变变更预览，包含目标、文件动作、来源版本、兼容性诊断和回滚前提。计划不是已完成的安装。

## 兼容性与版本

**Agent 兼容性（Agent Compatibility）**：Skill 对 Claude Code、Codex 或 OpenCode 的 `supported`、`incompatible` 或 `unknown` 结论及证据。`unknown` 可展示和人工确认，但不会被静默自动安装。

**来源版本（Source Revision）**：用户请求的 branch/tag/commit（`requested_ref`）及解析后的不可变 commit（`resolved_commit`）。分支和 tag 只是定位输入，commit 才是可复现快照。

**内容指纹（Content Fingerprint）**：按规范化相对路径、文件大小和字节 SHA-256 计算的 Skill 文件清单摘要，用于判断更新和外部修改。

## 配置领域

**Agent**：AgentHub 明确支持并可为其发现配置与 Skills 的宿主工具；第一版只有 Claude Code、Codex 和 OpenCode。
_避免_：用任意字符串、可执行文件名或 Skill 来源代替 Agent 身份。

**配置文档（Config Document）**：某个 Agent 在一个作用域中实际读取的配置或指令文件，包括原始内容、实际路径、格式和诊断。磁盘文件是唯一真实数据源。

**配置格式（Config Format）**：配置文档实际采用的受支持语法；第一版为 JSON、JSONC、TOML、YAML 和 Markdown，不从文件扩展名以外推断新的格式名称。

**配置解析状态（Parse Status）**：一次配置扫描的有限结果：有效、无效、缺失或不可读。
_避免_：自由文本状态、错误消息或安装状态。

**配置修订（Config Revision）**：一次读取所得原始字节的 SHA-256 与文件身份信息，用于发现用户确认后发生的外部修改。
_避免_：仅用修改时间作为版本。

**配置操作（Config Operation）**：一次经过预览和确认的编辑、回滚或导入尝试，包括前置修订、结果和备份引用，不包含配置正文或敏感值。

**配置备份（Config Backup）**：配置操作前原始字节的受限访问快照。回滚会创建新的配置操作和当前内容备份，不会删除历史。
