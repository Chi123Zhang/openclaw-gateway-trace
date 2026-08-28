(() => {
  const form = document.getElementById("askForm");
  if (!form) return;

  const input = document.getElementById("promptInput");
  const runButton = document.getElementById("runTraceBtn");
  const message = document.getElementById("runMessage");
  const collectorState = document.getElementById("collectorState");
  const useCurrent = document.getElementById("useCurrentPromptBtn");
  const responsePanel = document.getElementById("responsePanel");
  const responseText = document.getElementById("responseText");
  const cfg = window.GATEWAY_CONFIG || {};
  const collectorUrl = String(cfg.collectorUrl || "").replace(/\/+$/, "");

  let liveRunning = false;
  let currentLiveId = null;
  let collectorReady = false;

  // Visualization state is deliberately separate from Gateway execution state.
  // Pausing freezes only the UI. The Gateway and collector keep running so no
  // TraceClaw evidence is lost; Resume drains the queued observed stages in order.
  let visualPaused = false;
  let playbackQueue = [];
  let queuedObservedStages = new Set();
  let revealedRuntimeStages = new Set();
  let revealedSourceStages = new Set();
  let revealedTimeline = [];
  let fullCaseSnapshot = null;
  let backendComplete = false;
  let backendError = null;
  let pendingResponse = "";
  let lastQueuedTimelineLength = 0;
  let lastDisplayedStage = null;

  const VERIFIED_SOURCE_BRIDGE = ["G14", "G15", "G16"];

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function stageNumber(stage) {
    const value = Number(String(stage || "").replace("G", ""));
    return Number.isFinite(value) ? value : -1;
  }

  function installControls() {
    const askRow = document.querySelector(".askRow");
    const casePicker = document.querySelector(".casePicker");
    const speed = document.getElementById("speed");
    const reset = document.getElementById("resetBtn");
    const replay = document.getElementById("playBtn");

    if (casePicker) casePicker.style.display = "none";
    if (replay) replay.style.display = "none";

    let pauseButton = document.getElementById("livePauseBtn");
    if (!pauseButton) {
      pauseButton = document.createElement("button");
      pauseButton.id = "livePauseBtn";
      pauseButton.type = "button";
      pauseButton.className = "btn alt";
      pauseButton.textContent = "⏸ Pause";
      pauseButton.hidden = true;
      pauseButton.disabled = true;
    }

    if (askRow && speed && reset) {
      speed.title = "Live visualization speed";
      reset.textContent = "Clear";
      askRow.append(pauseButton, speed, reset);
      askRow.style.gridTemplateColumns = "minmax(0,1fr) auto auto auto auto";
      askRow.style.alignItems = "stretch";
    }

    pauseButton.onclick = toggleLivePause;
  }

  function setCollectorState(text, tone = "") {
    collectorState.textContent = text;
    collectorState.className = `collectorState ${tone}`.trim();
  }

  function setBusy(busy) {
    runButton.disabled = busy;
    runButton.textContent = busy ? "Running live…" : "Run trace";
    const pauseButton = document.getElementById("livePauseBtn");
    if (pauseButton) {
      pauseButton.hidden = !busy;
      pauseButton.disabled = !busy;
      if (!busy) {
        pauseButton.textContent = "⏸ Pause";
        pauseButton.classList.remove("pauseState");
      }
    }
  }

  function showResponse(value) {
    if (!value) {
      responsePanel.hidden = true;
      responseText.textContent = "";
      return;
    }
    responsePanel.hidden = false;
    responseText.textContent = value;
  }

  function currentPrompt() {
    return ACTIVE_CASE?.meta?.prompt || document.getElementById("queryText")?.textContent || "";
  }

  useCurrent.addEventListener("click", () => {
    const value = currentPrompt();
    input.value = value === "—" ? "" : value;
    input.focus();
  });

  function blankStage() {
    return {
      result: "—",
      evidence: ["source"],
      tone: "good",
      case2: "Waiting for this runtime stage.",
      time: "—",
      tokens: "not observed",
      risk: "No runtime decision yet.",
      concreteInput: "—",
      concreteOutput: "—",
      concreteInputEvidence: "NOT OBSERVED YET",
      concreteOutputEvidence: "NOT OBSERVED YET"
    };
  }

  function sourcePathStage(stage) {
    /*
     * G14-G16 have no standalone TraceClaw event in the current instrumentation,
     * but the backend can still attach run-specific, source-aligned facts once the
     * same run reaches downstream G17/G18. Never erase those facts merely because
     * the playback item itself is a source bridge.
     */
    const result = String(stage?.result || "").trim();
    const concreteOutput = String(stage?.concreteOutput || "").trim();
    const hasRunSupportedResult = Boolean(result && result !== "—" && result !== "SOURCE PATH");
    const hasRunSupportedOutput = Boolean(
      concreteOutput &&
      concreteOutput !== "—" &&
      !/^not separately observed$/i.test(concreteOutput)
    );

    if (hasRunSupportedResult || hasRunSupportedOutput) {
      return {
        ...stage,
        evidence: Array.isArray(stage?.evidence) && stage.evidence.length
          ? stage.evidence
          : ["source", "derived"],
        tone: stage?.tone || "good",
        time: stage?.time || "not separately observed",
        tokens: stage?.tokens || "not observed"
      };
    }

    return {
      ...stage,
      result: "SOURCE PATH",
      evidence: ["source"],
      tone: "good",
      case2: "This stage is shown only to preserve the verified source control-flow path. No standalone runtime event was captured for it.",
      time: "not separately observed",
      tokens: "not observed",
      concreteOutput: "not separately observed",
      concreteOutputEvidence: "SOURCE CONTROL FLOW"
    };
  }

  function makeBlankCase(prompt = "") {
    const stages = {};
    const stateByStage = {};
    (window.GATEWAY_STAGE_CATALOG || []).forEach(stage => {
      stages[stage.id] = blankStage();
      stateByStage[stage.id] = {
        authentication: { label: "—", tone: "neutral" },
        policy: { label: "—", tone: "neutral" },
        runtime: { label: "—", tone: "neutral" },
        routing: { label: "—", tone: "neutral" },
        overall: { label: "—", tone: "neutral" }
      };
    });
    return {
      meta: {
        id: `pending-${Date.now()}`,
        title: prompt || "Waiting for run",
        prompt,
        response: "",
        rawSessionKey: "",
        canonicalSessionKey: "",
        sessionId: "",
        runId: "",
        agent: "",
        sendPolicy: "",
        dedupeDecision: "",
        admissionDecision: "",
        downstreamAgent: "",
        resolver: "",
        resolverSource: "",
        provider: "",
        model: "",
        tools: "",
        ack: "",
        titleSync: "",
        overallRisk: "—"
      },
      stages,
      stateByStage,
      _collector: { traceStagesObserved: [], timeline: [], traceEventCount: 0 }
    };
  }

  function moduleForStage(stage) {
    return byId?.[stage]?.module || "";
  }

  function deriveModuleResults(caseData, focusStage = null) {
    const meta = caseData.meta || {};
    const observed = new Set(caseData._collector?.traceStagesObserved || []);
    const focusModule = focusStage ? moduleForStage(focusStage) : "";

    return DATA.modules.map(module => {
      let result = "—";

      if (module.id === focusModule) result = "ACTIVE";
      if (module.id === "M1" && observed.has("G5")) result = "PASS";
      if (module.id === "M2" && observed.has("G9")) result = meta.agent || "RESOLVED";
      if (module.id === "M3" && observed.has("G12")) result = meta.admissionDecision || "OBSERVED";
      if (module.id === "M4" && caseData?.stages?.G15?.result === "finalized") result = "READY";
      else if (module.id === "M4" && (revealedSourceStages.has("G15") || stageNumber(focusStage) > 15)) result = "SOURCE-MAPPED";
      if (module.id === "M5" && observed.has("G18")) result = "G18 OBSERVED";

      return { ...module, result };
    });
  }

  function visibleCaseFromSnapshot(snapshot) {
    const stages = {};
    for (const [id, value] of Object.entries(snapshot?.stages || {})) {
      if (revealedRuntimeStages.has(id)) {
        stages[id] = value;
      } else if (revealedSourceStages.has(id)) {
        stages[id] = sourcePathStage(value);
      } else {
        stages[id] = { ...value, ...blankStage() };
      }
    }

    return {
      ...snapshot,
      stages,
      _collector: {
        ...(snapshot?._collector || {}),
        traceStagesObserved: [...revealedRuntimeStages].sort((a, b) => stageNumber(a) - stageNumber(b)),
        timeline: [...revealedTimeline]
      }
    };
  }

  function neutralizePendingPaint() {
    document.querySelectorAll(".sresult,.mresult").forEach(node => {
      if (node.textContent.trim() === "—") node.style.color = "var(--muted)";
      else node.style.color = "";
    });

    const ready = document.querySelector(".connFlow .ready");
    if (ready) {
      const g2Ready = revealedRuntimeStages.has("G2");
      ready.textContent = g2Ready ? "GATEWAY READY" : "GATEWAY —";
      ready.style.color = g2Ready ? "var(--good)" : "var(--muted)";
      ready.style.borderColor = g2Ready ? "#2b4d38" : "var(--line)";
      ready.style.background = g2Ready ? "#102017" : "#12171c";
    }
  }

  function renderRuntimeBoundary() {
    const boundary = document.querySelector(".pipeline .boundary");
    if (!boundary) return;

    const inReplyDispatch = activeModule === "M5";
    boundary.hidden = !inReplyDispatch;
    if (!inReplyDispatch) return;

    const meta = ACTIVE_CASE?.meta || {};
    const g18Revealed = revealedRuntimeStages.has("G18");
    const resolverText = document.getElementById("resolverBoundaryText");
    if (resolverText) {
      resolverText.textContent = g18Revealed
        ? `resolver: ${meta.resolverSource || meta.resolver || "observed"}`
        : "resolver: not observed yet";
    }

    const boxes = boundary.querySelectorAll(".boundaryBox");
    const runtimeBox = boxes[1];
    if (runtimeBox) {
      runtimeBox.textContent = "";
      const title = document.createElement("strong");
      title.textContent = "Deeper Reply / Agent Runtime · current run";
      runtimeBox.append(title);

      const rows = [
        ["Agent", stageNumber(activeStage) >= 17 ? (meta.downstreamAgent || meta.agent) : ""],
        ["Resolver", g18Revealed ? (meta.resolverSource || meta.resolver) : ""],
        ["Provider", g18Revealed ? meta.provider : ""],
        ["Model", g18Revealed ? meta.model : ""],
        ["Tools", g18Revealed ? meta.tools : ""]
      ];

      rows.forEach(([label, value]) => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "100px 1fr";
        row.style.gap = "9px";
        row.style.marginTop = "5px";
        const key = document.createElement("span");
        key.textContent = label;
        key.style.color = "var(--muted)";
        const val = document.createElement("code");
        val.textContent = value || "not observed yet";
        val.style.color = value ? "var(--cyan)" : "var(--muted)";
        row.append(key, val);
        runtimeBox.append(row);
      });
    }
  }

  function paintSnapshot(snapshot, focusStage = null) {
    if (!snapshot) return;
    const visible = visibleCaseFromSnapshot(snapshot);

    ACTIVE_CASE = visible;
    CASE2 = visible.meta;
    DATA = mergeCase(visible);
    byId = Object.fromEntries(DATA.stages.map(stage => [stage.id, stage]));
    mods = Object.fromEntries(DATA.modules.map(module => [module.id, module]));
    DATA.modules = deriveModuleResults(visible, focusStage);
    mods = Object.fromEntries(DATA.modules.map(module => [module.id, module]));

    completed.clear();
    revealedRuntimeStages.forEach(stage => completed.add(stage));
    if (revealedRuntimeStages.has("G5")) completed.add("M1");
    if (revealedRuntimeStages.has("G9")) completed.add("M2");
    if (revealedRuntimeStages.has("G12")) completed.add("M3");
    if (revealedSourceStages.has("G15") || revealedRuntimeStages.has("G17")) completed.add("M4");
    if (revealedRuntimeStages.has("G18")) completed.add("M5");

    if (focusStage && byId[focusStage]) {
      activeStage = focusStage;
      activeModule = byId[focusStage].module;
      activeStep = 0;
      lastDisplayedStage = focusStage;
    }

    applyCaseMeta();
    renderAll();
    renderLog();
    syncSourceToggle();
    neutralizePendingPaint();
    renderRuntimeBoundary();

    if (focusStage) {
      document.querySelectorAll(".running").forEach(node => node.classList.remove("running"));
      document.querySelectorAll(`[data-id="${focusStage}"]`).forEach(node => node.classList.add("running"));
      document.querySelectorAll(".logline").forEach(node => node.classList.toggle("active", node.dataset.id === focusStage));
      const module = byId[focusStage]?.module;
      if (module && module !== "CONN") {
        const moduleNode = document.querySelector(`.module[data-id="${module}"]`);
        if (moduleNode) moduleNode.classList.add("running");
      }
    }

    const pathCount = revealedRuntimeStages.size + revealedSourceStages.size;
    const pct = Math.min(100, Math.round((pathCount / 19) * 100));
    document.getElementById("progressBar").style.width = `${pct}%`;
    document.getElementById("progressText").textContent = `${pct}%`;
  }

  function installIdleView({ clearInput = false } = {}) {
    revealedRuntimeStages = new Set();
    revealedSourceStages = new Set();
    revealedTimeline = [];
    fullCaseSnapshot = makeBlankCase("");
    lastDisplayedStage = null;
    paintSnapshot(fullCaseSnapshot, "G3");
    document.getElementById("queryText").textContent = "—";
    document.getElementById("requestState").textContent = "READY";
    showResponse("");
    if (clearInput) input.value = "";
  }

  function resetLivePlayback(prompt) {
    visualPaused = false;
    playbackQueue = [];
    queuedObservedStages = new Set();
    revealedRuntimeStages = new Set();
    revealedSourceStages = new Set();
    revealedTimeline = [];
    fullCaseSnapshot = makeBlankCase(prompt);
    backendComplete = false;
    backendError = null;
    pendingResponse = "";
    lastQueuedTimelineLength = 0;
    lastDisplayedStage = null;

    const pauseButton = document.getElementById("livePauseBtn");
    if (pauseButton) {
      pauseButton.textContent = "⏸ Pause";
      pauseButton.classList.remove("pauseState");
    }

    paintSnapshot(fullCaseSnapshot, "G3");
    document.getElementById("queryText").textContent = prompt;
    document.getElementById("requestState").textContent = "STARTING";
    showResponse("");
    setCollectorState("Starting Gateway…", "connected");
    message.textContent = "Starting chat.send. The path will advance only as this run is correlated with TraceClaw evidence.";
  }

  function sourceBridgeNeeded(nextStage) {
    const next = stageNumber(nextStage);
    return next >= 17 && queuedObservedStages.has("G13") && !queuedObservedStages.has("G14");
  }

  function enqueueNewTimeline(snapshot) {
    const timeline = snapshot?._collector?.timeline || [];
    const newItems = timeline.slice(lastQueuedTimelineLength);
    lastQueuedTimelineLength = timeline.length;

    for (const item of newItems) {
      const stage = item?.stage;
      if (!stage || !byId?.[stage]) continue;

      if (sourceBridgeNeeded(stage)) {
        for (const sourceStage of VERIFIED_SOURCE_BRIDGE) {
          if (!queuedObservedStages.has(sourceStage)) {
            playbackQueue.push({ stage: sourceStage, sourceOnly: true, event: "verified source control flow" });
            queuedObservedStages.add(sourceStage);
          }
        }
      }

      // A stage can emit more than one event (G0 does in the current source).
      // Progress focuses the stage only on first observation; later events still
      // update that card from the latest snapshot without jumping backwards.
      if (!queuedObservedStages.has(stage)) {
        playbackQueue.push({ ...item, sourceOnly: false });
        queuedObservedStages.add(stage);
      }
    }
  }

  function displayDelayMs() {
    const value = Number(document.getElementById("speed")?.value || 620);
    return Math.max(140, value);
  }

  async function waitVisualDelay(ms) {
    let remaining = ms;
    while (remaining > 0 && currentLiveId) {
      if (visualPaused) {
        await sleep(60);
        continue;
      }
      const chunk = Math.min(50, remaining);
      await sleep(chunk);
      remaining -= chunk;
    }
  }

  async function revealPlaybackItem(item, prompt) {
    if (!fullCaseSnapshot) return;

    if (item.sourceOnly) {
      revealedSourceStages.add(item.stage);
    } else {
      revealedRuntimeStages.add(item.stage);
      revealedTimeline.push(item);
    }

    paintSnapshot(fullCaseSnapshot, item.stage);

    const module = moduleForStage(item.stage);
    const moduleText = module === "CONN" ? "Connection" : module;
    document.getElementById("requestState").textContent = visualPaused ? `PAUSED · ${item.stage}` : "RUNNING";

    if (item.sourceOnly) {
      const stageData = fullCaseSnapshot?.stages?.[item.stage] || {};
      const stageResult = String(stageData.result || "").trim();
      const hasRunSupportedResult = Boolean(stageResult && stageResult !== "—" && stageResult !== "SOURCE PATH");
      if (hasRunSupportedResult) {
        setCollectorState(`${item.stage} · ${stageResult}`, "connected");
        message.textContent = `${item.stage} · ${stageResult} · supported by this run's downstream runtime and the verified source path`;
      } else {
        setCollectorState(`SOURCE PATH · ${item.stage}`, "connected");
        message.textContent = `${item.stage} · source-confirmed continuation · no standalone runtime event for this stage`;
      }
    } else {
      setCollectorState(`LIVE · ${item.stage}`, "connected");
      message.textContent = `${moduleText} · ${item.stage} · ${item.event || "observed"}`;
    }

    await waitVisualDelay(displayDelayMs());
  }

  async function consumePlayback(prompt) {
    while (currentLiveId) {
      if (visualPaused) {
        await sleep(60);
        continue;
      }

      const item = playbackQueue.shift();
      if (item) {
        await revealPlaybackItem(item, prompt);
        continue;
      }

      if (backendComplete) break;
      await sleep(50);
    }

    if (!currentLiveId) return;
    if (backendError) throw new Error(backendError);

    // Do not reveal the answer ahead of a paused/queued visualization. The final
    // response appears only after the currently collected execution path catches up.
    if (pendingResponse) showResponse(pendingResponse);
    document.getElementById("requestState").textContent = "FINISHED";
    setCollectorState("Trace complete", "connected");
    message.textContent = `Finished · ${revealedRuntimeStages.size} Gateway stages observed · source-only gaps remain explicitly labeled.`;
    neutralizePendingPaint();
    renderRuntimeBoundary();
  }

  function toggleLivePause() {
    if (!liveRunning) return;
    visualPaused = !visualPaused;
    const pauseButton = document.getElementById("livePauseBtn");

    if (visualPaused) {
      if (pauseButton) {
        pauseButton.textContent = "▶ Resume";
        pauseButton.classList.add("pauseState");
      }
      const where = lastDisplayedStage || "waiting";
      document.getElementById("requestState").textContent = `PAUSED · ${where}`;
      setCollectorState(`Paused @ ${where}`, "connected");
      message.textContent = `Visualization paused at ${where}. OpenClaw continues running and ${playbackQueue.length} queued stage(s) will be shown after Resume.`;
    } else {
      if (pauseButton) {
        pauseButton.textContent = "⏸ Pause";
        pauseButton.classList.remove("pauseState");
      }
      document.getElementById("requestState").textContent = "RUNNING";
      setCollectorState("Live visualization resumed", "connected");
      message.textContent = playbackQueue.length
        ? `Resuming from ${lastDisplayedStage || "current stage"} · ${playbackQueue.length} queued stage(s).`
        : "Resumed · waiting for the next correlated Gateway stage.";
    }
  }

  async function checkCollector() {
    if (!collectorUrl) {
      collectorReady = false;
      setCollectorState("Collector not configured");
      message.textContent = "Set collectorUrl in config.js to run new questions.";
      return;
    }

    try {
      const response = await fetch(`${collectorUrl}/health`, { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error(`health ${response.status}`);
      const health = await response.json().catch(() => ({}));
      if (!health.openclawCli) throw new Error("OpenClaw CLI missing");
      if (health.gateway !== "reachable") throw new Error(health.gatewayError || "Gateway unavailable");
      if (!health.traceLogConfigured) throw new Error("TRACECLAW_LOG_PATH not configured");
      if (!health.traceLogExists) throw new Error(`Trace log missing: ${health.traceLogPath || ""}`);

      collectorReady = true;
      setCollectorState("Gateway + trace connected", "connected");
      message.textContent = "Ready. Run trace starts a source-aligned live execution view; Pause freezes the visualization without stopping OpenClaw.";
    } catch (error) {
      collectorReady = false;
      setCollectorState("Collector unavailable", "error");
      message.textContent = `Collector/Gateway unavailable: ${error.message}`;
    }
  }

  async function pollLiveRun(liveId, prompt) {
    while (currentLiveId === liveId) {
      const response = await fetch(`${collectorUrl}/api/live/${liveId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);

      fullCaseSnapshot = payload.trace || fullCaseSnapshot;
      enqueueNewTimeline(fullCaseSnapshot);

      // Update values already revealed (for example G0 can emit start + resolved)
      // without moving the visual focus ahead of the playback queue.
      if (lastDisplayedStage && !visualPaused) {
        paintSnapshot(fullCaseSnapshot, lastDisplayedStage);
      }

      if (payload.response) pendingResponse = payload.response;
      backendComplete = Boolean(payload.complete);
      backendError = payload.error || null;

      if (visualPaused) {
        setCollectorState(`Paused @ ${lastDisplayedStage || "waiting"}`, "connected");
        message.textContent = `Visualization paused. Gateway is still collecting; ${playbackQueue.length} stage(s) queued.`;
      }

      if (backendComplete) return;
      await sleep(100);
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) {
      message.textContent = "Enter a question first.";
      input.focus();
      return;
    }
    if (liveRunning) return;

    if (!collectorReady) {
      await checkCollector();
      if (!collectorReady) return;
    }

    liveRunning = true;
    setBusy(true);
    resetLivePlayback(prompt);

    try {
      const response = await fetch(`${collectorUrl}/api/live/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);

      currentLiveId = payload.liveRunId;
      CASE2.runId = payload.runId || "";
      CASE2.rawSessionKey = payload.sessionKey || "";
      document.getElementById("requestState").textContent = "RUNNING";

      const pollTask = pollLiveRun(payload.liveRunId, prompt);
      const playbackTask = consumePlayback(prompt);
      await Promise.all([pollTask, playbackTask]);
    } catch (error) {
      setCollectorState("Run failed", "error");
      message.textContent = `Run failed: ${error.message}`;
      document.getElementById("requestState").textContent = "FAILED";
    } finally {
      liveRunning = false;
      visualPaused = false;
      currentLiveId = null;
      setBusy(false);
    }
  });

  installControls();

  const clearButton = document.getElementById("resetBtn");
  if (clearButton) {
    clearButton.onclick = () => {
      if (liveRunning) return;
      installIdleView({ clearInput: true });
      message.textContent = collectorReady
        ? "Ready. No runtime result is shown until you press Run trace."
        : "Start the local collector, then press Run trace.";
    };
  }

  async function initializeLiveViewer() {
    // app.js may asynchronously load the historical example. Wait for its catalog
    // initialization, then replace it with an evidence-neutral live idle state.
    for (let i = 0; i < 100; i += 1) {
      if (ACTIVE_CASE && byId && byId.G3) break;
      await sleep(20);
    }
    installIdleView();
    await checkCollector();
  }

  initializeLiveViewer();
})();