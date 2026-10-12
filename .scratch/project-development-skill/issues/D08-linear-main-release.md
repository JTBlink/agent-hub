Type: task
Status: resolved
Blocked by: none

# main 单线集成与无分支发布

## Scope

将用户已确认的“一条线 rebase、release 不需要分支、及时集成分支改动”写入项目 github-cli Skill。版本从 1.3.0 升至 1.4.0，同步入口、界面元数据、发布流程、故障处理、检查提示和项目记录；不改变应用版本或触发发布。

## Acceptance

- 发布使用 main、固定 SHA 和 tag，不再要求创建 release 或独立候选分支。
- 临时工作分支及时 rebase 到最新 main，通过快进集成保持单线历史；确认无独有改动与活动任务后安全清理。
- 保留干净检出、同 SHA 三平台候选、release:ready 和既有 tag 不可变规则。
- main 前进时明确重新核实范围与 SHA；同 ref 候选串行触发，不取消正常构建。
- 格式、技能元数据、链接与现行脚本 / workflow 一致，保留其他任务的工作区改动。

## Comments

- 原发布流程要求 main 变化时创建独立候选分支，与用户指定的发布方式冲突；已统一改为 detached 验证和 main 上的候选。
- 当前 workflow_dispatch 按 ref 触发，preflight 先解析再固定构建 SHA；不能假设 main 永远停在触发时的 SHA，必须核对实际运行与构建证据。

## Result

- github-cli 升至 1.4.0，统一入口、UI 元数据、发布流程、故障处理、候选指令与缺失候选的错误提示；未修改工作流行为或应用版本。
- `npx vitest run scripts/check-release-candidate.test.mjs scripts/workflow-contract.test.mjs`：2 个文件、37 项测试通过。
- 使用仓库已有 `yaml` 包检查 frontmatter、字段、版本、UI 描述与调用提示，36 个本地链接全部有效；相关文件 Prettier 和 `git diff --check` 通过。
- skill-creator 的 quick_validate 因本机缺少 PyYAML 无法启动；使用上述现有 YAML 库完成结构校验，没有改动本机 Python 环境，也未将 quick_validate 记录为通过。
- Standards：规范与现有 ref 触发、同 ref 取消和固定 SHA 的实现一致，保留三平台门禁、既有 tag 和其他任务改动。
- Spec：删除创建 release / 独立候选分支的要求；明确 rebase、快进、及时集成及清理条件，主分支前进时核实发布范围和新候选证据。
