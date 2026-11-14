"""Pytest fixtures for the Findora Spaces API.

The suite runs against a dedicated PostgreSQL database (``findora_test``) so it
never touches development or demo data. The database is recreated once per test
session, and every test starts from an empty schema plus fresh RBAC/settings.
"""

from __future__ import annotations

import os
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

# Configure the environment before importing the application. Settings are
# cached at import time, so this must happen first.
os.environ["DATABASE_URL"] = (
    "postgresql+psycopg://findora:findora_dev_password@localhost:5455/findora_test"
)
os.environ["ENVIRONMENT"] = "test"
os.environ["DEBUG"] = "true"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["MPESA_MOCK"] = "true"
os.environ["OTP_DEBUG"] = "true"
os.environ["COOKIE_SECURE"] = "false"
os.environ["SECRET_KEY"] = "test-only-secret-key"
os.environ["UPLOAD_DIR"] = "/tmp/findora-test-uploads"

import psycopg  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.bootstrap import bootstrap  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Amenity,
    CommercialUse,
    Country,
    County,
    Neighbourhood,
    Role,
    SubCounty,
    Town,
    User,
    UserProfile,
)
from app.services.location_service import point_wkt  # noqa: E402


def _recreate_database() -> None:
    admin_dsn = "postgresql://findora:findora_dev_password@localhost:5455/postgres"
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        conn.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = 'findora_test' AND pid <> pg_backend_pid()"
        )
        conn.execute("DROP DATABASE IF EXISTS findora_test")
        conn.execute("CREATE DATABASE findora_test")


_recreate_database()

with psycopg.connect(
    "postgresql://findora:findora_dev_password@localhost:5455/findora_test", autocommit=True
) as conn:
    conn.execute("CREATE EXTENSION IF NOT EXISTS postgis")

# Create the schema once for the whole session.
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    bootstrap(db)

PHONE_COUNTER = 0
TEST_PASSWORD = "TestPass123!"


def next_phone() -> str:
    global PHONE_COUNTER
    PHONE_COUNTER += 1
    return f"+2547{PHONE_COUNTER:08d}"


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="session", autouse=True)
def _database() -> None:
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_database() -> None:
    """Truncate every application table before each test and reseed RBAC."""
    table_names = ", ".join(f'"{table.name}"' for table in reversed(Base.metadata.sorted_tables))
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))
    with SessionLocal() as db:
        bootstrap(db)
    try:
        import redis

        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1)
        keys = list(client.scan_iter("rl:*"))
        if keys:
            client.delete(*keys)
        client.close()
    except Exception:
        pass


@pytest.fixture()
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def client_factory():
    """Create authenticated TestClients and close them after the test."""
    clients: list[TestClient] = []

    def factory(phone: str, password: str = TEST_PASSWORD):
        test_client = TestClient(app)
        test_client.__enter__()
        headers = login(test_client, phone, password)
        clients.append(test_client)
        return test_client, headers

    yield factory
    for test_client in clients:
        test_client.__exit__(None, None, None)


@pytest.fixture()
def locations(db: Session) -> dict:
    country = Country(name="Kenya", iso_code="KEN")
    db.add(country)
    db.flush()
    county = County(
        country_id=country.id, name="Migori", code="044", slug=f"migori-{uuid.uuid4().hex[:6]}"
    )
    db.add(county)
    db.flush()
    sub_county = SubCounty(
        county_id=county.id, name="Kuria East", slug=f"kuria-east-{uuid.uuid4().hex[:6]}"
    )
    db.add(sub_county)
    db.flush()
    town = Town(
        sub_county_id=sub_county.id,
        name="Kehancha",
        slug=f"kehancha-{uuid.uuid4().hex[:6]}",
        latitude=Decimal("-1.2466"),
        longitude=Decimal("34.6181"),
        geom=point_wkt(-1.2466, 34.6181),
        is_active=True,
    )
    db.add(town)
    db.flush()
    neighbourhood = Neighbourhood(
        town_id=town.id,
        name="Amani",
        slug=f"amani-{uuid.uuid4().hex[:6]}",
        latitude=Decimal("-1.2500"),
        longitude=Decimal("34.6210"),
        geom=point_wkt(-1.2500, 34.6210),
    )
    db.add(neighbourhood)
    amenity = Amenity(
        name="Security lights",
        slug=f"security-lights-{uuid.uuid4().hex[:6]}",
        category="security",
        applies_to="both",
        is_active=True,
    )
    commercial_use = CommercialUse(
        name="General retail shop",
        slug=f"general-retail-{uuid.uuid4().hex[:6]}",
        description="Everyday retail",
        is_active=True,
    )
    db.add_all([amenity, commercial_use])
    db.commit()
    return {
        "country": country,
        "county": county,
        "sub_county": sub_county,
        "town": town,
        "neighbourhood": neighbourhood,
        "amenity": amenity,
        "commercial_use": commercial_use,
    }


