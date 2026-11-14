from __future__ import annotations

import json
import secrets
import string
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import settings
from app.core.exceptions import Conflict, Forbidden, NotFound, UnprocessableState, ValidationError
from app.models import (
    Amenity,
    CommercialDetail,
    CommercialUse,
    Landmark,
    Locality,
    Neighbourhood,
    Property,
    PropertyAmenity,
    PropertyAvailability,
    PropertyCommercialUse,
    PropertyEnquiry,
    PropertyHistoryEvent,
    PropertyInspection,
    PropertyLocation,
    PropertyManager,
    PropertyMedia,
    PropertyOwner,
    PropertyReport,
    PropertyStatusHistory,
    RentalTerm,
    RentalUnit,
    ResidentialDetail,
    SubCounty,
    Town,
    User,
    VerificationEvidence,
    VerificationRecord,
)
from app.models.base import AvailabilityStatus, PropertyStatus, VerificationStatus, VerificationType
from app.schemas.payloads import (
    EnquiryCreateIn,
    EnquiryRespondIn,
    InspectionIn,
    PropertyCreateIn,
    PropertyUpdateIn,
    ReportIn,
    VerificationRequestIn,
    VerificationReviewIn,
)
from app.services import subscription_service
from app.services.audit import write_audit
from app.services.location_service import point_wkt
from app.services.notifications import create_notification
from app.services.serializers import (
    effective_availability,
    enquiry_payload,
    property_detail,
    property_summary,
    utcnow,
    verification_checks,
)


def base_property_query():
    return select(Property).options(
        joinedload(Property.owner),
        joinedload(Property.manager),
        joinedload(Property.location)
        .joinedload(PropertyLocation.town)
        .joinedload(Town.sub_county)
        .joinedload(SubCounty.county),
        joinedload(Property.location).joinedload(PropertyLocation.neighbourhood),
        joinedload(Property.location).joinedload(PropertyLocation.locality),
        joinedload(Property.location).joinedload(PropertyLocation.landmark),
        joinedload(Property.rental_terms),
        joinedload(Property.residential_detail),
        joinedload(Property.commercial_detail),
        selectinload(Property.media),
        selectinload(Property.amenities).joinedload(PropertyAmenity.amenity),
        selectinload(Property.commercial_uses).joinedload(PropertyCommercialUse.commercial_use),
        selectinload(Property.verifications).selectinload(VerificationRecord.evidence),
        selectinload(Property.history),
        selectinload(Property.availability_history),
        selectinload(Property.inspections),
        selectinload(Property.manager_links),
        selectinload(Property.reports),
    )


def load_property(db: Session, property_id: uuid.UUID | str, *, for_update: bool = False) -> Property:
    query = base_property_query().where(Property.id == property_id, Property.deleted_at.is_(None))
    if for_update:
        query = query.with_for_update()
    prop = db.execute(query).scalar_one_or_none()
    if prop is None:
        raise NotFound("Property not found.")
    return prop


