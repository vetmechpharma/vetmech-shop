"""VETMECH Phase 1 - Customer Auth & Pricing Settings backend tests."""
import os
import time
import random
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vetmech-pharma.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "vetmechpharma@gmail.com"
ADMIN_PASSWORD = "Admin@123"

# customer supplied in review request as pre-approved with pass123
EXISTING_CUSTOMER_MOBILE = "9876500011"
EXISTING_CUSTOMER_PASSWORD = "pass123"


def _rand_mobile():
    # 10 digit starting with 9
    return "9" + "".join(str(random.randint(0, 9)) for _ in range(9))


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- Health ----------------
def test_admin_login_works(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 20


# ---------------- Registration ----------------
class TestRegistration:
    def test_register_creates_pending(self):
        mobile = _rand_mobile()
        payload = {"prefix": "Mr.", "name": "TEST_Reg1", "mobile": mobile,
                   "category": "clinic", "password": "abcd1234"}
        r = requests.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("registered") is True
        assert data.get("status") == "pending"
        assert "pending admin approval" in data.get("message", "").lower()
        pytest.registered_mobile = mobile

    def test_duplicate_mobile_returns_409(self):
        mobile = getattr(pytest, "registered_mobile", None)
        assert mobile
        r = requests.post(f"{API}/auth/register", json={"name": "Dup", "mobile": mobile})
        assert r.status_code == 409
        assert "already exists" in r.json().get("detail", "").lower()

    def test_invalid_mobile_400(self):
        r = requests.post(f"{API}/auth/register", json={"name": "X", "mobile": "123"})
        assert r.status_code == 400


# ---------------- OTP flow ----------------
class TestOtp:
    def test_otp_request_and_verify_unregistered(self):
        mobile = _rand_mobile()
        r = requests.post(f"{API}/auth/otp/request", json={"mobile": mobile})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("dev_otp") and len(j["dev_otp"]) == 6
        pytest.otp_mobile = mobile
        pytest.otp_code = j["dev_otp"]

        r2 = requests.post(f"{API}/auth/otp/verify",
                           json={"mobile": mobile, "otp": j["dev_otp"]})
        assert r2.status_code == 200
        v = r2.json()
        assert v.get("verified") is True
        assert v.get("registered") is False

    def test_otp_wrong_rejected(self):
        mobile = _rand_mobile()
        r = requests.post(f"{API}/auth/otp/request", json={"mobile": mobile})
        assert r.status_code == 200
        r2 = requests.post(f"{API}/auth/otp/verify", json={"mobile": mobile, "otp": "000000"})
        assert r2.status_code == 400

    def test_otp_verify_registered_customer(self):
        # Use existing customer
        r = requests.post(f"{API}/auth/otp/request", json={"mobile": EXISTING_CUSTOMER_MOBILE})
        assert r.status_code == 200
        otp = r.json()["dev_otp"]
        r2 = requests.post(f"{API}/auth/otp/verify",
                           json={"mobile": EXISTING_CUSTOMER_MOBILE, "otp": otp})
        assert r2.status_code == 200
        v = r2.json()
        assert v.get("verified") and v.get("registered")
        assert "token" in v
        assert "status_label" in v


# ---------------- Password login ----------------
class TestPasswordLogin:
    def test_password_login_success(self):
        r = requests.post(f"{API}/auth/login/password",
                          json={"mobile": EXISTING_CUSTOMER_MOBILE,
                                "password": EXISTING_CUSTOMER_PASSWORD})
        assert r.status_code == 200, r.text
        j = r.json()
        assert "token" in j and j.get("status") == "active"

    def test_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login/password",
                          json={"mobile": EXISTING_CUSTOMER_MOBILE, "password": "wrong!!"})
        assert r.status_code == 401

    def test_lockout_after_5_fails(self):
        # Use a fresh throwaway mobile so we don't lock out real customer
        mobile = _rand_mobile()
        # Register with a password
        requests.post(f"{API}/auth/register",
                      json={"name": "TEST_Lock", "mobile": mobile, "password": "correct123"})
        for _ in range(5):
            requests.post(f"{API}/auth/login/password",
                          json={"mobile": mobile, "password": "bad"})
        r = requests.post(f"{API}/auth/login/password",
                          json={"mobile": mobile, "password": "correct123"})
        assert r.status_code == 429, f"expected lockout, got {r.status_code}"


