from __future__ import annotations

import json
import secrets
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user, require_permissions
from app.core.exceptions import Conflict, Forbidden, NotFound, ValidationError
from app.core.permissions import P
from app.models import (
    Favourite,
    Notification,
    Property,
    PropertyComparison,
    PropertyEnquiry,
    SavedSearch,
    SearchRequest,
    SharedShortlist,
    ShortlistComment,
    ShortlistMember,
    User,
    Viewing,
)
from app.models.base import PropertyStatus
from app.schemas.payloads import (
    ComparisonIn,
    FavouriteIn,
    SavedSearchIn,
    ShortlistCommentIn,
    ShortlistIn,
)
from app.services import property_service
from app.services.property_service import base_property_query, load_property
from app.services.serializers import (
    json_load,
    property_summary,
    shortlist_payload,
    utcnow,
)

router = APIRouter(tags=["Seeker"])


def _public_property(db: Session, property_id: uuid.UUID) -> Property:
    prop = load_property(db, property_id)
    if not property_service.is_publicly_visible(prop):
        raise NotFound("Property not found.")
    return prop


# ── Favourites ───────────────────────────────────────────────────────────────


@router.get("/favourites")
def list_favourites(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(Favourite)
        .where(Favourite.user_id == user.id)
        .order_by(Favourite.created_at.desc())
    ).scalars().all()
    props = []
    for row in rows:
        prop = db.execute(
            base_property_query().where(Property.id == row.property_id)
        ).scalar_one_or_none()
        if prop is not None:
            props.append(
                {**property_summary(prop), "favourite_id": row.id, "saved_at": row.created_at}
            )
    return {"properties": props, "count": len(props)}


@router.post("/favourites", status_code=201)
def add_favourite(
    payload: FavouriteIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.FAVOURITE_MANAGE)),
):
    prop = _public_property(db, uuid.UUID(payload.property_id))
    existing = db.execute(
        select(Favourite).where(
            Favourite.user_id == user.id, Favourite.property_id == prop.id
        )
    ).scalar_one_or_none()
    if existing:
        return {"favourite_id": existing.id, "message": "Property is already in your favourites."}
    favourite = Favourite(user_id=user.id, property_id=prop.id)
    db.add(favourite)
    db.commit()
    db.refresh(favourite)
    return {"favourite_id": favourite.id, "message": "Property saved."}


@router.delete("/favourites/{favourite_id}", status_code=204)
def remove_favourite(
    favourite_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.FAVOURITE_MANAGE)),
):
    favourite = db.get(Favourite, favourite_id)
    if favourite is None or favourite.user_id != user.id:
        raise NotFound("Favourite not found.")
    db.delete(favourite)
    db.commit()
    return None


# ── Comparison ───────────────────────────────────────────────────────────────


def _comparison_fields(prop: Property) -> dict:
    summary = property_summary(prop)
    location = summary.get("location") or {}
    return {
        "id": prop.id,
        "reference": prop.reference,
        "title": prop.title,
        "property_type": prop.property_type,
        "category": prop.category,
        "rent": summary["rent_amount"],
        "deposit": summary["deposit_amount"],
        "move_in_total": summary["move_in_cost"]["initial_total"],
        "bedrooms": summary["bedrooms"],
        "bathrooms": summary["bathrooms"],
        "floor_area_sqm": summary["floor_area_sqm"],
        "rent_period": summary["rent_period"],
        "furnishing": summary["furnishing"],
        "amenities": [a["name"] for a in summary["amenities"]],
        "verification_level": summary["verification"]["level"],
        "verified_count": summary["verification"]["verified_count"],
        "last_confirmed_available_at": summary["last_confirmed_available_at"],
        "is_fresh": summary["is_fresh"],
        "neighbourhood": location.get("neighbourhood"),
        "town": location.get("town"),
        "landmark": location.get("landmark"),
        "distance_to_landmark_km": location.get("distance_to_landmark_km"),
        "primary_image": summary["primary_image"],
        "commercial_uses": [c["name"] for c in summary["commercial_uses"]],
    }


