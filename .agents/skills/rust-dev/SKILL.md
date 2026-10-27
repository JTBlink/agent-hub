---
name: rust-dev
description: 项目内部开发规范。在本仓库进行 Rust、Tauri、React 功能开发、缺陷修复、UI 调整或代码审查时使用，落实 SOLID、模块边界、测试、兼容性和提交要求。
license: MIT
metadata:
  version: "1.1.0"
---

# 项目开发规范

本 skill 位于仓库的 `.agents/skills/rust-dev/`，随 Git 共享，是本项目开发规范的统一维护入口；不属于产品内置技能或用户全局技能库。名称通用，规则服务当前项目，不能未经适配直接套用到其他仓库。仅阅读文档时无需执行构建。

Skill 版本以 frontmatter 的 `metadata.version` 为准，独立于应用 `VERSION`；能力或规范变化时按 SemVer 更新，并同步界面元数据、参考资料与项目记录。

## 建立项目上下文

从当前工作目录向上定位同时包含 `CONTEXT.md`、`src/` 和 `src-tauri/` 的项目根目录；本文的代码和文档路径均相对该目录，`references/` 链接相对本 skill。未找到仓库时可提供规范建议，不能猜测目录并修改其他项目。

先读取项目 `AGENTS.md`、`CONTEXT.md`、相关 GitHub Issue 规格和有效 ADR，再查当前调用方与同类实现。当前项目为单入口 Skills Manager 工作台，桌面与 CLI 共用 Rust core；不恢复旧配置编辑器或双窗口架构。

开发约定统一修改本 skill 的原文；任务、分诊与领域文档消费规则在 `docs/agents/` 统一维护，本 skill 的参考入口链接这些规则，避免重复。领域上下文、产品规划、架构说明与 ADR 保留原位；源码、锁文件和工作流反映实际实现。发现规范与实现不一致时，明确差异并在当前任务范围内修正，不能把规划描述为已实现功能。

## 按任务读取规则

| 任务                               | 必要资料                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 开发环境、构建与 CLI               | [开发指南](references/development.md)                                                                                   |
| Rust、前端逻辑、契约、持久化与重构 | [开发规范：SOLID 与模块边界](references/coding-standards.md)                                                            |
| 页面、交互、样式与文案             | [UI 规范](references/ui-guidelines.md)；涉及代码同时读开发规范                                                          |
| Logo、平台图标与导出               | [图标规范](references/icon-assets.md)                                                                                   |
| 测试、审查与收尾                   | [交付规范](references/delivery.md)、[提交规范](references/commit-conventions.md)                                        |
| 需求、状态与领域文档               | [Issue tracker](references/issue-tracker.md)、[分诊状态](references/triage-labels.md)、[领域文档](references/domain.md) |
| GitHub Device Flow、凭据与授权品牌 | [OAuth 维护](references/github-oauth-setup.md)                                                                          |

只读当前任务所需资料；本 skill 独立执行开发任务，普通开发不触发发布，版本 tag、Actions 与 Release 不属于本技能范围。

## 执行与交付

1. 确认需求、验收条件和影响边界。先找现有组件、纯函数、bindings、适配器和安全校验，再设计变更。
2. 按职责实现最小完整改动。路径、安全校验和领域状态复用权威实现；变更跨端契约时检查注册、DTO、bindings 和调用方。
3. 用可观察行为验证验收条件。缺陷修复增加回归测试；UI 检查主题、缩放、键盘与异步反馈；仅文档改动检查结构、链接与规则一致性。
4. 回写对应 GitHub Issue 的结果和里程碑；按实际影响决定是否记录 `CHANGELOG.md`。汇报修改结果、执行过的验证以及尚未完成的验收。创建 skill 或完成实现本身不授权提交、部署或发布。

审查时分别判断 **Standards**（规范、复用、安全、兼容性）和 **Spec**（需求与验收行为）。指出具体文件、影响和修复建议，不用“已遵循规范”代替证据。
