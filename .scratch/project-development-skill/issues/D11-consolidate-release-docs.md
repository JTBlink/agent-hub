Type: task
Status: resolved
Blocked by: none

# 合并并精简 GitHub 发布参考文档

## Acceptance

- 版本发布只维护 release-flow.md，按明确步骤说明选版、提交、候选、tag、正式构建与下载验收。
- 合并发布前验证和验收清单，清理其他文档中的重复发布步骤，保留自动维护版本更新日志等有效规则。
- 更新 Skill 与文档入口，检查引用、格式和实际 workflow / 脚本的一致性。
- github-cli 与 rust-dev 独立使用，删除双向 Skill 引用；发布必需的检查与提交要求包含在 github-cli 内。

## Comments

- 用户要求文档简单、直接、清晰；本次为文档整理。
- 用户补充要求 Skill 独立，不相互关联；已授权提交本地改动。

## Result

- 发布操作统一为 [六步流程](../../../.agents/skills/github-cli/references/release-flow.md)，删除 release-prevention.md 和 release-checklist.md；精简 Skill 入口、CI/CD 与故障处理中的重复步骤，更新文档索引。
- github-cli 1.6.1 与 rust-dev 1.0.1 移除双向依赖；发布必需的检查与提交规则包含在 github-cli 内。平台支持内容保留，发布组装仍可读取。
- 验证：Prettier、90 个本地链接与锚点、Skill 元数据与独立性、隐私及 git diff --check 通过；`npm test -- scripts/assemble-release.test.mjs scripts/verify-release-bundle.test.mjs` 的 11 项测试通过。
- Standards：引用完整，版本与工作流实现一致，固定 SHA、候选门禁、签名与 tag 保护规则保留。Spec：一个明确的发布步骤文档，无其他 Skill 依赖。
