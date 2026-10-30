---
id: cli
title: CLI 使用入口
description: 查看 CLI 帮助，并与桌面端共用技能管理能力。
since: "0.1.4"
tags: ["CLI", "命令行", "help"]
related: ["data-directories"]
---

# CLI 使用入口

桌面端与 `agent-hub-cli` 共用核心技能管理逻辑。CLI 的具体参数以当前安装版本的帮助为准。

## 查看帮助

```bash
agent-hub-cli --help
agent-hub-cli project --help
agent-hub-cli skill-groups --help
agent-hub-cli automations --help
```

## 项目管理

项目命令支持项目技能管理。需要复制入口时，查看 `project add --help` 中的 `--copy` 说明。

## 与桌面端配合

CLI 使用相同的数据与路径规则，显式目录参数会影响目标。执行修改前确认当前工作空间，完成后刷新桌面端查看结果。

## 自动化任务

列表默认隐藏系统内置任务。使用返回的完整 `id` 操作任务，名称相同也不会混淆不同作用域的任务。

```bash
agent-hub-cli --json automations list
agent-hub-cli automations list --origin agent-hub --source system
agent-hub-cli automations list --show-system
agent-hub-cli --json automations show '<task-id>'
agent-hub-cli --json automations runs '<task-id>'
agent-hub-cli --json automations logs '<task-id>' --run '<run-id>'
agent-hub-cli --json automations templates
agent-hub-cli automations create --template disk-cleanup
agent-hub-cli automations create --file task.json
agent-hub-cli automations edit '<task-id>' --file task.json --revision 1
agent-hub-cli automations run '<task-id>'
agent-hub-cli automations pause '<task-id>'
agent-hub-cli automations resume '<task-id>'
agent-hub-cli automations remove '<task-id>'
# 同时清理归属该任务的本地数据；自定义／共享目录保留
agent-hub-cli automations remove '<task-id>' --delete-local-data
```

`task.json` 与桌面表单使用同一份任务定义：

```json
{
  "name": "工作日检查",
  "provider": "system",
  "content": "printf 'check complete\\n'",
  "workdir": null,
  "script_dir": null,
  "schedule": {
    "kind": "daily",
    "hour": 9,
    "minute": 0,
    "weekdays": true
  },
  "enabled": true
}
```

`script_dir` 省略或为 `null` 时，会自动创建 `~/.agent-hub/automations/<英文目录名>/` 作为该任务的独立脚本目录；同名或已有目录会使用 `-2`、`-3` 等后缀区分，不占用已有内容。内置任务使用固定英文标识（例如 `agent-mr-processing`），自定义任务转换为小写 ASCII 名称，纯中文名称使用 `task`。目录分配记录保存在内部任务数据中，重复分配或修改任务名称不重命名目录。显式填写时保留指定目录，旧版本的 UUID 工作目录也保持原路径。删除任务默认保留本地文件；确认框可勾选“同时删除本地任务数据”，清理可确认归属的自动工作目录（兼容旧 UUID 目录）和 AgentHub 执行记录，自定义及共享目录保留。

`workdir` 是执行目录，对应桌面的“项目工作区”；选择项目后任务自动切到项目目录，留空则在脚本目录执行。脚本不会复制进项目，切换项目不改变 `script_dir`。旧定义没有 `script_dir` 时保留原目录保存脚本，编辑保存后分开管理。

系统任务执行独立任务包内的 Shell 入口，定时和手动运行共用同一份脚本。项目根目录 `automations/` 保存可直接安装的任务包，`task.json` 声明实际脚本、提示词、配置、日程与依赖；可从发现页或 CLI 直接安装。GUI、CLI 和外部编辑器的脚本修改随任务定义进入云端备份，云端同样使用 `automations/<英文目录名>/`。本机项目绑定、安装回执、私有环境和执行记录不上传，恢复后需重新配置并安装。

`provider` 为 `system` 时，内容是 macOS/Linux 的 `/bin/sh` 命令或 Windows PowerShell 命令。任务写入当前用户的系统原生调度器，关闭 AgentHub 后仍可按计划执行；需要用户保持登录，Linux 可另行配置用户服务 linger。支持每天、工作日、固定分钟间隔（`{"kind":"interval","minutes":60}`）和仅手动触发（`{"kind":"manual"}`）。保存不会额外触发一次运行，手动运行不修改日程配置。

`provider` 为 `hermes` 时，`content` 是提示词，除每日/间隔日程外还支持 `{"kind":"custom","expression":"0 9 * * 1-5"}`。本机须已安装 Hermes，计划运行还需要其调度服务运行。暂停或终态的 Hermes 任务需先恢复后才能手动运行。`run` 返回“已请求”而非“执行成功”，实际结果在 Hermes 中记录。

