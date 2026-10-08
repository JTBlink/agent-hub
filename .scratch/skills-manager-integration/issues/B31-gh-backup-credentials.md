# B31：复用 GitHub CLI 登录并修复非交互认证

Type: bug
Status: claimed
Blocked by: none

## Scope

备份页新增默认开启的 gh 开关，偏好保存在本机数据库，桌面和 CLI 启动加载，关闭后不查询 gh。GitHub HTTPS 备份优先使用已有 gh 登录，gh 缺失或未登录时使用应用凭据。系统 Git 与 libgit2 使用统一选择逻辑；其他主机和 SSH 保留原有流程。

## Acceptance

- 有 gh 登录时不读取陈旧的应用令牌，也不持久化 gh 令牌副本。
- 未安装或未登录 gh 时仍能通过应用令牌备份；关闭开关后不调用 gh，页面保存失败时保持原值。
- 禁用交互提示时仍可向 Git 提供凭据；凭据 helper 不向其他主机返回令牌，不调用系统 helper 的读取或写入。
- 测试不读取开发者真实登录，不在日志或 fixture 写入真实凭据和身份信息。

## Evidence

凭据优先级回归修复前失败、修复后通过。真实 Git credential fill 回归在 credential.interactive=false 下复现 askpass 失败，替换为非交互 helper 后通过。生产凭据路径只读访问实际备份远端成功；只记录结果，未向备份远端写入。

## Review

- Standards：凭据来源选择与 gh 进程适配独立模块，复用可执行文件探测和凭据类型；令牌仅通过子进程环境传递。
- Spec：gh 是可选优化，不要求用户安装；保持应用授权入口，未把有效认证读取宣称为完整备份成功。失效 gh 令牌仍需更新 CLI 登录。
