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
  let queuedAgentRuntimeEvents = new Set();
  let pendingAgentRuntimeEvents = [];
  let revealedAgentRuntimeEvents = [];
  let lastDisplayedRuntimeEvent = "";
  let fullCaseSnapshot = null;
  let backendComplete = false;
  let backendSnapshotFinalized = false;
  let playbackComplete = false;
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

  function pauseForInspection() {
    if (!liveRunning || visualPaused) return;
    visualPaused = true;
    const pauseButton = document.getElementById("livePauseBtn");
    if (pauseButton) {
      pauseButton.textContent = "▶ Resume";
      pauseButton.classList.add("pauseState");
    }
    const where = lastDisplayedRuntimeEvent || lastDisplayedStage || "waiting";
    document.getElementById("requestState").textContent = `PAUSED · ${where}`;
    setCollectorState(`Paused for inspection @ ${where}`, "connected");
    message.textContent = `Inspection paused at ${where}. OpenClaw keeps running; click Resume to continue the visual playback.`;
  }

  document.addEventListener("pointerdown", event => {
    if (!liveRunning) return;
    const target = event.target.closest?.(
      ".module[data-id], .moduleMiniStage[data-stage-id], .modulePanelStage[data-stage-id], .stageCard[data-id], .subnode[data-id], .tab[data-id], .e2ePhaseCard[data-phase-id], .e2eStage[data-id], .e2eRuntimeStep, .agentRuntimeLead, .agentRuntimeNode[data-runtime-key]"
    );
    if (!target) return;
    pauseForInspection();
  }, true);

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

      // A default UI focus (G3) is not runtime evidence. Show ACTIVE only when
      // that exact stage has actually been observed in the current run.
      if (module.id === focusModule && observed.has(focusStage)) result = "ACTIVE";
      if (module.id === "M1" && observed.has("G5")) result = "PASS";
      if (module.id === "M2" && observed.has("G9")) result = meta.agent || "RESOLVED";
      if (module.id === "M3" && observed.has("G12")) result = meta.admissionDecision || "OBSERVED";
      if (module.id === "M4" && caseData?.stages?.G15?.result === "finalized") result = "READY";
      else if (module.id === "M4" && (revealedSourceStages.has("G15") || stageNumber(focusStage) > 15)) result = "SOURCE-MAPPED";
      if (module.id === "M5" && observed.has("G18")) result = "G18 OBSERVED";

      return { ...module, result };
    });
  }

  function agentRuntimeEventKey(event) {
    if (!event || typeof event !== "object") return "";
    const seq = event.seq ?? "";
    const ts = event.ts ?? "";
    const name = event.event ?? "";
    const toolCallId = event.toolCallId ?? "";
    return [seq, ts, name, toolCallId].join("|");
  }

  function lastRevealedAgentEvent(name) {
    for (let i = revealedAgentRuntimeEvents.length - 1; i >= 0; i -= 1) {
      const event = revealedAgentRuntimeEvents[i];
      if (event?.event === name) return event;
    }
    return null;
  }

  function visibleToolRecords() {
    const ordered = [];
    const byId = new Map();
    for (const event of revealedAgentRuntimeEvents) {
      if (!["tool_started", "tool_result"].includes(event?.event)) continue;
      const callId = String(event.toolCallId || `observed-${ordered.length + 1}`);
      if (!byId.has(callId)) {
        const record = {
          toolCallId: callId,
          name: event.name || "",
          started: false,
          resultObserved: false
        };
        byId.set(callId, record);
        ordered.push(record);
      }
      const record = byId.get(callId);
      if (event.name) record.name = event.name;
      if (event.event === "tool_started") {
        record.started = true;
        if (event.ts) record.startedAt = event.ts;
        if (event.args !== undefined) record.args = event.args;
      } else {
        record.resultObserved = true;
        record.status = event.isError === true ? "error" : "completed";
        record.isError = event.isError === true;
        if (event.result !== undefined) record.result = event.result;
        if (event.toolErrorSummary !== undefined) record.toolErrorSummary = event.toolErrorSummary;
        if (event.ts) record.endedAt = event.ts;
      }
    }
    return ordered;
  }

  function visibleAgentRuntime(snapshot) {
    const full = snapshot?.agentRuntime || {};
    const g18Visible = revealedRuntimeStages.has("G18");
    if (!g18Visible) {
      return {
        schemaVersion: full.schemaVersion || "traceclaw.viewer.agent-runtime.v1",
        observed: false,
        status: "waiting for G18",
        finalAgent: "",
        resolver: "",
        resolverSource: "",
        runner: "",
        provider: "",
        model: "",
        providerModelEvidence: "NOT CAPTURED",
        runStarted: false,
        runEnded: false,
        toolCalled: false,
        toolEventObserved: false,
        toolCount: 0,
        tools: [],
        finalReply: "",
        finalReplyEvidence: "NOT CAPTURED",
        agentReplyDirectlyObserved: false,
        returnToG16Observed: false,
        downstreamAssistantResponseObserved: false,
        events: [],
        phases: []
      };
    }

    const selected = lastRevealedAgentEvent("agent_runtime_selected");
    const started = lastRevealedAgentEvent("agent_run_started");
    const finalized = lastRevealedAgentEvent("agent_reply_finalized");
    const ended = lastRevealedAgentEvent("agent_run_ended");
    const returned = lastRevealedAgentEvent("reply_resolver_returned");
    const tools = visibleToolRecords();

    // Resolver selection itself is G18 runtime evidence, so it may appear as soon
    // as G18 is visually revealed. Everything deeper waits for its own post-G18
    // runtime event to be revealed in captured order.
    const meta = snapshot?.meta || {};
    const resolverSource = returned?.resolverSource || meta.resolverSource || full.resolverSource || "";
    const resolver = resolverSource === "default_getReplyFromConfig"
      ? "getReplyFromConfig"
      : (returned?.resolver || meta.resolver || full.resolver || "");

    const finalAgent = finalized?.agentId || ended?.agentId || started?.agentId || selected?.agentId || "";
    const provider = finalized?.provider || selected?.provider || "";
    const model = finalized?.model || selected?.model || "";
    const directReply = typeof finalized?.replyText === "string" ? finalized.replyText : "";
    const downstreamResponseObserved =
      playbackComplete &&
      full.downstreamAssistantResponseObserved === true;
    const downstreamReplyVisible =
      downstreamResponseObserved &&
      !directReply &&
      typeof full.finalReply === "string" &&
      full.finalReply.length > 0;
    const visibleFinalReply = directReply || (downstreamReplyVisible ? full.finalReply : "");
    const visibleFinalReplyEvidence = directReply
      ? "RUNTIME · agent reply finalized"
      : downstreamReplyVisible
        ? (full.finalReplyEvidence || "RESPONSE · chat.history after agent.wait")
        : finalized
          ? "RUNTIME · agent reply finalized (empty)"
          : "NOT CAPTURED";
    const phase = String(ended?.phase || "").toLowerCase();

    let status = "selected";
    if (phase === "end") status = "completed";
    else if (phase === "error") status = "error";
    else if (started) status = "running";
    else if (!selected) status = "waiting";

    return {
      schemaVersion: full.schemaVersion || "traceclaw.viewer.agent-runtime.v1",
      observed: revealedAgentRuntimeEvents.length > 0,
      status,
      finalAgent,
      resolver,
      resolverSource,
      runner: selected?.runner || "",
      provider,
      model,
      providerModelEvidence: finalized && (finalized.provider || finalized.model)
        ? "RUNTIME · final embedded/CLI run result"
        : (selected ? "RUNTIME · selected attempt" : "NOT CAPTURED"),
      runStarted: Boolean(started),
      startedAt: started?.startedAt || started?.ts || "",
      runEnded: Boolean(ended),
      endedAt: ended?.endedAt || ended?.ts || "",
      terminalPhase: ended?.phase || "",
      stopReason: ended?.stopReason || finalized?.stopReason || "",
      toolCalled: tools.length > 0,
      toolEventObserved: tools.length > 0,
      toolCount: tools.length,
      tools,
      finalReply: visibleFinalReply,
      finalReplyEvidence: visibleFinalReplyEvidence,
      finalReplyRuntimeSource: finalized?.replyTextSource || "",
      agentReplyDirectlyObserved: Boolean(finalized),
      agentReplyTextDirectlyObserved: Boolean(directReply),
      returnToG16Observed: Boolean(returned),
      replyResultKind: returned?.replyResultKind || "",
      replyCount: returned?.replyCount,
      downstreamAssistantResponseObserved: downstreamResponseObserved,
      attempts: selected ? [selected] : [],
      events: [...revealedAgentRuntimeEvents],
      phases: []
    };
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
      agentRuntime: visibleAgentRuntime(snapshot),
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

    const meta = ACTIVE_CASE?.meta || {};
    const runtime = ACTIVE_CASE?.agentRuntime || fullCaseSnapshot?.agentRuntime || {};
    const g18Revealed = revealedRuntimeStages.has("G18");
    const runtimeObserved = runtime?.observed === true;
    const runTerminal = document.getElementById("requestState")?.textContent === "FINISHED";

    // Source order is strict: post-G18 Agent Runtime is not visible until the
    // Gateway visualization itself has reached G18.
    boundary.hidden = !g18Revealed;
    if (boundary.hidden) return;

    const resolverSource = runtime?.resolverSource || meta.resolverSource || "";
    const resolver = runtime?.resolver || meta.resolver || "";
    const resolverText = document.getElementById("resolverBoundaryText");
    if (resolverText) {
      resolverText.textContent = (g18Revealed || runtimeObserved)
        ? `resolver: ${resolverSource || resolver || "observed"}`
        : "resolver: not captured";
    }

    const boxes = boundary.querySelectorAll(".boundaryBox");
    const runtimeBox = boxes[1];
    if (!runtimeBox) return;

    runtimeBox.replaceChildren();
    runtimeBox.className = "boundaryBox agentRuntimeObservedPanel";
    runtimeBox.classList.toggle("agentRuntimeMissing", !runtimeObserved);

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
    if (runtimeObserved) {
      status.textContent = runtime.runEnded ? "CAPTURED · COMPLETE" : "CAPTURED · RUNNING";
      status.dataset.tone = runtime.runEnded ? "complete" : "running";
    } else {
      status.textContent = runTerminal ? "NOT CAPTURED" : "WAITING";
      status.dataset.tone = "missing";
    }
    lead.append(title, status);
    runtimeBox.append(lead);

    const flow = document.createElement("div");
    flow.className = "agentRuntimeFlow";

    const toolNames = Array.isArray(runtime?.tools)
      ? runtime.tools.map(tool => tool?.name).filter(Boolean)
      : [];
    const toolValue = runtimeObserved
      ? (runtime.toolCalled
          ? (toolNames.join(", ") || `${runtime.toolCount || 0} call(s)`)
          : (runtime.runEnded ? "no call" : "waiting"))
      : "";

    const flowNodes = [
      ["agent", "Agent", runtime.finalAgent || ""],
      ["resolver", "Resolver", resolverSource || resolver],
      ["runtime", "Runtime", runtime.runner || (runtime.runStarted ? "started" : "")],
      ["provider-model", "Provider / Model", [runtime.provider, runtime.model].filter(Boolean).join(" · ")],
      ["tools", "Tools", toolValue],
      ["final-reply", "Final reply", runtime.agentReplyDirectlyObserved || runtime.downstreamAssistantResponseObserved ? "observed" : ""],
      ["return", "Return", runtime.returnToG16Observed ? "G16 observed" : ""]
    ];

    flowNodes.forEach(([runtimeKey, label, value]) => {
      const node = document.createElement("div");
      node.dataset.runtimeKey = runtimeKey;
      node.tabIndex = 0;
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", `Open ${label} runtime details`);
      const observed = Boolean(value);
      const neutral = label === "Tools" && runtimeObserved && !runtime.toolCalled;
      node.className = `agentRuntimeNode ${observed ? (neutral ? "agentRuntimeNode-neutral" : "agentRuntimeNode-observed") : "agentRuntimeNode-missing"}`;
      node.title = value ? `${label}: ${value}` : `${label}: ${runTerminal ? "not captured" : "waiting"}`;

      const key = document.createElement("span");
      key.textContent = label;
      const val = document.createElement("strong");
      val.textContent = value || (runTerminal ? "not captured" : "waiting");
      node.append(key, val);
      flow.append(node);
    });

    runtimeBox.append(flow);
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
    queuedAgentRuntimeEvents = new Set();
    pendingAgentRuntimeEvents = [];
    revealedAgentRuntimeEvents = [];
    lastDisplayedRuntimeEvent = "";
    fullCaseSnapshot = makeBlankCase("");
    playbackComplete = false;
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
    queuedAgentRuntimeEvents = new Set();
    pendingAgentRuntimeEvents = [];
    revealedAgentRuntimeEvents = [];
    lastDisplayedRuntimeEvent = "";
    fullCaseSnapshot = makeBlankCase(prompt);
    backendComplete = false;
    backendSnapshotFinalized = false;
    playbackComplete = false;
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

  function flushPendingAgentRuntimeEvents() {
    if (!queuedObservedStages.has("G18") || !pendingAgentRuntimeEvents.length) return;
    pendingAgentRuntimeEvents.forEach(item => playbackQueue.push(item));
    pendingAgentRuntimeEvents = [];
  }

  function enqueueAgentRuntime(snapshot) {
    const events = Array.isArray(snapshot?.agentRuntime?.events)
      ? snapshot.agentRuntime.events
      : [];

    for (const event of events) {
      const key = agentRuntimeEventKey(event);
      if (!key || queuedAgentRuntimeEvents.has(key)) continue;
      queuedAgentRuntimeEvents.add(key);
      const item = {
        kind: "agent-runtime",
        runtimeEvent: event,
        runtimeEventKey: key
      };
      if (queuedObservedStages.has("G18")) {
        playbackQueue.push(item);
      } else {
        pendingAgentRuntimeEvents.push(item);
      }
    }
    flushPendingAgentRuntimeEvents();
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

    if (item.kind === "agent-runtime") {
      const event = item.runtimeEvent || {};
      revealedAgentRuntimeEvents.push(event);
      lastDisplayedRuntimeEvent = event.event || "agent-runtime";
      paintSnapshot(fullCaseSnapshot, "G18");
      document.getElementById("requestState").textContent = visualPaused ? `PAUSED · ${lastDisplayedRuntimeEvent}` : "RUNNING";
      setCollectorState(`AGENT · ${lastDisplayedRuntimeEvent}`, "connected");
      message.textContent = `Post-G18 Agent Runtime · ${lastDisplayedRuntimeEvent} · current-run runtime event`;
      await waitVisualDelay(displayDelayMs());
      return;
    }

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

      if (backendSnapshotFinalized && playbackQueue.length === 0) break;
      await sleep(50);
    }

    if (!currentLiveId) return;
    if (backendError) throw new Error(backendError);

    // Playback is now caught up with the collector's final post-flush snapshot.
    // Repaint once so a downstream chat.history reply can be shown explicitly as
    // RESPONSE evidence if the direct Agent final-reply event is absent.
    playbackComplete = true;
    if (fullCaseSnapshot) {
      paintSnapshot(fullCaseSnapshot, lastDisplayedStage || "G18");
    }

    // Do not reveal the answer ahead of a paused/queued visualization. The final
    // response appears only after the currently collected execution path catches up.
    if (pendingResponse) showResponse(pendingResponse);
    document.getElementById("requestState").textContent = "FINISHED";
    if (revealedRuntimeStages.size === 0) {
      setCollectorState("Answer complete · Gateway trace not captured", "error");
      message.textContent = "The assistant response completed, but this run produced 0 observed G0–G18 runtime stages. The stage cards below are source catalog only, not evidence that G0–G18 were captured.";
    } else {
      setCollectorState("Trace complete", "connected");
      message.textContent = `Finished · ${revealedRuntimeStages.size} Gateway stages observed · source-only gaps remain explicitly labeled.`;
    }
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
      const where = lastDisplayedRuntimeEvent || lastDisplayedStage || "waiting";
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
        ? `Resuming from ${lastDisplayedRuntimeEvent || lastDisplayedStage || "current stage"} · ${playbackQueue.length} queued item(s).`
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
      enqueueAgentRuntime(fullCaseSnapshot);

      // Update values already revealed (for example G0 can emit start + resolved)
      // without moving the visual focus ahead of the playback queue.
      if (lastDisplayedStage && !visualPaused) {
        paintSnapshot(fullCaseSnapshot, lastDisplayedStage);
      }

      if (payload.response) pendingResponse = payload.response;
      backendComplete = Boolean(payload.complete);
      backendError = payload.error || null;

      if (visualPaused) {
        setCollectorState(`Paused @ ${lastDisplayedRuntimeEvent || lastDisplayedStage || "waiting"}`, "connected");
        message.textContent = `Visualization paused. Gateway is still collecting; ${playbackQueue.length} stage(s) queued.`;
      }

      if (backendComplete && (payload.archiveSaved || payload.archiveError)) {
        // Final post-flush snapshot can contain terminal Agent Runtime events that
        // were not present in the first terminal poll. Queue them before allowing
        // visual playback to finish.
        fullCaseSnapshot = payload.trace || fullCaseSnapshot;
        enqueueNewTimeline(fullCaseSnapshot);
        enqueueAgentRuntime(fullCaseSnapshot);
        backendSnapshotFinalized = true;
        if (lastDisplayedStage && !visualPaused) {
          paintSnapshot(fullCaseSnapshot, lastDisplayedStage);
        } else {
          renderRuntimeBoundary();
        }
        return;
      }
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