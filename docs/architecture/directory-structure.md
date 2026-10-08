# 目录结构

仓库只保留一套应用源码、依赖和锁文件，不再使用 `modules/skills/` 嵌套工程。

## 代码目录树

```text
agent-hub/
├── src/                            # React/TypeScript 前端
│   ├── views/                      # 页面视图
│   │   ├── Dashboard.tsx           #   仪表盘主页
│   │   ├── WorkspaceView.tsx       #   工作空间视图
│   │   ├── ProjectDetail.tsx       #   项目详情
│   │   ├── Settings.tsx            #   设置页
│   │   ├── Backup.tsx              #   Git 备份管理
│   │   ├── MySkills.tsx            #   已安装技能
│   │   ├── InstallSkills.tsx       #   技能市场/安装
│   │   └── workspaceConfigs.ts     #   工作空间配置定义
│   ├── components/                 # 共享 UI 组件
│   │   ├── Layout.tsx              #   主布局框架
│   │   ├── Sidebar.tsx             #   侧边栏导航
│   │   ├── CommandPalette.tsx      #   命令面板
│   │   ├── DetailSheet.tsx         #   详情抽屉
│   │   ├── ConfirmDialog.tsx       #   确认弹窗
│   │   ├── StatusBanner.tsx        #   状态横幅
│   │   ├── PresetBar.tsx           #   预设切换栏
│   │   ├── AgentIcon.tsx           #   Agent 图标
│   │   ├── SkillDetailPanel.tsx    #   技能详情面板
│   │   ├── AddSkillsSheet.tsx      #   添加技能面板
│   │   ├── SkillPickerRow.tsx      #   技能选择行
│   │   ├── LocalSkillsPanel.tsx   #   本地扫描列表、筛选与导入
│   │   ├── LocalSkillCleanup.tsx  #   按 Agent 预览、确认清理与失败反馈
│   │   ├── LocalSkillLocation.tsx #   目录操作、适用 Agent 与软链接指示
│   │   ├── SkillsDirectorySetting.tsx # 技能路径展示与打开目录
│   │   ├── SkillMarkdown.tsx       #   技能 Markdown 渲染
│   │   ├── SkillSourceDiffViewer.tsx  # 技能源码 Diff
│   │   ├── DocumentDiffViewer.tsx  #   文档 Diff 查看器
│   │   └── ...                     #   其他对话框与交互组件
│   ├── context/                    # React Context 全局状态
│   │   ├── AppContext.tsx          #   应用全局上下文
│   │   └── ThemeContext.tsx        #   主题上下文
│   ├── hooks/                      # 自定义 Hooks
│   │   ├── useLocalSkillManagement.ts # 本地内容读取与删除状态
│   │   ├── useMultiSelect.ts       #   多选逻辑
│   │   ├── useDragWindow.ts        #   窗口拖拽
│   │   └── useTheme.ts             #   主题切换
│   ├── lib/                        # 工具函数与 Tauri Bindings
│   │   ├── localSkillScan.ts       #   扫描分组标识与筛选纯函数
│   │   ├── tauri.ts                #   Tauri IPC 封装
│   │   ├── error.ts                #   错误处理
│   │   ├── gitErrors.ts            #   Git 错误映射
│   │   ├── distribution.ts         #   分发逻辑
│   │   ├── exportAgents.ts         #   Agent 导出
│   │   ├── agentIcons.ts           #   Agent 图标映射
│   │   ├── skillTags.ts            #   技能标签
│   │   ├── skillPickerStatus.ts    #   技能选择状态
│   │   ├── presetStatus.ts         #   预设状态
│   │   ├── presetIcons.tsx         #   预设图标
│   │   └── textScale.ts            #   文本缩放
│   ├── i18n/                       # 国际化
│   │   ├── index.ts                #   i18n 初始化
│   │   ├── zh.json                 #   简体中文
│   │   ├── zh-TW.json              #   繁体中文
│   │   └── en.json                 #   英文
│   ├── styles/brand.css            # 明暗主题与色调变量
│   ├── App.tsx                     # 应用根组件
│   ├── main.tsx                    # 前端入口
│   ├── utils.ts                    # 通用工具函数
│   └── index.css                   # 全局样式
│
├── src-tauri/                      # Rust 桌面端（Tauri 2）
│   ├── src/
│   │   ├── main.rs                 #   应用入口（保持精简）
│   │   ├── lib.rs                  #   库入口与 Tauri 插件注册
│   │   ├── smoke.rs                #   冒烟测试
│   │   ├── bin/
│   │   │   └── agent-hub-cli.rs    #   CLI 工具入口
│   │   ├── commands/               #   Tauri 命令层（IPC 边界）
│   │   │   ├── mod.rs
│   │   │   ├── agent_workspace.rs  #     Agent 工作空间管理
│   │   │   ├── projects.rs         #     项目管理
│   │   │   ├── scan.rs             #     本地 Skill 扫描与导入
│   │   │   ├── local_cleanup.rs   #     未安装 Agent 遗留 Skills 预览与批量清理
│   │   │   ├── discovered_skills.rs #    扫描副本内容读取与安全删除
│   │   │   ├── presets.rs          #     预设管理
│   │   │   ├── skills.rs           #     技能管理
│   │   │   ├── sync.rs             #     同步操作
│   │   │   ├── git_backup.rs       #     Git 备份
│   │   │   ├── settings.rs         #     应用设置
│   │   │   ├── tools.rs            #     工具操作
│   │   │   ├── browse.rs           #     文件浏览
│   │   │   └── app_updates.rs      #     应用更新
│   │   └── core/                   #   核心业务逻辑
│   │       ├── mod.rs
│   │       ├── app_state.rs        #     全局应用状态
│   │       ├── error.rs            #     统一错误类型
│   │       ├── tool_detection.rs   #     Agent 程序、桌面应用与 IDE 扩展安装检测
│   │       ├── scanner.rs          #     Agent 目录扫描
│   │       ├── project_scanner.rs  #     项目扫描器
│   │       ├── sync_engine.rs      #     配置同步引擎
│   │       ├── sync_metadata.rs    #     同步元数据
│   │       ├── skill_store.rs      #     技能存储
│   │       ├── skill_metadata.rs   #     技能元信息
│   │       ├── skill_auto_updater.rs #   技能自动更新
│   │       ├── skillssh_api.rs     #     技能仓库 API
│   │       ├── installer.rs        #     技能安装器
│   │       ├── install_cancel.rs   #     安装取消
│   │       ├── scenario_service.rs #     场景/预设服务
│   │       ├── tool_service.rs     #     工具管理服务
│   │       ├── tool_adapters.rs    #     工具适配器
│   │       ├── git_backup.rs       #     Git 备份核心
│   │       ├── git_backup/         #     分阶段克隆恢复与应用状态排除
│   │       ├── git2_engine.rs      #     libgit2 引擎封装
│   │       ├── git_fetcher.rs      #     Git 远程拉取
│   │       ├── git_credentials.rs  #     Git 凭据管理
│   │       ├── github_api.rs       #     GitHub API 客户端
│   │       ├── credential_cache.rs #     进程内钥匙串读取缓存与并发合并
│   │       ├── library_layout.rs   #     默认库层级升级、冲突保护与中断恢复
│   │       ├── central_repo.rs     #     库路径与应用状态目录
│   │       ├── central_repo_migration.rs # 应用数据目录迁移
│   │       ├── central_repo_tests.rs #   库路径与迁移回归
│   │       ├── shared_library.rs   #     默认共享技能库无覆盖迁移
│   │       ├── shared_skill_index.rs #   共享技能原地登记
│   │       ├── merge/              #     合并引擎
│   │       │   ├── mod.rs
│   │       │   ├── protocol.rs     #       合并协议
│   │       │   ├── decision.rs     #       冲突决策
│   │       │   ├── apply.rs        #       变更应用
│   │       │   ├── resolve.rs      #       冲突解决
│   │       │   ├── snapshot.rs     #       快照
│   │       │   ├── treebuild.rs    #       树构建
│   │       │   ├── validate.rs     #       校验
│   │       │   └── pending.rs      #       待处理队列
│   │       ├── content_hash.rs     #     内容哈希
│   │       ├── crypto.rs           #     加密工具
│   │       ├── path_guard.rs       #     路径安全校验
│   │       ├── repo_lock.rs        #     仓库锁
│   │       ├── removals.rs         #     删除操作
│   │       ├── file_watcher.rs     #     文件监听
│   │       ├── auto_backup.rs      #     自动备份
│   │       ├── cli_bridge.rs       #     CLI 桥接
│   │       ├── audit_log.rs        #     审计日志
│   │       ├── migrations.rs       #     数据迁移
│   │       ├── log_sanitize.rs     #     日志脱敏
│   │       ├── panic_log.rs        #     崩溃日志
│   │       └── timing.rs           #     性能计时
│   ├── capabilities/               #   Tauri 权限声明
│   ├── icons/                      #   应用图标（各平台）
│   ├── binaries/                   #   Sidecar 二进制
│   ├── tauri.conf.json             #   Tauri 主配置
│   ├── tauri.dev.conf.json         #   开发环境覆盖
│   ├── tauri.cli.conf.json         #   CLI 参数定义
│   ├── Cargo.toml                  #   Rust 依赖
│   └── build.rs                    #   构建脚本
│
├── docs/                           # 项目文档
│   ├── product/                    #   产品概览
│   ├── architecture/               #   架构文档
│   ├── design/                     #   UI 设计指南
│   ├── development/                #   开发规范
│   ├── adr/                        #   架构决策记录
│   ├── agents/                     #   Agent 协作约定
│   ├── plans/                      #   规划设计文档
│   └── reference/                  #   参考资料与来源
│
├── scripts/                        # 构建与发布脚本（Node.js）
│   ├── build.mjs                   #   前端构建
│   ├── assemble-release.mjs        #   发布产物组装
│   ├── set-version.mjs             #   版本号设置
│   ├── check-version.mjs           #   版本号校验
│   ├── check-task-status.mjs       #   任务状态检查
│   ├── primary-app.mjs             #   主应用切换
│   ├── build-homepage.mjs          #   主页构建
│   ├── verify-release-bundle.mjs   #   发布包验证
│   └── run-rust-cli.mjs            #   Rust CLI 运行器
│
├── skills/                         # 内置 Skill
│   └── manage-skills/SKILL.md      #   技能管理 Skill
│
├── public/                         # 前端静态资源
│   ├── agent-icons/                #   Agent 图标库（50+）
│   └── icons/                      #   应用图标
│
├── homepage/                       # GitHub Pages 主页
│   └── index.html
│
├── .github/workflows/              # CI/CD
│   ├── ci.yml                      #   持续集成
│   ├── build-installers.yml        #   跨平台安装包构建
│   └── deploy-pages.yml            #   主页部署
│
├── .scratch/                       # 需求 tracker（仓库内 Issue）
│
├── CLAUDE.md                       # Agent 协作指南（本文件映射至 AGENTS.md）
├── AGENTS.md                       # 仓库贡献指南
├── CONTEXT.md                      # 领域上下文
├── CHANGELOG.md                    # 变更日志
├── VERSION                         # 版本号
└── 前端配置文件                     # vite / tsconfig / eslint / tailwind / postcss
```

