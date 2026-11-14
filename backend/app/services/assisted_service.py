from __future__ import annotations

import json
import secrets
import string
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.exceptions import Conflict, Forbidden, NotFound, UnprocessableState, ValidationError
from app.integrations.messaging import send_sms
from app.models import (
    AssignmentStatus,
    FieldReport,
    PartnerAssignment,
    PartnerProfile,
    PartnerServiceArea,
    RequestMatch,
    RequestMessage,
    RequestStatusHistory,
    Role,
    SearchRequest,
    SearchRequestStatus,
    Town,
    User,
)
from app.schemas.payloads import MessageIn, SearchRequestIn
from app.services.audit import write_audit
from app.services.matching_service import compute_matches, match_public_payload, persist_matches
from app.services.notifications import create_notification
from app.services.serializers import (
    assignment_payload,
    field_report_payload,
    match_payload,
    search_request_payload,
    utcnow,
)

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    SearchRequestStatus.SUBMITTED.value: {
        SearchRequestStatus.RECEIVED.value,
        SearchRequestStatus.CANCELLED.value,
    },
    SearchRequestStatus.RECEIVED.value: {
        SearchRequestStatus.UNDER_REVIEW.value,
        SearchRequestStatus.CANCELLED.value,
        SearchRequestStatus.NO_SUITABLE_MATCH.value,
    },
    SearchRequestStatus.UNDER_REVIEW.value: {
        SearchRequestStatus.MATCHING.value,
        SearchRequestStatus.AWAITING_LOCAL_INVESTIGATION.value,
        SearchRequestStatus.MATCHES_AVAILABLE.value,
        SearchRequestStatus.NO_SUITABLE_MATCH.value,
        SearchRequestStatus.CANCELLED.value,
    },
    SearchRequestStatus.MATCHING.value: {
        SearchRequestStatus.UNDER_REVIEW.value,
        SearchRequestStatus.AWAITING_LOCAL_INVESTIGATION.value,
        SearchRequestStatus.MATCHES_AVAILABLE.value,
        SearchRequestStatus.NO_SUITABLE_MATCH.value,
        SearchRequestStatus.CANCELLED.value,
    },
    SearchRequestStatus.AWAITING_LOCAL_INVESTIGATION.value: {
        SearchRequestStatus.PARTNER_ASSIGNED.value,
        SearchRequestStatus.UNDER_REVIEW.value,
        SearchRequestStatus.MATCHES_AVAILABLE.value,
        SearchRequestStatus.NO_SUITABLE_MATCH.value,
        SearchRequestStatus.CANCELLED.value,
    },
    SearchRequestStatus.PARTNER_ASSIGNED.value: {
        SearchRequestStatus.INVESTIGATION_IN_PROGRESS.value,
        SearchRequestStatus.AWAITING_LOCAL_INVESTIGATION.value,
        SearchRequestStatus.UNDER_REVIEW.value,
        SearchRequestStatus.CANCELLED.value,
    },
    SearchRequestStatus.INVESTIGATION_IN_PROGRESS.value: {
        SearchRequestStatus.MATCHES_AVAILABLE.value,
        SearchRequestStatus.UNDER_REVIEW.value,
        SearchRequestStatus.AWAITING_LOCAL_INVESTIGATION.value,
        SearchRequestStatus.NO_SUITABLE_MATCH.value,
        SearchRequestStatus.CANCELLED.value,
    },
    SearchRequestStatus.MATCHES_AVAILABLE.value: {
        SearchRequestStatus.AWAITING_SEEKER_RESPONSE.value,
        SearchRequestStatus.VIEWING_REQUESTED.value,
        SearchRequestStatus.COMPLETED.value,
        SearchRequestStatus.NO_SUITABLE_MATCH.value,
        SearchRequestStatus.CANCELLED.value,
    },
    SearchRequestStatus.AWAITING_SEEKER_RESPONSE.value: {
        SearchRequestStatus.MATCHES_AVAILABLE.value,
        SearchRequestStatus.VIEWING_REQUESTED.value,
        SearchRequestStatus.COMPLETED.value,
        SearchRequestStatus.CANCELLED.value,
        SearchRequestStatus.NO_SUITABLE_MATCH.value,
    },
    SearchRequestStatus.VIEWING_REQUESTED.value: {
        SearchRequestStatus.VIEWING_CONFIRMED.value,
        SearchRequestStatus.AWAITING_SEEKER_RESPONSE.value,
        SearchRequestStatus.COMPLETED.value,
        SearchRequestStatus.CANCELLED.value,
    },
    SearchRequestStatus.VIEWING_CONFIRMED.value: {
        SearchRequestStatus.COMPLETED.value,
        SearchRequestStatus.VIEWING_REQUESTED.value,
        SearchRequestStatus.CANCELLED.value,
    },
    SearchRequestStatus.COMPLETED.value: set(),
    SearchRequestStatus.CANCELLED.value: set(),
    SearchRequestStatus.NO_SUITABLE_MATCH.value: {SearchRequestStatus.UNDER_REVIEW.value},
}


