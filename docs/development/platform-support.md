# 平台支持矩阵

| 平台    | Runner           | 架构                               | 安装包              | 说明                                                                                     |
| ------- | ---------------- | ---------------------------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| Windows | `windows-latest` | x86_64                             | `.msi`、NSIS `.exe` | 启用 `ENABLE_WINDOWS_SIGNING` 且三项 Secrets 完整时使用 Authenticode，否则生成未签名包。 |
| macOS   | `macos-latest`   | Universal（Apple Silicon + Intel） | `.dmg`              | 启用 `ENABLE_APPLE_SIGNING` 且六项 Secrets 完整时签名，否则生成未签名包。                |
| Linux   | `ubuntu-24.04`   | x86_64                             | `.AppImage`、`.deb` | AppImage 为便携包，`.deb` 面向 Debian/Ubuntu 系列。                                      |

安装包只支持上述架构和格式。首次发布后，应在干净虚拟机上验证安装、启动、配置扫描、数据库初始化、升级和卸载。

## 用户数据目录

AgentHub 自己产生的数据统一存放在用户主目录的 `.agenthub` 中，与应用安装目录、工作空间和 Agent 配置目录分离：

```text
~/.agenthub/
├── agent-hub.sqlite3   # 工作空间索引、操作历史和安装元数据
├── backups/            # 配置备份与 Codex 旧 Skill 归档
├── skill-sources/      # Skill 来源缓存
└── logs/               # 本地运行日志
```

- macOS / Linux：`$HOME/.agenthub/`
- Windows：`%USERPROFILE%\.agenthub\`

首次运行新版时，如果只存在旧版 Tauri 应用数据目录，AgentHub 会把其中的数据库、备份和来源缓存整体迁移到 `~/.agenthub/`。如果新目录已经包含数据库，旧数据不会覆盖它。卸载应用不会主动删除该目录；覆盖安装或升级也不得删除 SQLite、配置备份和操作历史。

## V1 已知限制

- Windows 与 Linux 第一版只提供 x86_64 安装包；macOS 提供 Universal 包。
- 未配置平台证书的安装包会触发 Windows SmartScreen 或 macOS Gatekeeper 提示。
- V1 不提供应用内自动更新、云同步、私有仓库凭据托管或远程备份。
- 配置文件和 Skill 脚本不会在扫描阶段执行；不兼容条目不能创建安装计划。
