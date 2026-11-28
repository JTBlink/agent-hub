---
name: agent-hub-dev
description: AgentHub 项目开发规范。用于本仓库的 Rust、Tauri 或 React 开发、缺陷修复、UI 调整与代码审查。涵盖 IPC、CLI 与桌面验证、平台集成及交付约定。
license: MIT
metadata:
  version: "2.0.0"
---

# AgentHub 开发规范

先读仓库根目录的 `AGENTS.md`、`CONTEXT.md`、相关 Issue 和 ADR，再检查实际调用方。桌面与 CLI 共用 Rust core，延续单入口工作台架构。

下表按任务链接 AgentHub 专用约定。模块设计、行为测试和审查可按需使用全局 `codebase-design`、`tdd` 和 `code-review`。GitHub Actions 与发版使用全局 `github-cli` 和仓库的发布文档。

## 按任务读取规则

| 任务                               | 必要资料                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开发环境、构建与 CLI               | [开发指南](references/development.md)                                                                                                                 |
| Rust、前端逻辑、契约、持久化与重构 | [开发规范：SOLID 与模块边界](references/coding-standards.md)                                                                                          |
| 页面、交互、样式与文案             | [UI 规范](references/ui-guidelines.md)与[组件规范](references/component-guidelines.md)；涉及代码同时读开发规范                                        |
| Logo、平台图标与导出               | [图标规范](references/icon-assets.md)                                                                                                                 |
| 测试、审查与收尾                   | [测试目录与精简规则](references/coding-standards.md#测试与变更范围)、[交付规范](references/delivery.md)、[提交规范](references/commit-conventions.md) |
| 桌面 UI 异常、单测与实际窗口不一致 | [桌面 WebView 调试](references/webview-debugging.md)                                                                                                  |
| 需求、状态与领域文档               | [Issue tracker](references/issue-tracker.md)、[分诊状态](references/triage-labels.md)、[领域文档](references/domain.md)                               |
| GitHub Device Flow、凭据与授权品牌 | [OAuth 维护](references/github-oauth-setup.md)                                                                                                        |

按任务读取相关资料。仅文档改动可用链接与文档检查验收。

## 执行与交付

1. 确认需求、验收条件和影响边界。先找现有组件、纯函数、bindings、适配器和安全校验，再设计变更。
2. 按职责实现最小完整改动。涉及代码平台时遵循[GitHub / GitLab 独立集成边界](references/coding-standards.md#github--gitlab-独立集成)，平台实现独立、共享层保持中立。按[复用设计与性能规则](references/coding-standards.md#复用设计)检查现有实现、数据来源、执行成本和资源生命周期；变更跨端契约时检查注册、DTO、bindings 和调用方。
3. 用可观察行为验证验收条件。缺陷修复增加回归测试；UI 检查主题、缩放、键盘与异步反馈；仅文档改动检查结构、链接与规则一致性。
4. 涉及 CLI 或共享 Rust core 的变更，按[开发指南：CLI 自动更新约定](references/development.md#cli-自动更新约定)通过项目编译入口更新本机 CLI；涉及桌面行为时启动新构建并验证运行实例，不能用编译成功代替生效验收。
   构建与打包按[构建产物保留规范](references/development.md#构建产物保留规范)只保留各目标最新产物，成功后自动清理历史版本；检测到并行 Cargo 编译时延后清理。
5. 回写对应 GitHub Issue 的结果和里程碑；按实际影响决定是否记录 `CHANGELOG.md`。汇报修改结果、执行过的验证以及尚未完成的验收。创建 skill 或完成实现本身不授权提交、部署或发布。

审查时分别判断 **Standards**（规范、性能、复用设计、安全、兼容性）和 **Spec**（需求与验收行为）。按[审查证据要求](references/coding-standards.md#审查与交付证据)指出具体文件、影响和修复建议，不用“已遵循规范”代替证据。
