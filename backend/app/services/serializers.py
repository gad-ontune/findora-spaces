from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from app.core.config import settings
from app.models import (
    Complaint,
    FieldReport,
    Notification,
    PartnerAssignment,
    PartnerProfile,
    Payment,
    Property,
    PropertyEnquiry,
    PropertyReport,
    RequestMatch,
    SearchRequest,
    SharedShortlist,
    User,
    Viewing,
)
from app.models.base import VerificationType


def money(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def json_load(value: str | None, fallback: Any = None) -> Any:
    if not value:
        return fallback if fallback is not None else []
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback if fallback is not None else []


def utcnow() -> datetime:
    return datetime.now(UTC)


def ensure_aware(dt: datetime | None) -> datetime | None:
    if dt and dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def freshness_days(prop: Property) -> int:
    return prop.freshness_days or settings.default_freshness_days


def is_fresh(prop: Property) -> bool:
    confirmed = ensure_aware(prop.last_confirmed_available_at)
    if not confirmed:
        return False
    age = utcnow() - confirmed
    return age.total_seconds() <= freshness_days(prop) * 86400


def day_age(dt: datetime | None) -> int | None:
    aware = ensure_aware(dt)
    if not aware:
        return None
    return max(0, (utcnow() - aware).days)


def effective_availability(prop: Property) -> str:
    if prop.availability_status == "available":
        return "available" if is_fresh(prop) else "unconfirmed"
    return prop.availability_status


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return round(2 * radius * math.asin(math.sqrt(a)), 2)


def _display_name(name: str | None) -> str:
    if not name:
        return "Findora representative"
    parts = name.strip().split()
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0].upper()}."


def _mask_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) < 6:
        return phone
    return f"+{digits[:-6]} *** {digits[-3:]}"


VERIFICATION_LABELS = {
    VerificationType.PHONE: "Phone number",
    VerificationType.IDENTITY: "Identity",
    VerificationType.OWNERSHIP: "Ownership",
    VerificationType.AUTHORITY: "Authority to list",
    VerificationType.INSPECTION: "Physical inspection",
    VerificationType.AVAILABILITY: "Availability",
    VerificationType.RENT: "Rent confirmation",
    VerificationType.DETAILS: "Property details",
}

VERIFICATION_ORDER = [
    VerificationType.PHONE,
    VerificationType.IDENTITY,
    VerificationType.OWNERSHIP,
    VerificationType.AUTHORITY,
    VerificationType.INSPECTION,
    VerificationType.AVAILABILITY,
    VerificationType.RENT,
    VerificationType.DETAILS,
]


def verification_checks(prop: Property) -> list[dict[str, Any]]:
    latest: dict[str, Any] = {}
    for record in sorted(prop.verifications, key=lambda r: r.created_at or datetime.min.replace(tzinfo=UTC)):
        latest[record.verification_type] = record
    checks: list[dict[str, Any]] = []
    for vtype in VERIFICATION_ORDER:
        vtype_value = str(vtype.value)
        record = latest.get(vtype_value)
        if record is None:
            status = "not_started"
            verified_at = None
            expires_at = None
            evidence_count = 0
            notes = "Not yet verified by Findora"
        else:
            status = record.status
            verified_at = record.verified_at
            expires_at = record.expires_at
            evidence_count = len(record.evidence)
            if status == "verified":
                notes = "Verified by Findora"
            elif status == "pending":
                notes = "Verification is being reviewed"
            elif status == "failed":
                notes = "Verification could not be completed"
            elif status == "expired":
                notes = "Verification has expired"
            else:
                notes = "Not yet verified by Findora"
        checks.append(
            {
                "type": vtype_value,
                "label": VERIFICATION_LABELS[vtype],
                "status": status,
                "verified_at": verified_at,
                "expires_at": expires_at,
                "evidence_count": evidence_count,
                "notes": notes,
            }
        )
    return checks


def verification_summary(checks: list[dict[str, Any]]) -> dict[str, Any]:
    verified = [c for c in checks if c["status"] == "verified"]
    pending = [c for c in checks if c["status"] == "pending"]
    if len(verified) >= 6:
        level = "strong"
    elif len(verified) >= 3:
        level = "moderate"
    elif len(verified) >= 1:
        level = "basic"
    else:
        level = "none"
    return {
        "level": level,
        "verified_count": len(verified),
        "pending_count": len(pending),
        "total_checks": len(checks),
        "verified_types": [c["type"] for c in verified],
        "summary": {
            "strong": "Multiple independent checks completed",
            "moderate": "Some checks completed — review each item",
            "basic": "Limited checks completed",
            "none": "No verification checks completed",
        }[level],
        "disclaimer": "Verification reduces risk but does not guarantee a property is available or safe. Confirm details and never pay before viewing.",
    }


