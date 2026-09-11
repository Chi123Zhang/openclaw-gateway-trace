(() => {
  const outputCard = document.querySelector("section.output");
  const responsePanel = document.getElementById("responsePanel");
  const responseText = document.getElementById("responseText");
  const requestState = document.getElementById("requestState");
  const collectorState = document.getElementById("collectorState");
  if (!outputCard || !responsePanel || !responseText || !requestState) return;

  const outputValue = outputCard.querySelector("strong");
  const finish = outputCard.querySelector(".finish");
  if (!outputValue || !finish) return;

  function firstLine(text) {
    const line = String(text || "").split(/\r?\n/).map(x => x.trim()).find(Boolean) || "";
    if (!line) return "";
    return line.length > 110 ? `${line.slice(0, 107)}…` : line;
  }

  function sync() {
    const response = responseText.textContent.trim();
    const state = requestState.textContent.trim().toUpperCase();
    const collector = collectorState?.textContent?.trim() || "";

    if (response) {
      responsePanel.hidden = false;
      outputValue.textContent = firstLine(response) || "Assistant response captured";
      outputValue.title = response;
      finish.textContent = "RESPONSE READY";
      finish.style.color = "var(--good)";
      return;
    }

    if (state.includes("FAILED") || /failed|error/i.test(collector)) {
      outputValue.textContent = "No assistant response captured";
      finish.textContent = "ERROR";
      finish.style.color = "var(--bad)";
      return;
    }

    if (state.includes("FINISHED")) {
      // A finished trace without response content must never be presented as a
      // successful output. The collector now also rejects this false-complete case.
      outputValue.textContent = "Trace ended without assistant response";
      finish.textContent = "NO RESPONSE";
      finish.style.color = "var(--warn)";
      return;
    }

    if (state.includes("RUNNING") || state.includes("STARTING") || state.includes("PAUSED")) {
      outputValue.textContent = "Waiting for assistant response";
      finish.textContent = "PENDING";
      finish.style.color = "var(--muted)";
      return;
    }

    outputValue.textContent = "Awaiting run";
    finish.textContent = "IDLE";
    finish.style.color = "var(--muted)";
  }

  [responseText, requestState, collectorState].filter(Boolean).forEach(node => {
    new MutationObserver(sync).observe(node, { childList: true, subtree: true, characterData: true, attributes: true });
  });

  sync();
})();

