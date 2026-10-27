from unittest.mock import AsyncMock
import pytest
from routers import auth_routes
from security import create_token, hash_password, verify_password

MOBILE = "9000000011"
PASSWORD = "Testing@2026"
BODY = {"name": "Test Doctor", "mobile": MOBILE, "category": "doctor", "license_number": "TEST-001", "password": PASSWORD}

@pytest.fixture(autouse=True)
def no_notifications(monkeypatch):
    monkeypatch.setattr(auth_routes, "send_whatsapp", AsyncMock(return_value={"status": "sent"}))
    monkeypatch.setattr(auth_routes, "send_email", AsyncMock(return_value={"status": "sent"}))

async def grant(client, database, mobile=MOBILE):
    response = client.post("/api/auth/otp/request", json={"mobile": mobile})
    assert response.status_code == 200, response.text
    assert "dev_otp" not in response.json()
    record = await database.otps.find_one({"mobile": mobile})
    verified = client.post("/api/auth/otp/verify", json={"mobile": mobile, "otp": record["otp"]})
    assert verified.status_code == 200, verified.text
    assert "token" not in verified.json()
    assert "customer" not in verified.json()
    return verified.json()["verification_token"]

@pytest.mark.asyncio
async def test_registration_requires_verification_and_password(client, database):
    no_proof = client.post("/api/auth/register", json={**BODY, "verification_token": "forged"})
    assert no_proof.status_code == 400
    for missing in ["password", "verification_token"]:
        body = {**BODY, "verification_token": "forged"}
        body.pop(missing)
        assert client.post("/api/auth/register", json=body).status_code == 422
    assert await database.customers.count_documents({}) == 0

@pytest.mark.asyncio
async def test_verified_signup_password_login_and_approval(client, database):
    token = await grant(client, database)
    response = client.post("/api/auth/register", json={**BODY, "verification_token": token})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "pending"
    customer = await database.customers.find_one({"mobile": MOBILE})
    assert verify_password(PASSWORD, customer["password_hash"])
    assert "password" not in customer
    assert customer["mobile_verified_at"]
    login = client.post("/api/auth/login/password", json={"mobile": MOBILE, "password": PASSWORD})
    assert login.status_code == 200, login.text
    assert login.json()["customer"]["status"] == "pending"
    assert "password_hash" not in login.json()["customer"]
    assert "password" not in login.json()["customer"]
    # Registration is not permission to place an order before approval.
    order = client.post("/api/orders", json={"items": [{"variant_id": "v1", "qty": 1}], "mobile": MOBILE, "accept_terms": True, "address": {"line1": "Test Street", "state": "Tamil Nadu", "district": "Tirupur", "pincode": "638751"}}, headers={"Authorization": "Bearer " + login.json()["token"]})
    assert order.status_code == 403
    assert client.post("/api/auth/register", json={**BODY, "verification_token": token}).status_code == 409
    record = await database.otps.find_one({"mobile": MOBILE})
    assert record["consumed"] is True
    assert "registration_token_hash" not in record

@pytest.mark.asyncio
async def test_proof_is_bound_to_mobile_and_expiry(client, database):
    token = await grant(client, database)
    response = client.post("/api/auth/register", json={**BODY, "mobile": "9000000012", "verification_token": token})
    assert response.status_code == 400
    await database.otps.update_one({"mobile": MOBILE}, {"$set": {"registration_expires": "2000-01-01T00:00:00+00:00"}})
    assert client.post("/api/auth/register", json={**BODY, "verification_token": token}).status_code == 400
    assert await database.customers.count_documents({}) == 0

@pytest.mark.asyncio
async def test_resend_revokes_previous_registration_proof(client, database):
    first = await grant(client, database)
    second = await grant(client, database)
    assert first != second
    assert client.post("/api/auth/register", json={**BODY, "verification_token": first}).status_code == 400
    assert client.post("/api/auth/register", json={**BODY, "verification_token": second}).status_code == 200

@pytest.mark.asyncio
@pytest.mark.parametrize("password", ["", "short", "        ", "x" * 73, "é" * 37])
async def test_invalid_password_is_rejected_without_spending_proof(client, database, password):
    token = await grant(client, database)
    assert client.post("/api/auth/register", json={**BODY, "password": password, "verification_token": token}).status_code == 400
    assert client.post("/api/auth/register", json={**BODY, "verification_token": token}).status_code == 200

@pytest.mark.asyncio
async def test_old_login_otps_cannot_issue_customer_sessions(client, database):
    await database.customers.insert_one({"id": "existing", "mobile": MOBILE, "normalized_mobile": MOBILE, "status": "active"})
    await database.otps.insert_one({"mobile": MOBILE, "otp": "123456", "verified": False, "expires": "2099-01-01T00:00:00+00:00"})
    assert client.post("/api/auth/otp/request", json={"mobile": MOBILE}).status_code == 409
    assert client.post("/api/auth/otp/verify", json={"mobile": MOBILE, "otp": "123456"}).status_code == 409

@pytest.mark.asyncio
async def test_otp_wrong_attempts_and_request_limits(client, database):
    await grant(client, database)
    assert client.post("/api/auth/otp/verify", json={"mobile": MOBILE, "otp": "123456"}).status_code == 400
    assert client.post("/api/auth/otp/request", json={"mobile": MOBILE}).status_code == 200
    record = await database.otps.find_one({"mobile": MOBILE})
    wrong = "000000" if record["otp"] != "000000" else "111111"
    for _ in range(5):
        assert client.post("/api/auth/otp/verify", json={"mobile": MOBILE, "otp": wrong}).status_code == 400
    assert client.post("/api/auth/otp/verify", json={"mobile": MOBILE, "otp": record["otp"]}).status_code == 429
    for _ in range(3):
        assert client.post("/api/auth/otp/request", json={"mobile": MOBILE}).status_code == 200
    assert client.post("/api/auth/otp/request", json={"mobile": MOBILE}).status_code == 429

