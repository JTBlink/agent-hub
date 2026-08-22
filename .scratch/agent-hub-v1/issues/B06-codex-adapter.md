# B06：添加 Codex 配置适配

Type: task
Status: claimed
Blocked by: D01, B04

## 交付

实现 Codex 的全局及工作空间配置发现、解析、诊断和安全编辑 adapter。

## 验收标准

- 覆盖 D01 确认的稳定配置类型和作用域。
- 复用配置模块，不在 Tauri commands 或 UI 写 Codex 特判。
- 未知字段与不能无损编辑的内容得到保留或明确警告。
- 通过真实格式夹具验证发现、解析、写入和并发冲突。
