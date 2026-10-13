Type: task
Status: resolved
Blocked by: W01

# 官网帮助与更新日志入口

## Scope

官网主导航和页脚增加帮助入口，并在官网内展示更新日志。复用现有帮助站，日志正文从根目录 CHANGELOG.md 生成，不维护第二份日志。

## Acceptance

- 主导航、首屏与页脚提供中文帮助入口；主导航与页脚提供官网内更新日志入口。
- 更新日志由当前 CHANGELOG.md 构建，明确含未发布变更；帮助站可在三种界面语言下访问日志，正文未翻译时注明中文回退。
- 移动布局、键盘、链接、构建与相关测试通过；按本次会话授权提交 push 并验证 Pages。

- 顶部与首屏下载直接进入用户指定 GitHub Releases，不触发页内滚动。

## Comments

- 保留当前工作区其他侧栏导航修改，只暂存本任务文件及独立 changelog 增量。

## Result

- [官网](../../../homepage/index.html) 主导航与页脚增加帮助和更新日志入口，首屏使用“帮助中心”；顶部与首屏下载直接进入用户指定 GitHub Releases，保留平台说明区。
- [网站生成](../../../scripts/docs/build-help.mjs) 读取根目录 CHANGELOG.md，生成三语路径的版本日志页，注明 Unreleased 是开发变更、英文与繁体回退中文；日志不进入离线帮助文章目录。[文档站配置](../../../docs-site/.vitepress/config.mts) 三语导航新增更新日志。
- 开发服务器监听 CHANGELOG.md 变化重新生成页面；[维护说明](../../../docs/help/README.md) 补充入口、数据源与发布方式。
- 相关 3 个文件、17 项测试通过，覆盖源日志更新后网页刷新与离线文章边界；相关 ESLint、Prettier、docs:check、website:build 和差异检查通过。浏览器验证 1440/768/375px 无横向溢出，帮助点击、日志键盘跳转、三语日志与未发布说明、两个下载目标正确。
- Standards：复用既有 VitePress 阅读与公开文档构建，不维护日志副本；Spec：帮助、站内日志与直达下载均已本地验收。只暂存本任务变更；Pages 线上已完成验收。

- 实现已提交并 push：`ce3e553fbf051430a648828c6e6a41688dfcbf32`；[Pages 工作流](../../../.github/workflows/deploy-pages.yml) 运行 `38332761038` 使用同一 SHA 并成功。本地按 `/agent-hub/` 生产路径复验帮助到日志导航、CSS、三语与日志响应式；线上浏览器实际点击帮助、站内日志及直达 Releases，通过。三语日志页及其 CSS、脚本、模块资源均 HTTP 200。
