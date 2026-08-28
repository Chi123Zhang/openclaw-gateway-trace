(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("reference") !== "1") return;

  // Run synchronously before live.js. Renaming the form intentionally makes
  // live.js exit at its first guard, so the selected static case stays visible.
  document.documentElement.classList.add("referenceMode");
  document.body.classList.add("referenceMode");
  const askForm = document.getElementById("askForm");
  if (askForm) askForm.id = "askFormReference";
  const ask = document.querySelector(".askPanel");
  if (ask) ask.hidden = true;

  const finish = () => {
    const caseId = params.get("case") || "cake";
    const isPublishedLive = caseId === "latest-live";

    const badge = document.querySelector("header .badge");
    if (badge) badge.textContent = isPublishedLive ? "Published live trace" : "Saved reference";

    const brand = document.querySelector(".brand");
    if (brand) {
      brand.title = isPublishedLive
        ? "Static snapshot exported from a completed local live run"
        : "Fixed reference trace aligned with OpenClaw v2026.7.1-2";
    }

    const main = document.querySelector("main.main");
    if (!main) return;

    let banner = document.getElementById("referenceBanner");
    if (!banner) {
      banner = document.createElement("section");
      banner.id = "referenceBanner";
      banner.className = "card referenceBanner";
      banner.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:18px;padding:12px 14px;margin-bottom:12px";
      main.prepend(banner);
    }

    const updateBanner = () => {
      const meta = (typeof ACTIVE_CASE !== "undefined" && ACTIVE_CASE?.meta) || {};
      const title = meta.title || meta.prompt || (isPublishedLive ? "Published live run" : "How to make a cake?");
      const savedAt = meta.savedAt ? ` · saved ${meta.savedAt}` : "";
      const publishedAt = meta.publishedAt ? ` · published ${meta.publishedAt}` : "";
      const note = isPublishedLive
        ? `OpenClaw v2026.7.1-2 · static snapshot of a completed local live run${savedAt}${publishedAt}`
        : "OpenClaw v2026.7.1-2 · source commit 0790d9f · verified reference trace.";

      banner.innerHTML = `
        <div>
          <div class="kicker">${isPublishedLive ? "Published live trace" : "Saved trace"}</div>
          <strong></strong>
        </div>
        <div class="referenceMeta" style="max-width:720px;text-align:right;color:var(--muted);font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace"></div>`;
      banner.querySelector("strong").textContent = title;
      banner.querySelector(".referenceMeta").textContent = note;
    };

    updateBanner();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      updateBanner();
      if ((typeof ACTIVE_CASE !== "undefined" && ACTIVE_CASE?.meta) || tries >= 80) {
        clearInterval(timer);
      }
    }, 50);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", finish, { once: true });
  else finish();
})();
