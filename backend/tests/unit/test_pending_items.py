from copy import deepcopy
from uuid import uuid4
import pytest
from security import create_token
from pending_items import backfill_pending_items

ADMIN={"Authorization":"Bearer "+create_token("owner","admin")}
ALICE={"Authorization":"Bearer "+create_token("alice","customer")}
BOB={"Authorization":"Bearer "+create_token("bob","customer")}


async def setup(database,monkeypatch):
    from routers import pending_routes,orders
    await database.admin_users.insert_many([{"id":"owner","role":"super_admin","name":"Owner","active":True},{"id":"catalog","role":"product_manager","active":True}])
    await database.customers.insert_many([{"id":cid,"name":cid.title(),"mobile":phone,"status":"active","category":"doctor","default_address":{"line1":"Clinic","district":"Tirupur","state":"Tamil Nadu","pincode":"638751"}} for cid,phone in [("alice","9000000001"),("bob","9000000002")]])
    await database.products.insert_many([{"id":pid,"name":name,"slug":pid,"active":True,"variants":[{"id":vid,"pack_size":pack,"unit":"Bottle","mrp":200,"selling_price":100,"stock_status":"out_of_stock" if vid=="v1" else "in_stock"}]} for pid,vid,name,pack in [("p1","v1","Product Alpha","100 ml"),("p2","v2","Product Beta","500 ml")]])
    await database.orders.insert_many([{"id":oid,"order_number":oid.upper(),"customer_id":cid,"customer_name":cid.title(),"customer_mobile":"9000000001" if cid=="alice" else "9000000002","status":"new","activity":[],"items":[],"updated_at":"2026-10-01T00:00:00Z"} for oid,cid in [("o1","alice"),("o2","alice"),("o3","bob")]])
    sent=[]
    async def send(db,to,message,kind="generic"):
        sent.append({"to":to,"message":message,"kind":kind})
        return {"id":str(uuid4()),"status":"sent"}
    async def geo(ip):return ""
    monkeypatch.setattr(pending_routes,"send_whatsapp",send)
    monkeypatch.setattr(orders,"_geo_from_ip",geo)
    return sent


def flag(client,oid="o1",lines=None,notify=True):
    response=client.put(f"/api/admin/orders/{oid}",headers=ADMIN,json={"items":lines or [{"variant_id":"v1","qty":3,"rate":100,"out_of_stock":True},{"variant_id":"v2","qty":4,"rate":100,"out_of_stock":True}],"notify_out_of_stock":notify})
    assert response.status_code==200,response.text
    return response.json()


def pending(client,headers=ALICE):
    response=client.get("/api/pending-items/mine",headers=headers)
    assert response.status_code==200,response.text
    return response.json()["items"]


def checkout(client,ids,qty=3,headers=ALICE,mobile="9000000001"):
    return client.post("/api/orders",headers=headers,json={"items":[{"variant_id":"v1","qty":qty}],"pending_item_ids":ids,"mobile":mobile,"address":{"line1":"Clinic","district":"Tirupur","state":"Tamil Nadu","pincode":"638751"},"accept_terms":True})


@pytest.mark.asyncio
async def test_flagging_saves_customer_pending_items_and_one_quantity_message_without_changing_catalogue(client,database,monkeypatch):
    sent=await setup(database,monkeypatch)
    original=deepcopy(await database.products.find({}, {"_id":0}).to_list(10))
    result=flag(client)
    assert len(result["pending_items"])==2
    assert result["total_dispatch"]==0
    assert len(sent)==1 and sent[0]["kind"]=="items_out_of_stock"
    assert all(text in sent[0]["message"] for text in ["Product Alpha","100 ml","Qty 3","Product Beta","Qty 4","notify you once"])
    flag(client)
    assert len(sent)==1
    assert len(pending(client))==2 and pending(client,BOB)==[]
    assert await database.products.find({}, {"_id":0}).to_list(10)==original
    assert all(row["state"]=="waiting" for row in pending(client))


@pytest.mark.asyncio
async def test_notification_groups_all_selected_products_and_orders_into_one_message_per_customer(client,database,monkeypatch):
    sent=await setup(database,monkeypatch)
    flag(client,notify=False)
    flag(client,"o2",[{"variant_id":"v1","qty":5,"rate":100,"out_of_stock":True}],notify=False)
    flag(client,"o3",[{"variant_id":"v1","qty":2,"rate":100,"out_of_stock":True}],notify=False)
    preview=client.post("/api/admin/pending-items/availability-preview",headers=ADMIN,json={"variant_ids":["v1","v2"]}).json()
    assert preview["customers"]==2
    alice=next(row for row in preview["messages"] if row["customer_id"]=="alice")
    assert all(text in alice["message"] for text in ["Product Alpha","Qty 8","Product Beta","Qty 4","O1","O2"])
    assert "processing them for dispatch" not in alice["message"]
    body={"item_ids":preview["item_ids"],"request_id":str(uuid4())}
    response=client.post("/api/admin/pending-items/notify-available",headers=ADMIN,json=body)
    assert response.status_code==200,response.text
    assert response.json()["sent"]==2 and len(sent)==2
    assert all(row["state"]=="available" and row["availability_notice_status"]=="sent" for row in pending(client))
    retry=client.post("/api/admin/pending-items/notify-available",headers=ADMIN,json=body)
    assert retry.json()==response.json() and len(sent)==2
    assert client.post("/api/admin/pending-items/availability-preview",headers=ADMIN,json={"variant_ids":["v1"]}).json()["customers"]==0
    assert (await database.products.find_one({"id":"p1"}))["variants"][0]["stock_status"]=="out_of_stock"


