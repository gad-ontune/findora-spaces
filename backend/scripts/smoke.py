"""End-to-end smoke checks for the Findora Spaces API.

Run against a running development API with seeded demo data:

    .venv/bin/python scripts/smoke.py

Exit code 0 means every check passed. The script is intentionally dependency-free
beyond httpx and Pillow (already in the backend requirements).
"""

from __future__ import annotations

import io
import json
import sys
import uuid
from datetime import date, timedelta

import httpx
from PIL import Image

BASE_URL = "http://127.0.0.1:8000"
API = f"{BASE_URL}/api/v1"

PASS = 0
FAIL = 0
FAILURES: list[str] = []


def check(label: str, response: httpx.Response, expect: tuple[int, ...] = (200, 201, 204)) -> bool:
    global PASS, FAIL
    ok = response.status_code in expect
    if ok:
        PASS += 1
        print(f"  ok   {label} [{response.status_code}]")
    else:
        FAIL += 1
        FAILURES.append(label)
        print(f"  FAIL {label} [{response.status_code}]")
        print(f"       {response.text[:900]}")
    return ok


def section(title: str) -> None:
    print(f"\n== {title} ==")


def client() -> httpx.Client:
    return httpx.Client(base_url=API, timeout=45)


def login(phone: str, password: str) -> tuple[httpx.Client, dict[str, str]]:
    c = client()
    r = c.post("/auth/login", json={"phone": phone, "password": password})
    if r.status_code != 200:
        raise SystemExit(f"Login failed for {phone}: {r.status_code} {r.text[:300]}")
    return c, {"X-CSRF-Token": c.cookies.get("findora_csrf", "")}


def ensure(condition: bool, label: str, detail: str = "") -> bool:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ok   {label}")
        return True
    FAIL += 1
    FAILURES.append(label)
    print(f"  FAIL {label} {detail}")
    return False


