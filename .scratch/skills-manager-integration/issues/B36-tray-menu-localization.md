Type: task
Status: resolved
Blocked by: none

## Scope

将 macOS 原生托盘菜单中的技能组、状态、更新提示和操作项接入应用语言设置。首次启动保存检测到的语言，设置页切换语言后立即刷新托盘菜单；CLI 帮助同步使用中文并隐藏旧技能组命令别名。

## Result

托盘中文菜单已覆盖简体中文和繁体中文，英文设置继续保留英文；更新提示和悬停提示也会随语言变化。CLI 使用 `skill-groups` 展示，`presets` / `scenarios` 保留兼容解析，根命令和多级帮助的说明、参数标题及示例已翻译。

## Review

- Standards：托盘动态文案与 CLI 帮助格式抽到独立模块，前后端复用同一语言设置；内部数据结构和 JSON 字段保留兼容。
- Spec：中文菜单覆盖技能组、状态、更新提示、打开应用、检查更新、打开目录和退出；旧命令与参数别名仍可解析。

验证通过：`cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`；`cargo test --manifest-path src-tauri/Cargo.toml --lib tray_menu_text_tests`（3 项）；`cargo test --manifest-path src-tauri/Cargo.toml --bin agent-hub-cli`（7 项）；`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`；`npm run build`；`npm run tasks:check`；`git diff --check`。
