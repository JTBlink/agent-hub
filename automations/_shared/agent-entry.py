"""Task entry; Agent lifecycle belongs to the independent Herdr runtime."""
from pathlib import Path
import runpy
import subprocess
import sys

_runtime = runpy.run_path(str(Path(__file__).with_name("herdr_agent.py")))
main = _runtime["main"]

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (_runtime["HerdrError"], OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        sys.exit(f"Herdr 任务未完成：{str(error).rstrip('。')}。保留现有会话，不自动重发或回答审批。")
