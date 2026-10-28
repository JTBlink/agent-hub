# 磁盘清理模板

`disk-cleanup.py` 是 CLI 入口，`cleanup-config.json` 是唯一配置来源，其余 Python 文件按职责拆分：

| 文件                 | 职责                                               |
| -------------------- | -------------------------------------------------- |
| `cleanup_config.py`  | 配置校验、CLI 参数覆盖，清理开始前拒绝无效配置     |
| `cleanup_files.py`   | 路径、链接与文件状态校验，普通文件清理、容量格式化 |
| `cleanup_rules.py`   | 明确的跨平台缓存与 Agent 日志目录，不扫描主目录    |
| `cleanup_actions.py` | 原生工具、项目构建和已安装旧更新包的安全清理       |
| `cleanup_report.py`  | 中文总结、实际空间变化、跨平台桌面通知             |

## 使用

```bash
python3 ./disk-cleanup/disk-cleanup.py --dry-run
python3 ./disk-cleanup/disk-cleanup.py
python3 ./disk-cleanup/disk-cleanup.py --skip-notify
python3 ./disk-cleanup/disk-cleanup.py --config ./disk-cleanup/cleanup-config.json --notify
```

默认 7 天保留下载缓存、Agent 缓存／日志、浏览器缓存和 Rust 增量缓存。工作目录日志保留 30 天。浏览器仍运行或检测到 cargo／rustc 时跳过对应规则。默认运行 `uv cache prune --offline`（没有无副作用预览，预览时跳过）和关闭自动更新的 `brew cleanup`；不强制删除正在使用的依赖。工具缺失、通知失败不导致整个任务失败，真实清理错误返回非零退出码。

在配置的 `agent_hub_projects` 中添加可信任源码目录（如 `~/projects/agent-hub`），复用项目现有构建清理工具，按架构、编译配置和特性保留最新构建；`rust_targets` 可指定其他项目的 `target`，只清理过期 `incremental`，保留 `deps` 和最终程序。该明确目录中的过期硬链接可以移除，但其他位置的同一文件保持不变；共享文件大小不等同于实际释放量。未配置的项目不会被遍历，`detect_workspace_builds` 仅检查当前工作目录。

默认不删除对话、数据库、配置、凭据、技能、Downloads、工具运行时和 Playwright 浏览器。macOS 更新包仅在确认应用标识一致、包版本不高于已安装版且超过保留期时清理；待安装更新、`pending` 和未知格式保留。其他平台不猜测更新目录。

实际清理结束默认请求桌面通知；macOS 使用 osascript，Linux 使用 notify-send，Windows 使用 PowerShell Toast（失败时回退到系统托盘通知）。`--skip-notify` 或配置 `notify: false` 可关闭；预览不通知。通知被系统拒绝、缺少桌面会话或工具未安装时仍保留完整命令行总结。第三方工具输出可能为英文。Windows/Linux 需在对应桌面环境验证通知权限。

AgentHub 安装时会给文件添加归属标记；配置加载器只识别受控的首行标记并读取其后的 JSON。直接编辑配置时保留标记；GUI／CLI 任务定义中的配置正文是标准 JSON。模块、配置均通过模板声明一起分发、记录和备份，不能仅复制入口文件。
