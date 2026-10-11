Type: task
Status: resolved
Blocked by: D01

# 美化应用内 Dashboard

改进标题、指标、近期技能与工作空间入口；保留真实状态和现有操作路径。同步国际化、示例截图和更新日志，验证后提交 push。

## Comments

用户已明确授权本次主页、README 与 Dashboard 变更提交并 push。其他并行任务的工作区修改保留原样，不纳入本次提交。

## Result

- 重设计 Dashboard：标题与紧凑安装操作、真实技能数量与部署覆盖率、带描述和部署 Agent 图标的近期技能、已启用 Agent 与项目工作空间入口。
- 工作空间面板拆入 `DashboardWorkspaces`，复用 AgentIcon 与现有 DTO、路由和品牌变量；三种语言同步。近期技能采用原生按钮，键盘操作可打开详情。
- 重新生成当前 Dashboard 示例截图并用于官网与 README；补全旧 Dashboard 浏览器 fixture 的目录查询数据，维护 Agent 导航回归脚本。
- `npm test`：37 个文件、154 项通过。`npm run build` 通过。`npm run lint`：无错误，仅既有 MySkills Hook 依赖警告。
- Chromium：960 / 1440px 明暗主题、空技能 / 空 Agent / 空项目、已安装且启用的 Agent 计数、项目和 Agent 路由、键盘进入 Agent 设置及焦点通过。界面截图已目视检查。
- Standards：页面和面板职责分离，语义主题变量，复用图标、DTO 和现有调用，不增加持久化设置。Spec：保留导入、安装、技能详情和 Agent 管理入口，增加项目入口与空状态，官网及 README 使用更新截图。
- 仅提交本任务与 D01 相关文件；并行的项目同步与设置改动不纳入本次提交。
