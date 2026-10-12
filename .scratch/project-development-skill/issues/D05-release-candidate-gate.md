# D05：三平台候选发布门禁与免费资源控制

Type: task
Status: claimed
Blocked by: D04

## Acceptance

- 干净发布提交和同一 SHA 的成功三平台候选是创建 tag 的前提，API 失败或不完整证据不放行。
- 各平台测试先于安装包编译；候选不能取消正式 tag 运行；不扩大存储额度或启用收费 Runner。
- github-cli Skill、发布流程、tracker 和 changelog 同步，验证后提交、push。

## Comments

- [格式失败](https://github.com/JTBlink/agent-hub/actions/runs/38209170183) 为全仓库 Prettier 未通过；[缺源码失败](https://github.com/JTBlink/agent-hub/actions/runs/38209446455) 为提交缺少 Rust `project_library/entries.rs`。
- [Windows 失败](https://github.com/JTBlink/agent-hub/actions/runs/38205999330) 为 Git 忽略路径测试失败，说明 Linux CI 不能覆盖原生 Windows 行为。
- 现有 v0.1.4 tag 指向 `09798e497f118f23407a8d0b8fe47770e7e6ea2d`；[当前打包](https://github.com/JTBlink/agent-hub/actions/runs/38209973645) 已重新启动，不移动 tag 或重复触发正在执行的正常构建。
- 仓库为 public，标准 Runner 运行分钟免费；缓存约 8.9 GiB，接近默认 10 GiB。官方资源依据和限制写入 release-prevention.md，不修改账户预算。

## Result

- github-cli 升级到 1.2.0，统一干净提交、三平台候选、保留既有 tag、有限重试和免费资源策略；新增只读 release:ready，tag preflight 校验同 SHA 的完整候选。
- 原生测试提前到安装包编译前，事件隔离并发组，Rust 缓存仅默认分支写入；标准 Runner、签名隔离、三平台及 smoke 保留。
- 本地全仓库 Prettier、ESLint、242 项测试、TypeScript / 前端生产构建通过；其中候选门禁和工作流合约 36 项通过。Skill quick_validate、版本和任务状态检查通过。
- 待提交 push 后完成远端三平台候选验证；本次没有 Rust 源码修改，本机检查不能代替远端原生结果。

## Review

- Standards：共享只读候选检查用于 CLI 和 tag preflight，Git / gh 使用参数数组，API 错误不放行；仅 preflight 增加 actions:read，不修改账户预算。
- Spec：门禁拒绝错 SHA、非候选事件、缺失平台、跳过测试和失败汇总；候选不会取消正式 tag，失败前移并减少 tag 缓存占用。
