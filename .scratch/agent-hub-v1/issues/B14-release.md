# B14：完成跨平台验收与 V1 发布

Type: task
Status: claimed
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
- 已增加 `scripts/workflow-contract.test.mjs`（10 个 workflow 断言）和 [V1 发布验收清单](../../../docs/development/release-checklist.md)。
- 已将生产签名和 Release 条件收紧为 `github.event_name == 'push'` 且 ref 为 `v*`；从 Actions 页面手动选择 tag 也只生成无签名 artifact，不会读取发布 Secrets 或创建 Release。
- 手动输入的 branch/tag/commit 现由 preflight 一次解析为不可变 commit SHA，质量门禁、矩阵构建和汇总任务不再各自重新解析可变分支。
- 汇总阶段会扁平化五种安装包并拒绝同名冲突，生成的 `SHA256SUMS` 可与 GitHub Release 扁平附件直接配合使用；Apple 与 Windows preflight 也已拆分为最小 Secrets 暴露范围。
- 当前工作树已重新生成 `AgentHub.app` 和 `AgentHub_0.1.0_x64.dmg`；`hdiutil verify` 通过、应用版本为 `0.1.0`，未签名状态与默认发布配置一致。
- 新增 `npm run release:verify -- <bundle-directory>`，package job 在上传汇总 artifact 前自动验证五种安装包、三份元数据、校验和及路径边界；完整前端/脚本测试现为 26 项。

## Current status

CI/CD 自动化实现已完成，当前仍等待远程 GitHub Actions 首次手动运行，以验证 Windows、Linux 和 macOS Universal runner 的真实产物路径；B13 的应用级安装、启动、配置扫描和升级验收仍未完成，因此本任务暂不标记 `resolved`。
