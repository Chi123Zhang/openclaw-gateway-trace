window.GATEWAY_CONFIG = {
  // The collector runs on the same computer as OpenClaw.
  // GitHub Pages remains a static viewer; live runs are sent to this local service.
  // If your browser blocks HTTPS -> localhost requests, use the local frontend
  // or replace this with an HTTPS tunnel URL for the collector.
  collectorUrl: "http://127.0.0.1:8765",
  requestTimeoutMs: 135000
};
