# V1 发布验收清单

本清单区分“仓库内已验证”和“必须由 GitHub Runner/干净系统验证”。需求状态仍记录在 `.scratch/`，本文件只提供发布操作顺序。

## 仓库内门禁

```bash
npm ci
npm run format:check
npm run lint
npm run test
npm run build
npm run version:check -- v0.1.0
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/workflows/*.yml
```

这些门禁验证源码、版本、发布汇总脚本和 workflow contract，但不能代替三个托管 Runner 的真实打包。

## 手动候选包

工作流提交到远程并完成 `gh auth login` 后运行：

```bash
gh workflow run "Build Installers" \
  --ref main
gh run list --workflow "Build Installers" --limit 1
gh run watch <run-id> --exit-status
gh run download <run-id> --name "agent-hub-installers-<run-id>"
```

汇总 artifact 必须同时包含 `.exe`、`.msi`、`.dmg`、`.AppImage`、`.deb`、`SHA256SUMS`、`CHANGELOG.md`、`PLATFORM_SUPPORT.md` 和 `RELEASE_NOTES.md`。下载后运行 `npm run release:verify -- <bundle-directory>` 校验所有文件和 SHA-256，再分别在干净 Windows、macOS 和 Linux 环境验证安装、启动、数据目录保留和卸载。

## Tag 发布

1. 把 `CHANGELOG.md` 的 `Unreleased` 内容归档到与版本一致的章节。
2. 修改仓库根目录 `VERSION`，运行 `npm run version:sync` 同步所有 manifest，再运行 `npm run version:check -- v<version>` 校验；也可使用 `npm run version:set -- <version>` 一步完成修改与同步。
3. 提交版本变更，创建并推送 `v<version>` tag。
4. 确认质量门禁和三个矩阵 job 全部成功，之后才应出现 GitHub Release。
5. 下载 Release 附件并核验 `SHA256SUMS`、发布说明、平台支持矩阵及所有安装格式。

平台签名默认关闭。只有六项 Apple Secrets 已完整配置时，才把 `ENABLE_APPLE_SIGNING` 设为 `true`；只有 Base64 PFX、密码和时间戳 URL 三项 Windows Secrets 已完整配置时，才把 `ENABLE_WINDOWS_SIGNING` 设为 `true`。未启用签名时必须在发布说明中保留限制。

## 完成判定

- 手动构建和 tag 构建都会创建 Release；两条触发路径分别留存 run URL 和结论。
- 任一安装格式缺失、checksum 不匹配、版本不一致或矩阵 job 失败，均不得发布。
- B14 只有在三平台安装/启动、配置扫描、安全写入、SQLite 新装和 migration 升级均通过后才能标记 `resolved`。
