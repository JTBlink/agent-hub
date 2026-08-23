# B12：完成 Skill 生命周期与多 Agent 安装

Type: task
Status: resolved
Blocked by: B09, B10, B11

## 交付

为所有来源提供统一的安装计划、安装、更新、启用、禁用和卸载流程，并支持全局/工作空间及目标 Agent 选择。

## 验收标准

- 操作前展示来源、commit、文件清单、目标 Agent 和目标路径。
- 使用 staging 目录和原子移动，部分失败可恢复。
- 只删除 AgentHub 明确管理的文件。
- 同名、多版本和多来源冲突遵循 D05 规则。
- 数据库与磁盘结果在成功后保持一致。
- 覆盖 Claude Code、Codex、OpenCode 的安装矩阵测试。

## 当前状态

`resolved`。Rust 生命周期 service、SQLite 一致性、计划/安装/启停/卸载 commands 与命令层安全测试已完成；Skills 页面已接入发现、目标 Agent/作用域选择、安装计划文件清单和确认执行。

## Result

- `InstallPlan` 展示稳定 Skill key、来源类型/地址、resolved revision、文件清单、Agent、作用域和目标路径；target resolver 覆盖三 Agent × global/workspace 六种安装。
- install/update 使用同目录 staging 与原子 rename；持久化失败恢复旧目录。enable/disable/remove 同样提供带 repository callback 的补偿回滚。
- marker 保存来源、revision、内容指纹和受管文件；非受管同名目标、不同来源冲突、symlink、超量内容及外部修改均阻止覆盖/删除。
- `save_skill_installation` 在单个 SQLite transaction 中 upsert source、descriptor、installation，目标冲突不静默覆盖；实测完整安装、禁用、卸载后磁盘与数据库一致。
