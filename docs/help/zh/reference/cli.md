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
agent-hub-cli --json automations logs '<task-id>'
agent-hub-cli --json automations templates
agent-hub-cli automations create --template workspace-check
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

`workdir` 省略或为 `null` 时，会自动创建 `~/.agent-hub/automations/<任务 ID>/workspace` 作为该任务的独立工作目录；显式填写时保留指定目录。删除任务不会删除工作目录中的文件。

`provider` 为 `system` 时，内容是 macOS/Linux 的 `/bin/sh` 命令或 Windows PowerShell 命令。任务写入当前用户的系统原生调度器，关闭 AgentHub 后仍可按计划执行；需要用户保持登录，Linux 可另行配置用户服务 linger。支持每天、工作日、固定分钟间隔（`{"kind":"interval","minutes":60}`）和仅手动触发（`{"kind":"manual"}`）。保存不会额外触发一次运行，手动运行不修改日程配置。

`provider` 为 `hermes` 时，`content` 是提示词，除每日/间隔日程外还支持 `{"kind":"custom","expression":"0 9 * * 1-5"}`。本机须已安装 Hermes，计划运行还需要其调度服务运行。暂停或终态的 Hermes 任务需先恢复后才能手动运行。`run` 返回“已请求”而非“执行成功”，实际结果在 Hermes 中记录。

只有 AgentHub 创建的系统任务可以编辑；已有 Hermes 提示词任务通过 Hermes CLI 编辑，其他系统任务提供只读详情。`--revision` 防止覆盖另一端刚保存的版本；省略时使用本次读取的版本。

创建记录保存在系统应用数据目录的 `com.jtstudio.agenthub/automations` 下：macOS 为 `~/Library/Application Support/`，Linux 通常为 `~/.local/share/`，Windows 为 `%LOCALAPPDATA%`。这些记录不随技能库移动。需要隔离运行时，可设置绝对路径环境变量 `AGENT_HUB_AUTOMATION_HOME`（隔离模式的默认工作目录也放在该目录的 `workspaces` 下）；此命令不使用技能库的 `--skills-root`。

## Agent 与自动备份

Agent 可读取 `automations templates` 获取当前平台的命令和已安装 Hermes 模板，用 `create --template <模板 ID>` 快速创建。`--json automations list` 返回精确任务 ID，随后使用 `run <ID>` 手动触发，`show <ID>` 查看实际运行时间与结果；“requested” 仅表示请求成功。不要根据旧的 `last_result` 宣称本次运行完成，也不要因查询暂未更新就重复触发。

创建、编辑、启停与删除会将任务定义变更加入持久待备份队列。应用运行、已有 Git 远端且自动备份开启时，沿用现有防抖、提交与推送流程；CLI 的修改也能被应用检测。应用关闭时的待备份变更在下次启动或手动 Git 备份时处理。立即运行及日志更新不会产生任务配置备份。

```bash
agent-hub-cli --json automations backups
agent-hub-cli --json automations restore '<backup-id>'
agent-hub-cli --json automations restore '<backup-id>' --apply
```

第一条列出 Git 同步的任务定义，第二条预览已暂停的副本；第三条显式创建副本。GUI 在“新建自动化 → 使用模板 → Git 备份”中检查并新建。同步和恢复 Git 内容不会自动注册、执行或覆盖本机任务；Shell 不兼容的命令需先转换。

`automations logs <ID>` 读取当前或最近一次输出，不累积执行历史。系统任务输出每次覆盖，Hermes 读取已有的最近结果文件；结果文件存在不代表当前运行成功。`--json` 返回 `available`、`kind`、`content` 和 `truncated`，大文件只返回末尾 256 KiB。读取操作不创建记录、不触发任务，执行日志不进入 Git 备份。
