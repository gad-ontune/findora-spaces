from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.bootstrap import get_setting
from app.core.database import get_db
from app.core.deps import require_permissions, require_staff
from app.core.exceptions import Forbidden, NotFound, ValidationError
from app.core.permissions import P
from app.models import (
    Amenity,
    AuditLog,
    CommercialUse,
    Complaint,
    FieldReport,
    Landmark,
    Neighbourhood,
    PartnerAssignment,
    PartnerProfile,
    Payment,
    Promotion,
    Property,
    PropertyReport,
    Refund,
    RequestMatch,
    Role,
    SearchRequest,
    SubCounty,
    SubscriptionPlan,
    SupportTicket,
    SystemSetting,
    Town,
    User,
    Viewing,
)
from app.models.base import PaymentStatus, PropertyStatus
from app.schemas.payloads import (
    AssignmentCreateIn,
    ExternalMatchIn,
    PropertyReportResolveIn,
    RequestStatusIn,
    SettingsUpdateIn,
    UserAdminUpdateIn,
)
from app.services import assisted_service, payment_service
from app.services.audit import write_audit
from app.services.notifications import create_notification
from app.services.property_service import base_property_query, load_property, property_internal_summary
from app.services.serializers import (
    assignment_payload,
    complaint_payload,
    field_report_payload,
    match_payload,
    payment_payload,
    property_summary,
    report_payload,
    search_request_payload,
    utcnow,
    viewing_payload,
)

router = APIRouter(prefix="/admin", tags=["Administration"])


class PartnerStatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["pending", "active", "suspended", "rejected"]
    notes: str | None = Field(default=None, max_length=2000)


class FieldReportReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["reviewed", "needs_revision"]
    notes: str = Field(min_length=3, max_length=2000)


class ReconcileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reconciliation_date: date
    provider_total: float = Field(ge=0)


class AmenityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=100)
    slug: str | None = Field(default=None, max_length=120)
    category: str = Field(default="general", max_length=60)
    applies_to: Literal["residential", "commercial", "both"] = "both"
    icon: str | None = Field(default=None, max_length=60)


class CommercialUseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=100)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)


class TownIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sub_county_id: str
    name: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, max_length=160)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    description: str | None = Field(default=None, max_length=2000)


class NeighbourhoodIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, max_length=160)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    description: str | None = Field(default=None, max_length=2000)


class LandmarkIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(default="landmark", max_length=60)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    address: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    source: str | None = Field(default=None, max_length=160)


class FeatureIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    featured: bool = True
    days: int = Field(default=14, ge=1, le=90)


class ComplaintUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["reviewing", "resolved", "dismissed"]
    resolution: str = Field(min_length=3, max_length=3000)


def _slug(value: str) -> str:
    import re

    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned or uuid.uuid4().hex[:8]


@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_staff),
):
    today = utcnow().date()
    month_start = utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    property_rows = db.execute(
        select(Property.status, Property.availability_status, func.count(Property.id))
        .where(Property.deleted_at.is_(None))
        .group_by(Property.status, Property.availability_status)
    ).all()
    by_status: dict[str, int] = {}
    by_availability: dict[str, int] = {}
    for status, availability, count in property_rows:
        by_status[status] = by_status.get(status, 0) + count
        by_availability[availability] = by_availability.get(availability, 0) + count
    pending_verification = db.execute(
        select(func.count(func.distinct(Property.id)))
        .select_from(Property)
        .join(Property.verifications)
        .where(Property.verifications.any(status="pending"))
    ).scalar_one()
    revenue_today = db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status == PaymentStatus.SUCCESS.value,
            func.date(Payment.completed_at) == today,
        )
    ).scalar_one()
    revenue_month = db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status == PaymentStatus.SUCCESS.value,
            Payment.completed_at >= month_start,
        )
    ).scalar_one()
    return {
        "properties": {
            "total": sum(by_status.values()),
            "by_status": by_status,
            "by_availability": by_availability,
            "pending_moderation": by_status.get(PropertyStatus.PENDING.value, 0),
            "pending_verification_properties": pending_verification,
        },
        "users": {
            "total": db.execute(select(func.count(User.id))).scalar_one(),
            "active": db.execute(
                select(func.count(User.id)).where(User.status == "active")
            ).scalar_one(),
            "verified_phones": db.execute(
                select(func.count(User.id)).where(User.phone_verified_at.is_not(None))
            ).scalar_one(),
        },
        "reports": {
            "open": db.execute(
                select(func.count(PropertyReport.id)).where(
                    PropertyReport.status.in_(["open", "reviewing"])
                )
            ).scalar_one(),
            "complaints_open": db.execute(
                select(func.count(Complaint.id)).where(
                    Complaint.status.in_(["open", "reviewing"])
                )
            ).scalar_one(),
            "support_tickets_open": db.execute(
                select(func.count(SupportTicket.id)).where(
                    SupportTicket.status.in_(["open", "in_progress"])
                )
            ).scalar_one(),
        },
        "assisted": {
            "open_requests": db.execute(
                select(func.count(SearchRequest.id)).where(
                    SearchRequest.status.notin_(["completed", "cancelled"])
                )
            ).scalar_one(),
            "pending_assignments": db.execute(
                select(func.count(PartnerAssignment.id)).where(
                    PartnerAssignment.status.in_(["offered", "accepted", "in_progress"])
                )
            ).scalar_one(),
            "field_reports_to_review": db.execute(
                select(func.count(FieldReport.id)).where(FieldReport.status == "submitted")
            ).scalar_one(),
        },
        "viewings": {
            "upcoming": db.execute(
                select(func.count(Viewing.id)).where(
                    Viewing.status.in_(["requested", "proposed", "confirmed"]),
                    Viewing.scheduled_at.is_not(None),
                    Viewing.scheduled_at >= utcnow() - timedelta(hours=2),
                )
            ).scalar_one()
        },
        "finance": {
            "revenue_today": float(revenue_today or 0),
            "revenue_this_month": float(revenue_month or 0),
            "successful_payments_month": db.execute(
                select(func.count(Payment.id)).where(
                    Payment.status == PaymentStatus.SUCCESS.value,
                    Payment.completed_at >= month_start,
                )
            ).scalar_one(),
        },
        "recent_audit": [
            {
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "actor_id": log.actor_id,
                "created_at": log.created_at,
            }
            for log in db.execute(
                select(AuditLog).order_by(AuditLog.created_at.desc()).limit(10)
            ).scalars().all()
        ],
    }


