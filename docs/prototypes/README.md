# 需求原型目录

直接打开 [index.html](index.html) 查看原型目录。首次预览具体原型前，在项目根目录运行 `npm ci` 和 `./prototype.sh`，生成并打开本地 HTML。

```sh
./prototype.sh                     # 生成全部原型并打开本地目录索引
./prototype.sh --list              # 列出原型
./prototype.sh runners --no-open   # 生成 Runner 原型并显示文件地址
./prototype.sh herdr-sidebar       # 生成并打开 Herdr 侧栏原型
```

原型文件默认输出到 `docs/prototypes/dist/`。[Runner 原型](runners/index.html)的单文件入口位于自身目录。可以用浏览器或 AgentHub 直接打开这些 HTML。修改源码后重新运行命令更新对应文件。

目录页由 `catalog.html`、样式和 [catalog.json](catalog.json) 生成。原型名称、实现状态、当前实现说明（`implementation`）、入口及旧网址集中维护在清单中，终端和目录页按清单顺序展示。修改清单后运行 `./prototype.sh --no-open` 更新目录页。开发时需要热更新可显式传入 `--port 4176`。

| 名称              | 目录                                           | 用途                               |
| ----------------- | ---------------------------------------------- | ---------------------------------- |
| `git-folder-menu` | [git-folder-menu/](git-folder-menu/index.html) | Git 文件夹右键动作与批量范围       |
| `subagents`       | [subagents/](subagents/index.html)             | Subagent 契约库与原生入口部署      |
| `ai-native`       | [ai-native/](ai-native/README.md)              | 实验性入口与场景流程编排（单文件） |
| `preview`         | [preview/](preview/README.md)                  | 网页、HTML 与 Markdown 预览和检查  |
| `tasks-terminal`  | [tasks-terminal/](tasks-terminal/index.html)   | 任务与项目终端的历史交互方案       |
| `herdr-sidebar`   | [herdr-sidebar/](herdr-sidebar/README.md)      | Herdr 工作空间与 Agent 侧栏方案    |
| `install`         | [install/](install/index.html)                 | 发现入口、技能与自动化任务安装     |
| `hosts`           | [hosts/](hosts/index.html)                     | Hosts 列表与编辑器实现对照         |
| `agent-settings`  | [agent-settings/](agent-settings/index.html)   | Agent 多组启动方案与自定义命令     |
| `runners`         | [runners/](runners/README.md)                  | 任务侧栏、项目筛选与 Runner 管理   |

`tasks-herdr` 是任务与终端原型的旧名称，统一归入 `tasks-terminal`。历史 `/docs/prototypes/*.html` 和 `/tests/browser/preview-module-prototype.html` 网址在 Vite 开发服务中保留跳转，查询参数沿用。

原型属于需求资料。所有新增需求原型放在 `docs/prototypes/<名称>/`，提供 `index.html` 和说明，登记 catalog。复用 `src/` 中的展示组件和主题；生产代码不依赖原型。自动化验收的 fixture 与驱动继续放在 `tests/browser/`，不登记为需求原型。目录中的“已有实现”表示正式代码已接入相关功能，“仅原型”表示尚未接入正式应用；实现说明可搜索，两种状态均不代表全部交互或各平台已验收。功能变化时同步核对 catalog 中的实现说明。

每项需求只保留一个方案，不提供布局比较或 A/B/C 切换。已实现的交互按正式组件同步；未实现的 AI Native 等需求标记为“仅原型”，不能将演示视为实际接入。
