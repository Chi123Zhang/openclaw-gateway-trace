(() => {
  const detail = document.querySelector("section.detail");
  if (!detail || detail.dataset.stageDashboardBound === "1") return;
  detail.dataset.stageDashboardBound = "1";

  const primary = [...detail.children].find(node => node.classList?.contains("summaryGrid"));
  if (!primary) return;

  /*
   * Human-readable one-line summaries are allowed here because they explain the
   * stage boundary. Concrete field names below remain exactly as recorded by the
   * runtime/source mapping; they are never renamed for presentation.
   */
  const FRIENDLY_BOUNDARY = {
    G0: {
      input: "Gateway authentication settings and the connection identity information.",
      output: "The initial authentication decision for this connection."
    },
    G1: {
      input: "The authentication method being used for this connection.",
      output: "Whether the shared credential is accepted."
    },
    G2: {
      input: "The authentication result, client role, and allowed permissions.",
      output: "A connection that is authenticated and ready to send requests."
    },
    G3: {
      input: "The requested action together with the caller's role and permissions.",
      output: "Whether this action is allowed to continue."
    },
    G4: {
      input: "The chat request: session, message, attachments, and request ID.",
      output: "A checked request that is ready for message processing."
    },
    G5: {
      input: "The user's message and any attached files.",
      output: "A cleaned message that is ready for routing."
    },
    G6: {
      input: "The session from the request and any Agent explicitly requested by the caller.",
      output: "Which Agent was requested, if one was specified."
    },
    G7: {
      input: "The raw session name supplied with the request.",
      output: "The canonical session the Gateway will use from this point on."
    },
    G8: {
      input: "The resolved session and the requested Agent, if any.",
      output: "Confirmation that the session and Agent combination is valid."
    },
    G9: {
      input: "The resolved session and any requested Agent.",
      output: "The Agent that will handle this request."
    },
    G10: {
      input: "The resolved session and the rules that control whether it may send.",
      output: "Whether this session is allowed to continue."
    },
    G11: {
      input: "This request's run ID and current session.",
      output: "Whether this is a new run or a duplicate of one already being handled."
    },
    G12: {
      input: "The latest session and run information immediately before execution.",
      output: "Whether the request is admitted to run now."
    },
    G13: {
      input: "The prepared message, session, Agent, request ID, and client permissions.",
      output: "One message context that carries everything needed by the reply path."
    },
    G14: {
      input: "The message context from G13 together with the reply settings.",
      output: "The result returned by the inbound message dispatch path."
    },
    G15: {
      input: "The message context created in G13.",
      output: "A finalized message context that is ready for reply dispatch."
    },
    G16: {
      input: "The finalized message context together with the reply settings.",
      output: "The reply-dispatch result returned to the caller."
    },
    G17: {
      input: "The current session and the Agent selected earlier in the flow.",
      output: "The Agent confirmed for the deeper reply run."
    },
    G18: {
      input: "The finalized message context and the settings used to produce a reply.",
      output: "The reply result after the selected reply path runs."
    }
  };

  const panel = document.createElement("section");
  panel.className = "stageVisualSummary";
  panel.id = "stageVisualSummary";
  panel.innerHTML = `
    <div class="stageVisualHero" id="stageVisualHero">
      <div class="stageVisualCode" id="stageVisualCode">G—</div>
      <div>
        <div class="stageVisualResult" id="stageVisualResult">—</div>
        <div class="stageVisualNote" id="stageVisualNote">Current selected Gateway stage</div>
      </div>
      <div class="stageVisualState" id="stageVisualState">waiting</div>
    </div>
    <div class="stageVisualMetrics">
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Seen in</span><b class="stageVisualMetricValue small" id="stageVisualEvidence">—</b></div>
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Agent</span><b class="stageVisualMetricValue" id="stageVisualAgent">—</b><span class="stageVisualMetricSub" id="stageVisualAgentSub">not resolved yet</span></div>
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Inputs</span><b class="stageVisualMetricValue" id="stageVisualInputs">0</b></div>
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Outputs</span><b class="stageVisualMetricValue" id="stageVisualOutputs">0</b></div>
    </div>
    <section class="stageIoAlwaysOpen" id="stageIoAlwaysOpen" aria-label="Stage input and output">
      <div class="stageIoHeader">
        <div>
          <strong>Input &amp; Output</strong>
          <span class="stageIoHeaderNote">What this step receives and what it produces</span>
        </div>
      </div>
      <div class="stageIoGrid">
        <article class="stageIoCard inputCard">
          <div class="stageIoVisualMark" aria-hidden="true">IN</div>
          <div class="stageIoCardBody">
            <div class="stageIoCardHead">
              <div><span class="stageIoEyebrow">INPUT</span><strong>What comes in</strong></div>
              <span class="stageIoCount" id="stageIoInputCount">0 fields</span>
            </div>
            <div class="stageIoAbstract" id="stageIoInputAbstract">—</div>
            <div class="stageIoSource" id="stageIoInputEvidence">—</div>
            <div class="stageIoRows" id="stageIoInputRows"></div>
            <pre class="stageIoValues" id="stageIoInputValues">—</pre>
          </div>
        </article>
        <div class="stageIoArrow" aria-hidden="true"><span>→</span></div>
        <article class="stageIoCard outputCard">
          <div class="stageIoVisualMark" aria-hidden="true">OUT</div>
          <div class="stageIoCardBody">
            <div class="stageIoCardHead">
              <div><span class="stageIoEyebrow">OUTPUT</span><strong>What goes out</strong></div>
              <span class="stageIoCount" id="stageIoOutputCount">0 fields</span>
            </div>
            <div class="stageIoAbstract" id="stageIoOutputAbstract">—</div>
            <div class="stageIoSource" id="stageIoOutputEvidence">—</div>
            <div class="stageIoRows" id="stageIoOutputRows"></div>
            <pre class="stageIoValues" id="stageIoOutputValues">—</pre>
          </div>
        </article>
      </div>
    </section>`;
  primary.insertAdjacentElement("beforebegin", panel);

  function stageNumber(id) {
    const match = String(id || "").match(/^G(\d+)$/);
    return match ? Number(match[1]) : -1;
  }

  function concreteLines(value) {
    const text = String(value || "").trim();
    if (!text || text === "—" || /not separately observed/i.test(text)) return [];
    if (/^No request-specific input field/i.test(text)) return [];
    return text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  }

  function countConcrete(value) {
    return concreteLines(value).length;
  }

  function currentStageData() {
    try { return byId?.[activeStage] || null; } catch { return null; }
  }

  function stageAgent(s) {
    const n = stageNumber(s?.id || activeStage);
    if (n < 9) return { value: "—", note: "resolved at G9" };

    try {
      if (n >= 17) {
        const downstream = String(CASE2?.downstreamAgent || "").trim();
        if (downstream) {
          const parts = downstream.split(/\s*→\s*/).filter(Boolean);
          return { value: parts.at(-1) || CASE2?.agent || "—", note: "re-confirmed at G17" };
        }
      }
      return { value: CASE2?.agent || "—", note: "resolved at G9" };
    } catch {
      return { value: "—", note: n >= 17 ? "re-confirmed at G17" : "resolved at G9" };
    }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value == null || value === "" ? "—" : String(value);
  }

  function friendlyEvidence(value) {
    const raw = String(value || "").toUpperCase();
    if (!raw || raw === "—") return "Source: not available";
    const hasRuntime = raw.includes("RUNTIME");
    const hasRequest = raw.includes("REQUEST");
    const hasSource = raw.includes("SOURCE");
    const mapped = raw.includes("MAPPED") || raw.includes("DERIVED") || raw.includes("FIXED");

    if (hasRuntime && hasSource) return mapped ? "Seen in this run · matched to source" : "Seen in this run · confirmed by source";
    if (hasRuntime) return "Seen in this run";
    if (hasRequest && hasSource) return "From request · checked against source";
    if (hasRequest) return "From request";
    if (hasSource) return mapped ? "From source mapping" : "From source";
    return `Source: ${String(value)}`;
  }

  function friendlyBoundaryText(stageId, side, fallback) {
    const mapped = FRIENDLY_BOUNDARY[stageId]?.[side];
    return mapped || fallback || "—";
  }

  function renderRows(containerId, fallbackId, value) {
    const container = document.getElementById(containerId);
    const fallback = document.getElementById(fallbackId);
    if (!container || !fallback) return;

    container.replaceChildren();
    const lines = concreteLines(value);
    let parsed = 0;

    for (const line of lines) {
      const match = line.match(/^([^=]+?)\s*=\s*(.*)$/);
      if (!match) continue;
      parsed += 1;
      const row = document.createElement("div");
      row.className = "stageIoRow";
      const rawKey = match[1].trim();
      const key = document.createElement("span");
      key.className = "stageIoKey";
      /* Preserve the exact runtime/source field name. */
      key.textContent = rawKey;
      const val = document.createElement("span");
      val.className = "stageIoValue";
      val.textContent = match[2].trim() || "—";
      row.append(key, val);
      container.append(row);
    }

    const useRows = parsed > 0 && parsed === lines.length;
    container.hidden = !useRows;
    fallback.hidden = useRows;
    fallback.textContent = value || "—";
  }

  function removeDiagnosticsTab() {
    detail.querySelectorAll('[data-stage-page="diagnostics"]').forEach(node => node.remove());
    if (detail.dataset.compactPage === "diagnostics") {
      detail.dataset.compactPage = "overview";
      detail.querySelector('[data-stage-page="overview"]')?.classList.add("active");
    }
  }

  function hideLegacyOverviewRows() {
    removeDiagnosticsTab();
    detail.querySelectorAll("button,summary,div,section").forEach(node => {
      if (node.id === "stageIoAlwaysOpen" || node.closest?.("#stageIoAlwaysOpen")) return;
      const text = (node.textContent || "").trim().replace(/\s+/g, " ");
      if (text === "Stage-level input / output" || text === "+ Stage-level input / output" || text === "Technical details" || text === "+ Technical details") {
        node.classList.add("legacyOverviewDisclosure");
      }
    });
  }

  function update() {
    const s = currentStageData();
    if (!s) return;

    const result = String(s.result || "—");
    const hero = document.getElementById("stageVisualHero");
    hero?.classList.toggle("source", result.includes("SOURCE"));
    hero?.classList.toggle("bad", s.tone === "warn" || /deny|reject|fail|error/i.test(result));

    setText("stageVisualCode", s.id || activeStage || "G—");
    setText("stageVisualResult", result);
    setText("stageVisualNote", s.title || "Current selected Gateway stage");
    setText("stageVisualState", result === "—" ? "waiting" : "current state");

    const stageEvidence = Array.isArray(s.evidence) ? s.evidence.join(" + ") : "—";
    setText("stageVisualEvidence", friendlyEvidence(stageEvidence).replace(/^Source:\s*/i, ""));

    const agent = stageAgent(s);
    setText("stageVisualAgent", agent.value);
    setText("stageVisualAgentSub", agent.note);

    const inputCount = countConcrete(s.concreteInput);
    const outputCount = countConcrete(s.concreteOutput);
    setText("stageVisualInputs", inputCount);
    setText("stageVisualOutputs", outputCount);
    setText("stageIoInputCount", `${inputCount} ${inputCount === 1 ? "field" : "fields"}`);
    setText("stageIoOutputCount", `${outputCount} ${outputCount === 1 ? "field" : "fields"}`);

    const stageId = s.id || activeStage;
    setText("stageIoInputAbstract", friendlyBoundaryText(stageId, "input", s.input));
    setText("stageIoOutputAbstract", friendlyBoundaryText(stageId, "output", s.output));
    setText("stageIoInputEvidence", friendlyEvidence(s.concreteInputEvidence));
    setText("stageIoOutputEvidence", friendlyEvidence(s.concreteOutputEvidence));
    renderRows("stageIoInputRows", "stageIoInputValues", s.concreteInput || "—");
    renderRows("stageIoOutputRows", "stageIoOutputValues", s.concreteOutput || "—");

    hideLegacyOverviewRows();
  }

  update();
  const title = document.getElementById("detailTitle");
  if (title) new MutationObserver(update).observe(title, { childList:true, subtree:true });

  ["concreteInput", "concreteOutput", "inputEvidence", "outputEvidence", "sideAgent"].forEach(id => {
    const el = document.getElementById(id);
    if (el) new MutationObserver(update).observe(el, {
      childList:true,
      subtree:true,
      characterData:true,
      attributes:true
    });
  });

  new MutationObserver(() => hideLegacyOverviewRows()).observe(detail, { childList:true, subtree:true });
})();