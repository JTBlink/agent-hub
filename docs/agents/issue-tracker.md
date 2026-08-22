# Issue tracker：仓库内 Markdown

本仓库不依赖 GitHub Issues。规格、任务、依赖、状态和讨论以 `.scratch/` 中已提交的 Markdown 文件为唯一真实数据源；GitHub 仅用于 CI/CD、安装包和 Release。

## 目录约定

```text
.scratch/<feature>/
├── spec.md
├── README.md
└── issues/
    └── <ID>-<slug>.md
```

每个任务文件顶部必须包含：

```text
Type: task
Status: open
Blocked by: D01, B02
```

`Blocked by: none` 表示无依赖。讨论追加到 `## Comments`；完成时追加 `## Result`，包含实现摘要、验证命令和重要文件链接。

## 状态流转

```text
open → claimed → resolved
          ├── needs-info → claimed
          └── wontfix
```

领取任务时先把状态改为 `claimed` 并提交。AI 只能领取 `open` 且所有依赖已 `resolved` 的任务。需求变化必须更新 `spec.md` 或产品文档，并新增/调整任务和依赖，不能只修改代码。

## GitHub 职责

GitHub Actions 读取仓库内容执行检查和跨平台打包。GitHub Issue、Project 和 PR 状态均不是本仓库的需求状态来源。
