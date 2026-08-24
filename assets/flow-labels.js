(() => {
  function decorateArrowLabels(root = document) {
    root.querySelectorAll?.('.stageFlowArrow[data-flow-label]').forEach(arrow => {
      let label = arrow.querySelector('.flowRelationLabel');
      if (!label) {
        label = document.createElement('span');
        label.className = 'flowRelationLabel';
        arrow.append(label);
      }
      label.textContent = arrow.dataset.flowLabel || '';
    });
  }

  function install() {
    if (typeof renderAll === 'function') {
      const previous = renderAll;
      renderAll = function renderAllWithReadableFlowLabels(...args) {
        const result = previous(...args);
        requestAnimationFrame(() => decorateArrowLabels());
        return result;
      };
    }
    if (typeof renderSubflow === 'function') {
      const previousSubflow = renderSubflow;
      renderSubflow = function renderSubflowWithReadableFlowLabels(...args) {
        const result = previousSubflow(...args);
        requestAnimationFrame(() => decorateArrowLabels(document));
        return result;
      };
    }
    decorateArrowLabels();

    const observer = new MutationObserver(() => decorateArrowLabels());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
