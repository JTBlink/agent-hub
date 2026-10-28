"""清理过期文件和指定的可再生缓存，最后输出中文清理总结。

默认清理工作目录 tmp/logs 及过期下载缓存，保留近 30 天使用的用户缓存。
用 --dry-run 只预览；--workspace-only 仅清理任务工作目录。
浏览器、构建产物和工具深度清理需通过参数启用，不扫描整个主目录。
"""
import argparse
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import time

TEMP_RETENTION_DAYS = 7
LOG_RETENTION_DAYS = 30
USER_CACHE_RETENTION_DAYS = 30
ENABLE_USER_CACHE_CLEANUP = True
CLEANUP_RULES = [("tmp", TEMP_RETENTION_DAYS), ("logs", LOG_RETENTION_DAYS)]
# Optional extra cache rules: (label, cache root, child directory, retention days).
# Cache roots must be inside the current user's home; links are never followed.
EXTRA_CACHE_RULES = []


def human_bytes(value):
    sign = "-" if value < 0 else ""
    size = abs(value)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB", "PiB"):
        if size < 1024 or unit == "PiB":
            return f"{sign}{size:.0f} B" if unit == "B" else f"{sign}{size:.2f} {unit}"
        size /= 1024


def display_path(path):
    try:
        return "~/" + str(Path(path).relative_to(Path.home()))
    except ValueError:
        return str(path)


def is_link(metadata):
    return stat.S_ISLNK(metadata.st_mode) or bool(
        getattr(metadata, "st_file_attributes", 0)
        & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    )


def user_cache_rules(platform=None):
    platform = platform or sys.platform
    home = Path.home()
    if platform == "darwin":
        caches = home / "Library/Caches"
        npm = home / ".npm"
    elif platform == "win32":
        local = Path(os.environ.get("LOCALAPPDATA", home / "AppData/Local"))
        caches = local
        npm = local / "npm-cache"
    else:
        caches = Path(os.environ.get("XDG_CACHE_HOME", home / ".cache"))
        npm = home / ".npm"
    pip = caches / "pip" / ("Cache" if platform == "win32" else "")
    return [
        ("Homebrew 下载缓存", caches / "Homebrew", "downloads", USER_CACHE_RETENTION_DAYS),
        ("pip HTTP 缓存", pip, "http", USER_CACHE_RETENTION_DAYS),
        ("pip HTTP v2 缓存", pip, "http-v2", USER_CACHE_RETENTION_DAYS),
        ("npm 下载缓存", npm / "_cacache", "content-v2", USER_CACHE_RETENTION_DAYS),
        ("npm 临时缓存", npm / "_cacache", "tmp", TEMP_RETENTION_DAYS),
        ("npm-hermes 下载缓存", home / ".cache/npm-hermes/_cacache", "content-v2", USER_CACHE_RETENTION_DAYS),
        ("npm-hermes 临时缓存", home / ".cache/npm-hermes/_cacache", "tmp", TEMP_RETENTION_DAYS),
        *EXTRA_CACHE_RULES,
    ]


def cache_target(root, child):
    root = Path(root).expanduser()
    child = Path(child)
    if not root.is_absolute() or child.is_absolute() or not child.parts or any(
        part in (".", "..") for part in child.parts
    ):
        raise ValueError("缓存规则必须指定绝对根目录和相对子目录。")
    home = Path.home()
    try:
        relative = root.relative_to(home)
        root.resolve().relative_to(home.resolve())
    except ValueError:
        raise ValueError("缓存根目录必须位于当前用户主目录内。") from None
    if not relative.parts or ".." in relative.parts:
        raise ValueError("不能将用户主目录本身作为缓存根目录。")
    target = home
    for part in [*relative.parts, *child.parts]:
        target = target / part
        try:
            if is_link(target.lstat()):
                raise ValueError("缓存目录不能是符号链接或目录联接。")
        except FileNotFoundError:
            pass
    if target.resolve().parent == target.resolve():
        raise ValueError("不能清理文件系统根目录。")
    return target


def counters():
    return dict(scanned=0, eligible=0, candidate_bytes=0, removed=0, removed_bytes=0, skipped=0, warnings=0, errors=0)


def access_error(result, error, path, skip_permission_denied):
    if skip_permission_denied and isinstance(error, PermissionError):
        result["skipped"] += 1
        result["warnings"] += 1
        print("跳过受保护的缓存：", display_path(path), "（权限不足）")
    else:
        result["errors"] += 1
        print("清理访问失败：", display_path(path), type(error).__name__)


