"""Permission regressions run only against this process's temporary home."""
import contextlib
import errno
import io
import os
from pathlib import Path
import runpy
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

script = runpy.run_path(sys.argv[1], run_name="cleanup_permission_test")


class PermissionChecks(unittest.TestCase):
    def run_cleanup(self, error, workspace_only=False, blocked_directory=False, deny_unlink=False):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary) / "home"
            workspace = Path(temporary) / "workspace"
            workspace.mkdir()
            cache = home / "cache" / "downloads"
            target = workspace / "tmp" if workspace_only else cache
            target.mkdir(parents=True)
            for name in ["allowed.tmp", "protected.tmp"]:
                path = target / name
                path.write_text("fixture")
                old = time.time() - 90 * 86400
                os.utime(path, (old, old))
            original_metadata = script["entry_metadata"]
            original_scan = os.scandir
            original_unlink = Path.unlink

            def metadata(entry):
                if entry.name == "protected.tmp" and not deny_unlink:
                    raise error
                return original_metadata(entry)

            def scan(path):
                if blocked_directory and Path(path) == target:
                    raise error
                return original_scan(path)

            def unlink(path, *args, **kwargs):
                if deny_unlink and path == target / "protected.tmp":
                    raise error
                return original_unlink(path, *args, **kwargs)

            namespace = script["main"].__globals__
            output = io.StringIO()
            previous = Path.cwd()
            try:
                os.chdir(workspace)
                with patch.object(Path, "home", return_value=home), patch.dict(namespace, {
                    "entry_metadata": metadata,
                    "user_cache_rules": lambda: [("Fixture downloads", cache.parent, "downloads", 30)],
                    "agent_cache_rules": lambda _days: [],
                }), patch.object(os, "scandir", scan), patch.object(Path, "unlink", unlink), patch.object(sys, "argv", ["cleanup.py"] + (["--workspace-only"] if workspace_only else [])), contextlib.redirect_stdout(output):
                    status = script["main"]()
                return status, output.getvalue(), (target / "allowed.tmp").exists(), (target / "protected.tmp").exists()
            finally:
                os.chdir(previous)

    def test_optional_cache_permission_denials_are_warnings(self):
        status, output, allowed, protected = self.run_cleanup(PermissionError("fixture denial"))
        self.assertEqual(status, 0, output)
        self.assertFalse(allowed)
        self.assertTrue(protected)
        self.assertIn("警告 1", output)
        self.assertIn("错误 0", output)
        self.assertIn("~/cache/downloads/protected.tmp", output.replace("\\", "/"))

    def test_optional_cache_unreadable_directory_is_skipped(self):
        status, output, allowed, protected = self.run_cleanup(PermissionError("fixture denial"), blocked_directory=True)
        self.assertEqual(status, 0, output)
        self.assertTrue(allowed and protected)
        self.assertIn("警告 1", output)

    def test_optional_cache_unlink_denial_keeps_the_file_and_reports_partial_cleanup(self):
        status, output, allowed, protected = self.run_cleanup(PermissionError("fixture denial"), deny_unlink=True)
        self.assertEqual(status, 0, output)
        self.assertFalse(allowed)
        self.assertTrue(protected)
        self.assertIn("符合条件 2", output)
        self.assertIn("已删除 1", output)
        self.assertIn("跳过 1 | 警告 1 | 错误 0", output)

    def test_real_io_errors_still_fail(self):
        status, output, _, protected = self.run_cleanup(OSError(errno.EIO, "fixture I/O failure"))
        self.assertEqual(status, 1, output)
        self.assertTrue(protected)
        self.assertIn("错误 1", output)

    def test_workspace_permission_denials_still_fail(self):
        status, output, _, protected = self.run_cleanup(PermissionError("fixture denial"), workspace_only=True)
        self.assertEqual(status, 1, output)
        self.assertTrue(protected)
        self.assertIn("错误 1", output)


unittest.main(argv=["cleanup-permission-tests"])
