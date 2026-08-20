"""Tests for feature batch 4:
- Square image upload (padded WebP)
- Multi-scheme per variant (free_qty + special_price together, lowest wins)
- case_price scheme type
- Product page shows ALL active_schemes
- Per-variant images persist
- Admin create/edit/delete order
- Regression: existing NERVIPHOS-BM scheme still works
"""
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "vetmechpharma@gmail.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Square upload ----------
class TestSquareUpload:
    def test_square_upload_returns_webp(self, admin_headers):
        img = Image.new("RGB", (800, 400), (255, 0, 0))
        buf = io.BytesIO(); img.save(buf, format="PNG"); buf.seek(0)
        r = requests.post(f"{BASE_URL}/api/admin/upload?square=true",
                          headers=admin_headers,
                          files={"file": ("nonsquare.png", buf.getvalue(), "image/png")})
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        assert url.endswith(".webp"), f"Expected webp url, got {url}"
        # GET returns image/webp
        g = requests.get(f"{BASE_URL}{url}")
        assert g.status_code == 200
        assert "webp" in g.headers.get("content-type", "").lower()
        # Verify dimensions -> square
        out = Image.open(io.BytesIO(g.content))
        assert out.width == out.height, f"Expected square, got {out.size}"

    def test_non_square_param_still_works(self, admin_headers):
        img = Image.new("RGB", (2000, 1000), (0, 255, 0))
        buf = io.BytesIO(); img.save(buf, format="JPEG"); buf.seek(0)
        r = requests.post(f"{BASE_URL}/api/admin/upload",
                          headers=admin_headers,
                          files={"file": ("wide.jpg", buf.getvalue(), "image/jpeg")})
        assert r.status_code == 200
        url = r.json()["url"]
        assert url.endswith(".webp")
        g = requests.get(f"{BASE_URL}{url}")
        out = Image.open(io.BytesIO(g.content))
        assert out.width <= 1600


# ---------- Multi-scheme per variant ----------
@pytest.fixture(scope="module")
def nerviphos_variant(admin_headers):
    """Get a variant on NERVIPHOS-BM to attach test schemes."""
    r = requests.get(f"{BASE_URL}/api/products/nerviphos-bm")
    assert r.status_code == 200, r.text
    p = r.json()
    # Use last variant (avoid clashing with seeded NBM-100 first-variant scheme)
    variants = p["variants"]
    assert len(variants) >= 1
    # Pick the variant with sku NBM-500 or second one; fall back to first
    v = next((x for x in variants if x.get("sku") == "NBM-500"), variants[-1])
    return {"product_id": p["id"], "variant_id": v["id"], "sku": v.get("sku")}


@pytest.fixture(scope="module")
def cleanup_test_schemes(admin_headers):
    """Track scheme ids and delete after tests."""
    created = []
    yield created
    for sid in created:
        try:
            requests.delete(f"{BASE_URL}/api/admin/schemes/{sid}", headers=admin_headers)
        except Exception:
            pass


