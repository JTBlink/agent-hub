# 架构决策记录

ADR 用于记录影响范围大、长期存在或难以撤销的技术决策。

文件采用 `NNNN-short-title.md` 命名，例如 `0001-technology-stack.md`。每份记录应包含状态、背景、决策、影响和备选方案。已通过的 ADR 不直接改写结论；新决策应新增 ADR 并注明替代关系。

## 决策列表

- [ADR-0001：第一版技术栈](0001-technology-stack.md)
- [ADR-0002：分离 Skill 来源快照与安装实例](0002-skill-source-and-installation-model.md)
- [ADR-0003：配置文件采用格式感知最小 Patch 与受保护原子写入](0003-lossless-config-writes.md)
- [ADR-0004：按 Agent 官方层级展示作用域并显式处理冲突](0004-explicit-scope-and-conflict-boundaries.md)
- [ADR-0005：代码架构规范与 SOLID 约束](0005-code-architecture-conventions.md)
