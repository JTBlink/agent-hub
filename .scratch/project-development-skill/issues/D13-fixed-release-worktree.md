Type: task
Status: resolved
Blocked by: none

# 固定发布验证 worktree 名称

## Acceptance

- 发布 worktree 固定为 `../agent-hub-release`，从仓库根目录解析路径，候选、tag 和附件验收共用。
- 续发核实归属、工作区状态和进程占用后复用；不覆盖现有内容、不为占用另建随机目录。
- 验收成功且无人使用时安全移除；旧随机目录正在运行的任务不迁移。

## Result

- github-cli 1.6.3 在唯一发布流程中定义固定路径、创建与复用条件、SHA 切换和收尾清理；同步 Unreleased、规格与索引。
- 本次只更新规范。检查时旧发布目录仍有 gh 下载进程，另一个检出仍有 shell 占用；未重命名、删除或创建实际 worktree，未修改 v0.1.6 的 tag 和发布源码。
- 验证：Skill frontmatter、文档链接、Prettier、tracker 状态与 git diff --check 通过；quick_validate.py 缺少 PyYAML，改用仓库现有 YAML 解析器检查元数据。
- Standards：沿用 detached 检出、固定 SHA 与同 SHA 候选门禁，归属不符或占用时保留现场。Spec：后续发布使用固定目录，共用验证与验收，不再创建随机 worktree。
