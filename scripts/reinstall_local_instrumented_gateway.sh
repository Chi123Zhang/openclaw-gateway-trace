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

# 1) Re-apply the pinned post-G18 patch so source and helper are current.
python3 "$TRACE_REPO/instrumentation/openclaw-v2026.7.1-2/apply_agent_runtime_instrumentation.py"   --root "$OPENCLAW_ROOT"

# 2) Confirm the older G0-G18 instrumentation is still present before rebuilding.
# It was part of the existing local TraceClaw source checkout and must not be
# silently replaced by a source-only catalog.
if ! grep -Rqs --include='*.ts' --include='*.js' --include='*.mjs'   'traceclaw.gateway.runtime.v1' "$OPENCLAW_ROOT/src"; then
  cat >&2 <<'EOF'

ERROR: the local OpenClaw source no longer contains the G0-G18 TraceClaw
instrumentation marker (traceclaw.gateway.runtime.v1).

Do not continue with a service reinstall: that would make the uninstrumented
build authoritative. Restore/reapply the G0-G18 source instrumentation first.
EOF
  exit 3
fi

if ! grep -Rqs --include='*.ts' --include='*.js' --include='*.mjs'   'traceclaw.agent.runtime.v1' "$OPENCLAW_ROOT/src"; then
  echo "ERROR: post-G18 Agent Runtime instrumentation is missing from source." >&2
  exit 4
fi

# 3) Build the exact local checkout.
echo
echo "Building local OpenClaw..."
cd "$OPENCLAW_ROOT"
pnpm build

# 4) Verify the generated dist actually contains both instrumentation families.
if ! grep -Rqs --include='*.js' --include='*.mjs' --include='*.cjs'   'traceclaw.gateway.runtime.v1' "$OPENCLAW_ROOT/dist"; then
  echo "ERROR: build completed but dist does not contain G0-G18 instrumentation." >&2
  exit 5
fi
if ! grep -Rqs --include='*.js' --include='*.mjs' --include='*.cjs'   'traceclaw.agent.runtime.v1' "$OPENCLAW_ROOT/dist"; then
  echo "ERROR: build completed but dist does not contain Agent Runtime instrumentation." >&2
  exit 6
fi

# 5) Persist the trace file in the launchd bootstrap environment.
launchctl setenv TRACECLAW_LOG_PATH "$TRACE_FILE"
launchctl setenv TRACECLAW_GATEWAY_TRACE_FILE "$TRACE_FILE"

# 6) Critical fix: install the managed Gateway FROM THIS LOCAL SOURCE CHECKOUT.
# OpenClaw v2026.7.1-2 resolves the service dist entrypoint from process.argv[1].
# Calling the global 'openclaw gateway restart' only restarts whatever service
# was already installed; it does not repoint that service at this local build.
echo
echo "Installing LaunchAgent from local instrumented dist..."
node "$OPENCLAW_ROOT/openclaw.mjs" gateway install --force

echo
echo "Restarting the locally-installed Gateway..."
node "$OPENCLAW_ROOT/openclaw.mjs" gateway restart --force

echo
echo "Verifying service alignment..."
python3 "$TRACE_REPO/scripts/trace_runtime_doctor.py"   --root "$OPENCLAW_ROOT"   --trace "$TRACE_FILE"

echo
echo "Repair complete."
echo "Now start the viewer in another Terminal:"
echo "  cd $TRACE_REPO && bash start_live.sh"
