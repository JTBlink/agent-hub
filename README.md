# agent-hub

<img src="src-tauri/icons/app-icon.svg" alt="agent-hub" width="96" />

[Homepage](https://jtblink.github.io/agent-hub/)

本地优先的 AI Agent Skills 工作台，基于导入的 Skills Manager 二次开发，保留 agent-hub 的 Logo、深蓝底色及蓝、青、紫主题。

## 当前功能

- 技能库：导入、发现、标签、更新和内容查看。
- 工作空间：管理不同 Agent 的全局及项目 Skills，使用 Skill Group 组织技能集合。
- Git 备份：备份与恢复技能库，处理同步冲突。
- 桌面托盘及 CLI：桌面和自动化工具共用 Rust 核心。

旧版配置编辑器、历史页面和独立 Skills 窗口已移除。旧数据不会自动迁移，也不会在此次架构切换中删除。

## 开发与运行

需要 Node.js 22、Rust stable 和对应平台的 Tauri 2 构建依赖。

```bash
npm ci
npm run app:dev
```

```bash
npm run app:build
npm run cli -- --help
./agent-hub.sh install --dev
npm run build
npm test
npm run lint
cargo test --manifest-path src-tauri/Cargo.toml
```

`./agent-hub.sh install` 默认构建当前平台安装包；开发时如需只更新 CLI，使用 `./agent-hub.sh install --dev`，也可追加 `release` 构建 release CLI。

开发和打包入口会先编译并放置 `agent-hub-cli`，然后启动或构建同一个桌面应用。`npm run dev` 仅启动前端服务器，文件系统和数据库功能需要 Tauri 桌面运行时。

## 目录

```text
src/             React 页面、组件、状态及 Tauri bindings
src-tauri/       Rust commands、核心逻辑、CLI、配置及原品牌图标
public/          前端静态资源
skills/          随项目提供的管理 Skill
scripts/         开发、验证、版本和发布脚本
docs/            当前架构、开发指南、ADR 和第三方来源说明
.scratch/        本地需求与开发状态
```

本地数据默认位于 `~/.agent-hub/`，包括 `library/agent-hub.db`、`repo-config.json`、技能仓库、日志及 `bin/agent-hub-cli`。可在设置中移动技能库；配置、日志及 CLI 保留在固定的应用目录。不会自动读取旧的 `~/.skills-manager` 或 `~/.agenthub` 数据。详见[目录结构](docs/architecture/directory-structure.md)。

应用更新入口指向本项目发布页。GitHub 备份默认使用令牌或普通 Git；设备码登录需构建时设置项目自己的 `VITE_AGENTHUB_GITHUB_OAUTH_CLIENT_ID`。

## 文档与许可

[文档索引](docs/README.md) · [后续规划与设计](docs/plans/agent-hub.md) · [更新日志](CHANGELOG.md) · [开发指南](docs/development/README.md) · [任务记录](.scratch/skills-manager-integration/status.md)

本项目使用 [MIT 许可证](LICENSE)。导入代码的[来源说明与原许可证](docs/reference/skills-manager/README.md)保留；此前架构可通过 Git 历史查阅。
