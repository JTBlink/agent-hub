# Skills 来源集成

> 状态：规划中

第一版支持五类来源：

- **skills.sh 生态**：通过 skills.sh 目录或官方 CLI 发现并安装 Skill。skills.sh 是仓库发现/安装 CLI 与目录索引，不是替代 `SKILL.md` 的 Marketplace manifest 标准。
- **标准 Marketplace**：解析 Marketplace manifest（例如 `marketplace.json`，包括 `.claude-plugin/marketplace.json` 这类仓库布局），展示目录中的 Skill、版本和安装来源。
- **官方及预置 GitHub 仓库**：首版支持 Anthropic 官方 [`anthropics/skills`](https://github.com/anthropics/skills)，并预置 [`mattpocock/skills`](https://github.com/mattpocock/skills)、[`obra/superpowers`](https://github.com/obra/superpowers) 和 [`affaan-m/ECC`](https://github.com/affaan-m/ECC)，可浏览仓库内符合规范的 Skill 并选择安装。
- **自定义 Git 仓库**：用户输入 Git 仓库 URL，可选分支、tag、commit 和仓库内子目录，浏览并选择符合规范的 Skill。
- **本地仓库目录**：用户通过系统目录选择器授权一个本地目录，可指定子目录并浏览其中符合规范的 Skill；目录可以是 Git 仓库，也可以是普通文件夹。

五类来源都通过 `SkillSource` adapter 接入，向核心 Skill 模块提供发现、安装、更新和卸载能力。AgentHub 同时扫描各 Agent 的全局及工作空间 Skill 目录，统一展示“已安装位置、作用域、适用 Agent、版本和启用状态”。业务模块不依赖来源命令输出或内部数据格式。

来源记录至少包含：`source_type`、远程 URL 或规范化本地路径、manifest 路径（如有）、ref（分支/tag/commit）、Skill 相对路径和安装目标作用域。

## 安装流程

1. 解析并验证用户提供的 Skill 来源（skills.sh 标识、Marketplace manifest URL、Git URL、远程仓库路径或用户授权的本地目录）。
2. 获取名称、版本、文件清单、来源 ref、实际 commit 和 manifest 元数据。
3. 在界面展示来源与预期文件变更。
4. 用户确认后安装到工作空间级目录。
5. 校验结果并记录到 SQLite。

优先使用官方稳定命令或公开接口；Git 来源使用浅克隆或归档下载，并固定到可追溯的 tag/commit。失败时保留原工作空间状态，不记录半完成安装。卸载只删除 AgentHub 明确记录和管理的文件，不递归删除来源不明的目录。

### skills CLI 与 Codex 目录策略

skills.sh 官方 CLI 默认使用软链接模式：先把内容写入 `.agents/skills/<name>` 规范副本，再为需要独立目录的 Agent 创建软链接；`--copy` 会改为向各 Agent 目录写入互相独立的真实副本。软链接失败时 CLI 可能回退为拷贝。

当前 CLI 的 Codex 配置仍把项目目录定义为 `.agents/skills`、全局目录定义为 `$CODEX_HOME/skills`（默认 `~/.codex/skills`）。Codex 当前产品文档推荐的用户级目录则是 `~/.agents/skills`，并继续兼容读取旧的 `$CODEX_HOME/skills`。AgentHub 采用以下策略：

- 新的 Codex 全局安装只写入 `~/.agents/skills`。
- `~/.codex/skills` 只读识别为兼容目录，不再作为新安装目标。
- 同一个 Codex Skill 同时存在于两处时，只把 Codex 的两个真实副本标为冲突；OpenCode 等 Agent 共用 `.agents/skills` 不算冲突。
- 旧目录没有首选副本时可迁移到 `.agents/skills`；已有首选副本时归档旧副本，归档进入 AgentHub 备份目录而非永久删除。
- 界面只为软链接显示链接图标与解析后的真实路径；真实文件不重复展示相同路径。

## 第一版边界

第一版支持标准 Claude Marketplace manifest、skills.sh 目录、一个官方仓库、三个预置 Git 仓库、符合 Skill 目录规范的自定义 Git 仓库和本地仓库目录，但不承诺自动解析任意项目的复杂目录结构、私有仓库凭据托管、仓库依赖安装或自动发布能力。用户需明确选择 Marketplace 条目、仓库 ref、本地目录和 Skill 子目录；后续可在同一 adapter interface 上扩展更多来源。

## 本地仓库目录

- 目录必须由用户通过系统选择器明确授权，并保存规范化路径。
- 扫描源目录时只读；安装时把选定 Skill 复制到 staging 目录，校验后再原子移动到目标位置。
- 默认不创建符号链接，避免源目录移动、跨平台权限和意外联动修改。
- 本地 Git 仓库记录 remote（如有）和当前 commit；普通目录使用文件清单校验和判断内容变化。
- 源目录消失或权限变化时保留安装记录并显示诊断，不自动卸载已安装 Skill。
- 不执行本地目录中的脚本、hooks 或依赖安装命令。

## Marketplace 规范

Marketplace 适配器只负责读取公开 manifest，将目录条目转换为统一的 Skill 元数据。条目至少需要提供名称和可定位的安装来源；可选提供版本、描述、作者、主页、兼容 Agent 和校验信息。

```text
Marketplace manifest
  → 解析目录条目
  → 用户选择 Skill
  → 解析条目的安装来源
  → 展示文件清单与权限
  → 复用 Git/skills.sh 安装流程
```

Manifest 本身不应触发安装脚本。无法识别版本或安装来源的条目只显示诊断，不进入可安装状态。

## Skill 目录约定

默认以目录中的 `SKILL.md` 作为 Skill 入口。仓库根目录或指定子目录找不到 `SKILL.md` 时，仅显示诊断，不执行安装。仓库中的脚本、依赖和 hooks 不会在导入阶段自动执行。

## 自定义仓库安全规则

- 仅允许用户明确确认的 URL、ref 和子目录。
- 安装前展示仓库地址、commit、文件清单和目标目录。
- 默认使用浅克隆或归档下载，缓存目录使用随机临时路径。
- 不执行 `postinstall`、shell 脚本或仓库自定义 hook。
- 私有仓库凭据通过系统 Git 凭据管理器或 Keychain 获取，不写入 SQLite。
