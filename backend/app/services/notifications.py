from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.messaging import send_email, send_sms, send_whatsapp
from app.models import Notification, NotificationDeliveryLog, NotificationPreference, User

logger = logging.getLogger("findora.notifications")


def get_preferences(db: Session, user_id) -> NotificationPreference:
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).one_or_none()
    if pref is None:
        pref = NotificationPreference(user_id=user_id)
        db.add(pref)
        db.flush()
    return pref


def create_notification(
    db: Session,
    *,
    user: User,
    notification_type: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    channels: list[str] | None = None,
    important: bool = False,
) -> Notification:
    """Create an in-app notification and delivery records.

    Core business transactions are never rolled back because a delivery provider fails.
    """
    channels = channels or ["in_app"]
    pref = get_preferences(db, user.id)
    allowed: list[str] = ["in_app"]
    if "sms" in channels and pref.sms:
        allowed.append("sms")
    if "email" in channels and pref.email and user.email:
        allowed.append("email")
    if "whatsapp" in channels and pref.whatsapp:
        allowed.append("whatsapp")
    if important:
        allowed = list(dict.fromkeys(allowed + ["sms"]))
    note = Notification(
        user_id=user.id,
        notification_type=notification_type,
        title=title,
        body=body,
        data=__import__("json").dumps(data or {}, default=str),
        channels=",".join(allowed),
    )
    db.add(note)
    db.flush()
    for channel in allowed:
        if channel == "in_app":
            continue
        recipient = user.phone if channel in {"sms", "whatsapp"} else (user.email or "")
        log = NotificationDeliveryLog(
            notification_id=note.id,
            channel=channel,
            recipient=recipient,
            status="queued",
        )
        db.add(log)
        db.flush()
        try:
            if settings.sms_provider == "mock" and channel == "sms":
                send_sms(recipient, body)
                log.status = "sent"
            elif settings.whatsapp_provider == "mock" and channel == "whatsapp":
                send_whatsapp(recipient, body)
                log.status = "sent"
            elif settings.email_provider == "mock" and channel == "email":
                send_email(recipient, title, body)
                log.status = "sent"
            else:
                # Real providers are processed by the Celery worker.
                try:
                    from app.workers.tasks import deliver_notification_log

                    deliver_notification_log.delay(str(log.id))
                except Exception:  # pragma: no cover - broker unavailable
                    logger.warning("Notification queued; worker unavailable", extra={"extra_fields": {"log_id": str(log.id)}})
        except Exception as exc:  # never break the caller
            log.status = "failed"
            log.error = str(exc)[:1000]
            logger.warning("Notification delivery failed: %s", exc)
    return note
