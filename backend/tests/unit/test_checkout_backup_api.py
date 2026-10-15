from unittest.mock import AsyncMock

from bson import json_util
import pytest

from security import create_token
from routers import orders


BODY = {"items": [{"variant_id": "v1", "qty": 2}], "mobile": "9000000001", "accept_terms": True,
        "address": {"line1": "Main Road", "pincode": "638751", "state": "Tamil Nadu", "district": "Tirupur"}}


def test_order_requires_customer_login_even_if_old_otp_exists(client):
    response = client.post("/api/orders", json=BODY)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_password_login_customer_can_order_without_an_otp_record(client, database, monkeypatch):
    await database.customers.insert_one({"id": "c1", "name": "Doctor", "mobile": "9000000001",
                                         "status": "active", "category": "doctor"})
    await database.products.insert_one({"id": "p1", "name": "Test product", "active": True,
        "variants": [{"id": "v1", "mrp": 200, "selling_price": 180, "category_prices": {"doctor": 150}}]})
    await database.category_prices.insert_one({"variant_id": "v1", "category": "doctor", "active": True, "rate": 150})
    monkeypatch.setattr(orders, "_geo_from_ip", AsyncMock(return_value=""))
    token = create_token("c1", "customer")
    response = client.post("/api/orders", json=BODY, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200, response.text
    assert response.json()["customer_id"] == "c1"
    assert response.json()["items"][0]["unit_price"] == 150
    assert await database.otps.count_documents({}) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("status,mobile", [("pending", "9000000001"), ("active", "9000000002")])
async def test_checkout_blocks_unapproved_and_impersonated_accounts(client, database, status, mobile):
    await database.customers.insert_one({"id": "c1", "name": "Doctor", "mobile": "9000000001", "status": status})
    response = client.post("/api/orders", json={**BODY, "mobile": mobile},
                           headers={"Authorization": f"Bearer {create_token('c1', 'customer')}"})
    assert response.status_code == 403
    assert await database.orders.count_documents({}) == 0


@pytest.mark.asyncio
async def test_complete_backup_is_super_admin_only(client, database):
    await database.admin_users.insert_one({"id": "a1", "name": "Owner", "role": "super_admin", "active": True})
    await database.admin_users.insert_one({"id": "staff", "role": "product_manager", "active": True})
    await database.quotations.insert_one({"id": "q1", "number": "VMQ-1"})
    await database.customer_prices.insert_one({"id": "negotiated-price", "price": 150})
    assert client.get("/api/admin/backup/database").status_code == 401
    assert client.get("/api/admin/backup/database", headers={"Authorization": f"Bearer {create_token('staff', 'admin')}"}).status_code == 403
    response = client.get("/api/admin/backup/database", headers={"Authorization": f"Bearer {create_token('a1', 'admin')}"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    payload = json_util.loads(response.text)
    assert payload["data"]["quotations"][0]["number"] == "VMQ-1"
    assert payload["data"]["customer_prices"][0]["price"] == 150
