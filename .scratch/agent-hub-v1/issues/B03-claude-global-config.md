# B03：交付 Claude Code 全局配置纵向切片

Type: task
Status: resolved
Blocked by: D01, D03, B01, B02

## 交付

实现首个 `AgentConfigAdapter`，从磁盘发现 Claude Code 全局配置，经 Rust 解析后在 React 配置中心展示内容和诊断。

## 验收标准

- 展示文件路径、作用域、格式、checksum 和最后修改时间。
- 支持结构化视图及只读源码视图。
- 文件缺失、权限不足、语法错误均可诊断。
- 扫描只读，不创建或修改用户文件。
- 使用临时目录夹具覆盖跨平台路径规则。

## Comments

- 公共测试 seam 为 `ClaudeCodeAdapter::scan_global(ScanContext)`；所有文件场景使用临时 home/override 目录，不扫描真实用户配置。

## 实现结果

- `ScanContext::from_environment` 捕获 `CLAUDE_CONFIG_DIR`，显式 override 优先，未设置时回退到运行时 home 下的 `.claude`；扫描不创建目录或写入文件。
- `ClaudeCodeAdapter` 返回 Agent、作用域、格式、路径、SHA-256 checksum、修改时间、结构化视图、保留原始换行/缩进的脱敏源码预览和结构化诊断。
- JSON 语法错误、缺失文件、权限错误和其他 I/O 错误均返回状态与诊断；坏 JSON 的源码预览同样遮罩敏感键（包括 `apiKey`、`authorization`、`cookie`、`private_key` 及嵌套值）。
- 新增只读 Tauri command `scan_claude_global` 和 React binding `getClaudeGlobalConfig`，供配置中心复用。
- 集成夹具覆盖正常 JSON、未知字段、环境变量路径、缺失、权限、坏 JSON、嵌套/转义/部分写入敏感值；`cargo test --test claude_config` 通过（10 tests）。