def _trade_offs(items: list[dict]) -> list[str]:
    from datetime import UTC, datetime

    notes: list[str] = []
    if not items:
        return notes
    cheapest = min(items, key=lambda x: x["rent"] or float("inf"))
    priciest = max(items, key=lambda x: x["rent"] or 0)
    if cheapest["rent"] != priciest["rent"]:
        notes.append(
            f"{cheapest['title']} has the lowest advertised rent at KES {cheapest['rent']:,.0f}"
            + (
                f", KES {(priciest['rent'] or 0) - (cheapest['rent'] or 0):,.0f} less than {priciest['title']}."
                if priciest["rent"] and cheapest["rent"]
                else "."
            )
        )
    with_distance = [x for x in items if x.get("distance_to_landmark_km") is not None]
    if with_distance:
        closest = min(with_distance, key=lambda x: x["distance_to_landmark_km"])
        notes.append(
            f"{closest['title']} is closest to the selected landmark (about {closest['distance_to_landmark_km']} km)."
        )
    freshest = max(
        items,
        key=lambda x: x["last_confirmed_available_at"] or datetime.min.replace(tzinfo=UTC),
    )
    notes.append(
        f"{freshest['title']} has the most recent availability confirmation. Always reconfirm before paying."
    )
    largest = max(items, key=lambda x: x["floor_area_sqm"] or 0)
    if largest.get("floor_area_sqm"):
        notes.append(f"{largest['title']} has the largest recorded floor area.")
    most_verified = max(items, key=lambda x: x["verified_count"])
    notes.append(
        f"{most_verified['title']} has the most completed verification checks ({most_verified['verified_count']}). "
        "Each check remains independent — review what was and was not verified."
    )
    return notes[:6]


@router.post("/comparisons")
def compare_properties(
    payload: ComparisonIn,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    ids = [uuid.UUID(pid) for pid in payload.property_ids]
    props = [db.execute(base_property_query().where(Property.id == pid)).scalar_one_or_none() for pid in ids]
    if any(p is None or not property_service.is_publicly_visible(p) for p in props):
        raise NotFound("One or more selected properties are not available for comparison.")
    items = [_comparison_fields(p) for p in props if p is not None]
    comparison = {
        "name": payload.name or "Property comparison",
        "properties": items,
        "trade_offs": _trade_offs(items),
        "note": "Advertised rents are not necessarily final negotiated rents. Confirm all costs and availability directly.",
    }
    if user:
        record = PropertyComparison(
            user_id=user.id,
            property_ids=json.dumps([str(pid) for pid in ids]),
            name=comparison["name"],
        )
        db.add(record)
        db.commit()
        comparison["id"] = record.id
    return comparison


@router.get("/comparisons")
def list_comparisons(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(PropertyComparison)
        .where(PropertyComparison.user_id == user.id)
        .order_by(PropertyComparison.created_at.desc())
    ).scalars().all()
    output = []
    for row in rows:
        ids = json_load(row.property_ids, [])
        props = []
        for pid in ids:
            prop = db.execute(
                base_property_query().where(Property.id == uuid.UUID(pid))
            ).scalar_one_or_none()
            if prop is not None:
                props.append(_comparison_fields(prop))
        output.append(
            {
                "id": row.id,
                "name": row.name,
                "created_at": row.created_at,
                "properties": props,
                "trade_offs": _trade_offs(props),
            }
        )
    return {"comparisons": output}


# ── Shared shortlists ────────────────────────────────────────────────────────


def _load_shortlist(db: Session, shortlist_id: uuid.UUID) -> SharedShortlist:
    shortlist = db.execute(
        select(SharedShortlist)
        .options(
            selectinload(SharedShortlist.members).joinedload(ShortlistMember.property),
            selectinload(SharedShortlist.comments),
        )
        .where(SharedShortlist.id == shortlist_id)
    ).scalar_one_or_none()
    if shortlist is None:
        raise NotFound("Shortlist not found.")
    return shortlist


@router.get("/shortlists")
def list_shortlists(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(SharedShortlist)
        .options(
            selectinload(SharedShortlist.members).joinedload(ShortlistMember.property),
            selectinload(SharedShortlist.comments),
        )
        .where(SharedShortlist.user_id == user.id)
        .order_by(SharedShortlist.created_at.desc())
    ).scalars().all()
    return {"shortlists": [shortlist_payload(s) for s in rows]}


@router.post("/shortlists", status_code=201)
def create_shortlist(
    payload: ShortlistIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permissions(P.FAVOURITE_MANAGE)),
):
    shortlist = SharedShortlist(
        user_id=user.id,
        token=secrets.token_urlsafe(24),
        name=payload.name,
        description=payload.description,
    )
    for position, pid in enumerate(payload.property_ids):
        prop = _public_property(db, uuid.UUID(pid))
        shortlist.members.append(ShortlistMember(property_id=prop.id, position=position))
    db.add(shortlist)
    db.commit()
    db.refresh(shortlist)
    return {
        "shortlist": shortlist_payload(shortlist),
        "share_url": f"/shortlist/{shortlist.token}",
    }


