(() => {
  const detail = document.querySelector("section.detail");
  if (!detail || detail.dataset.stageDashboardBound === "1") return;
  detail.dataset.stageDashboardBound = "1";

  const primary = [...detail.children].find(node => node.classList?.contains("summaryGrid"));
  if (!primary) return;

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
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Evidence</span><b class="stageVisualMetricValue small" id="stageVisualEvidence">—</b></div>
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Agent</span><b class="stageVisualMetricValue" id="stageVisualAgent">—</b><span class="stageVisualMetricSub" id="stageVisualAgentSub">not resolved yet</span></div>
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Input fields</span><b class="stageVisualMetricValue" id="stageVisualInputs">0</b></div>
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Output fields</span><b class="stageVisualMetricValue" id="stageVisualOutputs">0</b></div>
    </div>
    <section class="stageIoAlwaysOpen" id="stageIoAlwaysOpen" aria-label="Stage input and output">
      <div class="stageIoHeader">
        <div><span class="stageIoKicker">Stage boundary</span><strong>Input / Output</strong></div>
        <span class="stageIoAlwaysBadge">ALWAYS OPEN</span>
      </div>
      <div class="stageIoGrid">
        <article class="stageIoCard inputCard">
          <div class="stageIoCardHead"><span>INPUT</span><span class="stageIoCount" id="stageIoInputCount">0 fields</span></div>
          <div class="stageIoAbstract" id="stageIoInputAbstract">—</div>
          <div class="stageIoEvidence" id="stageIoInputEvidence">—</div>
          <pre class="stageIoValues" id="stageIoInputValues">—</pre>
        </article>
        <article class="stageIoCard outputCard">
          <div class="stageIoCardHead"><span>OUTPUT</span><span class="stageIoCount" id="stageIoOutputCount">0 fields</span></div>
          <div class="stageIoAbstract" id="stageIoOutputAbstract">—</div>
          <div class="stageIoEvidence" id="stageIoOutputEvidence">—</div>
          <pre class="stageIoValues" id="stageIoOutputValues">—</pre>
        </article>
      </div>
    </section>`;
  primary.insertAdjacentElement("beforebegin", panel);

  function stageNumber(id) {
    const match = String(id || "").match(/^G(\d+)$/);
    return match ? Number(match[1]) : -1;
  }

  function countConcrete(value) {
    const text = String(value || "").trim();
    if (!text || text === "—" || /not separately observed/i.test(text)) return 0;
    if (/^No request-specific input field/i.test(text)) return 0;
    return text.split(/\n+/).map(line => line.trim()).filter(Boolean).length;
  }

  function currentStageData() {
    try { return byId?.[activeStage] || null; } catch { return null; }
  }

  function stageAgent(s) {
    const n = stageNumber(s?.id || activeStage);
    // OpenClaw source flow resolves the effective Agent at G9.  Showing the
    // final run Agent on G0-G8 would leak a later-stage fact backwards in time.
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

  function hideLegacyOverviewRows() {
    // Older presentation helpers may inject collapsed 'Stage-level input / output'
    // and 'Technical details' disclosure rows.  The new Overview has a permanent
    // I/O panel and dedicated tabs, so those duplicate rows are removed from view.
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

    const evidence = Array.isArray(s.evidence)
      ? s.evidence.map(x => String(x).toUpperCase()).join(" + ")
      : "—";
    const result = String(s.result || "—");
    const hero = document.getElementById("stageVisualHero");
    hero?.classList.toggle("source", result.includes("SOURCE"));
    hero?.classList.toggle("bad", s.tone === "warn" || /deny|reject|fail|error/i.test(result));

    setText("stageVisualCode", s.id || activeStage || "G—");
    setText("stageVisualResult", result);
    setText("stageVisualNote", s.title || "Current selected Gateway stage");
    setText("stageVisualState", result === "—" ? "waiting" : "current state");
    setText("stageVisualEvidence", evidence || "—");

    const agent = stageAgent(s);
    setText("stageVisualAgent", agent.value);
    setText("stageVisualAgentSub", agent.note);

    const inputCount = countConcrete(s.concreteInput);
    const outputCount = countConcrete(s.concreteOutput);
    setText("stageVisualInputs", inputCount);
    setText("stageVisualOutputs", outputCount);
    setText("stageIoInputCount", `${inputCount} ${inputCount === 1 ? "field" : "fields"}`);
    setText("stageIoOutputCount", `${outputCount} ${outputCount === 1 ? "field" : "fields"}`);

    // These are the actual stage-boundary values already computed by the source-
    // aligned collector.  They are mirrored here, never re-inferred in the UI.
    setText("stageIoInputAbstract", s.input || "—");
    setText("stageIoOutputAbstract", s.output || "—");
    setText("stageIoInputEvidence", s.concreteInputEvidence || "—");
    setText("stageIoOutputEvidence", s.concreteOutputEvidence || "—");
    setText("stageIoInputValues", s.concreteInput || "—");
    setText("stageIoOutputValues", s.concreteOutput || "—");

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

  // Some inspector helpers render after this script. Keep the duplicate disclosure
  // cleanup idempotent so Input / Output cannot become collapsible again.
  new MutationObserver(() => hideLegacyOverviewRows()).observe(detail, { childList:true, subtree:true });
})();
