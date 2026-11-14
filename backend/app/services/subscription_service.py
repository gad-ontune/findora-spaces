from __future__ import annotations

import json
import math
from datetime import timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFound, ValidationError
from app.core.permissions import is_staff
from app.models import Property, PropertyManager, Subscription, SubscriptionPlan, User
from app.models.base import PropertyStatus
from app.services.serializers import ensure_aware, utcnow

FREE_PLAN_CODE = "landlord_free"
ACTIVE_STATUSES = ("active", "cancelling")
COUNTED_STATUSES = (
    PropertyStatus.PENDING.value,
    PropertyStatus.APPROVED.value,
    PropertyStatus.SUSPENDED.value,
)
PLAN_PERIOD_DAYS = {"monthly": 30, "quarterly": 90, "annual": 365}

# Plans are product configuration, not demo data. They are created by bootstrap so a
# fresh install and the automated test database both have a working free plan.
DEFAULT_PLAN_SPECS: tuple[dict[str, Any], ...] = (
    {
        "code": "landlord_free",
        "name": "Landlord Starter",
        "description": "List up to two properties and manage enquiries.",
        "price": Decimal("0"),
        "currency": "KES",
        "period": "monthly",
        "features": ["2 active listings", "Enquiry inbox", "Availability reminders"],
        "listing_limit": 2,
    },
    {
        "code": "landlord_growth",
        "name": "Landlord Growth",
        "description": "For landlords and managers with a growing portfolio.",
        "price": Decimal("1000"),
        "currency": "KES",
        "period": "monthly",
        "features": ["10 active listings", "Priority support", "Performance overview"],
        "listing_limit": 10,
    },
    {
        "code": "partner_pro",
        "name": "Partner Pro",
        "description": "For independent property managers and agents.",
        "price": Decimal("2500"),
        "currency": "KES",
        "period": "monthly",
        "features": [
            "25 active listings",
            "Assisted search assignments",
            "Advanced analytics",
        ],
        "listing_limit": 25,
    },
)


def ensure_default_plans(db: Session) -> None:
    """Create missing plan rows without overwriting prices edited by staff."""
    existing = set(db.execute(select(SubscriptionPlan.code)).scalars().all())
    for spec in DEFAULT_PLAN_SPECS:
        if spec["code"] in existing:
            continue
        db.add(
            SubscriptionPlan(
                code=spec["code"],
                name=spec["name"],
                description=spec["description"],
                price=spec["price"],
                currency=spec["currency"],
                period=spec["period"],
                features=json.dumps(spec["features"]),
                listing_limit=spec["listing_limit"],
                is_active=True,
            )
        )
    db.flush()


def _features(plan: SubscriptionPlan) -> list[str]:
    try:
        value = json.loads(plan.features or "[]")
    except (TypeError, ValueError):
        return []
    return value if isinstance(value, list) else []


def plan_payload(plan: SubscriptionPlan | None) -> dict[str, Any] | None:
    if plan is None:
        return None
    return {
        "id": plan.id,
        "code": plan.code,
        "name": plan.name,
        "description": plan.description,
        "price": float(plan.price),
        "currency": plan.currency,
        "period": plan.period,
        "features": _features(plan),
        "listing_limit": plan.listing_limit,
    }


def active_plans(db: Session) -> list[dict[str, Any]]:
    rows = (
        db.execute(
            select(SubscriptionPlan)
            .where(SubscriptionPlan.is_active.is_(True))
            .order_by(SubscriptionPlan.price, SubscriptionPlan.listing_limit)
        )
        .scalars()
        .all()
    )
    return [plan_payload(row) for row in rows if row is not None]


def _refresh_expired(db: Session, user_id) -> None:
    now = utcnow()
    rows = (
        db.execute(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.status.in_(ACTIVE_STATUSES),
            )
        )
        .scalars()
        .all()
    )
    changed = False
    for subscription in rows:
        ends_at = ensure_aware(subscription.ends_at)
        if ends_at is not None and ends_at <= now:
            subscription.status = "expired"
            changed = True
    if changed:
        db.flush()


def _active_subscription(db: Session, user: User) -> Subscription | None:
    _refresh_expired(db, user.id)
    now = utcnow()
    rows = (
        db.execute(
            select(Subscription)
            .where(
                Subscription.user_id == user.id,
                Subscription.status.in_(ACTIVE_STATUSES),
                or_(Subscription.ends_at.is_(None), Subscription.ends_at > now),
            )
            .order_by(Subscription.created_at.desc())
        )
        .scalars()
        .all()
    )
    return rows[0] if rows else None


def _free_plan(db: Session) -> SubscriptionPlan | None:
    return db.execute(
        select(SubscriptionPlan).where(
            SubscriptionPlan.code == FREE_PLAN_CODE,
            SubscriptionPlan.is_active.is_(True),
        )
    ).scalar_one_or_none()


def _entitlement(db: Session, user: User) -> tuple[Subscription | None, SubscriptionPlan | None]:
    subscription = _active_subscription(db, user)
    if subscription is not None:
        plan = db.get(SubscriptionPlan, subscription.plan_id)
        if plan is not None:
            return subscription, plan
    return None, _free_plan(db)


