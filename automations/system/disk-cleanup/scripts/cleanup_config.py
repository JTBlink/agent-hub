"""读取独立 JSON 配置并应用 CLI 覆盖；校验完成前不执行清理。"""
import argparse
import json
from pathlib import Path
from types import SimpleNamespace
from cleanup_files import cache_target

DAY_KEYS = {"workspace_tmp_days", "workspace_log_days", "download_days", "agent_days", "browser_days", "incremental_days", "updater_days"}
BOOL_KEYS = {"user_caches", "agent_caches", "browser_cache", "uv_prune", "brew_cleanup", "updater_cache", "notify", "detect_workspace_builds"}
LIST_KEYS = {"agent_hub_projects", "rust_targets", "extra_cache_rules"}


def load_config(path):
    path = Path(path)
    if path.is_symlink():
        raise ValueError("配置文件不能是符号链接。")
    content = path.read_text(encoding="utf-8-sig")
    # AgentHub 给每个已安装模板文件加归属标记；配置正文仍为标准 JSON。
    if content.startswith("# AgentHub automation script: agent_hub:"):
        content = content.partition("\n")[2]
    data = json.loads(content)
    if not isinstance(data, dict) or set(data) != DAY_KEYS | BOOL_KEYS | LIST_KEYS:
        raise ValueError("配置字段缺失或不受支持，请对照预装 cleanup-config.json。")
    for key in DAY_KEYS:
        if type(data[key]) is not int or data[key] < 1:
            raise ValueError(key + " 必须为正整数。")
    for key in BOOL_KEYS:
        if type(data[key]) is not bool:
            raise ValueError(key + " 必须为 true 或 false。")
    for key in LIST_KEYS:
        if not isinstance(data[key], list):
            raise ValueError(key + " 必须为数组。")
    for key in ("agent_hub_projects", "rust_targets"):
        if any(not isinstance(value, str) or not value.strip() for value in data[key]):
            raise ValueError(key + " 只能包含非空目录路径。")
        for value in data[key]:
            cache_target(Path(value).expanduser(), ".cleanup-boundary-check")
    for rule in data["extra_cache_rules"]:
        if not isinstance(rule, list) or len(rule) != 4 or not all(isinstance(v, str) and v for v in rule[:3]) or type(rule[3]) is not int or rule[3] < 1:
            raise ValueError("extra_cache_rules 每项为 [名称, 根目录, 子目录, 正整数保留天数]。")
        cache_target(rule[1], rule[2])
    return data


def parse_options(default_config):
    parser = argparse.ArgumentParser(description="自动清理过期缓存和历史构建，保留对话、凭据、运行时和被引用的依赖，输出中文总结及桌面通知。")
    parser.add_argument("--config", type=Path, default=default_config, help="配置文件路径，默认使用入口脚本旁的 cleanup-config.json")
    parser.add_argument("--dry-run", action="store_true", help="只预览，不删除文件，不发通知；无预览能力的工具不执行")
    parser.add_argument("--workspace-only", action="store_true", help="仅清理工作目录 tmp/logs，默认不发通知")
    parser.add_argument("--no-tools", action="store_true", help="跳过构建、uv、Homebrew 和更新缓存清理")
    for key, name, help_text in [
        ("browser_cache", "browser-cache", "浏览器网页与代码缓存"),
        ("uv_prune", "uv-prune", "uv 无引用缓存"),
        ("brew_cleanup", "brew-cleanup", "Homebrew 历史版本与下载"),
        ("updater_cache", "updater-cache", "确认已安装版本后的旧更新缓存"),
        ("notify", "notify", "完成后发送桌面通知"),
    ]:
        group = parser.add_mutually_exclusive_group()
        group.add_argument("--" + name, dest=key, action="store_true", default=None, help="启用" + help_text)
        group.add_argument("--skip-" + name, dest=key, action="store_false", help="跳过" + help_text)
    parser.add_argument("--skip-agent-cache", action="store_true", help="跳过 Agent 缓存、Shell 快照和诊断日志")
    parser.add_argument("--agent-cache-days", dest="agent_days", type=int, help="Agent 缓存及日志保留天数，默认由配置决定")
    parser.add_argument("--download-cache-days", dest="download_days", type=int, help="下载缓存保留天数")
    parser.add_argument("--rust-target", action="append", default=[], metavar="目录", help="追加 Cargo target，只清理过期 incremental，不清 deps 或最终程序")
    parser.add_argument("--agent-hub-project", action="append", default=[], metavar="源码目录", help="追加可信任的 AgentHub 源码目录，调用其工具保留最新构建")
    cli = parser.parse_args()
    try:
        data = load_config(cli.config)
        for key in ("browser_cache", "uv_prune", "brew_cleanup", "updater_cache", "notify", "agent_days", "download_days"):
            value = getattr(cli, key)
            if value is not None:
                if key in DAY_KEYS and value < 1:
                    raise ValueError(key + " 必须为正整数。")
                data[key] = value
        data["agent_caches"] &= not cli.skip_agent_cache
        data["rust_targets"] = list(dict.fromkeys(data["rust_targets"] + cli.rust_target))
        data["agent_hub_projects"] = list(dict.fromkeys(data["agent_hub_projects"] + cli.agent_hub_project))
        if cli.workspace_only:
            if any(getattr(cli, key) is True for key in ("browser_cache", "uv_prune", "brew_cleanup", "updater_cache")) or cli.rust_target or cli.agent_hub_project:
                raise ValueError("--workspace-only 不能与其他清理项一起启用。")
            for key in ("user_caches", "agent_caches", "browser_cache", "uv_prune", "brew_cleanup", "updater_cache", "detect_workspace_builds"):
                data[key] = False
            data["rust_targets"], data["agent_hub_projects"] = [], []
            data["notify"] = cli.notify is True
        if cli.no_tools:
            for key in ("uv_prune", "brew_cleanup", "updater_cache", "detect_workspace_builds"):
                data[key] = False
            data["rust_targets"], data["agent_hub_projects"] = [], []
        return SimpleNamespace(**data, dry_run=cli.dry_run)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error).replace(str(Path.home()), "~"))
