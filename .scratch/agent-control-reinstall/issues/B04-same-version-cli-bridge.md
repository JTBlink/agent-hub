Type: bug
Status: resolved
Blocked by: B02

## Scope

本地 CLI bridge 有版本戳且可执行，但数据库已升级到 schema 10，bridge 仍只支持 9。相同应用版本号的开发构建会命中仅比较版本戳的快速路径，跳过新 CLI 发布。

## Result

启动时比较随包 CLI 与 bridge 的内容摘要；相同版本但二进制不同也重新发布，发布失败撤销旧版本戳。`manage-skills` 1.1.1 增加 schema 不兼容时的恢复说明。回归测试覆盖同版本重建。

验证：`cargo test --manifest-path src-tauri/Cargo.toml`（624 通过、8 忽略）、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`、`cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` 均通过。本机执行 `./agent-hub.sh install --dev` 后，CLI bridge 的 `skills status manage-skills` 命令返回成功，库目录及已部署 Agent 目录的 `SKILL.md` 均存在。
