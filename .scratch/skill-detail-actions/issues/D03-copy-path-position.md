Type: task
Status: resolved
Blocked by: none

## Scope

复制路径图标从操作区末尾移到路径文字之后，技能库详情、项目详情、本地扫描和设置均保持一致；提取通用 CopyPathButton，保留原有复制反馈。

## Result

- 提取 [CopyPathButton](../../../src/components/CopyPathButton.tsx)，复制图标直接作为路径文字后的相邻元素，不再包含在目录打开操作区中。技能库详情、项目副本详情、项目目录、扫描结果与设置均同步调整。
- 原有复制测试迁移到 [CopyPathButton.test.tsx](../../../src/components/CopyPathButton.test.tsx)，保留完整路径、错误重试、等待与禁用行为；合并失去意义的普通/紧凑布局重复用例。
- 验证：`npm test` 全量 424 项、`npm run lint`、`npm run build`、修改文件 Prettier 与 `git diff --check` 通过；未执行原生桌面视觉验收。

## Review

Standards：共用复制组件，无新增文案、权限或复制逻辑。Spec：复制图标紧挨路径，保留完整路径复制和成功/失败反馈。
