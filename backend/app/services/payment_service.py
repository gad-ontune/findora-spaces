from __future__ import annotations

import hmac
import json
import secrets
import string
import uuid
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.bootstrap import get_setting
from app.core.config import settings
from app.core.exceptions import Conflict, Forbidden, NotFound, ValidationError
from app.integrations.mpesa import initiate_stk_push, parse_callback
from app.models import (
    FinancialReconciliationRecord,
    Property,
    PropertyHistoryEvent,
    Invoice,
    Payment,
    PaymentEvent,
    Promotion,
    Refund,
    SearchRequest,
    Subscription,
    SubscriptionPlan,
    User,
)
from app.models.base import PaymentStatus
from app.schemas.payloads import PaymentInitiateIn
from app.services.audit import write_audit
from app.services.notifications import create_notification
from app.services.property_service import can_manage_property, load_property
from app.services.serializers import utcnow


def _reference(prefix: str = "PAY") -> str:
    alphabet = string.ascii_uppercase + string.digits
    return f"{prefix}-{''.join(secrets.choice(alphabet) for _ in range(8))}"


def _price_for(db: Session, payload: PaymentInitiateIn, user: User) -> tuple[Decimal, str, str | None]:
    if payload.purpose == "assisted_search":
        if not payload.related_id:
            raise ValidationError("Select the assisted search request you are paying for.")
        request = db.get(SearchRequest, uuid.UUID(payload.related_id))
        if request is None or request.user_id != user.id:
            raise NotFound("Assisted search request not found.")
        fee = Decimal(str(get_setting(db, "service.assisted_search_fee", 300)))
        existing = db.execute(
            select(Payment).where(
                Payment.user_id == user.id,
                Payment.purpose == "assisted_search",
                Payment.related_id == request.id,
                Payment.status == PaymentStatus.SUCCESS.value,
            )
        ).scalar_one_or_none()
        if existing:
            raise Conflict("This assisted search service has already been paid for.")
        return fee, f"Assisted property search service · {request.reference}", "search_request"
    if payload.purpose == "featured_listing":
        if not payload.related_id:
            raise ValidationError("Select a property to feature.")
        prop = load_property(db, payload.related_id)
        if not can_manage_property(db, prop, user):
            raise Forbidden("You can only promote properties you manage.")
        fee = Decimal(str(get_setting(db, "service.featured_listing_fee", 200)))
        return fee, f"Featured listing · {prop.reference}", "property"
    if payload.purpose == "subscription":
        if not payload.plan_code:
            raise ValidationError("Select a subscription plan.")
        plan = db.execute(
            select(SubscriptionPlan).where(
                SubscriptionPlan.code == payload.plan_code,
                SubscriptionPlan.is_active.is_(True),
            )
        ).scalar_one_or_none()
        if plan is None:
            raise NotFound("Subscription plan not found.")
        return plan.price, f"Subscription · {plan.name}", "subscription_plan"
    if payload.purpose == "inspection":
        if not payload.related_id:
            raise ValidationError("Select a property for the inspection service.")
        prop = load_property(db, payload.related_id)
        if not can_manage_property(db, prop, user) and "super_admin" not in user.role_codes:
            raise Forbidden("You can only request inspections for properties you manage.")
        fee = Decimal(str(get_setting(db, "service.inspection_fee", 1000)))
        return fee, f"Property inspection · {prop.reference}", "property"
    raise ValidationError("Unsupported payment purpose.")


def initiate_payment(db: Session, user: User, payload: PaymentInitiateIn) -> Payment:
    existing = db.execute(
        select(Payment).where(Payment.idempotency_key == payload.idempotency_key)
    ).scalar_one_or_none()
    if existing:
        if existing.user_id != user.id:
            raise Forbidden("This idempotency key belongs to another account.")
        return existing
    amount, description, related_type = _price_for(db, payload, user)
    payment = Payment(
        reference=_reference(),
        user_id=user.id,
        purpose=payload.purpose,
        related_type=related_type,
        related_id=uuid.UUID(payload.related_id) if payload.related_id else None,
        amount=amount,
        currency="KES",
        status=PaymentStatus.INITIATED.value,
        provider="mpesa",
        phone=payload.phone or user.phone,
        idempotency_key=payload.idempotency_key,
        description=description,
    )
    db.add(payment)
    db.flush()
    db.add(
        PaymentEvent(
            payment_id=payment.id,
            event_type="initiated",
            payload=json.dumps(
                {
                    "purpose": payload.purpose,
                    "amount": str(amount),
                    "phone": payment.phone,
                    "mock": settings.mpesa_mock,
                }
            ),
        )
    )
    try:
        result = initiate_stk_push(
            phone=payment.phone or user.phone,
            amount=float(amount),
            reference=payment.reference,
            description=description,
        )
        payment.provider_reference = result.reference
        if result.status == "success":
            _mark_success(db, payment, result.reference, result.raw)
        elif result.status == "pending":
            payment.status = PaymentStatus.PENDING.value
        else:
            payment.status = PaymentStatus.FAILED.value
            payment.failure_reason = result.message
    except Exception as exc:  # record the failure, never silently claim success
        payment.status = PaymentStatus.FAILED.value
        payment.failure_reason = str(exc)[:1000]
        db.add(
            PaymentEvent(
                payment_id=payment.id,
                event_type="initiation_failed",
                payload=json.dumps({"error": str(exc)[:1000]}),
            )
        )
    write_audit(
        db,
        actor=user,
        action="payment.initiated",
        resource_type="payment",
        resource_id=payment.id,
        after={"reference": payment.reference, "status": payment.status, "amount": str(amount)},
    )
    db.commit()
    db.refresh(payment)
    return payment


