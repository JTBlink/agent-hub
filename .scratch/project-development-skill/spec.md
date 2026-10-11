# AgentHub 项目开发规范 Skill

将项目规范原文迁移到仓库 `.agents/skills/`，通过 Git 共享，区别于产品内置 `skills/` 与用户全局技能目录。`rust-dev` 维护开发、SOLID、模块边界、UI、图标、提交、任务、领域文档与凭据规范；`github-cli` 独立维护版本、自动 tag、GitHub Actions、平台支持与发布验收。

验收要求：两个 skill 均有合法 frontmatter 与界面元数据，按任务加载规范；移除旧规范副本，修正所有仓库链接及发布脚本和测试的路径；以现行工作流校正格式与 artifact 保留期。`AGENTS.md` 提供入口；验证结构、链接、隐私、发布测试与格式。用户已授权完成后提交并推送，不实际发版或创建 tag。

GitHub skill 最终命名为 `github-cli`，优先通过 `gh` 完成 Actions 故障定位、修复与新 SHA 验证。处理用户提供的 v0.1.4 失败运行：修复格式门禁，执行其后尚未运行的关联检查，提交推送后验证新提交，保留既有发布 tag。
