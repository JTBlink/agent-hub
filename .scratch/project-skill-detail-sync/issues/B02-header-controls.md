Type: task
Status: resolved
Blocked by: none

## Scope

移除项目 Skill 详情顶部的 Agent 部署图标，把更新、恢复操作移到关闭按钮左侧。技能说明下方保留 Agent 标识，继续复用同步操作与加载状态。

## Comments

用户通过截图明确要求调整顶部布局。仅调整项目详情组合与已失去调用方的标题操作插槽。

## Result

- [ProjectSkillDetailPanel](../../../src/components/ProjectSkillDetailPanel.tsx) 的更新、恢复按钮移到顶部关闭按钮左侧，移除顶部 Agent 部署图标及其参数；说明下方的副本 Agent 标识保留。
- [DetailSheet](../../../src/components/DetailSheet.tsx) 删除不再使用的标题操作插槽；[ProjectDetail](../../../src/views/ProjectDetail.tsx) 删除对应传参。
- [回归测试](../../../src/components/ProjectSkillDetailPanel.test.tsx) 验证顶部仅包含返回、更新、恢复、关闭按钮及其顺序，顶部无 Agent 图片，说明区保留副本标识，两个同步回调与关闭回调正确触发。修改前测试失败，修改后通过。
- 验证：`npm test` 中详情 15 项通过，全量 183 项通过、2 项失败；失败来自本次未修改的 `scripts/set-version.test.mjs`，版本脚本测试 fixture 缺少 `src/i18n/en.json`。`npm run lint`、`npm run build`、修改文件 Prettier 和 `git diff --check` 通过；ESLint 有已有的 `MySkills` Hook 依赖警告。
- 未执行原生桌面主题、缩放与键盘焦点验收；本次未改 Rust。

## Review

Standards：复用已有顶部操作插槽与同步组件，移除失去用途的 props，未新增文案、样式规则、后端契约或持久化状态。Spec：顶部无 Agent 部署图标，更新与恢复紧邻关闭按钮左侧；说明区 Agent 标识保留，同步方向与执行互斥继续由共用组件控制。
