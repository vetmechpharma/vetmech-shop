import React,{useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {api} from "@/lib/api";
import {useCart} from "@/context/CartContext";
import {Button} from "@/components/ui/button";
import {PackagePlus,Check} from "lucide-react";

export default function PendingOrderItems({customer,showEmpty=false}){
  const{items,addItem}=useCart();const[expanded,setExpanded]=useState(false);
  const query=useQuery({queryKey:["my-pending-items",customer?.id],queryFn:async()=>(await api.get("/pending-items/mine")).data,enabled:!!customer?.id,refetchOnMount:"always"});
  if(!customer||query.isPending)return null;
  if(query.isError)return <div className="border rounded-lg p-4 text-sm text-slate-500" role="alert">We could not load items missed from your earlier orders. <button className="underline text-vm-green" onClick={()=>query.refetch()}>Try again</button></div>;
  if(!query.data?.items.length)return showEmpty?<p className="border rounded-xl bg-white p-8 text-center text-slate-500">No missed items are pending from your previous orders.</p>:null;
  const inCart=new Set(items.filter(item=>item.pending_customer_id===customer.id).flatMap(item=>item.pending_item_ids||[]));
  const existingLine=row=>items.find(item=>item.variant_id===row.variant_id&&!item.pending_item_ids?.length);
  const add=row=>{const existing=existingLine(row);addItem(row.variant_id,existing?.qty||Math.max(row.remaining_qty,row.min_order_qty||1),{pending_customer_id:customer.id,pending_item_ids:[row.id]},!!existing);};
  const rows=expanded?query.data.items:query.data.items.slice(0,6);
  return <section className="border border-red-200 rounded-xl bg-white overflow-hidden" data-testid="missed-order-items"><div className="p-5 border-b bg-red-50/50"><h2 className="font-heading text-xl font-bold text-vm-ink flex items-center gap-2"><PackagePlus className="w-5 h-5 text-vm-green"/>Missed from your previous orders</h2><p className="mt-2 text-sm text-slate-600">Add these items again to your current order. Your current prices and offers will apply.</p></div>
    <div className="divide-y">{rows.map(row=><div key={row.id} className="p-5 flex items-start justify-between flex-wrap gap-4" data-testid={`missed-item-${row.id}`}><div className="min-w-0 flex-1"><p className="font-semibold text-vm-ink">{row.product_name}</p><p className="text-sm text-slate-500 mt-1">{row.pack_size} {row.unit} · {row.order_number} · Missed quantity: {row.remaining_qty}</p><span className={`inline-block mt-2 text-xs font-semibold px-2 py-1 rounded ${row.state==="available"?"bg-green-50 text-green-700":"bg-amber-50 text-amber-800"}`}>{row.state==="available"?"Now in stock":"Awaiting stock confirmation"}</span>{!row.can_reorder&&<p className="text-xs text-slate-500 mt-2">Please contact our team to order this item.</p>}</div>
      <Button size="sm" variant={inCart.has(row.id)?"outline":"default"} disabled={inCart.has(row.id)||!row.can_reorder} data-testid={`add-missed-${row.id}`} onClick={()=>add(row)}>{inCart.has(row.id)?<><Check className="w-4 h-4 mr-1"/>Added to cart</>:existingLine(row)?`Use ${existingLine(row).qty} already in cart`:`Add ${Math.max(row.remaining_qty,row.min_order_qty||1)} to cart`}</Button>
    </div>)}</div>{query.data.items.length>6&&<div className="p-3 text-center"><Button variant="ghost" onClick={()=>setExpanded(!expanded)}>{expanded?"Show fewer items":`Show all ${query.data.items.length} missed items`}</Button></div>}
  </section>;
}
