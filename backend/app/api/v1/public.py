from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import (
    Amenity,
    CommercialUse,
    County,
    Landmark,
    Neighbourhood,
    Property,
    PropertyLocation,
    RentalTerm,
    SubCounty,
    Town,
    User,
    UserProfile,
)
from app.models.base import PropertyStatus
from app.services.search_service import search_properties

router = APIRouter(tags=["Public"])

RESIDENTIAL_TYPES = [
    {"value": "bedsitter", "label": "Bedsitter", "description": "One main room with a kitchenette and bathroom"},
    {"value": "single_room", "label": "Single room", "description": "A single room, often with shared facilities"},
    {"value": "studio_apartment", "label": "Studio apartment", "description": "Open-plan living with a private bathroom"},
    {"value": "one_bedroom", "label": "One-bedroom house", "description": "Separate bedroom, sitting room and kitchen"},
    {"value": "two_bedroom", "label": "Two-bedroom house", "description": "Family-sized home with two bedrooms"},
    {"value": "three_bedroom", "label": "Three-bedroom house", "description": "Larger family home"},
    {"value": "family_house", "label": "Larger family house", "description": "Four or more bedrooms"},
    {"value": "apartment", "label": "Apartment", "description": "A unit within an apartment building"},
    {"value": "maisonette", "label": "Maisonette", "description": "Multi-level home, often in a gated compound"},
    {"value": "bungalow", "label": "Bungalow", "description": "Single-storey detached house"},
    {"value": "shared_accommodation", "label": "Shared accommodation", "description": "A room within a shared house"},
]

COMMERCIAL_TYPES = [
    {"value": "shop", "label": "Shop", "description": "Retail premises"},
    {"value": "retail_premises", "label": "Retail premises", "description": "Larger retail space"},
    {"value": "office", "label": "Office", "description": "Office or workspace"},
    {"value": "restaurant", "label": "Restaurant", "description": "Food-service premises"},
    {"value": "salon_barbershop", "label": "Salon or barbershop", "description": "Personal-care premises"},
    {"value": "warehouse", "label": "Warehouse", "description": "Storage and distribution space"},
    {"value": "workshop", "label": "Workshop", "description": "Light industrial or repair space"},
    {"value": "storage", "label": "Storage space", "description": "Secure storage premises"},
    {"value": "business_premises", "label": "Other business premises", "description": "Other commercial rental space"},
]

ASSISTED_STEPS = [
    {
        "step": 1,
        "title": "Tell us what you need",
        "description": "Share your budget, preferred area, property type and move-in timing. No account is required to start.",
    },
    {
        "step": 2,
        "title": "We review genuine supply",
        "description": "Our team checks approved, currently available listings and identifies real options — never invented properties.",
    },
    {
        "step": 3,
        "title": "Local investigation where needed",
        "description": "If database supply is limited, a vetted local partner may check availability with authorised property representatives.",
    },
    {
        "step": 4,
        "title": "Review matches and view",
        "description": "You see why each property matches, what it does not satisfy, and can request a viewing.",
    },
    {
        "step": 5,
        "title": "Confirm before paying",
        "description": "Always view the property and confirm the recipient's authority before sending any money.",
    },
]

SAFETY_GUIDANCE = [
    "Never send a deposit or rent before viewing the property and meeting the landlord or authorised representative.",
    "Confirm that the person receiving money is authorised to receive it. Ask for written confirmation.",
    "Be careful with unusually low rent, pressure to pay quickly, or requests to pay through informal channels.",
    "A Findora verification reduces risk but does not guarantee that a transaction is risk-free.",
    "Report suspicious listings, payment requests or representatives through the report button.",
    "Do not share your Findora password or one-time verification code with anyone.",
]


def _count(db: Session, *conditions) -> int:
    return db.execute(select(func.count(Property.id)).where(*conditions)).scalar_one()


def _fresh_public_conditions():
    return [
        Property.status == PropertyStatus.APPROVED.value,
        Property.deleted_at.is_(None),
        Property.availability_status == "available",
        text(
            "properties.last_confirmed_available_at >= NOW() - "
            "(COALESCE(properties.freshness_days, :default_freshness) || ' days')::interval"
        ).bindparams(default_freshness=settings.default_freshness_days),
    ]


