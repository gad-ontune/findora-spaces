from __future__ import annotations

import uuid
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import NotFound
from app.models import Amenity, CommercialUse, County, Landmark, Neighbourhood, Town
from app.services import location_service

router = APIRouter(prefix="/locations", tags=["Locations"])


@router.get("/search")
def search(
    q: str = Query(default="", max_length=120),
    type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    return {"results": location_service.search_locations(db, q, type, limit)}


@router.get("/options")
def options(db: Session = Depends(get_db)):
    return location_service.filter_options(db)


@router.get("/nearby")
def nearby(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_km: float = Query(default=5, ge=0.5, le=100),
    db: Session = Depends(get_db),
):
    return {"results": location_service.nearby(db, lat, lng, radius_km)}


@router.get("/{location_id}/children")
def children(
    location_id: uuid.UUID,
    type: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return location_service.children(db, location_id, type)


@router.get("/{location_id}")
def get_location(
    location_id: uuid.UUID,
    type: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    result = location_service.resolve_location(db, location_id, type)
    if result is None:
        raise NotFound("Location not found.")
    return {"location": result}


@router.get("/{location_id}/landmarks")
def landmarks(
    location_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(Landmark).where(Landmark.town_id == location_id).order_by(Landmark.name)
    ).scalars().all()
    return {
        "landmarks": [
            {
                "id": row.id,
                "name": row.name,
                "category": row.category,
                "latitude": float(row.latitude) if row.latitude is not None else None,
                "longitude": float(row.longitude) if row.longitude is not None else None,
                "source": row.source,
            }
            for row in rows
        ]
    }


@router.get("/{town_id}/neighbourhoods")
def neighbourhoods(town_id: uuid.UUID, db: Session = Depends(get_db)):
    rows = db.execute(
        select(Neighbourhood).where(Neighbourhood.town_id == town_id).order_by(Neighbourhood.name)
    ).scalars().all()
    return {
        "neighbourhoods": [
            {
                "id": row.id,
                "name": row.name,
                "slug": row.slug,
                "description": row.description,
                "latitude": float(row.latitude) if row.latitude is not None else None,
                "longitude": float(row.longitude) if row.longitude is not None else None,
            }
            for row in rows
        ]
    }
