# 需求原型目录

启动实现位于 `scripts/prototype/preview.sh`，项目根目录的 `prototype.sh` 是转发入口，两者参数一致：

```sh
./prototype.sh                       # 启动并打开目录索引
./prototype.sh --list                # 列出原型，无需启动服务
./prototype.sh preview               # 直达预览与浏览
./prototype.sh herdr-sidebar         # Herdr 侧栏
./prototype.sh --port 4180 --no-open # 指定端口，只显示地址
```

首次使用先执行 `npm ci`。新服务在当前终端运行，按 Ctrl+C 停止；同目录已有服务时复用，不会停止其他服务或自动切换 Git 分支。正式应用的预览功能随应用启动，不依赖原型服务。

浏览器索引为 `docs/prototypes/index.html`。原型名称、实现状态、当前实现说明（`implementation`）、入口及旧网址集中在 [catalog.json](catalog.json)，终端和目录页共用这一份数据，按清单顺序展示；新增需求插入列表顶部，方便优先查看最新原型。

| 名称             | 目录                                         | 用途                               |
| ---------------- | -------------------------------------------- | ---------------------------------- |
| `ai-native`      | [ai-native/](ai-native/README.md)            | 实验性入口与场景流程编排（单文件） |
| `preview`        | [preview/](preview/README.md)                | 网页、HTML 与 Markdown 预览和检查  |
| `tasks-terminal` | [tasks-terminal/](tasks-terminal/index.html) | 任务与项目终端的历史交互方案       |
| `herdr-sidebar`  | [herdr-sidebar/](herdr-sidebar/README.md)    | Herdr 工作空间与 Agent 侧栏方案    |
| `install`        | [install/](install/index.html)               | 发现入口、技能与自动化任务安装     |
| `hosts`          | [hosts/](hosts/index.html)                   | Hosts 列表与编辑器实现对照         |
| `agent-settings` | [agent-settings/](agent-settings/index.html) | 全局智能体默认启动配置             |

`tasks-herdr` 是任务与终端原型的旧名称，统一归入 `tasks-terminal`。历史 `/docs/prototypes/*.html` 和 `/tests/browser/preview-module-prototype.html` 网址在 Vite 开发服务中保留跳转，查询参数沿用。

原型属于需求资料。所有新增需求原型放在 `docs/prototypes/<名称>/`，提供 `index.html` 和说明，登记 catalog。复用 `src/` 中的展示组件和主题；生产代码不依赖原型。自动化验收的 fixture 与驱动继续放在 `tests/browser/`，不登记为需求原型。目录中的“已有实现”表示正式代码已接入相关功能，“仅原型”表示尚未接入正式应用；实现说明可搜索，两种状态均不代表全部交互或各平台已验收。功能变化时同步核对 catalog 中的实现说明。

每项需求只保留一个方案，不提供布局比较或 A/B/C 切换。已实现的交互按正式组件同步；未实现的 AI Native 等需求标记为“仅原型”，不能将演示视为实际接入。
