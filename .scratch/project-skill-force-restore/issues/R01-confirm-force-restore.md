Type: task
Status: resolved
Blocked by: none

# 项目较新时确认并强制恢复技能库版本

## Acceptance

- 项目较新时先弹窗确认覆盖，取消不写入；确认后能恢复技能库版本。
- 单项、详情与批量共享流程；请求中防重复，失败保留重试，项目切换不复用旧确认。
- 未确认的后端请求仍保护修改，强制请求仍执行路径和事务检查，不改写外部来源或个人技能库。
- 普通副本、项目中央内容、Agent 链接/副本、未添加目标和启停状态均有回归覆盖。

## Comments

- 后续 B02 复核发现首轮记录的抽取模块尚未接入实际入口，旧命令仍先删除后复制。B02 已完成注册、前端调用方与项目事务接入，修复实际数据保护，并执行当前全量验证，详见 [B02](B02-safe-replacement.md)。

- 实际页面回归已复现：点击“恢复中心版本”直接发送普通更新请求，收到较新版本保护错误，没有确认弹窗。命令：`npm test -- src/views/ProjectDetail.test.tsx`，44ms 内断言失败（API 提前调用一次）。
- 报错来自既有保护规则；这是新增确认和显式恢复能力，无需做多个故障假设或生产日志探针。后端新增结构化确认错误以应对界面状态过期。

## Result

- [恢复流程](../../../src/hooks/useProjectSkillRestore.ts) 从项目页面抽出，卡片、列表、详情与批量共用确认；已知较新或托管内容有修改时先确认，过期界面收到后端保护错误也能进入确认。管理清单覆盖的技能只发布一次；批量部分失败仅重试失败技能，项目切换后旧确认和结果失效。
- [确认弹窗](../../../src/components/ProjectSkillRestoreDialog.tsx) 明示项目及对应 Agent 内容会被技能库版本覆盖，列出技能并默认聚焦取消。共享 ConfirmDialog 补齐可访问语义、焦点约束/恢复、防重复和执行中关闭保护，Escape 不再穿透到详情或多选状态。
- [独立 IPC 命令](../../../src-tauri/src/commands/project_skill_update.rs) 保留原命令名称，新增可选 force 参数，缺省保护。确认后仍校验技能身份及路径，普通/链接工作空间沿用既有副本方式；普通扫描与写入共用操作锁。
- [项目中央更新](../../../src-tauri/src/core/project_library/update.rs) 使用现有发布和恢复事务，只在显式 force 时放行内容差异；保护外部链接、非技能目录及事务期间变化，保留启停与部署方式，不补齐未添加 Agent。结构化 `project_restore_required` 错误在 Rust、前端和 IPC 测试中保持一致。
- 验证：`npm test`（66 个文件、318 项）、`npm run lint`、`npm run build` 通过；`cargo test --manifest-path src-tauri/Cargo.toml --lib project_`（78 项）、Rust 格式与严格 Clippy 通过。未执行全量 Rust 测试。
- Chrome 合成页面复核深色、浅色和 120% 文字缩放：确认前/取消后请求为 0，确认后发送 force=true 并刷新，Escape 回到原入口，无水平溢出。临时页面和测试标签已清理，未覆盖用户实际技能；未进行 Windows/Linux 原生验收。
- Standards：复用适配器、路径校验、同步引擎与事务；从历史超大页面和命令文件抽出操作职责，默认请求继续保护修改，无数据库迁移。Spec：项目较新可通过明确确认恢复技能库版本，取消、等待、失败和成功状态均有行为测试。
