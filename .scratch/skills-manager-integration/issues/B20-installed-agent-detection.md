# B20：仅把本机已安装的 Agent 判为有效

Type: task
Status: claimed
Blocked by: none

## Scope

已安装状态必须基于可执行程序、桌面应用或宿主已安装的 IDE 扩展，目录状态和 Skills 路径不能单独作为安装证据。首页及状态 DTO 使用统一判断，保留只读 Skills 发现。

## Acceptance

- 增加相关回归测试，更新产品说明和 CHANGELOG。
- 构建、测试、格式、lint 和严格 Clippy 检查通过。
