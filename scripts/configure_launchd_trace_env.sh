#!/bin/zsh
set -euo pipefail

TRACE_FILE="${TRACECLAW_LOG_PATH:-/Users/mac/Desktop/traceclaw-cake3-gateway.jsonl}"

launchctl setenv TRACECLAW_LOG_PATH "$TRACE_FILE"
launchctl setenv TRACECLAW_GATEWAY_TRACE_FILE "$TRACE_FILE"

printf 'Configured launchd trace environment:\n'
printf '  TRACECLAW_LOG_PATH=%s\n' "$TRACE_FILE"
printf '  TRACECLAW_GATEWAY_TRACE_FILE=%s\n' "$TRACE_FILE"

if [[ "${1:-}" == "--restart" ]]; then
  printf '\nRestarting the existing Gateway service so it inherits the trace path...\n'
  openclaw gateway restart
  printf '\nNOTE: this command does NOT change which OpenClaw dist the LaunchAgent runs.\n'
  printf 'If TraceClaw reports 0 G0-G18 stages, use:\n'
  printf '  bash scripts/reinstall_local_instrumented_gateway.sh\n'
else
  printf '\nThis only configures launchd environment; it does not repoint the Gateway service.\n'
  printf 'For the TraceClaw development stack, prefer:\n'
  printf '  bash scripts/reinstall_local_instrumented_gateway.sh\n'
fi