def _generate_reference(db: Session, prefix: str, model) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(10):
        ref = f"{prefix}-{''.join(secrets.choice(alphabet) for _ in range(6))}"
        if not db.execute(select(model.id).where(model.reference == ref)).scalar_one_or_none():
            return ref
    raise Conflict("Could not allocate a reference. Try again.")


def accessible_request(
    db: Session, request_id: uuid.UUID, user: User, *, allow_partner: bool = True
) -> SearchRequest:
    request = db.execute(
        select(SearchRequest)
        .options(
            selectinload(SearchRequest.status_history),
            selectinload(SearchRequest.matches).joinedload(RequestMatch.property),
            selectinload(SearchRequest.assignments).joinedload(PartnerAssignment.partner).joinedload(PartnerProfile.user),
            selectinload(SearchRequest.assignments).selectinload(PartnerAssignment.reports),
            selectinload(SearchRequest.messages),
            joinedload(SearchRequest.town),
            joinedload(SearchRequest.neighbourhood),
            joinedload(SearchRequest.landmark),
            joinedload(SearchRequest.assigned_support),
        )
        .where(SearchRequest.id == request_id)
    ).scalar_one_or_none()
    if request is None:
        raise NotFound("Assisted search request not found.")
    if request.user_id == user.id:
        return request
    staff_perms = {"assisted:manage", "support:view"}
    if staff_perms & {p.code for role in user.roles for p in role.permissions}:
        return request
    if allow_partner:
        partner = db.execute(
            select(PartnerProfile).where(PartnerProfile.user_id == user.id)
        ).scalar_one_or_none()
        if partner and any(a.partner_id == partner.id for a in request.assignments):
            return request
    raise Forbidden("You do not have access to this assisted search request.")


def get_by_token(db: Session, token: str) -> SearchRequest:
    request = db.execute(
        select(SearchRequest)
        .options(
            selectinload(SearchRequest.status_history),
            selectinload(SearchRequest.matches).joinedload(RequestMatch.property),
            selectinload(SearchRequest.assignments),
            selectinload(SearchRequest.messages),
            joinedload(SearchRequest.town),
            joinedload(SearchRequest.neighbourhood),
            joinedload(SearchRequest.landmark),
        )
        .where(SearchRequest.secure_token == token)
    ).scalar_one_or_none()
    if request is None:
        raise NotFound("This tracking link is invalid or has expired.")
    return request


