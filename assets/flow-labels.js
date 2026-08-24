(() => {
  let scheduled = false;

  function decorateArrowLabels(root = document) {
    root.querySelectorAll?.('.stageFlowArrow[data-flow-label]').forEach(arrow => {
      let label = arrow.querySelector(':scope > .flowRelationLabel');
      if (!label) {
        label = document.createElement('span');
        label.className = 'flowRelationLabel';
        label.textContent = arrow.dataset.flowLabel || '';
        arrow.append(label);
        return;
      }
      const next = arrow.dataset.flowLabel || '';
      if (label.textContent !== next) label.textContent = next;
    });
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateArrowLabels();
    });
  }

  function install() {
    if (typeof renderAll === 'function') {
      const previous = renderAll;
      renderAll = function renderAllWithReadableFlowLabels(...args) {
        const result = previous(...args);
        scheduleDecorate();
        return result;
      };
    }

    if (typeof renderSubflow === 'function') {
      const previousSubflow = renderSubflow;
      renderSubflow = function renderSubflowWithReadableFlowLabels(...args) {
        const result = previousSubflow(...args);
        scheduleDecorate();
        return result;
      };
    }

    decorateArrowLabels();

    // The viewer rebuilds stage/module nodes during replay and live polling.
    // Observe only structural changes and coalesce them into one animation frame.
    // Do not rewrite labels on every mutation: that can create a self-triggering
    // MutationObserver loop and stall the page.
    const observer = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation =>
        [...mutation.addedNodes].some(node =>
          node.nodeType === 1 && (
            node.matches?.('.stageFlowArrow, .arrow, .subnode, .stageCard') ||
            node.querySelector?.('.stageFlowArrow, .arrow, .subnode, .stageCard')
          )
        )
      );
      if (relevant) scheduleDecorate();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
