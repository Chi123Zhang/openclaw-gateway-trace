(() => {
  const catalog = window.TRACECLAW_END_TO_END_PHASES;
  const root = document.getElementById("moduleRow");
  if (!catalog || !root) return;

  document.body.classList.add("e2eOverview");

  const stageNumber = id => {
    const n = Number(String(id || "").replace("G", ""));
    return Number.isFinite(n) ? n : -1;
  };

  const requestState = () => document.getElementById("requestState")?.textContent?.trim() || "";
  const inProgress = () => /^(?:STARTING|RUNNING|PAUSED)/i.test(requestState());

  function observedStageSet() {
    return new Set(ACTIVE_CASE?._collector?.traceStagesObserved || []);
  }

  function runtime() {
    return ACTIVE_CASE?.agentRuntime || {};
  }

  function runtimePhase(id) {
    return (runtime()?.phases || []).find(phase => phase?.id === id) || {
      id,
      status: "not captured",
      steps: []
    };
  }

  function lastRuntimeEventName() {
    const events = Array.isArray(runtime()?.events) ? runtime().events : [];
    return String(events.at(-1)?.event || "");
  }

  function activeAgentPhase() {
    if (!inProgress()) return "";
    const observed = observedStageSet();
    if (!observed.has("G18")) return "";

    const event = lastRuntimeEventName();
    if (event === "agent_runtime_selected") return "AR1";
    if (event === "agent_run_started" || event === "tool_started" || event === "tool_result" || event === "agent_reply_finalized") return "AR2";
    if (event === "agent_run_ended" || event === "reply_resolver_returned") return "AR3";
    return "";
  }

  function phaseStatusTone(status) {
    if (status === "complete" || status === "completed") return "good";
    if (status === "running" || status === "partial") return "info";
    return "muted";
  }

  function prettyStatus(status) {
    const value = String(status || "not captured");
    if (value === "not captured") return "WAITING";
    return value.toUpperCase();
  }

  function makeArrow() {
    const arrow = document.createElement("span");
    arrow.className = "e2eFlowArrow";
    arrow.textContent = "→";
    return arrow;
  }

  function stageTitle(id) {
    try {
      const stage = typeof byId !== "undefined" ? byId?.[id] : null;
      return stage?.short || stage?.title || id;
    } catch {
      return id;
    }
  }

  function gatewayCard(phase) {
    const observed = observedStageSet();
    const observedCount = phase.stages.filter(id => observed.has(id)).length;
    const complete = observedCount === phase.stages.length;
    const active = inProgress() && phase.stages.includes(typeof activeStage !== "undefined" ? activeStage : "");
    const card = document.createElement("button");
    card.type = "button";
    card.className = "e2ePhaseCard e2eGatewayCard";
    card.dataset.phaseId = phase.id;
    card.classList.toggle("complete", complete);
    card.classList.toggle("active", active);

    const top = document.createElement("div");
    top.className = "e2ePhaseTop";
    const number = document.createElement("span");
    number.className = "e2ePhaseNumber";
    number.textContent = phase.number;
    const title = document.createElement("span");
    title.className = "e2ePhaseTitle";
    title.textContent = phase.title;
    const status = document.createElement("span");
    status.className = `e2ePhaseStatus ${complete ? "good" : observedCount ? "info" : "muted"}`;
    status.textContent = complete ? "COMPLETE" : `${observedCount}/${phase.stages.length}`;
    top.append(number, title, status);

    const subtitle = document.createElement("div");
    subtitle.className = "e2ePhaseSubtitle";
    subtitle.textContent = phase.subtitle;

    const flow = document.createElement("div");
    flow.className = "e2eMiniFlow";
    phase.stages.forEach((id, index) => {
      const stage = document.createElement("button");
      stage.type = "button";
      stage.className = "e2eStage";
      stage.dataset.id = id;
      stage.title = `${id} · ${stageTitle(id)}`;
      stage.textContent = id;
      stage.classList.toggle("observed", observed.has(id));
      stage.classList.toggle("current", inProgress() && typeof activeStage !== "undefined" && activeStage === id);
      stage.addEventListener("click", event => {
        event.stopPropagation();
        try { if (typeof selectStage === "function") selectStage(id); } catch {}
      });
      flow.append(stage);
      if (index < phase.stages.length - 1) flow.append(makeArrow());
    });

    const footer = document.createElement("div");
    footer.className = "e2ePhaseFooter";
    const fact = document.createElement("span");
    fact.className = "e2eCurrentFacts";
    fact.textContent = observedCount
      ? `current run · ${observedCount} observed stage${observedCount === 1 ? "" : "s"}`
      : "current run · waiting";
    const hint = document.createElement("span");
    hint.textContent = "View flow →";
    footer.append(fact, hint);

    card.append(top, subtitle, flow, footer);
    card.addEventListener("click", () => openPhasePanel("gateway", phase.id));
    return card;
  }

  function agentSummaryChips(phase) {
    const rt = runtime();
    const observedG18 = observedStageSet().has("G18");
    if (!observedG18) {
      return [
        { label: "waiting for G18", observed: false, response: false }
      ];
    }

    if (phase.id === "AR1") {
      return [
        { label: "runtime selected", observed: Boolean(rt.attempts?.length), response: false },
        { label: "run started", observed: Boolean(rt.runStarted), response: false }
      ];
    }
    if (phase.id === "AR2") {
      const toolLabel = rt.toolCalled
        ? `tools ${rt.toolCount || 0}`
        : (rt.runEnded ? "no tool call" : "tools waiting");
      return [
        { label: "agent running", observed: Boolean(rt.runStarted), response: false },
        { label: toolLabel, observed: Boolean(rt.toolCalled || rt.runEnded), response: false },
        {
          label: rt.agentReplyDirectlyObserved ? "reply finalized" : (rt.downstreamAssistantResponseObserved ? "reply downstream" : "reply waiting"),
          observed: Boolean(rt.agentReplyDirectlyObserved),
          response: !rt.agentReplyDirectlyObserved && Boolean(rt.downstreamAssistantResponseObserved)
        }
      ];
    }
    return [
      {
        label: rt.agentReplyDirectlyObserved ? "reply finalized" : (rt.downstreamAssistantResponseObserved ? "response observed" : "reply waiting"),
        observed: Boolean(rt.agentReplyDirectlyObserved),
        response: !rt.agentReplyDirectlyObserved && Boolean(rt.downstreamAssistantResponseObserved)
      },
      { label: "run ended", observed: Boolean(rt.runEnded), response: false },
      { label: "return G16", observed: Boolean(rt.returnToG16Observed), response: false }
    ];
  }

  function agentFacts(phase) {
    const rt = runtime();
    if (!observedStageSet().has("G18")) return "current run · starts after G18";
    if (phase.id === "AR1") {
      return [
        rt.finalAgent || "",
        rt.runner || "",
        [rt.provider, rt.model].filter(Boolean).join(" · ")
      ].filter(Boolean).join(" · ") || "current run · waiting";
    }
    if (phase.id === "AR2") {
      if (rt.toolCalled) {
        const names = (rt.tools || []).map(item => item?.name).filter(Boolean);
        return `current run · ${rt.toolCount || names.length} tool call(s)${names.length ? " · " + [...new Set(names)].join(", ") : ""}`;
      }
      return rt.runEnded ? "current run · no tool call observed" : "current run · executing";
    }
    return [
      rt.runEnded ? "run ended" : "",
      rt.returnToG16Observed ? "returned to G16" : ""
    ].filter(Boolean).join(" · ") || "current run · waiting";
  }

  function agentCard(phase) {
    const observedG18 = observedStageSet().has("G18");
    const current = runtimePhase(phase.id);
    const active = activeAgentPhase() === phase.id;
    const complete = current.status === "complete" || current.status === "completed";
    const statusValue = observedG18 ? current.status : "not captured";

    const card = document.createElement("button");
    card.type = "button";
    card.className = "e2ePhaseCard e2eAgentCard";
    card.dataset.phaseId = phase.id;
    card.classList.toggle("complete", complete);
    card.classList.toggle("active", active);

    const top = document.createElement("div");
    top.className = "e2ePhaseTop";
    const number = document.createElement("span");
    number.className = "e2ePhaseNumber";
    number.textContent = phase.number;
    const title = document.createElement("span");
    title.className = "e2ePhaseTitle";
    title.textContent = phase.title;
    const status = document.createElement("span");
    status.className = `e2ePhaseStatus ${phaseStatusTone(statusValue)}`;
    status.textContent = observedG18 ? prettyStatus(statusValue) : "AFTER G18";
    top.append(number, title, status);

    const subtitle = document.createElement("div");
    subtitle.className = "e2ePhaseSubtitle";
    subtitle.textContent = phase.subtitle;

    const flow = document.createElement("div");
    flow.className = "e2eMiniFlow";
    const chips = agentSummaryChips(phase);
    chips.forEach((item, index) => {
      const chip = document.createElement("span");
      chip.className = "e2eRuntimeStep";
      chip.textContent = item.label;
      chip.classList.toggle("observed", item.observed);
      chip.classList.toggle("response", item.response);
      if (active && index === chips.length - 1) chip.classList.add("current");
      flow.append(chip);
      if (index < chips.length - 1) flow.append(makeArrow());
    });

    const footer = document.createElement("div");
    footer.className = "e2ePhaseFooter";
    const fact = document.createElement("span");
    fact.className = "e2eCurrentFacts";
    fact.textContent = agentFacts(phase);
    const hint = document.createElement("span");
    hint.textContent = "View flow →";
    footer.append(fact, hint);

    card.append(top, subtitle, flow, footer);
    card.addEventListener("click", () => openPhasePanel("agent", phase.id));
    return card;
  }

  function group(title, phases, type) {
    const section = document.createElement("section");
    section.className = `e2ePhaseGroup e2e${type === "agent" ? "Agent" : "Gateway"}Group`;
    const head = document.createElement("div");
    head.className = "e2eGroupHead";
    head.textContent = title;
    const row = document.createElement("div");
    row.className = "e2ePhaseRow";
    phases.forEach(phase => row.append(type === "agent" ? agentCard(phase) : gatewayCard(phase)));
    section.append(head, row);
    return section;
  }

  function updateCurrentIndicator() {
    const indicator = document.querySelector(".pipeline > .currentStageIndicator");
    if (!indicator) return;
    const agentPhase = activeAgentPhase();
    if (!agentPhase) return;
    const phase = catalog.agent.find(item => item.id === agentPhase);
    const label = indicator.querySelector(".currentStageIndicatorLabel");
    const strong = indicator.querySelector("strong");
    if (label) label.textContent = "Current phase";
    if (strong) strong.textContent = `${agentPhase} · ${phase?.title || "Agent Runtime"}`;
    indicator.hidden = false;
  }

  function renderOverview() {
    if (!root.isConnected) return;
    root.classList.add("e2eModuleRow");
    const shell = document.createElement("div");
    shell.className = "e2eOverviewRoot";
    shell.append(
      group("Gateway · G0–G18", catalog.gateway, "gateway"),
      group("Agent Runtime · post-G18", catalog.agent, "agent")
    );
    root.replaceChildren(shell);
    updateCurrentIndicator();
    refreshOpenPanel();
  }

  function ensurePanel() {
    if (document.getElementById("e2ePhasePanel")) return;
    const backdrop = document.createElement("div");
    backdrop.className = "e2ePhaseBackdrop";
    backdrop.id = "e2ePhaseBackdrop";

    const panel = document.createElement("section");
    panel.className = "e2ePhasePanel";
    panel.id = "e2ePhasePanel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.innerHTML = `
      <header class="e2ePhasePanelHead">
        <div>
          <div class="e2ePhasePanelKicker" id="e2ePhasePanelKicker">Phase</div>
          <div class="e2ePhasePanelTitle" id="e2ePhasePanelTitle">—</div>
        </div>
        <button class="e2ePhasePanelClose" id="e2ePhasePanelClose" type="button" aria-label="Close phase panel">×</button>
      </header>
      <div class="e2ePhasePanelBody" id="e2ePhasePanelBody"></div>`;

    document.body.append(backdrop, panel);
    backdrop.addEventListener("click", closePhasePanel);
    panel.querySelector("#e2ePhasePanelClose")?.addEventListener("click", closePhasePanel);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && document.body.classList.contains("e2ePhaseOpen")) closePhasePanel();
    });
  }

  let openPhase = null;

  function closePhasePanel() {
    document.body.classList.remove("e2ePhaseOpen");
    openPhase = null;
  }

  function evidenceClass(evidence) {
    const value = String(evidence || "").toUpperCase();
    if (value === "RUNTIME") return "runtime";
    if (value === "RESPONSE") return "response";
    if (value === "RUNTIME-COVERAGE") return "coverage";
    return "source";
  }

  function valuesText(values) {
    if (!values || typeof values !== "object") return "";
    return Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`)
      .join(" · ");
  }

  function panelStep(index, title, detail, evidence, extra = "") {
    const row = document.createElement("div");
    row.className = "e2ePanelStep";
    const number = document.createElement("span");
    number.className = "e2ePanelStepNum";
    number.textContent = index + 1;
    const main = document.createElement("div");
    const t = document.createElement("div");
    t.className = "e2ePanelStepTitle";
    t.textContent = title;
    const d = document.createElement("div");
    d.className = "e2ePanelStepDetail";
    d.textContent = [detail, extra].filter(Boolean).join(" · ");
    main.append(t, d);
    const badge = document.createElement("span");
    badge.className = `e2eEvidence ${evidenceClass(evidence)}`;
    badge.textContent = evidence || "SOURCE";
    row.append(number, main, badge);
    return row;
  }

  function sourceSection(phase) {
    const root = document.createElement("div");
    root.className = "e2eSourceSteps";
    (phase.sourceSteps || []).forEach(item => {
      const step = document.createElement("div");
      step.className = "e2eSourceStep";
      const title = document.createElement("strong");
      title.textContent = item.title;
      const detail = document.createElement("p");
      detail.textContent = item.detail;
      const source = document.createElement("code");
      source.textContent = item.source;
      step.append(title, detail, source);
      root.append(step);
    });
    return root;
  }

  function gatewayPanelBody(phase) {
    const observed = observedStageSet();
    const body = document.createDocumentFragment();

    const intro = document.createElement("div");
    intro.className = "e2ePhaseIntro";
    const purpose = document.createElement("div");
    purpose.className = "e2ePhasePurpose";
    purpose.innerHTML = '<span class="e2ePanelLabel">Purpose</span>';
    const p = document.createElement("p");
    p.textContent = phase.subtitle;
    purpose.append(p);
    const status = document.createElement("div");
    status.className = "e2ePhaseRunStatus";
    status.innerHTML = '<span class="e2ePanelLabel">Current run</span>';
    const strong = document.createElement("strong");
    const count = phase.stages.filter(id => observed.has(id)).length;
    strong.textContent = `${count}/${phase.stages.length} observed`;
    status.append(strong);
    intro.append(purpose, status);
    body.append(intro);

    const sectionTitle = document.createElement("div");
    sectionTitle.className = "e2ePanelSectionTitle";
    sectionTitle.textContent = "Current-run Gateway stages";
    body.append(sectionTitle);

    const steps = document.createElement("div");
    steps.className = "e2ePanelSteps";
    phase.stages.forEach((id, index) => {
      const stage = typeof byId !== "undefined" ? byId?.[id] : null;
      const evidence = observed.has(id) ? "RUNTIME" : "NOT CAPTURED";
      const row = panelStep(
        index,
        `${id} · ${stage?.short || stage?.title || id}`,
        stage?.result && stage.result !== "—" ? `result=${stage.result}` : "No current-run runtime value revealed yet.",
        evidence
      );
      row.dataset.id = id;
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        try { if (typeof selectStage === "function") selectStage(id); } catch {}
        closePhasePanel();
      });
      steps.append(row);
    });
    body.append(steps);

    const sourceTitle = document.createElement("div");
    sourceTitle.className = "e2ePanelSectionTitle";
    sourceTitle.textContent = "Verified source area";
    body.append(sourceTitle);
    const sources = document.createElement("div");
    sources.className = "e2eSourceSteps";
    phase.source.forEach(item => {
      const div = document.createElement("div");
      div.className = "e2eSourceStep";
      const code = document.createElement("code");
      code.textContent = item;
      div.append(code);
      sources.append(div);
    });
    body.append(sources);
    return body;
  }

  function agentPanelBody(phase) {
    const current = runtimePhase(phase.id);
    const body = document.createDocumentFragment();

    const intro = document.createElement("div");
    intro.className = "e2ePhaseIntro";
    const purpose = document.createElement("div");
    purpose.className = "e2ePhasePurpose";
    purpose.innerHTML = '<span class="e2ePanelLabel">Purpose</span>';
    const p = document.createElement("p");
    p.textContent = phase.subtitle;
    purpose.append(p);
    const status = document.createElement("div");
    status.className = "e2ePhaseRunStatus";
    status.innerHTML = '<span class="e2ePanelLabel">Current run</span>';
    const strong = document.createElement("strong");
    strong.textContent = observedStageSet().has("G18") ? prettyStatus(current.status) : "WAITING FOR G18";
    status.append(strong);
    intro.append(purpose, status);
    body.append(intro);

    const runTitle = document.createElement("div");
    runTitle.className = "e2ePanelSectionTitle";
    runTitle.textContent = "Current-run observed process";
    body.append(runTitle);

    const runtimeSteps = document.createElement("div");
    runtimeSteps.className = "e2ePanelSteps";
    const steps = Array.isArray(current.steps) ? current.steps : [];
    if (!steps.length) {
      runtimeSteps.append(panelStep(0, "Waiting for current-run Agent evidence", "No post-G18 runtime event has been captured for this phase yet.", "NOT CAPTURED"));
    } else {
      steps.forEach((step, index) => {
        runtimeSteps.append(panelStep(
          index,
          step.title || step.id,
          step.note || (step.observed ? "Observed in this run." : "Not directly captured in this run."),
          step.evidence || (step.observed ? "RUNTIME" : "NOT CAPTURED"),
          valuesText(step.values)
        ));
      });
    }
    body.append(runtimeSteps);

    const sourceTitle = document.createElement("div");
    sourceTitle.className = "e2ePanelSectionTitle";
    sourceTitle.textContent = "Source path · structure only";
    body.append(sourceTitle, sourceSection(phase));

    return body;
  }

  function openPhasePanel(type, id) {
    ensurePanel();
    const phase = (type === "agent" ? catalog.agent : catalog.gateway).find(item => item.id === id);
    if (!phase) return;
    openPhase = { type, id };
    document.getElementById("e2ePhasePanelKicker").textContent =
      type === "agent" ? "Agent Runtime · current run" : "Gateway · current run";
    document.getElementById("e2ePhasePanelTitle").textContent = `${phase.number} · ${phase.title}`;
    const body = document.getElementById("e2ePhasePanelBody");
    body.replaceChildren(type === "agent" ? agentPanelBody(phase) : gatewayPanelBody(phase));
    document.body.classList.add("e2ePhaseOpen");
  }

  function refreshOpenPanel() {
    if (!openPhase || !document.body.classList.contains("e2ePhaseOpen")) return;
    const phase = (openPhase.type === "agent" ? catalog.agent : catalog.gateway)
      .find(item => item.id === openPhase.id);
    const body = document.getElementById("e2ePhasePanelBody");
    if (phase && body) {
      body.replaceChildren(openPhase.type === "agent" ? agentPanelBody(phase) : gatewayPanelBody(phase));
    }
  }

  function install() {
    ensurePanel();

    if (typeof renderModules === "function" && document.documentElement.dataset.e2eOverviewWrapped !== "1") {
      const previous = renderModules;
      renderModules = function renderModulesAsEndToEnd(...args) {
        const result = previous(...args);
        renderOverview();
        return result;
      };
      document.documentElement.dataset.e2eOverviewWrapped = "1";
    }

    renderOverview();

    const state = document.getElementById("requestState");
    if (state && state.dataset.e2eObserved !== "1") {
      state.dataset.e2eObserved = "1";
      new MutationObserver(renderOverview).observe(state, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
