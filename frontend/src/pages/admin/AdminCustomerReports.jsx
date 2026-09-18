import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CUSTOMER_CATEGORIES } from "@/lib/constants";
import { Loader2, Download, Search, ArrowUpDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const rupee = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const catLabel = (v) => CUSTOMER_CATEGORIES.find((c) => c.value === v)?.label || v || "—";

function exportCsv(name, columns, rows) {
  const head = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((r) => columns.map((c) => `"${String(c.value(r) ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`${head}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
}

function KPI({ label, value, testid }) {
  return (
    <div className="border border-[#E2E8F0] rounded-lg p-4 bg-white" data-testid={testid}>
      <p className="text-xl font-bold text-vm-ink">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function ReportTable({ name, columns, rows, onRow }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [page, setPage] = useState(1);
  const per = 15;
  const filtered = useMemo(() => {
    let d = rows || [];
    if (q) { const s = q.toLowerCase(); d = d.filter((r) => columns.some((c) => String(c.value(r) ?? "").toLowerCase().includes(s))); }
    if (sort.key) { const c = columns.find((x) => x.key === sort.key); d = [...d].sort((a, b) => { const av = c.raw ? c.raw(a) : c.value(a), bv = c.raw ? c.raw(b) : c.value(b); return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir; }); }
    return d;
  }, [rows, q, sort, columns]);
  const pages = Math.max(1, Math.ceil(filtered.length / per));
  const view = filtered.slice((page - 1) * per, page * per);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="relative"><Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search..." className="pl-8 h-9 w-56" data-testid={`search-${name}`} /></div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>{filtered.length} records</span>
          <Button size="sm" variant="outline" onClick={() => exportCsv(name, columns, filtered)} data-testid={`export-${name}`}><Download className="w-4 h-4 mr-1" /> Excel/CSV</Button>
        </div>
      </div>
      <div className="border border-[#E2E8F0] rounded-lg overflow-x-auto bg-white">
        <table className="w-full text-sm">
          <thead><tr className="bg-vm-bg text-left">{columns.map((c) => (
            <th key={c.key} className="px-3 py-2 font-semibold text-vm-ink whitespace-nowrap cursor-pointer" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))}>
              <span className="inline-flex items-center gap-1">{c.label}<ArrowUpDown className="w-3 h-3 text-slate-300" /></span>
            </th>))}</tr></thead>
          <tbody>
            {view.length === 0 ? <tr><td colSpan={columns.length} className="text-center py-8 text-slate-400">No records.</td></tr> :
              view.map((r, i) => (
                <tr key={i} className={`border-t border-[#E2E8F0] ${onRow ? "hover:bg-vm-bg/50 cursor-pointer" : ""}`} onClick={() => onRow && onRow(r)} data-testid={`row-${name}-${i}`}>
                  {columns.map((c) => <td key={c.key} className="px-3 py-2 whitespace-nowrap">{c.value(r)}</td>)}
                </tr>))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span>{page} / {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

export default function AdminCustomerReports() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ date_from: "", date_to: "", customer_type: "all", days: 90 });
  const [applied, setApplied] = useState({ date_from: "", date_to: "", customer_type: "all", days: 90 });
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["customer-reports", applied],
    queryFn: async () => (await api.get("/admin/reports/customers", { params: {
      date_from: applied.date_from || undefined, date_to: applied.date_to || undefined,
      customer_type: applied.customer_type === "all" ? undefined : applied.customer_type, days: applied.days || 90,
    } })).data,
  });
  const drill = (r) => r.mobile && navigate(`/admin/orders?q=${encodeURIComponent(r.mobile)}`);

  if (isLoading) return <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>;
  const s = data?.summary || {};
  const nameCol = { key: "name", label: "Customer", value: (r) => <span className="font-medium text-vm-green">{r.name || "—"}</span>, raw: (r) => r.name || "" };
  const typeCol = { key: "category", label: "Type", value: (r) => catLabel(r.category) };
  const mobileCol = { key: "mobile", label: "Mobile", value: (r) => r.mobile || "—" };
  const ordersCol = { key: "orders", label: "Orders", value: (r) => r.orders ?? 0, raw: (r) => r.orders ?? 0 };
  const revCol = { key: "revenue", label: "Revenue", value: (r) => rupee(r.revenue), raw: (r) => r.revenue ?? 0 };
  const aovCol = { key: "aov", label: "AOV", value: (r) => rupee(r.aov), raw: (r) => r.aov ?? 0 };
  const freqCol = { key: "frequency_per_month", label: "Orders/mo", value: (r) => r.frequency_per_month ?? 0, raw: (r) => r.frequency_per_month ?? 0 };
  const recCol = { key: "recency_days", label: "Recency (days)", value: (r) => r.recency_days ?? "—", raw: (r) => r.recency_days ?? 999999 };
  const custCols = [nameCol, typeCol, mobileCol, ordersCol, revCol, aovCol, freqCol, recCol];
  const geoCols = [{ key: "name", label: "Location", value: (r) => r.name }, { key: "customers", label: "Customers", value: (r) => r.customers, raw: (r) => r.customers }, { key: "orders", label: "Orders", value: (r) => r.orders, raw: (r) => r.orders }, { key: "revenue", label: "Revenue", value: (r) => rupee(r.revenue), raw: (r) => r.revenue }];

  return (
    <div data-testid="customer-reports-page">
      <h1 className="font-heading text-2xl font-bold text-vm-ink mb-1">Customer Reports</h1>
      <p className="text-slate-500 text-sm mb-5">Sales performance, retention, recency and geography — from your existing orders.</p>

      <div className="border border-[#E2E8F0] rounded-lg p-4 bg-white mb-5 grid sm:grid-cols-5 gap-3 items-end">
        <div><Label className="text-xs">From</Label><Input type="date" value={filters.date_from} onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} data-testid="rep-from" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={filters.date_to} onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} data-testid="rep-to" /></div>
        <div><Label className="text-xs">Customer Type</Label>
          <Select value={filters.customer_type} onValueChange={(v) => setFilters((f) => ({ ...f, customer_type: v }))}>
            <SelectTrigger data-testid="rep-type"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All types</SelectItem>{CUSTOMER_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">No orders in last N days</Label><Input type="number" value={filters.days} onChange={(e) => setFilters((f) => ({ ...f, days: Number(e.target.value) || 0 }))} data-testid="rep-days" /></div>
        <Button className="bg-vm-green hover:bg-vm-greenhover" onClick={() => setApplied(filters)} data-testid="rep-apply">{isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Apply</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        <KPI label="Customers" value={s.total_customers} testid="kpi-customers" />
        <KPI label="Active" value={s.active_customers} testid="kpi-active" />
        <KPI label="Total Orders" value={s.total_orders} testid="kpi-orders" />
        <KPI label="Total Revenue" value={rupee(s.total_revenue)} testid="kpi-revenue" />
        <KPI label="Avg Order Value" value={rupee(s.aov)} testid="kpi-aov" />
        <KPI label="Est. CLV" value={rupee(s.clv)} testid="kpi-clv" />
        <KPI label="Repeat" value={s.repeat_customers} />
        <KPI label="First-time" value={s.first_time_customers} />
        <KPI label="Avg Freq (orders/cust)" value={s.avg_frequency} />
        <KPI label={`No orders ${s.no_orders_days}d`} value={s.no_orders_count} testid="kpi-norecent" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All Customers</TabsTrigger>
          <TabsTrigger value="top" data-testid="tab-top">Top</TabsTrigger>
          <TabsTrigger value="repeat">Repeat</TabsTrigger>
          <TabsTrigger value="first">First-time</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="inactive">Inactive</TabsTrigger>
          <TabsTrigger value="norecent" data-testid="tab-norecent">No Orders (N days)</TabsTrigger>
          <TabsTrigger value="geo" data-testid="tab-geo">Geographic</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid lg:grid-cols-2 gap-4">
          <div className="border border-[#E2E8F0] rounded-lg p-4 bg-white">
            <p className="font-semibold text-vm-ink mb-3">Top Customers by Revenue</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={(data?.top_customers || []).map((r) => ({ name: (r.name || "").slice(0, 12), revenue: r.revenue }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => rupee(v)} /><Bar dataKey="revenue" fill="#0B6E4F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="border border-[#E2E8F0] rounded-lg p-4 bg-white">
            <p className="font-semibold text-vm-ink mb-3">Revenue by State</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={(data?.geo_state || []).slice(0, 8).map((r) => ({ name: r.name, revenue: r.revenue }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => rupee(v)} /><Bar dataKey="revenue" fill="#E9772B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="all" className="mt-4"><ReportTable name="all-customers" columns={custCols} rows={data?.customers} onRow={drill} /></TabsContent>
        <TabsContent value="top" className="mt-4"><ReportTable name="top-customers" columns={custCols} rows={data?.top_customers} onRow={drill} /></TabsContent>
        <TabsContent value="repeat" className="mt-4"><ReportTable name="repeat-customers" columns={custCols} rows={data?.repeat_customers} onRow={drill} /></TabsContent>
        <TabsContent value="first" className="mt-4"><ReportTable name="first-time-customers" columns={custCols} rows={data?.first_time_customers} onRow={drill} /></TabsContent>
        <TabsContent value="active" className="mt-4"><ReportTable name="active-customers" columns={[nameCol, typeCol, mobileCol, ordersCol, revCol, recCol]} rows={data?.active_customers} onRow={drill} /></TabsContent>
        <TabsContent value="inactive" className="mt-4"><ReportTable name="inactive-customers" columns={[nameCol, typeCol, mobileCol, ordersCol, revCol, recCol]} rows={data?.inactive_customers} onRow={drill} /></TabsContent>
        <TabsContent value="norecent" className="mt-4">
          <p className="text-sm text-slate-500 mb-3">Customers with no orders in the last <b>{s.no_orders_days}</b> days (change N in the filter above and Apply).</p>
          <ReportTable name="no-orders-customers" columns={[nameCol, typeCol, mobileCol, ordersCol, revCol, { key: "last_order", label: "Last Order", value: (r) => r.last_order ? String(r.last_order).slice(0, 10) : "Never" }, recCol]} rows={data?.no_recent} onRow={drill} />
        </TabsContent>
        <TabsContent value="geo" className="mt-4 grid lg:grid-cols-3 gap-4">
          <div><p className="font-semibold text-vm-ink mb-2">State-wise</p><ReportTable name="geo-state" columns={geoCols} rows={data?.geo_state} /></div>
          <div><p className="font-semibold text-vm-ink mb-2">District-wise</p><ReportTable name="geo-district" columns={geoCols} rows={data?.geo_district} /></div>
          <div><p className="font-semibold text-vm-ink mb-2">Taluk-wise</p><ReportTable name="geo-taluk" columns={geoCols} rows={data?.geo_taluk} /></div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
