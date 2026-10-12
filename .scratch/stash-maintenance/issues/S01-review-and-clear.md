Type: task
Status: resolved
Blocked by: none

# 核对并清理历史 stash

## Comments

- 用户要求及时处理并清理 stash；本次不创建提交、不推送。

## Result

- 2026-10-12 核对两条历史 stash，主要功能已由 `5e5db67`、`4acb515`、`e88b0e0`、`560a703`、`8177eac` 等提交实现；不重新应用导致重复定义和冲突的旧补丁。
- 发布前 stash 包含 54 个未跟踪文件，当前 HEAD 全部已有；其中后续修改以当前实现为准。残余旧接口草稿、文案和样式差异一并归档，不宣称逐字合入。
- 两条 stash 完整保存在 Git 归档引用，并写入 `.git/stash-archive/2026-10-12/reviewed-stashes.bundle`；保留原提交、索引和未跟踪文件树。bundle 校验通过后逐条删除 stash，列表已空。
- 归档引用：`refs/archive/stash/2026-10-12/pre-release-wip`、`refs/archive/stash/2026-10-12/source-and-conflict-wip`。
- 如需恢复，可运行 `git stash store -m archived-pre-release-wip refs/archive/stash/2026-10-12/pre-release-wip`；另一条使用对应引用。
- Standards：未覆盖现有代码及并行版本改动，未丢弃未合入草稿；归档引用使原对象不受垃圾回收影响。Spec：完成核对、可恢复备份和 stash 清理。
- 验证：Git 对象与文件树比对、`git bundle verify`、`git bundle list-heads`、`git stash list`、`git diff --check`；应用代码未改动，未重复构建或运行测试。
