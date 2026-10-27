import React,{useState} from "react";
import {useSearchParams} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {api} from "@/lib/api";
import {useAdminAuth} from "@/context/AdminAuthContext";
import LedgerView,{PaymentReview} from "@/components/ledger/LedgerView";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {ledgerMoney} from "@/lib/ledger.mjs";

export default function AdminLedger(){
  const {can}=useAdminAuth();const[params,setParams]=useSearchParams();const[q,setQ]=useState("");
  const selected=params.get("customer_id")||"";
  const customers=useQuery({queryKey:["admin-ledger-customer-search",q],queryFn:async()=>(await api.get("/admin/customers",{params:{q,limit:20}})).data,enabled:can("customers")});
  const pending=useQuery({queryKey:["admin-pending-payments"],queryFn:async()=>(await api.get("/admin/payments/pending")).data,enabled:can("customers"),refetchInterval:30000});
  if(!can("customers"))return <p role="alert">Customer management permission is required to access the ledger.</p>;
  return <div><div className="mb-7"><p className="ledger-eyebrow">SALES & ACCOUNTS</p><h1 className="font-heading text-3xl font-bold text-vm-ink">Customer ledger</h1><p className="mt-2 text-slate-500">Record opening balances and received payments. Closed invoices appear automatically.</p></div>
    {pending.isError&&<p role="alert" className="mb-4">Could not load pending payment reports. <Button variant="outline" onClick={()=>pending.refetch()}>Retry</Button></p>}
    {!!pending.data?.total&&<section className="ledger-pending"><h2>Payment reports awaiting confirmation ({pending.data.total})</h2>{pending.data.items.map(entry=><div key={entry.id} className="ledger-pending-row"><div><button className="font-semibold text-vm-green" onClick={()=>setParams({customer_id:entry.customer_id})}>{entry.customer_name}</button><small>{entry.customer_mobile} · {entry.transaction_id}</small></div><strong>{ledgerMoney(entry.amount_paise)}</strong><div className="flex gap-2"><PaymentReview entry={entry} action="confirm"/><PaymentReview entry={entry} action="reject"/></div></div>)}{pending.data.total>50&&<p className="text-sm text-slate-500">Showing the latest 50 reports. Select a customer to review their full statement.</p>}</section>}
    <label className="ledger-field max-w-lg">Find customer<Input placeholder="Search customer name, company or mobile" value={q} onChange={e=>setQ(e.target.value)} data-testid="ledger-customer-search"/></label>
    {customers.isError?<p role="alert">Could not load customers. <Button variant="outline" onClick={()=>customers.refetch()}>Retry</Button></p>:<div className="ledger-customer-results">{customers.data?.items.map(c=><button key={c.id} aria-pressed={selected===c.id} onClick={()=>setParams({customer_id:c.id})} data-testid={`ledger-customer-${c.id}`}>{c.name}<small>{c.mobile} {c.company_name&&"· "+c.company_name}</small></button>)}{customers.data?.items.length===0&&<p className="text-sm text-slate-500">No matching customers.</p>}</div>}
    {selected?<LedgerView key={selected} customerId={selected} admin/>:<div className="ledger-empty"><h2 className="font-heading text-xl font-bold mb-2">Select a customer</h2><p>View their transactions, set an opening balance or record a payment.</p></div>}
  </div>;
}
