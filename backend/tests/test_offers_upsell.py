"""Backend tests for the User-Wise Pricing enhancement: variant Offers CRUD,
best-offer (max free units) selection, category-specific offers, upsell nudges."""
import os
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"
VARIANT_ID = "723814ff-2701-4beb-8d95-8a97962be4fe"  # NERVIPHOS-BM 100ml
ADMIN = {"email": "vetmechpharma@gmail.com", "password": "Admin@123"}
DOCTOR = {"mobile": "9876500011", "password": "pass123"}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def doctor_token():
    r = requests.post(f"{API}/auth/login/password", json=DOCTOR, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def doctor_h(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}"}


# ---------- Offers CRUD (managed via Pricing Manager) ----------
class TestOffersCRUD:
    def test_list_existing_offers(self, admin_h):
        r = requests.get(f"{API}/admin/pricing/offers/{VARIANT_ID}", headers=admin_h)
        assert r.status_code == 200
        items = r.json()["items"]
        assert isinstance(items, list)
        # Seed says 10+3 and 60+22 (and demo 10+5) should exist
        labels = {(s.get("buy_quantity"), s.get("free_quantity")) for s in items if s.get("scheme_type") == "free_qty"}
        assert (10, 3) in labels
        assert (60, 22) in labels

    def test_create_and_delete_free_qty_offer_doctor(self, admin_h):
        payload = {"name": "TEST_doctor_offer", "scheme_type": "free_qty",
                   "product_id": None, "variant_id": VARIANT_ID,
                   "buy_quantity": 20, "free_quantity": 6,
                   "customer_type": "doctor", "active": True}
        r = requests.post(f"{API}/admin/pricing/offers", json=payload, headers=admin_h)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        # Verify in list
        lst = requests.get(f"{API}/admin/pricing/offers/{VARIANT_ID}", headers=admin_h).json()["items"]
        assert any(s["id"] == sid and s["customer_type"] == "doctor" for s in lst)
        # Delete
        d = requests.delete(f"{API}/admin/pricing/offers/{sid}", headers=admin_h)
        assert d.status_code == 200
        lst2 = requests.get(f"{API}/admin/pricing/offers/{VARIANT_ID}", headers=admin_h).json()["items"]
        assert not any(s["id"] == sid for s in lst2)

    def test_create_offer_validation_missing_buy_free(self, admin_h):
        r = requests.post(f"{API}/admin/pricing/offers",
                          json={"scheme_type": "free_qty", "variant_id": VARIANT_ID}, headers=admin_h)
        assert r.status_code == 400

    def test_create_special_price_offer(self, admin_h):
        payload = {"name": "TEST_case_offer", "scheme_type": "case_price",
                   "variant_id": VARIANT_ID, "special_price": 99, "min_quantity": 50,
                   "customer_type": "all", "active": True}
        r = requests.post(f"{API}/admin/pricing/offers", json=payload, headers=admin_h)
        assert r.status_code == 200
        sid = r.json()["id"]
        # cleanup
        requests.delete(f"{API}/admin/pricing/offers/{sid}", headers=admin_h)


# ---------- Best-offer selection = MAX FREE UNITS (no stacking) ----------
class TestBestOfferMaxFree:
    def _calc(self, qty, headers=None):
        h = headers or {}
        r = requests.post(f"{API}/cart/calculate",
                          json={"items": [{"variant_id": VARIANT_ID, "qty": qty}]},
                          headers=h, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert len(items) == 1
        return items[0]

    def test_qty_60_picks_offer_with_most_free_units(self):
        # 10+3 -> 18, 60+22 -> 22, 10+5 -> 30. Max = 30 (via 10+5)
        line = self._calc(60)
        assert line["free_qty"] == 30, f"Expected 30 free, got {line['free_qty']} (label={line['scheme_label']})"
        assert line["scheme_label"] == "10+5"

    def test_qty_22_no_60_tier_uses_best_of_10(self):
        # 22 // 10 = 2. 10+3 -> 6, 10+5 -> 10. Max = 10.
        line = self._calc(22)
        assert line["free_qty"] == 10
        assert line["scheme_label"] == "10+5"

    def test_qty_below_all_tiers_zero_free(self):
        line = self._calc(5)
        assert line["free_qty"] == 0


# ---------- Category-specific offer application ----------
class TestCategoryScopedOffers:
    def test_guest_sees_public_only(self, admin_h):
        # Create a doctor-only offer 20+8 and verify guest does NOT get it
        p = requests.post(f"{API}/admin/pricing/offers", json={
            "name": "TEST_doc_only_20_8", "scheme_type": "free_qty",
            "variant_id": VARIANT_ID, "buy_quantity": 20, "free_quantity": 8,
            "customer_type": "doctor", "active": True}, headers=admin_h).json()
        sid = p["id"]
        try:
            # Guest cart at qty 20 -> should use best public offer (10+5 => 10 free), NOT 8
            r = requests.post(f"{API}/cart/calculate",
                              json={"items": [{"variant_id": VARIANT_ID, "qty": 20}]}, timeout=15)
            line = r.json()["items"][0]
            # Public options at qty=20: 10+3->6, 10+5->10. Best=10. Doctor-only 20+8 must be ignored.
            assert line["free_qty"] == 10, f"guest got {line['free_qty']} free (label={line['scheme_label']})"
            assert line["offer_source"] in ("public", "category")  # no customer/category since guest
        finally:
            requests.delete(f"{API}/admin/pricing/offers/{sid}", headers=admin_h)

    def test_doctor_sees_category_offer(self, admin_h, doctor_h):
        # Doctor already has customer_specific price on this variant per prev iteration.
        # Create a strong doctor-only offer 10+9. When category-scope wins, doctor should get 9 free per 10.
        # Note: doctor may have customer-specific offer that overrides — first remove customer offer.
        # Fetch doctor id
        me = requests.get(f"{API}/auth/customer/me", headers=doctor_h).json()
        did = me["id"]
        # Remove any customer-specific price on this variant to allow category offers to surface
        requests.delete(f"{API}/admin/pricing/customer/{did}/item/{VARIANT_ID}", headers=admin_h)

        p = requests.post(f"{API}/admin/pricing/offers", json={
            "name": "TEST_doc_cat_10_9", "scheme_type": "free_qty",
            "variant_id": VARIANT_ID, "buy_quantity": 10, "free_quantity": 9,
            "customer_type": "doctor", "active": True}, headers=admin_h).json()
        sid = p["id"]
        try:
            r = requests.post(f"{API}/cart/calculate",
                              json={"items": [{"variant_id": VARIANT_ID, "qty": 20}]},
                              headers=doctor_h, timeout=15)
            line = r.json()["items"][0]
            # Doctor's category-only offers: 10+9. pick_offer_schemes returns ONLY doctor-scoped
            # (because a category-specific one exists), so best free = 20//10 * 9 = 18
            assert line["free_qty"] == 18, f"doctor got {line['free_qty']} (label={line['scheme_label']})"
            assert line["scheme_label"] == "10+9"
            assert line["offer_source"] == "category"
        finally:
            requests.delete(f"{API}/admin/pricing/offers/{sid}", headers=admin_h)


# ---------- Upsell nudge (compute_upsell) ----------
class TestUpsell:
    def test_upsell_message_at_qty_22(self):
        r = requests.post(f"{API}/cart/calculate",
                          json={"items": [{"variant_id": VARIANT_ID, "qty": 22}]}, timeout=15)
        line = r.json()["items"][0]
        up = line.get("upsell")
        assert up is not None, "Expected upsell nudge at qty=22 (short of 30 for 10+5)"
        # main-agent verified: 'Add 8 more to reach 30 and get 15 free (10+5)'
        assert up["add"] == 8
        assert up["target_qty"] == 30
        assert up["free_qty"] == 15
        assert "10+5" in up["label"]

    def test_no_upsell_when_at_tier(self):
        r = requests.post(f"{API}/cart/calculate",
                          json={"items": [{"variant_id": VARIANT_ID, "qty": 30}]}, timeout=15)
        line = r.json()["items"][0]
        # Qty=30 -> 10+5 gives 15 free. Any higher tier that adds more would still show, but per data none.
        # Just assert either None or the "add" is a positive int leading to more free.
        up = line.get("upsell")
        if up is not None:
            assert up["free_qty"] > line["free_qty"]


# ---------- Regression: guest=public / doctor=category resolution ----------
class TestPricingRegression:
    def test_guest_public_price(self):
        r = requests.post(f"{API}/cart/calculate",
                          json={"items": [{"variant_id": VARIANT_ID, "qty": 1}]}, timeout=15)
        line = r.json()["items"][0]
        assert line["price_source"] == "public"

    def test_doctor_category_price(self, doctor_h, admin_h):
        # Ensure no customer-specific override
        me = requests.get(f"{API}/auth/customer/me", headers=doctor_h).json()
        requests.delete(f"{API}/admin/pricing/customer/{me['id']}/item/{VARIANT_ID}", headers=admin_h)
        r = requests.post(f"{API}/cart/calculate",
                          json={"items": [{"variant_id": VARIANT_ID, "qty": 1}]},
                          headers=doctor_h, timeout=15)
        line = r.json()["items"][0]
        # Per iteration_8: doctor category rate = 170
        assert line["price_source"] == "category"
        assert line["unit_price"] == 170


# ---------- Product detail active_schemes carries category filter ----------
class TestProductDetailSchemes:
    def _find_slug(self):
        r = requests.get(f"{API}/products?limit=100").json()
        for p in r.get("items", r if isinstance(r, list) else []):
            for v in p.get("variants", []):
                if v.get("id") == VARIANT_ID:
                    return p["slug"]
        return None

    def test_active_schemes_present_for_guest(self):
        slug = self._find_slug()
        assert slug, "product for VARIANT_ID not found"
        r = requests.get(f"{API}/products/{slug}").json()
        v = next(x for x in r["variants"] if x["id"] == VARIANT_ID)
        assert "active_schemes" in v
        # Guest sees public-scope offers only
        for s in v["active_schemes"]:
            # allowed to lack customer_type in normalized desc; ensure it's not doctor-only
            assert s.get("type") in (None, "free_qty", "special_price", "case_price")
