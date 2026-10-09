# B01：默认名称与说明本地化

Type: task
Status: resolved
Blocked by: none

## Acceptance

- 简体中文、繁体中文、英文分别显示默认、預設、Default。
- 侧栏、技能库、技能组按钮、命令面板和托盘保持一致，命令面板支持中文名称搜索。
- 语言切换不改写存储名称或成员；自定义名称和说明保持原样。
- 添加多语言切换和托盘回归测试，完成相关检查。

## Result

通过 `skillGroupDisplay` 展示纯函数统一侧栏、技能库成员提示、工作区按钮与命令面板的默认名称和说明；命令面板支持本地化名称搜索。托盘在渲染时翻译默认组名。保存的组名、ID 与成员关系保持原样。

- `npm run build`、`npm test`（72 项）、修改文件的 ESLint 与托盘模块 rustfmt 检查通过。
- `cargo test --manifest-path src-tauri/Cargo.toml --lib tray_menu_text_tests`（4 项）、严格 Clippy、`git diff --check` 通过。
- 全量 ESLint 在并行修改的 `ProjectDetail.tsx` 报告两个 effect 状态更新错误；全量 Rust 格式检查在其他修改文件报告格式差异。
- 全量 Rust 测试为 616 通过、8 忽略、1 失败；失败项为并行新增的 `membership_edit_leaves_unrelated_metadata_untouched`，与本任务的展示逻辑无关。

## Review

- Standards：复用统一展示函数与 i18n 资源，不改变持久化字段；测试覆盖语言切换和自定义名称、说明保留。
- Spec：简中显示「默认」、繁中显示「預設」、英文保留 `Default`，主要展示入口与原生托盘一致。
