Type: task
Status: resolved
Blocked by: none

# 修正项目恢复确认按钮

## Acceptance

- 项目技能恢复确认按钮显示“确认覆盖”，英文与繁体中文表达同一动作。
- 取消与原有恢复流程保持一致。

## Comments

- 截图中的按钮使用通用 ConfirmDialog 的默认“删除”文字；恢复弹窗缺少 confirmLabel。

## Result

- 后续恢复安全修复已接入专用 ProjectSkillRestoreDialog，继续使用本任务的三语“确认覆盖”文案；此前列出的前端 7 项失败与构建阻塞已处理，当前全量 322 项测试和构建通过，见 [B02](../../project-skill-force-restore/issues/B02-safe-replacement.md)。

- [项目页面](../../../src/views/ProjectDetail.tsx) 为恢复弹窗传入独立的按钮文案；简体“确认覆盖”、繁体“確認覆蓋”、英文“Confirm overwrite”。CHANGELOG 已记录。
- [三语页面回归](../../../src/views/ProjectDetail.restoreAction.test.tsx) 验证实际恢复弹窗按钮及取消行为，3 项通过。`npm run lint`、`git diff --check` 通过。
- `npm test`：315 项通过、7 项失败，失败来自任务开始前已存在的未跟踪 ConfirmDialog.test.tsx 与 ProjectDetail.test.tsx，涉及焦点、重复提交与另一恢复流程的预期，本次未修改这些文件。
- `npm run build`：已有未跟踪文件 src/generated/agent-hub-generated/help/catalog.ts 无法解析 ../../lib/help/types，构建失败。未进行原生界面验收。
- Standards：复用 ConfirmDialog 与三语资源，不改通用删除文案。Spec：恢复确认按钮准确表达覆盖操作，取消行为保持一致。
- 后续联合验证：恢复流程和共享弹窗修复整合后，`npm test` 全部 322 项、`npm run lint` 与 `npm run build` 通过；三语按钮及取消回归保留，之前记录的测试与生成路径问题已不再出现。
