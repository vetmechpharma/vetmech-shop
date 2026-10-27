import pytest
from security import create_token


@pytest.mark.asyncio
async def test_customer_delete_preserves_orders_and_blocks_existing_session(client, database):
    await database.admin_users.insert_one({"id": "owner", "role": "super_admin", "active": True})
    await database.customers.insert_one({"id": "customer", "name": "Test Customer", "mobile": "9000000099", "status": "active", "active": True})
    await database.orders.insert_one({"id": "order", "order_number": "TEST-001", "customer_id": "customer", "items": [], "created_at": "2026-10-27T00:00:00+00:00"})
    admin = {"Authorization": "Bearer " + create_token("owner", "admin")}
    customer = {"Authorization": "Bearer " + create_token("customer", "customer")}
    assert client.get("/api/auth/customer/me", headers=customer).status_code == 200

    response = client.delete("/api/admin/customers/customer", headers=admin)
    assert response.status_code == 200
    row = await database.customers.find_one({"id": "customer"})
    assert row["status"] == "deleted" and row["active"] is False
    assert await database.orders.count_documents({"customer_id": "customer"}) == 1
    assert client.get("/api/auth/customer/me", headers=customer).status_code == 403
    for query in ["", "?status=all"]:
        listing = client.get("/api/admin/customers" + query, headers=admin).json()
        assert listing["items"] == [] and listing["total"] == 0
    deleted = client.get("/api/admin/customers?status=deleted", headers=admin).json()
    assert [c["id"] for c in deleted["items"]] == ["customer"]
    detail = client.get("/api/admin/customers/customer", headers=admin).json()
    assert detail["orders"][0]["order_number"] == "TEST-001"


@pytest.mark.asyncio
async def test_customer_delete_requires_customer_management_permission(client, database):
    await database.admin_users.insert_one({"id": "products", "role": "product_manager", "active": True})
    await database.customers.insert_one({"id": "customer", "name": "Test Customer", "status": "active"})
    assert client.delete("/api/admin/customers/customer").status_code == 401
    response = client.delete("/api/admin/customers/customer", headers={"Authorization": "Bearer " + create_token("products", "admin")})
    assert response.status_code == 403
    assert (await database.customers.find_one({"id": "customer"}))["status"] == "active"
