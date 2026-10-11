Type: task
Status: resolved
Blocked by: none

## Scope

明确项目多变体上传确认弹窗的目标中心技能和目标技能组。

## Result

抽取 [变体预览组件](../../../src/components/ProjectSkillConflictPreview.tsx)，在版本选择区域顶部加入 [上传目标说明](../../../src/components/ProjectSkillUploadTarget.tsx)。根据当前选择版本的中心技能 ID 展示中心技能名称、技能组以及保留分组或新建未分组的说明，覆盖数据缺失和默认组本地化。新增 5 项回归测试，并更新中英繁体文案与 CHANGELOG。

验证通过：`npm run build`、`npm run lint`（一条已有 MySkills Hook 依赖警告）、`npm test`（118 项）、`git diff --check`。后端无变更。
