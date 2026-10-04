# B13：定义开发规范并盘点旧逻辑

Type: task
Status: resolved
Blocked by: B10

## 目标

为当前 React + Tauri 主应用定义独立的 SOLID 开发规范，并检查可清理的旧逻辑。保持原有架构决策和用户数据兼容边界。

## Result

- 新增[开发规范](../../../docs/development/coding-standards.md)，覆盖 SOLID、KISS / YAGNI / DRY、模块与契约、状态、错误、数据安全和验证。
- 更新 `AGENTS.md`、文档导航与开发指南；修正 ADR-0006 对已退役接口、安装计划与不存在的 bindings 文件的描述。拆分阈值与渐进治理决策保持不变。
- 完成下方静态盘点；删除两个未引用的 Vite/React 模板资源，并移除未被调用的前端 `getToolOrder` 封装。未删除后端 command、依赖或兼容分支，未改变用户可见行为、发布流程或兼容性，无需更新 CHANGELOG。

### 旧逻辑清理候选

| 项目                                      | 当前证据                                                                                  | 后续处理                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/assets/react.svg`、`public/vite.svg` | 入口使用自有 `app-icon.svg`，当前源码未检索到这两个模板资源的引用；历史导入清单只用于溯源 | 已删除未引用资源，保留导入清单的历史事实                                            |
| `src/lib/tauri.ts` 的 `getToolOrder`      | 全仓检索只有封装定义；`setToolOrder` 仍被 Settings 使用                                   | 已移除未使用的前端封装；Rust command 仍注册，不能由前端未调用直接推定全部接口可删   |
| shell 插件                                | JS 依赖无源码 import，Rust 只有插件初始化；当前 capabilities 未声明 shell 权限            | 评估同时移除 npm / Cargo 依赖和初始化；先核实桌面启动、CLI sidecar 打包及各平台行为 |
| 超大页面和 Rust 模块                      | 例如 MySkills 约 2300 行、skills command 约 4300 行，超过 ADR 拆分阈值                    | 按展示、安装、更新等职责逐步拆分；体量不等于死代码                                  |

### 已排除的误删项

- `core/git_backup.rs` 中标记 `allow(dead_code)` 的 `init_repo`、`commit_all`、`clone_into`、`restore_snapshot_version` 被 CLI 调用，不能整批删除此类函数。
- `migrate_legacy_tool_keys` 仍在 `app_state` 初始化中运行；凭据迁移仍在桌面启动中调用，数据库 `run_migrations` 仍由 SkillStore 执行。停止自动迁入其他应用数据，并不意味着当前数据库升级和恢复链路可以删除。
- `@hello-pangea/dnd` 仍用于 Sidebar；它与 dnd-kit 并存需要统一交互实现后才能精简依赖。

### 验证与审查

- 已运行 `npm run lint`、`npm test -- --run`（50 项通过）、`npm run build`。构建通过，仍提示 Browserslist 数据过期及主 bundle 体积较大。
- 文档使用 Prettier 校验，并检查相对链接、tracker 状态和 `git diff --check`；本轮无 Rust 源码变更，未运行 Rust 测试。
- Standards：规范使用实际存在的模块入口，保留 ADR 阈值与隐私要求，不强制为单一实现增加 trait。
- Spec：独立规范文件与入口链接已落地；清理候选区分静态证据与尚需运行验证的项目。
