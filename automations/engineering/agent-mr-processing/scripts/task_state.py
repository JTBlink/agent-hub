"""Compatibility import of AgentHub's single shared state implementation."""
import json
import os
from pathlib import Path
import runpy
import subprocess

bridge = os.environ.get('AGENT_HUB_CLI')
if not bridge:
    directory = Path.home() / '.agent-hub/bin'
    binary = directory / ('agent-hub-cli.exe' if os.name == 'nt' else 'agent-hub-cli')
    stamp = directory / '.version'
    if not binary.is_file() or not stamp.is_file() or not stamp.stat().st_size:
        raise RuntimeError('AgentHub CLI bridge 未就绪，请打开或更新 AgentHub 后重试。')
    bridge = str(binary)
result = subprocess.run([bridge, '--json', 'agents', 'launch', 'runtime', 'state-store'],
                        capture_output=True, encoding='utf-8', check=False)
if result.returncode:
    raise RuntimeError(result.stderr.strip() or '共享状态模块不可用，请更新 AgentHub CLI。')
TaskState = runpy.run_path(json.loads(result.stdout)['path'])['TaskState']
