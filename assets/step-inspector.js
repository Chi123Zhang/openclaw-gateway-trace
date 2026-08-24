(() => {
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function currentStage() {
    try {
      return byId?.[activeStage] || null;
    } catch {
      return null;
    }
  }

  function evidenceTone(label) {
    const value = String(label || "").toUpperCase();
    if (value.includes("RUNTIME") || value.includes("NATIVE")) return "observed";
    if (value.includes("SOURCE")) return "source";
    return "neutral";
  }

  function prettyValue(value) {
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function runtimeEvents(stage) {
    return Array.isArray(stage?.runtimeEvents) ? stage.runtimeEvents : [];
  }

  function eventsForStep(stage, stepIndex) {
    return runtimeEvents(stage).filter(event => Number(event?.stepIndex) === stepIndex);
  }

  function eventFieldsText(events) {
    if (!events.length) return "—";
    return events.map((item, index) => {
      const header = [
        `${index + 1}. ${item.event || "runtime event"}`,
        item.ts ? `@ ${item.ts}` : "",
        item.phase ? `[${item.phase}]` : "",
      ].filter(Boolean).join(" ");
      const fields = Object.entries(item.fields || {})
        .map(([key, value]) => `${key} = ${prettyValue(value)}`)
        .join("\n");
      return `${header}${fields ? `\n${fields}` : ""}`;
    }).join("\n\n");
  }

  function stageRuntimeText(stage) {
    const events = runtimeEvents(stage);
    if (!events.length) return "No TraceClaw runtime event was captured for this stage.";
    return eventFieldsText(events);
  }

  function ensureInspector() {
    const compact = document.getElementById("compactSteps");
    if (!compact) return null;

    let panel = document.getElementById("stepIoPanel");
    if (panel) return panel;

    panel = el("section", "stepIoPanel");
    panel.id = "stepIoPanel";

    const head = el("div", "stepIoHead");
    const headText = el("div", "stepIoHeadText");
    headText.append(el("div", "stepIoEyebrow", "Selected step"));
    const title = el("div", "stepIoTitle", "Select a step");
    title.id = "stepIoTitle";
    headText.append(title);
    const source = el("div", "stepIoSource");
    source.id = "stepIoSource";
    head.append(headText, source);

    const runtimeBox = el("div", "stepRuntimeBox");
    const runtimeHead = el("div", "stepIoBoxHead");
    runtimeHead.append(el("span", "stepIoBoxLabel", "Direct runtime observations"));
    const runtimeEvidence = el("span", "stepIoEvidence neutral", "NOT OBSERVED");
    runtimeEvidence.id = "stepRuntimeEvidence";
    runtimeHead.append(runtimeEvidence);
    const runtimeValues = el("pre", "stepIoValues stepRuntimeValues", "—");
    runtimeValues.id = "stepRuntimeValues";
    runtimeBox.append(runtimeHead, runtimeValues);

    const grid = el("div", "stepIoGrid");

    const inputBox = el("div", "stepIoBox");
    const inputHead = el("div", "stepIoBoxHead");
    inputHead.append(el("span", "stepIoBoxLabel", "Stage input context"));
    const inputEvidence = el("span", "stepIoEvidence", "—");
    inputEvidence.id = "stepIoInputEvidence";
    inputHead.append(inputEvidence);
    const input = el("pre", "stepIoValues", "—");
    input.id = "stepIoInput";
    inputBox.append(inputHead, input);

    const outputBox = el("div", "stepIoBox");
    const outputHead = el("div", "stepIoBoxHead");
    outputHead.append(el("span", "stepIoBoxLabel", "Stage output context"));
    const outputEvidence = el("span", "stepIoEvidence", "—");
    outputEvidence.id = "stepIoOutputEvidence";
    outputHead.append(outputEvidence);
    const output = el("pre", "stepIoValues", "—");
    output.id = "stepIoOutput";
    outputBox.append(outputHead, output);

    grid.append(inputBox, outputBox);

    const stageBox = el("details", "stageRuntimeDetails");
    const summary = el("summary", "stageRuntimeSummary", "All runtime events for this stage");
    const stageValues = el("pre", "stepIoValues stageRuntimeValues", "—");
    stageValues.id = "stageRuntimeValues";
    stageBox.append(summary, stageValues);

    const note = el(
      "div",
      "stepIoNote",
      "Direct runtime observations are shown only when the TraceClaw event itself is tagged to this source step. Stage input/output context remains separately labeled because it may include request-known or source-derived values."
    );

    panel.append(head, runtimeBox, grid, stageBox, note);
    compact.insertAdjacentElement("afterend", panel);
    return panel;
  }

  function updateInspector(stage = currentStage()) {
    const panel = ensureInspector();
    if (!panel || !stage) return;

    const stepIndex = Math.max(0, Math.min(Number(activeStep) || 0, Math.max(0, stage.steps.length - 1)));
    const step = stage.steps[stepIndex] || {};
    const directEvents = eventsForStep(stage, stepIndex);
    const allEvents = runtimeEvents(stage);

    document.getElementById("stepIoTitle").textContent = `${stage.id} · ${stepIndex + 1}. ${step.title || "Step"}`;
    document.getElementById("stepIoSource").textContent = step.source || "";

    const runtimeEvidence = document.getElementById("stepRuntimeEvidence");
    const runtimeValues = document.getElementById("stepRuntimeValues");
    if (directEvents.length) {
      runtimeEvidence.textContent = `RUNTIME · ${directEvents.length} EVENT${directEvents.length > 1 ? "S" : ""}`;
      runtimeEvidence.className = "stepIoEvidence observed";
      runtimeValues.textContent = eventFieldsText(directEvents);
    } else {
      runtimeEvidence.textContent = "NO DIRECT STEP EVENT";
      runtimeEvidence.className = "stepIoEvidence neutral";
      runtimeValues.textContent = allEvents.length
        ? "This stage has runtime evidence, but the current instrumentation does not tag any event to this exact source sub-step. See “All runtime events for this stage” below."
        : "No TraceClaw runtime event was captured for this stage in the current run.";
    }

    document.getElementById("stepIoInput").textContent = stage.concreteInput || "—";
    document.getElementById("stepIoOutput").textContent = stage.concreteOutput || "—";
    document.getElementById("stageRuntimeValues").textContent = stageRuntimeText(stage);

    const inputEvidence = document.getElementById("stepIoInputEvidence");
    const outputEvidence = document.getElementById("stepIoOutputEvidence");
    inputEvidence.textContent = stage.concreteInputEvidence || "NOT OBSERVED";
    outputEvidence.textContent = stage.concreteOutputEvidence || "NOT OBSERVED";
    inputEvidence.className = `stepIoEvidence ${evidenceTone(stage.concreteInputEvidence)}`;
    outputEvidence.className = `stepIoEvidence ${evidenceTone(stage.concreteOutputEvidence)}`;
  }

  function decorateStepRows(stage) {
    document.querySelectorAll("#compactSteps .compactStep").forEach(row => {
      const index = Number(row.dataset.step || 0);
      const step = stage?.steps?.[index];
      const directCount = eventsForStep(stage, index).length;
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.setAttribute("aria-label", `${step?.title || `Step ${index + 1}`}. Inspect runtime evidence.`);
      row.title = directCount
        ? `${directCount} direct runtime event${directCount > 1 ? "s" : ""}`
        : "No direct runtime event for this sub-step";

      let hint = row.querySelector(".stepIoHint");
      if (!hint) {
        hint = el("span", "stepIoHint");
        row.append(hint);
      }
      hint.textContent = directCount ? `${directCount} runtime` : "stage evidence";
      hint.classList.toggle("observed", directCount > 0);

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

    const processHeading = document.querySelector(".processTop h4");
    if (processHeading) processHeading.textContent = "Execution steps";

    const summary = document.getElementById("process");
    if (summary && !document.getElementById("stepFlowHint")) {
      const hint = el("div", "stepFlowHint", "Select a step to inspect direct runtime observations. Source-derived context is shown separately and never presented as measured runtime data.");
      hint.id = "stepFlowHint";
      summary.insertAdjacentElement("afterend", hint);
    }

    const stage = currentStage();
    if (stage) {
      originalRenderSteps(stage);
      decorateStepRows(stage);
      updateInspector(stage);
    } else {
      ensureInspector();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
