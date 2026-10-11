# 产品截图

`skill-library.png` 与 `dashboard.png` 来自当前 React 产品组件，使用固定的示例技能、Agent、项目与路径，不读取本机数据库，也不包含个人信息。截图展示开发版本界面，已发布安装包可能有所不同。

## 更新截图

1. 启动 Vite 前端服务器，或复用现有开发服务器。
2. 打开 `/tests/browser/product-preview.html`，技能库选择“全部”查看所有示例技能。
3. 打开 `/tests/browser/product-preview.html?view=dashboard` 查看概览。
4. 使用 Chromium 浏览器，以 1440 × 900 CSS 像素、1 倍像素密度、深色主题捕获页面内容，保存为对应 PNG。等待数据与字体加载完成，不包含浏览器工具栏。
5. 检查截图没有错误、加载状态或个人信息，再执行 `npm run homepage:build`。

截图页直接复用 `Layout`、`MySkills`、`Dashboard` 和应用上下文，只在 Tauri 调用边界注入示例数据。它仅用于文档截图，不包含完整的写入与文件操作能力。

主页构建将这两张图片复制至输出目录的 `assets/`。README 直接引用这里的源图片。
