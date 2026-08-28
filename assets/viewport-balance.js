(() => {
  /* Presentation-only helpers for the one-page live view. */

  const responsePanel = document.getElementById("responsePanel");
  const responseText = document.getElementById("responseText");

  function collapseResponse() {
    if (!responsePanel || !responseText || !responseText.textContent.trim()) return;
    responsePanel.classList.add("responseCollapsed");
    responsePanel.classList.remove("responseExpanded");
    const toggle = responsePanel.querySelector(".responseExpandToggle");
    if (toggle) {
      toggle.textContent = "Expand";
      toggle.setAttribute("aria-expanded", "false");
    }
  }

  if (responseText) {
    let lastText = responseText.textContent;
    new MutationObserver(() => {
      const next = responseText.textContent;
      if (next !== lastText) {
        lastText = next;
        collapseResponse();
      }
    }).observe(responseText, { childList:true, subtree:true, characterData:true });
    collapseResponse();
  }

  function compactRuntimeBoundary() {
    const boundary = document.querySelector(".pipeline .boundary");
    if (!boundary) return;
    const boxes = boundary.querySelectorAll(".boundaryBox");
    const runtimeBox = boxes[1];
    if (!runtimeBox) return;

    [...runtimeBox.children].forEach(node => {
      if (!(node instanceof HTMLElement) || node.tagName === "STRONG") return;
      if (node.tagName !== "DIV") return;

      node.classList.add("runtimeCompactRow");
      const code = node.querySelector("code");
      const value = (code?.textContent || "").trim().toLowerCase();
      if (!value || value === "not observed yet") {
        node.classList.add("runtimeDetailUnavailable");
      } else {
        node.classList.remove("runtimeDetailUnavailable");
      }
    });
  }

  const pipeline = document.querySelector(".pipeline");
  if (pipeline) {
    new MutationObserver(compactRuntimeBoundary).observe(pipeline, { childList:true, subtree:true, characterData:true });
    compactRuntimeBoundary();
  }
})();