@router.get("/properties")
def admin_properties(
    status: str | None = Query(default=None),
    availability: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=160),
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_MODERATE, P.PROPERTY_VERIFY)),
):
    conditions = [Property.deleted_at.is_(None)]
    if status:
        conditions.append(Property.status == status)
    if availability:
        conditions.append(Property.availability_status == availability)
    if q:
        term = f"%{q.strip()}%"
        conditions.append(
            or_(Property.title.ilike(term), Property.reference.ilike(term))
        )
    total = db.execute(select(func.count(Property.id)).where(*conditions)).scalar_one()
    rows = db.execute(
        base_property_query()
        .where(*conditions)
        .order_by(Property.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().unique().all()
    duplicates = []
    return {
        "properties": [property_internal_summary(p) for p in rows],
        "pagination": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
    }


@router.get("/users")
def admin_users(
    role: str | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=160),
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.USER_MANAGE)),
):
    query = select(User).options(selectinload(User.roles), selectinload(User.profile))
    if status:
        query = query.where(User.status == status)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(User.name.ilike(term), User.phone.ilike(term), User.email.ilike(term)))
    if role:
        query = query.where(User.roles.any(Role.code == role))
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    users = db.execute(
        query.order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().unique().all()
    from app.services.serializers import user_payload

    return {
        "users": [
            {
                **user_payload(u, self_view=True),
                "failed_login_attempts": u.failed_login_attempts,
                "locked_until": u.locked_until,
                "last_login_at": u.last_login_at,
            }
            for u in users
        ],
        "pagination": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
    }


@router.patch("/users/{user_id}")
def admin_update_user(
    user_id: uuid.UUID,
    payload: UserAdminUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.USER_MANAGE)),
):
    target = db.get(User, user_id)
    if target is None:
        raise NotFound("User not found.")
    if target.id == user.id and payload.status in {"suspended", "deleted"}:
        raise Forbidden("You cannot suspend your own account.")
    before = {"status": target.status, "roles": target.role_codes}
    if payload.role_codes is not None:
        roles = db.execute(select(Role).where(Role.code.in_(payload.role_codes))).scalars().all()
        if len(roles) != len(set(payload.role_codes)):
            raise ValidationError("One or more roles do not exist.")
        if "super_admin" not in user.role_codes and "super_admin" in payload.role_codes:
            raise Forbidden("Only a super administrator can grant the super administrator role.")
        if target.id == user.id and "super_admin" in target.role_codes and "super_admin" not in payload.role_codes:
            raise Forbidden("You cannot remove your own super administrator role.")
        target.roles = list(roles)
    if payload.status is not None:
        target.status = payload.status
    write_audit(
        db,
        actor=user,
        action="user.admin_updated",
        resource_type="user",
        resource_id=target.id,
        before=before,
        after={"status": target.status, "roles": target.role_codes},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    return {
        "user": {
            "id": target.id,
            "name": target.name,
            "phone": target.phone,
            "status": target.status,
            "roles": target.role_codes,
        },
        "message": "User updated. Sensitive changes are audited.",
    }


@router.get("/reports")
def admin_reports(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.COMPLAINT_MANAGE)),
):
    query = select(PropertyReport).options(joinedload(PropertyReport.property))
    if status:
        query = query.where(PropertyReport.status == status)
    rows = db.execute(query.order_by(PropertyReport.created_at.desc())).scalars().all()
    return {"reports": [report_payload(r) for r in rows], "count": len(rows)}


