"""Exercise only sandboxed scripts and mocked subprocesses. Never touches networking."""
from pathlib import Path
import os
import runpy
import subprocess
import sys
from unittest.mock import patch

root = Path(sys.argv[1])
bundle = root / "scripts"
for name in ["setup.sh", "reset.sh"]:
    subprocess.run(["/bin/bash", "-n", str(bundle / name)], check=True)
module = runpy.run_path(str(bundle / "network-reset.py"))
with patch.object(sys, "argv", ["network-reset.py", "--dry-run"]), patch("subprocess.run") as command:
    module["main"]()
    command.assert_not_called()
with patch.object(sys, "argv", ["network-reset.py"]), patch.object(Path, "is_file", return_value=False), patch("subprocess.run") as command:
    try:
        module["main"]()
        raise AssertionError("missing setup should fail")
    except SystemExit as error:
        assert "setup.sh" in str(error)
    command.assert_not_called()
with patch.object(sys, "argv", ["network-reset.py"]), patch.object(Path, "is_file", return_value=True), patch("subprocess.run") as command:
    command.return_value.returncode = 0
    module["main"]()
    assert command.call_args.args[0] == ["/usr/bin/sudo", "-n", "/Library/PrivilegedHelperTools/agent-hub-network-reset/run"]

# Replace absolute executables and the root precondition in a temporary copy only.
source = (bundle / "reset.sh").read_text()
assert source.count('"$EUID" -eq 0 && ') == 1
source = source.replace('"$EUID" -eq 0 && ', "")
network = root / "mock-networksetup"
network.write_text('''#!/bin/bash
if [[ "$1" == -listallnetworkservices ]]; then printf 'Services\\nEthernet\\n'; exit 0; fi
printf '%s\\n' "$3" >> "$NETWORK_TEST_LOG"
if [[ "$3" == off && "$NETWORK_TEST_MODE" == off-fails ]]; then exit 1; fi
''')
network.chmod(0o700)
sleep = root / "mock-sleep"
sleep.write_text('#!/bin/bash\n[[ "$NETWORK_TEST_MODE" != sleep-fails ]]\n')
sleep.chmod(0o700)
script = root / "sandbox-reset.sh"
script.write_text(source.replace("/usr/sbin/networksetup", str(network)).replace("/bin/sleep", str(sleep)))
for mode, expected, success in [
    ("normal", ["off", "on"], True),
    ("off-fails", ["off", "on"], False),
    ("sleep-fails", ["off", "on"], False),
]:
    log = root / (mode + ".log")
    result = subprocess.run(["/bin/bash", str(script), "Ethernet", "5"], env={**os.environ, "NETWORK_TEST_LOG": str(log), "NETWORK_TEST_MODE": mode}, capture_output=True, text=True)
    assert result.returncode == 0 if success else result.returncode != 0, result
    assert log.read_text().splitlines() == expected
print("PASS: paused template, shell syntax, dry run, missing setup, exact sudo argv and restoration after failures")

for seconds in ["0", "61", "99999999999999999999"]:
    log = root / (seconds + ".log")
    result = subprocess.run(["/bin/bash", str(script), "Ethernet", seconds], env={**os.environ, "NETWORK_TEST_LOG": str(log), "NETWORK_TEST_MODE": "normal"}, capture_output=True, text=True)
    assert result.returncode != 0
    assert not log.exists(), "invalid duration must fail before changing networking"
