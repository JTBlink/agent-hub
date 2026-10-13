Type: task
Status: resolved
Blocked by: none

# 实现分组 Tab 与正式版检查

按 [规格](../spec.md) 重组设置页，完成正式 Release 检查和下载入口，保留原有设置行为。

## 验收

- 五组入口和设置归属符合规格，旧 Agent 深链接可用。
- Tab 可用键盘切换，编辑内容和滚动位置保留。
- 更新检查使用当前仓库、SemVer 和现有代理，失败与无正式版本不会显示最新版。
- 完成前端测试、lint、构建及 Rust 测试、格式、Clippy，记录实际 UI 验收结果。

## Comments

- 用户明确要求完成全部任务，不需额外确认；本次不触发发布。

## Result

- 设置页改为五组固定 Tab，保留原有设置功能、旧 Agent 深链接、每组滚动位置和未提交输入；Tab 支持左右方向键及 Home/End。
- 当前版本旁新增真实正式版检查及发布说明下载入口；Rust core 查询本仓库 Release，按 SemVer 比较，复用代理并区分网络失败、无正式版本和无更新。
- 页面按职责拆为分组组件、Agent 操作 hook、表单加载/保存 hook 和版本检查组件；修复旧页面路径保存失败关闭编辑器、初始化覆盖输入、重复请求与图标按钮键盘可访问性问题。
- `npm test`：82 个文件、439 项通过；`npm run lint`、`npm run build` 通过。
- `cargo test --manifest-path src-tauri/Cargo.toml -- --test-threads=2`：库测试 700 项与 CLI 测试 8 项通过，8 项按原配置忽略。首次默认并发全量测试中既有认证拒绝 fixture 的请求读取超时；该测试单独复验及最终完整复验均通过。
- Rust 格式检查、严格 Clippy、`git diff --check`、`npm run tasks:check`、`npm run docs:check` 通过。
- 浏览器使用示例数据和模拟 IPC 验收：深色 Agent 与版本检查、新版本下载提示、浅色英文、820px 内容布局、放大文字、键盘末尾 Tab 与固定导航下的独立滚动。未完成原生桌面自动化验收：接口多次超时；不将浏览器预览冒充原生验收。
- 实际公共 Release API 查询返回合法正式版本；无签名下载安装发布源，本任务按规格提供检查和前往发布页下载，不自动替换应用。
- Standards 与 Spec 双轴审查通过；发现的三类 Standards 问题及 Enter 保存绕过锁问题已修复。

重要文件：[设置页](../../../src/views/Settings.tsx)、[分组组件](../../../src/components/settings/)、[版本检查核心](../../../src-tauri/src/core/app_updates.rs)、[表单状态](../../../src/hooks/useSettingsForm.ts)。
