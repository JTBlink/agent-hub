# B30：认证失败停止同步与准确提示

Type: bug
Status: resolved
Blocked by: none

## Scope

修复 HTTPS 认证失败后仍继续 push 的重复请求，手动与自动备份都先保留本地提交再报告失败。仅远端分支缺失允许首次推送，推送重试只用于并发更新造成的非快进冲突。

区分 HTTPS 凭证被拒绝、SSH 密钥失败、未取得凭证、凭据存储错误及本地文件权限问题。GitHub 重新连接入口复用同一分类。

## Acceptance

- 本地 HTTP 401 服务驱动真实同步链路，验证失败 fetch 后不再请求 push、本地修改已提交。
- 首次推送新分支及已有双向同步兼容；前端提示分类回归通过。
- 不打印令牌，不把真实仓库或设备信息写入 fixture；失效凭证须由账号持有人重新授权。

## Evidence

修复前 `cargo test --manifest-path src-tauri/Cargo.toml rejected_fetch_stops_before_push` 失败：收到 401 后仍出现 `git-receive-pack` 请求。修复后相同测试通过，本地提交保留。`npx vitest run src/lib/gitErrors.test.ts` 修复前 2 项失败，修复后通过。

## Review

- Standards：同步事务独立模块，错误判断复用纯函数，真实网络流程使用临时库和本地服务验证。
- Spec：不将 token 失效宣称为已修复；程序修复可提交，真实远端的成功备份仍依赖重新授权。

## Result

修复手动和后台同步在 fetch 失败后继续推送的行为；本地修改先提交，远端失败如实返回。缺失远端分支仍可首次推送，非快进冲突保留重试，认证和分支保护错误不重复尝试。前端按 HTTPS、SSH、凭据缺失、凭据存储和本地权限分别提示。

隔离的待提交快照验证通过：`cargo test --manifest-path src-tauri/Cargo.toml`（589 个库测试、6 个 CLI 测试通过，8 个已有测试忽略）；`npm run test`（61 项）；`npm run build`；`npm run lint`；Rust 格式检查和严格 Clippy。401 回归另连续重复 3 次通过。HTTP 测试服务等待读取完整请求头再响应，避免并发负载下截断请求造成测试波动。

实机只读凭据校验得到 HTTP 401，未输出凭据、未向真实备份远端写入。代码修复不使失效令牌重新有效；账号重新授权仍需用户完成。
