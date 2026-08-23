# B11：支持 skills.sh 来源

Type: task
Status: resolved
Blocked by: D01, D02, B08

## 交付

实现 skills.sh `SkillSource` adapter，提供搜索/解析、详情查看和可追踪内容获取能力。

## 验收标准

- 仅使用 D01 确认的稳定官方命令或公开接口。
- 将外部结果转换为统一 Skill 描述，不泄露输出格式到 UI。
- 处理 CLI 缺失、网络失败、限流和结果变化。
- 获取结果包含可追踪来源与版本信息。
- adapter 使用固定响应夹具测试。

## 当前状态

`resolved`。D01 确认的稳定 direct-source 流程与统一 `browse_skill_source` command 已完成；Skills 页面支持 owner/repository 输入、预置仓库选择、来源浏览和安装计划。skills.sh 未提供稳定搜索 API，因此 V1 不抓取网页搜索结果。

## Result

- adapter 接受官方 `owner/repository` 和 `https://skills.sh/owner/repository` 两种稳定定位形式，对 UI 只输出统一 `SourceScan`。
- 内容获取复用相应 GitHub 仓库的安全 Git fetch，结果带 skills.sh locator 和 resolved commit；CLI 缺失不影响该路径。
- 非法标识、checkout 缺失、网络失败由统一 `SourceError` 处理；固定本地 checkout fixture 验证格式变化不会泄漏到调用方。
