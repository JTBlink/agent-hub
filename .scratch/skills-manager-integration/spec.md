# 主应用整合规格

当前以 [B10](issues/B10-primary-application.md)、[B28](issues/B28-shared-skills-library.md) 和 [ADR-0009](../../docs/adr/0009-shared-skills-library.md) 为准。

- Skills Manager 的前端与 Rust 核心成为唯一应用，根目录只保留一套依赖和构建入口。
- 对外名称 agent-hub；保留原 Logo、图标、主题与色调。
- 技能内容默认位于 `~/.agents/skills`，数据库、配置、日志与 CLI 仍使用 `~/.agent-hub`；共享目录内 Skills 原地登记，旧默认库无覆盖合并，已有自定义库保持兼容。
- CLI、凭据服务、缓存和同步元数据使用新命名空间；不自动迁入旧库。
- 删除旧宿主代码、嵌套工程和过时文档，保留原许可证及导入清单。
- 完成本地构建、核心测试和桌面启动验证后提交，再继续迭代。

## 工程规范与旧逻辑盘点

新增独立的开发规范，覆盖 SOLID、模块复用、前后端契约、迁移与验证，并接入 `AGENTS.md` 和文档导航。基于当前调用关系记录旧逻辑清理候选，修正过时的工程文档；本轮不删除尚未验证兼容性的运行逻辑。执行记录见 [B13](issues/B13-development-standards.md)。

## 技能组命名与 GitHub 授权

中文界面将 Preset 称为技能组，英文界面称为 Skill Group，区分组内成员编辑和工作空间批量部署，内部命名与持久化保持兼容。GitHub 备份默认提供设备授权登录，使用本项目独立注册的 agent-hub OAuth App，保留个人访问令牌入口与系统钥匙串凭证存储。执行记录见 [B14](issues/B14-skill-group-naming.md) 与 [B15](issues/B15-github-oauth-branding.md)。

## 本地 Skills 管理

现有本地扫描入口同时提供导入和按安装位置管理能力，支持内容查看、打开目录、按名称、路径与适用 Agent 搜索和确认删除。使用扫描记录标识定位副本，后端校验当前目录边界、内容版本及部署归属；删除软链接时保留目标。已托管部署仍由 Agent 工作区管理。相同完整路径合并展示并同时统计 Skill 数和去重目录数，每个目录下方直接展示适用 Agent 标签，提示说明不代表已安装；同一 Skill 的其他来源目录默认折叠，保留独立路径与不同内容版本；共享 `~/.agents/skills` 存在时优先展示，否则回退到其他来源；软链接目录显示链接指示图标。执行记录见 [B16](issues/B16-local-skills-management.md) 与 [B27](issues/B27-local-directory-display.md)。

## 扫描性能与 Agent 检测

一次扫描中复用同一实际目录的完整指纹，ARM64 使用兼容的 SHA-2 硬件检测加速。Agent 安装证据是可执行文件、桌面应用或宿主已安装的 IDE 扩展；配置、历史、Skills 目录和手动路径不代表已安装，首页统计已检测且启用的 Agent；这些独立 Skill 目录仍可发现。执行记录见 [B17](issues/B17-local-scan-performance.md) 与 [B18](issues/B18-agent-detection.md)。

## 历史基线

最初导入源提交为 `def946d78ef4c739b0ba429e38ac509b8660ec34`，309 个跟踪文件。完整导入、独立入口和元数据清理已于 `4debf00` 提交，见 B00、B08、B09 及[来源清单](../../docs/reference/skills-manager/source-manifest.json)。这些阶段的原样保留及双窗口约束已由用户后续要求替代。

旧 V1 规格、原型以及 D01、B01–B07 旧候选任务已删除。后续统一基于现有 Skills Manager 实现，规划见 docs/plans/agent-hub.md。

本地管理支持按 Agent 预览并清理未安装 Agent 的遗留 Skills 与空目录，保留共享安装、手动目标和其他配置；执行前复查。默认库移除 `library/` 层级，旧默认库在排他租约下无覆盖迁移并重写路径。首页 Agent 卡片进入设置的 Agent 区域。

GitHub 备份使用实际技能根，迁移保留历史与远端，排除应用运行状态。克隆先下载再替换，完整旧库留作恢复副本，本地独有条目带入新库；历史快照保留安全点。执行记录见 [B28](issues/B28-shared-skills-library.md)。
