# Herdr 集成模块

Herdr 定制逻辑集中在独立模块中。通用工作空间、任务、自动化和终端模块作为调用方，不各自实现 Herdr 会话、工作树或安装管理规则。

## 前端

入口目录为 `src/features/herdr/`：

| 位置          | 职责                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| `api.ts`      | Herdr 功能使用的 API 入口，聚合控制、工具及终端挂接 bindings              |
| `components/` | 侧栏、工作空间行、工作树右键菜单、会话管理、Agent 操作与 Herdr 自动化配置 |
| `hooks/`      | 快照订阅、会话选择及项目与 Herdr workspace 联动                           |
| `lib/`        | 显式会话 IPC、工具安装与更新 IPC、Agent 定义、仓库分组与焦点解析          |
| `terminal/`   | Herdr PTY 客户端创建、挂接恢复、快捷启动及终端操作栏                      |

模块内部通过自身 `api.ts` 调用 Herdr 功能，不经应用级 `src/lib/tauri.ts` 反向引用自身。`tauri.ts` 保留现有导出兼容调用方，通用终端的 `terminalApi.ts` 将 Herdr 客户端创建委托给模块适配器。PTY 事件、写入、关闭与布局仍由通用终端模块统一管理。

普通左键选择已有 workspace 时保留最近窗格。侧栏根工作空间可拖拽排序，按 Herdr 会话在应用设置中保存根 workspace ID 顺序；筛选列表复用该顺序，新工作空间追加到末尾，子工作树始终随所属根工作空间整体移动。右键打开子工作树时传入当前项目、checkout 路径及父 workspace ID，使用 Herdr 原生 `worktree open --workspace <id> --path <path> --no-focus`，复用已有工作树并保留仓库分组。项目根菜单显示“打开项目”，子工作树显示“打开工作树”；主工作树不提供删除入口，锁定工作树可打开但不可删除。

## 后端

Tauri 适配集中在 `src-tauri/src/commands/herdr/`，核心实现集中在 `src-tauri/src/core/herdr/`：

- `control/`：显式会话快照、目标身份与前台进程校验、workspace 打开、子工作树原生打开与确认删除。
- `agents/`：Herdr 中的原生 Agent 启动、环境隔离和就绪检查。
- `session/`：原生 `default` 会话准备与项目目录路由；仅在 crate 内可见。
- `tools/`：安装来源检测、下载、版本检查与更新。

`commands/terminal.rs`、任务启动及自动化代码调用这些领域能力。通用终端保留原子化的输入修订、Shell 就绪、前台所有权及 PTY 写入检查；Herdr 会话选择与命令构造由 Herdr 模块提供。项目与 checkout 归属、路径和文件操作继续复用 `project_worktrees`，不复制通用 Git 安全规则。

## 兼容性与验证

整理模块不改变 IPC 命令名、参数、持久化布局或会话生命周期。后端按层引用 `core::herdr::{control, agents, tools}`，不保留旧模块路径的平行实现。组件和单元测试随所属模块就近放置，跨模块 Rust 集成测试保留在 `src-tauri/tests/`，浏览器验收保留在 `tests/browser/`。

前端执行全量测试、Lint 和构建；后端执行全量测试、格式检查及严格 Clippy。工作树原生命令另在独立 Herdr 测试会话验证，不能对用户会话执行实验性删除或重启。
