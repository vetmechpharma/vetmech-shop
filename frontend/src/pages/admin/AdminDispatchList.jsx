import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Truck, Download, Loader2, Search, X } from "lucide-react";

const FREIGHT = { to_pay: "To Pay", paid: "Paid" };

export default function AdminDispatchList() {
  const [f, setF] = useState({ transport: "all", freight: "all", date_from: "", date_to: "", q: "" });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const params = {
    transport: f.transport !== "all" ? f.transport : undefined,
    freight: f.freight !== "all" ? f.freight : undefined,
    date_from: f.date_from || undefined,
    date_to: f.date_to || undefined,
    q: f.q || undefined,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["dispatches", params],
    queryFn: async () => (await api.get("/admin/dispatches", { params })).data,
  });

  const rows = data?.items || [];
  const clearFilters = () => setF({ transport: "all", freight: "all", date_from: "", date_to: "", q: "" });

  const exportCsv = () => {
    if (!rows.length) return toast.error("No dispatches to export");
    const headers = ["Order No", "Customer", "Company", "Mobile", "City", "State", "Cases", "Qty", "Transport", "Freight", "LR / Tracking", "Dispatch Date", "By"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.join(",")];
    rows.forEach((r) => lines.push([
      r.order_number, r.customer_name, r.company_name, r.customer_mobile, r.city, r.state,
      r.cases, r.total_dispatch, r.transport, FREIGHT[r.freight] || r.freight, r.lr_number, r.dispatch_date, r.dispatched_by,
    ].map(esc).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispatch-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} dispatches`);
  };

  return (
    <div data-testid="dispatch-list-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-vm-green/10 grid place-items-center"><Truck className="w-5 h-5 text-vm-green" /></div>
          <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Dispatch Register</h1><p className="text-slate-500 text-sm">All dispatched orders with transport & freight details</p></div>
        </div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={exportCsv} data-testid="dispatch-export-csv"><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 mb-5 grid md:grid-cols-5 gap-3">
        <div className="md:col-span-1">
          <Label className="text-xs">Search</Label>
          <div className="relative"><Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Order / customer / LR" value={f.q} onChange={(e) => set("q", e.target.value)} className="pl-8" data-testid="dispatch-search" /></div>
        </div>
        <div>
          <Label className="text-xs">Transport</Label>
          <Select value={f.transport} onValueChange={(v) => set("transport", v)}><SelectTrigger data-testid="dispatch-filter-transport"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Transports</SelectItem>
              {(data?.transports || []).filter((t) => t !== "Customer Pickup").map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              <SelectItem value="Customer Pickup">Customer Pickup</SelectItem></SelectContent></Select>
        </div>
        <div>
          <Label className="text-xs">Freight</Label>
          <Select value={f.freight} onValueChange={(v) => set("freight", v)}><SelectTrigger data-testid="dispatch-filter-freight"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="to_pay">To Pay</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent></Select>
        </div>
        <div><Label className="text-xs">From Date</Label><Input type="date" value={f.date_from} onChange={(e) => set("date_from", e.target.value)} data-testid="dispatch-date-from" /></div>
        <div className="flex items-end gap-2">
          <div className="flex-1"><Label className="text-xs">To Date</Label><Input type="date" value={f.date_to} onChange={(e) => set("date_to", e.target.value)} data-testid="dispatch-date-to" /></div>
          <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters" data-testid="dispatch-clear"><X className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2 text-sm text-slate-500">
        <span data-testid="dispatch-count">{isFetching ? "Loading..." : `${rows.length} dispatch record${rows.length !== 1 ? "s" : ""}`}</span>
      </div>

      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg">
            <TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Destination</TableHead>
            <TableHead>Cases</TableHead><TableHead>Transport</TableHead><TableHead>Freight</TableHead>
            <TableHead>LR / Tracking</TableHead><TableHead>Date</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : rows.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-400">No dispatches match these filters.</TableCell></TableRow>
                : rows.map((r) => (
                  <TableRow key={r.id} data-testid={`dispatch-row-${r.order_number}`}>
                    <TableCell><span className="font-heading font-bold text-vm-green">{r.order_number}</span><br /><span className="text-xs text-slate-400">{r.total_dispatch} units</span></TableCell>
                    <TableCell><span className="font-medium text-vm-ink">{r.customer_name}</span><br /><span className="text-xs text-slate-400">{r.company_name || r.customer_mobile}</span></TableCell>
                    <TableCell className="text-sm">{r.city}{r.state ? `, ${r.state}` : ""}</TableCell>
                    <TableCell className="text-sm font-medium">{r.cases}</TableCell>
                    <TableCell className="text-sm">{r.transport}</TableCell>
                    <TableCell><span className={`text-xs font-semibold px-2 py-0.5 rounded ${r.freight === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{FREIGHT[r.freight] || r.freight}</span></TableCell>
                    <TableCell className="text-sm">{r.lr_number || "—"}</TableCell>
                    <TableCell className="text-sm">{r.dispatch_date}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
