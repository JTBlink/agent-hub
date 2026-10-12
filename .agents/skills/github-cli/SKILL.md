---
name: github-cli
description: 使用 GitHub CLI（gh）处理项目 GitHub 工作流。分析和修复 Actions 失败、维护项目分支集成与 CI/CD、重跑验证、自动创建版本 tag、发布版本或校验 Release 产物时使用。
license: MIT
metadata:
  version: "1.4.1"
---

# GitHub CLI 工作规范

本 skill 位于仓库 `.agents/skills/github-cli/`，随 Git 共享。集中维护版本发布和 GitHub Actions 规则，开发、UI 与提交规范由相邻的 [rust-dev](../rust-dev/SKILL.md) 维护。

Skill 版本以 frontmatter 的 `metadata.version` 为准，独立于应用 `VERSION`；能力或执行约定变化时按 SemVer 更新，项目记录写入 changelog 和 tracker。入口、界面元数据、按需参考资料共同组成技能目录。

## 上下文与资料

先定位仓库根目录，读取 `AGENTS.md` 和相关 `.scratch/` 任务。发布时核对 `VERSION`、`package.json`、`CHANGELOG.md` 与发布脚本；Actions 任务读取对应实际 workflow。本文规范对应当前仓库；在其他项目使用时，先核实版本来源、远端、工作流和产物，不能照搬应用名、平台矩阵或签名变量。

| 任务                                | 读取资料                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| 分支集成、准备发布或自动打 tag      | [发布流程](references/release-flow.md)                                                  |
| 新增、修改或审查 Actions            | [Actions 规范](references/actions.md)、[当前 CI/CD](references/ci-cd.md)                |
| 平台打包、签名与原生验收            | [平台支持](references/platform-support.md)、[发布验收](references/release-checklist.md) |
| 防止 tag 反复失败、公共仓库免费资源 | [发布前验证与资源控制](references/release-prevention.md)                                |

## 执行边界

分析失败运行、修复与重跑时先读 [Actions 故障处理](references/actions-troubleshooting.md)。优先使用已认证的 `gh`，从用户 URL 或 `gh repo view --json nameWithOwner` 确认仓库；必要时检查 `gh auth status`，不能打印令牌。Git 操作用项目远端。日志只读所需失败 job；记录前脱敏，不提交原始运行日志。

- 用户要求正式发布时，连续完成版本同步、必要提交、自动创建版本 tag、推送和发布结果跟踪。已有明确授权不逐步重复询问。
- 只要求准备发布、候选构建、本地 tag 或规范修改时，停在该范围；普通开发提交不自动发版。
- 保留用户指定的应用版本；发布失败不自动升级。既有 tag 与修复 SHA 冲突时，先完成修复和候选验证，再按发布流程处理冲突。
- tag 必须对应已验证的不可变提交；既有发布 tag 不移动、不强推。只有发布工作流、Release 附件和校验全部成功才能报告正式发布完成。
- 本仓库保持 main 单线历史：临时工作分支及时 rebase 到最新 main，以 `merge --ff-only` 集成并清理；发布使用 main、固定 SHA 和 tag，不创建 release / 候选分支。具体集成与清理条件见发布流程。
- 发布前使用干净提交验证源码完整性，推送 main 并完成同一 SHA 的手动三平台 Build Installers；`npm run release:ready -- v<version>` 通过后才创建 tag。仅 Linux CI 成功不足以证明 Windows / macOS 可发布。
- 用仓库、版本、SHA、workflow、事件和 run ID 关联证据。共享工作区的 HEAD、最新运行或他人的提交不能替代已固定的发布 SHA；验证与打 tag 使用隔离检出，写操作前重新核对远端状态。
- 复用同一 SHA 正在运行或已成功的候选，不重复启动、取消正常构建或重复执行已有完整证据的检查。新修复 SHA 按故障处理选择新候选；候选成功后不得用其证据发布其他 SHA。
- 发现文档与实际脚本不符时，明确差异并同步规范；不得将未实现的构建格式、签名或验收写成已支持。

## 交付证据

回写 `.scratch/`、实际影响对应的 changelog 和必要平台说明。工作流变更需提供相关合约测试结果；发布需报告版本、tag、解引用 commit SHA、候选与正式 Actions / Release 链接、附件校验与签名状态以及未完成的原生验收。仅修改规范时验证结构、链接和实现一致性，不触发发布构建。
