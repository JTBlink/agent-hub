Type: task
Status: claimed
Blocked by: none

# 项目技能库团队安装闭环

## Scope

按 ADR-0010 将普通项目导出改为项目库实际内容和团队入口，保留全局及链接工作空间行为。桌面和 CLI 共用 core，元数据可移植，保护未托管内容及更新修改，支持从项目库修复入口。提供需提交文件及共享可见性说明。

## Acceptance

- 团队目标不受维护者本机安装检测和个人启用偏好限制。
- 移除个人来源后公共内容与 Agent 副本仍完整可读。
- 更新和入口重建拒绝覆盖本地修改，失败或中断可恢复。
- 元数据不保存个人来源绝对路径，Git 拉取后可直接使用。
- 前端、CLI、Rust 公开行为回归及静态检查通过。

## References

[设计](../../../docs/plans/agent-hub.md#项目技能库与团队协作方案)

## Comments

- 2026-10-12：按用户要求，将项目技能库说明压缩为一行“技能随项目提交 Git，团队成员拉取即可使用。”，同步英文与繁体，移除多段标题和路径说明。
- 文案改动验证：`npm run build`、`npm test`（165 个测试）、组件 ESLint、三语资源和组件 Prettier 检查通过。全量 `npm run lint` 在未修改的 `SkillFileBrowser.tsx` 中发现 `react-hooks/set-state-in-effect` 错误，`MySkills.tsx` 另有 hook 依赖警告；本次未扩展修改这些文件。
- 2026-10-12：补充并验证项目库面板回归测试（3 个通过），覆盖 Git 提交路径、忽略资源提示、副本修复及切换项目时的迟到响应；CLI 回归测试通过，确认 `project status` 无需个人技能库且不写入项目。相关 ESLint、Prettier、Rust 格式和 `git diff --check` 通过。

- 用户已授权修改代码及提交、推送。先交付 ADR-0010 的首轮范围；远程固定修订下载与旧项目批量迁移仍保留后续规划。
