# AgentHub D01：Agent 与 Skill 兼容性研究

核验日期：2026-08-22（以该日期可访问的官方文档为准）。本文只记录 Claude Code、Codex、OpenCode、skills.sh 和 Agent Skills 规范的公开一手资料。`~` 表示运行用户的 home 目录；各工具可通过环境变量或企业策略改变实际加载集合，因此实现应记录“发现到的实际路径”，不能只保存规范化的逻辑作用域。

## 结论矩阵

| Agent       | 用户/全局配置                                                                                        | 项目/工作空间配置                                                                                                                                                    | 格式与优先级                                                                                                                                                      | 说明                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `~/.claude/settings.json`；用户指令为 `~/.claude/CLAUDE.md`                                          | `.claude/settings.json`；仅本机的 `.claude/settings.local.json`；指令为项目根 `CLAUDE.md` 或 `.claude/CLAUDE.md`，还会按目录层级发现 `CLAUDE.md` / `CLAUDE.local.md` | settings 是 JSON；覆盖优先级为 managed → CLI `--settings` → project local → shared project → user。CLAUDE.md 是 Markdown/纯文本指令，不是结构化设置               | `CLAUDE_CONFIG_DIR` 可改写用户配置根；settings 文件和指令文件是两个不同 seam。                                                    |
| Codex       | `~/.codex/config.toml`；全局指令 `~/.codex/AGENTS.override.md`，若不存在则 `~/.codex/AGENTS.md`      | 从项目根到当前目录逐层发现 `.codex/config.toml`；从项目根到当前目录逐层合并 `AGENTS.override.md`/`AGENTS.md` 及官方列出的 fallback 文件名                            | config 是 TOML；配置优先级（高→低）为 CLI、项目 `.codex` 层、profile、用户、Unix 系统 `/etc/codex/config.toml`。AGENTS 文件是按根到当前目录拼接的 Markdown/纯文本 | 不受信任项目会跳过项目 `.codex` 层；`CODEX_HOME` 可改变 Codex home 和全局指令位置。                                               |
| OpenCode    | `~/.config/opencode/opencode.json`（TUI 可另用 `tui.json`）；全局规则 `~/.config/opencode/AGENTS.md` | 项目根 `opencode.json`（可用 JSONC）；项目规则优先沿当前目录向上找 `AGENTS.md`；还可在 `instructions` 中显式加载其他文件/URL                                         | JSON 或 JSONC；配置源合并而非替换。标准配置顺序为 remote → global → `OPENCODE_CONFIG` → project → `.opencode` → inline → managed（后者优先级最高）                | 规则文件的 Claude Code fallback（`CLAUDE.md`、`~/.claude/CLAUDE.md`）可由环境变量禁用；应记录这是兼容行为而非 OpenCode 原生格式。 |

### 管理策略路径（官方文档明确列出的平台差异）

| Agent                           | macOS                                                           | Linux / WSL                              | Windows                                             |
| ------------------------------- | --------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| Claude Code managed settings    | `/Library/Application Support/ClaudeCode/managed-settings.json` | `/etc/claude-code/managed-settings.json` | `C:\Program Files\ClaudeCode\managed-settings.json` |
| Claude Code managed `CLAUDE.md` | `/Library/Application Support/ClaudeCode/CLAUDE.md`             | `/etc/claude-code/CLAUDE.md`             | `C:\Program Files\ClaudeCode\CLAUDE.md`             |
| OpenCode managed config         | `/Library/Application Support/opencode/`                        | `/etc/opencode/`                         | `%ProgramData%\opencode`                            |

Claude Code 文档把 Windows 用户路径展开为 `%USERPROFILE%\.claude`；Codex 文档以 `~/.codex/...` 和 `$HOME` 表述用户路径。因此 Windows 适配器仍应使用运行时 home（如 `USERPROFILE`），并把实际探测结果标为路径实例，而不是把 macOS 路径推导到 Windows。Claude Code 文档还特别说明 Windows 不再读取旧的 `C:\ProgramData\ClaudeCode\managed-settings.json`，它只能作为旧版本诊断候选，不能当作当前写入目标。

## Claude Code

### 配置与指令

