Type: task
Status: resolved
Blocked by: none

## Scope

提供未管理技能统计与点击查看入口。

## Result

抽取工作区筛选与受管理判定，统计区增加可切换的未管理数量按钮。筛选基于当前 Agent 部署记录，保留搜索、标签、排序及既有详情操作；点击时清除旧搜索标签，切换 Agent 重置，并纳入多选状态的筛选标识。新增未管理但匹配技能库、已托管、托管后消失、组合筛选与数量按钮的回归测试。验证通过：`npm run build`、`npm run lint`（一条既有 Hook 依赖警告）、`npm test`（106 项）、`git diff --check`。
