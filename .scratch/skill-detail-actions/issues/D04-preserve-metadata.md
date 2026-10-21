Type: task
Status: resolved
Blocked by: none

## Scope

技能库详情显示已有版本，完整保留说明；正文展示摘要、描述、版本、许可证和自定义元信息，适用于中心、来源和项目副本。解析失败保留原始元信息。同步三种语言、changelog 与回归验证。

## Result

- 技能库详情常显已有版本；技能库与项目详情取消描述的三行截断。
- 共用正文解析与元信息组件保留摘要、描述、版本（含 metadata.version）、许可证和自定义字段；本地、中心及项目副本使用各自文档。异常 YAML 保留原文；兼容 BOM、CRLF 和文件末尾分隔符。
- YAML 复用现有依赖并调整为运行依赖；中、英、繁体标签同步。
- 验证：`npm test` 全量 90 个文件、531 项通过；`npm run lint`、`npm run build` 通过。构建仍提示 Browserslist 数据陈旧和主包体积较大。
- 本次仅修改前端，未运行 Rust 检查；未执行原生桌面的主题、缩放与键盘视觉验收。

## Review

Standards：元信息解析集中在 `src/lib/skillDocument.ts`，展示复用 `SkillDocumentMetadata` 与现有主题 token；不修改 IPC、存储或源文件。

Spec：保留完整描述，已有版本不随来源折叠隐藏；回归覆盖摘要、嵌套版本、自定义字段、来源切换及异常元信息。
