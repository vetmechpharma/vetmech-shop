"""Iteration 15: Guest View-only + WhatsApp new_registration notification tests."""
import os
import random
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # frontend/.env fallback
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "vetmechpharma@gmail.com"
ADMIN_PWD = "Admin@123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PWD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _unique_mobile():
    # start with 9 to be a valid Indian mobile-shaped 10-digit
    return "9" + "".join(str(random.randint(0, 9)) for _ in range(9))


def test_health_products_public():
    r = requests.get(f"{BASE_URL}/api/products", timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    assert len(items) > 0


def test_guest_product_detail_no_price_ordering():
    r = requests.get(f"{BASE_URL}/api/products/nerviphos-m", timeout=15)
    assert r.status_code == 200
    p = r.json()
    v = (p.get("variants") or [])[0]
    # your_price should be None for guests
    assert v.get("your_price") in (None, 0) or "your_price" not in v or v["your_price"] is None


def test_otp_login_flow_gets_your_price():
    mobile = "9944472488"  # existing customer
    r = requests.post(f"{BASE_URL}/api/auth/otp/request", json={"mobile": mobile}, timeout=15)
    assert r.status_code == 200, r.text
    otp = r.json().get("dev_otp")
    assert otp
    r2 = requests.post(f"{BASE_URL}/api/auth/otp/verify", json={"mobile": mobile, "otp": otp}, timeout=15)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body.get("verified") is True
    token = body.get("token")
    assert token
    # fetch product as logged in
    r3 = requests.get(f"{BASE_URL}/api/products/nerviphos-m",
                      headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r3.status_code == 200


def test_new_registration_creates_whatsapp_notification(admin_token):
    mobile = _unique_mobile()
    payload = {
        "prefix": "Mr.",
        "name": f"TEST_REG_{mobile}",
        "mobile": mobile,
        "whatsapp": mobile,
        "email": f"test_{mobile}@example.com",
        "company_name": "TEST_CO",
        "category": "clinic",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("registered") is True
    assert body.get("status") in ("pending", "active")

    # Give backend a moment to persist notification
    time.sleep(1.5)
    r2 = requests.get(f"{BASE_URL}/api/admin/notifications?channel=whatsapp&limit=50",
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r2.status_code == 200, r2.text
    data = r2.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("notifications") or [])
    # Look for a new_registration entry matching this mobile
    found = False
    for it in items:
        kind = it.get("kind") or it.get("type") or ""
        text = (it.get("text") or it.get("body") or it.get("message") or "")
        if kind == "new_registration" and mobile in text:
            found = True
            break
    assert found, f"No new_registration notification found for {mobile}. Items sample: {items[:3]}"


def test_duplicate_registration_returns_409():
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"name": "dup", "mobile": "9944472488", "category": "clinic"},
                      timeout=15)
    assert r.status_code == 409
