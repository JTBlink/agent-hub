Type: task
Status: resolved
Blocked by: none

# 来源路径不可用按导入记录展示

## Comments

用户明确：原路径丢失不算错误，仅用于记录从哪里导入。

## Result

- 导入来源路径保留用于追溯，不再以红色错误显示在卡片或列表。
- 来源说明与重新关联、解除关联移至详情；来源不可用时隐藏重新导入与对比入口，保留真正更新错误的提示。
- Standards 审查：复用更新展示策略，移除页面内重复恢复按钮，不修改来源记录或部署契约。
- Spec 审查：原路径是来源记录，路径不可用不阻止库内副本使用。
- 验证：`npm run build`；`npm run test`（144 项通过）；`npm run lint`（0 错误，有既存 MySkills hook 依赖警告）；`git diff --check`。
- 主要文件：[展示策略](../../../src/lib/skillUpdatePresentation.ts)、[来源记录](../../../src/components/SkillImportProvenance.tsx)。
