Type: task
Status: resolved
Blocked by: none

# B01：仅手动或版本 tag 触发 Actions

## Result

- 三个工作流统一保留 `workflow_dispatch` 和 `push.tags: v*`，移除分支 push、PR 及主页路径触发配置。
- 同步 CI/CD 文档和 Unreleased 更新日志，补充三个工作流的触发条件回归测试。
- 验证：`npm run test -- scripts/workflow-contract.test.mjs`（21 项通过）、变更文件的 Prettier 检查、`npx eslint scripts/workflow-contract.test.mjs`、`npm run tasks:check` 与 `git diff --check` 均通过。
- 工作流配置见 [CI](../../../.github/workflows/ci.yml)、[安装包](../../../.github/workflows/build-installers.yml) 和 [主页](../../../.github/workflows/deploy-pages.yml)。

## Comments

- Spec：普通分支提交与 PR 不自动执行，推送版本 tag 和手动入口均可执行；发布条件与质量门禁保留。
- Standards：仅修改工作流、相关测试与文档，保留工作区已有的其他修改。
