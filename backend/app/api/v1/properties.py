from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import (
    PageParams,
    get_optional_user,
    paginate,
    permission_codes,
    require_any_permission,
    require_permissions,
    require_staff,
)
from app.core.exceptions import Forbidden, NotFound, ValidationError
from app.core.permissions import P
from app.core.rate_limit import RateLimiter
from app.integrations.storage import delete_local, save_upload
from app.models import (
    Property,
    PropertyEnquiry,
    PropertyMedia,
    PropertyReport,
    User,
    VerificationRecord,
)
from app.models.base import AvailabilityStatus, PropertyStatus
from app.schemas.payloads import (
    AvailabilityIn,
    EnquiryCreateIn,
    EnquiryRespondIn,
    InspectionIn,
    ModerationIn,
    PropertyCreateIn,
    PropertyUpdateIn,
    PropertyReportResolveIn,
    ReportIn,
    VerificationRequestIn,
    VerificationReviewIn,
)
from app.services import property_service
from app.services.audit import write_audit
from app.services.notifications import create_notification
from app.services.property_service import (
    assert_can_manage,
    can_manage_property,
    load_property,
    property_internal_summary,
)
from app.services.search_service import search_properties
from app.services.serializers import (
    property_detail,
    property_summary,
    report_payload,
    utcnow,
)

router = APIRouter(prefix="/properties", tags=["Properties"])
enquiry_router = APIRouter(prefix="/enquiries", tags=["Enquiries"])
verification_router = APIRouter(prefix="/verification", tags=["Verification"])

enquiry_limiter = RateLimiter("enquiry", 12, 3600)
report_limiter = RateLimiter("report", 12, 3600)


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _is_staff(user: User | None) -> bool:
    if user is None:
        return False
    return bool(
        set(user.role_codes)
        & {"moderator", "verification_officer", "super_admin", "support_officer"}
    )


@router.get("")
def list_properties(
    db: Session = Depends(get_db),
    category: str | None = Query(default=None, pattern="^(residential|commercial)$"),
    county: str | None = None,
    county_id: str | None = None,
    town: str | None = None,
    town_id: str | None = None,
    neighbourhood: str | None = None,
    neighbourhood_id: str | None = None,
    landmark: str | None = None,
    min_rent: float | None = Query(default=None, ge=0),
    max_rent: float | None = Query(default=None, ge=0),
    property_type: str | None = None,
    furnishing: str | None = Query(default=None, pattern="^(furnished|semi_furnished|unfurnished)$"),
    verified: str | None = Query(default=None, pattern="^(any|phone|identity|ownership|authority|inspection|availability|rent|details)$"),
    recently_confirmed_days: int | None = Query(default=None, ge=1, le=90),
    amenities: str | None = Query(default=None, description="Comma-separated amenity slugs"),
    bedrooms_min: int | None = Query(default=None, ge=0, le=30),
    bedrooms_max: int | None = Query(default=None, ge=0, le=30),
    bathrooms_min: int | None = Query(default=None, ge=0, le=30),
    parking_min: int | None = Query(default=None, ge=0, le=100),
    business_use: str | None = None,
    floor_area_min: float | None = Query(default=None, gt=0),
    floor_area_max: float | None = Query(default=None, gt=0),
    frontage_min: float | None = Query(default=None, ge=0),
    loading_access: bool | None = None,
    lease_duration_min: int | None = Query(default=None, ge=0),
    q: str | None = Query(default=None, max_length=160),
    featured: bool | None = None,
    north: float | None = None,
    south: float | None = None,
    east: float | None = None,
    west: float | None = None,
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float | None = Query(default=None, gt=0, le=100),
    sort: str = Query(default="newest", pattern="^(newest|oldest|rent_low|rent_high|freshness|featured|popular)$"),
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=20, ge=1, le=60),
):
    amenity_list = [a.strip() for a in (amenities or "").split(",") if a.strip()]
    return search_properties(
        db,
        category=category,
        county=county,
        county_id=county_id,
        town=town,
        town_id=town_id,
        neighbourhood=neighbourhood,
        neighbourhood_id=neighbourhood_id,
        landmark=landmark,
        min_rent=min_rent,
        max_rent=max_rent,
        property_type=property_type,
        furnishing=furnishing,
        verified=verified,
        recently_confirmed_days=recently_confirmed_days,
        amenities=amenity_list,
        bedrooms_min=bedrooms_min,
        bedrooms_max=bedrooms_max,
        bathrooms_min=bathrooms_min,
        parking_min=parking_min,
        business_use=business_use,
        floor_area_min=floor_area_min,
        floor_area_max=floor_area_max,
        frontage_min=frontage_min,
        loading_access=loading_access,
        lease_duration_min=lease_duration_min,
        q=q,
        featured=featured,
        north=north,
        south=south,
        east=east,
        west=west,
        latitude=latitude,
        longitude=longitude,
        radius_km=radius_km,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.get("/mine")
def my_properties(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_CREATE)),
):
    props = db.execute(
        property_service.base_property_query()
        .where(
            Property.deleted_at.is_(None),
            (
                (Property.owner_id == user.id)
                | (Property.manager_id == user.id)
                | (Property.created_by_id == user.id)
            ),
        )
        .order_by(Property.created_at.desc())
    ).scalars().unique().all()
    items = [property_internal_summary(p) for p in props]
    pending = len([p for p in props if p.status == PropertyStatus.PENDING.value])
    available = len([p for p in props if p.status == PropertyStatus.APPROVED.value and p.availability_status == "available"])
    unconfirmed = len([p for p in props if p.availability_status == AvailabilityStatus.UNCONFIRMED.value])
    views = sum(p.views_count for p in props)
    contacts = sum(p.contact_count for p in props)
    return {
        "properties": items,
        "overview": {
            "total": len(props),
            "active": len([p for p in props if p.status == PropertyStatus.APPROVED.value]),
            "pending": pending,
            "available": available,
            "unconfirmed": unconfirmed,
            "views": views,
            "contact_requests": contacts,
        },
    }


