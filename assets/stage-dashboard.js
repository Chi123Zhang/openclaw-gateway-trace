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
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Agent</span><b class="stageVisualMetricValue" id="stageVisualAgent">—</b></div>
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Input fields</span><b class="stageVisualMetricValue" id="stageVisualInputs">0</b></div>
      <div class="stageVisualMetric"><span class="stageVisualMetricLabel">Output fields</span><b class="stageVisualMetricValue" id="stageVisualOutputs">0</b></div>
    </div>`;
  primary.insertAdjacentElement("beforebegin", panel);

  function countConcrete(value) {
    const text = String(value || "").trim();
    if (!text || text === "—" || /not separately observed/i.test(text)) return 0;
    return text.split(/\n+/).map(line => line.trim()).filter(Boolean).length;
  }

  function currentStageData() {
    try { return byId?.[activeStage] || null; } catch { return null; }
  }

  function runtimeAgent() {
    try { return CASE2?.agent || "—"; } catch { return "—"; }
  }

  function update() {
    const s = currentStageData();
    if (!s) return;
    const evidence = Array.isArray(s.evidence) ? s.evidence.map(x => String(x).toUpperCase()).join(" + ") : "—";
    const result = String(s.result || "—");
    const hero = document.getElementById("stageVisualHero");
    hero.classList.toggle("source", result.includes("SOURCE"));
    hero.classList.toggle("bad", s.tone === "warn" || /deny|reject|fail|error/i.test(result));

    document.getElementById("stageVisualCode").textContent = s.id || activeStage || "G—";
    document.getElementById("stageVisualResult").textContent = result;
    document.getElementById("stageVisualNote").textContent = s.title || "Current selected Gateway stage";
    document.getElementById("stageVisualState").textContent = result === "—" ? "waiting" : "current state";
    document.getElementById("stageVisualEvidence").textContent = evidence || "—";
    document.getElementById("stageVisualAgent").textContent = runtimeAgent();
    document.getElementById("stageVisualInputs").textContent = String(countConcrete(s.concreteInput));
    document.getElementById("stageVisualOutputs").textContent = String(countConcrete(s.concreteOutput));
  }

  update();
  const title = document.getElementById("detailTitle");
  if (title) new MutationObserver(update).observe(title, { childList:true, subtree:true });
  ["concreteInput","concreteOutput","sideAgent"].forEach(id => {
    const el = document.getElementById(id);
    if (el) new MutationObserver(update).observe(el, { childList:true, subtree:true, characterData:true });
  });
})();
