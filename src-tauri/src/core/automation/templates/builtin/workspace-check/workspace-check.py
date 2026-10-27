"""Inspect only the selected workspace; run manually."""
from pathlib import Path

workspace = Path.cwd()
print("Working directory:", workspace)
print("Files:")
for entry in sorted(workspace.iterdir(), key=lambda path: path.name.lower()):
    print(entry.name + ("/" if entry.is_dir() and not entry.is_symlink() else ""))
