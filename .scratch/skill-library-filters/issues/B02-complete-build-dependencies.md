Type: task
Status: resolved
Blocked by: D01

# 补齐已提交代码的编译依赖

## Comments

- 在推送筛选调整前检查不可变提交，发现同分支的并行提交已经引用但未提交 ProjectSharingFiles 与 project_library/git 模块；ProjectDetail 调用还缺少 AddSkillsSheet 新增的 teamSharing 参数。分别导致 TypeScript 找不到模块、必需参数缺失和 Rust 模块缺失。
- 仅补齐已被提交代码依赖的两个模块与一个调用参数，不纳入其他尚未提交的并行文档和测试改动，不改写既有提交。

## Result

- 已在独立提交快照中补齐依赖并验证：前端 46 文件、203 项测试通过；build、lint、Rust 格式通过；Rust 库 651 项通过、8 项忽略，CLI 8 项通过。严格 Clippy 通过。
