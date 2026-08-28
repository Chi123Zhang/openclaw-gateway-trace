window.GATEWAY_CASE_INDEX = [
  {
    "id": "cake",
    "title": "How to make a cake?",
    "file": "data/cases/cake.js",
    "description": "Current OpenClaw Gateway trace used to build the dashboard."
  }
];

// The live viewer reuses the saved-trace picker as local persistent run history.
// Load this helper separately so the static reference case remains unchanged.
(() => {
  const script = document.createElement("script");
  script.src = "assets/run-history.js?v=20260828-10";
  script.async = true;
  document.head.appendChild(script);
})();