@router.patch("/reports/{report_id}")
def resolve_report(
    report_id: uuid.UUID,
    payload: PropertyReportResolveIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.COMPLAINT_MANAGE)),
):
    validated = payload
    report = db.get(PropertyReport, report_id)
    if report is None:
        raise NotFound("Report not found.")
    report.status = validated.status
    report.resolution = validated.resolution
    report.reviewed_by_id = user.id
    report.resolved_at = utcnow() if validated.status in {"resolved", "dismissed"} else None
    if report.reporter_id:
        reporter = db.get(User, report.reporter_id)
        if reporter:
            create_notification(
                db,
                user=reporter,
                notification_type="report_update",
                title="Your property report was reviewed",
                body=f"Report outcome: {validated.status}. {validated.resolution[:300]}",
                data={"report_id": str(report.id)},
                channels=["in_app"],
            )
    write_audit(
        db,
        actor=user,
        action="property_report.reviewed",
        resource_type="property_report",
        resource_id=report.id,
        after={"status": validated.status, "resolution": validated.resolution},
    )
    db.commit()
    return {"report": report_payload(report), "message": "Report updated."}


@router.get("/complaints")
def admin_complaints(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.COMPLAINT_MANAGE)),
):
    query = select(Complaint)
    if status:
        query = query.where(Complaint.status == status)
    rows = db.execute(query.order_by(Complaint.created_at.desc())).scalars().all()
    return {
        "complaints": [
            {
                **complaint_payload(c),
                "complainant_name": c.complainant_name,
                "property_id": c.property_id,
                "search_request_id": c.search_request_id,
            }
            for c in rows
        ],
        "count": len(rows),
    }


@router.patch("/complaints/{complaint_id}")
def update_complaint(
    complaint_id: uuid.UUID,
    payload: ComplaintUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.COMPLAINT_MANAGE)),
):
    complaint = db.get(Complaint, complaint_id)
    if complaint is None:
        raise NotFound("Complaint not found.")
    complaint.status = payload.status
    complaint.resolution = payload.resolution
    complaint.assigned_to_id = complaint.assigned_to_id or user.id
    complaint.resolved_at = utcnow() if payload.status in {"resolved", "dismissed"} else None
    if complaint.complainant_id:
        complainant = db.get(User, complaint.complainant_id)
        if complainant:
            create_notification(
                db,
                user=complainant,
                notification_type="complaint_update",
                title="Your complaint was updated",
                body=f"{complaint.reference} is now {payload.status}. {payload.resolution[:250]}",
                data={"complaint_id": str(complaint.id)},
                channels=["in_app"],
            )
    write_audit(
        db,
        actor=user,
        action="complaint.updated",
        resource_type="complaint",
        resource_id=complaint.id,
        after={"status": payload.status, "resolution": payload.resolution},
    )
    db.commit()
    return {"complaint": complaint_payload(complaint), "message": "Complaint updated."}


@router.get("/support-tickets")
def admin_tickets(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.COMPLAINT_MANAGE)),
):
    query = select(SupportTicket)
    if status:
        query = query.where(SupportTicket.status == status)
    rows = db.execute(query.order_by(SupportTicket.created_at.desc())).scalars().all()
    return {
        "tickets": [
            {
                "id": t.id,
                "reference": t.reference,
                "subject": t.subject,
                "description": t.description,
                "category": t.category,
                "status": t.status,
                "priority": t.priority,
                "resolution": t.resolution,
                "created_at": t.created_at,
            }
            for t in rows
        ]
    }


@router.get("/partners")
def admin_partners(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PARTNER_MANAGE, P.ASSISTED_MANAGE)),
):
    query = select(PartnerProfile).options(
        joinedload(PartnerProfile.user), selectinload(PartnerProfile.service_areas)
    )
    if status:
        query = query.where(PartnerProfile.status == status)
    rows = db.execute(query.order_by(PartnerProfile.created_at.desc())).scalars().unique().all()
    from app.services.serializers import partner_payload

    assignments = db.execute(
        select(PartnerAssignment.partner_id, func.count(PartnerAssignment.id)).group_by(
            PartnerAssignment.partner_id
        )
    ).all()
    assignment_counts = {pid: count for pid, count in assignments}
    return {
        "partners": [
            {**partner_payload(p), "assignments": assignment_counts.get(p.id, 0)}
            for p in rows
        ]
    }


