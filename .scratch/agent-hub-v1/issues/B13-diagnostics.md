# B13：统一诊断、冲突和恢复体验

Type: task
Status: claimed
Blocked by: D04, B05, B06, B07, B12

## 交付

把各纵向切片的错误和警告收敛为统一诊断中心，支持按严重程度、Agent、作用域和资源筛选。

## 验收标准

- 覆盖配置语法、权限、外部修改、重复 Skill、版本和来源失效。
- 每条诊断提供影响、资源路径和可执行的下一步。
- 危险修复必须预览并确认；安全修复可批量执行。
- 提供数据库/缓存/扫描状态诊断，但不泄露敏感数据。
- 核心恢复路径具有端到端测试。

## Current status

- 已实现统一诊断模型、Agent/作用域/严重程度过滤、配置/Skill/存储转换，以及 Tauri `collect_diagnostics` command。
- React 诊断中心已展示严重程度、影响、资源路径、下一步与恢复入口，存储诊断不暴露数据库路径。
- `collect_diagnostics` 现支持资源路径精确筛选，并汇总重复 Skill、扫描完成/部分失败和派生缓存状态；配置 schema mismatch、外部修改、来源失效、重复/版本不兼容 Skill 均映射为稳定诊断码。
- 诊断层提供 `RecoveryPlan`、预览/确认门禁和安全批量执行 seam：`Safe` 计划可批量调度，需确认或手动处理的计划不会被批量执行；敏感 checksum 不进入用户诊断。
- `diagnostic_recovery.rs` 使用真实临时文件覆盖两条核心恢复链路：预览后外部修改会取消写入并生成可操作诊断；回滚在未预览/未确认时不触碰磁盘，确认后原子恢复旧内容并备份被替换版本。
- 已暴露 `preview_diagnostic_recovery` / `execute_diagnostic_recovery`：服务端重新匹配当前诊断并签发有界、一次性进程内票据；安全扫描无需确认即可执行，配置修复返回遮罩 Diff，执行时强制 `previewed + confirmed`、原 revision 和已预览内容 checksum，随后复用备份/原子写入/历史记录闭环；`manual` 无条件拒绝自动执行。
- Rust 后端测试覆盖安全扫描、危险编辑缺少预览/确认、预览后替换内容篡改、成功写入、票据重放和 manual 拒绝；命令参数与返回结构记录在 `docs/development/diagnostic-recovery.md`。
- 剩余：React 诊断中心接入上述两个 command，并完成 Tauri WebView/UI 层的干净环境端到端测试。
