Type: task
Status: claimed
Blocked by: none

# 保持 0.1.4 并处理发布失败

## Scope

用户明确要求先解决 0.1.4 发布问题，再考虑升级。所有版本配置保持 0.1.4，不将尚未完成的其他功能混入候选，不跳过三平台质量、安装 smoke 和产物校验。

## Acceptance

- VERSION 与前端、Rust、Tauri 和锁文件保持 0.1.4。
- 明确实际失败 SHA 和首个失败点，避免重跑不包含修复的旧源码。
- 已运行的候选继续跟踪，不重复触发或取消正常构建。
- 只有同一 SHA 的质量、Windows/macOS/Linux 测试、安装包 smoke 和汇总校验通过，才认为候选可发布。
- 版本 tag、发布源码与产物一致；没有正式 Release 及完整附件时不能报告发布成功。

## Comments

- `npm run version:check -- v0.1.4` 通过，先前 0.1.5 准备修改已恢复。现有远端 `v0.1.4` 指向 `5e6a7d9f4e656a4e909ca7ade334780021950b8b`，GitHub 尚无该版本 Release。
- [tag 发布失败](https://github.com/JTBlink/agent-hub/actions/runs/38214566746) 在候选前置检查失败，缺少同 SHA 的成功三平台候选。
- [旧候选](https://github.com/JTBlink/agent-hub/actions/runs/38214635255) 的 Windows 测试实际失败：项目路径拼接产生 InvalidFilename，以及 Git checkout 的 CRLF/LF 文本比较差异。两处已在 `3944415` 修正；该候选随后被取消，旧 SHA 不能通过盲目重跑得到修复。
- [3944415 候选](https://github.com/JTBlink/agent-hub/actions/runs/38217104466) 因卡片状态文案与测试快照不同失败，`b747bcb` 已完成修订及回归。
- 正在跟踪 [当前候选](https://github.com/JTBlink/agent-hub/actions/runs/38219181451)，固定 SHA `78a6ea3daf4d17a8ccc49a1b64df3683f6687906`，版本仍为 0.1.4。质量检查已通过，原生三平台验证进行中。工作区其他未提交功能保持独立。

## Result

待候选验证及发布恢复完成后填写，不提前宣布成功。
