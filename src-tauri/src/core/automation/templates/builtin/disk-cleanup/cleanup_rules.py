"""可清理目录清单；不扫描用户主目录、Agent 根目录或会话数据库。"""
import os
from pathlib import Path
import sys
from cleanup_files import cache_target, is_link


def user_cache_rules(platform=None, days=30, temp_days=7, extra_rules=()):
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
        ("Homebrew 下载缓存", caches / "Homebrew", "downloads", days),
        ("pip HTTP 缓存", pip, "http", days),
        ("pip HTTP v2 缓存", pip, "http-v2", days),
        ("npm 下载缓存", npm / "_cacache", "content-v2", days),
        ("npm 临时缓存", npm / "_cacache", "tmp", temp_days),
        ("npm-hermes 下载缓存", home / ".cache/npm-hermes/_cacache", "content-v2", days),
        ("npm-hermes 临时缓存", home / ".cache/npm-hermes/_cacache", "tmp", temp_days),
        ("Electron 构建下载缓存", caches, "electron", days),
        ("Electron Builder 下载缓存", caches, "electron-builder", days),
        *extra_rules,
    ]


def agent_cache_rules(days=7):
    """只列出可再生缓存及诊断目录，不遍历 Agent 根目录或会话数据库。"""
    home = Path.home()
    codex = Path(os.environ.get("CODEX_HOME", home / ".codex")).expanduser()
    claude = Path(os.environ.get("CLAUDE_CONFIG_DIR", home / ".claude")).expanduser()
    hermes = Path(os.environ.get("HERMES_HOME", home / ".hermes")).expanduser()
    data = Path(os.environ.get("XDG_DATA_HOME", home / ".local/share")).expanduser()
    # 第五项：缓存按最近访问/修改保留，诊断日志按最后修改时间保留。
    return [
        ("Codex 缓存", codex, "cache", days, True),
        ("Codex 临时文件", codex, "tmp", days, True),
        ("Codex Shell 快照", codex, "shell_snapshots", days, True),
        ("Codex 诊断日志", codex, "log", days, False),
        ("Claude Code 调试日志", claude, "debug", days, False),
        ("Claude Code Shell 快照", claude, "shell-snapshots", days, True),
        ("Claude Code 临时环境", claude, "session-env", days, True),
        ("Hermes 缓存", hermes, "cache", days, True),
        ("Hermes 运行日志", hermes, "logs", days, False),
        ("OpenCode 运行日志", data / "opencode", "log", days, False),
    ]


def browser_cache_rules(platform=None, days=7):
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
                    rules.append((label + " " + name + " 网页缓存", profile, cache, days))
    return rules


def incremental_rules(target, temp_days=7):
    target = Path(target).expanduser().absolute()
    if target.name != "target" or not (target.parent / "Cargo.toml").is_file():
        raise ValueError("Rust 构建目录必须是 Cargo.toml 同目录下的 target。")
    target = cache_target(target.parent, "target")
    if not target.exists():
        return []
    roots = [target]
    roots.extend(child for child in target.iterdir() if child.name not in ("debug", "release") and child.is_dir() and not is_link(child.lstat()))
    return [("Rust 增量编译缓存", root / profile, "incremental", temp_days, True, True)
            for root in roots for profile in ("debug", "release")]
