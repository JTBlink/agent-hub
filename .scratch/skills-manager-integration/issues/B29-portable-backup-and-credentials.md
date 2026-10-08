# B29：独立标准 Skills 备份、目录操作与本地凭据缓存

Type: task
Status: resolved
Blocked by: none

## Scope

- 活跃 Skills 保持在 `~/.agents/skills`；Git 仓库默认使用 `~/.agent-hub/backup`，以 `skills/<目录>/SKILL.md` 保存内容，支持分类子目录与 `npx skills`。
- 复制保留旧仓库历史，桌面、CLI、自动备份、合并、恢复统一使用独立仓库。远端更新应用前检测外部修改，保留恢复副本与中断日志。
- 修复隐藏目录打开权限，设置页与本地 Skill 位置增加 VS Code 入口。
- 快照标签保持 UTC 编号兼容，界面统一转换为本地时间并展示时区，区分快照生成与提交时间。
- 按用户要求在 `~/.agent-hub/credentials` 保存凭据，进程内复用。旧钥匙串只在缺少本地记录时迁移；退出保存清除标记，登录立即替换缓存。凭据不进入备份。

## Acceptance

隔离测试覆盖迁移、Git 历史、同步、恢复、外部编辑、凭据缓存/权限/退出、目录 URI。使用标准 npx skills 验证发现能力；通过前后端构建、测试、lint、格式、Clippy 与 tracker 检查。

## Comments

参考仓库采用 `skills/<分类>/<技能>/SKILL.md`；保留原始文件与层级，不替用户改写 Skill frontmatter。凭据采用文件权限保护，Unix 目录 0700、文件 0600，未宣称钥匙串等价加密；旧令牌失效需要重新授权。开发模式原生重编译会重启应用，应避免在授权中途持续改动 Rust。

## Review

- Standards：Git 投影、凭据文件、目录操作和时间格式抽出独立模块；目录锁覆盖投影与发布，写入保留恢复副本。时间测试覆盖 UTC 转换、夏令时、无效标签与提交时间差。
- Spec：保留现有双向同步和历史快照；标准布局已在隔离 fixture 中通过 `npx skills@1.7.1 add <backup> --list` 及 `--skill demo --agent codex --yes` 发现与安装验证。真实远端令牌失效仍需重新授权。

## Result

独立备份、目录打开与 VS Code 入口、本地凭据缓存和本地快照时间展示完成。备份目录默认 `~/.agent-hub/backup`；活跃技能目录保持 `~/.agents/skills`。已有 Git 历史及恢复标签保留，凭据不进入仓库。

在隔离的待提交快照运行前端测试（70 项）、`npm run build`、`npm run lint`、`npm run format:check`；`cargo test --manifest-path src-tauri/Cargo.toml`（604 项库测试、6 项 CLI 测试通过，8 项已有测试忽略）、`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 与 `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` 全部通过。标准安装器已在临时目录验证发现和安装，未操作实际全局 Skills。

同时存在的旧版迁移移除与协议标记改名由其他会话处理，本次提交保留原有兼容行为，不纳入这些未完成改动。
