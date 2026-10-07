# B25：修复阻断 CI 与打包的文档格式

Type: task
Status: resolved
Blocked by: none

## Scope

远端 CI 与安装包验证失败在 Prettier 格式门禁，历史任务状态表和规划表格格式不规范；状态表已在本轮修正，补齐规划文件格式。

## Acceptance

- npm run format:check 与 tasks:check 通过，不修改规划含义。
- 记录远端检查原因并提交推送修复。

## Result

规划分期表按 Prettier 对齐；原有内容和执行边界未变。补齐整仓格式检查后所有匹配文件通过，任务索引与版本检查也通过。无需重复运行代码行为测试，因为本次仅修改 Markdown 格式与任务记录。

## Review

- Standards：只调整表格空格，未修改工作流、产品行为或规划含义；隐私检查无新增个人路径或凭证。
- Spec：修复历史 CI 与安装包前端门禁中的格式失败，提交后 push 并核对远端提交。
