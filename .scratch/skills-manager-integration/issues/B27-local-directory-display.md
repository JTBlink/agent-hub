# B27：按目录精简本地扫描展示

Type: task
Status: resolved
Blocked by: none

## Scope

本地 Skills 列表按完整路径去重，移除 Agent 筛选器，适用 Agent 名称在目录下方以小标签直接展示；同一 Skill 的其他来源目录默认折叠，展开后按目录操作。统计显示去重后的目录数；独立路径、同名不同版本保留。扫描记录和清理保护规则保持兼容。

## Acceptance

- 软链接目录展示链接图标与可访问提示；从文件系统元数据判断，普通目录不标记。

- 同一个共享路径只展示一行操作，保留可用的扫描记录 ID。
- 同一 Skill 的其他目录支持键盘展开与收起；搜索路径后直接展示匹配来源。
- 查看、打开、导入与删除仍针对所选路径，删除提示不再使用 Agent 归属。
- 中、英、繁体文案同步，覆盖去重与搜索回归，完成前端及浏览器验证。

## Result

按完整路径合并扫描结果，保留首条可操作记录 ID 并汇总去重后的适用 Agent。目录下方直接展示 Agent 标签，其他来源目录默认折叠，统计按唯一目录计算。支持名称、路径和全部适用 Agent 搜索，删除确认与成功提示按目录描述。软链接状态由后端文件系统元数据提供，路径旁显示链接图标及提示；中、英、繁体文案同步。

验证：`npm test`（54 项）、`npm run build`、`npm run lint`、`npm run tasks:check`、`git diff --check`。Playwright 浏览器 IPC fixture 覆盖共享路径计数、默认折叠、键盘展开、直接展示全部适用 Agent、路径与 Agent 搜索、查看、打开、导入、取消删除及单次删除后刷新；未操作真实 Skill 文件。软链接指示图标已通过浏览器验证；Rust 普通目录/软链接及序列化回归通过，完整 `cargo test`（579 项通过、8 项忽略）、`cargo clippy --all-targets -- -D warnings`、`cargo fmt --all -- --check` 通过。

## Review

- Standards：展示转换集中在 localSkillScan，复用现有位置组件和操作 hook；后端扫描与删除规则保持兼容。
- Spec：同一共享路径只占一行和一组操作，Agent 直接展示，仅其他来源目录折叠；不同路径与内容版本保留。
