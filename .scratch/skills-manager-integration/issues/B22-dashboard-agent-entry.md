# B22：让首页已启用 Agent 卡片进入管理页

Type: task
Status: resolved
Blocked by: none

## Scope

首页“已启用 Agent”统计卡片支持点击和键盘操作，进入现有 Agent 管理入口。

## Acceptance

- 验证点击、键盘导航和统计口径；更新操作文档与 CHANGELOG。
- 构建、lint 和相关回归检查通过。

## Result

首页卡片成为可键盘访问的链接，进入 `/settings#agents`，滚动并聚焦现有 Agent 管理区；复用原管理页面。

验证：浏览器 fixture 使用真实 Dashboard、AppProvider 与 Settings；修改前回归失败，修改后点击、Tab/Enter、焦点及仅计已安装且启用的 Agent 均通过。前端构建/lint/test 通过。

## Review

- Standards：使用原生链接与独立 useSectionAnchor，无重复 Agent 管理界面，保持既有语义色。
- Spec：点击有响应并直接定位管理区，零安装数量时入口仍可用。
