Type: task
Status: resolved
Blocked by: none

# 修复自动备份静默停用与模糊的本地更改提示

## Scope

按 [规格](../spec.md) 排查后台调度、凭据边界和状态展示，补充回归测试并提交推送。

## Acceptance

- 开启自动备份后，后台实际将隔离技能库更改提交并推送到本地远端。
- 开发版不因旧钥匙串防护而整体关闭自动备份；本地凭据和 gh 可正常使用。
- 用户可以直接看到待备份路径和类型；文件与提交数量不混用。
- 完成前后端测试、构建、lint、Rust 格式和严格 Clippy。

## Comments

本地日志多次显示开发版自动备份在启动时被停用，界面开关仍默认为开启。诊断只读日志及相关设置，不记录用户身份或凭据。

## Result

- 根因：开发构建把旧钥匙串访问防护作为整个自动备份任务的启动条件；界面只读取自动备份偏好，因而出现开关开启而任务没有运行。
- 调度器始终启动并继续遵守自动备份开关；开发环境只限制旧钥匙串迁移，gh 和已有本地凭据可用。跳过旧迁移不写入登出标记，正式构建仍能迁移旧凭据。
- 设置变更重新通知备份调度，避免关闭期间消费启动通知后，重新开启仍不备份。
- 待备份卡片恢复直接可见的文件路径、变更类型、重命名前路径和可聚焦滚动列表，保留差异页入口；摘要分别显示文件、待上传提交和远端提交数量。
- 回归测试先红后绿：`cargo test --manifest-path src-tauri/Cargo.toml enabled_background_scheduler_uploads_pending_changes -- --nocapture`，修复前调度器退出且没有上传，修复后隔离 bare 远端可读取新技能内容。凭据测试验证不读取旧钥匙串、读取本地凭据及不写缺失标记。
- `npx vitest run src/components/BackupPendingChanges.test.tsx` 修复前缺少路径而失败，修复后通过。
- `npm test`：初次 84 个测试文件、461 项通过；合入远端 main 的其他变更后重新验证，85 个测试文件、466 项通过；`npm run lint`、`npm run build`、`npm run format:check`、版本与 tracker 检查通过。一次并发执行触发既有文档生成目录竞争，测试结束后串行重跑构建通过，无需改动生成器。
- `cargo test --manifest-path src-tauri/Cargo.toml`：703 项库测试及 8 项 CLI 测试通过，8 项按原配置忽略；Rust 格式检查和严格 Clippy 通过。
- 桌面界面检查因应用绑定超时未完成；路径、类型、空列表由组件测试验证。未完成明暗主题、缩放和原生键盘操作的实机验收。

## Review

- Standards：调度逻辑与 Tauri 事件适配分离；备份仍使用既有 core、仓库锁与投影发布流程。无新依赖、数据库迁移或凭据存储格式变更，未把凭据或本机数据放入 Git。
- Spec：自动调度测试走完整提交与上传流程，而非只调用单轮备份；文件列表与数量语义符合规格，变更同步到中英繁体文案与 Unreleased。

重要文件：[调度器](../../../src-tauri/src/core/auto_backup.rs)、[凭据边界](../../../src-tauri/src/core/git_credentials.rs)、[待备份列表](../../../src/components/BackupPendingChanges.tsx)。

远端整合：保留 main 新增的技能组全部覆盖和锁文件清理提交；变基仅解决 Unreleased 条目冲突，中英繁体资源自动合并后通过前端完整验证。Rust 变更与已通过全量测试的版本一致。现有 CI 为手动触发，本次不触发安装包发布。
