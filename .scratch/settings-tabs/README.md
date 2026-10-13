# 设置页分组与版本检查

规格：[spec.md](spec.md)

- [S01：实现分组 Tab 与正式版检查](issues/S01-grouped-settings.md)

状态：已完成，验证和双轴审查结果见 S01。

保留 [浏览器预览](preview.html) 作为界面验收资料：启动 Vite 后访问 `/.scratch/settings-tabs/preview.html`。预览复用实际页面组件，路径与 Agent 均为示例，IPC 和新版本结果使用模拟数据；正式应用的版本检查由 Rust core 执行真实请求。
