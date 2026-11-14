from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from celery import shared_task
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import session_scope
from app.integrations.messaging import send_email, send_sms, send_whatsapp
from app.models import (
    Notification,
    NotificationDeliveryLog,
    Property,
    PropertyAvailability,
    PropertyHistoryEvent,
    User,
    UserSession,
)
from app.models.base import AvailabilityStatus, PropertyStatus
from app.services.notifications import create_notification
from app.services.serializers import ensure_aware, freshness_days, is_fresh

logger = logging.getLogger("findora.workers")


@shared_task(bind=True, max_retries=5, default_retry_delay=60)
def deliver_notification_log(self, log_id: str):
    with session_scope() as db:
        log = db.get(NotificationDeliveryLog, log_id)
        if log is None or log.status == "sent":
            return "skipped"
        notification = db.get(Notification, log.notification_id)
        if notification is None:
            return "missing_notification"
        log.attempts += 1
        try:
            if log.channel == "sms":
                send_sms(log.recipient, notification.body)
            elif log.channel == "email":
                send_email(log.recipient, notification.title, notification.body)
            elif log.channel == "whatsapp":
                send_whatsapp(log.recipient, notification.body)
            else:
                log.status = "skipped"
                return "unsupported_channel"
            log.status = "sent"
            log.sent_at = datetime.now(UTC)
            log.provider_reference = f"worker-{self.request.id or 'sync'}"
            log.error = None
            return "sent"
        except Exception as exc:
            log.status = "failed"
            log.error = str(exc)[:1000]
            raise self.retry(exc=exc)


@shared_task
def retry_notification_delivery():
    cutoff = datetime.now(UTC) - timedelta(minutes=5)
    with session_scope() as db:
        logs = db.execute(
            select(NotificationDeliveryLog)
            .where(
                NotificationDeliveryLog.status.in_(["queued", "failed"]),
                NotificationDeliveryLog.attempts < 3,
                NotificationDeliveryLog.created_at <= cutoff,
            )
            .limit(100)
        ).scalars().all()
        for log in logs:
            try:
                deliver_notification_log.delay(str(log.id))
            except Exception:
                logger.warning("Could not enqueue notification %s", log.id)
        return {"queued": len(logs)}


@shared_task
def send_availability_reminders():
    reminder_days = getattr(settings, "availability_reminder_days", 3)
    with session_scope() as db:
        cutoff = datetime.now(UTC) - timedelta(days=reminder_days)
        props = db.execute(
            select(Property).where(
                Property.status == PropertyStatus.APPROVED.value,
                Property.availability_status == AvailabilityStatus.AVAILABLE.value,
                Property.deleted_at.is_(None),
                Property.last_confirmed_available_at.is_not(None),
                Property.last_confirmed_available_at <= cutoff,
            )
        ).scalars().all()
        count = 0
        for prop in props:
            if not is_fresh(prop):
                continue
            owner = db.get(User, prop.owner_id) if prop.owner_id else None
            if not owner:
                continue
            create_notification(
                db,
                user=owner,
                notification_type="availability_reminder",
                title="Is your property still available?",
                body=f"{prop.title} ({prop.reference}) needs a fresh availability confirmation. Confirm it in your dashboard to keep it visible.",
                data={"property_id": str(prop.id)},
                channels=["in_app", "sms"],
                important=True,
            )
            count += 1
        return {"reminders": count}


@shared_task
def expire_stale_availability():
    with session_scope() as db:
        props = db.execute(
            select(Property).where(
                Property.status == PropertyStatus.APPROVED.value,
                Property.availability_status == AvailabilityStatus.AVAILABLE.value,
                Property.deleted_at.is_(None),
                Property.last_confirmed_available_at.is_not(None),
            )
        ).scalars().all()
        count = 0
        now = datetime.now(UTC)
        for prop in props:
            days = freshness_days(prop)
            confirmed = ensure_aware(prop.last_confirmed_available_at)
            if confirmed and (now - confirmed) <= timedelta(days=days):
                continue
            prop.availability_status = AvailabilityStatus.UNCONFIRMED.value
            db.add(
                PropertyAvailability(
                    property_id=prop.id,
                    status=AvailabilityStatus.UNCONFIRMED.value,
                    confirmed_at=None,
                    source="system",
                    notes=f"Freshness window of {days} days expired without confirmation.",
                )
            )
            db.add(
                PropertyHistoryEvent(
                    property_id=prop.id,
                    event_type="availability_expired",
                    summary="Availability confirmation expired; listing hidden from available results",
                    visibility="public",
                )
            )
            owner = db.get(User, prop.owner_id) if prop.owner_id else None
            if owner:
                create_notification(
                    db,
                    user=owner,
                    notification_type="availability_expired",
                    title="Your listing is now unconfirmed",
                    body=f"{prop.title} passed its {days}-day availability window. Confirm availability to relist it.",
                    data={"property_id": str(prop.id)},
                    channels=["in_app", "sms"],
                    important=True,
                )
            count += 1
        return {"expired": count}


@shared_task
def expire_featured_listings():
    with session_scope() as db:
        now = datetime.now(UTC)
        props = db.execute(
            select(Property).where(Property.is_featured.is_(True), Property.featured_until.is_not(None), Property.featured_until < now)
        ).scalars().all()
        for prop in props:
            prop.is_featured = False
        return {"expired": len(props)}


@shared_task
def cleanup_expired_sessions():
    with session_scope() as db:
        now = datetime.now(UTC)
        sessions = db.execute(
            select(UserSession).where(UserSession.expires_at < now, UserSession.revoked_at.is_(None))
        ).scalars().all()
        for session in sessions:
            session.revoked_at = now
        return {"revoked": len(sessions)}
