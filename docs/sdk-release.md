# AgentHub Core SDK 发布规范

SDK 的维护目录是 `packages/agent-hub-core/`，crate 名和安装命令统一为 `agent-hub-core`。正式发行渠道为 crates.io。GitHub Actions 验证候选和标签，Git 源码提交为完整 SDK 提供可追溯的下载来源。

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
gh run watch <sdk-release-gate-run-id> --exit-status
```

标签必须指向候选验收的同一提交。**SDK Release Gate** 重新校验同提交候选的归档与附件。已占用的标签保留对应关系。候选过期时，在同一提交上重新构建候选。

## 3. 发布并从 crates.io 验收

从同一提交验收的 SDK 候选归档生成注册表工作区。桌面宿主及 React 源码进入 `agent-hub-desktop`，字体与许可证进入 `agent-hub-fonts`。先发布两个配套包，再发布使用精确版本依赖的 `agent-hub-core`。发布凭据使用本机 Cargo 认证或 crates.io Trusted Publishing。

```bash
node packages/agent-hub-core/package-registry.mjs <candidate-archive> <new-registry-directory>
cd <new-registry-directory>
cargo test --locked --workspace --all-features
cargo publish --locked -p agent-hub-fonts
cargo publish --locked -p agent-hub-desktop
cargo publish --dry-run --locked --all-features -p agent-hub-core
cargo publish --locked --all-features -p agent-hub-core
cargo install agent-hub-core --version "=${sdk_version}" --features sdk-cli --locked
agent-hub-sdk lock
agent-hub-sdk install <new-sdk-directory>
```

在禁止访问 GitHub 的环境中验证安装命令的版本和锁文件，核对 Cargo 包内的 SDK 源码提交，确认解包后包含对应版本的 README、变更日志和构建入口。保留 crates.io 链接、标签解引用提交和候选记录。发布失败时对已验收版本续发。

旧 SDK 的 GitHub Release 附件只能在替代版本通过 registry 下载验收后清理。Git 标签及其指向的源码提交仍作为安装来源保留。
