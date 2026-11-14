from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from geoalchemy2 import Geography
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


class Property(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "properties"

    reference: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(30), index=True)
    property_type: Mapped[str] = mapped_column(String(60), index=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    availability_status: Mapped[str] = mapped_column(
        String(30), default="unconfirmed", index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    recorded_owner_name: Mapped[str | None] = mapped_column(String(160))
    recorded_owner_phone: Mapped[str | None] = mapped_column(String(20))
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    source_partner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    last_confirmed_available_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )
    last_confirmed_rent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_detail_update_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    freshness_days: Mapped[int | None] = mapped_column(Integer)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    suspension_reason: Mapped[str | None] = mapped_column(Text)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    featured_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    views_count: Mapped[int] = mapped_column(Integer, default=0)
    contact_count: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    owner = relationship("User", foreign_keys=[owner_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    manager = relationship("User", foreign_keys=[manager_id])
    location = relationship(
        "PropertyLocation", back_populates="property", uselist=False, cascade="all, delete-orphan"
    )
    rental_terms = relationship(
        "RentalTerm", back_populates="property", uselist=False, cascade="all, delete-orphan"
    )
    residential_detail = relationship(
        "ResidentialDetail", back_populates="property", uselist=False, cascade="all, delete-orphan"
    )
    commercial_detail = relationship(
        "CommercialDetail", back_populates="property", uselist=False, cascade="all, delete-orphan"
    )
    media = relationship(
        "PropertyMedia",
        back_populates="property",
        cascade="all, delete-orphan",
        order_by="PropertyMedia.sort_order",
    )
    amenities = relationship(
        "PropertyAmenity", back_populates="property", cascade="all, delete-orphan"
    )
    commercial_uses = relationship(
        "PropertyCommercialUse", back_populates="property", cascade="all, delete-orphan"
    )
    units = relationship(
        "RentalUnit", back_populates="property", cascade="all, delete-orphan"
    )
    verifications = relationship(
        "VerificationRecord",
        back_populates="property",
        cascade="all, delete-orphan",
        order_by="VerificationRecord.created_at.desc()",
    )
    history = relationship(
        "PropertyHistoryEvent",
        back_populates="property",
        cascade="all, delete-orphan",
        order_by="PropertyHistoryEvent.created_at.desc()",
    )
    availability_history = relationship(
        "PropertyAvailability",
        back_populates="property",
        cascade="all, delete-orphan",
        order_by="PropertyAvailability.created_at.desc()",
    )
    inspections = relationship(
        "PropertyInspection", back_populates="property", cascade="all, delete-orphan"
    )
    manager_links = relationship(
        "PropertyManager", back_populates="property", cascade="all, delete-orphan"
    )
    owner_links = relationship(
        "PropertyOwner", back_populates="property", cascade="all, delete-orphan"
    )
    reports = relationship("PropertyReport", back_populates="property")


class PropertyOwner(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "property_owners"
    __table_args__ = (UniqueConstraint("property_id", "user_id", name="uq_property_owner"),)

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    relationship_type: Mapped[str] = mapped_column(String(40), default="owner")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    property: Mapped[Property] = relationship(back_populates="owner_links")


class PropertyManager(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "property_managers"
    __table_args__ = (UniqueConstraint("property_id", "user_id", name="uq_property_manager"),)

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    authorization_reference: Mapped[str | None] = mapped_column(String(120))
    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="active")
    property: Mapped[Property] = relationship(back_populates="manager_links")


class PropertyAddress(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "property_addresses"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), unique=True
    )
    address_line: Mapped[str] = mapped_column(String(255))
    area_name: Mapped[str | None] = mapped_column(String(160))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    directions: Mapped[str | None] = mapped_column(Text)


class PropertyLocation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "property_locations"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), unique=True, index=True
    )
    address_line: Mapped[str | None] = mapped_column(String(255))
    town_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("towns.id"), index=True
    )
    neighbourhood_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("neighbourhoods.id"), index=True
    )
    locality_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("localities.id"), index=True
    )
    landmark_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("landmarks.id"), index=True
    )
    latitude_private: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    longitude_private: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    latitude_public: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    longitude_public: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    precision: Mapped[str] = mapped_column(String(20), default="approximate")
    directions: Mapped[str | None] = mapped_column(Text)
    geom_private: Mapped[object | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True)
    )
    geom_public: Mapped[object | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True)
    )
    town = relationship("Town", lazy="joined")
    neighbourhood = relationship("Neighbourhood", lazy="joined")
    locality = relationship("Locality", lazy="joined")
    landmark = relationship("Landmark", lazy="joined")
    property: Mapped[Property] = relationship(back_populates="location")


