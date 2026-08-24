(() => {
  /* Align the G0 verified-flow panel with ConnectAuthState source semantics. */

  const normalizeEvidence = item => {
    const e = String(item?.evidence || "").toUpperCase();
    if (e === "RUNTIME") return "observed";
    if (e === "NATIVE") return "native";
    if (e === "REQUEST") return "request";
    if (e.includes("SOURCE")) return "derived";
    return "unknown";
  };

  function currentG0() {
    try { return window.byId?.G0 || null; } catch { return null; }
  }

  function inspect(index) {
    const stage = currentG0();
    return stage && window.GATEWAY_STEP_EVIDENCE?.inspect
      ? window.GATEWAY_STEP_EVIDENCE.inspect(stage, index)
      : { inputs: [], outputs: [], knownFacts: [] };
  }

  function findFact(key) {
    for (let index = 4; index >= 0; index -= 1) {
      const model = inspect(index);
      for (const item of [...(model.outputs || []), ...(model.inputs || []), ...(model.knownFacts || [])]) {
        if (item?.key !== key || !item?.observed) continue;
        if (/^not observed/i.test(String(item.value || ""))) continue;
        return item;
      }
    }
    return null;
  }

  function chip(text, tone) {
    const node = document.createElement("span");
    node.className = `stageHandoffChip ${tone || "unknown"}`;
    node.textContent = text;
    return node;
  }

  function renderFacts(container, specs) {
    if (!container) return;
    container.innerHTML = "";
    let missing = 0;
    specs.forEach(({ key, label }) => {
      const item = findFact(key);
      if (!item) {
        missing += 1;
        return;
      }
      const evidence = normalizeEvidence(item);
      const row = document.createElement("div");
      row.className = "stageHandoffFact known";
      const code = document.createElement("code");
      code.textContent = `${label} = ${item.value}`;
      row.append(code, chip(evidence, evidence));
      container.append(row);
    });
    if (!container.children.length) {
      const empty = document.createElement("div");
      empty.className = "stageHandoffEmpty";
      empty.textContent = "No runtime field is emitted at this boundary.";
      container.append(empty);
    }
    if (missing) {
      const node = document.createElement("span");
      node.className = "stageHandoffMissing";
      node.textContent = `${missing} field${missing > 1 ? "s" : ""} not observed`;
      container.append(node);
    }
  }

  function patchG0Panel() {
    let active = "";
    try { active = String(window.activeStage || ""); } catch {}
    if (active !== "G0") return;

    const root = document.getElementById("stageHandoffEdges");
    if (!root) return;
    const rows = [...root.querySelectorAll(":scope > .stageHandoffEdge")];
    if (rows.length < 2) return;

    const callRow = rows[0];
    const returnRow = rows[1];

    const callRelation = callRow.querySelector(".stageHandoffRelation");
    if (callRelation) callRelation.textContent = "nested call";
    renderFacts(callRow.querySelector(".stageHandoffData"), [
      { key: "authConfig", label: "auth mode" },
      { key: "sharedAuthProvided", label: "shared auth provided" },
    ]);
    const callExpr = callRow.querySelector(".stageHandoffExpr");
    if (callExpr) callExpr.textContent = "authorizeWsControlUiGatewayConnect({ auth: resolvedAuth, connectAuth: sharedConnectAuth, req, ... }) → authResult";
    const callNote = callRow.querySelector(".stageHandoffNote");
    if (callNote) callNote.textContent = "G1 is the nested authorization call inside resolveConnectAuthState. The call consumes resolved auth, normalized shared auth, and request/network context; it does not consume role/scopes.";

    const returnRelation = returnRow.querySelector(".stageHandoffRelation");
    if (returnRelation) returnRelation.textContent = "return ConnectAuthState";
    renderFacts(returnRow.querySelector(".stageHandoffData"), [
      { key: "authResult", label: "auth result" },
      { key: "authMethod", label: "auth method" },
      { key: "sharedAuthOk", label: "shared auth ok" },
      { key: "sharedAuthProvided", label: "shared auth provided" },
      { key: "bootstrapTokenCandidatePresent", label: "bootstrap-token candidate present" },
      { key: "deviceTokenCandidatePresent", label: "device-token candidate present" },
    ]);
    const returnExpr = returnRow.querySelector(".stageHandoffExpr");
    if (returnExpr) returnExpr.textContent = "resolveConnectAuthState(...) → ConnectAuthState { authResult, authOk, authMethod, sharedAuthOk, sharedAuthProvided, bootstrapTokenCandidate?, deviceTokenCandidate?, deviceTokenCandidateSource? }";
    const returnNote = returnRow.querySelector(".stageHandoffNote");
    if (returnNote) returnNote.textContent = "G0 resumes after the nested authorization/probe work and returns ConnectAuthState to message-handler. Role and scopes are handled later by the handshake/G2 path and are not G0 output fields.";
  }

  let queued = false;
  function schedulePatch() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      patchG0Panel();
    });
  }

  const observer = new MutationObserver(schedulePatch);
  const start = () => {
    const panel = document.getElementById("stageHandoffPanel") || document.body;
    observer.observe(panel, { childList: true, subtree: true });
    schedulePatch();
    document.addEventListener("click", schedulePatch);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
