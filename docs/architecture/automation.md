# 自动化管理

桌面页面与 `agent-hub-cli automations` 共用 `core::automation`。原生系统任务与 Hermes 各自调度，应用不增加依赖桌面窗口存活的轮询调度器。

| 模块                                                           | 职责                                                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `definition.rs`                                                | 跨端输入、日程、创建记录与输入校验                                                           |
| `workspace.rs`                                                 | 留空工作目录时在 `~/.agent-hub/automations/<任务 ID>/workspace` 建立独立工作区，显式路径不变 |
| `store.rs`                                                     | 原子 JSON 写入、进程间操作锁与版本校验                                                       |
| `managed.rs`                                                   | 创建、乐观并发编辑、删除、手动运行、创建记录关联                                             |
| `native.rs`、`native/render.rs`                                | 当前用户的 launchd / systemd / Windows 注册与触发，生成独立执行脚本                          |
| `hermes_manage.rs`                                             | 固定参数调用已安装 Hermes CLI，按任务文件定位 profile                                        |
| `launchd.rs`、`linux.rs`、`windows.rs`、`cron.rs`、`hermes.rs` | 原有任务读取；来源独立报告失败                                                               |

## 创建者与调度器

`source` 表示调度器，`origin` 表示创建者，二者独立。`origin=agent_hub` 必须有创建记录，按调度器、原始标识和确切配置位置匹配；同名 LaunchAgent / LaunchDaemon 不能合并，名称或 Bundle ID 不能用于声称归属。

记录位于系统本地应用数据目录的 `com.jtstudio.agenthub/automations/tasks.json`，与技能库搬迁、备份和 SQLite 无关。macOS 使用 `~/Library/Application Support/`，Linux 通常使用 `~/.local/share/`（遵守 XDG），Windows 使用 `%LOCALAPPDATA%`。独立位置避免技能库根目录整体搬迁后原生调度器找不到执行脚本。`AGENT_HUB_AUTOMATION_HOME` 支持显式隔离的绝对目录，GUI 和 CLI 使用相同约定。读取缺失文件不创建记录；损坏记录报告错误并保留外部任务，不能静默覆盖。

原生任务使用 UUID 标识，修改前重新计算并核对当前用户的目标标识、配置路径。写入持有独立进程锁；更新需匹配 `revision`，注册或记录提交失败尝试恢复旧配置，恢复失败明确返回。当前不提供对外部系统任务的接管或编辑功能。

## 执行与限制

- macOS 使用当前 GUI 用户的 LaunchAgent；Linux 使用用户级 service/timer；Windows 使用当前 SID 的 InteractiveToken / LeastPrivilege 任务。无需管理员提权。执行依赖登录会话，Linux linger 可由用户另行配置。
- 新建和保存不设置开机立即运行；计划日程仍可在下一次匹配时间执行。仅手动任务无计划触发器。暂停原生任务只撤掉计划触发能力，保留手动运行能力。
- 手动运行使用 `launchctl kickstart`（不带强制重启）、`systemctl --user start --no-block` 或 `schtasks /Run`，不更改日程定义。系统调度器负责同一任务实例的串行执行，正在运行时拒绝编辑、删除与再次触发。
- 原生命令使用 `/bin/sh` 或 PowerShell，以当前用户身份执行；工作目录留空时，自动创建 `~/.agent-hub/automations/<任务 ID>/workspace` 并保存实际路径；显式工作目录须存在。隔离环境变量指定时，默认工作目录也隔离到该根的 `workspaces` 下；仅列表查询不创建目录。最新输出写入任务目录的 `output.log`，每次覆盖；`started` / `exit` 记录最新执行时间及退出码。Unix 脚本和输出使用私有权限。删除成功后清理原生任务脚本及执行日志，保留工作目录和其中的用户文件。任务记录与执行脚本使用系统应用数据目录，工作目录则按用户要求位于应用主目录；用户自行移动工作目录后需在任务中更新路径。
- Hermes 调用 `cron create/edit/pause/resume/remove`，不重写 `jobs.json`，未选择的模型、技能等选项保留。创建从 CLI 成功响应读取真实 ID，写入创建记录后才展示 AgentHub 归属。外部 Hermes 任务编辑后仍是其他来源。
- Hermes 的 `cron run` 可能同步执行较长模型任务，因此以独立进程请求，输出写入 `hermes-runs`；执行锁和结果由 Hermes 自己维护，不套用查询超时。暂停和终态任务要求先恢复/修复。返回请求成功不能视为任务执行成功；Hermes 可能按自己的领取规则推进下一次运行时间，但不修改日程定义。
- 当前仅支持本机；不提供远程主机、跨设备接管或合成运行历史。系统任务编辑支持每日、工作日、分钟间隔与手动模式；Hermes 额外接受其自定义日程表达式。未知状态或运行时间保留未知。