@pytest.mark.asyncio
async def test_failed_notification_remains_retryable_and_never_claims_delivery(client,database,monkeypatch):
    from routers import pending_routes
    await setup(database,monkeypatch)
    flag(client,lines=[{"variant_id":"v1","qty":3,"rate":100,"out_of_stock":True}],notify=False)
    async def fail(*args,**kwargs):return {"status":"failed"}
    monkeypatch.setattr(pending_routes,"send_whatsapp",fail)
    body={"variant_ids":["v1"],"request_id":str(uuid4())}
    result=client.post("/api/admin/pending-items/notify-available",headers=ADMIN,json=body)
    assert result.status_code==200,result.text
    assert result.json()["failed"]==1 and result.json()["sent"]==0
    row=pending(client)[0]
    assert row["state"]=="available" and row["availability_notice_status"]=="failed"
    assert client.post("/api/admin/pending-items/availability-preview",headers=ADMIN,json={"variant_ids":["v1"]}).json()["customers"]==1


@pytest.mark.asyncio
async def test_checkout_reorders_partial_missed_quantities_at_current_prices_without_stock_block(client,database,monkeypatch):
    await setup(database,monkeypatch)
    flag(client,lines=[{"variant_id":"v1","qty":3,"rate":100,"out_of_stock":True}],notify=False)
    pid=pending(client)[0]["id"]
    await database.category_prices.insert_one({"variant_id":"v1","category":"doctor","rate":80,"active":True})
    response=checkout(client,[pid],qty=2)
    assert response.status_code==200,response.text
    order=response.json()
    assert order["items"][0]["unit_price"]==80
    assert order["pending_reorders"]==[{"pending_id":pid,"variant_id":"v1","qty":2}]
    assert pending(client)[0]["remaining_qty"]==1
    response=checkout(client,[pid],qty=1)
    assert response.status_code==200,response.text
    assert pending(client)==[]
    # Cancelling the later reorder restores only its unmet demand.
    await database.orders.update_one({"id":response.json()["id"]},{"$set":{"status":"cancelled"}})
    assert pending(client)[0]["remaining_qty"]==1


@pytest.mark.asyncio
async def test_customer_cannot_use_another_customers_pending_id_or_remove_pending_history(client,database,monkeypatch):
    sent=await setup(database,monkeypatch)
    flag(client,lines=[{"variant_id":"v1","qty":3,"rate":100,"out_of_stock":True}],notify=False)
    pid=pending(client)[0]["id"]
    assert checkout(client,[pid],headers=BOB,mobile="9000000002").status_code==409
    assert client.delete("/api/admin/orders/o1",headers=ADMIN).status_code==409
    assert len(sent)==0
    flag(client,lines=[{"variant_id":"v1","qty":3,"rate":100,"out_of_stock":False}],notify=False)
    assert pending(client)==[]
    assert (await database.orders.find_one({"id":"o1"}))["pending_items"][0]["state"]=="resolved"


@pytest.mark.asyncio
async def test_invalid_order_edit_does_not_send_messages_or_create_pending_entries(client,database,monkeypatch):
    sent=await setup(database,monkeypatch)
    response=client.put("/api/admin/orders/o1",headers=ADMIN,json={"items":[{"variant_id":"missing","qty":3,"out_of_stock":True}],"notify_out_of_stock":True})
    assert response.status_code==400 and not sent
    assert pending(client)==[]


@pytest.mark.asyncio
async def test_pending_endpoints_require_order_permissions_and_scope_customer_identity(client,database,monkeypatch):
    await setup(database,monkeypatch)
    assert client.get("/api/pending-items/mine").status_code==401
    assert client.get("/api/admin/pending-items",headers=ALICE).status_code in [401,403]
    catalog={"Authorization":"Bearer "+create_token("catalog","admin")}
    assert client.get("/api/admin/pending-items",headers=catalog).status_code==403
    assert client.post("/api/admin/pending-items/notify-available",headers=catalog,json={"variant_ids":["v1"],"request_id":str(uuid4())}).status_code==403


@pytest.mark.asyncio
async def test_legacy_explicit_order_flags_backfill_without_notifications_or_catalogue_changes(client,database,monkeypatch):
    sent=await setup(database,monkeypatch)
    await database.orders.update_one({"id":"o1"},{"$set":{"items":[{"variant_id":"v1","product_id":"p1","product_name":"Product Alpha","pack_size":"100 ml","qty":7,"out_of_stock":True}]}})
    await backfill_pending_items(database)
    first=pending(client)
    await backfill_pending_items(database)
    assert pending(client)==first and first[0]["remaining_qty"]==7
    assert not sent
