# 工程脚本目录

按功能模块存放实现与相邻的 `*.test.mjs`。优先使用根目录 `package.json` 提供的 npm 命令；已有命令名称与 `agent-hub.sh` / `agent-hub.bat` 保持一致。

| 模块                     | 职责                                     | 主要入口                                                                                                                   |
| ------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [app/](app/)             | 桌面与 CLI 构建、开发运行、构建缓存清理  | `build.mjs`、`primary-app.mjs`、`run-rust-cli.mjs`、`build-cache.mjs`                                                      |
| [release/](release/)     | 版本同步、发布候选、安装包汇总与校验     | `check-version.mjs`、`set-version.mjs`、`check-release-candidate.mjs`、`assemble-release.mjs`、`verify-release-bundle.mjs` |
| [website/](website/)     | 主页构建、Pages 发布源检查、合成数据截图 | `build-homepage.mjs`、`check-pages-config.mjs`、`capture-product-screenshots.mjs`                                          |
| [docs/](docs/)           | 离线帮助与文档站内容、链接、开发服务插件 | `build-help.mjs`、`vite-plugin.mjs`                                                                                        |
| [prototype/](prototype/) | 需求原型目录、按名称打开、服务身份校验   | `preview.sh`、`catalog.mjs`                                                                                                |
| [github/](github/)       | GitHub Issue 标签、里程碑和发布归属同步  | `issue-metadata.mjs`                                                                                                       |
| [checks/](checks/)       | 工作流、应用权限等跨模块契约测试         | `workflow-contract.test.mjs`、`opener-permissions.test.mjs`                                                                |
| [fonts/](fonts/)         | 手工维护字体产物的开发辅助脚本           | 见目录说明；不加入应用运行或常规构建依赖                                                                                   |

共享的仓库路径放在 [shared/](shared/)，命令入口从脚本位置解析项目，避免依赖调用方当前目录。产物目录参数仍按调用方指定位置解析。

## 常用命令

从项目根目录运行：

```sh
npm run app:dev                      # 桌面与前端开发
npm run build                        # 前端类型检查与构建
npm run cli -- --help                # CLI 帮助
npm run version:check                # 检查统一版本
npm run version:set -- <version>     # 设置并同步版本
npm run homepage:build               # 构建官网
npm run docs:dev                     # 预览文档站
./prototype.sh                      # 打开需求原型目录
./scripts/prototype/preview.sh --list
./prototype.sh preview --layout B    # 直达文档阅读原型
```

根目录 `prototype.sh` 和 `scripts/prototype.sh` 为兼容快捷入口，统一转发给 `prototype/preview.sh`。原型清单来自 `prototypes/catalog.json`，详细用法见[原型目录](../prototypes/README.md)。

## 构建与缓存

完整操作见[编译、打包与安装](../docs/build-and-install.md)。`app/primary-app.mjs` 为桌面开发与打包准备 CLI sidecar；`app/run-rust-cli.mjs` 管理 CLI 构建、运行与安装；`app/build-cache.mjs` 复用项目 target 并清理历史产物。

构建、安装、测试成功后的缓存清理仍由公共入口调用。失败或被信号中断时保留产物；支持 `CARGO_TARGET_DIR`。手动检查清理范围：

```sh
npm run app:prune -- --dry-run
```

发布流程由 `release/` 与 GitHub 工作流共同维护；目录调整不会触发发布或修改版本。

## 测试与新增脚本

运行 `npm test`，或指定模块，例如 `npx vitest run scripts/app scripts/release scripts/checks`。实现和单元测试放在同一功能目录，跨模块工程契约集中到 `checks/`。

新增脚本先选择已有模块，补充本索引中的职责或入口；涉及调用路径时同步 npm 命令、顶层启动器、工作流、自动化和文档。源归档清单保持其历史路径，不作运行入口维护。