def amenity_list(prop: Property) -> list[dict[str, Any]]:
    return [
        {
            "id": pa.amenity_id,
            "name": pa.amenity.name,
            "slug": pa.amenity.slug,
            "category": pa.amenity.category,
            "icon": pa.amenity.icon,
            "details": pa.details,
        }
        for pa in prop.amenities
        if pa.amenity is not None
    ]


def media_list(prop: Property) -> list[dict[str, Any]]:
    return [
        {
            "id": m.id,
            "kind": m.kind,
            "url": m.url,
            "caption": m.caption,
            "is_primary": m.is_primary,
            "sort_order": m.sort_order,
            "width": m.width,
            "height": m.height,
            "mime_type": m.mime_type,
        }
        for m in sorted(prop.media, key=lambda x: (not x.is_primary, x.sort_order, x.created_at))
    ]


def move_in_cost(prop: Property) -> dict[str, Any]:
    terms = prop.rental_terms
    if not terms:
        return {
            "currency": "KES",
            "line_items": [],
            "recurring_total": 0,
            "one_time_total": 0,
            "initial_total": 0,
            "disclosed": False,
            "note": "Rental terms have not been provided.",
        }
    items: list[dict[str, Any]] = []

    def add(label: str, amount: Decimal | None, kind: str, mandatory: bool = True, source: str = "landlord"):
        if amount is None:
            return
        items.append(
            {
                "label": label,
                "amount": money(amount),
                "kind": kind,
                "mandatory": mandatory,
                "source": source,
                "estimate": False,
            }
        )

    add("First month's rent", terms.rent_amount, "recurring")
    add("Security deposit", terms.deposit_amount, "one_time")
    add("Agency fee", terms.agency_fee, "one_time")
    add("Findora service fee", terms.service_fee, "one_time")
    add("Utility connection", terms.utility_connection_fee, "one_time")
    add("Other mandatory charge", terms.other_mandatory_fee, "one_time")
    for charge in json_load(terms.other_charges, []):
        if isinstance(charge, dict) and charge.get("amount") is not None:
            add(
                charge.get("label") or "Disclosed charge",
                Decimal(str(charge["amount"])),
                "recurring" if charge.get("recurring") else "one_time",
                bool(charge.get("mandatory", True)),
                "landlord",
            )
    recurring = sum(i["amount"] or 0 for i in items if i["kind"] == "recurring")
    one_time = sum(i["amount"] or 0 for i in items if i["kind"] == "one_time")
    return {
        "currency": terms.currency,
        "rent_period": terms.rent_period,
        "line_items": items,
        "recurring_total": round(recurring, 2),
        "one_time_total": round(one_time, 2),
        "initial_total": round(recurring + one_time, 2),
        "disclosed": True,
        "utilities_included": terms.utilities_included,
        "note": "Only charges disclosed by the landlord are included. Amounts are not estimates. Confirm every payment before transferring money and never pay before viewing.",
    }


def location_payload(prop: Property) -> dict[str, Any] | None:
    loc = prop.location
    if not loc:
        return None
    town = loc.town
    neighbourhood = loc.neighbourhood
    landmark = loc.landmark
    locality = loc.locality
    county = town.sub_county.county if town and town.sub_county else None
    sub_county = town.sub_county if town else None
    distance = None
    if (
        landmark
        and landmark.latitude is not None
        and landmark.longitude is not None
        and loc.latitude_public is not None
        and loc.longitude_public is not None
    ):
        distance = haversine_km(
            float(loc.latitude_public),
            float(loc.longitude_public),
            float(landmark.latitude),
            float(landmark.longitude),
        )
    return {
        "town_id": loc.town_id,
        "town": town.name if town else None,
        "town_slug": town.slug if town else None,
        "county": county.name if county else None,
        "county_slug": county.slug if county else None,
        "sub_county": sub_county.name if sub_county else None,
        "neighbourhood_id": loc.neighbourhood_id,
        "neighbourhood": neighbourhood.name if neighbourhood else None,
        "neighbourhood_slug": neighbourhood.slug if neighbourhood else None,
        "locality": locality.name if locality else None,
        "landmark_id": loc.landmark_id,
        "landmark": landmark.name if landmark else None,
        "address_line": loc.address_line,
        "directions": loc.directions,
        "latitude": money(loc.latitude_public),
        "longitude": money(loc.longitude_public),
        "precision": loc.precision,
        "distance_to_landmark_km": distance,
        "map_note": "Location is approximate to protect the property and its occupants." if loc.precision != "exact" else None,
    }