def create_request(
    db: Session, payload: SearchRequestIn, user: User | None
) -> tuple[SearchRequest, dict]:
    if not payload.consent_to_share:
        raise ValidationError("Consent is required to share your request with a local partner if needed.")
    guest_name = user.name if user else payload.guest_name
    guest_phone = user.phone if user else payload.guest_phone
    guest_email = str(payload.guest_email) if payload.guest_email else (user.email if user else None)
    if not guest_name or not guest_phone:
        raise ValidationError("Your name and phone number are required.")
    if payload.category == "commercial" and not payload.business_type and not payload.requirements:
        raise ValidationError("Tell us about your business or intended use.")
    town_id = uuid.UUID(payload.town_id) if payload.town_id else None
    if town_id and db.get(Town, town_id) is None:
        raise ValidationError("Select a valid town.")
    request = SearchRequest(
        reference=_generate_reference(db, "ASR", SearchRequest),
        secure_token=secrets.token_urlsafe(32),
        user_id=user.id if user else None,
        guest_name=guest_name,
        guest_phone=guest_phone,
        guest_email=guest_email,
        category=payload.category,
        county_id=uuid.UUID(payload.county_id) if payload.county_id else None,
        town_id=town_id,
        neighbourhood_id=uuid.UUID(payload.neighbourhood_id) if payload.neighbourhood_id else None,
        landmark_id=uuid.UUID(payload.landmark_id) if payload.landmark_id else None,
        budget_min=payload.budget_min,
        budget_max=payload.budget_max,
        property_type=payload.property_type,
        bedrooms_min=payload.bedrooms_min,
        floor_area_min=payload.floor_area_min,
        floor_area_max=payload.floor_area_max,
        frontage_min=payload.frontage_min,
        loading_required=payload.loading_required,
        parking_required=payload.parking_required,
        facilities=json.dumps(payload.facilities),
        move_in_date=payload.move_in_date,
        business_type=payload.business_type,
        requirements=payload.requirements,
        assistance_requirements=payload.assistance_requirements,
        contact_method=payload.contact_method,
        status=SearchRequestStatus.RECEIVED.value,
        priority="normal",
        consent_to_share=True,
    )
    db.add(request)
    db.flush()
    db.add(
        RequestStatusHistory(
            request_id=request.id,
            from_status=SearchRequestStatus.SUBMITTED.value,
            to_status=SearchRequestStatus.RECEIVED.value,
            notes="Request received. Our team will review it.",
        )
    )
    support_users = db.execute(
        select(User)
        .join(User.roles)
        .where(Role.code == "support_officer")
        .options(selectinload(User.roles))
    ).scalars().unique().all()
    if user:
        create_notification(
            db,
            user=user,
            notification_type="assisted_request_received",
            title="Your assisted search request was received",
            body=f"Reference {request.reference}. You can track progress and see matches in your dashboard.",
            data={"request_id": str(request.id), "reference": request.reference},
            channels=["in_app", "sms"],
            important=True,
        )
    else:
        try:
            send_sms(
                guest_phone,
                f"Findora: request {request.reference} received. Track it securely at "
                f"{request.secure_token[:8]}… details in your confirmation.",
            )
        except Exception:
            pass
    for staff in support_users:
        create_notification(
            db,
            user=staff,
            notification_type="new_assisted_request",
            title="New assisted search request",
            body=f"{request.reference} · {payload.category} · {guest_name}",
            data={"request_id": str(request.id)},
            channels=["in_app"],
        )
    write_audit(
        db,
        actor=user,
        action="assisted_request.created",
        resource_type="search_request",
        resource_id=request.id,
        after={"reference": request.reference, "category": payload.category},
    )
    db.commit()
    db.refresh(request)
    return request, {
        "tracking_token": request.secure_token,
        "tracking_url": f"/track-request?token={request.secure_token}",
    }


def transition_request(
    db: Session,
    request: SearchRequest,
    new_status: str,
    actor: User,
    notes: str | None = None,
) -> SearchRequest:
    current = request.status
    if new_status == current:
        return request
    if new_status not in ALLOWED_TRANSITIONS.get(current, set()):
        raise UnprocessableState(
            f"Cannot move the request from {current.replace('_', ' ')} to {new_status.replace('_', ' ')}."
        )
    request.status = new_status
    if new_status == SearchRequestStatus.COMPLETED.value:
        request.completed_at = utcnow()
    db.add(
        RequestStatusHistory(
            request_id=request.id,
            from_status=current,
            to_status=new_status,
            actor_id=actor.id,
            notes=notes,
        )
    )
    if request.user_id:
        seeker = db.get(User, request.user_id)
        if seeker:
            create_notification(
                db,
                user=seeker,
                notification_type="assisted_request_update",
                title="Your assisted search was updated",
                body=f"{request.reference} is now {new_status.replace('_', ' ')}."
                + (f" {notes}" if notes else ""),
                data={"request_id": str(request.id), "status": new_status},
                channels=["in_app"],
            )
    else:
        try:
            send_sms(
                request.guest_phone,
                f"Findora request {request.reference}: {new_status.replace('_', ' ')}. {notes or ''}".strip(),
            )
        except Exception:
            pass
    write_audit(
        db,
        actor=actor,
        action="assisted_request.status_changed",
        resource_type="search_request",
        resource_id=request.id,
        before={"status": current},
        after={"status": new_status, "notes": notes},
    )
    db.commit()
    return request


