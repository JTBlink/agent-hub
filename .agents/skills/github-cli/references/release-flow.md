# 版本发布与自动打 tag

用户明确要求正式发布时，使用本 skill 的 Agent 自动串联版本选择、同步、提交、候选验证、tag、正式构建与产物验收。现有 Actions 接收候选 dispatch 和 tag push，版本升级与打 tag 由 Agent 执行；普通 push 不自动发版。CI 职责与签名配置见 [CI/CD](ci-cd.md)，工作流设计见 [Actions 规范](actions.md)。

## 按远端 tag 自动选择版本

先确认这是新的正式发布，还是继续、修复或重跑既有发布。明确指定版本时优先使用该版本；续发任务读取 tracker 已选版本，不重新执行自动升级。仅更新 Skill、提交 push、准备候选或重跑编译不授权发布新版本。

新发布未指定版本时，在仓库根目录运行只读选择脚本；执行前核实实际远端，`origin` 为示例：

```bash
node .agents/skills/github-cli/scripts/select-release-version.mjs --remote origin
```

脚本读取 VERSION 和远端 `v*` tags，输出 JSON 中的 `version`、`tag`、`latestTag`、`reason`。远端查询失败直接报错，不能按“没有 tag”处理。按数字比较 SemVer 的 major / minor / patch，不能按字符串、tag 创建时间或最新 Release 排序；annotated tag 的 `^{}` 解引用行不是另一个版本。未发布或构建失败的 tag 也占用版本。稳定版自动选择不使用预发布 tag；当前 VERSION 为预发布时要求明确版本或续发版本，不猜测稳定版转换。

| 当前状态                                       | 新发布自动选择                                     |
| ---------------------------------------------- | -------------------------------------------------- |
| 远端没有稳定版 tag                             | 使用当前稳定版 VERSION                             |
| VERSION 高于最新稳定版 tag，且远端未占用该版本 | 沿用 VERSION，视为已准备版本                       |
| VERSION 已有 tag，或低于最新稳定版 tag         | 从最新稳定版 tag 升级 patch                        |
| 用户明确要求 minor / major                     | 从 VERSION 和最新稳定版 tag 的较高版本升级对应级别 |
| 用户明确指定版本                               | 使用该版本，随后按 tag / Release 冲突规则检查      |
| 继续、修复或重跑既有发布                       | 使用 tracker 已选版本，不升级                      |

例如 VERSION=0.1.5、远端最新 v0.1.5 时选择 0.1.6；VERSION=0.1.6、最新仍为 v0.1.5 时沿用 0.1.6；VERSION=0.1.4、最新 v0.1.5 时选择 0.1.6。首次没有 tag 时沿用 VERSION。`--bump minor` / `--bump major` 明确选择升级级别；`--version <version>` 保留用户指定版本，`--resume-version <version>` 复用已记录的续发版本，两者均不自动避开冲突。

把选择依据、目标版本和发布范围写入 `.scratch/`，再同步版本文件。版本选定并进入候选验证后固定下来；候选失败或共享 main 前进不会重新选择版本。打 tag 前出现新的同名 tag 时按冲突规则处理，不自动改版本重跑整条流程。

## 自动维护发布更新日志

发布授权包含自动整理根目录 CHANGELOG，无需用户另行要求。先确定上一个已正式发布且位于本次源码历史中的 tag，核对其解引用 SHA 与祖先关系；无上一正式版本时按首次发布范围整理。不能用失败 / 未发布 tag、其他分支的最高版本或更新日志中的标题替代真实发布基线。

```bash
git merge-base --is-ancestor <previous-release-tag> <release-sha>
git log --reverse --format='%h %s' <previous-release-tag>..<release-sha>
git diff --stat <previous-release-tag>..<release-sha>
```

在 tracker 记录基线 tag、检查过的提交范围和目标版本。结合实际 diff、已有 Unreleased 与任务结果整理用户可见条目，按 Added / Changed / Fixed / Removed 等现有分类归档。补齐漏记的功能、缺陷修复、兼容性及发布流程变化，合并重复说明；不机械复制全部 commit 标题，也不把领取任务、验收记录或纯格式改动写成新功能。不得把未完成任务描述为已交付。

