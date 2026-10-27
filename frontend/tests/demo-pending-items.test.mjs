import test from "node:test";
import assert from "node:assert/strict";
import {createDemoEngine} from "../src/demo/engine.mjs";
import {pendingCartMeta,checkoutPendingIds,pendingRequestId} from "../src/lib/pendingItems.mjs";
const setup=()=>{const m=new Map(),engine=createDemoEngine({getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)});return{engine,call:(method,path,body,token="demo-admin")=>engine.handle({method,path,body,token})};};
const lines=[{variant_id:"v1",qty:3,out_of_stock:true},{variant_id:"v2",qty:4,out_of_stock:true}];
const flag=(call,id="o1",items=lines,notify=true)=>call("PUT",`/admin/orders/${id}`,{items,notify_out_of_stock:notify});
const own=call=>call("GET","/pending-items/mine",undefined,"demo-customer:c1");
const checkout=(call,ids,qty,token="demo-customer:c1",mobile="0000000001")=>call("POST","/orders",{mobile,accept_terms:true,address:{line1:"Demo Clinic",district:"Tirupur",state:"Tamil Nadu",pincode:"638751"},items:[{variant_id:"v1",qty}],pending_item_ids:ids},token);

test("order-specific flags create a stable follow-up list and one message with all products and quantities",async()=>{
  const{call,engine}=setup(),before=engine.snapshot().products;
  await flag(call);await flag(call);
  const notices=engine.snapshot().notification_logs.filter(n=>n.kind==="items_out_of_stock");
  assert.equal(notices.length,1);for(const text of["NERVIPHOS-BM","NERVIPHOS-M","Qty 3","Qty 4","notify you once"])assert.ok(notices[0].message.includes(text),text);
  assert.equal((await own(call)).items.length,2);assert.equal((await call("GET","/pending-items/mine",undefined,"demo-customer:c2")).total,0);
  assert.deepEqual(engine.snapshot().products,before);
  assert.equal((await call("GET","/admin/orders/o1")).total_dispatch,0);
});

test("stock received groups multiple products into one message per customer and retries do not send twice",async()=>{
  const{call,engine}=setup();await flag(call,"o1",lines,false);await flag(call,"o2",[{variant_id:"v1",qty:2,out_of_stock:true}],false);
  const preview=await call("POST","/admin/pending-items/availability-preview",{variant_ids:["v1","v2"]});
  assert.equal(preview.customers,2);const first=preview.messages.find(m=>m.customer_id==="c1");assert.ok(first.message.includes("Qty 3")&&first.message.includes("Qty 4"));assert.ok(!first.message.includes("processing them for dispatch"));
  const body={item_ids:preview.item_ids,request_id:pendingRequestId()};const result=await call("POST","/admin/pending-items/notify-available",body);assert.equal(result.simulated,2);assert.equal(result.sent,0);
  assert.deepEqual(await call("POST","/admin/pending-items/notify-available",body),result);
  assert.equal(engine.snapshot().notification_logs.filter(n=>n.kind==="pending_items_available").length,2);
  assert.ok((await own(call)).items.every(row=>row.state==="available"));
  assert.equal((await call("POST","/admin/pending-items/availability-preview",{variant_ids:["v1"]})).customers,0);
});

test("checkout supports partial missed-item reorders at current rates and cancellation restores the remaining request",async()=>{
  const{call}=setup();await flag(call,"o1",[lines[0]],false);const pid=(await own(call)).items[0].id;
  await call("PUT","/admin/pricing/product/p1",{prices:[{variant_id:"v1",category:"doctor",rate:80}]});
  const order=await checkout(call,[pid],2);assert.equal(order.items[0].unit_price,80);assert.equal((await own(call)).items[0].remaining_qty,1);
  const second=await checkout(call,[pid],1);assert.equal((await own(call)).total,0);
  await call("PATCH",`/admin/orders/${second.id}/status`,{status:"cancelled"});assert.equal((await own(call)).items[0].remaining_qty,1);
});

test("cross-customer access is rejected and unchecking the original flag resolves follow-up without global stock updates",async()=>{
  const{call,engine}=setup();await flag(call,"o1",[lines[0]],false);const pid=(await own(call)).items[0].id;
  await assert.rejects(checkout(call,[pid],3,"demo-customer:c2","0000000002"),e=>e.status===409);
  await assert.rejects(call("GET","/pending-items/mine",undefined,""),e=>e.status===401);
  await assert.rejects(call("GET","/admin/pending-items",undefined,"demo-customer:c1"),e=>e.status===401);
  await assert.rejects(call("DELETE","/admin/orders/o1"),e=>e.status===409);
  await flag(call,"o1",[{...lines[0],out_of_stock:false}],false);assert.equal((await own(call)).total,0);
  assert.equal(engine.snapshot().orders.find(o=>o.id==="o1").pending_items[0].state,"resolved");
});

test("pending references merge safely in the cart and checkout includes only the current customer",()=>{
  assert.deepEqual(pendingCartMeta({pending_customer_id:"a",pending_item_ids:["one"]},{pending_customer_id:"a",pending_item_ids:["two"]}).pending_item_ids,["one","two"]);
  assert.deepEqual(pendingCartMeta({pending_customer_id:"b",pending_item_ids:["other"]},{pending_customer_id:"a",pending_item_ids:["one"]}).pending_item_ids,["one"]);
  assert.deepEqual(checkoutPendingIds([{qty:1,pending_customer_id:"a",pending_item_ids:["one"]},{qty:1,pending_customer_id:"b",pending_item_ids:["other"]}],"a"),["one"]);
  assert.match(pendingRequestId(),/^[a-f0-9-]{36}$/);
});
