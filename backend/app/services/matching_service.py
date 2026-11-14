from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Property, RequestMatch, SearchRequest
from app.models.base import PropertyStatus
from app.services.property_service import base_property_query
from app.services.serializers import (
    amenity_list,
    day_age,
    effective_availability,
    freshness_days,
    haversine_km,
    is_fresh,
    json_load,
    property_summary,
)


def _age_days(dt: datetime | None) -> int:
    if not dt:
        return 999
    aware = dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    return max(0, (datetime.now(UTC) - aware).days)


def _budget_score(rent: float, minimum: float | None, maximum: float) -> tuple[float, list[str], list[str]]:
    positives: list[str] = []
    negatives: list[str] = []
    if rent > maximum:
        over = rent - maximum
        return max(0, 70 - (over / maximum) * 100), positives, [
            f"KES {over:,.0f} above your maximum budget"
        ]
    if minimum and rent < minimum:
        negatives.append("Below your stated minimum budget — confirm it suits your needs")
        return 75, positives, negatives
    if rent <= maximum * 0.8:
        positives.append(f"Within your budget at KES {rent:,.0f} per month")
        return 100, positives, negatives
    positives.append(f"Within your budget at KES {rent:,.0f} per month")
    return 88, positives, negatives


def _location_context(prop: Property, request: SearchRequest) -> tuple[float, list[str]]:
    if request.landmark and request.landmark.latitude is not None and prop.location and prop.location.latitude_public is not None:
        distance = haversine_km(
            float(request.landmark.latitude),
            float(request.landmark.longitude),
            float(prop.location.latitude_public),
            float(prop.location.longitude_public),
        )
        if distance <= 2:
            return 100, [f"About {distance:.1f} km from {request.landmark.name}"]
        if distance <= 5:
            return 80, [f"About {distance:.1f} km from {request.landmark.name}"]
        if distance <= 10:
            return 55, [f"About {distance:.1f} km from {request.landmark.name}"]
        return 25, [f"About {distance:.1f} km from {request.landmark.name}"]
    if request.neighbourhood and prop.location and prop.location.neighbourhood_id == request.neighbourhood_id:
        return 100, [f"In {request.neighbourhood.name}, the neighbourhood you selected"]
    if prop.location and prop.location.town and request.town and prop.location.town_id == request.town_id:
        return 85, [f"In {prop.location.town.name}"]
    return 40, ["Outside your preferred town — included as an alternative"]


def _amenity_score(prop: Property, facilities: list[str]) -> tuple[float, list[str], list[str]]:
    if not facilities:
        return 100, [], []
    present = {a["slug"] for a in amenity_list(prop)}
    matched = [f for f in facilities if f in present]
    missing = [f for f in facilities if f not in present]
    score = 100 * len(matched) / len(facilities)
    positives = [f"Includes {m.replace('_', ' ')}" for m in matched[:4]]
    negatives = [f"Missing {m.replace('_', ' ')}" for m in missing[:4]]
    return score, positives, negatives


def _residential_score(prop: Property, request: SearchRequest) -> tuple[float, dict[str, float], list[str], list[str], list[str]]:
    positives: list[str] = []
    negatives: list[str] = []
    unmet: list[str] = []
    terms = prop.rental_terms
    rent = float(terms.rent_amount) if terms else 0
    budget, p, n = _budget_score(
        rent, float(request.budget_min) if request.budget_min else None, float(request.budget_max)
    )
    positives += p
    negatives += n
    if rent > float(request.budget_max):
        unmet.append("Rent is above your maximum budget")

    loc, location_notes = _location_context(prop, request)
    positives += [note for note in location_notes if not note.startswith("Outside")]
    negatives += [note for note in location_notes if note.startswith("Outside")]
    if loc < 60:
        unmet.append("Location is outside your preferred area")

    exact_type = bool(request.property_type and prop.property_type.lower() == request.property_type.lower())
    type_score = 100 if exact_type or not request.property_type else 60
    if request.property_type:
        if exact_type:
            positives.append(f"Matches your preferred type: {prop.property_type}")
        else:
            negatives.append(f"Property type is {prop.property_type}, not {request.property_type}")
            unmet.append("Property type differs")

    amenities, p, n = _amenity_score(prop, json_load(request.facilities, []))
    positives += p
    negatives += n
    for missing in [x for x in json_load(request.facilities, []) if x not in {a['slug'] for a in amenity_list(prop)}]:
        unmet.append(f"Missing {missing.replace('_', ' ')}")

    age = _age_days(prop.last_confirmed_available_at)
    window = freshness_days(prop)
    freshness = max(0, 100 - (age / max(1, window)) * 100)
    positives.append(
        f"Availability confirmed {age} day{'s' if age != 1 else ''} ago"
    )

    detail = prop.residential_detail
    if detail and detail.bedrooms is not None:
        positives.append(f"{detail.bedrooms} bedroom{'s' if detail.bedrooms != 1 else ''}")
    if request.bedrooms_min and detail and (detail.bedrooms or 0) < request.bedrooms_min:
        negatives.append("Fewer bedrooms than requested")
        unmet.append("Bedrooms below requirement")

    breakdown = {
        "location": round(loc * 0.30, 1),
        "budget": round(budget * 0.25, 1),
        "property_type": round(type_score * 0.20, 1),
        "amenities": round(amenities * 0.15, 1),
        "freshness": round(freshness * 0.10, 1),
    }
    total = sum(breakdown.values())
    return total, breakdown, positives, negatives, unmet


