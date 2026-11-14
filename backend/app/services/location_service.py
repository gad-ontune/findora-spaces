from __future__ import annotations

import uuid
from decimal import Decimal

from geoalchemy2 import Geography
from geoalchemy2.elements import WKTElement
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFound
from app.models import (
    County,
    Landmark,
    Locality,
    LocationAlias,
    Neighbourhood,
    SubCounty,
    Town,
)


def point_wkt(lat: float | Decimal | None, lng: float | Decimal | None) -> WKTElement | None:
    if lat is None or lng is None:
        return None
    return WKTElement(f"POINT({float(lng)} {float(lat)})", srid=4326)


def _location_dict(obj, location_type: str, context: str | None = None) -> dict:
    lat = getattr(obj, "latitude", None)
    lng = getattr(obj, "longitude", None)
    return {
        "id": obj.id,
        "type": location_type,
        "name": obj.name,
        "slug": getattr(obj, "slug", None),
        "context": context,
        "latitude": float(lat) if lat is not None else None,
        "longitude": float(lng) if lng is not None else None,
        "description": getattr(obj, "description", None),
    }


def search_locations(db: Session, query: str, location_type: str | None = None, limit: int = 20) -> list[dict]:
    term = f"%{query.strip()}%"
    results: list[dict] = []
    if not query.strip():
        return results

    if location_type in (None, "county"):
        rows = db.execute(
            select(County).where(County.name.ilike(term)).order_by(County.name).limit(limit)
        ).scalars().all()
        results.extend(_location_dict(c, "county") for c in rows)
    if location_type in (None, "sub_county"):
        rows = db.execute(
            select(SubCounty)
            .options(joinedload(SubCounty.county))
            .where(SubCounty.name.ilike(term))
            .limit(limit)
        ).scalars().all()
        results.extend(_location_dict(s, "sub_county", s.county.name if s.county else None) for s in rows)
    if location_type in (None, "town"):
        rows = db.execute(
            select(Town)
            .options(joinedload(Town.sub_county).joinedload(SubCounty.county))
            .where(Town.name.ilike(term), Town.is_active.is_(True))
            .order_by(Town.name)
            .limit(limit)
        ).scalars().all()
        results.extend(
            _location_dict(
                t,
                "town",
                f"{t.sub_county.name}, {t.sub_county.county.name}"
                if t.sub_county and t.sub_county.county
                else None,
            )
            for t in rows
        )
    if location_type in (None, "neighbourhood"):
        rows = db.execute(
            select(Neighbourhood)
            .options(joinedload(Neighbourhood.town))
            .where(Neighbourhood.name.ilike(term))
            .limit(limit)
        ).scalars().all()
        results.extend(_location_dict(n, "neighbourhood", n.town.name if n.town else None) for n in rows)
    if location_type in (None, "locality"):
        rows = db.execute(
            select(Locality).where(Locality.name.ilike(term)).limit(limit)
        ).scalars().all()
        results.extend(_location_dict(loc, "locality") for loc in rows)
    if location_type in (None, "landmark"):
        rows = db.execute(
            select(Landmark)
            .options(joinedload(Landmark.town))
            .where(Landmark.name.ilike(term))
            .limit(limit)
        ).scalars().all()
        results.extend(
            {
                **_location_dict(lm, "landmark", lm.town.name if lm.town else None),
                "category": lm.category,
            }
            for lm in rows
        )

    # Alias matches are resolved to their canonical location.
    aliases = db.execute(
        select(LocationAlias)
        .where(LocationAlias.normalized_alias.ilike(term))
        .limit(limit)
    ).scalars().all()
    seen = {str(r["id"]) for r in results}
    for alias in aliases:
        if str(alias.location_id) in seen:
            continue
        resolved = resolve_location(db, alias.location_id, alias.location_type)
        if resolved:
            resolved["context"] = (resolved.get("context") or "") + f" · also “{alias.alias}”"
            results.append(resolved)
            seen.add(str(alias.location_id))

    lowered = query.strip().lower()
    results.sort(
        key=lambda r: (
            0 if (r["name"] or "").lower() == lowered else 1,
            0 if (r["name"] or "").lower().startswith(lowered) else 1,
            r["name"],
        )
    )
    return results[:limit]


