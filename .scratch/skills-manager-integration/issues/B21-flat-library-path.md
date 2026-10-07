# B21：移除默认技能库的 library 层级

Type: task
Status: resolved
Blocked by: none

## Scope

默认技能目录改为 ~/.agent-hub/skills，兼容旧默认库并迁移数据库、元数据和部署引用，不覆盖已有目标内容，不接管 ~/.skills-manager 中的旧数据。

## Acceptance

- 增加相关回归测试，更新产品说明和 CHANGELOG。
- 构建、测试、格式、lint 和严格 Clippy 检查通过。

## Result

默认库移除 library 层，Skill 位于 `~/.agent-hub/skills`。旧默认库由 library_layout 在排他租约下逐项无覆盖迁移，使用原子恢复日志并回写重定位标记；目录冲突保留原库，中断恢复后才打开数据库。固定应用目录、自定义库与其他管理器不变。

本机开发应用重启后已确认新目录、旧目录移除、迁移日志清除，以及数据库中的旧中央路径为 0。验证：覆盖完整库、WAL、密钥、OS 元数据冲突、中断及完成后未记录场景；完整 Rust 测试、格式与严格 Clippy 通过。

## Review

- Standards：独立迁移模块复用现有租约和部署引用重定位，不复制数据库业务。配置和恢复日志原子写入，CLI 不提前创建空库。
- Spec：旧库内容及状态保留，不覆盖目标内容，不迁入其他应用数据。
