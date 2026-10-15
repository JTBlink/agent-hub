# 发布 v0.1.8

- **版本**: 0.1.8
- **选版依据**: patch 升级，v0.1.7 已发布
- **发布范围**: 备份 diff 查看器、项目技能状态修复、测试竞争修复

## 步骤

| 步骤            | 状态 | 备注                                          |
| --------------- | ---- | --------------------------------------------- |
| 1. 选择版本     | done | 0.1.8 (patch)                                 |
| 2. 准备并提交   | done | SHA: 85b0807a19258a05b877d6ff9c9ea52699762366 |
| 3. 验证候选     | done | run: 38672513662 (三平台通过)                 |
| 4. 创建 tag     | done | v0.1.8 → 85b0807                              |
| 5. 跟踪正式构建 | done | build: 38675114750, pages: 38675114593        |
| 6. 下载并验收   | done | 4 安装包 + 7 校验文件通过                     |

## 证据

- **Tag**: v0.1.8 → `85b0807a19258a05b877d6ff9c9ea52699762366`
- **候选 run**: https://github.com/JTBlink/agent-hub/actions/runs/38672513662
- **正式 build run**: https://github.com/JTBlink/agent-hub/actions/runs/38675114750
- **Pages deploy run**: https://github.com/JTBlink/agent-hub/actions/runs/38675114593
- **Release**: https://github.com/JTBlink/agent-hub/releases/tag/v0.1.8
- **附件**: AppImage, deb, dmg, exe, SHA256SUMS, CHANGELOG, PLATFORM_SUPPORT, RELEASE_NOTES
- **签名**: 未启用 (ENABLE_APPLE_SIGNING / ENABLE_WINDOWS_SIGNING 未配置)
- **未完成原生验收**: macOS/Windows/Linux 首次启动、技能库、工作空间等功能验证需手动执行
