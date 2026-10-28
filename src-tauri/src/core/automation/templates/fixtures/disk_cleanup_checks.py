"""Exercise the shipped cleanup script against isolated cache trees only."""
import contextlib
import io
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

script = runpy.run_path(sys.argv[1], run_name="disk_cleanup_test_module")


class CleanupChecks(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.home = self.root / "home"
        self.workspace = self.root / "workspace"
        self.home.mkdir()
        self.workspace.mkdir()
        self.previous = Path.cwd()
        os.chdir(self.workspace)
        self.home_patch = patch.object(Path, "home", return_value=self.home)
        self.home_patch.start()

    def tearDown(self):
        self.home_patch.stop()
        os.chdir(self.previous)
        self.temporary.cleanup()

    def old(self, path, age=60, access_age=None):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"cached data")
        now = time.time()
        os.utime(path, (now - (age if access_age is None else access_age) * 86400, now - age * 86400))
        return path

    def test_formats_zero_units_and_signed_space_changes(self):
        format_size = script["human_bytes"]
        self.assertEqual(format_size(0), "0 B")
        self.assertEqual(format_size(1024), "1.00 KiB")
        self.assertEqual(format_size(1024 ** 2), "1.00 MiB")
        self.assertEqual(format_size(1024 ** 3), "1.00 GiB")
        self.assertEqual(format_size(-(1024 ** 3)), "-1.00 GiB")

    def test_cache_cleanup_preserves_recent_access_and_unlisted_environments(self):
        cache = self.home / "Library/Caches/Homebrew"
        expired = self.old(cache / "downloads/expired.tar.gz")
        recent_access = self.old(cache / "downloads/recent-access.tar.gz", access_age=1)
        recent_write = self.old(cache / "downloads/recent-write.tar.gz", age=1)
        environment = self.old(self.home / ".cache/uv/environments-v2/keep.py")
        target = script["cache_target"](cache, "downloads")
        result = script["clean_target"](target, 30, protect_access=True)
        self.assertEqual(result["removed"], 1)
        self.assertFalse(expired.exists())
        self.assertTrue(recent_access.exists())
        self.assertTrue(recent_write.exists())
        self.assertTrue(environment.exists())
        self.assertEqual(result["removed_bytes"], len(b"cached data"))

    def test_preview_reports_candidates_without_removing_files(self):
        expired = self.old(self.workspace / "tmp/expired.tmp")
        output = io.StringIO()
        before = shutil._ntuple_diskusage(500 * 1024 ** 3, 400 * 1024 ** 3, 100 * 1024 ** 3)
        with patch.object(sys, "argv", ["cleanup.py", "--dry-run", "--workspace-only"]), patch.object(shutil, "disk_usage", return_value=before), contextlib.redirect_stdout(output):
            self.assertEqual(script["main"](), 0)
        self.assertTrue(expired.exists())
        report = output.getvalue()
        self.assertIn("预览模式：不会删除任何文件", report)
        self.assertIn("总容量：500.00 GiB", report)
        self.assertIn("可用：100.00 GiB", report)
        self.assertIn("使用率：80.0%", report)
        self.assertIn("符合条件 1", report)
        self.assertIn("已删除 0 个（0 B）", report)
        self.assertNotIn(str(before.total), report)

    def test_platform_profiles_target_download_caches_only(self):
        with patch.dict(os.environ, {"LOCALAPPDATA": str(self.home / "local"), "XDG_CACHE_HOME": str(self.home / "cache")}, clear=False):
            mac = script["user_cache_rules"]("darwin")
            windows = script["user_cache_rules"]("win32")
            linux = script["user_cache_rules"]("linux")
        self.assertEqual(mac[0][1], self.home / "Library/Caches/Homebrew")
        self.assertTrue(any(root == self.home / "local/pip/Cache" for _, root, _, _ in windows))
        self.assertEqual(linux[0][1], self.home / "cache/Homebrew")
        for rules in (mac, windows, linux):
            self.assertFalse(any("uv" in root.parts or "Google" in root.parts for _, root, _, _ in rules))
            self.assertTrue(all(child in ("downloads", "http", "http-v2", "content-v2", "tmp") for _, _, child, _ in rules))

    def test_rejects_home_and_path_escape_rules(self):
        for root, child in [(self.home, "Downloads"), (self.home / ".cache", "../Documents"), (self.root, "outside"), (self.home / ".cache", str(self.root))]:
            with self.assertRaises(ValueError):
                script["cache_target"](root, child)

    @unittest.skipUnless(os.name != "nt", "symlink/hardlink tests use Unix fixture permissions")
    def test_links_and_hardlinks_cannot_delete_other_data(self):
        root = self.home / "cache"
        root.mkdir()
        outside = self.old(self.root / "outside/keep")
        (root / "linked").symlink_to(outside.parent, target_is_directory=True)
        with self.assertRaises(ValueError):
            script["cache_target"](root, "linked")
        target = root / "downloads"
        target.mkdir()
        (target / "nested-link").symlink_to(outside.parent, target_is_directory=True)
        os.link(outside, target / "hardlink")
        result = script["clean_target"](target, 30)
        self.assertEqual(result["removed"], 0)
        self.assertTrue(outside.is_file())
        self.assertTrue((target / "hardlink").exists())

    def test_unreadable_directory_does_not_cancel_other_targets(self):
        target = self.workspace / "tmp"
        expired = self.old(target / "expired.tmp")
        (target / "blocked").mkdir()
        original = os.scandir

        def scan(path):
            if Path(path).name == "blocked":
                raise PermissionError("fixture denial")
            return original(path)

        with patch.object(os, "scandir", scan):
            result = script["clean_target"](target, 7)
        self.assertEqual(result["removed"], 1)
        self.assertEqual(result["errors"], 1)
        self.assertFalse(expired.exists())

    def run_main(self, *arguments):
        output = io.StringIO()
        with patch.object(sys, "argv", ["cleanup.py", *arguments]), contextlib.redirect_stdout(output):
            status = script["main"]()
        return status, output.getvalue()

    def test_default_cleans_expired_custom_npm_content_but_keeps_tool_installations(self):
        expired = self.old(self.home / ".cache/npm-hermes/_cacache/content-v2/expired")
        active = self.old(self.home / ".cache/npm-hermes/_cacache/content-v2/active", access_age=1)
        tool = self.old(self.home / ".cache/npm-hermes/_npx/tool/index.js")
        status, output = self.run_main()
        self.assertEqual(status, 0, output)
        self.assertFalse(expired.exists())
        self.assertTrue(active.exists() and tool.exists())
        self.assertIn("清理总结", output)
        self.assertIn("npm-hermes 下载缓存：已删除 1 个文件", output)
        self.assertIn("磁盘可用空间：", output)

    def test_empty_summary_is_chinese_and_does_not_claim_freed_space(self):
        status, output = self.run_main("--workspace-only")
        self.assertEqual(status, 0)
        for text in ["清理后磁盘空间：", "总容量：", "已用：", "可用：", "使用率：", "已扫描 0 个", "符合条件 0 个", "已删除 0 个", "文件清理规则未匹配到过期文件。", "可用空间变化："]:
            self.assertIn(text, output)
        self.assertNotIn("Summary:", output)
        self.assertNotIn("Disk space", output)
        self.assertNotIn("释放了", output)

    def test_browser_cleanup_is_opt_in_and_never_targets_profile_data(self):
        base = self.home / "Library/Caches/Google/Chrome/Default"
        expired = self.old(base / "Cache/old")
        code = self.old(base / "Code Cache/js/old")
        storage = self.old(base / "Storage/keep")
        cookies = self.old(base / "Cookies")
        status, _ = self.run_main()
        self.assertEqual(status, 0)
        self.assertTrue(expired.exists())
        with patch.dict(script["main"].__globals__, {"processes_running": lambda _: False}), patch.object(sys, "platform", "darwin"):
            status, output = self.run_main("--browser-cache")
        self.assertEqual(status, 0, output)
        self.assertFalse(expired.exists() or code.exists())
        self.assertTrue(storage.exists() and cookies.exists())

    def test_running_browsers_and_compilers_are_skipped(self):
        with patch.dict(script["main"].__globals__, {"processes_running": lambda _: True}):
            status, output = self.run_main("--browser-cache", "--rust-target", str(self.home / "project/target"))
        self.assertEqual(status, 0, output)
        self.assertIn("请先完全退出 Chrome 和 Edge", output)
        self.assertIn("检测到编译进程", output)

    def test_incremental_cleanup_keeps_recent_files_and_dependencies(self):
        project = self.home / "project"
        project.mkdir()
        (project / "Cargo.toml").write_text("[package]\nname='demo'\n")
        target = project / "target"
        expired = self.old(target / "debug/incremental/old")
        active = self.old(target / "debug/incremental/active", access_age=1)
        dependency = self.old(target / "debug/deps/keep.rlib")
        with patch.dict(script["main"].__globals__, {"processes_running": lambda _: False}):
            status, output = self.run_main("--rust-target", str(target))
        self.assertEqual(status, 0, output)
        self.assertFalse(expired.exists())
        self.assertTrue(active.exists() and dependency.exists())
        with self.assertRaises(ValueError):
            script["incremental_rules"](self.home)

    def test_tool_preview_never_executes_uv_and_summary_distinguishes_external_results(self):
        with patch.object(subprocess, "run") as runner:
            status, output = self.run_main("--dry-run", "--uv-prune")
        self.assertEqual(status, 0, output)
        runner.assert_not_called()
        self.assertIn("仅预览，未删除文件", output)
        self.assertIn("工具不支持预览", output)
        self.assertIn("未计入下方文件统计", output)

    def test_tool_failure_does_not_prevent_later_tools_and_fails_exit_status(self):
        calls = []

        def tool(label, *args, **kwargs):
            calls.append(label)
            if label.startswith("uv"):
                raise OSError("fixture failure")
            return label, "清理完成"

        with patch.dict(script["main"].__globals__, {"run_tool": tool}):
            status, output = self.run_main("--uv-prune", "--brew-cleanup")
        self.assertEqual(status, 1)
        self.assertEqual(len(calls), 2)
        self.assertIn("部分清理失败", output)
        self.assertIn("Homebrew 历史下载与版本：清理完成", output)

    def test_workspace_only_cannot_accidentally_enable_external_cleanup(self):
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            self.run_main("--workspace-only", "--brew-cleanup")

    def test_project_prune_uses_existing_tool_and_scopes_target_in_preview(self):
        project = self.home / "demo project"
        (project / "scripts").mkdir(parents=True)
        (project / "scripts/build.mjs").write_text("// fixture")
        (project / "src-tauri").mkdir()
        (project / "src-tauri/Cargo.toml").write_text("// fixture")
        calls = []

        def tool(label, command, dry_run, **options):
            calls.append((command, dry_run, options))
            return label, "预览完成"

        with patch.dict(script["main"].__globals__, {"run_tool": tool}):
            status, output = self.run_main("--dry-run", "--agent-hub-project", str(project))
        self.assertEqual(status, 0, output)
        self.assertEqual(calls[0][0], ["node", str(project / "scripts/build.mjs"), "prune", "--dry-run"])
        self.assertEqual(calls[0][2]["cwd"], project)
        self.assertEqual(calls[0][2]["env"]["CARGO_TARGET_DIR"], str(project / "src-tauri/target"))
        self.assertIn("未计入下方文件统计", output)


unittest.main(argv=["disk-cleanup-tests"])
