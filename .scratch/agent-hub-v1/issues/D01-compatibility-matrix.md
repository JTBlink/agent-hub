# D01：确认 Agent 与 Skill 兼容矩阵

Type: research
Status: resolved
Blocked by: none

## 目标

依据 Claude Code、Codex、OpenCode 和 Skills 生态的官方资料，确认 V1 实际支持的配置文件、全局/工作空间路径、格式、Skill 安装目录和版本差异。

## 验收标准

- 产出带来源链接和核验日期的兼容矩阵。
- 区分稳定公开约定、版本相关约定和暂不支持能力。
- 覆盖 macOS、Windows、Linux 的路径差异。
- 明确 Marketplace、skills.sh、`anthropics/skills`、`mattpocock/skills`、`obra/superpowers`、`affaan-m/ECC` 的发现方式。
- 更新 `docs/integrations/`，不凭推测写死路径。

## Comments

- 已启动官方资料调研，结果写入 `docs/research/agent-compatibility.md`。

## Result

- 已根据官方资料完成 Claude Code、Codex、OpenCode、skills.sh、Claude Marketplace 和 Agent Skills 规范的兼容性矩阵。
- 已记录 macOS、Windows、Linux 的路径差异、配置优先级、安全边界及版本相关约定。
- 集成文档已链接研究矩阵，并明确 skills.sh 与 Claude Marketplace 的职责边界。
- 验证日期：2026-08-22。
