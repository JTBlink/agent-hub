Type: task
Status: resolved
Blocked by: none

## Scope

审查并优化本地未提交改动，范围见 [spec](../spec.md)。

## Comments

已提取单技能部署模块，统一目录按钮复用，区分批量冲突与失败，补齐前后端 force 参数并补充回归测试。验证进行中。

## Result

- 单技能部署逻辑拆到 [skill_deployment.rs](../../../src-tauri/src/core/skill_deployment.rs)，统一五参数接口，前端显式传递默认关闭的 force 参数。
- 目标冲突保留已有文件并返回结构化详情；显式覆盖维护来源引用，数据库读取失败正常传播。
- 技能组批量错误区分冲突警告与真实失败，并添加混合批次回归测试。
- 项目页复用目录操作组件，提供紧凑图标、错误提示和无障碍标签；普通模式保留换行布局。
- 开发端口清理只匹配 TCP 监听进程。
- 覆盖确认弹窗拆到独立组件，覆盖失败时显示错误并保持打开，补充失败与成功路径的回归测试。

验证通过：`npm run build`、`npm run lint`（一条现有 Hook 依赖警告）、`npm test`（90 项）、`cargo test --manifest-path src-tauri/Cargo.toml`（633 项通过、8 项忽略）、`cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`、`npm run tasks:check`、`git diff --check`。

检查期间检测到其他进程修改并提交部分代码；保留相关改动，没有执行 Git 提交。该进程提交后补充复核新增的 MySkills 冲突确认弹窗，拆出独立组件并修正覆盖失败时的错误提示与弹窗保留行为。
