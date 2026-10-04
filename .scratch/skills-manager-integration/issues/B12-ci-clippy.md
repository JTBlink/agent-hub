# B12：适配 CI 的新版 Clippy

Type: task
Status: resolved
Blocked by: B11

## 目标

修复远程 Rust 1.99 严格 Clippy 对多余闭包借用的检查失败。

## Result

app_state 的路径重定位直接传入可复制闭包，移除不必要的引用，不改变路径计算或业务行为。

Standards/Spec 审查：仅调整检查器提示的位置，保留已有迁移逻辑与回归覆盖。验证：本地严格 Clippy、rustfmt、core::app_state 测试通过；推送后由远程新版工具链再次验证。
