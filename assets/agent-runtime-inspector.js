(() => {
  const SOURCE = {
    overview: [
      ["G18 resolver selection", "src/auto-reply/reply/dispatch-from-config.ts · replyResolver(...)"],
      ["Agent runner / fallback", "src/auto-reply/reply/get-reply-run.ts → src/auto-reply/reply/agent-runner.ts"],
      ["Concrete runtime attempt", "src/auto-reply/reply/agent-runner-execution.ts · CLI / embedded branch"],
      ["Embedded Agent execution", "src/agents/embedded-agent-runner/run/attempt.ts"],
      ["Lifecycle / tools / messages", "src/agents/embedded-agent-subscribe.handlers.*.ts"],
      ["Return to G16", "src/auto-reply/reply/dispatch-from-config.ts · replyResult"],
    ],
    agent: [
      ["Final Agent", "src/auto-reply/reply/agent-runner-execution.ts · selected attempt"],
      ["Lifecycle identity", "src/agents/embedded-agent-subscribe.handlers.lifecycle.ts"],
      ["Gateway re-check fallback", "src/auto-reply/reply/dispatch-from-config.ts · G17 resolveSessionAgentId"],
    ],
    resolver: [
      ["Selection", "src/auto-reply/reply/dispatch-from-config.ts · const replyResolver = params.replyResolver ?? getReplyFromConfig"],
      ["Invocation", "src/auto-reply/reply/dispatch-from-config.ts · replyResolver(...)"],
      ["Return boundary", "src/auto-reply/reply/dispatch-from-config.ts · replyResult / reply_resolver_returned"],
    ],
    runtime: [
      ["Reply preparation", "src/auto-reply/reply/get-reply.ts → src/auto-reply/reply/get-reply-run.ts · runPreparedReply"],
      ["Agent runner", "src/auto-reply/reply/get-reply-run.ts · runReplyAgent"],
      ["Fallback controller", "src/auto-reply/reply/agent-runner.ts · runAgentTurnWithFallback"],
      ["CLI / embedded selection", "src/auto-reply/reply/agent-runner-execution.ts"],
      ["Embedded attempt", "src/agents/embedded-agent-runner/run/attempt.ts · createAgentSession / activeSession.prompt"],
    ],
    "provider-model": [
      ["Attempt selection", "src/auto-reply/reply/agent-runner-execution.ts · provider / model passed into CLI or embedded run"],
      ["Final embedded winner metadata", "src/agents/embedded-agent-runner/run.ts · meta.agentMeta provider / model"],
    ],
    tools: [
      ["Tool construction", "src/agents/embedded-agent-runner/run/attempt.ts · createOpenClawCodingTools"],
      ["Tool start", "src/agents/embedded-agent-subscribe.handlers.tools.ts · tool_execution_start"],
      ["Tool result", "src/agents/embedded-agent-subscribe.handlers.tools.ts · tool_execution_end / sanitized result"],
      ["Agent event bus", "src/infra/agent-events.ts · stream=tool"],
    ],
    "final-reply": [
      ["Embedded final-result construction", "src/agents/embedded-agent-runner/run.ts · finalAssistantVisibleText / finalAssistantRawText"],
      ["Embedded capture boundary", "src/auto-reply/reply/agent-runner-execution.ts · winning fallbackResult.result before deferred lifecycle end"],
      ["CLI reply boundary", "src/auto-reply/reply/agent-runner-cli-dispatch.ts · cliText"],
      ["Downstream response fallback", "chat.history after agent.wait · RESPONSE evidence only"],
    ],
    return: [
      ["Resolver returns", "src/auto-reply/reply/dispatch-from-config.ts · replyResult"],
      ["Trace boundary", "reply_resolver_returned · resolverSource / replyResultKind / replyCount"],
      ["G16 resumes", "src/auto-reply/reply/dispatch-from-config.ts · post-replyResult processing"],
    ],
  };

  const EVENT_FILTERS = {
    overview: new Set(["agent_runtime_selected","agent_run_started","tool_started","tool_result","agent_reply_finalized","agent_run_ended","reply_resolver_returned"]),
    agent: new Set(["agent_runtime_selected","agent_run_started","agent_reply_finalized","agent_run_ended","reply_resolver_returned"]),
    resolver: new Set(["reply_resolver_returned"]),
    runtime: new Set(["agent_runtime_selected","agent_run_started","agent_run_ended"]),
    "provider-model": new Set(["agent_runtime_selected","agent_reply_finalized"]),
    tools: new Set(["tool_started","tool_result"]),
    "final-reply": new Set(["agent_reply_finalized"]),
    return: new Set(["agent_run_ended","reply_resolver_returned"]),
  };

  const LABELS = {
    overview: "Deeper Agent Run",
    agent: "Agent",
    resolver: "Resolver",
    runtime: "Runtime",
    "provider-model": "Provider / Model",
    tools: "Tools",
    "final-reply": "Final reply",
    return: "Return to G16",
  };

  function currentCase() {
    return typeof ACTIVE_CASE !== "undefined" && ACTIVE_CASE ? ACTIVE_CASE : {};
  }

  function currentRuntime() {
    return currentCase().agentRuntime || {};
  }

  function currentMeta() {
    return currentCase().meta || {};
  }

  function safeText(value) {
    if (value === undefined || value === null || value === "") return "not captured";
    if (typeof value === "boolean") return value ? "yes" : "no";
    return String(value);
  }

  function pretty(value) {
    if (value === undefined || value === null || value === "") return "not captured";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function runtimeEvents(runtime, key) {
    const allowed = EVENT_FILTERS[key] || EVENT_FILTERS.overview;
    return (Array.isArray(runtime.events) ? runtime.events : [])
      .filter(event => allowed.has(event?.event));
  }

  function lastEvent(runtime, name) {
    const events = Array.isArray(runtime.events) ? runtime.events : [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i]?.event === name) return events[i];
    }
    return null;
  }

  function evidenceBadge(text) {
    const span = document.createElement("span");
    const raw = String(text || "NOT CAPTURED");
    span.className = "agentInspectEvidence";
    span.dataset.tone = raw.startsWith("RUNTIME")
      ? "runtime"
      : raw.startsWith("RESPONSE")
        ? "response"
        : raw.startsWith("SOURCE")
          ? "source"
          : raw.startsWith("RUNTIME-COVERAGE")
            ? "coverage"
            : "missing";
    span.textContent = raw;
    return span;
  }

  function fact(label, value, evidence = "") {
    const row = document.createElement("div");
    row.className = "agentInspectFact";
    const key = document.createElement("span");
    key.textContent = label;
    const val = document.createElement("strong");
    val.textContent = safeText(value);
    row.append(key, val);
    if (evidence) row.append(evidenceBadge(evidence));
    return row;
  }

  function preBlock(label, value, evidence = "") {
    const wrap = document.createElement("div");
    wrap.className = "agentInspectBlock";
    const head = document.createElement("div");
    head.className = "agentInspectBlockHead";
    const title = document.createElement("strong");
    title.textContent = label;
    head.append(title);
    if (evidence) head.append(evidenceBadge(evidence));
    const pre = document.createElement("pre");
    pre.textContent = pretty(value);
    wrap.append(head, pre);
    return wrap;
  }

  function overviewContent(key, runtime, meta) {
    const frag = document.createDocumentFragment();
    const facts = document.createElement("div");
    facts.className = "agentInspectFacts";

    const selected = lastEvent(runtime, "agent_runtime_selected");
    const started = lastEvent(runtime, "agent_run_started");
    const finalized = lastEvent(runtime, "agent_reply_finalized");
    const ended = lastEvent(runtime, "agent_run_ended");
    const returned = lastEvent(runtime, "reply_resolver_returned");

    if (key === "overview") {
      facts.append(
        fact("Agent", runtime.finalAgent || meta.downstreamAgentFinal || meta.downstreamAgent, runtime.finalAgent ? "RUNTIME" : "SOURCE-MAPPED"),
        fact("Resolver", runtime.resolverSource || runtime.resolver, runtime.returnToG16Observed ? "RUNTIME" : "RUNTIME · G18"),
        fact("Runner", runtime.runner, selected ? "RUNTIME" : "NOT CAPTURED"),
        fact("Provider", runtime.provider, runtime.providerModelEvidence || "NOT CAPTURED"),
        fact("Model", runtime.model, runtime.providerModelEvidence || "NOT CAPTURED"),
        fact("Run status", runtime.status, runtime.observed ? "RUNTIME" : "NOT CAPTURED"),
        fact("Tool count", runtime.toolCount ?? 0, runtime.runEnded ? "RUNTIME-COVERAGE" : "RUNTIME"),
        fact("Return to G16", runtime.returnToG16Observed, runtime.returnToG16Observed ? "RUNTIME" : "NOT CAPTURED"),
      );
      frag.append(facts);
      return frag;
    }

    if (key === "agent") {
      facts.append(
        fact("Final Agent", runtime.finalAgent || meta.downstreamAgentFinal || meta.downstreamAgent, runtime.finalAgent ? "RUNTIME" : "SOURCE-MAPPED"),
        fact("Selected attempt Agent", selected?.agentId, selected ? "RUNTIME" : "NOT CAPTURED"),
        fact("Lifecycle started", runtime.runStarted, started ? "RUNTIME" : "NOT CAPTURED"),
        fact("Lifecycle ended", runtime.runEnded, ended ? "RUNTIME" : "NOT CAPTURED"),
      );
      frag.append(facts);
      return frag;
    }

    if (key === "resolver") {
      const activeCase = currentCase();
      const g18Observed = Array.isArray(activeCase?._collector?.traceStagesObserved)
        && activeCase._collector.traceStagesObserved.includes("G18");
      facts.append(
        fact("Resolver", runtime.resolver || meta.resolver, returned ? "RUNTIME" : (g18Observed ? "RUNTIME · G18" : "NOT CAPTURED")),
        fact("Resolver source", runtime.resolverSource || meta.resolverSource, returned ? "RUNTIME" : (g18Observed ? "RUNTIME · G18" : "NOT CAPTURED")),
        fact("Returned", runtime.returnToG16Observed, returned ? "RUNTIME" : "NOT CAPTURED"),
        fact("replyResult kind", runtime.replyResultKind, returned ? "RUNTIME" : "NOT CAPTURED"),
        fact("reply count", runtime.replyCount, returned ? "RUNTIME" : "NOT CAPTURED"),
      );
      frag.append(facts);
      return frag;
    }

    if (key === "runtime") {
      facts.append(
        fact("Runner", runtime.runner, selected ? "RUNTIME" : "NOT CAPTURED"),
        fact("Agent", runtime.finalAgent, selected || started ? "RUNTIME" : "NOT CAPTURED"),
        fact("Started", runtime.runStarted, started ? "RUNTIME" : "NOT CAPTURED"),
        fact("Started at", runtime.startedAt, started ? "RUNTIME" : "NOT CAPTURED"),
        fact("Ended", runtime.runEnded, ended ? "RUNTIME" : "NOT CAPTURED"),
        fact("Ended at", runtime.endedAt, ended ? "RUNTIME" : "NOT CAPTURED"),
        fact("Terminal phase", runtime.terminalPhase, ended ? "RUNTIME" : "NOT CAPTURED"),
        fact("Stop reason", runtime.stopReason, finalized || ended ? "RUNTIME" : "NOT CAPTURED"),
      );
      frag.append(facts);
      return frag;
    }

    if (key === "provider-model") {
      facts.append(
        fact("Provider", runtime.provider, runtime.providerModelEvidence || "NOT CAPTURED"),
        fact("Model", runtime.model, runtime.providerModelEvidence || "NOT CAPTURED"),
        fact("Selected provider", selected?.provider, selected ? "RUNTIME" : "NOT CAPTURED"),
        fact("Selected model", selected?.model, selected ? "RUNTIME" : "NOT CAPTURED"),
        fact("Final-message provider", finalized?.provider, finalized ? "RUNTIME" : "NOT CAPTURED"),
        fact("Final-message model", finalized?.model, finalized ? "RUNTIME" : "NOT CAPTURED"),
      );
      frag.append(facts);
      return frag;
    }

    if (key === "tools") {
      facts.append(
        fact("Tool called", runtime.toolCalled, runtime.runEnded ? "RUNTIME-COVERAGE" : "RUNTIME"),
        fact("Tool count", runtime.toolCount ?? 0, runtime.runEnded ? "RUNTIME-COVERAGE" : "RUNTIME"),
      );
      frag.append(facts);

      const tools = Array.isArray(runtime.tools) ? runtime.tools : [];
      if (!tools.length) {
        const empty = document.createElement("div");
        empty.className = "agentInspectEmpty";
        empty.textContent = runtime.runEnded
          ? "No tool_started/tool_result event was observed in this completed run."
          : "No tool event has been observed yet.";
        frag.append(empty);
        return frag;
      }

      tools.forEach((tool, index) => {
        const card = document.createElement("section");
        card.className = "agentInspectTool";
        const title = document.createElement("h4");
        title.textContent = `Tool ${index + 1} · ${tool.name || "tool"}`;
        card.append(title);
        const rows = document.createElement("div");
        rows.className = "agentInspectFacts";
        rows.append(
          fact("Tool call ID", tool.toolCallId, "RUNTIME"),
          fact("Status", tool.status || (tool.resultObserved ? "completed" : "started"), "RUNTIME"),
          fact("Started", tool.started, "RUNTIME"),
          fact("Result observed", tool.resultObserved, "RUNTIME"),
          fact("Error", tool.isError === true, "RUNTIME"),
          fact("Started at", tool.startedAt, tool.startedAt ? "RUNTIME" : "NOT CAPTURED"),
          fact("Ended at", tool.endedAt, tool.endedAt ? "RUNTIME" : "NOT CAPTURED"),
        );
        card.append(rows);
        if (tool.args !== undefined) card.append(preBlock("Input / args", tool.args, "RUNTIME · tool_started"));
        if (tool.result !== undefined) card.append(preBlock("Result", tool.result, "RUNTIME · tool_result"));
        if (tool.toolErrorSummary) card.append(preBlock("Error summary", tool.toolErrorSummary, "RUNTIME · tool_result"));
        frag.append(card);
      });
      return frag;
    }

    if (key === "final-reply") {
      facts.append(
        fact("Direct Agent reply observed", runtime.agentReplyDirectlyObserved, runtime.agentReplyDirectlyObserved ? "RUNTIME" : "NOT CAPTURED"),
        fact("Downstream response observed", runtime.downstreamAssistantResponseObserved, runtime.downstreamAssistantResponseObserved ? "RESPONSE" : "NOT CAPTURED"),
        fact("Evidence", runtime.finalReplyEvidence, runtime.finalReplyEvidence || "NOT CAPTURED"),
        fact("Provider", runtime.provider, runtime.providerModelEvidence || "NOT CAPTURED"),
        fact("Model", runtime.model, runtime.providerModelEvidence || "NOT CAPTURED"),
        fact("Stop reason", runtime.stopReason, finalized ? "RUNTIME" : "NOT CAPTURED"),
        fact("Runtime text source", runtime.finalReplyRuntimeSource, finalized ? "RUNTIME" : "NOT CAPTURED"),
      );
      frag.append(facts);
      frag.append(preBlock("Final reply", runtime.finalReply, runtime.finalReplyEvidence || "NOT CAPTURED"));
      return frag;
    }

    if (key === "return") {
      facts.append(
        fact("Return observed", runtime.returnToG16Observed, returned ? "RUNTIME" : "NOT CAPTURED"),
        fact("Resolver source", runtime.resolverSource, returned ? "RUNTIME" : "NOT CAPTURED"),
        fact("replyResult kind", runtime.replyResultKind, returned ? "RUNTIME" : "NOT CAPTURED"),
        fact("reply count", runtime.replyCount, returned ? "RUNTIME" : "NOT CAPTURED"),
        fact("Agent lifecycle ended", runtime.runEnded, ended ? "RUNTIME" : "NOT CAPTURED"),
      );
      frag.append(facts);
      const note = document.createElement("div");
      note.className = "agentInspectNote";
      note.textContent = runtime.returnToG16Observed
        ? "reply_resolver_returned directly proves the resolver returned into dispatchFromConfig. Later G16 post-processing is source control flow unless separately instrumented."
        : "No direct reply_resolver_returned event has been captured for this run.";
      frag.append(note);
      return frag;
    }

    frag.append(facts);
    return frag;
  }

  function eventsContent(key, runtime) {
    const events = runtimeEvents(runtime, key);
    const wrap = document.createElement("div");
    wrap.className = "agentInspectEvents";
    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "agentInspectEmpty";
      empty.textContent = "No matching current-run runtime event captured.";
      wrap.append(empty);
      return wrap;
    }

    events.forEach((event, index) => {
      const row = document.createElement("div");
      row.className = "agentInspectEvent";
      const head = document.createElement("div");
      head.className = "agentInspectEventHead";
      const seq = document.createElement("span");
      seq.textContent = String(index + 1).padStart(2, "0");
      const name = document.createElement("strong");
      name.textContent = event.event || "runtime event";
      const ts = document.createElement("code");
      ts.textContent = event.ts || "";
      head.append(seq, name, ts);
      row.append(head);

      const copy = {...event};
      delete copy.event;
      delete copy.ts;
      row.append(preBlock("Observed fields", copy, "RUNTIME"));
      wrap.append(row);
    });
    return wrap;
  }

  function sourceContent(key) {
    const wrap = document.createElement("div");
    wrap.className = "agentInspectSources";
    (SOURCE[key] || SOURCE.overview).forEach(([label, path], index) => {
      const item = document.createElement("div");
      item.className = "agentInspectSource";
      const n = document.createElement("span");
      n.textContent = String(index + 1);
      const body = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = label;
      const code = document.createElement("code");
      code.textContent = path;
      body.append(title, code);
      item.append(n, body);
      wrap.append(item);
    });
    const note = document.createElement("div");
    note.className = "agentInspectNote";
    note.textContent = "Source paths explain the control flow. Only the current run's observed events are shown as RUNTIME facts.";
    wrap.append(note);
    return wrap;
  }

  function ensurePanel() {
    let backdrop = document.getElementById("agentRuntimeInspectBackdrop");
    let panel = document.getElementById("agentRuntimeInspectPanel");
    if (backdrop && panel) return {backdrop, panel};

    backdrop = document.createElement("div");
    backdrop.id = "agentRuntimeInspectBackdrop";
    backdrop.className = "agentRuntimeInspectBackdrop";

    panel = document.createElement("section");
    panel.id = "agentRuntimeInspectPanel";
    panel.className = "agentRuntimeInspectPanel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");

    document.body.append(backdrop, panel);
    backdrop.addEventListener("click", closePanel);
    return {backdrop, panel};
  }

  function closePanel() {
    document.body.classList.remove("agentRuntimeInspectOpen");
    const panel = document.getElementById("agentRuntimeInspectPanel");
    if (panel) panel.replaceChildren();
  }

  function openPanel(key) {
    const runtime = currentRuntime();
    const meta = currentMeta();
    const {panel} = ensurePanel();

    panel.replaceChildren();

    const head = document.createElement("header");
    head.className = "agentRuntimeInspectHead";
    const titles = document.createElement("div");
    const kicker = document.createElement("span");
    kicker.className = "agentRuntimeInspectKicker";
    kicker.textContent = "CURRENT RUN · POST-G18";
    const title = document.createElement("h3");
    title.textContent = LABELS[key] || "Agent Runtime";
    const run = document.createElement("code");
    run.textContent = meta.runId ? `runId · ${meta.runId}` : "runId · not captured";
    titles.append(kicker, title, run);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "agentRuntimeInspectClose";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close Agent Runtime details");
    close.addEventListener("click", closePanel);
    head.append(titles, close);

    const tabs = document.createElement("nav");
    tabs.className = "agentRuntimeInspectTabs";
    const body = document.createElement("div");
    body.className = "agentRuntimeInspectBody";

    const views = [
      ["overview", "Overview", () => overviewContent(key, runtime, meta)],
      ["events", "Events", () => eventsContent(key, runtime)],
      ["source", "Source", () => sourceContent(key)],
    ];

    const renderView = (viewId) => {
      tabs.querySelectorAll("button").forEach(button => {
        button.classList.toggle("active", button.dataset.view === viewId);
      });
      body.replaceChildren();
      const view = views.find(item => item[0] === viewId);
      body.append(view ? view[2]() : overviewContent(key, runtime, meta));
    };

    views.forEach(([id, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.view = id;
      button.textContent = label;
      button.addEventListener("click", () => renderView(id));
      tabs.append(button);
    });

    panel.append(head, tabs, body);
    renderView("overview");
    document.body.classList.add("agentRuntimeInspectOpen");
    close.focus();
  }

  document.addEventListener("click", event => {
    const target = event.target.closest?.(".agentRuntimeNode[data-runtime-key], .agentRuntimeLead[data-runtime-key]");
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    openPanel(target.dataset.runtimeKey || "overview");
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.body.classList.contains("agentRuntimeInspectOpen")) {
      closePanel();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest?.(".agentRuntimeNode[data-runtime-key], .agentRuntimeLead[data-runtime-key]");
    if (!target) return;
    event.preventDefault();
    openPanel(target.dataset.runtimeKey || "overview");
  });
})();
