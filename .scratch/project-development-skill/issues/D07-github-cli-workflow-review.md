Type: task
Status: resolved
Blocked by: none

# 优化 GitHub Skill 的版本约束与发布证据

## Scope

用户要求检查 github-cli 是否需要优化。结合 D06 的实际发布经历审查技能和实现，仅调整项目技能规范、界面元数据与记录。Skill 版本从 1.2.0 调整为 1.3.0，应用 VERSION 保持 0.1.4；本任务不创建 tag、触发 Actions 或发布 Release。

## Acceptance

- 构建失败不擅自改变用户指定版本，已发布 tag 保持不可变。
- 共享工作区固定发布 SHA，候选与正式发布证据可追溯，不混入其他任务的 HEAD 或运行。
- 同 SHA 的完整验证可以复用，新 SHA 仍通过完整三平台候选，不取消正常构建。
- 区分运行中 workflow 与已失败 job，明确重试、日志和 artifact 边界。
- 技能格式、链接、UI 元数据、现行发布脚本与工作流一致。

## Comments

- 原规范遇到新修复提交直接要求升级，新版本建议与用户指定版本约束存在冲突；现统一到发布流程的冲突恢复决策。
- release:ready 当前检查干净检出、版本、同 SHA 的成功手动候选及六个 job / 必要 step；它不检查既有 tag、Release 附件和 artifacts 到期。正式 tag 会重新构建，候选 artifacts 到期与历史测试证据是不同事项。
- skill-reviewer 的本地清单要求所有引用仅一层；skill-creator 允许参考资料按相关任务互相引用。保留现有跨文档链接以免复制规范，明确记录这项清单差异，不将其描述成官方格式失败。

## Result

### Skill Review Report: github-cli

- 类型：复杂型（入口、界面元数据与按任务加载的参考资料）。
- 合规：本地清单 7/8；引用深度保留为清单差异。基础格式、命名与界面元数据使用仓库已有的 YAML 库验证。

| 合规项               | 结果     | 证据                                  |
| -------------------- | -------- | ------------------------------------- |
| name 格式与目录一致  | PASS     | github-cli，小写连字符                |
| name 非保留词        | PASS     | 不使用 skill / tool / agent 整词      |
| description 非空     | PASS     | 包含功能和使用场景                    |
| description 触发明确 | PASS     | Actions、CI/CD、tag、发布与附件校验   |
| 正文不超过 500 行    | PASS     | 入口保持简短，细节在 references       |
| 仅一层引用           | 保留差异 | 参考资料互链及 rust-dev 规范复用      |
| 相对路径             | PASS     | 无个人绝对路径，shell 示例注明平台    |
| 无硬编码敏感信息     | PASS     | 使用占位仓库、环境变量和 Secrets 名称 |

| 质量项           | 结果 | 说明                                                       |
| ---------------- | ---- | ---------------------------------------------------------- |
| 简洁性           | WARN | 安全不变量在入口和流程仍有必要重复，条件细节统一到发布流程 |
| 渐进披露         | PASS | 按任务读取，规范修改不加载全部构建上下文                   |
| 写作风格         | PASS | 用具体操作、原因和证据说明边界                             |
| 示例质量         | PASS | 命令与当前 gh / npm 入口一致，占位参数需实际替换           |
| 术语一致         | PASS | 区分候选、正式 Release、job、run 与 SHA                    |
| 时效性           | PASS | 实现核对当前脚本，计费资料保留核实日期及复核条件           |
| 脚本规范         | INFO | 技能目录无独立脚本，复用仓库发布脚本                       |
| 决策路由         | PASS | 入口任务表与 tag / 重试决策表                              |
| 验证循环         | PASS | 失败点修复、新 SHA 验证、发布附件校验                      |
| description 区分 | PASS | rust-dev 负责开发，本技能负责 Actions 与发布               |

平台适配：未限制 allowed-tools；引用路径可移植，shell 示例说明 Windows 等价命令；依赖仓库既有 Node / gh / Git，不新增私有依赖。

### 实现与验证

- 更新 SKILL.md、openai.yaml、发布流程、故障处理和发布前验证资料；本次应用版本未改变，未修改 workflow 或发布脚本。
- `npx vitest run scripts/check-release-candidate.test.mjs scripts/workflow-contract.test.mjs scripts/assemble-release.test.mjs scripts/verify-release-bundle.test.mjs`：4 个文件、48 项测试通过。初次误用 Node test runner 已改正，不能将该入口错误算作产品回归。
- 使用仓库已有 `yaml` 包解析 frontmatter / openai.yaml：名称、字段、正文行数、技能版本、UI 描述及调用提示通过；技能参考资料和 tracker 的 33 个本地文件链接、个人路径及敏感字面量检查通过。
- skill-creator 的 quick_validate 因本机缺少 PyYAML 无法启动；未改动本机 Python 环境，也未把它记录为通过。
- `npm run version:check -- v0.1.4` 通过；Prettier 与 `git diff --check` 通过。仅文档改动，无需重复 Rust / 前端完整构建。
- Standards：保留已发布 tag、源码隔离、最小日志与完整原生门禁，引用权威规范而不复制代码。
- Spec：修复版本约束与发布证据歧义，减少重复工作，不把技能维护扩展成新发布。
