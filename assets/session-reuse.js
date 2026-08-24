(() => {
  let currentSessionKey = "";

  function reuseToggle() {
    return document.getElementById("reuseSessionToggle");
  }

  function runMessage() {
    return document.getElementById("runMessage");
  }

  function updateStatus() {
    const status = document.getElementById("reuseSessionStatus");
    if (!status) return;
    status.textContent = currentSessionKey ? "session ready" : "after first run";
    status.classList.toggle("ready", Boolean(currentSessionKey));
  }

  function installControl() {
    const footer = document.querySelector(".askFooter");
    const useCurrent = document.getElementById("useCurrentPromptBtn");
    if (!footer || document.getElementById("reuseSessionToggle")) return;

    const style = document.createElement("style");
    style.textContent = `
      .askFooter{justify-content:flex-start!important}
      #runMessage{margin-right:auto}
      .reuseSessionControl{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;color:#aab4bd;cursor:pointer;user-select:none}
      .reuseSessionControl input{width:14px;height:14px;margin:0;accent-color:#6f9d7d;cursor:pointer}
      .reuseSessionControl small{font-size:9px;color:#6f7a84}
      .reuseSessionControl small.ready{color:#8fb89a}
      @media(max-width:720px){#runMessage{margin-right:0}.reuseSessionControl{white-space:normal}}
    `;
    document.head.appendChild(style);

    const label = document.createElement("label");
    label.className = "reuseSessionControl";
    label.title = "Reuse the latest live SessionKey on the next run. The first run still creates a new session.";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "reuseSessionToggle";

    const text = document.createElement("span");
    text.textContent = "Reuse current session";

    const status = document.createElement("small");
    status.id = "reuseSessionStatus";

    label.append(checkbox, text, status);
    if (useCurrent) footer.insertBefore(label, useCurrent);
    else footer.appendChild(label);
    updateStatus();

    const clearButton = document.getElementById("resetBtn");
    if (clearButton) {
      clearButton.addEventListener("click", () => {
        currentSessionKey = "";
        checkbox.checked = false;
        updateStatus();
      });
    }
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : String(input?.url || "");
    const isLiveStart = url.includes("/api/live/start") && String(init?.method || "GET").toUpperCase() === "POST";

    if (!isLiveStart) return originalFetch(input, init);

    const toggle = reuseToggle();
    const wantsReuse = Boolean(toggle?.checked);
    let nextInit = init;

    if (wantsReuse && currentSessionKey && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        body.sessionKey = currentSessionKey;
        nextInit = { ...init, body: JSON.stringify(body) };
        const msg = runMessage();
        if (msg) msg.textContent = "Reusing current session · checking history baseline before chat.send.";
      } catch {
        // Leave the request untouched if it is not the expected JSON body.
      }
    } else if (wantsReuse) {
      const msg = runMessage();
      if (msg) msg.textContent = "Starting a new session · the next run will reuse it.";
    }

    const response = await originalFetch(input, nextInit);

    try {
      const payload = await response.clone().json();
      if (response.ok && payload?.sessionKey) {
        currentSessionKey = String(payload.sessionKey);
        updateStatus();
      }
    } catch {
      // Session reuse is a UI convenience; parsing must never affect the live request.
    }

    return response;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installControl, { once: true });
  } else {
    installControl();
  }
})();

// Load source/runtime alignment patches after the base evidence and verified-flow
// modules are installed. Each patch stays isolated to its named stage.
(() => {
  const files = [
    "assets/g0-evidence.js",
    "assets/g0-handoff-fix.js",
    "assets/g1-evidence.js",
  ];
  let index = 0;

  function next() {
    if (index >= files.length) {
      try {
        if (typeof renderAll === "function") renderAll();
      } catch {}
      return;
    }
    const src = files[index++];
    if (document.querySelector(`script[src="${src}"]`)) {
      next();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = next;
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", next, { once: true });
  else next();
})();
