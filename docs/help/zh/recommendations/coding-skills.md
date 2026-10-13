---
id: coding-skills
title: Coding Skills 推荐集合
description: 以 matt 系列为重点，按新功能、调试、审查和架构改进组织技能组与调用示例。
since: "0.1.4"
tags: ["coding", "matt", "开发", "TDD", "调试", "代码审查", "推荐集合"]
related:
  ["skill-usage-tips", "workflow-recipes", "skill-groups", "choose-skills"]
reviewed: "2026-10-13"
---

# Coding Skills 推荐集合

推荐从“Coding 基础”开始，再按任务增加需求规划或架构改进 Skills。以下重点介绍 [matt 系列的公开来源仓库](https://github.com/mattpocock/skills)，核验日期为 2026-10-13；上游会持续更新，实际名称与流程以导入的 `SKILL.md` 为准。

## 建议建立的技能组

这些是可自行创建的集合建议。通用流程与项目已有的开发规范搭配使用，技能组本身不编排调用顺序。

| 技能组       | 建议成员                                                                                                      | 什么时候用                               |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Coding 基础  | `tdd`、`diagnosing-bugs`、`code-review`、项目开发规范                                                         | 日常实现、小功能、缺陷修复与交付检查     |
| 需求到实现   | `grill-with-docs`、`grilling`、`domain-modeling`、`to-spec`、`to-tickets`、`implement`，并加入 Coding 基础    | 需求跨多个模块，需要先对齐再拆分         |
| 架构与原型   | `improve-codebase-architecture`、`codebase-design`、`prototype`、`grilling`、`domain-modeling`、`code-review` | 模块难改、测试难写，或方案需要先试验     |
| 开发环境复盘 | `retro`、`writing-for-agents`                                                                                 | 找出目录指引、检查命令和项目规则的改进点 |

另行导入 `setup-matt-pocock-skills`，首次使用该系列工程流程时执行一次项目配置。上表列出的辅助技能也是依赖：例如 `grill-with-docs` 会调用 `grilling` 与 `domain-modeling`，`retro` 会调用 `writing-for-agents`。来源和安装建议见[上游说明](https://github.com/mattpocock/skills#installation-30-second-setup)。

## 在 AgentHub 中准备

1. 按[管理技能库](../guides/skill-library.md)导入来源：`https://github.com/mattpocock/skills`，选择当前任务需要的 Skills 与辅助依赖。
2. 按[使用技能组](../guides/skill-groups.md)建立集合，并添加到目标 Agent 的全局或项目工作空间。
3. 确认目标 Agent 能读取这些 Skills。导入技能库、加入技能组与部署是三个操作。
4. 首次在项目使用时，按 [setup-matt-pocock-skills 的流程](https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/SKILL.md)配置任务记录位置和领域文档；已有约定时说明沿用现有配置。该流程会修改项目指引和文档，应先查看它提出的配置草稿。

可以这样开始配置：

```text
/setup-matt-pocock-skills
这个项目的任务记录使用仓库内 Markdown。
请先读取现有项目指引，沿用已有任务、术语与 ADR 目录，给出配置草稿。
```

如果通过命令行安装，可参考上游提供的 `npx skills@latest add mattpocock/skills`，按提示选择技能和目标 Agent。已经通过插件或其他方式安装的内容，先核对是否重复，再决定是否交给 AgentHub 管理。

以下示例按支持斜杠调用的宿主书写；其他 Agent 可用“使用对应 Skill”表达，参见 [Skill 使用技巧](skill-usage-tips.md#skill-名称与调用语法)。

## 新功能：从需求走到可验收的实现

推荐顺序：`grill-with-docs → to-spec → to-tickets → implement → code-review`。小功能已有清晰验收条件时，可直接进入实现阶段。

### 对齐需求

[`grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md)组合需求追问和领域建模，适合“知道想解决什么，但细节还没定”的任务。它会结合讨论维护术语和架构决定。

```text
/grill-with-docs
我想给项目列表增加名称搜索。请结合现有实现，逐项确认匹配规则、
无结果提示和项目切换行为，再对齐验收条件。
```

### 固化规格并拆任务

[`to-spec`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md)将已讨论内容整理成规格，确认测试入口后写入项目配置的任务记录位置。它适合对话已经形成共识的阶段。

[`to-tickets`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md)将规格拆成可单独验收的完整小任务，标明阻塞依赖；完成任务粒度确认后再保存。优先按可展示的行为拆分，例如“搜索并展示结果”，再补“清空与无结果反馈”。

依次发送，每一步结束后再进入下一步：

```text
/to-spec
将刚才确认的需求整理为规格，包含验收行为、测试入口和不做的范围。
```

```text
/to-tickets
将这份规格拆成可独立演示的小任务，列明依赖，按项目约定保存。
```

### 实现并检查

[`implement`](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md)依据规格或任务实现，尽可能在已确认的测试入口使用 `tdd`，完成后调用审查；上游流程还包含本地提交。调用时明确任务位置和交付范围。

```text
/implement
实现已确认规格中的第一个任务，先读取规格及项目开发规范。
完成相关检查和审查，本次交付保留本地改动。
```

规模较大的完整规格可考虑 [`implement-spec`](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement-spec/SKILL.md)：它按任务依赖在集成分支协调多个实现者和独立 worktree，并收尾审查。需要宿主具备相应的多 Agent 与 Git 能力；单个任务优先使用 `implement`。

## 测试：用 tdd 做一个完整的小步

[`tdd`](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md)先约定公开行为的测试入口，每次完成“一个失败测试 → 最小实现 → 验证”。上游入口将重构放在后续审查阶段。测试应观察用户能看到的行为，避免绑定私有函数或内部调用次数。

```text
/tdd
为项目名称搜索增加大小写不敏感的行为。
先确认通过哪个公开入口测试，再写一个失败测试和最小实现。
```

## 调试：先把问题稳定复现

[`diagnosing-bugs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md)适合难复现错误、偶发问题和性能退化。先建立能捕获具体症状的快速验证，再缩小复现、比较假设、定位原因，最后修复并保留回归测试。性能问题先给出测量基线。

```text
使用 diagnosing-bugs Skill，排查切换项目后搜索结果仍显示上一个项目的问题。
复现：在项目 A 搜索，再切换到项目 B。
预期：只显示 B 的结果；实际：偶尔残留 A 的结果。
请先建立能捕获这个症状的复现，再定位并修复，保留回归测试。
```

## 审查：同时核对规范与需求

[`code-review`](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md)从固定 Git 基准检查变更，分别报告 Standards（项目规范）与 Spec（需求实现）。提供可解析的提交、分支或 tag，以及真实规格位置，能让两条审查线都有依据。

```text
/code-review
审查当前分支相对 main 的已提交变更。
需求见项目内的搜索功能规格，规范按项目指引读取。
分别报告规范问题、遗漏的验收行为，并列出对应文件与影响。
```

上游使用 `git diff <基准>...HEAD`，比较的是提交范围；**未提交的工作区改动不在这个范围里**。它还依赖并行子 Agent。审查前确认宿主能力和代码范围，若要检查工作区，应明确要求 Agent 另外纳入未提交的差异。

## 架构：先挑一个值得改的模块

[`improve-codebase-architecture`](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md)先调查难理解、难测试或经常变化的区域，生成候选改进报告，再讨论选中的候选。建议给出具体模块或痛点，逐项确定改动。

[`codebase-design`](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md)提供模块接口和可测试性的设计原则；[`prototype`](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/SKILL.md)用可丢弃的逻辑或 UI 原型回答一个明确的问题。

```text
/improve-codebase-architecture
重点看项目搜索的数据流，找出让异步结果难以测试和维护的地方。
先给候选方案和收益，我选定一项后再细化。
```

```text
使用 prototype Skill，验证“切换项目时是否保留搜索词”的交互。
做一个可操作的临时原型，覆盖清空、无结果和切换场景，并记录选定行为。
```

这里的原型用于验证决策。完成后将选定行为写回规格，再安排实现、测试与审查。架构调查涉及子 Agent，报告也可能需要网络资源；先核对入口所需能力。

## 使用前最后核对

- **名称与版本**：本机旧版可能使用不同名称或流程，照实际 `name` 调用。
- **辅助依赖**：编排 Skill 调用的其他 Skills 也要部署到同一目标 Agent。
- **项目规则**：指定任务记录、领域文档、测试入口和 Git 约定，避免生成第二套规则。
- **完成结果**：让 Agent 报告实现、验证与未完成项；流程执行结束仍需对照验收条件。

如何选择其他来源见[如何选择 Skill](choose-skills.md)，其他组合思路见[按任务搭配 Skills](workflow-recipes.md)。
