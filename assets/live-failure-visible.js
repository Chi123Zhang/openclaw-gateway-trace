(() => {
  const requestState = document.getElementById("requestState");
  const message = document.getElementById("runMessage");
  const responsePanel = document.getElementById("responsePanel");
  const responseText = document.getElementById("responseText");
  if (!requestState || !message || !responsePanel || !responseText) return;

  function failureDetail() {
    const detail = String(message.textContent || "")
      .replace(/^Run failed:\s*/i, "")
      .trim();
    return detail || "The live run ended before an assistant response was captured.";
  }

  function syncFailureText() {
    const state = String(requestState.textContent || "").trim().toUpperCase();
    if (state !== "FAILED") return;

    responsePanel.hidden = false;
    responseText.textContent = `Run failed before assistant response.\n\n${failureDetail()}`;
  }

  [requestState, message].forEach(node => {
    new MutationObserver(syncFailureText).observe(node, {
      childList: true,
      subtree: true,
      characterData: true
    });
  });

  window.addEventListener("traceclaw:collector-state", syncFailureText);
  window.addEventListener("focus", syncFailureText);
  window.setInterval(syncFailureText, 500);
  syncFailureText();
})();
