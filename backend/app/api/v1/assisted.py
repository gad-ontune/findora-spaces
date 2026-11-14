from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user, require_permissions
from app.core.exceptions import Forbidden, NotFound, UnprocessableState
from app.core.permissions import P
from app.core.rate_limit import RateLimiter
from app.models import RequestMatch, SearchRequest, User
from app.models.base import SearchRequestStatus
from app.schemas.payloads import CancelRequestIn, MessageIn, SearchRequestIn
from app.services import assisted_service
from app.services.notifications import create_notification
from app.services.serializers import (
    match_payload,
    search_request_payload,
)

router = APIRouter(prefix="/search-requests", tags=["Assisted search"])
request_limiter = RateLimiter("assisted_request", 8, 3600)


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("", status_code=201)
def create_search_request(
    payload: SearchRequestIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    request_limiter.hit(_client(request))
    search_request, tracking = assisted_service.create_request(db, payload, user)
    return {
        "request": search_request_payload(search_request),
        "tracking": tracking,
        "message": "Your assisted search request was received. We will review genuine available supply — we do not guarantee a specific number of matches.",
    }


@router.get("")
def list_my_requests(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = assisted_service.list_requests_for_user(db, user)
    return {"requests": [search_request_payload(r) for r in rows]}


@router.get("/track/{token}")
def track_request(token: str, db: Session = Depends(get_db)):
    request = assisted_service.get_by_token(db, token)
    matches = [m for m in request.matches if m.status in {"sent", "accepted"}]
    return {
        "request": {
            "reference": request.reference,
            "status": request.status,
            "category": request.category,
            "town": request.town.name if request.town else None,
            "neighbourhood": request.neighbourhood.name if request.neighbourhood else None,
            "budget_min": float(request.budget_min) if request.budget_min is not None else None,
            "budget_max": float(request.budget_max) if request.budget_max is not None else None,
            "created_at": request.created_at,
            "updated_at": request.updated_at,
            "status_history": [
                {"to": h.to_status, "notes": h.notes, "created_at": h.created_at}
                for h in sorted(request.status_history, key=lambda x: x.created_at)
            ],
            "match_count": len(matches),
            "messages": [
                {"body": m.body, "sender_name": m.sender_name, "created_at": m.created_at}
                for m in request.messages
                if not m.is_internal
            ],
        },
        "matches": [
            {
                "id": m.id,
                "title": m.title,
                "rent_amount": float(m.rent_amount) if m.rent_amount is not None else None,
                "location_text": m.location_text,
                "property_id": m.property_id,
                "status": m.status,
            }
            for m in matches
        ],
        "note": "Viewing arrangements and personal details are shared securely by our team.",
    }


@router.get("/{request_id}")
def get_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    request = assisted_service.accessible_request(db, request_id, user)
    return {"request": search_request_payload(request)}


@router.get("/{request_id}/matches")
def get_matches(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    request = assisted_service.accessible_request(db, request_id, user)
    staff = bool(
        {"assisted:manage", "support:view"}
        & {p.code for role in user.roles for p in role.permissions}
    )
    return assisted_service.get_matches_for_request(db, request, user, support_view=staff)


@router.post("/{request_id}/cancel")
def cancel_request(
    request_id: uuid.UUID,
    payload: CancelRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    request = assisted_service.accessible_request(db, request_id, user)
    updated = assisted_service.cancel_request(db, request, user, payload.reason)
    return {
        "request": search_request_payload(updated),
        "message": "Your assisted search request has been cancelled.",
    }


@router.post("/{request_id}/messages", status_code=201)
def send_message(
    request_id: uuid.UUID,
    payload: MessageIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    request = assisted_service.accessible_request(db, request_id, user)
    message = assisted_service.add_message(db, request, user, payload)
    return {
        "message": {
            "id": message.id,
            "sender_name": message.sender_name,
            "body": message.body,
            "created_at": message.created_at,
        }
    }


@router.post("/{request_id}/matches/{match_id}/accept")
def accept_match(
    request_id: uuid.UUID,
    match_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    request = assisted_service.accessible_request(db, request_id, user)
    if request.user_id != user.id:
        raise Forbidden("Only the seeker can select a match.")
    match = db.get(RequestMatch, match_id)
    if match is None or match.request_id != request.id or match.status not in {"sent", "suggested"}:
        raise NotFound("Match not found.")
    match.status = "accepted"
    db.add(match)
    from app.models import RequestMessage

    db.add(
        RequestMessage(
            request_id=request.id,
            sender_id=user.id,
            sender_name=user.name,
            body=f"I would like to proceed with: {match.title or (match.property.title if match.property else 'shared property')}.",
            is_internal=False,
        )
    )
    if request.assigned_support_id:
        support = db.get(User, request.assigned_support_id)
        if support:
            create_notification(
                db,
                user=support,
                notification_type="assisted_match_selected",
                title="Seeker selected a match",
                body=f"{user.name} would like to proceed with a property for {request.reference}.",
                data={"request_id": str(request.id), "match_id": str(match.id)},
                channels=["in_app"],
            )
    db.commit()
    return {
        "match": match_payload(match),
        "property_id": match.property_id,
        "message": "Match selected. Our team will coordinate availability confirmation and viewing.",
    }