def resolve_location(db: Session, location_id: uuid.UUID, location_type: str | None = None) -> dict | None:
    if location_type in (None, "county"):
        obj = db.get(County, location_id)
        if obj:
            return _location_dict(obj, "county")
    if location_type in (None, "sub_county"):
        obj = db.get(SubCounty, location_id)
        if obj:
            return _location_dict(obj, "sub_county")
    if location_type in (None, "town"):
        obj = db.get(Town, location_id)
        if obj:
            return _location_dict(
                obj,
                "town",
                f"{obj.sub_county.county.name}" if obj.sub_county and obj.sub_county.county else None,
            )
    if location_type in (None, "neighbourhood"):
        obj = db.get(Neighbourhood, location_id)
        if obj:
            return _location_dict(obj, "neighbourhood", obj.town.name if obj.town else None)
    if location_type in (None, "locality"):
        obj = db.get(Locality, location_id)
        if obj:
            return _location_dict(obj, "locality")
    if location_type in (None, "landmark"):
        obj = db.get(Landmark, location_id)
        if obj:
            return {
                **_location_dict(obj, "landmark", obj.town.name if obj.town else None),
                "category": obj.category,
            }
    return None


def children(db: Session, location_id: uuid.UUID, location_type: str | None = None) -> dict:
    resolved = resolve_location(db, location_id, location_type)
    if resolved is None:
        raise NotFound("Location not found.")
    kind = resolved["type"]
    if kind == "county":
        sub_counties = db.execute(
            select(SubCounty).where(SubCounty.county_id == location_id).order_by(SubCounty.name)
        ).scalars().all()
        towns = db.execute(
            select(Town)
            .join(SubCounty)
            .where(SubCounty.county_id == location_id, Town.is_active.is_(True))
            .order_by(Town.name)
        ).scalars().all()
        return {
            "location": resolved,
            "children": [
                *[_location_dict(s, "sub_county") for s in sub_counties],
                *[_location_dict(t, "town") for t in towns],
            ],
        }
    if kind == "town":
        neighbourhoods = db.execute(
            select(Neighbourhood).where(Neighbourhood.town_id == location_id).order_by(Neighbourhood.name)
        ).scalars().all()
        landmarks = db.execute(
            select(Landmark).where(Landmark.town_id == location_id).order_by(Landmark.name)
        ).scalars().all()
        return {
            "location": resolved,
            "children": [
                *[_location_dict(n, "neighbourhood") for n in neighbourhoods],
                *[_location_dict(lm, "landmark") for lm in landmarks],
            ],
        }
    if kind == "neighbourhood":
        landmarks = db.execute(
            select(Landmark).where(Landmark.neighbourhood_id == location_id).order_by(Landmark.name)
        ).scalars().all()
        return {"location": resolved, "children": [_location_dict(lm, "landmark") for lm in landmarks]}
    return {"location": resolved, "children": []}


def nearby(db: Session, lat: float, lng: float, radius_km: float = 5, limit: int = 20) -> list[dict]:
    radius_m = max(100, min(radius_km, 100) * 1000)
    point = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326).cast(Geography())
    results: list[dict] = []
    towns = db.execute(
        select(Town)
        .where(Town.geom.isnot(None), func.ST_DWithin(Town.geom, point, radius_m))
        .limit(limit)
    ).scalars().all()
    results.extend(_location_dict(t, "town") for t in towns)
    neighbourhoods = db.execute(
        select(Neighbourhood)
        .where(Neighbourhood.geom.isnot(None), func.ST_DWithin(Neighbourhood.geom, point, radius_m))
        .limit(limit)
    ).scalars().all()
    results.extend(_location_dict(n, "neighbourhood") for n in neighbourhoods)
    landmarks = db.execute(
        select(Landmark)
        .where(Landmark.geom.isnot(None), func.ST_DWithin(Landmark.geom, point, radius_m))
        .limit(limit)
    ).scalars().all()
    results.extend(_location_dict(lm, "landmark") for lm in landmarks)
    return results


def filter_options(db: Session) -> dict:
    counties = db.execute(select(County).order_by(County.name)).scalars().all()
    towns = db.execute(
        select(Town)
        .options(joinedload(Town.sub_county).joinedload(SubCounty.county))
        .where(Town.is_active.is_(True))
        .order_by(Town.name)
    ).scalars().all()
    return {
        "counties": [
            {
                "id": c.id,
                "name": c.name,
                "slug": c.slug,
                "code": c.code,
            }
            for c in counties
        ],
        "towns": [
            {
                "id": t.id,
                "name": t.name,
                "slug": t.slug,
                "county": t.sub_county.county.name if t.sub_county and t.sub_county.county else None,
                "county_id": t.sub_county.county_id if t.sub_county else None,
                "sub_county": t.sub_county.name if t.sub_county else None,
                "latitude": float(t.latitude) if t.latitude is not None else None,
                "longitude": float(t.longitude) if t.longitude is not None else None,
            }
            for t in towns
        ],
    }
