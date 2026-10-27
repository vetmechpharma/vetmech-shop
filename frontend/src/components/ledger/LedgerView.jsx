import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { ledgerMoney, ledgerDate, ledgerDateToday, balanceLabel, PAYMENT_MODES } from "@/lib/ledger.mjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, ArrowDownLeft, ArrowUpRight, RefreshCw, Wallet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import "./ledger.css";

export function useLedgerRefresh() {
  const qc = useQueryClient();
  return () => { for (const key of ["admin-ledger", "my-ledger", "admin-pending-payments", "admin-orders", "admin-order", "admin-dashboard", "my-orders"]) qc.invalidateQueries({ queryKey: [key] }); };
}

export function PaymentReview({ entry, action, onDone }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  const refresh = useLedgerRefresh();
  const label = action === "confirm" ? "Confirm" : action === "reject" ? "Reject" : "Void";
  return <><Button size="sm" variant="outline" onClick={()=>setOpen(true)} data-testid={`${action}-${entry.id}`}>{label}</Button>
    <Dialog open={open} onOpenChange={v=>!busy && setOpen(v)}><DialogContent><DialogHeader><DialogTitle>{label} payment</DialogTitle><DialogDescription>Verify the customer, amount and transaction reference before saving.</DialogDescription></DialogHeader>
      <p className="font-semibold">{entry.customer_name} · {ledgerMoney(entry.amount_paise)}</p><p className="text-sm text-slate-600 break-all">{PAYMENT_MODES.find(m=>m.value===entry.mode)?.label} · {entry.transaction_id} · {ledgerDate(entry.transaction_date)}</p>
      <p className="text-sm text-slate-600">{action === "confirm" ? "Confirm only after checking that this payment was received. It will reduce the customer's outstanding balance." : action === "void" ? "This reverses the payment credit and keeps the original entry in the ledger." : "This report will be marked rejected and will not affect the balance."}</p>
      <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await api.post(`/admin/payments/${entry.id}/${action}`,action==="confirm"?undefined:{reason});refresh();setOpen(false);onDone?.();toast.success(`Payment ${action === "confirm" ? "confirmed" : action === "reject" ? "rejected" : "voided"}`);}catch(err){toast.error(apiError(err));}finally{setBusy(false);}}}>
        {action!=="confirm" && <label className="ledger-field">Reason<Textarea value={reason} minLength={5} maxLength={500} required onChange={e=>setReason(e.target.value)} /></label>}
        <Button className="mt-4 w-full" type="submit" disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin"/>}{label} payment</Button>
      </form>
    </DialogContent></Dialog>
  </>;
}

