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
agent-hub-cli automations create --template workspace-check
agent-hub-cli automations create --template disk-cleanup
agent-hub-cli automations create --file task.json
agent-hub-cli automations edit '<task-id>' --file task.json --revision 1
agent-hub-cli automations run '<task-id>'
agent-hub-cli automations pause '<task-id>'
agent-hub-cli automations resume '<task-id>'
agent-hub-cli automations remove '<task-id>'
```

`task.json` 与桌面表单使用同一份任务定义：

```json
{
  "name": "工作日检查",
  "provider": "system",
  "content": "printf 'check complete\\n'",
  "workdir": null,
  "schedule": {
    "kind": "daily",
    "hour": 9,
    "minute": 0,
    "weekdays": true
  },
  "enabled": true
}
```

`workdir` 省略或为 `null` 时，会自动创建 `~/.agent-hub/automations/<任务名称>/` 作为该任务的独立工作目录；同名或已有目录会使用 `-2`、`-3` 等后缀区分，不占用已有内容。目录分配记录保存在内部任务数据中，重复分配或修改任务名称不重命名目录。显式填写时保留指定目录，旧版本的 UUID 工作目录也保持原路径。删除任务不会删除工作目录中的文件。

系统任务统一执行工作目录下的短名 Shell 入口：`sh './run.sh'`（Windows 为 `& './run.ps1'`），名称已占用时使用 `run-2.sh` 等后缀，保留已有文件。定时和手动运行触发同一个入口。预装系统模板的每个文件夹包含 `template.json` 与一个或多个 `.py` 文件，随软件和 CLI 内置；Shell 入口再调用对应 Python 脚本，如 `disk-cleanup/disk-cleanup.py`，需安装 Python 3。`task.json` 的 `files` 数组以相对路径和内容保存 Shell 入口和 Python 脚本，可在 GUI 展开“脚本文件”、通过 CLI 或直接编辑文件定制。旧格式内联 `content` 保存时会转为 Shell 入口的正文。运行前不会用模板覆盖定制内容；旧长文件名迁移成功后将原内容保存在内部任务目录，目录中的用户文件不移动。删除任务保留工作目录及脚本文件。

`provider` 为 `system` 时，内容是 macOS/Linux 的 `/bin/sh` 命令或 Windows PowerShell 命令。任务写入当前用户的系统原生调度器，关闭 AgentHub 后仍可按计划执行；需要用户保持登录，Linux 可另行配置用户服务 linger。支持每天、工作日、固定分钟间隔（`{"kind":"interval","minutes":60}`）和仅手动触发（`{"kind":"manual"}`）。保存不会额外触发一次运行，手动运行不修改日程配置。

`provider` 为 `hermes` 时，`content` 是提示词，除每日/间隔日程外还支持 `{"kind":"custom","expression":"0 9 * * 1-5"}`。本机须已安装 Hermes，计划运行还需要其调度服务运行。暂停或终态的 Hermes 任务需先恢复后才能手动运行。`run` 返回“已请求”而非“执行成功”，实际结果在 Hermes 中记录。

只有 AgentHub 创建的系统任务可以编辑；已有 Hermes 提示词任务通过 Hermes CLI 编辑，其他系统任务提供只读详情。`--revision` 防止覆盖另一端刚保存的版本；省略时使用本次读取的版本。

创建记录保存在系统应用数据目录的 `com.jtstudio.agenthub/automations` 下：macOS 为 `~/Library/Application Support/`，Linux 通常为 `~/.local/share/`，Windows 为 `%LOCALAPPDATA%`。这些记录不随技能库移动。需要隔离运行时，可设置绝对路径环境变量 `AGENT_HUB_AUTOMATION_HOME`（隔离模式的默认工作目录也放在该目录的 `workspaces` 下）；此命令不使用技能库的 `--skills-root`。

## Agent 与自动备份

Agent 可读取 `automations templates` 获取当前平台的命令和已安装 Hermes 模板，用 `create --template <模板 ID>` 快速创建。`--json automations list` 返回精确任务 ID，随后使用 `run <ID>` 手动触发，`show <ID>` 查看实际运行时间与结果；“requested” 仅表示请求成功。不要根据旧的 `last_result` 宣称本次运行完成，也不要因查询暂未更新就重复触发。

创建、编辑、启停与删除会将任务定义变更加入持久待备份队列。应用运行、已有 Git 远端且自动备份开启时，沿用现有防抖、提交与推送流程；CLI 的修改也能被应用检测。直接编辑工作目录脚本时，应用通过文件事件同步脚本内容并增加任务版本，沿用相同的备份流程；CLI 查询或修改任务时也会同步已定制内容。应用关闭时的修改在下次启动或手动 Git 备份时处理。备份保存脚本内容与任务定义，不同步日志、执行记录和其他工作目录文件。读取失败或内容无效会报告错误，避免把旧内容当作本次脚本备份。立即运行及日志更新不会产生任务配置备份。

```bash
agent-hub-cli --json automations backups
agent-hub-cli --json automations restore '<backup-id>'
agent-hub-cli --json automations restore '<backup-id>' --apply
```

第一条列出 Git 同步的任务定义，第二条预览已暂停的副本；第三条显式创建副本。GUI 在“新建自动化 → 使用模板 → Git 备份”中检查并新建。同步和恢复 Git 内容不会自动注册、执行或覆盖本机任务；Shell 不兼容的命令需先转换。

`automations runs <ID>` 查看本机保存的执行记录，`automations logs <ID> --run <执行 ID>` 查看指定记录输出；不带 `--run` 兼容读取最近输出。系统任务默认保留最近 100 次；旧版仅能保留尚未覆盖的一次，升级后开始逐次记录。Hermes 读取已有结果文件，保留由 Hermes 管理，不把结果文件存在当作执行成功。日志 `--json` 返回 `available`、`kind`、`content` 和 `truncated`，大文件只返回末尾 256 KiB。执行记录和日志仅保存在本机，不参与 Git 同步备份。

「清理磁盘缓存」模板 `disk-cleanup` 默认每天 03:00 清理工作目录 `tmp` 中超过 7 天和 `logs` 中超过 30 天的文件，同时清理 Homebrew、pip、npm 和 `~/.cache/npm-hermes` 的下载缓存（保留 `_npx` 工具安装文件）。用户缓存按最近修改／访问时间保留 30 天，npm 临时缓存保留 7 天。仅扫描明确定义的缓存子目录，不遍历整个用户目录或缓存根目录；浏览器缓存、uv 环境、下载与文档目录、项目构建目录不在默认规则中。保留目录，跳过符号链接／junction、硬链接和锁文件；目标不存在时跳过，单项读取失败不会阻断其他目录。

清理前后分别以 GiB／MiB 展示总容量、已用、可用与使用率，汇总扫描／候选／删除数量和文件大小，并单列磁盘可用空间差值。日志与最终总结使用中文，按清理项列出结果；预览显示预计删除量，工具清理保留原始输出，不将无法确认的文件数和大小计入总量。删除文件大小不等同于实际回收空间，其他进程也可能影响可用空间变化。没有匹配文件时明确报告“无可清理项”。

可在任务工作目录中先预览（不会删除文件）：

```bash
python3 ./disk-cleanup/disk-cleanup.py --dry-run
python3 ./disk-cleanup/disk-cleanup.py --dry-run --workspace-only
```

`--workspace-only` 只应用任务目录规则；在脚本中设置 `ENABLE_USER_CACHE_CLEANUP = False` 也可长期关闭用户缓存清理。创建和保存不会额外执行一次。

Agent 缓存和诊断记录默认随计划清理，保留 7 天，逐项结果纳入中文总结：

| Agent       | 默认清理目录（相对各自数据根目录）                  |
| ----------- | --------------------------------------------------- |
| Codex       | `cache`、`tmp`、`shell_snapshots`、`log`            |
| Claude Code | `debug`、`shell-snapshots`、`session-env`           |
| Hermes      | `cache`、`logs`                                     |
| OpenCode    | `~/.local/share/opencode/log`，支持 `XDG_DATA_HOME` |

缓存和 Shell 快照按最近访问／修改时间保留，诊断日志按最后修改时间保留；缺失目录跳过。支持 `CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`HERMES_HOME` 自定义数据根目录，但必须位于用户主目录内且不是链接。保留配置、登录凭据、技能、历史对话、会话数据库与 OpenCode 快照；不扫描整个 Agent 根目录。

