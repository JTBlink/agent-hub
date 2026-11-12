"""Load a validated current library snapshot in memory; no copied task modules."""
import importlib.abc
import importlib.util
import json
import hashlib
from pathlib import Path
import subprocess
import sys


class Snapshot(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def __init__(self, name, directory, files):
        self.name = name
        self.directory = directory
        self.files = {item['path']: item['content'] for item in files}

    def source(self, name):
        relative = name[len(self.name):].lstrip('.').replace('.', '/')
        package = (relative + '/' if relative else '') + '__init__.py'
        return (package, True) if package in self.files else (relative + '.py', False)

    def find_spec(self, fullname, path=None, target=None):
        if fullname != self.name and not fullname.startswith(self.name + '.'):
            return None
        source, package = self.source(fullname)
        if source not in self.files:
            raise ImportError('Library module is not declared: ' + fullname)
        return importlib.util.spec_from_loader(fullname, self, is_package=package)

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        source, package = self.source(module.__name__)
        module.__file__ = str(Path(self.directory) / source)
        if package:
            module.__path__ = [str(Path(module.__file__).parent)]
        exec(compile(self.files[source], module.__file__, 'exec'), module.__dict__)


def load(name, bridge):
    module_name = '_agenthub_library_' + name.replace('-', '_') + '_' + hashlib.sha256(name.encode()).hexdigest()[:12]
    existing = sys.modules.get(module_name)
    if existing is not None:
        return existing
    result = subprocess.run([bridge, '--json', 'automations', 'libraries', 'resolve', name, '--content'],
                            capture_output=True, text=True, encoding='utf-8', check=False, timeout=45)
    if result.returncode:
        raise RuntimeError('Shared automation library is unavailable; verify its declaration and restore it before running.')
    info = json.loads(result.stdout)
    package = info['package']
    if package['manifest']['name'] != name:
        raise RuntimeError('Automation library identity mismatch.')
    finder = Snapshot(module_name, info['path'], package['files'])
    sys.meta_path.insert(0, finder)
    try:
        return __import__(module_name)
    except BaseException:
        sys.meta_path.remove(finder)
        for key in list(sys.modules):
            if key == module_name or key.startswith(module_name + '.'):
                sys.modules.pop(key, None)
        raise
