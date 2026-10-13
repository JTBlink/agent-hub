Type: task
Status: claimed
Blocked by: none

# 根据远端 tag 自动选版并连续发布

## Acceptance

- github-cli 正式发布入口自动串联版本选择、同步、提交 push、三平台候选、tag、正式构建及附件验收。
- 远端 tag 决定是否升级：已占用 / 落后版本从最新稳定版升级 patch，已准备的更高版本直接沿用；支持明确 minor / major 和指定版本。
- 版本在本次流程中固定；失败续发不再升级，既有 tag 不自动移动，远端查询失败不视为无 tag。
- 只读选版脚本、Skill 元数据、链接、格式和相关测试通过。
- 提交 push Skill，然后发布已提交 main；不纳入其他任务未提交改动。

## Comments

- 用户明确将实现范围收敛为 Skill；已撤回未完成的独立 Release workflow 方案，仅增强现有 Agent 发布流程。

## Result

- github-cli 1.5.0 增加只读选版脚本：数字 SemVer 比较、annotated / lightweight 去重、稳定版与预发布区分、明确版本与失败续发；同步入口、界面元数据、流程和 CI/CD 文档。
- 4 个测试文件、62 项测试通过，包含 21 项选版行为用例；真实远端查询为 VERSION=0.1.5、最新 v0.1.5，选出 0.1.6。
- 用户授权提交 push 后发版，后续版本发布记录见 [0.1.6 发布任务](../../version-0.1.6/issues/R01-release.md)。
