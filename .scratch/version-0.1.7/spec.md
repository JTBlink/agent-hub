# 0.1.7 发布

用户明确授权提交并正式发布。远端最新稳定版为 v0.1.6，当前 VERSION 为 0.1.6，自动选版脚本按默认 patch 选择 0.1.7。

发布范围为 main 中 v0.1.6 之后已提交的变更，以及本次版本同步、更新说明和发布 tracker。工作区初始干净，main 与 origin/main 一致。以已公开且为当前源码祖先的 v0.1.6 为 changelog 基线；补齐遗漏条目并保留 Unreleased。

在固定 detached worktree `../agent-hub-release` 验证同 SHA 三平台候选，成功后创建并精确推送 annotated v0.1.7。完成正式构建、官网部署、Release 全部附件校验后回写证据；失败续发保持同一版本，列出未完成的原生验收。
