# 版本发布与自动打 tag

项目现有构建脚本不创建 Git tag；自动打 tag 由使用本 skill 的 Agent 在发布任务中执行。CI 职责与签名配置见 [CI/CD](ci-cd.md)，工作流设计见 [Actions 规范](actions.md)。

## main 单线与分支集成

本仓库发布直接使用 main、固定 commit SHA 与版本 tag，不创建 `release/*` 或独立候选分支。隔离验证使用 `git worktree add --detach <temporary-directory> <release-sha>`，完成后移除自己创建的 worktree。

- 开始集成前 fetch 实际远端的 main 与目标分支，检查工作区和其他 worktree；保留其他任务的未提交改动，不通过 reset、全量 stash 或删除 worktree 腾出环境。
- 临时工作分支的改动完成并通过审查后及时集成，不积压到发版。将其本次提交 `git rebase <remote>/main`，解决冲突并验证受影响行为；main 前进时重新 rebase。然后在 main 执行 `git merge --ff-only <work-branch>`，普通 push 同步 main；快进或 push 失败就重新核实远端，不能改用 merge commit 或强推 main。
- rebase 只整理尚未合入 main 的本次提交，不改写 main 或既有发布 tag。共享临时分支需改写时先核实协作状态，不覆盖他人的新提交。`git cherry -v <remote>/main <work-branch>` 显示补丁已在 main 时，核对对应改动后允许 rebase 跳过重复提交，不制造空提交。
- 集成后确认远端 main 已包含本次改动、临时分支无独有改动且没有其他任务使用，再清理自己创建的临时 worktree、本地与远端分支。本地使用 `git branch -d`；远端删除前记录并核对目标 SHA，使用带该预期 SHA 的 lease 防止误删已前进分支。仍有独有改动或活动任务时保留并说明，不能强删。

## 版本与发布准备

1. 确认用户要求的发布范围和实际发布远端，以 main 为发布主线；检查 HEAD 与工作区，不静默纳入无关改动。发布授权包含本次版本同步、发布提交、tag 和推送；仅要求普通提交或规范维护时不打 tag。
2. `VERSION` 为唯一版本来源，tag 为 `v<version>`。保留用户指定版本，不能因构建失败自动升级；缺少版本时按当前发布约定与变更范围判断，无法确定才询问。预发布版本包含 `-`，CI 标记为 prerelease。
3. 版本配置已一致时只执行 `npm run version:check -- v<version>`；需要设置或同步时执行 `npm run version:set -- <version>`，再检查前端、Cargo、Tauri 与锁文件。
4. 将正式说明写入 `CHANGELOG.md` 对应版本章节，保留新的 `Unreleased`；同步 tracker。说明与发布提交一致，不提前宣布未完成功能。
5. 执行 [开发检查](../../rust-dev/references/development.md)，完成 Standards / Spec 审查；发布脚本与 workflow 改动运行相关合约测试。按 [提交规范](../../rust-dev/references/commit-conventions.md) 提交发布内容。
6. 固定已提交的发布 SHA，在临时 detached worktree 核实源码完整性，并按风险验证失败点及尚未覆盖的检查。本机未提交或被忽略的源码不能参与发布验证；完整前端 / Rust 门禁必须由该 SHA 的干净检出通过，可复用成功候选中的质量 job，无需再重复全套本地检查。
7. 查询同 SHA 的三平台 Build Installers 候选：成功则复用，进行中则跟踪，没有可用候选才确认远端 main 指向该 SHA 并手动运行。全部测试、打包、安装 smoke 和汇总校验通过后，执行 `npm run release:ready -- v<version>`，再在同一 SHA 创建 tag。细节见 [发布前验证](release-prevention.md)。
8. 最终打 tag 前发布检出干净；tag 指向含版本、说明及本次功能的已验证发布 SHA。新提交需要自己的候选证据；共享主分支继续前进不改变原 SHA 的证据。

共享工作区可能在等待构建期间被其他任务提交。记录仓库、版本、发布 SHA、候选 workflow / event / run ID；使用隔离检出操作，只纳入本次发布范围的提交。当前手动工作流按 ref 触发，不能用 `--ref main` 指定已离开 main 顶端的旧 SHA。触发前核实远端 main，触发后核对 run 的 `headSha` 与 preflight 固定的构建 SHA；不同则不能作为本次候选。main 已变化且原 SHA 没有可用候选时，先核实新增提交符合发布范围，再明确重新选择并验证新 SHA；不能静默换 SHA 或另建候选分支绕过。原 SHA 已有成功候选时仍可在其 detached 检出打 tag。候选和 tag 始终绑定固定 SHA，不按“最新运行”判断。

普通分支 push 不自动执行 CI。发布必须有成功的同 SHA 手动 Build Installers 候选；独立 CI 适用于只需质量诊断的任务，无需和安装包候选重复执行。手动构建只产出候选 artifacts，不创建正式 Release。

## 自动创建与推送

