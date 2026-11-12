import json
from pathlib import Path
import runpy
import sys
from types import SimpleNamespace
from unittest.mock import patch

load = runpy.run_path(sys.argv[1])['load']
value = '原始'

def resolve(argv, **options):
    name = argv[-2]
    code = f"value = {value!r}\n"
    package = dict(manifest=dict(name=name), files=[
        dict(path='__init__.py', content='from .client import value\n'),
        dict(path='client.py', content=code),
    ])
    payload = json.dumps(dict(path='/unused', package=package), ensure_ascii=False).encode('utf-8')
    return SimpleNamespace(returncode=0, stdout=payload.decode(options.get('encoding', 'latin1')))

with patch('subprocess.run', side_effect=resolve) as cli:
    original = load('example-platform', 'fake-cli')
    assert original.value == '原始'
    value = 'updated'
    assert load('example-platform', 'fake-cli').value == '原始'
    assert cli.call_count == 1
    assert load('example_platform', 'fake-cli').value == 'updated'
    assert load('example-platform', 'fake-cli') is not load('example_platform', 'fake-cli')
    try:
        __import__(original.__name__ + '.undeclared')
        raise AssertionError('undeclared module was accepted')
    except ImportError:
        pass
print('PASS: one source snapshot per process, stable relative imports, unique names, no undeclared source fallback')
