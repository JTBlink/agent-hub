"""中文清理总结和跨平台桌面通知。"""
from cleanup_files import human_bytes


def print_summary(total, records, tools, before, after, dry_run, elapsed):
    print("\n========== 清理总结" + ("（仅预览，未删除文件）" if dry_run else "") + " ==========")
    print(f"本次检查 {len(records)} 个目录，耗时 {elapsed:.1f} 秒。")
    for label, result in records:
        count = result["eligible"] if dry_run else result["removed"]
        size = result["candidate_bytes"] if dry_run else result["removed_bytes"]
        print(f"- {label}：{'预计删除' if dry_run else '已删除'} {count} 个文件（{human_bytes(size)}），跳过 {result['skipped']}，警告 {result['warnings']}，错误 {result['errors']}")
    for label, status in tools:
        print(f"- {label}：{status}（文件数与删除量以工具输出为准，未计入下方文件统计）")
    if tools:
        failed_tools = sum(status == "执行失败" for _, status in tools)
        skipped_tools = sum(status.startswith("未执行") for _, status in tools)
        print(f"工具清理：完成 {len(tools) - failed_tools - skipped_tools} 项 | 跳过 {skipped_tools} 项 | 失败 {failed_tools} 项")
    print(f"文件统计：已扫描 {total['scanned']} 个 | 符合条件 {total['eligible']} 个（{human_bytes(total['candidate_bytes'])}） | 已删除 {total['removed']} 个（{human_bytes(total['removed_bytes'])}） | 跳过 {total['skipped']} | 警告 {total['warnings']} | 错误 {total['errors']}")
    print(f"磁盘可用空间：{human_bytes(before.free)} → {human_bytes(after.free)}")
    change = after.free - before.free
    print("可用空间变化：", ("+" if change >= 0 else "") + human_bytes(change), "（实测值，其他进程也可能影响；预览时不代表清理释放量）" if dry_run else "（实测值，其他进程也可能影响）")
    if total["eligible"] == 0:
        print("未确认有符合条件的文件，部分条目未能检查。" if total["warnings"] or total["errors"] else "文件清理规则未匹配到过期文件。")
    failed = total["errors"] or any(status == "执行失败" for _, status in tools)
    incomplete = total["warnings"] or any(status.startswith("未执行") for _, status in tools)
    print("本次结果：" + ("部分清理失败，请查看上方错误。" if failed else "完成，部分条目或清理项已跳过，请查看上方说明。" if incomplete else "预览完成，未删除任何文件。" if dry_run else "清理完成。"))


def notification_command(title, body, platform=None):
    """通知正文经参数或环境变量传入，不拼接可执行脚本。"""
    import os
    import sys
    platform = platform or sys.platform
    env = dict(os.environ)
    if platform == "darwin":
        script = 'on run argv\n display notification (item 2 of argv) with title (item 1 of argv)\nend run'
        return ["osascript", "-e", script, title, body], env
    if platform == "win32":
        env.update(AGENT_HUB_NOTICE_TITLE=title, AGENT_HUB_NOTICE_BODY=body)
        script = """$ErrorActionPreference='Stop'
try {
[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime] > $null
$title=[System.Security.SecurityElement]::Escape($env:AGENT_HUB_NOTICE_TITLE)
$body=[System.Security.SecurityElement]::Escape($env:AGENT_HUB_NOTICE_BODY)
$xml=New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml(\"<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$body</text></binding></visual></toast>\")
$toast=[Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('AgentHub').Show($toast)
} catch {
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$notice=New-Object System.Windows.Forms.NotifyIcon
try {
$notice.Icon=[System.Drawing.SystemIcons]::Information
$notice.BalloonTipTitle=$env:AGENT_HUB_NOTICE_TITLE
$notice.BalloonTipText=$env:AGENT_HUB_NOTICE_BODY
$notice.Visible=$true
$notice.ShowBalloonTip(5000)
Start-Sleep -Seconds 5
} finally { $notice.Dispose() }
}
"""
        return ["powershell", "-NoProfile", "-NonInteractive", "-Command", script], env
    return ["notify-send", title, body], env


def send_notification(total, tools, before, after, failed):
    import shutil
    import subprocess
    skipped = total["skipped"] + sum(status.startswith("未执行") for _, status in tools)
    title = "AgentHub 清理部分失败" if failed else "AgentHub 清理完成"
    change = after.free - before.free
    tool_errors = sum(status == "执行失败" for _, status in tools)
    body = f"可用空间变化 {'+' if change >= 0 else ''}{human_bytes(change)}，当前可用 {human_bytes(after.free)}。已删除 {total['removed']} 个文件；跳过 {skipped}，警告 {total['warnings']}，文件错误 {total['errors']}，工具失败 {tool_errors}。详情见任务日志。"
    command, env = notification_command(title, body)
    executable = shutil.which(command[0])
    if not executable:
        print("桌面通知：通知工具未安装，已跳过；清理结果不受影响。")
        return False
    try:
        result = subprocess.run([executable, *command[1:]], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15, check=False)
        if result.returncode:
            print("桌面通知：系统未接受通知请求，清理结果不受影响。")
            return False
        print("桌面通知：已请求系统发送清理结果。")
        return True
    except (OSError, subprocess.SubprocessError):
        print("桌面通知：发送失败，清理结果不受影响。")
        return False