@router.patch("/partners/{partner_id}")
def admin_update_partner(
    partner_id: uuid.UUID,
    payload: PartnerStatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PARTNER_MANAGE)),
):
    partner = db.get(PartnerProfile, partner_id)
    if partner is None:
        raise NotFound("Partner not found.")
    before = partner.status
    partner.status = payload.status
    if payload.notes:
        partner.notes = payload.notes
    write_audit(
        db,
        actor=user,
        action="partner.status_updated",
        resource_type="partner_profile",
        resource_id=partner.id,
        before={"status": before},
        after={"status": payload.status},
    )
    if partner.user:
        create_notification(
            db,
            user=partner.user,
            notification_type="partner_status",
            title="Partner profile updated",
            body=f"Your partner profile is now {payload.status}."
            + (f" {payload.notes}" if payload.notes else ""),
            data={"partner_id": str(partner.id)},
            channels=["in_app", "sms"],
        )
    db.commit()
    from app.services.serializers import partner_payload

    return {"partner": partner_payload(partner), "message": "Partner updated."}


@router.get("/search-requests")
def admin_search_requests(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.ASSISTED_MANAGE)),
):
    query = select(SearchRequest).options(
        selectinload(SearchRequest.status_history),
        selectinload(SearchRequest.matches),
        selectinload(SearchRequest.assignments),
        selectinload(SearchRequest.messages),
        joinedload(SearchRequest.town),
        joinedload(SearchRequest.neighbourhood),
        joinedload(SearchRequest.landmark),
        joinedload(SearchRequest.assigned_support),
    )
    if status:
        query = query.where(SearchRequest.status == status)
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    rows = db.execute(
        query.order_by(SearchRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().unique().all()
    return {
        "requests": [search_request_payload(r) for r in rows],
        "pagination": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
    }


@router.get("/search-requests/{request_id}")
def admin_search_request_detail(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.ASSISTED_MANAGE)),
):
    request_obj = assisted_service.accessible_request(db, request_id, user)
    data = search_request_payload(request_obj)
    data["guest_name"] = request_obj.guest_name
    data["guest_phone"] = request_obj.guest_phone
    data["guest_email"] = request_obj.guest_email
    data["consent_to_share"] = request_obj.consent_to_share
    data["messages"] = [
        {
            "id": message.id,
            "sender_name": message.sender_name,
            "body": message.body,
            "is_internal": message.is_internal,
            "created_at": message.created_at,
        }
        for message in sorted(request_obj.messages, key=lambda item: item.created_at)
    ]
    data["assignments"] = [
        assignment_payload(assignment)
        for assignment in sorted(request_obj.assignments, key=lambda item: item.created_at)
    ]
    return {"request": data}


@router.post("/search-requests/{request_id}/assign", status_code=201)
def assign_partner(
    request_id: uuid.UUID,
    payload: AssignmentCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.ASSISTED_MANAGE)),
):
    request_obj = assisted_service.accessible_request(db, request_id, user)
    partner = db.get(PartnerProfile, uuid.UUID(payload.partner_id))
    if partner is None:
        raise NotFound("Partner not found.")
    assignment = assisted_service.assign_partner(
        db, request_obj, partner, user, payload.instructions, payload.due_at
    )
    return {
        "assignment": assignment_payload(assignment),
        "message": "Partner assignment offered. The partner must accept before investigating.",
    }


@router.post("/search-requests/{request_id}/send-matches")
def send_matches(
    request_id: uuid.UUID,
    body: dict | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.ASSISTED_MANAGE)),
):
    request_obj = assisted_service.accessible_request(db, request_id, user)
    notes = (body or {}).get("notes")
    return assisted_service.send_matches(db, request_obj, user, notes)


@router.post("/search-requests/{request_id}/status")
def update_request_status(
    request_id: uuid.UUID,
    payload: RequestStatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.ASSISTED_MANAGE)),
):
    request_obj = assisted_service.accessible_request(db, request_id, user)
    updated = assisted_service.transition_request(
        db, request_obj, payload.status, user, payload.notes
    )
    return {"request": search_request_payload(updated), "message": "Request status updated."}


