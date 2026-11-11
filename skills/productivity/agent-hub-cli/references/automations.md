# 创建与维护定时任务

适用：通过 AgentHub CLI 创建、编辑、调度或排查本机定时任务。先执行当前 CLI 的 `automations --help` 和目标子命令 `--help`，以实际安装版本为准；下文的 `$SM` 仍须替换为主文解析出的 CLI 路径。

需要做隔离的创建、导入或升级验证时，给 CLI 设置一个新的绝对
`AGENT_HUB_AUTOMATION_HOME`；`--skills-root` 只隔离 Skill 库，不能用来隔离
自动化数据。验证完成后保留现场供复核，避免把测试任务写入真实任务库。

## 创建流程

1. 明确任务目标、执行范围、工作目录、日程、时区及是否启用。先 `automations list --json` 按名称、工作目录和用途查重；用户要修改现有任务时使用原 ID，不另建同名任务。返回内容可能包含全部脚本，解析后只展示必要摘要。
2. 优先从 `automations templates --json` 的合适模板提取 `draft`；定制需求使用 `create --file`。市场模板只读，创建后维护独立本地实例。
3. 生成完整 `AutomationDraft`。新任务通常先设 `enabled: false`，验证后再恢复；用户明确要求启用循环运行时可按其授权启用。修改现有任务则保留原启停状态，除非用户要求改变。
4. 创建：`"$SM" automations create --file task.json --json`；或 `"$SM" automations create --template <template-id> --locale zh --json`。这会准备依赖并注册任务，不等于已经执行成功。保存 JSON 草稿在系统临时目录或明确的编辑目录；Git 备份仓库只存正式管理内容，不放入 `skill-edits/`、`local-sources/` 等编辑副本。
5. 使用返回的真实 ID 执行 `automations show <id> --json`，读回名称、版本、定义、实际目录、日程和启用状态；系统任务可进一步核对调度器是否注册。只在请求包含试运行时调用 `run`，再通过新的 runs/logs 和业务结果验证。未运行时明确说明“已配置，未验证实际执行”。

### 创建草稿契约

`create --file` 接受 `AutomationDraft`。`name`、`provider`、`content`、`schedule` 和 `enabled` 必须存在；`package_options`、`workdir` 和 `files` 可省略或使用空值。`script_dir` 属于已创建实例的内部字段，创建草稿不要填写，CLI 会分配独立任务包目录；已有项目路径写在 `workdir`。

- `name` 会去掉首尾空格，必须为 1–200 字节且不能含控制字符；`content` 必须为 1–65536 字节、非空且不含 NUL。它是命令或 Agent 提示词，不代表 `TASK.md`。
- `workdir` 为空表示命令任务在任务包目录运行；非空时必须能解析为现有绝对目录。`~` 和 `~/...` 由 CLI 解析后保存为绝对路径。任务包的 `script_dir` 与项目 `workdir` 始终分开。
- `provider: system` 只支持 `manual`、`interval`、`hourly`、`daily`；`custom.expression` 只给 Hermes 使用。`provider: hermes` 必须是循环日程，不能使用 `manual`。
- `interval.minutes` 范围为 1–525600；`hourly.minute` 为 0–59；`daily.hour` 为 0–23、`daily.minute` 为 0–59。`custom.expression` 不能为空、最多 200 字节且不能含 NUL 或换行；它交给 Hermes 解释，不是跨平台 cron 保证。
- `files` 中每个文件必须是非空 UTF-8、相对安全路径、扩展名为 `.py`、`.sh`、`.ps1`、`.json` 或 `.md`，不能重复或含 NUL；最多 32 个文件，命令与文件正文合计最多 512 KiB，单文件正文通常最多 64 KiB。`config/prompt-variants.json` 可使用更大的单文件预算，但仍受总大小和提示词变体自身限制。
- 可移植导入包进一步只允许 `scripts/`、`config/`、`prompts/`、`references/` 下的文件，或根目录的 `TASK.md`、`README.md`、`prompt.md`；不能把 `config/task.json`、`config/catalog.json` 或隐藏/私有 `.local` 文件列入 `files`。声明的文件必须真实存在，导入只读取这些文件，不执行 setup hook 或任务正文。
- 依赖最多 16 项；`command` 名称最多 100 字节且只允许 ASCII 字母、数字、`-_.`；Python 依赖必须是精确的 `name==version`，单个列表最多 64 个、每项最多 160 字节，且整个任务只能声明一个 Python 环境。命令依赖只检查已有工具，Python 依赖安装在任务私有环境。