@router.get("/home")
def homepage(db: Session = Depends(get_db)):
    fresh = _fresh_public_conditions()
    total_available = _count(db, *fresh)
    featured = search_properties(db, featured=True, sort="featured", page_size=6)
    recent = search_properties(db, sort="newest", page_size=8)
    confirmed = search_properties(db, sort="freshness", page_size=8)

    type_rows = db.execute(
        select(Property.category, Property.property_type, func.count(Property.id))
        .where(*fresh)
        .group_by(Property.category, Property.property_type)
        .order_by(func.count(Property.id).desc())
    ).all()
    type_counts = {
        category: [
            {"value": value, "count": count}
            for cat, value, count in type_rows
            if cat == category
        ]
        for category in ("residential", "commercial")
    }

    town_rows = db.execute(
        select(Town, func.count(Property.id))
        .join(PropertyLocation, PropertyLocation.town_id == Town.id)
        .join(Property, Property.id == PropertyLocation.property_id)
        .where(*fresh)
        .group_by(Town.id)
        .order_by(func.count(Property.id).desc())
        .limit(8)
    ).all()
    popular_towns = [
        {
            "id": town.id,
            "name": town.name,
            "slug": town.slug,
            "county": town.sub_county.county.name if town.sub_county and town.sub_county.county else None,
            "property_count": count,
            "latitude": float(town.latitude) if town.latitude is not None else None,
            "longitude": float(town.longitude) if town.longitude is not None else None,
        }
        for town, count in town_rows
    ]

    neighbourhood_rows = db.execute(
        select(Neighbourhood, func.count(Property.id))
        .join(PropertyLocation, PropertyLocation.neighbourhood_id == Neighbourhood.id)
        .join(Property, Property.id == PropertyLocation.property_id)
        .where(*fresh)
        .group_by(Neighbourhood.id)
        .order_by(func.count(Property.id).desc())
        .limit(8)
    ).all()
    neighbourhoods = [
        {
            "id": n.id,
            "name": n.name,
            "slug": n.slug,
            "town": n.town.name if n.town else None,
            "description": n.description,
            "property_count": count,
        }
        for n, count in neighbourhood_rows
    ]

    landlords = db.execute(
        select(func.count(func.distinct(Property.owner_id))).where(*fresh)
    ).scalar_one()
    towns_covered = db.execute(
        select(func.count(func.distinct(PropertyLocation.town_id)))
        .join(Property, Property.id == PropertyLocation.property_id)
        .where(*fresh)
    ).scalar_one()

    price_rows = db.execute(
        select(
            Property.category,
            Property.property_type,
            func.count(Property.id),
            func.min(RentalTerm.rent_amount),
            func.max(RentalTerm.rent_amount),
        )
        .join(RentalTerm, RentalTerm.property_id == Property.id)
        .where(*fresh)
        .group_by(Property.category, Property.property_type)
        .having(func.count(Property.id) >= 3)
        .order_by(func.count(Property.id).desc())
    ).all()

    return {
        "hero": {
            "headline": "Find a space yourself, or let us help you find the right one.",
            "subheadline": "Verified rental discovery and assisted property finding in Kehancha, Migori County — built to expand across Kenya.",
            "total_available": total_available,
            "towns_covered": towns_covered,
            "landlords": landlords,
            "primary_action": {"label": "Browse properties", "href": "/residential"},
            "secondary_action": {"label": "Help me find a property", "href": "/find-for-me"},
        },
        "featured": featured["items"],
        "recently_added": recent["items"],
        "recently_confirmed": confirmed["items"],
        "popular_locations": popular_towns,
        "neighbourhoods": neighbourhoods,
        "residential_types": [
            {**item, "count": next((c["count"] for c in type_counts["residential"] if c["value"] == item["value"]), 0)}
            for item in RESIDENTIAL_TYPES
        ],
        "commercial_types": [
            {**item, "count": next((c["count"] for c in type_counts["commercial"] if c["value"] == item["value"]), 0)}
            for item in COMMERCIAL_TYPES
        ],
        "assisted_steps": ASSISTED_STEPS,
        "safety": {
            "guidance": SAFETY_GUIDANCE,
            "verification_note": "Every badge on a property page is backed by an independent verification record with a date and evidence reference. Phone verification does not imply ownership verification.",
        },
        "landlord_cta": {
            "title": "List your rental property",
            "description": "Reach genuine seekers with transparent rent, deposit and availability information. Keep your listing accurate and confirm availability regularly.",
            "href": "/landlord",
        },
        "market_snapshot": [
            {
                "category": category,
                "property_type": ptype,
                "sample_size": count,
                "advertised_rent_min": float(min_rent),
                "advertised_rent_max": float(max_rent),
                "disclaimer": "Advertised rents from current Findora listings. Not a complete market survey and not necessarily the final negotiated rent.",
            }
            for category, ptype, count, min_rent, max_rent in price_rows[:8]
        ],
        "principles": [
            "Public browsing does not require an account.",
            "Only approved listings with sufficiently fresh availability appear as available.",
            "Availability and listing approval are independent states.",
            "We never invent properties to fill search results.",
        ],
    }


