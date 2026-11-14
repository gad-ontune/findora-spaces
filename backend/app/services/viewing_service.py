from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from dateutil.parser import isoparse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.exceptions import Conflict, Forbidden, NotFound, UnprocessableState, ValidationError
from app.models import Complaint, Property, User, Viewing, ViewingFeedback, ViewingStatusHistory
from app.models.base import PropertyStatus, ViewingStatus
from app.schemas.payloads import ViewingCreateIn, ViewingFeedbackIn, ViewingUpdateIn
from app.services.audit import write_audit
from app.services.notifications import create_notification
from app.services.property_service import load_property
from app.services.serializers import effective_availability, utcnow

ALLOWED_VIEWING_TRANSITIONS: dict[str, set[str]] = {
    ViewingStatus.REQUESTED.value: {
        ViewingStatus.PROPOSED.value,
        ViewingStatus.CONFIRMED.value,
        ViewingStatus.CANCELLED.value,
        ViewingStatus.MISSED.value,
    },
    ViewingStatus.PROPOSED.value: {
        ViewingStatus.CONFIRMED.value,
        ViewingStatus.CANCELLED.value,
        ViewingStatus.MISSED.value,
    },
    ViewingStatus.CONFIRMED.value: {
        ViewingStatus.COMPLETED.value,
        ViewingStatus.CANCELLED.value,
        ViewingStatus.MISSED.value,
    },
    ViewingStatus.COMPLETED.value: set(),
    ViewingStatus.CANCELLED.value: set(),
    ViewingStatus.MISSED.value: set(),
}


def _generate_reference(db: Session) -> str:
    import secrets
    import string

    for _ in range(10):
        ref = "VW-" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
        if not db.execute(select(Viewing.id).where(Viewing.reference == ref)).scalar_one_or_none():
            return ref
    raise Conflict("Could not allocate a viewing reference.")


def create_viewing(db: Session, payload: ViewingCreateIn, user: User | None) -> Viewing:
    try:
        property_id = uuid.UUID(payload.property_id)
    except ValueError as exc:
        raise ValidationError("Select a valid property.") from exc
    prop = load_property(db, property_id)
    if prop.status != PropertyStatus.APPROVED.value or effective_availability(prop) != "available":
        raise UnprocessableState("This property is not currently available for viewings.")
    landlord_id = prop.owner_id or prop.manager_id or prop.created_by_id
    since = utcnow() - timedelta(hours=24)
    existing = db.execute(
        select(Viewing).where(
            Viewing.property_id == prop.id,
            Viewing.seeker_phone == payload.seeker_phone,
            Viewing.created_at >= since,
            Viewing.status.in_([ViewingStatus.REQUESTED.value, ViewingStatus.PROPOSED.value, ViewingStatus.CONFIRMED.value]),
        )
    ).scalar_one_or_none()
    if existing:
        raise Conflict("You already have an active viewing request for this property.")
    preferred = None
    if payload.preferred_date:
        preferred = datetime.combine(payload.preferred_date, datetime.min.time(), tzinfo=UTC)
    viewing = Viewing(
        reference=_generate_reference(db),
        property_id=prop.id,
        seeker_id=user.id if user else None,
        seeker_name=payload.seeker_name,
        seeker_phone=payload.seeker_phone,
        landlord_id=landlord_id,
        requested_by_id=user.id if user else None,
        preferred_date=preferred,
        status=ViewingStatus.REQUESTED.value,
        notes=payload.notes,
    )
    db.add(viewing)
    db.flush()
    db.add(
        ViewingStatusHistory(
            viewing_id=viewing.id,
            from_status=None,
            to_status=ViewingStatus.REQUESTED.value,
            actor_id=user.id if user else None,
            notes="Viewing requested",
        )
    )
    landlord = db.get(User, landlord_id)
    if landlord:
        create_notification(
            db,
            user=landlord,
            notification_type="viewing_requested",
            title=f"New viewing request for {prop.title}",
            body=f"{payload.seeker_name} requested a viewing for {prop.reference}. Confirm a time in your dashboard.",
            data={"viewing_id": str(viewing.id), "property_id": str(prop.id)},
            channels=["in_app", "sms"],
        )
    write_audit(
        db,
        actor=user,
        action="viewing.requested",
        resource_type="viewing",
        resource_id=viewing.id,
        after={"property_id": str(prop.id), "seeker_phone": payload.seeker_phone},
    )
    db.commit()
    db.refresh(viewing)
    return viewing


