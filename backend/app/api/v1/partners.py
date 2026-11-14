from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_permissions
from app.core.exceptions import NotFound
from app.core.permissions import P
from app.models import (
    AssignmentStatus,
    PartnerAssignment,
    PartnerProfile,
    PartnerServiceArea,
    Property,
    Town,
    User,
)
from app.schemas.payloads import (
    AssignmentDecisionIn,
    FieldReportIn,
    PartnerApplyIn,
)
from app.services import assisted_service
from app.services.property_service import property_internal_summary
from app.services.serializers import (
    assignment_payload,
    field_report_payload,
    partner_payload,
)

router = APIRouter(prefix="/partners", tags=["Partner operations"])


@router.get("/me")
def partner_me(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    partner = db.execute(
        select(PartnerProfile)
        .options(joinedload(PartnerProfile.user), selectinload(PartnerProfile.service_areas))
        .where(PartnerProfile.user_id == user.id)
    ).scalar_one_or_none()
    if partner is None:
        return {"partner": None, "message": "No partner profile found. Apply to become a local partner."}
    return {"partner": partner_payload(partner)}


@router.post("/apply", status_code=201)
def apply(
    payload: PartnerApplyIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    partner = assisted_service.partner_apply(db, user, payload, uuid.UUID(payload.town_id))
    return {
        "partner": partner_payload(partner),
        "message": "Partner application submitted for review. Data collection and property-finding permissions are granted separately.",
    }


@router.get("/assignments")
def list_assignments(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PARTNER_ASSIGNMENT)),
):
    rows = assisted_service.assignments_for_partner(db, user)
    if status:
        rows = [a for a in rows if a.status == status]
    return {
        "assignments": [assignment_payload(a) for a in rows],
        "counts": {
            "offered": len([a for a in rows if a.status == AssignmentStatus.OFFERED.value]),
            "accepted": len([a for a in rows if a.status == AssignmentStatus.ACCEPTED.value]),
            "in_progress": len([a for a in rows if a.status == AssignmentStatus.IN_PROGRESS.value]),
            "completed": len([a for a in rows if a.status == AssignmentStatus.COMPLETED.value]),
        },
    }


@router.get("/assignments/{assignment_id}")
def get_assignment(
    assignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PARTNER_ASSIGNMENT)),
):
    assignment = assisted_service.get_assignment(db, assignment_id, user)
    return {"assignment": assignment_payload(assignment)}


@router.post("/assignments/{assignment_id}/accept")
def accept_assignment(
    assignment_id: uuid.UUID,
    payload: AssignmentDecisionIn | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PARTNER_ASSIGNMENT)),
):
    assignment = assisted_service.get_assignment(db, assignment_id, user)
    updated = assisted_service.respond_assignment(db, assignment, user, True, None)
    return {
        "assignment": assignment_payload(updated),
        "message": "Assignment accepted. Submit a field report with genuine findings.",
    }


@router.post("/assignments/{assignment_id}/decline")
def decline_assignment(
    assignment_id: uuid.UUID,
    payload: AssignmentDecisionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PARTNER_ASSIGNMENT)),
):
    assignment = assisted_service.get_assignment(db, assignment_id, user)
    updated = assisted_service.respond_assignment(db, assignment, user, False, payload.reason)
    return {"assignment": assignment_payload(updated), "message": "Assignment declined."}


@router.post("/assignments/{assignment_id}/reports", status_code=201)
def submit_report(
    assignment_id: uuid.UUID,
    payload: FieldReportIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PARTNER_REPORTS)),
):
    assignment = assisted_service.get_assignment(db, assignment_id, user)
    report = assisted_service.submit_field_report(
        db,
        assignment,
        user,
        report_type=payload.report_type,
        summary=payload.summary,
        findings=payload.findings,
        contact_name=payload.contact_name,
        contact_phone=payload.contact_phone,
        property_found=payload.property_found,
        photos=payload.photos,
    )
    return {
        "report": field_report_payload(report),
        "message": "Field report submitted for support review.",
    }


@router.get("/property-submissions")
def partner_property_submissions(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.DATA_COLLECT)),
):
    from app.services.property_service import base_property_query

    props = db.execute(
        base_property_query()
        .where(Property.source_partner_id == user.id, Property.deleted_at.is_(None))
        .order_by(Property.created_at.desc())
    ).scalars().unique().all()
    return {
        "submissions": [property_internal_summary(p) for p in props],
        "count": len(props),
    }


@router.get("/performance")
def partner_performance(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PARTNER_ASSIGNMENT)),
):
    partner = assisted_service.partner_profile_for_user(db, user)
    assignments = db.execute(
        select(PartnerAssignment).where(PartnerAssignment.partner_id == partner.id)
    ).scalars().all()
    completed = [a for a in assignments if a.status == AssignmentStatus.COMPLETED.value]
    reports = [r for a in assignments for r in a.reports]
    return {
        "performance": {
            "assignments_total": len(assignments),
            "accepted": len(
                [a for a in assignments if a.status in {"accepted", "in_progress", "completed"}]
            ),
            "completed": len(completed),
            "completion_rate": round(len(completed) / len(assignments) * 100, 1)
            if assignments
            else None,
            "field_reports": len(reports),
            "reviewed_reports": len([r for r in reports if r.status == "reviewed"]),
            "partner_rating": float(partner.rating) if partner.rating else None,
            "accuracy_score": float(partner.accuracy_score) if partner.accuracy_score else None,
        },
        "note": "Performance is based on recorded assignment outcomes, not listing volume.",
    }