@router.get("/config")
def public_config(db: Session = Depends(get_db)):
    amenities = db.execute(
        select(Amenity).where(Amenity.is_active.is_(True)).order_by(Amenity.category, Amenity.name)
    ).scalars().all()
    commercial_uses = db.execute(
        select(CommercialUse).where(CommercialUse.is_active.is_(True)).order_by(CommercialUse.name)
    ).scalars().all()
    counties = db.execute(select(County).order_by(County.name)).scalars().all()
    towns = db.execute(
        select(Town).where(Town.is_active.is_(True)).order_by(Town.name)
    ).scalars().all()
    return {
        "brand": {
            "name": "Findora Spaces",
            "promise": "Find a space yourself, or let us help you find the right one.",
            "launch_market": "Kehancha, Migori County",
            "currency": "KES",
        },
        "property_types": {
            "residential": RESIDENTIAL_TYPES,
            "commercial": COMMERCIAL_TYPES,
        },
        "amenities": [
            {
                "id": a.id,
                "name": a.name,
                "slug": a.slug,
                "category": a.category,
                "applies_to": a.applies_to,
                "icon": a.icon,
            }
            for a in amenities
        ],
        "commercial_uses": [
            {"id": c.id, "name": c.name, "slug": c.slug, "description": c.description}
            for c in commercial_uses
        ],
        "counties": [{"id": c.id, "name": c.name, "code": c.code, "slug": c.slug} for c in counties],
        "towns": [
            {
                "id": t.id,
                "name": t.name,
                "slug": t.slug,
                "latitude": float(t.latitude) if t.latitude is not None else None,
                "longitude": float(t.longitude) if t.longitude is not None else None,
            }
            for t in towns
        ],
        "filters": {
            "sort_options": [
                {"value": "newest", "label": "Newest first"},
                {"value": "rent_low", "label": "Lowest rent"},
                {"value": "rent_high", "label": "Highest rent"},
                {"value": "freshness", "label": "Recently confirmed"},
                {"value": "featured", "label": "Featured"},
                {"value": "popular", "label": "Most viewed"},
            ],
            "verification_filters": [
                {"value": "any", "label": "Any completed verification"},
                {"value": "identity", "label": "Identity verified"},
                {"value": "ownership", "label": "Ownership verified"},
                {"value": "authority", "label": "Authority to list verified"},
                {"value": "inspection", "label": "Physically inspected"},
                {"value": "rent", "label": "Rent confirmed"},
                {"value": "details", "label": "Details confirmed"},
            ],
            "freshness_days": settings.default_freshness_days,
        },
        "map": {
            "style_url": settings.map_tile_style_url,
            "attribution": "© OpenStreetMap contributors. Map tiles provided via OpenFreeMap for development; confirm a production provider before launch.",
        },
        "safety": SAFETY_GUIDANCE,
        "assisted_steps": ASSISTED_STEPS,
    }


@router.get("/market/overview")
def market_overview(
    town_id: str | None = Query(default=None),
    category: str | None = Query(default=None, pattern="^(residential|commercial)$"),
    db: Session = Depends(get_db),
):
    fresh = _fresh_public_conditions()
    conditions = list(fresh)
    if town_id:
        import uuid as _uuid

        conditions.append(Property.location.has(PropertyLocation.town_id == _uuid.UUID(town_id)))
    if category:
        conditions.append(Property.category == category)
    rows = db.execute(
        select(
            Neighbourhood.name,
            Town.name,
            Property.category,
            Property.property_type,
            func.count(Property.id),
            func.min(RentalTerm.rent_amount),
            func.max(RentalTerm.rent_amount),
            func.avg(RentalTerm.rent_amount),
        )
        .join(PropertyLocation, PropertyLocation.property_id == Property.id)
        .join(Town, Town.id == PropertyLocation.town_id)
        .outerjoin(Neighbourhood, Neighbourhood.id == PropertyLocation.neighbourhood_id)
        .join(RentalTerm, RentalTerm.property_id == Property.id)
        .where(*conditions)
        .group_by(Neighbourhood.name, Town.name, Property.category, Property.property_type)
        .order_by(func.count(Property.id).desc())
        .limit(50)
    ).all()
    counts = db.execute(
        select(Property.category, func.count(Property.id))
        .where(*fresh)
        .group_by(Property.category)
    ).all()
    return {
        "overview": {
            "available_total": sum(count for _, count in counts),
            "by_category": {cat: count for cat, count in counts},
            "note": "Based on currently advertised, approved and freshly confirmed Findora listings only. Advertised rent is not the same as a final negotiated rent, and small samples should not be treated as a complete market survey.",
        },
        "rent_ranges": [
            {
                "neighbourhood": neighbourhood,
                "town": town,
                "category": cat,
                "property_type": ptype,
                "advertised_count": count,
                "advertised_rent_min": float(min_rent),
                "advertised_rent_max": float(max_rent),
                "advertised_rent_average": round(float(avg_rent), 0),
                "reliable_sample": count >= 3,
            }
            for neighbourhood, town, cat, ptype, count, min_rent, max_rent, avg_rent in rows
        ],
    }
