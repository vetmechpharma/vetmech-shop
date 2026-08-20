import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Eye, Copy, Trash2, Loader2, FileText } from "lucide-react";
import { QUOTE_STATUSES, statusMeta, inr } from "./quotationConstants";

export default function QuotationList() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [status, setStatus] = useState(sp.get("status") || "all");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["qtn-list", status, q],
    queryFn: async () => (await api.get("/admin/quotations", { params: { status: status === "all" ? undefined : status, q: q || undefined, limit: 100 } })).data,
  });

  const dup = useMutation({
    mutationFn: async (id) => (await api.post(`/admin/quotations/${id}/duplicate`)).data,
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["qtn-list"] }); toast.success("Duplicated"); nav(`/admin/quotations/${r.id}/edit`); },
    onError: (e) => toast.error(apiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/admin/quotations/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qtn-list"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(apiError(e)),
  });

  const items = data?.items || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">All Quotations</h1><p className="text-slate-500 text-sm">{data?.total || 0} quotations</p></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => nav("/admin/quotations/new")} data-testid="qtn-new-btn"><Plus className="w-4 h-4 mr-2" /> New Quotation</Button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <Input placeholder="Search number / customer / phone..." value={q} onChange={(e) => setQ(e.target.value)} className="w-72" data-testid="qtn-search" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" data-testid="qtn-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {QUOTE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Number</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead>Valid Until</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : items.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-14 text-slate-400"><FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />No quotations found</TableCell></TableRow>
                : items.map((qt) => {
                  const sm = statusMeta(qt.status);
                  return (
                    <TableRow key={qt.id} data-testid={`qtn-row-${qt.id}`} className="cursor-pointer" onClick={() => nav(`/admin/quotations/${qt.id}`)}>
                      <TableCell className="font-medium text-vm-green">{qt.number}</TableCell>
                      <TableCell className="text-sm"><div className="font-medium text-vm-ink">{qt.customer?.company_name || "—"}</div><div className="text-xs text-slate-500">{qt.customer?.contact_name}</div></TableCell>
                      <TableCell className="text-sm">{qt.quote_date}</TableCell>
                      <TableCell className="text-sm">{qt.valid_until}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{inr(qt.summary?.grand_total)}</TableCell>
                      <TableCell><span className={`text-xs px-2 py-0.5 rounded ${sm.cls}`}>{sm.label}</span></TableCell>
                      <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => nav(`/admin/quotations/${qt.id}`)} data-testid={`qtn-view-${qt.id}`}><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => dup.mutate(qt.id)} data-testid={`qtn-dup-${qt.id}`}><Copy className="w-4 h-4" /></Button>
                        <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-red-500" data-testid={`qtn-del-${qt.id}`}><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {qt.number}?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600" onClick={() => del.mutate(qt.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
