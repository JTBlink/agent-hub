# AgentHub Core SDK 发布规范

SDK 的维护目录是 `packages/agent-hub-core/`，crate 名和安装命令统一为 `agent-hub-core`。正式发行渠道为 crates.io。GitHub Actions 验证同一提交的候选和标签，再按依赖顺序发布全部 SDK 包。

## 1. 选择版本并提交

- SDK 版本源为 `packages/agent-hub-core/VERSION`。默认补丁升级，兼容的新能力可选 `--bump minor`，需要迁移的契约变更用 `--bump major`。已经准备的版本可复用。
- 同步 SDK 的 Cargo 清单、宿主的 Cargo 依赖及两份锁文件。把本次变更加入 SDK 的 `CHANGELOG.md`。桌面基础版本继续由根目录 `VERSION` 管理。
- 将改动提交并推送到 `main`，核对本地检出干净且远端包含同一个提交。crates.io 包从发行提交打包，以便 Cargo 记录源码提交。

```bash
node packages/agent-hub-core/bump-version.mjs --write
cargo update --manifest-path packages/agent-hub-core/Cargo.toml --workspace
cargo update --manifest-path src-tauri/Cargo.toml -p agent-hub-core
```

## 2. 验收候选和 Git 标签

用 `sdk-candidate.yml` 验证干净提交。候选须覆盖归档 SHA-256、两个不同能力和侧栏配置的下游构建、Rust 宿主和 CLI 编译。记录运行 ID 和实际 `headSha`。

```bash
gh workflow run sdk-candidate.yml --ref main
gh run watch <candidate-run-id> --exit-status
sdk_version="$(cat packages/agent-hub-core/VERSION)"
sdk_tag="sdk-v${sdk_version}"
sdk_commit="$(git rev-parse HEAD)"
git tag -a "$sdk_tag" "$sdk_commit" -m "发布 AgentHub Core SDK $sdk_version"
git push origin "refs/tags/${sdk_tag}:refs/tags/${sdk_tag}"
gh run watch <sdk-release-run-id> --exit-status
```

标签必须指向候选验收的同一提交。**SDK Release** 重新校验同提交候选的归档与附件，再进入 crates.io 发布任务。已占用的标签保留对应关系。候选过期时，在同一提交上重新构建候选。

## 3. 发布并从 crates.io 验收

发布任务运行在 GitHub Actions 的 `sdk-release` 环境。首次接入时，在该环境的 Secrets 中配置 `CARGO_REGISTRY_TOKEN`。令牌的包名范围覆盖 `agent-hub-fonts`、`agent-hub-desktop` 和 `agent-hub-core`。新包需要 `Publish new crates`，已有包需要 `Publish new versions`。候选构建无需发布令牌。

每次推送 SDK 标签并通过候选校验后，发布任务自动执行：

1. 从验收归档生成注册表工作区。
2. 依次发布字体、Desktop 和 Core。续发时会比对已经上传的包，只有内容一致才接着发布。
3. 从 crates.io 安装指定版本的 SDK，禁用 Git 后解包并核对版本及源码提交。

保留 crates.io 链接、标签解引用提交和候选记录。发布失败时，在相同标签和候选下重跑 SDK Release。桌面应用发布仍走独立流程。

旧 SDK 的 GitHub Release 附件只能在替代版本通过 registry 下载验收后清理。Git 标签及其指向的源码提交仍作为安装来源保留。
