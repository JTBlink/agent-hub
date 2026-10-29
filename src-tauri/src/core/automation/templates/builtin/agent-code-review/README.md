# Agent 代码巡检（Herdr）

工作日 09:00 通过 Herdr 在项目工作区启动一次新的 Codex 交互会话，按只读提示词分析最近 24 小时的提交，结果保存在 AgentHub 的运行记录中。

## 使用

1. 安装 Python 3、Git、Herdr 和 Codex CLI，并先在终端完成 Codex 登录与模型配置。在 `herdr.json` 中选择已运行的 Herdr 会话，默认为 `default`。任务沿用本机 Codex 配置，可能消耗模型额度。
2. 在“使用模板”中选择此模板，通过“项目工作区”选择需要巡检的已关联 Git 项目，也可手动指定工作目录。脚本目录单独保存，不会将任务脚本写入所选项目。未指定项目或工作目录时会在脚本目录执行，并提示选择 Git 项目。
3. 根据需要修改脚本目录下 `agent-code-review/prompt.md`；也可在自动化编辑器的任务文件中修改。模型跟随 Codex 配置。
4. 保存后可点击“立即运行”检查配置，在详情的运行记录中查看报告和错误。

此模板由系统调度执行，关闭 AgentHub 后计划继续生效，执行时需要当前用户保持登录。最多等待 Agent 30 分钟，超时保留 Herdr 会话供检查；缺少依赖、登录失败或 Agent 返回错误时，任务标记为失败。

`run.sh` / `run.ps1` 是系统任务入口，负责启动 Python 脚本；无需把任务提示词改写成 Shell 命令。Codex 默认使用 `--dangerously-bypass-approvals-and-sandbox`，执行期间无需交互确认；只读检查范围由提示词约定。高级设置的额外参数保存在 `herdr.json` 的 `extra_arguments`，解析引号后追加到 `arguments` 之后，按 argv 传递，不执行 Shell 展开。

Agent 在 Herdr 的新标签页运行，不抢占焦点。上次仍在工作时直接跳过本次触发，不排队；等待确认或状态不明时不重复提交；异常会话保留供人工处理。Herdr 会话进入就绪状态不代表审计或验证通过，应检查具体输出。