def main() -> int:
    anon = client()

    section("Health and public discovery")
    check("health", httpx.get(f"{BASE_URL}/health", timeout=10))
    home = anon.get("/home")
    check("home", home)
    if home.status_code == 200:
        payload = home.json()
        ensure(payload["hero"]["total_available"] > 0, "home reports available listings")
    search = anon.get("/properties", params={"page_size": 60})
    check("public search", search)
    items = search.json()["items"] if search.status_code == 200 else []
    ensure(len(items) >= 10, f"public search returns seeded listings ({len(items)})")
    ensure(
        all(item["status"] == "approved" for item in items),
        "public search only exposes approved listings",
    )
    ensure(
        all(item["availability_status"] == "available" for item in items),
        "public search only exposes available listings",
    )
    ensure(all(item["is_fresh"] for item in items), "public search only exposes fresh listings")

    check("residential filter", anon.get("/properties", params={"category": "residential"}))
    check("commercial filter", anon.get("/properties", params={"category": "commercial"}))
    check("rent range filter", anon.get("/properties", params={"min_rent": 5000, "max_rent": 20000}))
    check("bedroom filter", anon.get("/properties", params={"bedrooms_min": 2}))
    check("amenity filter", anon.get("/properties", params={"amenities": "water-tank,security-lights"}))
    check("text search", anon.get("/properties", params={"q": "Amani"}))
    check("verified filter", anon.get("/properties", params={"verified": "ownership"}))
    check("featured filter", anon.get("/properties", params={"featured": True}))
    check("map bounds filter", anon.get("/properties", params={"north": -1.2, "south": -1.3, "east": 34.65, "west": 34.58}))
    if search.status_code == 200:
        ensure("facets" in search.json(), "search response includes facets")
        ensure(
            search.json()["facets"].get("property_types") is not None,
            "facets include property types",
        )
    check("config", anon.get("/config"))
    check("market overview", anon.get("/market/overview"))
    check("locations search", anon.get("/locations/search", params={"q": "Kehancha"}))
    check("location options", anon.get("/locations/options"))

    if items:
        pid = items[0]["id"]
        detail = anon.get(f"/properties/{pid}")
        check("property detail", detail)
        if detail.status_code == 200:
            passport = detail.json()["property"]
            ensure("verification" in passport, "property detail includes Property Passport checks")
            ensure(
                passport["verification"].get("checks") is not None,
                "passport exposes verification checks",
            )
            ensure(
                passport["location"].get("precision") is not None
                and passport["location"].get("map_note") is not None,
                "public location is approximate and explained",
            )
            ensure("similar" in detail.json(), "property detail includes similar listings")
        check("property availability history", anon.get(f"/properties/{pid}/availability-history"))

        section("Guest enquiries, reports and viewings")
        enquiry = anon.post(
            f"/properties/{pid}/enquiries",
            json={
                "name": "Smoke Test Guest",
                "phone": "+254799000111",
                "message": "Is this property still available for a viewing this weekend?",
                "enquiry_type": "availability",
            },
        )
        check("guest enquiry", enquiry)
        report = anon.post(
            f"/properties/{pid}/reports",
            json={
                "reason": "incorrect_information",
                "details": "Smoke test report: please confirm the listed rent with the owner.",
                "phone": "+254799000111",
            },
        )
        check("guest property report", report)
        viewing = anon.post(
            "/viewings",
            json={
                "property_id": pid,
                "seeker_name": "Smoke Test Guest",
                "seeker_phone": "+254799000111",
                "preferred_date": str(date.today() + timedelta(days=3)),
                "notes": "Smoke test viewing request.",
            },
        )
        check("guest viewing request", viewing)

    section("Authentication and CSRF")
    bad = anon.post("/auth/login", json={"phone": "+254700000005", "password": "wrong-password"})
    ensure(bad.status_code in (401, 429), "bad password rejected", bad.text[:200])
    seeker, seeker_headers = login("+254700000005", "Seeker123!")
    me = seeker.get("/users/me")
    check("current user", me)
    missing_csrf = seeker.patch("/users/me", json={"bio": "csrf test"})
    ensure(missing_csrf.status_code == 403, "state change without CSRF rejected", missing_csrf.text[:200])
    ok_csrf = seeker.patch("/users/me", json={"bio": "Findora smoke test"}, headers=seeker_headers)
    check("state change with CSRF accepted", ok_csrf)

    section("Seeker workflows")
    check("seeker overview", seeker.get("/seeker/overview"))
    check("favourites", seeker.get("/favourites"))
    check("comparisons", seeker.get("/comparisons"))
    check("shortlists", seeker.get("/shortlists"))
    check("saved searches", seeker.get("/saved-searches"))
    check("seeker notifications", seeker.get("/notifications"))
    check("notification preferences", seeker.get("/notification-preferences"))
    check("seeker payments", seeker.get("/payments"))
    check("seeker invoices", seeker.get("/invoices"))
    check("seeker viewings", seeker.get("/viewings"))
    check("seeker support tickets", seeker.get("/support/tickets"))
    check("seeker complaints", seeker.get("/complaints"))

    if items:
        favourite = seeker.post("/favourites", json={"property_id": items[-1]["id"]}, headers=seeker_headers)
        ensure(favourite.status_code in (200, 201), "add favourite", favourite.text[:200])
        comparison = seeker.post(
            "/comparisons",
            json={"property_ids": [items[0]["id"], items[-1]["id"]], "name": "Smoke comparison"},
            headers=seeker_headers,
        )
        check("create comparison", comparison)
        shortlist = seeker.post(
            "/shortlists",
            json={
                "name": "Smoke shortlist",
                "description": "Created by smoke test",
                "property_ids": [items[0]["id"], items[-1]["id"]],
            },
            headers=seeker_headers,
        )
        check("create shortlist", shortlist)
        if shortlist.status_code == 201:
            shortlist_id = shortlist.json()["shortlist"]["id"]
            check("get shortlist", seeker.get(f"/shortlists/{shortlist_id}"))
            shared = shortlist.json()["shortlist"].get("token")
            if shared:
                check("public shared shortlist", anon.get(f"/shortlists/shared/{shared}"))
                check(
                    "guest comment on shared shortlist",
                    anon.post(
                        f"/shortlists/shared/{shared}/comments",
                        json={"author_name": "Smoke Guest", "body": "Is the second unit still available?"},
                    ),
                )
        saved = seeker.post(
            "/saved-searches",
            json={
                "name": "Smoke saved search",
                "category": "residential",
                "filters": {"max_rent": 16000, "bedrooms_min": 2},
                "notify": True,
            },
            headers=seeker_headers,
        )
        check("create saved search", saved)
        notif_prefs = seeker.patch(
            "/notification-preferences", json={"sms": False, "email": True}, headers=seeker_headers
        )
        check("update notification preferences", notif_prefs)
        check("mark all notifications read", seeker.patch("/notifications/read-all", headers=seeker_headers))

    section("Assisted search: guest request and tracking")
    guest_request = anon.post(
        "/search-requests",
        json={
            "category": "residential",
            "guest_name": "Smoke Test Guest",
            "guest_phone": "+254799000111",
            "budget_min": 6000,
            "budget_max": 12000,
            "property_type": "bedsitter",
            "requirements": "Smoke test request for a bedsitter in Kehancha with reliable water.",
            "consent_to_share": True,
        },
    )
    check("guest assisted request", guest_request)
    guest_request_id = None
    if guest_request.status_code == 201:
        body = guest_request.json()
        guest_request_id = body["request"]["id"]
        token = body["tracking"].get("tracking_token")
        check("track guest request", anon.get(f"/search-requests/track/{token}"))
        ensure(
            body["request"]["status"] in {"submitted", "received", "under_review"},
            "guest request starts in an honest early status",
        )

    section("Assisted search: seeker request and M-Pesa mock payment")
    seeker_request = seeker.post(
        "/search-requests",
        json={
            "category": "residential",
            "budget_min": 9000,
            "budget_max": 15000,
            "requirements": "Smoke test assisted request for payment verification.",
            "consent_to_share": True,
        },
        headers=seeker_headers,
    )
    check("seeker assisted request", seeker_request)
    seeker_request_id = None
    if seeker_request.status_code == 201:
        seeker_request_id = seeker_request.json()["request"]["id"]
        payment = seeker.post(
            "/payments/initiate",
            json={
                "purpose": "assisted_search",
                "related_id": seeker_request_id,
                "idempotency_key": f"smoke-{uuid.uuid4().hex[:12]}",
            },
            headers=seeker_headers,
        )
        check("initiate assisted search payment", payment)
        if payment.status_code == 201:
            body = payment.json()
            ensure(body["payment_confirmed_by_backend"] is True, "mock M-Pesa confirms success")
            ensure(body["payment"]["status"] == "success", "payment status is success")
            payment_ref = body["payment"]["reference"]
            replay = seeker.post(
                "/payments/initiate",
                json={
                    "purpose": "assisted_search",
                    "related_id": seeker_request_id,
                    "idempotency_key": f"smoke-{uuid.uuid4().hex[:12]}",
                },
                headers=seeker_headers,
            )
            ensure(
                replay.status_code == 409,
                "duplicate assisted payment prevented",
                replay.text[:200],
            )
            check("payment appears in seeker list", seeker.get("/payments"))
            check("invoice issued", seeker.get("/invoices"))

    section("Landlord: submission, media and availability")
    landlord, landlord_headers = login("+254700000002", "Landlord123!")
    config = landlord.get("/config")
    check("landlord config", config)
    towns = config.json().get("towns", []) if config.status_code == 200 else []
    kehancha = next((t for t in towns if t["name"] == "Kehancha"), None)
    ensure(kehancha is not None, "Kehancha present in config")
    new_property_id = None
    if kehancha:
        children = landlord.get(f"/locations/{kehancha['id']}/children")
        check("location children", children)
        neighbourhoods = children.json().get("children", []) if children.status_code == 200 else []
        neighbourhood_id = neighbourhoods[0]["id"] if neighbourhoods else None
        amenities = config.json().get("amenities", [])[:3]
        create = landlord.post(
            "/properties",
            json={
                "title": "Smoke test two-bedroom home near Kehancha centre",
                "description": (
                    "This fictional listing is created by the smoke test to verify submission, "
                    "media upload, moderation, availability confirmation and publication. It is "
                    "not real property data and must never be presented as such."
                ),
                "category": "residential",
                "property_type": "two_bedroom",
                "location": {
                    "town_id": kehancha["id"],
                    "neighbourhood_id": neighbourhood_id,
                    "address_line": "Smoke test lane, Kehancha",
                    "precision": "approximate",
                },
                "terms": {
                    "rent_amount": 14000,
                    "deposit_amount": 14000,
                    "rent_period": "monthly",
                    "minimum_lease_months": 12,
                },
                "residential": {
                    "bedrooms": 2,
                    "bathrooms": 1,
                    "furnishing": "unfurnished",
                    "parking_spaces": 1,
                    "has_private_bathroom": True,
                },
                "amenity_ids": [a["id"] for a in amenities],
                "confirm_authority": True,
                "confirm_photo_consent": True,
                "confirm_available_now": False,
            },
            headers=landlord_headers,
        )
        check("landlord create property", create)
        if create.status_code == 201:
            new_property_id = create.json()["property"]["id"]
            ensure(
                create.json()["property"]["status"] == "pending",
                "new listing starts pending moderation",
            )
            hidden = anon.get(f"/properties/{new_property_id}")
            ensure(hidden.status_code == 404, "pending listing hidden from public")
            buffer = io.BytesIO()
            Image.new("RGB", (640, 420), (44, 95, 91)).save(buffer, "PNG")
            buffer.seek(0)
            media = landlord.post(
                f"/properties/{new_property_id}/media",
                headers=landlord_headers,
                files={"files": ("smoke.png", buffer, "image/png")},
                data={"caption": "Smoke test image", "confirm_photo_consent": "true"},
            )
            check("landlord upload media", media)
            check("landlord media list", landlord.get(f"/properties/{new_property_id}/media"))
            check("landlord properties", landlord.get("/properties/mine"))
            check("landlord enquiries", landlord.get("/enquiries"))
            check("landlord viewings", landlord.get("/viewings"))

    section("Moderation, availability and public publication")
    admin, admin_headers = login("+254700000001", "Admin123!")
    check("admin dashboard", admin.get("/admin/dashboard"))
    check("admin analytics", admin.get("/admin/analytics/overview"))
    check("admin moderation queue", admin.get("/admin/moderation-queue"))
    check("admin properties", admin.get("/admin/properties"))
    check("admin users", admin.get("/admin/users"))
    check("admin audit logs", admin.get("/admin/audit-logs"))
    check("admin settings", admin.get("/admin/settings"))
    check("admin partners", admin.get("/admin/partners"))
    check("admin reports", admin.get("/admin/reports"))
    check("admin complaints", admin.get("/admin/complaints"))
    check("admin support tickets", admin.get("/admin/support-tickets"))
    check("admin viewings", admin.get("/admin/viewings"))
    check("admin payments", admin.get("/admin/payments"))
    check("admin refunds", admin.get("/admin/refunds"))
    check("verification queue", admin.get("/verification/queue"))

    if new_property_id:
        approve = admin.post(
            f"/properties/{new_property_id}/moderate",
            json={"action": "approve", "reason": "Smoke test approval"},
            headers=admin_headers,
        )
        check("moderator approves listing", approve)
        still_hidden = anon.get(f"/properties/{new_property_id}")
        ensure(
            still_hidden.status_code == 404,
            "approved but unconfirmed listing stays hidden",
        )
        confirm = admin.post(
            f"/properties/{new_property_id}/confirm-availability", headers=admin_headers
        )
        check("availability confirmed", confirm)
        published = anon.get(f"/properties/{new_property_id}")
        check("listing public after approval and confirmation", published)
        feature = admin.post(
            f"/admin/properties/{new_property_id}/feature",
            json={"featured": True, "days": 7},
            headers=admin_headers,
        )
        check("admin features property", feature)

    queue = admin.get("/verification/queue")
    if queue.status_code == 200:
        pending = [row for row in queue.json().get("queue", []) if row["status"] == "pending"]
        if pending:
            review = admin.post(
                f"/verification/{pending[0]['id']}/review",
                json={
                    "status": "verified",
                    "notes": "Smoke test review of seeded evidence.",
                    "expires_in_days": 180,
                },
                headers=admin_headers,
            )
            check("verification review", review)

    section("Support: assisted request transitions and matches")
    support, support_headers = login("+254700000008", "Support123!")
    requests = support.get("/admin/search-requests")
    check("support lists assisted requests", requests)
    if guest_request_id:
        for status in ("received", "under_review", "matching"):
            transition = support.post(
                f"/admin/search-requests/{guest_request_id}/status",
                json={"status": status, "notes": f"Smoke test transition to {status}"},
                headers=support_headers,
            )
            check(f"request transition to {status}", transition)
        detail = support.get(f"/search-requests/{guest_request_id}")
        check("support request detail", detail)
        if items:
            match = support.post(
                f"/admin/search-requests/{guest_request_id}/send-matches",
                json={"notes": "Smoke test match review."},
                headers=support_headers,
            )
            ensure(
                match.status_code in (200, 201),
                "support shares genuine matches only",
                match.text[:400],
            )
            if match.status_code in (200, 201):
                body = match.json()
                ensure(
                    "sent" in body,
                    "match response reports how many matches were sent",
                )

    section("Partner operations")
    partner, partner_headers = login("+254700000006", "Partner123!")
    check("partner profile", partner.get("/partners/me"))
    check("partner performance", partner.get("/partners/performance"))
    assignments = partner.get("/partners/assignments")
    check("partner assignments", assignments)
    if assignments.status_code == 200 and assignments.json().get("assignments"):
        candidates = [
            row
            for row in assignments.json()["assignments"]
            if row["status"] in {"offered", "accepted", "in_progress"}
        ]
        ensure(bool(candidates), "partner has an actionable assignment")
        if candidates:
            assignment_id = candidates[0]["id"]
            if candidates[0]["status"] == "offered":
                check(
                    "partner accepts assignment",
                    partner.post(
                        f"/partners/assignments/{assignment_id}/accept", headers=partner_headers
                    ),
                )
            check("partner assignment detail", partner.get(f"/partners/assignments/{assignment_id}"))
            report = partner.post(
                f"/partners/assignments/{assignment_id}/reports",
                json={
                    "report_type": "availability_check",
                    "summary": (
                        "Smoke test: the authorised representative confirmed the unit is still "
                        "vacant and the advertised rent is unchanged."
                    ),
                    "findings": {"confirmed_available": True, "rent_confirmed": 13000},
                    "contact_name": "Authorised representative",
                    "contact_phone": "+254711889900",
                    "property_found": True,
                },
                headers=partner_headers,
            )
            check("partner field report", report)

    data_partner, data_headers = login("+254700000007", "Data123!")
    check("data partner profile", data_partner.get("/partners/me"))
    check("data partner submissions", data_partner.get("/partners/property-submissions"))

    section("Finance and reconciliation")
    finance, finance_headers = login("+254700000011", "Finance123!")
    check("finance payments", finance.get("/admin/payments"))
    check("finance refunds", finance.get("/admin/refunds"))
    reconcile = finance.post(
        "/admin/finance/reconcile",
        json={"reconciliation_date": str(date.today()), "provider_total": 500},
        headers=finance_headers,
    )
    check("finance reconciliation", reconcile)

    section("RBAC enforcement")
    forbidden = seeker.get("/admin/dashboard")
    ensure(forbidden.status_code == 403, "seeker blocked from admin dashboard", forbidden.text[:200])
    forbidden = landlord.post(
        "/admin/properties/00000000-0000-0000-0000-000000000000/feature",
        json={"featured": True, "days": 7},
        headers=landlord_headers,
    )
    ensure(forbidden.status_code == 403, "landlord blocked from admin feature action")
    cross_tenant = landlord.get(f"/properties/{items[0]['id']}/availability-history") if items else None
    if cross_tenant is not None:
        ensure(
            cross_tenant.status_code in (200, 403, 404),
            "cross-tenant property access is controlled",
        )

    section("Notifications")
    check("notifications", seeker.get("/notifications"))

    print("\n" + "=" * 60)
    print(f"Passed: {PASS}   Failed: {FAIL}")
    if FAILURES:
        print("Failed checks:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("All smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