@router.post("/search-requests/{request_id}/external-match", status_code=201)
def add_external_match(
    request_id: uuid.UUID,
    payload: ExternalMatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.ASSISTED_MANAGE)),
):
    request_obj = assisted_service.accessible_request(db, request_id, user)
    match = assisted_service.add_external_match(
        db,
        request_obj,
        user,
        title=payload.title,
        description=payload.description,
        rent_amount=payload.rent_amount,
        location_text=payload.location_text,
    )
    db.refresh(request_obj)
    return {
        "match": match_payload(match),
        "message": "Partner-sourced property recorded. Confirm it is genuine and available before sharing.",
    }


@router.get("/field-reports")
def admin_field_reports(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.ASSISTED_MANAGE)),
):
    query = select(FieldReport).options(
        joinedload(FieldReport.assignment).joinedload(PartnerAssignment.request),
        joinedload(FieldReport.assignment)
        .joinedload(PartnerAssignment.partner)
        .joinedload(PartnerProfile.user),
    )
    if status:
        query = query.where(FieldReport.status == status)
    rows = db.execute(query.order_by(FieldReport.submitted_at.desc()).limit(300)).scalars().unique().all()
    return {
        "reports": [
            {
                **field_report_payload(report),
                "assignment_id": report.assignment_id,
                "assignment_reference": report.assignment.reference if report.assignment else None,
                "request_id": report.assignment.request_id if report.assignment else None,
                "request_reference": (
                    report.assignment.request.reference
                    if report.assignment and report.assignment.request
                    else None
                ),
                "partner_name": (
                    report.partner.user.name
                    if report.partner and report.partner.user
                    else None
                ),
            }
            for report in rows
        ],
        "count": len(rows),
    }


@router.post("/field-reports/{report_id}/review")
def review_field_report(
    report_id: uuid.UUID,
    payload: FieldReportReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.ASSISTED_MANAGE)),
):
    report = db.get(FieldReport, report_id)
    if report is None:
        raise NotFound("Field report not found.")
    updated = assisted_service.review_field_report(
        db, report, user, payload.notes, approve=payload.status == "reviewed"
    )
    return {"report": field_report_payload(updated), "message": "Field report reviewed."}


@router.get("/analytics/overview")
def analytics_overview(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.ANALYTICS_VIEW)),
):
    property_counts = db.execute(
        select(Property.status, func.count(Property.id)).group_by(Property.status)
    ).all()
    category_counts = db.execute(
        select(Property.category, func.count(Property.id))
        .where(Property.status == PropertyStatus.APPROVED.value)
        .group_by(Property.category)
    ).all()
    availability_counts = db.execute(
        select(Property.availability_status, func.count(Property.id))
        .where(Property.deleted_at.is_(None))
        .group_by(Property.availability_status)
    ).all()
    fresh_available = db.execute(
        select(func.count(Property.id)).where(
            Property.status == PropertyStatus.APPROVED.value,
            Property.availability_status == "available",
            Property.last_confirmed_available_at.is_not(None),
            Property.last_confirmed_available_at >= utcnow() - timedelta(days=get_setting(db, "availability.freshness_days", {}).get("default", 14) if isinstance(get_setting(db, "availability.freshness_days", {}), dict) else 14),
        )
    ).scalar_one()
    request_counts = db.execute(
        select(SearchRequest.status, func.count(SearchRequest.id)).group_by(SearchRequest.status)
    ).all()
    viewing_counts = db.execute(
        select(Viewing.status, func.count(Viewing.id)).group_by(Viewing.status)
    ).all()
    enquiry_total = db.execute(select(func.count(Property.id))).scalar_one()
    from app.models import PropertyEnquiry, Favourite, PropertyComparison, ViewingFeedback

    enquiry_count = db.execute(select(func.count(PropertyEnquiry.id))).scalar_one()
    responded = db.execute(
        select(func.count(PropertyEnquiry.id)).where(PropertyEnquiry.responded_at.is_not(None))
    ).scalar_one()
    favourites = db.execute(select(func.count(Favourite.id))).scalar_one()
    comparisons = db.execute(select(func.count(PropertyComparison.id))).scalar_one()
    views_total = db.execute(select(func.coalesce(func.sum(Property.views_count), 0))).scalar_one()
    contacts_total = db.execute(select(func.coalesce(func.sum(Property.contact_count), 0))).scalar_one()
    feedback_count = db.execute(select(func.count(ViewingFeedback.id))).scalar_one()
    negative_feedback = db.execute(
        select(func.count(ViewingFeedback.id)).where(
            or_(
                ViewingFeedback.matched_photos.is_(False),
                ViewingFeedback.matched_description.is_(False),
                ViewingFeedback.rent_matched.is_(False),
                ViewingFeedback.suspected_fraud.is_(True),
            )
        )
    ).scalar_one()
    landlord_count = db.execute(
        select(func.count(func.distinct(Property.owner_id))).where(Property.owner_id.is_not(None))
    ).scalar_one()
    assistant_metrics = db.execute(
        select(SearchRequest.id, SearchRequest.created_at, func.min(RequestMatch.created_at))
        .join(RequestMatch, RequestMatch.request_id == SearchRequest.id)
        .group_by(SearchRequest.id)
    ).all()
    first_match_hours = []
    for _, created, first_match in assistant_metrics:
        if created and first_match:
            first_match_hours.append((first_match - created).total_seconds() / 3600)
    payment_totals = db.execute(
        select(Payment.status, func.count(Payment.id), func.coalesce(func.sum(Payment.amount), 0))
        .group_by(Payment.status)
    ).all()
    refund_total = db.execute(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(Refund.status == "completed")
    ).scalar_one()
    return {
        "discovery": {
            "total_property_views": int(views_total or 0),
            "contact_requests": int(contacts_total or 0),
            "favourites": favourites,
            "comparisons": comparisons,
            "contact_rate_percent": round((contacts_total / views_total) * 100, 2)
            if views_total
            else None,
        },
        "supply": {
            "by_status": {status: count for status, count in property_counts},
            "approved_by_category": {cat: count for cat, count in category_counts},
            "by_availability": {a: count for a, count in availability_counts},
            "fresh_and_available": fresh_available,
        },
        "landlords": {
            "active_landlords": landlord_count,
            "enquiries_received": enquiry_count,
            "enquiry_response_rate_percent": round(responded / enquiry_count * 100, 1)
            if enquiry_count
            else None,
            "total_properties": enquiry_total,
        },
        "assisted": {
            "by_status": {status: count for status, count in request_counts},
            "requests_total": sum(count for _, count in request_counts),
            "average_hours_to_first_match": round(sum(first_match_hours) / len(first_match_hours), 2)
            if first_match_hours
            else None,
            "completed": sum(count for status, count in request_counts if status == "completed"),
        },
        "viewings": {
            "by_status": {status: count for status, count in viewing_counts},
            "total": sum(count for _, count in viewing_counts),
            "feedback_submitted": feedback_count,
            "negative_outcomes": negative_feedback,
        },
        "finance": {
            "payments": {
                status: {"count": count, "amount": float(amount)}
                for status, count, amount in payment_totals
            },
            "refunded_total": float(refund_total or 0),
        },
        "note": "These metrics are computed from actual platform records. Small samples are not a market survey.",
    }


