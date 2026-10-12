Type: task
Status: resolved
Blocked by: none

# 批量操作详情复制入口

## Scope

在批量操作的“查看详情”弹窗确认按钮左侧增加“复制到剪贴板”，复制全部跳过、失败项的数量、技能名称、Agent 和完整错误原因，保留弹窗供继续查看。

## Acceptance

- 复制覆盖全部分组和滚动区域外的条目，不截断错误原因和换行。
- 使用已有桌面剪贴板能力；复制成功反馈，失败可重试，不触发关闭或覆盖操作。
- 复制中防止重复点击，三语文案与现有主题按钮一致。

## Comments

- 用户截图指定批量操作详情弹窗的复制入口；本次仅增加复制操作。

## Result

- 在 [SkillGroupErrorsDialog](../../../src/components/SkillGroupErrorsDialog.tsx) 的确认按钮左侧增加文字及图标入口；复制全部分组与完整原因，保留原始换行，成功和失败均反馈，复制中禁用重复点击。
- 使用已有桌面剪贴板插件，按钮显式 `type="button"`，不会提交关闭表单；三语资源同步，沿用主题按钮及键盘焦点样式。
- `npm test` 209 项通过，`npm run build`、`npm run lint`、相关文件 Prettier 和 `git diff --check` 通过。
- Standards：复用剪贴板和错误解析，无 Rust/IPC 契约改动。Spec：包含滚动区域外的全部条目，不触发关闭或覆盖操作。
- 未执行原生桌面剪贴板和主题/缩放人工验收。
