Type: bug
Status: claimed
Blocked by: none

# 恢复 0.1.5 安装包发布

## Scope

用户要求处理 0.1.5 打包失败并重新发布。保留当前版本，基于 main 上已验证的 npm 10 锁文件修复执行完整三平台候选，再按固定 SHA 恢复正式发布；不创建 release 分支、不跳过质量门禁。

## Acceptance

- 质量门禁、Windows x86_64、macOS Universal、Linux x86_64 core tests、安装包与 smoke，以及汇总校验均通过。
- 干净检出的 `release:ready -- v0.1.5` 验证成功，候选与正式产物绑定同一 SHA。
- tag 与候选一致，正式 Actions 成功，Release 附件完整并通过校验；准确报告签名和原生验收边界。
- 既有失败 tag 的重建遵循明确授权，保留原 tag 对象与 SHA，操作前重新核实未存在 Release。

## Evidence

- [旧正式运行](https://github.com/JTBlink/agent-hub/actions/runs/38257325394) 在 `Require a successful candidate for this release commit` 失败，后续质量 / 三平台 / 汇总全部 skipped，不能归因为原生编译失败。
- 远端 lightweight `v0.1.5` 指向 `c0ceb7f4949595facfbb424ba692ed66eb640de5`；该 SHA 无成功候选，查询时没有对应 Release。
- main 的 `d17b6b3` 已补齐 npm 10 所需锁定依赖；隔离 Node.js 22 / npm 10 的真实安装、326 项测试、应用和网站构建通过。

## Result

- 已核实失败原因；完成三平台候选后再处理未发布 tag 与修复 SHA 的冲突。
- 用户已明确要求“提交 push”“更新 tag”，授权将尚未发布的失败 v0.1.5 更新到本次通过完整候选验证的修复 SHA；操作前仍重新确认不存在 Release、保存旧 tag 并核对远端状态。
- [首轮修复候选](https://github.com/JTBlink/agent-hub/actions/runs/38260043773) 的完整质量门禁通过；Windows 原生测试在 project_skill_update 的四个用例中失败，均来自 fixture 用只读 File::open 句柄调用 set_times，返回 PermissionDenied。macOS / Linux 的正常构建继续跟踪。
- fixture 改用 OpenOptions 的可写句柄，保持内容、不截断文件，保留四个失败用例的业务断言；没有修改恢复业务逻辑或跳过 Windows 检查。新 SHA 需重新完成三平台候选。
- 本地相关 5 个恢复行为测试、Rust 格式与严格 all-targets Clippy 通过。Windows 失败与句柄权限契约一致，参见 [SetFileTime 官方说明](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfiletime)。Standards / Spec 复核：修正 fixture 权限，不改变恢复保护、失败保留与路径防护的测试行为。
- 旧 workflow 按 main ref 分组，会让新修复取消仍在正常编译的旧 macOS；历史 Universal job 耗时约 33 分钟。安装包改为按事件 / SHA 隔离并保护运行中任务，preflight 直接检出事件 SHA，新候选无需另建分支或取消旧构建。github-cli 修正到 1.4.1，同步现行并发与不可变检出规范。
- 新增并发合约回归：同一 main 的不同提交应属于不同组，同 SHA 复用同组，候选 / tag 分组分离且运行中任务受保护。改动前重现同 ref 分组冲突；改动后发布 / 工作流相关 49 项测试与 lint 通过，随后进一步验证同 SHA 在不同 ref 上仍复用同组，并核对 preflight 检出事件 SHA。