def cancel_request(db: Session, request: SearchRequest, actor: User, reason: str) -> SearchRequest:
    if request.user_id != actor.id and "assisted:manage" not in {
        p.code for role in actor.roles for p in role.permissions
    }:
        raise Forbidden("You can only cancel your own request.")
    if request.status in {
        SearchRequestStatus.COMPLETED.value,
        SearchRequestStatus.CANCELLED.value,
    }:
        raise UnprocessableState("This request is already closed.")
    previous = request.status
    request.status = SearchRequestStatus.CANCELLED.value
    request.cancellation_reason = reason
    db.add(
        RequestStatusHistory(
            request_id=request.id,
            from_status=previous,
            to_status=SearchRequestStatus.CANCELLED.value,
            actor_id=actor.id,
            notes=reason,
        )
    )
    write_audit(
        db,
        actor=actor,
        action="assisted_request.cancelled",
        resource_type="search_request",
        resource_id=request.id,
        after={"reason": reason},
    )
    db.commit()
    return request


def list_requests_for_user(db: Session, user: User) -> list[SearchRequest]:
    return db.execute(
        select(SearchRequest)
        .options(
            selectinload(SearchRequest.status_history),
            selectinload(SearchRequest.matches),
            selectinload(SearchRequest.assignments),
            selectinload(SearchRequest.messages),
            joinedload(SearchRequest.town),
            joinedload(SearchRequest.neighbourhood),
            joinedload(SearchRequest.landmark),
            joinedload(SearchRequest.assigned_support),
        )
        .where(SearchRequest.user_id == user.id)
        .order_by(SearchRequest.created_at.desc())
    ).scalars().unique().all()


def get_matches_for_request(
    db: Session, request: SearchRequest, user: User | None, *, support_view: bool = False
) -> dict:
    sent = [m for m in request.matches if m.status in {"sent", "accepted", "declined"}]
    if not support_view:
        return {
            "matches": [match_payload(m) for m in sent if m.status != "declined"],
            "sent_count": len(sent),
            "message": "These are matches shared by our property team. Confirm availability before paying anything."
            if sent
            else "Our team has not shared matches yet.",
        }
    computed = compute_matches(db, request)
    suggestions = match_public_payload(computed["matches"])
    return {
        "suggestions": suggestions,
        "persisted": [match_payload(m) for m in request.matches],
        "strict_count": computed["strict_count"],
        "alternative_count": computed["alternative_count"],
        "restrictions": computed["restrictions"],
        "message": computed["message"],
        "weights": computed["weights"],
    }


def send_matches(db: Session, request: SearchRequest, actor: User, notes: str | None = None) -> dict:
    computed = compute_matches(db, request, limit=8)
    if not computed["matches"]:
        return {
            "sent": 0,
            "message": "No genuine database matches were found. Assign a local partner or record an external property before sharing matches.",
            "restrictions": computed["restrictions"],
        }
    matches = persist_matches(db, request, computed["matches"], actor.id)
    for match in matches:
        match.status = "sent"
    previous_status = request.status
    request.status = SearchRequestStatus.MATCHES_AVAILABLE.value
    db.add(
        RequestStatusHistory(
            request_id=request.id,
            from_status=previous_status,
            to_status=SearchRequestStatus.MATCHES_AVAILABLE.value,
            actor_id=actor.id,
            notes=notes or f"{len(matches)} matches shared",
        )
    )
    db.add(
        RequestMessage(
            request_id=request.id,
            sender_id=actor.id,
            sender_name="Findora property team",
            body=notes
            or f"We found {len(matches)} suitable propert{'y' if len(matches) == 1 else 'ies'} for you. Review them and request a viewing.",
            is_internal=False,
        )
    )
    if request.user_id:
        seeker = db.get(User, request.user_id)
        if seeker:
            create_notification(
                db,
                user=seeker,
                notification_type="assisted_matches_available",
                title="Property matches are ready",
                body=f"{len(matches)} matches have been shared for request {request.reference}.",
                data={"request_id": str(request.id)},
                channels=["in_app", "sms"],
                important=True,
            )
    else:
        try:
            send_sms(
                request.guest_phone,
                f"Findora: {len(matches)} matches are ready for {request.reference}. Track your request for details.",
            )
        except Exception:
            pass
    write_audit(
        db,
        actor=actor,
        action="assisted_request.matches_sent",
        resource_type="search_request",
        resource_id=request.id,
        after={"count": len(matches)},
    )
    db.commit()
    return {
        "sent": len(matches),
        "matches": [match_payload(m) for m in matches],
        "message": "Matches shared with the seeker.",
        "restrictions": computed["restrictions"],
    }


