"""Task-local extension storage; never declare its output in portable task files."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import tempfile


class RunLock:
    """Process-owned, nonblocking execution lock; crashes release it on every backend."""
    def __init__(self, path):
        self.path = Path(path)
        self.handle = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.is_symlink():
            raise RuntimeError('执行锁不能是符号链接。')
        flags = os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0)
        self.handle = os.fdopen(os.open(self.path, flags, 0o600), 'r+b')
        try:
            if os.name == 'nt':
                import msvcrt
                if os.fstat(self.handle.fileno()).st_size == 0:
                    self.handle.write(b'\0')
                    self.handle.flush()
                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            self.handle.close()
            self.handle = None
            if error.errno not in (11, 13, 35, 36):
                raise
            return False
        return True

    def __exit__(self, *unused):
        if self.handle is not None:
            self.handle.close()


class TaskState:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.path = self.directory / 'task-state.json'

    @contextmanager
    def extension(self, namespace):
        if not re.fullmatch(r'[a-z][a-z0-9_]{0,63}', namespace):
            raise RuntimeError('扩展状态名称无效。')
        self.directory.mkdir(parents=True, exist_ok=True)
        lock = self.directory / '.task-state.lock'
        try:
            lock.mkdir()
        except FileExistsError:
            raise RuntimeError('本地任务状态已锁定；本次不修改记录。') from None
        try:
            if self.path.is_symlink():
                raise RuntimeError('本地任务状态不能是符号链接。')
            data = json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {
                'schema_version': 1, 'extensions': {}}
            if data.get('schema_version') != 1 or not isinstance(data.get('extensions'), dict):
                raise RuntimeError('本地任务状态格式无效，保留原文件且停止执行。')
            extension = data['extensions'].setdefault(namespace, {})
            if not isinstance(extension, dict):
                raise RuntimeError('扩展状态必须是 JSON 对象。')
            yield extension
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.directory,
                                             prefix='.task-state-', delete=False) as handle:
                temporary = Path(handle.name)
                try:
                    json.dump(data, handle, ensure_ascii=False, indent=2)
                    handle.flush()
                    os.fsync(handle.fileno())
                except BaseException:
                    temporary.unlink(missing_ok=True)
                    raise
            try:
                os.replace(temporary, self.path)
            finally:
                temporary.unlink(missing_ok=True)
        finally:
            lock.rmdir()
