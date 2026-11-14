from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class SeekerProfile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "seeker_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    budget_min: Mapped[int | None] = mapped_column(Integer)
    budget_max: Mapped[int | None] = mapped_column(Integer)
    preferred_locations: Mapped[str | None] = mapped_column(Text)  # JSON
    move_in_date: Mapped[date | None] = mapped_column(Date)
    household_size: Mapped[int | None] = mapped_column(Integer)
    preferences: Mapped[str | None] = mapped_column(Text)
    category_interest: Mapped[str] = mapped_column(String(30), default="residential")


class Favourite(Base, UUIDMixin):
    __tablename__ = "favourites"
    __table_args__ = (UniqueConstraint("user_id", "property_id", name="uq_favourite"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PropertyComparison(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "property_comparisons"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    guest_token: Mapped[str | None] = mapped_column(String(80), index=True)
    property_ids: Mapped[str] = mapped_column(Text)  # JSON list
    name: Mapped[str | None] = mapped_column(String(160))


class SharedShortlist(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "shared_shortlists"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    members: Mapped[list[ShortlistMember]] = relationship(
        back_populates="shortlist", cascade="all, delete-orphan"
    )
    comments: Mapped[list[ShortlistComment]] = relationship(
        back_populates="shortlist", cascade="all, delete-orphan"
    )


class ShortlistMember(Base, UUIDMixin):
    __tablename__ = "shortlist_members"
    __table_args__ = (UniqueConstraint("shortlist_id", "property_id", name="uq_shortlist_property"),)

    shortlist_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("shared_shortlists.id", ondelete="CASCADE"), index=True
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE")
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    property = relationship("Property", lazy="joined")
    shortlist: Mapped[SharedShortlist] = relationship(back_populates="members")


class ShortlistComment(Base, UUIDMixin):
    __tablename__ = "shortlist_comments"

    shortlist_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("shared_shortlists.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    author_name: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    shortlist: Mapped[SharedShortlist] = relationship(back_populates="comments")


class PropertyEnquiry(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "property_enquiries"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    seeker_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    landlord_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    enquiry_type: Mapped[str] = mapped_column(String(30), default="enquiry")
    status: Mapped[str] = mapped_column(String(30), default="new", index=True)
    response: Mapped[str | None] = mapped_column(Text)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    property = relationship("Property", lazy="joined")
    seeker = relationship("User", foreign_keys=[seeker_id])