def assign_partner(
    db: Session,
    request: SearchRequest,
    partner: PartnerProfile,
    actor: User,
    instructions: str | None,
    due_at=None,
) -> PartnerAssignment:
    if partner.status != "active":
        raise ValidationError("This partner is not active.")
    if not request.consent_to_share:
        raise ValidationError("The seeker has not consented to sharing details with a local partner.")
    if request.town_id and partner.service_areas:
        if not any(a.town_id == request.town_id for a in partner.service_areas):
            raise ValidationError("This partner does not cover the request town.")
    if any(a.status in {"offered", "accepted", "in_progress"} for a in request.assignments):
        raise Conflict("This request already has an active partner assignment.")
    assignment = PartnerAssignment(
        reference=_generate_reference(db, "ASG", PartnerAssignment),
        request_id=request.id,
        partner_id=partner.id,
        assigned_by_id=actor.id,
        status=AssignmentStatus.OFFERED.value,
        instructions=instructions,
        due_at=datetime.combine(due_at, datetime.min.time(), tzinfo=UTC) if due_at else utcnow() + timedelta(days=3),
    )
    db.add(assignment)
    request.assigned_support_id = request.assigned_support_id or actor.id
    request.status = SearchRequestStatus.PARTNER_ASSIGNED.value
    request.assignments.append(assignment)
    db.add(
        RequestStatusHistory(
            request_id=request.id,
            from_status=SearchRequestStatus.AWAITING_LOCAL_INVESTIGATION.value,
            to_status=SearchRequestStatus.PARTNER_ASSIGNED.value,
            actor_id=actor.id,
            notes=f"Local partner assigned: {partner.company_name or partner.user.name}",
        )
    )
    if partner.user:
        create_notification(
            db,
            user=partner.user,
            notification_type="partner_assignment",
            title="New local investigation assignment",
            body=f"Assignment {assignment.reference} for request {request.reference}.",
            data={"assignment_id": str(assignment.id)},
            channels=["in_app", "sms"],
            important=True,
        )
    write_audit(
        db,
        actor=actor,
        action="partner.assigned",
        resource_type="search_request",
        resource_id=request.id,
        after={"partner_id": str(partner.id), "assignment_id": str(assignment.id)},
    )
    db.commit()
    return assignment


def partner_profile_for_user(db: Session, user: User) -> PartnerProfile:
    partner = db.execute(
        select(PartnerProfile)
        .options(joinedload(PartnerProfile.user), selectinload(PartnerProfile.service_areas))
        .where(PartnerProfile.user_id == user.id)
    ).scalar_one_or_none()
    if partner is None:
        raise Forbidden("A partner profile is required.", code="partner_profile_missing")
    return partner


def assignments_for_partner(db: Session, user: User) -> list[PartnerAssignment]:
    partner = partner_profile_for_user(db, user)
    return db.execute(
        select(PartnerAssignment)
        .options(
            joinedload(PartnerAssignment.request).joinedload(SearchRequest.town),
            joinedload(PartnerAssignment.request).joinedload(SearchRequest.neighbourhood),
            joinedload(PartnerAssignment.partner).joinedload(PartnerProfile.user),
            joinedload(PartnerAssignment.assigned_by),
            selectinload(PartnerAssignment.reports),
        )
        .where(PartnerAssignment.partner_id == partner.id)
        .order_by(PartnerAssignment.created_at.desc())
    ).scalars().unique().all()


