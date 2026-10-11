Type: bug
Status: resolved
Blocked by: B02

## Scope

技能库搜索当前仅支持精确连续字符，`mange` 无法找到 `manage-skills`；安装入口也只在首页显示。

## Result

技能名及展示名搜索容忍一次字符遗漏、替换或增加；描述仍使用精确包含匹配。技能库页展示管理 Skill 的安装、部署或更新入口，且不受首页关闭提示影响。回归测试覆盖截图中的 `mange` 和 `mange-skills`。

验证：`npm run test`（86 通过）、`npm run build` 通过；`npm run lint` 无错误，有一处既有的 Hook 依赖 warning。