def _invoice(db: Session, payment: Payment) -> Invoice:
    existing = db.execute(select(Invoice).where(Invoice.payment_id == payment.id)).scalar_one_or_none()
    if existing:
        return existing
    invoice = Invoice(
        number=f"INV-{utcnow():%Y%m}-{secrets.randbelow(900000) + 100000}",
        payment_id=payment.id,
        user_id=payment.user_id,
        amount=payment.amount,
        currency=payment.currency,
        status="paid",
        line_items=json.dumps(
            [{"description": payment.description, "amount": str(payment.amount)}]
        ),
        paid_at=utcnow(),
    )
    db.add(invoice)
    return invoice


def _apply_entitlement(db: Session, payment: Payment) -> None:
    if payment.purpose == "featured_listing" and payment.related_id:
        prop = db.get(Property, payment.related_id)
        if prop:
            prop.is_featured = True
            prop.featured_until = utcnow() + timedelta(days=14)
            db.add(
                PropertyHistoryEvent(
                    property_id=prop.id,
                    event_type="listing_featured",
                    summary="Listing promoted as a featured property",
                    visibility="public",
                    actor_id=payment.user_id,
                )
            )
    elif payment.purpose == "subscription" and payment.related_id:
        plan = db.get(SubscriptionPlan, payment.related_id)
        if plan:
            now = utcnow()
            days = {"monthly": 30, "quarterly": 90, "annual": 365}.get(plan.period, 30)
            db.add(
                Subscription(
                    user_id=payment.user_id,
                    plan_id=plan.id,
                    status="active",
                    starts_at=now,
                    ends_at=now + timedelta(days=days),
                    payment_id=payment.id,
                )
            )


def _mark_success(db: Session, payment: Payment, provider_reference: str | None, provider_payload: dict | None = None) -> None:
    if payment.status == PaymentStatus.SUCCESS.value:
        return
    payment.status = PaymentStatus.SUCCESS.value
    payment.provider_reference = provider_reference or payment.provider_reference
    payment.completed_at = utcnow()
    payment.failure_reason = None
    db.add(
        PaymentEvent(
            payment_id=payment.id,
            event_type="succeeded",
            payload=json.dumps(provider_payload or {}),
            provider_reference=provider_reference,
        )
    )
    _invoice(db, payment)
    _apply_entitlement(db, payment)
    if payment.user_id:
        user = db.get(User, payment.user_id)
        if user:
            create_notification(
                db,
                user=user,
                notification_type="payment_successful",
                title="Payment confirmed",
                body=f"{payment.description} — KES {float(payment.amount):,.0f}. Reference {payment.reference}.",
                data={"payment_id": str(payment.id), "reference": payment.reference},
                channels=["in_app", "sms"],
                important=True,
            )


def _mark_failed(db: Session, payment: Payment, reason: str, provider_payload: dict | None = None) -> None:
    if payment.status == PaymentStatus.SUCCESS.value:
        return
    payment.status = PaymentStatus.FAILED.value
    payment.failure_reason = reason[:1000]
    db.add(
        PaymentEvent(
            payment_id=payment.id,
            event_type="failed",
            payload=json.dumps(provider_payload or {}),
            provider_reference=payment.provider_reference,
        )
    )
    if payment.user_id:
        user = db.get(User, payment.user_id)
        if user:
            create_notification(
                db,
                user=user,
                notification_type="payment_failed",
                title="Payment was not completed",
                body=f"{payment.description} could not be completed. {reason[:200]}",
                data={"payment_id": str(payment.id)},
                channels=["in_app"],
            )


