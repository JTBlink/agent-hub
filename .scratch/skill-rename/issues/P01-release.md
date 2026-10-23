Type: task
Status: resolved
Blocked by: none

# 发布改名流程与仓库同步优化

目标版本：0.1.10。远端原最新稳定 tag 为 v0.1.9，按项目脚本默认升级 patch，失败续发沿用同一版本。

范围：v0.1.9 后 main 已提交变更、[R01](R01-in-place-rename.md) 原地改名与来源清理，以及 [V01](../../git-repository-version-hints/issues/V01-version-hints.md)、[V02](../../git-repository-version-hints/issues/V02-sync-to-repository.md) 仓库版本、写回与状态刷新。其他来源更新策略的既有未提交内容保留；本次只复用其共享版本比较模块。

## Result

- 正式版本：[v0.1.10 Release](https://github.com/JTBlink/agent-hub/releases/tag/v0.1.10)，非草稿、非预发布，已成为 latest。
- 固定源码：`d7c9ad95a1c1946a71788f4bf5c036240a01d587`。Annotated tag 对象：`09c15bfda48559bd9640d3f56b0abd410f03204d`，远端 tag 解引用与 Release targetCommitish 均指向该源码。
- 候选：[39943039233](https://github.com/JTBlink/agent-hub/actions/runs/39943039233)，质量检查、三平台核心测试、安装启动 smoke、上传及汇总校验全部成功；干净检出的 `release:ready` 验证通过后才创建 tag。
- 正式安装包：[39947258288](https://github.com/JTBlink/agent-hub/actions/runs/39947258288)，三平台全部成功并创建 Release。
- 官网：[39947258298](https://github.com/JTBlink/agent-hub/actions/runs/39947258298) 成功。[主页](https://jtblink.github.io/agent-hub/) 显示 0.1.10；[技能库文档](https://jtblink.github.io/agent-hub/docs/zh/skill-library.html) 含新版写回说明，主页与文档引用的 14 个静态资源均返回 200。
- 附件：下载全部 8 项，`release:verify` 通过，4 种安装格式和 7 个有校验和的文件完整。CHANGELOG、PLATFORM_SUPPORT 与固定源码逐字一致；Release 正文与下载的 RELEASE_NOTES 一致。
- 本机干净源码检查：前端 558 项、Rust 744 项及 CLI 8 项通过；8 项既有测试忽略。Lint、TypeScript/构建、全仓库 Prettier、Rust 格式、严格 Clippy 通过。首次 Rust 全量在缓存清理 fixture 二次取锁时出现一次临时占用；同源码完整重跑成功，三平台候选和正式测试也通过，未降低断言或修改产品缓存逻辑。
- 来源清理复核：两条旧中转来源关联已解除，中心内容保留，旧中转目录不存在，8 项部署均可访问；历史编辑快照保留。
- 签名开关未启用，本次为未签名安装包。已做原生 Runner 自动安装与启动 smoke；未执行三平台干净用户环境下的手动主题、缩放、键盘与卸载验收。
- 默认发布目录 `../agent-hub-release` 已被另一独立仓库占用，保留原目录；本次候选、tag、附件验收共用固定替代目录 `../agent-hub-release-v0.1.10`。完成验收后清理本次 worktree 和附件临时目录，主工作区其他任务内容保留。

## Comments

- 早期候选：39931041150、39932610679 因追加修正取消；39931299784、39931521517 因文档搜索组件可选 React 依赖锁定缺失失败，已按 npm 10 补齐并完成干净安装验证。
- 39933034144 暴露构建指纹 fixture 目录时间边界误判；固定测试时间，不改变生产近期写入保护。39933908252 为成功预热候选，未用于最终 tag 门禁。
- 39939778071 的 Windows 认证 fixture 在非阻塞连接读取时出现 WouldBlock；本机先复现，再将测试连接设为阻塞，3 项同步事务回归及最终 Windows CI 通过。产品备份行为未改。
- 已发布 main 中的 a9d2ee0 使用了项目枚举以外的 style 类型；保持已发布历史，后续提交按固定类型执行。
- Standards：共享路径、目录解析、版本比较和部署逻辑，后端校验覆盖方向及确认快照，保留无关工作内容。Spec：原地改名保留身份，旧仓库可确认写回新版，刷新与同步后详情更新，正式发布与完整附件验收已完成。
