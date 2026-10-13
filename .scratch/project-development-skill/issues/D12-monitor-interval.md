Type: task
Status: resolved
Blocked by: none

# 发布监控每两分钟查询

## Acceptance

- github-cli 正常运行默认每 2 分钟 / 120 秒查询一次，按固定 run ID 和 SHA 跟踪。
- 用户主动查询、已收到状态通知或诊断失败时可即时检查；普通等待不加密轮询、不重复触发。
- 结合 job timeout 判断运行，不因几次状态不变重启构建；结构、链接和格式有效。

## Comments

- 当前 0.1.6 监控已采用该用户偏好；候选仍为 18786b5 / 38337575413，监控文档更新记录在 Unreleased，不替换正在验证的源码。

## Result

- github-cli 1.6.2 将 30–60 秒改为默认 120 秒；固定 run ID / SHA，保留主动查询和故障诊断的即时检查，普通等待不额外刷新。
- 元数据、6 个本地引用、Prettier 与 git diff --check 通过；纯规范变更不增加镜像文本的测试。
- Standards：沿用现有查询与重跑边界，不修改工作流或正在验证的源码；Spec：监控按用户指定间隔执行，最新查询确认修复后 Windows core tests 通过。
