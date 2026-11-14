# 通用 Agent 启动与场景适配

Agent 是可选能力。普通自动化任务执行自己的命令；需要交互式 Agent 的场景优先通过 Herdr，未安装时自动退化为原生终端执行，不在各场景重复实现进程启动或模型调用。原生终端降级对任务初始提示词使用 Agent CLI 的明确参数适配；未支持的类型必须报错，不能猜测按键或向未知前台进程投递。

## 模块边界

| 模块                                       | 职责                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `core/agent_launch_config`                 | 可移植启动指令、默认 Agent、argv 解析、修订保护与持久化。独立于 Herdr、UI、任务与 Git。                       |
| `core/agent_launcher`                      | 通用入口选择已安装的 Herdr 或原生终端；Herdr 已受理或结果不明时不降级重跑。                                   |
| `core/herdr/agents`                        | 通用 Herdr 启动：明确会话、窗格、Agent 名称、类型和已解析指令；核验空闲 Shell，发起一次，验证身份并等待就绪。 |
| `core/herdr/session`、`core/herdr/control` | 会话与工作空间定位、窗格操作及已有 Agent 的安全交互。                                                         |
| 场景适配器                                 | 选择项目和目标、决定复用或新建布局、准备提示词、处理业务结果。                                                |
| `core/agent_execution`                     | 受管理的 Agent 执行：显式请求、运行锁、输出流和旧结果恢复；不包含任务筛选与评审规则。                         |
| `core/herdr/agent_execution.py`            | Herdr 专有的面板归属、布局、状态观察与恢复；启动统一委托 `core/herdr/agents`。                                |
| `core/state_store`                         | 公共状态读取、进程运行锁及兼容的 Python 扩展事务存储。                                                        |
| `core/python_support`                      | 公共 Python 检测及按内容版本发布共享模块。                                                                    |
| `automations/_shared/agent-entry.py`       | 任务薄适配器：从旧/新布局解析配置、提示词与状态目录，将请求交给 CLI。                                         |

## 启动契约

调用方必须明确目标会话及窗格，不依赖调用 Agent 的隐式环境。通用启动输入是已解析的 `Launch { key, kind, program, arguments }` 与 `session/name/pane`，不包含任务编号、模板、日程或模型字段。桌面 terminal、侧栏新建、任务面板和自动化 CLI 使用同一实现；未来场景只需编写布局与业务适配器。

配置解析和启动分开：可以只预览有效指令，不启动任何进程。全局默认值用于后续启动，任务显式参数可以覆盖；运行中的会话不因设置或 Git 恢复而重启。

Herdr 原生 `agent start` 只能选择预设可执行文件。指令使用原生可执行文件时传递 argv；自定义路径时，模块确认空闲 Shell、按 Shell 规则引用 argv，再通过 `pane run` 发起，核实兼容的 Agent 身份后命名并等待就绪。未兼容的桌面宿主可以管理启动指令，但不伪装成可由 Herdr 管理的 CLI。

发起失败与发起结果不明均返回错误或带警告的检查目标，不自动重复执行。场景适配器保留新建窗格；提示词投递前保存状态，投递超时不重发。关闭前端终端只断开客户端，不停止后台 Agent。

## 配置与同步

仅可移植设置保存到 `user-config/agent-launch.json`（schema 1）：`default_agent` 与按稳定 Agent key 保存的 `instructions`。安装检测、技能路径、排序、启用、凭据及运行状态保留原存储。

独立模块使用现有 RepoLock、user-config 路径边界和原子替换。保存比较修订，外部修改或恢复后旧草稿不能覆盖新设置。未知 Agent key 保留以支持另一设备或未来版本。现有 Git 备份负责上传、合并和恢复，恢复事务在发布文件前验证文档；模块不包含 GitHub 凭据或上传器。

另见[自动化编写规范](../product/automation-authoring.md)与[自动化架构](automation.md)。

## 无 Herdr 降级

只在明确未安装时选择原生终端。桌面终端使用现有 PTY 管理器直接传递 argv；CLI 和定时任务打开系统终端，任务提示词使用 CLI 参数传递，不模拟按键。支持 Codex、Claude、OpenCode、Hermes 等已声明的初始提示词适配；其他工具可无提示词启动，任务需要明确适配后才能自动投递。

原生终端请求与回执只在本机 `runtime/agent-launches/`，启动前写入唯一 ID，终端执行时独占领取。状态分为 submitted、running、exited；进程退出不代表业务验收成功。任务保存回执，在未知或运行中跳过触发，不在两种后端之间重复发起。登录和审批保留在可见终端。无图形终端的主机明确报错，安装 Herdr 后可使用同一配置。

