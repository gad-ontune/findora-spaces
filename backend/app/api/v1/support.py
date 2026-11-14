from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.core.exceptions import NotFound
from app.core.rate_limit import RateLimiter
from app.models import Complaint, SupportTicket, User
from app.schemas.payloads import ComplaintIn, SupportTicketIn
from app.services.audit import write_audit
from app.services.serializers import complaint_payload, utcnow

router = APIRouter(tags=["Support and complaints"])
complaint_limiter = RateLimiter("complaint", 10, 3600)


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/complaints", status_code=201)
def create_complaint(
    payload: ComplaintIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    complaint_limiter.hit(_client(request))
    complaint = Complaint(
        reference=f"CMP-{uuid.uuid4().hex[:8].upper()}",
        complainant_id=user.id if user else None,
        complainant_name=payload.name or (user.name if user else None),
        complainant_phone=payload.phone or (user.phone if user else None),
        property_id=uuid.UUID(payload.property_id) if payload.property_id else None,
        search_request_id=uuid.UUID(payload.search_request_id) if payload.search_request_id else None,
        category=payload.category,
        description=payload.description,
        status="open",
        priority="normal",
    )
    db.add(complaint)
    db.flush()
    from app.models import Role

    staff = db.execute(
        select(User).join(User.roles).where(Role.code.in_(["support_officer", "moderator", "super_admin"]))
    ).scalars().unique().all()
    from app.services.notifications import create_notification

    for officer in staff:
        create_notification(
            db,
            user=officer,
            notification_type="complaint_created",
            title="New complaint or report",
            body=f"{complaint.reference} · {payload.category.replace('_', ' ')}",
            data={"complaint_id": str(complaint.id)},
            channels=["in_app"],
        )
    write_audit(
        db,
        actor=user,
        action="complaint.created",
        resource_type="complaint",
        resource_id=complaint.id,
        after={"category": payload.category},
    )
    db.commit()
    return {
        "complaint": complaint_payload(complaint),
        "message": "Your report was received. Our team reviews reports before taking action.",
    }


@router.get("/complaints")
def my_complaints(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(Complaint)
        .where(Complaint.complainant_id == user.id)
        .order_by(Complaint.created_at.desc())
    ).scalars().all()
    return {"complaints": [complaint_payload(c) for c in rows]}


@router.post("/support/tickets", status_code=201)
def create_ticket(
    payload: SupportTicketIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = SupportTicket(
        reference=f"TKT-{uuid.uuid4().hex[:8].upper()}",
        user_id=user.id,
        subject=payload.subject,
        description=payload.description,
        category=payload.category,
        status="open",
        priority="normal",
    )
    db.add(ticket)
    write_audit(
        db,
        actor=user,
        action="support.ticket_created",
        resource_type="support_ticket",
        resource_id=ticket.id,
        after={"subject": payload.subject},
    )
    db.commit()
    return {
        "ticket": {
            "id": ticket.id,
            "reference": ticket.reference,
            "subject": ticket.subject,
            "status": ticket.status,
            "created_at": ticket.created_at,
        },
        "message": "Support ticket created.",
    }


@router.get("/support/tickets")
def my_tickets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(SupportTicket)
        .where(SupportTicket.user_id == user.id)
        .order_by(SupportTicket.created_at.desc())
    ).scalars().all()
    return {
        "tickets": [
            {
                "id": t.id,
                "reference": t.reference,
                "subject": t.subject,
                "category": t.category,
                "status": t.status,
                "resolution": t.resolution,
                "created_at": t.created_at,
                "resolved_at": t.resolved_at,
            }
            for t in rows
        ]
    }
