(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("reference") !== "1") return;

  // Run synchronously before live.js. Renaming the form intentionally makes
  // live.js exit at its first guard, so the saved reference case remains visible.
  document.documentElement.classList.add("referenceMode");
  document.body.classList.add("referenceMode");
  const askForm = document.getElementById("askForm");
  if (askForm) askForm.id = "askFormReference";
  const ask = document.querySelector(".askPanel");
  if (ask) ask.hidden = true;

  const finish = () => {
    const badge = document.querySelector("header .badge");
    if (badge) badge.textContent = "Saved reference";

    const brand = document.querySelector(".brand");
    if (brand) brand.title = "Fixed reference trace aligned with OpenClaw v2026.7.1-2";

    const main = document.querySelector("main.main");
    if (main && !document.getElementById("referenceBanner")) {
      const banner = document.createElement("section");
      banner.id = "referenceBanner";
      banner.className = "card referenceBanner";
      banner.innerHTML = `
        <div>
          <div class="kicker">Saved trace</div>
          <strong>How to make a cake?</strong>
        </div>
        <div class="referenceMeta">OpenClaw v2026.7.1-2 · source commit 0790d9f · Replay uses the same verified G/M flow as the live viewer.</div>`;
      main.prepend(banner);
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", finish, { once: true });
  else finish();
})();
