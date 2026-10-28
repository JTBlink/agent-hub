"""调用工具自身的清理能力，保留最新构建和仍被引用的依赖。"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
from cleanup_files import cache_target, display_path
from cleanup_rules import browser_cache_rules, incremental_rules


def processes_running(names):
    """Fail closed if the process list cannot be checked."""
    command = ["tasklist", "/FO", "CSV", "/NH"] if sys.platform == "win32" else ["ps", "-A", "-o", "comm="]
    output = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in output.stdout.splitlines():
        name = line.split('\",\"', 1)[0].strip('"') if sys.platform == "win32" else Path(line.strip()).name
        if name.casefold() in names:
            return True
    return False


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
            apply_rules(browser_cache_rules(days=args.browser_days))

    def builds():
        if not args.dry_run and processes_running({"cargo", "cargo.exe", "rustc", "rustc.exe"}):
            tools.append(("Rust 构建缓存", "未执行（检测到编译进程）"))
        else:
            for target in args.rust_targets:
                step("Rust 增量缓存 " + display_path(Path(target).expanduser()), lambda: apply_rules(incremental_rules(target, args.incremental_days)))
            for project in args.agent_hub_projects:
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
        command = ["brew", "cleanup", "--prune=" + str(args.download_days)] + (["--dry-run"] if args.dry_run else [])
        tools.append(run_tool("Homebrew 历史下载与版本", command, args.dry_run, env=env))

    if args.detect_workspace_builds:
        workspace = Path.cwd()
        if (workspace / "src-tauri/Cargo.toml").is_file() and (workspace / "scripts/build.mjs").is_file():
            args.agent_hub_projects = list(dict.fromkeys([*args.agent_hub_projects, str(workspace)]))
        elif (workspace / "Cargo.toml").is_file():
            args.rust_targets = list(dict.fromkeys([*args.rust_targets, str(workspace / "target")]))

    if args.browser_cache:
        step("浏览器缓存", browsers)
    if args.rust_targets or args.agent_hub_projects:
        step("Rust 构建缓存", builds)
    if args.uv_prune:
        step("uv 无引用缓存", lambda: tools.append(run_tool("uv 无引用缓存", ["uv", "cache", "prune", "--offline", "--no-python-downloads"], args.dry_run, preview_supported=False)))
    if args.brew_cleanup:
        step("Homebrew 历史下载与版本", brew)
    if args.updater_cache:
        def updates():
            rules, notices = updater_rules(args.updater_days)
            tools.extend(notices)
            apply_rules(rules)
        step("应用旧更新缓存", updates)
    return tools


def numeric_version(value):
    import re
    if not isinstance(value, str) or not re.fullmatch(r"\d+(?:\.\d+)*", value):
        return None
    parts = tuple(int(part) for part in value.split("."))
    while len(parts) > 1 and parts[-1] == 0:
        parts = parts[:-1]
    return parts


def installed_app_info(app_name):
    import plistlib
    for parent in (Path("/Applications"), Path.home() / "Applications"):
        info = parent / app_name / "Contents/Info.plist"
        if info.is_file():
            return plistlib.loads(info.read_bytes())
    return None


def updater_rules(days):
    """只清理已安装同等或更新版本的旧 macOS 包；pending 和未知格式一律保留。"""
    import plistlib
    import time
    if sys.platform != "darwin":
        return [], [("应用更新缓存", "未执行（当前平台无可验证的更新缓存规则）")]
    if processes_running({"shipit", "autoupdate"}):
        return [], [("应用更新缓存", "未执行（检测到更新进程）")]
    home = Path.home()
    caches = home / "Library/Caches"
    specifications = [
        ("Visual Studio Code.app", caches, "com.microsoft.VSCode.ShipIt", "update."),
        ("Codex.app", caches / "com.openai.codex/org.sparkle-project.Sparkle", "Installation", ""),
    ]
    rules, notices = [], []
    for app_name, parent, child, prefix in specifications:
        base = cache_target(parent, child)
        if not base.is_dir():
            continue
        installed_info = installed_app_info(app_name)
        if installed_info is None:
            notices.append((app_name + " 更新缓存", "未执行（无法确认已安装版本）"))
            continue
        for candidate in base.iterdir():
            if not candidate.name.startswith(prefix) or not candidate.is_dir() or candidate.is_symlink():
                continue
            package = cache_target(base, candidate.name)
            info_path = cache_target(package, app_name + "/Contents/Info.plist")
            if not info_path.is_file():
                continue
            info = plistlib.loads(info_path.read_bytes())
            if not info.get("CFBundleIdentifier") or info.get("CFBundleIdentifier") != installed_info.get("CFBundleIdentifier"):
                notices.append((app_name + " 更新缓存", "未执行（应用标识不匹配）"))
                continue
            keys = ("CFBundleVersion", "CFBundleShortVersionString")
            versions = next(((numeric_version(info.get(key)), numeric_version(installed_info.get(key))) for key in keys if numeric_version(info.get(key)) is not None and numeric_version(installed_info.get(key)) is not None), None)
            if versions is None or versions[0] > versions[1]:
                notices.append((app_name + " 更新缓存", "未执行（新版本待安装或版本无法比较）"))
                continue
            metadata = package.lstat()
            if max(metadata.st_mtime, getattr(metadata, "st_birthtime", 0)) >= time.time() - days * 86400:
                notices.append((app_name + " 更新缓存", "未执行（仍在保留期内）"))
                continue
            rules.append((app_name + " 已安装旧更新包", base, package.name, days, False))
    return rules, notices
