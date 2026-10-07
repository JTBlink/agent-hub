# B26：保持安装探测在 Linux 严格检查下可编译

Type: task
Status: claimed
Blocked by: none

## Scope

跨平台审查发现桌面应用搜索列表只在 macOS/Windows 分支修改，Linux 的 mut 绑定会触发严格编译警告；按目标平台声明，保留原探测行为。

## Acceptance

- Rust 格式、安装检测回归与严格 Clippy 通过。
- 提交推送并交由 Linux CI 验证目标平台。
