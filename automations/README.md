# AgentHub Automations

可直接安装的自动化任务包，与根目录 `skills/` 并列。每个任务以 `TASK.md` 为说明入口，`config/task.json` 为机器清单，包含独立运行需要的实际文件。

在 AgentHub「发现 → 自动化任务 → Git 安装」输入本仓库地址即可预览；也可选择单个任务目录进行本地安装：

```sh
agent-hub-cli automations import --path ./automations/system/disk-cleanup
```

导入后默认暂停，配置本机项目并确认任务内容后再运行或启用日程。这里的可移植 Shell 入口使用 `sh`，适用于 macOS / Linux；网络重置仅适用于 macOS。应用内推荐任务仍根据当前平台生成对应的 Shell 入口。

| 目录                                                               | 内容                                      |
| ------------------------------------------------------------------ | ----------------------------------------- |
| `engineering/agent-maintenance/`                                   | 项目巡检                                  |
| `engineering/agent-mr-processing/`                                 | PR / MR 代码审查                          |
| `engineering/agent-issue-processing/`                              | Issue 处理                                |
| `system/disk-cleanup/`                                             | 清理过期磁盘缓存                          |
| `system/network-reset/`                                            | macOS 定时重置网络                        |
| `engineering/agent-code-review/`、其他 `system/` 与 `hermes/` 任务 | 可独立安装的其他任务，保留旧 CLI 标识兼容 |

`config/task.json` 顶层 `version` 声明任务的 SemVer 发布版本（以各任务清单为准），独立于清单格式 `schema_version` 和本机编辑修订号 `revision`。发布任务内容更新时维护此版本，备份原样保留。

`TASK.md` 说明用途、执行规则和按需资料；`config/task.json` 声明任务、日程、依赖和相对任务根目录的文件列表；其他 JSON 配置也放在 `config/`。`scripts/` 保存代码，`prompts/` 保存提示词，复杂说明按需放在 `references/`。`config/catalog.json` 仅提供推荐目录的多语言介绍与平台适配信息，不属于本机状态。

Agent 任务只携带 `_shared/agent-entry.py` 对应的薄入口，调用 AgentHub CLI 的 `agents launch execute`。生命周期实现维护于 `core/agent_execution` 与 `core/herdr`，不再向任务复制完整运行脚本。安装后的任务依赖匹配版本的 CLI，可在桌面退出后运行。

云端备份使用相同的 `automations/<英文目录名>/config/task.json`、`TASK.md`、`scripts/` 与按需资源结构。仅保存可移植定义，项目绑定、安装回执、私有环境及执行记录留在本机；恢复会准备运行环境并默认暂停，不执行任务正文。

新任务、分发目录与新写入备份使用相同布局；旧版根目录 `task.json`、`README.md`、`herdr.json` 和脚本旁 JSON 仍可读取，更新旧任务不自动搬迁清单或覆盖自定义内容。不要同时放置两份 task.json。

任务本地记录统一按任务包分组：`.local/runs/<运行ID>/` 保存执行记录，`.local/state/task-state.json` 保存业务扩展状态，格式为 `{"schema_version":1,"extensions":{}}`。扩展按用途命名，例如 `mr_repair` 保存 MR 链接、累计修复次数及人工接管状态。通用 Python 存储维护于 `core/state_store/store.py`；任务内 `scripts/task_state.py` 仅通过 CLI 定位并导入公共模块，带锁更新单个扩展并保留其他扩展。整个 `.local/` 不列入任务文件清单，不参与导出、备份或同步。

所有任务开发、更新与记录处理必须遵循[定时任务本地记录规范](../docs/architecture/automation-records.md)，不要将运行或业务状态加入任务定义。

Agent 可选；需要 Agent 时统一经独立 Herdr 模块发起。通用场景边界见[Agent 启动架构](../docs/architecture/agent-launch.md)；新任务遵循[自动化编写规范](../docs/product/automation-authoring.md)。

## 公共运行逻辑审计

`agent-hub-cli --json automations audit --path ./automations` 只读检查仓库任务；省略 `--path` 则检查本机全部非系统来源。输出仅包含任务归属、运行方式和需要检查的文件，不输出提示词或脚本正文，不执行任务。

Agent 任务应调用共享执行器，状态适配器应导入公共存储，不在包里重新定义生命周期或事务存储。原生 Hermes 保留原执行模型，厂商服务只登记来源。发现自定义或旧版实现时报告问题并非零退出，不自动覆盖业务逻辑。

所有包的 `scripts/run.sh` 都可从脚本位置解析任务目录，设置运行上下文并按字面转发参数；已安装任务仍保留自己的项目绑定与日程。