@pytest.mark.asyncio
async def test_password_login_works_with_old_disabled_setting_and_locks_failures(client, database):
    await database.settings.insert_one({"id": "pricing_engine", "enable_password_login": False, "enable_otp": True})
    await database.customers.insert_one({"id": "c1", "mobile": MOBILE, "status": "active", "password_hash": hash_password(PASSWORD)})
    assert client.post("/api/auth/login/password", json={"mobile": MOBILE, "password": PASSWORD}).status_code == 200
    for _ in range(5):
        assert client.post("/api/auth/login/password", json={"mobile": MOBILE, "password": "incorrect"}).status_code == 401
    assert client.post("/api/auth/login/password", json={"mobile": MOBILE, "password": PASSWORD}).status_code == 429

@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["suspended", "rejected", "deleted"])
async def test_blocked_customer_cannot_login(client, database, status):
    await database.customers.insert_one({"id": "c1", "mobile": MOBILE, "status": status, "password_hash": hash_password(PASSWORD)})
    assert client.post("/api/auth/login/password", json={"mobile": MOBILE, "password": PASSWORD}).status_code == 403

@pytest.mark.asyncio
async def test_admin_role_defaults_are_returned_to_navigation(client, database):
    await database.admin_users.insert_one({"id": "staff", "email": "staff@example.com", "password_hash": hash_password(PASSWORD), "role": "product_manager", "active": True, "permissions": None})
    response = client.post("/api/auth/admin/login", json={"email": "staff@example.com", "password": PASSWORD})
    assert response.status_code == 200
    assert "products" in response.json()["user"]["permissions"]
    assert "password_hash" not in response.json()["user"]
    me = client.get("/api/auth/admin/me", headers={"Authorization": "Bearer " + response.json()["token"]})
    assert me.json()["permissions"] == response.json()["user"]["permissions"]

@pytest.mark.asyncio
async def test_admin_created_and_reset_passwords_are_hashed(client, database):
    await database.admin_users.insert_one({"id": "a1", "role": "super_admin", "active": True})
    headers = {"Authorization": "Bearer " + create_token("a1", "admin")}
    assert client.post("/api/admin/customers", json={"name": "Test", "mobile": MOBILE}, headers=headers).status_code == 400
    response = client.post("/api/admin/customers", json=BODY, headers=headers)
    assert response.status_code == 200, response.text
    cid = response.json()["id"]
    assert client.put(f"/api/admin/customers/{cid}", json={"password": "Replaced@2026", "mobile": "bad"}, headers=headers).status_code == 400
    updated = client.put(f"/api/admin/customers/{cid}", json={"password": "Replaced@2026"}, headers=headers)
    assert updated.status_code == 200
    row = await database.customers.find_one({"id": cid})
    assert "password" not in row and verify_password("Replaced@2026", row["password_hash"])
    assert client.get(f"/api/admin/customers/{cid}", headers=headers).json()["has_password"] is True
    assert client.post(f"/api/admin/customers/{cid}/reset-password", json={"password": "short"}, headers=headers).status_code == 400
    assert client.post(f"/api/admin/customers/{cid}/reset-password", json={"password": "ResetAgain@2026"}, headers=headers).status_code == 200
    assert client.post("/api/auth/login/password", json={"mobile": MOBILE, "password": "ResetAgain@2026"}).status_code == 200

@pytest.mark.asyncio
async def test_pricing_settings_cannot_reenable_otp_login_or_disable_password_login(client, database):
    await database.admin_users.insert_one({"id": "a1", "role": "super_admin", "active": True})
    headers = {"Authorization": "Bearer " + create_token("a1", "admin")}
    response = client.put("/api/admin/pricing/settings", json={"enable_otp": True, "enable_password_login": False}, headers=headers)
    assert response.status_code == 200
    assert response.json()["enable_otp"] is False
    assert response.json()["enable_password_login"] is True


@pytest.mark.asyncio
async def test_admin_password_attempts_are_limited(client, database):
    await database.admin_users.insert_one({"id": "a1", "email": "owner@example.com", "password_hash": hash_password(PASSWORD), "role": "super_admin", "active": True})
    for _ in range(5):
        assert client.post("/api/auth/admin/login", json={"email": "owner@example.com", "password": "incorrect"}).status_code == 401
    assert client.post("/api/auth/admin/login", json={"email": "owner@example.com", "password": PASSWORD}).status_code == 429


@pytest.mark.asyncio
async def test_admin_account_validation_and_last_owner_protection(client, database):
    await database.admin_users.insert_one({"id": "a1", "role": "super_admin", "email": "owner@example.com", "active": True})
    headers = {"Authorization": "Bearer " + create_token("a1", "admin")}
    assert client.post("/api/admin/users", json={"email": "staff@example.com"}, headers=headers).status_code == 400
    assert client.post("/api/admin/users", json={"email": "invalid", "password": PASSWORD}, headers=headers).status_code == 400
    created = client.post("/api/admin/users", json={"email": "staff@example.com", "password": PASSWORD, "role": "product_manager"}, headers=headers)
    assert created.status_code == 200
    assert "password_hash" not in created.json()
    assert client.put("/api/admin/users/a1", json={"active": False}, headers=headers).status_code == 400
    assert client.put("/api/admin/users/a1", json={"role": "product_manager"}, headers=headers).status_code == 400
    assert client.put(f"/api/admin/users/{created.json()['id']}", json={"email": "owner@example.com"}, headers=headers).status_code == 409
