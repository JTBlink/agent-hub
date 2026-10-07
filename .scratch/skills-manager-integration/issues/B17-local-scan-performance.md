# B17：优化本地 Skills 扫描性能

Type: task
Status: claimed
Blocked by: none

## Scope

定位本地扫描耗时，在保留所有 Agent 来源位置和完整内容校验的前提下减少重复文件读取，记录基线与优化后的测量结果。

## Acceptance

- 建立可重复运行的扫描性能反馈与回归测试。
- 同一实际 Skill 在一次扫描中不重复读取全文；下一次扫描仍能识别修改。
- 保留同名不同版本、所有 Agent 来源和托管目录排除行为。
- 必要测试与构建检查通过，记录测量范围和局限，更新 CHANGELOG。
