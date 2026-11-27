# AgentHub SDK 发布规范

SDK 的版本源是 `packages/agent-hub-sdk/VERSION`，正式标签使用 `sdk-v<版本>`。桌面应用继续由根目录 `VERSION` 和 `v<版本>` 管理。SDK Release 在同一个 GitHub 仓库提供版本化下载地址。

## 1. 确认版本和发布提交

- 首次发布使用 SDK 版本文件中的稳定版本。后续发布以 SDK 远端标签为基准，按接口兼容性选择补丁、次版本或主版本。已经占用的标签继续对应原有提交。
- 确认变更已经提交至远端 `main`，源目录干净，发行 README 和变更说明随源码提交。
- 核对归档范围，公共 SDK 随包提供共享源码和模板，各产品的私有清单、品牌与扩展由各自仓库分发。

```bash
git fetch origin main --tags
sdk_version="$(cat packages/agent-hub-sdk/VERSION)"
sdk_tag="sdk-v${sdk_version}"
sdk_commit="$(git rev-parse HEAD)"
test "$sdk_commit" = "$(git rev-parse origin/main)"
git status --short
git ls-remote --tags origin "refs/tags/$sdk_tag" "refs/tags/$sdk_tag^{}"
```

若版本已占用，先核对远端标签、Release 和实际提交，再决定续发同一次发布还是选下一个版本。

## 2. 验收同一提交的候选包

从已核对的 `main` 触发 `sdk-candidate.yml`，记录运行 ID 和实际 `headSha`。如果同一提交已有成功候选且附件可下载，复用该候选。

```bash
gh workflow run sdk-candidate.yml --ref main
gh run list --workflow sdk-candidate.yml --commit "$sdk_commit" --event workflow_dispatch
gh run watch <candidate-run-id> --exit-status
```

候选必须覆盖归档 SHA-256、从解压目录构建不同能力和侧栏的两个产品，以及对应 Rust 宿主和 CLI 编译检查。候选附件保留 1 天。源码前进时，重新固定提交并验证相应候选。

## 3. 推送 SDK 标签

候选成功后，给已验证提交打注解标签并只推送这个标签。

```bash
git tag -a "$sdk_tag" "$sdk_commit" -m "发布 AgentHub SDK $sdk_version"
git push origin "refs/tags/$sdk_tag:refs/tags/$sdk_tag"
gh run list --workflow sdk-release.yml --commit "$sdk_commit" --event push
gh run watch <release-run-id> --exit-status
```

`sdk-release.yml` 会下载同一提交的成功候选，重新核对归档和配套文件，再创建对应 Release。SDK Release 保持独立于桌面应用的最新发布入口。

## 4. 从正式下载地址验收

将下列附件下载到一个空目录，并使用发行提交的校验器检查。发行资产包括 SDK 源码归档、SHA-256、机器可读的发行清单、README、发行说明、安装器和产品构建脚本。

```bash
gh release view "$sdk_tag" --json url,tagName,assets
gh release download "$sdk_tag" --dir <download-directory>
node packages/agent-hub-sdk/verify-release.mjs <download-directory> "$sdk_tag" "$sdk_commit"
```

用正式 Release 的 HTTPS 归档地址和发行清单中的 `version`、`revision`、`sha256` 生成一个下游锁文件，以随发行提供的安装器完成下载、校验和安装。保留候选与正式运行链接、Release 链接、标签解引用提交和校验结果。下游接入方式见仓库 SDK README 或归档根目录的 `README.md`。

## 失败续发

候选失败时先按阶段定位，再重新验证同一提交。需要修正源码时，使用新的提交生成候选。如果标签已推送，保留原标签的对应关系。候选过期时为原标签所在提交重新运行候选，再重跑原发布。已发布版本的归档和校验文件保持原样，修复内容通过下一 SDK 版本交付。
