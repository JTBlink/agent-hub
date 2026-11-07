"""Check the portable task adapter without launching an Agent or a model."""
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
from unittest.mock import patch

script = Path(sys.argv.pop()).resolve()
project = script.parent.parent / 'selected-project'
project.mkdir()
with patch.dict(os.environ, {'AGENT_HUB_CLI': 'fixture-cli'}, clear=True):
    module = runpy.run_path(str(script))
    with patch('pathlib.Path.cwd', return_value=project), patch('subprocess.run') as run:
        run.return_value = subprocess.CompletedProcess([], 0)
        assert module['main'](prompt_context='immutable business context') == 0
        args, = run.call_args.args
        assert args == ['fixture-cli', 'agents', 'launch', 'execute']
        request = json.loads(run.call_args.kwargs['input'])
        assert request['workdir'] == str(project)
        assert request['identity_directory'] == str(script.parent)
        assert request['prompt_context'] == 'immutable business context'
        assert request['state_directory'] == str(script.parent.parent / '.local/state')
        assert not run.call_args.kwargs.get('shell')
