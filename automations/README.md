# AgentHub Automations

可直接安装的自动化任务包，与根目录 `skills/` 并列。每个任务目录都包含标准 `task.json` 和运行需要的实际文件。

在 AgentHub「发现 → 自动化任务 → Git 安装」输入本仓库地址即可预览；也可选择单个任务目录进行本地安装：

```sh
agent-hub-cli automations import --path ./automations/system/disk-cleanup --install
```

导入后默认暂停，配置本机项目并确认任务内容后再运行或启用日程。这里的可移植 Shell 入口使用 `sh`，适用于 macOS / Linux；网络重置仅适用于 macOS。应用内推荐任务仍根据当前平台生成对应的 Shell 入口。

| 目录                                                               | 内容                                      |
| ------------------------------------------------------------------ | ----------------------------------------- |
| `engineering/agent-maintenance/`                                   | 项目巡检                                  |
| `engineering/agent-mr-processing/`                                 | MR / PR 处理                              |
| `engineering/agent-issue-processing/`                              | Issue 处理                                |
| `system/disk-cleanup/`                                             | 清理过期磁盘缓存                          |
| `system/network-reset/`                                            | macOS 定时重置网络                        |
| `engineering/agent-code-review/`、其他 `system/` 与 `hermes/` 任务 | 可独立安装的其他任务，保留旧 CLI 标识兼容 |

`task.json` 声明任务、日程、依赖和实际文件列表；`scripts/` 保存代码，根目录可有 `prompt.md`、`herdr.json` 和 `README.md`。`catalog.json` 仅提供应用推荐目录使用的多语言介绍与平台适配信息，不属于安装后的本机状态。

Herdr 任务各自携带完整运行脚本，可以单独安装。公共运行脚本的维护源为 `_shared/herdr-agent.py`，分发副本由一致性测试检查；修改运行脚本时同步这些副本。

云端备份使用相同的 `automations/<任务名>--<稳定标识>/task.json`、`scripts/` 与根目录正文结构。仅保存可移植定义，项目绑定、安装回执、私有环境及执行记录留在本机；恢复不会自动安装或启动任务。