function EntryDialog({ open, onClose, kind, customer, opening, admin }) {
  const [busy,setBusy] = useState(false), [form,setForm] = useState(()=>kind==="opening" ? {
    amount: opening ? (opening.amount_paise/100).toFixed(2) : "", direction: opening?.direction || "debit",
    as_of_date: opening?.transaction_date || ledgerDateToday(), expected_revision: opening?.revision || 0, notes:opening?.notes || "",reason:"",
  } : {amount:"",transaction_date:ledgerDateToday(),mode:"UPI",transaction_id:"",notes:""});
  const refresh=useLedgerRefresh();
  const set=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  const title=kind==="opening" ? opening ? "Correct opening balance" : "Set opening balance" : admin ? "Record payment" : "Report a payment";
  return <Dialog open={open} onOpenChange={v=>!v&&!busy&&onClose()}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{customer.name} · {customer.mobile}</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);try{if(kind==="opening")await api.put(`/admin/customers/${customer.id}/opening-balance`,form);else await api.post(admin?`/admin/customers/${customer.id}/payments`:"/ledger/payments",form);refresh();toast.success(kind==="opening"?"Opening balance saved":admin?"Payment recorded in customer ledger":"Payment reported for Admin confirmation");onClose();}catch(err){toast.error(apiError(err));}finally{setBusy(false);}}}>
      <label className="ledger-field">Amount (₹)<Input type="number" inputMode="decimal" min={kind==="opening"?"0":"0.01"} max="9999999999.99" step="0.01" required value={form.amount} onChange={e=>set("amount",e.target.value)} data-testid="ledger-amount" /></label>
      {kind==="opening" ? <>
        <label className="ledger-field">Balance type<select value={form.direction} onChange={e=>set("direction",e.target.value)}><option value="debit">Customer owes us (debit)</option><option value="credit">Customer advance (credit)</option></select></label>
        <label className="ledger-field">As of date<Input type="date" required max={ledgerDateToday()} value={form.as_of_date} onInput={e=>set("as_of_date",e.currentTarget.value)} onChange={e=>set("as_of_date",e.target.value)} /></label>
        <p className="text-sm text-slate-500">Enter the balance carried forward before the transactions recorded here. Do not include invoices already posted in this ledger.</p>
        {opening && <label className="ledger-field">Reason for correction<Textarea required minLength={5} maxLength={500} value={form.reason} onChange={e=>set("reason",e.target.value)} /></label>}
      </> : <>
        <div className="grid grid-cols-2 gap-4"><label className="ledger-field">Payment date<Input type="date" required max={ledgerDateToday()} value={form.transaction_date} onInput={e=>set("transaction_date",e.currentTarget.value)} onChange={e=>set("transaction_date",e.target.value)} data-testid="payment-date"/></label>
          <label className="ledger-field">Payment mode<select value={form.mode} onChange={e=>set("mode",e.target.value)} data-testid="payment-mode">{PAYMENT_MODES.map(mode=><option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label></div>
        <label className="ledger-field">Transaction ID / UTR<Input required minLength={3} maxLength={128} value={form.transaction_id} onChange={e=>set("transaction_id",e.target.value)} data-testid="payment-transaction-id" /></label>
        {!admin && <p className="ledger-hint">This reports a payment you have already made. Your balance changes after Admin confirms receipt.</p>}
      </>}
      <label className="ledger-field">Notes (optional)<Textarea maxLength={500} value={form.notes} onChange={e=>set("notes",e.target.value)} /></label>
      <Button type="submit" className="w-full" disabled={busy} data-testid="save-ledger-entry">{busy&&<Loader2 className="w-4 h-4 mr-2 animate-spin"/>}{title}</Button>
    </form>
  </DialogContent></Dialog>;
}

export default function LedgerView({customerId,admin=false}) {
  const [page,setPage]=useState(1), [dialog,setDialog]=useState(null);
  const {data,isPending,isError,refetch,isFetching}=useQuery({queryKey:[admin?"admin-ledger":"my-ledger",customerId,page],queryFn:async()=>(await api.get(admin?`/admin/customers/${customerId}/ledger`:"/ledger/mine",{params:{page,limit:25}})).data,enabled:!!customerId,refetchInterval:30000});
  if(isPending)return <p className="py-12 text-slate-500" role="status">Loading transactions…</p>;
  if(isError)return <div role="alert" className="ledger-empty">Could not load the ledger.<Button variant="outline" onClick={()=>refetch()}>Try again</Button></div>;
  const {customer,summary}=data, readOnly=admin&&customer.status==="deleted";
  return <div className="ledger-view" data-testid="customer-ledger">
    <div className="ledger-toolbar"><div><p className="ledger-eyebrow">CUSTOMER STATEMENT</p><h2>{admin?customer.name:"My ledger"}</h2><p className="text-slate-500">{admin?`${customer.mobile}${customer.company_name?" · "+customer.company_name:""}`:"Invoices, payments and your current balance."}</p></div><div className="flex flex-wrap gap-2">
      <Button variant="outline" aria-label="Refresh ledger" onClick={()=>refetch()} disabled={isFetching}><RefreshCw className={`w-4 h-4 ${isFetching?"animate-spin":""}`}/></Button>
      {admin&&!readOnly&&<Button variant="outline" onClick={()=>setDialog("opening")} data-testid="set-opening-balance">{data.opening?"Correct opening balance":"Set opening balance"}</Button>}
      {!readOnly&&<Button onClick={()=>setDialog("payment")} data-testid="record-payment"><Plus className="w-4 h-4 mr-1"/>{admin?"Record payment":"Report a payment"}</Button>}
    </div></div>
    <div className="ledger-summary"><div className="ledger-balance"><Wallet size={24}/><span>{balanceLabel(summary.balance_paise)}</span><strong data-testid="ledger-balance">{ledgerMoney(Math.abs(summary.balance_paise))}</strong><small>{summary.balance_paise>0?"Amount payable to VETMECH":summary.balance_paise<0?"Credit available with VETMECH":"Your recorded transactions are balanced"}</small></div>
      <div><ArrowUpRight size={22}/><span>Total debits</span><strong>{ledgerMoney(summary.debit_paise)}</strong><small>Opening debit + posted invoices</small></div><div><ArrowDownLeft size={22}/><span>Total credits</span><strong>{ledgerMoney(summary.credit_paise)}</strong><small>Opening credit + confirmed payments</small></div></div>
    {summary.pending_payments>0&&<p className="ledger-hint">{summary.pending_payments} payment report(s) awaiting Admin confirmation. These are not included in the balance.</p>}
    {readOnly&&<p className="ledger-hint">This customer is deleted. Their transaction history is retained.</p>}
    <div className="ledger-table-wrap"><table className="ledger-table"><thead><tr><th>Date</th><th>Transaction / Reference</th><th>Status</th><th className="text-right">Debit (₹)</th><th className="text-right">Credit (₹)</th><th className="text-right">Balance</th>{admin&&<th>Action</th>}</tr></thead><tbody>
      {data.items.length?data.items.map(entry=><tr key={entry.id} data-testid={`ledger-row-${entry.id}`}><td className="whitespace-nowrap">{ledgerDate(entry.transaction_date)}</td><td><strong>{entry.entry_type==="opening"?"Opening balance":entry.entry_type==="invoice"?`Invoice ${entry.invoice_number}`:PAYMENT_MODES.find(m=>m.value===entry.mode)?.label+" payment"}</strong><small>{entry.order_number||entry.transaction_id||"Balance carried forward"}</small>{entry.notes&&<small>{entry.notes}</small>}{entry.reason&&<small>{entry.reason}</small>}{["voided","rejected","pending"].includes(entry.status)&&<small>{ledgerMoney(entry.amount_paise)} · {entry.status==="pending"?"awaiting confirmation":"excluded from balance"}</small>}</td><td><span className={`ledger-status is-${entry.status}`}>{entry.status==="posted"?"Posted":entry.status==="confirmed"?"Confirmed":entry.status==="pending"?"Pending":entry.status==="voided"?"Voided":"Rejected"}</span></td><td className="ledger-number">{entry.debit_paise?ledgerMoney(entry.debit_paise):"—"}</td><td className="ledger-number">{entry.credit_paise?ledgerMoney(entry.credit_paise):"—"}</td><td className="ledger-number">{ledgerMoney(Math.abs(entry.balance_paise))}<small>{balanceLabel(entry.balance_paise)}</small></td>{admin&&<td><div className="flex gap-1">{!readOnly&&entry.entry_type==="payment"&&(entry.status==="pending"?<><PaymentReview entry={entry} action="confirm"/><PaymentReview entry={entry} action="reject"/></>:entry.status==="confirmed"?<PaymentReview entry={entry} action="void"/>:null)}</div></td>}</tr>):<tr><td colSpan={admin?7:6} className="ledger-empty">No transactions yet. {admin?"Set an opening balance or record a payment to begin.":"Your invoices and confirmed payments will appear here."}</td></tr>}
    </tbody></table></div>
    <div className="ledger-pagination"><span>{data.total} transaction(s) · newest first</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1||isFetching} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>{page} / {Math.max(1,data.pages)}</span><Button size="sm" variant="outline" disabled={page>=data.pages||isFetching} onClick={()=>setPage(p=>p+1)}>Next</Button></div></div>
    <p className="text-sm text-slate-500">Debit increases the amount payable. Credit reduces it. Each row shows the running balance on that transaction date.</p>
    {dialog&&<EntryDialog key={`${customerId}-${dialog}`} open kind={dialog} customer={customer} opening={data.opening} admin={admin} onClose={()=>setDialog(null)}/>}
  </div>;
}
