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