AgentHub 创建的系统任务与支持的第三方 launchd 定时任务可编辑；系统级 `/Library/LaunchAgents` 和 `/Library/LaunchDaemons` 任务在修改、启停、运行或删除时会请求 macOS 管理员授权。已有 Hermes 提示词任务通过 Hermes CLI 编辑，Apple 系统任务及无法无损表示的服务提供只读详情。外部 launchd 任务在原位置管理，不复制或删除其业务脚本，保留环境及日志配置。`--revision` 防止覆盖另一端刚保存的版本；省略时使用本次读取的版本。

创建记录保存在系统应用数据目录的 `com.jtstudio.agenthub/automations` 下：macOS 为 `~/Library/Application Support/`，Linux 通常为 `~/.local/share/`，Windows 为 `%LOCALAPPDATA%`。这些记录不随技能库移动。需要隔离运行时，可设置绝对路径环境变量 `AGENT_HUB_AUTOMATION_HOME`（隔离模式的默认脚本目录也放在该目录的 `workspaces` 下）；此命令不使用技能库的 `--skills-root`。

## Agent 与自动备份

Agent 可读取 `automations templates` 获取项目巡检、MR 处理、Issue 处理和清理磁盘缓存四个核心模板，用 `create --template <模板 ID>` 快速创建。智能体和普通命令也可直接自定义；旧模板 ID 保留显式 CLI 兼容。`--json automations list` 返回精确任务 ID，随后使用 `run <ID>` 手动触发，`show <ID>` 查看实际运行时间与结果；“requested” 仅表示请求成功。不要根据旧的 `last_result` 宣称本次运行完成，也不要因查询暂未更新就重复触发。

创建、编辑、启停与删除会将任务定义变更加入持久待备份队列。应用运行、已有 Git 远端且自动备份开启时，沿用现有防抖、提交与推送流程；CLI 的修改也能被应用检测。直接编辑工作目录脚本时，应用通过文件事件同步脚本内容并增加任务版本，沿用相同的备份流程；CLI 查询或修改任务时也会同步已定制内容。应用关闭时的修改在下次启动或手动 Git 备份时处理。备份保存脚本内容与任务定义，不同步日志、执行记录和其他工作目录文件。读取失败或内容无效会报告错误，避免把旧内容当作本次脚本备份。立即运行及日志更新不会产生任务配置备份。

```bash
agent-hub-cli --json automations backups
agent-hub-cli --json automations restore '<backup-id>'
agent-hub-cli --json automations restore '<backup-id>' --apply
```

第一条列出 Git 同步的任务定义，第二条预览已暂停的副本；第三条显式创建副本。GUI 在“自动化 → 更多操作 → 从备份恢复”中检查并新建。同步和恢复 Git 内容不会自动注册、执行或覆盖本机任务；Shell 不兼容的命令需先转换。

`automations runs <ID>` 查看本机保存的执行记录，`automations logs <ID> --run <执行 ID>` 查看指定记录输出；不带 `--run` 兼容读取最近输出。系统任务默认保留最近 100 次；旧版仅能保留尚未覆盖的一次，升级后开始逐次记录。Hermes 读取已有结果文件，保留由 Hermes 管理，不把结果文件存在当作执行成功。日志 `--json` 返回 `available`、`kind`、`content` 和 `truncated`，大文件只返回末尾 256 KiB。执行记录和日志仅保存在本机，不参与 Git 同步备份。

「清理磁盘缓存」模板 `disk-cleanup` 默认每天 03:00 执行。模板文件夹内包含 CLI 入口、配置、按职责拆分的 Python 模块和使用说明，全部随软件与 CLI 预装，创建时一起复制并纳入任务定义及 Git 自动备份。直接修改配置文件也会触发同步。

| 文件                                     | 用途                               |
| ---------------------------------------- | ---------------------------------- |
| `disk-cleanup.py`                        | 入口和清理流程                     |
| `cleanup-config.json`                    | 保留天数、开关、项目目录与通知配置 |
| `cleanup_files.py`、`cleanup_rules.py`   | 文件安全校验与明确的缓存目录规则   |
| `cleanup_actions.py`                     | 原生工具、历史构建、旧更新缓存     |
| `cleanup_config.py`、`cleanup_report.py` | 配置／CLI 校验、中文总结与桌面通知 |
| `README.md`                              | 可随任务一起阅读的完整说明         |

默认清理工作目录过期 `tmp`（7 天）／`logs`（30 天），以及超过 7 天未使用的 Homebrew、pip、npm、npm-hermes 和 Electron 构建下载缓存。保留 `_npx` 工具安装文件，Agent 日志按修改时间、缓存按最近修改／访问时间判断。普通缓存保留目录、链接／junction、硬链接、锁文件；单项权限不足记为警告并继续，真实清理错误返回非零退出码。

