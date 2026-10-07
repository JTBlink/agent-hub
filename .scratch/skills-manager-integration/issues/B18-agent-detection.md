# B18：修正 Agent 接入数量误判

Type: task
Status: claimed
Blocked by: none

## Scope

Agent 仅有 Skills 目录时不能推断已安装；保留显式自定义路径配置的可用语义，首页使用已启用文案，本地扫描仍发现未检测到 Agent 的独立 Skills 目录。

## Acceptance

- 测试覆盖不存在、仅 Skills、包含 Agent 状态以及显式配置的目录。
- 不丢失仅 Skills 目录中的本地扫描结果。
- 更新三种语言、CHANGELOG、产品说明及验证记录。
