Type: task
Status: resolved
Blocked by: none

# 发布期间自动维护版本更新日志

## Acceptance

- 发布授权包含自动核对上一个正式 tag 至发布 SHA 的提交、diff 和已有 Unreleased，补齐目标版本说明。
- 发布期间纳入源码的修复 / 变化更新同一版本，不再次升级、不重复章节；后续未纳入 tag 的变化留在 Unreleased。
- 说明提交后固定并重新验证 SHA，发布后校验 Release 正文与附件中的 CHANGELOG / RELEASE_NOTES。
- 同步 Skill 版本、UI 元数据、引用、验收和项目记录；本次 0.1.6 按新规范补齐 changelog。

## Comments

- 前一个候选 38333784115 对应 433c790；新增 Skill 和已提交的侧栏改动后需新 SHA 的候选，保留旧运行正常完成，不复用其证据发布新提交。

## Result

- github-cli 升级 1.6.0，明确发布基线、提交 / diff 核对、同版本增量更新、SHA 重验证与线上正文 / 附件一致性；同步入口、UI 元数据、流程、CI/CD 与验收。
- 本次从 v0.1.5 核对至最新已提交 main，补齐 0.1.6 版本同步、侧栏和截图说明；移除已在 v0.1.5 源码中的 Skill 1.4.0 重复记录，保留 Unreleased。
- 5 个相关测试文件、70 项测试通过；Skill 元数据、20 个本地引用、Prettier 与差异检查通过。
- Standards：不改变既有 Actions 或已发布 tag，说明与固定源码及附件保持一致；Spec：自动维护发布期间纳入内容，同版本续发及候选重验证覆盖所需场景。0.1.6 构建验收继续由发布任务记录。
