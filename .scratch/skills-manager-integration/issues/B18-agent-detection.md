# B18：修正 Agent 接入数量误判

Type: task
Status: resolved
Blocked by: none

## Scope

Agent 仅有 Skills 目录时不能推断已安装；保留显式自定义路径配置的可用语义，首页使用已启用文案，本地扫描仍发现未检测到 Agent 的独立 Skills 目录。

## Acceptance

- 测试覆盖不存在、仅 Skills、包含 Agent 状态以及显式配置的目录。
- 不丢失仅 Skills 目录中的本地扫描结果。
- 更新三种语言、CHANGELOG、产品说明及验证记录。

## Result

- 原逻辑仅检查 Agent 目录是否存在。本机 36 个目录中，28 个只有 Skills，被误计为接入。
- 检测现在要求目录中存在 Skills 之外的 Agent 状态，排除系统目录元数据，支持嵌套目录及 macOS 配置目录候选；显式自定义路径仍按已配置可用处理。
- 首页三种语言改为“已启用 Agent”，只统计检测到且未禁用的条目；本机原生检测复测为 8。扫描目录来源数是不同口径，不会丢掉未检测 Agent 下的 Skills。
- 回归覆盖缺失根、仅 Skills、嵌套结构、配置状态和显式路径；完整 Rust 测试、前端构建/lint、fmt 和 Clippy 通过。

## Review

Standards：检测规则集中在单一小模块，适配器继续负责路径候选；无本机路径或账户数据写入 fixture。

Spec：修复“目录存在即接入”的误导，保留手动配置和本地发现。检测到 Agent 状态不代表正在运行或已建立网络连接，界面不再作该暗示。
