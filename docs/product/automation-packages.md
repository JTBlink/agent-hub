# 自动化任务包

每个新任务都有自己的定义、脚本、依赖环境和运行记录。项目工作目录单独选择；两个任务选择同一个项目，也不会共用任务包目录。

在自动化页选择“导入任务”，可以打开导出的 JSON、任务目录或其中的 `config/task.json`（兼容旧版根目录 `task.json`）。确认预览内容并选择本机项目后，直接创建默认暂停的新任务，并自动完成依赖检查和调度注册；随后可以恢复计划或手动运行。导入不会执行正文。

详情支持编辑、暂停／恢复、立即运行、导出与删除。删除会撤销调度并清理任务拥有的运行环境，可以选择同时清理本地任务文件和记录。项目目录和其他任务引用的资源会被保留。旧任务可通过“迁移为独立任务包”显式迁移，ID 和原日程保留，原脚本不会被搬走。

CLI 使用相同流程：

```bash
agent-hub-cli automations import --path ./automation.json --preview
agent-hub-cli automations import --path ./automation.json --workdir ~/projects/demo
agent-hub-cli automations resume <task-id>
agent-hub-cli automations export <task-id> --file ./exported-task.json
agent-hub-cli automations remove <task-id> --delete-local-data
agent-hub-cli automations migrate <legacy-task-id>
```

导入后默认暂停，无需额外安装操作。导出目标必须是新文件，避免覆盖现有内容。任务目录也可作为 `--path`；导入只读取声明的文件，不读取 `.local`。

最小 JSON 示例：

```json
{
  "schema_version": 1,
  "version": "1.0.0",
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

任务以根目录 `TASK.md` 为说明入口，`prompts/prompt.md` 保存 Agent 目标，`config/` 集中保存 `task.json`、`herdr.json` 等 JSON 配置，`scripts/` 保存可独立运行的入口，`references/` 按需保存说明；检查点位于 `.local/state/`。支持的内置网络权限安装会请求系统管理员授权，计划默认暂停，安装不重置网络。导入包中的普通 `setup.sh` 不作为安装钩子自动执行。

运行环境准备失败时，详情显示具体错误；修复条件后可编辑保存或运行重试。更新中断时保留恢复信息，重试会先恢复之前的内容。备份恢复直接创建默认暂停的任务，可重新选择本机项目。

## 从「发现」添加

在「发现 → 自动化任务」选择推荐、本地安装或 Git 安装。卡片先进入内容预览，再配置本机实例名称、项目与日程；添加完成后计划默认暂停，可进入「自动化」查看、运行或启用。

本地支持包含 `config/task.json`（或旧版根目录 `task.json`）的任务目录和导出的 JSON。Git 支持仓库或目录 URL，以及可选分支／标签；预览显示实际 commit 和各任务相对目录，添加使用该次预览的内容。仓库可在 `automations/<category>/<task>/` 下放置多个独立任务包。仅预览不会安装依赖或运行任务，损坏的包会单独显示错误。

创建失败时显示具体错误，已保存的实例可以从自动化页编辑处理。添加后来源卡片显示已添加状态。再次提交时读取本机同名任务，确认后更新所选原实例；可取消并改名另行添加。多个同名实例会列出供选择。只读、运行中或调度器不同的任务不能覆盖；删除在「自动化」中操作。

## 仓库与云端备份目录

项目根目录 `automations/` 与 `skills/` 并列，存放真实可安装任务，按 engineering、system、hermes 分类。`config/task.json` 使用标准可移植清单，脚本和提示词以实际文件存在；应用推荐内容编译嵌入自同一目录，`config/catalog.json` 仅保存多语言介绍与平台适配信息。

云端仓库同样以 `skills/`、`automations/` 和 `.agent-hub/` 分开保存。自动化位于 `automations/<英文目录名>/`，包含 `TASK.md`、`config/task.json`、`scripts/` 与声明的按需资源；稳定身份保存在清单内，普通目录不再追加 UUID；同名或大小写、Unicode 等价、文件名清理冲突时使用 `-2`、`-3` 等简短后缀避让。AgentHub 管理的任务均参与现有自动／手动云端备份。旧 `.agent-hub/automation-*.json` 仍可读取，旧的任务名加 UUID 目录同样继续可读，下次备份改为英文目录名；不改动本机目录、任务 ID 或日程，不保留两份权威内容。

本机项目绑定、运行环境回执、凭据、私有环境和运行记录不进入包。同步只导入定义；在自动化页「更多操作 → 从备份恢复」直接创建默认暂停的任务并自动准备运行环境，可重新选择本机项目。新建页「从发现添加」跳转至推荐任务；有未保存内容时先确认再离开。

## 任务版本

任务包顶层 `version` 是任务作者维护的语义化发布版本（SemVer，例如 `1.0.0`、`1.1.0-rc.1`）。它随发现、导入导出、本地安装与云端备份完整保留；内置包与界面新建任务从 `1.0.0` 开始，旧包缺少此字段时显示“未声明版本”，不推测版本。

- `version`：脚本、提示词等任务内容的发布版本；可在编辑页维护。
- `schema_version`：清单格式版本，仍为 `1`。
- `revision`：本机配置的并发编辑修订号，保存时递增；改项目、日程或脚本不会自动提升 `version`。

发现页展示可用版本，已添加同名任务的已知版本较低时提示“有新版本”；未知版本不推断可升级关系。覆盖确认逐项展示当前版本和目标版本，同版本重装或回退仍需显式确认。Git commit 用于固定下载内容，独立于任务发布版本；版本号不代表内容校验或来源身份。

## 英文任务目录

任务显示名称可以使用中文，本机与云端目录使用同一套英文 ASCII 命名规则：内置任务从多语言目录元数据解析固定标识（例如“PR / MR 代码审查”对应 `agent-mr-processing`）；自定义名称转换为小写 ASCII 名称，无法生成名称时使用 `task`。重名依次加 `-2`、`-3`，不覆盖已有文件。已分配的 ASCII 目录不随显示名称修改而移动。

旧中文目录不会在只读列表中自动移动。显式迁移时，程序自动撤销调度与任务私有环境，移动目录并递增配置修订号，再准备运行环境并恢复原启停状态。稳定 ID、显示名称、日程、任务版本、脚本和历史保留；私有 Python 环境在新目录重新准备。其他任务引用该目录、任务正在运行或清理未完成时拒绝迁移；中断可回滚后重试。

```sh
agent-hub-cli automations migrate <task-id>
```

## TASK.md 与配置布局

说明采用与 Skill 相近的分层结构：先读 TASK.md 了解用途和流程，运行脚本无需把实现载入 Agent 上下文；只在需要时读取 references/ 的细节。TASK.md 不重复维护日程、依赖或版本，实际配置以 config/task.json 为准。

旧版根目录清单和 README.md、herdr.json 继续可用；仅查看或更新旧任务不会自动搬迁清单。新旧 task.json 同时存在时报告冲突，不静默任选一份。JSON 单文件导入导出格式保持兼容，文件清单始终相对包根目录。

## 执行记录与处理状态

所有任务按[定时任务本地记录规范](../architecture/automation-records.md)保存本机数据：执行记录位于任务包 `.local/runs/<运行ID>/`，业务处理记录位于 `.local/state/task-state.json` 的 `extensions` 中。MR、Issue、巡检等用途使用独立扩展；重跑不清零累计次数。运行记录与业务扩展均不参与任务导出、备份或跨设备同步，任务定义和声明脚本继续备份。
