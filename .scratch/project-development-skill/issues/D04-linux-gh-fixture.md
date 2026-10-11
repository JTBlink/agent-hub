# D04：稳定 Linux gh 凭据轮换测试

Type: task
Status: claimed
Blocked by: D02

## Acceptance

- 分析 [修复提交的 CI](https://github.com/JTBlink/agent-hub/actions/runs/38149970049)，定位 Rust 首个失败测试。
- gh fixture 不在读取之间覆写可执行文件，仍覆盖参数、非交互、令牌轮换、失败、空与多行响应。
- 不修改生产凭据行为，通过本地检查及 Linux 远端 CI；提交并 push，记录验证结果。

## Comments

- 原格式门禁及后续前端、Rust 格式和 Clippy 全部通过，Linux Rust 测试在 `cli_login_is_read_without_caching_rejected_or_rotated_values` 第二次读取时收到 None。单测与 macOS 全量均通过，失败位于可执行脚本被再次写入后的读取。
- 优先消除测试可执行文件反复覆写导致的 Linux 子进程竞争；原脚本将 spawn 失败和异常输出统一转为 None，现有日志未提供底层 errno，不能宣称已证实某个具体 errno。

## Result

- 通过仓库内固定可执行脚本及临时目录软链接读取每次响应；轮换只写响应数据，不再改写可执行 inode。测试覆盖实际 `auth token --hostname github.com` 参数及非交互环境，并保留轮换、非零退出、空和多行响应行为。
- 目标单测与 Rust 全量测试通过（636 通过、8 忽略），Rust 格式、严格 Clippy、仓库格式和 shell 语法检查通过。生产凭据逻辑未改动。
- 远端新提交 CI 验证待完成，完成后记录运行链接与结果。
