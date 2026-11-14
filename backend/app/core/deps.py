from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from starlette.requests import Request

from app.core.database import get_db
from app.core.exceptions import Forbidden, Unauthorized
from app.core.security import token_hash, utcnow
from app.models import User, UserSession


def get_session(
    request: Request, db: Session = Depends(get_db)
) -> UserSession | None:
    from app.core.config import settings

    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    stmt = (
        select(UserSession)
        .where(
            UserSession.token_hash == token_hash(token),
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > utcnow(),
        )
        .options(
            selectinload(UserSession.user).selectinload(User.roles)
        )
    )
    session = db.execute(stmt).scalar_one_or_none()
    if session is None:
        return None
    if session.user.status != "active":
        return None
    return session


def get_optional_user(
    session: UserSession | None = Depends(get_session),
    db: Session = Depends(get_db),
) -> User | None:
    if session is None:
        return None
    # Touch session last-used time (cheap, not committed on every public request unless session exists).
    session.last_used_at = utcnow()
    db.add(session)
    db.commit()
    return session.user


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if user is None:
        raise Unauthorized()
    return user


def permission_codes(user: User) -> set[str]:
    return {perm.code for role in user.roles for perm in role.permissions}


def require_permissions(*codes: str) -> Callable[..., User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        granted = permission_codes(user)
        missing = [c for c in codes if c not in granted]
        if missing:
            raise Forbidden(
                "Your account does not have permission for this action.",
                details={"missing_permissions": missing},
            )
        return user

    return dependency


def require_any_permission(*codes: str) -> Callable[..., User]:
    """Allow access when the user holds at least one of the listed permissions."""

    def dependency(user: User = Depends(get_current_user)) -> User:
        granted = permission_codes(user)
        if not any(code in granted for code in codes):
            raise Forbidden(
                "Your account does not have permission for this action.",
                details={"required_any_permission": list(codes)},
            )
        return user

    return dependency


def require_verified_phone(user: User = Depends(get_current_user)) -> User:
    if not user.phone_verified_at:
        raise Forbidden(
            "Verify your phone number before continuing.",
            code="phone_not_verified",
        )
    return user


def require_staff(user: User = Depends(get_current_user)) -> User:
    staff = {
        "support_officer",
        "verification_officer",
        "moderator",
        "finance_officer",
        "super_admin",
    }
    if not set(user.role_codes) & staff:
        raise Forbidden("Staff access is required.")
    return user


class PageParams:
    def __init__(
        self,
        page: int = Query(1, ge=1, le=10_000),
        page_size: int = Query(20, ge=1, le=100),
    ):
        self.page = page
        self.page_size = page_size
        self.offset = (page - 1) * page_size


def paginate(items: list[Any], total: int, page: int, page_size: int) -> dict[str, Any]:
    pages = (total + page_size - 1) // page_size if page_size else 1
    return {
        "items": items,
        "pagination": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
            "has_next": page < pages,
            "has_prev": page > 1,
        },
    }
