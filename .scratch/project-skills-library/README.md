# 项目技能库与团队协作

状态：首轮团队安装闭环已完成；后续增强仍在规划。

设计原文：[项目技能库与团队协作方案](../../docs/plans/agent-hub.md#项目技能库与团队协作方案)。

范围和状态：[spec.md](spec.md)。本目录只跟踪评审及后续执行，不复制规划正文。

团队友好性优化：[P02](issues/P02-friendly-team-sharing.md)，按 ADR-0011 将原生技能交付与可选 AgentHub 管理清单分开。

批量操作详情复制入口：[P03](issues/P03-copy-operation-details.md)，一次复制全部技能、Agent 和完整错误原因。

项目中央安装与已有技能兼容：[P04](issues/P04-project-central-install.md)，实际内容统一放在 `.agents/skills`，相对入口优先，复制模式可选。

## 当前结果

- 2026-10-12：基于当前 AgentHub 与本地 `skills` CLI 实现生成设计草案。
- 明确项目权威内容、来源清单、Agent 入口、共享可见性、更新冲突、恢复和迁移。
- 当前全局整库共享链接开关移除行为保持独立，不借项目方案恢复该入口。
- 2026-10-12：按用户明确的团队共用目标修订；补充全局/项目安装对比、无需 AgentHub 的成员消费流程、团队目标与个人偏好隔离、默认提交专属副本和最低交付验收。
- 用户已授权实施及提交、推送；首轮已接受 ADR-0010 并完成 [P01](issues/P01-team-project-install.md)。核心实现提交为 `2cbb524`，未发布版本。

## 验证与审查

- 方案阶段 Standards：设计集中于规划文档，跟踪文件仅记录范围及状态。
- Spec：默认流程覆盖“维护者安装并提交，新成员拉取即可使用”；跨平台副本与更新安全纳入最低交付。
- 方案阶段完成文档相对链接、代码块配对、个人路径及 diff 格式检查；实现阶段验证如下。
- 首轮实现已更新产品说明、架构与 CHANGELOG；最终验证和两轴审查见 P01 的 Result。

桌面目标选择：[P05](issues/P05-enabled-team-agents.md)，从已启用 Agent 中选择并统一可用状态判断。

项目批量启停：[P06](issues/P06-batch-enabled-agent-selection.md)，复用可用目标和统一状态判断。

Git 忽略误报：[B02](issues/B02-ignored-local-artifacts.md)，缓存与本机环境配置不计入技能交付警告，必要脚本及配置模板继续诊断。

共享信息层级：[P07](issues/P07-card-team-refresh.md)，顶部共享说明折叠为一行，技能刷新状态及操作下沉到卡片，需要处理的技能优先。

统一部署默认值与入口诊断：[P08](issues/P08-unified-deployment-mode.md)，新安装共用设置，已有入口保持原方式，并显示每个异常的具体原因。

旧入口移除：[B03](issues/B03-unrecorded-agent-removal.md)，修复中央技能已管理但旧 Agent 入口未登记时，点击图标提示成功却未移除的问题。

状态判断：[B04](issues/B04-clear-agent-skill-status.md)，未添加的灰色 Agent 不显示缺失提示，恢复仅处理已存在的入口。
