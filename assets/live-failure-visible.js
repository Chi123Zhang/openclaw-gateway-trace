(() => {
  const requestState = document.getElementById("requestState");
  const message = document.getElementById("runMessage");
  const responsePanel = document.getElementById("responsePanel");
  const responseText = document.getElementById("responseText");
  if (!requestState || !message || !responsePanel || !responseText) return;

  function syncFailureText() {
    const state = String(requestState.textContent || "").trim().toUpperCase();
    if (state !== "FAILED") return;

    const detail = String(message.textContent || "")
      .replace(/^Run failed:\s*/i, "")
      .trim();
    if (!detail) return;

    const current = String(responseText.textContent || "").trim();
    if (current && !/^Run failed before assistant response\./i.test(current)) return;

    responsePanel.hidden = false;
    responseText.textContent = `Run failed before assistant response.\n\n${detail}`;
  }

  [requestState, message].forEach(node => {
    new MutationObserver(syncFailureText).observe(node, {
      childList: true,
      subtree: true,
      characterData: true
    });
  });

  syncFailureText();
})();
