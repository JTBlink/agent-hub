"""Model Windows DirEntry.stat fields while running the actual cleanup script."""
import os
import runpy
import sys
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

real_scandir = os.scandir


class ZeroDeviceEntry:
    def __init__(self, entry):
        self.entry = entry
        self.path = entry.path

    def stat(self, *, follow_symlinks=True):
        metadata = self.entry.stat(follow_symlinks=follow_symlinks)
        return SimpleNamespace(
            st_mode=metadata.st_mode,
            st_mtime=metadata.st_mtime,
            st_dev=0,
            st_file_attributes=getattr(metadata, "st_file_attributes", 0),
        )


@contextmanager
def zero_device_scandir(path):
    with real_scandir(path) as entries:
        yield [ZeroDeviceEntry(entry) for entry in entries]


with patch("os.scandir", zero_device_scandir):
    runpy.run_path(sys.argv[1], run_name="__main__")

