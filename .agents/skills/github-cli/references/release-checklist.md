# 发布验收

- 当前提交通过开发指南中的格式、lint、测试、版本和构建检查。
- Windows、macOS Universal、Linux 原生 Runner 均生成安装包并通过包内 smoke。
- 安装包包含匹配版本及架构的 `agent-hub-cli`。
- 干净用户环境首次启动成功，技能库、工作空间、设置和主题切换正常。
- 数据默认写入 `~/.agent-hub`，不自动接管旧版或原管理器数据库。
- Logo、安装包图标、应用名和发布链接均属于 agent-hub。
- 已配置测试远端时，验证备份、恢复、冲突流程；无远端时不声称已验证。
- CHANGELOG、平台矩阵与 `.scratch/` 记录实际结果，汇总安装包及 SHA256SUMS 校验通过。

单台 macOS 本地验证不代表 Windows、Linux 或 Universal 安装验收完成。
