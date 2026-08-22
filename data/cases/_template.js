window.GATEWAY_CASES = window.GATEWAY_CASES || {};

window.GATEWAY_CASES.example = {
  meta: {
    id: "example",
    title: "Replace with the user question",
    prompt: "Replace with the user question",
    rawSessionKey: "",
    canonicalSessionKey: "",
    sessionId: "",
    runId: "",
    agent: "",
    sendPolicy: "",
    downstreamAgent: "",
    resolver: "",
    resolverSource: "",
    provider: "",
    model: "",
    tools: "",
    ack: "",
    titleSync: "",
    overallRisk: ""
  },

  // Only runtime / trace-specific fields go here.
  // Shared source mapping, purposes, generic input/output, and step definitions
  // live in data/stages.js.
  stages: {
    G0: {
      result: "",
      evidence: [],
      tone: "good",
      case2: "",
      time: "not separately observed",
      tokens: "not observed",
      risk: "",
      concreteInput: "",
      concreteOutput: "",
      concreteInputEvidence: "",
      concreteOutputEvidence: ""
    }
    // ... G1 through G18
  },

  stateByStage: {
    G0: {
      authentication: { label: "—", tone: "neutral" },
      policy: { label: "—", tone: "neutral" },
      runtime: { label: "—", tone: "neutral" },
      routing: { label: "—", tone: "neutral" },
      overall: { label: "—", tone: "neutral" }
    }
    // ... G1 through G18
  }
};
