Type: task
Status: resolved
Blocked by: none

## Scope

修复技能组批量操作跳过多个 Skill 时只展示第一条原因的问题，完整列出每个技能、Agent 与原因。

## Result

保留所有异常条目并按冲突/失败分组；Toast 展示全部技能名与 Agent，自动打开详情弹窗并提供再次查看入口。详情支持换行、滚动与选择复制，不裁剪长路径。添加混合错误批次、同名技能不同 Agent 和双 Skill 完整渲染回归测试。验证通过：`npm run build`、`npm run lint`（一条既有 Hook 依赖警告）、`npm test`（92 项通过）、`git diff --check`。
