(() => {
  const cfg = window.GATEWAY_CONFIG || {};
  const collectorUrl = String(cfg.collectorUrl || "").replace(/\/+$/, "");
  const select = document.getElementById("caseSelect");
  const picker = document.querySelector(".casePicker");
  const runButton = document.getElementById("runTraceBtn");
  const requestState = document.getElementById("requestState");
  const message = document.getElementById("runMessage");
  const collectorState = document.getElementById("collectorState");
  const responsePanel = document.getElementById("responsePanel");
  const responseText = document.getElementById("responseText");
  const promptInput = document.getElementById("promptInput");

  if (!select || !picker || !collectorUrl) return;

  let lastSelectedArchive = "";
  let refreshTimer = null;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function stageNumber(stage) {
    const value = Number(String(stage || "").replace("G", ""));
    return Number.isFinite(value) ? value : -1;
  }

  function shortPrompt(value, max = 44) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= max) return text || "Untitled run";
    return `${text.slice(0, max - 1)}…`;
  }

  function formatSavedAt(value) {
    if (!value) return "saved";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "saved";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function setResponse(value) {
    const text = String(value || "");
    responsePanel.hidden = !text;
    responseText.textContent = text;
  }

  function observedStageIds(trace) {
    const direct = trace?._collector?.traceStagesObserved;
    if (Array.isArray(direct) && direct.length) return direct;
    return Object.entries(trace?.stages || {})
      .filter(([, stage]) => Array.isArray(stage?.evidence) && stage.evidence.includes("runtime"))
      .map(([id]) => id);
  }

  function meaningfulStageIds(trace) {
    return Object.entries(trace?.stages || {})
      .filter(([, stage]) => {
        const result = String(stage?.result || "").trim();
        return result && result !== "—" && !/^waiting/i.test(result);
      })
      .map(([id]) => id);
  }

  function moduleResult(module, trace, observed) {
    const meta = trace?.meta || {};
    if (module.id === "M1" && observed.has("G5")) return "PASS";
    if (module.id === "M2" && observed.has("G9")) return meta.agent || "RESOLVED";
    if (module.id === "M3" && observed.has("G12")) return meta.admissionDecision || "ADMITTED";
    if (module.id === "M4" && trace?.stages?.G15?.result === "finalized") return "READY";
    if (module.id === "M5" && observed.has("G18")) return "RESOLVER";
    return module.result;
  }

  function paintSavedTrace(trace, response, label) {
    if (!trace || !trace.stages) throw new Error("Saved run has no trace data.");

    ACTIVE_CASE = trace;
    CASE2 = trace.meta || {};
    DATA = mergeCase(trace);

    const observed = new Set(observedStageIds(trace));
    DATA.modules = DATA.modules.map(module => ({
      ...module,
      result: moduleResult(module, trace, observed)
    }));

    byId = Object.fromEntries(DATA.stages.map(stage => [stage.id, stage]));
    mods = Object.fromEntries(DATA.modules.map(module => [module.id, module]));

    completed.clear();
    meaningfulStageIds(trace).forEach(id => completed.add(id));
    DATA.modules.forEach(module => {
      if (module.stages.every(id => completed.has(id))) completed.add(module.id);
    });

    const timeline = trace?._collector?.timeline || [];
    const lastTimelineStage = timeline.length ? timeline[timeline.length - 1]?.stage : "";
    const lastObservedStage = [...observed].sort((a, b) => stageNumber(a) - stageNumber(b)).at(-1);
    const focus = lastTimelineStage || lastObservedStage || "G18";
    activeStage = byId[focus] ? focus : "G3";
    activeModule = byId[activeStage]?.module || "M1";
    activeStep = 0;

    applyCaseMeta();
    renderAll();
    renderLog();
    syncSourceToggle();
    setResponse(response || trace.meta?.response || "");

    const progress = meaningfulStageIds(trace).length;
    const pct = Math.min(100, Math.round((progress / 19) * 100));
    const bar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    if (bar) bar.style.width = `${pct}%`;
    if (progressText) progressText.textContent = `${pct}%`;

    requestState.textContent = "SAVED RUN";
    if (collectorState) {
      collectorState.textContent = "Saved trace loaded";
      collectorState.className = "collectorState connected";
    }
    if (message) message.textContent = label;
    if (promptInput && trace.meta?.prompt) promptInput.value = trace.meta.prompt;
  }

  async function loadArchivedRun(archiveId) {
    if (!archiveId || runButton?.disabled) return;
    const response = await fetch(`${collectorUrl}/api/runs/${encodeURIComponent(archiveId)}`, {
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);

    lastSelectedArchive = archiveId;
    const when = formatSavedAt(payload.savedAt || payload.startedAt);
    paintSavedTrace(
      payload.trace,
      payload.response,
      `Loaded saved run · ${when} · ${shortPrompt(payload.prompt, 70)}`
    );
  }

  function loadReferenceCase() {
    const reference = window.GATEWAY_CASES?.cake;
    if (!reference) return;
    lastSelectedArchive = "";
    paintSavedTrace(
      reference,
      reference.meta?.response || "",
      "Loaded verified Cake reference trace."
    );
  }

  async function refreshRunHistory(preferredId = "") {
    try {
      const response = await fetch(`${collectorUrl}/api/runs?limit=40`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);

      const runs = Array.isArray(payload.runs) ? payload.runs : [];
      select.replaceChildren();

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = runs.length ? "Choose a saved run" : "No saved runs yet";
      select.append(placeholder);

      runs.forEach(run => {
        const option = document.createElement("option");
        option.value = `run:${run.id}`;
        const when = formatSavedAt(run.savedAt || run.startedAt);
        const suffix = run.status === "error" ? " · failed" : "";
        option.textContent = `${when} · ${shortPrompt(run.prompt)}${suffix}`;
        select.append(option);
      });

      const reference = window.GATEWAY_CASES?.cake;
      if (reference) {
        const divider = document.createElement("option");
        divider.disabled = true;
        divider.textContent = "──────── reference ────────";
        select.append(divider);

        const option = document.createElement("option");
        option.value = "reference:cake";
        option.textContent = "Verified Cake reference · Aug 12";
        select.append(option);
      }

      const wanted = preferredId || lastSelectedArchive;
      if (wanted && [...select.options].some(option => option.value === `run:${wanted}`)) {
        select.value = `run:${wanted}`;
      } else {
        select.value = "";
      }
    } catch (error) {
      select.replaceChildren();
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Run history unavailable";
      select.append(option);
      console.warn("Could not load run history:", error);
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshRunHistory(), 350);
  }

  async function initialize() {
    // app.js and live.js initialize asynchronously. Wait until the viewer is ready
    // before repurposing the old static-case picker as persistent run history.
    for (let i = 0; i < 120; i += 1) {
      if (typeof renderAll === "function" && ACTIVE_CASE && requestState) break;
      await sleep(25);
    }

    const label = picker.querySelector("span");
    if (label) label.textContent = "Run history";
    picker.style.display = "";
    select.title = "Saved local live runs";

    select.onchange = async () => {
      const value = select.value;
      if (!value) return;
      try {
        if (value === "reference:cake") {
          loadReferenceCase();
          return;
        }
        if (value.startsWith("run:")) {
          await loadArchivedRun(value.slice(4));
        }
      } catch (error) {
        if (message) message.textContent = `Could not load saved run: ${error.message}`;
      }
    };

    if (runButton) {
      new MutationObserver(() => {
        select.disabled = runButton.disabled;
      }).observe(runButton, { attributes: true, attributeFilter: ["disabled"] });
      select.disabled = runButton.disabled;
    }

    if (requestState) {
      new MutationObserver(() => {
        const state = requestState.textContent.trim();
        if (state === "FINISHED" || state === "FAILED") scheduleRefresh();
      }).observe(requestState, { childList: true, subtree: true, characterData: true });
    }

    await refreshRunHistory();
  }

  initialize();
})();
