Type: bug
Status: claimed
Blocked by: none

# 修复官网资源 404 与部署阻塞

## Scope

修复公开主页加载失败：GitHub Pages 实际使用 legacy 模式发布 main 根目录，返回桌面开发入口，其 `/src/main.tsx` 请求 404；对应版本的官网部署又被 npm 10 无法安装现有锁文件阻断。

## Acceptance

- Pages 使用 GitHub Actions 的 `_site/` 产物，主页与文档站正常访问，主页本地资源无 404。
- Node.js 22 对应 npm 10 可从提交的锁文件执行干净安装和网站构建，不绕过 peer 依赖检查。
- 部署前检查实际 Pages 发布源，错误配置明确失败；覆盖当前 legacy / main 根目录的回归场景。
- 保留 main 单线、当前应用版本与既有 tag；仅提交相关修复，不触发安装包发布。

## Evidence

- 公开主页 HTTP 200，但正文为桌面根入口；其 `/src/main.tsx` HTTP 404，`/agent-hub/docs/zh/` 也为 404。
- Pages API 返回 `build_type: legacy`、`source: main /`。
- v0.1.5 官网运行在 `npm ci` 失败，缺少 React 18 及相关 peer 依赖；本机 npm 11 的 dry-run 通过，但 npm 10.9.8 重现同一 EUSAGE。

## Result

- npm 10.9.8 补齐 DocSearch 所需的嵌套 React 18 peer 依赖，保留应用 React 19 与现有版本，不使用 legacy-peer-deps。
- 隔离目录使用 Node.js 22.23.3 / npm 10.9.8：真实 `npm ci`、官网与文档构建、69 个文件 / 326 项前端测试、应用类型检查与构建通过。
- 发布源检查的 4 项 CLI 回归测试、主页资源测试与 24 项 workflow 合约通过；真实 Pages 配置为 legacy 时检查明确失败。
- 网站产物的 1,841 个本地 HTML / CSS 资源引用有效，主页没有桌面 `/src/main.tsx` 入口。lint、相关 Prettier、版本检查与 git diff --check 通过。
- Standards：只补齐锁定依赖和官网部署门禁，权限沿用最小 pages / contents 读写范围；不更改安装包工作流或既有 tag。
- Spec：已复现并修复代码及依赖阻塞，线上发布源切换、手动部署和访问回验待完成。
