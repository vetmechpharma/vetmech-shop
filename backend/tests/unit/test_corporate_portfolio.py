import pytest


@pytest.mark.asyncio
async def test_public_product_crawler_page_has_no_mrp_or_offer_prices(client, database):
    await database.products.insert_one({
        "id": "actual-product", "slug": "actual-product", "name": "Actual veterinary product", "active": True,
        "short_description": "Veterinary formulation", "composition": "100 mg/ml", "brand_name": "VETMECH",
        "variants": [{"id": "v1", "pack_size": "100 ml", "mrp": 987654.32, "selling_price": 876543.21}],
    })
    response = client.get("/api/seo/render", params={"path": "/products/actual-product"})
    assert response.status_code == 200
    assert "Actual veterinary product" in response.text
    assert "100 ml" in response.text
    assert "100 mg/ml" in response.text
    for value in ["987654.32", "876543.21", "MRP", '"offers"', '"priceCurrency"']:
        assert value not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("prefix", ["/products/", "/shop/products/"])
async def test_retired_product_fields_are_not_published_from_legacy_records(client, database, prefix):
    await database.products.insert_one({
        "id": "legacy", "slug": "legacy-product", "name": "Legacy product", "active": True,
        "product_code": "LEGACY-CODE-123", "sku": "LEGACY-SKU-123",
        "benefits": "Retired benefit text", "precautions": "Retired precaution text",
        "storage": "Retired storage text", "additional_info": "Retired extra text",
        "composition": "100 mg/ml", "indications": "Saved indication", "dosage": "Saved dosage",
        "variants": [{"id": "legacy-v1", "sku": "LEGACY-VARIANT-123", "pack_size": "100 ml"}],
    })
    response = client.get("/api/seo/render", params={"path": prefix + "legacy-product"})
    assert response.status_code == 200
    for value in ["LEGACY-CODE-123", "LEGACY-SKU-123", "LEGACY-VARIANT-123", '"sku"',
                  "Retired benefit text", "Retired precaution text", "Retired storage text", "Retired extra text",
                  "<h2>Benefits</h2>", "<h2>Precautions</h2>", "<h2>Storage</h2>", "<h2>Additional information</h2>"]:
        assert value not in response.text
    for value in ["100 mg/ml", "100 ml", "Saved indication", "Saved dosage"]:
        assert value in response.text


def test_seo_drafts_do_not_reintroduce_removed_storage_fields(client):
    from routers.seo import generate_seo

    draft = generate_seo({"name": "Product", "composition": "100 mg/ml", "storage": "Retired storage text"})
    assert all("stored" not in faq["q"] and "Retired storage text" not in faq["a"] for faq in draft["faqs"])
    assert any("100 mg/ml" in faq["a"] for faq in draft["faqs"])
