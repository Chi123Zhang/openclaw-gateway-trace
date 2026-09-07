#!/bin/zsh
set -euo pipefail

OPENCLAW_ROOT="${OPENCLAW_SOURCE_ROOT:-/Users/mac/Desktop/openclaw-source-2026.7.1-2}"
TRACE_FILE="${TRACECLAW_LOG_PATH:-/Users/mac/Desktop/traceclaw-cake3-gateway.jsonl}"
TRACE_REPO="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -f "$OPENCLAW_ROOT/openclaw.mjs" ]]; then
  echo "OpenClaw source checkout not found: $OPENCLAW_ROOT" >&2
  exit 2
fi

echo "== TraceClaw local Gateway repair =="
echo "OpenClaw source: $OPENCLAW_ROOT"
echo "Trace file:      $TRACE_FILE"
echo

# 1) Re-apply BOTH pinned instrumentation layers. Do not depend on historical,
# uncommitted edits in the local OpenClaw working tree.
echo "Applying Gateway G0-G18 instrumentation..."
python3 "$TRACE_REPO/instrumentation/openclaw-v2026.7.1-2/apply_gateway_runtime_instrumentation.py" \
  --root "$OPENCLAW_ROOT"

echo
echo "Applying post-G18 Agent Runtime instrumentation..."
python3 "$TRACE_REPO/instrumentation/openclaw-v2026.7.1-2/apply_agent_runtime_instrumentation.py" \
  --root "$OPENCLAW_ROOT"

# 2) Verify both source instrumentation families before building.
if ! grep -Rqs --include='*.ts' --include='*.js' --include='*.mjs' \
  'traceclaw.gateway.runtime.v1' "$OPENCLAW_ROOT/src"; then
  echo "ERROR: G0-G18 TraceClaw schema helper is still missing after patching." >&2
  exit 3
fi

if ! grep -Rqs --include='*.ts' --include='*.js' --include='*.mjs' \
  'traceclaw.agent.runtime.v1' "$OPENCLAW_ROOT/src"; then
  echo "ERROR: post-G18 Agent Runtime instrumentation is missing after patching." >&2
  exit 4
fi

# Stronger check: all nineteen Gateway stage-boundary event markers must exist.
GATEWAY_MARKERS=(
  connection_auth_state_resolved
  shared_credential_authorized
  connection_authentication_completed
  gateway_method_authorized
  chat_send_request_validated
  chat_message_normalized
  requested_agent_resolved
  session_resolved
  agent_session_validated
  effective_agent_resolved
  session_send_policy_evaluated
  run_idempotency_guard_passed
  work_admission_completed
  runtime_context_constructed
  dispatch_inbound_entered
  inbound_context_finalized
  reply_dispatch_orchestration_entered
  effective_agent_reresolved
  reply_resolver_selected
)

for marker in "${GATEWAY_MARKERS[@]}"; do
  if ! grep -Rqs --include='*.ts' --include='*.js' --include='*.mjs' "$marker" "$OPENCLAW_ROOT/src"; then
    echo "ERROR: source is missing Gateway stage marker: $marker" >&2
    exit 7
  fi
done

# 3) Build the exact local checkout.
echo
echo "Building local OpenClaw..."
cd "$OPENCLAW_ROOT"
pnpm build

# 4) Verify generated dist contains both instrumentation families and all 19
# Gateway stage markers.
if ! grep -Rqs --include='*.js' --include='*.mjs' --include='*.cjs' \
  'traceclaw.gateway.runtime.v1' "$OPENCLAW_ROOT/dist"; then
  echo "ERROR: build completed but dist lacks Gateway TraceClaw instrumentation." >&2
  exit 5
fi

if ! grep -Rqs --include='*.js' --include='*.mjs' --include='*.cjs' \
  'traceclaw.agent.runtime.v1' "$OPENCLAW_ROOT/dist"; then
  echo "ERROR: build completed but dist lacks Agent Runtime instrumentation." >&2
  exit 6
fi

for marker in "${GATEWAY_MARKERS[@]}"; do
  if ! grep -Rqs --include='*.js' --include='*.mjs' --include='*.cjs' "$marker" "$OPENCLAW_ROOT/dist"; then
    echo "ERROR: built dist is missing Gateway stage marker: $marker" >&2
    exit 8
  fi
done

# 5) Persist the trace path in launchd's bootstrap environment.
launchctl setenv TRACECLAW_LOG_PATH "$TRACE_FILE"
launchctl setenv TRACECLAW_GATEWAY_TRACE_FILE "$TRACE_FILE"

# 6) Install the managed Gateway FROM THIS LOCAL SOURCE CHECKOUT. A plain global
# 'openclaw gateway restart' only restarts the previously installed command.
echo
echo "Installing LaunchAgent from local instrumented dist..."
node "$OPENCLAW_ROOT/openclaw.mjs" gateway install --force

# OpenClaw v2026.7.1-2's install path already bootstraps the RunAtLoad LaunchAgent.
# Do NOT immediately call gateway restart here: upstream explicitly avoids a
# kickstart after install because it can SIGTERM the freshly booted Gateway and
# push real listener startup past the health deadline.
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
echo
echo "Waiting for the freshly installed Gateway on port $GATEWAY_PORT..."
gateway_ready=0
for _ in {1..20}; do
  if python3 - "$GATEWAY_PORT" <<'PY'
import socket, sys
port = int(sys.argv[1])
with socket.socket() as sock:
    sock.settimeout(0.2)
    raise SystemExit(0 if sock.connect_ex(("127.0.0.1", port)) == 0 else 1)
PY
  then
    gateway_ready=1
    break
  fi
  sleep 1
done

if [[ "$gateway_ready" != "1" ]]; then
  echo
  echo "ERROR: locally installed Gateway did not open port $GATEWAY_PORT." >&2
  echo
  echo "LaunchAgent runtime:" >&2
  launchctl print "gui/$(id -u)/ai.openclaw.gateway" 2>&1 | tail -n 120 || true
  echo
  echo "gateway.log tail:" >&2
  tail -n 120 "$HOME/Library/Logs/openclaw/gateway.log" 2>/dev/null || true
  echo
  echo "gateway stderr tail:" >&2
  tail -n 120 "$HOME/Library/Logs/openclaw/gateway.err.log" 2>/dev/null || true
  exit 9
fi

echo "Gateway listener is up."

# 7) Verify source, dist, and LaunchAgent alignment.
echo
echo "Verifying service alignment..."
python3 "$TRACE_REPO/scripts/trace_runtime_doctor.py" \
  --root "$OPENCLAW_ROOT" \
  --trace "$TRACE_FILE"

echo
echo "Repair complete."
echo "Now start the viewer in another Terminal:"
echo "  cd $TRACE_REPO && bash start_live.sh"
