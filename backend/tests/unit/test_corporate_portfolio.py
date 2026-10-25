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