class RentalTerm(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "rental_terms"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), unique=True
    )
    rental_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("rental_units.id", ondelete="SET NULL")
    )
    currency: Mapped[str] = mapped_column(String(3), default="KES")
    rent_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), index=True)
    deposit_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    rent_period: Mapped[str] = mapped_column(String(20), default="monthly")
    agency_fee: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    service_fee: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    utility_connection_fee: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    other_mandatory_fee: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    other_charges: Mapped[str | None] = mapped_column(Text)  # JSON-encoded list of disclosures
    utilities_included: Mapped[bool] = mapped_column(Boolean, default=False)
    negotiable: Mapped[bool] = mapped_column(Boolean, default=False)
    available_from: Mapped[date | None] = mapped_column(Date)
    minimum_lease_months: Mapped[int | None] = mapped_column(Integer)
    payment_schedule: Mapped[str | None] = mapped_column(String(80))
    property: Mapped[Property] = relationship(back_populates="rental_terms")


class RentalUnit(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "rental_units"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(80))
    unit_type: Mapped[str] = mapped_column(String(60))
    bedrooms: Mapped[int | None] = mapped_column(Integer)
    bathrooms: Mapped[int | None] = mapped_column(Integer)
    rent_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    deposit_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="KES")
    availability_status: Mapped[str] = mapped_column(String(30), default="available")
    available_from: Mapped[date | None] = mapped_column(Date)
    property: Mapped[Property] = relationship(back_populates="units")


class PropertyMedia(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "property_media"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    rental_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("rental_units.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(20), default="image")
    url: Mapped[str] = mapped_column(String(1000))
    storage_key: Mapped[str | None] = mapped_column(String(500))
    caption: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    perceptual_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    consent_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    property: Mapped[Property] = relationship(back_populates="media")


class Amenity(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "amenities"

    name: Mapped[str] = mapped_column(String(100), unique=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(60), default="general")
    applies_to: Mapped[str] = mapped_column(String(30), default="both")
    icon: Mapped[str | None] = mapped_column(String(60))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class PropertyAmenity(Base):
    __tablename__ = "property_amenities"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), primary_key=True
    )
    amenity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("amenities.id", ondelete="CASCADE"), primary_key=True
    )
    details: Mapped[str | None] = mapped_column(String(255))
    property: Mapped[Property] = relationship(back_populates="amenities")
    amenity: Mapped[Amenity] = relationship(lazy="joined")


class ResidentialDetail(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "residential_details"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), unique=True
    )
    bedrooms: Mapped[int | None] = mapped_column(Integer)
    bathrooms: Mapped[int | None] = mapped_column(Integer)
    house_style: Mapped[str | None] = mapped_column(String(80))
    furnishing: Mapped[str] = mapped_column(String(40), default="unfurnished")
    floor_number: Mapped[int | None] = mapped_column(Integer)
    has_private_bathroom: Mapped[bool] = mapped_column(Boolean, default=False)
    parking_spaces: Mapped[int] = mapped_column(Integer, default=0)
    outdoor_space: Mapped[str | None] = mapped_column(String(120))
    security_features: Mapped[str | None] = mapped_column(Text)
    water_source: Mapped[str | None] = mapped_column(String(120))
    electricity_supply: Mapped[str | None] = mapped_column(String(120))
    shared_accommodation: Mapped[bool] = mapped_column(Boolean, default=False)
    property: Mapped[Property] = relationship(back_populates="residential_detail")