def entry_metadata(entry):
    metadata = entry.stat(follow_symlinks=False)
    # Windows DirEntry.stat may leave st_dev at zero.
    return Path(entry.path).lstat() if metadata.st_dev == 0 else metadata


def expired(metadata, cutoff, protect_access):
    last_use = max(metadata.st_mtime, getattr(metadata, "st_atime", 0)) if protect_access else metadata.st_mtime
    return last_use < cutoff


def clean_target(target, retention_days, dry_run=False, protect_access=False, skip_permission_denied=False):
    if not isinstance(retention_days, int) or isinstance(retention_days, bool) or retention_days < 1:
        raise ValueError("保留天数必须为正整数。")
    result = counters()
    try:
        root = target.lstat()
    except FileNotFoundError:
        print("跳过不存在的目录：", display_path(target))
        return result
    except OSError as error:
        access_error(result, error, target, skip_permission_denied)
        return result
    if is_link(root) or not stat.S_ISDIR(root.st_mode):
        raise ValueError("清理目标必须是实际目录，不能是符号链接或目录联接。")
    cutoff = time.time() - retention_days * 86400
    pending = [target]
    while pending:
        parent = pending.pop()
        try:
            current = parent.lstat()
            if is_link(current) or current.st_dev != root.st_dev:
                result["skipped"] += 1
                continue
            with os.scandir(parent) as entries:
                for entry in entries:
                    try:
                        metadata = entry_metadata(entry)
                        if is_link(metadata) or metadata.st_dev != root.st_dev:
                            result["skipped"] += 1
                        elif stat.S_ISDIR(metadata.st_mode):
                            pending.append(Path(entry.path))
                        elif stat.S_ISREG(metadata.st_mode):
                            clean_file(Path(entry.path), metadata, cutoff, protect_access, dry_run, result, target)
                    except FileNotFoundError:
                        result["skipped"] += 1
                    except OSError as error:
                        access_error(result, error, entry.path, skip_permission_denied)
        except OSError as error:
            access_error(result, error, parent, skip_permission_denied)
    return result


def clean_file(path, metadata, cutoff, protect_access, dry_run, result, boundary):
    result["scanned"] += 1
    if path.name.endswith((".lock", ".pid", ".sock")) or getattr(metadata, "st_nlink", 1) > 1:
        result["skipped"] += 1
        return
    if not expired(metadata, cutoff, protect_access):
        return
    # Recheck immediately before unlinking: editors/downloads may have replaced it.
    parent = path.parent
    while True:
        if is_link(parent.lstat()):
            result["skipped"] += 1
            return
        if parent == boundary:
            break
        if parent.parent == parent:
            raise ValueError("文件已超出指定清理目录。")
        parent = parent.parent
    current = path.lstat()
    if is_link(current) or not stat.S_ISREG(current.st_mode) or (
        current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns
    ) != (metadata.st_dev, metadata.st_ino, metadata.st_size, metadata.st_mtime_ns) or not expired(current, cutoff, protect_access):
        result["skipped"] += 1
        return
    result["eligible"] += 1
    result["candidate_bytes"] += current.st_size
    if not dry_run:
        path.unlink()
        result["removed"] += 1
        result["removed_bytes"] += current.st_size


def report_target(label, target, days, dry_run=False, protect_access=False, skip_permission_denied=False):
    result = clean_target(target, days, dry_run, protect_access, skip_permission_denied)
    action = "预计删除" if dry_run else "已删除"
    count = result["eligible"] if dry_run else result["removed"]
    size = result["candidate_bytes"] if dry_run else result["removed_bytes"]
    print(f"[{label}] {display_path(target)} | 保留 {days} 天 | 已扫描：{result['scanned']} | {action}：{count} 个文件（{human_bytes(size)}） | 跳过：{result['skipped']} | 警告：{result['warnings']} | 错误：{result['errors']}")
    return result


def cleanup_files(directory, retention_days, dry_run=False):
    if Path(directory).is_absolute() or len(Path(directory).parts) != 1 or directory in (".", ".."):
        raise ValueError("工作目录规则只能指定直接子目录名称。")
    return report_target("工作目录 " + directory, Path.cwd() / directory, retention_days, dry_run)


def disk_space(label):
    usage = shutil.disk_usage(Path.cwd())
    ratio = usage.used / usage.total * 100 if usage.total else 0
    print(f"{label} 总容量：{human_bytes(usage.total)} | 已用：{human_bytes(usage.used)} | 可用：{human_bytes(usage.free)} | 使用率：{ratio:.1f}%")
    return usage