- 首次准备目标版本：将属于本次源码的 Unreleased 内容迁入 `## [<version>] - <date>`，保留新的 Unreleased，并核对基线之后的提交是否遗漏。
- 发布期间修复、增加或调整本次发布内容：自动更新同一版本章节，不重复创建章节、不再次升级。例如仍在准备 0.1.6 时，新增且纳入发布 SHA 的修复写入 0.1.6，而不是遗留在 Unreleased。
- 说明与源码一起提交，重新固定 SHA 后再触发或复用该 SHA 的候选。候选已通过后新增 CHANGELOG 或代码提交，旧候选不能验证新 SHA；必须重新完成门禁。
- 共享 main 后续提交、未提交改动及下一版内容，只有明确纳入本次发布并重新验证时才归入该版本。已固定 tag 的说明不能包含 tag 源码以外的改动；这些变化继续放在 Unreleased。
- tag 与 Release 已发布后保持源码和附件不变。后续源码修复进入下一版本；发现历史说明错误时按事实更正文档，不移动 tag，也不声称已有附件包含更正后的内容。

打 tag 前再次核对最终 SHA 的提交范围、版本章节和重复条目。`release:assemble` 从该 SHA 读取 CHANGELOG 生成 RELEASE_NOTES；发布后核对 Release 正文及下载的 CHANGELOG、RELEASE_NOTES 与该版本一致，不能只确认本地文件已修改。

## main 单线与分支集成

本仓库发布直接使用 main、固定 commit SHA 与版本 tag，不创建 `release/*` 或独立候选分支。隔离验证使用 `git worktree add --detach <temporary-directory> <release-sha>`，完成后移除自己创建的 worktree。

- 开始集成前 fetch 实际远端的 main 与目标分支，检查工作区和其他 worktree；保留其他任务的未提交改动，不通过 reset、全量 stash 或删除 worktree 腾出环境。
- 临时工作分支的改动完成并通过审查后及时集成，不积压到发版。将其本次提交 `git rebase <remote>/main`，解决冲突并验证受影响行为；main 前进时重新 rebase。然后在 main 执行 `git merge --ff-only <work-branch>`，普通 push 同步 main；快进或 push 失败就重新核实远端，不能改用 merge commit 或强推 main。
- rebase 只整理尚未合入 main 的本次提交，不改写 main 或既有发布 tag。共享临时分支需改写时先核实协作状态，不覆盖他人的新提交。`git cherry -v <remote>/main <work-branch>` 显示补丁已在 main 时，核对对应改动后允许 rebase 跳过重复提交，不制造空提交。
- 集成后确认远端 main 已包含本次改动、临时分支无独有改动且没有其他任务使用，再清理自己创建的临时 worktree、本地与远端分支。本地使用 `git branch -d`；远端删除前记录并核对目标 SHA，使用带该预期 SHA 的 lease 防止误删已前进分支。仍有独有改动或活动任务时保留并说明，不能强删。

## 版本与发布准备

1. 确认用户要求的发布范围和实际发布远端，以 main 为发布主线；检查 HEAD 与工作区，不静默纳入无关改动。发布授权包含本次版本同步、发布提交、tag 和推送；仅要求普通提交或规范维护时不打 tag。
2. 按上述规则选择并记录目标版本；`VERSION` 仍为应用版本唯一来源，远端 tag 仅用于决定是否需要更新 VERSION，tag 为 `v<version>`。保留用户指定版本，不能因构建失败自动升级。预发布版本包含 `-`，CI 标记为 prerelease。
3. 版本配置已一致时只执行 `npm run version:check -- v<version>`；需要设置或同步时执行 `npm run version:set -- <version>`，再检查前端、Cargo、Tauri 与锁文件。
4. 按上述增量规则自动核对提交范围并补全 `CHANGELOG.md` 对应版本章节，保留新的 `Unreleased`；同步 tracker。发布期间纳入的修复及时更新同一版本，说明与发布提交一致，不提前宣布未完成功能。
5. 执行 [开发检查](../../rust-dev/references/development.md)，完成 Standards / Spec 审查；发布脚本与 workflow 改动运行相关合约测试。按 [提交规范](../../rust-dev/references/commit-conventions.md) 提交发布内容。
6. 固定已提交的发布 SHA，在临时 detached worktree 核实源码完整性，并按风险验证失败点及尚未覆盖的检查。本机未提交或被忽略的源码不能参与发布验证；完整前端 / Rust 门禁必须由该 SHA 的干净检出通过，可复用成功候选中的质量 job，无需再重复全套本地检查。
7. 查询同 SHA 的三平台 Build Installers 候选：成功则复用，进行中则跟踪，没有可用候选才确认远端 main 指向该 SHA 并手动运行。全部测试、打包、安装 smoke 和汇总校验通过后，执行 `npm run release:ready -- v<version>`，再在同一 SHA 创建 tag。细节见 [发布前验证](release-prevention.md)。
8. 最终打 tag 前发布检出干净；tag 指向含版本、说明及本次功能的已验证发布 SHA。新提交需要自己的候选证据；共享主分支继续前进不改变原 SHA 的证据。

