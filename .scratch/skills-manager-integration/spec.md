# 主应用整合规格

当前以 [B10](issues/B10-primary-application.md) 和 [ADR-0008](../../docs/adr/0008-primary-application.md) 为准。

- Skills Manager 的前端与 Rust 核心成为唯一应用，根目录只保留一套依赖和构建入口。
- 对外名称 agent-hub；保留原 Logo、图标、主题与色调。
- 默认数据归于 `~/.agent-hub`，库位于其 `library/` 子目录，配置、日志与 CLI 使用固定目录，避免库移动影响应用身份。
- CLI、凭据服务、缓存和同步元数据使用新命名空间；不自动迁入旧库。
- 删除旧宿主代码、嵌套工程和过时文档，保留原许可证及导入清单。
- 完成本地构建、核心测试和桌面启动验证后提交，再继续迭代。

## 工程规范与旧逻辑盘点

新增独立的开发规范，覆盖 SOLID、模块复用、前后端契约、迁移与验证，并接入 `AGENTS.md` 和文档导航。基于当前调用关系记录旧逻辑清理候选，修正过时的工程文档；本轮不删除尚未验证兼容性的运行逻辑。执行记录见 [B13](issues/B13-development-standards.md)。

## 技能组命名与 GitHub 授权

中文界面将 Preset 称为技能组，区分组内成员编辑和工作空间批量部署，内部命名与持久化保持兼容。GitHub 备份默认提供设备授权登录，使用本项目独立注册的 agent-hub OAuth App，保留个人访问令牌入口与系统钥匙串凭证存储。执行记录见 [B14](issues/B14-skill-group-naming.md) 与 [B15](issues/B15-github-oauth-branding.md)。

## 本地 Skills 管理

现有本地扫描入口同时提供导入和按安装位置管理能力，支持内容查看、打开目录、搜索、Agent 筛选和确认删除。使用扫描记录标识定位副本，后端校验当前目录边界、内容版本及部署归属；删除软链接时保留目标。已托管部署仍由 Agent 工作区管理。执行记录见 [B16](issues/B16-local-skills-management.md)。

## 历史基线

最初导入源提交为 `def946d78ef4c739b0ba429e38ac509b8660ec34`，309 个跟踪文件。完整导入、独立入口和元数据清理已于 `4debf00` 提交，见 B00、B08、B09 及[来源清单](../../docs/reference/skills-manager/source-manifest.json)。这些阶段的原样保留及双窗口约束已由用户后续要求替代。

旧 V1 规格、原型以及 D01、B01–B07 旧候选任务已删除。后续统一基于现有 Skills Manager 实现，规划见 docs/plans/agent-hub.md。
