"""Exercise public storage/locking behavior, including a terminated lock owner."""
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile

module = Path(sys.argv.pop())
store = runpy.run_path(str(module))
with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    state = store['TaskState'](root)
    with state.extension('one') as data:
        data['attempts'] = 3
    with state.extension('two') as data:
        data['verdict'] = 'pending'
    try:
        with state.extension('one') as data:
            data['attempts'] = 0
            raise ValueError('abort transaction')
    except ValueError:
        pass
    assert json.loads(state.path.read_text())['extensions'] == {'one': {'attempts': 3}, 'two': {'verdict': 'pending'}}
    assert not (root / '.task-state.lock').exists()
    lock = root / 'execution.lock'
    child = subprocess.Popen([sys.executable, '-c',
        "import runpy,sys; m=runpy.run_path(sys.argv[1]); "
        "guard=m['RunLock'](sys.argv[2]); assert guard.__enter__(); "
        "print('acquired',flush=True); sys.stdin.read()", str(module), str(lock)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        assert child.stdout.readline().strip() == 'acquired'
        with store['RunLock'](lock) as acquired:
            assert acquired is False
        child.terminate()
        child.wait(timeout=5)
        with store['RunLock'](lock) as acquired:
            assert acquired is True
    finally:
        if child.poll() is None:
            child.kill()
        child.communicate()
