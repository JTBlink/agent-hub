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

### 开发辅助

| 脚本                      | 作用                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `serve-d04-prototype.mjs` | 为 `.scratch/prototypes/d04-ux/` 启动本地静态服务器（默认端口 `4173`，可通过 `AGENT_HUB_PROTOTYPE_PORT` 覆盖）。 |
| `check-task-status.mjs`   | 校验 `.scratch/agent-hub-v1/status.md` 与 `issues/*.md` 的任务状态是否一致。                                     |

```bash
node scripts/serve-d04-prototype.mjs
# 访问 http://127.0.0.1:4173/?variant=A
```

## 测试

每个脚本均有对应的 `.test.mjs` 文件，通过 `npm run test` 运行。
