(() => {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function currentStage() {
    try { return byId?.[activeStage] || null; } catch { return null; }
  }

  function toneFor(status) {
    return status?.tone || "unresolved";
  }

  function evidenceClass(value) {
    const text = String(value || "").toUpperCase();
    if (text === "RUNTIME" || text === "NATIVE") return "observed";
    if (text.includes("SOURCE")) return "source";
    if (text === "REQUEST" || text === "RESPONSE") return "request";
    return "neutral";
  }

  function evidenceLabel(value) {
    const text = String(value || "").toUpperCase();
    const labels = {
      RUNTIME: "Observed",
      NATIVE: "Native",
      REQUEST: "Request",
      RESPONSE: "Response",
      "SOURCE-DERIVED": "Derived",
      "SOURCE-CONFIRMED": "Source path",
      SOURCE: "Source",
      "NOT OBSERVED": "Not observed",
    };
    return labels[text] || String(value || "Unknown").replaceAll("_", " ").toLowerCase();
  }

  function statusLabel(value) {
    const text = String(value || "UNRESOLVED").toUpperCase();
    const labels = {
      OBSERVED: "Observed",
      TAKEN: "Taken",
      PASSED: "Passed",
      COMPLETED: "Completed",
      RETURNED: "Returned",
      "PATH COMPLETED": "Completed",
      "DOWNSTREAM OBSERVED": "Observed downstream",
      "RESOLVER OBSERVED": "Resolver observed",
      "SOURCE-DERIVED": "Derived",
      "SOURCE-CONFIRMED": "Source path",
      PARTIAL: "Partial",
      UNRESOLVED: "Unknown",
      "UNRESOLVED BRANCH": "Branch unknown",
      "NOT SELECTED": "Not selected",
      "NOT REACHED": "Not reached",
      "NOT TRIGGERED": "Not triggered",
      SKIPPED: "Skipped",
      "NO OVERRIDE": "No override",
      "NO ATTACHMENTS": "No attachments",
      UNCHANGED: "Unchanged",
    };
    return labels[text] || String(value || "Unknown").replaceAll("_", " ").toLowerCase();
  }

  function pretty(value) {
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }

  function runtimeEventText(events) {
    if (!events?.length) return "";
    return events.map((item, index) => {
      const head = [
        `${index + 1}. ${item.event || "runtime event"}`,
        item.ts ? `@ ${item.ts}` : "",
        item.phase ? `[${item.phase}]` : "",
      ].filter(Boolean).join(" ");
      const body = Object.entries(item.fields || {})
        .map(([key, value]) => `${key} = ${pretty(value)}`)
        .join("\n");
      return body ? `${head}\n${body}` : head;
    }).join("\n\n");
  }

  function factRows(items) {
    if (!items?.length) return el("div", "stepFactsEmpty", "No explicit fields at this boundary.");

    const root = el("div", "stepFactTable");
    const head = el("div", "stepFactTableHead");
    head.append(el("span", "", "Field"), el("span", "", "Value"), el("span", "", "Evidence"));
    root.append(head);

    items.forEach(item => {
      const row = el("div", `stepFactRow ${item.observed ? "known" : "unknown"}`);
      const field = el("div", "stepFactField");
      field.append(el("div", "stepFactLabel", item.label));
      if (item.source) field.append(el("div", "stepFactSource", item.source));
      row.append(
        field,
        el("div", `stepFactValue ${item.observed ? "" : "pending"}`, item.value),
        el("span", `stepFactEvidence ${evidenceClass(item.evidence)}`, evidenceLabel(item.evidence)),
      );
      root.append(row);
    });
    return root;
  }

  function knownRows(items) {
    const wrap = el("div", "stepKnownFacts");
    items.forEach(item => {
      const row = el("div", "stepKnownRow");
      row.append(
        el("span", "stepKnownLabel", item.label),
        el("code", "stepKnownValue", item.value),
        el("span", `stepFactEvidence ${evidenceClass(item.evidence)}`, evidenceLabel(item.evidence)),
      );
      wrap.append(row);
    });
    return wrap;
  }

  function firstKnownResult(model) {
    const fact = model?.knownFacts?.find(item => item?.value && item.value !== "not observed");
    return fact ? `${fact.label}: ${fact.value}` : "";
  }

  function readerSummary(model) {
    const raw = String(model?.status?.label || "UNRESOLVED").toUpperCase();
    const known = firstKnownResult(model);
    if (["OBSERVED", "TAKEN", "PASSED", "DOWNSTREAM OBSERVED", "RESOLVER OBSERVED"].includes(raw)) {
      return known ? `Observed in this run. ${known}.` : "Observed in this run.";
    }
    if (["SOURCE-CONFIRMED"].includes(raw)) {
      return "This step is on the verified v2026.7.1-2 source path. No dedicated TraceClaw event was emitted at this boundary.";
    }
    if (["SOURCE-DERIVED", "PATH COMPLETED", "COMPLETED", "RETURNED"].includes(raw)) {
      return known ? `Derived from the fixed source path and observed run state. ${known}.` : "Derived from the fixed source path and observed run state.";
    }
    if (raw === "UNRESOLVED BRANCH") {
      return known ? `${known}. The trace does not identify which internal branch produced that stage result.` : "The stage ran, but the trace does not identify which internal branch produced the result.";
    }
    if (["NOT SELECTED", "NOT REACHED", "NOT TRIGGERED", "SKIPPED"].includes(raw)) {
      return `This source branch was ${statusLabel(raw).toLowerCase()} in this run.`;
    }
    if (raw === "NO OVERRIDE") return "No explicit Agent override was supplied for this run.";
    if (raw === "NO ATTACHMENTS") return "The live request contained no attachments.";
    if (raw === "UNCHANGED") return "The observed message remained unchanged at this step.";
    if (raw === "PARTIAL") return "Some inputs are known for this run, but this step did not emit its own output fields.";
    return "This step exists in the fixed source path, but the current trace does not expose enough data to resolve its runtime value.";
  }

  function ensureInspector() {
    const compact = document.getElementById("compactSteps");
    if (!compact) return null;
    let panel = document.getElementById("stepIoPanel");
    if (panel) return panel;

    panel = el("section", "stepIoPanel");
    panel.id = "stepIoPanel";

    const head = el("div", "stepIoHead");
    const titleWrap = el("div", "stepIoHeadText");
    titleWrap.append(el("div", "stepIoEyebrow", "Source step"));
    const title = el("div", "stepIoTitle", "Select a step");
    title.id = "stepIoTitle";
    titleWrap.append(title);
    const right = el("div", "stepIoHeadRight");
    const status = el("span", "stepStatusChip unresolved", "Unknown");
    status.id = "stepStatusChip";
    const source = el("div", "stepIoSource");
    source.id = "stepIoSource";
    right.append(status, source);
    head.append(titleWrap, right);

    const summary = el("div", "stepRunSummary");
    const sourceAction = el("div", "stepSummaryRow");
    sourceAction.append(el("span", "stepSummaryLabel", "Source action"));
    const sourceActionText = el("span", "stepSummaryText", "—");
    sourceActionText.id = "stepSourceAction";
    sourceAction.append(sourceActionText);
    const runResult = el("div", "stepSummaryRow");
    runResult.append(el("span", "stepSummaryLabel", "This run"));
    const runResultText = el("span", "stepSummaryText", "—");
    runResultText.id = "stepRunResult";
    runResult.append(runResultText);
    summary.append(sourceAction, runResult);

    const io = el("div", "stepSpecificGrid");
    const input = el("section", "stepSpecificBox");
    input.append(el("div", "stepSpecificTitle", "Inputs"));
    const inputBody = el("div", "stepSpecificBody");
    inputBody.id = "stepSpecificInputs";
    input.append(inputBody);

    const output = el("section", "stepSpecificBox");
    output.append(el("div", "stepSpecificTitle", "Outcome"));
    const outputBody = el("div", "stepSpecificBody");
    outputBody.id = "stepSpecificOutputs";
    output.append(outputBody);
    io.append(input, output);

    const known = el("section", "stepKnownSection");
    known.id = "stepKnownSection";
    known.append(el("div", "stepSpecificTitle", "Related run evidence"));
    const knownBody = el("div", "stepSpecificBody");
    knownBody.id = "stepKnownBody";
    known.append(knownBody);

    const direct = el("details", "stepDirectDetails");
    direct.id = "stepDirectDetails";
    const directSummary = el("summary", "stepDirectSummary", "Raw event for this step");
    const directValues = el("pre", "stepDirectValues", "—");
    directValues.id = "stepDirectValues";
    direct.append(directSummary, directValues);

    const note = el("div", "stepIoNote",
      "Observed = emitted by this run. Derived = fixed source path + observed state. Source path = verified control flow without a dedicated event. Unknown values stay unknown."
    );

    panel.append(head, summary, io, known, direct, note);
    compact.insertAdjacentElement("afterend", panel);
    return panel;
  }

  function inspect(stage, index) {
    return window.GATEWAY_STEP_EVIDENCE?.inspect?.(stage, index) || {
      status: { label: "UNRESOLVED", tone: "unresolved" },
      inputs: [], outputs: [], knownFacts: [], directEvents: [],
      interpretation: stage?.steps?.[index]?.detail || "No step evidence model is loaded.",
    };
  }

  function updateInspector(stage = currentStage()) {
    const panel = ensureInspector();
    if (!panel || !stage) return;
    const index = Math.max(0, Math.min(Number(activeStep) || 0, Math.max(0, stage.steps.length - 1)));
    const step = stage.steps[index] || {};
    const model = inspect(stage, index);

    document.getElementById("stepIoTitle").textContent = `${stage.id} · Step ${index + 1} — ${step.title || "Step"}`;
    document.getElementById("stepIoSource").textContent = step.source || "";
    document.getElementById("stepSourceAction").textContent = step.detail || "—";
    document.getElementById("stepRunResult").textContent = readerSummary(model);

    const chip = document.getElementById("stepStatusChip");
    chip.textContent = statusLabel(model.status.label);
    chip.className = `stepStatusChip ${toneFor(model.status)}`;

    const input = document.getElementById("stepSpecificInputs");
    input.innerHTML = "";
    input.append(factRows(model.inputs));

    const output = document.getElementById("stepSpecificOutputs");
    output.innerHTML = "";
    output.append(factRows(model.outputs));

    const knownSection = document.getElementById("stepKnownSection");
    const known = document.getElementById("stepKnownBody");
    known.innerHTML = "";
    if (model.knownFacts?.length) {
      knownSection.hidden = false;
      known.append(knownRows(model.knownFacts));
    } else {
      knownSection.hidden = true;
    }

    const direct = document.getElementById("stepDirectDetails");
    const directText = runtimeEventText(model.directEvents);
    direct.hidden = !directText;
    if (directText) document.getElementById("stepDirectValues").textContent = directText;
  }

  function decorateStepRows(stage) {
    document.querySelectorAll("#compactSteps .compactStep").forEach(row => {
      const index = Number(row.dataset.step || 0);
      const step = stage?.steps?.[index];
      const model = inspect(stage, index);
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.setAttribute("aria-label", `${step?.title || `Step ${index + 1}`}. ${statusLabel(model.status.label)}.`);
      row.title = readerSummary(model);

      let hint = row.querySelector(".stepIoHint");
      if (!hint) {
        hint = el("span", "stepIoHint");
        row.append(hint);
      }
      hint.textContent = statusLabel(model.status.label);
      hint.className = `stepIoHint ${toneFor(model.status)}`;

      const select = () => {
        activeStep = index;
        renderSteps(stage);
        renderBreadcrumb(stage);
        updateInspector(stage);
      };
      row.onclick = select;
      row.onkeydown = event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      };
    });
  }

  function install() {
    if (typeof renderSteps !== "function") return;
    const originalRenderSteps = renderSteps;
    renderSteps = function patchedRenderSteps(stage) {
      originalRenderSteps(stage);
      decorateStepRows(stage);
      updateInspector(stage);
    };

    const heading = document.querySelector(".processTop h4");
    if (heading) heading.textContent = "Execution steps";
    const summary = document.getElementById("process");
    if (summary && !document.getElementById("stepFlowHint")) {
      const hint = el("div", "stepFlowHint",
        "Click a step to inspect its fields for this run. Values are step-specific; fields not emitted by the trace remain unknown."
      );
      hint.id = "stepFlowHint";
      summary.insertAdjacentElement("afterend", hint);
    }

    const current = currentStage();
    if (current) {
      originalRenderSteps(current);
      decorateStepRows(current);
      updateInspector(current);
    } else {
      ensureInspector();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
