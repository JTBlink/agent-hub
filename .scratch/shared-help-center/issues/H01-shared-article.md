# H01：一篇文档贯通应用与网站

Type: task
Status: resolved
Blocked by: none

## What to build

维护者编辑一篇 Markdown 后，应用离线阅读与文档站构建都获得相同正文、稳定文章身份、链接和图片。

## Acceptance criteria

- [x] 同一内容源生成离线文档包和网站输入。
- [x] 内部文章、章节和图片链接在两端正确解析。
- [x] 重复 id、无效导航、断链和越界路径导致明确构建失败。
- [x] 草稿不进入公开索引，页面显示构建对应的版本。

## Comments

依据 [规格](../spec.md)，按公开构建入口进行 red → green 验证。

## Result

同一标准 Markdown 经公开构建入口生成离线清单与 VitePress 输入，稳定 id 与文件位置分离。校验导航、元数据、链接、锚点、实际引用图片和草稿；未发布资源不打包。统一标题 slug、文章语言回退与跨语言别名，链接保留源目标语言。

验证：`npx vitest run scripts/docs/build-help.test.mjs`，14 项通过；`npm run docs:check`、`npm run docs:build` 通过。

入口：[构建流程](../../../scripts/docs/build-help.mjs)、[共享查找规则](../../../shared/help-catalog.mjs)、[内容维护](../../../docs/help/README.md)。

### 首次启动回归

补充 Vite 启动阶段生成，保证直接调用 Vite 也可解析离线清单；真实服务器导入回归测试通过，不依赖已有生成文件。
