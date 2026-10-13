Type: bug
Status: claimed
Blocked by: none

# Windows 候选认证拒绝测试偶发 TCP reset

## Evidence

- 候选 38335089320，源码 af5718a；Windows job 115094057075 的 core tests 失败。
- rejected_fetch_stops_before_push_and_keeps_local_commit 预期认证失败，实际收到本地 HTTP fixture 的连接中止；测试服务应返回 401，不是 403。
- 新回归 authentication_fixture_delivers_challenge_without_resetting_request_body 在原关闭方式下稳定重现 ConnectionReset；未放宽原业务断言。

## Acceptance

- fixture 发完 401 后关闭写方向，再有限时地读取剩余请求，避免未读数据导致 TCP RST 丢弃响应。
- 回归验证完整认证拒绝响应；原认证失败不推送、本地提交保存以及首次推送测试继续通过。
- 仅修改测试服务，记录在 0.1.6 CHANGELOG；Rust 格式 / 严格 Clippy / 相关测试及新 SHA 三平台候选通过。

## Comments

- 发布仍为 0.1.6，尚未创建 tag；此修复需要新 SHA 候选，不能使用此前成功源码的证据。

## Local result

- 保留原 401 challenge 及认证失败、禁止推送、本地提交保存的断言；提取 test-only fixture，使响应后写方向 FIN 与限时读取完成再释放连接。
- 新回归在旧关闭方式下失败（ConnectionReset），修复后与原同步用例共 3 项通过；全量 Rust 705 项通过、8 项按既有配置忽略。
- cargo fmt 全仓检查、全目标严格 Clippy、版本检查、Markdown 格式与 git diff --check 通过。
- Standards：只调整 cfg(test) 服务、请求日志只保留首行，不记录 Authorization；Spec：认证拒绝响应完整传递，原同步安全语义仍由已有用例验证。Windows 修复回验等待新候选。
