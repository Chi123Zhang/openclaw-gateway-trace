(() => {
  const outputCard = document.querySelector("section.output");
  const responsePanel = document.getElementById("responsePanel");
  const responseText = document.getElementById("responseText");
  const requestState = document.getElementById("requestState");
  const collectorState = document.getElementById("collectorState");
  if (!outputCard || !responsePanel || !responseText || !requestState) return;

  const outputValue = outputCard.querySelector("strong");
  const finish = outputCard.querySelector(".finish");
  if (!outputValue || !finish) return;

  function firstLine(text) {
    const line = String(text || "").split(/\r?\n/).map(x => x.trim()).find(Boolean) || "";
    if (!line) return "";
    return line.length > 110 ? `${line.slice(0, 107)}…` : line;
  }

  function sync() {
    const response = responseText.textContent.trim();
    const state = requestState.textContent.trim().toUpperCase();
    const collector = collectorState?.textContent?.trim() || "";

    if (response) {
      responsePanel.hidden = false;
      outputValue.textContent = firstLine(response) || "Assistant response captured";
      outputValue.title = response;
      finish.textContent = "RESPONSE READY";
      finish.style.color = "var(--good)";
      return;
    }

    if (state.includes("FAILED") || /failed|error/i.test(collector)) {
      outputValue.textContent = "No assistant response captured";
      finish.textContent = "ERROR";
      finish.style.color = "var(--bad)";
      return;
    }

    if (state.includes("FINISHED")) {
      // A finished trace without response content must never be presented as a
      // successful output. The collector now also rejects this false-complete case.
      outputValue.textContent = "Trace ended without assistant response";
      finish.textContent = "NO RESPONSE";
      finish.style.color = "var(--warn)";
      return;
    }

    if (state.includes("RUNNING") || state.includes("STARTING") || state.includes("PAUSED")) {
      outputValue.textContent = "Waiting for assistant response";
      finish.textContent = "PENDING";
      finish.style.color = "var(--muted)";
      return;
    }

    outputValue.textContent = "Awaiting run";
    finish.textContent = "IDLE";
    finish.style.color = "var(--muted)";
  }

  [responseText, requestState, collectorState].filter(Boolean).forEach(node => {
    new MutationObserver(sync).observe(node, { childList: true, subtree: true, characterData: true, attributes: true });
  });

  sync();
})();