def _commercial_score(prop: Property, request: SearchRequest) -> tuple[float, dict[str, float], list[str], list[str], list[str]]:
    positives: list[str] = []
    negatives: list[str] = []
    unmet: list[str] = []
    detail = prop.commercial_detail
    terms = prop.rental_terms
    rent = float(terms.rent_amount) if terms else 0
    budget, p, n = _budget_score(
        rent, float(request.budget_min) if request.budget_min else None, float(request.budget_max)
    )
    positives += p
    negatives += n
    if rent > float(request.budget_max):
        unmet.append("Rent is above your maximum budget")

    # Business use suitability
    use_names = [pc.commercial_use.name.lower() for pc in prop.commercial_uses if pc.commercial_use]
    business = (request.business_type or "").lower().strip()
    use_score = 80
    if business and use_names:
        if any(business in name or name in business for name in use_names):
            use_score = 100
            positives.append(f"Listed for {business} use — confirm licensing with the relevant authority")
        else:
            use_score = 40
            negatives.append(f"Listed uses: {', '.join(use_names)}")
            unmet.append("Business use may not match")
    floor = float(detail.floor_area_sqm) if detail and detail.floor_area_sqm else None
    area_score = 80
    if request.floor_area_min:
        if floor and floor >= float(request.floor_area_min):
            area_score = 100
            positives.append(f"{floor:,.0f} m² floor area")
        elif floor:
            area_score = 30
            negatives.append(f"{floor:,.0f} m² is below your {float(request.floor_area_min):,.0f} m² requirement")
            unmet.append("Floor area below requirement")
    front = float(detail.frontage_m) if detail and detail.frontage_m else None
    front_score = 80
    if request.frontage_min:
        if front and front >= float(request.frontage_min):
            front_score = 100
            positives.append(f"{front:,.1f} m frontage")
        elif front:
            front_score = 30
            negatives.append("Frontage below your requirement")
            unmet.append("Frontage below requirement")

    access_score = 75
    if detail and detail.loading_access and request.loading_required:
        access_score = 100
        positives.append("Loading access available")
    elif request.loading_required:
        access_score = 30
        negatives.append("No loading access recorded")
        unmet.append("Loading access not available")
    if detail and detail.accessibility:
        positives.append(f"Accessibility: {detail.accessibility}")

    amenity_slugs = {a["slug"] for a in amenity_list(prop)}
    utility_needed = {"water", "electricity"} & set(json_load(request.facilities, []))
    utility_score = 100 * (len(utility_needed & amenity_slugs) / len(utility_needed)) if utility_needed else 85
    if utility_needed:
        missing_utilities = utility_needed - amenity_slugs
        for missing in missing_utilities:
            negatives.append(f"{missing.replace('_', ' ').title()} not recorded")
            unmet.append(f"{missing.replace('_', ' ').title()} not recorded")

    loc, location_notes = _location_context(prop, request)
    positives += [note for note in location_notes if not note.startswith("Outside")]
    negatives += [note for note in location_notes if note.startswith("Outside")]

    age = _age_days(prop.last_confirmed_available_at)
    window = freshness_days(prop)
    freshness = max(0, 100 - (age / max(1, window)) * 100)
    positives.append(f"Availability confirmed {age} days ago")

    breakdown = {
        "business_use": round(use_score * 0.25, 1),
        "floor_area": round(area_score * 0.20, 1),
        "frontage": round(front_score * 0.10, 1),
        "accessibility": round(access_score * 0.10, 1),
        "utilities": round(utility_score * 0.10, 1),
        "budget": round(budget * 0.10, 1),
        "location": round(loc * 0.10, 1),
        "freshness": round(freshness * 0.05, 1),
    }
    return sum(breakdown.values()), breakdown, positives, negatives, unmet


def _passes_hard_filters(prop: Property, request: SearchRequest, *, relaxed: bool = False) -> bool:
    if prop.category != request.category:
        return False
    if prop.status != PropertyStatus.APPROVED.value or effective_availability(prop) != "available" or not is_fresh(prop):
        return False
    terms = prop.rental_terms
    if not terms:
        return False
    rent = float(terms.rent_amount)
    max_budget = float(request.budget_max) * (1.2 if relaxed else 1.0)
    if rent > max_budget:
        return False
    if not relaxed and request.town_id and (not prop.location or prop.location.town_id != request.town_id):
        return False
    if not relaxed and request.property_type:
        if request.property_type.lower() not in prop.property_type.lower():
            return False
    if not relaxed and request.bedrooms_min and prop.residential_detail:
        if (prop.residential_detail.bedrooms or 0) < request.bedrooms_min:
            return False
    if not relaxed:
        present = {a["slug"] for a in amenity_list(prop)}
        if any(f not in present for f in json_load(request.facilities, [])):
            return False
        if request.loading_required and prop.commercial_detail and not prop.commercial_detail.loading_access:
            return False
        if request.floor_area_min and prop.commercial_detail:
            if (prop.commercial_detail.floor_area_sqm or 0) < request.floor_area_min:
                return False
    return True


