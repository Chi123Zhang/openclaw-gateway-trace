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

  function addRuntimeLine(root, label, value, observed = true) {
    const line = document.createElement("div");
    line.style.display = "grid";
    line.style.gridTemplateColumns = "110px 1fr";
    line.style.gap = "10px";
    line.style.marginTop = "5px";

    const key = document.createElement("span");
    key.textContent = label;
    key.style.color = "var(--muted)";

    const val = document.createElement("code");
    val.textContent = value || "not observed";
    val.style.color = observed && value ? "var(--cyan)" : "var(--muted)";
    val.style.wordBreak = "break-word";

    line.append(key, val);
    root.append(line);
  }

  function renderRuntimeBoundary() {
    const boundary = document.querySelector(".pipeline .boundary");
    if (!boundary) return;

    const inReplyDispatch = activeModule === "M5";
    boundary.hidden = !inReplyDispatch;
    if (!inReplyDispatch) return;

    const meta = ACTIVE_CASE?.meta || CASE2 || {};
    const observedStages = ACTIVE_CASE?._collector?.traceStagesObserved || [];
    const g18Observed = observedStages.includes("G18") || ACTIVE_CASE?.stages?.G18?.evidence?.includes("runtime");

    const resolverText = document.getElementById("resolverBoundaryText");
    if (resolverText) {
      resolverText.textContent = "";
      const label = document.createElement("span");
      label.textContent = g18Observed ? "Observed resolver for this run" : "Resolver boundary · source path";
      const code = document.createElement("code");
      code.textContent = meta.resolverSource || meta.resolver || "not observed";
      code.style.marginTop = "5px";
      resolverText.append(label, code);
    }

    const boxes = boundary.querySelectorAll(".boundaryBox");
    const runtimeBox = boxes[1];
    if (runtimeBox) {
      runtimeBox.textContent = "";

      const title = document.createElement("strong");
      title.textContent = "Deeper Reply / Agent Runtime · this run";
      runtimeBox.append(title);

      addRuntimeLine(runtimeBox, "Agent", meta.downstreamAgent || meta.agent || "", Boolean(meta.downstreamAgent || meta.agent));
      addRuntimeLine(runtimeBox, "Resolver", meta.resolverSource || meta.resolver || "", Boolean(meta.resolverSource || meta.resolver));
      addRuntimeLine(runtimeBox, "Provider", meta.provider || "", Boolean(meta.provider));
      addRuntimeLine(runtimeBox, "Model", meta.model || "", Boolean(meta.model));
      addRuntimeLine(runtimeBox, "Tools", meta.tools || "", Boolean(meta.tools));

      const evidence = document.createElement("div");
      evidence.style.marginTop = "9px";
      evidence.style.paddingTop = "8px";
      evidence.style.borderTop = "1px solid #28323b";
      evidence.style.fontSize = "10px";
      evidence.style.lineHeight = "1.45";
      evidence.style.color = "var(--muted)";
      evidence.textContent = g18Observed
        ? "G18 was observed. Only runtime fields actually captured for this request are shown; uninstrumented inner steps remain ‘not observed’."
        : "No standalone G18 runtime event was captured for this request. The box shows only source/control-flow context."
      runtimeBox.append(evidence);
    }

    const returnNote = boundary.querySelector(".returnNote");
    if (returnNote) {
      returnNote.textContent = "SOURCE CONTROL FLOW · replyResult returns to the original G16 → filter / deliver / complete → DispatchFromConfigResult → G14 finalization. This line describes architecture, not a claim that every inner runtime step was separately observed.";
    }
  }

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === "function") {
    window.renderAll = function renderAllWithRuntimeBoundary() {
      baseRenderAll();
      renderRuntimeBoundary();
    };
  }

  function setCollectorState(text, tone = "") {
    collectorState.textContent = text;
    collectorState.className = `collectorState ${tone}`.trim();
  }

  function setBusy(busy) {
    runButton.disabled = busy;
    runButton.textContent = busy ? "Running…" : "Run trace";
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

      if (!health.openclawCli) {
        setCollectorState("OpenClaw CLI missing", "error");
        message.textContent = "Collector is running, but the OpenClaw CLI is not available on its PATH.";
        return;
      }

      if (health.gateway !== "reachable") {
        setCollectorState("Gateway unavailable", "error");
        message.textContent = health.gatewayError
          ? `Collector is running, but OpenClaw Gateway is unavailable: ${health.gatewayError}`
          : "Collector is running, but OpenClaw Gateway is unavailable.";
        return;
      }

      if (!health.traceLogConfigured) {
        setCollectorState("Gateway connected · trace log not set", "connected");
        message.textContent = "Questions can run, but G0–G18 runtime events need TRACECLAW_LOG_PATH.";
        return;
      }

      if (!health.traceLogExists) {
        setCollectorState("Gateway connected · trace log missing", "error");
        message.textContent = `TRACECLAW_LOG_PATH is configured but the file does not exist: ${health.traceLogPath || ""}`;
        return;
      }

      setCollectorState("Gateway + trace connected", "connected");
      message.textContent = "Ready to run a new question and collect its Gateway trace.";
    } catch (error) {
      setCollectorState("Collector unavailable", "error");
      message.textContent = `Start the local collector at ${collectorUrl}. ${error.message}`;
    }
  }

  function installLiveCase(caseData, prompt) {
    if (!caseData || !caseData.meta || !caseData.stages) {
      throw new Error("Collector returned an invalid trace payload.");
    }

    const id = caseData.meta.id || `live-${Date.now()}`;
    caseData.meta.id = id;
    caseData.meta.title = caseData.meta.title || prompt;
    caseData.meta.prompt = caseData.meta.prompt || prompt;

    window.GATEWAY_CASES = window.GATEWAY_CASES || {};
    window.GATEWAY_CASES[id] = caseData;

    ACTIVE_CASE = caseData;
    CASE2 = caseData.meta;
    DATA = mergeCase(caseData);
    byId = Object.fromEntries(DATA.stages.map(stage => [stage.id, stage]));
    mods = Object.fromEntries(DATA.modules.map(module => [module.id, module]));

    completed.clear();
    playing = false;
    paused = false;
    activeModule = "M1";
    activeStage = "G3";
    activeStep = 0;

    applyCaseMeta();
    renderAll();
    renderRuntimeBoundary();
    renderLog();
    syncSourceToggle();

    const select = document.getElementById("caseSelect");
    if (select && ![...select.options].some(option => option.value === id)) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${caseData.meta.title} · live`;
      option.selected = true;
      select.append(option);
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("case");
    url.searchParams.set("live", id);
    window.history.replaceState({}, "", url);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const prompt = input.value.trim();

    if (!prompt) {
      message.textContent = "Enter a question first.";
      input.focus();
      return;
    }

    showResponse("");

    if (!collectorUrl) {
      message.textContent = "Collector is not configured.";
      setCollectorState("Collector not configured", "error");
      return;
    }

    setBusy(true);
    setCollectorState("Running trace…", "connected");
    message.textContent = "Sending the question to OpenClaw and waiting for the reply and runtime trace…";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(cfg.requestTimeoutMs) || 135000);

    try {
      const response = await fetch(`${collectorUrl}/api/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
        signal: controller.signal
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
      }

      installLiveCase(payload.trace || payload, prompt);
      showResponse(payload.response || payload.trace?.meta?.response || "");

      const collectorMeta = payload.trace?._collector;
      if (collectorMeta && Array.isArray(collectorMeta.traceStagesObserved)) {
        const count = collectorMeta.traceStagesObserved.length;
        setCollectorState("Trace complete", "connected");
        message.textContent = count
          ? `Live trace loaded. Runtime events captured for ${count} G stages.`
          : "Reply completed, but no correlated G-stage runtime events were found. Check TRACECLAW_LOG_PATH / instrumentation.";
      } else {
        setCollectorState("Trace complete", "connected");
        message.textContent = "Live trace loaded below.";
      }
    } catch (error) {
      const text = error.name === "AbortError"
        ? "Collector request timed out."
        : `Run failed: ${error.message}`;
      setCollectorState("Run failed", "error");
      message.textContent = text;
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  });

  checkCollector();
  setTimeout(renderRuntimeBoundary, 0);
})();