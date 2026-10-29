import test from 'node:test';
import assert from 'node:assert/strict';
import {customer360} from '../src/demo/customer360.mjs';
import {seedDemo} from '../src/demo/seed.mjs';
import {createDemoEngine} from '../src/demo/engine.mjs';

const state=()=>{const s=seedDemo();s.customers[0].password_hash='PRIVATE';s.customers[0].verification_token='PRIVATE';return s;};
test('Customer 360 contains only selected-customer records and never mutates the demo',()=>{
  const s=state(),before=JSON.stringify(s),data=customer360(s,'c1',{limit:100});
  assert.equal(data.customer.id,'c1');assert.equal(data.summary.orders,s.orders.filter(o=>o.customer_id==='c1').length);
  assert.equal(JSON.stringify(data).includes('PRIVATE'),false);
  assert.equal(data.items.some(row=>row.title.includes('DEMO-2026-00002')),false);
  assert.equal(JSON.stringify(s),before);
});
test('payments and invoices use the existing ledger totals and pending reports are not credited',()=>{
  const s=state();s.orders[0].invoice={id:'i',invoice_number:'INV-C360',invoice_date:'2026-10-20',amount_paise:10000,status:'posted',created_at:'2026-10-20T12:00:00Z'};
  s.ledger_entries=[{id:'p',customer_id:'c1',entry_type:'payment',status:'confirmed',amount_paise:3000,transaction_date:'2026-10-21',created_at:'2026-10-21T12:00:00Z'},{id:'report',customer_id:'c1',entry_type:'payment',status:'pending',amount_paise:9000,transaction_date:'2026-10-22',created_at:'2026-10-22T12:00:00Z'}];
  const data=customer360(s,'c1');assert.equal(data.summary.ledger.balance_paise,7000);assert.equal(data.summary.ledger.pending_payments,1);
});
test('history remains paginated and uses India local dates for filtering',()=>{
  const s=state();s.orders=Array.from({length:205},(_,i)=>({id:`order-${i}`,customer_id:'c1',order_number:`EXTRA-${i}`,items:[],status:'new',sales_value:1,created_at:'2026-10-20T19:00:00Z'}));
  const data=customer360(s,'c1',{section:'orders',page:3,limit:100,date_from:'2026-10-21',date_to:'2026-10-21'});
  assert.equal(data.total,205);assert.equal(data.items.length,5);assert.equal(data.summary.orders,205);
});
test('the demo API enforces Admin access and exposes the new Customer 360 contract',async()=>{
  const storage={getItem:()=>null,setItem:()=>{}};const engine=createDemoEngine(storage);
  await assert.rejects(()=>engine.handle({method:'GET',path:'/admin/customers/c1/360'}));
  const data=await engine.handle({method:'GET',path:'/admin/customers/c1/360',token:'demo-admin'});
  assert.equal(data.customer.id,'c1');assert.ok(Array.isArray(data.items));assert.ok(data.summary.ledger);
});
