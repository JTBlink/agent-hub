# 发布 v0.1.9

- **版本**：0.1.9，tag 为 `v0.1.9`。
- **选版依据**：远端最新稳定 tag 为 `v0.1.8`，当前 VERSION 为 0.1.8，自动选版脚本选择 patch 升级。
- **发布基线**：已发布的 `v0.1.8`，解引用 SHA 为 `85b0807a19258a05b877d6ff9c9ea52699762366`，是本次 main 的祖先。
- **发布范围**：备份文件差异页刷新、重复选择当前文件后的加载修复、中英繁体文案与 13 项组件回归；不涉及 IPC、持久化或数据迁移。
- **关联任务**：[刷新功能](../backup-diff-refresh/issues/B01-refresh.md)、[重复选择修复](../backup-diff-loading/issues/B01-current-file-loading.md)。
- **验证目录**：仓库同级 `../agent-hub-release`，使用固定发布 SHA 的 detached worktree。

## 步骤

| 步骤            | 状态 | 备注                                                   |
| --------------- | ---- | ------------------------------------------------------ |
| 1. 选择版本     | done | 0.1.9，默认 patch                                      |
| 2. 准备并提交   | done | `d58a5efbfae5a4afba2936eb539960aee4540596` 已推送 main |
| 3. 验证候选     | done | run `38717437532`，六个 job 全部通过                   |
| 4. 创建 tag     | done | annotated tag `v0.1.9` 已推送，解引用 SHA 与候选一致   |
| 5. 跟踪正式构建 | done | 安装包 `38721103938`、官网 `38721103680` 均成功        |
| 6. 下载并验收   | done | 全部 8 个附件下载与摘要验证通过，已清理验证目录        |

## 审查与验证

- Standards：沿用 VERSION 单一来源、main 单线集成与固定 SHA 候选；本次不修改 workflow 或发布脚本。
- Spec：与 `v0.1.8..d58a5ef` 的实际 diff、Unreleased 和关联任务交叉核对，版本说明覆盖本次新增及修复，没有纳入未提交内容。
- 完整前端质量检查、Rust 检查与三平台测试、安装启动 smoke 由同 SHA 候选执行。
- 发布准备验证：`npm run version:check -- v0.1.9`、相关 Markdown 的 Prettier 检查、`git diff --check` 通过；新增记录和版本说明隐私扫描无匹配。
- 尚未执行 macOS、Windows、Linux 干净用户环境中的完整交互、主题、文字缩放、键盘交互、卸载及真实远端备份恢复验收。三平台 CI 安装启动 smoke 全部通过；本机另验 macOS CLI 版本与包内架构，未另验 Windows/Linux CLI 版本。

## 发布证据

- **发布 SHA**：`d58a5efbfae5a4afba2936eb539960aee4540596`。
- **候选**：https://github.com/JTBlink/agent-hub/actions/runs/38717437532 （workflow_dispatch）。
- **质量门禁**：候选中的前端格式、lint、测试、构建及 Rust fmt、Clippy、测试全部通过；三平台核心测试、安装与启动 smoke 以及汇总校验全部成功。
- **签名配置预检**：仓库未配置 `ENABLE_APPLE_SIGNING` / `ENABLE_WINDOWS_SIGNING`，正式运行确认 Apple 签名、公证及 Windows Authenticode 均未启用；macOS unsigned 报告成功。

- **Tag 对象**：`b68b129072c7cfce681230ab6c0bac8aa6b52ff8`，解引用为发布 SHA；本地、远端一致，创建前确认无 tag 或 Release 冲突。
- **就绪检查**：固定发布 worktree 中 `npm run version:check -- v0.1.9`、`npm run release:ready -- v0.1.9` 通过。
- **正式构建**：https://github.com/JTBlink/agent-hub/actions/runs/38721103938 （push，`v0.1.9`，固定发布 SHA）。
- **官网部署**：https://github.com/JTBlink/agent-hub/actions/runs/38721103680 （push，同一发布 SHA）。
- **官网验收**：部署成功；线上主页及帮助中心显示 0.1.9，中文更新日志包含本次刷新和加载修复；主页样式、脚本、品牌图标、两张截图、五个 Agent 图标、文档样式与脚本及中文文档页面共 14 个目标均 HTTP 200。
- **正式平台结果**：Windows x86_64、Linux x86_64、macOS Universal 核心测试、安装包构建与安装启动 smoke 全部成功；正式汇总及发布 job 成功。

- **Release**：https://github.com/JTBlink/agent-hub/releases/tag/v0.1.9 ，非草稿、非预发布；targetCommitish 与发布 SHA 一致。
- **附件校验**：四种安装包 `.exe`、`.dmg`、`.AppImage`、`.deb`，以及 `CHANGELOG.md`、`PLATFORM_SUPPORT.md`、`RELEASE_NOTES.md`、`SHA256SUMS` 共 8 个附件全部下载；逐一匹配 GitHub 记录的文件大小和 SHA256。网络 TLS 临时错误仅补下载失败分段，合并后全部摘要验证通过。
- **发布校验**：固定发布 SHA 的检出中 `npm run release:verify -- <download-directory>` 通过，结果为 4 installers / 7 checksummed files；`SHA256SUMS` 自身的 GitHub SHA256 为 `abd87480af2c8b5361650251d5d1643617c49688ed0c643f3014e778c5b9ab20`。
- **说明溯源**：下载的 CHANGELOG、平台说明与发布 SHA 的源文件逐字一致；按该版本章节生成的说明与附件 `RELEASE_NOTES.md` 及 Release 正文一致。
- **macOS 包检查**：DMG 只读挂载成功；应用版本 0.1.9，应用与内置 CLI 均包含 `x86_64 arm64`，本机 CLI 输出 `agent-hub-cli 0.1.9`。应用为 ad-hoc 签名、无 TeamIdentifier，未使用生产证书或公证。检查后已卸载镜像。
- **清理**：确认发布检出为固定 SHA、无未提交或被忽略文件、无进程占用后，已从主仓库移除 `../agent-hub-release`；本次下载及分段临时目录均已清理。
