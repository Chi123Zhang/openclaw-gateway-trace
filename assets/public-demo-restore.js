(() => {
  const LEGACY_STYLE_ID = "traceclaw-public-demo-restore";
  const CLEANUP_STYLE_ID = "traceclaw-public-demo-cleanup";
  const PANEL_ID = "publicAgentRuntimePanel";

  function installCleanupStyle() {
    document.getElementById(LEGACY_STYLE_ID)?.remove();

    if (document.getElementById(CLEANUP_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = CLEANUP_STYLE_ID;
    style.textContent = `
      /* Keep the original compact, one-row Deeper Agent Run boundary.
         The temporary large public runtime panel is intentionally removed. */
      #publicAgentRuntimePanel {
        display: none !important;
      }

      @media (min-width: 1041px) {
        .pipeline .boundary:not([hidden]) {
          display: block !important;
        }

        .pipeline .boundary .agentRuntimeObservedPanel {
          width: 100% !important;
          min-width: 0 !important;
        }

        .pipeline .boundary .agentRuntimeFlow {
          display: grid !important;
          grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
          gap: 6px !important;
          width: 100% !important;
          min-width: 0 !important;
        }

        .pipeline .boundary .agentRuntimeNode {
          min-width: 0 !important;
        }
      }
    `;
    document.head.append(style);
  }

  function cleanup() {
    installCleanupStyle();
    document.getElementById(PANEL_ID)?.remove();
  }

  let scheduled = false;
  const scheduleCleanup = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      cleanup();
    });
  };

  cleanup();

  new MutationObserver(scheduleCleanup).observe(document.body, {
    childList: true,
    subtree: true
  });
})();
