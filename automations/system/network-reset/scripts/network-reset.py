"""Invoke the administrator-installed, argument-free network reset runner."""
from pathlib import Path
import subprocess
import json
import os
import re
import sys

ROOT = Path("/Library/PrivilegedHelperTools/agent-hub-network-reset")
RUNNER = ROOT / "run"  # Legacy tasks retain their administrator-installed entry.
TASK = Path(os.environ.get("AGENT_HUB_TASK_DIR", str(Path(__file__).resolve().parent.parent)))
try:
    identity = json.loads((TASK / "task.json").read_text())["instance_id"]
    if re.fullmatch(r"agent_hub:[0-9a-fA-F-]{36}", identity):
        RUNNER = ROOT / identity.removeprefix("agent_hub:") / "run"
except (OSError, ValueError, KeyError, TypeError):
    pass


def main():
    if sys.platform != "darwin":
        raise SystemExit("此模板仅支持 macOS。")
    if sys.argv[1:] == ["--dry-run"]:
        print("预览：调用已安装的网络重置入口，关闭指定网络服务后自动恢复；本次不修改网络。")
        return
    if len(sys.argv) != 1:
        raise SystemExit("仅支持 --dry-run 预览参数。")
    if not RUNNER.is_file():
        raise SystemExit("请先在 AgentHub 安装此任务；旧任务可执行 sudo /bin/bash scripts/setup.sh，完成后再启用计划。")
    result = subprocess.run(["/usr/bin/sudo", "-n", str(RUNNER)], check=False)
    if result.returncode:
        raise SystemExit("网络重置失败；检查运行日志，必要时重新执行 setup.sh。")


if __name__ == "__main__":
    main()