(() => {
  /* Presentation-only cleanup for the overview. No trace values are changed.
   * Observers are limited to the selected-module title and Runtime Context block.
   */
  const normalizeText = value => String(value || "").trim();

  function updateExpandedModulePresentation() {
    const expand = document.querySelector(".pipeline .expand");
    const title = document.getElementById("expandTitle");
    if (!expand || !title) return;
    const text = normalizeText(title.textContent).toUpperCase();
    const redundantConnection = text.startsWith("CONN") || text.includes("CONNECTION");
    expand.classList.toggle("presentationRedundantConnection", redundantConnection);
  }

  function updateRuntimeContextPresentation() {
    const sidebar = document.querySelector(".sidebar");
    const block = sidebar?.querySelector(".contextBlock");
    if (!sidebar || !block) return;

    let visibleRows = 0;
    block.querySelectorAll(".ctxRow").forEach(row => {
      const value = normalizeText(row.querySelector(".ctxValue")?.textContent);
      const empty = !value || value === "—" || value.toLowerCase() === "not captured";
      row.classList.toggle("presentationEmptyContext", empty);
      if (!empty) visibleRows += 1;
    });

    sidebar.classList.toggle("presentationContextEmpty", visibleRows === 0);
    [...sidebar.querySelectorAll(".sideTitle")]
      .filter(node => normalizeText(node.textContent).toLowerCase() === "runtime context")
      .forEach(node => node.classList.add("presentationContextTitle"));
  }

  const expandTitle = document.getElementById("expandTitle");
  if (expandTitle) {
    new MutationObserver(updateExpandedModulePresentation).observe(expandTitle, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  const contextBlock = document.querySelector(".sidebar .contextBlock");
  if (contextBlock) {
    new MutationObserver(updateRuntimeContextPresentation).observe(contextBlock, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  updateExpandedModulePresentation();
  updateRuntimeContextPresentation();
})();

(() => {
  /* Final frontend-only overview cleanup.
   * Keep these nodes in the DOM because existing rendering code still writes to
   * them, but collapse them visually. This adds no runtime/trace behavior and no
   * DOM mutation observer, so it cannot create the previous feedback loop. */
  if (document.getElementById("traceclaw-overview-final-cleanup")) return;
  const style = document.createElement("style");
  style.id = "traceclaw-overview-final-cleanup";
  style.textContent = `
    html body .layout main.main > section.card.conn,
    html body .layout main.main > section.card.conn:has(#connFlow),
    html body .layout main.main > section.card.output {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* Web overview cleanup requested for the final presentation. */
    html body .handoffStrip,
    html body .pipeline > .sectionTitle {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
})();

(() => {
  /*
   * Source-model + current-run evidence overlay for the Stage Flow / Steps pages.
   *
   * The fixed v2026.7.1-2 catalog continues to define what CAN happen. This
   * presentation layer only labels what the selected run actually supports. It
   * does not change Gateway execution, instrumentation, collector data, or the
   * source catalog.
   */
  const STYLE_ID = "traceclaw-run-evidence-overlay-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .runEvidenceContext{
        display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
        margin:8px 0 10px;padding:9px 11px;border:1px solid #334049;border-radius:7px;
        background:#10161a;color:#aeb8c0;
      }
      .runEvidenceContextMain{min-width:0}
      .runEvidenceContextTitle{
        color:#eef3f6;font:800 10px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace;
        letter-spacing:.06em;text-transform:uppercase
      }
      .runEvidenceContextText{margin-top:4px;color:#8e9aa4;font:500 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
      .runEvidenceLegend{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;flex:0 0 auto}
      .runEvidenceBadge{
        display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;
        min-height:19px;padding:2px 7px;border:1px solid #46515a;border-radius:999px;
        color:#aeb7bf;background:#171d21;font:800 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
        letter-spacing:.035em;white-space:nowrap;text-transform:uppercase
      }
      .runEvidenceBadge.observed{border-color:#326849;background:#10231a;color:#8bd7a6}
      .runEvidenceBadge.derived,.runEvidenceBadge.source{border-color:#6d5b2d;background:#211d11;color:#e4c76d}
      .runEvidenceBadge.partial{border-color:#315f73;background:#10202a;color:#8cc9df}
      .runEvidenceBadge.unresolved{border-color:#5a5050;background:#1c1818;color:#b7a9a9}
      .runEvidenceBadge.notTaken{border-color:#414950;background:#151a1e;color:#7f8991}
      .runEvidenceBadge.sourceModel{border-color:#4a5660;background:#151b20;color:#aab4bd}
      .compactStep,.sourceStepItem{position:relative}
      .compactStep .runEvidenceBadge{margin-left:auto}
      .sourceStepItem .runEvidenceBadge{margin:5px 0 0}
      .stageHandoffRoute .runEvidenceBadge{margin-left:8px}
      .stageHandoffHead.runEvidenceHead{align-items:flex-start}
      .stageHandoffHead .runEvidenceLegend{margin-left:auto}
      @media(max-width:760px){
        .runEvidenceContext{display:block}
        .runEvidenceLegend{justify-content:flex-start;margin-top:7px}
      }
    `;
    document.head.appendChild(style);
  }

  const text = value => String(value ?? "").trim();

  function selectedCase() {
    try { return ACTIVE_CASE || null; } catch { return null; }
  }

  function selectedStage() {
    try { return byId?.[activeStage] || null; } catch { return null; }
  }

  function observedStages() {
    const list = selectedCase()?._collector?.traceStagesObserved;
    return new Set(Array.isArray(list) ? list : []);
  }

  function hasCurrentRun() {
    const c = selectedCase();
    if (!c) return false;
    const id = text(c.meta?.id);
    if (id.startsWith("pending-")) return false;
    const observed = c._collector?.traceStagesObserved;
    const eventCount = Number(c._collector?.traceEventCount || 0);
    return Boolean(
      (Array.isArray(observed) && observed.length) ||
      eventCount > 0 ||
      text(c.meta?.runId)
    );
  }

  function stageIsSourceMapped(id) {
    let s = null;
    try { s = byId?.[id] || null; } catch { s = null; }
    if (!s) return false;
    if (/SOURCE PATH/i.test(text(s.result))) return true;
    const evidence = Array.isArray(s.evidence) ? s.evidence.map(v => text(v).toLowerCase()) : [];
    if (evidence.includes("derived")) return true;
    const observed = observedStages();
    if (["G14", "G15", "G16"].includes(id) && (observed.has("G17") || observed.has("G18"))) return true;
    return false;
  }

  function toneForStatus(status) {
    const label = text(status?.label).toUpperCase();
    const tone = text(status?.tone).toLowerCase();
    if (tone === "observed" || label === "OBSERVED" || /DOWNSTREAM OBSERVED|RESOLVER OBSERVED/.test(label)) return "observed";
    if (tone === "derived" || tone === "source" || /SOURCE-|PATH COMPLETED|COMPLETED|RETURNED|PASSED|UNCHANGED/.test(label)) return "derived";
    if (tone === "partial" || label === "PARTIAL") return "partial";
    if (tone === "muted" || /NOT TAKEN|NOT REACHED|NOT SELECTED|SKIPPED|NO ATTACHMENTS|NO OVERRIDE|NOT TRIGGERED/.test(label)) return "notTaken";
    if (tone === "unresolved" || /UNRESOLVED/.test(label)) return "unresolved";
    return "sourceModel";
  }

  function makeBadge(label, tone) {
    const badge = document.createElement("span");
    badge.className = `runEvidenceBadge ${tone}`;
    badge.textContent = label;
    return badge;
  }

  function runContextForStage(stage) {
    const hasRun = hasCurrentRun();
    if (!hasRun) {
      return {
        title: "SOURCE MODEL",
        description: "No runtime execution has been observed yet. Run a trace to overlay the actual execution path."
      };
    }
    const observed = observedStages();
    if (observed.has(stage?.id) || stageIsSourceMapped(stage?.id)) {
      return {
        title: "CURRENT RUN + SOURCE MODEL",
        description: "OBSERVED marks direct runtime/native evidence. SOURCE-DERIVED marks source-backed execution inferred from this run. Other branches remain explicitly unresolved or not taken."
      };
    }
    return {
      title: "CURRENT RUN · STAGE NOT OBSERVED",
      description: "The source model is shown, but this selected run has not provided evidence that this stage was reached yet."
    };
  }

  function ensureStepsContext(stage) {
    const process = document.querySelector("section.detail .processSection");
    if (!process) return;
    let box = process.querySelector(":scope > .runEvidenceContext");
    if (!box) {
      box = document.createElement("div");
      box.className = "runEvidenceContext";
      const top = process.querySelector(".processTop");
      if (top) top.insertAdjacentElement("afterend", box);
      else process.prepend(box);
    }
    const ctx = runContextForStage(stage);
    box.innerHTML = "";
    const main = document.createElement("div");
    main.className = "runEvidenceContextMain";
    const title = document.createElement("div");
    title.className = "runEvidenceContextTitle";
    title.textContent = ctx.title;
    const desc = document.createElement("div");
    desc.className = "runEvidenceContextText";
    desc.textContent = ctx.description;
    main.append(title, desc);
    const legend = document.createElement("div");
    legend.className = "runEvidenceLegend";
    legend.append(
      makeBadge("Observed", "observed"),
      makeBadge("Source-derived", "derived"),
      makeBadge("Not observed", "unresolved")
    );
    box.append(main, legend);
  }

  function statusForStep(stage, index) {
    if (!hasCurrentRun()) return { label: "SOURCE MODEL", tone: "sourceModel" };
    const observed = observedStages();
    if (!observed.has(stage.id) && !stageIsSourceMapped(stage.id)) {
      return { label: "NOT OBSERVED", tone: "unresolved" };
    }
    const model = window.GATEWAY_STEP_EVIDENCE?.inspect?.(stage, index);
    if (!model?.status) return { label: "UNRESOLVED", tone: "unresolved" };
    return {
      label: text(model.status.label) || "UNRESOLVED",
      tone: toneForStatus(model.status)
    };
  }

  function decorateStepRows(stage) {
    if (!stage) return;
    ensureStepsContext(stage);
    document.querySelectorAll("#compactSteps .compactStep").forEach((row, index) => {
      row.querySelector(":scope > .runEvidenceBadge")?.remove();
      const status = statusForStep(stage, Number(row.dataset.step ?? index));
      row.append(makeBadge(status.label, status.tone));
    });
    document.querySelectorAll("#sourceStepList .sourceStepItem").forEach((row, index) => {
      row.querySelector(":scope > .runEvidenceBadge")?.remove();
      const status = statusForStep(stage, Number(row.dataset.step ?? index));
      row.append(makeBadge(status.label, status.tone));
    });
  }

  function flowStatus(row) {
    if (!hasCurrentRun()) return { label: "SOURCE MODEL", tone: "sourceModel" };
    const nodes = [...row.querySelectorAll(".stageHandoffNode")];
    const from = text(nodes[0]?.textContent);
    const to = text(nodes[nodes.length - 1]?.textContent);
    const observed = observedStages();
    const runtimeFact = [...row.querySelectorAll(".stageHandoffFact .stageHandoffChip")].some(chip => {
      const value = text(chip.textContent).toLowerCase();
      return value === "observed" || value === "native";
    });
    const fromObserved = observed.has(from);
    const targetIsStage = /^G\d+$/.test(to);
    const toObserved = targetIsStage ? observed.has(to) : Boolean(selectedCase()?.agentRuntime?.observed);
    const fromMapped = stageIsSourceMapped(from);
    const toMapped = targetIsStage ? stageIsSourceMapped(to) : Boolean(selectedCase()?.agentRuntime?.observed);

    if (runtimeFact && fromObserved && toObserved) return { label: "OBSERVED", tone: "observed" };
    if ((fromObserved || fromMapped) && (toObserved || toMapped)) return { label: "SOURCE-DERIVED", tone: "derived" };
    return { label: "NOT OBSERVED", tone: "unresolved" };
  }

  function decorateFlowPanel() {
    const panel = document.getElementById("stageHandoffPanel");
    if (!panel) return;
    const stage = selectedStage();
    const head = panel.querySelector(".stageHandoffHead");
    const eyebrow = panel.querySelector(".stageHandoffEyebrow");
    if (head) head.classList.add("runEvidenceHead");
    if (eyebrow) eyebrow.textContent = hasCurrentRun() ? "SOURCE MODEL + CURRENT RUN" : "SOURCE MODEL";

    let legend = head?.querySelector(":scope > .runEvidenceLegend");
    if (head && !legend) {
      legend = document.createElement("div");
      legend.className = "runEvidenceLegend";
      head.append(legend);
    }
    if (legend) {
      legend.innerHTML = "";
      legend.append(
        makeBadge("Observed", "observed"),
        makeBadge("Source-derived", "derived"),
        makeBadge("Not observed", "unresolved")
      );
    }

    panel.querySelectorAll(".stageHandoffEdge").forEach(row => {
      const route = row.querySelector(".stageHandoffRoute");
      if (!route) return;
      route.querySelector(":scope > .runEvidenceBadge")?.remove();
      const status = flowStatus(row);
      route.append(makeBadge(status.label, status.tone));
    });

    panel.dataset.runEvidenceMode = hasCurrentRun()
      ? (observedStages().has(stage?.id) || stageIsSourceMapped(stage?.id) ? "current" : "unobserved")
      : "source";
  }

  function refreshEvidenceOverlay(stage = selectedStage()) {
    if (stage) decorateStepRows(stage);
    requestAnimationFrame(decorateFlowPanel);
  }

  if (typeof renderSteps === "function") {
    const previousRenderSteps = renderSteps;
    renderSteps = function renderStepsWithRunEvidence(stage, ...rest) {
      const result = previousRenderSteps(stage, ...rest);
      decorateStepRows(stage || selectedStage());
      return result;
    };
  }

  if (typeof renderAll === "function") {
    const previousRenderAll = renderAll;
    renderAll = function renderAllWithRunEvidence(...args) {
      const result = previousRenderAll(...args);
      requestAnimationFrame(() => refreshEvidenceOverlay(selectedStage()));
      return result;
    };
  }

  document.addEventListener("click", event => {
    if (!event.target.closest?.('[data-id^="G"], .stagePageTab')) return;
    requestAnimationFrame(() => refreshEvidenceOverlay(selectedStage()));
  });

  requestAnimationFrame(() => refreshEvidenceOverlay(selectedStage()));
})();
