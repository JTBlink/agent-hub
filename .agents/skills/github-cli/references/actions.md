# GitHub Actions 规范

## 触发与职责

- 发布用 `push.tags: ["v*"]`，候选构建和诊断用 `workflow_dispatch`。当前 `ci.yml` 仅手动触发；tag 的完整质量门禁在 `build-installers.yml` 中，避免重复执行。普通分支 push / PR 不自动运行，不在仅提交 push 后声称 CI 已执行。
- 修改触发策略时同步当前 CI/CD 文档、相关 workflow 合约测试及 changelog，不为普通重构擅自扩大发布权限或增加自动部署。
- GitHub 是 CI/CD 与 Release 产物平台；需求与状态由仓库 `.scratch/` 管理。

## 不可变输入与依赖

- preflight 检出事件的 `github.sha`，并将其作为不可变提交输出；后续检查、矩阵、汇总和 Release 全部检出同一 SHA，不能各自读取变化中的分支 HEAD。
- 版本校验在构建前执行，tag 与 `VERSION` 及所有配置一致。质量门禁通过后才构建，全部平台成功后才汇总与发布。
- tag preflight 必须读取同一 SHA 的成功手动三平台候选，并检查各平台测试 / smoke 与汇总校验；仅 preflight 获得 `actions: read`，候选自身不执行此检查。
- 前端使用 Node.js 22 和 `npm ci`，Rust stable 配套 rustfmt、Clippy；依赖锁文件必须提交。缓存按平台、工具链与锁文件划分，不以缓存命中代替检查。
- 工作流 job 设置合理 timeout；矩阵按原生 Runner 构建。安装包 concurrency group 包含事件和 commit SHA，`cancel-in-progress: false` 保留正常运行的候选与正式发布；main 上的新修复可以独立验证，同 SHA 优先复用已有运行。
- 各平台 core tests 在安装包 release 编译前执行。Rust 缓存只由默认分支写入，保留默认容量，不启用收费 Runner 或扩大存储额度；依据见 [资源控制](release-prevention.md)。
- 经项目包装构建入口准备 CLI sidecar，不能直接调用工具跳过约定。核心检查保持格式、lint、测试、类型与前端构建，契约和任务检查按维护的指南同步。

## 权限、密钥与输入

- 默认 `contents: read`；只有发布任务赋予 `contents: write`。主页部署按需使用 `pages: write` 与 `id-token: write`，不给所有 job 写权限。
- 生产签名 Secrets 只用于受控 tag push，手动候选不读取；签名开关开启时预检完整凭据，缺失即失败。fork 和不可信 PR 不能进入有发布密钥的上下文。
- 用户、分支、tag 等上下文数据通过环境变量或结构化参数传入，避免直接拼接到 shell 代码；路径和 ref 校验与引用不能省略。令牌、密码、设备码和个人信息不进入日志、产物或缓存。
- Actions 版本沿用仓库约定；升级时核对官方兼容说明、权限变化和合约测试，不因顺带整理无依据地升级整条流水线。

## 产物与发布

- 上传不存在的产物必须失败；安装包按平台独立收集，汇总任务在校验后发布。文件名冲突、重复格式、遗漏校验和、越界路径与符号链接由发布校验拒绝。
- `SHA256SUMS` 覆盖安装包和说明元数据，最终安装包扁平化；Release 名称、tag、目标 SHA 与版本一致。
- 产物格式、上传匹配、平台矩阵、说明文档、assemble / verify 脚本及测试必须一同更新。不能文档宣称 `.msi`、工作流却只生成 `.exe`。
- 明确 artifacts 保留期；当前平台 artifacts 为 1 天。汇总执行 assemble / verify，但当前 workflow 没有上传汇总 artifact；手动构建仅能下载平台 artifacts，不创建正式 Release。若增加汇总候选上传，需同时设置保留期并覆盖合约测试，不能把计划写成已实现。
- 已存在 Release 不自动覆盖。失败重试不移动 tag，不跳过质量门禁或包内 smoke，不将未验证的其他 SHA 产物混入旧版本。

## 修改后验证

运行与修改相关的 `scripts/workflow-contract.test.mjs`、构建、版本、assemble 和 verify 测试，检查 YAML、`needs`、表达式、shell 与权限范围。仅文字调整可检查引用及文档一致性；实际 workflow 行为变化需要合约测试，原生安装与签名仍依赖对应平台证据。