def property_summary(prop: Property) -> dict[str, Any]:
    checks = verification_checks(prop)
    detail = prop.residential_detail
    commercial = prop.commercial_detail
    primary = next((m for m in media_list(prop) if m["is_primary"]), None)
    if primary is None:
        all_media = media_list(prop)
        primary = all_media[0] if all_media else None
    return {
        "id": prop.id,
        "reference": prop.reference,
        "title": prop.title,
        "category": prop.category,
        "property_type": prop.property_type,
        "status": prop.status,
        "availability_status": effective_availability(prop),
        "stored_availability_status": prop.availability_status,
        "is_fresh": is_fresh(prop),
        "last_confirmed_available_at": prop.last_confirmed_available_at,
        "freshness_days": freshness_days(prop),
        "is_featured": bool(prop.is_featured and (prop.featured_until is None or ensure_aware(prop.featured_until) > utcnow())),
        "rent_amount": money(prop.rental_terms.rent_amount if prop.rental_terms else None),
        "deposit_amount": money(prop.rental_terms.deposit_amount if prop.rental_terms else None),
        "currency": prop.rental_terms.currency if prop.rental_terms else "KES",
        "rent_period": prop.rental_terms.rent_period if prop.rental_terms else "monthly",
        "bedrooms": detail.bedrooms if detail else None,
        "bathrooms": detail.bathrooms if detail else None,
        "furnishing": detail.furnishing if detail else None,
        "floor_area_sqm": money(commercial.floor_area_sqm) if commercial else None,
        "frontage_m": money(commercial.frontage_m) if commercial else None,
        "location": location_payload(prop),
        "primary_image": primary,
        "media_count": len(prop.media),
        "amenities": amenity_list(prop)[:8],
        "commercial_uses": [
            {"id": pc.commercial_use_id, "name": pc.commercial_use.name}
            for pc in prop.commercial_uses
            if pc.commercial_use
        ],
        "verification": {
            "level": verification_summary(checks)["level"],
            "verified_count": verification_summary(checks)["verified_count"],
            "checks": checks,
        },
        "move_in_cost": move_in_cost(prop),
        "created_at": prop.created_at,
        "published_at": prop.published_at,
        "views_count": prop.views_count,
    }


def terms_payload(prop: Property) -> dict[str, Any] | None:
    terms = prop.rental_terms
    if not terms:
        return None
    return {
        "currency": terms.currency,
        "rent_amount": money(terms.rent_amount),
        "deposit_amount": money(terms.deposit_amount),
        "rent_period": terms.rent_period,
        "agency_fee": money(terms.agency_fee),
        "service_fee": money(terms.service_fee),
        "utility_connection_fee": money(terms.utility_connection_fee),
        "other_mandatory_fee": money(terms.other_mandatory_fee),
        "other_charges": json_load(terms.other_charges, []),
        "utilities_included": terms.utilities_included,
        "negotiable": terms.negotiable,
        "available_from": terms.available_from,
        "minimum_lease_months": terms.minimum_lease_months,
        "payment_schedule": terms.payment_schedule,
    }


def residential_payload(prop: Property) -> dict[str, Any] | None:
    d = prop.residential_detail
    if not d:
        return None
    return {
        "bedrooms": d.bedrooms,
        "bathrooms": d.bathrooms,
        "house_style": d.house_style,
        "furnishing": d.furnishing,
        "floor_number": d.floor_number,
        "has_private_bathroom": d.has_private_bathroom,
        "parking_spaces": d.parking_spaces,
        "outdoor_space": d.outdoor_space,
        "security_features": json_load(d.security_features, []),
        "water_source": d.water_source,
        "electricity_supply": d.electricity_supply,
        "shared_accommodation": d.shared_accommodation,
    }


