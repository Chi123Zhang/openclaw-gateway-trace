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
      if (toggle.textContent !== "Expand") toggle.textContent = "Expand";
      if (toggle.getAttribute("aria-expanded") !== "false") {
        toggle.setAttribute("aria-expanded", "false");
      }
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

    boundary.classList.add("runtimeBoundaryCompact");

    const grid = boundary.querySelector(".boundaryGrid");
    if (!grid) return;

    const boxes = grid.querySelectorAll(":scope > .boundaryBox");
    const legacyBox = boxes[0];
    const runtimeBox = boxes[1];
    const arrow = grid.querySelector(":scope > .returnArrow");

    legacyBox?.classList.add("runtimeBoundaryLegacy");
    arrow?.classList.add("runtimeBoundaryLegacy");
    if (!runtimeBox) return;

    runtimeBox.classList.add("runtimeBoundaryFacts");
    const title = runtimeBox.querySelector(":scope > strong");
    // Important: do not rewrite textContent when the value is already correct.
    // This function is called from a MutationObserver; an unconditional write
    // creates a childList mutation and can keep the browser in a microtask loop.
    if (title && title.textContent !== "Agent Runtime") {
      title.textContent = "Agent Runtime";
    }

    [...runtimeBox.children].forEach(node => {
      if (!(node instanceof HTMLElement) || node.tagName !== "DIV") return;

      node.classList.add("runtimeFact");
      const key = node.querySelector("span");
      const code = node.querySelector("code");
      key?.classList.add("runtimeFactKey");
      code?.classList.add("runtimeFactValue");

      const value = (code?.textContent || "").trim().toLowerCase();
      node.classList.toggle(
        "runtimeDetailUnavailable",
        !value || value === "not observed yet" || value === "—"
      );
    });
  }

  const pipeline = document.querySelector(".pipeline");
  if (pipeline) {
    let scheduled = false;
    const scheduleCompact = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        compactRuntimeBoundary();
      });
    };

    // live.js rebuilds the boundary by adding/removing child nodes. Observing
    // childList is sufficient; observing characterData here made self-triggered
    // mutations much easier to create and offered no extra runtime evidence.
    new MutationObserver(scheduleCompact).observe(pipeline, {
      childList:true,
      subtree:true
    });
    compactRuntimeBoundary();
  }
})();
