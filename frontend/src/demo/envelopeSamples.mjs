// Synthetic, browser-only dispatch fixtures. These records are never sent to the VPS.
export const ENVELOPE_CUSTOMER_ID = "sample-envelope-customer";
export const ENVELOPE_READY_ID = "sample-envelope-ready";
export const ENVELOPE_PAID_ID = "sample-envelope-paid";
export function addEnvelopeSamples(state, password) {
  if (state.envelope_samples_v1) return;
  const now = new Date().toISOString(), day = now.slice(0,10);
  const address = {name:"Dr. Sample Customer",mobile:"0000000004",line1:"12, Veterinary Clinic Road",line2:"Near Bus Stand",line3:"",main_area:"Koduvai",district:"Tiruppur",state:"Tamil Nadu",pincode:"638660"};
  const customer = {id:ENVELOPE_CUSTOMER_ID,prefix:"Dr.",name:address.name,company_name:"SAMPLE Veterinary Clinic",mobile:address.mobile,normalized_mobile:address.mobile,whatsapp:address.mobile,email:"envelope-test@example.com",category:"doctor",status:"active",status_label:"Active",active:true,password,addresses:[{...address}],default_address:{...address},address:address.line1,district:address.district,state:address.state,pincode:address.pincode,created_at:now,is_demo:true};
  const items = state.products.filter(p=>["p1","p2","p3"].includes(p.id)).map(p=>{const v=p.variants[0];return {product_id:p.id,product_name:p.name,brand_name:p.brand_name,image:p.image,slug:p.slug,variant_id:v.id,pack_size:v.pack_size,unit:v.unit,units_per_case:v.units_per_case,mrp:v.mrp,unit_price:v.selling_price,selling_price:v.selling_price,net_rate:v.selling_price,qty:24,free_qty:0,dispatch_qty:24,gst_percent:v.gst_percent,gst_inclusive:false,scheme_label:null,price_source:"sample",out_of_stock:false}});
  const subtotal = Math.round(items.reduce((s,l)=>s+l.qty*l.unit_price,0)*100)/100;
  const dispatch = {cases:3,transport:"Demo Logistics",transport_id:"tr1",transport_name:"Demo Logistics",freight:"to_pay",dispatch_date:day,invoice_number:"SAMPLE-INV-001",invoice_value:subtotal,invoice_date:day,remarks:"SAMPLE ONLY — envelope alignment test; no physical shipment."};
  const base = {customer_id:customer.id,customer_name:customer.name,customer_mobile:customer.mobile,customer_whatsapp:customer.mobile,company_name:customer.company_name,customer_category:customer.category,address,items,total_qty:items.reduce((s,l)=>s+l.qty,0),total_free:0,total_dispatch:items.reduce((s,l)=>s+l.dispatch_qty,0),sales_value:subtotal,cash_discount:false,notes:"SAMPLE DATA ONLY — test envelope printing. No payment, shipment or real notification.",internal_notes:"Three sample product cases: 24 units each. Fictional customer and mobile.",pending_items:[],is_demo:true,created_at:now,updated_at:now,origin:{device:"Demo",browser:"Demo",os:"Demo",location:"Synthetic envelope test data",ip:""}};
  state.customers ||= [];state.orders ||= [];
  if (!state.customers.some(c=>c.id===customer.id)) state.customers.push(customer);
  for (const order of [{...base,id:ENVELOPE_READY_ID,order_number:"SAMPLE-ENV-TO-PAY",status:"ready_to_dispatch",dispatch:null,dispatch_preparation:dispatch},{...base,id:ENVELOPE_PAID_ID,order_number:"SAMPLE-ENV-PAID",status:"dispatched",dispatch:{...dispatch,freight:"paid",invoice_number:"SAMPLE-INV-002",lr_number:"SAMPLE-LR-002",dispatched_by:"Demo Admin",dispatched_at:now}}]) {
    if(!state.orders.some(o=>o.id===order.id))state.orders.push({...order,activity:[{id:`${order.id}-created`,text:"Synthetic envelope-printing order created",actor:"Demo Admin",at:now}]});
  }
  state.envelope_samples_v1 = true;
}