保存会校验并准备依赖、写任务包和调度注册，但不会执行任务正文。启用任务只是允许调度器在下次到期触发；需要验证时必须显式 `run`，再查新的 `runs/logs` 和业务结果。

最小系统任务草稿示例（POSIX 命令任务，不启动 Agent）：

```json
{
  "package_options": { "version": "1.0.0", "dependencies": [], "hermes": null },
  "name": "Periodic check",
  "provider": "system",
  "content": "sh './scripts/run.sh'",
  "workdir": null,
  "schedule": { "kind": "interval", "minutes": 10 },
  "enabled": false,
  "files": [
    {
      "path": "TASK.md",
      "content": "# Periodic check\nPrint a local health-check marker.\n"
    },
    {
      "path": "scripts/run.sh",
      "content": "#!/bin/sh\nset -eu\nprintf '%s\\n' 'health-check-ok'\n"
    }
  ]
}
```

这是命令任务示例。Windows 使用平台匹配模板及 PowerShell 入口。Agent 任务优先沿模板携带薄适配器、共享执行器配置和运行提示词；不要把 Agent 提示词直接当作 Shell 执行。Agent 任务设置用户选择的已有项目工作目录；`workdir: null` 对命令任务表示默认任务包目录，不代替 Agent 的项目选择。

当前日程形状（本地时间由对应宿主调度器解释，跨时区需求须核对实际支持）：

| 需求             | `schedule`                                              |
| ---------------- | ------------------------------------------------------- |
| 仅手动           | `{"kind":"manual"}`                                     |
| 每 10 分钟       | `{"kind":"interval","minutes":10}`                      |
| 每小时第 30 分钟 | `{"kind":"hourly","minute":30}`                         |
| 每天 07:00       | `{"kind":"daily","hour":7,"minute":0,"weekdays":false}` |
| 工作日 09:00     | `{"kind":"daily","hour":9,"minute":0,"weekdays":true}`  |

`custom.expression` 由原生 Hermes 场景使用，不把它当作任意平台通用 cron；需要时从匹配模板与当前校验确认。

系统任务的入口通常由 CLI 规范化为 `sh './scripts/run.sh'`（Windows 为 `& './scripts/run.ps1'`）。自定义 Python/Agent 任务应保留薄入口，把业务实现和配置放进声明文件；不要让 `content` 与 Shell/PowerShell 入口重复执行同一段逻辑。

## 编辑、版本与目录

读取 `show` 的 `definition`，只改授权字段，保留其余脚本、依赖、绑定、日程和启用状态；将 **仅 definition** 写到草稿，再执行 `edit <id> --file task.json --revision <revision> --json`。修订冲突先重读并比较两份草稿，不能只换成最新修订号强行覆盖。编辑后再次读回。

任务相关的三个版本字段含义不同，不能互换：

