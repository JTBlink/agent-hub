# 应用组装边界

AgentHub 保留一套主体源码、依赖、版本和构建流程。标准版、个人版与 Agent Flow 定制版通过产品配置选择编译能力，保持一套公共实现；不引入动态扩展宿主。

## Rust 桌面宿主

`src-tauri/src/lib.rs` 导出共享 `builder()` 和 `run(context)`。`main.rs` 处理 CLI smoke 分支，并通过 `tauri::generate_context!()` 提供当前宿主的配置、权限与前端资源。

桌面实现按职责组织在 `src-tauri/src/desktop/`：

- `mod.rs`：组装共享状态、Tauri 插件、初始化回调与 IPC handler。
- `startup.rs`：初始化日志、后台服务、托盘和主窗口关闭处理。
- `ipc.rs`：集中注册内置命令，保留 `commands::ipc::main_only` 的调用 WebView 校验。
- `lifecycle.rs`：恢复主窗口、退出、重启及资源回收。
- `workspaces.rs`：创建／聚焦完整工作区窗口、登记可信 WebView、协调各窗口退出与资源回收。
- `tray/`：托盘菜单、操作、刷新调度、文案与相邻测试。

标准入口调用：

```rust
app_lib::run(tauri::generate_context!());
```

后续宿主可在相同 Builder 上添加编译时集成的 Tauri 插件：

```rust
app_lib::builder()?
    .plugin(extension_plugin)
    .run(tauri::generate_context!())?;
```

`builder()` 会初始化应用数据库，应该在每次桌面启动时调用一次。宿主仍需提供名为 `main` 的可信应用 WebView；额外工作区窗口由后端按主窗口配置创建，加载同一前端入口与项目路由。内置命令兼容保留 `main_only` 名称，实际校验主 WebView 或后端登记的工作区身份，预览 WebView 始终排除。详见 [ADR-0021](../adr/0021-multi-workspace-windows.md)。

扩展的命令和初始化通过插件注册，不再次调用宿主 Builder 的 `setup` 或 `invoke_handler`：这些方法会替换共享回调，导致公共初始化或内置命令丢失。插件还必须自行约束命令调用者并配置所需权限，不能假定内置命令的 `main_only` 自动保护插件命令；预览网页不能获得应用权限。

`run()` 改为显式接收 `tauri::Context<tauri::Wry>`。这样桌面配置与资源在可执行入口生成，共享库不再嵌入标准入口的 Context；CLI 继续直接复用 `core/`。

## 前端组合

`src/App.tsx` 保留共享 Provider、Router、关闭保护、恢复对话框与通知。`src/app/routeDefinitions.tsx` 定义公共页面，`AppRoutes.tsx` 渲染路由。

宿主可以传入 `extensionRoutes`，让额外页面在同一个 Layout 和 Provider 下渲染：

```tsx
<App extensionRoutes={[{ path: "/extra", element: <ExtraPage /> }]} />
```

扩展页面使用不与公共路由冲突的路径；页面参数只增加路由，不自动增加侧栏菜单、IPC 权限或后端能力。

## 尚未拆分的部分

当前前端仍通过本仓库的 Vite 工程构建，尚未发布为独立 UI 包，也没有新增私有仓库依赖或第二套打包配置。后续有具体扩展时，再确定 UI 包导出、菜单注册、资源构建及品牌／更新渠道配置。Rust Cargo 依赖本身不会完成前端复用与打包。

不预建动态库加载器、通用扩展 trait 或第二套业务实现。拆分按实际私有功能发生，通用业务、存储和 UI 保持单一实现。

## 产品编译时组装

产品清单位于 `products/`：`standard.json` 保留默认完整功能，`personal.json` 默认排除可选集成，`agent-flow.json` 定义面向企业 AI Native 研发编排的 Agent Flow 定制版，初始启用云端同步、GitLab 与 Herdr，代码平台只支持 GitLab，不编译或展示 GitHub 集成。产品可通过 `productName` 配置安装包名称与窗口标题；该名称不改变稳定产品 ID 或数据路径。脚本缺省选择标准版；产品类型与 Rust 构建 profile 独立，功能依赖通过 Cargo features 解析。可选能力及产品选择统一在 `products/features.json` 管理，覆盖 Herdr、云端同步、GitHub 与 GitLab；产品清单只保留身份与界面排列。

`./agent-hub.sh build --product personal --debug --bundles app` 经共享 Node 入口解析产品，向前端、桌面和配套 CLI 传递相同配置摘要与实际特性集合。`src-tauri/src/product/` 保存编译期身份；`build-info` CLI 与 `get_build_info` IPC 只读返回该身份，前端在应用 Provider 初始化前核验，拒绝混用资源。

前端 `@app/product` 指向产品配置，`@app/herdr` 根据选定特性指向功能实现或不注册监听和 IPC 的缺省适配。公共线协议和历史布局解析位于 `src/integrations/herdr/`，不依赖可选实现。`src/features/herdr/module.ts` 声明侧栏贡献，工作台负责排列、选择和布局；Herdr 面板在实际使用时加载。

产品构建的 TypeScript 根入口与 Vite 导入图仅覆盖启用功能；Vite 输出 `product-build.json` 记录实际模块，并拒绝个人版包含 Herdr 实现。全源码质量检查另行运行，不能把全源码类型检查与产品编译混为一谈。

