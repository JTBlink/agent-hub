# 内容链接浏览器验收

`preview-links.mjs` 检查生产 Markdown、设置组件和真实 xterm 的普通 URL／OSC 8 链接：目的地选择、快捷键反转、非左键与修饰键变化、鼠标协议输入隔离，以及 1440／960／480 像素下三语、明暗主题和放大字号的菜单。IPC 使用合成数据，不读取用户设置或实际打开外部应用。测试只创建和关闭自己的浏览器标签。

## 前置条件

- 项目依赖已安装（`npm ci`），Node.js 22+、Chrome 或兼容的 Chromium 浏览器。
- 已安装开源 [web-access](https://github.com/eze-is/web-access) Skill 2.6+；其 CDP Proxy 默认监听 `localhost:3456`。首次使用按该 Skill 的 `SKILL.md` 完成浏览器配置和调试授权。测试不会自行选择或切换日常浏览器。
- 在项目根目录启动独立 Vite 实例；已有 4176 服务时复用，不能停止其他任务的服务。

```sh
npx vite --host 127.0.0.1 --port 4176 --strictPort
```

另一个终端从项目根目录执行：

```sh
node ~/.codex/skills/web-access/scripts/check-deps.mjs
node tests/browser/preview-links.mjs
```

前置检查成功后复用现有 Proxy；不要另起或重启共享服务。脚本成功输出 `PASS`，三语菜单截图保存在 `/tmp/preview-links-{zh,en,zh-TW}.png`。IPC 层队列的检查不等同于原生浏览器启动或第三方网站登录验收；网页原生行为由 Rust 预览集成测试验证。