def create_user(
    db: Session,
    *,
    roles: list[str],
    name: str = "Test User",
    email: str | None = None,
    phone: str | None = None,
    verified: bool = True,
    password: str = TEST_PASSWORD,
) -> User:
    role_rows = db.execute(select(Role).where(Role.code.in_(roles))).scalars().all()
    found = {row.code for row in role_rows}
    missing = set(roles) - found
    assert not missing, f"Missing roles: {missing}"
    user = User(
        name=name,
        phone=phone or next_phone(),
        email=email or unique_email(name.lower().replace(" ", "-")),
        password_hash=hash_password(password),
        status="active",
        phone_verified_at=datetime.now(UTC) if verified else None,
        is_email_verified=True,
    )
    user.roles = list(role_rows)
    db.add(user)
    db.flush()
    db.add(
        UserProfile(
            user_id=user.id,
            bio="Test profile",
            preferred_contact="phone",
            whatsapp=user.phone,
            locale="en",
            marketing_consent=False,
            data_processing_consent_at=datetime.now(UTC),
        )
    )
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def user_factory(db: Session):
    def factory(**kwargs) -> User:
        return create_user(db, **kwargs)

    return factory


def login(client: TestClient, phone: str, password: str = TEST_PASSWORD) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"phone": phone, "password": password})
    assert response.status_code == 200, response.text
    token = client.cookies.get("findora_csrf")
    assert token, "CSRF cookie missing after login"
    return {"X-CSRF-Token": token}


def auth_client(phone: str, password: str = TEST_PASSWORD) -> tuple[TestClient, dict[str, str]]:
    test_client = TestClient(app)
    test_client.__enter__()
    headers = login(test_client, phone, password)
    return test_client, headers


def close_client(test_client: TestClient) -> None:
    test_client.__exit__(None, None, None)


def property_payload(
    locations: dict,
    *,
    title: str = "Test two-bedroom home in Kehancha",
    category: str = "residential",
    property_type: str | None = None,
    rent: int = 14000,
    bedrooms: int = 2,
    confirm_available_now: bool = True,
) -> dict:
    resolved_type = property_type or ("two_bedroom" if category == "residential" else "shop")
    return {
        "title": title,
        "description": (
            "A fictional test listing used by the automated test suite. It describes a "
            "modest two-bedroom home with water, security lights and parking. It is not "
            "real property data."
        ),
        "category": category,
        "property_type": resolved_type,
        "location": {
            "town_id": str(locations["town"].id),
            "neighbourhood_id": str(locations["neighbourhood"].id),
            "address_line": "Test lane, Kehancha",
            "precision": "approximate",
        },
        "terms": {
            "rent_amount": rent,
            "deposit_amount": rent,
            "rent_period": "monthly",
            "minimum_lease_months": 12,
        },
        "residential": {
            "bedrooms": bedrooms,
            "bathrooms": 1,
            "furnishing": "unfurnished",
            "parking_spaces": 1,
            "has_private_bathroom": True,
        }
        if category == "residential"
        else None,
        "commercial": None
        if category == "residential"
        else {
            "floor_area_sqm": 30,
            "frontage_m": 5,
            "floor_level": "Ground floor",
            "power_capacity_kva": 10,
            "parking_spaces": 0,
            "loading_access": True,
            "lease_duration_months": 12,
        },
        "amenity_ids": [str(locations["amenity"].id)],
        "commercial_use_ids": (
            [str(locations["commercial_use"].id)] if category == "commercial" else []
        ),
        "confirm_authority": True,
        "confirm_photo_consent": True,
        "confirm_available_now": confirm_available_now,
    }


def create_property(
    client: TestClient,
    headers: dict[str, str],
    locations: dict,
    **overrides,
) -> dict:
    response = client.post(
        "/api/v1/properties", json=property_payload(locations, **overrides), headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()["property"]


def approve_and_publish(
    admin_client: TestClient, admin_headers: dict[str, str], property_id: str
) -> None:
    response = admin_client.post(
        f"/api/v1/properties/{property_id}/moderate",
        json={"action": "approve", "reason": "Test approval"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    response = admin_client.post(
        f"/api/v1/properties/{property_id}/confirm-availability", headers=admin_headers
    )
    assert response.status_code == 200, response.text


def make_stale(db: Session, property_id: str) -> None:
    from app.models import Property

    prop = db.get(Property, uuid.UUID(property_id))
    assert prop is not None
    prop.last_confirmed_available_at = datetime.now(UTC) - timedelta(days=60)
    db.commit()


def make_occupied(db: Session, property_id: str) -> None:
    from app.models import Property

    prop = db.get(Property, uuid.UUID(property_id))
    assert prop is not None
    prop.availability_status = "occupied"
    db.commit()