@router.get("/shortlists/shared/{token}")
def get_shared_shortlist(token: str, db: Session = Depends(get_db)):
    shortlist = db.execute(
        select(SharedShortlist)
        .options(
            selectinload(SharedShortlist.members).joinedload(ShortlistMember.property),
            selectinload(SharedShortlist.comments),
        )
        .where(SharedShortlist.token == token, SharedShortlist.is_active.is_(True))
    ).scalar_one_or_none()
    if shortlist is None:
        raise NotFound("This shared shortlist is unavailable.")
    return {"shortlist": shortlist_payload(shortlist, include_comments=True)}


@router.post("/shortlists/shared/{token}/comments", status_code=201)
def comment_on_shortlist(
    token: str,
    payload: ShortlistCommentIn,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    shortlist = db.execute(
        select(SharedShortlist).where(
            SharedShortlist.token == token, SharedShortlist.is_active.is_(True)
        )
    ).scalar_one_or_none()
    if shortlist is None:
        raise NotFound("This shared shortlist is unavailable.")
    comment = ShortlistComment(
        shortlist_id=shortlist.id,
        user_id=user.id if user else None,
        author_name=payload.author_name or (user.name if user else "Guest"),
        body=payload.body,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {
        "comment": {
            "id": comment.id,
            "author_name": comment.author_name,
            "body": comment.body,
            "created_at": comment.created_at,
        }
    }


@router.get("/shortlists/{shortlist_id}")
def get_shortlist(
    shortlist_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    shortlist = _load_shortlist(db, shortlist_id)
    if shortlist.user_id != user.id:
        raise Forbidden("You do not have access to this shortlist.")
    return {"shortlist": shortlist_payload(shortlist)}


@router.delete("/shortlists/{shortlist_id}", status_code=204)
def delete_shortlist(
    shortlist_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    shortlist = _load_shortlist(db, shortlist_id)
    if shortlist.user_id != user.id:
        raise Forbidden("You do not have access to this shortlist.")
    db.delete(shortlist)
    db.commit()
    return None


# ── Saved searches ───────────────────────────────────────────────────────────


@router.get("/saved-searches")
def list_saved_searches(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(SavedSearch)
        .where(SavedSearch.user_id == user.id)
        .order_by(SavedSearch.created_at.desc())
    ).scalars().all()
    return {
        "saved_searches": [
            {
                "id": row.id,
                "name": row.name,
                "category": row.category,
                "filters": json_load(row.filters, {}),
                "notify": row.notify,
                "created_at": row.created_at,
            }
            for row in rows
        ]
    }


@router.post("/saved-searches", status_code=201)
def create_saved_search(
    payload: SavedSearchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = SavedSearch(
        user_id=user.id,
        name=payload.name,
        category=payload.category,
        filters=json.dumps(payload.filters),
        notify=payload.notify,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "message": "Search saved."}


@router.delete("/saved-searches/{search_id}", status_code=204)
def delete_saved_search(
    search_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(SavedSearch, search_id)
    if row is None or row.user_id != user.id:
        raise NotFound("Saved search not found.")
    db.delete(row)
    db.commit()
    return None


# ── Seeker dashboard overview ────────────────────────────────────────────────


@router.get("/seeker/overview")
def seeker_overview(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    favourites = db.execute(
        select(Favourite).where(Favourite.user_id == user.id)
    ).scalars().all()
    enquiries = db.execute(
        select(PropertyEnquiry).where(PropertyEnquiry.seeker_id == user.id)
    ).scalars().all()
    requests = db.execute(
        select(SearchRequest).where(SearchRequest.user_id == user.id)
    ).scalars().all()
    viewings = db.execute(
        select(Viewing).where(Viewing.seeker_id == user.id)
    ).scalars().all()
    unread = db.execute(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    ).scalars().all()
    return {
        "overview": {
            "saved_properties": len(favourites),
            "enquiries": len(enquiries),
            "assisted_requests": len(requests),
            "active_requests": len(
                [r for r in requests if r.status not in {"completed", "cancelled"}]
            ),
            "viewings": len(viewings),
            "upcoming_viewings": len(
                [v for v in viewings if v.status in {"requested", "proposed", "confirmed"}]
            ),
            "unread_notifications": len(unread),
            "profile_complete": bool(user.phone_verified_at and user.profile),
        }
    }
