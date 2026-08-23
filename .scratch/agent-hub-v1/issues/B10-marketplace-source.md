# B10：支持标准 Marketplace 来源

Type: task
Status: resolved
Blocked by: D01, D02, B09

## 交付

实现 Marketplace manifest 解析，将条目转换为统一 Skill 描述，并复用 Git/其他来源获取具体内容。

## 验收标准

- 支持 D01 确认的标准 `marketplace.json` 布局。
- 展示名称、版本、描述、作者、兼容性和安装来源。
- 不完整或未知条目可见但不可安装，并提供诊断。
- manifest 不触发任意代码或安装脚本执行。
- 使用官方示例及异常 manifest 夹具测试。

## 当前状态

`resolved`。manifest、远程 locator 解析与统一 `browse_skill_source` command 已完成；Skills 页面已接入本地 manifest 浏览、目录条目展示与统一安装计划入口。

## Result

- 解析 `.claude-plugin/marketplace.json` 的本地 string source 和标准 GitHub object source，保留名称、版本、描述、作者、homepage、兼容性及完整未知字段。
- 本地条目复用只读目录扫描；GitHub object 转换为统一 `GitLocator`，由安全 Git fetch 获取内容。
- 缺名称/来源、未知远程类型、越界路径和不可读目录保持可见但不可安装，并返回结构化诊断。
- manifest 只通过 JSON 读取，从不执行 hooks、脚本或安装命令；正常与异常 fixture 已覆盖。
