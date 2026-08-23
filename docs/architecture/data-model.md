# 数据模型

> 状态：migration 0001–0002 已落地；后续业务字段按 ADR 追加 migration。

第一版使用 SQLite，并通过只增不改的 migration 文件管理结构版本。

## 核心实体

| 表                     | 主要用途                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `workspaces`           | 保存名称、规范化路径和最近扫描时间                                                     |
| `config_files`         | 保存 Agent、作用域、路径、格式、校验和与解析状态                                       |
| `config_backups`       | 保存配置备份位置、创建原因和原文件校验和                                               |
| `config_operations`    | 记录编辑、回滚、导入等操作的结果，不保存敏感正文                                       |
| `skill_sources`        | 保存来源类型、规范化 URL/本地路径、manifest、requested/resolved ref、commit 和扫描指纹 |
| `skills`               | 保存 `skill_key`、来源快照、入口路径、Plugin 上下文、兼容性结论和内容指纹              |
| `skill_installations`  | 关联 Skill、Agent、作用域/工作空间、安装路径、revision、指纹、启用状态和受管文件清单   |
| `install_plans`        | 保存待确认的目标、文件动作、前置指纹、权限变化、回滚信息和执行结果                     |
| `install_plan_actions` | 保存计划内逐目标动作、Agent/作用域、路径和预期 checksum，不保存文件正文                |
| `settings`             | 保存非敏感应用设置                                                                     |

工作空间路径、配置文件索引、Skill 来源和安装目标均有唯一约束；global 行必须没有 `workspace_id`，workspace 行必须引用有效工作空间。`settings.key` 第一版只允许 `theme` 和 `backupRetentionDays`。

磁盘上的配置文件始终是真实数据源；SQLite 不保存配置正文。Token、密码和其他敏感字段不得进入数据库或操作日志。备份正文只存放在受限权限的 `~/.agenthub/backups`，SQLite 仅记录路径、checksum、操作原因、时间和固定状态。
