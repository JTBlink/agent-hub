# 自动化任务包

每个新任务都有自己的定义、脚本、依赖环境和运行记录。项目工作目录单独选择；两个任务选择同一个项目，也不会共用任务包目录。

在自动化页选择“导入任务”，可以打开导出的 JSON、任务目录或其中的 `task.json`。确认预览内容并选择本机项目后，导入为新的未安装任务；在详情中选择“安装任务”，完成依赖检查和调度注册，再启用日程或手动运行。导入不会执行正文。

详情支持安装、卸载、导出与删除。卸载保留正文及历史，移除任务拥有的环境和调度；删除时可以选择同时清理本地任务数据。项目目录和其他任务引用的资源会被保留。旧任务可通过“迁移为独立任务包”显式迁移，ID 和原日程保留，原脚本不会被搬走。

CLI 使用相同流程：

```bash
agent-hub-cli automations import --path ./automation.json --preview
agent-hub-cli automations import --path ./automation.json --workdir ~/projects/demo
agent-hub-cli automations install <task-id>
agent-hub-cli automations resume <task-id>
agent-hub-cli automations export <task-id> --file ./exported-task.json
agent-hub-cli automations uninstall <task-id>
agent-hub-cli automations remove <task-id> --delete-local-data
agent-hub-cli automations migrate <legacy-task-id>
```

安装到暂停状态可使用 `import --path ./automation.json --install`。导出目标必须是新文件，避免覆盖现有内容。任务目录也可作为 `--path`；导入只读取声明的文件，不读取 `.local`。

最小 JSON 示例：

```json
{
  "schema_version": 1,
  "shell": "sh",
  "draft": {
    "name": "工作区检查",
    "provider": "system",
    "content": "sh './scripts/run.sh'",
    "workdir": null,
    "schedule": { "kind": "manual" },
    "enabled": false,
    "files": [
      { "path": "scripts/run.sh", "content": "printf 'ready\\n'" }
    ]
  },
  "dependencies": []
}
```

Windows 任务使用 `shell: "powershell"` 和相应的 `.ps1` 入口。Python 依赖可声明为 `{"kind":"python","packages":["package-name==1.0.0"]}`，外部工具使用 `{"kind":"command","name":"git"}`。外部命令只检查，不修改用户已有的工具安装。

Agent 模板的 `prompt.md`、`herdr.json` 和 `README.md` 位于包根，执行脚本位于 `scripts/`；检查点位于 `.local/state/`。支持的内置网络权限安装会请求系统管理员授权，计划默认暂停，安装不重置网络。导入包中的普通 `setup.sh` 不作为安装钩子自动执行。

安装或卸载失败时，详情显示具体失败信息；修复条件后可重试。更新中断时保留恢复信息，重新安装会先恢复之前的内容。备份恢复的任务同样默认未安装，需重新选择本机绑定和安装。
