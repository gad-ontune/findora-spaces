from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permissions
from app.core.exceptions import Forbidden, NotFound
from app.core.permissions import P
from app.models import (
    Invoice,
    Payment,
    Promotion,
    SubscriptionPlan,
    User,
)
from app.models.base import PaymentStatus
from app.schemas.payloads import PaymentInitiateIn, RefundIn
from app.services import payment_service
from app.services.serializers import payment_payload

router = APIRouter(tags=["Payments"])


@router.get("/plans")
def list_plans(db: Session = Depends(get_db)):
    rows = db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.is_active.is_(True))
    ).scalars().all()
    return {
        "plans": [
            {
                "id": row.id,
                "code": row.code,
                "name": row.name,
                "description": row.description,
                "price": float(row.price),
                "currency": row.currency,
                "period": row.period,
                "features": __import__("json").loads(row.features or "[]"),
                "listing_limit": row.listing_limit,
            }
            for row in rows
        ]
    }


@router.get("/promotions")
def list_promotions(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Promotion).where(Promotion.is_active.is_(True))
    ).scalars().all()
    return {
        "promotions": [
            {
                "id": row.id,
                "code": row.code,
                "name": row.name,
                "description": row.description,
                "kind": row.kind,
                "price": float(row.price),
                "currency": row.currency,
                "duration_days": row.duration_days,
                "terms": row.terms,
            }
            for row in rows
        ]
    }


@router.post("/payments/initiate", status_code=201)
def initiate_payment(
    payload: PaymentInitiateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PAYMENT_INITIATE)),
):
    payment = payment_service.initiate_payment(db, user, payload)
    return {
        "payment": payment_payload(payment),
        "message": (
            "Payment completed in development mock mode. No real money was charged."
            if payment.status == PaymentStatus.SUCCESS.value
            else "Payment request sent. Confirm on your phone to complete it."
            if payment.status == PaymentStatus.PENDING.value
            else "Payment could not be completed. No charge was confirmed."
        ),
        "payment_confirmed_by_backend": payment.status == PaymentStatus.SUCCESS.value,
    }


@router.post("/payments/callback")
def payment_callback(
    body: dict,
    request: Request,
    x_callback_secret: str | None = Header(default=None, alias="X-Callback-Secret"),
    db: Session = Depends(get_db),
):
    return payment_service.handle_callback(db, body, x_callback_secret)


@router.get("/payments")
def list_payments(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    permissions = {p.code for role in user.roles for p in role.permissions}
    query = select(Payment).order_by(Payment.created_at.desc()).limit(200)
    if not ({"payment:view", "payment:refund"} & permissions and "finance_officer" in user.role_codes):
        query = query.where(Payment.user_id == user.id)
    if status:
        query = query.where(Payment.status == status)
    rows = db.execute(query).scalars().all()
    return {"payments": [payment_payload(p) for p in rows], "count": len(rows)}


@router.get("/payments/{payment_id}")
def get_payment(
    payment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise NotFound("Payment not found.")
    permissions = {p.code for role in user.roles for p in role.permissions}
    if payment.user_id != user.id and not ({"payment:view", "payment:refund"} & permissions):
        raise Forbidden("You do not have access to this payment.")
    return {"payment": payment_payload(payment)}


@router.get("/invoices")
def list_invoices(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    permissions = {p.code for role in user.roles for p in role.permissions}
    query = select(Invoice).order_by(Invoice.issued_at.desc()).limit(200)
    if "payment:view" not in permissions:
        query = query.where(Invoice.user_id == user.id)
    rows = db.execute(query).scalars().all()
    import json

    return {
        "invoices": [
            {
                "id": row.id,
                "number": row.number,
                "amount": float(row.amount),
                "currency": row.currency,
                "status": row.status,
                "line_items": json.loads(row.line_items or "[]"),
                "issued_at": row.issued_at,
                "paid_at": row.paid_at,
            }
            for row in rows
        ]
    }


@router.post("/payments/{payment_id}/refund", status_code=201)
def refund(
    payment_id: uuid.UUID,
    payload: RefundIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PAYMENT_REFUND)),
):
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise NotFound("Payment not found.")
    refund_record = payment_service.refund_payment(
        db, payment, Decimal(str(payload.amount)), payload.reason, user
    )
    return {
        "refund": {
            "id": refund_record.id,
            "amount": float(refund_record.amount),
            "status": refund_record.status,
            "provider_reference": refund_record.provider_reference,
            "created_at": refund_record.created_at,
        },
        "message": "Refund recorded. In mock mode no external money was moved.",
    }
