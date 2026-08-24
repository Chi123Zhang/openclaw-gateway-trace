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

  function parseLines(raw) {
    return String(raw || "—")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);
  }

  function keywords(step) {
    const text = `${step?.title || ""} ${step?.detail || ""} ${step?.code || ""}`.toLowerCase();
    return new Set(
      text
        .replace(/[^a-z0-9_]+/g, " ")
        .split(/\s+/)
        .filter(token => token.length >= 4)
    );
  }

  function lineScore(line, words) {
    const normalized = line.toLowerCase().replace(/[^a-z0-9_]+/g, " ");
    let score = 0;
    words.forEach(word => {
      if (normalized.includes(word)) score += word.length >= 8 ? 2 : 1;
    });
    return score;
  }

  // The stage payload already contains the concrete values that were actually
  // observed or source-derived for this run. Prefer lines related to the selected
  // source step, but never manufacture a value that is absent from the stage data.
  function valuesForStep(raw, step) {
    const lines = parseLines(raw);
    if (lines.length <= 5 || lines[0] === "—") return lines.join("\n");

    const words = keywords(step);
    const ranked = lines
      .map((line, index) => ({ line, index, score: lineScore(line, words) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 5)
      .sort((a, b) => a.index - b.index)
      .map(item => item.line);

    return (ranked.length ? ranked : lines.slice(0, 5)).join("\n");
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

    const grid = el("div", "stepIoGrid");

    const inputBox = el("div", "stepIoBox");
    const inputHead = el("div", "stepIoBoxHead");
    inputHead.append(el("span", "stepIoBoxLabel", "Input values"));
    const inputEvidence = el("span", "stepIoEvidence", "—");
    inputEvidence.id = "stepIoInputEvidence";
    inputHead.append(inputEvidence);
    const input = el("pre", "stepIoValues", "—");
    input.id = "stepIoInput";
    inputBox.append(inputHead, input);

    const outputBox = el("div", "stepIoBox");
    const outputHead = el("div", "stepIoBoxHead");
    outputHead.append(el("span", "stepIoBoxLabel", "Output values"));
    const outputEvidence = el("span", "stepIoEvidence", "—");
    outputEvidence.id = "stepIoOutputEvidence";
    outputHead.append(outputEvidence);
    const output = el("pre", "stepIoValues", "—");
    output.id = "stepIoOutput";
    outputBox.append(outputHead, output);

    grid.append(inputBox, outputBox);

    const note = el(
      "div",
      "stepIoNote",
      "Values come from the current run's stage evidence. If a sub-step has no standalone runtime field, the evidence label remains SOURCE or SOURCE-DERIVED rather than being presented as observed runtime data."
    );

    panel.append(head, grid, note);
    compact.insertAdjacentElement("afterend", panel);
    return panel;
  }

  function updateInspector(stage = currentStage()) {
    const panel = ensureInspector();
    if (!panel || !stage) return;

    const stepIndex = Math.max(0, Math.min(Number(activeStep) || 0, Math.max(0, stage.steps.length - 1)));
    const step = stage.steps[stepIndex] || {};

    document.getElementById("stepIoTitle").textContent = `${stage.id} · ${stepIndex + 1}. ${step.title || "Step"}`;
    document.getElementById("stepIoSource").textContent = step.source || "";
    document.getElementById("stepIoInput").textContent = valuesForStep(stage.concreteInput, step) || "—";
    document.getElementById("stepIoOutput").textContent = valuesForStep(stage.concreteOutput, step) || "—";

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
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.setAttribute("aria-label", `${step?.title || `Step ${index + 1}`}. Show input and output values.`);
      row.title = "Show input and output values";

      if (!row.querySelector(".stepIoHint")) {
        row.append(el("span", "stepIoHint", "Input / Output"));
      }

      const select = () => {
        activeStep = index;
        renderSteps(stage);
        renderBreadcrumb(stage);
        updateInspector(stage);
      };

      // Replace the old behavior that automatically opened the long source panel.
      // Source detail remains available through its explicit toggle below.
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
      const hint = el("div", "stepFlowHint", "Select any step to inspect the concrete input and output values for the current run.");
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
