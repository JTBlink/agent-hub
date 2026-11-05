# 需求原型目录

启动实现位于 `scripts/prototype/preview.sh`，项目根目录的 `prototype.sh` 是转发入口，两者参数一致：

```sh
./prototype.sh                       # 启动并打开目录索引
./prototype.sh --list                # 列出原型，无需启动服务
./prototype.sh preview               # 直达预览与浏览
./prototype.sh preview --layout B    # 阅读布局
./prototype.sh herdr-sidebar         # Herdr 侧栏
./prototype.sh --port 4180 --no-open # 指定端口，只显示地址
```

首次使用先执行 `npm ci`。新服务在当前终端运行，按 Ctrl+C 停止；同目录已有服务时复用，不会停止其他服务或自动切换 Git 分支。正式应用的预览功能随应用启动，不依赖原型服务。

浏览器索引为 `docs/prototypes/index.html`。原型名称、状态、入口、布局及旧网址集中在 [catalog.json](catalog.json)，终端和目录页共用这一份数据。

| 名称             | 目录                                         | 用途                               |
| ---------------- | -------------------------------------------- | ---------------------------------- |
| `ai-native`      | [ai-native/](ai-native/README.md)            | 实验性入口与场景流程编排（单文件） |
| `preview`        | [preview/](preview/README.md)                | 网页、HTML 与 Markdown 预览和检查  |
| `tasks-terminal` | [tasks-terminal/](tasks-terminal/index.html) | 任务与项目终端的历史交互方案       |
| `herdr-sidebar`  | [herdr-sidebar/](herdr-sidebar/README.md)    | Herdr 工作空间与 Agent 侧栏方案    |
| `install`        | [install/](install/index.html)               | 安装和首次使用流程参考             |
| `hosts`          | [hosts/](hosts/index.html)                   | 三套 Hosts 设计比较原型            |
| `agent-settings` | [agent-settings/](agent-settings/index.html) | 全局智能体默认启动配置             |

`tasks-herdr` 是任务与终端原型的旧名称，统一归入 `tasks-terminal`。历史 `/docs/prototypes/*.html` 和 `/tests/browser/preview-module-prototype.html` 网址在 Vite 开发服务中保留跳转，查询参数沿用。

原型属于需求资料。所有新增需求原型放在 `docs/prototypes/<名称>/`，提供 `index.html` 和说明，登记 catalog。复用 `src/` 中的展示组件和主题；生产代码不依赖原型。自动化验收的 fixture 与驱动继续放在 `tests/browser/`，不登记为需求原型。原型状态不代表生产功能已验收。
