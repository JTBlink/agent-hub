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

`issue-metadata.mjs` 同步 GitHub Issue 的分诊标签、目标里程碑和发布归属；由 `issue-metadata.yml` 调用。任务状态使用 GitHub 原生状态，不再校验仓库内任务索引。

## 测试

关键构建、版本和发布逻辑由 `.test.mjs` 覆盖，通过 `npm test` 运行。

## 主应用与 CLI

`primary-app.mjs` 统一开发和打包流程，提前构建并放置 `agent-hub-cli` sidecar。`run-rust-cli.mjs` 提供 CLI 运行、构建和安装入口。前端、桌面与 CLI 均使用根目录工程。

`./agent-hub.sh install` 默认进入 Tauri 打包流程。Unix 开发环境如需只更新 CLI，可运行 `./agent-hub.sh install --dev`：它会将 `${CARGO_HOME:-~/.cargo}/bin/agent-hub-cli` 链接到仓库的 debug 构建产物，并刷新 `~/.agent-hub/bin/agent-hub-cli` bridge，使 `agent-hub-cli` 立即使用本次构建；追加 `release` 可构建 release CLI。`AGENT_HUB_CLI_BIN_DIR` 可指定链接目录，`AGENT_HUB_BRIDGE_DIR` 可指定开发 bridge 目录。已有普通文件或指向其他位置的 Cargo 软链接不会被覆盖。

### 构建缓存自动清理

桌面打包（`npm run app:build` / `npm run tauri -- build`）、CLI 构建/安装和 `npm run app:test` 成功后自动调用 `build-cache.mjs`。失败时保留已有产物；开发服务器运行期间不清理。

- 按架构、debug/release、编译模式和 feature 配置保留最新应用产物；共享依赖、Cargo build-script 输出和增量缓存继续复用。
- 从当前 `libapp_lib.rlib` 的归档清单识别仍被引用的目标文件，删除历史编译遗留的 `app_lib.*.rcgu.o`；归档缺失时跳过这些文件，归档损坏时停止本次清理并提示。
- 测试和 CLI 的同一 artifact hash 可能留下多次编译的目标文件，只保留最近一次 session。自动入口跳过本轮构建开始后更新的文件。
- 安装包在各自目录中按名称、架构和格式分组，保留最近构建的一份，删除旧版本及其 `.sig`。当前可执行文件与无版本号的固定输出保留。
- 支持 `CARGO_TARGET_DIR`；不遍历构建目录内的目录符号链接。清理失败只报告原因，不改变成功构建的退出状态。

也可在没有其他 Cargo 编译运行时手动执行：

```bash
npm run app:prune -- --dry-run  # 预览历史产物数量
npm run app:prune              # 保留最新构建，清理历史产物
npm run app:clean              # 完整删除 Cargo 构建缓存，下次重新编译
```
