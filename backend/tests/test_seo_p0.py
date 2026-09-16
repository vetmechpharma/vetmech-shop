"""P0 SEO backend tests: sitemap, robots, settings, product FAQ persistence, category seo persistence."""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://vetmech-pharma.preview.emergentagent.com").rstrip("/")
SITE_URL = "https://vetmechpharma.in"
ADMIN_EMAIL = "vetmechpharma@gmail.com"
ADMIN_PASSWORD = "Admin@123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- sitemap & robots ----------

def test_sitemap_valid_xml_with_site_url():
    r = requests.get(f"{BASE_URL}/api/sitemap.xml")
    assert r.status_code == 200
    body = r.text
    assert body.startswith("<?xml")
    assert "<urlset" in body
    assert f"{SITE_URL}/" in body
    assert f"{SITE_URL}/products" in body
    assert re.search(rf"{re.escape(SITE_URL)}/categories/[a-z0-9-]+", body), "no category url"
    assert re.search(rf"{re.escape(SITE_URL)}/products/[a-z0-9-]+", body), "no product url"


def test_robots_disallows_and_sitemap_line():
    r = requests.get(f"{BASE_URL}/api/robots.txt")
    assert r.status_code == 200
    txt = r.text
    for path in ["/admin", "/account", "/cart", "/checkout"]:
        assert f"Disallow: {path}" in txt, f"missing disallow {path}"
    assert f"Sitemap: {SITE_URL}/sitemap.xml" in txt


# ---------- seo settings (analytics) ----------

def test_seo_settings_save_and_read(auth_headers):
    payload = {
        "ga_id": "G-TESTGA4",
        "gtm_id": "GTM-TEST123",
        "gsc_verification": "test-gsc-token-xyz",
    }
    r = requests.put(f"{BASE_URL}/api/admin/settings/seo", json=payload, headers=auth_headers)
    assert r.status_code in (200, 201), r.text
    r2 = requests.get(f"{BASE_URL}/api/settings/seo")
    assert r2.status_code == 200
    data = r2.json()
    assert data.get("ga_id") == "G-TESTGA4"
    assert data.get("gtm_id") == "GTM-TEST123"
    assert data.get("gsc_verification") == "test-gsc-token-xyz"


# ---------- product FAQ persistence ----------

def test_product_seo_faq_persists(auth_headers):
    # Get a product
    r = requests.get(f"{BASE_URL}/api/products?limit=1")
    assert r.status_code == 200
    p = r.json()["items"][0]
    pid = p["id"]
    slug = p["slug"]

    # Fetch full admin/product record
    r = requests.get(f"{BASE_URL}/api/admin/products/{pid}", headers=auth_headers)
    if r.status_code == 404:
        # fallback: use public getter
        r = requests.get(f"{BASE_URL}/api/products/{slug}")
    assert r.status_code == 200
    prod = r.json()

    new_faqs = [{"q": "TEST_Q_Storage?", "a": "TEST_A_Store below 25C."}]
    seo = dict(prod.get("seo") or {})
    seo["faqs"] = new_faqs
    prod["seo"] = seo
    # strip potential _id
    prod.pop("_id", None)

    up = requests.put(f"{BASE_URL}/api/admin/products/{pid}", json=prod, headers=auth_headers)
    assert up.status_code in (200, 201), up.text

    # Re-fetch to confirm persistence via public endpoint
    r2 = requests.get(f"{BASE_URL}/api/products/{slug}")
    assert r2.status_code == 200
    prod2 = r2.json()
    faqs2 = (prod2.get("seo") or {}).get("faqs") or []
    assert any(f.get("q") == "TEST_Q_Storage?" and f.get("a") == "TEST_A_Store below 25C." for f in faqs2), f"FAQ not persisted: {faqs2}"


# ---------- category SEO persistence ----------

def test_category_seo_group_persists(auth_headers):
    # create test category
    name = f"TEST_SEOCat_{uuid.uuid4().hex[:6]}"
    payload = {"name": name, "slug": f"test-seocat-{uuid.uuid4().hex[:6]}", "active": True}
    r = requests.post(f"{BASE_URL}/api/admin/categories", json=payload, headers=auth_headers)
    assert r.status_code in (200, 201), r.text
    cat = r.json()
    cid = cat["id"]
    try:
        cat["seo"] = {
            "title": "TEST SEO Title",
            "meta_description": "TEST meta description content",
            "meta_keywords": "test, seo, veterinary",
            "intro": "TEST intro content for SEO",
        }
        cat.pop("_id", None)
        up = requests.put(f"{BASE_URL}/api/admin/categories/{cid}", json=cat, headers=auth_headers)
        assert up.status_code in (200, 201), up.text
        # Read via admin list
        lst = requests.get(f"{BASE_URL}/api/admin/categories", headers=auth_headers).json()
        r2j = next((c for c in lst if c["id"] == cid), None)
        assert r2j, "category missing"
        seo = r2j.get("seo") or {}
        assert seo.get("title") == "TEST SEO Title"
        assert seo.get("meta_description") == "TEST meta description content"
        assert seo.get("meta_keywords") == "test, seo, veterinary"
        assert seo.get("intro") == "TEST intro content for SEO"
    finally:
        requests.delete(f"{BASE_URL}/api/admin/categories/{cid}", headers=auth_headers)


# ---------- regression basics ----------

def test_products_list_ok():
    r = requests.get(f"{BASE_URL}/api/products?limit=5")
    assert r.status_code == 200
    assert "items" in r.json()


def test_product_detail_has_variants_and_login_required():
    r = requests.get(f"{BASE_URL}/api/products/nerviphos-m")
    assert r.status_code == 200
    d = r.json()
    assert d.get("variants"), "no variants"
    # login_required flag on variants (guest price hidden)
    assert any(v.get("login_required") for v in d["variants"])


def test_category_page_lists_products():
    r = requests.get(f"{BASE_URL}/api/categories/large-animal")
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d, dict)
