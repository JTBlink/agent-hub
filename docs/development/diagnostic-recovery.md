# 诊断恢复命令契约

诊断中心通过两个 Tauri command 走统一的恢复策略。恢复票据只保存在进程内，最多保留 128 个，执行成功后立即失效；重启应用会使未执行票据失效。

## `preview_diagnostic_recovery`

请求参数（camelCase）：

```json
{
  "request": {
    "diagnosticCode": "config:toml-syntax",
    "resourcePath": "~/.codex/config.toml",
    "action": "edit_config",
    "format": "toml",
    "replacement": "model = \"gpt-5\"\n"
  }
}
```

`resourcePath` 在诊断码不唯一时必填；`action`、`format` 和 `replacement` 会与当前扫描结果及授权配置格式校验。配置编辑只返回遮罩 Diff，不写磁盘。

返回：

```json
{
  "recoveryId": "recovery-1",
  "plan": {
    "diagnosticCode": "config:toml-syntax",
    "action": "edit_config",
    "safety": "requires_confirmation",
    "previewRequired": true,
    "confirmationRequired": true
  },
  "summary": "授权进入配置编辑预览；写入仍需走安全编辑命令",
  "configPreview": { "changed": true, "diff": "..." }
}
```

## `execute_diagnostic_recovery`

请求需带上 `recoveryId`、原诊断码/路径，以及预览返回的 `expectedChecksum` 和 `replacement`：

```json
{
  "request": {
    "diagnosticCode": "config:toml-syntax",
    "resourcePath": "~/.codex/config.toml",
    "recoveryId": "recovery-1",
    "format": "toml",
    "expectedChecksum": "<configPreview.before.checksum>",
    "replacement": "model = \"gpt-5\"\n",
    "previewed": true,
    "confirmed": true
  }
}
```

`safe` 的扫描/刷新动作可在 `previewed=false`、`confirmed=false` 时执行；`requires_confirmation` 必须同时满足两个布尔门禁，且配置写入会再次校验遮罩 Diff、内容 checksum、备份、原子替换和历史记录；`manual` 始终拒绝自动执行。成功返回 `outcome`（`refreshed` 或 `applied`）、`diagnosticsRefreshed`、最新诊断和可选 `configWrite`。

重复执行、变更后的 checksum、错误 action 或路径都会被拒绝。备份恢复、重复 Skill 处理、权限、版本和存储修复继续由各自的专用审查/回滚命令完成，不会被通用恢复入口冒险代办。
