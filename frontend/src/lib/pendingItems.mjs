export const STOCK_TEMPLATES = {
  order_items_out_of_stock: {label:"Items Out of Stock",body:"Dear {name}, regarding your VETMECH order {order}, the following items are currently OUT OF STOCK:\n{items}\nWe will notify you once they are available. The other items in your order will be processed."},
  order_items_back_in_stock: {label:"Missed Items Now Available",body:"Dear {name}, the following items missed from your previous VETMECH order(s) {order} are now IN STOCK:\n{items}\nYou can add them again at your next checkout. Thank you!"},
};

export function pendingCartMeta(previous, incoming) {
  if (!incoming.pending_item_ids?.length) return {};
  const old = previous?.pending_customer_id === incoming.pending_customer_id ? previous.pending_item_ids || [] : [];
  return {pending_customer_id:incoming.pending_customer_id,pending_item_ids:[...new Set([...old,...incoming.pending_item_ids])]};
}

export function checkoutPendingIds(items, customerId) {
  return [...new Set(items.filter(item=>item.pending_customer_id===customerId&&item.qty>0).flatMap(item=>item.pending_item_ids||[]))];
}

export function pendingRequestId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const value=Math.floor(Math.random()*16);return(c==="x"?value:(value&3)|8).toString(16);});
}

export function stockMessage(template, rows, customerName) {
  if(!template.includes("{items}"))template+="\n{items}";
  const grouped=new Map();
  for(const row of rows){const old=grouped.get(row.variant_id)||{...row,qty:0};old.qty+=Number(row.remaining_qty??row.requested_qty??row.qty??0);grouped.set(row.variant_id,old);}
  const items=[...grouped.values()].map(row=>`• ${row.product_name} (${[row.pack_size,row.unit].filter(Boolean).join(" ")}) — Qty ${row.qty}`).join("\n");
  return template.replaceAll("{name}",customerName).replaceAll("{order}",[...new Set(rows.map(row=>row.order_number))].join(", ")).replaceAll("{items}",items);
}
