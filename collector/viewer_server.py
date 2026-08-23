"""Serve the trace viewer and collector from one local origin.

Run this module through uvicorn (see start_live.sh). API routes stay available at
/health and /api/run, while the repository root is served as the frontend.
"""

from pathlib import Path

from fastapi.staticfiles import StaticFiles

from server import app


REPO_ROOT = Path(__file__).resolve().parent.parent
app.mount("/", StaticFiles(directory=str(REPO_ROOT), html=True), name="trace-viewer")
