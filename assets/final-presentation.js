(() => {
  /* Small presentation-only refinements.
   * No trace/state values are changed. Observers are intentionally scoped to
   * the two tiny regions they format so they cannot trigger page-wide loops.
   */

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function updateExpandedModulePresentation() {
    const expand = document.querySelector(".pipeline .expand");
    const title = document.getElementById("expandTitle");
    if (!expand || !title) return;

    const text = normalizeText(title.textContent).toUpperCase();
    // The dedicated Connection/Handshake strip already displays G0-G2. Showing
    // the same three cards again underneath the module path is redundant.
    const redundantConnection = text.startsWith("CONN") || text.includes("CONNECTION");
    expand.classList.toggle("presentationRedundantConnection", redundantConnection);
  }

  function updateRuntimeContextPresentation() {
    const sidebar = document.querySelector(".sidebar");
    const block = sidebar?.querySelector(".contextBlock");
    if (!sidebar || !block) return;

    let visibleRows = 0;
    block.querySelectorAll(".ctxRow").forEach(row => {
      const value = normalizeText(row.querySelector(".ctxValue")?.textContent);
      const empty = !value || value === "—" || value.toLowerCase() === "not captured";
      row.classList.toggle("presentationEmptyContext", empty);
      if (!empty) visibleRows += 1;
    });

    const emptyBlock = visibleRows === 0;
    sidebar.classList.toggle("presentationContextEmpty", emptyBlock);

    const titles = [...sidebar.querySelectorAll(".sideTitle")];
    const contextTitle = titles.find(node => normalizeText(node.textContent).toLowerCase() === "runtime context");
    if (contextTitle) contextTitle.classList.add("presentationContextTitle");
  }

  const expandTitle = document.getElementById("expandTitle");
  if (expandTitle) {
    new MutationObserver(updateExpandedModulePresentation).observe(expandTitle, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  const contextBlock = document.querySelector(".sidebar .contextBlock");
  if (contextBlock) {
    new MutationObserver(updateRuntimeContextPresentation).observe(contextBlock, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  updateExpandedModulePresentation();
  updateRuntimeContextPresentation();
})();
