# 普通 Git 仓库地址解析修复

Git 安装入口接受公共或私有 Git 仓库，不能将完整 SSH URL 当作 GitHub 简写。

## 验收条件

- `ssh://git@git.example.invalid:11022/team/skills.git` 保留主机、自定义端口、路径及后缀。
- SSH URL 的嵌套路径、不带 `.git` 后缀及包含 `tree` 的普通路径保持原样，不解释为 GitHub 分支链接。
- HTTPS、HTTP、SCP 风格 SSH 地址和现有 GitHub 简写、分支链接保持兼容。
- 桌面预览、安装和 CLI 继续复用同一个 core 解析入口，不改动认证与 URL 安全校验。

任务：[B01](issues/B01-ssh-url.md)。
