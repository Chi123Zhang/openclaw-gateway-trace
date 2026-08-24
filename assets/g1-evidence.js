(() => {
  /*
   * G1 source/runtime alignment for OpenClaw v2026.7.1-2 (0790d9f).
   *
   * G1 is the nested authorizeWsControlUiGatewayConnect(...) call inside G0.
   * Its source inputs are resolved Gateway auth, normalized shared auth, and
   * request/network/rate-limit context. The returned object is GatewayAuthResult.
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
          source: `G1 · ${event.event || "connection_authorization_evaluated"}`,
          observed: true,
        };
      }
    }
    return null;
  }

  function patchDefinition(stage = g1()) {
    const catalogStage = (window.GATEWAY_STAGE_CATALOG || []).find(item => item.id === "G1");
    const apply = target => {
      if (!target) return;
      target.input = "Resolved Gateway auth configuration, normalized shared credential, and connection/network authentication context.";
      target.process = "Authorize the WebSocket Control UI connection using the active Gateway auth mode and normalized shared credential.";
      target.output = "GatewayAuthResult { ok, method?, user?, reason?, rateLimited?, retryAfterMs? }";
      target.steps = [
        {
          title: "Receive authorization inputs",
          detail: "Receive resolved Gateway auth, the normalized shared token/password candidate, and request/proxy/IP/rate-limit context from G0.",
          source: "auth-context.ts:144–153; auth.ts:55–80",
          code: "auth = resolvedAuth\nconnect_auth = sharedConnectAuth\nreq = upgradeReq\ntrusted_proxies = trustedProxies\nallow_real_ip_fallback = allowRealIpFallback\nrate_limiter = sharedAuthProvided ? authRateLimiter : undefined\nclient_ip = browserRateLimitClientIp\nrate_limit_scope = SHARED_SECRET",
        },
        {
          title: "Enter WS Control UI authorization",
          detail: "authorizeWsControlUiGatewayConnect forwards the same authorization parameters into authorizeGatewayConnect with authSurface = ws-control-ui.",
          source: "src/gateway/auth.ts:597–602",
          code: "authorizeWsControlUiGatewayConnect(params)\n→ authorizeGatewayConnect({\n    ...params,\n    authSurface: 'ws-control-ui'\n  })",
        },
        {
          title: "Evaluate active auth mode",
          detail: "The core authorization path resolves request/rate-limit context and evaluates trusted-proxy, none, Tailscale, token, or password auth. This run used token auth.",
          source: "src/gateway/auth.ts:481–586",
          code: "context = resolveGatewayAuthRequestContext(params)\n\nif auth.mode == 'token':\n    return authorizeTokenAuth({\n      authToken: auth.token,\n      connectToken: connectAuth?.token,\n      limiter, ip, rateLimitScope\n    })",
        },
        {
          title: "Return GatewayAuthResult to G0",
          detail: "Return the normalized authorization result to resolveConnectAuthState, where G0 stores it as authResult and continues building ConnectAuthState.",
          source: "auth-context.ts:144–153; auth.ts:597–602",
          code: "GatewayAuthResult = {\n  ok, method?, user?, reason?,\n  rateLimited?, retryAfterMs?\n}\n\nreturn GatewayAuthResult to G0",
        },
      ];
    };
    apply(catalogStage);
    apply(stage);
  }

  function patchConcrete(stage = g1()) {
    if (!stage) return;

    const authMode = runtimeField(stage, ["authMode", "gatewayAuthMode"]);
    const authMethod = runtimeField(stage, ["authMethod", "authenticationMethod"]);
    const result = runtimeField(stage, ["result", "authResult"]);

    const inputLines = [];
    if (authMode) inputLines.push(`authMode = ${authMode.value}`);

    const outputLines = [];
    if (authMethod) outputLines.push(`authMethod = ${authMethod.value}`);
    if (result) outputLines.push(`result = ${result.value}`);

    if (inputLines.length) {
      stage.concreteInput = inputLines.join("\n");
      stage.concreteInputEvidence = "RUNTIME";
    }
    if (outputLines.length) {
      stage.concreteOutput = outputLines.join("\n");
      stage.concreteOutputEvidence = "RUNTIME";
    }
  }

  function unknown(key, label, reason) {
    return {
      key,
      label,
      value: "not observed",
      evidence: "NOT OBSERVED",
      source: reason,
      observed: false,
    };
  }

  function observed(key, label, stage, aliases) {
    const item = runtimeField(stage, aliases);
    if (!item) return unknown(key, label, "No field emitted for this step in the current G1 event.");
    return { key, label, ...item };
  }

  function sourceFact(key, label, value, source) {
    return {
      key,
      label,
      value,
      evidence: "SOURCE-DERIVED",
      source,
      observed: true,
    };
  }

  function inspect(stage, index) {
    if (stage?.id !== "G1") return previous.inspect(stage, index);

    patchDefinition(stage);
    patchConcrete(stage);

    const authMode = observed("authMode", "Gateway auth mode", stage, ["authMode", "gatewayAuthMode"]);
    const credential = unknown(
      "sharedCredential",
      "normalized shared credential",
      "The credential value is intentionally not emitted by the runtime trace.",
    );
    const network = unknown(
      "requestAuthContext",
      "request / proxy / IP / rate-limit context",
      "These source inputs are not emitted by the current G1 event.",
    );
    const authSurface = sourceFact(
      "authSurface",
      "auth surface",
      "ws-control-ui",
      "authorizeWsControlUiGatewayConnect wrapper",
    );
    const authMethod = observed("authMethod", "auth method", stage, ["authMethod", "authenticationMethod"]);
    const result = observed("authResult", "authorization result", stage, ["result", "authResult"]);

    const models = [
      {
        status: authMode.observed ? { label: "PARTIAL", tone: "partial" } : { label: "UNRESOLVED", tone: "unresolved" },
        inputs: [authMode, credential, network],
        outputs: [],
        knownFacts: [],
        interpretation: "The source call receives resolved auth, normalized shared auth, and request/network context. This run directly emitted authMode=token; the credential value and network objects were not emitted.",
      },
      {
        status: { label: "SOURCE-CONFIRMED", tone: "source" },
        inputs: [authMode, credential, network],
        outputs: [authSurface],
        knownFacts: [],
        interpretation: "The fixed source wrapper sets authSurface to ws-control-ui before entering authorizeGatewayConnect. The current trace does not emit authSurface as a dedicated runtime field.",
      },
      {
        status: result.observed || authMethod.observed ? { label: "OBSERVED", tone: "observed" } : { label: "UNRESOLVED", tone: "unresolved" },
        inputs: [authMode, credential],
        outputs: [authMethod, result],
        knownFacts: [],
        interpretation: "The authorization core selects the configured auth branch. In this run the observed mode is token and the emitted outcome is allow with authMethod=token.",
      },
      {
        status: result.observed || authMethod.observed ? { label: "OBSERVED", tone: "observed" } : { label: "UNRESOLVED", tone: "unresolved" },
        inputs: [authMethod, result],
        outputs: [authMethod, result],
        knownFacts: [],
        interpretation: "GatewayAuthResult returns to the surrounding G0 resolveConnectAuthState call. The trace exposes the normalized result/method, not the raw credential.",
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
    renderAll = function renderAllWithAlignedG1(...args) {
      patchDefinition();
      patchConcrete();
      return priorRenderAll(...args);
    };
  }
})();
