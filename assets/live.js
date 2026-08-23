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
      setCollectorState("Collector not connected");
      return;
    }
    try {
      const response = await fetch(`${collectorUrl}/health`, { method: "GET" });
      if (!response.ok) throw new Error(`health ${response.status}`);
      setCollectorState("Collector connected", "connected");
      message.textContent = "New questions will run through the collector.";
    } catch (error) {
      setCollectorState("Collector unavailable", "error");
      message.textContent = `Collector configured but unavailable: ${error.message}`;
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
      const saved = (window.GATEWAY_CASE_INDEX || []).find(item =>
        item.title.trim().toLowerCase() === prompt.toLowerCase()
      );
      if (saved) {
        message.textContent = "This question already has a saved trace. Use the Saved trace menu to open it.";
      } else {
        message.textContent = "Live collector is not connected yet. The interface is ready; the next step is wiring /api/run to OpenClaw.";
      }
      setCollectorState("Collector not connected", "error");
      return;
    }

    setBusy(true);
    setCollectorState("Running trace…", "connected");
    message.textContent = "Sending the question to OpenClaw and waiting for trace data…";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(cfg.requestTimeoutMs) || 120000);

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
      setCollectorState("Trace complete", "connected");
      message.textContent = "Live trace loaded below.";
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
})();
