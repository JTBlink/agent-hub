Type: task
Status: resolved
Blocked by: none

# 保持 0.1.4 并处理发布失败

## Scope

用户明确要求先解决 0.1.4 发布问题，再考虑升级。所有版本配置保持 0.1.4，不将尚未完成的其他功能混入候选，不跳过三平台质量、安装 smoke 和产物校验。

## Acceptance

- VERSION 与前端、Rust、Tauri 和锁文件保持 0.1.4。
- 明确实际失败 SHA 和首个失败点，避免重跑不包含修复的旧源码。
- 已运行的候选继续跟踪，不重复触发或取消正常构建。
- 只有同一 SHA 的质量、Windows/macOS/Linux 测试、安装包 smoke 和汇总校验通过，才认为候选可发布。
- 版本 tag、发布源码与产物一致；没有正式 Release 及完整附件时不能报告发布成功。

## Comments

- 诊断开始时，`npm run version:check -- v0.1.4` 通过，先前 0.1.5 准备修改已恢复。旧远端 `v0.1.4` 指向 `5e6a7d9f4e656a4e909ca7ade334780021950b8b`，当时尚无该版本 Release。
- [tag 发布失败](https://github.com/JTBlink/agent-hub/actions/runs/38214566746) 在候选前置检查失败，缺少同 SHA 的成功三平台候选。
- [旧候选](https://github.com/JTBlink/agent-hub/actions/runs/38214635255) 的 Windows 测试实际失败：项目路径拼接产生 InvalidFilename，以及 Git checkout 的 CRLF/LF 文本比较差异。两处已在 `3944415` 修正；该候选随后被取消，旧 SHA 不能通过盲目重跑得到修复。
- [3944415 候选](https://github.com/JTBlink/agent-hub/actions/runs/38217104466) 因卡片状态文案与测试快照不同失败，`b747bcb` 已完成修订及回归。
- [首轮候选](https://github.com/JTBlink/agent-hub/actions/runs/38219181451) 固定 SHA `78a6ea3daf4d17a8ccc49a1b64df3683f6687906`，版本仍为 0.1.4。质量检查和 Linux 平台通过，但 Windows 继续失败。工作区其他未提交功能保持独立。
- 首轮候选在 `installing_existing_project_content_keeps_the_team_version` 读取已安装文件时报 InvalidFilename。此前只修改读取路径不足以修复；项目链接生成仍用 `../../.agents/skills/...` 字符串作为 OS 链接目标。
- 修复从链接生成处入手：目录上行及中央路径均逐组件构造原生 PathBuf，管理清单继续使用可移植路径。新增四个 Agent 的实际文件读取、链接目标原生分隔符和刷新后可读性回归，原生三平台已验证通过。

## Result

- 修复提交 `d3fdd36` 已推送 main；项目回归 47 项、Rust 格式、严格 Clippy、相关 Prettier 与 diff 检查通过。保持版本 0.1.4，未升级到 0.1.5。
- 独立修复候选 [38221982869](https://github.com/JTBlink/agent-hub/actions/runs/38221982869) 在 `285cb07623a02efb4aa1756321689fa83322fbb6` 完整通过；主分支随后增加测试路径及格式修正，[最终候选 38224643239](https://github.com/JTBlink/agent-hub/actions/runs/38224643239) 在 `fabbced4523b6a86856a51abc99af295a92fe5b6` 完整通过。
- 在该 SHA 的干净临时检出执行 `npm run release:ready -- v0.1.4` 通过。重新检查时，旧的失败 tag 已由同工作区其他发布工作删除，本地与远端均无同名 tag；因此正常创建并推送 annotated `v0.1.4`，未执行强推。最终远端 tag 解引用到 `fabbced4523b6a86856a51abc99af295a92fe5b6`。
- [正式发布 38228821853](https://github.com/JTBlink/agent-hub/actions/runs/38228821853) 六个 job 全部成功：质量门禁、Windows/macOS/Linux 核心测试、安装包与包内 CLI、三平台安装启动 smoke、汇总及校验。正式 [AgentHub v0.1.4](https://github.com/JTBlink/agent-hub/releases/tag/v0.1.4) 已发布，非 draft、非 prerelease。
- Release 附件完整：Windows x86_64 NSIS `.exe`、macOS Universal `.dmg`、Linux x86_64 `.AppImage`/`.deb`，以及 `CHANGELOG.md`、`PLATFORM_SUPPORT.md`、`RELEASE_NOTES.md`、`SHA256SUMS`，共 8 个。下载正式附件后执行 `npm run release:verify`，4 个安装包和 7 个校验文件全部通过。
- Windows 代码签名与 Apple 签名/公证未启用；本次发布的是未配置正式签名的安装包，不宣称已签名或公证。已验证三平台 CI 安装启动，未额外在用户实际设备进行人工操作验收。
- Standards：从真实链接生成边界修复平台路径，复用原有目录校验与事务，保护项目内容和来源；候选与正式发布使用同一不可变 SHA，不跳过门禁、不混入未提交工作。Spec：先完成 0.1.4 发布恢复，保留版本，不用升级掩盖失败。
