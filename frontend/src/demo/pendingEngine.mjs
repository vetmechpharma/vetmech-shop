import {STOCK_TEMPLATES,stockMessage} from "../lib/pendingItems.mjs";

export function preparePending(order,lines,uid,now){
  const previous=(order.pending_items||[]).map(row=>({...row})),active=new Map(previous.filter(row=>["waiting","available"].includes(row.state)).map(row=>[row.variant_id,row])),flagged=new Map(lines.filter(line=>line.out_of_stock).map(line=>[line.variant_id,line]));
  for(const[vid,row]of active)if(!flagged.has(vid))Object.assign(row,{state:"resolved",resolved_at:now()});
  for(const[vid,line]of flagged){let row=active.get(vid);if(!row){row={id:uid("pending"),variant_id:vid,state:"waiting",created_at:now(),availability_notice_status:"not_sent"};previous.push(row);}for(const key of["product_id","product_name","pack_size","unit","image","slug"])row[key]=line[key]||"";row.requested_qty=line.qty;}
  return previous;
}

export function pendingRows(state,customerId){
  const allocated=new Map();
  for(const order of state.orders.filter(o=>o.status!=="cancelled"&&(!customerId||o.customer_id===customerId))){const budgets=new Map();for(const line of order.items||[])budgets.set(line.variant_id,(budgets.get(line.variant_id)||0)+line.qty);for(const link of order.pending_reorders||[]){const qty=Math.min(link.qty,budgets.get(link.variant_id)||0);allocated.set(link.pending_id,(allocated.get(link.pending_id)||0)+qty);budgets.set(link.variant_id,(budgets.get(link.variant_id)||0)-qty);}}
  const rows=[];
  for(const order of state.orders.filter(o=>o.status!=="cancelled"&&(!customerId||o.customer_id===customerId)))for(const entry of order.pending_items||[]){const remaining_qty=Math.max(0,entry.requested_qty-(allocated.get(entry.id)||0));if(!["waiting","available"].includes(entry.state)||!remaining_qty)continue;const product=state.products.find(p=>p.active===true&&p.variants.some(v=>v.id===entry.variant_id)),variant=product?.variants.find(v=>v.id===entry.variant_id);rows.push({...entry,remaining_qty,order_id:order.id,order_number:order.order_number,customer_id:order.customer_id,customer_name:order.customer_name,customer_mobile:order.customer_mobile,can_reorder:!!product,slug:product?.slug||entry.slug,min_order_qty:variant?.min_order_qty||1});}
  return rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
}

export function pendingLinks(state,customerId,ids,lines,ErrorType){
  if(!ids?.length)return[];const fail=(message)=>{throw new ErrorType(409,message);};if(ids.length>100||new Set(ids).size!==ids.length)fail("Select each missed item only once");
  const rows=new Map(pendingRows(state,customerId).map(row=>[row.id,row])),budgets=new Map();for(const line of lines)budgets.set(line.variant_id,(budgets.get(line.variant_id)||0)+line.qty);
  return ids.map(id=>{const row=rows.get(id);if(!row)fail("A selected missed item is no longer pending for your account. Refresh checkout.");const qty=Math.min(row.remaining_qty,budgets.get(row.variant_id)||0);if(qty<=0)fail("A selected missed item is missing from the cart");budgets.set(row.variant_id,budgets.get(row.variant_id)-qty);return{pending_id:id,variant_id:row.variant_id,qty};});
}

export function demoStockTemplates(state){
  const raw=state.settings.message_templates?.templates||state.settings.message_templates||{},templates={...STOCK_TEMPLATES};
  for(const[key,value]of Object.entries(raw))if(typeof value==="string")templates[key]={label:key.replaceAll("_"," "),body:value};else if(value?.body)templates[key]={label:STOCK_TEMPLATES[key]?.label||key.replaceAll("_"," "),...value};
  return{templates,placeholders:["{name}","{order}","{items}","{transport}","{cases}","{lr}","{freight}"]};
}

export function recordOosNotice(state,order,uid,now){
  const rows=pendingRows(state,order.customer_id).filter(row=>row.order_id===order.id&&row.state==="waiting");if(!rows.length)return{status:"not_needed",items:0};
  const fingerprint=JSON.stringify(rows.map(row=>[row.id,row.remaining_qty]).sort());if(order.pending_oos_notice?.fingerprint===fingerprint)return{status:"already_recorded",items:rows.length};
  const message=stockMessage(demoStockTemplates(state).templates.order_items_out_of_stock.body,rows,order.customer_name);
  state.notification_logs.unshift({id:uid("notification"),channel:"whatsapp",kind:"items_out_of_stock",message,to:order.customer_whatsapp||order.customer_mobile,status:"simulated",simulated:true,created_at:now()});
  order.pending_oos_notice={fingerprint,status:"simulated",at:now()};return{status:"simulated",items:rows.length};
}

