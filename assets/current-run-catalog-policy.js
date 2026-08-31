(() => {
  /* Keep the shared stage catalog source-only.
   *
   * Runtime/result values belong to the selected run snapshot (live or published).
   * The catalog supplies stable OpenClaw v2026.7.1-2 structure, source ranges,
   * and source-aligned pseudocode only. Reference examples must never leak into a
   * different current run through the catalog fallback used by mergeCase().
   */
  const catalog = window.GATEWAY_STAGE_CATALOG;
  if (!Array.isArray(catalog)) return;

  const byStage = Object.fromEntries(catalog.map(stage => [stage.id, stage]));
  const step = (stageId, index) => byStage[stageId]?.steps?.[index] || null;

  // G1: the source contains multiple auth-mode branches. The concrete active
  // authMode/result is supplied by this run's runtime event, not by the catalog.
  const g1Mode = step("G1", 2);
  if (g1Mode) {
    g1Mode.detail = "Resolve request/rate-limit context and evaluate the configured authentication-mode branch. The active authMode for a run is shown only from that run's trace.";
    g1Mode.code = "context = resolveGatewayAuthRequestContext(params)\n\n# evaluate the branch selected by auth.mode\n# concrete authMode/result come from the current runtime trace";
  }

  // G3 is always the chat.send authorization stage in this viewer, but role and
  // scopes are connection/runtime values and must not be fixed in the catalog.
  if (byStage.G3) {
    byStage.G3.input = "chat.send method + authenticated client role + Gateway scopes.";
  }

  // G5 previously carried the old Cake reference prompt in the shared catalog.
  // The actual message is provided by the current request/trace instead.
  if (byStage.G5) {
    byStage.G5.input = "Incoming message text + optional attachments.";
  }
  const g5Continue = step("G5", 4);
  if (g5Continue) {
    g5Continue.detail = "Continue with the normalized request when message text or attachments remain after validation.";
  }

  const g6Return = step("G6", 3);
  if (g6Return) {
    g6Return.detail = "Return the requested-Agent state to the chat.send handler.";
  }

  // G9 output is dynamic; do not bake the old reference Agent into source text.
  if (byStage.G9) {
    byStage.G9.output = "effective Agent ID";
  }
  const g9Return = step("G9", 4);
  if (g9Return) {
    g9Return.detail = "Return the effective Agent selected by explicit, Session, fallback, and default precedence.";
  }

  const g11Dispatch = step("G11", 4);
  if (g11Dispatch) {
    g11Dispatch.detail = "If no cached, aborted, pending, active, queued, routing, or archive guard stops the request, classify it as a new dispatch.";
  }

  const g12Admit = step("G12", 3);
  if (g12Admit) {
    g12Admit.detail = "When admission and latest-Session revalidation succeed, register the run context and continue into dispatch.";
  }

  window.GATEWAY_CATALOG_POLICY = Object.freeze({
    sourceSnapshot: "OpenClaw v2026.7.1-2",
    dynamicValuesFromSelectedRunOnly: true,
    referenceFallbackForRuntimeValues: false,
    evidenceOrder: [
      "RUNTIME",
      "REQUEST_RESPONSE",
      "SOURCE_MAPPED",
      "SOURCE_DERIVED",
      "NOT_CAPTURED"
    ]
  });
})();
