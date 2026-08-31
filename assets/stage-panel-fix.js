(() => {
  const detail = document.querySelector("section.detail.stageModalTarget");
  if (!detail) return;

  function enforcePanelFrame() {
    detail.style.setProperty("position", "fixed", "important");
    detail.style.setProperty("inset", "auto", "important");
    detail.style.setProperty("left", "50%", "important");
    detail.style.setProperty("top", "50%", "important");
    detail.style.setProperty("transform", "translate(-50%, -50%)", "important");
    detail.style.setProperty("margin", "0", "important");
  }

  function resetPanelScroll() {
    if (!document.body.classList.contains("stageModalOpen")) return;
    enforcePanelFrame();
    detail.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  let wasOpen = document.body.classList.contains("stageModalOpen");
  const classObserver = new MutationObserver(() => {
    const isOpen = document.body.classList.contains("stageModalOpen");
    if (isOpen && !wasOpen) {
      requestAnimationFrame(() => {
        resetPanelScroll();
        requestAnimationFrame(resetPanelScroll);
      });
    }
    wasOpen = isOpen;
  });
  classObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  document.addEventListener("click", event => {
    const stageTrigger = event.target.closest?.('[data-id^="G"]');
    const pageTrigger = event.target.closest?.(".stagePageTab");
    if (!stageTrigger && !pageTrigger) return;

    requestAnimationFrame(() => {
      resetPanelScroll();
      requestAnimationFrame(resetPanelScroll);
    });
  });
})();
