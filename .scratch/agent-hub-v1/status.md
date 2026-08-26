# AgentHub V1 总任务状态

> 更新时间：2026-08-26<br>
> 状态来源：本目录 `issues/*.md` 中每个任务的 `Status` 和 `Blocked by` 字段。

## 总览

| 类别                | 已完成 | 进行中 | 待开始 | 总数 |
| ------------------- | -----: | -----: | -----: | ---: |
| 决策任务（D01–D05） |      5 |      0 |      0 |    5 |
| 构建任务（B01–B15） |     15 |      0 |      0 |   15 |
| 合计                |     20 |      0 |      0 |   20 |

## 决策任务

| ID  | 主题                           | 状态       | 依赖     |
| --- | ------------------------------ | ---------- | -------- |
| D01 | Agent 与 Skill 兼容矩阵        | `resolved` | —        |
| D02 | Skill 领域模型与来源规范       | `resolved` | D01      |
| D03 | 配置写入、备份与敏感数据策略   | `resolved` | D01      |
| D04 | 配置中心与 Skills 中心交互原型 | `resolved` | D02、D03 |
| D05 | 配置作用域、优先级与冲突规则   | `resolved` | D01、D02 |

## 构建任务

| ID  | 主题                           | 状态       | 依赖                    |
| --- | ------------------------------ | ---------- | ----------------------- |
| B01 | Tauri + React 工程骨架         | `resolved` | —                       |
| B02 | SQLite 与应用状态基础          | `resolved` | B01                     |
| B03 | Claude Code 全局配置纵向切片   | `resolved` | D01、D03、B01、B02      |
| B04 | 安全编辑、Diff、备份与回滚     | `resolved` | D03、B03                |
| B05 | 工作空间配置管理               | `resolved` | D05、B04                |
| B06 | Codex 配置适配                 | `resolved` | D01、B04                |
| B07 | OpenCode 配置适配              | `resolved` | D01、B04                |
| B08 | 已安装 Skills 可视化盘点       | `resolved` | D01、D02、B02           |
| B09 | 远程 Git 与本地仓库 Skill 来源 | `resolved` | D02、B08                |
| B10 | 标准 Marketplace 来源          | `resolved` | D01、D02、B09           |
| B11 | skills.sh 来源                 | `resolved` | D01、D02、B08           |
| B12 | Skill 生命周期与多 Agent 安装  | `resolved` | B09、B10、B11           |
| B13 | 统一诊断、冲突和恢复体验       | `resolved` | D04、B05、B06、B07、B12 |
| B14 | 跨平台验收与 V1 发布           | `resolved` | B13                     |
| B15 | Skill 更新与当前版本展示       | `resolved` | B12                     |

## 当前推进顺序

1. V1 任务已全部完成；后续按发布清单维护版本和签名 Secrets。

## 状态维护规则

- 开始工作前将对应任务改为 `claimed`，完成全部验收标准后改为 `resolved`。
- 新增阻塞或决策写回对应任务的 `Blocked by` 与 `Comments`。
- 每次状态变化同步更新本索引的表格和更新时间；详细证据仍以任务文件为准。