@router.post("", status_code=201)
def create_property(
    payload: PropertyCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_CREATE)),
):
    prop, duplicates = property_service.create_property(db, payload, user)
    return {
        "property": property_internal_summary(prop),
        "duplicate_warnings": duplicates,
        "message": "Property submitted for moderation. It will become public only after approval and a fresh availability confirmation.",
    }


@router.get("/{property_id}")
def get_property(
    property_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    prop = load_property(db, property_id)
    can_manage = bool(user and can_manage_property(db, prop, user))
    staff = _is_staff(user)
    if not (can_manage or staff) and not property_service.is_publicly_visible(prop):
        raise NotFound("Property not found.")
    if property_service.is_publicly_visible(prop) and not (can_manage or staff):
        prop.views_count += 1
        db.commit()
    detail = property_detail(prop)
    if can_manage or staff:
        detail["management"] = {
            "owner_id": prop.owner_id,
            "created_by_id": prop.created_by_id,
            "manager_id": prop.manager_id,
            "status": prop.status,
            "rejection_reason": prop.rejection_reason,
            "suspension_reason": prop.suspension_reason,
            "recorded_owner_name": prop.recorded_owner_name,
            "recorded_owner_phone": prop.recorded_owner_phone,
            "is_fresh": property_summary(prop)["is_fresh"],
            "availability_stored": prop.availability_status,
        }
    return {"property": detail, "similar": property_service.similar_properties(db, prop)}


@router.patch("/{property_id}")
def update_property(
    property_id: uuid.UUID,
    payload: PropertyUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_UPDATE)),
):
    prop = load_property(db, property_id)
    updated = property_service.update_property(db, prop, payload, user)
    return {
        "property": property_internal_summary(updated),
        "message": "Property updated. Material changes return the listing to moderation.",
    }


@router.delete("/{property_id}", status_code=204)
def delete_property(
    property_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_UPDATE)),
):
    prop = load_property(db, property_id)
    property_service.archive_property(db, prop, user)
    return None


@router.post("/{property_id}/moderate")
def moderate_property(
    property_id: uuid.UUID,
    payload: ModerationIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_MODERATE)),
):
    prop = load_property(db, property_id)
    updated = property_service.moderate_property(
        db, prop, payload.action, payload.reason, user, request
    )
    return {"property": property_internal_summary(updated), "message": f"Listing {payload.action}d."}


# ── Media ────────────────────────────────────────────────────────────────────