先读取 `VERSION` 得到版本 tag，固定当前发布 SHA；在创建和推送前重新检查本地、远端 tag 与对应 Release，按下表决定下一步。其他发布任务已经创建正确 tag 时复用并跟踪，不竞争发布。远端查询同时检查 tag 对象及解引用目标，兼容 annotated 和 lightweight tag。

| 状态                                                   | 执行行为                                               |
| ------------------------------------------------------ | ------------------------------------------------------ |
| 本地和远端均无同名 tag                                 | 在发布 SHA 创建 annotated tag，推送该 tag              |
| 本地同名 tag 解引用后等于发布 SHA，远端无 tag          | 复用本地 tag，继续推送                                 |
| 远端同名 tag 已指向发布 SHA，本地无 tag或 tag 对象相同 | 不重复创建；检查对应 Actions / Release，按失败恢复处理 |
| 同名 tag 指向不同 SHA，或本地与远端 tag 对象不一致     | 停止推送并报告冲突；不覆盖、不强推                     |
| 无法查询远端                                           | 报告错误，不能把查询失败当作 tag 不存在                |

本地比较用 `git rev-parse "refs/tags/<tag>^{commit}"`。远端用 `git ls-remote --tags <remote> "refs/tags/<tag>" "refs/tags/<tag>^{}"`；有解引用行时使用该 SHA，否则使用 tag 行。仅查询当前 tag，不拉取或推送全部 tags。

以下为 Unix shell 的执行片段，需在上述检查通过后由 Agent 顺序执行，任一步失败即停止。Windows 使用等价 PowerShell 命令。

```bash
release_version="$(tr -d '[:space:]' < VERSION)"
release_tag="v${release_version}"
release_sha="$(git rev-parse HEAD)"
npm run version:check -- "$release_tag"
npm run release:ready -- "$release_tag"
git tag -a "$release_tag" "$release_sha" -m "发布 ${release_tag}"
git push origin "refs/tags/${release_tag}:refs/tags/${release_tag}"
```

`origin` 是常用远端示例，执行前核实发布仓库；发布 SHA 应先进入远端 main，再推送 tag。不使用 `git push --tags`、`--force`，不移动或删除已发布 tag。已经存在的正确 tag 跳过创建步骤。

## 构建、产物与成功判定

- tag push 触发 `build-installers.yml`。preflight 固定不可变 SHA；质量门禁、平台矩阵和汇总均检出该 SHA。
- 当前格式为 Windows x86_64 NSIS `.exe`、macOS Universal `.dmg`、Linux x86_64 `.AppImage` / `.deb`；不声称提供 `.msi`。本机验证不能替代原生矩阵。
- 打包经 `npm run app:build -- <Tauri 参数>` 等包装入口，包含匹配版本与架构的 CLI sidecar。
- 汇总执行 `release:assemble` 与 `release:verify`，生成根层级安装包、`SHA256SUMS`、`CHANGELOG.md`、`PLATFORM_SUPPORT.md`、`RELEASE_NOTES.md`。校验覆盖全部附件。
- 三个平台任一失败不创建不完整的正式 Release；缺少签名或公证证据不得宣称已经完成。手动构建不读取生产签名 Secrets。
- 主页由 `deploy-pages.yml` 独立部署，分别报告其结果，不能将主页成功当作安装包发布成功。
- 成功证据为：远端 tag 与目标 SHA、成功的 Build Installers run、对应 Release 及完整附件。汇报可验证链接、签名状态与 [安装验收](release-checklist.md)；仅有 tag 或 artifacts 不等于正式 Release 完成。

## 失败与重试

- 推送前检查失败：保留准备结果，修复后继续，不跳过质量门禁。
- tag 已推送、构建失败但无 Release：同 SHA 临时故障重跑原失败任务；源码修复先完成新 SHA 的候选验证，再处理下述版本与 tag 冲突，不反复删除重建同版本 tag 试错。
- tag 已推送、构建失败且 Release 已存在：保留 tag，定位失败 job；无代码变更时重新运行原失败 workflow run。手动 Build Installers 不会补建正式 Release。
- 修复需新提交且 Release 已存在：保留原 tag 与附件；正式发布修复需要新版本、新 tag。用户要求保持原版本时，完成可验证修复并报告这一冲突，不擅自升级。
- Release 已存在：当前 workflow 跳过发布，不覆盖附件。检查已有产物；缺失或损坏时按用户授权的修复范围处理，不删除重建或反复触发。

### 指定版本与既有 tag 冲突

默认保留所有既有 tag。用户要求修好原版本，本身不等于授权删除或改写 tag；先交付修复 SHA、成功候选和旧 / 新 SHA 的差异，再说明恢复方案。没有固定版本约束时，可按已授权的发布范围选择新版本；有约束时不能自动改版本绕过冲突。

未发布的失败 tag 只有在用户明确授权重建该 tag 后才可恢复同版本发布：操作前重新确认没有对应 Release（查询失败不能当作不存在），保存旧 tag 对象与解引用 SHA，核实新 SHA 已通过完整候选，限定本次 tag 操作；状态已变化则停止并核实。已发布 tag 不采用此恢复方式。本 skill 不把其他任务删除 tag 的行为当作授权，也不提供自动删 tag 的重试循环。
