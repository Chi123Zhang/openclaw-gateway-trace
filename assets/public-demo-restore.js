(() => {
  const STYLE_ID = "traceclaw-public-runtime-details";
  const PANEL_ID = "publicAgentRuntimePanel";
  let lastSignature = "";

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .publicAgentRuntimePanel{
        margin-top:14px;
        padding:14px 16px;
      }
      .publicAgentRuntimeHead{
        display:flex;
        align-items:flex-end;
        justify-content:space-between;
        gap:12px;
      }
      .publicAgentRuntimeStatus{
        flex:0 0 auto;
        border:1px solid #365847;
        border-radius:999px;
        padding:4px 8px;
        color:#9fd0b7;
        background:#132019;
        font:700 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
        letter-spacing:.04em;
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
    const clean = String(value ?? "").trim();
    return clean || fallback;
  }

  function currentCase() {
    try { return ACTIVE_CASE || null; } catch { return null; }
  }

  function currentMeta() {
    try { return CASE2 || {}; } catch { return {}; }
  }

  function uniqueToolNames(runtime) {
    if (!Array.isArray(runtime?.tools)) return "";
    return [...new Set(runtime.tools.map(tool => tool?.name).filter(Boolean))].join(", ");
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

  function render() {
    installStyle();

    const pipeline = document.querySelector("section.pipeline");
    if (!pipeline) return;

    const active = currentCase();
    const runtime = active?.agentRuntime || {};
    const meta = active?.meta || currentMeta();

    if (!runtime.observed && !meta.response) {
      document.getElementById(PANEL_ID)?.remove();
      lastSignature = "";
      return;
    }

    const providerModel =
      [runtime.provider, runtime.model].filter(Boolean).join(" · ") ||
      [meta.provider, meta.model].filter(Boolean).join(" · ");

    const tools = runtime.toolCalled
      ? uniqueToolNames(runtime) || `${runtime.toolCount || 0} tool call(s)`
      : (runtime.runEnded ? "no tool call" : "");

    const rows = [
      ["Agent", runtime.finalAgent || meta.agent],
      ["Resolver", runtime.resolverSource || runtime.resolver || meta.resolverSource || meta.resolver],
      ["Runtime", runtime.runner || (runtime.runStarted ? "started" : "")],
      ["Provider / Model", providerModel],
      ["Tools", tools],
      ["Final reply", runtime.agentReplyDirectlyObserved || runtime.downstreamAssistantResponseObserved ? "observed" : ""],
      ["Return", runtime.returnToG16Observed ? "G16 observed" : ""],
      ["Status", runtime.runEnded ? "complete" : (runtime.runStarted ? "running" : "captured")]
    ];

    const signature = JSON.stringify(rows);
    let panel = document.getElementById(PANEL_ID);

    if (panel && signature === lastSignature) return;

    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      panel.className = "card publicAgentRuntimePanel";
      pipeline.insertAdjacentElement("afterend", panel);
    }

    panel.replaceChildren();

    const head = document.createElement("div");
    head.className = "publicAgentRuntimeHead";

    const heading = document.createElement("div");
    const kicker = document.createElement("div");
    kicker.className = "kicker";
    kicker.textContent = "Deeper Agent Run";

    const title = document.createElement("div");
    title.className = "sectionTitle";
    title.textContent = "Captured runtime details";

    heading.append(kicker, title);

    const status = document.createElement("span");
    status.className = "publicAgentRuntimeStatus";
    status.textContent = runtime.runEnded ? "CAPTURED · COMPLETE" : "CAPTURED · RUNNING";

    head.append(heading, status);

    const grid = document.createElement("div");
    grid.className = "publicAgentRuntimeGrid";
    rows.forEach(([label, value]) => grid.append(item(label, value)));

    const note = document.createElement("div");
    note.className = "publicAgentRuntimeNote";
    note.textContent =
      "Detailed downstream runtime information from the selected saved run. The compact Deeper Agent Run strip above is preserved.";

    panel.append(head, grid, note);
    lastSignature = signature;
  }

  function scheduleRender() {
    window.clearTimeout(scheduleRender.timer);
    scheduleRender.timer = window.setTimeout(render, 80);
  }

  render();

  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  document.getElementById("caseSelect")?.addEventListener("change", scheduleRender);
})();
