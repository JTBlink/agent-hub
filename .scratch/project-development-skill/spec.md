# AgentHub 项目开发规范 Skill

将项目规范原文迁移到仓库 `.agents/skills/`，通过 Git 共享，区别于产品内置 `skills/` 与用户全局技能目录。`rust-dev` 维护开发、SOLID、模块边界、UI、图标、提交、任务、领域文档与凭据规范；`github-cli` 独立维护版本、自动 tag、GitHub Actions、平台支持与发布验收。

验收要求：两个 skill 均有合法 frontmatter 与界面元数据，按任务加载规范；移除旧规范副本，修正所有仓库链接及发布脚本和测试的路径；以现行工作流校正格式与 artifact 保留期。`AGENTS.md` 提供入口；验证结构、链接、隐私、发布测试与格式。用户已授权完成后提交并推送，不实际发版或创建 tag。

GitHub skill 最终命名为 `github-cli`，优先通过 `gh` 完成 Actions 故障定位、修复与新 SHA 验证。处理用户提供的 v0.1.4 失败运行：修复格式门禁，执行其后尚未运行的关联检查，提交推送后验证新提交，保留既有发布 tag。

后续发布须先验证干净提交及同一 SHA 的三平台安装包候选，通过只读 `release:ready` 后再打 tag；tag 工作流也验证候选证据。将平台测试提前，隔离手动与 tag 的并发组，保持标准免费 Runner 和短期 artifacts，仅默认分支写入 Rust 缓存。github-cli 1.2.0 同步相关流程与重跑约定。用户授权及时提交、push，并跟踪 v0.1.4 当前安装包运行。

用户最新要求：先完成 0.1.4 发布修复，不升级至 0.1.5。固定候选 SHA、保留三平台检查，并确认版本 tag 与产物源码一致；任务：[D06](issues/D06-recover-v014-release.md)。

发布完成后审查并优化 github-cli：保留用户指定版本，处理既有 tag 冲突；共享工作区用不可变 SHA 和明确 run ID 关联证据，复用同 SHA 已有检查，区分已失败 job 与仍运行的 workflow，并说明 release:ready 的实际边界。只更新技能规范、界面元数据和项目记录；应用仍为 0.1.4，不触发新发布。任务：[D07](issues/D07-github-cli-workflow-review.md)。

用户要求发布不创建分支，分支改动及时 rebase 并快进合入 main，保持单线历史。github-cli 1.4.0 统一 main、固定 SHA、候选与 tag 的发布约定；隔离检查使用 detached worktree，完成后安全清理临时分支。main 前进时重新核实发布范围和候选 SHA，同 ref 候选串行触发以免取消正常构建。本次只更新规范与检查提示，保留其他任务的应用版本改动，不触发发版。任务：[D08](issues/D08-linear-main-release.md)。

用户要求更新 Skill，使正式发布时自动根据远端 tag 决定是否升级版本，再连续完成提交 push、同 SHA 候选、tag 和 Release 验收。github-cli 1.5.0 默认 patch，已准备的更高未打 tag 版本直接沿用；指定版本和失败续发保持原版本。先提交 push 技能更新，再按新规则发布已提交 main，保留其他任务未提交改动。现有 Actions 不增加版本升级入口。任务：[D09](issues/D09-automatic-version-release.md)。

用户在 0.1.6 准备期间补充要求：正式发布自动核对上一个 tag 至发布 SHA 的实际变更，完善该版本 CHANGELOG；发布期间纳入的改动更新同一版本，不重复升级或留在 Unreleased。github-cli 1.6.0 同步版本说明、SHA 重验证与线上附件一致性规范。0.1.6 尚未打 tag，按新规范补齐说明并重新验证新 SHA。任务：[D10](issues/D10-release-changelog.md)。
