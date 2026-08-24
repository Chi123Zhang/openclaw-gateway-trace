(() => {
  const FLOW = {
    G0: {
      title: "Authentication state → nested authorization → final handshake",
      edges: [
        { to: "G1", type: "call", label: "call nested authorization", fields: ["sharedCredential", "authConfig"] },
        { to: "G2", type: "continue", label: "after G1 returns to G0", fields: ["authResult", "deviceIdentity", "role", "scopes"] },
      ],
      note: "G1 is nested inside G0. G0 resumes after G1 and only then hands the preliminary authentication state to G2.",
    },
    G1: {
      title: "Shared authorization returns to G0",
      edges: [{ to: "G0", type: "return", label: "return GatewayAuthResult", fields: ["sharedResult"] }],
      note: "G1 does not continue directly to G2; its result returns to the surrounding G0 call.",
    },
    G2: {
      title: "Authenticated connection → request authorization",
      edges: [{ to: "G3", type: "continue", label: "authenticated client state", fields: ["role", "scopes", "authMethod"] }],
      note: "G2 completes the connection handshake. A later chat.send request on that authenticated connection enters G3.",
    },
    G3: {
      title: "Method authorization → request validation",
      edges: [{ to: "G4", type: "continue", label: "allow continues", fields: ["method", "role", "scopes", "authResult"] }],
      stop: "A deny at G3 stops chat.send before G4.",
    },
    G4: {
      title: "Validated RPC envelope → message normalization",
      edges: [{ to: "G5", type: "data", label: "validated chat.send params", fields: ["sessionKey", "message", "attachments", "runId", "explicitOrigin"] }],
    },
    G5: {
      title: "Normalized request → requested-Agent resolution",
      edges: [{ to: "G6", type: "data", label: "normalized request state", fields: ["normalizedMessage", "sessionKey", "runId", "attachments"] }],
    },
    G6: {
      title: "Requested-Agent state → canonical Session resolution",
      edges: [{ to: "G7", type: "data", label: "Agent request + SessionKey", fields: ["requestedAgent", "sessionKey"] }],
    },
    G7: {
      title: "Canonical Session → Agent/Session validation",
      edges: [{ to: "G8", type: "data", label: "resolved Session state", fields: ["canonicalSessionKey", "sessionEntry", "sessionAgent"] }],
    },
    G8: {
      title: "Validated Session state → effective Agent resolution",
      edges: [{ to: "G9", type: "data", label: "valid Agent/Session state", fields: ["canonicalSessionKey", "sessionId", "requestedAgent"] }],
    },
    G9: {
      title: "Effective Agent → send-policy evaluation",
      edges: [{ to: "G10", type: "data", label: "effective Agent + Session routing state", fields: ["effectiveAgent", "canonicalSessionKey", "channel", "chatType"] }],
    },
    G10: {
      title: "Send-policy decision → dedupe classification",
      edges: [{ to: "G11", type: "continue", label: "allow continues", fields: ["sendPolicy", "runId", "canonicalSessionKey"] }],
      stop: "A deny returned by G10 is terminal for this send path; G11 is reached only when policy allows continuation.",
    },
    G11: {
      title: "Dedupe decision → execution admission",
      edges: [{ to: "G12", type: "continue", label: "new_dispatch continues", fields: ["dedupeState", "runId", "canonicalSessionKey"] }],
      stop: "Cached, pending, active or aborted branches can return before G12. new_dispatch is the path that continues.",
    },
    G12: {
      title: "Admitted run → context preparation",
      edges: [{ to: "G13", type: "data", label: "admitted execution state", fields: ["admissionDecision", "runId", "canonicalSessionKey", "latestSessionRevalidated"] }],
      note: "Attachment preparation, ACK/run registration and related pre-dispatch work occur between the G12 admission path and G13 MsgContext construction.",
    },
    G13: {
      title: "MsgContext → outer auto-reply dispatch",
      edges: [{ to: "G14", type: "data", label: "MsgContext + dispatcher", fields: ["msgBody", "canonicalSessionKey", "msgAgent", "msgChatType", "messageSid"] }],
    },
    G14: {
      title: "Outer dispatch coordinates G15 and G16",
      edges: [
        { to: "G15", type: "call", label: "call finalizeInboundContext(ctx)", fields: ["msgBody", "canonicalSessionKey", "msgAgent", "msgChatType"] },
        { to: "G16", type: "call", label: "after G15 returns FinalizedMsgContext", fields: ["g15Path", "canonicalSessionKey", "msgAgent"] },
        { to: "OUTPUT", type: "return", label: "finalize DispatchInboundResult", fields: ["dispatchResult"] },
      ],
      note: "G14 is the outer function. G15 and G16 are nested calls inside it; they are not flat sibling stages.",
    },
    G15: {
      title: "FinalizedMsgContext returns to G14",
      edges: [{ to: "G14", type: "return", label: "return FinalizedMsgContext", fields: ["msgBody", "canonicalSessionKey", "msgAgent", "msgChatType", "commandBody", "mediaState"] }],
      note: "G14 receives the finalized context and then invokes G16 with it.",
    },
    G16: {
      title: "Reply dispatch coordinates G17, G18, delivery, then returns to G14",
      edges: [
        { to: "G17", type: "call", label: "re-resolve downstream Agent", fields: ["canonicalSessionKey", "effectiveAgent"] },
        { to: "G18", type: "call", label: "after routing/policy/dedupe gates", fields: ["g16Path", "downstreamAgent"] },
        { to: "G14", type: "return", label: "return DispatchFromConfigResult", fields: ["dispatchResult", "response"] },
      ],
      note: "G17 and G18 are nested inside G16. After G18 returns replyResult, G16 continues filtering/delivery/completion before returning to G14.",
    },
    G17: {
      title: "Downstream Agent resolution returns to G16",
      edges: [{ to: "G16", type: "return", label: "return resolved Agent/config", fields: ["downstreamAgent", "canonicalSessionKey"] }],
    },
    G18: {
      title: "Reply resolver → deeper Agent Runtime → back to G16",
      edges: [
        { to: "AGENT RUNTIME", type: "call", label: "invoke selected reply resolver", fields: ["resolverSource", "resolver", "downstreamAgent"] },
        { to: "G16", type: "return", label: "replyResult returns", fields: ["replyResult", "response"] },
      ],
      note: "The deeper Reply / Agent Runtime is intentionally unnumbered. G18 is the resolver invocation boundary, not the model itself.",
    },
  };

  const LABEL = {
    method: "method", message: "message", normalizedMessage: "normalized message", sessionKey: "SessionKey",
    canonicalSessionKey: "canonical SessionKey", runId: "runId", role: "role", scopes: "scopes",
    authMethod: "auth method", authResult: "auth result", sharedResult: "shared auth result",
    sharedCredential: "shared credential", authConfig: "auth config", deviceIdentity: "device identity",
    attachments: "attachments", explicitOrigin: "origin", requestedAgent: "requested Agent",
    sessionAgent: "Session Agent", sessionEntry: "SessionEntry", sessionId: "sessionId",
    effectiveAgent: "effective Agent", downstreamAgent: "downstream Agent", channel: "channel", chatType: "chatType",
    sendPolicy: "sendPolicy", dedupeState: "dedupe", admissionDecision: "admission", latestSessionRevalidated: "Session revalidated",
    msgBody: "MsgContext.Body", msgAgent: "MsgContext.AgentId", msgChatType: "MsgContext.ChatType", messageSid: "MessageSid",
    commandBody: "command body", mediaState: "media", g15Path: "FinalizedMsgContext", g16Path: "G16 dispatch path",
    resolverSource: "resolver source", resolver: "resolver", replyResult: "replyResult", response: "response", dispatchResult: "dispatch result",
  };

  function currentStage() {
    try { return byId?.[activeStage] || null; } catch { return null; }
  }

  function inspect(stage, index) {
    return window.GATEWAY_STEP_EVIDENCE?.inspect?.(stage, index) || { inputs: [], outputs: [], knownFacts: [] };
  }

  function findFact(stage, key) {
    if (!stage) return null;
    for (let i = stage.steps.length - 1; i >= 0; i -= 1) {
      const model = inspect(stage, i);
      for (const item of [...(model.outputs || []), ...(model.inputs || []), ...(model.knownFacts || [])]) {
        if (item?.key === key && item?.observed && item?.value && !/^not observed/i.test(String(item.value))) return item;
      }
    }
    const meta = (() => { try { return CASE2 || {}; } catch { return {}; } })();
    const fallback = {
      sessionKey: meta.rawSessionKey,
      canonicalSessionKey: meta.canonicalSessionKey,
      runId: meta.runId,
      sessionId: meta.sessionId,
      effectiveAgent: meta.agent,
      downstreamAgent: meta.downstreamAgent,
      sendPolicy: meta.sendPolicy,
      dedupeState: meta.dedupeDecision,
      admissionDecision: meta.admissionDecision,
      resolverSource: meta.resolverSource,
      resolver: meta.resolver,
      response: meta.response ? `captured (${String(meta.response).length} chars)` : "",
    }[key];
    return fallback ? { value: String(fallback), evidence: "RUNTIME", observed: true } : null;
  }

  function evidenceLabel(item) {
    const text = String(item?.evidence || "").toUpperCase();
    if (text === "RUNTIME" || text === "NATIVE") return "observed";
    if (text === "REQUEST") return "request";
    if (text === "RESPONSE") return "response";
    if (text.includes("SOURCE")) return "derived";
    return "unknown";
  }

  function edgeFacts(stage, edge) {
    return (edge.fields || []).map(key => {
      const item = findFact(stage, key);
      return {
        key,
        label: LABEL[key] || key,
        value: item?.value || "not observed",
        evidence: item ? evidenceLabel(item) : "unknown",
        known: Boolean(item),
      };
    }).filter(item => item.known).slice(0, 4);
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
          <div class="stageHandoffEyebrow">Stage handoff</div>
          <div class="stageHandoffTitle" id="stageHandoffTitle">—</div>
        </div>
        <div class="stageHandoffSource">v2026.7.1-2 source path</div>
      </div>
      <div class="stageHandoffEdges" id="stageHandoffEdges"></div>
      <div class="stageHandoffNote" id="stageHandoffNote"></div>
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
      from.onclick = () => { if (typeof selectStage === "function") selectStage(stage.id); };

      const line = document.createElement("div");
      line.className = "stageHandoffLine";
      line.innerHTML = `<span class="stageHandoffPulse"></span><span class="stageHandoffRelation">${edge.label}</span><span class="stageHandoffArrow">→</span>`;

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

      const facts = edgeFacts(stage, edge);
      const data = document.createElement("div");
      data.className = "stageHandoffData";
      if (facts.length) {
        facts.forEach(item => {
          const fact = document.createElement("div");
          fact.className = "stageHandoffFact";
          const code = document.createElement("code");
          code.textContent = `${item.label} = ${item.value}`;
          fact.append(code, createChip(item.evidence, item.evidence));
          data.append(fact);
        });
      } else {
        const empty = document.createElement("div");
        empty.className = "stageHandoffEmpty";
        empty.textContent = "No transferred field is directly observed at this boundary.";
        data.append(empty);
      }
      row.append(route, data);
      root.append(row);
    });

    const note = document.getElementById("stageHandoffNote");
    const notes = [flow.note, flow.stop].filter(Boolean);
    note.textContent = notes.join(" ");
    note.hidden = !notes.length;
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
      const custom = labels[`${priorId}:${next}`];
      if (custom) node.setAttribute("data-flow-label", custom);
      node.classList.toggle("flowActive", activeStage === priorId);
      node.classList.toggle("flowPassed", completed?.has?.(next));
    });
  }

  function decorateVisibleFlow() {
    decorateLinearArrows(document.getElementById("connFlow"), ["G0", "G1", "G2"], {
      "G0:G1": "nested call",
      "G1:G2": "return to G0 · then G2",
    });
    const subflow = document.getElementById("subflow");
    const stageIds = [...subflow?.querySelectorAll?.('[data-id^="G"]') || []].map(node => node.dataset.id);
    const labels = {
      "G13:G14": "MsgContext",
      "G14:G15": "nested call",
      "G16:G17": "nested call",
      "G17:G18": "return to G16 · then G18",
    };
    decorateLinearArrows(subflow, stageIds, labels);
  }

  function install() {
    if (typeof renderAll === "function") {
      const previousAll = renderAll;
      renderAll = function renderAllWithStageHandoff(...args) {
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
      renderSubflow = function renderSubflowWithStageHandoff(...args) {
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
