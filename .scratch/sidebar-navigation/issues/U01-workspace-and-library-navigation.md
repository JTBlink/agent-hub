Type: task
Status: resolved
Blocked by: none

## Scope

合并 Agent 分组，统一侧边栏展开交互，增加“全部技能”并接通工作台自动筛选。

## Acceptance

- 龙虾追加在编程 Agent 后，保留排序及旧路由。
- 页面导航与手动开关保持单组展开，历史返回恢复活动区域。
- 技能库标题不跳页；“全部技能”沿用现有列表及组合筛选。
- 工作台待部署、待分组进入全库对应筛选，可清除，不保留旧组选择。

## Result

- 抽取共享分组标题及 [Agent 导航](../../../src/components/SidebarAgentWorkspaces.tsx)，龙虾追加在编程 Agent 后。复用可用性与路由解析，保留原来的两类排序存储键；拖拽跨类别仍保持龙虾在末尾。
- [侧边栏展开状态](../../../src/hooks/useSidebarSections.ts) 随页面选择活动区域；手动展开另一组会关闭上一组，历史返回重新展开活动区域。
- “技能库”整行只切换展开状态，独立“全部技能”进入原有列表，清除旧技能组与未分组范围，支持现有组合筛选。
- 工作台待部署使用 `deployment=undeployed`，待分组使用 `grouping=ungrouped`，均选中“全部技能”；最近技能详情也清除旧组范围。筛选清除一次移除两个 URL 条件，切换技能组重置旧范围条件。
- 全局总览包含所有可用 Agent，旧龙虾详情与总览链接继续可用。新增中、英、繁体文案，更新根目录 CHANGELOG。

## Validation

- `npm test`：71 个测试文件、348 项测试通过。
- 最后调整最近技能入口后，相关 5 个测试文件、36 项测试再次通过。
- `npm run build`、`npm run lint`、变更文件 Prettier 检查及 `git diff --check` 通过。构建仍提示已有 Browserslist 数据和大 chunk 提醒。
- `browser-use < tests/browser/sidebar-navigation.py`：实际 Chrome 验证 Enter 展开/折叠、Tab/Enter 进入总览与全部技能，960px 英文浅色和 800px 繁体深色在 120% 缩放下无横向溢出；工作台自动未部署/未分组筛选、清除筛选、全部技能选中及非活动区域折叠通过。
- 浏览器额外检查搜索与未分组条件组合、Hermes 详情、项目导航及全局总览五类示例 Agent；测试页使用合成数据，不访问本机技能文件。测试标签页已关闭。

## Review

- Standards：共享标题、路由与可用性规则，保留已存排序及旧深链接；新增文案三语一致，示例路径使用占位符。
- Spec：龙虾末尾、单组展开、标题仅折叠、全部技能筛选与工作台自动条件均已验证。结果保留为本地修改，未创建提交或发布。

## 中文入口文案

侧边栏首页中文和繁体文案由 Dashboard 改为“工作台”，命令面板复用同一翻译键；同步浏览器回归脚本的入口定位名称。JSON 解析与翻译检查、现有侧边栏测试及 diff 空白检查通过。

## 后续提交

用户在截图更新任务中授权提交 push，已提交原暂存实现：`6044e93`。新截图同步及官网验收由 [D08](../../homepage-redesign/issues/D08-refresh-navigation-screenshots.md) 记录。
