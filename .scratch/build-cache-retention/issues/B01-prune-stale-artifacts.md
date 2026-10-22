Type: task
Status: resolved
Blocked by: none

# 编译打包后自动清理历史产物

## Comments

- 用户要求调查过大的编译缓存、保留最新构建，并优化编译打包脚本以自动清理旧数据。
- 初始 `src-tauri/target` 约 39 GiB，debug/deps 约 34 GiB；按 inode 去重后目标文件约 25 GiB，主要来自历史 app_lib 编译。
- 保留共享依赖、build-script 输出与增量缓存；用户后续已授权提交并推送，不发布版本。

## Result

- 新增 [build-cache.mjs](../../../scripts/build-cache.mjs)，用当前 rlib 归档清单与 Cargo fingerprint 识别最新产物，并清理同一测试/CLI artifact 的旧编译 session；按目录、架构和格式清理旧安装包与签名。
- 接入桌面打包、CLI 构建/安装、Unix 开发 CLI 安装和 `app:test`；成功后清理，失败保留。支持 `CARGO_TARGET_DIR`、手动 `app:prune`、`--dry-run`；保留共享依赖、build-script 输出、增量缓存和固定路径的可执行文件。
- 自动入口仅清理构建开始前的历史文件；不跟随目录链接，先完成清理计划，损坏归档或 fingerprint 导致清理停止并提示，不改变成功构建的退出状态。
- 真实缓存从约 39 GiB 降到约 15 GiB。首次清理前后 4 个最新可执行文件的 SHA-256 一致；真实 `npm run cli:build -- --locked --offline` 仅重编应用，5.22 秒成功并自动清理；CLI 版本输出为 0.1.9。重复预览返回 0 项待清理。
- 验证：`npm test -- scripts`，18 个文件、170 项通过；`npm run lint`、`npm run build`、`npm run version:check`、变更文件 Prettier、`bash -n agent-hub.sh`、`node --check scripts/build-cache.mjs` 与 `git diff --check` 均通过。前端构建仍提示既有 Browserslist 数据过期和 chunk 体积。
- Standards：清理集中在独立脚本，复用所有入口，不修改 Rust 运行逻辑；覆盖归档损坏、路径边界、只读预览、重复执行和不同编译配置。Spec：保留最新应用构建和可复用依赖，删除历史应用产物与旧安装包；打包成功/失败顺序由编排测试覆盖。
- 更新 [脚本说明](../../../scripts/README.md) 和 CHANGELOG。未执行完整桌面安装包构建或 Windows/Linux 原生验收；按用户后续授权提交并推送，不发布版本。
