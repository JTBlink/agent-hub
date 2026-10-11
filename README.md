<div align="center">
  <img src="src-tauri/icons/app-icon.svg" alt="AgentHub Logo" width="80" />
  <h1>AgentHub</h1>
  <p><strong>让每个 Agent 用上合适的 Skills。</strong></p>
  <p>本地优先的 AI Agent Skills 工作台，统一整理技能库、技能组与项目部署。</p>
  <p>
    <a href="https://jtblink.github.io/agent-hub/">产品主页</a> ·
    <a href="https://github.com/JTBlink/agent-hub/releases">下载安装包</a> ·
    <a href="docs/README.md">文档</a> ·
    <a href="CHANGELOG.md">更新日志</a>
  </p>
</div>

![AgentHub 技能库：技能组、标签与 Agent 部署状态](docs/images/skill-library.png)

_当前前端界面的示例数据截图，展示技能库、技能组、Agent 与项目入口。截图生成方式见[截图说明](docs/images/README.md)。_

## 一个工作台，管理你的 Skills

Skills 不必散落在每个工具和项目目录里。AgentHub 集中管理技能内容，再按实际用途部署到不同工作空间，支持 Claude Code、Codex、Cursor、OpenCode、Hermes 等 Agent。

| 能力         | 用途                                                              |
| ------------ | ----------------------------------------------------------------- |
| 技能库       | 从本地目录或 Git 来源导入，查看内容与来源、检查更新、用标签筛选。 |
| 技能组       | 按开发、设计、研究等用途整理集合，向工作空间批量添加或移除技能。  |
| Agent 与项目 | 分别管理全局和项目技能，查看部署关系与同步状态。                  |
| Git 备份     | 配置自己的 Git 远端，备份、恢复技能库并处理同步冲突。             |
| 桌面与 CLI   | 使用桌面工作台、托盘或命令行；共用同一套 Rust 核心。              |

导入技能库、加入技能组和部署到工作空间是不同操作：先收藏内容，再组织用途，最后选择需要使用这些技能的 Agent 或项目。修改组内成员不会自动更新已有部署。

<details>
  <summary>查看工作台概览</summary>

![AgentHub 工作台：技能统计、部署覆盖与近期动态](docs/images/dashboard.png)

_当前前端界面，使用示例数据。_

</details>

## 安装与开始使用

在[发布页](https://github.com/JTBlink/agent-hub/releases)选择对应平台的安装包。具体可用产物与功能以各版本发布说明为准。

| 平台    | 安装格式             |
| ------- | -------------------- |
| macOS   | Universal `.dmg`     |
| Windows | `.exe` 安装程序      |
| Linux   | `.AppImage` / `.deb` |

1. 打开 AgentHub，扫描并导入已有 Skills，或从本地目录、Git 仓库导入。
2. 用标签和技能组整理内容，选择要启用的 Agent。
3. 在全局或项目工作空间中部署所需技能，查看同步状态。
4. 按需设置 Git 远端，为技能库建立备份。

## 数据存放

技能内容默认位于 `~/.agent-hub/skills`，可在设置中移动技能库。应用数据库、配置、日志与配套 CLI 保存在 `~/.agent-hub/`，包括 `library/agent-hub.db`、`repo-config.json` 和 `bin/agent-hub-cli`。

可在设置中创建 `~/.agents/skills` 软链接，供其他 AI 工具发现技能。Git 备份默认位于 `~/.agent-hub/backup`；凭据单独保存，不进入技能备份。详见[目录结构](docs/architecture/directory-structure.md)。

## 开发与运行

需要 Node.js 22+、Rust stable 和对应平台的 Tauri 2 构建依赖。

```bash
npm ci
npm run app:dev
```

常用构建与验证命令：

```bash
npm run app:build
npm run cli -- --help
./agent-hub.sh install --dev
npm run build
npm test
npm run lint
cargo test --manifest-path src-tauri/Cargo.toml
```

`./agent-hub.sh install` 默认构建当前平台安装包；只更新开发 CLI 时使用 `./agent-hub.sh install --dev`，追加 `release` 可构建 release CLI。

开发和打包入口会先编译并放置 `agent-hub-cli`，再启动或构建桌面应用。`npm run dev` 仅启动前端服务器，文件系统和数据库功能需要 Tauri 桌面运行时。完整说明见[开发指南](.agents/skills/rust-dev/references/development.md)。

### 产品主页

主页独立于桌面应用，使用静态 HTML、CSS 和少量 JavaScript，无外部字体或运行时依赖。构建会从 `VERSION` 注入版本号，并复制样式、图标和产品截图：

```bash
npm run homepage:build
python3 -m http.server 8080 --directory _site
```

打开 `http://localhost:8080` 预览。也可传入自定义输出文件：`npm run homepage:build -- <output>/index.html`。构建输出目录应独立于 `homepage/` 源文件目录。

## 项目结构

```text
src/             React 页面、组件、状态及 Tauri bindings
src-tauri/       Rust commands、核心逻辑、CLI 与 Tauri 配置
homepage/        产品主页的静态源文件
public/          前端静态资源与 Agent 图标
skills/          随项目提供的管理 Skill
scripts/         开发、验证、版本和发布脚本
docs/            产品文档、架构、ADR 与界面截图
.scratch/        仓库内需求与开发状态
```

## 架构与许可

AgentHub 基于 Skills Manager 二次开发，使用 Tauri 2、React、TypeScript、Rust 和 SQLite，保留 AgentHub 的 Logo 与深蓝、蓝、青、紫品牌色。

当前实现采用唯一的桌面主入口。旧配置编辑器与独立 Skills 窗口已移除；旧数据不自动迁移，也不会因此删除。不会自动读取 `~/.skills-manager` 或 `~/.agenthub` 数据。

应用更新入口指向本项目发布页。GitHub 备份支持令牌或普通 Git；设备码登录需构建时设置项目自己的 `VITE_AGENTHUB_GITHUB_OAUTH_CLIENT_ID`。

[文档索引](docs/README.md) · [后续规划](docs/plans/agent-hub.md) · [架构说明](docs/architecture/overview.md)

本项目使用 [MIT 许可证](LICENSE)。导入代码的[来源说明与原许可证](docs/reference/skills-manager/README.md)保留，此前架构可通过 Git 历史查阅。
