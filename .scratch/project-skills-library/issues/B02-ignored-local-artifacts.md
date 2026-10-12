Type: task
Status: resolved
Blocked by: none

# 排除项目技能共享的缓存与本机环境配置误报

## Scope

Git 忽略诊断将技能内所有未跟踪的忽略文件都视为团队交付受阻，错误提示放行 Python 缓存和本机环境配置。仅调整共享诊断及建议，不修改用户 Git 忽略规则、文件内容、部署或修改保护指纹。

## Acceptance

- `__pycache__`、独立 `.pyc` 和系统生成文件不计入忽略警告。
- `.env`、`.env.*` 和 `wechat.env` 等 `*.env` 本机环境配置不计入警告；example/sample/template 配置模板保留诊断。
- 技能入口、脚本及必要资料被忽略时仍提示；已跟踪文件及目录聚合行为保持。
- 忽略整个父目录且新增内容仅为缓存或本机配置时不误报；新增必要脚本仍提示。
- 中英繁体建议明确缓存与本机环境配置保持忽略。

## Comments

- 用户要求先判断提示合理性并去除不合理逻辑。缓存可重新生成，本机环境配置可能含凭据，均不应引导提交。
- 复用内容哈希与删除诊断的可再生成文件规则；不将环境配置从修改保护指纹排除，避免替换内容时静默丢失本机配置。

## Result

- [Git 诊断](../../../src-tauri/src/core/project_library/git.rs)遍历时跳过缓存和本机环境配置，保留必要文件及配置模板的忽略检查；三语建议同步明确保持这些本机文件忽略。
- [内容规则](../../../src-tauri/src/core/content_hash.rs)提供共用的可再生成文件判断，[删除诊断](../../../src-tauri/src/core/removals.rs)复用；现有哈希范围和删除提示行为保持。
- 新增 3 项回归，覆盖缓存及本机配置、必要脚本及模板、父目录忽略但只有本机新增内容的情形。首次全量验证暴露测试临时路径别名，按状态入口规范化测试根路径后，专项及全量验证通过。
- `cargo test --manifest-path src-tauri/Cargo.toml --quiet`：666 项库测试及 8 项 CLI 测试通过，8 项忽略；Rust 格式与严格 Clippy 通过。
- 共享面板 5 项前端测试、`npm run lint`、`npm run build` 通过；构建保留既有 Browserslist 数据和 chunk 大小提示。
- 改动文件 Prettier 与 `git diff --check` 通过。Standards 审查确认共用生成物规则及现有文件保护；Spec 审查确认三条误报被排除，真实交付风险仍提示。
- 本次提交包含修复、回归测试与任务记录；未改写 Git 忽略规则或纳入缓存、本机环境配置。