@router.get("/{property_id}/media")
def list_media(
    property_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    prop = load_property(db, property_id)
    if not (property_service.is_publicly_visible(prop) or (user and (can_manage_property(db, prop, user) or _is_staff(user)))):
        raise NotFound("Property not found.")
    return {"media": property_detail(prop)["media"]}


@router.post("/{property_id}/media", status_code=201)
async def upload_media(
    property_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    caption: str | None = Form(default=None),
    confirm_photo_consent: bool = Form(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_CREATE)),
):
    prop = load_property(db, property_id)
    assert_can_manage(db, prop, user)
    if not confirm_photo_consent:
        raise ValidationError(
            "Confirm that you have permission from the property owner or authorized representative to publish these photos."
        )
    if not files:
        raise ValidationError("Select at least one photo or video.")
    if len(files) > 12:
        raise ValidationError("Upload up to 12 files at a time.")
    existing_primary = any(m.is_primary for m in prop.media)
    created: list[PropertyMedia] = []
    for index, file in enumerate(files):
        saved = await save_upload(file)
        media = PropertyMedia(
            property_id=prop.id,
            kind=saved["kind"],
            url=saved["url"],
            storage_key=saved["storage_key"],
            caption=caption,
            mime_type=saved["mime_type"],
            size_bytes=saved["size_bytes"],
            width=saved.get("width"),
            height=saved.get("height"),
            is_primary=(not existing_primary and index == 0 and saved["kind"] == "image"),
            sort_order=len(prop.media) + index,
            perceptual_hash=saved.get("perceptual_hash"),
            consent_confirmed=True,
            uploaded_by_id=user.id,
        )
        db.add(media)
        created.append(media)
    write_audit(
        db,
        actor=user,
        action="property.media_uploaded",
        resource_type="property",
        resource_id=prop.id,
        after={"count": len(created)},
    )
    db.commit()
    return {
        "media": [
            {
                "id": m.id,
                "kind": m.kind,
                "url": m.url,
                "caption": m.caption,
                "is_primary": m.is_primary,
                "sort_order": m.sort_order,
            }
            for m in created
        ],
        "message": "Media uploaded.",
    }


@router.delete("/{property_id}/media/{media_id}", status_code=204)
def delete_media(
    property_id: uuid.UUID,
    media_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_UPDATE)),
):
    prop = load_property(db, property_id)
    assert_can_manage(db, prop, user)
    media = db.get(PropertyMedia, media_id)
    if media is None or media.property_id != prop.id:
        raise NotFound("Media not found.")
    delete_local(media.storage_key)
    db.delete(media)
    write_audit(
        db,
        actor=user,
        action="property.media_deleted",
        resource_type="media",
        resource_id=media_id,
    )
    db.commit()
    return None


# ── Availability ─────────────────────────────────────────────────────────────


@router.patch("/{property_id}/availability")
def update_availability(
    property_id: uuid.UUID,
    payload: AvailabilityIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.AVAILABILITY_MANAGE)),
):
    prop = load_property(db, property_id)
    updated = property_service.update_availability(db, prop, payload.status, payload.notes, user)
    return {
        "property": property_internal_summary(updated),
        "message": "Availability updated.",
    }


@router.post("/{property_id}/confirm-availability")
def confirm_availability(
    property_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.AVAILABILITY_MANAGE)),
):
    prop = load_property(db, property_id)
    updated = property_service.update_availability(
        db,
        prop,
        AvailabilityStatus.AVAILABLE.value,
        "Availability reconfirmed by landlord/manager.",
        user,
    )
    return {
        "property": property_internal_summary(updated),
        "message": "Availability confirmed. The freshness clock has restarted.",
    }


@router.get("/{property_id}/availability-history")
def availability_history(
    property_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    prop = load_property(db, property_id)
    manager = bool(user and can_manage_property(db, prop, user))
    if not (property_service.is_publicly_visible(prop) or manager or _is_staff(user)):
        raise NotFound("Property not found.")
    return {
        "history": [
            {
                "status": item.status,
                "confirmed_at": item.confirmed_at,
                "source": item.source,
                "notes": item.notes if manager else None,
                "next_recheck_at": item.next_recheck_at if manager else None,
                "created_at": item.created_at,
            }
            for item in prop.availability_history
        ]
    }


# ── Verification ─────────────────────────────────────────────────────────────


@router.post("/{property_id}/verification-requests", status_code=201)
def request_verification(
    property_id: uuid.UUID,
    payload: VerificationRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.VERIFICATION_SUBMIT)),
):
    prop = load_property(db, property_id)
    record = property_service.request_verification(db, prop, payload, user)
    return {
        "verification": {
            "id": record.id,
            "type": record.verification_type,
            "status": record.status,
            "created_at": record.created_at,
        },
        "message": "Verification request submitted. A verification officer will review it independently.",
    }


