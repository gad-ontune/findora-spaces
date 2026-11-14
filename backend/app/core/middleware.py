from __future__ import annotations

import hmac
import json

from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.security import token_hash, utcnow
from app.models import UserSession

EXEMPT_PATHS = {
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/verify-phone",
    "/api/v1/auth/resend-otp",
    "/api/v1/payments/callback",
}


class CsrfMiddleware(BaseHTTPMiddleware):
    """Double-submit CSRF protection for cookie-authenticated requests.

    The raw CSRF token lives in a readable cookie; its hash is bound to the server-side
    session. Browsers must echo the token in X-CSRF-Token for mutating requests.
    Guest actions (no session) are permitted but rate-limited by their endpoints.
    """

    async def dispatch(self, request: Request, call_next):
        if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
            return await call_next(request)
        path = request.url.path
        if path in EXEMPT_PATHS or path.startswith("/media/"):
            return await call_next(request)

        origin = request.headers.get("origin")
        if origin:
            allowed = set(settings.cors_origin_list) | {settings.frontend_url}
            if origin not in allowed and not origin.endswith(".findora.co.ke"):
                return JSONResponse(
                    status_code=403,
                    content={"error": {"code": "csrf_failed", "message": "Request origin is not allowed."}},
                )

        session_token = request.cookies.get(settings.session_cookie_name)
        if not session_token:
            return await call_next(request)

        csrf_cookie = request.cookies.get(settings.csrf_cookie_name)
        csrf_header = request.headers.get("x-csrf-token")
        if not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "csrf_failed",
                        "message": "A valid CSRF token is required. Refresh the page and try again.",
                    }
                },
            )

        from app.core.database import SessionLocal

        db: Session = SessionLocal()
        try:
            session = db.execute(
                select(UserSession).where(
                    UserSession.token_hash == token_hash(session_token),
                    UserSession.revoked_at.is_(None),
                    UserSession.expires_at > utcnow(),
                )
            ).scalar_one_or_none()
            if session is None:
                return await call_next(request)
            if not hmac.compare_digest(session.csrf_token_hash, token_hash(csrf_header)):
                return JSONResponse(
                    status_code=403,
                    content={"error": {"code": "csrf_failed", "message": "CSRF token is invalid."}},
                )
        finally:
            db.close()

        return await call_next(request)
