(() => {
  const LEGACY_STYLE_ID = "traceclaw-public-demo-restore";
  const STYLE_ID = "traceclaw-public-demo-compact-runtime";
  const LARGE_PANEL_ID = "publicAgentRuntimePanel";

  function currentCase() {
    try { return ACTIVE_CASE || null; } catch { return null; }
  }

  function currentMeta() {
    try { return CASE2 || {}; } catch { return {}; }
  }

  function installStyle() {
    document.getElementById(LEGACY_STYLE_ID)?.remove();
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #publicAgentRuntimePanel{display:none!important}

      .pipeline .boundary.runtimeBoundaryCompactPublic{
        display:block!important;
        visibility:visible!important;
        width:100%!important;
        height:auto!important;
        min-height:0!important;
        max-height:none!important;
        margin-top:8px!important;
        padding:7px 9px!important;
        overflow:visible!important;
      }

      .pipeline .boundary.runtimeBoundaryCompactPublic .boundaryGrid{
        display:block!important;
        width:100%!important;
        min-height:0!important;
        height:auto!important;
      }

      .pipeline .boundary.runtimeBoundaryCompactPublic .runtimeBoundaryLegacy,
      .pipeline .boundary.runtimeBoundaryCompactPublic .returnArrow,
      .pipeline .boundary.runtimeBoundaryCompactPublic .returnNote{
        display:none!important;
      }

      .pipeline .boundary.runtimeBoundaryCompactPublic .agentRuntimeObservedPanel{
        display:flex!important;
        flex-direction:row!important;
        flex-wrap:nowrap!important;
        align-items:stretch!important;
        gap:5px!important;
        width:100%!important;
        min-width:0!important;
        height:auto!important;
        min-height:0!important;
        padding:0!important;
        margin:0!important;
        overflow:hidden!important;
        border:0!important;
        background:transparent!important;
      }

      .pipeline .boundary.runtimeBoundaryCompactPublic .agentRuntimeLead{
        flex:0 0 116px!important;
      }

      .pipeline .boundary.runtimeBoundaryCompactPublic .agentRuntimeFlow{
        flex:1 1 auto!important;
        display:grid!important;
        grid-template-columns:
          minmax(68px,.75fr)
          minmax(128px,1.35fr)
          minmax(76px,.82fr)
          minmax(116px,1.15fr)
          minmax(68px,.72fr)
          minmax(76px,.78fr)
          minmax(84px,.86fr)!important;
        gap:5px!important;
        width:auto!important;
        min-width:0!important;
        margin:0!important;
        padding:0!important;
        overflow:hidden!important;
      }

      @media(max-width:900px){
        .pipeline .boundary.runtimeBoundaryCompactPublic .agentRuntimeObservedPanel{
          overflow-x:auto!important;
        }
        .pipeline .boundary.runtimeBoundaryCompactPublic .agentRuntimeFlow{
          flex:0 0 690px!important;
          min-width:690px!important;
        }
      }
    `;
    document.head.append(style);
  }

  function uniqueToolNames(runtime) {
    if (!Array.isArray(runtime?.tools)) return "";
    return [...new Set(runtime.tools.map(tool => tool?.name).filter(Boolean))].join(", ");
  }

  function makeNode(key, label, value, neutral = false) {
    const node = document.createElement("div");
    node.dataset.runtimeKey = key;
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `Open ${label} runtime details`);
    node.className = `agentRuntimeNode ${value
      ? (neutral ? "agentRuntimeNode-neutral" : "agentRuntimeNode-observed")
      : "agentRuntimeNode-missing"}`;

    const k = document.createElement("span");
    k.textContent = label;

    const v = document.createElement("strong");
    v.textContent = value || "not captured";
    v.title = v.textContent;

    node.append(k, v);
    return node;
  }

  function renderCompactBoundary() {
    document.getElementById(LARGE_PANEL_ID)?.remove();

    const pipeline = document.querySelector("section.pipeline");
    if (!pipeline) return;

    const active = currentCase();
    const runtime = active?.agentRuntime || {};
    const meta = active?.meta || currentMeta();

    if (!runtime.observed && !meta.response) return;

    let boundary = pipeline.querySelector(":scope > .boundary");
    if (!boundary) {
      boundary = document.createElement("div");
      boundary.className = "boundary";
      pipeline.append(boundary);
    }

    boundary.hidden = false;
    boundary.removeAttribute("hidden");
    boundary.classList.add("runtimeBoundaryCompactPublic");

    const providerModel =
      [runtime.provider, runtime.model].filter(Boolean).join(" · ") ||
      [meta.provider, meta.model].filter(Boolean).join(" · ");

    const toolNames = uniqueToolNames(runtime);
    const tools = runtime.toolCalled
      ? (toolNames || `${runtime.toolCount || 0} call(s)`)
      : (runtime.runEnded ? "no call" : "");

    const grid = document.createElement("div");
    grid.className = "boundaryGrid";

    const legacy = document.createElement("div");
    legacy.className = "boundaryBox runtimeBoundaryLegacy";

    const arrow = document.createElement("div");
    arrow.className = "returnArrow";
    arrow.textContent = "↔";

    const box = document.createElement("div");
    box.className = "boundaryBox agentRuntimeObservedPanel";

    const lead = document.createElement("div");
    lead.className = "agentRuntimeLead";
    lead.dataset.runtimeKey = "overview";
    lead.tabIndex = 0;
    lead.setAttribute("role", "button");
    lead.setAttribute("aria-label", "Open Deeper Agent Run details");

    const title = document.createElement("strong");
    title.textContent = "Deeper Agent Run";

    const status = document.createElement("span");
    status.className = "agentRuntimeStatus";
    status.dataset.tone = runtime.runEnded ? "complete" : "running";
    status.textContent = runtime.runEnded
      ? "CAPTURED · COMPLETE"
      : (runtime.observed ? "CAPTURED · RUNNING" : "SAVED RUN");

    lead.append(title, status);

    const flow = document.createElement("div");
    flow.className = "agentRuntimeFlow";

    const rows = [
      ["agent", "Agent", runtime.finalAgent || meta.agent || meta.downstreamAgentFinal || meta.downstreamAgent || "", false],
      ["resolver", "Resolver", runtime.resolverSource || runtime.resolver || meta.resolverSource || meta.resolver || "", false],
      ["runtime", "Runtime", runtime.runner || (runtime.runStarted ? "started" : ""), false],
      ["provider-model", "Provider / Model", providerModel, false],
      ["tools", "Tools", tools, runtime.runEnded && !runtime.toolCalled],
      ["final-reply", "Final reply",
        runtime.agentReplyDirectlyObserved || runtime.downstreamAssistantResponseObserved ? "observed" : "", false],
      ["return", "Return", runtime.returnToG16Observed ? "G16 observed" : "", false]
    ];

    rows.forEach(([key, label, value, neutral]) => {
      flow.append(makeNode(key, label, value, neutral));
    });

    box.append(lead, flow);
    grid.append(legacy, arrow, box);

    const note = document.createElement("div");
    note.className = "returnNote";

    boundary.replaceChildren(grid, note);
  }

  function restore() {
    installStyle();
    renderCompactBoundary();
  }

  let timer = null;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(restore, 50);
  };

  restore();
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  window.addEventListener("load", schedule, { once: true });
})();