@router.get("/{property_id}/verification")
def get_verification(
    property_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    prop = load_property(db, property_id)
    if not (
        property_service.is_publicly_visible(prop)
        or _is_staff(user)
        or (user and can_manage_property(db, prop, user))
    ):
        raise NotFound("Property not found.")
    return property_service.get_verification_records(db, prop, user)


# ── Reports / enquiries / inspections ────────────────────────────────────────


@router.post("/{property_id}/reports", status_code=201)
def report_property(
    property_id: uuid.UUID,
    payload: ReportIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    report_limiter.hit(f"{_client(request)}:{property_id}")
    prop = load_property(db, property_id)
    if prop.status not in {PropertyStatus.APPROVED.value, PropertyStatus.SUSPENDED.value}:
        raise NotFound("Property not found.")
    report = property_service.create_report(db, prop, payload, user, request)
    return {
        "report": report_payload(report),
        "message": "Thank you. Our moderation team will review this report.",
    }


@router.post("/{property_id}/enquiries", status_code=201)
def create_enquiry(
    property_id: uuid.UUID,
    payload: EnquiryCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    enquiry_limiter.hit(f"{_client(request)}:{payload.phone}")
    prop = load_property(db, property_id)
    enquiry = property_service.create_enquiry(db, prop, payload, user)
    return {
        "enquiry": {
            "id": enquiry.id,
            "status": enquiry.status,
            "created_at": enquiry.created_at,
        },
        "message": "Your enquiry has been sent. Never send money before viewing a property and confirming the recipient's authority.",
    }


@router.post("/{property_id}/inspections", status_code=201)
def add_inspection(
    property_id: uuid.UUID,
    payload: InspectionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_VERIFY)),
):
    prop = load_property(db, property_id)
    inspection = property_service.add_inspection(db, prop, payload, user)
    return {
        "inspection": {
            "id": inspection.id,
            "inspection_date": inspection.inspection_date,
            "status": inspection.status,
        },
        "message": "Inspection recorded. It will appear on the Property Passport as a field inspection.",
    }


# ── Enquiries management ─────────────────────────────────────────────────────


@enquiry_router.get("")
def list_enquiries(
    role: str = Query(default="all", pattern="^(all|sent|received)$"),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_permission(P.ENQUIRY_MANAGE, P.ASSISTED_REQUEST)),
):
    rows = property_service.list_enquiries(db, user, role)
    from app.services.serializers import enquiry_payload

    return {"enquiries": [enquiry_payload(e) for e in rows]}


@enquiry_router.patch("/{enquiry_id}")
def respond_enquiry(
    enquiry_id: uuid.UUID,
    payload: EnquiryRespondIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.ENQUIRY_MANAGE)),
):
    from app.services.serializers import enquiry_payload

    enquiry = db.get(PropertyEnquiry, enquiry_id)
    if enquiry is None:
        raise NotFound("Enquiry not found.")
    updated = property_service.respond_enquiry(db, enquiry, payload, user)
    return {"enquiry": enquiry_payload(updated), "message": "Response sent."}


# ── Verification review (staff) ──────────────────────────────────────────────


@verification_router.get("/queue")
def verification_queue(
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_VERIFY)),
):
    records = db.execute(
        select(VerificationRecord)
        .options(selectinload(VerificationRecord.evidence))
        .where(VerificationRecord.status == "pending")
        .order_by(VerificationRecord.created_at.asc())
        .limit(100)
    ).scalars().all()
    results = []
    for record in records:
        prop = db.get(Property, record.property_id) if record.property_id else None
        results.append(
            {
                "id": record.id,
                "property_id": record.property_id,
                "property_reference": prop.reference if prop else None,
                "property_title": prop.title if prop else None,
                "type": record.verification_type,
                "status": record.status,
                "notes": record.notes,
                "evidence_reference": record.evidence_reference,
                "evidence": [
                    {"id": e.id, "kind": e.kind, "description": e.description}
                    for e in record.evidence
                ],
                "requested_by_id": record.requested_by_id,
                "created_at": record.created_at,
            }
        )
    return {"queue": results, "count": len(results)}


@verification_router.post("/{verification_id}/review")
def review_verification(
    verification_id: uuid.UUID,
    payload: VerificationReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.PROPERTY_VERIFY)),
):
    record = db.get(VerificationRecord, verification_id)
    if record is None:
        raise NotFound("Verification record not found.")
    updated = property_service.review_verification(db, record, payload, user)
    return {
        "verification": {
            "id": updated.id,
            "type": updated.verification_type,
            "status": updated.status,
            "verified_at": updated.verified_at,
            "expires_at": updated.expires_at,
        },
        "message": "Verification review recorded.",
    }
