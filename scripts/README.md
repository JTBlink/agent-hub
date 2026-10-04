# scripts/

发布流水线和开发辅助脚本，均为 ES module（`.mjs`）。每个脚本既可通过 `package.json` 的 `npm run` 调用，也可直接 `node scripts/<name>.mjs` 单独执行。

## 脚本说明

### 版本管理

| 脚本                | 作用                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-version.mjs` | 读取 `package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock`、`tauri.conf.json` 五处版本号，验证它们完全一致；可附带 git tag 做额外校验。 |
| `set-version.mjs`   | 接受一个 semver 版本号，一次性同步更新上述所有文件，避免手动改漏。                                                                                |

```bash
node scripts/check-version.mjs              # 仅校验
node scripts/check-version.mjs v1.2.3      # 同时验证与 tag 是否匹配
node scripts/set-version.mjs 1.2.3         # 同步所有文件到新版本
```

### 发布打包

| 脚本                        | 作用                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assemble-release.mjs`      | 收拢多平台构建产物（`.exe`、`.msi`、`.dmg`、`.AppImage`、`.deb`）、展平目录层级、生成 `SHA256SUMS`，并从 `CHANGELOG.md` 提取当前版本内容写成 `RELEASE_NOTES.md`。 |
| `verify-release-bundle.mjs` | 对 `assemble-release` 的输出做验收：逐文件重算 SHA256 并比对、确认所有平台安装包位于根层级、检查 `CHANGELOG.md`/`PLATFORM_SUPPORT.md`/`RELEASE_NOTES.md` 齐全。   |

```bash
node scripts/assemble-release.mjs <output-dir> <build-ref>
node scripts/verify-release-bundle.mjs <bundle-dir>
```

### 任务状态

`check-task-status.mjs` 校验 `.scratch/skills-manager-integration/` 中任务和状态汇总，可传入其他 tracker 目录作为参数。

## 测试

关键构建、版本和发布逻辑由 `.test.mjs` 覆盖，通过 `npm test` 运行。

## 主应用与 CLI

`primary-app.mjs` 统一开发和打包流程，提前构建并放置 `agent-hub-cli` sidecar。`run-rust-cli.mjs` 提供 CLI 运行、构建和安装入口。前端、桌面与 CLI 均使用根目录工程。
