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

## 兼容原则

- 探测操作默认只读。
- 保留未知配置字段和用户原始内容。
- 写入前展示差异并要求确认。
- CLI 缺失时返回结构化诊断，不影响其他 Agent。
- adapter 的行为通过固定目录和配置夹具进行集成测试。

各工具的实际配置路径、文件格式和版本兼容矩阵应在实现前依据官方资料单独确认，避免将易变化的约定写死在核心模型中。