def commercial_payload(prop: Property) -> dict[str, Any] | None:
    d = prop.commercial_detail
    if not d:
        return None
    return {
        "floor_area_sqm": money(d.floor_area_sqm),
        "frontage_m": money(d.frontage_m),
        "floor_level": d.floor_level,
        "power_capacity_kva": money(d.power_capacity_kva),
        "parking_spaces": d.parking_spaces,
        "accessibility": d.accessibility,
        "loading_access": d.loading_access,
        "visibility": d.visibility,
        "road_access": d.road_access,
        "lease_duration_months": d.lease_duration_months,
        "zoning_note": d.zoning_note,
        "permitted_use_verified": d.permitted_use_verified,
        "disclaimer": "Findora does not confirm that premises are licensed or zoned for your business. Confirm permitted use, licences and zoning with the relevant authorities.",
    }


def property_detail(prop: Property) -> dict[str, Any]:
    summary = property_summary(prop)
    checks = verification_checks(prop)
    owner = prop.owner
    manager = prop.manager
    public_history = [
        {
            "type": event.event_type,
            "summary": event.summary,
            "created_at": event.created_at,
        }
        for event in prop.history
        if event.visibility == "public"
    ][:10]
    availability_history = [
        {
            "status": item.status,
            "confirmed_at": item.confirmed_at,
            "source": item.source,
        }
        for item in prop.availability_history
        if item.confirmed_at is not None
    ][:6]
    inspections = [
        {
            "id": i.id,
            "inspection_date": i.inspection_date,
            "exterior_condition": i.exterior_condition,
            "interior_condition": i.interior_condition,
            "water_facilities": i.water_facilities,
            "electricity": i.electricity,
            "doors_windows": i.doors_windows,
            "plumbing": i.plumbing,
            "access": i.access,
            "outstanding_concerns": i.outstanding_concerns,
            "status": i.status,
        }
        for i in prop.inspections
        if i.status in {"submitted", "reviewed", "passed"}
    ][:3]
    summary.update(
        {
            "description": prop.description,
            "terms": terms_payload(prop),
            "residential": residential_payload(prop),
            "commercial": commercial_payload(prop),
            "media": media_list(prop),
            "amenities": amenity_list(prop),
            "contact": {
                "name": _display_name(owner.name if owner else None),
                "role": "Landlord" if owner else "Authorized representative",
                "phone_masked": _mask_phone(owner.phone if owner else None),
                "phone_verified": bool(owner and owner.phone_verified_at),
                "member_since": owner.created_at if owner else None,
                "manager_name": _display_name(manager.name) if manager else None,
                "contact_note": "Send an enquiry or viewing request. Findora shares contact details only with authorised parties.",
            },
            "verification": {
                **verification_summary(checks),
                "checks": checks,
            },
            "history": public_history,
            "availability_history": availability_history,
            "inspections": inspections,
            "inspection_note": "An inspection records what a field officer could observe on the inspection date. It is not a structural survey or a guarantee.",
            "report_count": len([r for r in prop.reports if r.status in {"open", "reviewing"}]),
            "last_updated_at": prop.updated_at,
            "detail_confidence": "Landlord-provided details; independently verified items are marked.",
        }
    )
    return summary


def user_payload(user: User, *, self_view: bool = False) -> dict[str, Any]:
    permissions = sorted(
        {perm.code for role in user.roles for perm in role.permissions}
    )
    profile = user.profile
    return {
        "id": user.id,
        "name": user.name,
        "phone": user.phone if self_view else _mask_phone(user.phone),
        "email": user.email if self_view else None,
        "status": user.status,
        "roles": user.role_codes,
        "permissions": permissions,
        "phone_verified": bool(user.phone_verified_at),
        "phone_verified_at": user.phone_verified_at,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at,
        "profile": {
            "bio": profile.bio if profile else None,
            "preferred_contact": profile.preferred_contact if profile else "phone",
            "whatsapp": profile.whatsapp if profile else None,
            "locale": profile.locale if profile else "en",
            "town_id": profile.town_id if profile else None,
            "marketing_consent": profile.marketing_consent if profile else False,
        },
        "permissions_loaded": True,
    }


def enquiry_payload(enq: PropertyEnquiry) -> dict[str, Any]:
    return {
        "id": enq.id,
        "property_id": enq.property_id,
        "property": property_summary(enq.property) if enq.property else None,
        "seeker_id": enq.seeker_id,
        "name": enq.name,
        "phone": _mask_phone(enq.phone),
        "email": enq.email,
        "message": enq.message,
        "type": enq.enquiry_type,
        "status": enq.status,
        "response": enq.response,
        "created_at": enq.created_at,
        "responded_at": enq.responded_at,
    }