def get_assignment(db: Session, assignment_id: uuid.UUID, user: User) -> PartnerAssignment:
    partner = partner_profile_for_user(db, user)
    assignment = db.execute(
        select(PartnerAssignment)
        .options(
            joinedload(PartnerAssignment.request).joinedload(SearchRequest.town),
            joinedload(PartnerAssignment.request).joinedload(SearchRequest.neighbourhood),
            joinedload(PartnerAssignment.partner).joinedload(PartnerProfile.user),
            selectinload(PartnerAssignment.reports),
        )
        .where(PartnerAssignment.id == assignment_id, PartnerAssignment.partner_id == partner.id)
    ).scalar_one_or_none()
    if assignment is None:
        raise NotFound("Assignment not found.")
    return assignment


def respond_assignment(
    db: Session, assignment: PartnerAssignment, user: User, accept: bool, reason: str | None
) -> PartnerAssignment:
    if assignment.status not in {AssignmentStatus.OFFERED.value, AssignmentStatus.ACCEPTED.value}:
        raise UnprocessableState("This assignment can no longer be changed.")
    if accept:
        assignment.status = AssignmentStatus.ACCEPTED.value
        assignment.accepted_at = utcnow()
        assignment.request.status = SearchRequestStatus.INVESTIGATION_IN_PROGRESS.value
        db.add(
            RequestStatusHistory(
                request_id=assignment.request_id,
                from_status=SearchRequestStatus.PARTNER_ASSIGNED.value,
                to_status=SearchRequestStatus.INVESTIGATION_IN_PROGRESS.value,
                actor_id=user.id,
                notes="Local partner accepted the assignment and began investigating.",
            )
        )
        if assignment.request.user_id:
            seeker = db.get(User, assignment.request.user_id)
            if seeker:
                create_notification(
                    db,
                    user=seeker,
                    notification_type="assisted_investigation_started",
                    title="Local investigation started",
                    body=f"A local partner is checking properties for {assignment.request.reference}.",
                    data={"request_id": str(assignment.request_id)},
                    channels=["in_app"],
                )
    else:
        assignment.status = AssignmentStatus.DECLINED.value
        assignment.declined_reason = reason
        assignment.request.status = SearchRequestStatus.AWAITING_LOCAL_INVESTIGATION.value
    write_audit(
        db,
        actor=user,
        action="partner.assignment_accepted" if accept else "partner.assignment_declined",
        resource_type="partner_assignment",
        resource_id=assignment.id,
        after={"status": assignment.status, "reason": reason},
    )
    db.commit()
    return assignment


def submit_field_report(
    db: Session,
    assignment: PartnerAssignment,
    user: User,
    *,
    report_type: str,
    summary: str,
    findings: dict,
    contact_name: str | None,
    contact_phone: str | None,
    property_found: bool,
    photos: list[str],
) -> FieldReport:
    partner = partner_profile_for_user(db, user)
    if assignment.status not in {AssignmentStatus.ACCEPTED.value, AssignmentStatus.IN_PROGRESS.value}:
        raise UnprocessableState("Accept the assignment before submitting a report.")
    report = FieldReport(
        assignment_id=assignment.id,
        partner_id=partner.id,
        report_type=report_type,
        summary=summary,
        findings=json.dumps(findings),
        contact_name=contact_name,
        contact_phone=contact_phone,
        property_found=property_found,
        photos=json.dumps(photos),
        status="submitted",
    )
    assignment.status = AssignmentStatus.IN_PROGRESS.value
    db.add(report)
    db.flush()
    if assignment.request.assigned_support_id:
        support = db.get(User, assignment.request.assigned_support_id)
        if support:
            create_notification(
                db,
                user=support,
                notification_type="field_report_submitted",
                title="Field report submitted",
                body=f"Partner report for {assignment.request.reference} is ready for review.",
                data={"assignment_id": str(assignment.id), "report_id": str(report.id)},
                channels=["in_app"],
            )
    write_audit(
        db,
        actor=user,
        action="partner.field_report_submitted",
        resource_type="field_report",
        resource_id=report.id,
        after={"assignment_id": str(assignment.id)},
    )
    db.commit()
    db.refresh(report)
    return report


