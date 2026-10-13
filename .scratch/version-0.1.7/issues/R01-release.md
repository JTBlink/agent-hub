Type: task
Status: claimed
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
