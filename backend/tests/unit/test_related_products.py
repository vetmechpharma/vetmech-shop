import pytest
from security import create_token


def product(pid, **fields):
    return {"id": pid, "slug": pid, "name": pid, "active": True, "variants": [
        {"id": pid + "-pack", "pack_size": "100 ml", "mrp": 500, "selling_price": 300},
    ], **fields}


@pytest.mark.asyncio
async def test_related_products_randomly_sample_the_full_category_and_never_exceed_four(client, database, monkeypatch):
    from mongomock.aggregate import _random

    await database.products.insert_many([
        product("current", category_id="cattle", related_product_ids=["inactive"]),
        *[product(f"candidate-{i}", category_ids=["cattle"]) for i in range(10)],
        product("inactive", category_id="cattle", active=False),
    ])
    # Control the mock sampler so this checks changing results without a flaky probability test.
    monkeypatch.setattr(_random, "shuffle", lambda rows: rows.reverse())
    first = client.get("/api/products/current").json()["related"]
    assert {row["id"] for row in first} == {f"candidate-{i}" for i in range(6, 10)}
    monkeypatch.setattr(_random, "shuffle", lambda rows: None)
    second = client.get("/api/products/current").json()["related"]
    assert {row["id"] for row in second} == {f"candidate-{i}" for i in range(4)}
    for rows in [first, second]:
        assert len(rows) == len({row["id"] for row in rows}) == 4
        assert all("_id" not in row and row["variants"][0]["selling_price"] is None for row in rows)


@pytest.mark.asyncio
async def test_related_products_prefer_all_assigned_categories_and_fill_available_spaces(client, database):
    await database.products.insert_many([
        product("current", category_id="cattle", category_ids=["poultry"]),
        product("primary", category_id="cattle"),
        product("secondary", category_id="other", category_ids=["poultry"]),
        *[product(f"other-{i}", category_id="other") for i in range(6)],
    ])
    rows = client.get("/api/products/current").json()["related"]
    assert {row["id"] for row in rows[:2]} == {"primary", "secondary"}
    assert len(rows) == len({row["id"] for row in rows}) == 4
    assert all(row["id"].startswith("other-") for row in rows[2:])


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [0, 2, 7])
async def test_products_without_a_category_show_only_available_active_alternatives(client, database, count):
    await database.products.insert_many([
        product("current"), product("inactive", active=False),
        *[product(f"other-{i}") for i in range(count)],
    ])
    response = client.get("/api/products/current")
    assert response.status_code == 200
    rows = response.json()["related"]
    assert len(rows) == len({row["id"] for row in rows}) == min(4, count)
    assert all(row["id"].startswith("other-") for row in rows)


@pytest.mark.asyncio
async def test_new_product_participates_automatically_with_customer_rates_and_no_manual_assignments(client, database):
    await database.products.insert_one(product("current", category_id="cattle"))
    await database.admin_users.insert_one({"id": "owner", "role": "super_admin", "active": True})
    admin = {"Authorization": "Bearer " + create_token("owner", "admin")}
    created = client.post("/api/admin/products", headers=admin, json={
        "name": "New product", "category_id": "cattle", "variants": [{"id": "new-pack", "pack_size": "100 ml", "mrp": 500}],
    })
    assert created.status_code == 200
    await database.customers.insert_one({"id": "doctor", "status": "active", "active": True, "category": "doctor"})
    await database.category_prices.insert_one({"variant_id": "new-pack", "category": "doctor", "active": True, "rate": 250})
    customer = {"Authorization": "Bearer " + create_token("doctor", "customer")}
    rows = client.get("/api/products/current", headers=customer).json()["related"]
    assert [row["id"] for row in rows] == [created.json()["id"]]
    assert rows[0]["variants"][0]["your_price"] == 250
