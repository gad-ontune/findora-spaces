"""Public visibility, moderation and freshness gating tests."""

from __future__ import annotations

from app.tests.conftest import (
    approve_and_publish,
    create_property,
    login,
    make_occupied,
    make_stale,
    next_phone,
)


def test_only_approved_available_fresh_listings_are_public(
    client, user_factory, client_factory, locations, db
):
    landlord = user_factory(roles=["landlord"])
    admin = user_factory(roles=["super_admin"])
    landlord_client, landlord_headers = client_factory(landlord.phone)
    admin_client, admin_headers = client_factory(admin.phone)

    visible = create_property(
        landlord_client,
        landlord_headers,
        locations,
        title="Visible two-bedroom home in Kehancha",
    )
    approve_and_publish(admin_client, admin_headers, visible["id"])

    pending = create_property(
        landlord_client,
        landlord_headers,
        locations,
        title="Pending moderation listing in Kehancha",
    )

    unconfirmed = create_property(
        landlord_client,
        landlord_headers,
        locations,
        title="Approved but unconfirmed listing in Kehancha",
        confirm_available_now=False,
    )
    response = admin_client.post(
        f"/api/v1/properties/{unconfirmed['id']}/moderate",
        json={"action": "approve", "reason": "Approved for visibility test"},
        headers=admin_headers,
    )
    assert response.status_code == 200

    stale = create_property(
        landlord_client,
        landlord_headers,
        locations,
        title="Stale availability listing in Kehancha",
    )
    approve_and_publish(admin_client, admin_headers, stale["id"])
    make_stale(db, stale["id"])

    occupied = create_property(
        landlord_client,
        landlord_headers,
        locations,
        title="Occupied listing in Kehancha",
    )
    approve_and_publish(admin_client, admin_headers, occupied["id"])
    make_occupied(db, occupied["id"])

    search = client.get("/api/v1/properties", params={"page_size": 60})
    assert search.status_code == 200
    ids = {item["id"] for item in search.json()["items"]}
    assert visible["id"] in ids
    assert pending["id"] not in ids
    assert unconfirmed["id"] not in ids
    assert stale["id"] not in ids
    assert occupied["id"] not in ids
    assert search.json()["pagination"]["total"] == 1

    # Direct links must enforce the same gate as search.
    assert client.get(f"/api/v1/properties/{visible['id']}").status_code == 200
    for hidden in (pending, unconfirmed, stale, occupied):
        assert client.get(f"/api/v1/properties/{hidden['id']}").status_code == 404
        assert client.get(f"/api/v1/properties/{hidden['id']}/media").status_code == 404
        assert (
            client.get(f"/api/v1/properties/{hidden['id']}/availability-history").status_code
            == 404
        )
        assert client.get(f"/api/v1/properties/{hidden['id']}/verification").status_code == 404

    # The owner and staff can still see their own unpublished records.
    own = landlord_client.get(f"/api/v1/properties/{unconfirmed['id']}")
    assert own.status_code == 200
    assert "management" in own.json()["property"]
    staff_view = admin_client.get(f"/api/v1/properties/{pending['id']}")
    assert staff_view.status_code == 200


def test_enquiries_and_viewings_blocked_for_hidden_listings(
    client, user_factory, client_factory, locations
):
    landlord = user_factory(roles=["landlord"])
    landlord_client, landlord_headers = client_factory(landlord.phone)
    hidden = create_property(
        landlord_client,
        landlord_headers,
        locations,
        title="Unconfirmed property that must stay private",
        confirm_available_now=False,
    )

    enquiry = client.post(
        f"/api/v1/properties/{hidden['id']}/enquiries",
        json={
            "name": "Test Guest",
            "phone": next_phone(),
            "message": "Is this hidden property available for a viewing this week?",
        },
    )
    assert enquiry.status_code == 404

    viewing = client.post(
        "/api/v1/viewings",
        json={
            "property_id": hidden["id"],
            "seeker_name": "Test Guest",
            "seeker_phone": next_phone(),
        },
    )
    assert viewing.status_code in (404, 422)


def test_approved_listing_becomes_public_only_after_availability_confirmation(
    client, user_factory, client_factory, locations
):
    landlord = user_factory(roles=["landlord"])
    admin = user_factory(roles=["super_admin"])
    landlord_client, landlord_headers = client_factory(landlord.phone)
    admin_client, admin_headers = client_factory(admin.phone)

    prop = create_property(
        landlord_client,
        landlord_headers,
        locations,
        title="Listing waiting for availability confirmation",
        confirm_available_now=False,
    )
    approved = admin_client.post(
        f"/api/v1/properties/{prop['id']}/moderate",
        json={"action": "approve", "reason": "Content approved"},
        headers=admin_headers,
    )
    assert approved.status_code == 200
    assert client.get(f"/api/v1/properties/{prop['id']}").status_code == 404

    confirmed = admin_client.post(
        f"/api/v1/properties/{prop['id']}/confirm-availability", headers=admin_headers
    )
    assert confirmed.status_code == 200
    assert client.get(f"/api/v1/properties/{prop['id']}").status_code == 200


def test_moderation_requires_permission_and_audits_action(
    user_factory, client_factory, locations, db
):
    landlord = user_factory(roles=["landlord"])
    moderator = user_factory(roles=["moderator"])
    landlord_client, landlord_headers = client_factory(landlord.phone)
    moderator_client, moderator_headers = client_factory(moderator.phone)

    prop = create_property(
        landlord_client, landlord_headers, locations, title="Listing for moderation audit"
    )
    forbidden = landlord_client.post(
        f"/api/v1/properties/{prop['id']}/moderate",
        json={"action": "approve"},
        headers=landlord_headers,
    )
    assert forbidden.status_code == 403

    approved = moderator_client.post(
        f"/api/v1/properties/{prop['id']}/moderate",
        json={"action": "approve", "reason": "Checked listing content"},
        headers=moderator_headers,
    )
    assert approved.status_code == 200

    from app.models import AuditLog

    actions = [row.action for row in db.query(AuditLog).all()]
    assert "property.approve" in actions
