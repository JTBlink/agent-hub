"""Exercise the complete installed bundle against isolated home/workspace trees."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import plistlib
import runpy
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

entry = runpy.run_path(sys.argv[1], run_name="cleanup_test_entry")
import cleanup_config as config
import cleanup_files as files
import cleanup_rules as rules
import cleanup_actions as actions
import cleanup_report as report
bundle_config = config.load_config(Path(sys.argv[1]).with_name("cleanup-config.json"))


class CleanupChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.home, self.workspace = self.root / "home", self.root / "workspace"
        self.home.mkdir()
        self.workspace.mkdir()
        self.previous = Path.cwd()
        os.chdir(self.workspace)
        self.home_patch = patch.object(Path, "home", return_value=self.home)
        self.home_patch.start()
        self.env_patch = patch.dict(os.environ, {
            "CODEX_HOME": str(self.home / ".codex"), "CLAUDE_CONFIG_DIR": str(self.home / ".claude"),
            "HERMES_HOME": str(self.home / ".hermes"), "XDG_DATA_HOME": str(self.home / ".local/share"),
            "XDG_CACHE_HOME": str(self.home / ".cache"), "LOCALAPPDATA": str(self.home / "local"),
        })
        self.env_patch.start()
        self.settings = copy.deepcopy(bundle_config)
        for key in ("browser_cache", "uv_prune", "brew_cleanup", "updater_cache", "notify", "detect_workspace_builds"):
            self.settings[key] = False
        self.config_path = self.workspace / "config.json"

    def tearDown(self):
        self.env_patch.stop()
        self.home_patch.stop()
        os.chdir(self.previous)
        self.temp.cleanup()

    def old(self, path, age=60, access_age=None):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"cached data")
        now = time.time()
        os.utime(path, (now - (age if access_age is None else access_age) * 86400, now - age * 86400))
        return path

    def run_main(self, *args):
        self.config_path.write_text(json.dumps(self.settings), encoding="utf-8")
        output = io.StringIO()
        with patch.object(sys, "argv", ["cleanup.py", "--config", str(self.config_path), *args]), contextlib.redirect_stdout(output):
            status = entry["main"]()
        return status, output.getvalue()

    def test_template_enables_safe_automatic_categories_and_notifications(self):
        for key in ("user_caches", "agent_caches", "browser_cache", "uv_prune", "brew_cleanup", "updater_cache", "notify"):
            self.assertTrue(bundle_config[key], key)
        self.assertEqual(bundle_config["download_days"], 7)
        self.assertEqual(bundle_config["agent_days"], 7)
        self.assertEqual(bundle_config["rust_targets"], [])
        self.assertEqual(bundle_config["agent_hub_projects"], [])

    def test_cache_profiles_use_known_roots_on_each_platform(self):
        mac = rules.user_cache_rules("darwin")
        windows = rules.user_cache_rules("win32")
        linux = rules.user_cache_rules("linux")
        self.assertEqual(mac[0][1], self.home / "Library/Caches/Homebrew")
        self.assertTrue(any(root == self.home / "local/pip/Cache" for _, root, _, _ in windows))
        self.assertEqual(linux[0][1], self.home / ".cache/Homebrew")
        for profile in (mac, windows, linux):
            self.assertTrue(all(child in ("downloads", "http", "http-v2", "content-v2", "tmp", "electron", "electron-builder") for _, _, child, _ in profile))
            self.assertFalse(any("uv" in root.parts or "Google" in root.parts for _, root, _, _ in profile))

    def test_formats_sizes_and_chinese_preview_without_claiming_freed_space(self):
        self.assertEqual(files.human_bytes(1024 ** 3), "1.00 GiB")
        self.assertEqual(files.human_bytes(-1024), "-1.00 KiB")
        expired = self.old(self.workspace / "tmp/old")
        usage = shutil._ntuple_diskusage(500 * 1024 ** 3, 400 * 1024 ** 3, 100 * 1024 ** 3)
        with patch.object(shutil, "disk_usage", return_value=usage):
            status, output = self.run_main("--dry-run", "--workspace-only")
        self.assertEqual(status, 0)
        self.assertTrue(expired.exists())
        for text in ("总容量：500.00 GiB", "可用：100.00 GiB", "使用率：80.0%", "预计删除 1 个文件", "已删除 0 个（0 B）", "清理总结", "可用空间变化："):
            self.assertIn(text, output)
        self.assertNotIn("Summary:", output)

    def test_download_cleanup_keeps_recent_access_and_npx_installations(self):
        expired = self.old(self.home / ".cache/npm-hermes/_cacache/content-v2/old", age=8)
        active = self.old(expired.parent / "active", age=8, access_age=1)
        installed = self.old(self.home / ".cache/npm-hermes/_npx/tool/keep.js")
        status, output = self.run_main()
        self.assertEqual(status, 0, output)
        self.assertFalse(expired.exists())
        self.assertTrue(active.exists() and installed.exists())
        self.assertIn("npm-hermes 下载缓存：已删除 1 个文件", output)

    def test_agent_defaults_preserve_conversations_databases_credentials_and_skills(self):
        old, keep = [], []
        for _, root, child, _, protect_access in rules.agent_cache_rules():
            old.append(self.old(root / child / "old.log", age=8))
            keep.append(self.old(root / child / "recent.log", age=6))
            if protect_access:
                keep.append(self.old(root / child / "access.cache", age=8, access_age=1))
        for name in (".codex/sessions/a.jsonl", ".codex/archived_sessions/a.jsonl", ".codex/auth.json", ".codex/state.sqlite", ".codex/skills/a/SKILL.md", ".claude/projects/a.jsonl", ".claude/file-history/a", ".hermes/sessions/a.json", ".hermes/state.db", ".local/share/opencode/opencode.db", ".local/share/opencode/snapshot/a"):
            keep.append(self.old(self.home / name))
        status, output = self.run_main()
        self.assertEqual(status, 0, output)
        self.assertTrue(all(not p.exists() for p in old))
        self.assertTrue(all(p.exists() for p in keep))
        self.assertIn("Hermes 运行日志：已删除 1 个文件", output)

    def test_agent_retention_override_and_skip(self):
        log = self.old(self.home / ".codex/log/old.log", age=8, access_age=1)
        self.assertEqual(self.run_main("--skip-agent-cache")[0], 0)
        self.assertTrue(log.exists())
        self.assertEqual(self.run_main("--agent-cache-days", "14")[0], 0)
        self.assertTrue(log.exists())
        self.assertEqual(self.run_main()[0], 0)
        self.assertFalse(log.exists())
        for days in ("0", "-1", "1.5"):
            with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
                self.run_main("--agent-cache-days", days)

    def test_custom_agent_homes_respect_boundary(self):
        root = self.home / "custom"
        old = self.old(root / "log/old", age=8)
        keep = self.old(self.home / ".codex/log/keep", age=8)
        with patch.dict(os.environ, {"CODEX_HOME": str(root)}):
            self.assertEqual(self.run_main()[0], 0)
        self.assertFalse(old.exists())
        self.assertTrue(keep.exists())
        outside = self.old(self.root / "outside/log/keep")
        with patch.dict(os.environ, {"CODEX_HOME": str(outside.parent.parent)}):
            self.assertEqual(self.run_main()[0], 1)
        self.assertTrue(outside.exists())

    def test_workspace_only_never_runs_configured_tools_or_notifications(self):
        self.settings.update({key: True for key in ("browser_cache", "uv_prune", "brew_cleanup", "updater_cache", "notify")})
        outside = self.old(self.home / ".hermes/logs/keep")
        with patch.object(actions, "run_tool") as tool, patch.dict(entry["main"].__globals__, {"send_notification": unittest.mock.Mock()}) as namespace:
            status, output = self.run_main("--workspace-only")
            self.assertEqual(status, 0, output)
            tool.assert_not_called()
            namespace["send_notification"].assert_not_called()
        self.assertTrue(outside.exists())
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            self.run_main("--workspace-only", "--brew-cleanup")

    def test_browser_only_cleans_cache_and_code_cache_after_exit(self):
        self.settings["browser_cache"] = True
        base = self.home / "Library/Caches/Google/Chrome/Default"
        old = self.old(base / "Cache/old", age=8)
        code = self.old(base / "Code Cache/js/old", age=8)
        keep = [self.old(base / name) for name in ("Storage/keep", "Cookies")]
        with patch.object(sys, "platform", "darwin"), patch.object(actions, "processes_running", return_value=True):
            self.assertEqual(self.run_main()[0], 0)
        self.assertTrue(old.exists())
        with patch.object(sys, "platform", "darwin"), patch.object(actions, "processes_running", return_value=False):
            self.assertEqual(self.run_main()[0], 0)
        self.assertFalse(old.exists() or code.exists())
        self.assertTrue(all(p.exists() for p in keep))

    def test_incremental_cleanup_preserves_recent_files_dependencies_and_binaries(self):
        project = self.home / "project"
        old = self.old(project / "target/debug/incremental/old", age=8)
        (project / "Cargo.toml").write_text("[package]\nname='demo'\n")
        keep = [self.old(project / name, age=1 if "recent" in name else 60) for name in ("target/debug/incremental/recent", "target/debug/deps/keep.rlib", "target/debug/demo")]
        self.settings["rust_targets"] = [str(project / "target")]
        with patch.object(actions, "processes_running", return_value=True):
            self.assertEqual(self.run_main()[0], 0)
        self.assertTrue(old.exists())
        with patch.object(actions, "processes_running", return_value=False):
            self.assertEqual(self.run_main()[0], 0)
        self.assertFalse(old.exists())
        self.assertTrue(all(p.exists() for p in keep))
        with self.assertRaises(ValueError):
            rules.incremental_rules(self.home)

    def test_project_pruning_reuses_trusted_helper_with_scoped_target(self):
        project = self.home / "project with spaces"
        self.old(project / "scripts/build.mjs")
        self.old(project / "src-tauri/Cargo.toml")
        self.settings["agent_hub_projects"] = [str(project)]
        with patch.object(actions, "run_tool", return_value=("项目", "预览完成")) as tool:
            status, output = self.run_main("--dry-run")
        self.assertEqual(status, 0, output)
        call = tool.call_args
        self.assertEqual(call.args[1], ["node", str(project / "scripts/build.mjs"), "prune", "--dry-run"])
        self.assertEqual(call.kwargs["env"]["CARGO_TARGET_DIR"], str(project / "src-tauri/target"))

    def test_default_tool_actions_can_run_without_force_install_or_network_update(self):
        self.settings.update(uv_prune=True, brew_cleanup=True)
        with patch.object(actions, "run_tool", side_effect=lambda label, *_args, **_kwargs: (label, "清理完成")) as tool:
            self.assertEqual(self.run_main()[0], 0)
        commands = [call.args[1] for call in tool.call_args_list]
        self.assertIn(["uv", "cache", "prune", "--offline", "--no-python-downloads"], commands)
        self.assertIn(["brew", "cleanup", "--prune=7"], commands)
        self.assertEqual(tool.call_args_list[-1].kwargs["env"]["HOMEBREW_NO_AUTO_UPDATE"], "1")
        self.assertFalse(any("--force" in command for command in commands))

    def test_uv_preview_is_noop_and_failure_does_not_block_later_tools(self):
        with patch.object(subprocess, "run") as runner:
            status, output = self.run_main("--dry-run", "--uv-prune")
        self.assertEqual(status, 0, output)
        runner.assert_not_called()
        self.assertIn("工具不支持预览", output)
        def tool(label, *_args, **_kwargs):
            if label.startswith("uv"):
                raise OSError("fixture")
            return label, "清理完成"
        with patch.object(actions, "run_tool", side_effect=tool) as runner:
            status, output = self.run_main("--uv-prune", "--brew-cleanup")
        self.assertEqual(status, 1)
        self.assertEqual(runner.call_count, 2)
        self.assertIn("部分清理失败", output)

    def test_invalid_config_fails_before_cleaning_and_installed_marker_is_supported(self):
        config_path = self.workspace / "marked.json"
        config_path.write_text('# AgentHub automation script: agent_hub:test\n' + json.dumps(self.settings), encoding="utf-8")
        self.assertEqual(config.load_config(config_path), self.settings)
        keep = self.old(self.workspace / "tmp/keep")
        for key, value in (("agent_days", 0), ("uv_prune", "true"), ("unknown", True)):
            current = copy.deepcopy(self.settings)
            current[key] = value
            config_path.write_text(json.dumps(current))
            with self.assertRaises(ValueError):
                config.load_config(config_path)
        self.assertTrue(keep.exists())

    @unittest.skipUnless(os.name != "nt", "Unix links fixture")
    def test_links_hardlinks_and_linked_agent_roots_preserve_other_data(self):
        outside = self.old(self.root / "outside/keep")
        root = self.home / ".codex"
        root.symlink_to(outside.parent, target_is_directory=True)
        self.assertEqual(self.run_main()[0], 1)
        self.assertTrue(outside.exists())
        root.unlink()
        target = self.home / "cache/downloads"
        target.mkdir(parents=True)
        os.link(outside, target / "hardlink")
        (target / "link").symlink_to(outside)
        self.assertEqual(files.clean_target(target, 7)["removed"], 0)
        self.assertEqual(files.clean_target(target, 7, allow_hardlinks=True)["removed"], 1)
        self.assertTrue(outside.exists())
        self.assertFalse((target / "hardlink").exists())
        for parent, child in [(self.home, "Downloads"), (self.home / "cache", "../Documents"), (self.root, "outside")]:
            with self.assertRaises(ValueError):
                files.cache_target(parent, child)

    def test_only_confirmed_installed_old_update_packages_are_eligible(self):
        root = self.home / "Library/Caches/com.microsoft.VSCode.ShipIt"
        for name, version in (("old", "1.0"), ("pending", "3.0")):
            info = root / ("update." + name) / "Visual Studio Code.app/Contents/Info.plist"
            info.parent.mkdir(parents=True)
            info.write_bytes(plistlib.dumps({"CFBundleIdentifier": "demo", "CFBundleVersion": version}))
        installed = {"CFBundleIdentifier": "demo", "CFBundleVersion": "2.0"}
        with patch.object(sys, "platform", "darwin"), patch.object(actions, "processes_running", return_value=False), patch.object(actions, "installed_app_info", return_value=installed), patch.object(time, "time", return_value=time.time() + 10 * 86400):
            selected, notices = actions.updater_rules(7)
        self.assertEqual([r[2] for r in selected], ["update.old"])
        self.assertTrue(any("待安装" in status for _, status in notices))
        self.assertTrue((root / "update.pending/Visual Studio Code.app/Contents/Info.plist").exists())

    def test_notifications_use_safe_arguments_and_preview_suppresses_delivery(self):
        self.settings["notify"] = True
        notice = unittest.mock.Mock(return_value=False)
        with patch.dict(entry["main"].__globals__, {"send_notification": notice}):
            self.assertEqual(self.run_main("--dry-run")[0], 0)
            notice.assert_not_called()
            self.assertEqual(self.run_main()[0], 0)
            notice.assert_called_once()
        title, body = "清理完成", "可用空间 +1 GiB；测试 ' $()"
        for platform in ("darwin", "linux", "win32"):
            command, env = report.notification_command(title, body, platform)
            if platform == "win32":
                self.assertNotIn(body, command[-1])
                self.assertEqual(env["AGENT_HUB_NOTICE_BODY"], body)
            else:
                self.assertIn(body, command)
        with patch.object(shutil, "which", return_value=None), contextlib.redirect_stdout(io.StringIO()):
            usage = shutil.disk_usage(self.workspace)
            self.assertFalse(report.send_notification(files.counters(), [], usage, usage, False))


unittest.main(argv=["disk-cleanup-tests"])
