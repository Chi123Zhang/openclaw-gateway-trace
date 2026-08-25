(() => {
  const detail = document.querySelector("section.detail");
  if (!detail) return;

  detail.classList.add("stageModalTarget");

  const backdrop = document.createElement("div");
  backdrop.className = "stageModalBackdrop";
  backdrop.setAttribute("aria-hidden", "true");
  document.body.append(backdrop);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "stageModalClose";
  close.setAttribute("aria-label", "Close stage detail");
  close.textContent = "×";
  detail.append(close);

  let lastTrigger = null;

  function openModal(trigger = null) {
    if (trigger) lastTrigger = trigger;
    document.body.classList.add("stageModalOpen");
    detail.setAttribute("role", "dialog");
    detail.setAttribute("aria-modal", "true");
    const title = document.getElementById("detailTitle");
    if (title?.id) detail.setAttribute("aria-labelledby", title.id);
    requestAnimationFrame(() => close.focus({ preventScroll: true }));
  }

  function closeModal() {
    document.body.classList.remove("stageModalOpen");
    detail.removeAttribute("role");
    detail.removeAttribute("aria-modal");
    detail.removeAttribute("aria-labelledby");
    if (lastTrigger && document.contains(lastTrigger)) {
      lastTrigger.focus?.({ preventScroll: true });
    }
  }

  close.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  document.addEventListener("keydown", event => {
    if (!document.body.classList.contains("stageModalOpen")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
  });

  function bindStageNode(node) {
    if (!node || node.dataset.stageModalBound === "1") return;
    const id = node.dataset.id;
    if (!/^G\d+$/.test(id || "")) return;
    node.dataset.stageModalBound = "1";
    node.setAttribute("role", "button");
    if (!node.hasAttribute("tabindex")) node.tabIndex = 0;
    node.title = `Open ${id} details`;

    node.addEventListener("click", event => {
      // Existing handlers update activeStage first; open after that update finishes.
      requestAnimationFrame(() => openModal(node));
    });

    node.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (typeof selectStage === "function") selectStage(id);
      requestAnimationFrame(() => openModal(node));
    });
  }

  function bindAllStageNodes(root = document) {
    root.querySelectorAll?.('[data-id^="G"]').forEach(bindStageNode);
  }

  bindAllStageNodes();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('[data-id^="G"]')) bindStageNode(node);
        bindAllStageNodes(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // When tabs inside the modal switch G stages, keep the modal open and update in place.
  detail.addEventListener("click", event => {
    const stageNode = event.target.closest?.('[data-id^="G"]');
    if (!stageNode || !detail.contains(stageNode)) return;
    requestAnimationFrame(() => {
      if (document.body.classList.contains("stageModalOpen")) {
        detail.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
})();

(() => {
  /* Compact one-page presentation layer.
   *
   * 1) Response becomes zoomable and collapsible.
   * 2) The right sidebar keeps only decision-relevant state.
   * 3) Expanded G-stage inspection defaults to Purpose / Observed trace /
   *    Input / Output, while Flow / Steps / Source / Diagnostics are paged tabs.
   *
   * This layer does not alter trace data or source mappings; it only changes
   * presentation and navigation.
   */

  const style = document.createElement("style");
  style.id = "compactDashboardStyles";
  style.textContent = `
    /* ---------- Response: compact by default, zoom / expand on demand ---------- */
    .responsePanel{--response-font-scale:1;position:relative;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
    .responseToolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
    .responseToolbar .kicker{margin:0}
    .responseControls{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .responseControl{height:28px;min-width:32px;padding:0 9px;border:1px solid #39424a;border-radius:6px;background:#171b20;color:#aeb7bf;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
    .responseControl:hover{background:#1e2429;border-color:#596670;color:#eef2f5}
    .responseControl:focus-visible{outline:2px solid #78908a;outline-offset:2px}
    #responseText{font-size:calc(12px * var(--response-font-scale));line-height:1.55;white-space:pre-wrap;word-break:break-word;margin:0;padding:10px 12px;border:1px solid #2c343b;border-radius:7px;background:#111518;transition:max-height .16s ease}
    .responsePanel.responseCollapsed #responseText{max-height:164px;overflow:hidden}
    .responsePanel.responseExpanded #responseText{max-height:min(52vh,560px);overflow:auto}
    .responsePanel.responseCollapsed::after{content:"";position:absolute;left:1px;right:1px;bottom:1px;height:34px;pointer-events:none;background:linear-gradient(to bottom,rgba(17,21,24,0),#111518)}

    /* ---------- Sidebar: keep only current decision state ---------- */
    .sidebar.compactSidebar{padding:13px;gap:0}
    .sidebar.compactSidebar .compactHidden{display:none!important}
    .compactSideSummary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:8px 0 10px}
    .compactSideItem{min-width:0;padding:8px 9px;border:1px solid #2c343b;border-radius:7px;background:#12171b}
    .compactSideItem.wide{grid-column:1/-1}
    .compactSideLabel{display:block;margin-bottom:4px;color:#7f8a94;font:600 9px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.06em}
    .compactSideValue{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e0e5e9;font:700 11px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace}
    .compactSideValue.good{color:var(--good)}
    .compactSideValue.warn{color:var(--warn)}
    .sidebar.compactSidebar .sep{margin:9px 0}
    .sidebar.compactSidebar .sideTitle{font-size:10px;margin-bottom:6px}
    .sidebar.compactSidebar .ctxRow{padding:6px 0;gap:8px}
    .sidebar.compactSidebar .ctxLabel small{display:none}
    .sidebar.compactSidebar .ctxLabel{min-width:0}
    .sidebar.compactSidebar .ctxLabel span{font-size:10px}
    .sidebar.compactSidebar .ctxRight{min-width:0}
    .sidebar.compactSidebar .ctxValue{font-size:9px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sidebar.compactSidebar .stateChip{font-size:8px;padding:2px 5px}
    .sidebar.compactSidebar .contextNote,.sidebar.compactSidebar .note,.sidebar.compactSidebar #log{display:none!important}
    .sidebar.compactSidebar .metric{padding:5px 0}
    .sidebar.compactSidebar .barRow{margin-top:8px}
    .sidebar.compactSidebar .barHead{font-size:9px}

    /* ---------- Expanded stage: tabbed pages instead of one long document ---------- */
    .stagePageTabs{display:flex;gap:6px;align-items:center;padding:9px 14px;background:#12161a;border-bottom:1px solid #2b3238;overflow-x:auto}
    body.stageModalOpen .stagePageTabs{position:sticky;top:128px;z-index:6}
    .stagePageTab{flex:0 0 auto;height:30px;padding:0 11px;border:1px solid #39424a;border-radius:6px;background:#151a1f;color:#94a0aa;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
    .stagePageTab:hover{border-color:#5d6973;color:#dce2e7}
    .stagePageTab.active{border-color:#647a73;background:#17221e;color:#9fd0b7}
    .stagePageTab:focus-visible{outline:2px solid #78908a;outline-offset:2px}

    body.stageModalOpen .stageModalTarget .detailBreadcrumb{position:static!important;top:auto!important}
    body.stageModalOpen .stageModalTarget[data-compact-page="overview"] .detailBreadcrumb,
    body.stageModalOpen .stageModalTarget[data-compact-page="flow"] .detailBreadcrumb,
    body.stageModalOpen .stageModalTarget[data-compact-page="diagnostics"] .detailBreadcrumb{display:none!important}

    body.stageModalOpen .stageModalTarget[data-compact-page="overview"] #stageHandoffPanel,
    body.stageModalOpen .stageModalTarget[data-compact-page="overview"] .processSection,
    body.stageModalOpen .stageModalTarget[data-compact-page="overview"] .compactSecondarySummary{display:none!important}
    body.stageModalOpen .stageModalTarget[data-compact-page="overview"] .compactPrimarySummary{display:grid!important}

    body.stageModalOpen .stageModalTarget[data-compact-page="flow"] .compactPrimarySummary,
    body.stageModalOpen .stageModalTarget[data-compact-page="flow"] .processSection,
    body.stageModalOpen .stageModalTarget[data-compact-page="flow"] .compactSecondarySummary{display:none!important}
    body.stageModalOpen .stageModalTarget[data-compact-page="flow"] #stageHandoffPanel{display:block!important}

    body.stageModalOpen .stageModalTarget[data-compact-page="steps"] .compactPrimarySummary,
    body.stageModalOpen .stageModalTarget[data-compact-page="steps"] #stageHandoffPanel,
    body.stageModalOpen .stageModalTarget[data-compact-page="steps"] .compactSecondarySummary{display:none!important}
    body.stageModalOpen .stageModalTarget[data-compact-page="steps"] .processSection{display:block!important}
    body.stageModalOpen .stageModalTarget[data-compact-page="steps"] .processSection .sourceToggle,
    body.stageModalOpen .stageModalTarget[data-compact-page="steps"] .processSection #sourceDetail{display:none!important}

    body.stageModalOpen .stageModalTarget[data-compact-page="source"] .compactPrimarySummary,
    body.stageModalOpen .stageModalTarget[data-compact-page="source"] #stageHandoffPanel,
    body.stageModalOpen .stageModalTarget[data-compact-page="source"] .compactSecondarySummary{display:none!important}
    body.stageModalOpen .stageModalTarget[data-compact-page="source"] .processSection{display:block!important}
    body.stageModalOpen .stageModalTarget[data-compact-page="source"] .processSection .processTop,
    body.stageModalOpen .stageModalTarget[data-compact-page="source"] .processSection .compactSteps,
    body.stageModalOpen .stageModalTarget[data-compact-page="source"] .processSection .sourceToggle{display:none!important}
    body.stageModalOpen .stageModalTarget[data-compact-page="source"] .processSection #sourceDetail{display:block!important;max-height:none!important;opacity:1!important;visibility:visible!important}

    body.stageModalOpen .stageModalTarget[data-compact-page="diagnostics"] .compactPrimarySummary,
    body.stageModalOpen .stageModalTarget[data-compact-page="diagnostics"] #stageHandoffPanel,
    body.stageModalOpen .stageModalTarget[data-compact-page="diagnostics"] .processSection{display:none!important}
    body.stageModalOpen .stageModalTarget[data-compact-page="diagnostics"] .compactSecondarySummary{display:grid!important}

    body.stageModalOpen .stageModalTarget .compactPrimarySummary{grid-template-columns:repeat(2,minmax(0,1fr));border-bottom:0}
    body.stageModalOpen .stageModalTarget .compactPrimarySummary .info{padding:14px 16px}
    body.stageModalOpen .stageModalTarget .compactPrimarySummary .info p{margin-bottom:0}
    body.stageModalOpen .stageModalTarget .compactPrimarySummary .ioValues{max-height:175px}
    body.stageModalOpen .stageModalTarget .processSection{border-top:0}
    body.stageModalOpen .stageModalTarget #stageHandoffPanel{margin-top:0}

    /* ---------- One-page / print discipline ---------- */
    @media print{
      header,.askPanel form,.conn,.query,.pipeline,.sidebar,.output,.stageModalBackdrop,.stageModalClose,.stagePageTabs{display:none!important}
      body{background:#fff!important;color:#111!important}
      .layout,.main{display:block!important;width:100%!important;max-width:none!important}
      .responsePanel{display:block!important;break-inside:avoid}
      .responsePanel #responseText{max-height:220px!important;overflow:hidden!important;color:#111!important;background:#fff!important;border-color:#bbb!important;font-size:9pt!important}
      .detail.stageModalTarget{display:block!important;position:static!important;transform:none!important;width:100%!important;height:auto!important;overflow:visible!important;border:1px solid #bbb!important;box-shadow:none!important;background:#fff!important;color:#111!important}
      .detail.stageModalTarget .detailHead,.detail.stageModalTarget .tabs{position:static!important;background:#fff!important;color:#111!important}
      .detail.stageModalTarget .compactPrimarySummary{display:grid!important;grid-template-columns:1fr 1fr!important}
      .detail.stageModalTarget #stageHandoffPanel,.detail.stageModalTarget .processSection,.detail.stageModalTarget .compactSecondarySummary,.detail.stageModalTarget .detailBreadcrumb{display:none!important}
      .detail.stageModalTarget .info,.detail.stageModalTarget .ioValues{background:#fff!important;color:#111!important;border-color:#bbb!important}
    }

    @media(max-width:900px){
      .compactSideSummary{grid-template-columns:repeat(3,minmax(0,1fr))}
      body.stageModalOpen .stagePageTabs{top:124px}
    }
    @media(max-width:620px){
      .responseControls{gap:4px}
      .responseControl{height:27px;padding:0 7px}
      .compactSideSummary{grid-template-columns:1fr 1fr}
      body.stageModalOpen .stagePageTabs{position:sticky;top:116px;padding-left:10px;padding-right:10px}
      body.stageModalOpen .stageModalTarget .compactPrimarySummary{grid-template-columns:1fr}
    }
  `;
  document.head.append(style);

  function setupResponseControls() {
    const panel = document.getElementById("responsePanel");
    const text = document.getElementById("responseText");
    if (!panel || !text || panel.dataset.compactResponseBound === "1") return;
    panel.dataset.compactResponseBound = "1";
    panel.classList.add("responseCollapsed");

    const kicker = panel.querySelector(".kicker");
    const toolbar = document.createElement("div");
    toolbar.className = "responseToolbar";
    if (kicker) toolbar.append(kicker);
    else {
      const label = document.createElement("div");
      label.className = "kicker";
      label.textContent = "Response";
      toolbar.append(label);
    }

    const controls = document.createElement("div");
    controls.className = "responseControls";
    controls.setAttribute("aria-label", "Response display controls");

    const smaller = document.createElement("button");
    smaller.type = "button";
    smaller.className = "responseControl";
    smaller.textContent = "A−";
    smaller.title = "Smaller response text";

    const larger = document.createElement("button");
    larger.type = "button";
    larger.className = "responseControl";
    larger.textContent = "A+";
    larger.title = "Larger response text";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "responseControl responseExpandToggle";
    toggle.textContent = "Expand";
    toggle.title = "Expand or collapse the response";

    controls.append(smaller, larger, toggle);
    toolbar.append(controls);
    panel.insertBefore(toolbar, text);

    let scale = 1;
    function applyScale() {
      panel.style.setProperty("--response-font-scale", scale.toFixed(2));
      smaller.disabled = scale <= .8;
      larger.disabled = scale >= 1.4;
    }
    smaller.addEventListener("click", () => {
      scale = Math.max(.8, Math.round((scale - .1) * 10) / 10);
      applyScale();
    });
    larger.addEventListener("click", () => {
      scale = Math.min(1.4, Math.round((scale + .1) * 10) / 10);
      applyScale();
    });
    toggle.addEventListener("click", () => {
      const expanding = panel.classList.contains("responseCollapsed");
      panel.classList.toggle("responseCollapsed", !expanding);
      panel.classList.toggle("responseExpanded", expanding);
      toggle.textContent = expanding ? "Collapse" : "Expand";
      toggle.setAttribute("aria-expanded", String(expanding));
    });
    applyScale();
  }

  function hideClosest(id, selector = ".kv,.ctxRow,.metric") {
    const el = document.getElementById(id);
    const row = el?.closest(selector);
    if (row) row.classList.add("compactHidden");
  }

  function setupCompactSidebar() {
    const sidebar = document.querySelector("aside.sidebar");
    if (!sidebar || sidebar.dataset.compactSidebarBound === "1") return;
    sidebar.dataset.compactSidebarBound = "1";
    sidebar.classList.add("compactSidebar");

    const selectedTitle = [...sidebar.querySelectorAll(".sideTitle")]
      .find(node => node.textContent.trim() === "Selected");

    const summary = document.createElement("div");
    summary.className = "compactSideSummary";
    summary.id = "compactSideSummary";
    summary.innerHTML = `
      <div class="compactSideItem"><span class="compactSideLabel">Stage</span><b class="compactSideValue" id="compactStage">—</b></div>
      <div class="compactSideItem"><span class="compactSideLabel">Result</span><b class="compactSideValue" id="compactResult">—</b></div>
      <div class="compactSideItem"><span class="compactSideLabel">Agent</span><b class="compactSideValue" id="compactAgent">—</b></div>
      <div class="compactSideItem"><span class="compactSideLabel">Policy</span><b class="compactSideValue" id="compactPolicy">—</b></div>
      <div class="compactSideItem wide"><span class="compactSideLabel">Overall</span><b class="compactSideValue" id="compactOverall">—</b></div>`;
    if (selectedTitle) selectedTitle.insertAdjacentElement("afterend", summary);
    else sidebar.prepend(summary);

    // Hide the verbose Selected rows; values remain in DOM so app.js can keep
    // updating them and this compact summary can mirror them.
    ["sideStage","sideResult","sideAgent","sideResolver","sideProvider","sideModel","sideTools"].forEach(id => hideClosest(id));

    // Runtime context: keep Raw key, Canonical key, Agent and MsgContext only.
    ["ctxSessionEntry","ctxSessionId","ctxPolicy","ctxDownstreamAgent"].forEach(id => hideClosest(id));
    const contextNote = sidebar.querySelector(".contextNote");
    if (contextNote) contextNote.classList.add("compactHidden");

    // Remove the low-information Runtime block (ACK/title sync/time/tokens).
    const runtimeTitle = [...sidebar.querySelectorAll(".sideTitle")]
      .find(node => node.textContent.trim() === "Runtime");
    if (runtimeTitle) {
      runtimeTitle.classList.add("compactHidden");
      runtimeTitle.previousElementSibling?.classList.add("compactHidden");
      let node = runtimeTitle.nextElementSibling;
      while (node && !node.classList.contains("sep")) {
        node.classList.add("compactHidden");
        node = node.nextElementSibling;
      }
      if (node?.classList.contains("sep")) node.classList.add("compactHidden");
    }

    // Policy + Overall are already in the compact summary. Keep Auth / Runtime /
    // Routing in the State section; hide duplicate Evidence and the full G0-G18 log.
    hideClosest("riskPolicy");
    hideClosest("riskOverall");
    hideClosest("coverageText");
    sidebar.querySelector("#log")?.classList.add("compactHidden");
    sidebar.querySelector(".note")?.classList.add("compactHidden");

    // Preserve stage-source explanations as hover text instead of visible lines.
    sidebar.querySelectorAll(".ctxRow").forEach(row => {
      const label = row.querySelector(".ctxLabel span")?.textContent?.trim();
      const source = row.querySelector(".ctxLabel small")?.textContent?.trim();
      if (label && source) row.title = `${label}: ${source}`;
    });

    function mirror(sourceId, targetId) {
      const source = document.getElementById(sourceId);
      const target = document.getElementById(targetId);
      if (!source || !target) return;
      target.textContent = source.textContent || "—";
      target.classList.toggle("good", source.classList.contains("good") || getComputedStyle(source).color === "rgb(95, 184, 135)");
      target.classList.toggle("warn", source.classList.contains("warn"));
      if (sourceId === "sideResult") target.style.color = source.style.color || "";
    }

    function syncSummary() {
      mirror("sideStage","compactStage");
      mirror("sideResult","compactResult");
      mirror("sideAgent","compactAgent");
      mirror("ctxPolicy","compactPolicy");
      mirror("riskOverall","compactOverall");
    }

    ["sideStage","sideResult","sideAgent","ctxPolicy","riskOverall"].forEach(id => {
      const source = document.getElementById(id);
      if (!source) return;
      new MutationObserver(syncSummary).observe(source, {
        childList:true,
        subtree:true,
        attributes:true,
        attributeFilter:["class","style"]
      });
    });
    syncSummary();
  }

  function setupStagePagination() {
    const detail = document.querySelector("section.detail.stageModalTarget");
    if (!detail || detail.dataset.compactPagerBound === "1") return;
    detail.dataset.compactPagerBound = "1";

    const directSummaries = [...detail.children].filter(node => node.classList?.contains("summaryGrid"));
    const primary = directSummaries[0];
    if (primary) primary.classList.add("compactPrimarySummary");
    directSummaries.slice(1).forEach(node => node.classList.add("compactSecondarySummary"));

    const nav = document.createElement("nav");
    nav.className = "stagePageTabs";
    nav.setAttribute("aria-label", "Stage detail pages");
    nav.innerHTML = `
      <button type="button" class="stagePageTab active" data-stage-page="overview">Overview</button>
      <button type="button" class="stagePageTab" data-stage-page="flow">Flow</button>
      <button type="button" class="stagePageTab" data-stage-page="steps">Steps</button>
      <button type="button" class="stagePageTab" data-stage-page="source">Source</button>
      <button type="button" class="stagePageTab" data-stage-page="diagnostics">Diagnostics</button>`;

    const breadcrumb = detail.querySelector(".detailBreadcrumb");
    if (breadcrumb) breadcrumb.insertAdjacentElement("beforebegin", nav);
    else primary?.insertAdjacentElement("beforebegin", nav);

    function setPage(page, { scroll = true } = {}) {
      detail.dataset.compactPage = page;
      nav.querySelectorAll(".stagePageTab").forEach(button => {
        const active = button.dataset.stagePage === page;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
      if (scroll && document.body.classList.contains("stageModalOpen")) {
        detail.scrollTo({ top:0, behavior:"smooth" });
      }
    }

    nav.addEventListener("click", event => {
      const button = event.target.closest("[data-stage-page]");
      if (!button) return;
      setPage(button.dataset.stagePage);
    });
    setPage("overview", { scroll:false });

    // A newly selected G-stage always opens on the four-field overview.
    const title = document.getElementById("detailTitle");
    if (title) {
      let lastTitle = title.textContent;
      new MutationObserver(() => {
        if (title.textContent === lastTitle) return;
        lastTitle = title.textContent;
        setPage("overview", { scroll:false });
      }).observe(title, { childList:true, subtree:true });
    }

    let modalWasOpen = document.body.classList.contains("stageModalOpen");
    new MutationObserver(() => {
      const open = document.body.classList.contains("stageModalOpen");
      if (open && !modalWasOpen) setPage("overview", { scroll:false });
      modalWasOpen = open;
    }).observe(document.body, { attributes:true, attributeFilter:["class"] });
  }

  function setupAll() {
    setupResponseControls();
    setupCompactSidebar();
    setupStagePagination();
  }

  setupAll();
  // live.js can replace/update runtime content after this file loads; retrying the
  // idempotent setup on DOM additions keeps the compact UI active in live mode.
  new MutationObserver(() => setupAll()).observe(document.body, { childList:true, subtree:true });
})();
