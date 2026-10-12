Type: task
Status: resolved
Blocked by: none

# 修复确认恢复后项目内容丢失

## Acceptance

- 中心目录缺失有效 SKILL.md 时拒绝替换，项目内容保留。
- 复制出错时不修改项目原件；发布失败时恢复目录或链接，可重试。
- 恢复现有项目副本保留副本方式；托管项目显式确认后可覆盖实际内容，默认请求仍保护修改。
- 确认前和取消后不写入；等待期间禁止重复操作，失败保留弹窗。

## Comments

- `cargo test --manifest-path src-tauri/Cargo.toml --lib failed_copy_preserves_existing_project_skill -- --nocapture` 已复现：复制错误后项目 SKILL.md 被改成中心内容，本地文件不保留。
- IPC 回归复现三处问题：缺失 SKILL.md 的中心目录被接受并清空项目；复制错误后旧文件丢失；旧默认设置将项目副本改成链接。托管更新还将结构化保护错误转换为 Io，强制更新没有绕过内容基线保护。

## Result

- [恢复 IPC](../../../src-tauri/src/commands/project_skill_update.rs) 已接入实际命令注册，扫描和普通写入共用操作锁；校验中心版本并持有来源锁，恢复保持原有副本或链接方式。
- [替换流程](../../../src-tauri/src/core/sync_engine/replacement.rs) 在目标同卷准备新内容，再暂存旧目录并发布；复制失败不动旧内容，发布失败恢复旧内容，恢复失败保留原件。替换前重新检查授权与目标类型。
- [托管更新](../../../src-tauri/src/core/project_library/update.rs) 复用项目发布事务，显式确认仅绕过内容差异保护，保留路径与发布期间变化校验；实际错误类型不再丢失。缺失 Agent 不自动补齐。
- [前端流程](../../../src/hooks/useProjectSkillRestore.ts) 接入单项、详情与批量恢复，托管技能仅更新一次；默认请求或取消不写入，失败保留重试，等待期间防止重复提交和关闭。
- 验证：前端全量 68 个文件、322 项通过；Rust 全量 lib 696 项通过、8 项忽略，CLI 8 项通过；`npm run build`、`npm run lint`、Rust 格式和严格 Clippy 通过。另验证同步引擎 45 项与项目相关 82 项回归。
- 构建所遇到的旧生成样本 src/generated/agent-hub-generated 无引用且不属于当前生成目录，已完整保留到系统临时目录，移出源码后标准构建通过。
- 未修改实际项目技能，未执行本机原生界面覆盖验收或 Windows/Linux 原生验收。当前运行实例是否已加载新后端未验收。
- Standards：抽出历史大文件中的恢复职责，复用扫描、路径、同步、锁与事务；不修改数据库。Spec：有效中心内容可恢复，准备和发布失败保留原件，现有副本保持方式，确认与重试有行为测试。
