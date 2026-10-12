Type: task
Status: resolved
Blocked by: none

# 放行并提交两个 Codex 项目技能入口

## Scope

- 修复 `.gitignore` 对两个入口及父目录的忽略。
- 保留 `.agents/skills` 中已跟踪的实际技能内容，复用现有相对链接。
- 保持本机配置、缓存和其他技能忽略，仅提交本任务文件。

## Comments

- 2026-10-12：已领取；阻挡规则为仓库 `.gitignore` 的 `.codex/`，无需修改本机 Git 忽略规则。

## Result

- `.gitignore` 逐层放行 `.codex/`、`skills/` 和两个指定入口；其余 Codex 内容继续默认忽略。
- 提交两个现有项目相对软链接，实际内容复用已跟踪 `.agents/skills`；无需个人技能库、配置或凭据。
- 未新增共享配置；后续共享配置继续使用示例模板。本次仅改变仓库开发入口，不改变产品行为、发布流程或兼容性，无需新增 CHANGELOG 记录。
- 验证：`git diff --cached --check` 通过；`git ls-files --stage .codex` 确认两项均为 `120000` 软链接。
- 临时目录通过 `git checkout-index --all --prefix=<checkout>/` 验证只使用已跟踪内容：两个入口、frontmatter、Agent 元数据及共 19 个相对文档引用全部可读取。
- 临时 Git 仓库通过 `git check-ignore -q --no-index` 验证 4 个共享路径和 13 个忽略路径；再使用 `git -c core.excludesFile=<global-ignore> check-ignore` 验证全局 `.codex/` 忽略场景，同样通过。
- Standards：沿用 ADR-0012 的项目相对链接；规则只放行指定入口，未提交本机信息或工作区其他修改。
- Spec：两个入口可随 Git 共享；父目录可遍历，本机配置、缓存、其他技能、环境文件和构建产物保持忽略。
