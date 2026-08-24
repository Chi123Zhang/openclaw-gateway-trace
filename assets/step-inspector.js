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

  function pretty(value) {
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }

  function runtimeEventText(events) {
    if (!events?.length) return "No step-tagged runtime event was emitted for this source sub-step.";
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
    if (!items?.length) return el("div", "stepFactsEmpty", "No fields are required at this boundary.");
    const root = el("div", "stepFacts");
    items.forEach(item => {
      const row = el("div", `stepFact ${item.observed ? "known" : "unknown"}`);
      const main = el("div", "stepFactMain");
      main.append(el("div", "stepFactLabel", item.label));
      main.append(el("div", `stepFactValue ${item.observed ? "" : "pending"}`, item.value));
      const meta = el("div", "stepFactMeta");
      meta.append(el("span", `stepFactEvidence ${evidenceClass(item.evidence)}`, item.evidence));
      meta.append(el("span", "stepFactSource", item.source));
      row.append(main, meta);
      root.append(row);
    });
    return root;
  }

  function knownRows(items) {
    const wrap = el("div", "stepKnownFacts");
    if (!items?.length) {
      wrap.append(el("div", "stepKnownEmpty", "No additional downstream result is used to infer this step."));
      return wrap;
    }
    items.forEach(item => {
      const row = el("div", "stepKnownRow");
      row.append(el("span", "stepKnownLabel", item.label));
      row.append(el("code", "stepKnownValue", item.value));
      row.append(el("span", `stepFactEvidence ${evidenceClass(item.evidence)}`, item.evidence));
      wrap.append(row);
    });
    return wrap;
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
    titleWrap.append(el("div", "stepIoEyebrow", "Selected step"));
    const title = el("div", "stepIoTitle", "Select a step");
    title.id = "stepIoTitle";
    titleWrap.append(title);
    const right = el("div", "stepIoHeadRight");
    const status = el("span", "stepStatusChip unresolved", "UNRESOLVED");
    status.id = "stepStatusChip";
    const source = el("div", "stepIoSource");
    source.id = "stepIoSource";
    right.append(status, source);
    head.append(titleWrap, right);

    const interpretation = el("div", "stepInterpretation", "Select a source step to inspect what is known for this run.");
    interpretation.id = "stepInterpretation";

    const io = el("div", "stepSpecificGrid");
    const input = el("section", "stepSpecificBox");
    input.append(el("div", "stepSpecificTitle", "Inputs at this step"));
    const inputBody = el("div", "stepSpecificBody");
    inputBody.id = "stepSpecificInputs";
    input.append(inputBody);

    const output = el("section", "stepSpecificBox");
    output.append(el("div", "stepSpecificTitle", "Outputs / decisions from this step"));
    const outputBody = el("div", "stepSpecificBody");
    outputBody.id = "stepSpecificOutputs";
    output.append(outputBody);
    io.append(input, output);

    const known = el("section", "stepKnownSection");
    known.append(el("div", "stepSpecificTitle", "Known results relevant to this step"));
    const knownBody = el("div", "stepSpecificBody");
    knownBody.id = "stepKnownBody";
    known.append(knownBody);

    const direct = el("details", "stepDirectDetails");
    const directSummary = el("summary", "stepDirectSummary", "Direct runtime event for this exact sub-step");
    const directValues = el("pre", "stepDirectValues", "—");
    directValues.id = "stepDirectValues";
    direct.append(directSummary, directValues);

    const note = el("div", "stepIoNote",
      "Evidence policy: runtime values are used whenever the trace actually emitted them. Source-derived values are labeled separately. An unresolved branch is left unresolved rather than being filled with the stage-level result."
    );

    panel.append(head, interpretation, io, known, direct, note);
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

    document.getElementById("stepIoTitle").textContent = `${stage.id} · ${index + 1}. ${step.title || "Step"}`;
    document.getElementById("stepIoSource").textContent = step.source || "";
    document.getElementById("stepInterpretation").textContent = model.interpretation || step.detail || "";

    const chip = document.getElementById("stepStatusChip");
    chip.textContent = model.status.label;
    chip.className = `stepStatusChip ${toneFor(model.status)}`;

    const input = document.getElementById("stepSpecificInputs");
    input.innerHTML = "";
    input.append(factRows(model.inputs));

    const output = document.getElementById("stepSpecificOutputs");
    output.innerHTML = "";
    output.append(factRows(model.outputs));

    const known = document.getElementById("stepKnownBody");
    known.innerHTML = "";
    known.append(knownRows(model.knownFacts));

    document.getElementById("stepDirectValues").textContent = runtimeEventText(model.directEvents);
  }

  function decorateStepRows(stage) {
    document.querySelectorAll("#compactSteps .compactStep").forEach(row => {
      const index = Number(row.dataset.step || 0);
      const step = stage?.steps?.[index];
      const model = inspect(stage, index);
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.setAttribute("aria-label", `${step?.title || `Step ${index + 1}`}. ${model.status.label}.`);
      row.title = model.interpretation || "Inspect step evidence";

      let hint = row.querySelector(".stepIoHint");
      if (!hint) {
        hint = el("span", "stepIoHint");
        row.append(hint);
      }
      hint.textContent = model.status.label;
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
        "Each source step is evaluated separately. Click a step to see actual runtime fields, source-derived facts, and unresolved values for this run."
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
