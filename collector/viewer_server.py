"""Serve the trace viewer and collector from one local origin.

Run this module through uvicorn (see start_live.sh). API routes stay available at
/health, /api/run and /api/live/*, while the repository root is served as the
frontend.
"""

from pathlib import Path

from fastapi.staticfiles import StaticFiles

from server import app
import stage_io_overrides  # noqa: F401  # source-align stage-level live Input/Output
import runtime_detail  # noqa: F401  # enriches _build_trace with raw Gateway runtime evidence
import agent_runtime_detail  # noqa: F401  # normalizes post-G18 Agent Runtime evidence
import live_runs  # noqa: F401  # registers incremental live-run routes after enrichment


@app.middleware("http")
async def disable_local_frontend_cache(request, call_next):
    """Keep local development from reusing stale HTML/JS/CSS after git pull."""
    response = await call_next(request)
    path = request.url.path.lower()
    if path == "/" or path.endswith((".html", ".js", ".css")):
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response


REPO_ROOT = Path(__file__).resolve().parent.parent
app.mount("/", StaticFiles(directory=str(REPO_ROOT), html=True), name="trace-viewer")
