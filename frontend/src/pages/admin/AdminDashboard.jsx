import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { ShoppingBag, Clock, CheckCircle2, Truck, PackageCheck, XCircle, IndianRupee, Users, TrendingUp } from "lucide-react";

const CARDS = [
  { key: "today_orders", label: "Today's Orders", icon: ShoppingBag, color: "text-blue-600 bg-blue-50", root: true },
  { key: "new", label: "Pending (New)", icon: Clock, color: "text-amber-600 bg-amber-50" },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle2, color: "text-indigo-600 bg-indigo-50" },
  { key: "processing", label: "Processing", icon: Clock, color: "text-orange-600 bg-orange-50" },
  { key: "ready_to_dispatch", label: "Ready to Dispatch", icon: PackageCheck, color: "text-purple-600 bg-purple-50" },
  { key: "dispatched", label: "Dispatched", icon: Truck, color: "text-cyan-600 bg-cyan-50" },
  { key: "delivered", label: "Delivered", icon: PackageCheck, color: "text-green-600 bg-green-50" },
  { key: "cancelled", label: "Cancelled", icon: XCircle, color: "text-red-600 bg-red-50" },
];

const PIE_COLORS = ["#045D3A", "#0FA45F", "#3B82F6", "#F59E0B", "#8B5CF6"];

export default function AdminDashboard() {
  const { data: d } = useQuery({ queryKey: ["admin-dashboard"], queryFn: async () => (await api.get("/admin/dashboard")).data });
  if (!d) return <div className="text-slate-400">Loading dashboard...</div>;

  const stat = (c) => c.root ? d[c.key] : (d.status_counts?.[c.key] ?? 0);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-vm-ink mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="bg-white border border-[#E2E8F0] rounded-lg p-4" data-testid={`stat-${c.key}`}>
              <div className={`w-9 h-9 rounded-md grid place-items-center ${c.color}`}><Icon className="w-5 h-5" /></div>
              <p className="text-2xl font-heading font-bold text-vm-ink mt-3">{stat(c)}</p>
              <p className="text-xs text-slate-500">{c.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <MiniStat icon={IndianRupee} label="Sales Value (internal)" value={`₹${(d.sales_value || 0).toLocaleString("en-IN")}`} />
        <MiniStat icon={ShoppingBag} label="Total Orders" value={d.total_orders} />
        <MiniStat icon={Users} label="Customers" value={`${d.total_customers} (${d.repeat_customers} repeat)`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <Panel title="Orders — Last 7 Days">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={d.trend}>
              <XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip />
              <Line type="monotone" dataKey="orders" stroke="#0FA45F" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Top Products">
          {d.top_products?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.top_products} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} /><Tooltip />
                <Bar dataKey="qty" fill="#045D3A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Panel>
        <Panel title="Category Performance">
          {d.category_performance?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={d.category_performance} dataKey="qty" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={{ fontSize: 11 }}>
                  {d.category_performance.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Panel>
        <Panel title="Top Customers">
          <div className="space-y-2">
            {d.top_customers?.length ? d.top_customers.map((c, i) => (
              <div key={i} className="flex justify-between text-sm border-b border-slate-50 pb-2">
                <span className="text-slate-600">{c.name}</span><span className="font-medium text-vm-ink">{c.orders} orders</span>
              </div>
            )) : <Empty />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const MiniStat = ({ icon: Icon, label, value }) => (
  <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 flex items-center gap-3">
    <div className="w-10 h-10 rounded-md bg-vm-bg grid place-items-center text-vm-green"><Icon className="w-5 h-5" /></div>
    <div><p className="text-lg font-heading font-bold text-vm-ink">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
  </div>
);
const Panel = ({ title, children }) => (
  <div className="bg-white border border-[#E2E8F0] rounded-lg p-5"><h3 className="font-heading font-bold text-vm-ink mb-4">{title}</h3>{children}</div>
);
const Empty = () => <p className="text-sm text-slate-400 text-center py-10">No data yet.</p>;
