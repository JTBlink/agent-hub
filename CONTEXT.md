# agent-hub 领域上下文

当前应用以 Skills Manager 的实现为基础，使用唯一的 React + Tauri 主入口；架构切换见 ADR-0008。旧配置编辑器和双窗口宿主不再属于当前实现。

- **Skill**：以 `SKILL.md` 为入口的能力目录，可包含脚本和资料。
- **技能库**：由应用管理的 Skill 内容、来源和标签；默认内容存放于 `~/.agent-hub/skills`，应用数据库、配置和日志仍在 `~/.agent-hub`。可选创建 `~/.agents/skills` 软链接供其他 AI 工具发现技能。
- **Agent / Tool**：可以使用 Skills 的宿主工具，由 Rust 工具适配器定义目录；安装状态以可执行文件、桌面应用或已安装宿主的扩展为证据，Skills 与配置目录不构成安装证据。
- **工作空间**：技能部署的全局或项目上下文。项目由应用登记，Agent 的原生目录仍由适配器解析。
- **安装 / 部署**：将库内 Skill 按目标工具规则关联到指定工作空间；不等同于把来源导入技能库。
- **技能组（Skill Group）**：按用途命名的 Skill 集合，用于向工作空间批量添加或移除技能；修改组内成员不会自动更新已有部署。中文界面使用”技能组”，英文界面使用”Skill Group”，代码层使用 `skill_group` / `SkillGroup`，数据库层保留 `scenario`，CLI 顶层命令使用 `skill-groups`，并兼容 `presets` 与 `scenarios` 别名。
- **来源**：Skill 的远程 Git 仓库或本地目录；来源修订用于检查内容更新。
- **备份与同步**：独立 Git 工作区默认位于 `~/.agent-hub/backup`，以 `skills/` 和 `.agent-hub/` 保存可安装 Skill 与同步元数据。凭据单独保存于应用数据目录的 `credentials/`，不进入备份。

SQLite 保存技能、项目、技能组和设置等状态。桌面 commands 和 CLI 共用 `src-tauri/src/core/`；前端通过 `src/lib/tauri.ts` 调用命令。已有自定义库与 CLI 显式目录保持兼容。技能库目录内的有效 Skills 原地登记，直接读取该目录的 Agent 可见全部内容。
