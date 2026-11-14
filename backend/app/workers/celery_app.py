from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "findora",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Africa/Nairobi",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "availability-reminders": {
            "task": "app.workers.tasks.send_availability_reminders",
            "schedule": crontab(hour=8, minute=0),
        },
        "expire-stale-availability": {
            "task": "app.workers.tasks.expire_stale_availability",
            "schedule": crontab(minute=15),
        },
        "expire-featured-listings": {
            "task": "app.workers.tasks.expire_featured_listings",
            "schedule": crontab(minute=30),
        },
        "retry-notification-delivery": {
            "task": "app.workers.tasks.retry_notification_delivery",
            "schedule": crontab(minute="*/10"),
        },
        "cleanup-expired-sessions": {
            "task": "app.workers.tasks.cleanup_expired_sessions",
            "schedule": crontab(hour=2, minute=30),
        },
    },
)
