# 开发规范

本规范适用于 AgentHub 的前端、Tauri commands、Rust 核心、CLI、测试与文档。领域术语以根目录 `CONTEXT.md` 为准，架构决策以当前有效的 ADR 为准。新代码遵守本规范；历史代码在触及相关功能时渐进治理，避免仅为改行数而整体重写。

## 设计原则（SOLID）

- **单一职责（SRP）**：一个模块只围绕一个变化原因组织。React 页面负责组合和页面状态；可复用交互放入组件或 hook，展示转换放入 `src/lib/` 纯函数。Tauri command 负责参数、权限与错误边界，文件扫描、持久化、同步和 Git 操作放入 `src-tauri/src/core/` 的对应模块。
- **开放封闭（OCP）**：新增 Agent 目录规则优先扩展 `core/tool_adapters.rs` 中的适配器定义与解析流程；新增 Skill 来源、同步方式时集中扩展对应领域入口，避免在多个页面或 command 中重复 `if/else`。只有确实存在多种稳定实现时才抽象，不为单一实现提前创建 trait。
- **里氏替换（LSP）**：同一抽象的不同实现必须保持相同的输入校验、错误语义和副作用边界。例如不同 ToolAdapter 的目录解析和扫描规则应遵守同一调用契约；不能让替换实现悄悄删除未托管文件或改变只读扫描的含义。
- **接口隔离（ISP）**：调用方只依赖所需操作。拆分过宽的 props、hook 返回值和 Rust trait；不要为一个页面注入包含扫描、安装、备份全部能力的“万能服务”。若并无多个实现，优先传入具体的小函数或值对象。
- **依赖倒置（DIP）**：领域判断不依赖 UI、Tauri 窗口或具体文件路径。前端经 `src/lib/tauri.ts` 调用 command；桌面端与 CLI 共用 `core/`。需要替换外部 I/O 以测试领域逻辑时，在边界引入小接口，而不是让核心依赖 command。

## 模块与复用边界

- **KISS / YAGNI / DRY**：选择满足当前需求的最简单实现，不为假设中的功能预建框架；复用稳定的领域规则，不因代码形似就把不同业务强行合并。第三次出现相同语义的重复实现时必须抽取；安全校验与路径规则从第一次起即复用。
- 遵循 [ADR-0006](../adr/0006-file-size-and-reuse-conventions.md) 的拆分触发线：页面建议不超过 400 行，超过 600 行必须拆分；Rust 模块建议不超过 500 行，超过 800 行必须拆分。触及历史超大文件时优先抽出本次变更的职责，不要求一次性重构整文件。
- Agent 路径、项目作用域、文件安全校验和技能同步状态应有单一权威实现。先查现有领域类型、path guard、scanner、adapter、command 与 bindings，再新增逻辑；语义和生命周期不同才保留局部实现。
- `src-tauri/src/main.rs` 保持启动入口职责。业务规则放在 `core/`，commands 做薄适配，避免桌面与 CLI 各自实现一份。
- 公共函数与模块名称描述领域行为。Rust 遵循 `rustfmt`、`snake_case`/`UpperCamelCase`/`SCREAMING_SNAKE_CASE`；TypeScript 采用项目现有命名与格式，新增可复用逻辑应有清晰的输入、输出及错误语义。

## 前端与跨端契约

- 组件采用明确的 props 类型，外部输入先校验再使用；不以 `any`、强制类型断言或关闭 lint 绕过边界问题。UI 文案沿用 `src/i18n/`，颜色与样式遵循[视觉规范](../design/ui-guidelines.md)。
- 状态应有唯一权威来源；可计算出的值直接派生，不维护重复状态。Effect 用于与外部系统同步，必须清理监听与订阅；异步结果避免在取消、卸载或目标切换后覆盖当前状态。
- 修改 command 名称、参数、DTO、事件或错误结构时，同步检查 Rust 注册入口、`src/lib/tauri.ts` 和调用方。数据库内部名称不等于对外契约，不为统一命名而无迁移地改动持久化字段。

## 状态、错误与数据安全

- SQLite schema 变更必须新增 migration，并覆盖新库创建、旧库升级及重复执行。已经发布的 migration 不因“旧”而直接删除；只有明确最低支持版本、数据迁移与恢复策略后才能收缩兼容路径。
- 文件删除、移动、覆盖、部署前确认路径属于当前应用管理范围；沿用既有 `path_guard`、`removals` 和同步记录，不靠 UI 隐藏按钮代替后端校验。失败时保留可恢复状态，并返回能指导处理的错误。
- 不忽略会影响数据完整性的失败，不用 `unwrap` 处理正常运行时的外部输入。日志与测试 fixture 遵守仓库隐私规则，不能写入真实身份信息、令牌或带用户名的绝对路径。
- 新增设置和持久化字段应说明默认值、升级行为、用户是否可查看或修改、删除时的清理方式；避免留下没有入口可管理的隐形偏好。
- 文件系统与数据库的联合操作明确提交顺序和失败恢复；涉及共享技能库写入时复用 `repo_lock` 及现有事务边界，明确由哪一层持锁，避免重复加锁。阻塞 I/O 不占用 UI 或异步执行线程；耗时任务沿用取消和进度反馈机制。

## 测试与变更范围

- 缺陷修复添加能重现问题的回归测试。纯转换用单元测试；跨 command、SQLite 或文件系统边界用对应集成测试。避免只重复实现细节的测试。
- 修改前确认调用方、序列化字段、持久化数据和平台差异；删除旧分支前查引用并验证用户数据和已发布版本的兼容性。不可仅凭 `legacy`、`deprecated`、`allow(dead_code)` 或文件行数判定可删。
- 运行与改动相关的 `npm run lint`、`npm test`、`npm run build`、`cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 和 `cargo test --manifest-path src-tauri/Cargo.toml`；提交前检查 `git diff --check`。文档改动至少验证引用链接、格式和 tracker 状态。
- 任务状态写入 `.scratch/`，用户可见行为、发布流程或兼容性变化写入 `CHANGELOG.md`。提交与审查遵循[提交规范](commit-conventions.md)。
