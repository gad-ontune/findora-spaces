"""Subscription entitlement, renewal, cancellation and listing limit tests."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import select

from app.models import Subscription
from app.services.serializers import utcnow
from app.tests.conftest import create_property, property_payload


def _buy_subscription(client, headers, plan_code: str) -> dict:
    response = client.post(
        "/api/v1/payments/initiate",
        json={
            "purpose": "subscription",
            "plan_code": plan_code,
            "idempotency_key": f"subscription-{uuid.uuid4().hex[:16]}",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _summary(client) -> dict:
    response = client.get("/api/v1/subscriptions/me")
    assert response.status_code == 200, response.text
    return response.json()["subscription"]


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_free_plan_is_default_and_limits_active_listings(
    client, user_factory, client_factory, locations
):
    landlord = user_factory(roles=["landlord"], plan_code=None)
    landlord_client, landlord_headers = client_factory(landlord.phone)

    summary = _summary(landlord_client)
    assert summary["status"] == "free"
    assert summary["plan"]["code"] == "landlord_free"
    assert summary["listing_limit"] == 2
    assert summary["listings_used"] == 0
    assert summary["can_create_listing"] is True
    assert summary["is_free"] is True

    create_property(
        landlord_client, landlord_headers, locations, title="First free-plan listing"
    )
    create_property(
        landlord_client, landlord_headers, locations, title="Second free-plan listing"
    )

    blocked = landlord_client.post(
        "/api/v1/properties",
        json=property_payload(locations, title="Third listing over the free limit"),
        headers=landlord_headers,
    )
    assert blocked.status_code == 422, blocked.text
    error = blocked.json()["error"]
    assert error["code"] == "listing_limit_reached"
    assert error["details"]["listing_limit"] == 2
    assert error["details"]["listings_used"] == 2

    summary = _summary(landlord_client)
    assert summary["listings_used"] == 2
    assert summary["listings_remaining"] == 0
    assert summary["can_create_listing"] is False


def test_confirmed_subscription_payment_activates_plan_and_raises_limit(
    client, user_factory, client_factory, locations
):
    landlord = user_factory(roles=["landlord"], plan_code=None)
    landlord_client, landlord_headers = client_factory(landlord.phone)

    purchase = _buy_subscription(landlord_client, landlord_headers, "landlord_growth")
    assert purchase["payment_confirmed_by_backend"] is True
    assert purchase["payment"]["status"] == "success"
    assert purchase["payment"]["purpose"] == "subscription"
    assert purchase["payment"]["amount"] == 1000.0
    assert purchase["payment"]["related_id"] is not None

    summary = _summary(landlord_client)
    assert summary["status"] == "active"
    assert summary["plan"]["code"] == "landlord_growth"
    assert summary["listing_limit"] == 10
    assert summary["listings_used"] == 0
    assert summary["days_remaining"] is not None and summary["days_remaining"] > 0
    assert summary["payment_id"] == purchase["payment"]["id"]

    for index in range(3):
        create_property(
            landlord_client,
            landlord_headers,
            locations,
            title=f"Growth-plan listing {index + 1}",
        )

    summary = _summary(landlord_client)
    assert summary["listings_used"] == 3
    assert summary["listings_remaining"] == 7
    assert summary["can_create_listing"] is True

    payments = landlord_client.get("/api/v1/payments")
    assert payments.status_code == 200
    assert any(row["purpose"] == "subscription" for row in payments.json()["payments"])

    invoices = landlord_client.get("/api/v1/invoices")
    assert invoices.status_code == 200
    assert len(invoices.json()["invoices"]) == 1


def test_same_plan_payment_renews_without_duplicating_active_subscription(
    db, client, user_factory, client_factory
):
    landlord = user_factory(roles=["landlord"], plan_code=None)
    landlord_client, landlord_headers = client_factory(landlord.phone)

    _buy_subscription(landlord_client, landlord_headers, "landlord_growth")
    first = _summary(landlord_client)

    _buy_subscription(landlord_client, landlord_headers, "landlord_growth")
    second = _summary(landlord_client)

    assert second["status"] == "active"
    assert second["plan"]["code"] == "landlord_growth"
    assert _parse(second["ends_at"]) > _parse(first["ends_at"])

    db.expire_all()
    rows = db.execute(
        select(Subscription).where(
            Subscription.user_id == landlord.id,
            Subscription.status == "active",
        )
    ).scalars().all()
    assert len(rows) == 1


def test_upgrade_cancel_resume_and_expiry_return_to_free(
    db, client, user_factory, client_factory
):
    landlord = user_factory(roles=["landlord"], plan_code=None)
    landlord_client, landlord_headers = client_factory(landlord.phone)

    _buy_subscription(landlord_client, landlord_headers, "landlord_growth")
    _buy_subscription(landlord_client, landlord_headers, "partner_pro")

    summary = _summary(landlord_client)
    assert summary["status"] == "active"
    assert summary["plan"]["code"] == "partner_pro"
    assert summary["listing_limit"] == 25

    db.expire_all()
    rows = db.execute(
        select(Subscription).where(Subscription.user_id == landlord.id)
    ).scalars().all()
    statuses = {row.status for row in rows}
    assert "replaced" in statuses
    assert "active" in statuses

    cancelled = landlord_client.post(
        "/api/v1/subscriptions/cancel", headers=landlord_headers
    )
    assert cancelled.status_code == 200, cancelled.text
    summary = cancelled.json()["subscription"]
    assert summary["status"] == "cancelling"
    assert summary["cancel_at_period_end"] is True
    assert summary["plan"]["code"] == "partner_pro"
    assert summary["can_create_listing"] is True

    resumed = landlord_client.post(
        "/api/v1/subscriptions/resume", headers=landlord_headers
    )
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["subscription"]["status"] == "active"
    assert resumed.json()["subscription"]["cancel_at_period_end"] is False

    landlord_client.post("/api/v1/subscriptions/cancel", headers=landlord_headers)

    db.expire_all()
    active = db.execute(
        select(Subscription).where(
            Subscription.user_id == landlord.id,
            Subscription.status == "cancelling",
        )
    ).scalar_one()
    active.ends_at = utcnow() - timedelta(seconds=1)
    db.commit()

    expired = _summary(landlord_client)
    assert expired["status"] == "free"
    assert expired["plan"]["code"] == "landlord_free"
    assert expired["listing_limit"] == 2
    assert expired["is_free"] is True


def test_staff_accounts_are_exempt_from_listing_limits(
    client, user_factory, client_factory, locations
):
    admin = user_factory(roles=["super_admin"])
    admin_client, admin_headers = client_factory(admin.phone)

    summary = _summary(admin_client)
    assert summary["staff_exempt"] is True
    assert summary["listing_limit"] is None
    assert summary["can_create_listing"] is True

    for index in range(3):
        create_property(
            admin_client,
            admin_headers,
            locations,
            title=f"Staff-managed listing {index + 1}",
        )


def test_free_plan_cannot_be_purchased(
    client, user_factory, client_factory
):
    landlord = user_factory(roles=["landlord"], plan_code=None)
    landlord_client, landlord_headers = client_factory(landlord.phone)

    response = landlord_client.post(
        "/api/v1/payments/initiate",
        json={
            "purpose": "subscription",
            "plan_code": "landlord_free",
            "idempotency_key": f"subscription-{uuid.uuid4().hex[:16]}",
        },
        headers=landlord_headers,
    )
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "validation_error"
