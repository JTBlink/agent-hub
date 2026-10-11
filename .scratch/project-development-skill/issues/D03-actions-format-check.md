# D03：修复 v0.1.4 Actions 格式门禁

Type: task
Status: claimed
Blocked by: D02

## Acceptance

- 分析 [失败运行](https://github.com/JTBlink/agent-hub/actions/runs/38149179367)，以首个失败步骤为根因证据。
- 修复 Prettier 报告的文件，保持应用行为；执行前端与 Rust 质量检查。
- GitHub Skill 命名为 `github-cli`，覆盖 gh 运行分析、新 SHA 验证、重跑与发布失败恢复。
- 提交并 push，新提交手动 CI 验证；不移动 v0.1.4 tag。

## Comments

- 失败 SHA 为 `d7979ace99b42c33bab503590d823019469c4c28`，失败点为 Verify release candidate / Verify frontend 的 `npm run format:check`。6 个文件未通过格式检查；lint、测试、构建及 Rust 步骤未执行，平台打包与汇总被跳过。
- 2 个发布测试文件因平台说明路径迁移需要格式化；另外 4 个文件为 `CardActionMenu.tsx`、`SkillGroupBar.tsx`、`skillGroupErrors.ts`、`WorkspaceView.tsx`，仅调整格式。

## Result

- 通过读取原发布 SHA 的六个文件并用 Prettier stdin 检查，确认全部复现格式失败；修复后同一检查全部通过。已有 `format:check` 是直接覆盖本缺陷的回归门禁，不额外创建重复实现的测试。
- 本地完整格式检查通过；ESLint 无错误，有一条既有 `MySkills.tsx` Hook 依赖警告；前端 144 项测试和生产构建通过。Rust 格式、严格 Clippy 与测试通过（636 通过、8 忽略）。
- 两个 Skill 均补充 MIT 与 `metadata.version: 1.0.0`，quick_validate 通过；87 个本地 Markdown 链接与个人路径检查通过。
- 推送后手动 CI 验证待完成；原 v0.1.4 run 与 tag 保留，不移动 tag。

## Review

- Standards：格式修改不改变应用行为，保持格式门禁；发布流程不重写已发布 tag，Actions 问题按最早失败步骤与新 SHA 验证。
- Spec：已定位用户提供运行的失败点，修复六个文件并验证后续质量检查；远端验证结果将在完成后回写。
