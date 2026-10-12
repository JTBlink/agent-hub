Type: task
Status: resolved
Blocked by: none

# 修复设置页版本状态未使用的编译错误

将现有应用版本状态接入版本标题，保留加载及失败时的回退文案，验证 TypeScript 构建与前端检查。

## Comments

- 用户报告 `Settings.tsx` 的 `appVersion` 未使用，触发 TS6133。
- 保留工作区已有的版本读取逻辑，将结果接入展示。

## Result

- [Settings](../../../src/views/Settings.tsx) 的版本标题优先展示已读取的应用版本，读取完成前或失败时沿用翻译文案；版本读取调用已按项目格式排版。
- 编译回归：修改前 `npx tsc -b` 复现 TS6133；修改后 `npm run build` 通过。编译器直接验证未使用状态的问题，无新增仅匹配源码的测试。
- `npm test -- src`：33 个文件、135 项通过；`npm run lint` 无错误，仅既有 MySkills Hook 依赖警告；Settings Prettier 与 `git diff --check` 通过。
- Standards：保留已有状态与 Tauri 版本来源，只接入现有展示位置；未添加 IPC、持久化状态或新组件。Spec：消除未使用状态编译错误，并保留加载及失败时的回退。
- 更新 CHANGELOG；未执行原生界面验收，未提交或发布。
