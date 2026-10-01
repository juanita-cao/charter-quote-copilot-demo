"""
CORS + Origin-header validation (design_backend.md §10, T2.20).

Three layers, not one — `SameSite=Lax` cookies are the PRIMARY CSRF defense
(§9.1); this module implements the two *additional* layers §10 specifies:
`CORSMiddleware` (browser-origin read/send control) and Origin header
validation on state-changing requests (a third, cheap layer, given cookie-
based auth is already in place). Neither of these two is itself sufficient
against CSRF alone — `SameSite=Lax` already is; see §10 for the full
reasoning and the still-open double-submit-token future-hardening note.
"""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from src.backend.configs.feature_flags import DEFAULT_ALLOWED_ORIGINS

_STATE_CHANGING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def get_allowed_origins() -> list[str]:
    """Reads `ALLOWED_ORIGINS` (comma-separated) from the environment — not a
    fixed `feature_flags.py` constant, since the value is deployment-specific
    (differs between local dev and the real `app.<domain>` once one exists,
    §10's "Prerequisite before deployment"). Falls back to
    `DEFAULT_ALLOWED_ORIGINS` when unset."""
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or list(DEFAULT_ALLOWED_ORIGINS)


def configure_cors(app: FastAPI, allowed_origins: list[str]) -> None:
    """`allow_origins` is an exact-match list, never `"*"` — required
    alongside `allow_credentials=True` (fixed 2026-09-17, review round 3: a
    Vercel-preview-style wildcard is not a literal string this parameter can
    contain; `allow_origin_regex` is the separate, not-yet-decided option
    for previews, §10).

    The Origin-validation middleware never blocks a request with NO Origin
    header (non-browser clients, and some same-origin requests omit it) —
    only a *present* Origin outside `allowed_origins` is rejected, and only
    for state-changing methods."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def validate_origin_header(request: Request, call_next):
        if request.method in _STATE_CHANGING_METHODS:
            origin = request.headers.get("origin")
            if origin is not None and origin not in allowed_origins:
                return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})
        return await call_next(request)
