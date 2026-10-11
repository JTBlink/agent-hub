Type: task
Status: resolved
Blocked by: none

# 避免从中心更新时重复替换共享项目目录

## Evidence

项目卡片从中心更新通过 Promise.all 并发操作 Agent 变体。共享目录别名导致重复删除、复制或创建同一目标。`AppError::io` 仅保留 anyhow 最外层描述，丢失具体文件系统原因。

## Scope

更新操作在扫描前取得与启停共用的进程内互斥锁，直到替换结束。错误保留完整原因链并脱敏，前端用当前语言标明失败的 Skill。回归覆盖共享目录别名、复制与链接模式、源和目标内容保留、底层原因保留。

## Result

- 新增共享的 `core/project_skill_mutation.rs`，项目从中心更新在扫描前取得操作锁，开关复用同一保护。
- 无锁基线测试复现 `Failed to remove existing target`，底层原因为 `No such file or directory (os error 2)`；加锁后复制/链接两种模式均保留完整内容与中心源。
- `AppError::io_with_context` 保留并脱敏原因链，增加底层原因的回归测试。项目更新失败提示包含 Skill 名称，中英繁体文案同步。
- Rust 全量测试：629 项核心测试与 7 项 CLI 测试通过，8 项忽略。前端 106 项测试通过；build、Clippy、格式与 diff 检查通过。ESLint 无错误，有一项既有 MySkills effect 依赖警告。
- 更新 CHANGELOG；实际项目文件未作手动修改，未提交或发布。应用重新构建后生效。
