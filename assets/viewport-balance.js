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
    if (title && title.textContent !== "Reply execution") {
      title.textContent = "Reply execution";
      title.title = "Deeper Reply / Agent Runtime";
    }

    [...runtimeBox.children].forEach(node => {
      if (!(node instanceof HTMLElement) || node.tagName !== "DIV") return;

      node.classList.add("runtimeFact");
      const key = node.querySelector("span");
      const code = node.querySelector("code");
      key?.classList.add("runtimeFactKey");
      code?.classList.add("runtimeFactValue");

      const rawKey = (key?.textContent || "").trim();
      const rawValue = (code?.textContent || "").trim();
      const normalized = rawValue.toLowerCase();

      node.classList.toggle(
        "runtimeDetailUnavailable",
        !rawValue || normalized === "not observed yet" || rawValue === "—"
      );

      if (!key || !code || node.classList.contains("runtimeDetailUnavailable")) return;

      if (rawKey === "Agent") {
        const technicalValue = rawValue;
        let friendlyValue = rawValue;
        const parts = rawValue.split(/\s*→\s*/).filter(Boolean);
        if (parts.length === 2 && parts[0] === parts[1]) {
          friendlyValue = `${parts[0]} · unchanged`;
        } else if (parts.length === 2) {
          friendlyValue = `${parts[0]} → ${parts[1]}`;
        }
        key.textContent = "Agent";
        if (code.textContent !== friendlyValue) code.textContent = friendlyValue;
        node.title = `Resolved Agent: ${technicalValue}`;
      }

      if (rawKey === "Resolver") {
        const technicalValue = rawValue;
        key.textContent = "Reply method";
        const friendlyValue = technicalValue === "default_getReplyFromConfig"
          ? "Default"
          : technicalValue;
        if (code.textContent !== friendlyValue) code.textContent = friendlyValue;
        node.title = `Resolver: ${technicalValue}`;
      }

      if (rawKey === "Provider") key.textContent = "Provider";
      if (rawKey === "Model") key.textContent = "Model";
      if (rawKey === "Tools") key.textContent = "Tools";
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
