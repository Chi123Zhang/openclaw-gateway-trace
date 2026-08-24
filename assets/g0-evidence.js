(() => {
  /*
   * G0 evidence model aligned with OpenClaw v2026.7.1-2 (0790d9f).
   *
   * resolveConnectAuthState(...) receives resolved auth configuration,
   * connectAuth, a device-identity presence flag, and request/network auth
   * context. It returns ConnectAuthState. Role/scopes belong to the later
   * handshake caller/G2 path and are intentionally excluded from G0 inputs.
   */

  const previous = window.GATEWAY_STEP_EVIDENCE;
  if (!previous?.inspect) return;

  const LABEL = {
    authConfig: "Gateway auth configuration",
    connectAuth: "handshake auth payload",
    deviceIdentityPresent: "device-identity presence",
    requestAuthContext: "request / proxy / IP / rate-limit context",
    sharedAuthProvided: "shared auth provided",
    bootstrapTokenCandidatePresent: "bootstrap-token candidate present",
    deviceTokenCandidatePresent: "device-token candidate present",
    authResult: "authentication result",
    authMethod: "auth method",
    sharedAuthOk: "shared auth ok",
  };

  const ALIASES = {
    authConfig: ["authMode", "gatewayAuthMode"],
    deviceIdentityPresent: ["hasDeviceIdentity"],
    sharedAuthProvided: ["sharedAuthProvided"],
    bootstrapTokenCandidatePresent: ["hasBootstrapTokenCandidate"],
    deviceTokenCandidatePresent: ["hasDeviceTokenCandidate"],
    authResult: ["result", "authResult"],
    authMethod: ["authMethod", "authenticationMethod"],
    sharedAuthOk: ["sharedAuthOk"],
  };

  const STEP_KEYS = [
    { i: ["authConfig", "connectAuth", "deviceIdentityPresent", "requestAuthContext"], o: [] },
    { i: ["connectAuth", "deviceIdentityPresent"], o: ["sharedAuthProvided", "bootstrapTokenCandidatePresent", "deviceTokenCandidatePresent"] },
    { i: ["authConfig", "sharedAuthProvided"], o: ["authResult", "authMethod"] },
    { i: ["sharedAuthProvided", "authResult"], o: ["sharedAuthOk"] },
    {
      i: ["authResult", "authMethod", "sharedAuthOk", "sharedAuthProvided"],
      o: ["authResult", "authMethod", "sharedAuthOk", "sharedAuthProvided", "bootstrapTokenCandidatePresent", "deviceTokenCandidatePresent"],
    },
  ];

  const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  function stageById(id) {
    try {
      return typeof byId !== "undefined" ? byId?.[id] || null : null;
    } catch {
      return null;
    }
  }

  function g0() { return stageById("G0"); }
  function g1() { return stageById("G1"); }

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
          value: String(value),
          evidence: "RUNTIME",
          source: `G0 · ${event.event || "connection_auth_state_resolved"}`,
          observed: true,
        };
      }
    }
    return null;
  }

  function stageResult(stage) {
    const value = String(stage?.result || "");
    if (!value || value === "—" || value === "not separately observed") return null;
    const evidence = stage?.evidence?.includes("runtime") ? "RUNTIME"
      : stage?.evidence?.includes("native") ? "NATIVE"
      : stage?.evidence?.includes("derived") ? "SOURCE-DERIVED"
      : "SOURCE-DERIVED";
    return { value, evidence, source: `${stage?.id || "stage"} result`, observed: true };
  }

  function unknown(key, reason = "No field emitted for this source input") {
    return {
      key,
      label: LABEL[key] || key,
      value: "not observed",
      evidence: "NOT OBSERVED",
      source: reason,
      observed: false,
    };
  }

  function fact(key, stage = g0()) {
    if (key === "connectAuth") {
      return unknown(key, "Raw handshake credential values are intentionally not emitted by the trace.");
    }
    if (key === "requestAuthContext") {
      return unknown(key, "req / trustedProxies / IP / rate-limit inputs are part of the fixed source call but are not emitted by the current G0 event.");
    }

    const found = runtimeField(stage, ALIASES[key] || [key]);
    if (found) return { key, label: LABEL[key] || key, ...found };
    return unknown(key);
  }

  function knownFact(label, item) {
    if (!item) return null;
    return { label, value: item.value, evidence: item.evidence, source: item.source, observed: true };
  }

  function status(inputs, outputs) {
    const runtimeOutput = outputs.some(item => item.evidence === "RUNTIME" || item.evidence === "NATIVE");
    if (runtimeOutput) return { label: "OBSERVED", tone: "observed" };
    const runtimeInput = inputs.some(item => item.evidence === "RUNTIME" || item.evidence === "NATIVE");
    if (runtimeInput) return { label: "PARTIAL", tone: "partial" };
    return { label: "UNRESOLVED", tone: "unresolved" };
  }

  function interpretation(index) {
    const descriptions = [
      "G0 receives resolved Gateway auth configuration, connectAuth, the device-identity presence flag, and request/network authentication context. The current trace directly exposes only the fields it emitted; raw credential values and proxy/rate-limit objects remain unobserved.",
      "G0 normalizes shared token/password auth and derives bootstrap/device-token candidates. Candidate presence is shown only from the runtime summary fields; credential values themselves are not exposed.",
      "G0 invokes authorizeWsControlUiGatewayConnect(...) with resolved auth, normalized shared auth, and request/network context. The resulting auth state is reflected by the observed G0 auth result/method; the nested G1 result is shown separately when available.",
      "G0 performs the shared-auth probe and computes sharedAuthOk. This is the source-defined shared-auth status step; it is not a fallback-preservation branch.",
      "G0 returns ConnectAuthState to the handshake caller. The returned state contains authResult/authOk/authMethod, sharedAuthOk/sharedAuthProvided, and optional bootstrap/device-token candidate fields. The trace displays only the returned-state fields it actually emitted.",
    ];
    return descriptions[index] || "G0 source-aligned step.";
  }

  function patchConcrete(stage = g0()) {
    if (!stage) return;

    const inputPairs = [
      ["authMode", ALIASES.authConfig],
      ["hasDeviceIdentity", ALIASES.deviceIdentityPresent],
    ];
    const outputPairs = [
      ["authMethod", ALIASES.authMethod],
      ["result", ALIASES.authResult],
      ["sharedAuthProvided", ALIASES.sharedAuthProvided],
      ["sharedAuthOk", ALIASES.sharedAuthOk],
      ["hasBootstrapTokenCandidate", ALIASES.bootstrapTokenCandidatePresent],
      ["hasDeviceTokenCandidate", ALIASES.deviceTokenCandidatePresent],
    ];

    const inputLines = inputPairs.flatMap(([label, aliases]) => {
      const value = runtimeField(stage, aliases);
      return value ? [`${label} = ${value.value}`] : [];
    });
    const outputLines = outputPairs.flatMap(([label, aliases]) => {
      const value = runtimeField(stage, aliases);
      return value ? [`${label} = ${value.value}`] : [];
    });

    if (inputLines.length) {
      stage.concreteInput = inputLines.join("\n");
      stage.concreteInputEvidence = "RUNTIME";
    }
    if (outputLines.length) {
      stage.concreteOutput = outputLines.join("\n");
      stage.concreteOutputEvidence = "RUNTIME";
    }
  }

  function inspect(stage, index) {
    if (stage?.id !== "G0") return previous.inspect(stage, index);

    patchConcrete(stage);
    const spec = STEP_KEYS[index] || { i: [], o: [] };
    const inputs = spec.i.map(key => fact(key, stage));
    const outputs = spec.o.map(key => fact(key, stage));
    const knownFacts = [];

    if (index === 2) {
      const nested = stageResult(g1());
      const item = knownFact("G1 nested authorization result", nested);
      if (item) knownFacts.push(item);
    }
    if (index === 4) {
      const final = stageResult(stage);
      const item = knownFact("G0 auth-state result", final);
      if (item) knownFacts.push(item);
    }

    return {
      status: status(inputs, outputs),
      inputs,
      outputs,
      knownFacts,
      interpretation: interpretation(index),
      directEvents: runtimeEvents(stage).filter(event => Number(event?.stepIndex) === index),
      allEvents: runtimeEvents(stage),
    };
  }

  window.GATEWAY_STEP_EVIDENCE = { ...previous, inspect };

  if (typeof renderAll === "function") {
    const priorRenderAll = renderAll;
    renderAll = function renderAllWithAlignedG0(...args) {
      patchConcrete();
      return priorRenderAll(...args);
    };
  }
})();
