(() => {
  function stageNumber(id) {
    const n = Number(String(id || "").replace("G", ""));
    return Number.isFinite(n) ? n : -1;
  }

  function executionState() {
    const text = document.getElementById("requestState")?.textContent || "";
    if (/RUNNING|STARTING|PAUSED/.test(text)) return "active";
    if (/FINISHED/.test(text)) return "finished";
    try { if (playing) return "active"; } catch {}
    return "idle";
  }

  function clearArrowState(node) {
    node.classList.remove("flowCurrent", "flowDone", "flowPending");
  }

  function applyStageArrows(root) {
    root?.querySelectorAll?.(":scope > .stageFlowArrow").forEach(arrow => {
      clearArrowState(arrow);
      const from = arrow.dataset.from || "";
      const to = arrow.dataset.to || "";
      const state = executionState();

      if (state === "idle") {
        arrow.classList.add("flowPending");
        return;
      }

      // The lit connector is the connector by which the current stage was reached.
      // Completed connectors remain visible, but less prominent.
      if (activeStage === to) {
        arrow.classList.add("flowCurrent");
        return;
      }

      const toCompleted = (() => {
        try { return completed.has(to); } catch { return false; }
      })();
      const passedByOrder = stageNumber(activeStage) > stageNumber(to) && stageNumber(to) >= 0;
      if (toCompleted || passedByOrder || state === "finished") arrow.classList.add("flowDone");
      else arrow.classList.add("flowPending");
    });
  }

  function moduleOrder(id) {
    const n = Number(String(id || "").replace("M", ""));
    return Number.isFinite(n) ? n : -1;
  }

  function applyModuleArrows() {
    document.querySelectorAll("#moduleRow > .moduleConnector").forEach(connector => {
      connector.classList.remove("flowCurrent", "flowDone", "flowPending", "returnCurrent", "returnDone");
      const state = executionState();
      const to = connector.dataset.to;
      if (state === "idle") {
        connector.classList.add("flowPending");
        return;
      }

      if (activeModule === to) connector.classList.add("flowCurrent");
      else {
        const toCompleted = (() => { try { return completed.has(to); } catch { return false; } })();
        const passedByModule = moduleOrder(activeModule) > moduleOrder(to) && moduleOrder(to) >= 0;
        if (toCompleted || passedByModule || state === "finished") connector.classList.add("flowDone");
        else connector.classList.add("flowPending");
      }

      if (connector.classList.contains("call-return")) {
        if (state === "finished") connector.classList.add("returnDone");
        else if (activeModule === "M5" && /G18/.test(String(activeStage))) connector.classList.add("returnCurrent");
      }
    });
  }

  function removeConnectionRequestBridge() {
    document.getElementById("connectionRequestBridge")?.remove();
  }

  function refreshProgress() {
    applyStageArrows(document.getElementById("connFlow"));
    applyStageArrows(document.getElementById("subflow"));
    applyModuleArrows();
    // Presentation-only: the standalone G2 -> G3 prerequisite strip is intentionally omitted.
    removeConnectionRequestBridge();
  }

  function install() {
    if (typeof renderAll === "function") {
      const previous = renderAll;
      renderAll = function renderAllWithFlowProgress(...args) {
        const result = previous(...args);
        requestAnimationFrame(() => requestAnimationFrame(refreshProgress));
        return result;
      };
    }

    const requestState = document.getElementById("requestState");
    if (requestState) {
      const observer = new MutationObserver(refreshProgress);
      observer.observe(requestState, { childList: true, characterData: true, subtree: true });
    }

    removeConnectionRequestBridge();
    requestAnimationFrame(() => requestAnimationFrame(refreshProgress));
  }

  window.refreshGatewayFlowProgress = refreshProgress;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
