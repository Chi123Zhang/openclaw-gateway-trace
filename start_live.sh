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

printf '\nOpenClaw Gateway Trace\n'
printf 'Trace file: %s\n' "$TRACECLAW_LOG_PATH"
printf 'Viewer:     http://127.0.0.1:%s/\n' "$PORT"
printf 'Health:     http://127.0.0.1:%s/health\n\n' "$PORT"

exec "$COLLECTOR_DIR/.venv/bin/python" -m uvicorn collector.viewer_server:app \
  --host 127.0.0.1 \
  --port "$PORT"
