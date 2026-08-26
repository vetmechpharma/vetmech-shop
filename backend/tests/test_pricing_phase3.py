"""Phase 3 User-Wise Pricing backend tests.

Coverage:
- Admin order edit with manual per-line rate/offer override (unit_price, source=manual_admin, free 4, label 10+4)
- 'Update customer pricing' checkbox writes last_confirmed to customer_prices, preserves protected flag
- Order snapshot integrity: subsequent pricing changes do NOT mutate stored order lines
- Category-change preview lists affected non-protected + protected customers with badge
- Category-change apply with modes: keep_protected, keep_all, reset_all
- Category rate PUT with no affected customers saves without dialog (backend-equivalent: preview.count=0)
- Price protection toggles at both cp.protected and customer.price_protected level
- Quotation convert_to_order with update_customer_pricing writes last_confirmed
- Backend pricing priority: guest=public, doctor+category-only=category, doctor+customer-specific=that rate
"""
import os
import time
import pytest
import requests

def _load_backend_url():
    u = os.environ.get("REACT_APP_BACKEND_URL")
    if not u:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        u = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert u, "REACT_APP_BACKEND_URL not configured"
    return u.rstrip("/")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "vetmechpharma@gmail.com"
ADMIN_PASS = "Admin@123"
DOCTOR_MOBILE = "9876500011"
DOCTOR_PASS = "pass123"
VARIANT_ID = "723814ff-2701-4beb-8d95-8a97962be4fe"  # NERVIPHOS-BM 100ml


# -------------------- fixtures --------------------
@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def doctor_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login/password",
                      json={"identifier": DOCTOR_MOBILE, "password": DOCTOR_PASS}, timeout=15)
    if r.status_code != 200:
        r = requests.post(f"{BASE_URL}/api/auth/login/password",
                          json={"mobile": DOCTOR_MOBILE, "password": DOCTOR_PASS}, timeout=15)
    assert r.status_code == 200, f"customer login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def doctor_id(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/customers?q={DOCTOR_MOBILE}",
                     headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    m = [c for c in items if c.get("mobile") == DOCTOR_MOBILE]
    assert m, f"doctor {DOCTOR_MOBILE} not found"
    return m[0]["id"]


@pytest.fixture(scope="module")
def product_ctx():
    """Fetch product/variant details from public catalog."""
    r = requests.get(f"{BASE_URL}/api/products", timeout=15)
    assert r.status_code == 200
    items = r.json().get("items", r.json()) if isinstance(r.json(), dict) else r.json()
    for p in items:
        for v in p.get("variants", []):
            if v.get("id") == VARIANT_ID:
                return {"product_id": p["id"], "variant_id": VARIANT_ID, "selling_price": v.get("selling_price")}
    pytest.skip("target variant not found in catalog")


