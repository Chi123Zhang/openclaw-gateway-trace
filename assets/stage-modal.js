(() => {
  const detail = document.querySelector("section.detail");
  if (!detail) return;

  detail.classList.add("stageModalTarget");

  const backdrop = document.createElement("div");
  backdrop.className = "stageModalBackdrop";
  backdrop.setAttribute("aria-hidden", "true");
  document.body.append(backdrop);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "stageModalClose";
  close.setAttribute("aria-label", "Close stage detail");
  close.textContent = "×";
  detail.append(close);

  let lastTrigger = null;

  function openModal(trigger = null) {
    if (trigger) lastTrigger = trigger;
    document.body.classList.add("stageModalOpen");
    detail.setAttribute("role", "dialog");
    detail.setAttribute("aria-modal", "true");
    const title = document.getElementById("detailTitle");
    if (title?.id) detail.setAttribute("aria-labelledby", title.id);
    requestAnimationFrame(() => close.focus({ preventScroll: true }));
  }

  function closeModal() {
    document.body.classList.remove("stageModalOpen");
    detail.removeAttribute("role");
    detail.removeAttribute("aria-modal");
    detail.removeAttribute("aria-labelledby");
    if (lastTrigger && document.contains(lastTrigger)) {
      lastTrigger.focus?.({ preventScroll: true });
    }
  }

  close.addEventListener("click", closeModal);
  backdrop.addEventListener("click", closeModal);

  document.addEventListener("keydown", event => {
    if (!document.body.classList.contains("stageModalOpen")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
  });

  function bindStageNode(node) {
    if (!node || node.dataset.stageModalBound === "1") return;
    const id = node.dataset.id;
    if (!/^G\d+$/.test(id || "")) return;
    node.dataset.stageModalBound = "1";
    node.setAttribute("role", "button");
    if (!node.hasAttribute("tabindex")) node.tabIndex = 0;
    node.title = `Open ${id} details`;

    node.addEventListener("click", event => {
      // Existing handlers update activeStage first; open after that update finishes.
      requestAnimationFrame(() => openModal(node));
    });

    node.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (typeof selectStage === "function") selectStage(id);
      requestAnimationFrame(() => openModal(node));
    });
  }

  function bindAllStageNodes(root = document) {
    root.querySelectorAll?.('[data-id^="G"]').forEach(bindStageNode);
  }

  bindAllStageNodes();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('[data-id^="G"]')) bindStageNode(node);
        bindAllStageNodes(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // When tabs inside the modal switch G stages, keep the modal open and update in place.
  detail.addEventListener("click", event => {
    const stageNode = event.target.closest?.('[data-id^="G"]');
    if (!stageNode || !detail.contains(stageNode)) return;
    requestAnimationFrame(() => {
      if (document.body.classList.contains("stageModalOpen")) {
        detail.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
})();
