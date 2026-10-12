Type: task
Status: resolved
Blocked by: none

# 修复项目 Agent 图标移除旧入口无效

## Scope

项目中央技能已经登记，但专属 Agent 目录仍包含未登记的旧个人链接或副本。点击卡片图标时不能只根据管理清单返回成功，必须处理实际入口。

## Acceptance

- Codex、OpenCode、Hermes 的未登记旧链接可移除；重新扫描后不再归属该 Agent。
- 只删除项目专属入口，不删除链接指向的个人来源、项目中央内容或其他 Agent 入口。
- 兼容已停用、项目相对链接、断链及自定义 Agent 目录；未修改副本可移除，修改副本返回错误并保留。
- 公共中央目录不得按单 Agent 移除；链接祖先拒绝操作，发布失败恢复原入口。

## Comments

- 根因：`delete_project_skill` 发现中央技能已管理后进入 `remove_target`，而后者发现 `targets` 未包含 Agent 就直接成功返回。实际项目存在个人库链接，因此扫描仍然显示已添加状态。
- 保留已有工作区变更；本任务仅修复移除核心与桌面适配，不迁移用户现有技能或自动提交。
- 首轮 7 个回归均重现旧实现返回成功但未删除、未知/共享目标误报成功及保护分支未执行。

## Result

- 移除逻辑下沉到 [removal.rs](../../../src-tauri/src/core/project_library/removal.rs)：已登记入口保留原保护规则，未登记入口根据权威 Agent 适配器检查启用和停用目录，使用现有项目锁和可恢复发布事务删除。
- 旧个人链接、项目相对链接和断链只校验链接本身的指纹，不读取或删除链接目的地。未登记副本仍需匹配项目基线，拒绝有修改的副本、链接祖先和单 Agent 公共目录删除；桌面传入包含用户自定义路径的适配器。
- [removal_tests.rs](../../../src-tauri/src/core/project_library/removal_tests.rs) 新增 8 个行为回归，覆盖 3 个报告的 Agent、扫描后的归属、来源及中央内容保护、停用副本、自定义目录、断链、未知/共享目标、路径边界和失败恢复。原有项目生命周期测试继续通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：库测试 680 项通过、8 项忽略，CLI 8 项通过；Rust 格式与严格 Clippy 全部通过。
- `npm test`：266 项通过；`npm run lint`、`npm run build`、Prettier、task 索引和 `git diff --check` 通过。构建仅有既有 Browserslist 数据及 chunk 体积提示。
- Standards：复用适配器、路径校验、项目锁、链接指纹和事务，不把删除安全判断放到前端；保留本次工作前已有修改。Spec：未登记旧入口不再直接返回成功，实际删除后扫描不再显示对应归属，保护个人来源和中央内容。
- 验证使用隔离临时项目，未对当前真实技能执行删除，也未进行桌面人工点击或 Windows/Linux 原生验收。需要运行包含本修复的桌面构建；未提交或发布。
