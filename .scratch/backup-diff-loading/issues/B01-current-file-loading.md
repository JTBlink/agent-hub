Type: task
Status: resolved
Blocked by: none

# 修复重复选择备份文件后的永久加载

## Comments

- 用户反馈文件差异页一直 Loading。组件回归复现：读取成功或失败后重复选择当前路径，会清空结果并进入等待，但路径未改变，读取 effect 不会再次运行。
- 请求中重复点击与快速切换的乱序响应测试通过；本次修复聚焦已复现的状态迁移缺陷。

## Result

- [BackupDiff](../../../src/views/BackupDiff.tsx) 对重复选择当前路径直接保留状态，确保只有会触发读取的选择才清空结果并进入等待。
- [组件回归](../../../src/views/BackupDiff.test.tsx) 修复前 4 项中 2 项失败，直接复现成功或失败后重复点击导致永久 Loading；修复后 4 项全部通过。测试同时覆盖首次自动读取、请求中重复点击及快速切换后的乱序响应。
- `npm test`：84 个测试文件、451 项通过；`npm run lint`、`npm run build` 与 `git diff --check` 通过。构建保留既有大 chunk 和 Browserslist 数据过期提示。
- Standards：复用已有读取 effect 与过期请求清理，不改 IPC、后端或持久化格式。Spec：重复点击保留内容、错误及当前请求，切换文件正常读取且不被旧结果覆盖。
- 已补充 CHANGELOG；未修改 Rust，未执行 Rust 检查。本次为组件自动化验证，尚未进行原生桌面主题、缩放与键盘验收，也未发布。用户已授权提交并推送，与差异页刷新功能一并交付。
