(() => {
  /*
   * Inter-stage flow is intentionally conservative.
   *
   * - sourceRelation/sourceExpr/sourceRef come from the fixed OpenClaw
   *   v2026.7.1-2 snapshot (commit 0790d9f...).
   * - runtime values are shown only when this run actually exposes them.
   * - a sequential stage is not called a data handoff unless the source passes
   *   the produced value into the next operation.
   */

  const FLOW = {
    G0: {
      title: "Connection auth state",
      edges: [
        {
          to: "G1",
          type: "call",
          relation: "nested call",
          sourceExpr: "authorizeWsControlUiGatewayConnect(...) → authResult",
          sourceRef: "src/gateway/server/ws-connection/auth-context.ts:144–153",
          fields: ["authResult"],
          note: "G1 runs inside resolveConnectAuthState; it is not a sibling stage after G0.",
        },
        {
          to: "G2",
          type: "data",
          relation: "return to handshake caller",
          sourceExpr: "resolveConnectAuthState(...) returns ConnectAuthState to message-handler",
          sourceRef: "auth-context.ts:170–185; message-handler.ts:941–957",
          fields: ["authResult", "authMethod", "deviceIdentity", "role", "scopes"],
          note: "G0 resumes after the nested authorization work and returns state used by the remaining handshake path.",
        },
      ],
    },
    G1: {
      title: "Shared-credential authorization",
      edges: [
        {
          to: "G0",
          type: "return",
          relation: "function return",
          sourceExpr: "GatewayAuthResult is assigned to authResult in resolveConnectAuthState",
          sourceRef: "src/gateway/server/ws-connection/auth-context.ts:144–153",
          fields: ["authResult"],
          note: "There is no direct G1 → G2 call in the source. Control returns to G0 first.",
        },
      ],
    },
    G2: {
      title: "Authenticated connection",
      edges: [
        {
          to: "G3",
          type: "prereq",
          relation: "connection prerequisite, not same call stack",
          sourceExpr: "later gateway request uses client.connect metadata established by handshake",
          sourceRef: "message-handler.ts:1038–2273; src/gateway/server-methods.ts:262–299, 722–805",
          fields: ["role", "scopes"],
          note: "G2 completes the WebSocket connection. G3 belongs to a later chat.send request on that authenticated connection.",
        },
      ],
    },
    G3: {
      title: "Method authorization",
      edges: [
        {
          to: "G4",
          type: "guard",
          relation: "authorization guard",
          sourceExpr: "authorizeGatewayMethod(...) must return null before handler invocation",
          sourceRef: "src/gateway/server-methods.ts:734–805",
          fields: ["method", "role", "scopes"],
          note: "G3 does not create the chat.send payload. It only permits the existing request to reach the handler.",
        },
      ],
    },
    G4: {
      title: "Validated chat.send request",
      edges: [
        {
          to: "G5",
          type: "data",
          relation: "validated field consumed next",
          sourceExpr: "sanitizeChatSendMessageInput(p.message)",
          sourceRef: "src/gateway/server-methods/chat.ts:3702–3778",
          fields: ["message"],
          note: "The validated p.message field is the direct input to message sanitization. Other request fields remain in the same handler scope.",
        },
      ],
    },
    G5: {
      title: "Message normalization",
      edges: [
        {
          to: "G6",
          type: "sequence",
          relation: "same handler; no direct G5 output consumed",
          sourceExpr: "requestedAgentId = resolveRequestedChatAgentId({ requestedSessionKey: rawSessionKey, agentId: agentIdOverride, ... })",
          sourceRef: "src/gateway/server-methods/chat.ts:3770–3808",
          fields: ["sessionKey", "runId"],
          note: "G6 reuses request/session fields already in scope. The normalized message itself is not an input to requested-Agent resolution.",
        },
      ],
    },
    G6: {
      title: "Requested Agent → Session loading",
      edges: [
        {
          to: "G7",
          type: "data",
          relation: "direct argument handoff",
          sourceExpr: "sessionLoadOptions = requestedAgentId ? { agentId: requestedAgentId } : undefined; loadSessionEntry(rawSessionKey, sessionLoadOptions)",
          sourceRef: "src/gateway/server-methods/chat.ts:3804–3849",
          fields: ["requestedAgent", "sessionKey"],
          note: "requestedAgentId affects sessionLoadOptions; rawSessionKey is passed directly to loadSessionEntry.",
        },
      ],
    },
    G7: {
      title: "Loaded Session state",
      edges: [
        {
          to: "G8",
          type: "data",
          relation: "loaded values consumed by validation",
          sourceExpr: "{ cfg, storePath, entry, canonicalKey: sessionKey, legacyKey } = loadSessionEntry(...)",
          sourceRef: "src/gateway/server-methods/chat.ts:3839–3863",
          fields: ["canonicalSessionKey", "sessionEntry"],
          note: "cfg/entry/sessionKey/legacyKey from session loading are used immediately by Agent/Session validation and deleted-Agent checks.",
        },
      ],
    },
    G8: {
      title: "Validated Agent/Session state",
      edges: [
        {
          to: "G9",
          type: "data",
          relation: "validated Agent selection consumed",
          sourceExpr: "resolveSessionAgentId({ sessionKey, config: cfg, agentId: selectedAgent.agentId })",
          sourceRef: "src/gateway/server-methods/chat.ts:3850–3868",
          fields: ["canonicalSessionKey", "sessionId"],
          note: "selectedAgent.agentId is produced by validation and passed into effective Agent resolution together with sessionKey/cfg.",
        },
      ],
    },
    G9: {
      title: "Effective Agent resolution",
      edges: [
        {
          to: "G10",
          type: "sequence",
          relation: "sequential control; G9 output is not a G10 argument",
          sourceExpr: "resolveSendPolicy({ cfg, entry, sessionKey, channel: entry?.channel, chatType: entry?.chatType })",
          sourceRef: "src/gateway/server-methods/chat.ts:3864–3905",
          fields: ["effectiveAgent"],
          note: "Important: agentId is not passed to resolveSendPolicy. G10 reuses cfg/entry/sessionKey loaded earlier at G7.",
        },
      ],
    },
    G10: {
      title: "Send-policy guard",
      edges: [
        {
          to: "G11",
          type: "guard",
          relation: "control gate only",
          sourceExpr: "if (sendPolicy === 'deny') { respond(...); return; }",
          sourceRef: "src/gateway/server-methods/chat.ts:3891–3905",
          fields: ["sendPolicy"],
          note: "sendPolicy is not passed into G11. Its role here is control flow: deny returns; otherwise execution continues to later request handling.",
        },
      ],
    },
    G11: {
      title: "Dedupe / in-flight guards",
      edges: [
        {
          to: "G12",
          type: "guard",
          relation: "early-return guards must all fall through",
          sourceExpr: "cached / aborted / pending / active / queued branches return before beginSessionWorkAdmission(...) is reached",
          sourceRef: "src/gateway/server-methods/chat.ts:3936–4244",
          fields: ["runId"],
          note: "No 'dedupe result object' is handed to G12. G12 is reached because none of the earlier terminal branches returned.",
        },
      ],
    },
    G12: {
      title: "Session work admission",
      edges: [
        {
          to: "G13",
          type: "guard",
          relation: "admission gates later context construction",
          sourceExpr: "beginSessionWorkAdmission(...) completes; pre-dispatch preparation continues before const ctx: MsgContext = {...}",
          sourceRef: "src/gateway/server-methods/chat.ts:4025–4244, 4248–4560",
          fields: ["runId", "canonicalSessionKey"],
          note: "G12 does not directly return a MsgContext. Attachment preparation, run registration and other pre-dispatch work occur before G13 builds ctx.",
        },
      ],
    },
    G13: {
      title: "MsgContext construction",
      edges: [
        {
          to: "G14",
          type: "data",
          relation: "direct object handoff",
          sourceExpr: "dispatchInboundMessage({ ctx, cfg, dispatcher, ... })",
          sourceRef: "src/gateway/server-methods/chat.ts:4503–4560, 4788–4797",
          fields: ["msgBody", "canonicalSessionKey", "msgAgent", "msgChatType", "messageSid"],
          note: "The MsgContext object built in G13 is passed directly as the ctx argument to dispatchInboundMessage.",
        },
      ],
    },
    G14: {
      title: "dispatchInboundMessage outer orchestration",
      edges: [
        {
          to: "G15",
          type: "call",
          relation: "nested call",
          sourceExpr: "finalized = finalizeInboundContext(params.ctx)",
          sourceRef: "src/auto-reply/dispatch.ts:528–551",
          fields: ["msgBody", "canonicalSessionKey", "msgAgent", "msgChatType"],
          note: "G15 is invoked inside G14 and returns a FinalizedMsgContext into the local variable finalized.",
        },
        {
          to: "G16",
          type: "call",
          relation: "nested call after G15 returns",
          sourceExpr: "dispatchReplyFromConfig({ ctx: finalized, cfg: params.cfg, dispatcher: params.dispatcher, ... })",
          sourceRef: "src/auto-reply/dispatch.ts:552–582",
          fields: ["canonicalSessionKey", "msgAgent"],
          note: "G16 receives the exact finalized context produced by G15.",
        },
        {
          to: "OUTPUT",
          type: "return",
          relation: "final return from G14",
          sourceExpr: "return finalizeDispatchResult(result, params.dispatcher)",
          sourceRef: "src/auto-reply/dispatch.ts:582–583",
          fields: ["dispatchResult"],
          note: "This happens only after G16 has returned its DispatchFromConfigResult.",
        },
      ],
    },
    G15: {
      title: "finalizeInboundContext",
      edges: [
        {
          to: "G14",
          type: "return",
          relation: "return value to caller",
          sourceExpr: "FinalizedMsgContext is assigned to G14 local variable finalized",
          sourceRef: "src/auto-reply/dispatch.ts:544–551; src/auto-reply/reply/inbound-context.ts:76–175",
          fields: ["msgBody", "canonicalSessionKey", "msgAgent", "msgChatType"],
          note: "G15 does not call G16 itself. It returns to G14; G14 then calls G16.",
        },
      ],
    },
    G16: {
      title: "dispatchReplyFromConfig",
      edges: [
        {
          to: "G17",
          type: "internal",
          relation: "internal resolution inside G16",
          sourceExpr: "sessionAgentId = resolveSessionAgentId(...); sessionAgentCfg = resolveAgentConfig(cfg, sessionAgentId)",
          sourceRef: "src/auto-reply/reply/dispatch-from-config.ts:1422–1427",
          fields: ["canonicalSessionKey", "downstreamAgent"],
          note: "G17 is a source-aligned internal resolution step inside G16, not a separate top-level dispatch function.",
        },
        {
          to: "G18",
          type: "call",
          relation: "later awaited resolver invocation inside G16",
          sourceExpr: "replyResolver(ctx, getReplyOptions(), replyConfig) → replyResult",
          sourceRef: "src/auto-reply/reply/dispatch-from-config.ts:3381–3811",
          fields: ["resolverSource", "downstreamAgent"],
          note: "Many G16 routing/policy/dedupe/hook operations occur between G17 and G18; they are not adjacent calls in source.",
        },
        {
          to: "G14",
          type: "return",
          relation: "DispatchFromConfigResult returns to outer caller",
          sourceExpr: "dispatchReplyFromConfig(...) resolves; G14 stores it in result",
          sourceRef: "src/auto-reply/dispatch.ts:561–583",
          fields: ["dispatchResult", "response"],
          note: "After G18 returns replyResult, G16 continues its remaining work before this return happens.",
        },
      ],
    },
    G17: {
      title: "Downstream Agent re-resolution",
      edges: [
        {
          to: "G16",
          type: "internal",
          relation: "local values remain inside G16",
          sourceExpr: "sessionAgentId and sessionAgentCfg are local variables used by later G16 logic",
          sourceRef: "src/auto-reply/reply/dispatch-from-config.ts:1422 onward",
          fields: ["downstreamAgent"],
          note: "There is no G17 function return boundary in the source; the G17 label represents this internal resolution point.",
        },
      ],
    },
    G18: {
      title: "Reply resolver invocation boundary",
      edges: [
        {
          to: "AGENT RUNTIME",
          type: "call",
          relation: "awaited resolver call",
          sourceExpr: "replyResult = await replyResolver(ctx, options, replyConfig)",
          sourceRef: "src/auto-reply/reply/dispatch-from-config.ts:3381–3811",
          fields: ["resolverSource", "downstreamAgent"],
          note: "This call crosses into the deeper Reply / Agent Runtime. The deeper runtime is intentionally unnumbered.",
        },
        {
          to: "G16",
          type: "return",
          relation: "resolver return resumes G16",
          sourceExpr: "replyResult receives the awaited resolver result; execution continues after the call",
          sourceRef: "src/auto-reply/reply/dispatch-from-config.ts:3381–3812 onward",
          fields: ["replyResult", "response"],
          note: "G18 does not directly return to G14. It returns into the still-running G16 function.",
        },
      ],
    },
  };

  const LABEL = {
    method: "method",
    message: "message",
    sessionKey: "SessionKey",
    canonicalSessionKey: "canonical SessionKey",
    runId: "runId",
    role: "role",
    scopes: "scopes",
    authMethod: "auth method",
    authResult: "auth result",
    requestedAgent: "requested Agent",
    sessionEntry: "SessionEntry",
    sessionId: "sessionId",
    effectiveAgent: "effective Agent",
    downstreamAgent: "downstream Agent",
    sendPolicy: "sendPolicy",
    msgBody: "MsgContext.Body",
    msgAgent: "MsgContext.AgentId",
    msgChatType: "MsgContext.ChatType",
    messageSid: "MessageSid",
    resolverSource: "resolver source",
    replyResult: "replyResult",
    response: "response",
    dispatchResult: "dispatch result",
    deviceIdentity: "device identity",
  };

  function currentStage() {
    try { return byId?.[activeStage] || null; } catch { return null; }
  }

  function inspect(stage, index) {
    return window.GATEWAY_STEP_EVIDENCE?.inspect?.(stage, index) || { inputs: [], outputs: [], knownFacts: [] };
  }

  function findObservedFact(stage, key) {
    if (!stage) return null;
    for (let i = stage.steps.length - 1; i >= 0; i -= 1) {
      const model = inspect(stage, i);
      for (const item of [...(model.outputs || []), ...(model.inputs || []), ...(model.knownFacts || [])]) {
        if (item?.key !== key || !item?.observed || !item?.value) continue;
        if (/^not observed/i.test(String(item.value))) continue;
        return item;
      }
    }
    return null;
  }

  function requestFact(key) {
    const meta = (() => { try { return CASE2 || {}; } catch { return {}; } })();
    const mapping = {
      sessionKey: meta.rawSessionKey,
      runId: meta.runId,
      message: meta.prompt,
    };
    const value = mapping[key];
    return value ? { value: String(value), evidence: "REQUEST", observed: true } : null;
  }

  function factForEdge(stage, key) {
    return findObservedFact(stage, key) || requestFact(key);
  }

  function evidenceLabel(item) {
    const text = String(item?.evidence || "").toUpperCase();
    if (text === "RUNTIME") return "observed";
    if (text === "NATIVE") return "native";
    if (text === "REQUEST") return "request";
    if (text === "RESPONSE") return "response";
    if (text.includes("SOURCE")) return "derived";
    return "unknown";
  }

  function edgeFacts(stage, edge) {
    return (edge.fields || []).map(key => {
      const item = factForEdge(stage, key);
      return {
        key,
        label: LABEL[key] || key,
        value: item?.value || "not observed at this boundary",
        evidence: item ? evidenceLabel(item) : "unknown",
        known: Boolean(item),
      };
    });
  }

  function createChip(text, tone) {
    const chip = document.createElement("span");
    chip.className = `stageHandoffChip ${tone || ""}`;
    chip.textContent = text;
    return chip;
  }

  function ensurePanel() {
    const detail = document.querySelector("section.detail");
    const process = detail?.querySelector(".processSection");
    if (!detail || !process) return null;
    let panel = document.getElementById("stageHandoffPanel");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.className = "stageHandoffPanel";
    panel.id = "stageHandoffPanel";
    panel.innerHTML = `
      <div class="stageHandoffHead">
        <div>
          <div class="stageHandoffEyebrow">Verified stage relation</div>
          <div class="stageHandoffTitle" id="stageHandoffTitle">—</div>
        </div>
        <div class="stageHandoffSource">OpenClaw v2026.7.1-2 · 0790d9f</div>
      </div>
      <div class="stageHandoffEdges" id="stageHandoffEdges"></div>
    `;
    process.insertAdjacentElement("beforebegin", panel);
    return panel;
  }

  function renderPanel(stage = currentStage()) {
    const panel = ensurePanel();
    if (!panel || !stage) return;
    const flow = FLOW[stage.id];
    if (!flow) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    document.getElementById("stageHandoffTitle").textContent = `${stage.id} · ${flow.title}`;
    const root = document.getElementById("stageHandoffEdges");
    root.innerHTML = "";

    flow.edges.forEach((edge, edgeIndex) => {
      const row = document.createElement("div");
      row.className = `stageHandoffEdge ${edge.type}`;
      row.style.setProperty("--handoff-delay", `${edgeIndex * 150}ms`);

      const route = document.createElement("div");
      route.className = "stageHandoffRoute";
      const from = document.createElement("button");
      from.type = "button";
      from.className = "stageHandoffNode current";
      from.textContent = stage.id;

      const line = document.createElement("div");
      line.className = "stageHandoffLine";
      const pulse = document.createElement("span");
      pulse.className = "stageHandoffPulse";
      const relation = document.createElement("span");
      relation.className = "stageHandoffRelation";
      relation.textContent = edge.relation;
      const arrow = document.createElement("span");
      arrow.className = "stageHandoffArrow";
      arrow.textContent = "→";
      line.append(pulse, relation, arrow);

      const to = document.createElement("button");
      to.type = "button";
      to.className = "stageHandoffNode target";
      to.textContent = edge.to;
      if (/^G\d+$/.test(edge.to)) {
        to.onclick = () => {
          if (typeof selectStage === "function") selectStage(edge.to);
          requestAnimationFrame(() => renderPanel(currentStage()));
        };
      } else {
        to.disabled = true;
      }
      route.append(from, line, to);

      const sourceBlock = document.createElement("div");
      sourceBlock.className = "stageHandoffVerified";
      const expr = document.createElement("code");
      expr.className = "stageHandoffExpr";
      expr.textContent = edge.sourceExpr;
      const ref = document.createElement("span");
      ref.className = "stageHandoffRef";
      ref.textContent = edge.sourceRef;
      sourceBlock.append(expr, ref);

      const facts = edgeFacts(stage, edge);
      const data = document.createElement("div");
      data.className = "stageHandoffData";
      facts.forEach(item => {
        const fact = document.createElement("div");
        fact.className = `stageHandoffFact ${item.known ? "known" : "unknown"}`;
        const code = document.createElement("code");
        code.textContent = `${item.label} = ${item.value}`;
        fact.append(code, createChip(item.evidence, item.evidence));
        data.append(fact);
      });

      const note = document.createElement("div");
      note.className = "stageHandoffNote";
      note.textContent = edge.note;

      row.append(route, sourceBlock, data, note);
      root.append(row);
    });
  }

  function decorateLinearArrows(root, ids, labels = {}) {
    if (!root) return;
    const children = [...root.children];
    let priorId = null;
    children.forEach(node => {
      const id = node?.dataset?.id;
      if (/^G\d+$/.test(id || "")) {
        priorId = id;
        return;
      }
      if (!node.classList?.contains("arrow") || !priorId) return;
      const index = ids.indexOf(priorId);
      const next = ids[index + 1];
      if (!next) return;
      node.dataset.from = priorId;
      node.dataset.to = next;
      node.classList.add("stageFlowArrow");
      node.setAttribute("data-flow-label", labels[`${priorId}:${next}`] || "source order");
      node.classList.toggle("flowActive", activeStage === priorId);
      node.classList.toggle("flowPassed", completed?.has?.(next));
    });
  }

  function decorateVisibleFlow() {
    decorateLinearArrows(document.getElementById("connFlow"), ["G0", "G1", "G2"], {
      "G0:G1": "nested call",
      "G1:G2": "G1 → G0 return; then G2",
    });

    const subflow = document.getElementById("subflow");
    const stageIds = [...(subflow?.querySelectorAll?.('[data-id^="G"]') || [])].map(node => node.dataset.id);
    const labels = {
      "G3:G4": "auth guard",
      "G4:G5": "p.message",
      "G5:G6": "same handler",
      "G6:G7": "requestedAgentId + rawSessionKey",
      "G7:G8": "loaded Session state",
      "G8:G9": "selectedAgent.agentId",
      "G9:G10": "sequential; no Agent handoff",
      "G10:G11": "policy guard",
      "G11:G12": "fall-through after dedupe guards",
      "G12:G13": "admission + pre-dispatch prep",
      "G13:G14": "ctx",
      "G14:G15": "nested call",
      "G15:G16": "G15 → G14 return; then G16",
      "G16:G17": "internal resolution",
      "G17:G18": "G16 continues; later G18",
    };
    decorateLinearArrows(subflow, stageIds, labels);
  }

  function install() {
    if (typeof renderAll === "function") {
      const previousAll = renderAll;
      renderAll = function renderAllWithVerifiedStageFlow(...args) {
        const result = previousAll(...args);
        requestAnimationFrame(() => {
          decorateVisibleFlow();
          renderPanel(currentStage());
        });
        return result;
      };
    }

    if (typeof renderSubflow === "function") {
      const previousSubflow = renderSubflow;
      renderSubflow = function renderSubflowWithVerifiedStageFlow(...args) {
        const result = previousSubflow(...args);
        requestAnimationFrame(decorateVisibleFlow);
        return result;
      };
    }

    ensurePanel();
    decorateVisibleFlow();
    renderPanel(currentStage());

    document.addEventListener("click", event => {
      if (!event.target.closest?.('[data-id^="G"]')) return;
      requestAnimationFrame(() => renderPanel(currentStage()));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
