# 定时重置网络（macOS）

用于网络长时间空闲后失联的本机。默认每天 07:00 关闭 Ethernet，5 秒后重新开启；参考 dev-tools 的网络保活脚本。会短暂中断当前连接。任务默认暂停，不使用 Agent。

1. 在 AgentHub 保存任务，应用会按实例准备独立的权限入口；需要时由系统请求管理员授权。准备不会立即断网，日程默认暂停。
2. 核对已有网络保活计划，再按需要启用本任务。日常执行只调用该实例的固定入口，不传入任意命令或参数。
3. 仅旧版手动安装任务使用 `sudo /bin/bash scripts/setup.sh --service Ethernet --off-seconds 5`。服务名称可通过 `networksetup -listallnetworkservices` 查看；不要对新任务重复安装旧版共享入口。

若已使用 dev-tools 的独立网络保活计划，先暂停原计划，避免重复执行。已有受限入口可继续由原工具管理。

安装会复制固定配置到 root 所有的专用入口，仅允许安装用户免密码调用该入口且不能传参数。旧版手动入口修改服务或时长后需重新执行 setup.sh；新实例由 AgentHub 管理固定的 Ethernet／5 秒入口，编辑任务脚本不会自动覆盖已安装入口。重置异常或收到退出信号时会尝试恢复网络。

暂停或删除本任务会停止 AgentHub 调度。下面路径仅用于旧版手动入口，确认没有其他任务使用后才可在终端删除 `/etc/sudoers.d/agent-hub-network-reset`、`/Library/PrivilegedHelperTools/agent-hub-network-reset/run` 和 `/Library/PrivilegedHelperTools/agent-hub-network-reset/reset.sh`。

独立任务包由 AgentHub 自动管理管理员资源。卸载时撤销该实例的计划和权限入口，保留项目及任务正文；旧任务的无归属回执入口仍按上文独立维护。
