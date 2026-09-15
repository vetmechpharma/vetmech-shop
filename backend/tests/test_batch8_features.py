"""Batch 8 new features tests:
- Careers resume upload
- Register license validation
- Reviews (create/list/moderate)
- Per-product SEO data (review_avg/count on product)
- Menu settings save/load + public
- Email templates + SMTP privacy
- Catalog URL setting + public
- Regression: product listing, guest gating
"""
import io
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
ADMIN_EMAIL = "vetmechpharma@gmail.com"
ADMIN_PASS = "Admin@123"
PROD_SLUG = "vetkclor"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/admin/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# -------- Careers resume upload --------
class TestCareersResume:
    def test_upload_pdf_success(self, api):
        files = {"file": ("resume.pdf", io.BytesIO(b"%PDF-1.4 dummy content"), "application/pdf")}
        r = api.post(f"{BASE_URL}/api/careers/upload-resume", files=files)
        assert r.status_code == 200, r.text
        assert "url" in r.json()
        assert r.json()["url"].startswith("/api/uploads/")

    def test_reject_non_pdf(self, api):
        files = {"file": ("resume.txt", io.BytesIO(b"hello"), "text/plain")}
        r = api.post(f"{BASE_URL}/api/careers/upload-resume", files=files)
        assert r.status_code == 400

    def test_reject_oversize(self, api):
        big = b"x" * (2 * 1024 * 1024 + 100)
        files = {"file": ("resume.pdf", io.BytesIO(big), "application/pdf")}
        r = api.post(f"{BASE_URL}/api/careers/upload-resume", files=files)
        assert r.status_code == 400


# -------- Register license validation --------
class TestRegisterLicense:
    def test_missing_license_doctor(self, api):
        payload = {"name": "TEST_Doc", "mobile": "9000000101", "category": "doctor"}
        r = api.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert r.status_code == 400, r.text
        assert "license" in r.text.lower()

    def test_license_required_categories(self, api):
        for cat in ["agency", "medical_shop", "distributor"]:
            payload = {"name": f"TEST_{cat}", "mobile": f"9000000{hash(cat) % 900 + 100:03d}",
                       "category": cat}
            r = api.post(f"{BASE_URL}/api/auth/register", json=payload)
            assert r.status_code == 400, f"{cat} should require license: {r.text}"

    def test_farmer_no_license_ok(self, api):
        import random
        mob = f"9{random.randint(100000000, 999999999)}"
        payload = {"name": "TEST_Farm", "mobile": mob, "category": "farm"}
        r = api.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert r.status_code in (200, 409), r.text  # 409 if duplicate

    def test_doctor_with_license_ok(self, api):
        import random
        mob = f"9{random.randint(100000000, 999999999)}"
        payload = {"name": "TEST_DocOK", "mobile": mob, "category": "doctor",
                   "license_number": "LIC-TEST-123"}
        r = api.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert r.status_code == 200, r.text


# -------- Reviews --------
@pytest.fixture(scope="session")
def product_id(api):
    r = api.get(f"{BASE_URL}/api/products/{PROD_SLUG}")
    assert r.status_code == 200, f"Product {PROD_SLUG} missing: {r.text}"
    return r.json()["id"]