@router.get("/audit-logs")
def audit_logs(
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.AUDIT_READ)),
):
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action == action)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    rows = db.execute(
        query.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()
    actor_ids = {row.actor_id for row in rows if row.actor_id}
    actors = {
        u.id: u.name
        for u in db.execute(select(User).where(User.id.in_(actor_ids))).scalars().all()
    } if actor_ids else {}
    return {
        "logs": [
            {
                "id": row.id,
                "actor_id": row.actor_id,
                "actor_name": actors.get(row.actor_id),
                "action": row.action,
                "resource_type": row.resource_type,
                "resource_id": row.resource_id,
                "before": json.loads(row.before) if row.before else None,
                "after": json.loads(row.after) if row.after else None,
                "ip_address": row.ip_address,
                "created_at": row.created_at,
            }
            for row in rows
        ],
        "pagination": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size,
        },
        "note": "Audit records are append-only through application workflows.",
    }


@router.get("/settings")
def get_settings(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.SETTINGS_MANAGE)),
):
    rows = db.execute(select(SystemSetting).order_by(SystemSetting.key)).scalars().all()
    return {
        "settings": [
            {
                "key": row.key,
                "value": json.loads(row.value) if row.value else None,
                "description": row.description,
                "updated_at": row.updated_at,
            }
            for row in rows
        ]
    }


@router.put("/settings/{key}")
def update_setting(
    key: str,
    payload: SettingsUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.SETTINGS_MANAGE)),
):
    setting = db.execute(
        select(SystemSetting).where(SystemSetting.key == key)
    ).scalar_one_or_none()
    before_value = json.loads(setting.value) if setting and setting.value else None
    if setting is None:
        setting = SystemSetting(key=key, value=json.dumps(payload.value), description="Set by administrator")
        db.add(setting)
    else:
        setting.value = json.dumps(payload.value)
    setting.updated_by_id = user.id
    write_audit(
        db,
        actor=user,
        action="settings.updated",
        resource_type="system_setting",
        resource_id=key,
        before={"value": before_value},
        after={"value": payload.value},
    )
    db.commit()
    return {
        "setting": {"key": key, "value": payload.value},
        "message": "Setting updated. Availability changes may affect visibility immediately.",
    }


