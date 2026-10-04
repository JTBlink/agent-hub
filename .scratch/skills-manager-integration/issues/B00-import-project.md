# B00：整体导入独立 Skills 模块

Type: task
Status: resolved
Blocked by: none

## 目标

按 [当前规格](../spec.md) 将 Skills Manager 整个项目纳入 `modules/skills/`，保留独立构建与运行，迁移改造留待后续。

## 验收标准

- 基于固定 commit 导入全部 Git 跟踪文件，保留权限，校验文件清单与 SHA-256。
- 排除 `.git`、构建输出、依赖和本地环境，不修改来源项目或用户数据。
- 保留原有 manifest、lockfile、代码、资源和许可证；明确记录必要的导入适配。
- 根项目检查与模块相互隔离，提供独立运行说明。
- 更新 CHANGELOG、入口文档和任务状态，记录实际执行的检查及限制。

## Comments

- 2026-10-04：用户明确第一步只整体导入；原集成设计暂缓。
- 2026-10-04：用户授权先完整导入、后续再修改；已导入并逐文件核对 309 个原始文件，内容和执行位均保留。

## Result

- 完整源码位于 `modules/skills/`，来源 commit 为 `def946d78ef4c739b0ba429e38ac509b8660ec34`；上游文件未改写。
- [来源清单](../../../modules/skills-source-manifest.json) 保存 309 个文件的原 Git blob、模式、大小与 SHA-256；已逐项验证内容和执行位。
- 原 `.gitignore` 匹配但上游已经跟踪的文档也已导入。使用 Git intent-to-add 将整个快照纳入 diff，不修改上游 ignore，不创建嵌套 Git 仓库，未提交 Git。
- 根 ESLint/Prettier 排除模块；[模块说明](../../../modules/README.md)、根 README 与 CHANGELOG 已更新。
- 根 `npm run build`、`npm run lint`、`npm test` 通过（19 个测试文件、81 项测试）。根 lint 保留既有 Modal Fast Refresh warning，无错误。
- 模块 `npm run build`、`npm run lint` 通过；构建有现有 Browserslist 数据过期及 bundle 大小提示。
- 根版本校验、任务状态索引和新增宿主变更的空白检查通过。上游快照的 `git diff --check` 有 23 处原有空白问题；按本次原样导入范围保留，后续处理。
- Rust `cargo check --manifest-path modules/skills/src-tauri/Cargo.toml --locked` 通过。未运行 Rust 单元测试或其他平台构建；未执行桌面启动、运行时数据迁移或发布。
