#!/bin/zsh
set -euo pipefail

TRACE_FILE="${TRACECLAW_LOG_PATH:-/Users/mac/Desktop/traceclaw-cake3-gateway.jsonl}"

launchctl setenv TRACECLAW_LOG_PATH "$TRACE_FILE"
launchctl setenv TRACECLAW_GATEWAY_TRACE_FILE "$TRACE_FILE"

printf 'Configured launchd trace environment:\n'
printf '  TRACECLAW_LOG_PATH=%s\n' "$TRACE_FILE"
printf '  TRACECLAW_GATEWAY_TRACE_FILE=%s\n' "$TRACE_FILE"

if [[ "${1:-}" == "--restart" ]]; then
  printf '\nRestarting OpenClaw Gateway so the LaunchAgent inherits the trace path...\n'
  openclaw gateway restart
else
  printf '\nRestart the Gateway before the next trace:\n'
  printf '  openclaw gateway restart\n'
fi
