(() => {
  /*
   * Presentation-only summary of the verified G2 -> G3 relationship.
   *
   * Source truth (OpenClaw v2026.7.1-2): G2 completes the authenticated
   * WebSocket connection. G3 belongs to a later chat.send request and reads
   * client.connect metadata established by that handshake. This is therefore a
   * PREREQUISITE relation, not a direct function/data handoff.
   */

  const root = document.getElementById("moduleRow");
  if (!root) return;

  function decorate() {
    const connection = root.querySelector(':scope > .module[data-id="CONN"]');
    const request = root.querySelector(':scope > .module[data-id="M1"]');
    if (!connection || !request) return;

    let connector = connection.nextElementSibling;
    if (!connector?.classList?.contains("moduleConnector")) {
      connector = document.createElement("div");
      connection.insertAdjacentElement("afterend", connector);
    }

    connector.className = "moduleConnector pillarConnectionConnector prerequisite connectionRequestHandoff";
    connector.dataset.from = "CONN";
    connector.dataset.to = "M1";
    connector.dataset.relation = "prerequisite";
    connector.removeAttribute("aria-hidden");
    connector.setAttribute("role", "img");
    connector.setAttribute(
      "aria-label",
      "Prerequisite: authenticated connection is ready before the later chat.send request"
    );
    connector.title = [
      "PREREQUISITE · authenticated connection -> later chat.send request",
      "G2 completes the WebSocket connection; G3 authorizes a later request on that authenticated connection.",
      "Source: message-handler.ts handshake path; src/gateway/server-methods.ts authorizeGatewayMethod"
    ].join("\n");

    if (connector.dataset.handoffDecorated === "1") return;
    connector.dataset.handoffDecorated = "1";
    connector.replaceChildren();

    const from = document.createElement("span");
    from.className = "connectionRequestFrom";
    from.textContent = "AUTH READY";

    const forward = document.createElement("div");
    forward.className = "moduleConnectorForward connectionRequestForward";
    const line = document.createElement("span");
    line.className = "moduleConnectorLine";
    const arrow = document.createElement("span");
    arrow.className = "moduleConnectorArrow";
    arrow.textContent = "→";
    forward.append(line, arrow);

    const to = document.createElement("span");
    to.className = "connectionRequestTo";
    to.textContent = "chat.send";

    const type = document.createElement("span");
    type.className = "connectionRequestType";
    type.textContent = "PREREQ";

    connector.append(from, forward, to, type);
  }

  const observer = new MutationObserver(() => decorate());
  observer.observe(root, { childList: true });

  decorate();
  requestAnimationFrame(decorate);
})();

(() => {
  /*
   * Live-view evidence guard.
   *
   * A normal viewer page must never show values from a previously loaded saved
   * case before the user starts a new live run. Before STARTING/RUNNING, Flow
   * and Steps are therefore presented strictly as the fixed source model.
   * Explicit ?reference=1 pages are intentionally excluded because those pages
   * are meant to display a completed published/saved trace.
   *
   * Presentation only: no trace data, instrumentation, collector state, or
   * source mapping is changed here.
   */

  const STYLE_ID = "traceclaw-idle-evidence-guard-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html.traceclawIdleEvidence .stageHandoffData > *{
        display:none!important;
      }
      html.traceclawIdleEvidence .stageHandoffData::before{
        content:"No current-run evidence yet.";
        display:block;
        padding:8px 10px;
        color:#7f8b94;
        font:600 9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;
      }
      html.traceclawIdleEvidence #compactSteps .stepFlowFacts{
        display:none!important;
      }
      html.traceclawIdleEvidence #stepIoPanel .stepSpecificGrid,
      html.traceclawIdleEvidence #stepKnownSection,
      html.traceclawIdleEvidence #stepDirectDetails{
        display:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function isReferenceMode() {
    if (document.documentElement.classList.contains("referenceMode")) return true;
    try {
      return new URLSearchParams(window.location.search).get("reference") === "1";
    } catch {
      return false;
    }
  }

  function requestState() {
    return String(document.getElementById("requestState")?.textContent || "")
      .trim()
      .toUpperCase();
  }

  function hasCurrentLiveExecution() {
    if (isReferenceMode()) return true;
    return /^(?:STARTING|RUNNING|PAUSED|FINISHED|FAILED)/.test(requestState());
  }

  function forceSourceModelLabels() {
    const contextTitle = document.querySelector(".runEvidenceContextTitle");
    const contextText = document.querySelector(".runEvidenceContextText");
    if (contextTitle) contextTitle.textContent = "SOURCE MODEL";
    if (contextText) {
      contextText.textContent = "No runtime execution has been observed yet. Run a trace to overlay the actual execution path.";
    }

    const flowEyebrow = document.querySelector("#stageHandoffPanel .stageHandoffEyebrow");
    if (flowEyebrow) flowEyebrow.textContent = "SOURCE MODEL";

    document.querySelectorAll("#stageHandoffPanel .stageHandoffRoute > .runEvidenceBadge").forEach(badge => {
      badge.textContent = "SOURCE MODEL";
      badge.className = "runEvidenceBadge sourceModel";
    });

    document.querySelectorAll("#compactSteps .compactStep .stepIoHint").forEach(hint => {
      hint.textContent = "Source model";
      hint.className = "stepIoHint source";
    });

    document.querySelectorAll("#sourceStepList .sourceStepItem > .runEvidenceBadge").forEach(badge => {
      badge.textContent = "SOURCE MODEL";
      badge.className = "runEvidenceBadge sourceModel";
    });

    const chip = document.getElementById("stepStatusChip");
    if (chip) {
      chip.textContent = "Source model";
      chip.className = "stepStatusChip source";
    }

    const runResult = document.getElementById("stepRunResult");
    if (runResult) {
      runResult.textContent = "No runtime execution has been observed yet. This step is shown from the fixed v2026.7.1-2 source model.";
    }
  }

  function syncIdleEvidenceGuard() {
    const idle = !hasCurrentLiveExecution();
    document.documentElement.classList.toggle("traceclawIdleEvidence", idle);
    if (idle) forceSourceModelLabels();
  }

  if (typeof renderAll === "function") {
    const previousRenderAll = renderAll;
    renderAll = function renderAllWithIdleEvidenceGuard(...args) {
      const result = previousRenderAll(...args);
      requestAnimationFrame(syncIdleEvidenceGuard);
      return result;
    };
  }

  if (typeof renderSteps === "function") {
    const previousRenderSteps = renderSteps;
    renderSteps = function renderStepsWithIdleEvidenceGuard(...args) {
      const result = previousRenderSteps(...args);
      requestAnimationFrame(syncIdleEvidenceGuard);
      return result;
    };
  }

  const stateNode = document.getElementById("requestState");
  if (stateNode) {
    new MutationObserver(syncIdleEvidenceGuard).observe(stateNode, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  document.addEventListener("click", event => {
    if (!event.target.closest?.('[data-id^="G"], .stagePageTab')) return;
    requestAnimationFrame(syncIdleEvidenceGuard);
  });

  syncIdleEvidenceGuard();
  requestAnimationFrame(syncIdleEvidenceGuard);
})();
