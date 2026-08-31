(() => {
  /* Legacy compatibility stub.
   *
   * The original implementation used document-wide MutationObservers and could
   * repeatedly react to dashboard redraws. The active implementation is now
   * assets/review-polish-safe.js, loaded deterministically from index.html.
   *
   * Keep this file intentionally inert so an older cached data/cases/index.js
   * cannot re-enable the unsafe observer path while a browser cache is clearing.
   */
})();
