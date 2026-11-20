#!/usr/bin/env python3
"""Read-only file-budget preflight for an AutomationDraft or task package.

This checks file constraints, not the complete installed CLI schema.
"""
import argparse
import json
from pathlib import Path
import stat
import sys

FILE_LIMIT = 65536
TOTAL_LIMIT = 1048576


def read_regular(path, limit):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError("expected a regular, nonlinked file")
    with path.open("rb") as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f"file exceeds read limit {limit} bytes")
    return data.decode("utf-8")


def check(source):
    package = source.is_dir()
    manifest = source / "config/task.json" if package else source
    if package and (source.is_symlink() or (source / "config").is_symlink()):
        raise ValueError("package directories cannot be links")
    value = json.loads(read_regular(manifest, 8 * TOTAL_LIMIT))
    draft = value["draft"] if package else value
    entries = value["files"] if package else draft.get("files", [])
    errors, warnings, seen, sizes = [], [], set(), []
    for entry in entries:
        relative = entry if package else entry["path"]
        parts = relative.split("/")
        if (not relative or relative.startswith("/")
                or any(p in ("", ".", "..") for p in parts)
                or any(c in relative for c in ("\\", ":", "\0"))
                or not relative.endswith((".py", ".sh", ".ps1", ".json", ".md"))):
            errors.append(f"{relative!r}: invalid relative task-file path")
            continue
        if relative in seen:
            errors.append(f"{relative}: duplicate path")
        seen.add(relative)
        try:
            if package:
                parent = source
                for part in parts[:-1]:
                    parent = parent / part
                    if not stat.S_ISDIR(parent.lstat().st_mode):
                        raise ValueError("parent must be a nonlinked directory")
                content = read_regular(source / relative, TOTAL_LIMIT)
            else:
                content = entry["content"]
            size = len(content.encode("utf-8"))
            sizes.append((size, relative))
            if not content.strip() or "\0" in content:
                errors.append(f"{relative}: empty content or NUL")
            if relative != "config/prompt-variants.json":
                if size > FILE_LIMIT:
                    errors.append(f"{relative}: {size} bytes exceeds {FILE_LIMIT}")
                elif size >= FILE_LIMIT * 0.9:
                    warnings.append(f"{relative}: {size} bytes; {FILE_LIMIT-size} bytes remaining")
        except (OSError, UnicodeError, ValueError, TypeError) as error:
            errors.append(f"{relative}: {error}")
    if len(entries) > 64:
        errors.append(f"{len(entries)} files exceeds 64")
    # Conservatively count content even when CLI may deduplicate a shell entry.
    total = sum(size for size, _ in sizes) + len(draft["content"].encode("utf-8"))
    if total > TOTAL_LIMIT:
        errors.append(f"conservative total {total} bytes exceeds {TOTAL_LIMIT}; verify with CLI")
    elif total >= TOTAL_LIMIT * 0.9:
        warnings.append(f"conservative total {total} bytes; {TOTAL_LIMIT-total} bytes remaining")
    print(f"{len(entries)} files; conservative total {total}/{TOTAL_LIMIT} bytes")
    for label, messages in (("ERROR", errors), ("WARN", warnings)):
        for message in messages:
            print(f"{label}: {message}")
    print("File preflight FAILED" if errors else "File preflight passed; installed CLI validation still required")
    return 1 if errors else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="draft JSON file or task package directory")
    args = parser.parse_args()
    try:
        return check(args.source.expanduser())
    except (OSError, UnicodeError, ValueError, KeyError, TypeError, AttributeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
