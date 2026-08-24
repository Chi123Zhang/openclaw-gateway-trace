(() => {
  const BRANCH_STAGES = new Set(["G0", "G1", "G2", "G3", "G4", "G6", "G8", "G9", "G10", "G11", "G12"]);
  const CONTEXT_STAGES = new Set(["G5", "G7", "G13", "G15"]);

  const SPECIAL = {
    "G0:2": "G1 returns its authorization result to the surrounding G0 state.",
    "G1:2": "GatewayAuthResult returns to G0.",
    "G2:5": "Accepted role/scopes become the authenticated connection state.",
    "G3:0": "The authenticated client identity is checked against chat.send authorization rules.",
    "G4:0": "Validated chat.send parameters continue through origin/provenance guards.",
    "G5:0": "The normalized message becomes the input to control-message classification.",
    "G6:2": "The requested-Agent state is returned to the chat.send handler.",
    "G7:0": "The canonical SessionKey is used to resolve the owning Agent/session store.",
    "G7:2": "The loaded Session store is searched for the matching SessionEntry.",
    "G8:1": "A compatible Agent/Session state continues to the final validation result.",
    "G9:2": "The Agent parsed from SessionKey participates in the precedence decision.",
    "G10:2": "If the legacy-key deny branch is not taken, routing metadata is normalized for policy rules.",
    "G10:3": "Normalized channel/chatType values feed configured rule matching.",
    "G10:4": "A matched rule, when present, feeds the matched-rule decision branch.",
    "G11:3": "If no earlier dedupe/abort branch returns, the request reaches new-dispatch classification.",
    "G12:0": "The admission attempt identifier is used to establish execution ownership.",
    "G12:1": "Owned admission state is revalidated immediately before dispatch.",
    "G13:2": "Routing fields are accumulated into the MsgContext that is constructed next.",
    "G13:3": "The constructed MsgContext is enriched with command/run/media state before dispatch.",
    "G13:7": "The completed MsgContext becomes G14 params.ctx.",
    "G14:1": "Prepared reply/run state is used when G15 finalizes the inbound context.",
    "G14:2": "G15 returns FinalizedMsgContext to the surrounding G14 call.",
    "G14:3": "The finalized context and delivery hook state are passed into G16.",
    "G14:4": "G16 returns DispatchFromConfigResult to G14 for final reconciliation.",
    "G15:0": "Supplemental fields remain on the same MsgContext during normalization.",
    "G15:1": "Normalized text feeds ChatType/body/command normalization on the same context object.",
    "G15:5": "The finalized MsgContext is returned to G14 and then passed into G16.",
    "G16:0": "FinalizedMsgContext becomes the working reply-dispatch context.",
    "G16:1": "The downstream Session/Agent result feeds lifecycle and admission control.",
    "G16:2": "Admitted execution state feeds routing, send policy, tool policy and visibility checks.",
    "G16:3": "Resolved routing/policy state feeds dedupe and interception gates.",
    "G16:4": "After gates pass, G18 selects and invokes the reply resolver.",
    "G16:5": "replyResult returns from G18 into the original G16 flow.",
    "G16:6": "Processed reply payloads feed delivery/lifecycle completion.",
    "G17:1": "sessionAgentId is used immediately to load the resolved Agent configuration.",
    "G17:2": "sessionAgentId + sessionAgentCfg return to the surrounding G16 flow.",
    "G18:0": "The selected resolver is used to prepare the runtime reply configuration.",
    "G18:1": "Prepared replyConfig is in place before Agent dispatch begins.",
    "G18:2": "The resolver runs under lifecycle/abort control and crosses into deeper Agent Runtime.",
    "G18:3": "replyResult returns to G16; G16 resumes filtering, delivery and completion.",
  };

  function inspect(stage, index) {
    return window.GATEWAY_STEP_EVIDENCE?.inspect?.(stage, index) || {
      status: { label: "UNRESOLVED", tone: "unresolved" },
      inputs: [], outputs: [], knownFacts: [],
    };
  }

  function known(item) {
    return Boolean(item?.observed && item?.value && !/^not observed/i.test(String(item.value)));
  }

  function evidenceRank(item) {
    const e = String(item?.evidence || "").toUpperCase();
    if (e === "RUNTIME" || e === "NATIVE") return 4;
    if (e === "REQUEST" || e === "RESPONSE") return 3;
    if (e.includes("SOURCE")) return 2;
    return 1;
  }

  function evidenceName(item) {
    const e = String(item?.evidence || "").toUpperCase();
    if (e === "RUNTIME") return "observed";
    if (e === "NATIVE") return "native";
    if (e === "REQUEST") return "request";
    if (e === "RESPONSE") return "response";
    if (e.includes("SOURCE")) return "derived";
    return "unknown";
  }

  function terminalStatus(status) {
    const text = String(status?.label || "").toUpperCase();
    return ["NOT SELECTED", "NOT REACHED", "NOT TRIGGERED", "SKIPPED", "NOT REQUIRED"].includes(text);
  }

  function unresolvedStatus(status) {
    return /UNRESOLVED|UNKNOWN/.test(String(status?.label || "").toUpperCase());
  }

  function sharedFacts(current, next) {
    const nextByKey = new Map((next.inputs || []).map(item => [item.key, item]));
    return (current.outputs || [])
      .filter(item => nextByKey.has(item.key))
      .map(item => {
        const nextItem = nextByKey.get(item.key);
        const selected = evidenceRank(item) >= evidenceRank(nextItem) ? item : nextItem;
        return {
          key: item.key,
          label: item.label || nextItem.label || item.key,
          value: known(item) ? item.value : known(nextItem) ? nextItem.value : "not emitted",
          evidence: evidenceName(selected),
          known: known(item) || known(nextItem),
        };
      });
  }

  function retainedInputs(current, next) {
    const outputKeys = new Set((current.outputs || []).map(item => item.key));
    return (next.inputs || [])
      .filter(item => known(item) && !outputKeys.has(item.key))
      .sort((a, b) => evidenceRank(b) - evidenceRank(a))
      .slice(0, 2)
      .map(item => ({
        key: item.key,
        label: item.label || item.key,
        value: item.value,
        evidence: evidenceName(item),
        known: true,
      }));
  }

  function firstKnownResult(model) {
    const fact = (model.knownFacts || []).find(item => item?.value && !/^not observed/i.test(String(item.value)));
    return fact ? { label: fact.label, value: fact.value, evidence: evidenceName(fact), known: true } : null;
  }

  function handoff(stage, index) {
    const current = inspect(stage, index);
    const next = inspect(stage, index + 1);
    const shared = sharedFacts(current, next);
    const special = SPECIAL[`${stage.id}:${index}`] || "";

    if (terminalStatus(current.status)) {
      return {
        kind: "branch-off",
        title: "No forward handoff on this branch",
        detail: special || "This branch is not part of the selected run path.",
        facts: [],
      };
    }

    if (shared.length) {
      const knownShared = shared.filter(item => item.known);
      return {
        kind: knownShared.length ? "data" : "source",
        title: knownShared.length ? "Output → next input" : "Field continues to next step",
        detail: special,
        facts: shared.slice(0, 2),
      };
    }

    if (unresolvedStatus(current.status)) {
      const fact = firstKnownResult(current);
      return {
        kind: "uncertain",
        title: "Branch handoff not resolved",
        detail: special || "The stage result is known, but the trace does not expose which internal branch continued.",
        facts: fact ? [fact] : [],
      };
    }

    const retained = retainedInputs(current, next);
    const fact = firstKnownResult(current);
    if (CONTEXT_STAGES.has(stage.id)) {
      return {
        kind: "context",
        title: "Context continues",
        detail: special || "The same request/context object is enriched and passed to the next source step.",
        facts: retained.length ? retained : fact ? [fact] : [],
      };
    }

    if (BRANCH_STAGES.has(stage.id)) {
      return {
        kind: "control",
        title: "Control continues",
        detail: special || "The next source step is reached only if this guard does not return early.",
        facts: fact ? [fact] : retained,
      };
    }

    return {
      kind: "control",
      title: "Continue",
      detail: special || "Control passes to the next source step.",
      facts: retained.length ? retained : fact ? [fact] : [],
    };
  }

  function evidenceChip(item) {
    const chip = document.createElement("span");
    chip.className = `stepFlowEvidence ${item.evidence || "unknown"}`;
    chip.textContent = item.evidence || "unknown";
    return chip;
  }

  function makeConnector(stage, index) {
    const model = handoff(stage, index);
    const connector = document.createElement("div");
    connector.className = `stepFlowConnector ${model.kind}`;
    connector.dataset.fromStep = String(index);
    connector.dataset.toStep = String(index + 1);
    connector.style.setProperty("--flow-delay", `${index * 110}ms`);

    const rail = document.createElement("div");
    rail.className = "stepFlowRail";
    rail.innerHTML = '<span class="stepFlowPulse"></span><span class="stepFlowArrow">↓</span>';

    const body = document.createElement("div");
    body.className = "stepFlowBody";
    const top = document.createElement("div");
    top.className = "stepFlowTop";
    const title = document.createElement("span");
    title.className = "stepFlowTitle";
    title.textContent = model.title;
    top.append(title);

    if (model.facts.length) {
      const factWrap = document.createElement("div");
      factWrap.className = "stepFlowFacts";
      model.facts.forEach(item => {
        const fact = document.createElement("div");
        fact.className = "stepFlowFact";
        const code = document.createElement("code");
        code.textContent = `${item.label} = ${item.value}`;
        fact.append(code, evidenceChip(item));
        factWrap.append(fact);
      });
      top.append(factWrap);
    }

    body.append(top);
    if (model.detail) {
      const detail = document.createElement("div");
      detail.className = "stepFlowDetail";
      detail.textContent = model.detail;
      body.append(detail);
    }

    connector.append(rail, body);
    connector.addEventListener("click", () => {
      activeStep = index + 1;
      renderSteps(stage);
      if (typeof renderBreadcrumb === "function") renderBreadcrumb(stage);
    });
    return connector;
  }

  function decorate(stage) {
    const root = document.getElementById("compactSteps");
    if (!root || !stage?.steps?.length) return;
    root.classList.add("stepFlowList");
    root.querySelectorAll(".stepFlowConnector").forEach(node => node.remove());

    const rows = [...root.querySelectorAll(":scope > .compactStep")];
    rows.forEach((row, index) => {
      row.classList.add("stepFlowNode");
      if (index < rows.length - 1) row.insertAdjacentElement("afterend", makeConnector(stage, index));
    });

    const selected = Number(activeStep) || 0;
    root.querySelectorAll(".stepFlowConnector").forEach(connector => {
      const from = Number(connector.dataset.fromStep);
      connector.classList.toggle("selectedFlow", from === selected);
      connector.classList.toggle("passedFlow", from < selected);
    });
  }

  function install() {
    if (typeof renderSteps !== "function") return;
    const previous = renderSteps;
    renderSteps = function renderStepsWithFlow(stage) {
      previous(stage);
      decorate(stage);
    };

    const current = (() => {
      try { return byId?.[activeStage] || null; } catch { return null; }
    })();
    if (current) renderSteps(current);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
