import pytest
from envelope_samples import add_envelope_samples, SAMPLE_MOBILE, CUSTOMER_ID, READY_ID, PAID_ID
from helpers import send_whatsapp
from manage import parser

@pytest.mark.asyncio
async def test_preview_and_repeat_apply_preserve_business_and_sample_edits(database):
    await database.orders.insert_one({"id":"real-order", "value":123})
    assert (await add_envelope_samples(database))["status"] == "preview"
    assert await database.customers.count_documents({}) == 0
    first=await add_envelope_samples(database, True)
    assert len(first["created"]) == 3
    ready=await database.orders.find_one({"id":READY_ID})
    assert ready["total_qty"] == sum(i["qty"] for i in ready["items"]) == 72
    assert ready["sales_value"] == sum(i["qty"]*i["unit_price"] for i in ready["items"])
    assert ready["dispatch_preparation"]["cases"] == 3
    assert ready["address"]["main_area"] == "Koduvai"
    paid=await database.orders.find_one({"id":PAID_ID})
    assert paid["dispatch"]["freight"] == "paid"
    assert "invoice" not in paid
    await database.customers.update_one({"id":CUSTOMER_ID},{"$set":{"name":"Keep edited sample"}})
    assert (await add_envelope_samples(database,True))["created"] == []
    assert (await database.customers.find_one({"id":CUSTOMER_ID}))["name"] == "Keep edited sample"
    assert (await database.orders.find_one({"id":"real-order"}))["value"] == 123
    for collection in ["products","ledger_entries","notification_logs","counters","transports"]:
        assert await database[collection].count_documents({}) == 0

@pytest.mark.asyncio
async def test_collision_preflight_prevents_partial_insert(database):
    await database.orders.insert_one({"id":PAID_ID,"customer_name":"Real customer"})
    with pytest.raises(ValueError,match="non-sample"):
        await add_envelope_samples(database,True)
    assert await database.customers.count_documents({}) == 0
    assert await database.orders.count_documents({}) == 1

@pytest.mark.asyncio
async def test_reserved_sample_number_never_accesses_gateway_or_database():
    class NoDatabase:
        def __getattr__(self,name):
            raise AssertionError("Sample notification accessed database/gateway")
    assert (await send_whatsapp(NoDatabase(), SAMPLE_MOBILE,"test"))["simulated"] is True
    assert (await send_whatsapp(NoDatabase(), "+91"+SAMPLE_MOBILE,"test"))["simulated"] is True

def test_maintenance_requires_explicit_apply():
    assert parser().parse_args(["add-envelope-samples"]).apply is False
    assert parser().parse_args(["add-envelope-samples","--apply"]).apply is True