## 受管理的 Agent 执行

需要完整执行与恢复的入口调用 `core/agent_execution::run`；CLI 使用 `agents launch execute`，从 stdin 接收 `ExecutionRequest` JSON。请求显式提供配置文件、提示词文件、状态目录、身份目录、项目目录和本次上下文，不依赖自动化任务类型。`agents launch status --state-directory <directory>` 只读检查旧记录。 `agents launch reconcile` 接收同一请求格式并强制仅收回已有结果；共享执行器将该模式传给后端，所有创建面板、启动 Agent、投递提示词和首次终端降级路径均被排除，即使旧面板在检查期间消失也不会新建执行。GUI 可在阻塞线程调用同一核心入口；普通打开终端或挂接 Herdr 不强制创建执行记录。

`config/agent.json` 可设置 `execution.include_task_variables: false`，使首次执行及原会话续作都不向提示词附加方案变量 JSON。省略时保持原有附加行为；变量定义和脚本环境中的 `AGENT_HUB_VARIABLES_JSON` 不受影响，适合由调度脚本消费额度、超时等参数的任务。

`execution.session_reuse_seconds`（0–86400，默认 0）控制已完成会话的复用。为 0 时，上一轮确认完成后 `execute` 在原 Tab 换新 Agent，与原有行为一致；为正数时，原 Agent 已确认完成、空闲且自 `agent_started_at` 起未超过该时长，就把本轮提示词投递到原会话并照常等待结果，Agent 名称、面板和启动时间保持不变。超时、启动时间不可信或记录缺少 Agent 名称时在原 Tab 换新 Agent 并重新计时；没有启动时间的旧记录从首次复用开始计时。忙碌、待输入、送达不明及 reconcile 沿用原有规则，不因复用而投递。

公共模块随 app/CLI 编译嵌入，Python 是已有生命周期实现的运行载体。CLI 将资源原子发布到本机 `runtime/core/<module>/<content-hash>/`，所有任务使用同一修订，旧执行仍持有原资源路径。资源内容不符或路径被替换为链接时停止，不覆盖未知内容。模块不进入任务定义、复制、导出或 Git 备份；任务仅携带适配器，需要支持上述命令的 AgentHub CLI。旧的完整脚本继续可运行，只有显式更新任务才改用公共实现。

配置化启动、命令客户端、空闲 Shell 检查与 argv 处理复用现有 Herdr 模块。交互入口的跟进输入与自动化的忙碌跳过语义各自保留，不通过强行合并策略实现复用。`core/herdr/client` 统一 session 与 control 的命令环境隔离和响应解析。

`.herdr-run.json` 名称与原状态目录保持兼容，身份目录保持原任务 scripts 路径，不因公共实现位置变化而改变 Agent 归属。已尝试投递而没有完成证据时保留旧执行，不以 idle 推断可重发。进程运行锁由共享存储模块持有，退出或崩溃自动释放。

`agents launch continue` 只向已核实的原 Agent 投递明确的续作提示，要求 `continuation_prompt` 和唯一 `continuation_id`；同一标识不重复投递，投递不确定时保留检查点，忙碌、待输入、身份变化或面板消失时不新建替代执行。是否续作、错误分类、退避、模型选择和次数限制由调用方任务决定，公共执行器不内置业务重试策略。

Herdr 提交提示词时短暂等待活动回执；若 Claude 输入仍未提交，执行器仅在原面板身份、会话、完成序号与完整草稿摘要匹配时补交一次 Enter。补交前持久化记录，按键响应不明时不重试；其他输入、会话变化和待回答问题均保留现场。续作只有观察到 Agent 活动后才记录已提交，未决状态不允许换 ID 重发。

### 已关闭面板的显式恢复

`agents launch recover` 接收同一 ExecutionRequest，要求调用方提供 `continuation_prompt` 和唯一 `continuation_id`。仍存活的原 Agent 沿 continue 语义复用；只有确认旧面板和旧 Agent 均不存在，才在任务项目中新建面板及 Agent，并投递明确的恢复上下文。新 Agent 不伪装成原对话；旧检查点归档在同一私有状态目录，回执保存恢复 ID 与归档引用。

恢复由调用方业务授权触发，不把关闭 Tab 推断为完成、取消或清零。任务提供当前业务版本、原批次、成果和未决事项；共享层负责创建及投递的唯一回执、运行锁和身份核验。送达未决、旧 Agent 仍在、原面板被其他进程占用时保持待核验，不启动替代者。reconcile 和 continue 的原有只读/不替代契约保持不变。
