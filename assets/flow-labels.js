(() => {
  // Exact relations used by the overview arrows. These labels mirror the fixed
  // v2026.7.1-2 source path; they are not inferred from visual adjacency.
  const RELATIONS = {
    "G0:G1": { kind: "call", label: "nested call" },
    "G1:G2": { kind: "return-chain", label: "return to G0 · then G2" },
    "G3:G4": { kind: "guard", label: "authorization guard" },
    "G4:G5": { kind: "data", label: "p.message" },
    "G6:G7": { kind: "data", label: "requestedAgentId + rawSessionKey" },
    "G7:G8": { kind: "data", label: "loaded Session state" },
    "G8:G9": { kind: "data", label: "selectedAgent.agentId" },
    "G10:G11": { kind: "guard", label: "policy guard" },
    "G11:G12": { kind: "guard", label: "dedupe fall-through" },
    "G13:G14": { kind: "data", label: "ctx" },
    "G14:G15": { kind: "call", label: "nested call" },
    "G16:G17": { kind: "internal", label: "internal resolution" },
    "G17:G18": { kind: "sequence", label: "G16 continues · later G18" },
  };

  function adjacentStageIds(arrow) {
    let from = arrow.previousElementSibling;
    while (from && !from.dataset?.id) from = from.previousElementSibling;
    let to = arrow.nextElementSibling;
    while (to && !to.dataset?.id) to = to.nextElementSibling;
    return [from?.dataset?.id || "", to?.dataset?.id || ""];
  }

  function decorateArrowLabels(root = document) {
    root.querySelectorAll?.('.connFlow > .arrow, .subflow > .arrow').forEach(arrow => {
      const [from, to] = adjacentStageIds(arrow);
      if (!from || !to) return;
      arrow.dataset.from = from;
      arrow.dataset.to = to;
      const relation = RELATIONS[`${from}:${to}`];
      if (!relation) return;

      arrow.dataset.flowKind = relation.kind;
      arrow.dataset.flowLabel = relation.label;
      arrow.classList.add("stageFlowArrow");

      let label = arrow.querySelector('.flowRelationLabel');
      if (!label) {
        label = document.createElement('span');
        label.className = 'flowRelationLabel';
        arrow.append(label);
      }
      if (label.textContent !== relation.label) label.textContent = relation.label;
    });
  }

  function install() {
    if (typeof renderAll === 'function') {
      const previous = renderAll;
      renderAll = function renderAllWithReadableFlowLabels(...args) {
        const result = previous(...args);
        requestAnimationFrame(() => decorateArrowLabels());
        return result;
      };
    }
    if (typeof renderSubflow === 'function') {
      const previousSubflow = renderSubflow;
      renderSubflow = function renderSubflowWithReadableFlowLabels(...args) {
        const result = previousSubflow(...args);
        requestAnimationFrame(() => decorateArrowLabels(document));
        return result;
      };
    }
    decorateArrowLabels();
  }

  window.GATEWAY_FLOW_RELATIONS = RELATIONS;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
