from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.core.exceptions import NotFound
from app.models import User, Viewing
from app.schemas.payloads import ViewingCreateIn, ViewingFeedbackIn, ViewingUpdateIn
from app.services import viewing_service
from app.services.serializers import viewing_payload

router = APIRouter(prefix="/viewings", tags=["Viewings"])


@router.post("", status_code=201)
def request_viewing(
    payload: ViewingCreateIn,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    viewing = viewing_service.create_viewing(db, payload, user)
    return {
        "viewing": viewing_payload(viewing),
        "message": "Viewing requested. The property representative must confirm the appointment.",
    }


@router.get("")
def list_viewings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = viewing_service.list_viewings(db, user)
    return {
        "viewings": [viewing_payload(v) for v in rows],
        "count": len(rows),
    }


@router.get("/{viewing_id}")
def get_viewing(
    viewing_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    viewing = viewing_service.get_viewing(db, viewing_id, user)
    return {"viewing": viewing_payload(viewing)}


@router.patch("/{viewing_id}")
def update_viewing(
    viewing_id: uuid.UUID,
    payload: ViewingUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    viewing = viewing_service.get_viewing(db, viewing_id, user)
    updated = viewing_service.update_viewing(db, viewing, payload, user)
    return {"viewing": viewing_payload(updated), "message": f"Viewing {updated.status}."}


@router.post("/{viewing_id}/feedback", status_code=201)
def submit_feedback(
    viewing_id: uuid.UUID,
    payload: ViewingFeedbackIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    viewing = viewing_service.get_viewing(db, viewing_id, user)
    feedback = viewing_service.submit_feedback(db, viewing, payload, user)
    return {
        "feedback": {
            "id": feedback.id,
            "rating": feedback.rating,
            "comments": feedback.comments,
            "suspected_fraud": feedback.suspected_fraud,
            "created_at": feedback.created_at,
        },
        "message": "Thank you. Genuine feedback helps other seekers and our moderation team.",
    }