def search_request_payload(request: SearchRequest) -> dict[str, Any]:
    return {
        "id": request.id,
        "reference": request.reference,
        "status": request.status,
        "category": request.category,
        "town": request.town.name if request.town else None,
        "town_id": request.town_id,
        "neighbourhood": request.neighbourhood.name if request.neighbourhood else None,
        "landmark": request.landmark.name if request.landmark else None,
        "budget_min": money(request.budget_min),
        "budget_max": money(request.budget_max),
        "property_type": request.property_type,
        "bedrooms_min": request.bedrooms_min,
        "floor_area_min": money(request.floor_area_min),
        "floor_area_max": money(request.floor_area_max),
        "frontage_min": money(request.frontage_min),
        "loading_required": request.loading_required,
        "parking_required": request.parking_required,
        "facilities": json_load(request.facilities, []),
        "move_in_date": request.move_in_date,
        "business_type": request.business_type,
        "requirements": request.requirements,
        "assistance_requirements": request.assistance_requirements,
        "contact_method": request.contact_method,
        "priority": request.priority,
        "assigned_support": _display_name(request.assigned_support.name) if request.assigned_support else None,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
        "completed_at": request.completed_at,
        "cancellation_reason": request.cancellation_reason,
        "match_count": len([m for m in request.matches if m.status in {"sent", "accepted", "suggested"}]),
        "assignment_count": len(request.assignments),
        "status_history": [
            {
                "from": h.from_status,
                "to": h.to_status,
                "notes": h.notes,
                "created_at": h.created_at,
            }
            for h in sorted(request.status_history, key=lambda x: x.created_at)
        ],
        "messages": [
            {
                "id": m.id,
                "sender_name": m.sender_name,
                "body": m.body,
                "is_internal": m.is_internal,
                "created_at": m.created_at,
            }
            for m in request.messages
            if not m.is_internal
        ],
    }


def match_payload(match: RequestMatch) -> dict[str, Any]:
    return {
        "id": match.id,
        "source": match.stage,
        "status": match.status,
        "score": float(match.score) if match.score is not None else None,
        "title": match.title,
        "description": match.description,
        "rent_amount": money(match.rent_amount),
        "location_text": match.location_text,
        "explanation": json_load(match.explanation, {}),
        "property": property_summary(match.property) if match.property else None,
        "created_at": match.created_at,
    }


def assignment_payload(assignment: PartnerAssignment) -> dict[str, Any]:
    request = assignment.request
    return {
        "id": assignment.id,
        "reference": assignment.reference,
        "status": assignment.status,
        "partner_id": assignment.partner_id,
        "partner_name": _display_name(assignment.partner.user.name) if assignment.partner and assignment.partner.user else None,
        "instructions": assignment.instructions,
        "due_at": assignment.due_at,
        "accepted_at": assignment.accepted_at,
        "completed_at": assignment.completed_at,
        "declined_reason": assignment.declined_reason,
        "created_at": assignment.created_at,
        "request": {
            "id": request.id,
            "reference": request.reference,
            "category": request.category,
            "status": request.status,
            "town": request.town.name if request.town else None,
            "neighbourhood": request.neighbourhood.name if request.neighbourhood else None,
            "budget_min": money(request.budget_min),
            "budget_max": money(request.budget_max),
            "property_type": request.property_type,
            "requirements": request.requirements,
            "contact_method": request.contact_method,
            "guest_phone": _mask_phone(request.guest_phone),
            "guest_name": request.guest_name,
        },
        "reports": [field_report_payload(r) for r in assignment.reports],
    }


def field_report_payload(report: FieldReport) -> dict[str, Any]:
    return {
        "id": report.id,
        "report_type": report.report_type,
        "summary": report.summary,
        "findings": json_load(report.findings, {}),
        "contact_name": report.contact_name,
        "contact_phone": _mask_phone(report.contact_phone),
        "property_found": report.property_found,
        "photos": json_load(report.photos, []),
        "status": report.status,
        "submitted_at": report.submitted_at,
        "review_notes": report.review_notes,
        "reviewed_at": report.reviewed_at,
    }