def handle_callback(db: Session, payload: dict, secret: str | None) -> dict:
    expected = settings.mpesa_callback_secret
    if expected and (not secret or not hmac.compare_digest(secret, expected)):
        raise Forbidden("Invalid payment callback secret.", code="invalid_callback")
    parsed = parse_callback(payload)
    checkout_id = parsed.get("checkout_request_id")
    payment = None
    if checkout_id:
        payment = db.execute(
            select(Payment).where(Payment.provider_reference == checkout_id)
        ).scalar_one_or_none()
    if payment is None:
        # Try the AccountReference in case the callback arrives before the reference was stored.
        reference = payload.get("AccountReference")
        if reference:
            payment = db.execute(select(Payment).where(Payment.reference == reference)).scalar_one_or_none()
    if payment is None:
        return {"accepted": False, "reason": "unknown_payment", "idempotent": False}
    db.add(
        PaymentEvent(
            payment_id=payment.id,
            event_type="callback_received",
            payload=json.dumps(payload),
            provider_reference=checkout_id,
        )
    )
    if payment.status == PaymentStatus.SUCCESS.value:
        db.commit()
        return {"accepted": True, "already_processed": True, "status": payment.status}
    if parsed["success"]:
        callback_amount = parsed.get("amount")
        if callback_amount is not None and Decimal(str(callback_amount)) != payment.amount:
            _mark_failed(db, payment, "Callback amount did not match the expected amount.", payload)
            write_audit(
                db,
                actor=None,
                action="payment.callback_amount_mismatch",
                resource_type="payment",
                resource_id=payment.id,
                after={"expected": str(payment.amount), "received": str(callback_amount)},
            )
            db.commit()
            return {"accepted": True, "status": payment.status, "reason": "amount_mismatch"}
        _mark_success(db, payment, parsed.get("receipt") or checkout_id, payload)
    else:
        _mark_failed(db, payment, parsed.get("result_desc") or "Payment failed.", payload)
    write_audit(
        db,
        actor=None,
        action="payment.callback_processed",
        resource_type="payment",
        resource_id=payment.id,
        after={"status": payment.status, "receipt": parsed.get("receipt")},
    )
    db.commit()
    return {"accepted": True, "already_processed": False, "status": payment.status}


def refund_payment(
    db: Session, payment: Payment, amount: Decimal, reason: str, officer: User
) -> Refund:
    if payment.status not in {PaymentStatus.SUCCESS.value, PaymentStatus.REFUNDED.value}:
        raise ValidationError("Only successful payments can be refunded.")
    refunded_total = sum(
        r.amount for r in db.execute(select(Refund).where(Refund.payment_id == payment.id, Refund.status == "completed")).scalars().all()
    )
    remaining = payment.amount - refunded_total
    if amount <= 0 or amount > remaining:
        raise ValidationError("Refund amount exceeds the remaining refundable balance.")
    refund = Refund(
        payment_id=payment.id,
        amount=amount,
        currency=payment.currency,
        reason=reason,
        status="completed",
        processed_by_id=officer.id,
        provider_reference=f"MOCKREF-{_reference('REF')}" if settings.mpesa_mock else None,
        completed_at=utcnow(),
    )
    db.add(refund)
    if amount >= remaining:
        payment.status = PaymentStatus.REFUNDED.value
    db.add(
        PaymentEvent(
            payment_id=payment.id,
            event_type="refunded",
            payload=json.dumps({"amount": str(amount), "reason": reason}),
        )
    )
    if payment.user_id:
        user = db.get(User, payment.user_id)
        if user:
            create_notification(
                db,
                user=user,
                notification_type="refund_processed",
                title="Refund processed",
                body=f"KES {float(amount):,.0f} was refunded for {payment.reference}.",
                data={"payment_id": str(payment.id)},
                channels=["in_app", "sms"],
                important=True,
            )
    write_audit(
        db,
        actor=officer,
        action="payment.refunded",
        resource_type="payment",
        resource_id=payment.id,
        after={"amount": str(amount), "reason": reason},
    )
    db.commit()
    db.refresh(refund)
    return refund


def reconcile(db: Session, date, provider_total: Decimal, officer: User) -> FinancialReconciliationRecord:
    internal_total = db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status == PaymentStatus.SUCCESS.value,
            func.date(Payment.completed_at) == date,
        )
    ).scalar_one()
    difference = Decimal(str(provider_total)) - Decimal(str(internal_total))
    record = FinancialReconciliationRecord(
        reconciliation_date=date,
        provider="mpesa",
        provider_total=provider_total,
        internal_total=internal_total,
        difference=difference,
        transaction_count=db.execute(
            select(func.count(Payment.id)).where(
                Payment.status == PaymentStatus.SUCCESS.value,
                func.date(Payment.completed_at) == date,
            )
        ).scalar_one(),
        status="balanced" if difference == 0 else "discrepancy",
        notes="Provider total is supplied by finance during reconciliation.",
    )
    db.add(record)
    write_audit(
        db,
        actor=officer,
        action="finance.reconciliation_created",
        resource_type="reconciliation",
        resource_id=record.id,
        after={"date": str(date), "difference": str(difference)},
    )
    db.commit()
    db.refresh(record)
    return record
