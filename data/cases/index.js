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

// Review polish requested after the first faculty walkthrough: module cards now
// open a compact inspection panel, and stage Input/Output defaults to two rows.
// Keep it dynamically loaded so both the local live viewer and static reference
// pages receive the same presentation without changing trace data.
(() => {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "assets/review-polish.css?v=20260830-1";
  document.head.appendChild(css);

  const script = document.createElement("script");
  script.src = "assets/review-polish.js?v=20260830-1";
  script.async = true;
  document.head.appendChild(script);
})();
