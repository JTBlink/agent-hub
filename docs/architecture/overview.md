# 系统架构

> 状态：规划中

## 总体结构

```text
React UI
   ↓ Tauri commands / events
Rust 业务模块
   ↓ interfaces
Agent 配置、Skill 来源、SQLite 和文件系统 adapters
```

React 负责配置导航、表单或文本编辑、差异展示和 Skill 操作；Rust 负责配置发现、解析、校验、备份、原子写入和外部命令调用。前端不能直接访问 SQLite 或 Agent 配置文件。

## 核心模块

- `configuration`：全局与工作空间配置的索引、读取、编辑、校验、备份和回滚。
- `workspace`：工作空间注册、扫描和配置作用域管理。
- `scope`：按 Agent 官方层级呈现全局/工作空间配置，规范化路径并诊断冲突。
- `agent`：Agent 探测、配置约定和配置格式适配。
- `skill`：Skill 发现、安装状态、变更计划和生命周期操作。
- `history`：配置变更、备份和恢复记录。
- `settings`：应用级偏好和安全选项。

Claude Code、Codex、OpenCode 在 `AgentConfigAdapter` seam 上提供不同 adapter。业务调用方只认识统一的配置文档与作用域模型，不处理各工具的路径、格式和校验差异。Skills 通过独立的 `SkillSource` adapter 接入，第一版覆盖 skills.sh、标准 Marketplace、官方及预置仓库、自定义 Git 仓库和本地仓库目录来源。

配置文件是唯一真实数据源。SQLite 不保存可直接覆盖配置文件的内容副本，只保存文件路径、校验和、解析状态、操作记录和备份位置。首次启动会在平台 app-data 目录创建 SQLite 数据库并运行幂等 migration。

作用域与冲突规则见[作用域、优先级与冲突规则](scope-and-conflicts.md)；AgentHub 不在不同 Agent 之间推断统一优先级。

## 依赖规则

```text
页面 → feature hooks → Tauri commands → 业务模块 → interface → adapter
```

- Tauri command 只负责参数转换、业务调用和结果返回。
- 业务模块不得依赖 React 或具体数据库实现。
- 外部副作用集中在 `infrastructure` 和具体 adapter。
- adapter 之间不得互相调用；跨域流程由业务模块编排。

## 代码架构规范

完整规范见 [ADR-0005：代码架构规范与 SOLID 约束](../adr/0005-code-architecture-conventions.md)。以下是核心约束摘要：

- **模块边界**：`persistence.rs` 超过约 300 行或包含多于两个 repository trait 实现时，必须拆分为 `persistence/` 子模块（workspace、config、skill、settings、migration）。
- **值类型优先**：agent 名称、scope、format、parse_status 等有限枚举集合必须用 `enum` 表达，不用裸 `String`。
- **依赖倒置**：Tauri command 依赖 repository trait，不依赖 `Database` 具体类型，保证无 DB 环境下可单元测试。
- **迁移系统**：`run_migrations` 须支持顺序应用多个版本，不得硬编码版本号判断。
- **接口隔离**：admin / 诊断方法（如 `storage_summary`）不归属于领域 repository trait，收归独立 trait 或挂在 `Database` 上作为非 trait 方法。
- **数据安全**：schema 中禁止出现 `token`、`secret`、`password`、`credential`、`content`、`raw_content` 列名。

## 安全原则

配置写入采用“重新读取并校验版本 → 生成差异 → 用户确认 → 创建备份 → 原子替换 → 重新解析验证”的流程。如果磁盘文件在编辑期间被其他程序修改，必须阻止覆盖并提示重新载入。敏感字段默认遮罩；备份目录沿用原文件权限，日志不得记录 Token 或完整配置内容。
