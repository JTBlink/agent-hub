Type: task
Status: resolved
Blocked by: none

## Scope

使用 ui-ux-pro-max 优化卡片信息层次，把同步操作移到标题右侧，减少底部拥挤。

## Result

按 ui-ux-pro-max 的桌面图标可访问名称和紧凑布局建议，抽取 [ProjectSkillCardHeader](../../../src/components/ProjectSkillCardHeader.tsx) 与 [ProjectSkillSyncActions](../../../src/components/ProjectSkillSyncActions.tsx)。同步操作放在标题右侧，底部保留状态、技能组和 Agent 操作。同步工具栏仅在有可用方向且非多选时显示，保留加载互斥、点击隔离和原操作逻辑；列表复用同一组件。

新增 3 项测试覆盖同步方向、可访问名称和执行时禁用。验证通过：`npm run build`、`npm run lint`（一条已有 Hook 警告）、`npm test`（130 项）、新组件 Prettier、`git diff --check`。

## Review

Standards：沿用品牌主题和 Lucide 图标，提供图标按钮名称与键盘焦点；复用同步控制逻辑，新增内容未含个人数据。Spec：同步操作移至标题区，底部不再承担同步按钮，保留状态、Agent、启停及删除；整张卡片仍由页面组合。
