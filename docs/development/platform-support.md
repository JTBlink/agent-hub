# 平台支持矩阵

| 平台    | Runner           | 架构                               | 安装包              | 说明                                                                                     |
| ------- | ---------------- | ---------------------------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| Windows | `windows-latest` | x86_64                             | `.msi`、NSIS `.exe` | 启用 `ENABLE_WINDOWS_SIGNING` 且三项 Secrets 完整时使用 Authenticode，否则生成未签名包。 |
| macOS   | `macos-latest`   | Universal（Apple Silicon + Intel） | `.dmg`              | 启用 `ENABLE_APPLE_SIGNING` 且六项 Secrets 完整时签名，否则生成未签名包。                |
| Linux   | `ubuntu-24.04`   | x86_64                             | `.AppImage`、`.deb` | AppImage 为便携包，`.deb` 面向 Debian/Ubuntu 系列。                                      |

平台表为当前构建目标，实际发布前需在对应原生 Runner 完成安装与 smoke 验证。未配置签名的包可能出现系统安全提示。

## 本地数据

默认数据集中在 `~/.agent-hub`，Windows 对应 `%USERPROFILE%\.agent-hub`。数据库为 `library/agent-hub.db`，日志在 `logs/`，配套 CLI 在 `bin/`。详细规则见[目录结构](../architecture/directory-structure.md)。

旧版 `~/.agenthub` 和原管理器 `~/.skills-manager` 不自动迁入。卸载应用不主动删除本地数据。

## 当前限制

应用内自动更新暂未启用，设置页提供本项目发布页。Git 备份属于技能库功能，需要用户配置远端和认证；不代表应用配置自动同步。
