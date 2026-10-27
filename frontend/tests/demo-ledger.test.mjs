import test from "node:test";
import assert from "node:assert/strict";
import {createDemoEngine} from "../src/demo/engine.mjs";
import {amountToPaise,ledgerDateToday} from "../src/lib/ledger.mjs";

const setup=()=>{const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};const engine=createDemoEngine(storage);return{engine,storage,call:(method,path,body,token="demo-admin",params={})=>engine.handle({method,path,body,token,params})};};
const opening={amount:"1000.10",direction:"debit",as_of_date:"2026-01-01"};
const payment={amount:"100.05",transaction_date:"2026-01-10",mode:"GPAY",transaction_id:"UTR123456"};
const invoice={invoice_number:"VM/25-26/001",invoice_date:"2026-01-05",amount:"200.20"};

test("customer ledger adds opening and invoice debits, subtracts payments exactly and persists",async()=>{
  const{call,storage}=setup();await call("PUT","/admin/customers/c1/opening-balance",opening);
  for(let i=0;i<2;i++){await call("POST","/admin/orders/o1/close",invoice);await call("POST","/admin/customers/c1/payments",payment);}
  const result=await call("GET","/ledger/mine",undefined,"demo-customer:c1");
  assert.equal(result.total,3);assert.equal(result.summary.balance_paise,110025);
  assert.deepEqual(result.items.map(e=>e.balance_paise),[110025,120030,100010]);
  const next=createDemoEngine(storage),fresh=await next.handle({path:"/ledger/mine",token:"demo-customer:c1"});
  assert.deepEqual(fresh.summary,result.summary);
  assert.equal((await call("GET","/ledger/mine",undefined,"demo-customer:c2")).total,0);
});

test("customer reports need confirmation, IDs are unique and only the signed-in customer is used",async()=>{
  const{call}=setup();const report=await call("POST","/ledger/payments",payment,"demo-customer:c1");
  assert.equal(report.status,"pending");
  assert.equal((await call("GET","/ledger/mine",undefined,"demo-customer:c1")).summary.balance_paise,0);
  assert.equal((await call("GET","/admin/payments/pending")).total,1);
  await assert.rejects(call("POST",`/admin/payments/${report.id}/confirm`,{},"demo-customer:c1"),e=>e.status===401);
  await assert.rejects(call("POST","/ledger/payments",{...payment,customer_id:"c2"},"demo-customer:c1"),e=>e.status===400);
  await call("POST",`/admin/payments/${report.id}/confirm`);
  await call("POST",`/admin/payments/${report.id}/confirm`);
  assert.equal((await call("GET","/ledger/mine",undefined,"demo-customer:c1")).summary.advance_paise,10005);
  await assert.rejects(call("POST","/admin/customers/c2/payments",{...payment,transaction_id:"utr 123456"}),e=>e.status===409);
  await assert.rejects(call("GET","/ledger/mine",undefined,""),e=>e.status===401);
});

test("invoice voids preserve order history, reverse the debit and allow corrected billing",async()=>{
  const{call}=setup();await call("POST","/admin/orders/o1/close",invoice);
  await assert.rejects(call("DELETE","/admin/orders/o1"),e=>e.status===409);
  await assert.rejects(call("PATCH","/admin/orders/o1/status",{status:"cancelled"}),e=>e.status===409);
  await assert.rejects(call("POST","/admin/orders/o1/close",{...invoice,amount:"99"}),e=>e.status===409);
  await call("POST","/admin/orders/o1/invoice/void",{reason:"Correct invoice amount"});
  assert.equal((await call("GET","/admin/customers/c1/ledger")).summary.balance_paise,0);
  await assert.rejects(call("DELETE","/admin/orders/o1"),e=>e.status===409);
  await call("POST","/admin/orders/o1/close",{...invoice,amount:"250.25"});
  const result=await call("GET","/admin/customers/c1/ledger");assert.equal(result.summary.balance_paise,25025);assert.equal(result.total,2);
});

test("opening corrections require a reason and current revision, rejected and voided payments do not count",async()=>{
  const{call}=setup();await call("PUT","/admin/customers/c1/opening-balance",opening);
  await assert.rejects(call("PUT","/admin/customers/c1/opening-balance",{...opening,amount:"99"}),e=>e.status===400);
  await call("PUT","/admin/customers/c1/opening-balance",{...opening,amount:"200.20",expected_revision:1,reason:"Correct carried balance"});
  await assert.rejects(call("PUT","/admin/customers/c1/opening-balance",{...opening,expected_revision:1,reason:"Old correction"}),e=>e.status===409);
  const p=await call("POST","/admin/customers/c1/payments",payment);await call("POST",`/admin/payments/${p.id}/void`,{reason:"Wrong customer entry"});
  const reported=await call("POST","/ledger/payments",{...payment,transaction_id:"OTHER123"},"demo-customer:c1");
  await call("POST",`/admin/payments/${reported.id}/reject`,{reason:"Payment not received"});
  const result=await call("GET","/ledger/mine",undefined,"demo-customer:c1");assert.equal(result.summary.balance_paise,20020);assert.equal(result.total,3);
  assert.equal("history" in result.opening,false);
});

test("amount parsing rejects fractional paise and invalid payment details",async()=>{
  assert.equal(amountToPaise("0.29"),29);assert.equal(amountToPaise("1000.10"),100010);assert.match(ledgerDateToday(),/^\d{4}-\d{2}-\d{2}$/);
  for(const value of ["0.001","NaN","Infinity","-1","1e6","10000000000"])assert.throws(()=>amountToPaise(value));
  const{call}=setup();for(const change of [{amount:"0"},{amount:"0.001"},{transaction_date:"2099-01-01"},{transaction_date:"2026-02-30"},{mode:"CASH"},{transaction_id:""}])await assert.rejects(call("POST","/admin/customers/c1/payments",{...payment,...change}),e=>e.status===400);
});

test("demo payment recording works without secure-context Web Crypto",async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,"crypto");
  Object.defineProperty(globalThis,"crypto",{value:undefined,configurable:true});
  try{const{call}=setup();const result=await call("POST","/admin/customers/c1/payments",payment);assert.equal(result.status,"confirmed");assert.ok(result.id);}
  finally{if(previous)Object.defineProperty(globalThis,"crypto",previous);else delete globalThis.crypto;}
});
