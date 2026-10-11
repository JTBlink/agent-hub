Type: task
Status: resolved
Blocked by: B02

## Scope

管理 Skill 更新提示直接展示原始来源，便于核对更新从哪里拉取。

## Result

卡片直接展示当前 Skill 记录的来源地址与技能库路径，无须展开详情。首次安装展示预定 Git 来源；来源未记录时明确提示，避免将默认地址误认为实际更新来源。路径文本支持选择复制。

验证：`npm run build`、组件 ESLint 检查与 `git diff --check` 通过。