- 官方 settings 参考将 settings 文件按 managed、user、project、local 等来源区分；用户 settings 位于 `~/.claude/settings.json`，项目 settings 位于 `.claude/settings.json`，本地不入库覆盖位于 `.claude/settings.local.json`。`--settings` 也能在一次运行中额外加载 JSON 文件或 JSON 字符串；这不是持久发现位置，应在 AgentHub 中作为“临时来源”诊断而非配置文件。`CLAUDE_CONFIG_DIR` 可改写包含 settings、history、plugins 等内容的用户配置根，探测时必须先读取环境。
- 官方 memory 参考明确：组织策略、用户、项目和 local 指令分别使用上表中的 `CLAUDE.md`/`CLAUDE.local.md` 文件；项目可以选择根 `./CLAUDE.md` 或 `./.claude/CLAUDE.md`。文件是 Markdown/纯文本，按目录层级加载；`@path` 可导入其他文件，最多四跳。
- 组织级 managed `CLAUDE.md` 的三平台路径见表。该表是官方列出的当前约定，路径与版本/企业发行策略可能变化。
- `~/.claude.json` 保存登录、MCP、每项目 trust 等状态，但不是普通 settings 文件；其中可能有敏感信息，V1 只应在确有需求时只读诊断，不把它并入 settings JSON 编辑器。

来源：

