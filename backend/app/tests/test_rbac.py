"""Role-based access control and resource ownership tests."""

from __future__ import annotations

from app.tests.conftest import create_property, login, next_phone


def test_seeker_cannot_reach_admin_or_moderation(user_factory, client_factory):
    seeker = user_factory(roles=["property_seeker"])
    client, headers = client_factory(seeker.phone)

    assert client.get("/api/v1/admin/dashboard").status_code == 403
    assert client.get("/api/v1/admin/users").status_code == 403
    assert client.get("/api/v1/admin/moderation-queue").status_code == 403
    assert client.get("/api/v1/verification/queue").status_code == 403
    assert (
        client.post(
            "/api/v1/admin/properties/00000000-0000-0000-0000-000000000000/feature",
            json={"featured": True, "days": 7},
            headers=headers,
        ).status_code
        == 403
    )


def test_landlord_cannot_manage_another_landlords_property(
    user_factory, client_factory, locations
):
    owner = user_factory(roles=["landlord"], name="Owner Landlord")
    other = user_factory(roles=["landlord"], name="Other Landlord")
    owner_client, owner_headers = client_factory(owner.phone)
    other_client, other_headers = client_factory(other.phone)

    prop = create_property(owner_client, owner_headers, locations, title="Owner only listing")

    update = other_client.patch(
        f"/api/v1/properties/{prop['id']}",
        json={"title": "Hijacked listing title attempt"},
        headers=other_headers,
    )
    assert update.status_code == 403

    availability = other_client.patch(
        f"/api/v1/properties/{prop['id']}/availability",
        json={"status": "occupied"},
        headers=other_headers,
    )
    assert availability.status_code == 403

    media = other_client.post(
        f"/api/v1/properties/{prop['id']}/media",
        headers=other_headers,
        files={"files": ("test.png", b"not-an-image", "image/png")},
        data={"confirm_photo_consent": "true"},
    )
    assert media.status_code in (403, 422)

    assert other_client.get(f"/api/v1/properties/{prop['id']}").status_code == 404


def test_landlord_cannot_access_other_landlord_enquiries(
    user_factory, client_factory, locations
):
    owner = user_factory(roles=["landlord"])
    other = user_factory(roles=["landlord"])
    admin = user_factory(roles=["super_admin"])
    owner_client, owner_headers = client_factory(owner.phone)
    other_client, other_headers = client_factory(other.phone)
    admin_client, admin_headers = client_factory(admin.phone)

    prop = create_property(owner_client, owner_headers, locations, title="Enquiry ownership test")
    approved = admin_client.post(
        f"/api/v1/properties/{prop['id']}/moderate",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert approved.status_code == 200
    confirmed = admin_client.post(
        f"/api/v1/properties/{prop['id']}/confirm-availability", headers=admin_headers
    )
    assert confirmed.status_code == 200

    enquiry = owner_client.post(
        f"/api/v1/properties/{prop['id']}/enquiries",
        json={
            "name": "Interested Seeker",
            "phone": next_phone(),
            "message": "Please confirm whether this property is available next month.",
        },
        headers=owner_headers,
    )
    assert enquiry.status_code == 201, enquiry.text

    owner_enquiries = owner_client.get("/api/v1/enquiries")
    assert owner_enquiries.status_code == 200
    assert len(owner_enquiries.json()["enquiries"]) == 1

    other_enquiries = other_client.get("/api/v1/enquiries")
    assert other_enquiries.status_code == 200
    assert other_enquiries.json()["enquiries"] == []


def test_partner_and_data_permissions_are_distinct(
    user_factory, client_factory, db, locations
):
    from app.models import PartnerProfile

    landlord = user_factory(roles=["landlord"])
    data_partner = user_factory(roles=["data_partner"])
    finding_partner = user_factory(roles=["finding_partner"])
    db.add_all(
        [
            PartnerProfile(
                user_id=data_partner.id,
                partner_type="data_collection",
                status="active",
                company_name="Test Data Partner",
            ),
            PartnerProfile(
                user_id=finding_partner.id,
                partner_type="finding",
                status="active",
                company_name="Test Finding Partner",
            ),
        ]
    )
    db.commit()
    landlord_client, landlord_headers = client_factory(landlord.phone)
    data_client, data_headers = client_factory(data_partner.phone)
    finding_client, finding_headers = client_factory(finding_partner.phone)

    assert landlord_client.get("/api/v1/partners/assignments").status_code == 403
    assert landlord_client.get("/api/v1/partners/property-submissions").status_code == 403

    assert data_client.get("/api/v1/partners/property-submissions").status_code == 200
    assert data_client.get("/api/v1/partners/assignments").status_code == 200
    assert finding_client.get("/api/v1/partners/assignments").status_code == 200
    assert finding_client.get("/api/v1/partners/property-submissions").status_code == 403


def test_unauthenticated_user_cannot_access_private_endpoints(client):
    for path in (
        "/api/v1/users/me",
        "/api/v1/favourites",
        "/api/v1/viewings",
        "/api/v1/payments",
        "/api/v1/notifications",
        "/api/v1/admin/dashboard",
    ):
        response = client.get(path)
        assert response.status_code == 401, path


def test_admin_user_management_is_permissioned_and_audited(
    user_factory, client_factory, db
):
    admin = user_factory(roles=["super_admin"])
    target = user_factory(roles=["property_seeker"], name="Target User")
    admin_client, admin_headers = client_factory(admin.phone)

    update = admin_client.patch(
        f"/api/v1/admin/users/{target.id}",
        json={"status": "suspended"},
        headers=admin_headers,
    )
    assert update.status_code == 200
    assert update.json()["user"]["status"] == "suspended"

    from app.models import AuditLog

    assert any(row.action == "user.admin_updated" for row in db.query(AuditLog).all())
