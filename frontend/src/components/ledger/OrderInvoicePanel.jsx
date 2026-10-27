import React,{useState} from "react";
import {Link} from "react-router-dom";
import {api,apiError} from "@/lib/api";
import {useAdminAuth} from "@/context/AdminAuthContext";
import {useLedgerRefresh} from "./LedgerView";
import {ledgerMoney,ledgerDate,ledgerDateToday} from "@/lib/ledger.mjs";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {toast} from "sonner";

export default function OrderInvoicePanel({order,onDone}){
  const {can}=useAdminAuth();const[open,setOpen]=useState(false),[voiding,setVoiding]=useState(false),[busy,setBusy]=useState(false),[reason,setReason]=useState("");
  const [form,setForm]=useState({invoice_number:order.dispatch?.invoice_number||"",invoice_date:order.dispatch?.invoice_date||ledgerDateToday(),amount:order.dispatch?.invoice_value?String(order.dispatch.invoice_value):""});
  const refresh=useLedgerRefresh();const invoice=order.invoice;
  const submit=async e=>{e.preventDefault();setBusy(true);try{await api.post(voiding?`/admin/orders/${order.id}/invoice/void`:`/admin/orders/${order.id}/close`,voiding?{reason}:{...form,expected_updated_at:order.updated_at||null});refresh();onDone?.();setOpen(false);toast.success(voiding?"Invoice voided; customer balance updated":"Order closed and invoice posted to customer ledger");}catch(err){toast.error(apiError(err));}finally{setBusy(false);}};
  return <section className="invoice-panel" data-testid="order-invoice-panel"><h3>Invoice & customer ledger</h3>
    {invoice?<><p>The posted invoice is included once in the customer ledger.</p><dl><div><dt>Invoice number</dt><dd>{invoice.invoice_number}</dd></div><div><dt>Invoice date</dt><dd>{ledgerDate(invoice.invoice_date)}</dd></div><div><dt>Invoiced amount</dt><dd>{ledgerMoney(invoice.amount_paise)}</dd></div><div><dt>Status</dt><dd>Closed / Invoiced</dd></div></dl><Button size="sm" variant="outline" onClick={()=>{setVoiding(true);setReason("");setOpen(true);}} data-testid="void-order-invoice">Void invoice</Button></>:<><p>Close this order with the final invoice number, date and billed amount to add a debit to the customer ledger.</p><Button className="mt-3" disabled={order.status==="cancelled"} onClick={()=>{setVoiding(false);setOpen(true);}} data-testid="close-order-invoice">Close order & post invoice</Button></>}
    {can("customers")&&<Link className="block mt-3 text-vm-green font-semibold text-sm" to={`/admin/ledger?customer_id=${encodeURIComponent(order.customer_id)}`}>View customer ledger →</Link>}
    <Dialog open={open} onOpenChange={v=>!busy&&setOpen(v)}><DialogContent><DialogHeader><DialogTitle>{voiding?"Void posted invoice":"Close order & post invoice"}</DialogTitle><DialogDescription>{order.order_number} · {order.customer_name}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={submit}>{voiding?<><p className="text-sm text-slate-600">The invoice debit will be reversed. Its history remains visible, and you can correct and close the order again.</p><label className="ledger-field">Reason<Textarea required minLength={5} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label></>:<><label className="ledger-field">Invoice number<Input required maxLength={80} value={form.invoice_number} onChange={e=>setForm({...form,invoice_number:e.target.value})} data-testid="close-invoice-number"/></label><label className="ledger-field">Invoice date<Input type="date" required max={ledgerDateToday()} value={form.invoice_date} onInput={e=>setForm({...form,invoice_date:e.currentTarget.value})} onChange={e=>setForm({...form,invoice_date:e.target.value})} data-testid="close-invoice-date"/></label><label className="ledger-field">Final invoice amount (₹)<Input type="number" inputMode="decimal" required min="0.01" max="9999999999.99" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} data-testid="close-invoice-amount"/></label><p className="text-sm text-slate-500">Enter the total on the issued invoice, including GST and any final adjustments. This amount will be added to the customer's balance.</p></>}
        <Button type="submit" disabled={busy} className="w-full" data-testid="save-order-invoice">{busy?"Saving…":voiding?"Void invoice":"Close order & post invoice"}</Button>
      </form>
    </DialogContent></Dialog>
  </section>;
}
