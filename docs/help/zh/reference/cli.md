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
```

## 项目管理

项目命令支持项目技能管理。需要复制入口时，查看 `project add --help` 中的 `--copy` 说明。

## 与桌面端配合

CLI 使用相同的数据与路径规则，显式目录参数会影响目标。执行修改前确认当前工作空间，完成后刷新桌面端查看结果。
