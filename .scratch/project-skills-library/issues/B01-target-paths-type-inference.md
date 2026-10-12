Type: task
Status: resolved
Blocked by: none

# 修复项目 Agent 路径映射编译失败

## Scope

处理 `target_paths` 遍历映射时的 E0277：映射值应保存拥有所有权的 `String`，向路径校验函数传递 `&str`。

## Acceptance

- 明确 `BTreeMap<String, String>` 类型，Rust 编译不再推断为不可定长的 `str`。
- 回归测试覆盖不同 Agent 目录、多个 Agent 共享目录及嵌套目录拒绝行为。
- 项目技能库测试、Rust 格式和严格 Clippy 验证通过。

## Comments

- 2026-10-12：接到编译错误时工作区已有显式类型标注；保留该修复，增加类型意图注释与路径行为回归测试，继续验证当前源码。
- 此修复只恢复编译并验证既有路径契约，不改变运行时行为、发布流程或兼容性，无需新增 CHANGELOG 条目。

## Result

- [路径映射](../../../src-tauri/src/core/project_library.rs) 保留显式 `BTreeMap<String, String>`，补充类型意图说明。
- [回归测试](../../../src-tauri/src/core/project_library/tests.rs) 验证不同目录、共享目录保留各 Agent 映射，以及拒绝嵌套目标。
- `cargo test --manifest-path src-tauri/Cargo.toml core::project_library --lib`：14 个测试通过，E0277 未再出现。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`、`git diff --check` 通过。
- 额外的 Rust 全量测试编译成功；备份和合并测试运行较慢，相关 14 个测试与严格 Clippy 已通过后停止追加全量运行，不将全量结果记为通过。
- Standards：复用现有路径校验，不修改部署规则与其他工作区变更。Spec：当前源码编译成功，新增行为测试通过。
