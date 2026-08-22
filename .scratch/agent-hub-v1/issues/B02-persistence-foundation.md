# B02：建立 SQLite 与应用状态基础

Type: task
Status: resolved
Blocked by: B01

## 交付

初始化 SQLite migration、连接生命周期和仓储 interface，保存工作空间、配置索引、备份元数据、Skill 来源/安装和操作记录。

## 验收标准

- 首次启动自动创建数据库并运行 migration。
- schema 与 `docs/architecture/data-model.md` 一致。
- 数据库不保存配置正文和凭据。
- migration、唯一约束和事务回滚有自动化测试。
- 提供应用数据目录诊断信息。

## Comments

- 公共测试 seam 确定为 `Database::open`、诊断接口和领域仓储方法；测试使用真实临时 SQLite 文件，不 mock 数据库，也不通过测试专用 SQL 绕过接口。

## Result

- 已新增 `src-tauri/migrations/0001_initial.sql`，覆盖工作空间、配置索引、备份/操作元数据、Skill 来源/描述/安装、安装计划和应用设置表，并加入外键、唯一约束和索引。
- `Database::open` 会创建平台 app-data 父目录、启用 WAL/foreign keys、运行幂等 migration；Tauri `setup` 已在首次启动时托管连接。
- 已提供 `WorkspaceRepository`、`ConfigMetadataRepository`、`SkillRepository`、`SettingsRepository` 和 `storage_diagnostics` command；设置仅允许非敏感枚举/数值。
- `agent`、`scope`、`format`、`parse_status`、Skill 类型及安装状态已改为领域 enum；`persistence/` 按仓储职责拆分，migration 使用有序注册表遍历全部待应用版本。
- `storage_diagnostics` command 依赖 `StorageDiagnosticsRepository` trait，不再直接耦合具体 SQLite `Database`。
- 配置正文、raw content、token、secret、password 和 credential 不在 schema 中；诊断接口会审计禁止列。
- `src-tauri/tests/persistence.rs` 覆盖首次迁移、唯一约束、事务回滚、重开持久化、仓储元数据、设置校验和敏感列审计；5 个集成测试全部通过。
- 验证：`cargo fmt --check`、Clippy `-D warnings`、`cargo test`。
