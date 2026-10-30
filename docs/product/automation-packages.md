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
    "files": [{ "path": "scripts/run.sh", "content": "printf 'ready\\n'" }]
  },
  "dependencies": []
}
```

Windows 任务使用 `shell: "powershell"` 和相应的 `.ps1` 入口。Python 依赖可声明为 `{"kind":"python","packages":["package-name==1.0.0"]}`，外部工具使用 `{"kind":"command","name":"git"}`。外部命令只检查，不修改用户已有的工具安装。

Agent 模板的 `prompt.md`、`herdr.json` 和 `README.md` 位于包根，执行脚本位于 `scripts/`；检查点位于 `.local/state/`。支持的内置网络权限安装会请求系统管理员授权，计划默认暂停，安装不重置网络。导入包中的普通 `setup.sh` 不作为安装钩子自动执行。

安装或卸载失败时，详情显示具体失败信息；修复条件后可重试。更新中断时保留恢复信息，重新安装会先恢复之前的内容。备份恢复的任务同样默认未安装，需重新选择本机绑定和安装。

## 从「发现」安装

在「发现 → 自动化任务」选择推荐、本地安装或 Git 安装。卡片先进入内容预览，再配置本机实例名称、项目与日程；安装完成后计划默认暂停，可进入「自动化」查看、运行或启用。

本地支持包含 `task.json` 的任务目录和导出的 JSON。Git 支持仓库或目录 URL，以及可选分支／标签；预览显示实际 commit 和各任务相对目录，安装使用该次预览的内容。仓库可在 `automations/<category>/<task>/` 下放置多个独立任务包。仅预览不会安装依赖或运行任务，损坏的包会单独显示错误。

安装失败时保留已创建实例，点击重试继续安装；也可进入任务详情维护。安装后来源卡片显示已安装状态。再次提交时读取本机同名任务，确认后更新所选原实例；可取消并改名另行安装。多个同名实例会列出供选择。只读、运行中、调度器不同或安装状态待处理的任务不能覆盖；卸载和删除仍在「自动化」中操作。

## 仓库与云端备份目录

项目根目录 `automations/` 与 `skills/` 并列，存放真实可安装任务，按 engineering、system、hermes 分类。`task.json` 使用标准可移植清单，脚本和提示词以实际文件存在；应用推荐内容编译嵌入自同一目录，`catalog.json` 仅保存多语言介绍与平台适配信息。

云端仓库同样以 `skills/`、`automations/` 和 `.agent-hub/` 分开保存。自动化位于 `automations/<任务名>--<稳定标识>/`，包含 `task.json`、`scripts/` 与声明的根目录文件；已安装和未安装的 AgentHub 任务均参与现有自动／手动云端备份。旧 `.agent-hub/automation-*.json` 仍可读取，下次备份转换为目录包，不保留两份权威内容。

本机项目绑定、安装回执、凭据、私有环境和运行记录不进入包。同步只导入定义；在自动化页「更多操作 → 从备份恢复」创建未安装副本，重新选择本机项目后安装。新建页「从发现安装」跳转至推荐任务；有未保存内容时先确认再离开。
