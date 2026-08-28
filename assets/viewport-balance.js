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

  function friendlyLabel(key) {
    if (key === "Agent") return "Route";
    if (key === "Resolver") return "Reply path";
    return key;
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
    if (title && title.textContent !== "Deeper Agent Run") {
      title.textContent = "Deeper Agent Run";
      title.title = "Deeper Reply / Agent Runtime";
    }

    let intro = runtimeBox.querySelector(":scope > .runtimeIntro");
    if (!intro && title) {
      intro = document.createElement("span");
      intro.className = "runtimeIntro";
      intro.textContent = "Reply handling after G18 · current run";
      title.insertAdjacentElement("afterend", intro);
    }

    [...runtimeBox.children].forEach(node => {
      if (!(node instanceof HTMLElement) || node.tagName !== "DIV") return;

      node.classList.add("runtimeFact");
      const key = node.querySelector("span");
      const code = node.querySelector("code");
      key?.classList.add("runtimeFactKey");
      code?.classList.add("runtimeFactValue");
      if (!key || !code) return;

      const sourceKey = node.dataset.runtimeSourceKey || key.textContent.trim();
      node.dataset.runtimeSourceKey = sourceKey;
      const rawValue = node.dataset.runtimeSourceValue || code.textContent.trim();
      if (!node.dataset.runtimeSourceValue) node.dataset.runtimeSourceValue = rawValue;

      const unavailable = !rawValue || rawValue.toLowerCase() === "not observed yet" || rawValue === "—";
      node.classList.toggle("runtimeDetailUnavailable", unavailable);

      const label = friendlyLabel(sourceKey);
      if (key.textContent !== label) key.textContent = label;

      if (unavailable) {
        if (code.textContent !== "Not captured") code.textContent = "Not captured";
        node.title = `No ${sourceKey.toLowerCase()} value was captured in this run.`;
        return;
      }

      if (sourceKey === "Agent") {
        const parts = rawValue.split(/\s*→\s*/).filter(Boolean);
        let friendlyValue = rawValue;
        if (parts.length === 2 && parts[0] === parts[1]) {
          friendlyValue = `${parts[0]} · unchanged`;
        } else if (parts.length === 2) {
          friendlyValue = `${parts[0]} → ${parts[1]}`;
        }
        if (code.textContent !== friendlyValue) code.textContent = friendlyValue;
        node.title = `Resolved Agent: ${rawValue}`;
        return;
      }

      if (sourceKey === "Resolver") {
        const friendlyValue = rawValue === "default_getReplyFromConfig" ? "Default" : rawValue;
        if (code.textContent !== friendlyValue) code.textContent = friendlyValue;
        node.title = `Resolver: ${rawValue}`;
        return;
      }

      if (code.textContent !== rawValue) code.textContent = rawValue;
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

    new MutationObserver(scheduleCompact).observe(pipeline, {
      childList:true,
      subtree:true
    });
    compactRuntimeBoundary();
  }
})();
