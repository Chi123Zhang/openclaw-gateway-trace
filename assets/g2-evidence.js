(() => {
  /*
   * G2 source/runtime alignment for OpenClaw v2026.7.1-2 (0790d9f).
   *
   * G2 is the remainder of the WebSocket connect/handshake path after G0 has
   * produced ConnectAuthState. It resolves the final auth decision, applies
   * device/pairing/role/scope policy, registers the authenticated client and
   * completes the hello-ok handshake.
   */

  const previous = window.GATEWAY_STEP_EVIDENCE;
  if (!previous?.inspect) return;

  const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  function stageById(id) {
    try {
      return typeof byId !== "undefined" ? byId?.[id] || null : null;
    } catch {
      return null;
    }
  }

  function g0() { return stageById("G0"); }
  function g2() { return stageById("G2"); }

  function runtimeEvents(stage) {
    return Array.isArray(stage?.runtimeEvents) ? stage.runtimeEvents : [];
  }

  function runtimeField(stage, names) {
    const wanted = names.map(normalize);
    const events = runtimeEvents(stage);
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i] || {};
      const candidates = { ...event, ...(event.fields || {}) };
      if (event.result !== undefined) candidates.result = event.result;
      for (const [key, value] of Object.entries(candidates)) {
        if (value === undefined || value === null || value === "") continue;
        if (!wanted.includes(normalize(key))) continue;
        return {
          value: Array.isArray(value) ? JSON.stringify(value) : String(value),
          evidence: "RUNTIME",
          source: `G2 · ${event.event || "connection_identity_finalized"}`,
          observed: true,
        };
      }
    }
    return null;
  }

  function stageResult(stage) {
    const value = String(stage?.result || "");
    if (!value || value === "—" || value === "not separately observed") return null;
    return {
      value,
      evidence: stage?.evidence?.includes("runtime") ? "RUNTIME" : "SOURCE-DERIVED",
      source: `${stage?.id || "stage"} result`,
      observed: true,
    };
  }

  function patchDefinition(stage = g2()) {
    const catalogStage = (window.GATEWAY_STAGE_CATALOG || []).find(item => item.id === "G2");
    const apply = target => {
      if (!target) return;
      target.input = "ConnectAuthState from G0, optional device identity / credential state, requested role/scopes, and client/connection context.";
      target.process = "Resolve the final authentication decision, enforce device/pairing/role/scope policy, register the authenticated client, and complete the WebSocket hello-ok handshake.";
      target.output = "Final authenticated connection state + accepted role/scopes + completed WebSocket handshake.";
      target.steps = [
        {
          title: "Receive final-handshake inputs",
          detail: "Continue from G0 with ConnectAuthState plus device state, requested role/scopes and client/connection metadata used by the remaining handshake path.",
          source: "message-handler.ts:1038–1136; auth-context.ts:188 onward",
          code: "auth_state = G0.ConnectAuthState\nhas_device_identity = Boolean(device)\nrequested_role = role\nrequested_scopes = scopes\nclient_mode = connect_params.client.mode\nconnection_context = upgrade request / client IP / rate-limit state",
        },
        {
          title: "Evaluate device and identity policy",
          detail: "Apply missing-device policy when necessary and validate device identity/signature data when a device identity is present. Branch details depend on the connection/client policy.",
          source: "message-handler.ts:1038–1213",
          code: "if device identity is missing:\n    evaluate missing-device policy\nelse:\n    validate device id / public key / signature payload\n\n# continue only if policy permits",
        },
        {
          title: "Resolve final authentication decision",
          detail: "Call resolveConnectAuthDecision(...) with the preliminary G0 state and any bootstrap/device-token candidates. If G0 already authenticated the connection, the existing auth state can remain authoritative.",
          source: "message-handler.ts:1215; auth-context.ts:188 onward",
          code: "auth_decision = resolveConnectAuthDecision({\n    state: auth_state,\n    hasDeviceIdentity, deviceId, publicKey,\n    role: requested_role,\n    scopes: requested_scopes,\n    rateLimiter, clientIp,\n    verifyBootstrapToken, verifyDeviceToken\n})",
        },
        {
          title: "Apply final authentication gate",
          detail: "Reject the connection if the resolved decision is unauthorized; otherwise continue with the finalized authentication method.",
          source: "message-handler.ts:1215 onward",
          code: "if not auth_decision.authOk:\n    send auth failure / close connection\nelse:\n    auth_method = auth_decision.authMethod\n    continue handshake",
        },
        {
          title: "Validate pairing, role and scopes",
          detail: "Apply pairing and role/scope policy, reconcile approved access and issue or refresh a device token when required.",
          source: "message-handler.ts:1335–1813",
          code: "validate pairing state\nvalidate / reconcile role\nvalidate / reconcile scopes\nissue_or_refresh_device_token_when_required()",
        },
        {
          title: "Register authenticated client",
          detail: "Create/register the authenticated Gateway client state after the connection identity has been accepted.",
          source: "message-handler.ts:2056–2065",
          code: "setClient(authenticated_client)\nregister connected client / presence state",
        },
        {
          title: "Complete hello-ok handshake",
          detail: "Build and send hello-ok and emit the successful Gateway authentication/connection event, completing the connection-level prerequisite for later requests such as chat.send.",
          source: "message-handler.ts:2169–2204, 2237–2273",
          code: "hello = buildHelloOk(final_role, final_scopes, device_token)\nsend(hello)\nemit gateway.auth.succeeded\nconnection = ready",
        },
      ];
    };
    apply(catalogStage);
    apply(stage);
  }

  function patchConcrete(stage = g2()) {
    if (!stage) return;

    const g0Result = stageResult(g0());
    const authMode = runtimeField(stage, ["authMode", "gatewayAuthMode"]);
    const hasDeviceIdentity = runtimeField(stage, ["hasDeviceIdentity"]);
    const clientMode = runtimeField(stage, ["clientMode"]);

    const result = runtimeField(stage, ["result"]);
    const authMethod = runtimeField(stage, ["authMethod", "authenticationMethod"]);
    const role = runtimeField(stage, ["role"]);
    const scopes = runtimeField(stage, ["scopes"]);

    const inputLines = [];
    if (g0Result) inputLines.push(`G0 auth state = ${g0Result.value}`);
    if (authMode) inputLines.push(`authMode = ${authMode.value}`);
    if (hasDeviceIdentity) inputLines.push(`hasDeviceIdentity = ${hasDeviceIdentity.value}`);
    if (clientMode) inputLines.push(`clientMode = ${clientMode.value}`);
    if (inputLines.length) {
      stage.concreteInput = inputLines.join("\n");
      stage.concreteInputEvidence = g0Result ? "RUNTIME + SOURCE-DERIVED" : "RUNTIME";
    }

    const outputLines = [];
    if (result) outputLines.push(`result = ${result.value}`);
    if (authMethod) outputLines.push(`authMethod = ${authMethod.value}`);
    if (role) outputLines.push(`role = ${role.value}`);
    if (scopes) outputLines.push(`scopes = ${scopes.value}`);
    if (outputLines.length) {
      stage.concreteOutput = outputLines.join("\n");
      stage.concreteOutputEvidence = "RUNTIME";
    }
  }

  function unknown(key, label, reason) {
    return { key, label, value: "not observed", evidence: "NOT OBSERVED", source: reason, observed: false };
  }

  function observed(key, label, stage, aliases) {
    const item = runtimeField(stage, aliases);
    if (!item) return unknown(key, label, "No field emitted for this G2 boundary in the current trace.");
    return { key, label, ...item };
  }

  function sourceFact(key, label, value, source) {
    return { key, label, value, evidence: "SOURCE-DERIVED", source, observed: true };
  }

  function priorG0Fact() {
    const item = stageResult(g0());
    if (!item) return unknown("g0AuthState", "G0 auth state", "G0 result is not available in this trace.");
    return { key: "g0AuthState", label: "G0 auth state", ...item };
  }

  function inspect(stage, index) {
    if (stage?.id !== "G2") return previous.inspect(stage, index);

    patchDefinition(stage);
    patchConcrete(stage);

    const g0State = priorG0Fact();
    const authMode = observed("authMode", "Gateway auth mode", stage, ["authMode", "gatewayAuthMode"]);
    const hasDevice = observed("hasDeviceIdentity", "device identity present", stage, ["hasDeviceIdentity"]);
    const clientMode = observed("clientMode", "client mode", stage, ["clientMode"]);
    const result = observed("authResult", "final auth result", stage, ["result"]);
    const authMethod = observed("authMethod", "final auth method", stage, ["authMethod", "authenticationMethod"]);
    const role = observed("role", "accepted role", stage, ["role"]);
    const scopes = observed("scopes", "accepted scopes", stage, ["scopes"]);
    const requestedRole = unknown("requestedRole", "requested role", "The current G2 event emits finalized role, not a separate requestedRole field.");
    const requestedScopes = unknown("requestedScopes", "requested scopes", "The current G2 event emits finalized scopes, not a separate requestedScopes field.");
    const pairing = unknown("pairing", "pairing decision", "No dedicated pairing decision field is emitted by the current G2 event.");

    const sourceContinue = sourceFact("continue", "control path", "authenticated path continues", "G2 source control flow + observed pass result");
    const clientRegistered = sourceFact("clientRegistered", "authenticated client registration", "source path", "message-handler.ts:2056–2065");
    const helloOk = sourceFact("helloOk", "hello-ok handshake", "source path", "message-handler.ts:2169–2204, 2237–2273");

    const models = [
      {
        status: (authMode.observed || hasDevice.observed || clientMode.observed) ? { label: "PARTIAL", tone: "partial" } : { label: "UNRESOLVED", tone: "unresolved" },
        inputs: [g0State, authMode, hasDevice, clientMode, requestedRole, requestedScopes],
        outputs: [],
        knownFacts: [],
        interpretation: "G2 receives G0's ConnectAuthState plus device, role/scope and client/connection context. This run directly emits authMode, device-identity presence and clientMode; requested role/scopes are not separately emitted at this boundary.",
      },
      {
        status: hasDevice.observed ? { label: "PARTIAL", tone: "partial" } : { label: "SOURCE-CONFIRMED", tone: "source" },
        inputs: [hasDevice, clientMode],
        outputs: [],
        knownFacts: [],
        interpretation: "The source evaluates missing-device policy or device/signature validation before the final auth decision. hasDeviceIdentity=false is observed for this run, but the exact internal policy sub-branch is not separately emitted.",
      },
      {
        status: (result.observed || authMethod.observed) ? { label: "OBSERVED", tone: "observed" } : { label: "SOURCE-CONFIRMED", tone: "source" },
        inputs: [g0State, hasDevice, requestedRole, requestedScopes],
        outputs: [authMethod, result],
        knownFacts: [],
        interpretation: "resolveConnectAuthDecision(...) produces the final authorization decision. The current trace exposes the finalized result and authMethod but not the full decision object.",
      },
      {
        status: result.observed ? { label: "OBSERVED", tone: "observed" } : { label: "SOURCE-CONFIRMED", tone: "source" },
        inputs: [result, authMethod],
        outputs: result.observed && String(result.value).toLowerCase() === "pass" ? [sourceContinue] : [],
        knownFacts: [],
        interpretation: "A pass result means the unauthorized rejection path was not taken. This is a source-derived control-flow consequence of the observed runtime result.",
      },
      {
        status: (role.observed || scopes.observed) ? { label: "OBSERVED", tone: "observed" } : { label: "SOURCE-CONFIRMED", tone: "source" },
        inputs: [requestedRole, requestedScopes, hasDevice],
        outputs: [role, scopes, pairing],
        knownFacts: [],
        interpretation: "The current connection_identity_finalized event exposes finalized role/scopes. They are shown as accepted outputs, not retroactively treated as the separately requested input values.",
      },
      {
        status: { label: "SOURCE-CONFIRMED", tone: "source" },
        inputs: [clientMode, role, scopes],
        outputs: [clientRegistered],
        knownFacts: [],
        interpretation: "Authenticated client registration is confirmed by the fixed source path, but this G2 runtime event does not emit a dedicated client-registration field.",
      },
      {
        status: { label: "SOURCE-CONFIRMED", tone: "source" },
        inputs: [role, scopes, authMethod],
        outputs: [helloOk],
        knownFacts: [],
        interpretation: "The fixed source completes the connection by building/sending hello-ok and emitting gateway.auth.succeeded. The current connection_identity_finalized event does not separately expose the hello-ok payload.",
      },
    ];

    const model = models[index] || models[0];
    return {
      ...model,
      directEvents: runtimeEvents(stage).filter(event => Number(event?.stepIndex) === index),
      allEvents: runtimeEvents(stage),
    };
  }

  window.GATEWAY_STEP_EVIDENCE = { ...previous, inspect };

  if (typeof renderAll === "function") {
    const priorRenderAll = renderAll;
    renderAll = function renderAllWithAlignedG2(...args) {
      patchDefinition();
      patchConcrete();
      return priorRenderAll(...args);
    };
  }
})();