| 字段                      | 所在位置                                                                                                     | 规则与用途                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package_options.version` | `create/edit` 的草稿；保存到任务包清单顶层 `version`                                                         | 可选 SemVer 字符串，当前最多 128 字节、首尾不能有空格；必须是 `MAJOR.MINOR.PATCH`，可带合法的预发布（如 `2.0.0-rc.1`）或构建元数据（如 `2.0.0+build.1`）。`1.0`、`v1.0.0`、`latest` 和带尾随空格都会被拒绝。它描述脚本、提示词、配置等任务内容的发布版本，不表示 CLI 版本、来源 commit 或内容指纹。       |
| `revision`                | `show/list` 返回的本机任务字段                                                                               | `u64` 乐观并发令牌，从 `1` 开始。一次成功的 CLI 保存通常递增 `1`；迁移也会递增。若运行时发现包文件被直接改动，CLI 会用内容指纹派生新的不透明数值，不能假设是上一值加一。始终原样传回最近一次读取的值，不手工递增、截断或猜测；省略 `--revision` 只是 CLI 读取当前值的兼容行为，自动化编辑仍必须显式传入。 |
| `schema_version`          | 可移植任务包 `config/task.json`、单文件导出、Git 备份；`.local/state/task-state.json` 另有自己的状态格式字段 | 任务包清单、导出和备份当前都必须为整数 `1`；它描述数据布局，不随文案、脚本、提示词或发布版本变化。业务状态文件的 `schema_version` 只约束本地状态格式，不能拿来当任务包版本。遇到更高版本应停止并更新匹配的 AgentHub 应用/CLI，不要降级覆盖。                                                              |

草稿和可移植包的字段位置不同：`create/edit` 可以使用 `draft.package_options`；`import/export` 及 Git 任务包使用顶层 `version`、`dependencies`、`hermes`，`draft` 内不得重复 `package_options`。保存时 CLI 会把前者规范化到任务包清单。版本缺失仍可读取旧包，显示为“未声明版本”，不要把 `revision`、Git commit 或文件时间推测成版本。

版本变化本身不会改日程、启停状态、调度注册、运行历史或自动触发执行；需要发布新版本时显式修改 `version`，再按正常编辑流程验证。只改日程、项目绑定或脚本内容时，是否提升发布版本由任务作者决定，但必须接受 `revision` 变化。创建、导入、复制和 `restore --apply` 都生成新的本机实例，默认暂停并从 `revision: 1` 开始；保留包版本不会复制源任务的历史、业务状态或运行环境。`export` 不包含项目路径、凭据和运行历史，但保留任务包版本；`migrate` 保留任务 ID、日程和包版本，只提升本机配置修订并重建目录/运行环境。

### 任务包升级规则

下面是发布约定，CLI 目前只强制 SemVer 格式，不会替作者判断改动属于哪一级：

| 变更                                                                   | 推荐版本   | 示例                             |
| ---------------------------------------------------------------------- | ---------- | -------------------------------- |
| 修复脚本缺陷、兼容性问题、文档或默认值的小调整，输入和状态协议保持兼容 | `PATCH`    | `1.4.2 → 1.4.3`                  |
| 增加兼容的命令、提示词方案、配置项或可选能力                           | `MINOR`    | `1.4.3 → 1.5.0`                  |
| 改变输入/输出协议、状态含义、依赖要求、调度语义，或需要人工迁移        | `MAJOR`    | `1.5.0 → 2.0.0`                  |
| 尚未承诺稳定的候选内容                                                 | 预发布后缀 | `2.0.0-rc.1`，稳定后发布 `2.0.0` |

构建元数据（如 `+build.7`）只用于标识构建，不承担升级排序。版本号不能编码“短上下文”“每轮两个 MR”等运行策略；策略写进 `TASK.md`、配置或 references。每次发布升级都要把完整 `files`、依赖和配置一起更新，不能只替换入口脚本而留下旧模块。

升级现有本机实例时：

1. `show <id> --json` 读取当前 `definition`、`revision`、版本、日程、项目绑定和启停状态。
2. 以该 definition 为基线合并新包内容；只在确认没有并发改动后，用同一个 `revision` 执行 `edit`。不要新建同名任务来绕过冲突，也不要手改 `.local/receipt.json`、`tasks.json` 或调度器文件。
3. 若改了依赖，保存会重建任务私有环境；失败时保留旧包和恢复信息，修复后重试。版本升级不会自动启用、暂停、触发运行或改变日程。
4. 保存后再次 `show`，确认 ID 未变、版本和完整文件已更新、`revision` 已变化、日程/工作目录/启停状态符合预期；需要运行验证时单独执行 `run`，不能把保存成功当作业务成功。

从 Git/备份发布新实例时先 `import --preview`，检查 `schema_version`、`shell`、顶层版本、依赖和声明文件，再 `import`；导入总是新 ID、默认暂停、`revision: 1`。覆盖已有实例必须走明确的编辑流程，不能把导入当作升级。旧任务布局用 `migrate`，它保留原 ID、日程、历史和包版本，提升本机修订并重建目录；迁移失败应恢复旧注册，不能通过删除旧记录或清零状态“修复”。

每个任务拥有自己的目录：`TASK.md`、`config/`、`scripts/`、`prompts/`、可选 `references/`。便于团队交付的定义和脚本列入 `files`；本机绑定、环境、状态、锁和运行日志归入 `.local/`，不声明为任务文件，不导出或同步。只通过 CLI 编辑/创建实例，不直接写 launchd、systemd、计划任务或 Hermes 调度数据。

## 多组提示词

“两个可切换方案”和“两个顺序阶段”含义不同，按用户意图实现；存在实际歧义时先确定执行关系。当前方案格式如下：

```json
{
  "version": 1,
  "active_id": "review",
  "variants": [
    { "id": "review", "name": "仅审查", "behavior": "review_only" },
    {
      "id": "review_then_repair",
      "name": "审查后自动修复",
      "behavior": "review_then_repair",
      "content": "先调用指定的评审 Skill；确认问题并留证后，再调用其修复功能。"
    }
  ]
}
```

自定义变量使用 `{ "name": "limit", "value": "10", "description": "最多处理的项目数" }`；`description` 可选，允许编辑，最多2000字节且不能含NUL。名称、值和描述随方案保存、切换、复制、导出与备份；描述只作配置说明，不参与插值或执行。旧的name/value变量继续兼容；CLI `variables set` 修改值应保留已有描述、其他变量元数据与顺序。

保存为 `config/prompt-variants.json`。只允许一个选中 ID；选中正文只保存在 `prompts/prompt.md`，选中项不能重复包含 `content`，未选中项必须包含正文。清单 `version` 当前只能是 `1` 或 `2`，支持 1–12 项；ID 只能由 ASCII 字母、数字、`_`、`-` 组成且最多 64 字节，名称为 1–200 字节且不能含控制字符，`behavior`（如有）最多 120 字节且不能含控制字符，未选中正文最多 64 KiB。Hermes 还须保持 definition.content 与选中正文一致。

切换时将旧选中正文放回其未选中项，将新选中正文写入运行提示词，删除该项 `content` 并修改 active_id，一次性保存完整草稿。提示词优先调用用户指定的业务 Skill，任务规范只定义边界、回调及调度；不复制该 Skill 的整套审查/编码规范。

如果任务脚本硬编码“只审查、禁止修复”等上下文，必须一起适配所选方案，否则新增提示词不会改变实际执行模式。新增方案本身不授权扩大执行范围或发送额外通知。

## 循环、去重与结果记录

- 循环由已注册的调度器驱动；不要启动一个永久 `while/sleep` Agent 来代替定时任务。每轮有明确批量上限；代码审查建议默认每轮 1 个请求，可按任务需求调整。
- 对外部对象用平台、主机、仓库、编号组成稳定键，记录已处理来源 SHA、目标 SHA、有效输入/评论指纹和真实结果。无更新跳过；来源提交、目标基线或有效输入变化才重新处理。已处理的 rejected/pending 不因定时器再次触发而无限重试。
- 排除任务自身的结构化评论、系统消息及已识别机器人进度，避免回写触发自身循环。修复提交产生的新 SHA 应触发下一轮独立重审。
- `.local/state/task-state.json` 的 `extensions.<business>` 保存请求、批次、尝试与人工接管状态；使用共享 TaskState 的锁和原子更新，只改自己的扩展，保留旧历史和其他扩展。操作前记录尝试，完成后按准确版本和 run_id 回调实际结果；计数随真实尝试递增，不随新 SHA、新 Agent、版本升级、提示词切换或重跑清零。
- 控制器退出码 0、Agent 空闲和平台评论成功分别记录，不单独等同业务通过。远端写入结果不明先读回，不盲目重复执行。

## Agent 标题与布局归属

所有会启动 Agent 的自动化，Tab 标题统一为 **`[auto] <自动化任务名称>`**。名称取本次 `automations show` 的 `definition.name`，保留用户命名；例如 `[auto] MR 代码审查`、`[auto] Agent 监督`。命令型任务不为了标题增加 Agent 或 Tab。标题超过当前 `runner.title` 长度限制时，只截断显示标题并保留前缀；任务原名和身份不变。

- 通用入口使用 `config/agent.json` 的 `runner.title`。共享 `agents launch execute` 会将它用于创建 Herdr Tab；任务适配器和自定义业务池都读取同一字段，不各自硬编码 `MR agents`、`auto-supervisor` 等别名，不复制启动/布局执行器。
- 创建、复制或重命名任务时，以原 `definition` 为基线，通过带 `revision` 的 `automations edit` 同步任务名与 `runner.title`。配置变化不会自动重命名所有在用 Tab：读取任务检查点/原生状态确认真实 session、workspace、tab ID 和归属后，仅重命名本任务的既有 Tab，读回标题；保留 Agent、面板及执行历史。
- 自动化之间只保留一个业务编排所有者。通用监督应根据真实执行检查点及活跃 Agent 身份识别其他任务拥有的面板，交由其原恢复入口处理或从通用采集排除；不在原批次之外直接下发另一套业务监控/修复指令。用户手工 Agent 沿其实际授权监督。
- 配置任务专用 `launch.arguments` 前，先读回共享 `agents launch resolve <agent>`：显式参数会覆盖共享 profile 参数，不能为了指定模型而丢失原已授权的执行模式。仅保留本任务实际授权的启动选项；不改用户全局设置。首次启动和恢复同一上下文使用相同参数约定，启动后核对真实模式、上下文和提示词活动，不能把可见 `working` 当成已经执行业务。
- 长期父会话应留存原生上下文标识。终端确已关闭时，只有在原执行与未决写入收齐、租约及修复状态明确、同一上下文无活动实例后，才通过共享启动入口在原归属容器恢复该上下文；保留业务键、累计次数和旧检查点。恢复请求、面板创建与启动先留回执；结果不明时只读收回，不再次启动。缺上下文标识不猜测或偷偷替换成新对话。
- 标题只用于展示，不能按同名 Tab 推定归属。稳定 ID 和业务对象到父 Agent 的映射保存在本机任务状态中；同一业务对象续作复用原父 Agent。任务明确采用对象池时，默认集中于该任务已登记的唯一 Tab；容量、分屏、回收和独立评审策略在任务中定义。
- 面板标题展示业务对象、真实 worktree 租约、阶段及状态；无租约显示“未领取”或“已释放”，不把启动 cwd 当作业务 worktree。标题不代替业务回调、CI 或合入结果。
- 归属变化、创建或投递不确定时保留原检查点，不通过重复创建、关闭陌生 Tab 或重启 Agent 修正显示。只更新本任务持有的标题，不接管用户手工 Tab。

验收同时检查持久配置与当前界面：任务名称对应、`runner.title` 正确、既有 Tab 读回一致、没有新增重复 Tab/Agent，且日程、启用状态、业务状态与运行历史保持原值。

## Agent 会话与执行限制

这些是 Agent 定时任务的设计规范，不代表所有现有模板已经实现，保存前检查脚本与当前共享执行器的真实行为。

1. 默认同一任务最多一个活动 Agent；显式配置业务对象池时，每个稳定业务对象只保留一个父 Agent，任务另行声明总容量。上轮仍工作时核验其阶段、进度及恢复回执，不重复发起同一动作。优先使用共享执行器已有的执行锁和检查点；业务领取状态通过共享状态模块保存，不再复制生命周期或存储实现。
2. 复用 Herdr 容器 session 不等于复用 Agent 对话。普通独立轮次可启动新 Agent；长期跟进同一业务对象时复用父 Agent，必要独立角色另用全新执行上下文。只携带当前对象、短提示词和必要状态/协议文件路径；由共享模块管理已有面板归属及安全替换，不关闭共享 session 或其他任务的面板。
3. 审查后修复可以在同一 Agent 中完成；修复后由下一轮新 Agent 独立重审。作者自查不能冒充独立重审。先核对配置中是否存在 resume/history 参数；不能只凭“新面板”断言上下文隔离。
4. 建议按业务配置等待期限，例如 30 分钟。当前 Herdr 共享执行器等待期限为 30 分钟；这是停止等待，不是终止 Agent。超时、等待输入、启动结果不明或控制器异常退出时保留原会话和检查点，记录 `needs_attention`，不自动重发、审批或强杀。
5. 自动修复应设持久尝试上限，例如同一请求累计 2 轮；是可配置的任务策略，不是 CLI 的通用内建参数。按稳定请求身份计数，修复前成功领取额度；失败、缺回调、达到上限或状态不明时保存受阻原因及明确下一动作；已获全托管授权时按持久恢复窗口接续，真实权限、输入或外部条件缺失才交人工，不新增例行确认。用共享存储保存状态，业务回调只允许活动 run_id 和准确版本，拒绝重复开始/完成。
6. 人工恢复须显式授权并记录核对依据，保留原计数、历史和共享检查点。明确恢复的是任务级会话阻塞还是单个请求；不能通过删文件、换 ID、新建副本或清零计数恢复。

回调约束任务的正常控制流程，不是 Agent 权限隔离；不能宣称它能拦截 Agent 绕过回调执行任意命令。任务级逻辑放在任务包，共享 Agent 生命周期和状态持久化放在 AgentHub core，不把某项任务的修复次数写死到公共模块。普通命令任务不必增加 Agent 会话、提示词方案或没有用途的持久状态。

## 验证与交付

先对语法、配置、方案切换、状态持久化、无更新跳过、新版本触发、重复领取、次数上限和未完成互斥做隔离验证；不得用实测借口运行生产审查、推送代码或发送通知。文档示例核对当前 CLI/数据契约，不必为改说明新建实际计划。

通过 CLI 保存后读回真实 ID、版本、选中方案、批量上限、日程、启停状态；需要循环运行时核实原生调度注册。报告配置验证、实际运行和业务结果各自完成情况。暂停任务只有用户明确要求才启用；任务版本更新不自动改日程、触发运行或发布模板。

通知、MR 评论、提交/推送、合入、发布按任务已获授权分别定义，不能由“创建定时任务”推导出任意外部写入权限。无独立通知配置时，只能说明状态/日志可见，不能声称已通知人工。

## 现有 CLI 兼容约定

Use this workflow when the user wants an Agent to create, inspect, schedule, or
manually trigger a local automation. First check `automations --help`; an older
CLI may lack this feature. Update the matching app/CLI rather than editing
scheduler files or Hermes jobs.json as a fallback.

```bash
"$SM" --json automations templates
"$SM" --json automations list
"$SM" --json automations show '<task-id>'
"$SM" --json automations copy '<task-id>' --name 'Review copy'
"$SM" --json automations run '<task-id>'
"$SM" --json automations logs '<task-id>'
```

Marketplace tasks are read-only: view them with `templates` or an import preview,
and install an independent local instance with `create --template <template-id>`
or `import --path <package>`. Never edit, delete, pause, or run the marketplace source.
Editing scripts, changing schedules, pausing/resuming, running, and removing
operate on the local instance ID returned by creation or `list`. Local
changes and deletion do not update or delete the marketplace original.

`list` defaults to tasks created by AgentHub, matching the desktop view. Use
`list --origin all` only when the user asks for tasks from other sources, or
`--origin external` for external tasks. Add `--show-system` to an explicit
`--origin all` query when operating-system built-in tasks are also requested.

Resolve the exact ID from `list`, then inspect the command/prompt and working
directory with `show` before running the user-selected task. Use `can_run` and
`can_edit`; existing external system jobs are read-only. Running returns
`state=requested`, which is not execution success. Read a fresh `show` result
and distinguish its latest run from an older result; do not repeatedly trigger
a task because status has not updated yet. Paused or terminal Hermes tasks need
an explicit resume/repair before running.

Use `create --template <template-id>` for the platform-correct built-in starters,
or `create --file task.json` for a definition. `edit <id> --file task.json
--revision <revision>` protects managed tasks from stale edits. New task packages are provisioned under `~/.agent-hub/automations/<task-name>/`;
occupied names receive numeric suffixes. Renaming preserves the allocated path.
The project `workdir` is a separate local binding, defaulting to execution in the
package. Existing custom and UUID directories remain supported as legacy tasks.
New packages are discovered independently of the legacy `tasks.json`. Task
content and runtime requirements join Git backup; local registrations, bindings,
environments and logs stay local.

To configure a starter before registration, export its `draft` from `templates`
to `task.json`, set the existing absolute `workdir` and desired `schedule`, then
use `create --file task.json`. For an existing task, read `show`, edit its
`definition` as `task.json`, and pass the returned `revision` to `edit`. Never
pass the entire `show` response as a draft. `pause`, `resume`, and `remove` use
the same exact task ID; use `runs` and `logs --run` to inspect an execution.

`copy <id> --name <name>` creates an independent paused task containing all
declared scripts, prompts, configuration, schedule and runtime requirements.
Use `show` and `edit --file ... --revision ...` to modify any part of the copy.
The original task is untouched; runtime environments, history and business state
are not copied. External project bindings are retained; bindings into the source
package use the new package by default. The GUI Copy action opens the full editor
before creating the independent task.

New system tasks execute `sh './scripts/run.sh'` (`& './scripts/run.ps1'` on
Windows). Templates use `TASK.md` as their instruction entrypoint, `config/task.json`
for the manifest, `config/` for JSON settings, `scripts/` for executable files,
and optional `references/` for details. `prompts/prompt.md` is the fixed Agent prompt entrypoint. The embedded catalog renders business scripts and thin adapters
into each independent package. Agent lifecycle and state storage are maintained
once in AgentHub core, published by the matching CLI as content-versioned modules;
new tasks require that CLI, not a running desktop. Edit declared files or use the
editor; a successful save increments the numeric revision, while direct file
changes are detected through an opaque content-derived revision, so always
re-read before an update. Private state and runs live in `.local/`; Python dependencies have
private environments. Legacy task layouts remain supported until explicit
`migrate`.

Run `automations audit --path <repository-or-task-directory>` to inspect source
packages, or `automations audit` to inspect all installed non-system sources.
Audit is read-only and reports copied runtimes or storage implementations without
executing tasks or overwriting custom business logic. A non-zero result requires
review; native Hermes and vendor services retain their original execution model.

Managed Agent execution uses `agents launch execute` with an explicit JSON
request on stdin: absolute `config_file`, `prompt_file`, `state_directory`,
`identity_directory`, `workdir`, plus optional `prompt_context`. The task adapter
supplies its scripts directory as the stable identity, preserving old checkpoints.
Use `agents launch status --state-directory <path>` for read-only inspection.
`agents launch runtime state-store` returns the shared Python storage module path.
Never clear state or repeat an uncertain execution to compensate for an old CLI;
update the matching app/CLI instead. Legacy full scripts change only on explicit
task updates, which retain IDs, schedules, local bindings and business records.

Creation, import and explicit restore prepare task dependencies and scheduling
in the same operation. Use `pause` / `resume` to control the schedule; there are
no separate `install` / `uninstall` commands. `remove` revokes scheduling and
owned runtime resources, preserving files by default; `--delete-local-data` also
removes an owned package after reference checks. Projects, external tools and
shared resources remain protected. Import and restore create paused tasks and
never execute the body or overwrite another instance. Old uninstalled tasks
remain paused and prepare automatically when saved or run.

```bash
"$SM" --json automations backups
"$SM" --json automations restore '<backup-id>'
```

`restore` previews a paused copy. `--apply` creates a local paused task and prepares its runtime. Git sync itself must not activate tasks or overwrite
an existing local schedule. GUI users can inspect the same definitions via
New automation → Use template → Git backups.

### Independent automation packages

New automations own a task package with root `TASK.md`, prompts in `prompts/prompt.md`, JSON in `config/` (including `task.json` and optional `agent.json`), executable helpers in `scripts/`, optional `references/`, and private `.local/` state. The current package layout is required; old root manifests and Agent settings are removed before import. Use `automations import --path <json-or-directory> --preview` before import; importing creates a new paused instance and prepares its runtime. `export <id> --file <new-file>` and `migrate <legacy-id>` share the desktop core. Use pause/resume to control scheduling; removing local data requires `remove --delete-local-data`. Migration keeps the original ID and schedule. Never manipulate another task's environment or scheduler registration to repair this task.

## Disk-cleanup starter

The `disk-cleanup` starter (daily 03:00) is a multi-file Python bundle. Its
`cleanup-config.json` is the configuration authority; distribute and preserve
all declared modules/config/readme in `files`, never only the entry point.
Default cleanup retains 7 days of downloads, Agent caches/logs and browser
caches; workspace logs retain 30 days. Browser caches require exited Chrome/Edge.
Native uv offline pruning and Homebrew cleanup (no auto-update/force) are enabled.
Project paths must be explicitly configured: `agent_hub_projects` reuses the
trusted project's existing helper to keep newest builds per target/profile/feature;
`rust_targets` only clears expired incremental cache, preserving deps/binaries.
Do not scan all projects/home. Active compilers cause build cleanup to skip.

Run `python3 ./scripts/disk-cleanup.py --dry-run` first. Preview never deletes
or notifies, and skips uv because uv has no side-effect-free preview.
CLI supports `--config`, `--workspace-only`, `--no-tools`, `--agent-cache-days`,
`--download-cache-days`, `--rust-target`, `--agent-hub-project`, `--notify` and
`--skip-notify`; browser/uv/brew/updater have corresponding `--skip-*` switches.
Actual runs default to requesting desktop notifications; failures to notify do
not fail cleanup. Logs and per-item summaries are Chinese, external tools may
print English. Distinguish file deletion counts from measured free-space change.

Preserve conversations, databases, settings, credentials, skills, Downloads,
installed runtimes and pinned Playwright versions. macOS updater cleanup requires
matching bundle IDs, an installed version at least as new as the cached package,
and expiration. Preserve pending/new/unknown updates. Paths stay inside home;
links/junctions and lock files are retained. Ordinary caches retain hardlinks;
explicit Rust incremental roots may unlink expired hardlinks without removing
other locations, and measured reclaimed space remains separate from file sizes. Custom Agent homes are
supported. Upgrade existing tasks by adding the entire bundle to their `files`,
retain customized configuration, then edit with the current revision.
