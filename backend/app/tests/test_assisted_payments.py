"""Assisted search, matching and M-Pesa payment idempotency tests."""

from __future__ import annotations

import uuid

from app.tests.conftest import approve_and_publish, create_property, next_phone


def create_request(client, headers=None, **overrides) -> dict:
    payload = {
        "category": "residential",
        "budget_min": 9000,
        "budget_max": 16000,
        "requirements": "A genuine two-bedroom home in Kehancha with water and parking.",
        "consent_to_share": True,
    }
    payload.update(overrides)
    response = client.post("/api/v1/search-requests", json=payload, headers=headers or {})
    assert response.status_code == 201, response.text
    return response.json()


def test_guest_assisted_request_tracking_is_token_scoped(client):
    created = create_request(
        client,
        guest_name="Guest Seeker",
        guest_phone=next_phone(),
    )
    assert created["request"]["status"] in {"submitted", "received"}
    token = created["tracking"]["tracking_token"]
    assert token

    tracked = client.get(f"/api/v1/search-requests/track/{token}")
    assert tracked.status_code == 200
    assert tracked.json()["request"]["reference"] == created["request"]["reference"]

    wrong = client.get(f"/api/v1/search-requests/track/{uuid.uuid4().hex}")
    assert wrong.status_code == 404


def test_support_transitions_and_genuine_match_sharing(
    client, user_factory, client_factory, locations
):
    landlord = user_factory(roles=["landlord"])
    admin = user_factory(roles=["super_admin"])
    support = user_factory(roles=["support_officer"])
    landlord_client, landlord_headers = client_factory(landlord.phone)
    admin_client, admin_headers = client_factory(admin.phone)
    support_client, support_headers = client_factory(support.phone)

    prop = create_property(
        landlord_client,
        landlord_headers,
        locations,
        title="Genuine match for assisted search",
        rent=14000,
        bedrooms=2,
    )
    approve_and_publish(admin_client, admin_headers, prop["id"])

    created = create_request(client, guest_name="Guest Seeker", guest_phone=next_phone())
    request_id = created["request"]["id"]

    for status in ("received", "under_review", "matching"):
        response = support_client.post(
            f"/api/v1/admin/search-requests/{request_id}/status",
            json={"status": status, "notes": f"Transition to {status}"},
            headers=support_headers,
        )
        assert response.status_code == 200, response.text
        assert response.json()["request"]["status"] == status

    invalid = support_client.post(
        f"/api/v1/admin/search-requests/{request_id}/status",
        json={"status": "completed", "notes": "Illegal jump"},
        headers=support_headers,
    )
    assert invalid.status_code == 422

    shared = support_client.post(
        f"/api/v1/admin/search-requests/{request_id}/send-matches",
        json={"notes": "One genuine match found."},
        headers=support_headers,
    )
    assert shared.status_code == 200, shared.text
    body = shared.json()
    assert body["sent"] == 1
    assert body["matches"][0]["property"]["id"] == prop["id"]
    detail = support_client.get(f"/api/v1/search-requests/{request_id}")
    assert detail.status_code == 200
    assert detail.json()["request"]["status"] == "matches_available"
    assert detail.json()["request"]["match_count"] == 1
    matches_view = support_client.get(f"/api/v1/search-requests/{request_id}/matches")
    assert matches_view.status_code == 200
    assert len(matches_view.json()["persisted"]) == 1

    # Re-sharing must reuse the same genuine match rather than invent another.
    again = support_client.post(
        f"/api/v1/admin/search-requests/{request_id}/send-matches",
        headers=support_headers,
    )
    assert again.status_code == 200
    assert len(again.json()["matches"]) == 1
    detail = support_client.get(f"/api/v1/search-requests/{request_id}")
    assert detail.json()["request"]["match_count"] == 1


def test_payment_is_mock_confirmed_idempotent_and_od_owner_scoped(
    user_factory, client_factory
):
    seeker = user_factory(roles=["property_seeker"])
    other_seeker = user_factory(roles=["property_seeker"])
    seeker_client, seeker_headers = client_factory(seeker.phone)
    other_client, other_headers = client_factory(other_seeker.phone)

    created = create_request(seeker_client, seeker_headers)
    request_id = created["request"]["id"]
    idempotency_key = f"test-{uuid.uuid4().hex[:16]}"

    first = seeker_client.post(
        "/api/v1/payments/initiate",
        json={
            "purpose": "assisted_search",
            "related_id": request_id,
            "idempotency_key": idempotency_key,
        },
        headers=seeker_headers,
    )
    assert first.status_code == 201, first.text
    body = first.json()
    assert body["payment_confirmed_by_backend"] is True
    assert body["payment"]["status"] == "success"
    assert body["payment"]["amount"] == 300.0

    replay = seeker_client.post(
        "/api/v1/payments/initiate",
        json={
            "purpose": "assisted_search",
            "related_id": request_id,
            "idempotency_key": idempotency_key,
        },
        headers=seeker_headers,
    )
    assert replay.status_code == 201
    assert replay.json()["payment"]["reference"] == body["payment"]["reference"]

    duplicate = seeker_client.post(
        "/api/v1/payments/initiate",
        json={
            "purpose": "assisted_search",
            "related_id": request_id,
            "idempotency_key": f"test-{uuid.uuid4().hex[:16]}",
        },
        headers=seeker_headers,
    )
    assert duplicate.status_code == 409

    stolen = other_client.post(
        "/api/v1/payments/initiate",
        json={
            "purpose": "assisted_search",
            "related_id": request_id,
            "idempotency_key": f"test-{uuid.uuid4().hex[:16]}",
        },
        headers=other_headers,
    )
    assert stolen.status_code == 404

    payments = seeker_client.get("/api/v1/payments")
    assert payments.status_code == 200
    assert any(row["reference"] == body["payment"]["reference"] for row in payments.json()["payments"])

    invoices = seeker_client.get("/api/v1/invoices")
    assert invoices.status_code == 200
    assert len(invoices.json()["invoices"]) == 1
