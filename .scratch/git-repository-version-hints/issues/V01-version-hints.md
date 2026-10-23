Type: task
Status: resolved
Blocked by: none

# 补齐仓库卡片和覆盖安装的版本提示

按 [规格](../spec.md) 扩展目录元数据，复用展示组件显示双方版本和 SemVer 先后；覆盖实际版本变化时重新确认。纳入本次 0.1.10 发布。

## Result

- [目录元数据](../../../src-tauri/src/core/git_catalog.rs) 返回真实声明版本；前端兼容缺少 version 的旧缓存，刷新后读取版本。
- [共享展示](../../../src/components/GitSkillVersionInfo.tsx) 用于卡片、详情和覆盖确认，显示仓库/已安装版本、仓库较旧或较新提示，降级确认包含具体双方版本。
- [版本比较](../../../src/lib/skillVersions.ts) 调用 SemVer 库，遵循现有 Rust precedence 语义，缺失/非法版本不推断；覆盖前目录版本变化时先更新缓存和提示，再要求重新确认。
- 验证：前端 26 项相关回归、Rust 4 项目录测试、严格 Clippy、ESLint 与前端构建通过；覆盖降级提示、旧缓存刷新、确认前版本变化、数值与预发布比较、相同 build metadata 和非法版本。文案同步中英繁；未进行原生桌面主题/缩放/键盘手动验收。
- Standards：复用现有元数据解析与安装识别，不按名称猜测版本先后；共享版本展示避免卡片与确认文案分叉。Spec：较旧仓库有明确提示，双方版本可见，显式覆盖前提示降级，刷新可补齐旧缓存版本。
