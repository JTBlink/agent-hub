# 更新日志

本文件记录 AgentHub 的重大产品、架构和兼容性变更。格式参考 [Keep a Changelog](https://keepachangelog.com/)，尚未发布的内容统一放在 `Unreleased`。

## [Unreleased]

### Changed

- 技能库明确显示正在编辑的技能组与成员数量，用带组名悬停提示的图标开关管理成员（加号表示未加入，对勾表示已加入）；统一成员筛选和批量操作文案，并提供工作区批量添加入口。

- 备份页将 GitHub CLI 优先使用与自动备份开关合并为一张“备份设置”卡片，并精简开关说明。

- Git 备份独立使用 `~/.agent-hub/backup`，仓库以 `skills/` 保存原始 Skill，支持 `npx skills@latest add`；保留旧 Git 历史与恢复副本，桌面、CLI 和自动备份使用相同流程。
- 凭据按用户要求改为应用数据目录下 `credentials/` 本地缓存与进程内复用，首次成功迁移后不再读取钥匙串；Unix 文件仅当前用户可读写，退出防止旧凭据重新加载，凭据目录不进入备份。
- 设置页展示独立备份目录，本地 Skills 和设置目录新增“在 VS Code 中打开”。

- GitHub Actions 统一仅在推送 `v*` tag 或手动运行时执行质量检查、安装包构建和主页部署，普通分支提交与 PR 不再自动触发。

- 开发构建默认暂停会触发 macOS 钥匙串访问的后台备份、更新和启动迁移，避免临时签名每次重编译重复弹窗；设置 `AGENT_HUB_DEV_KEYCHAIN=1` 可显式开启联调。

- 本地扫描按目录去重，移除重复 Agent 行和筛选器，目录下方直接展示适用 Agent 标签；同一 Skill 的其他来源目录默认折叠，统计与操作提示统一按实际路径展示，软链接目录增加指示图标。

- 默认技能目录统一为 `~/.agents/skills`，数据库、配置和日志保留在 `~/.agent-hub`；旧默认技能库无覆盖迁移并保留回退副本，保留 Git 历史与远端，已有自定义库和 CLI 显式目录兼容。
- GitHub 备份排除根目录应用状态；克隆恢复先下载再替换，保留原库与 Git 历史恢复副本，并带入仅本地存在的条目。共享 Skills 原地登记，导入和取消部署不会误删中央源文件。
- 本地 Skills 管理增加一键清理，支持按 Agent 预览并删除未安装 Agent 的遗留 Skills 和空目录，保留共享安装、手动配置路径及其他配置。

- 本地扫描在单次操作中复用共享目录和软链接别名的完整内容哈希；Apple/Linux ARM64 启用 SHA-2 硬件检测加速，保持原有指纹兼容。

- 本地扫描入口扩展为 Skills 管理，支持搜索、Agent 筛选以及按实际安装位置查看内容、打开目录和确认删除；保留导入功能。

- 恢复默认的 GitHub 设备授权登录，授权页使用独立注册的 agent-hub 应用；保留个人访问令牌入口，凭证继续存放于系统钥匙串。

- 简体与繁体中文界面的 Preset 统一更名为”技能组”，英文界面更名为”Skill Group”，明确组内成员与 Agent 部署的区别；CLI 和数据格式保持兼容。

- 以 Skills Manager 实现作为唯一主应用，对外名称保持 agent-hub，统一根目录前端、Rust 核心和 CLI 构建。
- 保留原 Logo、平台图标和深蓝、蓝青紫色调，支持明暗及系统主题。
- 默认本地数据、配置、日志和 CLI 统一使用 `~/.agent-hub`，CLI 更名为 `agent-hub-cli`，不自动迁入旧目录数据。
- 删除旧配置管理宿主、独立 Skills 窗口、重复工程与失效文档；旧数据库和 Agent 原生技能文件保留。
- 清理上游赞助、个人推广、旧工作流、更新地址、公钥和 OAuth ID，发布与反馈指向本项目。
- GitHub 备份设备码登录需配置自有公开 Client ID，缺省使用令牌或普通 Git。

- 删除旧 V1 规划、原型和已替代 ADR；规划设计统一以 Skills Manager 实现为基线。

### Fixed

- 备份页新增默认开启的“优先使用 GitHub CLI（gh）”开关，可随时关闭；GitHub 备份复用已登录的 `gh`，缺少 CLI 或登录时回退到应用凭据；使用非交互凭证 helper，修复禁用交互提示时有效令牌仍无法传给 Git 的问题。

- 备份快照编号中的 UTC 时间转换为本地时区展示，并区分快照生成时间与 Git 提交时间；已有 Git 标签保持兼容。

- 备份认证或网络失败后停止本轮推送，保留本地提交；仅分支首次创建允许继续，推送重试限于非快进冲突。区分 HTTPS、SSH、缺失凭证和本地权限错误，避免误导与重复请求。

- 修复打开共享隐藏目录时缺少 Tauri opener 权限的问题；原生配置重建后生效。
- 应用提供凭据时绕过系统 Git credential helper，减少重复钥匙串访问；认证失败提示引导重新连接 GitHub。

- 修正 Agent 安装探测在 Linux 分支下的可变绑定，避免严格编译警告阻断 CI。

- 修正规划和任务状态表格格式，恢复 CI 与安装包构建的 Prettier 门禁。

- Agent 统计只接受可执行程序、桌面应用及宿主已安装扩展，不把配置、历史和手动路径当作安装证据。
- 首页“已启用 Agent”卡片支持点击和键盘跳转至设置的 Agent 管理区。
- Git 备份凭证读取在同一进程内合并并发请求并复用结果，拒绝授权后不反复弹窗，登录更新与退出立即刷新缓存。开发程序重编译后仍可能需要 macOS 重新授权。

- 本地 Skill 删除成功后立即关闭确认弹窗，后台刷新列表；删除失败保留弹窗并允许重试。

- Agent 检测排除仅由 Skill 安装创建的目录，首页改为显示已启用 Agent；这些目录里的 Skills 仍可扫描和管理。

- 修复 Rust 1.99 严格 Clippy 对路径重定位闭包的检查失败。

- 修复 Linux 安装包 smoke 测试的本地路径解析。
- Windows 路径展示移除扩展长度前缀并保留 UNC 共享语义。

## [0.1.2] - 2026-08-26

### Added

- 支持识别 Claude/Codex 的软链接 Skill，并允许从共享 `.agents/skills` 目录多选后一键安装到其他 Agent。
- 已安装 Skill 支持安全卸载，并自动清理指向该安装目录的相关软链接。
- 记住最近一次选择的本地 Skill 来源目录，重新打开安装页时自动回填。
- 设置页支持中英文界面切换，并覆盖应用导航与 Skill 安装/卸载流程的核心文案。

### Changed

- 系统 Skill（例如 `.codex/skills/.system`）单独分类，不计入用户 Skill 的重复检查。
- 构建命令统一由跨平台 `scripts/build.mjs` 编排，Windows 提供 `agent-hub.bat` 薄入口。

### Fixed

- 修复 Windows 路径安全检查和版本锁文件换行符兼容性，确保跨端安装与发布门禁稳定运行。

## [0.1.1] - 2026-08-23

### Fixed

- 分离桌面端与官网入口，恢复 Tauri 桌面端使用 React 应用入口，避免启动后显示官网主页。

## [0.1.0] - 2026-08-23

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
- 增加根目录 `VERSION` 单一版本源，以及 `npm run version:set` / `npm run version:check`，统一同步并校验发布版本号。
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
