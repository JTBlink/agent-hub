# B03：交付 Claude Code 全局配置纵向切片

Type: task
Status: claimed
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