共享工作区可能在等待构建期间被其他任务提交。记录仓库、版本、发布 SHA、候选 workflow / event / run ID；使用隔离检出操作，只纳入本次发布范围的提交。当前手动工作流按 ref 触发，不能用 `--ref main` 指定已离开 main 顶端的旧 SHA；运行开始后 preflight 检出事件的 `github.sha`，main 再前进不会改变其源码。触发前核实远端 main，触发后核对 run 的 `headSha` 与 preflight 固定的构建 SHA；不同则不能作为本次候选。main 已变化且原 SHA 没有可用候选时，先核实新增提交符合发布范围，再明确重新选择并验证新 SHA；不能静默换 SHA 或另建候选分支绕过。原 SHA 已有成功候选时仍可在其 detached 检出打 tag。候选和 tag 始终绑定固定 SHA，不按“最新运行”判断。

普通分支 push 不自动执行 CI。发布必须有成功的同 SHA 手动 Build Installers 候选；独立 CI 适用于只需质量诊断的任务，无需和安装包候选重复执行。手动构建只产出候选 artifacts，不创建正式 Release。

正式发布授权下，Agent 自动查询、触发和跟踪候选，无需用户另行说“编译”或“打 tag”：

```bash
gh workflow run build-installers.yml --repo <owner/repository> --ref main
gh run list --repo <owner/repository> --workflow build-installers.yml --event workflow_dispatch --commit <release-sha> --json databaseId,headSha,status,conclusion,url
```

仅在没有可复用运行且远端 main 等于发布 SHA 时触发。全部候选 job 成功并通过 `release:ready` 后，继续下文的 tag 精确推送；用 workflow、push 事件和 SHA 找到正式 run，同时跟踪官网部署。不把手动 candidate dispatch 当作正式发布，不为这套 Agent 流程另建版本升级 workflow 或新增发布 token。

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

正式 run 成功后，Agent 自动下载对应版本的全部附件到自己创建的临时目录，在该版本的隔离检出中执行 `release:verify`；官网部署单独核验。校验后回写 tracker，清理自己的临时下载与 worktree，再报告完整发布结果。失败时记录版本、SHA、run ID 和恢复入口，下一次“继续发布”复用这些信息。

## 失败与重试

- 推送前检查失败：保留准备结果，修复后继续，不跳过质量门禁。
- tag 已推送、构建失败但无 Release：同 SHA 临时故障重跑原失败任务；源码修复先完成新 SHA 的候选验证，再处理下述版本与 tag 冲突，不反复删除重建同版本 tag 试错。
- tag 已推送、构建失败且 Release 已存在：保留 tag，定位失败 job；无代码变更时重新运行原失败 workflow run。手动 Build Installers 不会补建正式 Release。
- 修复需新提交且 Release 已存在：保留原 tag 与附件；正式发布修复需要新版本、新 tag。用户要求保持原版本时，完成可验证修复并报告这一冲突，不擅自升级。
- Release 已存在：当前 workflow 跳过发布，不覆盖附件。检查已有产物；缺失或损坏时按用户授权的修复范围处理，不删除重建或反复触发。

### 指定版本与既有 tag 冲突

默认保留所有既有 tag。用户要求修好原版本，本身不等于授权删除或改写 tag；先交付修复 SHA、成功候选和旧 / 新 SHA 的差异，再说明恢复方案。没有固定版本约束时，可按已授权的发布范围选择新版本；有约束时不能自动改版本绕过冲突。

未发布的失败 tag 只有在用户明确授权重建该 tag 后才可恢复同版本发布：操作前重新确认没有对应 Release（查询失败不能当作不存在），保存旧 tag 对象与解引用 SHA，核实新 SHA 已通过完整候选，限定本次 tag 操作；状态已变化则停止并核实。已发布 tag 不采用此恢复方式。本 skill 不把其他任务删除 tag 的行为当作授权，也不提供自动删 tag 的重试循环。
