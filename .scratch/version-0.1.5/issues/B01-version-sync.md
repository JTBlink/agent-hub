Type: task
Status: resolved
Blocked by: none

# 同步应用版本到 0.1.5

## Scope

同步六个版本文件，整理版本更新日志并验证版本一致性及相关脚本。

## Acceptance

- VERSION、前端、Rust、Tauri 与两个锁文件均为 0.1.5。
- CHANGELOG 保留 Unreleased，现有待发布变更归入 0.1.5。
- 版本、发布脚本、帮助内容与差异检查通过。

## Result

- 使用 `npm run version:set -- 0.1.5` 同步 [VERSION](../../../VERSION)、前端、Rust、Tauri 和锁文件；[CHANGELOG](../../../CHANGELOG.md) 将已有待发布说明归入 0.1.5，保留 Unreleased。
- `npm run version:check -- v0.1.5` 通过；版本同步、版本校验、发布汇总、发布附件校验与帮助内容共 5 个测试文件、36 项测试通过。
- `npm run docs:generate` 和 `npm run docs:check` 通过，14 篇文章对应应用版本 0.1.5；生成内容不进入 Git。
- Prettier、`git diff --check` 和本次新增记录的链接、隐私检查通过。
- Standards：复用版本同步脚本，未调整依赖或业务代码；Spec：六个版本文件一致，更新日志与任务记录完整。
- 本任务仅完成本地版本准备；未提交、创建 tag、推送或触发正式发布，未执行三平台安装包验收。

## Comments

- 后续获授权提交并推送当前变更；提交前复核版本、帮助内容、31 项任务状态、格式和隐私检查，并通过 Vitest 的 5 个相关测试文件、36 项测试。
- 项目技能清单的内容指纹与两个技能目录一致，团队入口有效；修正清单 JSON 格式。Standards 与 Spec 复核通过，正式发布及三平台安装包验收仍不在本次范围内。
