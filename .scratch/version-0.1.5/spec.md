# 0.1.5 版本升级

将应用从 0.1.4 升级到 0.1.5，使用 VERSION 作为唯一来源，同步 package.json、package-lock.json、Cargo.toml、Cargo.lock 与 Tauri 配置；将已有 Unreleased 说明归入 0.1.5，保留 Unreleased 入口。

本任务范围为本地版本准备，不包含 Git 提交、tag、推送或正式发布。

验收：所有应用版本一致，版本及相关发布脚本测试通过，帮助内容版本与应用一致，差异及格式检查通过。

后续用户要求处理 0.1.5 打包失败并重新发布：保持 0.1.5，复用 main 已提交的 npm 10 锁文件修复，先完成同 SHA 的质量门禁、三平台原生测试 / 安装包 / smoke 和汇总验证，再恢复正式发布。发布不创建分支；未发布失败 tag 的重建按 github-cli 的明确授权边界执行。任务：[B02](issues/B02-recover-installers.md)。
