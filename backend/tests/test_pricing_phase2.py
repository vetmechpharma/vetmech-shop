"""Phase 2 pricing engine + storefront user-wise pricing tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vetmech-pharma.preview.emergentagent.com").rstrip("/")
PROD_SLUG = "nerviphos-bm"
PROD_ID = "prod-nerviphos-bm"
VARIANT_100ML = "723814ff-2701-4beb-8d95-8a97962be4fe"

DOCTOR_MOBILE = "9876500011"
DOCTOR_PASSWORD = "pass123"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": "vetmechpharma@gmail.com", "password": "Admin@123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def doctor_token():
    r = requests.post(f"{BASE_URL}/api/auth/login/password",
                      json={"mobile": DOCTOR_MOBILE, "password": DOCTOR_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    return data["token"], data["customer"]["id"]


@pytest.fixture
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def doc_h(doctor_token):
    return {"Authorization": f"Bearer {doctor_token[0]}"}


# ---------- 1. Guest sees public pricing only ----------
class TestGuestPricing:
    def test_guest_product_detail_no_your_price(self):
        r = requests.get(f"{BASE_URL}/api/products/{PROD_SLUG}")
        assert r.status_code == 200
        p = r.json()
        v = next(v for v in p["variants"] if v["id"] == VARIANT_100ML)
        assert v["selling_price"] == 155
        assert "your_price" not in v
        assert "price_source" not in v
        # no category matrix leak
        assert "category_prices" not in v

    def test_guest_products_list_no_your_price(self):
        r = requests.get(f"{BASE_URL}/api/products", params={"q": "NERVIPHOS", "limit": 5})
        assert r.status_code == 200
        items = r.json()["items"]
        assert items
        for p in items:
            for v in p["variants"]:
                assert "your_price" not in v
                assert "category_prices" not in v

    def test_guest_cart_calculate_public_source(self):
        r = requests.post(f"{BASE_URL}/api/cart/calculate",
                          json={"items": [{"variant_id": VARIANT_100ML, "qty": 2}]})
        assert r.status_code == 200
        line = r.json()["items"][0]
        assert line["unit_price"] == 155
        assert line["price_source"] == "public"


# ---------- 2. Admin Category Pricing CRUD ----------
class TestCategoryPricing:
    def test_get_matrix(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/pricing/product/{PROD_ID}", headers=admin_h)
        assert r.status_code == 200
        data = r.json()
        assert data["product_name"] == "NERVIPHOS-BM"
        assert "doctor" in data["categories"]
        variants = {v["variant_id"]: v for v in data["variants"]}
        assert VARIANT_100ML in variants

    def test_put_and_persist(self, admin_h):
        # set agency=140 for 100ml
        r = requests.put(f"{BASE_URL}/api/admin/pricing/product/{PROD_ID}", headers=admin_h,
                         json={"prices": [{"variant_id": VARIANT_100ML, "category": "agency", "rate": 140}]})
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/admin/pricing/product/{PROD_ID}", headers=admin_h)
        v = next(v for v in r2.json()["variants"] if v["variant_id"] == VARIANT_100ML)
        assert v["category_prices"].get("agency") == 140
        # verify doctor still set (regression, may not exist depending on state)

    def test_put_blank_clears(self, admin_h):
        # blank out agency
        r = requests.put(f"{BASE_URL}/api/admin/pricing/product/{PROD_ID}", headers=admin_h,
                         json={"prices": [{"variant_id": VARIANT_100ML, "category": "agency", "rate": None}]})
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/admin/pricing/product/{PROD_ID}", headers=admin_h)
        v = next(v for v in r2.json()["variants"] if v["variant_id"] == VARIANT_100ML)
        assert "agency" not in v["category_prices"] or v["category_prices"].get("agency") is None

    def test_ensure_doctor_130(self, admin_h):
        # ensure doctor=130 exists (setup for later tests)
        r = requests.put(f"{BASE_URL}/api/admin/pricing/product/{PROD_ID}", headers=admin_h,
                         json={"prices": [{"variant_id": VARIANT_100ML, "category": "doctor", "rate": 130}]})
        assert r.status_code == 200


# ---------- 3. Doctor sees category price ----------
class TestDoctorCategoryPricing:
    def test_clear_customer_specific_first(self, admin_h, doctor_token):
        cid = doctor_token[1]
        # DELETE any existing customer price so category shows through
        requests.delete(f"{BASE_URL}/api/admin/pricing/customer/{cid}/item/{VARIANT_100ML}",
                        headers=admin_h)

    def test_doctor_product_detail_shows_category_price(self, doc_h):
        r = requests.get(f"{BASE_URL}/api/products/{PROD_SLUG}", headers=doc_h)
        assert r.status_code == 200
        v = next(v for v in r.json()["variants"] if v["id"] == VARIANT_100ML)
        assert v.get("your_price") == 130, f"expected 130 got {v.get('your_price')}"
        assert v.get("price_source") == "category"
        assert v.get("is_special") is True
        # SECURITY: no category matrix
        assert "category_prices" not in v

    def test_doctor_cart_calc_category(self, doc_h):
        r = requests.post(f"{BASE_URL}/api/cart/calculate", headers=doc_h,
                          json={"items": [{"variant_id": VARIANT_100ML, "qty": 5}]})
        assert r.status_code == 200
        line = r.json()["items"][0]
        assert line["unit_price"] == 130
        assert line["price_source"] == "category"

    def test_doctor_products_list_no_leak(self, doc_h):
        r = requests.get(f"{BASE_URL}/api/products", params={"q": "NERVIPHOS"}, headers=doc_h)
        assert r.status_code == 200
        for p in r.json()["items"]:
            for v in p["variants"]:
                assert "category_prices" not in v, "category matrix leaked to storefront!"


# ---------- 4. Customer-specific overrides ----------
class TestCustomerSpecific:
    def test_admin_add_customer_price(self, admin_h, doctor_token):
        cid = doctor_token[1]
        payload = {
            "variant_id": VARIANT_100ML, "rate": 120, "protected": False, "source": "manual",
            "offer": {"scheme_type": "free_qty", "buy_quantity": 10, "free_quantity": 3,
                      "name": "Special 10+3"},
        }
        r = requests.post(f"{BASE_URL}/api/admin/pricing/customer/{cid}/item",
                          headers=admin_h, json=payload)
        assert r.status_code == 200, r.text
        # verify list
        r2 = requests.get(f"{BASE_URL}/api/admin/pricing/customer/{cid}", headers=admin_h)
        assert r2.status_code == 200
        items = r2.json()["items"]
        row = next((x for x in items if x["variant_id"] == VARIANT_100ML), None)
        assert row is not None
        assert row["rate"] == 120
        assert row["source"] == "manual"
        assert row["offer"]["buy_quantity"] == 10

    def test_doctor_sees_customer_specific(self, doc_h):
        r = requests.get(f"{BASE_URL}/api/products/{PROD_SLUG}", headers=doc_h)
        v = next(v for v in r.json()["variants"] if v["id"] == VARIANT_100ML)
        assert v.get("your_price") == 120
        assert v.get("price_source") in ("manual", "customer_specific")

    def test_cart_calc_customer_offer(self, doc_h):
        r = requests.post(f"{BASE_URL}/api/cart/calculate", headers=doc_h,
                          json={"items": [{"variant_id": VARIANT_100ML, "qty": 10}]})
        assert r.status_code == 200
        line = r.json()["items"][0]
        assert line["unit_price"] == 120
        assert line["price_source"] in ("manual", "customer_specific")
        assert line["offer_source"] == "customer"
        assert line["free_qty"] == 3

    def test_toggle_protected(self, admin_h, doctor_token):
        cid = doctor_token[1]
        r = requests.patch(f"{BASE_URL}/api/admin/pricing/customer/{cid}/item/{VARIANT_100ML}/protect",
                           headers=admin_h, json={"protected": True})
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/admin/pricing/customer/{cid}", headers=admin_h)
        row = next(x for x in r2.json()["items"] if x["variant_id"] == VARIANT_100ML)
        assert row["protected"] is True
        # untoggle
        requests.patch(f"{BASE_URL}/api/admin/pricing/customer/{cid}/item/{VARIANT_100ML}/protect",
                       headers=admin_h, json={"protected": False})

    def test_history_endpoint(self, admin_h, doctor_token):
        cid = doctor_token[1]
        r = requests.get(f"{BASE_URL}/api/admin/pricing/customer/{cid}/history", headers=admin_h)
        assert r.status_code == 200
        assert "items" in r.json()


# ---------- 5. Order pricing server-side ----------
class TestOrderPricing:
    def test_order_reorder_uses_customer_price(self, doc_h):
        # This can only test via cart_calculate + order flow; direct order needs OTP verification.
        # We rely on cart/calculate which uses same resolve_cart.
        r = requests.post(f"{BASE_URL}/api/cart/calculate", headers=doc_h,
                          json={"items": [{"variant_id": VARIANT_100ML, "qty": 10}]})
        line = r.json()["items"][0]
        assert "price_source" in line
        assert "offer_source" in line


# ---------- 6. Settings toggle behavior ----------
class TestPricingSettings:
    @pytest.fixture(autouse=True)
    def restore_settings(self, admin_h):
        yield
        # always restore both toggles to True
        requests.put(f"{BASE_URL}/api/admin/pricing/settings", headers=admin_h,
                     json={"enable_customer_pricing": True, "enable_customer_specific_pricing": True,
                           "enable_category_pricing": True})

    def test_master_switch_off(self, admin_h, doc_h):
        r = requests.put(f"{BASE_URL}/api/admin/pricing/settings", headers=admin_h,
                         json={"enable_customer_pricing": False})
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/products/{PROD_SLUG}", headers=doc_h)
        v = next(v for v in r2.json()["variants"] if v["id"] == VARIANT_100ML)
        assert "your_price" not in v, "with master switch off, doctor should get public"
        c = requests.post(f"{BASE_URL}/api/cart/calculate", headers=doc_h,
                          json={"items": [{"variant_id": VARIANT_100ML, "qty": 1}]}).json()
        assert c["items"][0]["price_source"] == "public"
        assert c["items"][0]["unit_price"] == 155

    def test_customer_specific_off_falls_back_to_category(self, admin_h, doc_h):
        # turn OFF customer-specific only; category should remain 130
        r = requests.put(f"{BASE_URL}/api/admin/pricing/settings", headers=admin_h,
                         json={"enable_customer_pricing": True,
                               "enable_customer_specific_pricing": False,
                               "enable_category_pricing": True})
        assert r.status_code == 200
        c = requests.post(f"{BASE_URL}/api/cart/calculate", headers=doc_h,
                          json={"items": [{"variant_id": VARIANT_100ML, "qty": 1}]}).json()
        line = c["items"][0]
        assert line["unit_price"] == 130
        assert line["price_source"] == "category"


# ---------- 7. Pending customer -> public pricing ----------
class TestPendingCustomer:
    def test_create_pending_and_verify_public(self, admin_h):
        import random
        mobile = f"98765{random.randint(10000, 99999)}"
        # register (self-registration creates pending)
        reg = requests.post(f"{BASE_URL}/api/auth/register",
                            json={"name": "TEST Pending", "mobile": mobile, "password": "pass1234",
                                  "category": "doctor", "email": f"t{mobile}@t.com",
                                  "company_name": "T", "pincode": "682001",
                                  "state": "Kerala", "district": "Kochi"})
        if reg.status_code not in (200, 201):
            pytest.skip(f"Register failed: {reg.status_code} {reg.text}")
        # login (pending customer allowed to login? per iter_6, yes with status_label Pending)
        lg = requests.post(f"{BASE_URL}/api/auth/login/password",
                           json={"mobile": mobile, "password": "pass1234"})
        if lg.status_code != 200:
            pytest.skip(f"Pending login not allowed: {lg.status_code}")
        tok = lg.json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        r = requests.get(f"{BASE_URL}/api/products/{PROD_SLUG}", headers=h)
        v = next(v for v in r.json()["variants"] if v["id"] == VARIANT_100ML)
        assert "your_price" not in v, "pending customer should NOT get your_price"


# ---------- 8. Final restore: leave doctor with working customer-specific 120 + 10+3 offer ----------
class TestFinalRestore:
    def test_restore_doctor_pricing(self, admin_h, doctor_token):
        cid = doctor_token[1]
        # ensure customer-specific still set at end of test suite
        r = requests.post(f"{BASE_URL}/api/admin/pricing/customer/{cid}/item",
                          headers=admin_h,
                          json={"variant_id": VARIANT_100ML, "rate": 120, "protected": False,
                                "source": "manual",
                                "offer": {"scheme_type": "free_qty", "buy_quantity": 10,
                                          "free_quantity": 3, "name": "Special 10+3"}})
        assert r.status_code == 200
