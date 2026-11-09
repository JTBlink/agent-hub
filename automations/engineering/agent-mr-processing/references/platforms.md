# 平台配置

`review_host.py` 从真实 remote 核实平台、仓库、CLI 登录及用户身份。多 remote 用 `config/review-config.json` 的 remote 指定；provider 为 auto/github/gitlab。

GitHub 默认 gh；GitLab 必须配置项目允许的 gitlab_cli argv，不默认调用 PATH glab。argv 支持 ~/；项目激活命令放 project_preflight，必须匹配的 JSON 字段放 project_preflight_expected。校验失败停止，不换工具或身份。

max_pages 默认 3，每页 100，按创建时间升序。达到上限明确日志范围，不宣称全仓库无候选。Agent 写入前仍须核实版本和权限。启动配置在 config/agent.json；升级保留本机 CLI、激活检查、项目和日程，不删除旧状态或报告。
