# 目录结构

> 状态：规划中；初始化应用时按此结构落地。

```text
agent-hub/
├── docs/                         # 产品、架构、集成和 ADR
├── src/                          # React 前端
│   ├── app/                      # 路由和全局 Provider
│   ├── features/                 # configurations、skills、workspaces、history
│   ├── shared/                   # 通用 UI、hooks 和工具
│   └── bindings/                 # Rust 生成的 TypeScript bindings
├── src-tauri/
│   ├── migrations/               # SQLite migrations
│   ├── tests/                    # Rust 集成测试
│   └── src/
│       ├── commands/             # 轻量 Tauri 命令入口
│       ├── modules/              # 核心业务模块
│       │   ├── configuration/    # 扫描、编辑、校验、差异和回滚
│       │   ├── workspace/
│       │   ├── agent/adapters/   # Claude Code、Codex、OpenCode
│       │   ├── skill/adapters/   # skills.sh、Marketplace、远程/本地仓库
│       │   ├── history/
│       │   └── settings/
│       └── infrastructure/       # SQLite、原子文件写入、备份、Keychain
└── tests/e2e/                    # 桌面端端到端测试
```

前端使用功能分域。配置树、编辑器和差异视图放在 `features/configurations/`；Skill 列表、详情和安装流程放在 `features/skills/`。只有真正跨域复用的内容进入 `shared/`。Rust 第一版使用单 crate；只有在编译时间、独立发布或职责隔离出现实际需求后再拆 Cargo workspace。
