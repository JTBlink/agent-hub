Type: task
Status: resolved
Blocked by: none

## Scope

通用目录操作组件新增一键复制路径图标，复用 Tauri 剪贴板能力；同步三语文案，验证完整路径、失败重试与禁用状态。

## Result

- [SkillDirectoryActions](../../../src/components/SkillDirectoryActions.tsx) 新增复制图标，在普通与紧凑布局中均复制完整原始路径，成功提示“路径已复制”，失败显示错误并可重试。复制期间、空路径及外部禁用状态不可重复执行。
- 共用该组件的技能库详情、项目技能详情、本地扫描、项目目录和设置入口自动支持复制；复用已有剪贴板权限，同步简中、英文与繁中文案。
- [组件测试](../../../src/components/CopyPathButton.test.tsx) 覆盖特殊字符完整复制、失败重试、执行中互斥与不可用状态；后续位置调整见 [D03](D03-copy-path-position.md)。
- 验证：`npm test` 全量 425 项通过；`npm run lint`、`npm run build`、修改文件 Prettier 与 `git diff --check` 通过。
- 未执行原生桌面剪贴板及主题、缩放验收；未修改 Rust 或权限。

## Review

Standards：复用通用目录组件和现有 Tauri 剪贴板插件，保留路径原文，三语文案集中管理。Spec：目录操作旁新增一键复制图标，普通与紧凑入口均可用，并具备提示及键盘可访问名称。
