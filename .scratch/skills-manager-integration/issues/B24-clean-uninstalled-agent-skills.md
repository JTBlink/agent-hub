# B24：一键清理未安装 Agent 遗留的 Skills

Type: task
Status: claimed
Blocked by: none

## Scope

本地 Skills 管理提供一键清理入口，自动生成未安装 Agent 的遗留 Skill 位置清单，确认后清理并移除空 Skills 目录。保留共享给已安装 Agent 的路径、手动配置目标、技能库和其他 Agent 配置/历史；执行前重新检查安装、目录边界、指纹与托管状态。

## Acceptance

- 展示实际待删路径、数量，清理成功立即关闭弹窗，后台刷新。
- 同一路径只操作一次；逐项报告跳过或失败，不能静默丢失内容。
- Rust 临时目录回归覆盖共享根、安装状态变化、内容变化、链接与空目录。
- 浏览器 IPC fixture 验证确认、取消和批量清理，不删除真实安装。
- 更新 docs、CHANGELOG，完成构建与严格检查。