export const isPendingPath=path=>path==="/pending-items/mine"||path.startsWith("/admin/pending-items");

export function handlePending({state,method,path,params,body,customer,admin,uid,now,ErrorType}){
  const fail=(status,message)=>{throw new ErrorType(status,message);};
  if(path==="/pending-items/mine"){if(!customer)fail(401,"Customer login required");const items=pendingRows(state,customer.id);return{items,total:items.length};}
  if(!admin)fail(401,"Admin required");
  const rows=pendingRows(state,params.customer_id);
  if(path==="/admin/pending-items"){
    const products=new Map();for(const row of rows){const group=products.get(row.variant_id)||{variant_id:row.variant_id,product_name:row.product_name,pack_size:row.pack_size,unit:row.unit,waiting:0,available:0,requested_qty:0,customers:new Set()};group[row.state]++;group.requested_qty+=row.remaining_qty;group.customers.add(row.customer_id);products.set(row.variant_id,group);}
    const filtered=rows.filter(row=>(!params.state||params.state==="all"||row.state===params.state)&&(!params.variant_id||row.variant_id===params.variant_id)&&(!params.q||JSON.stringify(row).toLowerCase().includes(params.q.toLowerCase()))),page=Number(params.page||1),limit=Number(params.limit||50);
    return{items:filtered.slice((page-1)*limit,page*limit),total:filtered.length,page,pages:Math.ceil(filtered.length/limit),summary:{waiting:rows.filter(r=>r.state==="waiting").length,available:rows.filter(r=>r.state==="available").length,customers:new Set(rows.map(r=>r.customer_id)).size},products:[...products.values()].map(p=>({...p,customers:p.customers.size}))};
  }
  if(method!=="POST")fail(405,"Method not allowed");
  if(!!body.item_ids?.length===!!body.variant_ids?.length)fail(400,"Select pending items or product variants");
  const key=JSON.stringify([...(body.item_ids||[])].sort())+JSON.stringify([...(body.variant_ids||[])].sort());
  state.pending_notification_batches ||= {};
  if(path.endsWith("notify-available")&&state.pending_notification_batches[body.request_id]){const previous=state.pending_notification_batches[body.request_id];if(previous.fingerprint!==key)fail(409,"Notification request ID already used");return previous.result;}
  const eligible=rows.filter(row=>(body.item_ids?.includes(row.id)||body.variant_ids?.includes(row.variant_id))&&!["sent","simulated","sending"].includes(row.availability_notice_status));
  const groups=new Map();for(const row of eligible){const c=state.customers.find(c=>c.id===row.customer_id);if(!c||["deleted","suspended","rejected"].includes(c.status))continue;const group=groups.get(c.id)||{customer_id:c.id,customer_name:c.name,to:c.whatsapp||c.mobile,items:[]};group.items.push(row);groups.set(c.id,group);}
  const messages=[...groups.values()].map(group=>({...group,message:stockMessage(demoStockTemplates(state).templates.order_items_back_in_stock.body,group.items,group.customer_name)}));
  if(path.endsWith("availability-preview"))return{customers:messages.length,item_ids:messages.flatMap(m=>m.items.map(row=>row.id)),messages:messages.map(({items,...message})=>message)};
  if(!body.request_id)fail(400,"Notification request ID is required");
  for(const group of messages){for(const row of group.items){const order=state.orders.find(o=>o.id===row.order_id),entry=order.pending_items.find(e=>e.id===row.id);Object.assign(entry,{state:"available",available_at:now(),availability_notice_status:"simulated",availability_notified_at:now(),availability_batch_id:body.request_id});order.updated_at=now();}state.notification_logs.unshift({id:uid("notification"),channel:"whatsapp",kind:"pending_items_available",message:group.message,to:group.to,status:"simulated",simulated:true,created_at:now()});}
  const result={batch_id:body.request_id,customers:messages.length,sent:0,simulated:messages.length,failed:0,results:messages.map(m=>({customer_id:m.customer_id,customer_name:m.customer_name,status:"simulated",items:m.items.length}))};state.pending_notification_batches[body.request_id]={fingerprint:key,result};return result;
}
