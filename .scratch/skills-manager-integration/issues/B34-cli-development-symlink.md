# B34：开发环境软链接安装 CLI

Type: task
Status: resolved
Blocked by: none

## Scope

在 Unix 开发入口 `agent-hub.sh` 中提供 CLI 自动安装命令：构建当前仓库的 CLI，并将用户命令目录中的 `agent-hub-cli` 软链接到构建产物。桌面应用的随包 CLI 发布逻辑保持原有的版本校验与复制机制。

## Acceptance

- 默认在 Cargo bin 目录创建软链接，可选 debug 或 release 构建，也可指定链接目录。
- 重复安装可更新本仓库的链接，不覆盖普通文件或其他软链接。
- 构建失败时不创建链接；使用说明和帮助列出命令。

## Review

- Standards：复用 Cargo 的 CLI bin 构建，脚本只负责开发环境命令入口；不改动桌面端 CLI bridge。
- Spec：安装结果是软链接，指向本仓库当前构建产物；默认目录通常已随 Rust 环境加入 PATH。

## Result

`./agent-hub.sh install [debug|release]` 编译并安装软链接，支持 `AGENT_HUB_CLI_BIN_DIR`。通过 `bash -n agent-hub.sh`、`git diff --check`、临时目录中的安装及重复安装验证，链接执行 `--version` 成功；已有文件和外部软链接的覆盖保护验证通过。
