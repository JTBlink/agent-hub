# 定时重置网络（macOS）

用于网络长时间空闲后失联的本机。默认每天 07:00 关闭 Ethernet，5 秒后重新开启；参考 dev-tools 的网络保活脚本。会短暂中断当前连接。任务默认暂停，不使用 Agent。

1. 保存任务后打开“脚本目录”，在终端切到此目录。
2. 执行 `sudo /bin/bash network-reset/setup.sh --service Ethernet --off-seconds 5`，完成一次管理员安装。服务名称可通过 `networksetup -listallnetworkservices` 查看，如 Wi-Fi。
3. 回到 AgentHub 启用计划；时间在日程中修改。安装不创建其他定时任务，也不立即断网。

若已使用 dev-tools 的独立网络保活计划，先暂停原计划，避免重复执行。已有受限入口可继续由原工具管理。

安装会复制固定配置到 root 所有的专用入口，仅允许安装用户免密码调用该入口且不能传参数。修改服务或时长后重新执行 setup.sh；编辑此处脚本不会自动覆盖已安装入口。重置异常或收到退出信号时会尝试恢复网络。

暂停或删除本任务会停止 AgentHub 调度。卸载权限入口需在终端删除 `/etc/sudoers.d/agent-hub-network-reset`、`/Library/PrivilegedHelperTools/agent-hub-network-reset/run` 和 `/Library/PrivilegedHelperTools/agent-hub-network-reset/reset.sh`。
