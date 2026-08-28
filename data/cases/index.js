window.GATEWAY_CASE_INDEX = [
  {
    "id": "cake",
    "title": "How to make a cake?",
    "file": "data/cases/cake.js",
    "description": "Verified OpenClaw Gateway reference trace."
  },
  {
    "id": "latest-live",
    "title": "Latest published live run",
    "file": "data/cases/latest-live.js",
    "description": "Most recently published locally saved live trace."
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
