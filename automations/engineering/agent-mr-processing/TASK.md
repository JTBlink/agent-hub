# PR / MR 审查与修复

脚本按创建时间选择最早的开放、非草稿待处理请求，每轮一个，输出编号、标题、链接及版本。Agent 使用 `code-review` 审查、修复并提交源分支，评论结果；修复后 pending，由新上下文独立重审，不自签 passed。

次数由本地回调累计，达到上限停止修复并按事实交给人工，不把预算等同审查结论。三态标签只操作当前 MR/PR，保留其他标签。处理状态与执行记录均位于 `.local/`，不导出、备份或同步。

- [平台配置](references/platforms.md)
- [运行恢复](references/runtime.md)
- [标签与回调协议](references/review-labels.md)
