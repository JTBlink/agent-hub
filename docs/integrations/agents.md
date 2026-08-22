# Agent 兼容设计

> 状态：规划中

第一版兼容 Claude Code、Codex 和 OpenCode。三者通过统一的 `AgentConfigAdapter` interface 接入：

```rust
trait AgentConfigAdapter {
    fn discover(&self, context: &ScanContext) -> Result<Vec<ConfigLocation>>;
    fn parse(&self, input: ConfigInput) -> Result<ConfigDocument>;
    fn validate(&self, document: &ConfigDocument) -> Vec<Diagnostic>;
    fn render(&self, edit: ConfigEdit) -> Result<RenderedConfig>;
}
```

每个 adapter 负责自身的可执行文件探测、全局及工作空间配置发现、配置解析、校验和安全渲染。配置路径与格式不得散落在 UI、Tauri commands 或其他业务模块中。

实际路径、格式和版本差异见[兼容性研究矩阵](../research/agent-compatibility.md)（已于 2026-08-22 核验）。实现 adapter 时应以该矩阵及对应官方文档为准；若版本变化，先更新研究记录和相关 ADR，再调整代码。

## 兼容原则

- 探测操作默认只读。
- 保留未知配置字段和用户原始内容。
- 写入前展示差异并要求确认。
- CLI 缺失时返回结构化诊断，不影响其他 Agent。
- adapter 的行为通过固定目录和配置夹具进行集成测试。