# ---------------- Admin customers ----------------
class TestAdminCustomers:
    def test_list_customers(self, admin_headers):
        r = requests.get(f"{API}/admin/customers", headers=admin_headers)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_status_filter_pending(self, admin_headers):
        r = requests.get(f"{API}/admin/customers?status=pending", headers=admin_headers)
        assert r.status_code == 200
        for c in r.json()["items"]:
            assert c["status"] == "pending"

    def test_pending_count(self, admin_headers):
        r = requests.get(f"{API}/admin/customers-pending-count", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json().get("count"), int)

    def test_full_lifecycle(self, admin_headers):
        mobile = _rand_mobile()
        # 1) admin create pending
        r = requests.post(f"{API}/admin/customers", headers=admin_headers,
                          json={"name": "TEST_Life", "mobile": mobile,
                                "category": "clinic", "status": "pending",
                                "password": "init1234"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        # 2) duplicate create -> 409
        r2 = requests.post(f"{API}/admin/customers", headers=admin_headers,
                           json={"name": "TEST_Dup", "mobile": mobile})
        assert r2.status_code == 409

        # 3) approve -> active
        r3 = requests.post(f"{API}/admin/customers/{cid}/approve", headers=admin_headers)
        assert r3.status_code == 200
        assert r3.json()["status"] == "active"

        # 4) change category
        r4 = requests.post(f"{API}/admin/customers/{cid}/change-category",
                           headers=admin_headers, json={"category": "retailer"})
        assert r4.status_code == 200
        assert r4.json()["category"] == "retailer"

        # 5) reset password
        r5 = requests.post(f"{API}/admin/customers/{cid}/reset-password",
                           headers=admin_headers, json={"password": "new12345"})
        assert r5.status_code == 200 and r5.json().get("ok")

        # 6) verify new password works
        r6 = requests.post(f"{API}/auth/login/password",
                           json={"mobile": mobile, "password": "new12345"})
        assert r6.status_code == 200

        # 7) suspend -> login blocked 403
        r7 = requests.post(f"{API}/admin/customers/{cid}/suspend", headers=admin_headers)
        assert r7.status_code == 200 and r7.json()["status"] == "suspended"
        r7b = requests.post(f"{API}/auth/login/password",
                            json={"mobile": mobile, "password": "new12345"})
        assert r7b.status_code == 403

        # OTP also blocked for suspended
        req = requests.post(f"{API}/auth/otp/request", json={"mobile": mobile})
        otp = req.json()["dev_otp"]
        rv = requests.post(f"{API}/auth/otp/verify", json={"mobile": mobile, "otp": otp})
        assert rv.status_code == 403

        # 8) reactivate
        r8 = requests.post(f"{API}/admin/customers/{cid}/reactivate", headers=admin_headers)
        assert r8.status_code == 200 and r8.json()["status"] == "active"

        # 9) reject
        r9 = requests.post(f"{API}/admin/customers/{cid}/reject", headers=admin_headers)
        assert r9.status_code == 200 and r9.json()["status"] == "rejected"

        # 10) soft delete
        r10 = requests.delete(f"{API}/admin/customers/{cid}", headers=admin_headers)
        assert r10.status_code == 200

    def test_pending_customer_can_login(self, admin_headers):
        mobile = _rand_mobile()
        # Register (creates pending because require_approval=True)
        r = requests.post(f"{API}/auth/register",
                          json={"name": "TEST_Pend", "mobile": mobile,
                                "category": "clinic", "password": "pend1234"})
        assert r.status_code == 200 and r.json()["status"] == "pending"
        # Login should succeed
        r2 = requests.post(f"{API}/auth/login/password",
                           json={"mobile": mobile, "password": "pend1234"})
        assert r2.status_code == 200
        j = r2.json()
        assert j["status"] == "pending"
        assert j.get("status_label") == "Pending Approval"

    def test_grandfathered_active(self, admin_headers):
        # Existing customer 9876500011 should be active
        r = requests.get(f"{API}/admin/customers?q=9876500011", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        assert items[0]["status"] == "active"


# ---------------- Pricing settings ----------------
class TestPricingSettings:
    def test_get_settings(self, admin_headers):
        r = requests.get(f"{API}/admin/pricing/settings", headers=admin_headers)
        assert r.status_code == 200
        s = r.json()
        for k in ("enable_otp", "enable_password_login", "require_approval", "price_change_behavior"):
            assert k in s

    def test_put_settings_persists(self, admin_headers):
        r0 = requests.get(f"{API}/admin/pricing/settings", headers=admin_headers)
        orig = r0.json()
        new_behavior = "reset_all" if orig.get("price_change_behavior") != "reset_all" else "keep_all"
        upd = {**orig, "price_change_behavior": new_behavior}
        r = requests.put(f"{API}/admin/pricing/settings", headers=admin_headers, json=upd)
        assert r.status_code == 200
        assert r.json()["price_change_behavior"] == new_behavior
        # restore
        requests.put(f"{API}/admin/pricing/settings", headers=admin_headers,
                     json={**orig, "price_change_behavior": orig.get("price_change_behavior", "keep_protected")})

    def test_toggle_enforcement(self, admin_headers):
        r0 = requests.get(f"{API}/admin/pricing/settings", headers=admin_headers)
        orig = r0.json()
        try:
            # disable password
            requests.put(f"{API}/admin/pricing/settings", headers=admin_headers,
                         json={**orig, "enable_password_login": False})
            r = requests.post(f"{API}/auth/login/password",
                              json={"mobile": EXISTING_CUSTOMER_MOBILE, "password": EXISTING_CUSTOMER_PASSWORD})
            assert r.status_code == 400
            assert "disabled" in r.json().get("detail", "").lower()

            # disable otp
            requests.put(f"{API}/admin/pricing/settings", headers=admin_headers,
                         json={**orig, "enable_password_login": True, "enable_otp": False})
            r2 = requests.post(f"{API}/auth/otp/request", json={"mobile": _rand_mobile()})
            assert r2.status_code == 400
        finally:
            # RESTORE both toggles to true (critical per task instructions)
            requests.put(f"{API}/admin/pricing/settings", headers=admin_headers,
                         json={**orig, "enable_otp": True, "enable_password_login": True})
            r_final = requests.get(f"{API}/admin/pricing/settings", headers=admin_headers).json()
            assert r_final["enable_otp"] is True
            assert r_final["enable_password_login"] is True