class TestMultiScheme:
    def test_free_qty_and_special_price_together(self, admin_headers, nerviphos_variant, cleanup_test_schemes):
        vid = nerviphos_variant["variant_id"]
        pid = nerviphos_variant["product_id"]
        # Create free_qty scheme: buy 10 get 2
        r1 = requests.post(f"{BASE_URL}/api/admin/schemes", headers=admin_headers, json={
            "name": "TEST_free_10_2", "scheme_type": "free_qty",
            "product_id": pid, "variant_id": vid,
            "buy_quantity": 10, "free_quantity": 2, "active": True,
        })
        assert r1.status_code == 200, r1.text
        s1 = r1.json(); cleanup_test_schemes.append(s1["id"])

        # Create special_price scheme: min 10 @ 95
        r2 = requests.post(f"{BASE_URL}/api/admin/schemes", headers=admin_headers, json={
            "name": "TEST_special_95", "scheme_type": "special_price",
            "product_id": pid, "variant_id": vid,
            "min_quantity": 10, "special_price": 95, "active": True,
        })
        assert r2.status_code == 200, r2.text
        s2 = r2.json(); cleanup_test_schemes.append(s2["id"])

        # Calculate cart for qty 10
        r = requests.post(f"{BASE_URL}/api/cart/calculate",
                          json={"items": [{"variant_id": vid, "qty": 10}]})
        assert r.status_code == 200, r.text
        line = r.json()["items"][0]
        assert line["free_qty"] == 2, f"Expected free_qty=2, got {line['free_qty']}"
        assert line["unit_price"] == 95, f"Expected unit_price=95, got {line['unit_price']}"

    def test_lowest_special_price_wins(self, admin_headers, nerviphos_variant, cleanup_test_schemes):
        vid = nerviphos_variant["variant_id"]
        pid = nerviphos_variant["product_id"]
        # Add another special_price at 88 (should beat 95)
        r = requests.post(f"{BASE_URL}/api/admin/schemes", headers=admin_headers, json={
            "name": "TEST_special_88", "scheme_type": "special_price",
            "product_id": pid, "variant_id": vid,
            "min_quantity": 10, "special_price": 88, "active": True,
        })
        assert r.status_code == 200, r.text
        cleanup_test_schemes.append(r.json()["id"])

        rc = requests.post(f"{BASE_URL}/api/cart/calculate",
                           json={"items": [{"variant_id": vid, "qty": 10}]})
        assert rc.status_code == 200
        line = rc.json()["items"][0]
        assert line["unit_price"] == 88, f"Expected lowest price 88, got {line['unit_price']}"
        assert line["free_qty"] == 2, "free_qty should still apply"

    def test_case_price_scheme_type(self, admin_headers, nerviphos_variant, cleanup_test_schemes):
        vid = nerviphos_variant["variant_id"]
        pid = nerviphos_variant["product_id"]
        # case_price at 80 with min_qty=12 (case size)
        r = requests.post(f"{BASE_URL}/api/admin/schemes", headers=admin_headers, json={
            "name": "TEST_case_80", "scheme_type": "case_price",
            "product_id": pid, "variant_id": vid,
            "min_quantity": 12, "special_price": 80, "active": True,
        })
        assert r.status_code == 200, r.text
        cleanup_test_schemes.append(r.json()["id"])

        # qty 12 should hit case_price 80 (beats 88)
        rc = requests.post(f"{BASE_URL}/api/cart/calculate",
                           json={"items": [{"variant_id": vid, "qty": 12}]})
        assert rc.status_code == 200
        line = rc.json()["items"][0]
        assert line["unit_price"] == 80, f"Expected 80, got {line['unit_price']}"

        # qty 10 should NOT hit case_price (min 12) — falls back to 88
        rc2 = requests.post(f"{BASE_URL}/api/cart/calculate",
                            json={"items": [{"variant_id": vid, "qty": 10}]})
        line2 = rc2.json()["items"][0]
        assert line2["unit_price"] == 88, f"Expected 88 at qty 10, got {line2['unit_price']}"

    def test_product_detail_shows_all_active_schemes(self, nerviphos_variant):
        vid = nerviphos_variant["variant_id"]
        r = requests.get(f"{BASE_URL}/api/products/nerviphos-bm")
        assert r.status_code == 200
        p = r.json()
        v = next(x for x in p["variants"] if x["id"] == vid)
        schemes = v.get("active_schemes", [])
        names = [s["name"] for s in schemes]
        # All three TEST schemes should be present
        assert any("TEST_free_10_2" in n for n in names), f"free scheme missing: {names}"
        assert any("TEST_special_95" in n for n in names), f"special95 missing: {names}"
        assert any("TEST_special_88" in n for n in names), f"special88 missing: {names}"
        assert any("TEST_case_80" in n for n in names), f"case scheme missing: {names}"
        # Assert case_price type appears
        types = {s["type"] for s in schemes}
        assert "case_price" in types


# ---------- Per-variant images ----------
class TestVariantImages:
    def test_variant_images_persist(self, admin_headers):
        # Fetch NERVIPHOS-BM admin doc
        list_r = requests.get(f"{BASE_URL}/api/admin/products?q=NERVIPHOS-BM",
                              headers=admin_headers)
        assert list_r.status_code == 200
        items = list_r.json()["items"]
        prod = next(p for p in items if p["name"].startswith("NERVIPHOS-BM"))
        pid = prod["id"]
        full = requests.get(f"{BASE_URL}/api/admin/products/{pid}", headers=admin_headers).json()

        # Add images to first variant
        variants = full["variants"]
        test_imgs = ["/api/uploads/test_img1.webp", "/api/uploads/test_img2.webp"]
        variants[0]["images"] = test_imgs

        up = requests.put(f"{BASE_URL}/api/admin/products/{pid}",
                          headers=admin_headers,
                          json={"variants": variants})
        assert up.status_code == 200, up.text

        # Fetch back and verify
        after = requests.get(f"{BASE_URL}/api/admin/products/{pid}", headers=admin_headers).json()
        assert after["variants"][0].get("images") == test_imgs, \
            f"variant images not persisted: {after['variants'][0].get('images')}"


