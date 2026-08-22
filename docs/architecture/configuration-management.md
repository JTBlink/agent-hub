# 配置管理架构

> 状态：规划中

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

## 备份与回滚

每次由 AgentHub 发起的写入都创建备份，并记录原始 checksum、目标路径、时间和操作类型。回滚本身也是一次新操作：回滚前再次备份当前文件，避免历史恢复导致数据不可逆丢失。

## 可视化界面

配置中心建议采用三栏布局：左侧按 Agent 和作用域显示文件树，中间提供表单/源码编辑器，右侧显示说明、诊断和变更差异。敏感字段默认隐藏，并可按字段短暂显示。
