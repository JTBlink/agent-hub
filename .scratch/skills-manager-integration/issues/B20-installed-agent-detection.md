# B20：仅把本机已安装的 Agent 判为有效

Type: task
Status: resolved
Blocked by: none

## Scope

已安装状态必须基于可执行程序、桌面应用或宿主已安装的 IDE 扩展，目录状态和 Skills 路径不能单独作为安装证据。首页及状态 DTO 使用统一判断，保留只读 Skills 发现。

## Acceptance

- 增加相关回归测试，更新产品说明和 CHANGELOG。
- 构建、测试、格式、lint 和严格 Clippy 检查通过。

## Result

安装状态统一依据可执行文件、桌面应用或已安装宿主的扩展；手动路径不能增加安装统计，明确指定的自定义部署目标仍保留使用能力。本机 CLI 实测仅 Claude Code、Codex、OpenCode、Hermes 4 个 Agent 安装并启用。

验证：安装证据、不可执行文件、失效扩展、宿主缺失和手动目标均有回归；`cargo test`、`cargo fmt --all -- --check`、严格 Clippy 及前端构建/lint/test 通过。

## Review

- Standards：安装探测集中在 tool_detection，桌面 DTO 与 CLI 共用；不运行 Agent、不以目录推断安装，测试不依赖宿主安装状态。
- Spec：首页只统计 installed && enabled；原生 Skills 发现与明确配置的部署目标保持可用。
