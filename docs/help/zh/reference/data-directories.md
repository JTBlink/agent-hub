---
id: data-directories
title: 目录与本地数据
description: 了解技能内容、应用状态、备份与项目文件的位置。
since: "0.1.4"
tags: ["目录", "路径", "数据", "恢复"]
related: ["deployment-modes", "backup-sync"]
---

# 目录与本地数据

## 个人技能库

默认技能内容位于 `~/.agent-hub/skills`。自定义库与显式 CLI 目录保持兼容，以设置中的实际路径为准。

## 应用状态

数据库、配置和日志位于应用数据目录；默认使用 `~/.agent-hub`。凭据单独保存，不进入技能 Git 备份。

## Git 备份

默认备份工作区为 `~/.agent-hub/backup`，保存技能与同步元数据。恢复原件默认位于 `~/.agent-hub/recovery`。

## 普通项目

`.agents/skills` 是项目技能实际内容，Agent 专属入口按宿主规则生成。`.agent-hub/project-skills.json` 是可选的维护清单。

请以应用显示的路径和影响说明为准，不要手动删除唯一的技能原件。
