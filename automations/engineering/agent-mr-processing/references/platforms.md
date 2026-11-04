# 平台检测与配置

任务包自带检测脚本、Herdr launcher 和配置，脚本可从所选项目目录独立运行，无需开发仓库或当前对话。系统调度直接执行任务包，关闭 AgentHub 后仍可运行。运行依赖为 Python 3、Git、Herdr、所选 Agent、已安装的 `code-review` Skill，以及对应平台已登录的 CLI。GitHub 使用 `gh`，GitLab 使用 `glab`；只需准备实际平台的 CLI。`config/herdr.json` 指定已有且运行中的 Herdr 会话，默认为 `default`。

`config/review-config.json` 的默认配置：

```json
{
  "provider": "auto",
  "remote": null,
  "github_cli": ["gh"],
  "gitlab_cli": ["glab"],
  "max_pages": 3
}
```

优先读取当前分支跟踪的 remote；没有跟踪配置且仅有一个 remote 时使用该 remote。多个远端且无法唯一确定时，须在 `remote` 中指定名称，不猜测仓库。支持 HTTPS、SSH URL 和 SCP 格式，GitLab 支持多级群组路径。

`github.com` 和 `gitlab.com` 直接确定平台；自建主机通过该主机的 CLI 登录状态判断。无法唯一识别时停止，可明确设置 `provider` 为 `github` 或 `gitlab`。登录、网络、API 或配置失败均报告错误，不启动 Agent，也不视为“没有候选”。所有平台 API 调用固定为 GET，并显式指定主机和仓库，避免环境中的默认仓库覆盖目标。

项目要求专用 CLI launcher 时，在 `github_cli` / `gitlab_cli` 配置它的 argv 数组，例如 `["node", "<launcher-path>"]`；命令不经过 Shell，仅展开参数开头的 `~/`，不执行环境变量或命令展开，也不在指定入口失败后回退其他 CLI。沿目标项目声明的工具配置入口，不在模板中绑定特定组织、域名或安装路径。

`max_pages` 为每轮最多查询的页数，默认 3，每页最多 100 条，可设为 1–20。使用任务中选择的项目工作目录，脚本不会搜索其他项目。

手动只检测候选：

```sh
# 在所选项目目录执行，路径替换为当前任务包目录。
python3 '<task-directory>/scripts/review.py' --check
```

该命令不启动 Herdr 或 Agent。正常运行和定时运行均经过同一检测入口，已有任务编辑后需确认入口为 `scripts/review.py`。
