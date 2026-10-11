# D02：迁移规范并拆分 GitHub 发布 Skill

Type: task
Status: resolved
Blocked by: D01

## Acceptance

- 项目技能最终位于 `.agents/skills/rust-dev/` 与 `.agents/skills/github-cli/`，有合法 frontmatter 和界面元数据。
- 原开发、UI、图标、提交、任务、领域规范移入 rust-dev，CI/CD、平台支持和发布验收移入 github；不保留规范副本。
- 明确 SOLID 的项目落地与审查问题，补充 Actions、自动版本 tag、权限、幂等与失败恢复规范。
- 修复所有引用，发布汇总和 fixture 使用迁移后平台说明路径，发布测试通过。
- 用户要求完成后提交并 push；本次不发版、不打 tag。

## Comments

- 用户指定 `rust-dev` 名称和项目 `.agents/skills/` 目录，要求独立 GitHub 发布 Skill，并已授权提交、推送。

## Result

- [rust-dev](../../../.agents/skills/rust-dev/SKILL.md) 集中维护开发、SOLID、UI、图标、任务、领域和提交规范；[github-cli](../../../.agents/skills/github-cli/SKILL.md) 独立维护自动版本 tag、GitHub Actions、CI/CD、平台矩阵和发布验收。
- 规范原文移入 `.agents/skills/`，产品、架构与 ADR 保留原位；修正项目入口、文档索引、目录树、tracker 引用和发布汇总脚本的读取路径。
- 两个 Skill 的 quick_validate 均通过；发布汇总、产物校验、workflow 合约、版本、构建与任务状态共 7 个测试文件、49 项测试通过。格式、引用、隐私与差异检查通过。
- 校正 Windows 格式为 NSIS `.exe`、独立 CI 为仅手动触发、平台 artifacts 为 1 天；当前没有汇总 artifact 上传步骤，文档明确该限制。本次不修改工作流、不发版、不创建 tag。

## Review

- Standards：原规范迁移后只有一个维护位置；按任务读取，跨 skill 引用明确；发布路径 fixture 覆盖实际汇总读取，幂等 tag 流程不移动已发布版本。
- Spec：满足项目共享目录、rust-dev 命名、独立 GitHub 发布 Skill、SOLID / UI / Actions 和自动 tag 约定；提交与 push 按用户授权执行。
