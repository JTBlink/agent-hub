# 配置管理架构

> 状态：安全策略已确定（D03，2026-08-22）；实现规划中。

## 管理范围

AgentHub 将配置按两个维度统一展示：

- Agent：Claude Code、Codex、OpenCode。
- 作用域：`global`（用户全局）与 `workspace`（指定项目）。

配置项必须保留来源 Agent、实际路径、文件格式和作用域，不能把不同 Agent 中语义相似但行为不同的字段强行合并。第一版提供统一入口和统一操作体验，不建立有损的“万能配置格式”。

## 核心模型

```text
ConfigDocument
├── agent
├── scope
├── path
├── format
├── revision/checksum
├── parsed view
├── raw content
└── diagnostics
```

`AgentConfigAdapter` 隐藏不同 Agent 的发现规则和配置语法：

```rust
trait AgentConfigAdapter {
    fn discover(&self, context: &ScanContext) -> Result<Vec<ConfigLocation>>;
    fn parse(&self, input: ConfigInput) -> Result<ConfigDocument>;
    fn validate(&self, document: &ConfigDocument) -> Vec<Diagnostic>;
    fn render(&self, edit: ConfigEdit) -> Result<RenderedConfig>;
}
```

## 读取与扫描

应用启动及用户手动刷新时扫描已知全局位置和已登记工作空间。扫描只读文件元数据及内容，不修改目录。无法解析的文件仍应出现在列表中，并提供原始文本和诊断信息。

Agent 是否出现在界面还取决于对应 CLI 是否能从当前进程的 `PATH` 发现（Windows 支持 `.exe`、`.cmd`、`.bat`、`.ps1`）；配置文件存在但 CLI 未安装时不会把该 Agent 误显示为已连接。

## 编辑与写入

```text
读取当前版本
  → 表单或原始文本编辑
  → 格式和 Agent 规则校验
  → 生成差异
  → 用户确认
  → 校验磁盘 checksum 未变化
  → 备份原文件
  → 同目录临时文件 + 原子替换
  → 重新读取验证
```

写入失败时保留原文件并返回可操作的错误。若外部程序已修改文件，禁止静默覆盖。未知字段、注释和字段顺序应尽可能保留；不能安全往返的格式默认使用原始文本 patch，而不是完整重写。

## 格式策略

所有格式都保留原始 UTF-8 字节、BOM 与换行风格；非 UTF-8 文件第一版只读显示诊断。结构化表单只生成最小范围文本 patch，patch 后必须重新解析和执行 Agent adapter 校验。

| 格式     | 解析与编辑策略                                                       | 保留保证                                                   |
| -------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| JSON     | `jsonc-parser` 定位语法节点，`serde_json` 做严格 JSON 验证           | 最小 patch 保留未改区域的缩进、顺序和换行；JSON 不允许注释 |
| JSONC    | `jsonc-parser` 的 AST/range 和 comment token，按范围 patch           | 保留未知字段、注释、尾逗号、字段顺序与未改区域格式         |
| TOML     | `toml_edit` 解析为可编辑文档                                         | 保留注释、decor、顺序与未修改值的表示形式                  |
| YAML     | `saphyr-parser` 只做语法诊断；第一版仅提供原始文本/frontmatter patch | 不通过 AST 重排 key、锚点或注释；完整文本验证后写入        |
| Markdown | 原始文本编辑；`pulldown-cmark` 仅用于只读结构诊断                    | 不从 Markdown AST 重新渲染，保留空白、注释和嵌入内容       |

JSON/JSONC patch 若无法唯一定位目标字段，必须退回原始文本编辑，不能完整序列化覆盖。YAML 主要用于 `SKILL.md` frontmatter，扫描 Skill 时只读；第一版不提供通用 YAML 表单编辑器。

## 并发、权限与原子写入

