Type: task
Status: resolved
Blocked by: none

# 串行化项目 Skill 目录切换

## Evidence

前端卡片开关通过 `Promise.all` 并发调用多个 Agent 的开关。共享目录及其软链接别名的并发回归测试在原实现下复现 `No such file or directory (os error 2)`。

## Scope

将项目开关的文件系统逻辑下沉到独立 core 模块，并将既有路径校验迁移到 path_guard，保留 command 兼容导出。串行执行检查、移动和清理，覆盖重复开关、目录别名和内容保留。

## Result

- 新增 `src-tauri/src/core/project_skill_toggle.rs`，串行执行检查、移动、重复链接清理和空目录清理；command 调用契约保持兼容。
- 既有 7 项开关测试迁移到 core，新增共享目录软链接别名的并发回归测试，验证反复启停后内容完整。修复前复现截图错误，修复后通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：核心 627 项通过、8 项忽略；CLI 7 项通过。
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`、`cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`、`git diff --check` 通过。
- 更新 `CHANGELOG.md`。未修改实际项目 Skill 内容，未提交或发布。
