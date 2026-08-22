# 产品概述

## 定位

AgentHub 是本地优先的 AI Agent 配置与 Skills 管理器。它统一发现、查看和维护不同编码 Agent 的全局配置与工作空间配置，并提供可视化的 Skill 生命周期管理。

第一版聚焦“看得见、改得安全、能够恢复”，而不是替代 Claude Code、Codex 或 OpenCode 的交互终端。

## 第一版技术栈

- Tauri 2：桌面应用外壳与系统能力。
- React + TypeScript：用户界面。
- Rust：配置解析、安全文件操作和外部命令执行。
- SQLite：配置索引、Skill 状态、操作记录和应用设置。

## 第一版范围

- 自动发现 Claude Code、Codex、OpenCode 的全局配置文件。
- 导入工作空间并发现其中的 Agent 配置和指令文件。
- 按 Agent、作用域和文件类型统一浏览配置。
- 提供表单编辑、原始文本编辑、格式校验和差异预览。
- 配置写入前自动备份，并支持查看历史和回滚。
- 可视化展示全局与工作空间级 Skills。
- 支持 skills.sh 生态、标准 Marketplace、官方 [`anthropics/skills`](https://github.com/anthropics/skills)、[`mattpocock/skills`](https://github.com/mattpocock/skills)、[`obra/superpowers`](https://github.com/obra/superpowers)、[`affaan-m/ECC`](https://github.com/affaan-m/ECC)、自定义 Git 仓库以及用户选择的本地仓库目录中的 Skills。
- 通过来源地址、仓库路径或 skills.sh 安装、更新、启用、禁用和卸载 Skills。
- 展示配置冲突、无效路径、重复 Skill 和版本异常。

## V1 交互结论

- 入口采用工作台总览：展示配置健康度、待确认计划、Skill 更新和最近活动；点击后进入配置中心或 Skills 中心专题页。
- 配置中心以 Agent/作用域为第一层筛选，文件详情同时提供表单和源码视图；解析失败、外部修改和部分兼容状态必须保留为可操作诊断。
- 配置写入和 Skill 安装统一进入安装/变更计划，先展示来源、目标、文件清单、Diff、权限和回滚点，再一次确认执行。
- 空状态提供“扫描 Agent”“添加来源”入口；未知或不兼容条目可浏览但不进入默认批量计划。

## 暂不包含

第一版不提供云同步、多人协作、账号计费、远程 Agent 托管、完整插件市场或内置 Agent 对话终端。AgentHub 不会在未确认的情况下覆盖任何全局或工作空间配置。
