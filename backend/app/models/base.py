from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PropertyStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class AvailabilityStatus(StrEnum):
    AVAILABLE = "available"
    OCCUPIED = "occupied"
    UNCONFIRMED = "unconfirmed"
    TEMPORARILY_UNAVAILABLE = "temporarily_unavailable"


class VerificationStatus(StrEnum):
    NOT_STARTED = "not_started"
    PENDING = "pending"
    VERIFIED = "verified"
    FAILED = "failed"
    EXPIRED = "expired"


class VerificationType(StrEnum):
    PHONE = "phone"
    IDENTITY = "identity"
    OWNERSHIP = "ownership"
    AUTHORITY = "authority"
    INSPECTION = "inspection"
    AVAILABILITY = "availability"
    RENT = "rent"
    DETAILS = "details"


class PropertyCategory(StrEnum):
    RESIDENTIAL = "residential"
    COMMERCIAL = "commercial"


class SearchRequestStatus(StrEnum):
    SUBMITTED = "submitted"
    RECEIVED = "received"
    UNDER_REVIEW = "under_review"
    MATCHING = "matching"
    AWAITING_LOCAL_INVESTIGATION = "awaiting_local_investigation"
    PARTNER_ASSIGNED = "partner_assigned"
    INVESTIGATION_IN_PROGRESS = "investigation_in_progress"
    MATCHES_AVAILABLE = "matches_available"
    AWAITING_SEEKER_RESPONSE = "awaiting_seeker_response"
    VIEWING_REQUESTED = "viewing_requested"
    VIEWING_CONFIRMED = "viewing_confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SUITABLE_MATCH = "unable_to_find_suitable_match"


class ViewingStatus(StrEnum):
    REQUESTED = "requested"
    PROPOSED = "proposed"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    MISSED = "missed"


class PaymentStatus(StrEnum):
    INITIATED = "initiated"
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class AssignmentStatus(StrEnum):
    OFFERED = "offered"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