def browser_cache_rules(platform=None):
    platform = platform or sys.platform
    home = Path.home()
    if platform == "darwin":
        roots = [("Chrome", home / "Library/Caches/Google", "Chrome"),
                 ("Edge", home / "Library/Caches", "Microsoft Edge")]
    elif platform == "win32":
        local = Path(os.environ.get("LOCALAPPDATA", home / "AppData/Local"))
        roots = [("Chrome", local / "Google/Chrome", "User Data"),
                 ("Edge", local / "Microsoft/Edge", "User Data")]
    else:
        caches = Path(os.environ.get("XDG_CACHE_HOME", home / ".cache"))
        roots = [("Chrome", caches, "google-chrome"), ("Edge", caches, "microsoft-edge")]
    rules = []
    for label, root, child in roots:
        base = cache_target(root, child)
        if not base.exists():
            continue
        # Only enumerate profile names, never traverse browser data/Storage.
        for profile in base.iterdir():
            name = profile.name
            if name in ("Default", "System Profile", "SystemProfile", "Guest Profile") or (
                name.startswith("Profile ") and name[8:].isdigit()
            ):
                for cache in ("Cache", "Code Cache"):
                    rules.append((label + " " + name + " 网页缓存", profile, cache, USER_CACHE_RETENTION_DAYS))
    return rules


def processes_running(names):
    """Fail closed if the process list cannot be checked."""
    command = ["tasklist", "/FO", "CSV", "/NH"] if sys.platform == "win32" else ["ps", "-A", "-o", "comm="]
    output = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in output.stdout.splitlines():
        name = line.split('\",\"', 1)[0].strip('"') if sys.platform == "win32" else Path(line.strip()).name
        if name.casefold() in names:
            return True
    return False


def incremental_rules(target):
    target = Path(target).expanduser().absolute()
    if target.name != "target" or not (target.parent / "Cargo.toml").is_file():
        raise ValueError("Rust 构建目录必须是 Cargo.toml 同目录下的 target。")
    target = cache_target(target.parent, "target")
    if not target.exists():
        return []
    roots = [target]
    roots.extend(child for child in target.iterdir() if child.name not in ("debug", "release") and child.is_dir() and not is_link(child.lstat()))
    return [("Rust 增量编译缓存", root / profile, "incremental", TEMP_RETENTION_DAYS)
            for root in roots for profile in ("debug", "release")]


def run_tool(label, command, dry_run, preview_supported=True, cwd=None, env=None):
    if dry_run and not preview_supported:
        print(f"[{label}] 仅预览：工具不支持无副作用预览，本次不执行。")
        return label, "未执行（工具不支持预览）"
    executable = shutil.which(command[0])
    if not executable:
        print(f"[{label}] 未安装 {command[0]}，已跳过。")
        return label, "未执行（工具未安装）"
    print(f"[{label}] {'开始预览' if dry_run else '开始清理'}，以下为工具原始输出：", flush=True)
    # Argument arrays only: no shell, installation, sudo or force flags.
    result = subprocess.run([executable, *command[1:]], cwd=cwd, env=env, check=False)
    return label, ("预览完成" if dry_run else "清理完成") if result.returncode == 0 else "执行失败"


