from __future__ import annotations

import uuid
from decimal import Decimal

from geoalchemy2 import Geography
from sqlalchemy import ForeignKey, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Country(Base, UUIDMixin):
    __tablename__ = "countries"

    name: Mapped[str] = mapped_column(String(120))
    iso_code: Mapped[str] = mapped_column(String(3), unique=True)
    counties: Mapped[list[County]] = relationship(back_populates="country")


class County(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "counties"

    country_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("countries.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120), index=True)
    code: Mapped[str | None] = mapped_column(String(10), unique=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    country: Mapped[Country] = relationship(back_populates="counties")
    sub_counties: Mapped[list[SubCounty]] = relationship(back_populates="county")


class SubCounty(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "sub_counties"

    county_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("counties.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(160), index=True)
    county: Mapped[County] = relationship(back_populates="sub_counties")
    towns: Mapped[list[Town]] = relationship(back_populates="sub_county")


class Town(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "towns"

    sub_county_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("sub_counties.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120), index=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    geom: Mapped[object | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True)
    )
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(default=True)
    sub_county: Mapped[SubCounty] = relationship(back_populates="towns")
    neighbourhoods: Mapped[list[Neighbourhood]] = relationship(back_populates="town")


class Neighbourhood(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "neighbourhoods"

    town_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("towns.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(160), index=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    geom: Mapped[object | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True)
    )
    description: Mapped[str | None] = mapped_column(Text)
    town: Mapped[Town] = relationship(back_populates="neighbourhoods")


class Locality(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "localities"

    town_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("towns.id"), index=True
    )
    neighbourhood_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("neighbourhoods.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(160), index=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))


class Landmark(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "landmarks"

    town_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("towns.id"), index=True
    )
    neighbourhood_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("neighbourhoods.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(60), default="landmark")
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    geom: Mapped[object | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True)
    )
    address: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String(160))
    last_checked_at: Mapped[str | None] = mapped_column(String(40))
    town: Mapped[Town] = relationship()
    neighbourhood: Mapped[Neighbourhood | None] = relationship()


class LocationAlias(Base, UUIDMixin):
    __tablename__ = "location_aliases"

    location_type: Mapped[str] = mapped_column(String(30), index=True)
    location_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    alias: Mapped[str] = mapped_column(String(160), index=True)
    normalized_alias: Mapped[str] = mapped_column(String(160), index=True)
