from __future__ import annotations

import uuid
from datetime import UTC

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_session
from app.core.exceptions import NotFound
from app.core.security import hash_password, normalize_phone, utcnow, verify_password
from app.models import NotificationPreference, Town, User, UserProfile, UserSession
from app.schemas.payloads import ProfileUpdateIn
from app.services.audit import write_audit
from app.services.serializers import user_payload

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me")
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"user": user_payload(user, self_view=True)}


@router.patch("/me")
def update_me(
    payload: ProfileUpdateIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    before = {"name": user.name, "email": user.email}
    if payload.name is not None:
        user.name = payload.name
    if payload.email is not None:
        user.email = str(payload.email)
    profile = user.profile
    if profile is None:
        profile = UserProfile(user_id=user.id)
        db.add(profile)
        user.profile = profile
    if payload.bio is not None:
        profile.bio = payload.bio
    if payload.whatsapp is not None:
        profile.whatsapp = normalize_phone(payload.whatsapp) if payload.whatsapp else None
    if payload.preferred_contact is not None:
        profile.preferred_contact = payload.preferred_contact
    if payload.locale is not None:
        profile.locale = payload.locale
    if payload.marketing_consent is not None:
        profile.marketing_consent = payload.marketing_consent
    if payload.town_id:
        town = db.get(Town, uuid.UUID(payload.town_id))
        if town is None:
            raise NotFound("Town not found.")
        profile.town_id = town.id
    write_audit(
        db,
        actor=user,
        action="user.profile_updated",
        resource_type="user",
        resource_id=user.id,
        before=before,
        after={"name": user.name, "email": user.email},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(user)
    return {"user": user_payload(user, self_view=True)}


@router.get("/me/sessions")
def sessions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    current: UserSession | None = Depends(get_session),
):
    rows = db.execute(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .order_by(UserSession.last_used_at.desc())
    ).scalars().all()
    now = utcnow()
    return {
        "sessions": [
            {
                "id": s.id,
                "ip_address": s.ip_address,
                "user_agent": s.user_agent,
                "created_at": s.created_at,
                "last_used_at": s.last_used_at,
                "expires_at": s.expires_at,
                "current": bool(current and s.id == current.id),
                "active": s.expires_at > now,
            }
            for s in rows
        ]
    }


@router.delete("/me/sessions/{session_id}", status_code=204)
def revoke_user_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.execute(
        select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id)
    ).scalar_one_or_none()
    if session is None:
        raise NotFound("Session not found.")
    session.revoked_at = utcnow()
    write_audit(
        db,
        actor=user,
        action="session.revoked",
        resource_type="session",
        resource_id=session.id,
    )
    db.commit()
    return None


@router.post("/me/change-password")
def change_password(
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current = payload.get("current_password", "")
    new = payload.get("new_password", "")
    if not verify_password(current, user.password_hash):
        from app.core.exceptions import ValidationError

        raise ValidationError("Your current password is incorrect.")
    if len(new) < 8:
        from app.core.exceptions import ValidationError

        raise ValidationError("Password must be at least 8 characters.")
    user.password_hash = hash_password(new)
    db.query(UserSession).filter(
        UserSession.user_id == user.id, UserSession.revoked_at.is_(None)
    ).update({"revoked_at": utcnow()}, synchronize_session=False)
    write_audit(
        db,
        actor=user,
        action="user.password_changed",
        resource_type="user",
        resource_id=user.id,
    )
    db.commit()
    return {"message": "Password changed. Sign in again on your other devices."}
