#!/bin/zsh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
COLLECTOR_DIR="$REPO_DIR/collector"
TRACE_FILE="${TRACECLAW_LOG_PATH:-/Users/mac/Desktop/traceclaw-cake3-gateway.jsonl}"
PORT="${TRACE_VIEWER_PORT:-8765}"

cd "$REPO_DIR"
git pull --ff-only

if [[ ! -x "$COLLECTOR_DIR/.venv/bin/python" ]]; then
  python3 -m venv "$COLLECTOR_DIR/.venv"
  "$COLLECTOR_DIR/.venv/bin/pip" install -r "$COLLECTOR_DIR/requirements.txt"
fi

export TRACECLAW_LOG_PATH="$TRACE_FILE"
export TRACECLAW_AUTO_PUBLISH_LATEST="${TRACECLAW_AUTO_PUBLISH_LATEST:-1}"

OPENCLAW_SOURCE_ROOT="${OPENCLAW_SOURCE_ROOT:-/Users/mac/Desktop/openclaw-source-2026.7.1-2}"
if [[ "${TRACECLAW_SKIP_RUNTIME_DOCTOR:-0}" != "1" && -f "$REPO_DIR/scripts/trace_runtime_doctor.py" ]]; then
  printf '\nChecking that the running Gateway uses the local instrumented build...\n'
  if ! python3 "$REPO_DIR/scripts/trace_runtime_doctor.py"       --root "$OPENCLAW_SOURCE_ROOT"       --trace "$TRACE_FILE"; then
    cat >&2 <<EOF

Trace runtime is not aligned. The viewer was not started because it would be able
to show an assistant answer while capturing zero G0-G18 runtime stages.

Repair with:
  bash "$REPO_DIR/scripts/reinstall_local_instrumented_gateway.sh"
EOF
    exit 3
  fi
fi

printf '\nOpenClaw Gateway Trace\n'
printf 'Trace file: %s\n' "$TRACECLAW_LOG_PATH"
printf 'Viewer:     http://127.0.0.1:%s/\n' "$PORT"
printf 'Health:     http://127.0.0.1:%s/health\n' "$PORT"
printf 'Auto-publish latest-live to GitHub: %s\n\n' "$TRACECLAW_AUTO_PUBLISH_LATEST"

# Run with collector/ as Python's import root. server.py and trace_parser.py are
# intentionally plain sibling modules, so this keeps their existing imports valid.
cd "$COLLECTOR_DIR"
exec .venv/bin/python -m uvicorn viewer_server:app \
  --host 127.0.0.1 \
  --port "$PORT"