```bash
# 预览默认 7 天的 Agent 清理规则
python3 ./disk-cleanup/disk-cleanup.py --dry-run
# 将 Agent 缓存和日志的保留期改为 14 天（不影响下载缓存规则）
python3 ./disk-cleanup/disk-cleanup.py --dry-run --agent-cache-days 14
# 本次跳过 Agent 清理
python3 ./disk-cleanup/disk-cleanup.py --skip-agent-cache
```

可在脚本顶部设置 `AGENT_CACHE_RETENTION_DAYS` 或 `ENABLE_AGENT_CACHE_CLEANUP = False` 定制长期策略。`--workspace-only` 和 `ENABLE_USER_CACHE_CLEANUP = False` 都会跳过 Agent 清理；修改脚本本身不会立即删除文件，下次手动或计划运行才执行。

更大的缓存通过参数显式启用；可组合使用，`--workspace-only` 与这些选项互斥。先执行带 `--dry-run` 的命令检查范围，确认后移除此参数：

```bash
# 仅清理 Chrome/Edge 的过期 Cache 与 Code Cache，保留账户、Cookies 和 Storage
python3 ./disk-cleanup/disk-cleanup.py --dry-run --browser-cache
# 清理可信任的 AgentHub 源码历史构建，复用项目工具并保留最新构建及共享依赖
python3 ./disk-cleanup/disk-cleanup.py --dry-run --agent-hub-project ~/projects/agent-hub
# 额外清理指定 Cargo target 中超过 7 天未使用的增量编译缓存；不清理 deps
python3 ./disk-cleanup/disk-cleanup.py --dry-run --rust-target ~/projects/demo/target
# 工具深度清理：uv 仅离线清理无引用缓存，Homebrew 不自动更新
python3 ./disk-cleanup/disk-cleanup.py --dry-run --uv-prune --brew-cleanup
```

