Type: bug
Status: resolved
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
- Spec：已复现并修复代码及依赖阻塞，线上发布源切换、手动部署和访问回验全部完成。
- 修复提交 `d17b6b35f67d6dd8be3e803ac0ae25f723622e17` 已 push 到 main；Pages 实际配置已切换为 `build_type: workflow`。旧 source 元数据仍可保留为 main 根目录，检查以 build_type 为准。
- [官网重新部署](https://github.com/JTBlink/agent-hub/actions/runs/38258461497) 成功，headSha 为上述修复提交；CI 的 npm ci、发布源检查、网站构建与部署全部通过。
- [产品首页](https://jtblink.github.io/agent-hub/)和[中文文档](https://jtblink.github.io/agent-hub/docs/zh/) HTTP 200；线上 35 个页面 / 资源 URL 全部 HTTP 200，主页展示 0.1.5，不再引用 `/src/main.tsx`。本次仅重新部署官网，没有移动 tag 或重发安装包。
- 隔离验证 worktree 已移除。可用的浏览器工具未提供 in-app browser，因此线上回验使用实际 HTTP 内容与资源请求；未将浏览器渲染验收记录为通过。
