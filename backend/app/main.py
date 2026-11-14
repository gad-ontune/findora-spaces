from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.api.v1 import (
    admin,
    assisted,
    auth,
    locations,
    notifications,
    partners,
    payments,
    properties,
    public,
    seeker,
    subscriptions,
    support,
    users,
    viewings,
)
from app.bootstrap import bootstrap
from app.core.config import settings
from app.core.database import SessionLocal, engine, init_db
from app.core.exceptions import AppError
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.middleware import CsrfMiddleware

logger = logging.getLogger("findora")

OPENAPI_TAGS = [
    {"name": "Public", "description": "Public discovery content. No registration required."},
    {"name": "Authentication", "description": "Registration, phone verification and sessions."},
    {"name": "Users", "description": "The signed-in user's own profile and account."},
    {"name": "Locations", "description": "Counties, towns, neighbourhoods and landmarks."},
    {"name": "Properties", "description": "Listings, media, availability, verification and reports."},
    {"name": "Enquiries", "description": "Seeker enquiries to property representatives."},
    {"name": "Verification", "description": "Independent verification review workflows."},
    {"name": "Seeker", "description": "Favourites, comparisons, shortlists and saved searches."},
    {"name": "Assisted search", "description": "Request a person to help find a property."},
    {"name": "Partner operations", "description": "Vetted local partner assignments and field reports."},
    {"name": "Viewings", "description": "Viewing requests, scheduling and feedback."},
    {"name": "Payments", "description": "M-Pesa payments, invoices and refunds."},
    {"name": "Notifications", "description": "In-app notification centre and channel preferences."},
    {"name": "Support and complaints", "description": "Support tickets, complaints and safety reports."},
    {"name": "Administration", "description": "Moderation, operations, analytics, audit and settings."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    if settings.auto_create_tables:
        init_db()
    with SessionLocal() as db:
        bootstrap(db)
    logger.info("Findora Spaces API started", extra={"extra_fields": {"environment": settings.environment}})
    yield
    engine.dispose()
    logger.info("Findora Spaces API stopped")


app = FastAPI(
    title="Findora Spaces API",
    description=(
        "Nationwide Kenyan property discovery and assisted house-finding platform. "
        "Public browsing never requires an account. Only approved, genuinely available "
        "and sufficiently fresh listings appear publicly."
    ),
    version="1.0.0",
    lifespan=lifespan,
    openapi_tags=OPENAPI_TAGS,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token", "X-Request-ID", "X-Callback-Secret"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(CsrfMiddleware)
app.add_middleware(RequestContextMiddleware)

media_dir = Path(settings.upload_dir)
media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_dir), name="media")


@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
                "request_id": request.headers.get("x-request-id"),
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", []) if part != "body")
        errors.append(
            {
                "field": location,
                "message": error.get("msg", "Invalid value"),
                "type": error.get("type"),
            }
        )
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "Please check the information you submitted.",
                "details": errors,
            }
        },
    )


@app.exception_handler(IntegrityError)
async def handle_integrity_error(request: Request, exc: IntegrityError):
    logger.warning("database integrity error", exc_info=exc)
    return JSONResponse(
        status_code=409,
        content={
            "error": {
                "code": "conflict",
                "message": "That action conflicts with existing data. Refresh and try again.",
            }
        },
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception):
    logger.exception("unhandled error")
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "server_error",
                "message": (
                    "Something went wrong. Please try again."
                    if settings.is_production
                    else f"Something went wrong: {type(exc).__name__}: {exc}"
                ),
            }
        },
    )


@app.get("/health", tags=["Public"])
def health():
    database_ok = True
    redis_ok = None
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        database_ok = False
    try:
        import redis

        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1)
        redis_ok = bool(client.ping())
        client.close()
    except Exception:
        redis_ok = False
    status = "ok" if database_ok else "degraded"
    return {
        "status": status,
        "service": settings.app_name,
        "environment": settings.environment,
        "database": database_ok,
        "redis": redis_ok,
        "version": app.version,
    }


api = settings.api_v1_prefix
for module in (auth, users, locations, properties, seeker, assisted, partners, viewings):
    app.include_router(module.router, prefix=api)
app.include_router(properties.enquiry_router, prefix=api)
app.include_router(properties.verification_router, prefix=api)
for module in (notifications, payments, public, subscriptions, support, admin):
    app.include_router(module.router, prefix=api)


@app.get("/", tags=["Public"])
def root():
    return {
        "name": settings.app_name,
        "tagline": "Find a space yourself, or let us help you find the right one.",
        "launch_market": "Kehancha, Migori County",
        "api": api,
        "docs": "/docs" if not settings.is_production else None,
        "health": "/health",
    }
