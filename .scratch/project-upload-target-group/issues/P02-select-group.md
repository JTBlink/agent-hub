Type: task
Status: resolved
Blocked by: none

## Scope

上传确认支持选择已有技能组和未分组，默认原分组，确认后写入成员关系。

## Implementation

- 中心导入与更新命令返回实际写入的技能 ID，旧调用方继续忽略返回值。
- 下拉框复用默认组本地化；显式选组后切换源版本不重置，打开新弹窗时恢复默认。
- 上传流程使用实际返回 ID 调用现有互斥成员关系命令；未分组读取并移除当前组。分组失败提示已上传，停止后续变体覆盖。

## Result

分组选项已接入上传流程。新增 7 项回归覆盖，`npm run build`、`npm run lint`（一条已有 Hook 警告）、`npm test`（125 项）、Rust 格式与严格 Clippy 检查通过。`cargo test` 通过：核心 629 项、CLI 7 项，8 项忽略。
