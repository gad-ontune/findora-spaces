"""Viewing request, scheduling, ownership and feedback tests."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.tests.conftest import approve_and_publish, create_property, next_phone


def test_guest_viewing_lifecycle_and_feedback(
    client, user_factory, client_factory, locations
):
    landlord = user_factory(roles=["landlord"])
    admin = user_factory(roles=["super_admin"])
    seeker = user_factory(roles=["property_seeker"])
    landlord_client, landlord_headers = client_factory(landlord.phone)
    admin_client, admin_headers = client_factory(admin.phone)
    seeker_client, seeker_headers = client_factory(seeker.phone)

    prop = create_property(
        landlord_client, landlord_headers, locations, title="Viewing lifecycle test property"
    )
    approve_and_publish(admin_client, admin_headers, prop["id"])

    phone = next_phone()
    requested = client.post(
        "/api/v1/viewings",
        json={
            "property_id": prop["id"],
            "seeker_name": "Viewing Guest",
            "seeker_phone": phone,
            "preferred_date": str(date.today() + timedelta(days=2)),
            "notes": "Prefer a late afternoon viewing.",
        },
    )
    assert requested.status_code == 201, requested.text
    viewing = requested.json()["viewing"]
    assert viewing["status"] == "requested"

    duplicate = client.post(
        "/api/v1/viewings",
        json={
            "property_id": prop["id"],
            "seeker_name": "Viewing Guest",
            "seeker_phone": phone,
        },
    )
    assert duplicate.status_code == 409

    landlord_viewings = landlord_client.get("/api/v1/viewings")
    assert landlord_viewings.status_code == 200
    assert any(row["id"] == viewing["id"] for row in landlord_viewings.json()["viewings"])

    confirmed = landlord_client.patch(
        f"/api/v1/viewings/{viewing['id']}",
        json={
            "status": "confirmed",
            "scheduled_at": str(date.today() + timedelta(days=2)),
            "meeting_point": "Meet at the Amani junction.",
        },
        headers=landlord_headers,
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["viewing"]["status"] == "confirmed"

    # A different seeker cannot submit feedback on this viewing.
    other = user_factory(roles=["property_seeker"])
    other_client, other_headers = client_factory(other.phone)
    forbidden = other_client.post(
        f"/api/v1/viewings/{viewing['id']}/feedback",
        json={"rating": 5, "comments": "Not my viewing."},
        headers=other_headers,
    )
    assert forbidden.status_code in (403, 404)

    feedback = seeker_client.post(
        f"/api/v1/viewings/{viewing['id']}/feedback",
        json={
            "matched_photos": True,
            "matched_description": True,
            "rent_matched": True,
            "property_available": True,
            "representative_reachable": True,
            "suspected_fraud": False,
            "rating": 4,
            "comments": "The unit matched the listing and the representative was on time.",
        },
        headers=seeker_headers,
    )
    # The seeker is not the guest who requested the viewing.
    assert feedback.status_code in (403, 404)


def test_viewing_feedback_works_for_signed_in_seeker(
    user_factory, client_factory, locations
):
    landlord = user_factory(roles=["landlord"])
    admin = user_factory(roles=["super_admin"])
    seeker = user_factory(roles=["property_seeker"])
    landlord_client, landlord_headers = client_factory(landlord.phone)
    admin_client, admin_headers = client_factory(admin.phone)
    seeker_client, seeker_headers = client_factory(seeker.phone)

    prop = create_property(
        landlord_client, landlord_headers, locations, title="Seeker feedback test property"
    )
    approve_and_publish(admin_client, admin_headers, prop["id"])

    requested = seeker_client.post(
        "/api/v1/viewings",
        json={
            "property_id": prop["id"],
            "seeker_name": seeker.name,
            "seeker_phone": seeker.phone,
        },
        headers=seeker_headers,
    )
    assert requested.status_code == 201, requested.text
    viewing_id = requested.json()["viewing"]["id"]

    confirmed = landlord_client.patch(
        f"/api/v1/viewings/{viewing_id}",
        json={
            "status": "confirmed",
            "scheduled_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        },
        headers=landlord_headers,
    )
    assert confirmed.status_code == 200, confirmed.text

    feedback = seeker_client.post(
        f"/api/v1/viewings/{viewing_id}/feedback",
        json={
            "matched_photos": True,
            "rent_matched": True,
            "property_available": True,
            "rating": 5,
            "comments": "Everything matched and the viewing was well organised.",
        },
        headers=seeker_headers,
    )
    assert feedback.status_code == 201, feedback.text
    assert feedback.json()["feedback"]["rating"] == 5

    duplicate = seeker_client.post(
        f"/api/v1/viewings/{viewing_id}/feedback",
        json={"rating": 4},
        headers=seeker_headers,
    )
    assert duplicate.status_code == 409
