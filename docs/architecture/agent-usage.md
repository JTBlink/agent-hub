# Agent 订阅用量

用量查询独立于技能库、项目与终端，首期支持 Claude Code 与 Codex 的官方订阅额度。它查询账户额度，不统计本地会话 token，也不估算 API 账单。

## 模块边界

- `src-tauri/src/core/agent_usage/` 定义快照、提供方适配器、凭据读取和内存缓存；不依赖窗口、数据库或 Tauri。
- `src-tauri/src/commands/agent_usage.rs` 读取应用代理设置，将查询委托给 core。
- `src/lib/tauri.ts` 提供 `getAgentUsage`；`src/lib/agentUsage.ts` 保存展示契约与有效周期计算。
- `src/hooks/useAgentUsage.ts` 管理前台刷新和请求状态；`src/components/usage/` 独立展示状态栏摘要与详情。

`Layout` 只挂载状态栏组件。更换项目或页面不重建查询模块；后续提供方只扩展 core 适配器和共享提供方定义，不进入项目或终端生命周期。

## 获取方式

Claude 使用 `CLAUDE_CONFIG_DIR` 或默认 `~/.claude`。macOS 优先读取对应账户的 Claude Code Keychain 项，再兼容 `.credentials.json`；自定义配置目录使用独立服务名，不回退到另一个账户。读取现有 OAuth access token 后请求 `https://api.anthropic.com/api/oauth/usage`。环境或全局 settings 明确配置 API key／自定义服务时显示不支持。登录失效时由 Claude Code 自己更新登录，本模块不刷新或重写凭据。

Codex 复用工具检测模块解析本机 CLI，以临时目录启动短期 `codex app-server`，继承当前 CLI 环境及 `CODEX_HOME`；仅为该探测进程覆盖审批策略为 never、沙箱为 read-only，避免旧审批配置阻止启动，不修改配置文件。完成 initialize 握手后，先以 `refreshToken: false` 调用 `account/read`，仅对 ChatGPT 账户调用 `account/rateLimits/read`；模型提供方的 `requiresOpenaiAuth` 不用于否定已有 ChatGPT 账户。优先使用 `rateLimitsByLimitId.codex`，兼容单 bucket 响应。允许跳过启动提示和空行，仍限制总输出与查询时长。整个流程不创建 thread、turn 或发送提示词。协议见 [Codex App Server](https://learn.chatgpt.com/docs/app-server)。

## 缓存与刷新

每个提供方独立互斥锁合并并发查询；普通读取缓存 120 秒，显式刷新和临时查询错误的最短间隔为 15 秒。429 按 Retry-After 冷却，未提供时使用 300 秒。两个提供方并行，单方失败不影响另一个结果。Claude HTTP 超时 12 秒；Codex 协议查询超时 40 秒，并在完成、失败或超时后回收探测进程，Unix 同时回收其独立进程组。

界面仅在窗口可见且拥有焦点时启动查询，每 5 分钟自动刷新，恢复焦点时补查；网络、协议或 IPC 等临时查询错误在前台每 30 秒重试，恢复后回到正常周期。登录、权限和限流状态不进入快速重试。手动打开详情或点击刷新也能查询。卸载清理监听与计时器，旧请求不能覆盖新生命周期的结果。正在刷新时保留已有数据显示；失败清除旧百分比，显示明确状态。超过重置时间的缓存周期不再作为当前额度展示。

## 数据与隐私

桌面应用可能不继承终端 Shell 的代理环境变量。CLI 在终端中能查询、桌面中却报网络错误时，应核对应用的网络代理设置；用量查询读取该设置，并将代理传给短期 Codex 探测进程。

IPC 仅返回提供方、状态、周期百分比、重置时间、查询时间及冷却秒数，不包含凭据或账户身份。HTTP 重定向关闭；凭据和响应体不写日志。凭据文件上限 1 MiB、Claude 响应上限 1 MiB、Codex 协议输出上限 2 MiB。查询快照只保存在进程内存，无数据库迁移、配置持久化或备份内容。

状态栏始终保留用量详情入口；有有效额度时展示提供方百分比，真实的 0% 用量仍然展示。没有有效数据时显示“Agent 用量”图标与文字，不显示占位百分比，仍可打开详情并手动刷新。详情区分没有额度数据、未安装 CLI、未登录、API key 模式、凭据不可读、登录失效、无权限、限流、网络失败与响应异常；未知额度不显示为 0%。