def review_field_report(
    db: Session, report: FieldReport, reviewer: User, notes: str, approve: bool = True
) -> FieldReport:
    report.status = "reviewed" if approve else "needs_revision"
    report.review_notes = notes
    report.reviewed_by_id = reviewer.id
    report.reviewed_at = utcnow()
    if approve:
        assignment = report.assignment
        assignment.status = AssignmentStatus.COMPLETED.value
        assignment.completed_at = utcnow()
        partner = db.get(PartnerProfile, assignment.partner_id)
        if partner:
            partner.completed_assignments = (partner.completed_assignments or 0) + 1
    write_audit(
        db,
        actor=reviewer,
        action="partner.field_report_reviewed",
        resource_type="field_report",
        resource_id=report.id,
        after={"status": report.status, "notes": notes},
    )
    db.commit()
    return report


def add_external_match(
    db: Session, request: SearchRequest, actor: User, *, title: str, description: str | None, rent_amount, location_text: str | None
) -> RequestMatch:
    match = RequestMatch(
        request_id=request.id,
        title=title,
        description=description,
        rent_amount=rent_amount,
        location_text=location_text,
        stage="partner",
        status="suggested",
        created_by_id=actor.id,
        score=0,
        explanation=json.dumps(
            {
                "positives": ["Verified through local partner investigation"],
                "negatives": [],
                "unmet_requirements": [],
            }
        ),
    )
    db.add(match)
    db.flush()
    write_audit(
        db,
        actor=actor,
        action="assisted_request.external_match_added",
        resource_type="search_request",
        resource_id=request.id,
        after={"match_id": str(match.id), "title": title},
    )
    db.commit()
    return match


def add_message(
    db: Session, request: SearchRequest, actor: User, payload: MessageIn
) -> RequestMessage:
    permissions = {p.code for role in actor.roles for p in role.permissions}
    is_staff = "assisted:manage" in permissions or "support:message" in permissions
    if request.user_id != actor.id and not is_staff:
        raise Forbidden("You do not have access to message on this request.")
    message = RequestMessage(
        request_id=request.id,
        sender_id=actor.id,
        sender_name=("Findora property team" if is_staff else actor.name),
        body=payload.body,
        is_internal=payload.is_internal and is_staff,
    )
    db.add(message)
    if request.user_id and is_staff:
        seeker = db.get(User, request.user_id)
        if seeker:
            create_notification(
                db,
                user=seeker,
                notification_type="request_message",
                title="New message about your assisted search",
                body=payload.body[:300],
                data={"request_id": str(request.id)},
                channels=["in_app"],
            )
    write_audit(
        db,
        actor=actor,
        action="assisted_request.message_sent",
        resource_type="search_request",
        resource_id=request.id,
        after={"internal": message.is_internal},
    )
    db.commit()
    db.refresh(message)
    return message


def partner_apply(
    db: Session, user: User, payload, town_id: uuid.UUID
) -> PartnerProfile:
    existing = db.execute(
        select(PartnerProfile).where(PartnerProfile.user_id == user.id)
    ).scalar_one_or_none()
    if existing:
        raise Conflict("You already have a partner application.")
    town = db.get(Town, town_id)
    if town is None:
        raise ValidationError("Select a valid service area town.")
    role_code = "data_partner" if payload.partner_type == "data_collection" else "finding_partner"
    role = db.execute(select(Role).where(Role.code == role_code)).scalar_one_or_none()
    if role and role not in user.roles:
        user.roles.append(role)
    partner = PartnerProfile(
        user_id=user.id,
        partner_type=payload.partner_type,
        company_name=payload.company_name,
        phone_alt=payload.phone_alt,
        status="pending",
        notes=payload.notes,
    )
    partner.service_areas.append(
        PartnerServiceArea(town_id=town.id, is_primary=True)
    )
    for nid in payload.neighbourhood_ids:
        partner.service_areas.append(
            PartnerServiceArea(town_id=town.id, neighbourhood_id=uuid.UUID(nid))
        )
    db.add(partner)
    write_audit(
        db,
        actor=user,
        action="partner.applied",
        resource_type="partner_profile",
        resource_id=partner.id,
        after={"partner_type": payload.partner_type, "town_id": str(town.id)},
    )
    db.commit()
    db.refresh(partner)
    return partner


def partner_requests(db: Session, user: User) -> list[PartnerAssignment]:
    return assignments_for_partner(db, user)
