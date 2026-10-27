# 当前 CI/CD 配置

本文记录工作流与环境配置；版本选择、提交、候选、tag 和验收统一见 [版本发布流程](release-flow.md)。GitHub 负责构建与发布，需求、状态与版本归属保存在 Issues 和 Milestones。

## 工作流

| Workflow               | 触发方式                             | 结果                                       |
| ---------------------- | ------------------------------------ | ------------------------------------------ |
| `ci.yml`               | 仅 `workflow_dispatch`               | 格式、lint、测试与前端构建，不生成安装包   |
| `build-installers.yml` | `workflow_dispatch` 或 `v*` tag push | 手动运行生成平台候选；tag 运行创建 Release |
| `deploy-pages.yml`     | `workflow_dispatch` 或 `v*` tag push | 部署主页和文档站                           |

普通分支 push / PR 不自动运行构建。`issue-metadata.yml` 在 Issue、发布事件或手动调用时同步标签和里程碑，只授予 `contents: read` 与 `issues: write`；安装包 package job 发布成功后也直接同步里程碑，额外授予该 job `issues: write`。现有 workflow 不升级应用版本或创建 tag。

### 安装包构建

- preflight 固定事件的 `github.sha`；质量检查、平台矩阵和汇总检出同一 SHA。tag preflight 检查该 SHA 的成功手动候选。
- concurrency 按事件和 SHA 隔离，`cancel-in-progress: false`；不同 SHA 可独立验证。
- Node.js 22、`npm ci`、Rust stable；各平台 core tests 在安装包编译前执行。Runner、架构与安装格式见 [平台支持](platform-support.md)。
- 构建统一经过 `scripts/build.mjs`：CI 用 `npm run app:build -- <Tauri 参数>`，本地用 `./agent-hub.sh build` 或 `agent-hub.bat build`，均在对应原生平台运行并准备 CLI sidecar。
- 平台 artifacts 保留 1 天。汇总执行 `release:assemble` / `release:verify`，生成扁平安装包、SHA256SUMS 和说明文件；当前不上传汇总 artifact。
- tag 运行在全部平台成功后发布附件；已有 Release 跳过发布，不覆盖附件。手动运行只提供平台 artifacts，不读取生产签名 Secrets。

### 主页与文档站

产物为 `_site/`，公开文档位于 `/agent-hub/docs/`。普通主页或文档变更不自动部署，可从 main 手动运行 `deploy-pages.yml`。

仓库 Settings → Pages → Build and deployment → Source 必须选择 **GitHub Actions**（`build_type: workflow`）。根 `index.html` 是桌面开发入口，不能从 main 根目录直接发布。`scripts/check-pages-config.mjs` 在部署前核对发布源，API 失败或 legacy 模式会阻止部署。

更新依赖锁文件后，使用 CI 对应的 npm 10 执行干净 `npm ci`。VitePress 的 DocSearch 可能需要独立的 React 18 peer 依赖，不用 `--legacy-peer-deps` 绕过一致性检查。

## 签名配置

默认生成未签名包。需要签名时设置仓库 Variable，并完整配置对应 Secrets：

| 平台    | Variable                      | 必需 Secrets                                                                                                               |
| ------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| macOS   | `ENABLE_APPLE_SIGNING=true`   | `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID` |
| Windows | `ENABLE_WINDOWS_SIGNING=true` | `WINDOWS_CERTIFICATE`（Base64 PFX）、`WINDOWS_CERTIFICATE_PASSWORD`、`WINDOWS_SIGNING_TIMESTAMP_URL`                       |

只有受控 tag push 读取生产凭据；手动候选不读取。开关开启但凭据缺失时 preflight 失败。macOS 由 Tauri 公证并检查 stapler / spctl；Windows 使用 `signtool.exe` 签署 `.exe`。证书和密码只存入 Secrets，发布使用最小权限的 GITHUB_TOKEN。

工作流权限、缓存与资源维护规则见 [Actions 规范](actions.md)，运行失败的诊断见 [故障处理](actions-troubleshooting.md)。
