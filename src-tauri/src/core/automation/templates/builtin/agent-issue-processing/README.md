# Issue 自动处理（Herdr）

每小时第 45 分钟，通过 Herdr 发起交互式 Agent。选择项目工作区后，Herdr 中的 Agent 直接在该目录启动。提示词可在主编辑区修改，脚本目录独立保存。

需安装 Python 3、Herdr CLI 和相应 Agent，并完成平台登录。在 `herdr.json` 中配置已有且运行中的 Herdr 会话（默认为 `default`）。AgentHub 负责定时，Herdr 承载 Agent；关闭 AgentHub 后系统计划仍然有效，但 Herdr 服务须保持运行。

每个任务复用一个固定标签页，不抢占焦点；上一轮结束后，仅替换该任务自己的 Agent 面板，每轮启动全新会话，不累积聊天上下文。手动关闭面板后，下次触发会确认面板已不存在并重新创建。上次仍在工作时直接跳过本次触发，不排队；等待审批或状态不明时保留会话，不重复提交。超时或投递不明确时保留面板，在 Herdr 检查后才可清除脚本目录的 `.herdr-run.json` 重新发起；不自动回答确认框。运行记录保存 Herdr 面板标识及可读取的输出；Agent 就绪不代表任务或验证成功。

此模板可修改代码、推送任务分支和创建草稿 MR/PR；创建前应检查提示词的授权范围。不自动合并、关闭 Issue 或发布。

`herdr.json` 的 `agent` 使用 Herdr 支持的类型；界面按本机检测结果，与全局工作区保持相同的名称、图标和排序（包括 OpenCode、Hermes Agent 等）。`arguments` 是传给该 Agent 的参数数组。更换 Agent 时应使用其对应参数。没有运行中的目标会话时只报告错误，不创建或重启 Herdr 服务。

Codex 默认启动参数为 `--dangerously-bypass-approvals-and-sandbox`，无需交互确认。可在高级设置中填写额外的智能体参数（如 `-m model-id -c model_reasoning_effort=high`），保存在 `herdr.json` 的 `extra_arguments`，解析引号后追加到 `arguments` 之后；参数按 argv 传递，不执行 Shell 展开。其他 Agent 使用其各自支持的参数。

提示词只投递一次，随后持续观察 Agent 状态并收集结果。启动初期的 `unknown` 或旧版 CLI 的 5 秒状态识别超时不会直接判为失败；运行包装器保持执行中，完成后记录输出与终态。
