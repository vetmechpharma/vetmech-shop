import json
import re
import xml.etree.ElementTree as ET

import pytest


@pytest.fixture(autouse=True)
def public_origin(monkeypatch):
    monkeypatch.setenv("SITE_URL", "https://vetmechpharma.in")


@pytest.mark.asyncio
async def test_product_canonical_copy_and_visible_seo_content(client, database):
    await database.products.insert_one({
        "id": "p1", "active": True, "slug": "real-product", "name": "Real Product", "image": "/corporate/brand.svg",
        "short_description": "<p>Veterinary composition</p>", "variants": [{"pack_size": "100 ml", "mrp": 987654}],
        "seo": {"title": "Real Product Information", "canonical": "https://www.vetmechpharma.in/product/wrong/",
                "seo_content": "Approved additional product information", "faqs": [{"q": "Available pack?", "a": "100 ml"}]},
    })
    result = client.get("/api/seo/render", params={"path": "/products/real-product?campaign=test"})
    assert result.status_code == 200
    assert '<title>Real Product Information | VETMECH</title>' in result.text
    assert 'rel="canonical" href="https://vetmechpharma.in/products/real-product"' in result.text
    assert "/product/wrong" not in result.text
    assert "Approved additional product information" in result.text
    assert "Available pack?" in result.text
    assert 'content="https://vetmechpharma.in/corporate/brand.svg"' in result.text
    assert "987654" not in result.text


@pytest.mark.parametrize("path", ["/products/missing", "/categories/missing", "/news/missing", "/unknown"])
def test_missing_landing_pages_are_real_404s(client, path):
    result = client.get("/api/seo/render", params={"path": path})
    assert result.status_code == 404
    assert 'content="noindex, follow"' in result.text
    assert "not found" in result.text


@pytest.mark.parametrize("path", ["/shop", "/shop/products/real-product", "/account", "/register", "/cart"])
def test_ordering_routes_do_not_become_duplicate_search_pages(client, path):
    result = client.get("/api/seo/render", params={"path": path})
    assert result.status_code == 200
    assert 'content="noindex, follow"' in result.text
    if path.startswith("/shop/products/"):
        assert 'rel="canonical" href="https://vetmechpharma.in/products/real-product"' in result.text


@pytest.mark.asyncio
async def test_cms_and_blog_have_their_own_headings_and_titles(client, database):
    await database.pages.insert_one({"slug": "about", "title": "Our Company", "content": "Company information",
                                    "seo": {"title": "About VETMECH Pharmaceuticals"}})
    await database.news.insert_one({"id": "n1", "slug": "animal-health-update", "active": True,
                                   "title": "Animal Health Update", "content": "Article body",
                                   "seo": {"canonical": "https://vetmechpharma.in/"}})
    cms = client.get("/api/seo/render", params={"path": "/about"})
    article = client.get("/api/seo/render", params={"path": "/news/animal-health-update"})
    assert "<title>About VETMECH Pharmaceuticals</title>" in cms.text
    assert "<h1>Our Company</h1>" in cms.text
    assert "Company information" in cms.text
    assert "<title>Animal Health Update | VETMECH</title>" in article.text
    assert 'rel="canonical" href="https://vetmechpharma.in/news/animal-health-update"' in article.text


@pytest.mark.asyncio
async def test_sitemap_omits_noindex_and_inactive_records_and_has_real_xml(client, database):
    for collection in [database.products, database.categories, database.news]:
        await collection.insert_many([
            {"id": "yes", "slug": "public-record", "active": True, "name": "Public", "title": "Public"},
            {"id": "hidden", "slug": "hidden-record", "active": True, "seo": {"robots": "NOINDEX, follow"}},
            {"id": "off", "slug": "inactive-record", "active": False},
        ])
    await database.pages.insert_one({"slug": "about", "seo": {"robots": "noindex"}})
    for path in ["/sitemap.xml", "/api/sitemap.xml"]:
        result = client.get(path)
        assert result.headers["content-type"].startswith("application/xml")
        xml = ET.fromstring(result.text)
        urls = [element.text for element in xml.findall("{*}url/{*}loc")]
        assert "https://vetmechpharma.in/products/public-record" in urls
        assert "https://vetmechpharma.in/categories/public-record" in urls
        assert "https://vetmechpharma.in/news/public-record" in urls
        assert "https://vetmechpharma.in/about" not in urls
        assert not any("hidden-record" in url or "inactive-record" in url or "/shop" in url for url in urls)
    robots = client.get("/robots.txt")
    assert robots.headers["content-type"].startswith("text/plain")
    assert "Sitemap: https://vetmechpharma.in/sitemap.xml" in robots.text


@pytest.mark.asyncio
async def test_jsonld_cannot_close_its_script_tag(client, database):
    name = "Safe </script><script>alert(1)</script>"
    await database.products.insert_one({"id": "p", "slug": "safe", "active": True, "name": name})
    page = client.get("/api/seo/render", params={"path": "/products/safe"}).text
    scripts = re.findall(r'<script type="application/ld\+json">(.*?)</script>', page)
    product = next(json.loads(value) for value in scripts if json.loads(value).get("@type") == "Product")
    assert product["name"] == name
    assert "<script>alert(1)</script>" not in page


@pytest.mark.asyncio
async def test_audit_flags_copied_canonical_and_mismatched_product_titles(client, database):
    from routers.seo import seo_audit

    await database.products.insert_one({"id": "p", "slug": "current-product", "active": True,
                                       "name": "CurrentBrand Powder", "seo": {"title": "OldBrand Powder",
                                       "canonical": "https://www.vetmechpharma.in/product/current-product/", "robots": "noindex"}})
    audit = await seo_audit(admin={})
    issues = audit["products"][0]["issues"]
    assert any("Saved canonical differs" in issue for issue in issues)
    assert any("current product name" in issue for issue in issues)
    assert any("noindex directive" in issue for issue in issues)
    assert 0 <= audit["products"][0]["score"] <= 100
    stored = await database.products.find_one({"id": "p"})
    assert stored["seo"]["title"] == "OldBrand Powder"  # Audit never rewrites approved content.
