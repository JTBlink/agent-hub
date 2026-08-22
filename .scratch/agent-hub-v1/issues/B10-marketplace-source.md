# B10：支持标准 Marketplace 来源

Type: task
Status: open
Blocked by: D01, D02, B09

## 交付

实现 Marketplace manifest 解析，将条目转换为统一 Skill 描述，并复用 Git/其他来源获取具体内容。

## 验收标准

- 支持 D01 确认的标准 `marketplace.json` 布局。
- 展示名称、版本、描述、作者、兼容性和安装来源。
- 不完整或未知条目可见但不可安装，并提供诊断。
- manifest 不触发任意代码或安装脚本执行。
- 使用官方示例及异常 manifest 夹具测试。
