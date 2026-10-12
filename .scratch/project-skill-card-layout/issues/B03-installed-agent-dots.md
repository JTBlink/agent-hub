Type: task
Status: resolved
Blocked by: none

## Scope

项目技能卡片与列表的快捷 Agent 图标根据本机安装证据展示。未安装目标和不在检测结果中的已部署目标不展示、不计入展开数量；已安装但停用的目标保留。检测加载时不展示虚构的默认安装目标。团队部署选择不受此展示修复影响。

## Comments

复用 `ProjectAgentTarget.installed`，不改安装检测、团队文件或部署入口。

## Result

[ProjectAgentDots](../../../src/components/ProjectAgentDots.tsx) 在生成图标和展开数量前过滤未安装目标，不再补入未知已部署 Agent。[ProjectDetail](../../../src/views/ProjectDetail.tsx) 的卡片和列表直接传递检测结果，加载期间不使用默认安装目标。团队部署选择保持现有目标范围。

新增 [回归测试](../../../src/components/ProjectAgentDots.test.tsx) 覆盖未安装及未知已部署目标、已安装但停用目标、添加与移除操作、展开计数、检测加载和卸载刷新。

验证：`npm test`（176 项通过）、`npm run build`、`npm run lint`（无错误，一条已有的 `MySkills` Hook 依赖警告）及 `git diff --check` 通过。未执行原生桌面视觉验收；本次未改 Rust。

## Review

Standards：使用既有安装状态契约与共享组件，删除不再使用的孤立图标分支；页面只调整数据来源，未新增业务逻辑。新增内容不含个人身份信息。

Spec：未安装 Agent 不展示、不计入展开数量；已安装但停用的目标保留，交互继续按部署状态添加或移除。团队文件及目标选择范围不变。
