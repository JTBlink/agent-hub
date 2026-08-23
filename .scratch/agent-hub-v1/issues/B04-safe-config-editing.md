# B04：实现安全编辑、Diff、备份与回滚

Type: task
Status: resolved
Blocked by: D03, B03

## 交付

在 Claude Code 纵向切片上完成配置编辑闭环，建立所有 Agent 后续复用的深模块。

## 验收标准

- 支持校验、变更 Diff 和用户确认。
- 写入前检查 checksum，外部修改时拒绝覆盖。
- 原子写入并保持合理文件权限。
- 每次写入和回滚前创建备份。
- 可从历史记录恢复，失败时原文件不受损。
- 敏感值在 UI 和日志中默认遮罩。

## Result

- `configuration` 深模块统一执行 JSON/JSONC/TOML 校验、遮罩 Diff、checksum 乐观锁、私有备份、同目录原子替换和权限保留；无效编辑及并发写入不会改动原文件。
- 写入和回滚 command 只接受扫描授权过且格式匹配的配置，并通过 `ConfigMetadataRepository` 原子记录备份与操作元数据；文件替换后若历史持久化失败，会按新 revision 执行补偿回滚。
- 新增历史列表、单项读取、遮罩恢复预览和按 operation id 恢复 command；回滚再次备份当前版本，工作空间移除后路径快照仍可查询。
- Rust 测试覆盖敏感值、权限、外部修改、非法备份路径、写入/回滚和迁移后的历史恢复；前端配置编辑与历史页执行显式预览和确认。
