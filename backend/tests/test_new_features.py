"""Tests for the new feature batch:
- WebP upload conversion
- Backup endpoints (super_admin only)
- Variant units_per_case (persist + cart line)
- Homepage featured_product_ids + /products/by-ids
"""
import io
import json
import os
import zipfile

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "vetmechpharma@gmail.com"
ADMIN_PASSWORD = "Admin@123"
STAFF_EMAIL = "arun@vetmech.com"
STAFF_PASSWORD = "Vetmech@123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def staff_token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login",
                      json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Staff login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def staff_h(staff_token):
    return {"Authorization": f"Bearer {staff_token}"}


# ---------- WebP upload ----------
class TestUploadWebP:
    def _png_bytes(self, size=(200, 150), color=(255, 0, 0)):
        img = Image.new("RGB", size, color)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def test_png_becomes_webp(self, admin_h):
        files = {"file": ("test.png", self._png_bytes(), "image/png")}
        r = requests.post(f"{BASE_URL}/api/admin/upload", headers=admin_h, files=files)
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        assert url.endswith(".webp"), f"Expected .webp url, got {url}"
        # GET the URL and verify content-type
        r2 = requests.get(f"{BASE_URL}{url}")
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/webp")

    def test_jpeg_becomes_webp(self, admin_h):
        img = Image.new("RGB", (300, 200), (0, 128, 255))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        files = {"file": ("photo.jpg", buf.getvalue(), "image/jpeg")}
        r = requests.post(f"{BASE_URL}/api/admin/upload", headers=admin_h, files=files)
        assert r.status_code == 200
        assert r.json()["url"].endswith(".webp")

    def test_pdf_kept_as_pdf(self, admin_h):
        # minimal fake pdf bytes
        data = b"%PDF-1.4\n%EOF\n"
        files = {"file": ("doc.pdf", data, "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/admin/upload", headers=admin_h, files=files)
        assert r.status_code == 200
        url = r.json()["url"]
        assert url.endswith(".pdf"), f"PDF should not be converted: {url}"

    def test_upload_requires_auth(self):
        files = {"file": ("test.png", self._png_bytes(), "image/png")}
        r = requests.post(f"{BASE_URL}/api/admin/upload", files=files)
        assert r.status_code in (401, 403)


# ---------- Backup endpoints ----------
class TestBackup:
    def test_backup_stats_super_admin(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/backup/stats", headers=admin_h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "total_records" in data
        assert "image_count" in data
        assert "image_size_mb" in data
        assert isinstance(data["total_records"], int)
        assert data["total_records"] > 0

    def test_backup_database_super_admin(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/backup/database", headers=admin_h)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/json")
        assert "attachment" in r.headers.get("content-disposition", "")
        body = json.loads(r.content)
        assert "data" in body
        assert "products" in body["data"]
        assert "orders" in body["data"]
        assert "tickets" in body["data"]

    def test_backup_images_super_admin(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/backup/images", headers=admin_h)
        assert r.status_code == 200
        assert r.headers.get("content-type") == "application/zip"
        # verify it is a valid zip
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        assert isinstance(zf.namelist(), list)

    def test_backup_stats_forbidden_for_staff(self, staff_h):
        r = requests.get(f"{BASE_URL}/api/admin/backup/stats", headers=staff_h)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_backup_database_forbidden_for_staff(self, staff_h):
        r = requests.get(f"{BASE_URL}/api/admin/backup/database", headers=staff_h)
        assert r.status_code == 403

    def test_backup_images_forbidden_for_staff(self, staff_h):
        r = requests.get(f"{BASE_URL}/api/admin/backup/images", headers=staff_h)
        assert r.status_code == 403

    def test_backup_unauth(self):
        assert requests.get(f"{BASE_URL}/api/admin/backup/stats").status_code in (401, 403)


# ---------- Variant units_per_case ----------
class TestUnitsPerCase:
    @pytest.fixture(scope="class")
    def target_product(self, admin_h):
        # find vetkclor or fall back to any product
        r = requests.get(f"{BASE_URL}/api/admin/products?limit=50", headers=admin_h)
        assert r.status_code == 200
        items = r.json()["items"]
        p = next((x for x in items if x.get("slug") == "vetkclor"), None) or items[0]
        return p

    def test_persist_units_per_case(self, admin_h, target_product):
        pid = target_product["id"]
        # Get full product
        r = requests.get(f"{BASE_URL}/api/admin/products/{pid}", headers=admin_h)
        assert r.status_code == 200
        prod = r.json()
        variants = prod.get("variants") or []
        assert variants, "product has no variants"
        for v in variants:
            v["units_per_case"] = 12
        prod["variants"] = variants
        # Strip immutable-looking keys not needed for update
        payload = {k: v for k, v in prod.items() if k != "_id"}
        r2 = requests.put(f"{BASE_URL}/api/admin/products/{pid}", headers=admin_h, json=payload)
        assert r2.status_code in (200, 204), r2.text
        # Verify persistence
        r3 = requests.get(f"{BASE_URL}/api/admin/products/{pid}", headers=admin_h)
        assert r3.status_code == 200
        got = r3.json()
        for v in got.get("variants", []):
            assert v.get("units_per_case") == 12

        # Now cart calculate should include units_per_case
        vid = got["variants"][0]["id"]
        rc = requests.post(f"{BASE_URL}/api/cart/calculate",
                           json={"items": [{"variant_id": vid, "qty": 2}]})
        assert rc.status_code == 200, rc.text
        lines = rc.json()["items"]
        assert lines and lines[0]["units_per_case"] == 12


# ---------- Homepage featured + by-ids ----------
class TestHomepageFeatured:
    @pytest.fixture(scope="class")
    def two_product_ids(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/products?limit=5", headers=admin_h)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 2
        return [items[0]["id"], items[1]["id"]]

    def test_put_homepage_settings(self, admin_h, two_product_ids):
        # First get current settings so we don't clobber other fields
        r_get = requests.get(f"{BASE_URL}/api/settings/homepage")
        current = r_get.json() if r_get.status_code == 200 else {}
        body = {**(current or {}), "featured_product_ids": two_product_ids}
        r = requests.put(f"{BASE_URL}/api/admin/settings/homepage",
                         headers=admin_h, json=body)
        assert r.status_code in (200, 204), r.text
        # public GET reflects
        r2 = requests.get(f"{BASE_URL}/api/settings/homepage")
        assert r2.status_code == 200
        assert r2.json().get("featured_product_ids") == two_product_ids

    def test_products_by_ids(self, two_product_ids):
        ids = ",".join(two_product_ids)
        r = requests.get(f"{BASE_URL}/api/products/by-ids", params={"ids": ids})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 2
        returned_ids = [p["id"] for p in data]
        assert set(returned_ids) == set(two_product_ids)
        # enriched with variants
        for p in data:
            assert "variants" in p


# ---------- Regression: scheme 10+5 ----------
class TestSchemeRegression:
    def test_nerviphos_bm_100ml_qty10(self):
        # Find the variant
        r = requests.get(f"{BASE_URL}/api/products/nerviphos-bm")
        assert r.status_code == 200, r.text
        p = r.json()
        v = next((x for x in p["variants"] if x.get("sku") == "NBM-100"),
                 p["variants"][0])
        rc = requests.post(f"{BASE_URL}/api/cart/calculate",
                           json={"items": [{"variant_id": v["id"], "qty": 10}]})
        assert rc.status_code == 200
        line = rc.json()["items"][0]
        assert line["free_qty"] == 5, f"Expected 10+5, got free_qty={line['free_qty']}"
