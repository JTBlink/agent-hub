"""预装磁盘清理入口；策略在 cleanup-config.json，模块与配置随模板一起安装。"""
from pathlib import Path
import sys
import time

# 同时支持直接执行及测试中的 runpy；仅加载本脚本同目录模块。
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from cleanup_config import parse_options
from cleanup_files import counters, access_error, cache_target, cleanup_files, disk_space, report_target
from cleanup_rules import user_cache_rules, agent_cache_rules
from cleanup_actions import optional_cleanup
from cleanup_report import print_summary, send_notification


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    options = parse_options(Path(__file__).with_name("cleanup-config.json"))
    if options.dry_run:
        print("预览模式：不会删除任何文件，也不会发送桌面通知。")
    start = time.monotonic()
    before = disk_space("清理前磁盘空间：")
    total, records = counters(), []

    def add(label, result):
        records.append((label, result))
        for key in total:
            total[key] += result[key]

    def apply_rules(rules):
        for label, root, child, days, *extra in rules:
            try:
                result = report_target(label, cache_target(root, child), days, options.dry_run, protect_access=extra[0] if extra else True, skip_permission_denied=True, allow_hardlinks=extra[1] if len(extra) > 1 else False)
                add(label, result)
            except PermissionError as error:
                access_error(total, error, Path(root).expanduser() / child, True)
            except (OSError, ValueError) as error:
                total["errors"] += 1
                print("缓存规则失败：", label, str(error).replace(str(Path.home()), "~"))

    for directory, days in [("tmp", options.workspace_tmp_days), ("logs", options.workspace_log_days)]:
        try:
            add("工作目录 " + directory, cleanup_files(directory, days, options.dry_run))
        except (OSError, ValueError) as error:
            total["errors"] += 1
            print("工作目录规则失败：", directory, str(error).replace(str(Path.home()), "~"))
    if options.user_caches:
        apply_rules(user_cache_rules(days=options.download_days, temp_days=options.workspace_tmp_days, extra_rules=options.extra_cache_rules))
    if options.agent_caches:
        apply_rules(agent_cache_rules(options.agent_days))
    tools = optional_cleanup(options, apply_rules)
    after = disk_space("清理后磁盘空间：")
    print_summary(total, records, tools, before, after, options.dry_run, time.monotonic() - start)
    failed = bool(total["errors"] or any(status == "执行失败" for _, status in tools))
    if options.notify and not options.dry_run:
        send_notification(total, tools, before, after, failed)
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())
