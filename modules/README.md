# 独立模块

本目录用于收编完整的独立项目。模块保留自己的依赖、锁文件、构建配置与运行方式，后续再按实际需求接入 AgentHub。

## Skills

模块目录：[skills](skills/README.zh-CN.md)。完整源码已导入，并完成项目归属与服务配置适配，保留独立构建和运行方式；AgentHub 的 Skills 入口现已通过独立窗口接入，数据库保持独立。

源码基线：`def946d78ef4c739b0ba429e38ac509b8660ec34`，版本 `1.40.3`。原项目的 309 个 Git 跟踪文件约 30.5 MB；来源文件清单与校验和保存在 `skills-source-manifest.json`。`files` 保留原始基线，`adaptations` 单独记录后续修改、新增和删除；执行 `node scripts/verify-skills-import.mjs` 校验当前文件。

在仓库根目录执行：

```bash
npm --prefix modules/skills ci
npm --prefix modules/skills run build
npm --prefix modules/skills run tauri:dev
```

CLI 与 Rust 检查使用模块自己的入口：

```bash
npm --prefix modules/skills run cli -- --help
cargo test --manifest-path modules/skills/src-tauri/Cargo.toml
```

根项目与 Skills 模块分别安装依赖和构建。模块原有赞助配置、工作流、Issue 模板及推广资源已移除。CI、安装包与发布统一使用根 `.github/workflows/`；需求反馈按 `.scratch/` tracker 处理。

AgentHub 的开发和桌面构建通过 `scripts/tauri-with-skills.mjs` 自动构建模块前端、管理器和 CLI 并作为 sidecar 带入安装包。点击 Skills 会启动内置管理器，其单实例逻辑会聚焦已打开的窗口。运行模块沿用原应用的数据位置和行为；不自动迁移 AgentHub 的旧 Skills 数据。

应用更新统一随 AgentHub 发布，设置页只提供 AgentHub 发布页入口，不再查询上游版本服务。模块配置清空上游更新地址与签名公钥，内置副本额外通过 `skills-host.config.json` 撤销更新器下载、安装权限。技能内容更新不受影响。

GitHub 备份默认使用个人访问令牌或普通 Git 远端，凭证仍由原模块安全存储。不再内置上游 OAuth 应用 ID；如需设备码登录，在同一次前端和 Rust 构建环境中提供 `VITE_AGENTHUB_GITHUB_OAUTH_CLIENT_ID`，值应为项目自己的公开 Client ID。原许可证署名保留。

开发入口使用 `npm run tauri dev` 或 `npm run app:dev`；打包使用 `npm run app:build`。首次构建会安装模块依赖并编译两个二进制。直接运行原生 Tauri CLI 会绕过仓库包装器，因此不作为带 Skills 的构建入口。

## 后续作为库引用

当前 Skills 目录仍是独立应用源码，尚未提供可直接接入 AgentHub 的库接口。后续可以将前端导出为 `SkillsModule` 组件、后端拆成 `skills-core` Rust 库，让 AgentHub、独立应用和 CLI 共用核心服务。Tauri、路径、初始化与事件等宿主依赖需要先隔离；这些改造不在本次导入范围。