def compute_matches(db: Session, request: SearchRequest, limit: int = 10) -> dict[str, Any]:
    query = (
        base_property_query()
        .where(
            Property.category == request.category,
            Property.status == PropertyStatus.APPROVED.value,
            Property.deleted_at.is_(None),
            Property.availability_status == "available",
            Property.last_confirmed_available_at.is_not(None),
        )
        .limit(500)
    )
    candidates = db.execute(query).scalars().unique().all()
    strict = [p for p in candidates if _passes_hard_filters(p, request, relaxed=False)]
    relaxed = [p for p in candidates if p not in strict and _passes_hard_filters(p, request, relaxed=True)]
    if len(strict) < 3:
        pool = strict + [p for p in relaxed if p not in strict][: max(0, limit - len(strict))]
    else:
        pool = strict

    scored: list[dict[str, Any]] = []
    for prop in pool:
        if request.category == "residential":
            score, breakdown, positives, negatives, unmet = _residential_score(prop, request)
        else:
            score, breakdown, positives, negatives, unmet = _commercial_score(prop, request)
        scored.append(
            {
                "property": prop,
                "score": round(min(100.0, max(0.0, score)), 2),
                "breakdown": breakdown,
                "positives": list(dict.fromkeys(positives))[:6],
                "negatives": list(dict.fromkeys(negatives))[:6],
                "unmet": list(dict.fromkeys(unmet)),
                "is_alternative": prop not in strict,
            }
        )
    scored.sort(key=lambda m: (m["is_alternative"], -m["score"]))
    scored = scored[:limit]

    restrictions: list[str] = []
    if not strict:
        if request.town_id:
            restrictions.append("Location — no available matching property in the selected town")
        if request.budget_max:
            restrictions.append("Budget — available properties are above your maximum")
        if json_load(request.facilities, []):
            restrictions.append("Facilities — one or more required facilities are unavailable")
        if request.property_type:
            restrictions.append("Property type — no exact type match is currently available")
    if not candidates:
        restrictions.append("Availability — no genuinely available approved stock matches this category")

    message = (
        "We found suitable available properties."
        if scored
        else "There are no genuine matches in the current database. We can investigate locally rather than invent a listing."
    )
    return {
        "matches": scored,
        "strict_count": len(strict),
        "alternative_count": max(0, len(pool) - len(strict)),
        "restrictions": restrictions,
        "message": message,
        "weights": {
            "residential": {
                "location": 30,
                "budget": 25,
                "property_type": 20,
                "amenities": 15,
                "freshness": 10,
            },
            "commercial": {
                "business_use": 25,
                "floor_area": 20,
                "frontage": 10,
                "accessibility": 10,
                "utilities": 10,
                "budget": 10,
                "location": 10,
                "freshness": 5,
            },
        }[request.category],
    }


def match_public_payload(scored: list[dict[str, Any]], alternatives: bool = True) -> list[dict[str, Any]]:
    results = []
    for item in scored:
        if not alternatives and item["is_alternative"]:
            continue
        results.append(
            {
                "property": property_summary(item["property"]),
                "score": item["score"],
                "explanation": {
                    "positives": item["positives"],
                    "negatives": item["negatives"],
                    "unmet_requirements": item["unmet"],
                    "score_breakdown": item["breakdown"],
                },
                "is_alternative": item["is_alternative"],
            }
        )
    return results


def persist_matches(db: Session, request: SearchRequest, scored: list[dict[str, Any]], actor_id=None) -> list[RequestMatch]:
    created: list[RequestMatch] = []
    for item in scored:
        prop = item["property"]
        existing = next(
            (m for m in request.matches if m.property_id == prop.id and m.stage == "database"),
            None,
        )
        if existing:
            existing.score = item["score"]
            existing.explanation = json.dumps(
                {
                    "positives": item["positives"],
                    "negatives": item["negatives"],
                    "unmet_requirements": item["unmet"],
                    "score_breakdown": item["breakdown"],
                }
            )
            created.append(existing)
            continue
        match = RequestMatch(
            request_id=request.id,
            property_id=prop.id,
            title=prop.title,
            description=prop.description[:1000],
            rent_amount=prop.rental_terms.rent_amount if prop.rental_terms else None,
            location_text=prop.location.town.name if prop.location and prop.location.town else None,
            score=item["score"],
            explanation=json.dumps(
                {
                    "positives": item["positives"],
                    "negatives": item["negatives"],
                    "unmet_requirements": item["unmet"],
                    "score_breakdown": item["breakdown"],
                }
            ),
            stage="database",
            status="suggested",
            created_by_id=actor_id,
        )
        db.add(match)
        request.matches.append(match)
        created.append(match)
    db.flush()
    return created
