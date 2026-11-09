"""Thin task adapter for AgentHub's shared Agent executor; no lifecycle logic lives here."""
import json
import os
from pathlib import Path
import subprocess
import sys


def cli():
    explicit = os.environ.get('AGENT_HUB_CLI')
    if explicit:
        return explicit
    directory = Path.home() / '.agent-hub/bin'
    binary = directory / ('agent-hub-cli.exe' if os.name == 'nt' else 'agent-hub-cli')
    stamp = directory / '.version'
    if not binary.is_file() or not stamp.is_file() or not stamp.stat().st_size:
        raise RuntimeError('AgentHub CLI bridge 未就绪，请打开或更新 AgentHub 后重试。')
    return str(binary)


def main(prompt_context=''):
    here = Path(__file__).resolve().parent
    task = Path(os.environ.get('AGENT_HUB_TASK_DIR', str(here.parent if here.name == 'scripts' else here)))
    config = task / 'config/herdr.json'
    prompt = Path(os.environ.get('AGENT_HUB_PROMPT_FILE', str(task / 'prompts/prompt.md')))
    request = dict(config_file=str(config if config.exists() else task / 'herdr.json'),
                   prompt_file=str(prompt if prompt.exists() else task / 'prompt.md'),
                   state_directory=os.environ.get('AGENT_HUB_STATE_DIR', str(task / '.local/state' if here.name == 'scripts' else here)),
                   identity_directory=str(here), workdir=str(Path.cwd().resolve()), prompt_context=prompt_context)
    return subprocess.run([cli(), 'agents', 'launch', 'execute'],
                          input=json.dumps(request), encoding='utf-8', check=False).returncode


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError) as error:
        sys.exit(str(error))
