"""
FastAPI app entry point. CORS + Origin-header validation (design_backend.md
§10, T2.20) — `ALLOWED_ORIGINS` is deployment-specific (see cors.py); until
a real domain exists (§10's "Prerequisite before deployment," not before
coding), this falls back to common local React dev origins.
"""

from __future__ import annotations

from fastapi import FastAPI

from src.backend.cors import configure_cors, get_allowed_origins
from src.backend.routers import auth as auth_router
from src.backend.routers import company as company_router
from src.backend.routers import dashboards as dashboards_router
from src.backend.routers import drafts as drafts_router
from src.backend.routers import export as export_router
from src.backend.routers import quotes as quotes_router

app = FastAPI(title="Charter Quote Copilot API")

configure_cors(app, get_allowed_origins())

app.include_router(auth_router.router)
app.include_router(quotes_router.router)
app.include_router(quotes_router.bunker_router)
app.include_router(company_router.router)
app.include_router(drafts_router.router)
app.include_router(export_router.router)
app.include_router(dashboards_router.router)
