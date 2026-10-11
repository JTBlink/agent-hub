Type: task
Status: resolved
Blocked by: none

## Scope

使用应用主题的分组下拉菜单替代 macOS 原生弹出菜单，统一边框、背景、字号和选中反馈，并保持键盘操作。

## Result

使用 [SkillGroupSelect](../../../src/components/SkillGroupSelect.tsx) 替代原生 select，沿用 surface、border、accent 主题变量与紧凑字号，展示勾选状态、悬停高亮与完整组名 tooltip。菜单限制高度并可滚动，支持上下键、Enter/空格选择、Escape 收起、Tab 和外部点击关闭。目标区标签与控件居中对齐，长名称不撑开布局。

验证通过：`npm run build`、`npm run lint`（一条已有 Hook 警告）、`npm test`（125 项）、`git diff --check`。

## Review

Standards：主题菜单复用现有颜色变量，上传成员关系使用现有 API，新增内容未包含真实身份或个人路径。Spec：上传目标、默认原组、未分组、新组选择、实际返回 ID 保存成员关系及部分失败提示已覆盖。
