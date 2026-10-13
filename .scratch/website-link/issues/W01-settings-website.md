Type: task
Status: resolved
Blocked by: none

# 修正设置页官网入口

## Scope

用户指定官网为 `https://jtblink.github.io/agent-hub/`；设置页当前误打开 GitHub README，改用集中维护的官网地址。

## Acceptance

- 设置页官网入口打开指定链接，README 和项目配置一致。
- 类型检查、格式和相关验证通过，只提交本任务改动。

## Comments

- 工作区已有其他侧栏导航改动，本任务按明确文件与 changelog 增量暂存，保留其他修改。

## Result

- [公共链接](../../../src/lib/distribution.ts) 集中维护 `WEBSITE_URL`，设置页官网按钮直接打开指定产品主页；README 与 package.json 已正确，无需修改。
- 官网目标及 README / package.json 一致性检查、相关文件 ESLint / Prettier、`npm run build` 通过；无新增 IPC 或持久化行为。仅修改应用入口，无需重新部署官网。
- Standards：复用项目元数据模块和既有打开链接能力；Spec：指定官网链接已用于设置页按钮。按文件与独立 changelog 增量暂存，保留侧栏导航的其他工作区改动。
