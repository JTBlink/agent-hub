# B15：恢复 GitHub 登录并使用 AgentHub 授权应用

Type: task
Status: resolved
Blocked by: none

## Scope

使用本项目独立注册的 agent-hub OAuth App，开启 Device Flow，将前端授权管理链接和 Rust 设备授权请求切换到同一个公共 Client ID。默认展示 GitHub 登录，保留 PAT 入口和系统钥匙串存储。

## Acceptance

- GitHub 应用名称为 agent-hub，Device Flow 已开启，回调地址采用固定项目主页。
- 更新应用介绍与项目品牌图标，并在重新打开设置页后验证持久化。
- 前端与 Rust 均使用新应用的 Client ID，不再使用上游授权应用。
- 添加跨端 Client ID 一致性的回归测试，验证设备码接口可用。
- 前端构建、lint、测试和 Rust 测试、格式、Clippy 通过。
- CHANGELOG 记录用户可见变化，完成 Standards 与 Spec 两轴审查。
- 在 docs 中记录完整注册、网页维护、代码同步和验证流程。

## Comments

接管此前因模型调用失败中断的会话。用户已授权注册应用、自行填写素材并在修复后生成本地提交。

## Result

- 使用 browser-use 更新 GitHub 应用介绍与 256×256 项目品牌图标，确认裁切和保存；重新打开设置页验证名称、介绍、图标、Device Flow 与固定回调配置。
- 前端与 Rust 切换到本项目的公共 Client ID，默认提供 GitHub 登录并保留 PAT 入口；新增跨端 OAuth 应用一致性的 Rust 回归测试。
- 新 Client ID 的设备码请求返回 HTTP 200，包含有效设备码、用户码、验证地址、有效期和轮询间隔；未输出代码值或令牌。
- 完整操作流程见 [GitHub OAuth App 配置与维护](../../../docs/development/github-oauth-setup.md)，同步产品文档、导航、规格和 CHANGELOG。
- 验证：前端构建、lint、50 个测试通过；Rust 541 个库测试与 6 个 CLI 测试通过，7 个依赖网络 fixture 的测试按默认设置忽略；Rust 格式和严格 Clippy 通过。
- Standards 审查：沿用现有设备授权、PAT 与钥匙串边界，公开 Client ID 不属于凭证；未引入 Client Secret 或新存储方式。
- Spec 审查：GitHub 网页品牌、代码公共标识、默认登录入口与操作文档一致。
- 验证边界：本次未重新启动桌面应用执行完整授权、钥匙串与备份创建验收；已有运行进程需要重建后才能使用新的 Rust 常量。旧应用授权可在 GitHub 中单独撤销。
