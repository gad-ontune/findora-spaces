from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import User
from app.services import subscription_service
from app.services.audit import write_audit

router = APIRouter(tags=["Subscriptions"])


def _payload(db: Session, user: User) -> dict:
    summary = subscription_service.subscription_summary(db, user)
    plans = subscription_service.active_plans(db)
    return {"subscription": summary, "plans": plans}


@router.get("/subscriptions/me")
def my_subscription(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    payload = _payload(db, user)
    # Persist any subscriptions that just crossed their end date.
    db.commit()
    return payload


@router.post("/subscriptions/cancel")
def cancel_subscription(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    subscription = subscription_service.cancel_subscription(db, user)
    write_audit(
        db,
        actor=user,
        action="subscription.cancelled",
        resource_type="subscription",
        resource_id=subscription.id,
        after={"status": subscription.status, "ends_at": subscription.ends_at},
    )
    payload = _payload(db, user)
    db.commit()
    return {
        "subscription": payload["subscription"],
        "message": (
            "Your plan will stay active until the end of the current period. "
            "You can resume it before then."
        ),
    }


@router.post("/subscriptions/resume")
def resume_subscription(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    subscription = subscription_service.resume_subscription(db, user)
    write_audit(
        db,
        actor=user,
        action="subscription.resumed",
        resource_type="subscription",
        resource_id=subscription.id,
        after={"status": subscription.status, "ends_at": subscription.ends_at},
    )
    payload = _payload(db, user)
    db.commit()
    return {
        "subscription": payload["subscription"],
        "message": "Your plan will renew at the end of the current period.",
    }
