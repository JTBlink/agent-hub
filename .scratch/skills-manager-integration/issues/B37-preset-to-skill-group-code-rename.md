# B37：代码层 Preset 全面重命名为 SkillGroup

Type: task
Status: resolved
Blocked by: none

## Scope

将 Rust 命令层、TypeScript/React 前端、i18n 键名和文件名中的 `Preset` / `preset` / `PRESET` 全面重命名为 `SkillGroup` / `skill_group` / `SKILL_GROUP`。数据库层保留 `scenario`，CLI 旧别名 `presets`、`--preset`、`--no-preset`、`--sync-preset` 继续兼容。

此变更超越 B14 原定的"仅界面改名、保留内部 preset"策略，彻底消除代码层的历史命名混淆。

## Acceptance

- Rust：`presets.rs` → `skill_groups.rs`，所有类型、函数、变量改用 `SkillGroup` / `skill_group`。
- TypeScript：`PresetBar.tsx` 等 5 个文件改名，接口、变量、i18n 键名同步。
- Serde 线路格式对齐：TS 的 `skill_group_ids` 与 Rust `SkillGroupDto` 一致。
- CLI 旧别名继续解析。
- SKILL.md CLI 文档更新。
- `cargo check`、`cargo test`、`cargo clippy`、`npm run build`、`npm test` 全部通过。

## Result

覆盖 Rust 5 个文件、TypeScript 12+ 个文件、i18n 3 个语言文件、CLI 技能文档和产品文档。验证通过：72 前端测试 + 7 Rust CLI 测试 + clippy 零警告。更新 CONTEXT.md、CHANGELOG.md 和目录结构文档。
