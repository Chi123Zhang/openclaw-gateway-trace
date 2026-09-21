(() => {
  const STYLE_ID = "traceclaw-public-demo-restore";
  const PANEL_ID = "publicAgentRuntimePanel";

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
        max-height:none!important;
        overflow:visible!important;
      }
      html body #moduleRow.moduleFlowRow{
        align-items:start!important;
      }
      html body #moduleRow.moduleFlowRow > .module{
        min-height:154px!important;
        height:auto!important;
        max-height:none!important;
      }
      html body #moduleRow.moduleFlowRow .moduleStageList{
        min-height:0!important;
      }
      .publicAgentRuntimePanel{
        margin-top:14px;
        padding:14px 16px;
      }
      .publicAgentRuntimeGrid{
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:10px;
        margin-top:10px;
      }
      .publicAgentRuntimeItem{
        min-width:0;
        border:1px solid #303a43;
        border-radius:7px;
        background:#10161a;
        padding:10px 11px;
      }
      .publicAgentRuntimeItem span{
        display:block;
        color:var(--muted);
        font:700 9px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
        letter-spacing:.06em;
        text-transform:uppercase;
      }
      .publicAgentRuntimeItem strong{
        display:block;
        margin-top:5px;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:#e7edf1;
        font:700 12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;
      }
      .publicAgentRuntimeNote{
        margin-top:9px;
        color:var(--muted);
        font-size:11px;
        line-height:1.5;
      }
      @media(max-width:1100px){
        .publicAgentRuntimeGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:620px){
        .publicAgentRuntimeGrid{grid-template-columns:1fr}
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

  function item(label, value) {
    const node = document.createElement("div");
    node.className = "publicAgentRuntimeItem";
    const key = document.createElement("span");
    key.textContent = label;
    const val = document.createElement("strong");
    val.textContent = text(value);
    val.title = val.textContent;
    node.append(key, val);
    return node;
  }

  function renderAgentRuntimePanel() {
    const pipeline = document.querySelector("section.pipeline");
    if (!pipeline) return;

    const active = currentCase();
    const runtime = active?.agentRuntime || {};
    const meta = active?.meta || currentMeta();
    if (!runtime.observed && !meta.response) return;

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      panel.className = "card publicAgentRuntimePanel";
      pipeline.insertAdjacentElement("afterend", panel);
    }

    const providerModel = [runtime.provider, runtime.model].filter(Boolean).join(" · ");
    const tools = runtime.toolCalled
      ? uniqueToolNames(runtime) || `${runtime.toolCount || 0} tool call(s)`
      : (runtime.runEnded ? "no tool call" : "");

    panel.replaceChildren();
    const kicker = document.createElement("div");
    kicker.className = "kicker";
    kicker.textContent = "Deeper Agent Runtime";
    const title = document.createElement("div");
    title.className = "sectionTitle";
    title.textContent = runtime.runEnded ? "Captured post-G18 run details" : "Captured downstream runtime details";
    const grid = document.createElement("div");
    grid.className = "publicAgentRuntimeGrid";
    [
      ["Agent", runtime.finalAgent || meta.agent],
      ["Resolver", runtime.resolverSource || runtime.resolver || meta.resolverSource || meta.resolver],
      ["Runtime", runtime.runner || (runtime.runStarted ? "started" : "")],
      ["Provider / Model", providerModel || [meta.provider, meta.model].filter(Boolean).join(" · ")],
      ["Tools", tools],
      ["Final reply", runtime.agentReplyDirectlyObserved || runtime.downstreamAssistantResponseObserved ? "observed" : ""],
      ["Return", runtime.returnToG16Observed ? "G16 observed" : ""],
      ["Status", runtime.runEnded ? "complete" : (runtime.runStarted ? "running" : "captured")]
    ].forEach(([label, value]) => grid.append(item(label, value)));

    const note = document.createElement("div");
    note.className = "publicAgentRuntimeNote";
    note.textContent = "This summary is rendered from the selected saved run. Stage detail, runtime context, source detail, and output remain available below.";
    panel.append(kicker, title, grid, note);
  }

  function restore() {
    installStyle();
    renderAgentRuntimePanel();
  }

  const observer = new MutationObserver(() => {
    window.clearTimeout(restore._timer);
    restore._timer = window.setTimeout(restore, 80);
  });

  restore();
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
