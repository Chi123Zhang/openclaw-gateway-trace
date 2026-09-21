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
  const playButton = document.getElementById("playBtn");
  const publicNotice = document.getElementById("publicNotice");

  if (!select || !picker) return;

  let lastSelectedArchive = "";
  let refreshTimer = null;
  let staticFallbackLoaded = false;
  let lastHistorySelection = "";
  let lastHistorySelectionAt = 0;

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

  function savedRunResponse(trace, explicitResponse = "") {
    const directFinal = Array.isArray(trace?.agentRuntime?.events)
      ? trace.agentRuntime.events.find(event => event?.event === "agent_reply_finalized")?.replyText
      : "";
    return String(
      explicitResponse ||
      trace?.meta?.response ||
      trace?.agentRuntime?.finalReply ||
      directFinal ||
      ""
    );
  }

  function waitForCollectorState(timeoutMs = 900) {
    if (typeof window.TRACECLAW_COLLECTOR_READY === "boolean") {
      return Promise.resolve({ ready: window.TRACECLAW_COLLECTOR_READY });
    }

    return new Promise(resolve => {
      let settled = false;
      const finish = detail => {
        if (settled) return;
        settled = true;
        window.removeEventListener("traceclaw:collector-state", onState);
        resolve(detail || { ready: window.TRACECLAW_COLLECTOR_READY === true });
      };
      const onState = event => finish(event.detail || {});
      window.addEventListener("traceclaw:collector-state", onState);
      window.setTimeout(() => finish(), timeoutMs);
    });
  }

  function setPublicNotice(visible) {
    if (publicNotice) publicNotice.hidden = !visible;
  }

  function setStaticViewerMode(enabled) {
    window.TRACECLAW_STATIC_FALLBACK = Boolean(enabled);
    setPublicNotice(enabled);
    if (playButton) playButton.style.display = enabled ? "" : "none";
    if (enabled) select.disabled = false;
  }

  function publicRunItems() {
    const runs = Array.isArray(window.GATEWAY_PUBLIC_RUNS)
      ? window.GATEWAY_PUBLIC_RUNS.slice(0, 5)
      : [];
    if (runs.length) return runs;

    const latest = window.GATEWAY_CASES?.["latest-live"];
    return latest ? [{
      id: "latest-live",
      savedAt: latest.meta?.savedAt || latest.meta?.publishedAt || "",
      startedAt: latest.meta?.startedAt || "",
      prompt: latest.meta?.prompt || latest.meta?.title || "Saved run",
      latest: true
    }] : [];
  }

  function staticCaseItem(preferredId = "latest-live") {
    const publicItem = publicRunItems().find(item => item.id === preferredId);
    if (publicItem) return publicItem;

    const index = window.GATEWAY_CASE_INDEX || [];
    return (
      index.find(item => item.id === preferredId) ||
      index.find(item => item.id === "latest-live") ||
      index[0]
    );
  }

  async function ensureStaticCase(id = "latest-live") {
    const item = staticCaseItem(id);
    if (!item) return null;
    window.GATEWAY_CASES = window.GATEWAY_CASES || {};
    if (!window.GATEWAY_CASES[item.id] && item.file && typeof loadScript === "function") {
      await loadScript(item.file);
    }
    const trace = window.GATEWAY_CASES?.[item.id];
    return trace ? { item, trace } : null;
  }

  function populateStaticRuns(activeId = "latest-live") {
    select.replaceChildren();

    const saved = publicRunItems().slice(0, 5);
    saved.forEach((item, index) => {
      const option = document.createElement("option");
      option.value = `static:${item.id}`;
      option.dataset.prompt = String(item.prompt || "");
      const when = formatSavedAt(item.savedAt || item.startedAt);
      const prompt = shortPrompt(item.prompt || "Saved run", 46);
      option.textContent = index === 0 || item.latest
        ? `Latest saved run · ${when} · ${prompt}`
        : `${when} · ${prompt}`;
      select.append(option);
    });

    if ([...select.options].some(option => option.value === `static:${activeId}`)) {
      select.value = `static:${activeId}`;
    } else if (select.options.length) {
      select.selectedIndex = 0;
    }
  }

  async function loadStaticCase(id = "latest-live", options = {}) {
    const loaded = await ensureStaticCase(id);
    if (!loaded) return;

    const label = options.label || `Loaded saved run · ${loaded.trace.meta?.title || loaded.item.title || loaded.item.id}`;
    lastSelectedArchive = "";
    paintSavedTrace(loaded.trace, loaded.trace.meta?.response || "", label);
    if (window.TRACECLAW_STATIC_FALLBACK && collectorState) {
      collectorState.textContent = "Saved trace · offline";
      collectorState.className = "collectorState";
    }
    select.value = `static:${loaded.item.id}`;

  }

  async function showBundledLatestRun(options = {}) {
    setStaticViewerMode(true);
    populateStaticRuns("latest-live");
    select.title = "Bundled saved runs for the public GitHub Pages viewer";

    const force = Boolean(options.force);
    const alreadyShowingSavedRun = requestState?.textContent?.trim() === "SAVED RUN";
    if (!staticFallbackLoaded || force || !alreadyShowingSavedRun) {
      staticFallbackLoaded = true;
      await loadStaticCase("latest-live", {
        label: "Live mode needs a local collector; showing the latest saved run. Click Replay to watch the path animate."
      });
    }
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

    // A saved-run selection is an idle inspection state. Re-enable Clear even if
    // a previous live playback left the button disabled, and paint the response
    // after every other viewer mutation so it cannot be wiped by render/init work.
    const clearButton = document.getElementById("resetBtn");
    if (clearButton) {
      clearButton.disabled = false;
      clearButton.title = "";
    }

    const finalResponse = savedRunResponse(trace, response);
    setResponse(finalResponse);
    requestAnimationFrame(() => setResponse(finalResponse));
    setTimeout(() => setResponse(finalResponse), 0);
  }

  async function loadArchivedRun(archiveId) {
    if (!archiveId) return;
    const response = await fetch(`${collectorUrl}/api/runs/${encodeURIComponent(archiveId)}`, {
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);

    lastSelectedArchive = archiveId;
    const when = formatSavedAt(payload.savedAt || payload.startedAt);
    const trace = payload.trace;
    if (trace && typeof trace === "object") {
      trace.meta = {
        ...(trace.meta || {}),
        prompt: payload.prompt || trace.meta?.prompt || "",
        response: payload.response || trace.meta?.response || ""
      };
    }
    paintSavedTrace(
      trace,
      payload.response,
      `Loaded saved run · ${when} · ${shortPrompt(payload.prompt, 70)}`
    );
    select.value = `run:${archiveId}`;
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

  async function refreshRunHistory(preferredId = "", options = {}) {
    try {
      if (!collectorUrl) throw new Error("Collector URL is not configured.");

      const response = await fetch(`${collectorUrl}/api/runs?limit=20`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);

      setStaticViewerMode(false);
      staticFallbackLoaded = false;
      const runs = (Array.isArray(payload.runs) ? payload.runs : [])
        .filter(run => String(run.status || "").toLowerCase() === "complete")
        .slice(0, 5);
      select.replaceChildren();

      if (!runs.length) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "No saved runs yet";
        select.append(placeholder);
      }

      runs.forEach((run, index) => {
        const option = document.createElement("option");
        option.value = `run:${run.id}`;
        option.dataset.prompt = String(run.prompt || "");
        const when = formatSavedAt(run.savedAt || run.startedAt);
        const prompt = shortPrompt(run.prompt, 46);
        option.textContent = index === 0
          ? `Latest saved run · ${when} · ${prompt}`
          : `${when} · ${prompt}`;
        select.append(option);
      });

      const wanted = preferredId || lastSelectedArchive;
      if (options.loadLatest && runs.length) {
        // Initial page load: show the latest saved run automatically.
        const latestId = runs[0].id;
        select.value = `run:${latestId}`;
        await loadArchivedRun(latestId);
      } else if (options.selectLatest && runs.length) {
        // A just-finished live run is already painted by live.js. Refresh only
        // the latest-five picker here; do not repaint it as SAVED RUN while the
        // live controls are still unwinding.
        select.value = `run:${runs[0].id}`;
        lastSelectedArchive = runs[0].id;
      } else if (wanted && [...select.options].some(option => option.value === `run:${wanted}`)) {
        select.value = `run:${wanted}`;
      } else if (runs.length) {
        select.value = `run:${runs[0].id}`;
      } else {
        select.value = "";
      }
    } catch (error) {
      await showBundledLatestRun({ force: true });
      console.warn("Could not load run history:", error);
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(
      () => refreshRunHistory("", { loadLatest: false, selectLatest: true }),
      350
    );
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

    const handleHistorySelection = async () => {
      const value = select.value;
      if (!value) return;

      // Native select controls can emit both input and change for one choice.
      // Handle that pair once, but always allow a later re-selection.
      const now = performance.now();
      if (value === lastHistorySelection && now - lastHistorySelectionAt < 250) return;
      lastHistorySelection = value;
      lastHistorySelectionAt = now;

      // A user-picked history item wins over any pending "load latest" refresh.
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }

      const selectedPrompt = select.selectedOptions?.[0]?.dataset?.prompt || "";
      if (promptInput && selectedPrompt) promptInput.value = selectedPrompt;

      try {
        if (value === "reference:cake") {
          loadReferenceCase();
          return;
        }
        if (value.startsWith("static:")) {
          await loadStaticCase(value.slice(7), {
            label: "Loaded bundled saved run."
          });
          return;
        }
        if (value.startsWith("run:")) {
          await loadArchivedRun(value.slice(4));
        }
      } catch (error) {
        if (message) message.textContent = `Could not load saved run: ${error.message}`;
      }
    };

    // input makes the choice responsive immediately; change is the fallback
    // across browsers. The small guard above prevents duplicate loading.
    select.oninput = handleHistorySelection;
    select.onchange = handleHistorySelection;

    if (runButton) {
      new MutationObserver(() => {
        select.disabled = runButton.disabled && !window.TRACECLAW_STATIC_FALLBACK;
      }).observe(runButton, { attributes: true, attributeFilter: ["disabled"] });
      select.disabled = runButton.disabled && !window.TRACECLAW_STATIC_FALLBACK;
    }

    if (requestState) {
      new MutationObserver(() => {
        const state = requestState.textContent.trim();
        if (state === "FINISHED" || state === "FAILED") scheduleRefresh();
      }).observe(requestState, { childList: true, subtree: true, characterData: true });
    }

    // On GitHub Pages, use the local collector when it is actually available.
    // This preserves full local run history and lets the owner run new prompts.
    // Recruiters/other visitors normally have no collector, so they fall back
    // to the latest published completed run with full saved-run evidence.
    const collector = await waitForCollectorState(1200);
    const isPublicGitHubViewer = window.location.hostname.endsWith("github.io");

    if (collector.ready) {
      setStaticViewerMode(false);
      await refreshRunHistory("", { loadLatest: true });
      return;
    }

    if (isPublicGitHubViewer) {
      await showBundledLatestRun({ force: true });
      return;
    }

    await showBundledLatestRun();
    await refreshRunHistory();
  }

  initialize();
})();
