Type: task
Status: resolved
Blocked by: none

# 项目添加使用已启用 Agent

## Comments

- 用户纠正项目添加窗口展示所有 Agent 的逻辑，明确要求从已启用的 Agent 中选择；桌面选择策略按 ADR-0012 修订。
- 可选目标取项目支持能力与个人已安装、已启用工具的交集。校正默认选择和历史选择，没有可选目标不自动兜底到 Claude Code；链接工作空间保留单一目标。
- 用户追加要求审查和优化“已安装且已启用”的封装。公共 predicate 与列表过滤覆盖侧栏、工作区、设置、同步、管理 Skill 和项目添加入口；个人工具状态来源仍是 get_tool_status，而不是项目能力 DTO。

## Result

- [统一状态判断](../../../src/lib/agentAvailability.ts)提供单个 Agent 判断与保留记录、顺序的列表过滤；侧栏、工作区、设置、同步、管理 Skill 和添加窗口均复用。后端检测及个人启用状态仍由 ToolInfo/get_tool_status 提供。
- [项目适配](../../../src/lib/exportAgents.ts)将个人已安装且已启用工具与项目支持范围求交；默认选择不再兜底到未启用 Claude Code。历史选择及窗口打开后停用的目标都从提交列表中移出。
- [技能详情项目入口](../../../src/components/SkillProjectsSection.tsx)同步使用个人状态，避免另一入口直接使用项目支持 DTO 而绕过限制；链接工作空间仍保留单一目标。
- 三语说明、预览数据、ADR-0012、产品文档与 CHANGELOG 同步。
- `npm test`：50 文件、221 项通过；`npm run build`、`npm run lint` 通过。公共状态 5 项、目标适配 3 项以及添加窗口和详情入口行为覆盖停用、未安装、空列表、旧选择、运行中停用、链接工作空间和记录顺序。
- 本任务未修改 Rust 或 IPC。未重新执行 Tauri 原生人工验收。
- Standards：公共纯函数无 UI 或 IPC 依赖；项目支持能力与个人状态分别读取后适配，安装与启用的组合判断只有一个权威实现；仅安装状态的列表筛选保留原语义。
- Spec：桌面项目新增只从已启用 Agent 选择，两个新增入口都遵循规则；更新默认与历史选择，无可用目标时引导设置，保留既有团队内容及链接工作空间。
