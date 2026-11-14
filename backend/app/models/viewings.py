from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Viewing(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "viewings"

    reference: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    seeker_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    seeker_name: Mapped[str] = mapped_column(String(160))
    seeker_phone: Mapped[str] = mapped_column(String(20))
    landlord_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    coordinator_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    requested_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    preferred_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(30), default="requested", index=True)
    meeting_point: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    property = relationship("Property", lazy="joined")
    seeker = relationship("User", foreign_keys=[seeker_id])
    landlord = relationship("User", foreign_keys=[landlord_id])
    status_history: Mapped[list[ViewingStatusHistory]] = relationship(
        back_populates="viewing", cascade="all, delete-orphan"
    )
    feedback: Mapped[list[ViewingFeedback]] = relationship(
        back_populates="viewing", cascade="all, delete-orphan"
    )


class ViewingStatusHistory(Base, UUIDMixin):
    __tablename__ = "viewing_status_history"

    viewing_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("viewings.id", ondelete="CASCADE"), index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    viewing: Mapped[Viewing] = relationship(back_populates="status_history")


class ViewingFeedback(Base, UUIDMixin):
    __tablename__ = "viewing_feedback"

    viewing_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("viewings.id", ondelete="CASCADE"), index=True
    )
    seeker_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    matched_photos: Mapped[bool | None] = mapped_column(Boolean)
    matched_description: Mapped[bool | None] = mapped_column(Boolean)
    rent_matched: Mapped[bool | None] = mapped_column(Boolean)
    property_available: Mapped[bool | None] = mapped_column(Boolean)
    representative_reachable: Mapped[bool | None] = mapped_column(Boolean)
    suspected_fraud: Mapped[bool] = mapped_column(Boolean, default=False)
    rating: Mapped[int | None] = mapped_column(Integer)
    comments: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    viewing: Mapped[Viewing] = relationship(back_populates="feedback")
