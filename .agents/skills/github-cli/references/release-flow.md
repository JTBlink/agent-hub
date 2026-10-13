# 版本发布流程

用户要求正式发布时，Agent 连续完成以下六步。仅要求准备、候选构建或文档整理时，做到授权范围为止。命令中的 `<remote>`、`<repo>`、`<version>` 和 `<release-sha>` 使用本次实际值。

## 1. 选择版本

确认发布仓库、远端和发布范围。新发布未指定版本时运行：

```bash
node .agents/skills/github-cli/scripts/select-release-version.mjs --remote <remote>
```

- 默认升级 patch；VERSION 已高于远端最新稳定版且未被 tag 占用时，沿用 VERSION；没有稳定版 tag 时使用当前稳定版 VERSION。
- 指定版本优先；明确要求 minor / major 时使用 `--bump minor` / `--bump major`。当前 VERSION 为预发布版本时需明确目标版本。
- 继续或修复发布时，沿用 tracker 中的版本。失败 tag 也占用版本；远端查询失败立即停止。

把目标版本、选版依据和发布范围写入 `.scratch/`。后续失败不重新升级版本。

## 2. 准备并提交发布内容

1. fetch 远端 main；临时分支 rebase 到最新 main 后以 `merge --ff-only` 集成，普通 push 同步。发布不创建独立分支，不改写 main，不纳入其他任务的未提交改动。
2. 需要更新版本时执行 `npm run version:set -- <version>`；已一致时执行 `npm run version:check -- v<version>`。根目录 VERSION 是唯一版本来源。
3. 自动核对上一个正式发布 tag 到本次提交的实际 diff、Unreleased 和任务结果，补齐 CHANGELOG 的目标版本章节，合并重复条目并保留 Unreleased。基线 tag 必须已发布且是本次提交的祖先；首次发布按全部发布内容整理。
4. 发布期间纳入的修复更新同一版本章节；未纳入本次源码的变化留在 Unreleased。说明与源码一起提交；任何新增提交都需要重新固定 SHA、验证候选。
5. 检查本次改动与需求是否一致；文档检查结构、引用和隐私，执行 `git diff --check`。workflow 改动运行 `npm test -- scripts/workflow-contract.test.mjs`，发布脚本改动运行对应测试；完整前端 / Rust 检查由第 3 步候选执行。
6. 用中文 Conventional Commits 标题提交，正文写明 tracker 路径、变更与验证结果；不提交个人信息、凭据或本机绝对路径。推送 main，确认远端包含发布内容后记录完整发布 SHA。

集成完成后，只清理自己创建且无人使用的 worktree 与分支。本地分支用 `git branch -d`；删除远端分支前确认无独有改动，并用预期 SHA 的 lease 防止误删已前进的分支。

## 3. 验证同一 SHA 的候选

在隔离检出中核实所有源码已提交，避免本机未跟踪或被忽略的文件影响验证：

```bash
git worktree add --detach <temporary-checkout> <release-sha>
gh run list --repo <repo> --workflow build-installers.yml --event workflow_dispatch --commit <release-sha> --json databaseId,headSha,status,conclusion,url
```

已有成功候选就复用；进行中就跟踪。没有可用候选时，确认远端 main 仍指向发布 SHA，再触发：

```bash
gh workflow run build-installers.yml --repo <repo> --ref main
```

记录 run ID，核对实际构建 SHA，等待质量检查、三平台 core tests、安装启动 smoke 和汇总校验全部成功。在上述干净检出目录执行：

```bash
npm run release:ready -- v<version>
```

该命令检查版本、干净检出和同 SHA 的完整候选记录；不检查 tag 冲突、Release 附件或 artifact 保留期。已有候选质量检查可复用，无需另跑重复 CI。候选 artifacts 过期不抹去成功记录，正式 tag 会重新构建安装包。

