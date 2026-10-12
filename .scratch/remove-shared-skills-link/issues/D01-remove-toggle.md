# D01：移除共享技能链接开关

Type: task
Status: resolved
Blocked by: none

## Acceptance

- 设置、命令注册、bindings、核心链接操作和三语文案无残余引用。
- 保留按 Agent 部署与用户已有磁盘内容。
- 更新产品文档、领域上下文、ADR、当前规格和 CHANGELOG。
- 执行前端测试、lint、build、Rust 测试、格式和严格 Clippy；区分本次改动检查与工作区已有问题。

## Result

- 移除设置开关、状态读取及操作回调，删除三语共享链接文案并更新技能目录提示。
- 清理 Tauri command、注册、bindings 和 core 链接创建/删除函数；源码中无相关接口残余引用。
- 保留适配器目录规则、逐技能部署及源目录保护。未操作真实用户目录；旧共享链接和数据库设置保留，旧设置不再生效。
- 更新 CONTEXT、ADR-0009、产品文档、当前集成规格与 Unreleased 记录；历史任务和版本记录保留。

验证：前端 154 项测试与生产构建通过；Rust 629 项库测试及 7 项 CLI 测试通过，8 项忽略；严格 Clippy 通过。本次修改的前端文件 ESLint、Rust 文件 rustfmt（不递归检查子模块）、Prettier、git diff --check 和新增行路径隐私检查通过。

全工作区 ESLint 未通过：未修改的 SkillFileBrowser.tsx 有 set-state-in-effect 错误，MySkills.tsx 有 effect 依赖警告。全工作区 cargo fmt 检查未通过：未修改的 commands/skills.rs 有一处格式差异。未启动桌面应用进行主题、缩放和键盘实测。

## Review

- Standards：同步清理跨端契约，复用现有适配器和部署流程，无额外部署抽象；未改动同工作区其他任务文件或用户磁盘配置。
- Spec：入口与整库链接操作移除；技能库收藏与按 Agent 部署职责明确。已有链接仍可公开全部技能的升级边界已写入文档。
