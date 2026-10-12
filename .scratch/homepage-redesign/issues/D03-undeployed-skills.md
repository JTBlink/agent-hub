Type: task
Status: resolved
Blocked by: D02

# 工作台集中查看未部署技能

在“已部署”卡片展示未部署数量，打开完整列表并进入技能详情部署；数量与现有部署统计一致，覆盖零数量、超过近期列表上限以及数据刷新。使用现有主题与三语文案。

## Comments

- 用户通过工作台截图要求查看未部署技能可展示的位置。入口紧邻部署统计，避免增加独立指标卡；只查看列表与进入详情，不自动部署。

## Result

- [Dashboard](../../../src/views/Dashboard.tsx) 在“已部署”指标下展示未部署数量与查看按钮；与已有指标共用部署目标数据，无未部署技能时禁用入口。
- [完整列表](../../../src/components/UndeployedSkillsDialog.tsx) 使用原生 dialog，显示全部技能名称与描述，点击沿用技能详情路由。复用现有主题变量，支持滚动、Escape、焦点约束与关闭后恢复焦点；三语文案已同步。
- [行为测试](../../../src/views/Dashboard.test.tsx) 4 项通过，覆盖超出近期动态上限的 14 个技能、详情入口、部署后列表刷新、空技能库和全部已部署状态。
- `npm test -- src`：33 个文件、135 项通过；`npm test`：187 项通过，2 项既有 `scripts/set-version.test.mjs` 失败，原因是版本脚本测试 fixture 未创建 `src/i18n/en.json`，未修改该脚本与测试。
- `npm run build` 通过；`npm run lint` 无错误，仅既有 MySkills Hook 依赖警告；修改文件的 ESLint、Prettier 与 `git diff --check` 通过。
- Chromium 本地合成数据预览：深浅主题、960px 窗口、1.5 倍字号、三语文案、列表滚动与无横向溢出通过；原生 Tab 焦点保持在弹窗、Escape 关闭与焦点恢复通过。截图已目视检查；未执行 Tauri 原生应用验收。
- Standards：列表组件独立于页面，派生状态不新增持久化或 IPC；复用技能详情路由与 DTO，原统计保留。Spec：入口紧邻“已部署”，完整展示未部署技能，不受技能组或近期动态限制，覆盖零数量与数据刷新。
- CHANGELOG 与预览 fixture 已更新，未提交或发布。

- 后续需求调整：用户要求删除该弹窗，改为技能库原位筛选，见[部署筛选与布局优化](../../skill-library-filters/spec.md)。原验收记录保留为历史。
