"""Public search, filters, facets, pagination and sorting tests."""

from __future__ import annotations

from app.tests.conftest import approve_and_publish, create_property, make_stale


def test_search_filters_sorting_and_facets(client, user_factory, client_factory, locations, db):
    landlord = user_factory(roles=["landlord"])
    admin = user_factory(roles=["super_admin"])
    landlord_client, landlord_headers = client_factory(landlord.phone)
    admin_client, admin_headers = client_factory(admin.phone)

    created = []
    for title, category, property_type, rent, bedrooms in [
        ("Budget bedsitter in Kariobangi", "residential", "bedsitter", 6000, 1),
        ("Family two-bedroom in Amani", "residential", "two_bedroom", 15000, 2),
        ("Premium three-bedroom in Matongo", "residential", "three_bedroom", 28000, 3),
        ("Market front shop in Sokoni", "commercial", "shop", 18000, 0),
    ]:
        prop = create_property(
            landlord_client,
            landlord_headers,
            locations,
            title=title,
            category=category,
            property_type=property_type,
            rent=rent,
            bedrooms=bedrooms,
        )
        approve_and_publish(admin_client, admin_headers, prop["id"])
        created.append(prop)

    response = client.get("/api/v1/properties", params={"page_size": 60})
    assert response.status_code == 200
    body = response.json()
    assert body["pagination"]["total"] == 4
    assert body["facets"]["property_types"]
    assert body["facets"]["rent_min"] == 6000.0
    assert body["facets"]["rent_max"] == 28000.0

    residential = client.get(
        "/api/v1/properties", params={"category": "residential", "page_size": 60}
    ).json()
    assert residential["pagination"]["total"] == 3

    commercial = client.get(
        "/api/v1/properties", params={"category": "commercial", "page_size": 60}
    ).json()
    assert commercial["pagination"]["total"] == 1

    cheap = client.get(
        "/api/v1/properties", params={"max_rent": 16000, "page_size": 60}
    ).json()
    assert {item["rent_amount"] for item in cheap["items"]} == {6000.0, 15000.0}

    two_beds = client.get(
        "/api/v1/properties", params={"bedrooms_min": 2, "page_size": 60}
    ).json()
    assert {item["bedrooms"] for item in two_beds["items"]} == {2, 3}

    text = client.get("/api/v1/properties", params={"q": "Matongo"}).json()
    assert text["pagination"]["total"] == 1
    assert text["items"][0]["title"].startswith("Premium")

    low = client.get(
        "/api/v1/properties", params={"sort": "rent_low", "page_size": 60}
    ).json()
    rents = [item["rent_amount"] for item in low["items"]]
    assert rents == sorted(rents)

    high = client.get(
        "/api/v1/properties", params={"sort": "rent_high", "page_size": 60}
    ).json()
    rents = [item["rent_amount"] for item in high["items"]]
    assert rents == sorted(rents, reverse=True)

    paged = client.get("/api/v1/properties", params={"page": 1, "page_size": 2}).json()
    assert len(paged["items"]) == 2
    assert paged["pagination"]["has_next"] is True
    assert paged["pagination"]["pages"] == 2

    empty = client.get(
        "/api/v1/properties", params={"max_rent": 1, "page_size": 60}
    ).json()
    assert empty["items"] == []
    assert empty["empty_state"]["fabricated_results"] is False


def test_stale_and_unapproved_listings_never_appear_in_search(
    client, user_factory, client_factory, locations, db
):
    landlord = user_factory(roles=["landlord"])
    admin = user_factory(roles=["super_admin"])
    landlord_client, landlord_headers = client_factory(landlord.phone)
    admin_client, admin_headers = client_factory(admin.phone)

    stale = create_property(
        landlord_client, landlord_headers, locations, title="Stale listing that must not show"
    )
    approve_and_publish(admin_client, admin_headers, stale["id"])
    make_stale(db, stale["id"])

    pending = create_property(
        landlord_client, landlord_headers, locations, title="Pending listing that must not show"
    )

    response = client.get("/api/v1/properties", params={"page_size": 60})
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()["items"]}
    assert stale["id"] not in ids
    assert pending["id"] not in ids
    assert response.json()["pagination"]["total"] == 0
