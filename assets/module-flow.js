(() => {
  /*
   * M1–M5 are viewer-level groupings. Their connectors therefore describe only
   * relations that are directly supported by the fixed G-stage/source path.
   * No connector invents a module return value that does not exist in OpenClaw.
   */
  const MODULE_FLOW = [
    {
      from: "M1",
      to: "M2",
      kind: "sequence",
      type: "SEQUENCE",
      label: "same chat.send handler",
      detail: "Request/session fields remain in handler scope; G6 follows G5. The normalized message is not passed into Agent selection.",
      source: "src/gateway/server-methods/chat.ts:3770–3808",
    },
    {
      from: "M2",
      to: "M3",
      kind: "data",
      type: "REUSE",
      label: "cfg · entry · sessionKey",
      detail: "Runtime control reuses Session state loaded in M2. G9's resolved agentId is not an argument to resolveSendPolicy().",
      source: "src/gateway/server-methods/chat.ts:3839–3905",
    },
    {
      from: "M3",
      to: "M4",
      kind: "guard",
      type: "GUARD",
      label: "admission passed",
      detail: "After admission succeeds, pre-dispatch preparation runs before G13 constructs MsgContext.",
      source: "src/gateway/server-methods/chat.ts:4025–4560",
    },
    {
      from: "M4",
      to: "M5",
      kind: "call-return",
      type: "CALL",
      label: "ctx: finalized",
      returnLabel: "DispatchFromConfigResult",
      detail: "G14 calls G15, receives FinalizedMsgContext, then invokes G16 with ctx: finalized. G16 later returns DispatchFromConfigResult to G14.",
      source: "src/auto-reply/dispatch.ts:544–583",
    },
  ];

  function makeConnector(flow) {
    const connector = document.createElement("div");
    connector.className = `moduleConnector ${flow.kind}`;
    connector.dataset.from = flow.from;
    connector.dataset.to = flow.to;
    connector.title = `${flow.detail}\n${flow.source}`;

    const type = document.createElement("span");
    type.className = "moduleConnectorType";
    type.textContent = flow.type;

    const forward = document.createElement("div");
    forward.className = "moduleConnectorForward";
    const forwardLine = document.createElement("span");
    forwardLine.className = "moduleConnectorLine";
    const forwardArrow = document.createElement("span");
    forwardArrow.className = "moduleConnectorArrow";
    forwardArrow.textContent = "→";
    forward.append(forwardLine, forwardArrow);

    const label = document.createElement("span");
    label.className = "moduleConnectorLabel";
    label.textContent = flow.label;

    connector.append(type, forward, label);

    if (flow.returnLabel) {
      const back = document.createElement("div");
      back.className = "moduleConnectorReturn";
      const backArrow = document.createElement("span");
      backArrow.className = "moduleConnectorReturnArrow";
      backArrow.textContent = "←";
      const backLine = document.createElement("span");
      backLine.className = "moduleConnectorReturnLine";
      back.append(backArrow, backLine);
      const returnLabel = document.createElement("span");
      returnLabel.className = "moduleConnectorReturnLabel";
      returnLabel.textContent = flow.returnLabel;
      connector.append(back, returnLabel);
    }

    const proof = document.createElement("span");
    proof.className = "moduleConnectorProof";
    proof.textContent = flow.source;
    connector.append(proof);
    return connector;
  }

  function decorateModules() {
    const root = document.getElementById("moduleRow");
    if (!root) return;
    root.classList.add("moduleFlowRow");
    root.querySelectorAll(":scope > .moduleConnector").forEach(node => node.remove());

    const modules = [...root.querySelectorAll(":scope > .module")];
    MODULE_FLOW.forEach(flow => {
      const from = modules.find(node => node.dataset.id === flow.from);
      const to = modules.find(node => node.dataset.id === flow.to);
      if (!from || !to) return;
      from.insertAdjacentElement("afterend", makeConnector(flow));
    });
  }

  function install() {
    if (typeof renderModules === "function") {
      const previous = renderModules;
      renderModules = function renderModulesWithConnections(...args) {
        const result = previous(...args);
        decorateModules();
        return result;
      };
    }
    decorateModules();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