# ---------- Admin order create/edit/delete ----------
class TestAdminOrders:
    @pytest.fixture(scope="class")
    def created_order(self, admin_headers):
        # Get a variant to use
        r = requests.get(f"{BASE_URL}/api/products/nerviphos-bm")
        p = r.json()
        vid = p["variants"][0]["id"]
        payload = {
            "name": "TEST Admin Customer", "mobile": "9999911111",
            "category": "doctor",
            "address": {"line1": "123 Test St", "pincode": "560001",
                        "state": "Karnataka", "district": "Bengaluru"},
            "items": [{"variant_id": vid, "qty": 10}],
            "save_customer": False,
        }
        rc = requests.post(f"{BASE_URL}/api/admin/orders", headers=admin_headers, json=payload)
        assert rc.status_code == 200, rc.text
        order = rc.json()
        yield order
        # cleanup
        requests.delete(f"{BASE_URL}/api/admin/orders/{order['id']}", headers=admin_headers)

    def test_create_order(self, admin_headers, created_order):
        o = created_order
        assert o["order_number"].startswith("VM-2026-"), f"Bad order#: {o['order_number']}"
        assert len(o["order_number"]) == len("VM-2026-00001")
        assert o["total_qty"] == 10
        # free_qty at least accounted for (seeded 10+5 for NBM-100 first variant)
        assert o["total_free"] >= 0
        # activity has "created by admin"
        acts = " ".join(a["text"] for a in o.get("activity", []))
        assert "created by admin" in acts.lower()
        # Appears in admin listing
        lst = requests.get(f"{BASE_URL}/api/admin/orders?q={o['order_number']}",
                          headers=admin_headers)
        assert lst.status_code == 200
        assert any(x["id"] == o["id"] for x in lst.json()["items"])

    def test_edit_order_recomputes(self, admin_headers, created_order):
        o = created_order
        vid = o["items"][0]["variant_id"]
        r = requests.put(f"{BASE_URL}/api/admin/orders/{o['id']}",
                         headers=admin_headers,
                         json={"items": [{"variant_id": vid, "qty": 20}]})
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["total_qty"] == 20
        acts = " ".join(a["text"] for a in u.get("activity", []))
        assert "edited" in acts.lower()

    def test_delete_order(self, admin_headers):
        # Create a throwaway order to delete
        r = requests.get(f"{BASE_URL}/api/products/nerviphos-bm")
        vid = r.json()["variants"][0]["id"]
        rc = requests.post(f"{BASE_URL}/api/admin/orders", headers=admin_headers, json={
            "name": "TEST Delete", "mobile": "9999900000",
            "address": {"line1": "x", "pincode": "560001",
                        "state": "Karnataka", "district": "Bengaluru"},
            "items": [{"variant_id": vid, "qty": 1}],
            "save_customer": False,
        })
        assert rc.status_code == 200
        oid = rc.json()["id"]

        d = requests.delete(f"{BASE_URL}/api/admin/orders/{oid}", headers=admin_headers)
        assert d.status_code == 200
        assert d.json().get("deleted") is True

        # Verify gone
        g = requests.get(f"{BASE_URL}/api/admin/orders/{oid}", headers=admin_headers)
        assert g.status_code == 404


# ---------- Regression ----------
class TestRegression:
    def test_nerviphos_bm_seeded_scheme(self):
        r = requests.get(f"{BASE_URL}/api/products/nerviphos-bm")
        p = r.json()
        v = next(x for x in p["variants"] if x.get("sku") == "NBM-100")
        vid = v["id"]
        rc = requests.post(f"{BASE_URL}/api/cart/calculate",
                           json={"items": [{"variant_id": vid, "qty": 10}]})
        assert rc.status_code == 200
        line = rc.json()["items"][0]
        assert line["free_qty"] == 5, f"Regression: expected free_qty=5, got {line['free_qty']}"

    def test_admin_login_still_works(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/products?limit=1", headers=admin_headers)
        assert r.status_code == 200
