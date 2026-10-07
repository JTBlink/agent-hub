# B25：修复阻断 CI 与打包的文档格式

Type: task
Status: claimed
Blocked by: none

## Scope

远端 CI 与安装包验证失败在 Prettier 格式门禁，历史任务状态表和规划表格格式不规范；状态表已在本轮修正，补齐规划文件格式。

## Acceptance

- npm run format:check 与 tasks:check 通过，不修改规划含义。
- 记录远端检查原因并提交推送修复。
