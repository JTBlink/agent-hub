# B12：完成 Skill 生命周期与多 Agent 安装

Type: task
Status: open
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