@router.get("/payments")
def admin_payments(
    status: str | None = Query(default=None),
    purpose: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PAYMENT_VIEW)),
):
    query = select(Payment).order_by(Payment.created_at.desc()).limit(500)
    if status:
        query = query.where(Payment.status == status)
    if purpose:
        query = query.where(Payment.purpose == purpose)
    rows = db.execute(query).scalars().all()
    totals = db.execute(
        select(Payment.status, func.count(Payment.id), func.coalesce(func.sum(Payment.amount), 0))
        .group_by(Payment.status)
    ).all()
    return {
        "payments": [{**payment_payload(p), "user_id": p.user_id} for p in rows],
        "totals": {
            status: {"count": count, "amount": float(amount)} for status, count, amount in totals
        },
        "count": len(rows),
    }


@router.get("/refunds")
def admin_refunds(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PAYMENT_VIEW)),
):
    rows = db.execute(select(Refund).order_by(Refund.created_at.desc())).scalars().all()
    return {
        "refunds": [
            {
                "id": r.id,
                "payment_id": r.payment_id,
                "amount": float(r.amount),
                "currency": r.currency,
                "reason": r.reason,
                "status": r.status,
                "provider_reference": r.provider_reference,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


@router.post("/finance/reconcile", status_code=201)
def reconcile(
    payload: ReconcileIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PAYMENT_REFUND)),
):
    record = payment_service.reconcile(
        db, payload.reconciliation_date, Decimal(str(payload.provider_total)), user
    )
    return {
        "reconciliation": {
            "id": record.id,
            "date": record.reconciliation_date,
            "provider_total": float(record.provider_total),
            "internal_total": float(record.internal_total),
            "difference": float(record.difference),
            "status": record.status,
        },
        "message": "Reconciliation recorded. Differences require investigation before being treated as resolved.",
    }


@router.get("/viewings")
def admin_viewings(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.SUPPORT_VIEW, P.VIEWING_MANAGE)),
):
    from app.services.viewing_service import viewing_query

    query = viewing_query().order_by(Viewing.created_at.desc()).limit(300)
    if status:
        query = query.where(Viewing.status == status)
    rows = db.execute(query).scalars().unique().all()
    return {"viewings": [viewing_payload(v) for v in rows], "count": len(rows)}


@router.post("/properties/{property_id}/feature")
def feature_property(
    property_id: uuid.UUID,
    payload: FeatureIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROMOTION_MANAGE, P.PROPERTY_MODERATE)),
):
    prop = load_property(db, property_id)
    prop.is_featured = payload.featured
    prop.featured_until = utcnow() + timedelta(days=payload.days) if payload.featured else None
    write_audit(
        db,
        actor=user,
        action="property.featured",
        resource_type="property",
        resource_id=prop.id,
        after={"featured": payload.featured, "days": payload.days},
    )
    db.commit()
    return {
        "property": property_internal_summary(prop),
        "message": "Promotion updated." if payload.featured else "Property removed from featured listings.",
    }


@router.get("/moderation-queue")
def moderation_queue(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_MODERATE)),
):
    rows = db.execute(
        base_property_query()
        .where(
            Property.status == PropertyStatus.PENDING.value,
            Property.deleted_at.is_(None),
        )
        .order_by(Property.created_at.asc())
        .limit(100)
    ).scalars().unique().all()
    items = []
    for prop in rows:
        duplicates = []
        for event in prop.history:
            if event.event_type == "duplicate_check" and event.changes:
                try:
                    duplicates = json.loads(event.changes).get("matches", [])
                except (TypeError, ValueError):
                    duplicates = []
        items.append({**property_internal_summary(prop), "duplicate_candidates": duplicates})
    return {"queue": items, "count": len(items)}


# ── Reference data management ────────────────────────────────────────────────


@router.post("/amenities", status_code=201)
def create_amenity(
    payload: AmenityIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.LOCATION_MANAGE, P.SETTINGS_MANAGE)),
):
    slug = payload.slug or _slug(payload.name)
    if db.execute(select(Amenity).where(Amenity.slug == slug)).scalar_one_or_none():
        raise ValidationError("An amenity with this slug already exists.")
    amenity = Amenity(
        name=payload.name,
        slug=slug,
        category=payload.category,
        applies_to=payload.applies_to,
        icon=payload.icon,
    )
    db.add(amenity)
    write_audit(
        db,
        actor=user,
        action="amenity.created",
        resource_type="amenity",
        resource_id=amenity.id,
        after=payload.model_dump(),
    )
    db.commit()
    return {"amenity": {"id": amenity.id, "name": amenity.name, "slug": amenity.slug}}


