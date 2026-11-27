# AgentHub SDK 发布规范

SDK 的版本源是 `packages/agent-hub-sdk/VERSION`，正式标签使用 `sdk-v<版本>`。桌面应用继续由根目录 `VERSION` 和 `v<版本>` 管理。下游默认通过 crates.io 引用 `agent-hub-sdk`，它使用同版本 GitHub Release 中经过校验的完整源码归档。

## 1. 升级 SDK 版本并固定发布提交

- 首次发布使用 SDK 版本文件中的稳定版本。后续只读取远端 `sdk-v*` 标签，按版本号比较。默认递增补丁版本，适用于兼容修复、构建改进和文档更新。兼容的新能力用 `--bump minor`，需要下游迁移的契约变更用 `--bump major`。
- 选版工具默认预览，加 `--write` 才更新 SDK 的 `VERSION`。已经准备但尚未打标签的版本会被复用。最高远端标签如果尚无正式 Release，先按失败续发流程处理该版本。
- 在 `packages/agent-hub-sdk/CHANGELOG.md` 增加目标版本小节，说明下游变化和迁移要求。归档会提供 `SDK-CHANGELOG.md`，Release 正文从目标版本小节生成。
- 确认变更已经提交至远端 `main`，源目录干净，发行 README 和变更说明随源码提交。
- 核对归档范围，公共 SDK 随包提供共享源码和模板，各产品的私有清单、品牌与扩展由各自仓库分发。

```bash
git fetch origin main --tags
node packages/agent-hub-sdk/bump-version.mjs
node packages/agent-hub-sdk/bump-version.mjs --write
```

提交并推送版本、变更日志和本次 SDK 改动后，固定发布提交。

```bash
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
git push origin "refs/tags/${sdk_tag}:refs/tags/${sdk_tag}"
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

## 5. 发布 crates.io 引用入口

GitHub Release 下载验收完成后，将发行清单的 `version`、`revision` 和 `sha256` 写入 `packages/agent-hub-sdk/registry-release.json`，`source` 填写该归档的正式 HTTPS 地址。同步该目录下 Cargo 清单和锁文件中的包版本。SDK 归档、Cargo 包和锁文件使用同一 SDK 版本。

对 Cargo 包执行编译、打包预检，并用包中的安装命令验证锁文件和完整 SDK 下载。提交注册表元数据后执行正式发布。发布凭据使用本机 Cargo 认证或 crates.io Trusted Publishing。

```bash
cargo test --locked --manifest-path packages/agent-hub-sdk/Cargo.toml
cargo publish --dry-run --locked --manifest-path packages/agent-hub-sdk/Cargo.toml
cargo publish --locked --manifest-path packages/agent-hub-sdk/Cargo.toml
cargo install agent-hub-sdk --version "=${sdk_version}" --locked
```

最后验证安装的命令能输出匹配的锁文件并下载、解压归档。如注册表发布失败，对已经验收的版本续发。

## 失败续发

候选失败时先按阶段定位，再重新验证同一提交。需要修正源码时，使用新的提交生成候选。如果标签已推送，保留原标签的对应关系。候选过期时为原标签所在提交重新运行候选，再重跑原发布。已发布版本的归档和校验文件保持原样，修复内容通过下一 SDK 版本交付。
