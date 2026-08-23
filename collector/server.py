"""HTTP shell for a future OpenClaw + TraceClaw collector.

This file intentionally does not fabricate runtime stages. The /api/run route
returns 503 until a real adapter is connected.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="OpenClaw Gateway Trace Collector")

origins = [
    "https://chi123zhang.github.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

extra_origin = os.getenv("TRACE_VIEWER_ORIGIN")
if extra_origin:
    origins.append(extra_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class RunRequest(BaseModel):
    message: str = Field(min_length=1, max_length=100_000)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "adapter": "not-configured"}


@app.post("/api/run")
async def run_trace(request: RunRequest) -> dict[str, Any]:
    raise HTTPException(
        status_code=503,
        detail=(
            "OpenClaw adapter is not connected yet. "
            "The collector must send chat.send, collect TraceClaw events for the run, "
            "and return the G0–G18 trace payload."
        ),
    )