def viewing_query():
    return select(Viewing).options(
        joinedload(Viewing.property),
        joinedload(Viewing.seeker),
        joinedload(Viewing.landlord),
        selectinload(Viewing.status_history),
        selectinload(Viewing.feedback),
    )


def list_viewings(db: Session, user: User) -> list[Viewing]:
    permissions = {p.code for role in user.roles for p in role.permissions}
    query = viewing_query().order_by(Viewing.created_at.desc())
    if "viewing:manage" in permissions and not {"support_officer", "super_admin"} & set(user.role_codes):
        # Landlords/managers only see viewings they host.
        query = query.where(Viewing.landlord_id == user.id)
    elif "support:view" in permissions or "assisted:manage" in permissions or "super_admin" in user.role_codes:
        pass
    else:
        query = query.where(or_(Viewing.seeker_id == user.id, Viewing.landlord_id == user.id))
    return db.execute(query).scalars().unique().all()


def get_viewing(db: Session, viewing_id: uuid.UUID, user: User) -> Viewing:
    viewing = db.execute(
        viewing_query().where(Viewing.id == viewing_id)
    ).scalar_one_or_none()
    if viewing is None:
        raise NotFound("Viewing not found.")
    permissions = {p.code for role in user.roles for p in role.permissions}
    staff = bool({"support:view", "assisted:manage", "viewing:manage"} & permissions) and bool(
        {"support_officer", "super_admin", "verification_officer"} & set(user.role_codes)
    )
    if viewing.seeker_id != user.id and viewing.landlord_id != user.id and viewing.coordinator_id != user.id and not staff:
        raise Forbidden("You do not have access to this viewing.")
    return viewing


def update_viewing(
    db: Session, viewing: Viewing, payload: ViewingUpdateIn, user: User
) -> Viewing:
    permissions = {p.code for role in user.roles for p in role.permissions}
    is_host = viewing.landlord_id == user.id
    is_seeker = viewing.seeker_id == user.id
    is_staff = bool({"support:view", "assisted:manage"} & permissions) and "super_admin" in user.role_codes
    if not (is_host or is_seeker or is_staff):
        raise Forbidden("You cannot update this viewing.")
    new_status = payload.status
    if new_status == ViewingStatus.CANCELLED.value and not (is_host or is_seeker or is_staff):
        raise Forbidden("You cannot cancel this viewing.")
    if new_status in {ViewingStatus.CONFIRMED.value, ViewingStatus.PROPOSED.value, ViewingStatus.COMPLETED.value, ViewingStatus.MISSED.value} and not (is_host or is_staff):
        raise Forbidden("Only the property representative can update this viewing status.")
    if new_status not in ALLOWED_VIEWING_TRANSITIONS.get(viewing.status, set()):
        raise UnprocessableState(
            f"Cannot change viewing from {viewing.status} to {new_status}."
        )
    previous = viewing.status
    scheduled_at = viewing.scheduled_at
    if payload.scheduled_at:
        try:
            scheduled_at = isoparse(payload.scheduled_at)
        except (ValueError, TypeError) as exc:
            raise ValidationError("Enter a valid viewing date and time.") from exc
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=UTC)
        if new_status == ViewingStatus.CONFIRMED.value and scheduled_at < utcnow() - timedelta(minutes=5):
            raise ValidationError("Choose a future date and time for the viewing.")
    if new_status == ViewingStatus.CONFIRMED.value and scheduled_at is None:
        raise ValidationError("A confirmed viewing requires a date and time.")
    viewing.status = new_status
    viewing.scheduled_at = scheduled_at
    if payload.meeting_point:
        viewing.meeting_point = payload.meeting_point
    if payload.notes:
        viewing.notes = payload.notes
    if new_status == ViewingStatus.CANCELLED.value:
        viewing.cancellation_reason = payload.cancellation_reason
    if new_status == ViewingStatus.COMPLETED.value:
        viewing.completed_at = utcnow()
    db.add(
        ViewingStatusHistory(
            viewing_id=viewing.id,
            from_status=previous,
            to_status=new_status,
            actor_id=user.id,
            notes=payload.notes or payload.cancellation_reason,
        )
    )
    counterpart = viewing.seeker_id if is_host else viewing.landlord_id
    if counterpart:
        recipient = db.get(User, counterpart)
        if recipient:
            create_notification(
                db,
                user=recipient,
                notification_type="viewing_update",
                title=f"Viewing {new_status}",
                body=f"Viewing {viewing.reference} for {viewing.property.title} is now {new_status}."
                + (f" Scheduled for {scheduled_at:%d %b %Y %H:%M}." if scheduled_at else ""),
                data={"viewing_id": str(viewing.id)},
                channels=["in_app", "sms"],
            )
    write_audit(
        db,
        actor=user,
        action="viewing.updated",
        resource_type="viewing",
        resource_id=viewing.id,
        before={"status": previous},
        after={"status": new_status, "scheduled_at": scheduled_at},
    )
    db.commit()
    db.refresh(viewing)
    return viewing