def listing_usage(db: Session, user: User) -> int:
    """Count listings that occupy a plan slot for this account.

    Archived, rejected and deleted listings do not count. Pending, approved and
    suspended listings do, because they remain part of the account's portfolio.
    """
    managed_property_ids = select(PropertyManager.property_id).where(
        PropertyManager.user_id == user.id,
        PropertyManager.status == "active",
    )
    count = db.execute(
        select(func.count(func.distinct(Property.id))).where(
            Property.deleted_at.is_(None),
            Property.status.in_(COUNTED_STATUSES),
            or_(
                Property.owner_id == user.id,
                Property.manager_id == user.id,
                Property.created_by_id == user.id,
                Property.id.in_(managed_property_ids),
            ),
        )
    ).scalar_one()
    return int(count or 0)


def subscription_summary(db: Session, user: User) -> dict[str, Any]:
    subscription, plan = _entitlement(db, user)
    used = listing_usage(db, user)
    staff_exempt = is_staff(user.role_codes)
    limit = None if staff_exempt else (plan.listing_limit if plan is not None else 2)
    remaining = None if limit is None else max(0, limit - used)
    now = utcnow()

    days_remaining = None
    if subscription is not None:
        ends_at = ensure_aware(subscription.ends_at)
        if ends_at is not None:
            days_remaining = max(0, math.ceil((ends_at - now).total_seconds() / 86400))

    status = "free"
    if subscription is not None:
        status = "cancelling" if subscription.status == "cancelling" else "active"

    return {
        "id": subscription.id if subscription is not None else None,
        "status": status,
        "plan": plan_payload(plan),
        "starts_at": subscription.starts_at if subscription is not None else None,
        "ends_at": subscription.ends_at if subscription is not None else None,
        "days_remaining": days_remaining,
        "cancel_at_period_end": bool(
            subscription is not None and subscription.status == "cancelling"
        ),
        "listing_limit": limit,
        "listings_used": used,
        "listings_remaining": remaining,
        "can_create_listing": staff_exempt or limit is None or used < limit,
        "staff_exempt": staff_exempt,
        "payment_id": subscription.payment_id if subscription is not None else None,
        "is_free": subscription is None,
    }


def enforce_listing_limit(db: Session, user: User) -> None:
    if is_staff(user.role_codes):
        return
    summary = subscription_summary(db, user)
    if summary["can_create_listing"]:
        return
    plan = summary["plan"]
    plan_name = plan["name"] if plan else "current"
    raise ValidationError(
        f"Your {plan_name} plan allows {summary['listing_limit']} active listings. "
        "Archive a listing or choose a larger plan before adding another.",
        code="listing_limit_reached",
        details={
            "plan_code": plan["code"] if plan else None,
            "listing_limit": summary["listing_limit"],
            "listings_used": summary["listings_used"],
        },
    )


def activate_from_payment(db: Session, payment) -> Subscription | None:
    """Activate, renew or replace a subscription after a confirmed payment.

    A payment for the same plan extends the current period. A payment for a
    different plan replaces the current plan immediately. No subscription is
    created for a payment that the backend has not marked successful.
    """
    if payment.related_id is None or payment.user_id is None:
        return None
    plan = db.get(SubscriptionPlan, payment.related_id)
    if plan is None:
        return None

    now = utcnow()
    days = PLAN_PERIOD_DAYS.get(plan.period, 30)
    existing = (
        db.execute(
            select(Subscription).where(
                Subscription.user_id == payment.user_id,
                Subscription.status.in_(ACTIVE_STATUSES),
            )
        )
        .scalars()
        .all()
    )
    same_plan = next(
        (
            subscription
            for subscription in existing
            if subscription.plan_id == plan.id
            and (
                subscription.ends_at is None
                or ensure_aware(subscription.ends_at) > now
            )
        ),
        None,
    )

    for subscription in existing:
        if same_plan is not None and subscription.id == same_plan.id:
            continue
        ends_at = ensure_aware(subscription.ends_at)
        if ends_at is not None and ends_at <= now:
            subscription.status = "expired"
        else:
            subscription.status = "replaced"
            subscription.ends_at = now

    if same_plan is not None:
        base = ensure_aware(same_plan.ends_at) or now
        same_plan.starts_at = same_plan.starts_at or now
        same_plan.ends_at = base + timedelta(days=days)
        same_plan.status = "active"
        same_plan.payment_id = payment.id
        db.flush()
        return same_plan

    subscription = Subscription(
        user_id=payment.user_id,
        plan_id=plan.id,
        status="active",
        starts_at=now,
        ends_at=now + timedelta(days=days),
        payment_id=payment.id,
    )
    db.add(subscription)
    db.flush()
    return subscription


def cancel_for_refund(db: Session, payment) -> None:
    """Revoke the subscription tied to a fully refunded subscription payment."""
    if payment.purpose != "subscription" or payment.user_id is None:
        return
    subscription = db.execute(
        select(Subscription).where(
            Subscription.payment_id == payment.id,
            Subscription.status.in_(ACTIVE_STATUSES),
        )
    ).scalar_one_or_none()
    if subscription is not None:
        subscription.status = "cancelled"
        subscription.ends_at = utcnow()
        db.flush()


def cancel_subscription(db: Session, user: User) -> Subscription:
    subscription = _active_subscription(db, user)
    if subscription is None:
        raise NotFound("You do not have an active paid subscription to cancel.")
    if subscription.status != "cancelling":
        subscription.status = "cancelling"
        db.flush()
    return subscription


def resume_subscription(db: Session, user: User) -> Subscription:
    subscription = _active_subscription(db, user)
    if subscription is None:
        raise NotFound("You do not have an active subscription to resume.")
    if subscription.status != "active":
        subscription.status = "active"
        db.flush()
    return subscription
