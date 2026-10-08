# B31：复用 GitHub CLI 登录并修复非交互认证

Type: bug
Status: resolved
Blocked by: none

## Scope

备份页新增默认开启的 gh 开关，偏好保存在本机数据库，桌面和 CLI 启动加载，关闭后不查询 gh。GitHub HTTPS 备份优先使用已有 gh 登录，gh 缺失或未登录时使用应用凭据。系统 Git 与 libgit2 使用统一选择逻辑；其他主机和 SSH 保留原有流程。

## Acceptance

- 有 gh 登录时不读取陈旧的应用令牌，也不持久化 gh 令牌副本。
- 未安装或未登录 gh 时仍能通过应用令牌备份；关闭开关后不调用 gh，页面保存失败时保持原值。
- 禁用交互提示时仍可向 Git 提供凭据；凭据 helper 不向其他主机返回令牌，不调用系统 helper 的读取或写入。
- 测试不读取开发者真实登录，不在日志或 fixture 写入真实凭据和身份信息。

## Evidence

凭据优先级回归修复前失败、修复后通过。真实 Git credential fill 回归在 credential.interactive=false 下复现 askpass 失败，替换为非交互 helper 后通过。生产凭据路径只读访问实际备份远端成功；随后使用运行中桌面程序的环境调用真实备份目录的 fetch 与 AgentHub push，均成功，本地与远端 main 一致。只记录布尔结果，不输出令牌。

## Review

- Standards：凭据来源选择与 gh 进程适配独立模块，复用可执行文件探测和凭据类型；令牌仅通过子进程环境传递。
- Spec：gh 是可选优化，不要求用户安装；保持应用授权入口，已补充实际备份推送验收。失效 gh 令牌仍需更新 CLI 登录。

## Result

默认开启 gh 登录复用；备份页提供持久化开关，关闭后跳过 gh 查询。无 gh 时应用凭据继续可用。凭据通过目标主机限定的非交互 helper 提供，不依赖密码提示脚本。认证失败提示区分 CLI 登录与应用重新授权，来源日志不含令牌。

验证：`cargo test --manifest-path src-tauri/Cargo.toml`（604 个库测试、6 个 CLI 测试通过，8 个已有测试忽略）；`npm test`（70 项）；`npm run build`；`npm run lint`；Rust 格式与严格 Clippy 检查通过。开关关闭、CLI 缺失/退出/令牌轮换、主机隔离及禁用交互提示的回归通过。实机备份 fetch、push 成功。

## Comments

2026-10-08：按反馈将 gh 与自动备份开关合并到同一张“备份设置”卡片，以分隔线区分设置项；保留独立说明与原有保存行为。布局提取为 BackupPreferences，减少页面职责。

分组调整验证：npm run build、npm run lint、npm test（70 项）、npm run tasks:check 与 git diff --check 通过。Standards：复用现有开关并抽取设置分组组件；Spec：单一卡片包含两个设置项，无独立子卡片。
