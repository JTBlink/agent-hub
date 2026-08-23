# B09：支持远程 Git 与本地仓库 Skill 来源

Type: task
Status: claimed
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

## 当前状态

`claimed`。来源 adapter、安全 fetch、授权 service 与 `browse_skill_source` command 已完成；尚需接入 Skills 页面并补充用户可见的来源状态。

## Result

- 支持四个预置仓库、自定义 HTTP(S)/SSH Git URL、ref、子目录及显式授权的本地 Git/普通目录。
- Git clone 使用 AgentHub 控制的临时目录、隔离的 system/global Git 配置、空 hooks、禁用交互和 submodule；成功后原子移动，失败清理半成品。
- 来源快照保留 URL、requested ref、resolved commit、Skill 相对路径；安装计划记录完整文件清单并执行复制而非 symlink。
- 自动化覆盖无效 URL/ref/子目录、连接失败、未知 ref、安全清理及仓库 hook 不执行。
