import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Eye } from "lucide-react";
import { CUSTOMER_CATEGORIES, statusMeta } from "@/lib/constants";
import { exportRows } from "@/lib/exportUtils";

export default function AdminCustomers() {
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers", category, q],
    queryFn: async () => (await api.get("/admin/customers", { params: { category: category !== "all" ? category : undefined, q: q || undefined, limit: 100 } })).data,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="font-heading text-2xl font-bold text-vm-ink">Customers</h1><p className="text-slate-500 text-sm">All registered customers</p></div>
        <Button variant="outline" size="sm" onClick={() => exportRows((data?.items || []).map((c) => ({ Name: c.name, Company: c.company_name, Mobile: c.mobile, Category: c.category, Orders: c.order_count })), "vetmech-customers", "csv")}>Export CSV</Button>
      </div>
      <div className="flex gap-2 mb-4">
        <Input placeholder="Search name, mobile, company..." value={q} onChange={(e) => setQ(e.target.value)} className="w-64" data-testid="customer-search" />
        <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-48" data-testid="customer-category-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Categories</SelectItem>{CUSTOMER_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <Table>
          <TableHeader><TableRow className="bg-vm-bg"><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Mobile</TableHead><TableHead>Category</TableHead><TableHead className="text-center">Orders</TableHead><TableHead className="text-right">View</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
              : (data?.items || []).length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-slate-400">No customers yet.</TableCell></TableRow>
              : data.items.map((c) => (
                <TableRow key={c.id} data-testid={`customer-row-${c.id}`}>
                  <TableCell className="font-medium text-vm-ink">{c.prefix} {c.name}</TableCell>
                  <TableCell className="text-sm">{c.company_name || "—"}</TableCell>
                  <TableCell className="text-sm">{c.mobile}</TableCell>
                  <TableCell className="text-sm">{CUSTOMER_CATEGORIES.find((x) => x.value === c.category)?.label}</TableCell>
                  <TableCell className="text-center">{c.order_count}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setDetailId(c.id)} data-testid={`view-customer-${c.id}`}><Eye className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto"><CustomerDetail id={detailId} /></SheetContent>
      </Sheet>
    </div>
  );
}

function CustomerDetail({ id }) {
  const { data: c } = useQuery({ queryKey: ["admin-customer", id], queryFn: async () => (await api.get(`/admin/customers/${id}`)).data, enabled: !!id });
  if (!c) return <div className="py-20 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  return (
    <>
      <SheetHeader><SheetTitle className="font-heading">{c.prefix} {c.name}</SheetTitle></SheetHeader>
      <div className="mt-4 space-y-4 text-sm">
        <div className="bg-vm-bg rounded-lg p-3">
          <p>{c.company_name}</p><p className="text-slate-500">{c.mobile} · {CUSTOMER_CATEGORIES.find((x) => x.value === c.category)?.label}</p>
          <p className="text-slate-500 mt-1">{c.default_address?.line1}, {c.default_address?.district}, {c.default_address?.state} - {c.default_address?.pincode}</p>
        </div>
        {c.frequent_products?.length > 0 && (
          <div><p className="font-medium text-vm-ink mb-1">Frequently Ordered</p>{c.frequent_products.map((p, i) => <div key={i} className="flex justify-between text-slate-600 border-b border-slate-50 py-1"><span>{p.name}</span><span>{p.qty}</span></div>)}</div>
        )}
        <div>
          <p className="font-medium text-vm-ink mb-1">Order History ({c.orders?.length || 0})</p>
          {(c.orders || []).map((o) => (
            <div key={o.id} className="flex justify-between items-center border border-[#E2E8F0] rounded p-2 mb-2">
              <div><span className="font-medium text-vm-green">{o.order_number}</span><br /><span className="text-xs text-slate-400">{new Date(o.created_at).toLocaleDateString()} · {o.total_qty} qty</span></div>
              <span className={`text-xs px-2 py-0.5 rounded ${statusMeta(o.status).color}`}>{statusMeta(o.status).label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
