from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, get_session
from app.core.exceptions import Unauthorized
from app.core.rate_limit import RateLimiter
from app.core.security import utcnow
from app.models import User, UserSession
from app.schemas.payloads import LoginIn, RegisterIn, ResendOtpIn, VerifyPhoneIn
from app.services import auth_service
from app.services.serializers import user_payload

router = APIRouter(prefix="/auth", tags=["Authentication"])

login_limiter = RateLimiter("login", 10, 60)
register_limiter = RateLimiter("register", 8, 300)
otp_limiter = RateLimiter("otp", 6, 300)
verify_limiter = RateLimiter("verify", 12, 300)


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def set_auth_cookies(response: Response, token: str, csrf: str) -> None:
    max_age = settings.session_ttl_hours * 3600
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf,
        max_age=max_age,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.delete_cookie(settings.csrf_cookie_name, path="/")


@router.post("/register", status_code=201)
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)):
    register_limiter.hit(_client(request))
    user, debug_code = auth_service.register(db, payload, request)
    return {
        "user": user_payload(user, self_view=True),
        "message": "Account created. Enter the verification code sent to your phone.",
        "otp_debug": debug_code or None,
        "requires_phone_verification": True,
    }


@router.post("/login")
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    login_limiter.hit(f"{_client(request)}:{payload.phone}")
    user, session, token, csrf = auth_service.login(db, payload, request)
    set_auth_cookies(response, token, csrf)
    return {"user": user_payload(user, self_view=True)}


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    session: UserSession | None = Depends(get_session),
):
    if session:
        auth_service.revoke_session(db, session, request)
    clear_auth_cookies(response)
    return {"message": "Signed out."}


@router.post("/verify-phone")
def verify_phone(
    payload: VerifyPhoneIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    verify_limiter.hit(f"{_client(request)}:{payload.phone}")
    user, _ = auth_service.verify_phone_otp(db, payload.phone, payload.code, request)
    if user is None:
        return {"message": "Phone verified. You can now sign in.", "user": None}
    session, token, csrf = auth_service.create_session(db, user, request)
    db.commit()
    db.refresh(user)
    set_auth_cookies(response, token, csrf)
    return {"message": "Phone verified and signed in.", "user": user_payload(user, self_view=True)}


@router.post("/resend-otp")
def resend_otp(payload: ResendOtpIn, request: Request, db: Session = Depends(get_db)):
    otp_limiter.hit(f"{_client(request)}:{payload.phone}")
    debug_code = auth_service.resend_code(db, payload.phone)
    return {
        "message": "If this number belongs to an account, a new verification code has been sent.",
        "otp_debug": debug_code or None,
    }


@router.post("/refresh")
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    session: UserSession | None = Depends(get_session),
):
    if session is None:
        raise Unauthorized("Your session has expired. Sign in again.")
    session, token, csrf = auth_service.refresh_session(db, session, request)
    set_auth_cookies(response, token, csrf)
    return {"user": user_payload(session.user, self_view=True)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user": user_payload(user, self_view=True)}
