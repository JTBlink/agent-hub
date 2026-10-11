# 测试、任务与交付规范

任务约定见 [Issue tracker](issue-tracker.md) 与 [分诊状态](triage-labels.md)，提交见 [提交规范](commit-conventions.md)。

## 验证选择

| 改动                      | 验证要求                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Skill 与文档              | frontmatter、文件引用、规则一致性、隐私、tracker 状态、`git diff --check`             |
| 前端逻辑与 UI             | `npm test`、`npm run lint`、`npm run build`；UI 另按 [UI 规范](ui-guidelines.md) 验收 |
| Rust、command 或 CLI      | 相关行为测试、Rust 格式、严格 Clippy；跨端变更同时检查前端                            |
| migration、文件系统与恢复 | 覆盖升级、重复执行、路径边界、部分失败与恢复的集成测试                                |
| 版本与发布                | 版本一致性与相关发布脚本检查；各平台原生验收不能由单平台结果替代                      |

标准命令从项目根目录执行：

```bash
npm test
npm run lint
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
git diff --check
```

- 根据影响选择检查；文档改动不必编译应用。仓库要求提交拉取请求前执行 Rust 全量测试、格式和 Clippy 检查。
- 每个缺陷修复添加能重现问题的回归测试。纯转换使用单元测试；跨 command、SQLite、文件系统的公开行为使用集成测试。Rust 单元测试与实现同置于 `#[cfg(test)]`，公开行为和端到端流程置于 `tests/*.rs`。
- 测试描述行为，避免只匹配实现细节。确认通过后不无故重复同一检查。
- 记录真实执行结果，区分本次失败、已有失败和未执行检查；未运行或未完成的验收不能写成通过。

## 任务、提交与发布

- 按 [Issue tracker](issue-tracker.md) 更新规格、任务状态和依赖；完成时写入真实验证和重要文件链接，有索引时同步。
- 当前会话已授权提交时执行领取与交付提交，否则保留本地记录；不能因此停止已经授权的实现。
- Git 提交格式、正文、隐私与 Standards / Spec 两轴审查统一遵循 [提交规范](commit-conventions.md)，不重复维护另一份要求。
- 每次收尾检查用户可见行为、发布流程或兼容性变化，必要时更新 `CHANGELOG.md`。
- 版本同步、tag、GitHub Actions 与 Release 使用 [github-cli](../../github-cli/SKILL.md)。普通开发不自动触发发布。
