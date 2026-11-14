from __future__ import annotations

from datetime import timedelta

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.bootstrap import ensure_rbac
from app.core.config import settings
from app.core.exceptions import Conflict, Forbidden, NotFound, Unauthorized, ValidationError
from app.core.permissions import SELF_SERVICE_ROLES
from app.core.security import (
    expiry,
    generate_opaque_token,
    generate_otp,
    hash_otp,
    hash_password,
    normalize_phone,
    token_hash,
    utcnow,
    verify_otp,
    verify_password,
)
from app.integrations.messaging import send_sms
from app.models import (
    AccountSecurityEvent,
    Permission,
    PhoneVerification,
    Role,
    User,
    UserProfile,
    UserSession,
)
from app.schemas.payloads import LoginIn, RegisterIn


def user_by_phone(db: Session, phone: str) -> User | None:
    return db.execute(
        select(User)
        .where(User.phone == phone)
        .options(selectinload(User.roles).selectinload(Role.permissions))
    ).scalar_one_or_none()


def _record_event(db: Session, user: User | None, event_type: str, request: Request | None, details: str = "") -> None:
    db.add(
        AccountSecurityEvent(
            user_id=user.id if user else None,
            event_type=event_type,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
            details=details,
        )
    )


def issue_otp(db: Session, phone: str, *, user: User | None, purpose: str = "registration") -> str:
    db.query(PhoneVerification).filter(
        PhoneVerification.phone == phone,
        PhoneVerification.purpose == purpose,
        PhoneVerification.consumed_at.is_(None),
    ).update({"consumed_at": utcnow()}, synchronize_session=False)
    code = generate_otp()
    record = PhoneVerification(
        user_id=user.id if user else None,
        phone=phone,
        code_hash=hash_otp(code, phone),
        purpose=purpose,
        expires_at=expiry(minutes=settings.otp_ttl_minutes),
        debug_code=code if settings.otp_debug else None,
    )
    db.add(record)
    db.flush()
    message = (
        f"Your Findora verification code is {code}. It expires in "
        f"{settings.otp_ttl_minutes} minutes. Do not share this code."
    )
    try:
        send_sms(phone, message)
    except Exception:
        pass
    return code if settings.otp_debug else ""


def register(db: Session, payload: RegisterIn, request: Request | None = None) -> tuple[User, str]:
    ensure_rbac(db)
    existing = user_by_phone(db, payload.phone)
    if existing:
        raise Conflict("An account with this phone number already exists. Sign in instead.")
    if payload.email:
        existing_email = db.execute(select(User).where(User.email == str(payload.email))).scalar_one_or_none()
        if existing_email:
            raise Conflict("An account with this email already exists.")
    role_codes = ["property_seeker"]
    if payload.account_type in SELF_SERVICE_ROLES:
        role_codes.append(payload.account_type)
    roles = db.execute(select(Role).where(Role.code.in_(set(role_codes)))).scalars().all()
    user = User(
        name=payload.name.strip(),
        phone=payload.phone,
        email=str(payload.email) if payload.email else None,
        password_hash=hash_password(payload.password),
        status="active",
    )
    user.roles = list(roles)
    user.profile = UserProfile(
        preferred_contact="phone",
        marketing_consent=payload.marketing_consent,
        data_processing_consent_at=utcnow(),
    )
    db.add(user)
    db.flush()
    _record_event(db, user, "account.created", request, f"account_type={payload.account_type}")
    debug_code = issue_otp(db, payload.phone, user=user, purpose="registration")
    db.commit()
    db.refresh(user)
    return user, debug_code


def create_session(db: Session, user: User, request: Request | None = None) -> tuple[UserSession, str, str]:
    token = generate_opaque_token(40)
    csrf = generate_opaque_token(28)
    session = UserSession(
        user_id=user.id,
        token_hash=token_hash(token),
        csrf_token_hash=token_hash(csrf),
        ip_address=request.client.host if request and request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
        expires_at=expiry(hours=settings.session_ttl_hours),
    )
    db.add(session)
    user.last_login_at = utcnow()
    db.flush()
    return session, token, csrf


def login(db: Session, payload: LoginIn, request: Request | None = None) -> tuple[User, UserSession, str, str]:
    user = user_by_phone(db, payload.phone)
    if user is None:
        _record_event(db, None, "login.failed_unknown_phone", request)
        db.commit()
        raise Unauthorized("Phone number or password is incorrect.")
    now = utcnow()
    if user.locked_until and user.locked_until > now:
        raise Forbidden("This account is temporarily locked. Try again later.", code="account_locked")
    if user.status != "active":
        raise Forbidden("This account is not active. Contact support.", code="account_inactive")
    if not verify_password(payload.password, user.password_hash):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= settings.login_max_attempts:
            user.locked_until = now + timedelta(minutes=15)
            user.failed_login_attempts = 0
            _record_event(db, user, "login.locked", request)
        else:
            _record_event(db, user, "login.failed", request)
        db.commit()
        raise Unauthorized("Phone number or password is incorrect.")
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    _record_event(db, user, "login.success", request)
    session, token, csrf = create_session(db, user, request)
    db.commit()
    db.refresh(user)
    return user, session, token, csrf


def verify_phone_otp(
    db: Session, phone: str, code: str, request: Request | None = None
) -> tuple[User | None, str]:
    record = db.execute(
        select(PhoneVerification)
        .where(
            PhoneVerification.phone == phone,
            PhoneVerification.consumed_at.is_(None),
        )
        .order_by(PhoneVerification.created_at.desc())
    ).scalars().first()
    if record is None:
        raise ValidationError("No verification code was found. Request a new code.")
    if record.expires_at < utcnow():
        raise ValidationError("This code has expired. Request a new code.")
    if record.attempts >= 5:
        record.consumed_at = utcnow()
        db.commit()
        raise ValidationError("Too many incorrect attempts. Request a new code.")
    if not verify_otp(code, phone, record.code_hash):
        record.attempts += 1
        db.commit()
        raise ValidationError("The verification code is incorrect.")
    record.consumed_at = utcnow()
    user = user_by_phone(db, phone)
    if user is not None:
        user.phone_verified_at = utcnow()
        _record_event(db, user, "phone.verified", request)
    db.commit()
    return user, (user.name if user else "")


def refresh_session(
    db: Session, session: UserSession, request: Request | None = None
) -> tuple[UserSession, str, str]:
    session.revoked_at = utcnow()
    user = session.user
    new_session, token, csrf = create_session(db, user, request)
    _record_event(db, user, "session.refreshed", request)
    db.commit()
    return new_session, token, csrf


def revoke_session(db: Session, session: UserSession, request: Request | None = None) -> None:
    session.revoked_at = utcnow()
    _record_event(db, session.user, "session.revoked", request)
    db.commit()


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise ValidationError("Your current password is incorrect.")
    if len(new_password) < 8:
        raise ValidationError("Password must be at least 8 characters.")
    user.password_hash = hash_password(new_password)
    db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)).update(
        {"revoked_at": utcnow()}, synchronize_session=False
    )
    db.commit()


def resend_code(db: Session, phone: str) -> str:
    user = user_by_phone(db, phone)
    code = issue_otp(db, phone, user=user, purpose="registration" if user else "verification")
    db.commit()
    return code