def submit_feedback(
    db: Session, viewing: Viewing, payload: ViewingFeedbackIn, user: User
) -> ViewingFeedback:
    if viewing.seeker_id != user.id:
        raise Forbidden("Only the seeker who requested this viewing can submit feedback.")
    if viewing.status not in {ViewingStatus.CONFIRMED.value, ViewingStatus.COMPLETED.value}:
        raise UnprocessableState("Feedback can be submitted after a confirmed viewing.")
    if viewing.feedback:
        raise Conflict("Feedback has already been submitted for this viewing.")
    feedback = ViewingFeedback(
        viewing_id=viewing.id,
        seeker_id=user.id,
        matched_photos=payload.matched_photos,
        matched_description=payload.matched_description,
        rent_matched=payload.rent_matched,
        property_available=payload.property_available,
        representative_reachable=payload.representative_reachable,
        suspected_fraud=payload.suspected_fraud,
        rating=payload.rating,
        comments=payload.comments,
    )
    db.add(feedback)
    if viewing.status == ViewingStatus.CONFIRMED.value:
        viewing.status = ViewingStatus.COMPLETED.value
        viewing.completed_at = utcnow()
        db.add(
            ViewingStatusHistory(
                viewing_id=viewing.id,
                from_status=ViewingStatus.CONFIRMED.value,
                to_status=ViewingStatus.COMPLETED.value,
                actor_id=user.id,
                notes="Viewing completed; feedback submitted.",
            )
        )
    significant_issue = bool(
        payload.suspected_fraud
        or payload.matched_photos is False
        or payload.matched_description is False
        or payload.rent_matched is False
        or payload.property_available is False
    )
    if significant_issue:
        complaint = Complaint(
            reference=f"CMP-{str(viewing.id).replace('-', '')[:8].upper()}",
            complainant_id=user.id,
            complainant_name=user.name,
            complainant_phone=user.phone,
            property_id=viewing.property_id,
            category="viewing_discrepancy",
            description=payload.comments
            or "Viewing feedback indicated a discrepancy between the listing and the property.",
            status="open",
            priority="high" if payload.suspected_fraud else "normal",
        )
        db.add(complaint)
        from app.models import Role

        moderators = db.execute(
            select(User).join(User.roles).where(Role.code.in_(["moderator", "super_admin"]))
        ).scalars().unique().all()
        for moderator in moderators:
            create_notification(
                db,
                user=moderator,
                notification_type="viewing_complaint",
                title="Viewing discrepancy reported",
                body=f"A seeker reported an issue after viewing {viewing.property.reference}.",
                data={"complaint_id": str(complaint.id), "viewing_id": str(viewing.id)},
                channels=["in_app"],
            )
    landlord = db.get(User, viewing.landlord_id)
    if landlord:
        create_notification(
            db,
            user=landlord,
            notification_type="viewing_feedback",
            title="Viewing feedback received",
            body=f"Feedback was submitted for viewing {viewing.reference}."
            + (" A discrepancy was reported." if significant_issue else ""),
            data={"viewing_id": str(viewing.id)},
            channels=["in_app"],
        )
    write_audit(
        db,
        actor=user,
        action="viewing.feedback_submitted",
        resource_type="viewing",
        resource_id=viewing.id,
        after={"suspected_fraud": payload.suspected_fraud, "rating": payload.rating},
    )
    db.commit()
    db.refresh(feedback)
    return feedback
