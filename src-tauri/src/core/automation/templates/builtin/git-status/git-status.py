"""Show Git changes and recent commits without modifying the repository."""
import shutil
import subprocess
import sys

if not shutil.which("git"):
    sys.exit("Git is required for this template.")
if subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], capture_output=True).returncode:
    print("Choose a Git working directory to inspect repository status.")
else:
    for arguments in (["status", "--short"], ["log", "-5", "--oneline"]):
        subprocess.run(["git", *arguments], check=True)
