---
name: github-cli
description: 使用 GitHub CLI（gh）处理项目 GitHub 工作流。分析和修复 Actions 失败、维护 main 单线集成与 CI/CD；正式发布时根据远端 tag 选版、按提交范围更新 changelog、验证候选、打 tag 并验收 Release。
license: MIT
metadata:
  version: "1.6.1"
---

# GitHub CLI 工作规范

本 skill 位于仓库 `.agents/skills/github-cli/`，随 Git 共享。独立维护版本发布和 GitHub Actions，所需规范包含在本目录内，无需加载其他 skill。

Skill 版本以 frontmatter 的 `metadata.version` 为准，独立于应用 `VERSION`；能力或执行约定变化时按 SemVer 更新，项目记录写入 changelog 和 tracker。入口、界面元数据、按需参考资料共同组成技能目录。

## 上下文与资料

先定位仓库根目录，读取 `AGENTS.md` 和相关 `.scratch/` 任务。发布时核对 `VERSION`、`package.json`、`CHANGELOG.md` 与发布脚本；Actions 任务读取对应实际 workflow。本文规范对应当前仓库；在其他项目使用时，先核实版本来源、远端、工作流和产物，不能照搬应用名、平台矩阵或签名变量。

| 任务                                | 读取资料                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| 版本发布、候选、tag、验收与失败续发 | [版本发布流程](references/release-flow.md)                                    |
| 新增、修改或审查 Actions            | [Actions 规范](references/actions.md)、[当前 CI/CD 配置](references/ci-cd.md) |
| 分析失败运行、修复与重跑            | [Actions 故障处理](references/actions-troubleshooting.md)                     |
| 平台兼容性与产物说明                | [平台支持](references/platform-support.md)                                    |

## 执行边界

- 正式发布按唯一的发布流程连续完成六步；只要求准备、候选或规范修改时，停在该范围。已有明确授权不逐步重复询问，普通开发不自动发版。
- 版本选择、自动更新 CHANGELOG、main 单线集成、固定 SHA、候选复用、tag 冲突和验收规则统一维护于发布流程，不在其他文档重复定义。
- 优先使用已认证的 `gh`；从用户 URL 或 `gh repo view --json nameWithOwner` 确认仓库，必要时检查 `gh auth status`，不打印令牌。Git 操作用项目远端。
- 日志只读所需失败 job，记录前脱敏，不提交原始运行日志。发现文档与实际脚本不符时，明确差异并同步规范，不将未实现功能写成已支持。

## 交付证据

回写 `.scratch/`、实际影响对应的 changelog 和必要平台说明。工作流变更需提供相关合约测试结果；发布需报告版本、tag、解引用 commit SHA、候选与正式 Actions / Release 链接、附件校验与签名状态以及未完成的原生验收。仅修改规范时验证结构、链接和实现一致性，不触发发布构建。
