# Git 提交规范

本仓库的提交说明统一使用中文，提交内容应与 `.scratch/` 任务记录保持可追溯。

## 提交标题

- 使用祈使语气，简洁描述一个明确事项。
- 标题不超过 72 个字符，不以句号结尾。
- 一个提交只处理一个主题；功能、修复、文档和格式化改动不要无关混杂。

示例：

```text
修复未安装 Agent 的展示状态
完善跨平台安装包验收
更新配置安全策略文档
```

## 提交正文

涉及任务的提交正文必须包含对应 tracker 文件链接或路径，例如：

```text
关联：.scratch/agent-hub-v1/issues/B14-release.md
```

正文应简要说明：

1. 改动范围和用户可见影响；
2. 兼容性、发布流程或安全边界变化（如有）；
3. 实际执行过的验证命令及结果。

示例：

```text
关联：.scratch/agent-hub-v1/issues/B14-release.md

修复 Linux 安装包 smoke 测试的本地路径解析，并在原生 Runner
执行配置扫描、原子写入和 SQLite migration 验证。

验证：npm test -- --run；cargo test --manifest-path src-tauri/Cargo.toml。
```

## 提交前检查

- 检查用户可见行为、发布流程和兼容性是否需要更新 `CHANGELOG.md` 的 `Unreleased`。
- 检查任务状态、依赖和结果是否已回写 `.scratch/`。
- 运行与改动相关的测试、格式检查、lint 和构建命令，并把结果写入正文。
- 清理真实用户名、邮箱、令牌和个人绝对路径；示例路径使用 `~/...` 或 `<workspace>`。
- 提交后确认工作区干净，远程 CI 结果与本地验证一致。

## 审查要求

提交应通过 Standards 与 Spec 两轴审查。审查发现的问题必须在提交前修复，或在对应 tracker 的 `## Comments` 中记录明确的后续事项；不能只依赖提交信息宣称已完成。
