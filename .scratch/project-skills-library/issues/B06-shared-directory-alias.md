Type: task
Status: resolved
Blocked by: none

## Scope

项目安装遇到 Agent 的 skills 目录链接到项目内 `.agents/skills` 时不应报 symbolic link ancestor；按公共目标复用实际内容，保留目录链接与共享操作语义，保护外部来源。

## Diagnosis

临时项目将 `.claude/skills` 链接到 `../.agents/skills`，运行 `cargo test --manifest-path src-tauri/Cargo.toml --lib installing_through_project_central_directory_alias_preserves_the_alias -- --nocapture`，修复前稳定复现原始报错。路径检查将合法共享目录链接与其他链接祖先一并拒绝，尚未发布暂存的项目内容。

## Implementation

目标解析仅接受指向本项目中央目录的 Agent 目录链接，将其映射到无链接祖先的中央路径；多个 Agent 合并发布，保留原目录链接。已有活动记录在读取时归一化，清理独立入口链接标记；状态读取不写回磁盘。已停用的歧义记录继续拒绝转换。

## Result

- Agent 目录链接到项目内 `.agents/skills` 时安装成功，中央实际内容仅发布一次，保留既有目录链接与项目版本；空中央目录的首次安装同样支持。
- 共享目标沿用公共目录启停及移除保护；原始来源和外部目录不被改写。活动旧清单兼容共享目录，状态查询保持只读。
- 验证：复现用例先失败后通过；项目技能库 56 项测试通过。`cargo test --manifest-path src-tauri/Cargo.toml` 全量通过（库测试 728 通过、8 忽略，CLI 8 通过）；`cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`、`npm run tasks:check`、`git diff --check` 通过。
- 新增目录链接回归在 Unix 上执行；未执行 Windows 原生验收。未迁移或修改用户现有项目内容。

## Review

Standards：解析集中于 project_library/entries，复用原有路径保护、公共目标和事务；其他链接祖先仍拒绝写入，存储结构与 IPC 不变。

Spec：覆盖原始安装报错、多个 Agent 共用、中央目录尚不存在、复制与链接两种安装模式、重复安装保留团队版本、更新/修复/启停/移除、旧清单只读兼容及外部内容保护。
