"""Clear expired workspace files. Customize the rules below; uses only Python 3's standard library."""
import os
from pathlib import Path
import shutil
import stat
import time

TEMP_RETENTION_DAYS = 7
LOG_RETENTION_DAYS = 30
CLEANUP_RULES = [("tmp", TEMP_RETENTION_DAYS), ("logs", LOG_RETENTION_DAYS)]


def is_link(metadata):
    return stat.S_ISLNK(metadata.st_mode) or bool(
        getattr(metadata, "st_file_attributes", 0)
        & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    )


def cleanup_files(directory, retention_days):
    if Path(directory).is_absolute() or len(Path(directory).parts) != 1 or directory in (".", ".."):
        raise ValueError("Cleanup targets must be named children of the working directory.")
    if not isinstance(retention_days, int) or retention_days < 1:
        raise ValueError("Retention days must be a positive integer.")
    target = Path.cwd() / directory
    try:
        root = target.lstat()
    except FileNotFoundError:
        print("No cleanup directory:", target)
        return
    if is_link(root) or not stat.S_ISDIR(root.st_mode):
        raise ValueError("Cleanup target must be a directory, not a symbolic link or junction.")
    cutoff = time.time() - retention_days * 86400
    pending = [target]
    removed = 0
    while pending:
        parent = pending.pop()
        current = parent.lstat()
        if is_link(current) or current.st_dev != root.st_dev:
            continue
        with os.scandir(parent) as entries:
            for entry in entries:
                metadata = entry.stat(follow_symlinks=False)
                # Windows DirEntry.stat leaves st_dev at zero. Read complete
                # metadata without following links before enforcing the volume boundary.
                if metadata.st_dev == 0:
                    metadata = Path(entry.path).lstat()
                if is_link(metadata) or metadata.st_dev != root.st_dev:
                    continue
                if stat.S_ISDIR(metadata.st_mode):
                    pending.append(Path(entry.path))
                elif stat.S_ISREG(metadata.st_mode) and metadata.st_mtime < cutoff:
                    os.unlink(entry.path)
                    removed += 1
    print("Removed", removed, "expired files from", target)


def disk_space(label):
    usage = shutil.disk_usage(Path.cwd())
    print(label, "total:", usage.total, "used:", usage.used, "free:", usage.free)


def main():
    disk_space("Disk space before cleanup:")
    for directory, retention_days in CLEANUP_RULES:
        cleanup_files(directory, retention_days)
    disk_space("Disk space after cleanup:")


if __name__ == "__main__":
    main()
