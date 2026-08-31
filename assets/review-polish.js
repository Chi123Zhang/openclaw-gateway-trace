(() => {
  /* Teacher-review polish.
   * - M1-M5 open in a lightweight panel instead of changing the page below.
   * - Stage Input/Output shows two concrete rows by default, with optional expansion.
   * Trace data and source/runtime field names are not changed here.
   */

  const MODULE_EXPLAIN = {
    M1: "Checks whether the request may enter the Gateway: method permission, request shape, and message normalization.",
    M2: "Resolves which Session and Agent own this request before execution continues.",
    M3: "Applies send policy, duplicate protection, and runtime admission before work is allowed to run.",
    M4: "Builds the runtime message context and finalizes it for reply handling.",
    M5: "Runs reply dispatch, re-checks the downstream Agent, and selects the reply resolver that enters deeper Agent Runtime."
  };

  function getModule(id) {
    try {
      return (DATA?.modules || []).find(module => module.id === id) || mods?.[id] || null;
    } catch {
      return null;
    }
  }

  function getStage(id) {
    try { return byId?.[id] || null; } catch { return null; }
  }

  function buildModulePanel() {
    if (document.getElementById("moduleInspectPanel")) return;

    const backdrop = document.createElement("div");
    backdrop.className = "modulePanelBackdrop";
    backdrop.id = "modulePanelBackdrop";
    backdrop.setAttribute("aria-hidden", "true");

    const panel = document.createElement("section");
    panel.className = "modulePanel";
    panel.id = "moduleInspectPanel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "modulePanelTitle");
    panel.innerHTML = `
      <header class="modulePanelHeader">
        <div>
          <div class="modulePanelKicker" id="modulePanelKicker">Module</div>
          <div class="modulePanelTitle" id="modulePanelTitle">—</div>
        </div>
        <button type="button" class="modulePanelClose" id="modulePanelClose" aria-label="Close module panel">×</button>
      </header>
      <div class="modulePanelBody">
        <div class="modulePanelIntro">
          <div class="modulePanelPurpose">
            <span class="modulePanelLabel">What this module does</span>
            <p id="modulePanelPurpose">—</p>
            <div class="modulePanelArch" id="modulePanelArch">—</div>
          </div>
          <div class="modulePanelStatus">
            <span class="modulePanelLabel">Current run</span>
            <strong id="modulePanelResult">—</strong>
            <small id="modulePanelCount">—</small>
          </div>
        </div>
        <div class="modulePanelSectionTitle">Stages in this module</div>
        <div class="modulePanelStages" id="modulePanelStages"></div>
        <div class="modulePanelHint">Select a stage to open its detailed panel. The main overview stays in place.</div>
      </div>`;

    document.body.append(backdrop, panel);
    backdrop.addEventListener("click", closeModulePanel);
    panel.querySelector("#modulePanelClose")?.addEventListener("click", closeModulePanel);
  }

  let lastModuleTrigger = null;

  function closeModulePanel({ restoreFocus = true } = {}) {
    document.body.classList.remove("modulePanelOpen");
    document.querySelectorAll(".module.modulePanelInspecting").forEach(node => node.classList.remove("modulePanelInspecting"));
    if (restoreFocus && lastModuleTrigger && document.contains(lastModuleTrigger)) {
      lastModuleTrigger.focus?.({ preventScroll: true });
    }
  }

  function openStageFromModule(stageId) {
    closeModulePanel({ restoreFocus: false });
    if (typeof selectStage === "function") selectStage(stageId);

    // Reuse the existing G-stage modal behavior rather than introducing another
    // detail view. Click the freshly rendered stage node after selectStage().
    requestAnimationFrame(() => {
      const candidates = [...document.querySelectorAll(`[data-id="${stageId}"]`)]
        .filter(node => !node.closest("#moduleInspectPanel"));
      const preferred = candidates.find(node => node.closest("#subflow"))
        || candidates.find(node => node.closest("#tabs"))
        || candidates[0];
      preferred?.click();
    });
  }

  function openModulePanel(id, trigger) {
    buildModulePanel();
    const module = getModule(id);
    if (!module) return;

    lastModuleTrigger = trigger || null;
    document.querySelectorAll(".module.modulePanelInspecting").forEach(node => node.classList.remove("modulePanelInspecting"));
    trigger?.classList.add("modulePanelInspecting");

    const title = document.getElementById("modulePanelTitle");
    const kicker = document.getElementById("modulePanelKicker");
    const purpose = document.getElementById("modulePanelPurpose");
    const arch = document.getElementById("modulePanelArch");
    const result = document.getElementById("modulePanelResult");
    const count = document.getElementById("modulePanelCount");
    const stagesRoot = document.getElementById("modulePanelStages");

    if (kicker) kicker.textContent = `${module.id} · Module`;
    if (title) title.textContent = module.title || module.id;
    if (purpose) purpose.textContent = MODULE_EXPLAIN[module.id] || module.subtitle || "—";
    if (arch) arch.textContent = module.arch || "—";
    if (result) result.textContent = module.result || "—";
    if (count) count.textContent = `${module.stages?.length || 0} stages`;

    if (stagesRoot) {
      stagesRoot.replaceChildren();
      (module.stages || []).forEach(stageId => {
        const stage = getStage(stageId);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "modulePanelStage";
        button.innerHTML = `
          <span class="modulePanelStageId"></span>
          <span class="modulePanelStageMain">
            <span class="modulePanelStageTitle"></span>
            <span class="modulePanelStageNote"></span>
          </span>
          <span class="modulePanelStageResult"></span>`;
        button.querySelector(".modulePanelStageId").textContent = stageId;
        button.querySelector(".modulePanelStageTitle").textContent = stage?.short || stage?.title || stageId;
        button.querySelector(".modulePanelStageNote").textContent = stage?.purpose || "Open stage details";
        button.querySelector(".modulePanelStageResult").textContent = stage?.result || "—";
        button.addEventListener("click", () => openStageFromModule(stageId));
        stagesRoot.append(button);
      });
    }

    document.body.classList.add("modulePanelOpen");
    requestAnimationFrame(() => document.getElementById("modulePanelClose")?.focus({ preventScroll: true }));
  }

  function markModuleNodes(root = document) {
    root.querySelectorAll?.(".module[data-id]").forEach(node => {
      const id = node.dataset.id || "";
      if (!/^M[1-5]$/.test(id)) return;
      if (node.dataset.modulePanelReady === "1") return;
      node.dataset.modulePanelReady = "1";
      node.setAttribute("role", "button");
      node.tabIndex = 0;
      node.title = `Open ${id} module panel`;
    });
  }

  // Capture the module click before app.js's existing onclick can change active
  // module/stage and redraw the page. The panel is now the only module-click action.
  document.addEventListener("click", event => {
    const node = event.target.closest?.(".module[data-id]");
    if (!node || !/^M[1-5]$/.test(node.dataset.id || "")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openModulePanel(node.dataset.id, node);
  }, true);

  document.addEventListener("keydown", event => {
    if (document.body.classList.contains("modulePanelOpen") && event.key === "Escape") {
      event.preventDefault();
      closeModulePanel();
      return;
    }
    const node = event.target.closest?.(".module[data-id]");
    if (!node || !/^M[1-5]$/.test(node.dataset.id || "")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openModulePanel(node.dataset.id, node);
  }, true);

  buildModulePanel();
  markModuleNodes();
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(".module[data-id]")) markModuleNodes(node.parentElement || document);
        markModuleNodes(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  /* ---------- Compact Input / Output ---------- */
  const SIDES = [
    { rows: "stageIoInputRows", values: "stageIoInputValues", button: "stageIoInputMore" },
    { rows: "stageIoOutputRows", values: "stageIoOutputValues", button: "stageIoOutputMore" }
  ];

  function ensureMoreButton(spec) {
    const rows = document.getElementById(spec.rows);
    if (!rows) return null;
    let button = document.getElementById(spec.button);
    if (!button) {
      button = document.createElement("button");
      button.id = spec.button;
      button.type = "button";
      button.className = "stageIoMoreButton";
      button.hidden = true;
      rows.parentElement?.append(button);
      button.addEventListener("click", () => {
        const expanded = rows.dataset.compactExpanded === "1";
        rows.dataset.compactExpanded = expanded ? "0" : "1";
        compactSide(spec);
      });
    }
    return button;
  }

  function compactSide(spec) {
    const rows = document.getElementById(spec.rows);
    const values = document.getElementById(spec.values);
    const button = ensureMoreButton(spec);
    if (!rows || !values || !button) return;

    const expanded = rows.dataset.compactExpanded === "1";
    const rowList = [...rows.querySelectorAll(":scope > .stageIoRow")];
    const valueLines = String(values.textContent || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const rowsAreVisible = !rows.hidden && rowList.length > 0;

    rowList.forEach((row, index) => {
      row.classList.toggle("compactIoHidden", !expanded && index >= 2);
    });

    values.classList.add("compactIoClamp");
    values.classList.toggle("compactIoExpanded", expanded);

    const total = rowsAreVisible ? rowList.length : valueLines.length;
    const hasExtra = total > 2;
    button.hidden = !hasExtra;
    if (hasExtra) {
      button.textContent = expanded ? "Show less" : `Show ${total - 2} more`;
      button.setAttribute("aria-expanded", String(expanded));
    }
  }

  function resetCompactIo() {
    SIDES.forEach(spec => {
      const rows = document.getElementById(spec.rows);
      if (rows) rows.dataset.compactExpanded = "0";
      compactSide(spec);
    });
  }

  function bindCompactIo() {
    SIDES.forEach(spec => {
      const rows = document.getElementById(spec.rows);
      const values = document.getElementById(spec.values);
      ensureMoreButton(spec);
      if (rows && rows.dataset.compactIoObserved !== "1") {
        rows.dataset.compactIoObserved = "1";
        new MutationObserver(() => compactSide(spec)).observe(rows, { childList: true });
      }
      if (values && values.dataset.compactIoObserved !== "1") {
        values.dataset.compactIoObserved = "1";
        new MutationObserver(() => compactSide(spec)).observe(values, { childList: true, subtree: true, characterData: true });
      }
      compactSide(spec);
    });

    const title = document.getElementById("detailTitle");
    if (title && title.dataset.compactIoTitleObserved !== "1") {
      title.dataset.compactIoTitleObserved = "1";
      new MutationObserver(resetCompactIo).observe(title, { childList: true, subtree: true });
    }
  }

  bindCompactIo();
  new MutationObserver(bindCompactIo).observe(document.body, { childList: true, subtree: true });
})();