def generate_reference(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(10):
        suffix = "".join(secrets.choice(alphabet) for _ in range(6))
        reference = f"FND-{suffix}"
        if not db.execute(select(Property.id).where(Property.reference == reference)).scalar_one_or_none():
            return reference
    raise Conflict("Could not allocate a property reference. Try again.")


def is_publicly_visible(prop: Property) -> bool:
    """A listing is public only when approved, genuinely available and fresh.

    Mirrors the SQL gate used by public search so direct links cannot expose
    occupied, unconfirmed or stale listings.
    """
    return (
        prop.status == PropertyStatus.APPROVED.value
        and effective_availability(prop) == AvailabilityStatus.AVAILABLE.value
    )


def can_manage_property(db: Session, prop: Property, user: User) -> bool:
    if "super_admin" in user.role_codes:
        return True
    if prop.owner_id == user.id or prop.manager_id == user.id:
        return True
    if prop.created_by_id == user.id and prop.status in {
        PropertyStatus.PENDING,
        PropertyStatus.REJECTED,
    }:
        return True
    active_manager = db.execute(
        select(PropertyManager).where(
            PropertyManager.property_id == prop.id,
            PropertyManager.user_id == user.id,
            PropertyManager.status == "active",
            or_(PropertyManager.expires_at.is_(None), PropertyManager.expires_at > utcnow()),
        )
    ).scalar_one_or_none()
    return active_manager is not None


def assert_can_manage(db: Session, prop: Property, user: User) -> None:
    if not can_manage_property(db, prop, user):
        raise Forbidden("You are not authorized to manage this property.")


def _resolve_town(db: Session, town_id: uuid.UUID) -> Town:
    town = db.get(Town, town_id)
    if town is None or not town.is_active:
        raise ValidationError("Select a valid town.")
    return town


def _validate_location_links(
    db: Session, town: Town, neighbourhood_id, landmark_id, locality_id
) -> tuple[Neighbourhood | None, Landmark | None, Locality | None]:
    neighbourhood = db.get(Neighbourhood, neighbourhood_id) if neighbourhood_id else None
    if neighbourhood_id and (neighbourhood is None or neighbourhood.town_id != town.id):
        raise ValidationError("The selected neighbourhood does not belong to this town.")
    landmark = db.get(Landmark, landmark_id) if landmark_id else None
    if landmark_id and (landmark is None or landmark.town_id != town.id):
        raise ValidationError("The selected landmark does not belong to this town.")
    locality = db.get(Locality, locality_id) if locality_id else None
    if locality_id and (locality is None or locality.town_id != town.id):
        raise ValidationError("The selected locality does not belong to this town.")
    return neighbourhood, landmark, locality


def _coordinates_for_public(payload, town: Town, neighbourhood: Neighbourhood | None):
    private_lat = payload.latitude if payload.latitude is not None else None
    private_lng = payload.longitude if payload.longitude is not None else None
    public_lat = payload.public_latitude
    public_lng = payload.public_longitude
    if public_lat is None or public_lng is None:
        if payload.precision == "exact" and private_lat is not None and private_lng is not None:
            public_lat, public_lng = private_lat, private_lng
        elif neighbourhood and neighbourhood.latitude is not None:
            public_lat, public_lng = float(neighbourhood.latitude), float(neighbourhood.longitude)
        elif town.latitude is not None:
            public_lat, public_lng = float(town.latitude), float(town.longitude)
        else:
            public_lat, public_lng = private_lat, private_lng
    if payload.precision != "exact" and private_lat is not None and public_lat is None:
        public_lat, public_lng = private_lat, private_lng
    return private_lat, private_lng, public_lat, public_lng


def _verify_phone_record(user: User) -> VerificationRecord | None:
    if not user.phone_verified_at:
        return None
    return VerificationRecord(
        user_id=user.id,
        verification_type=VerificationType.PHONE.value,
        status=VerificationStatus.VERIFIED.value,
        evidence_reference="user-phone-verification",
        verified_at=user.phone_verified_at,
        notes="Phone number confirmed with a one-time code.",
    )


def _add_history(
    db: Session,
    prop: Property,
    event_type: str,
    summary: str,
    *,
    actor: User | None = None,
    changes: dict | None = None,
    visibility: str = "public",
) -> None:
    db.add(
        PropertyHistoryEvent(
            property_id=prop.id,
            event_type=event_type,
            summary=summary,
            changes=json.dumps(changes, default=str) if changes else None,
            visibility=visibility,
            actor_id=actor.id if actor else None,
        )
    )


def detect_duplicates(db: Session, payload: PropertyCreateIn, user: User) -> list[dict]:
    town_id = uuid.UUID(payload.location.town_id)
    query = (
        select(Property)
        .options(joinedload(Property.location), joinedload(Property.rental_terms))
        .where(
            Property.deleted_at.is_(None),
            Property.location.has(PropertyLocation.town_id == town_id),
        )
    )
    candidates = db.execute(query.limit(200)).scalars().all()
    matches: list[dict] = []
    for candidate in candidates:
        score = 0
        reasons: list[str] = []
        if candidate.title.lower().strip() == payload.title.lower().strip():
            score += 40
            reasons.append("same title")
        if candidate.location and candidate.location.address_line and payload.location.address_line:
            if candidate.location.address_line.lower().strip() == payload.location.address_line.lower().strip():
                score += 35
                reasons.append("same address")
        if (
            candidate.rental_terms
            and candidate.rental_terms.rent_amount
            and abs(float(candidate.rental_terms.rent_amount) - payload.terms.rent_amount)
            <= max(500, payload.terms.rent_amount * 0.1)
        ):
            score += 15
            reasons.append("similar rent")
        if candidate.location and candidate.location.neighbourhood_id and payload.location.neighbourhood_id:
            if str(candidate.location.neighbourhood_id) == payload.location.neighbourhood_id:
                score += 10
                reasons.append("same neighbourhood")
        if score >= 50:
            matches.append(
                {
                    "property_id": candidate.id,
                    "reference": candidate.reference,
                    "title": candidate.title,
                    "score": score,
                    "reasons": reasons,
                }
            )
    matches.sort(key=lambda m: m["score"], reverse=True)
    return matches[:5]


def create_property(db: Session, payload: PropertyCreateIn, user: User) -> tuple[Property, list[dict]]:
    if not user.phone_verified_at:
        raise Forbidden("Verify your phone number before submitting a property.", code="phone_not_verified")
    subscription_service.enforce_listing_limit(db, user)
    town = _resolve_town(db, uuid.UUID(payload.location.town_id))
    neighbourhood, landmark, locality = _validate_location_links(
        db,
        town,
        uuid.UUID(payload.location.neighbourhood_id) if payload.location.neighbourhood_id else None,
        uuid.UUID(payload.location.landmark_id) if payload.location.landmark_id else None,
        uuid.UUID(payload.location.locality_id) if payload.location.locality_id else None,
    )
    role_codes = set(user.role_codes)
    operates_for_others = bool(role_codes & {"data_partner", "property_manager"})
    if operates_for_others and not (payload.recorded_owner_name and payload.recorded_owner_phone):
        raise ValidationError(
            "Record the owner or authorized representative name and phone for this submission."
        )
    owner_id = None if operates_for_others else user.id
    if not operates_for_others and payload.recorded_owner_phone:
        raise ValidationError("Owner contact details are only required for partner submissions.")

    amenity_ids = [uuid.UUID(a) for a in payload.amenity_ids]
    amenities = db.execute(select(Amenity).where(Amenity.id.in_(amenity_ids))).scalars().all() if amenity_ids else []
    if len(amenities) != len(set(payload.amenity_ids)):
        raise ValidationError("One or more selected amenities no longer exist.")
    commercial_use_ids = [uuid.UUID(c) for c in payload.commercial_use_ids]
    commercial_uses = (
        db.execute(select(CommercialUse).where(CommercialUse.id.in_(commercial_use_ids))).scalars().all()
        if commercial_use_ids
        else []
    )
    if len(commercial_uses) != len(set(payload.commercial_use_ids)):
        raise ValidationError("One or more selected business uses no longer exist.")
    if payload.category == "commercial" and not commercial_uses:
        raise ValidationError("Select at least one suitable business use for a commercial property.")

    duplicates = detect_duplicates(db, payload, user)
    now = utcnow()
    prop = Property(
        reference=generate_reference(db),
        title=payload.title,
        description=payload.description,
        category=payload.category,
        property_type=payload.property_type,
        status=PropertyStatus.PENDING.value,
        availability_status=(
            AvailabilityStatus.AVAILABLE.value
            if payload.confirm_available_now
            else AvailabilityStatus.UNCONFIRMED.value
        ),
        owner_id=owner_id,
        created_by_id=user.id,
        manager_id=user.id if "property_manager" in role_codes else None,
        recorded_owner_name=payload.recorded_owner_name,
        recorded_owner_phone=payload.recorded_owner_phone,
        source_partner_id=user.id if "data_partner" in role_codes else None,
        last_confirmed_available_at=now if payload.confirm_available_now else None,
        last_confirmed_rent_at=None,
        last_detail_update_at=now,
        freshness_days=settings.default_freshness_days,
    )
    db.add(prop)
    db.flush()

    private_lat, private_lng, public_lat, public_lng = _coordinates_for_public(payload.location, town, neighbourhood)
    prop.location = PropertyLocation(
        town_id=town.id,
        neighbourhood_id=neighbourhood.id if neighbourhood else None,
        locality_id=locality.id if locality else None,
        landmark_id=landmark.id if landmark else None,
        address_line=payload.location.address_line,
        latitude_private=private_lat,
        longitude_private=private_lng,
        latitude_public=public_lat,
        longitude_public=public_lng,
        precision=payload.location.precision,
        directions=payload.location.directions,
        geom_private=point_wkt(private_lat, private_lng),
        geom_public=point_wkt(public_lat, public_lng),
    )
    terms = payload.terms
    prop.rental_terms = RentalTerm(
        currency=terms.currency.upper(),
        rent_amount=Decimal(str(terms.rent_amount)),
        deposit_amount=Decimal(str(terms.deposit_amount)),
        rent_period=terms.rent_period,
        agency_fee=Decimal(str(terms.agency_fee)) if terms.agency_fee is not None else None,
        service_fee=Decimal(str(terms.service_fee)) if terms.service_fee is not None else None,
        utility_connection_fee=(
            Decimal(str(terms.utility_connection_fee)) if terms.utility_connection_fee is not None else None
        ),
        other_mandatory_fee=(
            Decimal(str(terms.other_mandatory_fee)) if terms.other_mandatory_fee is not None else None
        ),
        other_charges=json.dumps(terms.other_charges) if terms.other_charges else None,
        utilities_included=terms.utilities_included,
        negotiable=terms.negotiable,
        available_from=terms.available_from,
        minimum_lease_months=terms.minimum_lease_months,
        payment_schedule=terms.payment_schedule,
    )
    if payload.category == "residential" and payload.residential:
        d = payload.residential
        prop.residential_detail = ResidentialDetail(
            bedrooms=d.bedrooms,
            bathrooms=d.bathrooms,
            house_style=d.house_style or payload.property_type,
            furnishing=d.furnishing,
            floor_number=d.floor_number,
            has_private_bathroom=d.has_private_bathroom,
            parking_spaces=d.parking_spaces,
            outdoor_space=d.outdoor_space,
            security_features=json.dumps(d.security_features),
            water_source=d.water_source,
            electricity_supply=d.electricity_supply,
            shared_accommodation=d.shared_accommodation,
        )
    if payload.category == "commercial" and payload.commercial:
        c = payload.commercial
        prop.commercial_detail = CommercialDetail(
            floor_area_sqm=Decimal(str(c.floor_area_sqm)) if c.floor_area_sqm is not None else None,
            frontage_m=Decimal(str(c.frontage_m)) if c.frontage_m is not None else None,
            floor_level=c.floor_level,
            power_capacity_kva=Decimal(str(c.power_capacity_kva)) if c.power_capacity_kva is not None else None,
            parking_spaces=c.parking_spaces,
            accessibility=c.accessibility,
            loading_access=c.loading_access,
            visibility=c.visibility,
            road_access=c.road_access,
            lease_duration_months=c.lease_duration_months,
            zoning_note=c.zoning_note,
            permitted_use_verified=c.permitted_use_verified,
        )
    for amenity in amenities:
        prop.amenities.append(PropertyAmenity(amenity_id=amenity.id))
    for use in commercial_uses:
        prop.commercial_uses.append(PropertyCommercialUse(commercial_use_id=use.id))
    prop.units.append(
        RentalUnit(
            label="Main unit",
            unit_type=payload.property_type,
            bedrooms=payload.residential.bedrooms if payload.residential else None,
            bathrooms=payload.residential.bathrooms if payload.residential else None,
            rent_amount=Decimal(str(terms.rent_amount)),
            deposit_amount=Decimal(str(terms.deposit_amount)),
            currency=terms.currency.upper(),
            availability_status=AvailabilityStatus.AVAILABLE.value if payload.confirm_available_now else AvailabilityStatus.UNCONFIRMED.value,
            available_from=terms.available_from,
        )
    )
    db.flush()
    prop.rental_terms.rental_unit_id = prop.units[0].id

    if owner_id:
        prop.owner_links.append(PropertyOwner(user_id=owner_id, relationship_type="owner"))
    if prop.manager_id:
        prop.manager_links.append(
            PropertyManager(
                user_id=prop.manager_id,
                authorization_reference="self-registered-manager",
                authorized_at=now,
                status="active",
            )
        )

    phone_record = _verify_phone_record(user)
    if phone_record:
        phone_record.property_id = prop.id
        db.add(phone_record)
    for vtype in (
        VerificationType.OWNERSHIP,
        VerificationType.AUTHORITY,
        VerificationType.DETAILS,
        VerificationType.RENT,
    ):
        db.add(
            VerificationRecord(
                property_id=prop.id,
                verification_type=vtype.value,
                status=VerificationStatus.PENDING.value,
                requested_by_id=user.id,
                notes="Submitted with the listing; awaiting review.",
            )
        )
    if payload.confirm_available_now:
        db.add(
            VerificationRecord(
                property_id=prop.id,
                verification_type=VerificationType.AVAILABILITY.value,
                status=VerificationStatus.VERIFIED.value,
                evidence_reference="landlord-availability-confirmation",
                verified_at=now,
                responsible_id=user.id,
                notes="Landlord confirmed availability at submission.",
            )
        )
        db.add(
            PropertyAvailability(
                property_id=prop.id,
                unit_id=prop.units[0].id,
                status=AvailabilityStatus.AVAILABLE.value,
                confirmed_at=now,
                confirmed_by_id=user.id,
                source="landlord",
                next_recheck_at=now + timedelta(days=settings.default_freshness_days),
            )
        )
    db.add(
        PropertyStatusHistory(
            property_id=prop.id,
            from_status=None,
            to_status=PropertyStatus.PENDING.value,
            reason="Property submitted for moderation",
            actor_id=user.id,
        )
    )
    _add_history(
        db,
        prop,
        "listing_submitted",
        "Property information submitted for review",
        actor=user,
        changes={"status": "pending"},
        visibility="private",
    )
    if payload.confirm_available_now:
        _add_history(
            db,
            prop,
            "availability_confirmed",
            "Availability confirmed by the landlord",
            actor=user,
            changes={"availability": "available"},
        )
    if duplicates:
        _add_history(
            db,
            prop,
            "duplicate_check",
            "Possible duplicate listing detected and flagged for review",
            actor=user,
            changes={"matches": duplicates},
            visibility="private",
        )
    write_audit(
        db,
        actor=user,
        action="property.created",
        resource_type="property",
        resource_id=prop.id,
        after={"reference": prop.reference, "status": prop.status},
    )
    db.commit()
    prop = load_property(db, prop.id)
    return prop, duplicates


def update_property(db: Session, prop: Property, payload: PropertyUpdateIn, user: User) -> Property:
    assert_can_manage(db, prop, user)
    changed: list[str] = []
    review_required = False

    if payload.title is not None and payload.title != prop.title:
        prop.title = payload.title
        changed.append("title")
        review_required = True
    if payload.description is not None and payload.description != prop.description:
        prop.description = payload.description
        changed.append("description")
        review_required = True
    if payload.property_type is not None and payload.property_type != prop.property_type:
        prop.property_type = payload.property_type
        changed.append("property_type")
        review_required = True
    if payload.location is not None:
        town = _resolve_town(db, uuid.UUID(payload.location.town_id))
        neighbourhood, landmark, locality = _validate_location_links(
            db,
            town,
            uuid.UUID(payload.location.neighbourhood_id) if payload.location.neighbourhood_id else None,
            uuid.UUID(payload.location.landmark_id) if payload.location.landmark_id else None,
            uuid.UUID(payload.location.locality_id) if payload.location.locality_id else None,
        )
        loc = prop.location or PropertyLocation(property_id=prop.id, town_id=town.id)
        loc.town_id = town.id
        loc.neighbourhood_id = neighbourhood.id if neighbourhood else None
        loc.landmark_id = landmark.id if landmark else None
        loc.locality_id = locality.id if locality else None
        loc.address_line = payload.location.address_line
        loc.directions = payload.location.directions
        loc.precision = payload.location.precision
        private_lat, private_lng, public_lat, public_lng = _coordinates_for_public(payload.location, town, neighbourhood)
        loc.latitude_private = private_lat
        loc.longitude_private = private_lng
        loc.latitude_public = public_lat
        loc.longitude_public = public_lng
        loc.geom_private = point_wkt(private_lat, private_lng)
        loc.geom_public = point_wkt(public_lat, public_lng)
        prop.location = loc
        changed.append("location")
        review_required = True
    if payload.terms is not None:
        if prop.rental_terms is None:
            prop.rental_terms = RentalTerm(property_id=prop.id)
        terms = prop.rental_terms
        t = payload.terms
        before_rent = terms.rent_amount
        terms.currency = t.currency.upper()
        terms.rent_amount = Decimal(str(t.rent_amount))
        terms.deposit_amount = Decimal(str(t.deposit_amount))
        terms.rent_period = t.rent_period
        terms.agency_fee = Decimal(str(t.agency_fee)) if t.agency_fee is not None else None
        terms.service_fee = Decimal(str(t.service_fee)) if t.service_fee is not None else None
        terms.utility_connection_fee = (
            Decimal(str(t.utility_connection_fee)) if t.utility_connection_fee is not None else None
        )
        terms.other_mandatory_fee = (
            Decimal(str(t.other_mandatory_fee)) if t.other_mandatory_fee is not None else None
        )
        terms.other_charges = json.dumps(t.other_charges) if t.other_charges else None
        terms.utilities_included = t.utilities_included
        terms.negotiable = t.negotiable
        terms.available_from = t.available_from
        terms.minimum_lease_months = t.minimum_lease_months
        terms.payment_schedule = t.payment_schedule
        prop.last_confirmed_rent_at = None
        changed.append("rental_terms")
        review_required = True
        if before_rent != terms.rent_amount:
            _add_history(
                db,
                prop,
                "rent_changed",
                "Advertised rent updated",
                actor=user,
                changes={"from": str(before_rent), "to": str(terms.rent_amount), "currency": terms.currency},
            )
    if payload.residential is not None and prop.category == "residential":
        if prop.residential_detail is None:
            prop.residential_detail = ResidentialDetail(property_id=prop.id)
        d = prop.residential_detail
        r = payload.residential
        d.bedrooms = r.bedrooms
        d.bathrooms = r.bathrooms
        d.house_style = r.house_style
        d.furnishing = r.furnishing
        d.floor_number = r.floor_number
        d.has_private_bathroom = r.has_private_bathroom
        d.parking_spaces = r.parking_spaces
        d.outdoor_space = r.outdoor_space
        d.security_features = json.dumps(r.security_features)
        d.water_source = r.water_source
        d.electricity_supply = r.electricity_supply
        d.shared_accommodation = r.shared_accommodation
        changed.append("residential_details")
        review_required = True
    if payload.commercial is not None and prop.category == "commercial":
        if prop.commercial_detail is None:
            prop.commercial_detail = CommercialDetail(property_id=prop.id)
        d = prop.commercial_detail
        c = payload.commercial
        d.floor_area_sqm = Decimal(str(c.floor_area_sqm)) if c.floor_area_sqm is not None else None
        d.frontage_m = Decimal(str(c.frontage_m)) if c.frontage_m is not None else None
        d.floor_level = c.floor_level
        d.power_capacity_kva = Decimal(str(c.power_capacity_kva)) if c.power_capacity_kva is not None else None
        d.parking_spaces = c.parking_spaces
        d.accessibility = c.accessibility
        d.loading_access = c.loading_access
        d.visibility = c.visibility
        d.road_access = c.road_access
        d.lease_duration_months = c.lease_duration_months
        d.zoning_note = c.zoning_note
        d.permitted_use_verified = c.permitted_use_verified
        changed.append("commercial_details")
        review_required = True
    if payload.amenity_ids is not None:
        prop.amenities.clear()
        ids = [uuid.UUID(a) for a in set(payload.amenity_ids)]
        amenities = db.execute(select(Amenity).where(Amenity.id.in_(ids))).scalars().all() if ids else []
        if len(amenities) != len(ids):
            raise ValidationError("One or more selected amenities no longer exist.")
        for amenity in amenities:
            prop.amenities.append(PropertyAmenity(amenity_id=amenity.id))
        changed.append("amenities")
    if payload.commercial_use_ids is not None:
        prop.commercial_uses.clear()
        ids = [uuid.UUID(c) for c in set(payload.commercial_use_ids)]
        uses = db.execute(select(CommercialUse).where(CommercialUse.id.in_(ids))).scalars().all() if ids else []
        if len(uses) != len(ids):
            raise ValidationError("One or more selected business uses no longer exist.")
        for use in uses:
            prop.commercial_uses.append(PropertyCommercialUse(commercial_use_id=use.id))
        changed.append("commercial_uses")

    prop.last_detail_update_at = utcnow()
    if review_required and prop.status == PropertyStatus.APPROVED.value:
        prop.status = PropertyStatus.PENDING.value
        db.add(
            PropertyStatusHistory(
                property_id=prop.id,
                from_status=PropertyStatus.APPROVED.value,
                to_status=PropertyStatus.PENDING.value,
                reason="Material listing changes require moderation",
                actor_id=user.id,
            )
        )
        for vtype in (VerificationType.DETAILS, VerificationType.RENT):
            db.add(
                VerificationRecord(
                    property_id=prop.id,
                    verification_type=vtype.value,
                    status=VerificationStatus.PENDING.value,
                    requested_by_id=user.id,
                    notes="Listing changed; re-check required.",
                )
            )
    _add_history(
        db,
        prop,
        "listing_updated",
        "Property details updated",
        actor=user,
        changes={"fields": changed, "review_required": review_required},
        visibility="private",
    )
    write_audit(
        db,
        actor=user,
        action="property.updated",
        resource_type="property",
        resource_id=prop.id,
        before={"status": prop.status},
        after={"changed_fields": changed, "review_required": review_required},
    )
    db.commit()
    return load_property(db, prop.id)


def archive_property(db: Session, prop: Property, user: User) -> None:
    assert_can_manage(db, prop, user)
    previous = prop.status
    prop.status = PropertyStatus.ARCHIVED.value
    prop.deleted_at = utcnow()
    db.add(
        PropertyStatusHistory(
            property_id=prop.id,
            from_status=previous,
            to_status=PropertyStatus.ARCHIVED.value,
            reason="Archived by owner",
            actor_id=user.id,
        )
    )
    _add_history(db, prop, "listing_archived", "Listing archived", actor=user, visibility="private")
    write_audit(
        db,
        actor=user,
        action="property.archived",
        resource_type="property",
        resource_id=prop.id,
        before={"status": previous},
        after={"status": "archived"},
    )
    db.commit()


def moderate_property(db: Session, prop: Property, action: str, reason: str | None, actor: User, request=None) -> Property:
    previous = prop.status
    if action == "approve":
        if prop.status == PropertyStatus.ARCHIVED.value:
            raise UnprocessableState("Archived properties must be reactivated, not approved.")
        prop.status = PropertyStatus.APPROVED.value
        prop.published_at = prop.published_at or utcnow()
        prop.rejection_reason = None
    elif action == "reject":
        if not reason:
            raise ValidationError("A rejection reason is required.")
        prop.status = PropertyStatus.REJECTED.value
        prop.rejection_reason = reason
    elif action == "suspend":
        if not reason:
            raise ValidationError("A suspension reason is required.")
        prop.status = PropertyStatus.SUSPENDED.value
        prop.suspension_reason = reason
    elif action == "archive":
        prop.status = PropertyStatus.ARCHIVED.value
        prop.deleted_at = utcnow()
    elif action == "reactivate":
        prop.status = PropertyStatus.APPROVED.value
        prop.suspension_reason = None
        prop.rejection_reason = None
        prop.deleted_at = None
        prop.published_at = prop.published_at or utcnow()
    else:
        raise ValidationError("Unknown moderation action.")
    prop.moderated_by_id = actor.id
    prop.moderated_at = utcnow()
    db.add(
        PropertyStatusHistory(
            property_id=prop.id,
            from_status=previous,
            to_status=prop.status,
            reason=reason,
            actor_id=actor.id,
        )
    )
    from app.models import ModerationAction

    db.add(
        ModerationAction(
            moderator_id=actor.id,
            property_id=prop.id,
            action=action,
            reason=reason,
        )
    )
    _add_history(
        db,
        prop,
        f"moderation_{action}",
        {
            "approve": "Listing approved and published",
            "reject": "Listing rejected",
            "suspend": "Listing suspended",
            "archive": "Listing archived",
            "reactivate": "Listing reactivated",
        }[action],
        actor=actor,
        changes={"from": previous, "to": prop.status, "reason": reason},
        visibility="public",
    )
    write_audit(
        db,
        actor=actor,
        action=f"property.{action}",
        resource_type="property",
        resource_id=prop.id,
        before={"status": previous},
        after={"status": prop.status, "reason": reason},
        ip_address=request.client.host if request and request.client else None,
    )
    if prop.owner_id:
        owner = db.get(User, prop.owner_id)
        if owner:
            if action == "approve":
                create_notification(
                    db,
                    user=owner,
                    notification_type="listing_approved",
                    title="Your property has been approved",
                    body=f"{prop.title} ({prop.reference}) is now published. Keep its availability up to date.",
                    data={"property_id": str(prop.id)},
                    channels=["in_app", "sms"],
                )
            elif action in {"reject", "suspend"}:
                create_notification(
                    db,
                    user=owner,
                    notification_type=f"listing_{action}",
                    title=f"Your property was {action}ed",
                    body=f"{prop.title}: {reason or 'Contact support for details.'}",
                    data={"property_id": str(prop.id)},
                    channels=["in_app", "sms"],
                )
    db.commit()
    return load_property(db, prop.id)


def update_availability(
    db: Session,
    prop: Property,
    status: str,
    notes: str | None,
    actor: User,
) -> Property:
    assert_can_manage(db, prop, actor)
    now = utcnow()
    previous = prop.availability_status
    prop.availability_status = status
    if status == AvailabilityStatus.AVAILABLE.value:
        prop.last_confirmed_available_at = now
    db.add(
        PropertyAvailability(
            property_id=prop.id,
            status=status,
            confirmed_at=now if status in {AvailabilityStatus.AVAILABLE.value, AvailabilityStatus.OCCUPIED.value, AvailabilityStatus.TEMPORARILY_UNAVAILABLE.value} else None,
            confirmed_by_id=actor.id,
            source="landlord",
            notes=notes,
            next_recheck_at=now + timedelta(days=settings.default_freshness_days)
            if status == AvailabilityStatus.AVAILABLE.value
            else None,
        )
    )
    if status == AvailabilityStatus.AVAILABLE.value:
        db.add(
            VerificationRecord(
                property_id=prop.id,
                verification_type=VerificationType.AVAILABILITY.value,
                status=VerificationStatus.VERIFIED.value,
                evidence_reference="landlord-availability-confirmation",
                verified_at=now,
                responsible_id=actor.id,
                notes="Availability confirmed by landlord.",
            )
        )
    _add_history(
        db,
        prop,
        "availability_changed",
        f"Availability changed to {status.replace('_', ' ')}",
        actor=actor,
        changes={"from": previous, "to": status, "notes": notes},
    )
    write_audit(
        db,
        actor=actor,
        action="property.availability_updated",
        resource_type="property",
        resource_id=prop.id,
        before={"availability": previous},
        after={"availability": status, "notes": notes},
    )
    db.commit()
    return load_property(db, prop.id)


def create_report(
    db: Session, prop: Property, payload: ReportIn, reporter: User | None, request=None
) -> PropertyReport:
    report = PropertyReport(
        property_id=prop.id,
        reporter_id=reporter.id if reporter else None,
        reporter_phone=payload.phone,
        reason=payload.reason,
        details=payload.details,
        status="open",
    )
    db.add(report)
    db.flush()
    from app.models import Role, User as UserModel

    moderators = db.execute(
        select(UserModel)
        .join(UserModel.roles)
        .where(Role.code.in_(["moderator", "super_admin"]))
    ).scalars().unique().all()
    for moderator in moderators:
        create_notification(
            db,
            user=moderator,
            notification_type="property_reported",
            title="A property was reported",
            body=f"{prop.title} ({prop.reference}) was reported: {payload.reason.replace('_', ' ')}.",
            data={"property_id": str(prop.id), "report_id": str(report.id)},
            channels=["in_app"],
        )
    write_audit(
        db,
        actor=reporter,
        action="property.reported",
        resource_type="property",
        resource_id=prop.id,
        after={"report_id": str(report.id), "reason": payload.reason},
        ip_address=request.client.host if request and request.client else None,
    )
    db.commit()
    db.refresh(report)
    return report


def create_enquiry(db: Session, prop: Property, payload: EnquiryCreateIn, seeker: User | None) -> PropertyEnquiry:
    if not is_publicly_visible(prop):
        raise NotFound("Property not found.")
    landlord_id = prop.owner_id or prop.manager_id or prop.created_by_id
    enquiry = PropertyEnquiry(
        property_id=prop.id,
        seeker_id=seeker.id if seeker else None,
        landlord_id=landlord_id,
        name=payload.name,
        phone=payload.phone,
        email=str(payload.email) if payload.email else (seeker.email if seeker else None),
        message=payload.message,
        enquiry_type=payload.enquiry_type,
        status="new",
    )
    prop.contact_count += 1
    db.add(enquiry)
    db.flush()
    landlord = db.get(User, landlord_id)
    if landlord:
        create_notification(
            db,
            user=landlord,
            notification_type="new_enquiry",
            title=f"New enquiry for {prop.title}",
            body=f"{payload.name} wants to know more about {prop.reference}. Sign in to respond.",
            data={"property_id": str(prop.id), "enquiry_id": str(enquiry.id)},
            channels=["in_app", "sms"],
        )
    write_audit(
        db,
        actor=seeker,
        action="enquiry.created",
        resource_type="property",
        resource_id=prop.id,
        after={"enquiry_id": str(enquiry.id)},
    )
    db.commit()
    db.refresh(enquiry)
    return enquiry


def list_enquiries(db: Session, user: User, role: str = "all") -> list[PropertyEnquiry]:
    query = select(PropertyEnquiry).options(
        joinedload(PropertyEnquiry.property).options(
            joinedload(Property.rental_terms),
            joinedload(Property.location),
            joinedload(Property.residential_detail),
            joinedload(Property.commercial_detail),
            selectinload(Property.media),
            selectinload(Property.amenities).joinedload(PropertyAmenity.amenity),
            selectinload(Property.verifications).selectinload(VerificationRecord.evidence),
        )
    )
    if role == "sent":
        query = query.where(PropertyEnquiry.seeker_id == user.id)
    elif role == "received":
        query = query.where(PropertyEnquiry.landlord_id == user.id)
    else:
        query = query.where(
            or_(PropertyEnquiry.seeker_id == user.id, PropertyEnquiry.landlord_id == user.id)
        )
    return db.execute(query.order_by(PropertyEnquiry.created_at.desc())).scalars().unique().all()


def respond_enquiry(
    db: Session, enquiry: PropertyEnquiry, payload: EnquiryRespondIn, user: User
) -> PropertyEnquiry:
    if enquiry.landlord_id != user.id:
        raise Forbidden("You can only respond to enquiries for your properties.")
    enquiry.response = payload.response
    enquiry.status = payload.status
    enquiry.responded_at = utcnow()
    if enquiry.seeker_id:
        seeker = db.get(User, enquiry.seeker_id)
        if seeker:
            create_notification(
                db,
                user=seeker,
                notification_type="enquiry_response",
                title="The landlord replied to your enquiry",
                body=payload.response[:300],
                data={"property_id": str(enquiry.property_id), "enquiry_id": str(enquiry.id)},
                channels=["in_app", "sms"],
            )
    else:
        from app.integrations.messaging import send_sms

        try:
            send_sms(enquiry.phone, f"Findora: landlord response for {enquiry.property.reference}: {payload.response[:200]}")
        except Exception:
            pass
    db.commit()
    return enquiry


def request_verification(
    db: Session, prop: Property, payload: VerificationRequestIn, user: User
) -> VerificationRecord:
    assert_can_manage(db, prop, user)
    record = VerificationRecord(
        property_id=prop.id,
        verification_type=payload.verification_type,
        status=VerificationStatus.PENDING.value,
        requested_by_id=user.id,
        notes=payload.notes,
    )
    db.add(record)
    write_audit(
        db,
        actor=user,
        action="verification.requested",
        resource_type="property",
        resource_id=prop.id,
        after={"verification_type": payload.verification_type},
    )
    db.commit()
    db.refresh(record)
    return record


def get_verification_records(db: Session, prop: Property, user: User | None) -> dict:
    is_manager = bool(user and (can_manage_property(db, prop, user) or "super_admin" in user.role_codes))
    records = db.execute(
        select(VerificationRecord)
        .options(selectinload(VerificationRecord.evidence))
        .where(VerificationRecord.property_id == prop.id)
        .order_by(VerificationRecord.created_at.desc())
    ).scalars().all()
    return {
        "checks": verification_checks(prop),
        "records": [
            {
                "id": r.id,
                "type": r.verification_type,
                "status": r.status,
                "evidence_reference": r.evidence_reference if is_manager else None,
                "notes": r.notes if is_manager or r.status == "verified" else None,
                "rejection_reason": r.rejection_reason if is_manager else None,
                "verified_at": r.verified_at,
                "expires_at": r.expires_at,
                "created_at": r.created_at,
                "evidence": [
                    {"id": e.id, "kind": e.kind, "description": e.description}
                    for e in r.evidence
                ]
                if is_manager
                else [],
            }
            for r in records
        ],
    }


def review_verification(
    db: Session, record: VerificationRecord, payload: VerificationReviewIn, reviewer: User
) -> VerificationRecord:
    if record.requested_by_id == reviewer.id:
        raise Forbidden(
            "You cannot review a verification submission you created. Independent review is required."
        )
    if payload.status == "verified" and not (
        payload.evidence_reference or record.evidence_reference or record.evidence or payload.notes
    ):
        raise ValidationError("A verified outcome requires evidence or review notes.")
    if payload.status == "failed" and not payload.rejection_reason:
        raise ValidationError("A rejection reason is required for a failed verification.")
    previous = record.status
    record.status = payload.status
    record.notes = payload.notes or record.notes
    record.rejection_reason = payload.rejection_reason
    record.responsible_id = reviewer.id
    record.evidence_reference = payload.evidence_reference or record.evidence_reference
    if payload.status == "verified":
        record.verified_at = utcnow()
        record.expires_at = (
            utcnow() + timedelta(days=payload.expires_in_days) if payload.expires_in_days else None
        )
    if record.property_id:
        prop = db.get(Property, record.property_id)
        if prop:
            _add_history(
                db,
                prop,
                f"verification_{payload.status}",
                f"{record.verification_type.replace('_', ' ').title()} verification {payload.status}",
                actor=reviewer,
                changes={
                    "from": previous,
                    "to": payload.status,
                    "notes": payload.notes,
                },
                visibility="public",
            )
            if prop.owner_id:
                owner = db.get(User, prop.owner_id)
                if owner:
                    create_notification(
                        db,
                        user=owner,
                        notification_type="verification_update",
                        title="Verification update",
                        body=f"{record.verification_type.replace('_', ' ').title()} verification for {prop.reference} is now {payload.status}.",
                        data={"property_id": str(prop.id)},
                        channels=["in_app"],
                    )
    write_audit(
        db,
        actor=reviewer,
        action="verification.reviewed",
        resource_type="verification",
        resource_id=record.id,
        before={"status": previous},
        after={"status": payload.status, "notes": payload.notes},
    )
    db.commit()
    db.refresh(record)
    return record


def add_inspection(db: Session, prop: Property, payload: InspectionIn, officer: User) -> PropertyInspection:
    inspection = PropertyInspection(
        property_id=prop.id,
        inspector_id=officer.id,
        inspection_date=payload.inspection_date or utcnow().date(),
        exterior_condition=payload.exterior_condition,
        interior_condition=payload.interior_condition,
        water_facilities=payload.water_facilities,
        electricity=payload.electricity,
        doors_windows=payload.doors_windows,
        plumbing=payload.plumbing,
        access=payload.access,
        outstanding_concerns=payload.outstanding_concerns,
        findings=json.dumps(payload.findings),
        status=payload.status,
    )
    db.add(inspection)
    if payload.status == "passed":
        record = VerificationRecord(
            property_id=prop.id,
            verification_type=VerificationType.INSPECTION.value,
            status=VerificationStatus.VERIFIED.value,
            evidence_reference=f"inspection:{inspection.id}",
            verified_at=utcnow(),
            responsible_id=officer.id,
            notes=payload.outstanding_concerns or "Field inspection completed.",
        )
        db.add(record)
    _add_history(
        db,
        prop,
        "inspection_recorded",
        "Field inspection recorded",
        actor=officer,
        changes={"date": str(inspection.inspection_date), "status": payload.status},
    )
    write_audit(
        db,
        actor=officer,
        action="property.inspection_recorded",
        resource_type="property",
        resource_id=prop.id,
        after={"inspection_id": str(inspection.id), "status": payload.status},
    )
    db.commit()
    db.refresh(inspection)
    return inspection


def similar_properties(db: Session, prop: Property, limit: int = 4) -> list[dict]:
    if not prop.location or not prop.rental_terms:
        return []
    from app.services.search_service import search_properties

    result = search_properties(
        db,
        category=prop.category,
        town_id=str(prop.location.town_id),
        min_rent=max(0, float(prop.rental_terms.rent_amount) * 0.6),
        max_rent=float(prop.rental_terms.rent_amount) * 1.5,
        sort="newest",
        page=1,
        page_size=limit + 1,
    )
    items = [item for item in result["items"] if item["id"] != prop.id][:limit]
    return items


def property_internal_summary(prop: Property) -> dict:
    data = property_summary(prop)
    data["owner_id"] = prop.owner_id
    data["created_by_id"] = prop.created_by_id
    data["status"] = prop.status
    data["rejection_reason"] = prop.rejection_reason
    data["suspension_reason"] = prop.suspension_reason
    data["recorded_owner_name"] = prop.recorded_owner_name
    data["recorded_owner_phone"] = prop.recorded_owner_phone
    return data
