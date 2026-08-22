# B01：创建 Tauri + React 工程骨架

Type: task
Status: resolved
Blocked by: none

## 交付

建立 Tauri 2、React、TypeScript、Rust 单 crate 工程，落地文档中的功能分域目录、统一错误返回和前后端类型绑定。

## 验收标准

- 桌面应用可在开发模式启动并显示基础导航。
- 包含配置中心、Skills 中心、工作空间、历史和设置入口。
- 提供一个经过测试的 Tauri command 纵向示例。
- CI 执行格式、lint、类型检查和最小测试。
- 不在此任务实现真实配置或 Skill 行为。

## Result

- 初始化 Tauri 2、React、TypeScript 和 Rust 单 crate 工程。
- 增加配置中心、Skills 中心、工作空间和历史入口骨架。
- 增加 `app_info` Tauri command、TypeScript 调用层和 Rust 单元测试。
- 增加统一结构化日志适配层，输出到标准输出和平台日志目录，并以固定事件、命令和错误码约束敏感字段。
- 验证 `npm run build`、lint、前端测试、Rust fmt、Clippy 和 Rust 测试通过。
- 本机成功生成 `AgentHub.app` 与 `AgentHub_0.1.0_x64.dmg`。
