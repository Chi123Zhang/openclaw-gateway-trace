(() => {
  if (typeof applyCaseMeta !== "function") return;

  applyCaseMeta = function applyCaseMeta() {
    const meta = ACTIVE_CASE?.meta || {};
    CASE2 = meta;
    document.title = `OpenClaw Gateway · ${meta.title || "Trace"}`;

    const queryText = document.getElementById("queryText");
    if (queryText) queryText.textContent = meta.prompt || meta.title || "—";

    const ackValue = document.getElementById("ackValue");
    if (ackValue) ackValue.textContent = meta.ack || "—";

    const titleSyncValue = document.getElementById("titleSyncValue");
    if (titleSyncValue) titleSyncValue.textContent = meta.titleSync || "—";

    const resolverBoundaryText = document.getElementById("resolverBoundaryText");
    if (resolverBoundaryText) {
      resolverBoundaryText.innerHTML = `resolver: <code>${meta.resolverSource || meta.resolver || "—"}</code>`;
    }
  };
})();
