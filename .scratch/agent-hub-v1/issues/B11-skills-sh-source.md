# B11：支持 skills.sh 来源

Type: task
Status: claimed
Blocked by: D01, D02, B08

## 交付

实现 skills.sh `SkillSource` adapter，提供搜索/解析、详情查看和可追踪内容获取能力。

## 验收标准

- 仅使用 D01 确认的稳定官方命令或公开接口。
- 将外部结果转换为统一 Skill 描述，不泄露输出格式到 UI。
- 处理 CLI 缺失、网络失败、限流和结果变化。
- 获取结果包含可追踪来源与版本信息。
- adapter 使用固定响应夹具测试。