Agent 默认规则覆盖 Codex 的 `cache`／`tmp`／`shell_snapshots`／`log`、Claude Code 的 `debug`／`shell-snapshots`／`session-env`、Hermes 的 `cache`／`logs`、OpenCode 的运行日志。支持 `CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`HERMES_HOME`、`XDG_DATA_HOME`，目录必须在用户主目录内且不是链接。历史对话、会话数据库、配置、凭据、技能、Downloads、工具运行时和 Playwright 浏览器不自动删除。

浏览器缓存、uv／Homebrew 工具清理默认开启：Chrome／Edge 完全退出后只清理过期 Cache／Code Cache，保留 Cookies 和 Storage；uv 仅离线清理无引用缓存；Homebrew 不自动更新。工具缺失会跳过，不使用 sudo 或 force。macOS 更新缓存只清理已确认标识匹配且包版本不高于已安装版本的过期内容，保留待安装的新版本、pending 和未知格式；其他平台不猜测更新目录。

大型项目须在配置中明确填写路径，不遍历所有项目或主目录：

```json
{
  "agent_hub_projects": ["~/projects/agent-hub"],
  "rust_targets": ["~/projects/demo/target"]
}
```

上例是配置片段，请修改预装完整 JSON 中的对应字段。AgentHub 源码复用项目现有清理工具，按架构、debug／release 和特性保留最新构建与共享依赖。其他 Rust target 仅清理过期增量缓存，保留 deps 和最终程序；允许移除增量目录内过期的硬链接，其他位置的文件保持不变，实测释放量单独展示。检测到 cargo／rustc 进程时跳过构建清理；`detect_workspace_builds` 仅检查任务当前工作目录，不扫描其他项目。

```bash
# 先预览，不删除文件、不发通知；uv 没有无副作用预览，因此跳过
python3 ./disk-cleanup/disk-cleanup.py --dry-run
# 执行配置中的自动清理，完成后请求桌面通知
python3 ./disk-cleanup/disk-cleanup.py --notify
# 指定配置路径，或本次关闭通知
python3 ./disk-cleanup/disk-cleanup.py --config ./disk-cleanup/cleanup-config.json --skip-notify
# 仅工作目录；不会运行用户缓存、构建及工具清理，默认不通知
python3 ./disk-cleanup/disk-cleanup.py --workspace-only
# 调整 Agent／下载缓存保留期，或跳过特定规则
python3 ./disk-cleanup/disk-cleanup.py --agent-cache-days 14 --download-cache-days 14 --skip-agent-cache
python3 ./disk-cleanup/disk-cleanup.py --skip-browser-cache --skip-uv-prune --skip-brew-cleanup --skip-updater-cache
```

CLI 参数覆盖本次配置，`--rust-target` 和 `--agent-hub-project` 可重复追加项目；`--no-tools` 跳过构建、uv、Homebrew 和旧更新包清理。无效配置在清理开始前拒绝。配置中的 `notify` 控制默认桌面通知，CLI 可用 `--notify`／`--skip-notify` 覆盖；通知不可用或被系统拒绝时只报告提示，不改变清理退出码。macOS 使用系统 osascript，Linux 使用 notify-send，Windows 使用 PowerShell Toast（失败时回退到系统托盘通知），需对应桌面会话和通知权限。

中文总结逐项显示候选／实际删除文件数、大小、跳过、警告、错误、工具结果和耗时；前后磁盘空间以 GiB／MiB 展示。文件删除量与实测可用空间变化分开，其他进程也可能影响空间。工具统计不混入无法确认的文件计数，第三方原始输出可能为英文。预览不发送通知。

AgentHub 可能在已安装配置首行添加归属标记；加载器识别该标记，GUI／CLI 定义中的配置正文仍为标准 JSON。已有任务升级多文件脚本时须同时添加全部模块与配置到 `files`；只替换入口会缺少模块。创建、保存或修改配置本身不会额外触发清理。

### 用 CLI 配置和修改清理任务

可先导出模板定义，设置工作目录与执行时间，再创建任务。以下示例使用 `jq`；工作目录须已存在。

```bash
agent-hub-cli --json automations templates | jq --arg workdir "$PWD" '.templates[] | select(.id == "disk-cleanup") | .draft | .workdir = $workdir | .schedule.hour = 4' > task.json
agent-hub-cli --json automations create --file task.json
```

从创建结果或 `automations list` 获取完整任务 ID。修改已有任务时，先保存当前定义和版本，调整 `task.json` 的命令、工作目录、日程或启用状态，再提交：

```bash
agent-hub-cli --json automations show '<task-id>' > current-task.json
jq '.definition' current-task.json > task.json
# 编辑 task.json 后保存；版本冲突时重新读取任务再修改。
agent-hub-cli automations edit '<task-id>' --file task.json --revision "$(jq -r '.revision' current-task.json)"
agent-hub-cli automations run '<task-id>'
agent-hub-cli --json automations runs '<task-id>'
agent-hub-cli automations logs '<task-id>'
```

在 `disk-cleanup/cleanup-config.json` 中调整保留期、清理开关、项目目录和通知。执行命令只负责调用入口脚本。修改日程不影响手动触发入口；`pause`／`resume` 控制后续计划，`remove` 删除任务。