main 在等待期间前进时，已有候选仍只证明原 SHA。原 SHA 没有可用候选时，先核实新增提交的发布范围，再重新固定并验证新 SHA；不能静默换用最新运行。

## 4. 创建并推送 tag

在创建与推送前检查本地 tag、远端 tag 和对应 Release：

- 均不存在：在已验证 SHA 创建 annotated tag。
- 本地 tag 指向发布 SHA、远端不存在：复用并推送。
- 远端 tag 已指向发布 SHA，且本地不存在或 tag 对象一致：直接跟踪对应发布。
- SHA 或 tag 对象冲突、远端查询失败：停止，不覆盖。

本地目标用 `git rev-parse "refs/tags/<tag>^{commit}"` 检查；远端用 `git ls-remote --tags <remote> "refs/tags/<tag>" "refs/tags/<tag>^{}"`，优先采用解引用 SHA。

检查通过后，在干净发布检出中逐条执行；任一步失败即停止，已有正确 tag 跳过创建：

```bash
npm run version:check -- v<version>
npm run release:ready -- v<version>
git tag -a v<version> <release-sha> -m "发布 v<version>"
git push <remote> refs/tags/v<version>:refs/tags/v<version>
```

只推送本次 tag，不使用 `--tags` 或强推，不移动已发布 tag。

## 5. 跟踪正式构建与官网

按 workflow、push 事件和发布 SHA 找到正式运行，记录 run ID 并跟踪到结束：

```bash
gh run list --repo <repo> --workflow build-installers.yml --event push --commit <release-sha> --json databaseId,headSha,status,conclusion,url
gh run list --repo <repo> --workflow deploy-pages.yml --event push --commit <release-sha> --json databaseId,headSha,status,conclusion,url
```

安装包矩阵见 [平台支持](platform-support.md)。三平台全部成功后才创建 Release；手动候选不会创建 Release。官网由独立工作流部署，单独核验线上主页、文档与资源。

候选不读取生产签名 Secrets；正式包的签名开关与凭据见 [CI/CD 配置](ci-cd.md#签名配置)。开关关闭时如实报告未签名；开启时必须通过签名与公证检查。

## 6. 下载并验收

下载本次 Release 的全部附件到自己创建的临时目录，在发布 SHA 的隔离检出中校验：

```bash
gh release download v<version> --repo <repo> --dir <temporary-download>
npm run release:verify -- <temporary-download>
```

- 确认四种安装格式、SHA256SUMS、CHANGELOG、PLATFORM_SUPPORT、RELEASE_NOTES 完整；Release 正文与下载的版本说明对应发布源码。
- 在各平台干净用户环境验证首次启动、技能库、工作空间、设置、主题、品牌图标与卸载；确认 CLI 版本和架构、本地数据路径。涉及备份改动且有测试远端时验证备份、恢复与冲突。未完成的原生验收如实列出。
- 回写 tracker：版本、tag、解引用 SHA、候选与正式 run、Release 链接、附件校验、签名及官网结果。清理自己的下载目录和 worktree。

正式安装包工作流成功、Release 存在且附件校验通过，才可报告发布完成；只有 tag 或候选 artifacts 不算完成。

## 失败时怎么继续

- 同 SHA 的临时故障：按 [Actions 故障处理](actions-troubleshooting.md) 重跑失败任务；相同原因再次出现就修复，不盲目重试。汇总依赖的 artifacts 过期时重建完整矩阵。
- 修复产生新 SHA：回到第 2 步，更新同一版本说明并验证新候选。已占用的 tag 不自动移动；已发布版本的源码修复使用新版本。
- 用户指定版本与既有 tag 冲突：先完成修复与候选并报告差异。只有用户明确授权，且再次确认无对应 Release、保存旧 tag 对象与 SHA 后，才可重建未发布的失败 tag。不能擅自升级绕过约束。
- Release 已存在：当前 workflow 不覆盖附件，先校验现有产物；缺失或损坏按用户授权范围处理，不删除重建 Release。