## 页面

列表按创建者分组筛选，调度器和状态为独立筛选条件，系统内置过滤默认开启。新建/编辑采用左侧名称与正文、右侧调度设置；详情为可链接页面，包含面包屑、概述/技术信息、标题状态、运行指标和正文，提供立即运行与编辑。技术标识不占据列表名称列，命名与图标解析继续复用已有只读适配器。

UI 和 CLI 不复制任务校验与权限判断。IPC 薄封装运行在阻塞线程池；异步错误保留表单内容与已读取的任务。前端显示 `can_edit` / `can_run` 能力，后端仍重新核对真实任务及创建记录。

## 验证

单元测试覆盖跨平台配置生成、引号路径、多行脚本退出码、创建者的确切作用域、损坏记录、写锁与失败恢复。`src-tauri/tests/automation_management.rs` 为显式运行的原生验收：生成唯一的用户级手动任务，创建、编辑、拒绝过期版本、手动运行、读取结果、删除并清理；不修改用户已有任务。

```bash
cargo build --manifest-path src-tauri/Cargo.toml --bin agent-hub-cli
cargo test --manifest-path src-tauri/Cargo.toml --test automation_management -- --ignored
```

## Git 自动备份与模板

任务注册记录同时持久化 `pending_backup`，按任务 ID 合并配置变化与删除标记；只读查询、执行日志与手动触发不进入队列。`backup_workspace::prepare_unlocked` 在既有 RepoLock 内获取自动化锁，将待处理定义投影为技能元数据中的 `.agent-hub/automation-<UUID>.json`，写入后确认队列。此锁顺序固定为 RepoLock → 自动化锁，任务修改本身只持有自动化锁，避免死锁。

这些平铺 JSON 是现有对象合并引擎可识别的 residual blob，按独立任务合并，保留增删与快照恢复；不用会被旧合并引擎忽略的未知子树。投影只包含名称、Provider、命令/提示词、日程和工作目录等定义，不包含调度器标识、配置路径、图标、运行日志、进程和本机执行脚本。默认工作目录回到未指定语义，主目录内的显式工作目录表示为 `~/...`。

文件监视器只额外监视当前应用的注册目录（非递归），检测 CLI 通过原子替换提交的配置变化；持续使用现有自动备份开关、防抖、重试及错误提示。应用未运行时不新建后台守护进程，下次启动或手动备份处理待提交定义。

Git 内容恢复只更新同步定义，不变更运行中的本机任务。GUI 将备份作为“使用模板”的一类，供查看后新建；CLI 的 `restore` 先预览，`--apply` 显式创建暂停副本。内置模板由 Rust core 生成，GUI 和 Agent CLI 使用同一份当前平台命令；Windows 使用 PowerShell，其他平台使用 `/bin/sh`，Hermes 模板仅安装后返回。

自动备份回归使用本地 bare remote 验证任务定义新增、更新、删除的实际推送，以及快照恢复后定义保留且本机任务不被覆盖。所有数据和目录隔离，未操作用户配置的 Git 远端。
