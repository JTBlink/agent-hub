---
id: quick-start
title: 快速开始
description: 从导入到部署，完成第一个 Skill 的使用。
since: "0.1.4"
tags: ["入门", "导入", "部署"]
related: ["skill-library", "skill-groups"]
---

# 快速开始

AgentHub 管理技能库，并把你选择的 Skills 部署到 Agent 的工作空间。**导入技能库**和**部署到 Agent**是两步操作。

![导入与部署流程](../../assets/workflow.svg)

## 第一步：导入 Skill

打开“发现 → Skills”，从本地目录、Git 仓库或压缩包导入。Skill 通常以 `SKILL.md` 为入口；导入后，在技能库确认名称、正文和来源。

## 第二步：选择工作空间

通用技能在“全局工作区”添加。只服务当前项目的技能，在关联项目后进入“项目工作区”添加。

## 第三步：部署到 Agent

点击“+ 添加 Skills”，选择技能和目标 Agent。添加完成后，到目标 Agent 的工作区确认技能状态，并按宿主工具自己的方式使用技能。

## 下一步

用[技能组](../guides/skill-groups.md)批量管理常用技能；需要团队交付时，阅读[项目技能与团队共享](../guides/project-team-sharing.md)。
