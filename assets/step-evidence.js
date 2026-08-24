(() => {
  const NA = "not observed";

  const LABEL = {
    method: "method",
    message: "message",
    normalizedMessage: "normalized message",
    sessionKey: "SessionKey",
    canonicalSessionKey: "canonical SessionKey",
    runId: "runId",
    role: "role",
    scopes: "scopes",
    authMethod: "auth method",
    authResult: "authentication result",
    sharedResult: "shared credential result",
    gatewayReady: "Gateway connection",
    explicitOrigin: "explicit origin",
    privilegedFields: "privileged provenance fields",
    validationResult: "request validation",
    attachments: "attachments",
    controlState: "control-message state",
    explicitAgent: "explicit agentId",
    requestedAgent: "requested Agent",
    sessionAgent: "Agent parsed from SessionKey",
    effectiveAgent: "effective Agent",
    downstreamAgent: "downstream Agent",
    sessionId: "backing sessionId",
    sessionEntry: "SessionEntry",
    sessionStore: "Session store",
    sessionStorePath: "Session store path",
    entrySendPolicy: "SessionEntry.sendPolicy",
    configuredSendPolicy: "cfg.session.sendPolicy",
    ambiguousPeerShape: "ambiguous legacy peer-key",
    channel: "channel",
    chatType: "chatType",
    matchedRule: "matched policy rule",
    matchedAction: "matched rule action",
    policyDefault: "policy.default",
    sendPolicy: "final sendPolicy",
    dedupeState: "dedupe state",
    admissionDecision: "admission decision",
    attemptId: "admission attemptId",
    ownership: "execution ownership",
    latestSessionRevalidated: "latest Session revalidated",
    commandBody: "command body",
    commandSource: "command source",
    messageForAgent: "Agent-facing message",
    originatingChannel: "originating channel",
    originatingTo: "originating destination",
    accountId: "accountId",
    threadId: "threadId",
    msgBody: "MsgContext.Body",
    msgAgent: "MsgContext.AgentId",
    msgChatType: "MsgContext.ChatType",
    messageSid: "MsgContext.MessageSid",
    commandAuthorized: "CommandAuthorized",
    commandTurn: "CommandTurn",
    mediaState: "media state",
    g14Path: "G14 dispatch path",
    g15Path: "G15 finalization path",
    g16Path: "G16 reply-dispatch path",
    lifecycleState: "reply lifecycle / admission state",
    replyRoute: "reply route",
    toolPolicy: "tool policy",
    visibility: "reply visibility",
    interception: "interception / dedupe gates",
    resolverSource: "resolver source",
    resolver: "reply resolver",
    replyConfig: "reply config",
    dispatchStarted: "Agent dispatch started",
    replyResult: "replyResult",
    response: "assistant response",
    dispatchResult: "dispatch result",
    sharedCredential: "shared credential candidate",
    deviceToken: "device-token candidate",
    deviceIdentity: "device identity",
    pairing: "pairing / scope validation",
    authConfig: "Gateway auth configuration",
  };

  const ALIASES = {
    sessionKey: ["sessionKey", "rawSessionKey"],
    canonicalSessionKey: ["canonicalSessionKey", "canonicalSession"],
    runId: ["runId", "idempotencyKey", "clientRunId"],
    role: ["role", "requestedRole"],
    scopes: ["scopes", "requestedScopes", "clientScopes"],
    authMethod: ["authMethod", "authenticationMethod"],
    authResult: ["result", "authResult"],
    sharedResult: ["sharedResult", "sharedAuthResult", "result"],
    explicitOrigin: ["origin", "explicitOrigin"],
    privilegedFields: ["privilegedFields", "privilegedMetadata"],
    validationResult: ["validationResult", "result"],
    attachments: ["attachments", "attachmentCount"],
    controlState: ["controlState", "isStop", "isBtw"],
    explicitAgent: ["requestedAgentId", "explicitAgentId", "agentIdOverride"],
    requestedAgent: ["requestedAgentId", "requestedAgent"],
    effectiveAgent: ["agentId", "effectiveAgentId"],
    downstreamAgent: ["downstreamAgentId"],
    sessionId: ["sessionId", "backingSessionId"],
    sessionEntry: ["sessionEntry", "sessionEntryFound", "entryResolved"],
    sessionStorePath: ["sessionStorePath", "storePath"],
    entrySendPolicy: ["entrySendPolicy", "sessionEntrySendPolicy"],
    configuredSendPolicy: ["configuredSendPolicy", "sessionSendPolicy"],
    ambiguousPeerShape: ["ambiguousPeerShape", "hasAmbiguousPeerShape"],
    channel: ["channel", "originChannel", "lastChannel"],
    chatType: ["chatType"],
    matchedRule: ["matchedRule", "matchedRuleIndex", "ruleIndex"],
    matchedAction: ["matchedAction", "ruleAction"],
    policyDefault: ["policyDefault", "defaultPolicy"],
    sendPolicy: ["sendPolicy", "result"],
    dedupeState: ["dedupeDecision", "dedupeState", "result"],
    admissionDecision: ["admissionDecision", "result"],
    attemptId: ["attemptId", "admissionAttemptId"],
    ownership: ["owner", "ownership", "reservationOwner"],
    latestSessionRevalidated: ["latestSessionRevalidated", "latest_session_revalidated", "revalidated"],
    commandBody: ["commandBody", "bodyForCommands"],
    commandSource: ["commandSource"],
    messageForAgent: ["messageForAgent", "bodyForAgent"],
    originatingChannel: ["originatingChannel"],
    originatingTo: ["originatingTo", "to"],
    accountId: ["accountId"],
    threadId: ["messageThreadId", "threadId"],
    msgBody: ["Body", "body", "message"],
    msgAgent: ["AgentId", "agentId"],
    msgChatType: ["ChatType", "chatType"],
    messageSid: ["MessageSid", "messageSid", "runId"],
    commandAuthorized: ["CommandAuthorized", "commandAuthorized"],
    commandTurn: ["CommandTurn", "commandTurn"],
    mediaState: ["media", "MediaPath", "MediaPaths", "mediaCount"],
    lifecycleState: ["lifecycleState", "admissionState", "operationState"],
    replyRoute: ["replyRoute", "route"],
    toolPolicy: ["toolPolicy", "effectiveToolPolicy"],
    visibility: ["visibility", "replyVisibility"],
    interception: ["interception", "intercepted", "dedupeClaim"],
    resolverSource: ["resolverSource"],
    resolver: ["resolver", "replyResolver"],
    replyConfig: ["replyConfig", "configOverride"],
    dispatchStarted: ["dispatchStarted", "agentDispatchStarted"],
    replyResult: ["replyResult", "resultPayload"],
    dispatchResult: ["dispatchResult", "queuedFinal"],
    deviceIdentity: ["deviceId", "deviceIdentity"],
    pairing: ["pairing", "paired"],
    authConfig: ["authMode", "gatewayAuthMode"],
  };

  const STEP_KEYS = {
    G0: [
      {i:["authConfig","deviceIdentity","role","scopes"],o:[]},
      {i:["sharedCredential","deviceToken"],o:["sharedCredential","deviceToken"]},
      {i:["sharedCredential","authConfig"],o:["sharedResult"]},
      {i:["sharedResult","deviceToken"],o:["deviceToken"]},
      {i:["sharedResult","deviceToken"],o:["authResult"]},
    ],
    G1: [
      {i:["sharedCredential"],o:["sharedCredential"]},
      {i:["sharedCredential","authConfig"],o:[]},
      {i:["sharedCredential"],o:["sharedResult"]},
      {i:["sharedResult"],o:["authResult"]},
    ],
    G2: [
      {i:["authResult","deviceIdentity","role","scopes"],o:[]},
      {i:["authResult","authMethod"],o:["authMethod"]},
      {i:["deviceIdentity","deviceToken"],o:[]},
      {i:["deviceIdentity","deviceToken","role","scopes"],o:["authMethod"]},
      {i:["authResult","deviceIdentity"],o:["authMethod","authResult"]},
      {i:["role","scopes","deviceIdentity"],o:["role","scopes","pairing"]},
      {i:["role","scopes"],o:["gatewayReady"]},
    ],
    G3: [
      {i:["method","role","scopes"],o:[]},
      {i:["scopes"],o:["authResult"]},
      {i:["method","scopes"],o:["authResult"]},
      {i:["method","role","scopes"],o:["authResult"]},
    ],
    G4: [
      {i:["sessionKey","message","attachments","runId"],o:["validationResult"]},
      {i:["explicitOrigin"],o:["explicitOrigin"]},
      {i:["privilegedFields","scopes"],o:["validationResult"]},
      {i:["sessionKey","message","runId"],o:["validationResult"]},
    ],
    G5: [
      {i:["message"],o:["normalizedMessage"]},
      {i:["normalizedMessage"],o:["controlState"]},
      {i:["attachments"],o:["attachments"]},
      {i:["runId"],o:["runId"]},
      {i:["normalizedMessage","attachments"],o:["validationResult"]},
    ],
    G6: [
      {i:["explicitAgent","sessionKey"],o:["requestedAgent"]},
      {i:["explicitAgent"],o:["requestedAgent"]},
      {i:["requestedAgent","sessionKey"],o:["requestedAgent"]},
      {i:["requestedAgent"],o:["validationResult"]},
    ],
    G7: [
      {i:["sessionKey"],o:["canonicalSessionKey"]},
      {i:["canonicalSessionKey"],o:["sessionAgent"]},
      {i:["sessionAgent"],o:["sessionStorePath","sessionStore"]},
      {i:["canonicalSessionKey","sessionStore"],o:["sessionEntry"]},
      {i:["canonicalSessionKey","sessionEntry"],o:["canonicalSessionKey","sessionEntry"]},
    ],
    G8: [
      {i:["explicitAgent","canonicalSessionKey","sessionEntry"],o:["validationResult"]},
      {i:["canonicalSessionKey","sessionEntry"],o:["validationResult"]},
      {i:["canonicalSessionKey","sessionEntry"],o:["validationResult","sessionId"]},
    ],
    G9: [
      {i:["authConfig"],o:["effectiveAgent"]},
      {i:["explicitAgent"],o:["requestedAgent"]},
      {i:["canonicalSessionKey"],o:["sessionAgent"]},
      {i:["explicitAgent","sessionAgent"],o:["effectiveAgent"]},
      {i:["effectiveAgent"],o:["effectiveAgent"]},
    ],
    G10: [
      {i:["entrySendPolicy"],o:["entrySendPolicy"]},
      {i:["configuredSendPolicy"],o:["configuredSendPolicy"]},
      {i:["sessionKey","ambiguousPeerShape"],o:["sendPolicy"]},
      {i:["sessionKey","channel","chatType"],o:["channel","chatType"]},
      {i:["configuredSendPolicy","channel","chatType"],o:["matchedRule","matchedAction"]},
      {i:["matchedRule","matchedAction"],o:["sendPolicy"]},
      {i:["matchedRule","policyDefault"],o:["sendPolicy"]},
    ],
    G11: [
      {i:["runId","sessionKey"],o:["runId"]},
      {i:["runId"],o:["dedupeState"]},
      {i:["runId","sessionKey"],o:["dedupeState"]},
      {i:["runId"],o:["dedupeState"]},
      {i:["runId","sessionKey"],o:["dedupeState"]},
    ],
    G12: [
      {i:["sessionKey","runId"],o:["attemptId"]},
      {i:["sessionKey","attemptId"],o:["ownership"]},
      {i:["sessionKey","ownership"],o:["latestSessionRevalidated"]},
      {i:["sessionKey","runId"],o:["admissionDecision"]},
    ],
    G13: [
      {i:["message"],o:["commandBody","commandSource"]},
      {i:["message"],o:["messageForAgent"]},
      {i:["channel","chatType"],o:["originatingChannel","originatingTo","accountId","threadId"]},
      {i:["messageForAgent","sessionKey","effectiveAgent","runId"],o:["msgBody","canonicalSessionKey","msgAgent","msgChatType"]},
      {i:["commandBody","scopes"],o:["commandAuthorized","commandTurn"]},
      {i:["runId","scopes"],o:["messageSid","scopes"]},
      {i:["attachments"],o:["mediaState"]},
      {i:["mediaState"],o:["mediaState"]},
      {i:["msgBody","canonicalSessionKey","msgAgent"],o:["g14Path"]},
    ],
    G14: [
      {i:["msgBody","canonicalSessionKey","msgAgent"],o:["g14Path"]},
      {i:["g14Path"],o:["lifecycleState"]},
      {i:["g14Path"],o:["g15Path"]},
      {i:["g15Path"],o:["dispatchStarted"]},
      {i:["g15Path"],o:["g16Path"]},
      {i:["g16Path","replyResult"],o:["dispatchResult"]},
      {i:["dispatchResult"],o:["dispatchResult"]},
    ],
    G15: [
      {i:["msgBody","canonicalSessionKey","msgAgent"],o:["g15Path"]},
      {i:["msgBody"],o:["msgBody"]},
      {i:["msgChatType"],o:["msgChatType"]},
      {i:["msgBody","commandBody"],o:["msgBody","commandBody"]},
      {i:["commandTurn","commandAuthorized"],o:["commandTurn","commandAuthorized"]},
      {i:["mediaState"],o:["mediaState"]},
      {i:["g15Path"],o:["g16Path"]},
    ],
    G16: [
      {i:["msgBody","canonicalSessionKey","msgAgent"],o:["g16Path"]},
      {i:["canonicalSessionKey","effectiveAgent"],o:["downstreamAgent"]},
      {i:["canonicalSessionKey","runId"],o:["lifecycleState"]},
      {i:["canonicalSessionKey","downstreamAgent"],o:["replyRoute","toolPolicy","visibility"]},
      {i:["runId","canonicalSessionKey"],o:["interception"]},
      {i:["g16Path"],o:["resolverSource","resolver"]},
      {i:["replyResult"],o:["response"]},
      {i:["response"],o:["dispatchResult"]},
    ],
    G17: [
      {i:["canonicalSessionKey","effectiveAgent"],o:[]},
      {i:["canonicalSessionKey","effectiveAgent"],o:["downstreamAgent"]},
      {i:["downstreamAgent"],o:["effectiveAgent"]},
      {i:["downstreamAgent"],o:["g16Path"]},
    ],
    G18: [
      {i:["g16Path"],o:["resolverSource","resolver"]},
      {i:["resolverSource"],o:["replyConfig"]},
      {i:["replyConfig"],o:["dispatchStarted"]},
      {i:["resolverSource","replyConfig"],o:["replyResult"]},
      {i:["replyResult"],o:["response"]},
    ],
  };

  function stage(id) {
    try { return byId?.[id] || null; } catch { return null; }
  }

  function meta() {
    try { return CASE2 || {}; } catch { return {}; }
  }

  function normalizeKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function pretty(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
  }

  function runtimeEvents(id) {
    const s = stage(id);
    return Array.isArray(s?.runtimeEvents) ? s.runtimeEvents : [];
  }

  function runtimeField(ids, aliases) {
    const wanted = aliases.map(normalizeKey);
    for (const id of ids) {
      const events = runtimeEvents(id);
      for (let ei = events.length - 1; ei >= 0; ei -= 1) {
        const event = events[ei];
        const candidates = { ...(event?.fields || {}) };
        if (event?.result !== undefined) candidates.result = event.result;
        if (event?.event !== undefined) candidates.event = event.event;
        for (const [key, value] of Object.entries(candidates)) {
          if (value === undefined || value === null || value === "") continue;
          if (wanted.includes(normalizeKey(key))) {
            return { value: pretty(value), evidence: "RUNTIME", source: `${id} · ${event.event || "runtime event"}` };
          }
        }
      }
    }
    return null;
  }

  function stageResult(id) {
    const s = stage(id);
    if (!s) return null;
    const value = s.result;
    if (!value || ["—", "not separately observed"].includes(String(value))) return null;
    if (s.evidence?.includes("runtime")) return { value: String(value), evidence: "RUNTIME", source: `${id} result` };
    if (s.evidence?.includes("native")) return { value: String(value), evidence: "NATIVE", source: `${id} result` };
    if (s.evidence?.includes("derived")) return { value: String(value), evidence: "SOURCE-DERIVED", source: `${id} result` };
    return null;
  }

  function parseConcrete(id, aliases, side = "output") {
    const s = stage(id);
    if (!s) return null;
    const raw = side === "input" ? s.concreteInput : s.concreteOutput;
    const evidence = side === "input" ? s.concreteInputEvidence : s.concreteOutputEvidence;
    if (!raw || !evidence) return null;
    const wanted = aliases.map(normalizeKey);
    for (const line of String(raw).split("\n")) {
      const match = line.match(/^\s*([^=:]+?)\s*(?:=|:)\s*(.*?)\s*$/);
      if (!match) continue;
      if (!wanted.includes(normalizeKey(match[1]))) continue;
      const ev = /RUNTIME|NATIVE/i.test(evidence) ? evidence.toUpperCase() : /SOURCE/i.test(evidence) ? "SOURCE-DERIVED" : evidence.toUpperCase();
      return { value: match[2], evidence: ev, source: `${id} ${side} context` };
    }
    return null;
  }

  function requestFact(key) {
    const m = meta();
    const live = String(m.id || "").startsWith("live-");
    if (key === "method") return { value: "chat.send", evidence: "REQUEST", source: "live request" };
    if (key === "message" && m.prompt) return { value: String(m.prompt), evidence: "REQUEST", source: "submitted prompt" };
    if (key === "sessionKey" && m.rawSessionKey) return { value: String(m.rawSessionKey), evidence: "REQUEST", source: "live request SessionKey" };
    if (key === "runId" && m.runId) return { value: String(m.runId), evidence: "REQUEST", source: "live request runId" };
    if (key === "attachments" && live) return { value: "none", evidence: "REQUEST", source: "live viewer sends no attachments" };
    if (key === "explicitAgent" && live) return { value: "not supplied", evidence: "REQUEST", source: "live API has no agentId field" };
    if (key === "explicitOrigin" && live) return { value: "not supplied", evidence: "REQUEST", source: "live viewer sends no explicit origin" };
    if (key === "privilegedFields" && live) return { value: "not supplied", evidence: "REQUEST", source: "live viewer request body" };
    return null;
  }

  function parseSessionAgent() {
    const session = requestFact("sessionKey")?.value || meta().canonicalSessionKey;
    const match = String(session || "").match(/^agent:([^:]+):/);
    return match ? { value: match[1], evidence: "SOURCE-DERIVED", source: "SessionKey format" } : null;
  }

  function responseFact() {
    const text = meta().response;
    if (!text) return null;
    return { value: `captured (${String(text).length} chars)`, evidence: "RESPONSE", source: "assistant reply returned for this run" };
  }

  function derivedFact(key) {
    const m = meta();
    if (key === "sessionAgent") return parseSessionAgent();
    if (key === "normalizedMessage") {
      const result = stageResult("G5");
      const prompt = requestFact("message");
      if (result && /unchanged/i.test(result.value) && prompt) return { value: prompt.value, evidence: "SOURCE-DERIVED", source: "G5 result=unchanged" };
    }
    if (key === "gatewayReady") {
      const r = stageResult("G2");
      if (r && /pass|authorized|success/i.test(r.value)) return { value: "ready", evidence: "SOURCE-DERIVED", source: "G2 successful handshake path" };
    }
    if (key === "resolver") {
      const rs = resolveKey("resolverSource", "G18");
      if (rs && rs.value === "default_getReplyFromConfig") return { value: "getReplyFromConfig", evidence: "SOURCE-DERIVED", source: "default resolver mapping" };
      if (m.resolver) return { value: String(m.resolver), evidence: "SOURCE-DERIVED", source: "resolved viewer metadata" };
    }
    if (key === "response") return responseFact();
    if (key === "g14Path") {
      if (stageResult("G17") || stageResult("G18") || responseFact()) return { value: "path confirmed", evidence: "SOURCE-CONFIRMED", source: "downstream runtime reached G17/G18" };
    }
    if (key === "g15Path") {
      if (stageResult("G17") || stageResult("G18")) return { value: "finalization path traversed", evidence: "SOURCE-CONFIRMED", source: "G15 is nested before G16/G17 in fixed source" };
    }
    if (key === "g16Path") {
      if (stageResult("G17") || stageResult("G18")) return { value: "reply dispatch path traversed", evidence: "SOURCE-CONFIRMED", source: "G17/G18 are nested inside G16" };
    }
    if (key === "replyResult" && responseFact()) return { value: "returned", evidence: "SOURCE-DERIVED", source: "completed assistant reply + G18→G16 source control flow" };
    if (key === "dispatchResult" && responseFact()) return { value: "completed path; fields not separately emitted", evidence: "SOURCE-DERIVED", source: "reply completed; result object fields not observed" };
    if (key === "mediaState" && requestFact("attachments")?.value === "none") return { value: "none", evidence: "REQUEST", source: "no attachments in live request" };
    if (key === "requestedAgent" && requestFact("explicitAgent")?.value === "not supplied") return { value: "none", evidence: "REQUEST", source: "no explicit agentId" };
    if (key === "effectiveAgent" && m.agent) {
      const r = stageResult("G9");
      if (r) return { value: String(m.agent), evidence: "RUNTIME", source: "G9 effective Agent" };
    }
    if (key === "downstreamAgent" && m.downstreamAgent) {
      const r = stageResult("G17");
      if (r) return { value: String(m.downstreamAgent), evidence: "RUNTIME", source: "G17 Agent re-resolution" };
    }
    return null;
  }

  function sourceStagesFor(key, currentId) {
    const map = {
      role:["G2","G3"], scopes:["G2","G3"], authMethod:["G2"], authResult:[currentId,"G2","G1","G0"], sharedResult:["G1","G0"],
      canonicalSessionKey:["G7"], sessionId:["G8"], effectiveAgent:["G9","G17"], downstreamAgent:["G17"],
      sendPolicy:["G10"], dedupeState:["G11"], admissionDecision:["G12"], resolverSource:["G18"], resolver:["G18"],
      msgBody:["G13"], msgAgent:["G13"], msgChatType:["G13"], messageSid:["G13"],
      channel:[currentId,"G13","G10"], chatType:[currentId,"G13","G10"],
    };
    return map[key] || [currentId];
  }

  function resolveKey(key, currentId) {
    const request = requestFact(key);
    const aliases = ALIASES[key] || [key];
    const ids = sourceStagesFor(key, currentId);
    const runtime = runtimeField(ids, aliases);
    if (runtime) return runtime;

    for (const id of ids) {
      const out = parseConcrete(id, aliases, "output");
      if (out && /RUNTIME|NATIVE/.test(out.evidence)) return out;
    }

    if (request) return request;

    const derived = derivedFact(key);
    if (derived) return derived;

    for (const id of ids) {
      const out = parseConcrete(id, aliases, "output");
      if (out) return out;
      const input = parseConcrete(id, aliases, "input");
      if (input) return input;
    }

    if (key === "sendPolicy") return stageResult("G10");
    if (key === "dedupeState") return stageResult("G11");
    if (key === "admissionDecision") return stageResult("G12");
    if (key === "authResult") return stageResult(currentId);
    if (key === "validationResult") return stageResult(currentId);
    return null;
  }

  function fact(key, currentId) {
    const found = resolveKey(key, currentId);
    return {
      key,
      label: LABEL[key] || key,
      value: found?.value ?? NA,
      evidence: found?.evidence || "NOT OBSERVED",
      source: found?.source || "No field emitted for this step",
      observed: Boolean(found),
    };
  }

  function stageText(id) {
    return runtimeEvents(id).map(event => {
      const fields = Object.entries(event.fields || {}).map(([k,v]) => `${k}=${pretty(v)}`).join(" ");
      return `${event.event || ""} ${event.result || ""} ${fields}`;
    }).join(" ").toLowerCase();
  }

  function hasRuntimeField(id, key) {
    return Boolean(runtimeField([id], ALIASES[key] || [key]));
  }

  function resultValue(id) {
    return stageResult(id)?.value || "";
  }

  function scopesValue() {
    const f = resolveKey("scopes", "G3");
    return String(f?.value || "");
  }

  function specialStatus(id, index) {
    const result = resultValue(id).toLowerCase();
    const text = stageText(id);
    const response = Boolean(responseFact());

    if (id === "G3") {
      const scopes = scopesValue();
      if (index === 1 && scopes) return scopes.includes("operator.admin") ? ["TAKEN", "derived"] : ["NOT TAKEN", "muted"];
      if (index === 2 && scopes) {
        if (scopes.includes("operator.admin")) return ["NOT REACHED", "muted"];
        if (scopes.includes("operator.write") && /allow/.test(result)) return ["TAKEN", "derived"];
      }
    }

    if (id === "G4") {
      if (index === 0 && /pass|allow|valid/.test(result)) return ["PASSED", "derived"];
      if (index === 1 && requestFact("explicitOrigin")?.value === "not supplied") return ["SKIPPED", "muted"];
      if (index === 2 && requestFact("privilegedFields")?.value === "not supplied") return ["NOT TRIGGERED", "muted"];
    }

    if (id === "G5") {
      if (index === 0 && /unchanged/.test(result)) return ["UNCHANGED", "derived"];
      if (index === 2 && requestFact("attachments")?.value === "none") return ["NO ATTACHMENTS", "muted"];
    }

    if (id === "G6") {
      if (index === 0 && requestFact("explicitAgent")?.value === "not supplied") return ["NO OVERRIDE", "muted"];
      if (index === 1 && requestFact("explicitAgent")?.value === "not supplied") return ["SKIPPED", "muted"];
    }

    if (id === "G10") {
      if (index === 0 && hasRuntimeField("G10", "entrySendPolicy")) return ["OBSERVED", "observed"];
      if (index === 1 && hasRuntimeField("G10", "configuredSendPolicy")) return ["OBSERVED", "observed"];
      if (index === 2 && /ambiguous/.test(text)) return ["TAKEN", "observed"];
      if (index === 4 && hasRuntimeField("G10", "matchedRule")) return ["OBSERVED", "observed"];
      if (index === 5 && hasRuntimeField("G10", "matchedAction")) return ["OBSERVED", "observed"];
      if (index === 6 && hasRuntimeField("G10", "policyDefault")) return ["OBSERVED", "observed"];
      if ([0,1,2,4,5,6].includes(index) && result) return ["UNRESOLVED BRANCH", "unresolved"];
    }

    if (id === "G11" && /new_dispatch/.test(result)) {
      if ([1,2,3].includes(index)) return ["NOT SELECTED", "derived"];
      if (index === 4) return ["OBSERVED", "observed"];
    }

    if (id === "G12" && /admit/.test(result)) {
      if ([0,1,2].includes(index)) return ["PATH COMPLETED", "derived"];
      if (index === 3) return ["OBSERVED", "observed"];
    }

    if (["G14","G15","G16"].includes(id)) {
      if (id === "G16" && index === 1 && stageResult("G17")) return ["DOWNSTREAM OBSERVED", "observed"];
      if (id === "G16" && index === 5 && stageResult("G18")) return ["RESOLVER OBSERVED", "observed"];
      if (response && ((id === "G14" && index >= 5) || (id === "G16" && index >= 6))) return ["SOURCE-DERIVED", "derived"];
      if (stageResult("G17") || stageResult("G18")) return ["SOURCE-CONFIRMED", "source"];
    }

    if (id === "G17") {
      if (index === 1 && stageResult("G17")) return ["OBSERVED", "observed"];
      if (index === 3 && stageResult("G17")) return ["SOURCE-CONFIRMED", "source"];
    }

    if (id === "G18") {
      if (index === 0 && stageResult("G18")) return ["OBSERVED", "observed"];
      if (index === 3 && response) return ["COMPLETED", "derived"];
      if (index === 4 && response) return ["RETURNED", "derived"];
    }

    return null;
  }

  function statusFor(id, index, inputs, outputs) {
    const special = specialStatus(id, index);
    if (special) return { label: special[0], tone: special[1] };
    const outObserved = outputs.some(item => item.evidence === "RUNTIME" || item.evidence === "NATIVE");
    if (outObserved) return { label: "OBSERVED", tone: "observed" };
    const outDerived = outputs.some(item => /SOURCE/.test(item.evidence));
    if (outDerived) return { label: "SOURCE-DERIVED", tone: "derived" };
    const inObserved = inputs.some(item => item.evidence === "RUNTIME" || item.evidence === "NATIVE" || item.evidence === "REQUEST");
    if (inObserved) return { label: "PARTIAL", tone: "partial" };
    return { label: "UNRESOLVED", tone: "unresolved" };
  }

  function knownOutcomeFacts(id, index) {
    const facts = [];
    const addResult = stageId => {
      const r = stageResult(stageId);
      if (r) facts.push({ label: `${stageId} observed result`, ...r });
    };

    const finalIndex = (STEP_KEYS[id] || []).length - 1;
    if (index === finalIndex) addResult(id);

    if (id === "G0" && index === 2) addResult("G1");
    if (id === "G0" && index === 3) { addResult("G1"); addResult("G2"); }
    if (id === "G2" && [1,3,4,5,6].includes(index)) addResult("G2");
    if (id === "G3" && [1,2].includes(index)) addResult("G3");
    if (id === "G10" && [0,1,2,4,5,6].includes(index)) addResult("G10");
    if (id === "G11" && [1,2,3].includes(index)) addResult("G11");
    if (id === "G12" && [0,1,2].includes(index)) addResult("G12");
    if (id === "G14" && [2,4].includes(index)) { addResult("G17"); addResult("G18"); }
    if (id === "G15") addResult("G17");
    if (id === "G16" && index === 1) addResult("G17");
    if (id === "G16" && index === 5) addResult("G18");
    if (id === "G17" && [1,3].includes(index)) addResult("G17");
    if (id === "G18" && [0,3,4].includes(index)) addResult("G18");

    if (["G14","G16","G18"].includes(id) && responseFact() && index >= (id === "G14" ? 5 : id === "G16" ? 6 : 3)) {
      facts.push({ label: "assistant reply", ...responseFact() });
    }
    return facts;
  }

  function interpretation(id, index, status, step) {
    const result = resultValue(id);
    if (id === "G10" && [0,1,2,4,5,6].includes(index) && status.label === "UNRESOLVED BRANCH") {
      return `The current run proves the final G10 decision is ${result || "known at stage level"}, but the trace does not identify which internal policy branch produced it. This step is therefore not credited with that result.`;
    }
    if (id === "G11" && [1,2,3].includes(index) && /new_dispatch/i.test(result)) {
      return "The observed G11 result is new_dispatch. Because these branches return earlier in the fixed source path, they were not selected for this run; their internal values were not separately emitted.";
    }
    if (["G14","G15","G16"].includes(id) && !runtimeEvents(id).length) {
      return `${step.detail} This boundary has no dedicated TraceClaw event in the current instrumentation; any path claim below is labeled SOURCE-CONFIRMED or SOURCE-DERIVED from surrounding observed stages.`;
    }
    if (status.label === "OBSERVED") return `${step.detail} The displayed output contains a runtime/native value captured for this run.`;
    if (status.label === "PARTIAL") return `${step.detail} Some inputs are known for this run, but the step-specific output was not emitted.`;
    if (/UNRESOLVED/.test(status.label)) return `${step.detail} The fixed source defines this step, but current runtime evidence is insufficient to determine its exact branch/value.`;
    return step.detail;
  }

  function inspect(s, index) {
    const spec = STEP_KEYS[s.id]?.[index] || { i: [], o: [] };
    const inputs = spec.i.map(key => fact(key, s.id));
    const outputs = spec.o.map(key => fact(key, s.id));
    const status = statusFor(s.id, index, inputs, outputs);
    return {
      status,
      inputs,
      outputs,
      knownFacts: knownOutcomeFacts(s.id, index),
      interpretation: interpretation(s.id, index, status, s.steps[index] || {}),
      directEvents: runtimeEvents(s.id).filter(event => Number(event?.stepIndex) === index),
      allEvents: runtimeEvents(s.id),
    };
  }

  window.GATEWAY_STEP_EVIDENCE = { inspect };
})();
