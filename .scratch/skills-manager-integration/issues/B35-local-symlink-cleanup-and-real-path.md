# B35：清理共享技能软链接并展示真实路径

Type: task
Status: resolved
Blocked by: B16, B27, B28

## Scope

本地 Skills 管理中的软链接展示解析后的真实路径。扫描和一键清理应识别指向共享技能库的链接，删除时仅移除所选链接条目，保留共享技能本体及其他 Agent 的链接。

## Acceptance

- 单项删除和一键清理可移除 Agent 技能目录中指向共享库的未托管软链接。
- 共享库目录和其中的直接条目仍受保护；已托管的链接按工作空间规则移除。
- 本地列表展示软链接真实路径，路径搜索可匹配该路径。
- 使用临时目录验证链接删除、共享源保留及扫描展示；不操作真实技能文件。

## Result

修正本地删除和清理对软链接解析目标的误判；扫描不再略过指向共享库的绝对链接。扫描结果提供解析路径，界面显示并支持搜索。回归覆盖链接删除、共享源保留、其他托管链接保留和路径序列化。

验证：`cargo test --manifest-path src-tauri/Cargo.toml`（612 项通过，8 项按原设定忽略；CLI 6 项通过），`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`，`npm test`（71 项通过），`npm run build`，`npm run lint`，`npm run tasks:check`。本次 Rust 文件的 rustfmt 检查通过。
