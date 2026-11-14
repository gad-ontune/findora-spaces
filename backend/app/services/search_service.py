from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Amenity,
    CommercialUse,
    County,
    Landmark,
    Neighbourhood,
    Property,
    PropertyAmenity,
    PropertyCommercialUse,
    PropertyLocation,
    RentalTerm,
    SubCounty,
    Town,
    VerificationRecord,
)
from app.models.base import PropertyStatus
from app.services.property_service import base_property_query
from app.services.serializers import property_summary, utcnow


def _freshness_condition(default_days: int):
    return text(
        "properties.last_confirmed_available_at >= NOW() - "
        "(COALESCE(properties.freshness_days, :default_freshness) || ' days')::interval"
    ).bindparams(default_freshness=default_days)


def _verification_condition(value: str):
    if value == "any":
        return Property.verifications.any(VerificationRecord.status == "verified")
    return Property.verifications.any(
        and_(
            VerificationRecord.verification_type == value,
            VerificationRecord.status == "verified",
        )
    )


def search_properties(
    db: Session,
    *,
    category: str | None = None,
    county: str | None = None,
    county_id: str | None = None,
    town: str | None = None,
    town_id: str | None = None,
    neighbourhood: str | None = None,
    neighbourhood_id: str | None = None,
    landmark: str | None = None,
    min_rent: float | None = None,
    max_rent: float | None = None,
    property_type: str | None = None,
    furnishing: str | None = None,
    verified: str | None = None,
    recently_confirmed_days: int | None = None,
    amenities: list[str] | None = None,
    bedrooms_min: int | None = None,
    bedrooms_max: int | None = None,
    bathrooms_min: int | None = None,
    parking_min: int | None = None,
    business_use: str | None = None,
    floor_area_min: float | None = None,
    floor_area_max: float | None = None,
    frontage_min: float | None = None,
    loading_access: bool | None = None,
    lease_duration_min: int | None = None,
    q: str | None = None,
    featured: bool | None = None,
    north: float | None = None,
    south: float | None = None,
    east: float | None = None,
    west: float | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    radius_km: float | None = None,
    sort: str = "newest",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    conditions = [Property.status == PropertyStatus.APPROVED.value, Property.deleted_at.is_(None)]
    default_days = settings.default_freshness_days
    conditions.extend(
        [
            Property.availability_status == "available",
            Property.last_confirmed_available_at.is_not(None),
            _freshness_condition(default_days),
        ]
    )

    if category:
        conditions.append(Property.category == category)
    if county_id:
        try:
            cid = uuid.UUID(county_id)
        except ValueError:
            conditions.append(Property.id.is_(None))
        else:
            conditions.append(
                Property.location.has(
                    PropertyLocation.town.has(Town.sub_county.has(SubCounty.county_id == cid))
                )
            )
    elif county:
        conditions.append(
            Property.location.has(
                PropertyLocation.town.has(
                    Town.sub_county.has(SubCounty.county.has(County.slug == county))
                )
            )
        )
    if town_id:
        try:
            tid = uuid.UUID(town_id)
        except ValueError:
            conditions.append(Property.id.is_(None))
        else:
            conditions.append(Property.location.has(PropertyLocation.town_id == tid))
    elif town:
        conditions.append(
            Property.location.has(PropertyLocation.town.has(Town.slug == town))
        )
    if neighbourhood_id:
        try:
            nid = uuid.UUID(neighbourhood_id)
        except ValueError:
            conditions.append(Property.id.is_(None))
        else:
            conditions.append(Property.location.has(PropertyLocation.neighbourhood_id == nid))
    elif neighbourhood:
        conditions.append(
            Property.location.has(
                PropertyLocation.neighbourhood.has(Neighbourhood.slug == neighbourhood)
            )
        )
    if landmark:
        conditions.append(
            Property.location.has(PropertyLocation.landmark.has(Landmark.name.ilike(f"%{landmark}%")))
        )
    if min_rent is not None:
        conditions.append(
            Property.rental_terms.has(RentalTerm.rent_amount >= min_rent)
        )
    if max_rent is not None:
        conditions.append(
            Property.rental_terms.has(RentalTerm.rent_amount <= max_rent)
        )
    if property_type:
        conditions.append(
            or_(
                Property.property_type == property_type,
                Property.property_type.ilike(f"%{property_type}%"),
            )
        )
    if furnishing:
        conditions.append(Property.residential_detail.has(furnishing=furnishing))
    if bedrooms_min is not None:
        from app.models import ResidentialDetail

        conditions.append(Property.residential_detail.has(ResidentialDetail.bedrooms >= bedrooms_min))
    if bedrooms_max is not None:
        from app.models import ResidentialDetail

        conditions.append(Property.residential_detail.has(ResidentialDetail.bedrooms <= bedrooms_max))
    if bathrooms_min is not None:
        from app.models import ResidentialDetail

        conditions.append(Property.residential_detail.has(ResidentialDetail.bathrooms >= bathrooms_min))
    if parking_min is not None:
        from app.models import ResidentialDetail

        conditions.append(
            Property.residential_detail.has(ResidentialDetail.parking_spaces >= parking_min)
        )
    if verified:
        conditions.append(_verification_condition(verified))
    if recently_confirmed_days:
        conditions.append(
            Property.last_confirmed_available_at >= utcnow() - timedelta(days=recently_confirmed_days)
        )
    for amenity_slug in amenities or []:
        conditions.append(
            Property.amenities.any(
                PropertyAmenity.amenity.has(Amenity.slug == amenity_slug)
            )
        )
    if featured is not None:
        conditions.append(Property.is_featured.is_(featured))
    if business_use:
        conditions.append(
            Property.commercial_uses.any(
                PropertyCommercialUse.commercial_use.has(CommercialUse.slug == business_use)
            )
        )
    if floor_area_min is not None or floor_area_max is not None or frontage_min is not None or loading_access is not None or lease_duration_min is not None:
        from app.models import CommercialDetail

        if floor_area_min is not None:
            conditions.append(Property.commercial_detail.has(CommercialDetail.floor_area_sqm >= floor_area_min))
        if floor_area_max is not None:
            conditions.append(Property.commercial_detail.has(CommercialDetail.floor_area_sqm <= floor_area_max))
        if frontage_min is not None:
            conditions.append(Property.commercial_detail.has(CommercialDetail.frontage_m >= frontage_min))
        if loading_access is not None:
            conditions.append(Property.commercial_detail.has(CommercialDetail.loading_access.is_(loading_access)))
        if lease_duration_min is not None:
            conditions.append(
                Property.commercial_detail.has(CommercialDetail.lease_duration_months >= lease_duration_min)
            )
    if q:
        term = f"%{q.strip()}%"
        conditions.append(
            or_(
                Property.title.ilike(term),
                Property.description.ilike(term),
                Property.reference.ilike(term),
                Property.property_type.ilike(term),
                Property.location.has(
                    PropertyLocation.town.has(Town.name.ilike(term))
                ),
                Property.location.has(
                    PropertyLocation.neighbourhood.has(Neighbourhood.name.ilike(term))
                ),
                Property.location.has(
                    PropertyLocation.landmark.has(Landmark.name.ilike(term))
                ),
            )
        )
    has_bounds = all(v is not None for v in (north, south, east, west))
    if has_bounds:
        conditions.append(
            Property.location.has(
                and_(
                    PropertyLocation.latitude_public >= south,
                    PropertyLocation.latitude_public <= north,
                    PropertyLocation.longitude_public >= west,
                    PropertyLocation.longitude_public <= east,
                )
            )
        )
    if latitude is not None and longitude is not None and radius_km:
        radius_m = max(100, min(radius_km, 100) * 1000)
        conditions.append(
            Property.location.has(
                text(
                    "ST_DWithin(property_locations.geom_public, "
                    "ST_SetSRID(ST_MakePoint(:radius_lng, :radius_lat), 4326)::geography, :radius_m)"
                ).bindparams(radius_lng=longitude, radius_lat=latitude, radius_m=radius_m)
            )
        )

    rent_subq = (
        select(RentalTerm.rent_amount)
        .where(RentalTerm.property_id == Property.id)
        .scalar_subquery()
    )
    order_by = {
        "newest": [Property.published_at.desc().nullslast(), Property.created_at.desc()],
        "oldest": [Property.created_at.asc()],
        "rent_low": [rent_subq.asc().nullslast()],
        "rent_high": [rent_subq.desc().nullslast()],
        "freshness": [Property.last_confirmed_available_at.desc().nullslast()],
        "featured": [Property.is_featured.desc(), Property.published_at.desc().nullslast()],
        "popular": [Property.views_count.desc(), Property.published_at.desc().nullslast()],
    }.get(sort, [Property.published_at.desc().nullslast(), Property.created_at.desc()])

    total = db.execute(select(func.count(Property.id)).where(*conditions)).scalar_one()
    pages = (total + page_size - 1) // page_size if page_size else 1
    page = max(1, min(page, max(1, pages))) if total else 1
    offset = (page - 1) * page_size

    query = (
        base_property_query()
        .where(*conditions)
        .order_by(*order_by)
        .offset(offset)
        .limit(page_size)
    )
    props = db.execute(query).scalars().unique().all()
    items = [property_summary(p) for p in props]

    type_rows = db.execute(
        select(Property.property_type, func.count(Property.id))
        .where(*conditions)
        .group_by(Property.property_type)
        .order_by(func.count(Property.id).desc())
    ).all()
    price_row = db.execute(
        select(func.min(RentalTerm.rent_amount), func.max(RentalTerm.rent_amount))
        .join(Property, Property.id == RentalTerm.property_id)
        .where(*conditions)
    ).one()

    empty_state = None
    if total == 0:
        empty_state = {
            "message": "No properties match all of your filters.",
            "suggestions": [
                "Increase your maximum rent",
                "Remove one or more amenities",
                "Try a nearby neighbourhood or landmark",
                "Request an assisted search from our local team",
            ],
            "fabricated_results": False,
        }

    return {
        "items": items,
        "pagination": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
            "has_next": page < pages,
            "has_prev": page > 1,
        },
        "facets": {
            "property_types": [{"value": row[0], "count": row[1]} for row in type_rows],
            "rent_min": float(price_row[0]) if price_row[0] is not None else None,
            "rent_max": float(price_row[1]) if price_row[1] is not None else None,
        },
        "empty_state": empty_state,
        "visibility_note": "Only approved listings with availability confirmed within the freshness window are shown.",
    }