class CommercialUse(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "commercial_uses"

    name: Mapped[str] = mapped_column(String(100), unique=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class PropertyCommercialUse(Base):
    __tablename__ = "property_commercial_uses"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), primary_key=True
    )
    commercial_use_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("commercial_uses.id", ondelete="CASCADE"), primary_key=True
    )
    property: Mapped[Property] = relationship(back_populates="commercial_uses")
    commercial_use: Mapped[CommercialUse] = relationship(lazy="joined")


class CommercialDetail(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "commercial_details"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), unique=True
    )
    floor_area_sqm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    frontage_m: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    floor_level: Mapped[str | None] = mapped_column(String(40))
    power_capacity_kva: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    parking_spaces: Mapped[int] = mapped_column(Integer, default=0)
    accessibility: Mapped[str | None] = mapped_column(String(160))
    loading_access: Mapped[bool] = mapped_column(Boolean, default=False)
    visibility: Mapped[str | None] = mapped_column(String(120))
    road_access: Mapped[str | None] = mapped_column(String(160))
    lease_duration_months: Mapped[int | None] = mapped_column(Integer)
    zoning_note: Mapped[str | None] = mapped_column(Text)
    permitted_use_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    property: Mapped[Property] = relationship(back_populates="commercial_detail")


class PropertyAvailability(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "property_availability"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("rental_units.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(30))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    confirmed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    source: Mapped[str] = mapped_column(String(40), default="landlord")
    next_recheck_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    property: Mapped[Property] = relationship(back_populates="availability_history")


class PropertyStatusHistory(Base, UUIDMixin):
    __tablename__ = "property_status_history"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30))
    reason: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class VerificationRecord(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "verification_records"

    property_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), index=True
    )
    verification_type: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    evidence_reference: Mapped[str | None] = mapped_column(String(255))
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    requested_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    property: Mapped[Property | None] = relationship(back_populates="verifications")
    evidence: Mapped[list[VerificationEvidence]] = relationship(
        back_populates="verification", cascade="all, delete-orphan"
    )


class VerificationEvidence(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "verification_evidence"

    verification_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("verification_records.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40), default="document")
    storage_key: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(String(255))
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    verification: Mapped[VerificationRecord] = relationship(back_populates="evidence")


class PropertyHistoryEvent(Base, UUIDMixin):
    __tablename__ = "property_history_events"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(60), index=True)
    summary: Mapped[str] = mapped_column(String(255))
    changes: Mapped[str | None] = mapped_column(Text)  # JSON
    visibility: Mapped[str] = mapped_column(String(20), default="public")
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    property: Mapped[Property] = relationship(back_populates="history")


class PropertyReport(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "property_reports"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    reporter_phone: Mapped[str | None] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(String(80))
    details: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    resolution: Mapped[str | None] = mapped_column(Text)
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    property: Mapped[Property] = relationship(back_populates="reports")


class PropertyInspection(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "property_inspections"

    property_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    inspector_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id")
    )
    inspection_date: Mapped[date | None] = mapped_column(Date)
    exterior_condition: Mapped[str | None] = mapped_column(String(80))
    interior_condition: Mapped[str | None] = mapped_column(String(80))
    water_facilities: Mapped[str | None] = mapped_column(String(160))
    electricity: Mapped[str | None] = mapped_column(String(160))
    doors_windows: Mapped[str | None] = mapped_column(String(160))
    plumbing: Mapped[str | None] = mapped_column(String(160))
    access: Mapped[str | None] = mapped_column(String(160))
    outstanding_concerns: Mapped[str | None] = mapped_column(Text)
    findings: Mapped[str | None] = mapped_column(Text)  # JSON
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    property: Mapped[Property] = relationship(back_populates="inspections")


class SavedSearch(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "saved_searches"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(30))
    filters: Mapped[str] = mapped_column(Text)  # JSON
    notify: Mapped[bool] = mapped_column(Boolean, default=False)