def optional_cleanup(args, apply_rules):
    tools = []

    def step(label, action):
        try:
            action()
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            tools.append((label, "执行失败"))
            print(f"[{label}] 执行失败：", str(error).replace(str(Path.home()), "~"))

    def browsers():
        if not args.dry_run and processes_running({"google chrome", "microsoft edge", "chrome", "chrome.exe", "msedge", "msedge.exe"}):
            tools.append(("浏览器缓存", "未执行（请先完全退出 Chrome 和 Edge）"))
        else:
            apply_rules(browser_cache_rules())

    def builds():
        if not args.dry_run and processes_running({"cargo", "cargo.exe", "rustc", "rustc.exe"}):
            tools.append(("Rust 构建缓存", "未执行（检测到编译进程）"))
        else:
            for target in args.rust_target:
                step("Rust 增量缓存 " + display_path(Path(target).expanduser()), lambda: apply_rules(incremental_rules(target)))
            for project in args.agent_hub_project:
                step("AgentHub 历史构建", lambda: project_builds(project))

    def project_builds(directory):
        project = Path(directory).expanduser().absolute()
        script = cache_target(project, "scripts") / "build.mjs"
        if not script.is_file() or not (project / "src-tauri/Cargo.toml").is_file():
            raise ValueError("请指定可信任的 AgentHub 源码目录，其中须包含 scripts/build.mjs 和 src-tauri/Cargo.toml。")
        target = cache_target(project / "src-tauri", "target")
        command = ["node", str(script), "prune"] + (["--dry-run"] if args.dry_run else [])
        env = dict(os.environ, CARGO_TARGET_DIR=str(target))
        tools.append(run_tool("AgentHub 历史构建 " + display_path(project), command, args.dry_run, cwd=project, env=env))

    def brew():
        env = dict(os.environ, HOMEBREW_NO_AUTO_UPDATE="1", HOMEBREW_NO_ANALYTICS="1")
        command = ["brew", "cleanup", "--prune=30"] + (["--dry-run"] if args.dry_run else [])
        tools.append(run_tool("Homebrew 历史下载与版本", command, args.dry_run, env=env))

    if args.browser_cache:
        step("浏览器缓存", browsers)
    if args.rust_target or args.agent_hub_project:
        step("Rust 构建缓存", builds)
    if args.uv_prune:
        step("uv 无引用缓存", lambda: tools.append(run_tool("uv 无引用缓存", ["uv", "cache", "prune", "--offline", "--no-python-downloads"], args.dry_run, preview_supported=False)))
    if args.brew_cleanup:
        step("Homebrew 历史下载与版本", brew)
    return tools


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


def main():
    # Native task logs are UTF-8 on every platform, including redirected Windows output.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不删除文件，也不运行无预览能力的清理工具")
    parser.add_argument("--workspace-only", action="store_true", help="仅应用任务工作目录规则，与其他清理选项互斥")
    parser.add_argument("--browser-cache", action="store_true", help="清理 Chrome/Edge 过期网页和代码缓存；实际清理前须退出浏览器")
    parser.add_argument("--rust-target", action="append", default=[], metavar="目录", help="清理指定 Cargo target 的过期 incremental 缓存，可重复指定；保留近 7 天文件")
    parser.add_argument("--agent-hub-project", action="append", default=[], metavar="源码目录", help="调用可信任的 AgentHub 源码内清理工具，保留最新构建；可重复指定")
    parser.add_argument("--uv-prune", action="store_true", help="用 uv 离线清理无引用缓存；预览模式不执行")
    parser.add_argument("--brew-cleanup", action="store_true", help="用 Homebrew 清理历史版本及超过 30 天的下载，不自动更新")
    args = parser.parse_args()
    if args.workspace_only and (args.browser_cache or args.rust_target or args.agent_hub_project or args.uv_prune or args.brew_cleanup):
        parser.error("--workspace-only 不能与其他可选清理项一起使用。")
    start = time.monotonic()
    if args.dry_run:
        print("预览模式：不会删除任何文件。")
    before = disk_space("清理前磁盘空间：")
    total = counters()
    records = []
    tools = []

    def apply_rules(rules):
        for label, root, child, days in rules:
            try:
                result = report_target(label, cache_target(root, child), days, args.dry_run, protect_access=True, skip_permission_denied=True)
                records.append((label, result))
                for key in total:
                    total[key] += result[key]
            except PermissionError as error:
                access_error(total, error, Path(root).expanduser() / child, True)
            except (OSError, ValueError) as error:
                total["errors"] += 1
                print("缓存规则失败：", label, str(error).replace(str(Path.home()), "~"))

    for directory, days in CLEANUP_RULES:
        try:
            result = cleanup_files(directory, days, args.dry_run)
            records.append(("工作目录 " + directory, result))
            for key in total:
                total[key] += result[key]
        except (OSError, ValueError) as error:
            total["errors"] += 1
            print("工作目录规则失败：", directory, str(error).replace(str(Path.home()), "~"))
    if ENABLE_USER_CACHE_CLEANUP and not args.workspace_only:
        apply_rules(user_cache_rules())
    try:
        tools = optional_cleanup(args, apply_rules)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        total["errors"] += 1
        print("可选清理项失败：", str(error).replace(str(Path.home()), "~"))
    after = disk_space("清理后磁盘空间：")
    print_summary(total, records, tools, before, after, args.dry_run, time.monotonic() - start)
    return 1 if total["errors"] or any(status == "执行失败" for _, status in tools) else 0


if __name__ == "__main__":
    sys.exit(main())