- `ConfigRevision` 使用原始字节 SHA-256，并记录大小、修改时间及可用时的 inode/file ID。生成 Diff 时保存前置 revision；用户确认后、创建备份前及 rename 前再次读取比较，任一变化都返回 `external_modified` 和新 Diff。
- 临时文件通过 `create_new` 建在目标文件同一目录，写完后 `flush`/`fsync`。Unix 使用同文件系统原子 rename 并同步父目录；Windows 使用 `ReplaceFileW`。成功后重新读取并验证 checksum。
- 原文件存在时复制 Unix mode 或 Windows DACL；新文件在 Unix 使用 `0600`，Windows 仅授予当前用户。文件不属于当前用户、父目录不可写或无法复制权限时拒绝写入，不尝试提权。
- 符号链接默认只读。用户明确选择“编辑解析目标”后，记录 link 与 canonical target，写入前重新核对整条链，不替换链接本身。Unix 检测到多硬链接文件时拒绝原子替换并提示会破坏链接关系。
- 不协作的外部进程仍可能在最后一次比较与 rename 之间竞争；这是文件系统乐观锁边界。写入后文件 watcher 若发现 revision 不符，立即标记冲突，不自动重试覆盖。

## 备份与回滚

每次由 AgentHub 发起的写入都创建备份，并记录原始 checksum、目标路径、时间和操作类型。回滚本身也是一次新操作：回滚前再次备份当前文件，避免历史恢复导致数据不可逆丢失。

备份存放在用户专属目录 `~/.agenthub/backups/<config-id>/<timestamp>-<checksum>`，而非应用安装目录、原配置旁边或工作空间仓库中。目录在 Unix 使用 `0700`、文件使用 `0600`；Windows 使用当前用户 DACL。SQLite 只保存备份路径和元数据，不保存正文。

默认每个配置至少保留最近 10 份；超过 30 天的更早备份可清理，并设置每文件 50 份硬上限。清理只在成功操作后或应用启动维护阶段执行，失败不会影响配置。用户可固定重要备份；固定备份不参与自动清理。回滚前执行与普通编辑相同的 revision 检查、Diff、当前内容备份、原子替换和写后验证。

## 敏感数据

- 原始配置、Diff、备份和临时文件均视为敏感；日志、SQLite 操作记录、通知和错误报告不得包含它们的正文。
- adapter 提供敏感字段路径；通用兜底对大小写不敏感的 `token`、`secret`、`password`、`api_key`、`authorization`、`cookie`、`credential`、`private_key` 等键值遮罩为 `••••••`。未知字段默认按值不记录处理。
- 环境变量只记录变量名及 `set/unset` 状态，不读取或持久化值。命令执行日志只记录可执行文件、非敏感 flag 名与退出状态；内联 JSON、header、环境值和可能含凭据的命令参数全部遮罩。
- UI 默认遮罩敏感值；短暂显示需要显式操作，离开页面立即恢复。V1 不上传遥测或崩溃正文。
- 备份必须保存可恢复的原始字节，因此不做字段级遮罩；V1 依赖操作系统用户权限保护，不自行保存加密密钥。远程同步备份不在第一版范围。

## 失败场景与结果

| 场景                                    | 写入结果                                   | 用户可执行操作                 |
| --------------------------------------- | ------------------------------------------ | ------------------------------ |
| 解析或 Agent 校验失败                   | 不创建备份、不写磁盘                       | 跳转诊断位置，继续原始文本编辑 |
| revision 与磁盘不一致                   | 禁止覆盖                                   | 重新加载并查看三方 Diff        |
| symlink/目标身份变化                    | 禁止写入                                   | 重新授权解析目标               |
| 无权限、所有者不符或 DACL/mode 复制失败 | 原文件不变                                 | 修复权限后重试                 |
| 备份失败                                | 原文件不变，操作失败                       | 检查 `~/.agenthub` 空间/权限   |
| 临时写入、fsync、磁盘空间失败           | 原文件不变，清理临时文件                   | 释放空间或修复磁盘后重试       |
| 原子替换失败                            | 原文件及备份保留                           | 查看平台错误并重试             |
| 替换后校验失败                          | 优先从备份原子恢复并报告严重诊断           | 验证恢复结果或手动选择备份     |
| 备份后应用崩溃、替换前退出              | 原文件不变；启动时清理孤立临时文件         | 无需操作                       |
| 替换后、SQLite 完成记录前崩溃           | 启动时按操作意图、磁盘 revision 和备份对账 | 确认“已应用”或执行回滚         |

## 可视化界面

配置中心建议采用三栏布局：左侧按 Agent 和作用域显示文件树，中间提供表单/源码编辑器，右侧显示说明、诊断和变更差异。敏感字段默认隐藏，并可按字段短暂显示。
