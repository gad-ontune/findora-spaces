from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import NotFound
from app.models import Notification, NotificationPreference, User
from app.schemas.payloads import NotificationPreferencesIn
from app.services.notifications import get_preferences
from app.services.serializers import notification_payload, utcnow

router = APIRouter(tags=["Notifications"])


@router.get("/notifications")
def list_notifications(
    unread_only: bool = Query(default=False),
    notification_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    if notification_type:
        query = query.where(Notification.notification_type == notification_type)
    rows = db.execute(
        query.order_by(Notification.created_at.desc()).limit(limit)
    ).scalars().all()
    unread = db.execute(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    ).scalars().all()
    return {
        "notifications": [notification_payload(n) for n in rows],
        "unread_count": len(unread),
    }


@router.patch("/notifications/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    ).scalars().all()
    now = utcnow()
    for row in rows:
        row.read_at = now
    db.commit()
    return {"updated": len(rows), "message": "All notifications marked as read."}


@router.patch("/notifications/{notification_id}")
def mark_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(Notification, notification_id)
    if row is None or row.user_id != user.id:
        raise NotFound("Notification not found.")
    row.read_at = row.read_at or utcnow()
    db.commit()
    return {"notification": notification_payload(row)}


def _prefs_payload(pref: NotificationPreference) -> dict:
    return {
        "in_app": pref.in_app,
        "sms": pref.sms,
        "email": pref.email,
        "whatsapp": pref.whatsapp,
        "marketing": pref.marketing,
        "note": "Critical transactional messages may still be delivered even when optional channels are disabled.",
    }


@router.get("/notification-preferences")
def get_notification_preferences(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pref = get_preferences(db, user.id)
    db.commit()
    return {"preferences": _prefs_payload(pref)}


@router.patch("/notification-preferences")
def update_notification_preferences(
    payload: NotificationPreferencesIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pref = get_preferences(db, user.id)
    for field in ("in_app", "sms", "email", "whatsapp", "marketing"):
        value = getattr(payload, field)
        if value is not None:
            setattr(pref, field, value)
    db.commit()
    return {"preferences": _prefs_payload(pref), "message": "Notification preferences updated."}
