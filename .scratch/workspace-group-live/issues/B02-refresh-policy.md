Type: task
Status: resolved
Blocked by: none

# 按页面切换更新工作空间，避免频繁刷新

## Comments

- 用户反馈刷新频繁影响使用，并明确「切页面触发一次就可以了」；本任务替代 B01 的技能库通知自动重扫策略。
- 回归先复现：库通知和等值 Agent 对象重建都会导致额外扫描；显式刷新期间已有卡片会被 Loading 替换；成员变化也额外扫描目录。
- 不新增后台轮询或自动监听；保留页面进入、Agent 切换、手动刷新和本页操作完成后的明确刷新。

## Result

- [扫描 Hook](../../../src/hooks/useWorkspaceSkills.ts) 去掉技能库数组依赖，并根据实际 Agent key 集合确定扫描作用域；等值 Tool 对象、数组顺序变化和成员通知不再额外扫描。错误文案使用当前全局语言，不因语言函数引用变化重扫。
- [页面](../../../src/views/WorkspaceView.tsx) 在已有扫描结果时保留卡片节点，只在首次加载时显示占位 Loading。刷新失败保留上次成功结果；成功的空结果仍替换旧列表。
- [11 项页面回归](../../../src/views/WorkspaceView.test.tsx) 验证切页各扫一次、返回重扫、库通知和等值 Agent 数据不重扫、手动刷新不连带重复扫描、成员即时展示、刷新中节点保留、失败回退与旧请求隔离。修复前的相应用例实际失败，修复后通过。
- `npm test`：89 个文件、507 项通过；`npm run lint`、`npm run build`、相关文件 Prettier、`npm run tasks:check` 与 `git diff --check` 通过。构建仅保留既有 Browserslist 与大 chunk 提示；没有 Rust 变更，未执行 Rust 或原生桌面检查。
- Standards：刷新职责留在现有 Hook，未新增监听、轮询、数据写入或持久化设置；Spec：以用户后续明确的切页刷新策略为准，手动和操作后刷新保留，列表节点回归覆盖闪烁问题。已同步规格、目录说明与 CHANGELOG。
