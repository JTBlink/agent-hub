# B09：支持远程 Git 与本地仓库 Skill 来源

Type: task
Status: open
Blocked by: D02, B08

## 交付

实现仓库 `SkillSource` adapter，支持预置仓库、用户输入的 Git URL/ref/子目录，以及用户选择的本地仓库目录。

## 验收标准

- 预置 `anthropics/skills`、`mattpocock/skills`、`obra/superpowers`、`affaan-m/ECC`。
- 支持浏览自定义公开 Git 仓库内符合规范的 Skills。
- 支持只读扫描用户授权的本地 Git 仓库或普通目录。
- 本地安装使用复制和原子移动，不默认建立符号链接。
- 记录 URL、ref、实际 commit、相对路径和文件清单。
- 使用安全临时目录，不执行仓库脚本或 hooks。
- 无效 URL、ref、目录和网络失败有自动化测试。
