# 发布前验证与资源控制

## 先验证提交，再创建 tag

真实失败包括全仓库 Prettier 未通过、Rust 模块存在于本机却未提交、Windows 路径行为与 macOS 不同。单台机器或 Linux CI 通过不能覆盖这三类问题。

1. 完成版本、说明和 tracker，提交所有构建所需文件；检查 `git status --short`、`git diff --check`，不要纳入无关改动。被忽略的源码也可能不出现在 status 中。
2. 固定发布 SHA，在临时 detached worktree 检出该提交，核实构建所需文件已提交；本地复现检查时使用 `npm ci` 和锁定依赖。该检出不共享原工作目录的生成文件或未跟踪文件。完整前端 / Rust 门禁可复用同 SHA 成功候选的质量 job，本地重点验证失败点与尚未覆盖的行为，不为同一证据重复全套检查。验证后移除自己创建的 worktree；不能通过清理用户工作区模拟干净检出。
3. 先查询同 SHA 的手动 `build-installers.yml` 候选，复用成功运行或跟踪现有运行；没有可用候选才确认远端 main 指向该 SHA，并以 `--ref main` 触发，不创建发布分支。main 变化时按 [发布流程](release-flow.md) 重新核实范围与 SHA。记录触发时 SHA，按 workflow、事件、main 和 SHA 找到 run，核对实际构建 SHA，等待质量门禁、三平台 core tests、安装启动 smoke 和汇总校验全部通过。普通分支 push 不自动执行；无需同时再跑同一 SHA 的独立 CI。
4. 在干净发布检出执行 `npm run release:ready -- v<version>`。脚本只读 Git / GitHub：核对版本、干净检出、同一 SHA 的成功手动安装包工作流，并检查六个 job、三平台测试与 smoke、汇总校验。无记录、未完成、跳过、SHA 不同、API 错误均不放行。
5. 重新检查同名 tag 与 Release 后在该 SHA 创建并推送 tag。tag 的 preflight 再运行同一候选检查；新提交必须验证自己的 SHA，不能用上一次绿灯发布。共享分支前进时仍可发布原来已验证的 SHA，前提是它包含本次全部发布内容。

```bash
gh workflow run build-installers.yml --repo <owner/repository> --ref main
gh run list --repo <owner/repository> --workflow build-installers.yml --event workflow_dispatch --commit <release-sha> --json databaseId,headSha,status,conclusion,url
npm run release:ready -- v<version>
```

`release:ready` 不检查 tag 冲突、Release 附件或 artifact 保留期，不能把它通过当作正式发布完成。候选 artifacts 到期不抹去历史测试结果；当前 tag 会重新构建安装包，只在需要下载候选或重跑其汇总时核实 artifacts 是否仍可用。

候选不读取生产签名 Secrets。签名开启时，tag 仍必须验证签名凭据和公证；候选通过不能保证外部证书、网络或服务永不失败。脚本用于发布前检查，不在候选工作流中检查候选自身，避免循环依赖。

## 运行与重试

- 同一 SHA 的候选为 queued / in_progress 时继续跟踪；已成功则复用。读取 job 和当前 step，结合启动时间与 timeout 判断；长时间编译并不等于失败。查询间隔与新 SHA 的并发处理见 [Actions 故障处理](actions-troubleshooting.md)。
- 失败先定位最早实质错误；格式或漏文件先在干净提交复现，平台差异在对应原生 Runner 验证。不移动 tag 来试错。
- 同一 SHA 的临时问题优先 `gh run rerun <run-id> --repo <repo> --failed`。同一原因重现即调查修复；不无限重跑。重跑汇总所需的 artifact 已过期或被删除时，重跑所有平台以重建完整同 SHA 产物。
- 修复产生新 SHA 时，先提交、推送并运行新的候选；既有 tag 与指定版本冲突时按 [发布流程](release-flow.md) 处理，不自动升级。手动选择旧 tag 不会创建 Release。

## Public 仓库与免费资源

以下依据 GitHub 官方文档核实于 2026-10-12；仓库可见性、额度与 Runner 标签变更时重新核实，不套用私有仓库的分钟计费。

- 公共仓库使用标准 GitHub-hosted Runner 的运行分钟免费；当前 `ubuntu-24.04`、`windows-latest`、`macos-latest` 均属于标准 Runner。不要为了速度切换到收费 larger / GPU Runner。[Runner 规格](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- Artifact 存储与运行分钟分开计算；当前平台 artifacts 仅保留 1 天，不额外上传重复汇总或完整 target。长期发布文件放 GitHub Release，诊断只取所需日志。
- 默认缓存额度为每仓库 10 GiB；超额付费需要提高缓存限制。保留默认限制，不自动扩大存储额度、修改账户预算或启用付费资源。[计费规则](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- Rust 缓存只由默认分支写入，候选和 tag 可读取可用缓存；避免每个 tag 保存一份大型缓存挤掉默认分支缓存。保持按平台、工具链、锁文件隔离，不删除所有缓存解决普通代码失败。[rust-cache 行为](https://github.com/Swatinem/rust-cache)
- 格式 / lint / 编译检查先于矩阵；各平台 core tests 先于安装包 release 编译。保留完整质量门禁、三平台与 smoke。候选与正式构建仍各执行一次，当前不复用候选安装包发布，避免错误 SHA 或未经签名产物混入 Release。
- 候选与 tag 使用不同 concurrency group，手动重跑不会取消正式 tag 发布；普通分支提交和 PR 保持不自动运行。

可用以下只读命令核实当前仓库与存储，不把账户计费权限失败当作额度足够：

```bash
gh repo view <owner/repository> --json visibility
gh api repos/<owner/repository>/actions/cache/usage
```
