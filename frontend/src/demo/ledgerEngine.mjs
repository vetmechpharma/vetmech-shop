import { amountToPaise, ledgerDateToday, ledgerRows } from "../lib/ledger.mjs";

export const isLedgerPath = path => path.startsWith("/ledger/") || path.startsWith("/admin/payments/") || /^\/admin\/customers\/[^/]+\/(ledger|opening-balance|payments)$/.test(path) || /^\/admin\/orders\/[^/]+\/(close|invoice\/void)$/.test(path);

export async function handleLedger({state,method,parts,body,params,customer,admin,now,uid,ErrorType}) {
  const fail=(status,message)=>{throw new ErrorType(status,message);};
  const date=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||"")||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||value>ledgerDateToday())fail(400,"Enter a valid transaction date that is not in the future");return value;};
  const amount=(value,allowZero=false)=>{let result;try{result=amountToPaise(value);}catch(error){fail(400,error.message);}if(!allowZero&&result<=0)fail(400,"Amount must be greater than zero");return result;};
  const customerFor=(cid,writing=false)=>{const row=state.customers.find(c=>c.id===cid);if(!row)fail(404,"Customer not found");if(writing&&row.status==="deleted")fail(409,"This customer is deleted; the retained ledger is read-only");return row;};
  const entries=state.ledger_entries ||= [];
  const paging=(rows)=>{const page=Math.max(1,Number(params.page||1)),limit=Math.max(1,Math.min(200,Number(params.limit||50)));return {items:rows.slice((page-1)*limit,page*limit),page,limit,total:rows.length,pages:Math.ceil(rows.length/limit)};};
  const statement=cid=>{
    const c=customerFor(cid), rows=entries.filter(e=>e.customer_id===cid).map(e=>{const{history,created_by,reviewed_by,...row}=e;return row;});
    for(const order of state.orders.filter(o=>o.customer_id===cid))for(const invoice of [...(order.voided_invoices||[]),...(order.invoice?[order.invoice]:[])])rows.push({...invoice,entry_type:"invoice",transaction_date:invoice.invoice_date,customer_id:cid,order_id:order.id,order_number:order.order_number,description:"Invoice "+invoice.invoice_number});
    const {items,summary}=ledgerRows(rows);
    return {customer:{id:c.id,name:c.name,mobile:c.mobile,company_name:c.company_name,status:c.status},currency:"INR",opening:rows.find(e=>e.entry_type==="opening")||null,summary,...paging(items)};
  };
  if(parts[0]==="ledger"&&!customer)fail(401,"Customer login required");
  if(parts[0]==="ledger"&&parts[1]==="mine")return statement(customer.id);
  if(parts[0]==="admin"&&parts[1]==="payments"){
    if(!admin)fail(401,"Admin required");
    if(parts[2]==="pending")return paging([...entries].filter(e=>e.entry_type==="payment"&&e.status==="pending").reverse());
    const row=entries.find(e=>e.id===parts[2]&&e.entry_type==="payment");if(!row)fail(404,"Payment not found");customerFor(row.customer_id,true);
    const action=parts[3],target={confirm:"confirmed",reject:"rejected",void:"voided"}[action];if(!target||method!=="POST")fail(404,"Unknown payment action");
    if(action!=="confirm"&&String(body.reason||"").trim().length<5)fail(400,"A reason of at least 5 characters is required");
    if(row.status===target)return row;
    if(row.status!==(action==="void"?"confirmed":"pending"))fail(409,"This payment was already reviewed; refresh the ledger");
    Object.assign(row,{status:target,reason:body.reason||"",reviewed_at:now()});return row;
  }
  if(parts[0]==="admin"&&parts[1]==="orders"){
    const order=state.orders.find(o=>o.id===parts[2]);if(!order)fail(404,"Order not found");
    if(method!=="POST")fail(405,"Method not allowed");
    if(parts[3]==="invoice"){
      if(!order.invoice)fail(404,"Posted invoice not found");if(String(body.reason||"").trim().length<5)fail(400,"A reason of at least 5 characters is required");
      (order.voided_invoices ||= []).push({...order.invoice,status:"voided",reason:body.reason,voided_at:now()});
      delete order.invoice;delete order.invoice_key;delete order.closed_at;order.status="delivered";order.updated_at=now();return order;
    }
    customerFor(order.customer_id,true);
    const invoice_number=String(body.invoice_number||"").trim();if(!invoice_number||invoice_number.length>80)fail(400,"Enter the invoice number");
    const invoice_date=date(body.invoice_date),amount_paise=amount(body.amount);
    if(order.invoice){if(order.invoice.invoice_number===invoice_number&&order.invoice.invoice_date===invoice_date&&order.invoice.amount_paise===amount_paise)return order;fail(409,"This order is already invoiced; void the invoice before correcting it");}
    if(order.status==="cancelled")fail(409,"A cancelled order cannot be invoiced");
    if(body.expected_updated_at!=null&&body.expected_updated_at!==order.updated_at)fail(409,"This order changed; refresh it before closing");
    const [year,month]=invoice_date.split("-").map(Number),key=(year-(month<4))+":"+invoice_number.toLowerCase();
    if(state.orders.some(o=>o.id!==order.id&&o.invoice_key===key))fail(409,"This invoice number is already used in this financial year");
    Object.assign(order,{status:"closed",invoice:{id:uid("invoice"),invoice_number,invoice_date,amount_paise,status:"posted",created_at:now()},invoice_key:key,closed_at:now(),updated_at:now()});return order;
  }
  const cid=parts[0]==="ledger"?customer.id:parts[2],c=customerFor(cid,method!=="GET"),action=parts[0]==="ledger"?"payments":parts[3];
  if(action==="ledger")return statement(cid);
  if(action==="opening-balance"){
    if(method!=="PUT")fail(405,"Method not allowed");
    const values={amount_paise:amount(body.amount,true),direction:body.direction||"debit",transaction_date:date(body.as_of_date),notes:body.notes||""};
    if(!["debit","credit"].includes(values.direction))fail(400,"Invalid balance type");
    let row=entries.find(e=>e.id==="opening:"+cid);
    if(row){if(Object.entries(values).every(([k,v])=>row[k]===v))return row;if(String(body.reason||"").trim().length<5)fail(400,"Enter a reason to correct the opening balance");if(row.revision!==body.expected_revision)fail(409,"The opening balance changed; refresh the ledger");(row.history ||= []).push({...row,history:undefined,reason:body.reason});Object.assign(row,values,{revision:row.revision+1});}
    else{row={id:"opening:"+cid,customer_id:cid,entry_type:"opening",description:"Opening balance",status:"posted",revision:1,created_at:now(),...values};entries.push(row);}return row;
  }
  if(action!=="payments"||method!=="POST")fail(405,"Method not allowed");
  if("customer_id" in body)fail(400,"The customer is selected by the signed-in account or Admin route");
  const transaction_id=String(body.transaction_id||"").replace(/\s+/g,"").toUpperCase();if(!/^[A-Z0-9/_-]{3,128}$/.test(transaction_id))fail(400,"Enter a valid transaction ID");
  if(!["GPAY","UPI","NET_BANKING"].includes(body.mode))fail(400,"Choose GPay, UPI or Net banking");
  const values={customer_id:cid,amount_paise:amount(body.amount),mode:body.mode,transaction_id,transaction_date:date(body.transaction_date)};
  const status=parts[0]==="admin"?"confirmed":"pending",existing=entries.find(e=>e.transaction_id===transaction_id);
  if(existing){if(existing.status===status&&Object.entries(values).every(([k,v])=>existing[k]===v))return existing;fail(409,"This transaction ID is already recorded. Review the existing payment instead.");}
  // Duplicate prevention uses the normalized reference above. Keep sample IDs
  // independent of Web Crypto so the local HTTP development preview also works.
  const id=uid("payment");
  const row={id,...values,entry_type:"payment",status,origin:parts[0]==="admin"?"admin":"customer",description:"Payment",notes:body.notes||"",customer_name:c.name,customer_mobile:c.mobile,created_at:now()};entries.push(row);return row;
}
