import pytest
from fastapi import HTTPException
from pricing_engine import price_line


CUSTOMER = {"id": "doctor", "category": "doctor", "status": "active"}
PRODUCT = {"id": "product", "name": "Rate-managed product"}
VARIANT = {"id": "pack", "pack_size": "100 ml", "mrp": 500}


@pytest.mark.asyncio
@pytest.mark.parametrize("customer_rate,expected,source", [(None, 300, "category"), (250, 250, "customer_specific")])
async def test_separate_rates_apply_without_variant_sku_or_selling_price(database, customer_rate, expected, source):
    await database.category_prices.insert_one({"variant_id": "pack", "category": "doctor", "active": True, "rate": 300})
    if customer_rate is not None:
        await database.customer_prices.insert_one({"variant_id": "pack", "customer_id": "doctor", "active": True, "rate": customer_rate})
    line = await price_line(database, PRODUCT, VARIANT, 2, CUSTOMER, settings={})
    assert line["unit_price"] == expected
    assert line["price_source"] == source
    assert line["net_rate"] == expected


@pytest.mark.asyncio
async def test_a_pack_without_an_assigned_rate_cannot_be_ordered_as_zero(database):
    with pytest.raises(HTTPException) as error:
        await price_line(database, PRODUCT, VARIANT, 2, CUSTOMER, settings={})
    assert error.value.status_code == 400
    assert "rate has not been assigned" in error.value.detail


@pytest.mark.asyncio
async def test_an_explicit_price_offer_can_price_a_pack_without_a_base_rate(database):
    await database.schemes.insert_one({"id": "free", "variant_id": "pack", "active": True, "scheme_type": "free_qty", "buy_quantity": 1, "free_quantity": 1})
    await database.schemes.insert_one({"id": "price", "variant_id": "pack", "active": True, "scheme_type": "special_price", "special_price": 220, "min_quantity": 2})
    line = await price_line(database, PRODUCT, VARIANT, 2, CUSTOMER, settings={})
    assert line["unit_price"] == 220
    assert line["scheme_id"] == "price"
    assert line["free_qty"] == 0
