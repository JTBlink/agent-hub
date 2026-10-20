Type: task
Status: resolved
Blocked by: none

# 完成多 Git 仓库 Skill 卡片安装页

## Comments

- 用户确认采用顶部仓库切换、下方 Skill 卡片网格，随后补充本地 Git 仓库和克隆缓存清理要求。
- 沿用项目 rust-dev、ui-ux-pro-max 与现有品牌 token、榜单密度、确认框和多选工具栏。
- 将 Git 状态和交互从历史大页面拆出；目录 DTO 和本地仓库读取放入 core，新增 command 保持薄适配。
- 本机设置 `git_install_repositories_v1` 保存来源、目录元数据和最后选择，默认空列表，无数据库 schema 变更。目录缓存不持有安装临时路径，不存储 URL 中的密码或令牌；远程认证仍使用现有 Git 凭据链。
- 清理复用克隆缓存槽路径和 fs2 文件锁，完整与稀疏槽都取得锁后才删除，保留锁文件以避免 inode 竞争；本地仓库无清理入口。

## Result

- [GitImportPanel](../../../src/components/GitImportPanel.tsx) 提供仓库切换、添加远程/本地来源、重命名、移除和清理克隆缓存；安装页页签、仓库栏及卡片统一使用通用 Git 分支图标。
- [卡片列表](../../../src/components/GitRepositorySkills.tsx) 与 [卡片](../../../src/components/GitSkillCard.tsx) 实现响应式网格、名称/描述/路径搜索、安装筛选、详情、单项与批量导入及名称调整；复用现有多选工具栏和确认框。
- [仓库 hook](../../../src/hooks/useGitRepositories.ts) 独立管理目录缓存、串行设置保存、请求归属、失败重试和临时目录释放；安装重新获取快照，并按仓库路径匹配当前确认键。失败后也刷新技能库状态，以显示批量导入中已成功的内容。
- [目录 core](../../../src-tauri/src/core/git_catalog.rs) 提供准确的仓库相对路径与本地工作区读取；本地安装复用现有本地来源导入，校验仓库根目录与路径边界。本地根目录规范化后保存，不写入示例或提交文档。
- [缓存清理](../../../src-tauri/src/core/git_fetcher/cache_cleanup.rs) 只删除生成的完整/稀疏缓存槽；覆盖缓存使用中、重复清理及链接目标保护，锁文件保留。
- 新增前端 23 项测试全部通过；`npm test` 全量 88 个文件、489 项通过。`npm run lint`、`npm run build`、相关文件 Prettier 和 `git diff --check` 通过。构建保留既有 Browserslist 数据过期及大 chunk 提示。
- Rust 全量库测试 711 项、CLI 测试 8 项通过，8 项测试按既有设置忽略；格式检查及严格 Clippy 通过。本地目录读取与缓存清理新增 7 项行为测试。
- 使用本地浏览器样例检查深色宽屏三列、浅色 375px 单列及 120% 缩放；无横向溢出，详情弹窗可见且焦点进入关闭按钮。修正浅色安装状态文字对比度。预览使用保留域名和示例内容，临时页面与自建标签页已清理。
- Standards：复用现有 scanner、metadata、path guard、安装器、缓存路径和文件锁；未增加依赖或数据库 migration，未改动远程认证链。Spec：覆盖用户确认的仓库切换、卡片样式、本地来源、克隆缓存清理及图标替换，已更新三语文案、帮助与 CHANGELOG。
- 未连接真实私有远程仓库，未执行 Windows/Linux 原生 GUI 验收，未提交、打包或发布。
