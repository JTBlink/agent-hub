TASK_DIR="${AGENT_HUB_TASK_DIR:-${AGENT_HUB_SCRIPT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}}"
export AGENT_HUB_TASK_DIR="$TASK_DIR"
export AGENT_HUB_SCRIPT_DIR="$TASK_DIR"
exec "${AGENT_HUB_PYTHON:-python3}" "$TASK_DIR/scripts/network-reset.py" "$@"
