import pytest
from security import create_token

@pytest.mark.asyncio
async def test_dashboard_excludes_cancelled_sales_and_counts_same_named_customers_separately(client, database):
    await database.admin_users.insert_one({"id": "a1", "role": "super_admin", "active": True})
    await database.products.insert_one({"id": "p1", "category_id": "cat1"})
    await database.categories.insert_one({"id": "cat1", "name": "Large Animal"})
    for index, (cid, status, qty) in enumerate([("c1", "confirmed", 2), ("c2", "delivered", 3), ("c1", "cancelled", 100)]):
        await database.orders.insert_one({"id": str(index), "customer_id": cid, "customer_name": "Same Name", "status": status, "created_at": "2026-10-27T00:00:00+00:00", "items": [{"product_id": "p1", "product_name": "Test", "qty": qty, "unit_price": 10}]})
    # A legacy incomplete record must not break the whole dashboard.
    await database.orders.insert_one({"id": "legacy", "items": []})
    response = client.get("/api/admin/dashboard", headers={"Authorization": "Bearer " + create_token("a1", "admin")})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total_orders"] == 4
    assert data["sales_value"] == 50
    assert data["repeat_customers"] == 0
    assert data["top_products"] == [{"name": "Test", "qty": 5}]
    assert data["category_performance"] == [{"name": "Large Animal", "qty": 5}]
