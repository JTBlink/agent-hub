# 应用组装边界

AgentHub 保留一套主体源码、依赖、版本和构建流程。当前仍是单个公开应用；本次整理只建立共享启动与页面组合边界，不创建增强版工程。

## Rust 桌面宿主

`src-tauri/src/lib.rs` 导出共享 `builder()` 和 `run(context)`。`main.rs` 处理 CLI smoke 分支，并通过 `tauri::generate_context!()` 提供当前宿主的配置、权限与前端资源。

桌面实现按职责组织在 `src-tauri/src/desktop/`：

- `mod.rs`：组装共享状态、Tauri 插件、初始化回调与 IPC handler。
- `startup.rs`：初始化日志、后台服务、托盘和主窗口关闭处理。
- `ipc.rs`：集中注册内置命令，保留 `commands::ipc::main_only` 的调用 WebView 校验。
- `lifecycle.rs`：恢复主窗口、退出、重启及资源回收。
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

`builder()` 会初始化应用数据库，应该在每次桌面启动时调用一次。宿主仍需提供名为 `main` 的可信应用 WebView，沿用当前窗口与数据生命周期约定。

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
