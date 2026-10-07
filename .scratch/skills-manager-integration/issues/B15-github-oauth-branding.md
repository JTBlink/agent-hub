# B15：恢复 GitHub 登录并使用 AgentHub 授权应用

Type: task
Status: claimed
Blocked by: none

## Scope

使用本项目独立注册的 agent-hub OAuth App，开启 Device Flow，将前端授权管理链接和 Rust 设备授权请求切换到同一个公共 Client ID。默认展示 GitHub 登录，保留 PAT 入口和系统钥匙串存储。

## Acceptance

- GitHub 应用名称为 agent-hub，Device Flow 已开启，回调地址采用固定项目主页。
- 前端与 Rust 均使用新应用的 Client ID，不再使用上游授权应用。
- 添加跨端 Client ID 一致性的回归测试，验证设备码接口可用。
- 前端构建、lint、测试和 Rust 测试、格式、Clippy 通过。
- CHANGELOG 记录用户可见变化，完成 Standards 与 Spec 两轴审查。

## Comments

接管此前因模型调用失败中断的会话。用户已授权注册应用、自行填写素材并在修复后生成本地提交。
