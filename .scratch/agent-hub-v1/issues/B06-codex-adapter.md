# B06：添加 Codex 配置适配

Type: task
Status: resolved
Blocked by: D01, B04

## 交付

实现 Codex 的全局及工作空间配置发现、解析、诊断和安全编辑 adapter。

## 验收标准

- 覆盖 D01 确认的稳定配置类型和作用域。
- 复用配置模块，不在 Tauri commands 或 UI 写 Codex 特判。
- 未知字段与不能无损编辑的内容得到保留或明确警告。
- 通过真实格式夹具验证发现、解析、写入和并发冲突。

## Result

- Codex adapter 支持 `$CODEX_HOME/config.toml` 与工作空间 `.codex/config.toml`；环境覆盖在 `ScanContext` 创建时捕获，扫描过程保持稳定且只读。
- TOML 原文、注释、顺序及未知字段不经结构化重渲染；结构化视图和源码预览默认遮罩敏感字段。
- 真实 TOML 夹具覆盖嵌套 table、未知字段和全局路径覆盖，并通过共享配置模块验证精确字节写入、备份和外部并发冲突拒绝。
