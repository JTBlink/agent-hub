# ADR-0005：代码架构规范与 SOLID 约束

- 状态：已接受
- 日期：2026-08-22

## 背景

B01 工程骨架完成后，对现有代码做了 SOLID 审查，发现若干在 B02→B03 阶段会成为实际阻力的结构性问题，集中在 `persistence.rs` 的体积、agent/scope 的字符串表示、以及 Tauri command 层直接耦合具体实现。

## 决策

以下规范在 V1 开发周期内强制执行。

### 1. 模块边界（SRP）

`persistence.rs` 在超过约 300 行或包含多于两个 repository trait 实现时必须拆分为子模块：

```
persistence/
  mod.rs        ← 错误类型、公共 trait、Database 结构体
  workspace.rs  ← WorkspaceRepository
  config.rs     ← ConfigMetadataRepository
  skill.rs      ← SkillRepository
  settings.rs   ← SettingsRepository
  migration.rs  ← run_migrations
```

Tauri command 不承担业务逻辑；业务模块不依赖 React 或具体数据库实现。

### 2. 值类型优先于裸字符串（OCP / 类型安全）

agent 名称、scope、config format、parse_status、skill kind、installation state 等有限枚举集合，必须用 `enum` 表达，而不是 `String`。新增 agent 只需扩展 enum，不修改校验函数。序列化时由 serde 转换为字符串。

```rust
// 正确
pub enum AgentKind { ClaudeCode, Codex, OpenCode }

// 错误：在持久化层用字符串校验
if !matches!(agent, "claude-code" | "codex" | "opencode") { ... }
```

`validate_agent_scope` 这类在持久化层做领域校验的函数，随 enum 落地后应删除。

### 3. 依赖倒置（DIP）

Tauri command 依赖 repository trait，不依赖 `Database` 具体类型：

```rust
// 正确：依赖 trait
fn storage_diagnostics<R: ConfigMetadataRepository>(state: tauri::State<'_, R>) { ... }

// 错误：依赖具体类型
fn storage_diagnostics(state: tauri::State<'_, persistence::Database>) { ... }
```

`AgentConfigAdapter` 的实现通过 `ScanContext` 注入路径，不直接调用 `fs::read`。
需要文件系统隔离测试的场景，通过 trait 抽象 FS 操作。

### 4. 迁移系统

`run_migrations` 必须支持顺序应用多个版本，不得硬编码版本号判断：

```rust
for migration in MIGRATIONS.iter().filter(|m| m.version > applied) {
    apply(migration)?;
}
```

### 5. admin / 诊断能力归属（ISP）

`storage_summary` 查询全部 7 张表，不属于 `ConfigMetadataRepository`。
诊断类方法收归独立 trait（`DiagnosticsRepository`）或直接挂在 `Database` 上作为非 trait 方法。

### 6. 数据安全约束（持续）

`forbidden_schema_columns` 检查保留，任何包含 `token`、`secret`、`password`、`credential`、`content`、`raw_content` 列名的 migration 须在 code review 阶段拒绝。

## 影响

- B02 结束前完成 persistence 子模块拆分和 enum 替换。
- B03 开始时 Tauri command 层须改用 trait，保证可在无 DB 环境下单元测试。
- 新增 agent adapter 时只扩展 `AgentKind` enum，不修改校验函数。
- 迁移文件命名延续 `0001_initial.sql` 格式，版本号单调递增。

## 备选方案

- 保留裸字符串 + 集中校验函数：短期成本低，但每次新增 agent 都要修改多处，且编译器无法拦截非法值。
- 使用 `sqlx` 替换 `rusqlite`：提供编译期 SQL 检查，但需要额外配置宏和 DB 文件，V1 范围内收益不足以覆盖迁移成本。
