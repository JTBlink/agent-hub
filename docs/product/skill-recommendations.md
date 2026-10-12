# Skill 推荐与用法指南

AgentHub 统一管理 Skill，跨设备同步。本文推荐一些高质量的社区 Skill 来源和实用搭配思路，帮助你快速上手。

## 热门 Skill 来源

### mattpocock 系列

[Matt Pocock](https://github.com/mattpocock) 是 TypeScript 社区的知名教育者，维护了一系列面向 Claude Code 的高质量 Skill：

| Skill | 用途 | 安装来源 |
|-------|------|----------|
| **cursor-rules** | 前端开发规范集合，涵盖 React、Next.js、TypeScript 等主流框架的最佳实践 | `git:github.com/mattpocock/cursor-rules` |

适用场景：
- 前端项目快速上手，避免反模式
- 团队统一编码风格
- 搭配 Claude Code / Cursor 使用效果最佳

### Anthropic 官方

Anthropic 在 Claude Code 文档中提供了 Skill 编写规范和示例：

- **claude-code-guide** — Claude Code 本身的使用指南，了解 Slash Commands、Hooks、MCP 等能力
- 内置的 `/init` 命令会生成 `CLAUDE.md`，本身就是一种项目级 Skill

### 自建 Skill

最有价值的 Skill 往往来自你自己的团队实践。常见自建方向：

| 方向 | 示例 |
|------|------|
| 提交规范 | 团队的 Git commit message 格式、PR 模板 |
| 代码审查 | 公司特有的安全检查清单、性能基线 |
| 项目引导 | 新人上手指南，架构决策背景 |
| 部署流程 | CI/CD 触发条件、环境变量约定 |
| 领域知识 | 业务术语表、API 约定、数据模型说明 |

## 按角色推荐搭配

### 前端开发者

```
技能组：前端日常
├── cursor-rules（mattpocock）    — 框架最佳实践
├── code-review                   — 代码审查清单
├── git-commit                    — 提交规范
└── tdd                           — 测试驱动开发
```

### 全栈开发者

```
技能组：全栈开发
├── cursor-rules（mattpocock）    — 前端规范
├── rust-dev / 后端 Skill         — 后端规范
├── code-review                   — 审查
├── git-commit                    — 提交
└── research                      — 技术调研
```

### 团队 Lead

```
技能组：团队管理
├── code-review                   — 审查标准
├── security-review               — 安全检查
├── git-commit                    — 提交规范（全团队统一）
└── 自建：团队 onboarding          — 新人引导
```

## 使用技巧

### 1. 用技能组批量管理

不要逐个安装 Skill，把常用组合整理成技能组：

- **日常开发** — 每天都用的基础 Skill
- **代码审查** — PR review 时启用
- **发布部署** — 版本发布时启用

切换上下文时一键切换技能组，比手动管理效率高很多。

### 2. 项目级 vs 全局

| 场景 | 放哪里 |
|------|--------|
| 所有项目都用（提交规范、审查清单） | 全局安装 |
| 特定项目（框架约定、业务逻辑） | 项目安装 |
| 团队共享（提交到 Git，成员拉取即用） | 项目安装 + 团队共享 |

### 3. 保持 Skill 精简

一个好的 Skill 应该：
- **单一职责** — 一个 Skill 解决一类问题
- **可组合** — 能和其他 Skill 搭配使用
- **有边界** — 说清楚什么时候用，什么时候不用

避免写一个巨大的"万能 Skill"，拆成多个小 Skill 再用技能组组合。

### 4. 定期检查更新

从 Git 来源导入的 Skill 支持检查更新。建议每周浏览一次技能库，看看哪些 Skill 有新版本。

## 寻找更多 Skill

- **GitHub 搜索** — 搜索 `claude-code skills` 或 `cursor rules`
- **社区分享** — 关注 Claude Code、Cursor 等工具的社区论坛
- **团队内部** — 最好的 Skill 往往来自同事的日常实践

> 有好的 Skill 推荐？欢迎在 [GitHub Issues](https://github.com/JTBlink/agent-hub/issues) 分享。
