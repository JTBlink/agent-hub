# B07：添加 OpenCode 配置适配

Type: task
Status: resolved
Blocked by: D01, B04

## 交付

实现 OpenCode 的全局及工作空间配置发现、解析、诊断和安全编辑 adapter。

## 验收标准

- 覆盖 D01 确认的稳定配置类型和作用域。
- 复用配置模块，不在 Tauri commands 或 UI 写 OpenCode 特判。
- 对格式、schema 或版本差异给出结构化诊断。
- 通过真实格式夹具验证发现、解析、写入和并发冲突。

## Result

- OpenCode adapter 支持 `$OPENCODE_CONFIG` 或默认全局 `opencode.json`，以及工作空间根 `opencode.json`；环境覆盖由 `ScanContext` 固化。
- JSONC 解析支持注释、尾逗号、Unicode、未知字段和嵌套对象；非对象根及非法 `$schema` 类型返回稳定的 `schema_mismatch` 结构化诊断。
- 真实 JSONC 夹具通过共享配置模块验证原文保留写入、敏感值遮罩、备份及 checksum 并发冲突拒绝。
