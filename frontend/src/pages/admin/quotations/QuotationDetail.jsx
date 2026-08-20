import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, API_BASE, apiError, mediaUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Download, Send, Pencil, ArrowRightLeft, ChevronLeft, Clock } from "lucide-react";
import { QUOTE_STATUSES, statusMeta, inr } from "./quotationConstants";

export default function QuotationDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: q, isLoading } = useQuery({ queryKey: ["qtn", id], queryFn: async () => (await api.get(`/admin/quotations/${id}`)).data });

  const refresh = () => qc.invalidateQueries({ queryKey: ["qtn", id] });

  const setStatus = useMutation({ mutationFn: async (status) => (await api.patch(`/admin/quotations/${id}/status`, { status })).data, onSuccess: () => { refresh(); toast.success("Status updated"); }, onError: (e) => toast.error(apiError(e)) });
  const send = useMutation({ mutationFn: async (channel) => (await api.post(`/admin/quotations/${id}/send`, { channel })).data, onSuccess: (r) => { refresh(); toast.success(`Sent via ${r.channel} (simulated)`); }, onError: (e) => toast.error(apiError(e)) });
  const convert = useMutation({ mutationFn: async () => (await api.post(`/admin/quotations/${id}/convert`)).data, onSuccess: (r) => { refresh(); toast.success(`Order ${r.order_number} created`); }, onError: (e) => toast.error(apiError(e)) });

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/admin/quotations/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch (e) { toast.error("Failed to generate PDF"); }
  };

  if (isLoading) return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>;
  if (!q) return <div className="py-20 text-center text-slate-400">Not found</div>;
  const sm = statusMeta(q.status);
  const cust = q.customer || {};
  const s = q.summary || {};

  return (
    <div className="max-w-5xl">
      <button onClick={() => nav("/admin/quotations/list")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-vm-green mb-4"><ChevronLeft className="w-4 h-4" /> Back to list</button>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3"><h1 className="font-heading text-2xl font-bold text-vm-green">{q.number}</h1><span className={`text-xs px-2 py-0.5 rounded ${sm.cls}`}>{sm.label}</span></div>
          <p className="text-slate-500 text-sm mt-1">Date {q.quote_date} · Valid until {q.valid_until}{q.converted_order && <> · Order <b>{q.converted_order}</b></>}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={q.status} onValueChange={(v) => setStatus.mutate(v)}>
            <SelectTrigger className="w-36" data-testid="qtn-status-select"><SelectValue /></SelectTrigger>
            <SelectContent>{QUOTE_STATUSES.map((st) => <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => nav(`/admin/quotations/${id}/edit`)} data-testid="qtn-edit-btn"><Pencil className="w-4 h-4 mr-2" /> Edit</Button>
          <Button variant="outline" onClick={downloadPdf} data-testid="qtn-pdf-btn"><Download className="w-4 h-4 mr-2" /> PDF</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" data-testid="qtn-send-btn"><Send className="w-4 h-4 mr-2" /> Send</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => send.mutate("email")} data-testid="qtn-send-email">Via Email</DropdownMenuItem>
              <DropdownMenuItem onClick={() => send.mutate("whatsapp")} data-testid="qtn-send-whatsapp">Via WhatsApp</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => convert.mutate()} disabled={convert.isPending || !!q.converted_order} data-testid="qtn-convert-btn"><ArrowRightLeft className="w-4 h-4 mr-2" /> {q.converted_order ? "Converted" : "Convert to Order"}</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Quotation To</p>
          <p className="font-semibold text-vm-ink">{cust.company_name}</p>
          <p className="text-sm text-slate-600">{cust.contact_name}</p>
          <p className="text-sm text-slate-500">{cust.phone} · {cust.email}</p>
          <p className="text-sm text-slate-500">{cust.address}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">From</p>
          <p className="font-semibold text-vm-ink">{q.company_snapshot?.name}</p>
          <p className="text-sm text-slate-500">{q.company_snapshot?.address}</p>
          <p className="text-sm text-slate-500">GST: {q.company_snapshot?.gst_number}</p>
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-x-auto mb-5">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>#</TableHead><TableHead>Product</TableHead><TableHead>Pack</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Disc</TableHead><TableHead className="text-right">GST%</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.items || []).map((it, i) => (
              <TableRow key={i}>
                <TableCell className="text-sm">{i + 1}</TableCell>
                <TableCell className="text-sm font-medium text-vm-ink">{it.name}{!it.product_id && <span className="text-xs text-vm-accent ml-1">(manual)</span>}</TableCell>
                <TableCell className="text-sm">{it.packing} {it.unit}</TableCell>
                <TableCell className="text-right text-sm">{it.qty}</TableCell>
                <TableCell className="text-right text-sm">{inr(it.rate)}</TableCell>
                <TableCell className="text-right text-sm">{inr(it.discount_amount)}</TableCell>
                <TableCell className="text-right text-sm">{it.gst}</TableCell>
                <TableCell className="text-right text-sm font-medium">{inr(it.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <h3 className="font-heading font-semibold text-vm-ink mb-2">Terms & Conditions</h3>
          {(q.terms || []).length === 0 ? <p className="text-sm text-slate-400">None</p> : <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">{q.terms.map((t, i) => <li key={i}>{t}</li>)}</ul>}
          {q.notes && <div className="mt-3 pt-3 border-t"><p className="text-xs text-slate-400 mb-1">Notes</p><p className="text-sm text-slate-600">{q.notes}</p></div>}
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-slate-400 mb-1">Authorized Signatory</p>
            {q.signatory?.signature && <img src={mediaUrl(q.signatory.signature)} alt="signature" className="h-12 object-contain mb-1" />}
            <p className="text-sm font-medium text-vm-ink">{q.signatory?.name}</p>
            <p className="text-xs text-slate-500">{q.signatory?.designation}</p>
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{inr(s.total)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>- {inr(s.discount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{inr(s.gst)}</span></div>
            <div className="flex justify-between font-bold text-vm-ink border-t pt-2 mt-1"><span>Grand Total</span><span className="text-vm-green text-lg">{inr(s.grand_total)}</span></div>
            <p className="text-xs text-slate-400 pt-1">{s.amount_words}</p>
          </div>
          <div className="mt-4 pt-3 border-t">
            <h4 className="text-xs uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1"><Clock className="w-3 h-3" /> History</h4>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {(q.history || []).slice().reverse().map((h, i) => (
                <div key={i} className="text-xs text-slate-500"><span className="text-vm-ink">{h.action}</span> · {h.user} · {new Date(h.at).toLocaleString()}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
