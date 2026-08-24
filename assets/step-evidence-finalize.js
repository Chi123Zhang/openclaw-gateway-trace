(() => {
  const base = window.GATEWAY_STEP_EVIDENCE;
  if (!base?.inspect) return;

  const CONCRETE_KEYS = {
    normalizedMessage: ["normalized message", "parsed_message"],
    canonicalSessionKey: ["canonical sessionkey", "msgcontext.sessionkey", "finalizedmsgcontext.sessionkey"],
    sessionId: ["backing sessionid", "sessionid"],
    effectiveAgent: ["effective agentid", "agentid"],
    downstreamAgent: ["downstream agent", "sessionagentid"],
    sessionEntry: ["sessionentry"],
    sendPolicy: ["sendpolicy"],
    dedupeState: ["run classification", "dedupedecision"],
    admissionDecision: ["work admission", "admissiondecision"],
    latestSessionRevalidated: ["latest_session_revalidated", "latest session revalidated"],
    msgBody: ["msgcontext.body", "finalizedmsgcontext.body"],
    msgAgent: ["msgcontext.agentid", "finalizedmsgcontext.agentid"],
    msgChatType: ["msgcontext.chattype", "finalizedmsgcontext.chattype"],
    messageSid: ["msgcontext.messagesid"],
    mediaState: ["media", "media changes"],
    resolverSource: ["resolversource"],
    resolver: ["resolver"],
    g14Path: ["dispatchinboundmessage"],
    g16Path: ["path"],
    replyResult: ["replyresult"],
    dispatchResult: ["dispatchfromconfigresult", "dispatch result"],
  };

  const normalize = value => String(value || "").toLowerCase().replace(/[^a-z0-9.]+/g, "");

  function parseConcrete(stage, side, key) {
    const raw = side === "input" ? stage?.concreteInput : stage?.concreteOutput;
    const evidenceRaw = side === "input" ? stage?.concreteInputEvidence : stage?.concreteOutputEvidence;
    if (!raw) return null;
    const aliases = (CONCRETE_KEYS[key] || []).map(normalize);
    if (!aliases.length) return null;
    for (const line of String(raw).split("\n")) {
      const match = line.match(/^\s*([^=:]+?)\s*(?:=|:)\s*(.*?)\s*$/);
      if (!match) continue;
      const label = normalize(match[1]);
      if (!aliases.some(alias => label === alias || label.endsWith(alias) || alias.endsWith(label))) continue;
      const evidence = /RUNTIME/i.test(evidenceRaw || "") ? "RUNTIME"
        : /NATIVE/i.test(evidenceRaw || "") ? "NATIVE"
        : /SOURCE/i.test(evidenceRaw || "") ? "SOURCE-DERIVED"
        : "CONTEXT";
      return { value: match[2], evidence, source: `${stage.id} ${side} context` };
    }
    return null;
  }

  function fillUnknown(stage, item, side) {
    if (item?.observed) return item;
    const concrete = parseConcrete(stage, side, item?.key);
    if (!concrete) return item;
    return { ...item, ...concrete, observed: true };
  }

  function runtimeField(stage, names) {
    const wanted = names.map(normalize);
    const events = Array.isArray(stage?.runtimeEvents) ? stage.runtimeEvents : [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const fields = { ...(events[i]?.fields || {}) };
      if (events[i]?.result !== undefined) fields.result = events[i].result;
      for (const [key, value] of Object.entries(fields)) {
        if (value === null || value === undefined || value === "") continue;
        if (wanted.includes(normalize(key))) return { value: String(value), event: events[i]?.event || "runtime event" };
      }
    }
    return null;
  }

  function stageResult(stage) {
    const value = String(stage?.result || "");
    return value && value !== "—" && value !== "not separately observed" ? value : "";
  }

  function makeUnknown(item, why) {
    return {
      ...item,
      value: "not observed for this branch",
      evidence: "NOT OBSERVED",
      source: why,
      observed: false,
    };
  }

  function addKnown(model, label, value, evidence = "RUNTIME", source = "stage result") {
    if (!value) return;
    if (model.knownFacts.some(item => item.label === label && String(item.value) === String(value))) return;
    model.knownFacts.push({ label, value: String(value), evidence, source });
  }

  function setStatus(model, label, tone, interpretation) {
    model.status = { label, tone };
    if (interpretation) model.interpretation = interpretation;
  }

  function finalizeG0(stage, index, model) {
    const g1 = window.byId?.G1;
    const g2 = window.byId?.G2;
    const r1 = stageResult(g1).toLowerCase();
    const r2 = stageResult(g2).toLowerCase();
    if (index === 2 && r1) {
      setStatus(model, "OBSERVED VIA G1", "observed", `This authorization call is the nested G1 boundary. The observed G1 result for this run is ${stageResult(g1)}.`);
      addKnown(model, "G1 shared credential result", stageResult(g1));
    }
    if (index === 3) {
      if (/allow|authorized|pass/.test(r1)) setStatus(model, "NOT REACHED", "muted", "G1 already authorized the shared-credential path, so the fallback-preservation branch is not required for this connection.");
      else if (r1 && /pass|authorized|allow/.test(r2)) setStatus(model, "SOURCE-DERIVED", "derived", "G1 did not authorize, while G2 later succeeded. The fallback authentication path therefore remained available; its exact candidate fields were not all emitted.");
    }
    if (index === 4 && stageResult(stage)) addKnown(model, "G0 observed auth-state result", stageResult(stage));
  }

  function finalizeG1(stage, index, model) {
    const result = stageResult(stage);
    if (index === 2 && result) setStatus(model, "OBSERVED", "observed", `The shared-credential authorization boundary emitted ${result} for this connection.`);
    if (index === 3 && result) setStatus(model, "SOURCE-CONFIRMED", "source", `The observed G1 result (${result}) returns to the surrounding G0 auth-state resolution.`);
  }

  function finalizeG2(stage, index, model) {
    const g1 = window.byId?.G1;
    const r1 = stageResult(g1).toLowerCase();
    const r2 = stageResult(stage);
    if ([2,3].includes(index) && /allow|authorized|pass/.test(r1)) {
      setStatus(model, "NOT REQUIRED", "muted", "The shared-credential path was already authorized at G1, so a fallback device-token verification is not required to explain this run.");
    } else if ([2,3].includes(index) && r1 && r2) {
      setStatus(model, "PATH REQUIRED", "derived", `G1 returned ${stageResult(g1)} and final G2 returned ${r2}; the fallback authentication path is therefore part of the successful connection path.`);
    }
    if ([4,5,6].includes(index) && r2) addKnown(model, "G2 final authentication result", r2);
  }

  function finalizeG3(stage, index, model) {
    const scopes = runtimeField(stage, ["scopes", "requestedScopes", "clientScopes"]);
    const result = stageResult(stage);
    if (index === 1 && scopes) {
      if (scopes.value.includes("operator.admin")) setStatus(model, "TAKEN", "observed", "operator.admin is present in the observed scopes, so the administrator shortcut authorizes chat.send.");
      else setStatus(model, "NOT TAKEN", "muted", "operator.admin is not present in the observed scopes, so authorization continues to the method-required scope check.");
    }
    if (index === 2 && scopes) {
      if (!scopes.value.includes("operator.admin") && scopes.value.includes("operator.write") && /allow/.test(result.toLowerCase())) setStatus(model, "TAKEN", "observed", "The observed scopes include operator.write and the method result is allow; this is the effective non-admin authorization path.");
      else if (scopes.value.includes("operator.admin")) setStatus(model, "NOT REACHED", "muted", "The administrator shortcut returned before the required-scope branch.");
    }
  }

  function finalizeG4(stage, index, model) {
    const result = stageResult(stage);
    if (index === 0 && result) setStatus(model, "PASSED", "observed", `The chat.send envelope reached G4 and the observed validation result is ${result}.`);
    if (index === 1) setStatus(model, "NOT SUPPLIED", "muted", "The live viewer does not submit an explicit origin object, so there is no origin route to normalize for this run.");
    if (index === 2) setStatus(model, "NOT TRIGGERED", "muted", "The live viewer does not submit privileged provenance/origin fields. The guard remains part of the source path but has no protected field to reject here.");
  }

  function finalizeG5(stage, index, model) {
    const result = stageResult(stage);
    if (index === 0 && /unchanged/i.test(result)) setStatus(model, "UNCHANGED", "observed", "G5 reports an unchanged message, so the normalized message equals the submitted prompt for this run.");
    if (index === 2) setStatus(model, "NO ATTACHMENTS", "muted", "The current live request contains no attachments, so attachment normalization has no payload to transform.");
    if (index === 4 && result) addKnown(model, "G5 message-state result", result);
  }

  function finalizeG6(stage, index, model) {
    if (index === 0) setStatus(model, "NO EXPLICIT AGENT", "muted", "The current live API request does not include an agentId override.");
    if (index === 1) setStatus(model, "SKIPPED", "muted", "There is no explicit agentId value to normalize in this request.");
    if (index >= 2 && stageResult(stage)) addKnown(model, "G6 requested-Agent state", stageResult(stage));
  }

  function finalizeG7(stage, index, model) {
    const canonical = parseConcrete(stage, "output", "canonicalSessionKey");
    const entry = parseConcrete(stage, "output", "sessionEntry");
    if (index === 0 && canonical) setStatus(model, "RESOLVED", canonical.evidence === "RUNTIME" ? "observed" : "derived", `The canonical SessionKey for this run is ${canonical.value}.`);
    if (index === 3 && entry) setStatus(model, "RESOLVED", entry.evidence === "RUNTIME" ? "observed" : "derived", `The SessionEntry is ${entry.value} in the available stage evidence.`);
    if (index === 4 && canonical) addKnown(model, "canonical SessionKey", canonical.value, canonical.evidence, canonical.source);
  }

  function finalizeG8(stage, index, model) {
    const result = stageResult(stage);
    const sid = parseConcrete(stage, "output", "sessionId");
    if ([0,1].includes(index) && result) setStatus(model, "PASSED", "derived", `G8 completed with ${result}. The trace does not separately emit each internal compatibility/deleted-Agent check, so only the successful stage outcome is asserted.`);
    if (index === 2 && sid) {
      setStatus(model, "CONFIRMED", sid.evidence === "RUNTIME" ? "observed" : "derived", `The validated Agent–Session path continues with backing sessionId ${sid.value}.`);
      addKnown(model, "backing sessionId", sid.value, sid.evidence, sid.source);
    }
  }

  function finalizeG9(stage, index, model) {
    const result = stageResult(stage);
    if (index === 1) setStatus(model, "SKIPPED", "muted", "No explicit agentId override was supplied by the live request.");
    if (index === 2) setStatus(model, "SOURCE-DERIVED", "derived", "The SessionKey is agent-scoped, so the Agent component can be parsed from the SessionKey even when that parse is not a standalone event.");
    if (index === 4 && result) setStatus(model, "OBSERVED", "observed", `G9 emits the effective Agent for this run: ${result}.`);
  }

  function finalizeG10(stage, index, model) {
    const final = stageResult(stage);
    const directKeys = {
      0:["entrySendPolicy","sessionEntrySendPolicy"],
      1:["configuredSendPolicy","sessionSendPolicy"],
      2:["ambiguousPeerShape","hasAmbiguousPeerShape"],
      4:["matchedRule","matchedRuleIndex","ruleIndex"],
      5:["matchedAction","ruleAction"],
      6:["policyDefault","defaultPolicy"],
    };
    if (directKeys[index] && !runtimeField(stage, directKeys[index])) {
      model.outputs = model.outputs.map(item => makeUnknown(item, "The current G10 event records the final policy result, not this internal branch value."));
      setStatus(model, "UNRESOLVED BRANCH", "unresolved", `The final G10 result is ${final || "observed at stage level"}, but the trace does not identify whether this internal branch produced it. The stage result is shown below as context and is not attributed to this step.`);
      addKnown(model, "G10 final sendPolicy", final);
    }
    if (index === 3) {
      const channel = runtimeField(stage, ["channel", "originChannel", "lastChannel"]);
      const chatType = runtimeField(stage, ["chatType"]);
      if (channel || chatType) setStatus(model, "PARTIALLY OBSERVED", "partial", "Routing metadata is prepared for rule matching. Only fields emitted in the runtime event are shown as observed; the rest remain unknown.");
    }
  }

  function finalizeG11(stage, index, model) {
    const result = stageResult(stage);
    if (/new_dispatch/i.test(result) && [1,2,3].includes(index)) {
      model.outputs = model.outputs.map(item => makeUnknown(item, "This early-return branch was not selected; its internal cached/pending/aborted value was not emitted."));
      setStatus(model, "NOT SELECTED", "derived", "G11 ultimately reports new_dispatch. These branches would terminate earlier in the fixed source path, so they were not selected for this run. Their internal lookup values are still not claimed as observed.");
      addKnown(model, "G11 observed classification", result);
    }
    if (index === 4 && result) setStatus(model, "OBSERVED", "observed", `The request is classified as ${result}.`);
  }

  function finalizeG12(stage, index, model) {
    const result = stageResult(stage);
    if ([0,1,2].includes(index) && /admit/i.test(result)) {
      setStatus(model, "PATH COMPLETED", "derived", `The observed G12 result is ${result}. The admission path completed, but this sub-step's internal reservation fields were not necessarily emitted.`);
      addKnown(model, "G12 observed admission", result);
    }
    if (index === 3 && result) setStatus(model, "OBSERVED", "observed", `The final admission decision is ${result}.`);
  }

  function finalizeG13(stage, index, model) {
    const result = stageResult(stage);
    if (index === 6) setStatus(model, "NO MEDIA", "muted", "The live request has no attachments, so no staged-media fields are attached to MsgContext.");
    if (index === 7) setStatus(model, "NO MEDIA", "muted", "There are no managed-media fields to merge for this run.");
    if (index === 8 && result) setStatus(model, "SOURCE-CONFIRMED", "source", "The constructed MsgContext is passed into the source-defined G14 boundary. G14 is not a standalone TraceClaw event in the current live instrumentation.");
  }

  function finalizeG14(stage, index, model) {
    if ([0,1,2,3,4].includes(index)) setStatus(model, "SOURCE-CONFIRMED", "source", "This step is part of the verified dispatchInboundMessage source path. The live instrumentation does not emit a dedicated G14 sub-step event, so no runtime value is invented here.");
    if (index === 2) addKnown(model, "downstream G17", stageResult(window.byId?.G17));
    if (index === 4) addKnown(model, "downstream G18", stageResult(window.byId?.G18));
    if (index >= 5 && window.CASE2?.response) setStatus(model, "SOURCE-DERIVED", "derived", "A completed assistant reply confirms that control returned through the surrounding dispatch path, but the DispatchInboundResult object fields were not separately emitted.");
  }

  function finalizeG15(stage, index, model) {
    setStatus(model, "SOURCE-CONFIRMED", "source", "This normalization step exists in finalizeInboundContext in the fixed source snapshot. Current live instrumentation does not emit a dedicated G15 sub-step runtime event; only values supported by surrounding context are displayed.");
    if (index === 5 && String(window.CASE2?.prompt || "") && !/attachment/i.test(String(window.CASE2?.prompt))) {
      // Do not infer media absence from prompt text; request-level attachment state is handled elsewhere.
    }
    if (index === 6) addKnown(model, "downstream G17", stageResult(window.byId?.G17));
  }

  function finalizeG16(stage, index, model) {
    if (index === 1 && stageResult(window.byId?.G17)) {
      setStatus(model, "DOWNSTREAM OBSERVED", "observed", `The nested G17 event directly observes Agent re-resolution: ${stageResult(window.byId?.G17)}.`);
      addKnown(model, "G17 Agent re-resolution", stageResult(window.byId?.G17));
      return;
    }
    if (index === 5 && stageResult(window.byId?.G18)) {
      setStatus(model, "RESOLVER OBSERVED", "observed", `The nested G18 event directly observes resolver selection: ${stageResult(window.byId?.G18)}.`);
      addKnown(model, "G18 resolver selection", stageResult(window.byId?.G18));
      return;
    }
    if (index >= 6 && window.CASE2?.response) {
      setStatus(model, "SOURCE-DERIVED", "derived", "The assistant reply exists, so the resolver returned and the surrounding G16 path continued. Filtering/delivery result fields are not separately emitted and remain unclaimed.");
      return;
    }
    setStatus(model, "SOURCE-CONFIRMED", "source", "This is a verified G16 source step. The current TraceClaw instrumentation does not emit this internal sub-step as its own runtime event.");
  }

  function finalizeG17(stage, index, model) {
    const result = stageResult(stage);
    if (index === 1 && result) setStatus(model, "OBSERVED", "observed", `G17 directly records the downstream Agent re-resolution: ${result}.`);
    if (index === 2 && result) setStatus(model, "SOURCE-DERIVED", "derived", "The resolved Agent configuration is loaded immediately after the observed Agent ID. The configuration object itself is not emitted.");
    if (index === 3 && result) setStatus(model, "SOURCE-CONFIRMED", "source", "Control returns to the surrounding G16 flow after the observed G17 Agent resolution.");
  }

  function finalizeG18(stage, index, model) {
    const result = stageResult(stage);
    const resolverSource = runtimeField(stage, ["resolverSource"]);
    if (index === 0 && (result || resolverSource)) setStatus(model, "OBSERVED", "observed", `G18 directly records resolver selection${resolverSource ? `: ${resolverSource.value}` : ""}.`);
    if (index === 1) setStatus(model, "NOT SEPARATELY OBSERVED", "unresolved", "The source constructs the full runtime reply configuration here, but the current G18 event does not emit the resulting configuration object.");
    if (index === 2) setStatus(model, "SOURCE-CONFIRMED", "source", "The source marks Agent dispatch start immediately before resolver execution; no dedicated TraceClaw field is emitted for this marker.");
    if (index === 3 && window.CASE2?.response) setStatus(model, "COMPLETED", "derived", "A final assistant reply exists, proving that the resolver invocation completed. The deeper Agent Runtime payload is not yet instrumented at this boundary.");
    if (index === 4 && window.CASE2?.response) setStatus(model, "RETURNED", "derived", "The reply returned to the surrounding G16 control flow. The replyResult object itself is not separately captured in the current Gateway event.");
  }

  const FINALIZERS = {
    G0: finalizeG0, G1: finalizeG1, G2: finalizeG2, G3: finalizeG3, G4: finalizeG4,
    G5: finalizeG5, G6: finalizeG6, G7: finalizeG7, G8: finalizeG8, G9: finalizeG9,
    G10: finalizeG10, G11: finalizeG11, G12: finalizeG12, G13: finalizeG13,
    G14: finalizeG14, G15: finalizeG15, G16: finalizeG16, G17: finalizeG17, G18: finalizeG18,
  };

  const originalInspect = base.inspect.bind(base);
  base.inspect = (stage, index) => {
    const model = originalInspect(stage, index);
    model.inputs = (model.inputs || []).map(item => fillUnknown(stage, item, "input"));
    model.outputs = (model.outputs || []).map(item => fillUnknown(stage, item, "output"));
    model.knownFacts = Array.isArray(model.knownFacts) ? model.knownFacts : [];
    FINALIZERS[stage?.id]?.(stage, index, model);
    return model;
  };
})();
