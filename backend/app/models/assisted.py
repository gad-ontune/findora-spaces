from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class SearchRequest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "search_requests"

    reference: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    secure_token: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    guest_name: Mapped[str | None] = mapped_column(String(160))
    guest_phone: Mapped[str] = mapped_column(String(20), index=True)
    guest_email: Mapped[str | None] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(30), index=True)
    county_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("counties.id")
    )
    town_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("towns.id"), index=True
    )
    neighbourhood_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("neighbourhoods.id")
    )
    landmark_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("landmarks.id")
    )
    budget_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    budget_max: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    property_type: Mapped[str | None] = mapped_column(String(60))
    bedrooms_min: Mapped[int | None] = mapped_column(Integer)
    floor_area_min: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    floor_area_max: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    frontage_min: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    loading_required: Mapped[bool] = mapped_column(Boolean, default=False)
    parking_required: Mapped[int | None] = mapped_column(Integer)
    facilities: Mapped[str | None] = mapped_column(Text)  # JSON list
    move_in_date: Mapped[date | None] = mapped_column(Date)
    business_type: Mapped[str | None] = mapped_column(String(120))
    requirements: Mapped[str | None] = mapped_column(Text)
    contact_method: Mapped[str] = mapped_column(String(30), default="phone")
    assistance_requirements: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), default="submitted", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    assigned_support_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    consent_to_share: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(30), default="web")

    town = relationship("Town", lazy="joined")
    neighbourhood = relationship("Neighbourhood", lazy="joined")
    landmark = relationship("Landmark", lazy="joined")
    assigned_support = relationship("User", foreign_keys=[assigned_support_id])
    status_history: Mapped[list[RequestStatusHistory]] = relationship(
        back_populates="request", cascade="all, delete-orphan"
    )
    matches: Mapped[list[RequestMatch]] = relationship(
        back_populates="request", cascade="all, delete-orphan"
    )
    assignments: Mapped[list[PartnerAssignment]] = relationship(
        back_populates="request", cascade="all, delete-orphan"
    )
    messages: Mapped[list[RequestMessage]] = relationship(
        back_populates="request", cascade="all, delete-orphan"
    )


class RequestStatusHistory(Base, UUIDMixin):
    __tablename__ = "request_status_history"

    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("search_requests.id", ondelete="CASCADE"), index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(40))
    to_status: Mapped[str] = mapped_column(String(40))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    request: Mapped[SearchRequest] = relationship(back_populates="status_history")


class RequestMatch(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "request_matches"

    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("search_requests.id", ondelete="CASCADE"), index=True
    )
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    rent_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    location_text: Mapped[str | None] = mapped_column(String(255))
    score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    explanation: Mapped[str | None] = mapped_column(Text)  # JSON
    stage: Mapped[str] = mapped_column(String(30), default="database")
    status: Mapped[str] = mapped_column(String(30), default="suggested")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    request: Mapped[SearchRequest] = relationship(back_populates="matches")
    property: Mapped[Property | None] = relationship("Property", lazy="joined")


class PartnerProfile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "partner_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    partner_type: Mapped[str] = mapped_column(String(30), default="finding")
    company_name: Mapped[str | None] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    phone_alt: Mapped[str | None] = mapped_column(String(20))
    identification_reference: Mapped[str | None] = mapped_column(String(120))
    agreement_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    response_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    completed_assignments: Mapped[int] = mapped_column(Integer, default=0)
    accuracy_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    user = relationship("User", lazy="joined")
    service_areas: Mapped[list[PartnerServiceArea]] = relationship(
        back_populates="partner", cascade="all, delete-orphan"
    )


class PartnerServiceArea(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "partner_service_areas"

    partner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("partner_profiles.id", ondelete="CASCADE"), index=True
    )
    town_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("towns.id"), index=True
    )
    neighbourhood_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("neighbourhoods.id")
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    partner: Mapped[PartnerProfile] = relationship(back_populates="service_areas")


class PartnerAssignment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "partner_assignments"

    reference: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("search_requests.id", ondelete="CASCADE"), index=True
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("partner_profiles.id"), index=True
    )
    assigned_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    status: Mapped[str] = mapped_column(String(30), default="offered", index=True)
    instructions: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    declined_reason: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    request: Mapped[SearchRequest] = relationship(back_populates="assignments")
    partner = relationship("PartnerProfile", lazy="joined")
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])
    reports: Mapped[list[FieldReport]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan"
    )


class FieldReport(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "field_reports"

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("partner_assignments.id", ondelete="CASCADE"), index=True
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("partner_profiles.id"), index=True
    )
    report_type: Mapped[str] = mapped_column(String(40), default="investigation")
    summary: Mapped[str] = mapped_column(Text)
    findings: Mapped[str | None] = mapped_column(Text)  # JSON
    contact_name: Mapped[str | None] = mapped_column(String(160))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    property_found: Mapped[bool] = mapped_column(Boolean, default=False)
    photos: Mapped[str | None] = mapped_column(Text)  # JSON list
    status: Mapped[str] = mapped_column(String(30), default="submitted", index=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    review_notes: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    partner = relationship("PartnerProfile", lazy="joined")
    assignment: Mapped[PartnerAssignment] = relationship(back_populates="reports")


class RequestMessage(Base, UUIDMixin):
    __tablename__ = "request_messages"

    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("search_requests.id", ondelete="CASCADE"), index=True
    )
    sender_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    sender_name: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    request: Mapped[SearchRequest] = relationship(back_populates="messages")


class PartnerPerformanceRecord(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "partner_performance_records"
    __table_args__ = (
        UniqueConstraint("partner_id", "period", name="uq_partner_performance_period"),
    )

    partner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("partner_profiles.id", ondelete="CASCADE"), index=True
    )
    period: Mapped[str] = mapped_column(String(20))
    assignments_accepted: Mapped[int] = mapped_column(Integer, default=0)
    assignments_completed: Mapped[int] = mapped_column(Integer, default=0)
    average_response_hours: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    confirmed_availability_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    complaint_count: Mapped[int] = mapped_column(Integer, default=0)
    viewings_completed: Mapped[int] = mapped_column(Integer, default=0)
