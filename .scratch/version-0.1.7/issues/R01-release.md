Type: task
Status: resolved
Blocked by: none

# 提交并发布 0.1.7

## Acceptance

- 六个版本文件同步为 0.1.7，changelog 与实际发布范围一致。
- 同 SHA 候选质量检查、三平台 core tests、安装启动 smoke 和汇总全部通过。
- 在候选验证后精确推送 annotated tag，正式安装包和官网部署成功。
- Release 全部附件校验通过，记录签名状态、源码 SHA 和原生验收边界，安全清理本次临时目录。

## Selection

- 自动选版：`node .agents/skills/github-cli/scripts/select-release-version.mjs --remote origin`。
- 当前 VERSION：0.1.6；远端最新正式版：v0.1.6；reason：patch；目标版本：0.1.7。
- 发布基线：v0.1.6，解引用源码 18786b5f37486debc9f3d79f78ac124c08c9ad8f，已公开且是当前 main 祖先。
- 准备前 main 为 0d22a6f499b2c08a0aa1163eaf29615f1f4ada16，与 origin/main 一致，工作区干净。

## Preparation

- 将已提交的 Unreleased 条目归档至 0.1.7，补齐技能改名、推荐安装、最近访问排序、帮助返回和公开技能分类入口；纯格式与历史发布验收不另列功能条目。
- 发布源码、验证结果及运行链接在验收后补充。
- 发布前格式检查发现已提交的 Help.tsx 导入语句格式不符合 Prettier，按报告仅调整该文件格式，纳入本次发布提交；无行为变更。
- `version:check -- v0.1.7`、`docs:check`、`tasks:check` 通过；六个版本文件 diff、tracker 引用和隐私检查通过。完整前端和 Rust 门禁由同 SHA 三平台候选执行。

## Comments

- Standards：版本来自 VERSION，发布范围与祖先正式 tag 核对，保持 main 单线，候选与 tag 使用同一 SHA。
- Spec：按用户授权连续完成提交、候选、正式发布与附件验收；不把仅有 tag 或候选当作完成。

## Verified source and runs

- 准备提交已推送 main；固定发布源码：b83db4b75f4c9e65dc2b6917810f3289a025166a。
- 发布检出：干净 detached worktree `../agent-hub-release`，无未跟踪或被忽略文件，版本校验通过。
- [候选 38429130063](https://github.com/JTBlink/agent-hub/actions/runs/38429130063) 使用同一固定 SHA，全部成功：前端和 Rust 全部质量门禁、三平台核心测试、安装启动 smoke 及汇总校验。干净发布检出中 `release:ready -- v0.1.7` 通过。
- 仓库签名变量未开启；正式构建按当前规范使用未签名包。
- 本段是发布过程证据回写，不属于安装包源码修复；tag 保持候选对应的固定 SHA。
- annotated tag v0.1.7 已精确推送；tag 对象 732bfe9734fbcbb211c6d18993118b365092e312，远端解引用源码与发布 SHA 一致。创建前本地、远端 tag 与对应 Release 均不存在。
- [正式安装包 38432046786](https://github.com/JTBlink/agent-hub/actions/runs/38432046786) 和 [官网部署 38432046267](https://github.com/JTBlink/agent-hub/actions/runs/38432046267) 均成功，使用同一发布 SHA。正式三平台核心测试和安装启动 smoke、汇总校验、Release 上传全部成功。
- 官网部署已成功。线上主页显示 0.1.7，帮助、更新日志、截图、图标、脚本和样式共 12 个链接均返回 HTTP 200，线上更新日志含 0.1.7；未单独进行真实浏览器渲染验收。

## Release acceptance

- [正式 Release v0.1.7](https://github.com/JTBlink/agent-hub/releases/tag/v0.1.7) 已公开，非草稿、非预发布，目标源码与 tag 解引用 SHA 一致，包含预期的 8 个附件。
- 已下载全部 8 个附件，在固定发布源码的隔离检出执行 `release:verify` 通过：AppImage、deb、macOS universal dmg、Windows x64 setup 四种安装包完整，7 个文件的 SHA256SUMS 全部通过。
- 另逐一核对全部 8 个附件的 GitHub 元数据大小和 SHA-256，全部一致；CHANGELOG 与平台说明逐字节等于发布源码，RELEASE_NOTES 等于 0.1.7 章节和平台说明组合，公开 Release 正文与附件发布说明一致。
- 正式签名与 macOS 公证开关未开启，对应配置和签名检查被跳过；macOS 未签名报告步骤成功。三平台原生测试与安装 smoke 通过，未另行完成三平台干净用户环境的完整 GUI、卸载、真实远端备份与恢复验收。

## Cleanup and final review

- 验收后确认固定 detached worktree 干净、无被忽略文件、无进程占用，发布源码已包含于 origin/main；从主仓库普通 `git worktree remove` 成功，临时附件目录与验收脚本已清理。
- Standards：版本、源码 SHA、annotated tag 和候选 / 正式运行一致，未改写 main 或移动 tag；全部附件与对应源码及 GitHub 摘要一致。
- Spec：用户授权的提交、正式发布、官网部署和附件验收全部完成，已列出签名状态与未完成的原生验收边界。
- 本次仅补充发布证据和任务状态，无用户可见行为、兼容性或发布流程变化，无需追加 changelog 条目。
