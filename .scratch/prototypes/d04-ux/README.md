# D04 UX Prototype

问题：AgentHub V1 的配置中心与 Skills 中心应采用什么信息层级，才能同时解释作用域、诊断、Diff 和安装计划？

本原型包含三个结构差异明显的只读变体：

- `?variant=A`：配置中心导航分栏。
- `?variant=B`：工作台总览。
- `?variant=C`：统一变更计划确认流。

运行：

```bash
cd .scratch/prototypes/d04-ux
python3 -m http.server 4173
```

结论：正式应用组合三者，使用 B 作为入口，A 作为配置专题页，C 作为配置写入与 Skill 安装的统一确认流程。原型无持久化，也不会调用真实文件操作。