def viewing_payload(viewing: Viewing) -> dict[str, Any]:
    return {
        "id": viewing.id,
        "reference": viewing.reference,
        "status": viewing.status,
        "property": property_summary(viewing.property) if viewing.property else None,
        "seeker_name": viewing.seeker_name,
        "seeker_phone": _mask_phone(viewing.seeker_phone),
        "preferred_date": viewing.preferred_date,
        "scheduled_at": viewing.scheduled_at,
        "meeting_point": viewing.meeting_point,
        "notes": viewing.notes,
        "cancellation_reason": viewing.cancellation_reason,
        "created_at": viewing.created_at,
        "completed_at": viewing.completed_at,
        "feedback": [
            {
                "matched_photos": f.matched_photos,
                "matched_description": f.matched_description,
                "rent_matched": f.rent_matched,
                "property_available": f.property_available,
                "representative_reachable": f.representative_reachable,
                "suspected_fraud": f.suspected_fraud,
                "rating": f.rating,
                "comments": f.comments,
                "created_at": f.created_at,
            }
            for f in viewing.feedback
        ],
        "status_history": [
            {"from": h.from_status, "to": h.to_status, "notes": h.notes, "created_at": h.created_at}
            for h in sorted(viewing.status_history, key=lambda x: x.created_at)
        ],
    }


def payment_payload(payment: Payment) -> dict[str, Any]:
    return {
        "id": payment.id,
        "reference": payment.reference,
        "purpose": payment.purpose,
        "related_type": payment.related_type,
        "related_id": payment.related_id,
        "amount": money(payment.amount),
        "currency": payment.currency,
        "status": payment.status,
        "provider": payment.provider,
        "provider_reference": payment.provider_reference,
        "phone": _mask_phone(payment.phone),
        "description": payment.description,
        "failure_reason": payment.failure_reason,
        "created_at": payment.created_at,
        "completed_at": payment.completed_at,
    }


def notification_payload(note: Notification) -> dict[str, Any]:
    return {
        "id": note.id,
        "type": note.notification_type,
        "title": note.title,
        "body": note.body,
        "data": json_load(note.data, {}),
        "channels": note.channels.split(","),
        "read": note.read_at is not None,
        "read_at": note.read_at,
        "created_at": note.created_at,
    }


def report_payload(report: PropertyReport) -> dict[str, Any]:
    return {
        "id": report.id,
        "property_id": report.property_id,
        "property_reference": report.property.reference if report.property else None,
        "property_title": report.property.title if report.property else None,
        "reason": report.reason,
        "details": report.details,
        "status": report.status,
        "resolution": report.resolution,
        "reporter_phone": _mask_phone(report.reporter_phone),
        "created_at": report.created_at,
        "resolved_at": report.resolved_at,
    }


def complaint_payload(complaint: Complaint) -> dict[str, Any]:
    return {
        "id": complaint.id,
        "reference": complaint.reference,
        "category": complaint.category,
        "description": complaint.description,
        "status": complaint.status,
        "priority": complaint.priority,
        "resolution": complaint.resolution,
        "created_at": complaint.created_at,
        "resolved_at": complaint.resolved_at,
    }


def shortlist_payload(shortlist: SharedShortlist, include_comments: bool = True) -> dict[str, Any]:
    return {
        "id": shortlist.id,
        "token": shortlist.token if include_comments else None,
        "name": shortlist.name,
        "description": shortlist.description,
        "created_at": shortlist.created_at,
        "properties": [
            property_summary(member.property) if member.property else None
            for member in sorted(shortlist.members, key=lambda x: x.position)
        ],
        "comments": [
            {
                "id": c.id,
                "author_name": c.author_name,
                "body": c.body,
                "created_at": c.created_at,
            }
            for c in sorted(shortlist.comments, key=lambda x: x.created_at)
        ]
        if include_comments
        else [],
    }


def partner_payload(partner: PartnerProfile) -> dict[str, Any]:
    return {
        "id": partner.id,
        "user_id": partner.user_id,
        "name": partner.user.name if partner.user else None,
        "phone": _mask_phone(partner.user.phone) if partner.user else None,
        "company_name": partner.company_name,
        "partner_type": partner.partner_type,
        "status": partner.status,
        "rating": float(partner.rating) if partner.rating else None,
        "response_rate": float(partner.response_rate) if partner.response_rate else None,
        "completed_assignments": partner.completed_assignments,
        "accuracy_score": float(partner.accuracy_score) if partner.accuracy_score else None,
        "service_areas": [
            {"town_id": a.town_id, "neighbourhood_id": a.neighbourhood_id, "primary": a.is_primary}
            for a in partner.service_areas
        ],
        "created_at": partner.created_at,
    }
