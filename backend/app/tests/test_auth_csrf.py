"""Authentication, session and CSRF protection tests."""

from __future__ import annotations

from app.tests.conftest import TEST_PASSWORD, login, next_phone


def register_payload(phone: str, **overrides) -> dict:
    payload = {
        "name": "Test Seeker",
        "phone": phone,
        "email": f"seeker-{phone[-6:]}@example.com",
        "password": TEST_PASSWORD,
        "account_type": "property_seeker",
        "consent": True,
        "marketing_consent": False,
    }
    payload.update(overrides)
    return payload


def test_registration_otp_login_and_logout(client):
    phone = next_phone()
    response = client.post("/api/v1/auth/register", json=register_payload(phone))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["requires_phone_verification"] is True
    code = body["otp_debug"]
    assert code, "debug OTP should be exposed in test/development mode"

    response = client.post(
        "/api/v1/auth/verify-phone", json={"phone": phone, "code": code}
    )
    assert response.status_code == 200, response.text
    assert client.cookies.get("findora_session")
    csrf = client.cookies.get("findora_csrf")
    assert csrf

    me = client.get("/api/v1/users/me")
    assert me.status_code == 200
    assert me.json()["user"]["phone_verified"] is True

    logout = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
    assert logout.status_code == 200
    assert client.get("/api/v1/users/me").status_code == 401


def test_duplicate_registration_is_rejected(client):
    phone = next_phone()
    assert client.post("/api/v1/auth/register", json=register_payload(phone)).status_code == 201
    duplicate = client.post("/api/v1/auth/register", json=register_payload(phone))
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "conflict"


def test_wrong_password_and_unverified_login(client, user_factory):
    user = user_factory(roles=["property_seeker"], verified=False)
    wrong = client.post(
        "/api/v1/auth/login", json={"phone": user.phone, "password": "WrongPass123!"}
    )
    assert wrong.status_code == 401
    correct = client.post(
        "/api/v1/auth/login", json={"phone": user.phone, "password": TEST_PASSWORD}
    )
    assert correct.status_code == 200
    # Unverified accounts may sign in but cannot submit property data.
    blocked = client.post(
        "/api/v1/properties",
        json={
            "title": "Unverified landlord listing attempt",
            "description": "This should be blocked until the phone number is verified by the owner.",
            "category": "residential",
            "property_type": "two_bedroom",
            "location": {"town_id": "00000000-0000-0000-0000-000000000000"},
            "terms": {"rent_amount": 10000, "deposit_amount": 10000},
            "residential": {"bedrooms": 2, "bathrooms": 1},
            "confirm_authority": True,
        },
        headers={"X-CSRF-Token": client.cookies.get("findora_csrf")},
    )
    assert blocked.status_code in (403, 422)


def test_csrf_required_for_state_changes(client, user_factory):
    user = user_factory(roles=["property_seeker"])
    headers = login(client, user.phone)
    missing = client.patch("/api/v1/users/me", json={"bio": "No CSRF token"})
    assert missing.status_code == 403
    assert missing.json()["error"]["code"] == "csrf_failed"
    accepted = client.patch(
        "/api/v1/users/me", json={"bio": "CSRF token supplied"}, headers=headers
    )
    assert accepted.status_code == 200
    assert accepted.json()["user"]["profile"]["bio"] == "CSRF token supplied"


def test_csrf_not_required_for_reads_and_public_writes(client):
    assert client.get("/api/v1/home").status_code == 200
    # Guest enquiries are public writes and are intentionally exempt.
    response = client.post(
        "/api/v1/search-requests",
        json={
            "category": "residential",
            "guest_name": "Guest Caller",
            "guest_phone": next_phone(),
            "budget_max": 15000,
            "requirements": "A modest one-bedroom home in Kehancha for a single professional.",
            "consent_to_share": True,
        },
    )
    assert response.status_code == 201, response.text