- [Claude Code settings](https://code.claude.com/docs/en/settings)（官方 settings 文件、作用域、合并与 CLI `--settings`）。
- [Claude Code managed settings](https://code.claude.com/docs/en/managed-settings)（managed settings 的优先级、三平台路径与 Windows legacy 路径说明）。
- [Claude Code memory / CLAUDE.md](https://code.claude.com/docs/en/memory)（官方指令文件位置、层级、导入和平台 managed 路径）。

### Skills 与插件

- 官方 skills 参考要求每个 Skill 是一个目录，入口文件为大写 `SKILL.md`；个人 Skill 示例为 `~/.claude/skills/<name>/SKILL.md`，项目 Skill 使用 `.claude/skills/<name>/SKILL.md`，嵌套项目目录也可被发现，managed 目录与插件也可提供 Skills。目录名成为 `/name` 命令名；同名时 managed > personal > project，插件 Skill 使用 `plugin:name` 名称空间。
- Claude Code 声明其 Skill 格式遵循 Agent Skills open standard，同时有 Claude 专属扩展（如 invocation control、动态上下文）。因此统一解析器应先按标准字段解析，再把 Claude 扩展保留为未知/扩展元数据。
- Claude Code marketplace 是 Claude 原生插件目录机制：marketplace 源可通过 URL、路径或 GitHub 仓库添加；约定的仓库布局是 `.claude-plugin/marketplace.json`。官方插件市场参考给出 manifest 的顶层 `name`、`owner`、`plugins` 等目录字段，并要求每个条目提供可解析的 `source`；条目可进一步引用插件目录中的 skills/commands/agents/hooks。字段会随 Claude Code 版本演进，未知字段必须保留、不能执行 manifest 中的脚本。

来源：

- [Claude Code skills](https://code.claude.com/docs/en/skills)（SKILL.md、`.claude/skills` 与 `~/.claude/skills`、标准兼容性）。
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)（marketplace 添加方式、`.claude-plugin/marketplace.json` 与 manifest/条目约定）。
- [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference)（插件组件与 manifest 校验入口）。

## Codex

### TOML 配置与 AGENTS.md

- OpenAI 的 Codex config 文档规定用户配置是 `~/.codex/config.toml`，项目覆盖是项目目录内的 `.codex/config.toml`；项目层只有在工作区受信任时才加载。官方配置优先级为 CLI → project `.codex` layers → profile config → user config → Unix system `/etc/codex/config.toml`。
- Codex 的 instructions 文档规定全局文件在 `$CODEX_HOME`（默认 `~/.codex`）：`AGENTS.override.md` 存在时只取它，否则取 `AGENTS.md`。项目从项目根（通常 Git root）向当前目录逐层发现，优先 `AGENTS.override.md`、再 `AGENTS.md`、再官方列出的 fallback 名称；文件按根到当前目录顺序拼接。它们是 Markdown/纯文本，不是 TOML。
- `CODEX_HOME` 可改写全局目录（官方示例使用 `CODEX_HOME=$(pwd)/.codex`）；实现必须把环境变量展开作为诊断信息保存。官方文档没有给出一个独立的 Windows 固定“系统 config.toml”路径，不能从 `/etc/codex` 推导。

来源：

- [Codex config basics](https://developers.openai.com/codex/config-basic)（官方 TOML 位置、项目层、优先级与信任）。
- [Codex custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)（全局/项目发现、override、fallback、`CODEX_HOME`）。

### Skills

- OpenAI 的 Codex skills 文档要求 Skill 目录至少包含 `SKILL.md`，且 frontmatter 必须有 `name`、`description`；可选 `agents/openai.yaml` 为 UI 元数据、调用策略和工具依赖。
- 仓库级扫描从当前目录向上检查每一级 `.agents/skills`，直到仓库根；用户级为 `~/.agents/skills`，管理员级为 `/etc/codex/skills`，另有 Codex 内置 system skills。Codex 还支持 `~/.codex/config.toml` 中 `[[skills.config]]` 条目按 `path` 禁用 Skill。
- 当前官方源码仍扫描旧的 `$CODEX_HOME/skills` 用户位置以保持向后兼容，但当前产品文档首选 `$HOME/.agents/skills`。AgentHub 可将旧位置标为 `legacy/version-dependent` 只读发现，不应继续往那里安装。

来源：[Codex skills](https://developers.openai.com/codex/skills)（官方 Skill 目录、扫描作用域、frontmatter 和 `agents/openai.yaml`）；[Codex skills host roots 源码](https://github.com/openai/codex/blob/main/codex-rs/ext/skills/src/host_roots.rs#L95-L119)（旧 `$CODEX_HOME/skills` 兼容根，源码行为可能随版本变化）。

Codex 另有 beta Plugins 能力，其构建文档使用 `.codex-plugin/plugin.json`（JSON）和 `skills/<name>/SKILL.md`；这不是 Claude Code 的 `.claude-plugin/marketplace.json`，且官方没有在该文档中承诺一个可安全直接编辑的全局/项目插件登记文件。V1 将 Codex plugin inventory 标为 CLI/catalog 管理或暂不支持直接文件编辑，避免把两种 manifest 混用。

来源：[Codex plugins](https://developers.openai.com/codex/plugins/)、[Build Codex plugins](https://developers.openai.com/codex/build-plugins/)。

## OpenCode

### JSON/JSONC 配置与规则

- OpenCode 官方配置文档支持 JSON 和 JSONC；用户全局配置是 `~/.config/opencode/opencode.json`，项目配置是项目根 `opencode.json`。配置文件合并而非替换；项目配置覆盖全局冲突键。
- 官方列出的标准配置顺序是 remote `.well-known/opencode` → global → `OPENCODE_CONFIG` → project → `.opencode` directories → `OPENCODE_CONFIG_CONTENT` → managed config → macOS MDM managed preferences。文件型 managed 目录是 macOS `/Library/Application Support/opencode/`、Linux `/etc/opencode/`、Windows `%ProgramData%\opencode`。
- OpenCode rules 原生入口是项目 `AGENTS.md` 与全局 `~/.config/opencode/AGENTS.md`；如果没有对应 AGENTS 文件，OpenCode 可兼容读取项目 `CLAUDE.md` 和 `~/.claude/CLAUDE.md`。该 fallback 可用 `OPENCODE_DISABLE_CLAUDE_CODE*` 环境变量关闭。`instructions` 配置还允许显式列出本地 glob 或远程 URL 文件。

来源：

- [OpenCode config](https://opencode.ai/docs/config/)（官方 JSON/JSONC、所有配置层和三平台 managed 路径）。
- [OpenCode rules](https://opencode.ai/docs/rules/)（AGENTS.md、Claude fallback、instructions）。

### Skills

OpenCode 官方 skills 文档列出六组来源：

1. 项目 `.opencode/skills/<name>/SKILL.md`；
2. 全局 `~/.config/opencode/skills/<name>/SKILL.md`；
3. 项目 Claude-compatible `.claude/skills/<name>/SKILL.md`；
4. 全局 Claude-compatible `~/.claude/skills/<name>/SKILL.md`；
5. 项目 agent-compatible `.agents/skills/<name>/SKILL.md`；
6. 全局 agent-compatible `~/.agents/skills/<name>/SKILL.md`。

项目路径从当前目录向 Git worktree 根遍历。frontmatter 中 `name`、`description` 必填，`license`、`compatibility`、`metadata` 可选；name 必须与父目录相同、1–64 字符、只含小写字母/数字和单连字符，description 为 1–1024 字符。未知 frontmatter 字段会被忽略，故 AgentHub 应保留原始正文/原始 frontmatter 以支持跨 Agent 往返。

来源：[OpenCode Agent Skills](https://opencode.ai/docs/skills/)（官方路径、发现、frontmatter 验证与权限）。

## skills.sh 与 Agent Skills 标准

### skills.sh 的稳定约定

- skills.sh 官方文档把自己描述为 Agent Skills directory，并说明其 CLI 源码在 [`vercel-labs/skills`](https://github.com/vercel-labs/skills)。公开安装命令是 `npx skills add owner/repo`，也接受 GitHub URL；`-g/--global` 表示用户级，默认可按项目安装。skills.sh 因此是“仓库发现/安装 CLI + 目录索引”，不是一个替代 `SKILL.md` 的 marketplace manifest 格式。
- 官方页面对四个 D01 预置仓库给出了可定位的 source 与命令：[`anthropics/skills`](https://skills.sh/anthropics/skills)、[`mattpocock/skills`](https://skills.sh/mattpocock/skills)、[`obra/superpowers`](https://skills.sh/obra/superpowers)、[`affaan-m/ECC`](https://skills.sh/affaan-m/ecc)。每个页面显示同一 `npx skills add <owner>/<repo>` 形式，并列出仓库中发现的 Skill；页面上的安装量是遥测展示，不应当当作版本或完整性证明。
- CLI 的 `add` 参数可以指定 `--skill`、`--agent`、`--global`、`--copy` 等安装策略；这些是 CLI 行为，不应在只读扫描中执行。AgentHub 应把 owner/repo、解析后的 commit/ref、Skill 相对路径和实际安装目录分开记录。

来源：[skills.sh docs](https://skills.sh/docs)、[skills CLI source](https://github.com/vercel-labs/skills) 及上述四个官方索引页。skills.sh 页面明确提醒生态内容不能保证安全，安装前应审阅内容。

### Skill 入口规范（Agent Skills open standard）

Agent Skills 官方规范定义的最小目录为：

```text
<skill-name>/
├── SKILL.md       # 必需：YAML frontmatter + Markdown instructions
├── scripts/       # 可选
├── references/    # 可选
└── assets/        # 可选
```

`SKILL.md` 必须以 YAML frontmatter 开头，`name` 和 `description` 必填；`license`、`compatibility`、`metadata` 可选，`allowed-tools` 为实验性可选字段。规范约束 name 最长 64 字符、只含小写字母/数字/连字符且必须匹配父目录；description 1–1024 字符。规范不定义一个跨 Agent 的“安装目录”或 marketplace registry；安装目录由宿主 Agent 决定（上文三套矩阵），所以统一模型必须保留来源仓库、manifest 路径（若有）、Skill 相对路径和目标 Agent/作用域。

来源：[Agent Skills specification](https://agentskills.io/specification)（官方格式、目录、frontmatter、校验与渐进式披露）。

## V1 实现边界与不确定项

1. 稳定支持：读取/展示上述各 Agent 的 JSON、TOML、JSONC 和 Markdown/`SKILL.md` 文件；所有写入前保留原文、未知字段和 checksum。
2. 版本相关：Claude Code 的 settings 键、插件 marketplace 字段、Codex config 键、OpenCode managed/MDM 键均可能随版本演进；适配器应使用 schema/未知字段诊断，不把当前字段集合硬编码为统一万能模型。
3. 暂不推断：Codex 官方资料没有给出独立的 Windows 系统级 `config.toml` 固定字面路径，也没有把 skills.sh 定义成 marketplace manifest 规范；在 Windows 上按运行时 home/ProgramData 探测，在 skills.sh 上按 owner/repo + Git 内容发现。
4. 安全：manifest、Skill 正文和仓库中的脚本只读解析；AgentHub 不因发现而执行 `postinstall`、hooks、shell scripts 或 Skill `scripts/`。skills.sh 官方也明确不保证每个条目的安全性。
