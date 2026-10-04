# 目录结构

仓库只保留一套应用源码、依赖和锁文件，不再使用 `modules/skills/` 嵌套工程。

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