实际清理时检测到 Chrome／Edge 仍运行会跳过浏览器缓存，检测到 cargo／rustc 编译会跳过构建清理；无法检查进程时该项失败并保留数据。uv 没有无副作用预览，因此在 `--dry-run` 下明确跳过。工具缺失会跳过，执行失败会在总结中报告并返回非零退出码，不阻断后续清理项。第三方工具原始输出可能仍为英文。

脚本顶部的保留天数和 `EXTRA_CACHE_RULES` 可定制。浏览器／下载工具缓存按最近修改和访问时间保留，构建增量缓存默认保留 7 天。不会自动删除 Downloads、浏览器账户数据、Codex 更新暂存、Playwright 浏览器版本、uv 环境或 Rust 工具链；这些内容需要各自工具或人工确认引用关系。

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

在 `disk-cleanup/disk-cleanup.py` 中修改 `TEMP_RETENTION_DAYS`／`LOG_RETENTION_DAYS` 可分别调整两类文件的保留天数；`CLEANUP_RULES` 定义工作目录下要清理的子目录；`USER_CACHE_RETENTION_DAYS` 控制用户下载缓存的保留期，`EXTRA_CACHE_RULES` 可追加明确的缓存子目录。执行命令只负责调用脚本。修改日程不影响手动触发入口；`pause`／`resume` 控制后续计划，`remove` 删除任务。
