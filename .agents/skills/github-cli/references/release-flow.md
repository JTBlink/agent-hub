# 版本发布与自动打 tag

项目现有构建脚本不创建 Git tag；自动打 tag 由使用本 skill 的 Agent 在发布任务中执行。CI 职责与签名配置见 [CI/CD](ci-cd.md)，工作流设计见 [Actions 规范](actions.md)。

## 版本与发布准备

1. 确认用户要求的发布范围、目标分支和实际发布远端；检查 HEAD 与工作区，不静默纳入无关改动。发布授权包含本次版本同步、发布提交、tag 和推送；仅要求普通提交或规范维护时不打 tag。
2. `VERSION` 为唯一版本来源，tag 为 `v<version>`。使用指定版本；缺少版本时按当前发布约定与变更范围判断，无法确定才询问。预发布版本包含 `-`，CI 标记为 prerelease。
3. 执行 `npm run version:set -- <version>` 同步前端、Cargo、Tauri 与锁文件，再执行 `npm run version:check -- v<version>`。
4. 将正式说明写入 `CHANGELOG.md` 对应版本章节，保留新的 `Unreleased`；同步 tracker。说明与发布提交一致，不提前宣布未完成功能。
5. 执行 [开发检查](../../rust-dev/references/development.md)，完成 Standards / Spec 审查；发布脚本与 workflow 改动运行相关合约测试。按 [提交规范](../../rust-dev/references/commit-conventions.md) 提交发布内容。
6. **打 tag 前必须在本地运行 CI 同等质量门禁**——至少 `npm run format:check`、`npm run lint`（零 error）、`npm run test`、`npm run build`，全部通过后再推送 tag。不能依赖远端 CI 作为首次格式 / lint 检查；本地验证失败时修复并重新提交，不推送 tag。
7. 最终打 tag 前工作区干净；tag 指向含版本、说明及本次功能的已验证发布 SHA。

普通分支 push 不自动执行 CI。需要远端候选验证时手动运行 CI 或 Build Installers；手动构建只产出候选 artifacts，不创建正式 Release。

## 自动创建与推送

先读取 `VERSION` 得到版本 tag，固定当前发布 SHA；检查本地与远端 tag 后按下表决定下一步。远端查询同时检查 tag 对象及解引用目标，兼容 annotated 和 lightweight tag。

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
git tag -a "$release_tag" "$release_sha" -m "发布 ${release_tag}"
git push origin "refs/tags/${release_tag}:refs/tags/${release_tag}"
```

`origin` 是常用远端示例，执行前核实发布仓库；需要同步分支时先推送已授权的目标分支，再推送 tag。不使用 `git push --tags`、`--force`，不移动或删除已发布 tag。已经存在的正确 tag 跳过创建步骤。

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
- tag 已推送、构建失败但无 Release：先确认远端不存在对应版本的 GitHub Release 且无用户可下载产物。满足条件时可删除远端和本地旧 tag，在修复后的新提交上重建同版本 tag 并推送，触发新一轮构建。执行顺序：`git push origin --delete v<version>` → `git tag -d v<version>` → 修复提交 → 本地质量门禁全部通过 → `git tag v<version>` → `git push origin v<version>`。
- tag 已推送、构建失败且 Release 已存在：保留 tag，定位失败 job；无代码变更时重新运行原失败 workflow run。手动 Build Installers 不会补建正式 Release。
- 修复需新提交且 Release 已存在：使用新版本与新 tag，不能移动原 tag。
- Release 已存在：当前 workflow 跳过发布，不覆盖附件。检查已有产物；缺失或损坏时按用户授权的修复范围处理，不删除重建或反复触发。