@router.patch("/amenities/{amenity_id}")
def update_amenity(
    amenity_id: uuid.UUID,
    payload: AmenityIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.LOCATION_MANAGE, P.SETTINGS_MANAGE)),
):
    amenity = db.get(Amenity, amenity_id)
    if amenity is None:
        raise NotFound("Amenity not found.")
    amenity.name = payload.name
    amenity.category = payload.category
    amenity.applies_to = payload.applies_to
    amenity.icon = payload.icon
    if payload.slug:
        amenity.slug = payload.slug
    write_audit(
        db,
        actor=user,
        action="amenity.updated",
        resource_type="amenity",
        resource_id=amenity.id,
        after=payload.model_dump(),
    )
    db.commit()
    return {"amenity": {"id": amenity.id, "name": amenity.name, "slug": amenity.slug}}


@router.post("/commercial-uses", status_code=201)
def create_commercial_use(
    payload: CommercialUseIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.LOCATION_MANAGE, P.SETTINGS_MANAGE)),
):
    slug = payload.slug or _slug(payload.name)
    if db.execute(select(CommercialUse).where(CommercialUse.slug == slug)).scalar_one_or_none():
        raise ValidationError("A business use with this slug already exists.")
    use = CommercialUse(name=payload.name, slug=slug, description=payload.description)
    db.add(use)
    write_audit(
        db,
        actor=user,
        action="commercial_use.created",
        resource_type="commercial_use",
        resource_id=use.id,
        after=payload.model_dump(),
    )
    db.commit()
    return {"commercial_use": {"id": use.id, "name": use.name, "slug": use.slug}}


@router.post("/towns", status_code=201)
def create_town(
    payload: TownIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.LOCATION_MANAGE)),
):
    from app.services.location_service import point_wkt

    sub_county = db.get(SubCounty, uuid.UUID(payload.sub_county_id))
    if sub_county is None:
        raise ValidationError("Select a valid sub-county.")
    slug = payload.slug or _slug(payload.name)
    if db.execute(select(Town).where(Town.slug == slug)).scalar_one_or_none():
        raise ValidationError("A town with this slug already exists.")
    town = Town(
        sub_county_id=sub_county.id,
        name=payload.name,
        slug=slug,
        latitude=payload.latitude,
        longitude=payload.longitude,
        geom=point_wkt(payload.latitude, payload.longitude),
        description=payload.description,
        is_active=True,
    )
    db.add(town)
    write_audit(
        db,
        actor=user,
        action="town.created",
        resource_type="town",
        resource_id=town.id,
        after=payload.model_dump(),
    )
    db.commit()
    return {"town": {"id": town.id, "name": town.name, "slug": town.slug}}


@router.post("/towns/{town_id}/neighbourhoods", status_code=201)
def create_neighbourhood(
    town_id: uuid.UUID,
    payload: NeighbourhoodIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.LOCATION_MANAGE)),
):
    from app.services.location_service import point_wkt

    town = db.get(Town, town_id)
    if town is None:
        raise NotFound("Town not found.")
    slug = payload.slug or _slug(payload.name)
    neighbourhood = Neighbourhood(
        town_id=town.id,
        name=payload.name,
        slug=slug,
        latitude=payload.latitude,
        longitude=payload.longitude,
        geom=point_wkt(payload.latitude, payload.longitude),
        description=payload.description,
    )
    db.add(neighbourhood)
    write_audit(
        db,
        actor=user,
        action="neighbourhood.created",
        resource_type="neighbourhood",
        resource_id=neighbourhood.id,
        after=payload.model_dump(),
    )
    db.commit()
    return {
        "neighbourhood": {
            "id": neighbourhood.id,
            "name": neighbourhood.name,
            "slug": neighbourhood.slug,
        }
    }


@router.post("/towns/{town_id}/landmarks", status_code=201)
def create_landmark(
    town_id: uuid.UUID,
    payload: LandmarkIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.LOCATION_MANAGE)),
):
    from app.services.location_service import point_wkt

    town = db.get(Town, town_id)
    if town is None:
        raise NotFound("Town not found.")
    landmark = Landmark(
        town_id=town.id,
        name=payload.name,
        category=payload.category,
        latitude=payload.latitude,
        longitude=payload.longitude,
        geom=point_wkt(payload.latitude, payload.longitude),
        address=payload.address,
        description=payload.description,
        source=payload.source,
        last_checked_at=utcnow().isoformat(),
    )
    db.add(landmark)
    write_audit(
        db,
        actor=user,
        action="landmark.created",
        resource_type="landmark",
        resource_id=landmark.id,
        after=payload.model_dump(),
    )
    db.commit()
    return {"landmark": {"id": landmark.id, "name": landmark.name, "category": landmark.category}}