## 模块职责速查

| 路径                             | 职责                               |
| -------------------------------- | ---------------------------------- |
| `src/views/`                     | 页面与页面组合                     |
| `src/components/`                | 共享 UI                            |
| `src/context/`、`src/hooks/`     | 前端状态和交互逻辑                 |
| `src/lib/`                       | Tauri bindings、展示函数和项目链接 |
| `src/styles/brand.css`           | agent-hub 明暗主题与色调           |
| `src-tauri/src/commands/`        | Tauri 命令边界                     |
| `src-tauri/src/core/`            | 技能库、工具适配、存储和 Git 核心  |
| `src-tauri/src/bin/`             | agent-hub-cli 入口                 |
| `src-tauri/icons/`               | 原 agent-hub Logo 与平台图标       |
| `public/`                        | 前端静态资源                       |
| `skills/`                        | 内置管理 Skill                     |
| `docs/reference/skills-manager/` | 导入来源清单与原许可证             |

默认本地布局：

```text
~/.agent-hub/
├── library/
│   ├── agent-hub.db
│   ├── skills/
│   ├── scenarios/
│   └── cache/
├── repo-config.json        # 用户调整库位置后生成
├── library.lock
├── bin/agent-hub-cli       # Windows 为 .exe
└── logs/
```

库内还包含来源缓存、同步元数据及本地密钥等运行文件，由核心模块管理，不提交到仓库。移动库后，`repo-config.json`、`library.lock`、日志和 CLI 仍使用固定的 `~/.agent-hub`。Windows 对应 `%USERPROFILE%\.agent-hub`。

旧版 `~/.agenthub` 和原管理器的 `~/.skills-manager` 不自动迁入，已有 Agent 原生技能目录保持其工具约定。
