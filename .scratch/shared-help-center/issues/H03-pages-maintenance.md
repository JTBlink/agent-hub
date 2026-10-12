# H03：网站发布与维护验收

Type: task
Status: resolved
Blocked by: H02

## What to build

维护者通过现有 Pages 工作流发布产品首页与公开文档；新增文章的步骤、检查和验证证据有据可查。

## Acceptance criteria

- [x] 产品首页文档入口指向文档站，统一 artifact 包含首页与分享文章。
- [x] 保持 tag 和手动触发、最小发布权限与依赖锁定。
- [x] 内容校验进入构建和测试入口，维护说明给出新增、翻译、草稿与链接约定。
- [x] 更新领域上下文、架构、CHANGELOG 和任务状态。
- [x] 完成前端与相关工作流验证、Standards / Spec 双轴审查并记录原生验收边界。

## Comments

依赖 H02，正式部署不在本任务范围内。

## Result

Pages 安装锁定依赖并校验版本和帮助内容，产品首页与文档站合并为单个 artifact。保留版本 tag 与手动触发、既有最小权限。更新维护说明、ADR-0014、领域上下文、架构、规划与 changelog。

验证：前端全量 65 文件、314 项通过；lint、Prettier、类型与应用生产构建通过；`npm run website:build`、24 项工作流合约、内容/版本/tracker 检查和 `git diff --check` 通过。Rust 测试 699 项通过、8 项忽略；Rust fmt 首次因并行任务的测试格式失败，后续该任务修复后复查通过。Clippy 首次因并行项目技能恢复代码的 needless_borrow 失败，该任务修复后严格 Clippy 复查通过。本需求无 Rust 业务代码变更。

Standards 和 Spec 两轴复查通过：修复未发布资源打包、跨语言旧地址、无效 hash、重复回退规则及翻译扩展后的章节跳转，均有回归验证。正式发布、远程 Pages 部署和跨平台安装包验收不在本次范围。

入口：[Pages 工作流](../../../.github/workflows/deploy-pages.yml)、[维护指南](../../../docs/help/README.md)、[ADR](../../../docs/adr/0014-shared-help-content.md)。
