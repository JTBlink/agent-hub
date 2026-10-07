# B26：保持安装探测在 Linux 严格检查下可编译

Type: task
Status: resolved
Blocked by: none

## Scope

跨平台审查发现桌面应用搜索列表只在 macOS/Windows 分支修改，Linux 的 mut 绑定会触发严格编译警告；按目标平台声明，保留原探测行为。

## Acceptance

- Rust 格式、安装检测回归与严格 Clippy 通过。
- 提交推送并交由 Linux CI 验证目标平台。

## Result

桌面应用搜索列表按平台声明，仅 macOS/Windows 使用可变绑定，Linux 使用不可变绑定。没有禁用编译警告，安装探测行为保持原样。

验证：安装探测 4 项测试、Rust 格式和严格 Clippy 通过；整仓 Prettier、版本及任务索引检查通过。Linux 目标交由远端 CI 验证，不把本机 macOS 检查当作 Linux 实测。

## Review

- Standards：使用明确的平台条件，不引入 allow 警告或额外探测路径。
- Spec：移除 Linux 下不可避免的 unused_mut 严格编译失败，保留安装口径。
