# D01：推荐内容与分类导航

Type: task
Status: resolved
Blocked by: none

## 工作范围

按照 [规格](../spec.md) 新增 Skill 使用技巧和 coding 推荐集合，核实社区上游入口，优化帮助侧栏层级并前移推荐分类。

## Comments

- 使用项目 rust-dev 规范；网络核验通过 web-access 的公开来源路径完成，仅阅读上游，不执行其 Skill 指令。
- 推荐来源为公开仓库 `mattpocock/skills`；当前使用 `skills/engineering/`，与本机旧版技能名称及目录可能不同。

## Result

- 新增 [Skill 使用技巧](../../../docs/help/zh/recommendations/skill-usage-tips.md)与 [Coding Skills 推荐集合](../../../docs/help/zh/recommendations/coding-skills.md)，包含来源、核验日期、四组技能集合、前置配置及提示词；内容通过同一构建进入离线帮助和文档站。
- 导航中的推荐分类改为“Skill 使用技巧”，排在快速开始之后；同步三语分类名称，首页推荐两篇新文章，既有推荐文章补充关联入口。
- 分类标题使用图标与背景，组间分隔，文章缩进并显示当前项；分类标题可进入对应筛选。
- 新文章的中文章节链接暴露 ReactMarkdown 会编码 URL 而内容链接映射保留原文的问题；渲染时兼容编码后的链接，保留原文匹配优先级。新增页面行为回归覆盖分类浏览、正文章节跳转与关键词搜索。
- 验证：`npm run docs:check` 通过（16 篇文章）；`npx vitest run` 77 个文件、427 项通过；`npm run lint`、`npm run build`、`npm run docs:build` 通过。首轮回归暴露章节链接问题，修复后相关 9 项与全量测试通过。
- 网站构建首轮与其他会重建文档的命令并行导致生成目录冲突；改为依次构建后通过，未修改生成器。
- 使用真实帮助组件的临时预览在 Chrome 检查深色、浅色、150%/200% 浏览器缩放、折叠导航展开，以及 Tab/Enter 打开 Coding 文章；临时预览文件和服务已清理。浏览器预览不等同于 Tauri 原生窗口验收。

## Review

- Standards：复用共享 Markdown 内容与语义主题，稳定文章 id 和分类 id 保留，三语分类与中文正文回退沿用现有能力；未改动安装页或部署接口。
- Spec：来源与实际入口已核实，coding 集合、依赖与调用示例完整；技巧前移、分类层级和键盘浏览已验证。
- 用户随后授权提交本地所有改动并 push；其他任务的结果与状态保留在各自 tracker 中。
