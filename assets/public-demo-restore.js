(() => {
  const STYLE_ID = "traceclaw-public-demo-restore";

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html body:not(.stageModalOpen) .detail.stageModalTarget{
        display:block!important;
        position:static!important;
        transform:none!important;
        width:auto!important;
        height:auto!important;
        max-height:none!important;
        overflow:visible!important;
        margin-top:14px!important;
        border:1px solid var(--line)!important;
        border-radius:10px!important;
        box-shadow:none!important;
      }
      html body:not(.stageModalOpen) .detail.stageModalTarget .detailHead{
        position:static!important;
        padding:16px 18px!important;
      }
      html body:not(.stageModalOpen) .detail.stageModalTarget .detailHead::after,
      html body:not(.stageModalOpen) .stageModalClose,
      html body:not(.stageModalOpen) .stageModalBackdrop{
        display:none!important;
      }
      html body .layout main.main > section.card.output{
        display:flex!important;
        visibility:visible!important;
        height:auto!important;
        min-height:0!important;
        max-height:none!important;
        margin-top:14px!important;
        padding:14px 16px!important;
        border:1px solid var(--line)!important;
        opacity:1!important;
        overflow:visible!important;
        pointer-events:auto!important;
      }
      html body .pipeline{
        display:block!important;
        height:auto!important;
        min-height:0!important;
        max-height:none!important;
        overflow:visible!important;
        padding:18px!important;
      }
      html body .pipeline .archBand{
        display:none!important;
      }
      html body .pipeline .moduleWrap{
        display:block!important;
        width:100%!important;
        height:auto!important;
        min-height:0!important;
        max-height:none!important;
        margin-top:12px!important;
        padding-bottom:8px!important;
        overflow-x:auto!important;
        overflow-y:visible!important;
      }
      html body #moduleRow.moduleFlowRow{
        display:grid!important;
        grid-template-columns:
          minmax(230px,1fr) 84px
          minmax(230px,1fr) 84px
          minmax(230px,1fr) 84px
          minmax(230px,1fr) 96px
          minmax(230px,1fr)
          84px
          minmax(230px,1fr)!important;
        gap:0!important;
        align-items:stretch!important;
        width:auto!important;
        min-width:1780px!important;
        height:auto!important;
        min-height:0!important;
        max-height:none!important;
        overflow:visible!important;
      }
      html body #moduleRow.moduleFlowRow > .module{
        display:block!important;
        position:relative!important;
        min-width:0!important;
        height:clamp(430px,52vh,590px)!important;
        min-height:430px!important;
        max-height:590px!important;
        padding:22px 18px 16px!important;
        overflow:hidden!important;
      }
      html body #moduleRow.moduleFlowRow > .module > h3{
        font-size:17px!important;
        line-height:1.2!important;
        margin:13px 0 12px!important;
      }
      html body #moduleRow.moduleFlowRow > .module > p{
        display:block!important;
        font-size:10px!important;
        line-height:1.35!important;
        -webkit-line-clamp:unset!important;
      }
      html body #moduleRow.moduleFlowRow > .module > .mid{
        font-size:8px!important;
      }
      html body #moduleRow.moduleFlowRow > .module > .mresult{
        left:18px!important;
        bottom:16px!important;
        font-size:8px!important;
      }
      html body #moduleRow.moduleFlowRow > .moduleConnector{
        display:flex!important;
        min-width:0!important;
        min-height:430px!important;
        height:clamp(430px,52vh,590px)!important;
        max-height:590px!important;
        align-items:center!important;
        justify-content:center!important;
        overflow:visible!important;
      }
      html body #moduleRow.moduleFlowRow .moduleStageList{
        min-height:0!important;
      }
      html body .pipeline .boundary{
        display:block!important;
        visibility:visible!important;
        width:100%!important;
        height:auto!important;
        min-height:0!important;
        max-height:none!important;
        margin-top:8px!important;
        overflow:visible!important;
      }
    `;
    document.head.append(style);
  }

  function text(value, fallback = "not captured") {
    const clean = String(value || "").trim();
    return clean || fallback;
  }

  function uniqueToolNames(runtime) {
    if (!Array.isArray(runtime?.tools)) return "";
    return [...new Set(runtime.tools.map(tool => tool?.name).filter(Boolean))].join(", ");
  }

  function currentCase() {
    try { return ACTIVE_CASE || null; } catch { return null; }
  }

  function currentMeta() {
    try { return CASE2 || {}; } catch { return {}; }
  }

  function runtimeNode(label, value, options = {}) {
    const observed = Boolean(value);
    const node = document.createElement("div");
    node.dataset.runtimeKey = options.key || label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `Open ${label} runtime details`);
    node.className = `agentRuntimeNode ${
      observed
        ? (options.neutral ? "agentRuntimeNode-neutral" : "agentRuntimeNode-observed")
        : "agentRuntimeNode-missing"
    }`;
    const key = document.createElement("span");
    key.textContent = label;
    const val = document.createElement("strong");
    val.textContent = text(value);
    val.title = val.textContent;
    node.append(key, val);
    return node;
  }

  function renderAgentRuntimeBoundary() {
    const pipeline = document.querySelector("section.pipeline");
    if (!pipeline) return;

    const active = currentCase();
    const runtime = active?.agentRuntime || {};
    const meta = active?.meta || currentMeta();
    if (!runtime.observed && !meta.response) return;

    document.getElementById("publicAgentRuntimePanel")?.remove();

    let boundary = pipeline.querySelector(":scope > .boundary");
    if (!boundary) {
      boundary = document.createElement("div");
      boundary.className = "boundary";
      pipeline.append(boundary);
    }
    boundary.hidden = false;
    boundary.removeAttribute("hidden");

    const providerModel = [runtime.provider, runtime.model].filter(Boolean).join(" · ");
    const tools = runtime.toolCalled
      ? uniqueToolNames(runtime) || `${runtime.toolCount || 0} tool call(s)`
      : (runtime.runEnded ? "no tool call" : "");

    const grid = document.createElement("div");
    grid.className = "boundaryGrid";

    const legacy = document.createElement("div");
    legacy.className = "boundaryBox runtimeBoundaryLegacy";
    const legacyTitle = document.createElement("strong");
    legacyTitle.textContent = "G18 · Reply Resolver Boundary";
    const legacyText = document.createElement("span");
    legacyText.id = "resolverBoundaryText";
    legacyText.textContent = `resolver: ${runtime.resolverSource || runtime.resolver || meta.resolverSource || meta.resolver || "observed"}`;
    legacy.append(legacyTitle, legacyText);

    const arrow = document.createElement("div");
    arrow.className = "returnArrow";
    arrow.innerHTML = "→<br>←";

    const runtimeBox = document.createElement("div");
    runtimeBox.className = "boundaryBox agentRuntimeObservedPanel";

    const lead = document.createElement("div");
    lead.className = "agentRuntimeLead";
    lead.dataset.runtimeKey = "overview";
    lead.tabIndex = 0;
    lead.setAttribute("role", "button");
    lead.setAttribute("aria-label", "Open Deeper Agent Run details");
    const leadTitle = document.createElement("strong");
    leadTitle.textContent = "Deeper Agent Run";
    const status = document.createElement("span");
    status.className = "agentRuntimeStatus";
    status.dataset.tone = runtime.runEnded ? "complete" : "running";
    status.textContent = runtime.runEnded ? "CAPTURED · COMPLETE" : "CAPTURED · RUNNING";
    lead.append(leadTitle, status);

    const flow = document.createElement("div");
    flow.className = "agentRuntimeFlow";
    [
      ["agent", "Agent", runtime.finalAgent || meta.agent],
      ["resolver", "Resolver", runtime.resolverSource || runtime.resolver || meta.resolverSource || meta.resolver],
      ["runtime", "Runtime", runtime.runner || (runtime.runStarted ? "started" : "")],
      ["provider-model", "Provider / Model", providerModel || [meta.provider, meta.model].filter(Boolean).join(" · ")],
      ["tools", "Tools", tools, !runtime.toolCalled],
      ["final-reply", "Final reply", runtime.agentReplyDirectlyObserved || runtime.downstreamAssistantResponseObserved ? "observed" : ""],
      ["return", "Return", runtime.returnToG16Observed ? "G16 observed" : ""]
    ].forEach(([key, label, value, neutral]) => flow.append(runtimeNode(label, value, { key, neutral })));

    runtimeBox.append(lead, flow);
    grid.append(legacy, arrow, runtimeBox);

    const note = document.createElement("div");
    note.className = "returnNote";
    note.textContent = "replyResult returns to the original G16 → filter / deliver / complete → DispatchFromConfigResult → G14 finalization";

    boundary.replaceChildren(grid, note);
  }

  function restore() {
    installStyle();
    renderAgentRuntimeBoundary();
  }

  const observer = new MutationObserver(() => {
    window.clearTimeout(restore._timer);
    restore._timer = window.setTimeout(restore, 80);
  });

  restore();
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
