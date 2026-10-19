from unittest.mock import AsyncMock

from fastapi import HTTPException
import pytest

from config import demo_enabled, dev_otp_enabled
from security import hash_password, verify_password
from seed_data import seed_admin, run_seed
from routers import auth_routes


def test_production_ignores_demo_and_otp_flags(monkeypatch):
    monkeypatch.setenv("SEED_DEMO_DATA", "true")
    monkeypatch.setenv("ALLOW_DEV_OTP", "true")
    assert not demo_enabled()
    assert not dev_otp_enabled()


@pytest.mark.asyncio
async def test_startup_preserves_changed_admin_password(database, monkeypatch):
    await database.admin_users.insert_one({"email": "owner@example.com", "role": "super_admin",
                                           "active": True, "password_hash": hash_password("chosen-password")})
    monkeypatch.setenv("ADMIN_EMAIL", "owner@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "old-bootstrap-password")
    await run_seed(database)
    admin = await database.admin_users.find_one({"email": "owner@example.com"})
    assert verify_password("chosen-password", admin["password_hash"])
    assert await database.products.count_documents({}) == 0
    assert await database.crm_customers.count_documents({}) == 0


@pytest.mark.asyncio
async def test_restored_admin_does_not_need_bootstrap_credentials(database, monkeypatch):
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    await database.admin_users.insert_one({"role": "super_admin", "active": True})
    await seed_admin(database)
    assert await database.admin_users.count_documents({}) == 1


@pytest.mark.asyncio
async def test_empty_install_requires_explicit_admin_credentials(database, monkeypatch):
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    with pytest.raises(RuntimeError, match="ADMIN_EMAIL"):
        await seed_admin(database)


@pytest.mark.asyncio
async def test_live_otp_is_not_returned_in_response(database, monkeypatch):
    monkeypatch.setattr(auth_routes, "db", database)
    monkeypatch.setenv("ALLOW_DEV_OTP", "true")
    monkeypatch.setattr(auth_routes, "send_whatsapp", AsyncMock(return_value={"status": "sent"}))
    response = await auth_routes.otp_request(auth_routes.OtpRequest(mobile="9000000001"))
    assert response["sent"] is True
    assert "dev_otp" not in response
    assert "simulated" not in response["message"]


@pytest.mark.asyncio
async def test_development_otp_requires_explicit_flag(database, monkeypatch):
    monkeypatch.setattr(auth_routes, "db", database)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("ALLOW_DEV_OTP", "true")
    monkeypatch.setattr(auth_routes, "send_whatsapp", AsyncMock(return_value={"status": "simulated"}))
    response = await auth_routes.otp_request(auth_routes.OtpRequest(mobile="9000000001"))
    assert len(response["dev_otp"]) == 6


@pytest.mark.asyncio
async def test_delivery_failure_returns_error_and_invalidates_code(database, monkeypatch):
    monkeypatch.setattr(auth_routes, "db", database)
    monkeypatch.setattr(auth_routes, "send_whatsapp", AsyncMock(return_value={"status": "failed"}))
    with pytest.raises(HTTPException) as error:
        await auth_routes.otp_request(auth_routes.OtpRequest(mobile="9000000001"))
    assert error.value.status_code == 503
    record = await database.otps.find_one({"mobile": "9000000001"})
    assert record["otp"] == ""
    assert record["request_count"] == 1


@pytest.mark.asyncio
async def test_email_is_a_valid_fallback_when_whatsapp_fails(database, monkeypatch):
    monkeypatch.setattr(auth_routes, "db", database)
    await database.customers.insert_one({"mobile": "9000000001", "email": "customer@example.com"})
    monkeypatch.setattr(auth_routes, "send_whatsapp", AsyncMock(return_value={"status": "failed"}))
    monkeypatch.setattr(auth_routes, "send_email", AsyncMock(return_value={"status": "sent"}))
    result = await auth_routes.otp_request(auth_routes.OtpRequest(mobile="9000000001"))
    assert result["sent"] is True
    assert "dev_otp" not in result


@pytest.mark.asyncio
async def test_verified_otp_cannot_be_replayed(database, monkeypatch):
    monkeypatch.setattr(auth_routes, "db", database)
    await database.otps.insert_one({"mobile": "9000000001", "otp": "123456", "verified": True,
                                    "expires": "2099-01-01T00:00:00+00:00", "wrong_attempts": 0})
    with pytest.raises(HTTPException, match="already used"):
        await auth_routes.otp_verify(auth_routes.OtpVerify(mobile="9000000001", otp="123456"))
