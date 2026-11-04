#!/bin/sh
set -eu
"${AGENT_HUB_PYTHON:-python3}" "$AGENT_HUB_SCRIPT_DIR/scripts/agent.py"
