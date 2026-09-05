(() => {
  /* Teacher-review presentation polish.
   * Presentation only: trace/source data and field names are never changed.
   * Modules open in a panel; stage I/O stays fully visible but is laid out inline.
   */

  const MODULE_EXPLAIN = {
    CONN: "Authenticates the client connection and makes the Gateway ready before chat.send enters the request path.",
    M1: "Checks whether the request may enter the Gateway: method permission, request shape, and message normalization.",
    M2: "Resolves which Session and Agent own this request before execution continues.",
    M3: "Applies send policy, duplicate protection, and runtime admission before work is allowed to run.",
    M4: "Builds the runtime message context and finalizes it for reply handling.",
    M5: "Runs reply dispatch, re-checks the downstream Agent, and selects the reply resolver that enters deeper Agent Runtime."
  };

  const MODULE_CARD_SUBTITLE = {
    CONN: "Authenticate connection",
    M1: "Validate the request",
    M2: "Resolve Session & Agent",
    M3: "Policy & admission",
    M4: "Build runtime context",
    M5: "Dispatch to Agent Runtime"
  };

  function getModule(id) {
    try {
      if (id === "CONN") {
        const g2 = getStage("G2");
        return {
          id: "CONN",
          title: "Connection & Handshake",
          subtitle: "Authenticate the connection and make the Gateway ready.",
          stages: ["G0", "G1", "G2"],
          result: g2?.result || "—",
          arch: "Gateway Connection"
        };
      }
      if (typeof mods !== "undefined" && mods?.[id]) return mods[id];
      if (typeof DATA !== "undefined" && Array.isArray(DATA?.modules)) {
        return DATA.modules.find(module => module.id === id) || null;
      }
    } catch {}
    return null;
  }

  function getStage(id) {
    try {
      return typeof byId !== "undefined" ? (byId?.[id] || null) : null;
    } catch {
      return null;
    }
  }

  function traceIsInProgress() {
    const state = document.getElementById("requestState")?.textContent?.trim() || "";
    return /^(?:STARTING|RUNNING|PAUSED)/i.test(state);
  }

  function currentStageLabel() {
    try {
      const stage = getStage(activeStage);
      if (!stage || !/^G\\d+$/.test(String(activeStage || ""))) return "";
      return `${activeStage} · ${stage.short || stage.title || activeStage}`;
    } catch {
      return "";
    }
  }

  function polishOverviewLabels() {
    const pipeline = document.querySelector(".pipeline");
    if (!pipeline) return;
    const kicker = pipeline.querySelector(":scope > .kicker");
    const title = pipeline.querySelector(":scope > .sectionTitle");
    if (kicker) kicker.textContent = "TRACE OVERVIEW";
    if (title) title.textContent = "OpenClaw request flow";

    let indicator = pipeline.querySelector(":scope > .currentStageIndicator");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "currentStageIndicator";
      indicator.innerHTML = '<span class="currentStageIndicatorLabel">Current stage</span><strong></strong>';
      title?.insertAdjacentElement("afterend", indicator);
    }
    const value = traceIsInProgress() ? currentStageLabel() : "";
    indicator.hidden = !value;
    const strong = indicator.querySelector("strong");
    if (strong) strong.textContent = value || "—";
  }

  function decorateModuleColumns() {
    const root = document.getElementById("moduleRow");
    if (!root) return;

    polishOverviewLabels();

    // Presentation-only synthetic pillar for G0-G2. It reuses the same current-run
    // stage objects; it does not create or alter trace data.
    let connection = root.querySelector(':scope > .module[data-id="CONN"]');
    if (!connection) {
      connection = document.createElement("div");
      connection.className = "module pillarConnection";
      connection.dataset.id = "CONN";
      connection.innerHTML = [
        '<div class="mid">CONN</div>',
        '<h3>Connection & Handshake</h3>',
        '<p>Authenticate the client and make the Gateway ready.</p>',
        '<div class="arch">Gateway Connection</div>',
        '<div class="mresult"></div>'
      ].join("");
      root.prepend(connection);

      const connector = document.createElement("div");
      connector.className = "moduleConnector pillarConnectionConnector sequence";
      connector.setAttribute("aria-hidden", "true");
      connector.innerHTML = '<div class="moduleConnectorForward"><span class="moduleConnectorLine"></span><span class="moduleConnectorArrow">→</span></div>';
      connection.insertAdjacentElement("afterend", connector);
    }

    const g2 = getStage("G2");
    const connectionResult = connection.querySelector(":scope > .mresult");
    if (connectionResult) connectionResult.textContent = g2?.result || "—";
    if (["G0","G1","G2"].every(id => {
      try { return typeof completed !== "undefined" && completed.has(id); } catch { return false; }
    })) connection.classList.add("done");

    root.querySelectorAll(":scope > .module[data-id]").forEach(node => {
      const id = node.dataset.id || "";
      const module = getModule(id);
      if (!module) return;

      const subtitle = node.querySelector(":scope > p");
      if (subtitle && MODULE_CARD_SUBTITLE[id]) subtitle.textContent = MODULE_CARD_SUBTITLE[id];

      let list = node.querySelector(":scope > .moduleMiniStages");
      if (!list) {
        list = document.createElement("div");
        list.className = "moduleMiniStages";
        const result = node.querySelector(":scope > .mresult");
        if (result) node.insertBefore(list, result);
        else node.append(list);
      }

      list.replaceChildren();
      (module.stages || []).forEach(stageId => {
        const stage = getStage(stageId);
        const row = document.createElement("div");
        row.className = "moduleMiniStage";

        const sid = document.createElement("span");
        sid.className = "moduleMiniStageId";
        sid.textContent = stageId;

        const title = document.createElement("span");
        title.className = "moduleMiniStageTitle";
        title.textContent = stage?.short || stage?.title || stageId;

        row.append(sid, title);
        row.dataset.stageId = stageId;
        row.classList.toggle("currentG", traceIsInProgress() && stageId === activeStage);
        try {
          row.classList.toggle("completedG", typeof completed !== "undefined" && completed.has(stageId));
        } catch {}
        list.append(row);
      });

      let hint = node.querySelector(":scope > .moduleOpenHint");
      if (!hint) {
        hint = document.createElement("span");
        hint.className = "moduleOpenHint";
        hint.textContent = "View flow →";
        node.append(hint);
      }
    });
  }

  function syncOpenModuleCurrentStage() {
    const panel = document.getElementById("moduleInspectPanel");
    if (!panel) return;
    panel.querySelectorAll(".modulePanelStage[data-stage-id]").forEach(node => {
      node.classList.toggle("currentG", traceIsInProgress() && node.dataset.stageId === activeStage);
    });
  }

  function installModuleColumnDecorator() {
    if (document.documentElement.dataset.moduleColumnDecoratorBound === "1") {
      decorateModuleColumns();
      syncOpenModuleCurrentStage();
      return;
    }
    if (typeof renderModules !== "function") return;

    const previous = renderModules;
    renderModules = function renderModulesWithColumnDetails(...args) {
      const result = previous(...args);
      decorateModuleColumns();
      syncOpenModuleCurrentStage();
      return result;
    };
    document.documentElement.dataset.moduleColumnDecoratorBound = "1";
    decorateModuleColumns();
    syncOpenModuleCurrentStage();
  }

  let lastModuleTrigger = null;

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
        <div class="modulePanelSectionTitle">Execution flow</div>
        <div class="modulePanelStages" id="modulePanelStages"></div>
        <div class="modulePanelHint">Follow the flow from left to right. Select any stage for Input / Output / Flow / Steps / Source.</div>
      </div>`;

    document.body.append(backdrop, panel);
    backdrop.addEventListener("click", () => closeModulePanel());
    panel.querySelector("#modulePanelClose")?.addEventListener("click", () => closeModulePanel());
  }

  function closeModulePanel({ restoreFocus = true } = {}) {
    document.body.classList.remove("modulePanelOpen");
    document.querySelectorAll(".module.modulePanelInspecting").forEach(node => node.classList.remove("modulePanelInspecting"));
    if (restoreFocus && lastModuleTrigger && document.contains(lastModuleTrigger)) {
      lastModuleTrigger.focus?.({ preventScroll: true });
    }
  }

  function openStageFromModule(stageId) {
    closeModulePanel({ restoreFocus: false });
    try {
      if (typeof selectStage === "function") selectStage(stageId);
    } catch {}

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

    const stageIds = Array.isArray(module.stages) ? module.stages : [];
    const kicker = document.getElementById("modulePanelKicker");
    const title = document.getElementById("modulePanelTitle");
    const purpose = document.getElementById("modulePanelPurpose");
    const arch = document.getElementById("modulePanelArch");
    const result = document.getElementById("modulePanelResult");
    const count = document.getElementById("modulePanelCount");
    const stagesRoot = document.getElementById("modulePanelStages");

    if (kicker) kicker.textContent = `${id} · Module`;
    if (title) title.textContent = module.title || id;
    if (purpose) purpose.textContent = module.subtitle || MODULE_EXPLAIN[id] || "—";
    if (arch) arch.textContent = module.arch || "—";
    if (result) result.textContent = module.result || "—";
    if (count) count.textContent = `${stageIds.length} stages`;

    if (stagesRoot) {
      stagesRoot.replaceChildren();
      stageIds.forEach(stageId => {
        const stage = getStage(stageId);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "modulePanelStage";
        button.dataset.stageId = stageId;
        button.classList.toggle("currentG", traceIsInProgress() && stageId === activeStage);
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

  function bindModuleInteractions() {
    if (document.documentElement.dataset.safeModulePanelBound === "1") return;
    document.documentElement.dataset.safeModulePanelBound = "1";

    document.addEventListener("click", event => {
      const node = event.target.closest?.(".module[data-id]");
      if (!node || !/^(?:CONN|M[1-5])$/.test(node.dataset.id || "")) return;
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
      if (!node || !/^(?:CONN|M[1-5])$/.test(node.dataset.id || "")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openModulePanel(node.dataset.id, node);
    }, true);
  }

  const IO_ROWS = ["stageIoInputRows", "stageIoOutputRows"];
  const MORE_BUTTONS = ["stageIoInputMore", "stageIoOutputMore"];

  function keepIoComplete() {
    MORE_BUTTONS.forEach(id => document.getElementById(id)?.remove());

    IO_ROWS.forEach(id => {
      const rows = document.getElementById(id);
      if (!rows) return;
      rows.dataset.ioCompactInline = "1";
      rows.querySelectorAll(":scope > .stageIoRow").forEach(row => {
        row.hidden = false;
        row.classList.remove("compactIoHidden");
        row.style.removeProperty("display");
      });

      if (rows.dataset.ioCompleteObserved !== "1") {
        rows.dataset.ioCompleteObserved = "1";
        new MutationObserver(() => keepIoComplete()).observe(rows, { childList: true });
      }
    });

    document.querySelectorAll(".stageIoValues").forEach(values => {
      values.classList.remove("compactIoClamp", "compactIoExpanded");
    });
  }

  function boot(attempt = 0) {
    installModuleColumnDecorator();
    bindModuleInteractions();
    buildModulePanel();
    keepIoComplete();

    const requestState = document.getElementById("requestState");
    if (requestState && requestState.dataset.stageFocusStateObserved !== "1") {
      requestState.dataset.stageFocusStateObserved = "1";
      new MutationObserver(() => {
        decorateModuleColumns();
        syncOpenModuleCurrentStage();
      }).observe(requestState, { childList: true, subtree: true, characterData: true });
    }

    const ready = IO_ROWS.every(id => document.getElementById(id));
    if (!ready && attempt < 80) setTimeout(() => boot(attempt + 1), 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot(), { once: true });
  } else {
    boot();
  }
})();

(() => {
  /* Keep the G-stage inspector at the viewport center and always open it at
   * the beginning of the selected page. Presentation only; stage data is untouched.
   */
  const detail = document.querySelector("section.detail.stageModalTarget");
  if (!detail) return;

  function enforceFrame() {
    detail.style.setProperty("position", "fixed", "important");
    detail.style.setProperty("inset", "auto", "important");
    detail.style.setProperty("left", "50%", "important");
    detail.style.setProperty("top", "50%", "important");
    detail.style.setProperty("transform", "translate(-50%, -50%)", "important");
    detail.style.setProperty("margin", "0", "important");
  }

  function resetPanel() {
    if (!document.body.classList.contains("stageModalOpen")) return;
    enforceFrame();
    detail.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  let wasOpen = document.body.classList.contains("stageModalOpen");
  const classObserver = new MutationObserver(() => {
    const isOpen = document.body.classList.contains("stageModalOpen");
    if (isOpen && !wasOpen) {
      requestAnimationFrame(() => {
        resetPanel();
        requestAnimationFrame(resetPanel);
      });
    }
    wasOpen = isOpen;
  });
  classObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  document.addEventListener("click", event => {
    const stageTrigger = event.target.closest?.('[data-id^="G"]');
    const pageTrigger = event.target.closest?.(".stagePageTab");
    if (!stageTrigger && !pageTrigger) return;
    requestAnimationFrame(() => {
      resetPanel();
      requestAnimationFrame(resetPanel);
    });
  });
})();