class TestReviews:
    review_id = None

    def test_create_review_pending(self, api, product_id):
        payload = {"product_id": product_id, "name": "TEST Reviewer",
                   "rating": 5, "title": "Great", "comment": "Works well"}
        r = api.post(f"{BASE_URL}/api/reviews", json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("submitted") is True

    def test_public_only_shows_approved(self, api, product_id):
        r = api.get(f"{BASE_URL}/api/reviews", params={"product_id": product_id})
        assert r.status_code == 200
        data = r.json()
        # Pending review should NOT be in items
        for it in data["items"]:
            assert it["status"] == "approved"

    def test_reject_invalid_rating(self, api, product_id):
        r = api.post(f"{BASE_URL}/api/reviews",
                     json={"product_id": product_id, "name": "X", "rating": 0})
        assert r.status_code == 400

    def test_admin_list_and_approve(self, api, admin_headers, product_id):
        r = api.get(f"{BASE_URL}/api/admin/reviews", params={"status": "pending"},
                    headers=admin_headers)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert len(items) > 0, "no pending reviews present"
        # find our review
        target = next((x for x in items if x.get("name") == "TEST Reviewer"), items[0])
        rid = target["id"]
        TestReviews.review_id = rid

        r2 = api.put(f"{BASE_URL}/api/admin/reviews/{rid}",
                     json={"status": "approved"}, headers=admin_headers)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("status") == "approved"

        # Public listing should now include it
        r3 = api.get(f"{BASE_URL}/api/reviews", params={"product_id": product_id})
        assert r3.status_code == 200
        assert r3.json()["count"] >= 1

        # Product endpoint should reflect aggregate
        r4 = api.get(f"{BASE_URL}/api/products/{PROD_SLUG}")
        assert r4.status_code == 200
        pj = r4.json()
        assert pj.get("review_count", 0) >= 1
        assert pj.get("review_avg", 0) >= 1

    def test_admin_cleanup(self, api, admin_headers):
        # delete the test review
        if TestReviews.review_id:
            api.delete(f"{BASE_URL}/api/admin/reviews/{TestReviews.review_id}",
                       headers=admin_headers)


# -------- Menu settings --------
class TestMenu:
    def test_save_menu(self, api, admin_headers):
        payload = {"items": [
            {"label": "Home", "url": "/", "external": False},
            {"label": "News", "url": "/news", "external": False},
            {"label": "External", "url": "https://example.com", "external": True},
        ]}
        r = api.put(f"{BASE_URL}/api/admin/settings/menu",
                    json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text

    def test_get_menu_public(self, api):
        r = api.get(f"{BASE_URL}/api/settings/menu")
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") or []
        assert any(i.get("label") == "External" for i in items)


# -------- Email templates + SMTP privacy --------
class TestEmailTemplatesSmtp:
    def test_email_templates_save(self, api, admin_headers):
        payload = {"welcome": {"subject": "Welcome TEST", "body": "Hi {name}"},
                   "otp": {"subject": "OTP TEST", "body": "Your OTP: {otp}"},
                   "order_received": {"subject": "Received", "body": "Thanks"},
                   "order_status": {"subject": "Status", "body": "Update"}}
        r = api.put(f"{BASE_URL}/api/admin/settings/email_templates",
                    json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text

    def test_email_templates_blocked_public(self, api):
        r = api.get(f"{BASE_URL}/api/settings/email_templates")
        assert r.status_code == 403, f"email_templates public leak: {r.status_code}"

    def test_smtp_blocked_public(self, api):
        r = api.get(f"{BASE_URL}/api/settings/smtp")
        assert r.status_code == 403

    def test_smtp_admin_save_cc(self, api, admin_headers):
        r = api.put(f"{BASE_URL}/api/admin/settings/smtp",
                    json={"cc_admin": True, "from_email": "noreply@test.com"},
                    headers=admin_headers)
        assert r.status_code == 200, r.text


# -------- Catalog --------
class TestCatalog:
    def test_save_catalog_url(self, api, admin_headers):
        r = api.put(f"{BASE_URL}/api/admin/settings/website",
                    json={"catalog_url": "/api/uploads/catalog_test.pdf"},
                    headers=admin_headers)
        assert r.status_code == 200, r.text

    def test_public_catalog_visible(self, api):
        r = api.get(f"{BASE_URL}/api/settings/website")
        assert r.status_code == 200
        assert "catalog" in str(r.json()).lower()


# -------- Regression --------
class TestRegression:
    def test_products_list(self, api):
        r = api.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200
        assert "items" in r.json()

    def test_guest_gating(self, api):
        r = api.get(f"{BASE_URL}/api/products/{PROD_SLUG}")
        assert r.status_code == 200
        # non-logged: no selling_price
        for v in r.json().get("variants", []):
            assert v.get("login_required") is True or v.get("selling_price") is None

    def test_admin_orders(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/orders", headers=admin_headers)
        assert r.status_code == 200
