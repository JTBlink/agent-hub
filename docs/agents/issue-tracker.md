# Issue tracker: GitHub

规格、独立任务、依赖、讨论和交付状态统一存放在当前仓库的 GitHub Issues，通过 `gh` CLI 操作。仓库从 `git remote -v` 与 `gh repo view --json nameWithOwner` 核实；本地 Markdown 不再作为任务数据库。

## 任务与状态

- 创建：`gh issue create --title "..." --body-file <body-file>`。正文包含背景、范围、验收条件和目标版本；未定版本使用 `Target version: Unreleased`。
- 读取：`gh issue view <number> --json number,title,body,state,labels,milestone,assignees,comments`。
- 查询：`gh issue list --state open --json number,title,state,labels,milestone,assignees`；按需增加 `--label`、`--milestone` 或 `--assignee`。
- 功能规格使用一个总览 Issue，独立可执行任务使用子 Issue。通过 GitHub 原生 sub-issues 关联；接口不可用时，在总览用任务列表、在任务正文用 `Part of #<parent>` 互链。
- 依赖使用 GitHub 原生 issue dependencies；接口不可用时，在正文写 `Blocked by: #<number>`。所有阻塞项关闭后才能领取。
- 领取：确认规格明确、带 `ready-for-agent` 标签、未分配且依赖已解除，再用 `gh issue edit <number> --add-assignee @me`；进展和阻碍追加 Issue comment。
- 讨论与验证：`gh issue comment <number> --body-file <body-file>`。完成记录包含实现摘要、实际验证、重要文件和未完成验收。
- 完成：代码已提交并通过相关验证后，提交正文使用 `Closes #<number>`；只关联工作用 `Refs #<number>`。需要人工关闭时用 `gh issue close <number> --reason completed --comment "..."`。有实现记录但源码尚未提交的任务保持开放。
- 不实施：使用 `wontfix`，并以 `not planned` 原因关闭。状态变化及时反映到 Issue；不以分支、PR 或里程碑是否关闭推断任务已完成。

分诊标签见 [triage-labels.md](triage-labels.md)。规划原文保留在 `docs/plans/agent-hub.md`，Issue 链接规划，不复制维护整份方案。

## Milestones 与自动同步

使用 `v<version>` 里程碑对应发布版本，`Unreleased` 汇总待发布工作。已发布版本的里程碑关闭；未提交或尚未确定发布归属的工作留在 `Unreleased`。

`Issue metadata` 工作流在 Issue 变化时同步分诊状态：新 Issue 默认归入 `Unreleased`；正文可用单独一行 `Target version: v1.2.3`（也支持 `目标版本：v1.2.3`）自动选择或创建目标里程碑。已有手动里程碑优先保留；显式版本字段变更时按字段更新。

关闭 Issue 时移除待处理标签；以不实施原因关闭时使用 `wontfix`，重开时恢复待分诊状态。发布事件会创建并关闭对应版本里程碑，将 `Unreleased` 中通过关闭提交确认已进入该 tag 的任务归档到该版本；缺少提交证据时保留原归属，不猜测已交付。发布版本中尚未完成的任务转回 `Unreleased`。安装包发布 job 也在发布成功后直接执行同步，覆盖 GITHUB_TOKEN 创建 Release 不触发后续事件的情况。可手动运行工作流修复元数据。

技能要求“publish to the issue tracker”时创建 GitHub Issue；要求“fetch the relevant ticket”时读取对应 Issue。Wayfinding 的 map 使用总览 Issue，子任务使用 sub-issues；研究结论、决策和依赖直接维护在这些 Issue 中。

## Pull requests as a triage surface

**PRs as a request surface: no.**
