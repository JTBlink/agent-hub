Type: task
Status: resolved
Blocked by: none

## Scope

修复项目技能卡片操作区挤压同步状态标签导致中文竖排的问题。

## Result

抽取 [ProjectSkillBadges](../../../src/components/ProjectSkillBadges.tsx)，复用网格和列表标签。状态和停用标签不可收缩或按字换行，完整标签可换行；卡片底部布局可按区域换行，Agent 操作靠右且扩展图标允许换行。新增两个回归测试。

验证：`npm run build`、`npm run lint`（一条已有 Hook 警告）、`npm test`（127 项）、新增测试复验、`git diff --check` 均通过。

## Review

Standards：复用主题、领域类型与分组名称本地化，提取共享标签组件；新增内容隐私检查通过。
Spec：窄卡片状态横排、完整标签换行、组名截断和操作区换行已实现。
