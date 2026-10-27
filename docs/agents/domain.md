# Domain docs

本仓库采用单上下文布局：根目录 `CONTEXT.md` 保存当前领域上下文，`GLOSSARY.md`（如果存在）保存术语，`docs/adr/` 保存已接受决策。Tauri 与 React 共用同一领域，不拆成多个上下文。

## 开始工作前

读取 `CONTEXT.md`、存在的 `GLOSSARY.md` 和与任务有关的 ADR。可选术语文件缺失时直接继续，由领域建模技能在术语实际明确时按需建立，不预先创建空文件。

Issue 标题、测试名称、代码模型和设计说明采用领域文档中的术语。术语存在歧义时先澄清并更新领域文档；与有效 ADR 冲突时明确指出，通过新的 ADR 替代旧决策，不能静默覆盖。

## 文档职责

- `CONTEXT.md` 与 `GLOSSARY.md`：当前领域语义。
- `docs/adr/`：已接受的架构决策。
- `docs/plans/agent-hub.md`：后续规划与设计。
- `docs/architecture/`：当前实现。
- GitHub Issues / Milestones：执行规格、依赖、讨论、进度、验证与版本归属。

任务记录通过链接引用规划和决策，避免重复维护正文。
