import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from check_task_files import check


class TaskFilesTests(unittest.TestCase):
    def test_file_boundaries_and_invalid_contents(self):
        cases = [
            ([{"path": "a.md", "content": "x" * 65536}], 0, "0 bytes remaining"),
            ([{"path": "a.md", "content": "中" * 21846}], 1, "65538"),
            ([{"path": "a.py", "content": "x"}] * 2, 1, "duplicate"),
            ([{"path": "a.py", "content": " \n"}], 1, "empty"),
            ([{"path": "a.py", "content": "x\0"}], 1, "NUL"),
            ([{"path": "../a.py", "content": "x"}], 1, "invalid"),
            ([{"path": "a.txt", "content": "x"}], 1, "invalid"),
            ([{"path": "config/prompt-variants.json", "content": "x" * 70000}], 0, "passed"),
            ([{"path": f"{i}.md", "content": "x" * 65536} for i in range(17)], 1, "total"),
            ([{"path": f"{i}.md", "content": "x"} for i in range(65)], 1, "exceeds 64"),
        ]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "draft.json"
            for files, expected, message in cases:
                with self.subTest(message=message):
                    source.write_text(json.dumps({"content": "echo ok", "files": files}))
                    self.assert_result(source, expected, message)

    def assert_result(self, source, expected, message):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(check(source), expected)
        self.assertIn(message, output.getvalue())

    def test_package_reads_actual_declared_file_and_rejects_links(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "config").mkdir()
            (root / "config/task.json").write_text(json.dumps({
                "draft": {"content": "echo ok"}, "files": ["a.py"],
            }))
            script = root / "a.py"
            script.write_text("print(1)")
            self.assert_result(root, 0, "passed")
            script.write_bytes(b"\xff")
            self.assert_result(root, 1, "utf-8")
            script.unlink()
            script.symlink_to(root / "config/task.json")
            self.assert_result(root, 1, "nonlinked")


if __name__ == "__main__":
    unittest.main()
