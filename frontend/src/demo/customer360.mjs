import {ledgerRows} from '../lib/ledger.mjs';
import {pendingRows} from './pendingEngine.mjs';
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));
const indiaDate=value=>!value?'':String(value).length===10?value:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const money=value=>Math.round(Number(value||0)*100);
const addressKeys=['label','name','line1','line2','city','district','state','pincode','mobile'];
const row=(id,kind,at,title,detail='',status='',amount_paise=null,href='',actor='')=>({id,kind,at:at||'',date:indiaDate(at),title,detail,status,amount_paise,href,actor});
export function customer360(state,cid,params={},ErrorType=Error){
  const fail=(status,message)=>{throw new ErrorType(status,message);};
  const c=state.customers.find(c=>c.id===cid);if(!c)fail(404,'Customer not found');
  const section=params.section||'timeline',kind=params.kind||'all',page=Number(params.page||1),limit=Number(params.limit||20);
  if(!['timeline','orders','pending','quotations'].includes(section)||!['all','customer','order','invoice','payment','opening','pending','quotation'].includes(kind)||!Number.isInteger(page)||page<1||!Number.isInteger(limit)||limit<1||limit>100)fail(422,'Invalid history filter');
  if(params.date_from&&params.date_to&&params.date_from>params.date_to)fail(400,'The start date must be before the end date');
  const customer={...pick(c,['id','prefix','name','company_name','mobile','whatsapp','email','category','address','district','state','pincode','created_at','source','price_protected']),status:c.status||'active',status_label:c.status||'active',addresses:(c.addresses||[]).map(a=>pick(a,addressKeys)),default_address:pick(c.default_address||{},addressKeys)};
  const timeline=[],orders=[],quotations=[],products=new Map(),ledger=[],sourceOrders=state.orders.filter(o=>o.customer_id===cid),totals={orders:sourceOrders.length,active_orders:0,cancelled_orders:0,ordered_value_paise:0,last_order_at:null};
  if(c.created_at)timeline.push(row('customer-created','customer',c.created_at,'Customer account created',c.source||''));
  for(const order of sourceOrders){
    const link=`/admin/orders?order_id=${encodeURIComponent(order.id)}`,number=order.order_number||order.id;
    if(order.status==='cancelled')totals.cancelled_orders++;else{totals.ordered_value_paise+=money(order.sales_value);for(const line of order.items||[]){const key=JSON.stringify([line.product_name,line.pack_size,line.unit]);const p=products.get(key)||{name:line.product_name||'Product',pack_size:line.pack_size||'',unit:line.unit||'',qty:0};p.qty+=line.qty||0;products.set(key,p);}}
    if(!['cancelled','delivered','closed'].includes(order.status))totals.active_orders++;
    if(order.created_at&&(!totals.last_order_at||order.created_at>totals.last_order_at))totals.last_order_at=order.created_at;
    const item=row('order:'+order.id,'order',order.created_at,number,(order.items||[]).map(i=>`${i.product_name} × ${i.qty}`).join(', '),order.status,money(order.sales_value),link);orders.push(item);timeline.push({...item,title:'Order created · '+number});
    (order.activity||[]).forEach((event,index)=>timeline.push(row(`order:${order.id}:activity:${index}`,'order',event.at,event.text||'Order updated',number,'',null,link,event.actor||'')));
    for(const invoice of [...(order.voided_invoices||[]),...(order.invoice?[order.invoice]:[])]){
      ledger.push({...invoice,entry_type:'invoice',transaction_date:invoice.invoice_date,customer_id:cid});
      timeline.push(row('invoice:'+invoice.id,'invoice',invoice.created_at||invoice.invoice_date,'Invoice '+invoice.invoice_number+' posted',number,'posted',invoice.amount_paise,link));
      if(invoice.status==='voided')timeline.push(row('invoice:'+invoice.id+':void','invoice',invoice.voided_at,'Invoice '+invoice.invoice_number+' voided',invoice.reason||'','voided',invoice.amount_paise,link));
    }
  }
  const ledgerLink='/admin/ledger?customer_id='+encodeURIComponent(cid);
  for(const entry of (state.ledger_entries||[]).filter(e=>e.customer_id===cid)){
    ledger.push(entry);const payment=entry.entry_type==='payment';
    timeline.push(row('ledger:'+entry.id,payment?'payment':'opening',entry.updated_at||entry.created_at||entry.transaction_date,payment?'Payment recorded':'Opening balance (current)',(payment?['mode','transaction_id','notes']:['direction','notes']).map(k=>entry[k]).filter(Boolean).join(' · '),entry.status,entry.amount_paise,ledgerLink));
  }
  const pending=pendingRows(state,cid,true),pendingRecords=[];
  for(const entry of pending){
    const link='/admin/orders?order_id='+encodeURIComponent(entry.order_id),detail=`${entry.pack_size||''} ${entry.unit||''} · Requested ${entry.requested_qty} · Remaining ${entry.remaining_qty} · ${entry.order_number}`;
    const item=row('pending:'+entry.id,'pending',entry.created_at,entry.product_name,detail,entry.state,null,link);pendingRecords.push(item);timeline.push({...item,title:'Missed item · '+entry.product_name});
    if(entry.available_at)timeline.push(row('pending:'+entry.id+':available','pending',entry.available_at,'Stock received · '+entry.product_name,(entry.availability_notice_status||'')+' notification','available',null,link));
    if(entry.resolved_at)timeline.push(row('pending:'+entry.id+':resolved','pending',entry.resolved_at,'Missed item resolved · '+entry.product_name,entry.resolution||'','resolved',null,link));
  }
  for(const quote of state.quotations.filter(q=>q.customer_id===cid)){
    const link='/admin/quotations/'+encodeURIComponent(quote.id),number=quote.number||quote.id;
    const item=row('quotation:'+quote.id,'quotation',quote.created_at,number,quote.subject||'',quote.status,money(quote.grand_total),link);quotations.push(item);timeline.push({...item,title:'Quotation created · '+number});
    (quote.history||[]).forEach((event,index)=>timeline.push(row(`quotation:${quote.id}:${index}`,'quotation',event.at,event.action||'Quotation updated',number,'',null,link,event.user||'')));
  }
  for(const event of (state.audit_logs||[]).filter(e=>e.entity_id===cid&&['customer','customer_ledger'].includes(e.entity))){
    const action=(event.action||'updated').replaceAll('_',' '),financial=event.entity==='customer_ledger',type=action.includes('opening')?'opening':financial?'payment':'customer',meta=event.meta||{};
    timeline.push(row('audit:'+event.id,type,event.created_at,action.charAt(0).toUpperCase()+action.slice(1),['status','category','reason'].map(k=>meta[k]).filter(Boolean).join(' · '),'',action.includes('opening')?meta.amount_paise??null:null,financial?ledgerLink:'',event.actor_name||''));
  }
  const all={timeline,orders,pending:pendingRecords,quotations},query=String(params.q||'').toLowerCase();
  const items=all[section].filter(item=>(section!=='timeline'||kind==='all'||item.kind===kind)&&(!(params.date_from||params.date_to)||!!item.date)&&(!params.date_from||item.date>=params.date_from)&&(!params.date_to||item.date<=params.date_to)&&(!query||[item.title,item.detail,item.status,item.actor].join(' ').toLowerCase().includes(query))).sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0)||b.id.localeCompare(a.id));
  const active=pending.filter(p=>['waiting','available'].includes(p.state));
  return{customer,permissions:{orders:true,pending:true,quotations:true,ledger:true,timeline:true},counts:Object.fromEntries(Object.entries(all).map(([key,rows])=>[key,rows.length])),summary:{...totals,ledger:ledgerRows(ledger).summary,pending_items:active.length,pending_qty:active.reduce((sum,p)=>sum+p.remaining_qty,0)},frequent_products:[...products.values()].sort((a,b)=>b.qty-a.qty).slice(0,6),section,items:items.slice((page-1)*limit,page*limit),total:items.length,page,limit,pages:Math.ceil(items.length/limit)};
}