# -------------------- helpers --------------------
def _get_cp(admin_headers, customer_id, variant_id):
    r = requests.get(f"{BASE_URL}/api/admin/pricing/customer/{customer_id}", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    for it in r.json().get("items", []):
        if it.get("variant_id") == variant_id:
            return it
    return None


def _delete_cp(admin_headers, customer_id, variant_id):
    requests.delete(f"{BASE_URL}/api/admin/pricing/customer/{customer_id}/item/{variant_id}",
                    headers=admin_headers, timeout=15)


def _set_cp(admin_headers, customer_id, product_id, variant_id, rate, offer=None, protected=False, source="manual"):
    body = {"variant_id": variant_id, "product_id": product_id, "rate": rate,
            "offer": offer, "protected": protected, "source": source}
    r = requests.post(f"{BASE_URL}/api/admin/pricing/customer/{customer_id}/item",
                      headers=admin_headers, json=body, timeout=15)
    assert r.status_code == 200, r.text


# -------------------- 1. Priority sanity --------------------
class TestPricingPriority:
    def test_guest_gets_public(self, product_ctx):
        r = requests.post(f"{BASE_URL}/api/cart/calculate",
                          json={"items": [{"variant_id": VARIANT_ID, "qty": 1}]}, timeout=15)
        assert r.status_code == 200
        line = r.json()["items"][0]
        assert line["price_source"] == "public"
        assert abs(line["unit_price"] - product_ctx["selling_price"]) < 0.01

    def test_doctor_category_only_falls_back_to_category(self, admin_headers, doctor_headers, doctor_id, product_ctx):
        # Ensure no customer-specific price -> should be category (170)
        _delete_cp(admin_headers, doctor_id, VARIANT_ID)
        r = requests.post(f"{BASE_URL}/api/cart/calculate", headers=doctor_headers,
                          json={"items": [{"variant_id": VARIANT_ID, "qty": 1}]}, timeout=15)
        assert r.status_code == 200
        line = r.json()["items"][0]
        assert line["price_source"] == "category", line
        assert line["unit_price"] == 170, line

    def test_doctor_customer_specific_takes_priority(self, admin_headers, doctor_headers, doctor_id, product_ctx):
        _set_cp(admin_headers, doctor_id, product_ctx["product_id"], VARIANT_ID, rate=120)
        r = requests.post(f"{BASE_URL}/api/cart/calculate", headers=doctor_headers,
                          json={"items": [{"variant_id": VARIANT_ID, "qty": 1}]}, timeout=15)
        line = r.json()["items"][0]
        assert line["unit_price"] == 120
        assert line["price_source"] in ("manual", "customer_specific")
        _delete_cp(admin_headers, doctor_id, VARIANT_ID)


# -------------------- 2. Admin order edit override + update_customer_pricing --------------------
class TestAdminOrderEdit:
    @pytest.fixture(scope="class")
    def seed_order(self, admin_headers, doctor_id, product_ctx):
        # Create an order via admin for doctor
        body = {
            "customer_id": doctor_id,
            "items": [{"variant_id": VARIANT_ID, "qty": 20}],
            "address": {"line1": "TEST address", "pincode": "500001", "state": "Telangana", "district": "Hyd"},
        }
        r = requests.post(f"{BASE_URL}/api/admin/orders", headers=admin_headers, json=body, timeout=20)
        assert r.status_code == 200, r.text
        return r.json()

    def test_edit_order_manual_override(self, admin_headers, seed_order, doctor_id):
        oid = seed_order["id"]
        # Override rate=125, offer 10+4
        edit_body = {
            "items": [{"variant_id": VARIANT_ID, "qty": 20, "rate": 125,
                       "offer": {"buy_quantity": 10, "free_quantity": 4}}],
            "update_customer_pricing": False,
        }
        r = requests.put(f"{BASE_URL}/api/admin/orders/{oid}", headers=admin_headers, json=edit_body, timeout=20)
        assert r.status_code == 200, r.text
        line = r.json()["items"][0]
        assert line["unit_price"] == 125
        assert line["price_source"] == "manual_admin"
        assert line["free_qty"] == 8  # (20//10)*4
        assert line["scheme_label"] == "10+4"

    def test_edit_order_with_update_customer_pricing(self, admin_headers, seed_order, doctor_id, product_ctx):
        oid = seed_order["id"]
        _delete_cp(admin_headers, doctor_id, VARIANT_ID)
        edit_body = {
            "items": [{"variant_id": VARIANT_ID, "qty": 10, "rate": 125,
                       "offer": {"buy_quantity": 10, "free_quantity": 4}}],
            "update_customer_pricing": True,
        }
        r = requests.put(f"{BASE_URL}/api/admin/orders/{oid}", headers=admin_headers, json=edit_body, timeout=20)
        assert r.status_code == 200, r.text
        # Verify customer pricing was written
        cp = _get_cp(admin_headers, doctor_id, VARIANT_ID)
        assert cp is not None, "customer price not written"
        assert cp["rate"] == 125
        assert cp["source"] == "last_confirmed"
        assert cp.get("offer", {}).get("buy_quantity") == 10
        assert cp.get("offer", {}).get("free_quantity") == 4

    def test_snapshot_integrity_after_pricing_change(self, admin_headers, seed_order, doctor_id, product_ctx):
        """Old orders never change even after customer pricing is later modified."""
        oid = seed_order["id"]
        # Change customer price
        _set_cp(admin_headers, doctor_id, product_ctx["product_id"], VARIANT_ID, rate=99)
        # Re-fetch order — should still have unit_price 125
        r = requests.get(f"{BASE_URL}/api/admin/orders/{oid}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["items"][0]["unit_price"] == 125
        _delete_cp(admin_headers, doctor_id, VARIANT_ID)

    def test_doctor_your_price_reflects_last_confirmed(self, admin_headers, doctor_headers, doctor_id, product_ctx):
        # Reapply last_confirmed via order edit path already tested; use direct write for isolation
        _set_cp(admin_headers, doctor_id, product_ctx["product_id"], VARIANT_ID,
                rate=125, offer={"scheme_type": "free_qty", "buy_quantity": 10, "free_quantity": 4},
                source="last_confirmed")
        r = requests.post(f"{BASE_URL}/api/cart/calculate", headers=doctor_headers,
                          json={"items": [{"variant_id": VARIANT_ID, "qty": 10}]}, timeout=15)
        line = r.json()["items"][0]
        assert line["unit_price"] == 125
        assert line["free_qty"] == 4
        assert line["scheme_label"] in ("10+4", "Special Offer")


# -------------------- 3. Category-change preview + apply --------------------
class TestCategoryChange:
    def test_preview_lists_affected(self, admin_headers, doctor_id, product_ctx):
        # Ensure doctor has customer-specific price so they appear as affected
        _set_cp(admin_headers, doctor_id, product_ctx["product_id"], VARIANT_ID, rate=125)
        body = {"variant_id": VARIANT_ID, "category": "doctor", "new_rate": 180}
        r = requests.post(f"{BASE_URL}/api/admin/pricing/category-change/preview",
                          headers=admin_headers, json=body, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] >= 1
        affected_ids = [a["customer_id"] for a in data["affected"]]
        assert doctor_id in affected_ids
        me = [a for a in data["affected"] if a["customer_id"] == doctor_id][0]
        assert me["old_rate"] == 125
        assert me["new_rate"] == 180
        assert me["protected"] is False

    def test_apply_keep_protected_resets_non_protected(self, admin_headers, doctor_id, product_ctx):
        _set_cp(admin_headers, doctor_id, product_ctx["product_id"], VARIANT_ID, rate=125, protected=False)
        body = {"variant_id": VARIANT_ID, "product_id": product_ctx["product_id"],
                "category": "doctor", "new_rate": 170, "mode": "keep_protected"}
        r = requests.post(f"{BASE_URL}/api/admin/pricing/category-change/apply",
                          headers=admin_headers, json=body, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["customers_reset"] >= 1
        # doctor cp should be removed
        cp = _get_cp(admin_headers, doctor_id, VARIANT_ID)
        assert cp is None, f"expected cp cleared, got {cp}"

    def test_apply_keep_protected_preserves_protected(self, admin_headers, doctor_id, product_ctx):
        _set_cp(admin_headers, doctor_id, product_ctx["product_id"], VARIANT_ID, rate=110, protected=True)
        body = {"variant_id": VARIANT_ID, "product_id": product_ctx["product_id"],
                "category": "doctor", "new_rate": 170, "mode": "keep_protected"}
        r = requests.post(f"{BASE_URL}/api/admin/pricing/category-change/apply",
                          headers=admin_headers, json=body, timeout=15)
        assert r.status_code == 200
        cp = _get_cp(admin_headers, doctor_id, VARIANT_ID)
        assert cp is not None
        assert cp["rate"] == 110
        assert cp["protected"] is True

    def test_apply_keep_all(self, admin_headers, doctor_id, product_ctx):
        _set_cp(admin_headers, doctor_id, product_ctx["product_id"], VARIANT_ID, rate=115, protected=False)
        body = {"variant_id": VARIANT_ID, "product_id": product_ctx["product_id"],
                "category": "doctor", "new_rate": 170, "mode": "keep_all"}
        r = requests.post(f"{BASE_URL}/api/admin/pricing/category-change/apply",
                          headers=admin_headers, json=body, timeout=15)
        assert r.status_code == 200
        assert r.json()["customers_reset"] == 0
        cp = _get_cp(admin_headers, doctor_id, VARIANT_ID)
        assert cp is not None and cp["rate"] == 115

    def test_apply_reset_all_removes_protected_too(self, admin_headers, doctor_id, product_ctx):
        _set_cp(admin_headers, doctor_id, product_ctx["product_id"], VARIANT_ID, rate=105, protected=True)
        body = {"variant_id": VARIANT_ID, "product_id": product_ctx["product_id"],
                "category": "doctor", "new_rate": 170, "mode": "reset_all"}
        r = requests.post(f"{BASE_URL}/api/admin/pricing/category-change/apply",
                          headers=admin_headers, json=body, timeout=15)
        assert r.status_code == 200, r.text
        cp = _get_cp(admin_headers, doctor_id, VARIANT_ID)
        assert cp is None

    def test_preview_no_affected_when_no_customer_price(self, admin_headers, doctor_id, product_ctx):
        _delete_cp(admin_headers, doctor_id, VARIANT_ID)
        body = {"variant_id": VARIANT_ID, "category": "doctor", "new_rate": 175}
        r = requests.post(f"{BASE_URL}/api/admin/pricing/category-change/preview",
                          headers=admin_headers, json=body, timeout=15)
        assert r.status_code == 200
        assert r.json()["count"] == 0

    def test_customer_level_price_protected_treated_protected(self, admin_headers, doctor_id, product_ctx):
        # Set cp.protected=False but customer.price_protected=True
        _set_cp(admin_headers, doctor_id, product_ctx["product_id"], VARIANT_ID, rate=100, protected=False)
        r = requests.put(f"{BASE_URL}/api/admin/customers/{doctor_id}",
                         headers=admin_headers, json={"price_protected": True}, timeout=15)
        # Endpoint may vary; if 404 skip
        if r.status_code not in (200, 204):
            pytest.skip(f"customer patch endpoint returned {r.status_code}; skipping")
        prev = requests.post(f"{BASE_URL}/api/admin/pricing/category-change/preview",
                             headers=admin_headers, json={"variant_id": VARIANT_ID, "category": "doctor",
                                                          "new_rate": 170}, timeout=15).json()
        me = [a for a in prev["affected"] if a["customer_id"] == doctor_id]
        assert me and me[0]["protected"] is True
        # Reset
        requests.put(f"{BASE_URL}/api/admin/customers/{doctor_id}",
                     headers=admin_headers, json={"price_protected": False}, timeout=15)
        _delete_cp(admin_headers, doctor_id, VARIANT_ID)


# -------------------- 4. Quotation convert with update_customer_pricing --------------------
class TestQuotationConvert:
    def test_convert_writes_last_confirmed(self, admin_headers, doctor_id, product_ctx):
        _delete_cp(admin_headers, doctor_id, VARIANT_ID)
        # Create quotation
        qbody = {
            "customer_id": doctor_id,
            "items": [{"variant_id": VARIANT_ID, "product_id": product_ctx["product_id"],
                       "name": "NERVIPHOS-BM 100ml", "packing": "100ml", "unit": "vial",
                       "qty": 5, "rate": 133, "gst": 12}],
        }
        r = requests.post(f"{BASE_URL}/api/admin/quotations", headers=admin_headers, json=qbody, timeout=20)
        assert r.status_code == 200, r.text
        qid = r.json()["id"]
        # Convert with update_customer_pricing
        rc = requests.post(f"{BASE_URL}/api/admin/quotations/{qid}/convert",
                           headers=admin_headers, json={"update_customer_pricing": True}, timeout=20)
        assert rc.status_code == 200, rc.text
        cp = _get_cp(admin_headers, doctor_id, VARIANT_ID)
        assert cp is not None, "customer price not written by convert"
        assert cp["rate"] == 133
        assert cp["source"] == "last_confirmed"


# -------------------- 5. Final cleanup: leave doctor in valid state --------------------
def test_zz_final_restore(admin_headers, doctor_id, product_ctx):
    """Leave doctor with a valid non-broken pricing state (customer-specific 125 + 10+4)."""
    _delete_cp(admin_headers, doctor_id, VARIANT_ID)
    _set_cp(admin_headers, doctor_id, product_ctx["product_id"], VARIANT_ID,
            rate=125, offer={"scheme_type": "free_qty", "buy_quantity": 10, "free_quantity": 4},
            source="last_confirmed")
    # Restore pricing engine settings to True
    r = requests.get(f"{BASE_URL}/api/admin/pricing/settings", headers=admin_headers, timeout=10)
    settings = r.json()
    settings.update({"enable_customer_pricing": True, "enable_category_pricing": True,
                     "enable_customer_specific_pricing": True, "enable_last_confirmed_pricing": True,
                     "enable_price_protection": True})
    requests.put(f"{BASE_URL}/api/admin/pricing/settings", headers=admin_headers, json=settings, timeout=10)
    cp = _get_cp(admin_headers, doctor_id, VARIANT_ID)
    assert cp is not None and cp["rate"] == 125
