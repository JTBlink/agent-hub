"""文件清理与路径边界；只删除明确目录内的过期普通文件。"""
import os
from pathlib import Path
import shutil
import stat
import time


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


def clean_target(target, retention_days, dry_run=False, protect_access=False, skip_permission_denied=False, allow_hardlinks=False):
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
                            clean_file(Path(entry.path), metadata, cutoff, protect_access, dry_run, result, target, allow_hardlinks)
                    except FileNotFoundError:
                        result["skipped"] += 1
                    except OSError as error:
                        access_error(result, error, entry.path, skip_permission_denied)
        except OSError as error:
            access_error(result, error, parent, skip_permission_denied)
    return result


def clean_file(path, metadata, cutoff, protect_access, dry_run, result, boundary, allow_hardlinks=False):
    result["scanned"] += 1
    if path.name.endswith((".lock", ".pid", ".sock")) or (not allow_hardlinks and getattr(metadata, "st_nlink", 1) > 1):
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
    if is_link(current) or not stat.S_ISREG(current.st_mode) or (not allow_hardlinks and getattr(current, "st_nlink", 1) > 1) or (
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


def report_target(label, target, days, dry_run=False, protect_access=False, skip_permission_denied=False, allow_hardlinks=False):
    result = clean_target(target, days, dry_run, protect_access, skip_permission_denied, allow_hardlinks)
    action = "预计删除" if dry_run else "已删除"
    count = result["eligible"] if dry_run else result["removed"]
    size = result["candidate_bytes"] if dry_run else result["removed_bytes"]
    print(f"[{label}] {display_path(target)} | 保留 {days} 天 | 已扫描：{result['scanned']} | {action}：{count} 个文件（{human_bytes(size)}） | 跳过：{result['skipped']} | 警告：{result['warnings']} | 错误：{result['errors']}")
    if allow_hardlinks:
        print("增量缓存仅移除目标目录中的过期链接，其他位置的内容保留；共享文件大小不等于实际释放空间。")
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
