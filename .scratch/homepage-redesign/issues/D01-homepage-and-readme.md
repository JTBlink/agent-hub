Type: task
Status: resolved
Blocked by: none

# 官网视觉、截图与 README

完成产品主页重设计，生成当前前端示例数据截图，更新 README 与主页静态资源构建。

## Comments

本次会话未授权 Git 提交；任务领取与交付保留在工作区。

## Result

- 完成[主页](../../../homepage/index.html)重设计：深蓝产品首屏、真实组件截图切换、Agent 标识、浅色功能区、技能部署流程与平台下载说明。保持原 Logo，使用集中官网品牌变量与相对字号。
- 更新 [README](../../../README.md) 的产品定位、安装步骤、数据目录和两张当前界面截图；[截图页](../../../tests/browser/product-preview.tsx)复用当前组件，以示例数据隔离本机状态。
- [主页构建](../../../scripts/build-homepage.mjs)统一复制 CSS、JS、品牌与 Agent 图标、PNG；新增自包含输出验证，忽略 `_site/` 构建目录。
- 验证：`npm test` 的 36 个文件、153 项测试通过；新增 `scripts/build-homepage.test.mjs` 单独通过（1 项）；`npm run build` 通过；`npm run lint` 无错误，有现有 `MySkills.tsx` 的 Hook 依赖警告。
- 实际 Chromium 检查：375 / 768 / 1024 / 1440px 无横向溢出；截图切换与状态、资源加载、下载锚点、键盘操作、焦点、减少动态效果、375px 下 200% 文字缩放和禁用 JS 回退通过；桌面与移动截图已目视检查。
- Prettier 与 `git diff --check` 通过；本任务未改动 Rust，未执行 Rust 检查。未提交、部署或发布。
