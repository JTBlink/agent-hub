# 更新日志

本文件记录 AgentHub 的重大产品、架构和兼容性变更。格式参考 [Keep a Changelog](https://keepachangelog.com/)，尚未发布的内容统一放在 `Unreleased`。

## [Unreleased]

### 产品定位

- 明确 AgentHub 第一版以配置中心为核心：统一管理 Claude Code、Codex 和 OpenCode 的全局配置与工作空间配置。
- 规划配置文件发现、结构化/源码编辑、校验、Diff、自动备份和回滚能力。
- 规划全局及工作空间 Skills 的可视化盘点和生命周期管理。
- 重构桌面端为“本地 Agent 控制台”：增加三 Agent 连接拓扑、配置中心、Skills 盘点、工作空间、诊断中心、变更历史和设置导航。
- 配置编辑采用渐进式安全流程：默认遮罩只读，明确加载原文后生成 Diff，再确认写入并自动备份。
- 统一桌面与窄屏界面规范：全局搜索可筛选当前页面，Skills 筛选改为真实控件，并补充扫描反馈、44px 操作目标、移动端文字导航和无障碍状态语义。
- 总览视觉统一为桌面图标的深海军蓝与蓝紫—青绿能量流；连接拓扑增加状态驱动的轨道流动、Hub 呼吸和节点脉冲，并支持减少动态效果。
- 重构总览为状态优先的本机控制台：按工作区健康、Agent 拓扑、关键指标和安全写入操作组织，并让主操作随诊断状态变化。

### Skills 来源

- 纳入 skills.sh 生态和标准 Marketplace manifest 支持范围。
- 纳入 Anthropic 官方 [`anthropics/skills`](https://github.com/anthropics/skills) 预置仓库。
- 纳入 [`mattpocock/skills`](https://github.com/mattpocock/skills)、[`obra/superpowers`](https://github.com/obra/superpowers) 和 [`affaan-m/ECC`](https://github.com/affaan-m/ECC) 预置仓库。
- 规划自定义 Git 仓库链接，支持指定分支、tag、commit 和 Skill 子目录。
- 规划本地仓库目录来源，支持只读扫描、子目录选择和基于 commit/校验和的更新检测。
- 规定安装前展示来源、版本和文件清单，不自动执行仓库脚本或 hooks。

### 架构与工程

- 确定第一版技术栈：Tauri 2、React、TypeScript、Rust 和 SQLite。
- 增加产品、架构、数据模型、集成、ADR 和开发指南文档目录。
- 初始化可运行的 Tauri 2 + React 工程骨架，并加入前端到 Rust 的命令调用示例。
- 增加 GitHub Actions 跨平台 CI/CD：支持手动构建 Actions artifacts，以及 `v*` tag 自动生成 Windows、macOS、Linux 安装包和 GitHub Release。
- 增加 `npm run version:set` 和 `npm run version:check`，统一维护并校验发布版本号。
- 手动和 tag 构建均生成包含全平台安装包、SHA-256 校验和、变更日志与平台支持矩阵的汇总产物。
- 发布门禁同时校验 npm、Cargo 锁文件与应用 manifests 的版本一致性。
- 增加 workflow contract 测试，锁定手动/tag 触发、三平台格式、汇总 artifact 和 Release 权限边界。
- Apple 签名改为 `ENABLE_APPLE_SIGNING` 仓库变量显式开启，手动构建不会读取生产签名 Secrets。
- 增加可选 Windows Authenticode 签名：`ENABLE_WINDOWS_SIGNING` 开启后由 tag workflow 使用 PFX Secrets 和 `signtool.exe` 签署 `.exe`/`.msi`。
- 收紧发布事件边界：只有 `v*` tag push 可以读取签名 Secrets 和创建 Release，手动选择 tag 仍只生成无签名 artifact。
- 手动构建先锁定不可变 commit SHA；汇总阶段扁平化安装包并生成可直接校验 Release 附件的 `SHA256SUMS`。
- 增加 `release:verify` 自动验收命令；工作流发布前校验五种安装格式、发布元数据、路径安全和所有 SHA-256，篡改或缺失文件会阻止发布。
- 落地 SQLite migration 0001、应用数据目录诊断、配置/Skill 元数据仓储和事务回滚测试；数据库不保存配置正文或凭据。
- 增加统一结构化日志封装，输出到标准输出和平台应用日志目录；事件字段使用固定枚举，禁止记录配置正文、凭据和真实数据库路径。
- 增加 `agent-hub.sh` 统一入口，支持 `dev`、`build`、`release`、`test`、`lint` 子命令，替代原 `start.sh` 与 `build.sh`。
- 将领域有限值替换为 Rust `enum`，持久化拆为职责单一的子模块，migration 改为顺序注册表，并让 Tauri command 依赖 repository trait。
- 确定 Skill 来源、Skill 快照、安装实例、Agent 兼容性和安装计划的领域模型，并记录 ADR-0002。
- 确定配置文件格式感知最小 patch、checksum 乐观锁、原子替换、备份回滚和敏感数据策略，并记录 ADR-0003。
- 确定 Agent 官方作用域优先级、canonical workspace 身份和 Skill 多来源冲突规则，并记录 ADR-0004。
- 完成配置中心与 Skills 中心三变体交互原型，确定工作台入口和统一变更计划确认流。
- 确定仓库内 `.scratch/` Markdown 文件为正式需求与开发状态系统；GitHub 仅用于 CI/CD、安装包和 Release。
- 增加工作空间 command：规范化目录、拒绝符号链接、登记/移除/重扫，并只读发现工作空间配置、Skills 和 Agent 指令文件。
- 增加统一诊断 command 和诊断中心，按严重程度、Agent 与作用域过滤，并为每条问题提供影响和恢复建议。

## 版本约定

- `Added`：新增能力或支持范围。
- `Changed`：现有能力或架构发生变化。
- `Deprecated`：计划移除但仍暂时保留的能力。
- `Removed`：已移除能力。
- `Fixed`：缺陷修复。
- `Security`：安全相关变更。
