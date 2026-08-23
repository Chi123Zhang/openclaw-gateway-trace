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

  function integrateHeaderControlsIntoRunTrace() {
    const askRow = document.querySelector(".askRow");
    const casePicker = document.querySelector(".casePicker");
    const speed = document.getElementById("speed");
    const reset = document.getElementById("resetBtn");
    const replay = document.getElementById("playBtn");

    if (casePicker) casePicker.style.display = "none";
    if (replay) replay.style.display = "none";
    if (speed) speed.style.display = "none";

    if (askRow && reset) {
      reset.textContent = "Clear";
      askRow.append(reset);
      askRow.style.gridTemplateColumns = "minmax(0,1fr) auto auto";
      askRow.style.alignItems = "stretch";
    }
  }

  function setCollectorState(text, tone = "") {
    collectorState.textContent = text;
    collectorState.className = `collectorState ${tone}`.trim();
  }

  function setBusy(busy) {
    runButton.disabled = busy;
    runButton.textContent = busy ? "Running live…" : "Run trace";
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
    input.value = currentPrompt();
    input.focus();
  });

  function blankStage(stage) {
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

  function makeBlankCase(prompt = "") {
    const stages = {};
    (window.GATEWAY_STAGE_CATALOG || []).forEach(stage => {
      stages[stage.id] = blankStage(stage.id);
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
      stateByStage: {},
      _collector: { traceStagesObserved: [], timeline: [], traceEventCount: 0 }
    };
  }

  function deriveModuleResults(caseData, complete = false) {
    const meta = caseData.meta || {};
    const observed = new Set(caseData._collector?.traceStagesObserved || []);
    return DATA.modules.map(module => {
      let result = "—";
      if (module.id === "M1" && observed.has("G5")) result = "PASS";
      if (module.id === "M2" && observed.has("G9")) result = meta.agent || "RESOLVED";
      if (module.id === "M3" && observed.has("G12")) result = meta.admissionDecision || "OBSERVED";
      if (module.id === "M4" && observed.has("G13")) result = complete ? "G13 OBSERVED" : "ACTIVE";
      if (module.id === "M5" && observed.has("G18")) result = complete ? "G18 OBSERVED" : "ACTIVE";
      return { ...module, result };
    });
  }

  function applyRuntimeVisibility(caseData, complete) {
    const observed = new Set(caseData._collector?.traceStagesObserved || []);
    const stages = {};
    for (const [id, value] of Object.entries(caseData.stages || {})) {
      if (observed.has(id)) {
        stages[id] = value;
      } else if (complete) {
        stages[id] = value;
      } else {
        stages[id] = { ...value, ...blankStage(id) };
      }
    }
    return { ...caseData, stages };
  }

  function installCase(caseData, prompt, complete = false) {
    const visible = applyRuntimeVisibility(caseData, complete);
    const id = visible.meta.id || `live-${Date.now()}`;
    visible.meta.id = id;
    visible.meta.title = visible.meta.title || prompt;
    visible.meta.prompt = visible.meta.prompt || prompt;

    ACTIVE_CASE = visible;
    CASE2 = visible.meta;
    DATA = mergeCase(visible);
    DATA.modules = deriveModuleResults(visible, complete);
    byId = Object.fromEntries(DATA.stages.map(stage => [stage.id, stage]));
    mods = Object.fromEntries(DATA.modules.map(module => [module.id, module]));

    const timeline = visible._collector?.timeline || [];
    const observedStages = visible._collector?.traceStagesObserved || [];
    completed.clear();
    observedStages.forEach(stage => completed.add(stage));

    const latest = [...timeline].reverse().find(item => byId[item.stage]);
    if (latest) {
      activeStage = latest.stage;
      activeModule = byId[latest.stage].module;
      activeStep = 0;
    } else {
      activeModule = "M1";
      activeStage = "G3";
      activeStep = 0;
    }

    applyCaseMeta();
    renderAll();
    renderLog();
    syncSourceToggle();

    if (latest) {
      document.querySelectorAll(".running").forEach(node => node.classList.remove("running"));
      document.querySelectorAll(`[data-id="${latest.stage}"]`).forEach(node => node.classList.add("running"));
      document.querySelectorAll(".logline").forEach(node => node.classList.toggle("active", node.dataset.id === latest.stage));
    }

    const pct = complete ? 100 : Math.round((new Set(observedStages).size / 19) * 100);
    document.getElementById("progressBar").style.width = `${pct}%`;
    document.getElementById("progressText").textContent = `${pct}%`;
  }

  function clearForNewRun(prompt) {
    const blank = makeBlankCase(prompt);
    installCase(blank, prompt, false);
    showResponse("");
    document.getElementById("queryText").textContent = prompt;
    document.getElementById("requestState").textContent = "STARTING";
    setCollectorState("Starting Gateway…", "connected");
    message.textContent = "Starting the real chat.send request. Results will appear only when TraceClaw observes them.";
  }

  async function checkCollector() {
    if (!collectorUrl) {
      setCollectorState("Collector not configured");
      message.textContent = "Set collectorUrl in config.js to run new questions.";
      return;
    }

    try {
      const response = await fetch(`${collectorUrl}/health`, { method: "GET" });
      if (!response.ok) throw new Error(`health ${response.status}`);
      const health = await response.json().catch(() => ({}));
      if (!health.openclawCli) throw new Error("OpenClaw CLI missing");
      if (health.gateway !== "reachable") throw new Error(health.gatewayError || "Gateway unavailable");
      if (!health.traceLogConfigured) throw new Error("TRACECLAW_LOG_PATH not configured");
      if (!health.traceLogExists) throw new Error(`Trace log missing: ${health.traceLogPath || ""}`);

      setCollectorState("Gateway + trace connected", "connected");
      message.textContent = "Ready. No runtime result is shown until you press Run trace.";
      if (!liveRunning) installCase(makeBlankCase(""), "", false);
    } catch (error) {
      setCollectorState("Collector unavailable", "error");
      message.textContent = `Collector/Gateway unavailable: ${error.message}`;
    }
  }

  async function pollLiveRun(liveId, prompt) {
    let lastTimelineLength = -1;

    while (currentLiveId === liveId) {
      const response = await fetch(`${collectorUrl}/api/live/${liveId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);

      const caseData = payload.trace;
      const timeline = caseData?._collector?.timeline || [];
      const complete = Boolean(payload.complete);

      installCase(caseData, prompt, complete);
      document.getElementById("requestState").textContent = complete ? "FINISHED" : "RUNNING";

      if (timeline.length !== lastTimelineLength) {
        lastTimelineLength = timeline.length;
        const latest = timeline[timeline.length - 1];
        if (latest) {
          setCollectorState(`LIVE · ${latest.stage}`, "connected");
          message.textContent = `${latest.stage} · ${latest.event || "observed"} · observed from the running Gateway`;
        } else {
          setCollectorState("Gateway running…", "connected");
          message.textContent = "Gateway request started; waiting for the first correlated TraceClaw event.";
        }
      }

      if (payload.response) showResponse(payload.response);

      if (complete) {
        if (payload.error) throw new Error(payload.error);
        setCollectorState("Trace complete", "connected");
        message.textContent = `Finished · ${timeline.length} actual Gateway runtime events observed for this question.`;
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 140));
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

    liveRunning = true;
    setBusy(true);
    clearForNewRun(prompt);

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

      await pollLiveRun(payload.liveRunId, prompt);
    } catch (error) {
      setCollectorState("Run failed", "error");
      message.textContent = `Run failed: ${error.message}`;
      document.getElementById("requestState").textContent = "FAILED";
    } finally {
      liveRunning = false;
      currentLiveId = null;
      setBusy(false);
    }
  });

  integrateHeaderControlsIntoRunTrace();
  checkCollector();
})();