构建工具集中于 `scripts/app/product/`。标准 Cargo 输出保留 `src-tauri/target/`；独立产品使用同级 `src-tauri/target-products/`，前端、sidecar 和类型检查结果按产品与配置摘要隔离在忽略目录。标准版清理不遍历个人版目录。详细命令与运行路径见[编译与安装](../build-and-install.md)。

个人版具有不同的应用 identifier、开发端口、应用数据、平台任务标识和 CLI bridge。标准版继续使用原数据；产品 ID 在同一产品特性集合变化时保持稳定。共享项目文件、原生 Agent 登录及系统 Hosts 属于用户选择或系统拥有的资源，不能把版本目录隔离描述为这些资源被复制。个人版未配置专属更新通道时不查询标准版更新源。

新增功能与产品配置的操作步骤见[产品配置与独立功能开发](../product-development.md)。

GitHub 与 GitLab 的后端实现分别位于 `core/platforms/github/` 与 `core/platforms/gitlab/`，任务领域只保留共享模型、验证与有界结果解析。GitHub 的凭据、备份 HTTP 接口、更新源与引导连接归 GitHub 模块，通用 Git 备份命令不依赖它。平台类型保留用于兼容已有绑定，实际查询在平台不可用时先拒绝，不执行外部 CLI；列表不展示不可用绑定，原始数据不删除。

平台账号服务位于 `core/platforms/accounts.rs`，CLI 进程调用由 `core/platforms/cli.rs` 与仓库任务共用；GitHub／GitLab 在各自 `accounts.rs` 定义登录、查询、切换命令和安全字段解析。GitHub 使用 CLI 原生已保存账号切换；GitLab 每个主机独立保存登录，同一主机更换身份通过重新登录完成。Token 仅通过标准输入交给 CLI，应用不持久化凭据、不返回原始登录诊断。`platform_account_hosts_v1` 仅保存已验证站点的主机与来源元数据，默认空，最多 64 项；账号弹窗可移除站点记录，不执行 CLI 登出。

前端 `components/accounts/PlatformAccountButton` 与 `usePlatformAccountSummary` 提供可复用账号入口，通过 `PlatformAccountsProvider` 与弹窗共用来源身份状态，独立于任务查询汇总已认证的当前身份，按平台、主机和账号去重，最多并行读取两个来源；筛选平台只改变显示，手动刷新或登录变更才重新读取，关闭页面时取消旧请求。入口复用统一仓库平台图标，完整账号与主机保留在提示中。站点选择按已登录、待检查、不可用、未登录排序，使用主机、账号与项目名区分来源；选择不随异步排序变化。添加账号默认走 CLI Auth 流程，Token 为可选方式。平台模块可解析设备授权提示，终端只向授权组件提供合并软换行后的可见文本；验证码只在当前授权界面内存中保留。账号弹窗关闭依赖显式操作，授权与身份验证期间禁止关闭，并在窗口恢复时修复原生 dialog 的显示状态。已验证的写入结果直接更新共享身份快照，并覆盖早先的读取结果；任务仓库刷新在后台执行，不阻塞账号切换。

前端 `components/accounts/` 提供独立账号弹窗，与仓库连接编辑器分离；通过平台注册表接入各自模块的能力，不直接导入平台实现。即使没有项目也可使用默认 CLI 登录；已配置的项目专用入口保留启动器和工作目录。站点发现复用 `core/platforms/hosts.rs` 的 CLI 主机缓存，兼容旧版 glab 的多站点文本状态；账号详情只查询当前平台与站点，切换或关闭时取消旧读取并忽略迟到响应。交互式登录复用 `TerminalPane` 与后端 `TerminalManager` 的生命周期、输入、背压和主题；Token 登录与账号切换完成后重新核对 API 身份，任务侧清理身份缓存后重新查询。

云端同步通过 `cloud-sync` 控制命令注册、备份核心、后台启动与退出动作。共享本地修改通过窄范围的 `cloud_sync` 通知／恢复接口对接，关闭时无备份 I/O。前端静态入口通过能力清单选择实现或无副作用缺省模块；产物模块清单拒绝包含被排除的能力。构建脚本从同一能力清单生成编译能力信息，桌面与 CLI 不再手工维护另一份能力枚举。

## 实验性功能与 AI Native 原型边界

当前产品能力由编译时清单管理，`FeatureModule` 支持面板贡献与可选路由，尚无通用运行时实验开关契约。现有命令面板也尚未接入 `agent-hub://flags`。不能把产品包含某能力、面板的 `active` 状态和实验开关视为同一层。

[AI Native 原型](../prototypes/ai-native/README.md)独立放在 `docs/prototypes/ai-native/`，未接入正式路由、侧栏、IPC、CLI 或后台生命周期。原型演示默认关闭、手动开启后显示独立侧栏，并可按场景编辑 Skill 与脚本流程；其状态仅在内存中，未形成生产执行能力。

后续设计要求产品编译能力与本机实验开关共同决定模块可用性；`agent-hub://flags` 只负责应用内导航，开启开关不自动启动任务，也不恢复被产品裁剪的模块。公共壳管理导航与可用性，AI Native 模块负责业务流程，现有 Agent 启动和平台模块继续提供共享能力。详细的地址规则、模块职责、脚本化契约、执行恢复与验收边界集中在[AI Native 场景流程编排](../plans/agent-hub.md#ai-native-场景流程编排)，未实现内容不列入当前产品能力清单。
