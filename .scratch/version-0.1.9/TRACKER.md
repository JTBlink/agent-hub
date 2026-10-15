# 发布 v0.1.9

- **版本**：0.1.9，tag 为 `v0.1.9`。
- **选版依据**：远端最新稳定 tag 为 `v0.1.8`，当前 VERSION 为 0.1.8，自动选版脚本选择 patch 升级。
- **发布基线**：已发布的 `v0.1.8`，解引用 SHA 为 `85b0807a19258a05b877d6ff9c9ea52699762366`，是本次 main 的祖先。
- **发布范围**：备份文件差异页刷新、重复选择当前文件后的加载修复、中英繁体文案与 13 项组件回归；不涉及 IPC、持久化或数据迁移。
- **关联任务**：[刷新功能](../backup-diff-refresh/issues/B01-refresh.md)、[重复选择修复](../backup-diff-loading/issues/B01-current-file-loading.md)。
- **验证目录**：仓库同级 `../agent-hub-release`，使用固定发布 SHA 的 detached worktree。

## 步骤

| 步骤            | 状态        | 备注                                                    |
| --------------- | ----------- | ------------------------------------------------------- |
| 1. 选择版本     | done        | 0.1.9，默认 patch                                       |
| 2. 准备并提交   | in_progress | 版本同步，按实际提交范围归档 CHANGELOG，保留 Unreleased |
| 3. 验证候选     | pending     | 等待固定 SHA 的完整三平台候选                           |
| 4. 创建 tag     | pending     | 候选通过后检查本地、远端 tag 与 Release 冲突            |
| 5. 跟踪正式构建 | pending     | 安装包与官网独立核验                                    |
| 6. 下载并验收   | pending     | 下载全部附件并校验，记录签名及原生验收边界              |

## 审查与验证

- Standards：沿用 VERSION 单一来源、main 单线集成与固定 SHA 候选；本次不修改 workflow 或发布脚本。
- Spec：与 `v0.1.8..main` 的实际 diff、Unreleased 和关联任务交叉核对，版本说明覆盖本次新增及修复，没有纳入未提交内容。
- 完整前端质量检查、Rust 检查与三平台测试、安装启动 smoke 由同 SHA 候选执行。
- 发布准备验证：`npm run version:check -- v0.1.9`、相关 Markdown 的 Prettier 检查、`git diff --check` 通过；新增记录和版本说明隐私扫描无匹配。
- 尚未执行 macOS、Windows、Linux 干净用户环境中的完整交互、主题、卸载及备份恢复验收；CI smoke 结果另行记录。
