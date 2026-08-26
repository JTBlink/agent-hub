# B14：完成跨平台验收与 V1 发布

Type: task
Status: resolved
Blocked by: B13

## 交付

完成 GitHub Actions CI/CD、macOS/Windows/Linux 安装包、升级路径、权限诊断和 V1 验收。

## 验收标准

- PR 和 `main` 提交自动执行前端及 Rust 格式、lint、类型检查和测试。
- `v*` tag 自动并行构建 Windows、macOS、Linux 安装包并创建 GitHub Release。
- Windows 生成 `.msi`/`.exe`，macOS 生成 `.dmg`，Linux 生成 `.AppImage`/`.deb`。
- Release 附带 SHA-256 校验和、变更日志和平台支持矩阵。
- 三个平台完成安装、启动、配置扫描和至少一次安全写入测试。
- macOS notarization、Windows 签名及发布 Secrets 有明确配置和保护规则。
- 验证路径、文件权限、符号链接和换行符差异。
- 新安装与数据库 migration 升级均通过。
- 发布说明列出支持矩阵、已知限制和数据目录位置。
- 完成 Standards + Spec 两轴代码审查，无阻塞问题。

## Comments

- 已落地 `ci.yml` 和 `build-installers.yml`：支持手动三平台打包以及 `v*` tag 自动发布。
- macOS 本地 `.app`/`.dmg` 已验证；Windows、Linux 和 macOS Universal 仍需工作流首次运行验证。
- `hdiutil verify` 已确认本地 DMG 校验和有效，包内版本为 `0.1.0`；当前本地测试包未签名。
- 待提交远程后运行一次手动 workflow，确认三平台 artifact 路径和 GitHub runner 依赖。
- 已增加全平台汇总 artifact；手动和 tag 构建均包含 `SHA256SUMS`、`CHANGELOG.md`、发布说明和平台支持矩阵。
- 版本门禁现同时检查 `package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock` 与 `tauri.conf.json`。
- macOS 本地再次完成 `.app`/`.dmg` 构建，`hdiutil verify` 通过且应用版本为 `0.1.0`；当前包保持未签名。
- 已验证 Tauri 遇到空 Apple 签名变量会失败；workflow 现仅在 tag macOS step 且 `ENABLE_APPLE_SIGNING=true` 时注入六项 Secrets，否则安全生成未签名包。
- 发布支持矩阵已列出三平台应用数据目录、已知限制和升级数据保留要求。
- tag workflow 支持通过 `ENABLE_WINDOWS_SIGNING` 和 PFX Secrets 可选签署 Windows `.exe`/`.msi`；preflight 会拒绝开启开关但凭据不完整的发布。
- 已增加 `scripts/workflow-contract.test.mjs`（11 个 workflow 断言）和 [V1 发布验收清单](../../../docs/development/release-checklist.md)。
- 已将生产签名和 Release 条件收紧为 `github.event_name == 'push'` 且 ref 为 `v*`；从 Actions 页面手动选择 tag 也只生成无签名 artifact，不会读取发布 Secrets 或创建 Release。
- 手动输入的 branch/tag/commit 现由 preflight 一次解析为不可变 commit SHA，质量门禁、矩阵构建和汇总任务不再各自重新解析可变分支。
- 汇总阶段会扁平化五种安装包并拒绝同名冲突，生成的 `SHA256SUMS` 可与 GitHub Release 扁平附件直接配合使用；Apple 与 Windows preflight 也已拆分为最小 Secrets 暴露范围。
- 当前工作树已重新生成 `AgentHub.app` 和 `AgentHub_0.1.0_x64.dmg`；`hdiutil verify` 通过、应用版本为 `0.1.0`，未签名状态与默认发布配置一致。
- 新增 `npm run release:verify -- <bundle-directory>`，package job 在上传汇总 artifact 前自动验证五种安装包、三份元数据、校验和及路径边界；完整前端/脚本测试现为 26 项。
- 远程手动构建已完成：[`Build Installers #32581079170`](https://github.com/JTBlink/agent-hub/actions/runs/32581079170)（最新 `main` 提交 `a056117f4f99fd8493ebaf4be152a86ceadc43f3`，输入 `ref=main`）。`Validate release metadata`、`Verify release candidate`、Windows x86_64、Linux x86_64、macOS Universal 和 `Assemble installers and checksums` 均为 success；`Publish GitHub Release` 为 skipped，确认手动构建不发布。前一轮 [`#32580327269`](https://github.com/JTBlink/agent-hub/actions/runs/32580327269) 也通过。
- 远程产物已核验：汇总 artifact `agent-hub-installers-32581079170`（artifact ID `9477871486`）包含 `AgentHub_0.1.0_x64-setup.exe`、`AgentHub_0.1.0_x64_en-US.msi`、`AgentHub_0.1.0_universal.dmg`、`AgentHub_0.1.0_amd64.AppImage`、`AgentHub_0.1.0_amd64.deb`、`CHANGELOG.md`、`PLATFORM_SUPPORT.md`、`RELEASE_NOTES.md` 和 `SHA256SUMS`。下载后压缩包完整性检查和 `shasum -a 256 -c SHA256SUMS` 全部通过，`hdiutil verify` 确认 Universal DMG 有效。
- 最新 `main` 提交 `a056117f4f99fd8493ebaf4be152a86ceadc43f3` 的 [`CI #32580341632`](https://github.com/JTBlink/agent-hub/actions/runs/32580341632) 为 success；本地 workflow contract、release assembly/verification/version 脚本共 23 项定向测试通过，`actionlint v1.7.7` 退出码为 0。
- 发布 bundle verifier 现要求每种安装格式恰好一个、所有根目录文件都列入 `SHA256SUMS`、拒绝符号链接/特殊文件、安装包文件名版本与 `package.json` 一致，并检查发布说明包含三平台、应用数据目录和已知限制；新增 4 项篡改、遗漏、重复格式、版本漂移和符号链接回归测试。
- 当前发布 assembly/verifier/version/workflow 定向测试共 29 项通过，`actionlint v1.7.7` 再次验证工作流无语法或表达式错误；全量前端 37 项和 Rust 71 项测试通过。
- 当前提交已在 Windows 本地完成 NSIS `.exe` 与 MSI 打包，安装包位于 Tauri release bundle；release 二进制可启动并正常响应。Windows CRLF 下的版本校验也已加入回归测试。
- `v0.1.2` tag 已完成正式发布：[`Build Installers #32956993957`](https://github.com/JTBlink/agent-hub/actions/runs/32956993957) 的三平台构建、汇总校验和 Release 发布全部成功；Release 附件下载后 `npm run release:verify` 验证 5 个安装包及 8 个校验文件通过。
- Windows 本地已执行 NSIS 静默安装并启动安装后的 `agent-hub.exe`，进程保持响应；构建矩阵新增 Windows/Linux/macOS 安装后启动 smoke 测试。

## Current status

CI/CD 自动化、`v0.1.2` tag Release、三平台构建与安装启动 smoke、Windows 本地安装启动、配置扫描/安全写入/Rust migration 测试均已验证。签名开关默认关闭；未配置生产证书时发布说明保留未签名限制。
